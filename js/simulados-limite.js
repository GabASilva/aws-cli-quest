"use strict";
// ============================================================
// CLImb — simulados-limite.js
// Trava do plano free nos simulados: 1 simulado por dia (Pro = ilimitado).
//
// COMO FUNCIONA
//  - Logado: o SERVIDOR manda (/api/simulados/status e /registrar). Não dá pra
//    burlar limpando o localStorage — a contagem mora na conta.
//  - Deslogado (anônimo): contagem no localStorage, o melhor que dá sem conta
//    (travar por IP derrubaria uma escola inteira, que sai por um IP só).
//  - A tentativa é consumida quando a prova é ENTREGUE, não ao iniciar: quem
//    fecha a aba sem querer ou desiste no meio não perde o dia.
//  - O dia vira à meia-noite de BRASÍLIA (igual ao servidor), não em UTC.
//
// ADITIVO: expõe os 3 ganchos que o simulados.js consulta —
//   window.simuladoPodeIniciar()  -> Promise<bool>  (portão, antes de começar)
//   window.simuladoEntregue(cert, pct)              (consome a tentativa)
//   window.simuladoFaixaHome()    -> string HTML    (faixa na tela inicial)
// ============================================================

(function () {
  if (typeof window === "undefined") return;

  const CHAVE_DIA = "climb.simulados.dia"; // uso do dia (só pra anônimo)
  const LIMITE_FREE = 1;
  const FUSO_BR_MS = 3 * 60 * 60 * 1000;

  // dia "de Brasília" (mesma regra do servidor)
  function diaBr(agora) {
    return new Date((agora || Date.now()) - FUSO_BR_MS).toISOString().slice(0, 10);
  }
  function proximaLiberacao() {
    const meiaNoiteBr = new Date(diaBr() + "T00:00:00.000Z").getTime() + FUSO_BR_MS;
    return meiaNoiteBr + 24 * 60 * 60 * 1000;
  }
  function faltaPara(ts) {
    const ms = Math.max(0, (ts || proximaLiberacao()) - Date.now());
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
    return `${m} min`;
  }
  function ehPro() {
    try { return typeof temPro === "function" && temPro(); } catch (e) { return false; }
  }
  function logado() {
    return !!(typeof api !== "undefined" && api && api.usuario && api.online);
  }

  // ---------- contagem local (anônimo) ----------
  function lerLocal() {
    try {
      const d = JSON.parse(localStorage.getItem(CHAVE_DIA) || "{}");
      if (d && d.dia === diaBr()) return { dia: d.dia, feitos: d.feitos || 0 };
    } catch (e) { /* ok */ }
    return { dia: diaBr(), feitos: 0 };
  }
  function gravarLocal(d) {
    try { localStorage.setItem(CHAVE_DIA, JSON.stringify(d)); } catch (e) { /* ok */ }
  }
  function situacaoLocal() {
    const d = lerLocal();
    return {
      pro: false, limite: LIMITE_FREE, feitos: d.feitos,
      restantes: Math.max(0, LIMITE_FREE - d.feitos),
      podeIniciar: d.feitos < LIMITE_FREE,
      proximaLiberacao: proximaLiberacao(),
      local: true,
    };
  }

  // ---------- estado (cache pro render síncrono da faixa) ----------
  let estado = null;

  function situacaoPro() {
    return { pro: true, limite: null, feitos: 0, restantes: null, podeIniciar: true, proximaLiberacao: null };
  }

  // Busca a situação atual — servidor quando logado, local quando anônimo.
  async function buscarSituacao() {
    if (ehPro()) { estado = situacaoPro(); return estado; }
    if (logado() && typeof apiSimuladosStatus === "function") {
      try {
        estado = await apiSimuladosStatus();
        return estado;
      } catch (e) {
        // servidor fora do ar / sessão caiu: não trava o aluno injustamente
        estado = situacaoLocal();
        return estado;
      }
    }
    estado = situacaoLocal();
    return estado;
  }

  // ---------- gancho 1: portão antes de iniciar a prova ----------
  window.simuladoPodeIniciar = async function () {
    const s = await buscarSituacao();
    atualizarFaixa();
    if (s.podeIniciar) return true;
    if (typeof toast === "function") {
      toast(`🔒 <strong>Você já fez seu simulado de hoje.</strong> Libera em ${faltaPara(s.proximaLiberacao)} — ou vire Pro pra fazer quantos quiser.`, "neutro");
    }
    const faixa = document.querySelector("#simFaixaLimite");
    if (faixa) faixa.scrollIntoView({ block: "nearest" });
    return false;
  };

  // ---------- gancho 2: prova entregue -> consome a tentativa ----------
  window.simuladoEntregue = async function () {
    if (ehPro()) return;
    if (logado() && typeof apiSimuladosRegistrar === "function") {
      try {
        estado = await apiSimuladosRegistrar();
      } catch (e) {
        // 403 (já tinha usado) ou rede: reflete o que o servidor disser depois
        try { estado = await apiSimuladosStatus(); } catch (e2) { /* ok */ }
      }
    } else {
      const d = lerLocal();
      d.feitos += 1;
      gravarLocal(d);
      estado = situacaoLocal();
    }
    atualizarFaixa();
  };

  // ---------- gancho 3: faixa na tela inicial dos simulados ----------
  window.simuladoFaixaHome = function () {
    // dispara a atualização em background (o cache pinta agora, o servidor corrige em seguida)
    buscarSituacao().then(atualizarFaixa);
    return htmlFaixa(estado);
  };

  function htmlFaixa(s) {
    if (!s) return `<div class="sim-limite" id="simFaixaLimite"></div>`;
    if (s.pro) {
      return `<div class="sim-limite pro" id="simFaixaLimite">
        <span class="sim-limite-ic">⭐</span>
        <div><strong>Pro: simulados ilimitados.</strong>
        <small>Faça quantas provas quiser, todo dia.</small></div>
      </div>`;
    }
    if (!s.podeIniciar) {
      return `<div class="sim-limite bloqueado" id="simFaixaLimite">
        <span class="sim-limite-ic">🔒</span>
        <div><strong>Você já fez seu simulado de hoje.</strong>
        <small>No plano gratuito é 1 por dia — o próximo libera em <b>${faltaPara(s.proximaLiberacao)}</b>.</small></div>
        <button class="sim-btn-pro" data-acao-limite="pro">⭐ Quero ilimitado</button>
      </div>`;
    }
    return `<div class="sim-limite" id="simFaixaLimite">
      <span class="sim-limite-ic">🎟️</span>
      <div><strong>Plano gratuito: 1 simulado por dia.</strong>
      <small>Você ainda tem <b>${s.restantes} simulado</b> hoje. A vez só é usada quando você <b>entrega</b> a prova.</small></div>
      <button class="sim-btn-pro" data-acao-limite="pro">⭐ Ver o Pro</button>
    </div>`;
  }

  function atualizarFaixa() {
    const atual = document.querySelector("#simFaixaLimite");
    if (!atual) return;
    const novo = document.createElement("div");
    novo.innerHTML = htmlFaixa(estado);
    atual.replaceWith(novo.firstElementChild);
  }

  // clique no CTA do Pro: fecha o simulado e abre o painel de planos
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest('[data-acao-limite="pro"]');
    if (!b) return;
    e.preventDefault();
    const sair = document.querySelector("#simSair");
    if (sair) sair.click();
    const btnPlano = document.querySelector("#btnPlano");
    if (btnPlano) btnPlano.click();
    else if (typeof toast === "function") toast("Assine o Pro pelo botão ⭐ no topo. 🙂", "neutro");
  });

  // estilo da faixa (o simulados.js injeta o dele em #simEstilo; aqui vai o nosso)
  document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("simLimiteEstilo")) return;
    const st = document.createElement("style");
    st.id = "simLimiteEstilo";
    st.textContent = `
      .sim-limite { display:flex; align-items:center; gap:12px; margin:0 0 16px;
        padding:12px 16px; border-radius:12px; background:#1c2638; border:1px solid #2a3650; }
      .sim-limite.bloqueado { border-color:#ff9900; background:rgba(255,153,0,0.08); }
      .sim-limite.pro { border-color:#3ecf6f; background:rgba(62,207,111,0.08); }
      .sim-limite-ic { font-size:1.5rem; flex:0 0 auto; }
      .sim-limite div { flex:1; min-width:0; }
      .sim-limite strong { display:block; font-size:0.92rem; }
      .sim-limite small { color:#8b99b0; font-size:0.8rem; line-height:1.4; display:block; margin-top:2px; }
      .sim-btn-pro { flex:0 0 auto; cursor:pointer; border:none; border-radius:20px;
        padding:8px 16px; font-weight:700; font-size:0.82rem;
        background:linear-gradient(90deg,#cc7a00,#ff9900); color:#10151f; }
      .sim-btn-pro:hover { filter:brightness(1.1); }
      @media (max-width:600px){ .sim-limite { flex-wrap:wrap; } .sim-btn-pro { width:100%; } }`;
    document.head.appendChild(st);
  });

  // se a licença mudar (login, resgate de código, volta do checkout), re-checa
  const atualizarBotaoPlanoOriginal = window.atualizarBotaoPlano;
  if (typeof atualizarBotaoPlanoOriginal === "function") {
    window.atualizarBotaoPlano = function () {
      atualizarBotaoPlanoOriginal.apply(this, arguments);
      estado = null;
      buscarSituacao().then(atualizarFaixa);
    };
  }
})();
