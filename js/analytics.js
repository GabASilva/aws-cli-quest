"use strict";
// ============================================================
// CLImb — analytics.js
// Google Analytics 4 (base pro Google Ads).
//
// DESLIGADO por padrão. Só sobe se o servidor devolver gaId em /api/config,
// o que depende do secret GA_ID:
//     flyctl secrets set GA_ID=G-XXXXXXXXXX -a aws-cli-quest
// Sem o secret, este arquivo não carrega nada de terceiro e a CSP do servidor
// continua sem as origens do Google (ver servidor.js).
//
// POR QUE ARQUIVO PRÓPRIO, e não o trecho que o Google manda colar no HTML:
// a CSP do projeto tem script-src sem 'unsafe-inline'. O snippet oficial é
// inline e seria BLOQUEADO calado — nenhum erro visível, só zero dado. Aqui o
// mesmo bootstrap roda a partir da própria origem, sem afrouxar a política.
//
// ATENÇÃO antes de ligar: privacidade.html afirma hoje, sob "Rastreadores",
// que "não existe nenhum. Sem Google Analytics". Ligar o GA_ID sem atualizar
// aquela página deixa a política falsa.
// ============================================================
(function () {
  if (window.__climbAnalytics) return; // idempotente: nunca carrega duas vezes
  window.__climbAnalytics = true;

  function carregarGtag(id) {
    // dataLayer e gtag precisam existir ANTES do script externo chegar — é o
    // que garante que a primeira visita não se perca enquanto ele baixa.
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    // anonymize_ip já é padrão no GA4; explícito aqui pra ficar no registro.
    window.gtag("config", id, { anonymize_ip: true });

    const s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    s.onerror = function () {
      // bloqueador de anúncio, rede caída, CSP: falhar aqui não pode derrubar
      // nada do app — o CLImb funciona inteiro sem métrica.
      console.info("[analytics] gtag não carregou; seguindo sem métrica.");
    };
    document.head.appendChild(s);
  }

  async function iniciar() {
    try {
      const r = await fetch("/api/config", { headers: { Accept: "application/json" } });
      if (!r.ok) return;
      const cfg = await r.json();
      if (cfg && cfg.gaId) carregarGtag(String(cfg.gaId));
    } catch (e) {
      /* offline ou servidor fora: o app roda local, sem métrica. Silencioso. */
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
