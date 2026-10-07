"use strict";
// ============================================================
// CLImb — icones.js
// Ícones desenhados no lugar do emoji dos botões do app (topo, menus
// Ferramentas/Você, rodapé, faixa do dia, card), em traço único na cor do
// texto. Aprovado pelo Gabriel em 04/10/2026 a partir de uma folha de
// comparação; entrou como opção (v176) e no mesmo dia virou o PADRÃO, a
// pedido dele: "é um ganho real e fica parecendo menos uma IA".
//
// POR QUÊ: o emoji muda de desenho entre Windows, Android e iPhone, e no tema
// claro o ❔ (Como jogar) e o 💬 (Ajuda) são brancos e quase somem no fundo.
// O ícone de traço usa currentColor: segue o tema e o contraste do texto.
//
// Não é opção de HUD (exceção, decidida pelo Gabriel, à regra de
// decisoes-de-hud). Os ícones dos SERVIÇOS na lateral (🪣 S3, 🐧 Linux...)
// ficam: identificam o serviço, não são botão.
//
// COMO: os botões são redesenhados por vários arquivos (renderCabecalho,
// menus.js, temas.js...), sempre com texto "emoji + rótulo". Em vez de mexer
// em cada um, um observador troca o emoji inicial do primeiro texto do botão
// por <svg class="ico">. Idempotente: só escreve quando ainda há emoji, então
// não fica em laço com o próprio observador nem segura o pronto.js à toa.
// ADITIVO: não reescreve nenhum outro arquivo.
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;


  const S = (d) => '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + "</svg>";
  const ICONES = {
    fogo: '<path d="M12 3c1 3.2 4.5 5 4.5 9.5a4.5 4.5 0 0 1-9 0c0-2 1-3.3 2-4.3.3 1.6 1.2 2.6 2.2 2.8C11 8.6 11.3 5.6 12 3z"/>',
    calendario: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    ferramentas: '<rect x="3" y="8" width="18" height="11" rx="2"/><path d="M9 8V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2M3 13h18"/>',
    usuario: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
    trofeu: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5a3 3 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4"/>',
    monitor: '<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16.5V20"/>',
    capelo: '<path d="M2.5 9.5 12 5l9.5 4.5L12 14 2.5 9.5z"/><path d="M6.5 11.5V16c1.6 1.4 3.4 2 5.5 2s3.9-.6 5.5-2v-4.5M21.5 9.5v5"/>',
    robo: '<rect x="5" y="8" width="14" height="11" rx="2.5"/><path d="M12 4.5V8M9.5 13h.01M14.5 13h.01M9.5 16.2h5"/><circle cx="12" cy="4" r="1"/>',
    mapa: '<path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2v-13z"/><path d="M9 4.5v13M15 6.5v13"/>',
    bussola: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2z"/>',
    livro: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5v-15zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5v-15z"/>',
    grupo: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6"/><path d="M15.5 6.3a3 3 0 0 1 0 5.4M17.5 14.6c1.6.6 2.7 2 3 4.4"/>',
    cracha: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16.3c.5-1.6 1.7-2.4 3.2-2.4s2.7.8 3.2 2.4M14.5 10h4M14.5 13.5h3"/>',
    medalha: '<circle cx="12" cy="14.5" r="5"/><path d="M8.5 3.5 10.6 9.7M15.5 3.5l-2.1 6.2M12 12.5v4"/>',
    cadeado: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2"/>',
    aberto: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 7.6-1.7M12 14.5v2"/>',
    estrela: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    lua: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
    alvo: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
    vassoura: '<path d="M18.5 3.5 12.5 11"/><path d="M10.5 9.5l4 3.5-2.2 2.6c-1.7 2-4 3.3-6.8 3.9l-1.5.3.6-1.4c1-2.4 1.6-4.4 2.4-5.9l3.5-3z"/><path d="M8 17.5l1.6-2M10.5 18.3l1-1.4"/>',
    voltar: '<path d="M4 4.5v5h5"/><path d="M4.6 9.5A8 8 0 1 1 4 13"/>',
    ajuda: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.2-2.4 3.7M12 17h.01"/>',
    brilho: '<path d="M12 3.5 13.6 9 19 10.5 13.6 12 12 17.5 10.4 12 5 10.5 10.4 9 12 3.5zM18.5 16.5l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3z"/>',
    balao: '<path d="M4.5 6A1.5 1.5 0 0 1 6 4.5h12A1.5 1.5 0 0 1 19.5 6v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5v-3.5H6A1.5 1.5 0 0 1 4.5 15V6z"/>',
    dado: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"/>',
    lampada: '<path d="M9 17.5h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16.5h5.2v-.7c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    frasco: '<path d="M9.5 3.5h5M10.5 3.5v5.2L5 18.3A1.6 1.6 0 0 0 6.4 20.5h11.2a1.6 1.6 0 0 0 1.4-2.2l-5.5-9.6V3.5M7.6 14.5h8.8"/>',
    grade: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"/>',
  };

  // Alvo -> ícone. Por elemento (o mesmo emoji serve a coisas diferentes: 🎓 é
  // Simulados e Carreiras); "emoji" mapeia quando o rótulo troca de emoji
  // (Tema: ☀️/🌙). "sempre" põe ícone em botão que hoje não tem emoji.
  const ALVOS = [
    ["#streakBox", "fogo"], ["#diasBox", "calendario"],
    ["#mnFerramentas", "ferramentas"], ["#mnVoce", "usuario"],
    ["#btnRanking", "trofeu"], ["#btnConta", "usuario"],
    ["#btnConsole", "monitor"], ["#btnSimulados", "capelo"], ["#btnArquitetoIa", "robo"],
    ["#btnDiagrama", "mapa"], ["#btnCarreiras", "bussola"], ["#btnConceitos", "livro"],
    ["#btnTurmas", "grupo"], ["#btnPerfil", "cracha"], ["#btnConquistas", "medalha"],
    ["#btnSeguranca", "cadeado"], ["#btnPlano", "estrela"],
    ["#btnTema", { "☀️": "sol", "☀": "sol", "🌙": "lua" }], ["#btnDestaque", "alvo"], ["#btnEnxuta", "grade"],
    ["#btnLimparAmbiente", "vassoura"], ["#btnResetar", "voltar", "sempre"],
    ["#btnComoJogar", "ajuda"], ["#btnNovidades", "brilho"], ["#btnAjuda", "balao"],
    ["#btnMaisOpcoes", "aberto"], [".faixa-rotulo", "calendario"], ["#btnSortear", "dado"],
    ["#btnDica", "lampada"], [".sbx-item", "frasco"], [".ft-botao", "grade"],
  ];

  // emoji no começo do texto (com seletor de variação e junções), e o espaço depois
  const EMOJI = /^(\s*)((?:\p{Extended_Pictographic}|[❔❓])(?:️|‍\p{Extended_Pictographic})*)\s?/u;


  // primeiro nó de texto com conteúdo, em profundidade
  function primeiroTexto(el) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    return w.nextNode();
  }

  function trocarEm(el, regra, sempre) {
    if (el.querySelector(":scope svg.ico")) return; // já trocado
    const txt = primeiroTexto(el);
    if (!txt) return;
    const m = txt.nodeValue.match(EMOJI);
    let nome = null;
    if (m) {
      nome = typeof regra === "string" ? regra : regra[m[2]] || regra[m[2].replace(/️/g, "")];
      if (!nome) return;
    } else if (sempre && typeof regra === "string") {
      nome = regra;
    } else {
      return;
    }
    const tmp = document.createElement("span");
    tmp.innerHTML = S(ICONES[nome]);
    const svg = tmp.firstChild;
    svg.dataset.emoji = m ? m[2] : "";
    svg.dataset.nome = nome;
    if (m) txt.nodeValue = m[1] + txt.nodeValue.slice(m[0].length);
    txt.parentNode.insertBefore(svg, txt);
  }

  // Os menus Ferramentas/Você (menus.js) montam cada item copiando o TEXTO do
  // botão original a cada abertura. Com o ícone no lugar do emoji, a cópia
  // saía sem nada na frente — então o item ganha o mesmo ícone do original,
  // achado pelo rótulo.
  function iconesDosMenus() {
    const porRotulo = {};
    document.querySelectorAll("svg.ico").forEach((svg) => {
      const dono = svg.closest("button, .streak, .faixa-rotulo, .sbx-item");
      if (dono && !dono.matches("[role=menuitem]")) porRotulo[dono.textContent.trim()] = svg.dataset.nome;
    });
    document.querySelectorAll("[role=menuitem]").forEach((it) => {
      if (it.querySelector("svg.ico")) return;
      const nome = porRotulo[it.textContent.trim()];
      if (!nome) return;
      const tmp = document.createElement("span");
      tmp.innerHTML = S(ICONES[nome]);
      tmp.firstChild.dataset.emoji = "";
      it.insertBefore(tmp.firstChild, it.firstChild);
    });
  }

  function aplicar() {
    for (const [sel, regra, sempre] of ALVOS) {
      document.querySelectorAll(sel).forEach((el) => { try { trocarEm(el, regra, sempre); } catch (e) { /* um botão estranho não derruba os outros */ } });
    }
    try { iconesDosMenus(); } catch (e) { /* menu fechado ou diferente: fica sem ícone, como antes */ }
  }

  let agendado = false;
  function agendar() {
    if (agendado) return;
    agendado = true;
    setTimeout(() => { agendado = false; aplicar(); }, 0);
  }

  function iniciar() {
    // a opção "Ícones" (v176) gravava esta chave; não serve mais pra nada
    try { localStorage.removeItem("awsCliQuest.icones.v1"); } catch (e) { /* ok */ }
    aplicar();
    new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
