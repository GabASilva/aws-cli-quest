"use strict";
// ============================================================
// AWS CLI Quest — conquistas.js
// Medalhas por marcos. Botão "🏅 Conquistas" + modal.
// NÃO altera o core: faz "wrap" da global salvarJogo() pra checar a cada
// progresso, e deriva tudo do estado global `jogo`. O que já foi desbloqueado
// fica num localStorage próprio (só pra não repetir o toast).
// ============================================================

const SERVICOS_TRILHA = ["s3", "ec2", "iam", "lambda", "dynamodb"];

const CONQUISTAS = [
  { id: "inicio", icone: "🌱", titulo: "Primeiros passos", desc: "Conclua seu primeiro desafio.",
    check: () => Object.keys(jogo.concluidos).length >= 1 },
  { id: "trilha", icone: "🛤️", titulo: "Trilheiro", desc: "Complete uma trilha inteira de um serviço.",
    check: () => SERVICOS_TRILHA.some((s) => servicoCompleto(s)) },
  { id: "streak5", icone: "🔥", titulo: "Pé quente", desc: "Faça 5 acertos seguidos sem revelar resposta.",
    check: () => jogo.melhorStreak >= 5 },
  { id: "streak10", icone: "🌋", titulo: "Em chamas", desc: "Faça 10 acertos seguidos.",
    check: () => jogo.melhorStreak >= 10 },
  { id: "semcola", icone: "🧠", titulo: "Sem cola", desc: "Complete uma trilha sem revelar nenhuma resposta.",
    check: () => SERVICOS_TRILHA.some((s) => servicoCompleto(s) && desafiosDoServico(s).every((d) => !jogo.revelados[d.id])) },
  { id: "poliglota", icone: "🌐", titulo: "Poliglota da nuvem", desc: "Conclua ao menos 1 desafio de cada serviço.",
    check: () => SERVICOS_TRILHA.every((s) => desafiosDoServico(s).some((d) => desafioConcluido(d.id))) },
  { id: "projeto", icone: "🏗️", titulo: "Mão na massa", desc: "Conclua seu primeiro projeto.",
    check: () => DESAFIOS.some((d) => d.tipo === "projeto" && desafioConcluido(d.id)) },
  { id: "pleno", icone: "🚀", titulo: "Subindo de cargo", desc: "Alcance o nível Cloud Pleno.",
    check: () => nivelAtual(jogo.xp).indice >= 2 },
  { id: "arquiteto", icone: "🏛️", titulo: "Arquiteto", desc: "Conclua todos os 4 projetos.",
    check: () => DESAFIOS.filter((d) => d.tipo === "projeto").every((d) => desafioConcluido(d.id)) },
  { id: "lenda", icone: "🦸", titulo: "Lenda do CLI", desc: "Conclua todos os desafios e projetos.",
    check: () => DESAFIOS.every((d) => desafioConcluido(d.id)) },
];

function chaveConquistas() {
  return "awsCliQuest.conquistas" + (api && api.usuario ? "." + api.usuario : "");
}

function lerDesbloqueadas() {
  try { return new Set(JSON.parse(localStorage.getItem(chaveConquistas()) || "[]")); }
  catch (e) { return new Set(); }
}

function gravarDesbloqueadas(set) {
  try { localStorage.setItem(chaveConquistas(), JSON.stringify([...set])); } catch (e) { /* ok */ }
}

// Roda os checks. `silencioso` = sincroniza sem dar toast (no load/login).
function verificarConquistas(silencioso) {
  const ja = lerDesbloqueadas();
  let mudou = false;
  for (const c of CONQUISTAS) {
    if (ja.has(c.id)) continue;
    let ok = false;
    try { ok = !!c.check(); } catch (e) { ok = false; }
    if (ok) {
      ja.add(c.id);
      mudou = true;
      if (!silencioso && typeof toast === "function") {
        toast(`🏅 <strong>Conquista desbloqueada!</strong> ${c.icone} ${c.titulo}`, "nivel");
      }
    }
  }
  if (mudou) gravarDesbloqueadas(ja);
}

function montarConquistas() {
  const header = document.querySelector("header");
  const btnRanking = document.querySelector("#btnRanking");
  if (!header || document.querySelector("#btnConquistas")) return;
  const btn = document.createElement("button");
  btn.id = "btnConquistas";
  btn.className = "botao secundario";
  btn.textContent = "🏅 Conquistas";
  btn.title = "Suas medalhas";
  header.insertBefore(btn, btnRanking || null);

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "modalConquistas";
  modal.innerHTML = `
    <div class="modal-caixa modal-largo">
      <h2>🏅 Conquistas</h2>
      <p id="contadorConquistas" class="contador-conquistas"></p>
      <div id="gradeConquistas" class="grade-conquistas"></div>
      <div class="modal-acoes"><button class="botao secundario" data-fechar-conquistas>Fechar</button></div>
    </div>`;
  document.body.appendChild(modal);

  function abrir() {
    verificarConquistas(true);
    const ja = lerDesbloqueadas();
    modal.querySelector("#contadorConquistas").textContent = `${ja.size} de ${CONQUISTAS.length} desbloqueadas`;
    modal.querySelector("#gradeConquistas").innerHTML = CONQUISTAS.map((c) => {
      const ok = ja.has(c.id);
      return `<div class="cartao-conquista ${ok ? "ok" : "bloqueada"}">
        <div class="badge-icone">${ok ? c.icone : "🔒"}</div>
        <div><strong>${c.titulo}</strong><p>${c.desc}</p></div>
      </div>`;
    }).join("");
    modal.classList.add("aberto");
  }
  function fechar() { modal.classList.remove("aberto"); }

  btn.addEventListener("click", abrir);
  modal.querySelector("[data-fechar-conquistas]").addEventListener("click", fechar);
  modal.addEventListener("click", (e) => { if (e.target === modal) fechar(); });
}

// --- Wrap da global salvarJogo (jogo.js): checa a cada progresso ---
(function () {
  if (typeof window === "undefined" || typeof window.salvarJogo !== "function") return;
  const salvarOriginal = window.salvarJogo;
  window.salvarJogo = function () {
    salvarOriginal.apply(this, arguments);
    verificarConquistas(false);
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  montarConquistas();
  // sincroniza silenciosamente o que já estava conquistado (sem spam de toast)
  verificarConquistas(true);
});
