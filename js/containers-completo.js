"use strict";
// ============================================================
// CLImb — containers-completo.js
// ECS, ECR e EKS na mesma leva, porque na vaga eles vem juntos: "orquestradores
// de containers (EKS, ECS)" e o requisito literal, e a rotina de deploy e uma
// so — build, push no ECR, task definition nova, update no service.
//
// Esta e a trilha de melhor retorno do levantamento (ver
// [[trilhas-por-profissao]]): alta demanda e a MENOR em numero de comandos.
//
// O que entra, e por que:
//
//   ECS RUN-TASK — tarefa avulsa, que e como se roda migracao de banco, job
//        noturno e script pontual. Diferente do service, que mantem N de pe.
//   ECS EXECUTE-COMMAND — "entrar no container" sem SSH. E o Session Manager
//        do container, e a resposta pro chamado "preciso ver o que ta lá dentro".
//   ECS DESCRIBE-TASKS / STOP-TASK — por que a tarefa morreu. O campo
//        stoppedReason é onde mora a resposta, e quase ninguem sabe olhar.
//   ECR BATCH-DELETE-IMAGE — registro cresce pra sempre e ninguem vigia; e
//        custo silencioso. Junto com a politica de ciclo de vida do repo.
//   ECR SET-REPOSITORY-POLICY — soltar o repo pra outra conta, que e o caso
//        real de empresa com conta separada por ambiente.
//   EKS UPDATE-NODEGROUP-CONFIG e UPDATE-CLUSTER-VERSION — escalar e
//        atualizar. Upgrade de cluster e assunto de vaga senior.
//
// CARREGA DEPOIS de desafios.js, dos servicos-fase3/4 e do ecr-completo.js.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.ecs || !SERVICOS.eks) return;

  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";

  function st(conta) {
    conta.ecs = conta.ecs || { clusters: {}, tarefas: {}, servicos: {} };
    conta.ecs.execucoes = conta.ecs.execucoes || {};
    conta.ecr = conta.ecr || { repositorios: {} };
    conta.eks = conta.eks || { clusters: {}, nodegroups: {} };
    return conta;
  }
  function clusterDe(conta, flags, op, chaveFlag) {
    st(conta);
    const nome = String(flags[chaveFlag || "cluster"] || "default");
    const c = conta.ecs.clusters[nome];
    if (!c) {
      throw new ErroCli(
        "An error occurred (ClusterNotFoundException) when calling the " + op + " operation: Cluster not found.\n" +
        "Crie antes: aws ecs create-cluster --cluster-name " + nome
      );
    }
    return [nome, c];
  }
  function repoDe(conta, flags, op) {
    st(conta);
    const nome = String(exigirFlag(flags, "repository-name"));
    const r = conta.ecr.repositorios[nome];
    if (!r) {
      throw new ErroCli("An error occurred (RepositoryNotFoundException) when calling the " + op + " operation: The repository with name '" + nome + "' does not exist in the registry with id '" + CONTA_ID(conta) + "'");
    }
    r.imagens = r.imagens || [];
    return [nome, r];
  }
  function lista(valor, pos, filtro) {
    return String(valor === undefined ? "" : valor)
      .split(/[,\s]+/).filter(Boolean)
      .concat((pos || []).map(String).filter((x) => (filtro ? filtro.test(x) : true)));
  }
  function campo(texto, nome) {
    const m = String(texto).match(new RegExp(nome + "[^A-Za-z0-9_-]+([A-Za-z0-9_.:/-]+)"));
    return m ? m[1] : "";
  }
  // A familia pode vir como "nome" ou "nome:revisao"
  function tarefaDe(conta, valor, op) {
    st(conta);
    const familia = String(valor).split(":")[0];
    const t = conta.ecs.tarefas[familia];
    if (!t) {
      throw new ErroCli(
        "An error occurred (ClientException) when calling the " + op + " operation: Unable to describe task definition.\n" +
        "Registre antes: aws ecs register-task-definition --family " + familia + " --container-definitions ..."
      );
    }
    return [familia, t];
  }

  Object.assign(SERVICOS.ecs, {
    // ---------- tarefa avulsa: migração, job, script ----------
    "run-task": (conta, pos, flags) => {
      const [nomeCluster] = clusterDe(conta, flags, "RunTask");
      const [familia, td] = tarefaDe(conta, exigirFlag(flags, "task-definition"), "RunTask");
      const quantidade = Number(flags.count || 1);
      const tipo = flags["launch-type"] ? String(flags["launch-type"]) : "EC2";
      if (["EC2", "FARGATE", "EXTERNAL"].indexOf(tipo) < 0) {
        throw new ErroCli("An error occurred (InvalidParameterException) when calling the RunTask operation: launch type inválido: " + tipo + ". Use EC2, FARGATE ou EXTERNAL.");
      }
      const criadas = [];
      for (let i = 0; i < quantidade; i++) {
        const id = hexAleatorio(32);
        conta.ecs.execucoes[id] = {
          id: id, cluster: nomeCluster, familia: familia, revisao: td.revisao,
          tipo: tipo, estado: "RUNNING", exec: flags["enable-execute-command"] !== undefined,
          comecouEm: new Date().toISOString(),
        };
        criadas.push(conta.ecs.execucoes[id]);
      }
      avisarClimb(
        "run-task roda a tarefa UMA VEZ e acabou — é assim que se faz migração de banco, job noturno e script pontual. " +
        "O create-service é o contrário: ele MANTÉM N cópias de pé e sobe outra se uma morrer. Confundir os dois e clássico."
      );
      return js({ tasks: criadas.map((t) => ({
        taskArn: "arn:aws:ecs:" + REGIAO(conta) + ":" + CONTA_ID(conta) + ":task/" + nomeCluster + "/" + t.id,
        clusterArn: "arn:aws:ecs:" + REGIAO(conta) + ":" + CONTA_ID(conta) + ":cluster/" + nomeCluster,
        taskDefinitionArn: "arn:aws:ecs:" + REGIAO(conta) + ":" + CONTA_ID(conta) + ":task-definition/" + familia + ":" + td.revisao,
        lastStatus: "PROVISIONING", desiredStatus: "RUNNING", launchType: t.tipo,
      })), failures: [] });
    },
    "list-tasks": (conta, pos, flags) => {
      const [nomeCluster] = clusterDe(conta, flags, "ListTasks");
      const desejado = flags["desired-status"] ? String(flags["desired-status"]) : "RUNNING";
      const tarefas = Object.values(conta.ecs.execucoes)
        .filter((t) => t.cluster === nomeCluster && (desejado === "STOPPED" ? t.estado === "STOPPED" : t.estado === "RUNNING"));
      if (!tarefas.length) {
        avisarClimb(
          desejado === "STOPPED"
            ? "Nenhuma tarefa parada. Quando algo quebra, e AQUI que se procura: --desired-status STOPPED lista as que morreram."
            : "Nenhuma tarefa rodando nesse cluster. Rode uma com: aws ecs run-task --cluster " + nomeCluster + " --task-definition <familia>"
        );
        return "";
      }
      return js({ taskArns: tarefas.map((t) => "arn:aws:ecs:" + REGIAO(conta) + ":" + CONTA_ID(conta) + ":task/" + nomeCluster + "/" + t.id) });
    },
    "describe-tasks": (conta, pos, flags) => {
      const [nomeCluster] = clusterDe(conta, flags, "DescribeTasks");
      const ids = lista(exigirFlag(flags, "tasks"), pos).map((a) => String(a).split("/").pop());
      const achadas = ids.map((id) => conta.ecs.execucoes[id]).filter(Boolean);
      if (!achadas.length) {
        throw new ErroCli("An error occurred (InvalidParameterException) when calling the DescribeTasks operation: Task not found.");
      }
      avisarClimb(
        "Quando a tarefa morre, a resposta está no campo stoppedReason — e quase ninguém sabe olhar aí. " +
        "Os clássicos são OutOfMemoryError (o container estourou a memória da task definition) e o exit code do processo."
      );
      return js({ tasks: achadas.map((t) => ({
        taskArn: "arn:aws:ecs:" + REGIAO(conta) + ":" + CONTA_ID(conta) + ":task/" + nomeCluster + "/" + t.id,
        lastStatus: t.estado, desiredStatus: t.estado === "STOPPED" ? "STOPPED" : "RUNNING",
        launchType: t.tipo, enableExecuteCommand: !!t.exec,
        stoppedReason: t.motivo || undefined,
        containers: [{ name: t.familia, lastStatus: t.estado, exitCode: t.estado === "STOPPED" ? 137 : undefined }],
      })), failures: [] });
    },
    "stop-task": (conta, pos, flags) => {
      clusterDe(conta, flags, "StopTask");
      const id = String(exigirFlag(flags, "task")).split("/").pop();
      const t = conta.ecs.execucoes[id];
      if (!t) throw new ErroCli("An error occurred (InvalidParameterException) when calling the StopTask operation: The referenced task was not found.");
      t.estado = "STOPPED";
      t.motivo = flags.reason ? String(flags.reason) : "Task stopped by user";
      avisarClimb("O `--reason` não é enfeite: ele fica gravado na tarefa e aparece pro próximo que for investigar por que aquilo parou.");
      return js({ task: { taskArn: id, lastStatus: "STOPPED", stoppedReason: t.motivo } });
    },
    "execute-command": (conta, pos, flags) => {
      const [nomeCluster] = clusterDe(conta, flags, "ExecuteCommand");
      const id = String(exigirFlag(flags, "task")).split("/").pop();
      const t = conta.ecs.execucoes[id];
      if (!t) throw new ErroCli("An error occurred (InvalidParameterException) when calling the ExecuteCommand operation: The referenced task was not found.");
      if (!t.exec) {
        throw new ErroCli(
          "An error occurred (InvalidParameterException) when calling the ExecuteCommand operation: The execute command failed because execute command was not enabled when the task was run.\n" +
          "O ECS Exec precisa ser ligado NA HORA de rodar a tarefa: aws ecs run-task ... --enable-execute-command\n" +
          "Não dá pra ligar depois: a tarefa tem que ser recriada."
        );
      }
      const comando = String(exigirFlag(flags, "command"));
      avisarClimb(
        "Isto é o Session Manager do container: você entra no que está rodando SEM SSH, sem porta aberta e sem imagem com sshd. " +
        "Precisa de três coisas: exec ligado na tarefa, permissão de SSM na role da TAREFA (não a de execução) e o session-manager-plugin instalado."
      );
      return js({ clusterArn: nomeCluster, taskArn: id, interactive: flags.interactive !== undefined, session: { sessionId: "ecs-execute-command-" + hexAleatorio(16), tokenValue: hexAleatorio(40) }, __comando: comando });
    },
    "describe-clusters": (conta, pos, flags) => {
      st(conta);
      const nomes = lista(flags.clusters, pos);
      const alvo = nomes.length ? nomes.map((n) => conta.ecs.clusters[n]).filter(Boolean) : Object.values(conta.ecs.clusters);
      if (!alvo.length) { avisarClimb("Nenhum cluster. Crie com: aws ecs create-cluster --cluster-name meu-cluster"); return ""; }
      return js({ clusters: alvo.map((c) => {
        const servicos = Object.values(conta.ecs.servicos).filter((s) => s.cluster === c.nome);
        const rodando = Object.values(conta.ecs.execucoes).filter((t) => t.cluster === c.nome && t.estado === "RUNNING");
        return {
          clusterArn: "arn:aws:ecs:" + REGIAO(conta) + ":" + CONTA_ID(conta) + ":cluster/" + c.nome,
          clusterName: c.nome, status: c.status,
          runningTasksCount: rodando.length, pendingTasksCount: 0,
          activeServicesCount: servicos.length,
        };
      }), failures: [] });
    },
    "describe-task-definition": (conta, pos, flags) => {
      const [familia, t] = tarefaDe(conta, exigirFlag(flags, "task-definition"), "DescribeTaskDefinition");
      avisarClimb("Task definition e IMUTAVEL: cada registro cria uma revisão nova e as antigas ficam. É por isso que voltar atrás num deploy e apontar o service pra revisão anterior — não é recriar nada.");
      return js({ taskDefinition: {
        taskDefinitionArn: "arn:aws:ecs:" + REGIAO(conta) + ":" + CONTA_ID(conta) + ":task-definition/" + familia + ":" + t.revisao,
        family: familia, revision: t.revisao, status: t.inativa ? "INACTIVE" : "ACTIVE",
        containerDefinitions: t.containers || [],
      } });
    },
    "deregister-task-definition": (conta, pos, flags) => {
      const [familia, t] = tarefaDe(conta, exigirFlag(flags, "task-definition"), "DeregisterTaskDefinition");
      t.inativa = true;
      avisarClimb("INACTIVE não é apagado: a revisão continua existindo e um service que já aponta pra ela continua rodando. O que muda é que você não consegue mais criar coisa NOVA em cima dela.");
      return js({ taskDefinition: { family: familia, revision: t.revisao, status: "INACTIVE" } });
    },
  });

  Object.assign(SERVICOS.ecr, {
    "batch-delete-image": (conta, pos, flags) => {
      const [nome, r] = repoDe(conta, flags, "BatchDeleteImage");
      const doc = [String(exigirFlag(flags, "image-ids"))].concat((pos || []).map(String)).join(" ");
      const tags = (String(doc).match(/imageTag[^A-Za-z0-9]+([A-Za-z0-9_.-]+)/g) || []).map((p) => campo(p, "imageTag"));
      if (!tags.length) {
        throw new ErroCli(
          "An error occurred (InvalidParameterException) when calling the BatchDeleteImage operation: nenhuma imagem informada.\n" +
          "Forma: --image-ids imageTag=v1 imageTag=v2"
        );
      }
      const apagadas = [], falhas = [];
      for (const t of tags) {
        const i = r.imagens.indexOf(t);
        if (i < 0) { falhas.push({ imageId: { imageTag: t }, failureCode: "ImageNotFound", failureReason: "Requested image not found" }); continue; }
        r.imagens.splice(i, 1);
        if (r.detalhes) r.detalhes = r.detalhes.filter((d) => (d.tags || []).indexOf(t) < 0);
        apagadas.push({ imageTag: t });
      }
      avisarClimb(
        "Registro de imagem cresce PRA SEMPRE e ninguém vigia: cada build deixa uma camada lá, e você paga por GB. " +
        "Apagar na mão resolve hoje; a política de ciclo de vida do repositório resolve pra sempre."
      );
      return js({ imageIds: apagadas, failures: falhas });
    },
    "get-authorization-token": (conta) => {
      st(conta);
      avisarClimb(
        "Este é o comando de BAIXO nível: ele devolve o token em base64 no formato AWS:senha. O `get-login-password` que você já usou " +
        "e o atalho que já decodifica e entrega só a senha, pronta pro `docker login --password-stdin`. Os dois existem; o segundo é o do dia a dia."
      );
      return js({ authorizationData: [{
        authorizationToken: (typeof btoa === "function" ? btoa("AWS:" + hexAleatorio(40)) : "QVdTOg" + hexAleatorio(40)),
        expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
        proxyEndpoint: "https://" + CONTA_ID(conta) + ".dkr.ecr." + REGIAO(conta) + ".amazonaws.com",
      }] });
    },
    "set-repository-policy": (conta, pos, flags) => {
      const [nome, r] = repoDe(conta, flags, "SetRepositoryPolicy");
      const texto = String(exigirFlag(flags, "policy-text"));
      r.politica = texto.indexOf("file://") === 0
        ? { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { AWS: "arn:aws:iam::111122223333:root" }, Action: ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"] }] }
        : texto;
      avisarClimb(
        "Política de repositório e como a conta de PRODUÇÃO baixa a imagem que a conta de BUILD publicou. " +
        "Empresa seria tem conta separada por ambiente, e é assim que a imagem atravessa a fronteira sem ninguém copiar nada."
      );
      return js({ repositoryName: nome, policyText: JSON.stringify(r.politica) });
    },
    "get-repository-policy": (conta, pos, flags) => {
      const [nome, r] = repoDe(conta, flags, "GetRepositoryPolicy");
      if (!r.politica) {
        throw new ErroCli("An error occurred (RepositoryPolicyNotFoundException) when calling the GetRepositoryPolicy operation: Repository policy does not exist for the repository with name '" + nome + "'");
      }
      return js({ repositoryName: nome, policyText: typeof r.politica === "string" ? r.politica : JSON.stringify(r.politica) });
    },
    "get-lifecycle-policy": (conta, pos, flags) => {
      const [nome, r] = repoDe(conta, flags, "GetLifecyclePolicy");
      if (!r.cicloVida && !r.lifecycle && !r.politicaCiclo) {
        throw new ErroCli(
          "An error occurred (LifecyclePolicyNotFoundException) when calling the GetLifecyclePolicy operation: Lifecycle policy does not exist for the repository with name '" + nome + "'\n" +
          "Sem ela, o repositório guarda toda imagem de todo build, pra sempre."
        );
      }
      return js({ repositoryName: nome, lifecyclePolicyText: JSON.stringify(r.cicloVida || r.lifecycle || r.politicaCiclo) });
    },
    "delete-lifecycle-policy": (conta, pos, flags) => {
      const [nome, r] = repoDe(conta, flags, "DeleteLifecyclePolicy");
      if (!r.cicloVida && !r.lifecycle && !r.politicaCiclo) {
        throw new ErroCli("An error occurred (LifecyclePolicyNotFoundException) when calling the DeleteLifecyclePolicy operation: Lifecycle policy does not exist for the repository with name '" + nome + "'");
      }
      delete r.cicloVida; delete r.lifecycle; delete r.politicaCiclo;
      avisarClimb("Política removida: a partir de agora nada é apagado sozinho e o repositório volta a crescer sem limite.");
      return okSilencioso("Política de ciclo de vida removida de \"" + nome + "\".");
    },
  });

  Object.assign(SERVICOS.eks, {
    "describe-nodegroup": (conta, pos, flags) => {
      st(conta);
      const cluster = String(exigirFlag(flags, "cluster-name"));
      const nome = String(exigirFlag(flags, "nodegroup-name"));
      const ng = Object.values(conta.eks.nodegroups).find((n) => n.cluster === cluster && n.nome === nome);
      if (!ng) throw new ErroCli("An error occurred (ResourceNotFoundException) when calling the DescribeNodegroup operation: No node group found for name: " + nome + ".");
      return js({ nodegroup: {
        nodegroupName: ng.nome, clusterName: cluster, status: ng.status,
        instanceTypes: [].concat(ng.tipo),
        scalingConfig: ng.escala || { minSize: 1, maxSize: 3, desiredSize: 2 },
        amiType: "AL2023_x86_64_STANDARD", capacityType: "ON_DEMAND",
        createdAt: ng.criadoEm,
      } });
    },
    "update-nodegroup-config": (conta, pos, flags) => {
      st(conta);
      const cluster = String(exigirFlag(flags, "cluster-name"));
      const nome = String(exigirFlag(flags, "nodegroup-name"));
      const ng = Object.values(conta.eks.nodegroups).find((n) => n.cluster === cluster && n.nome === nome);
      if (!ng) throw new ErroCli("An error occurred (ResourceNotFoundException) when calling the UpdateNodegroupConfig operation: No node group found for name: " + nome + ".");
      const cfg = [String(exigirFlag(flags, "scaling-config"))].concat((pos || []).map(String)).join(" ");
      const min = Number(campo(cfg, "minSize") || 1);
      const max = Number(campo(cfg, "maxSize") || 3);
      const desejado = Number(campo(cfg, "desiredSize") || min);
      if (desejado < min || desejado > max) {
        throw new ErroCli("An error occurred (InvalidParameterException) when calling the UpdateNodegroupConfig operation: desiredSize (" + desejado + ") precisa estar entre minSize (" + min + ") e maxSize (" + max + ").");
      }
      ng.escala = { minSize: min, maxSize: max, desiredSize: desejado };
      const id = hexAleatorio(8) + "-" + hexAleatorio(4) + "-" + hexAleatorio(12);
      conta.eks.atualizacoes = conta.eks.atualizacoes || {};
      conta.eks.atualizacoes[id] = { id: id, cluster: cluster, tipo: "ConfigUpdate", estado: "Successful" };
      avisarClimb("Escalar o nodegroup muda quantas MÁQUINAS existem. Não confunda com escalar pods (HPA), que é do Kubernetes: sem nó sobrando, o pod novo fica Pending e ninguém entende por que.");
      return js({ update: { id: id, status: "InProgress", type: "ConfigUpdate" } });
    },
    "update-cluster-version": (conta, pos, flags) => {
      st(conta);
      const nome = String(exigirFlag(flags, "name"));
      const c = conta.eks.clusters[nome];
      if (!c) throw new ErroCli("An error occurred (ResourceNotFoundException) when calling the UpdateClusterVersion operation: No cluster found for name: " + nome + ".");
      const versao = String(exigirFlag(flags, "kubernetes-version"));
      const atual = parseFloat(c.versao), novo = parseFloat(versao);
      if (!(novo > atual)) {
        throw new ErroCli(
          "An error occurred (InvalidParameterException) when calling the UpdateClusterVersion operation: Cluster is already at version " + c.versao + ".\n" +
          "O EKS só sobe de versão, e de UMA menor por vez — não dá pra pular da 1.28 pra 1.31 nem voltar atrás."
        );
      }
      if (novo - atual > 0.011) {
        throw new ErroCli(
          "An error occurred (InvalidParameterException) when calling the UpdateClusterVersion operation: Unsupported Kubernetes minor version update from " + c.versao + " to " + versao + ".\n" +
          "Sobe uma menor por vez: " + c.versao + " -> " + (atual + 0.01).toFixed(2)
        );
      }
      c.versao = versao;
      const id = hexAleatorio(8) + "-" + hexAleatorio(4) + "-" + hexAleatorio(12);
      conta.eks.atualizacoes = conta.eks.atualizacoes || {};
      conta.eks.atualizacoes[id] = { id: id, cluster: nome, tipo: "VersionUpdate", estado: "Successful" };
      avisarClimb(
        "Atualizar o cluster e só METADE: o control plane sobe aqui, mas os NOS continuam na versão antiga e o Kubernetes só aguenta " +
        "duas menores de diferença. Upgrade de verdade e control plane, depois nodegroup, depois os addons — nessa ordem."
      );
      return js({ update: { id: id, status: "InProgress", type: "VersionUpdate", params: [{ type: "Version", value: versao }] } });
    },
    "describe-update": (conta, pos, flags) => {
      st(conta);
      const id = String(exigirFlag(flags, "update-id"));
      const u = (conta.eks.atualizacoes || {})[id];
      if (!u) throw new ErroCli("An error occurred (ResourceNotFoundException) when calling the DescribeUpdate operation: No update found for id: " + id);
      return js({ update: { id: u.id, status: u.estado, type: u.tipo, errors: [] } });
    },
    "list-addons": (conta, pos, flags) => {
      st(conta);
      const cluster = String(exigirFlag(flags, "cluster-name"));
      const c = conta.eks.clusters[cluster];
      if (!c) throw new ErroCli("An error occurred (ResourceNotFoundException) when calling the ListAddons operation: No cluster found for name: " + cluster + ".");
      c.addons = c.addons || [];
      if (!c.addons.length) {
        avisarClimb("Nenhum addon gerenciado. Cluster novo já vem com vpc-cni, coredns e kube-proxy rodando — mas como addon GERENCIADO pela AWS (que atualiza sozinho) só depois que você declara.");
        return "";
      }
      return js({ addons: c.addons.map((a) => a.nome) });
    },
    "create-addon": (conta, pos, flags) => {
      st(conta);
      const cluster = String(exigirFlag(flags, "cluster-name"));
      const c = conta.eks.clusters[cluster];
      if (!c) throw new ErroCli("An error occurred (ResourceNotFoundException) when calling the CreateAddon operation: No cluster found for name: " + cluster + ".");
      const nome = String(exigirFlag(flags, "addon-name"));
      const CONHECIDOS = ["vpc-cni", "coredns", "kube-proxy", "aws-ebs-csi-driver", "aws-efs-csi-driver", "amazon-cloudwatch-observability"];
      if (CONHECIDOS.indexOf(nome) < 0) {
        throw new ErroCli(
          "An error occurred (InvalidParameterException) when calling the CreateAddon operation: Addon " + nome + " não é um addon gerenciado.\n" +
          "Disponíveis no simulador: " + CONHECIDOS.join(", ")
        );
      }
      c.addons = c.addons || [];
      if (c.addons.some((a) => a.nome === nome)) {
        throw new ErroCli("An error occurred (ResourceInUseException) when calling the CreateAddon operation: Addon " + nome + " already exists.");
      }
      c.addons.push({ nome: nome, versao: flags["addon-version"] ? String(flags["addon-version"]) : "v1.19.0-eksbuild.1" });
      avisarClimb(
        nome === "aws-ebs-csi-driver"
          ? "Sem o driver de EBS o pod que pede disco fica PENDING pra sempre, e o erro não diz isso. É a pegadinha n1 de quem sobe cluster novo e tenta rodar banco nele."
          : "Addon gerenciado é a AWS cuidando da versão e da compatibilidade daquele componente — em vez de você aplicar YAML na mão a cada upgrade."
      );
      return js({ addon: { addonName: nome, clusterName: cluster, status: "CREATING", addonVersion: c.addons[c.addons.length - 1].versao } });
    },
  });

  // ============================================================
  // MANUAIS
  // ============================================================
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => "USO\n    " + uso + "\n\n" + txt;
    Object.assign(MANUAIS, {
      "ecs.run-task": M(
        "aws ecs run-task --cluster meu-cluster --task-definition migracao --launch-type FARGATE [--enable-execute-command]",
        "Roda a tarefa UMA VEZ e acabou. É assim que se faz migração de banco,\njob noturno e script pontual.\n\nNÃO CONFUNDA com create-service: o service MANTÉM N cópias de pé e\nsobe outra se uma morrer. O run-task roda e termina."),
      "ecs.list-tasks": M(
        "aws ecs list-tasks --cluster meu-cluster [--desired-status STOPPED]",
        "Lista as tarefas do cluster.\n\nO --desired-status STOPPED é o que importa quando algo quebra: é\nele que mostra as que morreram — e que somem da lista padrão."),
      "ecs.describe-tasks": M(
        "aws ecs describe-tasks --cluster meu-cluster --tasks <arn-ou-id>",
        "O detalhe da tarefa. Quando ela morre, a resposta está no campo\nstoppedReason — e quase ninguém sabe olhar aí.\n\nOs clássicos: OutOfMemoryError (o contêiner estourou a memória\ndeclarada na task definition) e o exit code do processo."),
      "ecs.stop-task": M(
        "aws ecs stop-task --cluster meu-cluster --task <id> --reason \"deploy errado\"",
        "Para a tarefa. O --reason fica gravado e aparece pro próximo que for\ninvestigar por que aquilo parou."),
      "ecs.execute-command": M(
        "aws ecs execute-command --cluster meu-cluster --task <id> --container api --command \"/bin/sh\" --interactive",
        "Entra no contêiner que está rodando, SEM SSH, sem porta aberta e sem\nimagem com sshd. É o Session Manager do ECS.\n\nPRECISA DE TRÊS COISAS\n    1. a tarefa ter sido criada com --enable-execute-command\n       (não dá pra ligar depois: recria a tarefa)\n    2. permissão de SSM na role da TAREFA (não a de execução)\n    3. o session-manager-plugin instalado na sua máquina"),
      "ecs.describe-clusters": M(
        "aws ecs describe-clusters --clusters meu-cluster",
        "Quantas tarefas rodando, quantas pendentes e quantos serviços\nativos. É o retrato do cluster numa linha."),
      "ecs.describe-task-definition": M(
        "aws ecs describe-task-definition --task-definition minha-api:3",
        "Mostra a receita: contêineres, memória, CPU, variáveis.\n\nTask definition é IMUTÁVEL: cada registro cria uma revisão nova e as\nantigas ficam. É por isso que voltar atrás num deploy é apontar o\nservice pra revisão anterior — não é recriar nada."),
      "ecs.deregister-task-definition": M(
        "aws ecs deregister-task-definition --task-definition minha-api:2",
        "Marca a revisão como INACTIVE.\n\nNÃO é apagar: a revisão continua existindo e um service que já\naponta pra ela continua rodando. O que muda é que você não cria mais\nnada novo em cima dela."),
      "ecr.batch-delete-image": M(
        "aws ecr batch-delete-image --repository-name minha-api --image-ids imageTag=v1 imageTag=v2",
        "Apaga imagens do repositório.\n\nRegistro cresce PRA SEMPRE e ninguém vigia: cada build deixa camadas\nlá e você paga por GB. Isso resolve hoje; a política de ciclo de\nvida resolve pra sempre."),
      "ecr.get-authorization-token": M(
        "aws ecr get-authorization-token",
        "O comando de BAIXO nível do login: devolve o token em base64, no\nformato AWS:senha.\n\nO get-login-password é o atalho que já decodifica e entrega só a\nsenha, pronta pro `docker login --password-stdin`. Os dois existem;\no segundo é o do dia a dia."),
      "ecr.set-repository-policy": M(
        "aws ecr set-repository-policy --repository-name minha-api --policy-text file://politica-publica.json",
        "Libera o repositório pra OUTRA conta da AWS.\n\nÉ como a conta de PRODUÇÃO baixa a imagem que a conta de BUILD\npublicou — empresa séria tem conta separada por ambiente, e é assim\nque a imagem atravessa a fronteira sem ninguém copiar nada."),
      "ecr.get-repository-policy": M(
        "aws ecr get-repository-policy --repository-name minha-api",
        "Mostra quem mais pode puxar imagem deste repositório."),
      "ecr.get-lifecycle-policy": M(
        "aws ecr get-lifecycle-policy --repository-name minha-api",
        "Mostra a regra de limpeza automática. Erro\nLifecyclePolicyNotFoundException quer dizer que o repositório guarda\ntoda imagem de todo build, pra sempre."),
      "ecr.delete-lifecycle-policy": M(
        "aws ecr delete-lifecycle-policy --repository-name minha-api",
        "Remove a regra: nada mais é apagado sozinho e o repositório volta a\ncrescer sem limite."),
      "eks.describe-nodegroup": M(
        "aws eks describe-nodegroup --cluster-name meu-cluster --nodegroup-name nos-app",
        "O detalhe do grupo de nós: tipo de instância, escala (min/desejado/\nmáx), tipo de AMI e se é ON_DEMAND ou SPOT."),
      "eks.update-nodegroup-config": M(
        "aws eks update-nodegroup-config --cluster-name meu-cluster --nodegroup-name nos-app \\\n        --scaling-config minSize=2,maxSize=6,desiredSize=4",
        "Muda quantas MÁQUINAS o grupo tem.\n\nNão confunda com escalar pods (HPA), que é do Kubernetes: sem nó\nsobrando, o pod novo fica Pending — e o erro não explica isso."),
      "eks.update-cluster-version": M(
        "aws eks update-cluster-version --name meu-cluster --kubernetes-version 1.32",
        "Sobe a versão do control plane.\n\nSÓ SOBE, e de UMA menor por vez — não dá pra pular nem voltar.\n\nE é só METADE do upgrade: os nós continuam na versão antiga, e o\nKubernetes só aguenta duas menores de diferença. A ordem certa é\ncontrol plane ➜ nodegroup ➜ addons."),
      "eks.describe-update": M(
        "aws eks describe-update --name meu-cluster --update-id <id>",
        "Acompanha a atualização: estado e, se falhou, os erros. Upgrade de\ncluster demora — é aqui que se olha enquanto roda."),
      "eks.list-addons": M(
        "aws eks list-addons --cluster-name meu-cluster",
        "Os addons GERENCIADOS do cluster. Cluster novo já vem com vpc-cni,\ncoredns e kube-proxy rodando — mas como addon gerenciado (que a AWS\natualiza sozinha) só depois que você declara."),
      "eks.create-addon": M(
        "aws eks create-addon --cluster-name meu-cluster --addon-name aws-ebs-csi-driver",
        "Instala um componente sob gestão da AWS, em vez de você aplicar YAML\nna mão a cada upgrade.\n\nPEGADINHA Nº 1 de cluster novo: sem o aws-ebs-csi-driver, o pod que\npede disco fica PENDING pra sempre — e o erro não diz isso."),
    });
  }

  // ============================================================
  // PORQUE
  // ============================================================
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "ecs.run-task": "roda a tarefa uma vez e acabou — migração, job, script pontual.",
      "ecs.list-tasks": "lista as tarefas, inclusive as que morreram (--desired-status STOPPED).",
      "ecs.describe-tasks": "mostra por que a tarefa parou, no campo stoppedReason.",
      "ecs.stop-task": "para a tarefa deixando registrado o motivo.",
      "ecs.execute-command": "entra no contêiner rodando, sem SSH nem porta aberta.",
      "ecs.describe-clusters": "dá o retrato do cluster: tarefas rodando e serviços ativos.",
      "ecs.describe-task-definition": "mostra a receita da tarefa; cada registro é uma revisão imutável.",
      "ecs.deregister-task-definition": "marca a revisão como inativa, sem derrubar quem já a usa.",
      "ecr.batch-delete-image": "apaga imagens velhas — registro cresce para sempre e você paga por GB.",
      "ecr.get-authorization-token": "o login de baixo nível; o get-login-password é o atalho do dia a dia.",
      "ecr.set-repository-policy": "libera o repositório pra outra conta (build publica, produção puxa).",
      "ecr.get-repository-policy": "mostra quem mais pode puxar imagem daqui.",
      "ecr.get-lifecycle-policy": "mostra a regra de limpeza; sem ela nada é apagado sozinho.",
      "ecr.delete-lifecycle-policy": "remove essa regra.",
      "eks.describe-nodegroup": "mostra tipo de máquina e escala do grupo de nós.",
      "eks.update-nodegroup-config": "muda quantas máquinas existem — sem nó sobrando, pod fica Pending.",
      "eks.update-cluster-version": "sobe o control plane, uma versão menor por vez.",
      "eks.describe-update": "acompanha o upgrade enquanto ele roda.",
      "eks.list-addons": "lista os componentes que a AWS gerencia no cluster.",
      "eks.create-addon": "põe um componente sob gestão da AWS — como o driver de disco.",
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
  const execs = (c) => Object.values(((c.ecs || {}).execucoes) || {});
  const execDe = (c, v) => (((c.ecs || {}).execucoes) || {})[String(v || "").split("/").pop()];
  const tdDe = (c, f) => (((c.ecs || {}).tarefas) || {})[f] || {};
  const repo = (c, n) => ((c.ecr || {}).repositorios || {})[n];
  const temImagem = (c, n, tag) => ((repo(c, n) || {}).imagens || []).indexOf(tag) >= 0;
  const ngDe = (c, cl, n) => Object.values(((c.eks || {}).nodegroups) || {}).find((x) => x.cluster === cl && x.nome === n);
  const escalaDe = (c) => ((ngDe(c, "cluster-k8s", "nos-app") || {}).escala) || {};
  const clusterEks = (c, n) => ((c.eks || {}).clusters || {})[n];
  const temAddon = (c, n) => (((clusterEks(c, "cluster-k8s") || {}).addons) || []).some((a) => a.nome === n);

  // ---------- ECS: a tarefa avulsa, do nascimento ao diagnóstico ----------
  at("cob-ecs-2", [
    d("ctn-run1", "ecs", 3, 130, "A migração do banco não é um serviço",
      "Antes do deploy, alguém precisa rodar a migração do banco — UMA vez, não ficar de pé pra sempre. Crie o cluster <b>producao-app</b>, registre a receita <b>migracao-banco</b> e rode ela como tarefa avulsa em <b>FARGATE</b>, já com o <b>acesso por exec ligado</b>.",
      ["O `create-service` manteria a migração rodando pra sempre e ela se repetiria — não é isso que você quer.", "O que roda uma vez e acabou é o `run-task`. A receita vem do arquivo pronto `file://tarefa-web.json` (digite `ls`).", "O `--enable-execute-command` precisa ir AGORA: não dá pra ligar depois sem recriar a tarefa."],
      ["aws ecs create-cluster --cluster-name producao-app",
        "aws ecs register-task-definition --family migracao-banco --container-definitions file://tarefa-web.json",
        "aws ecs run-task --cluster producao-app --task-definition migracao-banco --launch-type FARGATE --enable-execute-command"],
      (c) => execs(c).some((t) => t.familia === "migracao-banco" && t.exec)),
    d("ctn-lt1", "ecs", 3, 70, "O que está rodando agora?",
      "O time de dados perguntou se a migração já subiu. Liste as tarefas <b>rodando</b> no cluster <b>producao-app</b> — é daí que sai o id que todo comando seguinte vai pedir.",
      ["Tarefa avulsa não aparece no `list-services`: ela não é serviço.", "O `list-tasks` pede o cluster; sem filtro, ele mostra só as que estão RUNNING."],
      ["aws ecs list-tasks --cluster producao-app"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "list-tasks") && String(cmd.flags.cluster) === "producao-app"),
    d("ctn-dt1", "ecs", 3, 90, "O exec ficou ligado mesmo?",
      "Antes de tentar entrar no container, confirme se a tarefa da migração nasceu com o exec ligado — senão você perde dez minutos com um erro que não tem conserto. <b>Descreva</b> a tarefa e procure o campo <code>enableExecuteCommand</code>.",
      ["O id vem da listagem que você acabou de fazer (serve o ARN inteiro ou só o final).", "O `describe-tasks` aceita várias tarefas de uma vez, por isso a flag é `--tasks`, no plural."],
      ["aws ecs describe-tasks --cluster producao-app --tasks <tarefa-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "describe-tasks")),
    d("ctn-exec1", "ecs", 3, 120, "Preciso ver o que tem dentro do container",
      "A migração travou e você precisa olhar de dentro. <b>Entre</b> no container <b>migracao</b> rodando <b>/bin/sh</b> em modo interativo. <small>(sem SSH, sem porta aberta, sem imagem com sshd)</small>",
      ["O comando que entra no container é o `execute-command` — e ele exige `--interactive`.", "Ele pede cluster, tarefa, container e o `--command` que vai rodar lá dentro.", "Se der erro dizendo que exec não estava ligado, é porque a tarefa nasceu sem a flag: recriar é o único jeito."],
      ["aws ecs execute-command --cluster producao-app --task <tarefa-id> --container migracao --command \"/bin/sh\" --interactive"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "execute-command") && /sh/.test(String(cmd.flags.command || ""))),
    d("ctn-exec2", "ecs", 3, 100, "A variável de ambiente chegou?",
      "A migração reclama que não acha o endereço do banco. Em vez de abrir um shell, rode direto o comando <b>env</b> dentro do container <b>migracao</b> e veja se a variável chegou lá.",
      ["É o mesmo comando de entrar no container — o que muda é o que vai no `--command`.", "Um comando só, sem shell no meio: `--command env`."],
      ["aws ecs execute-command --cluster producao-app --task <tarefa-id> --container migracao --command env --interactive"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "execute-command") && /env/.test(String(cmd.flags.command || ""))),
    d("ctn-run2", "ecs", 3, 100, "O relatório que roda de madrugada",
      "O financeiro quer um relatório gerado toda noite: um job que roda, escreve o arquivo e morre. Registre a receita <b>relatorio-noturno</b> e rode ela como tarefa avulsa no <b>producao-app</b>, em <b>FARGATE</b>.",
      ["Job que termina sozinho é tarefa avulsa, igual à migração — não serviço.", "O registro da receita usa o mesmo arquivo `file://tarefa-web.json`; o exec aqui não é necessário."],
      ["aws ecs register-task-definition --family relatorio-noturno --container-definitions file://tarefa-web.json",
        "aws ecs run-task --cluster producao-app --task-definition relatorio-noturno --launch-type FARGATE"],
      (c) => execs(c).some((t) => t.familia === "relatorio-noturno")),
    d("ctn-cl1", "ecs", 3, 80, "O retrato do cluster",
      "Reunião daqui a cinco minutos e perguntaram quantas coisas estão rodando. Descreva o cluster <b>producao-app</b>: tarefas rodando, pendentes e serviços ativos numa resposta só.",
      ["A flag aqui é `--clusters`, no plural — dá pra perguntar por vários de uma vez.", "Repare nos contadores: runningTasksCount, pendingTasksCount e activeServicesCount."],
      ["aws ecs describe-clusters --clusters producao-app"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "describe-clusters")),
    d("ctn-stop1", "ecs", 3, 100, "O relatório travou e está queimando dinheiro",
      "O relatório devia ter terminado há duas horas e continua rodando — em Fargate, cada minuto é cobrado. <b>Pare</b> a tarefa deixando o motivo <b>relatorio-travado</b>, pra quem for investigar amanhã saber o que houve.",
      ["Parar pede o cluster e o id da tarefa (a listagem mostra).", "O `--reason` fica gravado na tarefa: é o recado pro próximo que olhar."],
      ["aws ecs stop-task --cluster producao-app --task <tarefa-id> --reason relatorio-travado"],
      (c) => execs(c).some((t) => t.familia === "relatorio-noturno" && t.estado === "STOPPED" && String(t.motivo).indexOf("relatorio-travado") >= 0)),
    d("ctn-lt2", "ecs", 3, 90, "Onde foi parar a tarefa que morreu?",
      "Você listou as tarefas e a do relatório sumiu da lista. Ela não foi apagada: o <code>list-tasks</code> só mostra as que estão rodando. Liste as <b>paradas</b> do <b>producao-app</b>.",
      ["O mesmo `list-tasks`, com um filtro de estado desejado.", "A flag é `--desired-status` e o valor é `STOPPED`."],
      ["aws ecs list-tasks --cluster producao-app --desired-status STOPPED"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "list-tasks") && String(cmd.flags["desired-status"]) === "STOPPED"),
    d("ctn-stop2", "ecs", 3, 100, "A migração acabou, desligue",
      "A migração terminou o trabalho e ficou parada esperando — o exec ligado fez ela não sair sozinha. <b>Pare</b> a tarefa da migração com o motivo <b>migracao-concluida</b>.",
      ["Agora a única tarefa rodando no cluster é a da migração.", "Mesmo comando de antes, outro motivo."],
      ["aws ecs stop-task --cluster producao-app --task <tarefa-id> --reason migracao-concluida"],
      (c) => execs(c).some((t) => t.familia === "migracao-banco" && t.estado === "STOPPED" && String(t.motivo).indexOf("migracao-concluida") >= 0)),
    d("ctn-dt2", "ecs", 3, 110, "Por que a tarefa morreu?",
      "Amanhã de manhã, alguém pergunta o que aconteceu com o relatório. <b>Descreva</b> a tarefa parada do relatório e leia o campo que guarda a causa. <small>(o stoppedReason é onde mora a resposta — e quase ninguém sabe olhar aí)</small>",
      ["O id da tarefa parada vem da listagem com `--desired-status STOPPED`.", "Na saída, olhe o stoppedReason e o exitCode do container: 137 quer dizer que alguém matou o processo."],
      ["aws ecs describe-tasks --cluster producao-app --tasks <tarefa-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "describe-tasks") && (execDe(c, cmd.flags.tasks) || {}).estado === "STOPPED"),
    d("ctn-td1", "ecs", 3, 80, "O que tem dentro da receita?",
      "Antes de mexer em qualquer coisa, veja o que a receita <b>migracao-banco</b> declara: imagem, memória, portas. Cada registro é uma <b>revisão imutável</b> — você nunca edita, sempre registra uma nova.",
      ["Receita no ECS se chama task definition.", "O comando é o `describe-task-definition`, e ele aceita o nome da família sozinho (pega a revisão mais recente)."],
      ["aws ecs describe-task-definition --task-definition migracao-banco"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "describe-task-definition") && /migracao-banco/.test(String(cmd.flags["task-definition"] || ""))),
    d("ctn-dr1", "ecs", 3, 100, "Ninguém mais roda a migração velha",
      "A migração já rodou e não pode rodar de novo por engano. Marque a receita <b>migracao-banco</b> como <b>inativa</b>, pra ninguém criar coisa nova em cima dela.",
      ["Não existe \"apagar\" task definition do jeito que você imagina: o verbo é desregistrar.", "O `deregister-task-definition` NÃO derruba quem já usa a receita — só impede uso novo."],
      ["aws ecs deregister-task-definition --task-definition migracao-banco"],
      (c) => !!tdDe(c, "migracao-banco").inativa),
    d("ctn-td2", "ecs", 3, 80, "A receita sumiu mesmo?",
      "Um colega jura que a receita da migração foi apagada. Mostre pra ele que não: <b>descreva</b> a <b>migracao-banco</b> de novo e aponte o campo <code>status</code>.",
      ["O mesmo comando de ver a receita.", "INACTIVE não é apagado: a revisão continua lá, só não aceita uso novo."],
      ["aws ecs describe-task-definition --task-definition migracao-banco"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "describe-task-definition") && !!tdDe(c, "migracao-banco").inativa),
    d("ctn-dr2", "ecs", 3, 100, "O relatório virou Lambda",
      "O time reescreveu o relatório noturno como uma função Lambda e a versão em container não deve mais ser usada. Marque a receita <b>relatorio-noturno</b> como inativa.",
      ["É o mesmo desregistro da migração, em outra família."],
      ["aws ecs deregister-task-definition --task-definition relatorio-noturno"],
      (c) => !!tdDe(c, "relatorio-noturno").inativa),
    d("ctn-cl2", "ecs", 3, 90, "Confira que o cluster zerou",
      "Fim da faxina: nada deveria estar rodando no <b>producao-app</b>. Descreva o cluster e confirme que <code>runningTasksCount</code> voltou pra zero — é esse número que vira conta no fim do mês.",
      ["Mesmo retrato de antes, agora com o cluster vazio."],
      ["aws ecs describe-clusters --clusters producao-app"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "describe-clusters") && !execs(c).some((t) => t.cluster === "producao-app" && t.estado === "RUNNING")),
  ]);

  // ---------- ECR: limpeza na mão, acesso entre contas e o login cru ----------
  // Entra depois do ecr-18 (o ciclo de vida já existe) e antes do ecr-5, que
  // apaga o loja-imagens e fecha a trilha.
  at("ecr-18", [
    d("ctn-ecr1", "ecr", 3, 110, "A imagem de 214 dias que ninguém usa",
      "O ensaio do ciclo de vida apontou a <b>v1.0</b> do <b>loja-imagens</b>: 214 dias, 431 MB, nenhum ambiente usando. Não espere a limpeza automática — apague essa imagem agora.",
      ["Apagar imagem no ECR é sempre em LOTE: `batch-delete-image`.", "Cada imagem vai na forma `imageTag=<tag>` na flag `--image-ids`.", "A resposta separa o que foi apagado (imageIds) do que não existia (failures)."],
      ["aws ecr batch-delete-image --repository-name loja-imagens --image-ids imageTag=v1.0"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "batch-delete-image") && !!repo(c, "loja-imagens") && !temImagem(c, "loja-imagens", "v1.0")),
    d("ctn-ecr2", "ecr", 3, 110, "A v2.0 do checkout já foi substituída",
      "No <b>pagamentos/checkout-api</b>, a <b>v2.0</b> foi substituída pela v2.1 há dois meses e o rollback agora é pra v2.1. Apague a v2.0.",
      ["Mesmo comando de apagar imagem, outro repositório.", "O nome do repositório tem barra — vai inteiro na flag."],
      ["aws ecr batch-delete-image --repository-name pagamentos/checkout-api --image-ids imageTag=v2.0"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "batch-delete-image") && !!repo(c, "pagamentos/checkout-api") && !temImagem(c, "pagamentos/checkout-api", "v2.0")),
    d("ctn-ecr3", "ecr", 3, 120, "Produção precisa puxar a imagem que o build publicou",
      "A empresa tem conta separada por ambiente: o build publica numa conta, produção roda noutra. Libere o <b>pagamentos/checkout-api</b> pra conta de produção com uma <b>política de repositório</b>.",
      ["Política de repositório se grava com `set-repository-policy`, e o documento vai em `--policy-text`.", "Use o arquivo pronto: `file://politica-publica.json` (digite `ls` pra ver)."],
      ["aws ecr set-repository-policy --repository-name pagamentos/checkout-api --policy-text file://politica-publica.json"],
      (c) => !!(repo(c, "pagamentos/checkout-api") || {}).politica),
    d("ctn-ecr4", "ecr", 3, 80, "Quem mais pode puxar daqui?",
      "A auditoria quer saber quais contas conseguem baixar a imagem do checkout. Mostre a política que ficou valendo no <b>pagamentos/checkout-api</b>.",
      ["Todo `set-` tem o seu `get-` do mesmo nome.", "Na resposta, o Principal diz QUEM e a Action diz o que pode fazer."],
      ["aws ecr get-repository-policy --repository-name pagamentos/checkout-api"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "get-repository-policy") && String(cmd.flags["repository-name"]) === "pagamentos/checkout-api"),
    d("ctn-ecr5", "ecr", 3, 100, "A homologação também precisa da imagem",
      "A conta de homologação vai testar a loja antes de produção e precisa puxar do <b>loja-imagens</b>. Aplique a mesma política nele.",
      ["Mesmo comando e mesmo arquivo, outro repositório."],
      ["aws ecr set-repository-policy --repository-name loja-imagens --policy-text file://politica-publica.json"],
      (c) => !!(repo(c, "loja-imagens") || {}).politica),
    d("ctn-ecr6", "ecr", 3, 80, "Confira antes de avisar o time",
      "Antes de mandar a mensagem \"pode puxar\" pra homologação, confira que a política do <b>loja-imagens</b> está lá mesmo.",
      ["Mesma leitura de antes, no outro repositório."],
      ["aws ecr get-repository-policy --repository-name loja-imagens"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "get-repository-policy") && String(cmd.flags["repository-name"]) === "loja-imagens"),
    d("ctn-ecr7", "ecr", 3, 80, "Que regra de limpeza está valendo?",
      "Um dev perguntou por que a imagem velha dele sumiu. Mostre a regra de ciclo de vida que está aplicada no <b>loja-imagens</b>.",
      ["Você aplicou a regra com `put-lifecycle-policy`; ler é o `get-` do mesmo nome.", "Sem regra aplicada, o comando dá erro — e isso também é resposta: nada é apagado sozinho."],
      ["aws ecr get-lifecycle-policy --repository-name loja-imagens"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "get-lifecycle-policy") && String(cmd.flags["repository-name"]) === "loja-imagens"),
    d("ctn-ecr8", "ecr", 3, 80, "E o checkout, também se limpa?",
      "A mesma pergunta chegou do time de pagamentos. Confira a regra de ciclo de vida do <b>pagamentos/checkout-api</b>.",
      ["Mesmo comando, no repositório do projeto."],
      ["aws ecr get-lifecycle-policy --repository-name pagamentos/checkout-api"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "get-lifecycle-policy") && String(cmd.flags["repository-name"]) === "pagamentos/checkout-api"),
    d("ctn-ecr9", "ecr", 3, 100, "A limpeza apagou o que não devia",
      "A regra do <b>loja-imagens</b> apagou uma imagem que o ambiente de demonstração ainda usava. Até alguém revisar a regra, <b>remova</b> a política de ciclo de vida desse repositório.",
      ["O par do `put-lifecycle-policy` pra desfazer é um `delete-`.", "Sem a regra, nada mais é apagado sozinho — o repositório volta a crescer."],
      ["aws ecr delete-lifecycle-policy --repository-name loja-imagens"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "delete-lifecycle-policy") && !!repo(c, "loja-imagens") && !(repo(c, "loja-imagens") || {}).lifecycle),
    d("ctn-ecr10", "ecr", 3, 100, "O checkout vai ser arquivado",
      "O cliente do checkout encerrou o contrato e o jurídico pediu que as imagens fiquem guardadas como estão. Remova a regra de limpeza do <b>pagamentos/checkout-api</b> pra nada mais ser apagado.",
      ["Mesmo comando, no repositório do projeto."],
      ["aws ecr delete-lifecycle-policy --repository-name pagamentos/checkout-api"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "delete-lifecycle-policy") && !!repo(c, "pagamentos/checkout-api") && !(repo(c, "pagamentos/checkout-api") || {}).lifecycle),
    d("ctn-ecr11", "ecr", 3, 90, "O login por baixo do atalho",
      "Você já usou o <b>get-login-password</b>. Agora veja o que ele faz por baixo: peça o <b>token de autorização</b> cru e repare que ele vem em base64, no formato <code>AWS:senha</code>.",
      ["É o `get-authorization-token`, sem argumento nenhum.", "O token vale 12 horas — é por isso que pipeline de CI faz login a cada execução."],
      ["aws ecr get-authorization-token"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "get-authorization-token")),
    d("ctn-ecr12", "ecr", 3, 100, "Quando o token vence?",
      "O pipeline de CI falha de madrugada com <i>no basic auth credentials</i>, e a suspeita é o token vencido. Peça o token de novo, mas mostre só a <b>data em que ele expira</b>.",
      ["O mesmo comando, com um `--query` que pega só um campo.", "O campo fica dentro da lista authorizationData: `authorizationData[0].expiresAt`."],
      ["aws ecr get-authorization-token --query authorizationData[0].expiresAt"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "get-authorization-token") && /expiresAt/.test(String(cmd.flags.query || ""))),
  ]);

  // ---------- EKS: escala, upgrade e addons ----------
  at("eks-6", [
    d("ctn-eks1", "eks", 3, 80, "Como está o grupo de nós?",
      "O time subiu mais réplicas e metade dos pods ficou <b>Pending</b>. Antes de mexer, olhe o grupo de nós <b>nos-app</b> do <b>cluster-k8s</b>: tipo de máquina e a escala atual.",
      ["O `list-nodegroups` só dá o nome; o detalhe é o `describe-` do mesmo recurso.", "Ele pede o cluster E o nome do grupo."],
      ["aws eks describe-nodegroup --cluster-name cluster-k8s --nodegroup-name nos-app"],
      (c, cmd, ok) => ok && ehCmd(cmd, "eks", "describe-nodegroup")),
    d("ctn-eks2", "eks", 3, 110, "Os pods estão Pending: faltou máquina",
      "Não é problema do Kubernetes, é falta de nó. Aumente a escala do <b>nos-app</b> pra <b>minSize=2, maxSize=6, desiredSize=4</b>.",
      ["Mudar a escala é `update-nodegroup-config`, e a configuração vai em `--scaling-config`.", "A forma é `minSize=<n>,maxSize=<n>,desiredSize=<n>` — e o desejado precisa caber entre os dois."],
      ["aws eks update-nodegroup-config --cluster-name cluster-k8s --nodegroup-name nos-app --scaling-config minSize=2,maxSize=6,desiredSize=4"],
      (c) => escalaDe(c).desiredSize === 4),
    d("ctn-eks3", "eks", 3, 90, "A mudança já terminou?",
      "Mudar a escala não é instantâneo: a AWS devolveu um <b>id de atualização</b>. Acompanhe essa atualização do <b>cluster-k8s</b> até ela aparecer como concluída.",
      ["O id veio na resposta do comando anterior.", "O comando que acompanha é o `describe-update`, com o nome do cluster e o `--update-id`."],
      ["aws eks describe-update --name cluster-k8s --update-id <update-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "eks", "describe-update")),
    d("ctn-eks4", "eks", 3, 100, "Passou o pico, devolva as máquinas",
      "A campanha acabou e quatro nós parados custam dinheiro todo dia. Volte o <b>nos-app</b> pra <b>minSize=1, maxSize=3, desiredSize=2</b>.",
      ["Mesmo comando da escala, com números menores."],
      ["aws eks update-nodegroup-config --cluster-name cluster-k8s --nodegroup-name nos-app --scaling-config minSize=1,maxSize=3,desiredSize=2"],
      (c, cmd, ok) => ok && ehCmd(cmd, "eks", "update-nodegroup-config") && escalaDe(c).desiredSize === 2),
    d("ctn-eks5", "eks", 3, 80, "Confira que voltou",
      "O financeiro vai perguntar. Descreva o <b>nos-app</b> de novo e confirme que o <code>desiredSize</code> está em 2.",
      ["Mesmo retrato do grupo de nós de antes."],
      ["aws eks describe-nodegroup --cluster-name cluster-k8s --nodegroup-name nos-app"],
      (c, cmd, ok) => ok && ehCmd(cmd, "eks", "describe-nodegroup") && escalaDe(c).desiredSize === 2),
    d("ctn-eks6", "eks", 3, 130, "Upgrade do cluster, na ordem certa",
      "A versão do cluster vai sair de suporte. Suba o <b>cluster-k8s</b> da <b>1.31</b> pra <b>1.32</b>. <small>(é só metade do trabalho: os nós continuam na versão antiga — a ordem é control plane ➜ nodegroup ➜ addons)</small>",
      ["O EKS só SOBE, e de uma versão menor por vez: não dá pra pular da 1.31 pra 1.33 nem voltar atrás.", "O comando é o `update-cluster-version`, com `--kubernetes-version`."],
      ["aws eks update-cluster-version --name cluster-k8s --kubernetes-version 1.32"],
      (c) => (clusterEks(c, "cluster-k8s") || {}).versao === "1.32"),
    d("ctn-eks7", "eks", 3, 90, "O upgrade foi até o fim?",
      "Upgrade de control plane leva dezenas de minutos no mundo real. Acompanhe a atualização de versão do <b>cluster-k8s</b> pelo id que ela devolveu.",
      ["Mesmo comando de acompanhar a mudança de escala — agora com o id do upgrade."],
      ["aws eks describe-update --name cluster-k8s --update-id <update-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "eks", "describe-update") && /^1\.3[23]$/.test(String((clusterEks(c, "cluster-k8s") || {}).versao))),
    d("ctn-eks8", "eks", 3, 120, "Mais um degrau: 1.33",
      "A 1.32 também entra em suporte estendido (e pago) em poucos meses. Suba o <b>cluster-k8s</b> mais uma versão: <b>1.33</b>.",
      ["Um degrau por vez: da versão atual, só a seguinte."],
      ["aws eks update-cluster-version --name cluster-k8s --kubernetes-version 1.33"],
      (c) => (clusterEks(c, "cluster-k8s") || {}).versao === "1.33"),
    d("ctn-eks9", "eks", 3, 80, "Que componentes a AWS cuida por você?",
      "Antes de rodar banco no cluster, veja quais <b>addons gerenciados</b> o <b>cluster-k8s</b> já tem.",
      ["Addon gerenciado é a AWS cuidando da versão e da compatibilidade daquele componente.", "O comando é o `list-addons`, com o nome do cluster."],
      ["aws eks list-addons --cluster-name cluster-k8s"],
      (c, cmd, ok) => ok && ehCmd(cmd, "eks", "list-addons")),
    d("ctn-eks10", "eks", 3, 120, "O pod que pede disco fica Pending pra sempre",
      "Cluster novo não sabe criar volume sozinho: sem o driver de EBS, todo pod que pede disco fica <b>Pending</b> e o erro não explica por quê. Instale o addon <b>aws-ebs-csi-driver</b> no <b>cluster-k8s</b>.",
      ["Criar addon é `create-addon`, com o cluster e o `--addon-name`.", "O nome do addon é exatamente `aws-ebs-csi-driver`."],
      ["aws eks create-addon --cluster-name cluster-k8s --addon-name aws-ebs-csi-driver"],
      (c) => temAddon(c, "aws-ebs-csi-driver")),
    d("ctn-eks11", "eks", 3, 110, "Métricas e logs dos pods",
      "O time de plantão não enxerga nada do que acontece dentro do cluster. Instale o addon <b>amazon-cloudwatch-observability</b> no <b>cluster-k8s</b> — ele manda métricas e logs dos pods pro CloudWatch.",
      ["Mesmo comando do driver de disco, outro addon."],
      ["aws eks create-addon --cluster-name cluster-k8s --addon-name amazon-cloudwatch-observability"],
      (c) => temAddon(c, "amazon-cloudwatch-observability")),
    d("ctn-eks12", "eks", 3, 80, "Confira os dois addons",
      "Antes de fechar o chamado, liste os addons do <b>cluster-k8s</b> e confirme que os dois que você instalou aparecem.",
      ["Mesma listagem do começo — agora ela não vem vazia."],
      ["aws eks list-addons --cluster-name cluster-k8s"],
      (c, cmd, ok) => ok && ehCmd(cmd, "eks", "list-addons") && temAddon(c, "aws-ebs-csi-driver") && temAddon(c, "amazon-cloudwatch-observability")),
  ]);
})();
