"use strict";
// ============================================================
// CLImb — codedeploy-bluegreen.js
// CodeDeploy nas plataformas Lambda e ECS: aqui ele não copia pacote pra
// máquina — ele MUDA PRA ONDE VAI O TRÁFEGO.
//   - Lambda: o alias sai da versão atual pra nova, aos poucos (canary:
//     10% primeiro, o resto depois) ou de uma vez. Durante o canary o alias
//     mostra RoutingConfig.AdditionalVersionWeights.
//   - ECS (blue/green): sobe um conjunto de tarefas novo (verde) atrás do
//     segundo target group e troca o listener do load balancer do azul pro
//     verde. Com deploymentReadyOption, o deploy para em "Ready" esperando o
//     continue-deployment.
//
// Fontes (26/09/2026): `aws deploy create-deployment-group help` (opções
// deployment-style, blue-green-deployment-configuration, load-balancer-info
// com targetGroupPairInfoList/prodTrafficRoute, ecs-services),
// `get-deployment-target help` (lambdaTarget.lambdaFunctionInfo e
// ecsTarget.taskSetsInfo com trafficWeight/taskSetLabel), API DeploymentInfo
// (status Ready), `aws lambda get-alias help`. AWS CLI 2.35.8.
//
// Estende o que existe sem reescrever: embrulha SERVICOS.deploy (as apps
// Server continuam no codedeploy-completo.js), SERVICOS.ecs.create-service e
// describe-services, e acrescenta lambda get-alias e elbv2 describe-listeners.
// Avança quando alguém consulta (get-deployment), como o resto do CodeDeploy.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.deploy) return;
  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";
  const agora = () => Math.round(Date.now()) / 1000;
  const erro = (op, tipo, msg) => new ErroCli(`An error occurred (${tipo}) when calling the ${op} operation: ${msg}`);
  const idDeploy = () => "d-" + Array.from({ length: 9 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]).join("");
  const base = Object.assign({}, SERVICOS.deploy);
  const deployState = (c) => { c.codedeploy = c.codedeploy || { apps: {}, deploys: {} }; return c.codedeploy; };

  // JSON direto, file://arquivo ou (pra quem prefere) YAML do appspec
  function lerJsonFlag(conta, valor, nome) {
    let t = String(valor);
    if (/^file:\/\//.test(t)) {
      const a = arquivoLocal(t.slice(7), conta);
      if (!a) throw new ErroCli(`Error parsing parameter '--${nome}': Unable to load paramfile ${t}: [Errno 2] No such file or directory: '${t.slice(7)}'`);
      t = String(a.conteudo || "");
    }
    try { return JSON.parse(t); } catch (e) { throw new ErroCli(`Error parsing parameter '--${nome}': Invalid JSON: ${t.slice(0, 80)}`); }
  }
  function lerAppSpec(texto) {
    try { return JSON.parse(texto); } catch (e) { /* tenta YAML */ }
    if (typeof CFN_BASE !== "undefined") { try { return CFN_BASE.parseTemplate(texto); } catch (e) { /* cai no erro */ } }
    return null;
  }

  // ============================================================
  // LAMBDA: get-alias (com o RoutingConfig do canary)
  // ============================================================
  if (SERVICOS.lambda) {
    SERVICOS.lambda["get-alias"] = (conta, pos, flags) => {
      const nomeF = String(exigirFlag(flags, "function-name"));
      const f = ((conta.lambda || {}).funcoes || {})[nomeF];
      if (!f) throw erro("GetAlias", "ResourceNotFoundException", `Function not found: arn:aws:lambda:${REGIAO(conta)}:${CONTA_ID(conta)}:function:${nomeF}`);
      const nome = String(exigirFlag(flags, "name"));
      const a = (f.aliases || {})[nome];
      if (!a) throw erro("GetAlias", "ResourceNotFoundException", `Alias not found: arn:aws:lambda:${REGIAO(conta)}:${CONTA_ID(conta)}:function:${nomeF}:${nome}`);
      const o = { AliasArn: `arn:aws:lambda:${REGIAO(conta)}:${CONTA_ID(conta)}:function:${nomeF}:${nome}`, Name: nome, FunctionVersion: a.versao, Description: a.descricao || "" };
      if (a.pesos && Object.keys(a.pesos).length) {
        o.RoutingConfig = { AdditionalVersionWeights: a.pesos };
        const [v, w] = Object.entries(a.pesos)[0];
        avisarClimb(`Canary em andamento: ${Math.round(w * 100)}% das chamadas vão pra versão ${v}, o resto continua na ${a.versao}. Quem decide quando passar o resto é o CodeDeploy.`);
      }
      o.RevisionId = a.revisao || "8c1c6c2a-0000-4000-8000-000000000001";
      return js(o);
    };
  }

  // ============================================================
  // ELBV2: describe-listeners (pra ver pra qual target group o tráfego vai)
  // ============================================================
  if (SERVICOS.elbv2) {
    SERVICOS.elbv2["describe-listeners"] = (conta, pos, flags) => {
      const elb = conta.elb || { lbs: {}, listeners: {}, tgs: {} };
      let l = Object.values(elb.listeners || {});
      if (flags["load-balancer-arn"] !== undefined) {
        const arn = String(flags["load-balancer-arn"]);
        const lb = Object.values(elb.lbs || {}).find((x) => x.arn === arn);
        if (!lb) throw erro("DescribeListeners", "LoadBalancerNotFound", `One or more load balancers not found`);
        l = l.filter((x) => x.lb === lb.nome);
      } else if (flags["listener-arns"] !== undefined) {
        const quer = [].concat(flags["listener-arns"]).map(String);
        l = l.filter((x) => quer.indexOf(x.arn) >= 0);
      } else throw new ErroCli("An error occurred (ValidationError) when calling the DescribeListeners operation: You must specify either listener ARNs or a load balancer ARN");
      return js({ Listeners: l.map((x) => ({ ListenerArn: x.arn, LoadBalancerArn: ((elb.lbs || {})[x.lb] || {}).arn, Port: x.porta, Protocol: x.protocolo, DefaultActions: [{ Type: "forward", TargetGroupArn: x.tg }] })) });
    };
  }

  // ============================================================
  // ECS: serviço com controlador CODE_DEPLOY e target group
  // ============================================================
  if (SERVICOS.ecs) {
    const baseEcs = Object.assign({}, SERVICOS.ecs);
    SERVICOS.ecs["create-service"] = (conta, pos, flags) => {
      let ctrl = "ECS";
      if (flags["deployment-controller"] !== undefined) {
        ctrl = (parsearShorthand(String(flags["deployment-controller"])).type || "").toUpperCase();
        if (["ECS", "CODE_DEPLOY", "EXTERNAL"].indexOf(ctrl) < 0) throw new ErroCli(`\nInvalid choice: '${ctrl}', valid choices are: 'ECS', 'CODE_DEPLOY', 'EXTERNAL'`);
      }
      let lbs = [];
      if (flags["load-balancers"] !== undefined) {
        lbs = [].concat(flags["load-balancers"]).map((x) => parsearShorthand(String(x)));
        for (const x of lbs) {
          const tg = Object.values((conta.elb || {}).tgs || {}).find((t) => t.arn === x.targetGroupArn);
          if (!tg) throw erro("CreateService", "InvalidParameterException", `Unable to assume role and validate the specified targetGroupArn. Please verify that the ECS service role being passed has the proper permissions.\n(o target group ${x.targetGroupArn} não existe — confira com aws elbv2 describe-target-groups)`);
          if (!x.containerName || !x.containerPort) throw erro("CreateService", "InvalidParameterException", "containerName and containerPort must be specified for load balancer.\nForma: targetGroupArn=<arn>,containerName=web,containerPort=80");
        }
      }
      if (ctrl === "CODE_DEPLOY" && !lbs.length) throw erro("CreateService", "InvalidParameterException", "A load balancer is required for the CODE_DEPLOY deployment controller.\n(blue/green troca o tráfego entre target groups — o serviço precisa estar atrás de um)");
      const r = baseEcs["create-service"](conta, pos, flags);
      const s = conta.ecs.servicos[String(flags["service-name"])];
      s.controlador = ctrl;
      s.lbs = lbs.map((x) => ({ targetGroupArn: x.targetGroupArn, containerName: x.containerName, containerPort: parseInt(x.containerPort, 10) }));
      s.revisao = (conta.ecs.tarefas[s.tarefa] || {}).revisao || 1;
      if (ctrl === "CODE_DEPLOY") avisarClimb("Serviço criado com o controlador CODE_DEPLOY: daqui pra frente, trocar a versão NÃO é update-service — é um deploy do CodeDeploy, que sobe as tarefas novas no outro target group e troca o tráfego.");
      const o = JSON.parse(r);
      o.service.deploymentController = { type: ctrl };
      if (s.lbs.length) o.service.loadBalancers = s.lbs;
      return js(o);
    };
    SERVICOS.ecs["describe-services"] = (conta, pos, flags) => {
      const o = JSON.parse(baseEcs["describe-services"](conta, pos, flags));
      for (const x of o.services) {
        const s = conta.ecs.servicos[x.serviceName];
        if (!s) continue;
        x.deploymentController = { type: s.controlador || "ECS" };
        if (s.lbs && s.lbs.length) x.loadBalancers = s.lbs;
        if (s.revisao) x.taskDefinition = `arn:aws:ecs:${REGIAO(conta)}:${CONTA_ID(conta)}:task-definition/${s.tarefa}:${s.revisao}`;
        if (s.taskSets && s.taskSets.length) x.taskSets = s.taskSets;
      }
      return js(o);
    };
  }

  // ============================================================
  // CODEDEPLOY: Lambda e ECS
  // ============================================================
  const CANARIO = /Canary(\d+)Percent/;
  const LINEAR = /Linear(\d+)Percent/;
  const plataforma = (conta, app) => ((deployState(conta).apps[String(app)] || {}).plataforma || "Server");

  SERVICOS.deploy["create-deployment-group"] = (conta, pos, flags) => {
    const op = "CreateDeploymentGroup";
    const plat = flags["application-name"] !== undefined ? plataforma(conta, flags["application-name"]) : "Server";
    if (plat === "Server") return base["create-deployment-group"](conta, pos, flags);
    const f2 = Object.assign({}, flags);
    const cfg = flags["deployment-config-name"] !== undefined ? String(flags["deployment-config-name"]) : (plat === "Lambda" ? "CodeDeployDefault.LambdaAllAtOnce" : "CodeDeployDefault.ECSAllAtOnce");
    if (plat === "Lambda" && !/^CodeDeployDefault\.Lambda/.test(cfg)) throw erro(op, "InvalidDeploymentConfigNameException", `The deployment configuration name was specified in an invalid format.\n${cfg} não é de Lambda — use uma CodeDeployDefault.Lambda* (veja com list-deployment-configs).`);
    if (plat === "ECS" && !/^CodeDeployDefault\.ECS/.test(cfg)) throw erro(op, "InvalidDeploymentConfigNameException", `The deployment configuration name was specified in an invalid format.\n${cfg} não é de ECS — use uma CodeDeployDefault.ECS*.`);
    f2["deployment-config-name"] = cfg;
    let estilo = { deploymentType: "BLUE_GREEN", deploymentOption: "WITH_TRAFFIC_CONTROL" };
    if (flags["deployment-style"] !== undefined) {
      const e = String(flags["deployment-style"]).trim().charAt(0) === "{" ? lerJsonFlag(conta, flags["deployment-style"], "deployment-style") : parsearShorthand(String(flags["deployment-style"]));
      if (e.deploymentType !== "BLUE_GREEN" || e.deploymentOption !== "WITH_TRAFFIC_CONTROL") throw erro(op, "InvalidDeploymentStyleException", `For ${plat} deployments, the deployment style must be BLUE_GREEN with WITH_TRAFFIC_CONTROL.\n(em ${plat} o CodeDeploy sempre troca o tráfego — não existe \"in place\")`);
      estilo = e;
    }
    let ecs = null, par = null, prontidao = null, terminar = null;
    if (plat === "ECS") {
      if (flags["ecs-services"] === undefined) throw erro(op, "InvalidECSServiceException", "The Amazon ECS service identifier is not valid.\nFaltou --ecs-services serviceName=<serviço>,clusterName=<cluster>");
      ecs = parsearShorthand(String([].concat(flags["ecs-services"])[0]));
      const s = ((conta.ecs || {}).servicos || {})[ecs.serviceName];
      if (!s || s.cluster !== ecs.clusterName) throw erro(op, "InvalidECSServiceException", `The Amazon ECS service identifier is not valid.\n(não existe o serviço ${ecs.serviceName} no cluster ${ecs.clusterName})`);
      if (s.controlador !== "CODE_DEPLOY") throw erro(op, "InvalidECSServiceException", `The Amazon ECS service identifier is not valid.\n(o serviço ${ecs.serviceName} foi criado com o controlador ${s.controlador || "ECS"}; blue/green exige --deployment-controller type=CODE_DEPLOY na criação do serviço)`);
      if (flags["load-balancer-info"] === undefined) throw erro(op, "InvalidLoadBalancerInfoException", "An invalid load balancer name, or no load balancer name, was specified.\nFaltou --load-balancer-info com targetGroupPairInfoList.");
      const lbi = lerJsonFlag(conta, flags["load-balancer-info"], "load-balancer-info");
      par = ((lbi.targetGroupPairInfoList || [])[0]) || null;
      const nomesTg = par ? (par.targetGroups || []).map((t) => t.name) : [];
      if (nomesTg.length !== 2) throw erro(op, "InvalidLoadBalancerInfoException", "An invalid load balancer name, or no load balancer name, was specified.\nO targetGroupPairInfoList precisa de DOIS target groups: o azul (atual) e o verde (o novo).");
      for (const n of nomesTg) if (!((conta.elb || {}).tgs || {})[n]) throw erro(op, "InvalidLoadBalancerInfoException", `An invalid load balancer name, or no load balancer name, was specified.\n(o target group ${n} não existe)`);
      const listeners = ((par.prodTrafficRoute || {}).listenerArns || []);
      const l = Object.values((conta.elb || {}).listeners || {}).find((x) => x.arn === listeners[0]);
      if (!l) throw erro(op, "InvalidLoadBalancerInfoException", `An invalid load balancer name, or no load balancer name, was specified.\n(listener ${listeners[0] || "(vazio)"} não existe — o ARN sai do elbv2 describe-listeners)`);
      if (flags["blue-green-deployment-configuration"] !== undefined) {
        const bg = lerJsonFlag(conta, flags["blue-green-deployment-configuration"], "blue-green-deployment-configuration");
        prontidao = bg.deploymentReadyOption || null;
        terminar = bg.terminateBlueInstancesOnDeploymentSuccess || null;
      }
      par = { tgs: nomesTg, listener: l.arn };
    }
    delete f2["deployment-style"]; delete f2["ecs-services"]; delete f2["load-balancer-info"]; delete f2["blue-green-deployment-configuration"];
    const r = base["create-deployment-group"](conta, pos, f2);
    const g = deployState(conta).apps[String(flags["application-name"])].grupos[String(flags["deployment-group-name"])];
    Object.assign(g, { plataforma: plat, estilo, ecs, par, prontidao, terminar });
    avisarClimb(plat === "Lambda"
      ? `Grupo de Lambda criado com ${cfg}. Aqui não há máquina nem tag: o alvo é o ALIAS que o appspec do deploy apontar.`
      : `Grupo blue/green criado: o serviço ${ecs.serviceName} troca de ${par.tgs[0]} pra ${par.tgs[1]} (e volta) a cada deploy, pelo listener do load balancer.`);
    return r;
  };

  // o get-deployment-group das apps Lambda/ECS mostra o que é delas
  SERVICOS.deploy["get-deployment-group"] = (conta, pos, flags) => {
    const r = base["get-deployment-group"](conta, pos, flags);
    const g = ((deployState(conta).apps[String(flags["application-name"])] || {}).grupos || {})[String(flags["deployment-group-name"])];
    if (!g || !g.plataforma) return r;
    const o = JSON.parse(r);
    const i = o.deploymentGroupInfo;
    i.computePlatform = g.plataforma; i.deploymentStyle = g.estilo; i.ec2TagFilters = [];
    delete i.onPremisesInstanceTagFilters; delete i.autoScalingGroups;
    if (g.ecs) {
      i.ecsServices = [g.ecs];
      i.loadBalancerInfo = { targetGroupPairInfoList: [{ targetGroups: g.par.tgs.map((n) => ({ name: n })), prodTrafficRoute: { listenerArns: [g.par.listener] } }] };
      if (g.prontidao || g.terminar) i.blueGreenDeploymentConfiguration = { deploymentReadyOption: g.prontidao || undefined, terminateBlueInstancesOnDeploymentSuccess: g.terminar || undefined };
    }
    return js(o);
  };

  // ---------- criar o deploy (appspec) ----------
  function lerRevisao(conta, flags, op) {
    let rev;
    if (flags.revision !== undefined) rev = lerJsonFlag(conta, flags.revision, "revision");
    else if (flags["cli-input-json"] !== undefined) rev = (lerJsonFlag(conta, flags["cli-input-json"], "cli-input-json") || {}).revision;
    if (!rev) throw erro(op, "RevisionRequiredException", "The revision ID was not specified.\nEm Lambda e ECS o deploy leva o appspec: --revision file://<revisao>.json (revisionType AppSpecContent).");
    if (rev.revisionType !== "AppSpecContent" && rev.revisionType !== "String") throw erro(op, "InvalidRevisionException", "The revision was specified in an invalid format.\nPra Lambda e ECS: {\"revisionType\": \"AppSpecContent\", \"appSpecContent\": {\"content\": \"<appspec>\"}}");
    const conteudo = ((rev.appSpecContent || rev.string || {}).content);
    const appspec = conteudo !== undefined ? lerAppSpec(conteudo) : null;
    if (!appspec || !Array.isArray(appspec.Resources) || !appspec.Resources.length) throw erro(op, "InvalidRevisionException", "The revision was specified in an invalid format.\nO appspec precisa de Resources com o recurso alvo.");
    const res = appspec.Resources[0];
    const nomeLogico = Object.keys(res)[0];
    return { rev, appspec, alvo: res[nomeLogico], nomeLogico };
  }

  SERVICOS.deploy["create-deployment"] = (conta, pos, flags) => {
    const op = "CreateDeployment";
    const nomeApp = flags["application-name"] !== undefined ? String(flags["application-name"]) : undefined;
    const plat = nomeApp ? plataforma(conta, nomeApp) : "Server";
    if (plat === "Server") return base["create-deployment"](conta, pos, flags);
    const s = deployState(conta);
    const app = s.apps[nomeApp];
    if (!app) throw erro(op, "ApplicationDoesNotExistException", `No application found for name: ${nomeApp}`);
    if (flags["deployment-group-name"] === undefined) throw erro(op, "DeploymentGroupNameRequiredException", "The deployment group name was not specified.");
    const g = app.grupos[String(flags["deployment-group-name"])];
    if (!g) throw erro(op, "DeploymentGroupDoesNotExistException", `No Deployment Group found for name: ${flags["deployment-group-name"]}`);
    const { rev, alvo } = lerRevisao(conta, flags, op);
    const p = (alvo && alvo.Properties) || {};
    const d = { id: idDeploy(), app: app.nome, grupo: g.nome, config: flags["deployment-config-name"] !== undefined ? String(flags["deployment-config-name"]) : g.config,
      revisao: rev, descricao: flags.description !== undefined ? String(flags.description) : "", criador: "user", criado: agora(), inicio: agora(), fim: undefined,
      status: "Created", consultas: 0, frota: [], alvos: {}, rollbackCfg: JSON.parse(JSON.stringify(g.rollback || { enabled: false, events: [] })), plat, passo: 0 };
    if (plat === "Lambda") {
      if (!alvo || alvo.Type !== "AWS::Lambda::Function") throw erro(op, "InvalidRevisionException", "The revision was specified in an invalid format.\nNo appspec de Lambda o recurso é Type: AWS::Lambda::Function.");
      const f = ((conta.lambda || {}).funcoes || {})[p.Name];
      const a = f && (f.aliases || {})[p.Alias];
      d.lambda = { funcao: p.Name, alias: p.Alias, atual: String(p.CurrentVersion), alvo: String(p.TargetVersion) };
      d.frota = [`${p.Name}:${p.Alias}`];
      if (!f || !a) { d.status = "Failed"; d.fim = d.criado; d.erro = { code: "INVALID_LAMBDA_FUNCTION", message: `The Lambda function ${p.Name} or its alias ${p.Alias} could not be found.` }; }
      else if (a.versao !== d.lambda.atual) { d.status = "Failed"; d.fim = d.criado; d.erro = { code: "INVALID_LAMBDA_CONFIGURATION", message: `The alias ${p.Alias} points to version ${a.versao}, not to the CurrentVersion ${d.lambda.atual} in the AppSpec file.` }; }
      else if (!(f.versoes || []).some((v) => v.versao === d.lambda.alvo)) { d.status = "Failed"; d.fim = d.criado; d.erro = { code: "INVALID_LAMBDA_CONFIGURATION", message: `The TargetVersion ${d.lambda.alvo} of function ${p.Name} does not exist. Publish it first.` }; }
    } else {
      if (!alvo || alvo.Type !== "AWS::ECS::Service") throw erro(op, "InvalidRevisionException", "The revision was specified in an invalid format.\nNo appspec de ECS o recurso é Type: AWS::ECS::Service.");
      const td = String(p.TaskDefinition || "");
      const m = /task-definition\/([^:]+):(\d+)$/.exec(td);
      const fam = m && ((conta.ecs || {}).tarefas || {})[m[1]];
      const svc = conta.ecs.servicos[g.ecs.serviceName];
      const listener = conta.elb.listeners[g.par.listener];
      const azul = Object.values(conta.elb.tgs).find((t) => t.arn === (listener || {}).tg);
      d.ecs = { servico: svc.nome, cluster: svc.cluster, familia: m ? m[1] : "", revisaoNova: m ? parseInt(m[2], 10) : 0, revisaoVelha: svc.revisao,
        azul: azul ? azul.nome : g.par.tgs[0], verde: g.par.tgs.find((n) => n !== (azul ? azul.nome : g.par.tgs[0])), peso: 0, container: (p.LoadBalancerInfo || {}).ContainerName };
      d.frota = [`${svc.cluster}:${svc.nome}`];
      if (!m || !fam || parseInt(m[2], 10) > fam.revisao) { d.status = "Failed"; d.fim = d.criado; d.erro = { code: "ECS_UPDATE_ERROR", message: `The task definition ${td} could not be found. Register the new revision first (aws ecs register-task-definition).` }; }
      else if (Object.values(s.deploys).some((x) => x.plat === "ECS" && x.grupo === g.nome && ["Created", "InProgress", "Ready"].indexOf(x.status) >= 0)) throw erro(op, "DeploymentLimitExceededException", `The number of allowed deployments was exceeded.\nJá existe um deploy em andamento neste grupo — espere terminar ou pare com stop-deployment.`);
    }
    s.deploys[d.id] = d;
    g.ultimo = d.id;
    avisarClimb(d.status === "Failed" ? "Deploy criado — e já falhou. Veja o motivo no errorInformation do get-deployment."
      : plat === "Lambda" ? `Deploy criado. O CodeDeploy vai mover o alias ${d.lambda.alias} da versão ${d.lambda.atual} pra ${d.lambda.alvo} seguindo ${d.config}. Acompanhe com get-deployment (e veja o alias com lambda get-alias).`
        : `Deploy criado: as tarefas da revisão ${d.ecs.revisaoNova} vão subir atrás do ${d.ecs.verde}, e o tráfego sai do ${d.ecs.azul}. Acompanhe com get-deployment.`);
    return js({ deploymentId: d.id });
  };

  // ---------- andar um passo ----------
  function aliasDe(conta, d) { const f = ((conta.lambda || {}).funcoes || {})[d.lambda.funcao]; return f && (f.aliases || {})[d.lambda.alias]; }
  function passoLambda(conta, d) {
    const a = aliasDe(conta, d);
    if (!a) { d.status = "Failed"; d.fim = agora(); d.erro = { code: "INVALID_LAMBDA_FUNCTION", message: "The alias was deleted during the deployment." }; return; }
    const can = CANARIO.exec(d.config), lin = LINEAR.exec(d.config);
    d.status = "InProgress";
    let peso;
    if (can && d.passo === 0) peso = Number(can[1]) / 100;
    else if (lin) peso = Math.min(1, (d.passo + 1) * Number(lin[1]) / 100);
    else peso = 1;
    d.passo += 1;
    if (peso >= 1) { a.versao = d.lambda.alvo; delete a.pesos; d.status = "Succeeded"; d.fim = agora(); d.lambda.peso = 1; }
    else { a.pesos = { [d.lambda.alvo]: peso }; d.lambda.peso = peso; }
  }
  function tgArn(conta, nome) { return ((conta.elb.tgs || {})[nome] || {}).arn; }
  function passoEcs(conta, d, g) {
    const svc = conta.ecs.servicos[d.ecs.servico];
    if (d.passo === 0) {
      // 1º passo: as tarefas novas sobem atrás do target group verde, sem tráfego
      d.status = "InProgress"; d.passo = 1; d.ecs.verdeNoAr = true;
      const espera = g.prontidao && g.prontidao.actionOnTimeout === "STOP_DEPLOYMENT";
      if (espera) { d.status = "Ready"; d.pronto = true; }
      return;
    }
    if (d.status === "Ready") return; // espera o continue-deployment
    const can = CANARIO.exec(d.config), lin = LINEAR.exec(d.config);
    let peso;
    if (can && d.ecs.peso === 0) peso = Number(can[1]) / 100;
    else if (lin) peso = Math.min(1, d.ecs.peso + Number(lin[1]) / 100);
    else peso = 1;
    d.ecs.peso = peso;
    if (peso >= 1) {
      const l = conta.elb.listeners[g.par.listener];
      if (l) l.tg = tgArn(conta, d.ecs.verde);
      svc.revisao = d.ecs.revisaoNova;
      svc.lbs = (svc.lbs || []).map((x) => Object.assign({}, x, { targetGroupArn: tgArn(conta, d.ecs.verde) }));
      d.status = "Succeeded"; d.fim = agora();
      g.ultimoOk = d.id;
    }
  }
  function avancar(conta, d) {
    if (["Created", "InProgress"].indexOf(d.status) < 0) return;
    const g = ((deployState(conta).apps[d.app] || {}).grupos || {})[d.grupo];
    if (d.plat === "Lambda") passoLambda(conta, d); else passoEcs(conta, d, g || {});
    if (d.status === "Succeeded" && g) g.ultimoOk = d.id;
  }
  function eventosLambda(d) {
    const fim = d.status === "Succeeded", parado = d.status === "Stopped";
    const ev = (n, st) => ({ lifecycleEventName: n, status: st, startTime: d.inicio, endTime: st === "Succeeded" ? d.inicio + 1 : undefined });
    return [ev("BeforeAllowTraffic", "Succeeded"), ev("AllowTraffic", fim ? "Succeeded" : parado ? "Skipped" : "InProgress"), ev("AfterAllowTraffic", fim ? "Succeeded" : parado ? "Skipped" : "Pending")];
  }
  function eventosEcs(d) {
    const nomes = ["BeforeInstall", "Install", "AfterInstall", "AllowTestTraffic", "AfterAllowTestTraffic", "BeforeAllowTraffic", "AllowTraffic", "AfterAllowTraffic"];
    const feitos = d.status === "Succeeded" ? 8 : d.passo >= 1 ? 6 : 0;
    return nomes.map((n, i) => ({ lifecycleEventName: n, status: i < feitos ? "Succeeded" : d.status === "Stopped" ? "Skipped" : i === feitos ? "InProgress" : "Pending" }));
  }
  function visao(d) {
    const v = { Pending: 0, InProgress: 0, Succeeded: 0, Failed: 0, Skipped: 0, Ready: 0 };
    const k = d.status === "Created" ? "Pending" : d.status === "Stopped" ? "Skipped" : d.status;
    if (v[k] !== undefined) v[k] = 1;
    return v;
  }

  SERVICOS.deploy["get-deployment"] = (conta, pos, flags) => {
    const d = deployState(conta).deploys[String(flags["deployment-id"])];
    if (!d || !d.plat) return base["get-deployment"](conta, pos, flags);
    avancar(conta, d);
    const o = {
      applicationName: d.app, deploymentGroupName: d.grupo, deploymentConfigName: d.config, deploymentId: d.id, revision: d.revisao, status: d.status,
      errorInformation: d.erro, createTime: d.criado, startTime: d.inicio, completeTime: d.fim, deploymentOverview: visao(d), description: d.descricao || undefined,
      creator: d.criador, ignoreApplicationStopFailures: false, autoRollbackConfiguration: d.rollbackCfg, updateOutdatedInstancesOnly: false, rollbackInfo: d.rollback,
      deploymentStyle: { deploymentType: "BLUE_GREEN", deploymentOption: "WITH_TRAFFIC_CONTROL" }, instanceTerminationWaitTimeStarted: d.status === "Succeeded" && d.plat === "ECS",
      computePlatform: d.plat,
    };
    if (d.status === "Ready") avisarClimb("Ready: as tarefas novas estão de pé atrás do target group verde, mas o tráfego AINDA vai pro azul. É a hora de testar a versão nova. Pra liberar: aws deploy continue-deployment --deployment-id " + d.id);
    else if (d.status === "InProgress" && d.plat === "Lambda") avisarClimb(`Tráfego dividido: ${Math.round((d.lambda.peso || 0) * 100)}% na versão ${d.lambda.alvo}. Confira no alias (lambda get-alias). Consulte de novo pra avançar.`);
    else if (d.status === "InProgress") avisarClimb("Rodando: as tarefas novas subiram no target group verde. Consulte de novo pra trocar o tráfego.");
    else if (d.status === "Succeeded" && d.plat === "ECS") avisarClimb(`Pronto: o listener agora manda o tráfego pro ${d.ecs.verde}. No próximo deploy ele vira o \"azul\" — os papéis se revezam.`);
    return js({ deploymentInfo: o });
  };

  SERVICOS.deploy["list-deployment-targets"] = (conta, pos, flags) => {
    const d = deployState(conta).deploys[String(flags["deployment-id"])];
    if (!d || !d.plat) return base["list-deployment-targets"](conta, pos, flags);
    return js({ targetIds: d.frota.slice() });
  };
  SERVICOS.deploy["get-deployment-target"] = (conta, pos, flags) => {
    const d = deployState(conta).deploys[String(flags["deployment-id"])];
    if (!d || !d.plat) return base["get-deployment-target"](conta, pos, flags);
    const alvo = String(exigirFlag(flags, "target-id"));
    if (d.frota.indexOf(alvo) < 0) throw erro("GetDeploymentTarget", "DeploymentTargetDoesNotExistException", `The provided target ID does not belong to the attempted deployment.\nOs alvos saem de: aws deploy list-deployment-targets --deployment-id ${d.id}`);
    const st = d.status === "Created" ? "Pending" : d.status === "Ready" ? "Ready" : d.status;
    if (d.plat === "Lambda") {
      return js({ deploymentTarget: { deploymentTargetType: "LambdaTarget", lambdaTarget: { deploymentId: d.id, targetId: alvo,
        targetArn: `arn:aws:lambda:${REGIAO(conta)}:${CONTA_ID(conta)}:function:${d.lambda.funcao}:${d.lambda.alias}`, status: st, lastUpdatedAt: d.fim || agora(),
        lifecycleEvents: eventosLambda(d),
        lambdaFunctionInfo: { functionName: d.lambda.funcao, functionAlias: d.lambda.alias, currentVersion: d.lambda.atual, targetVersion: d.lambda.alvo, targetVersionWeight: d.lambda.peso || 0 } } } });
    }
    const peso = d.ecs.peso || 0;
    const conjuntos = [{ identifer: "ecs-svc/" + hexAleatorio(19), desiredCount: 2, pendingCount: 0, runningCount: 2, status: "PRIMARY", trafficWeight: Math.round((1 - peso) * 100), targetGroup: { name: d.ecs.azul }, taskSetLabel: "BLUE" }];
    if (d.ecs.verdeNoAr) conjuntos.push({ identifer: "ecs-svc/" + hexAleatorio(19), desiredCount: 2, pendingCount: 0, runningCount: 2, status: "ACTIVE", trafficWeight: Math.round(peso * 100), targetGroup: { name: d.ecs.verde }, taskSetLabel: "GREEN" });
    avisarClimb("Os dois conjuntos de tarefas: BLUE (a versão que estava no ar) e GREEN (a nova). O trafficWeight diz quanto do tráfego cada um recebe agora.");
    return js({ deploymentTarget: { deploymentTargetType: "ECSTarget", ecsTarget: { deploymentId: d.id, targetId: alvo,
      targetArn: `arn:aws:ecs:${REGIAO(conta)}:${CONTA_ID(conta)}:service/${d.ecs.cluster}/${d.ecs.servico}`, lastUpdatedAt: d.fim || agora(),
      lifecycleEvents: eventosEcs(d), status: st, taskSetsInfo: conjuntos } } });
  };

  SERVICOS.deploy["continue-deployment"] = (conta, pos, flags) => {
    const op = "ContinueDeployment";
    const id = String(exigirFlag(flags, "deployment-id"));
    const d = deployState(conta).deploys[id];
    if (!d) throw erro(op, "DeploymentDoesNotExistException", `The deployment ${id} does not exist with the user or AWS account.`);
    const tipo = flags["deployment-wait-type"] !== undefined ? String(flags["deployment-wait-type"]) : "READY_WAIT";
    if (["READY_WAIT", "TERMINATION_WAIT"].indexOf(tipo) < 0) throw new ErroCli(`\nInvalid choice: '${tipo}', valid choices are: 'READY_WAIT', 'TERMINATION_WAIT'`);
    if (d.plat !== "ECS" || d.status !== "Ready") throw erro(op, "DeploymentIsNotInReadyStateException", `The deployment does not have a status of Ready and can't continue yet.\n(status atual: ${d.status})`);
    d.status = "InProgress";
    avisarClimb("Liberado: o CodeDeploy vai trocar o tráfego do azul pro verde. Consulte com get-deployment.");
    return "";
  };

  SERVICOS.deploy["stop-deployment"] = (conta, pos, flags) => {
    const d = deployState(conta).deploys[String(flags["deployment-id"])];
    if (!d || !d.plat) return base["stop-deployment"](conta, pos, flags);
    if (["Created", "InProgress", "Ready"].indexOf(d.status) < 0) throw erro("StopDeployment", "DeploymentAlreadyCompletedException", `The deployment is already complete: ${d.id} (status ${d.status}).`);
    const volta = flags["auto-rollback-enabled"] === true || flags["auto-rollback-enabled"] === "true";
    d.status = "Stopped"; d.fim = agora();
    if (d.plat === "Lambda") { const a = aliasDe(conta, d); if (a) { a.versao = d.lambda.atual; delete a.pesos; } d.lambda.peso = 0; }
    else { d.ecs.peso = 0; d.ecs.verdeNoAr = false; }
    if (volta) d.rollback = { rollbackMessage: `Stopped by user with automatic rollback: traffic returned to ${d.plat === "Lambda" ? "version " + d.lambda.atual : d.ecs.azul}.` };
    avisarClimb(d.plat === "Lambda"
      ? `Parado. O alias ${d.lambda.alias} voltou inteiro pra versão ${d.lambda.atual} — os ${Math.round(100)}% das chamadas estão de novo na versão que funcionava.`
      : `Parado. O tráfego nunca saiu (ou voltou) pro ${d.ecs.azul}, e as tarefas novas foram removidas.`);
    return js({ status: "Succeeded", statusMessage: "No more commands will be scheduled for execution in the deployment instances" });
  };

  // ============================================================
  // ARQUIVOS DO LAB: as revisões (appspec)
  // ============================================================
  (function () {
    if (typeof ARQUIVOS_LOCAIS === "undefined") return;
    const revisao = (appspec) => JSON.stringify({ revisionType: "AppSpecContent", appSpecContent: { content: JSON.stringify(appspec) } }, null, 2) + "\n";
    const lambda = (de, para) => ({ version: 0.0, Resources: [{ CobrancaApi: { Type: "AWS::Lambda::Function", Properties: { Name: "cobranca-api", Alias: "producao", CurrentVersion: String(de), TargetVersion: String(para) } } }] });
    const ecs = (rev) => ({ version: 0.0, Resources: [{ TargetService: { Type: "AWS::ECS::Service", Properties: {
      TaskDefinition: `arn:aws:ecs:us-east-1:123456789012:task-definition/vitrine-web:${rev}`, LoadBalancerInfo: { ContainerName: "web", ContainerPort: 80 } } } }] });
    const CONTEUDOS = {
      "revisao-cobranca-v2.json": revisao(lambda(1, 2)),
      "revisao-cobranca-v3.json": revisao(lambda(2, 3)),
      "revisao-vitrine-v2.json": revisao(ecs(2)),
      "revisao-vitrine-v3.json": revisao(ecs(3)),
      "revisao-vitrine-v4.json": revisao(ecs(4)),
    };
    for (const nome of Object.keys(CONTEUDOS)) {
      ARQUIVOS_LOCAIS[nome] = CONTEUDOS[nome].length;
      if (typeof window !== "undefined") { window.ARQUIVOS_CONTEUDO = window.ARQUIVOS_CONTEUDO || {}; window.ARQUIVOS_CONTEUDO[nome] = CONTEUDOS[nome]; }
    }
  })();

  // ============================================================
  // MANUAIS + PORQUE
  // ============================================================
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => "USO\n    " + uso + "\n\n" + txt;
    Object.assign(MANUAIS, {
      "lambda.get-alias": M("aws lambda get-alias --function-name <função> --name <alias>",
        "Pra qual versão o alias aponta. Durante um canary aparece o RoutingConfig:\nAdditionalVersionWeights diz quanto do tráfego já vai pra versão nova."),
      "elbv2.describe-listeners": M("aws elbv2 describe-listeners --load-balancer-arn <arn> | --listener-arns <arn>",
        "Os listeners do load balancer e pra qual target group cada um encaminha\n(DefaultActions). No blue/green do ECS, é aqui que se vê a troca."),
      "deploy.continue-deployment": M("aws deploy continue-deployment --deployment-id <id> [--deployment-wait-type READY_WAIT|TERMINATION_WAIT]",
        "Libera um deploy blue/green que está em Ready: as tarefas novas estão de\npé no target group verde e esperam o sinal pra receber o tráfego."),
    });
    // os manuais do CodeDeploy ganham as formas de Lambda e ECS
    const add = (k, txt) => { if (MANUAIS[k]) MANUAIS[k] += "\n\n" + txt; };
    add("deploy.create-application", "LAMBDA E ECS\n    --compute-platform Lambda | ECS: aí o deploy não copia pacote — ele troca\n    o tráfego (alias do Lambda, target group do ECS).");
    add("deploy.create-deployment-group", "LAMBDA\n    --deployment-config-name CodeDeployDefault.LambdaCanary10Percent5Minutes\n    --deployment-style deploymentType=BLUE_GREEN,deploymentOption=WITH_TRAFFIC_CONTROL\n\nECS (blue/green)\n    --ecs-services serviceName=<serviço>,clusterName=<cluster>\n    --load-balancer-info '{\"targetGroupPairInfoList\":[{\"targetGroups\":[{\"name\":\"<azul>\"},{\"name\":\"<verde>\"}],\"prodTrafficRoute\":{\"listenerArns\":[\"<listener>\"]}}]}'\n    --blue-green-deployment-configuration '{\"deploymentReadyOption\":{\"actionOnTimeout\":\"STOP_DEPLOYMENT\",\"waitTimeInMinutes\":60}}'");
    add("deploy.create-deployment", "LAMBDA E ECS\n    --revision file://<revisao>.json — revisionType AppSpecContent, com o appspec:\n    Lambda: Name, Alias, CurrentVersion, TargetVersion\n    ECS: TaskDefinition (ARN da revisão nova) e LoadBalancerInfo");
    add("deploy.stop-deployment", "--auto-rollback-enabled: além de parar, devolve o tráfego pra versão que\nestava no ar (alias do Lambda / target group azul do ECS).");
  }
  if (typeof PORQUE !== "undefined") Object.assign(PORQUE, {
    "lambda.get-alias": "mostra pra qual versão o alias aponta — e, no canary, quanto do tráfego já foi pra nova.",
    "elbv2.describe-listeners": "mostra pra qual target group o load balancer está mandando o tráfego agora.",
    "deploy.continue-deployment": "dá o sinal verde pro blue/green trocar o tráfego depois do teste.",
  });
  if (typeof LICOES !== "undefined" && !LICOES["codedeploy-bg"]) {
    LICOES["codedeploy-bg"] = {
      emoji: "🔀", titulo: "CodeDeploy blue/green: Lambda e ECS",
      oque: "Em Lambda e em contêiner não existe \"copiar o pacote pra máquina\". O que o CodeDeploy faz é <b>trocar o tráfego</b>: a versão nova sobe <b>ao lado</b> da velha, recebe uma fatia pequena (ou nada, enquanto você testa) e só depois recebe tudo. Se algo der errado, o tráfego volta — a versão velha nunca saiu do ar.",
      serve: "É o deploy sem medo de produção: no Lambda, o canary manda 10% das chamadas pra versão nova e espera; no ECS, as tarefas novas sobem atrás de um segundo target group e o load balancer troca de um pro outro de uma vez. Voltar atrás é mudar o ponteiro de volta, em segundos.",
      casos: [
        "Uma API de cobrança em Lambda recebe a versão nova só em 10% das chamadas por 5 minutos; se os erros subirem, o CodeDeploy devolve tudo pra versão anterior.",
        "O site da loja em ECS sobe as tarefas novas no target group verde, o QA testa, e só aí o listener troca — sem nenhuma requisição cair.",
        "Um deploy de sexta à tarde é parado com rollback: o alias volta pra versão de ontem antes de o suporte perceber.",
      ],
      vocab: [
        ["Blue/green", "a versão atual (azul) e a nova (verde) no ar ao mesmo tempo; o tráfego troca de uma pra outra."],
        ["Canary", "a nova recebe uma fatia pequena primeiro (10%), e o resto depois do tempo de espera."],
        ["Alias", "o apelido estável do Lambda; o deploy muda pra qual versão ele aponta."],
        ["Target group", "o grupo de tarefas atrás do load balancer; no blue/green do ECS são dois, e eles se revezam."],
        ["Listener", "quem escuta a porta no load balancer e decide pra qual target group o tráfego vai."],
        ["appspec", "o arquivo do deploy: em Lambda, alias e versões; em ECS, a task definition nova e o container."],
      ],
      cobra: "O CodeDeploy não cobra pra Lambda nem pra ECS — você paga o Lambda e as tarefas do ECS, que durante o blue/green ficam em dobro por alguns minutos. Comparando: <b>blue/green x rolling</b> — o rolling troca as tarefas aos poucos no mesmo lugar (e voltar exige outro deploy); o blue/green mantém a versão velha pronta até o fim, e voltar é só mudar o tráfego.",
    };
  }

  // ============================================================
  // ATIVIDADES
  // ============================================================
  if (typeof DESAFIOS === "undefined" || typeof SERVICOS_META === "undefined") return;
  function d(id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar) {
    return { id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar };
  }
  // helpers fora do d(...): acesso por índice dentro dele vira null no corte do gabarito
  const S = "codedeploy-bg";
  const funcao = (c, n) => ((((c.lambda || {}).funcoes) || {})[n]);
  const alias = (c) => (((funcao(c, "cobranca-api") || {}).aliases) || {}).producao;
  const deploysDe = (c, app) => Object.values(((c.codedeploy || {}).deploys) || {}).filter((x) => x.app === app);
  const grupoDe = (c, app, g) => (((((c.codedeploy || {}).apps) || {})[app] || {}).grupos || {})[g];
  const servico = (c) => ((((c.ecs || {}).servicos) || {})["vitrine-web"]);
  const tgDe = (c, n) => ((((c.elb || {}).tgs) || {})[n]);
  const listenerNo = (c, n) => Object.values(((c.elb || {}).listeners) || {}).find((l) => l.tg === (tgDe(c, n) || {}).arn);
  const flag = (cmd, nome) => String((cmd && cmd.flags && cmd.flags[nome]) || "");
  const ROLE = "arn:aws:iam::123456789012:role/codedeploy-servico";
  // montados (não strings prontas): a linha inteira da solução não pode aparecer
  // fora do solucao, senão desce no arquivo público (teste/gabarito.js)
  const verDeploy = (x) => `aws deploy get-deployment --deployment-id <${x}>`;
  const verAlias = (x) => `aws lambda get-alias --function-name cobranca-api --name ${x}`;
  const publicar = (desc) => `aws lambda publish-version --function-name cobranca-api --description ${desc}`;
  const novoCodigo = (n) => `aws lambda update-function-code --function-name ${n} --zip-file fileb://app.zip`;
  const deployLambda = (arq) => `aws deploy create-deployment --application-name cobranca-lambda --deployment-group-name cobranca-producao --revision file://${arq}`;
  const deployEcs = (arq) => `aws deploy create-deployment --application-name vitrine-ecs --deployment-group-name vitrine-producao --revision file://${arq}`;
  const registrarTd = (n) => `aws ecs register-task-definition --family ${n} --container-definitions file://tarefa-web.json`;
  const LBI = `'{"targetGroupPairInfoList":[{"targetGroups":[{"name":"tg-vitrine-azul"},{"name":"tg-vitrine-verde"}],"prodTrafficRoute":{"listenerArns":["<listener-vitrine>"]}}]}'`;

  const TRILHA = [
    // ---------- LAMBDA ----------
    d("cbg-1", S, 1, 60, "A API de cobrança",
      "O time de pagamentos tem uma API de cobrança em Lambda e quer trocar de versão sem derrubar ninguém. Comece pela função: crie a <b>cobranca-api</b> (python3.12, handler <b>app.handler</b>, role <b>arn:aws:iam::123456789012:role/cobranca-role</b>, código no <b>app.zip</b>).",
      ["É o `aws lambda create-function` da trilha de Lambda.", "Ele pede `--function-name`, `--runtime`, `--role`, `--handler` e `--zip-file fileb://app.zip`."],
      ["aws lambda create-function --function-name cobranca-api --runtime python3.12 --role arn:aws:iam::123456789012:role/cobranca-role --handler app.handler --zip-file fileb://app.zip"],
      (c) => !!funcao(c, "cobranca-api")),
    d("cbg-2", S, 1, 50, "Congele a versão 1",
      "O CodeDeploy troca tráfego entre VERSÕES — o $LATEST não serve, porque muda a cada deploy. Publique a versão 1 da <b>cobranca-api</b> com a descrição <b>primeira</b>.",
      ["É o `aws lambda publish-version`.", "Com `--function-name` e `--description`."],
      [publicar("primeira")],
      (c) => ((funcao(c, "cobranca-api") || {}).versoes || []).length >= 1),
    d("cbg-3", S, 1, 60, "O nome que os clientes chamam",
      "Quem chama a API não deve saber número de versão. Crie o alias <b>producao</b> apontando pra versão <b>1</b>.",
      ["É o `aws lambda create-alias`.", "Com `--function-name`, `--name producao` e `--function-version 1`."],
      ["aws lambda create-alias --function-name cobranca-api --name producao --function-version 1"],
      (c) => !!alias(c)),
    d("cbg-4", S, 2, 60, "Pra onde o alias aponta?",
      "Confira o alias <b>producao</b>: a versão e o ARN que os clientes usam.",
      ["O detalhe de um alias é o `aws lambda get-alias`.", "Ele pede `--function-name` e `--name`."],
      [verAlias("producao")],
      (c, cmd, ok) => ok && ehCmd(cmd, "lambda", "get-alias")),
    d("cbg-5", S, 2, 70, "A aplicação de Lambda",
      "Crie no CodeDeploy a aplicação <b>cobranca-lambda</b> para a plataforma <b>Lambda</b>.",
      ["É o `aws deploy create-application` da trilha de CodeDeploy.", "A diferença é `--compute-platform Lambda`."],
      ["aws deploy create-application --application-name cobranca-lambda --compute-platform Lambda"],
      (c) => ((((c.codedeploy || {}).apps) || {})["cobranca-lambda"] || {}).plataforma === "Lambda"),
    d("cbg-6", S, 2, 90, "Canary de 10%",
      "Crie o grupo <b>cobranca-producao</b> na <b>cobranca-lambda</b> com a role <b>" + ROLE + "</b> e a configuração <b>CodeDeployDefault.LambdaCanary10Percent5Minutes</b>: 10% das chamadas vão pra versão nova primeiro, o resto depois.",
      ["É o `aws deploy create-deployment-group`, sem tag nem máquina.", "Em Lambda o estilo é sempre `--deployment-style deploymentType=BLUE_GREEN,deploymentOption=WITH_TRAFFIC_CONTROL`."],
      ["aws deploy create-deployment-group --application-name cobranca-lambda --deployment-group-name cobranca-producao --service-role-arn " + ROLE + " --deployment-config-name CodeDeployDefault.LambdaCanary10Percent5Minutes --deployment-style deploymentType=BLUE_GREEN,deploymentOption=WITH_TRAFFIC_CONTROL"],
      (c) => !!grupoDe(c, "cobranca-lambda", "cobranca-producao")),
    d("cbg-7", S, 2, 60, "O código novo da cobrança",
      "O time corrigiu o cálculo de juros. Suba o código novo (<b>app.zip</b>) na <b>cobranca-api</b> — isso muda só o $LATEST; o alias continua na versão 1.",
      ["É o `aws lambda update-function-code`.", "Com `--function-name` e `--zip-file fileb://app.zip`."],
      [novoCodigo("cobranca-api")],
      (c, cmd, ok) => ok && ehCmd(cmd, "lambda", "update-function-code") && flag(cmd, "function-name") === "cobranca-api"),
    d("cbg-f1", S, 2, 60, "Congele a versão 2",
      "Publique a versão 2 da <b>cobranca-api</b> (descrição <b>juros-corrigidos</b>) — é ela que o deploy vai levar pro alias.",
      ["O mesmo publish-version de antes."],
      [publicar("juros-corrigidos")],
      (c) => ((funcao(c, "cobranca-api") || {}).versoes || []).length >= 2),
    d("cbg-8", S, 2, 60, "O appspec do deploy",
      "Leia o <b>revisao-cobranca-v2.json</b>: é a revisão do deploy. Dentro do <code>content</code>, o appspec diz <b>qual alias</b> (producao) sai de <b>qual versão</b> (CurrentVersion 1) pra <b>qual</b> (TargetVersion 2).",
      ["Ler arquivo é o `cat`."],
      ["cat revisao-cobranca-v2.json"],
      (c, cmd, ok) => ok && cmd && cmd.sub === "cat" && /revisao-cobranca-v2\.json/.test((cmd.args || []).join(" "))),
    d("cbg-9", S, 3, 110, "O deploy da versão 2",
      "Entregue a versão 2 no grupo <b>cobranca-producao</b> usando a revisão <b>revisao-cobranca-v2.json</b>.",
      ["É o `aws deploy create-deployment`, com `--application-name` e `--deployment-group-name`.", "Em Lambda o pacote dá lugar ao appspec: `--revision file://revisao-cobranca-v2.json`."],
      [deployLambda("revisao-cobranca-v2.json")],
      (c) => deploysDe(c, "cobranca-lambda").length > 0),
    d("cbg-10", S, 3, 110, "10% na versão nova",
      "Consulte o deploy uma vez e olhe o alias <b>producao</b>: ele continua na versão 1, mas com um <code>RoutingConfig</code> mandando 10% das chamadas pra versão 2. É o canary acontecendo.",
      ["get-deployment pra andar o deploy; depois, lambda get-alias.", "Repare no AdditionalVersionWeights."],
      [verDeploy("deploy-id"), verAlias("producao")],
      (c, cmd, ok) => ok && ehCmd(cmd, "lambda", "get-alias") && !!(alias(c) || {}).pesos),
    d("cbg-f2", S, 3, 90, "O canary passou",
      "Os 5 minutos de canary passaram sem erro. Consulte o deploy até ele terminar e confira: agora o alias aponta inteiro pra versão 2.",
      ["get-deployment de novo (status Succeeded).", "Depois, lambda get-alias."],
      [verDeploy("deploy-id"), verAlias("producao")],
      (c, cmd, ok) => ok && ehCmd(cmd, "lambda", "get-alias") && (alias(c) || {}).versao === "2" && !(alias(c) || {}).pesos),
    d("cbg-11", S, 3, 90, "O que o CodeDeploy fez no alias",
      "Veja o deploy do ponto de vista do alvo: o alias como alvo, as etapas (BeforeAllowTraffic, AllowTraffic, AfterAllowTraffic) e o peso da versão nova.",
      ["O alvo de um deploy de Lambda é `cobranca-api:producao` (sai do list-deployment-targets).", "O detalhe é o `aws deploy get-deployment-target`, com `--deployment-id` e `--target-id`."],
      ["aws deploy get-deployment-target --deployment-id <deploy-id> --target-id cobranca-api:producao"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "get-deployment-target") && flag(cmd, "target-id") === "cobranca-api:producao"),
    d("cbg-f3", S, 3, 140, "A versão 3 está dando erro",
      "Sexta, 17h: a versão 3 foi pro canary e o monitoramento mostra erro de pagamento nos 10%. Reproduza — código novo, publique a versão 3 (descrição <b>nova-bandeira</b>), deploy com <b>revisao-cobranca-v3.json</b> e uma consulta — e <b>pare o deploy com rollback</b>. Confira que o alias voltou inteiro pra versão 2.",
      ["update-function-code → publish-version → create-deployment → get-deployment, que você já usou.", "Parar com rollback: `aws deploy stop-deployment --deployment-id <id> --auto-rollback-enabled`. Depois, lambda get-alias."],
      [novoCodigo("cobranca-api"), publicar("nova-bandeira"), deployLambda("revisao-cobranca-v3.json"), verDeploy("deploy-id"),
        "aws deploy stop-deployment --deployment-id <deploy-id> --auto-rollback-enabled", verAlias("producao")],
      (c, cmd, ok) => ok && ehCmd(cmd, "lambda", "get-alias") && (alias(c) || {}).versao === "2" && !(alias(c) || {}).pesos && deploysDe(c, "cobranca-lambda").some((x) => x.status === "Stopped" && !!x.rollback)),

    // ---------- ECS ----------
    d("cbg-12", S, 3, 70, "O cluster da vitrine",
      "Agora o site da loja, que roda em contêiner. Crie o cluster <b>cluster-vitrine</b> no ECS.",
      ["É o `aws ecs create-cluster` da trilha de ECS."],
      ["aws ecs create-cluster --cluster-name cluster-vitrine"],
      (c) => !!((((c.ecs || {}).clusters) || {})["cluster-vitrine"])),
    d("cbg-13", S, 3, 70, "A receita da vitrine",
      "Registre a task definition <b>vitrine-web</b> com o arquivo pronto <b>tarefa-web.json</b> (container <b>web</b>, porta 80).",
      ["É o `aws ecs register-task-definition`.", "Com `--family vitrine-web` e `--container-definitions file://tarefa-web.json`."],
      [registrarTd("vitrine-web")],
      (c) => !!((((c.ecs || {}).tarefas) || {})["vitrine-web"])),
    d("cbg-14", S, 3, 70, "O load balancer da loja",
      "O tráfego da loja entra por um load balancer. Crie o <b>alb-vitrine</b> nas sub-redes <b>subnet-vitrine-a</b> e <b>subnet-vitrine-b</b>.",
      ["É o `aws elbv2 create-load-balancer`.", "Com `--name` e `--subnets` (as duas, separadas por espaço)."],
      ["aws elbv2 create-load-balancer --name alb-vitrine --subnets subnet-vitrine-a subnet-vitrine-b"],
      (c) => !!((((c.elb || {}).lbs) || {})["alb-vitrine"])),
    d("cbg-15", S, 3, 80, "Os dois lados: azul e verde",
      "Blue/green precisa de DOIS target groups, um pra cada lado. Crie o <b>tg-vitrine-azul</b> e o <b>tg-vitrine-verde</b> (HTTP, porta 80, VPC <b>vpc-0f00d1e00c11ab001</b>).",
      ["É o `aws elbv2 create-target-group`, duas vezes.", "Com `--name`, `--protocol HTTP`, `--port 80` e `--vpc-id`. Pra ECS em Fargate, `--target-type ip`."],
      ["aws elbv2 create-target-group --name tg-vitrine-azul --protocol HTTP --port 80 --vpc-id vpc-0f00d1e00c11ab001 --target-type ip",
        "aws elbv2 create-target-group --name tg-vitrine-verde --protocol HTTP --port 80 --vpc-id vpc-0f00d1e00c11ab001 --target-type ip"],
      (c) => !!tgDe(c, "tg-vitrine-azul") && !!tgDe(c, "tg-vitrine-verde")),
    d("cbg-16", S, 3, 80, "A porta 80 aponta pro azul",
      "Crie o listener do <b>alb-vitrine</b> na porta <b>80</b> (HTTP) encaminhando pro <b>tg-vitrine-azul</b> — ele é o lado que está no ar hoje.",
      ["É o `aws elbv2 create-listener`.", "Com `--load-balancer-arn`, `--protocol HTTP`, `--port 80` e `--default-actions Type=forward,TargetGroupArn=<arn-do-azul>`."],
      ["aws elbv2 create-listener --load-balancer-arn <lb-vitrine> --protocol HTTP --port 80 --default-actions Type=forward,TargetGroupArn=<tg:tg-vitrine-azul>"],
      (c) => !!listenerNo(c, "tg-vitrine-azul")),
    d("cbg-17", S, 3, 110, "O serviço que o CodeDeploy controla",
      "Crie o serviço <b>vitrine-web</b> no <b>cluster-vitrine</b> (task definition <b>vitrine-web</b>, 2 tarefas) atrás do <b>tg-vitrine-azul</b>, e — o ponto principal — com o controlador de deploy <b>CODE_DEPLOY</b>.",
      ["É o `aws ecs create-service` da trilha de ECS, com duas flags a mais.", "`--deployment-controller type=CODE_DEPLOY` e `--load-balancers targetGroupArn=<arn-do-azul>,containerName=web,containerPort=80`."],
      ["aws ecs create-service --cluster cluster-vitrine --service-name vitrine-web --task-definition vitrine-web --desired-count 2 --deployment-controller type=CODE_DEPLOY --load-balancers targetGroupArn=<tg:tg-vitrine-azul>,containerName=web,containerPort=80"],
      (c) => (servico(c) || {}).controlador === "CODE_DEPLOY"),
    d("cbg-18", S, 3, 70, "Pra onde o tráfego vai hoje?",
      "Confira os listeners do <b>alb-vitrine</b>: a porta 80 manda pro target group azul. Anote o <code>ListenerArn</code> — o CodeDeploy vai precisar dele.",
      ["O comando é `aws elbv2 describe-listeners`.", "Com `--load-balancer-arn`."],
      ["aws elbv2 describe-listeners --load-balancer-arn <lb-vitrine>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "elbv2", "describe-listeners")),
    d("cbg-19", S, 3, 70, "A aplicação de ECS",
      "Crie no CodeDeploy a aplicação <b>vitrine-ecs</b> para a plataforma <b>ECS</b>.",
      ["O mesmo create-application, com `--compute-platform ECS`."],
      ["aws deploy create-application --application-name vitrine-ecs --compute-platform ECS"],
      (c) => ((((c.codedeploy || {}).apps) || {})["vitrine-ecs"] || {}).plataforma === "ECS"),
    d("cbg-20", S, 3, 140, "O grupo blue/green",
      "Crie o grupo <b>vitrine-producao</b> na <b>vitrine-ecs</b>: serviço <b>vitrine-web</b> do <b>cluster-vitrine</b>, os dois target groups (azul e verde), o listener da porta 80, a role <b>" + ROLE + "</b>, configuração <b>CodeDeployDefault.ECSAllAtOnce</b> e — pra dar tempo de testar — o deploy parando em <b>Ready</b> antes de trocar o tráfego.",
      ["São várias flags do create-deployment-group: `--ecs-services serviceName=vitrine-web,clusterName=cluster-vitrine` e `--deployment-style deploymentType=BLUE_GREEN,deploymentOption=WITH_TRAFFIC_CONTROL`.",
        "Os target groups e o listener vão em JSON: `--load-balancer-info '{\"targetGroupPairInfoList\":[{\"targetGroups\":[{\"name\":\"tg-vitrine-azul\"},{\"name\":\"tg-vitrine-verde\"}],\"prodTrafficRoute\":{\"listenerArns\":[\"<listener>\"]}}]}'`.",
        "A parada em Ready: `--blue-green-deployment-configuration '{\"deploymentReadyOption\":{\"actionOnTimeout\":\"STOP_DEPLOYMENT\",\"waitTimeInMinutes\":60}}'`."],
      ["aws deploy create-deployment-group --application-name vitrine-ecs --deployment-group-name vitrine-producao --service-role-arn " + ROLE + " --deployment-config-name CodeDeployDefault.ECSAllAtOnce --deployment-style deploymentType=BLUE_GREEN,deploymentOption=WITH_TRAFFIC_CONTROL --ecs-services serviceName=vitrine-web,clusterName=cluster-vitrine --load-balancer-info " + LBI + " --blue-green-deployment-configuration '{\"deploymentReadyOption\":{\"actionOnTimeout\":\"STOP_DEPLOYMENT\",\"waitTimeInMinutes\":60}}'"],
      (c) => !!(grupoDe(c, "vitrine-ecs", "vitrine-producao") || {}).par),
    d("cbg-f4", S, 3, 70, "A revisão 2 da vitrine",
      "O time mudou o layout da loja. Registre a revisão 2 da <b>vitrine-web</b> (mesmo arquivo — cada registro vira uma revisão nova).",
      ["O mesmo register-task-definition de antes."],
      [registrarTd("vitrine-web")],
      (c) => ((((c.ecs || {}).tarefas) || {})["vitrine-web"] || {}).revisao >= 2),
    d("cbg-21", S, 3, 110, "O verde sobe, o azul atende",
      "Entregue a revisão 2 com <b>revisao-vitrine-v2.json</b> no grupo <b>vitrine-producao</b> e consulte o deploy: ele para em <b>Ready</b> — as tarefas novas estão de pé no verde, e o tráfego AINDA vai pro azul.",
      ["create-deployment com `--revision file://revisao-vitrine-v2.json`.", "Depois, get-deployment."],
      [deployEcs("revisao-vitrine-v2.json"), verDeploy("deploy-id")],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "get-deployment") && deploysDe(c, "vitrine-ecs").some((x) => x.status === "Ready")),
    d("cbg-f5", S, 3, 90, "Os dois lados no ar",
      "Veja o alvo do deploy: dois conjuntos de tarefas, <b>BLUE</b> com 100% do tráfego e <b>GREEN</b> com 0%, cada um no seu target group.",
      ["O alvo de ECS é `cluster-vitrine:vitrine-web`.", "get-deployment-target com `--deployment-id` e `--target-id`."],
      ["aws deploy get-deployment-target --deployment-id <deploy-id> --target-id cluster-vitrine:vitrine-web"],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "get-deployment-target") && flag(cmd, "target-id") === "cluster-vitrine:vitrine-web"),
    d("cbg-22", S, 3, 120, "O QA aprovou: troque o tráfego",
      "O QA testou a versão nova no verde e aprovou. Libere o deploy e acompanhe até terminar.",
      ["Liberar um deploy em Ready é o `aws deploy continue-deployment`, com `--deployment-id`.", "Depois, get-deployment até Succeeded."],
      ["aws deploy continue-deployment --deployment-id <deploy-id>", verDeploy("deploy-id")],
      (c, cmd, ok) => ok && ehCmd(cmd, "deploy", "get-deployment") && deploysDe(c, "vitrine-ecs").some((x) => x.status === "Succeeded")),
    d("cbg-f6", S, 3, 90, "O listener trocou de lado",
      "Confirme no load balancer: a porta 80 agora encaminha pro <b>tg-vitrine-verde</b>. No próximo deploy, ele é o \"azul\".",
      ["O mesmo `aws elbv2 describe-listeners` de antes."],
      ["aws elbv2 describe-listeners --load-balancer-arn <lb-vitrine>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "elbv2", "describe-listeners") && !!listenerNo(c, "tg-vitrine-verde")),
    d("cbg-f7", S, 3, 150, "A revisão 3 não passou no teste",
      "Revisão 3 no ar pra teste: registre a nova task definition, entregue com <b>revisao-vitrine-v3.json</b>, espere o <b>Ready</b> — o QA reprovou. Pare o deploy com rollback e confirme que o tráfego nunca saiu do lado que estava atendendo.",
      ["register-task-definition → create-deployment → get-deployment (Ready).", "stop-deployment com `--auto-rollback-enabled`; depois, elbv2 describe-listeners."],
      [registrarTd("vitrine-web"), deployEcs("revisao-vitrine-v3.json"), verDeploy("deploy-id"),
        "aws deploy stop-deployment --deployment-id <deploy-id> --auto-rollback-enabled",
        "aws elbv2 describe-listeners --load-balancer-arn <lb-vitrine>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "elbv2", "describe-listeners") && !!listenerNo(c, "tg-vitrine-verde") && deploysDe(c, "vitrine-ecs").some((x) => x.status === "Stopped" && !!x.rollback)),
    d("cbg-f8", S, 3, 150, "A revisão 4: os lados se revezam",
    "O time corrigiu o que o QA achou. Registre a revisão 4, entregue com <b>revisao-vitrine-v4.json</b>, espere o <b>Ready</b>, libere depois do teste e acompanhe até terminar. Aí confira o listener: o tráfego voltou pro <b>tg-vitrine-azul</b> — a cada deploy, o lado que estava parado vira o novo.",
    ["register-task-definition → create-deployment → get-deployment (Ready) → continue-deployment → get-deployment.", "No fim, elbv2 describe-listeners."],
    [registrarTd("vitrine-web"), deployEcs("revisao-vitrine-v4.json"), verDeploy("deploy-id"), "aws deploy continue-deployment --deployment-id <deploy-id>", verDeploy("deploy-id"),
      "aws elbv2 describe-listeners --load-balancer-arn <lb-vitrine>"],
    (c, cmd, ok) => ok && ehCmd(cmd, "elbv2", "describe-listeners") && !!listenerNo(c, "tg-vitrine-azul") && deploysDe(c, "vitrine-ecs").some((x) => x.status === "Succeeded" && x.ecs && x.ecs.revisaoNova === 4)),
  ];

  if (!SERVICOS_META.some((s) => s.id === S)) {
    const meta = { id: S, nome: "CodeDeploy: Lambda e ECS", subtitulo: "Blue/green e canary", icone: "🔀" };
    const iCd = SERVICOS_META.findIndex((s) => s.id === "codedeploy");
    const iProj = SERVICOS_META.findIndex((s) => s.id === "projetos");
    if (iCd >= 0) SERVICOS_META.splice(iCd + 1, 0, meta);
    else if (iProj >= 0) SERVICOS_META.splice(iProj, 0, meta);
    else SERVICOS_META.push(meta);
    for (const x of TRILHA) DESAFIOS.push(x);
  }
})();
