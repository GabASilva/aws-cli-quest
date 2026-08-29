"use strict";
// ============================================================
// CLImb — banco de questões CLF-C02 (parte 6): lacunas de cobertura
//
// DE ONDE VEIO: auditei as 308 questões existentes e cruzei com os serviços
// que a CLF-C02 cobra. Oito serviços NUNCA apareciam (Transcribe, Storage
// Gateway, DataSync, FSx, DocumentDB, EventBridge, Amplify, License Manager)
// e dezessete apareciam só uma ou duas vezes. Esta parte fecha essas lacunas.
//
// A distribuição segue o peso oficial dos domínios da prova:
//   conceitos 24% · segurança 30% · tecnologia 34% · cobrança 12%
//
// Fatos conferidos na documentação da AWS em 28/08/2026. Dois pontos que
// mudaram e que o banco antigo ainda ensinava do jeito velho:
//   - Free Tier: virou "Free plan" com créditos (até US$ 200 em 6 meses).
//     A categoria "12 meses grátis" não existe mais para contas novas.
//   - Storage Gateway: são QUATRO tipos hoje, porque o File Gateway se
//     dividiu em Amazon S3 File Gateway e Amazon FSx File Gateway.
// ============================================================
(function () {
  if (typeof window === "undefined") return;
  const B = (window.SIMULADOS_CLF = window.SIMULADOS_CLF || []);
  const Q = [

    // ---------- TECNOLOGIA ----------
    { id: "clf-n01", d: "tecnologia", q: "Uma empresa precisa transcrever automaticamente gravações de atendimento telefônico em texto pesquisável. Qual serviço da AWS atende a esse requisito?",
      o: ["Amazon Transcribe", "Amazon Polly", "Amazon Translate", "Amazon Comprehend"], c: [0],
      e: "O Transcribe converte fala em texto (speech-to-text). O Polly faz o inverso (texto em fala), o Translate traduz entre idiomas e o Comprehend extrai sentimento e entidades de um texto que já existe." },

    { id: "clf-n02", d: "tecnologia", q: "Uma empresa tem um servidor de arquivos no próprio escritório e quer que ele use o Amazon S3 como armazenamento, sem reescrever as aplicações. Qual serviço permite isso?",
      o: ["AWS DataSync", "AWS Storage Gateway", "AWS Snowball", "Amazon EFS"], c: [1],
      e: "O Storage Gateway é híbrido: fica no ambiente local e expõe protocolos conhecidos (NFS, SMB, iSCSI, VTL) enquanto guarda os dados na AWS — as aplicações continuam iguais. O DataSync serve para COPIAR dados em massa, não para operar continuamente como um servidor de arquivos." },

    { id: "clf-n03", d: "tecnologia", q: "Quais são os tipos de gateway oferecidos hoje pelo AWS Storage Gateway?",
      o: ["Apenas File Gateway e Tape Gateway", "Amazon S3 File Gateway, Amazon FSx File Gateway, Volume Gateway e Tape Gateway", "Somente Volume Gateway", "Block Gateway e Object Gateway"], c: [1],
      e: "São quatro. ⚠️ Material mais antigo fala em TRÊS tipos (File, Volume e Tape) — o 'File Gateway' se dividiu depois em Amazon S3 File Gateway (arquivos vão para o S3) e Amazon FSx File Gateway (acesso local a compartilhamentos do FSx for Windows File Server). Volume Gateway entrega volumes iSCSI e Tape Gateway substitui fitas físicas. Se a prova listar três, é a nomenclatura antiga.",
      corrigido: true },

    { id: "clf-n04", d: "tecnologia", q: "Uma empresa quer migrar 200 TB de um NAS local para o Amazon S3 pela rede, de forma automatizada e com verificação de integridade. Qual serviço é mais indicado?",
      o: ["AWS DataSync", "AWS Storage Gateway", "Amazon S3 Transfer Acceleration", "AWS Direct Connect"], c: [0],
      e: "O DataSync é feito para transferência de dados em massa entre armazenamento local e AWS, com paralelismo, validação de integridade e agendamento. O Direct Connect é o link de rede dedicado — ele transporta, mas não faz a cópia." },

    { id: "clf-n05", d: "tecnologia", q: "Uma aplicação Windows precisa de um sistema de arquivos totalmente gerenciado com suporte a SMB e integração ao Active Directory. Qual serviço atende?",
      o: ["Amazon EFS", "Amazon FSx for Windows File Server", "Amazon S3", "Amazon EBS"], c: [1],
      e: "O Amazon FSx for Windows File Server entrega sistemas de arquivos Windows nativos (SMB, NTFS, integração com AD). O EFS é NFS, voltado a Linux; o EBS é disco de bloco de uma instância; o S3 é armazenamento de objetos." },

    { id: "clf-n06", d: "tecnologia", q: "Qual serviço da AWS oferece um banco de dados gerenciado compatível com MongoDB?",
      o: ["Amazon DynamoDB", "Amazon DocumentDB", "Amazon Neptune", "Amazon Keyspaces"], c: [1],
      e: "O DocumentDB é compatível com MongoDB. O DynamoDB é NoSQL chave-valor próprio da AWS, o Neptune é banco de grafos e o Keyspaces é compatível com Apache Cassandra." },

    { id: "clf-n07", d: "tecnologia", q: "Uma empresa quer conectar eventos de vários serviços da AWS e de aplicações SaaS a diferentes destinos, usando regras de roteamento. Qual serviço faz isso?",
      o: ["Amazon SQS", "Amazon SNS", "Amazon EventBridge", "AWS Step Functions"], c: [2],
      e: "O EventBridge é um barramento de eventos: recebe eventos de serviços AWS, de aplicações próprias e de parceiros SaaS, e roteia por regras. O SNS é publicação/assinatura de mensagens e o SQS é fila; nenhum dos dois faz roteamento por conteúdo do evento como o EventBridge." },

    { id: "clf-n08", d: "tecnologia", q: "Qual serviço ajuda a desenvolver e hospedar aplicações web e móveis full-stack, com CI/CD e hospedagem de front-end integrados?",
      o: ["AWS Amplify", "AWS Elastic Beanstalk", "Amazon Lightsail", "AWS AppRunner"], c: [0],
      e: "O Amplify é voltado a aplicações web e móveis full-stack: hospeda o front-end, conecta back-end (auth, API, storage) e traz CI/CD. O Beanstalk implanta aplicações de servidor; o Lightsail entrega servidores virtuais simplificados." },

    { id: "clf-n09", d: "tecnologia", q: "Uma empresa precisa executar um processo de ETL sem servidor, catalogando e transformando dados antes de análise. Qual serviço da AWS é o indicado?",
      o: ["Amazon Athena", "AWS Glue", "Amazon EMR", "Amazon Redshift"], c: [1],
      e: "O AWS Glue é o serviço de ETL serverless, com catálogo de dados integrado. O Athena consulta dados no S3 com SQL, o EMR roda frameworks de big data em cluster e o Redshift é data warehouse." },

    { id: "clf-n10", d: "tecnologia", q: "Qual serviço da AWS permite construir, treinar e implantar modelos de machine learning em um ambiente gerenciado?",
      o: ["Amazon Bedrock", "Amazon SageMaker", "Amazon Rekognition", "Amazon Comprehend"], c: [1],
      e: "O SageMaker cobre o ciclo completo de ML: preparar dados, treinar, ajustar e implantar modelos. O Bedrock dá acesso a modelos de fundação prontos via API; Rekognition e Comprehend são serviços de IA prontos para uso, sem treinar modelo." },

    { id: "clf-n11", d: "tecnologia", q: "Uma empresa quer usar modelos de fundação (foundation models) de vários fornecedores por meio de uma API única, sem gerenciar infraestrutura. Qual serviço atende?",
      o: ["Amazon SageMaker", "Amazon Bedrock", "Amazon Q", "AWS Deep Learning AMIs"], c: [1],
      e: "O Bedrock oferece modelos de fundação de diferentes provedores por API gerenciada, sem provisionar servidores. O SageMaker é para quem quer construir e treinar os próprios modelos." },

    { id: "clf-n12", d: "tecnologia", q: "Uma seguradora precisa extrair automaticamente texto, tabelas e campos de formulários digitalizados. Qual serviço da AWS é o mais adequado?",
      o: ["Amazon Textract", "Amazon Rekognition", "Amazon Transcribe", "Amazon Kendra"], c: [0],
      e: "O Textract extrai texto, tabelas e pares campo-valor de documentos digitalizados — vai além do OCR simples. O Rekognition analisa imagens e vídeos (objetos, rostos), não estrutura de documento." },

    { id: "clf-n13", d: "tecnologia", q: "Qual serviço orquestra várias funções e serviços da AWS em um fluxo de trabalho com etapas, condições e tratamento de erros?",
      o: ["Amazon EventBridge", "AWS Step Functions", "Amazon SQS", "AWS Batch"], c: [1],
      e: "O Step Functions coordena fluxos de trabalho como máquinas de estado, com etapas, ramificações, repetição e tratamento de erro. O EventBridge roteia eventos, mas não mantém o estado de um fluxo com várias etapas." },

    { id: "clf-n14", d: "tecnologia", q: "Uma empresa quer conectar centenas de VPCs e redes locais através de um único ponto central de roteamento. Qual serviço atende?",
      o: ["VPC Peering", "AWS Transit Gateway", "AWS Direct Connect", "Internet Gateway"], c: [1],
      e: "O Transit Gateway funciona como um hub de rede: cada VPC e cada conexão local se liga a ele uma vez, em vez de criar pareamentos ponto a ponto entre todas. O VPC Peering exige uma conexão para cada par, o que não escala para centenas de VPCs." },

    { id: "clf-n15", d: "tecnologia", q: "Uma aplicação global precisa de IPs estáticos e roteamento pela rede da AWS para melhorar disponibilidade e desempenho de tráfego TCP/UDP. Qual serviço atende?",
      o: ["Amazon CloudFront", "AWS Global Accelerator", "Amazon Route 53", "Elastic Load Balancing"], c: [1],
      e: "O Global Accelerator entrega IPs estáticos anycast e envia o tráfego pela rede da AWS até o endpoint mais próximo — serve para TCP/UDP em geral. O CloudFront é CDN e faz cache de conteúdo HTTP/HTTPS, um problema diferente." },

    { id: "clf-n16", d: "tecnologia", q: "Qual serviço da AWS ajuda a encontrar a causa de lentidão em uma aplicação distribuída, mostrando o caminho de cada requisição entre os componentes?",
      o: ["Amazon CloudWatch", "AWS CloudTrail", "AWS X-Ray", "AWS Config"], c: [2],
      e: "O X-Ray faz rastreamento distribuído (tracing): mostra o percurso de cada requisição e onde o tempo foi gasto. O CloudWatch coleta métricas e logs; o CloudTrail audita chamadas de API." },

    // ---------- SEGURANÇA ----------
    { id: "clf-n17", d: "seguranca", q: "Qual serviço da AWS centraliza alertas de segurança de vários serviços (como GuardDuty, Inspector e Macie) em um painel único, com verificações de conformidade?",
      o: ["AWS Security Hub", "Amazon Detective", "AWS Audit Manager", "AWS Artifact"], c: [0],
      e: "O Security Hub agrega e prioriza achados de segurança de vários serviços e executa checagens contra padrões (como CIS e AWS Foundational Security Best Practices). O Detective investiga a causa de um achado; o Audit Manager coleta evidência para auditoria." },

    { id: "clf-n18", d: "seguranca", q: "Uma equipe precisa investigar a causa raiz de um achado de segurança, analisando o comportamento de recursos ao longo do tempo. Qual serviço da AWS é feito para isso?",
      o: ["Amazon GuardDuty", "Amazon Detective", "AWS Security Hub", "Amazon Inspector"], c: [1],
      e: "O Detective monta automaticamente um gráfico de comportamento a partir de logs e ajuda a investigar a origem de um achado. O GuardDuty DETECTA a ameaça; o Detective ajuda a entender o que aconteceu depois da detecção." },

    { id: "clf-n19", d: "seguranca", q: "Qual serviço da AWS ajuda a coletar evidências continuamente para auditorias e relatórios de conformidade (como PCI DSS e GDPR)?",
      o: ["AWS Artifact", "AWS Audit Manager", "AWS Config", "AWS Trusted Advisor"], c: [1],
      e: "O Audit Manager coleta evidências de forma contínua e as organiza em relatórios de auditoria. O AWS Artifact é diferente: nele você BAIXA os relatórios de conformidade da própria AWS (como o SOC), não os seus." },

    { id: "clf-n20", d: "seguranca", q: "Uma empresa precisa aplicar e gerenciar centralmente regras de firewall (AWS WAF, grupos de segurança) em várias contas de uma organização. Qual serviço atende?",
      o: ["AWS Firewall Manager", "AWS Network Firewall", "AWS Shield", "AWS WAF"], c: [0],
      e: "O Firewall Manager administra centralmente as regras em várias contas do AWS Organizations. O Network Firewall é o firewall de rede dentro de uma VPC, e o WAF protege aplicações web — os dois são o que o Firewall Manager gerencia." },

    { id: "clf-n21", d: "seguranca", q: "Qual serviço fornece provisionamento, gerenciamento e renovação gratuitos de certificados SSL/TLS públicos para uso com serviços da AWS?",
      o: ["AWS KMS", "AWS Certificate Manager (ACM)", "AWS Secrets Manager", "AWS CloudHSM"], c: [1],
      e: "O ACM emite e renova automaticamente certificados públicos usados em ELB, CloudFront e API Gateway, sem custo pelo certificado. O KMS gerencia chaves de criptografia e o Secrets Manager guarda segredos como senhas de banco." },

    { id: "clf-n22", d: "seguranca", q: "Qual serviço permite compartilhar recursos da AWS (como sub-redes e Transit Gateways) entre contas da mesma organização, sem duplicá-los?",
      o: ["AWS Organizations", "AWS Resource Access Manager (RAM)", "AWS Control Tower", "IAM Identity Center"], c: [1],
      e: "O RAM compartilha recursos entre contas. O Organizations agrupa e governa as contas, o Control Tower cria um ambiente multi-conta com boas práticas e o IAM Identity Center cuida do acesso de pessoas." },

    { id: "clf-n23", d: "seguranca", q: "Uma empresa quer criar rapidamente um ambiente multi-conta na AWS já com governança, log centralizado e guardrails aplicados. Qual serviço faz isso?",
      o: ["AWS Organizations", "AWS Control Tower", "AWS Config", "AWS Service Catalog"], c: [1],
      e: "O Control Tower monta a landing zone: cria a estrutura de contas, ativa log centralizado e aplica guardrails automaticamente. O Organizations é a base que ele usa, mas sozinho não configura o ambiente." },

    { id: "clf-n24", d: "seguranca", q: "Uma empresa precisa conectar seu Microsoft Active Directory local a serviços da AWS. Qual serviço atende a esse requisito?",
      o: ["AWS Directory Service", "Amazon Cognito", "AWS IAM Identity Center", "AWS Secrets Manager"], c: [0],
      e: "O AWS Directory Service oferece diretórios gerenciados e integração (trust) com o Active Directory local. O Cognito serve para autenticar usuários finais de aplicações web e móveis, não funcionários de uma empresa." },

    { id: "clf-n25", d: "seguranca", q: "Qual afirmação descreve corretamente o Amazon Macie?",
      o: ["Detecta ameaças analisando logs de rede e de API.", "Usa machine learning para descobrir e classificar dados sensíveis armazenados no Amazon S3.", "Faz varredura de vulnerabilidades em instâncias EC2.", "Gerencia chaves de criptografia."], c: [1],
      e: "O Macie descobre e classifica dados sensíveis (como dados pessoais) no S3. Detectar ameaças por logs é o GuardDuty, varrer vulnerabilidades é o Inspector e gerenciar chaves é o KMS." },

    // ---------- CONCEITOS ----------
    { id: "clf-n26", d: "conceitos", q: "Quantos pilares tem o AWS Well-Architected Framework e qual foi o mais recente a ser incluído?",
      o: ["Cinco pilares; o mais recente é Segurança.", "Seis pilares; o mais recente é Sustentabilidade.", "Quatro pilares; o mais recente é Confiabilidade.", "Sete pilares; o mais recente é Governança."], c: [1],
      e: "São seis: Excelência Operacional, Segurança, Confiabilidade, Eficiência de Performance, Otimização de Custos e Sustentabilidade — este último acrescentado em 2021." },

    { id: "clf-n27", d: "conceitos", q: "Qual é a diferença entre uma Região da AWS e uma Zona de Disponibilidade (AZ)?",
      o: ["São sinônimos.", "Uma Região é uma área geográfica que contém várias AZs; cada AZ é um ou mais data centers isolados dentro dela.", "Uma AZ contém várias Regiões.", "Região é física e AZ é apenas lógica, sem separação real."], c: [1],
      e: "A Região é a área geográfica; dentro dela existem várias Zonas de Disponibilidade, cada uma com um ou mais data centers com energia e rede independentes. Distribuir entre AZs é o que dá alta disponibilidade." },

    { id: "clf-n28", d: "conceitos", q: "Uma aplicação aumenta e diminui automaticamente a quantidade de instâncias conforme a demanda do momento. Qual característica da nuvem isso descreve?",
      o: ["Elasticidade", "Durabilidade", "Latência", "Aderência (stickiness)"], c: [0],
      e: "Elasticidade é acompanhar a demanda em tempo real, subindo e descendo recursos. Não confunda com escalabilidade, que é a capacidade de crescer para atender a uma carga maior." },

    { id: "clf-n29", d: "conceitos", q: "O que caracteriza uma arquitetura com acoplamento fraco (loose coupling)?",
      o: ["Todos os componentes dependem diretamente uns dos outros.", "Os componentes se comunicam por interfaces intermediárias, como filas, e a falha de um não derruba os demais.", "Toda a aplicação roda em uma única instância.", "Os dados ficam sempre em um único banco."], c: [1],
      e: "Com acoplamento fraco, componentes conversam por camadas intermediárias (filas, tópicos, APIs) e podem falhar ou escalar de forma independente. É o que o SQS e o SNS ajudam a construir." },

    { id: "clf-n30", d: "conceitos", q: "Uma empresa quer receber conteúdo estático com baixa latência para usuários em vários continentes. Qual conceito de infraestrutura da AWS resolve isso?",
      o: ["Zonas de Disponibilidade", "Pontos de presença (edge locations) do CloudFront", "Grupos de posicionamento (placement groups)", "Sub-redes privadas"], c: [1],
      e: "Os pontos de presença guardam cópias do conteúdo perto do usuário final, reduzindo a latência. AZs servem para alta disponibilidade dentro de uma Região, não para aproximar conteúdo do usuário global." },

    { id: "clf-n31", d: "conceitos", q: "Segundo o modelo de responsabilidade compartilhada, quem é responsável pela segurança FÍSICA dos data centers da AWS?",
      o: ["O cliente", "A AWS", "Ambos igualmente", "Um terceiro contratado pelo cliente"], c: [1],
      e: "A AWS é responsável pela segurança DA nuvem — instalações físicas, hardware e infraestrutura de rede. O cliente é responsável pela segurança NA nuvem: seus dados, configurações e permissões." },

    { id: "clf-n32", d: "conceitos", q: "Qual serviço da AWS ajuda a planejar uma migração em larga escala, acompanhando o progresso de várias ferramentas em um só lugar?",
      o: ["AWS Migration Hub", "AWS Database Migration Service (DMS)", "AWS Application Discovery Service", "AWS Snowball"], c: [0],
      e: "O Migration Hub reúne o acompanhamento da migração num painel único. O DMS migra bancos de dados especificamente e o Application Discovery Service coleta dados do ambiente local para planejar." },

    // ---------- COBRANÇA ----------
    { id: "clf-n33", d: "cobranca", q: "O que o AWS Free Tier oferece atualmente a uma conta nova?",
      o: ["Doze meses gratuitos de todos os serviços da AWS.", "Um plano gratuito com créditos (até US$ 200) e um conjunto de serviços sempre gratuitos dentro de limites mensais.", "Hardware físico sem custo.", "Suporte Enterprise sem custo."], c: [1],
      e: "MODELO ANTIGO (o que a maioria do material de prova ainda ensina): três categorias — 'sempre gratuito', '12 meses gratuitos' e 'testes de curto prazo'. ⚠️ MUDOU: a AWS reformulou o nível gratuito e a conta nova entra no 'Free plan', com créditos (US$ 100 na criação e até US$ 100 adicionais ao explorar serviços) mais os serviços 'always free' dentro de limites mensais. O '12 meses grátis' não vale mais para contas novas. Se a questão da prova citar '12 meses', ela está usando o modelo antigo — vale saber os dois.",
      corrigido: true },

    { id: "clf-n34", d: "cobranca", q: "Qual serviço analisa o uso de recursos e recomenda tipos e tamanhos de instância mais adequados, para reduzir custo e melhorar desempenho?",
      o: ["AWS Cost Explorer", "AWS Compute Optimizer", "AWS Budgets", "AWS Pricing Calculator"], c: [1],
      e: "O Compute Optimizer analisa métricas de uso e recomenda o rightsizing de EC2, volumes EBS, funções Lambda e serviços de contêiner. O Cost Explorer mostra e analisa o gasto; o Budgets alerta quando o gasto passa de um limite." },

    { id: "clf-n35", d: "cobranca", q: "Uma empresa quer organizar seus custos por projeto e centro de custo nos relatórios de faturamento. Qual recurso deve usar?",
      o: ["Tags de alocação de custos (cost allocation tags)", "Security Groups", "Placement groups", "Regiões separadas para cada projeto"], c: [0],
      e: "Tags de alocação de custos marcam os recursos e permitem separar o gasto por projeto, time ou ambiente no Cost Explorer e no relatório de custos. Elas precisam ser ativadas no console de faturamento para aparecer nos relatórios." },

    { id: "clf-n36", d: "cobranca", q: "Qual é a vantagem do faturamento consolidado (consolidated billing) no AWS Organizations?",
      o: ["Cada conta recebe uma fatura separada e paga o preço cheio.", "Uma fatura única para todas as contas, e o uso agregado pode alcançar descontos por volume.", "Elimina completamente os custos das contas-membro.", "Obriga todas as contas a usarem a mesma Região."], c: [1],
      e: "O faturamento consolidado junta o uso de todas as contas da organização numa fatura só, e o volume somado pode atingir faixas de preço melhores. Instâncias reservadas e Savings Plans não usados por uma conta também podem beneficiar outras da organização." },

    { id: "clf-n37", d: "cobranca", q: "Uma empresa tem uma carga de trabalho tolerante a interrupções, como processamento de imagens em lote. Qual modelo de compra do EC2 oferece o maior desconto?",
      o: ["Instâncias sob demanda", "Instâncias Spot", "Hosts dedicados", "Instâncias reservadas de 1 ano"], c: [1],
      e: "As instâncias Spot usam capacidade ociosa e chegam a descontos bem maiores que sob demanda, mas podem ser interrompidas com aviso curto — por isso servem justamente a cargas tolerantes a interrupção, como lotes e testes." },

  ];
  for (const q of Q) B.push(q);
})();
