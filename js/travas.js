"use strict";
// ============================================================
// CLImb — travas.js
// Botão bloqueado: VISÍVEL, porém não clicável, com uma dica que acompanha
// o mouse explicando como destravar.
//
// POR QUE MUDOU: antes, quem chegava sem nenhuma atividade feita simplesmente
// não via Console, Simulados, Turmas, Carreiras, Diagrama nem Conquistas — os
// botões tinham display:none. Isso enxuga a primeira tela, mas ensina zero:
// a pessoa não descobre que aquilo existe, e portanto não tem motivo pra
// querer destravar. Mostrar travado inverte isso — vira convite em vez de
// ausência.
//
// COMO SE ENCAIXA: o primeiros-passos.js marca os botões com .pp-travado
// (antes era .pp-oculto). Este arquivo cuida do resto: aparência, bloqueio do
// clique e a dica. Carrega DEPOIS de primeiros-passos.js e menus.js.
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const CLASSE = "pp-travado";
  const RECADO = "Conclua uma atividade para desbloquear";

  // ---------- aparência ----------
  function injetarEstilo() {
    if (document.getElementById("tvEstilo")) return;
    const st = document.createElement("style");
    st.id = "tvEstilo";
    // !important pelos mesmos motivos do primeiros-passos.js: o mobile-nav
    // mexe em estilo inline ao mover botões entre o header e o painel ☰.
    st.textContent = `
      .${CLASSE} {
        opacity: .42 !important;
        cursor: not-allowed !important;
        filter: grayscale(.7);
        position: relative;
      }
      .${CLASSE}:hover { opacity: .6 !important; }
      /* o cadeado entra por CSS pra não mexer no texto do botão — se mexesse,
         o menus.js copiaria o cadeado pro rótulo do item ao remontar */
      .${CLASSE}::after {
        content: " 🔒";
        font-size: .85em;
        opacity: .9;
      }

      .tv-dica {
        position: fixed;
        z-index: 99999;
        pointer-events: none;            /* nunca rouba o mouse de volta */
        max-width: 15rem;
        padding: .45rem .65rem;
        border-radius: .4rem;
        background: var(--painel-2, #1c2638);
        border: 1px solid var(--borda, #2a3650);
        color: var(--texto, #dce3ee);
        font-size: .78rem;
        line-height: 1.35;
        box-shadow: 0 6px 18px rgba(0,0,0,.45);
        opacity: 0;
        transition: opacity .12s ease;
      }
      .tv-dica.tv-visivel { opacity: 1; }
      .tv-dica b { color: var(--laranja, #ff9900); }

      @media (prefers-reduced-motion: reduce) {
        .tv-dica { transition: none; }
      }
    `;
    document.head.appendChild(st);
  }

  // ---------- a dica ----------
  let dica = null;
  function caixa() {
    if (dica && dica.isConnected) return dica;
    dica = document.createElement("div");
    dica.className = "tv-dica";
    dica.setAttribute("role", "tooltip");
    dica.id = "tvDica";
    document.body.appendChild(dica);
    return dica;
  }

  function posicionar(x, y) {
    const d = caixa();
    const margem = 14;
    const r = d.getBoundingClientRect();
    // Vira de lado / pra cima quando encosta na borda, senão a dica sai da tela
    // justo nos botões do canto direito do header, que são a maioria deles.
    let px = x + margem;
    let py = y + margem;
    if (px + r.width > window.innerWidth - 8) px = x - r.width - margem;
    if (py + r.height > window.innerHeight - 8) py = y - r.height - margem;
    d.style.left = Math.max(8, px) + "px";
    d.style.top = Math.max(8, py) + "px";
  }

  function mostrar(texto, x, y) {
    const d = caixa();
    d.innerHTML = texto;
    d.classList.add("tv-visivel");
    posicionar(x, y);
  }

  function esconder() {
    if (dica) dica.classList.remove("tv-visivel");
  }

  // ---------- quem está travado ----------
  function travado(alvo) {
    if (!alvo || !alvo.closest) return null;
    return alvo.closest("." + CLASSE);
  }

  // ---------- ligação ----------
  function iniciar() {
    injetarEstilo();

    document.addEventListener("mouseover", (ev) => {
      const el = travado(ev.target);
      if (el) mostrar(RECADO, ev.clientX, ev.clientY);
    });

    document.addEventListener("mousemove", (ev) => {
      const el = travado(ev.target);
      if (el) posicionar(ev.clientX, ev.clientY);
      else esconder();
    });

    document.addEventListener("mouseout", (ev) => {
      if (travado(ev.target) && !travado(ev.relatedTarget)) esconder();
    });

    // Bloqueio do clique na fase de CAPTURA: precisa acontecer antes de o
    // handler do próprio botão rodar. Vale também pro item de menu, que chama
    // orig.click() — o clique sintético passa por aqui do mesmo jeito.
    document.addEventListener(
      "click",
      (ev) => {
        const el = travado(ev.target);
        if (!el) return;
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        // clique sintético (via menu) não traz coordenada: ancora no botão
        const x = ev.clientX || el.getBoundingClientRect().left + 20;
        const y = ev.clientY || el.getBoundingClientRect().bottom;
        mostrar("<b>Ainda travado.</b><br>" + RECADO + ".", x, y);
        setTimeout(esconder, 2600);
      },
      true
    );

    // Teclado: quem navega por Tab também precisa saber por que não abre.
    document.addEventListener("focusin", (ev) => {
      const el = travado(ev.target);
      if (!el) return esconder();
      const r = el.getBoundingClientRect();
      mostrar(RECADO, r.left, r.bottom);
    });
    document.addEventListener("focusout", esconder);
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") esconder(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
