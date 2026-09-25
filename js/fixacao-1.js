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

  // ============================================================
  // Leva 3 (25/09): Lambda, DynamoDB e RDS
  // ============================================================
  const fn = (c, n) => (((c.lambda || {}).funcoes) || {})[n];
  const aliasDe = (c, f, a) => (((fn(c, f) || {}).aliases) || {})[a];
  const tabela = (c, n) => (((c.dynamodb || {}).tabelas) || {})[n];
  const itemDe = (c, t, campo, valor) => ((tabela(c, t) || {}).itens || []).find((i) => cru(i[campo]) === valor);
  const itemPedido = (c, cli, data) => ((tabela(c, "PedidosCliente") || {}).itens || []).find((i) => cru(i.cliente) === cli && cru(i.data) === data);
  const cru = (v) => (v && typeof v === "object" ? Object.values(v)[0] : v);
  const banco = (c, n) => (((c.rds || {}).instancias) || {})[n];

  // ---------------- Lambda ----------------
  at("lambda-9", [
    d("fx-lam-gf1", "lambda", 2, 60, "Em que runtime o webhook roda?",
      "O Node 20 vai sair de suporte e o time quer saber quais funções são afetadas. Veja a configuração da <b>webhook-pagamento</b>, mas traga só o <b>runtime</b>.",
      ["O `get-function` traz a configuração e o código; o `--query` recorta.", "O campo é `Configuration.Runtime`."],
      ["aws lambda get-function --function-name webhook-pagamento --query Configuration.Runtime"],
      (c, cmd, ok) => ok && ehCmd(cmd, "lambda", "get-function") && String(cmd.flags["function-name"] || "") === "webhook-pagamento"),
  ]);
  at("lamp-1", [
    d("fx-lam-code1", "lambda", 2, 80, "A miniatura saiu borrada",
      "O time corrigiu a qualidade das miniaturas e mandou um <b>app.zip</b> novo. Faça o deploy na <b>resize-imagens</b>.",
      ["Mesmo comando de deploy, outra função."],
      ["aws lambda update-function-code --function-name resize-imagens --zip-file fileb://app.zip"],
      (c) => !!(fn(c, "resize-imagens") || {}).versaoCodigo),
  ]);
  at("lamp-2", [
    d("fx-lam-pub1", "lambda", 3, 110, "A correção do frete vira a versão 2",
      "O cálculo de frete estava errado. Faça o <b>deploy</b> do código corrigido na <b>processa-pedido</b> e <b>congele</b> uma versão nova com a descrição <b>correcao-frete</b>. <small>(publicar sem deploy no meio devolve a MESMA versão: não há o que congelar)</small>",
      ["Primeiro o `update-function-code`, depois o `publish-version`.", "A descrição vai em `--description` — é ela que diz, meses depois, o que mudou naquela versão."],
      ["aws lambda update-function-code --function-name processa-pedido --zip-file fileb://app.zip",
        "aws lambda publish-version --function-name processa-pedido --description correcao-frete"],
      (c) => ((fn(c, "processa-pedido") || {}).versoes || []).length >= 2),
  ]);
  at("lamp-3", [
    d("fx-lam-al1", "lambda", 3, 100, "Homologação sempre no código mais novo",
      "O time de QA quer testar sempre o último deploy, sem esperar versão. Crie o alias <b>homolog</b> da <b>processa-pedido</b> apontando pro <b>$LATEST</b>.",
      ["Mesmo comando do alias prod.", "O $LATEST é um valor válido de `--function-version` — ele acompanha cada deploy."],
      ["aws lambda create-alias --function-name processa-pedido --name homolog --function-version $LATEST"],
      (c) => !!aliasDe(c, "processa-pedido", "homolog")),
  ]);
  at("lamp-4", [
    d("fx-lam-perm1", "lambda", 3, 110, "A API também chama o processamento",
      "O app mobile vai criar pedido por uma API, e o <b>API Gateway</b> precisa invocar a <b>processa-pedido</b>. Dê a permissão com o id <b>api-invoca</b> pro <b>apigateway.amazonaws.com</b>.",
      ["Mesmo comando da permissão do S3.", "Cada permissão precisa de um `--statement-id` diferente."],
      ["aws lambda add-permission --function-name processa-pedido --statement-id api-invoca --action lambda:InvokeFunction --principal apigateway.amazonaws.com"],
      (c) => ((fn(c, "processa-pedido") || {}).permissoes || []).some((p) => /apigateway/.test(p.principal))),
  ]);
  at("cob-lam-1", [
    d("fx-lam-lv1", "lambda", 2, 70, "O webhook nunca foi versionado",
      "Antes de mexer no webhook, veja se dá pra voltar atrás: liste as versões da <b>webhook-pagamento</b>. <small>(se só vier o $LATEST, não há rollback possível — é hora de publicar uma)</small>",
      ["Mesmo comando, outra função."],
      ["aws lambda list-versions-by-function --function-name webhook-pagamento"],
      (c, cmd, ok) => ok && ehCmd(cmd, "lambda", "list-versions-by-function") && String(cmd.flags["function-name"] || "") === "webhook-pagamento"),
  ]);
  at("cob-lam-2", [
    d("fx-lam-ua1", "lambda", 3, 100, "Promova a correção pra produção",
      "O $LATEST foi um remendo de emergência. O certo é produção rodar uma versão congelada: reaponte o <b>prod</b> da <b>processa-pedido</b> pra <b>versão 2</b>, a da correção do frete.",
      ["Mesmo comando do rollback, apontando pra um número.", "Versão que não existe dá erro — confira com o list-versions-by-function se precisar."],
      ["aws lambda update-alias --function-name processa-pedido --name prod --function-version 2"],
      (c, cmd, ok) => ok && ehCmd(cmd, "lambda", "update-alias") && (aliasDe(c, "processa-pedido", "prod") || {}).versao === "2"),
  ]);
  at("cob-lam-3", [
    d("fx-lam-gp1", "lambda", 3, 80, "O S3 e a API estão lá?",
      "Antes de ligar o app mobile, confira que a política da <b>processa-pedido</b> tem as <b>duas</b> permissões: a do S3 e a do API Gateway.",
      ["Mesmo comando da atividade anterior.", "Procure os dois Sid: s3-invoca e api-invoca."],
      ["aws lambda get-policy --function-name processa-pedido"],
      (c, cmd, ok) => ok && ehCmd(cmd, "lambda", "get-policy") && ((fn(c, "processa-pedido") || {}).permissoes || []).length >= 2),
  ]);
  at("cob-lam-4", [
    d("fx-lam-del1", "lambda", 3, 90, "A função de consulta era só um teste",
      "A função <b>consulta</b> foi criada pra testar e ninguém usa. Apague ela — função parada não custa, mas confunde quem chega depois.",
      ["O `delete-function` só pede o nome — e não tem lixeira, nem pergunta se você tem certeza."],
      ["aws lambda delete-function --function-name consulta"],
      (c, cmd, ok) => ok && ehCmd(cmd, "lambda", "delete-function") && String(cmd.flags["function-name"] || "") === "consulta" && !fn(c, "consulta")),
  ]);

  // ---------------- DynamoDB ----------------
  at("dynamodb-8", [
    d("fx-dyn-dt1", "dynamodb", 2, 60, "A tabela de clientes já está pronta?",
      "O script de carga falhou dizendo que a tabela não estava pronta. Veja só o <b>status</b> da tabela <b>clientes</b> — tabela recém-criada passa por CREATING antes de ACTIVE.",
      ["O `describe-table` traz tudo; o `--query` recorta.", "O campo é `Table.TableStatus`."],
      ["aws dynamodb describe-table --table-name clientes --query Table.TableStatus"],
      (c, cmd, ok) => ok && ehCmd(cmd, "dynamodb", "describe-table") && String(cmd.flags["table-name"] || "") === "clientes"),
  ]);
  at("dynp-5", [
    d("fx-dyn-upd1", "dynamodb", 3, 110, "O pedido foi entregue",
      "O pedido da <b>ana</b> de <b>2026-07-01</b> chegou. Acrescente nele o campo <b>situacao</b> com o valor <b>entregue</b>, sem mexer no resto. <small>(o nome em inglês, status, é palavra reservada do DynamoDB — por isso o campo aqui é situacao)</small>",
      ["Mesmo comando: o SET também CRIA o campo se ele não existir.", "Texto é tipo S: `{\":s\":{\"S\":\"entregue\"}}`."],
      ["aws dynamodb update-item --table-name PedidosCliente --key '{\"cliente\":{\"S\":\"ana\"},\"data\":{\"S\":\"2026-07-01\"}}' --update-expression \"SET situacao = :s\" --expression-attribute-values '{\":s\":{\"S\":\"entregue\"}}'"],
      (c) => cru((itemPedido(c, "ana", "2026-07-01") || {}).situacao) === "entregue"),
  ]);
  at("dynp-6", [
    d("fx-dyn-del1", "dynamodb", 3, 100, "A sessão expirou",
      "O usuário saiu e a sessão <b>sessao-expirada-01</b> precisa sumir da tabela <b>Sessoes</b>. Grave a sessão (chave <b>token</b>) pra ver o cenário e depois apague.",
      ["Gravar é o `put-item`; a chave da Sessoes é `token`, tipo S.", "Apagar é o comando da atividade anterior — aqui a chave tem uma parte só."],
      ["aws dynamodb put-item --table-name Sessoes --item '{\"token\":{\"S\":\"sessao-expirada-01\"}}'",
        "aws dynamodb delete-item --table-name Sessoes --key '{\"token\":{\"S\":\"sessao-expirada-01\"}}'"],
      (c, cmd, ok) => ok && ehCmd(cmd, "dynamodb", "delete-item") && !!tabela(c, "Sessoes") && !itemDe(c, "Sessoes", "token", "sessao-expirada-01")),
  ]);

  // ---------------- RDS ----------------
  at("rds-9", [
    d("fx-rds-start1", "rds", 2, 60, "Segunda de manhã no banco de dev",
      "O <b>banco-stop</b> ficou parado o fim de semana pra economizar. O time chegou: ligue ele de novo.",
      ["Mesmo comando da atividade anterior, outro banco."],
      ["aws rds start-db-instance --db-instance-identifier banco-stop"],
      (c, cmd, ok) => ok && ehCmd(cmd, "rds", "start-db-instance") && (banco(c, "banco-stop") || {}).status === "available"),
  ]);

  // ============================================================
  // Leva 4 (25/09): VPC (com a desmontagem que faltava), EBS e ELB
  // ============================================================
  const vpcDe = (c, cidr) => Object.values(((c.vpc || {}).vpcs) || {}).find((v) => v.cidr === cidr);
  const subnetDe = (c, cidr) => Object.values(((c.vpc || {}).subnets) || {}).find((s) => s.cidr === cidr);
  const igwsSoltos = (c) => Object.values(((c.vpc || {}).igws) || {}).filter((g) => !g.vpc);
  const volumeDe = (c, tam) => Object.values(((c.ec2 || {}).volumes) || {}).find((v) => v.tamanho === tam);
  const snapDe = (c, desc) => Object.values(((c.ec2 || {}).snapshots) || {}).find((s) => s.descricao === desc);
  const lb = (c, n) => (((c.elb || {}).lbs) || {})[n];
  const tg = (c, n) => (((c.elb || {}).tgs) || {})[n];

  // ---------------- VPC ----------------
  at("vpc-8", [
    d("fx-vpc-dv1", "vpc", 1, 50, "Qual é o id da rede de dados?",
      "Você já tem várias VPCs e precisa do id só da rede isolada de dados, a <b>10.99.0.0/16</b>. Liste as VPCs filtrando por esse bloco.",
      ["O `describe-vpcs` aceita filtro: `--filters Name=<campo>,Values=<valor>`.", "O campo do bloco de IP é `cidr-block`."],
      ["aws ec2 describe-vpcs --filters Name=cidr-block,Values=10.99.0.0/16"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-vpcs") && /10\.99\.0\.0/.test(String(cmd.flags.filters || ""))),
  ]);
  at("vpc-6", [
    d("fx-vpc-ds1", "vpc", 1, 50, "As sub-redes de uma rede só",
      "Na lista de sub-redes aparece tudo misturado. Mostre só as da rede <b>10.41.0.0/16</b> (pegue o id dela com o describe-vpcs).",
      ["Filtro de novo, agora pelo id da VPC dona da sub-rede.", "A forma é `--filters Name=vpc-id,Values=<id-da-vpc>`."],
      ["aws ec2 describe-subnets --filters Name=vpc-id,Values=<vpc-de:10.41.0.0/16>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-subnets") && /vpc-id/.test(String(cmd.flags.filters || ""))),
  ]);
  at("vpc-9", [
    d("fx-vpc-del1", "vpc", 2, 70, "A segunda rede nunca foi usada",
      "A VPC <b>172.16.0.0/16</b> foi criada \"pra depois\" e ficou vazia. Apague ela — rede vazia não custa, mas confunde quem procura onde está cada coisa.",
      ["Mesmo comando da atividade anterior; o id você acha no describe-vpcs.", "Ela sai porque está vazia: sem sub-rede e sem gateway."],
      ["aws ec2 delete-vpc --vpc-id <vpc-de:172.16.0.0/16>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-vpc") && !vpcDe(c, "172.16.0.0/16")),
  ]);
  at("cob-vpc-3", [
    d("fx-vpc-igw1", "vpc", 2, 80, "Essa rede sai pra internet?",
      "Antes de subir o servidor web na rede <b>10.20.0.0/16</b>, confirme que ela tem um internet gateway ligado. Filtre os gateways pela VPC.",
      ["O `describe-internet-gateways` também aceita `--filters`.", "O campo é `attachment.vpc-id`. Resposta vazia = nada sai dessa rede."],
      ["aws ec2 describe-internet-gateways --filters Name=attachment.vpc-id,Values=<vpc-de:10.20.0.0/16>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-internet-gateways") && /attachment\.vpc-id/.test(String(cmd.flags.filters || ""))),
  ]);
  at("cob-vpc-6", [
    d("fx-vpc-rt1", "vpc", 3, 90, "Uma tabela própria pra rede pública",
      "A rede <b>10.41.0.0/16</b> também precisa de uma tabela de rotas própria, em vez de usar a principal. Crie a tabela nessa VPC.",
      ["Mesmo comando da tabela que você criou antes, com o id da outra VPC."],
      ["aws ec2 create-route-table --vpc-id <vpc-de:10.41.0.0/16>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "create-route-table") && String(cmd.flags["vpc-id"] || "") === ((vpcDe(c, "10.41.0.0/16") || {}).id || "-")),
    d("fx-vpc-as1", "vpc", 3, 90, "Ligue a tabela na sub-rede pública",
      "Tabela criada não vale nada sem associação. Ligue a tabela nova à sub-rede <b>10.41.1.0/24</b>.",
      ["Mesmo comando da associação anterior.", "O id da sub-rede sai do describe-subnets; o da tabela, da resposta do create-route-table."],
      ["aws ec2 associate-route-table --route-table-id <rtb-novo> --subnet-id <subnet-de:10.41.1.0/24>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "associate-route-table") && String(cmd.flags["subnet-id"] || "") === ((subnetDe(c, "10.41.1.0/24") || {}).id || "-")),
    // --- desmontar uma rede: a ordem que a AWS exige ---
    d("fx-vpc-hk1", "vpc", 3, 100, "A rede do hackathon",
      "O hackathon de sexta precisa de uma rede com saída pra internet. Monte a VPC <b>10.60.0.0/16</b> com a sub-rede <b>10.60.1.0/24</b> e um internet gateway conectado.",
      ["É a rede completa que você já montou: VPC, sub-rede, gateway e a conexão.", "Os ids de cada passo vêm na resposta do passo anterior."],
      ["aws ec2 create-vpc --cidr-block 10.60.0.0/16",
        "aws ec2 create-subnet --vpc-id <vpc-id> --cidr-block 10.60.1.0/24",
        "aws ec2 create-internet-gateway",
        "aws ec2 attach-internet-gateway --internet-gateway-id <igw-id> --vpc-id <vpc-id>"],
      (c) => !!(vpcDe(c, "10.60.0.0/16") || {}).igw && !!subnetDe(c, "10.60.1.0/24")),
    d("fx-vpc-dsub1", "vpc", 3, 90, "Acabou o hackathon: comece pela sub-rede",
      "Tente apagar a VPC do hackathon e leia o erro: a AWS não apaga em cascata. O primeiro passo da desmontagem é tirar a sub-rede <b>10.60.1.0/24</b>.",
      ["O `delete-vpc` vai responder DependencyViolation — e dizer o que está pendurado.", "Apagar sub-rede é o `delete-subnet`, com o `--subnet-id`."],
      ["aws ec2 delete-subnet --subnet-id <subnet-de:10.60.1.0/24>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-subnet") && !!vpcDe(c, "10.60.0.0/16") && !subnetDe(c, "10.60.1.0/24")),
    d("fx-vpc-dsub2", "vpc", 3, 100, "O projeto da rede 10.30 foi cancelado",
      "A rede <b>10.30.0.0/16</b> tem uma sub-rede (<b>10.30.1.0/24</b>) e mais nada. Desmonte: sub-rede primeiro, VPC depois.",
      ["Mesmo `delete-subnet` de antes.", "Sem sub-rede e sem gateway, o `delete-vpc` passa."],
      ["aws ec2 delete-subnet --subnet-id <subnet-de:10.30.1.0/24>",
        "aws ec2 delete-vpc --vpc-id <vpc-de:10.30.0.0/16>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-vpc") && !vpcDe(c, "10.30.0.0/16")),
    d("fx-vpc-det1", "vpc", 3, 100, "Corte a saída do hackathon",
      "A VPC do hackathon ainda tem o gateway conectado, e com ele não sai. Desconecte o internet gateway da VPC <b>10.60.0.0/16</b>.",
      ["O contrário do attach é o `detach-internet-gateway`.", "Ele pede as DUAS pontas: `--internet-gateway-id` e `--vpc-id`."],
      ["aws ec2 detach-internet-gateway --internet-gateway-id <igw-de:10.60.0.0/16> --vpc-id <vpc-de:10.60.0.0/16>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "detach-internet-gateway") && !!vpcDe(c, "10.60.0.0/16") && !(vpcDe(c, "10.60.0.0/16") || {}).igw),
    d("fx-vpc-digw1", "vpc", 3, 90, "O gateway que ficou solto",
      "Desconectado, o gateway continua existindo — sozinho, sem servir a ninguém. Apague ele.",
      ["Agora que ele não está preso a nenhuma VPC, o `delete-internet-gateway` passa.", "Conectado, a resposta seria DependencyViolation."],
      ["aws ec2 delete-internet-gateway --internet-gateway-id <igw-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-internet-gateway") && !igwsSoltos(c).length),
    d("fx-vpc-dvpc2", "vpc", 3, 90, "Agora sim, a VPC do hackathon",
      "Sub-rede fora, gateway desconectado e apagado. Feche a desmontagem apagando a VPC <b>10.60.0.0/16</b>.",
      ["O mesmo `delete-vpc` que recusou lá no começo."],
      ["aws ec2 delete-vpc --vpc-id <vpc-de:10.60.0.0/16>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-vpc") && !vpcDe(c, "10.60.0.0/16")),
    d("fx-vpc-igw2", "vpc", 3, 120, "Alguém ligou internet na rede de dados",
      "A rede <b>10.99.0.0/16</b> é isolada de propósito, e alguém conectou um gateway nela. Reproduza o erro (crie um gateway e conecte nessa VPC) e desfaça do jeito certo: desconecte e apague.",
      ["Criar e conectar você já sabe.", "Desfazer é a mesma ordem da desmontagem: detach, depois delete."],
      ["aws ec2 create-internet-gateway",
        "aws ec2 attach-internet-gateway --internet-gateway-id <igw-id> --vpc-id <vpc-de:10.99.0.0/16>",
        "aws ec2 detach-internet-gateway --internet-gateway-id <igw-id> --vpc-id <vpc-de:10.99.0.0/16>",
        "aws ec2 delete-internet-gateway --internet-gateway-id <igw-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-internet-gateway") && !!vpcDe(c, "10.99.0.0/16") && !(vpcDe(c, "10.99.0.0/16") || {}).igw && !igwsSoltos(c).length),
  ]);

  // ---------------- EBS: um segundo disco atravessa a trilha ----------------
  at("ebs-3", [
    d("fx-ebs-cv1", "ebs", 2, 70, "Um disco só pros logs",
      "Log enchendo o disco do sistema derruba a máquina. Crie um segundo volume, de <b>20 GiB</b>, tipo <b>gp3</b>, na zona <b>us-east-1a</b>, só pros logs.",
      ["Mesmo comando do primeiro disco, outro tamanho.", "A zona tem que ser a mesma da máquina, senão o disco não encaixa."],
      ["aws ec2 create-volume --availability-zone us-east-1a --size 20 --volume-type gp3"],
      (c) => !!volumeDe(c, 20)),
    d("fx-ebs-at1", "ebs", 2, 80, "Encaixe o disco de logs",
      "Encaixe o volume de <b>20 GiB</b> na mesma máquina, no device <b>/dev/sdg</b>. <small>(o /dev/sdf já está ocupado pelo primeiro disco — tente, se quiser ver o erro)</small>",
      ["Mesmo comando do primeiro encaixe.", "Cada disco na mesma máquina precisa de um device diferente."],
      ["aws ec2 attach-volume --volume-id <vol-tam:20> --instance-id <id-da-instância> --device /dev/sdg"],
      (c) => (volumeDe(c, 20) || {}).estado === "in-use"),
    d("fx-ebs-dv1", "ebs", 2, 60, "Quais discos estão nessa máquina?",
      "Antes de mexer na máquina, veja só os discos encaixados <b>nela</b>, em vez de todos da conta.",
      ["O `describe-volumes` aceita `--filters`.", "O campo é `attachment.instance-id`."],
      ["aws ec2 describe-volumes --filters Name=attachment.instance-id,Values=<id-da-instância>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-volumes") && /attachment\.instance-id/.test(String(cmd.flags.filters || ""))),
  ]);
  at("ebs-4", [
    d("fx-ebs-snap1", "ebs", 2, 80, "Backup semanal dos logs",
      "A auditoria pede os logs guardados por um ano. Tire um snapshot do disco de <b>20 GiB</b> com a descrição <b>logs-semanal</b>.",
      ["Mesmo comando do backup-diario, outro disco."],
      ["aws ec2 create-snapshot --volume-id <vol-tam:20> --description logs-semanal"],
      (c) => !!snapDe(c, "logs-semanal")),
  ]);
  at("ebs-5", [
    d("fx-ebs-ds1", "ebs", 2, 60, "Cadê o backup dos logs?",
      "Com vários snapshots na conta, ache só o de descrição <b>logs-semanal</b>.",
      ["O `describe-snapshots` aceita `--filters`.", "O campo é `description`."],
      ["aws ec2 describe-snapshots --filters Name=description,Values=logs-semanal"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-snapshots") && /logs-semanal/.test(String(cmd.flags.filters || ""))),
  ]);
  at("ebs-6", [
    d("fx-ebs-dt1", "ebs", 3, 80, "O primeiro disco também sai",
      "A máquina vai ser desligada de vez. Desencaixe também o disco de <b>10 GiB</b>.",
      ["Mesmo comando da atividade anterior, outro volume."],
      ["aws ec2 detach-volume --volume-id <vol-tam:10>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "detach-volume") && (volumeDe(c, 10) || {}).estado === "available"),
  ]);
  at("ebs-7", [
    d("fx-ebs-del1", "ebs", 3, 80, "Nenhum disco solto na fatura",
      "O disco de <b>10 GiB</b> ficou solto — e disco solto cobra todo mês. O snapshot já guardou o que importava: apague o volume.",
      ["Mesmo comando da atividade anterior."],
      ["aws ec2 delete-volume --volume-id <vol-tam:10>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-volume") && !volumeDe(c, 10)),
  ]);

  // ---------------- ELB ----------------
  at("elb-3", [
    d("fx-elb-dlb1", "elbv2", 2, 70, "Qual é o endereço do balanceador?",
      "O time de DNS precisa do endereço do <b>loja-alb</b> pra apontar o domínio. Mostre só ele e pegue o <code>DNSName</code>.",
      ["O `describe-load-balancers` aceita os nomes que você quer ver.", "A flag é `--names`."],
      ["aws elbv2 describe-load-balancers --names loja-alb"],
      (c, cmd, ok) => ok && ehCmd(cmd, "elbv2", "describe-load-balancers") && String(cmd.flags.names || "") === "loja-alb"),
    d("fx-elb-run1", "elbv2", 2, 70, "A primeira máquina atrás do balanceador",
      "Balanceador sem máquina não balanceia nada. Suba a primeira instância web (<b>t2.micro</b>, a AMI de sempre) — ela vai entrar no grupo de destino já já.",
      ["É o `run-instances` do EC2."],
      ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t2.micro"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "run-instances")),
  ]);
  at("elb-4", [
    d("fx-elb-reg1", "elbv2", 3, 90, "A outra máquina também entra",
      "Você registrou uma máquina; a que você subiu antes ficou de fora e não recebe tráfego. Registre ela no <b>loja-tg</b> também.",
      ["Mesmo comando, com o id da outra instância.", "Dá pra registrar várias de uma vez: `--targets Id=<a> Id=<b>`."],
      ["aws elbv2 register-targets --target-group-arn <tg-arn> --targets Id=<instancia-anterior>"],
      (c) => ((tg(c, "loja-tg") || {}).alvos || []).length >= 2),
  ]);
  at("elb-6", [
    d("fx-elb-th1", "elbv2", 2, 70, "E aquela máquina específica?",
      "Um usuário reclamou de erro, e a suspeita é uma máquina só. Veja a saúde apenas dela no <b>loja-tg</b>.",
      ["O `describe-target-health` aceita `--targets` pra perguntar por alvos específicos.", "A forma é `--targets Id=<id-da-instância>`."],
      ["aws elbv2 describe-target-health --target-group-arn <tg-arn> --targets Id=<id-da-instância>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "elbv2", "describe-target-health") && /Id=/.test(String(cmd.flags.targets || ""))),
  ]);
  at("elb-7", [
    d("fx-elb-del1", "elbv2", 3, 90, "O balanceador do teste de carga",
      "O teste de carga subiu o <b>alb-teste-carga</b> e ninguém apagou — balanceador cobra por hora, com ou sem tráfego. Crie ele (as mesmas duas sub-redes) pra ver o cenário e apague.",
      ["Criar você já sabe.", "Apagar pede o ARN, que vem na resposta do create."],
      ["aws elbv2 create-load-balancer --name alb-teste-carga --subnets subnet-aaa1 subnet-bbb2",
        "aws elbv2 delete-load-balancer --load-balancer-arn <lb-arn>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "elbv2", "delete-load-balancer") && !lb(c, "alb-teste-carga")),
  ]);
  at("cob-elb-1", [
    d("fx-elb-dtg1", "elbv2", 2, 70, "O grupo de destino da loja ainda existe?",
      "Antes de apagar, confirme que o <b>loja-tg</b> está mesmo lá — e pegue o ARN dele.",
      ["O `describe-target-groups` também aceita `--names`."],
      ["aws elbv2 describe-target-groups --names loja-tg"],
      (c, cmd, ok) => ok && ehCmd(cmd, "elbv2", "describe-target-groups") && String(cmd.flags.names || "") === "loja-tg"),
  ]);
  at("cob-elb-2", [
    d("fx-elb-dtg2", "elbv2", 3, 90, "O grupo do teste de carga",
      "O teste de carga também deixou o <b>tg-teste-carga</b> (HTTP, porta 80, na mesma VPC do loja-tg). Crie pra ver o cenário e apague. <small>(se ele estivesse preso a um listener, a AWS recusaria: ResourceInUse)</small>",
      ["Criar é o `create-target-group`.", "Apagar pede o ARN, igual à atividade anterior."],
      ["aws elbv2 create-target-group --name tg-teste-carga --protocol HTTP --port 80 --vpc-id vpc-0f00d1e00c11ab001",
        "aws elbv2 delete-target-group --target-group-arn <tg-arn>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "elbv2", "delete-target-group") && !tg(c, "tg-teste-carga")),
  ]);

  // ============================================================
  // Leva 5 (25/09): KMS — segunda chave e a ordem da trilha
  // ============================================================
  // Os cob-kms (describe-key, list-aliases, status de rotação, disable-key)
  // vinham DEPOIS de agendar e cancelar a exclusão: olhar a chave vinha depois
  // de destruí-la. Agora cada um fica junto do que ele observa.
  const chaveDoAlias = (c, a) => (((c.kms || {}).chaves) || {})[(((c.kms || {}).aliases) || {})[a]];
  mover(["cob-kms-1"], "kms-2");
  mover(["cob-kms-2"], "kms-3");
  mover(["cob-kms-3", "cob-kms-4"], "kms-6");
  at("cob-kms-2", [
    d("fx-kms-ca1", "kms", 2, 80, "Uma chave só pros relatórios",
      "O time de BI quer os relatórios cifrados com uma chave <b>separada</b> da loja — assim dá pra revogar um sem derrubar o outro. Crie a chave com a descrição <b>chave dos relatorios</b> e dê a ela o apelido <b>alias/chave-relatorios</b>.",
      ["Criar chave e criar alias você já fez.", "O `--target-key-id` do alias é o KeyId que volta na criação."],
      ["aws kms create-key --description \"chave dos relatorios\"",
        "aws kms create-alias --alias-name alias/chave-relatorios --target-key-id <key-id>"],
      (c) => !!chaveDoAlias(c, "alias/chave-relatorios")),
    d("fx-kms-lk1", "kms", 2, 50, "Quantas chaves a conta paga?",
      "Cada chave que você cria custa por mês, usada ou não. Liste as chaves da conta e conte: agora são pelo menos duas.",
      ["Mesmo comando do começo da trilha."],
      ["aws kms list-keys"],
      (c, cmd, ok) => ok && ehCmd(cmd, "kms", "list-keys") && !!chaveDoAlias(c, "alias/chave-relatorios")),
    d("fx-kms-dk1", "kms", 2, 70, "O KeyId por trás do apelido",
      "Vários comandos da KMS não aceitam alias — pedem o KeyId. Descreva a chave pelo apelido <b>alias/chave-relatorios</b> e anote o <code>KeyId</code> que volta.",
      ["O `describe-key` é dos poucos que aceitam o alias direto.", "O KeyId está dentro de KeyMetadata."],
      ["aws kms describe-key --key-id alias/chave-relatorios"],
      (c, cmd, ok) => ok && ehCmd(cmd, "kms", "describe-key") && /chave-relatorios/.test(String(cmd.flags["key-id"] || ""))),
    d("fx-kms-la1", "kms", 2, 60, "Quais apelidos essa chave tem?",
      "Antes de apagar um apelido, confira quantos a chave dos relatórios tem. Liste só os aliases <b>dela</b>.",
      ["O `list-aliases` aceita `--key-id` pra filtrar por chave.", "Aqui também só vale o KeyId (o que o describe-key mostrou), não o alias."],
      ["aws kms list-aliases --key-id <chave-do-alias:alias/chave-relatorios>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "kms", "list-aliases") && cmd.flags["key-id"] !== undefined),
  ]);
  at("kms-5", [
    d("fx-kms-enc1", "kms", 3, 80, "Cifre o relatório do trimestre",
      "Cifre o texto <b>relatorio-q3</b> com a chave dos relatórios, usando o apelido dela.",
      ["Mesmo `encrypt` de antes, outra chave.", "No encrypt o alias vale."],
      ["aws kms encrypt --key-id alias/chave-relatorios --plaintext relatorio-q3"],
      (c, cmd, ok) => ok && ehCmd(cmd, "kms", "encrypt") && /chave-relatorios/.test(String(cmd.flags["key-id"] || ""))),
    d("fx-kms-dec1", "kms", 3, 80, "Abra o relatório",
      "O analista precisa ler o relatório. Decifre o blob que você acabou de gerar — e repare de novo que não precisa dizer qual chave.",
      ["Mesmo `decrypt` de antes, com o blob novo."],
      ["aws kms decrypt --ciphertext-blob <blob>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "kms", "decrypt") && !!chaveDoAlias(c, "alias/chave-relatorios")),
  ]);
  at("kms-6", [
    d("fx-kms-rot1", "kms", 3, 70, "Rotação também nos relatórios",
      "A auditoria exige rotação em TODA chave de cliente. Ligue a rotação na chave dos relatórios — pelo KeyId.",
      ["Mesmo comando da chave da loja.", "Com o alias dá NotFoundException: pegue o KeyId no describe-key."],
      ["aws kms enable-key-rotation --key-id <chave-do-alias:alias/chave-relatorios>"],
      (c) => !!(chaveDoAlias(c, "alias/chave-relatorios") || {}).rotacao),
  ]);
  at("cob-kms-3", [
    d("fx-kms-grs1", "kms", 3, 70, "E a chave da loja, está girando?",
      "Confira também a chave da loja. <small>(é assim que o auditor confere: chave por chave, pelo KeyId)</small>",
      ["Mesmo comando, com o KeyId da chave da loja."],
      ["aws kms get-key-rotation-status --key-id <chave-do-alias:alias/chave-loja>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "kms", "get-key-rotation-status") && String(cmd.flags["key-id"] || "") === String((chaveDoAlias(c, "alias/chave-loja") || {}).id || "-")),
  ]);
  at("cob-kms-4", [
    d("fx-kms-en1", "kms", 3, 80, "O susto passou: ligue de volta",
      "Com a chave dos relatórios desabilitada, o painel de BI parou. Habilite a chave de novo.",
      ["O contrário do disable é o `enable-key`.", "KeyId, não alias."],
      ["aws kms enable-key --key-id <chave-do-alias:alias/chave-relatorios>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "kms", "enable-key") && (chaveDoAlias(c, "alias/chave-relatorios") || {}).estado === "Enabled"),
    d("fx-kms-dis1", "kms", 3, 80, "O BI vai ficar três meses parado",
      "O projeto de BI foi pausado por três meses. Em vez de apagar a chave (irreversível), desabilite — dá pra voltar quando o projeto voltar.",
      ["Mesmo `disable-key` de antes."],
      ["aws kms disable-key --key-id <chave-do-alias:alias/chave-relatorios>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "kms", "disable-key") && (chaveDoAlias(c, "alias/chave-relatorios") || {}).estado === "Disabled"),
  ]);
  at("kms-7", [
    d("fx-kms-sch1", "kms", 3, 80, "O BI foi cancelado de vez",
      "O projeto de BI foi encerrado. Agende a exclusão da chave dos relatórios — desta vez <b>sem</b> informar a janela, e veja quantos dias a AWS usa por padrão.",
      ["Mesmo `schedule-key-deletion`, sem o `--pending-window-in-days`.", "O padrão é o prazo MAIS LONGO: 30 dias."],
      ["aws kms schedule-key-deletion --key-id <chave-do-alias:alias/chave-relatorios>"],
      (c) => (chaveDoAlias(c, "alias/chave-relatorios") || {}).estado === "PendingDeletion"),
  ]);
  at("kms-8", [
    d("fx-kms-can1", "kms", 3, 80, "O jurídico precisa dos relatórios antigos",
      "Uma auditoria fiscal pediu os relatórios cifrados do ano passado — sem a chave, eles viram lixo. Cancele a exclusão da chave dos relatórios. <small>(ela volta desabilitada, e é assim que deve ficar até alguém precisar abrir)</small>",
      ["Mesmo `cancel-key-deletion` de antes."],
      ["aws kms cancel-key-deletion --key-id <chave-do-alias:alias/chave-relatorios>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "kms", "cancel-key-deletion") && (chaveDoAlias(c, "alias/chave-relatorios") || {}).estado === "Disabled"),
  ]);

  // ============================================================
  // Leva 6 (25/09): Secrets Manager, ACM e CloudTrail
  // ============================================================
  const segredo = (c, n) => (((c.secrets || {}).segredos) || {})[n];
  const certsAcm = (c) => Object.values(((c.acm || {}).certificados) || {});
  const importados = (c) => certsAcm(c).filter((x) => x.tipo === "IMPORTED");
  const trilhaCt = (c, n) => (((c.cloudtrail || {}).trilhas) || {})[n];

  // ---------------- Secrets Manager ----------------
  at("sec-3", [
    d("fx-sec-ls1", "secretsmanager", 2, 60, "Só as senhas, não os tokens",
      "Em conta de verdade são dezenas de segredos. Liste só os que o nome começa com <b>senha</b>.",
      ["O `list-secrets` aceita `--filters`.", "A forma é `--filters Key=name,Values=<começo-do-nome>`."],
      ["aws secretsmanager list-secrets --filters Key=name,Values=senha"],
      (c, cmd, ok) => ok && ehCmd(cmd, "secretsmanager", "list-secrets") && /Key=name/.test(String(cmd.flags.filters || ""))),
  ]);
  at("sec-4", [
    d("fx-sec-up1", "secretsmanager", 2, 80, "O parceiro de frete trocou o token",
      "A transportadora gera um token novo por ano. Guarde o <b>token-api-frete</b> com o valor <b>tk-2025</b> e depois troque pro <b>tk-2026</b> — sem mudar nada na aplicação.",
      ["Criar o segredo você já sabe.", "Trocar é o mesmo `update-secret` da senha do banco."],
      ["aws secretsmanager create-secret --name token-api-frete --secret-string tk-2025",
        "aws secretsmanager update-secret --secret-id token-api-frete --secret-string tk-2026"],
      (c) => (segredo(c, "token-api-frete") || {}).valor === "tk-2026"),
  ]);
  at("sec-6", [
    d("fx-sec-del1", "secretsmanager", 3, 90, "A transportadora fechou",
      "O parceiro de frete encerrou as atividades e o token não vale mais nada. Apague o <b>token-api-frete</b> <b>sem janela de recuperação</b>. <small>(use com cuidado: sem janela, não há restore)</small>",
      ["O `delete-secret` tem uma flag que pula a janela de proteção.", "É a `--force-delete-without-recovery`."],
      ["aws secretsmanager delete-secret --secret-id token-api-frete --force-delete-without-recovery"],
      (c, cmd, ok) => ok && ehCmd(cmd, "secretsmanager", "delete-secret") && cmd.flags["force-delete-without-recovery"] !== undefined && !segredo(c, "token-api-frete")),
    d("fx-sec-res1", "secretsmanager", 3, 100, "O estagiário apagou a senha dos relatórios",
      "Reproduza o susto: guarde a <b>senha-relatorios</b> (valor <b>rel-2026</b>), apague com a janela padrão e restaure antes que seja tarde.",
      ["Criar e apagar você já sabe — sem o `--recovery-window-in-days`, a janela é de 30 dias.", "No fim, o `restore-secret` da atividade anterior."],
      ["aws secretsmanager create-secret --name senha-relatorios --secret-string rel-2026",
        "aws secretsmanager delete-secret --secret-id senha-relatorios",
        "aws secretsmanager restore-secret --secret-id senha-relatorios"],
      (c, cmd, ok) => ok && ehCmd(cmd, "secretsmanager", "restore-secret") && !!segredo(c, "senha-relatorios") && !(segredo(c, "senha-relatorios") || {}).apagandoEm),
  ]);
  at("sec-7", [
    d("fx-sec-ds1", "secretsmanager", 3, 70, "A senha dos relatórios passou por aqui?",
      "A auditoria quer o histórico da <b>senha-relatorios</b>: quando nasceu, se já foi marcada pra apagar. Descreva o segredo — sem ler o valor.",
      ["Mesmo comando da auditoria anterior, outro segredo."],
      ["aws secretsmanager describe-secret --secret-id senha-relatorios"],
      (c, cmd, ok) => ok && ehCmd(cmd, "secretsmanager", "describe-secret") && String(cmd.flags["secret-id"] || "") === "senha-relatorios"),
  ]);
  at("sec-8", [
    d("fx-sec-tag1", "secretsmanager", 3, 80, "De qual time é a senha dos relatórios?",
      "Etiquete a <b>senha-relatorios</b> com <b>time=bi</b> — é assim que a fatura mostra quanto cada time gasta com segredos.",
      ["Mesmo `tag-resource` de antes."],
      ["aws secretsmanager tag-resource --secret-id senha-relatorios --tags Key=time,Value=bi"],
      (c) => ((segredo(c, "senha-relatorios") || {}).tags || {}).time === "bi"),
  ]);
  at("sec-9", [
    d("fx-sec-pw1", "secretsmanager", 3, 80, "A política exige de tudo um pouco",
      "O banco novo exige senha com letra maiúscula, minúscula, número <b>e</b> símbolo — senão rejeita. Gere uma de <b>20</b> caracteres que garanta pelo menos um de cada tipo.",
      ["Mesmo `get-random-password`, com outra flag.", "A flag é `--require-each-included-type`."],
      ["aws secretsmanager get-random-password --password-length 20 --require-each-included-type"],
      (c, cmd, ok) => ok && ehCmd(cmd, "secretsmanager", "get-random-password") && cmd.flags["require-each-included-type"] !== undefined),
  ]);
  at("sec-10", [
    d("fx-sec-rot1", "secretsmanager", 3, 110, "A senha dos relatórios troca a cada trimestre",
      "O BI aceita trocar a senha a cada <b>90</b> dias. Ligue a rotação da <b>senha-relatorios</b> nesse prazo.",
      ["Mesmo `rotate-secret` de antes, com outro número."],
      ["aws secretsmanager rotate-secret --secret-id senha-relatorios --rotation-rules AutomaticallyAfterDays=90"],
      (c) => (segredo(c, "senha-relatorios") || {}).rotacaoDias === 90),
  ]);

  // ---------------- ACM ----------------
  at("acm-3", [
    d("fx-acm-lc1", "acm", 2, 70, "Quais certificados ainda esperam o DNS?",
      "Certificado parado em validação não protege nada. Liste só os que estão <b>PENDING_VALIDATION</b>.",
      ["O `list-certificates` aceita um filtro de status.", "A flag é `--certificate-statuses`."],
      ["aws acm list-certificates --certificate-statuses PENDING_VALIDATION"],
      (c, cmd, ok) => ok && ehCmd(cmd, "acm", "list-certificates") && /PENDING_VALIDATION/.test(String(cmd.flags["certificate-statuses"] || ""))),
  ]);
  at("acm-6", [
    d("fx-acm-tag1", "acm", 3, 80, "O certificado também é do time de vendas",
      "Além do ambiente, a fatura precisa do time. Acrescente <b>time=vendas</b> no mesmo certificado.",
      ["Mesmo comando de etiqueta — ele ACRESCENTA, não substitui as que já existem."],
      ["aws acm add-tags-to-certificate --certificate-arn <cert-arn> --tags Key=time,Value=vendas"],
      (c) => certsAcm(c).some((x) => x.tags && x.tags.time === "vendas")),
  ]);
  at("acm-8", [
    d("fx-acm-imp1", "acm", 3, 100, "O certificado comprado venceu",
      "O certificado importado vence este mês, e a AWS não renova importado. Chegou o arquivo novo: <b>reimporte</b> no mesmo ARN, pra que o load balancer passe a usar o novo sem ninguém mexer nele.",
      ["É o mesmo `import-certificate`, com um detalhe: você diz QUAL certificado está sendo trocado.", "A flag é `--certificate-arn`, com o ARN do importado."],
      ["aws acm import-certificate --certificate-arn <cert-importado> --certificate file://cert.pem --private-key file://chave.pem"],
      (c) => importados(c).some((x) => !!x.reimportadoEm)),
    d("fx-acm-lt1", "acm", 3, 70, "O importado tem etiqueta?",
      "Certificado importado nasce sem etiqueta nenhuma. Confira as do certificado importado.",
      ["Mesmo `list-tags-for-certificate` de antes, com o ARN do importado."],
      ["aws acm list-tags-for-certificate --certificate-arn <cert-importado>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "acm", "list-tags-for-certificate") && importados(c).some((x) => x.arn === String(cmd.flags["certificate-arn"] || ""))),
  ]);
  at("acm-10", [
    d("fx-acm-get1", "acm", 3, 80, "Só a cadeia, por favor",
      "O servidor já tem o certificado; faltou a <b>cadeia</b>. Baixe só ela do certificado importado.",
      ["Mesmo `get-certificate`, recortado com `--query`.", "O campo é `CertificateChain`."],
      ["aws acm get-certificate --certificate-arn <cert-importado> --query CertificateChain"],
      (c, cmd, ok) => ok && ehCmd(cmd, "acm", "get-certificate") && /CertificateChain/.test(String(cmd.flags.query || ""))),
  ]);
  at("acm-4", [
    d("fx-acm-del1", "acm", 3, 80, "O contrato do certificado comprado acabou",
      "A empresa passou a usar só certificado da AWS. Apague o importado.",
      ["Mesmo `delete-certificate`, com o ARN do importado.", "Certificado em uso por um load balancer não sai — aqui ele está livre."],
      ["aws acm delete-certificate --certificate-arn <cert-importado>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "acm", "delete-certificate") && !importados(c).length),
  ]);

  // ---------------- CloudTrail ----------------
  at("ct-3", [
    d("fx-ct-dt1", "cloudtrail", 2, 60, "Onde essa trilha grava?",
      "Um colega pergunta pra qual bucket vão os registros da <b>trilha-auditoria</b>. Mostre só ela.",
      ["O `describe-trails` aceita a lista de nomes.", "A flag é `--trail-name-list`."],
      ["aws cloudtrail describe-trails --trail-name-list trilha-auditoria"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudtrail", "describe-trails") && /trilha-auditoria/.test(String(cmd.flags["trail-name-list"] || ""))),
  ]);
  at("cob-ct-1", [
    d("fx-ct-gts1", "cloudtrail", 3, 70, "Parou mesmo?",
      "Confirme que a <b>trilha-auditoria</b> parou de gravar — o campo <code>IsLogging</code> tem que estar <b>false</b>. <small>(num alarme de segurança, é exatamente essa checagem que dispara o alerta)</small>",
      ["Mesmo `get-trail-status` de antes."],
      ["aws cloudtrail get-trail-status --name trilha-auditoria"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudtrail", "get-trail-status") && !!trilhaCt(c, "trilha-auditoria") && !(trilhaCt(c, "trilha-auditoria") || {}).gravando),
    d("fx-ct-stop1", "cloudtrail", 3, 100, "A trilha do laboratório",
      "O time de segurança montou a <b>trilha-lab</b> (no mesmo bucket <b>logs-auditoria-climb</b>) pra testar uma regra, ligou a gravação e agora precisa parar. Faça o ciclo inteiro.",
      ["Criar a trilha e ligar a gravação você já fez.", "No fim, o `stop-logging` da atividade anterior."],
      ["aws cloudtrail create-trail --name trilha-lab --s3-bucket-name logs-auditoria-climb",
        "aws cloudtrail start-logging --name trilha-lab",
        "aws cloudtrail stop-logging --name trilha-lab"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudtrail", "stop-logging") && !!trilhaCt(c, "trilha-lab") && !(trilhaCt(c, "trilha-lab") || {}).gravando),
  ]);
  at("cob-ct-2", [
    d("fx-ct-del1", "cloudtrail", 3, 90, "O laboratório acabou",
      "O teste acabou. Apague a <b>trilha-lab</b> — os registros que ela já entregou continuam no bucket.",
      ["Mesmo `delete-trail` de antes."],
      ["aws cloudtrail delete-trail --name trilha-lab"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudtrail", "delete-trail") && !trilhaCt(c, "trilha-lab")),
  ]);

  // ============================================================
  // Leva 7 (25/09): EventBridge, Route 53 e CloudFront
  // ============================================================
  const regra = (c, n) => (((c.events || {}).regras) || {})[n];
  const zonaDe = (c, nome) => Object.values(((c.route53 || {}).zonas) || {}).find((z) => z.nome === nome);
  const checksDe = (c, alvo) => Object.values(((c.route53 || {}).checks) || {}).filter((h) => h.alvo === alvo);
  const distsCf = (c) => Object.values(((c.cloudfront || {}).distribuicoes) || {});
  const distDe = (c, origem) => distsCf(c).find((x) => x.origem === origem);

  // ---------------- EventBridge ----------------
  // cob-eb-1 (describe-rule) e cob-eb-2 (enable-rule) vinham depois do
  // delete-rule. Agora ficam junto de quem cria e de quem desliga a regra.
  mover(["cob-eb-1"], "eb-2");
  mover(["cob-eb-2"], "eb-5");
  at("cob-eb-1", [
    d("fx-eb-lr1", "events", 2, 60, "Só as regras de backup",
      "A conta vai acumular regra de tudo quanto é time. Liste só as que começam com <b>backup</b>.",
      ["O `list-rules` aceita um prefixo de nome.", "A flag é `--name-prefix`."],
      ["aws events list-rules --name-prefix backup"],
      (c, cmd, ok) => ok && ehCmd(cmd, "events", "list-rules") && String(cmd.flags["name-prefix"] || "") === "backup"),
    d("fx-eb-dr1", "events", 2, 60, "A limpeza roda de quanto em quanto tempo?",
      "Alguém jura que a limpeza roda de hora em hora. Confira a <b>limpeza-noturna</b> por dentro e veja o agendamento de verdade.",
      ["Mesmo `describe-rule` da regra de backup."],
      ["aws events describe-rule --name limpeza-noturna"],
      (c, cmd, ok) => ok && ehCmd(cmd, "events", "describe-rule") && String(cmd.flags.name || "") === "limpeza-noturna"),
  ]);
  at("eb-3", [
    d("fx-eb-pt1", "events", 2, 80, "O backup também precisa de alvo",
      "A regra <b>backup-semanal</b> existe mas não chama ninguém. Aponte ela pra função <b>arn:aws:lambda:us-east-1:123456789012:function:backup</b>, com o Id <b>1</b>.",
      ["Mesmo `put-targets` da limpeza, outra regra e outra função."],
      ["aws events put-targets --rule backup-semanal --targets '[{\"Id\":\"1\",\"Arn\":\"arn:aws:lambda:us-east-1:123456789012:function:backup\"}]'"],
      (c) => ((regra(c, "backup-semanal") || {}).alvos || []).length > 0),
  ]);
  at("eb-4", [
    d("fx-eb-lt1", "events", 2, 60, "O backup chama a função certa?",
      "Confira os alvos da <b>backup-semanal</b> antes de ir embora na sexta.",
      ["Mesmo `list-targets-by-rule`, outra regra."],
      ["aws events list-targets-by-rule --rule backup-semanal"],
      (c, cmd, ok) => ok && ehCmd(cmd, "events", "list-targets-by-rule") && String(cmd.flags.rule || "") === "backup-semanal"),
  ]);
  at("cob-eb-2", [
    d("fx-eb-en1", "events", 3, 70, "Acabaram as férias",
      "O time voltou e a <b>limpeza-noturna</b> ainda está desabilitada desde as férias. Ligue ela de novo.",
      ["Mesmo `enable-rule` da atividade anterior."],
      ["aws events enable-rule --name limpeza-noturna"],
      (c, cmd, ok) => ok && ehCmd(cmd, "events", "enable-rule") && (regra(c, "limpeza-noturna") || {}).estado === "ENABLED"),
    d("fx-eb-rt1", "events", 3, 80, "O backup muda de ferramenta",
      "O backup semanal passou pro AWS Backup, e a regra não deve mais chamar a função. Tire o alvo <b>1</b> da <b>backup-semanal</b> — a regra fica, sem ninguém pra chamar.",
      ["Tirar alvo é o `remove-targets`, com a regra e o Id do alvo.", "A flag do Id é `--ids`."],
      ["aws events remove-targets --rule backup-semanal --ids 1"],
      (c, cmd, ok) => ok && ehCmd(cmd, "events", "remove-targets") && !!regra(c, "backup-semanal") && !((regra(c, "backup-semanal") || {}).alvos || []).length),
  ]);
  at("eb-6", [
    d("fx-eb-del1", "events", 3, 80, "A regra do backup sai de vez",
      "Sem alvo, a <b>backup-semanal</b> só ocupa espaço. Apague a regra.",
      ["Sem alvo pendurado, o `delete-rule` passa direto."],
      ["aws events delete-rule --name backup-semanal"],
      (c, cmd, ok) => ok && ehCmd(cmd, "events", "delete-rule") && !regra(c, "backup-semanal")),
  ]);

  // ---------------- Route 53 ----------------
  at("r53-3", [
    d("fx-r53-lz1", "route53", 2, 60, "Qual é o Id da zona?",
      "Quase todo comando do Route 53 pede o Id da zona, não o nome. Liste as zonas e ache o Id da <b>climb-labs.com</b>.",
      ["Mesmo comando do começo da trilha.", "O Id vem no formato /hostedzone/Z..."],
      ["aws route53 list-hosted-zones"],
      (c, cmd, ok) => ok && ehCmd(cmd, "route53", "list-hosted-zones") && !!zonaDe(c, "climb-labs.com.")),
  ]);
  at("r53-4", [
    d("fx-r53-lr1", "route53", 3, 70, "O www entrou na zona?",
      "Antes de avisar o time, confira que o registro <b>A</b> do www está mesmo na zona.",
      ["Mesmo `list-resource-record-sets`: agora a lista tem NS, SOA e o seu A."],
      ["aws route53 list-resource-record-sets --hosted-zone-id <zone-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "route53", "list-resource-record-sets") && ((zonaDe(c, "climb-labs.com.") || {}).registros || []).some((r) => r.Type === "A")),
  ]);
  at("r53-7", [
    d("fx-r53-gz1", "route53", 3, 70, "Só os nameservers, pro registrador",
      "O registrador pede os quatro nameservers num formulário. Pegue só eles, sem o resto da resposta.",
      ["Mesmo `get-hosted-zone`, com `--query`.", "O caminho é `DelegationSet.NameServers`."],
      ["aws route53 get-hosted-zone --id <zone-id> --query DelegationSet.NameServers"],
      (c, cmd, ok) => ok && ehCmd(cmd, "route53", "get-hosted-zone") && /NameServers/.test(String(cmd.flags.query || ""))),
  ]);
  at("r53-10", [
    d("fx-r53-hc1", "route53", 3, 100, "A API também precisa de vigia",
      "A API da loja fica em <b>api-climb.com.br</b> e responde saúde em <b>/saude</b>, só por HTTPS. Crie o health check dela (caller reference <b>climb-2</b>).",
      ["Mesmo `create-health-check`, trocando o tipo, o domínio e o caminho.", "O `--caller-reference` precisa ser diferente do anterior."],
      ["aws route53 create-health-check --caller-reference climb-2 --health-check-config Type=HTTPS,FullyQualifiedDomainName=api-climb.com.br,ResourcePath=/saude"],
      (c) => checksDe(c, "api-climb.com.br").some((h) => h.tipo === "HTTPS")),
    d("fx-r53-hcd1", "route53", 3, 80, "A API mudou de domínio",
      "A API migrou pra outro domínio e o check antigo só gera alarme falso. Apague a verificação da <b>api-climb.com.br</b>.",
      ["Mesmo `delete-health-check` de antes; o id veio na resposta da criação."],
      ["aws route53 delete-health-check --health-check-id <hc-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "route53", "delete-health-check") && !checksDe(c, "api-climb.com.br").length),
  ]);
  at("r53-6", [
    d("fx-r53-dz1", "route53", 3, 90, "O domínio de teste",
      "Alguém criou a zona <b>teste-climb.com</b> pra testar e ela ficou lá — cada zona custa por mês. Crie (caller reference <b>climb-teste</b>) pra ver o cenário e apague.",
      ["Criar a zona você já sabe.", "Zona só com NS e SOA sai direto no `delete-hosted-zone`."],
      ["aws route53 create-hosted-zone --name teste-climb.com --caller-reference climb-teste",
        "aws route53 delete-hosted-zone --id <zone-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "route53", "delete-hosted-zone") && !zonaDe(c, "teste-climb.com.")),
  ]);

  // ---------------- CloudFront ----------------
  at("cf-3", [
    d("fx-cf-ld1", "cloudfront", 2, 60, "Qual é o Id da distribuição?",
      "Os comandos seguintes pedem o Id da distribuição. Liste as distribuições e ache o dela.",
      ["Mesmo comando do começo da trilha.", "O Id começa com E, e o endereço termina em cloudfront.net."],
      ["aws cloudfront list-distributions"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudfront", "list-distributions") && distsCf(c).length > 0),
    d("fx-cf-gd1", "cloudfront", 2, 70, "Já terminou de espalhar?",
      "Distribuição nova leva um tempo pra chegar em todas as bordas. Veja só o <b>Status</b> dela: <b>Deployed</b> é pronta.",
      ["Mesmo `get-distribution`, com `--query`.", "O caminho é `Distribution.Status`."],
      ["aws cloudfront get-distribution --id <dist-id> --query Distribution.Status"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudfront", "get-distribution") && /Status/.test(String(cmd.flags.query || ""))),
  ]);
  at("cf-4", [
    d("fx-cf-inv1", "cloudfront", 3, 100, "Só a home e o CSS",
      "Desta vez só mudaram a home e as folhas de estilo. Limpe <b>/index.html</b> e <b>/css/*</b> — limpar tudo sempre obriga a borda a buscar o site inteiro de novo.",
      ["Mesmo `create-invalidation`, com mais de um caminho.", "Os caminhos vão separados por espaço no `--paths`."],
      ["aws cloudfront create-invalidation --distribution-id <dist-id> --paths /index.html /css/*"],
      (c) => distsCf(c).some((x) => (x.invalidacoes || []).length >= 2)),
  ]);
  at("cf-5", [
    d("fx-cf-li1", "cloudfront", 3, 70, "Quantas limpezas este mês?",
      "Os primeiros 1.000 caminhos invalidados por mês são grátis; depois, paga. Liste as invalidações e conte quantas o time já fez.",
      ["Mesmo `list-invalidations` de antes."],
      ["aws cloudfront list-invalidations --id <dist-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudfront", "list-invalidations") && distsCf(c).some((x) => (x.invalidacoes || []).length >= 2)),
  ]);
  at("cf-6", [
    d("fx-cf-gi1", "cloudfront", 3, 70, "Só o status da limpeza",
      "O script de deploy só quer saber se a última limpeza terminou. Consulte a invalidação trazendo só o <b>Status</b>.",
      ["Mesmo `get-invalidation`, com `--query`.", "O caminho é `Invalidation.Status`."],
      ["aws cloudfront get-invalidation --distribution-id <dist-id> --id <inv-id> --query Invalidation.Status"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudfront", "get-invalidation") && /Status/.test(String(cmd.flags.query || ""))),
  ]);
  at("cf-7", [
    d("fx-cf-cp1", "cloudfront", 3, 70, "O time inventou alguma política?",
      "Antes de criar uma política de cache própria, veja se alguém já criou. Liste só as <b>custom</b>.",
      ["Mesmo `list-cache-policies`, outro `--type`.", "Vazio quer dizer: todo mundo está usando as gerenciadas pela AWS."],
      ["aws cloudfront list-cache-policies --type custom"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudfront", "list-cache-policies") && String(cmd.flags.type || "") === "custom"),
  ]);
  at("cf-10", [
    d("fx-cf-upd1", "cloudfront", 3, 110, "A CDN das imagens também sai",
      "A CDN das imagens (<b>cdn-assets-climb.s3.amazonaws.com</b>) vai ser aposentada junto. Crie ela pra ver o cenário, pegue o ETag e <b>desligue</b>.",
      ["Criar distribuição você já sabe.", "Desligar é o `update-distribution` com `{\"Enabled\":false}` e o ETag no `--if-match`."],
      ["aws cloudfront create-distribution --origin-domain-name cdn-assets-climb.s3.amazonaws.com",
        "aws cloudfront get-distribution-config --id <dist-id>",
        "aws cloudfront update-distribution --id <dist-id> --if-match <etag> --distribution-config '{\"Enabled\":false}'"],
      (c) => !!distDe(c, "cdn-assets-climb.s3.amazonaws.com") && (distDe(c, "cdn-assets-climb.s3.amazonaws.com") || {}).ativo === false),
    d("fx-cf-del1", "cloudfront", 3, 100, "E agora apague a CDN das imagens",
      "Desligada, ela pode sair. Pegue o ETag novo e apague a distribuição das imagens.",
      ["O ETag mudou quando você desligou — leia de novo.", "Depois, o mesmo `delete-distribution` de antes."],
      ["aws cloudfront get-distribution-config --id <dist-id>",
        "aws cloudfront delete-distribution --id <dist-id> --if-match <etag>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudfront", "delete-distribution") && !distDe(c, "cdn-assets-climb.s3.amazonaws.com")),
  ]);

  // ============================================================
  // Leva 8 (25/09): EFS, ElastiCache e Polly
  // ============================================================
  const fsDeToken = (c, t) => Object.values(((c.efs || {}).sistemas) || {}).find((f) => f.token === t);
  const alvosDoFs = (c, t) => { const f = fsDeToken(c, t); return f ? Object.values(((c.efs || {}).alvos) || {}).filter((a) => a.fs === f.id || a.sistema === f.id || a.fileSystemId === f.id) : []; };
  const pontosEfs = (c) => Object.values(((c.efs || {}).pontos) || {});
  const ecache = (c) => c.elasticache || {};
  const lexico = (c, n) => ((((c.polly || {}).lexicons) || {})[n]);
  const tarefasPolly = (c) => Object.values(((c.polly || {}).tarefas) || {});
  const LEX_TI = "'<?xml version=\"1.0\" encoding=\"UTF-8\"?><lexicon version=\"1.0\" xmlns=\"http://www.w3.org/2005/01/pronunciation-lexicon\" xml:lang=\"pt-BR\"><lexeme><grapheme>EC2</grapheme><alias>é cê dois</alias></lexeme></lexicon>'";

  // ---------------- EFS ----------------
  at("efs-3", [
    d("fx-efs-dfs1", "efs", 2, 60, "Qual é o id do disco do time?",
      "Com vários file systems na conta, ache o do time pelo token de criação <b>dados-efs</b>, em vez de ler a lista inteira.",
      ["O `describe-file-systems` aceita o token com que o disco foi criado.", "A flag é `--creation-token`."],
      ["aws efs describe-file-systems --creation-token dados-efs"],
      (c, cmd, ok) => ok && ehCmd(cmd, "efs", "describe-file-systems") && String(cmd.flags["creation-token"] || "") === "dados-efs"),
  ]);
  at("cob-efs-1", [
    d("fx-efs-mt2", "efs", 2, 80, "O disco também na segunda zona",
      "Com mount target numa zona só, as máquinas da outra zona não enxergam o disco — e se a zona cair, ninguém enxerga. Crie o segundo mount target na <b>subnet-bbb2</b>.",
      ["Mesmo `create-mount-target`, outra sub-rede."],
      ["aws efs create-mount-target --file-system-id <fs-id> --subnet-id subnet-bbb2"],
      (c) => Object.values(((c.efs || {}).alvos) || {}).some((a) => a.subnet === "subnet-bbb2" || a.subnetId === "subnet-bbb2" || a.SubnetId === "subnet-bbb2")),
    d("fx-efs-dmt1", "efs", 2, 70, "Agora são duas portas de entrada",
      "Confira que o disco tem acesso nas <b>duas</b> sub-redes.",
      ["Mesmo `describe-mount-targets` de antes."],
      ["aws efs describe-mount-targets --file-system-id <fs-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "efs", "describe-mount-targets") && Object.keys(((c.efs || {}).alvos) || {}).length >= 2),
  ]);
  at("efs-5", [
    d("fx-efs-lc1", "efs", 3, 100, "E se o arquivo voltar a ser usado?",
      "O arquivo que desceu pra classe barata e volta a ser aberto todo dia fica caro de ler. Reescreva a regra do disco com <b>duas</b> políticas: desce depois de <b>30 dias</b> sem uso e <b>sobe de volta no primeiro acesso</b>.",
      ["O `put-lifecycle-configuration` SUBSTITUI a regra inteira — mande as duas juntas.", "A segunda é `TransitionToPrimaryStorageClass=AFTER_1_ACCESS`, separada da primeira por espaço."],
      ["aws efs put-lifecycle-configuration --file-system-id <fs-id> --lifecycle-policies TransitionToIA=AFTER_30_DAYS TransitionToPrimaryStorageClass=AFTER_1_ACCESS"],
      (c) => Object.values(((c.efs || {}).sistemas) || {}).some((f) => (f.cicloVida || []).length >= 2)),
  ]);
  at("efs-7", [
    d("fx-efs-ap1", "efs", 3, 100, "A pasta do faturamento",
      "O sistema de faturamento vai usar o mesmo disco, isolado dos relatórios. Crie o ponto de acesso que entra direto em <b>/app-faturamento</b>.",
      ["Mesmo `create-access-point`, outro caminho."],
      ["aws efs create-access-point --file-system-id <fs-id> --root-directory Path=/app-faturamento"],
      (c) => pontosEfs(c).some((p) => p.caminho === "/app-faturamento")),
  ]);
  at("efs-8", [
    d("fx-efs-dap1", "efs", 3, 70, "Qual é a pasta do segundo ponto?",
      "O auditor só quer a pasta do <b>segundo</b> ponto de acesso, sem o resto da resposta.",
      ["Mesmo `describe-access-points`, recortado com `--query`.", "A lista começa em 0: o segundo é `AccessPoints[1].RootDirectory.Path`."],
      ["aws efs describe-access-points --file-system-id <fs-id> --query AccessPoints[1].RootDirectory.Path"],
      (c, cmd, ok) => ok && ehCmd(cmd, "efs", "describe-access-points") && /RootDirectory/.test(String(cmd.flags.query || ""))),
  ]);
  at("efs-9", [
    d("fx-efs-dmt2", "efs", 3, 80, "A segunda zona vai ser desativada",
      "A zona da <b>subnet-bbb2</b> vai sair do projeto. Apague o mount target dela — o disco continua acessível pela outra.",
      ["Apagar mount target é o `delete-mount-target`, com o id DELE (não o do disco).", "O id sai do describe-mount-targets."],
      ["aws efs delete-mount-target --mount-target-id <mt-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "efs", "delete-mount-target") && !Object.values(((c.efs || {}).alvos) || {}).some((a) => a.subnet === "subnet-bbb2" || a.subnetId === "subnet-bbb2" || a.SubnetId === "subnet-bbb2")),
  ]);
  at("efs-4", [
    d("fx-efs-tmp1", "efs", 3, 80, "O disco temporário do teste",
      "Alguém criou o disco <b>efs-temporario</b> pra um teste. Crie ele pra ver o cenário e confira a regra de economia — disco novo nasce sem nenhuma.",
      ["Criar é o `create-file-system` com o token.", "Resposta vazia no `describe-lifecycle-configuration` = tudo na classe cara."],
      ["aws efs create-file-system --creation-token efs-temporario",
        "aws efs describe-lifecycle-configuration --file-system-id <fs-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "efs", "describe-lifecycle-configuration") && !!fsDeToken(c, "efs-temporario")),
    d("fx-efs-tmp2", "efs", 3, 80, "Disco de teste não precisa de backup",
      "Backup de disco que vai sumir amanhã é custo à toa. <b>Desligue</b> o backup automático do disco temporário.",
      ["Mesmo `put-backup-policy`, com o outro valor.", "É `Status=DISABLED`."],
      ["aws efs put-backup-policy --file-system-id <fs-id> --backup-policy Status=DISABLED"],
      (c, cmd, ok) => ok && ehCmd(cmd, "efs", "put-backup-policy") && /DISABLED/.test(String(cmd.flags["backup-policy"] || "")) && !!fsDeToken(c, "efs-temporario")),
    d("fx-efs-tmp3", "efs", 3, 80, "Fim do teste",
      "O teste acabou. Apague o disco temporário — sem mount target, ele sai direto.",
      ["Mesmo `delete-file-system` de antes."],
      ["aws efs delete-file-system --file-system-id <fs-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "efs", "delete-file-system") && !fsDeToken(c, "efs-temporario")),
  ]);

  // ---------------- ElastiCache ----------------
  at("cache-4", [
    d("fx-ec-dcc1", "elasticache", 2, 70, "Onde a aplicação conecta?",
      "O dev pergunta o endereço do Redis. Descreva só o <b>cache-loja</b>, pedindo as informações dos nós — é ali que está o endpoint.",
      ["O `describe-cache-clusters` aceita o id do cluster.", "Sem `--show-cache-node-info`, o endereço não vem."],
      ["aws elasticache describe-cache-clusters --cache-cluster-id cache-loja --show-cache-node-info"],
      (c, cmd, ok) => ok && ehCmd(cmd, "elasticache", "describe-cache-clusters") && cmd.flags["show-cache-node-info"] !== undefined),
  ]);
  at("cache-5", [
    d("fx-ec-sg2", "elasticache", 2, 80, "O cache dos relatórios mora noutro lugar",
      "O cache do BI vai ficar em sub-redes próprias. Crie o subnet group <b>cache-relatorios</b> (descrição <b>BI</b>) com a <b>subnet-aaa1</b> e a <b>subnet-bbb2</b>.",
      ["Mesmo `create-cache-subnet-group` de antes."],
      ["aws elasticache create-cache-subnet-group --cache-subnet-group-name cache-relatorios --cache-subnet-group-description BI --subnet-ids subnet-aaa1 subnet-bbb2"],
      (c) => !!((ecache(c).subnetGroups || {})["cache-relatorios"])),
    d("fx-ec-dsg1", "elasticache", 2, 60, "Confira só o grupo do BI",
      "Veja só o <b>cache-relatorios</b>, em vez de todos.",
      ["O `describe-cache-subnet-groups` aceita o nome do grupo.", "A flag é `--cache-subnet-group-name`."],
      ["aws elasticache describe-cache-subnet-groups --cache-subnet-group-name cache-relatorios"],
      (c, cmd, ok) => ok && ehCmd(cmd, "elasticache", "describe-cache-subnet-groups") && String(cmd.flags["cache-subnet-group-name"] || "") === "cache-relatorios"),
  ]);
  at("cache-6", [
    d("fx-ec-rg2", "elasticache", 3, 110, "As sessões dos usuários não podem cair",
      "Se o Redis das sessões cair, todo mundo é deslogado. Crie o replication group <b>sessoes-ha</b> (descrição <b>Sessoes</b>) com <b>3</b> nós: um primário e duas réplicas.",
      ["Mesmo `create-replication-group`, com mais nós.", "Duas réplicas aguentam perder uma zona inteira."],
      ["aws elasticache create-replication-group --replication-group-id sessoes-ha --replication-group-description Sessoes --num-cache-clusters 3"],
      (c) => ((ecache(c).grupos || {})["sessoes-ha"] || {}).nos >= 3),
  ]);
  at("cache-7", [
    d("fx-ec-drg1", "elasticache", 3, 70, "As sessões têm failover?",
      "Confira só o <b>sessoes-ha</b>: quantos membros e se o failover automático está ligado.",
      ["O `describe-replication-groups` aceita o id do grupo.", "A flag é `--replication-group-id`."],
      ["aws elasticache describe-replication-groups --replication-group-id sessoes-ha"],
      (c, cmd, ok) => ok && ehCmd(cmd, "elasticache", "describe-replication-groups") && String(cmd.flags["replication-group-id"] || "") === "sessoes-ha"),
  ]);
  at("cache-8", [
    d("fx-ec-snap2", "elasticache", 3, 90, "Backup das sessões antes da manutenção",
      "A AWS vai aplicar uma manutenção no fim de semana. Tire o snapshot <b>backup-sessoes</b> do <b>sessoes-ha</b> antes.",
      ["Mesmo `create-snapshot`, outro grupo."],
      ["aws elasticache create-snapshot --snapshot-name backup-sessoes --replication-group-id sessoes-ha"],
      (c) => !!((ecache(c).snapshots || {})["backup-sessoes"])),
  ]);
  at("cache-9", [
    d("fx-ec-dsnap1", "elasticache", 3, 70, "O backup da loja está pronto?",
      "Veja só o snapshot <b>backup-cache-loja</b> e confirme que ele terminou.",
      ["O `describe-snapshots` aceita o nome do snapshot.", "A flag é `--snapshot-name`."],
      ["aws elasticache describe-snapshots --snapshot-name backup-cache-loja"],
      (c, cmd, ok) => ok && ehCmd(cmd, "elasticache", "describe-snapshots") && String(cmd.flags["snapshot-name"] || "") === "backup-cache-loja"),
  ]);
  at("cache-10", [
    d("fx-ec-ev1", "elasticache", 3, 80, "Só o que aconteceu com os grupos",
      "No meio de tantos eventos, o time quer só os dos <b>replication groups</b> nas últimas 24 horas.",
      ["Mesmo `describe-events`, com um filtro de tipo.", "A flag é `--source-type replication-group` — e a janela continua em minutos."],
      ["aws elasticache describe-events --source-type replication-group --duration 1440"],
      (c, cmd, ok) => ok && ehCmd(cmd, "elasticache", "describe-events") && String(cmd.flags["source-type"] || "") === "replication-group"),
  ]);
  at("cache-3", [
    d("fx-ec-del1", "elasticache", 3, 90, "O cache do teste de carga",
      "O teste de carga deixou o <b>cache-teste</b> (redis, cache.t3.micro, 1 nó) ligado. Crie pra ver o cenário e apague — nó parado é cobrado por hora.",
      ["Criar você já sabe.", "Apagar é o mesmo `delete-cache-cluster`."],
      ["aws elasticache create-cache-cluster --cache-cluster-id cache-teste --engine redis --cache-node-type cache.t3.micro --num-cache-nodes 1",
        "aws elasticache delete-cache-cluster --cache-cluster-id cache-teste"],
      (c, cmd, ok) => ok && ehCmd(cmd, "elasticache", "delete-cache-cluster") && !((ecache(c).clusters || {})["cache-teste"])),
  ]);

  // ---------------- Polly ----------------
  at("pol-3", [
    d("fx-pol-dv1", "polly", 2, 60, "O curso também sai em inglês",
      "O time vai gravar a versão em inglês. Liste as vozes de <b>en-US</b>.",
      ["Mesmo `describe-voices`, outro idioma."],
      ["aws polly describe-voices --language-code en-US"],
      (c, cmd, ok) => ok && ehCmd(cmd, "polly", "describe-voices") && String(cmd.flags["language-code"] || "") === "en-US"),
  ]);
  at("pol-5", [
    d("fx-pol-lx2", "polly", 2, 80, "EC2 não é \"equi dois\"",
      "A narração lê <b>EC2</b> errado. Crie um segundo léxico, <b>siglas-ti</b>, ensinando a ler \"é cê dois\". <small>(o XML segue o mesmo formato do marcas-climb, trocando o grapheme e o alias)</small>",
      ["Mesmo `put-lexicon`, outro nome e outro conteúdo.", "Troque `<grapheme>AWS</grapheme>` por `EC2` e o alias pela leitura certa."],
      ["aws polly put-lexicon --name siglas-ti --content " + LEX_TI],
      (c) => !!lexico(c, "siglas-ti")),
    d("fx-pol-ll1", "polly", 2, 60, "Agora são dois léxicos",
      "Confira que os dois léxicos estão na região.",
      ["Mesmo `list-lexicons` de antes."],
      ["aws polly list-lexicons"],
      (c, cmd, ok) => ok && ehCmd(cmd, "polly", "list-lexicons") && !!lexico(c, "siglas-ti")),
    d("fx-pol-gl1", "polly", 2, 60, "O que o léxico das siglas diz?",
      "Antes de usar na narração, leia o conteúdo do <b>siglas-ti</b>.",
      ["Mesmo `get-lexicon`, outro nome."],
      ["aws polly get-lexicon --name siglas-ti"],
      (c, cmd, ok) => ok && ehCmd(cmd, "polly", "get-lexicon") && String(cmd.flags.name || "") === "siglas-ti"),
  ]);
  at("pol-7", [
    d("fx-pol-st2", "polly", 3, 100, "O capítulo dois, com outra voz",
      "O capítulo dois vai ter narrador masculino. Dispare a síntese assíncrona do texto <b>Capitulo dois: servidores</b> com a voz <b>Ricardo</b>, no mesmo bucket.",
      ["Mesmo `start-speech-synthesis-task`, outro texto e outra voz."],
      ["aws polly start-speech-synthesis-task --text \"Capitulo dois: servidores\" --output-format mp3 --voice-id Ricardo --output-s3-bucket-name narracao-climb"],
      (c) => tarefasPolly(c).some((t) => (t.voz || t.voice || t.vozId) === "Ricardo" || /Ricardo/.test(JSON.stringify(t)))),
  ]);
  at("pol-8", [
    d("fx-pol-lt1", "polly", 3, 70, "Só as que já terminaram",
      "O editor só quer as narrações <b>prontas</b>. Liste as tarefas com status <b>completed</b>.",
      ["O `list-speech-synthesis-tasks` aceita um filtro de status.", "A flag é `--status`."],
      ["aws polly list-speech-synthesis-tasks --status completed"],
      (c, cmd, ok) => ok && ehCmd(cmd, "polly", "list-speech-synthesis-tasks") && String(cmd.flags.status || "") === "completed"),
  ]);
  at("pol-9", [
    d("fx-pol-gt1", "polly", 3, 70, "Só o status, pro script",
      "O script de publicação só precisa saber se a tarefa terminou. Consulte a tarefa trazendo só o <b>TaskStatus</b>.",
      ["Mesmo `get-speech-synthesis-task`, com `--query`.", "O caminho é `SynthesisTask.TaskStatus`."],
      ["aws polly get-speech-synthesis-task --task-id <task-id> --query SynthesisTask.TaskStatus"],
      (c, cmd, ok) => ok && ehCmd(cmd, "polly", "get-speech-synthesis-task") && /TaskStatus/.test(String(cmd.flags.query || ""))),
  ]);
  at("pol-10", [
    d("fx-pol-dl1", "polly", 3, 80, "As siglas viraram padrão da voz",
      "A voz nova já lê as siglas certo sozinha. Apague o léxico <b>siglas-ti</b>.",
      ["Mesmo `delete-lexicon` de antes."],
      ["aws polly delete-lexicon --name siglas-ti"],
      (c, cmd, ok) => ok && ehCmd(cmd, "polly", "delete-lexicon") && !lexico(c, "siglas-ti")),
  ]);

  // ============================================================
  // Leva 9 (25/09): Step Functions, Glue, Cognito, Beanstalk, API Gateway,
  // Budgets, Organizations e Config
  // ============================================================
  const SFN = "arn:aws:states:us-east-1:123456789012:stateMachine:";
  const maquina = (c, n) => (((c.sfn || {}).maquinas) || {})[n];
  const crawler = (c, n) => (((c.glue || {}).crawlers) || {})[n];
  const bancoGlue = (c, n) => (((c.glue || {}).bancos) || {})[n];
  const poolDe = (c, nome) => Object.values(((c.cognito || {}).pools) || {}).find((p) => p.nome === nome);
  const envEb = (c, n) => (((c.eb || {}).envs) || {})[n];
  const appEb = (c, n) => (((c.eb || {}).apps) || {})[n];
  const apiDe = (c, nome) => Object.values(((c.apigateway || {}).apis) || {}).find((a) => a.nome === nome);
  const orcamento = (c, n) => (((c.budgets || {}).orcamentos) || {})[n];
  const contaOrg = (c, nome) => Object.values(((c.org || {}).contas) || {}).find((a) => a.nome === nome);
  const ouDe = (c, nome) => Object.values(((c.org || {}).ous) || {}).find((o) => o.nome === nome);
  const cfgRegra = (c, n) => (((c.config || {}).regras) || {})[n];

  // ---------------- Step Functions ----------------
  // O describe-execution (cob-sfn-1) vinha depois de apagar a máquina.
  mover(["cob-sfn-1"], "sfn-5");
  at("sfn-3", [
    d("fx-sfn-lsm1", "stepfunctions", 2, 60, "Qual é o ARN do fluxo?",
      "Todo comando daqui pra frente pede o ARN da máquina, não o nome. Liste as máquinas e ache o da <b>pedido-fluxo</b>.",
      ["Mesmo comando do começo da trilha."],
      ["aws stepfunctions list-state-machines"],
      (c, cmd, ok) => ok && ehCmd(cmd, "stepfunctions", "list-state-machines") && !!maquina(c, "pedido-fluxo")),
    d("fx-sfn-dsm1", "stepfunctions", 2, 60, "Com que permissão o fluxo roda?",
      "A segurança quer saber qual role o fluxo usa pra chamar os outros serviços. Descreva a máquina trazendo só o <b>roleArn</b>.",
      ["Mesmo `describe-state-machine`, com `--query`.", "O campo é `roleArn`."],
      ["aws stepfunctions describe-state-machine --state-machine-arn " + SFN + "pedido-fluxo --query roleArn"],
      (c, cmd, ok) => ok && ehCmd(cmd, "stepfunctions", "describe-state-machine") && /roleArn/.test(String(cmd.flags.query || ""))),
  ]);
  at("sfn-5", [
    d("fx-sfn-le1", "stepfunctions", 3, 70, "Só as que deram certo",
      "O relatório diário conta só as execuções que <b>terminaram com sucesso</b>. Liste as execuções da <b>pedido-fluxo</b> filtrando por status.",
      ["O `list-executions` aceita um filtro de status.", "A flag é `--status-filter SUCCEEDED`."],
      ["aws stepfunctions list-executions --state-machine-arn " + SFN + "pedido-fluxo --status-filter SUCCEEDED"],
      (c, cmd, ok) => ok && ehCmd(cmd, "stepfunctions", "list-executions") && String(cmd.flags["status-filter"] || "") === "SUCCEEDED"),
  ]);
  at("cob-sfn-1", [
    d("fx-sfn-de1", "stepfunctions", 3, 70, "Só o status do chamado",
      "O painel do suporte precisa só do status da execução <b>chamado-1</b>.",
      ["Mesmo `describe-execution`, com `--query status`."],
      ["aws stepfunctions describe-execution --execution-arn arn:aws:states:us-east-1:123456789012:execution:fluxo-suporte:chamado-1 --query status"],
      (c, cmd, ok) => ok && ehCmd(cmd, "stepfunctions", "describe-execution") && /status/.test(String(cmd.flags.query || ""))),
  ]);
  at("sfn-6", [
    d("fx-sfn-del1", "stepfunctions", 3, 80, "O fluxo do suporte também sai",
      "O suporte migrou pra outra ferramenta. Apague a máquina <b>fluxo-suporte</b>.",
      ["Mesmo `delete-state-machine`, outro ARN."],
      ["aws stepfunctions delete-state-machine --state-machine-arn " + SFN + "fluxo-suporte"],
      (c, cmd, ok) => ok && ehCmd(cmd, "stepfunctions", "delete-state-machine") && !maquina(c, "fluxo-suporte")),
  ]);

  // ---------------- Glue ----------------
  at("glue-4", [
    d("fx-glue-gt1", "glue", 2, 60, "Só as tabelas de vendas",
      "O catálogo vai ter dezenas de tabelas. Liste só as que começam com <b>vend</b>.",
      ["O `get-tables` aceita `--expression`, que é uma expressão regular sobre o nome.", "Pra \"começa com vend\", a expressão é `vend.*`."],
      ["aws glue get-tables --database-name dados_loja --expression vend.*"],
      (c, cmd, ok) => ok && ehCmd(cmd, "glue", "get-tables") && cmd.flags.expression !== undefined),
  ]);
  at("glue-5", [
    d("fx-glue-cc1", "glue", 3, 100, "O robô dos clientes",
      "Os dados de clientes estão em <b>s3://dados-loja-climb/clientes/</b>. Crie o crawler <b>crawler-clientes</b> apontando pra lá, no mesmo banco e com a mesma role.",
      ["Mesmo `create-crawler`, outro nome e outro caminho."],
      ["aws glue create-crawler --name crawler-clientes --role arn:aws:iam::123456789012:role/papel-glue --database-name dados_loja --targets '{\"S3Targets\":[{\"Path\":\"s3://dados-loja-climb/clientes/\"}]}'"],
      (c) => !!crawler(c, "crawler-clientes")),
  ]);
  at("glue-6", [
    d("fx-glue-sc1", "glue", 3, 70, "Solte o robô dos clientes",
      "Rode o <b>crawler-clientes</b> pra ele descobrir as colunas.",
      ["Mesmo `start-crawler`, outro nome."],
      ["aws glue start-crawler --name crawler-clientes"],
      (c) => ((crawler(c, "crawler-clientes") || {}).execucoes || 0) > 0),
  ]);
  at("cob-glue-1", [
    d("fx-glue-gc1", "glue", 3, 70, "O robô dos clientes já terminou?",
      "O script da madrugada só segue quando o crawler parou. Veja só o <b>estado</b> do <b>crawler-clientes</b>.",
      ["Mesmo `get-crawler`, com `--query`.", "O caminho é `Crawler.State`."],
      ["aws glue get-crawler --name crawler-clientes --query Crawler.State"],
      (c, cmd, ok) => ok && ehCmd(cmd, "glue", "get-crawler") && String(cmd.flags.name || "") === "crawler-clientes"),
  ]);
  at("cob-glue-2", [
    d("fx-glue-dd1", "glue", 3, 90, "O rascunho do catálogo",
      "Alguém criou o banco <b>catalogo_rascunho</b> pra testar um esquema. Crie pra ver o cenário e apague — os arquivos no S3 não são tocados.",
      ["Criar e apagar banco você fez na atividade anterior."],
      ["aws glue create-database --database-input '{\"Name\":\"catalogo_rascunho\"}'",
        "aws glue delete-database --name catalogo_rascunho"],
      (c, cmd, ok) => ok && ehCmd(cmd, "glue", "delete-database") && !bancoGlue(c, "catalogo_rascunho")),
  ]);

  // ---------------- Cognito ----------------
  at("cog-3", [
    d("fx-cog-lp1", "cognito-idp", 2, 60, "Qual é o Id do pool?",
      "O front-end pede o Id do pool (formato us-east-1_...). Liste os pools e ache o do <b>usuarios-loja</b>.",
      ["Mesmo comando do começo da trilha — e não esqueça o `--max-results`, que é obrigatório."],
      ["aws cognito-idp list-user-pools --max-results 10"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cognito-idp", "list-user-pools") && !!poolDe(c, "usuarios-loja")),
    d("fx-cog-dp1", "cognito-idp", 2, 70, "Qual é a regra de senha?",
      "O time de produto quer saber o tamanho mínimo de senha que o pool exige. Descreva o pool trazendo só as políticas.",
      ["Mesmo `describe-user-pool`, com `--query`.", "O caminho é `UserPool.Policies`."],
      ["aws cognito-idp describe-user-pool --user-pool-id <pool-id> --query UserPool.Policies"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cognito-idp", "describe-user-pool") && /Policies/.test(String(cmd.flags.query || ""))),
  ]);
  at("cog-6", [
    d("fx-cog-lu1", "cognito-idp", 3, 70, "A Maria já trocou a senha?",
      "O suporte recebeu um chamado da Maria. Liste só ela, filtrando pelo nome de usuário, e veja o <b>UserStatus</b>.",
      ["O `list-users` aceita `--filter`.", "A forma é `--filter 'username = \"maria\"'` (com aspas simples por fora)."],
      ["aws cognito-idp list-users --user-pool-id <pool-id> --filter 'username = \"maria\"'"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cognito-idp", "list-users") && /maria/.test(String(cmd.flags.filter || ""))),
  ]);
  at("cob-cog-1", [
    d("fx-cog-adu1", "cognito-idp", 3, 90, "O cadastro duplicado",
      "O Carlos se cadastrou duas vezes no pool de suporte. Crie o usuário <b>carlos</b> no <b>pool-suporte</b> pra ver o cenário e remova.",
      ["Criar é o `admin-create-user`; remover é o comando da atividade anterior."],
      ["aws cognito-idp admin-create-user --user-pool-id <pool-id> --username carlos",
        "aws cognito-idp admin-delete-user --user-pool-id <pool-id> --username carlos"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cognito-idp", "admin-delete-user") && !!poolDe(c, "pool-suporte") && !((poolDe(c, "pool-suporte") || {}).usuarios || {}).carlos),
    d("fx-cog-dup1", "cognito-idp", 3, 80, "O pool de suporte foi desativado",
      "O suporte passou a usar o login da empresa. Apague o <b>pool-suporte</b> — e lembre que vão junto todos os usuários dele.",
      ["Mesmo `delete-user-pool` de antes."],
      ["aws cognito-idp delete-user-pool --user-pool-id <pool-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cognito-idp", "delete-user-pool") && !poolDe(c, "pool-suporte")),
  ]);

  // ---------------- Elastic Beanstalk ----------------
  at("bs-3", [
    d("fx-bs-da1", "elasticbeanstalk", 2, 60, "A aplicação foi registrada?",
      "Confira só a aplicação <b>loja-app</b>, em vez de todas.",
      ["O `describe-applications` aceita os nomes.", "A flag é `--application-names`."],
      ["aws elasticbeanstalk describe-applications --application-names loja-app"],
      (c, cmd, ok) => ok && ehCmd(cmd, "elasticbeanstalk", "describe-applications") && /loja-app/.test(String(cmd.flags["application-names"] || ""))),
  ]);
  at("bs-4", [
    d("fx-bs-de1", "elasticbeanstalk", 2, 60, "Só o ambiente de produção",
      "Veja só o <b>loja-prod</b> e pegue o CNAME — é o endereço que vai pro DNS.",
      ["O `describe-environments` aceita `--environment-names`."],
      ["aws elasticbeanstalk describe-environments --environment-names loja-prod"],
      (c, cmd, ok) => ok && ehCmd(cmd, "elasticbeanstalk", "describe-environments") && /loja-prod/.test(String(cmd.flags["environment-names"] || ""))),
    d("fx-bs-env2", "elasticbeanstalk", 2, 90, "Um ambiente de homologação",
      "Antes de ir pra produção, o time quer testar numa cópia. Crie o ambiente <b>loja-homolog</b> na mesma aplicação, com a mesma plataforma.",
      ["Mesmo `create-environment` do loja-prod, outro nome."],
      ["aws elasticbeanstalk create-environment --application-name loja-app --environment-name loja-homolog --solution-stack-name \"64bit Amazon Linux 2023 v4.0.0 running Python 3.12\""],
      (c) => !!envEb(c, "loja-homolog")),
    d("fx-bs-te1", "elasticbeanstalk", 3, 90, "A homologação acabou",
      "O teste passou. <b>Encerre</b> o ambiente <b>loja-homolog</b> — ele leva junto as máquinas, o balanceador e o Auto Scaling dele.",
      ["Encerrar ambiente é o `terminate-environment`.", "A aplicação continua: só o ambiente sai."],
      ["aws elasticbeanstalk terminate-environment --environment-name loja-homolog"],
      (c, cmd, ok) => ok && ehCmd(cmd, "elasticbeanstalk", "terminate-environment") && String(cmd.flags["environment-name"] || "") === "loja-homolog" && (!envEb(c, "loja-homolog") || /Terminat/.test(String((envEb(c, "loja-homolog") || {}).status)))),
  ]);
  at("bs-5", [
    d("fx-bs-del1", "elasticbeanstalk", 3, 80, "A aplicação de teste",
      "Sobrou a aplicação <b>loja-app-teste</b>, sem nenhum ambiente. Crie pra ver o cenário e apague.",
      ["Criar é o `create-application`; sem ambiente vivo, o `delete-application` passa direto."],
      ["aws elasticbeanstalk create-application --application-name loja-app-teste",
        "aws elasticbeanstalk delete-application --application-name loja-app-teste"],
      (c, cmd, ok) => ok && ehCmd(cmd, "elasticbeanstalk", "delete-application") && !appEb(c, "loja-app-teste")),
  ]);

  // ---------------- API Gateway ----------------
  at("apigw-3", [
    d("fx-apigw-gra1", "apigateway", 2, 60, "Qual é o id da API?",
      "Todo comando do API Gateway pede o id da API. Liste as APIs trazendo só os nomes e ids.",
      ["Mesmo `get-rest-apis` do começo da trilha."],
      ["aws apigateway get-rest-apis"],
      (c, cmd, ok) => ok && ehCmd(cmd, "apigateway", "get-rest-apis") && !!apiDe(c, "api-loja")),
  ]);
  at("apigw-4", [
    d("fx-apigw-gr1", "apigateway", 2, 70, "O /pedidos entrou?",
      "Confira que o caminho <b>/pedidos</b> aparece nos recursos da API.",
      ["Mesmo `get-resources` de antes: agora vem a raiz e o /pedidos."],
      ["aws apigateway get-resources --rest-api-id <api-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "apigateway", "get-resources") && Object.values((apiDe(c, "api-loja") || {}).recursos || {}).some((r) => r.parte === "pedidos")),
  ]);
  at("cob-apigw-1", [
    d("fx-apigw-gs1", "apigateway", 3, 90, "Um ambiente pra homologar",
      "Publique a mesma API no stage <b>homolog</b> e liste os stages — agora são dois, cada um com a sua URL.",
      ["Publicar é o `create-deployment` com outro `--stage-name`.", "Depois, o `get-stages` da atividade anterior."],
      ["aws apigateway create-deployment --rest-api-id <api-id> --stage-name homolog",
        "aws apigateway get-stages --rest-api-id <api-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "apigateway", "get-stages") && !!(((apiDe(c, "api-suporte") || {}).estagios) || {}).homolog),
    d("fx-apigw-del1", "apigateway", 3, 80, "A API do suporte sai do ar",
      "O suporte vai usar outra ferramenta. Apague a <b>api-suporte</b> — os dois stages vão junto.",
      ["Mesmo `delete-rest-api` de antes."],
      ["aws apigateway delete-rest-api --rest-api-id <api-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "apigateway", "delete-rest-api") && !apiDe(c, "api-suporte")),
  ]);

  // ---------------- Budgets ----------------
  at("bud-3", [
    d("fx-bud-cn1", "budgets", 2, 80, "Avise antes de estourar",
      "O alerta de 80% avisa depois que o gasto aconteceu. Crie um segundo alerta no <b>orcamento-mensal</b>, do tipo <b>FORECASTED</b> em <b>100%</b>: a AWS avisa quando a PREVISÃO do mês passar do teto, pro <b>financeiro@exemplo.com</b>.",
      ["Mesmo `create-notification`, com outro tipo e outro limite.", "O tipo que olha pra previsão é `FORECASTED`."],
      ["aws budgets create-notification --account-id 123456789012 --budget-name orcamento-mensal --notification '{\"NotificationType\":\"FORECASTED\",\"ComparisonOperator\":\"GREATER_THAN\",\"Threshold\":100,\"ThresholdType\":\"PERCENTAGE\"}' --subscribers '[{\"SubscriptionType\":\"EMAIL\",\"Address\":\"financeiro@exemplo.com\"}]'"],
      (c, cmd, ok) => ok && ehCmd(cmd, "budgets", "create-notification") && /FORECASTED/.test(String(cmd.flags.notification || ""))),
    d("fx-bud-db1", "budgets", 2, 60, "O orçamento aparece na lista?",
      "Confira que o <b>orcamento-mensal</b> está na lista de orçamentos da conta.",
      ["Mesmo `describe-budgets` do começo — ele pede a conta."],
      ["aws budgets describe-budgets --account-id 123456789012"],
      (c, cmd, ok) => ok && ehCmd(cmd, "budgets", "describe-budgets") && !!orcamento(c, "orcamento-mensal")),
  ]);
  at("cob-bud-1", [
    d("fx-bud-dsc1", "budgets", 2, 70, "Qual é o teto mesmo?",
      "O financeiro quer só o valor do teto do <b>orcamento-mensal</b>, sem o resto.",
      ["Mesmo `describe-budget`, com `--query`.", "O caminho é `Budget.BudgetLimit`."],
      ["aws budgets describe-budget --account-id 123456789012 --budget-name orcamento-mensal --query Budget.BudgetLimit"],
      (c, cmd, ok) => ok && ehCmd(cmd, "budgets", "describe-budget") && /BudgetLimit/.test(String(cmd.flags.query || ""))),
    d("fx-bud-del1", "budgets", 3, 80, "O orçamento foi trocado por um anual",
      "O financeiro passou a controlar por ano. Apague o <b>orcamento-mensal</b> de novo.",
      ["Mesmo `delete-budget` de antes."],
      ["aws budgets delete-budget --account-id 123456789012 --budget-name orcamento-mensal"],
      (c, cmd, ok) => ok && ehCmd(cmd, "budgets", "delete-budget") && !orcamento(c, "orcamento-mensal")),
  ]);

  // ---------------- Organizations ----------------
  at("org-3", [
    d("fx-org-ca1", "organizations", 2, 90, "Uma conta só pra segurança",
      "Boa prática: logs e ferramentas de segurança numa conta separada, que ninguém do dia a dia mexe. Crie a conta <b>time-seguranca</b> com o e-mail <b>seguranca+aws@exemplo.com</b>.",
      ["Mesmo `create-account`, outro nome e outro e-mail — o e-mail precisa ser único."],
      ["aws organizations create-account --account-name time-seguranca --email seguranca+aws@exemplo.com"],
      (c) => !!contaOrg(c, "time-seguranca")),
  ]);
  at("org-4", [
    d("fx-org-ou1", "organizations", 3, 80, "Uma pasta pro desenvolvimento",
      "As contas de desenvolvimento têm regras mais soltas que as de produção. Crie a OU <b>Desenvolvimento</b> na raiz.",
      ["Mesmo `create-organizational-unit`, outro nome."],
      ["aws organizations create-organizational-unit --name Desenvolvimento --parent-id r-root"],
      (c) => !!ouDe(c, "Desenvolvimento")),
  ]);
  at("cob-org-1", [
    d("fx-org-do1", "organizations", 3, 70, "Qual é a conta mãe?",
      "A auditoria pede só o id da conta que paga a fatura (a management account).",
      ["Mesmo `describe-organization`, com `--query`.", "O caminho é `Organization.MasterAccountId`."],
      ["aws organizations describe-organization --query Organization.MasterAccountId"],
      (c, cmd, ok) => ok && ehCmd(cmd, "organizations", "describe-organization") && /MasterAccountId/.test(String(cmd.flags.query || ""))),
  ]);

  // ---------------- Config ----------------
  at("cfg-3", [
    d("fx-cfg-pr1", "configservice", 3, 80, "A role do gravador foi trocada",
      "A segurança criou a role <b>config-role-v2</b> com menos permissão. Atualize o gravador <b>default</b> pra usar ela.",
      ["O `put-configuration-recorder` cria e também ATUALIZA — mesmo nome, outra role."],
      ["aws configservice put-configuration-recorder --configuration-recorder name=default,roleARN=arn:aws:iam::123456789012:role/config-role-v2"],
      (c, cmd, ok) => ok && ehCmd(cmd, "configservice", "put-configuration-recorder") && /config-role-v2/.test(String(cmd.flags["configuration-recorder"] || ""))),
  ]);
  at("cob-cfg-1", [
    d("fx-cfg-st1", "configservice", 3, 80, "Janela de manutenção",
      "A conta de laboratório vai ficar parada no feriado e o Config cobra por item gravado. <b>Pare</b> a gravação do <b>default</b>.",
      ["O par do start é o `stop-configuration-recorder`, com o mesmo `--configuration-recorder-name`."],
      ["aws configservice stop-configuration-recorder --configuration-recorder-name default"],
      (c, cmd, ok) => ok && ehCmd(cmd, "configservice", "stop-configuration-recorder") && !!(c.config || {}).recorder && !(c.config || {}).gravando),
    d("fx-cfg-start2", "configservice", 3, 80, "Feriado acabou",
      "O time voltou. Ligue a gravação de novo.",
      ["Mesmo `start-configuration-recorder` do começo da trilha."],
      ["aws configservice start-configuration-recorder --configuration-recorder-name default"],
      (c, cmd, ok) => ok && ehCmd(cmd, "configservice", "start-configuration-recorder") && !!(c.config || {}).gravando),
    d("fx-cfg-rs1", "configservice", 3, 70, "Voltou a gravar mesmo?",
      "Confira o status só do gravador <b>default</b>: <code>recording</code> tem que estar true.",
      ["Mesmo `describe-configuration-recorder-status`, com o nome.", "A flag é `--configuration-recorder-names`."],
      ["aws configservice describe-configuration-recorder-status --configuration-recorder-names default"],
      (c, cmd, ok) => ok && ehCmd(cmd, "configservice", "describe-configuration-recorder-status") && String(cmd.flags["configuration-recorder-names"] || "") === "default"),
  ]);
  at("cob-cfg-2", [
    d("fx-cfg-dr1", "configservice", 3, 70, "Só a regra de criptografia",
      "O auditor quer ver só a regra <b>s3-encriptado</b>.",
      ["O `describe-config-rules` aceita os nomes.", "A flag é `--config-rule-names`."],
      ["aws configservice describe-config-rules --config-rule-names s3-encriptado"],
      (c, cmd, ok) => ok && ehCmd(cmd, "configservice", "describe-config-rules") && /s3-encriptado/.test(String(cmd.flags["config-rule-names"] || "")) && !!cfgRegra(c, "s3-encriptado")),
    d("fx-cfg-st2", "configservice", 3, 80, "A conta de sandbox vai ser encerrada",
      "Esta conta de sandbox vai ser fechada no fim do mês e ninguém mais usa. Pare a gravação pra não pagar por item gravado até lá.",
      ["Mesmo `stop-configuration-recorder` da janela de manutenção."],
      ["aws configservice stop-configuration-recorder --configuration-recorder-name default"],
      (c, cmd, ok) => ok && ehCmd(cmd, "configservice", "stop-configuration-recorder") && !!(c.config || {}).recorder && !(c.config || {}).gravando),
  ]);
})();
