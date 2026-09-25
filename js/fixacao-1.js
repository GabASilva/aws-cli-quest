"use strict";
// ============================================================
// CLImb — fixacao-1.js
// Reforço do conteúdo ANTIGO (antes das levas de 21-24/09/2026).
//
// A revisão de 24/09 zerou a dívida das levas novas, mas no curso inteiro
// sobraram 239 comandos praticados UMA vez só (FIXACAO=1 node teste/analise.js
// lista a fila por trilha). Este arquivo paga essa dívida serviço a serviço,
// no molde boot.dev: cada comando volta logo depois da lição que o ensina,
// num cenário diferente — nunca no fim da trilha, nunca nas 3 primeiras
// posições (a amostra grátis das trilhas pagas).
//
// Prefixo de id: fx-<servico>-. Está em LEVAS_ESTRITAS do analise-corpo.js.
// Carrega DEPOIS de todos os *-completo.js (as âncoras precisam existir).
// ============================================================
(function () {
  if (typeof DESAFIOS === "undefined") return;

  function d(id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar) {
    return { id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar };
  }
  function at(anchorId, novos) {
    const i = DESAFIOS.findIndex((x) => x.id === anchorId);
    if (i < 0) {
      const g = typeof globalThis !== "undefined" ? globalThis : window;
      (g.__ancorasPerdidas = g.__ancorasPerdidas || []).push(anchorId);
      for (const n of novos) DESAFIOS.push(n);
      return;
    }
    DESAFIOS.splice(i + 1, 0, ...novos);
  }

  const bucket = (c, n) => (((c.s3 || {}).buckets) || {})[n];
  const topico = (c, t) => (((c.sns || {}).topicos) || {})[t];
  const assin = (c, t) => (((((c.sns || {}).topicos) || {})[t] || {}).assinaturas) || [];
  const inst = (c, id) => (((c.ec2 || {}).instancias) || {})[String(id || "")];
  const param = (c, n) => (((c.ssm || {}).parametros) || {})[n];
  const usuario = (c, n) => (((c.iam || {}).usuarios) || {})[n];
  const grupo = (c, n) => (((c.iam || {}).grupos) || {})[n];
  const role = (c, n) => (((c.iam || {}).roles) || {})[n];
  const temPolitica = (x, trecho) => ((x || {}).politicas || []).some((p) => String(p).indexOf(trecho) >= 0);

  // ---------------- SQS ----------------
  at("psqs-cq2", [
    d("fx-sqs-ls1", "sqs", 2, 50, "Só as filas do time de entregas",
      "A conta já tem filas de pedidos, de e-mail, de entrega — e numa empresa de verdade são centenas. O time de entregas quer ver só as dele. Liste as filas cujo nome começa com <b>entregas</b>.",
      ["Listar filas você já sabe; a novidade é filtrar pelo começo do nome.", "A flag é `--queue-name-prefix`."],
      ["aws sqs list-queues --queue-name-prefix entregas"],
      (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "list-queues") && String(cmd.flags["queue-name-prefix"] || "") === "entregas"),
  ]);

  // ---------------- S3 ----------------
  at("cob-s3-1", [
    d("fx-s3-cb1", "s3", 2, 90, "Os dados dos clientes ficam no Brasil",
      "O jurídico pediu que os dados de clientes fiquem em <b>São Paulo</b> (sa-east-1). Crie pela API o bucket <b>dados-clientes-sp</b> nessa região. <small>(o <code>s3 mb</code> resolve a região sozinho; o <code>create-bucket</code> não, e é aqui que muita gente trava)</small>",
      ["Fora de us-east-1, o `create-bucket` exige que a região vá também no corpo do pedido.", "A flag é `--create-bucket-configuration`, na forma `LocationConstraint=<região>`."],
      ["aws s3api create-bucket --bucket dados-clientes-sp --create-bucket-configuration LocationConstraint=sa-east-1"],
      (c) => (bucket(c, "dados-clientes-sp") || {}).regiao === "sa-east-1"),
  ]);
  at("cob-s3-2", [
    d("fx-s3-ver1", "s3", 2, 80, "Resposta vazia também é resposta",
      "Antes de guardar arquivo importante no <b>bucket-via-api</b>, confira se ele tem versionamento. Repare no que volta quando o versionamento <b>nunca</b> foi ligado.",
      ["Mesma conferência de antes, noutro bucket.", "Nada na saída quer dizer \"nunca ligado\" — diferente de Suspended, que quer dizer \"foi ligado e depois pausado\"."],
      ["aws s3api get-bucket-versioning --bucket bucket-via-api"],
      (c, cmd, ok) => ok && ehCmd(cmd, "s3api", "get-bucket-versioning") && String(cmd.flags.bucket || "") === "bucket-via-api"),
  ]);

  // ---------------- SNS ----------------
  at("psns-ct2", [
    d("fx-sns-ls1", "sns", 2, 50, "O alarme pede o ARN, não o nome",
      "Você vai ligar um alarme no tópico <b>alertas-servidor</b>, e o alarme não aceita nome: ele quer o <b>ARN</b>. Liste os tópicos da conta e ache o ARN dele.",
      ["Os tópicos só aparecem como ARN na listagem — o nome é o último pedaço dele.", "Mesmo comando do começo da trilha."],
      ["aws sns list-topics"],
      (c, cmd, ok) => ok && ehCmd(cmd, "sns", "list-topics") && !!topico(c, "alertas-servidor")),
  ]);
  at("cob-sns-1", [
    d("fx-sns-uns1", "sns", 3, 100, "O cliente pediu pra parar de receber SMS",
      "O cliente do número <b>+5511999990000</b> pediu pra não receber mais SMS de entrega — e isso é direito dele. Cancele a inscrição por SMS no tópico <b>avisos-entrega</b>.",
      ["Cancelar pede o ARN da INSCRIÇÃO, não o do tópico.", "Liste as inscrições do tópico pra achar o ARN da que tem protocolo sms."],
      ["aws sns list-subscriptions-by-topic --topic-arn arn:aws:sns:us-east-1:123456789012:avisos-entrega",
        "aws sns unsubscribe --subscription-arn <sub-sms>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "sns", "unsubscribe") && !!topico(c, "avisos-entrega") &&
        !assin(c, "avisos-entrega").some((a) => a.protocolo === "sms")),
  ]);

  // ---------------- EC2 ----------------
  at("ec2-9", [
    d("fx-ec2-term1", "ec2", 3, 80, "A máquina do teste de ontem ainda está ligada",
      "Você subiu uma <b>t3.micro</b> pra testar um script e ela ficou esquecida — encerrada ela para de cobrar, parada ela ainda cobra o disco. Suba essa máquina de teste e depois <b>encerre</b> ela.",
      ["Subir você já sabe; encerrar é o comando da atividade anterior.", "O id da máquina volta na resposta do `run-instances`."],
      ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.micro",
        "aws ec2 terminate-instances --instance-ids <id-da-instância>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "terminate-instances") &&
        /termin|shutting/.test(String((inst(c, cmd.flags["instance-ids"]) || {}).estado || ""))),
  ]);

  // ---------------- Auto Scaling (o launch template do ec2) ----------------
  at("asg-3", [
    d("fx-asg-lt1", "autoscaling", 2, 60, "Qual receita o grupo está usando?",
      "O grupo elástico subiu máquinas e alguém perguntou de que tipo elas são. Olhe só o launch template <b>modelo-web</b>, em vez da lista inteira.",
      ["O comando que lista os modelos aceita os nomes que você quer ver.", "A flag é `--launch-template-names` — e nome que não existe dá erro, não lista vazia."],
      ["aws ec2 describe-launch-templates --launch-template-names modelo-web"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-launch-templates") && /modelo-web/.test(String(cmd.flags["launch-template-names"] || ""))),
  ]);

  // ---------------- SSM ----------------
  at("ssm-5", [
    d("fx-ssm-dp1", "ssm", 3, 80, "Quais configurações são secretas?",
      "A auditoria quer a lista de tudo que está cifrado no Parameter Store — só os nomes, sem os valores. Liste os parâmetros filtrando pelo tipo <b>SecureString</b>.",
      ["O `describe-parameters` lista sem mostrar valor — perfeito pra auditoria.", "O filtro vai em `--parameter-filters`, na forma `Key=Type,Values=SecureString`."],
      ["aws ssm describe-parameters --parameter-filters Key=Type,Values=SecureString"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ssm", "describe-parameters") && /SecureString/.test(String(cmd.flags["parameter-filters"] || ""))),
  ]);
  at("ssm-6", [
    d("fx-ssm-path1", "ssm", 3, 100, "A config do pagamento ficou de fora",
      "O time guardou a config do gateway em <b>/loja/pagamento/gateway</b>, um nível abaixo. Crie esse parâmetro com o valor <b>pagseguro</b> e puxe a árvore <b>/loja</b> inteira — repare que, sem pedir, o nível de baixo não vem.",
      ["O `put-parameter` você já conhece.", "O `get-parameters-by-path` só desce um nível; pra descer tudo, a flag é `--recursive`."],
      ["aws ssm put-parameter --name /loja/pagamento/gateway --value pagseguro --type String",
        "aws ssm get-parameters-by-path --path /loja --recursive"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ssm", "get-parameters-by-path") && cmd.flags.recursive !== undefined && !!param(c, "/loja/pagamento/gateway")),
  ]);
  at("cob-ssm-1", [
    d("fx-ssm-del1", "ssm", 2, 80, "A promoção de Natal acabou",
      "A loja liga e desliga a promoção pelo parâmetro <b>/loja/feature-natal</b>. Crie ele com o valor <b>ligado</b> pra ver como é, e depois apague: a campanha acabou e parâmetro esquecido vira dúvida pra quem chega depois.",
      ["Criar é o `put-parameter`; apagar é o comando da atividade anterior."],
      ["aws ssm put-parameter --name /loja/feature-natal --value ligado --type String",
        "aws ssm delete-parameter --name /loja/feature-natal"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ssm", "delete-parameter") && String(cmd.flags.name || "") === "/loja/feature-natal" && !param(c, "/loja/feature-natal")),
  ]);

  // ---------------- IAM ----------------
  at("cob-iam-1", [
    d("fx-iam-grp1", "iam", 2, 70, "A Ana ainda está no grupo dos devs?",
      "A Ana mudou de time e o gestor quer ter certeza de quem ainda herda as permissões dos devs. Veja os membros do grupo <b>devs</b>.",
      ["Mesmo comando que mostrou o grupo analistas.", "A lista de membros vem no campo Users."],
      ["aws iam get-group --group-name devs"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "get-group") && String(cmd.flags["group-name"] || "") === "devs"),
    d("fx-iam-aup1", "iam", 2, 80, "Uma permissão só pro Pedro",
      "Só o Pedro precisa ler os logs do CloudWatch nesta semana, pra investigar um bug — o resto do time não. Anexe a política <b>CloudWatchLogsReadOnlyAccess</b> direto no usuário <b>pedro</b>.",
      ["Até aqui você anexou política em grupo e em role; o `attach-` também existe pra usuário.", "O ARN da política gerenciada é `arn:aws:iam::aws:policy/CloudWatchLogsReadOnlyAccess`."],
      ["aws iam attach-user-policy --user-name pedro --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsReadOnlyAccess"],
      (c) => temPolitica(usuario(c, "pedro"), "CloudWatchLogsReadOnlyAccess")),
  ]);
  at("cob-iam-2", [
    d("fx-iam-lau1", "iam", 3, 80, "O que o Pedro recebeu direto?",
      "Uma semana depois, a auditoria pergunta o que o <b>pedro</b> tem anexado direto nele. Liste as políticas anexadas ao usuário.",
      ["Mesma pergunta que você fez pra auditoria-tmp.", "Lembre: o que vem pelo grupo não aparece aqui."],
      ["aws iam list-attached-user-policies --user-name pedro"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "list-attached-user-policies") && String(cmd.flags["user-name"] || "") === "pedro"),
  ]);
  at("iamc-ver1b", [
    d("fx-iam-lpv1", "iam", 3, 80, "Qual versão está valendo agora?",
      "Depois do rollback, confirme na <b>acesso-s3</b> qual versão está marcada como padrão — e repare que a v2 continua lá, guardada.",
      ["O histórico de versões de uma política tem um `list-` próprio.", "Procure o campo IsDefaultVersion."],
      ["aws iam list-policy-versions --policy-arn arn:aws:iam::123456789012:policy/acesso-s3"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "list-policy-versions") && /acesso-s3/.test(String(cmd.flags["policy-arn"] || ""))),
  ]);
  at("cob-iam-4", [
    d("fx-iam-dgp1", "iam", 3, 90, "Os devs não precisam mais ler o S3 inteiro",
      "Os devs agora leem só o bucket do projeto, por outra política. A leitura do S3 inteiro virou risco: desanexe a <b>AmazonS3ReadOnlyAccess</b> do grupo <b>devs</b>.",
      ["Mesmo comando que você usou no grupo analistas.", "Todo mundo do grupo perde a permissão ao mesmo tempo."],
      ["aws iam detach-group-policy --group-name devs --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "detach-group-policy") && !!grupo(c, "devs") && !temPolitica(grupo(c, "devs"), "AmazonS3ReadOnlyAccess")),
  ]);
  at("cob-iam-5", [
    d("fx-iam-drp1", "iam", 3, 110, "A consultoria de auditoria terminou",
      "Uma consultoria externa usou a role <b>consultoria-auditoria</b> por um mês, com a política <b>SecurityAudit</b>. O contrato acabou. Crie a role (com o <b>trust.json</b>), anexe a política pra ver o cenário completo e depois <b>desanexe</b>.",
      ["Criar role e anexar política você já fez.", "No fim, o mesmo `detach-role-policy` da atividade anterior. O ARN é `arn:aws:iam::aws:policy/SecurityAudit`."],
      ["aws iam create-role --role-name consultoria-auditoria --assume-role-policy-document file://trust.json",
        "aws iam attach-role-policy --role-name consultoria-auditoria --policy-arn arn:aws:iam::aws:policy/SecurityAudit",
        "aws iam detach-role-policy --role-name consultoria-auditoria --policy-arn arn:aws:iam::aws:policy/SecurityAudit"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "detach-role-policy") && !!role(c, "consultoria-auditoria") && !temPolitica(role(c, "consultoria-auditoria"), "SecurityAudit")),
  ]);

  // ============================================================
  // Leva 2 (25/09): containers, CloudWatch e Auto Scaling
  // ============================================================

  // Tira atividades do lugar e põe depois de outra. Usado pra levar a LIMPEZA
  // (delete-*) pro fim da trilha, onde ela pertence: no ECS e no Auto Scaling
  // a faxina estava no meio e todo o resto vinha depois dela.
  function mover(ids, depoisDe) {
    const tirados = [];
    for (const id of ids) {
      const i = DESAFIOS.findIndex((x) => x.id === id);
      if (i < 0) { ((typeof globalThis !== "undefined" ? globalThis : window).__ancorasPerdidas = (globalThis.__ancorasPerdidas || [])).push(id); continue; }
      tirados.push(DESAFIOS.splice(i, 1)[0]);
    }
    const j = DESAFIOS.findIndex((x) => x.id === depoisDe);
    if (j < 0) { (globalThis.__ancorasPerdidas = globalThis.__ancorasPerdidas || []).push(depoisDe); DESAFIOS.push(...tirados); return; }
    DESAFIOS.splice(j + 1, 0, ...tirados);
  }

  const cw = (c) => c.cloudwatch || {};
  const alarme = (c, n) => (cw(c).alarmes || {})[n];
  const painel = (c, n) => (cw(c).paineis || {})[n];
  const grupoLog = (c, n) => (((c.logs || {}).grupos) || {})[n];
  const asg = (c, n) => (((c.autoscaling || {}).grupos) || {})[n];
  const politicaAsg = (c, g, p) => (((asg(c, g) || {}).politicas) || {})[p];
  const ecsCluster = (c, n) => (((c.ecs || {}).clusters) || {})[n];
  const ecsServico = (c, cl, n) => Object.values(((c.ecs || {}).servicos) || {}).find((s) => s.cluster === cl && (s.nome === n || s.name === n));
  const ecrRepo = (c, n) => (((c.ecr || {}).repositorios) || {})[n];
  const eksCluster = (c, n) => (((c.eks || {}).clusters) || {})[n];
  const eksNg = (c, cl, n) => Object.values(((c.eks || {}).nodegroups) || {}).find((x) => x.cluster === cl && x.nome === n);

  // ---------------- ECS ----------------
  // Ordem nova: observar e criar → usar → a leva ctn (tarefa avulsa) → limpar.
  mover(["cob-ecs-1"], "ecs-3");
  mover(["cob-ecs-2"], "ecs-6");
  mover(["ecs-7", "ecs-8"], "ctn-cl2");
  at("cob-ecs-1", [
    d("fx-ecs-ltd1", "ecs", 2, 70, "Só as receitas da loja",
      "A conta tem receitas de vários times e a lista não cabe na tela. Liste só as task definitions cuja família começa com <b>tarefa</b>.",
      ["A mesma listagem de receitas, com um filtro pelo começo do nome.", "A flag é `--family-prefix`."],
      ["aws ecs list-task-definitions --family-prefix tarefa"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "list-task-definitions") && String(cmd.flags["family-prefix"] || "") === "tarefa"),
  ]);
  at("ecs-6", [
    d("fx-ecs-ds1", "ecs", 3, 80, "As cinco cópias subiram mesmo?",
      "Você pediu 5 cópias do <b>servico-web</b>. Pedir não é ter: descreva o serviço de novo e compare o <code>desiredCount</code> com o <code>runningCount</code>.",
      ["Mesmo comando que conferiu o serviço antes.", "Enquanto running for menor que desired, o ECS ainda está subindo cópia (ou alguma está morrendo no caminho)."],
      ["aws ecs describe-services --cluster cluster-loja --services servico-web"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "describe-services") && /servico-web/.test(String(cmd.flags.services || ""))),
  ]);
  at("cob-ecs-2", [
    d("fx-ecs-ls1", "ecs", 3, 70, "E no cluster da loja?",
      "O cluster de suporte está vazio. Agora liste os serviços do <b>cluster-loja</b> — é ali que o servico-web está no ar.",
      ["Mesmo comando, outro `--cluster`.", "Sem o `--cluster`, a AWS olha o cluster chamado default."],
      ["aws ecs list-services --cluster cluster-loja"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "list-services") && String(cmd.flags.cluster || "") === "cluster-loja"),
    d("fx-ecs-lc1", "ecs", 3, 70, "Quantos clusters a conta tem agora?",
      "Você criou o cluster-loja e o cluster-suporte. Liste os clusters da conta e pegue o ARN do <b>cluster-suporte</b> — é ele que vai na política de acesso do time de suporte.",
      ["Mesmo comando do começo da trilha.", "O nome do cluster é o último pedaço do ARN."],
      ["aws ecs list-clusters"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "list-clusters") && !!ecsCluster(c, "cluster-suporte")),
  ]);
  at("ecs-7", [
    d("fx-ecs-dsv1", "ecs", 3, 100, "O painel de teste no cluster de suporte",
      "Alguém subiu o serviço <b>painel-suporte</b> no <b>cluster-suporte</b> pra testar e esqueceu lá. Crie ele (1 cópia da tarefa-web) pra ver o cenário e apague — desta vez <b>sem zerar antes</b>.",
      ["Criar serviço você já sabe.", "O `delete-service` tem um atalho que para as cópias e apaga de uma vez: `--force`."],
      ["aws ecs create-service --cluster cluster-suporte --service-name painel-suporte --task-definition tarefa-web --desired-count 1",
        "aws ecs delete-service --cluster cluster-suporte --service painel-suporte --force"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "delete-service") && cmd.flags.force !== undefined && !ecsServico(c, "cluster-suporte", "painel-suporte")),
  ]);
  at("ecs-8", [
    d("fx-ecs-dc1", "ecs", 3, 90, "Feche também o cluster da migração",
      "As tarefas do <b>producao-app</b> já pararam e as receitas estão inativas. Apague o cluster. <small>(com tarefa rodando a AWS recusaria — por isso a ordem foi parar, depois apagar)</small>",
      ["Mesmo comando que fechou o cluster-loja."],
      ["aws ecs delete-cluster --cluster producao-app"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecs", "delete-cluster") && String(cmd.flags.cluster || "") === "producao-app" && !ecsCluster(c, "producao-app")),
  ]);

  // ---------------- ECR ----------------
  at("ecr-6", [
    d("fx-ecr-dr1", "ecr", 2, 60, "Qual é o endereço do repositório do checkout?",
      "O time de pagamentos precisa da <b>URI</b> do repositório pra configurar o build. Mostre só o <b>pagamentos/checkout-api</b>, sem listar o resto.",
      ["A listagem de repositórios aceita os nomes que você quer ver.", "A flag é `--repository-names`, e a URI vem no campo repositoryUri."],
      ["aws ecr describe-repositories --repository-names pagamentos/checkout-api"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "describe-repositories") && /checkout-api/.test(String(cmd.flags["repository-names"] || ""))),
  ]);
  at("ecr-3", [
    d("fx-ecr-lp1", "ecr", 2, 60, "O registro de São Paulo tem outra senha",
      "Cada região tem o seu registro, e a senha de um não entra no outro. Peça a senha de login do registro em <b>sa-east-1</b>.",
      ["Mesmo comando de antes, apontando pra outra região.", "A região vai em `--region`."],
      ["aws ecr get-login-password --region sa-east-1"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "get-login-password") && String(cmd.flags.region || "") === "sa-east-1"),
  ]);
  at("ecr-4", [
    d("fx-ecr-li1", "ecr", 2, 70, "Tem imagem sem nome aí?",
      "Imagem sem tag ninguém consegue puxar pelo nome, mas ela continua ocupando espaço — e você paga. Liste só as imagens <b>sem tag</b> do <b>pagamentos/checkout-api</b>.",
      ["Mesmo comando de listar imagens, com um filtro.", "A forma é `--filter tagStatus=UNTAGGED`: o que volta tem digest e não tem imageTag."],
      ["aws ecr list-images --repository-name pagamentos/checkout-api --filter tagStatus=UNTAGGED"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "list-images") && /UNTAGGED/.test(String(cmd.flags.filter || ""))),
  ]);
  at("ecr-15", [
    d("fx-ecr-mut1", "ecr", 3, 90, "O mesmo acidente não vai acontecer na loja",
      "Não espere a órfã aparecer no <b>loja-imagens</b> também: trave as tags dele pra que ninguém publique por cima de uma versão existente.",
      ["Mesmo comando que travou o checkout.", "O valor que trava é `IMMUTABLE`."],
      ["aws ecr put-image-tag-mutability --repository-name loja-imagens --image-tag-mutability IMMUTABLE"],
      (c) => (ecrRepo(c, "loja-imagens") || {}).tagMutability === "IMMUTABLE"),
  ]);
  at("ecr-5", [
    d("fx-ecr-del1", "ecr", 3, 90, "O repositório do site antigo",
      "O site antigo saiu do ar faz um ano e o repositório <b>site-antigo</b> ficou lá, pagando. Crie ele pra ver o cenário e apague — já sabendo que ele vem com imagem dentro.",
      ["Criar repositório você já sabe.", "Com imagem dentro, só apaga com `--force`."],
      ["aws ecr create-repository --repository-name site-antigo",
        "aws ecr delete-repository --repository-name site-antigo --force"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ecr", "delete-repository") && String(cmd.flags["repository-name"] || "") === "site-antigo" && !ecrRepo(c, "site-antigo")),
  ]);

  // ---------------- EKS ----------------
  at("eks-3", [
    d("fx-eks-lc1", "eks", 2, 60, "O cluster novo já aparece?",
      "Um colega jura que não vê o <b>cluster-k8s</b>. Liste os clusters da conta e confirme — se não aparecer pra ele, o problema é região ou permissão, não o cluster.",
      ["Mesmo comando do começo da trilha."],
      ["aws eks list-clusters"],
      (c, cmd, ok) => ok && ehCmd(cmd, "eks", "list-clusters") && !!eksCluster(c, "cluster-k8s")),
  ]);
  at("eks-4", [
    d("fx-eks-kc1", "eks", 3, 80, "Um nome curto pro contexto",
      "Com vários clusters, o contexto do kubectl vira um ARN enorme e alguém roda comando no cluster errado. Atualize o kubeconfig do <b>cluster-k8s</b> dando a ele o apelido <b>producao</b>.",
      ["Mesmo comando que ligou o kubectl ao cluster.", "O apelido vai em `--alias`."],
      ["aws eks update-kubeconfig --name cluster-k8s --alias producao"],
      (c, cmd, ok) => ok && ehCmd(cmd, "eks", "update-kubeconfig") && String(cmd.flags.alias || "") === "producao"),
  ]);
  at("ctn-eks8", [
    d("fx-eks-dc1", "eks", 3, 80, "Em que versão ele está agora?",
      "Depois de dois degraus de upgrade, confirme a versão do <b>cluster-k8s</b> sem ler a resposta inteira: peça só o campo da versão.",
      ["O `describe-cluster` traz tudo; o `--query` recorta.", "O campo é `cluster.version`."],
      ["aws eks describe-cluster --name cluster-k8s --query cluster.version"],
      (c, cmd, ok) => ok && ehCmd(cmd, "eks", "describe-cluster") && /version/.test(String(cmd.flags.query || ""))),
  ]);
  at("ctn-eks12", [
    d("fx-eks-dng1", "eks", 3, 110, "O lote de fim de mês acabou",
      "Para o processamento de fim de mês, o time criou o grupo de nós <b>nos-batch</b> no <b>cluster-k8s</b>. Crie ele pra ver o cenário e apague: máquina parada no nodegroup é cobrada igual.",
      ["Criar nodegroup você já fez (mesma role e sub-redes do nos-app).", "Apagar é o `delete-nodegroup`, com o cluster e o nome do grupo."],
      ["aws eks create-nodegroup --cluster-name cluster-k8s --nodegroup-name nos-batch --node-role arn:aws:iam::123456789012:role/papel-nos --subnets subnet-aaa1 subnet-bbb2",
        "aws eks delete-nodegroup --cluster-name cluster-k8s --nodegroup-name nos-batch"],
      (c, cmd, ok) => ok && ehCmd(cmd, "eks", "delete-nodegroup") && !!eksCluster(c, "cluster-k8s") && !eksNg(c, "cluster-k8s", "nos-batch")),
    d("fx-eks-lng1", "eks", 3, 70, "Sobrou só o grupo da aplicação?",
      "Confirme que o <b>nos-batch</b> saiu e que o <b>nos-app</b> continua: liste os nodegroups do <b>cluster-k8s</b>.",
      ["Mesmo comando que conferiu os nós lá atrás."],
      ["aws eks list-nodegroups --cluster-name cluster-k8s"],
      (c, cmd, ok) => ok && ehCmd(cmd, "eks", "list-nodegroups") && !eksNg(c, "cluster-k8s", "nos-batch")),
  ]);
  at("eks-7", [
    d("fx-eks-dcl1", "eks", 3, 110, "O cluster de testes da sexta",
      "Alguém subiu o <b>cluster-sandbox</b> pra testar um chart e ele ficou ligado o fim de semana — só o control plane já é cobrado por hora. Crie ele pra ver o cenário (mesma role e sub-redes do cluster-k8s) e apague.",
      ["Criar cluster você já sabe.", "Sem nodegroup, o `delete-cluster` vai direto."],
      ["aws eks create-cluster --name cluster-sandbox --role-arn arn:aws:iam::123456789012:role/papel-eks --resources-vpc-config subnetIds=subnet-aaa1,subnet-bbb2",
        "aws eks delete-cluster --name cluster-sandbox"],
      (c, cmd, ok) => ok && ehCmd(cmd, "eks", "delete-cluster") && String(cmd.flags.name || "") === "cluster-sandbox" && !eksCluster(c, "cluster-sandbox")),
  ]);

  // ---------------- Auto Scaling ----------------
  mover(["cob-asg-1"], "asg-3");
  at("asg-4", [
    d("fx-asg-dg1", "autoscaling", 2, 70, "Quatro máquinas, confirme",
      "Você pediu 4. Confira no próprio grupo: descreva só o <b>grupo-web</b> e conte as instâncias em <code>InService</code>.",
      ["Mesmo comando que mostrou o grupo antes, filtrando pelo nome.", "A flag é `--auto-scaling-group-names`."],
      ["aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names grupo-web"],
      (c, cmd, ok) => ok && ehCmd(cmd, "autoscaling", "describe-auto-scaling-groups") && /grupo-web/.test(String(cmd.flags["auto-scaling-group-names"] || ""))),
  ]);
  at("asg-6", [
    d("fx-asg-pol1", "autoscaling", 3, 100, "Escalar pelo que o cliente sente",
      "CPU nem sempre é o gargalo: a API pode estar lenta com a CPU tranquila. Crie no <b>grupo-web</b> uma segunda política, <b>requisicoes-alvo</b>, também do tipo <b>TargetTrackingScaling</b>, pra escalar pelo número de requisições por máquina.",
      ["Mesmo comando da política de CPU, com outro nome.", "Um grupo pode ter várias políticas: vale a que pedir MAIS máquinas."],
      ["aws autoscaling put-scaling-policy --auto-scaling-group-name grupo-web --policy-name requisicoes-alvo --policy-type TargetTrackingScaling"],
      (c) => !!politicaAsg(c, "grupo-web", "requisicoes-alvo")),
    d("fx-asg-upd1", "autoscaling", 3, 90, "Um teto pro piloto automático",
      "Com duas políticas subindo máquina sozinhas, o financeiro quer um teto. Mude o máximo do <b>grupo-web</b> pra <b>6</b> — a política nunca passa do <code>max-size</code>.",
      ["Mudar os limites do grupo é o `update-auto-scaling-group`.", "Só a flag que muda: `--max-size`."],
      ["aws autoscaling update-auto-scaling-group --auto-scaling-group-name grupo-web --max-size 6"],
      (c, cmd, ok) => ok && ehCmd(cmd, "autoscaling", "update-auto-scaling-group") && (asg(c, "grupo-web") || {}).max === 6),
  ]);
  at("asg-7", [
    d("fx-asg-del1", "autoscaling", 3, 100, "O grupo do teste de carga",
      "O teste de carga de ontem deixou o grupo <b>grupo-teste-carga</b> (modelo-web, 1 máquina) de pé. Crie ele pra ver o cenário e apague sem zerar antes — o atalho existe.",
      ["Criar o grupo você já sabe (min 1, max 1, desejado 1, zona us-east-1a).", "Com máquina no ar, o `delete-auto-scaling-group` só vai com `--force-delete`."],
      ["aws autoscaling create-auto-scaling-group --auto-scaling-group-name grupo-teste-carga --launch-template LaunchTemplateName=modelo-web,Version=1 --min-size 1 --max-size 1 --desired-capacity 1 --availability-zones us-east-1a",
        "aws autoscaling delete-auto-scaling-group --auto-scaling-group-name grupo-teste-carga --force-delete"],
      (c, cmd, ok) => ok && ehCmd(cmd, "autoscaling", "delete-auto-scaling-group") && cmd.flags["force-delete"] !== undefined && !asg(c, "grupo-teste-carga")),
  ]);

  // ---------------- CloudWatch (alarmes, painéis, logs) ----------------
  at("cw-3", [
    d("fx-cw-da1", "cloudwatch", 2, 60, "Só os alarmes do plantão",
      "O plantonista cuida só do disco e da API. Liste apenas os alarmes <b>disco-cheio</b> e <b>latencia-api</b>, em vez da lista inteira.",
      ["A listagem de alarmes aceita nomes.", "A flag é `--alarm-names`, com os nomes separados por espaço."],
      ["aws cloudwatch describe-alarms --alarm-names disco-cheio latencia-api"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudwatch", "describe-alarms") && cmd.flags["alarm-names"] !== undefined),
  ]);
  at("cw-6", [
    d("fx-cw-del1", "cloudwatch", 2, 70, "Dois alarmes de teste de uma vez",
      "Você testou os alarmes <b>teste-cpu-a</b> e <b>teste-cpu-b</b> (CPUUtilization, AWS/EC2, limite 50) e agora eles só fazem barulho. Crie os dois e apague <b>os dois num comando só</b>.",
      ["Criar alarme você já sabe.", "O `--alarm-names` aceita vários nomes separados por espaço."],
      ["aws cloudwatch put-metric-alarm --alarm-name teste-cpu-a --metric-name CPUUtilization --namespace AWS/EC2 --threshold 50 --comparison-operator GreaterThanThreshold",
        "aws cloudwatch put-metric-alarm --alarm-name teste-cpu-b --metric-name CPUUtilization --namespace AWS/EC2 --threshold 50 --comparison-operator GreaterThanThreshold",
        "aws cloudwatch delete-alarms --alarm-names teste-cpu-a teste-cpu-b"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudwatch", "delete-alarms") && !alarme(c, "teste-cpu-a") && !alarme(c, "teste-cpu-b")),
  ]);
  at("cw-7", [
    d("fx-cw-dlg1", "cloudwatch", 1, 50, "Só os logs da aplicação",
      "A conta tem grupos de log de nginx, de API, de Lambda. Liste só os que começam com <b>/app</b>.",
      ["A mesma listagem de grupos, com um filtro pelo começo do nome.", "A flag é `--log-group-name-prefix`."],
      ["aws logs describe-log-groups --log-group-name-prefix /app"],
      (c, cmd, ok) => ok && ehCmd(cmd, "logs", "describe-log-groups") && String(cmd.flags["log-group-name-prefix"] || "") === "/app"),
  ]);
  at("cw-9", [
    d("fx-cw-dlg2", "cloudwatch", 2, 60, "A homologação foi desligada",
      "O ambiente de homologação foi desligado de vez, mas o grupo <b>/homolog/api</b> continua guardando log (e cobrando). Crie ele pra ver o cenário e apague.",
      ["Criar e apagar grupo você fez na atividade anterior."],
      ["aws logs create-log-group --log-group-name /homolog/api",
        "aws logs delete-log-group --log-group-name /homolog/api"],
      (c, cmd, ok) => ok && ehCmd(cmd, "logs", "delete-log-group") && String(cmd.flags["log-group-name"] || "") === "/homolog/api" && !grupoLog(c, "/homolog/api")),
  ]);
  at("cw-13", [
    d("fx-cw-gms1", "cloudwatch", 3, 110, "A média, não a soma",
      "O gerente não quer o total de pedidos: quer saber a <b>média</b> e o <b>pico</b> por janela de 5 minutos. Consulte a PedidosPorMinuto pedindo <b>Average</b> e <b>Maximum</b>, com período de <b>300</b> segundos, no mesmo intervalo de antes.",
      ["Mesmo comando, outras estatísticas.", "O `--statistics` aceita várias, separadas por espaço; o `--period` é em segundos."],
      ["aws cloudwatch get-metric-statistics --namespace Loja/Pedidos --metric-name PedidosPorMinuto --start-time 2026-07-29T00:00:00Z --end-time 2026-07-30T00:00:00Z --period 300 --statistics Average Maximum"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudwatch", "get-metric-statistics") && /Average/.test(String(cmd.flags.statistics || "")) && String(cmd.flags.period || "") === "300"),
  ]);
  at("cw-18", [
    d("fx-cw-gd1", "cloudwatch", 3, 100, "O painel do plantão noturno",
      "O plantão quer um painel próprio. Crie o <b>plantao-noturno</b> com um widget de texto (<code>{\"widgets\":[{\"type\":\"text\",\"properties\":{\"markdown\":\"Plantao\"}}]}</code>) e depois busque ele pra conferir o que ficou gravado.",
      ["Criar painel é o `put-dashboard` que você já usou.", "Buscar é o comando da atividade anterior."],
      ["aws cloudwatch put-dashboard --dashboard-name plantao-noturno --dashboard-body '{\"widgets\":[{\"type\":\"text\",\"properties\":{\"markdown\":\"Plantao\"}}]}'",
        "aws cloudwatch get-dashboard --dashboard-name plantao-noturno"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudwatch", "get-dashboard") && String(cmd.flags["dashboard-name"] || "") === "plantao-noturno"),
    d("fx-cw-ld1", "cloudwatch", 3, 70, "Só os painéis do plantão",
      "Com vários painéis na conta, liste só os que começam com <b>plantao</b>.",
      ["A listagem de painéis aceita um prefixo.", "A flag é `--dashboard-name-prefix`."],
      ["aws cloudwatch list-dashboards --dashboard-name-prefix plantao"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudwatch", "list-dashboards") && String(cmd.flags["dashboard-name-prefix"] || "") === "plantao"),
  ]);
  at("cw-19", [
    d("fx-cw-dd1", "cloudwatch", 3, 80, "O plantão passou pra outra ferramenta",
      "O time de plantão migrou pra outra ferramenta de monitoração. Apague o painel <b>plantao-noturno</b> — acima de 3 painéis, cada um é cobrado todo mês.",
      ["Mesmo comando que desmontou a vitrine."],
      ["aws cloudwatch delete-dashboards --dashboard-names plantao-noturno"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudwatch", "delete-dashboards") && !painel(c, "plantao-noturno")),
  ]);
  at("cw-20", [
    d("fx-cw-fle1", "cloudwatch", 2, 90, "O deploy terminou mesmo?",
      "O pipeline diz que o deploy acabou, mas você quer ver no log. Procure a linha <b>deploy-concluido</b> no grupo <b>/frota/web</b>.",
      ["Mesmo comando de busca simples, outro grupo e outro padrão."],
      ["aws logs filter-log-events --log-group-name /frota/web --filter-pattern deploy-concluido"],
      (c, cmd, ok) => ok && ehCmd(cmd, "logs", "filter-log-events") && String(cmd.flags["log-group-name"] || "") === "/frota/web"),
  ]);
  at("cw-23", [
    d("fx-cw-gqr1", "cloudwatch", 3, 100, "Cadê os erros que você pediu?",
      "A consulta dos erros foi disparada, mas o <code>start-query</code> só devolve um id. Busque o resultado dela.",
      ["É o mesmo passo da primeira consulta: toda consulta do Insights é assíncrona.", "O id veio na resposta do start-query."],
      ["aws logs get-query-results --query-id <consulta-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "logs", "get-query-results")),
  ]);
  at("cob-logs-1", [
    d("fx-cw-sq1", "cloudwatch", 3, 100, "A consulta de um ano inteiro",
      "Alguém disparou uma consulta no <b>/api/erros</b> pegando o histórico todo, e ela vai escanear (e cobrar) gigabytes. Inicie essa consulta e interrompa antes que termine.",
      ["Iniciar você já sabe: `fields @message` e o intervalo inteiro (0 a 9999999999).", "Interromper é o comando da atividade anterior, com o id que voltou."],
      ["aws logs start-query --log-group-name /api/erros --start-time 0 --end-time 9999999999 --query-string 'fields @message'",
        "aws logs stop-query --query-id <consulta-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "logs", "stop-query")),
  ]);
})();
