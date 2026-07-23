"use strict";
// ============================================================
// AWS CLI Quest — licenca.js
// Freemium: trava o conteúdo Pro pra quem não tem licença.
//   Grátis: Primeiros passos, Linux essencial, trilha S3 e o Desafio do dia.
//   Pro: EC2, IAM, Lambda, DynamoDB, Projetos, seções avançadas, missões
//        relâmpago e o Treino aleatório.
//
// ADITIVO: faz wrap de selecionarDesafio (bloqueia Pro) e de renderSidebar
// (cadeados), injeta o botão/painel de planos e trata o retorno do checkout.
// Não toca app.js/jogo.js.
// ============================================================

const SERVICOS_GRATIS = ["setup", "linux", "s3"];

// um desafio é grátis se for de uma trilha grátis OU se for o Desafio do dia
function desafioEhGratis(d) {
  if (!d) return true;
  if (SERVICOS_GRATIS.includes(d.servico)) return true;
  if (typeof window.desafioDoDia === "function") {
    try { if (d.id === window.desafioDoDia().id) return true; } catch (e) { /* ok */ }
  }
  return false;
}

function podeAcessar(d) {
  return temPro() || desafioEhGratis(d);
}

(function () {
  if (typeof window === "undefined") return;

  // ---------- wrap: bloquear seleção de desafio Pro ----------
  const selecionarOriginal = window.selecionarDesafio;
  if (typeof selecionarOriginal === "function") {
    window.selecionarDesafio = function (id) {
      const d = obterDesafio(id);
      if (d && !podeAcessar(d)) {
        abrirPlanos(d);
        return;
      }
      return selecionarOriginal(id);
    };
  }

  // ---------- wrap: cadeados na sidebar ----------
  const renderSidebarOriginal = window.renderSidebar;
  if (typeof renderSidebarOriginal === "function") {
    window.renderSidebar = function () {
      renderSidebarOriginal();
      if (temPro()) return;
      // marca as seções Pro (todas que não são grátis)
      document.querySelectorAll("#sidebar .servico").forEach((bloco, i) => {
        const meta = SERVICOS_META[i];
        if (meta && !SERVICOS_GRATIS.includes(meta.id) && meta.id !== "projetos") {
          marcarPro(bloco);
        }
        if (meta && (meta.id === "projetos")) marcarPro(bloco); // projetos = Pro
      });
    };
  }

  function marcarPro(bloco) {
    const prog = bloco.querySelector(".servico-prog");
    if (prog && !bloco.querySelector(".selo-pro")) {
      const selo = document.createElement("span");
      selo.className = "selo-pro";
      selo.textContent = "🔒 Pro";
      prog.replaceWith(selo);
    }
    bloco.classList.add("bloco-pro");
  }

  // ---------- botão no header + estado ----------
  function atualizarBotaoPlano() {
    const btn = document.querySelector("#btnPlano");
    if (!btn) return;
    if (temPro()) {
      const t = api.licenca.tier;
      btn.textContent = t === "vitalicio" ? "⭐ Pro vitalício" : (t === "escola" ? "⭐ Pro (escola)" : "⭐ Pro");
      btn.classList.remove("secundario");
      btn.title = api.licenca.expiraEm ? "Sua licença vai até " + new Date(api.licenca.expiraEm).toLocaleDateString("pt-BR") : "Licença vitalícia 🎉";
    } else {
      btn.textContent = "⭐ Assinar Pro";
      btn.classList.add("secundario");
      btn.title = "Desbloqueie EC2, IAM, Lambda, DynamoDB, projetos e simulados ilimitados";
    }
  }

  // ---------- painel de planos ----------
  async function abrirPlanos(desafioBloqueado) {
    const modal = document.querySelector("#modalPlanos");
    if (!modal) return;
    const aviso = document.querySelector("#planosAviso");
    aviso.textContent = desafioBloqueado
      ? `"${desafioBloqueado.titulo}" faz parte do plano Pro. Desbloqueie tudo:`
      : "Desbloqueie todo o conteúdo do AWS CLI Quest:";
    const planos = await apiPlanos();
    const checkoutAtivo = planos && planos.checkoutAtivo;
    const p = (planos && planos.precos) || { mensal: 19.9, semestral: 89.9, anual: 149.9 };
    const custom = (planos && planos.custom) || { min: 1, max: 24, faixas: [{ min: 12, mes: 12.49 }, { min: 6, mes: 14.98 }, { min: 3, mes: 16.9 }, { min: 1, mes: 19.9 }] };
    const fmt = (v) => "R$ " + v.toFixed(2).replace(".", ",");
    document.querySelector("#planosGrade").innerHTML = `
      ${cartaoPlano("mensal", "Mensal", fmt(p.mensal), "/mês", "", checkoutAtivo)}
      ${cartaoPlano("anual", "Anual", fmt(p.anual), "/ano", "Melhor custo — ~" + fmt(p.anual / 12) + "/mês", checkoutAtivo)}
      ${cartaoPlano("semestral", "Semestral", fmt(p.semestral), "/6 meses", "", checkoutAtivo)}`;
    document.querySelectorAll("#planosGrade [data-tier]").forEach((b) =>
      b.addEventListener("click", () => assinar(b.dataset.tier, b))
    );
    renderCustom(custom, checkoutAtivo);
    document.querySelector("#planosCheckoutOff").style.display = checkoutAtivo ? "none" : "block";
    modal.classList.add("aberto");
  }

  function precoCustomClient(meses, custom) {
    meses = Math.max(custom.min, Math.min(custom.max, Math.floor(meses)));
    let mes = custom.faixas[custom.faixas.length - 1].mes;
    for (const f of custom.faixas) { if (meses >= f.min) { mes = f.mes; break; } }
    return { meses, mes, total: Math.round(meses * mes * 100) / 100 };
  }

  function renderCustom(custom, ativo) {
    const fmt = (v) => "R$ " + v.toFixed(2).replace(".", ",");
    const cont = document.querySelector("#planoCustom");
    cont.innerHTML = `
      <h3>🎚️ Plano personalizado</h3>
      <p class="custom-desc">Escolha por quantos meses quer o Pro — quanto mais tempo, mais barato o mês.</p>
      <input type="range" id="customMeses" min="${custom.min}" max="${custom.max}" value="3">
      <div class="custom-linha">
        <span id="customResumo"></span>
        <button class="botao" id="btnAssinarCustom" ${ativo ? "" : "disabled title='Checkout em ativação'"}>Assinar</button>
      </div>`;
    const slider = cont.querySelector("#customMeses");
    const resumo = cont.querySelector("#customResumo");
    function atualizar() {
      const meses = parseInt(slider.value, 10);
      const c = precoCustomClient(meses, custom);
      const pct = Math.round((1 - c.mes / 19.9) * 100);
      const ate = new Date(Date.now() + meses * 30 * 86400000).toLocaleDateString("pt-BR");
      resumo.innerHTML = `<strong>${meses} ${meses === 1 ? "mês" : "meses"}</strong> · <span class="custom-total">${fmt(c.total)}</span>
        <small>(≈ ${fmt(c.mes)}/mês${pct > 0 ? " · " + pct + "% off" : ""} · ativa até ${ate})</small>`;
    }
    slider.addEventListener("input", atualizar);
    cont.querySelector("#btnAssinarCustom").addEventListener("click", (e) => assinar("custom", e.target, parseInt(slider.value, 10)));
    atualizar();
  }

  function cartaoPlano(tier, nome, preco, periodo, nota, ativo) {
    return `<div class="cartao-plano">
      <h3>${nome}</h3>
      <div class="preco">${preco}<small>${periodo}</small></div>
      ${nota ? `<p class="plano-nota">${nota}</p>` : ""}
      <button class="botao" data-tier="${tier}" ${ativo ? "" : "disabled title='Checkout em ativação'"}>Assinar</button>
    </div>`;
  }

  async function assinar(tier, btn, meses) {
    if (!api.usuario) { toast("Crie uma conta ou entre antes de assinar. 👤", "neutro"); return; }
    btn.disabled = true;
    const textoOriginal = btn.textContent;
    btn.textContent = "Abrindo…";
    try {
      const r = await apiAssinar(tier, meses);
      if (r.url) { window.location.href = r.url; return; } // vai pro Mercado Pago
      toast("Não consegui abrir o checkout. Tente um código de ativação.", "erro");
    } catch (e) {
      toast(e.message || "Checkout indisponível. Use um código de ativação.", "neutro");
    } finally {
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  }

  async function resgatar() {
    const campo = document.querySelector("#campoCodigo");
    const cod = (campo.value || "").trim();
    const erroEl = document.querySelector("#codigoErro");
    erroEl.textContent = "";
    if (!api.usuario) { erroEl.textContent = "Entre na sua conta antes de resgatar."; return; }
    if (!cod) { erroEl.textContent = "Digite um código."; return; }
    try {
      await apiResgatar(cod);
      fecharModais();
      atualizarBotaoPlano();
      renderSidebar();
      renderCard();
      toast("🎉 <strong>Pro liberado!</strong> Aproveite — tudo destravado.", "sucesso");
    } catch (e) {
      erroEl.textContent = e.message || "Não rolou. Confira o código.";
    }
  }

  // ---------- monta a UI ----------
  document.addEventListener("DOMContentLoaded", () => {
    // botão no header (antes do Ranking)
    const header = document.querySelector("header");
    const btnRanking = document.querySelector("#btnRanking");
    if (header && !document.querySelector("#btnPlano")) {
      const btn = document.createElement("button");
      btn.id = "btnPlano";
      btn.className = "botao secundario";
      btn.textContent = "⭐ Assinar Pro";
      header.insertBefore(btn, btnRanking || null);
      btn.addEventListener("click", () => abrirPlanos(null));
    }

    // modal de planos
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "modalPlanos";
    modal.innerHTML = `
      <div class="modal-caixa modal-largo">
        <h2>⭐ CLImb Pro</h2>
        <p id="planosAviso" class="conta-explica"></p>
        <div id="planosGrade" class="grade-planos"></div>
        <div id="planoCustom" class="plano-custom"></div>
        <p id="planosCheckoutOff" class="plano-off" style="display:none">
          💳 O pagamento automático está sendo ativado. Por enquanto, garanta seu acesso com um
          <strong>código de ativação</strong> (fale com o responsável pelo app).
        </p>
        <div class="resgatar-bloco">
          <label>Tem um código de ativação?</label>
          <div class="linha-codigo">
            <input id="campoCodigo" placeholder="QUEST-XXXXXXXX" autocomplete="off" spellcheck="false">
            <button class="botao" id="btnResgatar">Resgatar</button>
          </div>
          <p class="codigo-erro" id="codigoErro"></p>
        </div>
        <p class="conta-aviso">Planos <strong>escola</strong> (preço por aluno) e <strong>vitalício</strong>: fale com o responsável pelo app.</p>
        <div class="modal-acoes"><button class="botao secundario" data-fechar-planos>Fechar</button></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector("#btnResgatar").addEventListener("click", resgatar);
    modal.querySelector("[data-fechar-planos]").addEventListener("click", fecharModais);
    modal.addEventListener("click", (e) => { if (e.target === modal) fecharModais(); });

    atualizarBotaoPlano();

    // retorno do checkout do Mercado Pago (?pago=1)
    const params = new URLSearchParams(location.search);
    if (params.get("pago") === "1") {
      toast("✅ Pagamento recebido! Confirmando sua licença…", "sucesso");
      // o webhook ativa no servidor; aqui a gente re-puxa a licença algumas vezes
      let tentativas = 0;
      const timer = setInterval(async () => {
        tentativas++;
        const r = await apiIniciar();
        if (r && r.licenca && r.licenca.pro) {
          api.licenca = r.licenca;
          atualizarBotaoPlano();
          renderSidebar();
          renderCard();
          toast("🎉 <strong>Pro liberado!</strong> Tudo destravado. Bons estudos!", "nivel");
          clearInterval(timer);
        }
        if (tentativas >= 6) clearInterval(timer);
      }, 2500);
      history.replaceState(null, "", location.pathname);
    }
  });

  // quando o usuário entra/sai da conta (app.js), atualiza o botão de plano também
  const atualizarBotaoContaOriginal = window.atualizarBotaoConta;
  if (typeof atualizarBotaoContaOriginal === "function") {
    window.atualizarBotaoConta = function () {
      atualizarBotaoContaOriginal.apply(this, arguments);
      atualizarBotaoPlano();
    };
  }

  // exposto pro app reagir (ex.: após login)
  window.atualizarBotaoPlano = atualizarBotaoPlano;
})();
