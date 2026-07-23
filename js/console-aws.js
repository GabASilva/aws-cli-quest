"use strict";
// ============================================================
// CLImb — console-aws.js
// Emulação do AWS Management Console (começando pelo S3).
//
// PONTO-CHAVE: lê e escreve o MESMO estado da conta virtual que a CLI
// usa (jogo.conta). Criou um bucket no Console -> aparece no `aws s3 ls`,
// e vice-versa. Cada ação mostra o comando equivalente no CLI e ecoa a
// saída no terminal, conectando os dois mundos (Console <-> CLI).
//
// Arquivo aditivo: carrega DEPOIS de simulador.js/app.js e usa os globais
// já definidos (normalizarConta, dataFormatada, ARQUIVOS_LOCAIS, imprimir,
// salvarJogo, sincronizarNuvem, toast). Não toca na core.
// ============================================================
(function () {
  // Regex de nome de bucket igual à do simulador (mantém as duas em sincronia).
  const NOME_OK = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

  // ---------- Pontes com o resto da app (tudo via typeof pra não quebrar) ----------
  function conta() {
    if (typeof jogo === "undefined" || !jogo) return null;
    if (typeof normalizarConta === "function") jogo.conta = normalizarConta(jogo.conta);
    return jogo.conta;
  }
  function persistir() {
    try {
      if (typeof salvarJogo === "function") salvarJogo();
      if (typeof sincronizarNuvem === "function") sincronizarNuvem();
    } catch (e) {}
    // gancho pras missões guiadas do Console (console-desafios.js)
    if (typeof window.aposAcaoConsole === "function") { try { window.aposAcaoConsole(); } catch (e) {} }
  }
  function ecoTerminal(texto, classe) {
    // Mostra a saída no terminal do CLI, como se o comando tivesse sido digitado.
    if (typeof imprimir === "function") imprimir(texto, classe || "");
  }
  // Roda um comando CLI a partir do Console (garante o MESMO estado e fidelidade).
  // Ecoa no terminal o comando + saída e re-renderiza. Retorna true se deu certo.
  function rodarCli(cmd, msgOk) {
    const r = executarComandoAws(conta(), cmd);
    if (typeof imprimirComando === "function") imprimirComando(cmd);
    if (r.saida) ecoTerminal(r.saida, r.ok ? "ok" : "erro");
    if (r.aviso) ecoTerminal(r.aviso, "aviso-climb");
    if (r.ok) { persistir(); render(); if (msgOk) avisar(msgOk); }
    else { avisar(String(r.saida || "Erro").split("\n")[0], "erro"); }
    return r.ok;
  }
  function avisar(html, classe) {
    if (typeof toast === "function") toast(html, classe);
  }
  function dataConsole() {
    return typeof dataFormatada === "function" ? dataFormatada() : new Date().toISOString();
  }
  function arquivosLocais() {
    if (typeof ARQUIVOS_LOCAIS !== "undefined") return Object.keys(ARQUIVOS_LOCAIS);
    return ["index.html", "logo.png", "relatorio.csv", "app.zip"];
  }
  function tamanhoLocal(nome) {
    if (typeof ARQUIVOS_LOCAIS !== "undefined" && ARQUIVOS_LOCAIS[nome] != null) return ARQUIVOS_LOCAIS[nome];
    return Math.floor(Math.random() * 4000) + 200;
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function bytesHumano(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }
  // Nome longo da região no estilo do console AWS (ex.: "EUA Leste (Norte da Virgínia) us-east-1").
  const REGIOES_NOME = {
    "us-east-1": "EUA Leste (Norte da Virgínia)", "us-east-2": "EUA Leste (Ohio)",
    "us-west-1": "EUA Oeste (Norte da Califórnia)", "us-west-2": "EUA Oeste (Oregon)",
    "sa-east-1": "América do Sul (São Paulo)", "eu-west-1": "Europa (Irlanda)",
    "eu-central-1": "Europa (Frankfurt)", "ap-southeast-1": "Ásia-Pacífico (Singapura)",
  };
  function regiaoLonga(r) {
    r = r || "us-east-1";
    return (REGIOES_NOME[r] ? REGIOES_NOME[r] + " " : "") + r;
  }
  function azDaRegiao(r) { return (r || "us-east-1") + "a"; }

  // ---------- Estado de navegação do console ----------
  let view = { tela: "home", bucket: null, prefixo: "" };
  let overlay = null;

  // ---------- Navegação lateral por serviço (fiel ao console da AWS) ----------
  // Itens com `tela` navegam pra uma tela funcional; com `secao:true` mostram o
  // estado-vazio do AWS (a seção existe no console real, mas ainda não tem
  // função no CLImb). `grupo` é um cabeçalho de seção; `sep` é um divisor.
  // Os rótulos e a ordem seguem os snapshots reais do console (us-west-2).
  const NAV = {
    s3: { titulo: "Amazon S3", itens: [
      { grupo: "Buckets" },
      { l: "General purpose buckets", tela: "s3-buckets" },
      { l: "Directory buckets", secao: true },
      { l: "Table buckets", secao: true },
      { l: "Vector buckets", secao: true },
      { grupo: "Files" },
      { l: "File systems", secao: true },
      { grupo: "Access management and security" },
      { l: "Access Points", secao: true },
      { l: "Access Points for FSx", secao: true },
      { l: "Access Grants", secao: true },
      { l: "IAM Access Analyzer", secao: true },
      { grupo: "Storage management and insights" },
      { l: "Storage Lens", secao: true },
      { l: "Batch Operations", secao: true },
      { sep: true },
      { l: "Account and organization settings", secao: true },
      { l: "AWS Marketplace for S3", secao: true },
    ] },
    ec2: { titulo: "EC2", itens: [
      { l: "Dashboard", tela: "ec2-dashboard" },
      { l: "AWS Global View", secao: true },
      { l: "Events", secao: true },
      { grupo: "Instances" },
      { l: "Instances", tela: "ec2-instancias" },
      { l: "Instance Types", secao: true },
      { l: "Launch Templates", secao: true },
      { l: "Spot Requests", secao: true },
      { l: "Savings Plans", secao: true },
      { l: "Reserved Instances", secao: true },
      { l: "Dedicated Hosts", secao: true },
      { l: "Capacity Reservations", secao: true },
      { grupo: "Images" },
      { l: "AMIs", secao: true },
      { l: "AMI Catalog", secao: true },
      { grupo: "Elastic Block Store" },
      { l: "Volumes", secao: true },
      { l: "Snapshots", secao: true },
      { l: "Lifecycle Manager", secao: true },
      { grupo: "Network & Security" },
      { l: "Security Groups", secao: true },
      { l: "Elastic IPs", secao: true },
      { l: "Placement Groups", secao: true },
      { l: "Key Pairs", secao: true },
      { l: "Network Interfaces", secao: true },
      { grupo: "Load Balancing" },
      { l: "Load Balancers", secao: true },
      { l: "Target Groups", secao: true },
      { grupo: "Auto Scaling" },
      { l: "Auto Scaling Groups", secao: true },
    ] },
    iam: { titulo: "Identity and Access Management (IAM)", itens: [
      { l: "Dashboard", tela: "iam-dashboard" },
      { grupo: "Access Management" },
      { l: "Roles", secao: true },
      { l: "Policies", secao: true },
      { l: "IAM users", tela: "iam-usuarios" },
      { l: "IAM user groups", secao: true },
      { l: "Identity providers", secao: true },
      { l: "Account settings", secao: true },
      { l: "Root access management", secao: true },
      { grupo: "Access reports" },
      { l: "Access Analyzer", secao: true },
      { l: "Credential report", secao: true },
      { l: "Organization activity", secao: true },
      { l: "Service control policies", secao: true },
    ] },
    vpc: { titulo: "VPC dashboard", itens: [
      { l: "VPC Dashboard", tela: "vpc-dashboard" },
      { l: "AWS Global View", secao: true },
      { grupo: "Virtual private cloud" },
      { l: "Your VPCs", tela: "vpc-rede" },
      { l: "Subnets", secao: true },
      { l: "Route tables", secao: true },
      { l: "Internet gateways", secao: true },
      { l: "Egress-only internet gateways", secao: true },
      { l: "Carrier gateways", secao: true },
      { l: "DHCP option sets", secao: true },
      { l: "Elastic IPs", secao: true },
      { l: "Managed prefix lists", secao: true },
      { l: "NAT gateways", secao: true },
      { l: "Peering connections", secao: true },
      { grupo: "Security" },
      { l: "Network ACLs", secao: true },
      { l: "Security groups", secao: true },
      { grupo: "PrivateLink and Lattice" },
      { l: "Endpoints", secao: true },
      { l: "Endpoint services", secao: true },
    ] },
    rds: { titulo: "Aurora and RDS", itens: [
      { l: "Dashboard", tela: "rds-dashboard" },
      { l: "Databases", tela: "rds-bancos" },
      { l: "Query editor", secao: true },
      { l: "Performance insights", secao: true },
      { l: "Snapshots", secao: true },
      { l: "Exports in Amazon S3", secao: true },
      { l: "Automated backups", secao: true },
      { l: "Reserved instances", secao: true },
      { l: "Proxies", secao: true },
      { sep: true },
      { l: "Subnet groups", secao: true },
      { l: "Parameter groups", secao: true },
      { l: "Option groups", secao: true },
      { sep: true },
      { l: "Events", secao: true },
      { l: "Event subscriptions", secao: true },
    ] },
    cloudwatch: { titulo: "CloudWatch", itens: [
      { l: "Dashboards", secao: true },
      { grupo: "Alarms" },
      { l: "All alarms", tela: "cw-painel" },
      { grupo: "Logs" },
      { l: "Log groups", secao: true },
      { l: "Logs Insights", secao: true },
      { grupo: "Metrics" },
      { l: "All metrics", secao: true },
      { l: "Explorer", secao: true },
    ] },
    lambda: { titulo: "AWS Lambda", itens: [
      { l: "Dashboard", tela: "lambda-dashboard" },
      { l: "Applications", secao: true },
      { l: "Functions", tela: "lambda-funcoes" },
      { sep: true },
      { l: "Additional resources", secao: true },
      { l: "Layers", secao: true },
    ] },
    dynamodb: { titulo: "DynamoDB", itens: [
      { l: "Dashboard", tela: "dynamo-dashboard" },
      { l: "Tables", tela: "dynamo-tabelas" },
      { l: "Explore items", secao: true },
      { l: "PartiQL editor", secao: true },
      { grupo: "Backups" },
      { l: "Backups", secao: true },
      { l: "Exports to S3", secao: true },
      { l: "Reserved capacity", secao: true },
    ] },
    sns: { titulo: "Amazon SNS", itens: [
      { l: "Dashboard", secao: true },
      { l: "Topics", tela: "sns-topicos" },
      { l: "Subscriptions", secao: true },
      { grupo: "Mobile" },
      { l: "Push notifications", secao: true },
      { l: "Text messaging (SMS)", secao: true },
    ] },
    sqs: { titulo: "Amazon SQS", itens: [
      { l: "Queues", tela: "sqs-filas" },
    ] },
  };
  // tela funcional -> serviço (define qual nav mostrar e o item ativo)
  const TELA_SERVICO = {
    "s3-buckets": "s3", "s3-objetos": "s3",
    "ec2-instancias": "ec2", "ec2-launch": "ec2", "ec2-dashboard": "ec2",
    "iam-usuarios": "iam", "iam-user": "iam", "iam-dashboard": "iam",
    "lambda-funcoes": "lambda", "lambda-dashboard": "lambda",
    "dynamo-tabelas": "dynamodb", "dynamo-tabela": "dynamodb", "dynamo-dashboard": "dynamodb",
    "vpc-rede": "vpc", "vpc-dashboard": "vpc",
    "rds-bancos": "rds", "rds-criar": "rds", "rds-dashboard": "rds",
    "cw-painel": "cloudwatch",
    "sns-topicos": "sns", "sns-criar": "sns",
    "sqs-filas": "sqs", "sqs-criar": "sqs",
  };
  // serviço -> tela "principal" (lista) e dashboard (pra abrir/breadcrumb)
  const SERVICO_LISTA = { s3: "s3-buckets", ec2: "ec2-instancias", iam: "iam-usuarios", lambda: "lambda-funcoes", dynamodb: "dynamo-tabelas", vpc: "vpc-rede", rds: "rds-bancos", cloudwatch: "cw-painel", sns: "sns-topicos", sqs: "sqs-filas" };
  const SERVICO_ABRIR = { s3: "s3-buckets", ec2: "ec2-dashboard", iam: "iam-dashboard", lambda: "lambda-dashboard", dynamodb: "dynamo-dashboard", vpc: "vpc-dashboard", rds: "rds-dashboard", cloudwatch: "cw-painel", sns: "sns-topicos", sqs: "sqs-filas" };
  const SERVICO_NOME = { ec2: "EC2", iam: "IAM", vpc: "VPC", rds: "RDS", dynamodb: "DynamoDB", cloudwatch: "CloudWatch", lambda: "Lambda", s3: "Amazon S3", sns: "Amazon SNS", sqs: "Amazon SQS" };

  function servicoAtual() {
    if (view.tela === "secao") return view.servico || null;
    return TELA_SERVICO[view.tela] || null;
  }
  // Monta a barra lateral do serviço atual (vazia na home).
  function renderNav() {
    const nav = overlay && overlay.querySelector("#cawsNav");
    if (!nav) return;
    const sid = servicoAtual();
    if (!sid || !NAV[sid]) { nav.innerHTML = ""; nav.classList.remove("ativa"); return; }
    nav.classList.add("ativa");
    const cfg = NAV[sid];
    const ativoLabel = view.tela === "secao" ? view.secaoLabel : null;
    let jaAtivou = false;
    const itens = cfg.itens.map((it) => {
      if (it.sep) return `<div class="caws-nav-sep"></div>`;
      if (it.grupo) return `<div class="caws-nav-grupo">${esc(it.grupo)}</div>`;
      let ativo = false;
      if (!jaAtivou && it.tela && it.tela === view.tela) ativo = true;
      if (ativoLabel && it.l === ativoLabel) ativo = true;
      if (ativo) jaAtivou = true;
      const attrs = it.tela
        ? `data-acao="ir" data-tela="${it.tela}"`
        : `data-acao="secao" data-servico="${sid}" data-label="${esc(it.l)}"`;
      return `<a href="#" class="caws-nav-item${ativo ? " ativo" : ""}" ${attrs}>${esc(it.l)}</a>`;
    }).join("");
    nav.innerHTML = `<div class="caws-nav-tit">${esc(cfg.titulo)}</div><nav>${itens}</nav>`;
  }

  // ---------- Montagem do overlay e do botão no cabeçalho ----------
  function montar() {
    // Botão no cabeçalho, antes do Ranking
    const btn = document.createElement("button");
    btn.className = "botao secundario";
    btn.id = "btnConsole";
    btn.textContent = "🖥️ Console";
    btn.title = "Abrir o Console da AWS (emulado) — espelha a mesma conta da CLI";
    const ranking = document.getElementById("btnRanking");
    if (ranking && ranking.parentNode) ranking.parentNode.insertBefore(btn, ranking);
    else document.querySelector("header").appendChild(btn);
    btn.addEventListener("click", abrir);

    // Overlay
    overlay = document.createElement("div");
    overlay.id = "consoleOverlay";
    overlay.innerHTML = `
      <div class="caws-topo">
        <div class="caws-logo">⚡ CLImb <span>Console</span></div>
        <div class="caws-busca"><input id="cawsBusca" placeholder="Buscar serviços (ex.: S3)" autocomplete="off"></div>
        <div class="caws-topo-dir">
          <span class="caws-regiao" id="cawsRegiao">us-east-1</span>
          <button class="caws-sair" id="cawsSair">✕ Sair do console</button>
        </div>
      </div>
      <div class="caws-shell">
        <aside class="caws-nav" id="cawsNav"></aside>
        <div class="caws-corpo" id="cawsCorpo"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#cawsSair").addEventListener("click", fechar);
    overlay.querySelector("#cawsBusca").addEventListener("input", (e) => {
      const t = e.target.value.trim().toLowerCase();
      if (/s3|bucket|armazen/.test(t)) { view = { tela: "s3-buckets", bucket: null, prefixo: "" }; render(); }
    });
    // ESC fecha
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.classList.contains("aberto")) fechar();
    });
    // Delegação de eventos do corpo
    overlay.querySelector("#cawsCorpo").addEventListener("click", aoClicar);
    overlay.querySelector("#cawsCorpo").addEventListener("submit", aoSubmeter);
    overlay.querySelector("#cawsNav").addEventListener("click", aoClicar);
  }

  function abrir() {
    if (!conta()) { avisar("Carregando…"); return; }
    view = { tela: "home", bucket: null, prefixo: "" };
    overlay.classList.add("aberto");
    document.body.classList.add("console-aberto");
    const r = document.getElementById("cawsRegiao");
    if (r && conta()) r.textContent = conta().regiao || "us-east-1";
    render();
  }
  function fechar() {
    overlay.classList.remove("aberto");
    document.body.classList.remove("console-aberto");
    // Re-renderiza a sidebar caso desafios tenham mudado de estado (não muda XP,
    // mas mantém a UI consistente se algo dependeu da conta).
    if (typeof renderSidebar === "function") try { renderSidebar(); } catch (e) {}
  }

  // ---------- Roteador de telas ----------
  function render() {
    const corpo = overlay.querySelector("#cawsCorpo");
    if (view.tela === "home") corpo.innerHTML = telaHome();
    else if (view.tela === "s3-buckets") corpo.innerHTML = telaBuckets();
    else if (view.tela === "s3-objetos") corpo.innerHTML = telaObjetos();
    else if (view.tela === "ec2-instancias") corpo.innerHTML = telaInstancias();
    else if (view.tela === "ec2-launch") corpo.innerHTML = formLaunch();
    else if (view.tela === "iam-usuarios") corpo.innerHTML = telaIamUsuarios();
    else if (view.tela === "iam-user") corpo.innerHTML = telaIamUserDetail();
    else if (view.tela === "lambda-funcoes") corpo.innerHTML = telaLambda();
    else if (view.tela === "dynamo-tabelas") corpo.innerHTML = telaDynamo();
    else if (view.tela === "dynamo-tabela") corpo.innerHTML = telaDynamoDetail();
    else if (view.tela === "vpc-rede") corpo.innerHTML = telaVpc();
    else if (view.tela === "rds-bancos") corpo.innerHTML = telaRds();
    else if (view.tela === "rds-criar") corpo.innerHTML = formRds();
    else if (view.tela === "cw-painel") corpo.innerHTML = telaCw();
    else if (view.tela === "ec2-dashboard") corpo.innerHTML = telaEc2Dashboard();
    else if (view.tela === "iam-dashboard") corpo.innerHTML = telaDashboard("iam");
    else if (view.tela === "vpc-dashboard") corpo.innerHTML = telaDashboard("vpc");
    else if (view.tela === "rds-dashboard") corpo.innerHTML = telaDashboard("rds");
    else if (view.tela === "dynamo-dashboard") corpo.innerHTML = telaDashboard("dynamodb");
    else if (view.tela === "lambda-dashboard") corpo.innerHTML = telaDashboard("lambda");
    else if (view.tela === "sns-topicos") corpo.innerHTML = telaSns();
    else if (view.tela === "sns-criar") corpo.innerHTML = formSns();
    else if (view.tela === "sqs-filas") corpo.innerHTML = telaSqs();
    else if (view.tela === "sqs-criar") corpo.innerHTML = formSqs();
    else if (view.tela === "secao") corpo.innerHTML = telaSecao();
    else corpo.innerHTML = telaHome();
    // tabelas largas rolam na horizontal (evita amontoar no mobile)
    corpo.querySelectorAll("table.caws-tabela").forEach((t) => {
      if (t.parentElement && t.parentElement.classList.contains("caws-tbl-scroll")) return;
      const w = document.createElement("div");
      w.className = "caws-tbl-scroll";
      t.parentNode.insertBefore(w, t);
      w.appendChild(t);
    });
    corpo.scrollTop = 0;
    renderNav();
  }

  // ---------- Painel (dashboard) de um serviço, no estilo do console AWS ----------
  function telaDashboard(sid) {
    const c = conta();
    const nome = SERVICO_NOME[sid] || sid;
    const lista = SERVICO_LISTA[sid];
    const regiao = (c && c.regiao) || "us-east-1";
    // Lista de recursos no estilo do painel real (rótulos em inglês, igual ao
    // console; mostramos a contagem real do que o CLImb modela e 0 no resto —
    // exatamente como o AWS exibe num ambiente novo).
    const ins = c.ec2 ? Object.values(c.ec2.instancias) : [];
    const nRun = ins.filter((i) => i.estado === "running").length;
    const nInst = ins.filter((i) => i.estado !== "terminated").length;
    const RES = {
      ec2: [
        { l: "Instances (running)", n: nRun }, { l: "Auto Scaling Groups", n: 0 },
        { l: "Dedicated Hosts", n: 0 }, { l: "Elastic IPs", n: 0 },
        { l: "Instances", n: nInst }, { l: "Key pairs", n: 0 },
        { l: "Load balancers", n: 0 }, { l: "Placement groups", n: 0 },
        { l: "Security groups", n: 0 }, { l: "Snapshots", n: 0 },
        { l: "Volumes", n: 0 },
      ],
      iam: [
        { l: "User groups", n: 0 }, { l: "Users", n: Object.keys(c.iam.usuarios).length },
        { l: "Roles", n: 0 }, { l: "Policies", n: 0 }, { l: "Identity providers", n: 0 },
      ],
      vpc: [
        { l: "VPCs", n: c.vpc ? Object.keys(c.vpc.vpcs).length : 0 },
        { l: "Subnets", n: c.vpc ? Object.keys(c.vpc.subnets || {}).length : 0 },
        { l: "Route Tables", n: 0 }, { l: "Internet Gateways", n: 0 },
        { l: "NAT Gateways", n: 0 }, { l: "Network ACLs", n: 0 },
        { l: "Security Groups", n: 0 }, { l: "Elastic IPs", n: 0 },
        { l: "VPC Peering Connections", n: 0 }, { l: "Endpoint Services", n: 0 },
      ],
      rds: [
        { l: "Databases", n: c.rds ? Object.keys(c.rds.instancias).length : 0 },
        { l: "Snapshots", n: 0 }, { l: "Reserved instances", n: 0 },
        { l: "Subnet groups", n: 0 }, { l: "Parameter groups", n: 0 },
        { l: "Option groups", n: 0 },
      ],
      dynamodb: [{ l: "Tables", n: Object.keys(c.dynamodb.tabelas).length }],
      lambda: [{ l: "Functions", n: Object.keys(c.lambda.funcoes).length }],
      cloudwatch: [
        { l: "Alarms", n: c.cloudwatch ? Object.keys(c.cloudwatch.alarmes).length : 0 },
        { l: "In alarm", n: 0 },
      ],
    };
    const recursos = RES[sid] || [];
    const rows = recursos.map((r) => `
      <button class="caws-rec-row" data-acao="ir" data-tela="${lista}">
        <span class="caws-rec-row-l">${esc(r.l)}</span>
        <span class="caws-rec-row-n">${r.n}</span>
      </button>`).join("");
    return `
      ${migalha([["Console", "home"], [nome, lista]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico"><h1>Dashboard</h1></div>
        <div class="caws-dash">
          <div class="caws-painel caws-dash-main">
            <h3>Resources</h3>
            <p class="caws-sub">You are using the following Amazon ${esc(nome)} resources in the ${esc(regiao)} Region:</p>
            <div class="caws-rec-grade">${rows}</div>
          </div>
          <div class="caws-painel caws-dash-side">
            <h3>Service health</h3>
            <p class="caws-saude"><span class="caws-saude-ok">●</span> Service is operating normally</p>
            <p class="caws-sub">Region: ${esc(regiao)}</p>
          </div>
        </div>
      </div>`;
  }

  // ---------- Dashboard do EC2 (fiel: 3 colunas + painéis do console real) ----------
  function telaEc2Dashboard() {
    const c = conta();
    const regiao = (c && c.regiao) || "us-east-1";
    const ins = c.ec2 ? Object.values(c.ec2.instancias) : [];
    const nRun = ins.filter((i) => i.estado === "running").length;
    const nInst = ins.filter((i) => i.estado !== "terminated").length;
    const nKeys = Object.keys((c.ec2 && c.ec2.keyPairs) || {}).length;
    const rec = [
      ["Instances (running)", nRun], ["Auto Scaling Groups", 0],
      ["Dedicated Hosts", 0], ["Elastic IPs", 0],
      ["Instances", nInst], ["Key pairs", nKeys],
      ["Load balancers", 0], ["Placement groups", 0],
      ["Security groups", 0], ["Snapshots", 0], ["Volumes", 0],
    ];
    const recRows = rec.map(([l, n]) => `
      <button class="caws-rec-row" data-acao="ir" data-tela="ec2-instancias">
        <span class="caws-rec-row-l">${esc(l)}</span><span class="caws-rec-row-n">${n}</span>
      </button>`).join("");
    // Zonas de disponibilidade (mapeamento real do us-east-1; genérico nas demais)
    const MAPA_AZ = { "us-east-1": [["us-east-1a", "use1-az6"], ["us-east-1b", "use1-az1"], ["us-east-1c", "use1-az2"], ["us-east-1d", "use1-az4"], ["us-east-1e", "use1-az3"], ["us-east-1f", "use1-az5"]] };
    const zonas = MAPA_AZ[regiao] || ["a", "b", "c"].map((s, i) => [regiao + s, regiao.replace(/-\d+$/, "") + "-az" + (i + 1)]);
    const zonasRows = zonas.map(([n, id]) => `<tr><td>${esc(n)}</td><td>${esc(id)}</td></tr>`).join("");
    const vpcId = (c.vpc && Object.keys(c.vpc.vpcs)[0]) || "vpc-0d9e6fb7f2ec0acb";
    return `
      ${migalha([["Console", "home"], ["EC2", "ec2-instancias"]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico"><h1>EC2 Dashboard</h1></div>
        <div class="caws-ec2dash">
          <div class="caws-painel">
            <div class="caws-painel-cab"><h3>Resources</h3><span class="caws-painel-ic">⚙&nbsp;⟳</span></div>
            <p class="caws-sub">You are using the following Amazon EC2 resources in the ${esc(regiao)} Region:</p>
            <div class="caws-rec-grade">${recRows}</div>
          </div>
          <div class="caws-painel">
            <h3>Launch instance</h3>
            <p class="caws-sub">To get started, launch an Amazon EC2 instance, which is a virtual server in the cloud.</p>
            <div class="caws-form-acoes caws-acoes-inicio">
              <button class="caws-btn-primario" data-acao="ec2-form-launch">Launch instance</button>
              <button class="caws-btn-secundario" data-acao="secao" data-servico="ec2" data-label="Migrate a server">Migrate a server</button>
            </div>
            <p class="caws-sub">Note: Your instances will launch in the ${esc(regiao)} Region.</p>
          </div>
          <div class="caws-painel">
            <h3>Service health</h3>
            <p class="caws-saude"><span class="caws-saude-ok">●</span> Service is operating normally</p>
            <p class="caws-sub">Region: ${esc(regiao)}</p>
            <h4 class="caws-painel-sub">Zones</h4>
            <table class="caws-tabela"><thead><tr><th>Zone name</th><th>Zone ID</th></tr></thead><tbody>${zonasRows}</tbody></table>
          </div>
          <div class="caws-painel">
            <h3>Scheduled events</h3>
            <p class="caws-sub">${esc(regiao)}</p>
            <p class="caws-sub">No scheduled events</p>
          </div>
          <div class="caws-painel">
            <h3>Account attributes</h3>
            <p class="caws-painel-sub">Default VPC</p>
            <a href="#" data-acao="abrir-servico" data-servico="vpc">${esc(vpcId)}</a>
            <p class="caws-painel-sub">Settings</p>
            <ul class="caws-lista-links">
              <li>Data protection and security</li><li>Zones</li>
              <li>EC2 Serial Console</li><li>Default credit specification</li>
              <li>Console experiments</li>
            </ul>
          </div>
          <div class="caws-painel">
            <h3>Explore AWS</h3>
            <p class="caws-sub"><strong>Desempenho até 40% melhor com Graviton</strong><br>Migre cargas para instâncias baseadas em Graviton para melhor custo-desempenho.</p>
            <p class="caws-sub"><strong>Economize até 90% no EC2 com Spot Instances</strong><br>Combine opções de compra num único grupo de Auto Scaling.</p>
          </div>
          <div class="caws-painel">
            <h3>Additional information</h3>
            <ul class="caws-lista-links"><li>EC2 Documentation</li><li>Forums</li><li>Report an issue</li></ul>
          </div>
        </div>
      </div>`;
  }

  // ---------- Estado-vazio fiel ao AWS (seção real, ainda sem função no CLImb) ----------
  function telaSecao() {
    const sid = view.servico;
    const label = view.secaoLabel || "Recursos";
    const cfg = NAV[sid] || { titulo: sid };
    const lista = SERVICO_LISTA[sid];
    const mig = migalha([["Console", "home"], [cfg.titulo, lista], [label, null]]);
    // subtelas fiéis (console-subtelas.js) — se existir uma pro rótulo, usa
    if (typeof window.cawsSubtela === "function") {
      const html = window.cawsSubtela(sid, label, conta());
      if (html) return mig + html;
    }
    return `
      ${mig}
      <div class="caws-pagina">
        <div class="caws-cab-servico"><h1>${esc(label)}</h1></div>
        <div class="caws-estado-vazio">
          <div class="caws-ev-ic">📭</div>
          <h2>Nenhum recurso para exibir</h2>
          <p>Esta seção existe no console da AWS, mas ainda não faz parte do CLImb.
          Use o menu à esquerda para as seções já disponíveis (em <strong>laranja/azul</strong>).</p>
        </div>
      </div>`;
  }

  // ---------- SNS / SQS (serviços novos — estado próprio, console-only por ora) ----------
  function estadoSns(c) { if (!c.sns) c.sns = { topicos: {} }; if (!c.sns.topicos) c.sns.topicos = {}; return c.sns; }
  function estadoSqs(c) { if (!c.sqs) c.sqs = { filas: {} }; if (!c.sqs.filas) c.sqs.filas = {}; return c.sqs; }
  const NOME_SNS_SQS = /^[a-zA-Z0-9_-]{1,80}$/;

  function telaSns() {
    const c = conta(); const sns = estadoSns(c); const nomes = Object.keys(sns.topicos);
    const linhas = nomes.length
      ? nomes.map((n) => { const t = sns.topicos[n]; return `<tr><td>${esc(n)}</td><td>${esc(t.tipo || "Standard")}</td><td><code>${esc(t.arn)}</code></td><td><button class="caws-link-perigo" data-acao="sns-apagar" data-nome="${esc(n)}">Excluir</button></td></tr>`; }).join("")
      : `<tr><td colspan="4" class="caws-vazio">You don't have any topics. Click <strong>Create topic</strong>.</td></tr>`;
    return `${migalha([["Console", "home"], ["Amazon SNS", "sns-topicos"]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico"><h1>Topics (${nomes.length})</h1><button class="caws-btn-primario" data-acao="ir" data-tela="sns-criar">Create topic</button></div>
        <table class="caws-tabela"><thead><tr><th>Name</th><th>Type</th><th>ARN</th><th></th></tr></thead><tbody>${linhas}</tbody></table>
        ${dicaCli("Equivalente na AWS CLI:", "aws sns create-topic --name meu-topico")}
      </div>`;
  }
  function formSns() {
    return `${migalha([["Console", "home"], ["Amazon SNS", "sns-topicos"], ["Create topic", null]])}
      <div class="caws-pagina caws-form"><h1>Create topic</h1>
        <form data-form="sns-criar">
          <label class="caws-campo"><span>Type</span>
            <select name="tipo"><option value="Standard">Standard</option><option value="FIFO">FIFO (.fifo)</option></select></label>
          <label class="caws-campo"><span>Name</span>
            <input name="nome" autocomplete="off" spellcheck="false" placeholder="ex.: alertas-pedidos">
            <small>Letras, números, hífen e sublinhado (até 80 caracteres).</small></label>
          <p class="caws-erro" data-erro></p>
          <div class="caws-form-acoes"><button type="button" class="caws-btn-secundario" data-acao="ir" data-tela="sns-topicos">Cancelar</button><button type="submit" class="caws-btn-primario">Create topic</button></div>
        </form></div>`;
  }
  function telaSqs() {
    const c = conta(); const sqs = estadoSqs(c); const nomes = Object.keys(sqs.filas);
    const linhas = nomes.length
      ? nomes.map((n) => {
          const f = sqs.filas[n];
          const cbd = (f.tipo === "FIFO") ? "Disabled" : "-";
          // contagem REAL (as mensagens vêm do `aws sqs send-message` / fan-out do SNS)
          const msgs = f.mensagens || [];
          const esperando = msgs.filter((m) => !m.recebida).length;
          const emVoo = msgs.filter((m) => m.recebida).length;
          return `<tr><td>${esc(n)}</td><td>${esc(f.tipo || "Standard")}</td><td>${esc(f.criadoEm || "—")}</td><td>${esperando}</td><td>${emVoo}</td><td>SSE-SQS</td><td>${cbd}</td><td><button class="caws-link-perigo" data-acao="sqs-apagar" data-nome="${esc(n)}">Excluir</button></td></tr>`;
        }).join("")
      : `<tr><td colspan="8" class="caws-vazio">You don't have any queues. Click <strong>Create queue</strong>.</td></tr>`;
    return `${migalha([["Console", "home"], ["Amazon SQS", "sqs-filas"]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico"><h1>Queues (${nomes.length})</h1><button class="caws-btn-primario" data-acao="ir" data-tela="sqs-criar">Create queue</button></div>
        <table class="caws-tabela"><thead><tr><th>Name</th><th>Type</th><th>Created</th><th>Messages available</th><th>Messages in flight</th><th>Encryption</th><th>Content-based deduplication</th><th></th></tr></thead><tbody>${linhas}</tbody></table>
        ${dicaCli("Equivalente na AWS CLI:", "aws sqs create-queue --queue-name minha-fila")}
      </div>`;
  }
  function formSqs() {
    return `${migalha([["Console", "home"], ["Amazon SQS", "sqs-filas"], ["Create queue", null]])}
      <div class="caws-pagina caws-form"><h1>Create queue</h1>
        <form data-form="sqs-criar">
          <label class="caws-campo"><span>Type</span>
            <select name="tipo"><option value="Standard">Standard</option><option value="FIFO">FIFO (.fifo)</option></select></label>
          <label class="caws-campo"><span>Name</span>
            <input name="nome" autocomplete="off" spellcheck="false" placeholder="ex.: fila-pedidos">
            <small>Letras, números, hífen e sublinhado (até 80 caracteres).</small></label>
          <p class="caws-erro" data-erro></p>
          <div class="caws-form-acoes"><button type="button" class="caws-btn-secundario" data-acao="ir" data-tela="sqs-filas">Cancelar</button><button type="submit" class="caws-btn-primario">Create queue</button></div>
        </form></div>`;
  }

  // ---------- Tela inicial (grade de serviços) ----------
  function telaHome() {
    const c = conta();
    const nBuckets = Object.keys(c.s3.buckets).length;
    const nInst = Object.values(c.ec2.instancias).filter((i) => i.estado !== "terminated").length;
    const nUsers = Object.keys(c.iam.usuarios).length;
    const nFn = Object.keys(c.lambda.funcoes).length;
    const nTab = Object.keys(c.dynamodb.tabelas).length;
    const nVpc = c.vpc ? Object.keys(c.vpc.vpcs).length : 0;
    const nDb = c.rds ? Object.keys(c.rds.instancias).length : 0;
    const nAlarme = c.cloudwatch ? Object.keys(c.cloudwatch.alarmes).length : 0;
    const nTopicos = c.sns ? Object.keys(c.sns.topicos || {}).length : 0;
    const nFilas = c.sqs ? Object.keys(c.sqs.filas || {}).length : 0;
    const servicos = [
      { id: "s3", icone: "🪣", nome: "S3", desc: "Armazenamento de objetos", ativo: true, extra: `${nBuckets} bucket(s)` },
      { id: "ec2", icone: "🖥️", nome: "EC2", desc: "Máquinas virtuais", ativo: true, extra: `${nInst} instância(s)` },
      { id: "vpc", icone: "🛜", nome: "VPC", desc: "Rede na nuvem", ativo: true, extra: `${nVpc} VPC(s)` },
      { id: "iam", icone: "🔑", nome: "IAM", desc: "Usuários e permissões", ativo: true, extra: `${nUsers} usuário(s)` },
      { id: "lambda", icone: "λ", nome: "Lambda", desc: "Funções serverless", ativo: true, extra: `${nFn} função(ões)` },
      { id: "dynamodb", icone: "🗄️", nome: "DynamoDB", desc: "Banco NoSQL", ativo: true, extra: `${nTab} tabela(s)` },
      { id: "rds", icone: "🛢️", nome: "RDS", desc: "Banco relacional", ativo: true, extra: `${nDb} banco(s)` },
      { id: "cloudwatch", icone: "📈", nome: "CloudWatch", desc: "Monitoramento e logs", ativo: true, extra: `${nAlarme} alarme(s)` },
      { id: "sns", icone: "📣", nome: "SNS", desc: "Notificações (pub/sub)", ativo: true, extra: `${nTopicos} tópico(s)` },
      { id: "sqs", icone: "📨", nome: "SQS", desc: "Filas de mensagens", ativo: true, extra: `${nFilas} fila(s)` },
    ];
    // widgets no estilo da página inicial do console real (Recently visited etc.)
    const recentes = lerRecentes().map((id) => servicos.find((s) => s.id === id)).filter(Boolean);
    const widgetRecentes = `
      <div class="caws-widget">
        <div class="caws-widget-tit">Visitados recentemente</div>
        ${recentes.length
          ? `<ul class="caws-recentes">${recentes.map((s) =>
              `<li><a href="#" data-acao="abrir-servico" data-servico="${s.id}"><span class="caws-rec-ic">${s.icone}</span> ${esc(s.nome)}</a><small>${esc(s.extra || "")}</small></li>`
            ).join("")}</ul>`
          : `<p class="caws-widget-vazio">Você ainda não visitou nenhum serviço.<br>Abra um serviço abaixo e ele aparece aqui.</p>`}
      </div>`;
    const widgetSaude = `
      <div class="caws-widget">
        <div class="caws-widget-tit">Integridade do serviço</div>
        <p class="caws-widget-ok">✅ Todos os serviços operando normalmente</p>
        <small class="caws-widget-nota">Região ${esc(c.regiao || "us-east-1")} · emulação — aqui nada cai e nada gera custo 😉</small>
      </div>`;
    return `
      <div class="caws-pagina">
        <div class="caws-banner">
          <h1>Console de gerenciamento</h1>
          <p>Você está numa <strong>emulação do Console da AWS</strong>. Tudo o que você faz aqui
          usa a <strong>mesma conta virtual</strong> da linha de comando — crie um bucket aqui e ele
          aparece no <code>aws s3 ls</code>. É o mesmo sistema, duas formas de operar.</p>
        </div>
        <div class="caws-widgets">${widgetRecentes}${widgetSaude}</div>
        <h2 class="caws-secao">Serviços</h2>
        <div class="caws-grade">
          ${servicos.map((s) => `
            <div class="caws-servico ${s.ativo ? "" : "desativado"}" ${s.ativo ? `data-acao="abrir-servico" data-servico="${s.id}"` : `data-acao="ver-roadmap"`}>
              <div class="caws-servico-ic">${s.icone}</div>
              <div class="caws-servico-info">
                <strong>${s.nome}</strong>
                <small>${s.desc}</small>
                ${s.ativo ? `<span class="caws-tag">${esc(s.extra || "Disponível")}</span>` : `<span class="caws-tag cinza">em breve</span>`}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  // ---------- Home: "Visitados recentemente" (como o widget do console real) ----------
  const CHAVE_RECENTES = "climb.console.recentes";
  function lerRecentes() {
    try { return JSON.parse(localStorage.getItem(CHAVE_RECENTES) || "[]"); } catch (e) { return []; }
  }
  function marcarRecente(sid) {
    try {
      const r = lerRecentes().filter((x) => x !== sid);
      r.unshift(sid);
      localStorage.setItem(CHAVE_RECENTES, JSON.stringify(r.slice(0, 6)));
    } catch (e) { /* ok */ }
  }

  // ---------- S3: lista de buckets ----------
  function telaBuckets() {
    const c = conta();
    const nomes = Object.keys(c.s3.buckets);
    const linhas = nomes.length
      ? nomes.map((n) => {
          const b = c.s3.buckets[n];
          return `
            <tr>
              <td><a href="#" data-acao="abrir-bucket" data-bucket="${esc(n)}">🪣 ${esc(n)}</a></td>
              <td>${esc(regiaoLonga(c.regiao))}</td>
              <td>${esc(b.criadoEm || "—")}</td>
            </tr>`;
        }).join("")
      : `<tr><td colspan="3" class="caws-vazio">You don't have any buckets.</td></tr>`;

    return `
      ${migalha([["Console", "home"], ["Amazon S3", "s3-buckets"]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico">
          <h1>Buckets</h1>
          <button class="caws-btn-primario" data-acao="form-criar-bucket">Criar bucket</button>
        </div>
        <table class="caws-tabela">
          <thead><tr><th>Name</th><th>AWS Region</th><th>Creation date</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
        ${dicaCli("Listar buckets no CLI:", "aws s3 ls")}
      </div>
    `;
  }

  // ---------- S3: criação de bucket (form inline) ----------
  function formCriarBucket() {
    const c = conta();
    return `
      ${migalha([["Console", "home"], ["Amazon S3", "s3-buckets"], ["Criar bucket", null]])}
      <div class="caws-pagina caws-form">
        <h1>Criar bucket</h1>
        <form data-form="criar-bucket">
          <label class="caws-campo">
            <span>Nome do bucket</span>
            <input name="nome" autocomplete="off" spellcheck="false" placeholder="ex.: meu-site-${Math.floor(Math.random()*900+100)}">
            <small>Letras minúsculas, números, ponto e hífen. 3 a 63 caracteres. Único globalmente.</small>
          </label>
          <label class="caws-campo">
            <span>Região</span>
            <input value="${esc(c.regiao || "us-east-1")}" disabled>
          </label>
          <label class="caws-check">
            <input type="checkbox" name="bloqueio" checked>
            <span>Bloquear todo o acesso público <small>(recomendado)</small></span>
          </label>
          <p class="caws-erro" data-erro></p>
          <div class="caws-form-acoes">
            <button type="button" class="caws-btn-secundario" data-acao="ir" data-tela="s3-buckets">Cancelar</button>
            <button type="submit" class="caws-btn-primario">Criar bucket</button>
          </div>
        </form>
        ${dicaCli("Mesma coisa no CLI:", "aws s3 mb s3://NOME-DO-BUCKET")}
      </div>
    `;
  }

  // ---------- S3: objetos dentro de um bucket ----------
  function telaObjetos() {
    const c = conta();
    const b = c.s3.buckets[view.bucket];
    if (!b) { view = { tela: "s3-buckets", bucket: null, prefixo: "" }; return telaBuckets(); }

    const prefixo = view.prefixo || "";
    const pastas = new Set();
    const arquivos = [];
    for (const [chave, obj] of Object.entries(b.objetos)) {
      if (!chave.startsWith(prefixo)) continue;
      const resto = chave.slice(prefixo.length);
      if (resto === "") continue;
      const barra = resto.indexOf("/");
      if (barra >= 0) pastas.add(resto.slice(0, barra + 1));
      else arquivos.push({ chave, nome: resto, tam: obj.tamanho, em: obj.enviadoEm });
    }

    const linhasPastas = [...pastas].sort().map((p) => `
      <tr>
        <td><a href="#" data-acao="entrar-pasta" data-prefixo="${esc(prefixo + p)}">📁 ${esc(p)}</a></td>
        <td>Folder</td><td>—</td><td>—</td><td>—</td><td></td>
      </tr>`).join("");
    const linhasArq = arquivos.sort((a, b) => a.nome.localeCompare(b.nome)).map((a) => `
      <tr>
        <td>📄 ${esc(a.nome)}</td>
        <td>${esc((a.nome.split(".").pop() || "").toLowerCase())}</td>
        <td>${esc(a.em || "—")}</td>
        <td>${bytesHumano(a.tam)}</td>
        <td>Standard</td>
        <td><button class="caws-link-perigo" data-acao="apagar-objeto" data-chave="${esc(a.chave)}">Excluir</button></td>
      </tr>`).join("");
    const corpo = (linhasPastas + linhasArq) ||
      `<tr><td colspan="6" class="caws-vazio">You don't have any objects. Use <strong>Upload</strong> to add one.</td></tr>`;

    // Migalha com navegação de prefixo
    const partes = prefixo ? prefixo.replace(/\/$/, "").split("/") : [];
    let acumulado = "";
    const migaPrefixo = partes.map((seg) => {
      acumulado += seg + "/";
      return `<a href="#" data-acao="entrar-pasta" data-prefixo="${esc(acumulado)}">${esc(seg)}</a>`;
    }).join(" / ");

    const cliPrefixo = prefixo ? `/${prefixo}` : "";
    return `
      ${migalha([["Console", "home"], ["Amazon S3", "s3-buckets"], [view.bucket, null]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico">
          <h1>${esc(view.bucket)}</h1>
          <div class="caws-acoes-grupo">
            <button class="caws-btn-secundario" data-acao="form-pasta">Create folder</button>
            <button class="caws-btn-primario" data-acao="form-upload">Upload</button>
            <button class="caws-btn-secundario" data-acao="esvaziar-bucket">Empty</button>
            <button class="caws-btn-perigo" data-acao="apagar-bucket">Delete bucket</button>
          </div>
        </div>
        <div class="caws-prefixo-nav">
          <a href="#" data-acao="entrar-pasta" data-prefixo="">${esc(view.bucket)}</a>${migaPrefixo ? " / " + migaPrefixo : ""}
        </div>
        <div id="cawsPainelAcao"></div>
        <table class="caws-tabela">
          <thead><tr><th>Name</th><th>Type</th><th>Last modified</th><th>Size</th><th>Storage class</th><th></th></tr></thead>
          <tbody>${corpo}</tbody>
        </table>
        ${dicaCli("Listar o conteúdo no CLI:", `aws s3 ls s3://${view.bucket}${cliPrefixo}`)}
      </div>
    `;
  }

  // Painéis de ação (upload / criar pasta) injetados dentro da tela de objetos
  function painelUpload() {
    const opcoes = arquivosLocais().map((f) => `<option value="${esc(f)}">${esc(f)} (${bytesHumano(tamanhoLocal(f))})</option>`).join("");
    const alvo = `s3://${view.bucket}/${view.prefixo}`;
    return `
      <div class="caws-painel">
        <h3>Carregar arquivo</h3>
        <form data-form="upload">
          <label class="caws-campo">
            <span>Arquivo local (do seu "disco" fictício)</span>
            <select name="arquivo">${opcoes}</select>
            <small>São os mesmos arquivos que o <code>ls</code> e o <code>aws s3 cp</code> enxergam.</small>
          </label>
          <p class="caws-erro" data-erro></p>
          <div class="caws-form-acoes">
            <button type="button" class="caws-btn-secundario" data-acao="fechar-painel">Cancelar</button>
            <button type="submit" class="caws-btn-primario">Carregar</button>
          </div>
        </form>
        ${dicaCli("Mesma coisa no CLI:", `aws s3 cp ARQUIVO ${alvo}`)}
      </div>`;
  }
  function painelPasta() {
    return `
      <div class="caws-painel">
        <h3>Criar pasta</h3>
        <form data-form="pasta">
          <label class="caws-campo">
            <span>Nome da pasta</span>
            <input name="nome" autocomplete="off" placeholder="ex.: imagens">
            <small>No S3 "pastas" são só um prefixo no nome do objeto.</small>
          </label>
          <p class="caws-erro" data-erro></p>
          <div class="caws-form-acoes">
            <button type="button" class="caws-btn-secundario" data-acao="fechar-painel">Cancelar</button>
            <button type="submit" class="caws-btn-primario">Criar pasta</button>
          </div>
        </form>
        ${dicaCli("No CLI você cria a pasta enviando um objeto com ela no caminho:", `aws s3 cp ARQ s3://${view.bucket}/${view.prefixo}NOME-DA-PASTA/`)}
      </div>`;
  }

  // ---------- EC2: badge de estado ----------
  function badgeEstado(estado) {
    const cls = {
      running: "ok", pending: "pend", stopping: "pend", "shutting-down": "pend",
      stopped: "off", terminated: "fim",
    }[estado] || "off";
    return `<span class="caws-estado ${cls}">● ${esc(estado)}</span>`;
  }

  // ---------- EC2: lista de instâncias ----------
  function telaInstancias() {
    const c = conta();
    const ids = Object.keys(c.ec2.instancias);
    const linhas = ids.length
      ? ids.map((id) => {
          const i = c.ec2.instancias[id];
          const acoes = [];
          if (i.estado === "running") acoes.push(`<button class="caws-link" data-acao="ec2-stop" data-id="${esc(id)}">Parar</button>`);
          if (i.estado === "stopped") acoes.push(`<button class="caws-link" data-acao="ec2-start" data-id="${esc(id)}">Iniciar</button>`);
          if (i.estado !== "terminated") acoes.push(`<button class="caws-link-perigo" data-acao="ec2-terminate" data-id="${esc(id)}">Encerrar</button>`);
          const check = i.estado === "running" ? '<span class="caws-estado ok">✔ 2/2 checks passed</span>' : "—";
          return `
            <tr>
              <td>${esc(i.nome || "—")}</td>
              <td>${esc(id)}</td>
              <td>${badgeEstado(i.estado)}</td>
              <td>${esc(i.tipo)}</td>
              <td>${check}</td>
              <td>${esc(azDaRegiao(c.regiao))}</td>
              <td>${acoes.join(" ") || "—"}</td>
            </tr>`;
        }).join("")
      : `<tr><td colspan="7" class="caws-vazio">You do not have any instances in this region.</td></tr>`;

    return `
      ${migalha([["Console", "home"], ["EC2", "ec2-instancias"]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico">
          <h1>Instances</h1>
          <button class="caws-btn-primario" data-acao="ec2-form-launch">Executar instância</button>
        </div>
        <table class="caws-tabela">
          <thead><tr><th>Name</th><th>Instance ID</th><th>Instance state</th><th>Instance type</th><th>Status check</th><th>Availability Zone</th><th></th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
        ${dicaCli("Listar instâncias no CLI:", "aws ec2 describe-instances")}
      </div>
    `;
  }

  // ---------- EC2: executar instância (wizard) ----------
  function formLaunch() {
    const c = conta();
    const tipos = (typeof TIPOS_INSTANCIA !== "undefined" ? TIPOS_INSTANCIA : ["t2.micro", "t3.small"]);
    const optTipos = tipos.map((t) => `<option value="${esc(t)}"${t === "t2.micro" ? " selected" : ""}>${esc(t)}</option>`).join("");
    const chaves = Object.keys(c.ec2.keyPairs || {});
    const optChaves = `<option value="">(nenhuma)</option>` + chaves.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join("");
    return `
      ${migalha([["Console", "home"], ["EC2", "ec2-instancias"], ["Executar instância", null]])}
      <div class="caws-pagina caws-form">
        <h1>Executar instância</h1>
        <form data-form="launch">
          <label class="caws-campo">
            <span>Imagem (AMI)</span>
            <input name="ami" value="ami-0abcd1234ef567890" autocomplete="off" spellcheck="false">
            <small>O ID da imagem que vira o disco da máquina. Começa com <code>ami-</code>.</small>
          </label>
          <label class="caws-campo">
            <span>Tipo da instância</span>
            <select name="tipo">${optTipos}</select>
            <small>Define CPU e memória. <code>t2.micro</code> é o do nível gratuito.</small>
          </label>
          <label class="caws-campo">
            <span>Par de chaves (opcional)</span>
            <select name="chave">${optChaves}</select>
            <small>É a chave de SSH pra acessar a máquina. Crie uma na CLI com <code>aws ec2 create-key-pair</code>.</small>
          </label>
          <label class="caws-campo">
            <span>Quantidade</span>
            <input name="count" type="number" min="1" max="10" value="1">
          </label>
          <p class="caws-erro" data-erro></p>
          <div class="caws-form-acoes">
            <button type="button" class="caws-btn-secundario" data-acao="ir" data-tela="ec2-instancias">Cancelar</button>
            <button type="submit" class="caws-btn-primario">Executar instância</button>
          </div>
        </form>
        ${dicaCli("Mesma coisa no CLI:", "aws ec2 run-instances --image-id AMI --instance-type TIPO [--key-name CHAVE] [--count N]")}
      </div>
    `;
  }

  // ---------- IAM: lista de usuários ----------
  function telaIamUsuarios() {
    const c = conta();
    const nomes = Object.keys(c.iam.usuarios);
    const linhas = nomes.length
      ? nomes.map((n) => {
          const u = c.iam.usuarios[n];
          const grupos = Object.values(c.iam.grupos).filter((g) => g.membros.includes(n)).length;
          return `
            <tr>
              <td><a href="#" data-acao="iam-abrir-user" data-user="${esc(n)}">${esc(n)}</a></td>
              <td>/</td>
              <td>${grupos}</td>
              <td>None</td>
              <td>None</td>
              <td><button class="caws-link-perigo" data-acao="iam-delete-user" data-user="${esc(n)}">Excluir</button></td>
            </tr>`;
        }).join("")
      : `<tr><td colspan="6" class="caws-vazio">There are no IAM users. Create one to get started.</td></tr>`;

    return `
      ${migalha([["Console", "home"], ["IAM", "iam-usuarios"]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico">
          <h1>Users</h1>
          <button class="caws-btn-primario" data-acao="iam-form-criar-user">Create user</button>
        </div>
        <table class="caws-tabela">
          <thead><tr><th>User name</th><th>Path</th><th>Groups</th><th>Last activity</th><th>MFA</th><th></th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
        ${dicaCli("Listar usuários no CLI:", "aws iam list-users")}
      </div>
    `;
  }

  // ---------- IAM: criar usuário ----------
  function formIamUser() {
    return `
      ${migalha([["Console", "home"], ["IAM", "iam-usuarios"], ["Criar usuário", null]])}
      <div class="caws-pagina caws-form">
        <h1>Criar usuário</h1>
        <form data-form="iam-criar-user">
          <label class="caws-campo">
            <span>Nome do usuário</span>
            <input name="nome" autocomplete="off" spellcheck="false" placeholder="ex.: ana">
            <small>Letras, números e os símbolos <code>+=,.@_-</code>.</small>
          </label>
          <p class="caws-erro" data-erro></p>
          <div class="caws-form-acoes">
            <button type="button" class="caws-btn-secundario" data-acao="ir" data-tela="iam-usuarios">Cancelar</button>
            <button type="submit" class="caws-btn-primario">Criar usuário</button>
          </div>
        </form>
        ${dicaCli("Mesma coisa no CLI:", "aws iam create-user --user-name NOME")}
      </div>
    `;
  }

  // ---------- IAM: detalhe do usuário (políticas + grupos) ----------
  function telaIamUserDetail() {
    const c = conta();
    const n = view.usuario;
    const u = c.iam.usuarios[n];
    if (!u) { view = { tela: "iam-usuarios" }; return telaIamUsuarios(); }
    const pols = u.politicas || [];
    const polRows = pols.length
      ? pols.map((arn) => `<tr><td>📜 ${esc(arn.split("/").pop())}</td><td><code>${esc(arn)}</code></td><td><button class="caws-link-perigo" data-acao="iam-detach-policy" data-user="${esc(n)}" data-arn="${esc(arn)}">Desanexar</button></td></tr>`).join("")
      : `<tr><td colspan="3" class="caws-vazio">Nenhuma política anexada.</td></tr>`;
    const grupos = Object.keys(c.iam.grupos).filter((g) => c.iam.grupos[g].membros.includes(n));
    const grpRows = grupos.length
      ? grupos.map((g) => `<tr><td>👥 ${esc(g)}</td><td><button class="caws-link-perigo" data-acao="iam-remove-group" data-user="${esc(n)}" data-group="${esc(g)}">Remover</button></td></tr>`).join("")
      : `<tr><td colspan="2" class="caws-vazio">Não está em nenhum grupo.</td></tr>`;
    const polOpts = (typeof POLITICAS_AWS !== "undefined" ? POLITICAS_AWS : []).map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
    const grpOpts = Object.keys(c.iam.grupos).map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join("");

    return `
      ${migalha([["Console", "home"], ["IAM", "iam-usuarios"], [n, null]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico">
          <h1>👤 ${esc(n)}</h1>
          <button class="caws-btn-perigo" data-acao="iam-delete-user" data-user="${esc(n)}">Excluir usuário</button>
        </div>
        <p class="caws-sub">ARN: <code>arn:aws:iam::${esc(c.contaId)}:user/${esc(n)}</code> · UserId: <code>${esc(u.userId || "—")}</code></p>

        <h2 class="caws-secao">Políticas anexadas</h2>
        <form data-form="iam-attach" class="caws-inline-form">
          <select name="politica">${polOpts}</select>
          <button type="submit" class="caws-btn-secundario">Anexar política</button>
        </form>
        <table class="caws-tabela">
          <thead><tr><th>Política</th><th>ARN</th><th></th></tr></thead>
          <tbody>${polRows}</tbody>
        </table>

        <h2 class="caws-secao">Grupos</h2>
        ${grpOpts
          ? `<form data-form="iam-addgroup" class="caws-inline-form"><select name="grupo">${grpOpts}</select><button type="submit" class="caws-btn-secundario">Adicionar a grupo</button></form>`
          : `<p class="caws-sub">Nenhum grupo existe ainda. Crie um no CLI: <code>aws iam create-group --group-name NOME</code>.</p>`}
        <table class="caws-tabela">
          <thead><tr><th>Grupo</th><th></th></tr></thead>
          <tbody>${grpRows}</tbody>
        </table>

        ${dicaCli("Anexar política no CLI:", `aws iam attach-user-policy --user-name ${n} --policy-arn arn:aws:iam::aws:policy/NOME`)}
      </div>
    `;
  }

  // ---------- Lambda ----------
  function telaLambda() {
    const c = conta();
    const nomes = Object.keys(c.lambda.funcoes);
    const linhas = nomes.length
      ? nomes.map((n) => {
          const f = c.lambda.funcoes[n];
          return `
            <tr>
              <td>${esc(n)}</td>
              <td>Zip</td>
              <td>${esc(f.runtime)}</td>
              <td>${esc(f.criadoEm || "—")}</td>
              <td>
                <button class="caws-link" data-acao="lambda-invoke" data-fn="${esc(n)}">Testar</button>
                <button class="caws-link-perigo" data-acao="lambda-delete" data-fn="${esc(n)}">Excluir</button>
              </td>
            </tr>`;
        }).join("")
      : `<tr><td colspan="5" class="caws-vazio">You have no functions in this region.</td></tr>`;

    return `
      ${migalha([["Console", "home"], ["Lambda", "lambda-funcoes"]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico">
          <h1>Functions</h1>
          <button class="caws-btn-primario" data-acao="lambda-form-criar">Create function</button>
        </div>
        <table class="caws-tabela">
          <thead><tr><th>Function name</th><th>Package type</th><th>Runtime</th><th>Last modified</th><th></th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
        ${dicaCli("Listar funções no CLI:", "aws lambda list-functions")}
      </div>
    `;
  }

  function formLambda() {
    const runtimes = (typeof RUNTIMES !== "undefined" ? RUNTIMES : ["python3.12", "nodejs20.x"]);
    const optR = runtimes.map((r) => `<option value="${esc(r)}"${r === "python3.12" ? " selected" : ""}>${esc(r)}</option>`).join("");
    let zips = arquivosLocais().filter((f) => f.endsWith(".zip"));
    if (!zips.length) zips = ["app.zip"];
    const optZ = zips.map((z) => `<option value="${esc(z)}">${esc(z)}</option>`).join("");
    return `
      ${migalha([["Console", "home"], ["Lambda", "lambda-funcoes"], ["Criar função", null]])}
      <div class="caws-pagina caws-form">
        <h1>Criar função</h1>
        <form data-form="lambda-criar">
          <label class="caws-campo"><span>Nome da função</span>
            <input name="nome" autocomplete="off" spellcheck="false" placeholder="ex.: ola-mundo"></label>
          <label class="caws-campo"><span>Runtime</span><select name="runtime">${optR}</select>
            <small>A linguagem/versão que executa o código.</small></label>
          <label class="caws-campo"><span>Handler</span>
            <input name="handler" value="index.handler">
            <small>É <code>arquivo.função</code> que a Lambda chama ao ser invocada.</small></label>
          <label class="caws-campo"><span>Role (ARN)</span>
            <input name="role" value="arn:aws:iam::123456789012:role/lambda-exec">
            <small>As permissões com que a função roda.</small></label>
          <label class="caws-campo"><span>Código (.zip)</span><select name="zip">${optZ}</select>
            <small>O pacote com o código da função (do seu "disco" fictício).</small></label>
          <p class="caws-erro" data-erro></p>
          <div class="caws-form-acoes">
            <button type="button" class="caws-btn-secundario" data-acao="ir" data-tela="lambda-funcoes">Cancelar</button>
            <button type="submit" class="caws-btn-primario">Criar função</button>
          </div>
        </form>
        ${dicaCli("Mesma coisa no CLI:", "aws lambda create-function --function-name NOME --runtime RUNTIME --role ARN --handler index.handler --zip-file fileb://app.zip")}
      </div>
    `;
  }

  // ---------- DynamoDB ----------
  function pkDaTabela(t) { return (t.esquema.find((k) => k.KeyType === "HASH") || {}).AttributeName; }
  function tipoDoAttr(t, nome) { return ((t.defs.find((d) => d.AttributeName === nome) || {}).AttributeType) || "S"; }

  function telaDynamo() {
    const c = conta();
    const nomes = Object.keys(c.dynamodb.tabelas);
    const linhas = nomes.length
      ? nomes.map((n) => {
          const t = c.dynamodb.tabelas[n];
          const sk = (t.esquema.find((k) => k.KeyType === "RANGE") || {}).AttributeName || "-";
          const cap = t.cobranca === "PAY_PER_REQUEST" ? "On-demand" : "Provisioned";
          return `
            <tr>
              <td><a href="#" data-acao="dynamo-abrir-tabela" data-tabela="${esc(n)}">${esc(n)}</a></td>
              <td><span class="caws-estado ok">● Active</span></td>
              <td>${esc(pkDaTabela(t) || "—")}</td>
              <td>${esc(sk)}</td>
              <td>${cap}</td>
              <td>${cap}</td>
              <td><button class="caws-link-perigo" data-acao="dynamo-delete-table" data-tabela="${esc(n)}">Excluir</button></td>
            </tr>`;
        }).join("")
      : `<tr><td colspan="7" class="caws-vazio">You have no tables. Create one to get started.</td></tr>`;

    return `
      ${migalha([["Console", "home"], ["DynamoDB", "dynamo-tabelas"]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico">
          <h1>Tables</h1>
          <button class="caws-btn-primario" data-acao="dynamo-form-criar">Create table</button>
        </div>
        <table class="caws-tabela">
          <thead><tr><th>Name</th><th>Status</th><th>Partition key</th><th>Sort key</th><th>Read capacity mode</th><th>Write capacity mode</th><th></th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
        ${dicaCli("Listar tabelas no CLI:", "aws dynamodb list-tables")}
      </div>
    `;
  }

  function formDynamoTable() {
    return `
      ${migalha([["Console", "home"], ["DynamoDB", "dynamo-tabelas"], ["Criar tabela", null]])}
      <div class="caws-pagina caws-form">
        <h1>Criar tabela</h1>
        <form data-form="dynamo-criar">
          <label class="caws-campo"><span>Nome da tabela</span>
            <input name="nome" autocomplete="off" spellcheck="false" placeholder="ex.: Tarefas">
            <small>De 3 a 255 caracteres (letras, números, <code>_.-</code>).</small></label>
          <label class="caws-campo"><span>Chave de partição</span>
            <input name="pk" autocomplete="off" spellcheck="false" placeholder="ex.: id">
            <small>O atributo que identifica cada item.</small></label>
          <label class="caws-campo"><span>Tipo da chave</span>
            <select name="tipo"><option value="S">String (S)</option><option value="N">Número (N)</option><option value="B">Binário (B)</option></select></label>
          <p class="caws-erro" data-erro></p>
          <div class="caws-form-acoes">
            <button type="button" class="caws-btn-secundario" data-acao="ir" data-tela="dynamo-tabelas">Cancelar</button>
            <button type="submit" class="caws-btn-primario">Criar tabela</button>
          </div>
        </form>
        ${dicaCli("Mesma coisa no CLI:", "aws dynamodb create-table --table-name NOME --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST")}
      </div>
    `;
  }

  function telaDynamoDetail() {
    const c = conta();
    const n = view.tabela;
    const t = c.dynamodb.tabelas[n];
    if (!t) { view = { tela: "dynamo-tabelas" }; return telaDynamo(); }
    const pk = pkDaTabela(t);
    const tipoPk = tipoDoAttr(t, pk);
    const rows = t.itens.length
      ? t.itens.map((it, idx) => `<tr><td><code>${esc(JSON.stringify(it))}</code></td><td><button class="caws-link-perigo" data-acao="dynamo-del-item" data-idx="${idx}">Excluir</button></td></tr>`).join("")
      : `<tr><td colspan="2" class="caws-vazio">Tabela vazia. Adicione um item abaixo.</td></tr>`;
    return `
      ${migalha([["Console", "home"], ["DynamoDB", "dynamo-tabelas"], [n, null]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico">
          <h1>🗄️ ${esc(n)}</h1>
          <button class="caws-btn-perigo" data-acao="dynamo-delete-table" data-tabela="${esc(n)}">Excluir tabela</button>
        </div>
        <p class="caws-sub">Chave de partição: <code>${esc(pk)}</code> (${esc(tipoPk)}) · ${t.itens.length} item(ns)</p>
        <h2 class="caws-secao">Adicionar item</h2>
        <form data-form="dynamo-item" class="caws-inline-form">
          <input name="pkval" placeholder="valor de ${esc(pk)} (${esc(tipoPk)})" autocomplete="off">
          <input name="attrNome" placeholder="atributo extra (opcional)" autocomplete="off">
          <input name="attrVal" placeholder="valor do extra" autocomplete="off">
          <button type="submit" class="caws-btn-secundario">Adicionar item</button>
        </form>
        <p class="caws-erro" data-erro></p>
        <table class="caws-tabela">
          <thead><tr><th>Item (formato DynamoDB)</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${dicaCli("Adicionar item no CLI:", `aws dynamodb put-item --table-name ${n} --item '{"${pk}":{"${tipoPk}":"valor"}}'`)}
      </div>
    `;
  }

  // ---------- VPC ----------
  function telaVpc() {
    const c = conta(); c.vpc = c.vpc || { vpcs: {}, subnets: {}, igws: {} };
    const vpcs = Object.values(c.vpc.vpcs);
    const linhas = vpcs.length
      ? vpcs.map((v) => {
          const nSub = Object.values(c.vpc.subnets).filter((s) => s.vpc === v.id).length;
          return `<tr>
            <td>—</td>
            <td>${esc(v.id)}</td>
            <td><span class="caws-estado ok">● Available</span></td>
            <td>${esc(v.cidr)}</td>
            <td>default</td>
            <td>
              <button class="caws-link" data-acao="vpc-subnet" data-vpc="${esc(v.id)}">+ sub-rede</button>
              ${v.igw ? "" : `<button class="caws-link" data-acao="vpc-gateway" data-vpc="${esc(v.id)}">+ gateway</button>`}
              <button class="caws-link-perigo" data-acao="vpc-excluir" data-vpc="${esc(v.id)}">Excluir</button>
            </td></tr>`;
        }).join("")
      : `<tr><td colspan="6" class="caws-vazio">You have no VPCs in this region.</td></tr>`;
    const subs = Object.values(c.vpc.subnets);
    const subRows = subs.map((s) => `<tr><td>${esc(s.id)}</td><td><span class="caws-estado ok">● Available</span></td><td>${esc(s.vpc)}</td><td>${esc(s.cidr)}</td><td>${esc(s.az)}</td></tr>`).join("");
    return `
      ${migalha([["Console", "home"], ["VPC", "vpc-rede"]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico"><h1>Your VPCs</h1><button class="caws-btn-primario" data-acao="vpc-form-criar">Create VPC</button></div>
        <div id="cawsPainelAcao"></div>
        <table class="caws-tabela"><thead><tr><th>Name</th><th>VPC ID</th><th>State</th><th>IPv4 CIDR</th><th>Tenancy</th><th></th></tr></thead><tbody>${linhas}</tbody></table>
        ${subs.length ? `<h2 class="caws-secao">Subnets</h2><table class="caws-tabela"><thead><tr><th>Subnet ID</th><th>State</th><th>VPC</th><th>IPv4 CIDR</th><th>Availability Zone</th></tr></thead><tbody>${subRows}</tbody></table>` : ""}
        ${dicaCli("Criar rede no CLI:", "aws ec2 create-vpc --cidr-block 10.0.0.0/16")}
      </div>`;
  }
  function painelVpcCriar() {
    return `<div class="caws-painel"><h3>Criar VPC</h3>
      <form data-form="vpc-criar">
        <label class="caws-campo"><span>Bloco CIDR</span><input name="cidr" value="10.0.0.0/16" autocomplete="off"><small>A faixa de IPs da rede.</small></label>
        <p class="caws-erro" data-erro></p>
        <div class="caws-form-acoes"><button type="button" class="caws-btn-secundario" data-acao="fechar-painel">Cancelar</button><button type="submit" class="caws-btn-primario">Criar VPC</button></div>
      </form></div>`;
  }

  // ---------- RDS ----------
  function badgeRds(st) {
    const cls = { available: "ok", stopped: "off", creating: "pend", deleting: "pend" }[st] || "off";
    return `<span class="caws-estado ${cls}">● ${esc(st)}</span>`;
  }
  function telaRds() {
    const c = conta(); c.rds = c.rds || { instancias: {} };
    const dbs = Object.values(c.rds.instancias);
    const linhas = dbs.length
      ? dbs.map((d) => `<tr>
          <td>${esc(d.id)}</td>
          <td>${badgeRds(d.status)}</td>
          <td>Instance</td>
          <td>${esc(d.engine)}</td>
          <td>${esc((c.regiao || "us-east-1") + "a")}</td>
          <td>${esc(d.classe)}</td>
          <td>
            ${d.status === "available" ? `<button class="caws-link" data-acao="rds-stop" data-db="${esc(d.id)}">Parar</button>` : ""}
            ${d.status === "stopped" ? `<button class="caws-link" data-acao="rds-start" data-db="${esc(d.id)}">Iniciar</button>` : ""}
            <button class="caws-link-perigo" data-acao="rds-excluir" data-db="${esc(d.id)}">Excluir</button>
          </td></tr>`).join("")
      : `<tr><td colspan="7" class="caws-vazio">You have no databases.</td></tr>`;
    return `
      ${migalha([["Console", "home"], ["RDS", "rds-bancos"]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico"><h1>Databases</h1><button class="caws-btn-primario" data-acao="ir" data-tela="rds-criar">Create database</button></div>
        <table class="caws-tabela"><thead><tr><th>DB identifier</th><th>Status</th><th>Role</th><th>Engine</th><th>Region &amp; AZ</th><th>Size</th><th></th></tr></thead><tbody>${linhas}</tbody></table>
        ${dicaCli("Listar bancos no CLI:", "aws rds describe-db-instances")}
      </div>`;
  }
  function formRds() {
    const engines = ["mysql", "postgres", "mariadb", "aurora-mysql", "aurora-postgresql", "sqlserver-ex", "oracle-se2"];
    return `
      ${migalha([["Console", "home"], ["RDS", "rds-bancos"], ["Criar banco", null]])}
      <div class="caws-pagina caws-form">
        <h1>Criar banco (RDS)</h1>
        <form data-form="rds-criar">
          <label class="caws-campo"><span>Identificador</span><input name="id" placeholder="ex.: meu-banco" autocomplete="off" spellcheck="false"></label>
          <label class="caws-campo"><span>Engine</span><select name="engine">${engines.map((e) => `<option>${e}</option>`).join("")}</select></label>
          <label class="caws-campo"><span>Classe da instância</span><input name="classe" value="db.t3.micro"></label>
          <label class="caws-campo"><span>Usuário mestre</span><input name="usuario" value="admin"></label>
          <label class="caws-campo"><span>Armazenamento (GB)</span><input name="storage" type="number" value="20" min="20"></label>
          <p class="caws-erro" data-erro></p>
          <div class="caws-form-acoes"><button type="button" class="caws-btn-secundario" data-acao="ir" data-tela="rds-bancos">Cancelar</button><button type="submit" class="caws-btn-primario">Criar banco</button></div>
        </form>
        ${dicaCli("Mesma coisa no CLI:", "aws rds create-db-instance --db-instance-identifier NOME --db-instance-class db.t3.micro --engine mysql --master-username admin --allocated-storage 20")}
      </div>`;
  }

  // ---------- CloudWatch ----------
  function telaCw() {
    const c = conta(); c.cloudwatch = c.cloudwatch || { alarmes: {} }; c.logs = c.logs || { grupos: {} };
    const al = Object.values(c.cloudwatch.alarmes);
    const alRows = al.length
      ? al.map((a) => `<tr><td>${esc(a.nome)}</td><td><span class="caws-estado ok">● ${esc(a.estado)}</span></td><td>${esc(a.metrica)} &gt; ${esc(a.threshold == null ? "—" : a.threshold)}</td><td><button class="caws-link-perigo" data-acao="cw-del-alarme" data-nome="${esc(a.nome)}">Excluir</button></td></tr>`).join("")
      : `<tr><td colspan="4" class="caws-vazio">You have no alarms.</td></tr>`;
    const gr = Object.values(c.logs.grupos);
    const grRows = gr.length
      ? gr.map((g) => `<tr><td>${esc(g.nome)}</td><td>Never expire</td><td><button class="caws-link-perigo" data-acao="cw-del-grupo" data-nome="${esc(g.nome)}">Excluir</button></td></tr>`).join("")
      : `<tr><td colspan="3" class="caws-vazio">You have no log groups.</td></tr>`;
    return `
      ${migalha([["Console", "home"], ["CloudWatch", "cw-painel"]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico"><h1>CloudWatch</h1>
          <div class="caws-acoes-grupo"><button class="caws-btn-secundario" data-acao="cw-form-alarme">Create alarm</button><button class="caws-btn-secundario" data-acao="cw-criar-grupo">Create log group</button></div></div>
        <div id="cawsPainelAcao"></div>
        <h2 class="caws-secao">Alarms</h2>
        <table class="caws-tabela"><thead><tr><th>Name</th><th>State</th><th>Conditions</th><th></th></tr></thead><tbody>${alRows}</tbody></table>
        <h2 class="caws-secao">Log groups</h2>
        <table class="caws-tabela"><thead><tr><th>Log group</th><th>Retention</th><th></th></tr></thead><tbody>${grRows}</tbody></table>
        ${dicaCli("Criar alarme no CLI:", "aws cloudwatch put-metric-alarm --alarm-name NOME --metric-name CPUUtilization --namespace AWS/EC2 --threshold 80 --comparison-operator GreaterThanThreshold")}
      </div>`;
  }
  function painelAlarme() {
    return `<div class="caws-painel"><h3>Criar alarme</h3>
      <form data-form="cw-alarme">
        <label class="caws-campo"><span>Nome</span><input name="nome" placeholder="ex.: cpu-alta" autocomplete="off"></label>
        <label class="caws-campo"><span>Métrica</span><input name="metrica" value="CPUUtilization"></label>
        <label class="caws-campo"><span>Namespace</span><input name="namespace" value="AWS/EC2"></label>
        <label class="caws-campo"><span>Limite (threshold)</span><input name="threshold" type="number" value="80"></label>
        <p class="caws-erro" data-erro></p>
        <div class="caws-form-acoes"><button type="button" class="caws-btn-secundario" data-acao="fechar-painel">Cancelar</button><button type="submit" class="caws-btn-primario">Criar alarme</button></div>
      </form></div>`;
  }

  // ---------- Componentes reutilizáveis ----------
  function migalha(itens) {
    return `<div class="caws-migalha">` + itens.map(([nome, tela], i) => {
      const ult = i === itens.length - 1;
      const link = tela && !ult ? `<a href="#" data-acao="ir" data-tela="${tela}">${esc(nome)}</a>` : `<span>${esc(nome)}</span>`;
      return link + (ult ? "" : " <em>›</em> ");
    }).join("") + `</div>`;
  }
  function dicaCli(rotulo, comando) {
    return `
      <div class="caws-cli">
        <span class="caws-cli-ic">💻</span>
        <div class="caws-cli-txt">
          <small>${esc(rotulo)}</small>
          <code>${esc(comando)}</code>
        </div>
      </div>`;
  }

  // ---------- Tratamento de cliques (delegação) ----------
  function aoClicar(e) {
    const alvo = e.target.closest("[data-acao]");
    if (!alvo) return;
    e.preventDefault();
    const acao = alvo.dataset.acao;
    const c = conta();

    if (acao === "abrir-servico") {
      const t = SERVICO_ABRIR[alvo.dataset.servico];
      if (t) { marcarRecente(alvo.dataset.servico); view = { tela: t, bucket: null, prefixo: "" }; render(); }
      return;
    }
    if (acao === "secao") {
      view = { tela: "secao", servico: alvo.dataset.servico, secaoLabel: alvo.dataset.label };
      render();
      return;
    }
    if (acao === "st-aviso") {
      avisar("🖥️ Este controle é <strong>decorativo</strong> (fiel ao console real). As ações de verdade ficam nas telas em destaque e na CLI. 😉");
      return;
    }
    if (acao === "sns-apagar") {
      const n = alvo.dataset.nome;
      if (!confirm(`Excluir o tópico "${n}"?`)) return;
      delete estadoSns(c).topicos[n];
      ecoTerminal(`(sns delete-topic) ${n} excluído`, "ok");
      persistir(); render(); avisar(`🗑️ Tópico ${esc(n)} excluído`);
      return;
    }
    if (acao === "sqs-apagar") {
      const n = alvo.dataset.nome;
      if (!confirm(`Excluir a fila "${n}"?`)) return;
      delete estadoSqs(c).filas[n];
      ecoTerminal(`(sqs delete-queue) ${n} excluída`, "ok");
      persistir(); render(); avisar(`🗑️ Fila ${esc(n)} excluída`);
      return;
    }
    if (acao === "ver-roadmap") {
      // serviço ainda não disponível -> manda pro roadmap centralizado (changelog)
      if (typeof abrirChangelog === "function") abrirChangelog("breve");
      else avisar("Esse serviço chega em breve no Console. 🚧");
      return;
    }
    if (acao === "ir") {
      view = { tela: alvo.dataset.tela, bucket: null, prefixo: "" }; render(); return;
    }
    if (acao === "abrir-bucket") {
      view = { tela: "s3-objetos", bucket: alvo.dataset.bucket, prefixo: "" }; render(); return;
    }
    if (acao === "entrar-pasta") {
      view.prefixo = alvo.dataset.prefixo || ""; render(); return;
    }
    if (acao === "form-criar-bucket") {
      overlay.querySelector("#cawsCorpo").innerHTML = formCriarBucket(); return;
    }
    if (acao === "form-upload") {
      const p = overlay.querySelector("#cawsPainelAcao"); if (p) p.innerHTML = painelUpload(); return;
    }
    if (acao === "form-pasta") {
      const p = overlay.querySelector("#cawsPainelAcao"); if (p) p.innerHTML = painelPasta(); return;
    }
    if (acao === "fechar-painel") {
      const p = overlay.querySelector("#cawsPainelAcao"); if (p) p.innerHTML = ""; return;
    }
    if (acao === "apagar-objeto") {
      const chave = alvo.dataset.chave;
      if (!confirm(`Excluir o objeto "${chave}"?`)) return;
      const b = c.s3.buckets[view.bucket];
      delete b.objetos[chave];
      ecoTerminal(`delete: s3://${view.bucket}/${chave}`, "ok");
      persistir(); render(); avisar("🗑️ Objeto excluído");
      return;
    }
    if (acao === "esvaziar-bucket") {
      const b = c.s3.buckets[view.bucket];
      const n = Object.keys(b.objetos).length;
      if (!n) { avisar("O bucket já está vazio."); return; }
      if (!confirm(`Esvaziar "${view.bucket}"? Isso apaga ${n} objeto(s).`)) return;
      for (const k of Object.keys(b.objetos)) ecoTerminal(`delete: s3://${view.bucket}/${k}`, "ok");
      b.objetos = {};
      persistir(); view.prefixo = ""; render(); avisar(`🧹 ${n} objeto(s) removidos`);
      return;
    }
    if (acao === "apagar-bucket") {
      const b = c.s3.buckets[view.bucket];
      const n = Object.keys(b.objetos).length;
      if (!confirm(`Excluir o bucket "${view.bucket}"?` + (n ? ` Ele tem ${n} objeto(s), que também serão apagados.` : ""))) return;
      for (const k of Object.keys(b.objetos)) ecoTerminal(`delete: s3://${view.bucket}/${k}`, "ok");
      delete c.s3.buckets[view.bucket];
      ecoTerminal(`remove_bucket: ${view.bucket}`, "ok");
      persistir(); view = { tela: "s3-buckets", bucket: null, prefixo: "" }; render();
      avisar("🗑️ Bucket excluído");
      return;
    }

    // ----- EC2 -----
    if (acao === "ec2-form-launch") {
      overlay.querySelector("#cawsCorpo").innerHTML = formLaunch(); return;
    }
    if (acao === "ec2-stop") {
      const i = c.ec2.instancias[alvo.dataset.id];
      if (i && i.estado === "running") { i.estado = "stopped"; ecoTerminal(`(stop-instances) ${i.id}: running → stopping`, "ok"); persistir(); render(); avisar(`⏸️ Instância ${esc(i.id)} parada`); }
      return;
    }
    if (acao === "ec2-start") {
      const i = c.ec2.instancias[alvo.dataset.id];
      if (i && i.estado === "stopped") { i.estado = "running"; ecoTerminal(`(start-instances) ${i.id}: stopped → pending`, "ok"); persistir(); render(); avisar(`▶️ Instância ${esc(i.id)} iniciada`); }
      return;
    }
    if (acao === "ec2-terminate") {
      const i = c.ec2.instancias[alvo.dataset.id];
      if (!i || i.estado === "terminated") return;
      if (!confirm(`Encerrar a instância ${i.id}? Encerrar é definitivo (diferente de parar).`)) return;
      i.estado = "terminated";
      ecoTerminal(`(terminate-instances) ${i.id}: shutting-down`, "ok");
      persistir(); render(); avisar(`🗑️ Instância ${esc(i.id)} encerrada`);
      return;
    }

    // ----- IAM -----
    if (acao === "iam-form-criar-user") {
      overlay.querySelector("#cawsCorpo").innerHTML = formIamUser(); return;
    }
    if (acao === "iam-abrir-user") {
      view = { tela: "iam-user", usuario: alvo.dataset.user }; render(); return;
    }
    if (acao === "iam-delete-user") {
      const n = alvo.dataset.user;
      if (!c.iam.usuarios[n]) return;
      if (!confirm(`Excluir o usuário "${n}"?`)) return;
      delete c.iam.usuarios[n];
      for (const g of Object.values(c.iam.grupos)) g.membros = g.membros.filter((m) => m !== n);
      ecoTerminal(`(delete-user) usuário ${n} removido`, "ok");
      persistir(); view = { tela: "iam-usuarios" }; render(); avisar(`🗑️ Usuário ${esc(n)} excluído`);
      return;
    }
    if (acao === "iam-detach-policy") {
      const u = c.iam.usuarios[alvo.dataset.user];
      if (!u) return;
      u.politicas = (u.politicas || []).filter((a) => a !== alvo.dataset.arn);
      ecoTerminal(`(detach-user-policy) ${alvo.dataset.arn.split("/").pop()} desanexada de ${alvo.dataset.user}`, "ok");
      persistir(); render(); avisar("Política desanexada");
      return;
    }
    if (acao === "iam-remove-group") {
      const g = c.iam.grupos[alvo.dataset.group];
      if (!g) return;
      g.membros = g.membros.filter((m) => m !== alvo.dataset.user);
      ecoTerminal(`(remove-user-from-group) ${alvo.dataset.user} saiu de ${alvo.dataset.group}`, "ok");
      persistir(); render(); avisar("Removido do grupo");
      return;
    }

    // ----- Lambda -----
    if (acao === "lambda-form-criar") {
      overlay.querySelector("#cawsCorpo").innerHTML = formLambda(); return;
    }
    if (acao === "lambda-delete") {
      const n = alvo.dataset.fn;
      if (!c.lambda.funcoes[n]) return;
      if (!confirm(`Excluir a função "${n}"?`)) return;
      delete c.lambda.funcoes[n];
      ecoTerminal(`(delete-function) função ${n} removida`, "ok");
      persistir(); render(); avisar(`🗑️ Função ${esc(n)} excluída`);
      return;
    }
    if (acao === "lambda-invoke") {
      const f = c.lambda.funcoes[alvo.dataset.fn];
      if (!f) return;
      f.invocada = true;
      ecoTerminal(`(invoke) ${alvo.dataset.fn} -> StatusCode 200 ($LATEST)`, "ok");
      persistir(); avisar(`▶️ Função ${esc(alvo.dataset.fn)} invocada (StatusCode 200)`);
      return;
    }

    // ----- DynamoDB -----
    if (acao === "dynamo-form-criar") {
      overlay.querySelector("#cawsCorpo").innerHTML = formDynamoTable(); return;
    }
    if (acao === "dynamo-abrir-tabela") {
      view = { tela: "dynamo-tabela", tabela: alvo.dataset.tabela }; render(); return;
    }
    if (acao === "dynamo-delete-table") {
      const n = alvo.dataset.tabela;
      if (!c.dynamodb.tabelas[n]) return;
      if (!confirm(`Excluir a tabela "${n}" e todos os seus itens?`)) return;
      delete c.dynamodb.tabelas[n];
      ecoTerminal(`(delete-table) tabela ${n} removida`, "ok");
      persistir(); view = { tela: "dynamo-tabelas" }; render(); avisar(`🗑️ Tabela ${esc(n)} excluída`);
      return;
    }
    if (acao === "dynamo-del-item") {
      const t = c.dynamodb.tabelas[view.tabela];
      if (!t) return;
      t.itens.splice(parseInt(alvo.dataset.idx, 10), 1);
      ecoTerminal(`(delete-item) item removido de ${view.tabela}`, "ok");
      persistir(); render(); avisar("🗑️ Item excluído");
      return;
    }

    // ----- VPC -----
    if (acao === "vpc-form-criar") { const p = overlay.querySelector("#cawsPainelAcao"); if (p) p.innerHTML = painelVpcCriar(); return; }
    if (acao === "vpc-subnet") {
      const cidr = prompt("CIDR da sub-rede:", "10.0.1.0/24"); if (!cidr) return;
      rodarCli(`aws ec2 create-subnet --vpc-id ${alvo.dataset.vpc} --cidr-block ${cidr}`, "Sub-rede criada"); return;
    }
    if (acao === "vpc-gateway") {
      const r1 = executarComandoAws(conta(), "aws ec2 create-internet-gateway");
      if (typeof imprimirComando === "function") imprimirComando("aws ec2 create-internet-gateway");
      if (r1.saida) ecoTerminal(r1.saida, r1.ok ? "ok" : "erro");
      if (!r1.ok) { avisar("Não consegui criar o gateway.", "erro"); return; }
      let igw; try { igw = JSON.parse(r1.saida).InternetGateway.InternetGatewayId; } catch (e) { return; }
      rodarCli(`aws ec2 attach-internet-gateway --internet-gateway-id ${igw} --vpc-id ${alvo.dataset.vpc}`, "🛜 Gateway criado e conectado");
      return;
    }
    if (acao === "vpc-excluir") {
      if (!confirm(`Excluir a VPC ${alvo.dataset.vpc} (e as sub-redes dela)?`)) return;
      rodarCli(`aws ec2 delete-vpc --vpc-id ${alvo.dataset.vpc}`, "🗑️ VPC excluída"); return;
    }

    // ----- RDS -----
    if (acao === "rds-start") { rodarCli(`aws rds start-db-instance --db-instance-identifier ${alvo.dataset.db}`, "▶️ Banco iniciando"); return; }
    if (acao === "rds-stop") { rodarCli(`aws rds stop-db-instance --db-instance-identifier ${alvo.dataset.db}`, "⏸️ Banco parado"); return; }
    if (acao === "rds-excluir") {
      if (!confirm(`Excluir o banco "${alvo.dataset.db}"?`)) return;
      rodarCli(`aws rds delete-db-instance --db-instance-identifier ${alvo.dataset.db} --skip-final-snapshot`, "🗑️ Banco excluído"); return;
    }

    // ----- CloudWatch -----
    if (acao === "cw-form-alarme") { const p = overlay.querySelector("#cawsPainelAcao"); if (p) p.innerHTML = painelAlarme(); return; }
    if (acao === "cw-criar-grupo") {
      const nome = prompt("Nome do grupo de logs:", "/climb/app"); if (!nome) return;
      rodarCli(`aws logs create-log-group --log-group-name ${nome}`, "Grupo de logs criado"); return;
    }
    if (acao === "cw-del-alarme") {
      if (!confirm(`Excluir o alarme "${alvo.dataset.nome}"?`)) return;
      rodarCli(`aws cloudwatch delete-alarms --alarm-names ${alvo.dataset.nome}`, "Alarme excluído"); return;
    }
    if (acao === "cw-del-grupo") {
      if (!confirm(`Excluir o grupo "${alvo.dataset.nome}"?`)) return;
      rodarCli(`aws logs delete-log-group --log-group-name ${alvo.dataset.nome}`, "Grupo excluído"); return;
    }
  }

  // ---------- Tratamento de formulários ----------
  function aoSubmeter(e) {
    e.preventDefault();
    const form = e.target.closest("[data-form]");
    if (!form) return;
    const tipo = form.dataset.form;
    const c = conta();
    const erroEl = form.querySelector("[data-erro]");
    const erro = (msg) => { if (erroEl) erroEl.textContent = msg; };

    if (tipo === "criar-bucket") {
      const nome = (form.nome.value || "").trim();
      if (!NOME_OK.test(nome)) {
        erro("Nome inválido. Use letras minúsculas, números, ponto e hífen (3 a 63 caracteres, começa/termina com letra ou número).");
        return;
      }
      if (c.s3.buckets[nome]) { erro("Você já tem um bucket com esse nome."); return; }
      const bloqueio = form.bloqueio.checked;
      c.s3.buckets[nome] = { criadoEm: dataConsole(), objetos: {}, website: null, politica: null, versionamento: null };
      ecoTerminal(`make_bucket: ${nome}`, "ok");
      persistir();
      view = { tela: "s3-objetos", bucket: nome, prefixo: "" }; render();
      avisar(`✅ Bucket <strong>${esc(nome)}</strong> criado` + (bloqueio ? " (acesso público bloqueado)" : ""));
      return;
    }

    if (tipo === "upload") {
      const arquivo = form.arquivo.value;
      const b = c.s3.buckets[view.bucket];
      const chave = view.prefixo + arquivo.split("/").pop();
      b.objetos[chave] = { tamanho: tamanhoLocal(arquivo), enviadoEm: dataConsole() };
      ecoTerminal(`upload: ./${arquivo} to s3://${view.bucket}/${chave}`, "ok");
      persistir(); render(); avisar(`📤 ${esc(arquivo)} enviado`);
      return;
    }

    if (tipo === "pasta") {
      let nome = (form.nome.value || "").trim().replace(/^\/+|\/+$/g, "");
      if (!nome) { erro("Digite um nome de pasta."); return; }
      if (/[^a-zA-Z0-9._-]/.test(nome)) { erro("Use só letras, números, ponto, hífen ou underline."); return; }
      const b = c.s3.buckets[view.bucket];
      const chave = view.prefixo + nome + "/";
      if (b.objetos[chave]) { erro("Essa pasta já existe."); return; }
      b.objetos[chave] = { tamanho: 0, enviadoEm: dataConsole() };
      ecoTerminal(`make_folder: s3://${view.bucket}/${chave}`, "ok");
      persistir(); render(); avisar(`📁 Pasta ${esc(nome)} criada`);
      return;
    }

    if (tipo === "sns-criar") {
      let nome = (form.nome.value || "").trim();
      const fifo = form.tipo.value === "FIFO";
      if (fifo && !/\.fifo$/.test(nome)) nome += ".fifo";
      const base = nome.replace(/\.fifo$/, "");
      if (!NOME_SNS_SQS.test(base)) { erro("Nome inválido. Use letras, números, hífen e sublinhado (até 80)."); return; }
      const sns = estadoSns(c);
      if (sns.topicos[nome]) { erro("Você já tem um tópico com esse nome."); return; }
      const arn = `arn:aws:sns:${c.regiao || "us-east-1"}:123456789012:${nome}`;
      sns.topicos[nome] = { arn, tipo: fifo ? "FIFO" : "Standard", criadoEm: dataConsole() };
      ecoTerminal(`(sns create-topic) ${arn}`, "ok");
      persistir(); view = { tela: "sns-topicos" }; render();
      avisar(`✅ Tópico <strong>${esc(nome)}</strong> criado`);
      return;
    }

    if (tipo === "sqs-criar") {
      let nome = (form.nome.value || "").trim();
      const fifo = form.tipo.value === "FIFO";
      if (fifo && !/\.fifo$/.test(nome)) nome += ".fifo";
      const base = nome.replace(/\.fifo$/, "");
      if (!NOME_SNS_SQS.test(base)) { erro("Nome inválido. Use letras, números, hífen e sublinhado (até 80)."); return; }
      const sqs = estadoSqs(c);
      if (sqs.filas[nome]) { erro("Você já tem uma fila com esse nome."); return; }
      const url = `https://sqs.${c.regiao || "us-east-1"}.amazonaws.com/123456789012/${nome}`;
      sqs.filas[nome] = { url, tipo: fifo ? "FIFO" : "Standard", criadoEm: dataConsole() };
      ecoTerminal(`(sqs create-queue) ${url}`, "ok");
      persistir(); view = { tela: "sqs-filas" }; render();
      avisar(`✅ Fila <strong>${esc(nome)}</strong> criada`);
      return;
    }

    if (tipo === "launch") {
      const ami = (form.ami.value || "").trim();
      const tipoInst = form.tipo.value;
      const chave = form.chave.value || null;
      const count = parseInt(form.count.value, 10) || 1;
      if (!/^ami-[0-9a-f]+$/i.test(ami)) { erro("AMI inválida. Comece com 'ami-' seguido de hexadecimal (ex.: ami-0abcd1234ef567890)."); return; }
      if (!(count >= 1 && count <= 10)) { erro("A quantidade precisa ser de 1 a 10."); return; }
      const ids = [];
      for (let k = 0; k < count; k++) {
        const id = "i-0" + (typeof hexAleatorio === "function" ? hexAleatorio(16) : Date.now().toString(16));
        c.ec2.instancias[id] = { id, imagem: ami, tipo: tipoInst, chave, sgs: [], estado: "running", criadaEm: (typeof agoraIso === "function" ? agoraIso() : new Date().toISOString()) };
        ids.push(id);
      }
      ecoTerminal(`(run-instances) ${count} instância(s) ${tipoInst} iniciada(s): ${ids.join(", ")}`, "ok");
      persistir();
      view = { tela: "ec2-instancias", bucket: null, prefixo: "" }; render();
      avisar(`✅ ${count} instância(s) <strong>${esc(tipoInst)}</strong> executada(s)`);
      return;
    }

    if (tipo === "iam-criar-user") {
      const nome = (form.nome.value || "").trim();
      if (!/^[\w+=,.@-]{1,64}$/.test(nome)) { erro("Nome inválido. Use letras, números e os símbolos +=,.@_- (até 64 caracteres)."); return; }
      if (c.iam.usuarios[nome]) { erro("Já existe um usuário com esse nome."); return; }
      const userId = "AIDA" + (typeof hexAleatorio === "function" ? hexAleatorio(17).toUpperCase() : Date.now().toString(16).toUpperCase());
      c.iam.usuarios[nome] = { criadoEm: dataConsole(), politicas: [], userId };
      ecoTerminal(`(create-user) usuário ${nome} criado`, "ok");
      persistir();
      view = { tela: "iam-user", usuario: nome }; render();
      avisar(`✅ Usuário <strong>${esc(nome)}</strong> criado`);
      return;
    }

    if (tipo === "iam-attach") {
      const u = c.iam.usuarios[view.usuario];
      if (!u) return;
      const nomePol = form.politica.value;
      const arn = `arn:aws:iam::aws:policy/${nomePol}`;
      u.politicas = u.politicas || [];
      if (u.politicas.includes(arn)) { avisar("Essa política já está anexada."); return; }
      u.politicas.push(arn);
      ecoTerminal(`(attach-user-policy) ${nomePol} anexada a ${view.usuario}`, "ok");
      persistir(); render(); avisar(`📜 Política ${esc(nomePol)} anexada`);
      return;
    }

    if (tipo === "iam-addgroup") {
      const grupo = c.iam.grupos[form.grupo.value];
      if (!grupo) return;
      if (!grupo.membros.includes(view.usuario)) grupo.membros.push(view.usuario);
      ecoTerminal(`(add-user-to-group) ${view.usuario} entrou em ${form.grupo.value}`, "ok");
      persistir(); render(); avisar(`👥 Adicionado ao grupo ${esc(form.grupo.value)}`);
      return;
    }

    if (tipo === "lambda-criar") {
      const nome = (form.nome.value || "").trim();
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(nome)) { erro("Nome inválido. Use letras, números, hífen e underline (até 64 caracteres)."); return; }
      if (c.lambda.funcoes[nome]) { erro("Já existe uma função com esse nome."); return; }
      const role = (form.role.value || "").trim();
      if (!/^arn:aws:iam::\d{12}:role\/.+$/.test(role)) { erro("Role inválida. Ex.: arn:aws:iam::123456789012:role/lambda-exec"); return; }
      c.lambda.funcoes[nome] = { runtime: form.runtime.value, role, handler: (form.handler.value || "index.handler").trim(), timeout: 3, memoria: 128, env: {}, invocada: false, criadaEm: (typeof agoraIso === "function" ? agoraIso() : new Date().toISOString()) };
      ecoTerminal(`(create-function) função ${nome} criada (${form.runtime.value})`, "ok");
      persistir(); view = { tela: "lambda-funcoes" }; render();
      avisar(`✅ Função <strong>${esc(nome)}</strong> criada`);
      return;
    }

    if (tipo === "dynamo-criar") {
      const nome = (form.nome.value || "").trim();
      const pk = (form.pk.value || "").trim();
      const tp = form.tipo.value;
      if (!/^[a-zA-Z0-9_.-]{3,255}$/.test(nome)) { erro("Nome inválido. De 3 a 255 caracteres (letras, números, _.-)."); return; }
      if (c.dynamodb.tabelas[nome]) { erro("Já existe uma tabela com esse nome."); return; }
      if (!pk) { erro("Informe o nome da chave de partição."); return; }
      c.dynamodb.tabelas[nome] = {
        defs: [{ AttributeName: pk, AttributeType: tp }],
        esquema: [{ AttributeName: pk, KeyType: "HASH" }],
        cobranca: "PAY_PER_REQUEST", itens: [],
        criadaEm: (typeof agoraIso === "function" ? agoraIso() : new Date().toISOString()),
      };
      ecoTerminal(`(create-table) tabela ${nome} criada (chave ${pk})`, "ok");
      persistir(); view = { tela: "dynamo-tabela", tabela: nome }; render();
      avisar(`✅ Tabela <strong>${esc(nome)}</strong> criada`);
      return;
    }

    if (tipo === "dynamo-item") {
      const t = c.dynamodb.tabelas[view.tabela];
      if (!t) return;
      const pk = pkDaTabela(t);
      const tipoPk = tipoDoAttr(t, pk);
      const pkval = (form.pkval.value || "").trim();
      if (!pkval) { erro("Informe o valor da chave de partição."); return; }
      if (tipoPk === "N" && isNaN(Number(pkval))) { erro(`A chave "${pk}" é do tipo Número (N) — digite um número.`); return; }
      const item = {}; item[pk] = {}; item[pk][tipoPk] = pkval;
      const an = (form.attrNome.value || "").trim();
      const av = (form.attrVal.value || "").trim();
      if (an) item[an] = { S: av };
      // dedup por chave de partição (igual ao put-item real)
      t.itens = t.itens.filter((i) => JSON.stringify(i[pk]) !== JSON.stringify(item[pk]));
      t.itens.push(item);
      ecoTerminal(`(put-item) item gravado em ${view.tabela}`, "ok");
      persistir(); render(); avisar("✅ Item adicionado");
      return;
    }

    if (tipo === "vpc-criar") {
      const cidr = (form.cidr.value || "").trim();
      if (!cidr) { erro("Informe o bloco CIDR."); return; }
      rodarCli(`aws ec2 create-vpc --cidr-block ${cidr}`, "✅ VPC criada");
      return;
    }

    if (tipo === "rds-criar") {
      const id = (form.id.value || "").trim();
      if (!id) { erro("Dê um identificador ao banco."); return; }
      const cmd = `aws rds create-db-instance --db-instance-identifier ${id} --db-instance-class ${(form.classe.value || "db.t3.micro").trim()} --engine ${form.engine.value} --master-username ${(form.usuario.value || "admin").trim()} --allocated-storage ${parseInt(form.storage.value, 10) || 20}`;
      const ok = rodarCli(cmd, `✅ Banco ${esc(id)} criado`, "rds-bancos");
      if (!ok) erro("Não consegui criar — confira os campos.");
      return;
    }

    if (tipo === "cw-alarme") {
      const nome = (form.nome.value || "").trim();
      if (!nome) { erro("Dê um nome ao alarme."); return; }
      const cmd = `aws cloudwatch put-metric-alarm --alarm-name ${nome} --metric-name ${(form.metrica.value || "CPUUtilization").trim()} --namespace ${(form.namespace.value || "AWS/EC2").trim()} --threshold ${parseInt(form.threshold.value, 10) || 80} --comparison-operator GreaterThanThreshold`;
      rodarCli(cmd, `🔔 Alarme ${esc(nome)} criado`);
      return;
    }
  }

  // ---------- Boot ----------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", montar);
  } else {
    montar();
  }

  // Exposto pra outros módulos (ex.: desafios de console) abrirem e navegarem.
  window.abrirConsoleAws = abrir;
  window.consoleIrPara = function (tela, extra) {
    if (!overlay) return;
    if (!overlay.classList.contains("aberto")) abrir();
    view = Object.assign({ tela: tela, bucket: null, prefixo: "" }, extra || {});
    render();
  };
})();
