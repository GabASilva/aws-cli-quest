"use strict";
// ============================================================
// CLImb — teste/cobertura-cli.js
// Mede quanto do AWS CLI DE VERDADE o simulador já cobre, e escreve o plano no
// vault do Obsidian (uma página por serviço, com caixinha por comando).
//
// POR QUE EXISTE: a partir de 21/09/2026 o CLImb passou a mirar o CLI inteiro,
// não só o recorte do CLF-C02. Marcar progresso à mão numa lista de 4.513
// comandos daria errado no terceiro dia — então o progresso é LIDO do próprio
// simulador e as páginas são regeradas. O que está marcado está implementado.
//
// USO
//     node teste/cobertura-cli.js                     # só o resumo no terminal
//     node teste/cobertura-cli.js <pasta-do-vault>    # regera as páginas
//     node teste/cobertura-cli.js <pasta> --extrair   # relê a CLI instalada
//
// A lista de comandos reais vive em teste/dados/cli-real.txt, extraída do
// `aws <servico> help` da CLI instalada (2.35.8). Com --extrair ela é refeita,
// o que só funciona onde o AWS CLI estiver instalado.
// ============================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");

const RAIZ = path.resolve(__dirname, "..");
const DADOS = path.join(__dirname, "dados", "cli-real.txt");
const ARQUIVOS = require(path.join(RAIZ, "lib", "conteudo-app.js")).ARQUIVOS;

// ---------- 1. o que a CLI de verdade tem ----------
function extrairDaCliInstalada(servicos) {
  const fora = [];
  for (const s of servicos) {
    let saida = "";
    try {
      saida = execSync("aws " + s + " help", {
        encoding: "utf8", env: Object.assign({}, process.env, { AWS_PAGER: "" }),
        stdio: ["ignore", "pipe", "ignore"], maxBuffer: 20 * 1024 * 1024,
      });
    } catch (e) { saida = ""; }
    const i = saida.indexOf("\nAvailable Commands");
    const bloco = i < 0 ? "" : saida.slice(i);
    const cmds = bloco.split(/\r?\n/)
      .map((l) => l.replace(/^[*o+\s]+/, "").trim())
      .filter((l) => /^[a-z][a-z0-9-]+$/.test(l) && l !== "help");
    fora.push(s + "|" + [...new Set(cmds)].sort().join(" "));
  }
  fs.writeFileSync(DADOS, fora.join("\n") + "\n", "utf8");
}

function lerReais() {
  const real = {};
  for (const linha of fs.readFileSync(DADOS, "utf8").split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const [s, cmds] = linha.split("|");
    real[s] = (cmds || "").trim().split(/\s+/).filter(Boolean).sort();
  }
  return real;
}

// ---------- 2. o que o simulador tem ----------
// Mesma técnica do lib/conteudo-app.js: roda os arquivos do app num contexto
// isolado com stubs de DOM, e lê o SERVICOS que sobrou.
function lerSimulador() {
  const elemento = () => ({
    style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, insertBefore() {}, remove() {}, setAttribute() {},
    addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  });
  const caixa = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    requestAnimationFrame() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      addEventListener() {}, removeEventListener() {}, querySelector() { return null; },
      querySelectorAll() { return []; }, getElementById() { return null; },
      createElement: elemento, head: elemento(), body: elemento(),
      readyState: "complete", scripts: [],
    },
    imprimir() {}, imprimirComando() {}, rolarTerminal() {}, salvarJogo() {},
    verificarDesafios() {}, toast() {}, atualizarTudo() {},
    ui: { historicoCmd: [], posHistorico: 0 },
    jogo: { conta: null, concluidos: {} },
  };
  caixa.window = caixa;
  caixa.globalThis = caixa;
  const codigo = ARQUIVOS.map((f) => fs.readFileSync(path.join(RAIZ, "js", f), "utf8")).join("\n");
  vm.createContext(caixa);
  vm.runInContext(
    codigo + "\n;globalThis.__servicos = typeof SERVICOS !== 'undefined' ? SERVICOS : null;",
    caixa, { timeout: 20000, filename: "cobertura-sandbox.js" }
  );
  if (!caixa.__servicos) throw new Error("SERVICOS não veio do sandbox");
  const fora = {};
  for (const [s, ops] of Object.entries(caixa.__servicos)) fora[s] = Object.keys(ops).sort();
  return fora;
}

