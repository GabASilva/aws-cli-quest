"use strict";
// ============================================================
// CLImb — cli-config.js
// Configurar a CLI de verdade: perfis, credenciais, região, role, SSO e o
// `aws login`. É o tema MAIS buscado sobre AWS CLI (10 das 40 perguntas mais
// vistas do Stack Overflow na tag aws-cli, e o autocompletar do Google em
// pt-BR — pesquisa de 29/09/2026) e o simulador respondia a qualquer
// `aws configure` com "já está configurado".
//
// Fontes (29/09/2026): o AWS CLI 2.35.8 instalado, rodado com arquivos de
// config VAZIOS (sem rede, sem tocar na config real):
//   - `configure list` com colunas "NAME : VALUE : TYPE : LOCATION";
//   - "aws: [ERROR]: The config profile (x) could not be found";
//   - "aws: [ERROR]: An error occurred (NoCredentials): Unable to locate
//     credentials. You can configure credentials by running "aws login".";
//   - "aws: [ERROR]: An error occurred (NoRegion): You must specify a region.
//     You can also configure your region by running "aws configure".";
//   - os arquivos ~/.aws/config ([default], [profile x]) e
//     ~/.aws/credentials ([x]) como o `configure set` escreve;
//   - `configure get` de chave que não existe: nada na saída, código 1.
// E os exemplos do `aws sts assume-role help`. O `sso login` e o `aws login`
// abrem o navegador de verdade — aqui esse passo é simulado e o aviso diz isso.
//
// Como encaixa: embrulha executarComandoAwsBase (o `>` de redirecionar
// continua no executarComandoAws de cima). O `aws configure` sem subcomando
// (o interativo) segue no setup-lab.js.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || typeof executarComandoAwsBase !== "function") return;
  const CONTA_ID = (c) => c.contaId || "123456789012";
  const ERRO = (msg) => "\naws: [ERROR]: " + msg;
  const SEM_CREDENCIAL = ERRO("An error occurred (NoCredentials): Unable to locate credentials. You can configure credentials by running \"aws login\".");
  const SEM_REGIAO = ERRO("An error occurred (NoRegion): You must specify a region. You can also configure your region by running \"aws configure\".");
  const GLOBAIS = ["iam", "sts", "s3", "s3api", "route53", "cloudfront", "organizations", "budgets", "ce", "configure", "help", "sso", "login"];
  const pascal = (s) => String(s || "").split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");

  function cli(conta) {
    if (!conta.cli) conta.cli = { perfis: { default: { region: conta.regiao || "us-east-1", output: "json", quest: true } }, ordem: ["default"], sso: {}, login: {} };
    // o `aws configure` interativo da trilha Primeiros passos (setup-lab.js)
    // grava em conta.setup: é o MESMO perfil default, então vale aqui também
    const st = conta.setup, def = conta.cli.perfis.default;
    if (st && st.configurado && def && def.quest && st.setupAplicado !== st.regiao + "|" + st.output) {
      if (st.regiao) def.region = st.regiao;
      if (st.output) def.output = st.output;
      st.setupAplicado = st.regiao + "|" + st.output;
      escreverArquivos(conta);
    }
    return conta.cli;
  }
  // a credencial do perfil default é a do lab (usuário "estudante"), sempre válida
  function chaveDoIam(conta, id) {
    for (const [nome, u] of Object.entries(((conta.iam || {}).usuarios) || {})) {
      const k = (u.chaves || []).find((x) => x.id === id);
      if (k) return { usuario: nome, chave: k };
    }
    return null;
  }
  const mascara = (v) => v ? "****************" + String(v).slice(-4) : "<not set>";

  // ---------- os arquivos ~/.aws/config e ~/.aws/credentials ----------
  function escreverArquivos(conta) {
    if (typeof fsSeed !== "function" || typeof noEm !== "function") return;
    try {
      if (!conta.fs) fsSeed(conta);
      const c = cli(conta);
      const home = noEm(conta, "/home/ec2-user");
      if (!home || home.tipo !== "dir") return;
      home.filhos[".aws"] = home.filhos[".aws"] || { tipo: "dir", modo: "755", filhos: {} };
      const cfgChaves = ["region", "output", "role_arn", "source_profile", "sso_start_url", "sso_region", "sso_account_id", "sso_role_name", "cli_pager"];
      const credChaves = ["aws_access_key_id", "aws_secret_access_key", "aws_session_token"];
      let config = "", cred = "";
      for (const nome of c.ordem) {
        const p = c.perfis[nome];
        if (!p) continue;
        const cfg = cfgChaves.filter((k) => p[k] !== undefined).map((k) => `${k} = ${p[k]}`);
        if (cfg.length) config += `[${nome === "default" ? "default" : "profile " + nome}]\n` + cfg.join("\n") + "\n";
        const cr = p.quest ? ["aws_access_key_id = AKIAQUEST00ESTUDANT", "aws_secret_access_key = (a do lab)"] : credChaves.filter((k) => p[k] !== undefined).map((k) => `${k} = ${p[k]}`);
        if (cr.length) cred += `[${nome}]\n` + cr.join("\n") + "\n";
      }
      home.filhos[".aws"].filhos.config = { tipo: "arquivo", modo: "600", conteudo: config };
      home.filhos[".aws"].filhos.credentials = { tipo: "arquivo", modo: "600", conteudo: cred };
    } catch (e) { /* o disco simulado é conveniência: nunca derruba o comando */ }
  }
  // O ~/.aws existe desde o primeiro `cat`, mesmo antes de qualquer configure
  // (no terminal de verdade o lab já vem configurado). Todo comando de shell
  // passa pelo fsSeed, então é aqui que a pasta nasce.
  if (typeof fsSeed === "function") {
    const fsBase = fsSeed;
    fsSeed = function (conta) {
      fsBase(conta);
      const home = typeof noEm === "function" ? noEm(conta, "/home/ec2-user") : null;
      if (home && home.tipo === "dir" && !home.filhos[".aws"]) escreverArquivos(conta);
    };
  }

  // ---------- quem é você com este perfil ----------
  function identidade(conta, nome, profundidade) {
    const c = cli(conta);
    const p = c.perfis[nome];
    if (!p) return { erro: ERRO(`The config profile (${nome}) could not be found`) };
    if (p.quest) return { arn: `arn:aws:iam::${CONTA_ID(conta)}:user/estudante`, userId: "AIDAEXEMPLO1234567890" };
    if (p.role_arn) {
      if ((profundidade || 0) > 3) return { erro: ERRO("Infinite loop in credential configuration detected") };
      const origem = p.source_profile ? identidade(conta, p.source_profile, (profundidade || 0) + 1) : { erro: SEM_CREDENCIAL };
      if (origem.erro) return origem;
      const nomeRole = String(p.role_arn).split("/").pop();
      const r = (((conta.iam || {}).roles) || {})[nomeRole];
      if (!r) return { erro: ERRO(`An error occurred (AccessDenied) when calling the AssumeRole operation: User: ${origem.arn} is not authorized to perform: sts:AssumeRole on resource: ${p.role_arn}`) };
      const sessao = "botocore-session-" + (c.sessaoRole = c.sessaoRole || String(Math.floor(Date.now() / 1000)));
      return { arn: `arn:aws:sts::${CONTA_ID(conta)}:assumed-role/${nomeRole}/${sessao}`, userId: `${r.roleId || "AROAEXEMPLO"}:${sessao}` };
    }
    if (p.sso_start_url) {
      if (!c.sso[p.sso_start_url]) return { erro: ERRO("The SSO session associated with this profile has expired or is otherwise invalid. To refresh this SSO session run aws sso login with the corresponding profile.") };
      const papel = p.sso_role_name || "PowerUserAccess";
      return { arn: `arn:aws:sts::${p.sso_account_id || CONTA_ID(conta)}:assumed-role/AWSReservedSSO_${papel}_${c.sso[p.sso_start_url]}/estudante`, userId: `AROASSO${c.sso[p.sso_start_url].slice(0, 13).toUpperCase()}:estudante` };
    }
    if (c.login[nome]) return { arn: `arn:aws:iam::${CONTA_ID(conta)}:user/estudante`, userId: "AIDAEXEMPLO1234567890" };
    if (!p.aws_access_key_id || !p.aws_secret_access_key) return { erro: SEM_CREDENCIAL };
    const k = chaveDoIam(conta, p.aws_access_key_id);
    if (!k || k.chave.status !== "Active" || k.chave.segredo !== p.aws_secret_access_key) return { invalida: true, chave: p.aws_access_key_id };
    return { arn: `arn:aws:iam::${CONTA_ID(conta)}:user/${k.usuario}`, userId: ("AIDA" + k.usuario.toUpperCase().replace(/[^A-Z0-9]/g, "") + "EXEMPLO0000000000").slice(0, 21) };
  }

  // ---------- aws configure list/list-profiles/set/get ----------
  function configure(conta, tokens, linha) {
    const sub = tokens[2];
    const { posicionais, flags } = parsearArgs(tokens.slice(3));
    const cmd = { servico: "configure", sub, posicionais, flags, linha };
    const c = cli(conta);
    const nomePerfil = flags.profile !== undefined ? String(flags.profile) : "default";
    if (sub === "list-profiles") return { ok: true, saida: c.ordem.filter((n) => c.perfis[n]).join("\n"), cmd };
    if (sub === "list") {
      const p = c.perfis[nomePerfil];
      if (!p) return { ok: false, saida: ERRO(`The config profile (${nomePerfil}) could not be found`), cmd };
      const L = (n, v, t, l) => `${n.padEnd(10)} : ${String(v).padEnd(24)} : ${String(t).padEnd(16)} : ${l}`;
      const temChave = p.quest || p.aws_access_key_id;
      const linhas = [L("NAME", "VALUE", "TYPE", "LOCATION"),
        flags.profile !== undefined ? L("profile", nomePerfil, "manual", "--profile") : L("profile", "<not set>", "None", "None"),
        temChave ? L("access_key", mascara(p.quest ? "AKIAQUEST00ESTUDANT" : p.aws_access_key_id), "shared-credentials-file", "") : L("access_key", "<not set>", "None", "None"),
        temChave ? L("secret_key", mascara(p.quest ? "segredodolabquest" : p.aws_secret_access_key), "shared-credentials-file", "") : L("secret_key", "<not set>", "None", "None"),
        p.region ? L("region", p.region, "config-file", "~/.aws/config") : L("region", "<not set>", "None", "None")];
      avisarClimb("As chaves aparecem mascaradas de propósito: o list serve pra ver DE ONDE vem cada coisa (o perfil, o arquivo), não pra mostrar segredo. Quer ver os arquivos? cat ~/.aws/config e cat ~/.aws/credentials.");
      return { ok: true, saida: linhas.join("\n"), cmd };
    }
    if (sub === "set") {
      const chave = posicionais[0], valor = posicionais[1];
      if (chave === undefined || valor === undefined) return { ok: false, saida: "\naws: [ERROR]: the following arguments are required: varname, value\nForma: aws configure set <chave> <valor> [--profile <perfil>]", cmd };
      if (!c.perfis[nomePerfil]) { c.perfis[nomePerfil] = {}; c.ordem.push(nomePerfil); }
      const p = c.perfis[nomePerfil];
      if (p.quest && /^aws_(access_key_id|secret_access_key)$/.test(chave)) delete p.quest;
      p[chave] = String(valor);
      escreverArquivos(conta);
      return { ok: true, saida: "", cmd };
    }
    if (sub === "get") {
      const chave = posicionais[0];
      if (chave === undefined) return { ok: false, saida: "\naws: [ERROR]: the following arguments are required: varname", cmd };
      const p = c.perfis[nomePerfil];
      const v = p && (p.quest && chave === "aws_access_key_id" ? "AKIAQUEST00ESTUDANT" : p[chave]);
      if (v === undefined) { avisarClimb(`Nada configurado pra "${chave}" no perfil ${nomePerfil} — a CLI responde em branco e com código de saída 1.`); return { ok: false, saida: "", cmd }; }
      return { ok: true, saida: String(v), cmd };
    }
    return null;
  }

  // ---------- aws sso login/logout e aws login ----------
  function sso(conta, tokens, linha) {
    const sub = tokens[2];
    const { posicionais, flags } = parsearArgs(tokens.slice(3));
    const cmd = { servico: "sso", sub, posicionais, flags, linha };
    const c = cli(conta);
    if (sub === "logout") {
      const n = Object.keys(c.sso).length;
      c.sso = {};
      avisarClimb(n ? "Sessões SSO encerradas: o token guardado no cache foi apagado. Qualquer perfil SSO volta a pedir sso login." : "Não havia sessão SSO aberta.");
      return { ok: true, saida: "", cmd };
    }
    if (sub !== "login") return null;
    const nome = flags.profile !== undefined ? String(flags.profile) : "default";
    const p = c.perfis[nome];
    if (!p) return { ok: false, saida: ERRO(`The config profile (${nome}) could not be found`), cmd };
    const faltam = ["sso_start_url", "sso_region"].filter((k) => !p[k]);
    if (faltam.length) return { ok: false, saida: ERRO(`Missing the following required SSO configuration values: ${faltam.join(", ")}. To make sure this profile is properly configured to use SSO, please run: aws configure sso`), cmd };
    c.sso[p.sso_start_url] = hexAleatorio(16);
    const codigo = hexAleatorio(4).toUpperCase() + "-" + hexAleatorio(4).toUpperCase();
    avisarClimb(`(Simulado) Na vida real a CLI abre o navegador nesse endereço, você confirma o código ${codigo} e faz login no portal da empresa. Aqui o login já foi aprovado. A sessão vale pra TODOS os perfis que usam ${p.sso_start_url}.`);
    return { ok: true, saida: `Attempting to automatically open the SSO authorization page in your default browser.\nIf the browser does not open or you wish to use a different device to authorize this request, open the following URL:\n\nhttps://device.sso.${p.sso_region}.amazonaws.com/\n\nThen enter the code:\n\n${codigo}\nSuccessfully logged into Start URL: ${p.sso_start_url}`, cmd };
  }
  function login(conta, tokens, linha) {
    const { posicionais, flags } = parsearArgs(tokens.slice(2));
    const cmd = { servico: "login", sub: "login", posicionais, flags, linha };
    const c = cli(conta);
    const nome = flags.profile !== undefined ? String(flags.profile) : "default";
    if (!c.perfis[nome]) { c.perfis[nome] = { region: conta.regiao || "us-east-1" }; c.ordem.push(nome); }
    c.login[nome] = true;
    escreverArquivos(conta);
    avisarClimb(flags.remote === true || flags.remote === "true"
      ? `(Simulado) Com --remote a CLI não abre navegador: ela mostra um link pra você abrir em OUTRO aparelho e colar o código de volta — é o jeito em servidor sem tela. Perfil ${nome} logado com credenciais temporárias da sua sessão do console.`
      : `(Simulado) Na vida real a CLI abre o navegador na sua sessão do Console AWS e guarda credenciais TEMPORÁRIAS (renovadas sozinhas) no perfil ${nome}. Sem chave de acesso guardada em arquivo.`);
    return { ok: true, saida: "", cmd };
  }

  // ---------- o embrulho ----------
  // mesmo padrão do servicos-fase5.js/lab-vpc.js: o dispatcher mora no global
  // E no binding léxico — os dois têm de apontar pro embrulho
  const alvo = typeof globalThis !== "undefined" ? globalThis : null;
  const base = (alvo && alvo.executarComandoAwsBase) || executarComandoAwsBase;
  const envolvido = function (conta, linha) {
    let tokens;
    try { tokens = tokenizar(linha); } catch (e) { return base(conta, linha); }
    if (tokens[0] !== "aws" || tokens.length < 2 || tokens[tokens.length - 1] === "help") return base(conta, linha);
    _avisoClimb = null;
    if (tokens[1] === "configure" && tokens[2]) { const r = configure(conta, tokens, linha); if (r) { r.aviso = _avisoClimb; return r; } }
    if (tokens[1] === "sso" && tokens[2]) { const r = sso(conta, tokens, linha); if (r) { r.aviso = _avisoClimb; return r; } }
    if (tokens[1] === "login") { const r = login(conta, tokens, linha); r.aviso = _avisoClimb; return r; }
    // --profile em qualquer comando: o perfil precisa existir e ter credencial válida
    const { flags } = parsearArgs(tokens.slice(3));
    if (flags.profile === undefined || flags.profile === true) return base(conta, linha);
    const nome = String(flags.profile);
    const svc = tokens[1], sub = tokens[2];
    const cmdErro = { servico: svc, sub, posicionais: [], flags, linha };
    const id = identidade(conta, nome);
    if (id.erro) return { ok: false, saida: id.erro, cmd: cmdErro };
    if (id.invalida) {
      avisarClimb("A chave desse perfil não existe mais no IAM (ou foi desativada). Isso acontece depois de uma rotação: a chave nova foi criada, a velha saiu, e o perfil ficou apontando pra velha. Atualize com aws configure set aws_access_key_id ... --profile " + nome);
      const msg = svc === "s3" || svc === "s3api"
        ? `An error occurred (InvalidAccessKeyId) when calling the ${svc === "s3" && sub === "ls" ? "ListBuckets" : pascal(sub)} operation: The AWS Access Key Id you provided does not exist in our records.`
        : `An error occurred (InvalidClientTokenId) when calling the ${pascal(sub)} operation: The security token included in the request is invalid.`;
      return { ok: false, saida: msg, cmd: cmdErro, aviso: _avisoClimb };
    }
    const perfil = cli(conta).perfis[nome];
    if (GLOBAIS.indexOf(svc) < 0 && flags.region === undefined && !perfil.region) return { ok: false, saida: SEM_REGIAO, cmd: cmdErro };
    if (svc === "sts" && sub === "get-caller-identity") {
      const o = { UserId: id.userId, Account: String(id.arn.split(":")[4] || CONTA_ID(conta)), Arn: id.arn };
      let saida = js(o);
      try {
        const saidaFmt = flags.output !== undefined ? flags : Object.assign({}, flags, perfil.output && perfil.output !== "json" ? { output: perfil.output } : {});
        if (saidaFmt.query !== undefined || saidaFmt.output !== undefined) saida = aplicarQueryEOutput(saida, saidaFmt);
      } catch (e) {
        if (e instanceof ErroCli) return { ok: false, saida: e.message, cmd: cmdErro };
        throw e;
      }
      return { ok: true, saida, cmd: cmdErro, aviso: null };
    }
    // perfil com output configurado vale quando o comando não pede outro
    let l = linha;
    if (perfil.output && perfil.output !== "json" && flags.output === undefined && !/\s>\s*\S+\s*$/.test(linha)) l = linha + " --output " + perfil.output;
    return base(conta, l);
  };
  if (alvo) alvo.executarComandoAwsBase = envolvido;
  try { executarComandoAwsBase = envolvido; } catch (e) { /* já coberto pelo global acima */ }

  // ---------- sts assume-role ----------
  SERVICOS.sts["assume-role"] = (conta, pos, flags) => {
    const arn = String(exigirFlag(flags, "role-arn"));
    const sessao = String(exigirFlag(flags, "role-session-name"));
    if (!/^[\w+=,.@-]{2,64}$/.test(sessao)) throw new ErroCli(`An error occurred (ValidationError) when calling the AssumeRole operation: 1 validation error detected: Value '${sessao}' at 'roleSessionName' failed to satisfy constraint: Member must satisfy regular expression pattern: [\\w+=,.@-]*`);
    const dur = flags["duration-seconds"] !== undefined ? parseInt(flags["duration-seconds"], 10) : 3600;
    if (!(dur >= 900)) throw new ErroCli(`An error occurred (ValidationError) when calling the AssumeRole operation: 1 validation error detected: Value '${flags["duration-seconds"]}' at 'durationSeconds' failed to satisfy constraint: Member must have value greater than or equal to 900`);
    if (dur > 3600) throw new ErroCli("An error occurred (ValidationError) when calling the AssumeRole operation: The requested DurationSeconds exceeds the MaxSessionDuration set for this role.");
    const nomeRole = arn.split("/").pop();
    const r = (((conta.iam || {}).roles) || {})[nomeRole];
    if (!r || arn.indexOf(`arn:aws:iam::${CONTA_ID(conta)}:role/`) !== 0) throw new ErroCli(`An error occurred (AccessDenied) when calling the AssumeRole operation: User: arn:aws:iam::${CONTA_ID(conta)}:user/estudante is not authorized to perform: sts:AssumeRole on resource: ${arn}`);
    const exp = new Date(Date.now() + dur * 1000).toISOString().replace(/\.\d+Z$/, "Z");
    avisarClimb(`Credenciais TEMPORÁRIAS da role ${nomeRole}, válidas até ${exp}. É assim que se trabalha com permissão elevada sem guardar chave de admin: pede, usa, expira. Pra não copiar isso à mão, o perfil com role_arn + source_profile faz o assume-role sozinho.`);
    return js({ AssumedRoleUser: { AssumedRoleId: `${r.roleId || "AROAEXEMPLO"}:${sessao}`, Arn: `arn:aws:sts::${CONTA_ID(conta)}:assumed-role/${nomeRole}/${sessao}` },
      Credentials: { SecretAccessKey: hexAleatorio(40), SessionToken: "IQoJb3JpZ2luX2VjE" + hexAleatorio(120), Expiration: exp, AccessKeyId: "ASIA" + hexAleatorio(16).toUpperCase() } });
  };
  // o SSO entra no SERVICOS só pra lista de serviços e o manual (quem responde é o embrulho)
  SERVICOS.sso = { login: () => "", logout: () => "" };

  // ============================================================
  // MANUAIS + PORQUE
  // ============================================================
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => "USO\n    " + uso + "\n\n" + txt;
    Object.assign(MANUAIS, {
      configure: "aws configure\n\nConfigura a CLI: quem você é (credenciais), onde (região) e como a\nresposta sai (output). Cada conjunto é um PERFIL.\n\nONDE FICA\n    ~/.aws/config        região, output, role, SSO   ([default], [profile x])\n    ~/.aws/credentials   chaves de acesso            ([default], [x])\n\nCOMANDOS\n    aws configure                      interativo (o perfil default)\n    aws configure list [--profile x]   de onde vem cada configuração\n    aws configure list-profiles        os perfis que existem\n    aws configure set <chave> <valor> [--profile x]\n    aws configure get <chave> [--profile x]\n\nEM QUALQUER COMANDO\n    --profile x    usa o perfil x      --region y    troca a região só dessa vez",
      "configure.list": M("aws configure list [--profile <perfil>]",
        "Mostra, pra cada item (perfil, access_key, secret_key, region), o valor\n(chave mascarada), o TIPO de origem e o arquivo. É o comando pra\nresponder \"com que credencial e em que região esse terminal está?\""),
      "configure.list-profiles": M("aws configure list-profiles", "Os nomes dos perfis configurados, um por linha."),
      "configure.set": M("aws configure set <chave> <valor> [--profile <perfil>]",
        "Grava UMA configuração no perfil (cria o perfil se não existir), sem\nperguntas. É o jeito de configurar em script.\n\nCHAVES COMUNS\n    aws_access_key_id / aws_secret_access_key   (vão pro credentials)\n    region / output\n    role_arn + source_profile                   perfil que assume uma role\n    sso_start_url / sso_region / sso_account_id / sso_role_name"),
      "configure.get": M("aws configure get <chave> [--profile <perfil>]",
        "Lê UMA configuração. Se não existir, não imprime nada e sai com\ncódigo 1 — bom pra script testar se algo está configurado."),
      sso: "aws sso — login pelo IAM Identity Center (SSO)\n\nNas empresas, ninguém tem chave de acesso: você faz login no portal da\nempresa e a CLI recebe credenciais temporárias pro perfil.\n\nCOMANDOS\n    aws sso login --profile <perfil>    abre o navegador, você aprova\n    aws sso logout                      encerra as sessões SSO",
      "sso.login": M("aws sso login --profile <perfil>",
        "Faz login no portal SSO do perfil (sso_start_url) pelo navegador e\nguarda o token no cache. A sessão vale pra todos os perfis que usam o\nmesmo portal, até expirar."),
      "sso.logout": M("aws sso logout", "Apaga os tokens SSO do cache. Os perfis SSO voltam a pedir sso login."),
      login: M("aws login [--profile <perfil>] [--remote]",
        "Login pra desenvolvimento local usando a sua sessão do Console AWS: a\nCLI recebe credenciais temporárias e renova sozinha enquanto a sessão\nvaler. Sem chave de acesso em arquivo.\n\n--remote   pra máquina sem navegador: mostra um link pra abrir em outro\n           aparelho."),
      "sts.assume-role": M("aws sts assume-role --role-arn <arn-da-role> --role-session-name <nome> [--duration-seconds 900-3600]",
        "Pede credenciais TEMPORÁRIAS de uma role (AccessKeyId, SecretAccessKey,\nSessionToken, Expiration). Pra não copiar à mão, configure um perfil com\nrole_arn e source_profile: a CLI faz o assume-role sozinha."),
    });
  }
  if (typeof PORQUE !== "undefined") Object.assign(PORQUE, {
    "configure.list": "mostra com que credencial e em que região o terminal está falando — o primeiro passo de todo \"não funciona\".",
    "configure.list-profiles": "mostra quais contas e papéis este terminal sabe usar.",
    "configure.set": "grava uma configuração no perfil sem perguntas — é como se configura em script.",
    "configure.get": "lê uma configuração do perfil; em branco quer dizer que não existe.",
    "sts.assume-role": "troca a sua identidade por uma role, com credencial que expira sozinha.",
    "sso.login": "entra pelo portal da empresa e recebe credenciais temporárias, sem chave em arquivo.",
    "sso.logout": "encerra as sessões SSO deste terminal.",
    "login.login": "loga a CLI com a sua sessão do Console, sem criar chave de acesso.",
  });
  if (typeof LICOES !== "undefined" && !LICOES["cli-config"]) {
    LICOES["cli-config"] = {
      emoji: "🔑", titulo: "Configurar a AWS CLI",
      oque: "A CLI precisa de três respostas antes de qualquer comando: <b>quem é você</b> (a credencial), <b>onde</b> (a região) e <b>em que formato</b> responder. Cada conjunto dessas respostas é um <b>perfil</b> — e um terminal bem configurado tem vários: um pra cada conta, ambiente ou papel.",
      serve: "É a dúvida número um de quem começa: \"Unable to locate credentials\", \"You must specify a region\", \"The config profile could not be found\", \"The security token included in the request is invalid\". Quem entende perfil resolve tudo isso em segundos — e troca de conta com um <code>--profile</code>, sem apagar nada.",
      casos: [
        "Um dev usa o perfil <code>dev</code> pro ambiente de teste e o <code>prod</code> só pra consulta — e nunca roda um delete na conta errada.",
        "Depois de rotacionar a chave de um robô, o time atualiza o perfil dele com <code>configure set</code>, sem mexer em mais nada.",
        "Na empresa não existe chave de acesso: todo mundo entra com <code>aws sso login</code> e recebe credencial que expira sozinha.",
      ],
      vocab: [
        ["Perfil", "um conjunto nomeado de credencial + região + formato. O default é o que vale sem --profile."],
        ["~/.aws/config", "o arquivo com região, formato, role e SSO de cada perfil."],
        ["~/.aws/credentials", "o arquivo com as chaves de acesso. É segredo: nunca vai pro git."],
        ["Chave de acesso", "AccessKeyId + SecretAccessKey de um usuário IAM. Longa duração — por isso se rotaciona."],
        ["assume-role", "trocar de identidade por uma role, com credencial temporária (Access Key começa com ASIA)."],
        ["SSO / aws login", "login pelo navegador que entrega credencial temporária, sem chave guardada em arquivo."],
      ],
      cobra: "Configurar a CLI não custa nada. O que custa é errar a conta: um delete no perfil errado é o incidente mais comum de quem tem várias contas. Comparando: <b>chave de acesso x SSO</b> — a chave vale até alguém apagar (e vaza em repositório); a credencial do SSO expira em horas e é o padrão recomendado nas empresas.",
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
  const S = "cli-config";
  const perfil = (c, n) => ((((c.cli || {}).perfis) || {})[n]);
  const usuario = (c, n) => ((((c.iam || {}).usuarios) || {})[n]);
  const chaves = (c, n) => ((usuario(c, n) || {}).chaves || []);
  const flag = (cmd, nome) => String((cmd && cmd.flags && cmd.flags[nome]) || "");
  const logado = (c) => Object.keys(((c.cli || {}).sso) || {}).length > 0;
  const catDe = (cmd, arq) => !!cmd && cmd.sub === "cat" && (cmd.args || []).join(" ").indexOf(arq) >= 0;
  // montados (não strings prontas): a linha inteira da solução não pode aparecer
  // fora do solucao, senão desce no arquivo público (teste/gabarito.js)
  const quem = (p) => `aws sts get-caller-identity` + (p ? ` --profile ${p}` : "");
  const setar = (k, v, p) => `aws configure set ${k} ${v} --profile ${p}`;
  const URL_SSO = "https://climb-labs.awsapps.com/start";

  const TRILHA = [
    d("clicfg-1", S, 1, 50, "Quem é você nesse terminal?",
      "Primeiro dia no emprego novo: te deram um terminal já configurado. Antes de rodar qualquer coisa, descubra <b>com que credencial e em que região</b> ele está falando.",
      ["Quem mostra a configuração atual é o próprio `aws configure`.", "O subcomando é `list`."],
      ["aws configure list"],
      (c, cmd, ok) => ok && ehCmd(cmd, "configure", "list")),
    d("clicfg-2", S, 1, 50, "Com quem a AWS acha que está falando?",
      "O <code>configure list</code> diz o que está no arquivo; a AWS pode discordar. Pergunte pra ela <b>qual identidade</b> (usuário e conta) está por trás deste terminal.",
      ["É o serviço de identidades, o `sts`.", "O comando pergunta \"quem é o chamador\": `get-caller-identity`."],
      [quem()],
      (c, cmd, ok) => ok && ehCmd(cmd, "sts", "get-caller-identity")),
    d("clicfg-3", S, 1, 50, "Que perfis existem?",
      "Um terminal pode falar com várias contas, uma por <b>perfil</b>. Liste os perfis configurados.",
      ["Mesmo `aws configure`.", "O subcomando é `list-profiles`."],
      ["aws configure list-profiles"],
      (c, cmd, ok) => ok && ehCmd(cmd, "configure", "list-profiles")),
    d("clicfg-4", S, 1, 60, "Onde isso fica guardado",
      "A configuração mora em dois arquivos na sua pasta pessoal. Leia o <b>~/.aws/config</b> — é onde ficam a região e o formato de cada perfil.",
      ["Ler arquivo é o `cat`.", "O caminho é `~/.aws/config`."],
      ["cat ~/.aws/config"],
      (c, cmd, ok) => ok && catDe(cmd, ".aws/config")),
    d("clicfg-5", S, 2, 70, "O usuário do robô de relatórios",
      "O robô que gera relatórios vai ter credencial própria, separada da sua. Crie o usuário IAM <b>bot-relatorios</b>.",
      ["É o `aws iam create-user` da trilha de IAM.", "Com `--user-name`."],
      ["aws iam create-user --user-name bot-relatorios"],
      (c) => !!usuario(c, "bot-relatorios")),
    d("clicfg-6", S, 2, 70, "A chave do robô",
      "Crie uma chave de acesso pro <b>bot-relatorios</b>. Anote o <code>AccessKeyId</code> e o <code>SecretAccessKey</code> — o segredo só aparece agora.",
      ["É o `aws iam create-access-key`.", "Com `--user-name bot-relatorios`."],
      ["aws iam create-access-key --user-name bot-relatorios"],
      (c) => chaves(c, "bot-relatorios").length > 0),
    d("clicfg-7", S, 2, 90, "O perfil do robô",
      "Crie o perfil <b>relatorios</b> com a chave do robô — sem mexer no seu perfil default. Grave a <code>aws_access_key_id</code> e a <code>aws_secret_access_key</code> nele.",
      ["Gravar uma configuração sem perguntas é o `aws configure set <chave> <valor> --profile <perfil>`.", "São dois comandos: um pro `aws_access_key_id`, outro pro `aws_secret_access_key`."],
      [setar("aws_access_key_id", "<chave-de:bot-relatorios>", "relatorios"), setar("aws_secret_access_key", "<segredo-de:bot-relatorios>", "relatorios")],
      (c) => !!(perfil(c, "relatorios") || {}).aws_access_key_id && !!(perfil(c, "relatorios") || {}).aws_secret_access_key),
    d("clicfg-8", S, 2, 70, "Agora você é o robô",
      "Pergunte à AWS quem é você <b>usando o perfil relatorios</b>. Repare no ARN: é o bot-relatorios, não você. <small>(se errar o nome do perfil, a CLI responde \"The config profile (...) could not be found\")</small>",
      ["O mesmo `sts get-caller-identity`, com `--profile relatorios`.", "O `--profile` vale em qualquer comando da CLI."],
      [quem("relatorios")],
      (c, cmd, ok) => ok && ehCmd(cmd, "sts", "get-caller-identity") && flag(cmd, "profile") === "relatorios"),
    d("clicfg-9", S, 2, 90, "You must specify a region",
      "O robô vai listar as instâncias EC2 — e o perfil dele não tem região. Rodar assim dá <b>You must specify a region</b>. Configure a região <b>sa-east-1</b> no perfil <b>relatorios</b> e liste as instâncias com ele.",
      ["A região se grava igual às chaves: `aws configure set region sa-east-1 --profile relatorios`.", "Depois, o describe-instances do EC2 — com o `--profile` do robô no fim."],
      [setar("region", "sa-east-1", "relatorios"), "aws ec2 describe-instances --profile relatorios"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-instances") && (perfil(c, "relatorios") || {}).region === "sa-east-1"),
    d("clicfg-10", S, 2, 60, "Só a região, pro script",
      "Um script precisa saber em que região o perfil <b>relatorios</b> está, sem ler o arquivo. Leia só essa configuração.",
      ["Ler uma configuração é o `aws configure get <chave>`.", "Com `--profile relatorios`."],
      ["aws configure get region --profile relatorios"],
      (c, cmd, ok) => ok && ehCmd(cmd, "configure", "get") && flag(cmd, "profile") === "relatorios"),
    d("clicfg-f7", S, 2, 70, "A conferência do script noturno",
      "O script noturno do robô começa conferindo o terminal: quais perfis existem e <b>qual chave</b> o perfil <b>relatorios</b> está usando (pra bater com o IAM).",
      ["Os perfis saem do mesmo comando da atividade 3.", "E a chave, do `configure get` com a chave `aws_access_key_id` e `--profile relatorios`."],
      ["aws configure list-profiles", "aws configure get aws_access_key_id --profile relatorios"],
      (c, cmd, ok) => ok && ehCmd(cmd, "configure", "get") && flag(cmd, "profile") === "relatorios" && (cmd.posicionais || []).indexOf("aws_access_key_id") === 0),
    d("clicfg-f1", S, 2, 80, "Onde a chave foi parar",
      "Confira o perfil do robô de dois jeitos: o <code>configure list</code> (chaves mascaradas) e o arquivo <b>~/.aws/credentials</b> (a chave inteira — é por isso que ele NUNCA vai pro git).",
      ["O `configure list` aceita `--profile`.", "O arquivo é o irmão do config, na mesma pasta `~/.aws/` — e se lê com `cat`."],
      ["aws configure list --profile relatorios", "cat ~/.aws/credentials"],
      (c, cmd, ok) => ok && catDe(cmd, ".aws/credentials") && !!perfil(c, "relatorios")),
    d("clicfg-11", S, 3, 110, "Hora de rotacionar",
      "A chave do robô tem 90 dias e a política manda trocar. Crie uma chave <b>nova</b> pro <b>bot-relatorios</b>, grave no perfil <b>relatorios</b> e confirme que o perfil ainda funciona.",
      ["create-access-key de novo (o usuário pode ter duas chaves ao mesmo tempo — é pra isso).", "Depois os dois configure set com a chave NOVA e o get-caller-identity com o perfil."],
      ["aws iam create-access-key --user-name bot-relatorios", setar("aws_access_key_id", "<chave-de:bot-relatorios>", "relatorios"),
        setar("aws_secret_access_key", "<segredo-de:bot-relatorios>", "relatorios"), quem("relatorios")],
      (c, cmd, ok) => ok && ehCmd(cmd, "sts", "get-caller-identity") && chaves(c, "bot-relatorios").length >= 2 && (perfil(c, "relatorios") || {}).aws_access_key_id === (chaves(c, "bot-relatorios").slice(-1).pop() || {}).id),
    d("clicfg-12", S, 3, 90, "Desligue a chave velha",
      "Com o perfil já na chave nova, desative a <b>antiga</b> do bot-relatorios. Quem ainda estiver usando a velha vai quebrar agora — e é melhor descobrir com ela desativada (dá pra reativar) do que apagada.",
      ["É o `aws iam update-access-key`, com `--user-name`, `--access-key-id` (a antiga) e `--status Inactive`.", "Os ids saem do `aws iam list-access-keys --user-name bot-relatorios`."],
      ["aws iam update-access-key --user-name bot-relatorios --access-key-id <chave-antiga:bot-relatorios> --status Inactive"],
      (c) => chaves(c, "bot-relatorios").some((k) => k.status === "Inactive")),
    d("clicfg-f2", S, 3, 110, "O perfil esquecido",
      "Um colega tinha o perfil <b>relatorios-legado</b> com a chave antiga do robô. Configure esse perfil com a chave VELHA (a que você desativou), veja o erro — <b>The security token included in the request is invalid</b> — e conserte com a chave nova.",
      ["Pra reproduzir: configure set das duas chaves antigas e get-caller-identity com o perfil (vai falhar).", "Pra consertar: configure set com a chave nova e o get-caller-identity de novo."],
      [setar("aws_access_key_id", "<chave-de:bot-relatorios>", "relatorios-legado"), setar("aws_secret_access_key", "<segredo-de:bot-relatorios>", "relatorios-legado"), quem("relatorios-legado")],
      (c, cmd, ok) => ok && ehCmd(cmd, "sts", "get-caller-identity") && flag(cmd, "profile") === "relatorios-legado"),
    d("clicfg-13", S, 3, 90, "A role de auditoria",
      "A auditoria precisa de acesso de leitura por algumas horas, sem chave nova. Crie a role <b>auditoria-leitura</b> com a política de confiança pronta <b>trust.json</b>.",
      ["É o `aws iam create-role` da trilha de IAM.", "Com `--role-name` e `--assume-role-policy-document file://trust.json`."],
      ["aws iam create-role --role-name auditoria-leitura --assume-role-policy-document file://trust.json"],
      (c) => !!((((c.iam || {}).roles) || {})["auditoria-leitura"])),
    d("clicfg-14", S, 3, 100, "Vestindo a role",
      "Peça credenciais temporárias da <b>auditoria-leitura</b> com o nome de sessão <b>auditoria-setembro</b>. Repare no <code>AccessKeyId</code>: começa com ASIA (temporária), não AKIA.",
      ["É o `aws sts assume-role`.", "Com `--role-arn` (o ARN da role) e `--role-session-name`."],
      ["aws sts assume-role --role-arn <role-arn:auditoria-leitura> --role-session-name auditoria-setembro"],
      (c, cmd, ok) => ok && ehCmd(cmd, "sts", "assume-role")),
    d("clicfg-f3", S, 3, 90, "Só uma hora e o suficiente",
      "A auditoria só precisa de 15 minutos. Peça de novo, com sessão <b>auditoria-rapida</b> e duração de <b>900</b> segundos, e traga só a data de expiração.",
      ["O mesmo assume-role, com `--duration-seconds 900`.", "E `--query Credentials.Expiration`."],
      ["aws sts assume-role --role-arn <role-arn:auditoria-leitura> --role-session-name auditoria-rapida --duration-seconds 900 --query Credentials.Expiration"],
      (c, cmd, ok) => ok && ehCmd(cmd, "sts", "assume-role") && flag(cmd, "duration-seconds") === "900"),
    d("clicfg-15", S, 3, 120, "O perfil que assume a role sozinho",
      "Copiar credencial temporária à mão cansa. Crie o perfil <b>auditoria</b> com <code>role_arn</code> apontando pra auditoria-leitura e <code>source_profile</code> = <b>relatorios</b> (quem pede a role), dê a região <b>sa-east-1</b> e confira quem você é com ele.",
      ["Três configure set no perfil auditoria: role_arn, source_profile e region.", "Depois, get-caller-identity com `--profile auditoria` — o ARN vem como assumed-role."],
      [setar("role_arn", "<role-arn:auditoria-leitura>", "auditoria"), setar("source_profile", "relatorios", "auditoria"), setar("region", "sa-east-1", "auditoria"), quem("auditoria")],
      (c, cmd, ok) => ok && ehCmd(cmd, "sts", "get-caller-identity") && flag(cmd, "profile") === "auditoria" && !!(perfil(c, "auditoria") || {}).role_arn),
    d("clicfg-16", S, 3, 110, "O login da empresa (SSO)",
      "Na empresa ninguém tem chave: todo mundo entra pelo portal SSO. Configure o perfil <b>empresa-dev</b> com <code>sso_start_url</code> <b>" + URL_SSO + "</b>, <code>sso_region</code> <b>us-east-1</b>, <code>sso_account_id</code> <b>123456789012</b>, <code>sso_role_name</code> <b>DesenvolvedorPleno</b> e <code>region</code> <b>sa-east-1</b>. Depois, faça o login.",
      ["São configure set no perfil empresa-dev, um por chave.", "O login é o `login` do serviço `sso`, com o `--profile` do perfil novo (na vida real ele abre o navegador)."],
      [setar("sso_start_url", URL_SSO, "empresa-dev"), setar("sso_region", "us-east-1", "empresa-dev"), setar("sso_account_id", "123456789012", "empresa-dev"),
        setar("sso_role_name", "DesenvolvedorPleno", "empresa-dev"), setar("region", "sa-east-1", "empresa-dev"), "aws sso login --profile empresa-dev"],
      (c, cmd, ok) => ok && ehCmd(cmd, "sso", "login") && logado(c)),
    d("clicfg-f4", S, 3, 80, "Quem é você pelo SSO?",
      "Pergunte à AWS quem é você com o perfil <b>empresa-dev</b>. Repare no ARN: <b>AWSReservedSSO_DesenvolvedorPleno</b> — é a role que o SSO criou pro seu conjunto de permissões.",
      ["get-caller-identity com `--profile empresa-dev`."],
      [quem("empresa-dev")],
      (c, cmd, ok) => ok && ehCmd(cmd, "sts", "get-caller-identity") && flag(cmd, "profile") === "empresa-dev"),
    d("clicfg-17", S, 3, 80, "Fim do expediente",
      "Vai deixar o notebook no escritório. Encerre as sessões SSO deste terminal.",
      ["Quem encerra o SSO é o próprio serviço `sso`.", "O contrário de login."],
      ["aws sso logout"],
      (c, cmd, ok) => ok && ehCmd(cmd, "sso", "logout") && !logado(c) && !!perfil(c, "empresa-dev")),
    d("clicfg-f5", S, 3, 90, "Segunda de manhã",
      "Segunda-feira: o perfil <b>empresa-dev</b> reclama que a sessão SSO expirou. Faça o login de novo e confira que voltou a funcionar.",
      ["O mesmo sso login do perfil.", "Depois, get-caller-identity com o perfil."],
      ["aws sso login --profile empresa-dev", quem("empresa-dev")],
      (c, cmd, ok) => ok && ehCmd(cmd, "sts", "get-caller-identity") && flag(cmd, "profile") === "empresa-dev" && logado(c)),
    d("clicfg-18", S, 3, 90, "Login sem chave nenhuma",
      "Pro seu estudo pessoal, o jeito novo é o <b>aws login</b>: ele usa a sua sessão do Console e dá credenciais temporárias pro perfil. Faça login no perfil <b>console</b> e confira quem você é.",
      ["É um comando de primeiro nível: `aws login`, sem serviço no meio, com `--profile`.", "Depois, get-caller-identity com o mesmo perfil."],
      ["aws login --profile console", quem("console")],
      (c, cmd, ok) => ok && ehCmd(cmd, "sts", "get-caller-identity") && flag(cmd, "profile") === "console"),
    d("clicfg-f6", S, 3, 90, "No servidor sem navegador",
      "Você está num servidor por SSH, sem navegador. Faça o login no perfil <b>console-servidor</b> no modo que mostra um link pra abrir em outro aparelho, e depois encerre as sessões SSO que ficaram abertas.",
      ["O `aws login` tem uma flag pra máquina sem navegador: `--remote`.", "Pra encerrar as sessões, o mesmo comando da atividade \"Fim do expediente\"."],
      ["aws login --profile console-servidor --remote", "aws sso logout"],
      (c, cmd, ok) => ok && ehCmd(cmd, "sso", "logout") && !!perfil(c, "console-servidor")),
  ];

  if (!SERVICOS_META.some((s) => s.id === S)) {
    const meta = { id: S, nome: "Configurar a CLI", subtitulo: "Perfis, credenciais, região e SSO", icone: "🔑" };
    // depois do IAM: a trilha cria usuário, chave e role com os comandos de lá
    const iIam = SERVICOS_META.findIndex((s) => s.id === "iam");
    SERVICOS_META.splice(iIam >= 0 ? iIam + 1 : SERVICOS_META.length, 0, meta);
    for (const x of TRILHA) DESAFIOS.push(x);
  }
})();
