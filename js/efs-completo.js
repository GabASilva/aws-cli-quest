"use strict";
// ============================================================
// CLImb — efs-completo.js
// A trilha do EFS criava o disco, o ponto de montagem e apagava. Faltava tudo
// o que se faz com ele DEPOIS de montado — e é aí que estão os dois argumentos
// que fazem alguém escolher EFS:
//
//   CICLO DE VIDA — arquivo que ninguém abre há 30 dias desce sozinho pra uma
//        classe mais barata. Num disco compartilhado de time, a maior parte
//        dos arquivos é exatamente isso: coisa que ninguém toca mais.
//   ACCESS POINT — em vez de cada aplicação montar a raiz do disco e enxergar
//        tudo, cada uma entra por uma porta própria, já dentro da sua pasta e
//        com o usuário certo. É o jeito de várias aplicações dividirem um EFS
//        sem uma pisar na outra.
//   BACKUP — disco compartilhado sem backup é um apagão de pasta longe de
//        virar incidente.
//
// TAMBÉM CORRIGE UMA ORDEM ERRADA HERDADA: o cob-efs-1 ("onde o disco está
// acessível?") estava DEPOIS do efs-4, que apaga o disco — a atividade vinha
// depois de o recurso dela deixar de existir. Ele volta pra junto do
// create-mount-target, que é o que ele reforça.
//
// Comandos conferidos na referência oficial (aws efs).
// CARREGA DEPOIS das coberturas: precisa do cob-efs-1 já em DESAFIOS pra movê-lo.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.efs) return;

  function st(conta) {
    conta.efs = conta.efs || { sistemas: {}, alvos: {} };
    conta.efs.sistemas = conta.efs.sistemas || {};
    conta.efs.alvos = conta.efs.alvos || {};
    conta.efs.pontos = conta.efs.pontos || {};
    return conta.efs;
  }
  function fsDe(conta, flags, op) {
    const s = st(conta);
    const id = String(exigirFlag(flags, "file-system-id"));
    const f = s.sistemas[id] || Object.values(s.sistemas).find((x) => x.token === id);
    if (!f) throw new ErroCli(`An error occurred (FileSystemNotFound) when calling the ${op} operation: File system '${id}' does not exist.`);
    return f;
  }

  Object.assign(SERVICOS.efs, {
    "put-lifecycle-configuration": (conta, pos, flags) => {
      const f = fsDe(conta, flags, "PutLifecycleConfiguration");
      const bruto = String(exigirFlag(flags, "lifecycle-policies"));
      let politicas;
      if (bruto.trim().startsWith("[")) {
        try { politicas = JSON.parse(bruto); } catch (e) { throw new ErroCli("Error parsing parameter '--lifecycle-policies': Invalid JSON received."); }
      } else {
        politicas = bruto.split(/\s+/).map((p) => parsearShorthand(p)).filter((o) => Object.keys(o).length);
      }
      if (!politicas.length) throw new ErroCli("An error occurred (BadRequest) when calling the PutLifecycleConfiguration operation: Lifecycle policies can't be empty.");
      f.cicloVida = politicas;
      avisarClimb(
        "Arquivo que ninguém abre há semanas desce sozinho pra uma classe mais barata (Infrequent Access). " +
        "Num disco de time isso é a MAIOR parte do conteúdo — e a conta cai bastante. O arquivo continua lá " +
        "e continua abrindo; só custa menos por mês e um pouquinho mais por leitura."
      );
      return js({ LifecyclePolicies: politicas });
    },

    "describe-lifecycle-configuration": (conta, pos, flags) => {
      const f = fsDe(conta, flags, "DescribeLifecycleConfiguration");
      return js({ LifecyclePolicies: f.cicloVida || [] });
    },

    "create-access-point": (conta, pos, flags) => {
      const s = st(conta);
      const f = fsDe(conta, flags, "CreateAccessPoint");
      const id = "fsap-0" + hexAleatorio(15);
      const raiz = flags["root-directory"] ? parsearShorthand(String(flags["root-directory"])) : {};
      s.pontos[id] = {
        id, fs: f.id,
        caminho: raiz.Path || "/",
        token: flags["client-token"] ? String(flags["client-token"]) : "",
      };
      avisarClimb(
        "Access point é a porta de entrada de UMA aplicação no disco: ela monta e já cai dentro da pasta dela, " +
        "com o usuário certo, sem enxergar o resto. É assim que várias aplicações dividem o mesmo EFS sem uma " +
        "pisar na outra — e sem depender de todo mundo lembrar de montar o caminho certo."
      );
      return js({
        AccessPointId: id, FileSystemId: f.id,
        RootDirectory: { Path: s.pontos[id].caminho },
        LifeCycleState: "creating",
        AccessPointArn: `arn:aws:elasticfilesystem:us-east-1:123456789012:access-point/${id}`,
      });
    },

    "describe-access-points": (conta, pos, flags) => {
      const s = st(conta);
      const alvo = flags["file-system-id"] ? String(flags["file-system-id"]) : null;
      const lista = Object.values(s.pontos).filter((p) => !alvo || p.fs === alvo);
      return js({ AccessPoints: lista.map((p) => ({
        AccessPointId: p.id, FileSystemId: p.fs,
        RootDirectory: { Path: p.caminho }, LifeCycleState: "available",
      })) });
    },

    "put-backup-policy": (conta, pos, flags) => {
      const f = fsDe(conta, flags, "PutBackupPolicy");
      const pol = parsearShorthand(String(exigirFlag(flags, "backup-policy")));
      const status = String(pol.Status || "").toUpperCase();
      if (!["ENABLED", "DISABLED"].includes(status)) {
        throw new ErroCli("An error occurred (ValidationException) when calling the PutBackupPolicy operation: Status must be ENABLED or DISABLED.");
      }
      f.backup = status === "ENABLED";
      avisarClimb(
        f.backup
          ? "Backup ligado. Disco compartilhado sem backup é um \"apagou a pasta errada\" longe de virar incidente — e no EFS não existe lixeira."
          : "Backup DESLIGADO. Você está economizando alguns centavos e apostando que ninguém vai apagar nada por engano."
      );
      return js({ BackupPolicy: { Status: status } });
    },

    "describe-backup-policy": (conta, pos, flags) => {
      const f = fsDe(conta, flags, "DescribeBackupPolicy");
      return js({ BackupPolicy: { Status: f.backup ? "ENABLED" : "DISABLED" } });
    },
  });

  // ---------------- manuais ----------------
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => `USO\n    ${uso}\n\n${txt}`;
    Object.assign(MANUAIS, {
      "efs.put-lifecycle-configuration": M(
        "aws efs put-lifecycle-configuration --file-system-id <fs-id> \\\n        --lifecycle-policies TransitionToIA=AFTER_30_DAYS",
        "Move sozinho pra classe mais barata (Infrequent Access) o arquivo que\nninguém abre há N dias. O arquivo continua lá e continua abrindo: custa\nmenos por mês e um pouco mais por leitura.\n\nVALORES: AFTER_7_DAYS, AFTER_14_DAYS, AFTER_30_DAYS, AFTER_60_DAYS,\nAFTER_90_DAYS."),
      "efs.describe-lifecycle-configuration": M(
        "aws efs describe-lifecycle-configuration --file-system-id <fs-id>",
        "Mostra a regra de ciclo de vida que está valendo. Resposta vazia quer\ndizer que NADA está sendo movido — tudo fica na classe cara."),
      "efs.create-access-point": M(
        "aws efs create-access-point --file-system-id <fs-id> \\\n        --root-directory Path=/app-relatorios",
        "Cria uma porta de entrada pra UMA aplicação: ela monta e já cai dentro\nda pasta dela, sem enxergar o resto do disco.\nÉ como várias aplicações dividem o mesmo EFS sem uma pisar na outra."),
      "efs.describe-access-points": M(
        "aws efs describe-access-points --file-system-id <fs-id>",
        "Lista os pontos de acesso e a pasta raiz de cada um."),
      "efs.put-backup-policy": M(
        "aws efs put-backup-policy --file-system-id <fs-id> --backup-policy Status=ENABLED",
        "Liga (ou desliga) o backup automático do file system.\nNo EFS não existe lixeira: sem backup, pasta apagada por engano não volta."),
      "efs.describe-backup-policy": M(
        "aws efs describe-backup-policy --file-system-id <fs-id>",
        "Diz se o backup automático está ligado."),
    });
  }

  // ---------------- porquês ----------------
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "efs.put-lifecycle-configuration": "faz o arquivo esquecido descer sozinho pra uma classe mais barata. Num disco de time a maior parte do conteúdo é exatamente isso — e é onde a conta do EFS encolhe.",
      "efs.describe-lifecycle-configuration": "mostra se alguma regra de economia está de pé. Resposta vazia significa que tudo está na classe cara, pagando preço cheio.",
      "efs.create-access-point": "dá a cada aplicação uma porta própria, já dentro da pasta dela. É o que permite várias aplicações dividirem o mesmo disco sem enxergar (nem apagar) o que é da outra.",
      "efs.describe-access-points": "lista as portas de entrada e a pasta de cada uma — o mapa de quem enxerga o quê no disco.",
      "efs.put-backup-policy": "liga o backup do disco compartilhado. No EFS não existe lixeira: sem isto, a pasta apagada por engano não volta.",
      "efs.describe-backup-policy": "diz se o backup está ligado. É a pergunta que ninguém faz antes do acidente.",
    });
  }

  // ---------------- atividades ----------------
  const sis = (c) => Object.values(((c.efs || {}).sistemas) || {});
  const pontos = (c) => Object.values(((c.efs || {}).pontos) || {});

  const NOVAS = [
    { id: "efs-5", servico: "efs", nivel: 3, xp: 100, titulo: "Arquivo esquecido não pode custar caro",
      descricao: "O disco do time cresceu e a maior parte é coisa que ninguém abre há meses. Ligue o <b>ciclo de vida</b> pra mover pra classe mais barata o que ficar <b>30 dias</b> sem ser aberto. <small>(o arquivo continua lá e continua abrindo — só custa menos por mês)</small>",
      dicas: ["`put-lifecycle-configuration` define a regra; ela vai na forma abreviada.", "A forma é: aws efs put-lifecycle-configuration --file-system-id <id> --lifecycle-policies TransitionToIA=AFTER_30_DAYS"],
      solucao: ["aws efs put-lifecycle-configuration --file-system-id <fs-id> --lifecycle-policies TransitionToIA=AFTER_30_DAYS"],
      validar: (c) => sis(c).some((f) => Array.isArray(f.cicloVida) && f.cicloVida.length > 0) },

    { id: "efs-6", servico: "efs", nivel: 3, xp: 75, titulo: "Tem regra de economia mesmo?",
      descricao: "Antes de dizer na reunião que o custo vai cair, <b>confirme</b> que a regra está valendo. <small>(resposta vazia quer dizer que nada está sendo movido — tudo continua na classe cara)</small>",
      dicas: ["`describe-…` mostra a configuração atual — veja a lista de comandos com: aws efs help", "A forma é: aws efs describe-lifecycle-configuration --file-system-id <id>"],
      solucao: ["aws efs describe-lifecycle-configuration --file-system-id <fs-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "efs", "describe-lifecycle-configuration") },

    { id: "efs-7", servico: "efs", nivel: 3, xp: 110, titulo: "Cada aplicação na sua pasta",
      descricao: "Três aplicações vão dividir o mesmo disco, e nenhuma pode enxergar (nem apagar) o que é da outra. Crie um <b>ponto de acesso</b> que entra direto em <b>/app-relatorios</b>.",
      dicas: ["`create-access-point` cria a porta de entrada; a pasta vai em Path=...", "A forma é: aws efs create-access-point --file-system-id <id> --root-directory Path=/app-relatorios"],
      solucao: ["aws efs create-access-point --file-system-id <fs-id> --root-directory Path=/app-relatorios"],
      validar: (c) => pontos(c).some((p) => p.caminho === "/app-relatorios") },

    { id: "efs-8", servico: "efs", nivel: 3, xp: 80, titulo: "Quem enxerga o quê no disco",
      descricao: "Auditoria: <b>liste os pontos de acesso</b> do file system pra saber qual aplicação entra em qual pasta.",
      dicas: ["`describe-…` lista os pontos de acesso — veja a lista de comandos com: aws efs help", "A forma é: aws efs describe-access-points --file-system-id <id>"],
      solucao: ["aws efs describe-access-points --file-system-id <fs-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "efs", "describe-access-points") },

    { id: "efs-9", servico: "efs", nivel: 3, xp: 90, titulo: "No EFS não existe lixeira",
      descricao: "Alguém apagou a pasta errada num disco compartilhado — e no EFS não tem lixeira pra desfazer. <b>Ligue o backup automático</b> do file system antes que isso aconteça de verdade.",
      dicas: ["`put-backup-policy` liga o backup; o valor vai em Status=ENABLED.", "A forma é: aws efs put-backup-policy --file-system-id <id> --backup-policy Status=ENABLED"],
      solucao: ["aws efs put-backup-policy --file-system-id <fs-id> --backup-policy Status=ENABLED"],
      validar: (c) => sis(c).some((f) => f.backup === true) },
  ];

  const PROJETO = { id: "efs-proj", servico: "efs", tipo: "projeto", nivel: 3, xp: 330,
    titulo: "🗂️ Projeto: disco compartilhado do time, como se deve",
    descricao: "O time de dados vai passar a trabalhar num disco só. Você entrega ele pronto: <b>criado</b>, com <b>ponto de montagem</b> na rede, uma <b>porta própria</b> pra aplicação de relatórios, <b>economia</b> ligada pro que ninguém abre mais e <b>backup</b> em dia. Faça em qualquer ordem — o checklist marca sozinho.",
    dicas: [
      "É o caminho que você praticou: create-file-system → create-mount-target → create-access-point → put-lifecycle-configuration → put-backup-policy.",
      "O disco do projeto usa o creation-token disco-do-time.",
    ],
    solucao: [
      "aws efs create-file-system --creation-token disco-do-time",
      "aws efs create-mount-target --file-system-id <fs-id> --subnet-id subnet-0abc12345def67890",
      "aws efs create-access-point --file-system-id <fs-id> --root-directory Path=/relatorios-time",
      "aws efs put-lifecycle-configuration --file-system-id <fs-id> --lifecycle-policies TransitionToIA=AFTER_30_DAYS",
      "aws efs put-backup-policy --file-system-id <fs-id> --backup-policy Status=ENABLED",
    ],
    etapas: [
      { texto: "Criar o file system disco-do-time", validar: (c) => sis(c).some((f) => f.token === "disco-do-time") },
      { texto: "Criar o ponto de montagem na sub-rede", validar: (c) => { const f = sis(c).find((x) => x.token === "disco-do-time"); return !!f && Object.values(((c.efs || {}).alvos) || {}).some((a) => a.fs === f.id); } },
      { texto: "Criar o ponto de acesso /relatorios-time", validar: (c) => pontos(c).some((p) => p.caminho === "/relatorios-time") },
      { texto: "Ligar o ciclo de vida (economia)", validar: (c) => { const f = sis(c).find((x) => x.token === "disco-do-time"); return !!f && Array.isArray(f.cicloVida) && f.cicloVida.length > 0; } },
      { texto: "Ligar o backup automático", validar: (c) => { const f = sis(c).find((x) => x.token === "disco-do-time"); return !!f && f.backup === true; } },
    ] };

  if (typeof DESAFIOS !== "undefined") {
    // 1) conserta a ordem herdada: o cob-efs-1 estava DEPOIS do efs-4, que
    //    apaga o disco — ele reforça o create-mount-target, então volta pra lá.
    const iCob = DESAFIOS.findIndex((d) => d.id === "cob-efs-1");
    if (iCob >= 0) {
      const [cob] = DESAFIOS.splice(iCob, 1);
      const iMount = DESAFIOS.findIndex((d) => d.id === "efs-3");
      if (iMount >= 0) DESAFIOS.splice(iMount + 1, 0, cob);
      else DESAFIOS.push(cob);
    }
    // 2) as novas entram ANTES do efs-4 (apagar é o fecho da trilha)
    const iLimpeza = DESAFIOS.findIndex((d) => d.id === "efs-4");
    if (iLimpeza >= 0) DESAFIOS.splice(iLimpeza, 0, ...NOVAS);
    else DESAFIOS.push(...NOVAS);
    // 3) o projeto cria o próprio disco e fecha a trilha
    let ultimo = -1;
    for (let k = 0; k < DESAFIOS.length; k++) if (DESAFIOS[k].servico === "efs") ultimo = k;
    if (ultimo >= 0) DESAFIOS.splice(ultimo + 1, 0, PROJETO);
    else DESAFIOS.push(PROJETO);
  }
})();
