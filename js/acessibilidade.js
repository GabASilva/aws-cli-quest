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
})();
