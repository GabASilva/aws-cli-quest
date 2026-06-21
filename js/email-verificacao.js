"use strict";
// ============================================================
// CLImb — email-verificacao.js
// Confirmação de e-mail: trata o link ?verificar=TOKEN, mostra um banner
// discreto pra quem está logado com e-mail ainda não confirmado (com botão
// de reenviar) e some quando confirma. ADITIVO: usa api/apiFetch/toast do
// resto da app. Não toca o core.
// ============================================================
(function () {
  if (typeof window === "undefined") return;

  let dispensadoNaSessao = false;
  let banner = null;

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function montarBanner() {
    banner = document.createElement("div");
    banner.id = "bannerEmail";
    banner.className = "banner-email";
    banner.style.display = "none";
    banner.innerHTML = `
      <span class="banner-txt">📧 Confirme seu e-mail <b id="bannerEmailEnd"></b> — garante a recuperação de senha e a entrada em competições.</span>
      <span class="banner-acoes">
        <button class="botao secundario" id="bannerReenviar" type="button">Reenviar e-mail</button>
        <button class="botao secundario" id="bannerJaConfirmei" type="button">Já confirmei</button>
        <button class="banner-x" id="bannerFechar" title="Fechar" type="button">✕</button>
      </span>`;
    const main = document.querySelector("main");
    if (main && main.parentNode) main.parentNode.insertBefore(banner, main);
    else document.body.insertBefore(banner, document.body.firstChild);

    banner.querySelector("#bannerFechar").addEventListener("click", () => { dispensadoNaSessao = true; atualizarBanner(); });
    banner.querySelector("#bannerReenviar").addEventListener("click", reenviar);
    banner.querySelector("#bannerJaConfirmei").addEventListener("click", jaConfirmei);
  }

  function precisaConfirmar() {
    return !!(typeof api !== "undefined" && api.online && api.usuario && api.email && !api.emailVerificado);
  }

  function atualizarBanner() {
    if (!banner) return;
    if (precisaConfirmar() && !dispensadoNaSessao) {
      banner.querySelector("#bannerEmailEnd").textContent = api.email ? `(${api.email})` : "";
      banner.style.display = "";
    } else {
      banner.style.display = "none";
    }
  }

  async function reenviar() {
    try {
      const r = await apiReenviarVerificacao();
      if (r && r.jaVerificado) { api.emailVerificado = true; atualizarBanner(); toast("Seu e-mail já estava confirmado. ✅", "neutro"); return; }
      toast("📧 Reenviei o link de confirmação pro seu e-mail.", "sucesso");
    } catch (e) {
      toast(e.message || "Não consegui reenviar agora.", "erro");
    }
  }

  // Reconsulta o /api/eu pra ver se já confirmou (ex.: clicou no link em outra aba).
  async function jaConfirmei() {
    try {
      const r = await apiFetch("/api/eu");
      api.emailVerificado = !!r.emailVerificado;
      atualizarBanner();
      toast(api.emailVerificado ? "✅ E-mail confirmado, valeu!" : "Ainda não confirmei aqui — abra o link que enviei no e-mail.", api.emailVerificado ? "sucesso" : "neutro");
    } catch (e) {
      toast("Não consegui checar agora.", "erro");
    }
  }

  async function tratarLinkVerificacao() {
    const token = new URLSearchParams(location.search).get("verificar");
    if (!token) return;
    history.replaceState(null, "", location.pathname); // tira o token da URL
    try {
      await apiVerificarEmail(token);
      atualizarBanner();
      if (typeof toast === "function") toast("✅ <strong>E-mail confirmado!</strong> Obrigado.", "sucesso");
    } catch (e) {
      if (typeof toast === "function") toast(e.message || "Link de confirmação inválido ou expirado.", "erro");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    montarBanner();
    tratarLinkVerificacao();
    // o app revela o estado de login de forma assíncrona; reflete quando mudar
    const orig = window.atualizarBotaoConta;
    if (typeof orig === "function") {
      window.atualizarBotaoConta = function () { orig.apply(this, arguments); atualizarBanner(); };
    }
    // primeira checagem (e de novo após o apiIniciar resolver)
    setTimeout(atualizarBanner, 300);
    setTimeout(atualizarBanner, 1500);
  });

  window.atualizarBannerEmail = atualizarBanner;
})();
