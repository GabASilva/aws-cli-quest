"use strict";
// ============================================================
// AWS CLI Quest — servidor.js
// Serve os arquivos estáticos + API minúscula de contas e ranking.
// Sem dependências (só o core do Node). Dados em JSON num arquivo.
//
// IMPORTANTE: isto é um brinquedo educativo, não autenticação de banco.
// O que ele FAZ direito: senha nunca é guardada em texto puro (scrypt +
// salt por usuário), sessão por token aleatório. O que ele NÃO tem:
// reset de senha, e-mail, rate-limit robusto. Não reuse senha de verdade.
// ============================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORTA = parseInt(process.env.PORT || process.argv[2] || "8741", 10);
const RAIZ = __dirname;
// No Fly, monte um volume em /dados; local, salva ao lado do servidor.
const ARQUIVO_DADOS = process.env.DADOS_DIR
  ? path.join(process.env.DADOS_DIR, "quest-dados.json")
  : path.join(RAIZ, "quest-dados.json");

// ---------- "Banco" em arquivo JSON ----------
let bd = { usuarios: {}, sessoes: {} }; // usuarios[nome] = { hash, salt, xp, melhorStreak, progresso, criadoEm }

function carregarBd() {
  try {
    bd = JSON.parse(fs.readFileSync(ARQUIVO_DADOS, "utf8"));
    if (!bd.usuarios) bd.usuarios = {};
    if (!bd.sessoes) bd.sessoes = {};
  } catch (e) {
    bd = { usuarios: {}, sessoes: {} };
  }
}

let gravacaoPendente = false;
function salvarBd() {
  // debounce simples pra não gravar a cada request
  if (gravacaoPendente) return;
  gravacaoPendente = true;
  setTimeout(() => {
    gravacaoPendente = false;
    try {
      const tmp = ARQUIVO_DADOS + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(bd));
      fs.renameSync(tmp, ARQUIVO_DADOS);
    } catch (e) {
      console.error("falha ao salvar dados:", e.message);
    }
  }, 400);
}

// ---------- Senhas (scrypt) ----------
function hashSenha(senha, salt) {
  return crypto.scryptSync(senha, salt, 32).toString("hex");
}

function criarSenha(senha) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: hashSenha(senha, salt) };
}

function conferirSenha(senha, salt, hashEsperado) {
  const hash = hashSenha(senha, salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(hashEsperado, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- Sessões ----------
function novaSessao(nomeUsuario) {
  const token = crypto.randomBytes(24).toString("hex");
  bd.sessoes[token] = { usuario: nomeUsuario, criadoEm: Date.now() };
  return token;
}

function usuarioDoToken(token) {
  const s = token && bd.sessoes[token];
  if (!s) return null;
  return bd.usuarios[s.usuario] ? s.usuario : null;
}

// ---------- Validação ----------
const NOME_VALIDO = /^[a-zA-Z0-9_.-]{3,20}$/;

function validarCadastro(nome, senha) {
  if (!nome || !NOME_VALIDO.test(nome)) {
    return "Usuário inválido: use 3 a 20 caracteres (letras, números, ponto, hífen ou _).";
  }
  if (!senha || String(senha).length < 4) {
    return "Senha muito curta: use pelo menos 4 caracteres.";
  }
  return null;
}

// ---------- Helpers HTTP ----------
function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let dados = "";
    req.on("data", (c) => {
      dados += c;
      if (dados.length > 100000) reject(new Error("corpo grande demais"));
    });
    req.on("end", () => {
      try {
        resolve(dados ? JSON.parse(dados) : {});
      } catch (e) {
        reject(new Error("JSON inválido"));
      }
    });
    req.on("error", reject);
  });
}

function responderJson(res, status, obj) {
  const corpo = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(corpo);
}

function perfilPublico(nome) {
  const u = bd.usuarios[nome];
  return { usuario: nome, xp: u.xp || 0, melhorStreak: u.melhorStreak || 0 };
}

