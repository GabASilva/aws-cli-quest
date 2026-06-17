"use strict";
// ============================================================
// AWS CLI Quest — missoes.js
//  1) +30 missões na seção "Missões relâmpago" (drills rápidos, variados).
//  2) "Desafio do dia": um desafio fixo por data (igual pra todos), com bônus.
//  3) "Treino aleatório": banco de 40 atividades (fácil→avançado) que ficam
//     rodando aleatoriamente — termina uma, já vem outra.
//
// ADITIVO: empurra os desafios em DESAFIOS (dados, sem window), e injeta a
// faixa do "Desafio do dia"/"Treino" + faz wrap de verificarDesafios pra tratar
// os desafios "avulsos" (banco) sem mexer no fluxo normal (app.js intacto).
// ============================================================

// ---------- helpers de validação ----------
const _b = (c, n) => !!c.s3.buckets[n];
const _u = (c, n) => !!c.iam.usuarios[n];
const _g = (c, n) => !!c.iam.grupos[n];
const _r = (c, n) => !!c.iam.roles[n];
const _p = (c, n) => !!c.iam.policies[n];
const _t = (c, n) => !!c.dynamodb.tabelas[n];
const _k = (c, n) => !!c.ec2.keyPairs[n];
const _f = (c, n) => !!c.lambda.funcoes[n];
const _sg = (c, n) => Object.values(c.ec2.securityGroups).some((x) => x.nome === n);
const _inst = (c, t) => Object.values(c.ec2.instancias).some((i) => i.tipo === t && i.estado === "running");
const _arq = (c, n) => !!(c.arquivosSalvos || {})[n];
const _fsno = (c, rel) => (typeof noRelHome === "function" ? noRelHome(c, rel) : null);

