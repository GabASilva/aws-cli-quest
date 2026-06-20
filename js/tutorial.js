"use strict";
// ============================================================
// AWS CLI Quest — tutorial.js
// Tour guiado (coachmarks) que aparece no 1º acesso e ensina a jogar.
// Botão "❔ Como jogar" no rodapé pra rever. ADITIVO: não toca o core.
// ============================================================

(function () {
  if (typeof window === "undefined") return;
  const CHAVE = "awsCliQuest.tutorial.v1";

  const PASSOS = [
    { texto: "Bem-vindo(a)! Aqui você aprende a usar a AWS <b>fazendo</b> — digitando comandos num terminal simulado. Deixa eu te mostrar em 30 segundos 👇" },
    { sel: "#sidebar", titulo: "1. Escolha um desafio", texto: "Tudo começa nesta lista. Clique numa trilha pra abrir e escolha um desafio. Comece por <b>Primeiros passos</b> ou <b>Linux essencial</b>." },
    { sel: "#cardDesafio", titulo: "2. Leia o objetivo", texto: "O que você precisa fazer aparece neste cartão — ele diz exatamente o resultado esperado." },
    { sel: "#terminal", titulo: "3. Digite no terminal", texto: "Escreva o comando aqui e aperte <b>Enter</b>. Tente <code>aws help</code> pra ver os serviços ou <code>ls</code> pros arquivos. O <b>Tab</b> completa os comandos!" },
    { sel: "#cardDesafio", titulo: "4. Travou? Sem pânico", texto: "Cada desafio tem 💡 <b>Dicas grátis</b>. Os <b>manuais</b> (ex.: <code>aws s3 help</code>) mostram os comandos. O <b>Revelar resposta</b> entrega tudo, mas zera o XP — use só no aperto." },
    { sel: "#streakBox", titulo: "5. Ganhe XP e suba de nível", texto: "Cada acerto dá XP. Acertos seguidos formam uma <b>sequência</b> 🔥 que rende bônus. Dá pra competir no <b>Ranking</b>!" },
    { texto: "É isso! 🎉 Escolha um desafio e mão na massa. Pra rever, clique em <b>❔ Como jogar</b> no rodapé. Bons estudos!" },
  ];

  let i = 0;
  let overlay, spot, box;

  function criarElementos() {
    overlay = document.createElement("div");
    overlay.id = "tourOverlay";
    spot = document.createElement("div");
    spot.id = "tourSpot";
    box = document.createElement("div");
    box.id = "tourBox";
    overlay.appendChild(spot);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    window.addEventListener("resize", reposicionar);
  }

  function mostrar() {
    const p = PASSOS[i];
    const alvo = p.sel ? document.querySelector(p.sel) : null;
    if (alvo) {
      try { alvo.scrollIntoView({ block: "nearest" }); } catch (e) { /* ok */ }
      const r = alvo.getBoundingClientRect();
      const pad = 6;
      Object.assign(spot.style, { display: "block", left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
    } else {
      Object.assign(spot.style, { display: "block", left: "50%", top: "50%", width: "0px", height: "0px" });
    }
    box.innerHTML =
      (p.titulo ? `<h3>${p.titulo}</h3>` : "") +
      `<p>${p.texto}</p>` +
      `<div class="tour-acoes">
        <button class="tour-pular" type="button">Pular</button>
        <div class="tour-nav">
          ${i > 0 ? '<button class="tour-voltar" type="button">Voltar</button>' : ""}
          <span class="tour-passo">${i + 1}/${PASSOS.length}</span>
          <button class="botao tour-prox" type="button">${i === PASSOS.length - 1 ? "Começar! 🚀" : "Próximo"}</button>
        </div>
      </div>`;
    posicionarBox(alvo);
    box.querySelector(".tour-pular").onclick = fim;
    const v = box.querySelector(".tour-voltar");
    if (v) v.onclick = () => { i--; mostrar(); };
    box.querySelector(".tour-prox").onclick = () => { if (i === PASSOS.length - 1) fim(); else { i++; mostrar(); } };
  }

  function posicionarBox(alvo) {
    box.style.display = "block";
    box.style.width = Math.min(320, window.innerWidth - 24) + "px";
    const bh = box.offsetHeight || 170;
    const bw = box.offsetWidth || 320;
    let left, top;
    if (alvo) {
      const r = alvo.getBoundingClientRect();
      top = r.bottom + 12;
      if (top + bh > window.innerHeight - 10) top = Math.max(10, r.top - bh - 12);
      left = Math.min(Math.max(10, r.left), window.innerWidth - bw - 10);
    } else {
      left = (window.innerWidth - bw) / 2;
      top = (window.innerHeight - bh) / 2;
    }
    box.style.left = left + "px";
    box.style.top = top + "px";
  }

  function reposicionar() { if (overlay) mostrar(); }

  function fim() {
    if (overlay) overlay.remove();
    overlay = null;
    window.removeEventListener("resize", reposicionar);
    try { localStorage.setItem(CHAVE, "1"); } catch (e) { /* ok */ }
  }

  function iniciar() {
    i = 0;
    if (!overlay) criarElementos();
    mostrar();
  }

  document.addEventListener("DOMContentLoaded", () => {
    // botão "Como jogar" no rodapé
    const footer = document.querySelector("footer");
    if (footer && !document.querySelector("#btnComoJogar")) {
      const b = document.createElement("button");
      b.id = "btnComoJogar";
      b.className = "botao secundario";
      b.textContent = "❔ Como jogar";
      footer.insertBefore(b, footer.firstChild);
      b.addEventListener("click", iniciar);
    }
    // auto-abre no primeiro acesso (espera a app montar)
    let visto = false;
    try { visto = localStorage.getItem(CHAVE) === "1"; } catch (e) { /* ok */ }
    if (!visto) setTimeout(iniciar, 700);
  });

  window.iniciarTutorial = iniciar;
})();