// ---------- API ----------
async function tratarApi(req, res, rota) {
  // POST /api/cadastrar { usuario, senha }
  if (rota === "/api/cadastrar" && req.method === "POST") {
    const corpo = await lerCorpo(req);
    const nome = String(corpo.usuario || "").trim();
    const erro = validarCadastro(nome, corpo.senha);
    if (erro) return responderJson(res, 400, { erro });
    if (bd.usuarios[nome]) return responderJson(res, 409, { erro: "Esse usuário já existe. Escolha outro nome ou faça login." });
    const { salt, hash } = criarSenha(String(corpo.senha));
    bd.usuarios[nome] = { salt, hash, xp: 0, melhorStreak: 0, progresso: null, criadoEm: Date.now() };
    salvarBd();
    const token = novaSessao(nome);
    return responderJson(res, 201, { token, perfil: perfilPublico(nome) });
  }

  // POST /api/login { usuario, senha }
  if (rota === "/api/login" && req.method === "POST") {
    const corpo = await lerCorpo(req);
    const nome = String(corpo.usuario || "").trim();
    const u = bd.usuarios[nome];
    if (!u || !conferirSenha(String(corpo.senha || ""), u.salt, u.hash)) {
      return responderJson(res, 401, { erro: "Usuário ou senha incorretos." });
    }
    const token = novaSessao(nome);
    return responderJson(res, 200, { token, perfil: perfilPublico(nome), progresso: u.progresso });
  }

  // GET /api/eu  (Authorization: Bearer <token>)
  if (rota === "/api/eu" && req.method === "GET") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Sessão expirada. Faça login de novo." });
    return responderJson(res, 200, { perfil: perfilPublico(nome), progresso: bd.usuarios[nome].progresso });
  }

  // POST /api/progresso { xp, melhorStreak, progresso }  (autenticado)
  if (rota === "/api/progresso" && req.method === "POST") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Sessão expirada. Faça login de novo." });
    const corpo = await lerCorpo(req);
    const u = bd.usuarios[nome];
    if (typeof corpo.xp === "number" && corpo.xp >= 0) u.xp = Math.floor(corpo.xp);
    if (typeof corpo.melhorStreak === "number" && corpo.melhorStreak >= 0) u.melhorStreak = Math.floor(corpo.melhorStreak);
    if (corpo.progresso && typeof corpo.progresso === "object") u.progresso = corpo.progresso;
    salvarBd();
    return responderJson(res, 200, { ok: true });
  }

  // GET /api/ranking  (público — top 50)
  if (rota === "/api/ranking" && req.method === "GET") {
    const lista = Object.keys(bd.usuarios)
      .map(perfilPublico)
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 50);
    return responderJson(res, 200, { ranking: lista });
  }

  return responderJson(res, 404, { erro: "rota não encontrada" });
}

function tokenDoCabecalho(req) {
  const h = req.headers["authorization"] || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

// ---------- Arquivos estáticos ----------
const MIMES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function servirEstatico(req, res, rota) {
  const relativo = rota === "/" ? "index.html" : rota.replace(/^\/+/, "");
  const arquivo = path.normalize(path.join(RAIZ, relativo));
  if (!arquivo.startsWith(RAIZ) || relativo.includes("\0") || relativo.startsWith("quest-dados")) {
    res.writeHead(403);
    res.end("403");
    return;
  }
  fs.readFile(arquivo, (erro, conteudo) => {
    if (erro) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 — " + relativo);
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIMES[path.extname(arquivo).toLowerCase()] || "application/octet-stream",
      "Cache-Control": rota.startsWith("/js/") || rota.startsWith("/css/") ? "no-cache" : "no-store",
    });
    res.end(conteudo);
  });
}

// ---------- Servidor ----------
carregarBd();
http
  .createServer(async (req, res) => {
    const rota = decodeURIComponent(req.url.split("?")[0]);
    try {
      if (rota === "/api/saude") return responderJson(res, 200, { ok: true });
      if (rota.startsWith("/api/")) return await tratarApi(req, res, rota);
      servirEstatico(req, res, rota);
    } catch (e) {
      responderJson(res, 400, { erro: e.message || "erro" });
    }
  })
  .listen(PORTA, () => console.log(`AWS CLI Quest no ar: http://localhost:${PORTA}`));
