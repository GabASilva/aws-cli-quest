"use strict";
// ============================================================
// CLImb — lib/i18n.js
// O app em inglês e espanhol SEM reescrever o app: o servidor entrega cada
// arquivo JS com os textos já trocados, a partir de um dicionário
// (i18n/en.json, i18n/es.json) cuja chave é o literal EXATO do código-fonte.
//
// POR QUE ASSIM, e não t("chave") no código: são ~120 arquivos e mais de 130
// mil palavras escritas direto em strings e templates. Trocar cada uma por uma
// chamada seria reescrever o app inteiro (e o CLAUDE.md proíbe reescrever
// app.js/jogo.js/simulador.js). Trocando o literal no texto servido, o código
// que roda é o mesmo nos três idiomas — só muda o que está entre aspas.
//
// O que NÃO é traduzido (de propósito):
//   - a `solucao` das atividades: é o comando que o aluno digita;
//   - chave de objeto ("x": ...) e literal comparado (===, case): é lógica;
//   - qualquer literal fora do dicionário (identificador, saída da AWS, etc.).
// O teste/idiomas.js confere que todo literal em português tem as duas
// traduções, e roda o fumaça sobre o código JÁ traduzido: se uma tradução
// quebrar um validador, ele acusa.
// ============================================================
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const IDIOMAS = ["pt", "en", "es"];
const RAIZ = path.join(__dirname, "..");

// ---------- léxico ----------
// Acha todos os literais de texto ("..." '...' `...`) de um arquivo JS,
// respeitando comentário, regex e template aninhado. Não é um parser completo:
// só precisa saber onde começa e termina cada literal.
const PALAVRAS_ANTES_DE_REGEX = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new",
  "delete", "void", "throw", "instanceof", "yield", "await"]);

function lexar(src) {
  const literais = [];
  let i = 0;
  // último token significativo: decide se "/" abre regex ou é divisão
  let ultimo = null; // {t: 'p'|'id'|'num'|'lit', v}
  const pilha = []; // dentro de ${...}: guarda o template dono e a profundidade de chaves

  function regexPermitida() {
    if (!ultimo) return true;
    if (ultimo.t === "lit" || ultimo.t === "num") return false;
    if (ultimo.t === "id") return PALAVRAS_ANTES_DE_REGEX.has(ultimo.v);
    return !(ultimo.v === ")" || ultimo.v === "]" || ultimo.v === "}");
  }

  function lerString(q) {
    const ini = i;
    i++;
    while (i < src.length) {
      const c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === q) break;
      if (c === "\n") break; // string quebrada: não deveria existir
      i++;
    }
    i++;
    literais.push({ tipo: "str", q, ini, fim: i, dentro: pilha.length > 0 });
    ultimo = { t: "lit" };
  }

  // Lê um template a partir do ` (ou a continuação depois de um `}`).
  function lerTemplate(tpl) {
    // tpl.partes: [{ini, fim}] trechos de texto; tpl.exprs: [{ini, fim}]
    let ini = i;
    while (i < src.length) {
      const c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "`") {
        tpl.partes.push({ ini, fim: i });
        i++;
        tpl.fim = i;
        literais.push(tpl);
        ultimo = { t: "lit" };
        return;
      }
      if (c === "$" && src[i + 1] === "{") {
        tpl.partes.push({ ini, fim: i });
        i += 2;
        tpl.exprs.push({ ini: i, fim: -1 });
        pilha.push({ tpl, chaves: 0 });
        ultimo = { t: "p", v: "{" };
        return; // volta pro laço principal, que lê a expressão
      }
      i++;
    }
    throw new Error("template sem fim na posição " + tpl.ini);
  }

  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { const f = src.indexOf("*/", i + 2); i = f < 0 ? src.length : f + 2; continue; }
    if (c === '"' || c === "'") { lerString(c); continue; }
    if (c === "`") {
      const tpl = { tipo: "tpl", ini: i, fim: -1, partes: [], exprs: [], dentro: pilha.length > 0 };
      i++;
      lerTemplate(tpl);
      continue;
    }
    if (c === "/" && regexPermitida()) {
      const iniRe = i;
      i++;
      let classe = false;
      while (i < src.length) {
        const r = src[i];
        if (r === "\\") { i += 2; continue; }
        if (r === "[") classe = true;
        else if (r === "]") classe = false;
        else if (r === "/" && !classe) break;
        else if (r === "\n") break;
        i++;
      }
      i++;
      while (i < src.length && /[a-z]/i.test(src[i])) i++;
      if (lexar.regexes) lexar.regexes.push(src.slice(iniRe, i));
      ultimo = { t: "lit" };
      continue;
    }
    if (/[A-Za-z_$À-￿]/.test(c)) {
      const ini = i;
      while (i < src.length && /[\w$À-￿]/.test(src[i])) i++;
      ultimo = { t: "id", v: src.slice(ini, i) };
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(d))) {
      while (i < src.length && /[\w.]/.test(src[i])) i++;
      ultimo = { t: "num" };
      continue;
    }
    // pontuação
    if (pilha.length) {
      const topo = pilha[pilha.length - 1];
      if (c === "{") topo.chaves++;
      else if (c === "}") {
        if (topo.chaves === 0) {
          // fim do ${...}: volta pro texto do template
          pilha.pop();
          topo.tpl.exprs[topo.tpl.exprs.length - 1].fim = i;
          i++;
          lerTemplate(topo.tpl);
          continue;
        }
        topo.chaves--;
      }
    }
    ultimo = { t: "p", v: c };
    i++;
  }
  if (pilha.length) throw new Error("expressão de template sem fim");
  return literais.sort((a, b) => a.ini - b.ini);
}

