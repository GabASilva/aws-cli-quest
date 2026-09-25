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
})();
