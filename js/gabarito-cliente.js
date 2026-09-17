"use strict";
// ============================================================
// CLImb — gabarito-cliente.js
// Recebe de volta as `dicas` e a `solucao` que o servidor NÃO manda dentro dos
// arquivos de conteúdo (ver lib/sem-gabarito.js) e devolve aos objetos de
// DESAFIOS, por id.
//
// POR QUE ASSIM: o app é client-side, então até 17/09/2026 um `curl` num
// arquivo de trilha entregava as soluções das atividades pagas sem login. Agora
// o gabarito chega por dois canais:
//   · /js/gabarito.js  — as atividades ABERTAS (trilhas grátis, as 3 primeiras
//     de cada trilha e o Desafio do dia). É público, cacheável, e entra como
//     <script> normal no index.html.
//   · GET /api/gabarito — as PAGAS. Exige token e licença Pro, e vem por fetch
//     com o cabeçalho Authorization, não por <script src>: token em URL vaza no
//     histórico, no log do servidor e no Referer.
//
// ADITIVO: não reescreve nada: só completa objetos que já existem e pede pro
// card se redesenhar se a atividade aberta na tela foi uma das completadas.
// ============================================================
(function () {
  if (typeof window === "undefined") return;

  function porId() {
    const mapa = {};
    if (typeof DESAFIOS === "undefined") return mapa;
    for (const d of DESAFIOS) mapa[d.id] = d;
    return mapa;
  }

  // Completa os objetos e conta quantos foram. Não sobrescreve o que já veio
  // preenchido: se um dia o arquivo voltar a trazer o gabarito, o de lá vale.
  window.aplicarGabarito = function (mapa, rotulo) {
    if (!mapa) return 0;
    const alvo = porId();
    let aplicados = 0;
    for (const id of Object.keys(mapa)) {
      const d = alvo[id];
      if (!d) continue;
      const g = mapa[id];
      if (g.dicas && !d.dicas) d.dicas = g.dicas;
      if (g.solucao && !d.solucao) d.solucao = g.solucao;
      aplicados++;
    }
    // O card pode estar aberto numa atividade que acabou de receber as dicas —
    // sem redesenhar, o botão "💡 Dica" não apareceria até trocar de atividade.
    if (aplicados && typeof ui !== "undefined" && ui.desafioAtivo &&
        mapa[ui.desafioAtivo] && typeof renderCard === "function") {
      try { renderCard(); } catch (e) { /* card ainda não montou: tudo bem */ }
    }
    return aplicados;
  };

  // O script do gabarito público pode chegar antes deste arquivo (a ordem do
  // index.html manda, mas um dia alguém troca). Quem chega antes deixa na fila.
  (function esvaziarFila() {
    const fila = window.__gabaritoPendente || [];
    while (fila.length) {
      const [mapa, rotulo] = fila.shift();
      window.aplicarGabarito(mapa, rotulo);
    }
  })();

  // ---------- o gabarito das atividades pagas ----------
  let pedido = null;

  function buscarPago() {
    if (pedido) return pedido;
    if (typeof api === "undefined" || !api.token) return Promise.resolve(0);
    pedido = fetch("/api/gabarito", { headers: { Authorization: "Bearer " + api.token } })
      .then(function (r) {
        if (r.status === 402 || r.status === 403) return null; // sem plano: silêncio
        if (!r.ok) throw new Error("gabarito: HTTP " + r.status);
        return r.json();
      })
      .then(function (dados) {
        if (!dados || !dados.gabarito) return 0;
        const n = window.aplicarGabarito(dados.gabarito, "pago");
        if (typeof renderSidebar === "function") {
          try { renderSidebar(); } catch (e) { /* ok */ }
        }
        return n;
      })
      .catch(function () {
        pedido = null; // deixa tentar de novo no próximo login/refresh
        return 0;
      });
    return pedido;
  }

  window.buscarGabaritoPago = buscarPago;

  // Quem tem licença Pro busca assim que a sessão é conhecida. O app.js resolve
  // a licença dentro do iniciar(), então esperamos o load e olhamos o api.
  function quandoSouber() {
    if (typeof api === "undefined") return;
    const pro = api.licenca && api.licenca.pro;
    if (pro) buscarPago();
  }
  if (document.readyState === "complete") setTimeout(quandoSouber, 0);
  else window.addEventListener("load", quandoSouber);

  // Depois de entrar na conta ou resgatar um código, a licença muda sem
  // recarregar a página — por isso a checagem também roda em intervalo curto e
  // some sozinha quando consegue (ou quando fica claro que não é Pro).
  let tentativas = 0;
  const olho = setInterval(function () {
    tentativas++;
    if (tentativas > 60) return clearInterval(olho); // ~2 min e desiste
    if (typeof api === "undefined" || !api.token) return;
    if (api.licenca && api.licenca.pro) {
      clearInterval(olho);
      buscarPago();
    }
  }, 2000);
})();
