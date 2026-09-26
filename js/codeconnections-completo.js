"use strict";
// ============================================================
// CLImb — codeconnections-completo.js
// AWS CodeConnections (`aws codeconnections`; nome antigo, que ainda
// funciona: `aws codestar-connections`): a ponte entre a AWS e o GitHub,
// GitLab ou Bitbucket. É por ela que a esteira do CodePipeline puxa código
// que NÃO está no CodeCommit — hoje, o caso da maioria das empresas.
//
// Fontes (26/09/2026): `aws codeconnections <cmd> help` e os exemplos do
// `aws codestar-connections <cmd> help` (mesma API; o novo não traz
// exemplos), AWS CLI 2.35.8. De lá: "A connection created through
// CloudFormation, the CLI, or the SDK is in PENDING status by default. You
// can make its status AVAILABLE by updating the connection in the console"
// e "Before you delete a host, all connections associated to the host must
// be deleted."
//
// O HANDSHAKE: na vida real, deixar a conexão AVAILABLE é um passo no
// console (você entra no GitHub e autoriza o app da AWS) — não existe
// comando de CLI pra isso. No lab, quem faz é "a Paula, do time de
// plataforma": na segunda consulta (get-connection / get-host) o recurso
// aparece autorizado, com um aviso deixando claro que esse passo é humano.
//
// O ARN da conexão aqui é previsível a partir do nome (na AWS é um UUID
// sorteado) — assim as plantas de esteira do lab (esteira-github.json...)
// já vêm com o ARN certo, sem precisar editar arquivo no terminal.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined") return;

  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";
  const erro = (op, tipo, msg) => new ErroCli(`An error occurred (${tipo}) when calling the ${op} operation: ${msg}`);
  const PROVEDORES = ["Bitbucket", "GitHub", "GitHubEnterpriseServer", "GitLab", "GitLabSelfManaged"];
  const PROV_HOST = ["GitHubEnterpriseServer", "GitLabSelfManaged"];

  // uuid "de mentira" mas estável a partir do nome
  // FNV-1a sobre o texto INTEIRO, uma rodada por bloco de 8 hex (a primeira
  // versão lia só os 4 primeiros caracteres e toda conexão "conexao:..."
  // ganhava o mesmo ARN)
  function hexDe(texto, n) {
    const t = String(texto);
    let s = "";
    for (let bloco = 0; s.length < n; bloco++) {
      let h = (0x811c9dc5 ^ bloco) >>> 0;
      for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      s += h.toString(16).padStart(8, "0");
    }
    return s.slice(0, n);
  }
  const uuidDe = (t) => { const h = hexDe(t, 32); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };
  const arnConexao = (svc, c, nome) => `arn:aws:${svc}:${REGIAO(c)}:${CONTA_ID(c)}:connection/${uuidDe("conexao:" + nome)}`;
  const arnHost = (svc, c, nome) => `arn:aws:${svc}:${REGIAO(c)}:${CONTA_ID(c)}:host/${nome}-${hexDe("host:" + nome, 8)}`;
  const idDoArn = (arn) => String(arn).split("/").pop();

  // o "lado de fora": repositórios que existem nos provedores do lab
  const REPOS = {
    GitHub: { "climb-labs/api-loja": "version: 0.2", "climb-labs/checkout": "version: 0.2", "climb-labs/vitrine": "version: 0.2", "climb-labs/testes-quebrados": "exit 1" },
    GitLab: { "parceiro-frete/cotacao": "version: 0.2" },
    Bitbucket: { "agencia-mkt/landing": "version: 0.2" },
    GitHubEnterpriseServer: { "engenharia/folha": "version: 0.2" },
    GitLabSelfManaged: {},
  };

  function st(conta) {
    conta.codeconnections = conta.codeconnections || { conexoes: {}, hosts: {} };
    return conta.codeconnections;
  }
  // aceita o ARN inteiro, com o prefixo novo ou o antigo (mesmo recurso)
  function conexaoDe(conta, arn, op) {
    const x = Object.values(st(conta).conexoes).find((c) => idDoArn(c.arn) === idDoArn(arn));
    if (!x) throw erro(op, "ResourceNotFoundException", `Connection ${arn} not found\nVeja as que existem com: aws codeconnections list-connections`);
    return x;
  }
  function hostDe(conta, arn, op) {
    const x = Object.values(st(conta).hosts).find((h) => idDoArn(h.arn) === idDoArn(arn));
    if (!x) throw erro(op, "ResourceNotFoundException", `Host ${arn} not found`);
    return x;
  }
  const arnNo = (svc, arn) => String(arn).replace(/^arn:aws:(codeconnections|codestar-connections):/, `arn:aws:${svc}:`);

  function conexaoJson(svc, c, x) {
    const o = { ConnectionName: x.nome, ConnectionArn: arnNo(svc, x.arn), ProviderType: x.provedor, OwnerAccountId: CONTA_ID(c), ConnectionStatus: x.status };
    if (x.host) o.HostArn = arnNo(svc, x.host);
    return o;
  }

  function handlers(svc) {
    return {
      "create-connection": (conta, pos, flags) => {
        const op = "CreateConnection";
        const s = st(conta);
        const nome = String(exigirFlag(flags, "connection-name"));
        if (!/^[\w-]{1,32}$/.test(nome)) throw erro(op, "ValidationException", "1 validation error detected: Value at 'connectionName' failed to satisfy constraint: até 32 caracteres, letras, números, - e _.");
        let provedor = flags["provider-type"] !== undefined ? String(flags["provider-type"]) : undefined;
        let host;
        if (flags["host-arn"] !== undefined) {
          const h = hostDe(conta, String(flags["host-arn"]), op);
          host = h.arn; provedor = h.provedor;
        }
        if (!provedor) throw erro(op, "ValidationException", "Either ProviderType or HostArn must be specified.");
        if (PROVEDORES.indexOf(provedor) < 0) throw new ErroCli(`\nInvalid choice: '${provedor}', valid choices are: ${PROVEDORES.map((x) => "'" + x + "'").join(", ")}`);
        if (PROV_HOST.indexOf(provedor) >= 0 && !host) throw erro(op, "ValidationException", `A connection to ${provedor} must be created with --host-arn (crie o host antes: aws ${svc} create-host).`);
        if (s.conexoes[nome]) throw erro(op, "ResourceUnavailableException", `Connection with name ${nome} already exists`);
        s.conexoes[nome] = { nome, arn: arnConexao(svc, conta, nome), provedor, host, status: "PENDING", consultas: 0 };
        avisarClimb("Conexão criada — e PENDING. Pelo CLI ela nasce pendente: alguém precisa entrar no console, clicar em \"Update pending connection\" e autorizar o app da AWS na conta do " + provedor + ". Não existe comando de CLI pra esse passo.");
        return js({ ConnectionArn: arnNo(svc, s.conexoes[nome].arn) });
      },
      "get-connection": (conta, pos, flags) => {
        const x = conexaoDe(conta, exigirFlag(flags, "connection-arn"), "GetConnection");
        x.consultas += 1;
        if (x.status === "PENDING" && x.consultas >= 2) {
          const h = x.host ? Object.values(st(conta).hosts).find((y) => y.arn === x.host) : null;
          if (h && h.status !== "AVAILABLE") avisarClimb("Continua PENDING: a conexão usa um host que ainda não está AVAILABLE. Confira com get-host.");
          else { x.status = "AVAILABLE"; avisarClimb(`AVAILABLE. No lab, a Paula do time de plataforma fez o handshake no console (entrou no ${x.provedor} e autorizou o app da AWS). Na vida real esse passo é seu, no navegador — a CLI só consegue criar e conferir.`); }
        } else if (x.status === "PENDING") avisarClimb("Ainda PENDING: falta o handshake no console. Enquanto isso, qualquer esteira que usar esta conexão FALHA no estágio de origem.");
        return js({ Connection: conexaoJson(svc, conta, x) });
      },
      "list-connections": (conta, pos, flags) => {
        let l = Object.values(st(conta).conexoes);
        if (flags["provider-type-filter"] !== undefined) l = l.filter((x) => x.provedor === String(flags["provider-type-filter"]));
        if (flags["host-arn-filter"] !== undefined) l = l.filter((x) => x.host && idDoArn(x.host) === idDoArn(flags["host-arn-filter"]));
        if (!l.length) avisarClimb("Nenhuma conexão. É ela que deixa a AWS ler um repositório do GitHub, GitLab ou Bitbucket — sem guardar senha nem token em lugar nenhum.");
        return js({ Connections: l.map((x) => conexaoJson(svc, conta, x)) });
      },
      "delete-connection": (conta, pos, flags) => {
        const x = conexaoDe(conta, exigirFlag(flags, "connection-arn"), "DeleteConnection");
        delete st(conta).conexoes[x.nome];
        avisarClimb("Conexão apagada. Esteira que usava ela vai falhar no estágio de origem na próxima execução — e no GitHub, o app da AWS continua instalado até alguém remover lá.");
        return "";
      },
      "create-host": (conta, pos, flags) => {
        const op = "CreateHost";
        const s = st(conta);
        const nome = String(exigirFlag(flags, "name"));
        const provedor = String(exigirFlag(flags, "provider-type"));
        if (PROV_HOST.indexOf(provedor) < 0) throw erro(op, "ValidationException", `Host é pra provedor instalado na sua infraestrutura: ${PROV_HOST.join(" ou ")}. GitHub.com e GitLab.com usam conexão direta (create-connection --provider-type).`);
        const endpoint = String(exigirFlag(flags, "provider-endpoint"));
        if (!/^https:\/\//.test(endpoint)) throw erro(op, "ValidationException", "1 validation error detected: Value at 'providerEndpoint' failed to satisfy constraint: o endereço precisa começar com https://");
        if (s.hosts[nome]) throw erro(op, "ResourceUnavailableException", `Host with name ${nome} already exists`);
        s.hosts[nome] = { nome, arn: arnHost(svc, conta, nome), provedor, endpoint, status: "PENDING", consultas: 0 };
        avisarClimb("Host criado — PENDING. O host representa o SEU servidor de Git (instalado na empresa). Ele fica pendente até alguém terminar a configuração no console; depois disso, as conexões são criadas em cima dele (create-connection --host-arn).");
        return js({ HostArn: arnNo(svc, s.hosts[nome].arn) });
      },
      "get-host": (conta, pos, flags) => {
        const h = hostDe(conta, exigirFlag(flags, "host-arn"), "GetHost");
        h.consultas += 1;
        if (h.status === "PENDING" && h.consultas >= 2) { h.status = "AVAILABLE"; avisarClimb("AVAILABLE. No lab, o time de rede terminou a configuração do host no console. Agora dá pra criar conexão em cima dele."); }
        return js({ Name: h.nome, Status: h.status, ProviderType: h.provedor, ProviderEndpoint: h.endpoint });
      },
      "list-hosts": (conta) => {
        return js({ Hosts: Object.values(st(conta).hosts).map((h) => ({ Name: h.nome, HostArn: arnNo(svc, h.arn), ProviderType: h.provedor, ProviderEndpoint: h.endpoint, Status: h.status })) });
      },
      "delete-host": (conta, pos, flags) => {
        const op = "DeleteHost";
        const h = hostDe(conta, exigirFlag(flags, "host-arn"), op);
        const presas = Object.values(st(conta).conexoes).filter((x) => x.host === h.arn);
        if (presas.length) throw erro(op, "ResourceUnavailableException", `Before you delete a host, all connections associated to the host must be deleted.\nConexões presas nele: ${presas.map((x) => x.nome).join(", ")}`);
        delete st(conta).hosts[h.nome];
        st(conta).hostsApagados = (st(conta).hostsApagados || []).concat(h.nome);
        avisarClimb("Host apagado.");
        return "";
      },
    };
  }
  SERVICOS.codeconnections = handlers("codeconnections");
  SERVICOS["codestar-connections"] = handlers("codestar-connections");

  // a esteira pergunta aqui quando a origem é CodeStarSourceConnection
  globalThis.CLIMB_FONTE_EXTERNA = function (conta, cfg) {
    const arn = String(cfg.ConnectionArn || "");
    const x = Object.values(st(conta).conexoes).find((c) => idDoArn(c.arn) === idDoArn(arn));
    if (!x) return { erro: `Connection ${arn} not found. It may have been deleted.` };
    if (x.status !== "AVAILABLE") return { erro: `Connection ${arn} is not available. Its status is ${x.status}: complete the connection handshake in the console.` };
    const repos = REPOS[x.provedor] || {};
    const repo = String(cfg.FullRepositoryId || "");
    if (repos[repo] === undefined) return { erro: `Repository ${repo} not found in ${x.provedor}, or the connection has no access to it.` };
    const branch = String(cfg.BranchName || "main");
    if (branch !== "main") return { erro: `Branch ${branch} not found in repository ${repo}.` };
    return { revisao: hexDe("commit:" + repo, 40), mensagem: `Merge pull request #42 from ${repo.split("/")[0]}/feature`, buildspec: repos[repo] };
  };

  // ============================================================
  // PLANTAS DE ESTEIRA DO LAB (com o ARN previsível da conexão)
  // ============================================================
  (function () {
    if (typeof ARQUIVOS_LOCAIS === "undefined") return;
    const contaPadrao = { regiao: "us-east-1", contaId: "123456789012" };
    const planta = (nome, loja, conexao, repo, projeto) => JSON.stringify({ pipeline: {
      name: nome, roleArn: "arn:aws:iam::123456789012:role/codepipeline-servico",
      artifactStore: { type: "S3", location: loja }, pipelineType: "V2", executionMode: "SUPERSEDED",
      stages: [
        { name: "Source", actions: [{ name: "Source", actionTypeId: { category: "Source", owner: "AWS", provider: "CodeStarSourceConnection", version: "1" }, runOrder: 1,
          configuration: { ConnectionArn: arnConexao("codeconnections", contaPadrao, conexao), FullRepositoryId: repo, BranchName: "main", OutputArtifactFormat: "CODE_ZIP" },
          inputArtifacts: [], outputArtifacts: [{ name: "SourceArtifact" }] }] },
        { name: "Build", actions: [{ name: "Build", actionTypeId: { category: "Build", owner: "AWS", provider: "CodeBuild", version: "1" }, runOrder: 1,
          configuration: { ProjectName: projeto }, inputArtifacts: [{ name: "SourceArtifact" }], outputArtifacts: [{ name: "BuildArtifact" }] }] },
      ] } }, null, 2) + "\n";
    const CONTEUDOS = {
      "esteira-github.json": planta("vitrine-esteira", "vitrine-artefatos", "github-climb-labs", "climb-labs/vitrine", "vitrine-build"),
      "esteira-gitlab.json": planta("frete-esteira", "vitrine-artefatos", "gitlab-parceiro", "parceiro-frete/cotacao", "vitrine-build"),
      "esteira-testes-github.json": planta("testes-esteira", "vitrine-artefatos", "github-climb-labs", "climb-labs/testes-quebrados", "vitrine-build"),
    };
    for (const nome of Object.keys(CONTEUDOS)) {
      ARQUIVOS_LOCAIS[nome] = CONTEUDOS[nome].length;
      if (typeof window !== "undefined") { window.ARQUIVOS_CONTEUDO = window.ARQUIVOS_CONTEUDO || {}; window.ARQUIVOS_CONTEUDO[nome] = CONTEUDOS[nome]; }
    }
  })();

  // ============================================================
  // MANUAIS (os dois nomes do serviço)
  // ============================================================
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => "USO\n    " + uso + "\n\n" + txt;
    const man = (svc) => ({
      [svc]: `aws ${svc} — AWS CodeConnections\n\nA ponte entre a AWS e o seu repositório no GitHub, GitLab ou Bitbucket.\nA esteira (CodePipeline) usa a conexão pra ler o código — sem senha nem\ntoken guardado em lugar nenhum.` + (svc === "codestar-connections" ? "\n\nNOME ANTIGO: o serviço foi renomeado pra aws codeconnections. Os dois\nfuncionam e mexem nos mesmos recursos." : "") + "\n\nA CONEXÃO NASCE PENDING\n    Pelo CLI ela é criada pendente; alguém autoriza no console (entra no\n    GitHub e aprova o app da AWS) e ela vira AVAILABLE. Esteira com\n    conexão pendente falha no estágio de origem.\n\nCOMANDOS\n    create-connection / get-connection / list-connections / delete-connection\n    create-host / get-host / list-hosts / delete-host (Git instalado na empresa)",
      [`${svc}.create-connection`]: M(`aws ${svc} create-connection --connection-name <nome> --provider-type GitHub|GitLab|Bitbucket\n    aws ${svc} create-connection --connection-name <nome> --host-arn <arn-do-host>`,
        "Cria a conexão, que nasce PENDING — falta o handshake no console. Pra\nGitHub Enterprise / GitLab instalado na empresa, a conexão vai em cima de\num host (--host-arn). Devolve o ConnectionArn."),
      [`${svc}.get-connection`]: M(`aws ${svc} get-connection --connection-arn <arn>`,
        "Detalhe da conexão, com o ConnectionStatus: PENDING (falta autorizar no\nconsole), AVAILABLE (pronta) ou ERROR."),
      [`${svc}.list-connections`]: M(`aws ${svc} list-connections [--provider-type-filter GitHub] [--host-arn-filter <arn>]`,
        "As conexões da conta, com provedor e status."),
      [`${svc}.delete-connection`]: M(`aws ${svc} delete-connection --connection-arn <arn>`,
        "Apaga a conexão. Não produz saída. Esteira que usava ela passa a falhar\nno estágio de origem."),
      [`${svc}.create-host`]: M(`aws ${svc} create-host --name <nome> --provider-type GitHubEnterpriseServer|GitLabSelfManaged --provider-endpoint https://<servidor>`,
        "Registra um servidor de Git instalado na empresa (GitHub Enterprise,\nGitLab self-managed). Nasce PENDING até a configuração terminar no\nconsole. Devolve o HostArn."),
      [`${svc}.get-host`]: M(`aws ${svc} get-host --host-arn <arn>`,
        "Detalhe do host: nome, status, provedor e endereço."),
      [`${svc}.list-hosts`]: M(`aws ${svc} list-hosts`,
        "Os hosts da conta."),
      [`${svc}.delete-host`]: M(`aws ${svc} delete-host --host-arn <arn>`,
        "Apaga o host. Antes, apague todas as conexões ligadas a ele. Não produz\nsaída."),
    });
    Object.assign(MANUAIS, man("codeconnections"), man("codestar-connections"));
  }

  // ============================================================
  // LIÇÃO + PORQUE
  // ============================================================
  if (typeof LICOES !== "undefined" && !LICOES.codeconnections) {
    LICOES.codeconnections = {
      emoji: "🔌", titulo: "AWS CodeConnections",
      oque: "A conexão é uma <b>tomada entre a AWS e o seu GitHub</b> (ou GitLab, ou Bitbucket): você autoriza uma vez, no console, e a esteira passa a ler o repositório sozinha — sem senha, sem token copiado num arquivo.",
      serve: "A maioria das empresas guarda o código no GitHub ou no GitLab, não no CodeCommit. Pra esteira da AWS enxergar esse código, ela precisa de uma conexão. É por isso que, em vaga de DevOps com AWS, \"CodePipeline + GitHub\" aparece muito mais que \"CodePipeline + CodeCommit\". O serviço já se chamou CodeStar Connections — o comando antigo, <code>aws codestar-connections</code>, ainda funciona.",
      casos: [
        "Todo merge na main do repositório no GitHub dispara a esteira na AWS, que testa e publica — sem ninguém guardar token do GitHub em lugar nenhum.",
        "Uma empresa com GitHub Enterprise instalado no próprio datacenter registra o servidor como host e cria as conexões em cima dele.",
        "O time desliga um repositório antigo apagando a conexão — e a esteira dele para de puxar código na hora.",
      ],
      vocab: [
        ["Conexão", "a autorização da AWS pra ler repositórios de um provedor (GitHub, GitLab, Bitbucket)."],
        ["PENDING / AVAILABLE", "criada pelo CLI, ela nasce PENDING; vira AVAILABLE quando alguém autoriza no console."],
        ["Handshake", "o passo no console em que você entra no provedor e aprova o app da AWS. Não existe comando de CLI pra ele."],
        ["Host", "o seu servidor de Git instalado na empresa (GitHub Enterprise, GitLab self-managed)."],
        ["FullRepositoryId", "o repositório no formato dono/nome (ex.: climb-labs/vitrine), usado na esteira."],
      ],
      cobra: "A conexão não é cobrada — você paga a esteira e os builds que usam ela. Comparando: <b>conexão x token no buildspec</b> — os dois dão acesso ao repositório, mas o token vaza em log, expira e fica na mão de quem copiou; a conexão é revogável num clique e não expõe segredo nenhum.",
    };
  }
  if (typeof LICAO_ALIAS !== "undefined") LICAO_ALIAS["codestar-connections"] = "codeconnections";
  if (typeof PORQUE !== "undefined") {
    for (const svc of ["codeconnections", "codestar-connections"]) {
      Object.assign(PORQUE, {
        [`${svc}.create-connection`]: "cria a ponte entre a AWS e o GitHub/GitLab — ela nasce pendente até alguém autorizar.",
        [`${svc}.get-connection`]: "diz se a conexão já foi autorizada (AVAILABLE) ou ainda espera o console.",
        [`${svc}.list-connections`]: "mostra quais provedores de Git a conta já alcança.",
        [`${svc}.delete-connection`]: "corta o acesso da AWS a um repositório externo.",
        [`${svc}.create-host`]: "registra o servidor de Git que a empresa roda por conta própria.",
        [`${svc}.get-host`]: "diz se o servidor de Git da empresa já está pronto pra receber conexão.",
        [`${svc}.list-hosts`]: "mostra os servidores de Git próprios registrados na conta.",
        [`${svc}.delete-host`]: "remove um servidor de Git que saiu de uso (depois das conexões dele).",
      });
    }
  }

  // ============================================================
  // ATIVIDADES
  // ============================================================
  if (typeof DESAFIOS === "undefined" || typeof SERVICOS_META === "undefined") return;
  function d(id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar) {
    return { id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar };
  }
  // helpers fora do d(...): acesso por índice dentro dele vira null no corte do gabarito
  const conexao = (c, n) => ((((c.codeconnections || {}).conexoes) || {})[n]);
  const host = (c, n) => ((((c.codeconnections || {}).hosts) || {})[n]);
  const execs = (c, n) => Object.values(((c.codepipeline || {}).execucoes) || {}).filter((x) => x.esteira === n);
  const origem = (x) => (x.estagios.find((g) => g.nome === "Source") || {}).status;
  const flag = (cmd, nome) => String((cmd && cmd.flags && cmd.flags[nome]) || "");
  const ver = (x) => `aws codeconnections get-connection --connection-arn <conexao:${x}>`;
  // montados (não strings prontas): a linha inteira da solução não pode aparecer
  // fora do solucao, senão desce no arquivo público (teste/gabarito.js)
  const verHost = (n) => `aws codeconnections get-host --host-arn <host:${n}>`;
  const estado = (n) => `aws codepipeline get-pipeline-state --name ${n}`;
  const projeto = (n) => `aws codebuild create-project --name ${n} --source type=CODEPIPELINE --artifacts type=CODEPIPELINE --environment type=LINUX_CONTAINER,image=aws/codebuild/standard:7.0,computeType=BUILD_GENERAL1_SMALL --service-role arn:aws:iam::123456789012:role/codebuild-servico`;

  const TRILHA = [
    d("cnx-1", "codeconnections", 1, 50, "O código está no GitHub",
      "O time da <b>vitrine</b> (a loja online) guarda o código no GitHub, na organização <b>climb-labs</b> — não no CodeCommit. Pra esteira da AWS enxergar esse código, ela precisa de uma <b>conexão</b>. Veja se já existe alguma.",
      ["Pra ver o que existe, o verbo é `list-` e o recurso vai no plural.", "O serviço é o `codeconnections`."],
      ["aws codeconnections list-connections"],
      (c, cmd, ok) => ok && (ehCmd(cmd, "codeconnections", "list-connections") || ehCmd(cmd, "codestar-connections", "list-connections"))),
    d("cnx-2", "codeconnections", 1, 80, "A ponte com o GitHub",
      "Crie a conexão <b>github-climb-labs</b> com o provedor <b>GitHub</b>. É o marco da trilha — e repare no aviso: ela nasce pendente.",
      ["Criar é o `create-connection`.", "Ele pede `--connection-name` e `--provider-type GitHub`."],
      ["aws codeconnections create-connection --connection-name github-climb-labs --provider-type GitHub"],
      (c) => !!conexao(c, "github-climb-labs")),
    d("cnx-3", "codeconnections", 1, 60, "Pendente de quê?",
      "Consulte a conexão <b>github-climb-labs</b> pelo ARN que voltou e veja o <code>ConnectionStatus</code>.",
      ["O detalhe é o `get-connection`, com `--connection-arn`.", "O ARN voltou no create-connection (ou saia do list-connections)."],
      [ver("github-climb-labs")],
      (c, cmd, ok) => ok && ehCmd(cmd, "codeconnections", "get-connection") && !!conexao(c, "github-climb-labs")),
    d("cnx-f1", "codeconnections", 2, 70, "Autorizada?",
      "A Paula, do time de plataforma, entrou no console e autorizou o app da AWS no GitHub (esse passo não existe na CLI). Confira de novo — agora só o status, em texto.",
      ["O mesmo `get-connection`, com `--query` e `--output text`.", "O caminho é `Connection.ConnectionStatus`."],
      [ver("github-climb-labs"), ver("github-climb-labs") + " --query Connection.ConnectionStatus --output text"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codeconnections", "get-connection") && /ConnectionStatus/.test(flag(cmd, "query")) && (conexao(c, "github-climb-labs") || {}).status === "AVAILABLE"),
    d("cnx-f2", "codeconnections", 2, 60, "Só as do GitHub",
      "A conta vai ter conexões de vários provedores. Liste só as do <b>GitHub</b>.",
      ["Mesmo `list-connections`, com filtro.", "A flag é `--provider-type-filter GitHub`."],
      ["aws codeconnections list-connections --provider-type-filter GitHub"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codeconnections", "list-connections") && flag(cmd, "provider-type-filter") === "GitHub"),
    d("cnx-4", "codeconnections", 2, 60, "A planta da esteira com GitHub",
      "A planta da esteira da vitrine já está pronta: <b>esteira-github.json</b>. Leia e repare no estágio de origem: o provider é <b>CodeStarSourceConnection</b>, com o <b>ConnectionArn</b> da sua conexão e o repositório <b>climb-labs/vitrine</b>.",
      ["Ler arquivo é o `cat`."],
      ["cat esteira-github.json"],
      (c, cmd, ok) => ok && cmd && cmd.sub === "cat" && /esteira-github\.json/.test((cmd.args || []).join(" "))),
    d("cnx-5", "codeconnections", 2, 60, "O depósito da esteira",
      "A esteira precisa do bucket de artefatos <b>vitrine-artefatos</b> antes de nascer. Crie.",
      ["É o `aws s3 mb s3://<nome>`."],
      ["aws s3 mb s3://vitrine-artefatos"],
      (c) => !!(c.s3 && c.s3.buckets && c.s3.buckets["vitrine-artefatos"])),
    d("cnx-6", "codeconnections", 2, 80, "O build da vitrine",
      "Crie o projeto de build <b>vitrine-build</b> no CodeBuild, com fonte e artefato <b>CODEPIPELINE</b>, máquina <b>LINUX_CONTAINER</b> com <b>aws/codebuild/standard:7.0</b> no tamanho <b>BUILD_GENERAL1_SMALL</b> e a role <b>arn:aws:iam::123456789012:role/codebuild-servico</b>.",
      ["É o `aws codebuild create-project` da trilha de CodeBuild.", "Com esteira no meio: `--source type=CODEPIPELINE` e `--artifacts type=CODEPIPELINE`."],
      [projeto("vitrine-build")],
      (c) => !!((((c.codebuild || {}).projetos) || {})["vitrine-build"])),
    d("cnx-7", "codeconnections", 3, 100, "A esteira puxa do GitHub",
      "Crie a esteira pela planta <b>esteira-github.json</b>. Ela já sai rodando — e o primeiro estágio vai buscar o código no GitHub pela conexão.",
      ["É o `aws codepipeline create-pipeline` da trilha de CodePipeline.", "`--cli-input-json file://esteira-github.json`."],
      ["aws codepipeline create-pipeline --cli-input-json file://esteira-github.json"],
      (c) => execs(c, "vitrine-esteira").length > 0),
    d("cnx-8", "codeconnections", 3, 90, "Do GitHub até o build",
      "Acompanhe a <b>vitrine-esteira</b> até os dois estágios ficarem Succeeded. No Source, o <code>currentRevision</code> é o commit que veio do GitHub.",
      ["O painel é o `aws codepipeline get-pipeline-state --name vitrine-esteira`.", "Cada consulta avança um estágio."],
      [estado("vitrine-esteira"), estado("vitrine-esteira")],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline-state") && execs(c, "vitrine-esteira").some((x) => x.status === "Succeeded")),
    d("cnx-f3", "codeconnections", 3, 130, "A conexão que ninguém autorizou",
      "Um parceiro de frete usa o GitLab. Crie a conexão <b>gitlab-parceiro</b> (provedor <b>GitLab</b>) e, sem esperar ninguém autorizar, crie a esteira da <b>esteira-gitlab.json</b> e olhe o painel. Descubra por que o Source falhou.",
      ["create-connection com --provider-type GitLab; depois create-pipeline e get-pipeline-state.", "Leia o errorDetails do Source: conexão PENDING não entrega código."],
      ["aws codeconnections create-connection --connection-name gitlab-parceiro --provider-type GitLab",
        "aws codepipeline create-pipeline --cli-input-json file://esteira-gitlab.json",
        estado("frete-esteira")],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline-state") && execs(c, "frete-esteira").some((x) => origem(x) === "Failed") && (conexao(c, "gitlab-parceiro") || {}).status === "PENDING"),
    d("cnx-9", "codeconnections", 3, 100, "Autorizado: roda de novo",
      "O parceiro autorizou no console. Confirme que a <b>gitlab-parceiro</b> ficou AVAILABLE e rode a <b>frete-esteira</b> de novo até o Source passar.",
      ["Duas consultas no get-connection (a segunda já mostra AVAILABLE).", "Rodar de novo é o start-pipeline-execution da trilha de CodePipeline (com o nome da esteira); depois, get-pipeline-state."],
      [ver("gitlab-parceiro"), ver("gitlab-parceiro"), "aws codepipeline start-pipeline-execution --name frete-esteira", estado("frete-esteira")],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline-state") && execs(c, "frete-esteira").some((x) => origem(x) === "Succeeded")),
    d("cnx-f4", "codeconnections", 3, 110, "O repositório de testes do GitHub",
      "A mesma conexão serve pra qualquer repositório da organização. Crie a esteira da <b>esteira-testes-github.json</b> (repositório <b>climb-labs/testes-quebrados</b>), acompanhe e veja em que estágio ela para — agora o problema não é a conexão.",
      ["create-pipeline e get-pipeline-state, de novo.", "O Source passa (a conexão está AVAILABLE); quem falha é o Build — o buildspec desse repositório tem um exit 1."],
      ["aws codepipeline create-pipeline --cli-input-json file://esteira-testes-github.json", estado("testes-esteira"), estado("testes-esteira")],
      (c, cmd, ok) => ok && ehCmd(cmd, "codepipeline", "get-pipeline-state") && execs(c, "testes-esteira").some((x) => origem(x) === "Succeeded" && x.status === "Failed")),
    d("cnx-10", "codeconnections", 3, 90, "O Git da empresa",
      "A área de folha de pagamento usa um GitHub Enterprise instalado no datacenter, em <b>https://git.climb-labs.internal</b>. Registre ele como o host <b>ghe-empresa</b> (provedor <b>GitHubEnterpriseServer</b>).",
      ["Criar é o `create-host`.", "Ele pede `--name`, `--provider-type` e `--provider-endpoint`."],
      ["aws codeconnections create-host --name ghe-empresa --provider-type GitHubEnterpriseServer --provider-endpoint https://git.climb-labs.internal"],
      (c) => !!host(c, "ghe-empresa")),
    d("cnx-11", "codeconnections", 3, 80, "O host ficou pronto?",
      "Consulte o host <b>ghe-empresa</b> pelo ARN — e de novo, depois que o time de rede terminar a configuração no console.",
      ["O detalhe é o `get-host`, com `--host-arn`.", "A segunda consulta mostra AVAILABLE."],
      [verHost("ghe-empresa"), verHost("ghe-empresa")],
      (c, cmd, ok) => ok && ehCmd(cmd, "codeconnections", "get-host") && (host(c, "ghe-empresa") || {}).status === "AVAILABLE"),
    d("cnx-f7", "codeconnections", 3, 100, "O GitLab da equipe de dados",
      "A equipe de dados roda um GitLab próprio em <b>https://gitlab.dados.climb-labs.internal</b>. Registre como o host <b>gitlab-dados</b> (provedor <b>GitLabSelfManaged</b>) e acompanhe até ficar AVAILABLE.",
      ["O mesmo create-host, com outro provedor.", "Depois, get-host duas vezes."],
      ["aws codeconnections create-host --name gitlab-dados --provider-type GitLabSelfManaged --provider-endpoint https://gitlab.dados.climb-labs.internal", verHost("gitlab-dados"), verHost("gitlab-dados")],
      (c, cmd, ok) => ok && ehCmd(cmd, "codeconnections", "get-host") && (host(c, "gitlab-dados") || {}).status === "AVAILABLE"),
    d("cnx-f5", "codeconnections", 3, 100, "A conexão em cima do host",
      "Crie a conexão <b>ghe-folha</b> em cima do host <b>ghe-empresa</b> (em vez do --provider-type, vai o --host-arn) e confira até ela ficar AVAILABLE.",
      ["O mesmo `create-connection`, com `--host-arn`.", "Depois, get-connection duas vezes."],
      ["aws codeconnections create-connection --connection-name ghe-folha --host-arn <host:ghe-empresa>", ver("ghe-folha"), ver("ghe-folha")],
      (c, cmd, ok) => ok && ehCmd(cmd, "codeconnections", "get-connection") && (conexao(c, "ghe-folha") || {}).status === "AVAILABLE" && !!(conexao(c, "ghe-folha") || {}).host),
    d("cnx-12", "codeconnections", 3, 70, "Os servidores de Git da empresa",
      "Liste os hosts registrados na conta.",
      ["O comando é `list-hosts`."],
      ["aws codeconnections list-hosts"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codeconnections", "list-hosts")),
    d("cnx-f6", "codeconnections", 3, 80, "Quem usa o host?",
      "Antes de mexer no GitHub Enterprise, veja quais conexões dependem dele: liste as conexões filtrando pelo host <b>ghe-empresa</b>, e confira a lista de hosts.",
      ["list-connections com `--host-arn-filter <arn-do-host>`.", "Depois, list-hosts."],
      ["aws codeconnections list-connections --host-arn-filter <host:ghe-empresa>", "aws codeconnections list-hosts"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codeconnections", "list-hosts") && !!host(c, "ghe-empresa")),
    d("cnx-f8", "codeconnections", 3, 90, "O GitLab de dados nunca foi usado",
      "A equipe de dados desistiu do GitLab próprio e ninguém chegou a criar conexão nele. Apague o host <b>gitlab-dados</b> e confira a lista de hosts.",
      ["Sem conexão presa, o delete-host passa direto.", "Depois, list-hosts."],
      ["aws codeconnections delete-host --host-arn <host:gitlab-dados>", "aws codeconnections list-hosts"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codeconnections", "list-hosts") && !host(c, "gitlab-dados") && !!((c.codeconnections || {}).hostsApagados || []).length),
    d("cnx-13", "codeconnections", 3, 90, "O parceiro de frete saiu",
      "O contrato com o parceiro de frete acabou. Corte o acesso: apague a conexão <b>gitlab-parceiro</b>.",
      ["Apagar é o `delete-connection`, com `--connection-arn`.", "Ele não devolve nada."],
      ["aws codeconnections delete-connection --connection-arn <conexao:gitlab-parceiro>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codeconnections", "delete-connection") && !conexao(c, "gitlab-parceiro")),
    d("cnx-14", "codeconnections", 3, 120, "O GitHub Enterprise foi desligado",
      "A folha migrou pro GitHub.com. Desligue o host <b>ghe-empresa</b> — na ordem que a AWS exige: primeiro a conexão <b>ghe-folha</b>, depois o host.",
      ["O delete-connection de antes, na ghe-folha.", "Apagar o host é o `delete-host`, com `--host-arn`. Com conexão presa nele, a AWS recusa."],
      ["aws codeconnections delete-connection --connection-arn <conexao:ghe-folha>",
        "aws codeconnections delete-host --host-arn <host:ghe-empresa>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codeconnections", "delete-host") && !host(c, "ghe-empresa") && !conexao(c, "ghe-folha")),
  ];

  if (!SERVICOS_META.some((s) => s.id === "codeconnections")) {
    const meta = { id: "codeconnections", nome: "CodeConnections", subtitulo: "Esteira com GitHub e GitLab", icone: "🔌" };
    // depois da esteira: ela usa o CodePipeline pra puxar código de fora
    const iCp = SERVICOS_META.findIndex((s) => s.id === "codepipeline");
    const iProj = SERVICOS_META.findIndex((s) => s.id === "projetos");
    if (iCp >= 0) SERVICOS_META.splice(iCp + 1, 0, meta);
    else if (iProj >= 0) SERVICOS_META.splice(iProj, 0, meta);
    else SERVICOS_META.push(meta);
    for (const x of TRILHA) DESAFIOS.push(x);
  }
})();
