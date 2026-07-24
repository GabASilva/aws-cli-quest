"use strict";
// ============================================================
// CLImb — licoes.js
// A parte DIDÁTICA que faltava: antes de "faça", explicar "o que é e por quê".
// Inspirado no boot.dev, onde cada capítulo abre com a explicação do conceito.
//
// COMO APARECE
//  - Um bloco "📚 Entenda o <serviço>" no topo do card da atividade, expansível.
//    Abre sozinho na 1ª atividade de cada trilha (quando você ainda não fez
//    nenhuma dela) e fica recolhido depois — mas sempre a um clique.
//  - Uma linha "💡 Por que este comando" logo abaixo da descrição, explicando
//    pra que serve o comando daquela atividade (reusada entre as atividades
//    que usam o mesmo comando).
//
// ADITIVO: faz wrap de renderCard e injeta os blocos via DOM. Não toca o core.
// ============================================================

// ---------- Lições por serviço (chave = id da trilha) ----------
const LICOES = {
  s3: {
    emoji: "🪣", titulo: "Amazon S3",
    oque: "O S3 (Simple Storage Service) é o \"HD infinito\" da AWS: você joga arquivos lá e eles ficam guardados com segurança, acessíveis de qualquer lugar por uma URL. Não é um sistema de arquivos com pastas de verdade — é um <b>armazenamento de objetos</b>, onde cada arquivo é um objeto identificado por um nome (a \"chave\").",
    serve: "Guardar qualquer coisa que não seja um banco de dados: fotos e vídeos de um app, backups, arquivos que usuários enviam, logs, e até <b>sites estáticos</b> (HTML/CSS/JS) servidos direto do bucket, sem servidor nenhum.",
    casos: [
      "Um app de fotos guarda as imagens dos usuários no S3 e serve pelo link.",
      "O site de uma empresa (páginas estáticas) roda inteiro num bucket, barato e sem manutenção.",
      "Backups automáticos de um banco de dados são despejados num bucket todo dia.",
    ],
    vocab: [
      ["Bucket", "a \"pasta raiz\" na nuvem. O nome é único no mundo TODO — não pode existir outro igual em nenhuma conta."],
      ["Objeto", "cada arquivo dentro do bucket. Tem uma chave (o caminho/nome) e o conteúdo."],
      ["Chave (key)", "o nome completo do objeto, incluindo o \"caminho\": fotos/2026/capa.png."],
      ["Versionamento", "quando ligado, o bucket guarda o histórico de cada objeto — dá pra voltar atrás se sobrescrever sem querer."],
    ],
    cobra: "Você paga pelo que guarda (GB por mês) e pelas requisições. Guardar alguns arquivos custa centavos — por isso é o primeiro serviço que quase todo mundo usa.",
  },

  ec2: {
    emoji: "🖥️", titulo: "Amazon EC2",
    oque: "O EC2 (Elastic Compute Cloud) é um <b>computador que você aluga por hora</b> na nuvem. Você liga uma máquina virtual (uma \"instância\"), instala o que quiser, usa, e desliga quando não precisa mais — pagando só pelo tempo ligado.",
    serve: "Rodar qualquer coisa que precisa de um servidor: um site com backend, uma API, um banco de dados que você mesmo gerencia, um processamento pesado. É o \"servidor clássico\" da nuvem — o mais flexível e o mais antigo da AWS.",
    casos: [
      "O servidor web de uma loja online roda numa instância, atendendo os visitantes.",
      "Um time sobe uma máquina potente por algumas horas pra processar um relatório gigante e desliga depois.",
      "Um servidor de jogo (Minecraft, por exemplo) fica numa instância ligada só nos horários de pico.",
    ],
    vocab: [
      ["Instância", "uma máquina virtual — um computador na nuvem. Você liga (run), para (stop) e encerra (terminate)."],
      ["AMI", "o \"molde\" do sistema: qual SO e softwares já vêm instalados. Identificada por ami-xxxx."],
      ["Tipo de instância", "o tamanho da máquina (CPU/memória). t2.micro é pequena (teste); m5.large é robusta. Maior = mais caro."],
      ["Security Group", "o firewall da instância. Bloqueia tudo por padrão; você libera portas (80 pra web, 22 pra SSH)."],
      ["Key Pair", "par de chaves pra entrar na máquina por SSH com segurança, sem senha."],
    ],
    cobra: "Você paga por hora (ou segundo) de máquina LIGADA. Parar a instância pausa a cobrança de computação — por isso \"desligar o que não usa\" é a economia nº 1 na AWS.",
  },

  iam: {
    emoji: "🔑", titulo: "IAM",
    oque: "O IAM (Identity and Access Management) é o <b>porteiro da sua conta</b>: define QUEM pode fazer O QUÊ. Nada na AWS acontece sem passar por ele. E a regra de ouro é o <b>menor privilégio</b>: cada identidade começa sem poder nada, e você concede só o necessário.",
    serve: "Controlar acesso com precisão: dar ao time de suporte só leitura, à aplicação só a permissão de escrever numa tabela, ao estagiário só um serviço. E permitir que serviços conversem entre si com segurança (uma Lambda que precisa gravar no S3, por exemplo).",
    casos: [
      "Uma empresa cria um usuário IAM pra cada funcionário, com as permissões do cargo dele.",
      "Uma função Lambda recebe uma role que deixa ela (e só ela) escrever numa tabela do DynamoDB.",
      "O time de auditoria ganha um grupo com acesso somente-leitura a tudo, pra investigar sem poder mexer.",
    ],
    vocab: [
      ["Usuário", "identidade de uma PESSOA (ou app fixo). Começa sem nenhuma permissão."],
      ["Grupo", "conjunto de usuários. Dá permissão ao grupo e todos herdam — facilita gerenciar times."],
      ["Role (papel)", "identidade que SERVIÇOS assumem (não pessoas). Ex.: uma Lambda \"veste\" uma role pra ter permissões."],
      ["Policy (política)", "o documento que diz o que pode/não pode. Você anexa a usuários, grupos ou roles."],
      ["Menor privilégio", "conceder só o mínimo necessário. Se vazar, o estrago é limitado."],
    ],
    cobra: "O IAM é <b>gratuito</b>. O que ele controla (os outros serviços) é que custa — mas configurar quem acessa o quê não tem custo nenhum.",
  },

  lambda: {
    emoji: "λ", titulo: "AWS Lambda",
    oque: "Lambda é <b>código que roda sem servidor</b> (serverless). Você não liga máquina nenhuma: sobe uma função, e a AWS a executa quando algo a chama — e some quando termina. Você paga só pelos milissegundos que ela rodou.",
    serve: "Reagir a eventos e rodar tarefas curtas sem manter um servidor ligado à toa: processar um arquivo assim que ele chega no S3, responder a uma requisição de API, redimensionar uma imagem, mandar um e-mail. Se o trabalho é esporádico, sai muito mais barato que um EC2 ligado 24h.",
    casos: [
      "Toda vez que alguém sobe uma foto no S3, uma Lambda gera automaticamente a miniatura.",
      "Uma API de pagamento chama uma Lambda pra processar cada transação — sem servidor ligado esperando.",
      "Uma Lambda roda todo dia à meia-noite (agendada) pra limpar registros velhos do banco.",
    ],
    vocab: [
      ["Função", "o pedaço de código que roda sob demanda. Você sobe o código e a AWS executa quando chamado."],
      ["Runtime", "a linguagem/versão que roda a função. Ex.: python3.12, nodejs20.x."],
      ["Handler", "o ponto de entrada — qual função do seu código a AWS chama. Ex.: app.handler."],
      ["Invoke", "executar a função. Você \"invoca\" e recebe a resposta."],
      ["Role de execução", "a permissão que a função tem (via IAM) pra falar com outros serviços."],
    ],
    cobra: "Você paga por número de execuções e tempo de cada uma (em ms). Tem um nível gratuito generoso — pra pouco tráfego, muitas vezes custa zero.",
  },

  dynamodb: {
    emoji: "🗄️", titulo: "DynamoDB",
    oque: "O DynamoDB é um <b>banco de dados NoSQL</b> totalmente gerenciado: rápido, escala sozinho e você nunca cuida de servidor. Diferente do SQL, ele não tem colunas fixas — cada item pode ter seus próprios atributos. Em troca dessa velocidade, você modela os dados pensando em COMO vai buscá-los.",
    serve: "Guardar dados que precisam ser lidos e escritos muito rápido, em qualquer escala: sessões de usuário, carrinho de compras, catálogo de produtos, placar de um jogo, dados de dispositivos IoT. Quando o tráfego explode, ele aguenta sem você mexer em nada.",
    casos: [
      "Um app de delivery guarda o estado de cada pedido no DynamoDB — leitura instantânea a qualquer escala.",
      "Um jogo mobile grava o progresso de milhões de jogadores sem nenhum servidor de banco pra administrar.",
      "Uma loja mantém o carrinho de cada usuário numa tabela, buscando pela chave (o id do usuário)."
    ],
    vocab: [
      ["Tabela", "onde os dados ficam. Você define só a chave — não um esquema fixo de colunas."],
      ["Partition key (HASH)", "a chave primária obrigatória. Identifica cada item e decide onde ele é guardado."],
      ["Sort key (RANGE)", "chave secundária opcional. Permite ordenar e agrupar itens sob a mesma partition key."],
      ["Item", "cada registro (equivale a uma \"linha\" do SQL). É um conjunto de atributos."],
      ["Tipos S/N/B", "no JSON cada valor declara o tipo: S = texto, N = número, B = binário."],
    ],
    cobra: "No modo PAY_PER_REQUEST você paga por requisição, sem reservar nada — simples e ótimo pra começar. Também tem um nível gratuito.",
  },

  vpc: {
    emoji: "🛜", titulo: "VPC",
    oque: "A VPC (Virtual Private Cloud) é a <b>sua rede privada</b> dentro da AWS — como se você montasse a rede de um escritório, mas na nuvem. Tudo o que você cria (instâncias, bancos) mora dentro de uma VPC, e você controla quem entra, quem sai e por onde.",
    serve: "Isolar e proteger seus recursos: colocar o servidor web numa parte que a internet enxerga (sub-rede pública) e o banco de dados numa parte trancada (sub-rede privada), controlando o tráfego entre eles. É a base de segurança de rede de qualquer arquitetura séria.",
    casos: [
      "Uma aplicação põe o servidor web numa sub-rede pública e o banco numa privada, sem acesso direto da internet.",
      "Uma empresa liga a VPC ao data center dela por VPN, estendendo a rede interna pra nuvem.",
      "Ambientes de produção e de testes ficam em VPCs separadas, sem risco de um afetar o outro.",
    ],
    vocab: [
      ["VPC", "a rede privada. Definida por um bloco de IPs (CIDR), ex.: 10.0.0.0/16."],
      ["Sub-rede (subnet)", "um pedaço da VPC. Pública = tem rota pra internet; privada = não tem."],
      ["Internet Gateway", "a \"porta\" que liga a VPC à internet. Sem ela + uma rota, nada entra ou sai."],
      ["Route table", "a tabela que diz pra onde cada pacote vai. É a rota 0.0.0.0/0 → gateway que torna uma sub-rede pública."],
      ["Network ACL", "firewall da SUB-REDE (o Security Group é o da instância). Vale a regra de menor número."],
    ],
    cobra: "Criar a VPC, sub-redes e o internet gateway é <b>gratuito</b>. Você paga pelos recursos que rodam dentro (instâncias) e por alguns extras (NAT gateway, tráfego entre regiões).",
  },

  // ---------------- 2ª onda: serviços das fases 1–5 + diagnóstico ----------------
  rds: {
    emoji: "🛢️", titulo: "Amazon RDS",
    oque: "O RDS (Relational Database Service) é um <b>banco de dados relacional (SQL) gerenciado</b>: MySQL, PostgreSQL, MariaDB, SQL Server ou Oracle rodando sem você cuidar do servidor. A AWS faz backup, atualização e recuperação de falha por você — você só usa o banco.",
    serve: "Guardar dados estruturados com relações (clientes, pedidos, produtos) quando você precisa de SQL de verdade: junções, transações, consistência forte. É a escolha quando o app já foi feito pra um banco tradicional e você não quer administrar servidor.",
    casos: [
      "O banco de pedidos de um e-commerce roda em Postgres no RDS, com backup automático todo dia.",
      "Um sistema legado que usa MySQL migra pra nuvem sem reescrever nada — só aponta pro RDS.",
      "Um banco de dev fica parado fora do horário comercial pra economizar, e religa de manhã.",
    ],
    vocab: [
      ["Instância de banco", "a máquina gerenciada que roda o banco. Você escolhe engine, tamanho e armazenamento."],
      ["Engine", "qual banco: mysql, postgres, mariadb, sqlserver, oracle."],
      ["Multi-AZ", "uma cópia em outra zona que assume sozinha se a principal cair (alta disponibilidade)."],
      ["Snapshot", "uma foto do banco pra backup ou pra clonar um ambiente."],
      ["RDS x DynamoDB", "RDS é SQL (relações, junções); DynamoDB é NoSQL (rápido, escala automática, sem esquema)."],
    ],
    cobra: "Você paga por hora de instância + armazenamento. Parar a instância pausa a computação (como no EC2). Tem opção Free Tier pra um banco pequeno.",
  },

  cloudwatch: {
    emoji: "📈", titulo: "CloudWatch",
    oque: "O CloudWatch é os <b>olhos e ouvidos</b> da sua conta: coleta métricas (CPU, memória, requisições), guarda logs e dispara <b>alarmes</b> quando algo sai do normal. Se a AWS é a sua infraestrutura, o CloudWatch é o painel que mostra se ela está saudável.",
    serve: "Saber o que está acontecendo sem ficar olhando: receber um alerta quando a CPU passa de 80%, juntar os logs de uma aplicação num lugar só, ver um gráfico de erros ao longo do tempo. É o que separa \"o site caiu e ninguém viu\" de \"fomos avisados antes\".",
    casos: [
      "Um alarme avisa a equipe no celular quando a CPU do servidor passa de 80% por 5 minutos.",
      "Os logs de todas as funções Lambda caem num grupo de logs, pesquisável num lugar só.",
      "Um gráfico mostra o pico de acessos da Black Friday hora a hora.",
    ],
    vocab: [
      ["Métrica", "um número medido ao longo do tempo (CPUUtilization, RequestCount...)."],
      ["Alarme", "dispara uma ação (avisar, escalar) quando a métrica cruza um limite (threshold)."],
      ["Namespace", "o \"sobrenome\" da métrica, agrupando por serviço: AWS/EC2, AWS/Lambda."],
      ["Log group", "onde os logs de um recurso ficam guardados (comando aws logs)."],
    ],
    cobra: "As métricas básicas são gratuitas; você paga por métricas customizadas, alarmes extras e volume de logs guardados. Monitorar o essencial custa muito pouco.",
  },

  sqs: {
    emoji: "📨", titulo: "Amazon SQS",
    oque: "A SQS (Simple Queue Service) é uma <b>fila de mensagens</b>: um sistema deixa uma tarefa na fila e segue a vida; outro pega e processa quando puder. Isso <b>desacopla</b> as duas pontas — se quem processa cair, a mensagem espera na fila e nada se perde.",
    serve: "Absorver picos e dar resiliência: em vez de o site travar processando cada pedido na hora, ele joga o pedido na fila e responde rápido; um trabalhador consome a fila no ritmo dele. É a espinha dorsal de sistemas que não podem perder tarefas.",
    casos: [
      "No pico de vendas, os pedidos entram numa fila e são processados um a um, sem derrubar o site.",
      "Um sistema de e-mail joga cada envio na fila; se o serviço de e-mail cair, nada se perde.",
      "Um app de vídeo enfileira cada arquivo pra conversão, processados por vários trabalhadores.",
    ],
    vocab: [
      ["Fila (queue)", "onde as mensagens ficam esperando. Identificada por uma URL."],
      ["Mensagem", "a tarefa em si (um texto/JSON). Fica invisível enquanto alguém a processa."],
      ["ReceiptHandle", "o \"comprovante\" que você recebe ao pegar a mensagem; usa pra confirmar (apagar) depois de processar."],
      ["FIFO", "fila que garante a ORDEM exata (o nome termina em .fifo). A Standard é mais rápida mas não garante ordem."],
    ],
    cobra: "Você paga por requisição (colocar/tirar mensagem). O primeiro milhão por mês é grátis — para a maioria dos projetos, custa quase nada.",
  },

  sns: {
    emoji: "📣", titulo: "Amazon SNS",
    oque: "O SNS (Simple Notification Service) é o <b>megafone</b> da AWS: você publica uma mensagem num <b>tópico</b> e todo mundo que <b>assinou</b> recebe — por e-mail, SMS, fila SQS ou Lambda. Um publica, muitos recebem (o padrão \"pub/sub\").",
    serve: "Avisar várias partes de um evento de uma vez: quando um pedido é feito, notificar o cliente por e-mail E disparar a fila de processamento E registrar num log — tudo com uma única publicação. Desacopla quem avisa de quem é avisado.",
    casos: [
      "Um alarme do CloudWatch publica no SNS, que manda e-mail e SMS pra equipe ao mesmo tempo.",
      "Quando um pedido é criado, o SNS entrega a notícia pra uma fila SQS (que processa) e pro cliente (por e-mail).",
      "Um sistema avisa vários microsserviços de uma mudança publicando num tópico só.",
    ],
    vocab: [
      ["Tópico", "o canal onde você publica. Tem um ARN que identifica ele."],
      ["Assinatura", "quem vai receber: um e-mail, um número de SMS, uma fila SQS, uma Lambda."],
      ["Protocolo", "o tipo do destino: email, sms, sqs, lambda, https."],
      ["Fan-out", "o padrão SNS→SQS: publicar no tópico entrega a mensagem em várias filas de uma vez."],
    ],
    cobra: "Você paga por mensagem publicada e por entrega (e-mail/SMS têm preços próprios). O nível gratuito cobre bastante coisa.",
  },

  apigateway: {
    emoji: "🚪", titulo: "API Gateway",
    oque: "O API Gateway é a <b>porta de entrada HTTP</b> da sua aplicação: ele recebe as requisições da internet e encaminha pra quem vai responder (uma Lambda, um servidor, outro serviço). É o \"recepcionista\" que fica na frente e cuida de autenticação, limites de uso e roteamento.",
    serve: "Publicar uma API sem montar um servidor web só pra isso: você define os caminhos (/pedidos, /clientes), os métodos (GET, POST) e liga cada um a uma Lambda. Ganha de brinde controle de acesso, limite de requisições e monitoramento.",
    casos: [
      "O app mobile de uma loja conversa com o back-end por uma API Gateway ligada a funções Lambda.",
      "Uma empresa expõe uma API pública pra parceiros, com limite de requisições por cliente.",
      "Um site chama /contato via API Gateway, que dispara uma Lambda pra enviar o e-mail.",
    ],
    vocab: [
      ["REST API", "o conjunto de caminhos e métodos. Tem um id que os comandos pedem."],
      ["Recurso (resource)", "um caminho da API, ex.: /pedidos. Tudo pendura na raiz \"/\"."],
      ["Método (method)", "o verbo HTTP aceito num recurso: GET, POST, PUT, DELETE."],
      ["Deployment / estágio", "publicar a API num ambiente (ex.: prod). Sem deployment, nada responde pro mundo."],
    ],
    cobra: "Você paga por número de requisições que passam pela API. Tem nível gratuito no primeiro ano; depois, centavos por milhão de chamadas.",
  },

  route53: {
    emoji: "🌐", titulo: "Route 53",
    oque: "O Route 53 é o <b>DNS</b> da AWS: ele traduz um nome (loja.com) no endereço do servidor (um IP). É a lista telefônica da internet — sem ele, você teria que decorar números em vez de nomes. O \"53\" é a porta do protocolo DNS.",
    serve: "Apontar seu domínio pros seus recursos: fazer www.loja.com levar ao servidor certo, mandar o e-mail pro provedor certo, e trocar pra onde o site aponta sem ninguém perceber. Também registra domínios e checa a saúde dos servidores.",
    casos: [
      "www.minhaempresa.com passa a apontar pro servidor novo com uma mudança de registro, sem downtime.",
      "Uma empresa registra o domínio e configura o e-mail (registros MX) tudo pelo Route 53.",
      "O Route 53 checa a saúde de dois servidores e manda o tráfego só pro que está no ar.",
    ],
    vocab: [
      ["Hosted zone", "o \"cadastro\" de um domínio, onde ficam todos os registros dele."],
      ["Registro (record)", "uma entrada que diz pra onde algo aponta."],
      ["Registro A", "aponta um nome pra um endereço IP (o mais comum)."],
      ["CNAME / MX / TXT", "apelido pra outro nome / servidor de e-mail / verificações e provas de posse."],
    ],
    cobra: "Você paga uma taxa pequena por hosted zone por mês + por milhão de consultas. Registrar um domínio tem o custo anual do domínio em si.",
  },

  cloudfront: {
    emoji: "🚀", titulo: "CloudFront",
    oque: "O CloudFront é a <b>CDN</b> (rede de entrega de conteúdo) da AWS: ele copia seu site pra servidores espalhados pelo mundo (as \"bordas\"), então quem acessa do Japão pega do Japão, não de Virgínia. Resultado: muito mais rápido pra quem acessa e mais barato pra você.",
    serve: "Acelerar sites e apps globais e aliviar a origem: em vez de todo visitante bater no seu bucket/servidor, o CloudFront serve uma cópia em cache perto de cada pessoa. Também protege contra picos e ataques, já que a borda absorve o tráfego.",
    casos: [
      "Um site hospedado num bucket S3 fica rápido no mundo todo servindo pelo CloudFront.",
      "Uma plataforma de vídeo entrega os streams das bordas, sem sobrecarregar o servidor de origem.",
      "Um app publica versão nova e limpa o cache da CDN (invalidação) pra todos verem na hora.",
    ],
    vocab: [
      ["Distribuição", "a configuração da CDN: de onde busca (origem) e como serve. Tem um domínio d123.cloudfront.net."],
      ["Origem (origin)", "de onde o CloudFront pega o conteúdo original: um bucket S3 ou um servidor."],
      ["Cache / borda (edge)", "a cópia guardada perto do usuário. É o que deixa rápido."],
      ["Invalidação", "limpar o cache de um caminho quando você publica algo novo (ex.: /*)."],
    ],
    cobra: "Você paga pelo tráfego servido (GB) e por requisições. Costuma sair MAIS barato que servir tudo da origem, porque a borda faz o trabalho pesado.",
  },

  ecr: {
    emoji: "🐳", titulo: "Amazon ECR",
    oque: "O ECR (Elastic Container Registry) é o <b>armário das imagens de contêiner</b>. Você constrói a imagem da sua aplicação na sua máquina (docker build), envia pro ECR (docker push), e o ECS ou o EKS baixa dali pra rodar. É como o S3, mas especializado em imagens Docker.",
    serve: "Guardar de forma privada e segura as imagens que seus contêineres usam, integradas ao IAM e aos serviços de contêiner da AWS. Sem um registro, não tem de onde o ECS/EKS puxar o que executar.",
    casos: [
      "O CI da empresa builda a imagem a cada commit e faz push pro ECR; o ECS usa a última versão.",
      "Um time guarda a imagem base padronizada da empresa no ECR pra todos os projetos reusarem.",
      "Uma imagem é escaneada em busca de vulnerabilidades assim que chega no repositório.",
    ],
    vocab: [
      ["Repositório", "onde as imagens de UMA aplicação ficam (com suas várias versões/tags)."],
      ["Imagem", "o pacote com a aplicação e tudo que ela precisa pra rodar. Construída fora da AWS (docker build)."],
      ["URI do repositório", "o endereço da imagem que o ECS/EKS usa: <conta>.dkr.ecr.<região>.amazonaws.com/nome."],
      ["get-login-password", "a senha temporária que o docker usa pra autenticar no ECR."],
    ],
    cobra: "Você paga pelo armazenamento das imagens (GB/mês) e pela transferência. Guardar algumas imagens custa muito pouco.",
  },

  ecs: {
    emoji: "🚢", titulo: "Amazon ECS",
    oque: "O ECS (Elastic Container Service) <b>roda contêineres</b> por você — sem servidor pra administrar, se usar o modo Fargate. Você diz \"quero 3 cópias dessa aplicação sempre no ar\" e o ECS cuida de manter, substituir as que caem e escalar quando precisa.",
    serve: "Colocar uma aplicação conteinerizada em produção de forma simples: mais fácil que Kubernetes e nativo da AWS. Ideal pra quem quer os benefícios de contêiner (empacotar tudo junto, subir igual em qualquer lugar) sem a complexidade do EKS.",
    casos: [
      "O back-end de uma API roda em contêineres no ECS, mantendo sempre 2 cópias saudáveis.",
      "Na Black Friday, o serviço escala de 2 pra 10 contêineres e depois volta sozinho.",
      "Um job de processamento roda como uma tarefa avulsa e encerra quando termina.",
    ],
    vocab: [
      ["Cluster", "o \"lugar\" lógico onde os contêineres rodam."],
      ["Task definition", "a receita: qual imagem, quanta memória, quais portas. Cada mudança vira uma revisão nova."],
      ["Service (serviço)", "mantém N cópias da tarefa sempre rodando; sobe outra se uma cair."],
      ["ECS x EKS", "ECS é mais simples e só existe na AWS; EKS é Kubernetes de verdade — mais poder, mais complexidade."],
    ],
    cobra: "No Fargate você paga pela CPU/memória que as tarefas usam, por segundo. Não paga pelo cluster em si.",
  },

  secretsmanager: {
    emoji: "🔐", titulo: "Secrets Manager",
    oque: "O Secrets Manager <b>guarda senhas e chaves</b> fora do código, cifradas, e entrega só pra quem tem permissão. Senha em arquivo de código vaza no primeiro commit — aqui a aplicação busca o segredo pelo nome em tempo de execução, e você troca a senha sem novo deploy.",
    serve: "Centralizar credenciais (senha de banco, chave de API, token) com segurança e auditoria. O grande diferencial é a <b>rotação automática</b>: ele pode trocar a senha do banco sozinho a cada X dias, sem ninguém mexer no código.",
    casos: [
      "A senha do banco de dados fica no Secrets Manager; a aplicação lê pelo nome ao subir.",
      "Uma chave de API de terceiro é rotacionada automaticamente toda semana.",
      "Uma senha é apagada com janela de recuperação de 7 dias — dá tempo de desfazer se foi engano.",
    ],
    vocab: [
      ["Segredo (secret)", "o valor guardado (texto ou JSON), cifrado com KMS."],
      ["Versão", "cada mudança de valor cria uma versão; quem lê pelo nome pega a atual."],
      ["with-decryption", "flag pra receber o valor decifrado (senão vem cifrado)."],
      ["Janela de recuperação", "ao apagar, ele agenda a exclusão (7–30 dias); dá pra restaurar antes."],
    ],
    cobra: "Você paga por segredo guardado por mês + por chamadas de API. É pago (diferente do Parameter Store, que é grátis), mas oferece rotação automática.",
  },

  stepfunctions: {
    emoji: "🔀", titulo: "Step Functions",
    oque: "O Step Functions <b>orquestra processos de vários passos</b>. Quando um fluxo tem etapas (validar → cobrar → enviar) que dependem umas das outras, ele coordena a ordem, repete o que falhar e mostra exatamente em qual passo cada execução parou — tudo num diagrama visual, sem você escrever essa \"cola\".",
    serve: "Montar fluxos de trabalho confiáveis sem enfiar toda a lógica de sequência e retentativa dentro do código. Ideal pra processos de negócio (aprovar um pedido, processar um pagamento em etapas) e pipelines de dados.",
    casos: [
      "Um pedido passa por validar → cobrar cartão → separar estoque → notificar, cada etapa numa Lambda.",
      "Um pipeline de dados extrai, transforma e carrega, repetindo automaticamente a etapa que falhar.",
      "Uma aprovação humana pausa o fluxo até alguém clicar em \"aprovar\", depois continua.",
    ],
    vocab: [
      ["Máquina de estados", "o fluxo inteiro. Definido em JSON (a linguagem ASL), com StartAt e States."],
      ["Estado (state)", "cada passo: executar uma tarefa, escolher um caminho, esperar, terminar."],
      ["Execução", "uma \"rodada\" do fluxo, com uma entrada. Fica gravada — você vê onde parou."],
      ["ASL", "Amazon States Language, o JSON que descreve os estados e as transições."],
    ],
    cobra: "Você paga por transição de estado (cada passo executado). O nível gratuito cobre milhares de transições por mês.",
  },

  events: {
    emoji: "⏰", titulo: "EventBridge",
    oque: "O EventBridge é o <b>despertador e o sistema nervoso</b> da conta: ele dispara ações na hora certa (agendamento, tipo \"todo dia às 3h\") ou quando algo acontece (\"toda vez que uma instância parar\"). Uma <b>regra</b> define quando; os <b>alvos</b> definem quem é chamado.",
    serve: "Automatizar sem servidor rodando um loop: agendar uma limpeza noturna, reagir a eventos de outros serviços, ligar sistemas diferentes por eventos (um publica, o EventBridge encaminha). É o que faz a nuvem reagir sozinha.",
    casos: [
      "Uma regra dispara uma Lambda todo dia às 3h pra apagar arquivos temporários.",
      "Quando uma instância EC2 é criada, o EventBridge avisa a equipe de segurança automaticamente.",
      "Um evento de \"pedido pago\" é encaminhado pra três sistemas diferentes ao mesmo tempo.",
    ],
    vocab: [
      ["Regra (rule)", "define QUANDO dispara: um agendamento ou um padrão de evento."],
      ["Agendamento", "rate(1 day), rate(5 minutes) ou cron(0 3 * * ? *) pra horários específicos."],
      ["Padrão de evento", "casa com o que acontece na conta (ex.: uma instância EC2 mudou de estado)."],
      ["Alvo (target)", "quem é chamado quando a regra dispara: uma Lambda, uma fila, um tópico SNS."],
    ],
    cobra: "Eventos dos serviços da AWS são gratuitos; você paga por eventos customizados e por regras agendadas em grande volume. Uso comum custa pouco.",
  },

  eks: {
    emoji: "☸️", titulo: "Amazon EKS",
    oque: "O EKS (Elastic Kubernetes Service) roda <b>Kubernetes gerenciado</b>. Kubernetes é o padrão da indústria pra orquestrar contêineres, mas montar e manter o \"cérebro\" dele (o control plane) é trabalhoso — o EKS faz essa parte por você, e você foca nos seus contêineres.",
    serve: "Rodar aplicações conteinerizadas com Kubernetes de verdade — útil quando o time já conhece Kubernetes, quando você precisa dos recursos avançados dele, ou quando quer um conhecimento que vale em qualquer nuvem (não só na AWS).",
    casos: [
      "Uma empresa que já usa Kubernetes on-premises migra pra nuvem sem trocar de ferramenta.",
      "Uma plataforma com dezenas de microsserviços usa o EKS pra orquestrar tudo.",
      "Um time roda o mesmo cluster Kubernetes na AWS e em outra nuvem, sem ficar preso a uma só.",
    ],
    vocab: [
      ["Cluster", "o control plane gerenciado. Exige pelo menos 2 sub-redes (fica espalhado em 2 zonas)."],
      ["Nodegroup", "as máquinas EC2 onde os contêineres (pods) realmente rodam. Sem elas, o cluster não executa nada."],
      ["kubectl", "a ferramenta pra falar com o Kubernetes. O update-kubeconfig é o que a conecta ao cluster."],
      ["ECS x EKS", "ECS é mais simples e só na AWS; EKS é Kubernetes puro — mais poder e mais complexidade."],
    ],
    cobra: "Você paga uma taxa fixa por hora do cluster (o control plane) + as instâncias EC2 dos nodegroups. É mais caro que o ECS por isso.",
  },

  glue: {
    emoji: "🧬", titulo: "AWS Glue",
    oque: "O Glue é o <b>catálogo e a cozinha de dados</b> da AWS. O catálogo guarda o \"mapa\" dos seus dados (quais tabelas existem, quais colunas, onde os arquivos estão no S3); a parte de ETL transforma dados de um formato pra outro. Um <b>crawler</b> pode até descobrir a estrutura sozinho.",
    serve: "Preparar dados espalhados no S3 pra serem consultados (pelo Athena) ou processados: descobrir o esquema dos arquivos, catalogar, limpar e converter formatos. É a base de qualquer análise de dados na AWS.",
    casos: [
      "Um crawler varre os CSVs de vendas no S3 e cria a tabela no catálogo sozinho, sem ninguém digitar as colunas.",
      "Um job do Glue converte arquivos brutos em Parquet, deixando as consultas do Athena mais rápidas e baratas.",
      "O catálogo vira a fonte única de \"quais dados a empresa tem e onde estão\".",
    ],
    vocab: [
      ["Catálogo de dados", "o índice: bancos e tabelas que apontam pros arquivos no S3. É só metadado — o dado fica no S3."],
      ["Banco / tabela", "agrupador / a descrição de um conjunto de arquivos (colunas + caminho no S3)."],
      ["Crawler", "o robô que varre o S3 e descobre as colunas e os tipos automaticamente."],
      ["ETL", "Extract, Transform, Load — extrair, transformar e carregar dados de um lugar pro outro."],
    ],
    cobra: "Você paga pelo tempo de execução dos crawlers e jobs (por segundo) + um valor pequeno pelo catálogo. Catalogar poucos dados custa quase nada.",
  },

  athena: {
    emoji: "🔎", titulo: "Amazon Athena",
    oque: "O Athena roda <b>SQL direto nos arquivos do S3</b> — sem carregar nada num banco, sem servidor. Ele usa o catálogo do Glue pra saber onde estão os dados e o formato, e você consulta com SQL comum. Você paga só pelos dados que a consulta leu.",
    serve: "Analisar grandes volumes de dados que já estão no S3 sem montar infraestrutura: logs, exports, dados de vendas. Ideal pra perguntas pontuais (\"quantas vendas por região no mês?\") sem pagar um banco ligado o tempo todo.",
    casos: [
      "Um analista consulta anos de logs de acesso guardados no S3 com um SELECT, sem importar nada.",
      "A área de vendas roda relatórios sobre os arquivos de pedidos direto no S3.",
      "Investigar um incidente de segurança buscando nos VPC Flow Logs com SQL.",
    ],
    vocab: [
      ["Consulta assíncrona", "você dispara (start), pergunta se terminou (get-execution) e busca as linhas (get-results)."],
      ["QueryExecutionId", "o \"protocolo\" da consulta, usado pra acompanhar e pegar o resultado."],
      ["Local de resultado", "um bucket S3 onde o Athena grava a saída (obrigatório)."],
      ["Depende do Glue", "a tabela consultada precisa existir no catálogo do Glue — senão a consulta falha."],
    ],
    cobra: "Você paga por dado ESCANEADO em cada consulta (por TB). Guardar em formato colunar (Parquet) e filtrar bem reduz muito o custo.",
  },

  kms: {
    emoji: "🗝️", titulo: "AWS KMS",
    oque: "O KMS (Key Management Service) <b>guarda as chaves que cifram seus dados</b> — e o segredo é que a chave NUNCA sai de lá. Você manda o dado pro KMS pra cifrar/decifrar, e quem pode usar cada chave é definido por IAM. É a fundação de criptografia de quase todo serviço da AWS.",
    serve: "Proteger dados sensíveis com criptografia gerenciada, sem você lidar com o material da chave. Quase todo serviço integra com o KMS: cifrar um bucket S3, um volume EBS, um segredo do Secrets Manager — tudo usa chaves do KMS por baixo.",
    casos: [
      "Um bucket com dados de clientes é cifrado com uma chave do KMS; sem ela, os arquivos são ilegíveis.",
      "A rotação automática troca o material da chave todo ano, e o que já foi cifrado continua abrindo.",
      "Uma chave é desabilitada na hora quando se suspeita de acesso indevido, travando o acesso ao dado.",
    ],
    vocab: [
      ["Chave (key)", "a chave de criptografia. Fica dentro do KMS — você nunca vê o material dela."],
      ["Alias", "um apelido (alias/nome) pra não decorar o id enorme; pode apontar pra outra chave depois."],
      ["encrypt / decrypt", "cifrar e decifrar. No decrypt você NÃO passa a chave: ela vem identificada no dado cifrado."],
      ["Exclusão agendada", "apagar chave é irreversível; a AWS obriga esperar 7–30 dias (dá pra cancelar)."],
    ],
    cobra: "Você paga uma taxa pequena por chave por mês + por requisições de cifrar/decifrar. Proteger dados com o KMS custa muito pouco.",
  },

  cloudtrail: {
    emoji: "🕵️", titulo: "AWS CloudTrail",
    oque: "O CloudTrail é a <b>câmera de segurança</b> da sua conta: registra QUEM fez O QUÊ e QUANDO. Cada ação (criar um bucket, apagar uma instância, mudar uma permissão) vira um evento gravado. É a primeira coisa que se olha quando algo estranho acontece.",
    serve: "Auditoria e investigação: descobrir quem apagou aquele recurso, provar conformidade (quem acessou o quê), e rastrear um incidente de segurança. Sem CloudTrail, você não tem como saber o que aconteceu na conta.",
    casos: [
      "Um recurso some do nada; o CloudTrail mostra qual usuário rodou o delete e a que horas.",
      "Uma auditoria de conformidade usa o histórico pra provar quem acessou dados sensíveis.",
      "Uma investigação de segurança filtra todos os eventos de um usuário suspeito.",
    ],
    vocab: [
      ["Trilha (trail)", "a configuração que grava os eventos e entrega num bucket S3."],
      ["Evento", "uma ação registrada, com quem, quando e o resultado. Guarda o nome da API (não o comando digitado)."],
      ["lookup-events", "consultar o histórico dos últimos 90 dias, com filtros por nome ou fonte."],
      ["Pegadinha", "criar a trilha NÃO liga a gravação — precisa do start-logging."],
    ],
    cobra: "O histórico dos últimos 90 dias de eventos de gerenciamento é gratuito. Você paga por trilhas extras e pelo armazenamento no S3.",
  },

  ssm: {
    emoji: "🎛️", titulo: "Systems Manager",
    oque: "O Systems Manager é o <b>canivete suíço</b> de operações da AWS. A parte mais usada é o <b>Parameter Store</b>: uma gaveta pra guardar configuração fora do código (URLs, nomes de bucket, chaves), organizada em caminhos hierárquicos, com opção de guardar valores sensíveis cifrados.",
    serve: "Tirar configuração de dentro do código: a aplicação lê os parâmetros ao subir, e você troca um valor sem novo deploy. Usar caminhos (/loja/prod/url-api) deixa você puxar toda a config de um ambiente de uma vez.",
    casos: [
      "A URL da API e o nome do bucket ficam no Parameter Store; a aplicação lê ao iniciar.",
      "Config de produção e de teste ficam em caminhos separados (/app/prod/ e /app/test/)."
      , "Uma senha é guardada como SecureString (cifrada com KMS), lida só com permissão."
    ],
    vocab: [
      ["Parâmetro", "um par nome→valor. O nome pode ser hierárquico com barras: /loja/url-api."],
      ["Tipo", "String (texto), StringList (lista) ou SecureString (cifrado com KMS)."],
      ["with-decryption", "flag pra ler um SecureString decifrado; sem ela, vem cifrado."],
      ["SSM x Secrets Manager", "o Parameter Store é grátis e simples; o Secrets Manager custa mas faz rotação automática."],
    ],
    cobra: "O Parameter Store (parâmetros padrão) é <b>gratuito</b>. Você paga só por recursos avançados (parâmetros de alto throughput, automações).",
  },

  "cognito-idp": {
    emoji: "🎫", titulo: "Amazon Cognito",
    oque: "O Cognito dá <b>login pronto</b> pro seu app: cadastro, entrada, confirmação por e-mail, recuperação de senha e MFA — tudo sem você escrever autenticação nem guardar senha. Você cria um \"pool\" de usuários e o Cognito cuida da parte chata (e perigosa) de identidade.",
    serve: "Adicionar contas de usuário a um site ou app sem virar especialista em segurança de senha. Também permite login social (Google, Facebook) e integra com o IAM pra dar aos usuários acesso controlado a recursos da AWS.",
    casos: [
      "Um app mobile usa o Cognito pra cadastro e login, com confirmação por e-mail automática.",
      "Um site permite \"entrar com o Google\" sem implementar OAuth na mão.",
      "Usuários logados recebem permissão temporária pra subir arquivos direto no S3.",
    ],
    vocab: [
      ["User pool", "o banco de usuários do seu app (quem pode entrar). Tem um id us-east-1_XXXX."],
      ["App client", "o app (site/celular) que usa o pool. Tem um ClientId que vai no código do front-end."],
      ["Usuário", "cada conta. Criada por admin nasce em FORCE_CHANGE_PASSWORD (troca no 1º login)."],
      ["MFA", "verificação em duas etapas — o Cognito oferece pronto, você só liga."],
    ],
    cobra: "Você paga por usuário ativo por mês, com um nível gratuito generoso (dezenas de milhares de usuários grátis). Pra apps pequenos, custa zero.",
  },

  autoscaling: {
    emoji: "📶", titulo: "Auto Scaling",
    oque: "O Auto Scaling mantém a <b>quantidade certa de máquinas no ar sozinho</b>: se uma cai, ele sobe outra; se o tráfego aumenta, ele adiciona; se diminui, ele remove (e você para de pagar). Você define o mínimo, o máximo e o desejado — ele cuida do resto.",
    serve: "Aguentar picos sem intervenção e economizar nos vales: em vez de deixar 10 servidores ligados 24h \"por garantia\", você deixa 2 e o grupo sobe pra 10 só quando precisa. É elasticidade de verdade — a promessa central da nuvem.",
    casos: [
      "Na Black Friday o grupo escala de 2 pra 10 máquinas sozinho e volta pra 2 quando a onda passa.",
      "Uma máquina trava de madrugada; o Auto Scaling sobe outra no lugar sem ninguém acordar.",
      "Uma política mantém a CPU média em 60% — o grupo adiciona ou remove máquinas pra segurar isso.",
    ],
    vocab: [
      ["Launch template", "a receita da máquina (imagem, tipo, chave). O grupo usa pra subir cópias iguais."],
      ["Grupo (ASG)", "o conjunto de máquinas gerenciadas. Guarda min, max e desired."],
      ["Desired capacity", "quantas máquinas você quer AGORA (entre o min e o max)."],
      ["Política de escala", "faz o grupo subir/descer SOZINHO conforme uma métrica (ex.: CPU)."],
    ],
    cobra: "O Auto Scaling em si é <b>gratuito</b>. Você paga só pelas instâncias EC2 que ele mantém ligadas — a graça é justamente ligar menos quando dá.",
  },

  cloudformation: {
    emoji: "🏗️", titulo: "CloudFormation",
    oque: "O CloudFormation é <b>infraestrutura como código</b>: em vez de criar recursos clicando ou digitando comando por comando, você descreve tudo num arquivo (YAML/JSON) e manda a AWS montar. Um arquivo, e a VPC, as instâncias, o bucket e as permissões sobem juntos, sempre iguais.",
    serve: "Criar ambientes inteiros de forma repetível e versionável: subir uma cópia idêntica de produção pra testes, recriar tudo após um desastre, revisar mudanças de infra num pull request. Apagar o \"stack\" apaga tudo junto — sem recurso esquecido gerando custo.",
    casos: [
      "Um time sobe o ambiente inteiro (rede + servidores + banco) com um comando, sempre igual.",
      "A infra fica versionada no Git; toda mudança passa por revisão antes de ir pra produção.",
      "Depois de um teste, apagar o stack remove todos os recursos de uma vez, sem sobra.",
    ],
    vocab: [
      ["Template", "o arquivo (YAML/JSON) que descreve os recursos que você quer."],
      ["Stack", "o conjunto de recursos criados a partir de um template. Você gerencia como uma coisa só."],
      ["Recurso", "cada item declarado no template (um bucket, uma instância, uma role)."],
      ["IaC", "Infrastructure as Code — tratar infraestrutura como código: versionada, revisável, repetível."],
    ],
    cobra: "O CloudFormation é <b>gratuito</b>. Você paga só pelos recursos que ele cria (as instâncias, o banco...) — orquestrar não custa nada.",
  },
};

