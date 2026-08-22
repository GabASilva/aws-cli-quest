"use strict";
// ============================================================
// CLImb — json-yaml-2.js
// PARTE 2 da trilha "JSON e YAML": criar e editar os arquivos, não só ler.
//
// Só existe porque o `file://` passou a enxergar o que a pessoa escreve no
// shell. Antes eram DUAS árvores separadas e desconectadas:
//   • `echo ... > x.json`  gravava em conta.fs   (árvore do linux-lab)
//   • `file://x.json`      lia de conta.arquivosSalvos
// O resultado era absurdo: a pessoa criava o arquivo, via ele no `ls`, e a AWS
// respondia "arquivo não existe". A ligação foi feita no gargalo comum —
// arquivoLocal(nome, conta) agora consulta as três fontes (lab, arquivosSalvos
// e a árvore do shell), e os 10 chamadores passaram a repassar a conta.
//
// Verificado no simulador antes de escrever qualquer atividade:
//   • `echo` NÃO interpreta \n — escreve o literal. Arquivo de várias linhas
//     se monta com `>>`, uma linha por vez (foi assim que a jy-12 nasceu);
//   • o CloudFormation aceita e PROVISIONA um template escrito no shell:
//     o bucket nasce com o nome que a pessoa digitou.
// ============================================================

