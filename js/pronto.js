"use strict";
// ============================================================
// CLImb — pronto.js
// PROBLEMA (medido em 15/09): com os scripts em defer a pagina passou a pintar
// aos ~250 ms, mas a interface so termina de se montar aos ~480 ms — e tudo que
// o JS acrescenta nesse meio (o botao ☰ do celular, a barra do "Desafio do
// dia", o card da atividade, o botao "Novidades") empurrava o que ja estava na
// tela. Deu 0,73 de CLS: a pagina tremia inteira na frente de quem chegava.
//
// Em vez de tentar reservar caixa por caixa (o header nao so cresce: ele se
// REORGANIZA no celular), a montagem fica invisivel e aparece pronta. Elemento
// invisivel nao entra na conta do CLS, e aparecer nao e deslocar.
//
// Este arquivo e o PRIMEIRO da lista de propósito: a rede de seguranca abaixo
// precisa existir antes de qualquer outro script poder quebrar.
// ADITIVO: so liga/desliga a classe .app-pronto no <body>.
// ============================================================
(function () {
  if (typeof document === "undefined") return;

  var marcado = false;
  function pronto() {
    if (marcado) return;
    marcado = true;
    document.body.classList.add("app-pronto");
  }
  window.__appPronto = pronto;

  // Rede de seguranca / teto: o iniciar() do app.js e async e ESPERA a rede
  // (apiIniciar) antes de montar a tela. Se o backend demorar — ou se qualquer
  // script depois deste quebrar —, a tela aparece assim mesmo. Tela meio
  // montada e ruim; tela em branco e inaceitavel.
  var TETO = 2000;
  var QUIETO = 150; // sem mexer no DOM por este tempo = montagem terminou
  setTimeout(pronto, TETO);

  // Nao da pra cravar UM momento: a interface se monta em etapas (app.js depois
  // da resposta da API, missoes.js a barra do dia, menus.js o ☰ do celular).
  // Entao esperamos o DOM ficar QUIETO: cada mudanca em header/main/footer
  // reinicia a contagem, e o primeiro respiro de 150 ms significa "acabou".
  function vigiar() {
    if (typeof MutationObserver !== "function") { quandoMontado(); return; }
    var timer = null;
    function adiar() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        obs.disconnect();
        pronto();
      }, QUIETO);
    }
    var obs = new MutationObserver(adiar);
    ["header", "main", "footer"].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) obs.observe(el, { childList: true, subtree: true });
    });
    // NAO comecamos a contar aqui de proposito. A contagem so vale depois da
    // PRIMEIRA mudanca: silencio antes da montagem comecar nao e "acabou", e
    // confundir os dois foi o defeito da primeira versao deste arquivo — ela
    // liberava a tela aos 209 ms, antes de a interface ser desenhada (aos
    // 272 ms), e o CLS voltava inteiro. Se nada mudar nunca, o TETO resolve.
  }

  // Dois quadros depois do DOM montado: o setTimeout(0) espera todos os outros
  // handlers de DOMContentLoaded, e os dois rAF esperam layout e pintura.
  // Sem requestAnimationFrame aqui, e isso NAO e detalhe: enquanto a tela esta
  // invisivel o navegador nao tem o que pintar, nao gera quadro nenhum e o rAF
  // simplesmente nunca dispara. A primeira versao deste arquivo esperava dois
  // rAF pra liberar — e por isso ficava travada ate o TETO, custando ~2 s de
  // tela vazia em producao (FCP 0,3 s -> 2,2 s na v131).
  function quandoMontado() {
    setTimeout(pronto, 0);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", vigiar);
  } else {
    vigiar();
  }
})();
