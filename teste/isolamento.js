"use strict";
// Teste de isolamento: roda no Node (node teste/isolamento.js).
//
// O fumaça roda TODAS as atividades em sequência numa conta só — prova que a
// cadeia funciona, mas não que cada atividade funciona SOZINHA. Desde que as
// atividades ficaram livres (qualquer uma abre na hora), é assim que o aluno
// chega nelas: pulando pro meio da trilha.
//
// Aqui cada atividade é aberta numa conta NOVA, passando pelo mesmo preparo do
// navegador (js/ambientes.js: roda as anteriores da trilha), e a solução dela
// tem de passar no validador. Antes do ambientes.js, 52% falhavam assim.
//
// Não há quarta lista de arquivos: o carregamento (stubs de window/document e
// a lista) é o do teste/fumaca.js, lido daqui.
const fs = require("fs");
const path = require("path");

const fonte = fs.readFileSync(path.join(__dirname, "fumaca.js"), "utf8");
const cabeca = fonte.slice(0, fonte.indexOf("const teste = `")).replace(/^"use strict";/, "");
const PLACEHOLDERS = fs.readFileSync(path.join(__dirname, "..", "js", "placeholders.js"), "utf8").replace(/^"use strict";/, "");
const AMBIENTES = fs.readFileSync(path.join(__dirname, "..", "js", "ambientes.js"), "utf8").replace(/^"use strict";/, "");

const teste = `
(function () {
  const A = globalThis.CLIMB_AMBIENTES;
  if (!A) { console.error("ambientes.js não carregou"); process.exitCode = 1; return; }
  let total = 0, pulados = 0;
  const falhas = [];
  for (const d of DESAFIOS) {
    // setup: o 'aws configure' interativo só roda pela cadeia do terminal
    // (o fumaça cobre); projetos: validados por etapas, fora do escopo aqui.
    if (!d.solucao || !d.solucao.length || d.servico === "setup" || d.tipo === "projeto") continue;
    const ehLab = d.servico === "diagnostico";
    // mesma regra do fumaça: pula o que nem aws nem o shell sabem executar
    if (!ehLab && d.solucao.some((s) => {
      const l = String(s).trim();
      if (l.startsWith("aws")) return false;
      return typeof executarShellPuro !== "function" || !executarShellPuro(criarContaAws(), l);
    })) { pulados++; continue; }

    global.jogo = { conta: criarContaAws() }; // navegador novo: nenhum ambiente ainda
    A.entrar(d);
    const conta = global.jogo.conta;
    let ultimo = null;
    for (const sol of d.solucao) {
      const t = resolverPlaceholders(conta, String(sol)).trim();
      if (t.startsWith("aws")) {
        const r = executarComandoAws(conta, t); ultimo = r.cmd;
        // ISOLAR=<id> mostra a saída de cada linha daquela atividade
        if (process.env.ISOLAR === d.id) console.log((r.ok ? "  ok  " : "  ERR ") + t.slice(0, 120) + (r.ok ? "" : " → " + String(r.saida).split(String.fromCharCode(10)).filter(Boolean)[0]) +
          (process.env.VER ? String.fromCharCode(10) + String(r.saida).slice(0, 1500) : ""));
        continue;
      }
      if (ehLab && typeof labShell === "function") { labShell(conta, t); continue; }
      const rs = executarShellPuro(conta, t);
      if (rs) ultimo = rs.cmd;
    }
    let passou = false;
    try { passou = !!d.validar(conta, ultimo, true); } catch (e) { passou = false; }
    total++;
    if (!passou) falhas.push(d);
  }

  const porTrilha = {};
  for (const d of falhas) (porTrilha[d.servico] = porTrilha[d.servico] || []).push(d.id);
  for (const [t, ids] of Object.entries(porTrilha)) console.error("✗ " + t + " (" + ids.length + "): " + ids.join(", "));
  console.log("atividades abertas sozinhas: " + total + " · pulados (shell interativo): " + pulados + " · falharam: " + falhas.length);
  if (falhas.length) process.exitCode = 1;
  else console.log("Tudo verde: toda atividade funciona aberta fora de ordem.");
})();
`;

eval(cabeca + "\neval(codigo + '\\n' + PLACEHOLDERS + '\\n' + AMBIENTES + teste);");
