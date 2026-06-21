"use strict";
// ============================================================
// CLImb — multiplayer.js
// Turmas / Salas (multiplayer ASSÍNCRONO): crie uma turma, compartilhe o código,
// a galera entra e cada turma tem seu próprio ranking de XP — a competição
// acontece no tempo de cada um (sem tempo real). Botão "👥 Turmas" no header.
// ADITIVO: usa api.* / apiSala* / toast. Não toca o core.
// ============================================================
(function () {
  if (typeof window === "undefined") return;

  let modal = null;
  let estado = { salas: [], exigeEmail: false, carregando: false, erro: "", form: null };

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  function montar() {
    const header = document.querySelector("header");
    const btnRanking = document.querySelector("#btnRanking");
    if (header && !document.querySelector("#btnTurmas")) {
      const b = document.createElement("button");
      b.id = "btnTurmas";
      b.className = "botao secundario";
      b.textContent = "👥 Turmas";
      b.title = "Turmas e competições com a galera";
      header.insertBefore(b, btnRanking || null);
      b.addEventListener("click", abrir);
    }
    modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "modalSalas";
    document.body.appendChild(modal);
    modal.addEventListener("click", aoClicar);
    modal.addEventListener("submit", aoSubmeter);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("aberto")) fechar(); });
  }

  function fechar() { modal.classList.remove("aberto"); }

  async function abrir() {
    estado.form = null; estado.erro = "";
    modal.classList.add("aberto");
    if (typeof api === "undefined" || !api.online) { render(); return; }
    if (!api.usuario) { render(); return; }
    estado.carregando = true; render();
    await carregar();
    render();
  }

  async function carregar() {
    estado.carregando = true; estado.erro = "";
    try {
      const r = await apiSalasListar();
      estado.salas = r.salas || [];
      estado.exigeEmail = !!r.exigeEmail;
    } catch (e) { estado.erro = e.message || "Não consegui carregar suas turmas."; }
    estado.carregando = false;
  }

  function rankingHtml(sala) {
    if (!sala.ranking.length) return `<p class="sala-vazia">Ninguém pontuou ainda.</p>`;
    const linhas = sala.ranking.map((p, i) => {
      const pos = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`;
      return `<tr class="${p.ehVoce ? "sala-voce" : ""}">
        <td class="sala-pos">${pos}</td>
        <td>${esc(p.usuario)}${p.ehVoce ? " <small>(você)</small>" : ""}</td>
        <td class="sala-xp">${p.xp} XP</td></tr>`;
    }).join("");
    return `<table class="sala-rank"><tbody>${linhas}</tbody></table>`;
  }

  function salaCard(s) {
    return `
      <div class="sala-card">
        <div class="sala-cab">
          <div>
            <strong>${esc(s.nome)}</strong>${s.ehDono ? ` <span class="sala-tag">você criou</span>` : ""}
            <div class="sala-cod">Código: <code>${esc(s.codigo)}</code>
              <button class="sala-link" data-copiar="${esc(s.codigo)}" type="button">copiar</button></div>
          </div>
          <div class="sala-acoes">
            ${s.ehDono
              ? `<button class="sala-link-perigo" data-apagar="${esc(s.codigo)}" type="button">Apagar turma</button>`
              : `<button class="sala-link-perigo" data-sair="${esc(s.codigo)}" type="button">Sair</button>`}
          </div>
        </div>
        ${rankingHtml(s)}
        <small class="sala-total">${s.total} participante(s)</small>
      </div>`;
  }

  function render() {
    let corpo;
    if (typeof api === "undefined" || !api.online) {
      corpo = `<p class="conta-explica">As turmas precisam de conta na nuvem, e o servidor de contas está fora do ar agora.</p>`;
    } else if (!api.usuario) {
      corpo = `<p class="conta-explica">Crie uma conta (ou entre) pra montar turmas e competir com a galera no seu ritmo.</p>
        <button class="botao" data-abrir-conta type="button">Entrar / criar conta</button>`;
    } else if (estado.carregando) {
      corpo = `<p class="conta-explica">Carregando suas turmas…</p>`;
    } else {
      const acoes = `
        <div class="sala-botoes">
          <button class="botao" data-form="criar" type="button">➕ Criar turma</button>
          <button class="botao secundario" data-form="entrar" type="button">🔑 Entrar com código</button>
        </div>
        ${estado.form === "criar" ? `
          <form class="sala-form" data-submit="criar">
            <input name="nome" maxlength="40" placeholder="Nome da turma (ex.: Cloud Foundations T1)" autocomplete="off">
            <button class="botao" type="submit">Criar</button>
          </form>` : ""}
        ${estado.form === "entrar" ? `
          <form class="sala-form" data-submit="entrar">
            <input name="codigo" maxlength="6" placeholder="Código (6 letras)" autocomplete="off" style="text-transform:uppercase">
            <button class="botao" type="submit">Entrar</button>
          </form>` : ""}
        ${estado.erro ? `<p class="conta-erro">${esc(estado.erro)}</p>` : ""}
        ${estado.exigeEmail ? `<p class="sala-aviso">⚠️ Pra competir é preciso ter o e-mail confirmado.</p>` : ""}`;
      const lista = estado.salas.length
        ? estado.salas.map(salaCard).join("")
        : `<p class="conta-explica">Você ainda não está em nenhuma turma. Crie uma e compartilhe o código, ou entre com o código de uma.</p>`;
      corpo = acoes + `<div class="sala-lista">${lista}</div>`;
    }
    modal.innerHTML = `
      <div class="modal-caixa sala-caixa">
        <h2>👥 Turmas e competições</h2>
        <p class="sala-intro">Cada turma tem seu <b>ranking próprio</b>. Todo mundo joga no seu tempo — a competição é assíncrona.</p>
        ${corpo}
        <div class="modal-acoes"><button class="botao secundario" data-fechar-salas type="button">Fechar</button></div>
      </div>`;
  }

  async function aoClicar(e) {
    if (e.target === modal || e.target.closest("[data-fechar-salas]")) { fechar(); return; }
    if (e.target.closest("[data-abrir-conta]")) { fechar(); if (typeof abrirModalConta === "function") abrirModalConta(); return; }
    const f = e.target.closest("[data-form]");
    if (f) { estado.form = estado.form === f.dataset.form ? null : f.dataset.form; estado.erro = ""; render(); return; }
    const cop = e.target.closest("[data-copiar]");
    if (cop) { try { navigator.clipboard.writeText(cop.dataset.copiar); toast("Código copiado: " + cop.dataset.copiar, "neutro"); } catch (_) {} return; }
    const sair = e.target.closest("[data-sair]");
    if (sair) { if (confirm("Sair desta turma?")) await acao(() => apiSalaSair(sair.dataset.sair), "Você saiu da turma."); return; }
    const apagar = e.target.closest("[data-apagar]");
    if (apagar) { if (confirm("Apagar a turma pra todo mundo? Isso não dá pra desfazer.")) await acao(() => apiSalaApagar(apagar.dataset.apagar), "Turma apagada."); return; }
  }

  async function aoSubmeter(e) {
    const form = e.target.closest("[data-submit]");
    if (!form) return;
    e.preventDefault();
    if (form.dataset.submit === "criar") {
      const nome = (form.nome.value || "").trim();
      if (!nome) { estado.erro = "Dê um nome pra turma."; render(); return; }
      await acao(async () => { const r = await apiSalaCriar(nome); return r; }, "Turma criada! Compartilhe o código.");
    } else {
      const codigo = (form.codigo.value || "").trim().toUpperCase();
      if (!codigo) { estado.erro = "Digite o código da turma."; render(); return; }
      await acao(() => apiSalaEntrar(codigo), "Você entrou na turma!");
    }
  }

  // Executa uma ação de API, recarrega a lista e dá feedback.
  async function acao(fn, msgOk) {
    estado.erro = "";
    try {
      await fn();
      estado.form = null;
      await carregar();
      render();
      if (typeof toast === "function") toast(msgOk, "sucesso");
    } catch (e) {
      estado.erro = e.message || "Não consegui completar a ação.";
      render();
    }
  }

  document.addEventListener("DOMContentLoaded", montar);
  window.abrirTurmas = abrir;
})();
