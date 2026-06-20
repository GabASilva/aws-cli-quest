"use strict";
// ============================================================
// AWS CLI Quest — app.js
// Interface: sidebar, card do desafio, terminal, ranking, toasts
// ============================================================

const ui = {
  desafioAtivo: null, // id do desafio selecionado
  servicoAberto: "s3", // qual trilha está expandida na sidebar
  historicoCmd: [],
  posHistorico: -1,
  dicasVisiveis: 0,
};

const $ = (sel) => document.querySelector(sel);

function escaparHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- Toasts ----------
function toast(html, classe) {
  const caixa = document.createElement("div");
  caixa.className = "toast " + (classe || "");
  caixa.innerHTML = html;
  $("#toasts").appendChild(caixa);
  setTimeout(() => caixa.classList.add("saindo"), 3600);
  setTimeout(() => caixa.remove(), 4100);
}

// ---------- Cabeçalho (XP, nível, streak) ----------
function renderCabecalho() {
  const nivel = nivelAtual(jogo.xp);
  $("#tituloNivel").textContent = `${nivel.icone} ${nivel.titulo}`;
  if (nivel.proximo) {
    const faixa = nivel.proximo.xp - nivel.xp;
    const dentro = jogo.xp - nivel.xp;
    $("#barraXp").style.width = Math.round((dentro / faixa) * 100) + "%";
    $("#textoXp").textContent = `${jogo.xp} XP · faltam ${nivel.proximo.xp - jogo.xp} pro próximo nível`;
  } else {
    $("#barraXp").style.width = "100%";
    $("#textoXp").textContent = `${jogo.xp} XP · nível máximo!`;
  }
  $("#streakNum").textContent = jogo.streak;
  const bonus = bonusAtual();
  $("#streakBonus").textContent = bonus > 0 ? `+${Math.round(bonus * 100)}% XP` : "";
  $("#streakBox").classList.toggle("aceso", jogo.streak > 0);
  const perdidas = jogo.sequenciasPerdidas || [];
  $("#streakBox").title =
    `Sequência atual: ${jogo.streak} · recorde: ${jogo.melhorStreak}` +
    (perdidas.length ? ` · últimas perdidas: ${perdidas.join(", ")}` : "") +
    `\nCada acerto seguido dá +10% de XP (máx. +50%). Revelar resposta zera.`;
}

// ---------- Sidebar ----------
function renderSidebar() {
  const aside = $("#sidebar");
  aside.innerHTML = "";
  for (const meta of SERVICOS_META) {
    const prog = progressoServico(meta.id);
    const bloco = document.createElement("div");
    bloco.className = "servico" + (ui.servicoAberto === meta.id ? " aberto" : "");

    const cab = document.createElement("button");
    cab.className = "servico-cab";
    cab.innerHTML = `<span class="servico-icone">${meta.icone}</span>
      <span class="servico-nomes"><strong>${meta.nome}</strong><small>${meta.subtitulo}</small></span>
      <span class="servico-prog ${prog.feitos === prog.total ? "completo" : ""}">${prog.feitos}/${prog.total}</span>`;
    cab.addEventListener("click", () => {
      ui.servicoAberto = ui.servicoAberto === meta.id ? null : meta.id;
      renderSidebar();
    });
    bloco.appendChild(cab);

    if (ui.servicoAberto === meta.id) {
      const lista = document.createElement("div");
      lista.className = "lista-desafios";
      for (const d of desafiosDoServico(meta.id)) {
        const feito = desafioConcluido(d.id);
        const liberado = desafioLiberado(d);
        const item = document.createElement("button");
        item.className = "item-desafio" + (feito ? " feito" : "") + (!liberado ? " travado" : "") + (ui.desafioAtivo === d.id ? " ativo" : "");
        item.disabled = !liberado;
        const status = feito ? "✅" : liberado ? "🔓" : "🔒";
        item.innerHTML = `<span class="status">${status}</span>
          <span class="item-titulo">${d.titulo}</span>
          <span class="item-meta">${NOMES_NIVEL[d.nivel]} · ${d.xp} XP</span>`;
        if (!liberado && d.tipo === "projeto") {
          item.title = "Complete a(s) trilha(s): " + (d.requisitos || []).join(", ").toUpperCase();
        }
        item.addEventListener("click", () => selecionarDesafio(d.id));
        lista.appendChild(item);
      }
      bloco.appendChild(lista);
    }
    aside.appendChild(bloco);
  }
}

