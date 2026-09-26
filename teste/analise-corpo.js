

const problemas = [];
const avisos = [];

// ---------- 1. ids duplicados ----------
const vistos = new Map();
for (const d of DESAFIOS) {
  if (vistos.has(d.id)) problemas.push(`ID DUPLICADO: ${d.id} ("${vistos.get(d.id)}" vs "${d.titulo}")`);
  vistos.set(d.id, d.titulo);
}

// ---------- 2. campos obrigatórios ----------
for (const d of DESAFIOS) {
  if (d.tipo === "projeto") {
    if (!Array.isArray(d.etapas) || !d.etapas.length) problemas.push(`PROJETO SEM ETAPAS: ${d.id}`);
    continue;
  }
  if (!d.titulo) problemas.push(`SEM TITULO: ${d.id}`);
  if (!d.descricao) problemas.push(`SEM DESCRICAO: ${d.id}`);
  if (!Array.isArray(d.dicas) || !d.dicas.length) avisos.push(`sem dicas: ${d.id} (${d.titulo})`);
  if (!Array.isArray(d.solucao) || !d.solucao.length) problemas.push(`SEM SOLUCAO: ${d.id}`);
  if (typeof d.validar !== "function") problemas.push(`SEM VALIDAR: ${d.id}`);
  if (!d.xp || d.xp < 10) avisos.push(`xp estranho (${d.xp}): ${d.id}`);
}

// ---------- 3. ordem por trilha: nível caindo + inventário ----------
const porServico = {};
for (const d of DESAFIOS) {
  (porServico[d.servico] = porServico[d.servico] || []).push(d);
}
const ordemTrilhas = SERVICOS_META.map((m) => m.id);
console.log("=== INVENTÁRIO (ordem da sidebar) ===");
for (const sid of Object.keys(porServico)) {
  const lista = porServico[sid];
  const naSidebar = ordemTrilhas.includes(sid) ? "" : " [FORA DA SIDEBAR/avulso]";
  console.log(`\n--- ${sid}${naSidebar} (${lista.length}) ---`);
  let nivelAnt = 0;
  lista.forEach((d, i) => {
    const cmds = d.tipo === "projeto" ? "(projeto)" : (d.solucao || []).map((s) => {
      const m = s.trim().match(/^aws\s+(\S+)\s+(\S+)/); return m ? m[1] + " " + m[2] : s.trim().split(" ").slice(0, 2).join(" ");
    }).join("; ");
    console.log(`${String(i + 1).padStart(3)}. [n${d.nivel || "?"} ${String(d.xp || "?").padStart(3)}xp] ${d.id} — ${d.titulo}  «${cmds}»`);
    if (d.nivel && d.nivel < nivelAnt - 1) avisos.push(`nível despenca em ${sid}: ${d.id} (n${d.nivel} depois de n${nivelAnt})`);
    if (d.nivel) nivelAnt = Math.max(nivelAnt, d.nivel);
  });
}

// ---------- 4. comandos usados antes de "introduzidos" na trilha ----------
console.log("\n=== PRIMEIRO USO DE CADA COMANDO POR TRILHA ===");
for (const sid of ordemTrilhas) {
  const lista = porServico[sid] || [];
  const visto = new Set();
  const intro = [];
  lista.forEach((d, i) => {
    if (d.tipo === "projeto") return;
    for (const s of d.solucao || []) {
      const m = s.trim().match(/^aws\s+(\S+)\s+(\S+)/);
      const chave = m ? m[1] + " " + m[2] : s.trim().split(" ")[0];
      if (!visto.has(chave)) { visto.add(chave); intro.push(`#${i + 1} ${d.id}: ${chave}`); }
    }
  });
  if (intro.length) console.log(`\n${sid}:\n  ` + intro.join("\n  "));
}