// ---------- chave de cada literal ----------
// String: o texto cru entre as aspas. Template: os trechos de texto com as
// expressões trocadas por ${0}, ${1}... (a tradução usa os mesmos números, e
// na hora de aplicar a expressão original — já traduzida — volta pro lugar).
// O fim de linha não faz parte da chave: o mesmo arquivo sai com CRLF num
// checkout do Windows (core.autocrlf) e com LF no git/Docker. Sem normalizar,
// a tradução de um template de várias linhas some em silêncio.
function semCR(s) {
  return s.replace(/\r\n?/g, "\n");
}

function chaveDe(src, lit) {
  if (lit.tipo === "str") return src.slice(lit.ini + 1, lit.fim - 1);
  let k = "";
  lit.partes.forEach((p, n) => {
    k += src.slice(p.ini, p.fim);
    if (n < lit.exprs.length) k += "${" + n + "}";
  });
  return semCR(k);
}

function idDe(chave) {
  return crypto.createHash("sha1").update(chave).digest("hex").slice(0, 10);
}

// ---------- é português? ----------
const PARADAS = new Set(("de da do das dos que não nao para pra com uma um você voce seu sua seus suas é e o à " +
  "os em na nos nas por se mais ao aos isso este esta essa esse aqui como sem já ou quando ainda cada " +
  "também só tem ser foi está estão são pelo pela pelos pelas nem mas porque sobre entre até depois antes " +
  "agora então ela ele eles elas lhe te nós dele dela vai vão fazer feito faz pode precisa precisam " +
  "num numa onde qual quais quem tudo todo toda todos todas nada outro outra mesmo mesma bem muito pouco " +
  "seja aqui ali lá também cria crie use veja tente digite rode clique").split(" "));
