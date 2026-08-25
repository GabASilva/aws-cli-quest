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

  // Espera o boot decidir se existe backend.
  //
  // POR QUE ISTO EXISTE: apiConfig() começa com `if (!api.online) return null`,
  // e api.online só vira true depois que apiIniciar() completa uma ida e volta
  // ao servidor. O DOMContentLoaded dispara por volta dos 80ms — nenhuma
  // resposta de rede cabe aí. Resultado: montar() recebia null, caía no
  // `return` e o botão do Google NUNCA aparecia. Estava assim desde que o
  // recurso nasceu (17/06/2026); ninguém percebeu porque a falha é silenciosa.
  //
  // `api` é declarado com const em api.js, então não existe em window — daí o
  // typeof, mesmo cuidado que se toma com `jogo` neste projeto.
  function esperarBackend(limiteMs) {
    return new Promise((ok) => {
      const inicio = Date.now();
      (function tentar() {
        if (typeof api !== "undefined" && api.online) return ok(true);
        if (Date.now() - inicio >= limiteMs) return ok(false);
        setTimeout(tentar, 120);
      })();
    });
  }

  let jaMontou = false;

  async function montar() {
    if (jaMontou) return;
    jaMontou = true; // trava cedo pra duas aberturas seguidas não montarem dois botões
    const desistir = () => { jaMontou = false; }; // libera pra tentar de novo depois

    if (!(await esperarBackend(8000))) return desistir(); // jogo offline: sem botão, e tudo bem
    const cfg = await apiConfig();
    if (!cfg || !cfg.googleClientId) return desistir(); // recurso desligado no servidor

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
    if (!window.google || !window.google.accounts || !window.google.accounts.id) return desistir();

    google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: aoReceberCredencial });
    const area = document.querySelector("#googleArea");
    const alvo = document.querySelector("#googleLogin");
    if (!alvo) return desistir();
    google.accounts.id.renderButton(alvo, { theme: "filled_black", size: "large", text: "continue_with", shape: "pill", locale: "pt-BR" });
    if (area) area.style.display = "";
  }

  // Monta quando o modal de conta ABRE, e não no load da página. Duas razões:
  // quando a pessoa chega aqui o boot já terminou (fim da corrida), e quem
  // nunca tenta entrar não carrega script nenhum do Google — coerente com a
  // política de privacidade, que promete nenhum rastreador para quem só estuda.
  function observarModalDeConta() {
    const modal = document.querySelector("#modalConta");
    if (!modal) return;
    const obs = new MutationObserver(() => {
      if (modal.classList.contains("aberto")) montar();
    });
    obs.observe(modal, { attributes: true, attributeFilter: ["class"] });
    if (modal.classList.contains("aberto")) montar(); // já aberto quando carregou
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observarModalDeConta);
  } else {
    observarModalDeConta();
  }
})();
