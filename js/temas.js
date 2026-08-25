"use strict";
// ============================================================
// CLImb — temas.js
// Escolha de pele: "Clássico" (o app como sempre foi) e "Nítido"
// (claro, tipografia IBM Plex, terminal escuro).
//
// POR QUE ISTO É BARATO: o app é ~89% token-driven. Dos 276 valores de cor
// cravados no CSS, 239 estão na emulação do Console AWS — que fica de fora
// de propósito, porque ela precisa parecer a AWS. Sobram uns 40, tratados
// pontualmente no css/tema-nitido.css.
//
// ADITIVO: não reescreve estilo.css. Liga/desliga por data-tema no <body>.
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const CHAVE = "awsCliQuest.tema.v1";
  const TEMAS = [
    { id: "classico", nome: "Clássico", desc: "escuro, como sempre foi" },
    { id: "claro", nome: "Claro", desc: "claro, terminal escuro" },
  ];

  function atual() {
    try {
      const v = localStorage.getItem(CHAVE);
      // "nitido" era o nome antigo; quem já tinha escolhido continua no claro
      return (v === "claro" || v === "nitido") ? "claro" : "classico";
    } catch (e) { return "classico"; }
  }

  function aplicar(id, avisar) {
    if (id === "claro") document.body.setAttribute("data-tema", "claro");
    else document.body.removeAttribute("data-tema");
    try { localStorage.setItem(CHAVE, id); } catch (e) { /* anônimo: só não lembra */ }

    // <meta name="theme-color"> pinta a barra do navegador no celular; deixá-la
    // escura num tema claro faz o app parecer cortado no topo.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", id === "claro" ? "#e6e9f0" : "#10151f");

    atualizarBotao();
    if (avisar && typeof toast === "function") {
      const t = TEMAS.find((x) => x.id === id);
      toast("🎨 Tema <strong>" + t.nome + "</strong> ativado.", "sucesso");
    }
  }

  function alternar() {
    aplicar(atual() === "claro" ? "classico" : "claro", true);
  }

  function atualizarBotao() {
    const b = document.getElementById("btnTema");
    if (!b) return;
    const proximo = TEMAS.find((t) => t.id !== atual());
    b.textContent = (atual() === "claro" ? "🌙" : "☀️") + " Tema: " + TEMAS.find((t) => t.id === atual()).nome;
    b.title = "Trocar para o tema " + proximo.nome + " (" + proximo.desc + ")";
  }

  function criarBotao() {
    if (document.getElementById("btnTema")) return;
    const rodape = document.querySelector("footer");
    if (!rodape) return;
    const b = document.createElement("button");
    b.type = "button";
    b.id = "btnTema";
    b.className = "botao secundario";
    b.addEventListener("click", alternar);
    rodape.appendChild(b);
    atualizarBotao();
  }

  function iniciar() {
    aplicar(atual(), false);   // antes de qualquer render, pra não piscar
    criarBotao();
    // o rodapé é remontado por outras features; garante que o botão volte
    const obs = new MutationObserver(() => criarBotao());
    const rodape = document.querySelector("footer");
    if (rodape) obs.observe(rodape, { childList: true });
  }

  // aplica o tema o quanto antes (mesmo antes do DOM pronto, se der) pra
  // evitar o flash de tema errado na primeira pintura
  try {
    if (document.body) aplicar(atual(), false);
  } catch (e) { /* body ainda não existe: o DOMContentLoaded abaixo resolve */ }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
