"use strict";
// ============================================================
// CLImb — sqs-completo.js
// Fecha o `aws sqs`: os 14 comandos que faltavam pros 23 que a CLI de verdade
// tem (conferidos no `aws sqs help` da 2.35.8, não de memória — ver a página
// `cobertura-cli/cli-sqs` no vault).
//
// O que entra aqui não é enfeite: é o que separa quem "sabe mandar mensagem"
// de quem opera fila em produção.
//
//   SET-QUEUE-ATTRIBUTES — o comando mais importante do serviço e o que menos
//        aparece em tutorial. É daqui que saem o visibility timeout (quanto
//        tempo o processador tem antes da mensagem voltar), o long polling
//        (que corta custo de requisição vazia) e a DLQ.
//   DLQ (RedrivePolicy) — sem fila de mensagem morta, uma mensagem venenosa
//        fica em loop eterno: recebe, quebra, volta, recebe de novo. A DLQ é
//        onde ela vai parar depois de N tentativas, pra alguém olhar.
//   MESSAGE MOVE TASK — o caminho de volta: consertado o bug, você devolve o
//        que estava na DLQ pra fila de origem sem escrever script nenhum.
//   BATCH — 10 mensagens por requisição. A SQS cobra POR REQUISIÇÃO, então
//        lote não é elegância, é a conta no fim do mês.
//   VISIBILITY na mão — o processamento demorou mais que o previsto? Você
//        estica o prazo em vez de deixar outro consumidor pegar a mesma coisa.
//   TAGS e PERMISSION — inventário de custo por time, e fila que outra conta
//        da AWS pode usar.
//
// CARREGA DEPOIS do servicos-fase2.js (que cria SERVICOS.sqs) e do
// desafios-pratica-2.js (as atividades novas se ancoram nas de lá).
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.sqs) return;

  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";
  const urlFila = (c, n) => "https://sqs." + REGIAO(c) + ".amazonaws.com/" + CONTA_ID(c) + "/" + n;
  const arnFila = (c, n) => "arn:aws:sqs:" + REGIAO(c) + ":" + CONTA_ID(c) + ":" + n;

  function st(conta) {
    conta.sqs = conta.sqs || { filas: {} };
    conta.sqs.filas = conta.sqs.filas || {};
    conta.sqs.tarefasMove = conta.sqs.tarefasMove || {};
    return conta.sqs;
  }
  // Mesma regra do servicos-fase2.js: o comando recebe a URL, não o nome.
  function acharFila(conta, flags, op) {
    st(conta);
    const url = String(exigirFlag(flags, "queue-url"));
    const nome = url.split("/").filter(Boolean).pop();
    const f = conta.sqs.filas[nome];
    if (!f || url.indexOf("://") < 0) {
      throw new ErroCli(
        "An error occurred (AWS.SimpleQueueService.NonExistentQueue) when calling the " + op + " operation: The specified queue does not exist.\n" +
        "Dica: a URL completa sai do 'aws sqs create-queue' ou do 'aws sqs get-queue-url --queue-name <nome>'."
      );
    }
    f.mensagens = f.mensagens || [];
    f.atributos = f.atributos || {};
    f.tags = f.tags || {};
    f.permissoes = f.permissoes || [];
    return [nome, f];
  }
  function filaPorArn(conta, arn, op) {
    st(conta);
    const nome = String(arn).split(":").pop();
    const f = conta.sqs.filas[nome];
    if (!f || String(arn).indexOf("arn:aws:sqs:") !== 0) {
      throw new ErroCli(
        "An error occurred (ResourceNotFoundException) when calling the " + op + " operation: The resource that you specified for the SourceArn parameter doesn't exist.\n" +
        "Dica: o ARN da fila sai do 'aws sqs get-queue-attributes --attribute-names All' (campo QueueArn)."
      );
    }
    f.mensagens = f.mensagens || [];
    f.atributos = f.atributos || {};
    return [nome, f];
  }

  // --attributes aceita a forma abreviada do CLI (Chave=valor, separado por
  // vírgula ou espaço). O RedrivePolicy é o caso chato: o valor dele é um JSON
  // dentro de uma string, e o tokenizer do simulador tira as aspas pelo
  // caminho. Por isso a leitura é tolerante — tenta JSON e, se não der, pesca
  // os dois campos que importam. A forma mostrada ao aluno é a REAL.
  function lerAtributos(bruto) {
    const texto = String(bruto).trim();
    const fora = {};
    if (texto.charAt(0) === "{" && texto.indexOf("RedrivePolicy") < 0) {
      try { return JSON.parse(texto); } catch (e) { /* cai no shorthand */ }
    }
    const redrive = texto.match(/RedrivePolicy\s*=\s*(.+)$/);
    if (redrive) {
      const alvo = redrive[1].match(/deadLetterTargetArn[^a-zA-Z0-9]+(arn:aws:sqs:[^,}\s"]+)/);
      const conta = redrive[1].match(/maxReceiveCount[^0-9]+([0-9]+)/);
      if (!alvo) {
        throw new ErroCli(
          "An error occurred (InvalidParameterValue) when calling the SetQueueAttributes operation: Value for parameter RedrivePolicy is invalid. Reason: Redrive policy does not contain a deadLetterTargetArn.\n" +
          "Dica: a forma e --attributes RedrivePolicy='{\"deadLetterTargetArn\":\"<arn-da-dlq>\",\"maxReceiveCount\":\"5\"}'"
        );
      }
      fora.RedrivePolicy = JSON.stringify({
        deadLetterTargetArn: alvo[1],
        maxReceiveCount: String(conta ? conta[1] : "5"),
      });
      const antes = texto.slice(0, redrive.index);
      for (const par of antes.split(/[,\s]+/).filter(Boolean)) {
        const i = par.indexOf("=");
        if (i > 0) fora[par.slice(0, i)] = par.slice(i + 1);
      }
      return fora;
    }
    for (const par of texto.split(/[,\s]+/).filter(Boolean)) {
      const i = par.indexOf("=");
      if (i > 0) fora[par.slice(0, i)] = par.slice(i + 1);
    }
    return fora;
  }
  // --entries recebe estruturas abreviadas separadas por espaço:
  //   Id=1,MessageBody=pedido-1  Id=2,MessageBody=pedido-2
  // O tokenizer do simulador dá à flag só o PRIMEIRO token depois dela — o
  // resto da lista cai nos posicionais. A CLI de verdade aceita a lista
  // separada por espaço, então juntamos os dois de volta aqui em vez de mexer
  // no tokenizer, que é usado por todos os 397 comandos.
  function lerEntradas(flags, op, pos) {
    const bruto = [String(exigirFlag(flags, "entries"))]
      .concat((pos || []).map(String))
      .join(" ")
      .trim();
    const partes = bruto.split(/\s+/).filter(Boolean);
    const saida = partes.map((p) => (typeof parsearShorthand === "function" ? parsearShorthand(p) : {}));
    const validas = saida.filter((e) => e && Object.keys(e).length);
    if (!validas.length) {
      throw new ErroCli(
        "An error occurred (AWS.SimpleQueueService.EmptyBatchRequest) when calling the " + op + " operation: There should be at least one entry in the request.\n" +
        "Dica: cada entrada é uma estrutura abreviada, e vão separadas por espaço: Id=1,MessageBody=texto Id=2,MessageBody=outro"
      );
    }
    if (validas.length > 10) {
      throw new ErroCli("An error occurred (AWS.SimpleQueueService.TooManyEntriesInBatchRequest) when calling the " + op + " operation: Maximum number of entries per request are 10.");
    }
    const ids = validas.map((e) => e.Id);
    if (new Set(ids).size !== ids.length) {
      throw new ErroCli("An error occurred (AWS.SimpleQueueService.BatchEntryIdsNotDistinct) when calling the " + op + " operation: Id " + ids[0] + " repeated.");
    }
    return validas;
  }

  const ATRIBUTOS_CONHECIDOS = [
    "DelaySeconds", "MaximumMessageSize", "MessageRetentionPeriod", "Policy",
    "ReceiveMessageWaitTimeSeconds", "VisibilityTimeout", "RedrivePolicy",
    "RedriveAllowPolicy", "FifoQueue", "ContentBasedDeduplication",
    "KmsMasterKeyId", "KmsDataKeyReusePeriodSeconds", "SqsManagedSseEnabled",
    "DeduplicationScope", "FifoThroughputLimit",
  ];

  Object.assign(SERVICOS.sqs, {
    // ---------- configuração da fila ----------
    "set-queue-attributes": (conta, pos, flags) => {
      const [nome, f] = acharFila(conta, flags, "SetQueueAttributes");
      const attrs = lerAtributos(exigirFlag(flags, "attributes"));
      const chaves = Object.keys(attrs);
      if (!chaves.length) {
        throw new ErroCli("An error occurred (InvalidParameterValue) when calling the SetQueueAttributes operation: No attributes were provided.");
      }
      for (const k of chaves) {
        if (ATRIBUTOS_CONHECIDOS.indexOf(k) < 0) {
          throw new ErroCli(
            "An error occurred (InvalidAttributeName) when calling the SetQueueAttributes operation: Unknown Attribute " + k + ".\n" +
            "Atributos no simulador: " + ATRIBUTOS_CONHECIDOS.join(", ")
          );
        }
      }
      if (attrs.VisibilityTimeout && Number(attrs.VisibilityTimeout) > 43200) {
        throw new ErroCli("An error occurred (InvalidParameterValue) when calling the SetQueueAttributes operation: Value " + attrs.VisibilityTimeout + " for parameter VisibilityTimeout is invalid. Reason: Must be an integer from 0 to 43200.");
      }
      if (attrs.ReceiveMessageWaitTimeSeconds && Number(attrs.ReceiveMessageWaitTimeSeconds) > 20) {
        throw new ErroCli("An error occurred (InvalidParameterValue) when calling the SetQueueAttributes operation: Value " + attrs.ReceiveMessageWaitTimeSeconds + " for parameter ReceiveMessageWaitTimeSeconds is invalid. Reason: Must be >= 0 and <= 20.");
      }
      Object.assign(f.atributos, attrs);
      if (attrs.RedrivePolicy) {
        const alvo = JSON.parse(attrs.RedrivePolicy);
        const nomeDlq = String(alvo.deadLetterTargetArn).split(":").pop();
        if (!conta.sqs.filas[nomeDlq]) {
          throw new ErroCli("An error occurred (InvalidParameterValue) when calling the SetQueueAttributes operation: Value " + attrs.RedrivePolicy + " for parameter RedrivePolicy is invalid. Reason: Dead letter target does not exist.");
        }
        avisarClimb(
          "Agora a fila \"" + nome + "\" tem fila de mensagem morta. Depois de " + alvo.maxReceiveCount +
          " tentativas frustradas, a mensagem sai daqui e vai pra \"" + nomeDlq + "\". " +
          "Sem isso, uma mensagem que sempre quebra fica em loop eterno: recebe, falha, volta, recebe de novo — " +
          "consumindo o processador e mascarando o problema."
        );
      } else if (attrs.ReceiveMessageWaitTimeSeconds) {
        avisarClimb(
          "Long polling ligado (" + attrs.ReceiveMessageWaitTimeSeconds + "s). Agora o receive-message ESPERA a mensagem chegar " +
          "em vez de responder \"vazio\" na hora. Sem isso, um consumidor em laço faz milhares de requisições vazias por hora — " +
          "e a SQS cobra por requisição."
        );
      } else if (attrs.VisibilityTimeout) {
        avisarClimb(
          "Visibility timeout de " + attrs.VisibilityTimeout + "s: esse é o tempo que o consumidor tem pra processar e apagar a mensagem. " +
          "Estourou o prazo, ela reaparece pra outro consumidor — e aí o mesmo trabalho roda duàs vezes."
        );
      }
      return okSilencioso("Atributos da fila \"" + nome + "\" atualizados: " + chaves.join(", ") + ".");
    },

    // ---------- lote (a SQS cobra por requisição) ----------
    "send-message-batch": (conta, pos, flags) => {
      const [nome, f] = acharFila(conta, flags, "SendMessageBatch");
      const entradas = lerEntradas(flags, "SendMessageBatch", pos);
      const ok = [];
      for (const e of entradas) {
        const corpo = e.MessageBody;
        if (corpo === undefined) {
          throw new ErroCli("An error occurred (InvalidParameterValue) when calling the SendMessageBatch operation: The request must contain the parameter MessageBody.");
        }
        const id = hexAleatorio(8) + "-" + hexAleatorio(4) + "-" + hexAleatorio(12);
        f.mensagens.push({ id: id, corpo: String(corpo), recebida: false, handle: null });
        ok.push({ Id: String(e.Id), MessageId: id, MD5OfMessageBody: hexAleatorio(32) });
      }
      avisarClimb(
        entradas.length + " mensagens numa requisicao só. A SQS cobra POR REQUISICAO, não por mensagem: " +
        "mandar de 10 em 10 custa um decimo do que mandar uma a uma."
      );
      return js({ Successful: ok, Failed: [] });
    },
    "delete-message-batch": (conta, pos, flags) => {
      const [nome, f] = acharFila(conta, flags, "DeleteMessageBatch");
      const entradas = lerEntradas(flags, "DeleteMessageBatch", pos);
      const ok = [], falhou = [];
      for (const e of entradas) {
        const i = f.mensagens.findIndex((m) => m.handle && m.handle === e.ReceiptHandle);
        if (i < 0) {
          falhou.push({ Id: String(e.Id), SenderFault: true, Code: "ReceiptHandleIsInvalid", Message: "The input receipt handle is invalid." });
          continue;
        }
        f.mensagens.splice(i, 1);
        ok.push({ Id: String(e.Id) });
      }
      if (!ok.length) {
        throw new ErroCli(
          "An error occurred (ReceiptHandleIsInvalid) when calling the DeleteMessageBatch operation: The input receipt handle is invalid.\n" +
          "Dica: cada ReceiptHandle vem do 'aws sqs receive-message' — e cada um só vale uma vez."
        );
      }
      return js({ Successful: ok, Failed: falhou });
    },
    "change-message-visibility": (conta, pos, flags) => {
      const [nome, f] = acharFila(conta, flags, "ChangeMessageVisibility");
      const handle = String(exigirFlag(flags, "receipt-handle"));
      const segundos = Number(exigirFlag(flags, "visibility-timeout"));
      if (!(segundos >= 0 && segundos <= 43200)) {
        throw new ErroCli("An error occurred (InvalidParameterValue) when calling the ChangeMessageVisibility operation: Value " + segundos + " for parameter VisibilityTimeout is invalid. Reason: Must be an integer from 0 to 43200.");
      }
      const m = f.mensagens.find((x) => x.handle === handle);
      if (!m) {
        throw new ErroCli("An error occurred (ReceiptHandleIsInvalid) when calling the ChangeMessageVisibility operation: The input receipt handle is invalid.");
      }
      m.visibilidade = segundos;
      if (segundos === 0) {
        m.recebida = false;
        m.handle = null;
        avisarClimb("Visibilidade zerada: a mensagem volta pra fila AGORA, disponível pro próximo consumidor. É o jeito de devolver um trabalho que você não vai conseguir terminar.");
      } else {
        avisarClimb("Prazo esticado pra " + segundos + "s. Use isso quando o processamento demora mais que o previsto — sem esticar, a mensagem reaparece e outro consumidor faz o mesmo trabalho de novo.");
      }
      return okSilencioso("Visibilidade da mensagem ajustada pra " + segundos + "s.");
    },
    "change-message-visibility-batch": (conta, pos, flags) => {
      const [nome, f] = acharFila(conta, flags, "ChangeMessageVisibilityBatch");
      const entradas = lerEntradas(flags, "ChangeMessageVisibilityBatch", pos);
      const ok = [], falhou = [];
      for (const e of entradas) {
        const m = f.mensagens.find((x) => x.handle && x.handle === e.ReceiptHandle);
        if (!m) {
          falhou.push({ Id: String(e.Id), SenderFault: true, Code: "ReceiptHandleIsInvalid", Message: "The input receipt handle is invalid." });
          continue;
        }
        m.visibilidade = Number(e.VisibilityTimeout || 30);
        ok.push({ Id: String(e.Id) });
      }
      if (!ok.length) {
        throw new ErroCli("An error occurred (ReceiptHandleIsInvalid) when calling the ChangeMessageVisibilityBatch operation: The input receipt handle is invalid.");
      }
      return js({ Successful: ok, Failed: falhou });
    },

    // ---------- etiquetas (o inventário de custo) ----------
    "tag-queue": (conta, pos, flags) => {
      const [nome, f] = acharFila(conta, flags, "TagQueue");
      const tags = lerAtributos(exigirFlag(flags, "tags"));
      if (!Object.keys(tags).length) {
        throw new ErroCli("An error occurred (InvalidParameterValue) when calling the TagQueue operation: The request must contain the parameter Tags.");
      }
      Object.assign(f.tags, tags);
      avisarClimb("Etiqueta não muda nada no funcionamento — muda o relatório. É por Tag que o Cost Explorer separa quanto cada time ou projeto gastou.");
      return okSilencioso("Fila \"" + nome + "\" etiquetada: " + Object.keys(tags).join(", ") + ".");
    },
    "untag-queue": (conta, pos, flags) => {
      const [nome, f] = acharFila(conta, flags, "UntagQueue");
      const chaves = String(exigirFlag(flags, "tag-keys")).split(/[,\s]+/).filter(Boolean);
      for (const k of chaves) delete f.tags[k];
      return okSilencioso("Etiquetas removidas da fila \"" + nome + "\": " + chaves.join(", ") + ".");
    },
    "list-queue-tags": (conta, pos, flags) => {
      const [, f] = acharFila(conta, flags, "ListQueueTags");
      if (!Object.keys(f.tags).length) {
        avisarClimb("Nenhuma etiqueta nessa fila. Coloque uma com: aws sqs tag-queue --queue-url <url> --tags Time=pagamentos");
        return "";
      }
      return js({ Tags: f.tags });
    },

    // ---------- fila de mensagem morta e o caminho de volta ----------
    "list-dead-letter-source-queues": (conta, pos, flags) => {
      const [nome] = acharFila(conta, flags, "ListDeadLetterSourceQueues");
      const arn = arnFila(conta, nome);
      const fontes = [];
      for (const [n, f] of Object.entries(conta.sqs.filas)) {
        const rp = (f.atributos || {}).RedrivePolicy;
        if (rp && String(rp).indexOf(arn) >= 0) fontes.push(urlFila(conta, n));
      }
      if (!fontes.length) {
        avisarClimb("Nenhuma fila usa \"" + nome + "\" como fila de mensagem morta. Quem define isso é a fila de ORIGEM, com set-queue-attributes RedrivePolicy.");
      }
      return js({ queueUrls: fontes });
    },
    "start-message-move-task": (conta, pos, flags) => {
      const [nome, f] = filaPorArn(conta, exigirFlag(flags, "source-arn"), "StartMessageMoveTask");
      const paradas = f.mensagens.length;
      const handle = "AQEB" + hexAleatorio(20);
      conta.sqs.tarefasMove[handle] = {
        handle: handle, origem: nome, estado: "RUNNING", total: paradas, movidas: 0,
        comecouEm: typeof dataFormatada === "function" ? dataFormatada() : new Date().toISOString(),
      };
      avisarClimb(
        "Tarefa de devolução iniciada: as " + paradas + " mensagens que estavam em \"" + nome + "\" voltam pra fila de origem. " +
        "É o caminho de volta da DLQ — consertado o bug, você reprocessa sem escrever script nenhum."
      );
      return js({ TaskHandle: handle });
    },
    "list-message-move-tasks": (conta, pos, flags) => {
      const [nome] = filaPorArn(conta, exigirFlag(flags, "source-arn"), "ListMessageMoveTasks");
      st(conta);
      const tarefas = Object.values(conta.sqs.tarefasMove).filter((t) => t.origem === nome);
      if (!tarefas.length) {
        avisarClimb("Nenhuma tarefa de devolução nessa fila. Comece uma com: aws sqs start-message-move-task --source-arn <arn-da-dlq>");
        return "";
      }
      return js({ Results: tarefas.map((t) => ({
        TaskHandle: t.handle, Status: t.estado, SourceArn: arnFila(conta, t.origem),
        ApproximateNumberOfMessagesMoved: t.movidas,
        ApproximateNumberOfMessagesToMove: t.total,
        StartedTimestamp: t.comecouEm,
      })) });
    },
    "cancel-message-move-task": (conta, pos, flags) => {
      st(conta);
      const handle = String(exigirFlag(flags, "task-handle"));
      const t = conta.sqs.tarefasMove[handle];
      if (!t) {
        throw new ErroCli(
          "An error occurred (ResourceNotFoundException) when calling the CancelMessageMoveTask operation: The task handle is invalid.\n" +
          "Dica: o TaskHandle vem do 'aws sqs start-message-move-task' ou do 'aws sqs list-message-move-tasks'."
        );
      }
      t.estado = "CANCELLED";
      return js({ ApproximateNumberOfMessagesMoved: t.movidas });
    },

    // ---------- permissão entre contas ----------
    "add-permission": (conta, pos, flags) => {
      const [nome, f] = acharFila(conta, flags, "AddPermission");
      const rotulo = String(exigirFlag(flags, "label"));
      const contas = String(exigirFlag(flags, "aws-account-ids")).split(/[,\s]+/).filter(Boolean);
      const acoes = String(exigirFlag(flags, "actions")).split(/[,\s]+/).filter(Boolean);
      if (f.permissoes.some((p) => p.rotulo === rotulo)) {
        throw new ErroCli("An error occurred (AWS.SimpleQueueService.InvalidParameterValue) when calling the AddPermission operation: Value " + rotulo + " for parameter Label is invalid. Reason: Already exists.");
      }
      f.permissoes.push({ rotulo: rotulo, contas: contas, acoes: acoes });
      avisarClimb(
        "Isso solta a fila pra OUTRA conta da AWS (" + contas.join(", ") + "), só nas ações " + acoes.join(", ") + ". " +
        "É o atalho da política de recurso — útil pra fan-out entre contas, e perigoso se você liberar \"*\"."
      );
      return okSilencioso("Permissao \"" + rotulo + "\" adicionada na fila \"" + nome + "\".");
    },
    "remove-permission": (conta, pos, flags) => {
      const [nome, f] = acharFila(conta, flags, "RemovePermission");
      const rotulo = String(exigirFlag(flags, "label"));
      const i = f.permissoes.findIndex((p) => p.rotulo === rotulo);
      if (i < 0) {
        throw new ErroCli("An error occurred (InvalidParameterValue) when calling the RemovePermission operation: Value " + rotulo + " for parameter Label is invalid. Reason: can't find label.");
      }
      f.permissoes.splice(i, 1);
      return okSilencioso("Permissao \"" + rotulo + "\" removida da fila \"" + nome + "\".");
    },
  });

  // ============================================================
  // MANUAIS — comando sem verbete derruba o teste de fumaça
  // ============================================================
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => "USO\n    " + uso + "\n\n" + txt;
    Object.assign(MANUAIS, {
      "sqs.set-queue-attributes": M(
        "aws sqs set-queue-attributes --queue-url <url> --attributes VisibilityTimeout=60",
        "Configura a fila DEPOIS de criada. É o comando mais importante do\nserviço e o que menos aparece em tutorial.\n\nOS QUE IMPORTAM\n    VisibilityTimeout            quanto tempo o consumidor tem pra\n                                 processar antes de a mensagem voltar\n    ReceiveMessageWaitTimeSeconds  long polling (até 20): o receive\n                                 espera a mensagem em vez de responder\n                                 vazio — corta requisição cobrada à toa\n    MessageRetentionPeriod       quanto tempo a mensagem sobrevive na\n                                 fila (padrão 4 dias, máximo 14)\n    DelaySeconds                 atrasa a entrega de toda mensagem nova\n    RedrivePolicy                liga a fila de mensagem morta (DLQ)"),
      "sqs.send-message-batch": M(
        "aws sqs send-message-batch --queue-url <url> --entries Id=1,MessageBody=pedido-1 Id=2,MessageBody=pedido-2",
        "Manda até 10 mensagens numa requisição só. A SQS cobra POR\nREQUISIÇÃO, não por mensagem: de 10 em 10 custa um décimo.\n\nCada entrada precisa de um Id único DENTRO do lote (é só pra você\ncasar a resposta com o pedido; não é o MessageId)."),
      "sqs.delete-message-batch": M(
        "aws sqs delete-message-batch --queue-url <url> --entries Id=1,ReceiptHandle=<handle>",
        "Confirma várias mensagens de uma vez. A resposta separa Successful\nde Failed: um handle inválido não derruba o lote inteiro."),
      "sqs.change-message-visibility": M(
        "aws sqs change-message-visibility --queue-url <url> --receipt-handle <handle> --visibility-timeout 120",
        "Muda o prazo DESTA mensagem, sem mexer na fila.\n\nDOIS USOS\n    esticar   o processamento demorou mais que o previsto e você não\n              quer que outro consumidor pegue o mesmo trabalho\n    zerar     --visibility-timeout 0 devolve a mensagem AGORA, pro\n              próximo consumidor: é como desistir de um trabalho"),
      "sqs.change-message-visibility-batch": M(
        "aws sqs change-message-visibility-batch --queue-url <url> --entries Id=1,ReceiptHandle=<h>,VisibilityTimeout=120",
        "O mesmo, para até 10 mensagens numa requisição."),
      "sqs.tag-queue": M(
        "aws sqs tag-queue --queue-url <url> --tags Time=pagamentos,Ambiente=producao",
        "Etiqueta a fila. Não muda nada no funcionamento — muda o relatório:\né por Tag que o Cost Explorer separa quanto cada time gastou."),
      "sqs.untag-queue": M(
        "aws sqs untag-queue --queue-url <url> --tag-keys Ambiente",
        "Tira etiquetas da fila, pelas chaves."),
      "sqs.list-queue-tags": M(
        "aws sqs list-queue-tags --queue-url <url>",
        "Mostra as etiquetas da fila. Resposta vazia quer dizer fila sem\ndono declarado — e é assim que uma fila esquecida vira custo órfão."),
      "sqs.list-dead-letter-source-queues": M(
        "aws sqs list-dead-letter-source-queues --queue-url <url-da-dlq>",
        "Pergunta ao contrário: dada uma DLQ, QUEM manda mensagem morta pra\nela. Quem configura a relação é sempre a fila de origem, com o\nRedrivePolicy — então esta é a única forma de descobrir de onde vem\no que caiu aqui."),
      "sqs.start-message-move-task": M(
        "aws sqs start-message-move-task --source-arn <arn-da-dlq>",
        "O caminho de VOLTA da DLQ: devolve as mensagens paradas pra fila de\norigem. Consertado o bug, você reprocessa sem escrever script.\nDevolve um TaskHandle pra acompanhar."),
      "sqs.list-message-move-tasks": M(
        "aws sqs list-message-move-tasks --source-arn <arn-da-dlq>",
        "Acompanha as devoluções: quantas mensagens já voltaram, quantas\nfaltam e em que estado a tarefa está (RUNNING, COMPLETED, CANCELLED)."),
      "sqs.cancel-message-move-task": M(
        "aws sqs cancel-message-move-task --task-handle <handle>",
        "Para uma devolução no meio. O que já voltou, voltou — o resto fica\nna DLQ."),
      "sqs.add-permission": M(
        "aws sqs add-permission --queue-url <url> --label time-dados --aws-account-ids 111122223333 --actions SendMessage",
        "Libera a fila pra OUTRA conta da AWS, em ações específicas. É o\natalho da política de recurso.\n\nCUIDADO: liberar \"*\" em --actions entrega a fila inteira, inclusive\napagar mensagem. Libere SendMessage ou ReceiveMessage, não tudo."),
      "sqs.remove-permission": M(
        "aws sqs remove-permission --queue-url <url> --label time-dados",
        "Revoga a liberação, pelo rótulo que você deu ao criá-la."),
    });
  }

  // ============================================================
  // PORQUE — uma linha dizendo por que o comando EXISTE
  // ============================================================
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "sqs.set-queue-attributes": "configura a fila depois de criada: prazo do consumidor, long polling, retenção e fila de mensagem morta.",
      "sqs.send-message-batch": "manda até 10 mensagens numa requisição — a SQS cobra por requisição, não por mensagem.",
      "sqs.delete-message-batch": "confirma várias mensagens processadas de uma vez, pelo mesmo motivo de custo.",
      "sqs.change-message-visibility": "estica (ou zera) o prazo de UMA mensagem quando o processamento foge do previsto.",
      "sqs.change-message-visibility-batch": "o mesmo ajuste de prazo, para um lote de mensagens.",
      "sqs.tag-queue": "etiqueta a fila pra saber, no fim do mês, de qual time é aquele custo.",
      "sqs.untag-queue": "tira etiqueta que não vale mais.",
      "sqs.list-queue-tags": "mostra de quem é a fila — fila sem etiqueta vira custo órfão.",
      "sqs.list-dead-letter-source-queues": "descobre quais filas despejam mensagem morta nesta DLQ.",
      "sqs.start-message-move-task": "devolve pra origem o que caiu na DLQ, depois que o bug foi corrigido.",
      "sqs.list-message-move-tasks": "acompanha quanto da devolução já andou.",
      "sqs.cancel-message-move-task": "para uma devolução no meio do caminho.",
      "sqs.add-permission": "libera a fila pra outra conta da AWS, em ações específicas.",
      "sqs.remove-permission": "revoga essa liberação.",
    });
  }

  // ============================================================
  // ATIVIDADES — cada comando entra pelo problema, e volta na fixação
  // ============================================================
  if (typeof DESAFIOS === "undefined") return;

  function d(id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar) {
    return { id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar };
  }
  function at(anchorId, novos) {
    const i = DESAFIOS.findIndex((x) => x.id === anchorId);
    if (i < 0) {
      // Âncora que não existe na hora = arquivo carregando cedo demais. O
      // analise.js lê esta lista e acusa como PROBLEMA (bug de 21 a 24/09/2026).
      const g = typeof globalThis !== "undefined" ? globalThis : window;
      (g.__ancorasPerdidas = g.__ancorasPerdidas || []).push(anchorId);
      for (const n of novos) DESAFIOS.push(n);
      return;
    }
    DESAFIOS.splice(i + 1, 0, ...novos);
  }
  const U = (n) => "https://sqs.us-east-1.amazonaws.com/123456789012/" + n;
  const A = (n) => "arn:aws:sqs:us-east-1:123456789012:" + n;
  const fila = (c, n) => ((c.sqs || {}).filas || {})[n];
  const attr = (c, n, k) => ((fila(c, n) || {}).atributos || {})[k];
  const msgs = (c, n) => ((fila(c, n) || {}).mensagens || []);

  // --- lote, logo depois do send-message ---
  at("psqs-sm2", [
    d("sqsc-lote1", "sqs", 2, 70, "Mil mensagens, mil requisições — e a conta chega",
      "O time subiu um importador que manda uma mensagem por linha da planilha, uma requisição cada. A SQS cobra <b>por requisição</b>, não por mensagem — de 10 em 10 custa um décimo. Crie <b>importacao-planilha</b> e mande as três primeiras linhas num lote só: <b>linha-1</b>, <b>linha-2</b> e <b>linha-3</b>.",
      ["Cada entrada do lote é uma estrutura abreviada, e elas vão separadas por espaço.", "O `Id` é só pra você casar a resposta com o pedido dentro do lote — não é o MessageId que a AWS devolve."],
      ["aws sqs create-queue --queue-name importacao-planilha",
        "aws sqs send-message-batch --queue-url " + U("importacao-planilha") + " --entries Id=1,MessageBody=linha-1 Id=2,MessageBody=linha-2 Id=3,MessageBody=linha-3"],
      (c) => msgs(c, "importacao-planilha").length >= 3),
    d("sqsc-lote2", "sqs", 2, 70, "O disparo da newsletter",
      "A newsletter de sexta vai pra dois segmentos, e cada envio é uma mensagem. Crie <b>newsletter-envios</b> e mande <b>segmento-ativos</b> e <b>segmento-inativos</b> num único lote.",
      ["Dois Ids, dois MessageBody, uma requisição.", "Se repetir o mesmo `Id` no lote, a AWS recusa tudo com BatchEntryIdsNotDistinct."],
      ["aws sqs create-queue --queue-name newsletter-envios",
        "aws sqs send-message-batch --queue-url " + U("newsletter-envios") + " --entries Id=1,MessageBody=segmento-ativos Id=2,MessageBody=segmento-inativos"],
      (c) => msgs(c, "newsletter-envios").length >= 2),
  ]);

  // --- configuração da fila, logo depois de LER os atributos ---
  at("psqs-attr1", [
    d("sqsc-set1", "sqs", 2, 80, "O mesmo pedido sendo cobrado duàs vezes",
      "O suporte relatou cobrança em duplicidade. A causa: processar o pagamento leva uns 90 segundos e o prazo padrão da fila é 30 — passou disso, a mensagem reaparece e outro consumidor cobra de novo. Crie <b>pagamentos-cartao</b> e ajuste o prazo pra <b>120</b> segundos.",
      ["Isso não se resolve no receive-message: é configuração da fila, com set-queue-attributes.", "O atributo é `VisibilityTimeout`, em segundos, e vai na forma `Chave=valor`."],
      ["aws sqs create-queue --queue-name pagamentos-cartao",
        "aws sqs set-queue-attributes --queue-url " + U("pagamentos-cartao") + " --attributes VisibilityTimeout=120"],
      (c) => String(attr(c, "pagamentos-cartao", "VisibilityTimeout")) === "120"),
    d("sqsc-set2", "sqs", 2, 80, "O consumidor que perguntava o tempo todo",
      "Seu worker roda em laço perguntando se chegou mensagem, e 95% das respostas são \"nada aqui\" — cada uma cobrada. Com <b>long polling</b> ele espera até 20 segundos pela mensagem em vez de responder vazio na hora. Ligue isso na fila <b>importacao-planilha</b> com o máximo de <b>20</b> segundos.",
      ["O nome do atributo diz o que ele faz: quanto tempo o receive ESPERA.", "É `ReceiveMessageWaitTimeSeconds`, e o teto é 20 — acima disso a AWS recusa."],
      ["aws sqs set-queue-attributes --queue-url " + U("importacao-planilha") + " --attributes ReceiveMessageWaitTimeSeconds=20"],
      (c) => String(attr(c, "importacao-planilha", "ReceiveMessageWaitTimeSeconds")) === "20"),
    d("sqsc-set3", "sqs", 2, 70, "Feriado prolongado, ninguém processando",
      "A fila de relatórios fica parada no feriado e o padrão de retenção é 4 dias — no quinto, a mensagem simplesmente some. Estique a retenção da fila <b>relatorios-noturnos</b> pro máximo: <b>1209600</b> segundos (14 dias).",
      ["Retenção é quanto tempo a mensagem SOBREVIVE na fila sem ser processada.", "O atributo é `MessageRetentionPeriod`, em segundos. 1209600 é o teto da AWS."],
      ["aws sqs set-queue-attributes --queue-url " + U("relatorios-noturnos") + " --attributes MessageRetentionPeriod=1209600"],
      (c) => String(attr(c, "relatorios-noturnos", "MessageRetentionPeriod")) === "1209600"),
    d("sqsc-tag1", "sqs", 2, 60, "De quem é essa fila?",
      "No fim do mês ninguém sabe de qual time é cada fila, e o custo não tem dono. Etiquete <b>pagamentos-cartao</b> com <b>Time=financeiro</b> e <b>Ambiente=producao</b>.",
      ["Etiqueta não muda o funcionamento: muda o relatório de custo.", "As duas etiquetas vão juntas, separadas por vírgula, em `--tags`."],
      ["aws sqs tag-queue --queue-url " + U("pagamentos-cartao") + " --tags Time=financeiro,Ambiente=producao"],
      (c) => (((fila(c, "pagamentos-cartao") || {}).tags) || {}).Time === "financeiro"),
    d("sqsc-tag2", "sqs", 2, 50, "Auditoria de etiquetas",
      "Antes de fechar o relatório de custo, confira o que está etiquetado na fila <b>pagamentos-cartao</b>.",
      ["Só a fila sabe as próprias etiquetas — o comando pergunta por URL.", "Resposta vazia quer dizer fila sem dono declarado."],
      ["aws sqs list-queue-tags --queue-url " + U("pagamentos-cartao")],
      (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "list-queue-tags") &&
        String(cmd.flags["queue-url"] || "").indexOf("pagamentos-cartao") >= 0),
    d("sqsc-tag3", "sqs", 2, 60, "Saiu de produção",
      "A fila <b>pagamentos-cartao</b> virou ambiente de testes e a etiqueta <b>Ambiente</b> ficou errada — pior que não ter etiqueta é ter etiqueta mentindo no relatório. Remova só ela, mantendo o <b>Time</b>.",
      ["Remover é por CHAVE, não por par chave=valor.", "A flag é `--tag-keys`, e aceita várias chaves separadas por vírgula."],
      ["aws sqs untag-queue --queue-url " + U("pagamentos-cartao") + " --tag-keys Ambiente"],
      (c) => {
        const t = ((fila(c, "pagamentos-cartao") || {}).tags) || {};
        return t.Time === "financeiro" && t.Ambiente === undefined;
      }),
  ]);

  // --- prazo de UMA mensagem, depois do delete-message ---
  at("psqs-dm1", [
    d("sqsc-vis1", "sqs", 3, 90, "O relatório demorou mais que o previsto",
      "Seu worker pegou um relatório gigante e vai passar do prazo da fila — se não esticar, a mensagem reaparece e outro worker gera o mesmo relatório de novo. Crie <b>relatorios-pesados</b>, mande <b>fechamento-anual</b>, puxe a mensagem e estique o prazo dela pra <b>600</b> segundos.",
      ["Aqui o ajuste é da MENSAGEM, não da fila: o prazo padrão continua valendo pras outras.", "O comando pede o mesmo comprovante do delete-message, mais o novo prazo."],
      ["aws sqs create-queue --queue-name relatorios-pesados",
        "aws sqs send-message --queue-url " + U("relatorios-pesados") + " --message-body \"fechamento-anual\"",
        "aws sqs receive-message --queue-url " + U("relatorios-pesados"),
        "aws sqs change-message-visibility --queue-url " + U("relatorios-pesados") + " --receipt-handle <receipt-handle> --visibility-timeout 600"],
      (c) => msgs(c, "relatorios-pesados").some((m) => m.visibilidade === 600)),
    d("sqsc-vis2", "sqs", 3, 90, "Desistir na hora certa",
      "O worker percebeu que não vai conseguir terminar e travar a mensagem por mais 10 minutos só atrasa todo mundo. Devolva ela <b>agora</b> pra fila, pro próximo consumidor pegar: prazo <b>0</b>.",
      ["Zero não apaga nem falha: solta a mensagem de volta imediatamente.", "É o mesmo comando do exercício anterior, com o prazo no extremo oposto."],
      ["aws sqs receive-message --queue-url " + U("relatorios-pesados"),
        "aws sqs change-message-visibility --queue-url " + U("relatorios-pesados") + " --receipt-handle <receipt-handle> --visibility-timeout 0"],
      (c) => msgs(c, "relatorios-pesados").some((m) => !m.recebida && m.visibilidade === 0)),
    d("sqsc-lote3", "sqs", 3, 100, "Confirme o lote inteiro numa requisição",
      "Seu worker processa notificações de 10 em 10, mas confirma uma por uma — e são 10 requisições cobradas pra cada lote de trabalho. Crie <b>notificacoes-push</b>, mande <b>push-1</b> e <b>push-2</b> em lote, puxe as duas de uma vez e confirme as duas numa requisição só.",
      ["Pra receber mais de uma mensagem por vez existe uma flag no receive-message.", "No lote de confirmação cada entrada leva o `Id` dela e o `ReceiptHandle` correspondente.", "A resposta separa Successful de Failed: um comprovante inválido não derruba o lote inteiro."],
      ["aws sqs create-queue --queue-name notificacoes-push",
        "aws sqs send-message-batch --queue-url " + U("notificacoes-push") + " --entries Id=1,MessageBody=push-1 Id=2,MessageBody=push-2",
        "aws sqs receive-message --queue-url " + U("notificacoes-push") + " --max-number-of-messages 2",
        "aws sqs delete-message-batch --queue-url " + U("notificacoes-push") + " --entries Id=1,ReceiptHandle=<handle-1> Id=2,ReceiptHandle=<handle-2>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "delete-message-batch") &&
        !!fila(c, "notificacoes-push") && msgs(c, "notificacoes-push").length === 0),
    d("sqsc-lote4", "sqs", 3, 100, "A fila de conversão inteira vai demorar",
      "A máquina de conversão está lenta hoje e as duas imagens em processamento vão estourar o prazo — as duas, não uma. Crie <b>conversao-imagens</b>, mande <b>foto-1</b> e <b>foto-2</b> em lote, puxe as duas e estique o prazo das duas pra <b>300</b> segundos numa requisição.",
      ["É o change-message-visibility do exercício anterior, na forma de lote.", "Aqui cada entrada carrega três campos: Id, ReceiptHandle e o VisibilityTimeout dela."],
      ["aws sqs create-queue --queue-name conversao-imagens",
        "aws sqs send-message-batch --queue-url " + U("conversao-imagens") + " --entries Id=1,MessageBody=foto-1 Id=2,MessageBody=foto-2",
        "aws sqs receive-message --queue-url " + U("conversao-imagens") + " --max-number-of-messages 2",
        "aws sqs change-message-visibility-batch --queue-url " + U("conversao-imagens") + " --entries Id=1,ReceiptHandle=<handle-1>,VisibilityTimeout=300 Id=2,ReceiptHandle=<handle-2>,VisibilityTimeout=300"],
      (c) => msgs(c, "conversao-imagens").filter((m) => m.visibilidade === 300).length >= 2),
  ]);

  // --- DLQ e o caminho de volta, no fim da trilha (o clímax) ---
  at("psqs-fifo1", [
    d("sqsc-dlq1", "sqs", 3, 120, "A mensagem venenosa que não morre",
      "Uma mensagem com JSON quebrado entra, o worker estoura, ela volta pra fila e o ciclo recomeça — de madrugada isso vira alarme e ninguém entende o motivo. A saída é a <b>fila de mensagem morta</b>: depois de N tentativas a mensagem sai de circulação. Crie a DLQ <b>pedidos-dlq</b>, a fila <b>pedidos-app</b> e ligue as duas com no máximo <b>5</b> tentativas.",
      ["A DLQ é uma fila comum — o que a torna DLQ é a outra fila apontar pra ela.", "Quem aponta é a fila de ORIGEM, no atributo `RedrivePolicy`.", "O valor do RedrivePolicy é um JSON com `deadLetterTargetArn` e `maxReceiveCount`."],
      ["aws sqs create-queue --queue-name pedidos-dlq",
        "aws sqs create-queue --queue-name pedidos-app",
        "aws sqs set-queue-attributes --queue-url " + U("pedidos-app") + " --attributes RedrivePolicy={\"deadLetterTargetArn\":\"" + A("pedidos-dlq") + "\",\"maxReceiveCount\":\"5\"}"],
      (c) => String(attr(c, "pedidos-app", "RedrivePolicy") || "").indexOf("pedidos-dlq") >= 0),
    d("sqsc-dlq2", "sqs", 3, 90, "De onde vem esse lixo?",
      "Você abre a <b>pedidos-dlq</b> e encontra mensagens — mas a DLQ não guarda quem mandou. Como a relação é declarada pela fila de origem, existe um comando que faz a pergunta ao contrário. Descubra <b>quais filas despejam nesta DLQ</b>.",
      ["Não adianta procurar na fila de origem: você tem a DLQ na mão e quer as origens.", "O comando recebe a URL da DLQ e devolve as URLs de quem aponta pra ela."],
      ["aws sqs list-dead-letter-source-queues --queue-url " + U("pedidos-dlq")],
      (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "list-dead-letter-source-queues") &&
        String(cmd.flags["queue-url"] || "").indexOf("pedidos-dlq") >= 0),
    d("sqsc-move1", "sqs", 3, 110, "Bug corrigido: devolva as mensagens",
      "O deploy saiu, o parser foi corrigido e as mensagens paradas na <b>pedidos-dlq</b> agora seriam processadas sem erro. Em vez de escrever um script que lê de uma fila e escreve na outra, peça pra própria SQS devolver. Mande <b>duas mensagens</b> pra DLQ (<b>pedido-quebrado-1</b> e <b>pedido-quebrado-2</b>) e inicie a devolução.",
      ["A devolução é uma TAREFA da SQS, não um comando de mensagem — você não passa URL, passa o ARN.", "O ARN da fila aparece no get-queue-attributes, no campo QueueArn.", "Guarde o TaskHandle que volta: é por ele que se acompanha e se cancela."],
      ["aws sqs send-message --queue-url " + U("pedidos-dlq") + " --message-body \"pedido-quebrado-1\"",
        "aws sqs send-message --queue-url " + U("pedidos-dlq") + " --message-body \"pedido-quebrado-2\"",
        "aws sqs start-message-move-task --source-arn " + A("pedidos-dlq")],
      (c) => Object.values(((c.sqs || {}).tarefasMove) || {}).some((t) => t.origem === "pedidos-dlq")),
    d("sqsc-move2", "sqs", 3, 80, "Quanto já voltou?",
      "A devolução da <b>pedidos-dlq</b> está rodando e o time quer saber se já acabou. Liste as tarefas de devolução dessa fila e olhe o estado.",
      ["A consulta usa o mesmo ARN da fila de origem, não o TaskHandle.", "Repare nos campos de quantas já moveram contra quantas faltam."],
      ["aws sqs list-message-move-tasks --source-arn " + A("pedidos-dlq")],
      (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "list-message-move-tasks") &&
        String(cmd.flags["source-arn"] || "").indexOf("pedidos-dlq") >= 0),
    d("sqsc-move3", "sqs", 3, 90, "Pare a devolução: o bug voltou",
      "No meio da devolução o time descobriu que a correção não cobria todos os casos, e continuar devolvendo só recria o problema. Cancele a tarefa. <small>(o que já voltou, voltou — o resto fica na DLQ esperando)</small>",
      ["O cancelamento não usa o ARN da fila: usa o comprovante da TAREFA.", "O TaskHandle veio do start-message-move-task, e o list-message-move-tasks também mostra."],
      ["aws sqs cancel-message-move-task --task-handle <task-handle>"],
      (c) => Object.values(((c.sqs || {}).tarefasMove) || {}).some((t) => t.origem === "pedidos-dlq" && t.estado === "CANCELLED")),
    d("sqsc-perm1", "sqs", 3, 110, "O time de dados precisa escrever na sua fila",
      "Outro time, em <b>outra conta da AWS</b> (id <b>111122223333</b>), vai mandar eventos pra sua fila <b>pedidos-app</b>. Libere só o envio pra eles, com o rótulo <b>time-dados</b>. <small>(liberar <code>*</code> entregaria também o direito de apagar mensagem)</small>",
      ["Isso é permissão de RECURSO: quem libera é a fila, não a política do outro time.", "São três informações: o rótulo da liberação, a conta liberada e quais ações."],
      ["aws sqs add-permission --queue-url " + U("pedidos-app") + " --label time-dados --aws-account-ids 111122223333 --actions SendMessage"],
      (c) => (((fila(c, "pedidos-app") || {}).permissoes) || []).some((p) => p.rotulo === "time-dados")),
    d("sqsc-perm2", "sqs", 3, 90, "O projeto conjunto acabou",
      "A integração com o time de dados foi encerrada, e acesso que sobra é acesso que um dia vira incidente. Revogue a liberação <b>time-dados</b> da fila <b>pedidos-app</b>.",
      ["Você não repete conta nem ações: a revogação é pelo rótulo.", "É o inverso exato do add-permission."],
      ["aws sqs remove-permission --queue-url " + U("pedidos-app") + " --label time-dados"],
      (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "remove-permission") &&
        !(((fila(c, "pedidos-app") || {}).permissoes) || []).some((p) => p.rotulo === "time-dados")),
  ]);

  // ============================================================
  // FIXAÇÃO (revisão de 24/09/2026)
  // Cada comando acima era praticado UMA vez. Aqui cada família volta num
  // cenário novo, sem introduzir comando inédito — é o "1 ou 2 de fixação" do
  // molde que o Gabriel pediu. O analise.js agora mede isso (seção FIXAÇÃO).
  // ============================================================
  at("sqsc-tag3", [
    d("sqsc-fix-tag", "sqs", 2, 80, "A fila de teste que entrou no relatório de produção",
      "O financeiro achou no relatório uma fila de cobrança etiquetada como produção, mas ela é só de teste. Crie <b>cobrancas-recorrentes</b>, etiquete com <b>Time=financeiro</b> e <b>Ambiente=producao</b>, confira as etiquetas e depois tire a <b>Ambiente</b>, que está mentindo.",
      ["São os três comandos de etiqueta que você acabou de ver, na ordem: pôr, conferir, tirar.", "Pra tirar, a flag recebe só a CHAVE — o valor não entra."],
      ["aws sqs create-queue --queue-name cobrancas-recorrentes",
        "aws sqs tag-queue --queue-url " + U("cobrancas-recorrentes") + " --tags Time=financeiro,Ambiente=producao",
        "aws sqs list-queue-tags --queue-url " + U("cobrancas-recorrentes"),
        "aws sqs untag-queue --queue-url " + U("cobrancas-recorrentes") + " --tag-keys Ambiente"],
      (c, cmd, ok) => {
        const t = ((fila(c, "cobrancas-recorrentes") || {}).tags) || {};
        return ok && ehCmd(cmd, "sqs", "untag-queue") && t.Time === "financeiro" && t.Ambiente === undefined;
      }),
  ]);
  at("sqsc-lote4", [
    d("sqsc-fix-lote", "sqs", 3, 110, "Miniaturas: estica o prazo de duas e confirma as duas",
      "O gerador de miniaturas puxou três fotos, percebeu que duas são enormes e vai precisar de mais tempo nelas. Crie <b>fila-thumbnails</b>, mande <b>foto-a</b>, <b>foto-b</b> e <b>foto-c</b> num lote, puxe as três, estique o prazo de duas pra <b>300</b> segundos e, quando terminar, confirme essas duas de uma vez.",
      ["Tudo aqui você já fez: envio em lote, receive com --max-number-of-messages, e as versões em lote de mudar visibilidade e de apagar.", "As duas operações em lote usam os MESMOS comprovantes — primeiro estica, depois confirma.", "No fim sobra uma mensagem na fila: a foto que ninguém confirmou."],
      ["aws sqs create-queue --queue-name fila-thumbnails",
        "aws sqs send-message-batch --queue-url " + U("fila-thumbnails") + " --entries Id=1,MessageBody=foto-a Id=2,MessageBody=foto-b Id=3,MessageBody=foto-c",
        "aws sqs receive-message --queue-url " + U("fila-thumbnails") + " --max-number-of-messages 3",
        "aws sqs change-message-visibility-batch --queue-url " + U("fila-thumbnails") + " --entries Id=1,ReceiptHandle=<handle-1>,VisibilityTimeout=300 Id=2,ReceiptHandle=<handle-2>,VisibilityTimeout=300",
        "aws sqs delete-message-batch --queue-url " + U("fila-thumbnails") + " --entries Id=1,ReceiptHandle=<handle-1> Id=2,ReceiptHandle=<handle-2>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "delete-message-batch") && msgs(c, "fila-thumbnails").length === 1),
  ]);
  at("sqsc-dlq2", [
    d("sqsc-fix-dlq", "sqs", 3, 120, "E-mails que nunca saem",
      "O disparador de e-mail trava em endereço inválido e fica tentando pra sempre. Monte a proteção que você já conhece: DLQ <b>emails-dlq</b>, fila <b>emails-envio</b> apontando pra ela com no máximo <b>3</b> tentativas — e confirme pelo lado da DLQ quem despeja nela.",
      ["É o mesmo desenho da fila de pedidos, com outro limite de tentativas.", "A confirmação é feita a partir da DLQ, não da fila de origem."],
      ["aws sqs create-queue --queue-name emails-dlq",
        "aws sqs create-queue --queue-name emails-envio",
        "aws sqs set-queue-attributes --queue-url " + U("emails-envio") + " --attributes RedrivePolicy={\"deadLetterTargetArn\":\"" + A("emails-dlq") + "\",\"maxReceiveCount\":\"3\"}",
        "aws sqs list-dead-letter-source-queues --queue-url " + U("emails-dlq")],
      (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "list-dead-letter-source-queues") &&
        String(attr(c, "emails-envio", "RedrivePolicy") || "").indexOf("emails-dlq") >= 0),
  ]);
  at("sqsc-move3", [
    d("sqsc-fix-move", "sqs", 3, 120, "Devolva os e-mails — e pare no meio",
      "O endereço inválido foi corrigido e o e-mail preso na <b>emails-dlq</b> pode voltar. Mande <b>email-cliente-9</b> pra DLQ, inicie a devolução, acompanhe — e cancele quando o time avisar que ainda falta um ajuste no template.",
      ["Os três comandos da devolução, na ordem em que aparecem no dia a dia: iniciar, acompanhar, cancelar.", "Iniciar e acompanhar pedem o ARN da DLQ; cancelar pede o comprovante da tarefa."],
      ["aws sqs send-message --queue-url " + U("emails-dlq") + " --message-body email-cliente-9",
        "aws sqs start-message-move-task --source-arn " + A("emails-dlq"),
        "aws sqs list-message-move-tasks --source-arn " + A("emails-dlq"),
        "aws sqs cancel-message-move-task --task-handle <task-handle>"],
      (c) => Object.values(((c.sqs || {}).tarefasMove) || {}).some((t) => t.origem === "emails-dlq" && t.estado === "CANCELLED")),
  ]);
  at("sqsc-perm2", [
    d("sqsc-fix-perm", "sqs", 3, 110, "Acesso do parceiro só enquanto durar o contrato",
      "A transportadora parceira (conta <b>444455556666</b>) vai mandar eventos de entrega pra você por um mês. Crie <b>eventos-parceiro</b>, libere só o envio com o rótulo <b>parceiro-logistica</b> e, fechado o contrato, revogue.",
      ["Liberar e revogar são o par que você acabou de usar — a revogação é pelo rótulo.", "Libere só SendMessage: o parceiro não precisa ler nem apagar nada."],
      ["aws sqs create-queue --queue-name eventos-parceiro",
        "aws sqs add-permission --queue-url " + U("eventos-parceiro") + " --label parceiro-logistica --aws-account-ids 444455556666 --actions SendMessage",
        "aws sqs remove-permission --queue-url " + U("eventos-parceiro") + " --label parceiro-logistica"],
      (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "remove-permission") && !!fila(c, "eventos-parceiro") &&
        !(((fila(c, "eventos-parceiro") || {}).permissoes) || []).some((p) => p.rotulo === "parceiro-logistica")),
  ]);
})();
