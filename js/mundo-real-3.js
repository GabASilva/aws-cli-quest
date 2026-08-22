"use strict";
// ============================================================
// CLImb — mundo-real-3.js
// LEVA 2 (final) dos serviços órfãos. Depois da leva 1 (mundo-real-2.js)
// sobravam 25 serviços que apareciam só na trilha deles e nunca eram
// compostos com nada. Estes 10 cenários fecham a conta: zero órfãos.
//
// Cobertos aqui: apigateway, cognito-idp, elbv2, autoscaling, kinesis, glue,
// athena, eks, efs, guardduty, inspector2, macie2, wafv2, shield, support,
// cloudtrail, configservice, organizations, elasticache, redshift,
// elasticbeanstalk, ssm, rekognition, bedrock e bedrock-runtime.
//
// Nenhum comando novo: tudo já foi ensinado na trilha de origem.
//
// TODAS as sequências foram EXECUTADAS antes de virarem atividade (regra nº 0).
// O que isso pegou, e que eu teria errado:
//   • as chaves de estado NÃO seguem o nome do serviço — é conta.cognito
//     (não cognito-idp), conta.elb (não elbv2), conta.eb (elasticbeanstalk),
//     conta.inspector, conta.macie, conta.org, conta.waf, conta.config;
//   • `ec2 create-launch-template` exige --launch-template-data com ImageId
//     E InstanceType dentro do JSON;
//   • `apigateway create-deployment` recusa API sem MÉTODO — precisa de
//     create-resource + put-method antes;
//   • `athena start-query-execution` exige que o bucket de saída JÁ EXISTA;
//   • <lb-arn>/<tg-arn> resolvem pro campo .arn, não pela chave do objeto.
//
// `organizations list-accounts` depende da organização criada na trilha de
// Organizations, que roda antes no teste sequencial — em conta zerada ele
// falharia, e isso é esperado.
// ============================================================
(function () {
  if (typeof DESAFIOS === "undefined") return;
  if (DESAFIOS.some((d) => d.id === "real-33")) return;

  const NOVOS = [
    { id: "real-33", servico: "mundo-real", nivel: 3, xp: 130,
      titulo: "API pública com login (API Gateway + Cognito)",
      descricao:
        "O app precisa de uma API com <b>usuário e senha</b> — e ninguém quer escrever tela de login, " +
        "reset de senha e token do zero. Crie o pool <b>usuarios-portal</b>, o cliente <b>portal-web</b>, " +
        "a API <b>api-portal</b> com o recurso <b>/perfil</b> respondendo GET, e publique no estágio <b>prod</b>. " +
        "<small>(o Cognito guarda os usuários e emite o token; o API Gateway é a porta que confere esse token)</small>",
      dicas: [
        "Duas metades: primeiro a identidade (pool + cliente), depois a porta (API + recurso + método + deploy).",
        "O deploy só funciona se a API já tiver ao menos um MÉTODO — publicar API vazia dá erro.",
      ],
      solucao: [
        "aws cognito-idp create-user-pool --pool-name usuarios-portal",
        "aws cognito-idp create-user-pool-client --user-pool-id <pool-id> --client-name portal-web",
        "aws apigateway create-rest-api --name api-portal",
        "aws apigateway create-resource --rest-api-id <api-id> --parent-id <root-id> --path-part perfil",
        "aws apigateway put-method --rest-api-id <api-id> --resource-id <resource-id> --http-method GET --authorization-type NONE",
        "aws apigateway create-deployment --rest-api-id <api-id> --stage-name prod",
      ],
      validar: (c) => {
        const pool = Object.values((c.cognito && c.cognito.pools) || {}).some((p) => p.nome === "usuarios-portal");
        const api = Object.values((c.apigateway && c.apigateway.apis) || {}).find((a) => a.nome === "api-portal");
        return pool && !!api && Object.keys(api.estagios || {}).length > 0;
      } },

    { id: "real-34", servico: "mundo-real", nivel: 3, xp: 130,
      titulo: "Tráfego que cresce sozinho (ELB + Auto Scaling)",
      descricao:
        "A promoção derrubou o site: uma máquina só não deu conta. Monte a estrutura que aguenta pico — " +
        "o modelo <b>modelo-portal</b>, o grupo de destino <b>portal-tg</b>, o balanceador <b>portal-alb</b> " +
        "com listener na porta 80, e o grupo elástico <b>grupo-portal</b> de 1 a 4 máquinas. " +
        "<small>(o balanceador divide o tráfego; o Auto Scaling é quem cria e destrói máquina conforme a demanda)</small>",
      dicas: [
        "O modelo (launch template) vem primeiro: é a receita da máquina que o Auto Scaling vai clonar.",
        "O --launch-template-data é um JSON e precisa de ImageId e InstanceType lá dentro.",
      ],
      solucao: [
        "aws ec2 create-launch-template --launch-template-name modelo-portal --launch-template-data '{\"ImageId\":\"ami-0abcd1234ef567890\",\"InstanceType\":\"t2.micro\"}'",
        "aws elbv2 create-target-group --name portal-tg --protocol HTTP --port 80 --vpc-id vpc-0f00d1e00c11ab001",
        "aws elbv2 create-load-balancer --name portal-alb --subnets subnet-aaa1 subnet-bbb2",
        "aws elbv2 create-listener --load-balancer-arn <lb-arn> --protocol HTTP --port 80 --default-actions Type=forward,TargetGroupArn=<tg-arn>",
        "aws autoscaling create-auto-scaling-group --auto-scaling-group-name grupo-portal --launch-template LaunchTemplateName=modelo-portal,Version=1 --min-size 1 --max-size 4 --desired-capacity 2 --availability-zones us-east-1a",
      ],
      validar: (c) => {
        const g = c.autoscaling && c.autoscaling.grupos && c.autoscaling.grupos["grupo-portal"];
        const lb = Object.values((c.elb && c.elb.lbs) || {}).some((x) => x.nome === "portal-alb");
        return !!g && lb;
      } },

    { id: "real-35", servico: "mundo-real", nivel: 3, xp: 130,
      titulo: "Do evento bruto à consulta SQL (Kinesis + Glue + Athena)",
      descricao:
        "O time de produto quer saber quais produtos são mais clicados, e os cliques não são guardados em lugar nenhum. " +
        "Monte a esteira: o fluxo <b>eventos-portal</b> recebe os cliques, o catálogo <b>dados_portal</b> " +
        "descreve o formato e o Athena consulta com <b>SQL</b>. Crie antes o bucket <b>saida-athena-portal</b> pro resultado. " +
        "<small>(o Glue não guarda dado nenhum — ele guarda o MAPA que faz o SQL entender o arquivo cru)</small>",
      dicas: [
        "Ordem: bucket de saída → fluxo → um registro → banco do catálogo → tabela → consulta.",
        "O Athena recusa a consulta se o bucket de saída não existir: ele precisa de onde escrever o resultado.",
      ],
      solucao: [
        "aws s3 mb s3://saida-athena-portal",
        "aws kinesis create-stream --stream-name eventos-portal --shard-count 1",
        'aws kinesis put-record --stream-name eventos-portal --data "clique-produto-42" --partition-key u1',
        "aws glue create-database --database-input '{\"Name\":\"dados_portal\"}'",
        "aws glue create-table --database-name dados_portal --table-input file://tabela-vendas.json",
        'aws athena start-query-execution --query-string "SELECT * FROM dados_portal.vendas" --result-configuration OutputLocation=s3://saida-athena-portal/',
      ],
      validar: (c) =>
        !!(c.kinesis && c.kinesis.streams && c.kinesis.streams["eventos-portal"]) &&
        !!(c.glue && c.glue.bancos && c.glue.bancos["dados_portal"]) &&
        Object.keys((c.athena && c.athena.execucoes) || {}).length > 0 },

    { id: "real-36", servico: "mundo-real", nivel: 3, xp: 120,
      titulo: "Kubernetes com disco compartilhado (EKS + EFS)",
      descricao:
        "A aplicação vai rodar em Kubernetes e <b>três pods</b> precisam ler e escrever nos mesmos arquivos — " +
        "disco de máquina não serve, porque cada pod ficaria com uma cópia. Crie o cluster <b>cluster-portal</b>, " +
        "o grupo de nós <b>nos-portal</b>, o sistema de arquivos <b>dados-portal</b> e o ponto de montagem. " +
        "<small>(o EFS é o disco que várias máquinas montam ao mesmo tempo — o EBS só serve a uma)</small>",
      dicas: [
        "O cluster é só o cérebro: sem grupo de nós não existe máquina pra rodar pod nenhum.",
        "O ponto de montagem (`create-mount-target`) é o que dá endereço ao EFS dentro da sua sub-rede.",
      ],
      solucao: [
        "aws eks create-cluster --name cluster-portal --role-arn arn:aws:iam::123456789012:role/papel-eks --resources-vpc-config subnetIds=subnet-aaa1,subnet-bbb2",
        "aws eks create-nodegroup --cluster-name cluster-portal --nodegroup-name nos-portal --node-role arn:aws:iam::123456789012:role/papel-nos --subnets subnet-aaa1 subnet-bbb2",
        "aws efs create-file-system --creation-token dados-portal",
        "aws efs create-mount-target --file-system-id <fs-id> --subnet-id subnet-aaa1",
      ],
      validar: (c) =>
        !!(c.eks && c.eks.clusters && c.eks.clusters["cluster-portal"]) &&
        Object.keys((c.efs && c.efs.sistemas) || {}).length > 0 },

    { id: "real-37", servico: "mundo-real", nivel: 3, xp: 120,
      titulo: "Quem está vigiando a conta (GuardDuty + Inspector + Macie)",
      descricao:
        "Auditoria perguntou o que monitora a conta e a resposta foi “nada”. Ligue os três vigias e " +
        "<b>veja o que cada um achou</b>: o GuardDuty olha comportamento estranho, o Inspector procura " +
        "vulnerabilidade nas máquinas e o Macie vasculha os buckets atrás de dado pessoal. " +
        "<small>(ligar é metade do trabalho — vigia que ninguém consulta é só fatura)</small>",
      dicas: [
        "Cada um tem seu verbo de ligar: `create-detector --enable`, `enable --resource-types` e `enable-macie`.",
        "Depois de ligar, consulte: list-findings nos dois primeiros e get-macie-session no terceiro.",
      ],
      solucao: [
        "aws guardduty create-detector --enable",
        "aws guardduty list-findings --detector-id <detector-id>",
        "aws inspector2 enable --resource-types EC2",
        "aws inspector2 list-findings",
        "aws macie2 enable-macie",
        "aws macie2 get-macie-session",
      ],
      validar: (c) =>
        Object.keys((c.guardduty && c.guardduty.detectores) || {}).length > 0 &&
        !!(c.inspector && c.inspector.ligado) && !!(c.macie && c.macie.ligado) },

    { id: "real-38", servico: "mundo-real", nivel: 2, xp: 90,
      titulo: "A borda e a saúde da conta (WAF + Shield + Trusted Advisor)",
      descricao:
        "Depois de um pico suspeito de tráfego, o time quer saber o que protege a borda. " +
        "Crie a ACL <b>protege-portal</b>, confira a assinatura do <b>Shield</b> e as estatísticas de ataque, " +
        "e peça ao <b>Trusted Advisor</b> a lista de verificações da conta. " +
        "<small>(WAF filtra requisição malformada, Shield absorve volume, Trusted Advisor aponta o que está torto)</small>",
      dicas: [
        "A ACL do WAF precisa de escopo (--scope REGIONAL) e de uma ação padrão (--default-action).",
        "Shield e Trusted Advisor só respondem consulta: não há o que criar neles.",
      ],
      solucao: [
        "aws wafv2 create-web-acl --name protege-portal --scope REGIONAL --default-action Allow={} --visibility-config SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=protege-portal",
        "aws shield describe-subscription",
        "aws shield describe-attack-statistics",
        "aws support describe-trusted-advisor-checks --language pt",
      ],
      // Shield e Support não deixam estado: valida o comando final + a ACL criada.
      validar: (c, cmd, ok) =>
        ok && ehCmd(cmd, "support", "describe-trusted-advisor-checks") &&
        Object.values((c.waf && c.waf.acls) || {}).some((a) => a.nome === "protege-portal") },

    { id: "real-39", servico: "mundo-real", nivel: 3, xp: 120,
      titulo: "Quem mexeu e o que saiu do padrão (CloudTrail + Config + Organizations)",
      descricao:
        "Um bucket ficou público no fim de semana e ninguém sabe quem mexeu. Monte a auditoria: " +
        "o bucket <b>logs-portal-climb</b> pros registros, a trilha <b>trilha-portal</b> gravando, " +
        "a regra <b>s3-encriptado-portal</b> conferindo a criptografia, e liste as contas da organização. " +
        "<small>(o CloudTrail responde “quem fez”; o Config responde “o que está fora do padrão” — perguntas diferentes)</small>",
      dicas: [
        "Criar a trilha não basta: ela nasce parada e precisa de `start-logging` pra gravar.",
        "A regra do Config vai num JSON só, entre aspas simples, com ConfigRuleName e Source.",
      ],
      solucao: [
        "aws s3 mb s3://logs-portal-climb",
        "aws cloudtrail create-trail --name trilha-portal --s3-bucket-name logs-portal-climb",
        "aws cloudtrail start-logging --name trilha-portal",
        "aws configservice put-config-rule --config-rule '{\"ConfigRuleName\":\"s3-encriptado-portal\",\"Source\":{\"Owner\":\"AWS\",\"SourceIdentifier\":\"S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED\"}}'",
        "aws organizations list-accounts",
      ],
      validar: (c, cmd, ok) => {
        const t = c.cloudtrail && c.cloudtrail.trilhas && c.cloudtrail.trilhas["trilha-portal"];
        return ok && ehCmd(cmd, "organizations", "list-accounts") &&
               !!t && !!t.gravando &&
               !!(c.config && c.config.regras && c.config.regras["s3-encriptado-portal"]);
      } },

    { id: "real-40", servico: "mundo-real", nivel: 2, xp: 90,
      titulo: "Cada dado no banco certo (ElastiCache + Redshift)",
      descricao:
        "O mesmo banco relacional está servindo a home do site e os relatórios do fim do mês — e os dois estão lentos. " +
        "Separe: o cache <b>cache-portal</b> pra resposta quente da home, e o warehouse <b>analitica-portal</b> " +
        "pros relatórios pesados. " +
        "<small>(cache responde em milissegundos e esquece; warehouse varre milhões de linhas e lembra — escolher errado custa caro nos dois sentidos)</small>",
      dicas: [
        "O ElastiCache pede o motor (`--engine redis`) e o tipo de nó; o Redshift pede tipo de nó e usuário mestre.",
        "Depois de criar, `describe-clusters` mostra o warehouse de pé.",
      ],
      solucao: [
        "aws elasticache create-cache-cluster --cache-cluster-id cache-portal --engine redis --cache-node-type cache.t3.micro --num-cache-nodes 1",
        "aws redshift create-cluster --cluster-identifier analitica-portal --node-type dc2.large --master-username admin --master-user-password SenhaExemplo123 --number-of-nodes 1",
        "aws redshift describe-clusters",
      ],
      validar: (c) =>
        Object.values((c.elasticache && c.elasticache.clusters) || {}).some((x) => (x.id || x.nome) === "cache-portal") &&
        Object.values((c.redshift && c.redshift.clusters) || {}).some((x) => (x.id || x.nome) === "analitica-portal") },

    { id: "real-41", servico: "mundo-real", nivel: 2, xp: 90,
      titulo: "App gerenciado e configurável (Elastic Beanstalk + SSM)",
      descricao:
        "A equipe quer publicar o app sem cuidar de máquina, e a URL da API muda entre ambientes — " +
        "hoje ela está <i>hardcoded</i> no código. Guarde a URL no parâmetro <b>/portal/url-api</b>, " +
        "crie a aplicação <b>portal-app</b> com o ambiente <b>portal-prod</b> e leia o parâmetro de volta. " +
        "<small>(configuração fora do código é o que deixa o mesmo artefato subir em dev e em prod sem recompilar)</small>",
      dicas: [
        "O Parameter Store guarda configuração; o Beanstalk cuida da máquina, do deploy e do balanceador.",
        "O ambiente precisa saber em que plataforma roda: --solution-stack-name, entre aspas.",
      ],
      solucao: [
        "aws ssm put-parameter --name /portal/url-api --value https://api.portal.com --type String",
        "aws elasticbeanstalk create-application --application-name portal-app",
        'aws elasticbeanstalk create-environment --application-name portal-app --environment-name portal-prod --solution-stack-name "64bit Amazon Linux 2023 v4.0.0 running Python 3.12"',
        "aws ssm get-parameter --name /portal/url-api",
      ],
      validar: (c, cmd, ok) =>
        ok && ehCmd(cmd, "ssm", "get-parameter") &&
        !!(c.ssm && c.ssm.parametros && c.ssm.parametros["/portal/url-api"]) &&
        !!(c.eb && c.eb.apps && c.eb.apps["portal-app"]) },

    { id: "real-42", servico: "mundo-real", nivel: 3, xp: 130,
      titulo: "A máquina que lê a foto e escreve o laudo (Rekognition + Bedrock)",
      descricao:
        "Chegam fotos de avaria pelo app e alguém precisa ler cada uma pra abrir o chamado. " +
        "Faça o computador olhar: extraia os <b>objetos</b> da foto, leia o <b>texto</b> da placa " +
        "e depois peça a um <b>modelo do Bedrock</b> que escreva o resumo do achado. " +
        "<small>(o Rekognition enxerga e devolve dado estruturado; o Bedrock transforma esse dado em texto que uma pessoa lê)</small>",
      dicas: [
        "As imagens vão num JSON apontando bucket e arquivo: --image '{\"S3Object\":{\"Bucket\":\"…\",\"Name\":\"…\"}}'",
        "O Bedrock tem dois comandos distintos: `bedrock` lista/descreve modelos, `bedrock-runtime` é quem CHAMA.",
      ],
      solucao: [
        "aws rekognition detect-labels --image '{\"S3Object\":{\"Bucket\":\"meu-bucket\",\"Name\":\"foto.jpg\"}}'",
        "aws rekognition detect-text --image '{\"S3Object\":{\"Bucket\":\"meu-bucket\",\"Name\":\"placa.jpg\"}}'",
        "aws bedrock list-foundation-models",
        "aws bedrock-runtime invoke-model --model-id anthropic.claude-3-5-sonnet-20240620-v1:0 --body '{\"anthropic_version\":\"bedrock-2023-05-31\",\"max_tokens\":100,\"messages\":[{\"role\":\"user\",\"content\":\"Resuma a avaria da foto\"}]}' resposta.json",
      ],
      // Rekognition e Bedrock não deixam estado na conta: valida pelo comando final.
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "bedrock-runtime", "invoke-model") },
  ];

  let ultimo = -1;
  for (let i = 0; i < DESAFIOS.length; i++) if (DESAFIOS[i].servico === "mundo-real") ultimo = i;
  if (ultimo >= 0) DESAFIOS.splice(ultimo + 1, 0, ...NOVOS);
  else for (const d of NOVOS) DESAFIOS.push(d);
})();
