"use strict";
// ============================================================
// CLImb — lib/pagina-simulado.js
// Página pública do simulado CLF-C02 (/simulado-aws-clf-c02), montada no
// servidor. Mesma ideia do lib/paginas-licoes.js: o conteúdo já existe dentro
// do app, e aqui ele vira HTML que o buscador consegue ler.
//
// AMOSTRA, NÃO O BANCO INTEIRO. O banco de questões é ativo pago (usuário
// grátis faz 1 simulado; ver SIMULADOS_LIMITE_FREE no servidor.js). Publicar as
// 345 questões com gabarito aqui entregaria de graça o que sustenta o Pro — e
// deixaria o banco pronto pra qualquer um copiar. A amostra é o suficiente pra
// página ter conteúdo real e provar a qualidade: questão de verdade, explicação
// completa e a fonte oficial da AWS.
// ============================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ARQUIVOS = [
  "simulados-clf-1.js", "simulados-clf-2.js", "simulados-clf-3.js",
  "simulados-clf-4.js", "simulados-clf-5.js", "simulados-clf-6.js",
  "simulados-fontes.js", "simulados.js",
];

// Quantas questões de exemplo a página mostra, POR DOMÍNIO. Mexer aqui é o
// único ajuste necessário pra mostrar mais ou menos.
const AMOSTRA_POR_DOMINIO = 3;

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function resumir(s, max) {
  const limpo = String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  if (limpo.length <= max) return limpo;
  const corte = limpo.slice(0, max - 1);
  return corte.slice(0, corte.lastIndexOf(" ")) + "…";
}

