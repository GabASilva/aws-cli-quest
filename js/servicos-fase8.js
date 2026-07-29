"use strict";
// ============================================================
// CLImb — servicos-fase8.js
// Fase 8 — Segurança: GuardDuty (detecção de ameaças), Inspector (vulnerabilidades),
// Macie (dados sensíveis no S3), WAF (firewall de aplicação), Shield (anti-DDoS)
// e Config (auditoria de configuração).
//
// É o time de defesa da AWS. Cada um vigia uma frente diferente; juntos formam
// a resposta à pergunta que toda banca de certificação faz: "como eu descubro
// que fui atacado / configurei algo errado?".
// ============================================================
(function () {
  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";

  function estado(conta) {
    conta.guardduty = conta.guardduty || { detectores: {} };
    conta.inspector = conta.inspector || { ligado: false, achados: null };
    conta.macie = conta.macie || { ligado: false, jobs: {} };
    conta.waf = conta.waf || { acls: {} };
    conta.config = conta.config || { recorder: null, gravando: false, regras: {} };
    return conta;
  }

  // ============================================================
  // GuardDuty — aws guardduty
  // ============================================================
  function achadosSimulados(conta) {
    return [
      { id: hexAleatorio(32), tipo: "UnauthorizedAccess:EC2/SSHBruteForce", gravidade: 5.0, titulo: "Tentativas de força-bruta SSH numa instância EC2." },
      { id: hexAleatorio(32), tipo: "Recon:EC2/PortProbeUnprotectedPort", gravidade: 2.0, titulo: "Varredura de portas numa porta desprotegida." },
    ];
  }
  const cmdGuardDuty = {
    "create-detector": (conta, pos, flags) => {
      estado(conta);
      // --enable é uma flag booleana (store_true): vem como `true`, sem valor.
      // Por isso não dá pra usar exigirFlag aqui (ele rejeita valor booleano).
      if (flags.enable === undefined) throw new ErroCli("aws: error: the following arguments are required: --enable | --no-enable\nPra ligar o GuardDuty: aws guardduty create-detector --enable");
      const jaTem = Object.keys(conta.guardduty.detectores)[0];
      if (jaTem) throw new ErroCli(`An error occurred (BadRequestException) when calling the CreateDetector operation: The request is rejected because a detector already exists (${jaTem}).`);
      const id = hexAleatorio(32);
      conta.guardduty.detectores[id] = { id, ligado: true, criadoEm: agoraIso() };
      avisarClimb("O GuardDuty é vigilância que roda sozinha: ele lê os logs (VPC Flow, DNS, CloudTrail) e usa machine learning pra achar comportamento suspeito — força-bruta, mineração de cripto, acesso de país estranho. Você não configura regra, ele já vem sabendo o que é ameaça.");
      return js({ DetectorId: id });
    },
    "list-detectors": (conta) => {
      estado(conta);
      return js({ DetectorIds: Object.keys(conta.guardduty.detectores) });
    },
    "list-findings": (conta, pos, flags) => {
      estado(conta);
      const det = exigirFlag(flags, "detector-id");
      if (!conta.guardduty.detectores[det]) throw new ErroCli(`An error occurred (BadRequestException) when calling the ListFindings operation: The request is rejected because the input detectorId is not owned by the current account.`);
      avisarClimb("Cada \"finding\" é uma suspeita com uma gravidade (0-10). Numa conta de verdade você mandaria isso pro Security Hub / EventBridge pra agir automaticamente.");
      return js({ FindingIds: achadosSimulados(conta).map((a) => a.id) });
    },
    "get-findings": (conta, pos, flags) => {
      estado(conta);
      exigirFlag(flags, "detector-id");
      return js({ Findings: achadosSimulados(conta).map((a) => ({ Id: a.id, Type: a.tipo, Severity: a.gravidade, Title: a.titulo, Region: REGIAO(conta) })) });
    },
    "delete-detector": (conta, pos, flags) => {
      estado(conta);
      const det = exigirFlag(flags, "detector-id");
      if (!conta.guardduty.detectores[det]) throw new ErroCli(`An error occurred (BadRequestException) when calling the DeleteDetector operation: detector ${det} não existe.`);
      delete conta.guardduty.detectores[det];
      return okSilencioso("Detector do GuardDuty removido.");
    },
  };

  // ============================================================
  // Inspector — aws inspector2
  // ============================================================
  const cmdInspector = {
    "enable": (conta, pos, flags) => {
      estado(conta);
      exigirFlag(flags, "resource-types");
      conta.inspector.ligado = true;
      avisarClimb("O Inspector fica escaneando suas instâncias EC2 e imagens de container atrás de VULNERABILIDADES conhecidas (CVEs) e software desatualizado. Diferente do GuardDuty (que vê ATAQUES), o Inspector vê as PORTAS que o ataque usaria.");
      return js({ accounts: [{ accountId: CONTA_ID(conta), resourceStatus: { ec2: "ENABLED", ecr: "ENABLED" }, status: "ENABLED" }] });
    },
    "list-findings": (conta) => {
      estado(conta);
      if (!conta.inspector.ligado) throw new ErroCli("An error occurred (AccessDeniedException) when calling the ListFindings operation: o Inspector não está habilitado. Rode 'aws inspector2 enable --resource-types EC2' antes.");
      avisarClimb("Cada achado aponta um CVE, o pacote afetado e como corrigir (geralmente: atualize o pacote). Prioriza pela nota CVSS.");
      return js({ findings: [
        { findingArn: `arn:aws:inspector2:${REGIAO(conta)}:${CONTA_ID(conta)}:finding/${hexAleatorio(32)}`, severity: "HIGH", title: "CVE-2024-XXXX - openssl", type: "PACKAGE_VULNERABILITY", status: "ACTIVE" },
        { findingArn: `arn:aws:inspector2:${REGIAO(conta)}:${CONTA_ID(conta)}:finding/${hexAleatorio(32)}`, severity: "MEDIUM", title: "CVE-2024-YYYY - libcurl", type: "PACKAGE_VULNERABILITY", status: "ACTIVE" },
      ] });
    },
    "batch-get-account-status": (conta) => {
      estado(conta);
      return js({ accounts: [{ accountId: CONTA_ID(conta), state: { status: conta.inspector.ligado ? "ENABLED" : "DISABLED" } }] });
    },
    "disable": (conta, pos, flags) => {
      estado(conta);
      exigirFlag(flags, "resource-types");
      conta.inspector.ligado = false;
      return js({ accounts: [{ accountId: CONTA_ID(conta), status: "DISABLED" }] });
    },
  };

  // ============================================================
  // Macie — aws macie2
  // ============================================================
  const cmdMacie = {
    "enable-macie": (conta) => {
      estado(conta);
      if (conta.macie.ligado) throw new ErroCli("An error occurred (ConflictException) when calling the EnableMacie operation: Macie already enabled.");
      conta.macie.ligado = true;
      avisarClimb("O Macie vasculha seus buckets S3 procurando DADOS SENSÍVEIS — CPF, cartão de crédito, chaves de API que alguém subiu sem querer. É o especialista em \"vazamento de dado no S3\".");
      return okSilencioso("Macie habilitado.");
    },
    "get-macie-session": (conta) => {
      estado(conta);
      if (!conta.macie.ligado) throw new ErroCli("An error occurred (AccessDeniedException) when calling the GetMacieSession operation: Macie is not enabled. Rode 'aws macie2 enable-macie'.");
      return js({ status: "ENABLED", findingPublishingFrequency: "FIFTEEN_MINUTES", serviceRole: `arn:aws:iam::${CONTA_ID(conta)}:role/aws-service-role/macie.amazonaws.com` });
    },
    "create-classification-job": (conta, pos, flags) => {
      estado(conta);
      if (!conta.macie.ligado) throw new ErroCli("An error occurred (AccessDeniedException) when calling the CreateClassificationJob operation: habilite o Macie antes (aws macie2 enable-macie).");
      const nome = exigirFlag(flags, "name");
      exigirFlag(flags, "s3-job-definition");
      exigirFlag(flags, "job-type");
      const id = hexAleatorio(32);
      conta.macie.jobs[id] = { id, nome, criadoEm: agoraIso() };
      avisarClimb(`Job de classificação "${nome}" criado. Ele vai ler os objetos do bucket e marcar o que parece ser dado pessoal/financeiro. O resultado vira \"findings\" com o tipo de dado achado.`);
      return js({ jobId: id, jobArn: `arn:aws:macie2:${REGIAO(conta)}:${CONTA_ID(conta)}:classification-job/${id}` });
    },
    "list-classification-jobs": (conta) => {
      estado(conta);
      return js({ items: Object.values(conta.macie.jobs).map((j) => ({ jobId: j.id, name: j.nome, jobStatus: "RUNNING", jobType: "ONE_TIME" })) });
    },
    "disable-macie": (conta) => {
      estado(conta);
      if (!conta.macie.ligado) throw new ErroCli("An error occurred (AccessDeniedException) when calling the DisableMacie operation: Macie is not enabled.");
      conta.macie = { ligado: false, jobs: {} };
      return okSilencioso("Macie desabilitado.");
    },
  };

  // ============================================================
  // WAF — aws wafv2
  // ============================================================
  const ESCOPOS_WAF = ["REGIONAL", "CLOUDFRONT"];
  const cmdWaf = {
    "create-web-acl": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "name");
      const escopo = String(exigirFlag(flags, "scope"));
      exigirFlag(flags, "default-action");
      exigirFlag(flags, "visibility-config");
      if (!ESCOPOS_WAF.includes(escopo)) throw new ErroCli(`An error occurred (WAFInvalidParameterException) when calling the CreateWebACL operation: scope precisa ser REGIONAL ou CLOUDFRONT.`);
      if (Object.values(conta.waf.acls).some((a) => a.nome === nome && a.escopo === escopo)) throw new ErroCli(`An error occurred (WAFDuplicateItemException) when calling the CreateWebACL operation: AWS WAF couldn't perform the operation because some resource in your request is a duplicate of an existing one (${nome}).`);
      const id = hexAleatorio(8) + "-" + hexAleatorio(4) + "-" + hexAleatorio(12);
      conta.waf.acls[id] = { id, nome, escopo, regras: [], criadoEm: agoraIso() };
      avisarClimb("O WAF é o firewall da CAMADA DE APLICAÇÃO (HTTP). Ele para SQL injection, XSS, bots e excesso de requisições ANTES de chegar na sua app. Você o pluga num load balancer, API Gateway ou CloudFront. Adicione regras gerenciadas da AWS pra cobrir os ataques comuns.");
      return js({ Summary: { Name: nome, Id: id, ARN: `arn:aws:wafv2:${REGIAO(conta)}:${CONTA_ID(conta)}:${escopo.toLowerCase()}/webacl/${nome}/${id}` } });
    },
    "list-web-acls": (conta, pos, flags) => {
      estado(conta);
      const escopo = flags.scope ? String(flags.scope) : "REGIONAL";
      const l = Object.values(conta.waf.acls).filter((a) => a.escopo === escopo);
      if (!l.length) { avisarClimb("Nenhuma Web ACL neste escopo. Crie uma com create-web-acl (não esqueça de escolher REGIONAL pra load balancer/API ou CLOUDFRONT pra CDN)."); }
      return js({ WebACLs: l.map((a) => ({ Name: a.nome, Id: a.id, ARN: `arn:aws:wafv2:${REGIAO(conta)}:${CONTA_ID(conta)}:${a.escopo.toLowerCase()}/webacl/${a.nome}/${a.id}` })) });
    },
    "get-web-acl": (conta, pos, flags) => {
      estado(conta);
      const id = exigirFlag(flags, "id");
      const a = conta.waf.acls[id];
      if (!a) throw new ErroCli(`An error occurred (WAFNonexistentItemException) when calling the GetWebACL operation: web ACL ${id} não existe.`);
      return js({ WebACL: { Name: a.nome, Id: a.id, Rules: a.regras, DefaultAction: { Allow: {} } } });
    },
    "delete-web-acl": (conta, pos, flags) => {
      estado(conta);
      const id = exigirFlag(flags, "id");
      if (!conta.waf.acls[id]) throw new ErroCli(`An error occurred (WAFNonexistentItemException) when calling the DeleteWebACL operation: web ACL ${id} não existe.`);
      delete conta.waf.acls[id];
      return okSilencioso("Web ACL apagada.");
    },
  };

  // ============================================================
  // Shield — aws shield (só leitura no simulador)
  // ============================================================
  const cmdShield = {
    "describe-subscription": (conta) => {
      estado(conta);
      avisarClimb("Todo mundo na AWS já tem o Shield STANDARD de graça — ele barra os ataques DDoS mais comuns (camada de rede) automaticamente. O Shield ADVANCED (pago) dá proteção mais forte + um time de resposta da AWS. Na prova: DDoS → Shield.");
      return js({ Subscription: { StartTime: "2026-01-01T00:00:00Z", TimeCommitmentInSeconds: 0, AutoRenew: "DISABLED", Limits: [] } });
    },
    "list-protections": (conta) => {
      estado(conta);
      return js({ Protections: [] });
    },
    "describe-attack-statistics": (conta) => {
      estado(conta);
      return js({ DataItems: [{ AttackVolume: { BitsPerSecond: { Max: 0 } }, AttackCount: 0 }], TimeRange: { FromInclusive: "2026-07-01T00:00:00Z", ToExclusive: "2026-07-24T00:00:00Z" } });
    },
  };

  // ============================================================
  // Config — aws configservice
  // ============================================================
  const cmdConfig = {
    "put-configuration-recorder": (conta, pos, flags) => {
      estado(conta);
      exigirFlag(flags, "configuration-recorder");
      conta.config.recorder = { nome: "default", criadoEm: agoraIso() };
      avisarClimb("O AWS Config é a \"câmera de segurança\" da sua conta: ele grava o histórico de configuração de cada recurso. Você consegue responder \"quem mudou esse security group e quando?\" e \"quais recursos estão fora do padrão?\". Falta ligar o gravador (start).");
      return okSilencioso("Configuration recorder criado.");
    },
    "start-configuration-recorder": (conta, pos, flags) => {
      estado(conta);
      exigirFlag(flags, "configuration-recorder-name");
      if (!conta.config.recorder) throw new ErroCli("An error occurred (NoSuchConfigurationRecorderException) when calling the StartConfigurationRecorder operation: crie o recorder antes (put-configuration-recorder).");
      conta.config.gravando = true;
      avisarClimb("Gravando. A partir de agora toda mudança de configuração fica registrada. O próximo passo é criar REGRAS (config rules) que marcam recurso fora do padrão — ex.: \"todo bucket S3 tem que ter criptografia\".");
      return okSilencioso("Gravação de configuração iniciada.");
    },
    "put-config-rule": (conta, pos, flags) => {
      estado(conta);
      const bruto = exigirFlag(flags, "config-rule");
      let regra;
      try { regra = typeof bruto === "string" ? JSON.parse(bruto) : bruto; } catch (e) { throw new ErroCli("An error occurred (InvalidParameterValueException) when calling the PutConfigRule operation: --config-rule precisa ser JSON válido."); }
      const nome = regra.ConfigRuleName;
      if (!nome) throw new ErroCli("An error occurred (InvalidParameterValueException) when calling the PutConfigRule operation: ConfigRuleName é obrigatório.");
      conta.config.regras[nome] = { nome, fonte: regra.Source || {}, criadoEm: agoraIso() };
      avisarClimb(`Regra "${nome}" ativa. O Config vai avaliar os recursos e marcar quem está NON_COMPLIANT. Isso vira relatório de conformidade (útil pra auditoria/LGPD).`);
      return okSilencioso(`Regra "${nome}" criada.`);
    },
    "describe-config-rules": (conta) => {
      estado(conta);
      const l = Object.values(conta.config.regras);
      if (!l.length) { avisarClimb("Nenhuma regra ainda. Comece por uma regra gerenciada como s3-bucket-server-side-encryption-enabled."); }
      return js({ ConfigRules: l.map((r) => ({ ConfigRuleName: r.nome, ConfigRuleState: "ACTIVE", Source: r.fonte })) });
    },
    "describe-configuration-recorder-status": (conta) => {
      estado(conta);
      return js({ ConfigurationRecordersStatus: conta.config.recorder ? [{ name: "default", recording: !!conta.config.gravando, lastStatus: conta.config.gravando ? "SUCCESS" : "PENDING" }] : [] });
    },
  };

  // ---------- Registro ----------
  if (typeof SERVICOS !== "undefined") {
    SERVICOS.guardduty = cmdGuardDuty;
    SERVICOS.inspector2 = cmdInspector;
    SERVICOS.macie2 = cmdMacie;
    SERVICOS.wafv2 = cmdWaf;
    SERVICOS.shield = cmdShield;
    SERVICOS.configservice = cmdConfig;
  }

  // ============================================================
  // Trilhas
  // ============================================================
  const DESAFIOS_FASE8 = [
    // ===================== GuardDuty =====================
    { id: "gd-1", servico: "guardduty", nivel: 1, xp: 60, titulo: "Vigia que nunca dorme",
      descricao: "O <b>GuardDuty</b> lê seus logs e usa ML pra achar ataque (força-bruta, mineração de cripto). Ligue-o criando um <b>detector</b>.",
      dicas: ["Criar recurso no AWS CLI é sempre `create-…` — veja a lista de comandos com: aws guardduty help"], solucao: ["aws guardduty create-detector --enable"],
      validar: (c) => !!(c.guardduty && Object.keys(c.guardduty.detectores).length > 0) },
    { id: "gd-2", servico: "guardduty", nivel: 2, xp: 80, titulo: "Qual é o ID do vigia?",
      descricao: "Liste os <b>detectores</b> pra pegar o ID (você vai precisar dele pra ver os alertas).",
      dicas: ["Pra ver o que já existe, o verbo costuma ser `list-…` — veja a lista de comandos com: aws guardduty help"], solucao: ["aws guardduty list-detectors"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "guardduty", "list-detectors") },
    { id: "gd-3", servico: "guardduty", nivel: 3, xp: 100, titulo: "O que ele encontrou?",
      descricao: "Liste os <b>findings</b> (suspeitas) do detector. <small>(use o detector-id que você pegou no passo anterior)</small>",
      dicas: ["Pra ver o que já existe, o verbo costuma ser `list-…` — veja a lista de comandos com: aws guardduty help", "A forma do comando é: aws guardduty list-findings --detector-id <id>"],
      solucao: ["aws guardduty list-findings --detector-id <detector-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "guardduty", "list-findings") },

    // ===================== Inspector =====================
    { id: "insp-1", servico: "inspector2", nivel: 1, xp: 60, titulo: "Caça-vulnerabilidades",
      descricao: "Enquanto o GuardDuty vê ataques, o <b>Inspector</b> vê as <b>brechas</b> (CVEs, software desatualizado) nas suas instâncias e imagens. Habilite-o pra <b>EC2</b>.",
      dicas: ["`enable-…` liga o serviço na conta — veja a lista de comandos com: aws inspector2 help", "A forma do comando é: aws inspector2 enable --resource-types <o que escanear>"], solucao: ["aws inspector2 enable --resource-types EC2"],
      validar: (c) => !!(c.inspector && c.inspector.ligado) },
    { id: "insp-2", servico: "inspector2", nivel: 2, xp: 90, titulo: "Quais brechas ele achou?",
      descricao: "Liste os <b>findings</b> do Inspector — cada um aponta um CVE e o pacote afetado.",
      dicas: ["Pra ver o que já existe, o verbo costuma ser `list-…` — veja a lista de comandos com: aws inspector2 help"], solucao: ["aws inspector2 list-findings"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "inspector2", "list-findings") },

    // ===================== Macie =====================
    { id: "macie-1", servico: "macie2", nivel: 1, xp: 60, titulo: "Tem dado sensível vazando?",
      descricao: "O <b>Macie</b> vasculha o S3 atrás de dado pessoal/financeiro (CPF, cartão) exposto. <b>Habilite</b> o Macie.",
      dicas: ["`enable-…` liga o serviço na conta — veja a lista de comandos com: aws macie2 help"], solucao: ["aws macie2 enable-macie"],
      validar: (c) => !!(c.macie && c.macie.ligado) },
    { id: "macie-2", servico: "macie2", nivel: 2, xp: 100, titulo: "Mande vasculhar o bucket",
      descricao: "Crie um <b>job de classificação</b> chamado <b>varredura-loja</b> pra escanear seus buckets.",
      dicas: ["Criar recurso no AWS CLI é sempre `create-…` — veja a lista de comandos com: aws macie2 help", "A forma do comando é: aws macie2 create-classification-job --name <nome> --job-type <tipo> --s3-job-definition <json com os buckets>"],
      solucao: [`aws macie2 create-classification-job --name varredura-loja --job-type ONE_TIME --s3-job-definition '{"bucketDefinitions":[{"accountId":"123456789012","buckets":["meu-bucket"]}]}'`],
      validar: (c) => !!(c.macie && Object.values(c.macie.jobs).some((j) => j.nome === "varredura-loja")) },

    // ===================== WAF =====================
    { id: "waf-1", servico: "wafv2", nivel: 1, xp: 60, titulo: "Firewall da aplicação",
      descricao: "O <b>WAF</b> barra SQL injection, XSS e bots no nível HTTP. Crie uma <b>Web ACL</b> chamada <b>protege-loja</b>, escopo <b>REGIONAL</b> (pra load balancer/API).",
      dicas: ["Criar recurso no AWS CLI é sempre `create-…` — veja a lista de comandos com: aws wafv2 help", "A forma do comando é: aws wafv2 create-web-acl --name <nome> --scope <tipo> --default-action <ação padrão> --visibility-config <config de métricas>"],
      solucao: [`aws wafv2 create-web-acl --name protege-loja --scope REGIONAL --default-action Allow={} --visibility-config SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=protege-loja`],
      validar: (c) => !!(c.waf && Object.values(c.waf.acls).some((a) => a.nome === "protege-loja")) },
    { id: "waf-2", servico: "wafv2", nivel: 2, xp: 80, titulo: "Confira o firewall",
      descricao: "Liste as <b>Web ACLs</b> do escopo <b>REGIONAL</b>.",
      dicas: ["Pra ver o que já existe, o verbo costuma ser `list-…` — veja a lista de comandos com: aws wafv2 help", "A forma do comando é: aws wafv2 list-web-acls --scope <tipo>"], solucao: ["aws wafv2 list-web-acls --scope REGIONAL"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "wafv2", "list-web-acls") },

    // ===================== Shield =====================
    { id: "shield-1", servico: "shield", nivel: 1, xp: 60, titulo: "Escudo contra DDoS",
      descricao: "O <b>Shield</b> protege contra ataques de negação de serviço (DDoS). O <b>Standard</b> é grátis e automático. Veja a sua <b>assinatura</b>.",
      dicas: ["`describe-…` é o que mostra os detalhes/estado de um recurso — veja a lista de comandos com: aws shield help"], solucao: ["aws shield describe-subscription"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "shield", "describe-subscription") },

    // ===================== Config =====================
    { id: "cfg-1", servico: "configservice", nivel: 1, xp: 60, titulo: "Câmera de segurança da conta",
      descricao: "O <b>AWS Config</b> grava o histórico de configuração de tudo. Crie o <b>configuration recorder</b>.",
      dicas: ["`put-…` grava/substitui uma configuração (é o \"salvar\" do CLI) — veja a lista de comandos com: aws configservice help", "A forma do comando é: aws configservice put-configuration-recorder --configuration-recorder <name=…,roleARN=…>"],
      solucao: [`aws configservice put-configuration-recorder --configuration-recorder name=default,roleARN=arn:aws:iam::123456789012:role/config-role`],
      validar: (c) => !!(c.config && c.config.recorder) },
    { id: "cfg-2", servico: "configservice", nivel: 2, xp: 80, titulo: "Ligue a gravação",
      descricao: "<b>Inicie</b> o recorder <b>default</b> — a partir daí toda mudança de config fica registrada.",
      dicas: ["`start-…` põe pra rodar algo que já existe — veja a lista de comandos com: aws configservice help", "A forma do comando é: aws configservice start-configuration-recorder --configuration-recorder-name <nome>"],
      solucao: ["aws configservice start-configuration-recorder --configuration-recorder-name default"],
      validar: (c) => !!(c.config && c.config.gravando) },
    { id: "cfg-3", servico: "configservice", nivel: 3, xp: 100, titulo: "Regra de conformidade",
      descricao: "Crie uma <b>config rule</b> gerenciada que exige criptografia nos buckets S3.",
      dicas: ["`put-…` grava/substitui uma configuração (é o \"salvar\" do CLI) — veja a lista de comandos com: aws configservice help", "A forma do comando é: aws configservice put-config-rule --config-rule <json da regra>"],
      solucao: [`aws configservice put-config-rule --config-rule '{"ConfigRuleName":"s3-encriptado","Source":{"Owner":"AWS","SourceIdentifier":"S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED"}}'`],
      validar: (c) => !!(c.config && c.config.regras["s3-encriptado"]) },
  ];

  if (typeof SERVICOS_META !== "undefined" && typeof DESAFIOS !== "undefined") {
    const metas = [
      { id: "guardduty", nome: "GuardDuty", subtitulo: "Detecção de ameaças", icone: "🛡️" },
      { id: "inspector2", nome: "Inspector", subtitulo: "Caça-vulnerabilidades", icone: "🔎" },
      { id: "macie2", nome: "Macie", subtitulo: "Dados sensíveis no S3", icone: "🕵️" },
      { id: "wafv2", nome: "WAF", subtitulo: "Firewall de aplicação", icone: "🧱" },
      { id: "shield", nome: "Shield", subtitulo: "Anti-DDoS", icone: "⛨" },
      { id: "configservice", nome: "Config", subtitulo: "Auditoria de configuração", icone: "🎥" },
    ];
    if (!SERVICOS_META.some((s) => s.id === "guardduty")) {
      for (const m of metas) {
        const iProj = SERVICOS_META.findIndex((s) => s.id === "projetos");
        if (iProj >= 0) SERVICOS_META.splice(iProj, 0, m); else SERVICOS_META.push(m);
      }
      for (const d of DESAFIOS_FASE8) DESAFIOS.push(d);
    }
  }
})();
