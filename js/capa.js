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
// ============================================================
// FORA do IIFE de propósito: o servidor lê estas duas coisas (sandbox sem
// window, onde o IIFE abaixo sai na hora) e entrega a capa JÁ PRONTA no
// index.html pra quem chega novo — ver capaPronta() no servidor.js. Uma fonte
// só: a capa do servidor e a montada aqui no navegador são a mesma.
// ============================================================
var CAPA_ESTILO = `
      body.capa-aberta { overflow: hidden; }
      /* Antes do estilo.css chegar, o app por trás (invisível, mas ocupando
         lugar) fica sem estilo e mais largo que a tela; o celular então
         diminuía o zoom pra caber tudo, e a capa aparecia cortada. Com a capa
         aberta, a página não passa da largura da tela. */
      html:has(> body.capa-aberta), body.capa-aberta { overflow: hidden; max-width: 100%; }
      body.capa-aberta > header, body.capa-aberta > main, body.capa-aberta > footer { max-width: 100vw; overflow: hidden; }
      /* O app se monta POR TRÁS da capa. Coberto, mas pintado: o navegador
         não sabe que está escondido, então o terminal e a lateral viravam o
         "maior elemento" (LCP no fim da carga, ~6 s, em vez do título da capa
         a ~0,9 s) e cada deslocamento da montagem contava no CLS. Invisível,
         ele não conta pra nenhum dos dois — e já era aria-hidden + inert. */
      body.capa-aberta > header, body.capa-aberta > main, body.capa-aberta > footer,
      body.capa-aberta > .aviso-marca, body.capa-aberta > .rodape-licoes { visibility: hidden; }
      #capa {
        position: fixed; inset: 0; z-index: 100000;
        background: var(--fundo, #10151f);
        /* a capa pinta ANTES do estilo.css chegar (o servidor põe as folhas
           depois dela): fonte e cor dela não podem depender de lá */
        font-family: "Segoe UI", system-ui, sans-serif; color: var(--texto, #dce3ee);
        line-height: 1.5; -webkit-text-size-adjust: 100%;
        overflow-y: auto; overscroll-behavior: contain;
        /* o brilho decorativo (46rem, saindo pela esquerda) alargava a página
           no celular enquanto o estilo.css não chegava (é ele que corta o
           transbordo lateral do app) */
        overflow-x: hidden;
      }
      /* Sem animação de ENTRADA de propósito. Ela começava em opacity 0, e o
         que é pintado transparente não conta como LCP: o título da capa nunca
         virava o "maior elemento", e o LCP caía nas linhas que o terminal de
         demonstração ia escrevendo até os 8 s (medido em 04/10/2026). A saída
         continua animada: ela responde ao clique da pessoa. */
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
      #capa button { font-family: inherit; }
      /* o estilo.css aplica border-box a tudo; sem isto, antes de ele chegar,
         o padding somava na largura (no celular o texto transbordava) e tudo
         pulava ~30px quando ele chegava */
      #capa, #capa *, #capa *::before, #capa *::after { box-sizing: border-box; }
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
        color: var(--texto-fraco, #8b99b0); font-family: var(--fonte-mono, "Cascadia Code", Consolas, monospace);
      }
      #capa .capa-term-corpo {
        font-family: var(--fonte-mono, "Cascadia Code", Consolas, monospace); font-size: .84rem; line-height: 1.75;
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
      /* o primeiro minuto: sequência real, por isso numerada */
      #capa .capa-passos-titulo {
        font-size: 1rem; font-weight: 600; color: var(--texto, #dce3ee);
        margin: clamp(2.5rem, 7vw, 4rem) 0 1rem;
      }
      #capa .capa-passos {
        list-style: none; counter-reset: passo; margin: 0; padding: 0;
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.6rem;
      }
      #capa .capa-passos li {
        counter-increment: passo; position: relative; padding-top: 2.4rem;
        border-top: 1px solid var(--borda, #2a3650);
        font-size: .92rem; line-height: 1.6; color: var(--texto-fraco, #8b99b0);
      }
      #capa .capa-passos li::before {
        content: counter(passo); position: absolute; top: .7rem; left: 0;
        font-family: var(--fonte-mono, "Cascadia Code", Consolas, monospace); font-weight: 700; color: var(--laranja, #ff9900);
      }
      #capa .capa-passos b { display: block; color: var(--texto, #dce3ee); font-size: 1rem; margin-bottom: .3rem; }
      #capa .capa-passos code {
        font-family: var(--fonte-mono, "Cascadia Code", Consolas, monospace); font-size: .85em; color: var(--laranja, #ff9900);
      }
      #capa .capa-rodape a { color: var(--texto-fraco, #8b99b0); text-underline-offset: 3px; }
      #capa .capa-rodape a:hover { color: var(--texto, #dce3ee); }
      #capa .capa-rodape {
        margin-top: 2.5rem; padding-top: 1.3rem; border-top: 1px solid var(--borda, #2a3650);
        color: var(--texto-fraco, #8b99b0); font-size: .78rem; line-height: 1.6;
      }
      @media (max-width: 860px) {
        #capa .capa-topo { grid-template-columns: 1fr; }
        #capa .capa-passos { grid-template-columns: 1fr; gap: 1.1rem; }
        #capa .capa-marca { margin-bottom: 1.5rem; }
      }
      @media (prefers-reduced-motion: reduce) {
        #capa, #capa.saindo { animation: none; }
        #capa .capa-cursor { animation: none; }
      }
    `;

