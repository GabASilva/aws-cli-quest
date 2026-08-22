"use strict";
// ============================================================
// CLImb — mundo-real-2.js
// PROBLEMA (medido nas 599 atividades): a camada de CENÁRIO — mundo-real,
// projetos, diagnostico, adv-*, extras-cenarios — só usa 7 serviços:
// s3, ec2, iam, lambda, dynamodb, rds e cloudwatch. Os outros 42 aparecem
// só na própria trilha e NUNCA são compostos com nada.
//
// Resultado prático: a pessoa aprende SQS, SNS, KMS, Secrets Manager,
// CloudFormation, ECR, ECS, ACM, CloudFront, Route53, Step Functions,
// EventBridge, Budgets, Comprehend, Translate e Polly — e nunca usa nenhum
// deles pra CONSTRUIR alguma coisa. São ensinados e abandonados.
//
// Esta leva dá um cenário de trabalho real a 17 desses serviços órfãos.
// Nenhum comando novo é introduzido: tudo aqui já foi ensinado na trilha de
// origem — o que muda é que agora as peças se encaixam.
//
// TODAS as sequências foram EXECUTADAS no simulador antes de virarem
// atividade (regra nº 0 do CLAUDE.md — nunca chutar). O que isso pegou:
//   • `ecs register-task-definition` exige --container-definitions;
//   • `route53 create-hosted-zone` exige --caller-reference, e grava o
//     domínio COM ponto final ("loja.com.br.") — o validador considera isso;
//   • `budgets` exige --account-id e o --budget em JSON completo;
//   • `sqs receive-message` NÃO consome a mensagem (dá pra validar por estado);
//   • Polly/Comprehend/Translate não deixam estado na conta — esses validam
//     pelo comando, não pelo que sobrou;
//   • só existem dois templates locais de CloudFormation: infra.yaml e
//     site-s3.yaml.
// Os nomes de recurso foram conferidos um a um contra as outras 599 pra não
// colidir (nome repetido = "already exists" e a atividade travaria).
// ============================================================
(function () {
  if (typeof DESAFIOS === "undefined") return;
  if (DESAFIOS.some((d) => d.id === "real-25")) return;

  const NOVOS = [
    // ---------------- Integração: fila + aviso ----------------
    { id: "real-25", servico: "mundo-real", nivel: 3, xp: 120,
      titulo: "Pedido que não se perde (SQS + SNS)",
      descricao:
        "O checkout da loja está perdendo pedido quando o processador cai. A saída é <b>desacoplar</b>: " +
        "o site joga o pedido numa fila e vai embora; quem processa lê no ritmo dele. " +
        "Crie a fila <b>chamados-fila</b>, o tópico <b>chamados-avisos</b> pra avisar o time, " +
        "coloque um pedido na fila e confira que ele está lá. " +
        "<small>(a fila segura o pedido mesmo com o processador desligado — é isso que evita a perda)</small>",
      dicas: [
        "São quatro passos: criar a fila, criar o tópico, mandar a mensagem e ler a fila.",
        "A URL da fila não é o nome dela — é o endereço completo: https://sqs.us-east-1.amazonaws.com/123456789012/<nome>",
      ],
      solucao: [
        "aws sqs create-queue --queue-name chamados-fila",
        "aws sns create-topic --name chamados-avisos",
        'aws sqs send-message --queue-url https://sqs.us-east-1.amazonaws.com/123456789012/chamados-fila --message-body "pedido 1001"',
        "aws sqs receive-message --queue-url https://sqs.us-east-1.amazonaws.com/123456789012/chamados-fila",
      ],
      validar: (c) => {
        const f = c.sqs && c.sqs.filas && c.sqs.filas["chamados-fila"];
        return !!f && (f.mensagens || []).length > 0 &&
               !!(c.sns && c.sns.topicos && c.sns.topicos["chamados-avisos"]);
      } },

    // ---------------- Segurança: segredo fora do código ----------------
    { id: "real-26", servico: "mundo-real", nivel: 3, xp: 120,
      titulo: "Senha do banco fora do código (KMS + Secrets Manager)",
      descricao:
        "A senha do banco está escrita no <b>config.py</b>, que está no Git, que o time todo lê. " +
        "Crie uma <b>chave do KMS</b> pra cifrar, guarde a senha no segredo <b>loja/db-senha</b> " +
        "e leia ela de volta — que é o que a aplicação faria ao subir. " +
        "<small>(o Secrets Manager guarda cifrado e registra quem leu; o arquivo no Git não faz nem um nem outro)</small>",
      dicas: [
        "Primeiro a chave (`create-key`), depois o segredo (`create-secret`) e por fim a leitura (`get-secret-value`).",
        "A forma do último passo é: aws secretsmanager get-secret-value --secret-id <nome-do-segredo>",
      ],
      solucao: [
        'aws kms create-key --description "Chave da loja"',
        "aws secretsmanager create-secret --name loja/db-senha --secret-string 'p4ssw0rd-da-loja'",
        "aws secretsmanager get-secret-value --secret-id loja/db-senha",
      ],
      validar: (c, cmd, ok) =>
        ok && ehCmd(cmd, "secretsmanager", "get-secret-value") &&
        Object.keys((c.kms && c.kms.chaves) || {}).length > 0 &&
        !!(c.secrets && c.secrets.segredos && c.secrets.segredos["loja/db-senha"]) },

    // ---------------- IaC ----------------
    // A stack "app" (do cfn-5) NUNCA é derrubada na trilha do CloudFormation e
    // deixa o bucket app-uploads-cfn ocupado — subir infra.yaml de novo dava
    // AlreadyExistsException. Em vez de desviar do problema, a atividade É o
    // problema: derrubar e reconstruir prova que o template é a fonte da
    // verdade e a stack é descartável. Conferido que só o cfn-5 cria essa
    // stack e que ninguém depende dos recursos dela.
    { id: "real-27", servico: "mundo-real", nivel: 3, xp: 120,
      titulo: "Infra que se reconstrói sozinha (CloudFormation)",
      descricao:
        "A stack <b>app</b> ficou de pé desde os testes e continua na fatura. " +
        "Derrube ela, confira o template <b>infra.yaml</b> e suba a mesma infra de novo, " +
        "agora como <b>loja-infra</b> — provando que dá pra recriar tudo do zero a partir do arquivo. " +
        "<small>(é isso que IaC compra: a stack é descartável, o template é a fonte da verdade. " +
        "Repare que só dá pra subir de novo DEPOIS de derrubar — os recursos têm nome único na conta)</small>",
      dicas: [
        "Primeiro `delete-stack` na antiga: a stack sabe apagar o que ela criou, então libera os nomes.",
        "Depois: validate-template → create-stack --stack-name <novo-nome> --template-body file://infra.yaml → describe-stack-resources",
      ],
      solucao: [
        "aws cloudformation delete-stack --stack-name app",
        "aws cloudformation validate-template --template-body file://infra.yaml",
        "aws cloudformation create-stack --stack-name loja-infra --template-body file://infra.yaml",
        "aws cloudformation describe-stack-resources --stack-name loja-infra",
      ],
      validar: (c, cmd, ok) => {
        const st = (c.cloudformation && c.cloudformation.stacks) || {};
        return ok && ehCmd(cmd, "cloudformation", "describe-stack-resources") &&
               !!st["loja-infra"] && !st["app"];
      } },

    // ---------------- IA aplicada ----------------
    { id: "real-28", servico: "mundo-real", nivel: 3, xp: 130,
      titulo: "Atendimento multilíngue (Comprehend + Translate + Polly)",
      descricao:
        "Chegou uma reclamação no suporte e ninguém do time lê espanhol: " +
        "<b>“El producto llego roto”</b>. Monte a esteira: descubra <b>em que idioma</b> está, " +
        "<b>traduza</b> pro português, meça o <b>sentimento</b> do texto traduzido e gere a " +
        "<b>resposta em áudio</b> pro cliente. " +
        "<small>(é assim que se usa IA na AWS de verdade: serviços pequenos encadeados, cada um fazendo uma coisa)</small>",
      dicas: [
        "Quatro serviços, um passo cada: Comprehend descobre o idioma, Translate traduz, Comprehend mede o sentimento, Polly fala.",
        "O sentimento precisa saber o idioma do texto: --language-code pt. E o Polly precisa de --voice-id e --output-format.",
      ],
      solucao: [
        "aws comprehend detect-dominant-language --text 'El producto llego roto'",
        "aws translate translate-text --source-language-code es --target-language-code pt --text 'El producto llego roto'",
        "aws comprehend detect-sentiment --text 'O produto chegou quebrado' --language-code pt",
        "aws polly synthesize-speech --text 'Recebemos sua reclamacao e vamos resolver' --voice-id Camila --output-format mp3 resposta.mp3",
      ],
      // Comprehend/Translate/Polly não deixam estado na conta: valida pelo comando final.
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "polly", "synthesize-speech") },

    // ---------------- Contêiner ----------------
    { id: "real-29", servico: "mundo-real", nivel: 3, xp: 130,
      titulo: "Do build ao ar em contêiner (ECR + ECS)",
      descricao:
        "A API vai virar contêiner. Crie o repositório de imagens <b>api-conteiner</b>, " +
        "o cluster <b>cluster-prod</b>, registre a receita <b>tarefa-api</b> e suba o serviço " +
        "<b>servico-api-prod</b> com <b>2 cópias</b> rodando. " +
        "<small>(o serviço é o que repõe a cópia que morrer — sem ele, contêiner que cai não volta)</small>",
      dicas: [
        "Ordem: repositório → cluster → task definition → serviço. O serviço só sobe se a receita já existir.",
        "A receita precisa do arquivo de containers: --container-definitions file://tarefa-web.json",
      ],
      solucao: [
        "aws ecr create-repository --repository-name api-conteiner",
        "aws ecs create-cluster --cluster-name cluster-prod",
        "aws ecs register-task-definition --family tarefa-api --container-definitions file://tarefa-web.json",
        "aws ecs create-service --cluster cluster-prod --service-name servico-api-prod --task-definition tarefa-api --desired-count 2",
      ],
      validar: (c) => {
        const s = c.ecs && c.ecs.servicos && c.ecs.servicos["servico-api-prod"];
        return !!(c.ecr && c.ecr.repositorios && c.ecr.repositorios["api-conteiner"]) &&
               !!s && s.cluster === "cluster-prod" && (s.desejado || 0) >= 2;
      } },

    // ---------------- Entrega: site com domínio e HTTPS ----------------
    { id: "real-30", servico: "mundo-real", nivel: 3, xp: 130,
      titulo: "Site com domínio e HTTPS (S3 + ACM + CloudFront + Route53)",
      descricao:
        "O site estático precisa ir ao ar em <b>loja.com.br</b>, com cadeado e rápido no Brasil inteiro. " +
        "Crie o bucket <b>loja-site</b>, peça o <b>certificado</b> do domínio, ponha o <b>CloudFront</b> " +
        "na frente do bucket e crie a <b>zona DNS</b> do domínio. " +
        "<small>(o CloudFront é quem serve o HTTPS e guarda cópia perto do usuário; o bucket sozinho não faz nenhum dos dois)</small>",
      dicas: [
        "Quatro peças: o bucket guarda, o ACM emite o certificado, o CloudFront distribui e o Route53 aponta o nome.",
        "A zona precisa de --caller-reference (um identificador seu, pra AWS não criar duas iguais por engano).",
      ],
      solucao: [
        "aws s3 mb s3://loja-site",
        "aws acm request-certificate --domain-name loja.com.br",
        "aws cloudfront create-distribution --origin-domain-name loja-site.s3.amazonaws.com",
        "aws route53 create-hosted-zone --name loja.com.br --caller-reference loja-1",
      ],
      validar: (c) => {
        const temCert = Object.values((c.acm && c.acm.certificados) || {}).some((x) => x.dominio === "loja.com.br");
        // o Route53 grava o domínio com ponto final ("loja.com.br.") — conferido no simulador
        const temZona = Object.values((c.route53 && c.route53.zonas) || {})
          .some((z) => String(z.nome || "").replace(/\.$/, "") === "loja.com.br");
        return !!(c.s3.buckets["loja-site"]) && temCert && temZona &&
               Object.keys((c.cloudfront && c.cloudfront.distribuicoes) || {}).length > 0;
      } },

    // ---------------- Orquestração ----------------
    { id: "real-31", servico: "mundo-real", nivel: 3, xp: 120,
      titulo: "Fluxo com etapas e horário (Step Functions + EventBridge)",
      descricao:
        "O fechamento do pedido tem quatro etapas e hoje é um <b>if</b> gigante dentro de uma Lambda: " +
        "quando falha no meio, ninguém sabe em que passo parou. Crie a máquina <b>fluxo-pedido</b>, " +
        "dispare a execução <b>p1</b> e crie a regra <b>toda-noite</b> pra rodar o fechamento às 3h. " +
        "<small>(a máquina de estados guarda em que passo parou — é a diferença entre “falhou” e “falhou no passo 3”)</small>",
      dicas: [
        "Criar a máquina, disparar uma execução e criar a regra de agenda. Três comandos, um por serviço.",
        "Dar --name na execução deixa o ARN dela previsível, o que ajuda a consultar depois.",
      ],
      solucao: [
        "aws stepfunctions create-state-machine --name fluxo-pedido --definition file://maquina-estados.json --role-arn arn:aws:iam::123456789012:role/papel-lambda",
        "aws stepfunctions start-execution --state-machine-arn arn:aws:states:us-east-1:123456789012:stateMachine:fluxo-pedido --name p1",
        "aws events put-rule --name toda-noite --schedule-expression 'cron(0 3 * * ? *)'",
      ],
      validar: (c) =>
        !!(c.sfn && c.sfn.maquinas && c.sfn.maquinas["fluxo-pedido"]) &&
        !!(c.events && c.events.regras && c.events.regras["toda-noite"]) },

    // ---------------- Custos ----------------
    { id: "real-32", servico: "mundo-real", nivel: 2, xp: 90,
      titulo: "Teto de gasto antes do susto (Budgets + Cost Explorer)",
      descricao:
        "A fatura do mês passado veio três vezes maior e ninguém percebeu no meio do caminho. " +
        "Crie o orçamento <b>teto-mensal</b> de <b>100 USD</b> e depois consulte quanto já foi gasto no mês. " +
        "<small>(o Budgets avisa antes de estourar; o Cost Explorer mostra onde o dinheiro foi — um é alarme, o outro é diagnóstico)</small>",
      dicas: [
        "O orçamento vai num JSON só, entre aspas simples, e o comando precisa saber a conta (--account-id).",
        "Depois, o Cost Explorer pede o período (--time-period), a granularidade e a métrica.",
      ],
      solucao: [
        "aws budgets create-budget --account-id 123456789012 --budget '{\"BudgetName\":\"teto-mensal\",\"BudgetLimit\":{\"Amount\":\"100\",\"Unit\":\"USD\"},\"TimeUnit\":\"MONTHLY\",\"BudgetType\":\"COST\"}'",
        "aws ce get-cost-and-usage --time-period Start=2026-08-01,End=2026-08-31 --granularity MONTHLY --metrics BlendedCost",
      ],
      validar: (c, cmd, ok) =>
        ok && ehCmd(cmd, "ce", "get-cost-and-usage") &&
        !!(c.budgets && c.budgets.orcamentos && c.budgets.orcamentos["teto-mensal"]) },
  ];

  // Entram no fim da trilha "mundo-real", depois da última real-*.
  let ultimo = -1;
  for (let i = 0; i < DESAFIOS.length; i++) if (DESAFIOS[i].servico === "mundo-real") ultimo = i;
  if (ultimo >= 0) DESAFIOS.splice(ultimo + 1, 0, ...NOVOS);
  else for (const d of NOVOS) DESAFIOS.push(d);
})();
