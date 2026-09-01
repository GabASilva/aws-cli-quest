"use strict";
// ============================================================
// CLImb — route53-completo.js
// O Route 53 tinha 5 comandos: criar zona, listar, ver registros, mudar
// registro e apagar a zona. Faltavam três coisas que aparecem em TODO
// trabalho real com DNS:
//
//   NAMESERVERS — criar a zona não coloca o domínio no ar. A AWS te dá 4
//        nameservers, e alguém precisa apontar o registrador pra eles. É o
//        passo esquecido em "criei a zona e o site não abre".
//   PROPAGAÇÃO — toda mudança de registro nasce PENDING e vira INSYNC. Quem
//        não sabe disso troca o IP e acha que quebrou, quando só não propagou.
//   HEALTH CHECK — o Route 53 sabe TIRAR do ar o servidor que caiu. Sem
//        verificação de saúde, o DNS continua mandando gente pro que morreu.
//
// Comandos conferidos na referência oficial (aws route53).
// ADITIVO: complementa SERVICOS.route53, MANUAIS e PORQUE.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.route53) return;

  function est(conta) {
    conta.route53 = conta.route53 || { zonas: {} };
    conta.route53.zonas = conta.route53.zonas || {};
    conta.route53.mudancas = conta.route53.mudancas || {};
    conta.route53.checks = conta.route53.checks || {};
    return conta.route53;
  }
  function zonaDe(conta, flags, op) {
    const st = est(conta);
    const bruto = String(exigirFlag(flags, "id")).replace(/^\/hostedzone\//, "");
    const z = st.zonas[bruto] || Object.values(st.zonas).find((x) => x.id === bruto || x.nome === bruto);
    if (!z) throw new ErroCli(`An error occurred (NoSuchHostedZone) when calling the ${op} operation: No hosted zone found with ID: ${bruto}`);
    return z;
  }

  // change-resource-record-sets já existia e devolvia um ChangeInfo com Status
  // PENDING — mas jogava o id fora. Agora ele é guardado, senão o get-change
  // não teria o que consultar. Wrap aditivo: não toca servicos-fase2.js.
  const mudarOriginal = SERVICOS.route53["change-resource-record-sets"];
  SERVICOS.route53["change-resource-record-sets"] = function (conta, pos, flags) {
    const saida = mudarOriginal(conta, pos, flags);
    try {
      const st = est(conta);
      const id = (String(saida).match(/"Id":\s*"\/change\/([A-Z0-9]+)"/) || [])[1];
      if (id) st.mudancas[id] = { id, criadoEm: agoraIso(), consultas: 0 };
    } catch (e) { /* o comando principal já respondeu; rastro é acessório */ }
    return saida;
  };

  Object.assign(SERVICOS.route53, {
    "get-hosted-zone": (conta, pos, flags) => {
      const z = zonaDe(conta, flags, "GetHostedZone");
      const base = z.id.toLowerCase().slice(0, 6);
      const ns = [
        `ns-${base.slice(0, 3)}.awsdns-01.com`, `ns-${base.slice(0, 3)}.awsdns-02.co.uk`,
        `ns-${base.slice(3, 6)}.awsdns-03.net`, `ns-${base.slice(3, 6)}.awsdns-04.org`,
      ];
      avisarClimb(
        "Repare nos 4 NAMESERVERS. Criar a zona NÃO coloca o domínio no ar: alguém precisa ir no " +
        "registrador (onde o domínio foi comprado) e apontar pra esses endereços. É o passo esquecido " +
        "em 90% dos \"criei a zona e o site não abre\"."
      );
      return js({
        HostedZone: { Id: `/hostedzone/${z.id}`, Name: z.nome, CallerReference: z.criadoEm || agoraIso(),
          Config: { PrivateZone: false }, ResourceRecordSetCount: (z.registros || []).length },
        DelegationSet: { NameServers: ns },
      });
    },

    "get-change": (conta, pos, flags) => {
      const st = est(conta);
      const id = String(exigirFlag(flags, "id")).replace(/^\/change\//, "");
      const m = st.mudancas[id];
      if (!m) throw new ErroCli(`An error occurred (NoSuchChange) when calling the GetChange operation: Could not find resource with ID: ${id}`);
      // 1ª consulta ainda PENDING, depois INSYNC — é como se comporta de verdade
      m.consultas++;
      const status = m.consultas >= 2 ? "INSYNC" : "PENDING";
      avisarClimb(
        status === "PENDING"
          ? "PENDING quer dizer que a mudança foi aceita mas ainda não chegou em todos os servidores do Route 53. Consulte de novo em instantes."
          : "INSYNC: a mudança chegou em TODOS os servidores do Route 53. Atenção: isso não é o mesmo que o mundo já ter esquecido o valor antigo — o TTL do registro ainda vale nos resolvedores por aí."
      );
      return js({ ChangeInfo: { Id: `/change/${m.id}`, Status: status, SubmittedAt: m.criadoEm } });
    },

    "create-health-check": (conta, pos, flags) => {
      const st = est(conta);
      exigirFlag(flags, "caller-reference");
      const bruto = String(exigirFlag(flags, "health-check-config"));
      const cfg = /^\{/.test(bruto) ? JSON.parse(bruto) : parsearShorthand(bruto);
      const tipo = String(cfg.Type || "HTTP").toUpperCase();
      if (!["HTTP", "HTTPS", "TCP"].includes(tipo)) {
        throw new ErroCli(`An error occurred (InvalidInput) when calling the CreateHealthCheck operation: Type must be one of HTTP, HTTPS, TCP.`);
      }
      const id = `${hexAleatorio(8)}-${hexAleatorio(4)}-${hexAleatorio(12)}`;
      st.checks[id] = { id, tipo, alvo: cfg.FullyQualifiedDomainName || cfg.IPAddress || "", caminho: cfg.ResourcePath || "/" };
      avisarClimb(
        "O health check é o que permite o DNS TIRAR do ar um servidor que caiu: o Route 53 fica batendo no seu " +
        "endereço e, quando ele para de responder, deixa de devolver aquele IP. Sem isso o DNS continua mandando " +
        "gente pro servidor morto — o domínio não sabe que ele morreu."
      );
      return js({ HealthCheck: {
        Id: id, CallerReference: String(flags["caller-reference"]),
        HealthCheckConfig: { Type: tipo, ResourcePath: st.checks[id].caminho,
          FullyQualifiedDomainName: st.checks[id].alvo, RequestInterval: 30, FailureThreshold: 3 },
        HealthCheckVersion: 1,
      } });
    },

    "delete-health-check": (conta, pos, flags) => {
      const st = est(conta);
      const id = String(exigirFlag(flags, "health-check-id"));
      if (!st.checks[id]) throw new ErroCli(`An error occurred (NoSuchHealthCheck) when calling the DeleteHealthCheck operation: A health check with id ${id} does not exist.`);
      delete st.checks[id];
      st.checkApagado = true; // rastro pro checklist do projeto (valida por estado)
      return okSilencioso(`Health check ${id} apagado.`);
    },
  });

  // ---------------- manuais ----------------
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => `USO\n    ${uso}\n\n${txt}`;
    Object.assign(MANUAIS, {
      "route53.get-hosted-zone": M(
        "aws route53 get-hosted-zone --id <id-da-zona>",
        "Detalhes da zona E os 4 NAMESERVERS dela.\n\nIMPORTANTE: criar a zona não coloca o domínio no ar. Você precisa ir no\nregistrador onde comprou o domínio e apontar pra esses nameservers.\nSem esse passo, a zona existe e ninguém a consulta."),
      "route53.get-change": M(
        "aws route53 get-change --id <id-da-mudanca>",
        "Status de uma mudança de registro:\n    PENDING   aceita, ainda chegando nos servidores do Route 53\n    INSYNC    já está em todos\n\nCUIDADO: INSYNC não quer dizer que o mundo já vê o valor novo. O TTL do\nregistro ainda vale nos resolvedores por aí — quem consultou antes\nsegue com a resposta antiga até o TTL expirar."),
      "route53.create-health-check": M(
        "aws route53 create-health-check --caller-reference ref-1 \\\n        --health-check-config Type=HTTP,FullyQualifiedDomainName=exemplo.com,ResourcePath=/",
        "Cria a verificação de saúde: o Route 53 fica batendo no endereço e,\nquando ele para de responder, deixa de devolver aquele IP.\nÉ o que faz o DNS tirar do ar um servidor caído.\n\nO caller-reference é seu, e serve pra você não criar duas vezes o mesmo\ncheck se o comando for repetido."),
      "route53.delete-health-check": M(
        "aws route53 delete-health-check --health-check-id <id>",
        "Apaga a verificação. Health check é cobrado por mês — esquecer um\nligado apontando pra um servidor que nem existe mais é desperdício comum."),
    });
  }

  // ---------------- porquês ----------------
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "route53.get-hosted-zone": "é onde estão os 4 nameservers da zona. Criar a zona não publica o domínio: sem apontar o registrador pra esses endereços, ninguém nunca consulta o que você configurou.",
      "route53.get-change": "diz se a mudança já chegou em todos os servidores do Route 53 (PENDING → INSYNC). É o que responde \"troquei o IP e não mudou nada\" antes de você sair mexendo em outra coisa.",
      "route53.create-health-check": "faz o DNS saber que um servidor caiu e parar de mandar gente pra ele. Sem verificação de saúde o domínio continua apontando pro que morreu.",
      "route53.delete-health-check": "remove a verificação — que é cobrada por mês. Health check esquecido apontando pra servidor que não existe mais é desperdício clássico.",
    });
  }

  // ---------------- atividades ----------------
  const checks = (c) => Object.values(((c.route53 || {}).checks) || {});

  const ANTES_DA_LIMPEZA = [
    { id: "r53-7", servico: "route53", nivel: 3, xp: 75, titulo: "Por que o site ainda não abre?",
      descricao: "A zona está criada, os registros estão certos e o site <b>continua fora do ar</b>. Falta o passo que todo mundo esquece: apontar o <b>registrador</b> pros nameservers da AWS. <b>Veja os detalhes da zona</b> pra descobrir quais são.",
      dicas: ["`get-…` mostra UM recurso pelo id — veja a lista de comandos com: aws route53 help", "A forma do comando é: aws route53 get-hosted-zone --id <id-da-zona>"],
      solucao: ["aws route53 get-hosted-zone --id <zone-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "route53", "get-hosted-zone") },

    { id: "r53-8", servico: "route53", nivel: 3, xp: 90, titulo: "Já propagou?",
      descricao: "Você trocou o registro e o time pergunta se já valeu. Toda mudança no Route 53 nasce <b>PENDING</b> e vira <b>INSYNC</b>. <b>Consulte o estado</b> da mudança que você fez. <small>(o id vem no ChangeInfo da resposta do change-resource-record-sets)</small>",
      dicas: ["`get-change` consulta o andamento de uma alteração — veja a lista de comandos com: aws route53 help", "A forma do comando é: aws route53 get-change --id <id-da-mudança>"],
      solucao: ["aws route53 get-change --id <change-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "route53", "get-change") },

    { id: "r53-9", servico: "route53", nivel: 3, xp: 110, titulo: "Que o DNS perceba quando cair",
      descricao: "Se o servidor cair, o DNS continua mandando gente pra ele — o domínio não sabe que ele morreu. Crie uma <b>verificação de saúde</b> HTTP pra <b>loja-climb.com.br</b>, batendo na raiz <b>/</b>.",
      dicas: ["`create-health-check` cria a verificação; a configuração vai em forma abreviada (Chave=Valor,Chave=Valor).", "A forma é: aws route53 create-health-check --caller-reference <sua-ref> --health-check-config Type=HTTP,FullyQualifiedDomainName=<domínio>,ResourcePath=/"],
      solucao: ["aws route53 create-health-check --caller-reference climb-1 --health-check-config Type=HTTP,FullyQualifiedDomainName=loja-climb.com.br,ResourcePath=/"],
      validar: (c) => checks(c).some((h) => h.alvo === "loja-climb.com.br") },

    { id: "r53-10", servico: "route53", nivel: 3, xp: 85, titulo: "Não deixe o check ligado à toa",
      descricao: "O servidor monitorado foi desativado, mas a verificação continua rodando — e <b>health check é cobrado por mês</b>. <b>Apague</b> a verificação que você criou.",
      dicas: ["`delete-…` remove o recurso — veja a lista de comandos com: aws route53 help", "A forma do comando é: aws route53 delete-health-check --health-check-id <id>"],
      solucao: ["aws route53 delete-health-check --health-check-id <hc-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "route53", "delete-health-check") && !checks(c).some((h) => h.alvo === "loja-climb.com.br") },
  ];

  const PROJETO = { id: "r53-proj", servico: "route53", tipo: "projeto", nivel: 3, xp: 340,
    titulo: "🌐 Projeto: domínio no ar, do zero ao monitorado",
    descricao: "Uma loja nova vai ganhar domínio próprio. Você faz o caminho completo: <b>criar a zona</b>, descobrir os <b>nameservers</b> que o registrador precisa receber, <b>apontar o www</b> pro servidor, <b>conferir a propagação</b> e deixar uma <b>verificação de saúde</b> vigiando. Faça em qualquer ordem — o checklist marca sozinho.",
    dicas: [
      "É o caminho que você praticou: create-hosted-zone → get-hosted-zone (nameservers) → change-resource-record-sets → get-change → create-health-check.",
      "A zona do projeto é padaria-climb.com.br e o health check aponta pra ela.",
    ],
    solucao: [
      "aws route53 create-hosted-zone --name padaria-climb.com.br --caller-reference padaria-1",
      "aws route53 get-hosted-zone --id <zone-id>",
      `aws route53 change-resource-record-sets --hosted-zone-id <zone-id> --change-batch '{"Changes":[{"Action":"CREATE","ResourceRecordSet":{"Name":"www.padaria-climb.com.br","Type":"A","TTL":300,"ResourceRecords":[{"Value":"203.0.113.10"}]}}]}'`,
      "aws route53 get-change --id <change-id>",
      "aws route53 create-health-check --caller-reference padaria-hc --health-check-config Type=HTTP,FullyQualifiedDomainName=padaria-climb.com.br,ResourcePath=/",
    ],
    etapas: [
      { texto: "Criar a zona padaria-climb.com.br", validar: (c) => Object.values(((c.route53 || {}).zonas) || {}).some((z) => String(z.nome || "").indexOf("padaria-climb.com.br") === 0) },
      { texto: "Apontar o www pro servidor (registro A)", validar: (c) => Object.values(((c.route53 || {}).zonas) || {}).some((z) => (z.registros || []).some((r) => /^www\.padaria-climb/.test(r.Name) && r.Type === "A")) },
      { texto: "Conferir a propagação da mudança (get-change)", validar: (c) => Object.values(((c.route53 || {}).mudancas) || {}).some((m) => m.consultas > 0) },
      { texto: "Deixar uma verificação de saúde vigiando o domínio", validar: (c) => checks(c).some((h) => h.alvo === "padaria-climb.com.br") },
    ] };

  if (typeof DESAFIOS !== "undefined") {
    // As 4 entram ANTES do delete-hosted-zone (r53-6): limpeza é o fecho da
    // trilha, e sem a zona as atividades novas não teriam onde rodar.
    const iLimpeza = DESAFIOS.findIndex((d) => d.id === "r53-6");
    if (iLimpeza >= 0) DESAFIOS.splice(iLimpeza, 0, ...ANTES_DA_LIMPEZA);
    else DESAFIOS.push(...ANTES_DA_LIMPEZA);
    // O projeto cria a própria zona, então fecha a trilha depois da limpeza.
    let ultimo = -1;
    for (let k = 0; k < DESAFIOS.length; k++) if (DESAFIOS[k].servico === "route53") ultimo = k;
    if (ultimo >= 0) DESAFIOS.splice(ultimo + 1, 0, PROJETO);
    else DESAFIOS.push(PROJETO);
  }
})();
