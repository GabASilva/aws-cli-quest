"use strict";
// ============================================================
// CLImb — multiplayer.js
// Turmas / Salas (multiplayer ASSÍNCRONO): crie uma turma, compartilhe o código,
// a galera entra e cada turma tem seu próprio ranking de XP — a competição
// acontece no tempo de cada um (sem tempo real). Botão "👥 Turmas" no header.
//
// Plano Escola (30/09/2026 — memória plano-escola):
//   - B: "Sou professor" pede a conta de professor (aprovação manual do
//     Gabriel no painel). Aprovado, as turmas dele viram TURMA ESCOLA: painel
//     de progresso por aluno, tarefas (trilha + prazo) e exportação CSV.
//   - A: o aluno de turma escola compra o Pro pelo preço escola; ou a escola
//     paga um pacote de vagas e quem entra pelo código já vira Pro.
// ADITIVO: usa api.* / apiSala* / apiProfessor* / toast. Não toca o core.
// ============================================================
(function () {
  if (typeof window === "undefined") return;

  let modal = null;
  let estado = { salas: [], exigeEmail: false, carregando: false, erro: "", form: null, professor: null, painel: null };

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  const reais = (v) => "R$ " + Number(v).toFixed(2).replace(".", ",");
  const dataBr = (ms) => (ms ? new Date(ms).toLocaleDateString("pt-BR") : "—");
  const nomeTrilha = (id) => { const m = (typeof SERVICOS_META !== "undefined" ? SERVICOS_META : []).find((s) => s.id === id); return m ? m.nome : id; };

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
    estado.form = null; estado.erro = ""; estado.painel = null;
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
      const [r, p] = await Promise.all([apiSalasListar(), apiProfessorStatus().catch(() => null)]);
      estado.salas = r.salas || [];
      estado.exigeEmail = !!r.exigeEmail;
      estado.professor = p;
    } catch (e) { estado.erro = e.message || "Não consegui carregar suas turmas."; }
    estado.carregando = false;
  }

  // ---------- professor (B) ----------
  function blocoProfessor() {
    const p = estado.professor;
    if (!p) return "";
    const pr = p.professor;
    if (p.aprovado) {
      return `<div class="esc-prof ok">🎓 <b>Conta de professor ativa</b> até ${dataBr(pr && pr.expiraEm)}. As turmas que você criar viram <b>turma escola</b>: painel de progresso, tarefas com prazo e preço escola pros alunos.</div>`;
    }
    if (pr && pr.status === "pendente") {
      return `<div class="esc-prof">⏳ Seu pedido de professor (${esc(pr.instituicao)}) está em análise. Você recebe um e-mail quando for aprovado.</div>`;
    }
    const recusado = pr && pr.status === "recusado"
      ? `<p class="conta-erro">Pedido anterior não aprovado${pr.motivo ? ": " + esc(pr.motivo) : ""}. Pode pedir de novo com mais detalhes.</p>` : "";
    const form = estado.form === "professor" ? `
      <form class="esc-form" data-submit="professor">
        <input name="instituicao" maxlength="120" placeholder="Escola ou instituição" autocomplete="organization">
        <input name="emailInst" maxlength="120" placeholder="Seu e-mail da escola" autocomplete="email" inputmode="email">
        <input name="link" maxlength="300" placeholder="Link da página da escola (opcional)" inputmode="url">
        <button class="botao" type="submit">Pedir conta de professor</button>
        <small>A análise é feita à mão. Com a conta aprovada, você ganha o Pro por um ano, de graça.</small>
      </form>` : "";
    return `<div class="esc-prof">🎓 <b>É professor?</b> Painel da turma, tarefas com prazo e o Pro de graça pra você.
      <button class="sala-link" data-form="professor" type="button">${estado.form === "professor" ? "fechar" : "Pedir conta de professor"}</button>
      ${recusado}${form}</div>`;
  }

  // ---------- turma ----------
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

  // progresso do PRÓPRIO aluno numa trilha (sai do navegador, igual à lateral)
  function meuProgresso(servico) {
    if (typeof desafiosDoServico !== "function" || typeof desafioConcluido !== "function") return null;
    const lista = desafiosDoServico(servico);
    if (!lista.length) return null;
    return { feitas: lista.filter((d) => desafioConcluido(d.id)).length, total: lista.length };
  }

  function tarefasHtml(s) {
    if (!s.tarefas.length) return s.ehDono ? `<p class="esc-nada">Nenhuma tarefa ainda. Marque uma trilha pra turma fazer.</p>` : "";
    const itens = s.tarefas.map((t) => {
      const atrasada = t.prazo && t.prazo < Date.now();
      const meu = !s.ehDono ? meuProgresso(t.servico) : null;
      return `<li><b>${esc(nomeTrilha(t.servico))}</b>${t.prazo ? ` — até ${dataBr(t.prazo)}${atrasada ? " (prazo passou)" : ""}` : ""}
        ${meu ? ` · você: ${meu.feitas}/${meu.total}` : ""}
        ${s.ehDono ? `<button class="sala-link-perigo" data-tarefa-apagar="${esc(t.id)}" data-sala="${esc(s.codigo)}" type="button">tirar</button>` : ""}</li>`;
    }).join("");
    return `<div class="esc-tarefas"><strong>📌 Tarefas</strong><ul>${itens}</ul></div>`;
  }

  function extrasEscola(s) {
    if (!s.escola) return "";
    if (s.ehDono) {
      const opcoes = (typeof SERVICOS_META !== "undefined" ? SERVICOS_META : [])
        .filter((m) => m.id !== "projetos").map((m) => `<option value="${esc(m.id)}">${esc(m.nome)}</option>`).join("");
      const vagas = s.vagas ? `<p class="esc-vagas">🎟️ Vagas pagas pela escola: <b>${s.vagas.usadas}/${s.vagas.total}</b> ocupadas, até ${dataBr(s.vagas.expiraEm)}. Quem entra com o código ganha o Pro enquanto houver vaga.</p>` : "";
      return `${vagas}
        ${tarefasHtml(s)}
        <form class="esc-form linha" data-submit="tarefa" data-sala="${esc(s.codigo)}">
          <select name="servico" aria-label="Trilha da tarefa">${opcoes}</select>
          <input name="prazo" type="date" aria-label="Prazo (opcional)">
          <button class="botao secundario" type="submit">Marcar tarefa</button>
        </form>
        <div class="sala-botoes"><button class="botao" data-painel="${esc(s.codigo)}" type="button">📊 Painel da turma</button></div>`;
    }
    const pro = typeof api !== "undefined" && api.licenca && api.licenca.pro;
    const oferta = pro ? "" : `<div class="esc-oferta">Turma escola: o Pro sai por <b>${reais(s.precoEscola)}/ano</b> (no individual é R$ 149,90).
        <button class="botao" data-assinar-escola type="button">Assinar com preço escola</button></div>`;
    return `${tarefasHtml(s)}${oferta}
      <p class="esc-privacidade">🔎 Nesta turma o professor vê o seu progresso: atividades feitas, respostas reveladas e quando você estudou.</p>`;
  }

  function salaCard(s) {
    return `
      <div class="sala-card${s.escola ? " esc-turma" : ""}">
        <div class="sala-cab">
          <div>
            <strong>${esc(s.nome)}</strong>${s.escola ? ` <span class="sala-tag esc-tag">🎓 turma escola</span>` : ""}${s.ehDono ? ` <span class="sala-tag">você criou</span>` : ""}
            <div class="sala-cod">Código: <code>${esc(s.codigo)}</code>
              <button class="sala-link" data-copiar="${esc(s.codigo)}" type="button">copiar</button></div>
          </div>
          <div class="sala-acoes">
            ${s.ehDono
              ? `<button class="sala-link-perigo" data-apagar="${esc(s.codigo)}" type="button">Apagar turma</button>`
              : `<button class="sala-link-perigo" data-sair="${esc(s.codigo)}" type="button">Sair</button>`}
          </div>
        </div>
        ${extrasEscola(s)}
        ${rankingHtml(s)}
        <small class="sala-total">${s.total} participante(s)</small>
      </div>`;
  }

  // ---------- painel do professor ----------
  function painelHtml() {
    const { codigo, dados } = estado.painel;
    const sala = estado.salas.find((x) => x.codigo === codigo) || { nome: codigo };
    if (!dados) return `<p class="conta-explica">Carregando o painel…</p>`;
    const tarefas = dados.tarefas || [];
    const cab = `<tr><th>Aluno</th><th>XP</th><th>Feitas</th><th title="Respostas reveladas: a atividade conta, mas sem XP">Reveladas</th><th>Estudou por último</th><th>Pro</th>
      ${tarefas.map((t) => `<th title="${esc(nomeTrilha(t.servico))}">${esc(nomeTrilha(t.servico))}</th>`).join("")}<th></th></tr>`;
    const linhas = dados.alunos.map((a) => `<tr>
        <td>${esc(a.usuario)}</td><td>${a.xp}</td><td>${a.feitas}</td><td>${a.reveladas}</td>
        <td>${a.ultimoDia ? esc(a.ultimoDia.split("-").reverse().join("/")) : "—"}</td>
        <td>${a.vaga ? "🎟️ vaga" : a.pro ? "✔" : "—"}</td>
        ${tarefas.map((t) => { const f = a.porTrilha[t.servico] || 0, tot = dados.totaisTrilha[t.servico] || 0; return `<td>${tot ? Math.round(100 * f / tot) : 0}%</td>`; }).join("")}
        <td>${a.vaga ? `<button class="sala-link-perigo" data-liberar="${esc(a.usuario)}" type="button" title="Devolve a vaga (o aluno saiu da escola)">liberar vaga</button>` : ""}</td>
      </tr>`).join("");
    const vazio = dados.alunos.length ? "" : `<p class="conta-explica">Ainda não entrou nenhum aluno. Passe o código <code>${esc(codigo)}</code> pra turma.</p>`;
    return `
      <div class="sala-botoes">
        <button class="botao secundario" data-painel-voltar type="button">← Voltar às turmas</button>
        ${dados.alunos.length ? `<button class="botao secundario" data-csv type="button">⬇️ Baixar planilha (CSV)</button>` : ""}
      </div>
      <h3 class="esc-painel-titulo">📊 ${esc(sala.nome)} — ${dados.alunos.length} aluno(s)</h3>
      <p class="esc-nada">O XP e as atividades são registrados no navegador de cada aluno: servem pra acompanhar, não como prova. "Reveladas" são atividades feitas depois de ver a resposta.</p>
      ${vazio}
      ${dados.alunos.length ? `<div class="esc-tabela"><table class="sala-rank"><thead>${cab}</thead><tbody>${linhas}</tbody></table></div>` : ""}`;
  }

  function baixarCsv() {
    const { codigo, dados } = estado.painel || {};
    if (!dados) return;
    const tarefas = dados.tarefas || [];
    const campo = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const linhas = [["aluno", "xp", "atividades_feitas", "respostas_reveladas", "ultimo_dia", "pro", ...tarefas.map((t) => "tarefa_" + t.servico + "_%")].map(campo).join(";")];
    for (const a of dados.alunos) {
      linhas.push([a.usuario, a.xp, a.feitas, a.reveladas, a.ultimoDia || "", a.vaga ? "vaga" : a.pro ? "sim" : "nao",
        ...tarefas.map((t) => { const tot = dados.totaisTrilha[t.servico] || 0; return tot ? Math.round(100 * (a.porTrilha[t.servico] || 0) / tot) : 0; })].map(campo).join(";"));
    }
    // BOM no começo: o Excel em português abre com acento certo
    const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `turma-${codigo}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
    } else if (estado.painel) {
      corpo = painelHtml() + (estado.erro ? `<p class="conta-erro">${esc(estado.erro)}</p>` : "");
    } else {
      const acoes = `
        ${blocoProfessor()}
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
      <div class="modal-caixa sala-caixa${estado.painel ? " esc-largo" : ""}">
        <h2>👥 Turmas e competições</h2>
        <p class="sala-intro">Cada turma tem seu <b>ranking próprio</b>. Todo mundo joga no seu tempo — a competição é assíncrona.</p>
        ${corpo}
        <div class="modal-acoes"><button class="botao secundario" data-fechar-salas type="button">Fechar</button></div>
      </div>`;
  }

  async function abrirPainel(codigo) {
    estado.painel = { codigo, dados: null }; estado.erro = ""; render();
    try { estado.painel.dados = await apiSalaPainel(codigo); }
    catch (e) { estado.erro = e.message || "Não consegui abrir o painel."; }
    render();
  }

  function atualizarLicenca(lic) {
    if (!lic || typeof api === "undefined") return;
    api.licenca = lic;
    try { if (typeof window.atualizarBotaoPlano === "function") window.atualizarBotaoPlano(); } catch (_) {}
    try { if (typeof renderSidebar === "function") renderSidebar(); } catch (_) {}
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
    const painel = e.target.closest("[data-painel]");
    if (painel) { await abrirPainel(painel.dataset.painel); return; }
    if (e.target.closest("[data-painel-voltar]")) { estado.painel = null; estado.erro = ""; await carregar(); render(); return; }
    if (e.target.closest("[data-csv]")) { baixarCsv(); return; }
    const liberar = e.target.closest("[data-liberar]");
    if (liberar && estado.painel) {
      if (!confirm(`Liberar a vaga de ${liberar.dataset.liberar}? O Pro dele(a) pela escola acaba agora, e a vaga passa pro próximo da turma sem Pro.`)) return;
      try {
        const r = await apiSalaLiberarVaga(estado.painel.codigo, liberar.dataset.liberar);
        estado.painel.dados = r.painel; render(); toast("Vaga liberada.", "sucesso");
      } catch (err) { estado.erro = err.message; render(); }
      return;
    }
    const tirar = e.target.closest("[data-tarefa-apagar]");
    if (tirar) { await acao(() => apiSalaTarefaApagar(tirar.dataset.sala, tirar.dataset.tarefaApagar), "Tarefa retirada."); return; }
    const assinarEsc = e.target.closest("[data-assinar-escola]");
    if (assinarEsc) {
      assinarEsc.disabled = true; const txt = assinarEsc.textContent; assinarEsc.textContent = "Abrindo…";
      try {
        const r = await apiAssinar("escola");
        if (r.url) { window.location.href = r.url; return; }
      } catch (err) { toast(err.message || "Checkout indisponível agora.", "neutro"); }
      assinarEsc.disabled = false; assinarEsc.textContent = txt;
    }
  }

  async function aoSubmeter(e) {
    const form = e.target.closest("[data-submit]");
    if (!form) return;
    e.preventDefault();
    const tipo = form.dataset.submit;
    if (tipo === "criar") {
      const nome = (form.nome.value || "").trim();
      if (!nome) { estado.erro = "Dê um nome pra turma."; render(); return; }
      await acao(async () => { const r = await apiSalaCriar(nome); return r; }, "Turma criada! Compartilhe o código.");
    } else if (tipo === "entrar") {
      const codigo = (form.codigo.value || "").trim().toUpperCase();
      if (!codigo) { estado.erro = "Digite o código da turma."; render(); return; }
      let r = null;
      await acao(async () => { r = await apiSalaEntrar(codigo); return r; }, "Você entrou na turma!");
      if (r && r.ganhouVaga) { atualizarLicenca(r.licenca); toast("🎟️ A escola pagou uma vaga pra você: seu Pro já está liberado!", "sucesso"); }
    } else if (tipo === "professor") {
      const instituicao = (form.instituicao.value || "").trim(), emailInst = (form.emailInst.value || "").trim(), link = (form.link.value || "").trim();
      await acao(() => apiProfessorPedir(instituicao, emailInst, link), "Pedido enviado! Você recebe um e-mail quando for aprovado.");
    } else if (tipo === "tarefa") {
      const servico = form.servico.value;
      const prazo = form.prazo.value ? new Date(form.prazo.value + "T23:59:00").getTime() : null;
      await acao(() => apiSalaTarefa(form.dataset.sala, servico, prazo), "Tarefa marcada pra turma.");
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
