"use strict";
// ============================================================
// CLImb — servicos-fase9.js
// Fase 9 — IA/ML e dados: Rekognition (visão), Translate (tradução),
// Polly (texto→voz), Comprehend (NLP/sentimento), Bedrock (IA generativa),
// Kinesis (streaming de dados) e Redshift (data warehouse).
//
// Os serviços de IA da AWS são "IA pronta": você chama uma API e recebe o
// resultado, sem treinar modelo. Kinesis + Redshift fecham o lado de DADOS:
// ingestão em tempo real e análise em escala.
// ============================================================
(function () {
  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";

  function estado(conta) {
    conta.kinesis = conta.kinesis || { streams: {} };
    conta.redshift = conta.redshift || { clusters: {} };
    return conta;
  }

  // ============================================================
  // Rekognition — aws rekognition (análise de imagem, resultado simulado)
  // ============================================================
  const cmdRekognition = {
    "detect-labels": (conta, pos, flags) => {
      exigirFlag(flags, "image");
      avisarClimb("O Rekognition \"enxerga\" a imagem e devolve o que tem nela, cada um com uma confiança (%). É IA pronta: você não treina nada, só manda a foto (do S3 ou em bytes).");
      return js({ Labels: [
        { Name: "Person", Confidence: 99.2, Instances: [], Parents: [] },
        { Name: "Laptop", Confidence: 91.7, Instances: [], Parents: [{ Name: "Electronics" }] },
        { Name: "Coffee Cup", Confidence: 84.3, Instances: [], Parents: [] },
      ], LabelModelVersion: "3.0" });
    },
    "detect-text": (conta, pos, flags) => {
      exigirFlag(flags, "image");
      return js({ TextDetections: [
        { DetectedText: "CLImb", Type: "LINE", Confidence: 98.1 },
        { DetectedText: "AWS CLI", Type: "LINE", Confidence: 95.4 },
      ] });
    },
    "detect-faces": (conta, pos, flags) => {
      exigirFlag(flags, "image");
      avisarClimb("Além de achar rostos, ele estima emoção, faixa etária e se está sorrindo. Muito usado em controle de acesso e moderação.");
      return js({ FaceDetails: [{ AgeRange: { Low: 22, High: 34 }, Smile: { Value: true, Confidence: 88.0 }, Emotions: [{ Type: "HAPPY", Confidence: 92.3 }], Confidence: 99.9 }] });
    },
  };

  // ============================================================
  // Translate — aws translate
  // ============================================================
  const cmdTranslate = {
    "translate-text": (conta, pos, flags) => {
      const texto = String(exigirFlag(flags, "text"));
      const de = exigirFlag(flags, "source-language-code");
      const para = exigirFlag(flags, "target-language-code");
      // "Tradução" simulada: no auto, só devolve marcado; é um simulador.
      const traducoes = { "hello world": "olá mundo", "hello": "olá", "good morning": "bom dia", "thank you": "obrigado" };
      const alvo = traducoes[texto.toLowerCase()] || `[${para}] ${texto}`;
      avisarClimb("O Translate faz tradução neural sob demanda — ótimo pra legendas, suporte multilíngue e localizar conteúdo em tempo real. Suporta 'auto' pra detectar o idioma de origem.");
      return js({ TranslatedText: alvo, SourceLanguageCode: String(de) === "auto" ? "en" : String(de), TargetLanguageCode: String(para) });
    },
    "list-languages": () => {
      return js({ Languages: [
        { LanguageCode: "pt", LanguageName: "Portuguese" }, { LanguageCode: "en", LanguageName: "English" },
        { LanguageCode: "es", LanguageName: "Spanish" }, { LanguageCode: "fr", LanguageName: "French" },
      ] });
    },
  };

  // ============================================================
  // Polly — aws polly (texto → voz)
  // ============================================================
  const cmdPolly = {
    "synthesize-speech": (conta, pos, flags) => {
      exigirFlag(flags, "text");
      exigirFlag(flags, "output-format");
      exigirFlag(flags, "voice-id");
      const saida = pos && pos.length ? pos[pos.length - 1] : "fala.mp3";
      avisarClimb(`O Polly transformou o texto em áudio e salvou em "${saida}". São vozes bem naturais (dá pra usar SSML pra controlar entonação). Serve pra acessibilidade, IVR de telefonia e narração.`);
      return okSilencioso(`Áudio gerado em ${saida}.`);
    },
    "describe-voices": (conta, pos, flags) => {
      const lang = flags["language-code"] ? String(flags["language-code"]) : "pt-BR";
      return js({ Voices: lang.startsWith("pt")
        ? [{ Id: "Camila", LanguageCode: "pt-BR", Gender: "Female", Engine: ["neural", "standard"] }, { Id: "Vitoria", LanguageCode: "pt-BR", Gender: "Female", Engine: ["standard"] }, { Id: "Thiago", LanguageCode: "pt-BR", Gender: "Male", Engine: ["neural"] }]
        : [{ Id: "Joanna", LanguageCode: "en-US", Gender: "Female", Engine: ["neural"] }, { Id: "Matthew", LanguageCode: "en-US", Gender: "Male", Engine: ["neural"] }] });
    },
  };

  // ============================================================
  // Comprehend — aws comprehend (NLP)
  // ============================================================
  function sentimentoDe(texto) {
    const t = texto.toLowerCase();
    const bom = ["ótimo", "otimo", "excelente", "adorei", "bom", "maravilhoso", "love", "great", "good", "amazing"];
    const ruim = ["péssimo", "pessimo", "horrível", "horrivel", "ruim", "odiei", "terrible", "bad", "hate", "awful"];
    if (bom.some((p) => t.includes(p))) return "POSITIVE";
    if (ruim.some((p) => t.includes(p))) return "NEGATIVE";
    return "NEUTRAL";
  }
  const cmdComprehend = {
    "detect-sentiment": (conta, pos, flags) => {
      const texto = String(exigirFlag(flags, "text"));
      exigirFlag(flags, "language-code");
      const s = sentimentoDe(texto);
      avisarClimb("O Comprehend lê texto e entende: sentimento, idioma, entidades (nomes, lugares), frases-chave. Empresas jogam milhares de avaliações/tickets nele pra medir a satisfação automaticamente.");
      const scores = { Positive: s === "POSITIVE" ? 0.94 : 0.03, Negative: s === "NEGATIVE" ? 0.91 : 0.03, Neutral: s === "NEUTRAL" ? 0.9 : 0.05, Mixed: 0.02 };
      return js({ Sentiment: s, SentimentScore: scores });
    },
    "detect-entities": (conta, pos, flags) => {
      exigirFlag(flags, "text");
      exigirFlag(flags, "language-code");
      return js({ Entities: [
        { Type: "ORGANIZATION", Text: "AWS", Score: 0.99 },
        { Type: "LOCATION", Text: "Brasil", Score: 0.97 },
      ] });
    },
    "detect-dominant-language": (conta, pos, flags) => {
      const texto = String(exigirFlag(flags, "text"));
      const pt = /[çãõáéíóúâ]|você|não|obrigado/i.test(texto);
      return js({ Languages: [{ LanguageCode: pt ? "pt" : "en", Score: 0.98 }] });
    },
  };

  // ============================================================
  // Bedrock — aws bedrock / bedrock-runtime
  // ============================================================
  const cmdBedrock = {
    "list-foundation-models": (conta) => {
      avisarClimb("O Bedrock é o balcão de IA GENERATIVA da AWS: vários modelos (Claude da Anthropic, Titan, Llama) atrás de uma API só, sem você gerenciar servidor. Você escolhe o modelo e manda o prompt.");
      return js({ modelSummaries: [
        { modelId: "anthropic.claude-3-5-sonnet-20240620-v1:0", modelName: "Claude 3.5 Sonnet", providerName: "Anthropic" },
        { modelId: "amazon.titan-text-express-v1", modelName: "Titan Text Express", providerName: "Amazon" },
        { modelId: "meta.llama3-70b-instruct-v1:0", modelName: "Llama 3 70B Instruct", providerName: "Meta" },
      ] });
    },
    "get-foundation-model": (conta, pos, flags) => {
      const id = exigirFlag(flags, "model-identifier");
      return js({ modelDetails: { modelId: String(id), modelName: "Modelo", providerName: "Anthropic", inputModalities: ["TEXT"], outputModalities: ["TEXT"], responseStreamingSupported: true } });
    },
  };
  const cmdBedrockRuntime = {
    "invoke-model": (conta, pos, flags) => {
      const modelo = exigirFlag(flags, "model-id");
      exigirFlag(flags, "body");
      const saida = pos && pos.length ? pos[pos.length - 1] : null;
      const resposta = JSON.stringify({ content: [{ type: "text", text: "Olá! Sou um modelo respondendo via Amazon Bedrock (simulado)." }], stop_reason: "end_turn" });
      avisarClimb(`Você acabou de chamar um modelo (${modelo}) via API. Na AWS real, o corpo (--body) leva o prompt no formato do modelo, e a resposta vem no arquivo de saída. É assim que se coloca IA generativa num app sem MLOps.`);
      return okSilencioso(saida ? `Resposta do modelo salva em ${saida}.` : resposta);
    },
  };

  // ============================================================
  // Kinesis — aws kinesis (streaming)
  // ============================================================
  const cmdKinesis = {
    "create-stream": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "stream-name");
      if (conta.kinesis.streams[nome]) throw new ErroCli(`An error occurred (ResourceInUseException) when calling the CreateStream operation: Stream ${nome} under account ${CONTA_ID(conta)} already exists.`);
      const shards = parseInt(flags["shard-count"] || "1", 10);
      conta.kinesis.streams[nome] = { nome, shards, registros: 0, arn: `arn:aws:kinesis:${REGIAO(conta)}:${CONTA_ID(conta)}:stream/${nome}`, criadoEm: agoraIso() };
      avisarClimb("O Kinesis é um \"cano\" pra dados que chegam SEM PARAR — cliques, sensores IoT, logs. Vários produtores jogam dentro e vários consumidores leem em tempo real. Os shards definem a vazão. É a base de pipelines de dados ao vivo.");
      return okSilencioso(`Stream "${nome}" criado com ${shards} shard(s).`);
    },
    "describe-stream": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "stream-name");
      const s = conta.kinesis.streams[nome];
      if (!s) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the DescribeStream operation: Stream ${nome} under account ${CONTA_ID(conta)} not found.`);
      return js({ StreamDescription: { StreamName: s.nome, StreamARN: s.arn, StreamStatus: "ACTIVE", Shards: Array.from({ length: s.shards }, (_, i) => ({ ShardId: `shardId-${String(i).padStart(12, "0")}` })), RetentionPeriodHours: 24 } });
    },
    "list-streams": (conta) => {
      estado(conta);
      const l = Object.keys(conta.kinesis.streams);
      if (!l.length) { avisarClimb("Nenhum stream ainda. Crie um com: aws kinesis create-stream --stream-name eventos-loja --shard-count 1"); }
      return js({ StreamNames: l });
    },
    "put-record": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "stream-name");
      exigirFlag(flags, "data");
      exigirFlag(flags, "partition-key");
      const s = conta.kinesis.streams[nome];
      if (!s) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the PutRecord operation: Stream ${nome} not found.`);
      s.registros++;
      avisarClimb("Registro colocado no stream. Do outro lado, um Lambda ou o Kinesis Data Firehose consome isso e joga no S3/Redshift — sem você segurar nada em memória.");
      return js({ ShardId: "shardId-000000000000", SequenceNumber: String(Date.now()) + hexAleatorio(8) });
    },
    "delete-stream": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "stream-name");
      if (!conta.kinesis.streams[nome]) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the DeleteStream operation: Stream ${nome} not found.`);
      delete conta.kinesis.streams[nome];
      return okSilencioso(`Stream "${nome}" apagado.`);
    },
  };

  // ============================================================
  // Redshift — aws redshift (data warehouse)
  // ============================================================
  const cmdRedshift = {
    "create-cluster": (conta, pos, flags) => {
      estado(conta);
      const id = exigirFlag(flags, "cluster-identifier");
      const tipo = exigirFlag(flags, "node-type");
      exigirFlag(flags, "master-username");
      exigirFlag(flags, "master-user-password");
      if (conta.redshift.clusters[id]) throw new ErroCli(`An error occurred (ClusterAlreadyExists) when calling the CreateCluster operation: Cluster already exists: ${id}`);
      const nos = parseInt(flags["number-of-nodes"] || "1", 10);
      conta.redshift.clusters[id] = { id, tipo: String(tipo), nos, endpoint: `${id}.${hexAleatorio(8)}.${REGIAO(conta)}.redshift.amazonaws.com`, criadoEm: agoraIso() };
      avisarClimb("O Redshift é o DATA WAREHOUSE da AWS — banco feito pra ANALISAR bilhões de linhas (relatórios, BI), não pra transação do dia a dia (isso é o RDS). Ele guarda por COLUNA, o que deixa consultas analíticas absurdamente rápidas.");
      return js({ Cluster: { ClusterIdentifier: id, NodeType: String(tipo), NumberOfNodes: nos, ClusterStatus: "creating", MasterUsername: String(flags["master-username"]) } });
    },
    "describe-clusters": (conta) => {
      estado(conta);
      const l = Object.values(conta.redshift.clusters);
      if (!l.length) { avisarClimb("Nenhum cluster Redshift ainda. Crie um com create-cluster (lembre: Redshift = análise/BI; RDS = transações)."); }
      return js({ Clusters: l.map((c) => ({ ClusterIdentifier: c.id, NodeType: c.tipo, NumberOfNodes: c.nos, ClusterStatus: "available", Endpoint: { Address: c.endpoint, Port: 5439 } })) });
    },
    "delete-cluster": (conta, pos, flags) => {
      estado(conta);
      const id = exigirFlag(flags, "cluster-identifier");
      if (!conta.redshift.clusters[id]) throw new ErroCli(`An error occurred (ClusterNotFound) when calling the DeleteCluster operation: Cluster not found: ${id}`);
      // Na AWS real exige --final-cluster-snapshot-identifier OU --skip-final-cluster-snapshot; ensinamos isso.
      if (!flags["skip-final-cluster-snapshot"] && !flags["final-cluster-snapshot-identifier"]) {
        throw new ErroCli(`An error occurred (InvalidParameterCombination) when calling the DeleteCluster operation: You must specify either --skip-final-cluster-snapshot OR --final-cluster-snapshot-identifier <nome>.\nA AWS não deixa apagar um data warehouse sem você decidir se quer um backup final.`);
      }
      delete conta.redshift.clusters[id];
      return okSilencioso(`Cluster "${id}" apagado.`);
    },
  };

  // ---------- Registro ----------
  if (typeof SERVICOS !== "undefined") {
    SERVICOS.rekognition = cmdRekognition;
    SERVICOS.translate = cmdTranslate;
    SERVICOS.polly = cmdPolly;
    SERVICOS.comprehend = cmdComprehend;
    SERVICOS.bedrock = cmdBedrock;
    SERVICOS["bedrock-runtime"] = cmdBedrockRuntime;
    SERVICOS.kinesis = cmdKinesis;
    SERVICOS.redshift = cmdRedshift;
  }

  // ============================================================
  // Trilhas
  // ============================================================
  const DESAFIOS_FASE9 = [
    // ===================== Rekognition =====================
    { id: "rek-1", servico: "rekognition", nivel: 1, xp: 60, titulo: "IA que enxerga",
      descricao: "O <b>Rekognition</b> analisa imagens — sem treinar nada, você manda a foto e recebe o que tem nela. Detecte os <b>rótulos</b> de uma imagem no S3.",
      dicas: ["`detect-…` é a análise de IA: você manda o conteúdo e ele devolve o que achou — veja a lista de comandos com: aws rekognition help", "A forma do comando é: aws rekognition detect-labels --image <json apontando a imagem no S3>"],
      solucao: [`aws rekognition detect-labels --image '{"S3Object":{"Bucket":"meu-bucket","Name":"foto.jpg"}}'`],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "rekognition", "detect-labels") },
    { id: "rek-2", servico: "rekognition", nivel: 2, xp: 80, titulo: "Leia o texto da imagem",
      descricao: "Use o Rekognition pra <b>extrair texto</b> de uma imagem (placas, documentos). <small>(mesmo formato de --image do passo anterior)</small>",
      dicas: ["`detect-…` é a análise de IA: você manda o conteúdo e ele devolve o que achou — veja a lista de comandos com: aws rekognition help", "A forma do comando é: aws rekognition detect-text --image <json apontando a imagem no S3>"],
      solucao: [`aws rekognition detect-text --image '{"S3Object":{"Bucket":"meu-bucket","Name":"placa.jpg"}}'`],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "rekognition", "detect-text") },

    // ===================== Translate =====================
    { id: "trad-1", servico: "translate", nivel: 1, xp: 60, titulo: "Tradutor sob demanda",
      descricao: "O <b>Translate</b> faz tradução neural na hora. Traduza <b>\"hello world\"</b> de <b>en</b> pra <b>pt</b>.",
      dicas: ["`translate-…` faz a tradução — veja a lista de comandos com: aws translate help", "A forma do comando é: aws translate translate-text --text <o texto> --source-language-code <idioma de origem> --target-language-code <idioma de destino>"],
      solucao: ["aws translate translate-text --text \"hello world\" --source-language-code en --target-language-code pt"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "translate", "translate-text") },

    // ===================== Polly =====================
    { id: "polly-1", servico: "polly", nivel: 1, xp: 70, titulo: "Texto vira voz",
      descricao: "O <b>Polly</b> transforma texto em áudio com vozes naturais. Sintetize uma fala em <b>MP3</b> com a voz <b>Camila</b> (pt-BR), salvando em <b>fala.mp3</b>.",
      dicas: ["`synthesize-…` gera o conteúdo (aqui, o áudio) — veja a lista de comandos com: aws polly help", "A forma do comando é: aws polly synthesize-speech --text <o texto> --output-format <formato> --voice-id <voz> <arquivo>"],
      solucao: ["aws polly synthesize-speech --text \"Bem-vindo ao CLImb\" --output-format mp3 --voice-id Camila fala.mp3"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "polly", "synthesize-speech") },
    { id: "polly-2", servico: "polly", nivel: 2, xp: 70, titulo: "Quais vozes existem?",
      descricao: "Liste as <b>vozes</b> disponíveis em <b>pt-BR</b>.",
      dicas: ["`describe-…` é o que mostra os detalhes/estado de um recurso — veja a lista de comandos com: aws polly help", "A forma do comando é: aws polly describe-voices --language-code <idioma>"],
      solucao: ["aws polly describe-voices --language-code pt-BR"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "polly", "describe-voices") },

    // ===================== Comprehend =====================
    { id: "comp-1", servico: "comprehend", nivel: 1, xp: 60, titulo: "O cliente está feliz?",
      descricao: "O <b>Comprehend</b> entende texto. Detecte o <b>sentimento</b> de uma avaliação em português.",
      dicas: ["`detect-…` é a análise de IA: você manda o conteúdo e ele devolve o que achou — veja a lista de comandos com: aws comprehend help", "A forma do comando é: aws comprehend detect-sentiment --text <o texto> --language-code <idioma>"],
      solucao: ["aws comprehend detect-sentiment --text \"adorei o produto, excelente\" --language-code pt"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "comprehend", "detect-sentiment") },
    { id: "comp-2", servico: "comprehend", nivel: 2, xp: 80, titulo: "Quem e onde?",
      descricao: "Extraia as <b>entidades</b> (nomes, lugares, organizações) de um texto.",
      dicas: ["`detect-…` é a análise de IA: você manda o conteúdo e ele devolve o que achou — veja a lista de comandos com: aws comprehend help", "A forma do comando é: aws comprehend detect-entities --text <o texto> --language-code <idioma>"],
      solucao: ["aws comprehend detect-entities --text \"A AWS tem data centers no Brasil\" --language-code pt"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "comprehend", "detect-entities") },

    // ===================== Bedrock =====================
    { id: "bed-1", servico: "bedrock", nivel: 1, xp: 70, titulo: "O balcão de IA generativa",
      descricao: "O <b>Bedrock</b> dá acesso a vários modelos de IA (Claude, Titan, Llama) por uma API só. Liste os <b>modelos disponíveis</b>.",
      dicas: ["Pra ver o que já existe, o verbo costuma ser `list-…` — veja a lista de comandos com: aws bedrock help"], solucao: ["aws bedrock list-foundation-models"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "bedrock", "list-foundation-models") },
    { id: "bed-2", servico: "bedrock-runtime", nivel: 2, xp: 100, titulo: "Chame o modelo",
      descricao: "Invoque um modelo passando um <b>prompt</b> no corpo. <small>(o --body é o payload no formato do modelo; a resposta vai pro arquivo de saída)</small>",
      dicas: ["`invoke-…` chama/executa — veja a lista de comandos com: aws bedrock-runtime help", "A forma do comando é: aws bedrock-runtime invoke-model --model-id <id> --body <json do prompt> <arquivo>"],
      solucao: [`aws bedrock-runtime invoke-model --model-id anthropic.claude-3-5-sonnet-20240620-v1:0 --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":100,"messages":[{"role":"user","content":"Explique EC2 em 1 frase"}]}' resposta.json`],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "bedrock-runtime", "invoke-model") },

    // ===================== Kinesis =====================
    { id: "kin-1", servico: "kinesis", nivel: 1, xp: 60, titulo: "Cano de dados ao vivo",
      descricao: "O <b>Kinesis</b> engole dados que chegam sem parar (cliques, sensores, logs). Crie um stream <b>eventos-loja</b> com <b>1</b> shard.",
      dicas: ["Criar recurso no AWS CLI é sempre `create-…` — veja a lista de comandos com: aws kinesis help", "A forma do comando é: aws kinesis create-stream --stream-name <nome> --shard-count <número>"],
      solucao: ["aws kinesis create-stream --stream-name eventos-loja --shard-count 1"],
      validar: (c) => !!(c.kinesis && c.kinesis.streams["eventos-loja"]) },
    { id: "kin-2", servico: "kinesis", nivel: 2, xp: 90, titulo: "Jogue um evento no cano",
      descricao: "Coloque um <b>registro</b> no stream <b>eventos-loja</b> (com uma partition-key qualquer).",
      dicas: ["`put-…` grava/substitui uma configuração (é o \"salvar\" do CLI) — veja a lista de comandos com: aws kinesis help", "A forma do comando é: aws kinesis put-record --stream-name <nome> --data <o dado> --partition-key <chave>"],
      solucao: ["aws kinesis put-record --stream-name eventos-loja --data \"clique-produto-42\" --partition-key user1"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "kinesis", "put-record") },
    { id: "kin-3", servico: "kinesis", nivel: 3, xp: 80, titulo: "Feche o cano",
      descricao: "<b>Apague</b> o stream <b>eventos-loja</b>.",
      dicas: ["Apagar é sempre `delete-…` — veja a lista de comandos com: aws kinesis help", "A forma do comando é: aws kinesis delete-stream --stream-name <nome>"],
      solucao: ["aws kinesis delete-stream --stream-name eventos-loja"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "kinesis", "delete-stream") && !(c.kinesis && c.kinesis.streams["eventos-loja"]) },

    // ===================== Redshift =====================
    { id: "rs-1", servico: "redshift", nivel: 1, xp: 60, titulo: "Data warehouse",
      descricao: "O <b>Redshift</b> é feito pra ANALISAR bilhões de linhas (BI/relatórios) — não é o banco do dia a dia (isso é o RDS). Liste os <b>clusters</b>.",
      dicas: ["`describe-…` é o que mostra os detalhes/estado de um recurso — veja a lista de comandos com: aws redshift help"], solucao: ["aws redshift describe-clusters"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "redshift", "describe-clusters") },
    { id: "rs-2", servico: "redshift", nivel: 2, xp: 110, titulo: "Suba o warehouse",
      descricao: "Crie um cluster <b>analitica-loja</b>, tipo <b>dc2.large</b>, usuário mestre <b>admin</b>. <small>(no simulador a senha é fictícia; nunca use senha real)</small>",
      dicas: ["Criar recurso no AWS CLI é sempre `create-…` — veja a lista de comandos com: aws redshift help", "A forma do comando é: aws redshift create-cluster --cluster-identifier <identificador> --node-type <tipo> --master-username <valor> --master-user-password <uma senha> --number-of-nodes <número>"],
      solucao: ["aws redshift create-cluster --cluster-identifier analitica-loja --node-type dc2.large --master-username admin --master-user-password SenhaExemplo123 --number-of-nodes 1"],
      validar: (c) => !!(c.redshift && c.redshift.clusters["analitica-loja"]) },
    { id: "rs-3", servico: "redshift", nivel: 3, xp: 90, titulo: "Derrube o warehouse",
      descricao: "<b>Apague</b> o cluster <b>analitica-loja</b>. <small>(a AWS exige você decidir sobre o backup final — use <code>--skip-final-cluster-snapshot</code>)</small>",
      dicas: ["Apagar é sempre `delete-…` — veja a lista de comandos com: aws redshift help", "A forma do comando é: aws redshift delete-cluster --cluster-identifier <identificador> --skip-final-cluster-snapshot"],
      solucao: ["aws redshift delete-cluster --cluster-identifier analitica-loja --skip-final-cluster-snapshot"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "redshift", "delete-cluster") && !(c.redshift && c.redshift.clusters["analitica-loja"]) },
  ];

  if (typeof SERVICOS_META !== "undefined" && typeof DESAFIOS !== "undefined") {
    const metas = [
      { id: "rekognition", nome: "Rekognition", subtitulo: "IA que enxerga", icone: "👁️" },
      { id: "translate", nome: "Translate", subtitulo: "Tradução neural", icone: "🌐" },
      { id: "polly", nome: "Polly", subtitulo: "Texto vira voz", icone: "🗣️" },
      { id: "comprehend", nome: "Comprehend", subtitulo: "Entende texto", icone: "💬" },
      { id: "bedrock", nome: "Bedrock", subtitulo: "IA generativa", icone: "🤖" },
      { id: "kinesis", nome: "Kinesis", subtitulo: "Streaming de dados", icone: "🌊" },
      { id: "redshift", nome: "Redshift", subtitulo: "Data warehouse", icone: "🏬" },
    ];
    if (!SERVICOS_META.some((s) => s.id === "rekognition")) {
      for (const m of metas) {
        const iProj = SERVICOS_META.findIndex((s) => s.id === "projetos");
        if (iProj >= 0) SERVICOS_META.splice(iProj, 0, m); else SERVICOS_META.push(m);
      }
      for (const d of DESAFIOS_FASE9) DESAFIOS.push(d);
    }
  }
})();