function capaMarcacao(nAtividades, nTrilhas) {
  return `
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

        <!-- O que acontece no primeiro minuto, na ordem: é a abertura.js que
             vem depois do "Começar agora". Substituiu três cards genéricos de
             "vantagens": mostrar o caminho convence mais que listar adjetivo. -->
        <h2 class="capa-passos-titulo">O seu primeiro minuto</h2>
        <ol class="capa-passos">
          <li><b>Chega um pedido.</b> O Rafa, do time, precisa de um bucket no S3 pro site
            novo, do jeito que um pedido chega no trabalho.</li>
          <li><b>Você digita o comando.</b> Não sabe qual é? <code>aws s3 help</code> abre o
            manual. Errou a flag? O terminal mostra o erro e o que faltou.</li>
          <li><b>A tela se monta.</b> O bucket existe, você ganha XP e as trilhas aparecem.
            Daí pra frente é igual: pedido, comando, resultado.</li>
        </ol>

        <p class="capa-rodape">
          <a href="/aprender">Lições de AWS</a> · <a href="/sobre.html">O que o CLImb ensina</a> ·
          <a href="/escolas">Para escolas</a><br>
          Projeto independente e educativo, <b>sem afiliação, patrocínio ou endosso</b> da Amazon.
          “AWS” e “Amazon Web Services” são marcas registradas da Amazon.com, Inc. ou de suas
          afiliadas. É um simulador — não conecta a nenhuma conta AWS real.
        </p>
      </div>
    `;
}

