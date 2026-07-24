"use strict";
// ============================================================
// CLImb — diagrama.js
// "Diagrama da sua arquitetura": varre a conta simulada e desenha os recursos
// como um diagrama, no estilo dos diagramas de arquitetura da AWS. Combina com
// o Arquiteto IA (que gera infra) e o CloudFormation (que a cria) — aqui você
// VÊ o que existe na sua conta.
//
// - Agrupa por categoria (rede / computação / dados / integração / identidade /
//   operações). A VPC vira um container que engloba as sub-redes.
// - Traça as relações que dá pra inferir do estado: SNS→SQS (fan-out),
//   Lambda→role (permissão) e EC2→security group.
// - Overlay full-screen com SVG rolável + botão pra baixar o desenho.
//
// ADITIVO: botão "🗺️ Diagrama" no rodapé + overlay. Lê jogo.conta, não toca o core.
// ============================================================
(function () {
  if (typeof window === "undefined") return;

  function conta() {
    if (typeof jogo === "undefined" || !jogo) return null;
    if (typeof normalizarConta === "function") try { jogo.conta = normalizarConta(jogo.conta); } catch (e) {}
    return jogo.conta;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  // encurta nomes longos pra caber no card
  function curto(s, n) {
    s = String(s == null ? "" : s);
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  // ---------- coleta os recursos da conta, por categoria ----------
  // Cada nó: { id, cat, emoji, tipo, nome, meta }
  function coletar(c) {
    const nos = [];
    const vpcs = []; // tratadas à parte (viram containers)
    const add = (cat, emoji, tipo, nome, meta, id) =>
      nos.push({ id: id || (tipo + ":" + nome), cat, emoji, tipo, nome, meta: meta || "" });

    // --- Rede (VPC vira container; guardo as subnets de cada uma) ---
    if (c.vpc) {
      for (const v of Object.values(c.vpc.vpcs || {})) {
        const subnets = Object.values(c.vpc.subnets || {}).filter((s) => s.vpc === v.id);
        vpcs.push({ id: "vpc:" + v.id, vpc: v, subnets });
      }
      for (const g of Object.values(c.vpc.igws || {})) {
        add("rede", "🌉", "Internet GW", g.id, g.vpc ? "conectado" : "solto");
      }
    }

    // --- Computação ---
    for (const [id, i] of Object.entries(c.ec2.instancias || {})) {
      if (i.estado === "terminated") continue;
      add("computacao", "🖥️", "EC2", i.nome || id, i.tipo + " · " + i.estado, "ec2:" + id);
    }
    for (const nome of Object.keys(c.lambda.funcoes || {})) add("computacao", "λ", "Lambda", nome, (c.lambda.funcoes[nome].runtime || ""), "lambda:" + nome);
    if (c.ecs) for (const s of Object.values(c.ecs.servicos || {})) add("computacao", "🚢", "ECS", s.nome, s.desejado + " tarefas");
    if (c.eks) for (const k of Object.values(c.eks.clusters || {})) add("computacao", "☸️", "EKS", k.nome, "cluster");
    if (c.autoscaling) for (const g of Object.values(c.autoscaling.grupos || {})) add("computacao", "📶", "Auto Scaling", g.nome, g.desejado + " máquinas");

    // --- Dados ---
    for (const nome of Object.keys(c.s3.buckets || {})) add("dados", "🪣", "S3", nome, Object.keys(c.s3.buckets[nome].objetos || {}).length + " obj", "s3:" + nome);
    for (const nome of Object.keys(c.dynamodb.tabelas || {})) add("dados", "🗄️", "DynamoDB", nome, "tabela", "dynamo:" + nome);
    if (c.rds) for (const d of Object.values(c.rds.instancias || {})) add("dados", "🛢️", "RDS", d.id, d.engine, "rds:" + d.id);
    if (c.glue) for (const b of Object.values(c.glue.bancos || {})) add("dados", "🧬", "Glue", b.nome, "catálogo");

    // --- Integração ---
    if (c.sqs) for (const nome of Object.keys(c.sqs.filas || {})) add("integracao", "📨", "SQS", nome, c.sqs.filas[nome].tipo || "", "sqs:" + nome);
    if (c.sns) for (const nome of Object.keys(c.sns.topicos || {})) add("integracao", "📣", "SNS", nome, "tópico", "sns:" + nome);
    if (c.apigateway) for (const a of Object.values(c.apigateway.apis || {})) add("integracao", "🚪", "API GW", a.nome, "API HTTP");
    if (c.events) for (const r of Object.values(c.events.regras || {})) add("integracao", "⏰", "EventBridge", r.nome, r.estado);
    if (c.sfn) for (const m of Object.values(c.sfn.maquinas || {})) add("integracao", "🔀", "Step Functions", m.nome, "fluxo");

    // --- Identidade & acesso ---
    for (const nome of Object.keys(c.iam.usuarios || {})) add("identidade", "🧑", "Usuário", nome, "IAM user", "user:" + nome);
    for (const nome of Object.keys(c.iam.grupos || {})) add("identidade", "👥", "Grupo", nome, "IAM group");
    for (const nome of Object.keys(c.iam.roles || {})) add("identidade", "🎭", "Role", nome, "IAM role", "role:" + nome);
    if (c.cognito) for (const p of Object.values(c.cognito.pools || {})) add("identidade", "🎫", "Cognito", p.nome, "user pool");

    // --- Segurança & operações ---
    for (const g of Object.values(c.ec2.securityGroups || {})) add("operacoes", "🛡️", "Security Group", g.nome, (g.regras || []).length + " regras", "sg:" + g.id);
    if (c.kms) for (const k of Object.values(c.kms.chaves || {})) add("operacoes", "🗝️", "KMS", curto(k.descricao || k.id, 14), "chave");
    if (c.secrets) for (const s of Object.values(c.secrets.segredos || {})) add("operacoes", "🔐", "Secret", s.nome, "segredo");
    if (c.ssm) for (const p of Object.values(c.ssm.parametros || {})) add("operacoes", "🎛️", "Parâmetro", p.nome, p.tipo);
    if (c.cloudtrail) for (const t of Object.values(c.cloudtrail.trilhas || {})) add("operacoes", "🕵️", "CloudTrail", t.nome, t.gravando ? "gravando" : "parada");
    if (c.cloudwatch) for (const a of Object.values(c.cloudwatch.alarmes || {})) add("operacoes", "📈", "Alarme", a.nome, a.metrica);
    if (c.ecr) for (const r of Object.values(c.ecr.repositorios || {})) add("operacoes", "🐳", "ECR", r.nome, "repositório");

    // --- relações inferidas (id origem -> id destino, com rótulo) ---
    const links = [];
    // SNS -> SQS (fan-out): assinatura de protocolo sqs
    if (c.sns) for (const [nome, t] of Object.entries(c.sns.topicos || {})) {
      for (const a of (t.assinaturas || [])) {
        if (a.protocolo !== "sqs") continue;
        const fila = String(a.endpoint).split(":").pop();
        if (c.sqs && c.sqs.filas[fila]) links.push(["sns:" + nome, "sqs:" + fila, "fan-out"]);
      }
    }
    // Lambda -> role
    for (const [nome, f] of Object.entries(c.lambda.funcoes || {})) {
      const m = String(f.role || "").match(/role\/([\w.-]+)/);
      if (m && c.iam.roles[m[1]]) links.push(["lambda:" + nome, "role:" + m[1], "usa"]);
    }
    // EC2 -> security group
    for (const [id, i] of Object.entries(c.ec2.instancias || {})) {
      if (i.estado === "terminated") continue;
      for (const sgNome of (i.sgs || [])) {
        const g = Object.values(c.ec2.securityGroups || {}).find((x) => x.nome === sgNome || x.id === sgNome);
        if (g) links.push(["ec2:" + id, "sg:" + g.id, "protege"]);
      }
    }

    return { nos, vpcs, links };
  }

  // ---------- geração do SVG ----------
  const CATS = [
    { chave: "rede", titulo: "🛜 Rede" },
    { chave: "computacao", titulo: "🖥️ Computação" },
    { chave: "dados", titulo: "🗄️ Dados" },
    { chave: "integracao", titulo: "🔗 Integração" },
    { chave: "identidade", titulo: "🔑 Identidade & acesso" },
    { chave: "operacoes", titulo: "🛡️ Segurança & operações" },
  ];
  const COR_CAT = {
    rede: "#8a5cf6", computacao: "#ff9900", dados: "#3ecf6f",
    integracao: "#e05fd8", identidade: "#58a6ff", operacoes: "#f0b429",
  };
  const CARD_W = 150, CARD_H = 62, GAP = 16, PAD = 22;
  const LARGURA = 940;

  function cardSvg(no, x, y, cor) {
    return `<g transform="translate(${x},${y})">
      <rect width="${CARD_W}" height="${CARD_H}" rx="10" class="dg-card" stroke="${cor}"/>
      <text x="12" y="26" class="dg-emoji">${no.emoji}</text>
      <text x="40" y="22" class="dg-tipo">${esc(no.tipo)}</text>
      <text x="40" y="38" class="dg-nome">${esc(curto(no.nome, 16))}</text>
      <text x="12" y="53" class="dg-meta">${esc(curto(no.meta, 24))}</text>
    </g>`;
  }

  function gerarSvg(c) {
    const { nos, vpcs, links } = coletar(c);
    const pos = {}; // id -> {cx, cy} centro (pra desenhar as linhas)
    let corpo = "";
    let y = 54;
    const regiao = c.regiao || "us-east-1";

    // ----- seção Rede: VPCs como containers + o resto dos nós de rede -----
    const nosRede = nos.filter((n) => n.cat === "rede");
    if (vpcs.length || nosRede.length) {
      corpo += rotulo(CATS[0].titulo, y); y += 26;
      for (const vc of vpcs) {
        const subs = vc.subnets;
        const cols = Math.max(1, Math.floor((LARGURA - PAD * 2 - 24) / (CARD_W + GAP)));
        const linhas = Math.max(1, Math.ceil(subs.length / cols));
        const alturaInterna = subs.length ? linhas * (CARD_H + GAP) - GAP + 34 : 40;
        const vh = alturaInterna + 20;
        corpo += `<g transform="translate(${PAD},${y})">
          <rect width="${LARGURA - PAD * 2}" height="${vh}" rx="12" class="dg-vpc"/>
          <text x="14" y="22" class="dg-vpc-tit">🛜 VPC ${esc(vc.vpc.id)} · ${esc(vc.vpc.cidr)}</text>
        </g>`;
        // subnets dentro
        subs.forEach((s, i) => {
          const cx = PAD + 14 + (i % cols) * (CARD_W + GAP);
          const cy = y + 34 + Math.floor(i / cols) * (CARD_H + GAP);
          const no = { emoji: "🔲", tipo: "Sub-rede", nome: s.id, meta: s.cidr };
          corpo += cardSvg(no, cx, cy, COR_CAT.rede);
          pos["subnet:" + s.id] = { cx: cx + CARD_W / 2, cy: cy + CARD_H / 2 };
        });
        if (!subs.length) corpo += `<text x="${PAD + 16}" y="${y + 50}" class="dg-vazio-int">sem sub-redes ainda</text>`;
        y += vh + GAP;
      }
      // demais nós de rede (internet gateways) em grade normal
      y = grade(nosRede, y, pos, corpo, (h) => { corpo = h; });
    }

    // ----- demais categorias em grade -----
    for (let ci = 1; ci < CATS.length; ci++) {
      const cat = CATS[ci];
      const lista = nos.filter((n) => n.cat === cat.chave);
      if (!lista.length) continue;
      corpo += rotulo(cat.titulo, y); y += 26;
      y = grade(lista, y, pos, corpo, (h) => { corpo = h; });
    }

    // ----- linhas de relação (por cima) -----
    let linhasSvg = "";
    for (const [a, b, rot] of links) {
      const pa = pos[a], pb = pos[b];
      if (!pa || !pb) continue;
      const mx = (pa.cx + pb.cx) / 2, my = (pa.cy + pb.cy) / 2;
      linhasSvg += `<path d="M${pa.cx},${pa.cy} Q${mx},${my} ${pb.cx},${pb.cy}" class="dg-link"/>
        <text x="${mx}" y="${my - 4}" class="dg-link-rot">${esc(rot)}</text>`;
    }

    const altura = Math.max(y + 10, 120);
    return `<svg viewBox="0 0 ${LARGURA} ${altura}" width="${LARGURA}" xmlns="http://www.w3.org/2000/svg" class="dg-svg">
      <rect x="6" y="6" width="${LARGURA - 12}" height="${altura - 12}" rx="16" class="dg-nuvem"/>
      <text x="22" y="34" class="dg-titulo">☁️ Sua arquitetura na AWS · conta ${esc(c.contaId || "123456789012")} · ${esc(regiao)}</text>
      ${linhasSvg}
      ${corpo}
    </svg>`;

    function rotulo(txt, yy) {
      return `<text x="${PAD}" y="${yy + 14}" class="dg-secao">${esc(txt)}</text>`;
    }
    // empacota `lista` em grade a partir de yy; registra posições; devolve novo y
    function grade(lista, yy, posMap, htmlAtual, setHtml) {
      if (!lista.length) return yy;
      const cols = Math.max(1, Math.floor((LARGURA - PAD * 2) / (CARD_W + GAP)));
      let h = htmlAtual;
      lista.forEach((no, i) => {
        const cx = PAD + (i % cols) * (CARD_W + GAP);
        const cy = yy + Math.floor(i / cols) * (CARD_H + GAP);
        h += cardSvg(no, cx, cy, COR_CAT[no.cat] || "#888");
        posMap[no.id] = { cx: cx + CARD_W / 2, cy: cy + CARD_H / 2 };
      });
      setHtml(h);
      const linhas = Math.ceil(lista.length / cols);
      return yy + linhas * (CARD_H + GAP) + 8;
    }
  }

  function contarRecursos(c) {
    return coletar(c).nos.length + coletar(c).vpcs.length;
  }

  // ---------- overlay ----------
  let overlay = null;
  function montar() {
    injetarEstilo();
    overlay = document.createElement("div");
    overlay.id = "diagramaOverlay";
    overlay.innerHTML = `
      <div class="dg-topo">
        <div class="dg-logo">🗺️ Diagrama da sua arquitetura</div>
        <div class="dg-topo-dir">
          <button class="dg-btn" id="dgBaixar">⬇️ Baixar</button>
          <button class="dg-sair" id="dgSair">✕ Fechar</button>
        </div>
      </div>
      <div class="dg-corpo" id="dgCorpo"></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#dgSair").addEventListener("click", fechar);
    overlay.querySelector("#dgBaixar").addEventListener("click", baixar);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.classList.contains("aberto")) fechar();
    });
  }

  function abrir() {
    if (!overlay) montar();
    const c = conta();
    const corpo = overlay.querySelector("#dgCorpo");
    if (!c || contarRecursos(c) === 0) {
      corpo.innerHTML = `<div class="dg-vazio">
        <div class="dg-vazio-ic">🗺️</div>
        <h2>Sua conta ainda está vazia</h2>
        <p>Crie alguns recursos — um bucket, uma instância, uma função — no terminal ou no Console,
        e volte aqui pra ver a arquitetura desenhada. Cada coisa que você cria aparece no diagrama.</p>
        <p class="dg-vazio-dica">Dica: o <strong>🤖 Arquiteto IA</strong> monta uma infra inteira a partir de uma frase.</p>
      </div>`;
    } else {
      corpo.innerHTML = `<div class="dg-scroll">${gerarSvg(c)}</div>
        <p class="dg-legenda">As linhas mostram relações da sua conta: <b>fan-out</b> (SNS→SQS), <b>usa</b> (Lambda→role) e <b>protege</b> (Security Group→EC2). Tudo lido da sua conta simulada — nada é criado aqui.</p>`;
    }
    overlay.classList.add("aberto");
    document.body.classList.add("diagrama-aberto");
  }
  function fechar() {
    overlay.classList.remove("aberto");
    document.body.classList.remove("diagrama-aberto");
  }

  function baixar() {
    const svg = overlay.querySelector(".dg-svg");
    if (!svg) { if (typeof toast === "function") toast("Nada pra baixar — a conta está vazia.", "neutro"); return; }
    try {
      // embute os estilos essenciais inline pra o SVG abrir bonito fora do app
      const clone = svg.cloneNode(true);
      const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
      style.textContent = CSS_SVG;
      clone.insertBefore(style, clone.firstChild);
      const txt = new XMLSerializer().serializeToString(clone);
      const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n', txt], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "arquitetura-climb.svg";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (typeof toast === "function") toast("🗺️ Diagrama salvo como <strong>arquitetura-climb.svg</strong>.", "sucesso");
    } catch (e) {
      if (typeof toast === "function") toast("Não consegui baixar aqui. 😕", "erro");
    }
  }

  // estilos usados dentro do SVG (reaproveitados no download)
  const CSS_SVG = `
    .dg-nuvem { fill: #10151f; stroke: #2a3650; stroke-width: 1.5; }
    .dg-titulo { fill: #dce3ee; font: 700 15px "Segoe UI", system-ui, sans-serif; }
    .dg-secao { fill: #8b99b0; font: 700 11px "Segoe UI", system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.06em; }
    .dg-card { fill: #161e2d; stroke-width: 1.5; }
    .dg-emoji { font-size: 18px; }
    .dg-tipo { fill: #8b99b0; font: 600 10px "Segoe UI", system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.04em; }
    .dg-nome { fill: #dce3ee; font: 700 12px "Segoe UI", system-ui, sans-serif; }
    .dg-meta { fill: #8b99b0; font: 400 10px "Segoe UI", system-ui, sans-serif; }
    .dg-vpc { fill: rgba(138,92,246,0.06); stroke: #8a5cf6; stroke-width: 1.5; stroke-dasharray: 6 4; }
    .dg-vpc-tit { fill: #b79cf7; font: 700 11px "Segoe UI", system-ui, sans-serif; }
    .dg-vazio-int { fill: #8b99b0; font: italic 11px "Segoe UI", system-ui, sans-serif; }
    .dg-link { fill: none; stroke: #58a6ff; stroke-width: 1.5; stroke-dasharray: 5 4; opacity: 0.7; }
    .dg-link-rot { fill: #58a6ff; font: 600 9px "Segoe UI", system-ui, sans-serif; text-anchor: middle; }`;

  function injetarEstilo() {
    if (document.getElementById("dgEstilo")) return;
    const st = document.createElement("style");
    st.id = "dgEstilo";
    st.textContent = `
      #diagramaOverlay {
        display: none; position: fixed; inset: 0; z-index: 5500;
        background: #0c1017; flex-direction: column;
      }
      #diagramaOverlay.aberto { display: flex; }
      body.diagrama-aberto { overflow: hidden; }
      .dg-topo {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 20px; background: #0f141a; border-bottom: 1px solid var(--borda);
      }
      .dg-logo { font-weight: 700; color: var(--laranja); }
      .dg-topo-dir { display: flex; gap: 8px; }
      .dg-btn, .dg-sair {
        cursor: pointer; border: 1px solid var(--borda); background: var(--painel-2);
        color: var(--texto); padding: 7px 14px; border-radius: 8px; font-size: 0.85rem;
      }
      .dg-btn:hover, .dg-sair:hover { border-color: var(--laranja); }
      .dg-corpo { flex: 1; overflow: auto; padding: 20px; }
      .dg-scroll { overflow-x: auto; }
      .dg-svg { display: block; max-width: 100%; height: auto; margin: 0 auto; }
      ${CSS_SVG}
      .dg-legenda { max-width: 940px; margin: 14px auto 0; font-size: 0.82rem; color: var(--texto-fraco); line-height: 1.5; text-align: center; }
      .dg-vazio { max-width: 460px; margin: 8vh auto 0; text-align: center; color: var(--texto); }
      .dg-vazio-ic { font-size: 3rem; }
      .dg-vazio h2 { margin: 10px 0; }
      .dg-vazio p { color: var(--texto-fraco); line-height: 1.6; }
      .dg-vazio-dica { margin-top: 14px; font-size: 0.9rem; }`;
    document.head.appendChild(st);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const footer = document.querySelector("footer");
    if (footer && !document.querySelector("#btnDiagrama")) {
      const b = document.createElement("button");
      b.id = "btnDiagrama";
      b.className = "botao secundario";
      b.textContent = "🗺️ Diagrama";
      b.title = "Veja os recursos da sua conta desenhados como um diagrama";
      // ao lado do Arquiteto IA, se existir
      const arq = document.querySelector("#btnArquitetoIa");
      if (arq && arq.parentNode) arq.parentNode.insertBefore(b, arq.nextSibling);
      else footer.insertBefore(b, footer.firstChild);
      b.addEventListener("click", abrir);
    }
  });

  window.abrirDiagrama = abrir;
})();