// ---------- 3. a meta de cada serviço ----------
// Cobrir tudo por igual não faz sentido: `aws ec2` tem 769 comandos e a maior
// parte nunca aparece na vida de ninguém. O tamanho decide a ambição.
function metaDe(total) {
  if (total <= 30) return ["completa", "cobrir o servico inteiro"];
  if (total <= 80) return ["nucleo", "cobrir o nucleo, pular o que so aparece em caso raro"];
  return ["seletiva", "cobrir o que um profissional usa; o resto e ruido"];
}

function gerar(vault, real, climb) {
  const dir = path.join(vault, "cobertura-cli");
  fs.mkdirSync(dir, { recursive: true });
  const linhas = [];
  let somaReal = 0, somaFeito = 0;
  for (const s of Object.keys(real).sort()) {
    const todos = real[s];
    const feitos = new Set(climb[s] || []);
    const faltam = todos.filter((c) => !feitos.has(c));
    const extras = [...feitos].filter((c) => !todos.includes(c)).sort();
    const [alvo, explica] = metaDe(todos.length);
    somaReal += todos.length;
    somaFeito += todos.filter((c) => feitos.has(c)).length;
    const pct = Math.round((todos.filter((c) => feitos.has(c)).length / todos.length) * 100);
    linhas.push({ s, total: todos.length, feito: todos.length - faltam.length, falta: faltam.length, pct, alvo });
    const corpo = [
      "---",
      "name: cli-" + s,
      'description: "Cobertura do aws ' + s + " no CLImb — " + (todos.length - faltam.length) + " de " + todos.length + ' comandos reais"',
      "metadata:",
      "  type: project",
      "---",
      "",
      "> Pagina GERADA por `node teste/cobertura-cli.js` — nao edite a mao, o",
      "> que esta marcado e lido do proprio simulador. Indice: [[cobertura-cli]].",
      "",
      "**" + todos.length + " comandos reais · " + (todos.length - faltam.length) + " no CLImb (" + pct + "%) · " + faltam.length + " a fazer**",
      "",
      "Meta deste servico: **" + alvo + "** — " + explica + ".",
      "",
      "Implementar UM comando = handler no simulador + verbete em `MANUAIS` +",
      "linha em `PORQUE` + as atividades (1 que ensina o caso de uso + 1 ou 2 de",
      "fixacao). Modelo pronto: `js/sqs-completo.js`.",
      "",
      "## Ja no CLImb (" + (todos.length - faltam.length) + ")",
      "",
    ];
    for (const c of todos.filter((c) => feitos.has(c))) corpo.push("- [x] `" + c + "`");
    if (todos.length === faltam.length) corpo.push("_(nenhum ainda)_");
    if (extras.length) {
      corpo.push("", "> No CLImb mas fora do `aws " + s + " help`: " + extras.map((e) => "`" + e + "`").join(", ") + ". Confira se e apelido ou erro de nome.");
    }
    corpo.push("", "## A implementar (" + faltam.length + ")", "");
    for (const c of faltam) corpo.push("- [ ] `" + c + "`");
    if (!faltam.length) corpo.push("**Servico fechado.**");
    corpo.push("");
    fs.writeFileSync(path.join(dir, "cli-" + s + ".md"), corpo.join("\n"), "utf8");
  }
  linhas.sort((a, b) => a.falta - b.falta);
  const fechados = linhas.filter((l) => l.falta === 0).length;
  const idx = [
    "---",
    "name: cobertura-cli",
    'description: "PLANO — os ' + somaReal + " comandos reais do AWS CLI, os " + somaFeito + ' ja no CLImb, e o que falta"',
    "metadata:",
    "  type: project",
    "---",
    "",
    "Decisao do Gabriel em **21/09/2026**: o CLImb passa a ensinar o **AWS CLI**",
    "inteiro, nao so o recorte do CLF-C02. Este e o mapa, e e daqui que sai a",
    "proxima leva de trabalho.",
    "",
    "> **Pagina GERADA.** Nao marque nada a mao: rode",
    "> `node teste/cobertura-cli.js \"<pasta deste vault>\"` e o progresso e",
    "> relido do simulador. O que aparece marcado esta implementado de verdade.",
    "",
    "A lista de comandos saiu do `aws <servico> help` da **CLI instalada**",
    "(2.35.8) e mora em `teste/dados/cli-real.txt`.",
    "",
    "## O tamanho do problema",
    "",
    "**" + somaReal + " comandos reais** nos " + linhas.length + " servicos que o CLImb toca, dos quais",
    "**" + somaFeito + " ja existem** (" + Math.round((somaFeito / somaReal) * 100) + "%). Servicos fechados: **" + fechados + "**.",
    "",
    "Cobrir os " + (somaReal - somaFeito) + " restantes por igual nao faz sentido: `aws ec2` sozinho tem 769",
    "comandos. Por isso cada servico tem uma **meta**, pelo tamanho:",
    "",
    "| meta | quando | o que fazer |",
    "|---|---|---|",
    "| **completa** | ate 30 comandos | cobrir o servico inteiro |",
    "| **nucleo** | 31 a 80 | cobrir o nucleo, pular o caso raro |",
    "| **seletiva** | mais de 80 | cobrir o que um profissional usa |",
    "",
    "## Como implementar UM comando",
    "",
    "1. handler no simulador (arquivo proprio do servico, tipo `js/sqs-completo.js`);",
    "2. verbete em `MANUAIS` — **sem isso o fumaca quebra**;",
    "3. linha em `PORQUE` (`js/licoes.js`): por que o comando EXISTE;",
    "4. atividades: 1 que ensina o caso de uso com as flags que andam junto +",
    "   1 ou 2 de fixacao em cenario diferente;",
    "5. `node teste/fumaca.js`, `teste/analise.js` e `teste/gabarito.js` verdes;",
    "6. `node teste/cobertura-cli.js \"<vault>\"` pra atualizar estas paginas.",
    "",
    "## Onde esta cada servico",
    "",
    "Ordenado por quanto falta — os de cima sao os de fechar rapido.",
    "",
    "| servico | reais | no CLImb | falta | % | meta |",
    "|---|---:|---:|---:|---:|---|",
  ];
  for (const l of linhas) {
    idx.push("| [[cli-" + l.s + "|" + l.s + "]] | " + l.total + " | " + l.feito + " | " + l.falta + " | " + l.pct + "% | " + l.alvo + " |");
  }
  idx.push(
    "",
    "> `vpc` e `ebs` nao aparecem: nao sao servicos do CLI, vivem dentro do",
    "> `aws ec2`. `s3` (alto nivel) e `s3api` (baixo nivel) sao dois servicos",
    "> de verdade, e por isso tem uma pagina cada.",
    "",
    "Ver tambem [[mapa-dos-arquivos]] e [[comecar-sem-contexto]].",
    ""
  );
  fs.writeFileSync(path.join(vault, "cobertura-cli.md"), idx.join("\n"), "utf8");
  return { linhas, somaReal, somaFeito, fechados };
}

