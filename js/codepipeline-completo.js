"use strict";
// ============================================================
// CLImb — codepipeline-completo.js
// AWS CodePipeline: a esteira que amarra a família Code — código no
// CodeCommit → build no CodeBuild → (aprovação) → deploy no CodeDeploy.
// É o clímax do grupo CI/CD.
//
// Fontes (25/09/2026): exemplos do `aws codepipeline <cmd> help` (AWS CLI
// 2.35.8), API Reference (CreatePipeline, RetryStageExecution,
// PutApprovalResult) e o guia (pipelines-create: "The pipeline starts to run
// after you create it"; pelo CLI o bucket de artefatos "must already exist"
// e a detecção de commit — regra do EventBridge — tem de ser criada à parte,
// por isso aqui a esteira só roda de novo com start-pipeline-execution).
//
// A esteira CONVERSA com os outros motores, como na AWS:
//   - Source (CodeCommit): lê a ponta da branch no conta.codecommit;
//   - Build (CodeBuild): dispara um build de verdade no conta.codebuild
//     (SERVICOS.codebuild["start-build"]); o resultado vem do buildspec.yml
//     do commit — sem ele, YAML_FILE_ERROR; com "exit 1", falha no BUILD;
//   - Deploy (CodeDeploy): grava o artefato no bucket da esteira e chama o
//     SERVICOS.deploy["create-deployment"] — frota por tag, igual à trilha;
//   - Aprovação manual: espera o put-approval-result com o token.
// Ela avança UM estágio a cada consulta (get-pipeline-state,
// get-pipeline-execution, list-pipeline-executions, list-action-executions).
// Mensagens de errorDetails dos jobs: "Build terminated with state: FAILED"
// é o texto que o CodePipeline mostra; as de Source e Deploy são aproximadas.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined") return;

  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";
  const agora = () => Math.round(Date.now()) / 1000;
  const uuid = () => `${hexAleatorio(8)}-${hexAleatorio(4)}-${hexAleatorio(4)}-${hexAleatorio(4)}-${hexAleatorio(12)}`;
  const erro = (op, tipo, msg) => new ErroCli(`An error occurred (${tipo}) when calling the ${op} operation: ${msg}`);
  const NAO_ACHEI = "The pipeline was specified in an invalid format or cannot be found.";
  const PROVEDORES = { Source: ["CodeCommit", "S3"], Build: ["CodeBuild"], Deploy: ["CodeDeploy"], Approval: ["Manual"] };

  function st(conta) {
    conta.codepipeline = conta.codepipeline || { esteiras: {}, execucoes: {}, apagadas: [] };
    return conta.codepipeline;
  }
  function esteiraDe(conta, nome, op) {
    const e = st(conta).esteiras[String(nome)];
    if (!e) throw erro(op, "PipelineNotFoundException", `${NAO_ACHEI}\nNão existe esteira ${nome}. Veja as que existem com: aws codepipeline list-pipelines`);
    return e;
  }
  function execDe(conta, e, id, op) {
    const x = st(conta).execucoes[String(id)];
    if (!x || x.esteira !== e.nome) throw erro(op, "PipelineExecutionNotFoundException", `The pipeline execution was specified in an invalid format or cannot be found, or an execution ID does not belong to the specified pipeline.\nOs ids saem de: aws codepipeline list-pipeline-executions --pipeline-name ${e.nome}`);
    return x;
  }

  // ---------- a planta: --cli-input-json file://x.json ou --pipeline file://x.json ----------
  function lerPlanta(conta, flags, op) {
    const bruto = flags["cli-input-json"] !== undefined ? flags["cli-input-json"] : flags.pipeline;
    if (bruto === undefined) throw new ErroCli("aws: error: the following arguments are required: --pipeline\nNo trabalho a planta mora num arquivo: --cli-input-json file://<arquivo>.json (veja com ls)");
    let texto = String(bruto);
    if (/^file:\/\//.test(texto)) {
      const a = arquivoLocal(texto.slice(7), conta);
      if (!a) throw new ErroCli(`Error parsing parameter '${flags["cli-input-json"] !== undefined ? "cli-input-json" : "pipeline"}': Unable to load paramfile ${texto}: [Errno 2] No such file or directory: '${texto.slice(7)}'`);
      texto = String(a.conteudo || "");
    }
    let obj;
    try { obj = JSON.parse(texto); } catch (e) { throw new ErroCli(`Error parsing parameter: Invalid JSON: ${texto.slice(0, 80)}...`); }
    const p = flags["cli-input-json"] !== undefined ? obj.pipeline : obj;
    if (!p || typeof p !== "object") throw erro(op, "InvalidStructureException", "The structure was specified in an invalid format.\nNo --cli-input-json a planta vai dentro da chave \"pipeline\".");
    return validarPlanta(conta, JSON.parse(JSON.stringify(p)), op);
  }
  function validarPlanta(conta, p, op) {
    if (!p.name || !/^[A-Za-z0-9.@\-_]{1,100}$/.test(p.name)) throw erro(op, "ValidationException", "The validation was specified in an invalid format.\nO nome da esteira (name) usa letras, números, ponto, @, - e _.");
    if (!/^arn:aws:iam::\d{12}:role\/.+/.test(String(p.roleArn || ""))) throw erro(op, "InvalidStructureException", "The structure was specified in an invalid format.\nFaltou o roleArn: o ARN da role que a esteira assume, ex.: arn:aws:iam::123456789012:role/codepipeline-servico");
    const loja = p.artifactStore || {};
    if (loja.type !== "S3" || !loja.location) throw erro(op, "InvalidStructureException", "The structure was specified in an invalid format.\nFaltou o artifactStore: {\"type\": \"S3\", \"location\": \"<bucket>\"} — o bucket onde a esteira passa os pacotes de um estágio pro outro.");
    if (!(conta.s3 && conta.s3.buckets && conta.s3.buckets[loja.location])) throw erro(op, "InvalidStructureException", `The structure was specified in an invalid format.\nO bucket de artefatos ${loja.location} não existe. Pelo CLI ele precisa existir ANTES da esteira: aws s3 mb s3://${loja.location}`);
    const estagios = Array.isArray(p.stages) ? p.stages : [];
    if (estagios.length < 2) throw erro(op, "InvalidStructureException", "The structure was specified in an invalid format.\nUma esteira tem no mínimo 2 estágios: o de origem (Source) e pelo menos um de build ou deploy.");
    estagios.forEach((s, i) => {
      if (!s.name || !Array.isArray(s.actions) || !s.actions.length) throw erro(op, "InvalidStageDeclarationException", `The stage declaration was specified in an invalid format.\nO estágio ${i + 1} precisa de name e de pelo menos uma action.`);
      for (const a of s.actions) {
        const t = a.actionTypeId || {};
        if (!a.name || !t.category || !t.provider) throw erro(op, "InvalidActionDeclarationException", `The action declaration was specified in an invalid format.\nCada action precisa de name e de actionTypeId (category, owner, provider, version). Estágio: ${s.name}`);
        if (!PROVEDORES[t.category] || PROVEDORES[t.category].indexOf(t.provider) < 0) throw erro(op, "InvalidActionDeclarationException", `The action declaration was specified in an invalid format.\n${t.category}/${t.provider}: o simulador entende Source/CodeCommit, Build/CodeBuild, Approval/Manual e Deploy/CodeDeploy.`);
        if ((t.category === "Source") !== (i === 0)) throw erro(op, "InvalidStageDeclarationException", "The stage declaration was specified in an invalid format.\nAção de origem (Source) só no PRIMEIRO estágio — e o primeiro estágio só tem ações de origem.");
        a.runOrder = a.runOrder || 1;
        a.inputArtifacts = a.inputArtifacts || [];
        a.outputArtifacts = a.outputArtifacts || [];
        a.configuration = a.configuration || {};
      }
    });
    p.pipelineType = p.pipelineType || "V1";
    p.executionMode = p.executionMode || "SUPERSEDED";
    return p;
  }

  // ---------- a execução: um estágio por consulta ----------
  function acaoDe(s, nome) { return s.acoes.find((a) => a.nome === nome); }
  function novaExecucao(conta, e, gatilho) {
    const s = st(conta);
    // modo SUPERSEDED: a execução nova toma o lugar da que estava rodando
    for (const x of Object.values(s.execucoes)) {
      if (x.esteira === e.nome && (x.status === "InProgress")) { x.status = "Superseded"; x.atualizado = agora(); }
    }
    const x = {
      id: uuid(), esteira: e.nome, versao: e.versao, status: "InProgress", inicio: agora(), atualizado: agora(),
      gatilho, idx: 0, revisao: null, artefato: null, parar: false, motivoParada: "",
      estagios: e.planta.stages.map((g) => ({ nome: g.name, status: null, acoes: g.actions.map((a) => ({ nome: a.name, tipo: a.actionTypeId.category, provedor: a.actionTypeId.provider, config: a.configuration, status: null })) })),
    };
    s.execucoes[x.id] = x;
    entrar(conta, e, x);
    return x;
  }
  // o estágio atual começa: dispara o job de cada ação
  function entrar(conta, e, x) {
    const g = x.estagios[x.idx];
    const trans = (e.transicoes || {})[g.nome];
    if (x.idx > 0 && trans && trans.enabled === false) { x.esperando = true; return; }
    x.esperando = false;
    g.status = "InProgress";
    for (const a of g.acoes) iniciarAcao(conta, e, x, a);
  }
  function iniciarAcao(conta, e, x, a) {
    a.status = "InProgress"; a.inicio = agora(); a.fim = undefined; a.erro = undefined; a.resumo = undefined;
    a.execId = uuid();
    if (a.tipo === "Approval") { a.token = uuid(); a.resumo = undefined; return; }
    if (a.tipo === "Build") {
      try {
        const saida = SERVICOS.codebuild["start-build"](conta, [], { "project-name": a.config.ProjectName, "source-version": x.revisao || undefined });
        const id = JSON.parse(saida).build.id;
        a.externo = id;
        const b = conta.codebuild.builds[id];
        // o resultado vem do buildspec.yml que a esteira trouxe do repositório
        if (b && x.buildspec === null) b.quebra = "sem-buildspec";
        else if (b && /exit\s+1/.test(String(x.buildspec || ""))) b.quebra = "exit";
      } catch (err) {
        a.status = "Failed"; a.fim = agora();
        a.erro = { code: "JobFailed", message: "Error calling startBuild: " + String(err.message).split("\n")[0].replace(/^An error occurred \(\w+\) when calling the \w+ operation: /, "") };
      }
    }
    if (a.tipo === "Deploy") {
      try {
        const saida = SERVICOS.deploy["create-deployment"](conta, [], {
          "application-name": a.config.ApplicationName, "deployment-group-name": a.config.DeploymentGroupName,
          "s3-location": `bucket=${e.planta.artifactStore.location},key=${x.artefato || "sem-artefato"},bundleType=zip`,
        });
        a.externo = JSON.parse(saida).deploymentId;
      } catch (err) {
        a.status = "Failed"; a.fim = agora();
        a.erro = { code: "JobFailed", message: String(err.message).split("\n")[0].replace(/^An error occurred \(\w+\) when calling the \w+ operation: /, "") };
      }
    }
  }
  // resolve o que dá pra resolver numa consulta
  function resolverAcao(conta, e, x, a) {
    if (a.status !== "InProgress") return;
    if (a.tipo === "Source") {
      const r = ((conta.codecommit || {}).repos || {})[a.config.RepositoryName];
      const ponta = r && r.branches[a.config.BranchName];
      a.fim = agora();
      if (!r) { a.status = "Failed"; a.erro = { code: "JobFailed", message: `The repository ${a.config.RepositoryName} does not exist in CodeCommit.` }; return; }
      if (!ponta) { a.status = "Failed"; a.erro = { code: "JobFailed", message: `The branch ${a.config.BranchName} does not exist in the repository ${a.config.RepositoryName}.` }; return; }
      const commit = r.commits[ponta];
      x.revisao = ponta;
      x.resumoRevisao = commit.mensagem || "";
      const bs = commit.arvore["buildspec.yml"];
      x.buildspec = bs ? bs.conteudo : null;
      a.status = "Succeeded"; a.resumo = commit.mensagem || undefined; a.externo = ponta;
      return;
    }
    if (a.tipo === "Build") {
      if (!a.externo) return;
      SERVICOS.codebuild["batch-get-builds"](conta, [], { ids: a.externo });
      SERVICOS.codebuild["batch-get-builds"](conta, [], { ids: a.externo });
      const b = conta.codebuild.builds[a.externo];
      a.fim = agora();
      if (b && b.status === "SUCCEEDED") {
        a.status = "Succeeded";
        // o artefato do build vai pro bucket da esteira: é ele que o deploy baixa
        const chave = `${e.nome.slice(0, 20)}/BuildArtif/${hexAleatorio(7)}`;
        const bk = conta.s3.buckets[e.planta.artifactStore.location];
        if (bk) { bk.objetos[chave] = { tamanho: 30215, enviadoEm: dataFormatada() }; x.artefato = chave; }
      } else {
        a.status = "Failed";
        a.erro = { code: "JobFailed", message: `Build terminated with state: ${b ? b.status : "FAILED"}` };
      }
      return;
    }
    if (a.tipo === "Deploy") {
      if (!a.externo) return;
      SERVICOS.deploy["get-deployment"](conta, [], { "deployment-id": a.externo });
      SERVICOS.deploy["get-deployment"](conta, [], { "deployment-id": a.externo });
      const d = conta.codedeploy.deploys[a.externo];
      a.fim = agora();
      if (d && d.status === "Succeeded") { a.status = "Succeeded"; a.resumo = "Deployment Succeeded"; }
      else { a.status = "Failed"; a.erro = { code: "JobFailed", message: `Deployment ${a.externo} failed: ${d && d.erro ? d.erro.code : "Failed"}` }; }
    }
    // Approval: só o put-approval-result resolve
  }
  function fecharEstagio(conta, e, x) {
    const g = x.estagios[x.idx];
    if (g.acoes.some((a) => a.status === "InProgress" || a.status === null)) return false;
    if (g.acoes.some((a) => a.status === "Failed")) { g.status = "Failed"; x.status = "Failed"; x.atualizado = agora(); return true; }
    g.status = "Succeeded";
    if (x.parar) { x.status = "Stopped"; x.atualizado = agora(); return true; }
    if (x.idx + 1 >= x.estagios.length) { x.status = "Succeeded"; x.atualizado = agora(); return true; }
    x.idx += 1;
    entrar(conta, e, x);
    x.atualizado = agora();
    return true;
  }
  // uma consulta = um passo em cada execução viva da esteira
  function passo(conta, e) {
    for (const x of Object.values(st(conta).execucoes)) {
      if (x.esteira !== e.nome) continue;
      if (x.status === "Stopping") { x.status = "Stopped"; x.atualizado = agora(); continue; }
      if (x.status !== "InProgress") continue;
      if (x.esperando) {
        const trans = (e.transicoes || {})[x.estagios[x.idx].nome];
        if (!trans || trans.enabled !== false) entrar(conta, e, x);
        continue;
      }
      const g = x.estagios[x.idx];
      for (const a of g.acoes) resolverAcao(conta, e, x, a);
      fecharEstagio(conta, e, x);
    }
    avisarClimb(null);
  }

  // ---------- saídas ----------
  function metadados(conta, e) {
    return { pipelineArn: `arn:aws:codepipeline:${REGIAO(conta)}:${CONTA_ID(conta)}:${e.nome}`, created: e.criada, updated: e.atualizada };
  }
  function plantaJson(e) { return Object.assign({}, e.planta, { version: e.versao }); }
  function ultimaExec(conta, e) {
    return Object.values(st(conta).execucoes).filter((x) => x.esteira === e.nome).sort((a, b) => b.inicio - a.inicio || 0).find(() => true);
  }
  function execDoEstagio(conta, e, nome) {
    // a execução mais recente que chegou nesse estágio
    return Object.values(st(conta).execucoes).filter((x) => x.esteira === e.nome && x.estagios.some((g) => g.nome === nome && g.status))
      .sort((a, b) => b.inicio - a.inicio)[0];
  }
  function execucaoAcao(conta, e, x, a) {
    const r = { actionExecutionId: a.execId, status: a.status, lastStatusChange: a.fim || a.inicio };
    if (a.resumo) r.summary = a.resumo;
    if (a.token && a.status === "InProgress") r.token = a.token;
    if (a.externo) {
      r.externalExecutionId = a.externo;
      if (a.tipo === "Build") r.externalExecutionUrl = `https://console.aws.amazon.com/codebuild/home?region=${REGIAO(conta)}#/builds/${a.externo}/view/new`;
      if (a.tipo === "Deploy") r.externalExecutionUrl = `https://console.aws.amazon.com/codedeploy/home?region=${REGIAO(conta)}#/deployments/${a.externo}`;
    }
    if (a.erro) r.errorDetails = a.erro;
    return r;
  }
  function execJson(conta, e, x) {
    return {
      pipelineName: e.nome, pipelineVersion: x.versao, pipelineExecutionId: x.id, status: x.status,
      statusSummary: x.motivoParada || undefined,
      artifactRevisions: x.revisao ? [{ name: "SourceArtifact", revisionId: x.revisao, revisionSummary: x.resumoRevisao || undefined, created: x.inicio }] : [],
      trigger: x.gatilho, executionMode: e.planta.executionMode, executionType: "STANDARD",
    };
  }

  SERVICOS.codepipeline = {
    "list-pipelines": (conta) => {
      const l = Object.values(st(conta).esteiras);
      if (!l.length) avisarClimb("Nenhuma esteira ainda. A esteira é o que liga as peças: pega o commit, manda pro build e entrega o resultado — sem ninguém rodar comando no meio.");
      return js({ pipelines: l.map((e) => ({ name: e.nome, version: e.versao, pipelineType: e.planta.pipelineType, executionMode: e.planta.executionMode, created: e.criada, updated: e.atualizada })) });
    },
    "create-pipeline": (conta, pos, flags) => {
      const s = st(conta);
      const p = lerPlanta(conta, flags, "CreatePipeline");
      if (s.esteiras[p.name]) throw erro("CreatePipeline", "PipelineNameInUseException", `The specified pipeline name is already in use: ${p.name}`);
      const t = agora();
      delete p.version;
      s.esteiras[p.name] = { nome: p.name, versao: 1, planta: p, criada: t, atualizada: t, transicoes: {} };
      const x = novaExecucao(conta, s.esteiras[p.name], { triggerType: "CreatePipeline", triggerDetail: `arn:aws:iam::${CONTA_ID(conta)}:user/estudante` });
      avisarClimb(`Esteira criada — e ela já começou a rodar sozinha (execução ${x.id}). Acompanhe com: aws codepipeline get-pipeline-state --name ${p.name}  · Detalhe: criada pelo CLI, ela NÃO roda sozinha a cada commit (isso pede uma regra do EventBridge); pra rodar de novo, start-pipeline-execution.`);
      return js({ pipeline: plantaJson(s.esteiras[p.name]) });
    },
    "get-pipeline": (conta, pos, flags) => {
      const e = esteiraDe(conta, exigirFlag(flags, "name"), "GetPipeline");
      return js({ pipeline: plantaJson(e), metadata: metadados(conta, e) });
    },
    "update-pipeline": (conta, pos, flags) => {
      const p = lerPlanta(conta, flags, "UpdatePipeline");
      const e = esteiraDe(conta, p.name, "UpdatePipeline");
      delete p.version;
      e.planta = p; e.versao += 1; e.atualizada = agora();
      avisarClimb(`Esteira atualizada pra versão ${e.versao}. Mudar a planta não roda a esteira — a próxima execução (start-pipeline-execution) já usa a nova.`);
      return js({ pipeline: plantaJson(e) });
    },
    "delete-pipeline": (conta, pos, flags) => {
      const s = st(conta);
      const nome = String(exigirFlag(flags, "name"));
      if (!s.esteiras[nome]) { avisarClimb("Essa esteira não existia — a AWS responde sucesso mesmo assim."); return ""; }
      delete s.esteiras[nome];
      s.apagadas.push(nome);
      avisarClimb("Esteira apagada. O repositório, o projeto de build e o deploy continuam existindo — só some a esteira que ligava os três. Os pacotes antigos continuam no bucket de artefatos.");
      return "";
    },
    "get-pipeline-state": (conta, pos, flags) => {
      const e = esteiraDe(conta, exigirFlag(flags, "name"), "GetPipelineState");
      passo(conta, e);
      const estados = e.planta.stages.map((g, i) => {
        const x = execDoEstagio(conta, e, g.name);
        const ge = x && x.estagios.find((y) => y.nome === g.name);
        const trans = (e.transicoes || {})[g.name];
        const o = { stageName: g.name };
        if (i > 0) o.inboundTransitionState = trans ? Object.assign({}, trans) : { enabled: true };
        o.actionStates = g.actions.map((a) => {
          const ae = ge && acaoDe(ge, a.name);
          const r = { actionName: a.name };
          if (ae && ae.status) r.latestExecution = execucaoAcao(conta, e, x, ae);
          if (a.actionTypeId.category === "Source" && x && x.revisao) r.currentRevision = { revisionId: x.revisao };
          return r;
        });
        if (ge && ge.status) o.latestExecution = { pipelineExecutionId: x.id, status: ge.status };
        const espera = Object.values(st(conta).execucoes).find((y) => y.esteira === e.nome && y.status === "InProgress" && y.esperando && y.estagios[y.idx].nome === g.name);
        if (espera) o.inboundExecution = { pipelineExecutionId: espera.id, status: "InProgress" };
        return o;
      });
      const x = ultimaExec(conta, e);
      if (x && x.status === "InProgress" && x.esperando) avisarClimb(`A execução parou na porta do estágio ${x.estagios[x.idx].nome}: a transição de entrada está desligada. Ela espera até alguém ligar de novo (enable-stage-transition).`);
      else if (x && x.status === "InProgress" && x.estagios[x.idx].acoes.some((a) => a.tipo === "Approval" && a.status === "InProgress")) avisarClimb(`Esperando aprovação no estágio ${x.estagios[x.idx].nome}. O token do pedido está em latestExecution.token da ação de aprovação — é ele que o put-approval-result pede.`);
      else if (x && x.status === "InProgress") avisarClimb("Rodando. Cada consulta avança um estágio — consulte de novo.");
      else if (x && x.status === "Failed") avisarClimb("A última execução FALHOU. Procure a ação com status Failed e leia o errorDetails; o externalExecutionId leva ao job de verdade (o build ou o deploy).");
      return js({ pipelineName: e.nome, pipelineVersion: e.versao, stageStates: estados, created: e.criada, updated: e.atualizada });
    },
    "start-pipeline-execution": (conta, pos, flags) => {
      const e = esteiraDe(conta, exigirFlag(flags, "name"), "StartPipelineExecution");
      const x = novaExecucao(conta, e, { triggerType: "StartPipelineExecution", triggerDetail: `arn:aws:iam::${CONTA_ID(conta)}:user/estudante` });
      avisarClimb("Execução nova: ela pega a ponta ATUAL da branch no estágio de origem — é assim que um commit novo entra na esteira. Acompanhe com get-pipeline-state.");
      return js({ pipelineExecutionId: x.id });
    },
    "list-pipeline-executions": (conta, pos, flags) => {
      const e = esteiraDe(conta, exigirFlag(flags, "pipeline-name"), "ListPipelineExecutions");
      passo(conta, e);
      const l = Object.values(st(conta).execucoes).filter((x) => x.esteira === e.nome).sort((a, b) => b.inicio - a.inicio);
      return js({ pipelineExecutionSummaries: l.map((x) => ({
        pipelineExecutionId: x.id, status: x.status, startTime: x.inicio, lastUpdateTime: x.atualizado,
        sourceRevisions: x.revisao ? [{ actionName: e.planta.stages[0].actions[0].name, revisionId: x.revisao, revisionSummary: x.resumoRevisao || undefined }] : [],
        trigger: x.gatilho, executionMode: e.planta.executionMode, executionType: "STANDARD",
        stopTrigger: x.motivoParada ? { reason: x.motivoParada } : undefined,
      })) });
    },
    "get-pipeline-execution": (conta, pos, flags) => {
      const e = esteiraDe(conta, exigirFlag(flags, "pipeline-name"), "GetPipelineExecution");
      passo(conta, e);
      const x = execDe(conta, e, exigirFlag(flags, "pipeline-execution-id"), "GetPipelineExecution");
      return js({ pipelineExecution: execJson(conta, e, x) });
    },
    "list-action-executions": (conta, pos, flags) => {
      const e = esteiraDe(conta, exigirFlag(flags, "pipeline-name"), "ListActionExecutions");
      passo(conta, e);
      let so = null;
      if (flags.filter !== undefined) {
        const f = parsearShorthand(String(flags.filter));
        so = f.pipelineExecutionId || null;
      }
      const det = [];
      const execs = Object.values(st(conta).execucoes).filter((x) => x.esteira === e.nome && (!so || x.id === so)).sort((a, b) => b.inicio - a.inicio);
      for (const x of execs) {
        for (const g of x.estagios.slice().reverse()) for (const a of g.acoes) {
          if (!a.status) continue;
          const out = { executionResult: {} };
          if (a.externo) out.executionResult.externalExecutionId = a.externo;
          if (a.resumo) out.executionResult.externalExecutionSummary = a.resumo;
          if (a.erro) out.executionResult.errorDetails = a.erro;
          det.push({ pipelineExecutionId: x.id, actionExecutionId: a.execId, pipelineVersion: x.versao, stageName: g.nome, actionName: a.nome,
            startTime: a.inicio, lastUpdateTime: a.fim || a.inicio, status: a.status,
            input: { actionTypeId: { category: a.tipo, owner: "AWS", provider: a.provedor, version: "1" }, configuration: a.config, resolvedConfiguration: a.config, region: REGIAO(conta) },
            output: out });
        }
      }
      if (det.some((x) => x.status === "Failed")) avisarClimb("Na ação que falhou, o output.executionResult traz o errorDetails (o motivo resumido) e o externalExecutionId — o id do build ou do deploy, onde está o detalhe completo.");
      return js({ actionExecutionDetails: det });
    },
    "put-approval-result": (conta, pos, flags) => {
      const op = "PutApprovalResult";
      const e = esteiraDe(conta, exigirFlag(flags, "pipeline-name"), op);
      const estagio = String(exigirFlag(flags, "stage-name"));
      const acao = String(exigirFlag(flags, "action-name"));
      const g = e.planta.stages.find((x) => x.name === estagio);
      if (!g) throw erro(op, "StageNotFoundException", `The stage was specified in an invalid format or cannot be found: ${estagio}`);
      if (!g.actions.some((a) => a.name === acao)) throw erro(op, "ActionNotFoundException", `The specified action cannot be found: ${acao}`);
      const res = parsearShorthand(String(exigirFlag(flags, "result")));
      if (["Approved", "Rejected"].indexOf(res.status) < 0) throw new ErroCli(`\nInvalid choice: '${res.status || ""}', valid choices are: 'Approved', 'Rejected'\nForma: --result summary=\"texto\",status=Approved`);
      const token = String(exigirFlag(flags, "token"));
      const x = Object.values(st(conta).execucoes).find((y) => y.esteira === e.nome && y.estagios.some((ge) => ge.nome === estagio && ge.acoes.some((a) => a.nome === acao && a.token === token)));
      const a = x && acaoDe(x.estagios.find((ge) => ge.nome === estagio), acao);
      if (!a || a.status !== "InProgress" || x.status !== "InProgress") throw erro(op, "InvalidApprovalTokenException", "The approval request already received a response or has expired.\nPegue o token do pedido ABERTO com get-pipeline-state (latestExecution.token da ação de aprovação).");
      a.fim = agora();
      a.resumo = res.summary || "";
      if (res.status === "Approved") a.status = "Succeeded";
      else { a.status = "Failed"; a.erro = { code: "JobFailed", message: `Rejected by arn:aws:iam::${CONTA_ID(conta)}:user/estudante${res.summary ? ": " + res.summary : ""}` }; }
      fecharEstagio(conta, e, x);
      avisarClimb(res.status === "Approved"
        ? "Aprovado. A esteira já seguiu pro próximo estágio — acompanhe com get-pipeline-state."
        : "Rejeitado: o estágio falhou e a execução parou aqui. Pra pedir aprovação de novo nessa MESMA execução, retry-stage-execution no estágio de aprovação.");
      return js({ approvedAt: a.fim });
    },
    "retry-stage-execution": (conta, pos, flags) => {
      const op = "RetryStageExecution";
      const e = esteiraDe(conta, exigirFlag(flags, "pipeline-name"), op);
      const estagio = String(exigirFlag(flags, "stage-name"));
      const x = execDe(conta, e, exigirFlag(flags, "pipeline-execution-id"), op);
      const modo = String(exigirFlag(flags, "retry-mode"));
      if (["FAILED_ACTIONS", "ALL_ACTIONS"].indexOf(modo) < 0) throw new ErroCli(`\nInvalid choice: '${modo}', valid choices are: 'FAILED_ACTIONS', 'ALL_ACTIONS'`);
      const i = x.estagios.findIndex((g) => g.nome === estagio);
      if (i < 0) throw erro(op, "StageNotFoundException", `The stage was specified in an invalid format or cannot be found: ${estagio}`);
      const g = x.estagios[i];
      if (x.status !== "Failed" || g.status !== "Failed") throw erro(op, "StageNotRetryableException", "Unable to retry. The pipeline structure or stage state might have changed while actions awaited retry, or the stage contains no failed actions.");
      const maisNova = Object.values(st(conta).execucoes).find((y) => y.esteira === e.nome && y.id !== x.id && y.inicio > x.inicio && y.estagios.some((ge) => ge.nome === estagio && ge.status === "Failed"));
      if (maisNova) throw erro(op, "NotLatestPipelineExecutionException", "The stage has failed in a later run of the pipeline and the pipelineExecutionId associated with the request is out of date.");
      x.status = "InProgress"; x.idx = i; x.atualizado = agora(); x.retentativas = (x.retentativas || 0) + 1;
      g.status = "InProgress"; g.retentado = true;
      for (const a of g.acoes) if (modo === "ALL_ACTIONS" || a.status === "Failed") iniciarAcao(conta, e, x, a);
      avisarClimb("Estágio repetido NA MESMA execução — com a MESMA revisão do código. Retry resolve falha passageira ou aprovação negada; se o problema era o código, ele falha igual: aí é commit novo + start-pipeline-execution.");
      return js({ pipelineExecutionId: x.id });
    },
    "stop-pipeline-execution": (conta, pos, flags) => {
      const op = "StopPipelineExecution";
      const e = esteiraDe(conta, exigirFlag(flags, "pipeline-name"), op);
      const x = execDe(conta, e, exigirFlag(flags, "pipeline-execution-id"), op);
      if (x.status !== "InProgress") throw erro(op, "PipelineExecutionNotStoppableException", `Unable to stop the pipeline execution. The execution might already be in a Stopped state, or it might no longer be in progress. (status ${x.status})`);
      x.motivoParada = flags.reason !== undefined ? String(flags.reason) : "";
      const abandonar = flags.abandon === true || flags.abandon === "true";
      if (abandonar || x.esperando) {
        x.status = "Stopped";
        for (const a of x.estagios[x.idx].acoes) if (a.status === "InProgress") { a.status = "Abandoned"; a.fim = agora(); }
        if (x.estagios[x.idx].status === "InProgress") x.estagios[x.idx].status = "Stopped";
      } else { x.status = "Stopping"; x.parar = true; }
      x.atualizado = agora();
      avisarClimb(abandonar
        ? "Execução parada e ABANDONADA: o que estava rodando foi largado no meio. Use quando não dá pra esperar."
        : "Parando: a ação que estava rodando termina e aí a execução para (status Stopping → Stopped). Com --abandon, larga na hora.");
      return "";
    },
    "disable-stage-transition": (conta, pos, flags) => {
      const op = "DisableStageTransition";
      const e = esteiraDe(conta, exigirFlag(flags, "pipeline-name"), op);
      const estagio = String(exigirFlag(flags, "stage-name"));
      if (!e.planta.stages.some((g) => g.name === estagio)) throw erro(op, "StageNotFoundException", `The stage was specified in an invalid format or cannot be found: ${estagio}`);
      const tipo = String(exigirFlag(flags, "transition-type"));
      if (["Inbound", "Outbound"].indexOf(tipo) < 0) throw new ErroCli(`\nInvalid choice: '${tipo}', valid choices are: 'Inbound', 'Outbound'`);
      const motivo = String(exigirFlag(flags, "reason"));
      // Outbound de um estágio = Inbound do próximo
      const i = e.planta.stages.findIndex((g) => g.name === estagio);
      const alvo = tipo === "Inbound" ? estagio : (e.planta.stages[i + 1] || {}).name;
      if (!alvo || (tipo === "Inbound" && i === 0)) throw erro(op, "ValidationException", "The validation was specified in an invalid format.\nO primeiro estágio não tem transição de entrada, e o último não tem de saída.");
      e.transicoes[alvo] = { enabled: false, lastChangedBy: `arn:aws:iam::${CONTA_ID(conta)}:user/estudante`, lastChangedAt: agora(), disabledReason: motivo };
      e.historicoTransicoes = (e.historicoTransicoes || []).concat(alvo);
      avisarClimb(`Porta do estágio ${alvo} fechada. Execução que chegar ali ESPERA (não falha) até alguém abrir de novo — é o jeito de congelar deploy sem mexer na esteira.`);
      return "";
    },
    "enable-stage-transition": (conta, pos, flags) => {
      const op = "EnableStageTransition";
      const e = esteiraDe(conta, exigirFlag(flags, "pipeline-name"), op);
      const estagio = String(exigirFlag(flags, "stage-name"));
      if (!e.planta.stages.some((g) => g.name === estagio)) throw erro(op, "StageNotFoundException", `The stage was specified in an invalid format or cannot be found: ${estagio}`);
      const tipo = String(exigirFlag(flags, "transition-type"));
      if (["Inbound", "Outbound"].indexOf(tipo) < 0) throw new ErroCli(`\nInvalid choice: '${tipo}', valid choices are: 'Inbound', 'Outbound'`);
      const i = e.planta.stages.findIndex((g) => g.name === estagio);
      const alvo = tipo === "Inbound" ? estagio : (e.planta.stages[i + 1] || {}).name;
      if (alvo) e.transicoes[alvo] = { enabled: true, lastChangedBy: `arn:aws:iam::${CONTA_ID(conta)}:user/estudante`, lastChangedAt: agora() };
      avisarClimb(`Porta do estágio ${alvo} aberta. A execução que estava esperando entra no próximo passo (consulte com get-pipeline-state).`);
      return "";
    },
  };

  // ============================================================
  // ARQUIVOS DO LAB: as plantas das esteiras (no trabalho, moram no repositório)
  // ============================================================
  (function () {
    if (typeof ARQUIVOS_LOCAIS === "undefined") return;
    const ROLE = "arn:aws:iam::123456789012:role/codepipeline-servico";
    const acao = (nome, categoria, provedor, config, entrada, saida) => {
      const a = { name: nome, actionTypeId: { category: categoria, owner: "AWS", provider: provedor, version: "1" }, runOrder: 1, configuration: config };
      a.inputArtifacts = entrada ? [{ name: entrada }] : [];
      a.outputArtifacts = saida ? [{ name: saida }] : [];
      return a;
    };
    const fonte = (repo) => ({ name: "Source", actions: [acao("Source", "Source", "CodeCommit", { RepositoryName: repo, BranchName: "main", PollForSourceChanges: "false" }, null, "SourceArtifact")] });
    const build = (projeto) => ({ name: "Build", actions: [acao("Build", "Build", "CodeBuild", { ProjectName: projeto }, "SourceArtifact", "BuildArtifact")] });
    const aprovacao = { name: "Aprovacao", actions: [acao("AprovacaoGerente", "Approval", "Manual", { CustomData: "Confira a homologação antes de liberar pra produção." }, null, null)] };
    const deploy = (app, grupo) => ({ name: "Deploy", actions: [acao("Deploy", "Deploy", "CodeDeploy", { ApplicationName: app, DeploymentGroupName: grupo }, "BuildArtifact", null)] });
    const planta = (nome, loja, estagios) => JSON.stringify({ pipeline: { name: nome, roleArn: ROLE, artifactStore: { type: "S3", location: loja }, pipelineType: "V2", executionMode: "SUPERSEDED", stages: estagios } }, null, 2) + "\n";
    const CONTEUDOS = {
      "esteira-portal-rh.json": planta("portal-rh-esteira", "portal-rh-artefatos", [fonte("portal-rh"), build("portal-rh-build"), deploy("portal-rh", "portal-rh-producao")]),
      "esteira-portal-rh-v2.json": planta("portal-rh-esteira", "portal-rh-artefatos", [fonte("portal-rh"), build("portal-rh-build"), aprovacao, deploy("portal-rh", "portal-rh-producao")]),
      "esteira-rascunho.json": planta("portal-rh-rascunho", "portal-rh-artefatos", [fonte("portal-rh"), build("portal-rh-build")]),
      "esteira-intranet.json": planta("intranet-esteira", "portal-rh-artefatos", [fonte("intranet-antiga"), deploy("intranet-antiga", "intranet-antiga-prod")]),
      "esteira-app-ponto.json": planta("app-ponto-esteira", "app-ponto-artefatos", [fonte("app-ponto"), build("app-ponto-build"), deploy("app-ponto", "app-ponto-producao")]),
    };
    for (const nome of Object.keys(CONTEUDOS)) {
      ARQUIVOS_LOCAIS[nome] = CONTEUDOS[nome].length;
      if (typeof window !== "undefined") {
        window.ARQUIVOS_CONTEUDO = window.ARQUIVOS_CONTEUDO || {};
        window.ARQUIVOS_CONTEUDO[nome] = CONTEUDOS[nome];
      }
    }
  })();

  // ============================================================
  // MANUAIS
  // ============================================================
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => "USO\n    " + uso + "\n\n" + txt;
    Object.assign(MANUAIS, {
      codepipeline: "aws codepipeline — AWS CodePipeline\n\nA esteira de CI/CD: liga o código (CodeCommit), o build (CodeBuild), a\naprovação e a entrega (CodeDeploy) numa sequência de ESTÁGIOS. Cada\nestágio só começa quando o anterior deu certo.\n\nAS PEÇAS\n    ESTEIRA (pipeline)   a planta: estágios, ações, role e bucket de artefatos\n    EXECUÇÃO             cada passada de uma revisão do código pela esteira\n    ESTÁGIO / AÇÃO       Source, Build, Aprovacao, Deploy...\n    TRANSIÇÃO            a porta entre dois estágios (dá pra fechar)\n\nCOMANDOS\n    list-pipelines / create-pipeline / get-pipeline / update-pipeline / delete-pipeline\n    get-pipeline-state / start-pipeline-execution / stop-pipeline-execution\n    list-pipeline-executions / get-pipeline-execution / list-action-executions\n    put-approval-result / retry-stage-execution\n    disable-stage-transition / enable-stage-transition",
      "codepipeline.list-pipelines": M("aws codepipeline list-pipelines",
        "As esteiras da conta, com versão (sobe a cada update) e datas."),
      "codepipeline.create-pipeline": M("aws codepipeline create-pipeline --cli-input-json file://<planta>.json",
        "Cria a esteira a partir da planta (JSON com name, roleArn, artifactStore\ne stages). Ela COMEÇA A RODAR assim que é criada.\n\nPelo CLI:\n    - o bucket de artefatos (artifactStore) precisa existir antes;\n    - commit novo NÃO dispara a esteira sozinho (isso pede uma regra do\n      EventBridge) — rode de novo com start-pipeline-execution.\n\nREGRAS DA PLANTA\n    mínimo de 2 estágios; o primeiro só com ação de origem (Source)."),
      "codepipeline.get-pipeline": M("aws codepipeline get-pipeline --name <esteira>",
        "A planta da esteira (estágios, ações, configuração) e o metadata (ARN,\ndatas). Só os nomes dos estágios:\n    ... --query pipeline.stages[].name"),
      "codepipeline.update-pipeline": M("aws codepipeline update-pipeline --cli-input-json file://<planta>.json",
        "Troca a planta da esteira (o name dentro do arquivo diz qual). A versão\nsobe; a esteira não roda por causa disso."),
      "codepipeline.delete-pipeline": M("aws codepipeline delete-pipeline --name <esteira>",
        "Apaga a esteira. Não produz saída. Repositório, build e deploy continuam."),
      "codepipeline.get-pipeline-state": M("aws codepipeline get-pipeline-state --name <esteira>",
        "O painel da esteira: cada estágio com a última execução, o status de cada\nação, o errorDetails de quem falhou, o token de aprovação pendente e se a\nporta de entrada (inboundTransitionState) está aberta.\n\nResumo em texto:\n    ... --query stageStates[].[stageName,latestExecution.status] --output text"),
      "codepipeline.start-pipeline-execution": M("aws codepipeline start-pipeline-execution --name <esteira>",
        "Roda a esteira de novo, pegando a ponta ATUAL da branch de origem.\nDevolve o pipelineExecutionId."),
      "codepipeline.list-pipeline-executions": M("aws codepipeline list-pipeline-executions --pipeline-name <esteira>",
        "O histórico de execuções, da mais nova pra mais velha: status (Succeeded,\nFailed, InProgress, Stopped, Superseded) e o commit de cada uma."),
      "codepipeline.get-pipeline-execution": M("aws codepipeline get-pipeline-execution --pipeline-name <esteira> --pipeline-execution-id <id>",
        "Uma execução: status, versão da esteira e as revisões (artifactRevisions:\no commit que passou)."),
      "codepipeline.list-action-executions": M("aws codepipeline list-action-executions --pipeline-name <esteira> [--filter pipelineExecutionId=<id>]",
        "Cada ação de cada execução: status, configuração e o resultado\n(output.executionResult) — com externalExecutionId (o id do build ou do\ndeploy) e errorDetails quando falhou."),
      "codepipeline.put-approval-result": M("aws codepipeline put-approval-result --pipeline-name <esteira> --stage-name <estágio> \\\n        --action-name <ação> --result summary=\"<motivo>\",status=Approved|Rejected --token <token>",
        "Responde um pedido de aprovação manual. O token do pedido aberto sai do\nget-pipeline-state (latestExecution.token da ação de aprovação).\nRejected faz o estágio falhar."),
      "codepipeline.retry-stage-execution": M("aws codepipeline retry-stage-execution --pipeline-name <esteira> --stage-name <estágio> \\\n        --pipeline-execution-id <id> --retry-mode FAILED_ACTIONS|ALL_ACTIONS",
        "Repete um estágio que falhou NA MESMA execução — com a MESMA revisão do\ncódigo. Serve pra falha passageira e aprovação negada; código quebrado\nfalha igual (aí é commit novo + start-pipeline-execution)."),
      "codepipeline.stop-pipeline-execution": M("aws codepipeline stop-pipeline-execution --pipeline-name <esteira> --pipeline-execution-id <id> [--abandon] [--reason <texto>]",
        "Para uma execução. Sem --abandon, a ação em andamento termina antes\n(Stopping → Stopped); com --abandon, larga na hora. Não produz saída."),
      "codepipeline.disable-stage-transition": M("aws codepipeline disable-stage-transition --pipeline-name <esteira> --stage-name <estágio> \\\n        --transition-type Inbound|Outbound --reason <motivo>",
        "Fecha a porta de um estágio: execução que chegar ali ESPERA até alguém\nabrir. É o \"congelamento\" de deploy. O --reason é obrigatório."),
      "codepipeline.enable-stage-transition": M("aws codepipeline enable-stage-transition --pipeline-name <esteira> --stage-name <estágio> --transition-type Inbound|Outbound",
        "Abre de novo a porta do estágio; quem estava esperando segue."),
    });
  }

  // ============================================================
  // LIÇÃO + PORQUE
  // ============================================================
  if (typeof LICOES !== "undefined" && !LICOES.codepipeline) {
    LICOES.codepipeline = {
      emoji: "🛤️", titulo: "AWS CodePipeline",
      oque: "O CodePipeline é a <b>linha de montagem</b> do software: você desenha os estágios uma vez (pegar o código, montar, aprovar, entregar) e cada versão passa por eles na ordem, sozinha. Se um estágio falha, a linha para ali — nada quebrado chega na produção.",
      serve: "É o que transforma CodeCommit, CodeBuild e CodeDeploy num fluxo só. Sem esteira, alguém roda cada peça à mão e esquece uma; com ela, todo commit percorre o mesmo caminho, com aprovação humana onde precisa e histórico de quem liberou o quê.",
      casos: [
        "Todo commit na main passa por build e testes; se passar, espera o OK da gerente e vai pra produção — com registro de quem aprovou.",
        "No fim de ano, o time fecha a porta do estágio de deploy: os builds continuam, mas nada entra em produção até janeiro.",
        "Um build quebra às 17h; o time lê o errorDetails na esteira, corrige com um commit e roda de novo — sem tocar nos servidores.",
      ],
      vocab: [
        ["Esteira (pipeline)", "a planta: estágios, ações, a role e o bucket de artefatos."],
        ["Execução", "cada passada de uma versão do código pela esteira, com id próprio."],
        ["Estágio e ação", "o passo (Source, Build, Deploy) e quem faz o trabalho nele (CodeCommit, CodeBuild, CodeDeploy)."],
        ["Artefato", "o pacote que sai de um estágio e entra no próximo, guardado no bucket da esteira."],
        ["Aprovação manual", "um estágio que espera uma pessoa aprovar ou rejeitar (put-approval-result)."],
        ["Transição", "a porta entre estágios; fechada, a execução espera em vez de seguir."],
      ],
      cobra: "A esteira V2 cobra US$ 0,002 por minuto de ação executada, com 100 minutos grátis por mês; a V1 cobra US$ 1 por esteira ativa no mês (uma grátis). O build e o deploy que ela chama são cobrados à parte, cada um no seu serviço. Comparando: <b>CodePipeline x GitHub Actions</b> — os dois orquestram CI/CD; o CodePipeline vive na conta AWS e chama os serviços dela com role do IAM, o Actions vive no repositório.",
    };
  }
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "codepipeline.list-pipelines": "mostra quais esteiras de entrega existem na conta.",
      "codepipeline.create-pipeline": "monta a esteira a partir da planta — e ela já sai rodando.",
      "codepipeline.get-pipeline": "mostra a planta: que estágios existem e o que cada ação chama.",
      "codepipeline.update-pipeline": "troca a planta (um estágio a mais, a menos) sem recriar a esteira.",
      "codepipeline.delete-pipeline": "remove uma esteira que não é mais usada.",
      "codepipeline.get-pipeline-state": "é o painel: em que estágio cada execução está e o que falhou.",
      "codepipeline.start-pipeline-execution": "roda a esteira de novo com o código mais recente da branch.",
      "codepipeline.list-pipeline-executions": "o histórico de passadas pela esteira — o que passou, o que falhou.",
      "codepipeline.get-pipeline-execution": "mostra uma execução e qual commit ela levou.",
      "codepipeline.list-action-executions": "mostra cada ação com o id do job de verdade e o motivo da falha.",
      "codepipeline.put-approval-result": "é a assinatura de quem libera (ou barra) a ida pra produção.",
      "codepipeline.retry-stage-execution": "repete um estágio que falhou sem rodar a esteira toda de novo.",
      "codepipeline.stop-pipeline-execution": "interrompe uma execução que não deve seguir.",
      "codepipeline.disable-stage-transition": "congela a entrada de um estágio — o deploy espera sem falhar.",
      "codepipeline.enable-stage-transition": "descongela o estágio e deixa a execução seguir.",
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
  const ESTEIRA = "portal-rh-esteira";
  const esteira = (c, n) => (((c.codepipeline || {}).esteiras) || {})[n];
  const execs = (c, n) => Object.values(((c.codepipeline || {}).execucoes) || {}).filter((x) => x.esteira === n);
  const estagioDe = (x, nome) => x.estagios.find((g) => g.nome === nome) || {};
  const aprovPendente = (x) => x.status === "InProgress" && (estagioDe(x, "Aprovacao").acoes || []).some((a) => a.status === "InProgress" && a.token);
  const temEstagio = (c, n, nome) => !!((esteira(c, n) || {}).planta || { stages: [] }).stages.some((g) => g.name === nome);
  const porta = (c, n, nome) => (((esteira(c, n) || {}).transicoes) || {})[nome];
  const pontaMain = (c) => ((((c.codecommit || {}).repos || {})["portal-rh"] || {}).branches || {}).main;
  const flag = (cmd, nome) => String((cmd && cmd.flags && cmd.flags[nome]) || "");
  const apagada = (c, n) => (((c.codepipeline || {}).apagadas) || []).indexOf(n) >= 0;
  // montados aqui (e não strings prontas): a linha inteira da solução não pode
  // aparecer fora do solucao, senão desce no arquivo público (teste/gabarito.js)
  const estado = (n, extra) => `aws codepipeline get-pipeline-state --name ${n}` + (extra || "");
  const rodar = (n) => `aws codepipeline start-pipeline-execution --name ${n}`;
  const aprovar = (status, resumo) => `aws codepipeline put-approval-result --pipeline-name ${ESTEIRA} --stage-name Aprovacao --action-name AprovacaoGerente --result summary="${resumo}",status=${status} --token <token-aprovacao>`;
  const gravar = (msg) => `aws codecommit put-file --repository-name portal-rh --branch-name main --file-content fileb://buildspec.yml --file-path buildspec.yml --parent-commit-id <commit-da-branch:portal-rh:main> --commit-message "${msg}"`;
  const EST = estado(ESTEIRA);

  const TRILHA = [
    d("cpl-1", "codepipeline", 1, 50, "A esteira que falta",
      "O portal do RH já tem repositório (CodeCommit), deploy (CodeDeploy) e o time sabe usar o CodeBuild — mas alguém ainda roda cada peça à mão, e toda sexta uma fica esquecida. Hora da esteira. Veja se já existe alguma <b>pipeline</b> na conta.",
      ["Pra ver o que existe, o verbo é `list-` e o recurso vai no plural.", "O serviço é o `codepipeline`."],
      ["aws codepipeline list-pipelines"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "list-pipelines")),
    d("cpl-2", "codepipeline", 1, 60, "O depósito da esteira",
      "A esteira passa o pacote de um estágio pro outro por um bucket do S3 — o <b>artifact store</b>. Pelo CLI ele precisa existir ANTES da esteira. Crie o bucket <b>portal-rh-artefatos</b>.",
      ["Criar bucket é o `aws s3 mb`, que você viu na trilha de S3.", "A forma é `aws s3 mb s3://<nome>`."],
      ["aws s3 mb s3://portal-rh-artefatos"],
      (c) => !!(c.s3 && c.s3.buckets && c.s3.buckets["portal-rh-artefatos"])),
    d("cpl-3", "codepipeline", 1, 60, "Leia a planta antes de construir",
      "A planta da esteira já está pronta, no arquivo <b>esteira-portal-rh.json</b> (no trabalho, ela mora no repositório). Leia o arquivo e repare nos três estágios: <b>Source</b> (CodeCommit), <b>Build</b> (CodeBuild) e <b>Deploy</b> (CodeDeploy).",
      ["Ler um arquivo no terminal é o `cat`.", "O arquivo está na sua pasta (confira com `ls`)."],
      ["cat esteira-portal-rh.json"],
      (c, cmd, ok) => ok && cmd && cmd.sub === "cat" && /esteira-portal-rh\.json/.test((cmd.args || []).join(" "))),
    d("cpl-4", "codepipeline", 2, 80, "O build que a esteira chama",
      "A planta chama o projeto de build <b>portal-rh-build</b>, que ainda não existe. Crie no CodeBuild com fonte e artefato do tipo <b>CODEPIPELINE</b> (quem entrega o código e recebe o pacote é a esteira), máquina <b>LINUX_CONTAINER</b> com a imagem <b>aws/codebuild/standard:7.0</b> no tamanho <b>BUILD_GENERAL1_SMALL</b>, e a role <b>arn:aws:iam::123456789012:role/codebuild-servico</b>.",
      ["É o `aws codebuild create-project` da trilha de CodeBuild.", "Com a esteira no meio, a fonte é `--source type=CODEPIPELINE` e o artefato `--artifacts type=CODEPIPELINE` — sem location."],
      ["aws codebuild create-project --name portal-rh-build --source type=CODEPIPELINE --artifacts type=CODEPIPELINE --environment type=LINUX_CONTAINER,image=aws/codebuild/standard:7.0,computeType=BUILD_GENERAL1_SMALL --service-role arn:aws:iam::123456789012:role/codebuild-servico"],
      (c) => !!((((c.codebuild || {}).projetos) || {})["portal-rh-build"])),
    d("cpl-5", "codepipeline", 2, 90, "A esteira do portal",
      "Tudo no lugar. Crie a esteira a partir da planta <b>esteira-portal-rh.json</b>. É o marco da trilha: repare que ela já sai rodando.",
      ["Criar é o `create-pipeline`.", "A planta vai por arquivo: `--cli-input-json file://esteira-portal-rh.json` (o `file://` é obrigatório)."],
      ["aws codepipeline create-pipeline --cli-input-json file://esteira-portal-rh.json"],
      (c) => !!esteira(c, ESTEIRA)),
    d("cpl-f0", "codepipeline", 2, 60, "Nome e versão, em texto",
      "Pro inventário, liste as esteiras trazendo só <b>nome e versão</b> de cada uma, em texto puro.",
      ["Mesmo `list-pipelines`, com `--query` e `--output text`.", "A multisseleção pega dois campos de cada item: `pipelines[].[name,version]`."],
      ["aws codepipeline list-pipelines --query pipelines[].[name,version] --output text"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "list-pipelines") && /version/.test(flag(cmd, "query"))),
    d("cpl-6", "codepipeline", 2, 60, "A planta que ficou valendo",
      "Confira como a AWS guardou a <b>portal-rh-esteira</b>: estágios, ações e o <code>metadata</code> (ARN e datas).",
      ["A planta de UMA esteira é o `get-pipeline`.", "Ele pede o `--name`."],
      ["aws codepipeline get-pipeline --name portal-rh-esteira"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline") && flag(cmd, "name") === ESTEIRA),
    d("cpl-f1", "codepipeline", 2, 60, "Só os nomes dos estágios",
      "Pra documentação do time, traga só os <b>nomes dos estágios</b> da <b>portal-rh-esteira</b>, na ordem.",
      ["Mesmo `get-pipeline`, com `--query`.", "O caminho é `pipeline.stages[].name`."],
      ["aws codepipeline get-pipeline --name portal-rh-esteira --query pipeline.stages[].name"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline") && /stages/.test(flag(cmd, "query"))),
    d("cpl-7", "codepipeline", 2, 90, "Acompanhe a primeira passada",
      "A esteira está rodando desde a criação. Olhe o painel dela — e olhe de novo até os três estágios ficarem <b>Succeeded</b>. Cada olhada avança um estágio.",
      ["O painel da esteira é o `get-pipeline-state`, com `--name`.", "Repita até o Deploy aparecer Succeeded (são três consultas)."],
      [EST, EST, EST],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline-state") && execs(c, ESTEIRA).some((x) => x.status === "Succeeded")),
    d("cpl-f2", "codepipeline", 3, 70, "O painel em uma linha por estágio",
      "O painel completo é grande. Traga só <b>estágio e status</b> de cada um, em texto — o formato que cabe na mensagem do chat.",
      ["Mesmo `get-pipeline-state`, com multisseleção no `--query` e `--output text`.", "O caminho é `stageStates[].[stageName,latestExecution.status]`."],
      [estado(ESTEIRA, " --query stageStates[].[stageName,latestExecution.status] --output text")],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline-state") && /stageName/.test(flag(cmd, "query"))),
    d("cpl-8", "codepipeline", 3, 70, "O histórico da esteira",
      "Liste as execuções da <b>portal-rh-esteira</b>: quando rodou, com que resultado e com qual commit.",
      ["O histórico é o `list-pipeline-executions`.", "Aqui o nome vai em `--pipeline-name` (não `--name`)."],
      ["aws codepipeline list-pipeline-executions --pipeline-name portal-rh-esteira"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "list-pipeline-executions") && flag(cmd, "pipeline-name") === ESTEIRA),
    d("cpl-9", "codepipeline", 3, 70, "Qual commit foi pro ar?",
      "A auditoria pergunta qual versão do código a última execução levou. Consulte a execução pelo id e veja o <code>artifactRevisions</code>.",
      ["O detalhe de UMA execução é o `get-pipeline-execution`.", "Ele pede `--pipeline-name` e `--pipeline-execution-id` (o id sai do list-pipeline-executions)."],
      ["aws codepipeline get-pipeline-execution --pipeline-name portal-rh-esteira --pipeline-execution-id <exec-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline-execution")),
    d("cpl-f3", "codepipeline", 3, 70, "Só o id do commit",
      "O relatório de mudanças só quer o <b>id do commit</b> que a última execução levou.",
      ["Mesmo `get-pipeline-execution`, com `--query`.", "O caminho é `pipelineExecution.artifactRevisions[0].revisionId`."],
      ["aws codepipeline get-pipeline-execution --pipeline-name portal-rh-esteira --pipeline-execution-id <exec-id> --query pipelineExecution.artifactRevisions[0].revisionId"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline-execution") && /revisionId/.test(flag(cmd, "query"))),
    d("cpl-10", "codepipeline", 3, 80, "O que cada ação chamou",
      "Veja cada ação das execuções da esteira: o <code>externalExecutionId</code> de cada uma é o id do job de verdade — o build no CodeBuild, o deploy no CodeDeploy.",
      ["O detalhe por ação é o `list-action-executions`, com `--pipeline-name`.", "Olhe o `output.executionResult` de cada ação."],
      ["aws codepipeline list-action-executions --pipeline-name portal-rh-esteira"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "list-action-executions")),
    d("cpl-11", "codepipeline", 3, 110, "Rode de novo",
      "O time trocou a máquina de build e quer ver a esteira passar de novo, do começo. Dispare uma execução nova da <b>portal-rh-esteira</b> e acompanhe até o fim.",
      ["Rodar de novo é o `start-pipeline-execution`, com `--name`.", "Depois, o `get-pipeline-state` até tudo dar Succeeded."],
      [rodar(ESTEIRA), EST, EST, EST],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline-state") && execs(c, ESTEIRA).filter((x) => x.status === "Succeeded").length >= 2),
    d("cpl-12", "codepipeline", 3, 110, "Ninguém vai pra produção sem OK",
      "A gerente quer aprovar cada ida pra produção. A planta nova, <b>esteira-portal-rh-v2.json</b>, tem um estágio <b>Aprovacao</b> entre o build e o deploy (leia com <code>cat</code> se quiser). Aplique a planta nova na esteira.",
      ["Trocar a planta é o `update-pipeline`.", "Igual ao create: `--cli-input-json file://esteira-portal-rh-v2.json` (o name dentro do arquivo diz qual esteira)."],
      ["aws codepipeline update-pipeline --cli-input-json file://esteira-portal-rh-v2.json"],
      (c) => temEstagio(c, ESTEIRA, "Aprovacao")),
    d("cpl-13", "codepipeline", 3, 90, "A esteira esperando a gerente",
      "Rode a esteira e acompanhe até ela parar no estágio <b>Aprovacao</b>. No painel, ache o <code>token</code> do pedido de aprovação.",
      ["Rodar e acompanhar você já sabe.", "O token está em latestExecution.token da ação AprovacaoGerente."],
      [rodar(ESTEIRA), EST, EST],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline-state") && execs(c, ESTEIRA).some(aprovPendente)),
    d("cpl-14", "codepipeline", 3, 110, "Aprovado pela gerente",
      "A gerente conferiu a homologação e liberou. Aprove o pedido com o resumo <b>Homologacao conferida</b>.",
      ["Responder a aprovação é o `put-approval-result`.", "Ele pede `--pipeline-name`, `--stage-name Aprovacao`, `--action-name AprovacaoGerente`, o `--token` e `--result summary=\"...\",status=Approved`."],
      [aprovar("Approved", "Homologacao conferida")],
      (c) => execs(c, ESTEIRA).some((x) => (estagioDe(x, "Aprovacao").acoes || []).some((a) => a.status === "Succeeded" && a.resumo === "Homologacao conferida"))),
    d("cpl-f4", "codepipeline", 3, 80, "Chegou na produção?",
      "Depois da aprovação, a esteira seguiu pro deploy. Acompanhe até a execução aprovada terminar.",
      ["O mesmo `get-pipeline-state` — agora o Deploy é o último passo."],
      [EST],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline-state") && execs(c, ESTEIRA).some((x) => x.status === "Succeeded" && (estagioDe(x, "Aprovacao").acoes || []).some((a) => a.status === "Succeeded"))),
    d("cpl-f5", "codepipeline", 3, 120, "Hoje não: véspera de feriado",
      "Outra execução chegou na aprovação, mas é véspera de feriado e a gerente não quer deploy hoje. Rode a esteira, acompanhe até a aprovação e <b>rejeite</b> com o resumo <b>Vespera de feriado</b>.",
      ["É a mesma sequência de antes, só que a resposta da gerente muda.", "Rejeitar é o mesmo `put-approval-result`, com `status=Rejected`."],
      [rodar(ESTEIRA), EST, EST, aprovar("Rejected", "Vespera de feriado")],
      (c) => execs(c, ESTEIRA).some((x) => x.status === "Failed" && (estagioDe(x, "Aprovacao").acoes || []).some((a) => a.resumo === "Vespera de feriado"))),
    d("cpl-15", "codepipeline", 3, 110, "Peça a aprovação de novo",
      "Passou o feriado. Em vez de rodar tudo do zero, <b>repita só o estágio Aprovacao</b> da execução rejeitada — a gerente recebe um pedido novo, com outro token.",
      ["Repetir um estágio que falhou é o `retry-stage-execution`.", "Ele pede `--pipeline-name`, `--stage-name`, `--pipeline-execution-id` (a execução que falhou) e `--retry-mode FAILED_ACTIONS`."],
      ["aws codepipeline retry-stage-execution --pipeline-name portal-rh-esteira --stage-name Aprovacao --pipeline-execution-id <exec-falha> --retry-mode FAILED_ACTIONS"],
      (c) => execs(c, ESTEIRA).some((x) => (x.retentativas || 0) > 0 && aprovPendente(x))),
    d("cpl-f6", "codepipeline", 3, 110, "Agora pode",
      "Aprove o pedido novo da execução repetida (resumo <b>Liberado apos o feriado</b>) e acompanhe até ela chegar na produção.",
      ["O token é NOVO: pegue do painel de novo (o do pedido rejeitado não vale mais).", "Depois da aprovação, o get-pipeline-state até o fim."],
      [aprovar("Approved", "Liberado apos o feriado"), EST],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline-state") && execs(c, ESTEIRA).some((x) => (x.retentativas || 0) > 0 && x.status === "Succeeded")),
    d("cpl-f7", "codepipeline", 3, 150, "O commit que quebrou o build",
      "Um dev trocou o buildspec da main por um com <b>exit 1</b> (um teste que sempre falha). Reproduza: crie o <b>buildspec.yml</b> com o texto <b>exit 1</b>, grave na main do <b>portal-rh</b> (mensagem <b>Buildspec novo</b>), rode a esteira e acompanhe até ela <b>falhar no Build</b>.",
      ["O arquivo: `echo \"exit 1\" > buildspec.yml`. Gravar no repositório é o `aws codecommit put-file` da trilha de CodeCommit (com o commit pai).", "Depois, start-pipeline-execution e get-pipeline-state até o Build aparecer Failed."],
      ['echo "exit 1" > buildspec.yml', gravar("Buildspec novo"), rodar(ESTEIRA), EST, EST],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline-state") && execs(c, ESTEIRA).some((x) => x.status === "Failed" && estagioDe(x, "Build").status === "Failed")),
    d("cpl-f8", "codepipeline", 3, 110, "Por que o build quebrou?",
      "A esteira só diz \"Build terminated with state: FAILED\". Ache o motivo de verdade: liste as ações da execução que falhou, pegue o <code>externalExecutionId</code> do Build e consulte esse build no CodeBuild.",
      ["As ações de UMA execução: `list-action-executions --pipeline-name ... --filter pipelineExecutionId=<id>`.", "O build é o `aws codebuild batch-get-builds --ids <id>` da trilha de CodeBuild — procure a fase FAILED e o contexts dela."],
      ["aws codepipeline list-action-executions --pipeline-name portal-rh-esteira --filter pipelineExecutionId=<exec-falha>",
        "aws codebuild batch-get-builds --ids <build-falho>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codebuild", "batch-get-builds") && Object.values(((c.codebuild || {}).builds) || {}).some((b) => b.projeto === "portal-rh-build" && b.quebra === "exit" && b.status === "FAILED")),
    d("cpl-f9", "codepipeline", 3, 120, "Retry não pega commit novo",
      "O dev corrigiu: grave o <b>buildspec.yml</b> com <b>version: 0.2</b> na main (mensagem <b>Conserta buildspec</b>). Aí tente o atalho: <b>repita o estágio Build</b> da execução que falhou e acompanhe. Repare no resultado — e no porquê.",
      ["A correção: `echo \"version: 0.2\" > buildspec.yml` e o mesmo put-file (o commit pai mudou).", "O retry é o `retry-stage-execution` no estágio Build, com `--retry-mode FAILED_ACTIONS`. Ele repete com o MESMO commit da execução."],
      ['echo "version: 0.2" > buildspec.yml', gravar("Conserta buildspec"),
        "aws codepipeline retry-stage-execution --pipeline-name portal-rh-esteira --stage-name Build --pipeline-execution-id <exec-falha> --retry-mode FAILED_ACTIONS",
        EST],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline-state") && execs(c, ESTEIRA).some((x) => (x.retentativas || 0) > 0 && estagioDe(x, "Build").retentado && x.status === "Failed")),
    d("cpl-f10", "codepipeline", 3, 130, "Agora sim: commit novo, execução nova",
      "Retry repete o código velho. O código consertado entra com uma <b>execução nova</b>. Rode a esteira, acompanhe até a aprovação, aprove (resumo <b>Build consertado</b>) e acompanhe até a produção.",
      ["start-pipeline-execution pega a ponta ATUAL da main — com o buildspec consertado.", "Depois: get-pipeline-state até a aprovação, put-approval-result com o token novo e get-pipeline-state até o fim."],
      [rodar(ESTEIRA), EST, EST, aprovar("Approved", "Build consertado"), EST],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline-state") && execs(c, ESTEIRA).some((x) => x.status === "Succeeded" && x.revisao === pontaMain(c))),
    d("cpl-16", "codepipeline", 3, 90, "Congelamento de fim de ano",
      "Dezembro: nada entra em produção até janeiro, mas o time continua fazendo build. <b>Feche a porta</b> de entrada do estágio <b>Deploy</b> com o motivo <b>Congelamento de fim de ano</b>.",
      ["Fechar a porta é o `disable-stage-transition`.", "Ele pede `--pipeline-name`, `--stage-name Deploy`, `--transition-type Inbound` e `--reason` (obrigatório)."],
      ['aws codepipeline disable-stage-transition --pipeline-name portal-rh-esteira --stage-name Deploy --transition-type Inbound --reason "Congelamento de fim de ano"'],
      (c) => (porta(c, ESTEIRA, "Deploy") || {}).enabled === false),
    d("cpl-f11", "codepipeline", 3, 120, "A execução espera na porta",
      "Veja o congelamento funcionando: rode a esteira, acompanhe, aprove quando pedir (resumo <b>Pronto pra janeiro</b>) e olhe o painel — a execução fica <b>esperando</b> na porta do Deploy, sem falhar.",
      ["Rodar, acompanhar e aprovar você já sabe.", "No painel, o estágio Deploy mostra `inboundTransitionState.enabled: false` e a execução em `inboundExecution`."],
      [rodar(ESTEIRA), EST, EST, aprovar("Approved", "Pronto pra janeiro"), EST],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline-state") && execs(c, ESTEIRA).some((x) => x.status === "InProgress" && x.esperando && x.estagios[x.idx] && x.estagios[x.idx].nome === "Deploy")),
    d("cpl-17", "codepipeline", 3, 100, "Janeiro chegou",
      "Fim do congelamento. <b>Abra a porta</b> do estágio <b>Deploy</b> e acompanhe a execução que estava esperando chegar na produção.",
      ["Abrir é o `enable-stage-transition`, com os mesmos `--pipeline-name`, `--stage-name` e `--transition-type` (sem motivo).", "Depois, get-pipeline-state até o fim (duas consultas: entrar no Deploy e terminar)."],
      ["aws codepipeline enable-stage-transition --pipeline-name portal-rh-esteira --stage-name Deploy --transition-type Inbound", EST, EST],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline-state") && (porta(c, ESTEIRA, "Deploy") || {}).enabled === true && execs(c, ESTEIRA).some((x) => x.status === "Succeeded" && (estagioDe(x, "Aprovacao").acoes || []).some((a) => a.resumo === "Pronto pra janeiro"))),
    d("cpl-f12", "codepipeline", 3, 90, "Auditoria na porta da aprovação",
      "A auditoria vai revisar o processo de aprovação amanhã, e até lá nada deve pedir aprovação. Feche a porta de entrada do estágio <b>Aprovacao</b> (motivo <b>Auditoria</b>) e, terminada a auditoria, abra de novo.",
      ["São os dois comandos das atividades anteriores, agora no estágio Aprovacao.", "disable-stage-transition com --reason, depois enable-stage-transition."],
      ["aws codepipeline disable-stage-transition --pipeline-name portal-rh-esteira --stage-name Aprovacao --transition-type Inbound --reason Auditoria",
        "aws codepipeline enable-stage-transition --pipeline-name portal-rh-esteira --stage-name Aprovacao --transition-type Inbound"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "enable-stage-transition") && flag(cmd, "stage-name") === "Aprovacao" && ((esteira(c, ESTEIRA) || {}).historicoTransicoes || []).indexOf("Aprovacao") >= 0),
    d("cpl-18", "codepipeline", 3, 90, "Execução disparada por engano",
      "Alguém disparou a esteira sem querer, no meio de um incidente. Dispare pra ver o cenário e <b>pare</b> a execução na hora, abandonando o que estiver rodando.",
      ["Disparar você já sabe.", "Parar é o `stop-pipeline-execution`, com `--pipeline-name`, `--pipeline-execution-id` e `--abandon` (larga na hora)."],
      [rodar(ESTEIRA), "aws codepipeline stop-pipeline-execution --pipeline-name portal-rh-esteira --pipeline-execution-id <exec-id> --abandon"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "stop-pipeline-execution") && execs(c, ESTEIRA).some((x) => x.status === "Stopped")),
    d("cpl-f13", "codepipeline", 3, 100, "Parada com motivo registrado",
      "Uma execução chegou na aprovação, mas a versão foi cancelada pelo produto. Rode, acompanhe até a aprovação e pare a execução com <code>--abandon</code> e o motivo <b>Versao cancelada pelo produto</b>. Depois confira no histórico que o motivo ficou registrado.",
      ["O mesmo `stop-pipeline-execution`, agora com `--reason`.", "O histórico é o `list-pipeline-executions`: o motivo aparece no `stopTrigger` da execução."],
      [rodar(ESTEIRA), EST, EST,
        'aws codepipeline stop-pipeline-execution --pipeline-name portal-rh-esteira --pipeline-execution-id <exec-id> --abandon --reason "Versao cancelada pelo produto"',
        "aws codepipeline list-pipeline-executions --pipeline-name portal-rh-esteira"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "list-pipeline-executions") && execs(c, ESTEIRA).some((x) => x.status === "Stopped" && x.motivoParada === "Versao cancelada pelo produto")),
    d("cpl-f14", "codepipeline", 3, 90, "A aprovação mudou de lugar",
      "O time passou a aprovar no próprio pull request, então o estágio de aprovação saiu da esteira. Volte a esteira pra planta original, <b>esteira-portal-rh.json</b>, e confira a versão.",
      ["O mesmo `update-pipeline`, com a planta antiga.", "A versão sobe de novo — ela conta mudanças, não volta atrás."],
      ["aws codepipeline update-pipeline --cli-input-json file://esteira-portal-rh.json",
        "aws codepipeline get-pipeline --name portal-rh-esteira --query pipeline.version"],
      (c) => !!esteira(c, ESTEIRA) && !temEstagio(c, ESTEIRA, "Aprovacao") && esteira(c, ESTEIRA).versao >= 3),
    d("cpl-19", "codepipeline", 3, 90, "O rascunho que sobrou",
      "Alguém criou uma esteira de teste a partir do <b>esteira-rascunho.json</b> e esqueceu. Crie pra ver o cenário e <b>apague</b> a <b>portal-rh-rascunho</b>.",
      ["Criar você já sabe.", "Apagar é o `delete-pipeline`, com `--name`. Ele não devolve nada."],
      ["aws codepipeline create-pipeline --cli-input-json file://esteira-rascunho.json",
        "aws codepipeline delete-pipeline --name portal-rh-rascunho"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "delete-pipeline") && flag(cmd, "name") === "portal-rh-rascunho" && !esteira(c, "portal-rh-rascunho") && apagada(c, "portal-rh-rascunho")),
    d("cpl-f15", "codepipeline", 3, 130, "A esteira da intranet antiga",
      "Existe uma planta velha, <b>esteira-intranet.json</b>, da intranet que foi desligada. Crie a esteira, olhe o painel e descubra <b>por que</b> ela falha logo no primeiro estágio. Depois, apague a <b>intranet-esteira</b>.",
      ["Criar e olhar o painel você já sabe — leia o errorDetails do Source.", "O repositório que ela procura foi apagado. Esteira que aponta pra coisa que não existe: apague com delete-pipeline."],
      ["aws codepipeline create-pipeline --cli-input-json file://esteira-intranet.json",
        estado("intranet-esteira"),
        "aws codepipeline delete-pipeline --name intranet-esteira"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "delete-pipeline") && flag(cmd, "name") === "intranet-esteira" && apagada(c, "intranet-esteira")),
  ];

  const PROJETO = { id: "cpl-proj", servico: "codepipeline", tipo: "projeto", nivel: 3, xp: 450,
    titulo: "🛤️ Projeto: a esteira do app de ponto",
    descricao: "O fecho da família Code. O app de ponto já tem repositório (<b>app-ponto</b>, do projeto de CodeCommit) e deploy (<b>app-ponto-producao</b>, do projeto de CodeDeploy). Sem passo a passo: crie o bucket de artefatos <b>app-ponto-artefatos</b> e o projeto de build <b>app-ponto-build</b> (fonte e artefato CODEPIPELINE, máquina pequena Linux com a imagem standard:7.0, role <b>arn:aws:iam::123456789012:role/codebuild-servico</b>), crie a esteira pela planta <b>esteira-app-ponto.json</b> e acompanhe até o código chegar nas máquinas.",
    dicas: [
      "É o caminho da trilha: s3 mb → codebuild create-project → create-pipeline → get-pipeline-state até o fim.",
      "Se o Source falhar, confira se o projeto de CodeCommit (app-ponto com buildspec na main) foi feito; se o Deploy falhar, o de CodeDeploy.",
    ],
    solucao: [
      "aws s3 mb s3://app-ponto-artefatos",
      "aws codebuild create-project --name app-ponto-build --source type=CODEPIPELINE --artifacts type=CODEPIPELINE --environment type=LINUX_CONTAINER,image=aws/codebuild/standard:7.0,computeType=BUILD_GENERAL1_SMALL --service-role arn:aws:iam::123456789012:role/codebuild-servico",
      "aws codepipeline create-pipeline --cli-input-json file://esteira-app-ponto.json",
      estado("app-ponto-esteira"), estado("app-ponto-esteira"), estado("app-ponto-esteira"),
    ],
    etapas: [
      { texto: "Bucket de artefatos app-ponto-artefatos", validar: (c) => !!(c.s3 && c.s3.buckets && c.s3.buckets["app-ponto-artefatos"]) },
      { texto: "Projeto de build app-ponto-build", validar: (c) => !!((((c.codebuild || {}).projetos) || {})["app-ponto-build"]) },
      { texto: "Esteira app-ponto-esteira criada", validar: (c) => !!esteira(c, "app-ponto-esteira") },
      { texto: "Uma execução chegou no fim (Succeeded)", validar: (c) => execs(c, "app-ponto-esteira").some((x) => x.status === "Succeeded") },
    ] };

  if (!SERVICOS_META.some((s) => s.id === "codepipeline")) {
    const meta = { id: "codepipeline", nome: "CodePipeline", subtitulo: "A esteira de CI/CD", icone: "🛤️" };
    // o fecho da família: depois do CodeDeploy
    const iCd = SERVICOS_META.findIndex((s) => s.id === "codedeploy");
    const iProj = SERVICOS_META.findIndex((s) => s.id === "projetos");
    if (iCd >= 0) SERVICOS_META.splice(iCd + 1, 0, meta);
    else if (iProj >= 0) SERVICOS_META.splice(iProj, 0, meta);
    else SERVICOS_META.push(meta);
    for (const x of TRILHA) DESAFIOS.push(x);
    DESAFIOS.push(PROJETO);
  }
})();
