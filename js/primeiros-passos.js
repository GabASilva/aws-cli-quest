"use strict";
// ============================================================
// CLImb — primeiros-passos.js
// PROBLEMA (medido em produção): quem abria o app com 0 XP via 15 botões de
// ação — 9 no header, 6 no rodapé. Console, Simulados, Turmas, Carreiras,
// Diagrama, Arquiteto IA: features boas, e NENHUMA faz sentido antes da
// primeira atividade. No celular o rodapé sozinho comia ~25% da tela, com
// "Resetar progresso" em vermelho pra quem não tinha progresso nenhum.
//
// Aqui a gente faz três coisas, todas reversíveis pelo usuário:
//   1. Divulgação progressiva: as features avançadas só aparecem depois da
//      primeira atividade concluída — mas tem um "⋯ Mais" que revela tudo na
//      hora, pra quem quiser fuçar. Nada fica escondido à força.
//   2. "Resetar progresso" só existe quando HÁ progresso, e deixa de ser botão
//      vermelho de perigo: o vermelho fica pro confirm(), que já existia.
//   3. O XP zerado deixa de dizer o que falta e passa a dizer o que fazer.
//
// ADITIVO: não reescreve app.js. Só marca classe e embrulha renderCabecalho.
// Carrega DEPOIS de todos os arquivos que injetam botão, e ANTES do
// mobile-nav.js (que move botões do header pro menu ☰).
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const CHAVE_REVELOU = "awsCliQuest.revelouTudo.v1";

  // Botões que só fazem sentido depois de a pessoa ter feito ALGO.
  // Ficam de fora de propósito: #btnConta (entrar — é conversão),
  // #btnComoJogar (ajuda) e #btnRanking (ver que tem gente jogando).
  const ADIANTADOS = [
    "#btnConceitos", "#btnConquistas", "#btnConsole", "#btnSimulados",
    "#btnTurmas", "#btnPerfil", "#btnSeguranca", "#btnPlano",
    "#btnAssinarCustom", "#btnArquitetoIa", "#btnDiagrama", "#btnCarreiras",
    "#btnNovidades",
  ];

  function revelouManualmente() {
    try { return localStorage.getItem(CHAVE_REVELOU) === "1"; } catch (e) { return false; }
  }
  function marcarRevelou() {
    try { localStorage.setItem(CHAVE_REVELOU, "1"); } catch (e) { /* anônimo: tudo bem */ }
  }
  function quantosConcluidos() {
    try { return typeof jogo !== "undefined" ? Object.keys(jogo.concluidos || {}).length : 0; }
    catch (e) { return 0; }
  }
  // Mostra tudo assim que houver QUALQUER progresso, ou se a pessoa pediu.
  function mostrarTudo() {
    return quantosConcluidos() > 0 || revelouManualmente();
  }

  function injetarEstilo() {
    if (document.getElementById("ppEstilo")) return;
    const st = document.createElement("style");
    st.id = "ppEstilo";
    // !important porque o mobile-nav mexe em display inline ao mover botões
    // entre o header e o painel ☰ — sem isso um botão oculto reapareceria lá.
    st.textContent = `
      .pp-oculto { display: none !important; }
      #btnMaisOpcoes { opacity: .75; }
      #btnMaisOpcoes:hover { opacity: 1; }
    `;
    document.head.appendChild(st);
  }

  // ---------- 1. divulgação progressiva ----------
  // TRAVAR, não esconder. Botão escondido não ensina que a coisa existe — a
  // pessoa não descobre o Console nem os Simulados, logo não tem motivo pra
  // querer destravar. Travado e visível vira convite. Quem cuida da aparência,
  // do bloqueio do clique e da dica que segue o mouse é o travas.js.
  function aplicarVisibilidade() {
    const tudo = mostrarTudo();
    for (const sel of ADIANTADOS) {
      document.querySelectorAll(sel).forEach((b) => {
        b.classList.toggle("pp-travado", !tudo);
        // pro leitor de tela: o botão existe, mas não está operável ainda
        if (tudo) b.removeAttribute("aria-disabled");
        else b.setAttribute("aria-disabled", "true");
      });
    }
    const mais = document.getElementById("btnMaisOpcoes");
    if (mais) mais.classList.toggle("pp-oculto", tudo);
  }

  function criarBotaoMais() {
    if (document.getElementById("btnMaisOpcoes")) return;
    const rodape = document.querySelector("footer");
    if (!rodape) return;
    const b = document.createElement("button");
    b.type = "button";
    b.id = "btnMaisOpcoes";
    b.className = "botao secundario";
    b.textContent = "🔓 Destravar tudo";
    b.title = "Libera agora Console, Simulados, Turmas, Carreiras e Diagrama, sem esperar a 1ª atividade";
    b.addEventListener("click", () => {
      marcarRevelou();
      aplicarVisibilidade();
      if (typeof toast === "function") {
        toast("Tudo destravado — Console, Simulados, Turmas, Carreiras e Diagrama já podem ser abertos.");
      }
    });
    rodape.appendChild(b);
  }

  // ---------- 2. resetar progresso ----------
  function ajustarReset() {
    const b = document.getElementById("btnResetar");
    if (!b) return;
    // vermelho de perigo pra uma ação de ajuste é calibragem errada: o alerta
    // de verdade é o confirm(), que já pergunta antes de apagar.
    b.classList.remove("perigo");
    b.classList.add("secundario");
    b.textContent = "Resetar progresso";
    b.classList.toggle("pp-oculto", quantosConcluidos() === 0);
  }

  // ---------- 3. XP olhando pra frente ----------
  // Embrulha renderCabecalho (declaração global de app.js). Chamamos o original
  // primeiro e só REESCREVEMOS o texto quando o XP é zero.
  function embrulharCabecalho() {
    const original = window.renderCabecalho;
    if (typeof original !== "function" || original.__pp) return;
    function comPrimeirosPassos() {
      const r = original.apply(this, arguments);
      try {
        const alvo = document.querySelector("#textoXp");
        if (alvo && typeof jogo !== "undefined" && (jogo.xp || 0) === 0) {
          alvo.textContent = "Conclua a 1ª atividade e ganhe seus primeiros XP";
        }
        ajustarReset();
        aplicarVisibilidade();
      } catch (e) { /* nunca deixar a UI quebrar por causa disto */ }
      return r;
    }
    comPrimeirosPassos.__pp = true;
    window.renderCabecalho = comPrimeirosPassos;
  }

  // ---------- ligação ----------
  function iniciar() {
    injetarEstilo();
    criarBotaoMais();
    embrulharCabecalho();
    ajustarReset();
    aplicarVisibilidade();

    // Os botões chegam ao DOM em momentos diferentes (cada feature injeta o
    // seu no load) e o mobile-nav ainda os move de lugar. Observamos header e
    // rodapé pra reaplicar. Só mexemos em classe, então isto não se realimenta.
    const obs = new MutationObserver(() => { aplicarVisibilidade(); ajustarReset(); });
    for (const sel of ["header", "footer", "#menuMobilePainel"]) {
      const alvo = document.querySelector(sel);
      if (alvo) obs.observe(alvo, { childList: true });
    }
    // o painel ☰ é criado depois; observa quando aparecer
    setTimeout(() => {
      const p = document.querySelector("#menuMobilePainel");
      if (p) obs.observe(p, { childList: true });
      aplicarVisibilidade();
    }, 600);
    setTimeout(aplicarVisibilidade, 1500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
