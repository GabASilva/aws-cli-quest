"use strict";
// ============================================================
// CLImb — servicos-fase2.js
// Fase 2 da expansão: SQS (filas), SNS (notificações), EBS (discos, dentro do
// `aws ec2`), API Gateway, Route 53 (DNS) e CloudFront (CDN).
//
// Registra os comandos em SERVICOS e empurra 6 trilhas em DESAFIOS/SERVICOS_META.
// Usa os globais do simulador.js (ErroCli, js, agoraIso, hexAleatorio,
// exigirFlag, okSilencioso, ehCmd, arquivoLocal).
//
// SNS e SQS já existiam no Console (console-aws.js) — este arquivo usa o MESMO
// formato de estado (conta.sns.topicos / conta.sqs.filas), então criar pelo
// Console aparece no `aws sqs list-queues` e vice-versa.
// ============================================================
(function () {
  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";

  function estado(conta) {
    conta.sqs = conta.sqs || { filas: {} };
    conta.sqs.filas = conta.sqs.filas || {};
    conta.sns = conta.sns || { topicos: {} };
    conta.sns.topicos = conta.sns.topicos || {};
    conta.ec2.volumes = conta.ec2.volumes || {};
    conta.ec2.snapshots = conta.ec2.snapshots || {};
    conta.apigateway = conta.apigateway || { apis: {} };
    conta.route53 = conta.route53 || { zonas: {} };
    conta.cloudfront = conta.cloudfront || { distribuicoes: {} };
    return conta;
  }

  const NOME_FILA = /^[a-zA-Z0-9_-]{1,80}$/;

  // ============================================================
  // SQS — filas de mensagens
  // ============================================================
  function urlFila(conta, nome) {
    return `https://sqs.${REGIAO(conta)}.amazonaws.com/${CONTA_ID(conta)}/${nome}`;
  }
  // Aceita a URL da fila (como a AWS exige) e devolve [nome, fila].
  function acharFila(conta, flags, operacao) {
    estado(conta);
    const url = exigirFlag(flags, "queue-url");
    const nome = String(url).split("/").filter(Boolean).pop();
    const f = conta.sqs.filas[nome];
    if (!f || String(url).indexOf("://") < 0) {
      throw new ErroCli(
        `An error occurred (AWS.SimpleQueueService.NonExistentQueue) when calling the ${operacao} operation: The specified queue does not exist.\n` +
        `Dica: a URL completa sai do 'aws sqs create-queue' ou do 'aws sqs get-queue-url --queue-name <nome>'.`
      );
    }
    f.mensagens = f.mensagens || [];
    return [nome, f];
  }
  const cmdSqs = {
    "create-queue": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "queue-name");
      const attrs = flags.attributes ? String(flags.attributes) : "";
      const fifo = /FifoQueue\s*=\s*true/i.test(attrs) || /\.fifo$/.test(nome);
      if (!NOME_FILA.test(nome.replace(/\.fifo$/, ""))) {
        throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the CreateQueue operation: Can only include alphanumeric characters, hyphens, or underscores. 1 to 80 in length`);
      }
      if (fifo && !/\.fifo$/.test(nome)) {
        throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the CreateQueue operation: The name of a FIFO queue can only include alphanumeric characters, hyphens, or underscores, must end with .fifo suffix and be 1 to 80 in length`);
      }
      if (conta.sqs.filas[nome]) {
        throw new ErroCli(`An error occurred (QueueAlreadyExists) when calling the CreateQueue operation: A queue already exists with the same name and a different value for attribute(s)`);
      }
      conta.sqs.filas[nome] = {
        url: urlFila(conta, nome), tipo: fifo ? "FIFO" : "Standard",
        criadoEm: typeof dataFormatada === "function" ? dataFormatada() : agoraIso(),
        mensagens: [],
      };
      return js({ QueueUrl: urlFila(conta, nome) });
    },
    "list-queues": (conta) => {
      estado(conta);
      const urls = Object.keys(conta.sqs.filas).map((n) => urlFila(conta, n));
      if (!urls.length) { avisarClimb("Nenhuma fila ainda. Crie uma com: aws sqs create-queue --queue-name pedidos-novos"); return ""; }
      return js({ QueueUrls: urls });
    },
    "get-queue-url": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "queue-name");
      if (!conta.sqs.filas[nome]) throw new ErroCli(`An error occurred (AWS.SimpleQueueService.NonExistentQueue) when calling the GetQueueUrl operation: The specified queue does not exist.`);
      return js({ QueueUrl: urlFila(conta, nome) });
    },
    "send-message": (conta, pos, flags) => {
      const [, f] = acharFila(conta, flags, "SendMessage");
      const corpo = exigirFlag(flags, "message-body");
      const id = hexAleatorio(8) + "-" + hexAleatorio(4) + "-" + hexAleatorio(4) + "-" + hexAleatorio(12);
      f.mensagens.push({ id, corpo, recebida: false, handle: null });
      return js({ MD5OfMessageBody: hexAleatorio(32), MessageId: id });
    },
    "receive-message": (conta, pos, flags) => {
      const [, f] = acharFila(conta, flags, "ReceiveMessage");
      const max = parseInt(flags["max-number-of-messages"] || "1", 10);
      const pendentes = f.mensagens.filter((m) => !m.recebida).slice(0, Math.max(1, max));
      if (!pendentes.length) {
        avisarClimb("A fila está vazia (nenhuma mensagem esperando). Mande uma com 'aws sqs send-message'.");
        return "";
      }
      const saida = pendentes.map((m) => {
        m.recebida = true;
        m.handle = "AQEB" + hexAleatorio(24);
        return { MessageId: m.id, ReceiptHandle: m.handle, MD5OfBody: hexAleatorio(32), Body: m.corpo };
      });
      return js({ Messages: saida });
    },
    "delete-message": (conta, pos, flags) => {
      const [, f] = acharFila(conta, flags, "DeleteMessage");
      const handle = exigirFlag(flags, "receipt-handle");
      const i = f.mensagens.findIndex((m) => m.handle === handle);
      if (i < 0) {
        throw new ErroCli(`An error occurred (ReceiptHandleIsInvalid) when calling the DeleteMessage operation: The input receipt handle is invalid.\nDica: o receipt handle vem do 'aws sqs receive-message' (campo ReceiptHandle).`);
      }
      f.mensagens.splice(i, 1);
      return okSilencioso("Mensagem apagada da fila (processada com sucesso).");
    },
    "get-queue-attributes": (conta, pos, flags) => {
      const [nome, f] = acharFila(conta, flags, "GetQueueAttributes");
      const esperando = f.mensagens.filter((m) => !m.recebida).length;
      const emVoo = f.mensagens.filter((m) => m.recebida).length;
      return js({ Attributes: {
        QueueArn: `arn:aws:sqs:${REGIAO(conta)}:${CONTA_ID(conta)}:${nome}`,
        ApproximateNumberOfMessages: String(esperando),
        ApproximateNumberOfMessagesNotVisible: String(emVoo),
        FifoQueue: f.tipo === "FIFO" ? "true" : "false",
        VisibilityTimeout: "30",
      } });
    },
    "purge-queue": (conta, pos, flags) => {
      const [, f] = acharFila(conta, flags, "PurgeQueue");
      f.mensagens = [];
      return okSilencioso("Fila esvaziada (todas as mensagens foram descartadas).");
    },
    "delete-queue": (conta, pos, flags) => {
      const [nome] = acharFila(conta, flags, "DeleteQueue");
      delete conta.sqs.filas[nome];
      return okSilencioso(`Fila "${nome}" apagada.`);
    },
  };

  // ============================================================
  // SNS — notificações (pub/sub)
  // ============================================================
  function arnTopico(conta, nome) {
    return `arn:aws:sns:${REGIAO(conta)}:${CONTA_ID(conta)}:${nome}`;
  }
  function acharTopico(conta, flags, operacao) {
    estado(conta);
    const arn = exigirFlag(flags, "topic-arn");
    const nome = String(arn).split(":").pop();
    const t = conta.sns.topicos[nome];
    if (!t || !String(arn).startsWith("arn:aws:sns:")) {
      throw new ErroCli(`An error occurred (NotFound) when calling the ${operacao} operation: Topic does not exist.\nDica: o ARN sai do 'aws sns create-topic' ou do 'aws sns list-topics'.`);
    }
    t.assinaturas = t.assinaturas || [];
    return [nome, t];
  }
  const PROTOCOLOS = ["email", "sms", "sqs", "lambda", "https", "http"];
  const cmdSns = {
    "create-topic": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "name");
      if (!NOME_FILA.test(nome.replace(/\.fifo$/, ""))) {
        throw new ErroCli(`An error occurred (InvalidParameter) when calling the CreateTopic operation: Invalid parameter: Topic Name`);
      }
      if (!conta.sns.topicos[nome]) {
        conta.sns.topicos[nome] = {
          arn: arnTopico(conta, nome), tipo: /\.fifo$/.test(nome) ? "FIFO" : "Standard",
          criadoEm: typeof dataFormatada === "function" ? dataFormatada() : agoraIso(),
          assinaturas: [],
        };
      }
      return js({ TopicArn: arnTopico(conta, nome) });
    },
    "list-topics": (conta) => {
      estado(conta);
      const t = Object.keys(conta.sns.topicos).map((n) => ({ TopicArn: arnTopico(conta, n) }));
      if (!t.length) { avisarClimb("Nenhum tópico ainda. Crie um com: aws sns create-topic --name alertas-loja"); return ""; }
      return js({ Topics: t });
    },
    subscribe: (conta, pos, flags) => {
      const [nome, t] = acharTopico(conta, flags, "Subscribe");
      const protocolo = exigirFlag(flags, "protocol");
      const endpoint = exigirFlag(flags, "notification-endpoint");
      if (!PROTOCOLOS.includes(protocolo)) {
        throw new ErroCli(`An error occurred (InvalidParameter) when calling the Subscribe operation: Invalid parameter: Does not support this protocol string: ${protocolo}\nProtocolos no simulador: ${PROTOCOLOS.join(", ")}`);
      }
      const arn = arnTopico(conta, nome) + ":" + hexAleatorio(8) + "-" + hexAleatorio(12);
      // e-mail entra como "pending confirmation" (igual à AWS: a pessoa precisa
      // clicar no link do e-mail antes de começar a receber)
      const pendente = protocolo === "email" || protocolo === "sms";
      t.assinaturas.push({ arn, protocolo, endpoint, pendente });
      return js({ SubscriptionArn: pendente ? "pending confirmation" : arn });
    },
    "list-subscriptions-by-topic": (conta, pos, flags) => {
      const [nome, t] = acharTopico(conta, flags, "ListSubscriptionsByTopic");
      return js({ Subscriptions: (t.assinaturas || []).map((a) => ({
        SubscriptionArn: a.pendente ? "PendingConfirmation" : a.arn,
        Owner: CONTA_ID(conta), Protocol: a.protocolo, Endpoint: a.endpoint,
        TopicArn: arnTopico(conta, nome),
      })) });
    },
    publish: (conta, pos, flags) => {
      const [, t] = acharTopico(conta, flags, "Publish");
      const msg = exigirFlag(flags, "message");
      // fan-out de verdade: assinatura de SQS entrega a mensagem na fila
      for (const a of (t.assinaturas || [])) {
        if (a.protocolo !== "sqs") continue;
        const nomeFila = String(a.endpoint).split(":").pop().split("/").pop();
        const f = conta.sqs.filas[nomeFila];
        if (f) {
          f.mensagens = f.mensagens || [];
          f.mensagens.push({ id: hexAleatorio(8), corpo: msg, recebida: false, handle: null });
        }
      }
      return js({ MessageId: hexAleatorio(8) + "-" + hexAleatorio(4) + "-" + hexAleatorio(12) });
    },
    unsubscribe: (conta, pos, flags) => {
      estado(conta);
      const arn = exigirFlag(flags, "subscription-arn");
      for (const t of Object.values(conta.sns.topicos)) {
        const i = (t.assinaturas || []).findIndex((a) => a.arn === arn);
        if (i >= 0) { t.assinaturas.splice(i, 1); return okSilencioso("Assinatura cancelada."); }
      }
      throw new ErroCli(`An error occurred (NotFound) when calling the Unsubscribe operation: Subscription does not exist\nDica: pegue o ARN com 'aws sns list-subscriptions-by-topic --topic-arn <arn>'.`);
    },
    "delete-topic": (conta, pos, flags) => {
      const [nome] = acharTopico(conta, flags, "DeleteTopic");
      delete conta.sns.topicos[nome];
      return okSilencioso(`Tópico "${nome}" apagado.`);
    },
  };

  // ============================================================
  // EBS — discos (subcomandos do aws ec2)
  // ============================================================
  const TIPOS_VOLUME = ["gp2", "gp3", "io1", "io2", "st1", "sc1", "standard"];
  function acharVolume(conta, flags, operacao) {
    estado(conta);
    const id = exigirFlag(flags, "volume-id");
    const v = conta.ec2.volumes[id];
    if (!v) throw new ErroCli(`An error occurred (InvalidVolume.NotFound) when calling the ${operacao} operation: The volume '${id}' does not exist.\nDica: veja os ids com 'aws ec2 describe-volumes'.`);
    return v;
  }
  function volumeJson(conta, v) {
    return {
      VolumeId: v.id, Size: v.tamanho, VolumeType: v.tipo, State: v.estado,
      AvailabilityZone: v.az, Encrypted: false, CreateTime: v.criadoEm,
      Iops: v.tipo === "gp3" ? 3000 : 100,
      Attachments: v.instancia
        ? [{ VolumeId: v.id, InstanceId: v.instancia, Device: v.device, State: "attached" }]
        : [],
    };
  }
  const cmdEbs = {
    "create-volume": (conta, pos, flags) => {
      estado(conta);
      const az = exigirFlag(flags, "availability-zone");
      const tamanho = parseInt(exigirFlag(flags, "size"), 10);
      const tipo = flags["volume-type"] || "gp3";
      if (!TIPOS_VOLUME.includes(tipo)) throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the CreateVolume operation: Invalid volume type: ${tipo}\nTipos: ${TIPOS_VOLUME.join(", ")}`);
      if (!(tamanho >= 1 && tamanho <= 16384)) throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the CreateVolume operation: Volume of ${flags.size} GiB is too small or too large (1 a 16384).`);
      if (!/^[a-z]{2}-[a-z]+-\d[a-z]$/.test(az)) throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the CreateVolume operation: Invalid availability zone: [${az}]\nEx.: ${REGIAO(conta)}a`);
      const id = "vol-0" + hexAleatorio(16);
      conta.ec2.volumes[id] = { id, tamanho, tipo, az, estado: "available", instancia: null, device: null, criadoEm: agoraIso() };
      return js(volumeJson(conta, conta.ec2.volumes[id]));
    },
    "describe-volumes": (conta) => {
      estado(conta);
      return js({ Volumes: Object.values(conta.ec2.volumes).map((v) => volumeJson(conta, v)) });
    },
    "attach-volume": (conta, pos, flags) => {
      const v = acharVolume(conta, flags, "AttachVolume");
      const inst = exigirFlag(flags, "instance-id");
      const device = exigirFlag(flags, "device");
      const i = conta.ec2.instancias[inst];
      if (!i || i.estado === "terminated") throw new ErroCli(`An error occurred (InvalidInstanceID.NotFound) when calling the AttachVolume operation: The instance ID '${inst}' does not exist`);
      if (v.instancia) throw new ErroCli(`An error occurred (VolumeInUse) when calling the AttachVolume operation: vol ${v.id} is already attached to an instance`);
      v.instancia = inst; v.device = device; v.estado = "in-use";
      return js({ AttachTime: agoraIso(), Device: device, InstanceId: inst, State: "attaching", VolumeId: v.id });
    },
    "detach-volume": (conta, pos, flags) => {
      const v = acharVolume(conta, flags, "DetachVolume");
      if (!v.instancia) throw new ErroCli(`An error occurred (IncorrectState) when calling the DetachVolume operation: Volume '${v.id}' is in the 'available' state.`);
      const inst = v.instancia;
      v.instancia = null; v.device = null; v.estado = "available";
      return js({ AttachTime: agoraIso(), Device: "/dev/sdf", InstanceId: inst, State: "detaching", VolumeId: v.id });
    },
    "delete-volume": (conta, pos, flags) => {
      const v = acharVolume(conta, flags, "DeleteVolume");
      if (v.instancia) throw new ErroCli(`An error occurred (VolumeInUse) when calling the DeleteVolume operation: Volume ${v.id} is currently attached to ${v.instancia}\nDesanexe antes: aws ec2 detach-volume --volume-id ${v.id}`);
      delete conta.ec2.volumes[v.id];
      return okSilencioso(`Volume ${v.id} apagado.`);
    },
    "create-snapshot": (conta, pos, flags) => {
      const v = acharVolume(conta, flags, "CreateSnapshot");
      const id = "snap-0" + hexAleatorio(16);
      conta.ec2.snapshots[id] = { id, volume: v.id, tamanho: v.tamanho, descricao: flags.description || "", criadoEm: agoraIso() };
      return js({ SnapshotId: id, VolumeId: v.id, VolumeSize: v.tamanho, State: "pending", Progress: "", Description: flags.description || "", StartTime: agoraIso() });
    },
    "describe-snapshots": (conta, pos, flags) => {
      estado(conta);
      return js({ Snapshots: Object.values(conta.ec2.snapshots).map((s) => ({
        SnapshotId: s.id, VolumeId: s.volume, VolumeSize: s.tamanho, State: "completed",
        Progress: "100%", Description: s.descricao, StartTime: s.criadoEm, OwnerId: CONTA_ID(conta),
      })) });
    },
  };

  // ============================================================
  // API Gateway — REST API
  // ============================================================
  function acharApi(conta, flags, operacao) {
    estado(conta);
    const id = exigirFlag(flags, "rest-api-id");
    const a = conta.apigateway.apis[id];
    if (!a) throw new ErroCli(`An error occurred (NotFoundException) when calling the ${operacao} operation: Invalid API identifier specified\nDica: veja os ids com 'aws apigateway get-rest-apis'.`);
    return a;
  }
  const METODOS = ["GET", "POST", "PUT", "DELETE", "PATCH", "ANY", "OPTIONS", "HEAD"];
  const cmdApiGw = {
    "create-rest-api": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "name");
      const id = hexAleatorio(10);
      const raiz = hexAleatorio(6);
      conta.apigateway.apis[id] = {
        id, nome, criadoEm: agoraIso(), descricao: flags.description || "",
        recursos: { [raiz]: { id: raiz, caminho: "/", parte: null, pai: null, metodos: {} } },
        raiz, estagios: {},
      };
      return js({ id, name: nome, description: flags.description || undefined, createdDate: agoraIso(), apiKeySource: "HEADER", endpointConfiguration: { types: ["EDGE"] } });
    },
    "get-rest-apis": (conta) => {
      estado(conta);
      const items = Object.values(conta.apigateway.apis).map((a) => ({ id: a.id, name: a.nome, createdDate: a.criadoEm }));
      if (!items.length) { avisarClimb("Nenhuma API ainda. Crie uma com: aws apigateway create-rest-api --name api-loja"); return ""; }
      return js({ items });
    },
    "get-resources": (conta, pos, flags) => {
      const a = acharApi(conta, flags, "GetResources");
      return js({ items: Object.values(a.recursos).map((r) => ({
        id: r.id, parentId: r.pai || undefined, pathPart: r.parte || undefined, path: r.caminho,
        resourceMethods: Object.keys(r.metodos).length
          ? Object.fromEntries(Object.keys(r.metodos).map((m) => [m, {}]))
          : undefined,
      })) });
    },
    "create-resource": (conta, pos, flags) => {
      const a = acharApi(conta, flags, "CreateResource");
      const pai = exigirFlag(flags, "parent-id");
      const parte = exigirFlag(flags, "path-part");
      if (!a.recursos[pai]) throw new ErroCli(`An error occurred (NotFoundException) when calling the CreateResource operation: Invalid Resource identifier specified\nDica: o id do recurso raiz (/) sai do 'aws apigateway get-resources --rest-api-id ${a.id}'.`);
      const caminhoPai = a.recursos[pai].caminho;
      const id = hexAleatorio(6);
      a.recursos[id] = { id, parte, pai, caminho: (caminhoPai === "/" ? "" : caminhoPai) + "/" + parte, metodos: {} };
      return js({ id, parentId: pai, pathPart: parte, path: a.recursos[id].caminho });
    },
    "put-method": (conta, pos, flags) => {
      const a = acharApi(conta, flags, "PutMethod");
      const recurso = exigirFlag(flags, "resource-id");
      const metodo = String(exigirFlag(flags, "http-method")).toUpperCase();
      const auth = exigirFlag(flags, "authorization-type");
      if (!a.recursos[recurso]) throw new ErroCli(`An error occurred (NotFoundException) when calling the PutMethod operation: Invalid Resource identifier specified`);
      if (!METODOS.includes(metodo)) throw new ErroCli(`An error occurred (BadRequestException) when calling the PutMethod operation: Invalid HTTP method specified: ${metodo}`);
      a.recursos[recurso].metodos[metodo] = { autorizacao: auth };
      return js({ httpMethod: metodo, authorizationType: auth, apiKeyRequired: false });
    },
    "create-deployment": (conta, pos, flags) => {
      const a = acharApi(conta, flags, "CreateDeployment");
      const estagio = exigirFlag(flags, "stage-name");
      const temMetodo = Object.values(a.recursos).some((r) => Object.keys(r.metodos).length);
      if (!temMetodo) throw new ErroCli(`An error occurred (BadRequestException) when calling the CreateDeployment operation: The REST API doesn't contain any methods\nCrie um método antes: aws apigateway put-method ...`);
      const id = hexAleatorio(6);
      a.estagios[estagio] = { nome: estagio, deployment: id, url: `https://${a.id}.execute-api.${REGIAO(conta)}.amazonaws.com/${estagio}` };
      avisarClimb(`API publicada! A URL do estágio é ${a.estagios[estagio].url}`);
      return js({ id, createdDate: agoraIso() });
    },
    "get-stages": (conta, pos, flags) => {
      const a = acharApi(conta, flags, "GetStages");
      return js({ item: Object.values(a.estagios).map((e) => ({ stageName: e.nome, deploymentId: e.deployment, invokeUrl: e.url })) });
    },
    "delete-rest-api": (conta, pos, flags) => {
      const a = acharApi(conta, flags, "DeleteRestApi");
      delete conta.apigateway.apis[a.id];
      return okSilencioso(`API "${a.nome}" apagada.`);
    },
  };

  // ============================================================
  // Route 53 — DNS
  // ============================================================
  const TIPOS_REGISTRO = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "SRV", "PTR", "CAA"];
  function acharZona(conta, flags, operacao, nomeFlag) {
    estado(conta);
    const bruto = exigirFlag(flags, nomeFlag || "hosted-zone-id");
    const id = String(bruto).replace(/^\/hostedzone\//, "");
    const z = conta.route53.zonas[id];
    if (!z) throw new ErroCli(`An error occurred (NoSuchHostedZone) when calling the ${operacao} operation: No hosted zone found with ID: ${id}\nDica: veja os ids com 'aws route53 list-hosted-zones'.`);
    return z;
  }
  const cmdRoute53 = {
    "create-hosted-zone": (conta, pos, flags) => {
      estado(conta);
      let nome = exigirFlag(flags, "name");
      exigirFlag(flags, "caller-reference"); // a AWS exige um valor único por chamada
      if (!/^[a-z0-9.-]+\.[a-z]{2,}\.?$/i.test(nome)) throw new ErroCli(`An error occurred (InvalidDomainName) when calling the CreateHostedZone operation: ${nome}\nEx.: climb-labs.com`);
      if (!/\.$/.test(nome)) nome += ".";
      if (Object.values(conta.route53.zonas).some((z) => z.nome === nome)) {
        throw new ErroCli(`An error occurred (HostedZoneAlreadyExists) when calling the CreateHostedZone operation: A hosted zone has already been created with the specified caller reference.`);
      }
      const id = "Z" + hexAleatorio(13).toUpperCase();
      const ns = [1, 2, 3, 4].map((n) => `ns-${100 + n}.awsdns-${n}0.com`);
      conta.route53.zonas[id] = { id, nome, criadoEm: agoraIso(), ns, registros: [
        { Name: nome, Type: "NS", TTL: 172800, ResourceRecords: ns.map((v) => ({ Value: v })) },
        { Name: nome, Type: "SOA", TTL: 900, ResourceRecords: [{ Value: `${ns[0]}. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400` }] },
      ] };
      return js({
        HostedZone: { Id: "/hostedzone/" + id, Name: nome, CallerReference: String(flags["caller-reference"]), ResourceRecordSetCount: 2 },
        DelegationSet: { NameServers: ns },
      });
    },
    "list-hosted-zones": (conta) => {
      estado(conta);
      const zonas = Object.values(conta.route53.zonas);
      if (!zonas.length) { avisarClimb("Nenhuma zona ainda. Crie uma com: aws route53 create-hosted-zone --name climb-labs.com --caller-reference climb-1"); return ""; }
      return js({ HostedZones: zonas.map((z) => ({ Id: "/hostedzone/" + z.id, Name: z.nome, ResourceRecordSetCount: z.registros.length })) });
    },
    "list-resource-record-sets": (conta, pos, flags) => {
      const z = acharZona(conta, flags, "ListResourceRecordSets");
      return js({ ResourceRecordSets: z.registros });
    },
    "change-resource-record-sets": (conta, pos, flags) => {
      const z = acharZona(conta, flags, "ChangeResourceRecordSets");
      const bruto = exigirFlag(flags, "change-batch");
      let lote;
      if (String(bruto).startsWith("file://")) {
        const arq = String(bruto).slice(7);
        if (!arquivoLocal(arq)) throw new ErroCli(`Error parsing parameter '--change-batch': Unable to load paramfile ${bruto}: arquivo não existe. Digite 'ls' (existe um registro-dns.json pronto).`);
        lote = REGISTRO_DNS_PADRAO; // o arquivo pronto cria um A pra www
      } else {
        try { lote = JSON.parse(bruto); }
        catch (e) { throw new ErroCli(`Error parsing parameter '--change-batch': Invalid JSON received.\nDica: dá pra usar o arquivo pronto: --change-batch file://registro-dns.json`); }
      }
      const mudancas = (lote && lote.Changes) || [];
      if (!mudancas.length) throw new ErroCli(`An error occurred (InvalidChangeBatch) when calling the ChangeResourceRecordSets operation: Invalid request: Expected exactly one of [Changes]`);
      for (const m of mudancas) {
        const r = m.ResourceRecordSet || {};
        if (!TIPOS_REGISTRO.includes(r.Type)) throw new ErroCli(`An error occurred (InvalidChangeBatch) when calling the ChangeResourceRecordSets operation: Invalid Resource Record Set type: ${r.Type}`);
        let nome = String(r.Name || "");
        if (nome && !/\.$/.test(nome)) nome += ".";
        const i = z.registros.findIndex((x) => x.Name === nome && x.Type === r.Type);
        if (m.Action === "DELETE") { if (i >= 0) z.registros.splice(i, 1); continue; }
        const novo = { Name: nome, Type: r.Type, TTL: r.TTL || 300, ResourceRecords: r.ResourceRecords || [] };
        if (i >= 0) z.registros[i] = novo; else z.registros.push(novo);
      }
      return js({ ChangeInfo: { Id: "/change/C" + hexAleatorio(12).toUpperCase(), Status: "PENDING", SubmittedAt: agoraIso() } });
    },
    "delete-hosted-zone": (conta, pos, flags) => {
      const z = acharZona(conta, flags, "DeleteHostedZone", "id");
      const proprios = z.registros.filter((r) => r.Type !== "NS" && r.Type !== "SOA");
      if (proprios.length) throw new ErroCli(`An error occurred (HostedZoneNotEmpty) when calling the DeleteHostedZone operation: The specified hosted zone contains non-required resource record sets and so cannot be deleted.\nApague os registros antes (Action DELETE no change-batch).`);
      delete conta.route53.zonas[z.id];
      return js({ ChangeInfo: { Id: "/change/C" + hexAleatorio(12).toUpperCase(), Status: "PENDING", SubmittedAt: agoraIso() } });
    },
  };
  // Conteúdo do registro-dns.json que vem pronto no "disco" do lab.
  const REGISTRO_DNS_PADRAO = {
    Comment: "registro do site",
    Changes: [{
      Action: "CREATE",
      ResourceRecordSet: { Name: "www.climb-labs.com", Type: "A", TTL: 300, ResourceRecords: [{ Value: "203.0.113.10" }] },
    }],
  };

  // ============================================================
  // CloudFront — CDN
  // ============================================================
  function acharDist(conta, flags, operacao) {
    estado(conta);
    const id = exigirFlag(flags, operacao === "CreateInvalidation" ? "distribution-id" : "id");
    const d = conta.cloudfront.distribuicoes[id];
    if (!d) throw new ErroCli(`An error occurred (NoSuchDistribution) when calling the ${operacao} operation: The specified distribution does not exist.\nDica: veja os ids com 'aws cloudfront list-distributions'.`);
    return d;
  }
  const cmdCloudFront = {
    "create-distribution": (conta, pos, flags) => {
      estado(conta);
      const origem = exigirFlag(flags, "origin-domain-name");
      if (!/\./.test(origem)) throw new ErroCli(`An error occurred (InvalidArgument) when calling the CreateDistribution operation: The parameter Origin DomainName does not refer to a valid S3 bucket or website.\nEx.: meu-site-climb.s3.amazonaws.com`);
      const id = "E" + hexAleatorio(13).toUpperCase();
      const dominio = "d" + hexAleatorio(12) + ".cloudfront.net";
      conta.cloudfront.distribuicoes[id] = { id, origem, dominio, ativo: true, criadoEm: agoraIso(), invalidacoes: [] };
      avisarClimb(`Distribuição criada. O site fica disponível em https://${dominio} (leva alguns minutos pra propagar na vida real).`);
      return js({ Distribution: {
        Id: id, ARN: `arn:aws:cloudfront::${CONTA_ID(conta)}:distribution/${id}`,
        Status: "InProgress", DomainName: dominio, LastModifiedTime: agoraIso(),
        DistributionConfig: { Enabled: true, Origins: { Quantity: 1, Items: [{ Id: origem, DomainName: origem }] }, DefaultRootObject: "index.html" },
      }, ETag: hexAleatorio(14).toUpperCase() });
    },
    "list-distributions": (conta) => {
      estado(conta);
      const itens = Object.values(conta.cloudfront.distribuicoes);
      if (!itens.length) { avisarClimb("Nenhuma distribuição ainda. Crie uma com: aws cloudfront create-distribution --origin-domain-name meu-site-climb.s3.amazonaws.com"); return ""; }
      return js({ DistributionList: { Quantity: itens.length, Items: itens.map((d) => ({
        Id: d.id, Status: d.ativo ? "Deployed" : "Disabled", DomainName: d.dominio,
        Enabled: d.ativo, Origins: { Quantity: 1, Items: [{ Id: d.origem, DomainName: d.origem }] },
      })) } });
    },
    "get-distribution": (conta, pos, flags) => {
      const d = acharDist(conta, flags, "GetDistribution");
      return js({ Distribution: {
        Id: d.id, Status: d.ativo ? "Deployed" : "Disabled", DomainName: d.dominio,
        DistributionConfig: { Enabled: d.ativo, Origins: { Quantity: 1, Items: [{ Id: d.origem, DomainName: d.origem }] } },
      }, ETag: hexAleatorio(14).toUpperCase() });
    },
    "create-invalidation": (conta, pos, flags) => {
      const d = acharDist(conta, flags, "CreateInvalidation");
      const caminhos = [].concat(flags.paths || []);
      if (!caminhos.length || caminhos[0] === true) throw new ErroCli(`aws: error: the following arguments are required: --paths\nEx.: --paths "/*"`);
      const id = "I" + hexAleatorio(12).toUpperCase();
      d.invalidacoes.push({ id, caminhos, criadoEm: agoraIso() });
      return js({ Location: `https://cloudfront.amazonaws.com/2020-05-31/distribution/${d.id}/invalidation/${id}`,
        Invalidation: { Id: id, Status: "InProgress", CreateTime: agoraIso(),
          InvalidationBatch: { Paths: { Quantity: caminhos.length, Items: caminhos }, CallerReference: hexAleatorio(8) } } });
    },
    "list-invalidations": (conta, pos, flags) => {
      const d = acharDist(conta, flags, "ListInvalidations");
      return js({ InvalidationList: { Quantity: d.invalidacoes.length, Items: d.invalidacoes.map((i) => ({ Id: i.id, CreateTime: i.criadoEm, Status: "Completed" })) } });
    },
  };

  // ---------- Registro no motor ----------
  if (typeof SERVICOS !== "undefined") {
    SERVICOS.sqs = cmdSqs;
    SERVICOS.sns = cmdSns;
    Object.assign(SERVICOS.ec2, cmdEbs); // EBS vive dentro do aws ec2
    SERVICOS.apigateway = cmdApiGw;
    SERVICOS.route53 = cmdRoute53;
    SERVICOS.cloudfront = cmdCloudFront;
  }
  // arquivo pronto no "disco" pro change-batch do Route 53
  if (typeof ARQUIVOS_LOCAIS !== "undefined" && !ARQUIVOS_LOCAIS["registro-dns.json"]) {
    ARQUIVOS_LOCAIS["registro-dns.json"] = 268;
  }

  // ============================================================
  // Trilhas — ordem: observar → criar → usar → configurar → limpar
  // ============================================================
  const URL_FILA = "https://sqs.us-east-1.amazonaws.com/123456789012/pedidos-novos";
  const ARN_TOPICO = "arn:aws:sns:us-east-1:123456789012:alertas-loja";

  const DESAFIOS_FASE2 = [
    // ===================== SQS =====================
    { id: "sqs-1", servico: "sqs", nivel: 1, xp: 40, titulo: "Tem alguma fila aí?",
      descricao: "A <b>fila</b> guarda tarefas pra serem processadas depois — o pedido entra na fila e alguém processa no seu tempo. Comece <b>listando</b> as filas da conta.",
      dicas: ["aws sqs list-queues"], solucao: ["aws sqs list-queues"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "list-queues") },
    { id: "sqs-2", servico: "sqs", nivel: 1, xp: 60, titulo: "Sua primeira fila",
      descricao: "A loja precisa de uma fila pros pedidos novos. Crie a fila <b>pedidos-novos</b>.",
      dicas: ["aws sqs create-queue --queue-name pedidos-novos", "Guarde a QueueUrl que aparece: é ela que os outros comandos pedem."],
      solucao: ["aws sqs create-queue --queue-name pedidos-novos"],
      validar: (c) => !!(c.sqs && c.sqs.filas["pedidos-novos"]) },
    { id: "sqs-3", servico: "sqs", nivel: 2, xp: 70, titulo: "Mande um pedido pra fila",
      descricao: "Envie a mensagem <b>pedido 1001</b> pra fila. A fila é identificada pela <b>URL</b> (não pelo nome!).",
      dicas: [`aws sqs send-message --queue-url ${URL_FILA} --message-body "pedido 1001"`],
      solucao: [`aws sqs send-message --queue-url ${URL_FILA} --message-body "pedido 1001"`],
      validar: (c) => { const f = c.sqs && c.sqs.filas["pedidos-novos"]; return !!f && (f.mensagens || []).some((m) => /1001/.test(m.corpo)); } },
    { id: "sqs-4", servico: "sqs", nivel: 2, xp: 60, titulo: "Quantos pedidos esperando?",
      descricao: "Veja os <b>atributos</b> da fila pra saber quantas mensagens estão esperando (<code>ApproximateNumberOfMessages</code>).",
      dicas: [`aws sqs get-queue-attributes --queue-url ${URL_FILA} --attribute-names All`],
      solucao: [`aws sqs get-queue-attributes --queue-url ${URL_FILA} --attribute-names All`],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "get-queue-attributes") },
    { id: "sqs-5", servico: "sqs", nivel: 2, xp: 70, titulo: "Puxe o pedido pra processar",
      descricao: "<b>Receba</b> a mensagem da fila. Repare no <b>ReceiptHandle</b> que volta — é o comprovante que você usa pra confirmar que processou.",
      dicas: [`aws sqs receive-message --queue-url ${URL_FILA}`],
      solucao: [`aws sqs receive-message --queue-url ${URL_FILA}`],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "receive-message") },
    { id: "sqs-6", servico: "sqs", nivel: 3, xp: 90, titulo: "Confirme que processou",
      descricao: "Processou o pedido? Agora <b>apague a mensagem</b> usando o <b>--receipt-handle</b> que veio no receive-message. <small>(sem isso ela volta pra fila — é assim que a SQS garante que nada se perde)</small>",
      dicas: ["Copie o ReceiptHandle da saída anterior.", `aws sqs delete-message --queue-url ${URL_FILA} --receipt-handle <receipt-handle>`],
      solucao: [`aws sqs delete-message --queue-url ${URL_FILA} --receipt-handle <receipt-handle>`],
      validar: (c, cmd, ok) => { const f = c.sqs && c.sqs.filas["pedidos-novos"]; return ok && ehCmd(cmd, "sqs", "delete-message") && !!f && (f.mensagens || []).length === 0; } },
    { id: "sqs-7", servico: "sqs", nivel: 3, xp: 80, titulo: "Fila FIFO (ordem garantida)",
      descricao: "Pagamentos não podem sair de ordem. Crie uma fila <b>FIFO</b> chamada <b>pagamentos.fifo</b> <small>(o nome PRECISA terminar em .fifo)</small>.",
      dicas: ["aws sqs create-queue --queue-name pagamentos.fifo --attributes FifoQueue=true"],
      solucao: ["aws sqs create-queue --queue-name pagamentos.fifo --attributes FifoQueue=true"],
      validar: (c) => { const f = c.sqs && c.sqs.filas["pagamentos.fifo"]; return !!f && f.tipo === "FIFO"; } },
    { id: "sqs-8", servico: "sqs", nivel: 3, xp: 70, titulo: "Faxina na fila",
      descricao: "A fila <b>pagamentos.fifo</b> era só teste. <b>Apague</b> ela.",
      dicas: ["aws sqs delete-queue --queue-url https://sqs.us-east-1.amazonaws.com/123456789012/pagamentos.fifo"],
      solucao: ["aws sqs delete-queue --queue-url https://sqs.us-east-1.amazonaws.com/123456789012/pagamentos.fifo"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "delete-queue") && !(c.sqs && c.sqs.filas["pagamentos.fifo"]) },

    // ===================== SNS =====================
    { id: "sns-1", servico: "sns", nivel: 1, xp: 40, titulo: "Quais tópicos existem?",
      descricao: "O <b>SNS</b> é o megafone da AWS: você publica uma mensagem num <b>tópico</b> e todo mundo que assinou recebe. Comece <b>listando</b> os tópicos.",
      dicas: ["aws sns list-topics"], solucao: ["aws sns list-topics"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "sns", "list-topics") },
    { id: "sns-2", servico: "sns", nivel: 1, xp: 60, titulo: "Crie o tópico de alertas",
      descricao: "Crie o tópico <b>alertas-loja</b> (é por ele que os avisos da loja vão sair).",
      dicas: ["aws sns create-topic --name alertas-loja", "Guarde o TopicArn — os outros comandos pedem ele."],
      solucao: ["aws sns create-topic --name alertas-loja"],
      validar: (c) => !!(c.sns && c.sns.topicos["alertas-loja"]) },
    { id: "sns-3", servico: "sns", nivel: 2, xp: 80, titulo: "Avise a equipe por e-mail",
      descricao: "<b>Assine</b> o tópico com o e-mail <b>equipe@climb-labs.com</b> (protocolo <b>email</b>).",
      dicas: [`aws sns subscribe --topic-arn ${ARN_TOPICO} --protocol email --notification-endpoint equipe@climb-labs.com`,
        "Na AWS real a pessoa recebe um link de confirmação — por isso o retorno é 'pending confirmation'."],
      solucao: [`aws sns subscribe --topic-arn ${ARN_TOPICO} --protocol email --notification-endpoint equipe@climb-labs.com`],
      validar: (c) => { const t = c.sns && c.sns.topicos["alertas-loja"]; return !!t && (t.assinaturas || []).some((a) => a.protocolo === "email"); } },
    { id: "sns-4", servico: "sns", nivel: 2, xp: 70, titulo: "Publique o primeiro aviso",
      descricao: "<b>Publique</b> a mensagem <b>Estoque acabando</b> no tópico.",
      dicas: [`aws sns publish --topic-arn ${ARN_TOPICO} --message "Estoque acabando"`],
      solucao: [`aws sns publish --topic-arn ${ARN_TOPICO} --message "Estoque acabando"`],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "sns", "publish") },
    { id: "sns-5", servico: "sns", nivel: 2, xp: 60, titulo: "Quem está inscrito?",
      descricao: "Liste as <b>assinaturas</b> do tópico <b>alertas-loja</b>.",
      dicas: [`aws sns list-subscriptions-by-topic --topic-arn ${ARN_TOPICO}`],
      solucao: [`aws sns list-subscriptions-by-topic --topic-arn ${ARN_TOPICO}`],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "sns", "list-subscriptions-by-topic") },
    { id: "sns-6", servico: "sns", nivel: 3, xp: 100, titulo: "Fan-out: SNS ➜ SQS",
      descricao: "O padrão mais usado em produção: o tópico entrega numa <b>fila</b>, que processa no seu ritmo. Assine a fila <b>pedidos-novos</b> no tópico (protocolo <b>sqs</b>, endpoint = ARN da fila).",
      dicas: [`O ARN da fila é arn:aws:sqs:us-east-1:123456789012:pedidos-novos`,
        `aws sns subscribe --topic-arn ${ARN_TOPICO} --protocol sqs --notification-endpoint arn:aws:sqs:us-east-1:123456789012:pedidos-novos`],
      solucao: [`aws sns subscribe --topic-arn ${ARN_TOPICO} --protocol sqs --notification-endpoint arn:aws:sqs:us-east-1:123456789012:pedidos-novos`],
      validar: (c) => { const t = c.sns && c.sns.topicos["alertas-loja"]; return !!t && (t.assinaturas || []).some((a) => a.protocolo === "sqs"); } },
    { id: "sns-7", servico: "sns", nivel: 3, xp: 90, titulo: "Veja o fan-out funcionando",
      descricao: "Publique <b>Promocao relampago</b> no tópico e depois confira que a mensagem <b>caiu na fila</b> pedidos-novos (get-queue-attributes).",
      dicas: [`aws sns publish --topic-arn ${ARN_TOPICO} --message "Promocao relampago"`,
        `aws sqs get-queue-attributes --queue-url ${URL_FILA} --attribute-names All`],
      solucao: [`aws sns publish --topic-arn ${ARN_TOPICO} --message "Promocao relampago"`,
        `aws sqs get-queue-attributes --queue-url ${URL_FILA} --attribute-names All`],
      validar: (c) => { const f = c.sqs && c.sqs.filas["pedidos-novos"]; return !!f && (f.mensagens || []).some((m) => /Promocao/i.test(m.corpo)); } },
    { id: "sns-8", servico: "sns", nivel: 3, xp: 70, titulo: "Desligue o megafone",
      descricao: "O canal de alertas foi descontinuado. <b>Apague</b> o tópico <b>alertas-loja</b>.",
      dicas: [`aws sns delete-topic --topic-arn ${ARN_TOPICO}`],
      solucao: [`aws sns delete-topic --topic-arn ${ARN_TOPICO}`],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "sns", "delete-topic") && !(c.sns && c.sns.topicos["alertas-loja"]) },

    // ===================== EBS =====================
    { id: "ebs-1", servico: "ebs", nivel: 1, xp: 50, titulo: "Que discos eu tenho?",
      descricao: "<b>EBS</b> é o HD da sua máquina virtual: um disco que existe separado da instância. Liste os <b>volumes</b> da conta. <small>(comandos de EBS ficam dentro do <code>aws ec2</code>)</small>",
      dicas: ["aws ec2 describe-volumes"], solucao: ["aws ec2 describe-volumes"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-volumes") },
    { id: "ebs-2", servico: "ebs", nivel: 1, xp: 70, titulo: "Crie um disco de 10 GB",
      descricao: "Crie um volume <b>gp3</b> de <b>10</b> GiB na zona <b>us-east-1a</b>. <small>(o volume nasce na zona — só encaixa em máquina da MESMA zona)</small>",
      dicas: ["aws ec2 create-volume --availability-zone us-east-1a --size 10 --volume-type gp3"],
      solucao: ["aws ec2 create-volume --availability-zone us-east-1a --size 10 --volume-type gp3"],
      validar: (c) => !!(c.ec2.volumes && Object.values(c.ec2.volumes).some((v) => v.tamanho === 10 && v.tipo === "gp3")) },
    { id: "ebs-3", servico: "ebs", nivel: 2, xp: 80, titulo: "Encaixe o disco na máquina",
      descricao: "<b>Anexe</b> o volume a uma instância EC2 no device <b>/dev/sdf</b>. Você precisa do id do volume e do id da instância.",
      dicas: ["Ids: aws ec2 describe-volumes e aws ec2 describe-instances",
        "aws ec2 attach-volume --volume-id <vol-id> --instance-id <id-da-instância> --device /dev/sdf"],
      solucao: ["aws ec2 attach-volume --volume-id <vol-id> --instance-id <id-da-instância> --device /dev/sdf"],
      validar: (c) => !!(c.ec2.volumes && Object.values(c.ec2.volumes).some((v) => v.instancia && v.estado === "in-use")) },
    { id: "ebs-4", servico: "ebs", nivel: 2, xp: 80, titulo: "Backup: tire um snapshot",
      descricao: "<b>Snapshot</b> é a foto do disco — é assim que se faz backup no EBS. Tire um snapshot do volume com a descrição <b>backup-diario</b>.",
      dicas: ['aws ec2 create-snapshot --volume-id <vol-id> --description "backup-diario"'],
      solucao: ['aws ec2 create-snapshot --volume-id <vol-id> --description "backup-diario"'],
      validar: (c) => !!(c.ec2.snapshots && Object.values(c.ec2.snapshots).some((s) => /backup-diario/.test(s.descricao))) },
    { id: "ebs-5", servico: "ebs", nivel: 2, xp: 50, titulo: "Confira seus backups",
      descricao: "Liste os <b>snapshots</b> da conta.",
      dicas: ["aws ec2 describe-snapshots"], solucao: ["aws ec2 describe-snapshots"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-snapshots") },
    { id: "ebs-6", servico: "ebs", nivel: 3, xp: 80, titulo: "Tire o disco da máquina",
      descricao: "<b>Desanexe</b> o volume da instância (a AWS não deixa apagar um disco que está encaixado).",
      dicas: ["aws ec2 detach-volume --volume-id <vol-id>"],
      solucao: ["aws ec2 detach-volume --volume-id <vol-id>"],
      validar: (c) => !!(c.ec2.volumes && Object.values(c.ec2.volumes).some((v) => !v.instancia && v.estado === "available")) },
    { id: "ebs-7", servico: "ebs", nivel: 3, xp: 80, titulo: "Descarte o disco",
      descricao: "Disco solto continua <b>custando</b> — é o vazamento de dinheiro mais comum na AWS. <b>Apague</b> o volume.",
      dicas: ["aws ec2 delete-volume --volume-id <vol-id>"],
      solucao: ["aws ec2 delete-volume --volume-id <vol-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-volume") },

    // ===================== API Gateway =====================
    { id: "apigw-1", servico: "apigateway", nivel: 1, xp: 50, titulo: "Tem alguma API publicada?",
      descricao: "O <b>API Gateway</b> é a porta de entrada HTTP da sua aplicação. Liste as <b>REST APIs</b> da conta.",
      dicas: ["aws apigateway get-rest-apis"], solucao: ["aws apigateway get-rest-apis"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "apigateway", "get-rest-apis") },
    { id: "apigw-2", servico: "apigateway", nivel: 1, xp: 70, titulo: "Crie a API da loja",
      descricao: "Crie uma REST API chamada <b>api-loja</b>.",
      dicas: ["aws apigateway create-rest-api --name api-loja", "Guarde o id que volta — todo comando seguinte pede ele."],
      solucao: ["aws apigateway create-rest-api --name api-loja"],
      validar: (c) => !!(c.apigateway && Object.values(c.apigateway.apis).some((a) => a.nome === "api-loja")) },
    { id: "apigw-3", servico: "apigateway", nivel: 2, xp: 70, titulo: "Ache a raiz da API",
      descricao: "Toda API nasce com o recurso raiz <b>/</b>. Liste os <b>recursos</b> pra pegar o id da raiz (você vai precisar dele no próximo passo).",
      dicas: ["aws apigateway get-resources --rest-api-id <api-id>"],
      solucao: ["aws apigateway get-resources --rest-api-id <api-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "apigateway", "get-resources") },
    { id: "apigw-4", servico: "apigateway", nivel: 2, xp: 90, titulo: "Crie o caminho /pedidos",
      descricao: "Crie um <b>recurso</b> com path-part <b>pedidos</b> pendurado na raiz (<b>--parent-id</b> = id da raiz).",
      dicas: ["aws apigateway create-resource --rest-api-id <api-id> --parent-id <root-id> --path-part pedidos"],
      solucao: ["aws apigateway create-resource --rest-api-id <api-id> --parent-id <root-id> --path-part pedidos"],
      validar: (c) => !!(c.apigateway && Object.values(c.apigateway.apis).some((a) => Object.values(a.recursos).some((r) => r.parte === "pedidos"))) },
    { id: "apigw-5", servico: "apigateway", nivel: 2, xp: 90, titulo: "Aceite requisições GET",
      descricao: "Um caminho sem método não responde nada. Crie o método <b>GET</b> em /pedidos com <b>--authorization-type NONE</b> (aberto).",
      dicas: ["aws apigateway put-method --rest-api-id <api-id> --resource-id <resource-id> --http-method GET --authorization-type NONE"],
      solucao: ["aws apigateway put-method --rest-api-id <api-id> --resource-id <resource-id> --http-method GET --authorization-type NONE"],
      validar: (c) => !!(c.apigateway && Object.values(c.apigateway.apis).some((a) => Object.values(a.recursos).some((r) => r.metodos && r.metodos.GET))) },
    { id: "apigw-6", servico: "apigateway", nivel: 3, xp: 100, titulo: "Publique no ar (estágio prod)",
      descricao: "Nada existe pro mundo até você fazer o <b>deployment</b>. Publique a API no estágio <b>prod</b>.",
      dicas: ["aws apigateway create-deployment --rest-api-id <api-id> --stage-name prod"],
      solucao: ["aws apigateway create-deployment --rest-api-id <api-id> --stage-name prod"],
      validar: (c) => !!(c.apigateway && Object.values(c.apigateway.apis).some((a) => a.estagios && a.estagios.prod)) },
    { id: "apigw-7", servico: "apigateway", nivel: 3, xp: 70, titulo: "Derrube a API",
      descricao: "Fim do experimento: <b>apague</b> a REST API.",
      dicas: ["aws apigateway delete-rest-api --rest-api-id <api-id>"],
      solucao: ["aws apigateway delete-rest-api --rest-api-id <api-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "apigateway", "delete-rest-api") && !Object.values((c.apigateway || {}).apis || {}).some((a) => a.nome === "api-loja") },

    // ===================== Route 53 =====================
    { id: "r53-1", servico: "route53", nivel: 1, xp: 40, titulo: "Quais domínios eu administro?",
      descricao: "O <b>Route 53</b> é o DNS da AWS: ele traduz <i>climb-labs.com</i> pro endereço do seu servidor. Liste as <b>hosted zones</b>.",
      dicas: ["aws route53 list-hosted-zones"], solucao: ["aws route53 list-hosted-zones"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "route53", "list-hosted-zones") },
    { id: "r53-2", servico: "route53", nivel: 1, xp: 80, titulo: "Crie a zona do domínio",
      descricao: "Crie a <b>hosted zone</b> do domínio <b>climb-labs.com</b>. O <b>--caller-reference</b> é um valor único que você inventa (evita criar duplicado sem querer) — use <b>climb-1</b>.",
      dicas: ["aws route53 create-hosted-zone --name climb-labs.com --caller-reference climb-1"],
      solucao: ["aws route53 create-hosted-zone --name climb-labs.com --caller-reference climb-1"],
      validar: (c) => !!(c.route53 && Object.values(c.route53.zonas).some((z) => z.nome === "climb-labs.com.")) },
    { id: "r53-3", servico: "route53", nivel: 2, xp: 70, titulo: "O que já tem na zona?",
      descricao: "Liste os <b>registros</b> da zona. Repare: ela já nasce com <b>NS</b> e <b>SOA</b> — esses dois a AWS cria sozinha e você não mexe.",
      dicas: ["aws route53 list-resource-record-sets --hosted-zone-id <zone-id>"],
      solucao: ["aws route53 list-resource-record-sets --hosted-zone-id <zone-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "route53", "list-resource-record-sets") },
    { id: "r53-4", servico: "route53", nivel: 3, xp: 100, titulo: "Aponte www pro servidor",
      descricao: "Crie um registro <b>A</b> pra <b>www.climb-labs.com</b>. Como o lote de mudanças é um JSON grande, use o arquivo pronto: <b>file://registro-dns.json</b>. <small>(digite <code>cat registro-dns.json</code> pra espiar o conteúdo)</small>",
      dicas: ["aws route53 change-resource-record-sets --hosted-zone-id <zone-id> --change-batch file://registro-dns.json"],
      solucao: ["aws route53 change-resource-record-sets --hosted-zone-id <zone-id> --change-batch file://registro-dns.json"],
      validar: (c) => !!(c.route53 && Object.values(c.route53.zonas).some((z) => z.registros.some((r) => r.Type === "A" && /^www\./.test(r.Name)))) },
    { id: "r53-5", servico: "route53", nivel: 3, xp: 90, titulo: "Apague o registro",
      descricao: "Mudou a infra: remova o registro <b>www</b> usando um change-batch com <b>Action: DELETE</b> (agora inline, escrevendo o JSON na mão).",
      dicas: [`--change-batch '{"Changes":[{"Action":"DELETE","ResourceRecordSet":{"Name":"www.climb-labs.com","Type":"A","TTL":300,"ResourceRecords":[{"Value":"203.0.113.10"}]}}]}'`],
      solucao: [`aws route53 change-resource-record-sets --hosted-zone-id <zone-id> --change-batch '{"Changes":[{"Action":"DELETE","ResourceRecordSet":{"Name":"www.climb-labs.com","Type":"A","TTL":300,"ResourceRecords":[{"Value":"203.0.113.10"}]}}]}'`],
      validar: (c) => !!(c.route53 && Object.values(c.route53.zonas).every((z) => !z.registros.some((r) => r.Type === "A"))) },
    { id: "r53-6", servico: "route53", nivel: 3, xp: 80, titulo: "Devolva o domínio",
      descricao: "<b>Apague</b> a hosted zone. <small>(a AWS só deixa se ela estiver sem registros próprios — por isso o passo anterior)</small>",
      dicas: ["aws route53 delete-hosted-zone --id <zone-id>"],
      solucao: ["aws route53 delete-hosted-zone --id <zone-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "route53", "delete-hosted-zone") && !Object.values((c.route53 || {}).zonas || {}).some((z) => z.nome === "climb-labs.com.") },

    // ===================== CloudFront =====================
    { id: "cf-1", servico: "cloudfront", nivel: 1, xp: 40, titulo: "Alguma CDN no ar?",
      descricao: "O <b>CloudFront</b> é a CDN da AWS: copia seu site pra servidores no mundo todo, então quem acessa do Japão não precisa buscar em Virgínia. Liste as <b>distribuições</b>.",
      dicas: ["aws cloudfront list-distributions"], solucao: ["aws cloudfront list-distributions"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cloudfront", "list-distributions") },
    { id: "cf-2", servico: "cloudfront", nivel: 2, xp: 90, titulo: "Coloque o site na CDN",
      descricao: "Crie uma distribuição com origem no bucket <b>meu-site-climb.s3.amazonaws.com</b> (a <b>origem</b> é de onde o CloudFront busca o conteúdo original).",
      dicas: ["aws cloudfront create-distribution --origin-domain-name meu-site-climb.s3.amazonaws.com"],
      solucao: ["aws cloudfront create-distribution --origin-domain-name meu-site-climb.s3.amazonaws.com"],
      validar: (c) => !!(c.cloudfront && Object.values(c.cloudfront.distribuicoes).some((d) => /meu-site-climb/.test(d.origem))) },
    { id: "cf-3", servico: "cloudfront", nivel: 2, xp: 70, titulo: "Qual é o endereço da CDN?",
      descricao: "Veja os detalhes da distribuição pra pegar o <b>DomainName</b> (aquele <code>d123abc.cloudfront.net</code>).",
      dicas: ["aws cloudfront get-distribution --id <dist-id>"],
      solucao: ["aws cloudfront get-distribution --id <dist-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cloudfront", "get-distribution") },
    { id: "cf-4", servico: "cloudfront", nivel: 3, xp: 100, titulo: "Publiquei e não atualizou!",
      descricao: "Clássico: você subiu a versão nova, mas a CDN ainda serve a antiga do cache. Crie uma <b>invalidação</b> pra <b>/*</b> (limpa tudo).",
      dicas: ['aws cloudfront create-invalidation --distribution-id <dist-id> --paths "/*"'],
      solucao: ['aws cloudfront create-invalidation --distribution-id <dist-id> --paths "/*"'],
      validar: (c) => !!(c.cloudfront && Object.values(c.cloudfront.distribuicoes).some((d) => (d.invalidacoes || []).length > 0)) },
    { id: "cf-5", servico: "cloudfront", nivel: 3, xp: 80, titulo: "Histórico de limpezas",
      descricao: "Liste as <b>invalidações</b> da distribuição (útil pra saber se alguém já limpou o cache hoje).",
      dicas: ["aws cloudfront list-invalidations --id <dist-id>"],
      solucao: ["aws cloudfront list-invalidations --id <dist-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cloudfront", "list-invalidations") },
  ];

  // ---------- Registro das trilhas ----------
  if (typeof SERVICOS_META !== "undefined" && typeof DESAFIOS !== "undefined") {
    const metas = [
      { id: "sqs", nome: "SQS", subtitulo: "Filas de mensagens", icone: "📨" },
      { id: "sns", nome: "SNS", subtitulo: "Notificações (pub/sub)", icone: "📣" },
      { id: "ebs", nome: "EBS", subtitulo: "Discos das máquinas", icone: "💽" },
      { id: "apigateway", nome: "API Gateway", subtitulo: "APIs HTTP", icone: "🚪" },
      { id: "route53", nome: "Route 53", subtitulo: "DNS e domínios", icone: "🌐" },
      { id: "cloudfront", nome: "CloudFront", subtitulo: "CDN e cache", icone: "🚀" },
    ];
    if (!SERVICOS_META.some((s) => s.id === "sqs")) {
      for (const m of metas) {
        const iProj = SERVICOS_META.findIndex((s) => s.id === "projetos");
        if (iProj >= 0) SERVICOS_META.splice(iProj, 0, m); else SERVICOS_META.push(m);
      }
      for (const d of DESAFIOS_FASE2) DESAFIOS.push(d);
    }
  }
})();