// Trilhas que usam o mesmo motor de outro serviço reaproveitam a lição.
const LICAO_ALIAS = { ebs: "ec2" };

// ---------- "Por que este comando existe" (chave = servico.sub) ----------
// Reutilizado entre todas as atividades que usam o mesmo comando.
const PORQUE = {
  "s3.mb": "\"make bucket\" — cria o balde onde os arquivos vão morar. É sempre o primeiro passo no S3: sem bucket, não há onde guardar nada.",
  "s3.ls": "lista o que você tem — os buckets, ou os objetos dentro de um. É como você confere o que já existe antes de mexer.",
  "s3.cp": "\"copy\" — envia um arquivo pro bucket (upload) ou traz de volta (download). É o comando que efetivamente move seus dados.",
  "s3.rm": "\"remove\" — apaga um objeto do bucket. Cuidado: é imediato e não vai pra lixeira.",
  "s3.sync": "sincroniza uma pasta inteira com o bucket de uma vez — só o que mudou. É como se publica um site ou sobe muitos arquivos.",
  "s3.rb": "\"remove bucket\" — apaga o balde inteiro. A AWS exige que ele esteja vazio (ou --force) pra evitar acidente.",
  "s3.website": "transforma o bucket num site: você diz qual é a página inicial e a de erro, e o S3 serve o HTML direto.",
  "ec2.run-instances": "liga uma máquina nova. É o comando que \"cria o servidor\" — você escolhe a imagem (AMI) e o tamanho (tipo).",
  "ec2.describe-instances": "mostra suas máquinas e o estado de cada uma. É o \"o que eu tenho ligado?\" do EC2.",
  "ec2.stop-instances": "pausa a máquina sem apagá-la — e pausa a cobrança de computação. Você liga de novo quando precisar.",
  "ec2.start-instances": "religa uma máquina que estava parada, do jeito que ela estava.",
  "ec2.terminate-instances": "encerra a máquina de vez (apaga). Diferente de parar: não tem volta.",
  "ec2.create-key-pair": "cria o par de chaves pra você entrar na máquina por SSH com segurança, sem senha.",
  "ec2.create-security-group": "cria o firewall da instância. Ele nasce bloqueando tudo — você abre as portas depois.",
  "ec2.authorize-security-group-ingress": "abre uma porta de ENTRADA no firewall. Ex.: a 80 pra o site responder, a 22 pra SSH.",
  "iam.create-user": "cria uma identidade pra uma pessoa acessar a conta. Ela nasce sem poder fazer nada — você concede depois.",
  "iam.create-group": "cria um grupo pra dar permissões a vários usuários de uma vez. Todo mundo no grupo herda.",
  "iam.create-role": "cria uma identidade pra um SERVIÇO assumir (não uma pessoa). Ex.: a role que uma Lambda \"veste\".",
  "iam.attach-user-policy": "concede uma permissão a um usuário, anexando uma política. É o \"deixar a pessoa fazer X\".",
  "iam.attach-group-policy": "concede a permissão ao grupo inteiro de uma vez.",
  "iam.attach-role-policy": "dá a uma role a permissão de falar com outro serviço.",
  "iam.list-users": "mostra quem tem acesso à conta. O primeiro passo de qualquer auditoria de segurança.",
  "lambda.create-function": "sobe uma função nova: o código, a linguagem (runtime) e a permissão (role) que ela terá.",
  "lambda.invoke": "executa a função agora e te mostra a resposta. É o teste pra ver se ela funciona.",
  "lambda.list-functions": "lista as funções que existem na conta.",
  "lambda.update-function-configuration": "muda a configuração da função (memória, tempo limite, variáveis) sem reenviar o código.",
  "dynamodb.create-table": "cria a tabela e define a chave primária — a decisão mais importante, porque é por ela que você vai buscar.",
  "dynamodb.put-item": "insere (ou substitui) um registro na tabela.",
  "dynamodb.get-item": "busca um item pela chave. É a leitura mais rápida e barata do DynamoDB.",
  "dynamodb.scan": "varre a tabela inteira. Útil, mas caro em tabelas grandes — o normal é buscar pela chave.",
  "dynamodb.list-tables": "lista as tabelas da conta.",
  "ec2.create-vpc": "cria a sua rede privada, definida por um bloco de IPs (CIDR). Tudo mais mora dentro dela.",
  "ec2.create-subnet": "divide a VPC num pedaço menor. É onde as instâncias efetivamente ficam.",
  "ec2.create-internet-gateway": "cria a porta que vai ligar a VPC à internet (ainda precisa conectar e criar a rota).",
  "ec2.attach-internet-gateway": "conecta o gateway à VPC. É um dos passos pra tornar uma sub-rede pública.",

  // ---- 2ª onda ----
  "rds.create-db-instance": "sobe um banco relacional gerenciado — você escolhe o engine (mysql, postgres...) e a AWS cuida do servidor.",
  "rds.describe-db-instances": "lista seus bancos e os endereços (endpoints) pra conectar neles.",
  "rds.stop-db-instance": "pausa o banco pra parar de pagar computação — útil fora do horário de uso.",
  "rds.start-db-instance": "religa um banco que estava parado.",
  "rds.delete-db-instance": "apaga o banco. Em produção, você guardaria um snapshot antes.",
  "logs.create-log-group": "cria o \"lugar\" onde os logs de um recurso vão ficar guardados no CloudWatch.",
  "logs.describe-log-groups": "lista os grupos de logs da conta.",
  "logs.delete-log-group": "apaga um grupo de logs (e os logs dentro).",
  "cloudwatch.put-metric-alarm": "cria o alarme que dispara quando uma métrica cruza um limite — é o que te avisa antes do problema virar incêndio.",
  "cloudwatch.describe-alarms": "lista os alarmes e o estado de cada um (OK, ALARM).",
  "cloudwatch.delete-alarms": "remove um ou mais alarmes.",
  "cloudwatch.list-metrics": "mostra quais métricas estão disponíveis pra você monitorar.",
  "sqs.create-queue": "cria a fila onde as tarefas vão esperar pra ser processadas.",
  "sqs.list-queues": "lista as filas da conta (por URL).",
  "sqs.send-message": "coloca uma tarefa na fila. Quem produz não espera — só deixa e segue.",
  "sqs.receive-message": "pega mensagens da fila pra processar; cada uma vem com um comprovante (ReceiptHandle).",
  "sqs.delete-message": "confirma que processou e tira a mensagem da fila. Sem isso, ela volta — a garantia de que nada se perde.",
  "sqs.get-queue-attributes": "mostra quantas mensagens estão esperando e quantas estão sendo processadas.",
  "sqs.delete-queue": "apaga a fila inteira.",
  "sns.create-topic": "cria o canal (tópico) onde você publica e todos os assinantes recebem.",
  "sns.list-topics": "lista os tópicos da conta.",
  "sns.subscribe": "inscreve um destino (e-mail, SMS, fila, Lambda) pra receber o que for publicado no tópico.",
  "sns.publish": "manda uma mensagem pra TODOS os assinantes do tópico de uma vez.",
  "sns.list-subscriptions-by-topic": "mostra quem está inscrito num tópico.",
  "sns.delete-topic": "apaga o tópico e todas as assinaturas dele.",
  "apigateway.create-rest-api": "cria a API — a porta de entrada HTTP da sua aplicação.",
  "apigateway.get-rest-apis": "lista as APIs da conta com seus ids.",
  "apigateway.get-resources": "mostra os caminhos da API; é aqui que você pega o id da raiz \"/\".",
  "apigateway.create-resource": "cria um caminho novo (ex.: /pedidos), pendurado na raiz.",
  "apigateway.put-method": "define qual verbo HTTP (GET, POST) aquele caminho aceita.",
  "apigateway.create-deployment": "publica a API num estágio (ex.: prod). Sem deployment, nada responde pro mundo.",
  "apigateway.delete-rest-api": "apaga a API inteira (caminhos, métodos e estágios juntos).",
  "route53.create-hosted-zone": "cria o \"cadastro\" do seu domínio, onde vão ficar todos os registros dele.",
  "route53.list-hosted-zones": "lista os domínios que você administra e seus ids.",
  "route53.list-resource-record-sets": "mostra todos os registros DNS de uma zona.",
  "route53.change-resource-record-sets": "cria, muda ou apaga registros — é como você faz o www apontar pro servidor.",
  "route53.delete-hosted-zone": "apaga a zona (precisa estar sem registros próprios).",
  "cloudfront.create-distribution": "coloca seu conteúdo na CDN, apontando pra uma origem (um bucket, por exemplo).",
  "cloudfront.list-distributions": "lista as distribuições e o domínio de cada uma.",
  "cloudfront.get-distribution": "mostra os detalhes de uma distribuição, incluindo o domínio .cloudfront.net.",
  "cloudfront.create-invalidation": "limpa o cache das bordas quando você publica uma versão nova e as pessoas ainda veem a antiga.",
  "cloudfront.list-invalidations": "mostra as limpezas de cache já pedidas.",
  "ecr.create-repository": "cria o repositório onde a imagem da sua aplicação vai ficar guardada.",
  "ecr.describe-repositories": "lista os repositórios e suas URIs (o endereço que o ECS/EKS usa).",
  "ecr.get-login-password": "gera a senha temporária pro docker autenticar e enviar a imagem.",
  "ecr.list-images": "lista as versões (tags) de imagem de um repositório.",
  "ecr.delete-repository": "apaga o repositório (com imagens dentro, exige --force).",
  "ecs.create-cluster": "cria o \"lugar\" onde seus contêineres vão rodar.",
  "ecs.list-clusters": "lista os clusters da conta.",
  "ecs.register-task-definition": "registra a receita do contêiner (imagem, memória). Cada registro cria uma revisão nova.",
  "ecs.create-service": "mantém N cópias da tarefa sempre no ar; sobe outra se uma cair.",
  "ecs.describe-services": "mostra quantas cópias estão rodando x quantas você pediu.",
  "ecs.update-service": "escala o serviço (mais ou menos cópias) ou troca a versão em produção.",
  "ecs.delete-service": "apaga o serviço (precisa estar com 0 cópias ou --force).",
  "ecs.delete-cluster": "apaga o cluster (precisa estar sem serviços dentro).",
  "secretsmanager.create-secret": "guarda uma senha/chave cifrada, fora do código.",
  "secretsmanager.list-secrets": "lista os segredos — sem mostrar os valores.",
  "secretsmanager.get-secret-value": "lê o valor do segredo. É a chamada que a aplicação faz ao subir.",
  "secretsmanager.update-secret": "troca o valor. Quem lê pelo nome já pega o novo, sem novo deploy.",
  "secretsmanager.delete-secret": "agenda a exclusão (com janela de recuperação) — dá pra desfazer antes de sumir.",
  "secretsmanager.restore-secret": "cancela uma exclusão agendada e devolve o segredo ao normal.",
  "stepfunctions.create-state-machine": "cria o fluxo de trabalho, descrito em JSON (os passos e a ordem entre eles).",
  "stepfunctions.list-state-machines": "lista os fluxos da conta.",
  "stepfunctions.describe-state-machine": "mostra a definição completa de um fluxo.",
  "stepfunctions.start-execution": "roda o fluxo, passando uma entrada. É o \"executar agora\".",
  "stepfunctions.list-executions": "mostra o histórico de execuções e o status de cada uma (onde parou, o que falhou).",
  "stepfunctions.delete-state-machine": "apaga o fluxo.",
  "events.put-rule": "cria a regra que dispara na hora certa (agendamento) ou quando algo acontece (evento).",
  "events.list-rules": "lista as regras e se estão ligadas.",
  "events.put-targets": "liga a regra a um alvo — quem será chamado quando ela disparar. Sem alvo, a regra não faz nada.",
  "events.list-targets-by-rule": "mostra os alvos de uma regra.",
  "events.remove-targets": "desliga alvos de uma regra.",
  "events.disable-rule": "pausa a regra sem apagar (para de disparar, guarda a configuração).",
  "events.enable-rule": "volta a disparar uma regra pausada.",
  "events.delete-rule": "apaga a regra (precisa remover os alvos antes).",
  "eks.create-cluster": "cria o control plane do Kubernetes gerenciado (exige 2+ sub-redes, em zonas diferentes).",
  "eks.list-clusters": "lista os clusters EKS da região.",
  "eks.describe-cluster": "mostra os detalhes do cluster (versão do Kubernetes, endpoint, sub-redes).",
  "eks.update-kubeconfig": "conecta o kubectl ao cluster — sem isso, você tem o cluster mas não consegue mandar comandos pra ele.",
  "eks.create-nodegroup": "cria as máquinas EC2 onde os contêineres (pods) realmente vão rodar.",
  "eks.list-nodegroups": "lista os grupos de máquinas do cluster.",
  "eks.delete-cluster": "apaga o cluster (precisa apagar os nodegroups antes).",
  "glue.create-database": "cria um banco no catálogo — um agrupador de tabelas.",
  "glue.get-databases": "lista os bancos do catálogo.",
  "glue.create-table": "descreve um conjunto de arquivos do S3 como uma tabela (colunas + caminho). É só metadado.",
  "glue.get-tables": "lista as tabelas de um banco do catálogo.",
  "glue.create-crawler": "cria o robô que vai varrer o S3 e descobrir as colunas sozinho.",
  "glue.start-crawler": "solta o robô pra catalogar os dados automaticamente.",
  "athena.start-query-execution": "dispara uma consulta SQL sobre os arquivos do S3 (usando o catálogo do Glue).",
  "athena.get-query-execution": "pergunta se a consulta terminou (SUCCEEDED, FAILED) e quanto de dado leu.",
  "athena.get-query-results": "traz as linhas do resultado (a 1ª linha é o cabeçalho com os nomes das colunas).",
  "athena.list-query-executions": "lista as consultas já executadas.",
  "kms.create-key": "cria uma chave de criptografia (que nunca sai do KMS).",
  "kms.list-keys": "lista as chaves da conta.",
  "kms.create-alias": "dá um apelido (alias/nome) pra chave, pra você não decorar o id enorme.",
  "kms.encrypt": "cifra um dado com a chave. Você guarda o resultado (o CiphertextBlob).",
  "kms.decrypt": "volta ao texto original. Você não informa a chave — ela vem identificada no dado cifrado.",
  "kms.enable-key-rotation": "liga a troca automática do material da chave (uma vez por ano), sem quebrar o que já foi cifrado.",
  "kms.schedule-key-deletion": "agenda a destruição da chave (irreversível; 7 a 30 dias de espera obrigatória).",
  "kms.cancel-key-deletion": "cancela uma destruição agendada (a chave volta desabilitada).",
  "cloudtrail.create-trail": "cria a trilha que vai gravar os eventos da conta num bucket S3.",
  "cloudtrail.describe-trails": "lista as trilhas e pra qual bucket cada uma entrega.",
  "cloudtrail.start-logging": "LIGA a gravação. Criar a trilha não basta — sem isso, ela não registra nada.",
  "cloudtrail.get-trail-status": "confirma se a trilha está mesmo gravando (IsLogging).",
  "cloudtrail.lookup-events": "consulta o histórico de quem fez o quê — a base de qualquer investigação.",
  "ssm.put-parameter": "guarda uma configuração (URL, chave) fora do código, pra a aplicação ler depois.",
  "ssm.get-parameter": "lê um parâmetro. É como a aplicação pega a config ao subir.",
  "ssm.get-parameters-by-path": "puxa TODOS os parâmetros de um caminho (/loja/) de uma vez — a config inteira de um ambiente.",
  "ssm.describe-parameters": "lista os parâmetros (nome e tipo), sem os valores.",
  "cognito-idp.create-user-pool": "cria o banco de usuários do seu app (quem pode entrar).",
  "cognito-idp.list-user-pools": "lista os user pools da conta.",
  "cognito-idp.describe-user-pool": "mostra a configuração do pool (inclui a política de senha).",
  "cognito-idp.create-user-pool-client": "registra o app (site/celular) que vai usar o pool; devolve o ClientId.",
  "cognito-idp.admin-create-user": "cria um usuário como admin — ele nasce obrigado a trocar a senha no 1º login.",
  "cognito-idp.list-users": "lista os usuários do pool e o status de cada um.",
  "cognito-idp.delete-user-pool": "apaga o pool e todos os usuários dentro dele.",
  "autoscaling.create-auto-scaling-group": "cria o grupo que mantém a quantidade certa de máquinas no ar sozinho.",
  "autoscaling.describe-auto-scaling-groups": "mostra o min/max/desejado e quais máquinas estão no grupo.",
  "autoscaling.set-desired-capacity": "muda quantas máquinas você quer agora — sobe ou desce na hora.",
  "autoscaling.update-auto-scaling-group": "ajusta os limites do grupo (min, max, desejado).",
  "autoscaling.put-scaling-policy": "faz o grupo escalar SOZINHO conforme uma métrica (ex.: manter a CPU em 60%).",
  "autoscaling.delete-auto-scaling-group": "apaga o grupo (com máquina no ar, precisa zerar antes).",
  "ec2.create-launch-template": "cria a receita da máquina (imagem, tipo) que o Auto Scaling usa pra subir cópias iguais.",
  "cloudformation.create-stack": "manda a AWS montar todos os recursos descritos num template, de uma vez.",
  "cloudformation.list-stacks": "lista os stacks (conjuntos de recursos) da conta.",
  "cloudformation.describe-stacks": "mostra os detalhes de um stack e seu estado.",
  "cloudformation.describe-stack-resources": "lista os recursos que um stack criou.",
  "cloudformation.delete-stack": "apaga o stack — e todos os recursos que ele criou junto, sem sobra.",
  "cloudformation.validate-template": "confere se o template está bem formado antes de tentar criar.",
  "ec2.create-route": "cria uma rota — ex.: 0.0.0.0/0 pro internet gateway, o que torna a sub-rede pública.",
  "ec2.describe-route-tables": "mostra as tabelas de rotas; é como você descobre se uma sub-rede tem saída pra internet.",
  "ec2.describe-network-acls": "mostra o firewall da sub-rede — onde a regra de menor número decide.",
  "ec2.delete-network-acl-entry": "remove uma regra da network ACL (pra tirar um bloqueio, por exemplo).",
  "ec2.create-flow-logs": "liga o registro do tráfego de rede, entregue no S3 — é o que você analisa depois.",
  "ec2.describe-flow-logs": "confirma que o flow log está ativo e pra onde entrega.",
  "ec2.describe-internet-gateways": "lista os gateways e a qual VPC cada um está conectado.",
};

