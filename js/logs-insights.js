"use strict";
// ============================================================
// CLImb — logs-insights.js
// CONSULTA DE LOG — o que faltava pra fechar observabilidade.
//
// A trilha já criava grupos de log (`aws logs create-log-group`), mas nunca
// LIA um. E é exatamente isso que se faz num plantão: achar o erro no meio de
// milhões de linhas. Sem isso, o aluno sabia criar a "gaveta" e não sabia
// procurar dentro dela.
//
// Dois jeitos, e a diferença entre eles é conteúdo:
//   filter-log-events  — busca simples por pedaço de texto. Rápido, direto.
//   start-query        — CloudWatch Logs Insights: linguagem de consulta com
//                        filter/stats/sort/limit. É onde se responde "quantos
//                        erros por tipo?" e "qual rota está mais lenta?".
//
// O motor de consulta aqui é DE VERDADE: parseia um subconjunto da linguagem
// do Insights e roda sobre os eventos. Consulta diferente, resposta diferente —
// não é resultado enlatado.
//
// ADITIVO. Carrega DEPOIS de licoes.js e dos arquivos de desafio (senão as
// atividades entram fora de ordem e as entradas de PORQUE são descartadas).
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.logs) return;

  function estado(conta) {
    conta.logs = conta.logs || { grupos: {} };
    conta.logs.eventos = conta.logs.eventos || {};   // grupo -> [evento]
    conta.logs.consultas = conta.logs.consultas || {}; // queryId -> resultado
    return conta;
  }

  // ============================================================
  // Eventos plantados: uma app web que teve um pico de erro
  // ============================================================
  // Contam uma história: /checkout está lento e é onde os erros aparecem.
  // Assim `stats count() by level` e `avg(latencia) by rota` dão respostas
  // interessantes em vez de números sem sentido.
  const ROTEIRO = [
    ["INFO", "/", 45, 200, 8], ["INFO", "/produtos", 120, 200, 7],
    ["INFO", "/produtos", 135, 200, 5], ["INFO", "/login", 90, 200, 4],
    ["WARN", "/checkout", 1850, 200, 3], ["ERROR", "/checkout", 3200, 500, 6],
    ["ERROR", "/checkout", 3050, 500, 4], ["ERROR", "/pagamento", 2900, 502, 3],
    ["WARN", "/produtos", 810, 200, 2], ["INFO", "/carrinho", 160, 200, 4],
    ["ERROR", "/login", 40, 401, 2], ["INFO", "/", 38, 200, 5],
  ];
  const MSG = {
    INFO: "requisicao atendida",
    WARN: "resposta lenta",
    ERROR: "falha ao processar requisicao",
  };

  function semear(conta, grupo) {
    const base = Date.now() - 3600 * 1000; // última hora
    const lista = [];
    let i = 0;
    for (const [nivel, rota, latencia, status, vezes] of ROTEIRO) {
      for (let v = 0; v < vezes; v++) {
        const ts = base + i * 45000 + v * 3000;
        const jitter = Math.floor(latencia * (0.85 + (i + v) % 7 / 20));
        lista.push({
          ts,
          campos: { level: nivel, rota, latencia: jitter, status },
          mensagem: `${nivel} ${rota} status=${status} latencia=${jitter}ms ${MSG[nivel]}`,
        });
      }
      i++;
    }
    lista.sort((a, b) => a.ts - b.ts);
    conta.logs.eventos[grupo] = lista;
    return lista;
  }

  // Lê os eventos do grupo, plantando na primeira vez.
  function eventosDe(conta, grupo, avisar) {
    estado(conta);
    if (!conta.logs.grupos[grupo]) {
      throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the operation: The specified log group does not exist.\nCrie antes com: aws logs create-log-group --log-group-name ${grupo}`);
    }
    if (!conta.logs.eventos[grupo]) {
      semear(conta, grupo);
      if (avisar) avisar();
    }
    return conta.logs.eventos[grupo];
  }

  // registro "achatado" pra consulta: @timestamp/@message + campos do log
  function registroDe(ev) {
    return Object.assign({
      "@timestamp": new Date(ev.ts).toISOString().replace("T", " ").slice(0, 19) + ".000",
      "@message": ev.mensagem,
    }, ev.campos);
  }

  // ============================================================
  // Motor de consulta (subconjunto do Logs Insights)
  //   fields a, b | filter <expr> | stats <agg> [by campo] | sort c [desc] | limit N
  // ============================================================
  const OPS = ["!=", ">=", "<=", "=", ">", "<"];

  function valorLiteral(s) {
    const t = s.trim().replace(/^["']|["']$/g, "");
    const n = Number(t);
    return t !== "" && isFinite(n) && /^-?\d+(\.\d+)?$/.test(t) ? n : t;
  }

  // "level = \"ERROR\" and latencia > 1000" -> função de teste
  function compilarFiltro(expr) {
    const partes = expr.split(/\s+(and|or)\s+/i);
    const testes = [];
    const juntas = [];
    for (let i = 0; i < partes.length; i++) {
      if (i % 2 === 1) { juntas.push(partes[i].toLowerCase()); continue; }
      const p = partes[i].trim();
      // "campo like /texto/" ou "campo like \"texto\""
      const mLike = /^(\S+)\s+like\s+(.+)$/i.exec(p);
      if (mLike) {
        const campo = mLike[1];
        const alvo = mLike[2].trim().replace(/^\/|\/$/g, "").replace(/^["']|["']$/g, "");
        const re = new RegExp(alvo, "i");
        testes.push((r) => re.test(String(r[campo] === undefined ? "" : r[campo])));
        continue;
      }
      const op = OPS.find((o) => p.includes(o));
      if (!op) {
        throw new ErroCli(`An error occurred (MalformedQueryException) when calling the StartQuery operation: não entendi o filtro "${p}".\nO CLImb entende: campo = "valor", campo != "valor", campo > número, campo like /texto/ — ligados por and/or.`);
      }
      const campo = p.slice(0, p.indexOf(op)).trim();
      const valor = valorLiteral(p.slice(p.indexOf(op) + op.length));
      testes.push((r) => {
        const v = r[campo];
        switch (op) {
          case "=": return String(v) === String(valor);
          case "!=": return String(v) !== String(valor);
          case ">": return Number(v) > Number(valor);
          case "<": return Number(v) < Number(valor);
          case ">=": return Number(v) >= Number(valor);
          case "<=": return Number(v) <= Number(valor);
          default: return false;
        }
      });
    }
    return (r) => {
      let ok = testes[0](r);
      for (let i = 1; i < testes.length; i++) {
        ok = juntas[i - 1] === "or" ? (ok || testes[i](r)) : (ok && testes[i](r));
      }
      return ok;
    };
  }

  function agregar(registros, spec) {
    // spec: "count() by level" | "avg(latencia) by rota" | "count()"
    const m = /^(count|avg|sum|min|max)\s*\(\s*([^)]*)\s*\)(?:\s+by\s+(\S+))?$/i.exec(spec.trim());
    if (!m) {
      throw new ErroCli(`An error occurred (MalformedQueryException) when calling the StartQuery operation: não entendi o stats "${spec}".\nO CLImb entende: count(), count(campo), avg(campo), sum(campo), min(campo), max(campo) — com "by campo" opcional.`);
    }
    const fn = m[1].toLowerCase();
    const campo = (m[2] || "").trim();
    const por = m[3];
    const nomeCol = campo ? `${fn}(${campo})` : `${fn}()`;
    const grupos = new Map();
    for (const r of registros) {
      const k = por ? String(r[por]) : "__todos__";
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(r);
    }
    const saida = [];
    for (const [k, lista] of grupos) {
      const nums = campo ? lista.map((r) => Number(r[campo])).filter((n) => isFinite(n)) : [];
      let v;
      if (fn === "count") v = campo ? nums.length : lista.length;
      else if (fn === "avg") v = nums.length ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : 0;
      else if (fn === "sum") v = nums.reduce((a, b) => a + b, 0);
      else if (fn === "min") v = nums.length ? Math.min(...nums) : 0;
      else v = nums.length ? Math.max(...nums) : 0;
      const linha = {};
      if (por) linha[por] = k;
      linha[nomeCol] = v;
      saida.push(linha);
    }
    return { linhas: saida, coluna: nomeCol };
  }

  function rodarConsulta(registros, consulta) {
    const etapas = String(consulta).split("|").map((s) => s.trim()).filter(Boolean);
    let atual = registros;
    let colunas = null;
    let agregou = false;
    for (const etapa of etapas) {
      const mFields = /^fields\s+(.+)$/i.exec(etapa);
      const mFilter = /^filter\s+(.+)$/i.exec(etapa);
      const mStats = /^stats\s+(.+)$/i.exec(etapa);
      const mSort = /^sort\s+(.+)$/i.exec(etapa);
      const mLimit = /^limit\s+(\d+)$/i.exec(etapa);
      if (mFields) colunas = mFields[1].split(",").map((s) => s.trim()).filter(Boolean);
      else if (mFilter) atual = atual.filter(compilarFiltro(mFilter[1]));
      else if (mStats) {
        const r = agregar(atual, mStats[1]);
        atual = r.linhas; agregou = true;
        colunas = Object.keys(r.linhas[0] || {});
      } else if (mSort) {
        const [campo, dir] = mSort[1].split(/\s+/);
        const desc = (dir || "").toLowerCase() === "desc";
        atual = atual.slice().sort((a, b) => {
          const x = a[campo], y = b[campo];
          const nx = Number(x), ny = Number(y);
          const cmp = isFinite(nx) && isFinite(ny) ? nx - ny : String(x).localeCompare(String(y));
          return desc ? -cmp : cmp;
        });
      } else if (mLimit) atual = atual.slice(0, Number(mLimit[1]));
      else {
        throw new ErroCli(`An error occurred (MalformedQueryException) when calling the StartQuery operation: etapa desconhecida "${etapa}".\nO CLImb entende: fields, filter, stats, sort e limit (separados por |).`);
      }
    }
    if (!colunas) colunas = ["@timestamp", "@message"];
    // sem stats, o Insights sempre devolve @ptr junto (é o ponteiro do registro)
    const linhas = atual.map((r) => colunas.map((c) => ({ field: c, value: String(r[c] === undefined ? "" : r[c]) })));
    return { linhas, agregou };
  }

  // ============================================================
  // Comandos
  // ============================================================
  Object.assign(SERVICOS.logs, {
    "filter-log-events": (conta, pos, flags) => {
      const grupo = String(exigirFlag(flags, "log-group-name"));
      let primeiraVez = false;
      const eventos = eventosDe(conta, grupo, () => { primeiraVez = true; });
      const padrao = flags["filter-pattern"] ? String(flags["filter-pattern"]) : "";
      const achados = padrao
        ? eventos.filter((e) => e.mensagem.toLowerCase().includes(padrao.toLowerCase()))
        : eventos;
      const nota = primeiraVez ? "Estes eventos foram plantados pelo CLImb pra você ter o que consultar — numa conta real é a sua aplicação (ou o CloudWatch Agent) que escreve neles. " : "";
      avisarClimb(`${nota}${achados.length} de ${eventos.length} eventos casaram com o padrão. O filter-log-events é a busca SIMPLES: procura um pedaço de texto, sem linguagem de consulta. Pra perguntar "quantos por tipo?" ou "qual a média?", aí é o Logs Insights (start-query).`);
      return js({
        events: achados.slice(0, 20).map((e) => ({
          logStreamName: "app/" + new Date(e.ts).toISOString().slice(0, 10),
          timestamp: e.ts, message: e.mensagem, ingestionTime: e.ts + 800,
        })),
        searchedLogStreams: [],
      });
    },

    "start-query": (conta, pos, flags) => {
      estado(conta);
      const grupo = String(flags["log-group-name"] || flags["log-group-names"] || "");
      if (!grupo) throw new ErroCli("aws: error: the following arguments are required: --log-group-name");
      exigirFlag(flags, "start-time");
      exigirFlag(flags, "end-time");
      const consulta = String(exigirFlag(flags, "query-string"));
      let primeiraVez = false;
      const eventos = eventosDe(conta, grupo, () => { primeiraVez = true; });
      const registros = eventos.map(registroDe);
      const r = rodarConsulta(registros, consulta); // pode lançar ErroCli didático
      const id = hexAleatorio(8) + "-" + hexAleatorio(4) + "-" + hexAleatorio(12);
      conta.logs.consultas[id] = {
        id, grupo, consulta, status: "Complete", linhas: r.linhas,
        escaneados: registros.length, casados: r.linhas.length,
      };
      const nota = primeiraVez ? "Plantei eventos de uma app web nesse grupo pra você ter o que consultar (numa conta real quem escreve é a sua aplicação). " : "";
      avisarClimb(`${nota}Consulta iniciada. Repare que ela é ASSÍNCRONA: o start-query só devolve um queryId — a AWS vai varrendo os logs por trás. Você busca o resultado depois com: aws logs get-query-results --query-id ${id}`);
      return js({ queryId: id });
    },

    "get-query-results": (conta, pos, flags) => {
      estado(conta);
      const id = String(exigirFlag(flags, "query-id"));
      const c = conta.logs.consultas[id];
      if (!c) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the GetQueryResults operation: Query does not exist.\nUse o queryId que o start-query devolveu.`);
      if (c.status === "Cancelled") {
        avisarClimb("Essa consulta foi cancelada (stop-query), então não há resultado. O status vem como Cancelled — na AWS real isso serve pra interromper consulta caríssima em log gigante.");
        return js({ results: [], statistics: { recordsMatched: 0, recordsScanned: 0, bytesScanned: 0 }, status: "Cancelled" });
      }
      const bytes = c.escaneados * 180;
      avisarClimb(`${c.casados} registro(s) no resultado, de ${c.escaneados} escaneados. É esse "escaneados" que a AWS COBRA no Insights — por isso a boa prática é sempre estreitar o período e filtrar cedo na consulta, não no fim.`);
      return js({
        results: c.linhas,
        statistics: { recordsMatched: c.casados, recordsScanned: c.escaneados, bytesScanned: bytes },
        status: "Complete",
      });
    },

    "stop-query": (conta, pos, flags) => {
      estado(conta);
      const id = String(exigirFlag(flags, "query-id"));
      const c = conta.logs.consultas[id];
      if (!c) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the StopQuery operation: Query does not exist.`);
      c.status = "Cancelled";
      avisarClimb("Consulta interrompida. Serve pra cortar uma consulta que ia varrer log demais — no Insights você paga pelo volume ESCANEADO, então parar cedo economiza de verdade.");
      return js({ success: true });
    },
  });

  // ============================================================
  // Atividades (cw-20+ livres) — no fim da trilha do CloudWatch
  // ============================================================
  const NOVAS = [
    { id: "cw-20", servico: "cloudwatch", nivel: 2, xp: 90, titulo: "Ache no log sem linguagem nenhuma",
      descricao: "Antes do jeito sofisticado, o jeito simples: <b>filter-log-events</b> procura um pedaço de texto no log. Busque as linhas que contêm <b>ERROR</b> no grupo <b>/climb/app</b>. <small>(o grupo é o que você criou na primeira atividade da trilha)</small>",
      dicas: ["`filter-…` é a busca direta por texto: você diz o grupo e o padrão.", "A forma do comando é: aws logs filter-log-events --log-group-name <grupo> --filter-pattern <texto>"],
      solucao: ["aws logs filter-log-events --log-group-name /climb/app --filter-pattern ERROR"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "logs", "filter-log-events") },

    { id: "cw-21", servico: "cloudwatch", nivel: 3, xp: 110, titulo: "Sua primeira consulta (Insights)",
      descricao: "Agora o Logs Insights, que tem <b>linguagem de consulta</b>. Inicie uma consulta no <b>/climb/app</b> pedindo os campos <b>@timestamp</b> e <b>@message</b>, com <b>limit 10</b>. <small>(--start-time e --end-time são obrigatórios; use 0 e 9999999999 pra pegar tudo)</small>",
      dicas: ["`start-…` põe a consulta pra rodar. As etapas da consulta são separadas por | (barra vertical), começando por `fields`.", "A forma do comando é: aws logs start-query --log-group-name <grupo> --start-time <epoch> --end-time <epoch> --query-string '<consulta>'"],
      solucao: ["aws logs start-query --log-group-name /climb/app --start-time 0 --end-time 9999999999 --query-string 'fields @timestamp, @message | limit 10'"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "logs", "start-query") },

    { id: "cw-22", servico: "cloudwatch", nivel: 3, xp: 100, titulo: "Busque o resultado",
      descricao: "A consulta é <b>assíncrona</b>: o start-query só devolveu um <b>queryId</b>. Pegue o resultado com ele. <small>(copie o queryId que apareceu na resposta anterior)</small>",
      dicas: ["`get-…` busca um item específico — aqui, o resultado de uma consulta que já foi iniciada.", "A forma do comando é: aws logs get-query-results --query-id <id-que-o-start-devolveu>"],
      solucao: ["aws logs get-query-results --query-id <consulta-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "logs", "get-query-results") },

    { id: "cw-23", servico: "cloudwatch", nivel: 3, xp: 130, titulo: "Só os erros, por favor",
      descricao: "Num plantão você não quer ver tudo — quer o que quebrou. Rode uma consulta no <b>/climb/app</b> filtrando <b>level = \"ERROR\"</b>.",
      dicas: ["A etapa `filter` vem depois do `fields`, separada por |. A comparação usa o nome do campo e o valor entre aspas.", "A forma da consulta é: 'fields @timestamp, @message | filter <campo> = \"<valor>\"'"],
      solucao: ["aws logs start-query --log-group-name /climb/app --start-time 0 --end-time 9999999999 --query-string 'fields @timestamp, @message | filter level = \"ERROR\"'"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "logs", "start-query") && /filter/i.test(String((cmd.flags || {})["query-string"] || "")) },

    { id: "cw-24", servico: "cloudwatch", nivel: 3, xp: 150, titulo: "Quantos de cada tipo?",
      descricao: "A pergunta que o log solto não responde: <b>quantas linhas de cada nível</b>? Use <b>stats count() by level</b> — é o \"GROUP BY\" do Insights.",
      dicas: ["A etapa `stats` agrega. O `by <campo>` diz por que coluna agrupar.", "A forma da consulta é: 'stats count() by <campo>'"],
      solucao: ["aws logs start-query --log-group-name /climb/app --start-time 0 --end-time 9999999999 --query-string 'stats count() by level'"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "logs", "start-query") && /stats/i.test(String((cmd.flags || {})["query-string"] || "")) },

    { id: "cw-25", servico: "cloudwatch", nivel: 4, xp: 180, titulo: "Qual rota está mais lenta?",
      descricao: "A consulta que ganha o plantão: a <b>latência média por rota</b>, da pior pra melhor. Combine <b>stats avg(latencia) by rota</b> com <b>sort</b> decrescente. <small>(descubra qual endpoint está segurando a loja)</small>",
      dicas: ["Duas etapas encadeadas: primeiro agrega com stats, depois ordena com sort. O nome da coluna agregada é o próprio avg(campo).", "A forma da consulta é: 'stats avg(<campo>) by <campo2> | sort avg(<campo>) desc'"],
      solucao: ["aws logs start-query --log-group-name /climb/app --start-time 0 --end-time 9999999999 --query-string 'stats avg(latencia) by rota | sort avg(latencia) desc'"],
      validar: (c, cmd, ok) => {
        const q = String((cmd && cmd.flags || {})["query-string"] || "");
        return ok && ehCmd(cmd, "logs", "start-query") && /stats/i.test(q) && /sort/i.test(q);
      } },
  ];

  if (typeof DESAFIOS !== "undefined" && !DESAFIOS.some((d) => d.id === "cw-20")) {
    let i = -1;
    for (let k = 0; k < DESAFIOS.length; k++) if (DESAFIOS[k].servico === "cloudwatch") i = k;
    if (i >= 0) DESAFIOS.splice(i + 1, 0, ...NOVAS);
    else for (const d of NOVAS) DESAFIOS.push(d);
  }

  // ---------- manuais ----------
  if (typeof MANUAIS !== "undefined") {
    Object.assign(MANUAIS, {
      "logs.filter-log-events": `aws logs filter-log-events\n\nUSO\n    aws logs filter-log-events --log-group-name /climb/app \\\n        [--filter-pattern ERROR]\n\nBusca SIMPLES no log: procura um pedaço de texto, sem linguagem de consulta.\nÉ o "Ctrl+F" do CloudWatch Logs — rápido e suficiente quando você já sabe o\nque procurar.\n\nQuando quiser AGREGAR (quantos por tipo? qual a média?), aí é o Logs\nInsights: aws logs start-query.`,
      "logs.start-query": `aws logs start-query (CloudWatch Logs Insights)\n\nUSO\n    aws logs start-query --log-group-name /climb/app \\\n        --start-time 0 --end-time 9999999999 \\\n        --query-string 'fields @timestamp, @message | filter level = "ERROR" | limit 20'\n\nRoda uma consulta com LINGUAGEM DE CONSULTA. As etapas são separadas por | e\naplicadas em ordem:\n    fields a, b        escolhe as colunas (@timestamp e @message sempre existem)\n    filter <expr>      campo = "valor", != , > , < , campo like /texto/\n                       ligados por and / or\n    stats <f> by <c>   agrega: count(), count(c), avg(c), sum(c), min(c), max(c)\n                       — é o "GROUP BY" do Insights\n    sort <col> [desc]  ordena\n    limit N            corta\n\nÉ ASSÍNCRONA: devolve só um queryId. O resultado vem no get-query-results.\n\nCOBRANÇA: você paga pelo volume ESCANEADO, não pelo que casou. Por isso\nestreite o período e filtre cedo — filtrar no fim custa igual.`,
      "logs.get-query-results": `aws logs get-query-results\n\nUSO\n    aws logs get-query-results --query-id <id-do-start-query>\n\nBusca o resultado de uma consulta do Insights. Traz também "statistics":\n    recordsMatched   quantos registros casaram\n    recordsScanned   quantos foram varridos  <- é isto que a AWS cobra\n    bytesScanned     volume varrido\n\nstatus: Scheduled, Running, Complete, Failed ou Cancelled.`,
      "logs.stop-query": `aws logs stop-query\n\nUSO\n    aws logs stop-query --query-id <id>\n\nInterrompe uma consulta em andamento. Como o Insights cobra pelo volume\nescaneado, parar uma consulta que ia varrer um log gigante economiza de fato.`,
    });
  }

  // ---------- parte didática ----------
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "logs.filter-log-events": "a busca simples no log: procura um pedaço de texto. É o \"Ctrl+F\" do CloudWatch — resolve quando você já sabe o que procurar. Pra agregar (contar, tirar média), aí é o Insights.",
      "logs.start-query": "roda uma consulta com linguagem de verdade sobre o log: filtra, agrupa, ordena. É o que se usa num plantão pra achar o erro no meio de milhões de linhas. Devolve só um queryId — a consulta é assíncrona.",
      "logs.get-query-results": "busca o resultado da consulta. Repare no recordsScanned: é o volume varrido, e é por ele que a AWS cobra — não pelo que casou.",
      "logs.stop-query": "interrompe uma consulta. Como se paga pelo volume escaneado, cortar uma consulta que ia varrer log demais economiza de verdade.",
    });
  }
})();
