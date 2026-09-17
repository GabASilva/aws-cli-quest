"use strict";
// ============================================================
// CLImb — lib/licenca-servidor.js
// Quem pode ver o quê, decidido NO SERVIDOR. Antes isso existia só no
// js/licenca.js, que roda no navegador de quem está olhando — ou seja, não
// decidia nada: bastava trocar a variável no DevTools.
//
// A REGRA NÃO É COPIADA AQUI. `SERVICOS_GRATIS` e `GRATIS_POR_TRILHA` são lidos
// do próprio js/licenca.js num contexto isolado do `vm`, como o
// lib/paginas-licoes.js já faz com as lições. Se o Gabriel abrir mais uma
// trilha lá, o servidor acompanha sem ninguém lembrar de mexer em dois lugares.
// ============================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let cache = null;

function lerRegra(raiz) {
  if (cache) return cache;
  // Sem `window` no sandbox de propósito: o IIFE do arquivo começa com
  // `if (typeof window === "undefined") return;`, então ele sai na hora e só as
  // constantes do topo são avaliadas. Nada de DOM, nada de efeito colateral.
  const src = fs.readFileSync(path.join(raiz, "js", "licenca.js"), "utf8");
  const caixa = { console: { log() {}, warn() {}, error() {}, info() {} } };
  vm.createContext(caixa);
  vm.runInContext(
    src + `
;globalThis.__r = {
  servicos: typeof SERVICOS_GRATIS !== "undefined" ? SERVICOS_GRATIS : null,
  porTrilha: typeof GRATIS_POR_TRILHA !== "undefined" ? GRATIS_POR_TRILHA : null,
};`,
    caixa,
    { timeout: 5000, filename: "licenca-sandbox.js" }
  );
  const r = caixa.__r || {};
  if (!Array.isArray(r.servicos) || typeof r.porTrilha !== "number") {
    // Falhar alto: cair num padrão aqui abriria ou fecharia conteúdo por engano.
    throw new Error("não consegui ler SERVICOS_GRATIS/GRATIS_POR_TRILHA de js/licenca.js");
  }
  cache = { SERVICOS_GRATIS: r.servicos, GRATIS_POR_TRILHA: r.porTrilha };
  return cache;
}

// Mesmo cálculo do indiceDia() de js/missoes.js: hash da data "AAAA-M-D".
function indiceDoDia(data, tamanho) {
  const s = `${data.getFullYear()}-${data.getMonth() + 1}-${data.getDate()}`;
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % tamanho;
}

// O "Desafio do dia" é grátis pra todo mundo (js/licenca.js), e ele é escolhido
// pela data LOCAL de quem abre o app — que o servidor não conhece. Então
// liberamos os três candidatos possíveis (ontem, hoje, amanhã): cobre qualquer
// fuso e custa três atividades.
function idsDoDesafioDoDia(desafios) {
  const treino = desafios.filter((d) => d.servico === "treino");
  const ids = new Set();
  if (!treino.length) return ids;
  const hoje = new Date();
  for (const deslocamento of [-1, 0, 1]) {
    const d = new Date(hoje.getTime() + deslocamento * 86400000);
    const alvo = treino[indiceDoDia(d, treino.length)];
    if (alvo) ids.add(alvo.id);
  }
  return ids;
}

// Os ids que QUALQUER visitante pode ver com gabarito. Réplica da regra de
// desafioEhGratis() do js/licenca.js: trilha grátis inteira, as N primeiras de
// cada trilha (projeto não conta) e o desafio do dia.
function idsAbertos(desafios, raiz) {
  const { SERVICOS_GRATIS, GRATIS_POR_TRILHA } = lerRegra(raiz || path.join(__dirname, ".."));
  const abertos = new Set();
  const conta = {};
  for (const d of desafios) {
    if (!d) continue;
    if (SERVICOS_GRATIS.includes(d.servico)) { abertos.add(d.id); continue; }
    if (d.tipo === "projeto") continue;
    const n = (conta[d.servico] = (conta[d.servico] || 0) + 1);
    if (n <= GRATIS_POR_TRILHA) abertos.add(d.id);
  }
  for (const id of idsDoDesafioDoDia(desafios)) abertos.add(id);
  return abertos;
}

module.exports = {
  idsAbertos,
  idsDoDesafioDoDia,
  get SERVICOS_GRATIS() { return lerRegra(path.join(__dirname, "..")).SERVICOS_GRATIS; },
  get GRATIS_POR_TRILHA() { return lerRegra(path.join(__dirname, "..")).GRATIS_POR_TRILHA; },
};
