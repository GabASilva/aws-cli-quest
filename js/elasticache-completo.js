"use strict";
// ============================================================
// CLImb — elasticache-completo.js
// A trilha tinha 3 atividades: listar, criar um Redis de um nó e apagar. Um
// cache de um nó só é exatamente o que ninguém deve colocar em produção — e a
// trilha não contava isso. O que faltava:
//
//   SUBNET GROUP — cache não vive solto: ele mora em sub-redes da SUA VPC, e é
//        o subnet group que diz quais. Em conta de verdade este é o primeiro
//        passo, não um detalhe.
//   REPLICATION GROUP — Redis com réplica e failover automático. Cache de um
//        nó que cai leva TODO o tráfego pro banco de uma vez; é assim que uma
//        queda de cache derruba o sistema inteiro.
//   SNAPSHOT — cache é memória, e memória some. Sem snapshot, reiniciar
//        significa começar do zero e martelar o banco até reaquecer.
//   EVENTOS — failover, manutenção e nó substituído aparecem aqui. É onde se
//        descobre o que aconteceu às 3 da manhã.
//
// Comandos conferidos na referência oficial (aws elasticache).
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.elasticache) return;

  // No CLI real, --subnet-ids aceita VÁRIAS sub-redes seguidas; no simulador
  // ela não estava na lista de flags multi-valor, então só a primeira era
  // capturada — e um subnet group com duas sub-redes nascia com uma. Nenhum
  // outro comando do projeto usa esta flag, então incluí-la não muda nada
  // existente. Aditivo: o Set é mutável, não é preciso editar o simulador.js.
  if (typeof FLAGS_MULTI_VALOR !== "undefined") FLAGS_MULTI_VALOR.add("subnet-ids");

  function st(conta) {
    conta.elasticache = conta.elasticache || { clusters: {} };
    conta.elasticache.clusters = conta.elasticache.clusters || {};
    conta.elasticache.subnetGroups = conta.elasticache.subnetGroups || {};
    conta.elasticache.grupos = conta.elasticache.grupos || {};
    conta.elasticache.snapshots = conta.elasticache.snapshots || {};
    conta.elasticache.eventos = conta.elasticache.eventos || [];
    return conta.elasticache;
  }
  // Semeado só quando alguém pergunta pelos eventos, pra usar o nome do
  // recurso que a pessoa realmente criou. Idempotente.
  function semearMadrugada(conta) {
    const s = st(conta);
    if (s.semeado) return;
    s.semeado = true;
    const alvo = Object.keys(s.grupos)[0] || Object.keys(s.clusters)[0] || "cache-loja";
    const atras = (h) => new Date(Date.now() - h * 3600000).toISOString();
    s.eventos.unshift(
      { origem: alvo, tipo: "cache-cluster", msg: "Failover concluído: réplica promovida a primário", quando: atras(3) },
      { origem: alvo, tipo: "cache-cluster", msg: "Nó substituído após falha de hardware", quando: atras(3.4) }
    );
  }
  function evento(conta, origem, tipo, msg) {
    st(conta).eventos.push({ origem, tipo, msg, quando: agoraIso() });
  }

  Object.assign(SERVICOS.elasticache, {
    "create-cache-subnet-group": (conta, pos, flags) => {
      const s = st(conta);
      const nome = String(exigirFlag(flags, "cache-subnet-group-name"));
      exigirFlag(flags, "cache-subnet-group-description");
      const brutas = [].concat(flags["subnet-ids"] || []);
      const subnets = brutas.filter((x) => x !== true).map(String);
      if (!subnets.length) throw new ErroCli("aws: error: the following arguments are required: --subnet-ids");
      for (const sn of subnets) {
        if (!/^subnet-/.test(sn)) throw new ErroCli(`An error occurred (InvalidSubnet) when calling the CreateCacheSubnetGroup operation: Subnet id inválido: '${sn}' (esperado algo como subnet-xxxxxxxx).`);
      }
      if (s.subnetGroups[nome]) throw new ErroCli(`An error occurred (CacheSubnetGroupAlreadyExists) when calling the CreateCacheSubnetGroup operation: Cache subnet group ${nome} already exists.`);
      s.subnetGroups[nome] = { nome, subnets, criadoEm: agoraIso() };
      avisarClimb(
        "O cache não fica solto na internet: ele mora em sub-redes da SUA VPC, e é o subnet group que diz " +
        "quais. Use sub-redes PRIVADAS e de zonas diferentes — cache exposto é banco de dados de graça pra " +
        "quem achar o endereço, e cache numa zona só cai junto com ela."
      );
      return js({ CacheSubnetGroup: {
        CacheSubnetGroupName: nome,
        CacheSubnetGroupDescription: String(flags["cache-subnet-group-description"]),
        Subnets: subnets.map((x) => ({ SubnetIdentifier: x })),
      } });
    },

    "describe-cache-subnet-groups": (conta) => {
      const s = st(conta);
      return js({ CacheSubnetGroups: Object.values(s.subnetGroups).map((g) => ({
        CacheSubnetGroupName: g.nome,
        Subnets: g.subnets.map((x) => ({ SubnetIdentifier: x })),
      })) });
    },

    "create-replication-group": (conta, pos, flags) => {
      const s = st(conta);
      const id = String(exigirFlag(flags, "replication-group-id"));
      exigirFlag(flags, "replication-group-description");
      if (s.grupos[id]) throw new ErroCli(`An error occurred (ReplicationGroupAlreadyExists) when calling the CreateReplicationGroup operation: Replication group ${id} already exists.`);
      const replicas = parseInt(flags["num-cache-clusters"] || "2", 10);
      const failover = flags["automatic-failover-enabled"] === true ||
        String(flags["automatic-failover-enabled"]) === "true" ||
        flags["automatic-failover-enabled"] === undefined ? true : false;
      if (replicas < 2 && failover) {
        throw new ErroCli(
          "An error occurred (InvalidParameterCombination) when calling the CreateReplicationGroup operation: " +
          "Automatic failover requires at least 2 cache clusters (1 primário + 1 réplica)."
        );
      }
      s.grupos[id] = { id, nos: replicas, failover, tipo: flags["cache-node-type"] || "cache.t3.micro", criadoEm: agoraIso() };
      evento(conta, id, "replication-group", "Replication group criado");
      avisarClimb(
        "Agora sim: um primário e réplicas, com failover automático. Cache de UM nó que cai joga todo o " +
        "tráfego no banco de uma vez — e é assim que uma queda de cache derruba o sistema inteiro. Com " +
        "réplica, a promoção acontece sozinha e a aplicação nem percebe."
      );
      return js({ ReplicationGroup: {
        ReplicationGroupId: id, Status: "creating",
        AutomaticFailover: failover ? "enabled" : "disabled",
        MemberClusters: Array.from({ length: replicas }, (_, i) => `${id}-00${i + 1}`),
      } });
    },

    "describe-replication-groups": (conta) => {
      const s = st(conta);
      return js({ ReplicationGroups: Object.values(s.grupos).map((g) => ({
        ReplicationGroupId: g.id, Status: "available",
        AutomaticFailover: g.failover ? "enabled" : "disabled",
        MemberClusters: Array.from({ length: g.nos }, (_, i) => `${g.id}-00${i + 1}`),
      })) });
    },

    "create-snapshot": (conta, pos, flags) => {
      const s = st(conta);
      const nome = String(exigirFlag(flags, "snapshot-name"));
      const origemCluster = flags["cache-cluster-id"] ? String(flags["cache-cluster-id"]) : "";
      const origemGrupo = flags["replication-group-id"] ? String(flags["replication-group-id"]) : "";
      if (!origemCluster && !origemGrupo) {
        throw new ErroCli("An error occurred (InvalidParameterCombination) when calling the CreateSnapshot operation: informe --cache-cluster-id ou --replication-group-id.");
      }
      if (origemCluster && !s.clusters[origemCluster]) throw new ErroCli(`An error occurred (CacheClusterNotFound) when calling the CreateSnapshot operation: Cache cluster ${origemCluster} not found.`);
      if (origemGrupo && !s.grupos[origemGrupo]) throw new ErroCli(`An error occurred (ReplicationGroupNotFoundFault) when calling the CreateSnapshot operation: Replication group ${origemGrupo} not found.`);
      s.snapshots[nome] = { nome, origem: origemCluster || origemGrupo, criadoEm: agoraIso() };
      evento(conta, origemCluster || origemGrupo, "snapshot", `Snapshot ${nome} criado`);
      avisarClimb(
        "Cache é memória, e memória some. Sem snapshot, reiniciar significa começar com o cache VAZIO — e " +
        "todo o tráfego bate no banco de uma vez até ele reaquecer. Esse é o famoso \"o cache subiu e o " +
        "banco caiu\"."
      );
      return js({ Snapshot: { SnapshotName: nome, SnapshotStatus: "creating", SnapshotSource: "manual", CacheClusterId: origemCluster || undefined, ReplicationGroupId: origemGrupo || undefined } });
    },

    "describe-snapshots": (conta, pos, flags) => {
      const s = st(conta);
      const alvo = flags["snapshot-name"] ? String(flags["snapshot-name"]) : null;
      const lista = Object.values(s.snapshots).filter((x) => !alvo || x.nome === alvo);
      return js({ Snapshots: lista.map((x) => ({
        SnapshotName: x.nome, SnapshotStatus: "available", SnapshotSource: "manual",
        NodeSnapshots: [{ CacheSize: "12 MB", SnapshotCreateTime: x.criadoEm }],
      })) });
    },

    "describe-events": (conta, pos, flags) => {
      const s = st(conta);
      semearMadrugada(conta);
      // No CLI real --duration é em MINUTOS e o padrão são 60: quem esquece a
      // flag olha só a última hora e conclui que "não houve nada".
      const minutos = flags.duration ? parseInt(flags.duration, 10) : 60;
      const corte = Date.now() - minutos * 60000;
      const dentro = s.eventos.filter((e) => Date.parse(e.quando) >= corte);
      const cortados = s.eventos.length - dentro.length;
      if (cortados > 0) {
        avisarClimb(
          "Sua janela pediu " + minutos + " minutos, então " + cortados + " evento(s) mais antigo(s) " +
          "ficaram de fora — inclusive os da madrugada. O padrão do CLI real é 60 minutos: é assim que " +
          "se olha pro lugar certo com a janela errada e se conclui que \"não houve nada\"."
        );
        return js({ Events: dentro.map((e) => ({
          SourceIdentifier: e.origem, SourceType: e.tipo, Message: e.msg, Date: e.quando,
        })) });
      }
      avisarClimb(
        "É aqui que se descobre o que aconteceu às 3 da manhã: failover, nó substituído, manutenção " +
        "aplicada. Quando alguém disser \"o sistema ficou lento de madrugada e ninguém mexeu em nada\", " +
        "este é o primeiro lugar pra olhar."
      );
      return js({ Events: dentro.map((e) => ({
        SourceIdentifier: e.origem, SourceType: e.tipo, Message: e.msg, Date: e.quando,
      })) });
    },
  });

  // Cluster criado/apagado também vira evento — senão o describe-events nasce
  // vazio e a atividade não teria o que mostrar.
  for (const nome of ["create-cache-cluster", "delete-cache-cluster"]) {
    const original = SERVICOS.elasticache[nome];
    SERVICOS.elasticache[nome] = function (conta, pos, flags) {
      const r = original(conta, pos, flags);
      try {
        evento(conta, String(flags["cache-cluster-id"] || ""), "cache-cluster",
          nome === "create-cache-cluster" ? "Cache cluster criado" : "Cache cluster removido");
      } catch (e) { /* acessório */ }
      return r;
    };
  }

  // ---------------- manuais ----------------
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => `USO\n    ${uso}\n\n${txt}`;
    Object.assign(MANUAIS, {
      "elasticache.create-cache-subnet-group": M(
        "aws elasticache create-cache-subnet-group --cache-subnet-group-name cache-privado \\\n        --cache-subnet-group-description \"Sub-redes privadas\" --subnet-ids subnet-aaa1 subnet-bbb2",
        "Diz em quais sub-redes da SUA VPC o cache pode viver.\n\nUse sub-redes PRIVADAS (cache exposto é banco de graça pra quem achar o\nendereço) e de zonas DIFERENTES (cache numa zona só cai junto com ela)."),
      "elasticache.describe-cache-subnet-groups": M(
        "aws elasticache describe-cache-subnet-groups",
        "Lista os subnet groups e as sub-redes de cada um."),
      "elasticache.create-replication-group": M(
        "aws elasticache create-replication-group --replication-group-id cache-loja-ha \\\n        --replication-group-description \"Redis com failover\" --num-cache-clusters 2",
        "Cria Redis com PRIMÁRIO + RÉPLICA e failover automático.\n\nPor que importa: cache de um nó que cai joga todo o tráfego no banco de\numa vez. Com réplica, a promoção acontece sozinha.\nFailover automático exige pelo menos 2 nós."),
      "elasticache.describe-replication-groups": M(
        "aws elasticache describe-replication-groups",
        "Mostra os grupos, o estado do failover e quem são os nós membros."),
      "elasticache.create-snapshot": M(
        "aws elasticache create-snapshot --snapshot-name backup-cache \\\n        --replication-group-id cache-loja-ha",
        "Salva o conteúdo do cache. Cache é memória: sem snapshot, reiniciar\nsignifica subir VAZIO e martelar o banco até reaquecer.\nA origem é --cache-cluster-id ou --replication-group-id."),
      "elasticache.describe-snapshots": M(
        "aws elasticache describe-snapshots",
        "Lista os snapshots, o tamanho e quando foram feitos."),
      "elasticache.describe-events": M(
        "aws elasticache describe-events --duration 1440",
        "Eventos do serviço: failover, nó substituído, manutenção aplicada.\nÉ o primeiro lugar pra olhar quando \"ficou lento de madrugada e ninguém\nmexeu em nada\". \n\nOPÇÕES ÚTEIS\n    --duration    janela em MINUTOS (padrão 60 — 24 horas são 1440)"),
    });
  }

  // ---------------- porquês ----------------
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "elasticache.create-cache-subnet-group": "diz em quais sub-redes o cache pode viver. É o que mantém o cache dentro da sua rede privada, em vez de exposto — cache aberto é banco de dados de graça pra quem achar o endereço.",
      "elasticache.describe-cache-subnet-groups": "mostra onde os caches podem nascer. Serve pra conferir se alguém não deixou uma sub-rede pública no meio.",
      "elasticache.create-replication-group": "cria o Redis com réplica e failover automático. É a diferença entre um cache que cai e é substituído sozinho e um que cai levando o banco junto.",
      "elasticache.describe-replication-groups": "mostra se o failover está mesmo ligado e quem são os nós. Achar que tem réplica e não ter é pior que não ter.",
      "elasticache.create-snapshot": "salva o conteúdo do cache. Sem isso, reiniciar significa subir vazio — e todo o tráfego bate no banco de uma vez até reaquecer.",
      "elasticache.describe-snapshots": "lista os backups do cache: quando foram feitos e de qual origem.",
      "elasticache.describe-events": "conta o que o serviço fez sozinho — failover, troca de nó, manutenção. É onde se descobre o que aconteceu de madrugada.",
    });
  }

  // ---------------- atividades ----------------
  const ec = (c) => (c.elasticache || {});
  const NOVAS = [
    { id: "cache-4", servico: "elasticache", nivel: 2, xp: 85, titulo: "Onde o cache pode morar",
      descricao: "Cache não fica solto na internet — ele vive em sub-redes da <b>sua</b> VPC. Crie o subnet group <b>cache-privado</b> com <b>duas sub-redes</b> (<b>subnet-aaa1</b> e <b>subnet-bbb2</b>). <small>(duas zonas diferentes: cache numa zona só cai junto com ela)</small>",
      dicas: ["`create-cache-subnet-group` define onde o cache pode nascer; o --subnet-ids aceita vários.", "A forma é: aws elasticache create-cache-subnet-group --cache-subnet-group-name <nome> --cache-subnet-group-description <texto> --subnet-ids subnet-aaa1 subnet-bbb2"],
      solucao: ['aws elasticache create-cache-subnet-group --cache-subnet-group-name cache-privado --cache-subnet-group-description "Sub-redes privadas do cache" --subnet-ids subnet-aaa1 subnet-bbb2'],
      validar: (c) => { const g = (ec(c).subnetGroups || {})["cache-privado"]; return !!g && g.subnets.length >= 2; } },

    { id: "cache-5", servico: "elasticache", nivel: 2, xp: 65, titulo: "Confira onde o cache pode nascer",
      descricao: "Antes de subir qualquer coisa, <b>liste os subnet groups</b> — é assim que se descobre se alguém deixou uma sub-rede pública no meio.",
      dicas: ["No ElastiCache o verbo de leitura é `describe-`, não `list-`. E o que você quer ver não é o cache: é o grupo de sub-redes onde ele pode nascer.", "O nome sai do que você acabou de criar, passado pro plural: `create-cache-subnet-group` tem um `describe-` correspondente. Não leva flag."],
      solucao: ["aws elasticache describe-cache-subnet-groups"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "elasticache", "describe-cache-subnet-groups") },

    { id: "cache-6", servico: "elasticache", nivel: 3, xp: 120, titulo: "Um cache que não derruba o banco",
      descricao: "O cache de <b>um nó só</b> que você subiu é exatamente o que não se coloca em produção: se ele cair, <b>todo</b> o tráfego vai pro banco de uma vez. Crie o <b>replication group</b> <b>cache-loja-ha</b> com <b>2 nós</b> — primário e réplica, com failover automático.",
      dicas: ["`create-replication-group` cria o Redis com réplica; failover automático exige pelo menos 2 nós.", "A forma é: aws elasticache create-replication-group --replication-group-id <id> --replication-group-description <texto> --num-cache-clusters 2"],
      solucao: ['aws elasticache create-replication-group --replication-group-id cache-loja-ha --replication-group-description "Redis com failover" --num-cache-clusters 2'],
      validar: (c) => { const g = (ec(c).grupos || {})["cache-loja-ha"]; return !!g && g.nos >= 2 && g.failover === true; } },

    { id: "cache-7", servico: "elasticache", nivel: 3, xp: 80, titulo: "O failover está mesmo ligado?",
      descricao: "Achar que tem réplica e não ter é pior do que não ter. <b>Confirme</b> o estado do grupo e do failover automático.",
      dicas: ["O que você quer conferir não é um cluster avulso — é o grupo com primário e réplica. Procure o `describe-` desse recurso.", "Na saída, o campo que responde à pergunta é `AutomaticFailover`: se vier `disabled`, o grupo subiu sem proteção e a réplica não vira primária sozinha."],
      solucao: ["aws elasticache describe-replication-groups"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "elasticache", "describe-replication-groups") },

    { id: "cache-8", servico: "elasticache", nivel: 3, xp: 95, titulo: "Cache que sobe vazio derruba o banco",
      descricao: "Cache é memória: reiniciar sem backup significa subir <b>vazio</b>, e aí todo o tráfego bate no banco até reaquecer. Faça um <b>snapshot</b> chamado <b>backup-cache-loja</b> do grupo <b>cache-loja-ha</b>.",
      dicas: ["`create-snapshot` salva o conteúdo; a origem pode ser um cluster ou um replication group.", "A forma é: aws elasticache create-snapshot --snapshot-name <nome> --replication-group-id <id>"],
      solucao: ["aws elasticache create-snapshot --snapshot-name backup-cache-loja --replication-group-id cache-loja-ha"],
      validar: (c) => !!(ec(c).snapshots || {})["backup-cache-loja"] },

    { id: "cache-9", servico: "elasticache", nivel: 3, xp: 70, titulo: "Quando foi o último backup?",
      descricao: "A pergunta que ninguém faz antes do acidente. <b>Liste os snapshots</b> e veja quando foram feitos.",
      dicas: ["Snapshot é um recurso da conta como outro qualquer: tem um `describe-` próprio e não exige flag.", "Na saída, confira duas coisas além do nome: a origem (`ReplicationGroupId`) e a data. Snapshot sem origem clara é snapshot que ninguém sabe restaurar na hora do aperto."],
      solucao: ["aws elasticache describe-snapshots"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "elasticache", "describe-snapshots") },

    { id: "cache-10", servico: "elasticache", nivel: 3, xp: 85, titulo: "O que aconteceu de madrugada",
      descricao: "O sistema ficou lento às <b>3 da manhã</b> e ninguém mexeu em nada. <b>Veja os eventos</b> do serviço na janela das últimas <b>24 horas</b> — failover, nó substituído e manutenção aparecem aqui. <small>(cuidado: a duração conta em MINUTOS, e sem a flag o padrão são só 60 — a madrugada ficaria de fora)</small>",
      dicas: ["`describe-events` mostra o que o serviço fez sozinho: failover, troca de nó, manutenção aplicada. É o primeiro lugar pra olhar quando ninguém mexeu em nada.", "A janela vai em `--duration`, contada em MINUTOS — faça a conta de 24 horas. Se pedir de menos, o evento da madrugada não aparece e você conclui que não houve nada."],
      solucao: ["aws elasticache describe-events --duration 1440"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "elasticache", "describe-events") && parseInt(cmd.flags.duration, 10) >= 1440 },
  ];

  const PROJETO = { id: "cache-proj", servico: "elasticache", tipo: "projeto", nivel: 3, xp: 340,
    titulo: "⚡ Projeto: cache de produção que aguenta cair",
    descricao: "A loja vai colocar cache na frente do banco — e dessa vez feito direito. Você entrega: as <b>sub-redes privadas</b> onde ele pode viver, um <b>Redis com réplica e failover</b>, um <b>snapshot</b> pra ele não subir vazio, e a <b>conferência</b> de que o failover está mesmo ligado. Faça em qualquer ordem — o checklist marca sozinho.",
    dicas: [
      "É o caminho que você praticou: create-cache-subnet-group → create-replication-group → create-snapshot → describe-replication-groups.",
      "O grupo do projeto é cache-checkout-ha e o snapshot é backup-checkout.",
    ],
    solucao: [
      'aws elasticache create-cache-subnet-group --cache-subnet-group-name checkout-privado --cache-subnet-group-description "Sub-redes do checkout" --subnet-ids subnet-aaa1 subnet-bbb2',
      'aws elasticache create-replication-group --replication-group-id cache-checkout-ha --replication-group-description "Cache do checkout" --num-cache-clusters 2',
      "aws elasticache create-snapshot --snapshot-name backup-checkout --replication-group-id cache-checkout-ha",
      "aws elasticache describe-replication-groups",
    ],
    etapas: [
      { texto: "Criar o subnet group checkout-privado com 2 sub-redes", validar: (c) => { const g = (ec(c).subnetGroups || {})["checkout-privado"]; return !!g && g.subnets.length >= 2; } },
      { texto: "Criar o replication group cache-checkout-ha com failover", validar: (c) => { const g = (ec(c).grupos || {})["cache-checkout-ha"]; return !!g && g.failover === true; } },
      { texto: "Fazer o snapshot backup-checkout", validar: (c) => !!(ec(c).snapshots || {})["backup-checkout"] },
    ] };

  if (typeof DESAFIOS !== "undefined") {
    // As novas entram ANTES do cache-3 (delete): apagar é o fecho da trilha.
    const iLimpeza = DESAFIOS.findIndex((d) => d.id === "cache-3");
    if (iLimpeza >= 0) DESAFIOS.splice(iLimpeza, 0, ...NOVAS);
    else DESAFIOS.push(...NOVAS);
    let ultimo = -1;
    for (let k = 0; k < DESAFIOS.length; k++) if (DESAFIOS[k].servico === "elasticache") ultimo = k;
    if (ultimo >= 0) DESAFIOS.splice(ultimo + 1, 0, PROJETO);
    else DESAFIOS.push(PROJETO);
  }
})();
