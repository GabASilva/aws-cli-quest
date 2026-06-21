"use strict";
// ============================================================
// CLImb — eventos-aviso.js
// Mostra os eventos/avisos ativos (criados pelo admin no painel) pra galera,
// uma vez por evento (guarda os vistos no localStorage). ADITIVO: usa toast.
// ============================================================
(function () {
  if (typeof window === "undefined") return;
  const CHAVE = "climb.eventos.vistos";

  function vistos() { try { return JSON.parse(localStorage.getItem(CHAVE) || "[]"); } catch (e) { return []; } }
  function marcar(ids) { try { localStorage.setItem(CHAVE, JSON.stringify(ids.slice(-50))); } catch (e) {} }

  async function carregar() {
    let eventos = [];
    try {
      const r = await fetch("/api/eventos");
      if (!r.ok) return;
      eventos = (await r.json()).eventos || [];
    } catch (e) { return; }
    if (!eventos.length || typeof toast !== "function") return;
    const ja = vistos();
    const novos = [];
    for (const e of eventos) {
      if (ja.includes(e.id)) continue;
      const icone = e.tipo === "competicao" ? "🏁" : "📣";
      toast(`${icone} <strong>${escapar(e.titulo)}</strong>${e.mensagem ? "<br>" + escapar(e.mensagem) : ""}`, "nivel");
      novos.push(e.id);
    }
    if (novos.length) marcar(ja.concat(novos));
  }
  function escapar(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  document.addEventListener("DOMContentLoaded", () => setTimeout(carregar, 1800));
})();
