"use strict";
// ============================================================
// AWS CLI Quest — desafios-avancados.js
// 20 desafios de nível mais alto, inspirados nos labs reais da AWS:
//   🔐 Políticas IAM     — customer managed, versões, ARN, baixar o JSON
//   🔎 Consultas & saída — --query (JMESPath), --output text, redirecionar ">"
//   🧹 Gestão & faxina   — desanexar, remover, apagar (ciclo de vida)
//   🧩 Missões cegas      — objetivo só, poucas dicas, combina serviços
//
// ADITIVO: empurra seções em SERVICOS_META e desafios em DESAFIOS.
// (ehCmd e os helpers já vêm do desafios.js.)
// ============================================================

const LAB_ARN = "arn:aws:iam::123456789012:policy/lab_policy";

const DESAFIOS_AVANCADOS = [
  // ==================== 🔐 POLÍTICAS IAM ====================
  {
    id: "iampol-1", servico: "adv-politicas", nivel: 3, xp: 90,
    titulo: "Ache a política do lab",
    descricao: "Igual ao desafio da AWS: a conta tem uma política gerenciada pelo cliente chamada <b>lab_policy</b>. Liste <b>só as políticas do cliente</b> (customer managed) pra achar o ARN dela.",
    dicas: ["O comando que lista políticas é list-policies.", "Pra filtrar só as do cliente, use --scope Local."],
    solucao: ["aws iam list-policies --scope Local"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "iam", "list-policies") && cmd.flags.scope === "Local",
  },
  {
    id: "iampol-2", servico: "adv-politicas", nivel: 3, xp: 140,
    titulo: "Baixe o documento da política",
    descricao: "O coração do desafio da AWS: pegue o <b>JSON da versão v1</b> do lab_policy e <b>salve no arquivo lab_policy.json</b>. Use o ARN da política e redirecione a saída com <code>></code>.",
    dicas: [
      "O comando é get-policy-version e precisa de --policy-arn e --version-id.",
      `O ARN é ${LAB_ARN} e a versão é v1.`,
      "Pra salvar num arquivo, termine o comando com  > lab_policy.json  (depois confira com 'cat lab_policy.json').",
    ],
    solucao: [`aws iam get-policy-version --policy-arn ${LAB_ARN} --version-id v1 > lab_policy.json`],
    validar: (conta) => {
      const s = (conta.arquivosSalvos || {})["lab_policy.json"];
      return !!s && s.includes("Statement");
    },
  },
  {
    id: "iampol-3", servico: "adv-politicas", nivel: 3, xp: 90,
    titulo: "Qual é a versão padrão?",
    descricao: "Antes de baixar uma política, você precisa saber qual versão está ativa. Consulte os <b>metadados</b> do lab_policy (lá aparece o DefaultVersionId).",
    dicas: ["get-policy (diferente de get-policy-version) traz os metadados.", `Use --policy-arn ${LAB_ARN}.`],
    solucao: [`aws iam get-policy --policy-arn ${LAB_ARN}`],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "iam", "get-policy") && cmd.flags["policy-arn"] === LAB_ARN,
  },
  {
    id: "iampol-4", servico: "adv-politicas", nivel: 3, xp: 110,
    titulo: "Crie sua própria política",
    descricao: "Crie uma política gerenciada pelo cliente chamada <b>leitura-s3</b> a partir do arquivo <b>politica-publica.json</b> (existe no disco local).",
    dicas: ["create-policy pede --policy-name e --policy-document.", "O documento entra como file://politica-publica.json."],
    solucao: ["aws iam create-policy --policy-name leitura-s3 --policy-document file://politica-publica.json"],
    validar: (conta) => !!conta.iam.policies["leitura-s3"],
  },
  {
    id: "iampol-5", servico: "adv-politicas", nivel: 3, xp: 130,
    titulo: "Publique uma nova versão",
    descricao: "Políticas têm versões. Crie uma <b>nova versão</b> da sua política <b>leitura-s3</b> (use o mesmo politica-publica.json) e já deixe ela como <b>padrão</b>.",
    dicas: ["create-policy-version, com --policy-arn da leitura-s3.", "Pra virar a ativa, adicione --set-as-default.", "O ARN da leitura-s3 é arn:aws:iam::123456789012:policy/leitura-s3."],
    solucao: ["aws iam create-policy-version --policy-arn arn:aws:iam::123456789012:policy/leitura-s3 --policy-document file://politica-publica.json --set-as-default"],
    validar: (conta) => {
      const p = conta.iam.policies["leitura-s3"];
      return !!p && p.defaultVersionId === "v2";
    },
  },
  {
    id: "iampol-6", servico: "adv-politicas", nivel: 3, xp: 120,
    titulo: "Conceda a um usuário",
    descricao: "Crie o usuário <b>dev-novo</b> e anexe a ele a SUA política <b>leitura-s3</b> (pelo ARN dela).",
    dicas: ["Dois comandos: create-user e attach-user-policy.", "Use o ARN arn:aws:iam::123456789012:policy/leitura-s3 no --policy-arn."],
    solucao: [
      "aws iam create-user --user-name dev-novo",
      "aws iam attach-user-policy --user-name dev-novo --policy-arn arn:aws:iam::123456789012:policy/leitura-s3",
    ],
    validar: (conta) => {
      const u = conta.iam.usuarios["dev-novo"];
      return !!u && u.politicas.some((a) => a.endsWith(":policy/leitura-s3"));
    },
  },

  // ==================== 🔎 CONSULTAS & SAÍDA ====================
  {
    id: "qry-1", servico: "adv-query", nivel: 3, xp: 90,
    titulo: "Só os ARNs",
    descricao: "Liste as políticas <b>gerenciadas pela AWS</b>, mas mostre <b>apenas os ARNs</b> (não o JSON inteiro). Use o parâmetro <code>--query</code>.",
    dicas: ["list-policies --scope AWS lista as da AWS.", "Filtre com --query 'Policies[*].Arn' (JMESPath)."],
    solucao: ["aws iam list-policies --scope AWS --query 'Policies[*].Arn'"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "iam", "list-policies") && cmd.flags.scope === "AWS" && typeof cmd.flags.query === "string" && /Arn/.test(cmd.flags.query),
  },
  {
    id: "qry-2", servico: "adv-query", nivel: 3, xp: 90,
    titulo: "Saída em texto puro",
    descricao: "Liste os <b>nomes</b> das políticas da AWS em <b>formato text</b> (sem as aspas e colchetes do JSON) — ótimo pra usar em scripts.",
    dicas: ["--query 'Policies[*].PolicyName' pega os nomes.", "Troque o formato com --output text."],
    solucao: ["aws iam list-policies --scope AWS --query 'Policies[*].PolicyName' --output text"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "iam", "list-policies") && cmd.flags.output === "text" && typeof cmd.flags.query === "string" && /PolicyName/.test(cmd.flags.query),
  },
  {
    id: "qry-3", servico: "adv-query", nivel: 3, xp: 120,
    titulo: "Filtre pelo nome",
    descricao: "Ache o ARN da política <b>AdministratorAccess</b> usando um <b>filtro</b> no --query (em vez de ler a lista inteira na mão).",
    dicas: ["Filtro JMESPath: Policies[?PolicyName=='AdministratorAccess'].Arn", 'Por causa das aspas internas, ponha a expressão entre aspas duplas: --query "Policies[?...==\'...\'].Arn"'],
    solucao: ["aws iam list-policies --scope AWS --query \"Policies[?PolicyName=='AdministratorAccess'].Arn\""],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "iam", "list-policies") && typeof cmd.flags.query === "string" && /PolicyName==/.test(cmd.flags.query) && /AdministratorAccess/.test(cmd.flags.query),
  },
  {
    id: "qry-4", servico: "adv-query", nivel: 3, xp: 100,
    titulo: "Arquive a lista",
    descricao: "Salve a lista das suas políticas (customer managed) no arquivo <b>politicas.json</b> usando redirecionamento.",
    dicas: ["list-policies --scope Local + > politicas.json", "Confira depois com 'cat politicas.json'."],
    solucao: ["aws iam list-policies --scope Local > politicas.json"],
    validar: (conta) => {
      const s = (conta.arquivosSalvos || {})["politicas.json"];
      return !!s && s.includes("lab_policy");
    },
  },
  {
    id: "qry-5", servico: "adv-query", nivel: 3, xp: 100,
    titulo: "Quem sou eu, em arquivo",
    descricao: "Salve a sua identidade (o \"whoami\" da AWS) no arquivo <b>conta.json</b>.",
    dicas: ["aws sts get-caller-identity > conta.json"],
    solucao: ["aws sts get-caller-identity > conta.json"],
    validar: (conta) => {
      const s = (conta.arquivosSalvos || {})["conta.json"];
      return !!s && s.includes("Account");
    },
  },

  // ==================== 🧹 GESTÃO & FAXINA ====================
  {
    id: "ges-1", servico: "adv-gestao", nivel: 3, xp: 110,
    titulo: "Rotatividade no time",
    descricao: "Crie o grupo <b>temporarios</b> e o usuário <b>estagiario</b>, coloque o estagiário no grupo e, no fim do contrato, <b>remova ele do grupo</b> (sem apagar o usuário).",
    dicas: ["create-group, create-user, add-user-to-group e, por fim, remove-user-from-group."],
    solucao: [
      "aws iam create-group --group-name temporarios",
      "aws iam create-user --user-name estagiario",
      "aws iam add-user-to-group --user-name estagiario --group-name temporarios",
      "aws iam remove-user-from-group --user-name estagiario --group-name temporarios",
    ],
    validar: (conta) => {
      const g = conta.iam.grupos["temporarios"];
      return !!g && !!conta.iam.usuarios["estagiario"] && !g.membros.includes("estagiario");
    },
  },
  {
    id: "ges-2", servico: "adv-gestao", nivel: 3, xp: 110,
    titulo: "Revogar acesso",
    descricao: "Crie o usuário <b>ex-func</b>, dê a ele a política <b>AmazonS3ReadOnlyAccess</b> e depois <b>desanexe</b> (a pessoa saiu da empresa).",
    dicas: ["attach-user-policy pra dar, detach-user-policy pra tirar.", "ARN: arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess."],
    solucao: [
      "aws iam create-user --user-name ex-func",
      "aws iam attach-user-policy --user-name ex-func --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
      "aws iam detach-user-policy --user-name ex-func --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
    ],
    validar: (conta) => {
      const u = conta.iam.usuarios["ex-func"];
      return !!u && u.politicas.length === 0;
    },
  },
  {
    id: "ges-3", servico: "adv-gestao", nivel: 3, xp: 120,
    titulo: "Faxina de grupo",
    descricao: "Crie o grupo <b>obsoleto</b> com o usuário <b>temp1</b> dentro. Depois desative tudo: tire o usuário e <b>apague o grupo</b> (a AWS só deixa apagar grupo vazio).",
    dicas: ["Pra apagar o grupo, ele precisa estar vazio — use remove-user-from-group antes do delete-group."],
    solucao: [
      "aws iam create-group --group-name obsoleto",
      "aws iam create-user --user-name temp1",
      "aws iam add-user-to-group --user-name temp1 --group-name obsoleto",
      "aws iam remove-user-from-group --user-name temp1 --group-name obsoleto",
      "aws iam delete-group --group-name obsoleto",
    ],
    // exige o delete-group DAR CERTO (estado "não existe" sozinho completaria de graça)
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "iam", "delete-group") && !conta.iam.grupos["obsoleto"],
  },
  {
    id: "ges-4", servico: "adv-gestao", nivel: 3, xp: 110,
    titulo: "Aposente uma role",
    descricao: "Crie a role <b>role-teste</b> (use o trust.json do disco) e, em seguida, <b>apague</b> ela.",
    dicas: ["create-role com --assume-role-policy-document file://trust.json, depois delete-role."],
    solucao: [
      "aws iam create-role --role-name role-teste --assume-role-policy-document file://trust.json",
      "aws iam delete-role --role-name role-teste",
    ],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "iam", "delete-role") && !conta.iam.roles["role-teste"],
  },
  {
    id: "ges-5", servico: "adv-gestao", nivel: 3, xp: 110,
    titulo: "Descarte uma política",
    descricao: "Crie a política <b>descartavel</b> (de file://politica-publica.json) e depois <b>apague</b> ela pelo ARN.",
    dicas: ["create-policy e depois delete-policy --policy-arn arn:aws:iam::123456789012:policy/descartavel."],
    solucao: [
      "aws iam create-policy --policy-name descartavel --policy-document file://politica-publica.json",
      "aws iam delete-policy --policy-arn arn:aws:iam::123456789012:policy/descartavel",
    ],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "iam", "delete-policy") && !conta.iam.policies["descartavel"],
  },

  // ==================== 🧩 MISSÕES CEGAS (poucas dicas) ====================
  {
    id: "cega-1", servico: "adv-cegas", nivel: 3, xp: 150,
    titulo: "Inventário de IDs",
    descricao: "Suba <b>2 instâncias t3.micro</b> e depois salve <b>só os InstanceId</b> delas, em formato text, no arquivo <b>ids.txt</b>. (Junta run-instances + describe + --query + --output + redirecionamento.)",
    dicas: ["Primeiro run-instances --count 2.", "Depois: describe-instances --query 'Reservations[0].Instances[*].InstanceId' --output text > ids.txt"],
    solucao: [
      "aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.micro --count 2",
      "aws ec2 describe-instances --query 'Reservations[0].Instances[*].InstanceId' --output text > ids.txt",
    ],
    validar: (conta) => {
      const s = (conta.arquivosSalvos || {})["ids.txt"];
      return !!s && /i-0/.test(s);
    },
  },
  {
    id: "cega-2", servico: "adv-cegas", nivel: 3, xp: 130,
    titulo: "SSH só pra você",
    descricao: "Crie o security group <b>audit-sg</b> e libere a porta <b>22</b> APENAS pro IP <b>203.0.113.10/32</b> (nada de 0.0.0.0/0 — isso é boa prática de segurança).",
    dicas: ["O /32 no fim do CIDR significa 'exatamente esse IP'."],
    solucao: [
      'aws ec2 create-security-group --group-name audit-sg --description "Acesso administrativo"',
      "aws ec2 authorize-security-group-ingress --group-name audit-sg --protocol tcp --port 22 --cidr 203.0.113.10/32",
    ],
    validar: (conta) => {
      const g = Object.values(conta.ec2.securityGroups).find((x) => x.nome === "audit-sg");
      return !!g && g.regras.some((r) => r.porta === 22 && r.cidr === "203.0.113.10/32");
    },
  },
  {
    id: "cega-3", servico: "adv-cegas", nivel: 3, xp: 160,
    titulo: "Tabela com chave composta",
    descricao: "Crie a tabela <b>eventos</b> com chave primária <b>composta</b>: partition key <b>id</b> (string) E sort key <b>data</b> (string). Você vai precisar declarar dois atributos e duas entradas no key-schema.",
    dicas: ["--attribute-definitions aceita vários: ...AttributeName=id,AttributeType=S AttributeName=data,AttributeType=S", "--key-schema também: AttributeName=id,KeyType=HASH AttributeName=data,KeyType=RANGE"],
    solucao: ["aws dynamodb create-table --table-name eventos --attribute-definitions AttributeName=id,AttributeType=S AttributeName=data,AttributeType=S --key-schema AttributeName=id,KeyType=HASH AttributeName=data,KeyType=RANGE --billing-mode PAY_PER_REQUEST"],
    validar: (conta) => {
      const t = conta.dynamodb.tabelas["eventos"];
      return !!t && t.esquema.some((k) => k.AttributeName === "id" && k.KeyType === "HASH") && t.esquema.some((k) => k.AttributeName === "data" && k.KeyType === "RANGE");
    },
  },
  {
    id: "cega-4", servico: "adv-cegas", nivel: 3, xp: 220,
    titulo: "Mini-pipeline serverless (no escuro)",
    descricao: "Sem passo a passo: monte uma função que lê de uma tabela. Crie a role <b>mini-role</b>, a tabela <b>mini-tab</b> (chave id, string), a função <b>mini-fn</b> (python3.12) e configure nela a variável de ambiente <b>TABELA=mini-tab</b>. Use o que você aprendeu nos projetos.",
    dicas: ["A role vira o ARN arn:aws:iam::123456789012:role/mini-role no create-function.", "O env entra com --environment Variables={TABELA=mini-tab}."],
    solucao: [
      "aws iam create-role --role-name mini-role --assume-role-policy-document file://trust.json",
      "aws dynamodb create-table --table-name mini-tab --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST",
      "aws lambda create-function --function-name mini-fn --runtime python3.12 --role arn:aws:iam::123456789012:role/mini-role --handler app.handler --zip-file fileb://app.zip",
      "aws lambda update-function-configuration --function-name mini-fn --environment Variables={TABELA=mini-tab}",
    ],
    validar: (conta) => {
      const f = conta.lambda.funcoes["mini-fn"];
      return !!conta.iam.roles["mini-role"] && !!conta.dynamodb.tabelas["mini-tab"] && !!f && f.env && f.env.TABELA === "mini-tab";
    },
  },
];

// --- Registra as seções (no fim, como tier "end-game") e os desafios ---
(function () {
  const SECOES_AVANCADAS = [
    { id: "adv-politicas", nome: "Políticas IAM", subtitulo: "Avançado · customer managed", icone: "🔐" },
    { id: "adv-query", nome: "Consultas & saída", subtitulo: "Avançado · --query / --output", icone: "🔎" },
    { id: "adv-gestao", nome: "Gestão & faxina", subtitulo: "Avançado · ciclo de vida", icone: "🧹" },
    { id: "adv-cegas", nome: "Missões cegas", subtitulo: "Avançado · poucas dicas", icone: "🧩" },
  ];
  for (const s of SECOES_AVANCADAS) SERVICOS_META.push(s);
  for (const d of DESAFIOS_AVANCADOS) DESAFIOS.push(d);
})();
