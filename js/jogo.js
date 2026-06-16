"use strict";
// ============================================================
// AWS CLI Quest — jogo.js
// XP, níveis, sequência de acertos (streak), ranking e persistência
// ============================================================

const CHAVE_STORAGE = "awsCliQuest.v1";

// Títulos por XP acumulado
const NIVEIS = [
  { xp: 0, titulo: "Estagiário de Cloud", icone: "☁️" },
  { xp: 300, titulo: "DevOps Júnior", icone: "🔧" },
  { xp: 800, titulo: "Cloud Pleno", icone: "🚀" },
  { xp: 1500, titulo: "Cloud Sênior", icone: "🏗️" },
  { xp: 2500, titulo: "Arquiteto de Soluções", icone: "🏛️" },
  { xp: 4000, titulo: "Lenda do CLI", icone: "🦸" },
];

// Concorrentes do ranking (a comunidade fictícia do Quest)
const RANKING_BOTS = [
  { nome: "ana.cloud", xp: 5230 },
  { nome: "devops_caio", xp: 4180 },
  { nome: "mari_sre", xp: 3310 },
  { nome: "pedrao_infra", xp: 2640 },
  { nome: "lu.terraform", xp: 1925 },
  { nome: "rafa_dev", xp: 1340 },
  { nome: "bia.backend", xp: 810 },
  { nome: "jp_estagiario", xp: 355 },
  { nome: "tonho_da_cloud", xp: 120 },
];

const BONUS_MAXIMO = 0.5; // +50% no teto
const BONUS_POR_ACERTO = 0.1; // +10% por acerto seguido

// ---------- Estado do jogo ----------
function estadoInicial() {
  return {
    nomeJogador: "voce",
    xp: 0,
    streak: 0,
    melhorStreak: 0,
    concluidos: {}, // id -> { xpGanho, revelado }
    revelados: {}, // id -> true (revelou antes de concluir)
    etapasProjetos: {}, // id do projeto -> [bool, bool, ...]
    conta: criarContaAws(),
  };
}

let jogo = estadoInicial();

// Quando logado, cada conta tem seu próprio slot local (pra não misturar
// progresso de pessoas diferentes no mesmo navegador).
function chaveLocal() {
  return api.usuario ? CHAVE_STORAGE + "." + api.usuario : CHAVE_STORAGE;
}

let sincronizacaoAgendada = false;
function sincronizarNuvem() {
  if (!api.online || !api.token) return;
  // debounce: agrupa rajadas de salvamento num envio só
  if (sincronizacaoAgendada) return;
  sincronizacaoAgendada = true;
  setTimeout(() => {
    sincronizacaoAgendada = false;
    apiSalvarProgresso({
      xp: jogo.xp,
      melhorStreak: jogo.melhorStreak,
      progresso: {
        streak: jogo.streak,
        concluidos: jogo.concluidos,
        revelados: jogo.revelados,
        etapasProjetos: jogo.etapasProjetos,
        conta: jogo.conta,
      },
    });
  }, 600);
}

function salvarJogo() {
  try {
    localStorage.setItem(chaveLocal(), JSON.stringify(jogo));
  } catch (e) {
    /* sem localStorage (file:// em alguns navegadores) — segue sem persistir */
  }
  sincronizarNuvem();
}

// Aplica um progresso vindo do servidor por cima do estado atual.
function aplicarProgressoNuvem(perfil, progresso) {
  jogo = estadoInicial();
  if (perfil) {
    jogo.nomeJogador = perfil.usuario;
    jogo.xp = perfil.xp || 0;
    jogo.melhorStreak = perfil.melhorStreak || 0;
  }
  if (progresso) {
    jogo.streak = progresso.streak || 0;
    jogo.concluidos = progresso.concluidos || {};
    jogo.revelados = progresso.revelados || {};
    jogo.etapasProjetos = progresso.etapasProjetos || {};
    if (progresso.conta) jogo.conta = progresso.conta;
  }
  jogo.conta = normalizarConta(jogo.conta); // migra contas antigas (campos novos)
  try { localStorage.setItem(chaveLocal(), JSON.stringify(jogo)); } catch (e) { /* ok */ }
}

