"use strict";
// ============================================================
// CLImb — lib/conteudo-app.js
// Lê DESAFIOS, MANUAIS e SERVICOS_META do app, no servidor, num contexto
// isolado do `vm` — mesma técnica do lib/paginas-licoes.js e pelo mesmo motivo:
// não há segunda cópia do conteúdo pra desencontrar. Mexeu na atividade ou no
// manual, a página pública muda junto.
//
// POR QUE EXISTE: 44 mil palavras de texto próprio (450 verbetes de manual,
// descrições e dicas de 690 atividades) viviam dentro do JavaScript do app,
// invisíveis pro buscador — enquanto as 53 páginas de /aprender saíam com ~240
// palavras cada e o Google rastreava sem indexar nenhuma.
//
// Os arquivos são os mesmos que o teste/analise.js carrega, na mesma ordem: a
// ordem importa (desafios-pratica.js insere atividades no meio de trilhas já
// declaradas, os *-completo.js reordenam). Mudou a lista lá, muda aqui.
// ============================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ARQUIVOS = [
  "simulador.js", "manuais.js", "manuais-fase6-9.js", "desafios.js",
  "atividades-extras.js", "desafios-avancados.js", "cenarios-reais.js",
  "cloudformation.js", "servicos-fase1.js", "servicos-fase2.js",
  "servicos-fase3.js", "servicos-fase4.js", "servicos-fase5.js", "ssm-completo.js",
  "servicos-fase6.js", "servicos-fase7.js", "servicos-fase8.js",
  "servicos-fase9.js", "polly-completo.js", "cloudfront-completo.js",
  "route53-completo.js", "secretsmanager-completo.js", "acm-completo.js",
  "desafios-extra.js", "desafios-pratica.js", "desafios-pratica-2.js",
  "sqs-completo.js", "iam-completo.js", "cloudwatch-metricas.js",
  "logs-insights.js", "logs-completo.js", "lambda-dynamo-profundo.js", "cobertura-1.js",
  "cobertura-2.js", "cobertura-3.js", "mundo-real-2.js", "mundo-real-3.js",
  "efs-completo.js", "elasticache-completo.js", "ecr-completo.js",
  "setup-lab.js", "linux-lab.js", "arquivos-lab.js", "json-yaml.js",
  "json-yaml-2.js", "lab-vpc.js", "missoes.js",
];

function elemento() {
  const el = {
    style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, insertBefore() {}, remove() {}, setAttribute() {},
    addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  };
  return el;
}

// Os arquivos de conteúdo são UI: chamam imprimir(), mexem no DOM e registram
// listeners no carregamento. Os stubs deixam tudo isso virar no-op — queremos
// só as constantes que eles declaram.
function montarCaixa() {
  const caixa = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    requestAnimationFrame() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      addEventListener() {}, removeEventListener() {},
      querySelector() { return null; }, querySelectorAll() { return []; },
      getElementById() { return null; }, createElement: elemento,
      head: elemento(), body: elemento(), readyState: "complete",
      scripts: [],
    },
    imprimir() {}, imprimirComando() {}, rolarTerminal() {}, salvarJogo() {},
    verificarDesafios() {}, toast() {}, atualizarTudo() {},
    ui: { historicoCmd: [], posHistorico: 0 },
    jogo: { conta: null, concluidos: {} },
  };
  caixa.window = caixa;
  caixa.globalThis = caixa;
  return caixa;
}

let cache = null;

function carregar(raiz) {
  if (cache) return cache;
  const codigo = ARQUIVOS
    .map((f) => fs.readFileSync(path.join(raiz, "js", f), "utf8"))
    .join("\n");
  cache = rodar(codigo);
  return cache;
}

// Mesmo carregamento, mas a partir de textos JÁ transformados (um por arquivo).
// É assim que o teste/gabarito.js confere o que o cliente realmente recebe —
// sem isto ele testaria o disco, e não o que o servidor entrega.
function carregarDeTextos(textos) {
  return rodar(ARQUIVOS.map((f) => textos[f] || "").join("\n"));
}

function rodar(codigo) {
  const caixa = montarCaixa();
  vm.createContext(caixa);
  vm.runInContext(
    codigo + `
;globalThis.__conteudo = {
  DESAFIOS: typeof DESAFIOS !== "undefined" ? DESAFIOS : null,
  MANUAIS: typeof MANUAIS !== "undefined" ? MANUAIS : null,
  SERVICOS_META: typeof SERVICOS_META !== "undefined" ? SERVICOS_META : null,
};`,
    caixa,
    { timeout: 20000, filename: "conteudo-sandbox.js" }
  );
  const saida = caixa.__conteudo;
  if (!saida || !saida.DESAFIOS) throw new Error("DESAFIOS não veio do sandbox");
  return {
    desafios: saida.DESAFIOS,
    manuais: saida.MANUAIS || {},
    meta: saida.SERVICOS_META || [],
  };
}

