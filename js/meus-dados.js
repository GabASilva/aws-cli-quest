"use strict";
// ============================================================
// CLImb — meus-dados.js
// Direitos do titular (LGPD, Art. 18): acesso/portabilidade e eliminação.
//
// Antes disto, apagar uma conta só era possível pelo painel de admin, e não
// havia nenhuma forma de a pessoa ver o que o sistema guarda sobre ela. As
// duas rotas do servidor existem (/api/meus-dados e /api/conta/apagar); este
// arquivo é a parte visível, dentro do modal de Perfil.
//
// ADITIVO: não reescreve perfil.js. Observa o modal e acrescenta a seção no
// fim, porque o conteúdo dele é redesenhado a cada abertura.
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const CHAVE_TOKEN = "awsCliQuest.token";
  function token() {
    try { return localStorage.getItem(CHAVE_TOKEN); } catch (e) { return null; }
  }

  function injetarEstilo() {
    if (document.getElementById("mdEstilo")) return;
    const st = document.createElement("style");
    st.id = "mdEstilo";
    st.textContent = `
      .md-secao {
        margin-top: 1.4rem; padding-top: 1.1rem;
        border-top: 1px solid var(--borda, #2a3650);
      }
      .md-secao h3 {
        font-size: .95rem; margin: 0 0 .35rem; color: var(--texto, #dce3ee);
      }
      .md-secao p {
        margin: 0 0 .9rem; font-size: .82rem; line-height: 1.55;
        color: var(--texto-fraco, #8b99b0);
      }
      .md-acoes { display: flex; flex-wrap: wrap; gap: .6rem; }
      .md-apagar {
        background: none !important; border: 1px solid var(--vermelho, #ff5c5c) !important;
        color: var(--vermelho, #ff5c5c) !important;
      }
      .md-apagar:hover { background: var(--vermelho, #ff5c5c) !important; color: #10151f !important; }
      .md-aviso { font-size: .8rem; margin-top: .7rem; }
      .md-aviso.erro { color: var(--vermelho, #ff5c5c); }
      .md-aviso.ok { color: var(--verde, #3ecf6f); }
      .md-confirma {
        margin-top: .8rem; padding: .9rem; border-radius: .5rem;
        background: var(--painel-2, #1c2638);
        border: 1px solid var(--vermelho, #ff5c5c);
      }
      .md-confirma input {
        width: 100%; margin-top: .5rem; padding: .5rem .6rem;
        background: var(--fundo, #10151f); color: var(--texto, #dce3ee);
        border: 1px solid var(--borda, #2a3650); border-radius: .4rem;
        font-family: inherit;
      }
    `;
    document.head.appendChild(st);
  }

  function aviso(caixa, texto, classe) {
    let el = caixa.querySelector(".md-aviso");
    if (!el) {
      el = document.createElement("p");
      el.className = "md-aviso";
      el.setAttribute("role", "status");
      caixa.appendChild(el);
    }
    el.className = "md-aviso " + (classe || "");
    el.textContent = texto;
  }

  // ---------- baixar ----------
  async function baixarDados(caixa) {
    const t = token();
    if (!t) return aviso(caixa, "Faça login primeiro.", "erro");
    aviso(caixa, "Preparando…", "");
    try {
      const r = await fetch("/api/meus-dados", { headers: { Authorization: "Bearer " + t } });
      const j = await r.json();
      if (!r.ok) return aviso(caixa, j.erro || "Não consegui buscar seus dados.", "erro");
      const blob = new Blob([JSON.stringify(j, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "climb-meus-dados-" + (j.usuario || "conta") + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      aviso(caixa, "Arquivo baixado. É tudo o que o CLImb guarda sobre você.", "ok");
    } catch (e) {
      aviso(caixa, "Falhou: " + e.message, "erro");
    }
  }

  // ---------- apagar ----------
  function pedirConfirmacao(caixa) {
    if (caixa.querySelector(".md-confirma")) return;
    // Conta criada pelo Google não tem senha: aí a confirmação é o nome.
    const viaGoogle = !!(document.querySelector("#modalPerfil") || {}).dataset
      && document.querySelector("#modalPerfil").dataset.google === "1";
    const box = document.createElement("div");
    box.className = "md-confirma";
    box.innerHTML =
      "<p style='margin:0;font-size:.82rem'><b>Isto não tem volta.</b> Some a conta, o progresso, " +
      "o XP, as conquistas e o perfil público. Não guardamos cópia.</p>" +
      "<label style='display:block;margin-top:.6rem;font-size:.8rem'>" +
      (viaGoogle ? "Digite seu <b>nome de usuário</b> para confirmar:" : "Digite sua <b>senha</b> para confirmar:") +
      "<input type='" + (viaGoogle ? "text" : "password") + "' id='mdConfirma' autocomplete='off'></label>" +
      "<div class='md-acoes' style='margin-top:.7rem'>" +
      "<button class='botao md-apagar' id='mdApagarJa'>Apagar definitivamente</button>" +
      "<button class='botao secundario' id='mdCancelar'>Cancelar</button></div>";
    caixa.appendChild(box);
    box.querySelector("#mdConfirma").focus();
    box.querySelector("#mdCancelar").addEventListener("click", () => box.remove());
    box.querySelector("#mdApagarJa").addEventListener("click", () => apagar(caixa, box));
  }

  async function apagar(caixa, box) {
    const t = token();
    const conf = (box.querySelector("#mdConfirma") || {}).value || "";
    if (!conf) return aviso(caixa, "Preencha a confirmação.", "erro");
    aviso(caixa, "Apagando…", "");
    try {
      const r = await fetch("/api/conta/apagar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: JSON.stringify({ confirmacao: conf }),
      });
      const j = await r.json();
      if (!r.ok) return aviso(caixa, j.erro || "Não consegui apagar.", "erro");
      try { localStorage.removeItem(CHAVE_TOKEN); } catch (e) { /* ok */ }
      alert("Conta apagada. Obrigado por ter usado o CLImb.");
      location.reload();
    } catch (e) {
      aviso(caixa, "Falhou: " + e.message, "erro");
    }
  }

  // ---------- montagem ----------
  function montarSecao() {
    const modal = document.querySelector("#modalPerfil");
    if (!modal || modal.querySelector(".md-secao")) return;
    if (!token()) return; // sem conta não há dado pessoal pra tratar
    // #perfilCorpo e redesenhado a cada abertura — por isso o observer acima
    const corpo = modal.querySelector("#perfilCorpo") || modal.querySelector(".modal-caixa") || modal;

    const sec = document.createElement("div");
    sec.className = "md-secao";
    sec.innerHTML =
      "<h3>🔐 Seus dados</h3>" +
      "<p>O CLImb guarda seu usuário, e-mail (se você informou), progresso e XP. " +
      "A senha fica só como <b>hash</b> — nem nós conseguimos lê-la. " +
      "Você pode levar tudo embora ou apagar a conta quando quiser.</p>" +
      "<div class='md-acoes'>" +
      "<button class='botao secundario' id='mdBaixar'>⬇️ Baixar meus dados (JSON)</button>" +
      "<button class='botao md-apagar' id='mdApagar'>Apagar minha conta</button>" +
      "</div>";
    corpo.appendChild(sec);
    sec.querySelector("#mdBaixar").addEventListener("click", () => baixarDados(sec));
    sec.querySelector("#mdApagar").addEventListener("click", () => pedirConfirmacao(sec));
  }

  function iniciar() {
    injetarEstilo();
    // o modal é redesenhado a cada abertura; observamos em vez de embrulhar
    const obs = new MutationObserver(() => montarSecao());
    obs.observe(document.body, { childList: true, subtree: true });
    montarSecao();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