(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const CHAVE = "awsCliQuest.capa.v1";
  const CHAVE_TOKEN = "awsCliQuest.token";

  function jaDispensou() {
    try { return localStorage.getItem(CHAVE) === "1"; } catch (e) { return false; }
  }
  function marcarDispensada() {
    try { localStorage.setItem(CHAVE, "1"); } catch (e) { /* modo anônimo: tudo bem */ }
    marcarCookie();
  }
  // O servidor manda a capa pronta no HTML pra quem NÃO tem este cookie. Ele
  // é gravado quando a pessoa dispensa a capa, ou quando ela não deveria ver
  // (já tem progresso ou conta). Cookie funcional, sem rastreio: só diz "já viu".
  function marcarCookie() {
    try { document.cookie = "climb_capa=1; Max-Age=31536000; Path=/; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : ""); } catch (e) { /* ok */ }
  }
  function estaLogado() {
    try { return !!localStorage.getItem(CHAVE_TOKEN); } catch (e) { return false; }
  }
  // A capa roda ANTES do app (é o 2º script da lista, logo depois do
  // pronto.js), então o `jogo` ainda não existe: o progresso de quem não tem
  // conta é lido direto do save local (awsCliQuest.v1, o mesmo do jogo.js).
  function temProgresso() {
    try {
      if (typeof jogo !== "undefined" && jogo) return Object.keys(jogo.concluidos || {}).length > 0;
      const salvo = JSON.parse(localStorage.getItem("awsCliQuest.v1") || "null");
      return !!(salvo && salvo.concluidos && Object.keys(salvo.concluidos).length);
    } catch (e) { return false; }
  }

  // Pronto pra receber o clique = todos os scripts rodaram e o app.js montou.
  // Antes disso, "Começar agora" espera em vez de falhar calado: a capa agora
  // aparece cedo (antes dos ~110 arquivos do app), e em rede lenta dá pra
  // clicar antes de selecionarDesafio existir.
  let appCarregado = document.readyState === "complete";
  if (!appCarregado) document.addEventListener("DOMContentLoaded", () => setTimeout(() => { appCarregado = true; }, 60));
  function quandoApp(fn) {
    if (appCarregado) return fn();
    const t = setInterval(() => { if (appCarregado) { clearInterval(t); fn(); } }, 100);
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
    if (document.getElementById("capaEstilo")) return; // inclui a que veio no HTML
    const st = document.createElement("style");
    st.id = "capaEstilo";
    st.textContent = CAPA_ESTILO;;
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

    // Cada linha é um elemento próprio. Num bloco só, o texto crescia a cada
    // letra e cada crescimento virava um LCP novo: o "maior elemento" da capa
    // só parava de mudar quando a animação acabava (7 a 8 s em 4G lento,
    // medido em 04/10/2026). Linha a linha, nenhuma passa do título.
    const emLinha = (html) => '<div class="capa-linha">' + (html || "&nbsp;") + "</div>";

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
      alvo.innerHTML = ROTEIRO.map((i) => emLinha(linhaHtml(i))).join("") + emLinha('<span class="p">climb $ </span>' + cursor);
      return;
    }

    let linhas = [];
    let i = 0;
    let parado = false;
    alvo._pararCapa = () => { parado = true; };

    function pintar(parcialHtml) {
      alvo.innerHTML = linhas.map(emLinha).join("") + (parcialHtml ? emLinha(parcialHtml) : "");
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
  // Cedo demais pra contar DESAFIOS: o servidor escreve os números no <body>
  // (data-atividades / data-trilhas, contados do mesmo conteúdo) ao servir o
  // index.html. Sem eles (arquivo aberto direto, servidor antigo), conta na hora.
  const milhar = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  function contarAtividades() {
    const n = parseInt(document.body.dataset.atividades, 10);
    if (n > 0) return milhar(n) + " atividades";
    try { return milhar(DESAFIOS.length) + " atividades"; } catch (e) { return "centenas de atividades"; }
  }
  function contarTrilhas() {
    const n = parseInt(document.body.dataset.trilhas, 10);
    if (n > 0) return n + " trilhas";
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
    capa.innerHTML = capaMarcacao(nAtividades, nTrilhas);;
    document.body.appendChild(capa);
    hidratar(capa);
  }

  // Liga a capa: a que o servidor mandou pronta ou a montada acima.
  function hidratar(capa) {
    injetarEstilo();
    document.body.classList.add("capa-aberta");
    esconderAppAtras(true);

    const term = capa.querySelector("#capaTerm");
    if (term) animarTerminal(term);

    // Se o app ainda está chegando, o botão avisa e o clique é atendido assim
    // que der: nunca se perde.
    function esperando(botao, fn) {
      if (appCarregado) return fn();
      botao.disabled = true; botao.setAttribute("aria-busy", "true");
      botao.textContent = "Abrindo…";
      quandoApp(fn);
    }
    const btnComecar = capa.querySelector("#capaComecar");
    btnComecar.addEventListener("click", () => esperando(btnComecar, () => fechar(true)));
    const btnEntrar = capa.querySelector("#capaEntrar");
    btnEntrar.addEventListener("click", () => esperando(btnEntrar, () => {
      fechar(false);
      // o botão de conta é injetado por outro arquivo; se não estiver lá, só fecha
      setTimeout(() => document.querySelector("#btnConta")?.click(), 320);
    }));

    // Esc fecha (sem selecionar atividade)
    capa.addEventListener("keydown", (ev) => { if (ev.key === "Escape") quandoApp(() => fechar(false)); });
    setTimeout(() => capa.querySelector("#capaComecar")?.focus(), 120);
  }

  // A capa cobre a tela inteira (fixed, inset 0), mas o app continuava ATRAS
  // dela na arvore de acessibilidade: leitor de tela lia o header, as 63
  // trilhas e o rodape que ninguem esta vendo, e o axe auditava tudo aquilo
  // (no PageSpeed de 13/09 as falhas de contraste vinham todas com o seletor
  // "body.capa-aberta > ..."). aria-hidden tira do leitor; inert tira do Tab.
  function esconderAppAtras(esconder) {
    document.querySelectorAll("body > header, body > main, body > footer, body > .aviso-marca").forEach((el) => {
      if (esconder) {
        el.setAttribute("aria-hidden", "true");
        el.inert = true;
      } else {
        el.removeAttribute("aria-hidden");
        el.inert = false;
      }
    });
  }

  function fechar(irParaAtividade) {
    const capa = document.getElementById("capa");
    if (!capa) return;
    marcarDispensada();
    esconderAppAtras(false);
    document.getElementById("capaTerm")?._pararCapa?.();
    capa.classList.add("saindo");
    document.body.classList.remove("capa-aberta");
    setTimeout(() => {
      capa.remove();
      if (irParaAtividade) {
        const d = primeiroDesafio();
        if (d && typeof selecionarDesafio === "function") selecionarDesafio(d.id);
        // Se a abertura não assumir a tela (já vista/recusada), no celular a
        // pessoa ainda cairia na LISTA de trilhas: o card fica abaixo da dobra.
        setTimeout(() => { if (!document.body.classList.contains("ab-modo")) mostrarAtividadeNoCelular(); }, 900);
      }
    }, 280);
  }

  // No celular (≤760px) o layout empilha header, lateral (46vh) e só então o
  // card: quem acabou de clicar "Começar" via a lista, não a atividade. Rola
  // até o card, descontando o header, que é sticky. No desktop não faz nada.
  function mostrarAtividadeNoCelular() {
    if (window.innerWidth > 760) return;
    const card = document.getElementById("cardDesafio");
    if (!card) return;
    const topo = document.querySelector("header")?.offsetHeight || 0;
    const y = card.getBoundingClientRect().top + window.scrollY - topo - 8;
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: Math.max(0, y), behavior: suave ? "smooth" : "auto" });
  }
  window.mostrarAtividadeNoCelular = mostrarAtividadeNoCelular;
  window.primeiroDesafioDaCapa = primeiroDesafio;

  // Monta JÁ, sem esperar o resto do app. Antes a capa vinha no fim da lista e
  // só aparecia depois dos ~110 arquivos: em 3G lento, ~20 s de tela vazia pra
  // quem nunca viu o CLImb (medido em 04/10/2026). Este arquivo é defer e roda
  // com o HTML já lido, então o <body> existe. O pronto.js não é afetado: ele
  // vigia header/main/footer, e a capa é irmã deles.
  function iniciar() {
    const pronta = document.getElementById("capa");
    if (pronta) {
      // veio do servidor: liga, ou tira se esta pessoa não deveria ver
      // (tem progresso ou conta mas ainda não tinha o cookie)
      if (deveMostrar()) hidratar(pronta);
      else { pronta.remove(); document.body.classList.remove("capa-aberta"); marcarCookie(); }
      return;
    }
    if (deveMostrar()) montar();
    else marcarCookie();
  }
  if (document.body) iniciar();
  else document.addEventListener("DOMContentLoaded", iniciar);

  // exposto pro botão "ver a apresentação de novo", se um dia quisermos
  window.abrirCapa = function () {
    if (!document.getElementById("capa")) montar();
  };
})();
