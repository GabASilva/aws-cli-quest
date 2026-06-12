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

function salvarJogo() {
  try {
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(jogo));
  } catch (e) {
    /* sem localStorage (file:// em alguns navegadores) — segue sem persistir */
  }
}

function carregarJogo() {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE);
    if (!bruto) return;
    const salvo = JSON.parse(bruto);
    jogo = Object.assign(estadoInicial(), salvo);
    if (!jogo.conta || !jogo.conta.s3) jogo.conta = criarContaAws();
  } catch (e) {
    jogo = estadoInicial();
  }
}

function resetarJogo() {
  jogo = estadoInicial();
  try { localStorage.removeItem(CHAVE_STORAGE); } catch (e) { /* ok */ }
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
function montarRanking() {
  const todos = [
    ...RANKING_BOTS.map((b) => ({ ...b, ehJogador: false })),
    { nome: jogo.nomeJogador, xp: jogo.xp, ehJogador: true },
  ];
  todos.sort((a, b) => b.xp - a.xp);
  return todos;
}
