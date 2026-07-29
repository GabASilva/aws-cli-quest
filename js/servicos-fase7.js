"use strict";
// ============================================================
// CLImb — servicos-fase7.js
// Fase 7 — Custos e governança: Budgets (orçamentos), Cost Explorer (ce),
// Organizations (várias contas) e Trusted Advisor (support).
//
// É a parte "adulta" da AWS: parar de tomar susto na fatura, ver pra onde o
// dinheiro está indo, separar contas por time e receber recomendações de
// economia e segurança. Cai muito na certificação (Cloud Practitioner).
// ============================================================
(function () {
  const CONTA_ID = (c) => c.contaId || "123456789012";

  function estado(conta) {
    conta.budgets = conta.budgets || { orcamentos: {} };
    conta.org = conta.org || { organizacao: null, contas: {}, ous: {} };
    return conta;
  }

  // ============================================================
  // Budgets — aws budgets
  // ============================================================
  const cmdBudgets = {
    "create-budget": (conta, pos, flags) => {
      estado(conta);
      const bruto = exigirFlag(flags, "budget");
      let orc;
      try { orc = typeof bruto === "string" ? JSON.parse(bruto) : bruto; }
      catch (e) { throw new ErroCli("An error occurred (InvalidParameterException) when calling the CreateBudget operation: --budget precisa ser um JSON válido.\nEx.: --budget '{\"BudgetName\":\"orcamento-mensal\",\"BudgetLimit\":{\"Amount\":\"50\",\"Unit\":\"USD\"},\"TimeUnit\":\"MONTHLY\",\"BudgetType\":\"COST\"}'"); }
      const nome = orc.BudgetName;
      if (!nome) throw new ErroCli("An error occurred (InvalidParameterException) when calling the CreateBudget operation: BudgetName é obrigatório dentro do --budget.");
      if (conta.budgets.orcamentos[nome]) throw new ErroCli(`An error occurred (DuplicateRecordException) when calling the CreateBudget operation: Budget ${nome} already exists.`);
      const limite = orc.BudgetLimit ? `${orc.BudgetLimit.Amount} ${orc.BudgetLimit.Unit || "USD"}` : "?";
      conta.budgets.orcamentos[nome] = { nome, limite, unidade: orc.TimeUnit || "MONTHLY", tipo: orc.BudgetType || "COST", gastoAtual: "0", criadoEm: agoraIso() };
      avisarClimb(`Orçamento "${nome}" criado (limite ${limite}). A AWS não BLOQUEIA o gasto — ela te AVISA quando você chega perto. Configure um alerta com create-notification pra receber e-mail ao passar de X%.`);
      return okSilencioso(`Orçamento "${nome}" criado.`);
    },
    "describe-budgets": (conta, pos, flags) => {
      estado(conta);
      exigirFlag(flags, "account-id");
      const l = Object.values(conta.budgets.orcamentos);
      if (!l.length) { avisarClimb("Nenhum orçamento ainda. É o primeiro passo pra não tomar susto na fatura."); return js({ Budgets: [] }); }
      return js({ Budgets: l.map((b) => ({ BudgetName: b.nome, BudgetLimit: { Amount: b.limite.split(" ")[0], Unit: b.limite.split(" ")[1] || "USD" }, TimeUnit: b.unidade, BudgetType: b.tipo, CalculatedSpend: { ActualSpend: { Amount: b.gastoAtual, Unit: "USD" } } })) });
    },
    "describe-budget": (conta, pos, flags) => {
      estado(conta);
      exigirFlag(flags, "account-id");
      const nome = exigirFlag(flags, "budget-name");
      const b = conta.budgets.orcamentos[nome];
      if (!b) throw new ErroCli(`An error occurred (NotFoundException) when calling the DescribeBudget operation: Unable to get budget: ${nome}`);
      return js({ Budget: { BudgetName: b.nome, BudgetLimit: { Amount: b.limite.split(" ")[0], Unit: "USD" }, TimeUnit: b.unidade, BudgetType: b.tipo, CalculatedSpend: { ActualSpend: { Amount: b.gastoAtual, Unit: "USD" } } } });
    },
    "create-notification": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "budget-name");
      exigirFlag(flags, "notification");
      exigirFlag(flags, "subscribers");
      const b = conta.budgets.orcamentos[nome];
      if (!b) throw new ErroCli(`An error occurred (NotFoundException) when calling the CreateNotification operation: Unable to get budget: ${nome}`);
      b.temAlerta = true;
      avisarClimb("Pronto — agora, quando o gasto passar do limite que você definiu no --notification, a AWS manda e-mail pros inscritos. É assim que se evita a \"conta surpresa\".");
      return okSilencioso("Alerta de orçamento criado.");
    },
    "delete-budget": (conta, pos, flags) => {
      estado(conta);
      exigirFlag(flags, "account-id");
      const nome = exigirFlag(flags, "budget-name");
      if (!conta.budgets.orcamentos[nome]) throw new ErroCli(`An error occurred (NotFoundException) when calling the DeleteBudget operation: Unable to get budget: ${nome}`);
      delete conta.budgets.orcamentos[nome];
      return okSilencioso(`Orçamento "${nome}" apagado.`);
    },
  };

  // ============================================================
  // Cost Explorer — aws ce
  // Números fictícios coerentes (é um simulador). Sempre retorna algo.
  // ============================================================
  function custoPorServico(conta) {
    // Deriva um custo fictício mas coerente com o que existe na conta.
    const linhas = [];
    const ec2 = conta.ec2 && conta.ec2.instancias ? Object.keys(conta.ec2.instancias).length : 0;
    const s3 = conta.s3 && conta.s3.buckets ? Object.keys(conta.s3.buckets).length : 0;
    const rds = conta.rds && conta.rds.instancias ? Object.keys(conta.rds.instancias).length : 0;
    linhas.push(["Amazon Elastic Compute Cloud - Compute", (12.4 + ec2 * 6.7).toFixed(2)]);
    linhas.push(["Amazon Simple Storage Service", (2.1 + s3 * 0.9).toFixed(2)]);
    if (rds) linhas.push(["Amazon Relational Database Service", (rds * 14.2).toFixed(2)]);
    linhas.push(["AWS Data Transfer", "3.87"]);
    linhas.push(["Amazon CloudWatch", "1.12"]);
    return linhas;
  }
  const cmdCe = {
    "get-cost-and-usage": (conta, pos, flags) => {
      estado(conta);
      const periodo = flags["time-period"];
      let inicio = "2026-07-01", fim = "2026-07-31";
      if (periodo) {
        try { const p = typeof periodo === "string" ? JSON.parse(periodo) : periodo; inicio = p.Start || inicio; fim = p.End || fim; } catch (e) { /* usa padrão */ }
      }
      const agrupa = flags["group-by"] ? String(flags["group-by"]) : "";
      const linhas = custoPorServico(conta);
      const total = linhas.reduce((s, l) => s + parseFloat(l[1]), 0).toFixed(2);
      avisarClimb(`Custo do período: US$ ${total}. O Cost Explorer é onde você descobre QUE serviço está pesando na fatura — normalmente é EC2 ou transferência de dados. Agrupe por serviço/tag pra investigar.`);
      const grupos = agrupa.includes("SERVICE") || agrupa.includes("DIMENSION")
        ? linhas.map((l) => ({ Keys: [l[0]], Metrics: { UnblendedCost: { Amount: l[1], Unit: "USD" } } }))
        : [];
      return js({ ResultsByTime: [{ TimePeriod: { Start: inicio, End: fim }, Total: grupos.length ? {} : { UnblendedCost: { Amount: total, Unit: "USD" } }, Groups: grupos, Estimated: false }] });
    },
    "get-cost-forecast": (conta, pos, flags) => {
      estado(conta);
      exigirFlag(flags, "metric");
      const linhas = custoPorServico(conta);
      const mes = linhas.reduce((s, l) => s + parseFloat(l[1]), 0);
      const previsto = (mes * 1.18).toFixed(2);
      avisarClimb(`Previsão: US$ ${previsto} no fim do mês (com base no ritmo atual). Serve pra você reagir ANTES da fatura fechar.`);
      return js({ Total: { Amount: previsto, Unit: "USD" }, ForecastResultsByTime: [{ TimePeriod: { Start: "2026-07-24", End: "2026-08-01" }, MeanValue: previsto }] });
    },
    "get-dimension-values": (conta, pos, flags) => {
      estado(conta);
      exigirFlag(flags, "dimension");
      return js({ DimensionValues: custoPorServico(conta).map((l) => ({ Value: l[0], Attributes: {} })), TotalSize: custoPorServico(conta).length });
    },
  };

  // ============================================================
  // Organizations — aws organizations
  // ============================================================
  const cmdOrg = {
    "create-organization": (conta) => {
      estado(conta);
      if (conta.org.organizacao) throw new ErroCli("An error occurred (AlreadyInOrganizationException) when calling the CreateOrganization operation: The AWS account is already a member of an organization.");
      const idOrg = "o-" + hexAleatorio(10);
      conta.org.organizacao = { id: idOrg, master: CONTA_ID(conta), criadoEm: agoraIso() };
      conta.org.contas[CONTA_ID(conta)] = { id: CONTA_ID(conta), nome: "Management account", email: "root@exemplo.com", papel: "MASTER" };
      avisarClimb("Você criou uma ORGANIZAÇÃO — a conta atual virou a \"management account\" (a mãe). A partir daqui você cria contas-filhas por time/ambiente, com fatura única e regras centralizadas (SCPs). É a base de qualquer setup sério na AWS.");
      return js({ Organization: { Id: idOrg, MasterAccountId: CONTA_ID(conta), FeatureSet: "ALL" } });
    },
    "describe-organization": (conta) => {
      estado(conta);
      if (!conta.org.organizacao) throw new ErroCli("An error occurred (AWSOrganizationsNotInUseException) when calling the DescribeOrganization operation: Your account is not a member of an organization.\nCrie uma com: aws organizations create-organization");
      return js({ Organization: { Id: conta.org.organizacao.id, MasterAccountId: conta.org.organizacao.master, FeatureSet: "ALL" } });
    },
    "create-account": (conta, pos, flags) => {
      estado(conta);
      if (!conta.org.organizacao) throw new ErroCli("An error occurred (AWSOrganizationsNotInUseException) when calling the CreateAccount operation: crie a organização antes (aws organizations create-organization).");
      const nome = exigirFlag(flags, "account-name");
      const email = exigirFlag(flags, "email");
      if (Object.values(conta.org.contas).some((a) => a.nome === nome)) throw new ErroCli(`An error occurred (DuplicateAccountException) when calling the CreateAccount operation: já existe uma conta chamada "${nome}".`);
      const id = String(100000000000 + Math.floor(Math.random() * 899999999999));
      conta.org.contas[id] = { id, nome, email: String(email), papel: "MEMBER" };
      avisarClimb(`Conta-filha "${nome}" criada dentro da organização. Toda a fatura dela cai na management account (fatura consolidada), e você pode aplicar SCPs pra limitar o que essa conta pode fazer.`);
      return js({ CreateAccountStatus: { Id: "car-" + hexAleatorio(12), AccountName: nome, State: "IN_PROGRESS", AccountId: id } });
    },
    "list-accounts": (conta) => {
      estado(conta);
      if (!conta.org.organizacao) throw new ErroCli("An error occurred (AWSOrganizationsNotInUseException) when calling the ListAccounts operation: Your account is not a member of an organization.");
      return js({ Accounts: Object.values(conta.org.contas).map((a) => ({ Id: a.id, Name: a.nome, Email: a.email, Status: "ACTIVE", JoinedMethod: a.papel === "MASTER" ? "INVITED" : "CREATED" })) });
    },
    "create-organizational-unit": (conta, pos, flags) => {
      estado(conta);
      if (!conta.org.organizacao) throw new ErroCli("An error occurred (AWSOrganizationsNotInUseException) when calling the CreateOrganizationalUnit operation: crie a organização antes.");
      const nome = exigirFlag(flags, "name");
      exigirFlag(flags, "parent-id");
      const id = "ou-" + hexAleatorio(4) + "-" + hexAleatorio(8);
      conta.org.ous[id] = { id, nome };
      avisarClimb("Uma OU (Organizational Unit) é uma \"pasta\" de contas — ex.: uma OU \"Produção\" e outra \"Sandbox\". Você aplica regras (SCPs) na pasta e todas as contas dentro herdam.");
      return js({ OrganizationalUnit: { Id: id, Name: nome } });
    },
    "delete-organization": (conta) => {
      estado(conta);
      if (!conta.org.organizacao) throw new ErroCli("An error occurred (AWSOrganizationsNotInUseException) when calling the DeleteOrganization operation: Your account is not a member of an organization.");
      if (Object.values(conta.org.contas).some((a) => a.papel === "MEMBER")) throw new ErroCli("An error occurred (OrganizationNotEmptyException) when calling the DeleteOrganization operation: A organização ainda tem contas-membro. Remova-as antes.");
      conta.org = { organizacao: null, contas: {}, ous: {} };
      return okSilencioso("Organização apagada.");
    },
  };

  // ============================================================
  // Trusted Advisor — aws support (só leitura, dados fictícios coerentes)
  // ============================================================
  function checagensTa(conta) {
    const insts = conta.ec2 && conta.ec2.instancias ? Object.values(conta.ec2.instancias) : [];
    const sgAberto = conta.ec2 && conta.ec2.sgs ? Object.values(conta.ec2.sgs).some((g) => (g.regras || g.entradas || []).some((r) => JSON.stringify(r).includes("0.0.0.0/0"))) : false;
    return [
      { id: "Qch7DwouX1", nome: "Security Groups - Unrestricted Access", categoria: "security", status: sgAberto ? "warning" : "ok", resumo: sgAberto ? "Há security group liberando 0.0.0.0/0 — restrinja a portas/IPs específicos." : "Nenhuma porta perigosamente aberta." },
      { id: "DAvU99Dc4C", nome: "IAM Use", categoria: "security", status: "ok", resumo: "Você está usando IAM (bom — evite usar a conta root no dia a dia)." },
      { id: "Hs4Ma3G200", nome: "Low Utilization Amazon EC2 Instances", categoria: "cost_optimizing", status: insts.length > 2 ? "warning" : "ok", resumo: insts.length > 2 ? `${insts.length} instâncias ligadas — verifique se todas são necessárias (economia).` : "Uso de EC2 dentro do esperado." },
      { id: "G31sQ1E9U", nome: "Amazon S3 Bucket Permissions", categoria: "security", status: "ok", resumo: "Buckets sem acesso público irrestrito." },
      { id: "eW7HH0l7J9", nome: "Service Limits", categoria: "performance", status: "ok", resumo: "Nenhum limite de serviço próximo de estourar." },
    ];
  }
  const cmdSupport = {
    "describe-trusted-advisor-checks": (conta, pos, flags) => {
      estado(conta);
      const lang = flags.language || "en";
      void lang;
      avisarClimb("O Trusted Advisor é um \"consultor automático\": ele varre sua conta e aponta economia, falhas de segurança, limites e tolerância a falhas. As checagens de custo e segurança são as mais valiosas.");
      return js({ checks: checagensTa(conta).map((c) => ({ id: c.id, name: c.nome, category: c.categoria, description: c.resumo })) });
    },
    "describe-trusted-advisor-check-result": (conta, pos, flags) => {
      estado(conta);
      const id = exigirFlag(flags, "check-id");
      const c = checagensTa(conta).find((x) => x.id === id);
      if (!c) throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the DescribeTrustedAdvisorCheckResult operation: check-id "${id}" não encontrado.\nVeja os IDs com: aws support describe-trusted-advisor-checks --language pt`);
      return js({ result: { checkId: c.id, status: c.status, resourcesSummary: { resourcesProcessed: 12, resourcesFlagged: c.status === "warning" ? 1 : 0 }, categorySpecificSummary: {} } });
    },
  };

  // ---------- Registro ----------
  if (typeof SERVICOS !== "undefined") {
    SERVICOS.budgets = cmdBudgets;
    SERVICOS.ce = cmdCe;
    SERVICOS.organizations = cmdOrg;
    SERVICOS.support = cmdSupport;
  }

  // ============================================================
  // Trilhas
  // ============================================================
  const DESAFIOS_FASE7 = [
    // ===================== Budgets =====================
    { id: "bud-1", servico: "budgets", nivel: 1, xp: 50, titulo: "Nunca mais tome susto na fatura",
      descricao: "O <b>AWS Budgets</b> te avisa quando o gasto passa de um limite. Ele não bloqueia — ele <b>avisa</b>. Liste os orçamentos da sua conta. <small>(o account-id da sua conta é <b>123456789012</b>)</small>",
      dicas: ["`describe-…` é o que mostra os detalhes/estado de um recurso — veja a lista de comandos com: aws budgets help", "A forma do comando é: aws budgets describe-budgets --account-id <sua-conta>"],
      solucao: ["aws budgets describe-budgets --account-id 123456789012"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "budgets", "describe-budgets") },
    { id: "bud-2", servico: "budgets", nivel: 2, xp: 90, titulo: "Defina um teto mensal",
      descricao: "Crie um orçamento <b>orcamento-mensal</b> de <b>US$ 50/mês</b>. O parâmetro <code>--budget</code> é um JSON.",
      dicas: ["Criar recurso no AWS CLI é sempre `create-…` — veja a lista de comandos com: aws budgets help", "A forma do comando é: aws budgets create-budget --account-id <sua-conta> --budget <json com nome, limite e período>"],
      solucao: [`aws budgets create-budget --account-id 123456789012 --budget '{"BudgetName":"orcamento-mensal","BudgetLimit":{"Amount":"50","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}'`],
      validar: (c) => !!(c.budgets && c.budgets.orcamentos["orcamento-mensal"]) },
    { id: "bud-3", servico: "budgets", nivel: 2, xp: 90, titulo: "Ligue o alerta por e-mail",
      descricao: "Um orçamento sem alerta não serve pra nada. Crie uma <b>notificação</b> pra avisar quando passar de <b>80%</b> do orçamento <b>orcamento-mensal</b>.",
      dicas: ["Criar recurso no AWS CLI é sempre `create-…` — veja a lista de comandos com: aws budgets help", "A forma do comando é: aws budgets create-notification --account-id <sua-conta> --budget-name <nome-do-orçamento> --notification <json do alerta> --subscribers <json de quem recebe>"],
      solucao: [`aws budgets create-notification --account-id 123456789012 --budget-name orcamento-mensal --notification '{"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":80,"ThresholdType":"PERCENTAGE"}' --subscribers '[{"SubscriptionType":"EMAIL","Address":"voce@exemplo.com"}]'`],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "budgets", "create-notification") },
    { id: "bud-4", servico: "budgets", nivel: 3, xp: 70, titulo: "Remova o orçamento",
      descricao: "<b>Apague</b> o orçamento <b>orcamento-mensal</b>.",
      dicas: ["Apagar é sempre `delete-…` — veja a lista de comandos com: aws budgets help", "A forma do comando é: aws budgets delete-budget --account-id <sua-conta> --budget-name <nome-do-orçamento>"],
      solucao: ["aws budgets delete-budget --account-id 123456789012 --budget-name orcamento-mensal"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "budgets", "delete-budget") && !(c.budgets && c.budgets.orcamentos["orcamento-mensal"]) },

    // ===================== Cost Explorer =====================
    { id: "ce-1", servico: "ce", nivel: 1, xp: 60, titulo: "Para onde vai o dinheiro?",
      descricao: "O <b>Cost Explorer</b> mostra quanto você gastou. Veja o <b>custo e uso</b> do mês. <small>(o período é um JSON com Start e End)</small>",
      dicas: ["`get-…` busca um item específico (você diz qual) — veja a lista de comandos com: aws ce help", "A forma do comando é: aws ce get-cost-and-usage --time-period <json com Start e End> --granularity <DAILY ou MONTHLY> --metrics <métrica>"],
      solucao: [`aws ce get-cost-and-usage --time-period '{"Start":"2026-07-01","End":"2026-07-31"}' --granularity MONTHLY --metrics UnblendedCost`],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ce", "get-cost-and-usage") },
    { id: "ce-2", servico: "ce", nivel: 2, xp: 90, titulo: "Qual serviço está pesando?",
      descricao: "Repita a consulta, mas <b>agrupando por serviço</b> — assim você descobre se o vilão é o EC2, o S3 ou a transferência de dados.",
      dicas: ["`get-…` busca um item específico (você diz qual) — veja a lista de comandos com: aws ce help", "A forma do comando é: aws ce get-cost-and-usage --time-period <json com Start e End> --granularity <DAILY ou MONTHLY> --metrics <métrica> --group-by <como agrupar>"],
      solucao: [`aws ce get-cost-and-usage --time-period '{"Start":"2026-07-01","End":"2026-07-31"}' --granularity MONTHLY --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE`],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ce", "get-cost-and-usage") && !!(cmd && cmd.flags && cmd.flags["group-by"]) },
    { id: "ce-3", servico: "ce", nivel: 2, xp: 80, titulo: "Quanto vai fechar o mês?",
      descricao: "Peça a <b>previsão de custo</b> (forecast) — quanto a AWS estima que você vai gastar até o fim do período, no ritmo atual.",
      dicas: ["`get-…` busca um item específico (você diz qual) — veja a lista de comandos com: aws ce help", "A forma do comando é: aws ce get-cost-forecast --time-period <json com Start e End> --metric <métrica> --granularity <DAILY ou MONTHLY>"],
      solucao: [`aws ce get-cost-forecast --time-period '{"Start":"2026-07-24","End":"2026-08-01"}' --metric UNBLENDED_COST --granularity MONTHLY`],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ce", "get-cost-forecast") },

    // ===================== Organizations =====================
    { id: "org-1", servico: "organizations", nivel: 1, xp: 60, titulo: "Uma conta pra cada time",
      descricao: "O <b>Organizations</b> junta várias contas AWS sob uma só fatura, com regras centralizadas. Crie a sua <b>organização</b> (a conta atual vira a \"mãe\").",
      dicas: ["Criar recurso no AWS CLI é sempre `create-…` — veja a lista de comandos com: aws organizations help"], solucao: ["aws organizations create-organization"],
      validar: (c) => !!(c.org && c.org.organizacao) },
    { id: "org-2", servico: "organizations", nivel: 2, xp: 100, titulo: "Crie uma conta-filha",
      descricao: "Crie uma conta <b>time-dados</b> dentro da organização (com um e-mail único, como a AWS exige).",
      dicas: ["Criar recurso no AWS CLI é sempre `create-…` — veja a lista de comandos com: aws organizations help", "A forma do comando é: aws organizations create-account --account-name <nome> --email <um e-mail>"],
      solucao: ["aws organizations create-account --account-name time-dados --email dados+aws@exemplo.com"],
      validar: (c) => !!(c.org && Object.values(c.org.contas).some((a) => a.nome === "time-dados")) },
    { id: "org-3", servico: "organizations", nivel: 2, xp: 70, titulo: "Quem está na organização?",
      descricao: "Liste todas as <b>contas</b> da organização — a management account e as filhas aparecem juntas.",
      dicas: ["Pra ver o que já existe, o verbo costuma ser `list-…` — veja a lista de comandos com: aws organizations help"], solucao: ["aws organizations list-accounts"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "organizations", "list-accounts") },
    { id: "org-4", servico: "organizations", nivel: 3, xp: 90, titulo: "Organize em pastas (OU)",
      descricao: "Crie uma <b>unidade organizacional</b> chamada <b>Producao</b> na raiz. <small>(pegue o parent-id da raiz — no simulador use <b>r-root</b>)</small>",
      dicas: ["Criar recurso no AWS CLI é sempre `create-…` — veja a lista de comandos com: aws organizations help", "A forma do comando é: aws organizations create-organizational-unit --name <nome> --parent-id <id>"],
      solucao: ["aws organizations create-organizational-unit --name Producao --parent-id r-root"],
      validar: (c) => !!(c.org && Object.values(c.org.ous || {}).some((o) => o.nome === "Producao")) },

    // ===================== Trusted Advisor =====================
    { id: "ta-1", servico: "support", nivel: 1, xp: 60, titulo: "Seu consultor automático",
      descricao: "O <b>Trusted Advisor</b> varre a conta e aponta economia, segurança e limites. Liste as <b>checagens</b> disponíveis.",
      dicas: ["`describe-…` é o que mostra os detalhes/estado de um recurso — veja a lista de comandos com: aws support help", "A forma do comando é: aws support describe-trusted-advisor-checks --language <idioma>"],
      solucao: ["aws support describe-trusted-advisor-checks --language pt"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "support", "describe-trusted-advisor-checks") },
    { id: "ta-2", servico: "support", nivel: 2, xp: 90, titulo: "Alguma porta aberta demais?",
      descricao: "Veja o <b>resultado</b> da checagem de Security Groups (id <b>Qch7DwouX1</b>) — é a que pega firewall liberado pro mundo (0.0.0.0/0).",
      dicas: ["`describe-…` é o que mostra os detalhes/estado de um recurso — veja a lista de comandos com: aws support help", "A forma do comando é: aws support describe-trusted-advisor-check-result --check-id <id> --language <idioma>"],
      solucao: ["aws support describe-trusted-advisor-check-result --check-id Qch7DwouX1 --language pt"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "support", "describe-trusted-advisor-check-result") },
  ];

  if (typeof SERVICOS_META !== "undefined" && typeof DESAFIOS !== "undefined") {
    const metas = [
      { id: "budgets", nome: "Budgets", subtitulo: "Alertas de gasto", icone: "💰" },
      { id: "ce", nome: "Cost Explorer", subtitulo: "Para onde vai a grana", icone: "📊" },
      { id: "organizations", nome: "Organizations", subtitulo: "Várias contas, uma fatura", icone: "🏢" },
      { id: "support", nome: "Trusted Advisor", subtitulo: "Consultor automático", icone: "🧭" },
    ];
    if (!SERVICOS_META.some((s) => s.id === "budgets")) {
      for (const m of metas) {
        const iProj = SERVICOS_META.findIndex((s) => s.id === "projetos");
        if (iProj >= 0) SERVICOS_META.splice(iProj, 0, m); else SERVICOS_META.push(m);
      }
      for (const d of DESAFIOS_FASE7) DESAFIOS.push(d);
    }
  }
})();
