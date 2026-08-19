"use strict";
// ============================================================
// CLImb — cobertura-1.js
// Levantamento (2026-07-31): de 351 comandos registrados no simulador, 67
// NUNCA apareciam em atividade nenhuma. E a maior parte deles estava
// justamente nas trilhas rasas — Shield tinha 1 atividade, Translate 1,
// Bedrock 1, Macie 2...
//
// Esta é a LEVA 1: segurança e IA/dados. Cada atividade existe por um motivo
// pedagógico, não só pra "usar o comando que faltava" — e várias fecham o
// ciclo que a trilha deixava pela metade (ligar o serviço e nunca VER o que
// ele achou; criar a regra e nunca conferir se pegou).
//
// CUIDADO DE ESTADO: a conta do smoke test é COMPARTILHADA e várias trilhas
// terminam APAGANDO o recurso (kin-3 apaga o stream, por exemplo). Estas
// atividades entram no fim da trilha, então as que precisam de um recurso o
// CRIAM na própria solução.
//
// ADITIVO. Carrega depois de licoes.js e dos arquivos de desafio.
// ============================================================
(function () {
  if (typeof DESAFIOS === "undefined" || typeof SERVICOS === "undefined") return;

  const A = [
    // ===================== GuardDuty =====================
    { id: "cob-gd-1", servico: "guardduty", nivel: 3, xp: 110, titulo: "Leia o que o vigia encontrou",
      descricao: "Listar os <b>ids</b> dos achados não diz nada — o que interessa é o <b>conteúdo</b>: o tipo da ameaça e a gravidade (0 a 10). Busque os <b>detalhes</b> dos findings do seu detector.",
      dicas: ["`get-…` traz o conteúdo de itens específicos, enquanto `list-…` traz só os ids. Ele precisa do detector e de quais achados você quer.", "A forma do comando é: aws guardduty get-findings --detector-id <id> --finding-ids <id-do-achado>"],
      solucao: ["aws guardduty get-findings --detector-id <detector-id> --finding-ids f1"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "guardduty", "get-findings") },

    { id: "cob-gd-2", servico: "guardduty", nivel: 3, xp: 90, titulo: "Desligue o vigia",
      descricao: "O GuardDuty cobra pelo volume de log analisado. Numa conta de estudo, <b>desligue</b> removendo o detector. <small>(numa conta real você pensaria duas vezes: sem detector, ninguém está vigiando)</small>",
      dicas: ["Apagar é sempre `delete-…`. Ele precisa saber qual detector.", "A forma do comando é: aws guardduty delete-detector --detector-id <id>"],
      solucao: ["aws guardduty delete-detector --detector-id <detector-id>"],
      validar: (c) => !!(c.guardduty && Object.keys(c.guardduty.detectores).length === 0) },

    // ===================== Inspector =====================
    { id: "cob-insp-1", servico: "inspector2", nivel: 2, xp: 80, titulo: "O Inspector está mesmo ligado?",
      descricao: "Antes de confiar num scanner, confirme que ele está ativo. Veja o <b>status do Inspector na conta</b>.",
      dicas: ["`batch-get-…` busca o estado de várias contas de uma vez — aqui, a sua.", "Este comando não precisa de nenhum parâmetro: aws inspector2 batch-get-account-status"],
      solucao: ["aws inspector2 batch-get-account-status"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "inspector2", "batch-get-account-status") },

    { id: "cob-insp-2", servico: "inspector2", nivel: 3, xp: 90, titulo: "Desligue o scanner",
      descricao: "O Inspector cobra por recurso escaneado por mês. <b>Desabilite</b> o escaneamento de <b>EC2</b>.",
      dicas: ["`disable` é o oposto do `enable` que você usou — e pede os mesmos tipos de recurso.", "A forma do comando é: aws inspector2 disable --resource-types <tipo>"],
      solucao: ["aws inspector2 disable --resource-types EC2"],
      validar: (c) => !!(c.inspector && c.inspector.ligado === false) },

    // ===================== Macie =====================
    { id: "cob-macie-1", servico: "macie2", nivel: 2, xp: 80, titulo: "Confira a sessão do Macie",
      descricao: "Veja o <b>estado da sessão</b> do Macie: se está habilitado e de quanto em quanto tempo ele publica os achados.",
      dicas: ["`get-…` busca o estado de algo específico — aqui, a sessão do serviço na sua conta.", "Este comando não precisa de parâmetro: aws macie2 get-macie-session"],
      solucao: ["aws macie2 get-macie-session"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "macie2", "get-macie-session") },

    { id: "cob-macie-2", servico: "macie2", nivel: 2, xp: 80, titulo: "Os jobs que estão rodando",
      descricao: "Você mandou o Macie vasculhar o bucket. <b>Liste os jobs</b> de classificação pra acompanhar.",
      dicas: ["Pra ver o que já existe, o verbo costuma ser `list-…`.", "Este comando não precisa de parâmetro: aws macie2 list-classification-jobs"],
      solucao: ["aws macie2 list-classification-jobs"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "macie2", "list-classification-jobs") },

    { id: "cob-macie-3", servico: "macie2", nivel: 3, xp: 90, titulo: "Desligue o Macie",
      descricao: "O Macie cobra por bucket monitorado e por GB inspecionado. <b>Desabilite</b> o serviço.",
      dicas: ["`disable-…` é o oposto do enable que você usou pra ligar.", "Este comando não precisa de parâmetro: aws macie2 disable-macie"],
      solucao: ["aws macie2 disable-macie"],
      validar: (c) => !!(c.macie && c.macie.ligado === false) },

    // ===================== WAF =====================
    { id: "cob-waf-1", servico: "wafv2", nivel: 3, xp: 100, titulo: "Abra o firewall e veja as regras",
      descricao: "Listar as Web ACLs mostra só nome e id. Pra ver <b>as regras dentro</b> dela, busque a ACL <b>protege-loja</b>. <small>(precisa do nome, do escopo e do id — o id veio na listagem)</small>",
      dicas: ["`get-…` traz o conteúdo de um item específico. Aqui ele precisa de três coisas pra identificar a ACL: nome, escopo e id.", "A forma do comando é: aws wafv2 get-web-acl --name <nome> --scope <escopo> --id <id>"],
      solucao: ["aws wafv2 get-web-acl --name protege-loja --scope REGIONAL --id <waf-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "wafv2", "get-web-acl") },

    { id: "cob-waf-2", servico: "wafv2", nivel: 3, xp: 90, titulo: "Remova a Web ACL",
      descricao: "O WAF cobra por Web ACL, por regra e por milhão de requisições. <b>Apague</b> a <b>protege-loja</b>.",
      dicas: ["Apagar é sempre `delete-…` — e ele precisa dos mesmos três identificadores do get.", "A forma do comando é: aws wafv2 delete-web-acl --name <nome> --scope <escopo> --id <id>"],
      solucao: ["aws wafv2 delete-web-acl --name protege-loja --scope REGIONAL --id <waf-id>"],
      validar: (c) => !!(c.waf && !Object.values(c.waf.acls).some((a) => a.nome === "protege-loja")) },

    // ===================== Shield =====================
    { id: "cob-shield-1", servico: "shield", nivel: 2, xp: 70, titulo: "O que está sob proteção reforçada?",
      descricao: "O Shield <b>Standard</b> protege tudo automaticamente, mas não dá pra escolher recursos. As <b>proteções explícitas</b> são coisa do Advanced. Liste-as e repare no resultado.",
      dicas: ["Pra ver o que existe, o verbo costuma ser `list-…`. Ele não precisa de parâmetro.", "Repare que a lista vem vazia — e isso é a lição: no Standard você não gerencia proteção recurso a recurso."],
      solucao: ["aws shield list-protections"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "shield", "list-protections") },

    { id: "cob-shield-2", servico: "shield", nivel: 2, xp: 80, titulo: "Levei algum ataque?",
      descricao: "Veja as <b>estatísticas de ataque</b> detectadas na conta. É o relatório que responde \"aquela lentidão de ontem foi DDoS?\".",
      dicas: ["`describe-…` mostra os detalhes/estado de algo — aqui, o resumo dos ataques do período.", "Este comando não precisa de parâmetro: aws shield describe-attack-statistics"],
      solucao: ["aws shield describe-attack-statistics"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "shield", "describe-attack-statistics") },

    // ===================== Config =====================
    { id: "cob-cfg-1", servico: "configservice", nivel: 2, xp: 80, titulo: "O gravador está gravando mesmo?",
      descricao: "Criar o gravador e dar start não garante nada — confirme. Veja o <b>status do configuration recorder</b> e repare no campo <b>recording</b>.",
      dicas: ["`describe-…` mostra o estado. O nome do comando termina em \"-status\".", "Este comando não precisa de parâmetro: aws configservice describe-configuration-recorder-status"],
      solucao: ["aws configservice describe-configuration-recorder-status"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "configservice", "describe-configuration-recorder-status") },

    { id: "cob-cfg-2", servico: "configservice", nivel: 2, xp: 80, titulo: "Quais regras estão valendo?",
      descricao: "Liste as <b>config rules</b> da conta e confira que a sua regra de criptografia está ativa.",
      dicas: ["`describe-…` também serve pra listar, quando o que você quer é o estado de cada item.", "Este comando não precisa de parâmetro: aws configservice describe-config-rules"],
      solucao: ["aws configservice describe-config-rules"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "configservice", "describe-config-rules") },

    // ===================== Kinesis (o stream foi apagado na trilha) =====================
    { id: "cob-kin-1", servico: "kinesis", nivel: 2, xp: 90, titulo: "Quais canos existem?",
      descricao: "Você apagou o stream anterior. Crie um novo chamado <b>sensores-fabrica</b> com <b>2</b> shards e depois <b>liste</b> os streams da conta.",
      dicas: ["São dois comandos: primeiro criar (você já fez isso na trilha), depois listar — e o verbo de listar costuma ser `list-…`.", "A forma é: aws kinesis create-stream --stream-name <nome> --shard-count <n>  →  aws kinesis list-streams"],
      solucao: [
        "aws kinesis create-stream --stream-name sensores-fabrica --shard-count 2",
        "aws kinesis list-streams",
      ],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "kinesis", "list-streams") && !!(c.kinesis && c.kinesis.streams["sensores-fabrica"]) },

    { id: "cob-kin-2", servico: "kinesis", nivel: 3, xp: 100, titulo: "Quantos shards tem o cano?",
      descricao: "Veja os <b>detalhes</b> do stream <b>sensores-fabrica</b>: status, retenção e a lista de shards. <small>(o número de shards é o que define a vazão — e o preço)</small>",
      dicas: ["`describe-…` mostra os detalhes de UM recurso, então precisa saber qual.", "A forma do comando é: aws kinesis describe-stream --stream-name <nome>"],
      solucao: ["aws kinesis describe-stream --stream-name sensores-fabrica"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "kinesis", "describe-stream") },

    // ===================== Cost Explorer =====================
    { id: "cob-ce-1", servico: "ce", nivel: 2, xp: 80, titulo: "Que serviços aparecem na fatura?",
      descricao: "Antes de agrupar o custo, às vezes você só quer saber <b>quais valores existem</b> numa dimensão. Liste os valores da dimensão <b>SERVICE</b>.",
      dicas: ["`get-…` busca algo específico. O nome do comando fala em \"dimension values\".", "A forma é: aws ce get-dimension-values --dimension <DIMENSÃO> --time-period '<json com Start e End>'"],
      solucao: ["aws ce get-dimension-values --dimension SERVICE --time-period '{\"Start\":\"2026-07-01\",\"End\":\"2026-07-31\"}'"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ce", "get-dimension-values") },

    // ===================== IA =====================
    { id: "cob-rek-1", servico: "rekognition", nivel: 2, xp: 90, titulo: "Quantas pessoas na foto — e como estão?",
      descricao: "Além de objetos e texto, o Rekognition analisa <b>rostos</b>: faixa etária estimada, emoção e se a pessoa está sorrindo. Detecte os rostos de uma imagem.",
      dicas: ["`detect-…` é a família de análise. Aqui o alvo são os rostos.", "A forma é a mesma dos outros detect: aws rekognition detect-faces --image '<json apontando a imagem no S3>'"],
      solucao: ["aws rekognition detect-faces --image '{\"S3Object\":{\"Bucket\":\"meu-bucket\",\"Name\":\"turma.jpg\"}}'"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "rekognition", "detect-faces") },

    { id: "cob-trad-1", servico: "translate", nivel: 1, xp: 60, titulo: "Pra quais idiomas dá pra traduzir?",
      descricao: "Antes de montar um app multilíngue, veja <b>quais idiomas</b> o Translate suporta.",
      dicas: ["Pra ver o que existe, o verbo costuma ser `list-…`. Este não precisa de parâmetro.", "Repare no código de cada idioma (pt, en, es…) — é ele que vai nos parâmetros de tradução."],
      solucao: ["aws translate list-languages"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "translate", "list-languages") },

    { id: "cob-comp-1", servico: "comprehend", nivel: 2, xp: 80, titulo: "Em que idioma está isto?",
      descricao: "Antes de analisar sentimento você precisa saber o idioma — e o Comprehend descobre sozinho. Detecte o <b>idioma predominante</b> de um texto.",
      dicas: ["`detect-…` é a família de análise do Comprehend. Aqui o alvo é o idioma, e por isso este é o único detect que NÃO pede --language-code.", "A forma é: aws comprehend detect-dominant-language --text \"<o texto>\""],
      solucao: ["aws comprehend detect-dominant-language --text \"o pedido chegou rapido e bem embalado\""],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "comprehend", "detect-dominant-language") },

    { id: "cob-bed-1", servico: "bedrock", nivel: 2, xp: 80, titulo: "O que este modelo aceita?",
      descricao: "Antes de escolher um modelo, veja o que ele suporta (texto? imagem? resposta em streaming?). Busque os <b>detalhes</b> do modelo <b>amazon.titan-text-express-v1</b>.",
      dicas: ["`get-…` traz os detalhes de UM item — aqui, de um modelo específico.", "A forma é: aws bedrock get-foundation-model --model-identifier <id-do-modelo>"],
      solucao: ["aws bedrock get-foundation-model --model-identifier amazon.titan-text-express-v1"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "bedrock", "get-foundation-model") },
  ];

  // insere cada atividade no FIM da sua trilha
  const porServico = {};
  for (const d of A) (porServico[d.servico] = porServico[d.servico] || []).push(d);
  for (const [svc, lista] of Object.entries(porServico)) {
    if (DESAFIOS.some((d) => d.id === lista[0].id)) continue;
    let i = -1;
    for (let k = 0; k < DESAFIOS.length; k++) if (DESAFIOS[k].servico === svc) i = k;
    if (i >= 0) DESAFIOS.splice(i + 1, 0, ...lista);
    else for (const d of lista) DESAFIOS.push(d);
  }

  // ---------- didática dos comandos que passam a ser exercitados ----------
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "guardduty.get-findings": "traz o CONTEÚDO do achado (tipo da ameaça e gravidade de 0 a 10), enquanto o list traz só os ids. É aqui que você descobre o que de fato aconteceu.",
      "guardduty.delete-detector": "desliga a vigilância. O GuardDuty cobra pelo volume de log analisado — mas sem detector ninguém está olhando.",
      "inspector2.batch-get-account-status": "confirma se o Inspector está mesmo ativo na conta. Scanner desligado que você acha que está ligado é pior que scanner nenhum.",
      "inspector2.disable": "desliga o escaneamento. Ele cobra por recurso escaneado por mês.",
      "macie2.get-macie-session": "mostra se o Macie está habilitado e de quanto em quanto tempo ele publica achados.",
      "macie2.list-classification-jobs": "acompanha os jobs de varredura: quais existem e em que estado estão.",
      "macie2.disable-macie": "desliga o Macie. Ele cobra por bucket monitorado e por GB inspecionado.",
      "wafv2.get-web-acl": "abre a Web ACL e mostra as REGRAS dentro dela — o list só dá nome e id.",
      "wafv2.delete-web-acl": "apaga o firewall de aplicação. Cobra por ACL, por regra e por milhão de requisições inspecionadas.",
      "shield.list-protections": "lista os recursos com proteção explícita. No Shield Standard vem vazio — e essa é a lição: proteção recurso a recurso é coisa do Advanced.",
      "shield.describe-attack-statistics": "o relatório de ataques do período. É o que responde \"aquela lentidão de ontem foi DDoS?\".",
      "configservice.describe-configuration-recorder-status": "confirma se o gravador está REALMENTE gravando (campo recording). Criar e dar start não garante — confira.",
      "configservice.describe-config-rules": "lista as regras de conformidade ativas e o estado de cada uma.",
      "kinesis.list-streams": "mostra quais canos de dados existem na conta.",
      "kinesis.describe-stream": "detalha o stream: status, retenção e shards. O número de shards define a vazão — e o preço.",
      "ce.get-dimension-values": "lista os valores possíveis de uma dimensão (quais serviços geraram custo, por exemplo). Serve pra saber por onde agrupar antes de investigar.",
      "rekognition.detect-faces": "analisa rostos: faixa etária, emoção e se está sorrindo. Usado em controle de acesso e moderação.",
      "translate.list-languages": "mostra os idiomas suportados e o código de cada um — é esse código que vai nos parâmetros de tradução.",
      "comprehend.detect-dominant-language": "descobre o idioma do texto. É o único detect que não pede --language-code (afinal, é ele que responde isso) e costuma ser o primeiro passo de um pipeline de NLP.",
      "bedrock.get-foundation-model": "detalha um modelo: o que aceita de entrada, o que devolve e se suporta streaming. É como você escolhe o modelo certo antes de invocar.",
    });
  }
})();