const ACENTO = /[áàâãéêíóôõúüç]/i;
const SUFIXOS = /(ar|er|ir|ando|endo|indo|ado|ada|ados|adas|ido|ida|idos|idas|dade|agem|eiro|eira|oso|osa|mente|inho|inha|ivo|iva|amos|emos|imos|aram|eram|iram)$/;
// palavras inglesas (do console e da saída da AWS) que batem nas terminações acima
const INGLES = new Set(("bar car star similar regular solar calendar popular clear year near dear user users " +
  "after other number never server error filter cluster container order parameter header folder layer " +
  "provider owner docker register trigger peer master power water identifier manager answer ever over " +
  "under whether either rather offer transfer cover customer computer timer buffer letter worker poller " +
  "tier per her for door floor four your our hour pair fair chair air repair stair affair " +
  "sir fir stir first dir mkdir rmdir their weird " +
  "loaded added created updated deleted failed succeeded started stopped enabled disabled attached " +
  "detached deployed expired allowed denied provided needed used based named shared managed signed " +
  "trusted encrypted reserved required applied submitted registered accepted rejected scheduled " +
  "completed succeeded imported exported archived restored associated authorized authenticated " +
  "launched terminated selected uploaded downloaded tagged rotated cached hosted mounted sized " +
  "exceeded skipped specified limited unlimited estimated validated invalid valid acid rapid fluid " +
  "android liquid hybrid grid id ids paid said laid raid aid " +
  "commando pending sending ending descending ascending legend " +
  "lambda data metadata ada nevada agenda panda canada armada " +
  "range image message page storage usage package language manage village garage average " +
  "passive active native massive positive negative relative creative " +
  "city capacity identity entity quantity velocity density " +
  "rose close dose purpose suppose expose compose chose whose loose " +
  "mentioned cement element statement payment environment deployment management agreement").split(" "));

function textoVisivel(chave) {
  return chave
    .replace(/\/\*[\s\S]*?\*\//g, " ") // comentário de CSS dentro de template
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\$\{\d+\}/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\\[nt]/g, " ");
}

