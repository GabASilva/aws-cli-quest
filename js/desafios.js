"use strict";
// ============================================================
// AWS CLI Quest — desafios.js
// Trilhas de desafios por serviço + projetos finais (sistemas completos)
//
// Cada desafio:
//   id, servico, nivel (1 básico / 2 intermediário / 3 avançado),
//   titulo, descricao, xp, dicas[], solucao[] (pro botão revelar),
//   validar(conta, cmd, ok) -> true quando o desafio foi cumprido.
//
// Projetos (tipo: "projeto") têm etapas[], cada uma com validar(conta)
// avaliada a cada comando bem-sucedido — vira um checklist na tela.
// ============================================================

const SERVICOS_META = [
  { id: "s3", nome: "S3", subtitulo: "Armazenamento de objetos", icone: "🪣" },
  { id: "ec2", nome: "EC2", subtitulo: "Máquinas virtuais", icone: "🖥️" },
  { id: "iam", nome: "IAM", subtitulo: "Usuários e permissões", icone: "👤" },
  { id: "lambda", nome: "Lambda", subtitulo: "Funções serverless", icone: "⚡" },
  { id: "dynamodb", nome: "DynamoDB", subtitulo: "Banco NoSQL", icone: "🗄️" },
  { id: "projetos", nome: "Projetos", subtitulo: "Sistemas completos", icone: "🏗️" },
];

const NOMES_NIVEL = { 1: "Básico", 2: "Intermediário", 3: "Avançado" };

function ehCmd(cmd, servico, sub) {
  return !!cmd && cmd.servico === servico && cmd.sub === sub;
}

