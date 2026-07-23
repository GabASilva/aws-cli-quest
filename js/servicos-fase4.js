"use strict";
// ============================================================
// CLImb — servicos-fase4.js
// Fase 4 da expansão: EKS (Kubernetes gerenciado), Glue (catálogo de dados),
// Athena (SQL direto no S3) e KMS (chaves de criptografia).
//
// Glue e Athena andam juntos de propósito: o Glue CATALOGA (banco + tabela
// apontando pra um caminho no S3) e o Athena CONSULTA esse catálogo com SQL.
// A trilha do Athena usa a tabela criada na do Glue — é assim na AWS real.
//
// Mesmo padrão das fases 1/2/3. Usa os globais do simulador.js.
// ============================================================
(function () {
  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";

  function estado(conta) {
    conta.eks = conta.eks || { clusters: {}, nodegroups: {} };
    conta.glue = conta.glue || { bancos: {}, crawlers: {} };
    conta.athena = conta.athena || { execucoes: {} };
    conta.kms = conta.kms || { chaves: {}, aliases: {} };
    return conta;
  }
  function lerJson(valor, flag, padrao) {
    const bruto = String(valor);
    if (bruto.startsWith("file://")) {
      const arq = bruto.slice(7);
      if (!arquivoLocal(arq)) throw new ErroCli(`Error parsing parameter '--${flag}': Unable to load paramfile ${bruto}: arquivo não existe.\nDigite 'ls' pra ver os arquivos do lab.`);
      return padrao;
    }
    try { return JSON.parse(bruto); }
    catch (e) { throw new ErroCli(`Error parsing parameter '--${flag}': Invalid JSON received.`); }
  }

  // ============================================================
  // EKS — Kubernetes gerenciado
  // ============================================================
  function acharClusterEks(conta, flags, operacao, nomeFlag) {
    estado(conta);
    const nome = exigirFlag(flags, nomeFlag || "name");
    const c = conta.eks.clusters[nome];
    if (!c) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the ${operacao} operation: No cluster found for name: ${nome}.`);
    return c;
  }
  const cmdEks = {
    "create-cluster": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "name");
      exigirFlag(flags, "role-arn");
      const vpcCfg = String(exigirFlag(flags, "resources-vpc-config"));
      const subnets = (vpcCfg.match(/subnetIds=([^ ]+)/) || [])[1];
      if (!subnets) {
        throw new ErroCli(`An error occurred (InvalidParameterException) when calling the CreateCluster operation: subnetIds is required.\nEx.: --resources-vpc-config subnetIds=subnet-aaa1,subnet-bbb2`);
      }
      const lista = subnets.split(",").filter(Boolean);
      if (lista.length < 2) {
        throw new ErroCli(`An error occurred (InvalidParameterException) when calling the CreateCluster operation: Subnets specified must be in at least two different AZs.\nO EKS espalha o control plane em 2+ zonas — passe ao menos 2 subnets.`);
      }
      if (conta.eks.clusters[nome]) throw new ErroCli(`An error occurred (ResourceInUseException) when calling the CreateCluster operation: Cluster already exists with name: ${nome}`);
      conta.eks.clusters[nome] = { nome, subnets: lista, versao: "1.31", status: "ACTIVE", criadoEm: agoraIso(), role: String(flags["role-arn"]) };
      avisarClimb("Na AWS real o cluster leva ~10 minutos pra ficar ACTIVE — o control plane do Kubernetes é montado em 2+ zonas.");
      return js({ cluster: {
        name: nome, arn: `arn:aws:eks:${REGIAO(conta)}:${CONTA_ID(conta)}:cluster/${nome}`,
        status: "CREATING", version: "1.31", roleArn: String(flags["role-arn"]),
        endpoint: `https://${hexAleatorio(32).toUpperCase()}.gr7.${REGIAO(conta)}.eks.amazonaws.com`,
        resourcesVpcConfig: { subnetIds: lista },
      } });
    },
    "list-clusters": (conta) => {
      estado(conta);
      const n = Object.keys(conta.eks.clusters);
      if (!n.length) { avisarClimb("Nenhum cluster EKS ainda. Crie um com: aws eks create-cluster --name cluster-k8s ..."); return ""; }
      return js({ clusters: n });
    },
    "describe-cluster": (conta, pos, flags) => {
      const c = acharClusterEks(conta, flags, "DescribeCluster");
      return js({ cluster: {
        name: c.nome, status: c.status, version: c.versao, roleArn: c.role,
        arn: `arn:aws:eks:${REGIAO(conta)}:${CONTA_ID(conta)}:cluster/${c.nome}`,
        resourcesVpcConfig: { subnetIds: c.subnets }, createdAt: c.criadoEm,
      } });
    },
    "update-kubeconfig": (conta, pos, flags) => {
      const c = acharClusterEks(conta, flags, "UpdateKubeconfig");
      avisarClimb("Agora o kubectl fala com o cluster: 'kubectl get nodes' já funcionaria. É este comando que liga a AWS CLI ao Kubernetes.");
      return `Added new context arn:aws:eks:${REGIAO(conta)}:${CONTA_ID(conta)}:cluster/${c.nome} to /home/ec2-user/.kube/config`;
    },
    "create-nodegroup": (conta, pos, flags) => {
      const c = acharClusterEks(conta, flags, "CreateNodegroup", "cluster-name");
      const nome = exigirFlag(flags, "nodegroup-name");
      exigirFlag(flags, "node-role");
      exigirFlag(flags, "subnets");
      const chave = c.nome + "/" + nome;
      if (conta.eks.nodegroups[chave]) throw new ErroCli(`An error occurred (ResourceInUseException) when calling the CreateNodegroup operation: NodeGroup already exists with name ${nome} and cluster name ${c.nome}`);
      conta.eks.nodegroups[chave] = { nome, cluster: c.nome, tipo: flags["instance-types"] || "t3.medium", status: "ACTIVE", criadoEm: agoraIso() };
      avisarClimb("O nodegroup são as MÁQUINAS onde os contêineres rodam. Sem ele, o cluster existe mas não tem onde executar nada.");
      return js({ nodegroup: { nodegroupName: nome, clusterName: c.nome, status: "CREATING", instanceTypes: [String(flags["instance-types"] || "t3.medium")] } });
    },
    "list-nodegroups": (conta, pos, flags) => {
      const c = acharClusterEks(conta, flags, "ListNodegroups", "cluster-name");
      return js({ nodegroups: Object.values(conta.eks.nodegroups).filter((n) => n.cluster === c.nome).map((n) => n.nome) });
    },
    "delete-nodegroup": (conta, pos, flags) => {
      const c = acharClusterEks(conta, flags, "DeleteNodegroup", "cluster-name");
      const nome = exigirFlag(flags, "nodegroup-name");
      const chave = c.nome + "/" + nome;
      if (!conta.eks.nodegroups[chave]) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the DeleteNodegroup operation: No node group found for name: ${nome}.`);
      delete conta.eks.nodegroups[chave];
      return okSilencioso(`Nodegroup "${nome}" apagado.`);
    },
    "delete-cluster": (conta, pos, flags) => {
      const c = acharClusterEks(conta, flags, "DeleteCluster");
      if (Object.values(conta.eks.nodegroups).some((n) => n.cluster === c.nome)) {
        throw new ErroCli(`An error occurred (ResourceInUseException) when calling the DeleteCluster operation: Cluster has nodegroups attached\nApague os nodegroups antes: aws eks delete-nodegroup --cluster-name ${c.nome} --nodegroup-name <nome>`);
      }
      delete conta.eks.clusters[c.nome];
      return okSilencioso(`Cluster EKS "${c.nome}" apagado.`);
    },
  };

  // ============================================================
  // Glue — catálogo de dados
  // ============================================================
  const TABELA_PADRAO = {
    Name: "vendas",
    StorageDescriptor: {
      Columns: [
        { Name: "id", Type: "int" },
        { Name: "produto", Type: "string" },
        { Name: "valor", Type: "double" },
      ],
      Location: "s3://dados-loja-climb/vendas/",
    },
  };
  // Linhas fictícias que o Athena "lê" do S3 quando consulta a tabela.
  const DADOS_VENDAS = [
    ["1", "teclado", "199.90"],
    ["2", "monitor", "899.00"],
    ["3", "mouse", "89.90"],
  ];
  function acharBanco(conta, flags, operacao, nomeFlag) {
    estado(conta);
    const nome = exigirFlag(flags, nomeFlag || "name");
    const b = conta.glue.bancos[nome];
    if (!b) throw new ErroCli(`An error occurred (EntityNotFoundException) when calling the ${operacao} operation: Database ${nome} not found.`);
    return b;
  }
  const cmdGlue = {
    "create-database": (conta, pos, flags) => {
      estado(conta);
      const entrada = lerJson(exigirFlag(flags, "database-input"), "database-input", { Name: "dados_loja" });
      const nome = entrada.Name;
      if (!nome) throw new ErroCli(`An error occurred (InvalidInputException) when calling the CreateDatabase operation: DatabaseInput precisa de "Name".`);
      if (conta.glue.bancos[nome]) throw new ErroCli(`An error occurred (AlreadyExistsException) when calling the CreateDatabase operation: Database already exists.`);
      conta.glue.bancos[nome] = { nome, descricao: entrada.Description || "", tabelas: {}, criadoEm: agoraIso() };
      return okSilencioso(`Banco de dados "${nome}" criado no catálogo.`);
    },
    "get-databases": (conta) => {
      estado(conta);
      const b = Object.values(conta.glue.bancos);
      if (!b.length) { avisarClimb(`Nenhum banco no catálogo. Crie um com: aws glue create-database --database-input '{"Name":"dados_loja"}'`); return ""; }
      return js({ DatabaseList: b.map((x) => ({ Name: x.nome, Description: x.descricao, CreateTime: x.criadoEm })) });
    },
    "create-table": (conta, pos, flags) => {
      const b = acharBanco(conta, flags, "CreateTable", "database-name");
      const entrada = lerJson(exigirFlag(flags, "table-input"), "table-input", TABELA_PADRAO);
      const nome = entrada.Name;
      if (!nome) throw new ErroCli(`An error occurred (InvalidInputException) when calling the CreateTable operation: TableInput precisa de "Name".`);
      if (b.tabelas[nome]) throw new ErroCli(`An error occurred (AlreadyExistsException) when calling the CreateTable operation: Table already exists.`);
      const sd = entrada.StorageDescriptor || {};
      b.tabelas[nome] = { nome, colunas: sd.Columns || [], local: sd.Location || "", criadoEm: agoraIso() };
      avisarClimb("A tabela do Glue é só METADADO: ela diz onde os arquivos estão no S3 e qual o formato. O dado continua no S3 — nada foi copiado.");
      return okSilencioso(`Tabela "${nome}" criada no banco "${b.nome}".`);
    },
    "get-tables": (conta, pos, flags) => {
      const b = acharBanco(conta, flags, "GetTables", "database-name");
      return js({ TableList: Object.values(b.tabelas).map((t) => ({
        Name: t.nome, DatabaseName: b.nome, CreateTime: t.criadoEm,
        StorageDescriptor: { Columns: t.colunas, Location: t.local },
      })) });
    },
    "create-crawler": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "name");
      exigirFlag(flags, "role");
      const banco = exigirFlag(flags, "database-name");
      exigirFlag(flags, "targets");
      if (conta.glue.crawlers[nome]) throw new ErroCli(`An error occurred (AlreadyExistsException) when calling the CreateCrawler operation: Crawler already exists.`);
      conta.glue.crawlers[nome] = { nome, banco: String(banco), estado: "READY", execucoes: 0, criadoEm: agoraIso() };
      avisarClimb("O crawler é o robô que VARRE o S3 e descobre sozinho as colunas e os tipos — evita você escrever a tabela na mão.");
      return okSilencioso(`Crawler "${nome}" criado.`);
    },
    "start-crawler": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "name");
      const c = conta.glue.crawlers[nome];
      if (!c) throw new ErroCli(`An error occurred (EntityNotFoundException) when calling the StartCrawler operation: Crawler with name ${nome} may not exist.`);
      c.estado = "RUNNING";
      c.execucoes++;
      return okSilencioso(`Crawler "${nome}" iniciado (vai varrer o S3 e atualizar o catálogo).`);
    },
    "get-crawler": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "name");
      const c = conta.glue.crawlers[nome];
      if (!c) throw new ErroCli(`An error occurred (EntityNotFoundException) when calling the GetCrawler operation: Crawler with name ${nome} may not exist.`);
      return js({ Crawler: { Name: c.nome, DatabaseName: c.banco, State: c.estado, CreationTime: c.criadoEm } });
    },
    "delete-database": (conta, pos, flags) => {
      const b = acharBanco(conta, flags, "DeleteDatabase");
      delete conta.glue.bancos[b.nome];
      return okSilencioso(`Banco "${b.nome}" apagado do catálogo (os arquivos no S3 continuam lá).`);
    },
  };

  // ============================================================
  // Athena — SQL direto no S3
  // ============================================================
  const cmdAthena = {
    "start-query-execution": (conta, pos, flags) => {
      estado(conta);
      const sql = String(exigirFlag(flags, "query-string"));
      const saida = String(exigirFlag(flags, "result-configuration"));
      const bucket = (saida.match(/OutputLocation=s3:\/\/([^\/, ]+)/) || [])[1];
      if (!bucket) throw new ErroCli(`An error occurred (InvalidRequestException) when calling the StartQueryExecution operation: No output location provided.\nEx.: --result-configuration OutputLocation=s3://resultados-athena-climb/`);
      if (!conta.s3.buckets[bucket]) throw new ErroCli(`An error occurred (InvalidRequestException) when calling the StartQueryExecution operation: Unable to verify/create output bucket ${bucket}\nCrie antes: aws s3 mb s3://${bucket}`);
      // resolve "banco.tabela" no catálogo do Glue
      const alvo = (sql.match(/from\s+([\w.]+)/i) || [])[1] || "";
      const [nomeBanco, nomeTabela] = alvo.includes(".") ? alvo.split(".") : [flags.database || "", alvo];
      const banco = (conta.glue.bancos || {})[nomeBanco];
      const tabela = banco && banco.tabelas[nomeTabela];
      const id = hexAleatorio(8) + "-" + hexAleatorio(4) + "-" + hexAleatorio(12);
      conta.athena.execucoes[id] = {
        id, sql, bucket, estado: tabela ? "SUCCEEDED" : "FAILED",
        erro: tabela ? null : `Table not found: ${alvo || "(sem FROM)"} — crie no Glue antes (aws glue create-table ...).`,
        colunas: tabela ? tabela.colunas.map((c) => c.Name) : [],
        linhas: tabela ? DADOS_VENDAS : [], criadoEm: agoraIso(),
      };
      if (!tabela) avisarClimb("A consulta foi aceita mas vai FALHAR: o Athena lê o catálogo do Glue, e essa tabela não existe lá. Veja com 'aws athena get-query-execution'.");
      return js({ QueryExecutionId: id });
    },
    "get-query-execution": (conta, pos, flags) => {
      estado(conta);
      const id = exigirFlag(flags, "query-execution-id");
      const e = conta.athena.execucoes[id];
      if (!e) throw new ErroCli(`An error occurred (InvalidRequestException) when calling the GetQueryExecution operation: QueryExecution ${id} was not found`);
      return js({ QueryExecution: {
        QueryExecutionId: e.id, Query: e.sql,
        ResultConfiguration: { OutputLocation: `s3://${e.bucket}/${e.id}.csv` },
        Status: { State: e.estado, StateChangeReason: e.erro || undefined, SubmissionDateTime: e.criadoEm },
        Statistics: { DataScannedInBytes: e.estado === "SUCCEEDED" ? 1024 : 0 },
      } });
    },
    "get-query-results": (conta, pos, flags) => {
      estado(conta);
      const id = exigirFlag(flags, "query-execution-id");
      const e = conta.athena.execucoes[id];
      if (!e) throw new ErroCli(`An error occurred (InvalidRequestException) when calling the GetQueryResults operation: QueryExecution ${id} was not found`);
      if (e.estado !== "SUCCEEDED") throw new ErroCli(`An error occurred (InvalidRequestException) when calling the GetQueryResults operation: Query did not finish successfully. Final query state: ${e.estado}\n${e.erro || ""}`);
      const linhas = [{ Data: e.colunas.map((c) => ({ VarCharValue: c })) }]
        .concat(e.linhas.map((l) => ({ Data: l.map((v) => ({ VarCharValue: v })) })));
      return js({ ResultSet: { Rows: linhas, ResultSetMetadata: { ColumnInfo: e.colunas.map((c) => ({ Name: c, Type: "varchar" })) } } });
    },
    "list-query-executions": (conta) => {
      estado(conta);
      return js({ QueryExecutionIds: Object.keys(conta.athena.execucoes) });
    },
  };

  // ============================================================
  // KMS — chaves de criptografia
  // ============================================================
  function acharChave(conta, flags, operacao) {
    estado(conta);
    let id = String(exigirFlag(flags, "key-id"));
    if (id.startsWith("alias/")) {
      const alvo = conta.kms.aliases[id];
      if (!alvo) throw new ErroCli(`An error occurred (NotFoundException) when calling the ${operacao} operation: Alias ${id} is not found.`);
      id = alvo;
    }
    id = id.replace(/^arn:aws:kms:[^:]+:\d+:key\//, "");
    const k = conta.kms.chaves[id];
    if (!k) throw new ErroCli(`An error occurred (NotFoundException) when calling the ${operacao} operation: Key '${id}' does not exist\nDica: veja as chaves com 'aws kms list-keys' ou use o alias (alias/nome).`);
    return k;
  }
  function b64(s) {
    try { return typeof btoa === "function" ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, "utf8").toString("base64"); }
    catch (e) { return String(s); }
  }
  function deB64(s) {
    try { return typeof atob === "function" ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, "base64").toString("utf8"); }
    catch (e) { return null; }
  }
  const cmdKms = {
    "create-key": (conta, pos, flags) => {
      estado(conta);
      const id = [8, 4, 4, 4, 12].map((n) => hexAleatorio(n)).join("-");
      conta.kms.chaves[id] = {
        id, descricao: flags.description ? String(flags.description) : "",
        estado: "Enabled", rotacao: false, apagandoEm: null, criadoEm: agoraIso(),
      };
      return js({ KeyMetadata: {
        KeyId: id, Arn: `arn:aws:kms:${REGIAO(conta)}:${CONTA_ID(conta)}:key/${id}`,
        Description: conta.kms.chaves[id].descricao, Enabled: true,
        KeyState: "Enabled", KeyUsage: "ENCRYPT_DECRYPT", Origin: "AWS_KMS", CreationDate: agoraIso(),
      } });
    },
    "list-keys": (conta) => {
      estado(conta);
      const k = Object.values(conta.kms.chaves);
      if (!k.length) { avisarClimb("Nenhuma chave ainda. Crie uma com: aws kms create-key --description \"chave da loja\""); return ""; }
      return js({ Keys: k.map((x) => ({ KeyId: x.id, KeyArn: `arn:aws:kms:${REGIAO(conta)}:${CONTA_ID(conta)}:key/${x.id}` })) });
    },
    "describe-key": (conta, pos, flags) => {
      const k = acharChave(conta, flags, "DescribeKey");
      return js({ KeyMetadata: {
        KeyId: k.id, Arn: `arn:aws:kms:${REGIAO(conta)}:${CONTA_ID(conta)}:key/${k.id}`,
        Description: k.descricao, Enabled: k.estado === "Enabled", KeyState: k.estado,
        KeyUsage: "ENCRYPT_DECRYPT", DeletionDate: k.apagandoEm || undefined,
      } });
    },
    "create-alias": (conta, pos, flags) => {
      estado(conta);
      const alias = String(exigirFlag(flags, "alias-name"));
      const alvo = String(exigirFlag(flags, "target-key-id"));
      if (!alias.startsWith("alias/")) throw new ErroCli(`An error occurred (InvalidAliasNameException) when calling the CreateAlias operation: Alias must start with "alias/". Ex.: alias/chave-loja`);
      if (!conta.kms.chaves[alvo.replace(/^arn:aws:kms:[^:]+:\d+:key\//, "")]) {
        throw new ErroCli(`An error occurred (NotFoundException) when calling the CreateAlias operation: Key '${alvo}' does not exist`);
      }
      if (conta.kms.aliases[alias]) throw new ErroCli(`An error occurred (AlreadyExistsException) when calling the CreateAlias operation: An alias with the name ${alias} already exists`);
      conta.kms.aliases[alias] = alvo.replace(/^arn:aws:kms:[^:]+:\d+:key\//, "");
      avisarClimb("Com o alias você usa 'alias/chave-loja' no lugar daquele id enorme — e pode trocar a chave por trás sem mexer na aplicação.");
      return okSilencioso(`Alias "${alias}" criado.`);
    },
    "list-aliases": (conta) => {
      estado(conta);
      return js({ Aliases: Object.entries(conta.kms.aliases).map(([a, id]) => ({
        AliasName: a, TargetKeyId: id, AliasArn: `arn:aws:kms:${REGIAO(conta)}:${CONTA_ID(conta)}:${a}`,
      })) });
    },
    encrypt: (conta, pos, flags) => {
      const k = acharChave(conta, flags, "Encrypt");
      if (k.estado !== "Enabled") throw new ErroCli(`An error occurred (DisabledException) when calling the Encrypt operation: ${k.id} is disabled.`);
      const texto = String(exigirFlag(flags, "plaintext"));
      // "cifra" didática: marca a chave + base64 (o CLImb não faz cripto real)
      const blob = b64("CLIMB:" + k.id + ":" + texto);
      // rascunho do simulador: guarda o último blob (a AWS não guarda nada disso).
      // Serve pros testes resolverem o placeholder <blob> das soluções.
      conta.kms.ultimoBlob = blob;
      avisarClimb("Guarde o CiphertextBlob: é ele que você salva. Sem a chave do KMS (e permissão de IAM), ninguém volta pro texto original.");
      return js({ CiphertextBlob: blob, KeyId: `arn:aws:kms:${REGIAO(conta)}:${CONTA_ID(conta)}:key/${k.id}`, EncryptionAlgorithm: "SYMMETRIC_DEFAULT" });
    },
    decrypt: (conta, pos, flags) => {
      estado(conta);
      const blob = String(exigirFlag(flags, "ciphertext-blob"));
      const aberto = deB64(blob);
      if (!aberto || !aberto.startsWith("CLIMB:")) {
        throw new ErroCli(`An error occurred (InvalidCiphertextException) when calling the Decrypt operation: \nDica: passe exatamente o CiphertextBlob que o encrypt devolveu.`);
      }
      const [, id, ...resto] = aberto.split(":");
      const k = conta.kms.chaves[id];
      if (!k) throw new ErroCli(`An error occurred (NotFoundException) when calling the Decrypt operation: Key '${id}' does not exist (a chave que cifrou foi apagada?)`);
      if (k.estado !== "Enabled") throw new ErroCli(`An error occurred (DisabledException) when calling the Decrypt operation: ${id} is disabled.`);
      return js({ KeyId: `arn:aws:kms:${REGIAO(conta)}:${CONTA_ID(conta)}:key/${id}`, Plaintext: resto.join(":"), EncryptionAlgorithm: "SYMMETRIC_DEFAULT" });
    },
    "enable-key-rotation": (conta, pos, flags) => {
      const k = acharChave(conta, flags, "EnableKeyRotation");
      k.rotacao = true;
      avisarClimb("Com a rotação ligada, a AWS troca o material da chave todo ano sozinha — e o que foi cifrado antes continua abrindo.");
      return okSilencioso(`Rotação automática ligada na chave ${k.id}.`);
    },
    "get-key-rotation-status": (conta, pos, flags) => {
      const k = acharChave(conta, flags, "GetKeyRotationStatus");
      return js({ KeyRotationEnabled: !!k.rotacao });
    },
    "disable-key": (conta, pos, flags) => {
      const k = acharChave(conta, flags, "DisableKey");
      k.estado = "Disabled";
      return okSilencioso(`Chave ${k.id} desabilitada (ninguém cifra nem decifra com ela até habilitar de novo).`);
    },
    "enable-key": (conta, pos, flags) => {
      const k = acharChave(conta, flags, "EnableKey");
      k.estado = "Enabled";
      return okSilencioso(`Chave ${k.id} habilitada.`);
    },
    "schedule-key-deletion": (conta, pos, flags) => {
      const k = acharChave(conta, flags, "ScheduleKeyDeletion");
      const dias = parseInt(flags["pending-window-in-days"] || "30", 10);
      if (dias < 7 || dias > 30) throw new ErroCli(`An error occurred (ValidationException) when calling the ScheduleKeyDeletion operation: PendingWindowInDays must be between 7 and 30.`);
      k.estado = "PendingDeletion";
      k.apagandoEm = new Date(Date.now() + dias * 86400000).toISOString();
      avisarClimb(`Apagar chave é IRREVERSÍVEL: o que foi cifrado com ela vira lixo pra sempre. Por isso a AWS obriga esperar ${dias} dias — dá pra cancelar com cancel-key-deletion.`);
      return js({ KeyId: `arn:aws:kms:${REGIAO(conta)}:${CONTA_ID(conta)}:key/${k.id}`, DeletionDate: k.apagandoEm });
    },
    "cancel-key-deletion": (conta, pos, flags) => {
      const k = acharChave(conta, flags, "CancelKeyDeletion");
      if (!k.apagandoEm) throw new ErroCli(`An error occurred (KMSInvalidStateException) when calling the CancelKeyDeletion operation: ${k.id} is not pending deletion.`);
      k.apagandoEm = null;
      k.estado = "Disabled";
      avisarClimb("Exclusão cancelada — repare que a chave volta DESABILITADA. Ligue de novo com 'aws kms enable-key'.");
      return js({ KeyId: `arn:aws:kms:${REGIAO(conta)}:${CONTA_ID(conta)}:key/${k.id}` });
    },
  };

  // ---------- Registro no motor ----------
  if (typeof SERVICOS !== "undefined") {
    SERVICOS.eks = cmdEks;
    SERVICOS.glue = cmdGlue;
    SERVICOS.athena = cmdAthena;
    SERVICOS.kms = cmdKms;
  }
  if (typeof ARQUIVOS_LOCAIS !== "undefined" && !ARQUIVOS_LOCAIS["tabela-vendas.json"]) {
    ARQUIVOS_LOCAIS["tabela-vendas.json"] = 296;
  }
  if (typeof window !== "undefined") {
    window.ARQUIVOS_CONTEUDO = window.ARQUIVOS_CONTEUDO || {};
    window.ARQUIVOS_CONTEUDO["tabela-vendas.json"] = JSON.stringify(TABELA_PADRAO, null, 2) + "\n";
  }

  // ============================================================
  // Trilhas
  // ============================================================
  const DESAFIOS_FASE4 = [
    // ===================== EKS =====================
    { id: "eks-1", servico: "eks", nivel: 1, xp: 50, titulo: "Kubernetes gerenciado",
      descricao: "O <b>EKS</b> roda Kubernetes sem você cuidar do control plane. Comece <b>listando</b> os clusters da conta.",
      dicas: ["aws eks list-clusters"], solucao: ["aws eks list-clusters"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "eks", "list-clusters") },
    { id: "eks-2", servico: "eks", nivel: 2, xp: 100, titulo: "Suba o cluster",
      descricao: "Crie o cluster <b>cluster-k8s</b>. O EKS exige uma role e <b>pelo menos 2 sub-redes</b> (o control plane fica espalhado em 2 zonas).",
      dicas: ["aws eks create-cluster --name cluster-k8s --role-arn arn:aws:iam::123456789012:role/papel-eks --resources-vpc-config subnetIds=subnet-aaa1,subnet-bbb2"],
      solucao: ["aws eks create-cluster --name cluster-k8s --role-arn arn:aws:iam::123456789012:role/papel-eks --resources-vpc-config subnetIds=subnet-aaa1,subnet-bbb2"],
      validar: (c) => !!(c.eks && c.eks.clusters["cluster-k8s"]) },
    { id: "eks-3", servico: "eks", nivel: 2, xp: 70, titulo: "Detalhes do cluster",
      descricao: "Veja os detalhes do <b>cluster-k8s</b> (versão do Kubernetes, endpoint e sub-redes).",
      dicas: ["aws eks describe-cluster --name cluster-k8s"],
      solucao: ["aws eks describe-cluster --name cluster-k8s"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "eks", "describe-cluster") },
    { id: "eks-4", servico: "eks", nivel: 2, xp: 90, titulo: "Conecte o kubectl",
      descricao: "Cluster no ar não serve de nada se o <b>kubectl</b> não fala com ele. Atualize o kubeconfig do <b>cluster-k8s</b>.",
      dicas: ["aws eks update-kubeconfig --name cluster-k8s"],
      solucao: ["aws eks update-kubeconfig --name cluster-k8s"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "eks", "update-kubeconfig") },
    { id: "eks-5", servico: "eks", nivel: 3, xp: 100, titulo: "Onde os pods vão rodar",
      descricao: "Crie o <b>nodegroup</b> <b>nos-app</b> no cluster (são as máquinas que executam os contêineres).",
      dicas: ["aws eks create-nodegroup --cluster-name cluster-k8s --nodegroup-name nos-app --node-role arn:aws:iam::123456789012:role/papel-nos --subnets subnet-aaa1 subnet-bbb2"],
      solucao: ["aws eks create-nodegroup --cluster-name cluster-k8s --nodegroup-name nos-app --node-role arn:aws:iam::123456789012:role/papel-nos --subnets subnet-aaa1 subnet-bbb2"],
      validar: (c) => !!(c.eks && c.eks.nodegroups["cluster-k8s/nos-app"]) },
    { id: "eks-6", servico: "eks", nivel: 3, xp: 70, titulo: "Confira os nós",
      descricao: "Liste os <b>nodegroups</b> do cluster-k8s.",
      dicas: ["aws eks list-nodegroups --cluster-name cluster-k8s"],
      solucao: ["aws eks list-nodegroups --cluster-name cluster-k8s"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "eks", "list-nodegroups") },
    { id: "eks-7", servico: "eks", nivel: 3, xp: 90, titulo: "Desmonte na ordem certa",
      descricao: "Apague o <b>nodegroup</b> e só depois o <b>cluster</b>. <small>(a AWS recusa apagar cluster que ainda tem nós)</small>",
      dicas: ["Primeiro: aws eks delete-nodegroup --cluster-name cluster-k8s --nodegroup-name nos-app",
        "Depois: aws eks delete-cluster --name cluster-k8s"],
      solucao: ["aws eks delete-nodegroup --cluster-name cluster-k8s --nodegroup-name nos-app",
        "aws eks delete-cluster --name cluster-k8s"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "eks", "delete-cluster") && !(c.eks && c.eks.clusters["cluster-k8s"]) },

    // ===================== Glue =====================
    { id: "glue-1", servico: "glue", nivel: 1, xp: 50, titulo: "O catálogo de dados",
      descricao: "O <b>Glue</b> guarda o <i>mapa</i> dos seus dados: quais tabelas existem e onde os arquivos estão no S3. Liste os <b>bancos</b> do catálogo.",
      dicas: ["aws glue get-databases"], solucao: ["aws glue get-databases"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "glue", "get-databases") },
    { id: "glue-2", servico: "glue", nivel: 2, xp: 80, titulo: "Crie o banco do catálogo",
      descricao: "Crie o banco <b>dados_loja</b>. O parâmetro é um JSON: <b>--database-input '{\"Name\":\"dados_loja\"}'</b>.",
      dicas: [`aws glue create-database --database-input '{"Name":"dados_loja"}'`],
      solucao: [`aws glue create-database --database-input '{"Name":"dados_loja"}'`],
      validar: (c) => !!(c.glue && c.glue.bancos["dados_loja"]) },
    { id: "glue-3", servico: "glue", nivel: 2, xp: 90, titulo: "Descreva a tabela de vendas",
      descricao: "Crie a tabela <b>vendas</b> no banco, usando o arquivo pronto <b>file://tabela-vendas.json</b> (colunas + caminho no S3). <small>(espie com <code>cat tabela-vendas.json</code>)</small>",
      dicas: ["aws glue create-table --database-name dados_loja --table-input file://tabela-vendas.json"],
      solucao: ["aws glue create-table --database-name dados_loja --table-input file://tabela-vendas.json"],
      validar: (c) => { const b = c.glue && c.glue.bancos["dados_loja"]; return !!b && !!b.tabelas["vendas"]; } },
    { id: "glue-4", servico: "glue", nivel: 2, xp: 60, titulo: "Confira o catálogo",
      descricao: "Liste as <b>tabelas</b> do banco <b>dados_loja</b>.",
      dicas: ["aws glue get-tables --database-name dados_loja"],
      solucao: ["aws glue get-tables --database-name dados_loja"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "glue", "get-tables") },
    { id: "glue-5", servico: "glue", nivel: 3, xp: 100, titulo: "O robô que descobre sozinho",
      descricao: "Em vez de escrever a tabela na mão, o <b>crawler</b> varre o S3 e descobre as colunas. Crie o crawler <b>crawler-vendas</b> apontando pro banco.",
      dicas: [`aws glue create-crawler --name crawler-vendas --role arn:aws:iam::123456789012:role/papel-glue --database-name dados_loja --targets '{"S3Targets":[{"Path":"s3://dados-loja-climb/vendas/"}]}'`],
      solucao: [`aws glue create-crawler --name crawler-vendas --role arn:aws:iam::123456789012:role/papel-glue --database-name dados_loja --targets '{"S3Targets":[{"Path":"s3://dados-loja-climb/vendas/"}]}'`],
      validar: (c) => !!(c.glue && c.glue.crawlers["crawler-vendas"]) },
    { id: "glue-6", servico: "glue", nivel: 3, xp: 80, titulo: "Solte o robô",
      descricao: "<b>Inicie</b> o crawler <b>crawler-vendas</b>.",
      dicas: ["aws glue start-crawler --name crawler-vendas"],
      solucao: ["aws glue start-crawler --name crawler-vendas"],
      validar: (c) => { const cr = c.glue && c.glue.crawlers["crawler-vendas"]; return !!cr && cr.execucoes > 0; } },

    // ===================== Athena =====================
    { id: "ath-1", servico: "athena", nivel: 1, xp: 60, titulo: "Onde os resultados caem",
      descricao: "O <b>Athena</b> roda SQL direto nos arquivos do S3 — e grava o resultado em outro bucket. Crie o bucket <b>resultados-athena-climb</b>.",
      dicas: ["aws s3 mb s3://resultados-athena-climb"],
      solucao: ["aws s3 mb s3://resultados-athena-climb"],
      validar: (c) => !!c.s3.buckets["resultados-athena-climb"] },
    { id: "ath-2", servico: "athena", nivel: 2, xp: 100, titulo: "Sua primeira consulta",
      descricao: "Rode <b>SELECT * FROM dados_loja.vendas</b> no Athena, mandando o resultado pro bucket que você criou. <small>(a tabela vem do catálogo do Glue — faça a trilha do Glue antes)</small>",
      dicas: [`aws athena start-query-execution --query-string "SELECT * FROM dados_loja.vendas" --result-configuration OutputLocation=s3://resultados-athena-climb/`],
      solucao: [`aws athena start-query-execution --query-string "SELECT * FROM dados_loja.vendas" --result-configuration OutputLocation=s3://resultados-athena-climb/`],
      validar: (c) => !!(c.athena && Object.values(c.athena.execucoes).some((e) => /vendas/i.test(e.sql))) },
    { id: "ath-3", servico: "athena", nivel: 2, xp: 70, titulo: "A consulta terminou?",
      descricao: "Consultar é assíncrono: você recebe um <b>QueryExecutionId</b> e depois pergunta o status. Veja a <b>execução</b>.",
      dicas: ["aws athena get-query-execution --query-execution-id <query-id>"],
      solucao: ["aws athena get-query-execution --query-execution-id <query-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "athena", "get-query-execution") },
    { id: "ath-4", servico: "athena", nivel: 3, xp: 100, titulo: "Traga as linhas",
      descricao: "Agora pegue o <b>resultado</b> da consulta (a primeira linha é o cabeçalho com os nomes das colunas).",
      dicas: ["aws athena get-query-results --query-execution-id <query-id>"],
      solucao: ["aws athena get-query-results --query-execution-id <query-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "athena", "get-query-results") },
    { id: "ath-5", servico: "athena", nivel: 3, xp: 80, titulo: "Histórico de consultas",
      descricao: "Liste as <b>execuções</b> de consulta da conta.",
      dicas: ["aws athena list-query-executions"], solucao: ["aws athena list-query-executions"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "athena", "list-query-executions") },

    // ===================== KMS =====================
    { id: "kms-1", servico: "kms", nivel: 1, xp: 50, titulo: "As chaves da conta",
      descricao: "O <b>KMS</b> guarda as chaves que cifram seus dados — e o segredo é que a chave <b>nunca sai de lá</b>. Liste as chaves.",
      dicas: ["aws kms list-keys"], solucao: ["aws kms list-keys"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "kms", "list-keys") },
    { id: "kms-2", servico: "kms", nivel: 1, xp: 70, titulo: "Crie sua chave",
      descricao: "Crie uma chave com a descrição <b>chave da loja</b>. Anote o <b>KeyId</b> que volta.",
      dicas: [`aws kms create-key --description "chave da loja"`],
      solucao: [`aws kms create-key --description "chave da loja"`],
      validar: (c) => !!(c.kms && Object.values(c.kms.chaves).some((k) => /chave da loja/.test(k.descricao))) },
    { id: "kms-3", servico: "kms", nivel: 2, xp: 80, titulo: "Dê um apelido pra chave",
      descricao: "Ninguém decora aquele id enorme. Crie o alias <b>alias/chave-loja</b> apontando pra sua chave.",
      dicas: ["aws kms create-alias --alias-name alias/chave-loja --target-key-id <key-id>"],
      solucao: ["aws kms create-alias --alias-name alias/chave-loja --target-key-id <key-id>"],
      validar: (c) => !!(c.kms && c.kms.aliases["alias/chave-loja"]) },
    { id: "kms-4", servico: "kms", nivel: 2, xp: 90, titulo: "Cifre um segredo",
      descricao: "Use o <b>alias</b> pra cifrar o texto <b>cartao-1234</b>. Guarde o <b>CiphertextBlob</b> da resposta.",
      dicas: ["aws kms encrypt --key-id alias/chave-loja --plaintext cartao-1234"],
      solucao: ["aws kms encrypt --key-id alias/chave-loja --plaintext cartao-1234"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "kms", "encrypt") && /alias\/chave-loja/.test(String(cmd.flags["key-id"] || "")) },
    { id: "kms-5", servico: "kms", nivel: 3, xp: 100, titulo: "Volte ao texto original",
      descricao: "<b>Decifre</b> o blob que você recebeu. Repare: no <code>decrypt</code> você <b>não informa a chave</b> — ela vem identificada dentro do próprio blob.",
      dicas: ["aws kms decrypt --ciphertext-blob <blob>"],
      solucao: ["aws kms decrypt --ciphertext-blob <blob>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "kms", "decrypt") },
    { id: "kms-6", servico: "kms", nivel: 3, xp: 80, titulo: "Rotação automática",
      descricao: "Ligue a <b>rotação anual</b> da chave (a AWS troca o material sozinha e o que já foi cifrado continua abrindo).",
      dicas: ["aws kms enable-key-rotation --key-id alias/chave-loja"],
      solucao: ["aws kms enable-key-rotation --key-id alias/chave-loja"],
      validar: (c) => !!(c.kms && Object.values(c.kms.chaves).some((k) => k.rotacao)) },
    { id: "kms-7", servico: "kms", nivel: 3, xp: 90, titulo: "Agende a destruição",
      descricao: "Apagar chave é <b>irreversível</b> — o que foi cifrado com ela vira lixo pra sempre. Agende a exclusão com a janela mínima: <b>7</b> dias.",
      dicas: ["aws kms schedule-key-deletion --key-id alias/chave-loja --pending-window-in-days 7"],
      solucao: ["aws kms schedule-key-deletion --key-id alias/chave-loja --pending-window-in-days 7"],
      validar: (c) => !!(c.kms && Object.values(c.kms.chaves).some((k) => k.estado === "PendingDeletion")) },
    { id: "kms-8", servico: "kms", nivel: 3, xp: 90, titulo: "Cancele antes que seja tarde",
      descricao: "Ainda tem dado cifrado com ela! <b>Cancele</b> a exclusão e <b>habilite</b> a chave de novo (ela volta desabilitada).",
      dicas: ["Primeiro: aws kms cancel-key-deletion --key-id alias/chave-loja",
        "Depois: aws kms enable-key --key-id alias/chave-loja"],
      solucao: ["aws kms cancel-key-deletion --key-id alias/chave-loja",
        "aws kms enable-key --key-id alias/chave-loja"],
      validar: (c) => !!(c.kms && Object.values(c.kms.chaves).some((k) => !k.apagandoEm && k.estado === "Enabled" && k.rotacao)) },
  ];

  // ---------- Registro das trilhas ----------
  if (typeof SERVICOS_META !== "undefined" && typeof DESAFIOS !== "undefined") {
    const metas = [
      { id: "eks", nome: "EKS", subtitulo: "Kubernetes gerenciado", icone: "☸️" },
      { id: "glue", nome: "Glue", subtitulo: "Catálogo de dados", icone: "🧬" },
      { id: "athena", nome: "Athena", subtitulo: "SQL direto no S3", icone: "🔎" },
      { id: "kms", nome: "KMS", subtitulo: "Chaves e criptografia", icone: "🗝️" },
    ];
    if (!SERVICOS_META.some((s) => s.id === "eks")) {
      for (const m of metas) {
        const iProj = SERVICOS_META.findIndex((s) => s.id === "projetos");
        if (iProj >= 0) SERVICOS_META.splice(iProj, 0, m); else SERVICOS_META.push(m);
      }
      for (const d of DESAFIOS_FASE4) DESAFIOS.push(d);
    }
  }
})();
