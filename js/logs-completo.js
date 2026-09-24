"use strict";
// ============================================================
// CLImb — logs-completo.js
// O `aws logs` tinha 7 dos 110 comandos reais, e a pesquisa de vagas (ver
// [[trilhas-por-profissao]] no vault) apontou ele como o primeiro a crescer:
// "analise de logs" e literalmente a atribuicao escrita nas vagas de Suporte
// Cloud N1/N2, e o SRE vive de log, metrica e alarme.
//
// A meta deste servico e SELETIVA (110 comandos): entra o que um profissional
// usa, nao a cauda. O que entra aqui, e por que:
//
//   RETENCAO — log sem retencao fica pra sempre e voce paga pra sempre. E o
//        item numero um de qualquer faxina de custo, e o CLImb nao ensinava.
//   METRIC FILTER — a ponte que quase ninguem conhece: transforma linha de log
//        em METRICA do CloudWatch, e metrica vira alarme. E assim que "apareceu
//        ERROR no log" vira telefone tocando as 3 da manha.
//   SUBSCRIPTION FILTER — manda o log pra fora em tempo real (Lambda, Kinesis).
//        E o que alimenta SIEM e pipeline de dados.
//   TAIL — o `tail -f` da nuvem. E o comando que quem depura usa o dia inteiro.
//   STREAMS e PUT/GET-LOG-EVENTS — o nivel de baixo: grupo tem stream, stream
//        tem evento. Sem isso o aluno acha que log e um balde so.
//   EXPORT TASK — tirar log do CloudWatch e jogar no S3, que e o que se faz
//        quando a retencao barata acaba mas a auditoria exige guardar.
//
// CARREGA DEPOIS do servicos-fase1.js (que cria SERVICOS.logs) e do
// logs-insights.js (as atividades novas se ancoram nas de la).
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.logs) return;

  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";
  const arnGrupo = (c, n) => "arn:aws:logs:" + REGIAO(c) + ":" + CONTA_ID(c) + ":log-group:" + n;

  function st(conta) {
    conta.logs = conta.logs || { grupos: {} };
    conta.logs.grupos = conta.logs.grupos || {};
    conta.logs.eventos = conta.logs.eventos || {};
    conta.logs.exportacoes = conta.logs.exportacoes || {};
    return conta.logs;
  }
  function grupoDe(conta, flags, op, nomeDireto) {
    st(conta);
    const nome = nomeDireto !== undefined ? nomeDireto : String(exigirFlag(flags, "log-group-name"));
    const g = conta.logs.grupos[nome];
    if (!g) {
      throw new ErroCli(
        "An error occurred (ResourceNotFoundException) when calling the " + op + " operation: The specified log group does not exist.\n" +
        "Crie antes com: aws logs create-log-group --log-group-name " + nome
      );
    }
    g.streams = g.streams || {};
    g.filtros = g.filtros || {};
    g.assinaturas = g.assinaturas || {};
    g.tags = g.tags || {};
    return [nome, g];
  }
  // O tokenizer entrega a flag so o PRIMEIRO token; o resto da lista cai nos
  // posicionais. Mesmo remendo do js/sqs-completo.js, pelo mesmo motivo: mexer
  // no tokenizer afetaria todos os comandos do simulador.
  function juntarLista(valor, pos) {
    return [String(valor)].concat((pos || []).map(String)).join(" ").trim();
  }
  function estruturas(texto, op) {
    const partes = texto.split(/\s+/).filter(Boolean);
    const saida = partes
      .map((p) => (typeof parsearShorthand === "function" ? parsearShorthand(p) : {}))
      .filter((e) => e && Object.keys(e).length);
    if (!saida.length) {
      throw new ErroCli("An error occurred (InvalidParameterException) when calling the " + op + " operation: Missing required parameter.");
    }
    return saida;
  }

  // Os unicos valores que a AWS aceita em --retention-in-days. Numero fora
  // desta lista e erro de verdade, e e um erro que todo mundo comete.
  const RETENCOES = [1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653];

  Object.assign(SERVICOS.logs, {
    // ---------- retenção: o item nº 1 da faxina de custo ----------
    "put-retention-policy": (conta, pos, flags) => {
      const [nome, g] = grupoDe(conta, flags, "PutRetentionPolicy");
      const dias = Number(exigirFlag(flags, "retention-in-days"));
      if (RETENCOES.indexOf(dias) < 0) {
        throw new ErroCli(
          "An error occurred (InvalidParameterException) when calling the PutRetentionPolicy operation: 1 validation error detected: Value '" + dias + "' at 'retentionInDays' failed to satisfy constraint.\n" +
          "Valores aceitos: " + RETENCOES.join(", ")
        );
      }
      g.retencao = dias;
      avisarClimb(
        "Agora o \"" + nome + "\" apaga sozinho o que passa de " + dias + " dias. Sem política de retenção o grupo guarda " +
        "PARA SEMPRE — e você paga armazenamento pra sempre por log que ninguém vai ler. É o primeiro item de qualquer faxina de custo."
      );
      return okSilencioso("Retenção do grupo \"" + nome + "\" ajustada pra " + dias + " dias.");
    },
    "delete-retention-policy": (conta, pos, flags) => {
      const [nome, g] = grupoDe(conta, flags, "DeleteRetentionPolicy");
      delete g.retencao;
      avisarClimb("Sem política de retenção, o grupo volta a guardar PARA SEMPRE (Never expire). Às vezes é isso que a auditoria exige — mas é escolha, não esquecimento.");
      return okSilencioso("Retenção removida do grupo \"" + nome + "\": volta a nunca expirar.");
    },

    // ---------- streams: o nível de baixo ----------
    "create-log-stream": (conta, pos, flags) => {
      const [nome, g] = grupoDe(conta, flags, "CreateLogStream");
      const stream = String(exigirFlag(flags, "log-stream-name"));
      if (g.streams[stream]) {
        throw new ErroCli("An error occurred (ResourceAlreadyExistsException) when calling the CreateLogStream operation: The specified log stream already exists");
      }
      g.streams[stream] = { nome: stream, criadoEm: Date.now(), eventos: [] };
      avisarClimb("Grupo guarda stream, stream guarda evento. Na prática cada instância, container ou execução de Lambda escreve no SEU stream — é por isso que o grupo de uma Lambda tem centenas deles.");
      return okSilencioso("Stream \"" + stream + "\" criado em \"" + nome + "\".");
    },
    "describe-log-streams": (conta, pos, flags) => {
      const nomeFlag = flags["log-group-name"] || flags["log-group-identifier"];
      if (!nomeFlag) throw new ErroCli("An error occurred (InvalidParameterException) when calling the DescribeLogStreams operation: Must include one of logGroupName or logGroupIdentifier");
      const [nome, g] = grupoDe(conta, flags, "DescribeLogStreams", String(nomeFlag));
      const lista = Object.values(g.streams);
      if (!lista.length) {
        avisarClimb("Nenhum stream nesse grupo ainda. Crie um com: aws logs create-log-stream --log-group-name " + nome + " --log-stream-name <nome>");
        return "";
      }
      return js({ logStreams: lista.map((s) => ({
        logStreamName: s.nome,
        creationTime: s.criadoEm,
        storedBytes: s.eventos.reduce((a, e) => a + String(e.message).length, 0),
        lastEventTimestamp: s.eventos.length ? s.eventos[s.eventos.length - 1].timestamp : undefined,
        arn: arnGrupo(conta, nome) + ":log-stream:" + s.nome,
      })) });
    },
    "put-log-events": (conta, pos, flags) => {
      const [, g] = grupoDe(conta, flags, "PutLogEvents");
      const stream = String(exigirFlag(flags, "log-stream-name"));
      const s = g.streams[stream];
      if (!s) {
        throw new ErroCli(
          "An error occurred (ResourceNotFoundException) when calling the PutLogEvents operation: The specified log stream does not exist.\n" +
          "Crie antes com: aws logs create-log-stream --log-group-name <grupo> --log-stream-name " + stream
        );
      }
      const eventos = estruturas(juntarLista(exigirFlag(flags, "log-events"), pos), "PutLogEvents");
      for (const e of eventos) {
        if (e.message === undefined) throw new ErroCli("An error occurred (InvalidParameterException) when calling the PutLogEvents operation: Missing required parameter in logEvents: message");
        if (e.timestamp === undefined) throw new ErroCli("An error occurred (InvalidParameterException) when calling the PutLogEvents operation: Missing required parameter in logEvents: timestamp");
        s.eventos.push({ timestamp: Number(e.timestamp), message: String(e.message) });
      }
      s.eventos.sort((a, b) => a.timestamp - b.timestamp);
      avisarClimb("O timestamp vai em MILISSEGUNDOS desde 1970 — na linha de comando de verdade você gera com $(date +%s)000. Evento com data muito velha a AWS recusa.");
      return js({ nextSequenceToken: "4956" + hexAleatorio(20) });
    },
    "get-log-events": (conta, pos, flags) => {
      const nomeFlag = flags["log-group-name"] || flags["log-group-identifier"];
      if (!nomeFlag) throw new ErroCli("An error occurred (InvalidParameterException) when calling the GetLogEvents operation: Must include one of logGroupName or logGroupIdentifier");
      const [, g] = grupoDe(conta, flags, "GetLogEvents", String(nomeFlag));
      const stream = String(exigirFlag(flags, "log-stream-name"));
      const s = g.streams[stream];
      if (!s) throw new ErroCli("An error occurred (ResourceNotFoundException) when calling the GetLogEvents operation: The specified log stream does not exist.");
      const limite = parseInt(flags.limit || "50", 10);
      const eventos = s.eventos.slice(0, Math.max(1, limite));
      if (!eventos.length) {
        avisarClimb("Stream vazio. Escreva nele com: aws logs put-log-events --log-group-name <grupo> --log-stream-name " + stream + " --log-events timestamp=<ms>,message=<texto>");
        return "";
      }
      return js({ events: eventos.map((e) => ({ timestamp: e.timestamp, message: e.message, ingestionTime: e.timestamp + 120 })), nextForwardToken: "f/" + hexAleatorio(24) });
    },

    // ---------- tail: o `tail -f` da nuvem ----------
    tail: (conta, pos, flags) => {
      st(conta);
      const nome = String((pos && pos[0]) || flags["log-group-name"] || "");
      if (!nome) {
        throw new ErroCli("usage: aws logs tail <group_name> [--since 1h] [--filter-pattern ERROR]\nO nome do grupo e POSICIONAL aqui — não leva --log-group-name.");
      }
      const [, g] = grupoDe(conta, flags, "Tail", nome);
      let linhas = (conta.logs.eventos[nome] || []).map((e) => ({ ts: e.ts, msg: e.mensagem, stream: "app/producao" }));
      for (const s of Object.values(g.streams)) {
        for (const e of s.eventos) linhas.push({ ts: e.timestamp, msg: e.message, stream: s.nome });
      }
      const padrao = flags["filter-pattern"];
      if (padrao) linhas = linhas.filter((l) => String(l.msg).toLowerCase().indexOf(String(padrao).toLowerCase()) >= 0);
      linhas.sort((a, b) => a.ts - b.ts);
      if (!linhas.length) {
        avisarClimb("Nenhum evento no período. O `tail` mostra o que JÁ está lá; com --follow ele fica aberto esperando o próximo (e aí você sai com Ctrl+C).");
        return "";
      }
      if (flags.follow !== undefined) {
        avisarClimb("No terminal de verdade o --follow deixaria o comando ABERTO, imprimindo cada linha nova até você apertar Ctrl+C. Aqui ele mostra o que já existe e volta.");
      }
      return linhas.slice(-25).map((l) =>
        new Date(l.ts).toISOString().replace("T", " ").slice(0, 19) + " " + l.stream + " " + l.msg
      ).join("\n");
    },

    // ---------- metric filter: de linha de log a telefone tocando ----------
    "put-metric-filter": (conta, pos, flags) => {
      const [nome, g] = grupoDe(conta, flags, "PutMetricFilter");
      const filtro = String(exigirFlag(flags, "filter-name"));
      const padrao = String(exigirFlag(flags, "filter-pattern"));
      const trans = estruturas(juntarLista(exigirFlag(flags, "metric-transformations"), pos), "PutMetricFilter");
      for (const t of trans) {
        if (!t.metricName || !t.metricNamespace) {
          throw new ErroCli(
            "An error occurred (InvalidParameterException) when calling the PutMetricFilter operation: metricTransformation requires metricName and metricNamespace.\n" +
            "Forma: --metric-transformations metricName=ErrosApp,metricNamespace=Climb,metricValue=1"
          );
        }
      }
      g.filtros[filtro] = { nome: filtro, padrao: padrao, transformacoes: trans, criadoEm: Date.now() };
      avisarClimb(
        "Isto é a ponte que quase ninguém conhece: cada linha de \"" + nome + "\" que casar com o padrão vira +1 na métrica \"" +
        trans[0].metricName + "\" do CloudWatch. E métrica tem alarme. É assim que 'apareceu ERROR no log' vira telefone tocando — " +
        "sem isso alguém precisa estar OLHANDO o log pra descobrir."
      );
      return okSilencioso("Filtro de métrica \"" + filtro + "\" criado em \"" + nome + "\".");
    },
    "describe-metric-filters": (conta, pos, flags) => {
      const nomeFlag = flags["log-group-name"];
      if (!nomeFlag) throw new ErroCli("An error occurred (InvalidParameterException) when calling the DescribeMetricFilters operation: Must include logGroupName");
      const [nome, g] = grupoDe(conta, flags, "DescribeMetricFilters", String(nomeFlag));
      const lista = Object.values(g.filtros);
      if (!lista.length) {
        avisarClimb("Nenhum filtro de métrica nesse grupo. O log está sendo guardado, mas nada nele vira alarme.");
        return "";
      }
      return js({ metricFilters: lista.map((f) => ({
        filterName: f.nome, filterPattern: f.padrao, logGroupName: nome,
        creationTime: f.criadoEm,
        metricTransformations: f.transformacoes.map((t) => ({
          metricName: t.metricName, metricNamespace: t.metricNamespace, metricValue: String(t.metricValue || "1"),
        })),
      })) });
    },
    "delete-metric-filter": (conta, pos, flags) => {
      const [nome, g] = grupoDe(conta, flags, "DeleteMetricFilter");
      const filtro = String(exigirFlag(flags, "filter-name"));
      if (!g.filtros[filtro]) throw new ErroCli("An error occurred (ResourceNotFoundException) when calling the DeleteMetricFilter operation: The specified metric filter does not exist.");
      delete g.filtros[filtro];
      return okSilencioso("Filtro \"" + filtro + "\" removido de \"" + nome + "\".");
    },

    // ---------- subscription filter: o log saindo em tempo real ----------
    "put-subscription-filter": (conta, pos, flags) => {
      const [nome, g] = grupoDe(conta, flags, "PutSubscriptionFilter");
      const filtro = String(exigirFlag(flags, "filter-name"));
      const padrao = String(flags["filter-pattern"] !== undefined ? flags["filter-pattern"] : "");
      const destino = String(exigirFlag(flags, "destination-arn"));
      if (destino.indexOf("arn:aws:") !== 0) {
        throw new ErroCli("An error occurred (InvalidParameterException) when calling the PutSubscriptionFilter operation: destinationArn must be a valid ARN.");
      }
      if (Object.keys(g.assinaturas).length >= 2 && !g.assinaturas[filtro]) {
        throw new ErroCli("An error occurred (LimitExceededException) when calling the PutSubscriptionFilter operation: Resource limit exceeded.\nUm grupo aceita no máximo 2 filtros de assinatura.");
      }
      g.assinaturas[filtro] = { nome: filtro, padrao: padrao, destino: destino };
      avisarClimb(
        "Agora cada linha que casar sai de \"" + nome + "\" em TEMPO REAL pro destino, sem ninguém consultar nada. " +
        "É assim que log alimenta SIEM, alerta e pipeline de dados. Limite da AWS: 2 assinaturas por grupo."
      );
      return okSilencioso("Assinatura \"" + filtro + "\" criada em \"" + nome + "\".");
    },
    "describe-subscription-filters": (conta, pos, flags) => {
      const [nome, g] = grupoDe(conta, flags, "DescribeSubscriptionFilters");
      const lista = Object.values(g.assinaturas);
      if (!lista.length) {
        avisarClimb("Nenhuma assinatura nesse grupo: o log fica parado esperando alguém consultar.");
        return "";
      }
      return js({ subscriptionFilters: lista.map((f) => ({
        filterName: f.nome, logGroupName: nome, filterPattern: f.padrao, destinationArn: f.destino,
      })) });
    },
    "delete-subscription-filter": (conta, pos, flags) => {
      const [nome, g] = grupoDe(conta, flags, "DeleteSubscriptionFilter");
      const filtro = String(exigirFlag(flags, "filter-name"));
      if (!g.assinaturas[filtro]) throw new ErroCli("An error occurred (ResourceNotFoundException) when calling the DeleteSubscriptionFilter operation: The specified subscription filter does not exist.");
      delete g.assinaturas[filtro];
      return okSilencioso("Assinatura \"" + filtro + "\" removida de \"" + nome + "\".");
    },

    // ---------- export: tirar do CloudWatch e guardar barato ----------
    "create-export-task": (conta, pos, flags) => {
      const [nome] = grupoDe(conta, flags, "CreateExportTask");
      const de = Number(exigirFlag(flags, "from"));
      const ate = Number(exigirFlag(flags, "to"));
      const destino = String(exigirFlag(flags, "destination"));
      if (!(ate > de)) {
        throw new ErroCli("An error occurred (InvalidParameterException) when calling the CreateExportTask operation: The parameter 'to' must be greater than 'from'.");
      }
      if (!(conta.s3 && conta.s3.buckets[destino])) {
        throw new ErroCli(
          "An error occurred (InvalidParameterException) when calling the CreateExportTask operation: The given bucket does not exist.\n" +
          "Crie antes com: aws s3 mb s3://" + destino
        );
      }
      const id = hexAleatorio(8) + "-" + hexAleatorio(4) + "-" + hexAleatorio(12);
      st(conta).exportacoes[id] = {
        id: id, grupo: nome, destino: destino, de: de, ate: ate,
        estado: "COMPLETED", nomeTarefa: flags["task-name"] ? String(flags["task-name"]) : "export-" + nome.replace(/[^a-z0-9]/gi, "-"),
      };
      avisarClimb(
        "Exportar tira o log do CloudWatch e joga no S3, que é MUITO mais barato por GB guardado. " +
        "É o combo de sempre: retenção curta no CloudWatch pro dia a dia, export pro S3 pro que a auditoria exige guardar por anos."
      );
      return js({ taskId: id });
    },
    "describe-export-tasks": (conta) => {
      const lista = Object.values(st(conta).exportacoes);
      if (!lista.length) {
        avisarClimb("Nenhuma exportação ainda. Comece uma com: aws logs create-export-task --log-group-name <grupo> --from <ms> --to <ms> --destination <bucket>");
        return "";
      }
      return js({ exportTasks: lista.map((t) => ({
        taskId: t.id, taskName: t.nomeTarefa, logGroupName: t.grupo,
        destination: t.destino, from: t.de, to: t.ate,
        status: { code: t.estado, message: "Completed successfully" },
      })) });
    },

    // ---------- etiquetas e consultas ----------
    "tag-resource": (conta, pos, flags) => {
      const arn = String(exigirFlag(flags, "resource-arn"));
      const nome = arn.split(":log-group:")[1];
      const [, g] = grupoDe(conta, flags, "TagResource", String(nome || "").replace(/:\*$/, ""));
      const tags = estruturas(juntarLista(exigirFlag(flags, "tags"), pos), "TagResource");
      Object.assign(g.tags, tags[0]);
      avisarClimb("Aqui a etiqueta vai no ARN do grupo, não no nome — repare que este comando pede --resource-arn. É por Tag que o relatório de custo separa o log de cada time.");
      return okSilencioso("Grupo etiquetado: " + Object.keys(tags[0]).join(", ") + ".");
    },
    "untag-resource": (conta, pos, flags) => {
      const arn = String(exigirFlag(flags, "resource-arn"));
      const nome = String(arn.split(":log-group:")[1] || "").replace(/:\*$/, "");
      const [, g] = grupoDe(conta, flags, "UntagResource", nome);
      const chaves = juntarLista(exigirFlag(flags, "tag-keys"), pos).split(/[,\s]+/).filter(Boolean);
      for (const k of chaves) delete g.tags[k];
      return okSilencioso("Etiquetas removidas: " + chaves.join(", ") + ".");
    },
    "list-tags-for-resource": (conta, pos, flags) => {
      const arn = String(exigirFlag(flags, "resource-arn"));
      const nome = String(arn.split(":log-group:")[1] || "").replace(/:\*$/, "");
      const [, g] = grupoDe(conta, flags, "ListTagsForResource", nome);
      if (!Object.keys(g.tags).length) {
        avisarClimb("Grupo sem etiqueta: no relatório de custo esse log não tem dono.");
        return "";
      }
      return js({ tags: g.tags });
    },
    "describe-queries": (conta, pos, flags) => {
      st(conta);
      const todas = Object.entries(conta.logs.consultas || {});
      const filtro = flags["log-group-name"];
      const lista = todas
        .map(([id, q]) => ({ id: id, q: q }))
        .filter((x) => !filtro || (x.q && x.q.grupo === String(filtro)));
      if (!lista.length) {
        avisarClimb("Nenhuma consulta do Insights registrada. Comece uma com: aws logs start-query --log-group-name <grupo> --start-time 0 --end-time 9999999999 --query-string 'fields @message'");
        return "";
      }
      return js({ queries: lista.map((x) => ({
        queryId: x.id,
        queryString: (x.q && x.q.consulta) || "",
        status: (x.q && x.q.estado) || "Complete",
        logGroupName: (x.q && x.q.grupo) || "",
      })) });
    },
  });

  // ============================================================
  // MANUAIS — comando sem verbete derruba o teste de fumaça
  // ============================================================
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => "USO\n    " + uso + "\n\n" + txt;
    Object.assign(MANUAIS, {
      "logs.put-retention-policy": M(
        "aws logs put-retention-policy --log-group-name /app/prod --retention-in-days 30",
        "Diz por quantos dias o grupo guarda log. SEM ISSO O PADRÃO É PARA\nSEMPRE, e você paga armazenamento eterno por log que ninguém lê —\né o item nº 1 de qualquer faxina de custo.\n\nVALORES ACEITOS (não é qualquer número)\n    1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545,\n    731, 1096, 1827, 2192, 2557, 2922, 3288, 3653"),
      "logs.delete-retention-policy": M(
        "aws logs delete-retention-policy --log-group-name /app/prod",
        "Tira a política: o grupo volta a guardar para sempre (Never expire).\nÀs vezes é o que a auditoria exige — mas que seja escolha, não\nesquecimento."),
      "logs.create-log-stream": M(
        "aws logs create-log-stream --log-group-name /app/prod --log-stream-name instancia-01",
        "Grupo guarda stream, stream guarda evento. Na prática cada instância,\ncontêiner ou execução de Lambda escreve no SEU stream — por isso o\ngrupo de uma Lambda tem centenas deles."),
      "logs.describe-log-streams": M(
        "aws logs describe-log-streams --log-group-name /app/prod [--order-by LastEventTime --descending]",
        "Lista os streams do grupo, com tamanho e horário do último evento.\nCom --order-by LastEventTime --descending o primeiro da lista é quem\nescreveu por último — o jeito rápido de achar quem ainda está vivo."),
      "logs.put-log-events": M(
        "aws logs put-log-events --log-group-name /app/prod --log-stream-name instancia-01 --log-events timestamp=1789000000000,message=\"subiu\"",
        "Escreve evento no stream. O timestamp vai em MILISSEGUNDOS desde\n1970 — no terminal você gera com $(date +%s)000. Evento com data\nmuito antiga a AWS recusa."),
      "logs.get-log-events": M(
        "aws logs get-log-events --log-group-name /app/prod --log-stream-name instancia-01 [--limit 20]",
        "Lê os eventos de UM stream, em ordem. Diferente do\nfilter-log-events, que varre o grupo inteiro: aqui você já sabe de\nquem quer ler."),
      "logs.tail": M(
        "aws logs tail /app/prod --since 1h [--follow] [--filter-pattern ERROR]",
        "O `tail -f` da nuvem, e o comando que quem depura usa o dia inteiro.\n\nREPARE: o nome do grupo é POSICIONAL, não leva --log-group-name.\n--since aceita 5m, 1h, 2d. Com --follow o comando fica aberto\nimprimindo cada linha nova até você apertar Ctrl+C."),
      "logs.put-metric-filter": M(
        "aws logs put-metric-filter --log-group-name /app/prod --filter-name erros --filter-pattern ERROR \\\n        --metric-transformations metricName=ErrosApp,metricNamespace=Climb,metricValue=1",
        "A ponte que quase ninguém conhece: cada linha que casar com o padrão\nvira +1 numa MÉTRICA do CloudWatch. E métrica tem alarme.\n\nÉ assim que \"apareceu ERROR no log\" vira telefone tocando às 3 da\nmanhã — sem isso, alguém precisa estar OLHANDO o log pra descobrir."),
      "logs.describe-metric-filters": M(
        "aws logs describe-metric-filters --log-group-name /app/prod",
        "Mostra o que daquele log está virando métrica. Resposta vazia quer\ndizer que o log está sendo guardado e nada nele vira alarme."),
      "logs.delete-metric-filter": M(
        "aws logs delete-metric-filter --log-group-name /app/prod --filter-name erros",
        "Remove o filtro. O alarme que dependia da métrica para de receber\ndado — e alarme sem dado fica em INSUFFICIENT_DATA, não em OK."),
      "logs.put-subscription-filter": M(
        "aws logs put-subscription-filter --log-group-name /app/prod --filter-name para-lambda \\\n        --filter-pattern ERROR --destination-arn arn:aws:lambda:...:function:trata-erro",
        "Manda cada linha que casar pra FORA em tempo real: Lambda, Kinesis\nou Firehose. É o que alimenta SIEM, alerta e pipeline de dados.\n\nLIMITE: 2 assinaturas por grupo de log."),
      "logs.describe-subscription-filters": M(
        "aws logs describe-subscription-filters --log-group-name /app/prod",
        "Mostra para onde esse log está sendo despejado em tempo real."),
      "logs.delete-subscription-filter": M(
        "aws logs delete-subscription-filter --log-group-name /app/prod --filter-name para-lambda",
        "Corta o envio em tempo real. O log continua sendo guardado no grupo."),
      "logs.create-export-task": M(
        "aws logs create-export-task --log-group-name /app/prod --from 1788000000000 --to 1789000000000 --destination meu-bucket",
        "Tira o log do CloudWatch e joga num bucket S3, que é muito mais\nbarato por GB guardado.\n\nO combo de sempre: retenção curta no CloudWatch pro dia a dia,\nexport pro S3 pro que a auditoria exige guardar por anos."),
      "logs.describe-export-tasks": M(
        "aws logs describe-export-tasks",
        "Acompanha as exportações: qual grupo, pra qual bucket e em que\nestado (RUNNING, COMPLETED, FAILED)."),
      "logs.tag-resource": M(
        "aws logs tag-resource --resource-arn arn:aws:logs:us-east-1:123456789012:log-group:/app/prod --tags Time=plataforma",
        "Etiqueta o grupo. REPARE: aqui vai o ARN, não o nome — este comando\nnão tem --log-group-name."),
      "logs.untag-resource": M(
        "aws logs untag-resource --resource-arn <arn-do-grupo> --tag-keys Time",
        "Tira etiquetas do grupo, pelas chaves."),
      "logs.list-tags-for-resource": M(
        "aws logs list-tags-for-resource --resource-arn <arn-do-grupo>",
        "Mostra as etiquetas do grupo. Grupo sem etiqueta é log sem dono no\nrelatório de custo."),
      "logs.describe-queries": M(
        "aws logs describe-queries [--log-group-name /app/prod] [--status Running]",
        "Lista as consultas do Logs Insights e o estado de cada uma. Serve\npra achar a consulta cara que alguém deixou rodando — é ela que você\nmata com o stop-query."),
    });
  }

  // ============================================================
  // PORQUE — por que o comando EXISTE
  // ============================================================
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "logs.put-retention-policy": "diz por quantos dias guardar o log. Sem isso é para sempre — e você paga para sempre.",
      "logs.delete-retention-policy": "devolve o grupo ao 'nunca expira', quando a auditoria exige guardar tudo.",
      "logs.create-log-stream": "cria o canal onde uma instância, contêiner ou execução escreve.",
      "logs.describe-log-streams": "mostra quem escreveu no grupo e quando foi a última linha.",
      "logs.put-log-events": "escreve evento no stream (é o que a aplicação faz por baixo).",
      "logs.get-log-events": "lê os eventos de um stream específico, quando você já sabe de quem quer ler.",
      "logs.tail": "acompanha o log ao vivo, como o tail -f do Linux — o comando de quem está depurando.",
      "logs.put-metric-filter": "transforma linha de log em métrica do CloudWatch, e é assim que log vira alarme.",
      "logs.describe-metric-filters": "mostra o que daquele log está virando métrica.",
      "logs.delete-metric-filter": "desliga essa transformação.",
      "logs.put-subscription-filter": "manda o log pra fora em tempo real (Lambda, Kinesis) — é o que alimenta SIEM e pipeline.",
      "logs.describe-subscription-filters": "mostra para onde o log está sendo despejado.",
      "logs.delete-subscription-filter": "corta o envio em tempo real sem apagar o log.",
      "logs.create-export-task": "manda o log pro S3, que é muito mais barato pra guardar por anos.",
      "logs.describe-export-tasks": "acompanha essas exportações.",
      "logs.tag-resource": "etiqueta o grupo pra saber de qual time é aquele custo de log.",
      "logs.untag-resource": "tira etiqueta que não vale mais.",
      "logs.list-tags-for-resource": "mostra de quem é o grupo.",
      "logs.describe-queries": "lista as consultas do Insights e acha a que alguém deixou rodando.",
    });
  }

  // ============================================================
  // ATIVIDADES
  // ============================================================
  if (typeof DESAFIOS === "undefined") return;

  function d(id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar) {
    return { id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar };
  }
  function at(anchorId, novos) {
    const i = DESAFIOS.findIndex((x) => x.id === anchorId);
    if (i < 0) { for (const n of novos) DESAFIOS.push(n); return; }
    DESAFIOS.splice(i + 1, 0, ...novos);
  }
  const ARN = (n) => "arn:aws:logs:us-east-1:123456789012:log-group:" + n;
  const grupo = (c, n) => ((c.logs || {}).grupos || {})[n];

  // --- operar o grupo: retenção, streams e etiqueta ---
  at("cw-9", [
    d("logsc-ret1", "cloudwatch", 2, 80, "O log de 2023 que ninguém nunca leu",
      "A fatura do CloudWatch subiu e a investigação achou a causa: nenhum grupo tem política de retenção, então tudo fica guardado <b>para sempre</b>. Comece pelo <b>/nginx/acessos</b>, que é o mais volumoso: guarde <b>30</b> dias.",
      ["Retenção não se define na criação do grupo — é um comando separado, e é por isso que quase todo mundo esquece.", "A flag é `--retention-in-days`, e ela não aceita qualquer número: a AWS tem uma lista fechada."],
      ["aws logs put-retention-policy --log-group-name /nginx/acessos --retention-in-days 30"],
      (c) => (grupo(c, "/nginx/acessos") || {}).retencao === 30),
    d("logsc-ret2", "cloudwatch", 2, 70, "O jurídico pediu um ano",
      "Log de erro da API e prova em disputa com cliente, e o jurídico pediu <b>um ano</b> de guarda. Ajuste o <b>/api/erros</b> pra <b>365</b> dias. <small>(repare que 400 também vale, mas 300 não — a lista e fechada)</small>",
      ["Mesmo comando do exercicio anterior, outro prazo.", "Se errar o número, a mensagem da AWS lista todos os valores aceitos — vale ler uma vez."],
      ["aws logs put-retention-policy --log-group-name /api/erros --retention-in-days 365"],
      (c) => (grupo(c, "/api/erros") || {}).retencao === 365),
    d("logsc-ret3", "cloudwatch", 2, 70, "Este aqui não pode expirar nunca",
      "Auditoria bateu na porta: o <b>/app/lambda</b> não pode perder nada, nunca. Primeiro coloque <b>90</b> dias nele e depois <b>remova a política</b>, devolvendo o grupo ao 'nunca expira'.",
      ["Remover retenção não é colocar um número gigante: é um comando próprio.", "Apagar no AWS CLI é quase sempre `delete-…` do mesmo par que o `put-…`."],
      ["aws logs put-retention-policy --log-group-name /app/lambda --retention-in-days 90",
        "aws logs delete-retention-policy --log-group-name /app/lambda"],
      (c, cmd, ok) => ok && ehCmd(cmd, "logs", "delete-retention-policy") &&
        !!grupo(c, "/app/lambda") && (grupo(c, "/app/lambda") || {}).retencao === undefined),
    d("logsc-str1", "cloudwatch", 2, 80, "Quem ainda estÃ¡ escrevendo nesse log?",
      "Três servidores mandam log pro mesmo grupo e um deles parou de responder. Crie o grupo <b>/frota/web</b>, crie os streams <b>servidor-01</b> e <b>servidor-02</b> e <b>liste os streams</b> — é essa lista que mostra quem escreveu por último.",
      ["Grupo guarda stream, stream guarda evento: são dois niveis, não um.", "Depois de criar, liste com o `describe-…` da mesma família."],
      ["aws logs create-log-group --log-group-name /frota/web",
        "aws logs create-log-stream --log-group-name /frota/web --log-stream-name servidor-01",
        "aws logs create-log-stream --log-group-name /frota/web --log-stream-name servidor-02",
        "aws logs describe-log-streams --log-group-name /frota/web"],
      (c, cmd, ok) => ok && ehCmd(cmd, "logs", "describe-log-streams") &&
        Object.keys(((grupo(c, "/frota/web") || {}).streams) || {}).length >= 2),
    d("logsc-str2", "cloudwatch", 2, 90, "Escreva e leia de volta",
      "Antes de ligar a aplicação de verdade, teste o caminho: escreva a linha <b>deploy concluido</b> no stream <b>servidor-01</b> do <b>/frota/web</b> e leia ela de volta. <small>(o timestamp vai em milissegundos desde 1970 — no terminal seria <code>$(date +%s)000</code>)</small>",
      ["São dois comandos irmãos: um `put-…` e um `get-…`.", "O evento vai na forma abreviada `timestamp=<ms>,message=<texto>`.", "Pra ler, você precisa dizer o grupo E o stream — o get-log-events le UM stream, não o grupo inteiro."],
      ["aws logs put-log-events --log-group-name /frota/web --log-stream-name servidor-01 --log-events timestamp=1789000000000,message=deploy-concluido",
        "aws logs get-log-events --log-group-name /frota/web --log-stream-name servidor-01"],
      (c, cmd, ok) => ok && ehCmd(cmd, "logs", "get-log-events") &&
        ((((grupo(c, "/frota/web") || {}).streams) || {})["servidor-01"] || { eventos: [] }).eventos.length >= 1),
    d("logsc-tag1", "cloudwatch", 2, 70, "De qual time é esse log?",
      "O relatório de custo mostra o CloudWatch inteiro num bolo só. Etiquete o <b>/frota/web</b> com <b>Time=plataforma</b> e confira lendo as etiquetas de volta.",
      ["Cuidado: este comando é um dos poucos do `aws logs` que NÃO aceita --log-group-name.", "Ele pede o ARN do grupo, que tem a forma `arn:aws:logs:<região>:<conta>:log-group:<nome>`."],
      ["aws logs tag-resource --resource-arn " + ARN("/frota/web") + " --tags Time=plataforma",
        "aws logs list-tags-for-resource --resource-arn " + ARN("/frota/web")],
      (c) => ((grupo(c, "/frota/web") || {}).tags || {}).Time === "plataforma"),
    d("logsc-tag2", "cloudwatch", 2, 60, "O time mudou de nome",
      "A equipe <b>plataforma</b> virou <b>infra</b> e a etiqueta velha agora mente no relatório. Remova a etiqueta <b>Time</b> do <b>/frota/web</b>.",
      ["Remover é por CHAVE, não por par chave=valor.", "A flag é `--tag-keys`, e o ARN continua sendo obrigatório."],
      ["aws logs untag-resource --resource-arn " + ARN("/frota/web") + " --tag-keys Time"],
      (c, cmd, ok) => ok && ehCmd(cmd, "logs", "untag-resource") &&
        ((grupo(c, "/frota/web") || {}).tags || {}).Time === undefined),
  ]);

  // --- ler ao vivo, logo depois do filter-log-events ---
  at("cw-20", [
    d("logsc-tail1", "cloudwatch", 2, 80, "O tail -f da nuvem",
      "Reclamaram de erro no site agora há pouco e você quer ver o log <b>acontecendo</b>, não montar consulta. Acompanhe a última hora do <b>/climb/app</b>.",
      ["Este comando é diferente de todos os outros do `aws logs`: o nome do grupo e POSICIONAL, sem --log-group-name.", "O recorte de tempo e `--since`, que aceita 5m, 1h, 2d."],
      ["aws logs tail /climb/app --since 1h"],
      (c, cmd, ok) => ok && ehCmd(cmd, "logs", "tail")),
    d("logsc-tail2", "cloudwatch", 2, 80, "Só o que interessa no meio do barulho",
      "O log do <b>/climb/app</b> tem linha demais pra ler no olho. Acompanhe de novo, mas mostrando <b>só as linhas com ERROR</b>.",
      ["Dá pra filtrar sem sair do tail — é a mesma ideia do `grep`, só que do lado do servidor.", "A flag é `--filter-pattern`, igual a do filter-log-events."],
      ["aws logs tail /climb/app --since 1h --filter-pattern ERROR"],
      (c, cmd, ok) => ok && ehCmd(cmd, "logs", "tail") && String(cmd.flags["filter-pattern"] || "") === "ERROR"),
  ]);

  // --- de log a alarme, e o log saindo pra fora (o clímax da trilha) ---
  at("cob-logs-1", [
    d("logsc-mf1", "cloudwatch", 3, 140, "Pare de olhar o log esperando erro",
      "Hoje alguém só descobre que a aplicação quebrou se estiver <b>olhando</b> o log. Isso não escala e não funciona de madrugada. Crie um filtro de métrica no <b>/climb/app</b> chamado <b>conta-erros</b> que transforme cada linha com <b>ERROR</b> em <b>+1</b> na métrica <b>ErrosApp</b> do namespace <b>Climb</b>.",
      ["O que você quer não é buscar no log: é fazer o log VIRAR número, porque número tem alarme.", "São três partes: o padrão que casa, o nome do filtro e a transformação em métrica.", "A transformação vai na forma `metricName=...,metricNamespace=...,metricValue=1`."],
      ["aws logs put-metric-filter --log-group-name /climb/app --filter-name conta-erros --filter-pattern ERROR --metric-transformations metricName=ErrosApp,metricNamespace=Climb,metricValue=1"],
      (c) => !!(((grupo(c, "/climb/app") || {}).filtros || {})["conta-erros"])),
    d("logsc-mf2", "cloudwatch", 3, 150, "Agora sim: o telefone toca sozinho",
      "Com a métrica <b>ErrosApp</b> existindo, feche o circuito: crie o alarme <b>muitos-erros</b> que dispara quando ela passar de <b>10</b>. <small>(log ➜ métrica ➜ alarme: é essa corrente que substitui alguém olhando a tela)</small>",
      ["O alarme não sabe o que é log: ele só enxerga a métrica que o filtro criou.", "Use o mesmo nome e namespace que você declarou na transformação, senao o alarme fica sem dado."],
      ["aws cloudwatch put-metric-alarm --alarm-name muitos-erros --metric-name ErrosApp --namespace Climb --threshold 10 --comparison-operator GreaterThanThreshold"],
      // Os parenteses em volta do indice NAO sao enfeite: o corte de gabarito
      // (lib/sem-gabarito.js) troca por null os `[...]` que ficam no nivel 0 do
      // `d(...)`, achando que sao o array de dicas ou de solucao. Sem eles o
      // arquivo servido quebra — e so o teste/gabarito.js acusa.
      (c) => !!(((c.cloudwatch || {}).alarmes || {})["muitos-erros"])),
    d("logsc-mf3", "cloudwatch", 3, 100, "O que desse log vira número?",
      "Antes de mexer em alarme, veja o que já está sendo extraido do <b>/climb/app</b>. Liste os filtros de métrica do grupo.",
      ["A pergunta é por grupo: quais filtros existem aqui dentro.", "Resposta vazia significa log guardado e nada virando alarme."],
      ["aws logs describe-metric-filters --log-group-name /climb/app"],
      (c, cmd, ok) => ok && ehCmd(cmd, "logs", "describe-metric-filters") &&
        String(cmd.flags["log-group-name"] || "") === "/climb/app"),
    d("logsc-sub1", "cloudwatch", 3, 140, "O log precisa sair em tempo real",
      "A segurança quer cada linha de ERROR do <b>/api/erros</b> chegando numa função que abre incidente — <b>na hora</b>, sem ninguém consultar nada. Crie a assinatura <b>erros-pra-lambda</b> apontando pra <b>arn:aws:lambda:us-east-1:123456789012:function:trata-erro</b>.",
      ["Filtro de MÉTRICA vira número; assinatura manda a LINHA pra fora. São coisas diferentes.", "O destino é um ARN de Lambda, Kinesis ou Firehose — não um nome.", "Um grupo aceita no máximo 2 assinaturas: é limite da AWS, não do simulador."],
      ["aws logs put-subscription-filter --log-group-name /api/erros --filter-name erros-pra-lambda --filter-pattern ERROR --destination-arn arn:aws:lambda:us-east-1:123456789012:function:trata-erro"],
      (c) => !!(((grupo(c, "/api/erros") || {}).assinaturas || {})["erros-pra-lambda"])),
    d("logsc-sub2", "cloudwatch", 3, 90, "Pra onde esse log estÃ¡ indo?",
      "Antes de desligar qualquer coisa, descubra o óbvio: <b>o /api/erros está sendo despejado em algum lugar?</b> Liste as assinaturas dele e depois <b>remova</b> a <b>erros-pra-lambda</b>, que o time de segurança aposentou.",
      ["Primeiro olhe, depois apague — assinatura esquecida manda dado (e custo) pra fora sem ninguém saber.", "O comando de apagar pede o grupo e o nome do filtro."],
      ["aws logs describe-subscription-filters --log-group-name /api/erros",
        "aws logs delete-subscription-filter --log-group-name /api/erros --filter-name erros-pra-lambda"],
      (c, cmd, ok) => ok && ehCmd(cmd, "logs", "delete-subscription-filter") &&
        !(((grupo(c, "/api/erros") || {}).assinaturas || {})["erros-pra-lambda"])),
    d("logsc-exp1", "cloudwatch", 3, 130, "Guardar sete anos sem pagar CloudWatch",
      "A auditoria exige guardar o log por anos, mas guardar no CloudWatch esse tempo é caro. A saída é o combo de sempre: retenção curta lá, arquivo no S3. Crie o bucket <b>arquivo-logs-auditoria</b> e exporte o <b>/api/erros</b> pra ele.",
      ["Primeiro o destino precisa existir — a exportação falha se o bucket não estiver lá.", "O recorte de tempo é obrigatório e vai em milissegundos: `--from` e `--to`.", "O `--destination` recebe o NOME do bucket, não a URL s3://."],
      ["aws s3 mb s3://arquivo-logs-auditoria",
        "aws logs create-export-task --log-group-name /api/erros --from 1788000000000 --to 1789000000000 --destination arquivo-logs-auditoria",
        "aws logs describe-export-tasks"],
      (c) => Object.values(((c.logs || {}).exportacoes) || {}).some((t) => t.grupo === "/api/erros")),
    d("logsc-q1", "cloudwatch", 3, 100, "Quem deixou consulta rodando?",
      "O Insights cobra por dado varrido, e alguém reclamou do custo. Liste as consultas do <b>/climb/app</b> pra ver o que foi disparado ali e em que estado estÃ¡.",
      ["Existe um `describe-…` próprio pras consultas do Insights.", "Dá pra estreitar por grupo com --log-group-name."],
      ["aws logs describe-queries --log-group-name /climb/app"],
      (c, cmd, ok) => ok && ehCmd(cmd, "logs", "describe-queries")),
  ]);
})();
