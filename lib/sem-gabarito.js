"use strict";
// ============================================================
// CLImb — lib/sem-gabarito.js
// Tira `dicas` e `solucao` do JavaScript de conteúdo que o navegador baixa, e
// devolve esses campos por dois canais separados: as atividades ABERTAS num
// arquivo público, as PAGAS numa rota que exige licença.
//
// POR QUE EXISTE: o app é client-side, então até 17/09/2026 um `curl` em
// https://climb.dev.br/js/servicos-fase2.js devolvia 41 soluções de atividades
// Pro — sem login, sem nada. O bloqueio do licenca.js roda no cliente, e o
// cliente é a máquina de quem está olhando.
//
// O QUE SAI e o QUE FICA (decisão de produto, não de segurança):
//   sai   → `dicas` e `solucao`: é o gabarito, é o que se vende.
//   fica  → id, título, enunciado, nível, XP: é vitrine, e as páginas de
//           /aprender publicam o enunciado de propósito (é o que o Google
//           indexa). Fica o handler do comando e o manual: sem eles o terminal
//           perderia comandos e trilhas sairiam da lista lateral.
//   fica  → `validar`. Medido antes de decidir: 35 dos 556 validadores usam
//           helpers do escopo do próprio arquivo (`bkt`, `sg`, `rep`...), então
//           serializá-los quebraria 6% das atividades. E sem dica e sem
//           solução, o validador sozinho não entrega nada — ele só confere.
//
// POR QUE REMOVER TUDO E DEVOLVER DEPOIS, em vez de remover só as pagas:
// a primeira versão cortava por `id: "..."` no texto e cobria 306 das 397
// pagas. As 91 restantes vinham de três arquivos que geram o id em LOOP
// (`missoes.js` faz `d.id = "tr-" + (i + 1)`), então o id não existe no texto
// pra casar. Remover o gabarito inteiro não depende de identificar ninguém: o
// merge acontece depois, por id, quando os ids já existem.
// ============================================================

// Acha o fim de um literal que começa em `abre`, respeitando string, template,
// comentário e regex — que é onde uma contagem ingênua de colchetes se perde
// (um `]` dentro de "s3://x[1]" não fecha nada).
function fimDoLiteral(txt, abre) {
  const par = { "[": "]", "{": "}", "(": ")" };
  const fecha = par[txt[abre]];
  if (!fecha) return -1;
  let nivel = 0;
  for (let i = abre; i < txt.length; i++) {
    const c = txt[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < txt.length) {
        if (txt[i] === "\\") { i += 2; continue; }
        if (txt[i] === q) break;
        i++;
      }
      continue;
    }
    if (c === "/" && txt[i + 1] === "/") { while (i < txt.length && txt[i] !== "\n") i++; continue; }
    if (c === "/" && txt[i + 1] === "*") { i = txt.indexOf("*/", i); if (i < 0) return -1; i++; continue; }
    if (c === txt[abre]) nivel++;
    else if (c === fecha) { nivel--; if (nivel === 0) return i; }
  }
  return -1;
}