const DESAFIOS = [
  // ==================== S3 ====================
  {
    id: "s3-1", servico: "s3", nivel: 1, xp: 50,
    titulo: "Seu primeiro bucket",
    descricao: "Tudo no S3 vive dentro de um bucket. Crie um bucket chamado <b>meu-primeiro-bucket</b>.",
    dicas: ["O comando de criar bucket é 'mb' (make bucket).", "Endereços do S3 começam com s3:// — digite 'aws s3 mb help'."],
    solucao: ["aws s3 mb s3://meu-primeiro-bucket"],
    validar: (conta) => !!conta.s3.buckets["meu-primeiro-bucket"],
  },
  {
    id: "s3-2", servico: "s3", nivel: 1, xp: 40,
    titulo: "Liste seus buckets",
    descricao: "Confira o que você tem: liste <b>todos os seus buckets</b>.",
    dicas: ["É o mesmo 'ls' do Linux, só que dentro do 'aws s3'.", "Sem argumento nenhum depois do ls."],
    solucao: ["aws s3 ls"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "s3", "ls") && cmd.posicionais.length === 0,
  },
  {
    id: "s3-3", servico: "s3", nivel: 1, xp: 60,
    titulo: "Suba um arquivo",
    descricao: "Existe um <b>relatorio.csv</b> no seu disco local (digite 'ls' pra conferir). Envie ele pro bucket <b>meu-primeiro-bucket</b>.",
    dicas: ["O comando de copiar é 'cp': origem primeiro, destino depois.", "O destino é s3://meu-primeiro-bucket/ — a barra no final mantém o nome do arquivo."],
    solucao: ["aws s3 cp relatorio.csv s3://meu-primeiro-bucket/"],
    validar: (conta) => {
      const b = conta.s3.buckets["meu-primeiro-bucket"];
      return !!b && !!b.objetos["relatorio.csv"];
    },
  },
  {
    id: "s3-4", servico: "s3", nivel: 1, xp: 50,
    titulo: "Liste os objetos",
    descricao: "Liste o <b>conteúdo</b> do bucket meu-primeiro-bucket pra ver o arquivo lá dentro.",
    dicas: ["Mesmo 'ls', mas agora passando o endereço s3:// do bucket."],
    solucao: ["aws s3 ls s3://meu-primeiro-bucket"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "s3", "ls") && cmd.posicionais.length === 1 && String(cmd.posicionais[0]).includes("meu-primeiro-bucket"),
  },
  {
    id: "s3-5", servico: "s3", nivel: 2, xp: 60,
    titulo: "Baixe de volta",
    descricao: "Agora o caminho inverso: <b>baixe</b> o relatorio.csv do bucket pro seu diretório atual.",
    dicas: ["Mesmo 'cp', só inverte: origem é o s3://, destino é ./"],
    solucao: ["aws s3 cp s3://meu-primeiro-bucket/relatorio.csv ./"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "s3", "cp") && String(cmd.posicionais[0] || "").startsWith("s3://") && !String(cmd.posicionais[1] || "").startsWith("s3://"),
  },
  {
    id: "s3-6", servico: "s3", nivel: 2, xp: 60,
    titulo: "Faxina no bucket",
    descricao: "Apague o objeto <b>relatorio.csv</b> de dentro do bucket meu-primeiro-bucket.",
    dicas: ["O comando é 'rm', apontando pro objeto: s3://bucket/chave."],
    solucao: ["aws s3 rm s3://meu-primeiro-bucket/relatorio.csv"],
    validar: (conta, cmd, ok) => {
      const b = conta.s3.buckets["meu-primeiro-bucket"];
      return ok && ehCmd(cmd, "s3", "rm") && !!b && !b.objetos["relatorio.csv"];
    },
  },
  {
    id: "s3-7", servico: "s3", nivel: 2, xp: 80,
    titulo: "Sincronize um site inteiro",
    descricao: "Existe uma pasta <b>./site</b> no disco local com vários arquivos. Sincronize ela inteira com o bucket meu-primeiro-bucket de uma vez só.",
    dicas: ["'cp' copia um arquivo; pra pasta inteira existe outro comando...", "aws s3 sync <pasta> <s3://bucket>"],
    solucao: ["aws s3 sync ./site s3://meu-primeiro-bucket"],
    validar: (conta) => {
      const b = conta.s3.buckets["meu-primeiro-bucket"];
      return !!b && !!b.objetos["index.html"] && !!b.objetos["css/estilo.css"];
    },
  },
  {
    id: "s3-8", servico: "s3", nivel: 2, xp: 80,
    titulo: "Crie e destrua",
    descricao: "Duas ações: crie um bucket chamado <b>bucket-temporario</b> e depois <b>remova ele</b>. Se tiver algo dentro, vai precisar de força extra.",
    dicas: ["Remover bucket é 'rb' (remove bucket).", "Bucket com objetos dentro só sai com --force."],
    solucao: ["aws s3 mb s3://bucket-temporario", "aws s3 rb s3://bucket-temporario"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "s3", "rb") && String(cmd.posicionais[0] || "").includes("bucket-temporario") && !conta.s3.buckets["bucket-temporario"],
  },
  {
    id: "s3-9", servico: "s3", nivel: 3, xp: 90,
    titulo: "Ative o versionamento",
    descricao: "Versionamento guarda o histórico de cada objeto. Ative o versionamento do bucket <b>meu-primeiro-bucket</b> usando o <b>s3api</b>.",
    dicas: ["É operação de baixo nível: aws s3api, não aws s3.", "O parâmetro é --versioning-configuration Status=Enabled."],
    solucao: ["aws s3api put-bucket-versioning --bucket meu-primeiro-bucket --versioning-configuration Status=Enabled"],
    validar: (conta) => {
      const b = conta.s3.buckets["meu-primeiro-bucket"];
      return !!b && b.versionamento === "Enabled";
    },
  },
  {
    id: "s3-10", servico: "s3", nivel: 3, xp: 90,
    titulo: "Política de acesso",
    descricao: "Aplique uma política de acesso ao bucket <b>meu-primeiro-bucket</b>. Existe um arquivo <b>politica-publica.json</b> pronto no disco local.",
    dicas: ["aws s3api put-bucket-policy", "Arquivos locais entram como file://politica-publica.json"],
    solucao: ["aws s3api put-bucket-policy --bucket meu-primeiro-bucket --policy file://politica-publica.json"],
    validar: (conta) => {
      const b = conta.s3.buckets["meu-primeiro-bucket"];
      return !!b && !!b.politica;
    },
  },
  {
    id: "s3-11", servico: "s3", nivel: 3, xp: 100,
    titulo: "Hospede um site",
    descricao: "Configure o bucket <b>meu-primeiro-bucket</b> como site estático, com <b>index.html</b> como página inicial.",
    dicas: ["Existe um comando 'website' no aws s3.", "O parâmetro da página inicial é --index-document."],
    solucao: ["aws s3 website s3://meu-primeiro-bucket --index-document index.html"],
    validar: (conta) => {
      const b = conta.s3.buckets["meu-primeiro-bucket"];
      return !!b && !!b.website && b.website.indice === "index.html";
    },
  },

  // ==================== EC2 ====================
  {
    id: "ec2-1", servico: "ec2", nivel: 1, xp: 40,
    titulo: "Olhe ao redor",
    descricao: "Antes de criar qualquer coisa, veja o que existe: <b>liste suas instâncias</b> EC2.",
    dicas: ["Na família ec2, os comandos de listar começam com 'describe-'."],
    solucao: ["aws ec2 describe-instances"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-instances"),
  },
  {
    id: "ec2-2", servico: "ec2", nivel: 1, xp: 80,
    titulo: "Sua primeira máquina",
    descricao: "Suba uma instância <b>t2.micro</b> usando a imagem <b>ami-0abcd1234ef567890</b>.",
    dicas: ["O comando é run-instances.", "Precisa de --image-id e --instance-type. Veja 'aws ec2 run-instances help'."],
    solucao: ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t2.micro"],
    validar: (conta) => Object.values(conta.ec2.instancias).some((i) => i.tipo === "t2.micro" && i.estado === "running"),
  },
  {
    id: "ec2-3", servico: "ec2", nivel: 1, xp: 60,
    titulo: "Pare a máquina",
    descricao: "Instância parada não cobra processamento. <b>Pare</b> a instância que você criou (pegue o id dela primeiro).",
    dicas: ["O id aparece no describe-instances (algo como i-0abc...).", "stop-instances --instance-ids <id>"],
    solucao: ["aws ec2 describe-instances", "aws ec2 stop-instances --instance-ids <id-da-instância>"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "ec2", "stop-instances") && Object.values(conta.ec2.instancias).some((i) => i.estado === "stopped"),
  },
  {
    id: "ec2-4", servico: "ec2", nivel: 2, xp: 60,
    titulo: "Ligue de novo",
    descricao: "Agora <b>ligue</b> a instância parada de volta.",
    dicas: ["O contrário de stop-instances..."],
    solucao: ["aws ec2 start-instances --instance-ids <id-da-instância>"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "ec2", "start-instances"),
  },
  {
    id: "ec2-5", servico: "ec2", nivel: 2, xp: 70,
    titulo: "Par de chaves",
    descricao: "Pra acessar máquinas via SSH você precisa de um par de chaves. Crie um chamado <b>minha-chave</b>.",
    dicas: ["aws ec2 create-key-pair --key-name ..."],
    solucao: ["aws ec2 create-key-pair --key-name minha-chave"],
    validar: (conta) => !!conta.ec2.keyPairs["minha-chave"],
  },
  {
    id: "ec2-6", servico: "ec2", nivel: 2, xp: 80,
    titulo: "Firewall: security group",
    descricao: "Crie um security group chamado <b>web-sg</b> com a descrição que você quiser.",
    dicas: ["create-security-group pede --group-name E --description.", "Descrição com espaços vai entre aspas."],
    solucao: ['aws ec2 create-security-group --group-name web-sg --description "Servidores web"'],
    validar: (conta) => Object.values(conta.ec2.securityGroups).some((g) => g.nome === "web-sg"),
  },
  {
    id: "ec2-7", servico: "ec2", nivel: 3, xp: 90,
    titulo: "Libere a porta 80",
    descricao: "Security group novo bloqueia tudo. Libere a <b>porta 80 (HTTP)</b> no <b>web-sg</b> pra qualquer IP do mundo.",
    dicas: ["O comando é authorize-security-group-ingress.", "Qualquer IP = --cidr 0.0.0.0/0, protocolo tcp."],
    solucao: ["aws ec2 authorize-security-group-ingress --group-name web-sg --protocol tcp --port 80 --cidr 0.0.0.0/0"],
    validar: (conta) => Object.values(conta.ec2.securityGroups).some((g) => g.nome === "web-sg" && g.regras.some((r) => r.porta === 80)),
  },
  {
    id: "ec2-8", servico: "ec2", nivel: 3, xp: 100,
    titulo: "Suba uma frota",
    descricao: "Suba <b>2 instâncias t3.small de uma vez</b>, já com a chave <b>minha-chave</b> associada.",
    dicas: ["Quantidade é --count.", "A chave entra com --key-name minha-chave."],
    solucao: ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.small --count 2 --key-name minha-chave"],
    validar: (conta) => Object.values(conta.ec2.instancias).filter((i) => i.tipo === "t3.small" && i.chave === "minha-chave").length >= 2,
  },
  {
    id: "ec2-9", servico: "ec2", nivel: 3, xp: 70,
    titulo: "Desligue tudo",
    descricao: "Fim do expediente: <b>encerre (terminate)</b> pelo menos uma instância. Encerrar é definitivo — diferente de parar.",
    dicas: ["terminate-instances --instance-ids <id> (aceita vários ids separados por espaço)."],
    solucao: ["aws ec2 terminate-instances --instance-ids <id-da-instância>"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "ec2", "terminate-instances"),
  },

  // ==================== IAM ====================
  {
    id: "iam-1", servico: "iam", nivel: 1, xp: 50,
    titulo: "Primeiro usuário",
    descricao: "A Ana entrou no time. Crie um usuário IAM chamado <b>ana</b>.",
    dicas: ["aws iam create-user, e o parâmetro do nome é --user-name."],
    solucao: ["aws iam create-user --user-name ana"],
    validar: (conta) => !!conta.iam.usuarios["ana"],
  },
  {
    id: "iam-2", servico: "iam", nivel: 1, xp: 40,
    titulo: "Quem está na conta?",
    descricao: "Liste <b>todos os usuários</b> da conta pra conferir.",
    dicas: ["list-users, sem parâmetros."],
    solucao: ["aws iam list-users"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "iam", "list-users"),
  },
  {
    id: "iam-3", servico: "iam", nivel: 1, xp: 60,
    titulo: "Crie um grupo",
    descricao: "Dar permissão um a um não escala. Crie um grupo chamado <b>devs</b>.",
    dicas: ["create-group, e o parâmetro é --group-name."],
    solucao: ["aws iam create-group --group-name devs"],
    validar: (conta) => !!conta.iam.grupos["devs"],
  },
  {
    id: "iam-4", servico: "iam", nivel: 2, xp: 70,
    titulo: "Ana entra no time",
    descricao: "Coloque a usuária <b>ana</b> dentro do grupo <b>devs</b>.",
    dicas: ["add-user-to-group precisa de --user-name E --group-name."],
    solucao: ["aws iam add-user-to-group --user-name ana --group-name devs"],
    validar: (conta) => !!conta.iam.grupos["devs"] && conta.iam.grupos["devs"].membros.includes("ana"),
  },
  {
    id: "iam-5", servico: "iam", nivel: 2, xp: 80,
    titulo: "Permissão pro grupo",
    descricao: "Dê ao grupo <b>devs</b> a política gerenciada <b>AmazonS3ReadOnlyAccess</b> (todo mundo do grupo herda).",
    dicas: ["attach-group-policy, com --policy-arn.", "O ARN é arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess — veja 'aws iam help'."],
    solucao: ["aws iam attach-group-policy --group-name devs --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"],
    validar: (conta) => !!conta.iam.grupos["devs"] && conta.iam.grupos["devs"].politicas.some((p) => p.includes("AmazonS3ReadOnlyAccess")),
  },
  {
    id: "iam-6", servico: "iam", nivel: 3, xp: 90,
    titulo: "Crie uma role",
    descricao: "Serviços (como o Lambda) assumem <b>roles</b>, não usuários. Crie a role <b>papel-lambda</b> usando o arquivo <b>trust.json</b> do disco local como trust policy.",
    dicas: ["create-role pede --role-name e --assume-role-policy-document.", "Arquivo local entra como file://trust.json."],
    solucao: ["aws iam create-role --role-name papel-lambda --assume-role-policy-document file://trust.json"],
    validar: (conta) => !!conta.iam.roles["papel-lambda"],
  },
  {
    id: "iam-7", servico: "iam", nivel: 3, xp: 90,
    titulo: "Permissão pra role",
    descricao: "Anexe à role <b>papel-lambda</b> a política <b>AWSLambdaBasicExecutionRole</b> (deixa a função escrever logs).",
    dicas: ["attach-role-policy.", "O ARN dessa política tem 'service-role' no meio: arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"],
    solucao: ["aws iam attach-role-policy --role-name papel-lambda --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"],
    validar: (conta) => !!conta.iam.roles["papel-lambda"] && conta.iam.roles["papel-lambda"].politicas.some((p) => p.includes("AWSLambdaBasicExecutionRole")),
  },

  // ==================== Lambda ====================
  {
    id: "lam-1", servico: "lambda", nivel: 1, xp: 40,
    titulo: "Alguma função por aí?",
    descricao: "Comece pelo básico: <b>liste as funções</b> Lambda da conta.",
    dicas: ["list-functions, sem parâmetros."],
    solucao: ["aws lambda list-functions"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "lambda", "list-functions"),
  },
  {
    id: "lam-2", servico: "lambda", nivel: 2, xp: 110,
    titulo: "Olá, mundo serverless",
    descricao: "Crie a função <b>ola-mundo</b>: runtime <b>python3.12</b>, handler <b>app.handler</b>, código <b>app.zip</b> (existe no disco local) e role <b>arn:aws:iam::123456789012:role/papel-lambda</b>.",
    dicas: ["São 5 parâmetros: --function-name, --runtime, --role, --handler, --zip-file.", "O zip entra como fileb://app.zip (com b de binário). Veja 'aws lambda create-function help'."],
    solucao: ["aws lambda create-function --function-name ola-mundo --runtime python3.12 --role arn:aws:iam::123456789012:role/papel-lambda --handler app.handler --zip-file fileb://app.zip"],
    validar: (conta) => !!conta.lambda.funcoes["ola-mundo"] && conta.lambda.funcoes["ola-mundo"].runtime === "python3.12",
  },
  {
    id: "lam-3", servico: "lambda", nivel: 2, xp: 80,
    titulo: "Execute a função",
    descricao: "Função criada não serve de nada parada: <b>invoque</b> a ola-mundo, salvando a resposta em <b>saida.json</b>.",
    dicas: ["aws lambda invoke --function-name <nome> <arquivo-de-saida>"],
    solucao: ["aws lambda invoke --function-name ola-mundo saida.json"],
    validar: (conta) => !!conta.lambda.funcoes["ola-mundo"] && conta.lambda.funcoes["ola-mundo"].invocada,
  },
  {
    id: "lam-4", servico: "lambda", nivel: 3, xp: 90,
    titulo: "Mais músculo",
    descricao: "A ola-mundo está estourando o tempo. Ajuste a configuração dela: <b>timeout de 30s</b> e <b>256 MB</b> de memória.",
    dicas: ["update-function-configuration aceita --timeout e --memory-size juntos."],
    solucao: ["aws lambda update-function-configuration --function-name ola-mundo --timeout 30 --memory-size 256"],
    validar: (conta) => {
      const f = conta.lambda.funcoes["ola-mundo"];
      return !!f && f.timeout === 30 && f.memoria === 256;
    },
  },
  {
    id: "lam-5", servico: "lambda", nivel: 3, xp: 90,
    titulo: "Variável de ambiente",
    descricao: "Configure na função <b>ola-mundo</b> a variável de ambiente <b>TABELA</b> com o valor <b>pedidos</b>.",
    dicas: ["É o parâmetro --environment do update-function-configuration.", "Formato: --environment Variables={TABELA=pedidos}"],
    solucao: ["aws lambda update-function-configuration --function-name ola-mundo --environment Variables={TABELA=pedidos}"],
    validar: (conta) => {
      const f = conta.lambda.funcoes["ola-mundo"];
      return !!f && f.env && f.env.TABELA === "pedidos";
    },
  },

  // ==================== DynamoDB ====================
  {
    id: "dyn-1", servico: "dynamodb", nivel: 1, xp: 40,
    titulo: "Quais tabelas existem?",
    descricao: "Comece listando as <b>tabelas</b> do DynamoDB.",
    dicas: ["list-tables, sem parâmetros."],
    solucao: ["aws dynamodb list-tables"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "dynamodb", "list-tables"),
  },
  {
    id: "dyn-2", servico: "dynamodb", nivel: 2, xp: 120,
    titulo: "Crie a tabela clientes",
    descricao: "Crie a tabela <b>clientes</b> com chave primária <b>id</b> (tipo string), no modo de cobrança <b>por requisição</b>. É o comando mais longo até agora — o manual é seu amigo.",
    dicas: ["Veja 'aws dynamodb create-table help' — tem o exemplo completo.", "São 4 parâmetros: --table-name, --attribute-definitions, --key-schema e --billing-mode PAY_PER_REQUEST."],
    solucao: ["aws dynamodb create-table --table-name clientes --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST"],
    validar: (conta) => {
      const t = conta.dynamodb.tabelas["clientes"];
      return !!t && t.esquema.some((k) => k.AttributeName === "id" && k.KeyType === "HASH");
    },
  },
  {
    id: "dyn-3", servico: "dynamodb", nivel: 2, xp: 90,
    titulo: "Primeiro registro",
    descricao: "Insira na tabela <b>clientes</b> um item com <b>id \"1\"</b> e <b>nome \"Ana\"</b>.",
    dicas: ["put-item com --item recebendo JSON no formato do DynamoDB.", "Cada valor declara o tipo: '{\"id\": {\"S\": \"1\"}, \"nome\": {\"S\": \"Ana\"}}' — aspas simples por fora."],
    solucao: ["aws dynamodb put-item --table-name clientes --item '{\"id\": {\"S\": \"1\"}, \"nome\": {\"S\": \"Ana\"}}'"],
    validar: (conta) => {
      const t = conta.dynamodb.tabelas["clientes"];
      return !!t && t.itens.some((i) => i.id && i.id.S === "1" && i.nome);
    },
  },
  {
    id: "dyn-4", servico: "dynamodb", nivel: 3, xp: 80,
    titulo: "Busque pela chave",
    descricao: "Busque o item de <b>id \"1\"</b> na tabela clientes usando <b>get-item</b>.",
    dicas: ["O parâmetro é --key, com JSON só da chave: '{\"id\": {\"S\": \"1\"}}'"],
    solucao: ["aws dynamodb get-item --table-name clientes --key '{\"id\": {\"S\": \"1\"}}'"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "dynamodb", "get-item") && cmd.flags["table-name"] === "clientes",
  },
  {
    id: "dyn-5", servico: "dynamodb", nivel: 3, xp: 70,
    titulo: "Varra a tabela",
    descricao: "Liste <b>todos os itens</b> da tabela clientes com um scan.",
    dicas: ["aws dynamodb scan --table-name clientes"],
    solucao: ["aws dynamodb scan --table-name clientes"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "dynamodb", "scan") && cmd.flags["table-name"] === "clientes",
  },

  // ==================== PROJETOS (sistemas completos) ====================
  {
    id: "proj-site", servico: "projetos", tipo: "projeto", nivel: 3, xp: 300,
    requisitos: ["s3"],
    titulo: "🌐 Projeto: Site no ar",
    descricao: "Monte uma hospedagem completa de site estático, do zero, só com CLI. Use o bucket <b>portfolio-dev</b>. As etapas podem ser feitas em qualquer ordem — o checklist marca sozinho.",
    dicas: ["Tudo que você precisa aprendeu na trilha do S3.", "A pasta ./site tem os arquivos; o erro404.html está solto na raiz do disco local."],
    solucao: [
      "aws s3 mb s3://portfolio-dev",
      "aws s3 sync ./site s3://portfolio-dev",
      "aws s3 cp erro404.html s3://portfolio-dev/",
      "aws s3 website s3://portfolio-dev --index-document index.html --error-document erro404.html",
      "aws s3api put-bucket-policy --bucket portfolio-dev --policy file://politica-publica.json",
    ],
    etapas: [
      { texto: "Criar o bucket portfolio-dev", validar: (conta) => !!conta.s3.buckets["portfolio-dev"] },
      { texto: "Subir o site (index.html) e a página de erro (erro404.html) pro bucket", validar: (conta) => {
        const b = conta.s3.buckets["portfolio-dev"];
        return !!b && !!b.objetos["index.html"] && !!b.objetos["erro404.html"];
      } },
      { texto: "Configurar hospedagem web com index.html e erro404.html", validar: (conta) => {
        const b = conta.s3.buckets["portfolio-dev"];
        return !!b && !!b.website && b.website.indice === "index.html" && b.website.erro === "erro404.html";
      } },
      { texto: "Aplicar a política de leitura pública (politica-publica.json)", validar: (conta) => {
        const b = conta.s3.buckets["portfolio-dev"];
        return !!b && !!b.politica;
      } },
    ],
  },
  {
    id: "proj-web", servico: "projetos", tipo: "projeto", nivel: 3, xp: 350,
    requisitos: ["ec2"],
    titulo: "🖥️ Projeto: Servidor de produção",
    descricao: "Prepare um servidor web de produção: chave de acesso, firewall liberando HTTP e SSH, e a máquina no ar já amarrada nos dois.",
    dicas: ["Crie chave e security group ANTES da instância — run-instances valida que eles existem.", "São duas regras de ingress: porta 80 e porta 22."],
    solucao: [
      "aws ec2 create-key-pair --key-name chave-prod",
      'aws ec2 create-security-group --group-name servidor-web --description "Producao"',
      "aws ec2 authorize-security-group-ingress --group-name servidor-web --protocol tcp --port 80 --cidr 0.0.0.0/0",
      "aws ec2 authorize-security-group-ingress --group-name servidor-web --protocol tcp --port 22 --cidr 0.0.0.0/0",
      "aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.micro --key-name chave-prod --security-groups servidor-web",
    ],
    etapas: [
      { texto: "Criar o par de chaves chave-prod", validar: (conta) => !!conta.ec2.keyPairs["chave-prod"] },
      { texto: "Criar o security group servidor-web", validar: (conta) => Object.values(conta.ec2.securityGroups).some((g) => g.nome === "servidor-web") },
      { texto: "Liberar as portas 80 (HTTP) e 22 (SSH) no servidor-web", validar: (conta) => {
        const g = Object.values(conta.ec2.securityGroups).find((x) => x.nome === "servidor-web");
        return !!g && g.regras.some((r) => r.porta === 80) && g.regras.some((r) => r.porta === 22);
      } },
      { texto: "Subir uma instância t3.micro com a chave-prod e o security group servidor-web", validar: (conta) => {
        return Object.values(conta.ec2.instancias).some((i) => i.tipo === "t3.micro" && i.chave === "chave-prod" && i.sgs.includes("servidor-web") && i.estado === "running");
      } },
    ],
  },
  {
    id: "proj-time", servico: "projetos", tipo: "projeto", nivel: 3, xp: 350,
    requisitos: ["iam"],
    titulo: "👥 Projeto: Onboarding do time",
    descricao: "Chegaram dois devs novos: <b>joao</b> e <b>maria</b>. Monte a estrutura de acesso: um grupo <b>time-backend</b> com permissão total no DynamoDB, e os dois lá dentro.",
    dicas: ["A política é arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess.", "São 2 create-user, 1 create-group, 1 attach-group-policy e 2 add-user-to-group."],
    solucao: [
      "aws iam create-group --group-name time-backend",
      "aws iam attach-group-policy --group-name time-backend --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
      "aws iam create-user --user-name joao",
      "aws iam create-user --user-name maria",
      "aws iam add-user-to-group --user-name joao --group-name time-backend",
      "aws iam add-user-to-group --user-name maria --group-name time-backend",
    ],
    etapas: [
      { texto: "Criar o grupo time-backend", validar: (conta) => !!conta.iam.grupos["time-backend"] },
      { texto: "Anexar a política AmazonDynamoDBFullAccess ao grupo", validar: (conta) => {
        const g = conta.iam.grupos["time-backend"];
        return !!g && g.politicas.some((p) => p.includes("AmazonDynamoDBFullAccess"));
      } },
      { texto: "Criar os usuários joao e maria", validar: (conta) => !!conta.iam.usuarios["joao"] && !!conta.iam.usuarios["maria"] },
      { texto: "Colocar os dois no grupo", validar: (conta) => {
        const g = conta.iam.grupos["time-backend"];
        return !!g && g.membros.includes("joao") && g.membros.includes("maria");
      } },
    ],
  },
  {
    id: "proj-serverless", servico: "projetos", tipo: "projeto", nivel: 3, xp: 500,
    requisitos: ["iam", "lambda", "dynamodb"],
    titulo: "⚡ Projeto: API Serverless completa",
    descricao: "O desafio final: uma API de pedidos 100% serverless. Role com permissões, tabela no DynamoDB, função Lambda apontando pra tabela via variável de ambiente, e o teste de fogo: invocar.",
    dicas: [
      "Ordem sugerida: role → política → tabela → função → env → invoke.",
      "A role criada vira o ARN arn:aws:iam::123456789012:role/papel-api no create-function.",
      "A variável de ambiente entra com --environment Variables={TABELA=pedidos}.",
    ],
    solucao: [
      "aws iam create-role --role-name papel-api --assume-role-policy-document file://trust.json",
      "aws iam attach-role-policy --role-name papel-api --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      "aws dynamodb create-table --table-name pedidos --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST",
      "aws lambda create-function --function-name api-pedidos --runtime python3.12 --role arn:aws:iam::123456789012:role/papel-api --handler app.handler --zip-file fileb://app.zip",
      "aws lambda update-function-configuration --function-name api-pedidos --environment Variables={TABELA=pedidos}",
      "aws lambda invoke --function-name api-pedidos saida.json",
    ],
    etapas: [
      { texto: "Criar a role papel-api (trust.json)", validar: (conta) => !!conta.iam.roles["papel-api"] },
      { texto: "Anexar a AWSLambdaBasicExecutionRole à role", validar: (conta) => {
        const r = conta.iam.roles["papel-api"];
        return !!r && r.politicas.some((p) => p.includes("AWSLambdaBasicExecutionRole"));
      } },
      { texto: "Criar a tabela pedidos (chave id, tipo S)", validar: (conta) => {
        const t = conta.dynamodb.tabelas["pedidos"];
        return !!t && t.esquema.some((k) => k.AttributeName === "id" && k.KeyType === "HASH");
      } },
      { texto: "Criar a função api-pedidos", validar: (conta) => !!conta.lambda.funcoes["api-pedidos"] },
      { texto: "Configurar a variável de ambiente TABELA=pedidos na função", validar: (conta) => {
        const f = conta.lambda.funcoes["api-pedidos"];
        return !!f && f.env && f.env.TABELA === "pedidos";
      } },
      { texto: "Invocar a api-pedidos", validar: (conta) => {
        const f = conta.lambda.funcoes["api-pedidos"];
        return !!f && f.invocada;
      } },
    ],
  },
];

function desafiosDoServico(servicoId) {
  return DESAFIOS.filter((d) => d.servico === servicoId);
}

function obterDesafio(id) {
  return DESAFIOS.find((d) => d.id === id) || null;
}
