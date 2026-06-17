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

// ---------- 2FA (TOTP, compatível com Google Authenticator/Authy — sem deps) ----------
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(buf) {
  let bits = 0, valor = 0, saida = "";
  for (const b of buf) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { saida += B32[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) saida += B32[(valor << (5 - bits)) & 31];
  return saida;
}
function base32Decode(str) {
  let bits = 0, valor = 0; const out = [];
  for (const ch of String(str).toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    valor = (valor << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((valor >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(secretB32, t) {
  let contador = Math.floor((t || Date.now()) / 1000 / 30);
  const buf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) { buf[i] = contador & 0xff; contador = Math.floor(contador / 256); }
  const h = crypto.createHmac("sha1", base32Decode(secretB32)).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  const cod = (((h[off] & 0x7f) << 24) | ((h[off + 1] & 0xff) << 16) | ((h[off + 2] & 0xff) << 8) | (h[off + 3] & 0xff)) % 1000000;
  return String(cod).padStart(6, "0");
}
function verificarTotp(secretB32, codigo) {
  const c = String(codigo || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  for (let w = -1; w <= 1; w++) { // tolera ±30s de defasagem de relógio
    if (totp(secretB32, Date.now() + w * 30000) === c) return true;
  }
  return false;
}

// ---------- Sessões ----------
const SESSAO_TTL_MS = 30 * 86400000; // token vale 30 dias

function novaSessao(nomeUsuario) {
  const token = crypto.randomBytes(32).toString("hex");
  bd.sessoes[token] = { usuario: nomeUsuario, criadoEm: Date.now() };
  return token;
}

function usuarioDoToken(token) {
  const s = token && bd.sessoes[token];
  if (!s) return null;
  if (Date.now() - s.criadoEm > SESSAO_TTL_MS) { delete bd.sessoes[token]; return null; }
  return bd.usuarios[s.usuario] ? s.usuario : null;
}

function limparExpirados() {
  const agora = Date.now();
  for (const [t, s] of Object.entries(bd.sessoes)) {
    if (agora - s.criadoEm > SESSAO_TTL_MS) delete bd.sessoes[t];
  }
  for (const [k, arr] of _janela) {
    if (!arr.some((t) => agora - t < 3600000)) _janela.delete(k);
  }
}

// ---------- Proteção contra abuso (rate limit + bloqueio de login) ----------
function ipDe(req) {
  return (
    req.headers["fly-client-ip"] ||
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    "?"
  );
}
const _janela = new Map(); // chave -> [timestamps] (janela deslizante)
function dentroDoLimite(chave, max, janelaMs) {
  const agora = Date.now();
  const arr = (_janela.get(chave) || []).filter((t) => agora - t < janelaMs);
  arr.push(agora);
  _janela.set(chave, arr);
  return arr.length <= max;
}
const _falhasLogin = new Map(); // usuario -> { n, ate }
function segundosBloqueado(nome) {
  const f = _falhasLogin.get(nome);
  return f && f.ate > Date.now() ? Math.ceil((f.ate - Date.now()) / 1000) : 0;
}
function registrarFalhaLogin(nome) {
  const f = _falhasLogin.get(nome) || { n: 0, ate: 0 };
  f.n++;
  if (f.n >= 5) f.ate = Date.now() + Math.min(15 * 60000, (f.n - 4) * 60000); // 1min → até 15min
  _falhasLogin.set(nome, f);
}
function limparFalhasLogin(nome) { _falhasLogin.delete(nome); }

// ---------- Validação ----------
const NOME_VALIDO = /^[a-zA-Z0-9_.-]{3,20}$/;

function validarCadastro(nome, senha) {
  if (!nome || !NOME_VALIDO.test(nome)) {
    return "Usuário inválido: use 3 a 20 caracteres (letras, números, ponto, hífen ou _).";
  }
  if (!senha || String(senha).length < 6) {
    return "Senha muito curta: use pelo menos 6 caracteres.";
  }
  if (String(senha).length > 200) {
    return "Senha longa demais.";
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

// headers de segurança aplicados em TODA resposta
const HEADERS_SEG = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY", // anti-clickjacking (ninguém embute o app num iframe)
  "Referrer-Policy": "no-referrer",
};

function responderJson(res, status, obj) {
  const corpo = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...HEADERS_SEG });
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

// Plano personalizado: você escolhe quantos meses, e o preço por mês cai
// progressivamente (ancorado no mensal/semestral/anual).
const FAIXAS_CUSTOM = [
  { min: 12, mes: 12.49 }, // 12+ meses — preço do anual
  { min: 6, mes: 14.98 }, //  6–11   — preço do semestral
  { min: 3, mes: 16.9 }, //   3–5    — desconto intermediário
  { min: 1, mes: 19.9 }, //   1–2    — preço do mensal
];
function precoMesCustom(meses) {
  for (const f of FAIXAS_CUSTOM) if (meses >= f.min) return f.mes;
  return 19.9;
}
function precoCustom(mesesBruto) {
  const meses = Math.max(1, Math.min(24, Math.floor(Number(mesesBruto) || 1)));
  return { meses, total: Math.round(meses * precoMesCustom(meses) * 100) / 100 };
}

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
    if (!dentroDoLimite("cad:" + ipDe(req), 5, 3600000)) {
      return responderJson(res, 429, { erro: "Muitas contas criadas a partir desse acesso. Tente daqui a pouco." });
    }
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
    if (!dentroDoLimite("login:" + ipDe(req), 20, 5 * 60000)) {
      return responderJson(res, 429, { erro: "Muitas tentativas. Espere alguns minutos e tente de novo." });
    }
    const corpo = await lerCorpo(req);
    const nome = String(corpo.usuario || "").trim();
    const bloq = segundosBloqueado(nome);
    if (bloq) {
      return responderJson(res, 429, { erro: `Conta bloqueada por tentativas demais. Tente em ${bloq}s.` });
    }
    const u = bd.usuarios[nome];
    if (!u || !conferirSenha(String(corpo.senha || ""), u.salt, u.hash)) {
      if (u) registrarFalhaLogin(nome); // só conta falha de usuário real (não revela quais existem)
      return responderJson(res, 401, { erro: "Usuário ou senha incorretos." });
    }
    // 2º fator, se o usuário tiver 2FA ativo
    if (u.twofa) {
      if (!corpo.codigo) return responderJson(res, 200, { precisa2fa: true });
      if (!verificarTotp(u.twofa, corpo.codigo)) {
        registrarFalhaLogin(nome);
        return responderJson(res, 401, { erro: "Código de 2FA incorreto." });
      }
    }
    limparFalhasLogin(nome);
    const token = novaSessao(nome);
    return responderJson(res, 200, { token, perfil: perfilPublico(nome), progresso: u.progresso, licenca: licencaPublica(u), twofa: !!u.twofa });
  }

  // GET /api/eu  (Authorization: Bearer <token>)
  if (rota === "/api/eu" && req.method === "GET") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Sessão expirada. Faça login de novo." });
    const u = bd.usuarios[nome];
    return responderJson(res, 200, { perfil: perfilPublico(nome), progresso: u.progresso, licenca: licencaPublica(u), twofa: !!u.twofa });
  }

  // POST /api/progresso { xp, melhorStreak, progresso }  (autenticado)
  if (rota === "/api/progresso" && req.method === "POST") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Sessão expirada. Faça login de novo." });
    const corpo = await lerCorpo(req);
    const u = bd.usuarios[nome];
    // teto de sanidade (evita XP/streak absurdos no ranking)
    if (typeof corpo.xp === "number" && corpo.xp >= 0) u.xp = Math.min(Math.floor(corpo.xp), 5000000);
    if (typeof corpo.melhorStreak === "number" && corpo.melhorStreak >= 0) u.melhorStreak = Math.min(Math.floor(corpo.melhorStreak), 100000);
    if (corpo.progresso && typeof corpo.progresso === "object") {
      const p = corpo.progresso;
      delete p.licenca; // a LICENÇA nunca vem do cliente — só de código/pagamento/admin
      u.progresso = p;
    }
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
    return responderJson(res, 200, {
      precos: PRECOS,
      checkoutAtivo: !!process.env.MP_TOKEN,
      custom: { min: 1, max: 24, faixas: FAIXAS_CUSTOM },
    });
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
    let unitPrice, titulo, externalRef;
    if (tier === "custom") {
      const c = precoCustom(corpo.meses);
      unitPrice = c.total;
      titulo = "AWS CLI Quest Pro — " + c.meses + (c.meses === 1 ? " mês" : " meses");
      externalRef = nome + "|custom|" + c.meses;
    } else if (PRECOS[tier]) {
      unitPrice = PRECOS[tier];
      titulo = TITULO_PLANO[tier];
      externalRef = nome + "|" + tier;
    } else {
      return responderJson(res, 400, { erro: "Plano inválido. O vitalício e o escola não são vendidos por aqui." });
    }
    if (!process.env.MP_TOKEN) {
      return responderJson(res, 503, { erro: "Checkout automático ainda não está ativo. Use um código de ativação.", fallback: "codigo" });
    }
    try {
      const base = process.env.URL_BASE || "https://aws-cli-quest.fly.dev";
      const pref = {
        items: [{ title: titulo, quantity: 1, unit_price: unitPrice, currency_id: "BRL" }],
        external_reference: externalRef,
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

  // POST /api/2fa/iniciar  (autenticado) — gera um segredo provisório
  if (rota === "/api/2fa/iniciar" && req.method === "POST") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Faça login primeiro." });
    const u = bd.usuarios[nome];
    if (u.twofa) return responderJson(res, 400, { erro: "O 2FA já está ativado." });
    const secret = base32Encode(crypto.randomBytes(20));
    u.twofaTmp = secret;
    salvarBd();
    const label = encodeURIComponent("AWS CLI Quest:" + nome);
    const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=AWS%20CLI%20Quest&period=30&digits=6`;
    return responderJson(res, 200, { secret, otpauth });
  }

  // POST /api/2fa/ativar  (autenticado, { codigo }) — confirma e liga o 2FA
  if (rota === "/api/2fa/ativar" && req.method === "POST") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Faça login primeiro." });
    const u = bd.usuarios[nome];
    const corpo = await lerCorpo(req);
    if (!u.twofaTmp) return responderJson(res, 400, { erro: "Comece em 'Ativar 2FA' antes de confirmar." });
    if (!verificarTotp(u.twofaTmp, corpo.codigo)) return responderJson(res, 400, { erro: "Código incorreto. Confira o relógio e o app autenticador." });
    u.twofa = u.twofaTmp;
    delete u.twofaTmp;
    salvarBd();
    return responderJson(res, 200, { ok: true });
  }

  // POST /api/2fa/desativar  (autenticado, { senha }) — desliga (pede a senha)
  if (rota === "/api/2fa/desativar" && req.method === "POST") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Faça login primeiro." });
    const u = bd.usuarios[nome];
    const corpo = await lerCorpo(req);
    if (!conferirSenha(String(corpo.senha || ""), u.salt, u.hash)) return responderJson(res, 401, { erro: "Senha incorreta." });
    delete u.twofa;
    delete u.twofaTmp;
    salvarBd();
    return responderJson(res, 200, { ok: true });
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
          const partes = String(pag.external_reference).split("|");
          const usuario = partes[0];
          const tier = partes[1];
          if (bd.usuarios[usuario]) {
            if (tier === "custom") {
              const meses = Math.max(1, Math.min(24, parseInt(partes[2], 10) || 1));
              concederLicenca(bd.usuarios[usuario], "custom", { dias: meses * 30, por: "mercadopago:" + pagamentoId });
              salvarBd();
            } else if (PRECOS[tier]) {
              concederLicenca(bd.usuarios[usuario], tier, { por: "mercadopago:" + pagamentoId });
              salvarBd();
            }
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

// só estes tipos podem ser servidos (o resto = 404)
const EXT_PUBLICAS = new Set([".html", ".js", ".css", ".png", ".svg", ".ico", ".jpg", ".jpeg", ".webp", ".woff2"]);
// nunca servir código de servidor, scripts de admin, dados, configs etc.
const PROIBIDO = /(^|\/)(servidor\.js|scripts\/|teste\/|node_modules\/|\.git|\.env|fly\.toml|dockerfile|\.dockerignore)|\.(bak|json|toml|md|pem|lock)$|quest-dados/i;

function servirEstatico(req, res, rota) {
  const relativo = rota === "/" ? "index.html" : rota.replace(/^\/+/, "");
  const arquivo = path.normalize(path.join(RAIZ, relativo));
  const ext = path.extname(arquivo).toLowerCase();
  if (!arquivo.startsWith(RAIZ) || relativo.includes("\0") || PROIBIDO.test(relativo) || !EXT_PUBLICAS.has(ext)) {
    res.writeHead(403, HEADERS_SEG);
    res.end("403");
    return;
  }
  fs.readFile(arquivo, (erro, conteudo) => {
    if (erro) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...HEADERS_SEG });
      res.end("404 — " + relativo);
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIMES[ext] || "application/octet-stream",
      "Cache-Control": rota.startsWith("/js/") || rota.startsWith("/css/") ? "no-cache" : "no-store",
      ...HEADERS_SEG,
    });
    res.end(conteudo);
  });
}

// ---------- Servidor ----------
carregarBd();
limparExpirados();
setInterval(limparExpirados, 3600000).unref(); // limpa sessões/rate-limit de hora em hora
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