// ---------- 5. AUTO-PASS: validador já satisfeito ANTES de resolver ----------
console.log("\n=== EXECUÇÃO SEQUENCIAL (auto-pass + validadores quebrados) ===");
const conta = criarContaAws();
let ultimoCmd = null;
// Cópia da mesma função do teste/fumaca.js — mexeu num, mexa no outro.
const resolver = (linha) => resolverPlaceholders(conta, linha); // teste/placeholders.js
const autopass = [];
for (const d of DESAFIOS) {
  if (d.tipo === "projeto") continue;
  const ehLab = d.servico === "diagnostico"; // lab: monta o ambiente quebrado
  if (ehLab && typeof montarLabVpc === "function") montarLabVpc(conta);
  // shell (cat/ls/grep) agora roda: linux-lab expoe executarShellPuro, sem DOM
  // A trilha setup NAO entra neste filtro: as linhas dela (ssh/curl/unzip/
  // configure interativo) nao sao do executarShellPuro, sao do setup-lab, e
  // passam pela cadeia logo abaixo. Sem esta excecao, setup-1..4 e setup-6
  // eram descartados aqui e a trilha ficava sem teste nenhum.
  const ehSetup = d.servico === "setup";
  if (!ehLab && !ehSetup && (d.solucao || []).some((s) => {
    const l = s.trim();
    if (l.startsWith("aws")) return false;
    return typeof executarShellPuro !== "function" || !executarShellPuro(criarContaAws(), l);
  })) continue;
  // já satisfeito antes de rodar a solução? (validador de ESTADO ganho de graça)
  let antes = false;
  try { antes = !!d.validar(conta, null, false); } catch (e) { antes = false; }
  if (antes) autopass.push(`${d.id} (${d.servico}) — "${d.titulo}"`);
  for (const sol of d.solucao) {
    const linhaSol = resolver(sol);
    // a trilha setup passa pela CADEIA (setup-lab intercepta ssh/curl/unzip,
    // o 'aws --version' e o configure interativo antes do executor aws)
    if (ehSetup && typeof rodarPelaCadeia === "function") {
      // ATENCAO (regra do CLAUDE.md): 'jogo' e binding lexico (let, jogo.js).
      // O setup-lab le o 'jogo' lexico; a BASE_CADEIA le 'window.jogo'. Como o
      // analise.js carrega jogo.js (o fumaca nao), os dois sao objetos
      // DIFERENTES aqui — apontar so um deixava o estado do lab noutra conta e
      // o validador do setup-5 nunca via 'versao'.
      if (typeof jogo !== "undefined") jogo.conta = conta;
      window.jogo.conta = conta;
      const rr = rodarPelaCadeia(linhaSol);
      if (rr.cmd) ultimoCmd = rr.cmd;
      continue;
    }
    if (!linhaSol.trim().startsWith("aws")) {
      // o lab de diagnostico tem shell proprio e vem primeiro
      if (ehLab && typeof labShell === "function") { labShell(conta, linhaSol); continue; }
      const rsh = typeof executarShellPuro === "function" ? executarShellPuro(conta, linhaSol) : null;
      if (rsh) { ultimoCmd = rsh.cmd; continue; }
      if (typeof labShell === "function") labShell(conta, linhaSol);
      continue;
    }
    const r = executarComandoAws(conta, linhaSol);
    if (r) ultimoCmd = r.cmd;
    if (r && !r.ok && d.id !== "ec2-3") avisos.push(`solução falhou: ${d.id}: ${sol} -> ${String(r.saida).split("\n")[0]}`);
  }
  let depois = false;
  try { depois = !!d.validar(conta, ultimoCmd, true); } catch (e) { problemas.push(`VALIDAR LANÇOU ERRO: ${d.id}: ${e.message}`); }
  if (!depois && !antes) problemas.push(`VALIDADOR NÃO PASSA: ${d.id}`);
}
console.log(`\nAuto-pass (validador de estado já satisfeito por atividade ANTERIOR): ${autopass.length}`);
autopass.forEach((a) => console.log("  ⚠ " + a));

