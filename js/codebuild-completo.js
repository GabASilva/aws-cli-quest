"use strict";
// ============================================================
// CLImb — codebuild-completo.js
// AWS CodeBuild: o build de CI sob demanda. Primeiro serviço da família Code
// (a lacuna mais citada nas vagas de DevOps — ver memória trilhas-por-profissao).
//
// Formato de saída conferido nos exemplos oficiais do `aws codebuild <cmd> help`
// (AWS CLI 2.35.8, 25/09/2026): project/build com datas em epoch com fração,
// id de build "projeto:uuid", fases SUBMITTED → QUEUED → ... → COMPLETED.
//
// Os builds não rodam de verdade: cada um avança quando alguém consulta
// (batch-get-builds). O resultado vem do repositório de origem:
//   - repositório com "testes-quebrados" no nome: FALHA na fase BUILD
//     (exit status 1 no npm test) — pra ensinar a ler as fases;
//   - repositório com "app-instavel": o 1º build dá FAULT no DOWNLOAD_SOURCE
//     (timeout de rede) e os seguintes passam — pra ensinar o retry-build;
//   - o resto: SUCCEEDED.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined") return;

  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";
  const agora = () => Math.round(Date.now()) / 1000;
  const arnProjeto = (c, n) => `arn:aws:codebuild:${REGIAO(c)}:${CONTA_ID(c)}:project/${n}`;
  const uuid = () => `${hexAleatorio(8)}-${hexAleatorio(4)}-${hexAleatorio(4)}-${hexAleatorio(4)}-${hexAleatorio(12)}`;

  function st(conta) {
    conta.codebuild = conta.codebuild || { projetos: {}, builds: {} };
    return conta.codebuild;
  }
  // --source/--artifacts/--environment aceitam JSON ou a forma curta chave=valor
  function estrutura(valor, nome) {
    const bruto = String(valor);
    if (bruto.trim().charAt(0) === "{") {
      try { return JSON.parse(bruto); }
      catch (e) { throw new ErroCli(`Error parsing parameter '--${nome}': Invalid JSON received.`); }
    }
    return parsearShorthand(bruto);
  }
  const lista = (v, pos) => [].concat(v === undefined ? [] : v).concat(pos || []).map(String).filter(Boolean);
  function projetoDe(conta, nome, op) {
    const p = st(conta).projetos[nome];
    if (!p) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the ${op} operation: Project cannot be found: ${arnProjeto(conta, nome)}`);
    return p;
  }
  function buildDe(conta, id, op) {
    const b = st(conta).builds[String(id)];
    if (!b) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the ${op} operation: Build not found: ${id}\nO id tem a forma <projeto>:<uuid> — pegue com: aws codebuild list-builds-for-project --project-name <projeto>`);
    return b;
  }

  const TIPOS_FONTE = ["GITHUB", "GITHUB_ENTERPRISE", "GITLAB", "GITLAB_SELF_MANAGED", "BITBUCKET", "CODECOMMIT", "S3", "CODEPIPELINE", "NO_SOURCE"];
  const TIPOS_ARTEFATO = ["NO_ARTIFACTS", "S3", "CODEPIPELINE"];
  const TIPOS_AMBIENTE = ["LINUX_CONTAINER", "ARM_CONTAINER", "LINUX_GPU_CONTAINER", "WINDOWS_SERVER_2019_CONTAINER", "WINDOWS_SERVER_2022_CONTAINER"];
  const TAMANHOS = ["BUILD_GENERAL1_SMALL", "BUILD_GENERAL1_MEDIUM", "BUILD_GENERAL1_LARGE", "BUILD_GENERAL1_XLARGE", "BUILD_GENERAL1_2XLARGE"];

  function validarFonte(f, op) {
    if (!f.type) throw new ErroCli(`An error occurred (InvalidInputException) when calling the ${op} operation: source type is required.`);
    if (TIPOS_FONTE.indexOf(f.type) < 0) throw new ErroCli(`An error occurred (InvalidInputException) when calling the ${op} operation: Invalid source type: ${f.type}\nTipos: ${TIPOS_FONTE.join(", ")}`);
    if (["NO_SOURCE", "CODEPIPELINE"].indexOf(f.type) < 0 && !f.location) throw new ErroCli(`An error occurred (InvalidInputException) when calling the ${op} operation: Source location is required for source type ${f.type}.`);
    return { type: f.type, location: f.location, insecureSsl: false, gitCloneDepth: f.type === "GITHUB" || f.type === "CODECOMMIT" ? 1 : undefined, buildspec: f.buildspec };
  }
  function validarArtefato(a, op) {
    if (!a.type || TIPOS_ARTEFATO.indexOf(a.type) < 0) throw new ErroCli(`An error occurred (InvalidInputException) when calling the ${op} operation: Invalid artifacts type: ${a.type || "(vazio)"}\nTipos: ${TIPOS_ARTEFATO.join(", ")} — pra build que só testa, NO_ARTIFACTS.`);
    if (a.type === "S3" && !a.location) throw new ErroCli(`An error occurred (InvalidInputException) when calling the ${op} operation: Artifacts location is required for artifacts type S3.`);
    return a.type === "NO_ARTIFACTS" ? { type: "NO_ARTIFACTS" } : { type: a.type, location: a.location, namespaceType: "NONE", packaging: "NONE", encryptionDisabled: false };
  }
  function validarAmbiente(e, op) {
    if (!e.type || TIPOS_AMBIENTE.indexOf(e.type) < 0) throw new ErroCli(`An error occurred (InvalidInputException) when calling the ${op} operation: Invalid environment type: ${e.type || "(vazio)"}\nTipos: ${TIPOS_AMBIENTE.join(", ")}`);
    if (!e.image) throw new ErroCli(`An error occurred (InvalidInputException) when calling the ${op} operation: environment image is required. Ex.: aws/codebuild/standard:7.0`);
    if (!e.computeType || TAMANHOS.indexOf(e.computeType) < 0) throw new ErroCli(`An error occurred (InvalidInputException) when calling the ${op} operation: Invalid compute type: ${e.computeType || "(vazio)"}\nTamanhos: ${TAMANHOS.join(", ")}`);
    return { type: e.type, image: e.image, computeType: e.computeType, environmentVariables: [], privilegedMode: e.privilegedMode === "true" || e.privilegedMode === true, imagePullCredentialsType: "CODEBUILD" };
  }
  function projetoJson(conta, p) {
    return {
      name: p.nome, arn: arnProjeto(conta, p.nome), description: p.descricao || undefined,
      source: p.fonte, artifacts: p.artefatos, cache: { type: "NO_CACHE" }, environment: p.ambiente,
      serviceRole: p.role, timeoutInMinutes: p.timeout, queuedTimeoutInMinutes: 480,
      encryptionKey: `arn:aws:kms:${REGIAO(conta)}:${CONTA_ID(conta)}:alias/aws/s3`,
      created: p.criado, lastModified: p.modificado, badge: { badgeEnabled: false },
    };
  }

  // ---------- o build avança quando alguém olha ----------
  const FASES_OK = ["SUBMITTED", "QUEUED", "PROVISIONING", "DOWNLOAD_SOURCE", "INSTALL", "PRE_BUILD", "BUILD", "POST_BUILD", "UPLOAD_ARTIFACTS", "FINALIZING", "COMPLETED"];
  function concluir(conta, b) {
    const p = st(conta).projetos[b.projeto];
    const origem = String(((p && p.fonte) || b.fonte || {}).location || "");
    const anteriores = Object.values(st(conta).builds).filter((x) => x.projeto === b.projeto && x.id !== b.id && x.status !== "IN_PROGRESS").length;
    let t = b.inicio;
    const fase = (tipo, status, ctx) => { const dur = tipo === "BUILD" ? 42 : tipo === "PROVISIONING" ? 14 : tipo === "COMPLETED" ? undefined : 1; const f = { phaseType: tipo, phaseStatus: status, startTime: t }; if (dur !== undefined) { f.durationInSeconds = dur; t += dur; f.endTime = t; } if (ctx) f.contexts = [ctx]; return f; };
    if (/app-instavel/.test(origem) && anteriores === 0) {
      b.status = "FAULT";
      b.fases = ["SUBMITTED", "QUEUED", "PROVISIONING"].map((x) => fase(x, "SUCCEEDED"))
        .concat([fase("DOWNLOAD_SOURCE", "FAILED", { statusCode: "CLIENT_ERROR", message: "RequestError: send request failed caused by: Get \"https://github.com/climb-labs/app-instavel\": dial tcp: i/o timeout" })])
        .concat([fase("FINALIZING", "SUCCEEDED"), { phaseType: "COMPLETED", startTime: t }]);
    } else if (/testes-quebrados/.test(origem)) {
      b.status = "FAILED";
      b.fases = ["SUBMITTED", "QUEUED", "PROVISIONING", "DOWNLOAD_SOURCE", "INSTALL", "PRE_BUILD"].map((x) => fase(x, "SUCCEEDED"))
        .concat([fase("BUILD", "FAILED", { statusCode: "COMMAND_EXECUTION_ERROR", message: "Error while executing command: npm test. Reason: exit status 1" })])
        .concat(["POST_BUILD", "UPLOAD_ARTIFACTS", "FINALIZING"].map((x) => fase(x, "SUCCEEDED")))
        .concat([{ phaseType: "COMPLETED", startTime: t }]);
    } else {
      b.status = "SUCCEEDED";
      b.fases = FASES_OK.slice(0, -1).map((x) => fase(x, "SUCCEEDED")).concat([{ phaseType: "COMPLETED", startTime: t }]);
    }
    b.fim = t; b.fase = "COMPLETED"; b.completo = true;
  }
  function buildJson(conta, b) {
    return {
      id: b.id, arn: `arn:aws:codebuild:${REGIAO(conta)}:${CONTA_ID(conta)}:build/${b.id}`, buildNumber: b.numero,
      startTime: b.inicio, endTime: b.fim, currentPhase: b.fase, buildStatus: b.status,
      sourceVersion: b.versaoFonte, projectName: b.projeto, phases: b.fases,
      source: b.fonte, artifacts: b.artefatos, environment: b.ambiente, serviceRole: b.role,
      logs: { groupName: `/aws/codebuild/${b.projeto}`, streamName: b.id.split(":")[1],
        deepLink: `https://console.aws.amazon.com/cloudwatch/home?region=${REGIAO(conta)}#logEvent:group=/aws/codebuild/${b.projeto};stream=${b.id.split(":")[1]}` },
      timeoutInMinutes: b.timeout, buildComplete: !!b.completo, initiator: "climb",
    };
  }
  function novoBuild(conta, p, over) {
    const s = st(conta);
    p.contador = (p.contador || 0) + 1;
    const id = `${p.nome}:${uuid()}`;
    const inicio = agora();
    const ambiente = JSON.parse(JSON.stringify(p.ambiente));
    if (over.variaveis && over.variaveis.length) ambiente.environmentVariables = over.variaveis;
    s.builds[id] = {
      id, projeto: p.nome, numero: p.contador, status: "IN_PROGRESS", fase: "QUEUED", completo: false, consultas: 0,
      inicio, fim: undefined, versaoFonte: over.versao, fonte: p.fonte, artefatos: p.artefatos, ambiente, role: p.role,
      timeout: over.timeout || p.timeout,
      fases: [{ phaseType: "SUBMITTED", phaseStatus: "SUCCEEDED", startTime: inicio, endTime: inicio + 0.4, durationInSeconds: 0 }, { phaseType: "QUEUED", startTime: inicio + 0.4 }],
    };
    return s.builds[id];
  }

  SERVICOS.codebuild = {
    "list-projects": (conta, pos, flags) => {
      const s = st(conta);
      const por = String(flags["sort-by"] || "LAST_MODIFIED_TIME");
      const ordem = String(flags["sort-order"] || "DESCENDING");
      if (["NAME", "CREATED_TIME", "LAST_MODIFIED_TIME"].indexOf(por) < 0) throw new ErroCli("An error occurred (InvalidInputException) when calling the ListProjects operation: --sort-by precisa ser NAME, CREATED_TIME ou LAST_MODIFIED_TIME.");
      if (["ASCENDING", "DESCENDING"].indexOf(ordem) < 0) throw new ErroCli("An error occurred (InvalidInputException) when calling the ListProjects operation: --sort-order precisa ser ASCENDING ou DESCENDING.");
      const chave = { NAME: (p) => p.nome, CREATED_TIME: (p) => p.criado, LAST_MODIFIED_TIME: (p) => p.modificado }[por];
      const l = Object.values(s.projetos).sort((a, b) => (chave(a) < chave(b) ? -1 : chave(a) > chave(b) ? 1 : 0));
      if (ordem === "DESCENDING") l.reverse();
      if (!l.length) avisarClimb("Nenhum projeto de build ainda. O projeto é a RECEITA: de onde vem o código, em que máquina roda e quem ele é (a role). Crie com: aws codebuild create-project ...");
      return js({ projects: l.map((p) => p.nome) });
    },
    "create-project": (conta, pos, flags) => {
      const s = st(conta);
      const nome = String(exigirFlag(flags, "name"));
      if (!/^[A-Za-z0-9][A-Za-z0-9\-_]{1,149}$/.test(nome)) throw new ErroCli(`An error occurred (InvalidInputException) when calling the CreateProject operation: Invalid project name: ${nome} (2 a 150 caracteres: letras, números, - e _, começando por letra ou número)`);
      if (s.projetos[nome]) throw new ErroCli(`An error occurred (ResourceAlreadyExistsException) when calling the CreateProject operation: Project already exists: ${arnProjeto(conta, nome)}`);
      const fonte = validarFonte(estrutura(exigirFlag(flags, "source"), "source"), "CreateProject");
      const artefatos = validarArtefato(estrutura(exigirFlag(flags, "artifacts"), "artifacts"), "CreateProject");
      const ambiente = validarAmbiente(estrutura(exigirFlag(flags, "environment"), "environment"), "CreateProject");
      const role = String(exigirFlag(flags, "service-role"));
      if (!/^arn:aws:iam::\d{12}:role\/.+/.test(role)) throw new ErroCli(`An error occurred (InvalidInputException) when calling the CreateProject operation: Invalid service role: ${role}\nÉ o ARN de uma role do IAM, ex.: arn:aws:iam::123456789012:role/codebuild-servico`);
      const timeout = flags["timeout-in-minutes"] !== undefined ? parseInt(flags["timeout-in-minutes"], 10) : 60;
      if (!(timeout >= 5 && timeout <= 2160)) throw new ErroCli("An error occurred (InvalidInputException) when calling the CreateProject operation: timeoutInMinutes precisa estar entre 5 e 2160.");
      const t = agora();
      s.projetos[nome] = { nome, descricao: flags.description !== undefined ? String(flags.description) : "", fonte, artefatos, ambiente, role, timeout, criado: t, modificado: t, contador: 0 };
      avisarClimb("Projeto criado — mas nada rodou ainda. O projeto é a receita; o BUILD é cada vez que você executa a receita (start-build). Os comandos de cada fase ficam no buildspec.yml, dentro do repositório.");
      return js({ project: projetoJson(conta, s.projetos[nome]) });
    },
    "batch-get-projects": (conta, pos, flags) => {
      const s = st(conta);
      const nomes = lista(exigirFlag(flags, "names"), pos);
      return js({ projects: nomes.filter((n) => s.projetos[n]).map((n) => projetoJson(conta, s.projetos[n])), projectsNotFound: nomes.filter((n) => !s.projetos[n]) });
    },
    "start-build": (conta, pos, flags) => {
      const p = projetoDe(conta, String(exigirFlag(flags, "project-name")), "StartBuild");
      const variaveis = flags["environment-variables-override"] !== undefined
        ? lista(flags["environment-variables-override"], pos).map((v) => { const o = parsearShorthand(v); if (!o.name) throw new ErroCli("An error occurred (InvalidInputException) when calling the StartBuild operation: cada variável precisa de name e value. Forma: name=AMBIENTE,value=producao"); return { name: o.name, value: o.value || "", type: o.type || "PLAINTEXT" }; })
        : [];
      const timeout = flags["timeout-in-minutes-override"] !== undefined ? parseInt(flags["timeout-in-minutes-override"], 10) : undefined;
      const b = novoBuild(conta, p, { variaveis, versao: flags["source-version"] !== undefined ? String(flags["source-version"]) : undefined, timeout });
      avisarClimb("Build na fila. Ele roda num contêiner limpo, executa as fases do buildspec e some — você paga só os minutos de máquina. Acompanhe com: aws codebuild batch-get-builds --ids " + b.id);
      return js({ build: buildJson(conta, b) });
    },
    "batch-get-builds": (conta, pos, flags) => {
      const s = st(conta);
      const ids = lista(exigirFlag(flags, "ids"), pos);
      const achados = [];
      for (const id of ids) {
        const b = s.builds[id];
        if (!b) continue;
        if (b.status === "IN_PROGRESS") {
          b.consultas += 1;
          if (b.consultas >= 2) concluir(conta, b);
          else { b.fase = "BUILD"; b.fases = [b.fases[0], { phaseType: "QUEUED", phaseStatus: "SUCCEEDED", startTime: b.inicio + 0.4, endTime: b.inicio + 1, durationInSeconds: 1 }, { phaseType: "PROVISIONING", phaseStatus: "SUCCEEDED", startTime: b.inicio + 1, endTime: b.inicio + 15, durationInSeconds: 14 }, { phaseType: "BUILD", startTime: b.inicio + 15 }]; }
        }
        achados.push(buildJson(conta, b));
      }
      const falhou = achados.find((b) => b.buildStatus === "FAILED" || b.buildStatus === "FAULT");
      if (falhou) avisarClimb("Build que falhou: olhe a fase com phaseStatus FAILED e o campo contexts dela — é ali que está o motivo (o comando que deu erro, ou a rede que caiu). O log completo fica no CloudWatch Logs, no grupo /aws/codebuild/<projeto>.");
      else if (achados.some((b) => b.buildStatus === "IN_PROGRESS")) avisarClimb("Ainda rodando (buildStatus IN_PROGRESS). Consulte de novo em instantes.");
      return js({ builds: achados, buildsNotFound: ids.filter((id) => !s.builds[id]) });
    },
    "list-builds-for-project": (conta, pos, flags) => {
      const p = projetoDe(conta, String(exigirFlag(flags, "project-name")), "ListBuildsForProject");
      const ordem = String(flags["sort-order"] || "DESCENDING");
      if (["ASCENDING", "DESCENDING"].indexOf(ordem) < 0) throw new ErroCli("An error occurred (InvalidInputException) when calling the ListBuildsForProject operation: --sort-order precisa ser ASCENDING ou DESCENDING.");
      const l = Object.values(st(conta).builds).filter((b) => b.projeto === p.nome).sort((a, b) => a.inicio - b.inicio || a.numero - b.numero);
      if (ordem === "DESCENDING") l.reverse();
      if (!l.length) avisarClimb("Nenhum build ainda nesse projeto. Rode um com: aws codebuild start-build --project-name " + p.nome);
      return js({ ids: l.map((b) => b.id) });
    },
    "stop-build": (conta, pos, flags) => {
      const b = buildDe(conta, exigirFlag(flags, "id"), "StopBuild");
      // Mensagem aproximada: a doc lista InvalidInputException pra build que já terminou.
      if (b.status !== "IN_PROGRESS") throw new ErroCli(`An error occurred (InvalidInputException) when calling the StopBuild operation: Build ${b.id} cannot be stopped: buildStatus is ${b.status}, not IN_PROGRESS.`);
      b.status = "STOPPED"; b.fase = "COMPLETED"; b.completo = true; b.fim = agora();
      b.fases = b.fases.slice(0, 2).concat([{ phaseType: "COMPLETED", startTime: b.fim }]);
      avisarClimb("Build parado. Parar é pra quando você disparou o build errado (branch errada, commit errado) ou ele travou — os minutos até aqui já foram cobrados.");
      return js({ build: buildJson(conta, b) });
    },
    "retry-build": (conta, pos, flags) => {
      const velho = buildDe(conta, exigirFlag(flags, "id"), "RetryBuild");
      if (velho.status === "IN_PROGRESS") throw new ErroCli(`An error occurred (InvalidInputException) when calling the RetryBuild operation: Build ${velho.id} is still in progress.`);
      const p = projetoDe(conta, velho.projeto, "RetryBuild");
      const b = novoBuild(conta, p, { variaveis: velho.ambiente.environmentVariables, versao: velho.versaoFonte, timeout: velho.timeout });
      avisarClimb("Build repetido com EXATAMENTE a mesma configuração do anterior. Serve pra falha passageira (rede, serviço fora do ar); se o erro for no código, ele falha de novo igual.");
      return js({ build: buildJson(conta, b) });
    },
    "update-project": (conta, pos, flags) => {
      const p = projetoDe(conta, String(exigirFlag(flags, "name")), "UpdateProject");
      if (flags.description !== undefined) p.descricao = String(flags.description);
      if (flags.source !== undefined) p.fonte = validarFonte(estrutura(flags.source, "source"), "UpdateProject");
      if (flags.artifacts !== undefined) p.artefatos = validarArtefato(estrutura(flags.artifacts, "artifacts"), "UpdateProject");
      if (flags.environment !== undefined) p.ambiente = validarAmbiente(estrutura(flags.environment, "environment"), "UpdateProject");
      if (flags["service-role"] !== undefined) p.role = String(flags["service-role"]);
      if (flags["timeout-in-minutes"] !== undefined) {
        const t = parseInt(flags["timeout-in-minutes"], 10);
        if (!(t >= 5 && t <= 2160)) throw new ErroCli("An error occurred (InvalidInputException) when calling the UpdateProject operation: timeoutInMinutes precisa estar entre 5 e 2160.");
        p.timeout = t;
      }
      p.modificado = agora();
      avisarClimb("Receita atualizada. Vale pros PRÓXIMOS builds — os que já rodaram guardam a configuração da época.");
      return js({ project: projetoJson(conta, p) });
    },
    "delete-project": (conta, pos, flags) => {
      const s = st(conta);
      const nome = String(exigirFlag(flags, "name"));
      if (!s.projetos[nome]) { avisarClimb("Esse projeto não existia — e a AWS responde sucesso mesmo assim."); return ""; }
      delete s.projetos[nome];
      avisarClimb("Projeto apagado. O histórico de builds dele não some junto, e os logs continuam no CloudWatch Logs até você apagar o grupo.");
      return "";
    },
  };

  // ============================================================
  // MANUAIS
  // ============================================================
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => "USO\n    " + uso + "\n\n" + txt;
    Object.assign(MANUAIS, {
      codebuild: "aws codebuild — AWS CodeBuild\n\nO build de CI sob demanda: pega o código, sobe um contêiner limpo, roda\nos comandos do buildspec.yml (instalar, testar, empacotar) e some.\n\nAS DUAS PEÇAS\n    PROJETO   a receita: fonte, máquina, role\n    BUILD     cada execução da receita (id <projeto>:<uuid>)\n\nCOMANDOS\n    list-projects / batch-get-projects / create-project\n    update-project / delete-project\n    start-build / batch-get-builds / list-builds-for-project\n    stop-build / retry-build",
      "codebuild.list-projects": M("aws codebuild list-projects [--sort-by NAME|CREATED_TIME|LAST_MODIFIED_TIME] [--sort-order ASCENDING|DESCENDING]",
        "Lista os NOMES dos projetos de build da conta. O detalhe de cada um vem\ncom o batch-get-projects."),
      "codebuild.create-project": M("aws codebuild create-project --name <nome> \\\n        --source type=GITHUB,location=https://github.com/<org>/<repo> \\\n        --artifacts type=NO_ARTIFACTS \\\n        --environment type=LINUX_CONTAINER,image=aws/codebuild/standard:7.0,computeType=BUILD_GENERAL1_SMALL \\\n        --service-role arn:aws:iam::<conta>:role/<role>",
        "Cria a RECEITA do build: de onde vem o código (source), o que guardar no\nfim (artifacts), em que máquina roda (environment) e com qual permissão\n(service-role). Nada roda até o start-build.\n\nOs comandos de cada fase (install, build, testes) ficam no arquivo\nbuildspec.yml, na raiz do repositório.\n\nTIPOS\n    source       GITHUB, CODECOMMIT, S3, BITBUCKET, GITLAB, NO_SOURCE...\n    artifacts    NO_ARTIFACTS (só testa), S3, CODEPIPELINE\n    computeType  BUILD_GENERAL1_SMALL, MEDIUM, LARGE... (maior = mais caro por minuto)\n\nOPÇÕES ÚTEIS\n    --timeout-in-minutes   de 5 a 2160 (padrão 60)\n    --description"),
      "codebuild.batch-get-projects": M("aws codebuild batch-get-projects --names <projeto> [<projeto2> ...]",
        "Detalhe de um ou mais projetos: fonte, ambiente, role, timeout.\nNome que não existe não é erro: vai pra lista projectsNotFound."),
      "codebuild.start-build": M("aws codebuild start-build --project-name <projeto> [--source-version <branch|commit>] [--environment-variables-override name=VAR,value=valor]",
        "Roda o build uma vez. Devolve o id do build (<projeto>:<uuid>), que é o\nque os outros comandos pedem.\n\nOPÇÕES ÚTEIS\n    --source-version                 branch, tag ou commit específico\n    --environment-variables-override variáveis só pra este build\n    --timeout-in-minutes-override    teto só pra este build"),
      "codebuild.batch-get-builds": M("aws codebuild batch-get-builds --ids <id-do-build> [<id2> ...]",
        "O estado de um ou mais builds: buildStatus (IN_PROGRESS, SUCCEEDED,\nFAILED, FAULT, STOPPED, TIMED_OUT), a fase atual e a lista de fases.\n\nQUANDO FALHA\n    procure a fase com phaseStatus FAILED e leia o campo contexts: é ali\n    que vem o motivo. FAILED costuma ser o seu código (teste quebrado);\n    FAULT costuma ser o ambiente (rede, permissão, serviço fora)."),
      "codebuild.list-builds-for-project": M("aws codebuild list-builds-for-project --project-name <projeto> [--sort-order ASCENDING|DESCENDING]",
        "Os ids dos builds de um projeto, do mais novo pro mais velho (padrão\nDESCENDING)."),
      "codebuild.stop-build": M("aws codebuild stop-build --id <id-do-build>",
        "Para um build que está rodando. Build que já terminou não pode ser\nparado. Os minutos até ali já foram cobrados."),
      "codebuild.retry-build": M("aws codebuild retry-build --id <id-do-build>",
        "Roda de novo um build que já terminou, com EXATAMENTE a mesma\nconfiguração. Resolve falha passageira (rede, serviço fora); erro de\ncódigo falha igual de novo."),
      "codebuild.update-project": M("aws codebuild update-project --name <projeto> [--timeout-in-minutes <n>] [--environment ...] [--source ...] [--description ...]",
        "Muda a receita. Vale pros próximos builds; os antigos guardam a\nconfiguração da época."),
      "codebuild.delete-project": M("aws codebuild delete-project --name <projeto>",
        "Apaga o projeto. Não produz saída. O histórico de builds e os logs no\nCloudWatch Logs não somem junto."),
    });
  }

  // ============================================================
  // LIÇÃO + PORQUE
  // ============================================================
  if (typeof LICOES !== "undefined" && !LICOES.codebuild) {
    LICOES.codebuild = {
      emoji: "🏗️", titulo: "AWS CodeBuild",
      oque: "O CodeBuild é um <b>montador de código de aluguel</b>: você entrega o repositório e a receita (o arquivo <code>buildspec.yml</code>), ele sobe um contêiner limpo, roda os comandos — instalar dependência, testar, empacotar — e desaparece. Não existe servidor de CI pra você manter ligado.",
      serve: "É o \"CI\" do CI/CD na AWS: todo commit dispara um build que roda os testes e gera o pacote que vai pra produção. Você paga só os minutos de máquina, e cada build nasce numa máquina zerada — sem o \"na minha máquina funciona\".",
      casos: [
        "Todo push na branch main dispara um build que roda os testes da API e bloqueia o deploy se algum quebrar.",
        "Um time monta a imagem Docker da aplicação no CodeBuild e publica no ECR, sem ninguém rodar docker build no notebook.",
        "O CodePipeline chama o CodeBuild no meio da esteira: fonte → build → deploy.",
      ],
      vocab: [
        ["Projeto", "a receita do build: de onde vem o código, em que máquina roda e com qual role."],
        ["Build", "cada execução da receita, com id <projeto>:<uuid>."],
        ["buildspec.yml", "o arquivo no repositório com os comandos de cada fase (install, pre_build, build, post_build)."],
        ["Fase", "cada etapa do build (DOWNLOAD_SOURCE, INSTALL, BUILD...). A que deu FAILED diz onde quebrou."],
        ["Artefato", "o que o build produz e guarda (um .zip no S3, por exemplo). Build que só testa usa NO_ARTIFACTS."],
        ["Service role", "a role do IAM que o build assume pra ler o código, escrever log e publicar artefato."],
      ],
      cobra: "Paga por minuto de build, e o preço sobe com o tamanho da máquina (computeType). Build parado ou encerrado não cobra. Comparando: é o equivalente AWS do runner do GitHub Actions — a diferença é que ele vive dentro da sua conta, com acesso direto à sua rede e às suas roles.",
    };
  }
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "codebuild.list-projects": "mostra quais receitas de build existem na conta.",
      "codebuild.create-project": "define a receita do build — código, máquina e permissão — sem rodar nada ainda.",
      "codebuild.batch-get-projects": "mostra o que está configurado num projeto (fonte, máquina, role, timeout).",
      "codebuild.start-build": "roda a receita uma vez; é o que o pipeline chama a cada commit.",
      "codebuild.batch-get-builds": "diz se o build passou, falhou ou ainda roda — e em que fase quebrou.",
      "codebuild.list-builds-for-project": "o histórico de execuções de um projeto, do mais novo pro mais velho.",
      "codebuild.stop-build": "interrompe um build disparado por engano ou travado, pra parar de pagar minuto.",
      "codebuild.retry-build": "repete um build igualzinho — pra falha passageira de rede ou de serviço.",
      "codebuild.update-project": "muda a receita (máquina, timeout, fonte) pros próximos builds.",
      "codebuild.delete-project": "remove a receita que ninguém usa mais.",
    });
  }

  // ============================================================
  // ATIVIDADES
  // ============================================================
  if (typeof DESAFIOS === "undefined" || typeof SERVICOS_META === "undefined") return;
  function d(id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar) {
    return { id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar };
  }
  const projeto = (c, n) => (((c.codebuild || {}).projetos) || {})[n];
  const buildsDe = (c, n) => Object.values(((c.codebuild || {}).builds) || {}).filter((b) => b.projeto === n);
  const ROLE = "arn:aws:iam::123456789012:role/codebuild-servico";
  const AMB = "type=LINUX_CONTAINER,image=aws/codebuild/standard:7.0,computeType=BUILD_GENERAL1_SMALL";
  const criar = (nome, repo) => `aws codebuild create-project --name ${nome} --source type=GITHUB,location=https://github.com/climb-labs/${repo} --artifacts type=NO_ARTIFACTS --environment ${AMB} --service-role ${ROLE}`;

  const TRILHA = [
    d("cb-1", "codebuild", 1, 50, "Quem monta o código aqui?",
      "O time vai tirar o build do notebook do dev e passar pra nuvem. Antes de criar qualquer coisa, veja se já existe algum <b>projeto de build</b> na conta.",
      ["Pra ver o que já existe, o verbo é `list-` e o recurso vai no plural.", "No CodeBuild, a receita do build se chama projeto."],
      ["aws codebuild list-projects"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codebuild", "list-projects")),
    d("cb-2", "codebuild", 1, 80, "A receita do build da API",
      "Crie o projeto <b>api-loja-build</b>: código no GitHub em <b>https://github.com/climb-labs/api-loja</b>, sem artefato (por enquanto ele só testa), máquina <b>LINUX_CONTAINER</b> com a imagem <b>aws/codebuild/standard:7.0</b> no tamanho <b>BUILD_GENERAL1_SMALL</b>, e a role <b>" + ROLE + "</b>.",
      ["Criar é `create-project`, e ele exige cinco coisas: nome, fonte, artefato, ambiente e role.", "Fonte, artefato e ambiente aceitam a forma curta `chave=valor,chave=valor`: `--source type=GITHUB,location=...`, `--artifacts type=NO_ARTIFACTS`.", "O ambiente é `--environment type=LINUX_CONTAINER,image=aws/codebuild/standard:7.0,computeType=BUILD_GENERAL1_SMALL`."],
      [criar("api-loja-build", "api-loja")],
      (c) => !!projeto(c, "api-loja-build")),
    d("cb-3", "codebuild", 2, 60, "O que ficou configurado?",
      "Confira a receita do <b>api-loja-build</b>: de onde vem o código, em que máquina roda e com qual role.",
      ["O detalhe dos projetos vem do `batch-get-projects` — ele aceita vários nomes de uma vez.", "A flag é `--names`."],
      ["aws codebuild batch-get-projects --names api-loja-build"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codebuild", "batch-get-projects") && /api-loja-build/.test(String(cmd.flags.names || ""))),
    d("cb-f1", "codebuild", 2, 60, "Em ordem alfabética",
      "Com a conta crescendo, liste os projetos em ordem de <b>nome</b>, de A a Z.",
      ["Mesmo `list-projects`, com ordenação.", "As flags são `--sort-by NAME` e `--sort-order ASCENDING`."],
      ["aws codebuild list-projects --sort-by NAME --sort-order ASCENDING"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codebuild", "list-projects") && String(cmd.flags["sort-by"] || "") === "NAME"),
    d("cb-4", "codebuild", 2, 80, "Rode o primeiro build",
      "A receita está pronta. Rode um build do <b>api-loja-build</b> e anote o <code>id</code> que volta — é ele que você vai acompanhar.",
      ["Rodar a receita uma vez é o `start-build`.", "Ele só precisa do `--project-name`."],
      ["aws codebuild start-build --project-name api-loja-build"],
      (c) => buildsDe(c, "api-loja-build").length > 0),
    d("cb-5", "codebuild", 2, 80, "Passou ou quebrou?",
      "O build está rodando. Consulte o estado dele pelo id — e consulte de novo até o <code>buildStatus</code> sair de IN_PROGRESS.",
      ["O estado de builds vem do `batch-get-builds`, com `--ids`.", "O id tem a forma `api-loja-build:<uuid>` e veio na resposta do start-build."],
      ["aws codebuild batch-get-builds --ids <build-id>", "aws codebuild batch-get-builds --ids <build-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codebuild", "batch-get-builds") && buildsDe(c, "api-loja-build").some((b) => b.status === "SUCCEEDED")),
    d("cb-f2", "codebuild", 2, 70, "Só o veredito",
      "O script do deploy só quer saber se o build passou. Consulte o build trazendo só o <b>buildStatus</b>.",
      ["Mesmo `batch-get-builds`, com `--query`.", "O caminho é `builds[0].buildStatus`."],
      ["aws codebuild batch-get-builds --ids <build-id> --query builds[0].buildStatus"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codebuild", "batch-get-builds") && /buildStatus/.test(String(cmd.flags.query || ""))),
    d("cb-6", "codebuild", 2, 70, "O histórico da API",
      "O gestor quer ver todos os builds já rodados da API. Liste os builds do <b>api-loja-build</b>.",
      ["O histórico de um projeto é o `list-builds-for-project`.", "Ele pede o `--project-name` e devolve os ids, do mais novo pro mais velho."],
      ["aws codebuild list-builds-for-project --project-name api-loja-build"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codebuild", "list-builds-for-project") && String(cmd.flags["project-name"] || "") === "api-loja-build"),
    d("cb-f3", "codebuild", 3, 90, "O build da branch de release",
      "A versão candidata está na branch <b>release</b>, e o build dela precisa saber que é homologação. Rode o <b>api-loja-build</b> na branch <b>release</b> com a variável <b>AMBIENTE=homolog</b>.",
      ["Mesmo `start-build`, com duas flags a mais.", "A branch vai em `--source-version release`; a variável em `--environment-variables-override name=AMBIENTE,value=homolog`."],
      ["aws codebuild start-build --project-name api-loja-build --source-version release --environment-variables-override name=AMBIENTE,value=homolog"],
      (c) => buildsDe(c, "api-loja-build").some((b) => b.versaoFonte === "release" && (b.ambiente.environmentVariables || []).some((v) => v.name === "AMBIENTE" && v.value === "homolog"))),
    d("cb-f4", "codebuild", 3, 70, "Do primeiro build pro último",
      "Pra um relatório, liste os builds do <b>api-loja-build</b> na ordem em que aconteceram — do mais velho pro mais novo.",
      ["Mesmo `list-builds-for-project`, com a ordem invertida.", "A flag é `--sort-order ASCENDING`."],
      ["aws codebuild list-builds-for-project --project-name api-loja-build --sort-order ASCENDING"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codebuild", "list-builds-for-project") && String(cmd.flags["sort-order"] || "") === "ASCENDING"),
    d("cb-f5", "codebuild", 3, 110, "O build vermelho",
      "O projeto de testes de integração, <b>testes-api-build</b>, usa o repositório <b>https://github.com/climb-labs/testes-quebrados</b>. Crie o projeto (mesma máquina e role), rode um build e consulte até ele terminar. Descubra <b>em que fase</b> ele quebrou e <b>por quê</b>.",
      ["Criar e rodar você já sabe.", "Na resposta do batch-get-builds, procure a fase com `phaseStatus` FAILED e leia o `contexts` dela."],
      [criar("testes-api-build", "testes-quebrados"),
        "aws codebuild start-build --project-name testes-api-build",
        "aws codebuild batch-get-builds --ids <build-id>",
        "aws codebuild batch-get-builds --ids <build-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codebuild", "batch-get-builds") && buildsDe(c, "testes-api-build").some((b) => b.status === "FAILED")),
    d("cb-7", "codebuild", 3, 90, "Build disparado na branch errada",
      "Alguém rodou o <b>api-loja-build</b> na branch <b>experimento</b> por engano, e cada minuto é cobrado. Rode esse build (pra ver o cenário) e <b>pare</b> ele antes de terminar.",
      ["Rodar na branch é o `start-build --source-version experimento`.", "Parar é o `stop-build`, com o `--id` do build."],
      ["aws codebuild start-build --project-name api-loja-build --source-version experimento",
        "aws codebuild stop-build --id <build-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codebuild", "stop-build") && buildsDe(c, "api-loja-build").some((b) => b.versaoFonte === "experimento" && b.status === "STOPPED")),
    d("cb-f6", "codebuild", 3, 80, "O teste vermelho não precisa rodar de novo",
      "Os testes de integração estão quebrados de propósito enquanto o time corrige. Alguém disparou mais um build do <b>testes-api-build</b> — pare antes de gastar minuto.",
      ["Mesmo `stop-build` de antes, com o id do build novo."],
      ["aws codebuild start-build --project-name testes-api-build",
        "aws codebuild stop-build --id <build-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codebuild", "stop-build") && buildsDe(c, "testes-api-build").some((b) => b.status === "STOPPED")),
    d("cb-8", "codebuild", 3, 120, "A rede caiu no meio do build",
      "O projeto do app, <b>app-mobile-build</b> (repositório <b>https://github.com/climb-labs/app-instavel</b>), falhou na primeira vez — e não foi o código. Crie o projeto, rode, consulte até terminar e veja a fase que falhou. Depois, <b>repita</b> o build igualzinho.",
      ["O status FAULT e a fase DOWNLOAD_SOURCE dizem: foi a rede, não o seu código.", "Repetir com a mesma configuração é o `retry-build --id`."],
      [criar("app-mobile-build", "app-instavel"),
        "aws codebuild start-build --project-name app-mobile-build",
        "aws codebuild batch-get-builds --ids <build-id>",
        "aws codebuild batch-get-builds --ids <build-id>",
        "aws codebuild retry-build --id <build-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codebuild", "retry-build") && buildsDe(c, "app-mobile-build").length >= 2),
    d("cb-f7", "codebuild", 3, 90, "A repetição passou?",
      "Confira o build repetido do <b>app-mobile-build</b> até ele terminar — agora tem que dar SUCCEEDED.",
      ["O `batch-get-builds` com o id do build novo (o retry devolve um id NOVO)."],
      ["aws codebuild batch-get-builds --ids <build-id>", "aws codebuild batch-get-builds --ids <build-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codebuild", "batch-get-builds") && buildsDe(c, "app-mobile-build").some((b) => b.status === "SUCCEEDED")),
    d("cb-f8", "codebuild", 3, 80, "Repetir não conserta código",
      "Pra fixar a diferença: repita o último build do <b>testes-api-build</b> e consulte até terminar. Ele vai falhar igual — erro de código não passa na base da insistência.",
      ["Mesmo `retry-build`, agora num build que falhou por culpa do código.", "Depois, o `batch-get-builds` até o fim."],
      ["aws codebuild retry-build --id <build-falho>",
        "aws codebuild batch-get-builds --ids <build-id>",
        "aws codebuild batch-get-builds --ids <build-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codebuild", "batch-get-builds") && buildsDe(c, "testes-api-build").filter((b) => b.status === "FAILED").length >= 2),
    d("cb-9", "codebuild", 3, 90, "Build travado não pode rodar uma hora",
      "Um build do <b>api-loja-build</b> travou e ficou cobrando até o timeout padrão de 60 minutos. O build normal leva 5. Baixe o timeout do projeto pra <b>15</b> minutos.",
      ["Mudar a receita é o `update-project`, com o `--name`.", "A flag do teto é `--timeout-in-minutes`."],
      ["aws codebuild update-project --name api-loja-build --timeout-in-minutes 15"],
      (c) => (projeto(c, "api-loja-build") || {}).timeout === 15),
    d("cb-f9", "codebuild", 3, 90, "O build do app precisa de mais máquina",
      "O build do app mobile está lento na máquina pequena. Troque o ambiente do <b>app-mobile-build</b> pra <b>BUILD_GENERAL1_MEDIUM</b> (mesma imagem e tipo).",
      ["Mesmo `update-project`, trocando o `--environment` inteiro.", "O ambiente vai completo: `type=LINUX_CONTAINER,image=aws/codebuild/standard:7.0,computeType=BUILD_GENERAL1_MEDIUM`."],
      ["aws codebuild update-project --name app-mobile-build --environment type=LINUX_CONTAINER,image=aws/codebuild/standard:7.0,computeType=BUILD_GENERAL1_MEDIUM"],
      (c) => ((projeto(c, "app-mobile-build") || {}).ambiente || {}).computeType === "BUILD_GENERAL1_MEDIUM"),
    d("cb-f11", "codebuild", 3, 70, "Compare as duas receitas",
      "Antes da reunião de custo, compare lado a lado o <b>api-loja-build</b> e o <b>app-mobile-build</b>: máquina e timeout de cada um.",
      ["O `batch-get-projects` aceita vários nomes numa chamada só.", "Os nomes vão separados por espaço em `--names`."],
      ["aws codebuild batch-get-projects --names api-loja-build app-mobile-build"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codebuild", "batch-get-projects") && /app-mobile-build/.test(JSON.stringify(cmd.flags.names || "") + JSON.stringify(cmd.posicionais || []))),
    d("cb-10", "codebuild", 3, 80, "Os testes de integração foram pra outro lugar",
      "O time moveu os testes de integração pra dentro do projeto da API. Apague o <b>testes-api-build</b>.",
      ["Apagar a receita é o `delete-project`, com o `--name`.", "Ele não devolve nada — silêncio é sucesso."],
      ["aws codebuild delete-project --name testes-api-build"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codebuild", "delete-project") && !projeto(c, "testes-api-build")),
    d("cb-f10", "codebuild", 3, 80, "O projeto da documentação",
      "Alguém criou o <b>docs-build</b> (repositório <b>https://github.com/climb-labs/docs</b>) pra testar e esqueceu. Crie pra ver o cenário e apague.",
      ["Criar você já sabe; apagar é o comando da atividade anterior."],
      [criar("docs-build", "docs"), "aws codebuild delete-project --name docs-build"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codebuild", "delete-project") && String(cmd.flags.name || "") === "docs-build" && !projeto(c, "docs-build")),
  ];

  const PROJETO = { id: "cb-proj", servico: "codebuild", tipo: "projeto", nivel: 3, xp: 340,
    titulo: "🏗️ Projeto: o CI do checkout",
    descricao: "O time de pagamentos quer o CI do serviço de checkout pronto. Sem passo a passo: entregue o projeto <b>checkout-ci</b> (repositório <b>https://github.com/climb-labs/checkout</b>, sem artefato, máquina pequena Linux com a imagem standard:7.0, role <b>" + ROLE + "</b>) com <b>timeout de 20 minutos</b>, rode um build e confirme que ele passou.",
    dicas: [
      "É o caminho da trilha: create-project → update-project (ou já crie com --timeout-in-minutes) → start-build → batch-get-builds até terminar.",
      "O build só aparece SUCCEEDED depois de você consultar o estado dele.",
    ],
    solucao: [
      criar("checkout-ci", "checkout") + " --timeout-in-minutes 20",
      "aws codebuild start-build --project-name checkout-ci",
      "aws codebuild batch-get-builds --ids <build-id>",
      "aws codebuild batch-get-builds --ids <build-id>",
    ],
    etapas: [
      { texto: "Criar o projeto checkout-ci", validar: (c) => !!projeto(c, "checkout-ci") },
      { texto: "Timeout de 20 minutos", validar: (c) => (projeto(c, "checkout-ci") || {}).timeout === 20 },
      { texto: "Rodar um build", validar: (c) => buildsDe(c, "checkout-ci").length > 0 },
      { texto: "Confirmar que o build passou", validar: (c) => buildsDe(c, "checkout-ci").some((b) => b.status === "SUCCEEDED") },
    ] };

  if (!SERVICOS_META.some((s) => s.id === "codebuild")) {
    const meta = { id: "codebuild", nome: "CodeBuild", subtitulo: "Build e testes de CI", icone: "🏗️" };
    const iProj = SERVICOS_META.findIndex((s) => s.id === "projetos");
    if (iProj >= 0) SERVICOS_META.splice(iProj, 0, meta); else SERVICOS_META.push(meta);
    for (const x of TRILHA) DESAFIOS.push(x);
    DESAFIOS.push(PROJETO);
  }
})();
