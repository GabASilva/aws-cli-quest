"use strict";
// ============================================================
// CLImb — historico.js
// Histórico de comandos que sobrevive à sessão, e Ctrl+R pra buscar nele.
//
// POR QUE: o histórico já existia (setas ↑/↓), mas morria ao fechar a aba —
// então o hábito mais básico de terminal, "recupero o que já digitei", não
// funcionava aqui. Ctrl+R é o passo seguinte: quem aprende a busca reversa
// no CLImb leva isso pro bash de verdade, que é o ponto do produto.
//
// ONDE SE PENDURA: um único keydown em fase de CAPTURA no #entradaTerminal.
// Três arquivos empurram pra ui.historicoCmd (app.js, linux-lab.js e
// setup-lab.js); capturar a tecla cobre os três sem embrulhar nenhum deles,
// e roda antes do handler de setas do app.js — necessário pro Ctrl+R poder
// sequestrar as teclas enquanto a busca está aberta.
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const CHAVE = "awsCliQuest.historico.v1";
  const TETO = 300;          // ~300 linhas cobre semanas de uso e não pesa
  const PROMPT_PADRAO = "climb $";

  const busca = { ativa: false, termo: "", i: -1, valorAntes: "", achou: true };

  function entrada() { return document.getElementById("entradaTerminal"); }
  function promptEl() { return document.querySelector(".linha-entrada .prompt"); }

  // ---------- persistência ----------
  function ler() {
    try {
      const cru = JSON.parse(localStorage.getItem(CHAVE) || "[]");
      return Array.isArray(cru) ? cru.filter((x) => typeof x === "string") : [];
    } catch (e) { return []; }
  }

  let salvarAgendado = null;
  function salvar() {
    clearTimeout(salvarAgendado);
    // debounce curto: digitar rápido não vira uma escrita por tecla
    salvarAgendado = setTimeout(() => {
      try {
        if (typeof ui === "undefined" || !Array.isArray(ui.historicoCmd)) return;
        const lista = ui.historicoCmd.slice(-TETO);
        localStorage.setItem(CHAVE, JSON.stringify(lista));
      } catch (e) { /* cota cheia ou anônimo: histórico só não persiste */ }
    }, 400);
  }

  function restaurar() {
    if (typeof ui === "undefined" || !Array.isArray(ui.historicoCmd)) return;
    const antigo = ler();
    if (!antigo.length) return;
    // à frente do que já houver nesta sessão, pra ordem cronológica bater
    ui.historicoCmd = antigo.concat(ui.historicoCmd);
    ui.posHistorico = ui.historicoCmd.length;
  }

  // ---------- busca reversa ----------
  function pintarPrompt() {
    const p = promptEl();
    if (!p) return;
    if (!busca.ativa) { p.textContent = PROMPT_PADRAO; p.removeAttribute("data-busca"); return; }
    const rotulo = busca.achou ? "reverse-i-search" : "failed reverse-i-search";
    p.textContent = `(${rotulo})\`${busca.termo}':`;
    p.setAttribute("data-busca", "1");
  }

  // procura do fim pro começo a partir de `desde`
  function procurar(termo, desde) {
    if (typeof ui === "undefined") return -1;
    const h = ui.historicoCmd || [];
    const t = termo.toLowerCase();
    for (let i = Math.min(desde, h.length - 1); i >= 0; i--) {
      if ((h[i] || "").toLowerCase().includes(t)) return i;
    }
    return -1;
  }

  function abrirBusca() {
    const e = entrada();
    if (!e) return;
    busca.ativa = true;
    busca.termo = "";
    busca.i = (typeof ui !== "undefined" ? (ui.historicoCmd || []).length : 0) - 1;
    busca.valorAntes = e.value;
    busca.achou = true;
    pintarPrompt();
  }

  function aplicar(i) {
    const e = entrada();
    if (!e || i < 0) return;
    e.value = ui.historicoCmd[i] || "";
    busca.i = i;
  }

  function fecharBusca(restaurarValor) {
    const e = entrada();
    if (e && restaurarValor) e.value = busca.valorAntes;
    busca.ativa = false;
    busca.termo = "";
    pintarPrompt();
    if (typeof ui !== "undefined") ui.posHistorico = (ui.historicoCmd || []).length;
  }

  function refazerBusca(deslocar) {
    const partida = deslocar ? busca.i - 1 : busca.i;
    const achou = procurar(busca.termo, partida);
    if (achou >= 0) { busca.achou = true; aplicar(achou); }
    else busca.achou = false;   // bash mantém o texto e sinaliza "failed"
    pintarPrompt();
  }

  // ---------- teclado ----------
  function aoTeclar(ev) {
    const e = entrada();
    if (!e) return;

    // Ctrl+R: abre a busca, ou pula pra ocorrência mais antiga
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === "r" || ev.key === "R")) {
      ev.preventDefault();       // senão o navegador recarrega a página
      ev.stopPropagation();
      if (!busca.ativa) abrirBusca();
      else refazerBusca(true);
      return;
    }

    if (!busca.ativa) return;

    // Ctrl+G e Esc cancelam e devolvem o que estava escrito (como no bash)
    if (ev.key === "Escape" || ((ev.ctrlKey || ev.metaKey) && (ev.key === "g" || ev.key === "G"))) {
      ev.preventDefault(); ev.stopPropagation();
      fecharBusca(true);
      return;
    }

    // Enter executa o que foi encontrado: é o que o bash faz, e o objetivo
    // aqui é justamente treinar o hábito que vale fora do CLImb.
    if (ev.key === "Enter") {
      fecharBusca(false);
      return;                    // deixa propagar pro handler do app.js
    }

    // setas saem da busca mantendo a linha, pra poder editar
    if (ev.key === "ArrowLeft" || ev.key === "ArrowRight" ||
        ev.key === "ArrowUp" || ev.key === "ArrowDown" || ev.key === "Tab") {
      fecharBusca(false);
      return;
    }

    if (ev.key === "Backspace") {
      ev.preventDefault(); ev.stopPropagation();
      busca.termo = busca.termo.slice(0, -1);
      busca.i = (ui.historicoCmd || []).length - 1;
      if (!busca.termo) { const el = entrada(); if (el) el.value = busca.valorAntes; busca.achou = true; pintarPrompt(); return; }
      refazerBusca(false);
      return;
    }

    // caractere comum entra no TERMO, não na linha
    if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault(); ev.stopPropagation();
      busca.termo += ev.key;
      busca.i = (ui.historicoCmd || []).length - 1;
      refazerBusca(false);
    }
  }

  // salva depois que a linha foi executada (o push acontece no handler do
  // app.js/labs, que roda depois deste capture)
  function aoEnter(ev) {
    if (ev.key !== "Enter") return;
    setTimeout(salvar, 0);
  }

  function estilo() {
    if (document.getElementById("hxEstilo")) return;
    const st = document.createElement("style");
    st.id = "hxEstilo";
    st.textContent = `
      .linha-entrada .prompt[data-busca] {
        color: var(--azul, #58a6ff);
        font-weight: 400;
        white-space: nowrap;
      }
    `;
    document.head.appendChild(st);
  }

  function iniciar() {
    const e = entrada();
    if (!e) return;
    estilo();
    restaurar();
    e.addEventListener("keydown", aoTeclar, true);   // captura: antes do app.js
    e.addEventListener("keydown", aoEnter, true);
    // rede de segurança: fechar a aba sem ter passado pelo debounce
    window.addEventListener("pagehide", () => {
      try {
        if (typeof ui !== "undefined" && Array.isArray(ui.historicoCmd)) {
          localStorage.setItem(CHAVE, JSON.stringify(ui.historicoCmd.slice(-TETO)));
        }
      } catch (err) { /* ok */ }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
