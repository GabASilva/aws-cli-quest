"use strict";
// ============================================================
// CLImb — scripts/i18n.js
// Ferramenta dos dicionários i18n/en.json e i18n/es.json (ver lib/i18n.js).
//
//   node scripts/i18n.js pendentes [arquivo.js]
//       lista o que ainda não tem tradução, no formato que o "aplicar" lê
//       (os marcados "talvez" podem ser inglês do Console: decida com "=")
//   node scripts/i18n.js aplicar <traducoes.txt>
//       grava as traduções nos dois dicionários
//   node scripts/i18n.js resumo
//       quanto falta, por arquivo
//
// Formato do arquivo de traduções (um bloco por texto):
//
//   @@ <id>
//   texto em inglês (pode ter várias linhas)
//   ~~
//   texto em espanhol
//
// "@@ <id> =" (sem corpo) quer dizer "fica igual nos três idiomas" — é o caso
// de rótulo do Console da AWS, que o CLImb mostra em inglês de propósito.
// O texto é o CÓDIGO-FONTE do literal: \n, \" e ${0} escritos como no .js.
// ============================================================
const fs = require("fs");
const path = require("path");
const i18n = require("../lib/i18n.js");

const RAIZ = path.join(__dirname, "..");
const ARQ = { en: path.join(RAIZ, "i18n", "en.json"), es: path.join(RAIZ, "i18n", "es.json") };

// Tudo que o app mostra e passa pelo dicionário: os js/, o index.html e as
// mensagens de erro da API (servidor.js).
function fontes() {
  const lista = [];
  for (const f of fs.readdirSync(path.join(RAIZ, "js")).filter((x) => x.endsWith(".js")).sort()) {
    lista.push({ nome: f, itens: () => i18n.extrair(fs.readFileSync(path.join(RAIZ, "js", f), "utf8")) });
  }
  lista.push({ nome: "index.html", itens: () => i18n.extrairHtml(fs.readFileSync(path.join(RAIZ, "index.html"), "utf8")) });
  lista.push({ nome: "servidor.js", itens: () => i18n.extrairServidor(fs.readFileSync(path.join(RAIZ, "servidor.js"), "utf8")) });
  return lista;
}

function lerDic(idioma) {
  try { return i18n.normalizarDic(JSON.parse(fs.readFileSync(ARQ[idioma], "utf8"))); } catch (e) { return {}; }
}
function gravarDic(idioma, dic) {
  const ordenado = {};
  for (const k of Object.keys(dic).sort()) ordenado[k] = dic[k];
  fs.mkdirSync(path.dirname(ARQ[idioma]), { recursive: true });
  fs.writeFileSync(ARQ[idioma], JSON.stringify(ordenado, null, 1) + "\n");
}

// Todo texto traduzível, sem repetição (o mesmo literal em dois arquivos é
// uma entrada só), com o primeiro arquivo onde aparece.
// Texto que aparece em posição de LÓGICA em qualquer lugar (comparação, chave
// de objeto, argumento de includes/indexOf) não é traduzido em lugar nenhum:
// se o "Aprovado" da lista virasse "Approved" e o `=== "Aprovado"` não, a
// comparação quebraria em silêncio. Esses ficam em português (catalogo().logica).
function catalogo() {
  const porChave = new Map();
  const logica = new Set();
  for (const f of fontes()) {
    for (const it of f.itens()) {
      if (it.logica) { logica.add(it.chave); continue; }
      const ja = porChave.get(it.chave);
      if (ja) { if (it.certeza === "pt") ja.certeza = "pt"; continue; }
      porChave.set(it.chave, { chave: it.chave, id: it.id, certeza: it.certeza, arquivo: f.nome });
    }
  }
  for (const k of logica) porChave.delete(k);
  porChave.logica = logica;
  return porChave;
}

// ---------- conferências de uma tradução ----------
function placeholders(t) { return (t.match(/\$\{\d+\}/g) || []).sort().join(","); }
function codigos(t) { return (t.match(/<code>[\s\S]*?<\/code>/g) || []).sort().join("|"); }
function pontas(t) {
  const nl = (x) => (x.replace(/\r/g, "").match(/\n|\\n/g) || []).length;
  const ini = t.match(/^(?:\s|\\n)*/)[0], fim = t.match(/(?:\s|\\n)*$/)[0];
  return [nl(ini), ini.length > 0, nl(fim), fim.length > 0].join();
}
function problemas(chave, trad) {
  const p = [];
  if (placeholders(chave) !== placeholders(trad)) p.push("expressões ${n} diferentes");
  if (codigos(chave) !== codigos(trad)) p.push("<code> diferente (comando não se traduz)");
  const tags = (t) => (t.match(/<\/?[a-z][a-z0-9]*/gi) || []).length;
  if (tags(chave) !== tags(trad)) p.push("número de tags HTML diferente");
  // pedaço de frase concatenada vive das pontas: " ou ", "\n(dica)". Uma
  // quebra a mais vira linha em branco no terminal; um espaço a menos cola
  // a palavra na seguinte.
  if (pontas(chave) !== pontas(trad)) p.push("espaço ou quebra de linha nas pontas diferente");
  return p;
}

