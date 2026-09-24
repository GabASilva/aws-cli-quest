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
  const repo = (c, n) => ((c.ecr || {}).repositorios || {})[n];
  const ngDe = (c, cl, n) => Object.values(((c.eks || {}).nodegroups) || {}).find((x) => x.cluster === cl && x.nome === n);
  const clusterEks = (c, n) => ((c.eks || {}).clusters || {})[n];

  at("cob-ecs-2", [
    d("ctn-run1", "ecs", 3, 130, "A migração do banco não é um serviço",
      "Antes do deploy, alguém precisa rodar a migração do banco — UMA vez, não ficar de pé pra sempre. Crie o cluster <b>producao-app</b>, registre a receita <b>migracao-banco</b> e rode ela como tarefa avulsa em <b>FARGATE</b>, já com o <b>acesso por exec ligado</b>.",
      ["O `create-service` manteria a migração rodando pra sempre e ela se repetiria — não é isso que você quer.", "O que roda uma vez e acabou e o `run-task`. A receita vem do arquivo pronto `file://tarefa-web.json` (digite `ls`).", "O `--enable-execute-command` precisa ir AGORA: não dá pra ligar depois sem recriar a tarefa."],
      ["aws ecs create-cluster --cluster-name producao-app",
        "aws ecs register-task-definition --family migracao-banco --container-definitions file://tarefa-web.json",
        "aws ecs run-task --cluster producao-app --task-definition migracao-banco --launch-type FARGATE --enable-execute-command"],
      (c) => execs(c).some((t) => t.familia === "migracao-banco" && t.exec)),
    d("ctn-exec1", "ecs", 3, 140, "Preciso ver o que tem dentro do container",
      "A migração travou e você precisa olhar de dentro. Liste as tarefas do <b>producao-app</b> e <b>entre</b> no container <b>migração</b> rodando <b>/bin/sh</b> em modo interativo. <small>(sem SSH, sem porta aberta, sem imagem com sshd)</small>",
      ["Primeiro liste pra pegar o id da tarefa.", "O comando que entra no container é o `execute-command` — e ele exige `--interactive`.", "Se der erro dizendo que exec não estava ligado, é porque a tarefa nasceu sem a flag: recriar é o único jeito."],
      ["aws ecs list-tasks --cluster producao-app",
        "aws ecs execute-command --cluster producao-app --task <tarefa-id> --container migracao --command \"/bin/sh\" --interactive"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "execute-command")),
    d("ctn-diag1", "ecs", 3, 130, "Por que a tarefa morreu?",
      "A tarefa parou sozinha e o time quer saber por que. <b>Pare</b> a tarefa deixando o motivo <b>investigacao-de-memoria</b>, e depois <b>descreva</b> ela pra ver o campo que guarda a causa. <small>(o stoppedReason é onde mora a resposta — e quase ninguém sabe olhar aí)</small>",
      ["Parar pede o cluster e o id da tarefa, mais o `--reason`.", "Depois, o `describe-tasks` mostra o stoppedReason e o exitCode do container.", "OutOfMemoryError quer dizer que o container estourou a memória declarada na task definition."],
      ["aws ecs stop-task --cluster producao-app --task <tarefa-id> --reason investigacao-de-memoria",
        "aws ecs describe-tasks --cluster producao-app --tasks <tarefa-id>"],
      (c) => execs(c).some((t) => t.estado === "STOPPED" && String(t.motivo).indexOf("investigacao") >= 0)),
    d("ctn-td1", "ecs", 3, 110, "Volte pra revisão anterior",
      "Deploy ruim no ar. Você não precisa recriar nada: task definition e <b>imutavel</b> e as revisões antigas continuam lá. Veja a receita <b>migracao-banco</b> e depois marque ela como inativa, pra ninguém criar coisa nova em cima dela.",
      ["Primeiro olhe o que tem dentro com o `describe-task-definition`.", "Marcar como inativa e `deregister-task-definition` — que NÃO apaga: quem já usa continua rodando."],
      ["aws ecs describe-task-definition --task-definition migracao-banco",
        "aws ecs deregister-task-definition --task-definition migracao-banco"],
      (c) => !!(((c.ecs || {}).tarefas || {})["migracao-banco"] || {}).inativa),
    d("ctn-cl1", "ecs", 3, 90, "O retrato do cluster",
      "Reuniao daqui a cinco minutos e perguntaram quantas coisas estão rodando. Descreva o cluster <b>producao-app</b>: tarefas rodando, pendentes e serviços ativos numa linha só.",
      ["A flag aqui é `--clusters`, no plural — dá pra perguntar por vários de uma vez.", "Repare nos contadores: runningTasksCount, pendingTasksCount e activeServicesCount."],
      ["aws ecs describe-clusters --clusters producao-app"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "describe-clusters")),
  ]);

  at("ecr-5", [
    d("ctn-ecr1", "ecr", 3, 120, "O registro cresceu 400 GB sem ninguém ver",
      "Cada build deixa uma imagem no repositório, e você paga por GB. Crie o repositório <b>api-antiga</b> e apague as imagens <b>v1</b> e <b>v2</b> de uma vez. <small>(isso resolve hoje; a política de ciclo de vida resolve pra sempre)</small>",
      ["Apagar imagem é em LOTE: `batch-delete-image`.", "Cada imagem vai na forma `imageTag=<tag>`, separadas por espaço.", "A resposta separa o que foi apagado do que não existia."],
      ["aws ecr create-repository --repository-name api-antiga",
        "aws ecr batch-delete-image --repository-name api-antiga --image-ids imageTag=v1 imageTag=v2"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "batch-delete-image") && !!repo(c, "api-antiga")),
    d("ctn-ecr2", "ecr", 3, 130, "Produção precisa puxar a imagem que o build publicou",
      "A empresa tem conta separada por ambiente: o build publica numa conta, produção roda noutra. Libere o repositório <b>api-antiga</b> pra outra conta com uma política de repositório, e confira o que ficou valendo.",
      ["Política de repositório se grava com `set-repository-policy`, e o documento vai em `--policy-text`.", "Use o arquivo pronto: `file://politica-publica.json` (digite `ls` pra ver).", "Depois existe o `get-…` do mesmo par."],
      ["aws ecr set-repository-policy --repository-name api-antiga --policy-text file://politica-publica.json",
        "aws ecr get-repository-policy --repository-name api-antiga"],
      (c) => !!((repo(c, "api-antiga") || {}).politica)),
    d("ctn-ecr3", "ecr", 3, 100, "O login por baixo do atalho",
      "Você já usou o <b>get-login-password</b>. Agora veja o que ele faz por baixo: peça o <b>token de autorizacao</b> cru e repare que ele vem em base64, no formato <code>AWS:senha</code>.",
      ["É o `get-authorization-token`, sem argumento nenhum.", "O token vale 12 horas — é por isso que pipeline de CI faz login a cada execução."],
      ["aws ecr get-authorization-token"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "get-authorization-token")),
  ]);

  at("eks-6", [
    d("ctn-eks1", "eks", 3, 120, "Os pods estão Pending: faltou máquina",
      "O time subiu mais replicas e metade dos pods ficou <b>Pending</b> — não é problema do Kubernetes, e falta de no. Veja o grupo de nos <b>nos-app</b> do cluster <b>cluster-k8s</b> e aumente a escala pra <b>minSize=2, maxSize=6, desiredSize=4</b>.",
      ["Primeiro olhe como está, com o `describe-nodegroup`.", "Mudar a escala e `update-nodegroup-config`, e a configuração vai em `--scaling-config`.", "A forma e `minSize=<n>,maxSize=<n>,desiredSize=<n>` — e o desejado precisa caber entre os dois."],
      ["aws eks describe-nodegroup --cluster-name cluster-k8s --nodegroup-name nos-app",
        "aws eks update-nodegroup-config --cluster-name cluster-k8s --nodegroup-name nos-app --scaling-config minSize=2,maxSize=6,desiredSize=4"],
      (c) => (((ngDe(c, "cluster-k8s", "nos-app") || {}).escala) || {}).desiredSize === 4),
    d("ctn-eks2", "eks", 3, 140, "Upgrade do cluster, na ordem certa",
      "A versão do cluster vai sair de suporte. Suba o <b>cluster-k8s</b> da <b>1.31</b> pra <b>1.32</b> e acompanhe a atualização. <small>(e só metade do trabalho: os nos continuam na versão antiga — a ordem e control plane ➜ nodegroup ➜ addons)</small>",
      ["O EKS só SOBE, e de uma versão menor por vez: não dá pra pular da 1.31 pra 1.33 nem voltar atrás.", "O comando devolve um id de atualização; existe um `describe-…` pra acompanhar."],
      ["aws eks update-cluster-version --name cluster-k8s --kubernetes-version 1.32",
        "aws eks describe-update --name cluster-k8s --update-id <update-id>"],
      (c) => (clusterEks(c, "cluster-k8s") || {}).versao === "1.32"),
    d("ctn-eks3", "eks", 3, 130, "O pod que pede disco fica Pending pra sempre",
      "Cluster novo não sabe criar volume sozinho: sem o driver de EBS, todo pod que pede disco fica <b>Pending</b> e o erro não explica por que. Liste os addons do <b>cluster-k8s</b> e instale o <b>aws-ebs-csi-driver</b>.",
      ["Addon gerenciado é a AWS cuidando da versão e da compatibilidade daquele componente.", "Primeiro liste o que já existe, depois crie o que falta.", "O nome do addon é exatamente `aws-ebs-csi-driver`."],
      ["aws eks list-addons --cluster-name cluster-k8s",
        "aws eks create-addon --cluster-name cluster-k8s --addon-name aws-ebs-csi-driver"],
      (c) => (((clusterEks(c, "cluster-k8s") || {}).addons) || []).some((a) => a.nome === "aws-ebs-csi-driver")),
  ]);
})();
