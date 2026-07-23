

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
function resolver(linha) {
  const ult = (obj) => { const k = Object.keys(obj || {}); return k[k.length - 1]; };
  if (linha.includes("<id-da-inst")) linha = linha.replace(/<id-da-inst[^>]*>/, ult(conta.ec2.instancias));
  if (linha.includes("<vpc-id>") && conta.vpc) linha = linha.replace(/<vpc-id>/g, ult(conta.vpc.vpcs));
  if (linha.includes("<igw-id>") && conta.vpc) linha = linha.replace(/<igw-id>/g, ult(conta.vpc.igws));
  if (linha.includes("<vol-id>")) linha = linha.replace(/<vol-id>/g, ult(conta.ec2.volumes));
  if (linha.includes("<zone-id>") && conta.route53) linha = linha.replace(/<zone-id>/g, ult(conta.route53.zonas));
  if (linha.includes("<dist-id>") && conta.cloudfront) linha = linha.replace(/<dist-id>/g, ult(conta.cloudfront.distribuicoes));
  if (linha.includes("<api-id>") && conta.apigateway) linha = linha.replace(/<api-id>/g, ult(conta.apigateway.apis));
  if ((linha.includes("<root-id>") || linha.includes("<resource-id>")) && conta.apigateway) {
    const api = conta.apigateway.apis[ult(conta.apigateway.apis)];
    if (api) {
      linha = linha.replace(/<root-id>/g, api.raiz);
      const filhos = Object.keys(api.recursos).filter((r) => r !== api.raiz);
      linha = linha.replace(/<resource-id>/g, filhos[filhos.length - 1] || api.raiz);
    }
  }
  if (linha.includes("<receipt-handle>")) {
    let handle = "";
    for (const f of Object.values((conta.sqs || {}).filas || {})) {
      const m = (f.mensagens || []).find((x) => x.handle);
      if (m) { handle = m.handle; break; }
    }
    linha = linha.replace(/<receipt-handle>/g, handle);
  }
  return linha;
}
const autopass = [];
for (const d of DESAFIOS) {
  if (d.tipo === "projeto") continue;
  if ((d.solucao || []).some((s) => !s.trim().startsWith("aws"))) continue; // shell: fora deste harness
  // já satisfeito antes de rodar a solução? (validador de ESTADO ganho de graça)
  let antes = false;
  try { antes = !!d.validar(conta, null, false); } catch (e) { antes = false; }
  if (antes) autopass.push(`${d.id} (${d.servico}) — "${d.titulo}"`);
  for (const sol of d.solucao) {
    const r = executarComandoAws(conta, resolver(sol));
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

// ---------- Resumo ----------
console.log("\n=== PROBLEMAS (" + problemas.length + ") ===");
problemas.forEach((p) => console.log("✗ " + p));
console.log("\n=== AVISOS (" + avisos.length + ") ===");
avisos.forEach((a) => console.log("⚠ " + a));
console.log(`\nTotal DESAFIOS: ${DESAFIOS.length} | Trilhas na sidebar: ${SERVICOS_META.length}`);
