"use strict";
// ============================================================
// CLImb — capa.js
// PROBLEMA: quem clicava no link (LinkedIn, WhatsApp) caía DIRETO dentro da
// aplicação — header com 15 botões, terminal, barra de XP zerada — sem nunca
// ler o que o CLImb é nem por que deveria se importar. Não havia pitch, não
// havia CTA. A pessoa batia o olho e saía.
//
// Este arquivo põe uma CAPA na frente disso na primeira visita: o que é, como
// funciona, e UM botão só ("Começar agora"), que já leva pra primeira
// atividade. Some pra sempre depois de dispensada.
//
// ADITIVO: não toca app.js/jogo.js. Some sozinho pra quem já tem progresso ou
// já está logado — quem volta nunca mais vê.
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const CHAVE = "awsCliQuest.capa.v1";
  const CHAVE_TOKEN = "awsCliQuest.token";

  function jaDispensou() {
    try { return localStorage.getItem(CHAVE) === "1"; } catch (e) { return false; }
  }
  function marcarDispensada() {
    try { localStorage.setItem(CHAVE, "1"); } catch (e) { /* modo anônimo: tudo bem */ }
  }
  function estaLogado() {
    try { return !!localStorage.getItem(CHAVE_TOKEN); } catch (e) { return false; }
  }
  function temProgresso() {
    try { return typeof jogo !== "undefined" && Object.keys(jogo.concluidos || {}).length > 0; }
    catch (e) { return false; }
  }

  // Só mostra pra quem é REALMENTE novo: sem progresso, sem sessão, sem ter
  // dispensado antes.
  function deveMostrar() {
    return !jaDispensou() && !estaLogado() && !temProgresso();
  }

  // Primeira atividade ainda não concluída, na ordem das trilhas. Com fallback:
  // se SERVICOS_TRILHA não existir, cai pro primeiro DESAFIOS pendente.
  function primeiroDesafio() {
    try {
      if (typeof SERVICOS_TRILHA !== "undefined" && typeof desafiosDoServico === "function") {
        for (const s of SERVICOS_TRILHA) {
          const alvo = (desafiosDoServico(s) || []).find((d) => !desafioConcluido(d.id));
          if (alvo) return alvo;
        }
      }
      if (typeof DESAFIOS !== "undefined") return DESAFIOS.find((d) => !desafioConcluido(d.id)) || null;
    } catch (e) { /* qualquer coisa: segue sem seleção */ }
    return null;
  }

  // ---------- estilo ----------
  function injetarEstilo() {
    if (document.getElementById("capaEstilo")) return;
    const st = document.createElement("style");
    st.id = "capaEstilo";
    st.textContent = `
      body.capa-aberta { overflow: hidden; }
      #capa {
        position: fixed; inset: 0; z-index: 100000;
        background: var(--fundo, #10151f);
        overflow-y: auto; overscroll-behavior: contain;
        animation: capaEntra .35s ease both;
      }
      @keyframes capaEntra { from { opacity: 0 } to { opacity: 1 } }
      #capa.saindo { animation: capaSai .28s ease both; }
      @keyframes capaSai { from { opacity: 1 } to { opacity: 0; transform: scale(1.015) } }
      #capa .capa-brilho {
        position: absolute; top: -18rem; left: -12rem; width: 46rem; height: 46rem;
        background: radial-gradient(circle, rgba(255,153,0,.16), rgba(255,153,0,0) 70%);
        pointer-events: none;
      }
      #capa .capa-conteudo {
        position: relative; max-width: 68rem; margin: 0 auto;
        padding: clamp(1.5rem, 5vw, 3.5rem) clamp(1.2rem, 5vw, 2.5rem) 3rem;
      }
      #capa .capa-marca {
        font-size: 1.5rem; font-weight: 700; color: var(--laranja, #ff9900);
        letter-spacing: -.01em; margin-bottom: clamp(2rem, 7vw, 3.5rem);
      }
      #capa .capa-marca small {
        color: var(--texto-fraco, #8b99b0); font-weight: 500;
        font-size: .82rem; margin-left: .6rem;
      }
      #capa .capa-topo {
        display: grid; grid-template-columns: 1.05fr .95fr;
        gap: clamp(1.5rem, 4vw, 3rem); align-items: center;
      }
      #capa h1 {
        font-size: clamp(2rem, 6vw, 3.1rem); line-height: 1.08;
        letter-spacing: -.02em; margin: 0 0 1rem; color: var(--texto, #dce3ee);
      }
      #capa h1 em { color: var(--laranja, #ff9900); font-style: normal; display: block; }
      #capa .capa-sub {
        color: var(--texto-fraco, #8b99b0); font-size: clamp(1rem, 2.3vw, 1.12rem);
        line-height: 1.6; margin: 0 0 1.8rem; max-width: 34rem;
      }
      #capa .capa-acoes { display: flex; flex-wrap: wrap; gap: .8rem; align-items: center; }
      #capa .capa-cta {
        background: var(--laranja, #ff9900); color: #10151f; border: 0;
        font-size: 1.02rem; font-weight: 700; padding: .95rem 1.7rem;
        border-radius: .6rem; cursor: pointer;
        transition: transform .12s ease, filter .12s ease;
      }
      #capa .capa-cta:hover { filter: brightness(1.08); transform: translateY(-1px); }
      #capa .capa-cta:active { transform: translateY(0); }
      #capa .capa-link {
        background: none; border: 0; cursor: pointer; padding: .95rem .6rem;
        color: var(--texto-fraco, #8b99b0); font-size: .95rem;
        text-decoration: underline; text-underline-offset: 3px;
      }
      #capa .capa-link:hover { color: var(--texto, #dce3ee); }
      #capa .capa-gratis {
        display: block; margin-top: .9rem;
        color: var(--texto-fraco, #8b99b0); font-size: .85rem;
      }
      /* terminal demo */
      #capa .capa-term {
        background: var(--painel, #161e2d); border: 1px solid var(--borda, #2a3650);
        border-radius: .7rem; overflow: hidden; box-shadow: 0 1.2rem 3rem rgba(0,0,0,.35);
      }
      #capa .capa-term-barra {
        background: var(--painel-2, #1c2638); padding: .6rem .9rem;
        display: flex; align-items: center; gap: .4rem;
        border-bottom: 1px solid var(--borda, #2a3650);
      }
      #capa .capa-bola { width: .7rem; height: .7rem; border-radius: 50%; }
      #capa .capa-term-titulo {
        flex: 1; text-align: center; font-size: .75rem;
        color: var(--texto-fraco, #8b99b0); font-family: var(--fonte-mono, monospace);
      }
      #capa .capa-term-corpo {
        font-family: var(--fonte-mono, monospace); font-size: .84rem; line-height: 1.75;
        padding: 1rem 1.1rem; min-height: 13rem; white-space: pre-wrap; word-break: break-word;
      }
      #capa .capa-term-corpo .p { color: var(--laranja, #ff9900); }
      #capa .capa-term-corpo .ok { color: var(--verde, #3ecf6f); }
      #capa .capa-term-corpo .dim { color: var(--texto-fraco, #8b99b0); }
      #capa .capa-cursor {
        display: inline-block; width: .55em; height: 1.05em; vertical-align: -.18em;
        background: var(--laranja, #ff9900); animation: capaPisca 1.05s step-end infinite;
      }
      @keyframes capaPisca { 50% { opacity: 0 } }
      /* três blocos */
      #capa .capa-blocos {
        display: grid; grid-template-columns: repeat(3, 1fr);
        gap: 1rem; margin-top: clamp(2.5rem, 7vw, 4rem);
      }
      #capa .capa-bloco {
        background: var(--painel, #161e2d); border: 1px solid var(--borda, #2a3650);
        border-radius: .7rem; padding: 1.3rem;
      }
      #capa .capa-bloco h2 {
        font-size: 1rem; margin: .6rem 0 .5rem; color: var(--texto, #dce3ee);
      }
      #capa .capa-bloco p {
        margin: 0; font-size: .9rem; line-height: 1.6; color: var(--texto-fraco, #8b99b0);
      }
      #capa .capa-bloco code {
        font-family: var(--fonte-mono, monospace); font-size: .85em;
        color: var(--laranja, #ff9900);
      }
      #capa .capa-icone { font-size: 1.5rem; }
      #capa .capa-rodape {
        margin-top: 2.5rem; padding-top: 1.3rem; border-top: 1px solid var(--borda, #2a3650);
        color: var(--texto-fraco, #8b99b0); font-size: .78rem; line-height: 1.6;
      }
      @media (max-width: 860px) {
        #capa .capa-topo { grid-template-columns: 1fr; }
        #capa .capa-blocos { grid-template-columns: 1fr; }
        #capa .capa-marca { margin-bottom: 1.5rem; }
      }
      @media (prefers-reduced-motion: reduce) {
        #capa, #capa.saindo { animation: none; }
        #capa .capa-cursor { animation: none; }
      }
    `;
    document.head.appendChild(st);
  }

  // ---------- animação de digitação ----------
  // Roteiro real do simulador: comando, resposta, comando, resposta. Mostra que
  // o estado PERSISTE (cria o bucket, depois lista e ele está lá) — que é
  // exatamente o que diferencia isso de um quiz.
  const ROTEIRO = [
    { tipo: "cmd", texto: "aws s3 mb s3://loja-relatorios" },
    { tipo: "ok", texto: "make_bucket: loja-relatorios" },
    { tipo: "vazio" },
    { tipo: "cmd", texto: "aws s3 ls" },
    { tipo: "dim", texto: "2026-08-21 09:14:02  loja-relatorios" },
    { tipo: "vazio" },
    { tipo: "cmd", texto: "aws ec2 run-instances --image-id ami-0c55b6 \\" },
    { tipo: "cmd-cont", texto: "  --instance-type t2.micro" },
    { tipo: "dim", texto: '  "InstanceId": "i-0a1b2c3d4e",' },
    { tipo: "ok", texto: '  "State": { "Name": "pending" }' },
  ];

  function animarTerminal(alvo) {
    const reduzido = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cursor = '<span class="capa-cursor" aria-hidden="true"></span>';

    function linhaHtml(item, parcial) {
      const t = parcial === undefined ? item.texto : parcial;
      if (item.tipo === "vazio") return "";
      if (item.tipo === "cmd") return '<span class="p">climb $ </span>' + t;
      if (item.tipo === "cmd-cont") return t;
      if (item.tipo === "ok") return '<span class="ok">' + t + "</span>";
      return '<span class="dim">' + t + "</span>";
    }

    // Sem animação: entrega o roteiro pronto. Mesma informação, zero movimento.
    if (reduzido) {
      alvo.innerHTML = ROTEIRO.map((i) => linhaHtml(i)).join("\n") + "\n" + '<span class="p">climb $ </span>' + cursor;
      return;
    }

    let linhas = [];
    let i = 0;
    let parado = false;
    alvo._pararCapa = () => { parado = true; };

    function pintar(parcialHtml) {
      alvo.innerHTML = linhas.join("\n") + (linhas.length ? "\n" : "") + (parcialHtml || "");
    }

    function proxima() {
      if (parado) return;
      if (i >= ROTEIRO.length) {
        pintar('<span class="p">climb $ </span>' + cursor);
        return;
      }
      const item = ROTEIRO[i++];
      // Só os comandos são "digitados"; as respostas aparecem inteiras, como
      // acontece de verdade num terminal.
      if (item.tipo !== "cmd" && item.tipo !== "cmd-cont") {
        linhas.push(linhaHtml(item));
        pintar(cursor);
        setTimeout(proxima, item.tipo === "vazio" ? 120 : 420);
        return;
      }
      let n = 0;
      (function digitar() {
        if (parado) return;
        n++;
        pintar(linhaHtml(item, item.texto.slice(0, n)) + cursor);
        if (n < item.texto.length) setTimeout(digitar, 26 + Math.random() * 34);
        else { linhas.push(linhaHtml(item)); setTimeout(proxima, 320); }
      })();
    }
    setTimeout(proxima, 450);
  }

  // ---------- montagem ----------
  // Contados na hora, nao escritos na mao: a capa ja anunciou "599 atividades
  // em 62 trilhas" por dias depois de o app ter 630 em 63. Numero cravado em
  // texto de marketing envelhece calado.
  function contarAtividades() {
    try { return DESAFIOS.length + " atividades"; } catch (e) { return "centenas de atividades"; }
  }
  function contarTrilhas() {
    // SERVICOS_META e o que a lista lateral desenha. Contar `servico` distinto
    // em DESAFIOS daria 2 a mais (bedrock-runtime e treino tem atividade mas
    // nao viram trilha propria) — anunciar numero que a pessoa nao consegue
    // conferir na tela e pior do que nao anunciar.
    try {
      if (typeof SERVICOS_META !== "undefined") return SERVICOS_META.length + " trilhas";
      return new Set(DESAFIOS.map((d) => d.servico)).size + " trilhas";
    } catch (e) { return "dezenas de trilhas"; }
  }

  function montar() {
    injetarEstilo();
    const nAtividades = contarAtividades();
    const nTrilhas = contarTrilhas();
    const capa = document.createElement("section");
    capa.id = "capa";
    capa.setAttribute("aria-label", "Apresentação do CLImb");
    capa.innerHTML = `
      <div class="capa-brilho" aria-hidden="true"></div>
      <div class="capa-conteudo">
        <div class="capa-marca">⚡ CLImb <small>climb.dev.br</small></div>

        <div class="capa-topo">
          <div>
            <h1>Aprenda AWS CLI<em>digitando de verdade.</em></h1>
            <p class="capa-sub">
              Um simulador de terminal com <b>${nAtividades}</b> em <b>${nTrilhas}</b>.
              Você digita os comandos reais e o estado persiste entre eles —
              não é quiz, não é vídeo.
            </p>
            <div class="capa-acoes">
              <button type="button" class="capa-cta" id="capaComecar">Começar agora</button>
              <button type="button" class="capa-link" id="capaEntrar">já tenho conta</button>
            </div>
            <span class="capa-gratis">
              Grátis pra começar, sem cartão. Seu progresso salva no navegador.
            </span>
          </div>

          <div class="capa-term">
            <div class="capa-term-barra" aria-hidden="true">
              <span class="capa-bola" style="background:#ff5f57"></span>
              <span class="capa-bola" style="background:#febc2e"></span>
              <span class="capa-bola" style="background:#28c840"></span>
              <span class="capa-term-titulo">terminal</span>
            </div>
            <div class="capa-term-corpo" id="capaTerm" role="img"
                 aria-label="Demonstração: os comandos aws s3 mb, aws s3 ls e aws ec2 run-instances sendo executados no simulador"></div>
          </div>
        </div>

        <div class="capa-blocos">
          <div class="capa-bloco">
            <div class="capa-icone" aria-hidden="true">⌨️</div>
            <h2>Terminal, não múltipla escolha</h2>
            <p>Você digita <code>aws s3 mb s3://loja</code> e o bucket passa a existir.
               Errou a flag? O erro que aparece é o mesmo que a AWS devolveria.</p>
          </div>
          <div class="capa-bloco">
            <div class="capa-icone" aria-hidden="true">🧭</div>
            <h2>Trilhas com o “por quê”</h2>
            <p>De S3 e IAM a VPC, Lambda e CloudWatch. Cada comando vem com a
               explicação de por que ele existe — não só o que digitar.</p>
          </div>
          <div class="capa-bloco">
            <div class="capa-icone" aria-hidden="true">🧯</div>
            <h2>Infra quebrada de propósito</h2>
            <p>Na trilha <b>Diagnóstico</b> a infraestrutura chega com defeito e
               você tem que achar a causa nos logs — como no trabalho.</p>
          </div>
        </div>

        <p class="capa-rodape">
          Projeto independente e educativo, <b>sem afiliação, patrocínio ou endosso</b> da Amazon.
          “AWS” e “Amazon Web Services” são marcas registradas da Amazon.com, Inc. ou de suas
          afiliadas. É um simulador — não conecta a nenhuma conta AWS real.
        </p>
      </div>
    `;
    document.body.appendChild(capa);
    document.body.classList.add("capa-aberta");

    const term = capa.querySelector("#capaTerm");
    if (term) animarTerminal(term);

    capa.querySelector("#capaComecar").addEventListener("click", () => fechar(true));
    capa.querySelector("#capaEntrar").addEventListener("click", () => {
      fechar(false);
      // o botão de conta é injetado por outro arquivo; se não estiver lá, só fecha
      setTimeout(() => document.querySelector("#btnConta")?.click(), 320);
    });

    // Esc fecha (sem selecionar atividade)
    capa.addEventListener("keydown", (ev) => { if (ev.key === "Escape") fechar(false); });
    setTimeout(() => capa.querySelector("#capaComecar")?.focus(), 120);
  }

  function fechar(irParaAtividade) {
    const capa = document.getElementById("capa");
    if (!capa) return;
    marcarDispensada();
    document.getElementById("capaTerm")?._pararCapa?.();
    capa.classList.add("saindo");
    document.body.classList.remove("capa-aberta");
    setTimeout(() => {
      capa.remove();
      if (irParaAtividade) {
        const d = primeiroDesafio();
        if (d && typeof selecionarDesafio === "function") selecionarDesafio(d.id);
      }
    }, 280);
  }

  // Espera o DOM; o `jogo` já foi carregado por app.js no DOMContentLoaded, então
  // rodamos logo depois pra que temProgresso() enxergue o progresso restaurado.
  function iniciar() { if (deveMostrar()) montar(); }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(iniciar, 60));
  } else {
    setTimeout(iniciar, 60);
  }

  // exposto pro botão "ver a apresentação de novo", se um dia quisermos
  window.abrirCapa = function () {
    if (!document.getElementById("capa")) montar();
  };
})();
