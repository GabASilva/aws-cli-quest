"use strict";
// Análise de coerência das atividades (node teste/analise.js).
// Roda o corpo (analise-corpo.js) no mesmo escopo dos módulos do jogo:
// inventário ordenado, ids duplicados, auto-pass, níveis fora de ordem,
// XP fora da curva e primeiro uso de cada comando por trilha.
// Use SEMPRE antes e depois de criar/mudar atividades (ver CLAUDE.md).
const fs = require("fs");
const path = require("path");
const raiz = path.join(__dirname, "..");

// Mesmo destravamento do fumaca.js: setup-lab/linux-lab/json-yaml so carregam
// com window definido, e alguns modulos registram listener de DOMContentLoaded.
global.window = global;

// Mesmos stubs do fumaca.js: o setup-lab chama funcoes de UI no meio da logica.
// A base da cadeia vai DENTRO do eval (BASE_CADEIA) porque em eval estrito as
// declaracoes dos arquivos ficam num escopo que daqui nao se enxerga.
const _term = { linhas: [], erro: false, cmd: null };
global.imprimir = (txt, classe) => { _term.linhas.push(String(txt)); if (classe === "erro") _term.erro = true; };
global.imprimirComando = () => {};
global.rolarTerminal = () => {};
global.salvarJogo = () => {};
global.verificarDesafios = (cmd) => { if (cmd) _term.cmd = cmd; };
global.ui = { historicoCmd: [], posHistorico: 0 };
global.jogo = { conta: null };
const _el = () => ({ style: {}, dataset: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
                     appendChild(){}, insertBefore(){}, remove(){}, setAttribute(){}, addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; } });
global.document = {
  addEventListener() {}, removeEventListener() {},
  querySelector() { return null; }, querySelectorAll() { return []; },
  getElementById() { return null; }, createElement() { return _el(); },
  head: _el(), body: _el(), readyState: "complete",
};
// jogo.js entra por último (depende de criarContaAws, do simulador.js) só pra
// expor NIVEIS — usado na checagem de sincronia com a tabela do servidor.
const BASE_CADEIA = `
window.executarLinha = function (linha) {
  const r = executarComandoAws(window.jogo.conta, linha);
  if (r.cmd) _term.cmd = r.cmd;
  if (!r.ok) { _term.erro = true; _term.linhas.push(String(r.saida)); }
};
window.rodarPelaCadeia = function (linha) {
  _term.erro = false; _term.linhas = [];
  try { window.executarLinha(linha); }
  catch (e) { _term.erro = true; _term.linhas.push(e.message); }
  return { ok: !_term.erro, saida: _term.linhas.join(" | "), cmd: _term.cmd };
};
`;
const arquivos = ["simulador.js", "manuais.js", "manuais-fase6-9.js", "desafios.js", "atividades-extras.js", "desafios-avancados.js", "cenarios-reais.js", "cloudformation.js", "servicos-fase1.js", "servicos-fase2.js", "servicos-fase3.js", "servicos-fase4.js", "servicos-fase5.js", "servicos-fase6.js", "servicos-fase7.js", "servicos-fase8.js", "servicos-fase9.js", "polly-completo.js", "cloudfront-completo.js", "desafios-extra.js", "desafios-pratica.js", "jogo.js", "cloudwatch-metricas.js", "logs-insights.js", "lambda-dynamo-profundo.js", "cobertura-1.js", "cobertura-2.js", "cobertura-3.js", "mundo-real-2.js", "mundo-real-3.js", "setup-lab.js", "linux-lab.js", "arquivos-lab.js", "json-yaml.js", "json-yaml-2.js", "lab-vpc.js", "missoes.js"];
const codigo = BASE_CADEIA + arquivos.map((f) => fs.readFileSync(path.join(raiz, "js", f), "utf8")).join("\n");
const corpo = fs.readFileSync(path.join(__dirname, "analise-corpo.js"), "utf8");
eval(codigo + "\n;(function(){\n" + corpo + "\n})();");
