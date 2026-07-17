"use strict";
// ============================================================
// CLImb — mobile-nav.js
// No celular o header acumulava 9 botões (Conceitos, Conquistas, Pro,
// Segurança, Turmas, Simulados, Console, Ranking, Entrar) + logo + barra de
// XP + streak, virando um header de ~340px que "amontoava" tudo.
//
// Este arquivo, em telas <=760px, move os botões de ação do header pra um
// menu ☰ (dropdown) e deixa o header com só logo + XP + streak + o botão do
// menu. No desktop, devolve os botões pro header. ADITIVO: não toca o core.
// Carrega POR ÚLTIMO (depois de todos que adicionam botões ao header).
// ============================================================
(function () {
  if (typeof window === "undefined") return;
  const LIMITE = 760;
  let toggle = null, painel = null, movendo = false, obs = null;

  function header() { return document.querySelector("header"); }
  function ehMobile() { return window.innerWidth <= LIMITE; }

  function montar() {
    const h = header();
    if (!h || toggle) return;
    // botão do menu
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "menuMobile";
    toggle.className = "botao secundario menu-mobile-btn";
    toggle.innerHTML = "☰";
    toggle.setAttribute("aria-label", "Menu");
    toggle.style.display = "none";
    h.appendChild(toggle);
    // painel dropdown
    painel = document.createElement("div");
    painel.id = "menuMobilePainel";
    painel.className = "menu-mobile-painel";
    document.body.appendChild(painel);

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      painel.classList.toggle("aberto");
    });
    // fecha o menu ao clicar num item ou fora
    painel.addEventListener("click", (e) => {
      if (e.target.closest("button")) painel.classList.remove("aberto");
    });
    document.addEventListener("click", (e) => {
      if (painel.classList.contains("aberto") && !painel.contains(e.target) && e.target !== toggle) {
        painel.classList.remove("aberto");
      }
    });

    // reage a botões que outras features adicionem ao header depois
    obs = new MutationObserver(() => { if (!movendo) aplicar(); });
    obs.observe(h, { childList: true });
  }

  // botões de ação do header (todos os .botao, menos o toggle)
  function botoesDoHeader() {
    const h = header();
    if (!h) return [];
    return [...h.querySelectorAll(":scope > button.botao")].filter((b) => b !== toggle);
  }

  function aplicar() {
    const h = header();
    if (!h) return;
    if (!toggle) montar();
    movendo = true;
    if (ehMobile()) {
      // move os botões de ação do header pro painel
      botoesDoHeader().forEach((b) => { if (b.parentElement !== painel) painel.appendChild(b); });
      toggle.style.display = "inline-block";
    } else {
      // devolve os botões ao header (antes do toggle), fecha o menu
      [...painel.querySelectorAll("button.botao")].forEach((b) => h.insertBefore(b, toggle));
      painel.classList.remove("aberto");
      toggle.style.display = "none";
    }
    movendo = false;
  }

  document.addEventListener("DOMContentLoaded", aplicar);
  // outras features injetam botões no header no load — reaplica depois
  window.addEventListener("load", () => { setTimeout(aplicar, 300); setTimeout(aplicar, 1200); });
  let t;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(aplicar, 150); });
})();
