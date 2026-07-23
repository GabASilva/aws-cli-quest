"use strict";
// Teste de fumaça: roda no Node (node teste/fumaca.js).
// Executa os comandos-solução de TODOS os desafios e confere que
// cada validador passa. Falhou algo, sai com código 1.

const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const codigo = ["simulador.js", "manuais.js", "desafios.js", "atividades-extras.js", "desafios-avancados.js", "missoes.js", "cenarios-reais.js", "cloudformation.js", "servicos-fase1.js", "servicos-fase2.js", "servicos-fase3.js", "servicos-fase4.js", "desafios-extra.js", "desafios-pratica.js"]
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

  // ids reais são aleatórios — resolve os placeholders das soluções.
  // ATENÇÃO: teste/analise-corpo.js tem uma cópia desta função — mexeu aqui,
  // mexa lá também (os dois harnesses executam as mesmas soluções).
  function resolver(linha) {
    const ult = (obj) => { const k = Object.keys(obj || {}); return k[k.length - 1]; };
    if (linha.includes("<id-da-inst")) {
      linha = linha.replace(/<id-da-inst[^>]*>/, ult(conta.ec2.instancias));
    }
    if (linha.includes("<vpc-id>") && conta.vpc) linha = linha.replace(/<vpc-id>/g, ult(conta.vpc.vpcs));
    if (linha.includes("<igw-id>") && conta.vpc) linha = linha.replace(/<igw-id>/g, ult(conta.vpc.igws));
    if (linha.includes("<vol-id>")) linha = linha.replace(/<vol-id>/g, ult(conta.ec2.volumes));
    if (linha.includes("<zone-id>") && conta.route53) linha = linha.replace(/<zone-id>/g, ult(conta.route53.zonas));
    if (linha.includes("<dist-id>") && conta.cloudfront) linha = linha.replace(/<dist-id>/g, ult(conta.cloudfront.distribuicoes));
    if (linha.includes("<api-id>") && conta.apigateway) linha = linha.replace(/<api-id>/g, ult(conta.apigateway.apis));
    if ((linha.includes("<root-id>") || linha.includes("<resource-id>")) && conta.apigateway) {
      const api = conta.apigateway.apis[ult(conta.apigateway.apis)];
      if (api) {
        linha = linha.replace(/<root-id>/g, api.raiz);
        // o "resource-id" é o último recurso criado (o /pedidos), não a raiz
        const filhos = Object.keys(api.recursos).filter((r) => r !== api.raiz);
        linha = linha.replace(/<resource-id>/g, filhos[filhos.length - 1] || api.raiz);
      }
    }
    if (linha.includes("<key-id>") && conta.kms) linha = linha.replace(/<key-id>/g, ult(conta.kms.chaves));
    if (linha.includes("<query-id>") && conta.athena) linha = linha.replace(/<query-id>/g, ult(conta.athena.execucoes));
    if (linha.includes("<blob>")) linha = linha.replace(/<blob>/g, ((conta.kms || {}).ultimoBlob) || "");
    if (linha.includes("<receipt-handle>")) {
      // pega um handle de mensagem já recebida em qualquer fila
      let handle = "";
      for (const f of Object.values((conta.sqs || {}).filas || {})) {
        const m = (f.mensagens || []).find((x) => x.handle);
        if (m) { handle = m.handle; break; }
      }
      linha = linha.replace(/<receipt-handle>/g, handle);
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
