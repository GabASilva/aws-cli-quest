"use strict";
// ============================================================
// CLImb — cobertura-3.js
// LEVA 3 (final) do levantamento de cobertura. Fecha os comandos que sobraram
// depois das levas 1 e 2, levando a cobertura de 98% para ~100%.
//
// Todos os nomes aqui foram VERIFICADOS no código antes de escrever (regra nº 0
// do CLAUDE.md — nunca chutar): banco "dados_loja", trilha "trilha-auditoria",
// target group "loja-tg" identificado por ARN, e as trilhas que apagam o
// recurso no fim (ECS, Step Functions e Cognito) ganharam atividade
// autossuficiente, que cria o que precisa.
//
// FICA DE FORA, de propósito: "organizations delete-organization". Conferi que
// NÃO existe comando pra remover conta-membro no simulador, e a organização da
// trilha tem a conta "time-dados" — então a operação sempre recusaria. Cobrir
// isso exigiria um remove-account-from-organization, que é outra tarefa.
// ============================================================
(function () {
  if (typeof DESAFIOS === "undefined" || typeof SERVICOS === "undefined") return;

  const A = [
    // ===================== ECS =====================
    { id: "cob-ecs-1", servico: "ecs", nivel: 2, xp: 90, titulo: "Que receitas de tarefa existem?",
      descricao: "A <b>task definition</b> é a receita do contêiner (imagem, CPU, memória). Liste as receitas registradas na conta.",
      dicas: ["Pra ver o que existe, o verbo costuma ser `list-…`. Este não precisa de parâmetro.", "Repare que cada uma vem com :1, :2… — task definition é versionada, igual às versões de uma Lambda."],
      solucao: ["aws ecs list-task-definitions"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "list-task-definitions") },

    { id: "cob-ecs-2", servico: "ecs", nivel: 3, xp: 110, titulo: "Que serviços estão no ar?",
      descricao: "Recrie o cluster <b>cluster-suporte</b> e liste os <b>serviços</b> dele. <small>(serviço é o que mantém N cópias da tarefa rodando e repõe as que morrem)</small>",
      dicas: ["Depois de criar o cluster, `list-…` mostra os serviços — e ele aceita um filtro dizendo de qual cluster.", "A forma é: aws ecs create-cluster --cluster-name <nome>  →  aws ecs list-services --cluster <nome>"],
      solucao: [
        "aws ecs create-cluster --cluster-name cluster-suporte",
        "aws ecs list-services --cluster cluster-suporte",
      ],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "list-services") },

    // ===================== Step Functions =====================
    // A trilha apaga a máquina no fim (sfn-6), então a atividade recria.
    // O --name na execução deixa o ARN PREVISÍVEL (conferido no handler:
    // arn:aws:states:<regiao>:<conta>:execution:<maquina>:<nome>), o que evita
    // precisar de um resolver novo no harness.
    { id: "cob-sfn-1", servico: "stepfunctions", nivel: 3, xp: 140, titulo: "Como terminou aquela execução?",
      descricao: "Recrie o fluxo <b>fluxo-suporte</b>, dispare uma execução chamada <b>chamado-1</b> e depois <b>consulte o resultado dela</b>. <small>(é assim que se descobre se o fluxo terminou, falhou ou ainda está rodando)</small>",
      dicas: ["`describe-…` mostra os detalhes de UMA execução — e ela é identificada por ARN, não por nome. Dar um --name na execução deixa esse ARN previsível.", "A forma do último passo é: aws stepfunctions describe-execution --execution-arn <arn-da-execucao>"],
      solucao: [
        "aws stepfunctions create-state-machine --name fluxo-suporte --definition file://maquina-estados.json --role-arn arn:aws:iam::123456789012:role/papel-lambda",
        "aws stepfunctions start-execution --state-machine-arn arn:aws:states:us-east-1:123456789012:stateMachine:fluxo-suporte --name chamado-1",
        "aws stepfunctions describe-execution --execution-arn arn:aws:states:us-east-1:123456789012:execution:fluxo-suporte:chamado-1",
      ],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "stepfunctions", "describe-execution") },

    // ===================== Cognito =====================
    // A trilha apaga o pool no fim (cog-7), então a atividade recria.
    { id: "cob-cog-1", servico: "cognito-idp", nivel: 3, xp: 120, titulo: "Remova um usuário do pool",
      descricao: "Recrie o pool <b>pool-suporte</b>, crie a usuária <b>joana</b> e depois <b>apague</b> ela. <small>(os comandos <b>admin-</b> são as ações que VOCÊ faz pelos usuários; sem o prefixo seriam ações do próprio usuário final)</small>",
      dicas: ["Os comandos administrativos começam com `admin-`. Apagar continua sendo `delete-`.", "A forma do último passo é: aws cognito-idp admin-delete-user --user-pool-id <id> --username <usuario>"],
      solucao: [
        "aws cognito-idp create-user-pool --pool-name pool-suporte",
        "aws cognito-idp admin-create-user --user-pool-id <pool-id> --username joana",
        "aws cognito-idp admin-delete-user --user-pool-id <pool-id> --username joana",
      ],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cognito-idp", "admin-delete-user") },

    // ===================== Glue =====================
    // NÃO apaga o "dados_loja": conferi que a trilha do Athena (que vem depois)
    // faz lookup em conta.glue.bancos pra rodar a consulta — apagá-lo quebrava
    // a trilha seguinte. Por isso a atividade cria um banco descartável.
    { id: "cob-glue-2", servico: "glue", nivel: 3, xp: 100, titulo: "Descarte um catálogo",
      descricao: "Crie um banco <b>catalogo_temp</b> e depois <b>apague</b> ele. <small>(apagar o catálogo NÃO apaga os arquivos no S3 — o Glue guarda só o mapa, não o dado)</small>",
      dicas: ["Criar é `create-…` e apagar é `delete-…`. O delete identifica o banco pelo nome.", "A forma é: aws glue create-database --database-input '{\"Name\":\"<nome>\"}'  →  aws glue delete-database --name <nome>"],
      solucao: [
        "aws glue create-database --database-input '{\"Name\":\"catalogo_temp\"}'",
        "aws glue delete-database --name catalogo_temp",
      ],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "glue", "delete-database") && !((c.glue && c.glue.bancos || {})["catalogo_temp"]) },

    // ===================== CloudTrail =====================
    { id: "cob-ct-2", servico: "cloudtrail", nivel: 3, xp: 100, titulo: "Remova a trilha de auditoria",
      descricao: "<b>Apague</b> a trilha <b>trilha-auditoria</b>. <small>(os logs já entregues no S3 continuam lá — some só a configuração que gravava dali pra frente)</small>",
      dicas: ["Apagar é sempre `delete-…`. Ele identifica a trilha pelo nome.", "A forma é: aws cloudtrail delete-trail --name <nome-da-trilha>"],
      solucao: ["aws cloudtrail delete-trail --name trilha-auditoria"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cloudtrail", "delete-trail") },

    // ===================== ELB =====================
    { id: "cob-elb-2", servico: "elbv2", nivel: 3, xp: 100, titulo: "Limpe o grupo de destino",
      descricao: "Você viu que o target group sobreviveu ao balanceador. <b>Apague</b> o <b>loja-tg</b> — senão ele fica na fatura sem servir a ninguém.",
      dicas: ["Apagar é sempre `delete-…`. O target group é identificado por ARN, não por nome.", "A forma é: aws elbv2 delete-target-group --target-group-arn <arn>"],
      solucao: ["aws elbv2 delete-target-group --target-group-arn <tg-arn>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "elbv2", "delete-target-group") },
  ];

  const porServico = {};
  for (const d of A) (porServico[d.servico] = porServico[d.servico] || []).push(d);
  for (const [svc, lista] of Object.entries(porServico)) {
    if (DESAFIOS.some((d) => d.id === lista[0].id)) continue;
    let i = -1;
    for (let k = 0; k < DESAFIOS.length; k++) if (DESAFIOS[k].servico === svc) i = k;
    if (i >= 0) DESAFIOS.splice(i + 1, 0, ...lista);
    else for (const d of lista) DESAFIOS.push(d);
  }

  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "ecs.list-task-definitions": "lista as receitas de contêiner registradas. Elas são versionadas (:1, :2…), igual às versões de uma Lambda.",
      "ecs.list-services": "mostra os serviços de um cluster — o serviço é o que mantém N cópias da tarefa rodando e repõe as que morrem.",
      "glue.delete-database": "apaga o banco do catálogo. Não mexe nos arquivos do S3 — o Glue guarda o mapa, não o dado.",
      "cloudtrail.delete-trail": "apaga a configuração da trilha. Os logs já entregues no S3 continuam lá.",
      "elbv2.delete-target-group": "apaga o grupo de destino. Ele NÃO some junto com o load balancer — fica na fatura se você esquecer.",
      // este escapou na leva do Lambda: a atividade existia, o PORQUE não
      "stepfunctions.describe-execution": "mostra como UMA execução terminou: sucesso, falha ou ainda rodando. Ela é identificada por ARN, não por nome.",
      "cognito-idp.admin-delete-user": "apaga um usuário do pool. O prefixo admin- marca o que VOCÊ faz pelos usuários; sem ele seriam ações do próprio usuário final.",
      "lambda.delete-function": "apaga a função e leva junto as versões e os aliases. Não há lixeira.",
    });
  }
})();
