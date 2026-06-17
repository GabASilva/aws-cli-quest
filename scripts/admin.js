"use strict";
// ============================================================
// AWS CLI Quest — scripts/admin.js
// Utilitário de manutenção do banco (quest-dados.json no volume do Fly).
// Rodar NO SERVIDOR:  flyctl ssh console -a aws-cli-quest -C "node /app/scripts/admin.js <cmd>"
//
//   listar                                  lista as contas (sem expor senha)
//   streak <usuario> <atual> [<melhor>]     ajusta a sequência de um usuário
//   licenca <usuario> <tier> [dias]         concede licença direto (colega, vitalício, escola)
//   codigo <tier> [qtd] [dias] [escola]     gera código(s) de ativação pra resgatar no app
//   codigos                                 lista os códigos gerados
//
// tiers: mensal | semestral | anual | vitalicio | escola
// Toda escrita grava um backup quest-dados.json.bak.<timestamp> antes.
// ============================================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ARQ = path.join(process.env.DADOS_DIR || "/dados", "quest-dados.json");
const DIAS = { mensal: 30, semestral: 182, anual: 365, escola: 365 };
const TIERS = ["mensal", "semestral", "anual", "vitalicio", "escola"];

function carregar() {
  const d = JSON.parse(fs.readFileSync(ARQ, "utf8"));
  d.usuarios = d.usuarios || {};
  d.codigos = d.codigos || {};
  return d;
}
function salvar(d) {
  fs.writeFileSync(ARQ + ".bak." + Date.now(), JSON.stringify(d));
  fs.writeFileSync(ARQ, JSON.stringify(d));
}
function conceder(u, tier, dias, escola, por) {
  const agora = Date.now();
  let expiraEm = null;
  if (tier !== "vitalicio") {
    const d = dias || DIAS[tier] || 30;
    const base = u.licenca && u.licenca.expiraEm && u.licenca.expiraEm > agora ? u.licenca.expiraEm : agora;
    expiraEm = base + d * 86400000;
  }
  u.licenca = { tier, expiraEm, emitidaPor: por || "admin", escola: !!escola, desde: agora };
}
function rotuloLicenca(u) {
  const l = u.licenca;
  if (!l) return "free";
  if (l.tier === "vitalicio") return "vitalicio" + (l.escola ? " (escola)" : "");
  if (l.expiraEm && Date.now() > l.expiraEm) return "free (expirou)";
  const ate = l.expiraEm ? " até " + new Date(l.expiraEm).toISOString().slice(0, 10) : "";
  return l.tier + (l.escola ? " (escola)" : "") + ate;
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "listar") {
  const d = carregar();
  const linhas = Object.entries(d.usuarios)
    .map(([u, x]) => ({
      usuario: u,
      xp: x.xp || 0,
      melhorStreak: x.melhorStreak || 0,
      sequenciaAtual: (x.progresso && x.progresso.streak) || 0,
      licenca: rotuloLicenca(x),
      criadoEm: x.criadoEm ? new Date(x.criadoEm).toISOString().slice(0, 10) : "",
    }))
    .sort((a, b) => b.xp - a.xp);
  console.table(linhas);
  console.log("Total: " + linhas.length + " conta(s).");
} else if (cmd === "streak") {
  const [usuario, atual, melhor] = args;
  if (!usuario || atual === undefined) {
    console.error("uso: node /app/scripts/admin.js streak <usuario> <atual> [<melhor>]");
    process.exit(1);
  }
  const d = carregar();
  const u = d.usuarios[usuario];
  if (!u) { console.error("Usuário não encontrado: '" + usuario + "'."); process.exit(1); }
  u.progresso = u.progresso || {};
  const n = parseInt(atual, 10);
  u.progresso.streak = n;
  u.melhorStreak = melhor !== undefined ? parseInt(melhor, 10) : Math.max(u.melhorStreak || 0, n);
  salvar(d);
  console.log("OK: " + usuario + " → sequência=" + u.progresso.streak + ", recorde=" + u.melhorStreak);
} else if (cmd === "licenca") {
  const [usuario, tier, dias] = args;
  if (!usuario || !TIERS.includes(tier)) {
    console.error("uso: node /app/scripts/admin.js licenca <usuario> <" + TIERS.join("|") + "> [dias]");
    process.exit(1);
  }
  const d = carregar();
  const u = d.usuarios[usuario];
  if (!u) { console.error("Usuário não encontrado: '" + usuario + "'."); process.exit(1); }
  conceder(u, tier, dias ? parseInt(dias, 10) : null, tier === "escola", "admin");
  salvar(d);
  console.log("OK: " + usuario + " → " + rotuloLicenca(u));
} else if (cmd === "codigo") {
  const [tier, qtd, dias, escola] = args;
  if (!TIERS.includes(tier)) {
    console.error("uso: node /app/scripts/admin.js codigo <" + TIERS.join("|") + "> [qtd] [dias] [escola]");
    process.exit(1);
  }
  const d = carregar();
  const n = parseInt(qtd || "1", 10);
  const gerados = [];
  for (let i = 0; i < n; i++) {
    const cod = "QUEST-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    d.codigos[cod] = {
      tier,
      dias: dias ? parseInt(dias, 10) : DIAS[tier] || null,
      escola: escola === "escola" || tier === "escola",
      criadoEm: Date.now(),
      usadoPor: null,
    };
    gerados.push(cod);
  }
  salvar(d);
  console.log("Gerado(s) " + n + " código(s) de '" + tier + "':");
  gerados.forEach((c) => console.log("  " + c));
} else if (cmd === "codigos") {
  const d = carregar();
  const linhas = Object.entries(d.codigos).map(([c, x]) => ({
    codigo: c, tier: x.tier, dias: x.dias || "—", escola: !!x.escola,
    usadoPor: x.usadoPor || "(livre)",
  }));
  console.table(linhas);
  console.log("Total: " + linhas.length + " código(s).");
} else {
  console.log("Comandos: listar | streak | licenca | codigo | codigos");
  console.log("  node /app/scripts/admin.js listar");
  console.log("  node /app/scripts/admin.js streak <usuario> <atual> [<melhor>]");
  console.log("  node /app/scripts/admin.js licenca <usuario> <mensal|semestral|anual|vitalicio|escola> [dias]");
  console.log("  node /app/scripts/admin.js codigo <tier> [qtd] [dias] [escola]");
  console.log("  node /app/scripts/admin.js codigos");
}
