"use strict";
// ============================================================
// AWS CLI Quest — scripts/admin.js
// Utilitário de manutenção do banco (quest-dados.json no volume do Fly).
// Rodar NO SERVIDOR via:  flyctl ssh console -a aws-cli-quest -C "node /app/scripts/admin.js <comando>"
//
//   listar                              lista as contas (sem expor senha)
//   streak <usuario> <atual> [<melhor>] ajusta a sequência de um usuário
//
// Toda escrita grava um backup quest-dados.json.bak.<timestamp> antes.
// NUNCA imprime hash/salt de senha.
// ============================================================

const fs = require("fs");
const path = require("path");

const ARQ = path.join(process.env.DADOS_DIR || "/dados", "quest-dados.json");

function carregar() {
  return JSON.parse(fs.readFileSync(ARQ, "utf8"));
}
function salvar(d) {
  fs.writeFileSync(ARQ + ".bak." + Date.now(), JSON.stringify(d));
  fs.writeFileSync(ARQ, JSON.stringify(d));
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "listar") {
  const d = carregar();
  const linhas = Object.entries(d.usuarios || {})
    .map(([u, x]) => ({
      usuario: u,
      xp: x.xp || 0,
      melhorStreak: x.melhorStreak || 0,
      sequenciaAtual: (x.progresso && x.progresso.streak) || 0,
      ultimasPerdidas: ((x.progresso && x.progresso.sequenciasPerdidas) || []).join(", "),
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
  const u = (d.usuarios || {})[usuario];
  if (!u) {
    console.error("Usuário não encontrado: '" + usuario + "'. Rode 'listar' pra ver os nomes exatos.");
    process.exit(1);
  }
  u.progresso = u.progresso || {};
  const nAtual = parseInt(atual, 10);
  u.progresso.streak = nAtual;
  u.melhorStreak = melhor !== undefined ? parseInt(melhor, 10) : Math.max(u.melhorStreak || 0, nAtual);
  salvar(d);
  console.log("OK: " + usuario + " → sequência atual=" + u.progresso.streak + ", recorde=" + u.melhorStreak);
  console.log("(backup salvo ao lado do arquivo. O usuário vê ao recarregar/relogar.)");
} else {
  console.log("Comandos:");
  console.log("  node /app/scripts/admin.js listar");
  console.log("  node /app/scripts/admin.js streak <usuario> <atual> [<melhor>]");
}
