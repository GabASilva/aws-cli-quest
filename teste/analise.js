"use strict";
// Análise de coerência das atividades (node teste/analise.js).
// Roda o corpo (analise-corpo.js) no mesmo escopo dos módulos do jogo:
// inventário ordenado, ids duplicados, auto-pass, níveis fora de ordem,
// XP fora da curva e primeiro uso de cada comando por trilha.
// Use SEMPRE antes e depois de criar/mudar atividades (ver CLAUDE.md).
const fs = require("fs");
const path = require("path");
const raiz = path.join(__dirname, "..");
// jogo.js entra por último (depende de criarContaAws, do simulador.js) só pra
// expor NIVEIS — usado na checagem de sincronia com a tabela do servidor.
const arquivos = ["simulador.js", "manuais.js", "desafios.js", "atividades-extras.js", "desafios-avancados.js", "missoes.js", "cenarios-reais.js", "cloudformation.js", "servicos-fase1.js", "servicos-fase2.js", "desafios-extra.js", "desafios-pratica.js", "jogo.js"];
const codigo = arquivos.map((f) => fs.readFileSync(path.join(raiz, "js", f), "utf8")).join("\n");
const corpo = fs.readFileSync(path.join(__dirname, "analise-corpo.js"), "utf8");
eval(codigo + "\n;(function(){\n" + corpo + "\n})();");