// ================== 30 MISSÕES RELÂMPAGO ==================
const RELAMPAGO_EXTRA = [
  // S3
  { servico: "extras-relampago", nivel: 1, xp: 30, titulo: "Bucket de mídia", descricao: "Crie o bucket <b>midia-2026</b>.", dicas: ["aws s3 mb s3://midia-2026"], solucao: ["aws s3 mb s3://midia-2026"], validar: (c) => _b(c, "midia-2026") },
  { servico: "extras-relampago", nivel: 1, xp: 30, titulo: "Bucket de relatórios", descricao: "Crie o bucket <b>relatorios-q1</b>.", dicas: ["aws s3 mb s3://relatorios-q1"], solucao: ["aws s3 mb s3://relatorios-q1"], validar: (c) => _b(c, "relatorios-q1") },
  { servico: "extras-relampago", nivel: 1, xp: 30, titulo: "Liste os buckets", descricao: "Liste todos os seus buckets.", dicas: ["aws s3 ls"], solucao: ["aws s3 ls"], validar: (c, cmd, ok) => ok && ehCmd(cmd, "s3", "ls") && cmd.posicionais.length === 0 },
  { servico: "extras-relampago", nivel: 2, xp: 40, titulo: "Buckets em JSON", descricao: "Liste os buckets pelo <b>s3api</b> (saída JSON).", dicas: ["aws s3api list-buckets"], solucao: ["aws s3api list-buckets"], validar: (c, cmd, ok) => ok && ehCmd(cmd, "s3api", "list-buckets") },
  // EC2
  { servico: "extras-relampago", nivel: 2, xp: 40, titulo: "Suba uma t2.nano", descricao: "Suba uma instância <b>t2.nano</b> (imagem ami-0abcd1234ef567890).", dicas: ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t2.nano"], solucao: ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t2.nano"], validar: (c) => _inst(c, "t2.nano") },
  { servico: "extras-relampago", nivel: 1, xp: 30, titulo: "Chave de deploy", descricao: "Crie o par de chaves <b>deploy-key</b>.", dicas: ["aws ec2 create-key-pair --key-name deploy-key"], solucao: ["aws ec2 create-key-pair --key-name deploy-key"], validar: (c) => _k(c, "deploy-key") },
  { servico: "extras-relampago", nivel: 2, xp: 40, titulo: "Grupo de segurança da API", descricao: "Crie o security group <b>api-sg</b> (descrição livre).", dicas: ['aws ec2 create-security-group --group-name api-sg --description "API"'], solucao: ['aws ec2 create-security-group --group-name api-sg --description "API"'], validar: (c) => _sg(c, "api-sg") },
  { servico: "extras-relampago", nivel: 1, xp: 30, titulo: "Veja as instâncias", descricao: "Liste as instâncias EC2.", dicas: ["aws ec2 describe-instances"], solucao: ["aws ec2 describe-instances"], validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-instances") },
  { servico: "extras-relampago", nivel: 2, xp: 40, titulo: "Liste os pares de chave", descricao: "Liste os key pairs da conta.", dicas: ["aws ec2 describe-key-pairs"], solucao: ["aws ec2 describe-key-pairs"], validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-key-pairs") },
  // IAM
  { servico: "extras-relampago", nivel: 1, xp: 30, titulo: "Nova usuária: Carla", descricao: "Crie a usuária <b>carla</b>.", dicas: ["aws iam create-user --user-name carla"], solucao: ["aws iam create-user --user-name carla"], validar: (c) => _u(c, "carla") },
  { servico: "extras-relampago", nivel: 1, xp: 30, titulo: "Novo usuário: Diego", descricao: "Crie o usuário <b>diego</b>.", dicas: ["aws iam create-user --user-name diego"], solucao: ["aws iam create-user --user-name diego"], validar: (c) => _u(c, "diego") },
  { servico: "extras-relampago", nivel: 1, xp: 30, titulo: "Grupo de auditores", descricao: "Crie o grupo <b>auditores</b>.", dicas: ["aws iam create-group --group-name auditores"], solucao: ["aws iam create-group --group-name auditores"], validar: (c) => _g(c, "auditores") },
  { servico: "extras-relampago", nivel: 1, xp: 30, titulo: "Quem está na conta?", descricao: "Liste os usuários IAM.", dicas: ["aws iam list-users"], solucao: ["aws iam list-users"], validar: (c, cmd, ok) => ok && ehCmd(cmd, "iam", "list-users") },
  { servico: "extras-relampago", nivel: 1, xp: 30, titulo: "Liste os grupos", descricao: "Liste os grupos IAM.", dicas: ["aws iam list-groups"], solucao: ["aws iam list-groups"], validar: (c, cmd, ok) => ok && ehCmd(cmd, "iam", "list-groups") },
  { servico: "extras-relampago", nivel: 2, xp: 50, titulo: "Role pra EC2", descricao: "Crie a role <b>ec2-role</b> (use file://trust.json).", dicas: ["aws iam create-role --role-name ec2-role --assume-role-policy-document file://trust.json"], solucao: ["aws iam create-role --role-name ec2-role --assume-role-policy-document file://trust.json"], validar: (c) => _r(c, "ec2-role") },
  { servico: "extras-relampago", nivel: 2, xp: 40, titulo: "Liste as roles", descricao: "Liste as roles da conta.", dicas: ["aws iam list-roles"], solucao: ["aws iam list-roles"], validar: (c, cmd, ok) => ok && ehCmd(cmd, "iam", "list-roles") },
  { servico: "extras-relampago", nivel: 2, xp: 50, titulo: "Política só-leitura", descricao: "Crie a política <b>so-leitura</b> (file://politica-publica.json).", dicas: ["aws iam create-policy --policy-name so-leitura --policy-document file://politica-publica.json"], solucao: ["aws iam create-policy --policy-name so-leitura --policy-document file://politica-publica.json"], validar: (c) => _p(c, "so-leitura") },
  { servico: "extras-relampago", nivel: 2, xp: 40, titulo: "Liste as políticas locais", descricao: "Liste as políticas gerenciadas pelo cliente.", dicas: ["aws iam list-policies --scope Local"], solucao: ["aws iam list-policies --scope Local"], validar: (c, cmd, ok) => ok && ehCmd(cmd, "iam", "list-policies") && cmd.flags.scope === "Local" },
  // Lambda
  { servico: "extras-relampago", nivel: 1, xp: 30, titulo: "Tem função aí?", descricao: "Liste as funções Lambda.", dicas: ["aws lambda list-functions"], solucao: ["aws lambda list-functions"], validar: (c, cmd, ok) => ok && ehCmd(cmd, "lambda", "list-functions") },
  { servico: "extras-relampago", nivel: 2, xp: 60, titulo: "Função de saudação", descricao: "Crie a função <b>saudacao</b> (python3.12, role arn:aws:iam::123456789012:role/papel-lambda, app.zip).", dicas: ["aws lambda create-function --function-name saudacao --runtime python3.12 --role arn:aws:iam::123456789012:role/papel-lambda --handler app.handler --zip-file fileb://app.zip"], solucao: ["aws lambda create-function --function-name saudacao --runtime python3.12 --role arn:aws:iam::123456789012:role/papel-lambda --handler app.handler --zip-file fileb://app.zip"], validar: (c) => _f(c, "saudacao") },
  // DynamoDB
  { servico: "extras-relampago", nivel: 2, xp: 50, titulo: "Tabela de produtos", descricao: "Crie a tabela <b>produtos-v2</b> (chave sku, texto).", dicas: ["aws dynamodb create-table --table-name produtos-v2 --attribute-definitions AttributeName=sku,AttributeType=S --key-schema AttributeName=sku,KeyType=HASH --billing-mode PAY_PER_REQUEST"], solucao: ["aws dynamodb create-table --table-name produtos-v2 --attribute-definitions AttributeName=sku,AttributeType=S --key-schema AttributeName=sku,KeyType=HASH --billing-mode PAY_PER_REQUEST"], validar: (c) => _t(c, "produtos-v2") },
  { servico: "extras-relampago", nivel: 2, xp: 50, titulo: "Tabela de sessões", descricao: "Crie a tabela <b>sessoes</b> (chave token, texto).", dicas: ["...AttributeName=token,AttributeType=S ... KeyType=HASH"], solucao: ["aws dynamodb create-table --table-name sessoes --attribute-definitions AttributeName=token,AttributeType=S --key-schema AttributeName=token,KeyType=HASH --billing-mode PAY_PER_REQUEST"], validar: (c) => _t(c, "sessoes") },
  { servico: "extras-relampago", nivel: 2, xp: 60, titulo: "Tabela de métricas (numérica)", descricao: "Crie a tabela <b>metricas</b> com chave <b>id</b> do tipo <b>número</b> (AttributeType=N).", dicas: ["O tipo da chave aqui é N (número), não S."], solucao: ["aws dynamodb create-table --table-name metricas --attribute-definitions AttributeName=id,AttributeType=N --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST"], validar: (c) => { const t = c.dynamodb.tabelas["metricas"]; return !!t && t.defs.some((d) => d.AttributeName === "id" && d.AttributeType === "N"); } },
  { servico: "extras-relampago", nivel: 1, xp: 30, titulo: "Liste as tabelas", descricao: "Liste as tabelas do DynamoDB.", dicas: ["aws dynamodb list-tables"], solucao: ["aws dynamodb list-tables"], validar: (c, cmd, ok) => ok && ehCmd(cmd, "dynamodb", "list-tables") },
  // misc / combos rápidos
  { servico: "extras-relampago", nivel: 1, xp: 30, titulo: "Confirme a identidade", descricao: "Mostre a identidade da sessão (sts).", dicas: ["aws sts get-caller-identity"], solucao: ["aws sts get-caller-identity"], validar: (c, cmd, ok) => ok && ehCmd(cmd, "sts", "get-caller-identity") },
  { servico: "extras-relampago", nivel: 2, xp: 50, titulo: "Versão de bucket", descricao: "Crie o bucket <b>arquivo-morto</b> e <b>ligue o versionamento</b> nele.", dicas: ["mb s3://arquivo-morto, depois aws s3api put-bucket-versioning ... Status=Enabled"], solucao: ["aws s3 mb s3://arquivo-morto", "aws s3api put-bucket-versioning --bucket arquivo-morto --versioning-configuration Status=Enabled"], validar: (c) => { const b = c.s3.buckets["arquivo-morto"]; return !!b && b.versionamento === "Enabled"; } },
  { servico: "extras-relampago", nivel: 2, xp: 60, titulo: "Upload rápido", descricao: "Crie o bucket <b>entrega</b> e suba o <b>relatorio.csv</b> nele.", dicas: ["mb s3://entrega, depois cp relatorio.csv s3://entrega/"], solucao: ["aws s3 mb s3://entrega", "aws s3 cp relatorio.csv s3://entrega/"], validar: (c) => { const b = c.s3.buckets["entrega"]; return !!b && !!b.objetos["relatorio.csv"]; } },
  { servico: "extras-relampago", nivel: 3, xp: 70, titulo: "Liberação relâmpago", descricao: "Crie o SG <b>cache-sg</b> e libere a porta <b>6379</b> (Redis) pra qualquer IP.", dicas: ["create-security-group + authorize-security-group-ingress --port 6379"], solucao: ['aws ec2 create-security-group --group-name cache-sg --description "Redis"', "aws ec2 authorize-security-group-ingress --group-name cache-sg --protocol tcp --port 6379 --cidr 0.0.0.0/0"], validar: (c) => { const g = Object.values(c.ec2.securityGroups).find((x) => x.nome === "cache-sg"); return !!g && g.regras.some((r) => r.porta === 6379); } },
  { servico: "extras-relampago", nivel: 3, xp: 70, titulo: "Permissão expressa", descricao: "Crie a usuária <b>helena</b> e dê a ela a política <b>AmazonS3ReadOnlyAccess</b>.", dicas: ["create-user + attach-user-policy --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"], solucao: ["aws iam create-user --user-name helena", "aws iam attach-user-policy --user-name helena --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"], validar: (c) => { const u = c.iam.usuarios["helena"]; return !!u && u.politicas.some((a) => a.includes("AmazonS3ReadOnlyAccess")); } },
  { servico: "extras-relampago", nivel: 3, xp: 70, titulo: "ARNs em texto", descricao: "Liste as políticas da AWS mostrando só os <b>ARNs</b>, em formato <b>text</b>.", dicas: ["--query 'Policies[*].Arn' --output text"], solucao: ["aws iam list-policies --scope AWS --query 'Policies[*].Arn' --output text"], validar: (c, cmd, ok) => ok && ehCmd(cmd, "iam", "list-policies") && cmd.flags.output === "text" && /Arn/.test(cmd.flags.query || "") },
];

// ================== BANCO DO TREINO ALEATÓRIO (40) ==================
// servico "treino", avulso:true → não aparece na sidebar; só via Desafio do dia
// e Treino aleatório. nivel 1 fácil → 3 avançado.
const BANCO = [
  // ----- fácil -----
  { nivel: 1, xp: 30, titulo: "Balde novo", descricao: "Crie o bucket <b>tr-balde</b>.", dicas: ["aws s3 mb s3://tr-balde"], solucao: ["aws s3 mb s3://tr-balde"], validar: (c) => _b(c, "tr-balde") },
  { nivel: 1, xp: 30, titulo: "Usuário Kelly", descricao: "Crie o usuário <b>kelly</b>.", dicas: ["aws iam create-user --user-name kelly"], solucao: ["aws iam create-user --user-name kelly"], validar: (c) => _u(c, "kelly") },
  { nivel: 1, xp: 30, titulo: "Grupo de estágio", descricao: "Crie o grupo <b>estagio</b>.", dicas: ["aws iam create-group --group-name estagio"], solucao: ["aws iam create-group --group-name estagio"], validar: (c) => _g(c, "estagio") },
  { nivel: 1, xp: 30, titulo: "Chave de treino", descricao: "Crie o par de chaves <b>chave-tr</b>.", dicas: ["aws ec2 create-key-pair --key-name chave-tr"], solucao: ["aws ec2 create-key-pair --key-name chave-tr"], validar: (c) => _k(c, "chave-tr") },
  { nivel: 1, xp: 30, titulo: "Tabela simples", descricao: "Crie a tabela <b>tr-tab</b> (chave id, texto).", dicas: ["create-table id S HASH PAY_PER_REQUEST"], solucao: ["aws dynamodb create-table --table-name tr-tab --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST"], validar: (c) => _t(c, "tr-tab") },
  { nivel: 1, xp: 30, titulo: "Quem sou eu?", descricao: "Mostre a identidade da sessão.", dicas: ["aws sts get-caller-identity"], solucao: ["aws sts get-caller-identity"], validar: (c, cmd, ok) => ok && ehCmd(cmd, "sts", "get-caller-identity") },
  { nivel: 1, xp: 30, titulo: "Tabelas existentes", descricao: "Liste as tabelas do DynamoDB.", dicas: ["aws dynamodb list-tables"], solucao: ["aws dynamodb list-tables"], validar: (c, cmd, ok) => ok && ehCmd(cmd, "dynamodb", "list-tables") },
  { nivel: 1, xp: 30, titulo: "Funções existentes", descricao: "Liste as funções Lambda.", dicas: ["aws lambda list-functions"], solucao: ["aws lambda list-functions"], validar: (c, cmd, ok) => ok && ehCmd(cmd, "lambda", "list-functions") },
  { nivel: 1, xp: 30, titulo: "Onde estou? (Linux)", descricao: "Mostre o diretório atual (comando Linux).", dicas: ["pwd"], solucao: ["pwd"], validar: (c, cmd, ok) => ok && cmd && cmd.servico === "linux" && cmd.sub === "pwd" },
  { nivel: 1, xp: 30, titulo: "Liste os arquivos (Linux)", descricao: "Liste os arquivos da pasta atual (comando Linux).", dicas: ["ls"], solucao: ["ls"], validar: (c, cmd, ok) => ok && cmd && cmd.servico === "linux" && cmd.sub === "ls" },
  { nivel: 1, xp: 40, titulo: "Crie uma pasta (Linux)", descricao: "Crie o diretório <b>tr-dir</b> (comando Linux).", dicas: ["mkdir tr-dir"], solucao: ["mkdir tr-dir"], validar: (c) => { const n = _fsno(c, "tr-dir"); return !!n && n.tipo === "dir"; } },
  { nivel: 1, xp: 40, titulo: "Arquivo vazio (Linux)", descricao: "Crie o arquivo <b>rascunho.txt</b> (comando Linux).", dicas: ["touch rascunho.txt"], solucao: ["touch rascunho.txt"], validar: (c) => { const n = _fsno(c, "rascunho.txt"); return !!n && n.tipo === "arquivo"; } },

  // ----- médio -----
  { nivel: 2, xp: 50, titulo: "Suba uma t3.micro", descricao: "Suba uma instância <b>t3.micro</b>.", dicas: ["run-instances --instance-type t3.micro"], solucao: ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.micro"], validar: (c) => _inst(c, "t3.micro") },
  { nivel: 2, xp: 60, titulo: "Firewall do banco", descricao: "Crie o SG <b>tr-db-sg</b> e libere a porta <b>5432</b> (Postgres).", dicas: ["create-security-group + authorize --port 5432"], solucao: ['aws ec2 create-security-group --group-name tr-db-sg --description "Postgres"', "aws ec2 authorize-security-group-ingress --group-name tr-db-sg --protocol tcp --port 5432 --cidr 0.0.0.0/0"], validar: (c) => { const g = Object.values(c.ec2.securityGroups).find((x) => x.nome === "tr-db-sg"); return !!g && g.regras.some((r) => r.porta === 5432); } },
  { nivel: 2, xp: 60, titulo: "Primeiro registro", descricao: "Crie a tabela <b>tr-clientes</b> (id, texto) e insira um item nela.", dicas: ["create-table + put-item --item '{\"id\":{\"S\":\"1\"}}'"], solucao: ["aws dynamodb create-table --table-name tr-clientes --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST", "aws dynamodb put-item --table-name tr-clientes --item '{\"id\": {\"S\": \"1\"}}'"], validar: (c) => { const t = c.dynamodb.tabelas["tr-clientes"]; return !!t && t.itens.length >= 1; } },
  { nivel: 2, xp: 60, titulo: "Membro no grupo", descricao: "Crie o grupo <b>tr-time</b>, o usuário <b>igor</b> e ponha o igor no grupo.", dicas: ["create-group, create-user, add-user-to-group"], solucao: ["aws iam create-group --group-name tr-time", "aws iam create-user --user-name igor", "aws iam add-user-to-group --user-name igor --group-name tr-time"], validar: (c) => { const g = c.iam.grupos["tr-time"]; return !!g && g.membros.includes("igor"); } },
  { nivel: 2, xp: 60, titulo: "Role + permissão", descricao: "Crie a role <b>tr-role</b> (trust.json) e anexe a <b>AWSLambdaBasicExecutionRole</b>.", dicas: ["create-role + attach-role-policy --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"], solucao: ["aws iam create-role --role-name tr-role --assume-role-policy-document file://trust.json", "aws iam attach-role-policy --role-name tr-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"], validar: (c) => { const r = c.iam.roles["tr-role"]; return !!r && r.politicas.some((a) => a.includes("AWSLambdaBasicExecutionRole")); } },
  { nivel: 2, xp: 60, titulo: "Site sincronizado", descricao: "Crie o bucket <b>tr-site</b> e sincronize a pasta <b>./site</b> nele.", dicas: ["mb + aws s3 sync ./site s3://tr-site"], solucao: ["aws s3 mb s3://tr-site", "aws s3 sync ./site s3://tr-site"], validar: (c) => { const b = c.s3.buckets["tr-site"]; return !!b && !!b.objetos["index.html"]; } },
  { nivel: 2, xp: 60, titulo: "Hospedagem web", descricao: "Crie o bucket <b>tr-web</b> e configure hospedagem com <b>index.html</b>.", dicas: ["mb + aws s3 website ... --index-document index.html"], solucao: ["aws s3 mb s3://tr-web", "aws s3 website s3://tr-web --index-document index.html"], validar: (c) => { const b = c.s3.buckets["tr-web"]; return !!b && b.website && b.website.indice === "index.html"; } },
  { nivel: 2, xp: 60, titulo: "Função notificadora", descricao: "Crie a função <b>tr-notif</b> (nodejs20.x, role arn:aws:iam::123456789012:role/papel-lambda).", dicas: ["create-function --runtime nodejs20.x ..."], solucao: ["aws lambda create-function --function-name tr-notif --runtime nodejs20.x --role arn:aws:iam::123456789012:role/papel-lambda --handler index.handler --zip-file fileb://app.zip"], validar: (c) => { const f = c.lambda.funcoes["tr-notif"]; return !!f && f.runtime === "nodejs20.x"; } },
  { nivel: 2, xp: 60, titulo: "Escreva num arquivo (Linux)", descricao: "Escreva <b>anotação</b> dentro de <b>tr-nota.txt</b> com echo e >.", dicas: ['echo "anotação" > tr-nota.txt'], solucao: ['echo "anotacao" > tr-nota.txt'], validar: (c) => { const n = _fsno(c, "tr-nota.txt"); return !!n && n.tipo === "arquivo" && n.conteudo.length > 0; } },
  { nivel: 2, xp: 60, titulo: "Copie um arquivo (Linux)", descricao: "Copie o <b>relatorio.csv</b> para <b>copia.csv</b> (comando Linux).", dicas: ["cp relatorio.csv copia.csv"], solucao: ["cp relatorio.csv copia.csv"], validar: (c) => { const n = _fsno(c, "copia.csv"); return !!n && n.tipo === "arquivo"; } },
  { nivel: 2, xp: 60, titulo: "Proteja a chave (Linux)", descricao: "Aplique <b>chmod 600</b> no <b>labsuser.pem</b>.", dicas: ["chmod 600 labsuser.pem"], solucao: ["chmod 600 labsuser.pem"], validar: (c) => { const n = _fsno(c, "labsuser.pem"); return !!n && n.modo === "600"; } },
  { nivel: 2, xp: 60, titulo: "Backup com versionamento", descricao: "Crie o bucket <b>tr-backup</b> e ligue o versionamento.", dicas: ["mb + put-bucket-versioning Status=Enabled"], solucao: ["aws s3 mb s3://tr-backup", "aws s3api put-bucket-versioning --bucket tr-backup --versioning-configuration Status=Enabled"], validar: (c) => { const b = c.s3.buckets["tr-backup"]; return !!b && b.versionamento === "Enabled"; } },

  // ----- avançado -----
  { nivel: 3, xp: 80, titulo: "Filtre uma política", descricao: "Ache o ARN da política <b>AmazonEC2FullAccess</b> com um filtro no --query.", dicas: ["--query \"Policies[?PolicyName=='AmazonEC2FullAccess'].Arn\""], solucao: ["aws iam list-policies --scope AWS --query \"Policies[?PolicyName=='AmazonEC2FullAccess'].Arn\""], validar: (c, cmd, ok) => ok && ehCmd(cmd, "iam", "list-policies") && /PolicyName==/.test(cmd.flags.query || "") && /AmazonEC2FullAccess/.test(cmd.flags.query || "") },
  { nivel: 3, xp: 80, titulo: "Nomes de tabela em texto", descricao: "Liste as tabelas só com os nomes, em formato <b>text</b>.", dicas: ["--query 'TableNames' --output text"], solucao: ["aws dynamodb list-tables --query 'TableNames' --output text"], validar: (c, cmd, ok) => ok && ehCmd(cmd, "dynamodb", "list-tables") && cmd.flags.output === "text" },
  { nivel: 3, xp: 90, titulo: "Baixe o lab_policy", descricao: "Salve o JSON v1 do <b>lab_policy</b> no arquivo <b>tr-policy.json</b> (use > pra redirecionar).", dicas: ["get-policy-version ... --version-id v1 > tr-policy.json"], solucao: ["aws iam get-policy-version --policy-arn arn:aws:iam::123456789012:policy/lab_policy --version-id v1 > tr-policy.json"], validar: (c) => _arq(c, "tr-policy.json") },
  { nivel: 3, xp: 80, titulo: "Salve sua identidade", descricao: "Salve a saída do sts em <b>tr-id.json</b> com redirecionamento.", dicas: ["aws sts get-caller-identity > tr-id.json"], solucao: ["aws sts get-caller-identity > tr-id.json"], validar: (c) => _arq(c, "tr-id.json") },
  { nivel: 3, xp: 100, titulo: "Política versionada", descricao: "Crie a política <b>tr-pol</b> e publique uma <b>nova versão como padrão</b>.", dicas: ["create-policy + create-policy-version --set-as-default"], solucao: ["aws iam create-policy --policy-name tr-pol --policy-document file://politica-publica.json", "aws iam create-policy-version --policy-arn arn:aws:iam::123456789012:policy/tr-pol --policy-document file://politica-publica.json --set-as-default"], validar: (c) => { const p = c.iam.policies["tr-pol"]; return !!p && p.defaultVersionId === "v2"; } },
  { nivel: 3, xp: 100, titulo: "Chave composta", descricao: "Crie a tabela <b>tr-eventos</b> com partition key <b>id</b> (S) e sort key <b>ts</b> (N).", dicas: ["dois attribute-definitions e dois key-schema (HASH + RANGE)"], solucao: ["aws dynamodb create-table --table-name tr-eventos --attribute-definitions AttributeName=id,AttributeType=S AttributeName=ts,AttributeType=N --key-schema AttributeName=id,KeyType=HASH AttributeName=ts,KeyType=RANGE --billing-mode PAY_PER_REQUEST"], validar: (c) => { const t = c.dynamodb.tabelas["tr-eventos"]; return !!t && t.esquema.some((k) => k.KeyType === "RANGE"); } },
  { nivel: 3, xp: 90, titulo: "Frota de três", descricao: "Suba <b>3 instâncias t3.small</b> de uma vez.", dicas: ["run-instances --count 3 --instance-type t3.small"], solucao: ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.small --count 3"], validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "run-instances") && cmd.flags["instance-type"] === "t3.small" && parseInt(cmd.flags.count || "1", 10) >= 3 },
  { nivel: 3, xp: 90, titulo: "SSH blindado", descricao: "Crie o SG <b>tr-ssh-sg</b> e libere a porta <b>22</b> só pro IP <b>198.51.100.7/32</b>.", dicas: ["authorize ... --port 22 --cidr 198.51.100.7/32"], solucao: ['aws ec2 create-security-group --group-name tr-ssh-sg --description "SSH"', "aws ec2 authorize-security-group-ingress --group-name tr-ssh-sg --protocol tcp --port 22 --cidr 198.51.100.7/32"], validar: (c) => { const g = Object.values(c.ec2.securityGroups).find((x) => x.nome === "tr-ssh-sg"); return !!g && g.regras.some((r) => r.porta === 22 && r.cidr === "198.51.100.7/32"); } },
  { nivel: 3, xp: 100, titulo: "Revogar acesso", descricao: "Crie o usuário <b>tr-temp</b>, dê e depois <b>tire</b> a AmazonS3ReadOnlyAccess dele.", dicas: ["create-user + attach-user-policy + detach-user-policy"], solucao: ["aws iam create-user --user-name tr-temp", "aws iam attach-user-policy --user-name tr-temp --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess", "aws iam detach-user-policy --user-name tr-temp --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"], validar: (c) => { const u = c.iam.usuarios["tr-temp"]; return !!u && u.politicas.length === 0; } },
  { nivel: 3, xp: 90, titulo: "Tabela descartável", descricao: "Crie a tabela <b>tr-descarte</b> (id, S) e em seguida <b>apague</b> ela.", dicas: ["create-table + delete-table"], solucao: ["aws dynamodb create-table --table-name tr-descarte --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST", "aws dynamodb delete-table --table-name tr-descarte"], validar: (c) => !c.dynamodb.tabelas["tr-descarte"] },
  { nivel: 3, xp: 100, titulo: "Função com ambiente", descricao: "Crie a função <b>tr-env-fn</b> (python3.12, role papel-lambda) e configure a variável <b>FASE=prod</b>.", dicas: ["create-function + update-function-configuration --environment Variables={FASE=prod}"], solucao: ["aws lambda create-function --function-name tr-env-fn --runtime python3.12 --role arn:aws:iam::123456789012:role/papel-lambda --handler app.handler --zip-file fileb://app.zip", "aws lambda update-function-configuration --function-name tr-env-fn --environment Variables={FASE=prod}"], validar: (c) => { const f = c.lambda.funcoes["tr-env-fn"]; return !!f && f.env && f.env.FASE === "prod"; } },
  { nivel: 3, xp: 90, titulo: "Cace no log (Linux)", descricao: "Mostre as linhas com <b>erro</b> no <b>logs/app.log</b> usando grep.", dicas: ["grep erro logs/app.log"], solucao: ["grep erro logs/app.log"], validar: (c, cmd, ok) => ok && cmd && cmd.servico === "linux" && cmd.sub === "grep" },
  { nivel: 2, xp: 60, titulo: "Suba e apague", descricao: "Crie o bucket <b>tr-limpa</b>, suba o <b>relatorio.csv</b> e depois <b>apague</b> esse objeto.", dicas: ["mb, cp e rm s3://tr-limpa/relatorio.csv"], solucao: ["aws s3 mb s3://tr-limpa", "aws s3 cp relatorio.csv s3://tr-limpa/", "aws s3 rm s3://tr-limpa/relatorio.csv"], validar: (c) => { const b = c.s3.buckets["tr-limpa"]; return !!b && !b.objetos["relatorio.csv"]; } },
  { nivel: 3, xp: 90, titulo: "Suspenda o versionamento", descricao: "Crie o bucket <b>tr-susp</b>, ligue o versionamento e depois <b>suspenda</b> (Status=Suspended).", dicas: ["put-bucket-versioning ... Status=Suspended"], solucao: ["aws s3 mb s3://tr-susp", "aws s3api put-bucket-versioning --bucket tr-susp --versioning-configuration Status=Enabled", "aws s3api put-bucket-versioning --bucket tr-susp --versioning-configuration Status=Suspended"], validar: (c) => { const b = c.s3.buckets["tr-susp"]; return !!b && b.versionamento === "Suspended"; } },
  { nivel: 2, xp: 50, titulo: "Renomeie (Linux)", descricao: "Crie o arquivo <b>tr-old.txt</b> e renomeie para <b>tr-new.txt</b> (comandos Linux).", dicas: ["touch tr-old.txt, depois mv tr-old.txt tr-new.txt"], solucao: ["touch tr-old.txt", "mv tr-old.txt tr-new.txt"], validar: (c) => !_fsno(c, "tr-old.txt") && !!_fsno(c, "tr-new.txt") },
  { nivel: 3, xp: 90, titulo: "Insira e leia", descricao: "Crie a tabela <b>tr-busca</b> (id, S), insira o item id \"42\" e depois <b>busque</b> ele com get-item.", dicas: ["create-table, put-item e get-item --key '{\"id\":{\"S\":\"42\"}}'"], solucao: ["aws dynamodb create-table --table-name tr-busca --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST", "aws dynamodb put-item --table-name tr-busca --item '{\"id\": {\"S\": \"42\"}}'", "aws dynamodb get-item --table-name tr-busca --key '{\"id\": {\"S\": \"42\"}}'"], validar: (c, cmd, ok) => ok && ehCmd(cmd, "dynamodb", "get-item") && cmd.flags["table-name"] === "tr-busca" },
];

// ---------- registra os desafios em DESAFIOS (dados; sem window) ----------
(function () {
  if (typeof DESAFIOS === "undefined") return;
  RELAMPAGO_EXTRA.forEach((d, i) => { d.id = "rel-" + (7 + i); DESAFIOS.push(d); });
  BANCO.forEach((d, i) => { d.id = "tr-" + (i + 1); d.servico = "treino"; d.avulso = true; DESAFIOS.push(d); });
})();

// ================== UI: Desafio do dia + Treino aleatório ==================
(function () {
  if (typeof window === "undefined") return;

  function hojeStr() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }
  function indiceDia() {
    let h = 0;
    for (const ch of hojeStr()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % BANCO.length;
  }
  function desafioDoDia() { return BANCO[indiceDia()]; }
  window.desafioDoDia = desafioDoDia; // exposto pra trava grátis/Pro saber o do dia

  function chaveDia() { return "awsCliQuest.diaOk" + (typeof api !== "undefined" && api.usuario ? "." + api.usuario : ""); }
  function diaReivindicado() { try { return localStorage.getItem(chaveDia()) === hojeStr(); } catch (e) { return false; } }
  function marcarDia() { try { localStorage.setItem(chaveDia(), hojeStr()); } catch (e) { /* ok */ } }

  let modoTreino = false;

  function servirAleatoria() {
    modoTreino = true;
    const pend = BANCO.filter((b) => !desafioConcluido(b.id));
    const pool = pend.length ? pend : BANCO;
    const d = pool[Math.floor(Math.random() * pool.length)];
    selecionarDesafio(d.id);
    toast(`🎲 Nova missão: <strong>${d.titulo}</strong> <small>(${NOMES_NIVEL[d.nivel]})</small>`, "neutro");
  }

  function completarAvulso(d) {
    const r = concluirDesafio(d);
    let msg = r.ganho > 0 ? `+${r.ganho} XP` : "0 XP (resposta revelada)";
    if (d.id === desafioDoDia().id && r.ganho > 0 && !diaReivindicado()) {
      const bonus = Math.round(d.xp * 0.5);
      jogo.xp += bonus;
      marcarDia();
      salvarJogo();
      toast(`📅 <strong>Desafio do dia concluído!</strong> Bônus de +${bonus} XP 🎉`, "nivel");
      msg += ` +${bonus} bônus do dia`;
    }
    toast(`✅ <strong>${d.titulo}</strong> — ${msg}`, "sucesso");
    imprimir(`✅ Missão concluída: ${d.titulo} (${msg})`, "ok");
    renderCabecalho();
    renderSidebar();
    renderCard();
    renderFaixa();
    if (modoTreino) setTimeout(servirAleatoria, 900);
  }

  // wrap de verificarDesafios: trata os desafios "avulsos" (banco) por aqui,
  // pra não disparar o auto-avançar do fluxo normal (celebrar) neles.
  const verifOriginal = window.verificarDesafios;
  if (typeof verifOriginal === "function") {
    window.verificarDesafios = function (cmd) {
      const d = ui && ui.desafioAtivo ? obterDesafio(ui.desafioAtivo) : null;
      if (d && d.avulso) {
        if (desafioConcluido(d.id)) {
          if (modoTreino) setTimeout(servirAleatoria, 600); // já feito: roda a próxima
          return;
        }
        let ok = false;
        try { ok = !!d.validar(jogo.conta, cmd, true); } catch (e) { ok = false; }
        if (ok) completarAvulso(d);
        return;
      }
      return verifOriginal(cmd);
    };
  }

  // ---------- faixa (campo) do Desafio do dia ----------
  function renderFaixa() {
    const dia = desafioDoDia();
    const feito = diaReivindicado();
    const tit = document.querySelector("#faixaDiaTitulo");
    if (!tit) return;
    tit.innerHTML = `${escaparHtml(dia.titulo)} <small>(${NOMES_NIVEL[dia.nivel]})</small>`;
    const sel = document.querySelector("#faixaDiaSelo");
    sel.textContent = feito ? "✅ feito hoje" : "+50% XP";
    sel.className = "faixa-selo" + (feito ? " ok" : "");
  }

  function montarFaixa() {
    const centro = document.querySelector(".centro");
    const card = document.querySelector("#cardDesafio");
    if (!centro || !card || document.querySelector("#faixaTreino")) return;
    const faixa = document.createElement("div");
    faixa.id = "faixaTreino";
    faixa.innerHTML = `
      <div class="faixa-bloco">
        <span class="faixa-rotulo">📅 Desafio do dia:</span>
        <span id="faixaDiaTitulo"></span>
        <span id="faixaDiaSelo" class="faixa-selo"></span>
        <button id="btnJogarDia" class="botao">Jogar</button>
      </div>
      <button id="btnSortear" class="botao secundario">🎲 Treino aleatório</button>`;
    centro.insertBefore(faixa, card);
    document.querySelector("#btnJogarDia").addEventListener("click", () => { modoTreino = false; selecionarDesafio(desafioDoDia().id); });
    document.querySelector("#btnSortear").addEventListener("click", servirAleatoria);
    renderFaixa();
  }

  document.addEventListener("DOMContentLoaded", montarFaixa);
})();
