"use strict";
// ============================================================
// CLImb — servicos-fase5.js
// Fase 5 da expansão: CloudTrail (auditoria), Systems Manager / Parameter
// Store (configuração), Cognito (login de usuários) e Auto Scaling
// (elasticidade).
//
// DUAS INTEGRAÇÕES DE VERDADE AQUI:
//  1. CloudTrail grava TODO comando que você roda no terminal (wrap do
//     executarComandoAwsBase) — o 'lookup-events' mostra o seu próprio
//     histórico, que é exatamente o que o CloudTrail faz na AWS.
//  2. Auto Scaling SOBE INSTÂNCIAS DE VERDADE: subir o desired-capacity faz
//     aparecer máquina no 'aws ec2 describe-instances', e baixar encerra.
//
// Mesmo padrão das fases anteriores. Usa os globais do simulador.js.
// ============================================================
(function () {
  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";
  const MAX_EVENTOS = 200; // histórico guardado do CloudTrail

  function estado(conta) {
    conta.cloudtrail = conta.cloudtrail || { trilhas: {}, eventos: [] };
    conta.cloudtrail.eventos = conta.cloudtrail.eventos || [];
    conta.ssm = conta.ssm || { parametros: {} };
    conta.cognito = conta.cognito || { pools: {} };
    conta.autoscaling = conta.autoscaling || { grupos: {}, modelos: {} };
    return conta;
  }

  // ============================================================
  // CloudTrail — auditoria
  // ============================================================
  // O CloudTrail registra o nome da API, NÃO o comando que você digitou.
  // Os comandos de alto nível do `aws s3` (mb, cp, ls...) são atalhos que por
  // baixo chamam APIs do S3 — então `aws s3 mb` aparece como "CreateBucket".
  const API_S3 = {
    mb: "CreateBucket", rb: "DeleteBucket", cp: "PutObject", rm: "DeleteObject",
    ls: "ListBuckets", sync: "PutObject", website: "PutBucketWebsite",
  };
  // "create-bucket" -> "CreateBucket"
  function nomeEvento(servico, sub) {
    if (servico === "s3" && API_S3[sub]) return API_S3[sub];
    return String(sub || "").split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  }
  function registrarEvento(conta, cmd, ok) {
    if (!cmd || !cmd.servico || !cmd.sub) return;
    if (cmd.servico === "help" || cmd.servico === "configure") return;
    estado(conta);
    conta.cloudtrail.eventos.unshift({
      id: hexAleatorio(8) + "-" + hexAleatorio(4) + "-" + hexAleatorio(12),
      nome: nomeEvento(cmd.servico, cmd.sub),
      fonte: (cmd.servico === "s3api" ? "s3" : cmd.servico) + ".amazonaws.com",
      quando: agoraIso(), ok: !!ok, usuario: "climb-aluno",
    });
    if (conta.cloudtrail.eventos.length > MAX_EVENTOS) conta.cloudtrail.eventos.length = MAX_EVENTOS;
  }

  function acharTrilha(conta, flags, operacao) {
    estado(conta);
    const nome = exigirFlag(flags, "name");
    const t = conta.cloudtrail.trilhas[nome];
    if (!t) throw new ErroCli(`An error occurred (TrailNotFoundException) when calling the ${operacao} operation: Unknown trail: ${nome} for the user.`);
    return t;
  }
  const cmdCloudTrail = {
    "create-trail": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "name");
      const bucket = exigirFlag(flags, "s3-bucket-name");
      if (!conta.s3.buckets[bucket]) {
        throw new ErroCli(`An error occurred (S3BucketDoesNotExistException) when calling the CreateTrail operation: S3 bucket does not exist: ${bucket}\nCrie antes: aws s3 mb s3://${bucket}`);
      }
      if (conta.cloudtrail.trilhas[nome]) throw new ErroCli(`An error occurred (TrailAlreadyExistsException) when calling the CreateTrail operation: Trail ${nome} already exists`);
      conta.cloudtrail.trilhas[nome] = { nome, bucket, gravando: false, multiRegiao: flags["is-multi-region-trail"] !== undefined, criadoEm: agoraIso() };
      avisarClimb("Trilha criada, mas ainda NÃO está gravando. Ligue com 'aws cloudtrail start-logging --name " + nome + "'.");
      return js({ Name: nome, S3BucketName: bucket,
        TrailARN: `arn:aws:cloudtrail:${REGIAO(conta)}:${CONTA_ID(conta)}:trail/${nome}`,
        IsMultiRegionTrail: !!conta.cloudtrail.trilhas[nome].multiRegiao, LogFileValidationEnabled: false });
    },
    "describe-trails": (conta) => {
      estado(conta);
      const t = Object.values(conta.cloudtrail.trilhas);
      if (!t.length) { avisarClimb("Nenhuma trilha ainda. Crie uma com: aws cloudtrail create-trail --name trilha-auditoria --s3-bucket-name <bucket>"); return ""; }
      return js({ trailList: t.map((x) => ({
        Name: x.nome, S3BucketName: x.bucket, IsMultiRegionTrail: !!x.multiRegiao,
        TrailARN: `arn:aws:cloudtrail:${REGIAO(conta)}:${CONTA_ID(conta)}:trail/${x.nome}`,
        HomeRegion: REGIAO(conta),
      })) });
    },
    "start-logging": (conta, pos, flags) => {
      const t = acharTrilha(conta, flags, "StartLogging");
      t.gravando = true;
      avisarClimb("A partir de agora tudo que acontece na conta vira registro. Veja com 'aws cloudtrail lookup-events'.");
      return okSilencioso(`Trilha "${t.nome}" gravando.`);
    },
    "stop-logging": (conta, pos, flags) => {
      const t = acharTrilha(conta, flags, "StopLogging");
      t.gravando = false;
      return okSilencioso(`Trilha "${t.nome}" parada.`);
    },
    "get-trail-status": (conta, pos, flags) => {
      const t = acharTrilha(conta, flags, "GetTrailStatus");
      return js({ IsLogging: !!t.gravando, LatestDeliveryTime: t.gravando ? agoraIso() : undefined,
        StartLoggingTime: t.gravando ? agoraIso() : undefined });
    },
    "lookup-events": (conta, pos, flags) => {
      estado(conta);
      let eventos = conta.cloudtrail.eventos;
      // --lookup-attributes AttributeKey=EventName,AttributeValue=RunInstances
      const attr = flags["lookup-attributes"];
      if (attr) {
        const txt = String(attr);
        const chave = (txt.match(/AttributeKey=(\w+)/) || [])[1];
        const valor = (txt.match(/AttributeValue=([^,\s]+)/) || [])[1];
        if (!chave || !valor) throw new ErroCli(`An error occurred (InvalidLookupAttributesException) when calling the LookupEvents operation: Formato: --lookup-attributes AttributeKey=EventName,AttributeValue=RunInstances`);
        if (chave === "EventName") eventos = eventos.filter((e) => e.nome === valor);
        else if (chave === "EventSource") eventos = eventos.filter((e) => e.fonte === valor);
        else eventos = [];
      }
      const max = parseInt(flags["max-results"] || "10", 10);
      const lista = eventos.slice(0, Math.max(1, max));
      if (!lista.length) { avisarClimb("Nenhum evento com esse filtro. Rode alguns comandos e consulte de novo — o CloudTrail registra tudo que você faz."); return js({ Events: [] }); }
      return js({ Events: lista.map((e) => ({
        EventId: e.id, EventName: e.nome, EventTime: e.quando, EventSource: e.fonte,
        Username: e.usuario, ReadOnly: /^(List|Describe|Get)/.test(e.nome) ? "true" : "false",
        ErrorCode: e.ok ? undefined : "AccessDeniedOrInvalidRequest",
      })) });
    },
    "delete-trail": (conta, pos, flags) => {
      const t = acharTrilha(conta, flags, "DeleteTrail");
      delete conta.cloudtrail.trilhas[t.nome];
      return okSilencioso(`Trilha "${t.nome}" apagada. (Os logs já entregues no S3 continuam lá.)`);
    },
  };

  // ============================================================
  // Systems Manager — Parameter Store
  // ============================================================
  const TIPOS_PARAM = ["String", "StringList", "SecureString"];
  const cmdSsm = {
    "put-parameter": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "name");
      const valor = String(exigirFlag(flags, "value"));
      const tipo = flags.type ? String(flags.type) : "String";
      if (!TIPOS_PARAM.includes(tipo)) throw new ErroCli(`An error occurred (ValidationException) when calling the PutParameter operation: 1 validation error detected: Value '${tipo}' at 'type' failed to satisfy constraint: Member must satisfy enum value set: [${TIPOS_PARAM.join(", ")}]`);
      if (!/^\/?[\w.\-/]+$/.test(nome)) throw new ErroCli(`An error occurred (ValidationException) when calling the PutParameter operation: Parameter name: pode ter letras, números, ponto, hífen e barra. Ex.: /loja/url-api`);
      const existente = conta.ssm.parametros[nome];
      if (existente && flags.overwrite === undefined) {
        throw new ErroCli(`An error occurred (ParameterAlreadyExists) when calling the PutParameter operation: The parameter already exists. To overwrite this value, set the overwrite option in the request to true.\nUse --overwrite.`);
      }
      conta.ssm.parametros[nome] = { nome, valor, tipo, versao: existente ? existente.versao + 1 : 1, criadoEm: agoraIso() };
      if (tipo === "SecureString") avisarClimb("SecureString = cifrado com KMS. Quem lê precisa passar --with-decryption (e ter permissão na chave).");
      return js({ Version: conta.ssm.parametros[nome].versao, Tier: "Standard" });
    },
    "get-parameter": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "name");
      const p = conta.ssm.parametros[nome];
      if (!p) throw new ErroCli(`An error occurred (ParameterNotFound) when calling the GetParameter operation: ${nome}`);
      const decifrar = flags["with-decryption"] !== undefined;
      const valor = p.tipo === "SecureString" && !decifrar ? "AQICAHh" + hexAleatorio(24) : p.valor;
      if (p.tipo === "SecureString" && !decifrar) avisarClimb("Veio cifrado! Pra ver o valor de verdade, repita com --with-decryption.");
      return js({ Parameter: { Name: p.nome, Type: p.tipo, Value: valor, Version: p.versao,
        ARN: `arn:aws:ssm:${REGIAO(conta)}:${CONTA_ID(conta)}:parameter${p.nome.startsWith("/") ? "" : "/"}${p.nome}`,
        LastModifiedDate: p.criadoEm } });
    },
    "get-parameters-by-path": (conta, pos, flags) => {
      estado(conta);
      const caminho = String(exigirFlag(flags, "path"));
      const decifrar = flags["with-decryption"] !== undefined;
      const achados = Object.values(conta.ssm.parametros).filter((p) => p.nome.startsWith(caminho));
      if (!achados.length) avisarClimb(`Nenhum parâmetro em "${caminho}". Repare que o caminho é hierárquico: /loja/ pega /loja/url-api, /loja/senha-db...`);
      return js({ Parameters: achados.map((p) => ({
        Name: p.nome, Type: p.tipo, Version: p.versao,
        Value: p.tipo === "SecureString" && !decifrar ? "AQICAHh" + hexAleatorio(16) : p.valor,
      })) });
    },
    "describe-parameters": (conta) => {
      estado(conta);
      const l = Object.values(conta.ssm.parametros);
      if (!l.length) { avisarClimb("Nenhum parâmetro ainda. Crie um com: aws ssm put-parameter --name /loja/url-api --value https://api.loja.com --type String"); return ""; }
      return js({ Parameters: l.map((p) => ({ Name: p.nome, Type: p.tipo, Version: p.versao, LastModifiedDate: p.criadoEm })) });
    },
    "delete-parameter": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "name");
      if (!conta.ssm.parametros[nome]) throw new ErroCli(`An error occurred (ParameterNotFound) when calling the DeleteParameter operation: ${nome}`);
      delete conta.ssm.parametros[nome];
      return okSilencioso(`Parâmetro "${nome}" apagado.`);
    },
  };

  // ============================================================
  // Cognito — login de usuários (aws cognito-idp)
  // ============================================================
  function acharPool(conta, flags, operacao) {
    estado(conta);
    const id = exigirFlag(flags, "user-pool-id");
    const p = conta.cognito.pools[id];
    if (!p) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the ${operacao} operation: User pool ${id} does not exist.\nDica: veja os ids com 'aws cognito-idp list-user-pools --max-results 10'.`);
    return p;
  }
  const cmdCognito = {
    "create-user-pool": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "pool-name");
      const id = REGIAO(conta) + "_" + hexAleatorio(9).toUpperCase();
      conta.cognito.pools[id] = { id, nome, usuarios: {}, clientes: {}, criadoEm: agoraIso() };
      avisarClimb("O user pool é o SEU banco de usuários: cadastro, login, confirmação por e-mail e MFA prontos — sem você escrever autenticação.");
      return js({ UserPool: { Id: id, Name: nome, CreationDate: agoraIso(),
        Arn: `arn:aws:cognito-idp:${REGIAO(conta)}:${CONTA_ID(conta)}:userpool/${id}` } });
    },
    "list-user-pools": (conta, pos, flags) => {
      estado(conta);
      exigirFlag(flags, "max-results"); // a AWS exige esse parâmetro aqui
      const l = Object.values(conta.cognito.pools);
      if (!l.length) { avisarClimb("Nenhum user pool ainda. Crie um com: aws cognito-idp create-user-pool --pool-name usuarios-loja"); return ""; }
      return js({ UserPools: l.map((p) => ({ Id: p.id, Name: p.nome, CreationDate: p.criadoEm })) });
    },
    "describe-user-pool": (conta, pos, flags) => {
      const p = acharPool(conta, flags, "DescribeUserPool");
      return js({ UserPool: { Id: p.id, Name: p.nome, CreationDate: p.criadoEm,
        EstimatedNumberOfUsers: Object.keys(p.usuarios).length,
        Policies: { PasswordPolicy: { MinimumLength: 8, RequireUppercase: true, RequireNumbers: true } } } });
    },
    "create-user-pool-client": (conta, pos, flags) => {
      const p = acharPool(conta, flags, "CreateUserPoolClient");
      const nome = exigirFlag(flags, "client-name");
      const id = hexAleatorio(26);
      p.clientes[id] = { id, nome, criadoEm: agoraIso() };
      avisarClimb("O CLIENT representa o app (site, celular) que vai usar o pool. É esse ClientId que vai no código do front-end.");
      return js({ UserPoolClient: { ClientId: id, ClientName: nome, UserPoolId: p.id } });
    },
    "admin-create-user": (conta, pos, flags) => {
      const p = acharPool(conta, flags, "AdminCreateUser");
      const usuario = exigirFlag(flags, "username");
      if (p.usuarios[usuario]) throw new ErroCli(`An error occurred (UsernameExistsException) when calling the AdminCreateUser operation: User account already exists`);
      p.usuarios[usuario] = { usuario, estado: "FORCE_CHANGE_PASSWORD", criadoEm: agoraIso() };
      avisarClimb("Usuário criado com senha temporária: ele entra como FORCE_CHANGE_PASSWORD e é obrigado a trocar no primeiro login.");
      return js({ User: { Username: usuario, UserStatus: "FORCE_CHANGE_PASSWORD", Enabled: true, UserCreateDate: agoraIso() } });
    },
    "list-users": (conta, pos, flags) => {
      const p = acharPool(conta, flags, "ListUsers");
      return js({ Users: Object.values(p.usuarios).map((u) => ({
        Username: u.usuario, UserStatus: u.estado, Enabled: true, UserCreateDate: u.criadoEm,
      })) });
    },
    "admin-delete-user": (conta, pos, flags) => {
      const p = acharPool(conta, flags, "AdminDeleteUser");
      const usuario = exigirFlag(flags, "username");
      if (!p.usuarios[usuario]) throw new ErroCli(`An error occurred (UserNotFoundException) when calling the AdminDeleteUser operation: User does not exist.`);
      delete p.usuarios[usuario];
      return okSilencioso(`Usuário "${usuario}" removido do pool.`);
    },
    "delete-user-pool": (conta, pos, flags) => {
      const p = acharPool(conta, flags, "DeleteUserPool");
      delete conta.cognito.pools[p.id];
      return okSilencioso(`User pool "${p.nome}" apagado (junto com os usuários dele).`);
    },
  };

  // ============================================================
  // Auto Scaling (+ launch template no aws ec2)
  // ============================================================
  const cmdLaunchTemplate = {
    "create-launch-template": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "launch-template-name");
      const dados = String(exigirFlag(flags, "launch-template-data"));
      let cfg;
      try { cfg = JSON.parse(dados); }
      catch (e) { throw new ErroCli(`Error parsing parameter '--launch-template-data': Invalid JSON received.\nEx.: '{"ImageId":"ami-0abcd1234ef567890","InstanceType":"t2.micro"}'`); }
      if (!cfg.ImageId || !cfg.InstanceType) throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the CreateLaunchTemplate operation: launch-template-data precisa de ImageId e InstanceType.`);
      if (conta.autoscaling.modelos[nome]) throw new ErroCli(`An error occurred (InvalidLaunchTemplateName.AlreadyExistsException) when calling the CreateLaunchTemplate operation: Launch template name already in use.`);
      const id = "lt-0" + hexAleatorio(16);
      conta.autoscaling.modelos[nome] = { nome, id, imagem: cfg.ImageId, tipo: cfg.InstanceType, criadoEm: agoraIso() };
      avisarClimb("O launch template é a RECEITA da máquina (imagem, tipo, chave). O Auto Scaling usa ela pra subir cópias iguais.");
      return js({ LaunchTemplate: { LaunchTemplateId: id, LaunchTemplateName: nome, DefaultVersionNumber: 1, LatestVersionNumber: 1, CreateTime: agoraIso() } });
    },
    "describe-launch-templates": (conta) => {
      estado(conta);
      return js({ LaunchTemplates: Object.values(conta.autoscaling.modelos).map((m) => ({
        LaunchTemplateId: m.id, LaunchTemplateName: m.nome, CreateTime: m.criadoEm, LatestVersionNumber: 1,
      })) });
    },
  };

  // sobe/encerra instâncias de verdade pra bater com a capacidade desejada
  function ajustarCapacidade(conta, g) {
    const vivas = () => Object.values(conta.ec2.instancias).filter((i) => i.asg === g.nome && i.estado === "running");
    const modelo = conta.autoscaling.modelos[g.modelo] || { imagem: "ami-0abcd1234ef567890", tipo: "t2.micro" };
    while (vivas().length < g.desejado) {
      const id = "i-0" + hexAleatorio(16);
      conta.ec2.instancias[id] = {
        id, imagem: modelo.imagem, tipo: modelo.tipo, chave: null, sgs: [],
        estado: "running", criadaEm: agoraIso(), resId: "r-0" + hexAleatorio(16), asg: g.nome,
      };
    }
    const lista = vivas();
    for (let i = g.desejado; i < lista.length; i++) lista[i].estado = "terminated";
  }
  const cmdAutoScaling = {
    "create-auto-scaling-group": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "auto-scaling-group-name");
      const modeloTxt = String(exigirFlag(flags, "launch-template"));
      const min = parseInt(exigirFlag(flags, "min-size"), 10);
      const max = parseInt(exigirFlag(flags, "max-size"), 10);
      exigirFlag(flags, "availability-zones");
      const nomeModelo = (modeloTxt.match(/LaunchTemplateName=([^,\s]+)/) || [])[1];
      if (!nomeModelo) throw new ErroCli(`An error occurred (ValidationError) when calling the CreateAutoScalingGroup operation: Ex.: --launch-template LaunchTemplateName=modelo-web,Version=1`);
      if (!conta.autoscaling.modelos[nomeModelo]) throw new ErroCli(`An error occurred (ValidationError) when calling the CreateAutoScalingGroup operation: You must use a valid fully-formed launch template. Launch template ${nomeModelo} não existe.\nCrie antes: aws ec2 create-launch-template ...`);
      if (conta.autoscaling.grupos[nome]) throw new ErroCli(`An error occurred (AlreadyExists) when calling the CreateAutoScalingGroup operation: AutoScalingGroup by this name already exists`);
      if (max < min) throw new ErroCli(`An error occurred (ValidationError) when calling the CreateAutoScalingGroup operation: MaxSize precisa ser >= MinSize.`);
      const desejado = flags["desired-capacity"] !== undefined ? parseInt(flags["desired-capacity"], 10) : min;
      if (desejado < min || desejado > max) throw new ErroCli(`An error occurred (ValidationError) when calling the CreateAutoScalingGroup operation: Desired capacity:${desejado} must be between the min size:${min} and max size:${max}`);
      const g = conta.autoscaling.grupos[nome] = { nome, modelo: nomeModelo, min, max, desejado, politicas: {}, criadoEm: agoraIso() };
      ajustarCapacidade(conta, g);
      avisarClimb(`Pronto: ${desejado} instância(s) subiram sozinhas. Confira com 'aws ec2 describe-instances' — o grupo cuida de manter esse número, mesmo se uma cair.`);
      return okSilencioso(`Auto Scaling group "${nome}" criado.`);
    },
    "describe-auto-scaling-groups": (conta) => {
      estado(conta);
      const l = Object.values(conta.autoscaling.grupos);
      if (!l.length) { avisarClimb("Nenhum grupo ainda. Crie um com: aws autoscaling create-auto-scaling-group ..."); return ""; }
      return js({ AutoScalingGroups: l.map((g) => ({
        AutoScalingGroupName: g.nome, MinSize: g.min, MaxSize: g.max, DesiredCapacity: g.desejado,
        LaunchTemplate: { LaunchTemplateName: g.modelo, Version: "1" },
        Instances: Object.values(conta.ec2.instancias).filter((i) => i.asg === g.nome && i.estado === "running")
          .map((i) => ({ InstanceId: i.id, LifecycleState: "InService", HealthStatus: "Healthy" })),
      })) });
    },
    "set-desired-capacity": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "auto-scaling-group-name");
      const g = conta.autoscaling.grupos[nome];
      if (!g) throw new ErroCli(`An error occurred (ValidationError) when calling the SetDesiredCapacity operation: AutoScalingGroup name not found - ${nome}`);
      const novo = parseInt(exigirFlag(flags, "desired-capacity"), 10);
      if (novo < g.min || novo > g.max) throw new ErroCli(`An error occurred (ValidationError) when calling the SetDesiredCapacity operation: New SetDesiredCapacity value ${novo} is above max value ${g.max} (ou abaixo do min ${g.min}) for the AutoScalingGroup.`);
      const antes = g.desejado;
      g.desejado = novo;
      ajustarCapacidade(conta, g);
      avisarClimb(novo > antes ? `Subiu de ${antes} pra ${novo} — as máquinas novas já estão no ar.` : `Desceu de ${antes} pra ${novo} — as sobrando foram encerradas (e param de custar).`);
      return okSilencioso(`Capacidade desejada de "${nome}" agora é ${novo}.`);
    },
    "update-auto-scaling-group": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "auto-scaling-group-name");
      const g = conta.autoscaling.grupos[nome];
      if (!g) throw new ErroCli(`An error occurred (ValidationError) when calling the UpdateAutoScalingGroup operation: AutoScalingGroup name not found - ${nome}`);
      if (flags["min-size"] !== undefined) g.min = parseInt(flags["min-size"], 10);
      if (flags["max-size"] !== undefined) g.max = parseInt(flags["max-size"], 10);
      if (flags["desired-capacity"] !== undefined) g.desejado = parseInt(flags["desired-capacity"], 10);
      if (g.desejado < g.min) g.desejado = g.min;
      if (g.desejado > g.max) g.desejado = g.max;
      ajustarCapacidade(conta, g);
      return okSilencioso(`Grupo "${nome}" atualizado (min ${g.min}, max ${g.max}, desejado ${g.desejado}).`);
    },
    "put-scaling-policy": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "auto-scaling-group-name");
      const g = conta.autoscaling.grupos[nome];
      if (!g) throw new ErroCli(`An error occurred (ValidationError) when calling the PutScalingPolicy operation: AutoScalingGroup name not found - ${nome}`);
      const politica = exigirFlag(flags, "policy-name");
      const tipo = String(flags["policy-type"] || "TargetTrackingScaling");
      g.politicas[politica] = { nome: politica, tipo, criadoEm: agoraIso() };
      avisarClimb("Com a política, o grupo escala SOZINHO: passou do alvo de CPU, sobe máquina; sobrou capacidade, desce. Você não fica olhando gráfico de madrugada.");
      return js({ PolicyARN: `arn:aws:autoscaling:${REGIAO(conta)}:${CONTA_ID(conta)}:scalingPolicy:${hexAleatorio(8)}:autoScalingGroupName/${nome}:policyName/${politica}` });
    },
    "delete-auto-scaling-group": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "auto-scaling-group-name");
      const g = conta.autoscaling.grupos[nome];
      if (!g) throw new ErroCli(`An error occurred (ValidationError) when calling the DeleteAutoScalingGroup operation: AutoScalingGroup name not found - ${nome}`);
      const vivas = Object.values(conta.ec2.instancias).filter((i) => i.asg === nome && i.estado === "running");
      if (vivas.length && flags["force-delete"] === undefined) {
        throw new ErroCli(`An error occurred (ResourceInUse) when calling the DeleteAutoScalingGroup operation: You cannot delete an AutoScalingGroup while there are instances still in the group.\nZere antes (--min-size 0 --desired-capacity 0) ou use --force-delete.`);
      }
      for (const i of Object.values(conta.ec2.instancias)) if (i.asg === nome) i.estado = "terminated";
      delete conta.autoscaling.grupos[nome];
      return okSilencioso(`Auto Scaling group "${nome}" apagado.`);
    },
  };

  // ---------- Registro no motor ----------
  if (typeof SERVICOS !== "undefined") {
    SERVICOS.cloudtrail = cmdCloudTrail;
    SERVICOS.ssm = cmdSsm;
    SERVICOS["cognito-idp"] = cmdCognito;
    SERVICOS.autoscaling = cmdAutoScaling;
    Object.assign(SERVICOS.ec2, cmdLaunchTemplate); // launch template vive no aws ec2
  }

  // ---------- CloudTrail: grava TODO comando executado ----------
  // Wrap do dispatcher (mesma técnica dos outros módulos aditivos). É isso que
  // faz o 'lookup-events' mostrar o histórico real de quem está jogando.
  (function ligarAuditoria() {
    const alvo = typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null);
    const base = (alvo && alvo.executarComandoAwsBase) || (typeof executarComandoAwsBase === "function" ? executarComandoAwsBase : null);
    if (typeof base !== "function") return;
    if (base.__climbAuditado) return; // não empilha wraps
    const envolvido = function (conta, linha) {
      const r = base(conta, linha);
      try { registrarEvento(conta, r && r.cmd, r && r.ok); } catch (e) { /* auditoria nunca quebra o comando */ }
      return r;
    };
    envolvido.__climbAuditado = true;
    if (alvo) alvo.executarComandoAwsBase = envolvido;
    try { executarComandoAwsBase = envolvido; } catch (e) { /* já coberto pelo global acima */ }
  })();

  // ============================================================
  // Trilhas
  // ============================================================
  const DESAFIOS_FASE5 = [
    // ===================== CloudTrail =====================
    { id: "ct-1", servico: "cloudtrail", nivel: 1, xp: 50, titulo: "Quem mexeu na conta?",
      descricao: "O <b>CloudTrail</b> é a câmera de segurança da AWS: registra quem fez o quê e quando. Comece <b>listando</b> as trilhas existentes.",
      dicas: ["aws cloudtrail describe-trails"], solucao: ["aws cloudtrail describe-trails"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cloudtrail", "describe-trails") },
    { id: "ct-2", servico: "cloudtrail", nivel: 2, xp: 80, titulo: "Onde guardar as gravações",
      descricao: "Os registros vão pra um bucket. Crie o bucket <b>logs-auditoria-climb</b> e depois a trilha <b>trilha-auditoria</b> apontando pra ele.",
      dicas: ["Primeiro: aws s3 mb s3://logs-auditoria-climb",
        "Depois: aws cloudtrail create-trail --name trilha-auditoria --s3-bucket-name logs-auditoria-climb"],
      solucao: ["aws s3 mb s3://logs-auditoria-climb",
        "aws cloudtrail create-trail --name trilha-auditoria --s3-bucket-name logs-auditoria-climb"],
      validar: (c) => !!(c.cloudtrail && c.cloudtrail.trilhas["trilha-auditoria"]) },
    { id: "ct-3", servico: "cloudtrail", nivel: 2, xp: 70, titulo: "Ligue a câmera",
      descricao: "Trilha criada não grava sozinha! <b>Inicie a gravação</b> da <b>trilha-auditoria</b>.",
      dicas: ["aws cloudtrail start-logging --name trilha-auditoria"],
      solucao: ["aws cloudtrail start-logging --name trilha-auditoria"],
      validar: (c) => { const t = c.cloudtrail && c.cloudtrail.trilhas["trilha-auditoria"]; return !!t && t.gravando; } },
    { id: "ct-4", servico: "cloudtrail", nivel: 2, xp: 60, titulo: "Está mesmo gravando?",
      descricao: "Confirme o <b>status</b> da trilha (<code>IsLogging</code> tem que estar <b>true</b>).",
      dicas: ["aws cloudtrail get-trail-status --name trilha-auditoria"],
      solucao: ["aws cloudtrail get-trail-status --name trilha-auditoria"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cloudtrail", "get-trail-status") },
    { id: "ct-5", servico: "cloudtrail", nivel: 3, xp: 100, titulo: "Veja o seu próprio rastro",
      descricao: "Consulte os <b>eventos</b> registrados. Surpresa: o CLImb guardou <b>tudo o que você já rodou neste terminal</b> — é assim que a auditoria funciona de verdade.",
      dicas: ["aws cloudtrail lookup-events"], solucao: ["aws cloudtrail lookup-events"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cloudtrail", "lookup-events") },
    { id: "ct-6", servico: "cloudtrail", nivel: 3, xp: 100, titulo: "Investigue um evento específico",
      descricao: "Numa investigação você filtra. Procure só os eventos <b>CreateBucket</b> usando <b>--lookup-attributes</b>. <small>(repare: o CloudTrail grava o nome da <b>API</b>, não o comando digitado — por isso o <code>aws s3 mb</code> aparece como <b>CreateBucket</b>)</small>",
      dicas: ["aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=CreateBucket"],
      solucao: ["aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=CreateBucket"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cloudtrail", "lookup-events") && /EventName/.test(String(cmd.flags["lookup-attributes"] || "")) },

    // ===================== Systems Manager =====================
    { id: "ssm-1", servico: "ssm", nivel: 1, xp: 50, titulo: "A gaveta de configurações",
      descricao: "O <b>Parameter Store</b> (do Systems Manager) guarda configuração fora do código: URLs, nomes de bucket, chaves. Liste os <b>parâmetros</b> da conta.",
      dicas: ["aws ssm describe-parameters"], solucao: ["aws ssm describe-parameters"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ssm", "describe-parameters") },
    { id: "ssm-2", servico: "ssm", nivel: 1, xp: 70, titulo: "Guarde a URL da API",
      descricao: "Crie o parâmetro <b>/loja/url-api</b> com o valor <b>https://api.loja.com</b> e tipo <b>String</b>. <small>(o nome com barras cria uma hierarquia — vai fazer sentido já já)</small>",
      dicas: ["aws ssm put-parameter --name /loja/url-api --value https://api.loja.com --type String"],
      solucao: ["aws ssm put-parameter --name /loja/url-api --value https://api.loja.com --type String"],
      validar: (c) => !!(c.ssm && c.ssm.parametros["/loja/url-api"]) },
    { id: "ssm-3", servico: "ssm", nivel: 2, xp: 70, titulo: "Leia a configuração",
      descricao: "É assim que a aplicação busca a config ao subir: <b>recupere</b> o parâmetro <b>/loja/url-api</b>.",
      dicas: ["aws ssm get-parameter --name /loja/url-api"],
      solucao: ["aws ssm get-parameter --name /loja/url-api"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ssm", "get-parameter") },
    { id: "ssm-4", servico: "ssm", nivel: 2, xp: 90, titulo: "Agora um valor secreto",
      descricao: "Guarde <b>/loja/senha-db</b> com o valor <b>s3nh4-forte</b> do tipo <b>SecureString</b> (cifrado com KMS).",
      dicas: ["aws ssm put-parameter --name /loja/senha-db --value s3nh4-forte --type SecureString"],
      solucao: ["aws ssm put-parameter --name /loja/senha-db --value s3nh4-forte --type SecureString"],
      validar: (c) => { const p = c.ssm && c.ssm.parametros["/loja/senha-db"]; return !!p && p.tipo === "SecureString"; } },
    { id: "ssm-5", servico: "ssm", nivel: 3, xp: 90, titulo: "Peça pra decifrar",
      descricao: "Leia o <b>/loja/senha-db</b> com <b>--with-decryption</b>. Sem essa flag, o valor volta cifrado.",
      dicas: ["aws ssm get-parameter --name /loja/senha-db --with-decryption"],
      solucao: ["aws ssm get-parameter --name /loja/senha-db --with-decryption"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ssm", "get-parameter") && cmd.flags["with-decryption"] !== undefined },
    { id: "ssm-6", servico: "ssm", nivel: 3, xp: 100, titulo: "Toda a config de uma vez",
      descricao: "A hierarquia brilha aqui: puxe <b>todos</b> os parâmetros que começam com <b>/loja/</b> numa chamada só.",
      dicas: ["aws ssm get-parameters-by-path --path /loja/"],
      solucao: ["aws ssm get-parameters-by-path --path /loja/"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ssm", "get-parameters-by-path") },

    // ===================== Cognito =====================
    { id: "cog-1", servico: "cognito-idp", nivel: 1, xp: 60, titulo: "Login pronto, sem código",
      descricao: "O <b>Cognito</b> te dá cadastro, login, confirmação por e-mail e MFA sem você escrever autenticação. Liste os <b>user pools</b> <small>(a AWS exige o <code>--max-results</code> aqui)</small>.",
      dicas: ["aws cognito-idp list-user-pools --max-results 10"],
      solucao: ["aws cognito-idp list-user-pools --max-results 10"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cognito-idp", "list-user-pools") },
    { id: "cog-2", servico: "cognito-idp", nivel: 2, xp: 80, titulo: "Crie o banco de usuários",
      descricao: "Crie o user pool <b>usuarios-loja</b>. Anote o <b>Id</b> que volta (formato <code>us-east-1_ABC123</code>).",
      dicas: ["aws cognito-idp create-user-pool --pool-name usuarios-loja"],
      solucao: ["aws cognito-idp create-user-pool --pool-name usuarios-loja"],
      validar: (c) => !!(c.cognito && Object.values(c.cognito.pools).some((p) => p.nome === "usuarios-loja")) },
    { id: "cog-3", servico: "cognito-idp", nivel: 2, xp: 70, titulo: "Detalhes do pool",
      descricao: "Veja os detalhes do pool (incluindo a política de senha que ele já traz pronta).",
      dicas: ["aws cognito-idp describe-user-pool --user-pool-id <pool-id>"],
      solucao: ["aws cognito-idp describe-user-pool --user-pool-id <pool-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cognito-idp", "describe-user-pool") },
    { id: "cog-4", servico: "cognito-idp", nivel: 2, xp: 90, titulo: "Registre o seu app",
      descricao: "O <b>client</b> representa o app que vai usar o pool. Crie o client <b>app-web</b> — o ClientId dele é o que entra no código do front-end.",
      dicas: ["aws cognito-idp create-user-pool-client --user-pool-id <pool-id> --client-name app-web"],
      solucao: ["aws cognito-idp create-user-pool-client --user-pool-id <pool-id> --client-name app-web"],
      validar: (c) => !!(c.cognito && Object.values(c.cognito.pools).some((p) => Object.values(p.clientes || {}).some((cl) => cl.nome === "app-web"))) },
    { id: "cog-5", servico: "cognito-idp", nivel: 3, xp: 90, titulo: "Cadastre a primeira pessoa",
      descricao: "Crie o usuário <b>maria</b> no pool (como admin). Ela nasce com senha temporária e é obrigada a trocar no primeiro login.",
      dicas: ["aws cognito-idp admin-create-user --user-pool-id <pool-id> --username maria"],
      solucao: ["aws cognito-idp admin-create-user --user-pool-id <pool-id> --username maria"],
      validar: (c) => !!(c.cognito && Object.values(c.cognito.pools).some((p) => p.usuarios["maria"])) },
    { id: "cog-6", servico: "cognito-idp", nivel: 3, xp: 70, titulo: "Quem já se cadastrou?",
      descricao: "Liste os <b>usuários</b> do pool e repare no <code>UserStatus</code>.",
      dicas: ["aws cognito-idp list-users --user-pool-id <pool-id>"],
      solucao: ["aws cognito-idp list-users --user-pool-id <pool-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cognito-idp", "list-users") },
    { id: "cog-7", servico: "cognito-idp", nivel: 3, xp: 80, titulo: "Encerre o pool",
      descricao: "<b>Apague</b> o user pool. <small>(cuidado: na AWS real isso apaga TODOS os usuários junto — não tem volta)</small>",
      dicas: ["aws cognito-idp delete-user-pool --user-pool-id <pool-id>"],
      solucao: ["aws cognito-idp delete-user-pool --user-pool-id <pool-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cognito-idp", "delete-user-pool") && !Object.values((c.cognito || {}).pools || {}).some((p) => p.nome === "usuarios-loja") },

    // ===================== Auto Scaling =====================
    { id: "asg-1", servico: "autoscaling", nivel: 1, xp: 60, titulo: "A receita da máquina",
      descricao: "Pro grupo subir cópias iguais, ele precisa de uma receita. Crie o <b>launch template</b> <b>modelo-web</b> (t2.micro).",
      dicas: [`aws ec2 create-launch-template --launch-template-name modelo-web --launch-template-data '{"ImageId":"ami-0abcd1234ef567890","InstanceType":"t2.micro"}'`],
      solucao: [`aws ec2 create-launch-template --launch-template-name modelo-web --launch-template-data '{"ImageId":"ami-0abcd1234ef567890","InstanceType":"t2.micro"}'`],
      validar: (c) => !!(c.autoscaling && c.autoscaling.modelos["modelo-web"]) },
    { id: "asg-2", servico: "autoscaling", nivel: 2, xp: 100, titulo: "Crie o grupo elástico",
      descricao: "Crie o <b>grupo-web</b> usando o modelo, com <b>min 1</b>, <b>max 4</b> e <b>desejado 2</b>. Ele vai subir as máquinas sozinho.",
      dicas: ["aws autoscaling create-auto-scaling-group --auto-scaling-group-name grupo-web --launch-template LaunchTemplateName=modelo-web,Version=1 --min-size 1 --max-size 4 --desired-capacity 2 --availability-zones us-east-1a"],
      solucao: ["aws autoscaling create-auto-scaling-group --auto-scaling-group-name grupo-web --launch-template LaunchTemplateName=modelo-web,Version=1 --min-size 1 --max-size 4 --desired-capacity 2 --availability-zones us-east-1a"],
      validar: (c) => { const g = c.autoscaling && c.autoscaling.grupos["grupo-web"]; return !!g && Object.values(c.ec2.instancias).filter((i) => i.asg === "grupo-web" && i.estado === "running").length === 2; } },
    { id: "asg-3", servico: "autoscaling", nivel: 2, xp: 70, titulo: "As máquinas apareceram mesmo?",
      descricao: "Confirme no <b>EC2</b>: liste as instâncias e veja as duas que o grupo criou sozinho.",
      dicas: ["aws ec2 describe-instances"], solucao: ["aws ec2 describe-instances"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-instances") },
    { id: "asg-4", servico: "autoscaling", nivel: 2, xp: 90, titulo: "Chegou a Black Friday",
      descricao: "O tráfego dobrou. Suba a capacidade desejada pra <b>4</b>.",
      dicas: ["aws autoscaling set-desired-capacity --auto-scaling-group-name grupo-web --desired-capacity 4"],
      solucao: ["aws autoscaling set-desired-capacity --auto-scaling-group-name grupo-web --desired-capacity 4"],
      validar: (c) => Object.values(c.ec2.instancias).filter((i) => i.asg === "grupo-web" && i.estado === "running").length === 4 },
    { id: "asg-5", servico: "autoscaling", nivel: 3, xp: 90, titulo: "Passou a onda, economize",
      descricao: "Baixe a capacidade pra <b>1</b>. As máquinas sobrando são <b>encerradas</b> — e param de custar.",
      dicas: ["aws autoscaling set-desired-capacity --auto-scaling-group-name grupo-web --desired-capacity 1"],
      solucao: ["aws autoscaling set-desired-capacity --auto-scaling-group-name grupo-web --desired-capacity 1"],
      validar: (c) => Object.values(c.ec2.instancias).filter((i) => i.asg === "grupo-web" && i.estado === "running").length === 1 },
    { id: "asg-6", servico: "autoscaling", nivel: 3, xp: 100, titulo: "Deixe ele se virar sozinho",
      descricao: "Crie a política <b>cpu-alvo</b> do tipo <b>TargetTrackingScaling</b>: aí o grupo sobe e desce sozinho conforme a CPU, sem você olhar gráfico.",
      dicas: ["aws autoscaling put-scaling-policy --auto-scaling-group-name grupo-web --policy-name cpu-alvo --policy-type TargetTrackingScaling"],
      solucao: ["aws autoscaling put-scaling-policy --auto-scaling-group-name grupo-web --policy-name cpu-alvo --policy-type TargetTrackingScaling"],
      validar: (c) => { const g = c.autoscaling && c.autoscaling.grupos["grupo-web"]; return !!g && !!g.politicas["cpu-alvo"]; } },
    { id: "asg-7", servico: "autoscaling", nivel: 3, xp: 90, titulo: "Desmonte o grupo",
      descricao: "<b>Apague</b> o grupo-web. <small>(com máquina no ar a AWS recusa — zere antes com <code>--min-size 0 --desired-capacity 0</code>)</small>",
      dicas: ["Zere: aws autoscaling update-auto-scaling-group --auto-scaling-group-name grupo-web --min-size 0 --desired-capacity 0",
        "Depois: aws autoscaling delete-auto-scaling-group --auto-scaling-group-name grupo-web"],
      solucao: ["aws autoscaling update-auto-scaling-group --auto-scaling-group-name grupo-web --min-size 0 --desired-capacity 0",
        "aws autoscaling delete-auto-scaling-group --auto-scaling-group-name grupo-web"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "autoscaling", "delete-auto-scaling-group") && !(c.autoscaling && c.autoscaling.grupos["grupo-web"]) },
  ];

  // ---------- Registro das trilhas ----------
  if (typeof SERVICOS_META !== "undefined" && typeof DESAFIOS !== "undefined") {
    const metas = [
      { id: "cloudtrail", nome: "CloudTrail", subtitulo: "Auditoria da conta", icone: "🕵️" },
      { id: "ssm", nome: "Systems Manager", subtitulo: "Parameter Store", icone: "🎛️" },
      { id: "cognito-idp", nome: "Cognito", subtitulo: "Login de usuários", icone: "🎫" },
      { id: "autoscaling", nome: "Auto Scaling", subtitulo: "Elasticidade automática", icone: "📶" },
    ];
    if (!SERVICOS_META.some((s) => s.id === "cloudtrail")) {
      for (const m of metas) {
        const iProj = SERVICOS_META.findIndex((s) => s.id === "projetos");
        if (iProj >= 0) SERVICOS_META.splice(iProj, 0, m); else SERVICOS_META.push(m);
      }
      for (const d of DESAFIOS_FASE5) DESAFIOS.push(d);
    }
  }
})();