// ---------- recortes por trilha ----------

// Comandos que a trilha ensina, na ordem em que aparecem nas atividades, com o
// verbete de manual de cada um. É o material mais valioso pra busca: quem
// procura "aws s3 mb" quer exatamente isto.
function comandosDaTrilha(conteudo, servico) {
  const vistos = new Map();
  for (const d of conteudo.desafios) {
    if (d.servico !== servico) continue;
    for (const linha of (d.solucao || [])) {
      const m = String(linha).match(/^aws\s+([a-z0-9-]+)\s+([a-z0-9-]+)/);
      if (!m) continue;
      const chave = m[1] + "." + m[2];
      if (vistos.has(chave)) continue;
      const manual = conteudo.manuais[chave];
      if (!manual) continue;
      vistos.set(chave, { chave, comando: "aws " + m[1] + " " + m[2], manual: String(manual) });
    }
  }
  return [...vistos.values()];
}

// Atividades da trilha: título e enunciado, SEM dicas e SEM solução — o
// enunciado é o cenário de trabalho (conteúdo único e legítimo pra busca); a
// dica e a resposta são o produto.
function atividadesDaTrilha(conteudo, servico) {
  return conteudo.desafios
    .filter((d) => d.servico === servico && d.tipo !== "projeto")
    .map((d) => ({ id: d.id, titulo: d.titulo, descricao: d.descricao, nivel: d.nivel }));
}

// A primeira linha do verbete é sempre "aws s3 mb — make bucket (criar bucket)".
function resumoDoManual(manual) {
  const primeira = String(manual).split("\n")[0] || "";
  const traco = primeira.indexOf("—");
  return traco > 0 ? primeira.slice(traco + 1).trim() : primeira.trim();
}

// O bloco USO do verbete, que é a sintaxe do comando.
function sintaxeDoManual(manual) {
  const m = String(manual).match(/USO\s*\n([\s\S]*?)(\n\s*\n|$)/);
  if (!m) return "";
  return m[1].split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
}

// ---------- páginas por comando ----------
// Só ganha página própria o comando que tem material pra sustentar uma: verbete
// de manual + o enunciado das atividades que o usam. O corte existe porque
// publicar 394 páginas rasas repetiria o erro que estas mudanças consertam —
// das 394, só 29 passam de 300 palavras, e são justamente as mais procuradas
// (aws s3 mb, ec2 run-instances, iam create-user...).
const MINIMO_PALAVRAS = 300;

function palavras(txt) {
  return String(txt || "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
}

function atividadesDoComando(conteudo, chave) {
  const [servico, sub] = String(chave).split(".");
  // Escapes DOBRADOS de propósito: em string JS, "\s" vira "s" e "\b" vira o
  // byte 0x08 — a regex casava com nada e nenhum comando ganhava página.
  const alvo = new RegExp("^aws\\s+" + servico + "\\s+" + sub + "\\b");
  const fora = [];
  for (const d of conteudo.desafios) {
    if (d.tipo === "projeto") continue;
    if ((d.solucao || []).some((c) => alvo.test(String(c)))) {
      fora.push({ id: d.id, titulo: d.titulo, descricao: d.descricao, servico: d.servico });
    }
  }
  return fora;
}

// Mapa "servico.sub" -> { chave, servico, sub, comando, manual, atividades }
// só dos que passam do mínimo. É esta lista que vira rota e vai pro sitemap.
function comandosComPagina(conteudo) {
  if (conteudo.__comandos) return conteudo.__comandos;
  const saida = {};
  for (const chave of Object.keys(conteudo.manuais)) {
    if (chave.indexOf(".") < 0) continue;
    const [servico, sub] = chave.split(".");
    if (!servico || !sub) continue;
    const ats = atividadesDoComando(conteudo, chave);
    if (!ats.length) continue;
    const total = palavras(conteudo.manuais[chave]) +
      ats.reduce((a, d) => a + palavras(d.titulo) + palavras(d.descricao), 0);
    if (total < MINIMO_PALAVRAS) continue;
    saida[chave] = {
      chave, servico, sub,
      comando: "aws " + servico + " " + sub,
      manual: String(conteudo.manuais[chave]),
      atividades: ats,
      palavras: total,
    };
  }
  conteudo.__comandos = saida;
  return saida;
}

module.exports = {
  carregar, carregarDeTextos, comandosDaTrilha, atividadesDaTrilha, resumoDoManual, sintaxeDoManual,
  comandosComPagina, atividadesDoComando, MINIMO_PALAVRAS, ARQUIVOS,
};
