"use strict";
// ============================================================
// AWS CLI Quest — cenarios-reais.js
// Seção "🌎 Mundo real": cenários completos e realistas, do médio ao
// avançado (combinam vários comandos/serviços, como no trabalho de verdade).
// ADITIVO: empurra a seção em SERVICOS_META e os desafios em DESAFIOS.
// (ehCmd vem do desafios.js; helpers ficam locais nesta IIFE pra não
//  colidir com os _b/_u/... de missoes.js.)
// ============================================================

(function () {
  const bkt = (c, n) => c.s3.buckets[n];
  const sg = (c, n) => Object.values(c.ec2.securityGroups).find((g) => g.nome === n);
  const inst = (c, t) => Object.values(c.ec2.instancias).some((i) => i.tipo === t && i.estado === "running");

  const CENARIOS = [
    // ---------------- médio ----------------
    {
      nivel: 2, xp: 90, titulo: "Landing page no ar",
      descricao: "O time de marketing quer publicar uma landing page. Crie o bucket <b>site-lancamento</b>, sincronize a pasta <b>./site</b> nele e configure a hospedagem com <b>index.html</b> de página inicial.",
      dicas: ["3 comandos: mb, sync e website.", "aws s3 website s3://site-lancamento --index-document index.html"],
      solucao: ["aws s3 mb s3://site-lancamento", "aws s3 sync ./site s3://site-lancamento", "aws s3 website s3://site-lancamento --index-document index.html"],
      validar: (c) => { const b = bkt(c, "site-lancamento"); return !!b && !!b.objetos["index.html"] && b.website && b.website.indice === "index.html"; },
    },
    {
      nivel: 2, xp: 90, titulo: "Logs com histórico",
      descricao: "Para auditoria, os logs não podem ser perdidos. Crie o bucket <b>logs-central</b>, <b>ligue o versionamento</b> e suba o <b>relatorio.csv</b>.",
      dicas: ["mb + put-bucket-versioning Status=Enabled + cp.", "O versionamento é via aws s3api."],
      solucao: ["aws s3 mb s3://logs-central", "aws s3api put-bucket-versioning --bucket logs-central --versioning-configuration Status=Enabled", "aws s3 cp relatorio.csv s3://logs-central/"],
      validar: (c) => { const b = bkt(c, "logs-central"); return !!b && b.versionamento === "Enabled" && !!b.objetos["relatorio.csv"]; },
    },
    {
      nivel: 2, xp: 100, titulo: "Backup com acesso controlado",
      descricao: "Crie o bucket <b>backup-financeiro</b>, ligue o versionamento e aplique uma <b>política de acesso</b> (use o <b>politica-publica.json</b> do disco).",
      dicas: ["mb, put-bucket-versioning e put-bucket-policy --policy file://politica-publica.json."],
      solucao: ["aws s3 mb s3://backup-financeiro", "aws s3api put-bucket-versioning --bucket backup-financeiro --versioning-configuration Status=Enabled", "aws s3api put-bucket-policy --bucket backup-financeiro --policy file://politica-publica.json"],
      validar: (c) => { const b = bkt(c, "backup-financeiro"); return !!b && b.versionamento === "Enabled" && !!b.politica; },
    },
    {
      nivel: 2, xp: 110, titulo: "Servidor web de produção",
      descricao: "Prepare um servidor web: par de chaves <b>web-key</b>, security group <b>web-prod</b> liberando <b>80 e 443</b>, e uma instância <b>t3.small</b> usando a chave e o grupo.",
      dicas: ["Crie a chave e o SG ANTES da instância.", "São 2 regras de ingress (80 e 443) e o run-instances com --key-name e --security-groups."],
      solucao: [
        "aws ec2 create-key-pair --key-name web-key",
        'aws ec2 create-security-group --group-name web-prod --description "Web producao"',
        "aws ec2 authorize-security-group-ingress --group-name web-prod --protocol tcp --port 80 --cidr 0.0.0.0/0",
        "aws ec2 authorize-security-group-ingress --group-name web-prod --protocol tcp --port 443 --cidr 0.0.0.0/0",
        "aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.small --key-name web-key --security-groups web-prod",
      ],
      validar: (c) => {
        const g = sg(c, "web-prod");
        return !!c.ec2.keyPairs["web-key"] && !!g && g.regras.some((r) => r.porta === 80) && g.regras.some((r) => r.porta === 443) &&
          Object.values(c.ec2.instancias).some((i) => i.tipo === "t3.small" && i.chave === "web-key" && i.sgs.includes("web-prod") && i.estado === "running");
      },
    },
    {
      nivel: 2, xp: 100, titulo: "Onboarding do time de engenharia",
      descricao: "Chegaram dois devs. Crie o grupo <b>engenharia</b> com a política <b>AmazonEC2FullAccess</b>, crie os usuários <b>rafael</b> e <b>bia</b> e coloque os dois no grupo.",
      dicas: ["create-group, attach-group-policy (arn:aws:iam::aws:policy/AmazonEC2FullAccess), 2x create-user, 2x add-user-to-group."],
      solucao: [
        "aws iam create-group --group-name engenharia",
        "aws iam attach-group-policy --group-name engenharia --policy-arn arn:aws:iam::aws:policy/AmazonEC2FullAccess",
        "aws iam create-user --user-name rafael",
        "aws iam create-user --user-name bia",
        "aws iam add-user-to-group --user-name rafael --group-name engenharia",
        "aws iam add-user-to-group --user-name bia --group-name engenharia",
      ],
      validar: (c) => { const g = c.iam.grupos["engenharia"]; return !!g && g.politicas.some((p) => p.includes("AmazonEC2FullAccess")) && g.membros.includes("rafael") && g.membros.includes("bia"); },
    },
    {
      nivel: 2, xp: 80, titulo: "Acesso de auditoria",
      descricao: "Um auditor externo precisa só LER. Crie o usuário <b>auditor</b> e dê a ele a política <b>IAMReadOnlyAccess</b>.",
      dicas: ["create-user + attach-user-policy.", "arn:aws:iam::aws:policy/IAMReadOnlyAccess"],
      solucao: ["aws iam create-user --user-name auditor", "aws iam attach-user-policy --user-name auditor --policy-arn arn:aws:iam::aws:policy/IAMReadOnlyAccess"],
      validar: (c) => { const u = c.iam.usuarios["auditor"]; return !!u && u.politicas.some((p) => p.includes("IAMReadOnlyAccess")); },
    },
    {
      nivel: 2, xp: 100, titulo: "Catálogo de produtos",
      descricao: "Crie a tabela <b>catalogo-prod</b> (chave <b>sku</b>, texto), insira <b>dois</b> produtos e depois liste tudo com um scan.",
      dicas: ["create-table, 2x put-item (sku diferentes) e scan.", "Item: '{\"sku\": {\"S\": \"A1\"}}'"],
      solucao: [
        "aws dynamodb create-table --table-name catalogo-prod --attribute-definitions AttributeName=sku,AttributeType=S --key-schema AttributeName=sku,KeyType=HASH --billing-mode PAY_PER_REQUEST",
        "aws dynamodb put-item --table-name catalogo-prod --item '{\"sku\": {\"S\": \"A1\"}, \"nome\": {\"S\": \"Teclado\"}}'",
        "aws dynamodb put-item --table-name catalogo-prod --item '{\"sku\": {\"S\": \"A2\"}, \"nome\": {\"S\": \"Mouse\"}}'",
        "aws dynamodb scan --table-name catalogo-prod",
      ],
      validar: (c, cmd, ok) => { const t = c.dynamodb.tabelas["catalogo-prod"]; return ok && ehCmd(cmd, "dynamodb", "scan") && !!t && t.itens.length >= 2; },
    },

    // ---------------- avançado ----------------
    {
      nivel: 3, xp: 120, titulo: "Bastion host (SSH restrito)",
      descricao: "Boa prática: NÃO libere SSH pra todo mundo. Crie o SG <b>bastion-sg</b> liberando a porta <b>22</b> apenas pro IP <b>203.0.113.50/32</b>, e suba uma <b>t3.micro</b> com esse grupo.",
      dicas: ["/32 = um IP só.", "Crie o SG e a regra antes do run-instances --security-groups bastion-sg."],
      solucao: [
        'aws ec2 create-security-group --group-name bastion-sg --description "Bastion"',
        "aws ec2 authorize-security-group-ingress --group-name bastion-sg --protocol tcp --port 22 --cidr 203.0.113.50/32",
        "aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.micro --security-groups bastion-sg",
      ],
      validar: (c) => { const g = sg(c, "bastion-sg"); return !!g && g.regras.some((r) => r.porta === 22 && r.cidr === "203.0.113.50/32") && Object.values(c.ec2.instancias).some((i) => i.tipo === "t3.micro" && i.sgs.includes("bastion-sg")); },
    },
    {
      nivel: 3, xp: 130, titulo: "Política versionada da empresa",
      descricao: "Crie a política <b>acesso-leitura</b> (de file://politica-publica.json), publique uma <b>segunda versão como padrão</b> e anexe ela ao usuário <b>auditor</b>.",
      dicas: ["create-policy, create-policy-version --set-as-default, attach-user-policy.", "ARN: arn:aws:iam::123456789012:policy/acesso-leitura"],
      solucao: [
        "aws iam create-policy --policy-name acesso-leitura --policy-document file://politica-publica.json",
        "aws iam create-policy-version --policy-arn arn:aws:iam::123456789012:policy/acesso-leitura --policy-document file://politica-publica.json --set-as-default",
        "aws iam attach-user-policy --user-name auditor --policy-arn arn:aws:iam::123456789012:policy/acesso-leitura",
      ],
      validar: (c) => { const p = c.iam.policies["acesso-leitura"]; const u = c.iam.usuarios["auditor"]; return !!p && p.defaultVersionId === "v2" && !!u && u.politicas.some((a) => a.endsWith(":policy/acesso-leitura")); },
    },
    {
      nivel: 3, xp: 130, titulo: "Pedidos com chave composta",
      descricao: "Modele uma tabela de pedidos por cliente e data: <b>pedidos-loja</b> com partition key <b>cliente</b> (texto) e sort key <b>data</b> (número). Depois insira um pedido.",
      dicas: ["Dois attribute-definitions e dois key-schema (HASH + RANGE).", "put-item precisa das duas chaves no item."],
      solucao: [
        "aws dynamodb create-table --table-name pedidos-loja --attribute-definitions AttributeName=cliente,AttributeType=S AttributeName=data,AttributeType=N --key-schema AttributeName=cliente,KeyType=HASH AttributeName=data,KeyType=RANGE --billing-mode PAY_PER_REQUEST",
        "aws dynamodb put-item --table-name pedidos-loja --item '{\"cliente\": {\"S\": \"ana\"}, \"data\": {\"N\": \"20260617\"}}'",
      ],
      validar: (c) => { const t = c.dynamodb.tabelas["pedidos-loja"]; return !!t && t.esquema.some((k) => k.KeyType === "RANGE") && t.itens.length >= 1; },
    },
    {
      nivel: 3, xp: 150, titulo: "Função de processamento",
      descricao: "Monte uma função serverless: crie a role <b>proc-role</b> (trust.json), anexe a <b>AWSLambdaBasicExecutionRole</b>, crie a função <b>processa-pedido</b> (python3.12) e configure a variável de ambiente <b>FILA=pedidos</b>.",
      dicas: ["create-role → attach-role-policy → create-function → update-function-configuration --environment.", "Role ARN no create-function: arn:aws:iam::123456789012:role/proc-role"],
      solucao: [
        "aws iam create-role --role-name proc-role --assume-role-policy-document file://trust.json",
        "aws iam attach-role-policy --role-name proc-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        "aws lambda create-function --function-name processa-pedido --runtime python3.12 --role arn:aws:iam::123456789012:role/proc-role --handler app.handler --zip-file fileb://app.zip",
        "aws lambda update-function-configuration --function-name processa-pedido --environment Variables={FILA=pedidos}",
      ],
      validar: (c) => { const f = c.lambda.funcoes["processa-pedido"]; return !!c.iam.roles["proc-role"] && !!f && f.env && f.env.FILA === "pedidos"; },
    },
    {
      nivel: 3, xp: 140, titulo: "Inventário da frota em arquivo",
      descricao: "Suba <b>3 instâncias t3.micro</b> e salve só os <b>InstanceId</b> delas, em texto, no arquivo <b>ids-frota.txt</b> (run-instances + describe + --query + --output text + <code>></code>).",
      dicas: ["run-instances --count 3.", "describe-instances --query 'Reservations[0].Instances[*].InstanceId' --output text > ids-frota.txt"],
      solucao: [
        "aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.micro --count 3",
        "aws ec2 describe-instances --query 'Reservations[0].Instances[*].InstanceId' --output text > ids-frota.txt",
      ],
      validar: (c) => { const s = (c.arquivosSalvos || {})["ids-frota.txt"]; return !!s && /i-0/.test(s); },
    },
    {
      nivel: 3, xp: 130, titulo: "Relatório de políticas",
      descricao: "Gere um relatório: liste os <b>nomes</b> das políticas gerenciadas pela AWS, em formato <b>text</b>, e salve em <b>politicas.txt</b>.",
      dicas: ["list-policies --scope AWS --query 'Policies[*].PolicyName' --output text > politicas.txt"],
      solucao: ["aws iam list-policies --scope AWS --query 'Policies[*].PolicyName' --output text > politicas.txt"],
      validar: (c) => { const s = (c.arquivosSalvos || {})["politicas.txt"]; return !!s && s.length > 0; },
    },
    {
      nivel: 3, xp: 130, titulo: "Offboarding seguro",
      descricao: "Um funcionário saiu. Crie o usuário <b>ex-dev</b>, dê a ele a <b>AmazonS3ReadOnlyAccess</b>, depois <b>revogue</b> (detach) e por fim <b>apague</b> o usuário.",
      dicas: ["create-user, attach-user-policy, detach-user-policy, delete-user.", "ARN: arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"],
      solucao: [
        "aws iam create-user --user-name ex-dev",
        "aws iam attach-user-policy --user-name ex-dev --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
        "aws iam detach-user-policy --user-name ex-dev --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
        "aws iam delete-user --user-name ex-dev",
      ],
      validar: (c) => !c.iam.usuarios["ex-dev"],
    },
    {
      nivel: 3, xp: 120, titulo: "Desliga o que não usa",
      descricao: "Pra economizar, suba uma instância <b>t2.micro</b> e logo em seguida <b>pare</b> ela (stopped não cobra processamento).",
      dicas: ["run-instances, pegue o id no describe-instances e stop-instances --instance-ids <id>."],
      solucao: [
        "aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t2.micro",
        "aws ec2 describe-instances",
        "aws ec2 stop-instances --instance-ids <id-da-instância>",
      ],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "stop-instances") && Object.values(c.ec2.instancias).some((i) => i.tipo === "t2.micro" && i.estado === "stopped"),
    },

    // ---------------- multi-serviço (vários serviços conversando) ----------------
    {
      nivel: 3, xp: 180, titulo: "App de tarefas serverless (IAM + DynamoDB + Lambda)",
      descricao: "Monte um backend serverless inteiro: a role <b>tarefas-role</b> (trust.json) com a <b>AWSLambdaBasicExecutionRole</b>, a tabela <b>tarefas</b> (chave id), a função <b>tarefas-fn</b> (python3.12) apontando pra tabela via env <b>TABELA=tarefas</b>, e por fim <b>invoque</b> a função.",
      dicas: ["Ordem: role → attach → tabela → função → env → invoke.", "A role vira arn:aws:iam::123456789012:role/tarefas-role no create-function."],
      solucao: [
        "aws iam create-role --role-name tarefas-role --assume-role-policy-document file://trust.json",
        "aws iam attach-role-policy --role-name tarefas-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        "aws dynamodb create-table --table-name tarefas --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST",
        "aws lambda create-function --function-name tarefas-fn --runtime python3.12 --role arn:aws:iam::123456789012:role/tarefas-role --handler app.handler --zip-file fileb://app.zip",
        "aws lambda update-function-configuration --function-name tarefas-fn --environment Variables={TABELA=tarefas}",
        "aws lambda invoke --function-name tarefas-fn saida.json",
      ],
      validar: (c) => {
        const f = c.lambda.funcoes["tarefas-fn"];
        return !!c.iam.roles["tarefas-role"] && !!c.dynamodb.tabelas["tarefas"] && !!f && f.env && f.env.TABELA === "tarefas" && f.invocada;
      },
    },
    {
      nivel: 3, xp: 160, titulo: "Front + back (S3 + IAM + Lambda)",
      descricao: "Publique o front e prepare o back: bucket <b>app-frontend</b> com o site (./site) e hospedagem web; role <b>app-back-role</b> (trust.json); e a função <b>app-back</b> (nodejs20.x) usando essa role.",
      dicas: ["3 serviços: S3 (mb+sync+website), IAM (create-role) e Lambda (create-function).", "Role ARN: arn:aws:iam::123456789012:role/app-back-role"],
      solucao: [
        "aws s3 mb s3://app-frontend",
        "aws s3 sync ./site s3://app-frontend",
        "aws s3 website s3://app-frontend --index-document index.html",
        "aws iam create-role --role-name app-back-role --assume-role-policy-document file://trust.json",
        "aws lambda create-function --function-name app-back --runtime nodejs20.x --role arn:aws:iam::123456789012:role/app-back-role --handler index.handler --zip-file fileb://app.zip",
      ],
      validar: (c) => {
        const b = c.s3.buckets["app-frontend"];
        return !!b && b.website && b.website.indice === "index.html" && !!c.iam.roles["app-back-role"] && !!c.lambda.funcoes["app-back"];
      },
    },
    {
      nivel: 3, xp: 180, titulo: "Pipeline de coleta (S3 + IAM + EC2)",
      descricao: "Monte a coleta de logs: bucket <b>pipeline-logs</b> com versionamento; usuário <b>pipeline-bot</b> com <b>AmazonS3FullAccess</b>; e um <b>coletor</b> (SG <b>coletor-sg</b> liberando 443 + instância t3.micro nele).",
      dicas: ["Combina S3, IAM e EC2.", "São ~7 comandos; crie o SG antes da instância."],
      solucao: [
        "aws s3 mb s3://pipeline-logs",
        "aws s3api put-bucket-versioning --bucket pipeline-logs --versioning-configuration Status=Enabled",
        "aws iam create-user --user-name pipeline-bot",
        "aws iam attach-user-policy --user-name pipeline-bot --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess",
        'aws ec2 create-security-group --group-name coletor-sg --description "Coletor"',
        "aws ec2 authorize-security-group-ingress --group-name coletor-sg --protocol tcp --port 443 --cidr 0.0.0.0/0",
        "aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.micro --security-groups coletor-sg",
      ],
      validar: (c) => {
        const b = c.s3.buckets["pipeline-logs"];
        const u = c.iam.usuarios["pipeline-bot"];
        const g = sg(c, "coletor-sg");
        return !!b && b.versionamento === "Enabled" && !!u && u.politicas.some((p) => p.includes("AmazonS3FullAccess")) &&
          !!g && g.regras.some((r) => r.porta === 443) && Object.values(c.ec2.instancias).some((i) => i.tipo === "t3.micro" && i.sgs.includes("coletor-sg"));
      },
    },
  ];

  // ---- Projeto capstone: 4 serviços conversando (EC2 + IAM + Lambda + DynamoDB) ----
  const PROJETO_LOJA = {
    id: "proj-loja", servico: "projetos", tipo: "projeto", nivel: 3, xp: 600,
    requisitos: ["ec2", "iam", "lambda", "dynamodb"],
    titulo: "🛒 Projeto: Loja completa (4 serviços)",
    descricao: "O maior desafio: uma loja com <b>back serverless</b> E <b>servidor</b>, usando IAM, DynamoDB, Lambda e EC2 juntos. Faça em qualquer ordem — o checklist marca sozinho.",
    dicas: [
      "A role loja-role vira arn:aws:iam::123456789012:role/loja-role no create-function.",
      "Crie a chave e o SG antes de subir a instância.",
    ],
    solucao: [
      "aws iam create-role --role-name loja-role --assume-role-policy-document file://trust.json",
      "aws iam attach-role-policy --role-name loja-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      "aws dynamodb create-table --table-name loja-pedidos --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST",
      "aws lambda create-function --function-name loja-api --runtime python3.12 --role arn:aws:iam::123456789012:role/loja-role --handler app.handler --zip-file fileb://app.zip",
      "aws lambda update-function-configuration --function-name loja-api --environment Variables={TABELA=loja-pedidos}",
      "aws ec2 create-key-pair --key-name loja-key",
      'aws ec2 create-security-group --group-name loja-web --description "Loja web"',
      "aws ec2 authorize-security-group-ingress --group-name loja-web --protocol tcp --port 80 --cidr 0.0.0.0/0",
      "aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.micro --key-name loja-key --security-groups loja-web",
    ],
    etapas: [
      { texto: "Criar a role loja-role e anexar a AWSLambdaBasicExecutionRole", validar: (c) => { const r = c.iam.roles["loja-role"]; return !!r && r.politicas.some((p) => p.includes("AWSLambdaBasicExecutionRole")); } },
      { texto: "Criar a tabela loja-pedidos (chave id)", validar: (c) => !!c.dynamodb.tabelas["loja-pedidos"] },
      { texto: "Criar a função loja-api (python3.12) com a role loja-role", validar: (c) => { const f = c.lambda.funcoes["loja-api"]; return !!f && /loja-role/.test(f.role); } },
      { texto: "Configurar a env TABELA=loja-pedidos na função", validar: (c) => { const f = c.lambda.funcoes["loja-api"]; return !!f && f.env && f.env.TABELA === "loja-pedidos"; } },
      { texto: "Criar o par de chaves loja-key e o security group loja-web (porta 80)", validar: (c) => { const g = sg(c, "loja-web"); return !!c.ec2.keyPairs["loja-key"] && !!g && g.regras.some((r) => r.porta === 80); } },
      { texto: "Subir uma instância t3.micro com a loja-key e o loja-web", validar: (c) => Object.values(c.ec2.instancias).some((i) => i.tipo === "t3.micro" && i.chave === "loja-key" && i.sgs.includes("loja-web") && i.estado === "running") },
    ],
  };

  // registra a seção (antes dos Projetos) e os desafios
  if (typeof SERVICOS_META !== "undefined" && !SERVICOS_META.some((s) => s.id === "mundo-real")) {
    const iProj = SERVICOS_META.findIndex((s) => s.id === "projetos");
    const pos = iProj >= 0 ? iProj : SERVICOS_META.length;
    SERVICOS_META.splice(pos, 0, { id: "mundo-real", nome: "Mundo real", subtitulo: "Cenários completos", icone: "🌎" });
    CENARIOS.forEach((d, i) => { d.id = "real-" + (i + 1); d.servico = "mundo-real"; DESAFIOS.push(d); });
    DESAFIOS.push(PROJETO_LOJA); // projeto capstone de 4 serviços na seção Projetos
  }
})();
