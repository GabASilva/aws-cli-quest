"use strict";
// ============================================================
// CLImb — abertura.js
// A primeira sessão: terminal em tela cheia, um pedido de trabalho de um
// colega, e a interface se montando conforme a pessoa digita.
//
// POR QUE EXISTE: dos 39 cadastrados, 17 nunca digitaram um comando — e dos 22
// que digitaram, 77% passaram de 250 XP. O vazamento é todo antes do primeiro
// comando. Um tour de 7 passos que escurece a tela para explicar a interface
// resolve o problema errado: ele adia justamente o ato que retém.
//
// LIVRE, NÃO GUIADO: nada aqui é terminal falso. O que a pessoa digita passa
// pelo simulador de verdade — `aws help` abre o manual, um comando errado
// devolve o erro real da AWS, e criar o bucket com outro nome também vale.
// A abertura vigia o OBJETIVO (existe bucket?), não a string digitada. Fazer
// diferente contradiria a promessa da capa ("você digita os comandos reais")
// logo no primeiro minuto — e um terminal paralelo divergiria do verdadeiro.
//
// ADITIVO: não reescreve app.js nem extras.js. Embrulha window.executarLinha
// (declaração global, mesmo padrão que o menus.js usa com renderCabecalho) e
// controla a montagem por classes no <body>.
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // null = nunca aconteceu | "vista" = concluída | "pulada" = interrompida
  // | "recusada" = disse não ao convite
  const CHAVE = "awsCliQuest.abertura.v1";

  const st = { ativa: false, fase: null };

  function marca() { try { return localStorage.getItem(CHAVE); } catch (e) { return "recusada"; } }
  function marcar(v) { try { localStorage.setItem(CHAVE, v); } catch (e) { /* anônimo: tudo bem */ } }

  function semProgresso() {
    try { return typeof jogo !== "undefined" && Object.keys(jogo.concluidos || {}).length === 0; }
    catch (e) { return false; }
  }
  const PEDIDO = "meu-primeiro-bucket";
  function buckets() {
    try { return Object.keys(jogo.conta.s3.buckets || {}); } catch (e) { return []; }
  }
  // O objetivo é o bucket QUE O RAFA PEDIU, não um bucket qualquer.
  //
  // "Livre" vale pro caminho — explorar com aws s3 help, errar, tentar de novo,
  // chegar como quiser. Não vale pra ignorar o que foi pedido: o desafio s3-1
  // confere o nome e responde "Quase lá" quando ele não bate. Aceitar outro
  // nome aqui colocaria o Rafa agradecendo na linha seguinte ao app dizendo que
  // estava errado — dois sistemas discordando na mesma tela.
  function objetivoFeito() { return buckets().indexOf(PEDIDO) >= 0; }
  function diz(txt, cls) { if (typeof imprimir === "function") imprimir(txt, cls || ""); }
  function rolar() { if (typeof rolarTerminal === "function") rolarTerminal(); }
  function focar() { document.getElementById("entradaTerminal")?.focus({ preventScroll: true }); }

  // ---------- estilo ----------
  function injetarEstilo() {
    if (document.getElementById("abEstilo")) return;
    const st2 = document.createElement("style");
    st2.id = "abEstilo";
    // Sem position:fixed de propósito: escondendo por display e deixando o
    // #terminal ocupar a viewport, cada peça que volta empurra o layout
    // sozinha — a "montagem" é o layout real reagindo, não uma animação.
    st2.textContent = `
      body.ab-modo header,
      body.ab-modo #sidebar,
      body.ab-modo footer,
      body.ab-modo #cardDesafio,
      body.ab-modo #faixaTreino,
      body.ab-modo .aviso-marca { display: none !important; }

      /* O <main> é grid de duas colunas. Esconder a aside não apaga a coluna:
         ela continua reservando 300px e o terminal fica espremido. Enquanto a
         lateral não voltar, o grid vira de uma coluna só — e quando ela volta,
         o :not() abaixo sai de cena e a regra original do app assume. */
      body.ab-modo:not(.ab-lateral) main { grid-template-columns: 1fr !important; }

      /* Quem manda na altura é o <main>; o terminal só preenche o que sobrar.
         Fixar altura no próprio terminal não funciona: .centro é flex e o
         flex-shrink encolhia o terminal de volta pro tamanho do contêiner. */
      body.ab-modo main {
        padding: 0 !important; margin: 0 !important; gap: 0 !important;
        height: calc(100vh - var(--ab-topo, 0px)) !important;
        transition: height .45s cubic-bezier(.2,.7,.3,1);
      }
      body.ab-modo .centro { padding: 0 !important; margin: 0 !important; height: 100% !important; }
      body.ab-modo #terminal {
        flex: 1 1 auto !important;
        height: auto !important;
        max-height: none !important;
        border-radius: 0 !important;
        border-left: 0 !important; border-right: 0 !important;
      }
      /* espaço pro botão "pular abertura", que é fixo no topo direito */
      body.ab-modo #saidaTerminal { padding-top: 3rem; }

      body.ab-modo.ab-topo header {
        display: flex !important;
        animation: ab-desce .5s cubic-bezier(.2,.7,.3,1) both;
      }
      body.ab-modo.ab-lateral #sidebar {
        display: block !important;
        animation: ab-entra .5s cubic-bezier(.2,.7,.3,1) both;
      }
      @keyframes ab-desce { from { opacity: 0; transform: translateY(-100%); } to { opacity: 1; transform: none; } }
      @keyframes ab-entra { from { opacity: 0; transform: translateX(-100%); } to { opacity: 1; transform: none; } }

      #abPular {
        position: fixed; top: .8rem; right: .9rem; z-index: 9500;
        font-size: .78rem; padding: .4rem .8rem;
        /* cor fixa, não token: a abertura é sempre escura, inclusive sob o
           tema Nítido (claro) — os tokens de lá dariam cinza sobre preto */
        background: transparent; color: #8b99b0;
        border: 1px solid #2a3650; border-radius: .4rem;
        cursor: pointer; font-family: inherit;
      }
      /* quando o cabeçalho desce, ele ocuparia o mesmo canto do botão "Entrar" */
      body.ab-modo.ab-topo #abPular { top: auto; bottom: 1rem; }
      #abPular:hover { color: #dce3ee; border-color: #ff9900; }
      #abPular:focus-visible { outline: 2px solid #ff9900; outline-offset: 2px; }

      #abConvite {
        position: fixed; right: 1rem; bottom: 1rem; z-index: 9500;
        max-width: 20rem; padding: .9rem 1rem;
        background: var(--painel-2, #1c2638);
        border: 1px solid var(--borda, #2a3650);
        border-left: 2px solid var(--laranja, #ff9900);
        border-radius: .5rem;
        box-shadow: 0 12px 30px -14px rgba(0,0,0,.7);
        font-size: .86rem; line-height: 1.5;
        animation: ab-sobe .35s ease both;
      }
      #abConvite p { margin: 0 0 .7rem; color: var(--texto, #dce3ee); }
      #abConvite .acoes { display: flex; gap: .5rem; }
      @keyframes ab-sobe { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

      @media (prefers-reduced-motion: reduce) {
        body.ab-modo #terminal { transition: none; }
        body.ab-modo.ab-topo header,
        body.ab-modo.ab-lateral #sidebar,
        #abConvite { animation: none; }
      }
    `;
    document.head.appendChild(st2);
  }

  // ---------- montagem progressiva ----------
  function revelarTopo() {
    if (document.body.classList.contains("ab-topo")) return;
    document.body.classList.add("ab-topo");
    // mede o header depois de visível pra o terminal encolher na medida certa
    requestAnimationFrame(() => {
      const h = document.querySelector("header")?.getBoundingClientRect().height || 0;
      document.body.style.setProperty("--ab-topo", Math.round(h) + "px");
    });
  }
  function revelarLateral() {
    document.body.classList.add("ab-lateral");
  }

  function sair(concluida) {
    st.ativa = false;
    st.fase = null;
    document.body.classList.remove("ab-modo", "ab-topo", "ab-lateral");
    document.body.style.removeProperty("--ab-topo");
    document.getElementById("abPular")?.remove();
    marcar(concluida ? "vista" : "pulada");
    if (typeof renderCabecalho === "function") renderCabecalho();
    if (typeof renderSidebar === "function") renderSidebar();
    if (typeof renderCard === "function") renderCard();
    focar();
  }

  // Desenha o recado do colega. A moldura em ASCII só entra quando cabe:
  // num celular ela quebra de linha e vira um monte de barra solta, que é pior
  // do que não ter moldura nenhuma.
  function recado(linhas, assinatura) {
    const largo = window.innerWidth >= 620;
    if (!largo) {
      diz("recado do time · " + assinatura.replace("— ", ""), "aviso-climb");
      linhas.forEach((l) => diz("  " + l));
      return;
    }
    const larguraMax = Math.max.apply(null, linhas.concat([assinatura]).map((l) => l.length));
    const w = larguraMax + 4;
    const barra = (a, b) => a + "─".repeat(w) + b;
    diz("  " + barra("┌", "┐"));
    diz("  │" + " ".repeat(w) + "│");
    linhas.forEach((l) => diz("  │  " + l + " ".repeat(w - l.length - 2) + "│"));
    diz("  │" + " ".repeat(w) + "│");
    diz("  │" + " ".repeat(w - assinatura.length - 2) + assinatura + "  │");
    diz("  " + barra("└", "┘"));
  }

  // ---------- roteiro ----------
  function abrir() {
    st.ativa = true;
    st.fase = "tarefa";
    injetarEstilo();
    document.body.classList.add("ab-modo");

    const b = document.createElement("button");
    b.id = "abPular";
    b.type = "button";
    b.textContent = "pular abertura";
    b.addEventListener("click", () => sair(false));
    document.body.appendChild(b);

    const saida = document.getElementById("saidaTerminal");
    if (saida) saida.innerHTML = "";

    diz("Conectado a bancada-01 · sa-east-1 · conta AWS simulada", "");
    setTimeout(() => {
      diz("");
      recado([
        "bom dia! o site novo sobe hoje.",
        "preciso de um bucket no S3 pros arquivos.",
        "pode chamar de meu-primeiro-bucket?"
      ], "— Rafa, 08:12");
      diz("");
      diz("Não sabe o comando? Digite  aws s3 help", "aviso-climb");
      rolar();
      focar();
    }, 700);
  }

  function conquistou() {
    if (st.fase !== "tarefa") return;
    st.fase = "xp";
    setTimeout(() => {
      diz("");
      recado(["perfeito, valeu! 🙏"], "— Rafa, 08:14");
      revelarTopo();
      setTimeout(() => {
        diz("");
        diz("↑ apareceu uma barra no topo: é o seu XP. Ela enche conforme você resolve coisas.", "aviso-climb");
        diz("");
        diz("Existem outras 62 trilhas além do S3.");
        diz("  climb trilhas    ver todas", "aviso-climb");
        st.fase = "trilhas";
        rolar();
        focar();
      }, 700);
    }, 500);
  }

  function mostrarTrilhas() {
    st.fase = "fim";
    revelarLateral();
    setTimeout(() => {
      diz("");
      diz("← a lista ficou fixa à esquerda. Era o último pedaço da tela.", "aviso-climb");
      diz("Você montou a interface digitando. É assim que o CLImb funciona daqui pra frente.");
      diz("");
      rolar();
      setTimeout(() => sair(true), 1400);
    }, 650);
  }

  // ---------- convite pra quem pulou ----------
  function convidar() {
    if (document.getElementById("abConvite")) return;
    injetarEstilo();
    const cx = document.createElement("div");
    cx.id = "abConvite";
    cx.setAttribute("role", "dialog");
    cx.setAttribute("aria-label", "Ver a introdução");
    cx.innerHTML =
      "<p>Quer ver a introdução? São uns 40 segundos, e você já sai com a primeira tarefa feita.</p>" +
      "<div class='acoes'>" +
      "<button class='botao' id='abSim'>Ver agora</button>" +
      "<button class='botao secundario' id='abNao'>Não, obrigado</button>" +
      "</div>";
    document.body.appendChild(cx);
    cx.querySelector("#abSim").addEventListener("click", () => { cx.remove(); abrir(); });
    cx.querySelector("#abNao").addEventListener("click", () => { cx.remove(); marcar("recusada"); });
  }

  // ---------- embrulho do terminal ----------
  function embrulhar() {
    const original = window.executarLinha;
    if (typeof original !== "function" || original.__ab) return;

    function comAbertura(linha) {
      const cmd = String(linha || "").trim().toLowerCase();

      // comandos só da abertura, antes de o simulador ver a linha
      if (st.ativa && cmd.indexOf("climb") === 0) {
        if (typeof imprimirComando === "function") imprimirComando(linha.trim());
        if (cmd === "climb trilhas" || cmd === "climb trilha") {
          if (st.fase === "trilhas") { mostrarTrilhas(); return; }
          diz("Termine a tarefa do Rafa primeiro 🙂", "aviso-climb");
          rolar(); return;
        }
        if (cmd === "climb" || cmd === "climb ajuda" || cmd === "climb help") {
          diz("  climb trilhas    ver as trilhas (depois da primeira tarefa)", "aviso-climb");
          rolar(); return;
        }
        diz("Comando do CLImb desconhecido: " + linha.trim(), "erro");
        rolar(); return;
      }

      const r = original.apply(this, arguments);

      if (st.ativa && st.fase === "tarefa") {
        if (objetivoFeito()) conquistou();
        else if (buckets().length && !st.cutucou) {
          // criou bucket, mas com outro nome: o Rafa explica por que o nome
          // importa, concordando com o "Quase lá" que o app acabou de dar.
          st.cutucou = true;
          diz("");
          recado([
            "opa — precisa ser meu-primeiro-bucket mesmo,",
            "o deploy do site aponta pra esse nome."
          ], "— Rafa, 08:13");
          rolar();
        }
      }
      return r;
    }
    comAbertura.__ab = true;
    window.executarLinha = comAbertura;
  }

  // ---------- ligação ----------
  function decidir() {
    // espera a capa sair: ela é quem converte quem chegou de fora, e a
    // abertura serve quem já decidiu entrar. Uma não atropela a outra.
    if (document.getElementById("capa")) return setTimeout(decidir, 400);
    if (!semProgresso()) return;

    const m = marca();
    if (m === "vista" || m === "recusada") return;
    if (m === "pulada") return convidar();
    abrir();
  }

  function iniciar() {
    embrulhar();
    setTimeout(decidir, 500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
