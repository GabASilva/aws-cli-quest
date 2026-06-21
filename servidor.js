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
    if (!bd.resets) bd.resets = {};
    if (!bd.alertas) bd.alertas = [];
    if (!bd.verificacoes) bd.verificacoes = {};
    if (!bd.salas) bd.salas = {};
    if (!bd.eventos) bd.eventos = [];
    if (!bd.adminLog) bd.adminLog = [];
    if (!bd.metricas) bd.metricas = { porDia: {} };
  } catch (e) {
    bd = { usuarios: {}, sessoes: {}, codigos: {}, resets: {}, alertas: [], verificacoes: {}, salas: {}, eventos: [], adminLog: [], metricas: { porDia: {} } };
  }
}

// ---------- E-mail (Resend) ----------
const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
async function enviarEmail(para, assunto, html) {
  if (!process.env.RESEND_KEY) {
    console.log(`[e-mail DEV → ${para}] ${assunto} :: ${html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`);
    return;
  }
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.RESEND_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "CLImb <onboarding@resend.dev>",
        to: para,
        subject: assunto,
        html,
      }),
    });
  } catch (e) {
    console.error("falha ao enviar e-mail:", e.message);
  }
}

// Gera um token de confirmação de e-mail e manda o link (vale 24h).
function enviarVerificacao(usuario, email) {
  const token = crypto.randomBytes(24).toString("hex");
  bd.verificacoes = bd.verificacoes || {};
  bd.verificacoes[token] = { usuario, email, expira: Date.now() + 24 * 3600000 };
  salvarBd();
  const base = process.env.URL_BASE || "https://aws-cli-quest.fly.dev";
  const link = `${base}/?verificar=${token}`;
  enviarEmail(
    email,
    "Confirme seu e-mail — CLImb",
    `<p>Olá, <strong>${usuario}</strong>!</p><p>Confirme seu e-mail no CLImb clicando no link abaixo (vale 24 horas):</p><p><a href="${link}">${link}</a></p><p>Se não foi você, pode ignorar este e-mail.</p>`
  );
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
  if (!bd.usuarios[s.usuario] || bd.usuarios[s.usuario].banido) return null; // conta inexistente/banida
  return s.usuario;
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

// Gera um nome de usuário único a partir do nome/e-mail do Google.
function gerarUsername(base) {
  let s = String(base || "").toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 16);
  if (s.length < 3) s = "user" + s;
  let nome = s;
  let i = 1;
  while (bd.usuarios[nome]) nome = (s + i++).slice(0, 20);
  return nome;
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
const TITULO_PLANO = { mensal: "CLImb Pro — Mensal", semestral: "CLImb Pro — Semestral", anual: "CLImb Pro — Anual" };

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

// ---------- Salas / Turmas (multiplayer assíncrono) ----------
const MAX_SALAS_USUARIO = 20; // em quantas turmas um usuário pode estar
const MAX_MEMBROS_SALA = 300; // teto de membros por turma
const NOME_SALA_OK = /^[\wÀ-ÿ0-9 .,!?@#&+-]{1,40}$/; // nome amigável, sem HTML
const ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem O/0/I/1 (ambíguos)
// Algumas operações de competição podem exigir e-mail confirmado — ligado por env
// (deixe desligado até verificar um domínio no Resend, senão ninguém entra).
function exigeEmailVerificado() {
  return process.env.COMPETICAO_EXIGE_EMAIL === "1" || process.env.COMPETICAO_EXIGE_EMAIL === "true";
}
function gerarCodigoSala() {
  let cod;
  do {
    cod = "";
    for (let i = 0; i < 6; i++) cod += ALFABETO_CODIGO[Math.floor(Math.random() * ALFABETO_CODIGO.length)];
  } while (bd.salas && bd.salas[cod]);
  return cod;
}
function salasDoUsuario(nome) {
  if (!bd.salas) return [];
  return Object.values(bd.salas).filter((s) => s.membros.includes(nome));
}
// Visão pública de uma turma: dados + ranking dos membros (por XP).
function salaPublica(sala, euNome) {
  const ranking = sala.membros
    .filter((n) => bd.usuarios[n])
    .map((n) => Object.assign(perfilPublico(n), { ehVoce: n === euNome }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 100);
  return {
    codigo: sala.codigo, nome: sala.nome, dono: sala.dono, ehDono: sala.dono === euNome,
    criadoEm: sala.criadoEm, total: sala.membros.length, ranking,
  };
}

// ---------- Sanidade do progresso (anti-tampering do ranking) ----------
// O XP é calculado no cliente (jogo no navegador), então o servidor NÃO tem como
// provar que foi ganho honestamente — ainda mais com o "treino aleatório", que é
// repetível e infinito. O que dá pra fazer (e fazemos) é LIMITAR tudo a faixas
// plausíveis e SANEAR o payload, pra ninguém botar 5 milhões de XP, lotar o banco
// ou injetar lixo. O que realmente importa (licença, dados de outros, contas) é
// protegido em outras camadas.
const TETO_XP = 100000; // ranking: teto de sanidade (antes era 5.000.000)
const TETO_STREAK = 10000; // sequência: teto de sanidade
const TETO_XP_DESAFIO = 1000; // xpGanho por desafio (folga p/ bônus de sequência)
const MAX_CONCLUIDOS = 3000; // nº máximo de desafios guardados por conta
const MAX_CHAVES_OBJ = 3000; // teto genérico de chaves em mapas do progresso
const CHAVE_PROIBIDA = (k) => k === "__proto__" || k === "constructor" || k === "prototype";

function intLimitado(v, teto) {
  const n = Math.floor(Number(v));
  if (!isFinite(n) || n < 0) return 0;
  return Math.min(n, teto);
}
// Mapa id->valor com chaves seguras e quantidade limitada
function mapaSeguro(obj, maxChaves, transformarValor) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  let n = 0;
  for (const k of Object.keys(obj)) {
    if (n >= maxChaves) break;
    if (typeof k !== "string" || k.length > 80 || CHAVE_PROIBIDA(k)) continue;
    out[k] = transformarValor ? transformarValor(obj[k]) : obj[k];
    n++;
  }
  return out;
}
// Reconstrói só os campos conhecidos do progresso, em faixas seguras. Campos
// desconhecidos enviados pelo cliente são descartados (anti mass-assignment).
function sanearProgresso(p) {
  if (!p || typeof p !== "object") return null;
  const out = {};
  out.streak = intLimitado(p.streak, TETO_STREAK);
  out.concluidos = mapaSeguro(p.concluidos, MAX_CONCLUIDOS, (v) => ({
    xpGanho: intLimitado(v && v.xpGanho, TETO_XP_DESAFIO),
    revelado: !!(v && v.revelado),
  }));
  out.revelados = mapaSeguro(p.revelados, MAX_CONCLUIDOS, (v) => !!v);
  out.etapasProjetos = mapaSeguro(p.etapasProjetos, MAX_CHAVES_OBJ, (v) =>
    Array.isArray(v) ? v.slice(0, 50).map(Boolean) : []);
  out.missoesConsole = mapaSeguro(p.missoesConsole, 200, (v) => !!v);
  out.sequenciasPerdidas = Array.isArray(p.sequenciasPerdidas)
    ? p.sequenciasPerdidas.slice(0, 3).map((x) => intLimitado(x, TETO_STREAK)) : [];
  // `conta` é o estado da AWS simulada do próprio usuário — guarda como veio
  // (já limitado pelo teto de 100KB do corpo). Só barra chaves perigosas no topo.
  if (p.conta && typeof p.conta === "object") out.conta = mapaSeguro(p.conta, 50, (v) => v);
  return out;
}

// ---------- Monitoramento / alertas (antifraude) ----------
// Não dá pra PROVAR honestidade do XP no servidor, mas dá pra DETECTAR anomalias
// e avisar o dono pra revisão manual (importante quando entrar competição).
const ALERTA_XP_DIA = Number(process.env.ALERTA_XP_DIA) || 5000; // XP ganho num dia acima disso -> alerta
const ALERTA_XP_SALTO = Number(process.env.ALERTA_XP_SALTO) || 3000; // pulo de XP num save só -> alerta
const ALERTA_CADASTRO_IP_DIA = Number(process.env.ALERTA_CADASTRO_IP_DIA) || 10; // contas/IP/dia -> alerta

function diaHoje() { return new Date().toISOString().slice(0, 10); }

// Registra um alerta no banco (últimos 500) e, se houver ALERTA_EMAIL, avisa por e-mail.
function registrarAlerta(tipo, dados) {
  if (!bd.alertas) bd.alertas = [];
  const ev = Object.assign({ tipo, quando: new Date().toISOString() }, dados);
  bd.alertas.push(ev);
  if (bd.alertas.length > 500) bd.alertas = bd.alertas.slice(-500);
  salvarBd();
  console.warn("[ALERTA] " + tipo + " :: " + (dados.detalhe || JSON.stringify(dados)));
  const dest = process.env.ALERTA_EMAIL;
  if (dest) {
    enviarEmail(dest, "⚠️ CLImb — alerta: " + tipo,
      `<p>Alerta de <b>${tipo}</b> no CLImb:</p><p>${dados.detalhe || JSON.stringify(dados)}</p>` +
      `<p>Veja todos com: <code>node scripts/admin.js alertas</code></p>`);
  }
}

// XP suspeito: acumula o ganho do dia por usuário e dispara 1 alerta/dia.
function checarXpSuspeito(nome, u, delta) {
  const hoje = diaHoje();
  if (!u.xpDia || u.xpDia.dia !== hoje) u.xpDia = { dia: hoje, ganho: 0, alertado: false };
  if (delta > 0) u.xpDia.ganho += delta;
  if (u.xpDia.alertado) return;
  let motivo = null;
  if (u.xpDia.ganho >= ALERTA_XP_DIA) motivo = `ganhou ${u.xpDia.ganho} XP hoje`;
  else if (delta >= ALERTA_XP_SALTO) motivo = `salto de +${delta} XP num save só`;
  if (motivo) {
    u.xpDia.alertado = true;
    registrarAlerta("xp_suspeito", { usuario: nome, detalhe: `${nome} ${motivo} (total ${u.xp} XP). Verifique se é jogo limpo.`, ganhoDia: u.xpDia.ganho, xp: u.xp });
  }
}

// Criação de contas em massa: conta cadastros por IP/dia (em memória) e dispara 1 alerta/dia/IP.
const _cadastroDia = new Map(); // ip -> { dia, n, alertado }
function checarCadastroMassa(ip) {
  const hoje = diaHoje();
  let e = _cadastroDia.get(ip);
  if (!e || e.dia !== hoje) { e = { dia: hoje, n: 0, alertado: false }; _cadastroDia.set(ip, e); }
  e.n++;
  if (e.n >= ALERTA_CADASTRO_IP_DIA && !e.alertado) {
    e.alertado = true;
    registrarAlerta("cadastro_massa", { ip, detalhe: `${e.n} contas criadas do IP ${ip} hoje. Pode ser uma turma estudando junto — ou abuso.`, contas: e.n });
  }
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
    const email = String(corpo.email || "").trim().toLowerCase();
    if (email && !EMAIL_VALIDO.test(email)) return responderJson(res, 400, { erro: "E-mail inválido." });
    if (email && Object.values(bd.usuarios).some((u) => u.email === email)) return responderJson(res, 409, { erro: "Esse e-mail já está em uso." });
    const { salt, hash } = criarSenha(String(corpo.senha));
    bd.usuarios[nome] = { salt, hash, email: email || null, emailVerificado: false, xp: 0, melhorStreak: 0, progresso: null, criadoEm: Date.now() };
    salvarBd();
    checarCadastroMassa(ipDe(req)); // antifraude: avisa o dono se um IP criar muitas contas
    if (email) enviarVerificacao(nome, email); // manda o link de confirmação
    const token = novaSessao(nome);
    return responderJson(res, 201, { token, perfil: perfilPublico(nome), licenca: licencaPublica(bd.usuarios[nome]), email: email || null, emailVerificado: false });
  }

  // POST /api/login { usuario, senha }
  if (rota === "/api/login" && req.method === "POST") {
    if (!dentroDoLimite("login:" + ipDe(req), 20, 5 * 60000)) {
      return responderJson(res, 429, { erro: "Muitas tentativas. Espere alguns minutos e tente de novo." });
    }
    const corpo = await lerCorpo(req);
    const entrada = String(corpo.usuario || "").trim();
    // Aceita login por NOME de usuário OU por e-mail. Como o e-mail é único
    // (validado no cadastro e no /api/email), não há ambiguidade.
    let nome = entrada;
    let u = bd.usuarios[nome];
    if (!u && entrada.includes("@")) {
      const email = entrada.toLowerCase();
      const achado = Object.entries(bd.usuarios).find(([, x]) => x.email && x.email === email);
      if (achado) { nome = achado[0]; u = achado[1]; }
    }
    const bloq = segundosBloqueado(nome);
    if (bloq) {
      return responderJson(res, 429, { erro: `Conta bloqueada por tentativas demais. Tente em ${bloq}s.` });
    }
    // contas criadas só via Google não têm senha — não dá pra logar por senha
    // (mas podem definir uma usando "Esqueci minha senha", já que têm e-mail)
    if (!u || !u.hash || !conferirSenha(String(corpo.senha || ""), u.salt, u.hash)) {
      if (u && u.hash) registrarFalhaLogin(nome); // só conta falha de usuário real (não revela quais existem)
      return responderJson(res, 401, { erro: "Usuário ou senha incorretos." });
    }
    if (u.banido) return responderJson(res, 403, { erro: "Esta conta está suspensa." + (u.banidoMotivo ? " Motivo: " + u.banidoMotivo : "") });
    u.ultimoAcesso = Date.now();
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
    return responderJson(res, 200, { token, perfil: perfilPublico(nome), progresso: u.progresso, licenca: licencaPublica(u), twofa: !!u.twofa, email: u.email || null, emailVerificado: !!u.emailVerificado });
  }

  // GET /api/eu  (Authorization: Bearer <token>)
  if (rota === "/api/eu" && req.method === "GET") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Sessão expirada. Faça login de novo." });
    const u = bd.usuarios[nome];
    return responderJson(res, 200, { perfil: perfilPublico(nome), progresso: u.progresso, licenca: licencaPublica(u), twofa: !!u.twofa, email: u.email || null, emailVerificado: !!u.emailVerificado });
  }

  // POST /api/progresso { xp, melhorStreak, progresso }  (autenticado)
  if (rota === "/api/progresso" && req.method === "POST") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Sessão expirada. Faça login de novo." });
    if (!dentroDoLimite("prog:" + nome, 60, 60000)) {
      return responderJson(res, 429, { erro: "Salvando rápido demais. Espere um instante." });
    }
    const corpo = await lerCorpo(req);
    const u = bd.usuarios[nome];
    // XP/streak entram só em faixas plausíveis (o cálculo é no cliente — aqui é
    // teto de sanidade pro ranking, não prova de honestidade).
    const xpAnterior = u.xp || 0;
    if (typeof corpo.xp === "number") u.xp = intLimitado(corpo.xp, TETO_XP);
    if (typeof corpo.melhorStreak === "number") u.melhorStreak = intLimitado(corpo.melhorStreak, TETO_STREAK);
    checarXpSuspeito(nome, u, u.xp - xpAnterior); // antifraude: avisa o dono se subir demais
    // progresso é RECONSTRUÍDO só com os campos conhecidos e saneados — nunca
    // guardamos o objeto cru do cliente (corta mass-assignment, lixo e a licença).
    const limpo = sanearProgresso(corpo.progresso);
    if (limpo) u.progresso = limpo;
    u.ultimoAcesso = Date.now();
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

  // GET /api/salas  (autenticado) — turmas em que estou, com ranking de cada
  if (rota === "/api/salas" && req.method === "GET") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Faça login pra ver suas turmas." });
    const salas = salasDoUsuario(nome).map((s) => salaPublica(s, nome)).sort((a, b) => b.criadoEm - a.criadoEm);
    return responderJson(res, 200, { salas, exigeEmail: exigeEmailVerificado() });
  }

  // POST /api/salas/criar { nome }  (autenticado)
  if (rota === "/api/salas/criar" && req.method === "POST") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Faça login pra criar uma turma." });
    const u = bd.usuarios[nome];
    if (exigeEmailVerificado() && !u.emailVerificado) return responderJson(res, 403, { erro: "Confirme seu e-mail pra criar uma turma de competição." });
    if (!dentroDoLimite("salacriar:" + nome, 10, 3600000)) return responderJson(res, 429, { erro: "Você criou turmas demais agora há pouco. Espere um pouco." });
    const corpo = await lerCorpo(req);
    const nomeSala = String(corpo.nome || "").trim();
    if (!NOME_SALA_OK.test(nomeSala)) return responderJson(res, 400, { erro: "Nome de turma inválido (1 a 40 caracteres, sem símbolos estranhos)." });
    if (salasDoUsuario(nome).length >= MAX_SALAS_USUARIO) return responderJson(res, 400, { erro: `Você já está em ${MAX_SALAS_USUARIO} turmas (o máximo).` });
    const codigo = gerarCodigoSala();
    bd.salas[codigo] = { codigo, nome: nomeSala, dono: nome, criadoEm: Date.now(), membros: [nome] };
    salvarBd();
    return responderJson(res, 201, { sala: salaPublica(bd.salas[codigo], nome) });
  }

  // POST /api/salas/entrar { codigo }  (autenticado)
  if (rota === "/api/salas/entrar" && req.method === "POST") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Faça login pra entrar numa turma." });
    const u = bd.usuarios[nome];
    if (exigeEmailVerificado() && !u.emailVerificado) return responderJson(res, 403, { erro: "Confirme seu e-mail pra entrar numa turma de competição." });
    const corpo = await lerCorpo(req);
    const codigo = String(corpo.codigo || "").trim().toUpperCase();
    const sala = bd.salas[codigo];
    if (!sala) return responderJson(res, 404, { erro: "Código de turma não encontrado." });
    if (sala.membros.includes(nome)) return responderJson(res, 200, { sala: salaPublica(sala, nome), jaEra: true });
    if (sala.membros.length >= MAX_MEMBROS_SALA) return responderJson(res, 400, { erro: "Essa turma já está cheia." });
    if (salasDoUsuario(nome).length >= MAX_SALAS_USUARIO) return responderJson(res, 400, { erro: `Você já está em ${MAX_SALAS_USUARIO} turmas (o máximo).` });
    sala.membros.push(nome);
    salvarBd();
    return responderJson(res, 200, { sala: salaPublica(sala, nome) });
  }

  // POST /api/salas/sair { codigo }  (autenticado) — sair; se o dono sair, passa o posto ou apaga
  if (rota === "/api/salas/sair" && req.method === "POST") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Faça login primeiro." });
    const corpo = await lerCorpo(req);
    const sala = bd.salas[String(corpo.codigo || "").trim().toUpperCase()];
    if (!sala) return responderJson(res, 404, { erro: "Turma não encontrada." });
    sala.membros = sala.membros.filter((m) => m !== nome);
    if (!sala.membros.length) delete bd.salas[sala.codigo];
    else if (sala.dono === nome) sala.dono = sala.membros[0]; // passa o posto pro próximo
    salvarBd();
    return responderJson(res, 200, { ok: true });
  }

  // POST /api/salas/apagar { codigo }  (autenticado, só o dono)
  if (rota === "/api/salas/apagar" && req.method === "POST") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Faça login primeiro." });
    const corpo = await lerCorpo(req);
    const sala = bd.salas[String(corpo.codigo || "").trim().toUpperCase()];
    if (!sala) return responderJson(res, 404, { erro: "Turma não encontrada." });
    if (sala.dono !== nome) return responderJson(res, 403, { erro: "Só quem criou a turma pode apagá-la." });
    delete bd.salas[sala.codigo];
    salvarBd();
    return responderJson(res, 200, { ok: true });
  }

  // GET /api/config  (público — o que o front precisa saber pra montar a UI)
  if (rota === "/api/config" && req.method === "GET") {
    return responderJson(res, 200, { googleClientId: process.env.GOOGLE_CLIENT_ID || null });
  }

  // POST /api/google  { credential }  — login/cadastro com Conta Google (one-click)
  if (rota === "/api/google" && req.method === "POST") {
    if (!process.env.GOOGLE_CLIENT_ID) return responderJson(res, 503, { erro: "Login com Google ainda não está ativo." });
    if (!dentroDoLimite("google:" + ipDe(req), 30, 5 * 60000)) return responderJson(res, 429, { erro: "Muitas tentativas. Espere um pouco." });
    const corpo = await lerCorpo(req);
    const cred = String(corpo.credential || "");
    if (!cred) return responderJson(res, 400, { erro: "Faltou o token do Google." });
    let info;
    try {
      const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(cred));
      info = await r.json();
    } catch (e) {
      return responderJson(res, 502, { erro: "Falha ao validar com o Google." });
    }
    // o Google verifica a assinatura; aqui conferimos pra QUEM o token foi emitido
    const emailOk = info && (info.email_verified === true || info.email_verified === "true");
    if (!info || info.aud !== process.env.GOOGLE_CLIENT_ID || !emailOk || !info.email) {
      return responderJson(res, 401, { erro: "Não consegui validar sua Conta Google." });
    }
    const email = String(info.email).toLowerCase();
    let nome = Object.keys(bd.usuarios).find((n) => bd.usuarios[n].email === email);
    if (!nome) {
      nome = gerarUsername(info.given_name || info.name || email.split("@")[0]);
      bd.usuarios[nome] = { email, google: true, emailVerificado: true, xp: 0, melhorStreak: 0, progresso: null, criadoEm: Date.now() };
    }
    const u = bd.usuarios[nome];
    if (!u.emailVerificado) u.emailVerificado = true; // o Google já confirmou o e-mail
    salvarBd();
    const token = novaSessao(nome);
    return responderJson(res, 200, { token, perfil: perfilPublico(nome), progresso: u.progresso, licenca: licencaPublica(u), twofa: !!u.twofa, email: u.email || null, emailVerificado: !!u.emailVerificado });
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
      titulo = "CLImb Pro — " + c.meses + (c.meses === 1 ? " mês" : " meses");
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

  // POST /api/email  (autenticado, { email }) — define/atualiza o e-mail da conta
  if (rota === "/api/email" && req.method === "POST") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Faça login primeiro." });
    const corpo = await lerCorpo(req);
    const email = String(corpo.email || "").trim().toLowerCase();
    if (!EMAIL_VALIDO.test(email)) return responderJson(res, 400, { erro: "E-mail inválido." });
    if (Object.entries(bd.usuarios).some(([n, u]) => n !== nome && u.email === email)) {
      return responderJson(res, 409, { erro: "Esse e-mail já está em uso por outra conta." });
    }
    bd.usuarios[nome].email = email;
    bd.usuarios[nome].emailVerificado = false; // e-mail novo precisa ser confirmado
    salvarBd();
    enviarVerificacao(nome, email);
    return responderJson(res, 200, { ok: true, email, emailVerificado: false });
  }

  // POST /api/email/verificar { token }  — confirma o e-mail pelo link
  if (rota === "/api/email/verificar" && req.method === "POST") {
    const corpo = await lerCorpo(req);
    const token = String(corpo.token || "");
    const v = bd.verificacoes && bd.verificacoes[token];
    if (!v || v.expira < Date.now()) {
      if (v) delete bd.verificacoes[token];
      return responderJson(res, 400, { erro: "Link inválido ou expirado. Peça um novo." });
    }
    const u = bd.usuarios[v.usuario];
    delete bd.verificacoes[token];
    if (!u || u.email !== v.email) { salvarBd(); return responderJson(res, 400, { erro: "Esse link não vale mais (o e-mail da conta mudou)." }); }
    u.emailVerificado = true;
    salvarBd();
    return responderJson(res, 200, { ok: true });
  }

  // POST /api/email/reenviar  (autenticado) — reenvia o link de confirmação
  if (rota === "/api/email/reenviar" && req.method === "POST") {
    const nome = usuarioDoToken(tokenDoCabecalho(req));
    if (!nome) return responderJson(res, 401, { erro: "Faça login primeiro." });
    if (!dentroDoLimite("verif:" + nome, 5, 3600000)) return responderJson(res, 429, { erro: "Muitos pedidos. Tente daqui a pouco." });
    const u = bd.usuarios[nome];
    if (!u.email) return responderJson(res, 400, { erro: "Sua conta não tem e-mail cadastrado." });
    if (u.emailVerificado) return responderJson(res, 200, { ok: true, jaVerificado: true });
    enviarVerificacao(nome, u.email);
    return responderJson(res, 200, { ok: true });
  }

  // POST /api/senha/esqueci  { email } — envia link de redefinição (não revela se existe)
  if (rota === "/api/senha/esqueci" && req.method === "POST") {
    if (!dentroDoLimite("esqueci:" + ipDe(req), 5, 3600000)) {
      return responderJson(res, 429, { erro: "Muitos pedidos. Tente daqui a pouco." });
    }
    const corpo = await lerCorpo(req);
    const email = String(corpo.email || "").trim().toLowerCase();
    const entrada = Object.entries(bd.usuarios).find(([n, u]) => u.email && u.email === email);
    if (entrada) {
      const token = crypto.randomBytes(24).toString("hex");
      bd.resets[token] = { usuario: entrada[0], expira: Date.now() + 3600000 }; // 1h
      salvarBd();
      const base = process.env.URL_BASE || "https://aws-cli-quest.fly.dev";
      const link = `${base}/?reset=${token}`;
      await enviarEmail(
        email,
        "Redefinir sua senha — CLImb",
        `<p>Olá, <strong>${entrada[0]}</strong>!</p><p>Recebemos um pedido pra redefinir sua senha no CLImb. Clique no link abaixo (vale por 1 hora):</p><p><a href="${link}">${link}</a></p><p>Se não foi você, pode ignorar este e-mail — sua senha continua a mesma.</p>`
      );
    }
    // resposta sempre igual, exista ou não a conta (não vaza quais e-mails existem)
    return responderJson(res, 200, { ok: true, msg: "Se existe uma conta com esse e-mail, enviamos o link de redefinição." });
  }

  // POST /api/senha/redefinir  { token, senha } — troca a senha e derruba as sessões
  if (rota === "/api/senha/redefinir" && req.method === "POST") {
    const corpo = await lerCorpo(req);
    const token = String(corpo.token || "");
    const r = bd.resets[token];
    if (!r || r.expira < Date.now()) {
      if (r) delete bd.resets[token];
      return responderJson(res, 400, { erro: "Link inválido ou expirado. Peça um novo." });
    }
    const erroSenha = validarCadastro("aaa", corpo.senha); // reusa só a regra de senha
    if (erroSenha && /[Ss]enha/.test(erroSenha)) return responderJson(res, 400, { erro: erroSenha });
    const u = bd.usuarios[r.usuario];
    if (!u) { delete bd.resets[token]; return responderJson(res, 400, { erro: "Conta não encontrada." }); }
    const { salt, hash } = criarSenha(String(corpo.senha));
    u.salt = salt;
    u.hash = hash;
    delete bd.resets[token];
    for (const [t, s] of Object.entries(bd.sessoes)) if (s.usuario === r.usuario) delete bd.sessoes[t]; // derruba sessões
    salvarBd();
    return responderJson(res, 200, { ok: true });
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
    const label = encodeURIComponent("CLImb:" + nome);
    const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=CLImb&period=30&digits=6`;
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

const PROD = !!process.env.DADOS_DIR; // no Fly o Dockerfile define DADOS_DIR

// ---------- Versão dos assets (cache-busting por conteúdo) ----------
// Hash de tudo que o cliente baixa. Muda só quando algum arquivo muda, então:
//  - index.html (sempre no-store) referencia js/css com ?v=VERSAO
//  - quando a gente faz deploy de algo novo, a VERSAO muda → URL nova → o
//    navegador baixa a versão nova sozinho (sem precisar de Ctrl+F5)
//  - quando nada mudou, ele reusa o cache (rápido)
function calcularVersao() {
  try {
    const h = crypto.createHash("sha256");
    for (const dir of ["js", "css"]) {
      const p = path.join(RAIZ, dir);
      for (const f of fs.readdirSync(p).sort()) {
        h.update(f);
        h.update(fs.readFileSync(path.join(p, f)));
      }
    }
    h.update(fs.readFileSync(path.join(RAIZ, "index.html")));
    return h.digest("hex").slice(0, 10);
  } catch (e) {
    return String(Date.now());
  }
}
const VERSAO = calcularVersao();

function servirEstatico(req, res, rota) {
  const relativo = rota === "/" ? "index.html" : rota.replace(/^\/+/, "");
  const arquivo = path.normalize(path.join(RAIZ, relativo));
  const ext = path.extname(arquivo).toLowerCase();
  if (!arquivo.startsWith(RAIZ) || relativo.includes("\0") || PROIBIDO.test(relativo) || !EXT_PUBLICAS.has(ext)) {
    res.writeHead(403, HEADERS_SEG);
    res.end("403");
    return;
  }
  const temVersao = /[?&]v=/.test(req.url || ""); // pediram a URL versionada?
  fs.readFile(arquivo, (erro, conteudo) => {
    if (erro) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...HEADERS_SEG });
      res.end("404 — " + relativo);
      return;
    }
    let corpo = conteudo;
    let cache;
    if (relativo === "index.html") {
      // injeta ?v=VERSAO em todo src/href de js/ e css/ (URLs locais)
      corpo = Buffer.from(
        String(conteudo).replace(/(src|href)="((?:js|css)\/[^"?]+)"/g, `$1="$2?v=${VERSAO}"`)
      );
      cache = "no-store"; // o HTML é sempre buscado fresco
    } else if (temVersao && PROD) {
      // URL versionada (imutável): pode cachear pra sempre, com segurança
      cache = "public, max-age=31536000, immutable";
    } else {
      // sem versão (ou em dev): revalida sempre, nunca serve velho
      cache = rota.startsWith("/js/") || rota.startsWith("/css/") ? "no-cache" : "no-store";
    }
    res.writeHead(200, {
      "Content-Type": MIMES[ext] || "application/octet-stream",
      "Cache-Control": cache,
      ...HEADERS_SEG,
    });
    res.end(corpo);
  });
}

// ---------- Métricas de uso (leve, em memória + histórico no bd) ----------
const _metricas = { bootEm: Date.now(), reqTotal: 0, ultimoReq: 0, ativoSeg: 0, mes: new Date().toISOString().slice(0, 7) };
function registrarMetrica() {
  const agora = Date.now();
  const mesAtual = new Date().toISOString().slice(0, 7);
  if (_metricas.mes !== mesAtual) { _metricas.mes = mesAtual; _metricas.ativoSeg = 0; }
  // soma "tempo de máquina ativa" só quando as requisições estão próximas (a VM dorme quando ociosa)
  if (_metricas.ultimoReq && agora - _metricas.ultimoReq < 300000) _metricas.ativoSeg += (agora - _metricas.ultimoReq) / 1000;
  _metricas.ultimoReq = agora;
  _metricas.reqTotal++;
  const hoje = diaHoje();
  bd.metricas = bd.metricas || { porDia: {} };
  const d = bd.metricas.porDia[hoje] || { req: 0, ativos: 0 };
  d.req++;
  bd.metricas.porDia[hoje] = d;
  // mantém só os últimos ~90 dias
  const dias = Object.keys(bd.metricas.porDia).sort();
  if (dias.length > 95) for (const k of dias.slice(0, dias.length - 90)) delete bd.metricas.porDia[k];
}

// ---------- Painel de admin (API protegida por ADMIN_TOKEN) ----------
const CUSTO_MAQUINA_HORA = Number(process.env.CUSTO_MAQUINA_HORA) || 0.00266; // ~$1.94/mês 24/7 (shared-cpu-1x 256MB)
const CUSTO_VOLUME_MES = Number(process.env.CUSTO_VOLUME_MES) || 0.15; // volume ~1GB
function adminAtivo() { return typeof process.env.ADMIN_TOKEN === "string" && process.env.ADMIN_TOKEN.length >= 16; }
function adminAutorizado(req) {
  if (!adminAtivo()) return false;
  const a = Buffer.from(String(req.headers["x-admin-token"] || ""));
  const b = Buffer.from(process.env.ADMIN_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function registrarLogAdmin(acao, detalhe, ip) {
  bd.adminLog = bd.adminLog || [];
  bd.adminLog.push({ quando: new Date().toISOString(), acao, detalhe: detalhe || "", ip: ip || "" });
  if (bd.adminLog.length > 500) bd.adminLog = bd.adminLog.slice(-500);
}
function eventosAtivos() {
  const agora = Date.now();
  return (bd.eventos || []).filter((e) => (!e.inicio || e.inicio <= agora) && (!e.fim || e.fim >= agora));
}

async function tratarAdmin(req, res, rota) {
  if (!adminAtivo()) return responderJson(res, 503, { erro: "Painel admin desativado: defina o segredo ADMIN_TOKEN no servidor." });
  if (!dentroDoLimite("admin:" + ipDe(req), 120, 60000)) return responderJson(res, 429, { erro: "Muitas requisições admin. Calma." });
  if (!adminAutorizado(req)) return responderJson(res, 403, { erro: "Token de admin inválido." });
  const sub = rota.slice("/api/admin/".length);
  const corpo = (req.method === "POST" || req.method === "DELETE") ? await lerCorpo(req).catch(() => ({})) : {};
  const ip = ipDe(req);
  const achaUsuario = (n) => bd.usuarios[String(n || "").trim()];

  // ----- Dashboard / resumo -----
  if (sub === "resumo" && req.method === "GET") {
    const agora = Date.now();
    const dia = 86400000;
    const usuarios = Object.values(bd.usuarios);
    const ativo = (ms) => usuarios.filter((u) => u.ultimoAcesso && agora - u.ultimoAcesso < ms).length;
    const porDia = bd.metricas && bd.metricas.porDia ? bd.metricas.porDia : {};
    const dias = Object.keys(porDia).sort().slice(-30);
    const reqMedia = dias.length ? Math.round(dias.reduce((s, d) => s + (porDia[d].req || 0), 0) / dias.length) : 0;
    const horasAtivas = _metricas.ativoSeg / 3600;
    const custoMaquina = horasAtivas * CUSTO_MAQUINA_HORA;
    const custoEstimado = Math.round((custoMaquina + CUSTO_VOLUME_MES) * 100) / 100;
    const proPagantes = usuarios.filter((u) => { const l = licencaPublica(u); return l.pro; }).length;
    return responderJson(res, 200, {
      usuarios: usuarios.length,
      ativos24h: ativo(dia), ativos7d: ativo(7 * dia), ativos30d: ativo(30 * dia),
      pro: proPagantes, turmas: Object.keys(bd.salas || {}).length,
      alertas: (bd.alertas || []).length, eventosAtivos: eventosAtivos().length,
      uptimeMin: Math.round((agora - _metricas.bootEm) / 60000),
      reqDesdeBoot: _metricas.reqTotal, reqMediaDia: reqMedia,
      reqPorDia: dias.map((d) => ({ dia: d, req: porDia[d].req || 0 })),
      custo: { mes: _metricas.mes, horasAtivasEstim: Math.round(horasAtivas * 10) / 10, estimativaUSD: custoEstimado, nota: "Estimativa — a fatura real do Fly é a que vale." },
    });
  }

  // ----- Usuários -----
  if (sub === "usuarios" && req.method === "GET") {
    const busca = (new URL(req.url, "http://x").searchParams.get("busca") || "").toLowerCase();
    const lista = Object.entries(bd.usuarios)
      .filter(([n, u]) => !busca || n.toLowerCase().includes(busca) || (u.email || "").toLowerCase().includes(busca))
      .map(([n, u]) => ({
        usuario: n, xp: u.xp || 0, melhorStreak: u.melhorStreak || 0,
        email: u.email || null, emailVerificado: !!u.emailVerificado, google: !!u.google,
        twofa: !!u.twofa, banido: !!u.banido, licenca: licencaPublica(u),
        criadoEm: u.criadoEm || null, ultimoAcesso: u.ultimoAcesso || null,
      }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 500);
    return responderJson(res, 200, { usuarios: lista, total: Object.keys(bd.usuarios).length });
  }
  if (sub === "usuario/xp" && req.method === "POST") {
    const u = achaUsuario(corpo.usuario); if (!u) return responderJson(res, 404, { erro: "Usuário não encontrado." });
    if (corpo.xp !== undefined) u.xp = intLimitado(corpo.xp, TETO_XP);
    if (corpo.melhorStreak !== undefined) u.melhorStreak = intLimitado(corpo.melhorStreak, TETO_STREAK);
    registrarLogAdmin("xp", `${corpo.usuario} → xp=${u.xp}, streak=${u.melhorStreak}`, ip); salvarBd();
    return responderJson(res, 200, { ok: true, xp: u.xp, melhorStreak: u.melhorStreak });
  }
  if (sub === "usuario/resetxp" && req.method === "POST") {
    const u = achaUsuario(corpo.usuario); if (!u) return responderJson(res, 404, { erro: "Usuário não encontrado." });
    u.xp = 0; u.melhorStreak = 0;
    if (u.progresso) { u.progresso.streak = 0; u.progresso.concluidos = {}; u.progresso.revelados = {}; u.progresso.missoesConsole = {}; }
    delete u.xpDia;
    registrarLogAdmin("resetxp", String(corpo.usuario), ip); salvarBd();
    return responderJson(res, 200, { ok: true });
  }
  if (sub === "usuario/licenca" && req.method === "POST") {
    const u = achaUsuario(corpo.usuario); if (!u) return responderJson(res, 404, { erro: "Usuário não encontrado." });
    const tier = String(corpo.tier || "");
    if (!["mensal", "semestral", "anual", "vitalicio", "escola", "free"].includes(tier)) return responderJson(res, 400, { erro: "Tier inválido." });
    if (tier === "free") { delete u.licenca; }
    else concederLicenca(u, tier, { dias: corpo.dias ? parseInt(corpo.dias, 10) : null, escola: tier === "escola" || !!corpo.escola, por: "admin" });
    registrarLogAdmin("licenca", `${corpo.usuario} → ${tier}`, ip); salvarBd();
    return responderJson(res, 200, { ok: true, licenca: licencaPublica(u) });
  }
  if (sub === "usuario/senha" && req.method === "POST") {
    const u = achaUsuario(corpo.usuario); if (!u) return responderJson(res, 404, { erro: "Usuário não encontrado." });
    const token = crypto.randomBytes(24).toString("hex");
    bd.resets = bd.resets || {};
    bd.resets[token] = { usuario: corpo.usuario, expira: Date.now() + 3600000 };
    registrarLogAdmin("reset-senha", String(corpo.usuario), ip); salvarBd();
    const base = process.env.URL_BASE || "https://aws-cli-quest.fly.dev";
    const link = `${base}/?reset=${token}`;
    if (u.email) enviarEmail(u.email, "Redefinir sua senha — CLImb", `<p>Um administrador gerou um link pra redefinir sua senha (vale 1h):</p><p><a href="${link}">${link}</a></p>`);
    return responderJson(res, 200, { ok: true, link, enviadoPara: u.email || null });
  }
  if (sub === "usuario/verificar-email" && req.method === "POST") {
    const u = achaUsuario(corpo.usuario); if (!u) return responderJson(res, 404, { erro: "Usuário não encontrado." });
    if (!u.email) return responderJson(res, 400, { erro: "Esse usuário não tem e-mail." });
    u.emailVerificado = true; registrarLogAdmin("verificar-email", String(corpo.usuario), ip); salvarBd();
    return responderJson(res, 200, { ok: true });
  }
  if (sub === "usuario/banir" && req.method === "POST") {
    const u = achaUsuario(corpo.usuario); if (!u) return responderJson(res, 404, { erro: "Usuário não encontrado." });
    u.banido = !!corpo.banir; u.banidoMotivo = corpo.banir ? String(corpo.motivo || "") : "";
    registrarLogAdmin(corpo.banir ? "banir" : "desbanir", String(corpo.usuario), ip); salvarBd();
    return responderJson(res, 200, { ok: true, banido: u.banido });
  }
  if (sub === "usuario/apagar" && req.method === "POST") {
    const nomeU = String(corpo.usuario || "").trim();
    if (!bd.usuarios[nomeU]) return responderJson(res, 404, { erro: "Usuário não encontrado." });
    delete bd.usuarios[nomeU];
    for (const t of Object.keys(bd.sessoes)) if (bd.sessoes[t].usuario === nomeU) delete bd.sessoes[t];
    for (const s of Object.values(bd.salas || {})) s.membros = s.membros.filter((m) => m !== nomeU);
    registrarLogAdmin("apagar-usuario", nomeU, ip); salvarBd();
    return responderJson(res, 200, { ok: true });
  }

  // ----- Códigos de ativação -----
  if (sub === "codigos" && req.method === "GET") {
    const lista = Object.entries(bd.codigos || {}).map(([c, x]) => ({ codigo: c, tier: x.tier, dias: x.dias || null, escola: !!x.escola, usadoPor: x.usadoPor || null, criadoEm: x.criadoEm || null }));
    return responderJson(res, 200, { codigos: lista });
  }
  if (sub === "codigo" && req.method === "POST") {
    const tier = String(corpo.tier || "");
    if (!["mensal", "semestral", "anual", "vitalicio", "escola"].includes(tier)) return responderJson(res, 400, { erro: "Tier inválido." });
    const n = Math.max(1, Math.min(100, parseInt(corpo.qtd, 10) || 1));
    const gerados = [];
    bd.codigos = bd.codigos || {};
    for (let i = 0; i < n; i++) {
      const cod = "CLIMB-" + crypto.randomBytes(4).toString("hex").toUpperCase();
      bd.codigos[cod] = { tier, dias: corpo.dias ? parseInt(corpo.dias, 10) : (DIAS[tier] || null), escola: tier === "escola" || !!corpo.escola, criadoEm: Date.now(), usadoPor: null };
      gerados.push(cod);
    }
    registrarLogAdmin("gerar-codigo", `${n}× ${tier}`, ip); salvarBd();
    return responderJson(res, 201, { gerados });
  }

  // ----- Eventos / avisos -----
  if (sub === "eventos" && req.method === "GET") return responderJson(res, 200, { eventos: bd.eventos || [] });
  if (sub === "evento" && req.method === "POST") {
    const titulo = String(corpo.titulo || "").trim().slice(0, 80);
    if (!titulo) return responderJson(res, 400, { erro: "Dê um título ao evento." });
    const ev = {
      id: "ev-" + crypto.randomBytes(4).toString("hex"),
      titulo, mensagem: String(corpo.mensagem || "").slice(0, 500),
      tipo: corpo.tipo === "competicao" ? "competicao" : "aviso",
      inicio: corpo.inicio ? Number(corpo.inicio) : null, fim: corpo.fim ? Number(corpo.fim) : null,
      criadoEm: Date.now(),
    };
    bd.eventos = bd.eventos || []; bd.eventos.push(ev);
    registrarLogAdmin("criar-evento", titulo, ip); salvarBd();
    return responderJson(res, 201, { evento: ev });
  }
  if (sub === "evento/apagar" && req.method === "POST") {
    bd.eventos = (bd.eventos || []).filter((e) => e.id !== corpo.id);
    registrarLogAdmin("apagar-evento", String(corpo.id), ip); salvarBd();
    return responderJson(res, 200, { ok: true });
  }

  // ----- Alertas antifraude -----
  if (sub === "alertas" && req.method === "GET") return responderJson(res, 200, { alertas: (bd.alertas || []).slice(-200).reverse() });
  if (sub === "alertas/limpar" && req.method === "POST") { bd.alertas = []; registrarLogAdmin("limpar-alertas", "", ip); salvarBd(); return responderJson(res, 200, { ok: true }); }

  // ----- Turmas (moderação) -----
  if (sub === "salas" && req.method === "GET") {
    const lista = Object.values(bd.salas || {}).map((s) => ({ codigo: s.codigo, nome: s.nome, dono: s.dono, membros: s.membros.length, criadoEm: s.criadoEm }));
    return responderJson(res, 200, { salas: lista });
  }
  if (sub === "sala/apagar" && req.method === "POST") {
    if (bd.salas) delete bd.salas[String(corpo.codigo || "").toUpperCase()];
    registrarLogAdmin("apagar-sala", String(corpo.codigo), ip); salvarBd();
    return responderJson(res, 200, { ok: true });
  }

  // ----- Log de auditoria + backup -----
  if (sub === "log" && req.method === "GET") return responderJson(res, 200, { log: (bd.adminLog || []).slice(-200).reverse() });
  if (sub === "backup" && req.method === "GET") { registrarLogAdmin("backup", "", ip); return responderJson(res, 200, bd); }

  return responderJson(res, 404, { erro: "Rota de admin não encontrada: " + sub });
}

// ---------- Servidor ----------
carregarBd();
limparExpirados();
setInterval(limparExpirados, 3600000).unref(); // limpa sessões/rate-limit de hora em hora
http
  .createServer(async (req, res) => {
    const rota = decodeURIComponent(req.url.split("?")[0]);
    try {
      registrarMetrica();
      if (rota === "/api/saude") return responderJson(res, 200, { ok: true });
      if (rota === "/api/eventos" && req.method === "GET") return responderJson(res, 200, { eventos: eventosAtivos().map((e) => ({ id: e.id, titulo: e.titulo, mensagem: e.mensagem, tipo: e.tipo, fim: e.fim })) });
      if (rota.startsWith("/api/admin/")) return await tratarAdmin(req, res, rota);
      if (rota.startsWith("/api/")) return await tratarApi(req, res, rota);
      servirEstatico(req, res, rota);
    } catch (e) {
      responderJson(res, 400, { erro: e.message || "erro" });
    }
  })
  .listen(PORTA, () => console.log(`CLImb no ar: http://localhost:${PORTA}`));
