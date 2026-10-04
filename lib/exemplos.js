"use strict";
// ============================================================
// CLImb — lib/exemplos.js
// Lê lib/exemplos-comandos.json (gerado por scripts/gerar-exemplos.js): a saída
// real de cada comando no simulador e o erro de uso dele. Vai pras páginas de
// comando em /aprender/<servico>/<sub>.
//
// A assinatura é um hash das soluções das atividades + lista de manuais. O
// gerador grava a de quando rodou; o servidor recalcula no boot e AVISA no log
// quando não bate (alguém mexeu em atividade e não regenerou). As páginas
// continuam no ar com o exemplo velho — a saída de um comando quase nunca muda.
// ============================================================
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function assinaturaConteudo(desafios, manuais) {
  const sol = (desafios || []).filter((d) => d.tipo !== "projeto")
    .map((d) => [d.id, (d.solucao || []).map(String)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return crypto.createHash("sha1")
    .update(JSON.stringify(sol) + JSON.stringify(Object.keys(manuais || {}).sort()))
    .digest("hex").slice(0, 16);
}

function carregar(raiz, conteudo, log) {
  log = log || console.log;
  let doc;
  try { doc = JSON.parse(fs.readFileSync(path.join(raiz, "lib", "exemplos-comandos.json"), "utf8")); }
  catch (e) { log("Exemplos de comandos: arquivo ausente — rode node scripts/gerar-exemplos.js"); return {}; }
  if (conteudo && doc.assinatura !== assinaturaConteudo(conteudo.desafios, conteudo.manuais)) {
    log("ATENÇÃO: lib/exemplos-comandos.json está velho (atividades ou manuais mudaram). Rode node scripts/gerar-exemplos.js");
  }
  return doc.comandos || {};
}

module.exports = { assinaturaConteudo, carregar };
