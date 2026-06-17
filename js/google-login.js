"use strict";
// ============================================================
// AWS CLI Quest — google-login.js
// Login "one-click" com Conta Google (Google Identity Services).
// Só aparece se o servidor tiver GOOGLE_CLIENT_ID configurado (env).
// ADITIVO: não toca o core; reusa entrarComConta/renders do app.
// ============================================================

(function () {
  if (typeof window === "undefined") return;

  // reaproveita o pós-login do app (vincula progresso, fecha modal, renderiza)
  function aposLogarGoogle(r) {
    const res = entrarComConta(r.perfil, r.progresso);
    fecharModais();
    atualizarBotaoConta();
    ui.desafioAtivo = null;
    document.querySelector("#saidaTerminal").innerHTML = "";
    boasVindas();
    renderCabecalho();
    renderSidebar();
    renderCard();
    const msg = res.tinhaLocal ? "Progresso vinculado à sua conta." : "Bons estudos!";
    toast(`👋 Olá, <strong>${escaparHtml(api.usuario)}</strong>! Entrou com o Google. ${msg}`, "sucesso");
  }

  async function aoReceberCredencial(resp) {
    try {
      const r = await apiGoogle(resp.credential);
      aposLogarGoogle(r);
    } catch (e) {
      const erro = document.querySelector("#contaErro");
      if (erro) erro.textContent = e.message || "Não consegui entrar com o Google.";
    }
  }

  async function montar() {
    const cfg = await apiConfig();
    if (!cfg || !cfg.googleClientId) return; // recurso desligado: nada aparece
    // carrega o script do Google Identity Services
    await new Promise((resolve) => {
      if (window.google && window.google.accounts) return resolve();
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.onload = resolve;
      s.onerror = resolve; // se falhar, só não mostra o botão
      document.head.appendChild(s);
    });
    if (!window.google || !window.google.accounts || !window.google.accounts.id) return;
    google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: aoReceberCredencial });
    const area = document.querySelector("#googleArea");
    const alvo = document.querySelector("#googleLogin");
    if (alvo) {
      google.accounts.id.renderButton(alvo, { theme: "filled_black", size: "large", text: "continue_with", shape: "pill", locale: "pt-BR" });
      if (area) area.style.display = "";
    }
  }

  document.addEventListener("DOMContentLoaded", montar);
})();
