"use strict";
// ============================================================
// CLImb — perfil.js
// Página de perfil (inspirada no perfil do boot.dev):
//  - identidade editável (nome de exibição, bio, localização, GitHub, LinkedIn)
//  - métricas (XP, nível, atividades, sequências, simulados, conquistas)
//  - heatmap de atividade diária (estilo GitHub) das últimas 20 semanas
//  - streak DIÁRIO 🔥 (dias seguidos estudando) com chip no cabeçalho
//  - progresso por trilha + conquistas
//
// ADITIVO: injeta botão + modal, faz wrap de concluirDesafio (rastreio do dia)
// e de renderCabecalho (chip). Os dados novos moram em jogo.perfilPublico /
// jogo.atividadeDiaria / jogo.streakDias — persistem e sincronizam via jogo.js.
// ============================================================

(function () {
  if (typeof window === "undefined") return;

  const SEMANAS_HEATMAP = 20;
  const MESES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  function dataISO(d) {
    d = d || new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function garantirCampos() {
    if (!jogo.perfilPublico) jogo.perfilPublico = {};
    if (!jogo.atividadeDiaria) jogo.atividadeDiaria = {};
    if (!jogo.streakDias) jogo.streakDias = { atual: 0, melhor: 0, ultimo: "" };
  }

  // ---------- Rastreio: cada atividade concluída conta pro dia ----------
  // Retorna o tamanho novo do streak quando ESTE é o 1º acerto do dia (senão 0).
  function registrarDia() {
    garantirCampos();
    const hoje = dataISO();
    jogo.atividadeDiaria[hoje] = (jogo.atividadeDiaria[hoje] || 0) + 1;
    const s = jogo.streakDias;
    if (s.ultimo === hoje) return 0;
    const ontem = dataISO(new Date(Date.now() - 864e5));
    s.atual = s.ultimo === ontem ? (s.atual || 0) + 1 : 1;
    s.ultimo = hoje;
    if (s.atual > s.melhor) s.melhor = s.atual;
    return s.atual;
  }

  const concluirOriginal = window.concluirDesafio;
  if (typeof concluirOriginal === "function") {
    window.concluirDesafio = function (desafio) {
      const novoDia = registrarDia(); // antes: o salvarJogo de dentro já leva o dia junto
      const r = concluirOriginal.apply(this, arguments);
      // marca QUANDO concluiu (a revisão espaçada do treino usa isso)
      try {
        const c = desafio && jogo.concluidos[desafio.id];
        if (c && !c.quando) { c.quando = Date.now(); salvarJogo(); }
      } catch (e) { /* ok */ }
      atualizarChipDias();
      if (novoDia >= 2) {
        const marcos = { 3: "Três dias seguidos!", 7: "Uma semana inteira! 🚀", 14: "Duas semanas! 💪", 30: "Um mês estudando todo dia! 🏆", 50: "50 dias! 🧠", 100: "100 dias — lendário! 🦸" };
        if (marcos[novoDia]) toast(`🔥 <strong>Streak de ${novoDia} dias!</strong> ${marcos[novoDia]}`, "nivel");
        else toast(`🔥 Streak diário: <strong>${novoDia} dias</strong> seguidos estudando!`, "neutro");
      } else if (novoDia === 1 && (jogo.streakDias.melhor || 0) > 1) {
        toast("🔥 Dia garantido! Volte amanhã pra manter a sequência.", "neutro");
      }
      return r;
    };
  }

  // ---------- Chip "📅 N dias" no cabeçalho ----------
  function montarChipDias() {
    const ref = document.querySelector("#streakBox");
    if (!ref || document.querySelector("#diasBox")) return;
    const el = document.createElement("div");
    el.className = "streak dias-chip";
    el.id = "diasBox";
    el.innerHTML = `📅 <span id="diasNum">0</span><small>dias</small>`;
    ref.parentNode.insertBefore(el, ref.nextSibling);
    el.addEventListener("click", abrirPerfil);
    atualizarChipDias();
  }
  function atualizarChipDias() {
    const num = document.querySelector("#diasNum");
    const box = document.querySelector("#diasBox");
    if (!num || !box) return;
    garantirCampos();
    const s = jogo.streakDias;
    const hoje = dataISO();
    const ontem = dataISO(new Date(Date.now() - 864e5));
    const vivo = s.ultimo === hoje || s.ultimo === ontem; // ontem: ainda dá pra manter
    const n = vivo ? (s.atual || 0) : 0;
    num.textContent = n;
    box.classList.toggle("aceso", s.ultimo === hoje);
    box.title = s.ultimo === hoje
      ? `🔥 ${n} dia(s) seguidos — o de hoje já está garantido! Recorde: ${s.melhor || n}`
      : (n ? `⏳ ${n} dia(s) — conclua uma atividade HOJE pra manter a sequência!`
           : "Conclua 1 atividade por dia pra construir sua sequência de dias. Clique pra ver seu perfil.");
  }

  // ---------- Heatmap (estilo GitHub) ----------
  function htmlHeatmap() {
    garantirCampos();
    const hoje = new Date();
    // fim = sábado desta semana; começo = SEMANAS_HEATMAP semanas antes (domingo)
    const fim = new Date(hoje);
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - inicio.getDay() - (SEMANAS_HEATMAP - 1) * 7);
    let colunas = "";
    let rotulos = "";
    let mesAnterior = -1;
    let total = 0;
    for (let s = 0; s < SEMANAS_HEATMAP; s++) {
      const domingo = new Date(inicio);
      domingo.setDate(inicio.getDate() + s * 7);
      const mes = domingo.getMonth();
      rotulos += `<span class="perfil-heat-mes">${mes !== mesAnterior ? MESES_CURTO[mes] : ""}</span>`;
      mesAnterior = mes;
      let celulas = "";
      for (let d = 0; d < 7; d++) {
        const dia = new Date(domingo);
        dia.setDate(domingo.getDate() + d);
        if (dia > fim) { celulas += `<span class="perfil-heat-cel h-fora"></span>`; continue; }
        const chave = dataISO(dia);
        const n = jogo.atividadeDiaria[chave] || 0;
        total += n;
        const nivel = n === 0 ? 0 : n <= 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4;
        const rot = `${String(dia.getDate()).padStart(2, "0")}/${String(dia.getMonth() + 1).padStart(2, "0")}: ${n} atividade${n === 1 ? "" : "s"}`;
        celulas += `<span class="perfil-heat-cel h${nivel}" title="${rot}"></span>`;
      }
      colunas += `<div class="perfil-heat-col">${celulas}</div>`;
    }
    return `
      <div class="perfil-heat-rotulos">${rotulos}</div>
      <div class="perfil-heat">${colunas}</div>
      <div class="perfil-heat-legenda">
        <span>${total} atividades em ${SEMANAS_HEATMAP} semanas</span>
        <span class="perfil-heat-escala">menos
          <span class="perfil-heat-cel h0"></span><span class="perfil-heat-cel h1"></span><span class="perfil-heat-cel h2"></span><span class="perfil-heat-cel h3"></span><span class="perfil-heat-cel h4"></span>
        mais</span>
      </div>`;
  }

  // ---------- Links seguros (GitHub / LinkedIn) ----------
  function linkGithub(v) {
    v = String(v || "").trim();
    if (!v) return null;
    if (/^https:\/\/github\.com\//.test(v)) return v;
    const handle = v.replace(/^@/, "").replace(/^github\.com\//, "");
    if (!/^[\w.-]{1,40}$/.test(handle)) return null;
    return "https://github.com/" + encodeURIComponent(handle);
  }
  function linkLinkedin(v) {
    v = String(v || "").trim();
    if (!v) return null;
    if (/^https:\/\/(www\.)?linkedin\.com\//.test(v)) return v;
    const handle = v.replace(/^@/, "").replace(/^(www\.)?linkedin\.com\/in\//, "");
    if (!/^[\w%.-]{1,80}$/.test(handle)) return null;
    return "https://www.linkedin.com/in/" + encodeURIComponent(handle);
  }

  // ---------- Métricas ----------
  function lerHistSimulados() {
    try { return JSON.parse(localStorage.getItem("climb.simulados.hist") || "{}"); } catch (e) { return {}; }
  }
  function metricas() {
    garantirCampos();
    const feitos = Object.keys(jogo.concluidos || {}).length;
    const diasAtivos = Object.keys(jogo.atividadeDiaria).filter((d) => jogo.atividadeDiaria[d] > 0).length;
    let conquistas = null;
    try { conquistas = { tem: lerDesbloqueadas().size, total: CONQUISTAS.length }; } catch (e) { /* módulo ausente */ }
    const hist = lerHistSimulados();
    let simTent = 0, simMelhor = 0;
    for (const k in hist) { simTent += hist[k].tentativas || 0; simMelhor = Math.max(simMelhor, hist[k].melhor || 0); }
    return { feitos, diasAtivos, conquistas, simTent, simMelhor };
  }

  // ---------- Compartilhar: link público + resumo pra colar no LinkedIn ----------
  // O link só existe pra quem tem conta: a página /u/<usuario> é montada com o
  // que está no SERVIDOR (quem joga deslogado só tem dados no próprio navegador).
  function linkPerfil() {
    if (!(api && api.usuario)) return "";
    return location.origin + "/u/" + encodeURIComponent(api.usuario);
  }
  function resumoTexto() {
    garantirCampos();
    const nivel = nivelAtual(jogo.xp);
    const m = metricas();
    const s = jogo.streakDias;
    const partes = [
      `${nivel.icone} ${nivel.titulo}`,
      `${jogo.xp.toLocaleString("pt-BR")} XP`,
      `${m.feitos} atividades de AWS CLI concluídas`,
    ];
    if (s.melhor >= 2) partes.push(`${s.melhor} dias seguidos de estudo`);
    if (m.simMelhor) partes.push(`${m.simMelhor}% no simulado Cloud Practitioner`);
    return `🚀 Meu progresso no CLImb — treinando AWS de verdade pela linha de comando:\n` +
      partes.map((x) => "• " + x).join("\n") +
      (linkPerfil() ? `\n\n${linkPerfil()}` : "");
  }

  function cartaoCompartilhar(p) {
    const link = linkPerfil();
    if (!link) {
      return `<div class="perfil-share sem-conta">
        <div class="perfil-share-tit">🔗 Seu perfil público</div>
        <p>Crie uma conta (grátis) pra ganhar um <b>link do seu perfil</b> — dá pra colar no LinkedIn,
        no currículo ou mandar pra alguém, mostrando seu progresso em AWS.</p>
        <button class="botao" data-pf="entrar">👤 Criar conta / Entrar</button>
      </div>`;
    }
    if (p.publico === false) {
      return `<div class="perfil-share fechado">
        <div class="perfil-share-tit">🔒 Seu perfil está fechado</div>
        <p>Ninguém consegue abrir seu link. Pra compartilhar, ligue <b>Perfil público</b> em ✏️ Editar.</p>
      </div>`;
    }
    return `<div class="perfil-share">
      <div class="perfil-share-tit">🔗 Compartilhe seu progresso</div>
      <p>Cole este link no LinkedIn, no currículo ou onde quiser — ele abre uma página
      com o resumo do seu desempenho (sem precisar de login pra ver).</p>
      <div class="perfil-share-link">
        <input id="pfLink" readonly value="${escaparHtml(link)}" spellcheck="false">
        <button class="botao" data-pf="copiar-link">📋 Copiar link</button>
      </div>
      <div class="perfil-share-acoes">
        <button class="botao secundario" data-pf="copiar-resumo">📝 Copiar resumo pro LinkedIn</button>
        <a class="botao secundario" href="${escaparHtml(link)}" target="_blank" rel="noopener">👁️ Ver como ficou</a>
      </div>
      <pre class="perfil-share-previa" id="pfPrevia">${escaparHtml(resumoTexto())}</pre>
    </div>`;
  }

  async function copiar(texto, msg) {
    try {
      await navigator.clipboard.writeText(texto);
      toast(msg, "sucesso");
    } catch (e) {
      // clipboard bloqueado (http, permissão): seleciona pra copiar na mão
      const campo = document.querySelector("#pfLink");
      if (campo) { campo.focus(); campo.select(); }
      toast("Não consegui copiar sozinho — o texto está selecionado, use Ctrl+C.", "neutro");
    }
  }

  function ligarCartaoCompartilhar(corpo) {
    corpo.querySelectorAll("[data-pf]").forEach((b) => {
      b.addEventListener("click", () => {
        const acao = b.dataset.pf;
        if (acao === "copiar-link") return copiar(linkPerfil(), "🔗 Link copiado! Agora é só colar.");
        if (acao === "copiar-resumo") return copiar(resumoTexto(), "📝 Resumo copiado! Cole no LinkedIn.");
        if (acao === "entrar") {
          modal.classList.remove("aberto");
          if (typeof abrirModalConta === "function") { try { return abrirModalConta(); } catch (e) { /* ok */ } }
          const btnConta = document.querySelector("#btnConta");
          if (btnConta) btnConta.click();
        }
      });
    });
  }

  // ---------- Modal ----------
  let modal = null;
  let editando = false;

  function montarModal() {
    modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "modalPerfil";
    modal.innerHTML = `<div class="modal-caixa modal-largo perfil-caixa"><div id="perfilCorpo"></div>
      <div class="modal-acoes"><button class="botao secundario" data-fechar-perfil>Fechar</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector("[data-fechar-perfil]").addEventListener("click", () => modal.classList.remove("aberto"));
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("aberto"); });
  }

  function abrirPerfil() {
    if (!modal) montarModal();
    editando = false;
    renderPerfil();
    modal.classList.add("aberto");
  }
  window.abrirPerfil = abrirPerfil;

  function renderPerfil() {
    garantirCampos();
    const corpo = modal.querySelector("#perfilCorpo");
    const p = jogo.perfilPublico;
    const nome = p.nome || (api && api.usuario) || jogo.nomeJogador || "você";
    const inicial = nome.trim().charAt(0).toUpperCase() || "?";
    const nivel = nivelAtual(jogo.xp);
    const m = metricas();
    const s = jogo.streakDias;
    const gh = linkGithub(p.github);
    const li = linkLinkedin(p.linkedin);
    const membroDesde = (api && api.criadoEm)
      ? `Membro desde ${MESES_CURTO[new Date(api.criadoEm).getMonth()]}/${new Date(api.criadoEm).getFullYear()}`
      : (api && api.usuario ? "" : "Jogando sem conta — progresso salvo neste navegador");

    if (editando) {
      const temConta = !!(api && api.usuario);
      const emailAtual = (api && api.email) || "";
      const statusEmail = !temConta
        ? `<small class="pf-nota">Entre numa conta pra cadastrar um e-mail (é ele que recupera sua senha).</small>`
        : emailAtual
          ? (api.emailVerificado
              ? `<small class="pf-nota ok">✅ E-mail confirmado.</small>`
              : `<small class="pf-nota alerta">⚠️ Ainda não confirmado — veja o link que enviamos.</small>`)
          : `<small class="pf-nota">Sem e-mail cadastrado. Sem ele não dá pra recuperar a senha.</small>`;

      corpo.innerHTML = `
        <h2>🪪 Editar perfil</h2>
        <div class="perfil-form">
          <label>Nome de exibição<input id="pfNome" maxlength="30" value="${escaparHtml(p.nome || "")}" placeholder="${escaparHtml((api && api.usuario) || "seu nome")}"></label>
          <label>Bio<textarea id="pfBio" maxlength="280" rows="3" placeholder="Conte algo sobre você (280 caracteres)">${escaparHtml(p.bio || "")}</textarea></label>
          <label>Localização<input id="pfLocal" maxlength="60" value="${escaparHtml(p.local || "")}" placeholder="Cidade, País"></label>
          <label>GitHub<input id="pfGithub" maxlength="80" value="${escaparHtml(p.github || "")}" placeholder="seu-usuario"></label>
          <label>LinkedIn<input id="pfLinkedin" maxlength="120" value="${escaparHtml(p.linkedin || "")}" placeholder="seu-usuario ou URL do perfil"></label>
          <label>E-mail
            <input id="pfEmail" type="email" maxlength="120" value="${escaparHtml(emailAtual)}"
              placeholder="voce@exemplo.com" autocomplete="email" ${temConta ? "" : "disabled"}>
            ${statusEmail}
          </label>
          <label class="pf-check">
            <input type="checkbox" id="pfPublico" ${p.publico === false ? "" : "checked"}>
            <span>Perfil público — qualquer pessoa com o link <b>${escaparHtml(linkPerfil() || "(precisa de conta)")}</b> vê seu progresso, bio e links. Seu e-mail nunca aparece.</span>
          </label>
          <p class="codigo-erro" id="pfErro"></p>
          <div class="perfil-form-acoes">
            <button class="botao" id="pfSalvar">Salvar</button>
            <button class="botao secundario" id="pfCancelar">Cancelar</button>
          </div>
        </div>`;
      corpo.querySelector("#pfSalvar").addEventListener("click", async () => {
        const btn = corpo.querySelector("#pfSalvar");
        const erro = corpo.querySelector("#pfErro");
        erro.textContent = "";
        p.nome = corpo.querySelector("#pfNome").value.trim();
        p.bio = corpo.querySelector("#pfBio").value.trim();
        p.local = corpo.querySelector("#pfLocal").value.trim();
        p.github = corpo.querySelector("#pfGithub").value.trim();
        p.linkedin = corpo.querySelector("#pfLinkedin").value.trim();
        p.publico = corpo.querySelector("#pfPublico").checked;
        salvarJogo();

        // e-mail vai por outra rota (é dado de conta, não de progresso):
        // trocar o e-mail dispara um novo link de confirmação.
        const novoEmail = (corpo.querySelector("#pfEmail").value || "").trim().toLowerCase();
        let avisoEmail = "";
        if (temConta && novoEmail !== (emailAtual || "").toLowerCase()) {
          if (novoEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(novoEmail)) {
            erro.textContent = "E-mail inválido — confira o endereço.";
            return;
          }
          if (novoEmail) {
            btn.disabled = true;
            btn.textContent = "Salvando…";
            try {
              await apiDefinirEmail(novoEmail);
              avisoEmail = " Confirme o e-mail pelo link que acabamos de enviar.";
            } catch (e) {
              btn.disabled = false;
              btn.textContent = "Salvar";
              erro.textContent = e.message || "Não consegui salvar o e-mail.";
              return;
            }
            btn.disabled = false;
            btn.textContent = "Salvar";
          }
        }
        editando = false;
        renderPerfil();
        if (typeof atualizarBotaoConta === "function") { try { atualizarBotaoConta(); } catch (e) { /* ok */ } }
        toast("✅ Perfil atualizado!" + avisoEmail, "sucesso");
      });
      corpo.querySelector("#pfCancelar").addEventListener("click", () => { editando = false; renderPerfil(); });
      return;
    }

    // progresso por trilha
    let trilhas = "";
    try {
      trilhas = SERVICOS_META.map((sv) => {
        const pr = progressoServico(sv.id);
        if (!pr.total) return "";
        const pct = Math.round((pr.feitos / pr.total) * 100);
        return `<div class="perfil-trilha"><span class="perfil-trilha-nome">${sv.icone} ${escaparHtml(sv.nome)}</span>
          <div class="perfil-trilha-barra"><div style="width:${pct}%"></div></div>
          <span class="perfil-trilha-num">${pr.feitos}/${pr.total}</span></div>`;
      }).join("");
    } catch (e) { /* ok */ }

    // conquistas (grade compacta)
    let conquistasHtml = "";
    try {
      const ja = lerDesbloqueadas();
      conquistasHtml = CONQUISTAS.map((c) =>
        `<span class="perfil-badge ${ja.has(c.id) ? "ok" : "off"}" title="${escaparHtml(c.titulo)} — ${escaparHtml(c.desc)}">${ja.has(c.id) ? c.icone : "🔒"}</span>`
      ).join("");
    } catch (e) { /* ok */ }

    corpo.innerHTML = `
      <div class="perfil-topo">
        <div class="perfil-avatar">${escaparHtml(inicial)}</div>
        <div class="perfil-id">
          <h2>${escaparHtml(nome)}${api && api.usuario ? ` <small class="perfil-arroba">@${escaparHtml(api.usuario)}</small>` : ""}</h2>
          <p class="perfil-nivel">${nivel.icone} ${escaparHtml(nivel.titulo)} · ${jogo.xp} XP</p>
          ${p.local ? `<p class="perfil-meta">📍 ${escaparHtml(p.local)}</p>` : ""}
          ${membroDesde ? `<p class="perfil-meta">${escaparHtml(membroDesde)}</p>` : ""}
          <p class="perfil-links">
            ${gh ? `<a href="${gh}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>` : ""}
            ${li ? `<a href="${li}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>` : ""}
          </p>
        </div>
        <button class="botao secundario perfil-editar" id="pfEditar">✏️ Editar</button>
      </div>
      ${p.bio ? `<p class="perfil-bio">${escaparHtml(p.bio)}</p>` : `<p class="perfil-bio vazia">Sem bio ainda — clique em ✏️ Editar e conte quem é você.</p>`}

      <div class="perfil-metricas">
        <div class="perfil-card"><strong>${m.feitos}</strong><span>atividades<br>concluídas</span></div>
        <div class="perfil-card"><strong>🔥 ${s.atual || 0}</strong><span>dias seguidos<br>(recorde ${s.melhor || 0})</span></div>
        <div class="perfil-card"><strong>${m.diasAtivos}</strong><span>dias<br>ativos</span></div>
        <div class="perfil-card"><strong>${jogo.melhorStreak || 0}</strong><span>melhor sequência<br>de acertos</span></div>
        ${m.conquistas ? `<div class="perfil-card"><strong>${m.conquistas.tem}/${m.conquistas.total}</strong><span>conquistas</span></div>` : ""}
        ${m.simTent ? `<div class="perfil-card"><strong>${m.simMelhor}%</strong><span>melhor simulado<br>(${m.simTent} tentativa${m.simTent === 1 ? "" : "s"})</span></div>` : ""}
      </div>

      ${cartaoCompartilhar(p)}

      <h3 class="perfil-sec">📆 Atividade</h3>
      ${htmlHeatmap()}

      ${conquistasHtml ? `<h3 class="perfil-sec">🏅 Conquistas</h3><div class="perfil-badges">${conquistasHtml}</div>` : ""}

      ${trilhas ? `<h3 class="perfil-sec">🛤️ Trilhas</h3><div class="perfil-trilhas">${trilhas}</div>` : ""}
    `;
    corpo.querySelector("#pfEditar").addEventListener("click", () => { editando = true; renderPerfil(); });
    ligarCartaoCompartilhar(corpo);
  }

  // ---------- Botão no cabeçalho + integração ----------
  document.addEventListener("DOMContentLoaded", () => {
    const header = document.querySelector("header");
    if (header && !document.querySelector("#btnPerfil")) {
      const btn = document.createElement("button");
      btn.id = "btnPerfil";
      btn.className = "botao secundario";
      btn.textContent = "🪪 Perfil";
      btn.title = "Seu perfil: métricas, atividade e conquistas";
      const ref = document.getElementById("btnConquistas") || document.getElementById("btnRanking");
      header.insertBefore(btn, ref || null);
      btn.addEventListener("click", abrirPerfil);
    }
    montarChipDias();
  });

  // mantém o chip em dia sempre que o cabeçalho re-renderiza (login, XP, etc.)
  const renderCabecalhoOriginal = window.renderCabecalho;
  if (typeof renderCabecalhoOriginal === "function") {
    window.renderCabecalho = function () {
      renderCabecalhoOriginal.apply(this, arguments);
      atualizarChipDias();
    };
  }
})();
