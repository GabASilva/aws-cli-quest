"use strict";
// ============================================================
// CLImb — cloudwatch-metricas.js
// MÉTRICA PERSONALIZADA (custom metric) — faltava no CLImb.
//
// O CloudWatch já tinha alarme (put-metric-alarm) e listagem, mas só sabia
// falar das métricas que a AWS coleta sozinha (CPU, invocações...). O que não
// existia era o outro lado: **você publicar a SUA métrica** com
// `put-metric-data` e depois lê-la com `get-metric-statistics`.
//
// Isso importa porque as métricas que decidem negócio a AWS não tem como
// saber: pedidos por minuto, carrinhos abandonados, fila de pedidos pendentes.
// Elas só existem se a sua aplicação publicar.
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
    });
  }

  // ---------- parte didática (regra do projeto) ----------
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "cloudwatch.put-metric-data": "publica um número SEU no CloudWatch — pedidos, cadastros, tamanho de fila. A AWS mede a máquina; só a sua aplicação sabe medir o negócio. É o comando que faz a métrica passar a existir.",
      "cloudwatch.get-metric-statistics": "lê a métrica de volta já agregada: você diz o intervalo, o tamanho da janela (--period) e a estatística (Sum, Average, Maximum). O CloudWatch não guarda ponto cru pra sempre — ele resume.",
    });
  }
})();
