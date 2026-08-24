"use strict";
// ============================================================
// CLImb — acessibilidade.js
// A auditoria de 2026-07-29 achou 5 atributos aria e nenhum role em todo o
// app. Consequência prática: quem usa leitor de tela não sabe que um modal
// abriu, e quem navega por teclado consegue "sair" do modal com Tab e mexer
// no que está atrás dele.
//
// Este arquivo trata TODOS os modais de uma vez (3 no index + os criados por
// 8 arquivos JS), sem precisar editar cada um:
//   - marca como diálogo (role/aria-modal) e dá nome pelo <h2> de dentro
//   - prende o Tab dentro do modal aberto
//   - devolve o foco pra quem abriu, ao fechar
//   - Esc fecha (os modais mais novos já faziam; os antigos não)
//
// ADITIVO: não toca o core. Carrega por último, junto do mobile-nav.
// ============================================================
(function () {
  if (typeof window === "undefined") return;

  const SELETOR = ".modal, #consoleOverlay, #diagramaOverlay";
  const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
  let quemAbriu = null;

  function aberto(el) { return el.classList.contains("aberto"); }

  function visivel(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function focaveis(modal) {
    return [...modal.querySelectorAll(FOCAVEIS)].filter(visivel);
  }

  // dá identidade de diálogo e um nome acessível (o título que já existe)
  function marcar(modal) {
    if (modal.dataset.a11y) return;
    modal.dataset.a11y = "1";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    // estado inicial: o observer só reage a MUDANÇA, então quem nasce
    // fechado ficaria sem marcação nenhuma pro leitor de tela
    modal.setAttribute("aria-hidden", aberto(modal) ? "false" : "true");
    const titulo = modal.querySelector("h2, h3");
    if (titulo) {
      if (!titulo.id) titulo.id = "a11y-t-" + Math.random().toString(36).slice(2, 9);
      modal.setAttribute("aria-labelledby", titulo.id);
    } else if (!modal.getAttribute("aria-label")) {
      modal.setAttribute("aria-label", "Janela");
    }
    // botões só com emoji (✕) não dizem nada pro leitor de tela
    for (const b of modal.querySelectorAll("button")) {
      const txt = (b.textContent || "").trim();
      if (!b.getAttribute("aria-label") && (txt === "" || /^[×✕✖x]$/i.test(txt))) {
        b.setAttribute("aria-label", "Fechar");
      }
    }
  }

  function fechar(modal) {
    const btn = modal.querySelector("[data-fechar]");
    if (btn) btn.click();
    else modal.classList.remove("aberto");
  }

  // Tab não pode escapar do modal aberto
  function prenderTab(e) {
    if (e.key !== "Tab") return;
    const modal = [...document.querySelectorAll(SELETOR)].find(aberto);
    if (!modal) return;
    const lista = focaveis(modal);
    if (!lista.length) return;
    const primeiro = lista[0], ultimo = lista[lista.length - 1];
    if (e.shiftKey && (document.activeElement === primeiro || !modal.contains(document.activeElement))) {
      e.preventDefault(); ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault(); primeiro.focus();
    }
  }

  document.addEventListener("keydown", (e) => {
    prenderTab(e);
    if (e.key === "Escape") {
      const modal = [...document.querySelectorAll(SELETOR)].find(aberto);
      if (modal) fechar(modal);
    }
  }, true);

  // guarda quem tinha o foco ANTES do modal abrir (pra devolver depois)
  document.addEventListener("mousedown", (e) => {
    const alvo = e.target.closest && e.target.closest("button, a");
    if (alvo && !alvo.closest(SELETOR)) quemAbriu = alvo;
  }, true);

  function aoAbrir(modal) {
    marcar(modal);
    const lista = focaveis(modal);
    // foca o 1º campo/botão útil, pulando o "Fechar" quando há mais coisa
    const alvo = lista.find((el) => !el.hasAttribute("data-fechar")) || lista[0];
    if (alvo) setTimeout(() => { try { alvo.focus(); } catch (e) { /* ok */ } }, 30);
  }

  function aoFechar() {
    if (quemAbriu && document.contains(quemAbriu)) {
      try { quemAbriu.focus(); } catch (e) { /* ok */ }
    }
    quemAbriu = null;
  }

  // os modais são criados/abertos dinamicamente: observa o DOM inteiro
  const estados = new WeakMap();
  const obs = new MutationObserver(() => {
    for (const modal of document.querySelectorAll(SELETOR)) {
      marcar(modal);
      const agora = aberto(modal);
      const antes = estados.get(modal);
      if (agora === antes) continue;
      estados.set(modal, agora);
      if (agora) aoAbrir(modal); else if (antes !== undefined) aoFechar();
      // esconde do leitor de tela o que está fechado
      modal.setAttribute("aria-hidden", agora ? "false" : "true");
    }
  });

  function ligar() {
    for (const m of document.querySelectorAll(SELETOR)) { marcar(m); estados.set(m, aberto(m)); }
    obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ligar);
  else ligar();

  // ---------- rótulos no que é só ícone fora dos modais ----------
  window.addEventListener("load", () => {
    setTimeout(() => {
      const inp = document.querySelector("#entradaTerminal");
      if (inp && !inp.getAttribute("aria-label")) {
        inp.setAttribute("aria-label", "Digite o comando da AWS CLI");
      }
      const saida = document.querySelector("#saidaTerminal");
      if (saida) { // leitor de tela anuncia o que o terminal responde
        saida.setAttribute("role", "log");
        saida.setAttribute("aria-live", "polite");
      }
      const side = document.querySelector("#sidebar");
      if (side && !side.getAttribute("aria-label")) {
        side.setAttribute("role", "navigation");
        side.setAttribute("aria-label", "Trilhas e atividades");
      }
    }, 500);
  });

  // ============================================================
  // Auditoria de 2026-08-22 (segunda passada). O que ja estava certo ficou
  // como estava: aria-live no terminal, rotulo no campo, foco visivel,
  // landmarks, lang, contraste. O que segue e o que faltava.
  // ============================================================

  function injetarEstiloA11y() {
    if (document.getElementById("a11yEstilo")) return;
    const st = document.createElement("style");
    st.id = "a11yEstilo";
    st.textContent = `
      /* Skip link: invisivel ate receber foco pelo teclado. */
      .a11y-pular {
        position: fixed; top: .5rem; left: .5rem; z-index: 200000;
        transform: translateY(-200%);
        background: var(--laranja, #ff9900); color: #10151f;
        padding: .7rem 1.1rem; border-radius: .5rem;
        font-weight: 700; text-decoration: none;
        transition: transform .15s ease;
      }
      .a11y-pular:focus { transform: translateY(0); }
      /* O ☰ e o controle principal de navegacao no celular e tinha 32px de
         altura. 44px e o minimo recomendado pra alvo de toque. */
      .menu-mobile-btn { min-height: 44px; min-width: 44px; }
      /* h1 do cabecalho: some visualmente, existe pra leitor de tela e pra
         navegacao por titulos. O logo continua igual na tela. */
      .a11y-so-leitor {
        position: absolute; width: 1px; height: 1px;
        margin: -1px; padding: 0; overflow: hidden;
        clip: rect(0 0 0 0); white-space: nowrap; border: 0;
      }
      @media (prefers-reduced-motion: reduce) {
        .a11y-pular { transition: none; }
      }
    `;
    document.head.appendChild(st);
  }

  // 1) Pular direto pro terminal. Eram 23 Tabs ate o campo onde se trabalha:
  //    a lista lateral inteira vinha antes. Num app de linha de comando, cujo
  //    publico vive no teclado, isso pesa em todo mundo — nao so em quem
  //    depende de tecnologia assistiva.
  function skipLink() {
    if (document.querySelector(".a11y-pular")) return;
    const a = document.createElement("a");
    a.className = "a11y-pular";
    a.href = "#entradaTerminal";
    a.textContent = "Pular para o terminal";
    a.addEventListener("click", (ev) => {
      const inp = document.querySelector("#entradaTerminal");
      if (inp) { ev.preventDefault(); inp.focus(); }
    });
    document.body.insertBefore(a, document.body.firstChild);
  }

  // 2) A pagina nao tinha <h1> nenhum — so um <h2> no card. Quem navega por
  //    titulos (o modo mais comum com leitor de tela) nao tinha por onde comecar.
  function tituloDaPagina() {
    if (document.querySelector("h1")) return;
    const logo = document.querySelector("header .logo");
    if (!logo) return;
    const h1 = document.createElement("h1");
    h1.className = "a11y-so-leitor";
    h1.textContent = "CLImb — aprenda AWS CLI digitando de verdade";
    logo.parentNode.insertBefore(h1, logo);
  }

  // 3) A barra de XP existia so visualmente.
  function barraDeProgresso() {
    const barra = document.querySelector("#barraXp");
    if (!barra || typeof jogo === "undefined") return;
    const caixa = barra.parentElement;
    if (!caixa) return;
    caixa.setAttribute("role", "progressbar");
    caixa.setAttribute("aria-valuemin", "0");
    caixa.setAttribute("aria-valuemax", "100");
    const pct = parseInt(barra.style.width, 10);
    if (!isNaN(pct)) caixa.setAttribute("aria-valuenow", String(pct));
    const txt = document.querySelector("#textoXp");
    caixa.setAttribute("aria-label", "Progresso do nível" + (txt ? ": " + txt.textContent : ""));
  }

  // 4) A lista de atividades era uma <div> sem semantica: o leitor nao dizia
  //    "item 3 de 31", entao nao havia nocao de onde se esta nem de quanto
  //    falta. E o item travado nao dizia POR QUE estava travado.
  function semanticaDaLista() {
    document.querySelectorAll("#sidebar .lista-desafios").forEach((lista) => {
      const itens = [...lista.querySelectorAll(".item-desafio")];
      if (!itens.length) return;
      lista.setAttribute("role", "list");
      itens.forEach((it, i) => {
        it.setAttribute("role", "listitem");
        it.setAttribute("aria-posinset", String(i + 1));
        it.setAttribute("aria-setsize", String(itens.length));
        if (it.classList.contains("travado") && !it.getAttribute("aria-describedby")) {
          const titulo = (it.querySelector(".item-titulo") || {}).textContent || "";
          it.setAttribute("aria-label", titulo.trim() + " — bloqueada; conclua a atividade anterior para liberar");
        }
      });
    });
  }

  // 5) Os cabecalhos de GRUPO ja diziam se estavam abertos (sidebar-grupos.js);
  //    os de TRILHA nao. Mesma interacao, resposta diferente.
  function trilhasAnunciamAbertura() {
    document.querySelectorAll("#sidebar .servico").forEach((bloco) => {
      const cab = bloco.querySelector(".servico-cab");
      if (!cab) return;
      cab.setAttribute("aria-expanded", bloco.classList.contains("aberto") ? "true" : "false");
    });
  }

  function aplicarA11y() {
    try {
      injetarEstiloA11y();
      skipLink();
      tituloDaPagina();
      barraDeProgresso();
      semanticaDaLista();
      trilhasAnunciamAbertura();
    } catch (e) { /* nunca quebrar a UI por causa disto */ }
  }

  // A lista e o cabecalho sao redesenhados o tempo todo; reaplicamos junto.
  function embrulharRender(nome) {
    const original = window[nome];
    if (typeof original !== "function" || original.__a11y) return;
    function comA11y() {
      const r = original.apply(this, arguments);
      aplicarA11y();
      return r;
    }
    comA11y.__a11y = true;
    window[nome] = comA11y;
  }

  function iniciarA11y() {
    aplicarA11y();
    embrulharRender("renderSidebar");
    embrulharRender("renderCabecalho");
    setTimeout(aplicarA11y, 800);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciarA11y);
  else iniciarA11y();
})();
