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
    jogo.streak = 0;
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
function abrirRanking() {
  const corpo = $("#corpoRanking");
  const lista = montarRanking();
  corpo.innerHTML = lista.map((j, i) => {
    const medalha = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`;
    return `<tr class="${j.ehJogador ? "voce" : ""}">
      <td>${medalha}</td>
      <td>${escaparHtml(j.nome)}${j.ehJogador ? " (você)" : ""}</td>
      <td>${j.xp} XP</td>
      <td>${tituloPorXp(j.xp)}</td>
    </tr>`;
  }).join("");
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
  linha.innerHTML = `<span class="prompt">aws-quest&nbsp;$</span> <span>${escaparHtml(comando)}</span>`;
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
    imprimir(listarArquivosLocais());
    rolarTerminal();
    return;
  }
  if (comando === "help") {
    imprimir(obterManual(""));
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

// ---------- Inicialização ----------
function iniciar() {
  carregarJogo();
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
║   ⚡ AWS CLI Quest — bem-vindo(a) a bordo!   ║
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
