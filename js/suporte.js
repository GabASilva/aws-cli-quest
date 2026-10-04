"use strict";
// ============================================================
// CLImb — suporte.js
// "💬 Ajuda": perguntas frequentes + formulário que chega no e-mail do Gabriel
// (POST /api/suporte). Pedido do Gabriel em 30/09/2026: antes o único canal era
// um e-mail escondido na página de privacidade, e o app dizia "fale com o
// responsável" sem dizer como — justo em pagamento e escola.
//
// O que diferencia de um "mailto": a mensagem já leva o CONTEXTO (atividade
// aberta, trilha, últimos comandos, navegador, plano), e o botão "⚠️ Reportar
// problema nesta atividade" no card preenche tudo — é o relato que acha
// validador quebrado. A pessoa vê o que vai junto e pode tirar.
//
// Onde abre: botão do rodapé (#btnAjuda, no index.html desde o HTML), o card
// da atividade, e qualquer [data-abrir-suporte="tipo"] na página.
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const TIPOS = [["duvida", "Dúvida"], ["problema", "Algo não funciona"], ["atividade", "Problema numa atividade"], ["pagamento", "Pagamento / plano"], ["escola", "Escola / professor"]];
  // As perguntas que mais geram mensagem — respondidas antes do formulário.
  const FAQ = [
    ["Paguei e o Pro não liberou", "O Mercado Pago avisa o CLImb quando o pagamento é aprovado — no Pix e no cartão costuma ser na hora; no boleto, até 3 dias úteis. Recarregue a página (a licença é relida sempre que o CLImb abre). Se passou disso, mande a mensagem abaixo com o tipo <b>Pagamento</b>."],
    ["Tenho um código de ativação", "Abra <b>⭐ Pro</b> (no topo), cole o código em <b>Tem um código de ativação?</b> e clique em Resgatar. Cada código vale uma vez."],
    ["Digitei o comando certo e a atividade não completou", "Confira a dica e o manual (<code>aws &lt;serviço&gt; &lt;comando&gt; help</code>). Se mesmo assim não passar, use <b>⚠️ Reportar problema nesta atividade</b>, no card da atividade: a mensagem já vai com o que você digitou — quase sempre é um erro nosso, e é corrigido."],
    ["Sou professor / minha escola quer usar", "Em <b>👥 Turmas</b>, peça a conta de professor (grátis, com painel da turma). Se a escola quiser pagar as vagas dos alunos, mande a mensagem com o tipo <b>Escola</b>."],
    ["Quero apagar minha conta ou baixar meus dados", "Em <b>👤 Você → Perfil → Seus dados</b> ficam os dois botões (LGPD). Dúvidas: <a href=\"/privacidade.html\">política de privacidade</a>."],
  ];

  let modal = null;
  let tipoInicial = "duvida";
  let comContexto = true;

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  function contexto() {
    const d = typeof ui !== "undefined" && ui.desafioAtivo && typeof obterDesafio === "function" ? obterDesafio(ui.desafioAtivo) : null;
    const hist = typeof ui !== "undefined" && Array.isArray(ui.historicoCmd) ? ui.historicoCmd.slice(-10) : [];
    return {
      atividade: d ? d.id + " — " + d.titulo : "",
      trilha: d ? d.servico : "",
      ambiente: typeof jogo !== "undefined" && jogo && jogo.ambiente ? jogo.ambiente : "",
      comandos: hist,
      pagina: location.pathname,
      navegador: navigator.userAgent,
    };
  }

  function resumoContexto(c) {
    const partes = [];
    if (c.atividade) partes.push("atividade <b>" + esc(c.atividade) + "</b>");
    if (c.comandos.length) partes.push(c.comandos.length + " último(s) comando(s) do terminal");
    partes.push("navegador");
    if (typeof api !== "undefined" && api.usuario) partes.push("seu usuário e plano");
    return partes.join(", ");
  }

  function montar() {
    if (modal) return;
    modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "modalSuporte";
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.closest("[data-fechar-suporte]")) fechar();
    });
    modal.addEventListener("submit", enviar);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("aberto")) fechar(); });
  }

  function fechar() { modal.classList.remove("aberto"); }

  function abrir(tipo) {
    montar();
    tipoInicial = TIPOS.some(([t]) => t === tipo) ? tipo : "duvida";
    comContexto = true;
    render();
    modal.classList.add("aberto");
    const campo = modal.querySelector("textarea");
    if (campo && tipo) setTimeout(() => campo.focus(), 50);
  }

  function render(enviado) {
    const c = contexto();
    const logado = typeof api !== "undefined" && api.usuario;
    const emailConta = typeof api !== "undefined" && api.email ? api.email : "";
    const faq = FAQ.map(([p, r]) => `<details class="sup-faq"><summary>${esc(p)}</summary><p>${r}</p></details>`).join("");
    const corpo = enviado ? `
        <div class="sup-ok">✅ Recebi! Respondo no e-mail <b>${esc(enviado.email)}</b> — normalmente no mesmo dia.
          <br><small>Protocolo: <code>${esc(enviado.id)}</code></small></div>
        <div class="modal-acoes"><button class="botao" data-fechar-suporte type="button">Fechar</button></div>` : `
        <h3 class="sup-sub">Perguntas frequentes</h3>
        ${faq}
        <h3 class="sup-sub">Ainda precisa de ajuda? Fale comigo</h3>
        <form class="sup-form">
          <label>Sobre o quê
            <select name="tipo">${TIPOS.map(([t, n]) => `<option value="${t}"${t === tipoInicial ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>
          </label>
          <label>Mensagem
            <textarea name="mensagem" rows="5" maxlength="3000" placeholder="${tipoInicial === "atividade" ? "O que você digitou e o que esperava que acontecesse?" : "Conte o que aconteceu ou o que você precisa."}"></textarea>
          </label>
          <label>E-mail pra resposta
            <input name="email" type="email" maxlength="120" value="${esc(emailConta)}" placeholder="voce@exemplo.com" autocomplete="email" ${logado && emailConta ? "" : "required"}>
          </label>
          <label class="sup-ctx"><input type="checkbox" name="ctx" ${comContexto ? "checked" : ""}>
            <span>Enviar junto: ${resumoContexto(c)}. Ajuda a achar o problema mais rápido.</span></label>
          <p class="conta-erro" id="supErro"></p>
          <div class="modal-acoes">
            <button class="botao secundario" data-fechar-suporte type="button">Cancelar</button>
            <button class="botao" type="submit">Enviar</button>
          </div>
          <p class="sup-rodape">Prefere e-mail? <a href="mailto:contato@climb.dev.br">contato@climb.dev.br</a></p>
        </form>`;
    modal.innerHTML = `<div class="modal-caixa sup-caixa" role="dialog" aria-labelledby="supTitulo">
        <h2 id="supTitulo">💬 Ajuda</h2>${corpo}</div>`;
  }

  async function enviar(e) {
    const form = e.target.closest(".sup-form");
    if (!form) return;
    e.preventDefault();
    const erro = form.querySelector("#supErro");
    const btn = form.querySelector("button[type=submit]");
    const mensagem = form.mensagem.value.trim();
    const email = form.email.value.trim();
    if (mensagem.length < 10) { erro.textContent = "Conte um pouco mais (pelo menos uma frase)."; return; }
    if (typeof api === "undefined" || !api.online) {
      erro.innerHTML = `O servidor está fora do ar agora. Mande por e-mail: <a href="mailto:contato@climb.dev.br">contato@climb.dev.br</a>`;
      return;
    }
    btn.disabled = true; btn.textContent = "Enviando…"; erro.textContent = "";
    try {
      const r = await apiSuporte(form.tipo.value, mensagem, email, form.ctx.checked ? contexto() : {});
      render({ id: r.id, email: email || (api.email || "") });
    } catch (err) {
      erro.textContent = err.message || "Não consegui enviar. Tente de novo ou mande por e-mail.";
      btn.disabled = false; btn.textContent = "Enviar";
    }
  }

  // "⚠️ Reportar problema nesta atividade" no fim do card — o card é redesenhado
  // a cada render, então o link volta junto (embrulho do renderCard).
  function linkNoCard() {
    const alvo = document.getElementById("cardDesafio");
    if (!alvo || typeof ui === "undefined" || !ui.desafioAtivo || alvo.querySelector(".sup-reportar")) return;
    const p = document.createElement("p");
    p.className = "sup-reportar";
    p.innerHTML = `<button type="button" class="sala-link" data-abrir-suporte="atividade">⚠️ Reportar problema nesta atividade</button>`;
    (alvo.firstElementChild || alvo).appendChild(p);
  }

  function ligar() {
    const b = document.getElementById("btnAjuda");
    if (b && !b.__sup) { b.__sup = true; b.addEventListener("click", () => abrir()); }
    document.addEventListener("click", (e) => {
      const a = e.target.closest("[data-abrir-suporte]");
      if (!a) return;
      e.preventDefault();
      if (typeof fecharModais === "function" && !a.closest("#modalSuporte")) { try { fecharModais(); } catch (_) {} }
      abrir(a.dataset.abrirSuporte);
    });
    if (typeof window.renderCard === "function" && !window.renderCard.__sup) {
      const rc = window.renderCard;
      const envolvido = function () { const r = rc.apply(this, arguments); try { linkNoCard(); } catch (_) {} return r; };
      envolvido.__sup = true;
      // preserva a marca de quem já embrulhou (sandbox.js), pra não embrulharem de novo
      if (rc.__sbx) envolvido.__sbx = true;
      window.renderCard = envolvido;
      try { renderCard = envolvido; } catch (_) {}
    }
    try { linkNoCard(); } catch (_) {}
  }

  // Links de entrada vindos das páginas públicas (/escolas): ?abrir=turmas abre
  // 👥 Turmas (onde se pede a conta de professor) e ?abrir=ajuda-<tipo> abre
  // este formulário já no tipo. Espera o app montar e a sessão voltar da nuvem
  // — o Turmas aberto antes do login mostraria "entre na sua conta" a quem já
  // está logado. Depois tira o parâmetro da URL, pra recarregar não reabrir.
  function linkDeEntrada() {
    let alvo = "";
    try { alvo = new URLSearchParams(location.search).get("abrir") || ""; } catch (_) { return; }
    if (!/^(turmas|ajuda(-[a-z]+)?)$/.test(alvo)) return;
    let temSessao = false;
    try { temSessao = !!localStorage.getItem("awsCliQuest.token"); } catch (_) {}
    const inicio = Date.now();
    const tentar = () => {
      const montou = document.body.classList.contains("app-pronto");
      const sessaoPronta = !temSessao || (typeof api !== "undefined" && api.usuario);
      if (!(montou && sessaoPronta) && Date.now() - inicio < 5000) { setTimeout(tentar, 150); return; }
      try { history.replaceState(null, "", location.pathname + location.hash); } catch (_) {}
      if (alvo === "turmas" && typeof window.abrirTurmas === "function") window.abrirTurmas();
      else if (alvo.startsWith("ajuda")) abrir(alvo.slice(6));
    };
    tentar();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { ligar(); linkDeEntrada(); });
  else { ligar(); linkDeEntrada(); }
  window.abrirSuporte = abrir;
})();
