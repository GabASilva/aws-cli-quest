"use strict";
// ============================================================
// CLImb — desafios-pratica.js
// Reforço por repetição espaçada: cada comando aparece em VÁRIAS atividades,
// com cenários reais do dia a dia (o aluno cria os recursos a partir da
// situação). Os desafios são INSERIDOS logo depois do comando que praticam
// (a trilha é sequencial), não jogados no fim. Validadores por estado;
// só comandos já suportados; nomes de recurso únicos.
// ============================================================
(function () {
  if (typeof DESAFIOS === "undefined") return;

  // Insere `novos` logo depois do desafio `anchorId` (mesma trilha = ordem certa).
  function at(anchorId, novos) {
    const i = DESAFIOS.findIndex((d) => d.id === anchorId);
    if (i < 0) { for (const n of novos) DESAFIOS.push(n); return; }
    DESAFIOS.splice(i + 1, 0, ...novos);
  }
  // atalho pra montar desafio
  function d(id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar) {
    return { id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar };
  }
  const temBucket = (c, n) => !!c.s3.buckets[n];
  const temObj = (c, b, k) => !!(c.s3.buckets[b] && c.s3.buckets[b].objetos[k]);

  // ===================== S3 =====================
  // mb — criar bucket (vários cenários)
  at("s3-1", [
    d("ps3-mb1", "s3", 1, 40, "Site da pizzaria", "Seu tio abriu uma pizzaria e quer um site. O primeiro passo é o lugar pros arquivos: crie o bucket <b>pizzaria-do-tio</b>.",
      ["aws s3 mb s3://pizzaria-do-tio"], ["aws s3 mb s3://pizzaria-do-tio"], (c) => temBucket(c, "pizzaria-do-tio")),
    d("ps3-mb2", "s3", 1, 40, "Fotos do casamento", "A galera vai subir as fotos do casamento num lugar só. Crie o bucket <b>fotos-casamento</b>.",
      ["aws s3 mb s3://fotos-casamento"], ["aws s3 mb s3://fotos-casamento"], (c) => temBucket(c, "fotos-casamento")),
    d("ps3-mb3", "s3", 1, 50, "Cofre de backups", "Os backups do banco precisam de um lugar seguro e separado. Crie o bucket <b>backups-producao</b>.",
      ["aws s3 mb s3://backups-producao"], ["aws s3 mb s3://backups-producao"], (c) => temBucket(c, "backups-producao")),
    d("ps3-mb4", "s3", 1, 40, "Seu portfólio", "Você vai publicar seu portfólio de dev. Crie o bucket <b>portfolio-2026</b>.",
      ["aws s3 mb s3://portfolio-2026"], ["aws s3 mb s3://portfolio-2026"], (c) => temBucket(c, "portfolio-2026")),
  ]);
  // ls — listar
  at("s3-4", [
    d("ps3-ls1", "s3", 1, 40, "Quantos buckets já tenho?", "Antes de criar mais um, dê uma olhada em <b>todos os seus buckets</b>.",
      ["aws s3 ls"], ["aws s3 ls"], (c, cmd, ok) => ok && ehCmd(cmd, "s3", "ls") && cmd.posicionais.length === 0),
    d("ps3-ls2", "s3", 1, 50, "O que tem no cofre?", "Crie o bucket <b>docs-fiscais</b>, jogue o relatorio.csv nele e <b>liste o conteúdo</b> dele.",
      ["aws s3 ls s3://docs-fiscais"], ["aws s3 mb s3://docs-fiscais", "aws s3 cp relatorio.csv s3://docs-fiscais/", "aws s3 ls s3://docs-fiscais"],
      (c, cmd, ok) => ok && ehCmd(cmd, "s3", "ls") && String(cmd.posicionais[0] || "").includes("docs-fiscais")),
  ]);
  // cp upload
  at("s3-3", [
    d("ps3-cp1", "s3", 1, 60, "Suba o logo", "O designer mandou o <b>logo.png</b>. Crie o bucket <b>assets-loja</b> e envie o logo pra lá.",
      ["aws s3 cp logo.png s3://assets-loja/"], ["aws s3 mb s3://assets-loja", "aws s3 cp logo.png s3://assets-loja/"], (c) => temObj(c, "assets-loja", "logo.png")),
    d("ps3-cp2", "s3", 1, 60, "Relatório do mês", "Hora de arquivar o <b>relatorio.csv</b> do mês. Crie <b>relatorios-mensais</b> e suba o arquivo.",
      ["aws s3 cp relatorio.csv s3://relatorios-mensais/"], ["aws s3 mb s3://relatorios-mensais", "aws s3 cp relatorio.csv s3://relatorios-mensais/"], (c) => temObj(c, "relatorios-mensais", "relatorio.csv")),
    d("ps3-cp3", "s3", 1, 60, "Publique a home", "Publique o <b>index.html</b> no site. Crie <b>landing-page</b> e envie o arquivo.",
      ["aws s3 cp index.html s3://landing-page/"], ["aws s3 mb s3://landing-page", "aws s3 cp index.html s3://landing-page/"], (c) => temObj(c, "landing-page", "index.html")),
  ]);
  // cp download
  at("s3-5", [
    d("ps3-dl1", "s3", 2, 60, "Recupere um backup", "Precisa do relatorio.csv de volta no seu computador. Crie <b>cofre-relatorios</b>, suba o arquivo e depois <b>baixe</b> ele.",
      ["O download é o cp invertido: origem s3://, destino ./"], ["aws s3 mb s3://cofre-relatorios", "aws s3 cp relatorio.csv s3://cofre-relatorios/", "aws s3 cp s3://cofre-relatorios/relatorio.csv ./"],
      (c, cmd, ok) => ok && ehCmd(cmd, "s3", "cp") && String(cmd.posicionais[0] || "").startsWith("s3://") && !String(cmd.posicionais[1] || "").startsWith("s3://")),
  ]);
  // rm
  at("s3-6", [
    d("ps3-rm1", "s3", 2, 60, "Subiu errado", "Um arquivo subiu por engano. Crie <b>uploads-temp</b>, suba o relatorio.csv e <b>apague</b> ele de dentro do bucket.",
      ["aws s3 rm s3://uploads-temp/relatorio.csv"], ["aws s3 mb s3://uploads-temp", "aws s3 cp relatorio.csv s3://uploads-temp/", "aws s3 rm s3://uploads-temp/relatorio.csv"],
      (c) => temBucket(c, "uploads-temp") && !temObj(c, "uploads-temp", "relatorio.csv")),
  ]);
  // sync
  at("s3-7", [
    d("ps3-sync1", "s3", 2, 80, "Deploy do site da empresa", "Saiu uma versão nova do site (pasta <b>./site</b>). Crie <b>site-empresa</b> e sincronize tudo de uma vez.",
      ["aws s3 sync ./site s3://site-empresa"], ["aws s3 mb s3://site-empresa", "aws s3 sync ./site s3://site-empresa"], (c) => temObj(c, "site-empresa", "index.html")),
  ]);
  // rb
  at("s3-8", [
    d("ps3-rb1", "s3", 2, 60, "Projeto cancelado", "O projeto foi cancelado. Crie <b>projeto-piloto</b> (vazio) e <b>remova</b> ele.",
      ["aws s3 rb s3://projeto-piloto"], ["aws s3 mb s3://projeto-piloto", "aws s3 rb s3://projeto-piloto"],
      (c, cmd, ok) => ok && ehCmd(cmd, "s3", "rb") && !temBucket(c, "projeto-piloto")),
    d("ps3-rb2", "s3", 3, 70, "Limpe o ambiente de testes", "Crie <b>lab-testes</b>, jogue um arquivo dentro e <b>remova o bucket com tudo</b> de uma vez.",
      ["Bucket com conteúdo precisa de --force."], ["aws s3 mb s3://lab-testes", "aws s3 cp relatorio.csv s3://lab-testes/", "aws s3 rb s3://lab-testes --force"],
      (c, cmd, ok) => ok && ehCmd(cmd, "s3", "rb") && !temBucket(c, "lab-testes")),
  ]);

  // ===================== EC2 =====================
  // run-instances
  at("ec2-2", [
    d("pec2-run1", "ec2", 2, 70, "Servidor de jogo", "A galera quer um servidor de Minecraft. Suba uma instância <b>t3.small</b> (a t2.micro não aguenta).",
      ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.small"], ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.small"],
      (c) => Object.values(c.ec2.instancias).some((i) => i.tipo === "t3.small" && i.estado === "running")),
    d("pec2-run2", "ec2", 3, 90, "Cluster de processamento", "Um job pesado precisa de força. Suba <b>3 instâncias t3.medium</b> de uma vez.",
      ["Quantidade é --count 3."], ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.medium --count 3"],
      (c) => Object.values(c.ec2.instancias).filter((i) => i.tipo === "t3.medium").length >= 3),
    d("pec2-run3", "ec2", 2, 80, "Banco de dados próprio", "Vão rodar um banco numa VM robusta. Suba uma <b>m5.large</b>.",
      ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type m5.large"], ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type m5.large"],
      (c) => Object.values(c.ec2.instancias).some((i) => i.tipo === "m5.large")),
  ]);
  // stop / start
  at("ec2-4", [
    d("pec2-stop1", "ec2", 2, 60, "Economia de fim de semana", "Sexta à noite: suba uma t2.small e <b>pare</b> ela pra não gastar no fim de semana.",
      ["Pegue o id no run/describe e use stop-instances."], ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t2.small", "aws ec2 stop-instances --instance-ids <id-da-instância>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "stop-instances")),
    d("pec2-start1", "ec2", 2, 60, "Segunda de manhã", "Hora de voltar ao trabalho: suba uma instância, pare e <b>ligue de novo</b>.",
      ["start-instances é o contrário do stop."], ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t2.micro", "aws ec2 stop-instances --instance-ids <id-da-instância>", "aws ec2 start-instances --instance-ids <id-da-instância>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "start-instances")),
  ]);
  // key-pair
  at("ec2-5", [
    d("pec2-key1", "ec2", 2, 50, "Chave de backup", "Pra acessar as máquinas de backup você precisa de uma chave. Crie o par <b>chave-backup</b>.",
      ["aws ec2 create-key-pair --key-name chave-backup"], ["aws ec2 create-key-pair --key-name chave-backup"], (c) => !!c.ec2.keyPairs["chave-backup"]),
  ]);
  // security group + authorize
  at("ec2-7", [
    d("pec2-sg1", "ec2", 3, 80, "Acesso SSH pro time", "O time precisa entrar nas máquinas via SSH. Crie o SG <b>acesso-ssh</b> e libere a <b>porta 22</b>.",
      ["authorize-security-group-ingress --port 22 --protocol tcp --cidr 0.0.0.0/0"], ['aws ec2 create-security-group --group-name acesso-ssh --description "SSH do time"', "aws ec2 authorize-security-group-ingress --group-name acesso-ssh --protocol tcp --port 22 --cidr 0.0.0.0/0"],
      (c) => Object.values(c.ec2.securityGroups).some((g) => g.nome === "acesso-ssh" && g.regras.some((r) => r.porta === 22))),
    d("pec2-sg2", "ec2", 3, 80, "Porta do PostgreSQL", "O app vai falar com um Postgres. Crie o SG <b>db-postgres</b> e libere a <b>porta 5432</b> pra rede interna (10.0.0.0/16).",
      ["--port 5432 --cidr 10.0.0.0/16"], ['aws ec2 create-security-group --group-name db-postgres --description "Postgres interno"', "aws ec2 authorize-security-group-ingress --group-name db-postgres --protocol tcp --port 5432 --cidr 10.0.0.0/16"],
      (c) => Object.values(c.ec2.securityGroups).some((g) => g.nome === "db-postgres" && g.regras.some((r) => r.porta === 5432))),
  ]);

  // ===================== IAM =====================
  // create-user
  at("iam-1", [
    d("piam-u1", "iam", 1, 50, "Chegou o Pedro", "Um dev novo entrou no time: o Pedro. Crie o usuário <b>pedro</b>.",
      ["aws iam create-user --user-name pedro"], ["aws iam create-user --user-name pedro"], (c) => !!c.iam.usuarios["pedro"]),
    d("piam-u2", "iam", 1, 50, "Estagiária nova", "A Júlia começou o estágio hoje. Crie o usuário <b>julia</b>.",
      ["aws iam create-user --user-name julia"], ["aws iam create-user --user-name julia"], (c) => !!c.iam.usuarios["julia"]),
    d("piam-u3", "iam", 2, 60, "Conta do robô de deploy", "O CI/CD precisa de uma identidade própria (não use a sua!). Crie o usuário <b>ci-deploy</b>.",
      ["Contas de serviço são usuários normais, só que pra automação."], ["aws iam create-user --user-name ci-deploy"], (c) => !!c.iam.usuarios["ci-deploy"]),
  ]);
  // group + attach
  at("iam-5", [
    d("piam-g1", "iam", 2, 70, "Time de suporte (só leitura)", "O suporte só precisa LER o S3. Crie o grupo <b>suporte</b> e anexe a política <b>AmazonS3ReadOnlyAccess</b>.",
      ["attach-group-policy --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"], ["aws iam create-group --group-name suporte", "aws iam attach-group-policy --group-name suporte --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"],
      (c) => { const g = c.iam.grupos["suporte"]; return !!g && (g.politicas || []).length > 0; }),
    d("piam-g2", "iam", 2, 70, "DBAs com acesso total ao DynamoDB", "Os DBAs gerenciam o DynamoDB. Crie o grupo <b>dbas</b> e anexe <b>AmazonDynamoDBFullAccess</b>.",
      ["--policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"], ["aws iam create-group --group-name dbas", "aws iam attach-group-policy --group-name dbas --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"],
      (c) => { const g = c.iam.grupos["dbas"]; return !!g && (g.politicas || []).length > 0; }),
  ]);
  // role
  at("iam-6", [
    d("piam-r1", "iam", 3, 80, "Role pra uma Lambda", "Uma função Lambda vai precisar de permissões. Crie a role <b>role-lambda-logs</b> com o <b>trust.json</b>.",
      ["aws iam create-role --role-name role-lambda-logs --assume-role-policy-document file://trust.json"], ["aws iam create-role --role-name role-lambda-logs --assume-role-policy-document file://trust.json"],
      (c) => !!c.iam.roles["role-lambda-logs"]),
  ]);

  // ===================== Lambda =====================
  at("lam-2", [
    d("plam-1", "lambda", 2, 70, "Redimensionar imagens", "Toda foto que sobe no S3 precisa virar miniatura. Crie a função <b>resize-imagens</b> (Python).",
      ["create-function --runtime python3.12 --handler index.handler --role arn:aws:iam::123456789012:role/lambda-exec --zip-file fileb://app.zip"],
      ["aws lambda create-function --function-name resize-imagens --runtime python3.12 --role arn:aws:iam::123456789012:role/lambda-exec --handler index.handler --zip-file fileb://app.zip"],
      (c) => !!c.lambda.funcoes["resize-imagens"]),
    d("plam-2", "lambda", 2, 70, "Webhook de pagamento", "O gateway de pagamento vai chamar um webhook. Crie a função <b>webhook-pagamento</b> em <b>Node 20</b>.",
      ["--runtime nodejs20.x"], ["aws lambda create-function --function-name webhook-pagamento --runtime nodejs20.x --role arn:aws:iam::123456789012:role/lambda-exec --handler index.handler --zip-file fileb://app.zip"],
      (c) => { const f = c.lambda.funcoes["webhook-pagamento"]; return !!f && f.runtime === "nodejs20.x"; }),
  ]);
  at("lam-3", [
    d("plam-inv1", "lambda", 2, 60, "Teste rápido", "Acabou de subir a função <b>checa-saude</b> e quer testar. Crie ela e <b>invoque</b> (saída em saida.json).",
      ["aws lambda invoke --function-name checa-saude saida.json"],
      ["aws lambda create-function --function-name checa-saude --runtime python3.12 --role arn:aws:iam::123456789012:role/lambda-exec --handler index.handler --zip-file fileb://app.zip", "aws lambda invoke --function-name checa-saude saida.json"],
      (c) => { const f = c.lambda.funcoes["checa-saude"]; return !!f && f.invocada; }),
  ]);

  // ===================== DynamoDB =====================
  at("dyn-2", [
    d("pdyn-1", "dynamodb", 2, 70, "Catálogo de produtos", "A loja precisa guardar os produtos. Crie a tabela <b>Catalogo</b> com chave de partição <b>sku</b> (texto).",
      ["--attribute-definitions AttributeName=sku,AttributeType=S --key-schema AttributeName=sku,KeyType=HASH --billing-mode PAY_PER_REQUEST"],
      ["aws dynamodb create-table --table-name Catalogo --attribute-definitions AttributeName=sku,AttributeType=S --key-schema AttributeName=sku,KeyType=HASH --billing-mode PAY_PER_REQUEST"],
      (c) => !!c.dynamodb.tabelas["Catalogo"]),
    d("pdyn-2", "dynamodb", 2, 70, "Sessões de usuário", "Pra manter quem está logado, crie a tabela <b>Sessoes</b> com chave <b>token</b> (texto).",
      ["chave token, tipo S"], ["aws dynamodb create-table --table-name Sessoes --attribute-definitions AttributeName=token,AttributeType=S --key-schema AttributeName=token,KeyType=HASH --billing-mode PAY_PER_REQUEST"],
      (c) => !!c.dynamodb.tabelas["Sessoes"]),
  ]);
  at("dyn-3", [
    d("pdyn-pi1", "dynamodb", 2, 70, "Cadastre o primeiro produto", "Crie a tabela <b>Itens</b> (chave id) e grave o primeiro item nela.",
      ["aws dynamodb put-item --table-name Itens --item '{\"id\":{\"S\":\"1\"}}'"],
      ["aws dynamodb create-table --table-name Itens --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST", "aws dynamodb put-item --table-name Itens --item '{\"id\":{\"S\":\"1\"}}'"],
      (c) => { const t = c.dynamodb.tabelas["Itens"]; return !!t && t.itens.length > 0; }),
  ]);

  // ===================== VPC =====================
  at("vpc-1", [
    d("pvpc-1", "vpc", 1, 50, "Rede de homologação", "Antes de ir pra produção, monte a rede de homologação: VPC <b>10.40.0.0/16</b>.",
      ["aws ec2 create-vpc --cidr-block 10.40.0.0/16"], ["aws ec2 create-vpc --cidr-block 10.40.0.0/16"],
      (c) => !!(c.vpc && Object.values(c.vpc.vpcs).some((v) => v.cidr === "10.40.0.0/16"))),
    d("pvpc-2", "vpc", 1, 50, "Rede isolada de dados", "Dados sensíveis ficam numa rede só pra eles. Crie a VPC <b>10.99.0.0/16</b>.",
      ["aws ec2 create-vpc --cidr-block 10.99.0.0/16"], ["aws ec2 create-vpc --cidr-block 10.99.0.0/16"],
      (c) => !!(c.vpc && Object.values(c.vpc.vpcs).some((v) => v.cidr === "10.99.0.0/16"))),
  ]);
  at("vpc-2", [
    d("pvpc-sub1", "vpc", 2, 70, "Sub-rede pública", "Crie a VPC <b>10.41.0.0/16</b> e uma sub-rede pública <b>10.41.1.0/24</b> dentro dela.",
      ["create-subnet --vpc-id <vpc-id> --cidr-block 10.41.1.0/24"], ["aws ec2 create-vpc --cidr-block 10.41.0.0/16", "aws ec2 create-subnet --vpc-id <vpc-id> --cidr-block 10.41.1.0/24"],
      (c) => !!(c.vpc && Object.values(c.vpc.subnets).some((s) => s.cidr === "10.41.1.0/24"))),
  ]);

  // ===================== RDS =====================
  at("rds-1", [
    d("prds-1", "rds", 1, 70, "Banco do e-commerce", "A loja online vai usar PostgreSQL. Crie o banco <b>loja-online</b> (db.t3.micro, usuário admin).",
      ["--engine postgres"], ["aws rds create-db-instance --db-instance-identifier loja-online --db-instance-class db.t3.micro --engine postgres --master-username admin --allocated-storage 20"],
      (c) => !!(c.rds && c.rds.instancias["loja-online"])),
    d("prds-2", "rds", 1, 70, "Banco de relatórios (BI)", "O time de dados quer um MySQL pros relatórios. Crie <b>relatorios-bi</b> (db.t3.small).",
      ["--engine mysql --db-instance-class db.t3.small"], ["aws rds create-db-instance --db-instance-identifier relatorios-bi --db-instance-class db.t3.small --engine mysql --master-username admin --allocated-storage 50"],
      (c) => !!(c.rds && c.rds.instancias["relatorios-bi"])),
  ]);
  at("rds-3", [
    d("prds-stop1", "rds", 2, 60, "Banco de dev fora do horário", "O banco de desenvolvimento não precisa rodar de madrugada. Crie <b>dev-db</b> e <b>pare</b> ele.",
      ["aws rds stop-db-instance --db-instance-identifier dev-db"], ["aws rds create-db-instance --db-instance-identifier dev-db --db-instance-class db.t3.micro --engine mysql --master-username admin --allocated-storage 20", "aws rds stop-db-instance --db-instance-identifier dev-db"],
      (c) => { const x = c.rds && c.rds.instancias["dev-db"]; return !!x && x.status === "stopped"; }),
  ]);

  // ===================== CloudWatch =====================
  at("cw-1", [
    d("pcw-log1", "cloudwatch", 1, 50, "Logs do servidor web", "O nginx vai mandar logs pra um grupo. Crie o grupo <b>/nginx/acessos</b>.",
      ["aws logs create-log-group --log-group-name /nginx/acessos"], ["aws logs create-log-group --log-group-name /nginx/acessos"],
      (c) => !!(c.logs && c.logs.grupos["/nginx/acessos"])),
    d("pcw-log2", "cloudwatch", 1, 50, "Logs de erro da API", "Separe os erros da API num grupo próprio. Crie <b>/api/erros</b>.",
      ["aws logs create-log-group --log-group-name /api/erros"], ["aws logs create-log-group --log-group-name /api/erros"],
      (c) => !!(c.logs && c.logs.grupos["/api/erros"])),
  ]);
  at("cw-2", [
    d("pcw-al1", "cloudwatch", 2, 70, "Disco quase cheio", "Avise quando o disco passar de 85%. Crie o alarme <b>disco-cheio</b> (DiskSpaceUtilization, limite 85).",
      ["--metric-name DiskSpaceUtilization --threshold 85"], ["aws cloudwatch put-metric-alarm --alarm-name disco-cheio --metric-name DiskSpaceUtilization --namespace CWAgent --threshold 85 --comparison-operator GreaterThanThreshold"],
      (c) => !!(c.cloudwatch && c.cloudwatch.alarmes["disco-cheio"])),
    d("pcw-al2", "cloudwatch", 2, 70, "API lenta", "Se a latência passar de 1000ms, você quer saber. Crie o alarme <b>latencia-api</b> (Latency, limite 1000).",
      ["--metric-name Latency --threshold 1000"], ["aws cloudwatch put-metric-alarm --alarm-name latencia-api --metric-name Latency --namespace AWS/ApiGateway --threshold 1000 --comparison-operator GreaterThanThreshold"],
      (c) => !!(c.cloudwatch && c.cloudwatch.alarmes["latencia-api"])),
  ]);
})();
