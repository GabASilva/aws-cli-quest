"use strict";
// ============================================================
// AWS CLI Quest — erros-amigaveis.js
// Traduz o erro cru do CLI numa explicação em português + como corrigir.
// NÃO altera o core: faz "wrap" da função global imprimir(). Quando uma
// linha sai com a classe "erro", a gente acrescenta a explicação embaixo.
// ============================================================

// Regras na ordem: a primeira que casar vence. `msg` pode ser texto fixo
// ou uma função que recebe o texto do erro (pra extrair detalhes).
const REGRAS_ERRO = [
  [/comando não encontrado/i, "Esse comando não existe aqui. O terminal entende 'aws ...', além de 'ls', 'clear' e 'help'."],
  [/argument command: Invalid choice/i, "Esse serviço da AWS não existe (ou tem um erro de digitação). Veja a lista com 'aws help'."],
  [/Comandos de '/i, "Esse comando não existe nesse serviço. Veja os disponíveis com 'aws <serviço> help'."],
  [/the following arguments are required: --([\w-]+)/i, (t) => {
    const m = /required: --([\w-]+)/i.exec(t);
    return `Faltou o argumento obrigatório --${m[1]}. Veja o formato certinho com '<comando> help'.`;
  }],

  // S3
  [/BucketAlreadyOwnedByYou/i, "Esse bucket já é seu — nome de bucket não se repete. Pode seguir, ou escolha outro nome."],
  [/BucketNotEmpty/i, "O bucket tem objetos dentro. Adicione --force pra apagar o bucket junto com o conteúdo."],
  [/NoSuchBucket/i, "Esse bucket não existe. Confira o nome com 'aws s3 ls'."],
  [/(InvalidBucketName|nome de bucket inválido)/i, "Nome de bucket inválido: use de 3 a 63 caracteres, só letras minúsculas, números e hífens."],
  [/upload failed/i, "O arquivo local não existe. Veja o que está disponível digitando 'ls'."],
  [/NoSuchBucketPolicy/i, "Esse bucket ainda não tem política. Defina uma com 'aws s3api put-bucket-policy'."],

  // EC2
  [/InvalidAMIID/i, "O id da imagem (AMI) está errado. Use o formato ami-0abcd1234ef567890."],
  [/Invalid value.*InstanceType|InstanceType/i, "Esse tipo de instância não é aceito aqui. Exemplos: t2.micro, t3.small, t3.medium."],
  [/InvalidInstanceID\.NotFound/i, "Não existe instância com esse id. Pegue o id certo com 'aws ec2 describe-instances'."],
  [/InvalidKeyPair\.NotFound/i, "Esse par de chaves não existe. Crie antes com 'aws ec2 create-key-pair --key-name <nome>'."],
  [/InvalidKeyPair\.Duplicate/i, "Já existe um par de chaves com esse nome."],
  [/InvalidGroup\.NotFound/i, "Esse security group não existe. Crie com 'aws ec2 create-security-group' antes de usá-lo."],
  [/InvalidGroup\.Duplicate/i, "Já existe um security group com esse nome."],
  [/CIDR inválido/i, "Faixa de IP inválida. Use algo como 0.0.0.0/0 (qualquer IP) ou 10.0.0.0/24."],

  // IAM
  [/policy-arn|ARN .* not valid|is not valid/i, "O ARN da política parece errado. Ex.: arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess."],
  [/EntityAlreadyExists/i, "Já existe um recurso IAM (usuário/grupo/role) com esse nome."],
  [/NoSuchEntity/i, "Esse recurso IAM (usuário/grupo/role) não existe. Confira o nome com 'list-users', 'list-groups' ou 'list-roles'."],
  [/MalformedPolicy|Policies must be valid JSON/i, "A política precisa ser um JSON válido. Use o arquivo pronto: file://politica-publica.json."],

  // Lambda
  [/Role ARN inválido|failed to satisfy constraint.*Role/i, "O ARN da role está errado. Ex.: arn:aws:iam::123456789012:role/papel-lambda."],
  [/(runtime|Runtimes aceitos)/i, "Esse runtime não é aceito. Exemplos: python3.12, nodejs20.x, java21."],
  [/fileb:\/\//i, "Use fileb://<arquivo.zip> apontando pra um arquivo que existe. Veja com 'ls' (tem um app.zip pronto)."],
  [/ResourceConflictException|Function already exist/i, "Já existe uma função Lambda com esse nome."],
  [/ResourceNotFoundException.*[Ff]unction|Function not found/i, "Essa função Lambda não existe. Veja as suas com 'aws lambda list-functions'."],
  [/--timeout/i, "O timeout precisa estar entre 1 e 900 segundos."],
  [/--memory-size/i, "A memória precisa estar entre 128 e 10240 MB."],

  // DynamoDB
  [/ResourceInUseException|Table already exists/i, "Já existe uma tabela com esse nome."],
  [/ResourceNotFoundException.*[Tt]able|Table:.*not found/i, "Essa tabela não existe. Veja as suas com 'aws dynamodb list-tables'."],
  [/Some index key attributes are not defined/i, "A chave usada no --key-schema precisa estar declarada também no --attribute-definitions."],
  [/billing-mode|PAY_PER_REQUEST/i, "Informe a cobrança: --billing-mode PAY_PER_REQUEST (mais simples) ou --provisioned-throughput."],
  [/Missing the key/i, "Faltou a chave primária no item. Ela é obrigatória no put-item."],
  [/AttributeType=<S\|N\|B>|attribute-definitions precisa/i, "Cada atributo precisa de tipo: S (texto), N (número) ou B (binário)."],

  // Genéricos de parsing
  [/Invalid JSON|Error parsing parameter.*JSON/i, "O JSON está malformado. Dica: aspas simples por fora, ex.: '{\"id\": {\"S\": \"1\"}}'."],
  [/valor shorthand inválido|Formato esperado: Chave/i, "Formato shorthand errado. Use Chave=valor,Chave2=valor2 (sem espaços, separado por vírgula)."],
  [/aspas não fechadas/i, "Você abriu aspas (' ou \") e não fechou."],
];

function explicarErro(texto) {
  for (const [re, msg] of REGRAS_ERRO) {
    if (re.test(texto)) {
      return typeof msg === "function" ? msg(texto) : msg;
    }
  }
  return null;
}

// --- Wrap da função global imprimir (definida em app.js) ---
(function () {
  if (typeof window === "undefined" || typeof window.imprimir !== "function") return;
  const imprimirOriginal = window.imprimir;
  window.imprimir = function (texto, classe) {
    imprimirOriginal(texto, classe);
    if (classe === "erro" && texto) {
      const dica = explicarErro(String(texto));
      if (dica) imprimirOriginal("💡 " + dica, "dica-erro");
    }
  };
})();