// Remove todo `dicas: [...]` e `solucao: [...]` do texto. Só casa quando o
// campo está em posição de chave de objeto (depois de `{`, `,` ou início de
// linha), pra não pegar `d.solucao.map(...)` de código.
function tirarGabarito(texto) {
  const alvos = [];
  const re = /(^|[,{])(\s*)(dicas|solucao)(\s*):(\s*)\[/gm;
  let m;
  while ((m = re.exec(texto))) {
    const abre = texto.indexOf("[", m.index + m[1].length);
    const fecha = fimDoLiteral(texto, abre);
    if (fecha < 0) continue;
    let ate = fecha + 1;
    // leva a vírgula que sobra, pra não deixar `{ , titulo: ... }`
    let j = ate;
    while (j < texto.length && /\s/.test(texto[j])) j++;
    if (texto[j] === ",") ate = j + 1;
    alvos.push({ de: m.index + m[1].length, ate, campo: m[3] });
    re.lastIndex = fecha;
  }
  let saida = texto;
  for (const a of alvos.slice().reverse()) saida = saida.slice(0, a.de) + saida.slice(a.ate);

  // Segundo padrão: construtor posicional. O desafios-pratica.js declara
  //   function d(id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar)
  // e chama d("ps3-mb1", "s3", 1, 40, "...", "...", ["dica"], ["aws s3 mb ..."], v).
  // Aqui o gabarito não é `campo: [...]`, são os argumentos 7 e 8 — o corte de
  // cima não o enxergava e 44 atividades continuavam com dica e solução no
  // texto servido. Trocamos os arrays por `null` (e não removemos): argumento
  // posicional que muda de posição viraria outro campo.
  const extra = trocarArgumentosPorNull(saida);
  return { texto: extra.texto, removidos: alvos.length + extra.trocados };
}

function trocarArgumentosPorNull(texto) {
  let saida = texto;
  let trocados = 0;
  const re = /(?:^|[^\w$.])d\(\s*"/g;
  const chamadas = [];
  let m;
  while ((m = re.exec(saida))) {
    const abre = saida.indexOf("(", m.index);
    const fecha = fimDoLiteral(saida, abre);
    if (fecha > 0) chamadas.push([abre, fecha]);
  }
  // de trás pra frente: cada troca muda o tamanho do texto adiante
  for (const [abre, fecha] of chamadas.reverse()) {
    const arrays = [];
    let nivel = 0;
    for (let i = abre + 1; i < fecha; i++) {
      const c = saida[i];
      if (c === '"' || c === "'" || c === "`") {
        const q = c; i++;
        while (i < fecha) { if (saida[i] === "\\") { i += 2; continue; } if (saida[i] === q) break; i++; }
        continue;
      }
      if (c === "(" || c === "{") { nivel++; continue; }
      if (c === ")" || c === "}") { nivel--; continue; }
      if (c === "[" && nivel === 0) {
        const fim = fimDoLiteral(saida, i);
        if (fim > 0 && fim < fecha) { arrays.push([i, fim]); i = fim; }
      }
    }
    for (const [de, ate] of arrays.reverse()) {
      saida = saida.slice(0, de) + "null" + saida.slice(ate + 1);
      trocados++;
    }
  }
  return { texto: saida, trocados };
}

// O gabarito de uma lista de atividades, como dados puros (sem função, então
// serializa em JSON e não depende de escopo nenhum).
function gabaritoDe(desafios) {
  const mapa = {};
  for (const d of desafios) {
    const g = {};
    if (Array.isArray(d.dicas) && d.dicas.length) g.dicas = d.dicas;
    if (Array.isArray(d.solucao) && d.solucao.length) g.solucao = d.solucao;
    if (Object.keys(g).length) mapa[d.id] = g;
  }
  return mapa;
}

// O script que o cliente executa pra devolver o gabarito aos objetos. É JS (e
// não JSON) porque entra por <script src> do próprio domínio — o que a CSP
// deste projeto permite, sem precisar afrouxar script-src.
function scriptDeGabarito(mapa, rotulo) {
  return "/* CLImb — gabarito " + rotulo + ", gerado pelo servidor */\n" +
    '"use strict";\n' +
    "(function () {\n" +
    "  var g = " + JSON.stringify(mapa) + ";\n" +
    "  if (typeof window.aplicarGabarito === 'function') window.aplicarGabarito(g, " +
    JSON.stringify(rotulo) + ");\n" +
    "  else { window.__gabaritoPendente = window.__gabaritoPendente || []; window.__gabaritoPendente.push([g, " +
    JSON.stringify(rotulo) + "]); }\n" +
    "})();\n";
}

module.exports = { tirarGabarito, gabaritoDe, scriptDeGabarito, fimDoLiteral };