// Funde dois estados (o local anônimo e o da nuvem) num só, sem perder nada:
// união dos desafios concluídos/revelados, etapas de projeto no "ou" lógico,
// maior streak, e o XP recalculado a partir dos concluídos (sempre coerente).
function mesclarEstados(local, nuvem) {
  local = local || {};
  nuvem = nuvem || {};
  const concluidos = Object.assign({}, nuvem.concluidos, local.concluidos);
  // em conflito (concluído dos dois lados), fica o que rendeu mais XP
  for (const id in (nuvem.concluidos || {})) {
    const l = local.concluidos && local.concluidos[id];
    if (l) concluidos[id] = (l.xpGanho || 0) >= (nuvem.concluidos[id].xpGanho || 0) ? l : nuvem.concluidos[id];
  }
  const revelados = Object.assign({}, nuvem.revelados, local.revelados);

  const etapasProjetos = {};
  const idsProj = new Set([
    ...Object.keys(nuvem.etapasProjetos || {}),
    ...Object.keys(local.etapasProjetos || {}),
  ]);
  for (const id of idsProj) {
    const a = (local.etapasProjetos || {})[id] || [];
    const b = (nuvem.etapasProjetos || {})[id] || [];
    const n = Math.max(a.length, b.length);
    etapasProjetos[id] = Array.from({ length: n }, (_, i) => !!a[i] || !!b[i]);
  }

  // a conta AWS (sandbox) fica com a de quem tem mais desafios feitos
  const nLocal = Object.keys(local.concluidos || {}).length;
  const nNuvem = Object.keys(nuvem.concluidos || {}).length;
  let conta;
  if (nLocal >= nNuvem && local.conta && local.conta.s3) conta = local.conta;
  else if (nuvem.conta && nuvem.conta.s3) conta = nuvem.conta;
  else conta = (local.conta && local.conta.s3) ? local.conta : criarContaAws();

  return {
    concluidos,
    revelados,
    etapasProjetos,
    conta,
    xp: Object.values(concluidos).reduce((s, c) => s + (c.xpGanho || 0), 0),
    streak: Math.max(local.streak || 0, nuvem.streak || 0),
    melhorStreak: Math.max(local.melhorStreak || 0, nuvem.melhorStreak || 0),
  };
}

// Entra numa conta vinculando o progresso jogado deslogado.
// `jogo` (em memória) ainda guarda o progresso anônimo neste ponto.
// Retorna { fundiu, tinhaLocal } pra UI dar o aviso certo.
function entrarComConta(perfil, progressoNuvem) {
  const local = {
    concluidos: jogo.concluidos,
    revelados: jogo.revelados,
    etapasProjetos: jogo.etapasProjetos,
    conta: jogo.conta,
    streak: jogo.streak,
    melhorStreak: jogo.melhorStreak,
  };
  const tinhaLocal = Object.keys(local.concluidos || {}).length > 0;
  const tinhaNuvem = !!(progressoNuvem && Object.keys(progressoNuvem.concluidos || {}).length > 0);
  const fundiu = tinhaLocal && tinhaNuvem;

  const merged = mesclarEstados(local, progressoNuvem);
  jogo = estadoInicial();
  jogo.nomeJogador = perfil ? perfil.usuario : jogo.nomeJogador;
  jogo.xp = merged.xp;
  jogo.streak = merged.streak;
  jogo.melhorStreak = merged.melhorStreak;
  jogo.concluidos = merged.concluidos;
  jogo.revelados = merged.revelados;
  jogo.etapasProjetos = merged.etapasProjetos;
  jogo.conta = normalizarConta(merged.conta); // migra contas antigas (campos novos)

  try { localStorage.setItem(chaveLocal(), JSON.stringify(jogo)); } catch (e) { /* ok */ }
  // some com o slot anônimo: o que foi jogado deslogado agora é da conta,
  // e o próximo visitante anônimo começa do zero.
  if (tinhaLocal) {
    try { localStorage.removeItem(CHAVE_STORAGE); } catch (e) { /* ok */ }
  }
  // sobe o estado já vinculado pra nuvem (com XP recalculado)
  sincronizarNuvem();
  return { fundiu, tinhaLocal };
}