(function () {
  if (typeof window === "undefined") return;

  const CHAVE_VISTAS = "climb.licoes.vistas";
  function lerVistas() {
    try { return new Set(JSON.parse(localStorage.getItem(CHAVE_VISTAS) || "[]")); }
    catch (e) { return new Set(); }
  }
  function marcarVista(sid) {
    try { const s = lerVistas(); s.add(sid); localStorage.setItem(CHAVE_VISTAS, JSON.stringify([...s])); }
    catch (e) { /* ok */ }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  // guarda o <b>...</b> que escrevemos de propósito nos textos das lições
  function ricoSeguro(s) {
    return esc(s).replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>")
      .replace(/&lt;i&gt;/g, "<i>").replace(/&lt;\/i&gt;/g, "</i>");
  }

  function licaoDoDesafio(d) {
    if (!d) return null;
    const sid = LICAO_ALIAS[d.servico] || d.servico;
    return LICOES[sid] ? { sid, licao: LICOES[sid] } : null;
  }
  // extrai "servico.sub" do 1º comando "aws ..." da solução
  function porqueDoDesafio(d) {
    if (!d || !Array.isArray(d.solucao)) return null;
    for (const s of d.solucao) {
      const m = String(s).trim().match(/^aws\s+(\S+)\s+(\S+)/);
      if (m && PORQUE[m[1] + "." + m[2]]) return PORQUE[m[1] + "." + m[2]];
    }
    return null;
  }
  // é a 1ª atividade da trilha que o aluno abre (nada concluído ainda)?
  function primeiraDaTrilha(d) {
    try { return typeof progressoServico === "function" && progressoServico(d.servico).feitos === 0; }
    catch (e) { return false; }
  }

  function htmlLicao(sid, licao, aberta) {
    const casos = (licao.casos || []).map((c) => `<li>${ricoSeguro(c)}</li>`).join("");
    const vocab = (licao.vocab || []).map(([t, x]) => `<dt>${esc(t)}</dt><dd>${ricoSeguro(x)}</dd>`).join("");
    return `<details class="licao"${aberta ? " open" : ""} data-sid="${esc(sid)}">
      <summary><span class="licao-emoji">${licao.emoji || "📚"}</span> Entenda o ${esc(licao.titulo)}</summary>
      <div class="licao-corpo">
        <p class="licao-oque">${ricoSeguro(licao.oque)}</p>
        ${licao.serve ? `<div class="licao-sec"><h4>Pra que serve</h4><p>${ricoSeguro(licao.serve)}</p></div>` : ""}
        ${casos ? `<div class="licao-sec"><h4>Onde se usa no mundo real</h4><ul class="licao-casos">${casos}</ul></div>` : ""}
        ${vocab ? `<div class="licao-sec"><h4>Vocabulário</h4><dl class="licao-vocab">${vocab}</dl></div>` : ""}
        ${licao.cobra ? `<p class="licao-cobra">💰 <strong>Como cobra:</strong> ${ricoSeguro(licao.cobra)}</p>` : ""}
      </div>
    </details>`;
  }

  // injeta a lição + o "porquê" no card, DEPOIS do renderCard original
  function injetar() {
    const card = document.querySelector("#cardDesafio");
    if (!card) return;
    const d = (typeof ui !== "undefined" && ui.desafioAtivo && typeof obterDesafio === "function")
      ? obterDesafio(ui.desafioAtivo) : null;
    if (!d) return;
    const desc = card.querySelector(".descricao");
    if (!desc) return;

    // "💡 Por que este comando" logo abaixo da descrição
    const porque = porqueDoDesafio(d);
    if (porque && !card.querySelector(".licao-porque")) {
      const p = document.createElement("p");
      p.className = "licao-porque";
      p.innerHTML = `💡 <strong>Por que este comando:</strong> ${ricoSeguro(porque)}`;
      desc.insertAdjacentElement("afterend", p);
    }

    // bloco "📚 Entenda o <serviço>" no topo (antes da descrição)
    const info = licaoDoDesafio(d);
    if (info && !card.querySelector(".licao")) {
      const vistas = lerVistas();
      const abrir = !vistas.has(info.sid) || primeiraDaTrilha(d);
      const wrap = document.createElement("div");
      wrap.innerHTML = htmlLicao(info.sid, info.licao, abrir);
      const bloco = wrap.firstElementChild;
      const titulo = card.querySelector("h2");
      if (titulo) titulo.insertAdjacentElement("afterend", bloco);
      else desc.insertAdjacentElement("beforebegin", bloco);
      // abrir a lição = considerá-la vista (não reabre sozinha na próxima)
      bloco.addEventListener("toggle", () => { if (bloco.open) marcarVista(info.sid); });
      if (abrir) marcarVista(info.sid);
    }
  }

  // wrap do renderCard: roda o original e injeta a didática por cima
  function ligar() {
    if (typeof window.renderCard !== "function") return false;
    if (window.renderCard.__climbLicoes) return true;
    const original = window.renderCard;
    window.renderCard = function () {
      const r = original.apply(this, arguments);
      try { injetar(); } catch (e) { /* didática nunca quebra o card */ }
      return r;
    };
    window.renderCard.__climbLicoes = true;
    return true;
  }

  // renderCard é definido em app.js (carrega antes). Garante o wrap.
  if (!ligar()) document.addEventListener("DOMContentLoaded", ligar);
})();
