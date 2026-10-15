"use strict";
// ============================================================
// Teste dos idiomas: node teste/idiomas.js
// A regra (CLAUDE.md): todo texto que o app mostra existe em português,
// inglês e espanhol. Este teste é a regra:
//
//   1. todo literal em português de js/, index.html e das mensagens da API
//      tem tradução nos DOIS dicionários (i18n/en.json e i18n/es.json);
//   2. a tradução preserva as expressões ${n} e o <code> (comando não se
//      traduz);
//   3. cada js/ traduzido continua sendo JavaScript válido;
//   4. o conteúdo traduzido carrega (atividades e simulado);
//   5. o fumaça roda verde sobre o código traduzido nos dois idiomas — é o
//      que pega tradução que quebrou um validador.
//
// SEM_FUMACA=1 pula o passo 5 (é o mais lento).
// ============================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");
const i18n = require("../lib/i18n.js");
const ferramenta = require("../scripts/i18n.js");
const conteudoApp = require("../lib/conteudo-app.js");
const pagSimulado = require("../lib/pagina-simulado.js");

const RAIZ = path.join(__dirname, "..");
let falhas = 0;
const falhar = (msg) => { falhas++; console.log("✗ " + msg); };

const dic = { en: ferramenta.lerDic("en"), es: ferramenta.lerDic("es") };

// 1. cobertura
const cat = ferramenta.catalogo();
const faltam = {};
let talvez = 0;
for (const it of cat.values()) {
  const tem = dic.en[it.chave] != null && dic.es[it.chave] != null;
  if (tem) continue;
  if (it.certeza === "talvez") talvez++;
  (faltam[it.arquivo] = faltam[it.arquivo] || []).push(it);
}
const nFaltam = Object.values(faltam).reduce((a, l) => a + l.length, 0);
if (nFaltam) {
  falhar(`${nFaltam} textos em português sem tradução em inglês e espanhol:`);
  for (const [arq, l] of Object.entries(faltam).sort((a, b) => b[1].length - a[1].length).slice(0, 15)) {
    console.log(`    ${arq}: ${l.length}  (ex.: "${l[0].chave.replace(/\s+/g, " ").slice(0, 70)}")`);
  }
  console.log("  Rode `node scripts/i18n.js pendentes <arquivo>` e `aplicar` (ver o topo do script).");
} else {
  console.log(`✓ ${cat.size} textos com as três versões`);
}
if (talvez) console.log(`  (${talvez} deles são rótulos que podem ser inglês do Console: decida com "@@ <id> =", que mantém igual)`);

// 2. integridade das traduções
let quebradas = 0;
for (const idioma of ["en", "es"]) {
  for (const [k, v] of Object.entries(dic[idioma])) {
    const p = ferramenta.problemas(k, v).filter((x) => !/tags/.test(x));
    if (p.length) {
      quebradas++;
      if (quebradas <= 10) falhar(`${idioma}: "${k.replace(/\s+/g, " ").slice(0, 60)}" → ${p.join("; ")}`);
    }
  }
}
if (!quebradas) console.log("✓ traduções preservam ${n} e <code>");

// 3. sintaxe de todo js/ traduzido
const arquivos = fs.readdirSync(path.join(RAIZ, "js")).filter((f) => f.endsWith(".js"));
let sintaxe = 0;
for (const idioma of ["en", "es"]) {
  const d = i18n.dicionario(idioma);
  for (const f of arquivos) {
    const t = i18n.traduzirTexto(fs.readFileSync(path.join(RAIZ, "js", f), "utf8"), d);
    try { new vm.Script(t, { filename: idioma + "/" + f }); }
    catch (e) { sintaxe++; falhar(`${idioma}/${f} não compila depois de traduzido: ${e.message}`); }
  }
}
if (!sintaxe) console.log(`✓ ${arquivos.length * 2} arquivos traduzidos compilam`);

// 4. conteúdo traduzido carrega
for (const idioma of ["en", "es"]) {
  const d = i18n.dicionario(idioma);
  try {
    const textos = {};
    for (const f of conteudoApp.ARQUIVOS) textos[f] = i18n.traduzirTexto(fs.readFileSync(path.join(RAIZ, "js", f), "utf8"), d);
    const c = conteudoApp.carregarDeTextos(textos);
    const s = pagSimulado.carregarSimulados(RAIZ, (t) => i18n.traduzirTexto(t, d));
    console.log(`✓ ${idioma}: ${c.desafios.length} atividades e ${s.questoes.length} questões carregam`);
  } catch (e) { falhar(`${idioma}: conteúdo traduzido não carrega: ${e.message}`); }
}

// 5. fumaça no código traduzido
if (!process.env.SEM_FUMACA) {
  for (const idioma of ["en", "es"]) {
    try {
      const saida = execFileSync(process.execPath, [path.join(__dirname, "fumaca.js")], {
        env: { ...process.env, IDIOMA: idioma }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
      });
      console.log(`✓ fumaça em ${idioma}: ${(saida.trim().split("\n").pop() || "").slice(0, 80)}`);
    } catch (e) {
      const linhas = String(e.stdout || "").split("\n").filter((l) => /✗|FALH|falhou/i.test(l)).slice(0, 10);
      falhar(`fumaça em ${idioma} falhou:\n    ` + linhas.join("\n    "));
    }
  }
}

if (falhas) { console.log(`\n${falhas} problema(s).`); process.exit(1); }
console.log("\nTudo certo nos três idiomas.");