// "pt" quando é certo que é português (acento, palavra de ligação, terminação
// típica); "talvez" quando é texto mas pode ser inglês (rótulo do Console,
// saída da AWS); null quando não é texto (id, URL, seletor, classe CSS).
function pareceTexto(chave) {
  const t = textoVisivel(chave);
  if (!/[a-zà-ú]{2,}/i.test(t)) return null;
  // folha de estilo dentro de template (CAPA_ESTILO, estilos injetados):
  // seletores e propriedades, sem texto pro usuário
  if (!/</.test(t) && /\{[^{}]*:[^{}]*;[^{}]*\}/.test(t)) return null;
  // seletor CSS ("#sidebar .servico", "[data-fechar]", "body > header"),
  // diretiva e lista de classes ("linha bv-ajuda")
  const cru = chave.trim();
  if (/^[#.[]/.test(cru) || /\[data-[\w-]+\]/.test(cru) || (/^[a-z]+(\s*[>,]\s*[a-z.#[][\w.#[\]="'-]*)+$/.test(cru) && /[.#[>]/.test(cru))) return null;
  if (cru === "use strict") return null;
  if (/^[a-z0-9]+(?:\s+[a-z0-9]+-[a-z0-9-]+)+$/.test(cru)) return null;
  const so = chave.trim();
  // URL, caminho, seletor, chave de storage, classe CSS: não é texto
  // (palavra única com maiúscula — "Continuar", "Agilidade" — passa: é rótulo)
  // Palavra solta com espaço em volta (" atividades", "trilhas ") é pedaço de
  // frase montada por concatenação: passa também.
  const pedaco = /^\s|\s$/.test(chave) && /^[a-zà-ú]+$/i.test(so);
  if (/^[\w.:/#?=&%-]*$/.test(so) && !ACENTO.test(so) && !/^[A-Z][a-z]+[.!:]?$/.test(so) && !pedaco) return null;
  if (ACENTO.test(t)) return "pt";
  const palavras = t.toLowerCase().match(/[a-zà-ú]+/g) || [];
  if (palavras.some((p) => PARADAS.has(p))) return "pt";
  if (/^An error occurred/.test(so)) return null; // erro literal da AWS, em inglês
  // sem acento e sem palavra de ligação: reconhece pela terminação típica do
  // português (Adicionar, Abrindo, Agilidade, Criado, mensagem...)
  if (palavras.some((p) => p.length > 3 && SUFIXOS.test(p) && !INGLES.has(p))) return "pt";
  // daqui pra baixo só sobra o que pode ser inglês; o que é claramente código
  // (comando, JSON, cookie, media query, saída de terminal) nem entra na lista
  if (/^\s*(aws|climb|sudo|cat|ls|cd|echo|grep|kubectl|docker|git)\s/.test(so) || /(^|\s)--[a-z]/.test(so)) return null;
  if (/"[\w-]+"\s*:/.test(so) || /=[^=]*;/.test(so) || /^\(.*:.*\)$/.test(so)) return null;
  if (/^\d{4}-\d\d-\d\d/.test(so) || /^[a-z_]+:\s/.test(so) || /^<span class="p">/.test(so)) return null;
  return "talvez";
}

// ---------- contexto: onde o literal NÃO pode mudar ----------
function intervalosDeSolucao(src) {
  const { fimDoLiteral } = require("./sem-gabarito");
  const fora = [];
  const re = /(^|[,{])\s*solucao\s*:\s*\[/gm;
  let m;
  while ((m = re.exec(src))) {
    const abre = src.indexOf("[", m.index + m[1].length);
    const fecha = fimDoLiteral(src, abre);
    if (fecha > 0) fora.push([abre, fecha]);
  }
  // construtor posicional d(id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar):
  // o SEGUNDO array de primeiro nível é a solução
  const rd = /(?:^|[^\w$.])d\(\s*"/g;
  while ((m = rd.exec(src))) {
    const abre = src.indexOf("(", m.index);
    const fecha = fimDoLiteral(src, abre);
    if (fecha < 0) continue;
    let nivel = 0, arrays = 0;
    for (let i = abre + 1; i < fecha; i++) {
      const c = src[i];
      if (c === '"' || c === "'" || c === "`") {
        const q = c; i++;
        while (i < fecha) { if (src[i] === "\\") { i += 2; continue; } if (src[i] === q) break; i++; }
        continue;
      }
      if (c === "(" || c === "{") { nivel++; continue; }
      if (c === ")" || c === "}") { nivel--; continue; }
      if (c === "[" && nivel === 0) {
        const fim = fimDoLiteral(src, i);
        if (fim < 0) break;
        arrays++;
        if (arrays === 2) { fora.push([i, fim]); break; }
        i = fim;
      }
    }
  }
  return fora;
}

// O literal está numa posição de lógica? (chave de objeto, comparação, case)
function contextoDeLogica(src, lit) {
  let a = lit.ini - 1;
  while (a >= 0 && /\s/.test(src[a])) a--;
  let d = lit.fim;
  while (d < src.length && /\s/.test(src[d])) d++;
  const antes = src.slice(Math.max(0, a - 3), a + 1);
  const depois = src.slice(d, d + 3);
  if (src[d] === ":" && (src[a] === "{" || src[a] === ",")) return "chave";
  if (/[=!]==?$/.test(antes) || /^[=!]==?/.test(depois)) return "comparação";
  if (/\bcase$/.test(src.slice(Math.max(0, a - 4), a + 1))) return "case";
  // argumento de busca/troca: o texto procurado é dado, não interface
  // (linha.includes("<id-da-inst"), conteudo.includes("Estudar Linux"))
  const trecho = src.slice(Math.max(0, a - 16), a + 1);
  if (/(\.(includes|startsWith|endsWith|indexOf|lastIndexOf|match|split|replace|replaceAll|search)|new RegExp)\($/.test(trecho)) return "busca";
  return null;
}

// Todos os literais traduzíveis de um arquivo, com o contexto de cada um.
function extrair(src) {
  if (ignorado(src)) return [];
  const lits = lexar(src);
  const sol = intervalosDeSolucao(src);
  const naSolucao = (p) => sol.some(([a, b]) => p > a && p < b);
  const saida = [];
  for (const lit of lits) {
    const chave = chaveDe(src, lit);
    const certeza = pareceTexto(chave);
    if (!certeza) continue;
    if (naSolucao(lit.ini)) continue;
    const logica = contextoDeLogica(src, lit);
    saida.push({ chave, id: idDe(chave), ini: lit.ini, fim: lit.fim, tipo: lit.tipo, logica, certeza });
  }
  return saida;
}

// ---------- aplicar ----------
// Escapa, na tradução, a aspa que fecharia o literal (o tradutor escreve
// "don't" sem pensar que a string original era '...').
function escaparPara(texto, q) {
  let out = "";
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === "\\") { out += c + (texto[i + 1] || ""); i++; continue; }
    if (c === q) { out += "\\" + c; continue; }
    if (q !== "`" && c === "\n") { out += "\\n"; continue; }
    out += c;
  }
  return out;
}

function traduzirTexto(src, dic, opcoes) {
  if (!dic || ignorado(src)) return src;
  const lits = lexar(src);
  const sol = intervalosDeSolucao(src);
  const naSolucao = (p) => sol.some(([a, b]) => p > a && p < b);
  const estat = opcoes && opcoes.estat;

  // Monta o texto de um trecho [de, ate) trocando os literais de primeiro
  // nível que caem nele; templates trocam também dentro das expressões.
  let k = 0; // índice no vetor ordenado de literais
  function trecho(de, ate) {
    let out = "";
    let pos = de;
    while (k < lits.length && lits[k].ini < ate) {
      const lit = lits[k];
      if (lit.ini < pos) { k++; continue; }
      out += src.slice(pos, lit.ini);
      k++;
      out += literal(lit);
      pos = lit.fim;
    }
    return out + src.slice(pos, ate);
  }

  function literal(lit) {
    const chave = chaveDe(src, lit);
    const trad = dic[chave];
    const pode = trad != null && trad !== chave && !naSolucao(lit.ini) && !contextoDeLogica(src, lit);
    if (lit.tipo === "str") {
      if (!pode) return src.slice(lit.ini, lit.fim);
      if (estat) estat.trocados++;
      return lit.q + escaparPara(trad, lit.q) + lit.q;
    }
    // template: as expressões são traduzidas recursivamente
    const exprs = lit.exprs.map((e) => trecho(e.ini, e.fim));
    if (!pode) {
      let out = "`";
      lit.partes.forEach((p, n) => {
        out += src.slice(p.ini, p.fim);
        if (n < exprs.length) out += "${" + exprs[n] + "}";
      });
      return out + "`";
    }
    if (estat) estat.trocados++;
    const corpo = escaparPara(trad.replace(/\$\{(\d+)\}/g, "\u0000$1\u0001"), "`")
      .replace(/\$\{/g, "\\${")
      .replace(/\u0000(\d+)\u0001/g, (m, n) => "${" + exprs[Number(n)] + "}");
    return "`" + corpo + "`";
  }

  return trecho(0, src.length);
}

// ---------- HTML (index.html) ----------
// Troca o texto entre tags e os atributos que o usuário lê (title, aria-label,
// placeholder, alt). Nunca mexe dentro de <script> ou <style>.
const ATRIBUTOS_TEXTO = /\b(title|aria-label|placeholder|alt|data-dica)="([^"]*)"/g;

function pedacosHtml(html, cada) {
  // cada({tipo:"texto"|"attr", valor, ini, fim}) -> substituto ou undefined
  let out = "";
  let pos = 0;
  const re = /<(script|style)\b[\s\S]*?<\/\1>|<[^>]+>/gi;
  let m;
  const texto = (de, ate) => {
    const bruto = html.slice(de, ate);
    const t = bruto.trim();
    if (!t) return bruto;
    const novo = cada({ tipo: "texto", valor: t });
    return novo == null ? bruto : bruto.replace(t, novo);
  };
  while ((m = re.exec(html))) {
    out += texto(pos, m.index);
    let tag = m[0];
    if (!/^<(script|style)/i.test(tag)) {
      tag = tag.replace(ATRIBUTOS_TEXTO, (todo, nome, valor) => {
        const novo = valor.trim() ? cada({ tipo: "attr", valor }) : null;
        return novo == null ? todo : nome + '="' + novo.replace(/"/g, "&quot;") + '"';
      });
    }
    out += tag;
    pos = m.index + m[0].length;
  }
  return out + texto(pos, html.length);
}

function extrairHtml(html) {
  const saida = [];
  pedacosHtml(html, ({ valor }) => {
    const chave = semCR(valor);
    const certeza = pareceTexto(chave);
    if (certeza) saida.push({ chave, id: idDe(chave), tipo: "html", certeza, logica: null });
  });
  return saida;
}

function traduzirHtml(html, dic) {
  if (!dic) return html;
  return pedacosHtml(html, ({ valor }) => {
    const t = dic[semCR(valor)];
    return t != null && t !== semCR(valor) ? t : undefined;
  });
}

// ---------- mensagens do servidor ----------
// O erro que a API devolve ({ erro: "..." }) é texto pronto, não código: aqui
// a troca é pelo valor. Mensagem montada com template (`Faltam ${n} dias`)
// casa por padrão: ${0} vira um grupo de captura.
const cachePadroes = {};
function traduzirMensagem(texto, idioma, chavesDoServidor) {
  const dic = dicionario(idioma);
  if (!dic || typeof texto !== "string") return texto;
  if (dic[texto] != null) return dic[texto];
  if (!cachePadroes[idioma]) {
    cachePadroes[idioma] = (chavesDoServidor || [])
      .filter((k) => /\$\{\d+\}/.test(k) && dic[k] != null)
      .map((k) => ({
        re: new RegExp("^" + k.split(/\$\{\d+\}/).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("([\\s\\S]*?)") + "$"),
        ordem: (k.match(/\$\{(\d+)\}/g) || []).map((x) => Number(x.slice(2, -1))),
        trad: dic[k],
      }));
  }
  for (const p of cachePadroes[idioma]) {
    const m = texto.match(p.re);
    if (!m) continue;
    const valores = {};
    p.ordem.forEach((n, i) => { valores[n] = m[i + 1]; });
    return p.trad.replace(/\$\{(\d+)\}/g, (x, n) => valores[n] != null ? valores[n] : "");
  }
  return texto;
}

// Os literais do servidor.js que viram mensagem pro usuário: valor de `erro:`,
// `detalhe:` e `msg:`. O resto do servidor (log, e-mail pro Gabriel) fica em
// português.
function extrairServidor(src) {
  const saida = [];
  for (const lit of lexar(src)) {
    let a = lit.ini - 1;
    while (a >= 0 && /\s/.test(src[a])) a--;
    if (src[a] !== ":") continue;
    const antes = src.slice(Math.max(0, a - 10), a);
    if (!/\b(erro|detalhe|msg)\s*$/.test(antes)) continue;
    const chave = chaveDe(src, lit);
    const certeza = pareceTexto(chave);
    if (certeza) saida.push({ chave, id: idDe(chave), tipo: lit.tipo, certeza, logica: null });
  }
  return saida;
}

// Arquivo com esta marca não passa pelo dicionário: é o caso do js/idioma.js,
// que já traz os três idiomas lado a lado (traduzir o "pt" dele quebraria).
const MARCA_IGNORAR = "i18n: ignorar-arquivo";
function ignorado(src) {
  return src.slice(0, 2000).includes(MARCA_IGNORAR);
}

// ---------- dicionários ----------
const cacheDic = {};
function dicionario(idioma) {
  if (!idioma || idioma === "pt") return null;
  if (cacheDic[idioma]) return cacheDic[idioma];
  const arq = path.join(RAIZ, "i18n", idioma + ".json");
  cacheDic[idioma] = normalizarDic(fs.existsSync(arq) ? JSON.parse(fs.readFileSync(arq, "utf8")) : {});
  return cacheDic[idioma];
}

// Chave e tradução sem CR (ver semCR).
function normalizarDic(dic) {
  const out = {};
  for (const [k, v] of Object.entries(dic)) out[semCR(k)] = typeof v === "string" ? semCR(v) : v;
  return out;
}

function normalizarIdioma(x) {
  const v = String(x || "").toLowerCase().slice(0, 2);
  return IDIOMAS.includes(v) ? v : "pt";
}

module.exports = {
  IDIOMAS, lexar, chaveDe, idDe, pareceTexto, extrair, traduzirTexto, dicionario,
  normalizarIdioma, normalizarDic, semCR, escaparPara, contextoDeLogica, intervalosDeSolucao,
  extrairHtml, traduzirHtml, traduzirMensagem, extrairServidor, ignorado, MARCA_IGNORAR,
};
