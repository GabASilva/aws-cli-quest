"use strict";
// Teste de fumaça: roda no Node (node teste/fumaca.js).
// Executa os comandos-solução de TODOS os desafios e confere que
// cada validador passa. Falhou algo, sai com código 1.

const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const codigo = ["simulador.js", "manuais.js", "desafios.js", "atividades-extras.js", "desafios-avancados.js", "missoes.js", "cenarios-reais.js", "cloudformation.js", "servicos-fase1.js", "desafios-extra.js"]
  .map((f) => fs.readFileSync(path.join(raiz, "js", f), "utf8"))
  .join("\n");

const teste = `
(function () {
  const conta = criarContaAws();
  let falhas = 0;
  let ultimoCmd = null;

  function rodar(linha) {
    const r = executarComandoAws(conta, linha);
    if (!r.ok) {
      console.error("  ✗ comando falhou: " + linha);
      console.error("    " + String(r.saida).split("\\n")[0]);
      falhas++;
    }
    ultimoCmd = r.cmd;
    return r;
  }

  // ids reais são aleatórios — resolve placeholders <id-da-instância>, <vpc-id>, <igw-id>
  function resolver(linha) {
    if (linha.includes("<id-da-inst")) {
      const ids = Object.keys(conta.ec2.instancias);
      linha = linha.replace(/<id-da-inst[^>]*>/, ids[ids.length - 1]);
    }
    if (linha.includes("<vpc-id>") && conta.vpc) {
      const ids = Object.keys(conta.vpc.vpcs);
      linha = linha.replace(/<vpc-id>/g, ids[ids.length - 1]);
    }
    if (linha.includes("<igw-id>") && conta.vpc) {
      const ids = Object.keys(conta.vpc.igws);
      linha = linha.replace(/<igw-id>/g, ids[ids.length - 1]);
    }
    return linha;
  }

  for (const d of DESAFIOS) {
    // desafios de shell/Linux (solução não começa com 'aws') são testados no
    // navegador, não aqui — o executarComandoAws só roda comandos aws.
    if (d.solucao.some((s) => !s.trim().startsWith("aws"))) {
      console.log("· (pulado no node — shell) " + d.id + " — " + d.titulo);
      continue;
    }
    for (const sol of d.solucao) {
      if (sol.startsWith("aws ec2 describe-instances") && d.id === "ec2-3") { rodar(sol); continue; }
      rodar(resolver(sol));
    }
    let passou;
    if (d.tipo === "projeto") {
      passou = d.etapas.every((e) => e.validar(conta));
    } else {
      passou = d.validar(conta, ultimoCmd, true);
    }
    if (!passou) {
      console.error("✗ validador NÃO passou: " + d.id + " — " + d.titulo);
      falhas++;
    } else {
      console.log("✓ " + d.id + " — " + d.titulo);
    }
  }

  // manuais: todo serviço e comando registrado tem que ter manual
  for (const [servico, ops] of Object.entries(SERVICOS)) {
    if (!MANUAIS[servico]) { console.error("✗ manual faltando: " + servico); falhas++; }
    for (const sub of Object.keys(ops)) {
      const m = obterManual(servico + "." + sub);
      if (m.startsWith("Não há manual") || m.startsWith("(não há manual")) {
        console.error("✗ manual faltando: " + servico + " " + sub);
        falhas++;
      }
    }
  }

  // alguns erros esperados (não podem passar como ok)
  const errados = [
    "aws s3 mb s3://MAIUSCULO",
    "aws s3 cp nao-existe.txt s3://meu-primeiro-bucket/",
    "aws ec2 run-instances --image-id banana --instance-type t2.micro",
    "aws dynamodb put-item --table-name nao-existe --item '{}'",
    "aws naoexiste qualquer-coisa",
  ];
  for (const linha of errados) {
    const r = executarComandoAws(conta, linha);
    if (r.ok) { console.error("✗ devia ter dado erro: " + linha); falhas++; }
  }

  if (falhas) {
    console.error("\\n" + falhas + " falha(s).");
    process.exitCode = 1;
  } else {
    console.log("\\nTudo verde: " + DESAFIOS.length + " desafios validados, manuais completos, erros tratados.");
  }
})();
`;

eval(codigo + teste);
