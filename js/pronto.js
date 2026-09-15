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
        requestAnimationFrame(function () { requestAnimationFrame(pronto); });
      }, QUIETO);
    }
    var obs = new MutationObserver(adiar);
    ["header", "main", "footer"].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) obs.observe(el, { childList: true, subtree: true });
    });
    adiar(); // comeca a contar mesmo que nada mude
  }

  // Dois quadros depois do DOM montado: o setTimeout(0) espera todos os outros
  // handlers de DOMContentLoaded, e os dois rAF esperam layout e pintura.
  function quandoMontado() {
    setTimeout(function () {
      requestAnimationFrame(function () { requestAnimationFrame(pronto); });
    }, 0);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", vigiar);
  } else {
    vigiar();
  }
})();
