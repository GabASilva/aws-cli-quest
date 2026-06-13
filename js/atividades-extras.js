"use strict";
// ============================================================
// AWS CLI Quest — atividades-extras.js
// Parte de ATIVIDADES EXTRAS com objetivos diferentes da trilha principal:
//   🎯 Cenários            — missões que combinam vários comandos
//   🐞 Conserte o comando  — debugging: ache o erro e rode a versão certa
//   ⚡ Missões relâmpago    — tarefas rápidas de 1 comando, XP ágil
//
// NÃO altera o core: empurra novas seções em SERVICOS_META e novos desafios
// em DESAFIOS (mesmas referências de array do desafios.js). Cada seção é uma
// trilha independente, então o motor existente (sidebar, gating sequencial,
// validação, XP) funciona sem mudança nenhuma.
// ============================================================

// Reaproveita o helper ehCmd do desafios.js (já carregado).

const EXTRAS = [
  // ==================== 🎯 CENÁRIOS ====================
  {
    id: "cen-1", servico: "extras-cenarios", nivel: 2, xp: 110,
    titulo: "Site de currículo no ar",
    descricao: "Monte uma hospedagem de site do zero: crie o bucket <b>meu-cv</b>, suba o <b>index.html</b> (existe no disco local) e configure a hospedagem web com ele como página inicial.",
    dicas: ["São 3 comandos: mb, cp e website.", "O website precisa de --index-document index.html."],
    solucao: [
      "aws s3 mb s3://meu-cv",
      "aws s3 cp index.html s3://meu-cv/",
      "aws s3 website s3://meu-cv --index-document index.html",
    ],
    validar: (conta) => {
      const b = conta.s3.buckets["meu-cv"];
      return !!b && !!b.website && b.website.indice === "index.html";
    },
  },
  {
    id: "cen-2", servico: "extras-cenarios", nivel: 2, xp: 120,
    titulo: "Banco de usuários",
    descricao: "Crie a tabela <b>usuarios-app</b> com chave primária <b>email</b> (string), no modo por requisição, e insira um usuário qualquer nela.",
    dicas: ["Primeiro o create-table (chave email, tipo S), depois o put-item.", "Lembre do formato do item: '{\"email\": {\"S\": \"ana@ex.com\"}}'."],
    solucao: [
      "aws dynamodb create-table --table-name usuarios-app --attribute-definitions AttributeName=email,AttributeType=S --key-schema AttributeName=email,KeyType=HASH --billing-mode PAY_PER_REQUEST",
      "aws dynamodb put-item --table-name usuarios-app --item '{\"email\": {\"S\": \"ana@ex.com\"}}'",
    ],
    validar: (conta) => {
      const t = conta.dynamodb.tabelas["usuarios-app"];
      return !!t && t.esquema.some((k) => k.AttributeName === "email" && k.KeyType === "HASH") && t.itens.length >= 1;
    },
  },
  {
    id: "cen-3", servico: "extras-cenarios", nivel: 2, xp: 110,
    titulo: "Equipe de QA",
    descricao: "Estruture o acesso do time de testes: crie o grupo <b>qa</b>, crie o usuário <b>tester</b> e coloque ele no grupo.",
    dicas: ["create-group, create-user e add-user-to-group.", "A ordem não importa, mas o usuário e o grupo precisam existir antes do add."],
    solucao: [
      "aws iam create-group --group-name qa",
      "aws iam create-user --user-name tester",
      "aws iam add-user-to-group --user-name tester --group-name qa",
    ],
    validar: (conta) => {
      const g = conta.iam.grupos["qa"];
      return !!g && !!conta.iam.usuarios["tester"] && g.membros.includes("tester");
    },
  },
  {
    id: "cen-4", servico: "extras-cenarios", nivel: 3, xp: 110,
    titulo: "Escalando pra Black Friday",
    descricao: "A demanda vai explodir: suba <b>3 instâncias t3.micro de uma vez só</b> usando a imagem ami-0abcd1234ef567890.",
    dicas: ["Tudo num comando só, com --count.", "aws ec2 run-instances ... --count 3"],
    solucao: ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.micro --count 3"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "ec2", "run-instances") && cmd.flags["instance-type"] === "t3.micro" && parseInt(cmd.flags.count || "1", 10) >= 3,
  },
  {
    id: "cen-5", servico: "extras-cenarios", nivel: 3, xp: 120,
    titulo: "Firewall do front-end",
    descricao: "Crie o security group <b>front-sg</b> e libere as portas <b>80 (HTTP)</b> e <b>443 (HTTPS)</b> pra qualquer IP.",
    dicas: ["Um create-security-group e dois authorize-security-group-ingress (uma porta cada).", "Qualquer IP = --cidr 0.0.0.0/0."],
    solucao: [
      'aws ec2 create-security-group --group-name front-sg --description "Front-end"',
      "aws ec2 authorize-security-group-ingress --group-name front-sg --protocol tcp --port 80 --cidr 0.0.0.0/0",
      "aws ec2 authorize-security-group-ingress --group-name front-sg --protocol tcp --port 443 --cidr 0.0.0.0/0",
    ],
    validar: (conta) => {
      const g = Object.values(conta.ec2.securityGroups).find((x) => x.nome === "front-sg");
      return !!g && g.regras.some((r) => r.porta === 80) && g.regras.some((r) => r.porta === 443);
    },
  },

  // ==================== 🐞 CONSERTE O COMANDO ====================
  {
    id: "fix-1", servico: "extras-conserte", nivel: 1, xp: 60,
    titulo: "Cadê o s3://?",
    descricao: "Esse comando falhou:<br><code>aws s3 mb meu-treino-bucket</code><br>Falta algo no endereço. Conserte e crie de verdade o bucket <b>meu-treino-bucket</b>.",
    dicas: ["Endereços do S3 sempre começam com s3://"],
    solucao: ["aws s3 mb s3://meu-treino-bucket"],
    validar: (conta) => !!conta.s3.buckets["meu-treino-bucket"],
  },
  {
    id: "fix-2", servico: "extras-conserte", nivel: 1, xp: 70,
    titulo: "Destino sem protocolo",
    descricao: "Esse upload deu erro:<br><code>aws s3 cp relatorio.csv meu-treino-bucket</code><br>O destino está sem o s3://. Conserte e suba o <b>relatorio.csv</b> pro bucket meu-treino-bucket.",
    dicas: ["O destino precisa ser s3://meu-treino-bucket/ (com a barra no fim mantém o nome do arquivo)."],
    solucao: ["aws s3 cp relatorio.csv s3://meu-treino-bucket/"],
    validar: (conta) => {
      const b = conta.s3.buckets["meu-treino-bucket"];
      return !!b && !!b.objetos["relatorio.csv"];
    },
  },
  {
    id: "fix-3", servico: "extras-conserte", nivel: 2, xp: 70,
    titulo: "Nome de flag errado",
    descricao: "Esse comando não roda:<br><code>aws ec2 run-instances --image-id ami-0abcd1234ef567890 --type t2.micro</code><br>A flag do tipo da instância está com o nome errado. Descubra a certa e suba a instância.",
    dicas: ["Não é --type. Veja 'aws ec2 run-instances help' — a flag certa é --instance-type."],
    solucao: ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t2.micro"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "ec2", "run-instances") && !!cmd.flags["instance-type"],
  },
  {
    id: "fix-4", servico: "extras-conserte", nivel: 2, xp: 80,
    titulo: "Faltou declarar o atributo",
    descricao: "Esse create-table falhou:<br><code>aws dynamodb create-table --table-name treino-tab --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST</code><br>Toda chave do key-schema precisa estar declarada antes. Conserte e crie a tabela <b>treino-tab</b>.",
    dicas: ["Faltou o --attribute-definitions declarando o atributo id como AttributeType=S.", "Veja 'aws dynamodb create-table help'."],
    solucao: ["aws dynamodb create-table --table-name treino-tab --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST"],
    validar: (conta) => !!conta.dynamodb.tabelas["treino-tab"],
  },
  {
    id: "fix-5", servico: "extras-conserte", nivel: 1, xp: 60,
    titulo: "Argumento sem flag",
    descricao: "Esse comando deu erro:<br><code>aws iam create-user beto</code><br>O nome veio solto, sem dizer qual argumento é. Conserte e crie o usuário <b>beto</b>.",
    dicas: ["O nome precisa vir depois de --user-name."],
    solucao: ["aws iam create-user --user-name beto"],
    validar: (conta) => !!conta.iam.usuarios["beto"],
  },

  // ==================== ⚡ MISSÕES RELÂMPAGO ====================
  {
    id: "rel-1", servico: "extras-relampago", nivel: 1, xp: 30,
    titulo: "Bucket no susto",
    descricao: "Rápido: crie o bucket <b>rapido-1</b>.",
    dicas: ["aws s3 mb s3://rapido-1"],
    solucao: ["aws s3 mb s3://rapido-1"],
    validar: (conta) => !!conta.s3.buckets["rapido-1"],
  },
  {
    id: "rel-2", servico: "extras-relampago", nivel: 1, xp: 30,
    titulo: "Novo na conta",
    descricao: "Crie o usuário <b>flash</b>.",
    dicas: ["aws iam create-user --user-name flash"],
    solucao: ["aws iam create-user --user-name flash"],
    validar: (conta) => !!conta.iam.usuarios["flash"],
  },
  {
    id: "rel-3", servico: "extras-relampago", nivel: 2, xp: 40,
    titulo: "Tabela expressa",
    descricao: "Crie a tabela <b>cache</b> com chave primária <b>id</b> (string), por requisição.",
    dicas: ["É o create-table completo — copie o padrão do help se precisar."],
    solucao: ["aws dynamodb create-table --table-name cache --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST"],
    validar: (conta) => !!conta.dynamodb.tabelas["cache"],
  },
  {
    id: "rel-4", servico: "extras-relampago", nivel: 1, xp: 30,
    titulo: "Chave na mão",
    descricao: "Crie o par de chaves <b>chave-rapida</b>.",
    dicas: ["aws ec2 create-key-pair --key-name chave-rapida"],
    solucao: ["aws ec2 create-key-pair --key-name chave-rapida"],
    validar: (conta) => !!conta.ec2.keyPairs["chave-rapida"],
  },
  {
    id: "rel-5", servico: "extras-relampago", nivel: 1, xp: 30,
    titulo: "Forma o squad",
    descricao: "Crie o grupo <b>squad</b>.",
    dicas: ["aws iam create-group --group-name squad"],
    solucao: ["aws iam create-group --group-name squad"],
    validar: (conta) => !!conta.iam.grupos["squad"],
  },
  {
    id: "rel-6", servico: "extras-relampago", nivel: 2, xp: 40,
    titulo: "Quem sou eu?",
    descricao: "Descubra com que identidade você está operando, usando o <b>sts</b> (o \"whoami\" da AWS).",
    dicas: ["aws sts get-caller-identity"],
    solucao: ["aws sts get-caller-identity"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "sts", "get-caller-identity"),
  },
];

// --- Registra as seções e os desafios no motor existente ---
(function () {
  const NOVAS_SECOES = [
    { id: "extras-cenarios", nome: "Cenários", subtitulo: "Missões combinadas", icone: "🎯" },
    { id: "extras-conserte", nome: "Conserte o comando", subtitulo: "Ache o erro", icone: "🐞" },
    { id: "extras-relampago", nome: "Missões relâmpago", subtitulo: "Treino rápido", icone: "⚡" },
  ];
  // insere as seções logo antes de "Projetos" (mantém Projetos como capstone)
  const iProjetos = SERVICOS_META.findIndex((s) => s.id === "projetos");
  const pos = iProjetos >= 0 ? iProjetos : SERVICOS_META.length;
  SERVICOS_META.splice(pos, 0, ...NOVAS_SECOES);

  // adiciona os desafios à lista global
  for (const d of EXTRAS) DESAFIOS.push(d);
})();