function pendentes(arquivo) {
  const en = lerDic("en"), es = lerDic("es");
  const out = [];
  for (const it of catalogo().values()) {
    if (arquivo && it.arquivo !== arquivo) continue;
    if (en[it.chave] != null && es[it.chave] != null) continue;
    out.push("@@ " + it.id + "   [" + it.arquivo + (it.certeza === "talvez" ? ", talvez" : "") + "]\n" + it.chave);
  }
  return out;
}

function comPontasDe(chave, trad) {
  const ini = chave.match(/^\s*/)[0].replace(/\r/g, "");
  const fim = chave.match(/\s*$/)[0].replace(/\r/g, "");
  return ini + trad.replace(/^\s+|\s+$/g, "") + fim;
}

function aplicar(arqTraducoes) {
  const txt = fs.readFileSync(arqTraducoes, "utf8").replace(/\r\n/g, "\n");
  const porId = new Map();
  for (const it of catalogo().values()) porId.set(it.id, it.chave);
  const en = lerDic("en"), es = lerDic("es");
  let ok = 0;
  const erros = [];
  const blocos = txt.split(/^@@ /m).slice(1);
  for (const b of blocos) {
    const nl = b.indexOf("\n");
    const cab = (nl < 0 ? b : b.slice(0, nl)).trim();
    const corpo = nl < 0 ? "" : b.slice(nl + 1);
    const id = cab.split(/\s+/)[0];
    const chave = porId.get(id);
    if (chave == null) { erros.push(id + ": id não existe (o texto mudou?)"); continue; }
    if (/\s=$/.test(cab) || cab.endsWith(" =")) { en[chave] = chave; es[chave] = chave; ok++; continue; }
    const partes = corpo.split(/^~~\s*$/m);
    if (partes.length !== 2) { erros.push(id + ": falta o separador ~~"); continue; }
    // As pontas (espaço e quebra de linha) vêm do ORIGINAL, não do arquivo:
    // editor costuma cortar o espaço do fim da linha, e " ou " virava " or"
    // colado na palavra seguinte (aconteceu em 290 textos).
    const tEn = comPontasDe(chave, partes[0]);
    const tEs = comPontasDe(chave, partes[1]);
    const pb = problemas(chave, tEn).map((x) => "en: " + x).concat(problemas(chave, tEs).map((x) => "es: " + x));
    if (pb.some((x) => /expressões|<code>/.test(x))) { erros.push(id + ": " + pb.join("; ")); continue; }
    if (pb.length) erros.push(id + " (gravado, confira): " + pb.join("; "));
    en[chave] = tEn;
    es[chave] = tEs;
    ok++;
  }
  gravarDic("en", en);
  gravarDic("es", es);
  console.log(ok + " traduções gravadas.");
  if (erros.length) console.log("Atenção:\n  " + erros.join("\n  "));
}

function resumo() {
  const en = lerDic("en"), es = lerDic("es");
  const porArq = {};
  let falta = 0, total = 0, faltaTalvez = 0;
  for (const it of catalogo().values()) {
    const tem = en[it.chave] != null && es[it.chave] != null;
    if (it.certeza === "talvez" && !tem) faltaTalvez++;
    total++;
    if (tem) continue;
    falta++;
    porArq[it.arquivo] = (porArq[it.arquivo] || 0) + 1;
  }
  console.log(`Português: ${total - falta}/${total} traduzidos; faltam ${falta} (${faltaTalvez} deles talvez já sejam inglês).`);
  for (const [f, n] of Object.entries(porArq).sort((a, b) => b[1] - a[1])) console.log("  " + f + ": " + n);
}

module.exports = { catalogo, fontes, lerDic, problemas };

if (require.main === module) {
  const [cmd, a1, a2] = process.argv.slice(2);
  if (cmd === "pendentes") {
    const p = pendentes(a1);
    process.stdout.write(p.join("\n\n") + "\n");
    console.error(p.length + " pendentes");
  } else if (cmd === "aplicar") aplicar(a1);
  else if (cmd === "resumo") resumo();
  else console.log("uso: node scripts/i18n.js pendentes [arquivo.js] | aplicar <arq> | resumo");
}
