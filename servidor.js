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
    if (!bd.codigos) bd.codigos = {};
  } catch (e) {
    bd = { usuarios: {}, sessoes: {}, codigos: {} };
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

// ---------- Licenças ----------
const PRECOS = { mensal: 19.9, semestral: 89.9, anual: 149.9 };
const DIAS = { mensal: 30, semestral: 182, anual: 365 };
const TITULO_PLANO = { mensal: "AWS CLI Quest Pro — Mensal", semestral: "AWS CLI Quest Pro — Semestral", anual: "AWS CLI Quest Pro — Anual" };

// Estado efetivo da licença de um usuário (considera expiração).
function licencaPublica(u) {
  const l = u && u.licenca;
  if (!l) return { tier: "free", pro: false };
  const pro = l.tier === "vitalicio" || !l.expiraEm || l.expiraEm > Date.now();
  return { tier: pro ? l.tier : "free", pro, expiraEm: l.expiraEm || null, escola: !!l.escola };
}

// Concede/renova licença. Renovação acumula a partir da expiração vigente.
function concederLicenca(u, tier, opts) {
  opts = opts || {};
  const agora = Date.now();
  let expiraEm = null;
  if (tier !== "vitalicio") {
    const dias = opts.dias || DIAS[tier] || 30;
    const base = u.licenca && u.licenca.expiraEm && u.licenca.expiraEm > agora ? u.licenca.expiraEm : agora;
    expiraEm = base + dias * 86400000;
  }
  u.licenca = { tier, expiraEm, emitidaPor: opts.por || "checkout", escola: opts.escola || false, desde: agora };
  return licencaPublica(u);
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
    return responderJson(res, 201, { token, perfil: perfilPublico(nome), licenca: licencaPublica(bd.usuarios[nome]) });
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
    return responderJson(res, 200, { token, perfil: perfilPublico(nome), progresso: u.progresso, licenca: licencaPublica(u) });
  }

  // GET /api/eu  (Authorization: Bearer <token>)
  if (rota === "/api/eu" && req.method === "GET") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Sessão expirada. Faça login de novo." });
    const u = bd.usuarios[nome];
    return responderJson(res, 200, { perfil: perfilPublico(nome), progresso: u.progresso, licenca: licencaPublica(u) });
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

  // GET /api/planos  (público — preços e o que está disponível)
  if (rota === "/api/planos" && req.method === "GET") {
    return responderJson(res, 200, { precos: PRECOS, checkoutAtivo: !!process.env.MP_TOKEN });
  }

  // POST /api/licenca/resgatar { codigo }  (autenticado) — resgata código
  if (rota === "/api/licenca/resgatar" && req.method === "POST") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Faça login pra resgatar um código." });
    const corpo = await lerCorpo(req);
    const cod = String(corpo.codigo || "").trim().toUpperCase();
    const c = bd.codigos[cod];
    if (!c) return responderJson(res, 404, { erro: "Código inválido." });
    if (c.usadoPor) return responderJson(res, 409, { erro: "Esse código já foi usado." });
    const lic = concederLicenca(bd.usuarios[nome], c.tier, { dias: c.dias, escola: c.escola, por: "codigo:" + cod });
    c.usadoPor = nome;
    c.usadoEm = Date.now();
    salvarBd();
    return responderJson(res, 200, { ok: true, licenca: lic });
  }

  // POST /api/assinar { tier }  (autenticado) — cria checkout no Mercado Pago
  if (rota === "/api/assinar" && req.method === "POST") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Faça login pra assinar." });
    const corpo = await lerCorpo(req);
    const tier = String(corpo.tier || "");
    if (!PRECOS[tier]) return responderJson(res, 400, { erro: "Plano inválido. O vitalício e o escola não são vendidos por aqui." });
    if (!process.env.MP_TOKEN) {
      return responderJson(res, 503, { erro: "Checkout automático ainda não está ativo. Use um código de ativação.", fallback: "codigo" });
    }
    try {
      const base = process.env.URL_BASE || "https://aws-cli-quest.fly.dev";
      const pref = {
        items: [{ title: TITULO_PLANO[tier], quantity: 1, unit_price: PRECOS[tier], currency_id: "BRL" }],
        external_reference: nome + "|" + tier,
        back_urls: { success: base + "/?pago=1", failure: base + "/?pago=0", pending: base + "/?pago=pendente" },
        auto_return: "approved",
        notification_url: base + "/api/mp/webhook",
      };
      const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.MP_TOKEN },
        body: JSON.stringify(pref),
      });
      const dados = await r.json();
      if (!dados.init_point) return responderJson(res, 502, { erro: "Mercado Pago não retornou o checkout.", detalhe: dados.message || "" });
      return responderJson(res, 200, { url: dados.init_point });
    } catch (e) {
      return responderJson(res, 502, { erro: "Falha ao falar com o Mercado Pago: " + e.message });
    }
  }

  // POST /api/mp/webhook — Mercado Pago avisa que um pagamento mudou de status
  if (rota === "/api/mp/webhook" && req.method === "POST") {
    try {
      const corpo = await lerCorpo(req).catch(() => ({}));
      const url = new URL(req.url, "http://x");
      const tipo = corpo.type || url.searchParams.get("type");
      const pagamentoId = (corpo.data && corpo.data.id) || url.searchParams.get("data.id") || url.searchParams.get("id");
      if (tipo === "payment" && pagamentoId && process.env.MP_TOKEN) {
        // busca o pagamento na fonte (não dá pra forjar) e confere se foi aprovado
        const r = await fetch("https://api.mercadopago.com/v1/payments/" + pagamentoId, {
          headers: { Authorization: "Bearer " + process.env.MP_TOKEN },
        });
        const pag = await r.json();
        if (pag.status === "approved" && pag.external_reference) {
          const [usuario, tier] = String(pag.external_reference).split("|");
          if (bd.usuarios[usuario] && PRECOS[tier]) {
            concederLicenca(bd.usuarios[usuario], tier, { por: "mercadopago:" + pagamentoId });
            salvarBd();
          }
        }
      }
    } catch (e) {
      console.error("webhook MP erro:", e.message);
    }
    return responderJson(res, 200, { ok: true }); // sempre 200 pro MP não reenviar infinito
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
