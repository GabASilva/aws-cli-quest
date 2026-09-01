"use strict";
// ============================================================
// CLImb — ecr-completo.js
// A trilha do ECR tinha 5 atividades e parava no básico: criar o repositório,
// pegar a senha do docker, listar as tags e apagar. É a metade fácil — nenhuma
// delas é o trabalho que dá problema numa conta de verdade:
//
//   IMAGEM VELHA CUSTA — o ECR cobra por GB guardado por mês, e repositório de
//        esteira acumula versão que ninguém mais usa. Sem ciclo de vida a conta
//        só sobe. E ciclo de vida APAGA: por isso existe o preview.
//   VARREDURA — imagem é um sistema operacional inteiro empacotado, e ela
//        envelhece PARADA: a falha não estava lá no dia do build, apareceu
//        depois. Ligar o scanOnPush não varre o que já estava dentro.
//   TAG QUE SE MEXE — por padrão dá pra publicar por cima de uma tag existente.
//        Aí "a v2.0" não quer dizer nada, o que foi testado não é o que subiu,
//        e sobra uma imagem SEM TAG ocupando espaço (a órfã).
//
// FORMATO (decisão do Gabriel, 2026-09-01): ciclo por comando-âncora. Os
// comandos que carregam o serviço ganham ensina -> aplica de verdade -> marco
// do mini-projeto; os de leitura simples ganham uma atividade só. O repositório
// "pagamentos/checkout-api" nasce na 3ª atividade e atravessa a trilha inteira:
// cada marco acrescenta uma camada nele, e a órfã que ele traz é o fio que liga
// mutabilidade de tag, varredura por digest e ciclo de vida.
//
// SIMPLIFICAÇÃO ASSUMIDA (avisada na tela): na AWS real a imagem chega por
// docker push, que é comando do Docker e não existe na AWS CLI. Aqui todo
// repositório nasce com o histórico que uma esteira teria publicado — senão não
// haveria o que varrer, expirar nem limpar. Os CVEs são fictícios; o que é real
// é o formato da saída e a decisão que se toma com ela.
//
// Comandos conferidos na referência oficial (aws ecr).
// ADITIVO: complementa SERVICOS.ecr, MANUAIS, PORQUE, ARQUIVOS_LOCAIS e DESAFIOS.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.ecr) return;

  const CONTA = (c) => c.contaId || "123456789012";

  function st(conta) {
    conta.ecr = conta.ecr || { repositorios: {} };
    conta.ecr.repositorios = conta.ecr.repositorios || {};
    return conta.ecr;
  }
  function repoOu404(conta, nome, operacao) {
    const r = st(conta).repositorios[nome];
    if (!r) {
      throw new ErroCli(
        "An error occurred (RepositoryNotFoundException) when calling the " + operacao + " operation: " +
        "The repository with name '" + nome + "' does not exist in the registry with id '" + CONTA(conta) + "'"
      );
    }
    semear(nome, r);
    return r;
  }

  // ---------------- o histórico que a esteira teria publicado ----------------
  // dias = há quanto tempo foi publicada; bytes = tamanho da imagem.
  // O repositório do mini-projeto tem uma história DIFERENTE de propósito: ele
  // traz a imagem órfã (sem tag), que é o que amarra tag imutável, varredura
  // por digest e ciclo de vida mais adiante na trilha.
  const HISTORICO_PADRAO = [
    { tags: ["v1.0"], dias: 214, bytes: 431000000 },
    { tags: ["v1.1"], dias: 96, bytes: 437000000 },
    { tags: ["v1.2", "latest"], dias: 4, bytes: 191000000 },
  ];
  const HISTORICO_POR_REPO = {
    "pagamentos/checkout-api": [
      { tags: ["v2.0"], dias: 61, bytes: 388000000 },
      { tags: [], dias: 58, bytes: 385000000 },
      { tags: ["v2.1", "latest"], dias: 9, bytes: 402000000 },
    ],
  };

  function semear(nome, repo) {
    if (repo.detalhes) return repo;
    const base = HISTORICO_POR_REPO[nome] || HISTORICO_PADRAO;
    repo.detalhes = base.map((h) => ({
      digest: "sha256:" + hexAleatorio(64),
      tags: h.tags.slice(),
      bytes: h.bytes,
      push: new Date(Date.now() - h.dias * 86400000).toISOString(),
      dias: h.dias,
      escaneada: false,
    }));
    repo.imagens = repo.detalhes.reduce((acc, d) => acc.concat(d.tags), []);
    return repo;
  }

  // create-repository é do servicos-fase3.js; aqui só penduramos o histórico e
  // dizemos na cara que ele não veio de um docker push.
  const criarOriginal = SERVICOS.ecr["create-repository"];
  SERVICOS.ecr["create-repository"] = function (conta, pos, flags) {
    const saida = criarOriginal(conta, pos, flags);
    const nome = String(flags["repository-name"]);
    const repo = st(conta).repositorios[nome];
    if (repo) {
      semear(nome, repo);
      avisarClimb(
        "Repare que o repositório já nasceu com imagens dentro. Na AWS real ele nasceria VAZIO: imagem " +
        "entra por `docker push`, que é comando do Docker, não da AWS CLI. O CLImb já publica o histórico " +
        "que uma esteira teria deixado — sem ele não haveria o que varrer, expirar nem limpar, que é " +
        "justamente o trabalho de verdade num registro."
      );
    }
    return saida;
  };

  // ---------------- varredura ----------------
  // CVEs FICTÍCIOS: o que é real aqui é o formato da saída, a contagem por
  // severidade e a decisão que se toma olhando pra ela.
  const CVES = [
    { name: "CVE-2026-0913", severity: "CRITICAL", pacote: "openssl", versao: "3.0.11",
      descricao: "Leitura fora dos limites ao processar um certificado X.509 malformado." },
    { name: "CVE-2026-0771", severity: "HIGH", pacote: "zlib", versao: "1.2.13",
      descricao: "Estouro de inteiro na descompactação de fluxo corrompido." },
    { name: "CVE-2025-9902", severity: "HIGH", pacote: "libxml2", versao: "2.9.14",
      descricao: "Uso após liberação ao processar entidade XML aninhada." },
    { name: "CVE-2025-8410", severity: "MEDIUM", pacote: "curl", versao: "7.88.1",
      descricao: "Vazamento de cabeçalho de autenticação em redirecionamento entre domínios." },
    { name: "CVE-2025-7733", severity: "MEDIUM", pacote: "glibc", versao: "2.36",
      descricao: "Consumo excessivo de memória em resolução de nomes." },
    { name: "CVE-2025-6218", severity: "MEDIUM", pacote: "bash", versao: "5.2",
      descricao: "Escrita fora dos limites em expansão de chaves muito longa." },
    { name: "CVE-2025-5104", severity: "LOW", pacote: "tzdata", versao: "2023c",
      descricao: "Fuso horário desatualizado; sem impacto direto de segurança." },
  ];
  // Quanto mais tempo a imagem fica parada, mais falhas conhecidas ela acumula
  // — sem ninguém ter mexido nela. É a lição da atividade que compara duas.
  function achadosDe(img) {
    const quantos = Math.min(CVES.length, 3 + Math.floor(img.dias / 45));
    return CVES.slice(0, quantos);
  }
  function contagem(lista) {
    const c = {};
    for (const f of lista) c[f.severity] = (c[f.severity] || 0) + 1;
    return c;
  }
  function acharImagem(repo, alvo, nome, operacao) {
    const tag = alvo.imageTag ? String(alvo.imageTag) : "";
    const digest = alvo.imageDigest ? String(alvo.imageDigest) : "";
    if (!tag && !digest) {
      throw new ErroCli(
        "Error parsing parameter '--image-id': informe imageTag=<tag> ou imageDigest=<sha256:...>.\n" +
        "A imagem sem tag só pode ser identificada pelo digest — pegue o dela no describe-images."
      );
    }
    const img = repo.detalhes.find((d) => (tag && d.tags.indexOf(tag) >= 0) || (digest && d.digest === digest));
    if (!img) {
      throw new ErroCli(
        "An error occurred (ImageNotFoundException) when calling the " + operacao + " operation: " +
        "The image with imageId {" + (tag ? "imageTag:'" + tag + "'" : "imageDigest:'" + digest + "'") + "} " +
        "does not exist within the repository with name '" + nome + "'"
      );
    }
    return img;
  }

  // ---------------- ciclo de vida ----------------
  // Conteúdo do ciclo-imagens.json do lab (o file:// devolve este objeto).
  const POLITICA_LAB = { rules: [
    { rulePriority: 1, description: "Guarda só as 2 versões mais recentes com tag v",
      selection: { tagStatus: "tagged", tagPrefixList: ["v"], countType: "imageCountMoreThan", countNumber: 2 },
      action: { type: "expire" } },
    { rulePriority: 2, description: "Apaga imagem sem tag parada há mais de 14 dias",
      selection: { tagStatus: "untagged", countType: "sinceImagePushed", countUnit: "days", countNumber: 14 },
      action: { type: "expire" } },
  ] };

  function lerPolitica(conta, valor, flag) {
    const bruto = String(valor);
    if (bruto.indexOf("file://") === 0) {
      const arq = bruto.slice(7);
      if (typeof arquivoLocal === "function" && !arquivoLocal(arq, conta)) {
        throw new ErroCli(
          "Error parsing parameter '--" + flag + "': Unable to load paramfile " + bruto + ": arquivo não existe.\n" +
          "Digite 'ls' pra ver os arquivos do lab."
        );
      }
      return POLITICA_LAB;
    }
    try { return JSON.parse(bruto); }
    catch (e) { throw new ErroCli("Error parsing parameter '--" + flag + "': Invalid JSON received."); }
  }

  // Implementa as duas formas de regra que o lab usa. Não é o avaliador
  // completo da AWS — é o suficiente pra o preview dizer a verdade sobre ESTES
  // repositórios, que é o que a atividade pergunta.
  function simular(repo, politica) {
    const expira = [];
    const marcar = (d, regra) => { if (!expira.some((x) => x.img === d)) expira.push({ img: d, regra: regra }); };
    const regras = (politica.rules || []).slice().sort((a, b) => (a.rulePriority || 0) - (b.rulePriority || 0));
    for (const regra of regras) {
      const sel = regra.selection || {};
      if (sel.tagStatus === "tagged" && sel.countType === "imageCountMoreThan") {
        const prefixos = sel.tagPrefixList || [];
        repo.detalhes
          .filter((d) => d.tags.some((t) => prefixos.some((p) => t.indexOf(p) === 0)))
          .sort((a, b) => Date.parse(b.push) - Date.parse(a.push))
          .slice(Number(sel.countNumber) || 0)
          .forEach((d) => marcar(d, regra));
      }
      if (sel.tagStatus === "untagged" && sel.countType === "sinceImagePushed") {
        const limite = Date.now() - (Number(sel.countNumber) || 0) * 86400000;
        repo.detalhes
          .filter((d) => !d.tags.length && Date.parse(d.push) < limite)
          .forEach((d) => marcar(d, regra));
      }
    }
    return expira;
  }

  // ---------------- comandos ----------------
  Object.assign(SERVICOS.ecr, {
    "describe-images": (conta, pos, flags) => {
      const nome = String(exigirFlag(flags, "repository-name"));
      const repo = repoOu404(conta, nome, "DescribeImages");
      let lista = repo.detalhes;
      if (flags["image-ids"]) {
        const alvo = parsearShorthand(String(flags["image-ids"]));
        lista = [acharImagem(repo, alvo, nome, "DescribeImages")];
        avisarClimb(
          "Com `--image-ids` você deixa de trazer o repositório inteiro e pergunta por UMA imagem. Numa " +
          "conta de verdade um repositório tem centenas de versões: puxar tudo pra procurar uma é o hábito " +
          "que transforma a saída num muro de texto."
        );
      } else {
        const semTag = repo.detalhes.filter((d) => !d.tags.length).length;
        avisarClimb(
          "É a diferença entre `list-images` e `describe-images`: o list devolve a identidade (tag e " +
          "digest), o describe devolve o que serve pra DECIDIR — tamanho, data do push e o estado da " +
          "varredura. Repare que uma linha só pode carregar duas tags: tag é apelido, digest é a imagem." +
          (semTag ? "\nE tem imagem SEM TAG aqui: quase sempre é órfã — alguém publicou por cima de uma " +
            "tag, o conteúdo antigo perdeu o nome e continua ocupando espaço (e sendo cobrado)." : "")
        );
      }
      return js({ imageDetails: lista.map((d) => {
        const linha = {
          registryId: CONTA(conta), repositoryName: nome, imageDigest: d.digest,
          imageSizeInBytes: d.bytes, imagePushedAt: d.push,
        };
        if (d.tags.length) linha.imageTags = d.tags.slice();
        if (d.escaneada) {
          linha.imageScanStatus = { status: "COMPLETE" };
          linha.imageScanFindingsSummary = { findingSeverityCounts: contagem(achadosDe(d)) };
        }
        return linha;
      }) });
    },

    "put-image-scanning-configuration": (conta, pos, flags) => {
      const nome = String(exigirFlag(flags, "repository-name"));
      const repo = repoOu404(conta, nome, "PutImageScanningConfiguration");
      const cfg = parsearShorthand(String(exigirFlag(flags, "image-scanning-configuration")));
      if (!("scanOnPush" in cfg)) {
        throw new ErroCli(
          "Error parsing parameter '--image-scanning-configuration': a chave esperada é scanOnPush.\n" +
          "Formato: scanOnPush=true"
        );
      }
      repo.scanOnPush = String(cfg.scanOnPush).toLowerCase() === "true";
      avisarClimb(repo.scanOnPush
        ? "Ligado: daqui pra frente toda imagem publicada é varrida sozinha, sem depender de alguém " +
          "lembrar. Uma coisa que pega quase todo mundo: isso vale pro que chegar DEPOIS. As imagens que " +
          "já estavam no repositório continuam sem varredura nenhuma — pra essas você precisa pedir."
        : "Desligado. A varredura deixa de acontecer no push; quem quiser saber o que tem dentro da " +
          "imagem vai ter que pedir uma varredura de cada vez.");
      return js({
        registryId: CONTA(conta), repositoryName: nome,
        imageScanningConfiguration: { scanOnPush: repo.scanOnPush },
      });
    },

    "start-image-scan": (conta, pos, flags) => {
      const nome = String(exigirFlag(flags, "repository-name"));
      const repo = repoOu404(conta, nome, "StartImageScan");
      const img = acharImagem(repo, parsearShorthand(String(exigirFlag(flags, "image-id"))), nome, "StartImageScan");
      img.escaneada = true;
      avisarClimb(
        "Varredura avulsa: é assim que se olha uma imagem que já estava no repositório antes de o " +
        "scanOnPush existir. Na AWS real ela leva alguns minutos e o resultado fica guardado na imagem — " +
        "você não varre de novo pra ler, você lê os achados depois."
      );
      return js({
        registryId: CONTA(conta), repositoryName: nome,
        imageId: img.tags.length ? { imageDigest: img.digest, imageTag: img.tags[0] } : { imageDigest: img.digest },
        imageScanStatus: { status: "IN_PROGRESS" },
      });
    },

    "describe-image-scan-findings": (conta, pos, flags) => {
      const nome = String(exigirFlag(flags, "repository-name"));
      const repo = repoOu404(conta, nome, "DescribeImageScanFindings");
      const img = acharImagem(repo, parsearShorthand(String(exigirFlag(flags, "image-id"))), nome, "DescribeImageScanFindings");
      if (!img.escaneada) {
        throw new ErroCli(
          "An error occurred (ScanNotFoundException) when calling the DescribeImageScanFindings operation: " +
          "Image scan does not exist for the image with '{imageDigest:" + img.digest + "}' in the repository " +
          "with name '" + nome + "'.\n" +
          "(ninguém varreu esta imagem ainda — varredura não acontece sozinha no que já estava guardado)"
        );
      }
      const lista = achadosDe(img);
      avisarClimb(
        "Olhe o `findingSeverityCounts` antes da lista: ele diz o tamanho do problema em uma linha, e é " +
        "por ele que se decide se o deploy sai ou não. Repare de onde vem o CRITICAL — é pacote do sistema " +
        "base, não do seu código. Corrigir isso é reconstruir a imagem sobre uma base atualizada e publicar " +
        "de novo; não existe remendar imagem que já está no registro.\n" +
        "(os CVEs deste laboratório são fictícios — o que é real aqui é o formato e a decisão)"
      );
      return js({
        registryId: CONTA(conta), repositoryName: nome,
        imageId: img.tags.length ? { imageDigest: img.digest, imageTag: img.tags[0] } : { imageDigest: img.digest },
        imageScanStatus: { status: "COMPLETE" },
        imageScanFindings: {
          findingSeverityCounts: contagem(lista),
          findings: lista.map((f) => ({
            name: f.name, severity: f.severity, description: f.descricao,
            attributes: [{ key: "package_name", value: f.pacote }, { key: "package_version", value: f.versao }],
          })),
        },
      });
    },

    "put-image-tag-mutability": (conta, pos, flags) => {
      const nome = String(exigirFlag(flags, "repository-name"));
      const repo = repoOu404(conta, nome, "PutImageTagMutability");
      const valor = String(exigirFlag(flags, "image-tag-mutability")).toUpperCase();
      if (valor !== "MUTABLE" && valor !== "IMMUTABLE") {
        throw new ErroCli(
          "An error occurred (ValidationException) when calling the PutImageTagMutability operation: " +
          "Value '" + valor + "' at 'imageTagMutability' failed to satisfy constraint: " +
          "Member must satisfy enum value set: [IMMUTABLE, MUTABLE]"
        );
      }
      repo.tagMutability = valor;
      avisarClimb(valor === "IMMUTABLE"
        ? "Agora uma tag publicada não muda mais de conteúdo: 'v2.0' vai querer dizer a mesma coisa daqui a " +
          "um ano. O preço é real e vale saber antes: a esteira que republica `latest` a cada build passa a " +
          "FALHAR. Essa conversa é melhor ter agora do que depois de um deploy que subiu outra coisa."
        : "Voltou ao padrão: dá pra publicar por cima de uma tag existente. É o que produz imagem órfã — a " +
          "antiga perde o nome e fica ocupando espaço sem ninguém saber de onde veio.");
      return js({ registryId: CONTA(conta), repositoryName: nome, imageTagMutability: valor });
    },

    "start-lifecycle-policy-preview": (conta, pos, flags) => {
      const nome = String(exigirFlag(flags, "repository-name"));
      const repo = repoOu404(conta, nome, "StartLifecyclePolicyPreview");
      const politica = flags["lifecycle-policy-text"]
        ? lerPolitica(conta, flags["lifecycle-policy-text"], "lifecycle-policy-text")
        : repo.lifecycle;
      if (!politica) {
        throw new ErroCli(
          "An error occurred (LifecyclePolicyNotFoundException) when calling the " +
          "StartLifecyclePolicyPreview operation: Lifecycle policy does not exist for the repository " +
          "with name '" + nome + "'.\n" +
          "(passe em --lifecycle-policy-text a política que você quer ENSAIAR)"
        );
      }
      const expira = simular(repo, politica);
      avisarClimb(
        "O preview não apaga nada: ele responde \"o que aconteceria\". Leia a lista antes de aplicar, " +
        "porque uma regra do tipo \"guarde as N mais recentes\" conta por data de PUBLICAÇÃO, não por uso. " +
        "A versão antiga que ainda está rodando em produção (porque ninguém atualizou a task definition) " +
        "entra na conta como qualquer outra — e some. É o incidente clássico do ECR: o próximo deploy não " +
        "acha a imagem." +
        (expira.length ? "" : "\nHoje esta política não apagaria nada aqui — o que não quer dizer que ela " +
          "seja inofensiva: ela vale pro dia em que houver 40 versões.")
      );
      return js({
        registryId: CONTA(conta), repositoryName: nome, status: "COMPLETE",
        previewResults: expira.map((e) => ({
          imageDigest: e.img.digest,
          imageTags: e.img.tags.slice(),
          imagePushedAt: e.img.push,
          appliedRulePriority: e.regra.rulePriority,
        })),
        summary: { expiringImageTotalCount: expira.length },
      });
    },

    "put-lifecycle-policy": (conta, pos, flags) => {
      const nome = String(exigirFlag(flags, "repository-name"));
      const repo = repoOu404(conta, nome, "PutLifecyclePolicy");
      const politica = lerPolitica(conta, exigirFlag(flags, "lifecycle-policy-text"), "lifecycle-policy-text");
      if (!politica.rules || !politica.rules.length) {
        throw new ErroCli(
          "An error occurred (InvalidParameterException) when calling the PutLifecyclePolicy operation: " +
          "Invalid parameter at 'lifecyclePolicyText': a política precisa de ao menos uma regra em \"rules\"."
        );
      }
      repo.lifecycle = politica;
      const expira = simular(repo, politica);
      avisarClimb(
        "Política valendo. Daqui pra frente o ECR limpa sozinho, sem ninguém lembrar — e é definitivo: " +
        "imagem expirada não vai pra lixeira nenhuma. Por isso a ordem certa é ensaiar primeiro e aplicar " +
        "depois, nunca o contrário." +
        (expira.length ? "\nCom o conteúdo de hoje, " + expira.length + " imagem(ns) já se enquadram na regra." : "")
      );
      return js({
        registryId: CONTA(conta), repositoryName: nome,
        lifecyclePolicyText: JSON.stringify(politica),
      });
    },
  });

  // ---------------- manuais (sem manual o fumaça reprova) ----------------
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => "USO\n    " + uso + "\n\n" + txt;
    Object.assign(MANUAIS, {
      "ecr.describe-images": M(
        "aws ecr describe-images --repository-name loja-imagens [--image-ids imageTag=v1.0]",
        "Detalhes das imagens: tamanho, data do push, tags e estado da varredura.\nÉ o irmão detalhado do list-images, que só devolve tag e digest.\n\nOPÇÕES ÚTEIS\n    --image-ids    pergunta por UMA imagem (imageTag=… ou imageDigest=…)"),
      "ecr.put-image-scanning-configuration": M(
        "aws ecr put-image-scanning-configuration --repository-name loja-imagens \\\n        --image-scanning-configuration scanOnPush=true",
        "Faz o repositório varrer sozinho toda imagem que chegar.\n\nATENÇÃO: vale só pro que for publicado DEPOIS. As imagens que já\nestão guardadas continuam sem varredura — use o start-image-scan."),
      "ecr.start-image-scan": M(
        "aws ecr start-image-scan --repository-name loja-imagens --image-id imageTag=v1.0",
        "Pede a varredura de uma imagem específica, agora.\nÉ o que se usa no que já estava no repositório antes do scanOnPush.\n\nA imagem SEM TAG só pode ser apontada pelo digest:\n    --image-id imageDigest=sha256:…"),
      "ecr.describe-image-scan-findings": M(
        "aws ecr describe-image-scan-findings --repository-name loja-imagens \\\n        --image-id imageTag=v1.2",
        "Mostra o que a varredura achou naquela imagem.\nComece pelo findingSeverityCounts: é o resumo por severidade.\n\nSe voltar ScanNotFoundException, ninguém varreu essa imagem ainda."),
      "ecr.put-image-tag-mutability": M(
        "aws ecr put-image-tag-mutability --repository-name loja-imagens \\\n        --image-tag-mutability IMMUTABLE",
        "Trava (ou destrava) a reescrita de tags no repositório.\nCom IMMUTABLE, publicar por cima de uma tag existente passa a falhar —\né o que garante que \"v2.0\" queira dizer sempre a mesma coisa.\n\nVALORES\n    MUTABLE      padrão; dá pra publicar por cima\n    IMMUTABLE    tag publicada não muda mais"),
      "ecr.start-lifecycle-policy-preview": M(
        "aws ecr start-lifecycle-policy-preview --repository-name loja-imagens \\\n        --lifecycle-policy-text file://ciclo-imagens.json",
        "ENSAIA uma política de ciclo de vida: diz quais imagens ela apagaria,\nsem apagar nada. É o passo que se pula antes de um acidente.\n\nSem --lifecycle-policy-text ele ensaia a política já aplicada."),
      "ecr.put-lifecycle-policy": M(
        "aws ecr put-lifecycle-policy --repository-name loja-imagens \\\n        --lifecycle-policy-text file://ciclo-imagens.json",
        "Aplica a política: o ECR passa a expirar imagem sozinho.\nExpiração é DEFINITIVA — não existe lixeira. Ensaie antes com o\nstart-lifecycle-policy-preview."),
    });
  }

  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "ecr.describe-images": "mostra tamanho, idade e varredura de cada imagem — é com isso que se decide o que fica e o que sai.",
      "ecr.put-image-scanning-configuration": "faz o repositório varrer sozinho no push, pra segurança não depender de alguém lembrar.",
      "ecr.start-image-scan": "varre uma imagem específica — a saída pro que já estava guardado antes do scanOnPush.",
      "ecr.describe-image-scan-findings": "conta o que a varredura achou, por severidade: é o dado que barra (ou libera) o deploy.",
      "ecr.put-image-tag-mutability": "impede publicar por cima de uma tag existente, pra o número da versão significar alguma coisa.",
      "ecr.start-lifecycle-policy-preview": "ensaia a limpeza automática e mostra o que ela apagaria, antes de valer de verdade.",
      "ecr.put-lifecycle-policy": "liga a limpeza automática das imagens velhas — é o que segura a conta do ECR.",
    });
  }

  // ---------------- arquivo do laboratório ----------------
  // A trilha manda usar file://ciclo-imagens.json — então o arquivo precisa
  // EXISTIR de verdade: dá pra ver no `ls` e ler com `cat` antes de aplicar.
  // Mandar aplicar às cegas uma política que APAGA seria ensinar o hábito errado.
  if (typeof ARQUIVOS_LOCAIS !== "undefined") {
    const CONTEUDO = JSON.stringify(POLITICA_LAB, null, 2) + "\n";
    ARQUIVOS_LOCAIS["ciclo-imagens.json"] = CONTEUDO.length;
    if (typeof window !== "undefined") {
      window.ARQUIVOS_CONTEUDO = window.ARQUIVOS_CONTEUDO || {};
      window.ARQUIVOS_CONTEUDO["ciclo-imagens.json"] = CONTEUDO;
    }
  }

  // ---------------- atividades ----------------
  // Ciclo por comando-âncora: [ensina] -> [aplica] -> [MARCO do mini-projeto].
  // O repositório pagamentos/checkout-api atravessa a trilha inteira.
  const rep = (c, nome) => ((c.ecr || {}).repositorios || {})[nome];
  const PROJ = "pagamentos/checkout-api";

  // MARCO 1 — entra logo depois do create-repository (ecr-2).
  const MARCO_1 = { id: "ecr-6", servico: "ecr", nivel: 1, xp: 55,
    titulo: "O repositório que vai te acompanhar até o fim",
    descricao: "O time de pagamentos vai publicar a API de checkout em contêiner, e esse repositório é seu de agora até o fim da trilha: a cada coisa nova que você aprender, você volta e melhora ele. Crie ele seguindo a convenção da empresa, que separa por time: <b>pagamentos/checkout-api</b>. <small>(sim, com barra: nome de repositório no ECR pode ter prefixo de time)</small>",
    dicas: [
      "É o mesmo comando que criou o loja-imagens — o que muda é só o nome, e a barra faz parte dele.",
      "Se o CLI reclamar do nome, confira se você digitou o prefixo do time e o nome do serviço separados por uma barra, sem espaços.",
    ],
    solucao: ["aws ecr create-repository --repository-name pagamentos/checkout-api"],
    validar: (c) => !!rep(c, PROJ) };

  // As demais entram ANTES do ecr-5 (delete), que é o fecho da trilha.
  const NOVAS = [
    // ---------- ÂNCORA: describe-images ----------
    { id: "ecr-7", servico: "ecr", nivel: 2, xp: 70,
      titulo: "O financeiro perguntou do ECR",
      descricao: "A linha do <b>ECR</b> apareceu na fatura e ninguém sabe explicar. O <code>list-images</code> que você acabou de usar não ajuda: ele devolve tag e digest, e nenhum dos dois custa dinheiro. Traga o que realmente importa das imagens do <b>loja-imagens</b>.",
      dicas: [
        "Quando o `list-` devolve pouco, o CLI quase sempre tem um irmão mais detalhado — no ECR ele fala de imagens, não de repositórios.",
        "Ele pede o mesmo `--repository-name` do list-images. Na saída, o par que responde à pergunta do financeiro é `imageSizeInBytes` com `imagePushedAt`; e repare quantas tags cabem numa linha só.",
      ],
      solucao: ["aws ecr describe-images --repository-name loja-imagens"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "describe-images") && String(cmd.flags["repository-name"]) === "loja-imagens" },

    { id: "ecr-8", servico: "ecr", nivel: 2, xp: 80,
      titulo: "Só me diga da v1.0",
      descricao: "Você mostrou a lista na reunião e veio a pergunta certa: <b>a v1.0, de sete meses atrás, ainda está lá?</b> Repositório de verdade tem centenas de versões — traga <b>só essa imagem</b>, não o repositório inteiro.",
      dicas: [
        "O mesmo comando de antes aceita uma flag pra perguntar por imagens específicas, no plural.",
        "O valor não é a tag solta: é `chave=valor`, do mesmo jeito que se identifica imagem no ECR. Você tem a tag, não o digest.",
      ],
      solucao: ["aws ecr describe-images --repository-name loja-imagens --image-ids imageTag=v1.0"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "describe-images") && /v1\.0/.test(String(cmd.flags["image-ids"] || "")) },

    { id: "ecr-9", servico: "ecr", nivel: 2, xp: 85,
      titulo: "Marco: o que tem dentro do checkout-api?",
      descricao: "Antes de mexer no repositório do time de pagamentos, olhe o que já mora nele. Liste os detalhes do <b>pagamentos/checkout-api</b> e responda pra você mesmo: <b>tem alguma imagem ali que ninguém sabe de onde veio?</b>",
      dicas: [
        "É o comando que você acabou de aprender, agora no repositório do projeto — sem filtrar por imagem, porque a pergunta é sobre o conjunto.",
        "Compare as linhas: uma delas não tem o campo `imageTags`. Guarde o `imageDigest` dessa daí — sem tag, o digest é o único jeito de apontar pra ela depois.",
      ],
      solucao: ["aws ecr describe-images --repository-name pagamentos/checkout-api"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "describe-images") && String(cmd.flags["repository-name"]) === PROJ },

    // ---------- ÂNCORA: varredura ----------
    { id: "ecr-10", servico: "ecr", nivel: 2, xp: 75,
      titulo: "Ninguém vai lembrar de varrer na mão",
      descricao: "Uma imagem foi pro ar com uma falha conhecida do <b>openssl</b> e a explicação na reunião foi \"esqueceram de varrer\". Processo que depende de alguém lembrar não é processo. Faça o <b>loja-imagens</b> varrer <b>sozinho a cada publicação</b>.",
      dicas: [
        "Varredura automática não é um comando que você roda toda vez: é uma configuração DO repositório. O verbo que grava configuração no ECR é `put-`.",
        "A flag `--image-scanning-configuration` não recebe uma palavra solta, e sim `chave=valor`. A chave diz em que momento varrer — e o momento é o push.",
      ],
      solucao: ["aws ecr put-image-scanning-configuration --repository-name loja-imagens --image-scanning-configuration scanOnPush=true"],
      validar: (c) => (rep(c, "loja-imagens") || {}).scanOnPush === true },

    { id: "ecr-11", servico: "ecr", nivel: 3, xp: 90,
      titulo: "E o que já estava lá dentro?",
      descricao: "Você ligou a varredura automática — e o aviso na tela te contou uma coisa desconfortável: ela só vale pro que chegar <b>depois</b>. A <b>v1.2</b> sobe pra produção amanhã e nunca foi varrida por ninguém. Peça a varredura dela, agora.",
      dicas: [
        "Existe um comando pra pedir uma varredura avulsa; ele começa com `start-`, como quase tudo que dispara um trabalho na AWS.",
        "Ele identifica a imagem do mesmo jeito `chave=valor` de sempre — só que a flag aqui é no singular, porque é uma imagem só.",
      ],
      solucao: ["aws ecr start-image-scan --repository-name loja-imagens --image-id imageTag=v1.2"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "start-image-scan") && /v1\.2/.test(String(cmd.flags["image-id"] || "")) },

    { id: "ecr-12", servico: "ecr", nivel: 3, xp: 95,
      titulo: "A v1.2 pode subir amanhã?",
      descricao: "A varredura rodou. Agora a decisão é sua: <b>leia o que ela encontrou na v1.2</b> e repare em <b>quem</b> é o pacote com o problema mais grave — isso muda completamente quem tem que consertar.",
      dicas: [
        "Varredura não te procura: você é que pergunta. O comando é o `describe-` dos achados dela.",
        "Comece a leitura pelo `findingSeverityCounts`, não pela lista: ele resume a decisão numa linha. A lista serve pra você ver de qual pacote vem o CRITICAL.",
      ],
      solucao: ["aws ecr describe-image-scan-findings --repository-name loja-imagens --image-id imageTag=v1.2"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "describe-image-scan-findings") && /v1\.2/.test(String(cmd.flags["image-id"] || "")) },

    { id: "ecr-13", servico: "ecr", nivel: 3, xp: 105,
      titulo: "A v1.0 continua rodando em produção",
      descricao: "Um serviço antigo ainda usa a <b>v1.0</b>, publicada há sete meses e nunca varrida. <b>Varra e leia os achados dela</b> — e compare com o que você viu na v1.2. A imagem não mudou nesse tempo; o que mudou foi o que o mundo descobriu sobre ela.",
      dicas: [
        "São os dois comandos que você acabou de usar, na ordem: não dá pra ler achado de uma imagem que ninguém varreu.",
        "Compare os dois `findingSeverityCounts`. A conclusão que interessa: imagem parada não fica igual — ela piora sozinha, e por isso reconstruir a imagem periodicamente é manutenção, não capricho.",
      ],
      solucao: [
        "aws ecr start-image-scan --repository-name loja-imagens --image-id imageTag=v1.0",
        "aws ecr describe-image-scan-findings --repository-name loja-imagens --image-id imageTag=v1.0",
      ],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "describe-image-scan-findings") && /v1\.0/.test(String(cmd.flags["image-id"] || "")) },

    { id: "ecr-14", servico: "ecr", nivel: 3, xp: 100,
      titulo: "Marco: o checkout-api também não se varre sozinho",
      descricao: "Volte pro repositório do projeto. Ligue a <b>varredura automática</b> nele e, já que ela não olha pra trás, mande varrer <b>aquela imagem sem tag</b> que você encontrou. <small>(sem tag, o único jeito de apontar pra ela é pelo <code>imageDigest</code> — pegue no describe-images)</small>",
      dicas: [
        "São dois comandos que você já usou: um liga a configuração no repositório, o outro dispara a varredura de uma imagem.",
        "No segundo, troque `imageTag=` por `imageDigest=` e cole o sha256 completo que o describe-images mostrou pra linha sem tags.",
      ],
      solucao: [
        "aws ecr put-image-scanning-configuration --repository-name pagamentos/checkout-api --image-scanning-configuration scanOnPush=true",
        "aws ecr start-image-scan --repository-name pagamentos/checkout-api --image-id imageDigest=<digest-orfa>",
      ],
      validar: (c) => {
        const r = rep(c, PROJ) || {};
        const orfa = (r.detalhes || []).find((d) => !d.tags.length);
        return r.scanOnPush === true && !!orfa && orfa.escaneada === true;
      } },

    // ---------- tag imutável: explica a órfã ----------
    { id: "ecr-15", servico: "ecr", nivel: 3, xp: 90,
      titulo: "De onde saiu a imagem sem nome",
      descricao: "Aquela órfã do checkout-api tem uma explicação simples: alguém publicou por cima da tag <b>v2.0</b>, o conteúdo antigo perdeu o nome e ficou lá, pagando armazenamento. Enquanto a tag puder se mexer, o número da versão não prova nada. <b>Trave as tags do pagamentos/checkout-api.</b>",
      dicas: [
        "Também é configuração do repositório, do mesmo verbo `put-` da varredura — só que sobre as TAGS.",
        "O valor é uma palavra só, em MAIÚSCULAS, e é o oposto do padrão de hoje (MUTABLE). Pense no efeito antes de rodar: a esteira que republica `latest` a cada build vai passar a falhar.",
      ],
      solucao: ["aws ecr put-image-tag-mutability --repository-name pagamentos/checkout-api --image-tag-mutability IMMUTABLE"],
      validar: (c) => (rep(c, PROJ) || {}).tagMutability === "IMMUTABLE" },

    // ---------- ÂNCORA: ciclo de vida ----------
    { id: "ecr-16", servico: "ecr", nivel: 3, xp: 105,
      titulo: "Ensaie a limpeza antes de fazer",
      descricao: "O time escreveu uma regra de limpeza automática e ela está no arquivo <b>ciclo-imagens.json</b> — <b>leia ele com <code>cat</code> antes</b>, porque essa regra APAGA imagem. Depois rode o <b>ensaio</b> dela no <b>loja-imagens</b>: descubra o que ela levaria junto, sem aplicar nada. <small>(o CLI lê um arquivo do disco com o prefixo <code>file://</code>)</small>",
      dicas: [
        "O ECR tem um comando que responde \"o que aconteceria se eu aplicasse isto\" sem aplicar nada. Ele começa com `start-` e termina com `-preview`.",
        "Ele recebe o repositório e a política. Como a política está num arquivo, o valor da flag não é o JSON colado: é `file://` seguido do nome do arquivo. Olhe qual imagem aparece no resultado e pergunte-se se alguém ainda usa ela.",
      ],
      solucao: ["aws ecr start-lifecycle-policy-preview --repository-name loja-imagens --lifecycle-policy-text file://ciclo-imagens.json"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "start-lifecycle-policy-preview") && /ciclo-imagens/.test(String(cmd.flags["lifecycle-policy-text"] || "")) },

    { id: "ecr-17", servico: "ecr", nivel: 3, xp: 110,
      titulo: "Agora sim, deixe a limpeza no automático",
      descricao: "O ensaio mostrou o que sai e você concorda com a lista. <b>Aplique</b> a política do <b>ciclo-imagens.json</b> no <b>loja-imagens</b> — a partir daí o ECR limpa sozinho, todo dia, sem depender de ninguém lembrar.",
      dicas: [
        "Aplicar é gravar configuração no repositório: o mesmo verbo `put-` da varredura e da mutabilidade, agora sobre o ciclo de vida.",
        "A flag do conteúdo é exatamente a mesma do ensaio que você acabou de rodar. Muda o comando, não os argumentos.",
      ],
      solucao: ["aws ecr put-lifecycle-policy --repository-name loja-imagens --lifecycle-policy-text file://ciclo-imagens.json"],
      validar: (c) => !!(rep(c, "loja-imagens") || {}).lifecycle },

    { id: "ecr-18", servico: "ecr", nivel: 3, xp: 115,
      titulo: "Marco: o checkout-api se limpa sozinho",
      descricao: "Feche o repositório do projeto: <b>ensaie</b> a mesma política nele e depois <b>aplique</b>. Repare que o resultado do ensaio aqui é <b>diferente</b> do que deu no loja-imagens — e a diferença é exatamente aquela imagem órfã.",
      dicas: [
        "São os dois comandos do ciclo de vida, na ordem certa: ensaiar e só então aplicar. Mesma política, outro repositório.",
        "No ensaio, olhe o `appliedRulePriority`: ele diz QUAL das duas regras do arquivo pegou a imagem — e não é a mesma regra que pegou a v1.0 lá no outro repositório.",
      ],
      solucao: [
        "aws ecr start-lifecycle-policy-preview --repository-name pagamentos/checkout-api --lifecycle-policy-text file://ciclo-imagens.json",
        "aws ecr put-lifecycle-policy --repository-name pagamentos/checkout-api --lifecycle-policy-text file://ciclo-imagens.json",
      ],
      validar: (c) => !!(rep(c, PROJ) || {}).lifecycle },
  ];

  const PROJETO = { id: "ecr-proj", servico: "ecr", tipo: "projeto", nivel: 3, xp: 340,
    titulo: "📦 Projeto: um registro que ninguém precisa vigiar",
    descricao: "O time de logística vai publicar o serviço de rastreio em contêiner e pediu o registro pronto. Sem passo a passo desta vez: entregue o repositório <b>logistica/rastreio</b> com <b>varredura a cada publicação</b>, <b>tags travadas</b> (pra o número da versão significar alguma coisa) e a <b>limpeza automática</b> do ciclo-imagens.json já valendo. Faça na ordem que quiser — o checklist marca sozinho.",
    dicas: [
      "É o caminho que você percorreu no checkout-api: create-repository → put-image-scanning-configuration → put-image-tag-mutability → put-lifecycle-policy.",
      "O repositório é logistica/rastreio e a política é o mesmo file://ciclo-imagens.json que você já ensaiou duas vezes.",
    ],
    solucao: [
      "aws ecr create-repository --repository-name logistica/rastreio",
      "aws ecr put-image-scanning-configuration --repository-name logistica/rastreio --image-scanning-configuration scanOnPush=true",
      "aws ecr put-image-tag-mutability --repository-name logistica/rastreio --image-tag-mutability IMMUTABLE",
      "aws ecr put-lifecycle-policy --repository-name logistica/rastreio --lifecycle-policy-text file://ciclo-imagens.json",
    ],
    etapas: [
      { texto: "Criar o repositório logistica/rastreio", validar: (c) => !!rep(c, "logistica/rastreio") },
      { texto: "Ligar a varredura no push", validar: (c) => (rep(c, "logistica/rastreio") || {}).scanOnPush === true },
      { texto: "Travar as tags (IMMUTABLE)", validar: (c) => (rep(c, "logistica/rastreio") || {}).tagMutability === "IMMUTABLE" },
      { texto: "Aplicar o ciclo de vida", validar: (c) => !!(rep(c, "logistica/rastreio") || {}).lifecycle },
    ] };

  if (typeof DESAFIOS !== "undefined") {
    const posDe = (id) => DESAFIOS.findIndex((d) => d.id === id);
    // MARCO 1 logo depois do create-repository: o repositório do projeto tem
    // que nascer cedo pra atravessar a trilha.
    const iCriar = posDe("ecr-2");
    if (iCriar >= 0) DESAFIOS.splice(iCriar + 1, 0, MARCO_1);
    else DESAFIOS.push(MARCO_1);
    // O resto entra ANTES do ecr-5 (delete), que é o fecho.
    const iLimpeza = posDe("ecr-5");
    if (iLimpeza >= 0) DESAFIOS.splice(iLimpeza, 0, ...NOVAS);
    else DESAFIOS.push(...NOVAS);
    // Projeto depois da última atividade do serviço.
    let ultimo = -1;
    for (let k = 0; k < DESAFIOS.length; k++) if (DESAFIOS[k].servico === "ecr") ultimo = k;
    if (ultimo >= 0) DESAFIOS.splice(ultimo + 1, 0, PROJETO);
    else DESAFIOS.push(PROJETO);
  }
})();
