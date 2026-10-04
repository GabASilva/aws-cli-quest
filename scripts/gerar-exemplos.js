"use strict";
// ============================================================
// Gera lib/exemplos-comandos.json: pra cada comando do CLImb, a SAÍDA REAL que o
// simulador devolve numa atividade de verdade, e o ERRO que ele dá quando o
// comando vem sem argumento nenhum. Vai pras páginas públicas de comando
// (/aprender/<servico>/<sub>) — é conteúdo que nenhum outro site tem.
//
//   node scripts/gerar-exemplos.js            gera
//   node scripts/gerar-exemplos.js --conferir sai com erro se estiver velho
//
// Rode depois de mexer em atividade (solução) ou manual. O servidor também
// avisa no boot quando o arquivo está velho (assinatura não bate).
//
// Por que arquivo e não no boot: rodar o simulador num segundo processo, com
// todo o conteúdo carregado, numa máquina de 256 MB, arrisca estourar a
// memória; e no mesmo processo do servidor os stubs de window/document
// (cabeçalho do teste/fumaca.js) poluiriam o global.
//
// O carregamento é o do teste/isolamento.js (cabeçalho do fumaça + o preparo
// do js/ambientes.js), sem lista de arquivos nova.
// ============================================================
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const raiz = path.join(__dirname, "..");
const DESTINO = path.join(raiz, "lib", "exemplos-comandos.json");
const fonte = fs.readFileSync(path.join(raiz, "teste", "fumaca.js"), "utf8");
// (o `raiz` do cabeçalho é path.join(__dirname, ".."): daqui de scripts/ dá na
// mesma raiz que de teste/)
const cabeca = fonte.slice(0, fonte.indexOf("const teste = `")).replace(/^"use strict";/, "");
const PLACEHOLDERS = fs.readFileSync(path.join(raiz, "js", "placeholders.js"), "utf8").replace(/^"use strict";/, "");
const AMBIENTES = fs.readFileSync(path.join(raiz, "js", "ambientes.js"), "utf8").replace(/^"use strict";/, "");
const { assinaturaConteudo } = require(path.join(raiz, "lib", "exemplos.js"));

const MAX_LINHAS = 30;
const corta = (txt) => {
  const linhas = String(txt == null ? "" : txt).replace(/\r/g, "").split("\n");
  while (linhas.length && !linhas[linhas.length - 1].trim()) linhas.pop();
  return linhas.length > MAX_LINHAS ? linhas.slice(0, MAX_LINHAS).concat(["  (...)"]).join("\n") : linhas.join("\n");
};

globalThis.__gerar = function (ctx) {
  const { DESAFIOS, MANUAIS, executarComandoAws, criarContaAws, resolverPlaceholders, A } = ctx;
  const saida = {};
  const chaves = Object.keys(MANUAIS).filter((k) => k.indexOf(".") > 0).sort();
  for (const chave of chaves) {
    const [svc, sub] = chave.split(".");
    const alvo = new RegExp("^aws\\s+" + svc.replace(/[-]/g, "\\-") + "\\s+" + sub.replace(/[-]/g, "\\-") + "(\\s|$)");
    const ats = DESAFIOS.filter((d) => d.tipo !== "projeto" && d.servico !== "setup" && (d.solucao || []).some((s) => alvo.test(String(s).trim())));
    if (!ats.length) continue;
    let exemplo = null;
    // a primeira atividade cuja linha roda com saída; senão, a primeira que roda
    for (const d of ats.slice(0, 6)) {
      try {
        globalThis.jogo = { conta: criarContaAws() };
        A.entrar(d);
        const conta = globalThis.jogo.conta;
        for (const sol of d.solucao) {
          const t = resolverPlaceholders(conta, String(sol)).trim();
          if (!t.startsWith("aws")) continue;
          const r = executarComandoAws(conta, t);
          if (alvo.test(t)) {
            if (r.ok && (!exemplo || (!exemplo.saida && String(r.saida || "").trim()))) {
              exemplo = { atividade: d.id, linha: t, saida: corta(r.saida) };
            }
            break;
          }
        }
      } catch (e) { /* atividade que não roda fora do navegador: tenta a próxima */ }
      if (exemplo && exemplo.saida) break;
    }
    // o comando sem nada: a mensagem de uso/erro que a AWS CLI de verdade dá
    let erro = null;
    try {
      const r = executarComandoAws(criarContaAws(), "aws " + svc + " " + sub);
      if (!r.ok && String(r.saida || "").trim()) erro = { linha: "aws " + svc + " " + sub, saida: corta(r.saida) };
    } catch (e) { /* sem exemplo de erro */ }
    if (exemplo || erro) saida[chave] = { exemplo, erro };
  }
  return saida;
};

const teste = `
(function () {
  const A = globalThis.CLIMB_AMBIENTES;
  if (!A) { console.error("ambientes.js não carregou"); process.exitCode = 1; return; }
  globalThis.__resultado = globalThis.__gerar({ DESAFIOS, MANUAIS, executarComandoAws, criarContaAws, resolverPlaceholders, A });
  globalThis.__assinatura = globalThis.__assinaturaDe(DESAFIOS, MANUAIS);
})();
`;
globalThis.__assinaturaDe = assinaturaConteudo;
eval(cabeca + "\neval(codigo + '\\n' + PLACEHOLDERS + '\\n' + AMBIENTES + teste);");

const exemplos = globalThis.__resultado || {};
const doc = { assinatura: globalThis.__assinatura, comandos: exemplos };
const texto = JSON.stringify(doc, null, 1) + "\n";

if (process.argv.includes("--conferir")) {
  let atual = null;
  try { atual = JSON.parse(fs.readFileSync(DESTINO, "utf8")); } catch (e) { /* não existe */ }
  if (!atual || atual.assinatura !== doc.assinatura) {
    console.error("lib/exemplos-comandos.json está VELHO: rode  node scripts/gerar-exemplos.js");
    process.exitCode = 1;
  } else {
    console.log("exemplos dos comandos em dia (" + Object.keys(atual.comandos).length + " comandos)");
  }
} else {
  fs.writeFileSync(DESTINO, texto);
  const n = Object.values(exemplos);
  console.log("lib/exemplos-comandos.json: " + n.length + " comandos · com saída de exemplo: " +
    n.filter((x) => x.exemplo && x.exemplo.saida).length + " · com erro de uso: " + n.filter((x) => x.erro).length);
}
