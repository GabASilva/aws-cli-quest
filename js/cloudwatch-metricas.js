"use strict";
// ============================================================
// CLImb — cloudwatch-metricas.js
// O que faltava do CloudWatch, fechando a história completa de observabilidade:
// MEÇO (métrica personalizada) → ALARMO (já existia) → VISUALIZO (painel).
//
// 1) MÉTRICA PERSONALIZADA — o CloudWatch já tinha alarme e listagem, mas só
//    sabia falar das métricas que a AWS coleta sozinha (CPU, invocações...).
//    Faltava o outro lado: **você publicar a SUA métrica** com
//    `put-metric-data` e lê-la com `get-metric-statistics`. As métricas que
//    decidem negócio a AWS não tem como saber (pedidos por minuto, carrinhos
//    abandonados, fila interna) — elas só existem se a aplicação publicar.
//
// 2) PAINEL (dashboard) — o passo natural depois de ter métrica própria: juntar
//    os gráficos numa tela que alguém olha de manhã. `put-dashboard` e amigos.
//
// ADITIVO: acrescenta comandos em SERVICOS.cloudwatch (que já existe, criado
// em servicos-fase1.js) e empurra atividades novas na trilha do CloudWatch.
// Carrega DEPOIS de servicos-fase1.js.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.cloudwatch) return;

  function estado(conta) {
    conta.cloudwatch = conta.cloudwatch || { alarmes: {} };
    // cada métrica personalizada: "namespace|nome" -> { pontos: [...] }
    conta.cloudwatch.metricas = conta.cloudwatch.metricas || {};
    conta.cloudwatch.paineis = conta.cloudwatch.paineis || {};
    return conta;
  }

  // Métricas que a AWS coleta sozinha (as que já apareciam no list-metrics).
  const METRICAS_AWS = [
    { Namespace: "AWS/EC2", MetricName: "CPUUtilization" },
    { Namespace: "AWS/S3", MetricName: "BucketSizeBytes" },
    { Namespace: "AWS/Lambda", MetricName: "Invocations" },
  ];

  const chave = (ns, nome) => ns + "|" + nome;

  // "Name=Produto,Value=Camiseta" -> [{Name,Value}]
  function lerDimensoes(bruto) {
    if (!bruto) return [];
    return [].concat(bruto).map(String).map((par) => {
      const o = {};
      for (const p of par.split(",")) {
        const i = p.indexOf("=");
        if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim();
      }
      return { Name: o.Name || o.name || "", Value: o.Value || o.value || "" };
    }).filter((d) => d.Name);
  }

  Object.assign(SERVICOS.cloudwatch, {
    "put-metric-data": (conta, pos, flags) => {
      estado(conta);
      const ns = String(exigirFlag(flags, "namespace"));
      // A AWS RESERVA o prefixo AWS/ — erro real e muito comum de quem começa.
      if (/^AWS\//i.test(ns)) {
        throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the PutMetricData operation: The value AWS/ for parameter Namespace is reserved for AWS services.\nUse um namespace seu, tipo "Loja/Pedidos" — é ele que agrupa as suas métricas e separa das da AWS.`);
      }
      const nome = String(exigirFlag(flags, "metric-name"));
      if (flags.value === undefined && flags["metric-data"] === undefined) {
        throw new ErroCli("aws: error: informe o valor da métrica com --value <número> (ou o JSON completo em --metric-data).");
      }
      const valor = Number(flags.value);
      if (flags.value !== undefined && !isFinite(valor)) {
        throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the PutMetricData operation: valor inválido para --value: "${flags.value}" (esperado um número).`);
      }
      const unidade = flags.unit ? String(flags.unit) : "None";
      const dims = lerDimensoes(flags.dimensions);
      const k = chave(ns, nome);
      const m = conta.cloudwatch.metricas[k] || (conta.cloudwatch.metricas[k] = { namespace: ns, nome, unidade, dimensoes: dims, pontos: [] });
      m.unidade = unidade;
      if (dims.length) m.dimensoes = dims;
      m.pontos.push({ valor, quando: agoraIso() });

      const n = m.pontos.length;
      avisarClimb(n === 1
        ? `Métrica "${nome}" publicada no namespace "${ns}". Ela agora EXISTE no CloudWatch — a AWS não tinha como saber esse número, ele só passa a existir porque a sua aplicação mandou. Publique mais alguns pontos e depois leia com get-metric-statistics.`
        : `${n} pontos em "${nome}". Numa aplicação real esta chamada fica dentro do código (a cada pedido, por exemplo) — é assim que se acompanha um número de NEGÓCIO, não de máquina. Dá pra criar alarme em cima dela igual a qualquer métrica da AWS.`);
      return okSilencioso(`Ponto registrado em ${ns}/${nome}.`);
    },

    "get-metric-statistics": (conta, pos, flags) => {
      estado(conta);
      const ns = String(exigirFlag(flags, "namespace"));
      const nome = String(exigirFlag(flags, "metric-name"));
      exigirFlag(flags, "start-time");
      exigirFlag(flags, "end-time");
      exigirFlag(flags, "period");
      const pedidas = [].concat(exigirFlag(flags, "statistics")).map(String);
      const m = conta.cloudwatch.metricas[chave(ns, nome)];
      if (!m || !m.pontos.length) {
        // fiel: a AWS responde vazio, não dá erro
        avisarClimb(`Nenhum dado para ${ns}/${nome} no período. A AWS não acusa erro quando a métrica não tem ponto — ela devolve a lista vazia mesmo. Publique com put-metric-data primeiro (e confira se o namespace e o nome estão escritos igualzinho: são sensíveis a maiúscula).`);
        return js({ Label: nome, Datapoints: [] });
      }
      const vals = m.pontos.map((p) => p.valor);
      const soma = vals.reduce((a, b) => a + b, 0);
      const calc = {
        Sum: soma, Average: soma / vals.length, Minimum: Math.min(...vals),
        Maximum: Math.max(...vals), SampleCount: vals.length,
      };
      const ponto = { Timestamp: m.pontos[m.pontos.length - 1].quando, Unit: m.unidade };
      for (const s of pedidas) if (calc[s] !== undefined) ponto[s] = Number(calc[s].toFixed(2));
      avisarClimb(`O CloudWatch não guarda cada ponto pra sempre: ele AGREGA por período (o --period, em segundos) e você escolhe a estatística (Sum, Average, Maximum...). Aqui foram ${vals.length} ponto(s) — some ${soma} no total.`);
      return js({ Label: nome, Datapoints: [ponto] });
    },
  });

  // list-metrics passa a mostrar as SUAS métricas junto das da AWS (e aceita
  // --namespace pra filtrar). Substitui o original, que era uma lista fixa.
  SERVICOS.cloudwatch["list-metrics"] = (conta, pos, flags) => {
    estado(conta);
    const minhas = Object.values(conta.cloudwatch.metricas).map((m) => ({
      Namespace: m.namespace, MetricName: m.nome,
      Dimensions: m.dimensoes && m.dimensoes.length ? m.dimensoes : [],
    }));
    let todas = METRICAS_AWS.concat(minhas);
    const filtro = flags && flags.namespace ? String(flags.namespace) : null;
    if (filtro) todas = todas.filter((x) => x.Namespace === filtro);
    if (!todas.length) {
      avisarClimb(`Nenhuma métrica no namespace "${filtro}". Confira a grafia — ou publique uma com put-metric-data.`);
      return js({ Metrics: [] });
    }
    if (minhas.length && !filtro) {
      avisarClimb("Repare que as suas métricas aparecem lado a lado com as da AWS (AWS/EC2, AWS/Lambda...). Pro CloudWatch não há diferença: alarme, gráfico e painel funcionam igual nas duas.");
    }
    return js({ Metrics: todas });
  };

  // ============================================================
  // PAINEL (dashboard) — juntar os gráficos numa tela só
  // ============================================================
  const NOME_PAINEL_OK = /^[a-zA-Z0-9_-]+$/;

  // Varre os widgets e devolve as métricas citadas: [[ns, nome], ...].
  // O formato real do widget é properties.metrics = [[ns, nome, dimNome, dimValor], ...]
  function metricasDoCorpo(corpo) {
    const achadas = [];
    for (const w of corpo.widgets || []) {
      const ms = w && w.properties && w.properties.metrics;
      if (!Array.isArray(ms)) continue;
      for (const m of ms) if (Array.isArray(m) && m.length >= 2) achadas.push([String(m[0]), String(m[1])]);
    }
    return achadas;
  }

  Object.assign(SERVICOS.cloudwatch, {
    "put-dashboard": (conta, pos, flags) => {
      estado(conta);
      const nome = String(exigirFlag(flags, "dashboard-name"));
      if (!NOME_PAINEL_OK.test(nome)) {
        throw new ErroCli(`An error occurred (InvalidParameterInput) when calling the PutDashboard operation: The dashboard name is invalid: ${nome}\nUse só letras, números, "-" e "_" (sem espaço e sem barra).`);
      }
      const bruto = exigirFlag(flags, "dashboard-body");
      let corpo;
      try { corpo = typeof bruto === "string" ? JSON.parse(bruto) : bruto; }
      catch (e) {
        throw new ErroCli("An error occurred (InvalidParameterInput) when calling the PutDashboard operation: --dashboard-body precisa ser um JSON válido.\nEle descreve os WIDGETS do painel. O mínimo é:\n  '{\"widgets\":[{\"type\":\"metric\",\"properties\":{\"metrics\":[[\"Loja/Pedidos\",\"PedidosPorMinuto\"]],\"title\":\"Pedidos\"}}]}'");
      }
      if (!Array.isArray(corpo.widgets)) {
        throw new ErroCli("An error occurred (InvalidParameterInput) when calling the PutDashboard operation: o JSON precisa ter a lista \"widgets\".\nCada widget é um quadro do painel: type \"metric\" (gráfico), \"text\" (recado em markdown) ou \"log\".");
      }

      const jaExistia = !!conta.cloudwatch.paineis[nome];
      conta.cloudwatch.paineis[nome] = { nome, corpo, atualizadoEm: agoraIso() };

      // Pegadinha real: o painel aceita QUALQUER métrica, mesmo uma que nunca
      // foi publicada — e aí o gráfico aparece vazio, sem erro nenhum.
      const citadas = metricasDoCorpo(corpo);
      const fantasmas = citadas.filter(([ns, mn]) => !/^AWS\//i.test(ns) && !conta.cloudwatch.metricas[chave(ns, mn)]);
      const tipos = [...new Set((corpo.widgets || []).map((w) => (w && w.type) || "metric"))];

      if (fantasmas.length) {
        avisarClimb(`Painel "${nome}" salvo — mas atenção: ${fantasmas.map(([a, b]) => a + "/" + b).join(", ")} não tem nenhum dado publicado. O CloudWatch NÃO reclama disso: ele aceita o painel e o gráfico simplesmente aparece vazio. É a causa nº 1 de "meu dashboard não mostra nada" — quase sempre é nome ou namespace escrito diferente do que a aplicação publica.`);
      } else {
        avisarClimb(`Painel "${nome}" ${jaExistia ? "atualizado" : "criado"} com ${corpo.widgets.length} widget(s) (${tipos.join(", ")}). O put-dashboard SUBSTITUI o painel inteiro — não existe "adicionar um widget": você manda o JSON completo sempre. Por isso o normal é guardar esse JSON no repositório, como código.`);
      }
      return js({ DashboardValidationMessages: [] });
    },

    "list-dashboards": (conta) => {
      estado(conta);
      const l = Object.values(conta.cloudwatch.paineis);
      if (!l.length) {
        avisarClimb("Nenhum painel ainda. Os 3 primeiros são de graça — a partir do 4º a AWS cobra por painel/mês, então costuma-se ter um painel por time ou por sistema, não um por pessoa.");
        return js({ DashboardEntries: [] });
      }
      return js({ DashboardEntries: l.map((p) => ({
        DashboardName: p.nome,
        DashboardArn: `arn:aws:cloudwatch::${conta.contaId || "123456789012"}:dashboard/${p.nome}`,
        LastModified: p.atualizadoEm,
        Size: JSON.stringify(p.corpo).length,
      })) });
    },

    "get-dashboard": (conta, pos, flags) => {
      estado(conta);
      const nome = String(exigirFlag(flags, "dashboard-name"));
      const p = conta.cloudwatch.paineis[nome];
      if (!p) throw new ErroCli(`An error occurred (ResourceNotFound) when calling the GetDashboard operation: Dashboard ${nome} does not exist.`);
      avisarClimb("Repare que o DashboardBody volta como TEXTO (uma string com JSON dentro), não como objeto. É assim na AWS de verdade — pra editar, você lê essa string, altera e manda de volta no put-dashboard.");
      return js({
        DashboardName: p.nome,
        DashboardArn: `arn:aws:cloudwatch::${conta.contaId || "123456789012"}:dashboard/${p.nome}`,
        DashboardBody: JSON.stringify(p.corpo),
      });
    },

    "delete-dashboards": (conta, pos, flags) => {
      estado(conta);
      const nomes = [].concat(exigirFlag(flags, "dashboard-names")).map(String);
      const faltando = nomes.filter((n) => !conta.cloudwatch.paineis[n]);
      if (faltando.length) {
        throw new ErroCli(`An error occurred (ResourceNotFound) when calling the DeleteDashboards operation: Dashboard ${faltando[0]} does not exist.\nDica: o parâmetro é PLURAL (--dashboard-names) e aceita vários nomes separados por espaço — se um só não existir, nenhum é apagado.`);
      }
      for (const n of nomes) delete conta.cloudwatch.paineis[n];
      avisarClimb(`${nomes.length} painel(is) apagado(s). Apagar painel não apaga métrica nem alarme — o painel é só a "vitrine". Os dados continuam no CloudWatch, e você pode montar outra visualização deles quando quiser.`);
      return okSilencioso("Painel apagado.");
    },
  });

  // ============================================================
  // Atividades — entram na trilha do CloudWatch (ids cw-10+ estão livres)
  // ============================================================
  const NOVAS = [
    { id: "cw-10", servico: "cloudwatch", nivel: 2, xp: 80, titulo: "A métrica que só você tem",
      descricao: "A AWS mede CPU e memória sozinha, mas não tem como saber quantos <b>pedidos</b> a sua loja fez. Essa métrica só existe se a aplicação publicar. Publique a métrica <b>PedidosPorMinuto</b> no namespace <b>Loja/Pedidos</b> com o valor <b>42</b>.",
      dicas: ["`put-…` grava um dado no CloudWatch. O namespace é o \"sobrenome\" que agrupa as suas métricas — e não pode começar com AWS/, que é reservado.", "A forma do comando é: aws cloudwatch put-metric-data --namespace <seu-namespace> --metric-name <nome> --value <número>"],
      solucao: ["aws cloudwatch put-metric-data --namespace Loja/Pedidos --metric-name PedidosPorMinuto --value 42"],
      validar: (c) => !!(c.cloudwatch && c.cloudwatch.metricas && c.cloudwatch.metricas["Loja/Pedidos|PedidosPorMinuto"]) },

    { id: "cw-11", servico: "cloudwatch", nivel: 2, xp: 70, titulo: "Ela aparece na lista?",
      descricao: "Liste as métricas do namespace <b>Loja/Pedidos</b> e confirme que a sua está lá, lado a lado com as da AWS.",
      dicas: ["Você já usou este comando pra ver as métricas da AWS — agora com o filtro de namespace.", "A forma do comando é: aws cloudwatch list-metrics --namespace <seu-namespace>"],
      solucao: ["aws cloudwatch list-metrics --namespace Loja/Pedidos"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cloudwatch", "list-metrics") && !!(cmd.flags && cmd.flags.namespace === "Loja/Pedidos") },

    { id: "cw-12", servico: "cloudwatch", nivel: 3, xp: 100, titulo: "Mande mais um ponto",
      descricao: "Uma métrica com um ponto só não mostra tendência. Publique <b>outro</b> valor em <b>PedidosPorMinuto</b> — dessa vez <b>58</b>, e marcando a unidade como <b>Count</b>.",
      dicas: ["É o mesmo comando de publicar, agora dizendo também a unidade (a AWS usa isso pra rotular o gráfico).", "A forma do comando é: aws cloudwatch put-metric-data --namespace <seu-namespace> --metric-name <nome> --value <número> --unit <unidade>"],
      solucao: ["aws cloudwatch put-metric-data --namespace Loja/Pedidos --metric-name PedidosPorMinuto --value 58 --unit Count"],
      validar: (c) => {
        const m = c.cloudwatch && c.cloudwatch.metricas && c.cloudwatch.metricas["Loja/Pedidos|PedidosPorMinuto"];
        return !!m && m.pontos.length >= 2;
      } },

    { id: "cw-13", servico: "cloudwatch", nivel: 3, xp: 120, titulo: "Leia a sua métrica de volta",
      descricao: "Agora consulte a <b>soma</b> dos pedidos. O CloudWatch agrega por período: você diz o intervalo (<b>--start-time</b> e <b>--end-time</b>), o tamanho da janela em segundos (<b>--period</b>) e qual estatística quer (<b>--statistics Sum</b>).",
      dicas: ["`get-…` busca o dado de volta. São 5 informações obrigatórias: onde (namespace + nome), o intervalo, o período e a estatística.", "A forma do comando é: aws cloudwatch get-metric-statistics --namespace <seu-namespace> --metric-name <nome> --start-time <data> --end-time <data> --period <segundos> --statistics <estatística>"],
      solucao: ["aws cloudwatch get-metric-statistics --namespace Loja/Pedidos --metric-name PedidosPorMinuto --start-time 2026-07-29T00:00:00Z --end-time 2026-07-30T00:00:00Z --period 3600 --statistics Sum"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cloudwatch", "get-metric-statistics") },

    { id: "cw-14", servico: "cloudwatch", nivel: 3, xp: 130, titulo: "Alarme na SUA métrica",
      descricao: "O melhor da métrica personalizada: dá pra alarmar nela igual a qualquer métrica da AWS. Crie um alarme <b>pedidos-caindo</b> que dispara quando <b>PedidosPorMinuto</b> (namespace <b>Loja/Pedidos</b>) ficar <b>abaixo de 10</b>.",
      dicas: ["É o mesmo comando de alarme que você já usou — a diferença é apontar pro seu namespace em vez de um AWS/…", "Pra \"abaixo de\", o comparador é LessThanThreshold. A forma: aws cloudwatch put-metric-alarm --alarm-name <nome> --namespace <seu-namespace> --metric-name <nome> --threshold <número> --comparison-operator <comparador>"],
      solucao: ["aws cloudwatch put-metric-alarm --alarm-name pedidos-caindo --namespace Loja/Pedidos --metric-name PedidosPorMinuto --threshold 10 --comparison-operator LessThanThreshold"],
      validar: (c) => {
        const a = c.cloudwatch && c.cloudwatch.alarmes && c.cloudwatch.alarmes["pedidos-caindo"];
        return !!a && a.namespace === "Loja/Pedidos" && a.metrica === "PedidosPorMinuto";
      } },

    // ---------- painel: o "visualizo" do arco ----------
    { id: "cw-15", servico: "cloudwatch", nivel: 3, xp: 120, titulo: "Um painel pra ver de longe",
      descricao: "Alarme avisa quando quebra; <b>painel</b> é o que alguém olha de manhã pra ver se está tudo bem. Crie um painel <b>loja-visao-geral</b> com um widget de gráfico da métrica <b>PedidosPorMinuto</b> (namespace <b>Loja/Pedidos</b>). <small>(o corpo é um JSON com a lista <b>widgets</b>)</small>",
      dicas: ["`put-…` grava o painel. O corpo descreve os quadros: cada widget tem um `type` e as `properties` (onde entra a lista de métricas).", "A forma do comando é: aws cloudwatch put-dashboard --dashboard-name <nome> --dashboard-body '<json com widgets>'"],
      solucao: [`aws cloudwatch put-dashboard --dashboard-name loja-visao-geral --dashboard-body '{"widgets":[{"type":"metric","properties":{"metrics":[["Loja/Pedidos","PedidosPorMinuto"]],"title":"Pedidos por minuto"}}]}'`],
      validar: (c) => !!(c.cloudwatch && c.cloudwatch.paineis && c.cloudwatch.paineis["loja-visao-geral"]) },

    { id: "cw-16", servico: "cloudwatch", nivel: 3, xp: 70, titulo: "Quais painéis eu tenho?",
      descricao: "Liste os <b>painéis</b> da conta. <small>(repare no tamanho de cada um — os 3 primeiros painéis são grátis, depois a AWS cobra por painel)</small>",
      dicas: ["Pra ver o que já existe, o verbo costuma ser `list-…` — veja a lista de comandos com: aws cloudwatch help"],
      solucao: ["aws cloudwatch list-dashboards"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cloudwatch", "list-dashboards") },

    { id: "cw-17", servico: "cloudwatch", nivel: 3, xp: 90, titulo: "Edite o painel: um recado nele",
      descricao: "Não existe \"adicionar um widget\": o <b>put-dashboard substitui o painel inteiro</b>. Reenvie o <b>loja-visao-geral</b> com <b>dois</b> widgets — o gráfico que já tinha e um novo do tipo <b>text</b> com um recado em markdown.",
      dicas: ["É o mesmo comando de criar — mandar de novo sobrescreve. O widget de recado é `{\"type\":\"text\",\"properties\":{\"markdown\":\"...\"}}`.", "A forma do comando é: aws cloudwatch put-dashboard --dashboard-name <nome> --dashboard-body '<json com os DOIS widgets>'"],
      solucao: [`aws cloudwatch put-dashboard --dashboard-name loja-visao-geral --dashboard-body '{"widgets":[{"type":"metric","properties":{"metrics":[["Loja/Pedidos","PedidosPorMinuto"]],"title":"Pedidos por minuto"}},{"type":"text","properties":{"markdown":"## Plantao\\nDuvida? chama o time de dados."}}]}'`],
      validar: (c) => {
        const p = c.cloudwatch && c.cloudwatch.paineis && c.cloudwatch.paineis["loja-visao-geral"];
        return !!p && (p.corpo.widgets || []).length >= 2 && p.corpo.widgets.some((w) => w && w.type === "text");
      } },

    { id: "cw-18", servico: "cloudwatch", nivel: 3, xp: 90, titulo: "Veja o painel por dentro",
      descricao: "Busque o painel <b>loja-visao-geral</b> e repare como o corpo dele volta: é <b>uma string</b> com JSON dentro, não um objeto. É assim que se edita painel por script — lê, altera, manda de volta.",
      dicas: ["`get-…` busca um item específico (você diz qual) — veja a lista de comandos com: aws cloudwatch help", "A forma do comando é: aws cloudwatch get-dashboard --dashboard-name <nome>"],
      solucao: ["aws cloudwatch get-dashboard --dashboard-name loja-visao-geral"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cloudwatch", "get-dashboard") },

    { id: "cw-19", servico: "cloudwatch", nivel: 3, xp: 80, titulo: "Desmonte a vitrine",
      descricao: "<b>Apague</b> o painel <b>loja-visao-geral</b>. <small>(o parâmetro é plural — aceita vários nomes de uma vez)</small>",
      dicas: ["Apagar é sempre `delete-…`. Repare no plural do parâmetro.", "A forma do comando é: aws cloudwatch delete-dashboards --dashboard-names <nome>"],
      solucao: ["aws cloudwatch delete-dashboards --dashboard-names loja-visao-geral"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cloudwatch", "delete-dashboards") && !(c.cloudwatch && c.cloudwatch.paineis["loja-visao-geral"]) },

  ];

  if (typeof DESAFIOS !== "undefined" && !DESAFIOS.some((d) => d.id === "cw-10")) {
    // insere logo depois da última atividade de cloudwatch (a trilha é sequencial)
    let i = -1;
    for (let k = 0; k < DESAFIOS.length; k++) if (DESAFIOS[k].servico === "cloudwatch") i = k;
    if (i >= 0) DESAFIOS.splice(i + 1, 0, ...NOVAS);
    else for (const d of NOVAS) DESAFIOS.push(d);
  }

  // ---------- manuais (o smoke test exige um por comando) ----------
  if (typeof MANUAIS !== "undefined") {
    Object.assign(MANUAIS, {
      "cloudwatch.put-metric-data": `aws cloudwatch put-metric-data\n\nUSO\n    aws cloudwatch put-metric-data --namespace Loja/Pedidos \\\n        --metric-name PedidosPorMinuto --value 42 [--unit Count] \\\n        [--dimensions Name=Produto,Value=Camiseta]\n\nPublica uma MÉTRICA PERSONALIZADA (custom metric): um número que a AWS não\ntem como coletar sozinha, porque é do seu negócio (pedidos, cadastros,\ncarrinhos abandonados, tamanho de fila interna).\n\nO namespace é o "sobrenome" que agrupa as suas métricas. NÃO pode começar\ncom "AWS/" — esse prefixo é reservado pros serviços da Amazon.\n\nAs dimensões são recortes da mesma métrica (por produto, por região, por\nservidor). Cada combinação de dimensões conta como uma métrica à parte —\ne é por métrica que se cobra, então cuidado com dimensão de alta variedade\n(id de usuário, por exemplo, criaria milhares).\n\nNa vida real esta chamada fica DENTRO da aplicação (a cada pedido), ou num\nagente como o CloudWatch Agent.`,
      "cloudwatch.get-metric-statistics": `aws cloudwatch get-metric-statistics\n\nUSO\n    aws cloudwatch get-metric-statistics --namespace Loja/Pedidos \\\n        --metric-name PedidosPorMinuto \\\n        --start-time 2026-07-29T00:00:00Z --end-time 2026-07-30T00:00:00Z \\\n        --period 3600 --statistics Sum\n\nLê a métrica de volta. O CloudWatch não devolve cada ponto cru: ele AGREGA\npor janela de tempo (--period, em segundos) e você escolhe a estatística:\n    Sum          soma dos valores da janela\n    Average      média\n    Maximum      maior valor\n    Minimum      menor valor\n    SampleCount  quantos pontos entraram\n\nSem dado no período, a AWS devolve "Datapoints": [] — lista vazia, sem erro.\nNamespace e nome são sensíveis a maiúscula/minúscula.`,

      "cloudwatch.put-dashboard": `aws cloudwatch put-dashboard\n\nUSO\n    aws cloudwatch put-dashboard --dashboard-name loja-visao-geral \\\n        --dashboard-body '{"widgets":[\n            {"type":"metric","properties":{\n               "metrics":[["Loja/Pedidos","PedidosPorMinuto"]],\n               "title":"Pedidos por minuto"}},\n            {"type":"text","properties":{"markdown":"## Plantao"}}\n        ]}'\n\nCria ou ATUALIZA um painel. O corpo é um JSON com a lista "widgets" — cada\nwidget é um quadro:\n    metric   gráfico de uma ou mais métricas\n    text     recado em markdown (título de seção, link de runbook, aviso)\n    log      resultado de uma consulta no CloudWatch Logs\n\nDentro de properties.metrics cada métrica é uma LISTA:\n    ["namespace", "NomeDaMetrica", "NomeDaDimensao", "valor"]\n\nDUAS COISAS QUE PEGAM:\n  - Não existe "adicionar um widget": o put SUBSTITUI o painel inteiro. Você\n    manda sempre o JSON completo — por isso o normal é versionar esse JSON.\n  - O painel aceita métrica que nunca foi publicada. A AWS não reclama: o\n    gráfico só aparece vazio. É a causa nº 1 de "meu dashboard não mostra\n    nada" (quase sempre namespace ou nome escrito diferente).\n\nNome do painel: só letras, números, "-" e "_".`,
      "cloudwatch.list-dashboards": `aws cloudwatch list-dashboards\n\nUSO\n    aws cloudwatch list-dashboards\n\nLista os painéis da conta, com data da última alteração e o tamanho do JSON.\nOs 3 primeiros painéis são gratuitos; a partir daí a AWS cobra por painel/mês\n— por isso costuma-se ter um painel por time ou por sistema, não um por pessoa.`,
      "cloudwatch.get-dashboard": `aws cloudwatch get-dashboard\n\nUSO\n    aws cloudwatch get-dashboard --dashboard-name loja-visao-geral\n\nDevolve o painel. Atenção ao formato: o DashboardBody volta como TEXTO (uma\nstring com JSON dentro), não como objeto — é assim na AWS de verdade. Pra\neditar por script: leia essa string, altere e mande de volta no put-dashboard.`,
      "cloudwatch.delete-dashboards": `aws cloudwatch delete-dashboards\n\nUSO\n    aws cloudwatch delete-dashboards --dashboard-names loja-visao-geral\n    aws cloudwatch delete-dashboards --dashboard-names painel-a painel-b\n\nApaga um ou mais painéis (o parâmetro é PLURAL). Se um dos nomes não existir,\na operação falha e nenhum é apagado.\n\nApagar painel NÃO apaga métrica nem alarme — o painel é só a vitrine. Os\ndados continuam no CloudWatch.`,
    });
  }

  // ---------- parte didática (regra do projeto) ----------
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "cloudwatch.put-metric-data": "publica um número SEU no CloudWatch — pedidos, cadastros, tamanho de fila. A AWS mede a máquina; só a sua aplicação sabe medir o negócio. É o comando que faz a métrica passar a existir.",
      "cloudwatch.get-metric-statistics": "lê a métrica de volta já agregada: você diz o intervalo, o tamanho da janela (--period) e a estatística (Sum, Average, Maximum). O CloudWatch não guarda ponto cru pra sempre — ele resume.",
      "cloudwatch.put-dashboard": "monta a tela que alguém olha de manhã. Alarme te acorda quando quebra; painel mostra se está tudo bem. Cuidado: ele SUBSTITUI o painel inteiro — não dá pra adicionar um widget, você manda o JSON completo sempre.",
      "cloudwatch.list-dashboards": "mostra os painéis que existem, com data de alteração e tamanho. Serve pra saber quantos você tem — os 3 primeiros são grátis, do 4º em diante a AWS cobra por painel.",
      "cloudwatch.get-dashboard": "baixa o painel pra você editar. O corpo vem como TEXTO com JSON dentro: é assim que se edita painel por script — lê, altera, manda de volta.",
      "cloudwatch.delete-dashboards": "apaga painel (o parâmetro é plural, aceita vários). Não mexe em métrica nem alarme — o painel é só a vitrine, os dados continuam lá.",
    });
  }
})();
