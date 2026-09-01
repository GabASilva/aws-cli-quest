"use strict";
// ============================================================
// CLImb — cloudfront-completo.js
// O CloudFront tinha 5 comandos e parava na invalidação: a trilha ensinava a
// criar a CDN e limpar cache, mas nunca o CICLO DE VIDA dela. Faltava
// justamente o que derruba todo mundo na primeira vez:
//
//   ETag — o CloudFront usa trava otimista. Toda alteração exige o --if-match
//          com o ETag ATUAL da distribuição. Pegou o ETag, alguém mexeu antes
//          de você? Sua alteração é recusada, e é isso que evita dois times
//          sobrescreverem um ao outro.
//   APAGAR EM DOIS PASSOS — não existe apagar direto. Primeiro você DESLIGA
//          (update com Enabled:false), depois apaga. Quem tenta o delete numa
//          distribuição ligada leva DistributionNotDisabled.
//
// Comandos conferidos na referência oficial (aws cloudfront) e os IDs/TTLs das
// políticas gerenciadas na página "Use managed cache policies" da AWS.
//
// ADITIVO: complementa SERVICOS.cloudfront, MANUAIS e PORQUE. Não reescreve
// servicos-fase2.js.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.cloudfront) return;

  // `campo` existe porque no get-invalidation o --id é o da INVALIDAÇÃO: ler
  // flags.id ali procuraria a distribuição pelo id errado.
  function distDe(conta, flags, op, campo) {
    conta.cloudfront = conta.cloudfront || { distribuicoes: {} };
    const id = campo
      ? String(flags[campo] || "")
      : String(flags.id || flags["distribution-id"] || "");
    if (!id) throw new ErroCli("aws: error: the following arguments are required: --id");
    const d = conta.cloudfront.distribuicoes[id];
    if (!d) throw new ErroCli(`An error occurred (NoSuchDistribution) when calling the ${op} operation: The specified distribution does not exist.`);
    if (!d.etag) d.etag = "E" + hexAleatorio(13).toUpperCase(); // distribuições antigas não tinham
    return d;
  }
  function exigirIfMatch(d, flags, op) {
    const enviado = String(exigirFlag(flags, "if-match"));
    if (enviado !== d.etag) {
      throw new ErroCli(
        `An error occurred (PreconditionFailed) when calling the ${op} operation: The If-Match version is missing or not valid.\n` +
        `Dica: pegue o ETag atual com "aws cloudfront get-distribution-config --id ${d.id}" — ele muda a cada alteração.`
      );
    }
  }

  // Políticas de cache gerenciadas pela AWS — nomes, IDs e TTLs conferidos na
  // documentação oficial (não invente: os IDs são usados de verdade no --id).
  const POLITICAS_GERENCIADAS = [
    { nome: "Managed-CachingOptimized", id: "658327ea-f89d-4fab-a63d-7e88639e58f6", min: 1, padrao: 86400, max: 31536000 },
    { nome: "Managed-CachingDisabled", id: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad", min: 0, padrao: 0, max: 0 },
    { nome: "Managed-CachingOptimizedForUncompressedObjects", id: "b2884449-e4de-46a7-ac36-70bc7f1ddd6d", min: 1, padrao: 86400, max: 31536000 },
    { nome: "Managed-Elemental-MediaPackage", id: "08627262-05a9-4f76-9ded-b50ca2e3a84f", min: 0, padrao: 86400, max: 31536000 },
    { nome: "Managed-Amplify", id: "2e54312d-136d-493c-8eb9-b001f22f67d2", min: 2, padrao: 2, max: 600 },
    { nome: "Managed-UseOriginCacheControlHeaders", id: "83da9c7e-98b4-4e11-a168-04f0df8e2c65", min: 0, padrao: 0, max: 31536000 },
  ];

  Object.assign(SERVICOS.cloudfront, {
    "get-distribution-config": (conta, pos, flags) => {
      const d = distDe(conta, flags, "GetDistributionConfig");
      avisarClimb(
        "Repare no ETag: ele é a \"versão\" da distribuição. Toda alteração exige mandá-lo de volta no --if-match. " +
        "É assim que a AWS impede que duas pessoas sobrescrevam a configuração uma da outra sem perceber."
      );
      return js({
        ETag: d.etag,
        DistributionConfig: {
          CallerReference: d.criadoEm, Comment: "", Enabled: d.ativo,
          DefaultRootObject: "index.html",
          Origins: { Quantity: 1, Items: [{ Id: d.origem, DomainName: d.origem }] },
        },
      });
    },

    "update-distribution": (conta, pos, flags) => {
      const d = distDe(conta, flags, "UpdateDistribution");
      exigirIfMatch(d, flags, "UpdateDistribution");
      const bruto = String(exigirFlag(flags, "distribution-config"));
      let cfg;
      try { cfg = JSON.parse(bruto); }
      catch (e) { throw new ErroCli("Error parsing parameter '--distribution-config': Invalid JSON received."); }
      if (typeof cfg.Enabled === "boolean") d.ativo = cfg.Enabled;
      if (cfg.Comment !== undefined) d.comentario = String(cfg.Comment);
      d.etag = "E" + hexAleatorio(13).toUpperCase(); // alterou, o ETag muda
      avisarClimb(
        d.ativo
          ? "Distribuição ligada. Na AWS real a mudança leva alguns minutos pra chegar em todas as bordas do mundo."
          : "Distribuição DESLIGADA. Ela ainda existe (e ainda aparece na lista) — desligar é o passo obrigatório antes de apagar."
      );
      return js({ Distribution: { Id: d.id, Status: "InProgress", DomainName: d.dominio,
        DistributionConfig: { Enabled: d.ativo, Origins: { Quantity: 1, Items: [{ Id: d.origem, DomainName: d.origem }] } } },
        ETag: d.etag });
    },

    "delete-distribution": (conta, pos, flags) => {
      const d = distDe(conta, flags, "DeleteDistribution");
      exigirIfMatch(d, flags, "DeleteDistribution");
      if (d.ativo) {
        throw new ErroCli(
          "An error occurred (DistributionNotDisabled) when calling the DeleteDistribution operation: " +
          "The distribution you are trying to delete has not been disabled.\n" +
          "Apagar CDN é em DOIS passos: primeiro desligue (update-distribution com Enabled:false), depois apague."
        );
      }
      delete conta.cloudfront.distribuicoes[d.id];
      avisarClimb("Distribuição apagada. O domínio d***.cloudfront.net some junto — quem tinha o link antigo passa a receber erro.");
      return okSilencioso(`Distribuição ${d.id} apagada.`);
    },

    "get-invalidation": (conta, pos, flags) => {
      const d = distDe(conta, flags, "GetInvalidation", "distribution-id");
      const id = String(exigirFlag(flags, "id"));
      const inv = (d.invalidacoes || []).find((i) => i.id === id);
      if (!inv) throw new ErroCli(`An error occurred (NoSuchInvalidation) when calling the GetInvalidation operation: The specified invalidation does not exist.`);
      return js({ Invalidation: {
        Id: inv.id, Status: "Completed", CreateTime: inv.criadoEm,
        InvalidationBatch: { Paths: { Quantity: inv.caminhos.length, Items: inv.caminhos }, CallerReference: hexAleatorio(8) },
      } });
    },

    "list-cache-policies": (conta, pos, flags) => {
      const tipo = flags.type ? String(flags.type) : "managed";
      avisarClimb(
        "Política de cache decide DUAS coisas: por quanto tempo a borda guarda o objeto (TTL) e o que entra na " +
        "chave do cache (query string, cookie, cabeçalho). CachingOptimized é o padrão pra site estático; " +
        "CachingDisabled (TTL 0) é pra conteúdo dinâmico, que não pode ser servido repetido."
      );
      return js({ CachePolicyList: {
        MaxItems: 100, Quantity: POLITICAS_GERENCIADAS.length,
        Items: POLITICAS_GERENCIADAS.map((p) => ({
          Type: tipo,
          CachePolicy: { Id: p.id, LastModifiedTime: agoraIso(), CachePolicyConfig: {
            Name: p.nome, MinTTL: p.min, DefaultTTL: p.padrao, MaxTTL: p.max } },
        })),
      } });
    },
  });

  // ---------------- manuais ----------------
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => `USO\n    ${uso}\n\n${txt}`;
    Object.assign(MANUAIS, {
      cloudfront: `aws cloudfront — CDN (rede de entrega de conteúdo)\n\nCopia seu conteúdo pra servidores espalhados pelo mundo: quem acessa do\nJapão pega do Japão, não da Virgínia. Mais rápido pra quem acessa e\nmais barato que servir tudo da origem.\n\nETag — A TRAVA\n    Toda alteração exige --if-match com o ETag ATUAL. Pegue-o no\n    get-distribution-config. Ele MUDA a cada alteração: é assim que a AWS\n    impede dois times de sobrescrever a config um do outro.\n\nAPAGAR É EM DOIS PASSOS\n    1) update-distribution com Enabled:false   (desliga)\n    2) delete-distribution                     (apaga)\n    Tentar apagar ligada devolve DistributionNotDisabled.\n\nCOMANDOS\n    create-distribution, list-distributions, get-distribution,\n    get-distribution-config, update-distribution, delete-distribution,\n    create-invalidation, get-invalidation, list-invalidations,\n    list-cache-policies`,
      "cloudfront.get-distribution-config": M(
        "aws cloudfront get-distribution-config --id <id>",
        "Devolve a configuração E o ETag. É o primeiro passo obrigatório de\nqualquer alteração: sem o ETag atual você não consegue atualizar nem\napagar a distribuição."),
      "cloudfront.update-distribution": M(
        `aws cloudfront update-distribution --id <id> --if-match <etag> \\\n        --distribution-config '{"Enabled":false}'`,
        "Altera a distribuição. Exige o ETag atual no --if-match; se não bater,\nvolta PreconditionFailed (alguém mexeu antes de você).\n\nDIFERENÇA PRA AWS REAL: lá você manda a config INTEIRA (pegue com\nget-distribution-config, edite o campo e devolva tudo). Aqui o simulador\naceita só o campo que muda, pra caber numa linha."),
      "cloudfront.delete-distribution": M(
        "aws cloudfront delete-distribution --id <id> --if-match <etag>",
        "Apaga a distribuição — e só funciona se ela estiver DESLIGADA.\nDesligue antes com update-distribution e Enabled:false."),
      "cloudfront.get-invalidation": M(
        "aws cloudfront get-invalidation --distribution-id <id> --id <id-da-invalidacao>",
        "Status de UMA invalidação (InProgress ou Completed) e quais caminhos\nela limpou. O list mostra o histórico; este mostra o detalhe."),
      "cloudfront.list-cache-policies": M(
        "aws cloudfront list-cache-policies --type managed",
        "Lista as políticas de cache. As gerenciadas pela AWS já vêm prontas:\n    Managed-CachingOptimized   TTL padrão 24h — site estático\n    Managed-CachingDisabled    TTL 0 — conteúdo dinâmico\nA política decide o TTL e o que entra na chave do cache (query string,\ncookie, cabeçalho)."),
    });
  }

  // ---------------- porquês ----------------
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "cloudfront.get-distribution-config": "é de onde sai o ETag, a \"versão\" da distribuição. Sem ele você não altera nem apaga nada — é o primeiro passo de toda mudança.",
      "cloudfront.update-distribution": "altera a CDN, e exige o ETag atual. Essa trava é o que impede dois times de sobrescreverem a configuração um do outro sem ninguém perceber.",
      "cloudfront.delete-distribution": "apaga a distribuição, e só aceita se ela estiver desligada. A AWS obriga os dois passos porque apagar CDN em produção por engano derruba o site inteiro.",
      "cloudfront.get-invalidation": "mostra se aquela limpeza específica já terminou. Enquanto está InProgress, parte do mundo ainda vê o conteúdo antigo.",
      "cloudfront.list-cache-policies": "mostra as políticas de cache prontas da AWS. Elas decidem por quanto tempo a borda guarda o objeto e o que entra na chave do cache — é o que separa site rápido de site servindo página velha.",
    });
  }

  // ---------------- atividades ----------------
  const dists = (c) => Object.values(((c.cloudfront || {}).distribuicoes) || {});

  const NOVOS = [
    { id: "cf-6", servico: "cloudfront", nivel: 3, xp: 85, titulo: "Aquela limpeza já terminou?",
      descricao: "Você pediu a limpeza do cache e o time pergunta se já valeu. Enquanto a invalidação está <b>InProgress</b>, parte do mundo ainda vê a versão antiga. <b>Consulte</b> a invalidação que você criou.",
      dicas: ["`get-…` mostra UM item pelo id — veja a lista de comandos com: aws cloudfront help", "São dois identificadores: a distribuição e a invalidação. A forma é: aws cloudfront get-invalidation --distribution-id <id> --id <id-da-invalidação>"],
      solucao: ["aws cloudfront get-invalidation --distribution-id <dist-id> --id <inv-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cloudfront", "get-invalidation") },

    { id: "cf-7", servico: "cloudfront", nivel: 3, xp: 80, titulo: "Quanto tempo a borda guarda?",
      descricao: "O site está servindo página velha e alguém sugere \"diminuir o cache\". Antes de inventar configuração, veja as <b>políticas de cache</b> que a AWS já entrega prontas — elas decidem o TTL e o que entra na chave do cache.",
      dicas: ["`list-…` mostra o que existe — veja a lista de comandos com: aws cloudfront help", "A forma do comando é: aws cloudfront list-cache-policies --type managed"],
      solucao: ["aws cloudfront list-cache-policies --type managed"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cloudfront", "list-cache-policies") },

    { id: "cf-8", servico: "cloudfront", nivel: 3, xp: 75, titulo: "Pegue o ETag da distribuição",
      descricao: "Toda alteração no CloudFront exige o <b>ETag</b> — a \"versão\" atual da distribuição. É a trava que impede dois times de sobrescreverem a configuração um do outro. <b>Pegue a configuração</b> (e com ela o ETag).",
      dicas: ["`get-…-config` traz a configuração junto com o ETag — veja a lista de comandos com: aws cloudfront help", "A forma do comando é: aws cloudfront get-distribution-config --id <id>"],
      solucao: ["aws cloudfront get-distribution-config --id <dist-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cloudfront", "get-distribution-config") },

    { id: "cf-9", servico: "cloudfront", nivel: 3, xp: 115, titulo: "Desligue a CDN",
      descricao: "O site vai sair do ar e a CDN precisa ser aposentada. <b>Não existe apagar direto:</b> primeiro você <b>desliga</b>. Use o ETag que acabou de pegar no <code>--if-match</code>. <small>(se o ETag não bater, a AWS recusa — alguém mexeu antes de você)</small>",
      dicas: ["`update-…` altera o recurso, e aqui ele exige o --if-match com o ETag atual.", "A forma é: aws cloudfront update-distribution --id <id> --if-match <etag> --distribution-config '{\"Enabled\":false}'"],
      solucao: ["aws cloudfront update-distribution --id <dist-id> --if-match <etag> --distribution-config '{\"Enabled\":false}'"],
      validar: (c) => dists(c).some((d) => d.ativo === false) },

    { id: "cf-10", servico: "cloudfront", nivel: 3, xp: 100, titulo: "Agora sim, apague",
      descricao: "Com a distribuição <b>desligada</b>, o segundo passo funciona. <b>Apague</b> a distribuição — lembrando de pegar o ETag de novo, porque ele <b>mudou</b> quando você desligou. <small>(tentar apagar ligada devolve DistributionNotDisabled)</small>",
      dicas: ["O ETag muda a cada alteração — pegue o novo antes de apagar.", "A forma é: aws cloudfront delete-distribution --id <id> --if-match <etag>"],
      solucao: [
        "aws cloudfront get-distribution-config --id <dist-id>",
        "aws cloudfront delete-distribution --id <dist-id> --if-match <etag>",
      ],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cloudfront", "delete-distribution") && !dists(c).some((d) => d.origem === "meu-site-climb.s3.amazonaws.com") },

    { id: "cf-proj", servico: "cloudfront", tipo: "projeto", nivel: 3, xp: 340,
      titulo: "🌎 Projeto: site global do começo ao fim",
      descricao: "Uma campanha vai ao ar por duas semanas e depois some. Você cuida do ciclo inteiro da CDN: <b>publicar</b> a distribuição da campanha, <b>limpar o cache</b> quando o time trocar o banner, <b>conferir</b> que a limpeza terminou e, no fim, <b>desligar e apagar</b> — os dois passos, com o ETag certo em cada um. Faça em qualquer ordem: o checklist marca sozinho.",
      dicas: [
        "É o ciclo que você praticou: create-distribution → create-invalidation → get-invalidation → get-distribution-config → update (Enabled:false) → get-distribution-config de novo → delete.",
        "O ETag MUDA quando você desliga: pegue de novo antes de apagar, senão volta PreconditionFailed.",
      ],
      solucao: [
        "aws cloudfront create-distribution --origin-domain-name campanha-climb.s3.amazonaws.com",
        'aws cloudfront create-invalidation --distribution-id <dist-id> --paths "/*"',
        "aws cloudfront list-invalidations --id <dist-id>",
        "aws cloudfront get-distribution-config --id <dist-id>",
        "aws cloudfront update-distribution --id <dist-id> --if-match <etag> --distribution-config '{\"Enabled\":false}'",
        "aws cloudfront get-distribution-config --id <dist-id>",
        "aws cloudfront delete-distribution --id <dist-id> --if-match <etag>",
      ],
      etapas: [
        { texto: "Publicar a distribuição da campanha (origem campanha-climb.s3.amazonaws.com)", validar: (c) => dists(c).some((d) => d.origem === "campanha-climb.s3.amazonaws.com") || !!((c.cloudfront || {}).campanhaApagada) },
        { texto: "Limpar o cache da campanha", validar: (c) => dists(c).some((d) => d.origem === "campanha-climb.s3.amazonaws.com" && (d.invalidacoes || []).length > 0) || !!((c.cloudfront || {}).campanhaApagada) },
        { texto: "Desligar a distribuição antes de apagar", validar: (c) => dists(c).some((d) => d.origem === "campanha-climb.s3.amazonaws.com" && d.ativo === false) || !!((c.cloudfront || {}).campanhaApagada) },
        { texto: "Apagar a distribuição da campanha", validar: (c) => !!((c.cloudfront || {}).campanhaApagada) },
      ] },
  ];

  // O delete precisa deixar rastro pra etapa final do projeto: depois de apagar
  // não sobra estado nenhum pra checar (etapa de projeto valida por ESTADO, não
  // pelo comando do momento).
  const apagarOriginal = SERVICOS.cloudfront["delete-distribution"];
  SERVICOS.cloudfront["delete-distribution"] = function (conta, pos, flags) {
    const alvo = ((conta.cloudfront || {}).distribuicoes || {})[String(flags.id || "")];
    const eraCampanha = !!alvo && alvo.origem === "campanha-climb.s3.amazonaws.com";
    const teveInvalidacao = !!alvo && (alvo.invalidacoes || []).length > 0;
    const r = apagarOriginal(conta, pos, flags);
    if (eraCampanha && teveInvalidacao) conta.cloudfront.campanhaApagada = true;
    return r;
  };

  if (typeof DESAFIOS !== "undefined") {
    let i = -1;
    for (let k = 0; k < DESAFIOS.length; k++) if (DESAFIOS[k].servico === "cloudfront") i = k;
    if (i >= 0) DESAFIOS.splice(i + 1, 0, ...NOVOS);
    else for (const d of NOVOS) DESAFIOS.push(d);
  }
})();
