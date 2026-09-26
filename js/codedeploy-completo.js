"use strict";
// ============================================================
// CLImb — codedeploy-completo.js
// AWS CodeDeploy (`aws deploy`): leva o pacote da aplicação pros servidores.
// Terceiro serviço da família Code — é o "CD" do CI/CD.
//
// Fontes (25/09/2026): exemplos do `aws deploy <cmd> help` (AWS CLI 2.35.8),
// API Reference (CreateDeployment, DeploymentInfo, ErrorInformation) e o guia
// (deployment-configurations, error-codes). Mensagens de erro de API: o texto
// da seção Errors da API Reference; onde a mensagem real traz o nome do
// recurso ("No application found for name: X"), seguimos o formato que o
// serviço devolve.
//
// O deploy CONVERSA com o resto do simulador, como na AWS:
//   - a frota são as instâncias EC2 running cujas tags batem com o
//     --ec2-tag-filters do deployment group (sem nenhuma: NO_INSTANCES);
//   - o pacote é um objeto do S3 (bucket ou chave que não existe: o
//     DownloadBundle falha em cada máquina);
//   - pacote com "quebrado" na chave: o script do ValidateService falha
//     (é o simulado de incidente da trilha, pra ensinar diagnóstico e rollback).
// O deploy não roda de verdade: ele avança quando alguém consulta
// (get-deployment), igual ao build do CodeBuild.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined") return;

  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";
  const agora = () => Math.round(Date.now()) / 1000;
  const uuid = () => `${hexAleatorio(8)}-${hexAleatorio(4)}-${hexAleatorio(4)}-${hexAleatorio(4)}-${hexAleatorio(12)}`;
  const idDeploy = () => "d-" + Array.from({ length: 9 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]).join("");
  const erro = (op, tipo, msg) => new ErroCli(`An error occurred (${tipo}) when calling the ${op} operation: ${msg}`);
  const lista = (v, pos) => [].concat(v === undefined ? [] : v).concat(pos || []).map(String).filter(Boolean);

  const CONFIGS = [
    "CodeDeployDefault.AllAtOnce", "CodeDeployDefault.HalfAtATime", "CodeDeployDefault.OneAtATime",
    "CodeDeployDefault.ECSAllAtOnce", "CodeDeployDefault.ECSCanary10Percent15Minutes", "CodeDeployDefault.ECSCanary10Percent5Minutes",
    "CodeDeployDefault.ECSLinear10PercentEvery1Minutes", "CodeDeployDefault.ECSLinear10PercentEvery3Minutes",
    "CodeDeployDefault.LambdaAllAtOnce", "CodeDeployDefault.LambdaCanary10Percent10Minutes", "CodeDeployDefault.LambdaCanary10Percent15Minutes",
    "CodeDeployDefault.LambdaCanary10Percent30Minutes", "CodeDeployDefault.LambdaCanary10Percent5Minutes",
    "CodeDeployDefault.LambdaLinear10PercentEvery10Minutes", "CodeDeployDefault.LambdaLinear10PercentEvery1Minute",
    "CodeDeployDefault.LambdaLinear10PercentEvery2Minutes", "CodeDeployDefault.LambdaLinear10PercentEvery3Minutes",
  ];
  const CONFIGS_SERVER = CONFIGS.slice(0, 3);
  const STATUS = ["Created", "Queued", "InProgress", "Baking", "Succeeded", "Failed", "Stopped", "Ready"];
  const EVENTOS = ["ApplicationStop", "DownloadBundle", "BeforeInstall", "Install", "AfterInstall", "ApplicationStart", "ValidateService"];

  function st(conta) {
    conta.codedeploy = conta.codedeploy || { apps: {}, deploys: {} };
    return conta.codedeploy;
  }
  function appDe(conta, nome, op) {
    const a = st(conta).apps[String(nome)];
    if (!a) throw erro(op, "ApplicationDoesNotExistException", `No application found for name: ${nome}`);
    return a;
  }
  function grupoDe(conta, app, nome, op) {
    const g = app.grupos[String(nome)];
    if (!g) throw erro(op, "DeploymentGroupDoesNotExistException", `No Deployment Group found for name: ${nome}\nVeja os grupos da aplicação com: aws deploy list-deployment-groups --application-name ${app.nome}`);
    return g;
  }
  function deployDe(conta, id, op) {
    const d = st(conta).deploys[String(id)];
    if (!d) throw erro(op, "DeploymentDoesNotExistException", `The deployment ${id} does not exist with the user or AWS account.\nO id tem a forma d-XXXXXXXXX e volta no create-deployment (ou no list-deployments).`);
    return d;
  }
  // --ec2-tag-filters Key=App,Value=portal-rh,Type=KEY_AND_VALUE (um ou vários)
  function filtrosTag(v, pos) {
    return lista(v, pos).filter((x) => /=/.test(x)).map((x) => {
      const o = parsearShorthand(x);
      const tipo = o.Type || (o.Key && o.Value ? "KEY_AND_VALUE" : o.Key ? "KEY_ONLY" : "VALUE_ONLY");
      if (["KEY_ONLY", "VALUE_ONLY", "KEY_AND_VALUE"].indexOf(tipo) < 0) throw new ErroCli(`\nInvalid choice: '${tipo}', valid choices are: 'KEY_ONLY', 'VALUE_ONLY', 'KEY_AND_VALUE'`);
      const f = { Key: o.Key, Value: o.Value, Type: tipo };
      if (f.Key === undefined) delete f.Key;
      if (f.Value === undefined) delete f.Value;
      return f;
    });
  }
  function rollbackCfg(v, op) {
    const o = parsearShorthand(String(v));
    const ativo = String(o.enabled) === "true";
    const eventos = o.events ? String(o.events).split(/[;|]/).filter(Boolean) : [];
    for (const e of eventos) if (["DEPLOYMENT_FAILURE", "DEPLOYMENT_STOP_ON_ALARM", "DEPLOYMENT_STOP_ON_REQUEST"].indexOf(e) < 0) throw erro(op, "InvalidAutoRollbackConfigException", "The automatic rollback configuration was specified in an invalid format. For example, automatic rollback is enabled, but an invalid triggering event type or no event types were listed.\nEventos: DEPLOYMENT_FAILURE, DEPLOYMENT_STOP_ON_ALARM, DEPLOYMENT_STOP_ON_REQUEST");
    if (ativo && !eventos.length) throw erro(op, "InvalidAutoRollbackConfigException", "The automatic rollback configuration was specified in an invalid format. For example, automatic rollback is enabled, but an invalid triggering event type or no event types were listed.\nForma: --auto-rollback-configuration enabled=true,events=DEPLOYMENT_FAILURE");
    return { enabled: ativo, events: eventos };
  }
  function validarRole(role, op) {
    if (!/^arn:aws:iam::\d{12}:role\/.+/.test(role)) throw erro(op, "InvalidRoleException", `The service role ARN was specified in an invalid format.\nÉ o ARN de uma role do IAM, ex.: arn:aws:iam::123456789012:role/codedeploy-servico`);
    return role;
  }
  // a frota: instâncias running cujas tags batem com QUALQUER filtro do grupo
  function frota(conta, g) {
    const ec2 = conta.ec2 || {};
    const tags = ec2.tags || {};
    return Object.values(ec2.instancias || {}).filter((i) => i.estado === "running").filter((i) => {
      const t = tags[i.id] || {};
      return (g.filtros || []).some((f) => f.Type === "KEY_ONLY" ? t[f.Key] !== undefined
        : f.Type === "VALUE_ONLY" ? Object.values(t).indexOf(f.Value) >= 0
          : t[f.Key] !== undefined && t[f.Key] === f.Value);
    }).map((i) => i.id);
  }
  function grupoJson(conta, app, g) {
    const ult = (id) => { const d = st(conta).deploys[id]; return d ? { deploymentId: d.id, status: d.status, endTime: d.fim, createTime: d.criado } : undefined; };
    return {
      applicationName: app.nome, deploymentGroupId: g.id, deploymentGroupName: g.nome, deploymentConfigName: g.config,
      ec2TagFilters: g.filtros, onPremisesInstanceTagFilters: [], autoScalingGroups: [], serviceRoleArn: g.role,
      triggerConfigurations: [], alarmConfiguration: { enabled: false, ignorePollAlarmFailure: false, alarms: [] },
      autoRollbackConfiguration: g.rollback, deploymentStyle: { deploymentType: "IN_PLACE", deploymentOption: "WITHOUT_TRAFFIC_CONTROL" },
      outdatedInstancesStrategy: "UPDATE", lastSuccessfulDeployment: g.ultimoOk ? ult(g.ultimoOk) : undefined,
      lastAttemptedDeployment: g.ultimo ? ult(g.ultimo) : undefined, computePlatform: "Server", terminationHookEnabled: false,
    };
  }

  // ---------- o deploy avança quando alguém olha ----------
  function eventos(d, alvo, falhaEm, diag) {
    let t = d.inicio;
    let caiu = false;
    return EVENTOS.map((nome) => {
      const e = { lifecycleEventName: nome, startTime: t, endTime: t + (nome === "Install" ? 4 : 1) };
      t = e.endTime;
      if (caiu) { e.status = "Skipped"; delete e.startTime; delete e.endTime; e.diagnostics = undefined; return e; }
      if (nome === falhaEm) { caiu = true; e.status = "Failed"; e.diagnostics = diag; return e; }
      e.status = "Succeeded";
      e.diagnostics = { errorCode: "Success", message: "Succeeded", logTail: "", scriptName: "" };
      return e;
    });
  }
  function concluir(conta, d) {
    const s3 = conta.s3 || { buckets: {} };
    const loc = d.revisao.s3Location;
    const bucket = s3.buckets && s3.buckets[loc.bucket];
    let falhaEm = null, diag = null;
    if (!bucket || !bucket.objetos || !bucket.objetos[loc.key]) {
      falhaEm = "DownloadBundle";
      diag = { errorCode: "UnknownError", message: bucket ? "The specified key does not exist." : "The specified bucket does not exist", logTail: "", scriptName: "" };
    } else if (/quebrad/.test(loc.key)) {
      falhaEm = "ValidateService";
      diag = { errorCode: "ScriptFailed", message: "Script at specified location: scripts/validar.sh run as user root failed with exit code 1",
        logTail: "[stdout]Conferindo http://localhost:8080/saude ...\n[stderr]curl: (7) Failed to connect to localhost port 8080: Connection refused", scriptName: "scripts/validar.sh" };
    }
    d.alvos = {};
    for (const id of d.frota) d.alvos[id] = { status: falhaEm ? "Failed" : "Succeeded", eventos: eventos(d, id, falhaEm, diag), atualizado: d.inicio + 12 };
    d.fim = d.inicio + 14;
    const app = st(conta).apps[d.app];
    const g = app && app.grupos[d.grupo];
    if (falhaEm) {
      d.status = "Failed";
      d.erro = { code: "HEALTH_CONSTRAINTS", message: "The overall deployment failed because too many individual instances failed deployment, too few healthy instances are available for deployment, or some instances in your deployment group are experiencing problems." };
      // rollback automático: reimplanta a última revisão que deu certo
      if (g && g.rollback.enabled && g.rollback.events.indexOf("DEPLOYMENT_FAILURE") >= 0 && g.ultimoOk) {
        const bom = st(conta).deploys[g.ultimoOk];
        const r = novoDeploy(conta, app, g, { revisao: bom.revisao, config: d.config, criador: "codeDeployRollback", descricao: "" });
        r.rollback = { rollbackTriggeringDeploymentId: d.id };
        d.rollback = { rollbackDeploymentId: r.id, rollbackMessage: `Automatic rollback triggered: deployment ${d.id} failed. The last successful revision is being redeployed in ${r.id}.` };
      }
    } else {
      d.status = "Succeeded";
      if (g) g.ultimoOk = d.id;
    }
  }
  function novoDeploy(conta, app, g, o) {
    const s = st(conta);
    const d = {
      id: idDeploy(), app: app.nome, grupo: g.nome, config: o.config || g.config, revisao: o.revisao, descricao: o.descricao,
      criador: o.criador || "user", criado: agora(), inicio: agora(), fim: undefined, status: "Created", consultas: 0,
      frota: frota(conta, g), alvos: {}, rollbackCfg: JSON.parse(JSON.stringify(g.rollback)),
    };
    s.deploys[d.id] = d;
    g.ultimo = d.id;
    if (!d.frota.length) {
      d.status = "Failed"; d.fim = d.criado;
      d.erro = { code: "NO_INSTANCES", message: "The deployment failed because no instances were found for your deployment group. Check your deployment group settings to make sure the tags for your Amazon EC2 instances or Auto Scaling groups correctly identify the instances you want to deploy to, and then try again." };
    }
    return d;
  }
  function avancar(conta, d) {
    if (["Created", "InProgress"].indexOf(d.status) < 0) return;
    d.consultas += 1;
    if (d.consultas >= 2) concluir(conta, d);
    else d.status = "InProgress";
  }
  function visao(d) {
    const v = { Pending: 0, InProgress: 0, Succeeded: 0, Failed: 0, Skipped: 0, Ready: 0 };
    if (d.status === "Created") v.Pending = d.frota.length;
    else if (d.status === "InProgress") v.InProgress = d.frota.length;
    else if (d.status === "Stopped") v.Skipped = d.frota.length;
    else for (const id of d.frota) v[(d.alvos[id] || {}).status || "Skipped"] += 1;
    return v;
  }
  function deployJson(conta, d) {
    return {
      applicationName: d.app, deploymentGroupName: d.grupo, deploymentConfigName: d.config, deploymentId: d.id,
      revision: d.revisao, status: d.status, errorInformation: d.erro, createTime: d.criado,
      startTime: d.status === "Created" ? undefined : d.inicio, completeTime: d.fim,
      deploymentOverview: visao(d), description: d.descricao || undefined, creator: d.criador,
      ignoreApplicationStopFailures: false, autoRollbackConfiguration: d.rollbackCfg, updateOutdatedInstancesOnly: false,
      rollbackInfo: d.rollback, deploymentStyle: { deploymentType: "IN_PLACE", deploymentOption: "WITHOUT_TRAFFIC_CONTROL" },
      instanceTerminationWaitTimeStarted: false, computePlatform: "Server", fileExistsBehavior: "DISALLOW",
    };
  }

  SERVICOS.deploy = {
    "list-applications": (conta) => {
      const l = Object.keys(st(conta).apps);
      if (!l.length) avisarClimb("Nenhuma aplicação ainda. No CodeDeploy, a aplicação é só o nome que junta os ambientes (deployment groups) e o histórico de deploys. Crie com: aws deploy create-application --application-name <nome>");
      return js({ applications: l });
    },
    "create-application": (conta, pos, flags) => {
      const s = st(conta);
      const nome = String(exigirFlag(flags, "application-name"));
      if (!/^[A-Za-z0-9+=,.@_-]{1,100}$/.test(nome)) throw erro("CreateApplication", "InvalidApplicationNameException", "The application name was specified in an invalid format.");
      if (s.apps[nome]) throw erro("CreateApplication", "ApplicationAlreadyExistsException", `An application with the specified name with the IAM user or AWS account already exists: ${nome}`);
      const plat = flags["compute-platform"] !== undefined ? String(flags["compute-platform"]) : "Server";
      if (["Server", "Lambda", "ECS"].indexOf(plat) < 0) throw erro("CreateApplication", "InvalidComputePlatformException", "The computePlatform is invalid. The computePlatform should be Lambda, Server, or ECS.");
      s.apps[nome] = { nome, id: uuid(), criado: agora(), plataforma: plat, grupos: {} };
      avisarClimb("Aplicação criada. Ela ainda não sabe PRA ONDE mandar o código — isso é o deployment group (quais máquinas, com qual role). Plataforma padrão: Server (EC2 ou servidor próprio).");
      return js({ applicationId: s.apps[nome].id });
    },
    "get-application": (conta, pos, flags) => {
      const a = appDe(conta, exigirFlag(flags, "application-name"), "GetApplication");
      return js({ application: { applicationId: a.id, applicationName: a.nome, createTime: a.criado, linkedToGitHub: false, computePlatform: a.plataforma } });
    },
    "delete-application": (conta, pos, flags) => {
      const s = st(conta);
      const nome = String(exigirFlag(flags, "application-name"));
      if (!s.apps[nome]) { avisarClimb("Essa aplicação não existia — e a AWS responde sucesso mesmo assim, sem saída."); return ""; }
      const n = Object.keys(s.apps[nome].grupos).length;
      delete s.apps[nome];
      s.apagadas = (s.apagadas || []).concat(nome);
      avisarClimb("Aplicação apagada" + (n ? ` — e os ${n} deployment group(s) dela foram junto.` : ".") + " O que já está instalado nas máquinas continua lá: apagar a aplicação não desinstala nada.");
      return "";
    },
    "list-deployment-configs": () => {
      avisarClimb("As três CodeDeployDefault.* sem ECS/Lambda no nome são as de servidor: OneAtATime (uma máquina por vez, o padrão), HalfAtATime (metade) e AllAtOnce (todas juntas — rápido, mas se quebrar, quebra tudo).");
      return js({ deploymentConfigsList: CONFIGS.slice() });
    },
    "create-deployment-group": (conta, pos, flags) => {
      const op = "CreateDeploymentGroup";
      const app = appDe(conta, exigirFlag(flags, "application-name"), op);
      const nome = String(exigirFlag(flags, "deployment-group-name"));
      if (!/^[A-Za-z0-9+=,.@_-]{1,100}$/.test(nome)) throw erro(op, "InvalidDeploymentGroupNameException", "The deployment group name was specified in an invalid format.");
      if (app.grupos[nome]) throw erro(op, "DeploymentGroupAlreadyExistsException", `A deployment group with the specified name with the IAM user or AWS account already exists: ${nome}`);
      const role = validarRole(String(exigirFlag(flags, "service-role-arn")), op);
      const config = flags["deployment-config-name"] !== undefined ? String(flags["deployment-config-name"]) : "CodeDeployDefault.OneAtATime";
      if (CONFIGS.indexOf(config) < 0) throw erro(op, "DeploymentConfigDoesNotExistException", `The deployment configuration does not exist with the user or AWS account: ${config}\nVeja as que existem com: aws deploy list-deployment-configs`);
      const filtros = flags["ec2-tag-filters"] !== undefined ? filtrosTag(flags["ec2-tag-filters"]) : [];
      const rollback = flags["auto-rollback-configuration"] !== undefined ? rollbackCfg(flags["auto-rollback-configuration"], op) : { enabled: false, events: [] };
      app.grupos[nome] = { nome, id: uuid(), role, config, filtros, rollback, ultimo: null, ultimoOk: null };
      const n = frota(conta, app.grupos[nome]).length;
      avisarClimb(filtros.length
        ? `Grupo criado. Hoje ${n} instância(s) running batem com essas tags — é a lista que recebe o próximo deploy. Máquina nova com a mesma tag entra sozinha.`
        : "Grupo criado SEM filtro de tag: nenhum deploy vai achar máquina (NO_INSTANCES). Diga quais máquinas com --ec2-tag-filters Key=App,Value=<valor>,Type=KEY_AND_VALUE.");
      return js({ deploymentGroupId: app.grupos[nome].id });
    },
    "list-deployment-groups": (conta, pos, flags) => {
      const app = appDe(conta, exigirFlag(flags, "application-name"), "ListDeploymentGroups");
      return js({ applicationName: app.nome, deploymentGroups: Object.keys(app.grupos) });
    },
    "get-deployment-group": (conta, pos, flags) => {
      const op = "GetDeploymentGroup";
      const app = appDe(conta, exigirFlag(flags, "application-name"), op);
      const g = grupoDe(conta, app, exigirFlag(flags, "deployment-group-name"), op);
      return js({ deploymentGroupInfo: grupoJson(conta, app, g) });
    },
    "update-deployment-group": (conta, pos, flags) => {
      const op = "UpdateDeploymentGroup";
      const app = appDe(conta, exigirFlag(flags, "application-name"), op);
      const g = grupoDe(conta, app, exigirFlag(flags, "current-deployment-group-name"), op);
      if (flags["deployment-config-name"] !== undefined) {
        const c = String(flags["deployment-config-name"]);
        if (CONFIGS.indexOf(c) < 0) throw erro(op, "DeploymentConfigDoesNotExistException", `The deployment configuration does not exist with the user or AWS account: ${c}\nVeja as que existem com: aws deploy list-deployment-configs`);
        if (CONFIGS_SERVER.indexOf(c) < 0) throw erro(op, "InvalidDeploymentConfigNameException", `The deployment configuration name was specified in an invalid format.\n${c} é de ECS/Lambda; este grupo é de servidor (use AllAtOnce, HalfAtATime ou OneAtATime).`);
        g.config = c;
      }
      if (flags["service-role-arn"] !== undefined) g.role = validarRole(String(flags["service-role-arn"]), op);
      if (flags["ec2-tag-filters"] !== undefined) g.filtros = filtrosTag(flags["ec2-tag-filters"]);
      if (flags["auto-rollback-configuration"] !== undefined) g.rollback = rollbackCfg(flags["auto-rollback-configuration"], op);
      if (flags["new-deployment-group-name"] !== undefined) {
        const novo = String(flags["new-deployment-group-name"]);
        if (app.grupos[novo] && novo !== g.nome) throw erro(op, "DeploymentGroupAlreadyExistsException", `A deployment group with the specified name with the IAM user or AWS account already exists: ${novo}`);
        delete app.grupos[g.nome]; g.nome = novo; app.grupos[novo] = g;
      }
      avisarClimb("Grupo atualizado. Vale pros PRÓXIMOS deploys — o que já rodou guarda a configuração da época.");
      return js({ hooksNotCleanedUp: [] });
    },
    "delete-deployment-group": (conta, pos, flags) => {
      const app = appDe(conta, exigirFlag(flags, "application-name"), "DeleteDeploymentGroup");
      const nome = String(exigirFlag(flags, "deployment-group-name"));
      if (app.grupos[nome]) {
        delete app.grupos[nome];
        app.removidos = (app.removidos || []).concat(nome);
        avisarClimb("Grupo apagado. As máquinas continuam ligadas e com a versão que já tinham — só deixam de receber deploy por este grupo.");
      } else avisarClimb("Esse grupo não existia — a AWS responde sucesso mesmo assim.");
      return js({ hooksNotCleanedUp: [] });
    },
    "create-deployment": (conta, pos, flags) => {
      const op = "CreateDeployment";
      const app = appDe(conta, exigirFlag(flags, "application-name"), op);
      if (flags["deployment-group-name"] === undefined) throw erro(op, "DeploymentGroupNameRequiredException", "The deployment group name was not specified.");
      const g = grupoDe(conta, app, flags["deployment-group-name"], op);
      if (flags["s3-location"] === undefined) throw erro(op, "RevisionRequiredException", "The revision ID was not specified.\nO pacote vai em --s3-location bucket=<bucket>,key=<arquivo.zip>,bundleType=zip");
      const loc = parsearShorthand(String(flags["s3-location"]));
      if (!loc.bucket || !loc.key) throw erro(op, "InvalidRevisionException", "The revision was specified in an invalid format.\nForma: --s3-location bucket=<bucket>,key=<arquivo.zip>,bundleType=zip");
      if (loc.bundleType !== undefined && ["tar", "tgz", "zip", "YAML", "JSON"].indexOf(loc.bundleType) < 0) throw new ErroCli(`\nInvalid choice: '${loc.bundleType}', valid choices are: 'tar', 'tgz', 'zip', 'YAML', 'JSON'`);
      let config;
      if (flags["deployment-config-name"] !== undefined) {
        config = String(flags["deployment-config-name"]);
        if (CONFIGS.indexOf(config) < 0) throw erro(op, "DeploymentConfigDoesNotExistException", `The deployment configuration does not exist with the user or AWS account: ${config}`);
      }
      const s3Location = { bucket: loc.bucket, key: loc.key, bundleType: loc.bundleType };
      const d = novoDeploy(conta, app, g, { revisao: { revisionType: "S3", s3Location }, config, descricao: flags.description !== undefined ? String(flags.description) : "" });
      avisarClimb(d.status === "Failed"
        ? "Deploy criado — e já falhou: nenhuma instância running bate com as tags do grupo. Confira com get-deployment (errorInformation)."
        : `Deploy na fila pra ${d.frota.length} instância(s). Cada máquina baixa o pacote do S3 e roda as etapas do appspec.yml. Acompanhe com: aws deploy get-deployment --deployment-id ${d.id}`);
      return js({ deploymentId: d.id });
    },
    "get-deployment": (conta, pos, flags) => {
      const d = deployDe(conta, exigirFlag(flags, "deployment-id"), "GetDeployment");
      avancar(conta, d);
      if (d.status === "InProgress" || d.status === "Created") avisarClimb("Ainda rodando (status InProgress). Consulte de novo em instantes.");
      else if (d.status === "Failed" && d.rollback) avisarClimb(`Falhou — e o rollback automático já disparou o deploy ${d.rollback.rollbackDeploymentId} com a última versão boa. Pra saber POR QUE falhou, olhe as etapas de uma máquina: list-deployment-targets e get-deployment-target.`);
      else if (d.status === "Failed") avisarClimb("Falhou. O errorInformation diz o motivo geral; o motivo de cada máquina está nas etapas dela (list-deployment-targets e get-deployment-target).");
      return js({ deploymentInfo: deployJson(conta, d) });
    },
    "list-deployments": (conta, pos, flags) => {
      const op = "ListDeployments";
      const s = st(conta);
      let l = Object.values(s.deploys);
      if (flags["application-name"] !== undefined) {
        const app = appDe(conta, flags["application-name"], op);
        l = l.filter((d) => d.app === app.nome);
        if (flags["deployment-group-name"] !== undefined) {
          const g = grupoDe(conta, app, flags["deployment-group-name"], op);
          l = l.filter((d) => d.grupo === g.nome);
        }
      } else if (flags["deployment-group-name"] !== undefined) throw erro(op, "ApplicationNameRequiredException", "The minimum number of required application names was not specified.\nO --deployment-group-name só vale junto com --application-name.");
      if (flags["include-only-statuses"] !== undefined) {
        const quer = lista(flags["include-only-statuses"]);
        for (const q of quer) if (STATUS.indexOf(q) < 0) throw new ErroCli(`\nInvalid choice: '${q}', valid choices are: ${STATUS.map((x) => "'" + x + "'").join(", ")}`);
        l = l.filter((d) => quer.indexOf(d.status) >= 0);
      }
      l.sort((a, b) => b.criado - a.criado);
      return js({ deployments: l.map((d) => d.id) });
    },
    "list-deployment-targets": (conta, pos, flags) => {
      const d = deployDe(conta, exigirFlag(flags, "deployment-id"), "ListDeploymentTargets");
      let ids = d.frota.slice();
      if (flags["target-filters"] !== undefined) {
        let f;
        try { f = JSON.parse(String(flags["target-filters"])); } catch (e) { throw new ErroCli(`Error parsing parameter '--target-filters': Invalid JSON: ${flags["target-filters"]}\nForma: --target-filters '{"TargetStatus":["Failed"]}'`); }
        const quer = [].concat((f && f.TargetStatus) || []);
        const status = (id) => ["Created", "InProgress"].indexOf(d.status) >= 0 ? "InProgress" : d.status === "Stopped" ? "Skipped" : (d.alvos[id] || {}).status;
        if (quer.length) ids = ids.filter((id) => quer.indexOf(status(id)) >= 0);
      }
      if (!d.frota.length) avisarClimb("Nenhum alvo: esse deploy não achou máquina nenhuma (NO_INSTANCES).");
      return js({ targetIds: ids });
    },
    "get-deployment-target": (conta, pos, flags) => {
      const op = "GetDeploymentTarget";
      const d = deployDe(conta, exigirFlag(flags, "deployment-id"), op);
      const alvo = String(exigirFlag(flags, "target-id"));
      if (d.frota.indexOf(alvo) < 0) throw erro(op, "DeploymentTargetDoesNotExistException", `The provided target ID does not belong to the attempted deployment.\nOs alvos deste deploy saem de: aws deploy list-deployment-targets --deployment-id ${d.id}`);
      const a = d.alvos[alvo];
      let status, evs;
      if (a) { status = a.status; evs = a.eventos; }
      else if (d.status === "Stopped") { status = "Skipped"; evs = EVENTOS.map((n) => ({ lifecycleEventName: n, status: "Skipped" })); }
      else {
        status = "InProgress";
        evs = EVENTOS.map((n, i) => i < 2 ? { lifecycleEventName: n, status: "Succeeded", startTime: d.inicio + i, endTime: d.inicio + i + 1, diagnostics: { errorCode: "Success", message: "Succeeded", logTail: "", scriptName: "" } } : { lifecycleEventName: n, status: i === 2 ? "InProgress" : "Pending" });
      }
      const falha = evs.find((e) => e.status === "Failed");
      if (falha) avisarClimb(`A máquina caiu na etapa ${falha.lifecycleEventName}. Leia o diagnostics dela: o errorCode diz o tipo de erro, e o logTail traz o fim da saída do script — é ali que está o motivo de verdade.`);
      return js({ deploymentTarget: { deploymentTargetType: "InstanceTarget", instanceTarget: {
        deploymentId: d.id, targetId: alvo, targetArn: `arn:aws:ec2:${REGIAO(conta)}:${CONTA_ID(conta)}:instance/${alvo}`,
        status, lastUpdatedAt: a ? a.atualizado : d.inicio, lifecycleEvents: evs } } });
    },
    "stop-deployment": (conta, pos, flags) => {
      const d = deployDe(conta, exigirFlag(flags, "deployment-id"), "StopDeployment");
      if (["Created", "Queued", "InProgress"].indexOf(d.status) < 0) throw erro("StopDeployment", "DeploymentAlreadyCompletedException", `The deployment is already complete: ${d.id} (status ${d.status}).`);
      d.status = "Stopped"; d.fim = agora();
      avisarClimb("Deploy parado: nenhuma máquina nova começa. Atenção — a máquina que estava no meio pode ter ficado com metade da versão nova. Por isso quem para um deploy normalmente dispara outro com a versão boa logo em seguida.");
      return js({ status: "Succeeded", statusMessage: "No more commands will be scheduled for execution in the deployment instances" });
    },
  };

  // ============================================================
  // MANUAIS
  // ============================================================
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => "USO\n    " + uso + "\n\n" + txt;
    Object.assign(MANUAIS, {
      deploy: "aws deploy — AWS CodeDeploy\n\nLeva o pacote da aplicação (um .zip no S3) pras máquinas e roda as\netapas do appspec.yml em cada uma: parar, baixar, instalar, iniciar,\nvalidar.\n\nAS PEÇAS\n    APLICAÇÃO         o nome que junta tudo\n    DEPLOYMENT GROUP  PRA ONDE vai: quais máquinas (por tag), qual role,\n                      quantas por vez, se volta sozinho quando falha\n    DEPLOYMENT        cada entrega de uma versão (id d-XXXXXXXXX)\n\nCOMANDOS\n    list-applications / create-application / get-application / delete-application\n    list-deployment-configs\n    create-deployment-group / list-deployment-groups / get-deployment-group\n    update-deployment-group / delete-deployment-group\n    create-deployment / get-deployment / list-deployments / stop-deployment\n    list-deployment-targets / get-deployment-target",
      "deploy.list-applications": M("aws deploy list-applications",
        "Os nomes das aplicações do CodeDeploy na conta."),
      "deploy.create-application": M("aws deploy create-application --application-name <nome> [--compute-platform Server|Lambda|ECS]",
        "Cria a aplicação — só o nome que agrupa os ambientes e o histórico.\nPlataforma padrão: Server (EC2 ou servidor próprio). Devolve o applicationId."),
      "deploy.get-application": M("aws deploy get-application --application-name <nome>",
        "Detalhe da aplicação: id, data de criação e plataforma (computePlatform)."),
      "deploy.delete-application": M("aws deploy delete-application --application-name <nome>",
        "Apaga a aplicação e TODOS os deployment groups dela. Não produz saída.\nNão desinstala nada das máquinas."),
      "deploy.list-deployment-configs": M("aws deploy list-deployment-configs",
        "As configurações de deploy: quantas máquinas recebem a versão de uma vez.\n\nSERVIDOR\n    CodeDeployDefault.OneAtATime    uma por vez (padrão)\n    CodeDeployDefault.HalfAtATime   metade por vez\n    CodeDeployDefault.AllAtOnce     todas juntas\n\nAs ECS* e Lambda* são pra contêiner e função (troca gradual de tráfego)."),
      "deploy.create-deployment-group": M("aws deploy create-deployment-group --application-name <app> --deployment-group-name <grupo> \\\n        --service-role-arn arn:aws:iam::<conta>:role/<role> \\\n        --ec2-tag-filters Key=<tag>,Value=<valor>,Type=KEY_AND_VALUE \\\n        [--deployment-config-name CodeDeployDefault.OneAtATime] \\\n        [--auto-rollback-configuration enabled=true,events=DEPLOYMENT_FAILURE]",
        "Diz PRA ONDE o deploy vai: as instâncias EC2 cujas tags batem com o\nfiltro (máquina nova com a tag entra sozinha), a role que o CodeDeploy\nassume e quantas máquinas por vez.\n\nTIPOS DE FILTRO\n    KEY_AND_VALUE   a tag com esse valor\n    KEY_ONLY        qualquer valor dessa tag\n    VALUE_ONLY      qualquer tag com esse valor"),
      "deploy.list-deployment-groups": M("aws deploy list-deployment-groups --application-name <app>",
        "Os nomes dos deployment groups (ambientes) de uma aplicação."),
      "deploy.get-deployment-group": M("aws deploy get-deployment-group --application-name <app> --deployment-group-name <grupo>",
        "Detalhe do grupo: filtros de tag, role, configuração de deploy, rollback\nautomático e o último deploy que deu certo (lastSuccessfulDeployment)."),
      "deploy.update-deployment-group": M("aws deploy update-deployment-group --application-name <app> --current-deployment-group-name <grupo> \\\n        [--deployment-config-name ...] [--auto-rollback-configuration enabled=true,events=DEPLOYMENT_FAILURE] \\\n        [--ec2-tag-filters ...] [--service-role-arn ...] [--new-deployment-group-name ...]",
        "Muda o grupo. Repare: aqui o nome vai em --current-deployment-group-name\n(não em --deployment-group-name). Vale pros próximos deploys.\n\nROLLBACK AUTOMÁTICO\n    enabled=true,events=DEPLOYMENT_FAILURE — deploy que falha dispara\n    sozinho outro deploy com a última versão que deu certo."),
      "deploy.delete-deployment-group": M("aws deploy delete-deployment-group --application-name <app> --deployment-group-name <grupo>",
        "Apaga o grupo. As máquinas continuam ligadas, com a versão que tinham."),
      "deploy.create-deployment": M("aws deploy create-deployment --application-name <app> --deployment-group-name <grupo> \\\n        --s3-location bucket=<bucket>,key=<pacote.zip>,bundleType=zip \\\n        [--deployment-config-name ...] [--description <texto>]",
        "Entrega uma versão: cada máquina do grupo baixa o pacote do S3 e roda as\netapas do appspec.yml (ApplicationStop, DownloadBundle, BeforeInstall,\nInstall, AfterInstall, ApplicationStart, ValidateService).\n\nDevolve só o deploymentId — o andamento é no get-deployment."),
      "deploy.get-deployment": M("aws deploy get-deployment --deployment-id <d-XXXXXXXXX>",
        "O estado do deploy: status (Created, InProgress, Succeeded, Failed,\nStopped), quantas máquinas em cada situação (deploymentOverview), o\nmotivo geral da falha (errorInformation) e o rollback (rollbackInfo).\n\nSó o status, pra script:\n    ... --query deploymentInfo.status --output text"),
      "deploy.list-deployments": M("aws deploy list-deployments [--application-name <app> [--deployment-group-name <grupo>]] [--include-only-statuses Failed ...]",
        "Os ids dos deploys, do mais novo pro mais velho. O grupo só vale junto\ncom a aplicação."),
      "deploy.list-deployment-targets": M("aws deploy list-deployment-targets --deployment-id <id> [--target-filters '{\"TargetStatus\":[\"Failed\"]}']",
        "As máquinas (alvos) de um deploy. Com --target-filters, só as que\nfalharam, por exemplo."),
      "deploy.get-deployment-target": M("aws deploy get-deployment-target --deployment-id <id> --target-id <i-...>",
        "O deploy numa máquina, etapa por etapa (lifecycleEvents). Na etapa que\nfalhou, o diagnostics traz o errorCode (ScriptFailed, UnknownError...),\na mensagem e o logTail — o fim da saída do script."),
      "deploy.stop-deployment": M("aws deploy stop-deployment --deployment-id <id>",
        "Para um deploy em andamento: nenhuma máquina nova começa. Deploy que já\nterminou não pode ser parado."),
    });
  }

  // ============================================================
  // LIÇÃO + PORQUE
  // ============================================================
  if (typeof LICOES !== "undefined" && !LICOES.codedeploy) {
    LICOES.codedeploy = {
      emoji: "🚀", titulo: "AWS CodeDeploy",
      oque: "O CodeDeploy é o <b>entregador de versão</b>: você diz qual pacote (um .zip no S3) e pra quais máquinas (as que têm uma tag), e ele passa em cada uma parando a aplicação, instalando a versão nova, subindo de novo e <b>conferindo se ficou de pé</b> — uma, metade ou todas de uma vez.",
      serve: "É o \"CD\" do CI/CD: o CodeBuild monta e testa, o CodeDeploy põe no ar. Ele substitui o \"entrar por SSH em cada servidor e copiar arquivo\", que não escala e não tem volta. E tem volta: se a versão nova falhar na validação, ele reinstala sozinho a última que funcionava (rollback automático).",
      casos: [
        "Um e-commerce com 12 servidores atualiza metade de cada vez (HalfAtATime): a loja nunca sai do ar durante o deploy.",
        "A versão nova quebra o health check às 22h; o rollback automático reinstala a anterior antes de alguém do plantão abrir o notebook.",
        "O CodePipeline chama o CodeDeploy no fim da esteira: commit → build → deploy, sem ninguém copiar arquivo à mão.",
      ],
      vocab: [
        ["Aplicação", "o nome que agrupa os ambientes e o histórico de deploys."],
        ["Deployment group", "pra onde vai: as máquinas (por tag), a role e quantas por vez. Normalmente um por ambiente (homolog, produção)."],
        ["Revisão", "o pacote da versão: um .zip no S3 com o código e o appspec.yml."],
        ["appspec.yml", "o roteiro dentro do pacote: que script roda em cada etapa (instalar, iniciar, validar)."],
        ["Etapas (lifecycle events)", "ApplicationStop, DownloadBundle, BeforeInstall, Install, AfterInstall, ApplicationStart, ValidateService."],
        ["Rollback", "reinstalar a última versão boa quando a nova falha — o CodeDeploy faz sozinho se você ligar."],
      ],
      cobra: "Pra EC2 e Lambda, o CodeDeploy não cobra nada — você paga as máquinas e o S3, que já pagaria. Pra servidor fora da AWS (on-premises), cobra por atualização de máquina. Comparando: <b>CodeDeploy x copiar por SSH</b> — os dois colocam o arquivo lá; só o CodeDeploy faz em lotes, confere se ficou de pé e volta atrás sozinho.",
    };
  }
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "deploy.list-applications": "mostra quais aplicações o CodeDeploy entrega nesta conta.",
      "deploy.create-application": "cria o nome que vai juntar os ambientes e o histórico de deploys.",
      "deploy.get-application": "confirma a aplicação e a plataforma dela (servidor, Lambda ou ECS).",
      "deploy.delete-application": "remove a aplicação que não é mais entregue — com os grupos dela.",
      "deploy.list-deployment-configs": "mostra as estratégias de entrega: uma máquina, metade ou todas por vez.",
      "deploy.create-deployment-group": "diz pra quais máquinas o deploy vai, com qual role e em que ritmo.",
      "deploy.list-deployment-groups": "mostra os ambientes (homolog, produção) de uma aplicação.",
      "deploy.get-deployment-group": "mostra pra onde o grupo entrega e qual foi o último deploy bom.",
      "deploy.update-deployment-group": "muda o ritmo, as máquinas ou liga o rollback automático do ambiente.",
      "deploy.delete-deployment-group": "remove um ambiente que não recebe mais deploy.",
      "deploy.create-deployment": "entrega uma versão nova nas máquinas do grupo — é o que o pipeline chama no fim.",
      "deploy.get-deployment": "diz se a entrega terminou, falhou ou ainda roda — e se houve rollback.",
      "deploy.list-deployments": "o histórico de entregas, com filtro por situação (só as que falharam, por exemplo).",
      "deploy.list-deployment-targets": "lista as máquinas que um deploy tocou — o ponto de partida do diagnóstico.",
      "deploy.get-deployment-target": "mostra, etapa por etapa, onde o deploy quebrou numa máquina e o log do script.",
      "deploy.stop-deployment": "interrompe uma entrega disparada por engano antes de ela chegar em todas as máquinas.",
    });
  }

  // ============================================================
  // ATIVIDADES
  // ============================================================
  if (typeof DESAFIOS === "undefined" || typeof SERVICOS_META === "undefined") return;
  function d(id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar) {
    return { id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar };
  }
  // helpers fora do d(...): acesso por índice dentro dele vira null no corte do gabarito
  const app = (c, n) => (((c.codedeploy || {}).apps) || {})[n];
  const grupo = (c, a, g) => ((app(c, a) || {}).grupos || {})[g];
  const deploys = (c, a, g) => Object.values(((c.codedeploy || {}).deploys) || {}).filter((x) => x.app === a && (!g || x.grupo === g));
  const chave = (x) => ((x.revisao || {}).s3Location || {}).key;
  const temObjeto = (c, b, k) => !!(c.s3 && c.s3.buckets && c.s3.buckets[b] && c.s3.buckets[b].objetos && c.s3.buckets[b].objetos[k]);
  const tagDe = (c, id) => ((((c.ec2 || {}).tags) || {})[id] || {});
  const instComTag = (c, v) => Object.values(((c.ec2 || {}).instancias) || {}).filter((i) => i.estado === "running" && tagDe(c, i.id).App === v);
  const removeu = (c, a, g) => ((app(c, a) || {}).removidos || []).indexOf(g) >= 0;
  const apagouApp = (c, a) => (((c.codedeploy || {}).apagadas) || []).indexOf(a) >= 0;
  const flag = (cmd, nome) => String((cmd && cmd.flags && cmd.flags[nome]) || "");
  const ROLE = "arn:aws:iam::123456789012:role/codedeploy-servico";
  const APP = "portal-rh", GRUPO = "portal-rh-producao", BUCKET = "portal-rh-pacotes";
  const deployar = (versao, extra) => `aws deploy create-deployment --application-name ${APP} --deployment-group-name ${GRUPO} --s3-location bucket=${BUCKET},key=${versao},bundleType=zip` + (extra || "");
  // montado aqui (e não uma string pronta): a linha inteira da solução não pode
  // aparecer fora do solucao, senão desce no arquivo público (teste/gabarito.js)
  const consultar = (id, extra) => `aws deploy get-deployment --deployment-id ${id}` + (extra || "");
  const GET = consultar("<deploy-id>");

  const TRILHA = [
    d("cdp-1", "codedeploy", 1, 50, "Quem entrega o código nos servidores?",
      "Hoje o portal do RH vai pro ar com alguém entrando por SSH e copiando arquivo — e ninguém sabe voltar atrás quando dá errado. O time vai usar o CodeDeploy. Comece vendo quais <b>aplicações</b> ele já entrega nesta conta.",
      ["Pra ver o que existe, o verbo é `list-` e o recurso vai no plural.", "No CLI, o CodeDeploy é o serviço `deploy` (não `codedeploy`)."],
      ["aws deploy list-applications"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "list-applications")),
    d("cdp-2", "codedeploy", 1, 80, "A aplicação do portal",
      "Crie a aplicação <b>portal-rh</b> no CodeDeploy. É o marco da trilha: o fim do deploy por SSH começa aqui.",
      ["Criar é `create-application`.", "O nome vai em `--application-name`."],
      ["aws deploy create-application --application-name portal-rh"],
      (c) => !!app(c, APP)),
    d("cdp-3", "codedeploy", 1, 50, "Pra que plataforma ela entrega?",
      "Confira a aplicação <b>portal-rh</b> que você criou: o id e a plataforma (<code>computePlatform</code>).",
      ["O detalhe de UMA aplicação é o `get-application`.", "Ele pede o `--application-name`."],
      ["aws deploy get-application --application-name portal-rh"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "get-application") && flag(cmd, "application-name") === APP),
    d("cdp-f1", "codedeploy", 2, 60, "Só a plataforma, pro inventário",
      "A planilha de inventário tem uma coluna \"plataforma\". Traga só o <b>computePlatform</b> da <b>portal-rh</b>, em texto puro.",
      ["Mesmo `get-application`, com `--query` e `--output text`.", "O caminho é `application.computePlatform`."],
      ["aws deploy get-application --application-name portal-rh --query application.computePlatform --output text"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "get-application") && /computePlatform/.test(flag(cmd, "query"))),
    d("cdp-4", "codedeploy", 2, 50, "Uma, metade ou todas?",
      "Antes de configurar, o time quer entender as opções de ritmo: atualizar uma máquina por vez, metade ou todas juntas. Liste as <b>configurações de deploy</b> que existem.",
      ["O nome do recurso é deployment config — no plural, pra listar.", "O comando é `list-deployment-configs`. Repare nas três de servidor: OneAtATime, HalfAtATime e AllAtOnce."],
      ["aws deploy list-deployment-configs"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "list-deployment-configs")),
    d("cdp-5", "codedeploy", 2, 60, "O balde dos pacotes",
      "O CodeDeploy busca cada versão num bucket do S3. Crie o bucket <b>portal-rh-pacotes</b> — é lá que as versões do portal vão morar.",
      ["Criar bucket é o `aws s3 mb` (make bucket), que você viu na trilha de S3.", "A forma é `aws s3 mb s3://<nome>`."],
      ["aws s3 mb s3://portal-rh-pacotes"],
      (c) => !!(c.s3 && c.s3.buckets && c.s3.buckets[BUCKET])),
    d("cdp-6", "codedeploy", 2, 60, "A versão 1 vai pro balde",
      "O build gerou o pacote <b>app.zip</b> (ele está na sua pasta — confira com <code>ls</code>). Envie pro bucket com o nome <b>portal-rh-v1.zip</b>.",
      ["Copiar arquivo pro S3 é o `aws s3 cp`.", "A forma é `aws s3 cp <arquivo-local> s3://<bucket>/<nome-no-bucket>`."],
      ["aws s3 cp app.zip s3://portal-rh-pacotes/portal-rh-v1.zip"],
      (c) => temObjeto(c, BUCKET, "portal-rh-v1.zip")),
    d("cdp-7", "codedeploy", 2, 60, "O servidor do portal",
      "O portal precisa de um servidor. Suba uma instância com a AMI <b>ami-0abcd1234ef567890</b> no tipo <b>t3.micro</b> e anote o <code>InstanceId</code>.",
      ["Subir instância é o `aws ec2 run-instances`, que você viu na trilha de EC2.", "Ele pede `--image-id` e `--instance-type`."],
      ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.micro"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "run-instances")),
    d("cdp-8", "codedeploy", 2, 70, "A etiqueta que o CodeDeploy procura",
      "O CodeDeploy não recebe lista de IPs: ele acha as máquinas pela <b>tag</b>. Marque a instância que você acabou de subir com <b>App=portal-rh</b>.",
      ["Etiquetar é o `aws ec2 create-tags`.", "A forma é `--resources <id-da-instância> --tags Key=App,Value=portal-rh`."],
      ["aws ec2 create-tags --resources <id-da-instância> --tags Key=App,Value=portal-rh"],
      (c) => instComTag(c, APP).length > 0),
    d("cdp-9", "codedeploy", 2, 90, "O ambiente de produção",
      "Crie o deployment group <b>portal-rh-producao</b> na aplicação <b>portal-rh</b>: as máquinas são as com a tag <b>App=portal-rh</b> (tipo KEY_AND_VALUE) e a role é <b>" + ROLE + "</b>.",
      ["Criar o ambiente é o `create-deployment-group`.", "Ele pede `--application-name`, `--deployment-group-name` e `--service-role-arn`.", "As máquinas vão em `--ec2-tag-filters Key=App,Value=portal-rh,Type=KEY_AND_VALUE`."],
      ["aws deploy create-deployment-group --application-name portal-rh --deployment-group-name portal-rh-producao --service-role-arn " + ROLE + " --ec2-tag-filters Key=App,Value=portal-rh,Type=KEY_AND_VALUE"],
      (c) => !!grupo(c, APP, GRUPO)),
    d("cdp-10", "codedeploy", 2, 60, "Quais ambientes o portal tem?",
      "Liste os deployment groups da aplicação <b>portal-rh</b>.",
      ["O recurso é deployment group, no plural.", "O comando é `list-deployment-groups`, com `--application-name`."],
      ["aws deploy list-deployment-groups --application-name portal-rh"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "list-deployment-groups") && flag(cmd, "application-name") === APP),
    d("cdp-11", "codedeploy", 2, 60, "O que o ambiente de produção faz?",
      "Confira o <b>portal-rh-producao</b>: filtro de tag, role e configuração de deploy (qual é o padrão?).",
      ["O detalhe de UM grupo é o `get-deployment-group`.", "Ele pede `--application-name` e `--deployment-group-name`."],
      ["aws deploy get-deployment-group --application-name portal-rh --deployment-group-name portal-rh-producao"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "get-deployment-group") && flag(cmd, "deployment-group-name") === GRUPO),
    d("cdp-f2", "codedeploy", 3, 70, "Que tag ele procura mesmo?",
      "Alguém subiu uma máquina e ela não recebeu deploy. Antes de culpar o CodeDeploy, traga só o <b>filtro de tag</b> do <b>portal-rh-producao</b>.",
      ["Mesmo `get-deployment-group`, com `--query`.", "O caminho é `deploymentGroupInfo.ec2TagFilters`."],
      ["aws deploy get-deployment-group --application-name portal-rh --deployment-group-name portal-rh-producao --query deploymentGroupInfo.ec2TagFilters"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "get-deployment-group") && /ec2TagFilters/.test(flag(cmd, "query"))),
    d("cdp-12", "codedeploy", 3, 100, "O primeiro deploy",
      "Tudo pronto. Entregue a versão <b>portal-rh-v1.zip</b> (bucket <b>portal-rh-pacotes</b>, tipo <b>zip</b>) no <b>portal-rh-producao</b>. Anote o <code>deploymentId</code>.",
      ["Entregar é o `create-deployment`, com a aplicação e o grupo.", "O pacote vai em `--s3-location bucket=portal-rh-pacotes,key=portal-rh-v1.zip,bundleType=zip`."],
      [deployar("portal-rh-v1.zip")],
      (c) => deploys(c, APP, GRUPO).some((x) => chave(x) === "portal-rh-v1.zip")),
    d("cdp-13", "codedeploy", 3, 90, "Subiu?",
      "O deploy está rodando. Consulte pelo id — e consulte de novo até o <code>status</code> sair de InProgress.",
      ["O estado de um deploy é o `get-deployment`, com `--deployment-id`.", "O id tem a forma `d-XXXXXXXXX` e voltou no create-deployment."],
      [GET, GET],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "get-deployment") && deploys(c, APP, GRUPO).some((x) => chave(x) === "portal-rh-v1.zip" && x.status === "Succeeded")),
    d("cdp-f3", "codedeploy", 3, 70, "Só o veredito, pro chat",
      "O bot do chat do time avisa quando o deploy termina. Traga só o <b>status</b> do último deploy, em texto puro.",
      ["Mesmo `get-deployment`, com `--query` e `--output text`.", "O caminho é `deploymentInfo.status`."],
      [GET + " --query deploymentInfo.status --output text"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "get-deployment") && /status/.test(flag(cmd, "query"))),
    d("cdp-14", "codedeploy", 3, 70, "Em quais máquinas ele passou?",
      "Liste as máquinas (alvos) que o último deploy atualizou.",
      ["Os alvos de um deploy vêm do `list-deployment-targets`.", "Ele pede o `--deployment-id`."],
      ["aws deploy list-deployment-targets --deployment-id <deploy-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "list-deployment-targets")),
    d("cdp-15", "codedeploy", 3, 80, "Etapa por etapa",
      "Veja o que o deploy fez na sua instância, etapa por etapa: parar, baixar, instalar, iniciar, validar.",
      ["O detalhe de UM alvo é o `get-deployment-target`.", "Ele pede `--deployment-id` e `--target-id` (o id da instância, i-...).", "As etapas estão em `lifecycleEvents`."],
      ["aws deploy get-deployment-target --deployment-id <deploy-id> --target-id <id-da-instância>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "get-deployment-target")),
    d("cdp-16", "codedeploy", 3, 70, "O histórico de entregas",
      "O gestor quer ver todas as entregas do <b>portal-rh-producao</b>. Liste os deploys desse grupo.",
      ["O histórico é o `list-deployments`.", "Filtre com `--application-name` e `--deployment-group-name` (o grupo só vale junto com a aplicação)."],
      ["aws deploy list-deployments --application-name portal-rh --deployment-group-name portal-rh-producao"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "list-deployments") && flag(cmd, "deployment-group-name") === GRUPO),
    d("cdp-f4", "codedeploy", 3, 120, "A frota cresceu",
      "O portal ganhou um segundo servidor. Suba outra instância (mesma AMI e tipo), marque com <b>App=portal-rh</b> e entregue de novo a <b>portal-rh-v1.zip</b> — repare que agora o deploy passa em <b>duas</b> máquinas sem você mudar nada no grupo.",
      ["São comandos que você já usou: run-instances → create-tags → create-deployment.", "Quem decide a frota é a tag: máquina nova com a tag entra sozinha."],
      ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.micro",
        "aws ec2 create-tags --resources <id-da-instância> --tags Key=App,Value=portal-rh",
        deployar("portal-rh-v1.zip")],
      (c) => deploys(c, APP, GRUPO).some((x) => chave(x) === "portal-rh-v1.zip" && x.frota.length >= 2)),
    d("cdp-f5", "codedeploy", 3, 110, "A versão 2",
      "A versão 2 do portal saiu do build como <b>app.zip</b>. Envie pro bucket como <b>portal-rh-v2.zip</b>, entregue no <b>portal-rh-producao</b> e acompanhe até terminar.",
      ["O mesmo caminho da v1: s3 cp → create-deployment → get-deployment até o fim.", "O que muda é só a chave do pacote."],
      ["aws s3 cp app.zip s3://portal-rh-pacotes/portal-rh-v2.zip", deployar("portal-rh-v2.zip"), GET, GET],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "get-deployment") && deploys(c, APP, GRUPO).some((x) => chave(x) === "portal-rh-v2.zip" && x.status === "Succeeded")),
    d("cdp-17", "codedeploy", 3, 90, "Se quebrar, volta sozinho",
      "Nenhum plantonista quer ser acordado às 3h pra reinstalar a versão anterior. Ligue o <b>rollback automático</b> no <b>portal-rh-producao</b>: deploy que falhar volta pra última versão boa.",
      ["Mudar o grupo é o `update-deployment-group` — e aqui o nome vai em `--current-deployment-group-name`.", "O rollback é `--auto-rollback-configuration enabled=true,events=DEPLOYMENT_FAILURE`."],
      ["aws deploy update-deployment-group --application-name portal-rh --current-deployment-group-name portal-rh-producao --auto-rollback-configuration enabled=true,events=DEPLOYMENT_FAILURE"],
      (c) => !!((grupo(c, APP, GRUPO) || {}).rollback || {}).enabled),
    d("cdp-f6", "codedeploy", 3, 80, "Metade de cada vez",
      "Com duas máquinas, dá pra atualizar uma enquanto a outra atende. Confira o nome exato da configuração de <b>metade por vez</b> e troque o ritmo do <b>portal-rh-producao</b> pra ela.",
      ["O nome sai do `list-deployment-configs`.", "Trocar é o `update-deployment-group` com `--deployment-config-name`."],
      ["aws deploy list-deployment-configs",
        "aws deploy update-deployment-group --application-name portal-rh --current-deployment-group-name portal-rh-producao --deployment-config-name CodeDeployDefault.HalfAtATime"],
      (c) => (grupo(c, APP, GRUPO) || {}).config === "CodeDeployDefault.HalfAtATime"),
    d("cdp-f7", "codedeploy", 3, 150, "Simulado de incidente",
      "Hoje é dia de simulado: o QA preparou a versão <b>portal-rh-v3-quebrado.zip</b>, que quebra o health check de propósito. Envie o <b>app.zip</b> pro bucket com esse nome, entregue no <b>portal-rh-producao</b> e acompanhe até o fim. O deploy vai falhar — confira que o <b>rollback automático</b> disparou (<code>rollbackInfo</code>).",
      ["O mesmo caminho da v2, com a chave nova.", "No get-deployment do deploy que falhou, o campo `rollbackInfo` traz o id do deploy de volta."],
      ["aws s3 cp app.zip s3://portal-rh-pacotes/portal-rh-v3-quebrado.zip", deployar("portal-rh-v3-quebrado.zip"), GET, GET],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "get-deployment") && deploys(c, APP, GRUPO).some((x) => chave(x) === "portal-rh-v3-quebrado.zip" && x.status === "Failed" && !!x.rollback)),
    d("cdp-f8", "codedeploy", 3, 90, "Onde exatamente quebrou?",
      "O rollback salvou a noite, mas o relatório do incidente precisa da causa. Liste as máquinas do deploy que <b>falhou</b> e veja, numa delas, a etapa que quebrou e o <code>logTail</code> do script.",
      ["Os alvos vêm do `list-deployment-targets` do deploy que falhou.", "O detalhe da máquina é o `get-deployment-target` — procure a etapa com status Failed e leia o diagnostics."],
      ["aws deploy list-deployment-targets --deployment-id <deploy-falho>",
        "aws deploy get-deployment-target --deployment-id <deploy-falho> --target-id <id-da-instância>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "get-deployment-target") && deploys(c, APP).some((x) => x.id === flag(cmd, "deployment-id") && x.status === "Failed")),
    d("cdp-f9", "codedeploy", 3, 70, "Só os que falharam",
      "Pro relatório mensal de incidentes, liste só os deploys com status <b>Failed</b> do <b>portal-rh</b>.",
      ["Mesmo `list-deployments`, com filtro de situação.", "A flag é `--include-only-statuses Failed`."],
      ["aws deploy list-deployments --application-name portal-rh --include-only-statuses Failed"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "list-deployments") && /Failed/.test(JSON.stringify(cmd.flags["include-only-statuses"] || ""))),
    d("cdp-18", "codedeploy", 3, 90, "Deploy no grupo errado da hora errada",
      "Alguém disparou de novo a <b>portal-rh-v2.zip</b> no <b>portal-rh-producao</b> às 11h de segunda, pico de acesso. Dispare pra ver o cenário e <b>pare</b> o deploy antes de ele terminar.",
      ["Disparar você já sabe.", "Parar é o `stop-deployment`, com o `--deployment-id`."],
      [deployar("portal-rh-v2.zip"), "aws deploy stop-deployment --deployment-id <deploy-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "stop-deployment") && deploys(c, APP, GRUPO).some((x) => x.status === "Stopped")),
    d("cdp-f10", "codedeploy", 3, 80, "Descrição errada, versão certa",
      "Um deploy da <b>portal-rh-v1.zip</b> saiu com a descrição <b>hotfix folha</b> — mas a v1 é antiga e não tem o hotfix. Dispare pra ver o cenário (com <code>--description</code>) e pare antes de ele chegar nas máquinas.",
      ["O `create-deployment` aceita `--description`.", "Depois, o mesmo `stop-deployment` da atividade anterior."],
      [deployar("portal-rh-v1.zip", ' --description "hotfix folha"'), "aws deploy stop-deployment --deployment-id <deploy-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "stop-deployment") && deploys(c, APP, GRUPO).some((x) => x.status === "Stopped" && x.descricao === "hotfix folha")),
    d("cdp-19", "codedeploy", 3, 90, "O ambiente de homologação saiu",
      "O time vai testar em outra conta. Crie o grupo <b>portal-rh-homolog</b> na <b>portal-rh</b> (tag <b>App=portal-rh-homolog</b>, mesma role) pra ver o cenário, <b>apague</b> e confira os grupos que sobraram.",
      ["Criar o grupo você já sabe.", "Apagar é o `delete-deployment-group`, com `--application-name` e `--deployment-group-name`.", "Pra conferir, o `list-deployment-groups`."],
      ["aws deploy create-deployment-group --application-name portal-rh --deployment-group-name portal-rh-homolog --service-role-arn " + ROLE + " --ec2-tag-filters Key=App,Value=portal-rh-homolog,Type=KEY_AND_VALUE",
        "aws deploy delete-deployment-group --application-name portal-rh --deployment-group-name portal-rh-homolog",
        "aws deploy list-deployment-groups --application-name portal-rh"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "list-deployment-groups") && !!app(c, APP) && !grupo(c, APP, "portal-rh-homolog") && removeu(c, APP, "portal-rh-homolog")),
    d("cdp-20", "codedeploy", 3, 80, "O portal antigo",
      "O <b>portal-rh-legado</b> foi desligado ano passado e a aplicação dele ficou no CodeDeploy. Crie pra ver o cenário e <b>apague</b>.",
      ["Criar você já sabe.", "Apagar é o `delete-application`, com `--application-name`. Ele não devolve nada."],
      ["aws deploy create-application --application-name portal-rh-legado",
        "aws deploy delete-application --application-name portal-rh-legado"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "delete-application") && flag(cmd, "application-name") === "portal-rh-legado" && !app(c, "portal-rh-legado")),
    d("cdp-f11", "codedeploy", 3, 100, "A faxina da intranet",
      "A <b>intranet-antiga</b> sai de vez. Crie a aplicação e o grupo <b>intranet-antiga-prod</b> dela (tag <b>App=intranet-antiga</b>, mesma role) pra ver o cenário; depois apague o grupo, apague a aplicação e confira a lista de aplicações.",
      ["Criar os dois você já sabe.", "A ordem da faxina: delete-deployment-group → delete-application → list-applications."],
      ["aws deploy create-application --application-name intranet-antiga",
        "aws deploy create-deployment-group --application-name intranet-antiga --deployment-group-name intranet-antiga-prod --service-role-arn " + ROLE + " --ec2-tag-filters Key=App,Value=intranet-antiga,Type=KEY_AND_VALUE",
        "aws deploy delete-deployment-group --application-name intranet-antiga --deployment-group-name intranet-antiga-prod",
        "aws deploy delete-application --application-name intranet-antiga",
        "aws deploy list-applications"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "list-applications") && !app(c, "intranet-antiga") && apagouApp(c, "intranet-antiga")),
  ];

  const PROJETO = { id: "cdp-proj", servico: "codedeploy", tipo: "projeto", nivel: 3, xp: 380,
    titulo: "🚀 Projeto: o deploy do app de ponto",
    descricao: "O app de ponto eletrônico vai pro ar do jeito certo. Sem passo a passo: crie a aplicação <b>app-ponto</b> e o grupo <b>app-ponto-producao</b> (máquinas com a tag <b>App=app-ponto</b>, role <b>" + ROLE + "</b>, <b>rollback automático</b> ligado), coloque uma instância com essa tag no ar, envie o <b>app.zip</b> pro bucket <b>app-ponto-pacotes</b> como <b>app-ponto-v1.zip</b> e entregue — até o deploy dar <b>Succeeded</b>.",
    dicas: [
      "É o caminho da trilha: create-application → run-instances → create-tags → create-deployment-group → s3 mb → s3 cp → create-deployment → get-deployment até o fim.",
      "O rollback pode entrar já no create-deployment-group, com --auto-rollback-configuration.",
    ],
    solucao: [
      "aws deploy create-application --application-name app-ponto",
      "aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.micro",
      "aws ec2 create-tags --resources <id-da-instância> --tags Key=App,Value=app-ponto",
      "aws deploy create-deployment-group --application-name app-ponto --deployment-group-name app-ponto-producao --service-role-arn " + ROLE + " --ec2-tag-filters Key=App,Value=app-ponto,Type=KEY_AND_VALUE --auto-rollback-configuration enabled=true,events=DEPLOYMENT_FAILURE",
      "aws s3 mb s3://app-ponto-pacotes",
      "aws s3 cp app.zip s3://app-ponto-pacotes/app-ponto-v1.zip",
      "aws deploy create-deployment --application-name app-ponto --deployment-group-name app-ponto-producao --s3-location bucket=app-ponto-pacotes,key=app-ponto-v1.zip,bundleType=zip",
      GET, GET,
    ],
    etapas: [
      { texto: "Criar a aplicação app-ponto", validar: (c) => !!app(c, "app-ponto") },
      { texto: "Instância running com a tag App=app-ponto", validar: (c) => instComTag(c, "app-ponto").length > 0 },
      { texto: "Grupo app-ponto-producao com rollback automático", validar: (c) => !!((grupo(c, "app-ponto", "app-ponto-producao") || {}).rollback || {}).enabled },
      { texto: "Pacote app-ponto-v1.zip no bucket app-ponto-pacotes", validar: (c) => temObjeto(c, "app-ponto-pacotes", "app-ponto-v1.zip") },
      { texto: "Deploy com status Succeeded", validar: (c) => deploys(c, "app-ponto", "app-ponto-producao").some((x) => x.status === "Succeeded") },
    ] };

  if (!SERVICOS_META.some((s) => s.id === "codedeploy")) {
    const meta = { id: "codedeploy", nome: "CodeDeploy", subtitulo: "Entrega nos servidores", icone: "🚀" };
    // depois do CodeBuild: o código é montado lá antes de ser entregue aqui
    const iCb = SERVICOS_META.findIndex((s) => s.id === "codebuild");
    const iProj = SERVICOS_META.findIndex((s) => s.id === "projetos");
    if (iCb >= 0) SERVICOS_META.splice(iCb + 1, 0, meta);
    else if (iProj >= 0) SERVICOS_META.splice(iProj, 0, meta);
    else SERVICOS_META.push(meta);
    for (const x of TRILHA) DESAFIOS.push(x);
    DESAFIOS.push(PROJETO);
  }
})();