// ---------- roda ----------
const args = process.argv.slice(2);
const vault = args.find((a) => !a.startsWith("--"));
const real0 = lerReais();
if (args.includes("--extrair")) {
  console.log("relendo a CLI instalada (" + Object.keys(real0).length + " servicos)...");
  extrairDaCliInstalada(Object.keys(real0));
}
const real = lerReais();
const climb = lerSimulador();
const totalReal = Object.values(real).reduce((a, b) => a + b.length, 0);
const totalFeito = Object.entries(real).reduce((a, [s, cs]) => {
  const t = new Set(climb[s] || []);
  return a + cs.filter((c) => t.has(c)).length;
}, 0);

if (!vault) {
  console.log("comandos reais: " + totalReal + " | no CLImb: " + totalFeito +
    " (" + Math.round((totalFeito / totalReal) * 100) + "%) | falta: " + (totalReal - totalFeito));
  console.log("\npasse a pasta do vault pra regerar as paginas:");
  console.log('  node teste/cobertura-cli.js "<pasta-do-vault>"');
  process.exit(0);
}
const r = gerar(vault, real, climb);
console.log("comandos reais: " + r.somaReal + " | no CLImb: " + r.somaFeito +
  " (" + Math.round((r.somaFeito / r.somaReal) * 100) + "%) | falta: " + (r.somaReal - r.somaFeito));
console.log("servicos fechados: " + r.fechados + " de " + r.linhas.length);
console.log("paginas escritas em: " + path.join(vault, "cobertura-cli"));
console.log("\nos proximos a fechar:");
for (const l of r.linhas.filter((x) => x.falta > 0).slice(0, 10)) {
  console.log("  " + l.s.padEnd(18) + " falta " + String(l.falta).padStart(3) + "  de " + String(l.total).padStart(3) + "  (" + l.alvo + ")");
}
