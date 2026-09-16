"use strict";
// ============================================================
// CLImb — lib/paginas-licoes.js
// Páginas públicas das lições, montadas NO SERVIDOR (/aprender e /aprender/<id>).
//
// POR QUE EXISTE: o app é JS puro montado no navegador, então até agora o
// sitemap tinha TRÊS URLs (home, sobre, privacidade) enquanto 50+ lições
// escritas ficavam invisíveis pro buscador. Estas páginas expõem o texto que
// já existe, em HTML, para quem procura "o que é IAM" ou "pra que serve o S3".
//
// DE ONDE VEM O CONTEÚDO: das MESMAS constantes que o app usa (js/licoes*.js),
// lidas num contexto isolado do `vm`. Não há segunda cópia do texto pra
// desencontrar — mexeu na lição, a página muda junto.
//
// O sandbox é isolado de propósito (vm.createContext, não eval): os arquivos de
// lição são UI e chamam document/window no carregamento. Rodar isso no escopo
// do servidor poluiria o global do processo.
// ============================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const conteudoApp = require("./conteudo-app.js");

const ARQUIVOS = ["licoes.js", "licoes-complemento.js", "licoes-fase6-9.js"];

const ROTULOS_PADRAO = {
  abertura: "Entenda o", serve: "Pra que serve",
  casos: "Onde se usa no mundo real", vocab: "Vocabulário",
};

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
// Mesma regra do ricoSeguro() de js/licoes.js: escapa tudo e devolve só as
// tags de formatação. O texto é nosso, mas a regra fica igual dos dois lados.
function rico(s) {
  return esc(s).replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>")
    .replace(/&lt;i&gt;/g, "<i>").replace(/&lt;\/i&gt;/g, "</i>")
    .replace(/&lt;code&gt;/g, "<code>").replace(/&lt;\/code&gt;/g, "</code>");
}
// Para <meta description>: sem tag nenhuma e num tamanho que o Google mostra.
function resumir(s, max) {
  const limpo = String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  if (limpo.length <= max) return limpo;
  const corte = limpo.slice(0, max - 1);
  return corte.slice(0, corte.lastIndexOf(" ")) + "…";
}

