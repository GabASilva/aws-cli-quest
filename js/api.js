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
  licenca: { tier: "free", pro: false }, // licença efetiva do usuário
  twofa: false, // 2FA ativado nesta conta?
  email: null, // e-mail cadastrado (pra recuperação de senha)
};

function temPro() {
  return !!(api.licenca && api.licenca.pro);
}

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
    api.licenca = r.licenca || { tier: "free", pro: false };
    api.twofa = !!r.twofa;
    api.email = r.email || null;
    return r; // { perfil, progresso, licenca, twofa, email }
  } catch (e) {
    api.token = null;
    try { localStorage.removeItem(CHAVE_TOKEN); } catch (_) { /* ok */ }
    return null;
  }
}

async function apiCadastrar(usuario, senha, email) {
  const r = await apiFetch("/api/cadastrar", { method: "POST", body: JSON.stringify({ usuario, senha, email }) });
  api.token = r.token;
  api.usuario = r.perfil.usuario;
  api.licenca = r.licenca || { tier: "free", pro: false };
  api.email = r.email || null;
  try { localStorage.setItem(CHAVE_TOKEN, api.token); } catch (e) { /* ok */ }
  return r;
}

// Login. Se a conta tiver 2FA, a 1ª chamada (sem código) volta { precisa2fa: true };
// chame de novo passando o código do app autenticador.
async function apiLogin(usuario, senha, codigo) {
  const r = await apiFetch("/api/login", { method: "POST", body: JSON.stringify({ usuario, senha, codigo }) });
  if (r.precisa2fa) return r; // ainda não logou — falta o 2º fator
  api.token = r.token;
  api.usuario = r.perfil.usuario;
  api.licenca = r.licenca || { tier: "free", pro: false };
  api.twofa = !!r.twofa;
  api.email = r.email || null;
  try { localStorage.setItem(CHAVE_TOKEN, api.token); } catch (e) { /* ok */ }
  return r;
}

function apiSair() {
  api.token = null;
  api.usuario = null;
  api.licenca = { tier: "free", pro: false };
  api.twofa = false;
  try { localStorage.removeItem(CHAVE_TOKEN); } catch (e) { /* ok */ }
}

// ---------- 2FA ----------
async function api2faIniciar() {
  return apiFetch("/api/2fa/iniciar", { method: "POST", body: "{}" });
}
async function api2faAtivar(codigo) {
  const r = await apiFetch("/api/2fa/ativar", { method: "POST", body: JSON.stringify({ codigo }) });
  api.twofa = true;
  return r;
}
async function api2faDesativar(senha) {
  const r = await apiFetch("/api/2fa/desativar", { method: "POST", body: JSON.stringify({ senha }) });
  api.twofa = false;
  return r;
}

// ---------- E-mail / recuperação de senha ----------
async function apiDefinirEmail(email) {
  const r = await apiFetch("/api/email", { method: "POST", body: JSON.stringify({ email }) });
  api.email = r.email || email;
  return r;
}
async function apiEsqueciSenha(email) {
  return apiFetch("/api/senha/esqueci", { method: "POST", body: JSON.stringify({ email }) });
}
async function apiRedefinirSenha(token, senha) {
  return apiFetch("/api/senha/redefinir", { method: "POST", body: JSON.stringify({ token, senha }) });
}

// Planos/preços e se o checkout automático está ativo.
async function apiPlanos() {
  if (!api.online) return null;
  try { return await apiFetch("/api/planos"); } catch (e) { return null; }
}

// Cria o checkout no Mercado Pago e devolve a URL pra redirecionar.
// Pro plano "custom", passe a quantidade de meses.
async function apiAssinar(tier, meses) {
  return apiFetch("/api/assinar", { method: "POST", body: JSON.stringify({ tier, meses }) });
}

// Resgata um código de ativação. Atualiza api.licenca em caso de sucesso.
async function apiResgatar(codigo) {
  const r = await apiFetch("/api/licenca/resgatar", { method: "POST", body: JSON.stringify({ codigo }) });
  if (r.licenca) api.licenca = r.licenca;
  return r;
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