function carregarSimulados(raiz) {
  const codigo = ARQUIVOS
    .map((f) => fs.readFileSync(path.join(raiz, "js", f), "utf8"))
    .join("\n");

  const el = () => ({
    style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, insertBefore() {}, remove() {}, setAttribute() {},
    addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  });
  const caixa = {
    document: {
      addEventListener() {}, removeEventListener() {},
      querySelector() { return null; }, querySelectorAll() { return []; },
      getElementById() { return null; }, createElement: el,
      head: el(), body: el(), readyState: "complete",
    },
    console: { log() {}, warn() {}, error() {}, info() {} },
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  caixa.window = caixa;
  vm.createContext(caixa);
  vm.runInContext(codigo, caixa, { timeout: 10000, filename: "simulados-sandbox.js" });

  const questoes = caixa.SIMULADOS_CLF || [];
  const certs = caixa.SIMULADOS_CERTS || {};
  if (!questoes.length) throw new Error("banco de questões veio vazio do sandbox");
  if (!certs.clf) throw new Error("catálogo CERTS não veio do sandbox");
  return {
    questoes,
    cert: certs.clf,
    fontes: caixa.SIMULADOS_FONTES || {},
    fontePorId: caixa.SIMULADOS_FONTE_POR_ID || {},
  };
}

// Amostra ESTÁVEL: sempre as mesmas questões, na mesma ordem. Conteúdo que
// muda a cada visita atrapalha indexação e cache — e ninguém consegue conferir.
function amostra(questoes, cert, porDominio) {
  const fora = [];
  for (const chave of Object.keys(cert.dominios)) {
    const doDominio = questoes
      .filter((q) => q.d === chave && !q.multi) // só de resposta única na vitrine
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    fora.push(...doDominio.slice(0, porDominio));
  }
  return fora;
}

function htmlQuestao(q, cert, fontes, fontePorId, n) {
  const dom = cert.dominios[q.d];
  const letras = ["A", "B", "C", "D", "E", "F"];
  const certas = new Set(q.c || []);
  const ops = (q.o || []).map((o, i) =>
    `<li class="${certas.has(i) ? "certa" : ""}">` +
    `<b>${letras[i]}.</b> ${esc(o)}${certas.has(i) ? ' <span class="tag">resposta correta</span>' : ""}</li>`
  ).join("");

  const chaveFonte = fontePorId[q.id];
  const fonte = chaveFonte && fontes[chaveFonte];
  const linkFonte = fonte
    ? `<p class="fonte">Fonte: <a href="${esc(fonte.url)}" rel="nofollow noopener" target="_blank">${esc(fonte.texto)}</a></p>`
    : "";

  return `<article class="q">
    <div class="qcab"><span class="num">Questão ${n}</span>
      <span class="dom">${esc(dom ? dom.nome : q.d)}</span></div>
    <p class="enun">${esc(q.q)}</p>
    <ol class="ops">${ops}</ol>
    <div class="expl"><b>Por que:</b> ${esc(q.e)}</div>
    ${linkFonte}
  </article>`;
}

function paginaSimulado(dados, opts) {
  opts = opts || {};
  const base = opts.base || "";
  const { questoes, cert, fontes, fontePorId } = dados;
  const url = `${base}/simulado-aws-clf-c02`;
  const total = questoes.length;

  const titulo = `Simulado AWS Cloud Practitioner (CLF-C02) grátis em português — CLImb`;
  const descricao = resumir(
    `${total} questões de simulado da certificação AWS Certified Cloud Practitioner ` +
    `(CLF-C02) em português, com gabarito comentado e fonte oficial da AWS em cada resposta. ` +
    `Comece de graça.`, 155);

  const doms = Object.keys(cert.dominios).map((k) => {
    const d = cert.dominios[k];
    return `<tr><td>${esc(d.nome)}</td><td class="peso">${esc(String(d.peso))}%</td><td>${esc(d.dica)}</td></tr>`;
  }).join("");

  const exemplos = amostra(questoes, cert, AMOSTRA_POR_DOMINIO);
  const htmlQ = exemplos.map((q, i) => htmlQuestao(q, cert, fontes, fontePorId, i + 1)).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="CLImb">
<meta property="og:locale" content="pt_BR">
<meta property="og:image" content="${esc(base)}/img/og.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(base)}/img/og.jpg">
<link rel="icon" href="${esc(base)}/img/favicon.svg" type="image/svg+xml">
<style>
  :root { --fundo:#10151f; --painel:#161e2d; --painel2:#1c2638; --borda:#2a3650;
          --texto:#dce3ee; --fraco:#8b99b0; --laranja:#ff9900; --laranja2:#cc7a00;
          --azul:#58a6ff; --verde:#3fb950; }
  * { box-sizing:border-box; }
  body { margin:0; padding:24px 16px 56px; background:var(--fundo); color:var(--texto);
         font-family:"Segoe UI", system-ui, -apple-system, sans-serif; line-height:1.6; }
  .env { max-width:800px; margin:0 auto; }
  .marca { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:28px; }
  .marca a.logo { color:var(--laranja); font-weight:800; font-size:1.15rem; text-decoration:none; }
  .marca a.logo small { color:var(--fraco); font-weight:400; font-size:0.7rem; margin-left:4px; }
  .btn { background:linear-gradient(90deg,var(--laranja2),var(--laranja)); color:#10151f;
         padding:10px 20px; border-radius:20px; font-weight:700; text-decoration:none;
         font-size:0.9rem; display:inline-block; }
  h1 { font-size:1.75rem; line-height:1.25; margin:0 0 10px; }
  h2 { font-size:1.15rem; color:var(--laranja); margin:34px 0 10px; }
  p { margin:0 0 14px; }
  b { color:#fff; }
  table { width:100%; border-collapse:collapse; font-size:0.92rem; margin-bottom:14px; }
  th,td { text-align:left; padding:9px 10px; border-bottom:1px solid var(--borda); vertical-align:top; }
  th { color:var(--fraco); font-weight:600; font-size:0.82rem; text-transform:uppercase; letter-spacing:0.04em; }
  td.peso { color:var(--laranja); font-weight:700; white-space:nowrap; }
  .fatos { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; margin:18px 0 6px; padding:0; list-style:none; }
  .fatos li { background:var(--painel); border:1px solid var(--borda); border-radius:10px; padding:12px; text-align:center; }
  .fatos strong { display:block; color:var(--laranja); font-size:1.35rem; }
  .fatos span { color:var(--fraco); font-size:0.8rem; }
  .q { background:var(--painel); border:1px solid var(--borda); border-radius:12px; padding:16px 18px; margin-bottom:16px; }
  .qcab { display:flex; justify-content:space-between; gap:10px; font-size:0.78rem;
          text-transform:uppercase; letter-spacing:0.04em; margin-bottom:10px; }
  .num { color:var(--laranja); font-weight:700; }
  .dom { color:var(--fraco); }
  .enun { font-size:1.02rem; }
  .ops { list-style:none; padding:0; margin:0 0 12px; }
  .ops li { padding:8px 10px; border:1px solid var(--borda); border-radius:8px;
            margin-bottom:6px; background:var(--painel2); font-size:0.94rem; }
  .ops li.certa { border-color:var(--verde); }
  .tag { color:var(--verde); font-size:0.76rem; font-weight:700; text-transform:uppercase; margin-left:4px; }
  .expl { background:var(--painel2); border-left:3px solid var(--laranja);
          border-radius:0 8px 8px 0; padding:10px 12px; font-size:0.93rem; }
  .fonte { font-size:0.83rem; color:var(--fraco); margin:8px 0 0; }
  .fonte a { color:var(--azul); }
  .cta { background:var(--painel); border:1px solid var(--borda); border-radius:12px;
         padding:22px; margin:32px 0 0; text-align:center; }
  .cta p { color:var(--fraco); font-size:0.93rem; }
  .rodape { margin-top:40px; border-top:1px solid var(--borda); padding-top:16px;
            color:var(--fraco); font-size:0.85rem; }
  .rodape a { color:var(--azul); }
</style>
</head>
<body>
<div class="env">
  <div class="marca">
    <a class="logo" href="${esc(base)}/">CLImb<small>aprenda AWS CLI digitando</small></a>
    <a class="btn" href="${esc(base)}/">Fazer o simulado</a>
  </div>

  <h1>Simulado AWS Cloud Practitioner (CLF-C02) grátis, em português</h1>
  <p>A <b>${esc(cert.nome)}</b> é a certificação de entrada da AWS: ela cobra
  conceitos de nuvem, segurança, os serviços principais e como a AWS cobra —
  não exige saber programar. Este simulado segue o formato do exame e a
  <b>distribuição oficial por domínio</b>, então a proporção do que você treina
  é a mesma que você encontra na prova.</p>

  <ul class="fatos">
    <li><strong>${esc(String(total))}</strong><span>questões no banco</span></li>
    <li><strong>${esc(String(cert.qtdProva))}</strong><span>por simulado</span></li>
    <li><strong>${esc(String(cert.corte))}%</strong><span>nota de corte</span></li>
    <li><strong>100%</strong><span>com fonte oficial</span></li>
  </ul>

  <h2>O que cai na prova, e com que peso</h2>
  <table>
    <thead><tr><th>Domínio</th><th>Peso</th><th>O que cobra</th></tr></thead>
    <tbody>${doms}</tbody>
  </table>

  <h2>Questões de exemplo, com gabarito comentado</h2>
  <p>Abaixo, <b>${esc(String(exemplos.length))} questões reais do banco</b> —
  ${esc(String(AMOSTRA_POR_DOMINIO))} de cada domínio — com a resposta certa, a
  explicação de <b>por quê</b> e o link pra página oficial da AWS que sustenta a
  resposta. É esse o padrão das ${esc(String(total))}: nenhuma questão nossa é
  escrita sem fonte conferida.</p>
  ${htmlQ}

  <div class="cta">
    <p>Estas são ${esc(String(exemplos.length))} de <b>${esc(String(total))}</b>.
    O simulado completo sorteia ${esc(String(cert.qtdProva))} questões respeitando o
    peso de cada domínio, corrige, mostra a nota e aponta <b>em qual domínio você
    errou mais</b> — com o que revisar em cada um.</p>
    <a class="btn" href="${esc(base)}/">Começar de graça</a>
  </div>

  <div class="rodape">
    <a href="${esc(base)}/aprender">Lições de AWS</a> ·
    <a href="${esc(base)}/">Praticar no terminal</a> ·
    <a href="${esc(base)}/sobre.html">Sobre</a>
    <p style="margin-top:10px">Projeto independente e educativo, <b>sem afiliação,
    patrocínio ou endosso</b> da Amazon. “AWS” e “Amazon Web Services” são marcas
    registradas da Amazon.com, Inc. ou de suas afiliadas.</p>
  </div>
</div>
</body>
</html>`;
}

module.exports = { carregarSimulados, paginaSimulado, amostra, esc, AMOSTRA_POR_DOMINIO };
