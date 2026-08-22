"use strict";
// ============================================================
// CLImb — arquivos-lab.js
// PROBLEMA: 42 atividades exigem JSON escrito na linha de comando e 49
// referenciam um arquivo com file://. Só que `cat trust.json` respondia
// "(arquivo de exemplo)". A pessoa era mandada usar file://trust.json dezenas
// de vezes e NUNCA podia ver o que tem dentro de uma trust policy — copiava
// uma string que não entendia.
//
// O gancho pra isso já existia e nunca foi preenchido pra estes arquivos:
// ARQUIVOS_CONTEUDO, lido pelo linux-lab.js pra montar a árvore falsa.
// servicos-fase2.js e fase3.js já usam esse mesmo idioma.
//
// Aqui damos conteúdo REAL aos 4 que ainda eram stub: trust.json,
// politica-publica.json e os dois templates de CloudFormation.
//
// Os dois YAML NÃO são reescritos aqui: eles vêm de CFN_TEMPLATES, dentro do
// cloudformation.js, que é o texto que o create-stack de fato parseia. Copiar
// seria criar uma segunda fonte da verdade que sairia do ar na primeira
// mudança — então a exposição é feita LÁ, e este arquivo só cuida dos dois
// JSON de IAM/S3.
// ============================================================
(function () {
  if (typeof window === "undefined") return;
  window.ARQUIVOS_CONTEUDO = window.ARQUIVOS_CONTEUDO || {};

  // Trust policy: quem PODE VESTIR esta role. É o JSON que mais confunde em
  // AWS, porque parece com uma policy de permissão e não é — aqui não se
  // fala em bucket nem em tabela, só em QUEM assume.
  const TRUST = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  };

  // Bucket policy: o que PODE SER FEITO num recurso, e por quem.
  // Principal "*" = qualquer um da internet — é isto que deixa o site público.
  const POLITICA_PUBLICA = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "LeituraPublica",
        Effect: "Allow",
        Principal: "*",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::meu-site/*",
      },
    ],
  };

  window.ARQUIVOS_CONTEUDO["trust.json"] = JSON.stringify(TRUST, null, 2) + "\n";
  window.ARQUIVOS_CONTEUDO["politica-publica.json"] = JSON.stringify(POLITICA_PUBLICA, null, 2) + "\n";

  // Um arquivo QUEBRADO de propósito, pra trilha de JSON/YAML ter o que
  // consertar. O erro é o mais comum de todos: vírgula sobrando antes do
  // fecha-chaves. JSON não perdoa; YAML e JavaScript perdoariam.
  window.ARQUIVOS_CONTEUDO["politica-quebrada.json"] =
    "{\n" +
    '  "Version": "2012-10-17",\n' +
    '  "Statement": [\n' +
    "    {\n" +
    '      "Effect": "Allow",\n' +
    '      "Action": "s3:GetObject",\n' +
    '      "Resource": "arn:aws:s3:::meu-site/*",\n' +
    "    }\n" +
    "  ]\n" +
    "}\n";

  // Registra os tamanhos pro `ls -l` não mostrar arquivo sem tamanho.
  if (typeof ARQUIVOS_LOCAIS !== "undefined") {
    for (const nome of ["trust.json", "politica-publica.json", "politica-quebrada.json"]) {
      ARQUIVOS_LOCAIS[nome] = window.ARQUIVOS_CONTEUDO[nome].length;
    }
  }
})();