// ---------- 6. XP fora da curva por nível ----------
const xpPorNivel = {};
for (const d of DESAFIOS) { if (d.nivel && d.xp) (xpPorNivel[d.nivel] = xpPorNivel[d.nivel] || []).push(d.xp); }
console.log("\n=== XP POR NÍVEL (min/mediana/max) ===");
for (const [n, xs] of Object.entries(xpPorNivel)) {
  xs.sort((a, b) => a - b);
  console.log(`n${n}: min ${xs[0]} · mediana ${xs[Math.floor(xs.length / 2)]} · max ${xs[xs.length - 1]} (${xs.length} atividades)`);
}
for (const d of DESAFIOS) {
  if (!d.nivel || !d.xp) continue;
  const faixas = { 1: [20, 60], 2: [30, 90], 3: [50, 150], 4: [80, 400] };
  const f = faixas[d.nivel];
  if (f && (d.xp < f[0] || d.xp > f[1])) avisos.push(`xp fora da faixa n${d.nivel} (${d.xp}xp): ${d.id} — ${d.titulo}`);
}

// ---------- DICA QUE ENTREGA A SOLUÇÃO ----------
// Regra do CLAUDE.md: "a dica NÃO pode ser a solução literal". Quando a última
// dica contém o comando inteiro, a atividade deixa de exigir raciocínio — a
// pessoa copia a dica e segue. É o defeito mais fácil de cometer escrevendo
// trilha em série, então ele é medido aqui em vez de depender de memória.
// Também acusa dica[0] repetida palavra por palavra dentro da MESMA trilha:
// dica de molde não ajuda em nada, só preenche o campo.
{
  const normD = (s) => String(s).replace(/\s+/g, " ").replace(/["']/g, "").trim().toLowerCase();
  const primeiras = {};
  for (const d of DESAFIOS) {
    if (!Array.isArray(d.dicas) || !d.dicas.length) continue;
    if (Array.isArray(d.solucao) && d.solucao.length) {
      const ultima = normD(d.dicas[d.dicas.length - 1]);
      const entrega = d.solucao.map(normD).find((s) => s.length > 12 && ultima.includes(s));
      if (entrega) avisos.push(`dica entrega a solução: ${d.id} — a última dica contém "${entrega.slice(0, 60)}"`);
    }
    const k = d.servico + "||" + normD(d.dicas[0]);
    (primeiras[k] = primeiras[k] || []).push(d.id);
  }
  for (const k of Object.keys(primeiras)) {
    if (primeiras[k].length > 1) avisos.push(`dica[0] de molde repetida na trilha ${k.split("||")[0]}: ${primeiras[k].join(", ")}`);
  }
}

// ---------- NIVEIS: cliente (js/jogo.js) x servidor (lib/perfil-publico.js) ----------
// A página pública /u/<usuario> é renderizada no SERVIDOR e mostra o título do
// nível, então a tabela está duplicada lá. Aqui garantimos que não divergiu.
try {
  const nivServidor = require(path.join(raiz, "lib", "perfil-publico.js")).NIVEIS;
  if (JSON.stringify(nivServidor) !== JSON.stringify(NIVEIS)) {
    problemas.push("NIVEIS divergiram entre js/jogo.js e lib/perfil-publico.js — o perfil público mostraria outro título/nível");
    console.log("\n  cliente : " + JSON.stringify(NIVEIS));
    console.log("  servidor: " + JSON.stringify(nivServidor));
  } else {
    console.log(`\n=== NIVEIS sincronizados cliente x servidor: ${NIVEIS.length} níveis ✓ ===`);
  }
} catch (e) {
  problemas.push("não consegui comparar NIVEIS com lib/perfil-publico.js: " + e.message);
}

// ---------- UTF-8 gravado duas vezes ("estÃ¡" no lugar de "está") ----------
// Em 24/09/2026 um perl sem `use utf8` gravou o acento duas vezes em 15 textos
// e passou no node --check, no fumaça e no gabarito. O sinal é inconfundível:
// "Ã" seguido de um caractere da faixa U+0080–U+00BF.
{
  const MOJIBAKE = /Ã[\u0080-¿]/;
  for (const d of DESAFIOS) {
    const txt = [d.titulo, d.descricao].concat(d.dicas || []).join(" ");
    if (MOJIBAKE.test(txt)) problemas.push(`acento gravado duas vezes (mojibake) em ${d.id}: "${(txt.match(/.{0,20}Ã[\u0080-¿].{0,10}/) || [""])[0]}"`);
  }
  for (const [k, v] of Object.entries(typeof MANUAIS !== "undefined" ? MANUAIS : {})) {
    if (MOJIBAKE.test(String(v))) problemas.push(`acento gravado duas vezes (mojibake) no manual ${k}`);
  }
}

// ---------- Âncora perdida: bloco que caiu no fim da trilha ----------
// Os arquivos de atividade inserem com at("id-ancora", [...]); se a âncora
// ainda não existe quando o arquivo carrega, o bloco cai no FIM do DESAFIOS —
// fora de ordem, e sem nenhum erro. Aconteceu de 21 a 24/09/2026 com tudo que
// se ancorava em cob-* (as coberturas carregam depois). Os at() registram a
// perda em __ancorasPerdidas; aqui ela vira problema.
{
  const perdidas = (typeof globalThis !== "undefined" && globalThis.__ancorasPerdidas) || [];
  for (const a of perdidas) problemas.push(`âncora "${a}" não existia quando o bloco foi inserido — o arquivo carrega cedo demais (mova ele pra depois de quem cria "${a}")`);
}

// ---------- CORTE DO GABARITO: o arquivo servido ainda é JavaScript? ----------
// O lib/sem-gabarito.js troca por null todo `[...]` no nível 0 de um d(...).
// Um validador com `x["nome"]` solto ali vira `x null` e quebra o arquivo pro
// aluno. Caiu 4 vezes em 24-25/09/2026; o teste/gabarito.js pegava, mas só no
// fim. Aqui acusa junto com o resto, apontando a linha.
{
  let corte = null, vm = null;
  try { corte = require("../lib/sem-gabarito.js"); vm = require("vm"); } catch (e) { /* fora do node */ }
  if (corte && vm && typeof arquivos !== "undefined") {
    const fsx = require("fs"), pathx = require("path");
    for (const f of arquivos) {
      let bruto;
      try { bruto = fsx.readFileSync(pathx.join(__dirname, "..", "js", f), "utf8"); } catch (e) { continue; }
      const r = corte.tirarGabarito(bruto);
      const texto = typeof r === "string" ? r : (r && r.texto) || "";
      // O pior caso NÃO quebra a sintaxe: `cmd.flags["x"]` vira `cmd.flagsnull`,
      // que é JS válido e deixa o validador errado em silêncio. Conta os `null`
      // grudados em identificador/parêntese antes e depois do corte.
      const grudado = (t) => (t.match(/[A-Za-z0-9_$)\]]null(?![A-Za-z0-9_$])/g) || []).length;
      if (grudado(texto) > grudado(bruto)) {
        problemas.push(`${f} vira código ERRADO depois do corte de gabarito (${grudado(texto) - grudado(bruto)} acesso por índice colado em "null", ex.: cmd.flagsnull) — procure \`[...]\` solto dentro de um d(...) e embrulhe em parênteses ou use um helper`);
      }
      try { new vm.Script(texto, { filename: f }); }
      catch (e) {
        const linha = ((e.stack || "").match(new RegExp(f.replace(/\./g, "\\.") + ":(\\d+)")) || [])[1];
        problemas.push(`${f} QUEBRA depois do corte de gabarito (${e.message}${linha ? ", linha " + linha + " do texto cortado" : ""}) — procure \`[...]\` solto dentro de um d(...) e troque por um helper ou embrulhe em parênteses`);
      }
    }
  }
}