// ---------- carregamento das lições ----------
function carregarLicoes(raiz) {
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
    setTimeout() {}, clearTimeout() {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  caixa.window = caixa;
  vm.createContext(caixa);
  vm.runInContext(
    codigo + `
;globalThis.__licoes = {
  LICOES: typeof LICOES !== "undefined" ? LICOES : null,
  ALIAS: typeof LICAO_ALIAS !== "undefined" ? LICAO_ALIAS : {},
};`,
    caixa,
    { timeout: 10000, filename: "licoes-sandbox.js" }
  );

  const saida = caixa.__licoes;
  if (!saida || !saida.LICOES) throw new Error("LICOES não veio do sandbox");
  return { licoes: saida.LICOES, alias: saida.ALIAS || {}, gratis: carregarGratis(raiz) };
}

// Quais trilhas são abertas por inteiro, lido do js/licenca.js — a MESMA lista
// que o app usa. Sem window no sandbox de propósito: o IIFE do arquivo começa
// com `if (typeof window === "undefined") return;`, então ele sai na hora e só
// as constantes do topo são avaliadas. Nada de DOM, nada de efeito colateral.
function carregarGratis(raiz) {
  try {
    const src = fs.readFileSync(path.join(raiz, "js", "licenca.js"), "utf8");
    const caixa = { console: { log() {}, warn() {}, error() {}, info() {} } };
    vm.createContext(caixa);
    vm.runInContext(
      src + `
;globalThis.__g = {
  servicos: typeof SERVICOS_GRATIS !== "undefined" ? SERVICOS_GRATIS : [],
  porTrilha: typeof GRATIS_POR_TRILHA !== "undefined" ? GRATIS_POR_TRILHA : 0,
};`,
      caixa,
      { timeout: 5000, filename: "licenca-sandbox.js" }
    );
    const g = caixa.__g || {};
    return { servicos: g.servicos || [], porTrilha: g.porTrilha || 0 };
  } catch (e) {
    // Sem a lista, a página não promete nada sobre preço — melhor omitir do
    // que afirmar errado, que foi exatamente o defeito que isto conserta.
    return { servicos: [], porTrilha: 0 };
  }
}

// ---------- HTML ----------
const ESTILO = `
  :root { --fundo:#10151f; --painel:#161e2d; --painel2:#1c2638; --borda:#2a3650;
          --texto:#dce3ee; --fraco:#8b99b0; --laranja:#ff9900; --laranja2:#cc7a00; --azul:#58a6ff; }
  * { box-sizing:border-box; }
  body { margin:0; padding:24px 16px 56px; background:var(--fundo); color:var(--texto);
         font-family:"Segoe UI", system-ui, -apple-system, sans-serif; line-height:1.6; }
  .env { max-width:760px; margin:0 auto; }
  .marca { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:28px; }
  .marca a.logo { color:var(--laranja); font-weight:800; font-size:1.15rem; text-decoration:none; }
  .marca a.logo small { color:var(--fraco); font-weight:400; font-size:0.7rem; margin-left:4px; }
  .btn { background:linear-gradient(90deg,var(--laranja2),var(--laranja)); color:#10151f;
         padding:10px 20px; border-radius:20px; font-weight:700; text-decoration:none; font-size:0.9rem;
         display:inline-block; }
  h1 { font-size:1.7rem; line-height:1.25; margin:0 0 6px; }
  .cmd { background:var(--painel); border:1px solid var(--borda); border-radius:10px;
         padding:14px 16px; margin:0 0 10px; }
  .cmd h3 { margin:0 0 4px; font-size:1rem; }
  .cmd h3 code { background:none; padding:0; color:var(--laranja); font-size:1rem; }
  .cmd p { margin:0 0 8px; color:var(--texto); }
  .cmd pre { background:#0d1117; border:1px solid var(--borda); border-radius:8px;
             padding:10px 12px; margin:0; overflow-x:auto; font-size:0.86rem; color:#9ecbff; }
  .pratica { border-left:2px solid var(--borda); padding-left:14px; margin:0 0 14px; }
  .pratica h3 { margin:0 0 4px; font-size:0.98rem; color:var(--texto); }
  .pratica p { margin:0; color:var(--fraco); font-size:0.92rem; }
  .vizinhas { display:flex; flex-wrap:wrap; gap:8px; margin:6px 0 0; padding:0; list-style:none; }
  .vizinhas a { display:inline-block; background:var(--painel2); border:1px solid var(--borda);
                border-radius:16px; padding:6px 12px; color:var(--texto); text-decoration:none;
                font-size:0.88rem; }
  .vizinhas a:hover { border-color:var(--laranja); color:var(--laranja); }
  h1 .emoji { margin-right:6px; }
  h2 { font-size:1.05rem; color:var(--laranja); margin:30px 0 8px; }
  p { margin:0 0 14px; }
  code { background:var(--painel2); border:1px solid var(--borda); border-radius:4px;
         padding:1px 5px; font-size:0.88em; font-family:ui-monospace,Consolas,monospace; }
  b { color:#fff; }
  ul { padding-left:20px; } li { margin-bottom:8px; }
  dl { margin:0; } dt { font-weight:700; color:#fff; margin-top:12px; }
  dd { margin:2px 0 0; padding-left:0; color:var(--texto); }
  .cobra { background:var(--painel); border:1px solid var(--borda); border-left:3px solid var(--laranja);
           border-radius:8px; padding:12px 14px; margin-top:24px; }
  .cta { background:var(--painel); border:1px solid var(--borda); border-radius:12px;
         padding:20px; margin:34px 0 0; text-align:center; }
  .cta p { color:var(--fraco); font-size:0.92rem; }
  .lista { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px; padding:0; list-style:none; }
  .lista a { display:block; background:var(--painel); border:1px solid var(--borda); border-radius:10px;
             padding:12px 14px; text-decoration:none; color:var(--texto); font-weight:600; }
  .lista a:hover { border-color:var(--laranja); }
  .livre { color:#3fb950; font-size:0.74rem; font-weight:700; text-transform:uppercase;
           border:1px solid #3fb950; border-radius:10px; padding:1px 6px; margin-left:4px; }
  .rodape { margin-top:40px; border-top:1px solid var(--borda); padding-top:16px;
            color:var(--fraco); font-size:0.85rem; }
  .rodape a { color:var(--azul); }
`;

function cabecalho(titulo, descricao, url, base) {
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
<style>${ESTILO}</style>
</head>
<body>
<div class="env">
  <div class="marca">
    <a class="logo" href="${esc(base)}/">CLImb<small>aprenda AWS CLI digitando</small></a>
    <a class="btn" href="${esc(base)}/">Praticar de graça</a>
  </div>`;
}

function rodape(base) {
  return `
  <div class="rodape">
    <a href="${esc(base)}/aprender">Todas as lições</a> ·
    <a href="${esc(base)}/">Praticar no terminal</a> ·
    <a href="${esc(base)}/sobre.html">Sobre</a>
  </div>
</div>
</body>
</html>`;
}

// O que a página pode PROMETER sobre preço nesta trilha. Antes o botão dizia
// "Praticar X de graça" em toda lição — errado em 47 das 53, porque só 6
// trilhas são inteiramente abertas. Página pública mentindo sobre preço é a
// pior forma de trazer visita: a pessoa chega, bate no muro e não volta.
function textoAcesso(sid, gratis) {
  const g = gratis || { servicos: [], porTrilha: 0 };
  if (g.servicos.includes(sid)) {
    return {
      texto: "Esta trilha é <b>inteiramente gratuita</b> — não precisa pagar nem dar cartão.",
      botao: "Praticar de graça",
    };
  }
  if (g.porTrilha > 0) {
    return {
      texto: `As <b>${g.porTrilha} primeiras atividades</b> desta trilha são abertas; ` +
        "o resto faz parte do plano Pro.",
      botao: `Começar — ${g.porTrilha} atividades grátis`,
    };
  }
  return { texto: "", botao: "Praticar no CLImb" }; // sem dado: não promete nada
}

// ---------- seções que vêm do conteúdo do app ----------
// O texto destas seções não é escrito aqui: sai dos manuais e das atividades
// que já existem (lib/conteudo-app.js). Antes disto a página tinha ~240
// palavras próprias — raso demais pro Google indexar, e ele não indexava
// mesmo. O enunciado das atividades entra; dica e solução NÃO, que essas são
// o produto.
function secaoComandos(sid, conteudo, base, opts) {
  if (!conteudo) return "";
  const cmds = conteudoApp.comandosDaTrilha(conteudo, sid);
  if (!cmds.length) return "";
  const itens = cmds.map((c) => {
    const resumo = conteudoApp.resumoDoManual(c.manual);
    const sintaxe = conteudoApp.sintaxeDoManual(c.manual);
    const temPagina = opts && opts.comandosComPagina && opts.comandosComPagina[c.chave];
    const rotulo = temPagina
      ? `<a href="${esc(base)}/aprender/${esc(c.chave.split(".")[0])}/${esc(c.chave.split(".")[1])}"><code>${esc(c.comando)}</code></a>`
      : `<code>${esc(c.comando)}</code>`;
    return `<div class="cmd">
      <h3>${rotulo}</h3>
      ${resumo ? `<p>${esc(resumo)}</p>` : ""}
      ${sintaxe ? `<pre>${esc(sintaxe)}</pre>` : ""}
    </div>`;
  }).join("");
  return `<h2>Comandos que você aprende nesta trilha</h2>
    <p>Cada um deles roda de verdade no terminal do CLImb, com a mesma saída e
    as mesmas mensagens de erro que a AWS devolve.</p>
    ${itens}`;
}

function secaoPratica(sid, conteudo, base) {
  if (!conteudo) return "";
  const ats = conteudoApp.atividadesDaTrilha(conteudo, sid);
  if (!ats.length) return "";
  const itens = ats.map((a) => `<div class="pratica">
      <h3>${esc(a.titulo)}</h3>
      <p>${rico(a.descricao)}</p>
    </div>`).join("");
  return `<h2>O que você pratica (${ats.length} ${ats.length === 1 ? "atividade" : "atividades"})</h2>
    <p>Cada atividade é um pedido de trabalho, do jeito que ele chega no dia a dia —
    você resolve digitando os comandos, não escolhendo alternativa.</p>
    ${itens}`;
}

// Página órfã não é rastreada: cada lição aponta pras vizinhas do mesmo grupo.
function secaoVizinhas(sid, licoes, meta, base) {
  if (!meta || !meta.length) return "";
  const eu = meta.find((m) => m.id === sid);
  if (!eu) return "";
  const irmas = meta
    .filter((m) => m.grupo === eu.grupo && m.id !== sid && licoes[m.id])
    .slice(0, 8);
  if (!irmas.length) return "";
  const itens = irmas.map((m) =>
    `<li><a href="${esc(base)}/aprender/${esc(m.id)}">${esc(m.icone || "")} ${esc(m.nome)}</a></li>`
  ).join("");
  return `<h2>Continue por aqui</h2><ul class="vizinhas">${itens}</ul>`;
}

function paginaLicao(sid, licao, opts) {
  opts = opts || {};
  const base = opts.base || "";
  const url = `${base}/aprender/${encodeURIComponent(sid)}`;
  const r = Object.assign({}, ROTULOS_PADRAO, licao.rotulos || {});
  const nome = `${r.abertura} ${licao.titulo}`.trim();
  // O <title> é escrito pra casar com o que a pessoa DIGITA na busca ("o que é
  // S3", "pra que serve o IAM"), não com o rótulo interno da lição. O <h1>
  // mantém o tom do app; os dois não precisam ser iguais.
  const titulo = `${licao.titulo}: o que é e pra que serve — CLImb`;
  const descricao = resumir(licao.oque, 155);

  const casos = (licao.casos || []).map((c) => `<li>${rico(c)}</li>`).join("");
  const vocab = (licao.vocab || []).map(([t, d]) => `<dt>${esc(t)}</dt><dd>${rico(d)}</dd>`).join("");
  const acesso = textoAcesso(sid, opts.gratis);

  // SEM JSON-LD de propósito: dado estruturado vai em <script> inline, e a CSP
  // do projeto tem script-src sem 'unsafe-inline' — seria bloqueado calado.
  // Para adicionar depois: mandar o hash sha256 do bloco na CSP desta rota.
  return cabecalho(titulo, descricao, url, base) + `
  <h1><span class="emoji">${esc(licao.emoji || "📚")}</span>${esc(nome)}</h1>
  <p>${rico(licao.oque)}</p>
  ${licao.serve ? `<h2>${esc(r.serve)}</h2><p>${rico(licao.serve)}</p>` : ""}
  ${casos ? `<h2>${esc(r.casos)}</h2><ul>${casos}</ul>` : ""}
  ${vocab ? `<h2>${esc(r.vocab)}</h2><dl>${vocab}</dl>` : ""}
  ${licao.cobra ? `<div class="cobra">💰 <b>Como cobra:</b> ${rico(licao.cobra)}</div>` : ""}
  ${secaoComandos(sid, opts.conteudo, base, opts)}
  ${secaoPratica(sid, opts.conteudo, base)}
  ${secaoVizinhas(sid, opts.licoes || {}, opts.meta, base)}
  <div class="cta">
    <p>Ler explica. <b>Digitar fixa.</b> No CLImb você roda os comandos de verdade num
    terminal AWS simulado — o estado persiste entre eles, como na nuvem real.</p>
    <p>${acesso.texto}</p>
    <a class="btn" href="${esc(base)}/">${esc(acesso.botao)}</a>
  </div>` + rodape(base);
}

// ---------- página de um comando (/aprender/<servico>/<sub>) ----------
// Existe só pros comandos que têm material pra sustentar uma página inteira
// (ver comandosComPagina no lib/conteudo-app.js). É a cauda longa da busca:
// ninguém pesquisa "curso de AWS CLI", pesquisa "aws s3 mb".
function paginaComando(cmd, opts) {
  opts = opts || {};
  const base = opts.base || "";
  const url = `${base}/aprender/${encodeURIComponent(cmd.servico)}/${encodeURIComponent(cmd.sub)}`;
  const resumo = conteudoApp.resumoDoManual(cmd.manual);
  const titulo = `${cmd.comando}: ${resumo} — AWS CLI — CLImb`;
  const descricao = resumir(
    `${cmd.comando} — ${resumo}. Sintaxe, opções, exemplo e ${cmd.atividades.length} exercícios pra praticar no terminal.`, 155);
  const licao = opts.licoes && opts.licoes[cmd.servico];

  const praticas = cmd.atividades.map((a) => `<div class="pratica">
      <h3>${esc(a.titulo)}</h3>
      <p>${rico(a.descricao)}</p>
    </div>`).join("");

  const irmaos = (opts.irmaos || []).filter((c) => c.chave !== cmd.chave).slice(0, 10)
    .map((c) => `<li><a href="${esc(base)}/aprender/${esc(c.servico)}/${esc(c.sub)}"><code>${esc(c.comando)}</code></a></li>`)
    .join("");

  return cabecalho(titulo, descricao, url, base) + `
  <h1><span class="emoji">⌨️</span>${esc(cmd.comando)}</h1>
  <p>${esc(resumo)}${licao ? ` — comando da trilha de <a href="${esc(base)}/aprender/${esc(cmd.servico)}">${esc(licao.titulo)}</a>.` : "."}</p>
  <h2>Manual do comando</h2>
  <p>É o mesmo texto que <code>${esc(cmd.comando)} help</code> devolve dentro do CLImb.</p>
  <pre>${esc(cmd.manual)}</pre>
  ${praticas ? `<h2>Onde você pratica isto (${cmd.atividades.length} ${cmd.atividades.length === 1 ? "atividade" : "atividades"})</h2>
  <p>Cada uma é um pedido de trabalho real; você resolve digitando o comando, e o
  estado fica salvo pro exercício seguinte.</p>${praticas}` : ""}
  ${irmaos ? `<h2>Outros comandos com página própria</h2><ul class="vizinhas">${irmaos}</ul>` : ""}
  <div class="cta">
    <p>Ler a sintaxe explica. <b>Digitar fixa.</b> No CLImb você roda
    <code>${esc(cmd.comando)}</code> num terminal AWS simulado e vê a saída — inclusive
    a mensagem de erro, quando erra a flag.</p>
    <a class="btn" href="${esc(base)}/">Praticar no terminal</a>
  </div>` + rodape(base);
}

// O índice é a página mais rastreada de /aprender: é dela que o buscador
// alcança o resto. As páginas de comando penduram aqui pra não ficarem órfãs.
function secaoComandosDoIndice(comandos, base) {
  const lista = Object.values(comandos || {});
  if (!lista.length) return "";
  lista.sort((a, b) => a.comando.localeCompare(b.comando));
  const itens = lista.map((c) =>
    `<li><a href="${esc(base)}/aprender/${esc(c.servico)}/${esc(c.sub)}"><code>${esc(c.comando)}</code></a></li>`
  ).join("");
  return `<h2>Comandos com página própria</h2>
    <p>Sintaxe, opções, exemplo e os exercícios em que cada um aparece.</p>
    <ul class="vizinhas">${itens}</ul>`;
}

function paginaIndice(licoes, opts) {
  opts = opts || {};
  const base = opts.base || "";
  const url = `${base}/aprender`;
  const ids = Object.keys(licoes).sort((a, b) =>
    String(licoes[a].titulo).localeCompare(String(licoes[b].titulo), "pt-BR"));
  const titulo = `Aprenda AWS em português — ${ids.length} lições — CLImb`;
  const descricao = `Explicações curtas e diretas de ${ids.length} serviços da AWS em português:` +
    ` o que é, pra que serve, onde se usa no mundo real e como cobra.`;

  const g = opts.gratis || { servicos: [], porTrilha: 0 };
  const itens = ids.map((id) =>
    `<li><a href="${esc(base)}/aprender/${encodeURIComponent(id)}">` +
    `${esc(licoes[id].emoji || "📚")} ${esc(licoes[id].titulo)}` +
    (g.servicos.includes(id) ? ' <span class="livre">grátis</span>' : "") +
    `</a></li>`).join("");

  // Regra de acesso dita em português claro. A versão anterior desta página
  // dizia "de graça" em tudo, o que não era verdade.
  const preco = g.porTrilha > 0
    ? `<p>${esc(String(g.servicos.length))} trilhas são <b>inteiramente gratuitas</b>
       (marcadas abaixo). Nas demais, as <b>${esc(String(g.porTrilha))} primeiras
       atividades</b> são abertas e o restante faz parte do plano Pro.</p>`
    : "";

  return cabecalho(titulo, descricao, url, base) + `
  <h1>Aprenda AWS em português</h1>
  <p>${esc(String(ids.length))} lições curtas: <b>o que é</b>, <b>pra que serve</b>,
  <b>onde se usa no mundo real</b> e <b>como cobra</b>. Cada uma tem a prática
  correspondente no terminal simulado do CLImb.</p>
  ${preco}
  <ul class="lista">${itens}</ul>
  ${secaoComandosDoIndice(opts.comandosComPagina, base)}` + rodape(base);
}

// /aprender/<id> que não existe. Vai com status 404 (e NÃO 403, que era o que
// o servidor de estáticos devolvia): buscador precisa saber que o endereço não
// existe, e quem digitou errado precisa de um caminho de volta.
function paginaNaoEncontrada(licoes, opts) {
  opts = opts || {};
  const base = opts.base || "";
  const titulo = "Lição não encontrada — CLImb";
  const descricao = "Esta lição não existe. Veja a lista completa de lições de AWS em português.";
  const ids = Object.keys(licoes).sort((a, b) =>
    String(licoes[a].titulo).localeCompare(String(licoes[b].titulo), "pt-BR")).slice(0, 12);
  const itens = ids.map((id) =>
    `<li><a href="${esc(base)}/aprender/${encodeURIComponent(id)}">` +
    `${esc(licoes[id].emoji || "📚")} ${esc(licoes[id].titulo)}</a></li>`).join("");
  return cabecalho(titulo, descricao, `${base}/aprender`, base) + `
  <h1>Essa lição não existe</h1>
  <p>O endereço que você abriu não corresponde a nenhuma lição. Algumas das que existem:</p>
  <ul class="lista">${itens}</ul>
  <p style="margin-top:18px"><a href="${esc(base)}/aprender" style="color:#58a6ff">Ver todas as lições</a></p>`
    + rodape(base);
}

// URLs pro sitemap: as lições + a página que as lista.
function urlsLicoes(licoes, base) {
  return [`${base}/aprender`].concat(
    Object.keys(licoes).sort().map((id) => `${base}/aprender/${encodeURIComponent(id)}`)
  );
}

module.exports = {
  carregarLicoes, paginaLicao, paginaComando, paginaIndice, paginaNaoEncontrada, urlsLicoes,
  esc, rico, resumir,
};
