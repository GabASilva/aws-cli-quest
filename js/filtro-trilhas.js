"use strict";
// ============================================================
// CLImb — filtro-trilhas.js
// Deixa a pessoa escolher QUAIS trilhas aparecem na lateral. Com 60+ trilhas,
// quem estuda só pra uma vaga (ou só pro CLF-C02) quer ver as dela e mais nada.
// Pedido do Gabriel (25/09/2026).
//
// - Botão fixo no topo da lateral abre um modal com as trilhas por grupo, uma
//   caixa de marcar em cada, e atalhos (todas, só as grátis, em andamento, por
//   carreira).
// - Guarda as ESCONDIDAS (não as visíveis) no localStorage: trilha nova que
//   entrar no app aparece sozinha, em vez de nascer escondida pra quem já
//   tinha filtrado. É preferência deste navegador — perder não custa nada.
// - A trilha aberta e a da atividade na tela nunca somem, senão o clique num
//   "Desafio do dia" levaria pra uma trilha invisível.
// - É ESCOLHA, não substituição (ver memória decisoes-de-hud): sem filtro, a
//   lateral fica exatamente como era, só com o botão no topo.
//
// ADITIVO: embrulha renderSidebar no DOMContentLoaded (depois do
// sidebar-grupos, que marca data-servico em cada bloco, e da busca da trilha).
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const CHAVE = "climb.trilhas.ocultas";

  function ocultas() {
    try { const b = localStorage.getItem(CHAVE); if (b) return new Set(JSON.parse(b)); } catch (e) { /* ok */ }
    return new Set();
  }
  function salvar(set) {
    try { localStorage.setItem(CHAVE, JSON.stringify([...set])); } catch (e) { /* ok: vale só nesta sessão */ }
    memoria = set;
  }
  let memoria = null; // se o localStorage falhar, a escolha vale até recarregar
  const atuais = () => memoria || ocultas();

  const metas = () => (typeof SERVICOS_META !== "undefined" ? SERVICOS_META : []);
  function trilhaVisivelSempre() {
    const s = new Set();
    if (typeof ui === "undefined") return s;
    if (ui.servicoAberto) s.add(ui.servicoAberto);
    if (ui.desafioAtivo && typeof obterDesafio === "function") {
      const d = obterDesafio(ui.desafioAtivo);
      if (d) s.add(d.servico);
    }
    return s;
  }
  function grupos() {
    const base = (window.GRUPOS_TRILHA || []).map((g) => ({ id: g.id, nome: g.nome, emoji: g.emoji, servicos: g.servicos.slice() }));
    const conhecidos = new Set(base.flatMap((g) => g.servicos));
    const soltos = metas().map((m) => m.id).filter((id) => !conhecidos.has(id));
    let outros = base.find((g) => g.id === "outros");
    if (!outros) { outros = { id: "outros", nome: "Outros serviços", emoji: "📦", servicos: [] }; base.push(outros); }
    outros.servicos = outros.servicos.concat(soltos);
    const existe = new Set(metas().map((m) => m.id));
    return base.map((g) => Object.assign(g, { servicos: g.servicos.filter((s) => existe.has(s)) })).filter((g) => g.servicos.length);
  }
  const escapar = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- estilo ----------
  function injetarEstilo() {
    if (document.getElementById("ftEstilo")) return;
    const st = document.createElement("style");
    st.id = "ftEstilo";
    st.textContent = `
      .ft-barra { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 34px; margin: 0 0 8px; }
      .ft-botao {
        background: var(--painel-2); border: 1px solid var(--borda); border-radius: 8px;
        color: var(--texto); padding: 6px 10px; font: inherit; font-size: .78rem; cursor: pointer;
      }
      .ft-botao:hover, .ft-botao:focus-visible { border-color: var(--laranja); outline: none; }
      .ft-status { font-size: .74rem; color: var(--texto-fraco); }
      .ft-status button {
        background: none; border: 0; padding: 0; font: inherit; cursor: pointer;
        color: var(--laranja); text-decoration: underline; text-underline-offset: 2px;
      }
      #sidebar .ft-oculta, #sidebar .grupo.ft-vazio { display: none !important; }
      .ft-atalhos { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
      .ft-atalhos button, .ft-atalhos select {
        background: var(--painel-2); border: 1px solid var(--borda); border-radius: 999px;
        color: var(--texto); padding: 5px 11px; font: inherit; font-size: .8rem; cursor: pointer;
      }
      .ft-atalhos button:hover, .ft-atalhos select:hover { border-color: var(--laranja); }
      .ft-lista { max-height: min(56vh, 520px); overflow-y: auto; padding-right: 4px; }
      .ft-grupo { border: 1px solid var(--borda); border-radius: 10px; padding: 8px 10px 6px; margin: 0 0 10px; }
      .ft-grupo legend { padding: 0 4px; font-weight: 700; font-size: .85rem; color: var(--texto); }
      .ft-grupo legend label { cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }
      .ft-trilhas { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 2px 10px; margin-top: 4px; }
      .ft-trilhas label { display: flex; gap: 7px; align-items: center; padding: 4px 2px; cursor: pointer; font-size: .85rem; color: var(--texto); }
      .ft-trilhas small { color: var(--texto-fraco); margin-left: auto; font-family: var(--fonte-mono); font-size: .72rem; }
      .ft-contagem { color: var(--texto-fraco); font-size: .8rem; margin: 10px 0 0; min-height: 1.2em; }
      .ft-contagem.erro { color: var(--vermelho); }
    `;
    document.head.appendChild(st);
  }

  // ---------- aplicar na lateral ----------
  function aplicar() {
    const aside = document.querySelector("#sidebar");
    if (!aside) return;
    const set = atuais();
    const sempre = trilhaVisivelSempre();
    const lista = metas();
    const blocos = [...aside.querySelectorAll(".servico")];
    blocos.forEach((b, i) => {
      const id = b.dataset.servico || (lista[i] && lista[i].id); // sem grupos, a ordem casa com SERVICOS_META
      b.classList.toggle("ft-oculta", !!id && set.has(id) && !sempre.has(id));
    });
    for (const g of aside.querySelectorAll(".grupo")) {
      const vis = [...g.querySelectorAll(".servico")].filter((b) => !b.classList.contains("ft-oculta")).length;
      g.classList.toggle("ft-vazio", vis === 0);
      const cont = g.querySelector(".grupo-cont");
      if (cont) { if (!cont.dataset.total) cont.dataset.total = cont.textContent; cont.textContent = set.size ? String(vis) : cont.dataset.total; }
    }
    barra(aside, blocos.filter((b) => !b.classList.contains("ft-oculta")).length, blocos.length);
  }

  function barra(aside, vis, total) {
    let b = aside.querySelector(".ft-barra");
    if (!b) {
      b = document.createElement("div");
      b.className = "ft-barra";
      b.innerHTML = `<button type="button" class="ft-botao" aria-haspopup="dialog">🎛️ Escolher trilhas</button><span class="ft-status" aria-live="polite"></span>`;
      b.querySelector(".ft-botao").addEventListener("click", abrir);
      aside.insertBefore(b, aside.firstChild);
    } else if (aside.firstChild !== b) {
      aside.insertBefore(b, aside.firstChild);
    }
    const status = b.querySelector(".ft-status");
    const texto = vis < total ? `Mostrando ${vis} de ${total}` : "";
    if (status.dataset.texto !== texto) { // só reescreve quando muda (ver pronto.js)
      status.dataset.texto = texto;
      status.innerHTML = texto ? `${texto} · <button type="button">mostrar todas</button>` : "";
      const todas = status.querySelector("button");
      if (todas) todas.addEventListener("click", () => { salvar(new Set()); redesenhar(); });
    }
  }
  function redesenhar() {
    if (typeof renderSidebar === "function") renderSidebar(); else aplicar();
  }

  // ---------- modal ----------
  let modal = null;
  function montarModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "modalFiltroTrilhas";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "ftTitulo");
    modal.innerHTML = `
      <div class="modal-caixa modal-largo">
        <h2 id="ftTitulo">🎛️ Quais trilhas aparecem na lateral?</h2>
        <p class="ft-contagem" style="margin:0 0 10px">Escolha só o que você está estudando agora. As outras continuam no app — dá pra trazer de volta quando quiser.</p>
        <div class="ft-atalhos" role="group" aria-label="Atalhos">
          <button type="button" data-atalho="todas">Todas</button>
          <button type="button" data-atalho="nenhuma">Nenhuma</button>
          <button type="button" data-atalho="gratis">Só as grátis</button>
          <button type="button" data-atalho="andamento">Só as que já comecei</button>
          <select aria-label="Mostrar as trilhas de uma carreira"><option value="">Por carreira…</option></select>
        </div>
        <div class="ft-lista"></div>
        <p class="ft-contagem" aria-live="polite"></p>
        <div class="modal-acoes">
          <button type="button" class="botao secundario" data-ft="cancelar">Cancelar</button>
          <button type="button" class="botao" data-ft="aplicar">Aplicar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const sel = modal.querySelector("select");
    for (const c of window.CARREIRAS || []) {
      const o = document.createElement("option");
      o.value = c.id; o.textContent = `${c.emoji} ${c.nome}`;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => {
      const c = (window.CARREIRAS || []).find((x) => x.id === sel.value);
      if (c) marcarSo(new Set(c.passos.map((p) => p[0]).concat(["projetos"])));
      sel.value = "";
    });
    modal.querySelectorAll("[data-atalho]").forEach((b) => b.addEventListener("click", () => {
      const a = b.dataset.atalho;
      const todos = metas().map((m) => m.id);
      if (a === "todas") marcarSo(new Set(todos));
      else if (a === "nenhuma") marcarSo(new Set());
      else if (a === "gratis") marcarSo(new Set(typeof SERVICOS_GRATIS !== "undefined" ? SERVICOS_GRATIS : todos));
      else if (a === "andamento") marcarSo(new Set(todos.filter((id) => { try { return progressoServico(id).feitos > 0; } catch (e) { return false; } })));
    }));
    modal.querySelector('[data-ft="cancelar"]').addEventListener("click", fechar);
    modal.addEventListener("click", (e) => { if (e.target === modal) fechar(); });
    modal.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });
    modal.querySelector('[data-ft="aplicar"]').addEventListener("click", () => {
      const marcadas = caixasTrilha().filter((c) => c.checked).map((c) => c.value);
      if (!marcadas.length) { contar(true); return; }
      const set = new Set(metas().map((m) => m.id).filter((id) => marcadas.indexOf(id) < 0));
      salvar(set);
      fechar();
      redesenhar();
    });
    return modal;
  }
  const caixasTrilha = () => [...modal.querySelectorAll(".ft-trilhas input[type=checkbox]")];
  function marcarSo(set) {
    for (const c of caixasTrilha()) c.checked = set.has(c.value);
    sincronizarGrupos();
    contar(false);
  }
  function sincronizarGrupos() {
    for (const fs of modal.querySelectorAll(".ft-grupo")) {
      const cs = [...fs.querySelectorAll(".ft-trilhas input")];
      const n = cs.filter((c) => c.checked).length;
      const g = fs.querySelector("legend input");
      g.checked = n === cs.length;
      g.indeterminate = n > 0 && n < cs.length;
    }
  }
  function contar(erro) {
    const cs = caixasTrilha();
    const n = cs.filter((c) => c.checked).length;
    const p = modal.querySelectorAll(".ft-contagem")[1];
    p.classList.toggle("erro", !!erro && !n);
    p.textContent = !n ? (erro ? "Escolha pelo menos uma trilha." : "Nenhuma trilha marcada.") : `${n} de ${cs.length} trilhas vão aparecer.`;
  }
  function pintarLista() {
    const set = atuais();
    const porId = {};
    for (const m of metas()) porId[m.id] = m;
    const alvo = modal.querySelector(".ft-lista");
    alvo.innerHTML = grupos().map((g) => `
      <fieldset class="ft-grupo">
        <legend><label><input type="checkbox" data-grupo="${escapar(g.id)}"> ${g.emoji} ${escapar(g.nome)}</label></legend>
        <div class="ft-trilhas">${g.servicos.map((id) => {
          const m = porId[id];
          let prog = "";
          try { const p = progressoServico(id); prog = `${p.feitos}/${p.total}`; } catch (e) { /* ok */ }
          return `<label><input type="checkbox" value="${escapar(id)}"${set.has(id) ? "" : " checked"}> ${m.icone || ""} ${escapar(m.nome)}<small>${prog}</small></label>`;
        }).join("")}</div>
      </fieldset>`).join("");
    for (const g of alvo.querySelectorAll("legend input")) {
      g.addEventListener("change", () => {
        for (const c of g.closest(".ft-grupo").querySelectorAll(".ft-trilhas input")) c.checked = g.checked;
        sincronizarGrupos(); contar(false);
      });
    }
    for (const c of caixasTrilha()) c.addEventListener("change", () => { sincronizarGrupos(); contar(false); });
    sincronizarGrupos();
    contar(false);
  }
  let quemAbriu = null;
  function abrir() {
    montarModal();
    quemAbriu = document.activeElement;
    pintarLista();
    modal.classList.add("aberto");
    const primeiro = modal.querySelector(".ft-atalhos button");
    if (primeiro) setTimeout(() => { try { primeiro.focus(); } catch (e) { /* ok */ } }, 30);
  }
  function fechar() {
    if (!modal) return;
    modal.classList.remove("aberto");
    if (quemAbriu && document.contains(quemAbriu)) { try { quemAbriu.focus(); } catch (e) { /* ok */ } }
  }
  window.abrirFiltroTrilhas = abrir;

  // ---------- ligar ----------
  injetarEstilo();
  function iniciar() {
    const original = window.renderSidebar;
    if (typeof original === "function") {
      window.renderSidebar = function () {
        const r = original.apply(this, arguments);
        try { aplicar(); } catch (e) { /* filtro é acessório: sem ele a lateral mostra tudo */ }
        return r;
      };
    }
    try { aplicar(); } catch (e) { /* idem */ }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else setTimeout(iniciar, 0);
})();