function carregarJogo() {
  try {
    const bruto = localStorage.getItem(chaveLocal());
    if (!bruto) { jogo = estadoInicial(); return; }
    const salvo = JSON.parse(bruto);
    jogo = Object.assign(estadoInicial(), salvo);
    jogo.conta = normalizarConta(jogo.conta); // migra contas antigas (campos novos)
  } catch (e) {
    jogo = estadoInicial();
  }
}

function resetarJogo() {
  jogo = estadoInicial();
  if (api.usuario) jogo.nomeJogador = api.usuario;
  try { localStorage.removeItem(chaveLocal()); } catch (e) { /* ok */ }
  sincronizarNuvem();
}

// ---------- Níveis ----------
function nivelAtual(xp) {
  let nivel = NIVEIS[0];
  let indice = 0;
  for (let i = 0; i < NIVEIS.length; i++) {
    if (xp >= NIVEIS[i].xp) { nivel = NIVEIS[i]; indice = i; }
  }
  const proximo = NIVEIS[indice + 1] || null;
  return { ...nivel, indice, proximo };
}

function tituloPorXp(xp) {
  return nivelAtual(xp).titulo;
}

// ---------- Streak / bônus ----------
function bonusAtual() {
  return Math.min(jogo.streak * BONUS_POR_ACERTO, BONUS_MAXIMO);
}

// ---------- Conclusão de desafio ----------
// Retorna { ganho, bonus, subiuDeNivel, nivelNovo }
function concluirDesafio(desafio) {
  const revelado = !!jogo.revelados[desafio.id];
  const bonus = revelado ? 0 : bonusAtual();
  const ganho = revelado ? 0 : Math.round(desafio.xp * (1 + bonus));

  const nivelAntes = nivelAtual(jogo.xp).indice;
  jogo.xp += ganho;
  if (revelado) {
    jogo.streak = 0;
  } else {
    jogo.streak += 1;
    if (jogo.streak > jogo.melhorStreak) jogo.melhorStreak = jogo.streak;
  }
  jogo.concluidos[desafio.id] = { xpGanho: ganho, revelado };
  const nivelDepois = nivelAtual(jogo.xp);

  salvarJogo();
  return { ganho, bonus, revelado, subiuDeNivel: nivelDepois.indice > nivelAntes, nivelNovo: nivelDepois };
}

function revelarResposta(desafio) {
  if (!jogo.concluidos[desafio.id]) {
    jogo.revelados[desafio.id] = true;
    salvarJogo();
  }
}

// ---------- Progresso / bloqueio ----------
function desafioConcluido(id) {
  return !!jogo.concluidos[id];
}

function servicoCompleto(servicoId) {
  return desafiosDoServico(servicoId).every((d) => desafioConcluido(d.id));
}

// Um desafio está liberado se o anterior da mesma trilha foi concluído.
// Projetos exigem as trilhas listadas em `requisitos` completas.
function desafioLiberado(desafio) {
  if (desafio.tipo === "projeto") {
    return (desafio.requisitos || []).every((s) => servicoCompleto(s));
  }
  const trilha = desafiosDoServico(desafio.servico);
  const i = trilha.findIndex((d) => d.id === desafio.id);
  if (i <= 0) return true;
  return desafioConcluido(trilha[i - 1].id);
}

function progressoServico(servicoId) {
  const trilha = desafiosDoServico(servicoId);
  const feitos = trilha.filter((d) => desafioConcluido(d.id)).length;
  return { feitos, total: trilha.length };
}

// ---------- Ranking ----------
// Local/offline: usa os bots + você. Online: a função abaixo é substituída
// pelos jogadores reais (montarRankingOnline em app.js).
function montarRanking() {
  const todos = [
    ...RANKING_BOTS.map((b) => ({ ...b, ehJogador: false })),
    { nome: jogo.nomeJogador, xp: jogo.xp, ehJogador: true },
  ];
  todos.sort((a, b) => b.xp - a.xp);
  return todos;
}
