"use strict";
// ============================================================
// CLImb — cobertura-2.js
// LEVA 2 do levantamento de cobertura (ver cobertura-1.js): os comandos que
// faltavam nas famílias MAIORES — rede/VPC, auditoria de IAM, KMS, Lambda,
// s3api — e o resto espalhado.
//
// Aqui não é só "usar o comando que faltava": vários fecham buracos de
// conceito que a trilha deixava aberto. Os principais:
//   - a família de ROTEAMENTO da VPC (tabela de rotas, associação, NACL):
//     a trilha ensinava a criar rede e nunca a fazer o pacote SAIR dela
//   - AUDITORIA de IAM: a trilha ensinava a conceder e nunca a CONFERIR
//     quem tem o quê — que é metade do trabalho de segurança
//   - s3api create-bucket contra s3 mb: o mesmo bucket por dois caminhos
//
// CUIDADO DE ESTADO: conta compartilhada no smoke test e várias trilhas
// terminam apagando o recurso — quem precisa de algo, cria na própria solução.
// ============================================================
(function () {
  if (typeof DESAFIOS === "undefined" || typeof SERVICOS === "undefined") return;

  const A = [
    // ===================== VPC / rede (aws ec2) =====================
    { id: "cob-vpc-1", servico: "vpc", nivel: 3, xp: 110, titulo: "A tabela que decide para onde o pacote vai",
      descricao: "Uma sub-rede sozinha não leva ninguém a lugar nenhum: quem decide o caminho é a <b>tabela de rotas</b>. Crie uma tabela de rotas na sua VPC.",
      dicas: ["Criar recurso é sempre `create-…`. Ele só precisa saber em qual VPC a tabela vai viver.", "A forma do comando é: aws ec2 create-route-table --vpc-id <id-da-vpc>"],
      solucao: ["aws ec2 create-route-table --vpc-id <vpc-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "create-route-table") },

    { id: "cob-vpc-2", servico: "vpc", nivel: 3, xp: 120, titulo: "Ligue a tabela na sub-rede",
      descricao: "A tabela existe, mas ninguém a usa: falta <b>associá-la</b> a uma sub-rede. <small>(sem associação explícita, a sub-rede usa a tabela PRINCIPAL da VPC — origem de metade dos \"por que não sai internet?\")</small>",
      dicas: ["`associate-…` liga um recurso a outro. Ele precisa dos dois ids: o da tabela e o da sub-rede.", "A forma do comando é: aws ec2 associate-route-table --route-table-id <id> --subnet-id <id>"],
      solucao: ["aws ec2 associate-route-table --route-table-id <rtb-novo> --subnet-id <subnet-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "associate-route-table") },

    { id: "cob-vpc-3", servico: "vpc", nivel: 2, xp: 90, titulo: "Cadê a porta para a internet?",
      descricao: "Liste os <b>internet gateways</b> e veja a qual VPC cada um está conectado (o campo <b>Attachments</b>). É a primeira coisa a conferir quando nada sai para fora.",
      dicas: ["`describe-…` mostra os detalhes/estado. Este não precisa de parâmetro.", "Repare no Attachments: um gateway existir não significa que ele está preso na SUA VPC."],
      solucao: ["aws ec2 describe-internet-gateways"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-internet-gateways") },

    { id: "cob-vpc-4", servico: "diagnostico", nivel: 3, xp: 130, titulo: "Feche uma porta na network ACL",
      descricao: "A <b>network ACL</b> é o firewall da SUB-REDE. Crie uma regra de <b>entrada</b> número <b>90</b> que <b>nega</b> a porta <b>23</b> (telnet) vinda de qualquer lugar. <small>(vale a regra de MENOR número que casar)</small>",
      dicas: ["Criar é `create-…`. A regra precisa de: qual ACL, o número, o protocolo, a faixa de portas, de onde vem, se permite ou nega, e se é entrada ou saída.", "A forma é: aws ec2 create-network-acl-entry --network-acl-id <id> --rule-number <n> --protocol tcp --port-range From=<p>,To=<p> --cidr-block 0.0.0.0/0 --rule-action deny --ingress"],
      solucao: ["aws ec2 create-network-acl-entry --network-acl-id <acl-id> --rule-number 90 --protocol tcp --port-range From=23,To=23 --cidr-block 0.0.0.0/0 --rule-action deny --ingress"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "create-network-acl-entry") },

    { id: "cob-vpc-5", servico: "vpc", nivel: 3, xp: 100, titulo: "Qual máquina é aquele IP do log?",
      descricao: "Os flow logs mostram <b>eni-…</b>, não o nome da máquina. Liste as <b>interfaces de rede</b> — é assim que se liga uma linha de log à instância que recebeu a conexão.",
      dicas: ["`describe-…` mostra os detalhes. A interface de rede é o \"cabo\" da instância.", "Este comando não precisa de parâmetro: aws ec2 describe-network-interfaces"],
      solucao: ["aws ec2 describe-network-interfaces"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-network-interfaces") },

    { id: "cob-vpc-6", servico: "vpc", nivel: 3, xp: 110, titulo: "Remova a rota de saída",
      descricao: "Para isolar uma sub-rede (ou testar uma hipótese num diagnóstico), <b>remova a rota</b> <b>0.0.0.0/0</b> da tabela. <small>(a rota \"local\" nunca sai — ela é o que faz a VPC conversar consigo mesma)</small>",
      dicas: ["Apagar é `delete-…`. Aqui você diz de qual tabela e qual destino quer remover.", "A forma é: aws ec2 delete-route --route-table-id <id> --destination-cidr-block <faixa>"],
      solucao: [
        "aws ec2 create-route --route-table-id <rtb-novo> --gateway-id <igw-id> --destination-cidr-block 0.0.0.0/0",
        "aws ec2 delete-route --route-table-id <rtb-novo> --destination-cidr-block 0.0.0.0/0",
      ],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-route") },

    { id: "cob-vpc-7", servico: "diagnostico", nivel: 2, xp: 90, titulo: "Pare de gravar o tráfego",
      descricao: "Os flow logs cobram por volume ingerido. <b>Apague</b> o flow log. <small>(o que já foi entregue no S3 continua lá — isso só para de gravar dali pra frente)</small>",
      dicas: ["Apagar é `delete-…`, e o nome do comando está no plural.", "A forma é: aws ec2 delete-flow-logs --flow-log-ids <id>"],
      solucao: ["aws ec2 delete-flow-logs --flow-log-ids <flowlog-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-flow-logs") },

    { id: "cob-ec2-1", servico: "ec2", nivel: 2, xp: 80, titulo: "Quais modelos de máquina eu tenho?",
      descricao: "O <b>launch template</b> guarda a receita da instância (imagem, tipo, chave) pra o Auto Scaling repetir. Liste os <b>modelos</b> da conta.",
      dicas: ["`describe-…` mostra o que existe. Este não precisa de parâmetro.", "É o mesmo modelo que o Auto Scaling usa pra saber COMO subir cada máquina nova."],
      solucao: ["aws ec2 describe-launch-templates"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-launch-templates") },

    // ===================== IAM — auditoria =====================
    { id: "cob-iam-1", servico: "iam", nivel: 2, xp: 90, titulo: "Quem está neste grupo?",
      descricao: "Conceder acesso por grupo só é seguro se você souber <b>quem está dentro</b>. Veja os detalhes do grupo <b>analistas</b> e seus membros.",
      dicas: ["`get-…` traz os detalhes de UM item — aqui, do grupo (com a lista de usuários).", "A forma é: aws iam get-group --group-name <nome>"],
      solucao: ["aws iam get-group --group-name analistas"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "iam", "get-group") },

    { id: "cob-iam-2", servico: "iam", nivel: 3, xp: 110, titulo: "O que esta pessoa pode fazer?",
      // A versão anterior listava a usuária "helena", que só é criada em
      // missoes.js — trilha "Treino relâmpago", que vem DEPOIS do IAM. Quem
      // fazia a trilha na ordem batia num NoSuchEntity. Agora a atividade cria
      // o que precisa, como as autossuficientes do cobertura-3.js.
      descricao: "A pergunta que toda auditoria faz. Crie a usuária <b>auditoria-tmp</b>, dê a ela uma política e liste as <b>políticas anexadas</b> a ela. <small>(atenção: isso mostra só as <b>diretas</b> — o que vem por GRUPO não aparece aqui, e é aí que auditoria costuma se enganar)</small>",
      dicas: ["Três passos: criar a usuária, anexar a política, listar. `list-…` lista.", "A forma do último é: aws iam list-attached-user-policies --user-name <nome>"],
      solucao: [
        "aws iam create-user --user-name auditoria-tmp",
        "aws iam attach-user-policy --user-name auditoria-tmp --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
        "aws iam list-attached-user-policies --user-name auditoria-tmp",
      ],
      validar: (c, cmd, ok) => {
        const u = c.iam.usuarios["auditoria-tmp"];
        return ok && ehCmd(cmd, "iam", "list-attached-user-policies") &&
               !!u && (u.politicas || []).some((a) => a.includes("AmazonS3ReadOnlyAccess"));
      } },

    { id: "cob-iam-3", servico: "iam", nivel: 3, xp: 100, titulo: "Que versões esta política teve?",
      descricao: "Política guarda histórico. Liste as <b>versões</b> da <b>lab_policy</b> e repare qual está marcada como padrão. <small>(é assim que você descobre desde quando uma permissão existe)</small>",
      dicas: ["`list-…` lista as versões. Ele precisa do ARN da política, não do nome.", "A forma é: aws iam list-policy-versions --policy-arn arn:aws:iam::<conta>:policy/<nome>"],
      solucao: ["aws iam list-policy-versions --policy-arn arn:aws:iam::123456789012:policy/lab_policy"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "iam", "list-policy-versions") },

    { id: "cob-iam-4", servico: "iam", nivel: 3, xp: 110, titulo: "Revogue a permissão do grupo",
      descricao: "Tirar a permissão do <b>grupo</b> atinge todos os membros de uma vez. <b>Desanexe</b> a política <b>AmazonS3ReadOnlyAccess</b> do grupo <b>analistas</b>.",
      dicas: ["`detach-…` é o oposto de attach. Precisa do grupo e do ARN da política.", "A forma é: aws iam detach-group-policy --group-name <nome> --policy-arn arn:aws:iam::aws:policy/<politica>"],
      solucao: ["aws iam detach-group-policy --group-name analistas --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "iam", "detach-group-policy") },

    { id: "cob-iam-5", servico: "iam", nivel: 3, xp: 110, titulo: "Tire o poder da role",
      descricao: "Uma role com permissão demais é um risco silencioso — quem a assume herda tudo. <b>Desanexe</b> a <b>AmazonS3ReadOnlyAccess</b> da role <b>papel-ec2</b>.",
      dicas: ["`detach-…` também vale pra role; muda só o parâmetro que identifica quem perde a permissão.", "A forma é: aws iam detach-role-policy --role-name <nome> --policy-arn <arn>"],
      solucao: ["aws iam detach-role-policy --role-name papel-ec2 --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "iam", "detach-role-policy") },

    // ===================== KMS =====================
    { id: "cob-kms-1", servico: "kms", nivel: 2, xp: 90, titulo: "Esta chave é gerenciada por quem?",
      descricao: "Veja os <b>detalhes</b> da sua chave: estado, se é sua ou da AWS, e para que serve. <small>(chave da AWS você não controla; a sua, sim — e é a diferença que a prova cobra)</small>",
      dicas: ["`describe-…` mostra os detalhes de um recurso específico.", "A forma é: aws kms describe-key --key-id <id-da-chave>"],
      solucao: ["aws kms describe-key --key-id <key-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "kms", "describe-key") },

    { id: "cob-kms-2", servico: "kms", nivel: 2, xp: 80, titulo: "Os apelidos das chaves",
      descricao: "Ninguém decora id de chave. Liste os <b>aliases</b> — é por eles que se referencia a chave no dia a dia.",
      dicas: ["Pra ver o que existe, o verbo costuma ser `list-…`. Este não precisa de parâmetro.", "Repare que a AWS já traz vários alias/aws/… prontos, um por serviço."],
      solucao: ["aws kms list-aliases"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "kms", "list-aliases") },

    { id: "cob-kms-3", servico: "kms", nivel: 3, xp: 100, titulo: "A chave está girando sozinha?",
      descricao: "Rotação automática troca o material da chave todo ano, sem você fazer nada — e é exigência de várias auditorias. Verifique o <b>status de rotação</b>.",
      dicas: ["`get-…` busca um dado específico. O nome do comando fala em \"key rotation status\".", "A forma é: aws kms get-key-rotation-status --key-id <id>"],
      solucao: ["aws kms get-key-rotation-status --key-id <key-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "kms", "get-key-rotation-status") },

    { id: "cob-kms-4", servico: "kms", nivel: 3, xp: 110, titulo: "Desabilite a chave (e entenda o susto)",
      descricao: "<b>Desabilite</b> a chave. Enquanto ela estiver desabilitada, <b>nada que foi cifrado com ela pode ser lido</b> — é reversível, mas derruba tudo que depende dela.",
      dicas: ["`disable-…` desliga sem apagar. Só precisa saber qual chave.", "A forma é: aws kms disable-key --key-id <id>"],
      solucao: ["aws kms disable-key --key-id <key-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "kms", "disable-key") },

    // ===================== s3api =====================
    { id: "cob-s3-1", servico: "s3", nivel: 2, xp: 90, titulo: "O mesmo bucket, pelo caminho de baixo",
      descricao: "O <b>s3 mb</b> é o atalho amigável; o <b>s3api create-bucket</b> é a API crua — mais verbosa, porém com todas as opções. Crie o bucket <b>bucket-via-api</b> por esse caminho.",
      dicas: ["Criar é `create-…`. Aqui o bucket não vai como s3://…, vai num parâmetro nomeado.", "A forma é: aws s3api create-bucket --bucket <nome>"],
      solucao: ["aws s3api create-bucket --bucket bucket-via-api"],
      validar: (c) => !!c.s3.buckets["bucket-via-api"] },

    { id: "cob-s3-2", servico: "s3", nivel: 2, xp: 90, titulo: "O versionamento está mesmo ligado?",
      descricao: "Ligar o versionamento e não conferir é pedir para descobrir tarde demais. Verifique o <b>status de versionamento</b> do <b>meu-primeiro-bucket</b>.",
      dicas: ["`get-…` busca a configuração atual. É o par do put-bucket-versioning que você já usou.", "A forma é: aws s3api get-bucket-versioning --bucket <nome>"],
      solucao: ["aws s3api get-bucket-versioning --bucket meu-primeiro-bucket"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "s3api", "get-bucket-versioning") },

    { id: "cob-s3-3", servico: "s3", nivel: 3, xp: 100, titulo: "Quem tem acesso a este bucket?",
      descricao: "A política de bucket é o que pode deixar seus arquivos <b>públicos</b> sem você perceber. Leia a <b>política</b> do <b>meu-primeiro-bucket</b>.",
      dicas: ["`get-…` busca a configuração. É o par do put-bucket-policy.", "A forma é: aws s3api get-bucket-policy --bucket <nome>"],
      solucao: ["aws s3api get-bucket-policy --bucket meu-primeiro-bucket"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "s3api", "get-bucket-policy") },

    // ===================== Lambda =====================
    { id: "cob-lam-1", servico: "lambda", nivel: 2, xp: 80, titulo: "Quais versões existem?",
      descricao: "Antes de fazer rollback você precisa saber <b>para onde voltar</b>. Liste as versões da <b>processa-pedido</b>.",
      dicas: ["`list-…` lista. O nome do comando fala em \"versions by function\".", "A forma é: aws lambda list-versions-by-function --function-name <nome>"],
      solucao: ["aws lambda list-versions-by-function --function-name processa-pedido"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "lambda", "list-versions-by-function") },

    { id: "cob-lam-2", servico: "lambda", nivel: 3, xp: 120, titulo: "Rollback em uma linha",
      descricao: "Saiu um deploy ruim. <b>Reaponte</b> o alias <b>prod</b> para o <b>$LATEST</b>. É literalmente assim que se desfaz um deploy sem derrubar ninguém.",
      dicas: ["`update-…` altera o que já existe. Aqui o que muda é para qual versão o apelido aponta.", "A forma é: aws lambda update-alias --function-name <nome> --name <apelido> --function-version <versão>"],
      solucao: ["aws lambda update-alias --function-name processa-pedido --name prod --function-version $LATEST"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "lambda", "update-alias") },

    { id: "cob-lam-3", servico: "lambda", nivel: 3, xp: 100, titulo: "Quem pode invocar esta função?",
      descricao: "Confira a <b>política</b> da função e veja quem ganhou permissão de chamá-la. <small>(é o jeito de saber se o gatilho vai mesmo funcionar antes de testar)</small>",
      dicas: ["`get-…` busca a política atual da função.", "A forma é: aws lambda get-policy --function-name <nome>"],
      solucao: ["aws lambda get-policy --function-name processa-pedido"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "lambda", "get-policy") },

    { id: "cob-lam-4", servico: "lambda", nivel: 3, xp: 90, titulo: "Encerre a função",
      descricao: "<b>Apague</b> a <b>processa-pedido</b>. <small>(apagar a função leva junto as versões e os aliases — não há lixeira)</small>",
      dicas: ["Apagar é sempre `delete-…`.", "A forma é: aws lambda delete-function --function-name <nome>"],
      solucao: ["aws lambda delete-function --function-name processa-pedido"],
      validar: (c) => !c.lambda.funcoes["processa-pedido"] },

    // ===================== Resto =====================
    { id: "cob-sqs-1", servico: "sqs", nivel: 2, xp: 90, titulo: "Descubra a URL pelo nome",
      descricao: "Todo comando de fila pede a <b>URL</b>, mas o que você sabe é o <b>nome</b>. Crie a fila <b>fila-suporte</b> e descubra a URL dela pelo nome.",
      dicas: ["Depois de criar, `get-…` busca a URL a partir do nome — é assim que scripts descobrem a fila sem chumbar a URL.", "A forma é: aws sqs create-queue --queue-name <n>  →  aws sqs get-queue-url --queue-name <n>"],
      solucao: [
        "aws sqs create-queue --queue-name fila-suporte",
        "aws sqs get-queue-url --queue-name fila-suporte",
      ],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "get-queue-url") },

    { id: "cob-sqs-2", servico: "sqs", nivel: 3, xp: 100, titulo: "Esvazie a fila de uma vez",
      descricao: "Em teste, apagar mensagem uma a uma é inviável. <b>Limpe</b> a <b>fila-suporte</b> inteira. <small>(em produção isso é irreversível — some com tudo que ainda não foi processado)</small>",
      dicas: ["`purge-…` esvazia. Ele precisa da URL da fila, não do nome.", "A forma é: aws sqs purge-queue --queue-url <url-da-fila>"],
      solucao: ["aws sqs purge-queue --queue-url https://sqs.us-east-1.amazonaws.com/123456789012/fila-suporte"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "purge-queue") },

    { id: "cob-sns-1", servico: "sns", nivel: 3, xp: 100, titulo: "Cancele uma inscrição",
      descricao: "Recrie o tópico <b>avisos-loja</b>, inscreva uma fila e depois <b>cancele</b> a inscrição. <small>(inscrição cancelada para de receber; o tópico continua vivo)</small>",
      dicas: ["`unsubscribe` desfaz a inscrição — ele precisa do ARN da inscrição, que veio na resposta do subscribe.", "A forma é: aws sns unsubscribe --subscription-arn <arn-da-inscricao>"],
      solucao: [
        "aws sns create-topic --name avisos-loja",
        "aws sns subscribe --topic-arn arn:aws:sns:us-east-1:123456789012:avisos-loja --protocol sqs --notification-endpoint arn:aws:sqs:us-east-1:123456789012:pedidos-novos",
        "aws sns unsubscribe --subscription-arn <sub-arn>",
      ],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "sns", "unsubscribe") },

    { id: "cob-eb-1", servico: "events", nivel: 2, xp: 90, titulo: "Confira a regra por dentro",
      descricao: "Crie a regra <b>backup-semanal</b> (a cada 7 dias) e veja os <b>detalhes</b> dela: o agendamento e o estado (habilitada ou não).",
      dicas: ["`describe-…` mostra os detalhes de um recurso específico.", "A forma é: aws events describe-rule --name <nome-da-regra>"],
      solucao: [
        "aws events put-rule --name backup-semanal --schedule-expression \"rate(7 days)\"",
        "aws events describe-rule --name backup-semanal",
      ],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "events", "describe-rule") },

    { id: "cob-eb-2", servico: "events", nivel: 2, xp: 90, titulo: "Religue a regra",
      descricao: "<b>Desabilite</b> a <b>backup-semanal</b> e <b>habilite</b> de novo — regra desabilitada continua existindo, só não dispara.",
      dicas: ["`enable-…` é o oposto do disable que você usou.", "A forma é: aws events enable-rule --name <nome-da-regra>"],
      solucao: [
        "aws events disable-rule --name backup-semanal",
        "aws events enable-rule --name backup-semanal",
      ],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "events", "enable-rule") },

    { id: "cob-glue-1", servico: "glue", nivel: 2, xp: 90, titulo: "Em que pé está o robô?",
      descricao: "Veja os <b>detalhes do crawler</b> <b>crawler-vendas</b>: estado e quantas vezes já rodou.",
      dicas: ["`get-…` traz os detalhes de um item específico.", "A forma é: aws glue get-crawler --name <nome>"],
      solucao: ["aws glue get-crawler --name crawler-vendas"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "glue", "get-crawler") },

    { id: "cob-ct-1", servico: "cloudtrail", nivel: 3, xp: 100, titulo: "Pare a gravação da auditoria",
      descricao: "<b>Pare</b> o registro da trilha <b>trilha-auditoria</b>. <small>(pense duas vezes numa conta real: sem CloudTrail você perde o \"quem fez o quê\" — e é exatamente o que um invasor desligaria primeiro)</small>",
      dicas: ["`stop-…` interrompe sem apagar a trilha.", "A forma é: aws cloudtrail stop-logging --name <nome-da-trilha>"],
      solucao: ["aws cloudtrail stop-logging --name trilha-auditoria"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "cloudtrail", "stop-logging") },

    { id: "cob-elb-1", servico: "elbv2", nivel: 2, xp: 90, titulo: "Que grupos de destino sobraram?",
      descricao: "Você apagou o balanceador, mas o <b>target group</b> continua lá — e continua na fatura. <b>Liste</b> os target groups.",
      dicas: ["`describe-…` mostra o que existe. Este não precisa de parâmetro.", "A lição: apagar o load balancer NÃO apaga os target groups."],
      solucao: ["aws elbv2 describe-target-groups"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "elbv2", "describe-target-groups") },

    { id: "cob-org-1", servico: "organizations", nivel: 2, xp: 80, titulo: "Dados da organização",
      descricao: "Veja os <b>detalhes da organização</b>: o id e qual conta é a \"mãe\" (management account).",
      dicas: ["`describe-…` mostra os detalhes. Este não precisa de parâmetro.", "A forma é: aws organizations describe-organization"],
      solucao: ["aws organizations describe-organization"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "organizations", "describe-organization") },

    { id: "cob-apigw-1", servico: "apigateway", nivel: 3, xp: 150, titulo: "Quais ambientes a API tem?",
      descricao: "Monte uma API do zero e publique: crie a <b>api-suporte</b>, um recurso <b>/chamados</b>, um método <b>GET</b>, publique no stage <b>dev</b> e liste os <b>stages</b>. <small>(a AWS recusa publicar API sem nenhum método — e stage é o ambiente: dev, prod… cada um com sua URL)</small>",
      dicas: ["É a cadeia inteira que você já viu na trilha: API → recurso → método → deployment. Só então dá pra listar os stages.", "O último passo é: aws apigateway get-stages --rest-api-id <id-da-api>"],
      solucao: [
        "aws apigateway create-rest-api --name api-suporte",
        "aws apigateway create-resource --rest-api-id <api-id> --parent-id <root-id> --path-part chamados",
        "aws apigateway put-method --rest-api-id <api-id> --resource-id <resource-id> --http-method GET --authorization-type NONE",
        "aws apigateway create-deployment --rest-api-id <api-id> --stage-name dev",
        "aws apigateway get-stages --rest-api-id <api-id>",
      ],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "apigateway", "get-stages") },

    { id: "cob-ssm-1", servico: "ssm", nivel: 2, xp: 80, titulo: "Faxina nos parâmetros",
      descricao: "<b>Apague</b> o parâmetro <b>/loja/url-api</b>. <small>(parâmetro velho apontando pra endereço que não existe mais causa bug difícil de achar)</small>",
      dicas: ["Apagar é sempre `delete-…`.", "A forma é: aws ssm delete-parameter --name <caminho-do-parametro>"],
      solucao: ["aws ssm delete-parameter --name /loja/url-api"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ssm", "delete-parameter") },

    { id: "cob-asg-1", servico: "autoscaling", nivel: 2, xp: 90, titulo: "Como está o grupo elástico?",
      descricao: "Veja os <b>detalhes do Auto Scaling group</b>: capacidade mínima, máxima, desejada e quais instâncias estão nele agora.",
      dicas: ["`describe-…` mostra o estado. Este pode vir sem parâmetro, trazendo todos os grupos.", "A forma é: aws autoscaling describe-auto-scaling-groups"],
      solucao: ["aws autoscaling describe-auto-scaling-groups"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "autoscaling", "describe-auto-scaling-groups") },

    { id: "cob-efs-1", servico: "efs", nivel: 2, xp: 90, titulo: "Onde o disco está acessível?",
      descricao: "Liste os <b>mount targets</b> do seu file system. <small>(sem mount target numa sub-rede, as máquinas dela simplesmente não enxergam o EFS)</small>",
      dicas: ["`describe-…` mostra os pontos de conexão. Ele precisa saber de qual file system.", "A forma é: aws efs describe-mount-targets --file-system-id <id>"],
      solucao: ["aws efs describe-mount-targets --file-system-id <fs-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "efs", "describe-mount-targets") },

    { id: "cob-bud-1", servico: "budgets", nivel: 2, xp: 90, titulo: "Detalhe de um orçamento",
      descricao: "Recrie o <b>orcamento-mensal</b> e depois busque os <b>detalhes só dele</b> — em vez de listar todos.",
      dicas: ["`describe-budget` (singular) traz UM orçamento; o plural traz todos. Ele precisa da conta e do nome.", "A forma é: aws budgets describe-budget --account-id <conta> --budget-name <nome>"],
      solucao: [
        "aws budgets create-budget --account-id 123456789012 --budget '{\"BudgetName\":\"orcamento-mensal\",\"BudgetLimit\":{\"Amount\":\"50\",\"Unit\":\"USD\"},\"TimeUnit\":\"MONTHLY\",\"BudgetType\":\"COST\"}'",
        "aws budgets describe-budget --account-id 123456789012 --budget-name orcamento-mensal",
      ],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "budgets", "describe-budget") },

    { id: "cob-logs-1", servico: "cloudwatch", nivel: 3, xp: 100, titulo: "Corte uma consulta cara",
      descricao: "Inicie uma consulta no <b>/climb/app</b> e <b>interrompa</b> ela. <small>(no Insights você paga pelo volume escaneado — parar cedo economiza de verdade)</small>",
      dicas: ["`stop-…` interrompe. Ele usa o mesmo queryId que o start devolveu.", "A forma é: aws logs stop-query --query-id <id>"],
      solucao: [
        "aws logs start-query --log-group-name /climb/app --start-time 0 --end-time 9999999999 --query-string 'fields @message'",
        "aws logs stop-query --query-id <consulta-id>",
      ],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "logs", "stop-query") },
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
      "ec2.create-route-table": "cria a tabela que decide para onde o pacote vai. Sub-rede sem rota não leva ninguém a lugar nenhum.",
      "ec2.associate-route-table": "liga a tabela a uma sub-rede. Sem associação explícita ela usa a tabela PRINCIPAL da VPC — origem de metade dos \"por que não sai internet?\".",
      "ec2.delete-route": "remove uma rota. A rota \"local\" nunca sai: é ela que faz a VPC conversar consigo mesma.",
      "ec2.describe-internet-gateways": "mostra os gateways e a qual VPC cada um está preso. Existir não basta — tem que estar anexado à SUA VPC.",
      "ec2.create-network-acl-entry": "cria regra no firewall da SUB-REDE. Duas pegadinhas: vale a de MENOR número que casar, e a ACL não tem estado (libere entrada E saída).",
      "ec2.describe-network-interfaces": "a interface (eni-…) é o \"cabo\" da instância. É o id dela que aparece nos flow logs — é assim que se liga uma linha de log à máquina.",
      "ec2.delete-flow-logs": "para de gravar o tráfego. O que já foi entregue no S3 continua lá; isso só interrompe daqui pra frente.",
      "ec2.describe-launch-templates": "lista as \"receitas\" de instância. É o modelo que o Auto Scaling usa pra saber como subir cada máquina nova.",
      "iam.get-group": "mostra o grupo e QUEM está dentro. Conceder por grupo só é seguro se você souber quem herda.",
      "iam.list-attached-user-policies": "responde \"o que esta pessoa pode fazer?\". Atenção: mostra só as políticas diretas — o que vem por grupo não aparece aqui.",
      "iam.list-policy-versions": "lista o histórico da política e qual versão está valendo. É como se descobre desde quando uma permissão existe.",
      "iam.detach-group-policy": "revoga a permissão do grupo — e portanto de todos os membros de uma vez.",
      "iam.detach-role-policy": "tira permissão de uma role. Role com poder demais é risco silencioso: quem a assume herda tudo.",
      "kms.describe-key": "mostra o estado e se a chave é sua ou gerenciada pela AWS — a diferença que define o que você pode controlar.",
      "kms.list-aliases": "lista os apelidos. Ninguém decora id de chave: no dia a dia se referencia pelo alias.",
      "kms.get-key-rotation-status": "diz se a chave troca de material sozinha todo ano. Várias auditorias exigem isso ligado.",
      "kms.disable-key": "desliga a chave sem apagar. Enquanto desabilitada, nada cifrado com ela pode ser lido — reversível, mas derruba tudo que depende dela.",
      "s3api.create-bucket": "o mesmo que o s3 mb, pela API crua: mais verboso, porém com todas as opções (região, ACL, object lock).",
      "s3api.get-bucket-versioning": "confere se o versionamento está mesmo ligado. Ligar e não conferir é descobrir tarde demais.",
      "s3api.get-bucket-policy": "lê a política do bucket — é ela que pode ter deixado seus arquivos públicos sem você perceber.",
      "sqs.get-queue-url": "descobre a URL a partir do nome. Todo comando de fila pede a URL, mas o que você conhece é o nome — é assim que script acha a fila sem chumbar endereço.",
      "sqs.purge-queue": "esvazia a fila de uma vez. Em produção é irreversível: some com tudo que ainda não foi processado.",
      "sns.unsubscribe": "cancela uma inscrição. Quem estava inscrito para de receber; o tópico continua vivo.",
      "events.describe-rule": "mostra o agendamento e se a regra está habilitada.",
      "events.enable-rule": "religa a regra. Regra desabilitada continua existindo — ela só não dispara.",
      "glue.get-crawler": "mostra o estado do robô e quantas vezes já rodou.",
      "cloudtrail.stop-logging": "para de registrar. Pense duas vezes: sem CloudTrail você perde o \"quem fez o quê\" — e é o primeiro serviço que um invasor desligaria.",
      "elbv2.describe-target-groups": "lista os grupos de destino. Apagar o load balancer NÃO apaga os target groups — eles continuam na fatura.",
      "organizations.describe-organization": "mostra o id da organização e qual conta é a mãe (management account).",
      "apigateway.get-stages": "lista os ambientes publicados da API (dev, prod…), cada um com sua própria URL.",
      "ssm.delete-parameter": "apaga um parâmetro. Parâmetro velho apontando pra endereço morto causa bug difícil de achar.",
      "autoscaling.describe-auto-scaling-groups": "mostra a capacidade mínima, máxima e desejada, e quais instâncias estão no grupo agora.",
      "efs.describe-mount-targets": "lista os pontos de conexão do EFS. Sem mount target numa sub-rede, as máquinas dela não enxergam o disco.",
      "budgets.describe-budget": "traz UM orçamento (o plural traz todos), com o gasto atual dele.",
      "logs.stop-query": "interrompe uma consulta. Como se paga pelo volume escaneado, cortar cedo economiza de verdade.",
    });
  }
})();
