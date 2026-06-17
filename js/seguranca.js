"use strict";
// ============================================================
// AWS CLI Quest — seguranca.js
// Painel de segurança da conta: ativar/desativar 2FA (TOTP).
// O segredo é mostrado pra ENTRADA MANUAL no app autenticador (nunca é
// enviado a um gerador de QR externo, pra não vazar o segredo).
// ADITIVO: injeta botão "🔐 Segurança" (só logado) + modal. Não toca o core.
// ============================================================

(function () {
  if (typeof window === "undefined") return;

  function atualizarBotaoSeguranca() {
    const btn = document.querySelector("#btnSeguranca");
    if (!btn) return;
    btn.style.display = api.usuario ? "" : "none";
    btn.textContent = api.twofa ? "🔐 2FA ✓" : "🔐 Segurança";
    btn.title = api.twofa ? "2FA ativado — clique pra gerenciar" : "Ative a verificação em 2 etapas (2FA)";
  }

  function abrir() {
    if (!api.usuario) { toast("Entre na sua conta pra configurar a segurança. 👤", "neutro"); return; }
    renderConteudo();
    document.querySelector("#modalSeguranca").classList.add("aberto");
  }

  function renderConteudo() {
    const alvo = document.querySelector("#segurancaCorpo");
    if (api.twofa) {
      alvo.innerHTML = `
        <p class="seg-status ok">✅ 2FA está <strong>ativado</strong> nesta conta.</p>
        <p class="conta-explica">Pra desativar, confirme sua senha:</p>
        <div class="linha-codigo">
          <input id="segSenha" type="password" placeholder="sua senha" autocomplete="off">
          <button class="botao perigo" id="btnDesativar2fa">Desativar 2FA</button>
        </div>
        <p class="codigo-erro" id="segErro"></p>`;
      alvo.querySelector("#btnDesativar2fa").addEventListener("click", desativar);
    } else {
      alvo.innerHTML = `
        <p class="conta-explica">A verificação em 2 etapas (2FA) pede um código do seu celular além da senha — protege a conta mesmo se a senha vazar.</p>
        <button class="botao" id="btnIniciar2fa">Ativar 2FA</button>
        <div id="seg2faPassos" style="display:none">
          <ol class="seg-passos">
            <li>Abra um app autenticador (Google Authenticator, Authy, Microsoft Authenticator...).</li>
            <li>Adicione uma conta <strong>manualmente</strong> e cole esta chave:</li>
          </ol>
          <div class="seg-segredo"><code id="segSegredo"></code><button class="botao secundario" id="btnCopiarSegredo" type="button">Copiar</button></div>
          <p class="conta-explica">3. Digite o código de 6 dígitos que o app mostrar:</p>
          <div class="linha-codigo">
            <input id="segCodigo" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="off">
            <button class="botao" id="btnConfirmar2fa">Confirmar</button>
          </div>
          <p class="codigo-erro" id="segErro"></p>
        </div>`;
      alvo.querySelector("#btnIniciar2fa").addEventListener("click", iniciar);
    }
  }

  async function iniciar() {
    const erro = document.querySelector("#segErro");
    try {
      const r = await api2faIniciar();
      document.querySelector("#segSegredo").textContent = r.secret;
      document.querySelector("#seg2faPassos").style.display = "block";
      document.querySelector("#btnIniciar2fa").style.display = "none";
      document.querySelector("#btnCopiarSegredo").addEventListener("click", () => {
        navigator.clipboard && navigator.clipboard.writeText(r.secret);
        toast("Chave copiada.", "neutro");
      });
      document.querySelector("#btnConfirmar2fa").addEventListener("click", () => confirmar());
      document.querySelector("#segCodigo").focus();
    } catch (e) {
      if (erro) erro.textContent = e.message || "Não consegui iniciar o 2FA.";
    }
  }

  async function confirmar() {
    const erro = document.querySelector("#segErro");
    erro.textContent = "";
    const codigo = (document.querySelector("#segCodigo").value || "").trim();
    try {
      await api2faAtivar(codigo);
      fecharModais();
      atualizarBotaoSeguranca();
      toast("🔐 <strong>2FA ativado!</strong> Sua conta está mais protegida.", "sucesso");
    } catch (e) {
      erro.textContent = e.message || "Código incorreto.";
    }
  }

  async function desativar() {
    const erro = document.querySelector("#segErro");
    erro.textContent = "";
    const senha = document.querySelector("#segSenha").value;
    try {
      await api2faDesativar(senha);
      fecharModais();
      atualizarBotaoSeguranca();
      toast("2FA desativado.", "neutro");
    } catch (e) {
      erro.textContent = e.message || "Não consegui desativar.";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const header = document.querySelector("header");
    const btnRanking = document.querySelector("#btnRanking");
    if (header && !document.querySelector("#btnSeguranca")) {
      const btn = document.createElement("button");
      btn.id = "btnSeguranca";
      btn.className = "botao secundario";
      btn.style.display = "none";
      btn.textContent = "🔐 Segurança";
      header.insertBefore(btn, btnRanking || null);
      btn.addEventListener("click", abrir);
    }
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "modalSeguranca";
    modal.innerHTML = `
      <div class="modal-caixa">
        <h2>🔐 Segurança da conta</h2>
        <div id="segurancaCorpo"></div>
        <div class="modal-acoes"><button class="botao secundario" data-fechar-seg>Fechar</button></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector("[data-fechar-seg]").addEventListener("click", fecharModais);
    modal.addEventListener("click", (e) => { if (e.target === modal) fecharModais(); });

    atualizarBotaoSeguranca();

    // chegou pelo link de redefinição de senha? (?reset=TOKEN)
    const token = new URLSearchParams(location.search).get("reset");
    if (token) abrirRedefinir(token);
  });

  function abrirRedefinir(token) {
    const modal = document.createElement("div");
    modal.className = "modal aberto";
    modal.id = "modalReset";
    modal.innerHTML = `
      <div class="modal-caixa">
        <h2>🔑 Redefinir senha</h2>
        <p class="conta-explica">Crie uma nova senha pra sua conta (mínimo 6 caracteres).</p>
        <div class="linha-codigo">
          <input id="resetSenha" type="password" maxlength="60" placeholder="nova senha" autocomplete="off">
          <button class="botao" id="btnRedefinir">Salvar</button>
        </div>
        <p class="codigo-erro" id="resetErro"></p>
      </div>`;
    document.body.appendChild(modal);
    const limparUrl = () => history.replaceState(null, "", location.pathname);
    modal.querySelector("#btnRedefinir").addEventListener("click", async () => {
      const senha = modal.querySelector("#resetSenha").value;
      const erro = modal.querySelector("#resetErro");
      erro.textContent = "";
      try {
        await apiRedefinirSenha(token, senha);
        modal.remove();
        limparUrl();
        toast("✅ Senha redefinida! Agora é só entrar com a nova senha.", "sucesso");
        if (typeof abrirModalConta === "function") abrirModalConta();
      } catch (e) {
        erro.textContent = e.message || "Não consegui redefinir. Peça um novo link.";
      }
    });
  }

  // atualiza a visibilidade do botão quando entra/sai da conta
  const atualizarBotaoContaOriginal = window.atualizarBotaoConta;
  if (typeof atualizarBotaoContaOriginal === "function") {
    window.atualizarBotaoConta = function () {
      atualizarBotaoContaOriginal.apply(this, arguments);
      atualizarBotaoSeguranca();
    };
  }
  window.atualizarBotaoSeguranca = atualizarBotaoSeguranca;
})();
