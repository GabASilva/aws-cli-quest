"use strict";
// ============================================================
// CLImb — menus.js
// PROBLEMA: pro usuário engajado o header tinha 10 botões e o rodapé 6. No
// celular o mobile-nav já resolve o header (vira ☰), mas NÃO toca o rodapé —
// que ficava com 6 botões, 139px, 17% da tela.
//
// Aqui os botões viram dois menus agrupados por TAREFA:
//   🧰 Ferramentas → Console, Simulados, Arquiteto IA, Diagrama, Carreiras,
//                    Conceitos, Turmas   (as "salas extras" do app)
//   👤 Você        → Perfil, Conquistas, Segurança, Assinar Pro, Resetar
// Ficam diretos: Ranking e Entrar (Entrar é conversão; menu esconderia).
// No rodapé, "Como jogar" e "Novidades" viram links pequenos, não botões.
//
// DECISÃO IMPORTANTE — os menus são PROXY, não movem nada de lugar.
// O mobile-nav move os botões do header pro painel ☰. Se este arquivo também
// movesse, os dois disputariam os mesmos elementos e o resultado dependeria da
// ordem em que cada timeout dispara. Em vez disso: o botão original fica onde
// está (só escondido) e o item do menu chama .click() nele. Zero disputa, e os
// handlers originais continuam valendo sem precisar religar nada.
//
// No celular os menus são DESMONTADOS e os botões reaparecem — aí o mobile-nav
// faz o trabalho dele normalmente. Menu é afordância de desktop; ☰ é a de
// celular. Cada um no seu lugar.
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const LIMITE = 760; // mesmo ponto de corte do mobile-nav.js
  const MENUS = [
    {
      id: "mnFerramentas", rotulo: "🧰 Ferramentas",
      itens: ["#btnConsole", "#btnSimulados", "#btnArquitetoIa", "#btnDiagrama",
              "#btnCarreiras", "#btnConceitos", "#btnTurmas"],
    },
    {
      id: "mnVoce", rotulo: "👤 Você",
      itens: ["#btnPerfil", "#btnConquistas", "#btnSeguranca", "#btnPlano",
              "#btnAssinarCustom", "#btnResetar"],
    },
  ];
  const LINKS_RODAPE = ["#btnComoJogar", "#btnNovidades"];

  let montado = false;
  let abertoAgora = null;

  function ehMobile() { return window.innerWidth <= LIMITE; }

  // Um botão só entra no menu se existe E não foi escondido por outro arquivo.
  // Checamos as classes/estilo em vez de getComputedStyle porque NÓS mesmos
  // escondemos os originais — computed diria "none" pra todos.
  function disponivel(sel) {
    const el = document.querySelector(sel);
    if (!el) return null;
    if (el.classList.contains("pp-oculto")) return null;   // primeiros-passos.js
    if (el.classList.contains("tl-escondido")) return null; // tela-limpa.js
    if (el.style && el.style.display === "none") return null;
    return el;
  }

  function injetarEstilo() {
    if (document.getElementById("mnEstilo")) return;
    const st = document.createElement("style");
    st.id = "mnEstilo";
    st.textContent = `
      .mn-caixa { position: relative; display: inline-block; }
      .mn-gatilho .mn-seta { font-size: .7em; margin-left: .35rem; opacity: .7; }
      .mn-painel {
        position: absolute; top: calc(100% + .4rem); right: 0; z-index: 900;
        min-width: 13rem; padding: .35rem;
        background: var(--painel, #161e2d);
        border: 1px solid var(--borda, #2a3650); border-radius: .55rem;
        box-shadow: 0 .8rem 2rem rgba(0,0,0,.45);
        display: none;
      }
      .mn-painel.aberto { display: block; }
      .mn-painel button {
        display: block; width: 100%; text-align: left;
        background: none; border: 0; cursor: pointer;
        padding: .55rem .7rem; border-radius: .4rem;
        color: var(--texto, #dce3ee); font-size: .88rem; font-family: inherit;
        white-space: nowrap;
      }
      .mn-painel button:hover, .mn-painel button:focus {
        background: var(--painel-2, #1c2638); color: var(--laranja, #ff9900);
        outline: none;
      }
      .mn-painel button:focus-visible { box-shadow: inset 0 0 0 2px var(--laranja, #ff9900); }
      /* originais absorvidos: somem do header/rodapé, mas continuam no DOM
         (é neles que o clique do menu é disparado) */
      body.mn-ativo .mn-absorvido { display: none !important; }
      /* rodapé: "Como jogar" e "Novidades" viram link, não botão */
      body.mn-ativo .mn-link.botao {
        background: none !important; border: 0 !important; box-shadow: none !important;
        color: var(--texto-fraco, #8b99b0) !important;
        font-size: .8rem !important; font-weight: 400 !important;
        padding: .4rem .3rem !important;
        text-decoration: underline; text-underline-offset: 3px;
      }
      body.mn-ativo .mn-link.botao:hover { color: var(--laranja, #ff9900) !important; }
      @media (max-width: ${LIMITE}px) { .mn-caixa { display: none !important; } }
    `;
    document.head.appendChild(st);
  }

  // ---------- abrir / fechar ----------
  function fechar(menu, devolverFoco) {
    if (!menu) return;
    menu.painel.classList.remove("aberto");
    menu.gatilho.setAttribute("aria-expanded", "false");
    if (abertoAgora === menu) abertoAgora = null;
    if (devolverFoco) menu.gatilho.focus();
  }
  function fecharTodos(devolverFoco) {
    if (abertoAgora) fechar(abertoAgora, devolverFoco);
  }
  function abrir(menu, focarPrimeiro) {
    fecharTodos(false);
    preencher(menu);
    menu.painel.classList.add("aberto");
    menu.gatilho.setAttribute("aria-expanded", "true");
    abertoAgora = menu;
    if (focarPrimeiro) menu.painel.querySelector("button")?.focus();
  }

  // ---------- conteúdo do painel ----------
  // Reconstruído a cada abertura: os rótulos mudam (o "Novidades" ganha selo
  // "novo", o "Assinar Pro" muda quando a assinatura vale) e um item pode ter
  // sido escondido nesse meio-tempo.
  function preencher(menu) {
    menu.painel.innerHTML = "";
    let n = 0;
    for (const sel of menu.def.itens) {
      const orig = disponivel(sel);
      if (!orig) continue;
      const it = document.createElement("button");
      it.type = "button";
      it.setAttribute("role", "menuitem");
      it.textContent = (orig.textContent || "").trim();
      it.addEventListener("click", () => {
        fechar(menu, false);
        orig.click(); // handler original, intacto
      });
      menu.painel.appendChild(it);
      n++;
    }
    return n;
  }

  function teclado(menu, ev) {
    const itens = [...menu.painel.querySelectorAll("button")];
    const i = itens.indexOf(document.activeElement);
    if (ev.key === "Escape") { ev.preventDefault(); fechar(menu, true); }
    else if (ev.key === "ArrowDown") { ev.preventDefault(); itens[(i + 1) % itens.length]?.focus(); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); itens[(i - 1 + itens.length) % itens.length]?.focus(); }
    else if (ev.key === "Home") { ev.preventDefault(); itens[0]?.focus(); }
    else if (ev.key === "End") { ev.preventDefault(); itens[itens.length - 1]?.focus(); }
    else if (ev.key === "Tab") fechar(menu, false); // Tab sai do menu: fecha junto
  }

  function criarMenu(def, header, antesDe) {
    const caixa = document.createElement("div");
    caixa.className = "mn-caixa";
    caixa.id = def.id;

    const gatilho = document.createElement("button");
    gatilho.type = "button";
    gatilho.className = "botao secundario mn-gatilho";
    gatilho.innerHTML = `${def.rotulo}<span class="mn-seta" aria-hidden="true">▾</span>`;
    gatilho.setAttribute("aria-haspopup", "true");
    gatilho.setAttribute("aria-expanded", "false");

    const painel = document.createElement("div");
    painel.className = "mn-painel";
    painel.setAttribute("role", "menu");
    painel.setAttribute("aria-label", def.rotulo.replace(/^\S+\s*/, ""));

    caixa.appendChild(gatilho);
    caixa.appendChild(painel);
    const menu = { def, caixa, gatilho, painel };

    gatilho.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (painel.classList.contains("aberto")) fechar(menu, false);
      else abrir(menu, false);
    });
    gatilho.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown" || ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault(); abrir(menu, true);
      } else if (ev.key === "Escape") fechar(menu, true);
    });
    painel.addEventListener("keydown", (ev) => teclado(menu, ev));

    // O #btnRanking pode ter sido movido pro painel ☰ pelo mobile-nav — nesse
    // caso ele não é mais filho do header e o insertBefore lançaria
    // NotFoundError. Só usamos a referência se ela AINDA estiver no header.
    const ref = antesDe && antesDe.parentElement === header ? antesDe : null;
    header.insertBefore(caixa, ref);
    return menu;
  }

  // ---------- montar / desmontar ----------
  let menus = [];

  function montar() {
    if (montado) return;
    const header = document.querySelector("header");
    if (!header) return;
    const antesDe = document.querySelector("#btnRanking") || document.querySelector("#menuMobile");
    menus = MENUS.map((def) => criarMenu(def, header, antesDe));
    montado = true;
  }

  function desmontar() {
    if (!montado) return;
    fecharTodos(false);
    menus.forEach((m) => m.caixa.remove());
    menus = [];
    montado = false;
  }

  // Marca quem foi absorvido e esconde o trigger de menu que ficou sem item.
  // Trava de reentrância: mexemos no mesmo DOM que observamos. Mas uma chamada
  // bloqueada NÃO pode ser descartada — o callback do MutationObserver é
  // microtarefa e roda ANTES do setTimeout que solta a trava, então descartar
  // perderia justamente a sincronização que vem depois de outro arquivo mexer
  // no header. Por isso marcamos "pendente" e repetimos uma vez.
  let sincronizando = false, pendente = false;
  function sincronizar() {
    if (sincronizando) { pendente = true; return; }
    sincronizando = true;
    try { _sincronizar(); } finally {
      setTimeout(() => {
        sincronizando = false;
        if (pendente) { pendente = false; sincronizar(); }
      }, 0);
    }
  }
  function _sincronizar() {
    const absorvidos = new Set();
    MENUS.forEach((d) => d.itens.forEach((s) => absorvidos.add(s)));

    document.querySelectorAll(".mn-absorvido").forEach((e) => e.classList.remove("mn-absorvido"));
    document.querySelectorAll(".mn-link").forEach((e) => e.classList.remove("mn-link"));

    if (ehMobile()) {
      document.body.classList.remove("mn-ativo");
      desmontar();
      return;
    }
    document.body.classList.add("mn-ativo");
    montar();

    // Ordem estável: os menus vêm ANTES de Ranking/Entrar. Sem isto, quando o
    // mobile-nav devolve os botões ao header numa volta de resize, eles entram
    // antes das caixas de menu e a barra troca de ordem sozinha.
    const hdr = document.querySelector("header");
    const ranking = document.querySelector("#btnRanking");
    if (hdr && ranking && ranking.parentElement === hdr) {
      menus.forEach((m) => {
        if (m.caixa.parentElement !== hdr) return;
        // Só mexe se estiver REALMENTE fora de ordem. insertBefore num nó que já
        // está na posição certa remove+reinsere e dispara o MutationObserver
        // abaixo — o que realimentaria sincronizar() em laço infinito.
        const foraDeOrdem = m.caixa.compareDocumentPosition(ranking) & Node.DOCUMENT_POSITION_PRECEDING;
        if (foraDeOrdem) hdr.insertBefore(m.caixa, ranking);
      });
    }

    absorvidos.forEach((sel) => document.querySelector(sel)?.classList.add("mn-absorvido"));
    LINKS_RODAPE.forEach((sel) => document.querySelector(sel)?.classList.add("mn-link"));

    // menu sem nenhum item disponível não deve aparecer (é o caso de quem
    // ainda não concluiu a 1ª atividade — primeiros-passos.js esconde tudo)
    menus.forEach((m) => {
      const tem = m.def.itens.some((s) => disponivel(s));
      m.caixa.style.display = tem ? "" : "none";
    });
  }

  // ---------- ligação ----------
  function iniciar() {
    injetarEstilo();
    sincronizar();

    document.addEventListener("click", (ev) => {
      if (abertoAgora && !abertoAgora.caixa.contains(ev.target)) fecharTodos(false);
    });

    // O primeiros-passos.js revela os botões trocando CLASSE (.pp-oculto), não
    // inserindo nós — então o observer de childList abaixo não enxerga isso.
    // renderCabecalho roda a cada mudança de progresso e é onde ele reavalia a
    // visibilidade; embrulhamos depois dele (carregamos depois) pra sincronizar
    // os menus no mesmo instante em que os botões passam a existir pro usuário.
    const cabecalhoOriginal = window.renderCabecalho;
    if (typeof cabecalhoOriginal === "function" && !cabecalhoOriginal.__mn) {
      function comMenus() {
        const r = cabecalhoOriginal.apply(this, arguments);
        try { sincronizar(); } catch (e) { /* nunca quebrar a UI por causa disto */ }
        return r;
      }
      comMenus.__mn = true;
      window.renderCabecalho = comMenus;
    }

    // botões chegam ao DOM em momentos diferentes (cada feature injeta o seu)
    const obs = new MutationObserver(() => sincronizar());
    ["header", "footer"].forEach((s) => {
      const el = document.querySelector(s);
      if (el) obs.observe(el, { childList: true });
    });

    // Debounce menor que o do mobile-nav (150ms) de propósito: ao encolher a
    // tela, desmontamos ANTES de ele recolher os botões pro ☰.
    // Duas passadas por resize: a de 90ms desmonta ANTES de o mobile-nav (150ms)
    // recolher os botões; a de 300ms roda DEPOIS que ele terminou de devolvê-los,
    // que é quando dá pra colocar os menus na ordem certa do header.
    let t, t2;
    window.addEventListener("resize", () => {
      clearTimeout(t); clearTimeout(t2);
      t = setTimeout(sincronizar, 90);
      t2 = setTimeout(sincronizar, 300);
    });
    setTimeout(sincronizar, 700);
    setTimeout(sincronizar, 1600);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