// ---------- FIXAÇÃO: o molde boot.dev, medido ----------
// Pedido do Gabriel (21/09/2026): cada comando com uma atividade que ensina o
// caso de uso E uma ou duas de fixação, e cada atividade introduzindo UM
// comando novo (regra 1 do CLAUDE.md). A revisão de 24/09 achou 90% dos
// comandos das levas novas praticados uma vez só — e nenhum teste acusava,
// porque o fumaça confere se a atividade FUNCIONA, não se ela ENSINA.
//
// É estrito só nas famílias de id abaixo (o conteúdo antigo entra como
// contagem, pra virar fila de trabalho sem travar ninguém).
// >>> Toda leva nova de atividades: ponha o prefixo dela aqui. <<<
const LEVAS_ESTRITAS = ["psqs", "psns", "sqsc", "logsc", "ssmc", "iamc", "ec2c", "s3c", "ctn", "fx", "cb", "ccm", "cdp"];
{
  const ehEstrita = (id) => LEVAS_ESTRITAS.some((p) => String(id).indexOf(p + "-") === 0);
  const usoPorCmd = {};
  const introduzidoPor = {};
  const vistosPorTrilha = {};
  const duplas = [];
  for (const d of DESAFIOS) {
    if (d.tipo === "projeto") continue;
    const vistos = (vistosPorTrilha[d.servico] = vistosPorTrilha[d.servico] || new Set());
    const cmds = new Set();
    for (const l of d.solucao || []) {
      const m = String(l).match(/^aws\s+(\S+)\s+(\S+)/);
      if (m) cmds.add(m[1] + " " + m[2]);
    }
    const ineditos = [];
    for (const k of cmds) {
      usoPorCmd[k] = (usoPorCmd[k] || 0) + 1;
      if (!vistos.has(k)) { ineditos.push(k); vistos.add(k); if (!introduzidoPor[k]) introduzidoPor[k] = d.id; }
    }
    if (ineditos.length >= 2) duplas.push({ id: d.id, estrita: ehEstrita(d.id), ineditos });
  }
  const umaVez = Object.keys(usoPorCmd).filter((k) => usoPorCmd[k] === 1);
  const umaVezEstrita = umaVez.filter((k) => ehEstrita(introduzidoPor[k]));
  const duplasEstritas = duplas.filter((x) => x.estrita);
  console.log("\n=== FIXAÇÃO (molde boot.dev) ===");
  console.log(`curso inteiro: ${umaVez.length} comandos praticados UMA vez só · ${duplas.length} atividades introduzindo 2+ comandos inéditos`);
  console.log(`levas estritas (${LEVAS_ESTRITAS.join(", ")}): ${umaVezEstrita.length} sem fixação · ${duplasEstritas.length} com 2+ inéditos`);
  // FIXACAO=1 node teste/analise.js → a fila de trabalho do conteúdo antigo,
  // agrupada pela trilha de quem introduziu o comando.
  if (typeof process !== "undefined" && process.env && process.env.FIXACAO) {
    const trilhaDe = {};
    for (const d of DESAFIOS) trilhaDe[d.id] = d.servico;
    const fila = {};
    for (const k of umaVez) (fila[trilhaDe[introduzidoPor[k]]] = fila[trilhaDe[introduzidoPor[k]]] || []).push(k + " (" + introduzidoPor[k] + ")");
    for (const x of duplas) (fila[trilhaDe[x.id]] = fila[trilhaDe[x.id]] || []).push("DUPLA " + x.id + ": " + x.ineditos.join(" + "));
    Object.keys(fila).sort((a, b) => fila[b].length - fila[a].length)
      .forEach((t) => console.log(`\n[${t}] ${fila[t].length}\n  ` + fila[t].join("\n  ")));
  }
  for (const k of umaVezEstrita) avisos.push(`sem fixação: "aws ${k}" só aparece em ${introduzidoPor[k]}`);
  for (const x of duplasEstritas) avisos.push(`${x.id} introduz ${x.ineditos.length} comandos de uma vez: ${x.ineditos.join(" + ")}`);
}

// ---------- Resumo ----------
console.log("\n=== PROBLEMAS (" + problemas.length + ") ===");
problemas.forEach((p) => console.log("✗ " + p));
console.log("\n=== AVISOS (" + avisos.length + ") ===");
avisos.forEach((a) => console.log("⚠ " + a));
console.log(`\nTotal DESAFIOS: ${DESAFIOS.length} | Trilhas na sidebar: ${SERVICOS_META.length}`);
