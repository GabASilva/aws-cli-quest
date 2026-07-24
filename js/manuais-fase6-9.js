"use strict";
// ============================================================
// CLImb — manuais-fase6-9.js
// Manuais (aws <serviço> [comando] help) dos serviços das fases 6 a 9.
// Fica em arquivo próprio (o manuais.js não cresce mais). Carrega DEPOIS de
// manuais.js, então MANUAIS já existe — a gente só complementa com Object.assign.
// ============================================================
(function () {
  if (typeof MANUAIS === "undefined") return;

  // Acrescenta os serviços novos à listagem do "aws help".
  if (MANUAIS[""] && MANUAIS[""].indexOf("elbv2") < 0) {
    MANUAIS[""] += `

SERVIÇOS DAS FASES 6–9
    elbv2            Load balancer (distribui tráfego entre instâncias)
    elasticbeanstalk Deploy gerenciado (sobe a infra por baixo)
    efs              Disco de arquivos compartilhado entre máquinas
    elasticache      Cache em memória (Redis/Memcached)
    acm              Certificados SSL/TLS (HTTPS) de graça
    budgets          Orçamentos e alertas de gasto
    ce               Cost Explorer: para onde vai o dinheiro
    organizations    Várias contas AWS sob uma fatura
    support          Trusted Advisor (recomendações automáticas)
    guardduty        Detecção de ameaças (ML nos logs)
    inspector2       Vulnerabilidades (CVEs) em EC2/containers
    macie2           Dados sensíveis expostos no S3
    wafv2            Firewall de aplicação (SQLi, XSS, bots)
    shield           Proteção contra DDoS
    configservice    Histórico e conformidade de configuração
    rekognition      Análise de imagem (visão computacional)
    translate        Tradução neural
    polly            Texto em voz (fala)
    comprehend       Entende texto (sentimento, entidades)
    bedrock          IA generativa (Claude, Titan, Llama)
    bedrock-runtime  Invocar modelos de IA generativa
    kinesis          Streaming de dados em tempo real
    redshift         Data warehouse (análise/BI)`;
  }

  const M = (uso, txt) => `USO\n    ${uso}\n\n${txt}`;

  Object.assign(MANUAIS, {
    // ===================== Fase 6 =====================
    elbv2: `aws elbv2 — Elastic Load Balancing (v2)\n\nO load balancer fica na frente das suas máquinas e reparte as requisições.\nSe uma instância cai no health check, ele para de mandar tráfego pra ela.\nOrdem típica: create-load-balancer → create-target-group → register-targets\n→ create-listener.\n\nCOMANDOS\n    create-load-balancer, describe-load-balancers, create-target-group,\n    describe-target-groups, register-targets, describe-target-health,\n    create-listener, delete-load-balancer, delete-target-group`,
    "elbv2.create-load-balancer": M("aws elbv2 create-load-balancer --name loja-alb --subnets subnet-a subnet-b", "Cria um Application Load Balancer. Precisa de 2+ sub-redes em zonas\ndiferentes (alta disponibilidade). Devolve o DNSName e o ARN."),
    "elbv2.describe-load-balancers": M("aws elbv2 describe-load-balancers", "Lista os load balancers, com ARN e DNSName (o endereço público)."),
    "elbv2.create-target-group": M("aws elbv2 create-target-group --name loja-tg --protocol HTTP --port 80 --vpc-id vpc-xxxx", "Cria o \"grupo de destino\": onde você registra as instâncias. O load\nbalancer manda o tráfego pra este grupo e faz health check nele."),
    "elbv2.describe-target-groups": M("aws elbv2 describe-target-groups", "Lista os target groups e seus ARNs."),
    "elbv2.register-targets": M("aws elbv2 register-targets --target-group-arn <arn> --targets Id=i-xxxx", "Registra instâncias no target group. Só as registradas e saudáveis\nrecebem tráfego. Aceita vários: --targets Id=i-aaa Id=i-bbb"),
    "elbv2.describe-target-health": M("aws elbv2 describe-target-health --target-group-arn <arn>", "Mostra a saúde de cada alvo (healthy/unhealthy). É o health check\nque decide pra quem o load balancer manda requisição."),
    "elbv2.create-listener": M("aws elbv2 create-listener --load-balancer-arn <arn> --protocol HTTP --port 80 --default-actions Type=forward,TargetGroupArn=<tg-arn>", "O listener escuta numa porta (80/443) e encaminha pro target group.\nSem ele, o load balancer existe mas não responde nada."),
    "elbv2.delete-load-balancer": M("aws elbv2 delete-load-balancer --load-balancer-arn <arn>", "Apaga o load balancer (e os listeners dele)."),
    "elbv2.delete-target-group": M("aws elbv2 delete-target-group --target-group-arn <arn>", "Apaga um target group."),

    elasticbeanstalk: `aws elasticbeanstalk — Elastic Beanstalk\n\nO \"deploy fácil\": você sobe o código e ele cria EC2, load balancer e\nAuto Scaling por baixo, sem você configurar peça por peça. Você mexe em\nAPLICAÇÃO (o projeto) e AMBIENTE (uma instância rodando dele: prod, dev...).\n\nCOMANDOS\n    create-application, describe-applications, create-environment,\n    describe-environments, terminate-environment, delete-application`,
    "elasticbeanstalk.create-application": M("aws elasticbeanstalk create-application --application-name loja-app", "Cria a aplicação (o \"projeto\"). Ainda não sobe nada — pra rodar,\ncrie um environment dentro dela."),
    "elasticbeanstalk.describe-applications": M("aws elasticbeanstalk describe-applications", "Lista as aplicações do Beanstalk."),
    "elasticbeanstalk.create-environment": M("aws elasticbeanstalk create-environment --application-name loja-app --environment-name loja-prod --solution-stack-name \"...Python 3.12\"", "Cria um ambiente rodando a aplicação. É aqui que o Beanstalk sobe\ntoda a infra. O CNAME é a URL da app; o Health precisa ficar Green."),
    "elasticbeanstalk.describe-environments": M("aws elasticbeanstalk describe-environments", "Lista os ambientes, com Status, Health e CNAME (a URL)."),
    "elasticbeanstalk.terminate-environment": M("aws elasticbeanstalk terminate-environment --environment-name loja-prod", "Encerra o ambiente — some com EC2, load balancer e Auto Scaling que\nele criou. A aplicação continua (vazia)."),
    "elasticbeanstalk.delete-application": M("aws elasticbeanstalk delete-application --application-name loja-app", "Apaga a aplicação. A AWS recusa se ainda houver ambiente vivo."),

    efs: `aws efs — Elastic File System\n\nUm disco que VÁRIAS máquinas montam ao mesmo tempo (o EBS é de uma só).\nÓtimo pra arquivos compartilhados. As instâncias alcançam o EFS por um\nMOUNT TARGET criado numa sub-rede.\n\nCOMANDOS\n    create-file-system, describe-file-systems, create-mount-target,\n    describe-mount-targets, delete-file-system, delete-mount-target`,
    "efs.create-file-system": M("aws efs create-file-system --creation-token dados-efs", "Cria o file system. O creation-token evita criar dois iguais sem\nquerer (idempotência). Devolve o FileSystemId (fs-...)."),
    "efs.describe-file-systems": M("aws efs describe-file-systems", "Lista os file systems e quantos mount targets cada um tem."),
    "efs.create-mount-target": M("aws efs create-mount-target --file-system-id fs-xxxx --subnet-id subnet-xxxx", "Cria o ponto de conexão do EFS numa sub-rede — é por ele que as\ninstâncias daquela sub-rede montam o disco."),
    "efs.describe-mount-targets": M("aws efs describe-mount-targets --file-system-id fs-xxxx", "Lista os mount targets de um file system."),
    "efs.delete-file-system": M("aws efs delete-file-system --file-system-id fs-xxxx", "Apaga o file system. A AWS recusa se ainda houver mount target ativo."),
    "efs.delete-mount-target": M("aws efs delete-mount-target --mount-target-id fsmt-xxxx", "Remove um mount target."),

    elasticache: `aws elasticache — ElastiCache\n\nCache em memória (Redis ou Memcached). Guarda o que é caro de buscar pra\na app ler em microssegundos, sem bater no banco toda hora.\n\nCOMANDOS\n    create-cache-cluster, describe-cache-clusters, delete-cache-cluster`,
    "elasticache.create-cache-cluster": M("aws elasticache create-cache-cluster --cache-cluster-id cache-loja --engine redis --cache-node-type cache.t3.micro --num-cache-nodes 1", "Cria um cluster de cache. Engine: redis (mais usado), memcached ou\nvalkey. Devolve o endpoint pra app se conectar."),
    "elasticache.describe-cache-clusters": M("aws elasticache describe-cache-clusters", "Lista os clusters de cache."),
    "elasticache.delete-cache-cluster": M("aws elasticache delete-cache-cluster --cache-cluster-id cache-loja", "Apaga um cluster de cache."),

    acm: `aws acm — Certificate Manager\n\nEmite certificados SSL/TLS de graça (o cadeado do HTTPS). O certificado\nfica PENDING_VALIDATION até você provar que é dono do domínio (registro\nDNS no Route 53). Depois de válido, usa no load balancer/CloudFront.\n\nCOMANDOS\n    request-certificate, list-certificates, describe-certificate,\n    delete-certificate`,
    "acm.request-certificate": M("aws acm request-certificate --domain-name loja-climb.com --validation-method DNS", "Pede um certificado pro domínio. Devolve o CertificateArn. Validação\nDNS é a recomendada (renova sozinho)."),
    "acm.list-certificates": M("aws acm list-certificates", "Lista os certificados e o status de cada um."),
    "acm.describe-certificate": M("aws acm describe-certificate --certificate-arn <arn>", "Detalha um certificado (domínio, status, tipo). PENDING_VALIDATION =\nfalta validar o domínio."),
    "acm.delete-certificate": M("aws acm delete-certificate --certificate-arn <arn>", "Apaga um certificado."),

    // ===================== Fase 7 =====================
    budgets: `aws budgets — AWS Budgets\n\nDefine tetos de gasto e AVISA quando você chega perto (não bloqueia).\nÉ o primeiro passo pra não tomar susto na fatura. Quase tudo pede o\n--account-id da sua conta.\n\nCOMANDOS\n    create-budget, describe-budgets, describe-budget, create-notification,\n    delete-budget`,
    "budgets.create-budget": M("aws budgets create-budget --account-id 123456789012 --budget '{\"BudgetName\":\"orcamento-mensal\",\"BudgetLimit\":{\"Amount\":\"50\",\"Unit\":\"USD\"},\"TimeUnit\":\"MONTHLY\",\"BudgetType\":\"COST\"}'", "Cria um orçamento. O --budget é um JSON com nome, limite e período."),
    "budgets.describe-budgets": M("aws budgets describe-budgets --account-id 123456789012", "Lista os orçamentos e o gasto atual de cada um."),
    "budgets.describe-budget": M("aws budgets describe-budget --account-id 123456789012 --budget-name orcamento-mensal", "Detalha um orçamento específico."),
    "budgets.create-notification": M("aws budgets create-notification --account-id 123456789012 --budget-name orcamento-mensal --notification '{...Threshold:80...}' --subscribers '[{\"SubscriptionType\":\"EMAIL\",\"Address\":\"voce@exemplo.com\"}]'", "Liga o alerta: manda e-mail quando passar do limite (ex.: 80%).\nOrçamento sem notificação não serve pra muita coisa."),
    "budgets.delete-budget": M("aws budgets delete-budget --account-id 123456789012 --budget-name orcamento-mensal", "Apaga um orçamento."),

    ce: `aws ce — Cost Explorer\n\nMostra quanto e onde você gastou, e projeta a fatura. É onde se descobre\nqual serviço está pesando (normalmente EC2 ou transferência de dados).\nPeríodos e agrupamentos vão em JSON/shorthand.\n\nCOMANDOS\n    get-cost-and-usage, get-cost-forecast, get-dimension-values`,
    "ce.get-cost-and-usage": M("aws ce get-cost-and-usage --time-period '{\"Start\":\"2026-07-01\",\"End\":\"2026-07-31\"}' --granularity MONTHLY --metrics UnblendedCost [--group-by Type=DIMENSION,Key=SERVICE]", "Custo do período. Com --group-by Key=SERVICE, quebra por serviço —\né assim que você acha o vilão da fatura."),
    "ce.get-cost-forecast": M("aws ce get-cost-forecast --time-period '{...}' --metric UNBLENDED_COST --granularity MONTHLY", "Previsão de gasto até o fim do período, no ritmo atual. Serve pra\nreagir ANTES da fatura fechar."),
    "ce.get-dimension-values": M("aws ce get-dimension-values --dimension SERVICE --time-period '{...}'", "Lista os valores de uma dimensão (ex.: os serviços que geraram custo)."),

    organizations: `aws organizations — AWS Organizations\n\nJunta várias contas AWS sob uma management account: fatura consolidada,\ncontas separadas por time/ambiente e regras centrais (SCPs). Base de\nqualquer setup sério.\n\nCOMANDOS\n    create-organization, describe-organization, create-account,\n    list-accounts, create-organizational-unit, delete-organization`,
    "organizations.create-organization": M("aws organizations create-organization", "Cria a organização — a conta atual vira a management account (a mãe)."),
    "organizations.describe-organization": M("aws organizations describe-organization", "Mostra os dados da organização (id, management account)."),
    "organizations.create-account": M("aws organizations create-account --account-name time-dados --email dados+aws@exemplo.com", "Cria uma conta-filha (com e-mail único). A fatura dela cai na\nmanagement account."),
    "organizations.list-accounts": M("aws organizations list-accounts", "Lista todas as contas da organização (a mãe e as filhas)."),
    "organizations.create-organizational-unit": M("aws organizations create-organizational-unit --name Producao --parent-id r-root", "Cria uma OU (uma \"pasta\" de contas). Regras aplicadas na OU valem\npra todas as contas dentro."),
    "organizations.delete-organization": M("aws organizations delete-organization", "Apaga a organização (só se não houver contas-membro)."),

    support: `aws support — Trusted Advisor (via AWS Support)\n\nO Trusted Advisor varre a conta e aponta economia, segurança, limites e\ntolerância a falhas. As checagens de custo e segurança são as mais úteis.\n\nCOMANDOS\n    describe-trusted-advisor-checks, describe-trusted-advisor-check-result`,
    "support.describe-trusted-advisor-checks": M("aws support describe-trusted-advisor-checks --language pt", "Lista as checagens disponíveis (cada uma tem um id e uma categoria:\nsecurity, cost_optimizing, performance...)."),
    "support.describe-trusted-advisor-check-result": M("aws support describe-trusted-advisor-check-result --check-id Qch7DwouX1 --language pt", "Resultado de uma checagem: status (ok/warning/error) e quantos\nrecursos foram sinalizados."),

    // ===================== Fase 8 =====================
    guardduty: `aws guardduty — Amazon GuardDuty\n\nDetecção de ameaças que roda sozinha: lê VPC Flow Logs, DNS e CloudTrail\ne usa ML pra achar comportamento suspeito (força-bruta, mineração de\ncripto, acesso estranho). Você não escreve regra.\n\nCOMANDOS\n    create-detector, list-detectors, list-findings, get-findings,\n    delete-detector`,
    "guardduty.create-detector": M("aws guardduty create-detector --enable", "Liga o GuardDuty (cria o detector). --enable é uma flag booleana.\nSó pode haver um detector por região."),
    "guardduty.list-detectors": M("aws guardduty list-detectors", "Lista os IDs dos detectores (você precisa do id pra ver os findings)."),
    "guardduty.list-findings": M("aws guardduty list-findings --detector-id <id>", "Lista os IDs das suspeitas (findings) encontradas."),
    "guardduty.get-findings": M("aws guardduty get-findings --detector-id <id> --finding-ids <fid>", "Detalha os findings: tipo, gravidade (0-10) e título."),
    "guardduty.delete-detector": M("aws guardduty delete-detector --detector-id <id>", "Desliga o GuardDuty removendo o detector."),

    inspector2: `aws inspector2 — Amazon Inspector\n\nEscaneia EC2 e imagens de container atrás de VULNERABILIDADES conhecidas\n(CVEs) e software desatualizado. Enquanto o GuardDuty vê ATAQUES, o\nInspector vê as BRECHAS que o ataque usaria.\n\nCOMANDOS\n    enable, list-findings, batch-get-account-status, disable`,
    "inspector2.enable": M("aws inspector2 enable --resource-types EC2", "Habilita o Inspector pros tipos de recurso (EC2, ECR, LAMBDA)."),
    "inspector2.list-findings": M("aws inspector2 list-findings", "Lista as vulnerabilidades achadas (CVE, pacote afetado, severidade)."),
    "inspector2.batch-get-account-status": M("aws inspector2 batch-get-account-status", "Mostra se o Inspector está habilitado na conta."),
    "inspector2.disable": M("aws inspector2 disable --resource-types EC2", "Desabilita o Inspector."),

    macie2: `aws macie2 — Amazon Macie\n\nVasculha os buckets S3 atrás de DADOS SENSÍVEIS (CPF, cartão, chaves de\nAPI) expostos. O especialista em \"vazamento de dado no S3\".\n\nCOMANDOS\n    enable-macie, get-macie-session, create-classification-job,\n    list-classification-jobs, disable-macie`,
    "macie2.enable-macie": M("aws macie2 enable-macie", "Habilita o Macie na conta."),
    "macie2.get-macie-session": M("aws macie2 get-macie-session", "Mostra o status do Macie (habilitado, frequência de findings)."),
    "macie2.create-classification-job": M("aws macie2 create-classification-job --name varredura-loja --job-type ONE_TIME --s3-job-definition '{...buckets...}'", "Cria um job que lê os objetos dos buckets e marca dado sensível.\njob-type: ONE_TIME (uma vez) ou SCHEDULED (recorrente)."),
    "macie2.list-classification-jobs": M("aws macie2 list-classification-jobs", "Lista os jobs de classificação."),
    "macie2.disable-macie": M("aws macie2 disable-macie", "Desabilita o Macie."),

    wafv2: `aws wafv2 — AWS WAF (v2)\n\nFirewall da camada de aplicação (HTTP): barra SQL injection, XSS, bots e\nexcesso de requisições. Pluga num load balancer, API Gateway ou\nCloudFront. O scope escolhe onde: REGIONAL ou CLOUDFRONT.\n\nCOMANDOS\n    create-web-acl, list-web-acls, get-web-acl, delete-web-acl`,
    "wafv2.create-web-acl": M("aws wafv2 create-web-acl --name protege-loja --scope REGIONAL --default-action Allow={} --visibility-config SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=protege-loja", "Cria uma Web ACL (conjunto de regras). scope REGIONAL = load\nbalancer/API; CLOUDFRONT = CDN. Depois você adiciona regras gerenciadas."),
    "wafv2.list-web-acls": M("aws wafv2 list-web-acls --scope REGIONAL", "Lista as Web ACLs de um escopo."),
    "wafv2.get-web-acl": M("aws wafv2 get-web-acl --name protege-loja --scope REGIONAL --id <id>", "Detalha uma Web ACL e suas regras."),
    "wafv2.delete-web-acl": M("aws wafv2 delete-web-acl --name protege-loja --scope REGIONAL --id <id>", "Apaga uma Web ACL."),

    shield: `aws shield — AWS Shield\n\nProteção contra DDoS. O Shield STANDARD é grátis e automático pra todos\n(barra ataques comuns de rede). O ADVANCED (pago) dá proteção maior e um\ntime de resposta da AWS. Na prova: DDoS → Shield.\n\nCOMANDOS\n    describe-subscription, list-protections, describe-attack-statistics`,
    "shield.describe-subscription": M("aws shield describe-subscription", "Mostra sua assinatura do Shield (Standard vem por padrão)."),
    "shield.list-protections": M("aws shield list-protections", "Lista os recursos protegidos pelo Shield Advanced (vazio no Standard)."),
    "shield.describe-attack-statistics": M("aws shield describe-attack-statistics", "Estatísticas de ataques DDoS detectados no período."),

    configservice: `aws configservice — AWS Config\n\nA \"câmera de segurança\" da conta: grava o histórico de configuração de\ncada recurso e avalia se está no padrão (config rules). Responde \"quem\nmudou isso e quando?\" e \"o que está fora da política?\".\n\nCOMANDOS\n    put-configuration-recorder, start-configuration-recorder,\n    put-config-rule, describe-config-rules,\n    describe-configuration-recorder-status`,
    "configservice.put-configuration-recorder": M("aws configservice put-configuration-recorder --configuration-recorder name=default,roleARN=arn:aws:iam::123456789012:role/config-role", "Cria o gravador de configuração. Sozinho ele não grava — falta dar\nstart."),
    "configservice.start-configuration-recorder": M("aws configservice start-configuration-recorder --configuration-recorder-name default", "Liga a gravação. A partir daí toda mudança de config fica registrada."),
    "configservice.put-config-rule": M("aws configservice put-config-rule --config-rule '{\"ConfigRuleName\":\"s3-encriptado\",\"Source\":{\"Owner\":\"AWS\",\"SourceIdentifier\":\"S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED\"}}'", "Cria uma regra de conformidade. Regras gerenciadas (Owner AWS) já\nvêm prontas; o Config marca quem está NON_COMPLIANT."),
    "configservice.describe-config-rules": M("aws configservice describe-config-rules", "Lista as config rules e o estado de cada uma."),
    "configservice.describe-configuration-recorder-status": M("aws configservice describe-configuration-recorder-status", "Mostra se o gravador está gravando (recording: true/false)."),

    // ===================== Fase 9 =====================
    rekognition: `aws rekognition — Amazon Rekognition\n\nIA de visão pronta: você manda a imagem (do S3 ou em bytes) e recebe o\nque tem nela, com uma confiança (%). Não treina nada.\n\nCOMANDOS\n    detect-labels, detect-text, detect-faces`,
    "rekognition.detect-labels": M("aws rekognition detect-labels --image '{\"S3Object\":{\"Bucket\":\"meu-bucket\",\"Name\":\"foto.jpg\"}}'", "Detecta objetos/cenas na imagem (Person, Laptop, Dog...) com a\nconfiança de cada rótulo."),
    "rekognition.detect-text": M("aws rekognition detect-text --image '{\"S3Object\":{...}}'", "Extrai texto da imagem (placas, documentos) — OCR."),
    "rekognition.detect-faces": M("aws rekognition detect-faces --image '{\"S3Object\":{...}}'", "Analisa rostos: idade estimada, emoção, se está sorrindo."),

    translate: `aws translate — Amazon Translate\n\nTradução neural sob demanda. Suporta 'auto' pra detectar o idioma de\norigem. Ótimo pra legendas, suporte multilíngue e localização.\n\nCOMANDOS\n    translate-text, list-languages`,
    "translate.translate-text": M("aws translate translate-text --text \"hello world\" --source-language-code en --target-language-code pt", "Traduz um texto. Use 'auto' no source pra detectar o idioma sozinho."),
    "translate.list-languages": M("aws translate list-languages", "Lista os idiomas suportados."),

    polly: `aws polly — Amazon Polly\n\nTransforma texto em voz (fala) com vozes naturais. Suporta SSML pra\ncontrolar entonação. Usos: acessibilidade, URA de telefonia, narração.\n\nCOMANDOS\n    synthesize-speech, describe-voices`,
    "polly.synthesize-speech": M("aws polly synthesize-speech --text \"Bem-vindo\" --output-format mp3 --voice-id Camila fala.mp3", "Gera o áudio e (na AWS real) salva no arquivo de saída. voice-id\nescolhe a voz (Camila/Thiago em pt-BR)."),
    "polly.describe-voices": M("aws polly describe-voices --language-code pt-BR", "Lista as vozes disponíveis, por idioma e motor (neural/standard)."),

    comprehend: `aws comprehend — Amazon Comprehend\n\nEntende texto (NLP): sentimento, idioma, entidades (nomes, lugares) e\nfrases-chave. Empresas jogam avaliações/tickets nele pra medir satisfação.\n\nCOMANDOS\n    detect-sentiment, detect-entities, detect-dominant-language`,
    "comprehend.detect-sentiment": M("aws comprehend detect-sentiment --text \"adorei o produto\" --language-code pt", "Classifica o sentimento: POSITIVE, NEGATIVE, NEUTRAL ou MIXED, com\nas notas de cada um."),
    "comprehend.detect-entities": M("aws comprehend detect-entities --text \"...\" --language-code pt", "Extrai entidades: pessoas, organizações, lugares, datas."),
    "comprehend.detect-dominant-language": M("aws comprehend detect-dominant-language --text \"...\"", "Detecta o idioma predominante do texto."),

    bedrock: `aws bedrock — Amazon Bedrock\n\nO balcão de IA generativa: vários modelos (Claude da Anthropic, Titan,\nLlama) atrás de uma API só, sem gerenciar servidor. Este 'bedrock' cuida\ndo catálogo; a INVOCAÇÃO é no 'bedrock-runtime'.\n\nCOMANDOS\n    list-foundation-models, get-foundation-model`,
    "bedrock.list-foundation-models": M("aws bedrock list-foundation-models", "Lista os modelos disponíveis (modelId, provedor)."),
    "bedrock.get-foundation-model": M("aws bedrock get-foundation-model --model-identifier anthropic.claude-3-5-sonnet-20240620-v1:0", "Detalha um modelo (modalidades, streaming)."),

    "bedrock-runtime": `aws bedrock-runtime — invocação de modelos do Bedrock\n\nÉ o serviço que de fato CHAMA o modelo com o seu prompt. O --body leva o\npayload no formato do modelo escolhido.\n\nCOMANDOS\n    invoke-model`,
    "bedrock-runtime.invoke-model": M("aws bedrock-runtime invoke-model --model-id anthropic.claude-3-5-sonnet-20240620-v1:0 --body '{...messages...}' resposta.json", "Invoca o modelo. A resposta vem no arquivo de saída. É assim que se\ncoloca IA generativa num app sem MLOps."),

    kinesis: `aws kinesis — Amazon Kinesis Data Streams\n\nUm \"cano\" pra dados que chegam sem parar (cliques, sensores, logs).\nVários produtores escrevem, vários consumidores leem em tempo real. Os\nshards definem a vazão.\n\nCOMANDOS\n    create-stream, describe-stream, list-streams, put-record, delete-stream`,
    "kinesis.create-stream": M("aws kinesis create-stream --stream-name eventos-loja --shard-count 1", "Cria um stream. Mais shards = mais vazão."),
    "kinesis.describe-stream": M("aws kinesis describe-stream --stream-name eventos-loja", "Detalha o stream: status, shards, retenção."),
    "kinesis.list-streams": M("aws kinesis list-streams", "Lista os nomes dos streams."),
    "kinesis.put-record": M("aws kinesis put-record --stream-name eventos-loja --data \"clique-42\" --partition-key user1", "Coloca um registro no stream. A partition-key decide em qual shard\ncai (e mantém a ordem por chave)."),
    "kinesis.delete-stream": M("aws kinesis delete-stream --stream-name eventos-loja", "Apaga o stream."),

    redshift: `aws redshift — Amazon Redshift\n\nData warehouse: banco feito pra ANALISAR bilhões de linhas (BI,\nrelatórios), não pra transação do dia a dia (isso é o RDS). Guarda por\nCOLUNA, o que deixa consultas analíticas muito rápidas.\n\nCOMANDOS\n    create-cluster, describe-clusters, delete-cluster`,
    "redshift.create-cluster": M("aws redshift create-cluster --cluster-identifier analitica-loja --node-type dc2.large --master-username admin --master-user-password <senha> --number-of-nodes 1", "Cria o cluster do warehouse. Nunca use senha real num simulador."),
    "redshift.describe-clusters": M("aws redshift describe-clusters", "Lista os clusters e seus endpoints (porta 5439)."),
    "redshift.delete-cluster": M("aws redshift delete-cluster --cluster-identifier analitica-loja --skip-final-cluster-snapshot", "Apaga o cluster. A AWS exige você decidir sobre o backup final:\n--skip-final-cluster-snapshot OU --final-cluster-snapshot-identifier <nome>."),
  });
})();