// ---------- Card do desafio ----------
function selecionarDesafio(id) {
  ui.desafioAtivo = id;
  ui.dicasVisiveis = 0;
  renderSidebar();
  renderCard();
  $("#entradaTerminal").focus();
}

function renderCard() {
  const alvo = $("#cardDesafio");
  const d = ui.desafioAtivo ? obterDesafio(ui.desafioAtivo) : null;
  if (!d) {
    alvo.innerHTML = `<div class="card-vazio">
      <h2>👈 Escolha um desafio na lista</h2>
      <p>Comece pela trilha do <strong>S3</strong> se for sua primeira vez. Cada desafio concluído libera o próximo —
      e completar as trilhas libera os <strong>Projetos</strong>, onde você monta sistemas completos só com o CLI.</p>
      <p>No terminal abaixo, <code>aws help</code> mostra os serviços, <code>ls</code> mostra seus arquivos locais.</p>
    </div>`;
    return;
  }

  const feito = desafioConcluido(d.id);
  const revelado = !!jogo.revelados[d.id];
  const bonus = bonusAtual();
  const xpPotencial = revelado ? 0 : Math.round(d.xp * (1 + bonus));

  let html = `<div class="card-topo">
    <span class="selo nivel-${d.nivel}">${d.tipo === "projeto" ? "PROJETO" : NOMES_NIVEL[d.nivel]}</span>
    <span class="selo xp">${feito ? `+${jogo.concluidos[d.id].xpGanho} XP ganho` : revelado ? "0 XP (resposta revelada)" : `vale ${xpPotencial} XP${bonus > 0 ? ` (${d.xp} + bônus de sequência)` : ""}`}</span>
    ${feito ? '<span class="selo feito">✅ Concluído</span>' : ""}
  </div>
  <h2>${d.titulo}</h2>
  <p class="descricao">${d.descricao}</p>`;

  // Checklist de projeto
  if (d.tipo === "projeto") {
    const marcadas = jogo.etapasProjetos[d.id] || d.etapas.map(() => false);
    html += `<ul class="checklist">` + d.etapas.map((e, i) =>
      `<li class="${marcadas[i] ? "ok" : ""}">${marcadas[i] ? "✅" : "⬜"} ${escaparHtml(e.texto)}</li>`
    ).join("") + `</ul>`;
  }

  // Dicas
  if (!feito && d.dicas && d.dicas.length) {
    html += `<div class="acoes-card">`;
    if (ui.dicasVisiveis < d.dicas.length) {
      html += `<button id="btnDica" class="botao secundario">💡 Dica (${ui.dicasVisiveis}/${d.dicas.length}) — grátis</button>`;
    }
    if (!revelado) {
      html += `<button id="btnRevelar" class="botao perigo">👁️ Revelar resposta (zera o XP e a sequência)</button>`;
    }
    html += `</div>`;
    if (ui.dicasVisiveis > 0) {
      html += `<div class="dicas">` + d.dicas.slice(0, ui.dicasVisiveis).map((t) => `<p>💡 ${escaparHtml(t)}</p>`).join("") + `</div>`;
    }
  }

  // Solução revelada
  if (revelado || feito) {
    if (revelado) {
      html += `<div class="solucao"><p class="solucao-titulo">Resposta:</p>` +
        d.solucao.map((c) => `<code>${escaparHtml(c)}</code>`).join("") +
        `<p class="solucao-aviso">Digite os comandos no terminal pra concluir mesmo assim (sem XP).</p></div>`;
    }
  }

  alvo.innerHTML = html;

  const btnDica = $("#btnDica");
  if (btnDica) btnDica.addEventListener("click", () => { ui.dicasVisiveis++; renderCard(); });
  const btnRevelar = $("#btnRevelar");
  if (btnRevelar) btnRevelar.addEventListener("click", () => abrirModalRevelar(d));
}