const DESAFIOS_FORMATOS_2 = [
  { id: "jy-9", servico: "formatos", nivel: 2, xp: 70,
    titulo: "Escreva o seu",
    descricao:
      "Você já leu o <b>trust.json</b> pronto. Agora escreva o seu: um <b>trust-ec2.json</b> que autoriza " +
      "o serviço <b>ec2.amazonaws.com</b> a vestir a role — o pronto autoriza o Lambda. " +
      "Depois confira com <b>cat</b> que saiu o que você queria. " +
      "<small>(o <b>&gt;</b> joga a saída do <b>echo</b> dentro do arquivo, criando ou substituindo. " +
      "O JSON inteiro vai entre <b>aspas simples</b> — mesma regra da atividade das aspas)</small>",
    dicas: [
      "É um echo só: o JSON entre aspas simples e o > apontando pro nome do arquivo.",
      "A forma é: echo '<json>' > trust-ec2.json — troque lambda.amazonaws.com por ec2.amazonaws.com.",
    ],
    solucao: [
      "echo '{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"ec2.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}' > trust-ec2.json",
      "cat trust-ec2.json",
    ],
    // valida o CONTEÚDO, não só a existência: tem que ser JSON válido e falar
    // de ec2 — senão daria "concluído" com um arquivo quebrado, que é o oposto
    // do que a trilha ensina.
    validar: (c) => {
      const a = typeof arquivoLocal === "function" ? arquivoLocal("trust-ec2.json", c) : null;
      if (!a || !a.conteudo) return false;
      try {
        return JSON.stringify(JSON.parse(a.conteudo)).includes("ec2.amazonaws.com");
      } catch (e) { return false; }
    } },

  { id: "jy-10", servico: "formatos", nivel: 3, xp: 90,
    titulo: "A AWS lê o que você escreveu",
    descricao:
      "Fecha o ciclo: crie a role <b>papel-formatos</b> usando <b>o seu</b> arquivo, com " +
      "<code>--assume-role-policy-document file://trust-ec2.json</code>. " +
      "<small>(<code>file://</code> não tem mágica: é só “leia deste arquivo do disco”. " +
      "Se o JSON estiver quebrado, é aqui que a AWS reclama — por isso se confere com <b>cat</b> antes de usar)</small>",
    dicas: [
      "Mesmo create-role da trilha de IAM, mas apontando pro arquivo que VOCÊ escreveu.",
      "A forma é: aws iam create-role --role-name <nome> --assume-role-policy-document file://<seu-arquivo>",
    ],
    solucao: ["aws iam create-role --role-name papel-formatos --assume-role-policy-document file://trust-ec2.json"],
    validar: (c, cmd, ok) => ok && ehCmd(cmd, "iam", "create-role") && !!c.iam.roles["papel-formatos"] },

  { id: "jy-11", servico: "formatos", nivel: 3, xp: 90,
    titulo: "Conserte a política quebrada",
    descricao:
      "Lembra da <b>politica-quebrada.json</b>, com a vírgula sobrando? Escreva a versão correta em " +
      "<b>politica-corrigida.json</b> e aplique no bucket <b>site-formatos</b>, que você cria antes. " +
      "<small>(repare que o <b>Resource</b> tem que apontar pro SEU bucket — " +
      "<code>arn:aws:s3:::site-formatos/*</code>. Política apontando pro bucket errado é aceita sem reclamar e não faz nada)</small>",
    dicas: [
      "São três passos: criar o bucket, escrever o JSON corrigido, aplicar com file://.",
      "A forma do último é: aws s3api put-bucket-policy --bucket <nome> --policy file://<arquivo>",
    ],
    solucao: [
      "aws s3 mb s3://site-formatos",
      "echo '{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":\"*\",\"Action\":\"s3:GetObject\",\"Resource\":\"arn:aws:s3:::site-formatos/*\"}]}' > politica-corrigida.json",
      "aws s3api put-bucket-policy --bucket site-formatos --policy file://politica-corrigida.json",
    ],
    validar: (c, cmd, ok) => {
      const b = c.s3.buckets["site-formatos"];
      const a = typeof arquivoLocal === "function" ? arquivoLocal("politica-corrigida.json", c) : null;
      if (!ok || !b || !b.politica || !a || !a.conteudo) return false;
      try { JSON.parse(a.conteudo); } catch (e) { return false; } // o corrigido tem que ser válido
      return a.conteudo.indexOf("site-formatos") >= 0;
    } },

  { id: "jy-12", servico: "formatos", nivel: 3, xp: 100,
    titulo: "Um YAML linha a linha",
    descricao:
      "YAML tem várias linhas e o <b>echo</b> escreve uma de cada vez — então se monta com <b>&gt;&gt;</b>, " +
      "que <b>acrescenta</b> em vez de substituir. Monte o <b>infra-minha.yaml</b> descrevendo um bucket " +
      "chamado <b>bucket-que-escrevi</b> e valide com o CloudFormation. " +
      "<small>(o primeiro <b>&gt;</b> cria o arquivo; do segundo em diante é <b>&gt;&gt;</b>. " +
      "Se errar e usar <b>&gt;</b> de novo no meio, você apaga tudo o que já tinha escrito)</small>",
    dicas: [
      "São cinco linhas: Resources: / o nome lógico / Type: / Properties: / BucketName:. Cuide da indentação — em YAML ela é sintaxe.",
      "Primeira com > e as outras quatro com >>. No fim: aws cloudformation validate-template --template-body file://infra-minha.yaml",
    ],
    solucao: [
      "echo 'Resources:' > infra-minha.yaml",
      "echo '  BucketDoLab:' >> infra-minha.yaml",
      "echo '    Type: AWS::S3::Bucket' >> infra-minha.yaml",
      "echo '    Properties:' >> infra-minha.yaml",
      "echo '      BucketName: bucket-que-escrevi' >> infra-minha.yaml",
      "aws cloudformation validate-template --template-body file://infra-minha.yaml",
    ],
    validar: (c, cmd, ok) => {
      const a = typeof arquivoLocal === "function" ? arquivoLocal("infra-minha.yaml", c) : null;
      if (!ok || !a || !a.conteudo) return false;
      const txt = String(a.conteudo);
      return ehCmd(cmd, "cloudformation", "validate-template") &&
             txt.indexOf("Resources:") >= 0 &&
             txt.indexOf("AWS::S3::Bucket") >= 0 &&
             txt.indexOf("bucket-que-escrevi") >= 0;
    } },

  { id: "jy-13", servico: "formatos", nivel: 3, xp: 110,
    titulo: "Suba a infraestrutura que você escreveu",
    descricao:
      "Último passo, e o que junta tudo: suba a stack <b>stack-formatos</b> a partir do <b>seu</b> template " +
      "e confirme que o bucket nasceu com o nome que <b>você</b> digitou. " +
      "<small>(é isto que Infraestrutura como Código significa na prática — você descreveu um recurso num " +
      "arquivo de texto e a nuvem obedeceu. Daqui pra frente é o mesmo princípio, só com templates maiores)</small>",
    dicas: [
      "Mesmo create-stack de sempre, agora apontando pro arquivo que você montou.",
      "A forma é: aws cloudformation create-stack --stack-name <nome> --template-body file://infra-minha.yaml  →  depois aws s3 ls",
    ],
    solucao: [
      "aws cloudformation create-stack --stack-name stack-formatos --template-body file://infra-minha.yaml",
      "aws s3 ls",
    ],
    validar: (c) =>
      !!(c.cloudformation && c.cloudformation.stacks && c.cloudformation.stacks["stack-formatos"]) &&
      !!c.s3.buckets["bucket-que-escrevi"] },
];

(function () {
  if (typeof window === "undefined") return;
  if (typeof DESAFIOS === "undefined") return;
  if (DESAFIOS.some((d) => d.id === "jy-9")) return;

  // entram logo depois da última atividade da trilha (as de leitura)
  let ultimo = -1;
  for (let i = 0; i < DESAFIOS.length; i++) if (DESAFIOS[i].servico === "formatos") ultimo = i;
  if (ultimo >= 0) DESAFIOS.splice(ultimo + 1, 0, ...DESAFIOS_FORMATOS_2);
  else for (const d of DESAFIOS_FORMATOS_2) DESAFIOS.push(d);
})();
