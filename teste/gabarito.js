"use strict";
// Teste do corte de gabarito (node teste/gabarito.js).
//
// O servidor não entrega `dicas`/`solucao` no JavaScript de conteúdo: ele
// remove os dois de tudo e devolve por dois canais — público (atividades
// abertas) e autenticado (pagas). Ver lib/sem-gabarito.js.
//
// Este teste confere as três coisas que podem dar errado:
//   1. o corte quebrar a sintaxe de algum arquivo;
//   2. sobrar gabarito no que vai pro cliente (vazamento);
//   3. o ciclo remover→devolver não reproduzir o original (dano ao conteúdo).
//
// Rode junto do fumaça e do análise antes de qualquer commit que toque
// lib/sem-gabarito.js, lib/conteudo-app.js ou os arquivos de atividades.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const raiz = path.join(__dirname, "..");
const sg = require(path.join(raiz, "lib", "sem-gabarito.js"));
const conteudoApp = require(path.join(raiz, "lib", "conteudo-app.js"));
const licencaPub = require(path.join(raiz, "lib", "licenca-servidor.js"));

let falhas = 0;
const erro = (msg) => { console.log("✗ " + msg); falhas++; };

// ---------- 1. corte não quebra sintaxe, e não sobra nada ----------
const textos = {};
let removidos = 0;
for (const f of conteudoApp.ARQUIVOS) {
  const bruto = fs.readFileSync(path.join(raiz, "js", f), "utf8");
  const r = sg.tirarGabarito(bruto);
  try { new vm.Script(r.texto, { filename: f }); }
  catch (e) { erro("sintaxe quebrada em " + f + ": " + e.message.slice(0, 70)); continue; }
  if (/(^|[,{])\s*(dicas|solucao)\s*:\s*\[/m.test(r.texto)) erro("sobrou gabarito em " + f);
  textos[f] = r.texto;
  removidos += r.removidos;
}
console.log("corte: " + removidos + " campos removidos em " + conteudoApp.ARQUIVOS.length + " arquivos, sintaxe OK");

// ---------- 2. nada vaza pro cliente ----------
const original = conteudoApp.carregar(raiz);
const publico = conteudoApp.carregarDeTextos(textos);

if (publico.desafios.length !== original.desafios.length) {
  erro("o corte mudou a quantidade de atividades: " + original.desafios.length + " -> " + publico.desafios.length);
}
const comGabarito = publico.desafios.filter((d) => d.dicas || d.solucao);
if (comGabarito.length) {
  erro(comGabarito.length + " atividades ainda trazem gabarito (ex.: " + comGabarito.slice(0, 3).map((d) => d.id).join(", ") + ")");
} else {
  console.log("vazamento: nenhuma das " + publico.desafios.length + " atividades chega ao cliente com dica ou solução");
}

// ---------- 3. remover e devolver reproduz o original ----------
const abertos = licencaPub.idsAbertos(original.desafios);
const gabAberto = sg.gabaritoDe(original.desafios.filter((d) => abertos.has(d.id)));
const gabPago = sg.gabaritoDe(original.desafios.filter((d) => !abertos.has(d.id)));
console.log("gabarito: " + Object.keys(gabAberto).length + " atividades abertas (público) + " +
  Object.keys(gabPago).length + " pagas (autenticado)");

const porId = {};
for (const d of publico.desafios) porId[d.id] = d;
let iguais = 0;
for (const o of original.desafios) {
  const p = porId[o.id];
  if (!p) { erro("atividade sumiu no corte: " + o.id); continue; }
  // devolve o gabarito, como o cliente faria
  const g = gabAberto[o.id] || gabPago[o.id] || {};
  const reconstruido = Object.assign({}, p, g);
  for (const campo of ["titulo", "descricao", "servico", "nivel", "xp", "tipo", "dicas", "solucao"]) {
    if (JSON.stringify(o[campo]) !== JSON.stringify(reconstruido[campo])) {
      erro("campo '" + campo + "' não voltou igual em " + o.id);
    }
  }
  if (typeof o.validar === "function" && typeof p.validar !== "function") erro("validador sumiu: " + o.id);
  iguais++;
}
console.log("ciclo: " + iguais + " atividades reconstruídas idênticas ao original");

// ---------- 4. a divisão aberto/pago bate com a regra do app ----------
const GRATIS = licencaPub.SERVICOS_GRATIS;
// o Desafio do dia abre 3 atividades extras de propósito (ontem/hoje/amanhã,
// porque o servidor não conhece o fuso de quem abre o app) — não contam aqui
const doDia = licencaPub.idsDoDesafioDoDia(original.desafios);
const forade = original.desafios.filter((d) =>
  abertos.has(d.id) && !GRATIS.includes(d.servico) && !doDia.has(d.id));
const porTrilha = {};
for (const d of forade) porTrilha[d.servico] = (porTrilha[d.servico] || 0) + 1;
const errados = Object.entries(porTrilha).filter(([, n]) => n > licencaPub.GRATIS_POR_TRILHA);
if (errados.length) erro("trilha paga com mais de " + licencaPub.GRATIS_POR_TRILHA + " atividades abertas: " + JSON.stringify(errados));
else console.log("regra: trilhas grátis inteiras + " + licencaPub.GRATIS_POR_TRILHA + " primeiras das pagas");

// ---------- 5. o TEXTO servido não contém as soluções pagas ----------
// Esta é a checagem que de fato prova o ponto: as de cima olham os objetos
// carregados, e um vazamento pode estar no texto sem chegar ao objeto — foi o
// caso do desafios-pratica.js, que passa dica e solução como ARGUMENTO de uma
// função construtora, deixando 44 atividades com o gabarito inteiro no arquivo
// servido enquanto o objeto parecia limpo.
const tudoServido = conteudoApp.ARQUIVOS.map((f) => textos[f] || "").join("\n");

// Comparar por presença dava falso positivo, e por três motivos legítimos: o
// mesmo comando está no verbete do manual, na mensagem de uso do simulador
// ("uso: aws lambda invoke --function-name <nome> ...") e na descrição de outra
// atividade — tudo público de propósito. O que prova o corte é a CONTAGEM: se
// a ocorrência do gabarito saiu, o texto servido tem uma a menos que o original.
const tudoOriginal = conteudoApp.ARQUIVOS
  .map((f) => fs.readFileSync(path.join(raiz, "js", f), "utf8")).join("\n");
const quantas = (texto, agulha) => texto.split(agulha).length - 1;

let vazadas = 0;
for (const d of original.desafios) {
  if (abertos.has(d.id)) continue;
  for (const linha of (d.solucao || [])) {
    const t = String(linha);
    if (t.length < 16) continue; // curta demais pra ser prova de vazamento
    // Solução com aspas dentro (o JSON do put-item) aparece escapada no
    // arquivo, então busca literal não acha nem no original — aí a comparação
    // 0 >= 0 acusava vazamento onde não havia. Essas ficam cobertas pela
    // checagem dos objetos carregados, mais acima.
    const noOriginal = quantas(tudoOriginal, t);
    if (noOriginal > 0 && quantas(tudoServido, t) >= noOriginal) {
      if (vazadas < 5) erro("solução de " + d.id + " não saiu do texto servido: " + t.slice(0, 50));
      vazadas++;
      break;
    }
  }
}
if (!vazadas) console.log("texto: nenhuma solução exclusiva de atividade paga aparece no JavaScript servido");
else erro("soluções pagas encontradas no texto: " + vazadas);

console.log(falhas ? "\n✗ " + falhas + " problema(s)" : "\nTudo verde: o cliente não recebe gabarito, e o ciclo devolve o conteúdo intacto.");
process.exit(falhas ? 1 : 0);