// ---------- Modal de revelar ----------
function abrirModalRevelar(d) {
  $("#modalRevelar").classList.add("aberto");
  $("#revelarTexto").innerHTML = `Revelar a resposta de <strong>${d.titulo}</strong> zera o XP desse desafio
    (${d.xp} XP) e <strong>zera sua sequência de acertos</strong> (🔥 ${jogo.streak}). Tem certeza?`;
  $("#btnConfirmaRevelar").onclick = () => {
    revelarResposta(d);
    perderSequencia(); // registra a sequência perdida (guarda as últimas 3) e zera
    salvarJogo();
    fecharModais();
    renderCabecalho();
    renderCard();
  };
}

function fecharModais() {
  document.querySelectorAll(".modal").forEach((m) => m.classList.remove("aberto"));
}

// ---------- Ranking ----------
function pintarRanking(lista) {
  const corpo = $("#corpoRanking");
  corpo.innerHTML = lista.map((j, i) => {
    const medalha = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`;
    return `<tr class="${j.ehJogador ? "voce" : ""}">
      <td>${medalha}</td>
      <td>${escaparHtml(j.nome)}${j.ehJogador ? " (você)" : ""}</td>
      <td>${j.xp} XP</td>
      <td>${tituloPorXp(j.xp)}</td>
    </tr>`;
  }).join("");
}

async function abrirRanking() {
  const linhaNome = $("#linhaNome");
  // Online: ranking real dos usuários cadastrados. Offline: bots + você.
  if (api.online) {
    if (linhaNome) linhaNome.style.display = "none";
    $("#corpoRanking").innerHTML = `<tr><td colspan="4">carregando…</td></tr>`;
    $("#modalRanking").classList.add("aberto");
    const reais = await apiRanking();
    if (reais) {
      const lista = reais.map((u) => ({ nome: u.usuario, xp: u.xp, ehJogador: u.usuario === api.usuario }));
      if (!lista.some((j) => j.ehJogador) && api.usuario) {
        lista.push({ nome: api.usuario, xp: jogo.xp, ehJogador: true });
        lista.sort((a, b) => b.xp - a.xp);
      }
      pintarRanking(lista);
      return;
    }
  }
  if (linhaNome) linhaNome.style.display = "";
  pintarRanking(montarRanking());
  $("#nomeJogador").value = jogo.nomeJogador;
  $("#modalRanking").classList.add("aberto");
}

// ---------- Terminal ----------
function imprimir(texto, classe) {
  if (texto === "" || texto === undefined || texto === null) return;
  const linha = document.createElement("pre");
  linha.className = "linha " + (classe || "");
  linha.textContent = texto;
  $("#saidaTerminal").appendChild(linha);
}

function imprimirComando(comando) {
  const linha = document.createElement("div");
  linha.className = "linha eco";
  linha.innerHTML = `<span class="prompt">climb&nbsp;$</span> <span>${escaparHtml(comando)}</span>`;
  $("#saidaTerminal").appendChild(linha);
}

function rolarTerminal() {
  const t = $("#terminal");
  t.scrollTop = t.scrollHeight;
}

function listarArquivosLocais() {
  const raiz = [];
  const pastas = new Set();
  for (const caminho of Object.keys(ARQUIVOS_LOCAIS)) {
    const barra = caminho.indexOf("/");
    if (barra >= 0) pastas.add(caminho.slice(0, barra) + "/");
    else raiz.push(caminho);
  }
  return [...[...pastas].sort(), ...raiz.sort()].join("\n");
}

function executarLinha(linha) {
  const comando = linha.trim();
  imprimirComando(comando);
  if (!comando) return;

  ui.historicoCmd.push(comando);
  ui.posHistorico = ui.historicoCmd.length;

  if (comando === "clear") {
    $("#saidaTerminal").innerHTML = "";
    return;
  }
  if (comando === "ls") {
    const salvos = Object.keys(jogo.conta.arquivosSalvos || {});
    const extra = salvos.length ? "\n" + salvos.sort().join("\n") + "   (criados por você)" : "";
    imprimir(listarArquivosLocais() + extra);
    rolarTerminal();
    return;
  }
  if (comando === "help") {
    imprimir(obterManual(""));
    rolarTerminal();
    return;
  }
  if (comando.startsWith("cat ")) {
    const nome = comando.slice(4).trim();
    const salvos = jogo.conta.arquivosSalvos || {};
    if (salvos[nome] !== undefined) imprimir(salvos[nome]);
    else imprimir(`cat: ${nome}: arquivo não encontrado. Use 'ls' pra ver os arquivos (os criados com '>' aparecem lá).`, "erro");
    rolarTerminal();
    return;
  }

  const resultado = executarComandoAws(jogo.conta, comando);
  imprimir(resultado.saida, resultado.ok ? "" : "erro");
  salvarJogo();

  if (resultado.ok) verificarDesafios(resultado.cmd);
  rolarTerminal();
}

// ---------- Verificação dos desafios ----------
function verificarDesafios(cmd) {
  const d = ui.desafioAtivo ? obterDesafio(ui.desafioAtivo) : null;
  if (!d || desafioConcluido(d.id)) return;

  if (d.tipo === "projeto") {
    const marcadas = jogo.etapasProjetos[d.id] || d.etapas.map(() => false);
    let mudou = false;
    d.etapas.forEach((e, i) => {
      if (!marcadas[i] && e.validar(jogo.conta)) {
        marcadas[i] = true;
        mudou = true;
        imprimir(`✅ Etapa concluída: ${e.texto}`, "ok");
      }
    });
    jogo.etapasProjetos[d.id] = marcadas;
    if (mudou) salvarJogo();
    if (marcadas.every(Boolean)) celebrar(d);
    else if (mudou) renderCard();
    return;
  }

  let passou = false;
  try {
    passou = !!d.validar(jogo.conta, cmd, true);
  } catch (e) {
    passou = false;
  }
  if (passou) celebrar(d);
}

function celebrar(d) {
  const r = concluirDesafio(d);
  if (r.ganho > 0) {
    const extra = r.bonus > 0 ? ` <small>(${d.xp} + ${Math.round(r.bonus * 100)}% de bônus 🔥)</small>` : "";
    toast(`🎉 <strong>${d.titulo}</strong> concluído! <span class="xp-toast">+${r.ganho} XP</span>${extra}`, "sucesso");
    imprimir(`🎉 Desafio concluído: ${d.titulo} (+${r.ganho} XP${r.bonus > 0 ? ", com bônus de sequência" : ""})`, "ok");
  } else {
    toast(`✔️ <strong>${d.titulo}</strong> concluído — sem XP (resposta revelada).`, "neutro");
    imprimir(`✔️ Desafio concluído: ${d.titulo} (0 XP — resposta revelada)`, "ok");
  }
  if (r.subiuDeNivel) {
    toast(`⬆️ <strong>Subiu de nível!</strong> Agora você é ${r.nivelNovo.icone} <strong>${r.nivelNovo.titulo}</strong>`, "nivel");
  }
  if (jogo.streak > 0 && jogo.streak % 5 === 0) {
    toast(`🔥 Sequência de <strong>${jogo.streak}</strong> acertos! Bônus no máximo: +${Math.round(bonusAtual() * 100)}%`, "sucesso");
  }

  renderCabecalho();
  renderSidebar();
  renderCard();

  // sugere o próximo desafio da trilha
  const trilha = desafiosDoServico(d.servico);
  const proximo = trilha.find((x) => !desafioConcluido(x.id) && desafioLiberado(x));
  if (proximo) {
    selecionarDesafio(proximo.id);
  } else if (d.servico !== "projetos" && servicoCompleto(d.servico)) {
    toast(`🏁 Trilha <strong>${d.servico.toUpperCase()}</strong> completa! Veja se algum <strong>Projeto</strong> destravou. 🏗️`, "nivel");
    ui.desafioAtivo = null;
    renderCard();
    renderSidebar();
  }
}

// ---------- Conta (login / cadastro) ----------
const contaUi = { aba: "login" };

function atualizarBotaoConta() {
  const btn = $("#btnConta");
  if (api.usuario) {
    btn.textContent = "👤 " + api.usuario;
    btn.title = "Clique pra sair da conta";
  } else {
    btn.textContent = api.online ? "👤 Entrar" : "👤 Conta (offline)";
    btn.title = api.online ? "Entrar ou criar conta" : "Backend indisponível — jogando em modo local";
  }
}

function abrirModalConta() {
  if (api.usuario) {
    // logado: oferece sair
    if (confirm(`Sair da conta "${api.usuario}"? Seu progresso fica salvo na nuvem.`)) {
      apiSair();
      carregarJogo(); // volta pro slot local anônimo
      ui.desafioAtivo = null;
      atualizarBotaoConta();
      renderCabecalho();
      renderSidebar();
      renderCard();
      toast("Você saiu da conta. Jogando em modo local agora.", "neutro");
    }
    return;
  }
  if (!api.online) {
    toast("O servidor de contas está fora do ar — dá pra jogar normal, mas o progresso fica só neste navegador.", "neutro");
    return;
  }
  $("#contaErro").textContent = "";
  $("#campoUsuario").value = "";
  $("#campoSenha").value = "";
  $("#campoEmail").value = "";
  trocarAbaConta("login");
  $("#modalConta").classList.add("aberto");
  $("#campoUsuario").focus();
}

function trocarAbaConta(aba) {
  contaUi.aba = aba;
  document.querySelectorAll(".aba-conta").forEach((b) => b.classList.toggle("ativa", b.dataset.aba === aba));
  $("#contaTitulo").textContent = aba === "login" ? "👤 Entrar na sua conta" : "✨ Criar uma conta";
  $("#btnEnviarConta").textContent = aba === "login" ? "Entrar" : "Criar conta e jogar";
  $("#labelEmail").style.display = aba === "cadastro" ? "" : "none"; // e-mail só no cadastro
  $("#linkEsqueci").parentElement.style.display = aba === "login" ? "" : "none";
  $("#contaErro").textContent = "";
}

async function enviarConta(ev) {
  ev.preventDefault();
  const usuario = $("#campoUsuario").value.trim();
  const senha = $("#campoSenha").value;
  const btn = $("#btnEnviarConta");
  btn.disabled = true;
  $("#contaErro").textContent = "";
  try {
    let r;
    if (contaUi.aba === "login") {
      r = await apiLogin(usuario, senha);
      if (r && r.precisa2fa) {
        const codigo = window.prompt("🔐 Esta conta tem 2FA. Digite o código de 6 dígitos do seu app autenticador:");
        if (!codigo) { $("#contaErro").textContent = "Login cancelado (faltou o código 2FA)."; btn.disabled = false; return; }
        r = await apiLogin(usuario, senha, codigo.trim());
      }
    } else {
      r = await apiCadastrar(usuario, senha, $("#campoEmail").value.trim());
    }
    // vincula à conta o que foi jogado deslogado (em vez de descartar)
    const res = entrarComConta(r.perfil, r.progresso);
    fecharModais();
    atualizarBotaoConta();
    ui.desafioAtivo = null;
    $("#saidaTerminal").innerHTML = "";
    boasVindas();
    renderCabecalho();
    renderSidebar();
    renderCard();
    if (res.fundiu) {
      toast(`🔗 <strong>${escaparHtml(api.usuario)}</strong>: juntamos seu progresso deslogado com o da conta.`, "sucesso");
    } else if (res.tinhaLocal) {
      toast(`🔗 Olá, <strong>${escaparHtml(api.usuario)}</strong>! Seu progresso foi vinculado à conta.`, "sucesso");
    } else {
      toast(`👋 Olá, <strong>${escaparHtml(api.usuario)}</strong>! Progresso sincronizado.`, "sucesso");
    }
  } catch (e) {
    $("#contaErro").textContent = e.message || "Não rolou. Tente de novo.";
  } finally {
    btn.disabled = false;
  }
}

async function aoEsquecerSenha(ev) {
  if (ev) ev.preventDefault();
  const sugestao = $("#campoEmail") ? $("#campoEmail").value.trim() : "";
  const email = window.prompt("Digite o e-mail cadastrado na sua conta pra receber o link de redefinição:", sugestao);
  if (!email) return;
  try {
    const r = await apiEsqueciSenha(email.trim());
    fecharModais();
    toast(r.msg || "Se existe uma conta com esse e-mail, enviamos o link de redefinição. 📧", "sucesso");
  } catch (e) {
    toast(e.message || "Não consegui enviar agora. Tente mais tarde.", "neutro");
  }
}

// ---------- Inicialização ----------
async function iniciar() {
  // tenta o backend e restaura sessão antes de carregar o progresso
  let sessao = null;
  try { sessao = await apiIniciar(); } catch (e) { /* offline */ }

  if (sessao && sessao.perfil) {
    aplicarProgressoNuvem(sessao.perfil, sessao.progresso);
  } else {
    carregarJogo();
  }
  atualizarBotaoConta();
  renderCabecalho();
  renderSidebar();
  renderCard();

  const entrada = $("#entradaTerminal");
  entrada.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      executarLinha(entrada.value);
      entrada.value = "";
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      if (ui.posHistorico > 0) {
        ui.posHistorico--;
        entrada.value = ui.historicoCmd[ui.posHistorico] || "";
      }
    } else if (ev.key === "ArrowDown") {
      ev.preventDefault();
      if (ui.posHistorico < ui.historicoCmd.length) {
        ui.posHistorico++;
        entrada.value = ui.historicoCmd[ui.posHistorico] || "";
      }
    }
  });
  $("#terminal").addEventListener("click", () => entrada.focus());

  $("#btnRanking").addEventListener("click", abrirRanking);
  $("#btnConta").addEventListener("click", abrirModalConta);
  $("#formConta").addEventListener("submit", enviarConta);
  document.querySelectorAll(".aba-conta").forEach((b) => b.addEventListener("click", () => trocarAbaConta(b.dataset.aba)));
  $("#linkEsqueci").addEventListener("click", aoEsquecerSenha);
  $("#btnSalvarNome").addEventListener("click", () => {
    const nome = $("#nomeJogador").value.trim();
    if (nome) {
      jogo.nomeJogador = nome.slice(0, 20);
      salvarJogo();
      abrirRanking();
    }
  });
  document.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", fecharModais));
  document.querySelectorAll(".modal").forEach((m) => m.addEventListener("click", (ev) => {
    if (ev.target === m) fecharModais();
  }));

  $("#btnResetar").addEventListener("click", () => {
    if (confirm("Resetar TODO o progresso (XP, desafios e a conta AWS simulada)?")) {
      resetarJogo();
      ui.desafioAtivo = null;
      $("#saidaTerminal").innerHTML = "";
      boasVindas();
      renderCabecalho();
      renderSidebar();
      renderCard();
    }
  });

  boasVindas();
  entrada.focus();
}

function boasVindas() {
  imprimir(`╔══════════════════════════════════════════════╗
║   ⚡ CLImb — bem-vindo(a) a bordo!           ║
╚══════════════════════════════════════════════╝
Você tem uma conta AWS simulada só sua. Nada aqui custa dinheiro
e nada quebra de verdade — pode experimentar à vontade.

  aws help              manual geral (os manuais valem ouro!)
  aws s3 help           comandos de um serviço
  aws s3 mb help        manual de um comando específico
  ls                    seus arquivos locais fictícios
  clear                 limpa a tela

👈 Escolha um desafio na lista pra começar a ganhar XP.`);
}

document.addEventListener("DOMContentLoaded", iniciar);
