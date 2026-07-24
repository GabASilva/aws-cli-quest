"use strict";
// ============================================================
// CLImb — licoes-fase6-9.js
// Parte didática (bloco "Entenda o serviço" + "Por que este comando") dos
// serviços das fases 6 a 9. Carrega DEPOIS de licoes.js, então LICOES, PORQUE
// e LICAO_ALIAS já existem — a gente só complementa com Object.assign.
// Regra do projeto (CLAUDE.md): todo serviço novo entra com lição + PORQUE.
// ============================================================
(function () {
  if (typeof LICOES === "undefined" || typeof PORQUE === "undefined") return;

  // bedrock-runtime usa a mesma lição do bedrock (é a "invocação" do balcão).
  if (typeof LICAO_ALIAS !== "undefined") LICAO_ALIAS["bedrock-runtime"] = "bedrock";

  Object.assign(LICOES, {
    // ===================== Fase 6 =====================
    elbv2: {
      emoji: "⚖️", titulo: "Elastic Load Balancing",
      oque: "O <b>load balancer</b> fica na frente de várias máquinas e <b>reparte as requisições</b> entre elas. Se uma instância cai (falha no health check), ele para de mandar tráfego pra ela sozinho — sem ninguém perceber por fora.",
      serve: "Distribuir a carga de um site/API entre várias instâncias, pra aguentar mais gente e não cair quando uma máquina morre. É a peça que dá <b>escala e tolerância a falhas</b> pro EC2.",
      casos: [
        "Uma loja com 4 servidores web coloca um ALB na frente — os visitantes batem no ALB, ele divide entre os 4.",
        "Quando o Auto Scaling sobe uma máquina nova, ela é registrada no load balancer e já começa a receber tráfego.",
        "Se um servidor trava, o health check reprova e o ALB desvia todo mundo pros que estão saudáveis.",
      ],
      vocab: [
        ["ALB", "Application Load Balancer — trabalha no nível HTTP (camada 7), entende caminhos e cabeçalhos."],
        ["Target group", "o \"grupo de destino\": onde você registra as instâncias que vão receber o tráfego."],
        ["Listener", "quem escuta numa porta (80/443) e encaminha pro target group."],
        ["Health check", "a checagem periódica que decide se uma instância está saudável pra receber tráfego."],
      ],
      cobra: "Paga por hora do load balancer + uma unidade de uso (LCU). Barato perto do que resolve: um único ponto de entrada que não cai quando uma máquina cai.",
    },
    elasticbeanstalk: {
      emoji: "🌱", titulo: "Elastic Beanstalk",
      oque: "O Beanstalk é o <b>\"deploy fácil\"</b> da AWS: você sobe o código e ele monta EC2, load balancer e Auto Scaling <b>por baixo, sozinho</b>. Você cuida do app; ele cuida da infra.",
      serve: "Colocar uma aplicação web no ar rápido sem configurar cada peça na mão. Ótimo pra quem quer focar no código e não em rede/servidor — mas ainda com acesso à infra caso precise ajustar.",
      casos: [
        "Um dev sobe uma API em Python com um comando e o Beanstalk cria toda a infra de produção.",
        "Uma startup usa Beanstalk pra ter ambientes separados de dev, staging e prod da mesma app.",
        "Ao encerrar o ambiente, toda a infra (EC2, ALB, Auto Scaling) some junto — sem deixar recurso órfão pagando.",
      ],
      vocab: [
        ["Aplicação", "o \"projeto\" — o guarda-chuva que agrupa os ambientes."],
        ["Environment (ambiente)", "uma instância rodando da aplicação: prod, dev... é aqui que a infra sobe."],
        ["Solution stack", "a plataforma que roda o código (ex.: Amazon Linux + Python 3.12)."],
        ["CNAME", "a URL do ambiente (…elasticbeanstalk.com)."],
      ],
      cobra: "O Beanstalk é de graça — você paga só os recursos que ele cria (o EC2, o load balancer etc.). É um \"gerente\" gratuito da sua infra.",
    },
    efs: {
      emoji: "📁", titulo: "Amazon EFS",
      oque: "O EFS é um <b>disco de rede que várias máquinas montam ao mesmo tempo</b>. Diferente do EBS (que é um disco preso a UMA instância), o EFS é compartilhado — todo mundo lê e escreve nos mesmos arquivos.",
      serve: "Guardar arquivos que precisam ser vistos por várias instâncias juntas: uploads de um site com vários servidores, pastas compartilhadas, conteúdo de um CMS. Cresce e encolhe sozinho conforme você usa.",
      casos: [
        "Um site em 3 servidores guarda os uploads dos usuários num EFS — os 3 enxergam os mesmos arquivos.",
        "Um cluster de processamento lê os mesmos dados de entrada montando o EFS em todas as máquinas.",
        "Uma aplicação legada que espera uma pasta compartilhada (NFS) roda na nuvem usando EFS.",
      ],
      vocab: [
        ["File system", "o disco compartilhado em si (fs-...)."],
        ["Mount target", "o ponto de conexão do EFS numa sub-rede — é por ele que as instâncias daquela sub-rede montam o disco."],
        ["Creation token", "um apelido que evita criar dois file systems iguais sem querer (idempotência)."],
        ["NFS", "o protocolo de rede que o EFS fala — o mesmo de pastas compartilhadas no Linux."],
      ],
      cobra: "Paga por GB armazenado por mês (não precisa provisionar tamanho — cresce sozinho). Mais caro que o S3 por GB, mas é um sistema de arquivos de verdade, montável.",
    },
    elasticache: {
      emoji: "⚡", titulo: "Amazon ElastiCache",
      oque: "O ElastiCache é um <b>cache em memória</b> gerenciado (Redis ou Memcached). Ele guarda na RAM o que é caro de buscar, pra a aplicação ler em <b>microssegundos</b> em vez de bater no banco toda hora.",
      serve: "Acelerar aplicações e aliviar o banco de dados: guardar resultados de consultas pesadas, sessões de usuário, rankings, contadores. É o truque nº 1 pra deixar um site rápido sob carga.",
      casos: [
        "Um e-commerce guarda no Redis a lista de produtos mais vistos, servida instantaneamente sem consultar o banco.",
        "Um app guarda a sessão do usuário logado no cache, compartilhada entre todos os servidores.",
        "Um placar de jogo em tempo real usa o Redis pra ordenar milhões de pontuações rapidíssimo.",
      ],
      vocab: [
        ["Redis", "o motor mais usado — além de cache, faz listas, contadores, pub/sub."],
        ["Memcached", "motor mais simples, só chave-valor em memória."],
        ["Node", "cada máquina do cluster de cache."],
        ["Endpoint", "o endereço que a aplicação usa pra falar com o cache."],
      ],
      cobra: "Paga por hora de cada nó ligado (como o EC2). O ganho é indireto: menos carga no banco e páginas mais rápidas.",
    },
    acm: {
      emoji: "🔏", titulo: "AWS Certificate Manager",
      oque: "O ACM <b>emite certificados SSL/TLS de graça</b> — o \"cadeado\" do HTTPS. Ele também renova sozinho, então você nunca mais esquece um certificado vencendo e derrubando o site.",
      serve: "Colocar HTTPS (o cadeado) no seu site sem pagar e sem trabalho manual. Você pluga o certificado no load balancer ou no CloudFront, e o tráfego passa a ser criptografado.",
      casos: [
        "Uma loja pede um certificado pro seu domínio e ativa HTTPS no load balancer — o cadeado aparece no navegador.",
        "Um certificado prestes a vencer é renovado automaticamente pelo ACM, sem ninguém mexer.",
        "Um site atrás do CloudFront usa um certificado do ACM pra servir tudo por HTTPS globalmente.",
      ],
      vocab: [
        ["Certificado", "o arquivo que prova a identidade do site e permite a criptografia (HTTPS)."],
        ["Validação DNS", "você prova que é dono do domínio criando um registro no Route 53 — e o ACM renova sozinho."],
        ["PENDING_VALIDATION", "o estado do certificado enquanto você ainda não provou que é dono do domínio."],
        ["ARN", "o identificador do certificado, que você referencia no load balancer/CloudFront."],
      ],
      cobra: "Certificados públicos do ACM são <b>gratuitos</b>. Você paga só o recurso onde ele é usado (o load balancer, por exemplo).",
    },

    // ===================== Fase 7 =====================
    budgets: {
      emoji: "💰", titulo: "AWS Budgets",
      oque: "O Budgets define <b>tetos de gasto</b> e te <b>avisa</b> quando você chega perto. Atenção: ele não BLOQUEIA o gasto — ele manda um e-mail. É o cinto de segurança contra a \"fatura surpresa\".",
      serve: "Não tomar susto no fim do mês. Você diz \"me avise se eu passar de US$ 50\" e recebe alerta ao cruzar o limite — dá tempo de reagir antes do estrago crescer.",
      casos: [
        "Um estudante põe um orçamento de US$ 5/mês pra não passar do free tier sem perceber.",
        "Uma empresa cria um orçamento por time e avisa o responsável quando o time passa de 80% do previsto.",
        "Um alerta de orçamento dispara e o time descobre uma instância cara ligada por engano.",
      ],
      vocab: [
        ["Budget", "o orçamento: um teto de gasto num período (mensal, por exemplo)."],
        ["Threshold", "o percentual que dispara o alerta (ex.: avise em 80%)."],
        ["Notification", "o alerta em si — sem ela, o orçamento não avisa ninguém."],
        ["Subscriber", "quem recebe o alerta (um e-mail ou um tópico SNS)."],
      ],
      cobra: "Os dois primeiros orçamentos são de graça; a partir daí custa alguns centavos por orçamento/dia. Barato perto de uma fatura estourada.",
    },
    ce: {
      emoji: "📊", titulo: "AWS Cost Explorer",
      oque: "O Cost Explorer mostra <b>quanto e onde você gastou</b>, e <b>projeta</b> a fatura. É a ferramenta pra responder \"por que minha conta veio tão cara?\" — normalmente o vilão é EC2 ou transferência de dados.",
      serve: "Investigar custos: quebrar o gasto por serviço, por tag, por período, e ver a tendência. É o primeiro lugar pra onde você olha quando a fatura assusta.",
      casos: [
        "A conta veio o dobro do mês passado; agrupando por serviço, o time descobre que foi transferência de dados.",
        "Um gestor usa a previsão (forecast) pra estimar quanto vai fechar o mês e ajustar antes.",
        "Marcando recursos com tags de projeto, a empresa vê quanto cada projeto custa separadamente.",
      ],
      vocab: [
        ["UnblendedCost", "o custo \"real\" de cada linha — a métrica mais usada."],
        ["Group by", "como quebrar o gasto: por SERVICE (serviço), por TAG, por região..."],
        ["Forecast", "a previsão de gasto até o fim do período, no ritmo atual."],
        ["Granularity", "o nível de detalhe do tempo: DAILY ou MONTHLY."],
      ],
      cobra: "Ver os gráficos no console é de graça; cada consulta pela API (como estas do CLI) custa alguns centavos. Ironia útil: gastar centavos pra economizar dólares.",
    },
    organizations: {
      emoji: "🏢", titulo: "AWS Organizations",
      oque: "O Organizations junta <b>várias contas AWS sob uma \"management account\"</b>: fatura única (consolidada), contas separadas por time/ambiente e <b>regras centrais</b> (SCPs) que limitam o que cada conta pode fazer.",
      serve: "Organizar uma empresa na AWS: uma conta pra produção, outra pra dev, outra pro time de dados — todas isoladas, mas com uma fatura só e políticas aplicadas de cima. É a base de qualquer setup profissional.",
      casos: [
        "Uma empresa separa produção e desenvolvimento em contas diferentes pra um acidente no dev nunca tocar o prod.",
        "Uma SCP na organização proíbe qualquer conta de criar recursos fora da região do Brasil.",
        "O financeiro recebe uma fatura consolidada de todas as contas, com desconto por volume somado.",
      ],
      vocab: [
        ["Management account", "a conta \"mãe\", que cria as outras e paga a fatura de todas."],
        ["Conta-membro", "cada conta-filha, isolada, criada dentro da organização."],
        ["OU (Organizational Unit)", "uma \"pasta\" de contas — regras aplicadas nela valem pra todas dentro."],
        ["SCP", "Service Control Policy: um limite máximo de permissões pra uma conta ou OU."],
      ],
      cobra: "O Organizations é de graça. E costuma economizar: a fatura consolidada soma o uso de todas as contas pros descontos por volume.",
    },
    support: {
      emoji: "🧭", titulo: "AWS Trusted Advisor",
      oque: "O Trusted Advisor é um <b>consultor automático</b>: ele varre sua conta e aponta oportunidades de <b>economia</b>, falhas de <b>segurança</b>, <b>limites</b> perto de estourar e pontos de <b>tolerância a falhas</b>.",
      serve: "Receber uma \"revisão\" da sua conta sem contratar ninguém: instâncias ociosas que dão pra desligar, security groups abertos demais, buckets públicos, limites de serviço chegando no teto.",
      casos: [
        "O Trusted Advisor aponta 3 instâncias com uso baixíssimo — o time desliga e economiza.",
        "Uma checagem de segurança acusa um security group liberando a porta 22 pro mundo inteiro.",
        "Um alerta avisa que a conta está perto do limite de IPs elásticos, antes de dar erro em produção.",
      ],
      vocab: [
        ["Check", "cada checagem (tem id e categoria: security, cost_optimizing, performance...)."],
        ["Categoria", "o tipo da recomendação: custo, segurança, desempenho, limites, tolerância a falhas."],
        ["Status", "ok (verde), warning (amarelo) ou error (vermelho)."],
        ["Support plan", "as checagens completas exigem plano Business/Enterprise; o básico traz um subconjunto."],
      ],
      cobra: "Um conjunto básico de checagens é de graça; as completas vêm com os planos de suporte pagos. O retorno vem em economia e segurança.",
    },

    // ===================== Fase 8 =====================
    guardduty: {
      emoji: "🛡️", titulo: "Amazon GuardDuty",
      oque: "O GuardDuty é <b>detecção de ameaças que roda sozinha</b>. Ele lê seus logs (VPC Flow, DNS, CloudTrail) e usa <b>machine learning</b> pra achar comportamento suspeito — sem você escrever uma regra sequer.",
      serve: "Descobrir que você está sob ataque: força-bruta de SSH, mineração de cripto numa instância invadida, acesso vindo de um país estranho, comunicação com servidores maliciosos conhecidos.",
      casos: [
        "O GuardDuty detecta uma instância minerando cripto e avisa — sinal de que ela foi comprometida.",
        "Um finding aponta várias tentativas de login SSH falhando: alguém tentando força-bruta.",
        "Um alerta mostra acesso à API a partir de um IP conhecido por atividade maliciosa.",
      ],
      vocab: [
        ["Detector", "o \"olho\" do GuardDuty na região — precisa existir pra ele funcionar."],
        ["Finding", "cada suspeita encontrada, com um tipo e uma gravidade (0 a 10)."],
        ["Gravidade", "quão sério é: baixa (recon), média, alta (comprometimento em andamento)."],
        ["Fonte", "os logs que ele analisa: VPC Flow Logs, DNS e CloudTrail."],
      ],
      cobra: "Paga pela quantidade de logs/eventos analisados. Costuma sair barato e tem teste grátis — é dos primeiros serviços de segurança que se liga numa conta.",
    },
    inspector2: {
      emoji: "🔎", titulo: "Amazon Inspector",
      oque: "O Inspector <b>escaneia suas máquinas e imagens de container atrás de vulnerabilidades conhecidas</b> (CVEs) e software desatualizado. Enquanto o GuardDuty vê o ATAQUE, o Inspector vê as <b>brechas</b> que o ataque usaria.",
      serve: "Saber onde você está exposto ANTES de ser atacado: qual pacote tem uma falha conhecida, qual imagem de container precisa de atualização. Ele prioriza pela gravidade (nota CVSS).",
      casos: [
        "O Inspector acha uma versão vulnerável do OpenSSL numa instância e sugere atualizar o pacote.",
        "Uma imagem de container no ECR é escaneada e reprovada por ter uma CVE crítica antes de ir pra produção.",
        "O time roda o Inspector no pipeline e bloqueia deploys com vulnerabilidades altas.",
      ],
      vocab: [
        ["CVE", "o código padrão de uma vulnerabilidade conhecida (ex.: CVE-2024-1234)."],
        ["CVSS", "a nota de gravidade da vulnerabilidade (0 a 10)."],
        ["Finding", "cada brecha achada, com o pacote afetado e como corrigir."],
        ["Cobertura", "o que ele escaneia: EC2, imagens no ECR e funções Lambda."],
      ],
      cobra: "Paga por recurso escaneado por mês. É contínuo: liga uma vez e ele re-escaneia sempre que aparece uma CVE nova.",
    },
    macie2: {
      emoji: "🕵️", titulo: "Amazon Macie",
      oque: "O Macie <b>vasculha seus buckets S3 procurando dados sensíveis</b> — CPF, número de cartão, chaves de API — que alguém subiu sem querer. É o especialista em \"vazamento de dado no S3\".",
      serve: "Descobrir dado pessoal/financeiro exposto no S3 antes que vire um incidente de LGPD. Ele classifica automaticamente o que encontra e diz em qual bucket/objeto está.",
      casos: [
        "O Macie encontra uma planilha com milhares de CPFs num bucket que estava público.",
        "Um scan acha chaves de API vazadas dentro de um arquivo de log subido por engano.",
        "Uma empresa usa o Macie pra comprovar, numa auditoria, onde os dados sensíveis estão guardados.",
      ],
      vocab: [
        ["Classification job", "o job que lê os objetos do bucket e classifica o conteúdo."],
        ["Dado sensível", "PII (dado pessoal) e dado financeiro — o que o Macie caça."],
        ["Finding", "cada achado: o tipo de dado e onde está."],
        ["ONE_TIME / SCHEDULED", "o job roda uma vez ou de forma recorrente."],
      ],
      cobra: "Paga por bucket monitorado + por GB inspecionado nos jobs. Usa-se em cima do que importa (buckets com dado sensível), não em tudo.",
    },
    wafv2: {
      emoji: "🧱", titulo: "AWS WAF",
      oque: "O WAF é o <b>firewall da camada de aplicação (HTTP)</b>. Ele barra SQL injection, XSS, bots e excesso de requisições <b>antes de chegar na sua app</b>. Você o pluga num load balancer, API Gateway ou CloudFront.",
      serve: "Proteger sites e APIs dos ataques web mais comuns sem mexer no código. As regras gerenciadas da AWS já cobrem o \"kit básico\" de ataques — você liga e está protegido.",
      casos: [
        "Uma API pública ativa o WAF com regras gerenciadas e passa a bloquear tentativas de SQL injection.",
        "Um site sob ataque de bots usa uma regra de rate limit pra cortar quem faz requisições demais.",
        "Uma loja bloqueia por país no WAF pra reduzir fraude vinda de regiões onde não vende.",
      ],
      vocab: [
        ["Web ACL", "o conjunto de regras que você aplica a um recurso."],
        ["Scope", "onde vale: REGIONAL (load balancer/API) ou CLOUDFRONT (CDN)."],
        ["Regra gerenciada", "pacotes de regras prontas da AWS (contra SQLi, XSS, bots...)."],
        ["Rate limit", "regra que corta quem faz requisições demais em pouco tempo."],
      ],
      cobra: "Paga por Web ACL, por regra e por milhão de requisições inspecionadas. Escala com o tráfego que ele filtra.",
    },
    shield: {
      emoji: "⛨", titulo: "AWS Shield",
      oque: "O Shield <b>protege contra ataques de negação de serviço (DDoS)</b> — aquele em que muitas máquinas inundam seu site pra derrubá-lo. O <b>Shield Standard é grátis e automático</b> pra todos.",
      serve: "Manter o site no ar durante um ataque volumétrico. O Standard já barra os ataques de rede mais comuns sozinho; o Advanced (pago) dá proteção maior e acesso a um time de resposta da AWS.",
      casos: [
        "Um ataque DDoS de rede é absorvido pelo Shield Standard sem o dono do site nem perceber.",
        "Uma empresa com alvo frequente assina o Shield Advanced pra ter proteção reforçada e suporte 24/7.",
        "Numa prova de certificação, a resposta pra \"como mitigar DDoS?\" é: Shield.",
      ],
      vocab: [
        ["DDoS", "ataque distribuído que inunda o alvo de tráfego pra derrubá-lo."],
        ["Shield Standard", "proteção automática e gratuita contra os ataques de rede comuns."],
        ["Shield Advanced", "camada paga: proteção maior, relatórios e time de resposta (DRT)."],
        ["Camada 3/4 x 7", "rede/transporte (Shield) x aplicação (aí entra o WAF junto)."],
      ],
      cobra: "O Standard é <b>grátis</b> pra todos. O Advanced é uma assinatura mensal fixa (cara), pra quem é alvo frequente.",
    },
    configservice: {
      emoji: "🎥", titulo: "AWS Config",
      oque: "O AWS Config é a <b>\"câmera de segurança\" da sua conta</b>: ele grava o histórico de configuração de cada recurso e avalia se está no padrão. Responde \"quem mudou esse security group e quando?\" e \"o que está fora da política?\".",
      serve: "Auditoria e conformidade: ter o histórico de mudanças pra investigar incidentes, e regras que marcam recursos fora do padrão (ex.: \"todo bucket S3 tem que ter criptografia\"). Essencial pra LGPD e auditorias.",
      casos: [
        "Depois de um incidente, o time usa o Config pra ver exatamente quando e como um recurso foi alterado.",
        "Uma config rule marca como NON_COMPLIANT qualquer bucket S3 criado sem criptografia.",
        "Um auditor recebe um relatório de conformidade gerado direto pelo Config.",
      ],
      vocab: [
        ["Configuration recorder", "o \"gravador\" que registra o estado dos recursos ao longo do tempo."],
        ["Config rule", "uma regra que avalia se os recursos estão no padrão (compliant ou não)."],
        ["Regra gerenciada", "regras prontas da AWS (Owner AWS), como a de criptografia do S3."],
        ["NON_COMPLIANT", "o estado de um recurso que viola uma regra."],
      ],
      cobra: "Paga por item de configuração gravado e por avaliação de regra. Cresce com o tamanho e a movimentação da conta.",
    },

    // ===================== Fase 9 =====================
    rekognition: {
      emoji: "👁️", titulo: "Amazon Rekognition",
      oque: "O Rekognition é <b>IA de visão pronta</b>: você manda uma imagem (do S3 ou em bytes) e recebe o que tem nela — objetos, texto, rostos, emoções — cada um com uma confiança (%). <b>Você não treina modelo nenhum.</b>",
      serve: "Colocar visão computacional num app sem ser especialista em IA: moderar conteúdo, ler texto de documentos, detectar rostos pra controle de acesso, marcar fotos automaticamente.",
      casos: [
        "Um app de fotos gera tags automáticas (praia, cachorro, comida) pra o usuário buscar depois.",
        "Um sistema lê o texto de placas ou documentos enviados como imagem (OCR).",
        "Uma rede social usa moderação pra barrar imagens impróprias antes de publicar.",
      ],
      vocab: [
        ["Label", "um rótulo detectado na imagem (Person, Car...) com a confiança."],
        ["Confidence", "o quão certo a IA está daquele resultado (0 a 100%)."],
        ["detect-text", "OCR: extrair texto que aparece dentro da imagem."],
        ["S3Object", "o jeito de apontar a imagem: bucket + nome, sem precisar enviar os bytes."],
      ],
      cobra: "Paga por imagem processada. Sem custo fixo — você chama a API só quando precisa analisar algo.",
    },
    translate: {
      emoji: "🌐", titulo: "Amazon Translate",
      oque: "O Translate faz <b>tradução neural sob demanda</b>: você manda um texto e o idioma de destino, e recebe a tradução na hora. Suporta <b>auto</b> pra detectar o idioma de origem sozinho.",
      serve: "Traduzir conteúdo em tempo real dentro de um app: legendas, mensagens de suporte, descrições de produto, chat multilíngue — sem depender de um tradutor humano pra cada frase.",
      casos: [
        "Um suporte traduz automaticamente as mensagens do cliente estrangeiro pro atendente.",
        "Um marketplace traduz as descrições de produto pra vários idiomas de uma vez.",
        "Um app de notícias oferece o mesmo artigo em português, inglês e espanhol.",
      ],
      vocab: [
        ["source-language-code", "o idioma de origem (ou 'auto' pra detectar)."],
        ["target-language-code", "o idioma pro qual traduzir (pt, en, es...)."],
        ["Tradução neural", "usa redes neurais — mais fluente que a tradução palavra-a-palavra antiga."],
        ["Batch", "dá pra traduzir muitos documentos de uma vez a partir do S3."],
      ],
      cobra: "Paga por caractere traduzido. Textos curtos custam frações de centavo; escala linear com o volume.",
    },
    polly: {
      emoji: "🗣️", titulo: "Amazon Polly",
      oque: "O Polly <b>transforma texto em voz (fala)</b> com vozes bem naturais. Dá pra usar <b>SSML</b> pra controlar entonação, pausas e ênfase — a fala não soa robótica.",
      serve: "Dar voz a aplicações: leitores de tela pra acessibilidade, URA de telefonia (\"digite 1 para...\"), narração de artigos, assistentes que falam. Tudo por API, sem estúdio.",
      casos: [
        "Um site de notícias oferece \"ouvir o artigo\" gerando o áudio com o Polly.",
        "Uma central telefônica usa o Polly pra ler as opções do menu automático.",
        "Um app de acessibilidade lê em voz alta o conteúdo da tela pra usuários com baixa visão.",
      ],
      vocab: [
        ["voice-id", "a voz escolhida (ex.: Camila, Thiago em pt-BR)."],
        ["output-format", "o formato do áudio gerado (mp3, ogg, pcm)."],
        ["SSML", "marcação pra controlar entonação, pausas e ênfase da fala."],
        ["Neural", "motor de voz mais avançado, com fala mais natural."],
      ],
      cobra: "Paga por caractere convertido em áudio. Tem uma cota grátis generosa por mês — barato pra a maioria dos usos.",
    },
    comprehend: {
      emoji: "💬", titulo: "Amazon Comprehend",
      oque: "O Comprehend <b>entende texto</b> (NLP): descobre o <b>sentimento</b> (positivo/negativo), o <b>idioma</b>, as <b>entidades</b> (nomes, lugares, organizações) e as frases-chave — tudo por API, sem treinar nada.",
      serve: "Analisar texto em escala: medir a satisfação em milhares de avaliações, classificar tickets de suporte, extrair informação de documentos. O que um humano faria lendo, ele faz em massa.",
      casos: [
        "Uma loja mede automaticamente se as avaliações dos produtos são positivas ou negativas.",
        "Um suporte classifica os tickets por assunto e urgência lendo o texto com o Comprehend.",
        "Um jurídico extrai nomes, datas e valores de contratos automaticamente.",
      ],
      vocab: [
        ["Sentiment", "POSITIVE, NEGATIVE, NEUTRAL ou MIXED, com as notas de cada um."],
        ["Entity", "algo reconhecido no texto: pessoa, lugar, organização, data..."],
        ["Key phrase", "as frases-chave que resumem o assunto do texto."],
        ["language-code", "o idioma do texto (pt, en...) — obrigatório na maioria das chamadas."],
      ],
      cobra: "Paga por unidade de texto analisada (blocos de 100 caracteres). Escala com o volume de texto processado.",
    },
    bedrock: {
      emoji: "🤖", titulo: "Amazon Bedrock",
      oque: "O Bedrock é o <b>balcão de IA generativa da AWS</b>: vários modelos (Claude da Anthropic, Titan da Amazon, Llama da Meta) atrás de <b>uma API só</b>, sem você gerenciar servidor nem GPU. Você escolhe o modelo e manda o prompt.",
      serve: "Colocar IA generativa num app sem MLOps: chatbots, resumo de documentos, geração de texto, busca inteligente. Troca-se de modelo mudando um parâmetro, e o dado não sai da sua conta AWS.",
      casos: [
        "Um app de atendimento usa o Claude via Bedrock pra responder clientes em linguagem natural.",
        "Uma empresa resume contratos longos automaticamente chamando um modelo do Bedrock.",
        "Um time compara respostas de Claude, Titan e Llama trocando só o model-id.",
      ],
      vocab: [
        ["Foundation model", "um modelo pré-treinado grande (Claude, Titan, Llama...)."],
        ["model-id", "o identificador do modelo que você quer usar."],
        ["invoke-model", "a chamada que manda o prompt e recebe a resposta (no bedrock-runtime)."],
        ["body", "o payload da chamada, no formato que o modelo escolhido espera."],
      ],
      cobra: "Paga por token de entrada e de saída (pedaços de texto). Sem servidor pra manter ligado — paga só pelo que processa.",
    },
    kinesis: {
      emoji: "🌊", titulo: "Amazon Kinesis",
      oque: "O Kinesis é um <b>\"cano\" pra dados que chegam sem parar</b>: cliques, sensores IoT, logs, eventos. Vários produtores jogam dados dentro, vários consumidores leem <b>em tempo real</b>, na ordem.",
      serve: "Processar dados ao vivo, à medida que acontecem — em vez de esperar e processar em lote. Base de dashboards em tempo real, detecção de fraude na hora e pipelines de análise contínua.",
      casos: [
        "Um site joga cada clique num stream, e um painel mostra o comportamento dos usuários ao vivo.",
        "Sensores de uma fábrica mandam leituras pro Kinesis, e um alerta dispara na hora se algo sai do normal.",
        "Um Lambda consome o stream e vai despejando os dados no S3/Redshift pra análise depois.",
      ],
      vocab: [
        ["Stream", "o \"cano\" em si, onde os registros entram e saem."],
        ["Shard", "cada \"faixa\" do cano — mais shards, mais vazão."],
        ["Record", "cada dado colocado no stream."],
        ["Partition key", "decide em qual shard o registro cai (e mantém a ordem por chave)."],
      ],
      cobra: "Paga por shard/hora + por volume de dados. Você dimensiona os shards conforme a vazão que precisa.",
    },
    redshift: {
      emoji: "🏬", titulo: "Amazon Redshift",
      oque: "O Redshift é o <b>data warehouse</b> da AWS: um banco feito pra <b>analisar bilhões de linhas</b> (relatórios, BI), não pra transação do dia a dia (isso é o RDS). Ele guarda os dados <b>por coluna</b>, o que deixa consultas analíticas absurdamente rápidas.",
      serve: "Análise de grandes volumes: cruzar anos de vendas, montar dashboards de BI, rodar consultas pesadas que travariam um banco comum. É pra onde os dados vão depois de coletados, pra virar insight.",
      casos: [
        "Uma rede de lojas cruza 5 anos de vendas no Redshift pra achar padrões sazonais.",
        "Um time de BI conecta o Power BI ao Redshift pra montar relatórios sobre milhões de pedidos.",
        "Dados que chegam pelo Kinesis são despejados no Redshift pra análise histórica.",
      ],
      vocab: [
        ["Data warehouse", "banco otimizado pra ANÁLISE (ler muito), não pra transação (escrever pouco e rápido)."],
        ["Colunar", "guarda por coluna — consultas que somam/agrupam ficam muito mais rápidas."],
        ["Cluster / node", "o Redshift roda num cluster de máquinas; mais nós, mais capacidade."],
        ["Redshift x RDS", "Redshift = análise/BI; RDS = o banco do dia a dia da aplicação."],
      ],
      cobra: "Paga por hora de cluster ligado (ou por consulta, no modo Serverless). É um recurso robusto — dá pra pausar quando não está analisando.",
    },
  });

  Object.assign(PORQUE, {
    // ELB
    "elbv2.describe-load-balancers": "lista os balanceadores que você tem. É o \"o que já existe?\" antes de criar ou apagar.",
    "elbv2.create-load-balancer": "cria o balanceador que vai ficar na frente das máquinas. Precisa de 2+ sub-redes pra ficar espalhado em zonas (alta disponibilidade).",
    "elbv2.create-target-group": "cria o \"grupo de destino\" onde você registra as instâncias. O balanceador manda o tráfego pra este grupo.",
    "elbv2.register-targets": "coloca instâncias no target group. Só as registradas (e saudáveis) recebem tráfego.",
    "elbv2.describe-target-health": "mostra quais alvos estão saudáveis. É o health check que decide pra quem o balanceador manda requisição.",
    "elbv2.create-listener": "abre a porta de entrada: o listener escuta na 80/443 e encaminha pro target group. Sem ele, o balanceador não responde nada.",
    "elbv2.delete-load-balancer": "desmonta o balanceador (e os listeners dele) quando não precisa mais.",
    // Beanstalk
    "elasticbeanstalk.describe-applications": "lista as aplicações do Beanstalk. O ponto de partida pra ver o que já existe.",
    "elasticbeanstalk.create-application": "cria o \"projeto\" (a aplicação). Ainda não sobe infra — pra rodar, você cria um ambiente dentro dela.",
    "elasticbeanstalk.create-environment": "sobe um ambiente rodando a app — é aqui que o Beanstalk cria EC2, load balancer e Auto Scaling sozinho.",
    "elasticbeanstalk.describe-environments": "mostra os ambientes com Status, Health e o CNAME (a URL da app).",
    "elasticbeanstalk.terminate-environment": "encerra o ambiente — some com toda a infra que ele criou, sem deixar recurso órfão pagando.",
    "elasticbeanstalk.delete-application": "apaga a aplicação. A AWS recusa se ainda houver ambiente vivo.",
    // EFS
    "efs.describe-file-systems": "lista os discos compartilhados (EFS) que você tem.",
    "efs.create-file-system": "cria o disco compartilhado. O creation-token evita criar dois iguais sem querer.",
    "efs.create-mount-target": "cria o ponto de conexão do EFS numa sub-rede — é por ele que as máquinas daquela sub-rede montam o disco.",
    "efs.delete-mount-target": "remove o ponto de conexão. Precisa vir antes de apagar o file system.",
    "efs.delete-file-system": "apaga o disco compartilhado. A AWS recusa se ainda houver mount target ativo.",
    // ElastiCache
    "elasticache.describe-cache-clusters": "lista os clusters de cache existentes.",
    "elasticache.create-cache-cluster": "sobe um cache em memória (Redis/Memcached) pra a app ler em microssegundos, sem bater no banco toda hora.",
    "elasticache.delete-cache-cluster": "desliga e apaga um cluster de cache.",
    // ACM
    "acm.list-certificates": "lista os certificados SSL/TLS e o status de cada um.",
    "acm.request-certificate": "pede um certificado (grátis) pro seu domínio. Ele fica pendente até você provar que é dono (registro DNS).",
    "acm.describe-certificate": "mostra os detalhes de um certificado — inclusive se ainda está PENDING_VALIDATION.",
    "acm.delete-certificate": "revoga/apaga um certificado que não é mais usado.",
    // Budgets
    "budgets.describe-budgets": "lista seus orçamentos e o gasto atual de cada um.",
    "budgets.create-budget": "define um teto de gasto num período. Ele não bloqueia — serve pra ser avisado.",
    "budgets.create-notification": "liga o alerta: manda e-mail quando o gasto passa do limite. Sem isso, o orçamento não avisa ninguém.",
    "budgets.delete-budget": "remove um orçamento que não faz mais sentido.",
    // Cost Explorer
    "ce.get-cost-and-usage": "mostra quanto você gastou no período. Com --group-by por serviço, revela quem está pesando na fatura.",
    "ce.get-cost-forecast": "projeta quanto você vai gastar até o fim do período, no ritmo atual — pra reagir antes da fatura fechar.",
    // Organizations
    "organizations.create-organization": "cria a organização — a conta atual vira a \"mãe\" (management account) que cria e paga as outras.",
    "organizations.create-account": "cria uma conta-filha isolada dentro da organização, com fatura caindo na conta mãe.",
    "organizations.list-accounts": "lista todas as contas da organização (a mãe e as filhas).",
    "organizations.create-organizational-unit": "cria uma OU (uma \"pasta\" de contas) — regras aplicadas nela valem pra todas dentro.",
    // Trusted Advisor
    "support.describe-trusted-advisor-checks": "lista as checagens do Trusted Advisor (cada uma com id e categoria: custo, segurança...).",
    "support.describe-trusted-advisor-check-result": "mostra o resultado de uma checagem — o que ela encontrou e quantos recursos sinalizou.",
    // GuardDuty
    "guardduty.create-detector": "liga o GuardDuty na região. Sem o detector, ele não vigia nada.",
    "guardduty.list-detectors": "pega o id do detector — você precisa dele pra consultar os alertas.",
    "guardduty.list-findings": "lista as suspeitas (findings) que o GuardDuty encontrou nos seus logs.",
    // Inspector
    "inspector2.enable": "habilita o Inspector pra começar a escanear vulnerabilidades (CVEs) nos recursos.",
    "inspector2.list-findings": "lista as brechas achadas — cada uma com o CVE e o pacote afetado.",
    // Macie
    "macie2.enable-macie": "habilita o Macie na conta pra ele poder vasculhar os buckets S3.",
    "macie2.create-classification-job": "manda o Macie escanear buckets atrás de dado sensível (CPF, cartão, chaves).",
    // WAF
    "wafv2.create-web-acl": "cria o firewall de aplicação (Web ACL). O scope escolhe onde vale: load balancer/API (REGIONAL) ou CDN (CLOUDFRONT).",
    "wafv2.list-web-acls": "lista as Web ACLs de um escopo.",
    // Shield
    "shield.describe-subscription": "mostra sua assinatura do Shield (o Standard, grátis, já vem por padrão pra todos).",
    // Config
    "configservice.put-configuration-recorder": "cria o \"gravador\" que registra o histórico de configuração dos recursos. Sozinho ele ainda não grava.",
    "configservice.start-configuration-recorder": "liga a gravação — a partir daí toda mudança de config fica registrada.",
    "configservice.put-config-rule": "cria uma regra que marca recursos fora do padrão (ex.: bucket S3 sem criptografia).",
    // Rekognition
    "rekognition.detect-labels": "manda a imagem e recebe o que tem nela (objetos, cenas), com a confiança de cada rótulo.",
    "rekognition.detect-text": "extrai o texto que aparece dentro de uma imagem (OCR) — placas, documentos.",
    // Translate
    "translate.translate-text": "traduz um texto na hora. Use 'auto' na origem pra detectar o idioma sozinho.",
    // Polly
    "polly.synthesize-speech": "transforma o texto em áudio (fala), escolhendo a voz. Salva no arquivo de saída.",
    "polly.describe-voices": "lista as vozes disponíveis por idioma (ex.: Camila e Thiago em pt-BR).",
    // Comprehend
    "comprehend.detect-sentiment": "descobre se um texto é positivo, negativo, neutro ou misto — ótimo pra medir satisfação em massa.",
    "comprehend.detect-entities": "extrai do texto as entidades: pessoas, organizações, lugares, datas.",
    // Bedrock
    "bedrock.list-foundation-models": "lista os modelos de IA generativa disponíveis (Claude, Titan, Llama...).",
    "bedrock-runtime.invoke-model": "chama de fato o modelo com o seu prompt (no --body) e recebe a resposta. É assim que se coloca IA generativa num app.",
    // Kinesis
    "kinesis.create-stream": "cria o \"cano\" pra dados que chegam sem parar. Os shards definem a vazão.",
    "kinesis.put-record": "coloca um registro no stream. A partition-key decide em qual shard ele cai.",
    "kinesis.delete-stream": "fecha o cano (apaga o stream) quando não precisa mais.",
    // Redshift
    "redshift.describe-clusters": "lista os clusters do data warehouse e seus endpoints.",
    "redshift.create-cluster": "sobe o data warehouse pra análise de grandes volumes (BI). Lembre: Redshift = análise; RDS = transação.",
    "redshift.delete-cluster": "derruba o cluster. A AWS exige decidir sobre o backup final (--skip-final-cluster-snapshot pra pular).",
  });
})();
