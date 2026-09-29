"use strict";
// ============================================================
// CLImb — sandbox.js
// "🧪 Sandbox livre": o primeiro item da lista de trilhas. Um terminal com
// TODOS os serviços do simulador e nada pra cumprir — sem validação, sem XP,
// sem resposta certa. Pedido do Gabriel (29/09/2026).
//
// Não é uma atividade do DESAFIOS de propósito: sem validador e sem XP ela
// entraria nas contagens de progresso ("0/1") e quebraria os quatro testes.
// É um MODO: o ponteiro vai pro ambiente "sandbox" (ambientes.js) e o card
// vira este painel. Sai dele abrindo qualquer atividade.
//
// O ambiente do sandbox é só dele (não mistura com as trilhas), nunca é podado
// nem refeito — o que você monta aqui fica, até você limpar (🧹 / climb limpar).
// Liberado pra todo mundo: o licenca.js bloqueia ATIVIDADE paga, não comando.
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const CHAVE = "sandbox";
  const A = () => (typeof globalThis !== "undefined" && globalThis.CLIMB_AMBIENTES) || null;
  const ativo = () => typeof jogo !== "undefined" && jogo && jogo.ambiente === CHAVE && !(typeof ui !== "undefined" && ui.desafioAtivo);

  // Ideias, não gabarito: aponta o caminho com os serviços, sem a linha pronta.
  const IDEIAS = [
    ["🌐", "Um site no ar", "bucket no S3, a pasta <code>./site</code> sincronizada e a hospedagem estática ligada"],
    ["📨", "Aviso que vira fila", "um tópico SNS com uma fila SQS inscrita — publique e veja a mensagem chegar"],
    ["⚡", "Uma função que roda", "role no IAM, função no Lambda e um <code>invoke</code> pra ver a resposta"],
    ["🗄️", "Uma tabela de pedidos", "tabela no DynamoDB, alguns <code>put-item</code> e um <code>scan</code> com filtro"],
    ["🕸️", "Rede do zero", "VPC, sub-rede, internet gateway e a rota que liga tudo"],
    ["🛤️", "Uma esteira de deploy", "repositório no CodeCommit, projeto no CodeBuild e a pipeline juntando os dois"],
  ];

  function estilo() {
    if (document.getElementById("sbx-estilo")) return;
    const s = document.createElement("style");
    s.id = "sbx-estilo";
    s.textContent = `
      #sidebar .sbx-item { display:flex; align-items:center; gap:10px; width:100%; text-align:left;
        background: var(--painel-2); border:1px solid var(--borda); border-radius:10px; padding:10px 12px;
        margin: 0 0 10px; color: var(--texto); cursor:pointer; font: inherit; }
      #sidebar .sbx-item:hover, #sidebar .sbx-item.ativo { border-color: var(--laranja); }
      #sidebar .sbx-item .sbx-icone { font-size: 1.25rem; }
      #sidebar .sbx-item strong { display:block; font-size: .92rem; }
      #sidebar .sbx-item small { display:block; color: var(--texto-fraco); font-size: .76rem; }
      #sidebar .sbx-item .sbx-tag { margin-left:auto; font-size:.68rem; font-weight:700; text-transform:uppercase;
        color: var(--verde); border:1px solid var(--verde); border-radius:10px; padding:1px 6px; }
      .sbx-card h2 { margin: 0 0 6px; }
      .sbx-card .sbx-ideias { display:grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap:8px; margin: 10px 0 14px; }
      .sbx-card .sbx-ideia { background: var(--painel-2); border:1px solid var(--borda); border-radius:8px; padding:8px 10px; }
      .sbx-card .sbx-ideia b { display:block; color: var(--texto); margin-bottom:2px; }
      .sbx-card .sbx-ideia span { color: var(--texto-fraco); font-size:.86rem; line-height:1.45; }
      .sbx-card .sbx-servicos { display:flex; flex-wrap:wrap; gap:6px; margin: 8px 0 14px; }
      .sbx-card .sbx-servicos button { background: var(--painel-2); border:1px solid var(--borda); border-radius:12px;
        color: var(--texto); padding:2px 9px; font-family: var(--fonte-mono); font-size:.8rem; cursor:pointer; }
      .sbx-card .sbx-servicos button:hover { border-color: var(--laranja); }
      .sbx-card .sbx-acoes { display:flex; flex-wrap:wrap; gap:8px; }
    `;
    document.head.appendChild(s);
  }

  function rodarNoTerminal(linha) {
    const ent = document.getElementById("entradaTerminal");
    if (typeof executarLinha === "function") executarLinha(linha);
    else if (typeof window.executarLinha === "function") window.executarLinha(linha);
    if (ent) ent.focus();
  }

  function entrar() {
    const a = A();
    if (!a) return;
    const r = a.entrarAmbiente(CHAVE);
    if (typeof ui !== "undefined") { ui.desafioAtivo = null; ui.dicasVisiveis = 0; }
    if (typeof salvarJogo === "function") salvarJogo();
    if (typeof renderSidebar === "function") renderSidebar();
    if (typeof renderCard === "function") renderCard();
    if (r && r.trocou && typeof imprimir === "function") {
      imprimir("🧪 Sandbox livre: todos os serviços liberados, nada pra cumprir. O que você criar aqui fica só aqui — as trilhas não veem e não apagam.", "aviso-climb");
      if (typeof rolarTerminal === "function") rolarTerminal();
    }
    const ent = document.getElementById("entradaTerminal");
    if (ent) ent.focus();
  }

  const contagem = (n) => (n ? `Agora ${n === 1 ? "existe <strong>1</strong> recurso" : `existem <strong>${n}</strong> recursos`} aqui.` : "Por enquanto está vazio.");
  // depois de cada comando no sandbox, só o número muda (sem redesenhar o card)
  function atualizarContagem() {
    const el = document.getElementById("sbxContagem");
    if (!el || !ativo() || !window.CLIMB_AMBIENTE) return;
    const html = contagem(window.CLIMB_AMBIENTE.inventario(jogo.conta).total);
    if (el.innerHTML !== html) el.innerHTML = html; // escrever igual seguraria o pronto.js
  }

  function cardHtml() {
    const servicos = typeof SERVICOS !== "undefined" ? Object.keys(SERVICOS).sort() : [];
    const inv = (window.CLIMB_AMBIENTE && typeof jogo !== "undefined") ? window.CLIMB_AMBIENTE.inventario(jogo.conta) : { total: 0 };
    const ideias = IDEIAS.map(([e, t, x]) => `<div class="sbx-ideia"><b>${e} ${t}</b><span>${x}</span></div>`).join("");
    const chips = servicos.map((s) => `<button type="button" data-svc="${s}" title="aws ${s} help">${s}</button>`).join("");
    return `<div class="card-vazio sbx-card">
      <h2>🧪 Sandbox livre</h2>
      <p>Um terminal com os <strong>${servicos.length} serviços</strong> do CLImb liberados e nada pra cumprir:
      sem validação, sem XP, sem resposta certa. Monte, quebre, apague, monte de novo.
      <span id="sbxContagem">${contagem(inv.total)}</span></p>
      <p>Não sabe o comando? <code>aws help</code> lista os serviços, <code>aws &lt;serviço&gt; help</code> os comandos
      de cada um, e <code>aws &lt;serviço&gt; &lt;comando&gt; help</code> o manual com exemplo.</p>
      <div class="sbx-ideias">${ideias}</div>
      <p><strong>Os serviços</strong> — clique pra ver os comandos de cada um:</p>
      <div class="sbx-servicos">${chips}</div>
      <div class="sbx-acoes">
        <button type="button" class="botao secundario" data-sbx="help">📚 aws help</button>
        ${document.getElementById("btnConsole") ? '<button type="button" class="botao secundario" data-sbx="console">🖥️ Ver no Console</button>' : ""}
        <button type="button" class="botao secundario" data-sbx="limpar">🧹 Limpar o sandbox</button>
      </div>
    </div>`;
  }

  function ligarCard(alvo) {
    alvo.querySelectorAll(".sbx-servicos button").forEach((b) => b.addEventListener("click", () => rodarNoTerminal(`aws ${b.dataset.svc} help`)));
    alvo.querySelectorAll("[data-sbx]").forEach((b) => b.addEventListener("click", () => {
      const o = b.dataset.sbx;
      if (o === "help") rodarNoTerminal("aws help");
      else if (o === "console") { const c = document.getElementById("btnConsole"); if (c) c.click(); }
      else if (o === "limpar") { const l = document.getElementById("btnLimparAmbiente"); if (l) l.click(); setTimeout(() => { if (ativo() && typeof renderCard === "function") renderCard(); }, 50); }
    }));
  }

  function itemLateral() {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sbx-item" + (ativo() ? " ativo" : "");
    b.setAttribute("aria-label", "Sandbox livre: terminal com todos os serviços, sem tarefa");
    b.innerHTML = `<span class="sbx-icone">🧪</span>
      <span><strong>Sandbox livre</strong><small>Todos os serviços, sem tarefa</small></span>
      <span class="sbx-tag">livre</span>`;
    b.addEventListener("click", entrar);
    return b;
  }

  function colocarNaLateral() {
    const aside = document.getElementById("sidebar");
    if (!aside) return;
    const velho = aside.querySelector(".sbx-item");
    if (velho) velho.remove();
    // primeiro da lista de trilhas: antes do primeiro grupo (ou trilha, sem grupos)
    const primeiro = aside.querySelector(".grupo, .servico");
    const item = itemLateral();
    if (primeiro && primeiro.parentElement === aside) aside.insertBefore(item, primeiro);
    else aside.insertBefore(item, aside.firstChild);
  }

  function ligar() {
    estilo();
    // lateral: embrulho carregado DEPOIS dos outros (grupos, filtro, busca,
    // licença) — o item entra por último e fica em primeiro
    if (typeof window.renderSidebar === "function" && !window.renderSidebar.__sbx) {
      const rs = window.renderSidebar;
      const envolvido = function () { const r = rs.apply(this, arguments); try { colocarNaLateral(); } catch (e) { /* ok */ } return r; };
      envolvido.__sbx = true;
      window.renderSidebar = envolvido;
      try { renderSidebar = envolvido; } catch (e) { /* ok */ }
    }
    if (typeof window.renderCard === "function" && !window.renderCard.__sbx) {
      const rc = window.renderCard;
      const envolvido = function () {
        if (ativo()) {
          const alvo = document.getElementById("cardDesafio");
          if (alvo) { alvo.innerHTML = cardHtml(); ligarCard(alvo); return; }
        }
        return rc.apply(this, arguments);
      };
      envolvido.__sbx = true;
      window.renderCard = envolvido;
      try { renderCard = envolvido; } catch (e) { /* ok */ }
    }
    if (typeof window.executarLinha === "function" && !window.executarLinha.__sbx) {
      const el = window.executarLinha;
      const envolvido = function () { const r = el.apply(this, arguments); try { atualizarContagem(); } catch (e) { /* ok */ } return r; };
      envolvido.__sbx = true;
      window.executarLinha = envolvido;
    }
    try { colocarNaLateral(); } catch (e) { /* ok */ }
    // recarregou a página dentro do sandbox: o card volta a ser o dele
    try { if (ativo() && typeof renderCard === "function") renderCard(); } catch (e) { /* ok */ }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ligar);
  else ligar();

  window.CLIMB_SANDBOX = { entrar };
})();
