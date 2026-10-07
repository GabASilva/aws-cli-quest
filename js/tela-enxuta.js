"use strict";
// ============================================================
// CLImb — tela-enxuta.js
// Opção de HUD "📐 Tela: enxuta". É OPÇÃO, nunca o padrão (memória
// decisoes-de-hud): o visual de sempre continua sendo o que todo mundo vê.
//
// O que ela tira do caminho (levantado na crítica de design de 06/10/2026):
//   - Ranking deixa de ser o botão laranja cheio do topo — pra quem está
//     estudando, o que importa é a atividade, não o placar;
//   - os contadores 🔥 e 📅 somem enquanto estão em 0 (zero não informa nada);
//   - no computador, as faixas "Aprenda:" e a linha legal saem da altura do
//     app e vão pra baixo dele (rolando a página). Elas CONTINUAM no HTML: são
//     links que o Google segue (ver o comentário no index.html);
//   - a lista lateral usa a fonte do texto, e a monoespaçada fica só nos números;
//   - no celular, a lista de trilhas vem recolhida num botão — a atividade
//     aberta é o que importa ali, e a lista ocupava metade da tela.
//
// Liga só data-enxuta no <body>; o CSS fica no fim do css/estilo.css.
// ADITIVO: não reescreve nada. Carrega depois de temas.js (o botão vai logo
// depois do #btnDestaque) e antes de icones.js e mobile-nav.js.
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const CHAVE = "awsCliQuest.enxuta.v1";
  const CELULAR = window.matchMedia("(max-width: 760px)");

  function ligada() {
    try { return localStorage.getItem(CHAVE) === "1"; } catch (e) { return false; }
  }

  function aplicar(on, avisar) {
    if (on) document.body.setAttribute("data-enxuta", "");
    else document.body.removeAttribute("data-enxuta");
    try { localStorage.setItem(CHAVE, on ? "1" : "0"); } catch (e) { /* anônimo: só não lembra */ }
    atualizarBotao();
    medirAltura();
    montarListaRecolhida();
    if (avisar && typeof toast === "function") {
      toast(on ? "📐 Tela enxuta: menos coisa em volta da atividade." : "📐 Tela de volta ao padrão.", "sucesso");
    }
  }

  // ---------- botão no menu Você ----------
  function atualizarBotao() {
    const b = document.getElementById("btnEnxuta");
    if (!b) return;
    const on = ligada();
    const texto = "📐 Tela: " + (on ? "enxuta" : "padrão");
    // o icones.js troca o emoji do começo por svg: reescrever só se mudou
    if (b.textContent.replace(/^\S+\s/, "") !== texto.replace(/^\S+\s/, "")) b.textContent = texto;
    b.title = on ? "Voltar a tela ao padrão" : "Menos coisa em volta da atividade: ranking discreto, contadores zerados escondidos, rodapé fora da tela";
  }
  function criarBotao() {
    if (document.getElementById("btnEnxuta")) return;
    const ref = document.getElementById("btnDestaque") || document.getElementById("btnTema");
    const rodape = document.querySelector("footer");
    if (!ref && !rodape) return;
    const b = document.createElement("button");
    b.type = "button";
    b.id = "btnEnxuta";
    b.className = "botao secundario";
    b.addEventListener("click", () => aplicar(!ligada(), true));
    if (ref && ref.parentNode) ref.parentNode.insertBefore(b, ref.nextSibling);
    else rodape.appendChild(b);
    atualizarBotao();
  }

  // ---------- contadores zerados ----------
  // data-zero no chip; o CSS só esconde com data-enxuta. Observa o número em
  // vez de embrulhar quem escreve nele (são dois arquivos: app.js e perfil.js).
  function marcarZero(numId, boxId) {
    const num = document.getElementById(numId);
    const box = document.getElementById(boxId);
    if (!num || !box) return;
    const zero = (num.textContent || "").trim() === "0";
    if (box.hasAttribute("data-zero") !== zero) box.toggleAttribute("data-zero", zero);
  }
  function vigiarContadores() {
    const pares = [["streakNum", "streakBox"], ["diasNum", "diasBox"]];
    const atualizar = () => pares.forEach(([n, b]) => marcarZero(n, b));
    atualizar();
    const header = document.querySelector("header");
    if (header) new MutationObserver(atualizar).observe(header, { childList: true, subtree: true, characterData: true });
  }

  // ---------- rodapé fora da altura do app (computador) ----------
  // O app ocupa a tela inteira e as duas faixas de links ficam embaixo dele.
  // A altura do <main> é a tela menos o topo e o rodapé de atalhos, que o
  // header pode mudar de altura (selo, nome longo) — por isso medido.
  function medirAltura() {
    const h = document.querySelector("header");
    const f = document.querySelector("footer");
    if (!h || !f) return;
    const v = (h.offsetHeight + f.offsetHeight) + "px";
    if (document.body.style.getPropertyValue("--enx-fixo") !== v) document.body.style.setProperty("--enx-fixo", v);
  }

  // ---------- lista recolhida (celular) ----------
  function resumoDaLista() {
    try {
      const aberto = typeof ui !== "undefined" && ui.servicoAberto;
      const meta = aberto && typeof SERVICOS_META !== "undefined" ? SERVICOS_META.find((m) => m.id === aberto) : null;
      if (!meta) return "Trilhas e atividades";
      const lista = desafiosDoServico(meta.id);
      const feitos = lista.filter((d) => desafioConcluido(d.id)).length;
      return "Trilha " + meta.nome + " · " + feitos + "/" + lista.length;
    } catch (e) { return "Trilhas e atividades"; }
  }
  function montarListaRecolhida() {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;
    let b = document.getElementById("btnListaEnxuta");
    if (!b) {
      b = document.createElement("button");
      b.type = "button";
      b.id = "btnListaEnxuta";
      b.className = "botao secundario";
      b.setAttribute("aria-controls", "sidebar");
      b.addEventListener("click", () => {
        document.body.classList.toggle("enx-lista-aberta");
        atualizarListaRecolhida();
      });
      sidebar.parentNode.insertBefore(b, sidebar);
    }
    atualizarListaRecolhida();
  }
  function atualizarListaRecolhida() {
    const b = document.getElementById("btnListaEnxuta");
    if (!b) return;
    const aberta = document.body.classList.contains("enx-lista-aberta");
    const texto = (aberta ? "▴ " : "▾ ") + resumoDaLista();
    if (b.textContent !== texto) b.textContent = texto;
    b.setAttribute("aria-expanded", aberta ? "true" : "false");
  }
  // Escolheu uma atividade no celular: a lista fecha e a atividade aparece.
  function embrulharSelecao() {
    const original = window.selecionarDesafio;
    if (typeof original !== "function" || original.__enx) return;
    const embrulhada = function () {
      const r = original.apply(this, arguments);
      try {
        if (CELULAR.matches && document.body.hasAttribute("data-enxuta") &&
            document.body.classList.contains("enx-lista-aberta")) {
          document.body.classList.remove("enx-lista-aberta");
          const card = document.getElementById("cardDesafio");
          if (card) card.scrollIntoView({ block: "start" });
        }
        atualizarListaRecolhida();
      } catch (e) { /* nunca quebrar a seleção por causa disto */ }
      return r;
    };
    embrulhada.__enx = true;
    window.selecionarDesafio = embrulhada;
  }
  function embrulharSidebar() {
    const original = window.renderSidebar;
    if (typeof original !== "function" || original.__enx) return;
    const embrulhada = function () {
      const r = original.apply(this, arguments);
      try { atualizarListaRecolhida(); } catch (e) { /* ok */ }
      return r;
    };
    embrulhada.__enx = true;
    window.renderSidebar = embrulhada;
  }

  function iniciar() {
    criarBotao();
    vigiarContadores();
    embrulharSelecao();
    embrulharSidebar();
    aplicar(ligada(), false);
    window.addEventListener("resize", medirAltura);
  }

  // liga o atributo o quanto antes, pra primeira pintura já sair enxuta
  try { if (document.body && ligada()) document.body.setAttribute("data-enxuta", ""); } catch (e) { /* ok */ }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
