"use strict";
// ============================================================
// AWS CLI Quest — api.js
// Conversa com o backend (cadastro, login, progresso, ranking).
// Se não houver backend (ex.: aberto via file:// ou GitHub Pages),
// o jogo segue 100% local — este módulo só marca api.online = false.
// ============================================================

const api = {
  online: false, // tem backend respondendo?
  token: null, // token de sessão
  usuario: null, // nome do usuário logado (null = anônimo/local)
};

const CHAVE_TOKEN = "awsCliQuest.token";

async function apiFetch(rota, opcoes = {}) {
  const cab = { "Content-Type": "application/json" };
  if (api.token) cab["Authorization"] = "Bearer " + api.token;
  const resp = await fetch(rota, { ...opcoes, headers: { ...cab, ...(opcoes.headers || {}) } });
  let corpo = {};
  try { corpo = await resp.json(); } catch (e) { /* sem corpo */ }
  if (!resp.ok) throw new Error(corpo.erro || `erro ${resp.status}`);
  return corpo;
}

// Detecta o backend e restaura sessão salva. Retorna o perfil se já logado.
async function apiIniciar() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch("/api/saude", { signal: ctrl.signal });
    clearTimeout(t);
    api.online = r.ok;
  } catch (e) {
    api.online = false;
  }
  if (!api.online) return null;

  try { api.token = localStorage.getItem(CHAVE_TOKEN); } catch (e) { /* ok */ }
  if (!api.token) return null;

  try {
    const r = await apiFetch("/api/eu");
    api.usuario = r.perfil.usuario;
    return r; // { perfil, progresso }
  } catch (e) {
    api.token = null;
    try { localStorage.removeItem(CHAVE_TOKEN); } catch (_) { /* ok */ }
    return null;
  }
}

async function apiCadastrar(usuario, senha) {
  const r = await apiFetch("/api/cadastrar", { method: "POST", body: JSON.stringify({ usuario, senha }) });
  api.token = r.token;
  api.usuario = r.perfil.usuario;
  try { localStorage.setItem(CHAVE_TOKEN, api.token); } catch (e) { /* ok */ }
  return r;
}

async function apiLogin(usuario, senha) {
  const r = await apiFetch("/api/login", { method: "POST", body: JSON.stringify({ usuario, senha }) });
  api.token = r.token;
  api.usuario = r.perfil.usuario;
  try { localStorage.setItem(CHAVE_TOKEN, api.token); } catch (e) { /* ok */ }
  return r;
}

function apiSair() {
  api.token = null;
  api.usuario = null;
  try { localStorage.removeItem(CHAVE_TOKEN); } catch (e) { /* ok */ }
}

// Envia o progresso atual pro servidor (silencioso — não trava o jogo se falhar).
async function apiSalvarProgresso(payload) {
  if (!api.online || !api.token) return;
  try {
    await apiFetch("/api/progresso", { method: "POST", body: JSON.stringify(payload) });
  } catch (e) {
    /* offline ou sessão caiu — segue salvo localmente */
  }
}

async function apiRanking() {
  if (!api.online) return null;
  try {
    const r = await apiFetch("/api/ranking");
    return r.ranking;
  } catch (e) {
    return null;
  }
}
