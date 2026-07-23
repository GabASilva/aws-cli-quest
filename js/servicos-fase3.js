"use strict";
// ============================================================
// CLImb — servicos-fase3.js
// Fase 3 da expansão: ECR (registro de imagens), ECS (rodar contêineres),
// Secrets Manager (segredos), Step Functions (orquestração) e
// EventBridge (eventos e agendamentos).
//
// Mesmo padrão da fase 1/2: registra em SERVICOS e empurra as trilhas em
// DESAFIOS/SERVICOS_META. Usa os globais do simulador.js (ErroCli, js,
// agoraIso, hexAleatorio, exigirFlag, okSilencioso, ehCmd, arquivoLocal).
// ============================================================
(function () {
  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";

  function estado(conta) {
    conta.ecr = conta.ecr || { repositorios: {} };
    conta.ecs = conta.ecs || { clusters: {}, tarefas: {}, servicos: {} };
    conta.secrets = conta.secrets || { segredos: {} };
    conta.sfn = conta.sfn || { maquinas: {}, execucoes: {} };
    conta.events = conta.events || { regras: {} };
    return conta;
  }
  const NOME_SIMPLES = /^[a-zA-Z0-9._/-]{1,80}$/;

  // Lê um parâmetro que pode vir inline (JSON) ou de um arquivo (file://).
  function lerJson(valor, flag, operacao, padrao) {
    const bruto = String(valor);
    if (bruto.startsWith("file://")) {
      const arq = bruto.slice(7);
      if (!arquivoLocal(arq)) {
        throw new ErroCli(`Error parsing parameter '--${flag}': Unable to load paramfile ${bruto}: arquivo não existe.\nDigite 'ls' pra ver os arquivos do lab.`);
      }
      return padrao; // os arquivos do lab têm conteúdo pronto
    }
    try { return JSON.parse(bruto); }
    catch (e) {
      throw new ErroCli(`Error parsing parameter '--${flag}': Invalid JSON received.\n(${operacao})`);
    }
  }

  // ============================================================
  // ECR — registro de imagens de contêiner
  // ============================================================
  const cmdEcr = {
    "create-repository": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "repository-name");
      if (!NOME_SIMPLES.test(nome)) throw new ErroCli(`An error occurred (InvalidParameterException) when calling the CreateRepository operation: Invalid parameter at 'repositoryName' failed to satisfy constraint`);
      if (conta.ecr.repositorios[nome]) throw new ErroCli(`An error occurred (RepositoryAlreadyExistsException) when calling the CreateRepository operation: The repository with name '${nome}' already exists in the registry with id '${CONTA_ID(conta)}'`);
      const uri = `${CONTA_ID(conta)}.dkr.ecr.${REGIAO(conta)}.amazonaws.com/${nome}`;
      conta.ecr.repositorios[nome] = { nome, uri, criadoEm: agoraIso(), imagens: [] };
      return js({ repository: {
        repositoryArn: `arn:aws:ecr:${REGIAO(conta)}:${CONTA_ID(conta)}:repository/${nome}`,
        registryId: CONTA_ID(conta), repositoryName: nome, repositoryUri: uri,
        createdAt: agoraIso(), imageTagMutability: "MUTABLE",
      } });
    },
    "describe-repositories": (conta) => {
      estado(conta);
      const r = Object.values(conta.ecr.repositorios);
      if (!r.length) { avisarClimb("Nenhum repositório ainda. Crie um com: aws ecr create-repository --repository-name loja-imagens"); return ""; }
      return js({ repositories: r.map((x) => ({
        repositoryName: x.nome, repositoryUri: x.uri, registryId: CONTA_ID(conta), createdAt: x.criadoEm,
      })) });
    },
    "get-login-password": (conta) => {
      estado(conta);
      avisarClimb("Essa senha temporária é usada com o Docker:\n  aws ecr get-login-password | docker login --username AWS --password-stdin " + CONTA_ID(conta) + ".dkr.ecr." + REGIAO(conta) + ".amazonaws.com");
      return "eyJwYXlsb2FkIjoi" + hexAleatorio(40) + "In0=";
    },
    "list-images": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "repository-name");
      const r = conta.ecr.repositorios[nome];
      if (!r) throw new ErroCli(`An error occurred (RepositoryNotFoundException) when calling the ListImages operation: The repository with name '${nome}' does not exist in the registry with id '${CONTA_ID(conta)}'`);
      if (!r.imagens.length) {
        avisarClimb("Repositório vazio — as imagens chegam pelo 'docker push' (fora da AWS CLI). O ECS aponta pra elas pela URI: " + r.uri + ":tag");
        return js({ imageIds: [] });
      }
      return js({ imageIds: r.imagens.map((t) => ({ imageDigest: "sha256:" + hexAleatorio(64), imageTag: t })) });
    },
    "delete-repository": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "repository-name");
      const r = conta.ecr.repositorios[nome];
      if (!r) throw new ErroCli(`An error occurred (RepositoryNotFoundException) when calling the DeleteRepository operation: The repository with name '${nome}' does not exist`);
      if (r.imagens.length && flags.force === undefined) {
        throw new ErroCli(`An error occurred (RepositoryNotEmptyException) when calling the DeleteRepository operation: The repository with name '${nome}' in registry with id '${CONTA_ID(conta)}' cannot be deleted because it still contains images\nUse --force pra apagar junto com as imagens.`);
      }
      delete conta.ecr.repositorios[nome];
      return okSilencioso(`Repositório "${nome}" apagado.`);
    },
  };

  // ============================================================
  // ECS — clusters, task definitions e serviços
  // ============================================================
  const TAREFA_PADRAO = [{ name: "web", image: "nginx:latest", cpu: 256, memory: 512, essential: true }];
  const cmdEcs = {
    "create-cluster": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "cluster-name");
      if (conta.ecs.clusters[nome]) throw new ErroCli(`An error occurred (InvalidParameterException) when calling the CreateCluster operation: Cluster already exists with name ${nome}`);
      conta.ecs.clusters[nome] = { nome, criadoEm: agoraIso(), status: "ACTIVE" };
      return js({ cluster: {
        clusterArn: `arn:aws:ecs:${REGIAO(conta)}:${CONTA_ID(conta)}:cluster/${nome}`,
        clusterName: nome, status: "ACTIVE", runningTasksCount: 0, activeServicesCount: 0,
      } });
    },
    "list-clusters": (conta) => {
      estado(conta);
      const arns = Object.keys(conta.ecs.clusters).map((n) => `arn:aws:ecs:${REGIAO(conta)}:${CONTA_ID(conta)}:cluster/${n}`);
      if (!arns.length) { avisarClimb("Nenhum cluster ainda. Crie um com: aws ecs create-cluster --cluster-name cluster-loja"); return ""; }
      return js({ clusterArns: arns });
    },
    "register-task-definition": (conta, pos, flags) => {
      estado(conta);
      const familia = exigirFlag(flags, "family");
      const defs = lerJson(exigirFlag(flags, "container-definitions"), "container-definitions", "RegisterTaskDefinition", TAREFA_PADRAO);
      if (!Array.isArray(defs) || !defs.length) throw new ErroCli(`An error occurred (ClientException) when calling the RegisterTaskDefinition operation: Container definitions should not be empty`);
      for (const d of defs) {
        if (!d.name || !d.image) throw new ErroCli(`An error occurred (ClientException) when calling the RegisterTaskDefinition operation: Container definition precisa de "name" e "image".`);
      }
      const anterior = conta.ecs.tarefas[familia];
      const revisao = anterior ? anterior.revisao + 1 : 1;
      conta.ecs.tarefas[familia] = { familia, revisao, containers: defs, criadoEm: agoraIso() };
      avisarClimb(`Task definition registrada como ${familia}:${revisao} — cada registro cria uma REVISÃO nova (a anterior continua existindo).`);
      return js({ taskDefinition: {
        taskDefinitionArn: `arn:aws:ecs:${REGIAO(conta)}:${CONTA_ID(conta)}:task-definition/${familia}:${revisao}`,
        family: familia, revision: revisao, status: "ACTIVE",
        containerDefinitions: defs, requiresCompatibilities: ["FARGATE"],
      } });
    },
    "list-task-definitions": (conta) => {
      estado(conta);
      return js({ taskDefinitionArns: Object.values(conta.ecs.tarefas).map((t) =>
        `arn:aws:ecs:${REGIAO(conta)}:${CONTA_ID(conta)}:task-definition/${t.familia}:${t.revisao}`) });
    },
    "create-service": (conta, pos, flags) => {
      estado(conta);
      const cluster = exigirFlag(flags, "cluster");
      const nome = exigirFlag(flags, "service-name");
      const tarefa = exigirFlag(flags, "task-definition");
      if (!conta.ecs.clusters[cluster]) throw new ErroCli(`An error occurred (ClusterNotFoundException) when calling the CreateService operation: Cluster not found.\nCrie antes: aws ecs create-cluster --cluster-name ${cluster}`);
      const familia = String(tarefa).split(":")[0];
      if (!conta.ecs.tarefas[familia]) throw new ErroCli(`An error occurred (ClientException) when calling the CreateService operation: TaskDefinition not found.\nRegistre antes: aws ecs register-task-definition --family ${familia} ...`);
      if (conta.ecs.servicos[nome]) throw new ErroCli(`An error occurred (InvalidParameterException) when calling the CreateService operation: Creation of service was not idempotent.`);
      const desejado = parseInt(flags["desired-count"] || "1", 10);
      conta.ecs.servicos[nome] = { nome, cluster, tarefa: familia, desejado, rodando: desejado, criadoEm: agoraIso() };
      return js({ service: {
        serviceArn: `arn:aws:ecs:${REGIAO(conta)}:${CONTA_ID(conta)}:service/${cluster}/${nome}`,
        serviceName: nome, clusterArn: `arn:aws:ecs:${REGIAO(conta)}:${CONTA_ID(conta)}:cluster/${cluster}`,
        status: "ACTIVE", desiredCount: desejado, runningCount: 0, launchType: "FARGATE",
      } });
    },
    "list-services": (conta, pos, flags) => {
      estado(conta);
      const cluster = flags.cluster;
      const lista = Object.values(conta.ecs.servicos).filter((s) => !cluster || s.cluster === cluster);
      return js({ serviceArns: lista.map((s) => `arn:aws:ecs:${REGIAO(conta)}:${CONTA_ID(conta)}:service/${s.cluster}/${s.nome}`) });
    },
    "describe-services": (conta, pos, flags) => {
      estado(conta);
      const nomes = [].concat(exigirFlag(flags, "services"));
      const lista = nomes.map((n) => conta.ecs.servicos[n]).filter(Boolean);
      return js({ services: lista.map((s) => ({
        serviceName: s.nome, status: "ACTIVE", desiredCount: s.desejado, runningCount: s.rodando,
        taskDefinition: `arn:aws:ecs:${REGIAO(conta)}:${CONTA_ID(conta)}:task-definition/${s.tarefa}`,
      })), failures: [] });
    },
    "update-service": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "service");
      const s = conta.ecs.servicos[nome];
      if (!s) throw new ErroCli(`An error occurred (ServiceNotFoundException) when calling the UpdateService operation: Service not found.`);
      if (flags["desired-count"] !== undefined) {
        s.desejado = parseInt(flags["desired-count"], 10);
        s.rodando = s.desejado;
      }
      return js({ service: { serviceName: s.nome, desiredCount: s.desejado, runningCount: s.rodando, status: "ACTIVE" } });
    },
    "delete-service": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "service");
      const s = conta.ecs.servicos[nome];
      if (!s) throw new ErroCli(`An error occurred (ServiceNotFoundException) when calling the DeleteService operation: Service not found.`);
      if (s.desejado > 0 && flags.force === undefined) {
        throw new ErroCli(`An error occurred (InvalidParameterException) when calling the DeleteService operation: The service cannot be stopped while it is scaled above 0.\nZere antes (--desired-count 0) ou use --force.`);
      }
      delete conta.ecs.servicos[nome];
      return okSilencioso(`Serviço "${nome}" apagado.`);
    },
    "delete-cluster": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "cluster");
      if (!conta.ecs.clusters[nome]) throw new ErroCli(`An error occurred (ClusterNotFoundException) when calling the DeleteCluster operation: Cluster not found.`);
      if (Object.values(conta.ecs.servicos).some((s) => s.cluster === nome)) {
        throw new ErroCli(`An error occurred (ClusterContainsServicesException) when calling the DeleteCluster operation: The Cluster cannot be deleted while Services are active.`);
      }
      delete conta.ecs.clusters[nome];
      return okSilencioso(`Cluster "${nome}" apagado.`);
    },
  };

  // ============================================================
  // Secrets Manager — segredos
  // ============================================================
  function acharSegredo(conta, flags, operacao) {
    estado(conta);
    const id = exigirFlag(flags, "secret-id");
    const s = conta.secrets.segredos[id];
    if (!s) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the ${operacao} operation: Secrets Manager can't find the specified secret.`);
    return s;
  }
  const cmdSecrets = {
    "create-secret": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "name");
      if (conta.secrets.segredos[nome]) throw new ErroCli(`An error occurred (ResourceExistsException) when calling the CreateSecret operation: The operation failed because the secret ${nome} already exists.`);
      const valor = flags["secret-string"] !== undefined ? String(flags["secret-string"]) : "";
      conta.secrets.segredos[nome] = {
        nome, valor, versao: hexAleatorio(8), criadoEm: agoraIso(),
        descricao: flags.description || "", apagandoEm: null,
      };
      return js({
        ARN: `arn:aws:secretsmanager:${REGIAO(conta)}:${CONTA_ID(conta)}:secret:${nome}-${hexAleatorio(6)}`,
        Name: nome, VersionId: conta.secrets.segredos[nome].versao,
      });
    },
    "list-secrets": (conta) => {
      estado(conta);
      const l = Object.values(conta.secrets.segredos);
      if (!l.length) { avisarClimb("Nenhum segredo ainda. Crie um com: aws secretsmanager create-secret --name senha-banco-loja --secret-string ..."); return ""; }
      return js({ SecretList: l.map((s) => ({
        Name: s.nome, Description: s.descricao, CreatedDate: s.criadoEm,
        DeletedDate: s.apagandoEm || undefined,
        ARN: `arn:aws:secretsmanager:${REGIAO(conta)}:${CONTA_ID(conta)}:secret:${s.nome}`,
      })) });
    },
    "get-secret-value": (conta, pos, flags) => {
      const s = acharSegredo(conta, flags, "GetSecretValue");
      if (s.apagandoEm) throw new ErroCli(`An error occurred (InvalidRequestException) when calling the GetSecretValue operation: You can't perform this operation on the secret because it was marked for deletion.`);
      return js({ Name: s.nome, VersionId: s.versao, SecretString: s.valor, CreatedDate: s.criadoEm });
    },
    "update-secret": (conta, pos, flags) => {
      const s = acharSegredo(conta, flags, "UpdateSecret");
      if (flags["secret-string"] !== undefined) { s.valor = String(flags["secret-string"]); s.versao = hexAleatorio(8); }
      if (flags.description !== undefined) s.descricao = String(flags.description);
      avisarClimb("Segredo atualizado: quem lê pelo nome já pega o valor novo — por isso a aplicação nunca precisa de senha no código.");
      return js({ ARN: `arn:aws:secretsmanager:${REGIAO(conta)}:${CONTA_ID(conta)}:secret:${s.nome}`, Name: s.nome, VersionId: s.versao });
    },
    "delete-secret": (conta, pos, flags) => {
      const s = acharSegredo(conta, flags, "DeleteSecret");
      if (flags["force-delete-without-recovery"] !== undefined) {
        delete conta.secrets.segredos[s.nome];
        return js({ ARN: `arn:aws:secretsmanager:${REGIAO(conta)}:${CONTA_ID(conta)}:secret:${s.nome}`, Name: s.nome, DeletionDate: agoraIso() });
      }
      const dias = parseInt(flags["recovery-window-in-days"] || "30", 10);
      s.apagandoEm = new Date(Date.now() + dias * 86400000).toISOString();
      avisarClimb(`Marcado pra apagar em ${dias} dias — dá pra desfazer com 'aws secretsmanager restore-secret'. É a rede de proteção do Secrets Manager.`);
      return js({ ARN: `arn:aws:secretsmanager:${REGIAO(conta)}:${CONTA_ID(conta)}:secret:${s.nome}`, Name: s.nome, DeletionDate: s.apagandoEm });
    },
    "restore-secret": (conta, pos, flags) => {
      const s = acharSegredo(conta, flags, "RestoreSecret");
      s.apagandoEm = null;
      return js({ ARN: `arn:aws:secretsmanager:${REGIAO(conta)}:${CONTA_ID(conta)}:secret:${s.nome}`, Name: s.nome });
    },
  };

  // ============================================================
  // Step Functions — orquestração
  // ============================================================
  const MAQUINA_PADRAO = {
    Comment: "Fluxo de pedido",
    StartAt: "ValidarPedido",
    States: {
      ValidarPedido: { Type: "Pass", Next: "CobrarCartao" },
      CobrarCartao: { Type: "Pass", Next: "Concluir" },
      Concluir: { Type: "Succeed" },
    },
  };
  function acharMaquina(conta, flags, operacao) {
    estado(conta);
    const arn = exigirFlag(flags, "state-machine-arn");
    const nome = String(arn).split(":").pop();
    const m = conta.sfn.maquinas[nome];
    if (!m) throw new ErroCli(`An error occurred (StateMachineDoesNotExist) when calling the ${operacao} operation: State Machine Does Not Exist: '${arn}'\nDica: veja os ARNs com 'aws stepfunctions list-state-machines'.`);
    return m;
  }
  const cmdSfn = {
    "create-state-machine": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "name");
      const def = lerJson(exigirFlag(flags, "definition"), "definition", "CreateStateMachine", MAQUINA_PADRAO);
      exigirFlag(flags, "role-arn");
      if (!def.StartAt || !def.States) throw new ErroCli(`An error occurred (InvalidDefinition) when calling the CreateStateMachine operation: Invalid State Machine Definition: 'MISSING_REQUIRED_FIELD: StartAt/States'`);
      if (!def.States[def.StartAt]) throw new ErroCli(`An error occurred (InvalidDefinition) when calling the CreateStateMachine operation: MISSING_TRANSITION_TARGET: State '${def.StartAt}' não existe em States.`);
      if (conta.sfn.maquinas[nome]) throw new ErroCli(`An error occurred (StateMachineAlreadyExists) when calling the CreateStateMachine operation: State Machine Already Exists`);
      const arn = `arn:aws:states:${REGIAO(conta)}:${CONTA_ID(conta)}:stateMachine:${nome}`;
      conta.sfn.maquinas[nome] = { nome, arn, definicao: def, criadoEm: agoraIso(), role: String(flags["role-arn"]) };
      avisarClimb(`Máquina criada com ${Object.keys(def.States).length} estados. O Step Functions guarda em qual passo cada execução parou — se um falhar, você vê exatamente onde.`);
      return js({ stateMachineArn: arn, creationDate: agoraIso() });
    },
    "list-state-machines": (conta) => {
      estado(conta);
      const l = Object.values(conta.sfn.maquinas);
      if (!l.length) { avisarClimb("Nenhuma máquina de estados ainda. Crie uma com: aws stepfunctions create-state-machine ..."); return ""; }
      return js({ stateMachines: l.map((m) => ({ stateMachineArn: m.arn, name: m.nome, type: "STANDARD", creationDate: m.criadoEm })) });
    },
    "describe-state-machine": (conta, pos, flags) => {
      const m = acharMaquina(conta, flags, "DescribeStateMachine");
      return js({ stateMachineArn: m.arn, name: m.nome, status: "ACTIVE", definition: JSON.stringify(m.definicao), roleArn: m.role, type: "STANDARD" });
    },
    "start-execution": (conta, pos, flags) => {
      const m = acharMaquina(conta, flags, "StartExecution");
      const nomeExec = flags.name || "exec-" + hexAleatorio(6);
      const arn = `arn:aws:states:${REGIAO(conta)}:${CONTA_ID(conta)}:execution:${m.nome}:${nomeExec}`;
      const passos = Object.keys(m.definicao.States);
      conta.sfn.execucoes[arn] = {
        arn, maquina: m.nome, nome: nomeExec, entrada: flags.input ? String(flags.input) : "{}",
        status: "SUCCEEDED", passos, iniciadoEm: agoraIso(),
      };
      return js({ executionArn: arn, startDate: agoraIso() });
    },
    "list-executions": (conta, pos, flags) => {
      const m = acharMaquina(conta, flags, "ListExecutions");
      return js({ executions: Object.values(conta.sfn.execucoes).filter((e) => e.maquina === m.nome).map((e) => ({
        executionArn: e.arn, stateMachineArn: m.arn, name: e.nome, status: e.status, startDate: e.iniciadoEm,
      })) });
    },
    "describe-execution": (conta, pos, flags) => {
      estado(conta);
      const arn = exigirFlag(flags, "execution-arn");
      const e = conta.sfn.execucoes[arn];
      if (!e) throw new ErroCli(`An error occurred (ExecutionDoesNotExist) when calling the DescribeExecution operation: Execution Does Not Exist: '${arn}'`);
      return js({ executionArn: e.arn, name: e.nome, status: e.status, input: e.entrada,
        output: JSON.stringify({ passos: e.passos }), startDate: e.iniciadoEm, stopDate: agoraIso() });
    },
    "delete-state-machine": (conta, pos, flags) => {
      const m = acharMaquina(conta, flags, "DeleteStateMachine");
      delete conta.sfn.maquinas[m.nome];
      return okSilencioso(`Máquina de estados "${m.nome}" apagada.`);
    },
  };

  // ============================================================
  // EventBridge — regras, agendamentos e alvos (aws events)
  // ============================================================
  function acharRegra(conta, flags, operacao, nomeFlag) {
    estado(conta);
    const nome = exigirFlag(flags, nomeFlag || "name");
    const r = conta.events.regras[nome];
    if (!r) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the ${operacao} operation: Rule ${nome} does not exist.`);
    return r;
  }
  const cmdEvents = {
    "put-rule": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "name");
      const agenda = flags["schedule-expression"];
      const padrao = flags["event-pattern"];
      if (!agenda && !padrao) {
        throw new ErroCli(`An error occurred (ValidationException) when calling the PutRule operation: Parameter(s) ScheduleExpression or EventPattern must be specified.\nEx.: --schedule-expression "rate(1 day)" ou --schedule-expression "cron(0 3 * * ? *)"`);
      }
      if (agenda && !/^(rate\(.+\)|cron\(.+\))$/.test(String(agenda))) {
        throw new ErroCli(`An error occurred (ValidationException) when calling the PutRule operation: Parameter ScheduleExpression is not valid.\nFormatos: rate(5 minutes) | rate(1 day) | cron(0 3 * * ? *)`);
      }
      const existente = conta.events.regras[nome];
      conta.events.regras[nome] = {
        nome, agenda: agenda ? String(agenda) : null, padrao: padrao ? String(padrao) : null,
        estado: flags.state ? String(flags.state) : (existente ? existente.estado : "ENABLED"),
        alvos: existente ? existente.alvos : [], criadoEm: existente ? existente.criadoEm : agoraIso(),
      };
      return js({ RuleArn: `arn:aws:events:${REGIAO(conta)}:${CONTA_ID(conta)}:rule/${nome}` });
    },
    "list-rules": (conta) => {
      estado(conta);
      const l = Object.values(conta.events.regras);
      if (!l.length) { avisarClimb('Nenhuma regra ainda. Crie uma com: aws events put-rule --name limpeza-noturna --schedule-expression "rate(1 day)"'); return ""; }
      return js({ Rules: l.map((r) => ({
        Name: r.nome, Arn: `arn:aws:events:${REGIAO(conta)}:${CONTA_ID(conta)}:rule/${r.nome}`,
        ScheduleExpression: r.agenda || undefined, EventPattern: r.padrao || undefined, State: r.estado,
      })) });
    },
    "describe-rule": (conta, pos, flags) => {
      const r = acharRegra(conta, flags, "DescribeRule");
      return js({ Name: r.nome, Arn: `arn:aws:events:${REGIAO(conta)}:${CONTA_ID(conta)}:rule/${r.nome}`,
        ScheduleExpression: r.agenda || undefined, EventPattern: r.padrao || undefined, State: r.estado });
    },
    "put-targets": (conta, pos, flags) => {
      const r = acharRegra(conta, flags, "PutTargets", "rule");
      const alvos = lerJson(exigirFlag(flags, "targets"), "targets", "PutTargets", [{ Id: "1", Arn: "arn:aws:lambda:us-east-1:123456789012:function:limpeza" }]);
      const lista = [].concat(alvos);
      for (const a of lista) {
        if (!a.Id || !a.Arn) throw new ErroCli(`An error occurred (ValidationException) when calling the PutTargets operation: Parameter(s) Target.Id and Target.Arn are required.\nEx.: --targets '[{"Id":"1","Arn":"arn:aws:lambda:...:function:limpeza"}]'`);
        const i = r.alvos.findIndex((x) => x.Id === a.Id);
        if (i >= 0) r.alvos[i] = a; else r.alvos.push(a);
      }
      return js({ FailedEntryCount: 0, FailedEntries: [] });
    },
    "list-targets-by-rule": (conta, pos, flags) => {
      const r = acharRegra(conta, flags, "ListTargetsByRule", "rule");
      return js({ Targets: r.alvos });
    },
    "remove-targets": (conta, pos, flags) => {
      const r = acharRegra(conta, flags, "RemoveTargets", "rule");
      const ids = [].concat(exigirFlag(flags, "ids")).map(String);
      r.alvos = r.alvos.filter((a) => !ids.includes(String(a.Id)));
      return js({ FailedEntryCount: 0, FailedEntries: [] });
    },
    "disable-rule": (conta, pos, flags) => {
      const r = acharRegra(conta, flags, "DisableRule");
      r.estado = "DISABLED";
      return okSilencioso(`Regra "${r.nome}" desabilitada (para de disparar, mas continua existindo).`);
    },
    "enable-rule": (conta, pos, flags) => {
      const r = acharRegra(conta, flags, "EnableRule");
      r.estado = "ENABLED";
      return okSilencioso(`Regra "${r.nome}" habilitada.`);
    },
    "delete-rule": (conta, pos, flags) => {
      const r = acharRegra(conta, flags, "DeleteRule");
      if (r.alvos.length && flags.force === undefined) {
        throw new ErroCli(`An error occurred (ValidationException) when calling the DeleteRule operation: Rule can't be deleted since it has targets.\nRemova antes: aws events remove-targets --rule ${r.nome} --ids 1`);
      }
      delete conta.events.regras[r.nome];
      return okSilencioso(`Regra "${r.nome}" apagada.`);
    },
  };

  // ---------- Registro no motor ----------
  if (typeof SERVICOS !== "undefined") {
    SERVICOS.ecr = cmdEcr;
    SERVICOS.ecs = cmdEcs;
    SERVICOS.secretsmanager = cmdSecrets;
    SERVICOS.stepfunctions = cmdSfn;
    SERVICOS.events = cmdEvents;
  }
  // arquivos prontos no "disco" do lab (o conteúdo real vai em
  // ARQUIVOS_CONTEUDO pra o 'cat' mostrar o JSON de verdade, não um placeholder)
  if (typeof ARQUIVOS_LOCAIS !== "undefined") {
    if (!ARQUIVOS_LOCAIS["tarefa-web.json"]) ARQUIVOS_LOCAIS["tarefa-web.json"] = 214;
    if (!ARQUIVOS_LOCAIS["maquina-estados.json"]) ARQUIVOS_LOCAIS["maquina-estados.json"] = 342;
  }
  if (typeof window !== "undefined") {
    window.ARQUIVOS_CONTEUDO = window.ARQUIVOS_CONTEUDO || {};
    window.ARQUIVOS_CONTEUDO["tarefa-web.json"] = JSON.stringify(TAREFA_PADRAO, null, 2) + "\n";
    window.ARQUIVOS_CONTEUDO["maquina-estados.json"] = JSON.stringify(MAQUINA_PADRAO, null, 2) + "\n";
  }

  // ============================================================
  // Trilhas
  // ============================================================
  const ARN_MAQUINA = "arn:aws:states:us-east-1:123456789012:stateMachine:pedido-fluxo";

  const DESAFIOS_FASE3 = [
    // ===================== ECR =====================
    { id: "ecr-1", servico: "ecr", nivel: 1, xp: 50, titulo: "O armário de imagens",
      descricao: "Antes de rodar um contêiner na AWS, a <b>imagem</b> dele precisa estar guardada em algum lugar — esse lugar é o <b>ECR</b>. Comece listando os repositórios.",
      dicas: ["aws ecr describe-repositories"], solucao: ["aws ecr describe-repositories"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "describe-repositories") },
    { id: "ecr-2", servico: "ecr", nivel: 1, xp: 70, titulo: "Crie o repositório",
      descricao: "Crie o repositório <b>loja-imagens</b> (é onde a imagem da aplicação vai morar).",
      dicas: ["aws ecr create-repository --repository-name loja-imagens", "Repare na repositoryUri que volta — é ela que o ECS usa depois."],
      solucao: ["aws ecr create-repository --repository-name loja-imagens"],
      validar: (c) => !!(c.ecr && c.ecr.repositorios["loja-imagens"]) },
    { id: "ecr-3", servico: "ecr", nivel: 2, xp: 70, titulo: "A senha do Docker",
      descricao: "Pra enviar imagem, o Docker precisa se autenticar no ECR. Peça a <b>senha temporária</b> de login. <small>(na vida real você liga isso com <code>| docker login</code>)</small>",
      dicas: ["aws ecr get-login-password"], solucao: ["aws ecr get-login-password"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "get-login-password") },
    { id: "ecr-4", servico: "ecr", nivel: 2, xp: 60, titulo: "Quais imagens estão lá?",
      descricao: "Liste as <b>imagens</b> do repositório <b>loja-imagens</b>.",
      dicas: ["aws ecr list-images --repository-name loja-imagens"],
      solucao: ["aws ecr list-images --repository-name loja-imagens"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "list-images") },
    { id: "ecr-5", servico: "ecr", nivel: 3, xp: 70, titulo: "Devolva o armário",
      descricao: "Projeto encerrado: <b>apague</b> o repositório <b>loja-imagens</b>.",
      dicas: ["aws ecr delete-repository --repository-name loja-imagens"],
      solucao: ["aws ecr delete-repository --repository-name loja-imagens"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "delete-repository") && !(c.ecr && c.ecr.repositorios["loja-imagens"]) },

    // ===================== ECS =====================
    { id: "ecs-1", servico: "ecs", nivel: 1, xp: 50, titulo: "Onde os contêineres rodam",
      descricao: "O <b>cluster</b> do ECS é o lugar onde seus contêineres rodam. Liste os clusters da conta.",
      dicas: ["aws ecs list-clusters"], solucao: ["aws ecs list-clusters"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "list-clusters") },
    { id: "ecs-2", servico: "ecs", nivel: 1, xp: 70, titulo: "Crie o cluster da loja",
      descricao: "Crie o cluster <b>cluster-loja</b>.",
      dicas: ["aws ecs create-cluster --cluster-name cluster-loja"],
      solucao: ["aws ecs create-cluster --cluster-name cluster-loja"],
      validar: (c) => !!(c.ecs && c.ecs.clusters["cluster-loja"]) },
    { id: "ecs-3", servico: "ecs", nivel: 2, xp: 90, titulo: "A receita do contêiner",
      descricao: "A <b>task definition</b> é a receita: qual imagem rodar, com quanta memória. Registre a família <b>tarefa-web</b> usando o arquivo pronto <b>file://tarefa-web.json</b>. <small>(espie com <code>cat tarefa-web.json</code>)</small>",
      dicas: ["aws ecs register-task-definition --family tarefa-web --container-definitions file://tarefa-web.json"],
      solucao: ["aws ecs register-task-definition --family tarefa-web --container-definitions file://tarefa-web.json"],
      validar: (c) => !!(c.ecs && c.ecs.tarefas["tarefa-web"]) },
    { id: "ecs-4", servico: "ecs", nivel: 2, xp: 90, titulo: "Coloque no ar (serviço)",
      descricao: "O <b>serviço</b> mantém N cópias da tarefa rodando pra sempre. Crie o serviço <b>servico-web</b> no cluster, com a tarefa <b>tarefa-web</b> e <b>2</b> cópias.",
      dicas: ["aws ecs create-service --cluster cluster-loja --service-name servico-web --task-definition tarefa-web --desired-count 2"],
      solucao: ["aws ecs create-service --cluster cluster-loja --service-name servico-web --task-definition tarefa-web --desired-count 2"],
      validar: (c) => { const s = c.ecs && c.ecs.servicos["servico-web"]; return !!s && s.desejado === 2; } },
    { id: "ecs-5", servico: "ecs", nivel: 2, xp: 60, titulo: "Confira o serviço",
      descricao: "Veja os detalhes do <b>servico-web</b> (quantas cópias estão rodando).",
      dicas: ["aws ecs describe-services --cluster cluster-loja --services servico-web"],
      solucao: ["aws ecs describe-services --cluster cluster-loja --services servico-web"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "describe-services") },
    { id: "ecs-6", servico: "ecs", nivel: 3, xp: 90, titulo: "Black Friday: escale pra 5",
      descricao: "O tráfego triplicou. <b>Atualize</b> o serviço pra manter <b>5</b> cópias rodando.",
      dicas: ["aws ecs update-service --cluster cluster-loja --service servico-web --desired-count 5"],
      solucao: ["aws ecs update-service --cluster cluster-loja --service servico-web --desired-count 5"],
      validar: (c) => { const s = c.ecs && c.ecs.servicos["servico-web"]; return !!s && s.desejado === 5; } },
    { id: "ecs-7", servico: "ecs", nivel: 3, xp: 90, titulo: "Desligue o serviço",
      descricao: "Fim da promoção. <b>Zere</b> o serviço (--desired-count 0) e depois <b>apague</b> ele. <small>(a AWS não deixa apagar serviço com cópias no ar)</small>",
      dicas: ["Primeiro: aws ecs update-service --cluster cluster-loja --service servico-web --desired-count 0",
        "Depois: aws ecs delete-service --cluster cluster-loja --service servico-web"],
      solucao: ["aws ecs update-service --cluster cluster-loja --service servico-web --desired-count 0",
        "aws ecs delete-service --cluster cluster-loja --service servico-web"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "delete-service") && !(c.ecs && c.ecs.servicos["servico-web"]) },
    { id: "ecs-8", servico: "ecs", nivel: 3, xp: 70, titulo: "Feche o cluster",
      descricao: "Com o serviço fora, <b>apague</b> o cluster <b>cluster-loja</b>.",
      dicas: ["aws ecs delete-cluster --cluster cluster-loja"],
      solucao: ["aws ecs delete-cluster --cluster cluster-loja"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "delete-cluster") && !(c.ecs && c.ecs.clusters["cluster-loja"]) },

    // ===================== Secrets Manager =====================
    { id: "sec-1", servico: "secretsmanager", nivel: 1, xp: 50, titulo: "Segredos guardados",
      descricao: "Senha no código é pedido de vazamento. O <b>Secrets Manager</b> guarda e entrega o segredo só pra quem tem permissão. Liste os segredos da conta.",
      dicas: ["aws secretsmanager list-secrets"], solucao: ["aws secretsmanager list-secrets"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "secretsmanager", "list-secrets") },
    { id: "sec-2", servico: "secretsmanager", nivel: 1, xp: 70, titulo: "Guarde a senha do banco",
      descricao: "Crie o segredo <b>senha-banco-loja</b> com o valor <b>troque-me-123</b>.",
      dicas: ["aws secretsmanager create-secret --name senha-banco-loja --secret-string troque-me-123"],
      solucao: ["aws secretsmanager create-secret --name senha-banco-loja --secret-string troque-me-123"],
      validar: (c) => !!(c.secrets && c.secrets.segredos["senha-banco-loja"]) },
    { id: "sec-3", servico: "secretsmanager", nivel: 2, xp: 70, titulo: "Leia o segredo",
      descricao: "É assim que a aplicação pega a senha em tempo de execução: <b>recupere o valor</b> do segredo.",
      dicas: ["aws secretsmanager get-secret-value --secret-id senha-banco-loja"],
      solucao: ["aws secretsmanager get-secret-value --secret-id senha-banco-loja"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "secretsmanager", "get-secret-value") },
    { id: "sec-4", servico: "secretsmanager", nivel: 2, xp: 80, titulo: "Troque a senha",
      descricao: "Vazou! <b>Atualize</b> o segredo pro valor <b>senha-nova-2026</b>. Repare: a aplicação continua lendo pelo mesmo nome e já pega a nova.",
      dicas: ["aws secretsmanager update-secret --secret-id senha-banco-loja --secret-string senha-nova-2026"],
      solucao: ["aws secretsmanager update-secret --secret-id senha-banco-loja --secret-string senha-nova-2026"],
      validar: (c) => { const s = c.secrets && c.secrets.segredos["senha-banco-loja"]; return !!s && s.valor === "senha-nova-2026"; } },
    { id: "sec-5", servico: "secretsmanager", nivel: 3, xp: 90, titulo: "Apagar (com rede de proteção)",
      descricao: "Marque o segredo pra ser apagado em <b>7</b> dias (<b>--recovery-window-in-days 7</b>). Ele NÃO some na hora — é a proteção contra apagar sem querer.",
      dicas: ["aws secretsmanager delete-secret --secret-id senha-banco-loja --recovery-window-in-days 7"],
      solucao: ["aws secretsmanager delete-secret --secret-id senha-banco-loja --recovery-window-in-days 7"],
      validar: (c) => { const s = c.secrets && c.secrets.segredos["senha-banco-loja"]; return !!s && !!s.apagandoEm; } },
    { id: "sec-6", servico: "secretsmanager", nivel: 3, xp: 80, titulo: "Ops, era usado ainda!",
      descricao: "Descobriram que o segredo ainda estava em uso. <b>Restaure</b> ele antes que a janela acabe.",
      dicas: ["aws secretsmanager restore-secret --secret-id senha-banco-loja"],
      solucao: ["aws secretsmanager restore-secret --secret-id senha-banco-loja"],
      validar: (c) => { const s = c.secrets && c.secrets.segredos["senha-banco-loja"]; return !!s && !s.apagandoEm; } },

    // ===================== Step Functions =====================
    { id: "sfn-1", servico: "stepfunctions", nivel: 1, xp: 50, titulo: "Fluxos de trabalho",
      descricao: "Quando um processo tem vários passos (validar ➜ cobrar ➜ enviar), o <b>Step Functions</b> orquestra e mostra onde parou se algo falhar. Liste as máquinas de estados.",
      dicas: ["aws stepfunctions list-state-machines"], solucao: ["aws stepfunctions list-state-machines"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "stepfunctions", "list-state-machines") },
    { id: "sfn-2", servico: "stepfunctions", nivel: 2, xp: 100, titulo: "Monte o fluxo do pedido",
      descricao: "Crie a máquina <b>pedido-fluxo</b> com a definição pronta <b>file://maquina-estados.json</b> e a role <b>arn:aws:iam::123456789012:role/papel-lambda</b>. <small>(veja os passos com <code>cat maquina-estados.json</code>)</small>",
      dicas: ["aws stepfunctions create-state-machine --name pedido-fluxo --definition file://maquina-estados.json --role-arn arn:aws:iam::123456789012:role/papel-lambda"],
      solucao: ["aws stepfunctions create-state-machine --name pedido-fluxo --definition file://maquina-estados.json --role-arn arn:aws:iam::123456789012:role/papel-lambda"],
      validar: (c) => !!(c.sfn && c.sfn.maquinas["pedido-fluxo"]) },
    { id: "sfn-3", servico: "stepfunctions", nivel: 2, xp: 70, titulo: "Veja a receita",
      descricao: "Mostre os detalhes da máquina <b>pedido-fluxo</b> (a definição inteira volta no JSON).",
      dicas: [`aws stepfunctions describe-state-machine --state-machine-arn ${ARN_MAQUINA}`],
      solucao: [`aws stepfunctions describe-state-machine --state-machine-arn ${ARN_MAQUINA}`],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "stepfunctions", "describe-state-machine") },
    { id: "sfn-4", servico: "stepfunctions", nivel: 3, xp: 100, titulo: "Rode o fluxo",
      descricao: "<b>Inicie uma execução</b> da máquina passando o pedido como entrada: <b>--input '{\"pedido\":1001}'</b>.",
      dicas: [`aws stepfunctions start-execution --state-machine-arn ${ARN_MAQUINA} --input '{"pedido":1001}'`],
      solucao: [`aws stepfunctions start-execution --state-machine-arn ${ARN_MAQUINA} --input '{"pedido":1001}'`],
      validar: (c) => !!(c.sfn && Object.values(c.sfn.execucoes).some((e) => e.maquina === "pedido-fluxo")) },
    { id: "sfn-5", servico: "stepfunctions", nivel: 3, xp: 80, titulo: "Histórico de execuções",
      descricao: "Liste as <b>execuções</b> da máquina (é aqui que você vê o que rodou e o que falhou).",
      dicas: [`aws stepfunctions list-executions --state-machine-arn ${ARN_MAQUINA}`],
      solucao: [`aws stepfunctions list-executions --state-machine-arn ${ARN_MAQUINA}`],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "stepfunctions", "list-executions") },
    { id: "sfn-6", servico: "stepfunctions", nivel: 3, xp: 80, titulo: "Desmonte o fluxo",
      descricao: "<b>Apague</b> a máquina de estados <b>pedido-fluxo</b>.",
      dicas: [`aws stepfunctions delete-state-machine --state-machine-arn ${ARN_MAQUINA}`],
      solucao: [`aws stepfunctions delete-state-machine --state-machine-arn ${ARN_MAQUINA}`],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "stepfunctions", "delete-state-machine") && !(c.sfn && c.sfn.maquinas["pedido-fluxo"]) },

    // ===================== EventBridge =====================
    { id: "eb-1", servico: "events", nivel: 1, xp: 50, titulo: "O despertador da nuvem",
      descricao: "O <b>EventBridge</b> dispara coisas na hora certa (agendamento) ou quando algo acontece (evento). Liste as <b>regras</b> da conta. <small>(o serviço na CLI chama <code>aws events</code>)</small>",
      dicas: ["aws events list-rules"], solucao: ["aws events list-rules"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "events", "list-rules") },
    { id: "eb-2", servico: "events", nivel: 2, xp: 80, titulo: "Agende a limpeza diária",
      descricao: "Crie a regra <b>limpeza-noturna</b> que dispara <b>1 vez por dia</b> (<b>--schedule-expression \"rate(1 day)\"</b>).",
      dicas: ['aws events put-rule --name limpeza-noturna --schedule-expression "rate(1 day)"'],
      solucao: ['aws events put-rule --name limpeza-noturna --schedule-expression "rate(1 day)"'],
      validar: (c) => { const r = c.events && c.events.regras["limpeza-noturna"]; return !!r && /rate\(1 day\)/.test(r.agenda || ""); } },
    { id: "eb-3", servico: "events", nivel: 2, xp: 90, titulo: "Quem é chamado?",
      descricao: "Regra sem <b>alvo</b> não faz nada. Aponte a regra pra uma função Lambda com <b>--targets</b>.",
      dicas: [`aws events put-targets --rule limpeza-noturna --targets '[{"Id":"1","Arn":"arn:aws:lambda:us-east-1:123456789012:function:limpeza"}]'`],
      solucao: [`aws events put-targets --rule limpeza-noturna --targets '[{"Id":"1","Arn":"arn:aws:lambda:us-east-1:123456789012:function:limpeza"}]'`],
      validar: (c) => { const r = c.events && c.events.regras["limpeza-noturna"]; return !!r && r.alvos.length > 0; } },
    { id: "eb-4", servico: "events", nivel: 2, xp: 60, titulo: "Confirme o alvo",
      descricao: "Liste os <b>alvos</b> da regra <b>limpeza-noturna</b>.",
      dicas: ["aws events list-targets-by-rule --rule limpeza-noturna"],
      solucao: ["aws events list-targets-by-rule --rule limpeza-noturna"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "events", "list-targets-by-rule") },
    { id: "eb-5", servico: "events", nivel: 3, xp: 80, titulo: "Pause sem apagar",
      descricao: "A limpeza vai ficar suspensa nas férias. <b>Desabilite</b> a regra (ela continua existindo, só para de disparar).",
      dicas: ["aws events disable-rule --name limpeza-noturna"],
      solucao: ["aws events disable-rule --name limpeza-noturna"],
      validar: (c) => { const r = c.events && c.events.regras["limpeza-noturna"]; return !!r && r.estado === "DISABLED"; } },
    { id: "eb-6", servico: "events", nivel: 3, xp: 90, titulo: "Remova a regra de vez",
      descricao: "Tire o alvo e depois <b>apague</b> a regra. <small>(a AWS recusa apagar regra que ainda tem alvo)</small>",
      dicas: ["Primeiro: aws events remove-targets --rule limpeza-noturna --ids 1",
        "Depois: aws events delete-rule --name limpeza-noturna"],
      solucao: ["aws events remove-targets --rule limpeza-noturna --ids 1",
        "aws events delete-rule --name limpeza-noturna"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "events", "delete-rule") && !(c.events && c.events.regras["limpeza-noturna"]) },
  ];

  // ---------- Registro das trilhas ----------
  if (typeof SERVICOS_META !== "undefined" && typeof DESAFIOS !== "undefined") {
    const metas = [
      { id: "ecr", nome: "ECR", subtitulo: "Registro de imagens", icone: "🐳" },
      { id: "ecs", nome: "ECS", subtitulo: "Rodar contêineres", icone: "🚢" },
      { id: "secretsmanager", nome: "Secrets Manager", subtitulo: "Senhas e segredos", icone: "🔐" },
      { id: "stepfunctions", nome: "Step Functions", subtitulo: "Orquestração de passos", icone: "🔀" },
      { id: "events", nome: "EventBridge", subtitulo: "Eventos e agendamentos", icone: "⏰" },
    ];
    if (!SERVICOS_META.some((s) => s.id === "ecr")) {
      for (const m of metas) {
        const iProj = SERVICOS_META.findIndex((s) => s.id === "projetos");
        if (iProj >= 0) SERVICOS_META.splice(iProj, 0, m); else SERVICOS_META.push(m);
      }
      for (const d of DESAFIOS_FASE3) DESAFIOS.push(d);
    }
  }
})();
