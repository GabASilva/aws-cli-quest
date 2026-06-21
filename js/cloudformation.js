"use strict";
// ============================================================
// CLImb — cloudformation.js
// Infraestrutura como Código: o serviço `aws cloudformation`.
// Você descreve recursos num template (YAML ou JSON) e o create-stack
// PROVISIONA esses recursos DE VERDADE na conta virtual — então um bucket
// declarado no template aparece no `aws s3 ls`, uma tabela no `aws dynamodb
// list-tables`, etc. delete-stack remove tudo de volta.
//
// ADITIVO: registra o serviço em SERVICOS, empurra a trilha em DESAFIOS/
// SERVICOS_META e semeia templates em ARQUIVOS_LOCAIS. Usa os globais do
// simulador.js (ErroCli, js, agoraIso, dataFormatada, hexAleatorio, exigirFlag,
// okSilencioso). Não toca o core.
// ============================================================
(function () {
  // ---------- Parser YAML-lite (subset de CloudFormation) + fallback JSON ----------
  function desaspas(s) {
    s = String(s).trim();
    if ((s[0] === '"' && s.slice(-1) === '"') || (s[0] === "'" && s.slice(-1) === "'")) return s.slice(1, -1);
    return s;
  }

  function parseYaml(texto) {
    const linhas = String(texto).split(/\r?\n/)
      .map((l) => l.replace(/\t/g, "  "))
      .filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
    let i = 0;
    const ind = (l) => l.length - l.replace(/^ +/, "").length;

    function parse(curInd) {
      if (i >= linhas.length) return null;
      if (linhas[i].trim().startsWith("- ")) return parseList(curInd);
      return parseMap(curInd);
    }
    function parseMap(curInd) {
      const obj = {};
      while (i < linhas.length) {
        const l = linhas[i];
        const li = ind(l);
        if (li < curInd) break;
        if (l.trim().startsWith("- ")) break;
        const m = /^([^:]+):\s*(.*)$/.exec(l.trim());
        if (!m) { i++; continue; }
        const chave = m[1].trim();
        const resto = m[2].trim();
        i++;
        if (resto !== "") obj[chave] = desaspas(resto);
        else if (i < linhas.length && ind(linhas[i]) > curInd) obj[chave] = parse(ind(linhas[i]));
        else obj[chave] = {};
      }
      return obj;
    }
    function parseList(curInd) {
      const arr = [];
      while (i < linhas.length) {
        const l = linhas[i];
        if (ind(l) !== curInd || !l.trim().startsWith("- ")) break;
        const resto = l.trim().slice(2).trim();
        if (resto === "") { i++; arr.push(parse(ind(linhas[i] || ""))); }
        else if (resto.includes(":")) {
          // "- chave: valor" -> item de mapa; realinha a linha e parseia o mapa
          linhas[i] = " ".repeat(curInd + 2) + resto;
          arr.push(parseMap(curInd + 2));
        } else { i++; arr.push(desaspas(resto)); }
      }
      return arr;
    }
    return parse(0);
  }

  function parseTemplate(texto) {
    const t = String(texto).trim();
    if (t.startsWith("{")) {
      try { return JSON.parse(t); }
      catch (e) { throw new ErroCli("An error occurred (ValidationError) when calling the CreateStack operation: Template format error: JSON inválido."); }
    }
    const obj = parseYaml(t);
    if (!obj || typeof obj !== "object") {
      throw new ErroCli("An error occurred (ValidationError) when calling the CreateStack operation: Template format error: não consegui ler o template.");
    }
    return obj;
  }

  // ---------- Templates prontos (pro file://) ----------
  const CFN_TEMPLATES = {
    "site-s3.yaml":
      'AWSTemplateFormatVersion: "2010-09-09"\n' +
      "Description: Bucket S3 para hospedar um site\n" +
      "Resources:\n" +
      "  SiteBucket:\n" +
      "    Type: AWS::S3::Bucket\n" +
      "    Properties:\n" +
      "      BucketName: meu-site-cfn\n",
    "infra.yaml":
      'AWSTemplateFormatVersion: "2010-09-09"\n' +
      "Description: Infra de um app (S3 + DynamoDB + IAM)\n" +
      "Resources:\n" +
      "  AppBucket:\n" +
      "    Type: AWS::S3::Bucket\n" +
      "    Properties:\n" +
      "      BucketName: app-uploads-cfn\n" +
      "  AppTable:\n" +
      "    Type: AWS::DynamoDB::Table\n" +
      "    Properties:\n" +
      "      TableName: AppTarefas\n" +
      "      AttributeDefinitions:\n" +
      "        - AttributeName: id\n" +
      "          AttributeType: S\n" +
      "      KeySchema:\n" +
      "        - AttributeName: id\n" +
      "          KeyType: HASH\n" +
      "      BillingMode: PAY_PER_REQUEST\n" +
      "  AppUser:\n" +
      "    Type: AWS::IAM::User\n" +
      "    Properties:\n" +
      "      UserName: app-deploy\n",
  };

  function corpoDoTemplate(flags) {
    const tb = exigirFlag(flags, "template-body");
    let texto;
    if (String(tb).startsWith("file://")) {
      const nome = String(tb).slice(7);
      texto = CFN_TEMPLATES[nome];
      if (texto === undefined) {
        throw new ErroCli(`Error parsing parameter '--template-body': Unable to load paramfile ${tb}: arquivo não existe. Templates prontos: ${Object.keys(CFN_TEMPLATES).join(", ")}.`);
      }
    } else {
      texto = tb;
    }
    return parseTemplate(texto);
  }

  // ---------- Provisionamento de recursos ----------
  const TIPOS_SUPORTADOS = ["AWS::S3::Bucket", "AWS::IAM::User", "AWS::EC2::Instance", "AWS::Lambda::Function", "AWS::DynamoDB::Table"];

  function criarRecurso(conta, logicalId, tipo, props) {
    props = props || {};
    if (tipo === "AWS::S3::Bucket") {
      const nome = props.BucketName || (logicalId.toLowerCase() + "-" + hexAleatorio(8));
      if (conta.s3.buckets[nome]) throw new ErroCli(`An error occurred (AlreadyExistsException) when calling the CreateStack operation: o bucket '${nome}' já existe.`);
      conta.s3.buckets[nome] = { criadoEm: dataFormatada(), objetos: {}, website: null, politica: null, versionamento: null };
      return nome;
    }
    if (tipo === "AWS::IAM::User") {
      const nome = props.UserName || logicalId;
      if (conta.iam.usuarios[nome]) throw new ErroCli(`An error occurred (AlreadyExistsException) when calling the CreateStack operation: o usuário '${nome}' já existe.`);
      conta.iam.usuarios[nome] = { criadoEm: agoraIso(), politicas: [], userId: "AIDA" + hexAleatorio(17).toUpperCase() };
      return nome;
    }
    if (tipo === "AWS::EC2::Instance") {
      const id = "i-0" + hexAleatorio(16);
      conta.ec2.instancias[id] = { id, imagem: props.ImageId || "ami-0abcd1234ef567890", tipo: props.InstanceType || "t2.micro", chave: null, sgs: [], estado: "running", criadaEm: agoraIso() };
      return id;
    }
    if (tipo === "AWS::Lambda::Function") {
      const nome = props.FunctionName || logicalId;
      if (conta.lambda.funcoes[nome]) throw new ErroCli(`An error occurred (AlreadyExistsException) when calling the CreateStack operation: a função '${nome}' já existe.`);
      conta.lambda.funcoes[nome] = { runtime: props.Runtime || "python3.12", role: props.Role || "arn:aws:iam::123456789012:role/lambda-exec", handler: props.Handler || "index.handler", timeout: 3, memoria: 128, env: {}, invocada: false, criadaEm: agoraIso() };
      return nome;
    }
    if (tipo === "AWS::DynamoDB::Table") {
      const nome = props.TableName || logicalId;
      if (conta.dynamodb.tabelas[nome]) throw new ErroCli(`An error occurred (AlreadyExistsException) when calling the CreateStack operation: a tabela '${nome}' já existe.`);
      const defs = [].concat(props.AttributeDefinitions || []).map((d) => ({ AttributeName: d.AttributeName, AttributeType: d.AttributeType }));
      const esquema = [].concat(props.KeySchema || []).map((k) => ({ AttributeName: k.AttributeName, KeyType: k.KeyType }));
      conta.dynamodb.tabelas[nome] = { defs, esquema, cobranca: props.BillingMode || "PAY_PER_REQUEST", itens: [], criadaEm: agoraIso() };
      return nome;
    }
    throw new ErroCli(`An error occurred (ValidationError) when calling the CreateStack operation: tipo de recurso não suportado neste simulador: ${tipo}.\nSuportados: ${TIPOS_SUPORTADOS.join(", ")}.`);
  }

  function apagarRecurso(conta, tipo, pid) {
    if (tipo === "AWS::S3::Bucket") delete conta.s3.buckets[pid];
    else if (tipo === "AWS::IAM::User") { delete conta.iam.usuarios[pid]; for (const g of Object.values(conta.iam.grupos)) g.membros = g.membros.filter((m) => m !== pid); }
    else if (tipo === "AWS::EC2::Instance") { if (conta.ec2.instancias[pid]) conta.ec2.instancias[pid].estado = "terminated"; }
    else if (tipo === "AWS::Lambda::Function") delete conta.lambda.funcoes[pid];
    else if (tipo === "AWS::DynamoDB::Table") delete conta.dynamodb.tabelas[pid];
  }

  function cfn(conta) {
    conta.cloudformation = conta.cloudformation || { stacks: {} };
    return conta.cloudformation;
  }
  function stackArn(conta, nome) {
    return `arn:aws:cloudformation:${conta.regiao}:${conta.contaId}:stack/${nome}/${hexAleatorio(8)}-${hexAleatorio(4)}-${hexAleatorio(12)}`;
  }
  function exigirStack(conta, flags, operacao) {
    const nome = exigirFlag(flags, "stack-name");
    const s = cfn(conta).stacks[nome];
    if (!s) throw new ErroCli(`An error occurred (ValidationError) when calling the ${operacao} operation: Stack with id ${nome} does not exist`);
    return s;
  }

  // ---------- Handlers ----------
  const cmdCfn = {
    "create-stack": (conta, pos, flags) => {
      const nome = exigirFlag(flags, "stack-name");
      const st = cfn(conta);
      if (st.stacks[nome]) throw new ErroCli(`An error occurred (AlreadyExistsException) when calling the CreateStack operation: Stack [${nome}] already exists`);
      const template = corpoDoTemplate(flags);
      const recursos = template.Resources;
      if (!recursos || typeof recursos !== "object" || !Object.keys(recursos).length) {
        throw new ErroCli("An error occurred (ValidationError) when calling the CreateStack operation: Template format error: o template precisa de uma seção 'Resources' com pelo menos um recurso.");
      }
      const criados = [];
      for (const [logicalId, def] of Object.entries(recursos)) {
        if (!def || !def.Type) throw new ErroCli(`An error occurred (ValidationError) when calling the CreateStack operation: o recurso '${logicalId}' está sem 'Type'.`);
        const pid = criarRecurso(conta, logicalId, def.Type, def.Properties);
        criados.push({ LogicalResourceId: logicalId, ResourceType: def.Type, PhysicalResourceId: pid, ResourceStatus: "CREATE_COMPLETE" });
      }
      const arn = stackArn(conta, nome);
      st.stacks[nome] = { nome, arn, status: "CREATE_COMPLETE", descricao: template.Description || "", recursos: criados, criadoEm: agoraIso() };
      return js({ StackId: arn });
    },

    "list-stacks": (conta) => {
      const st = cfn(conta);
      return js({
        StackSummaries: Object.values(st.stacks).map((s) => ({
          StackName: s.nome, StackId: s.arn, StackStatus: s.status, CreationTime: s.criadoEm,
        })),
      });
    },

    "describe-stacks": (conta, pos, flags) => {
      const st = cfn(conta);
      let lista;
      if (flags["stack-name"] !== undefined && flags["stack-name"] !== true) {
        lista = [exigirStack(conta, flags, "DescribeStacks")];
      } else {
        lista = Object.values(st.stacks);
      }
      return js({
        Stacks: lista.map((s) => ({
          StackName: s.nome, StackId: s.arn, StackStatus: s.status,
          Description: s.descricao, CreationTime: s.criadoEm,
        })),
      });
    },

    "describe-stack-resources": (conta, pos, flags) => {
      const s = exigirStack(conta, flags, "DescribeStackResources");
      return js({
        StackResources: s.recursos.map((r) => ({
          StackName: s.nome, LogicalResourceId: r.LogicalResourceId,
          PhysicalResourceId: r.PhysicalResourceId, ResourceType: r.ResourceType,
          ResourceStatus: r.ResourceStatus, Timestamp: s.criadoEm,
        })),
      });
    },

    "validate-template": (conta, pos, flags) => {
      const template = corpoDoTemplate(flags);
      if (!template.Resources || !Object.keys(template.Resources).length) {
        throw new ErroCli("An error occurred (ValidationError) when calling the ValidateTemplate operation: Template format error: falta a seção 'Resources'.");
      }
      return js({ Description: template.Description || "", Parameters: [], Capabilities: [] });
    },

    "delete-stack": (conta, pos, flags) => {
      const s = exigirStack(conta, flags, "DeleteStack");
      for (const r of s.recursos) apagarRecurso(conta, r.ResourceType, r.PhysicalResourceId);
      delete cfn(conta).stacks[s.nome];
      return okSilencioso(`Stack "${s.nome}" e seus ${s.recursos.length} recurso(s) foram removidos.`);
    },
  };

  // ---------- Registro no motor ----------
  if (typeof SERVICOS !== "undefined") SERVICOS.cloudformation = cmdCfn;
  if (typeof ARQUIVOS_LOCAIS !== "undefined") {
    for (const nome of Object.keys(CFN_TEMPLATES)) ARQUIVOS_LOCAIS[nome] = CFN_TEMPLATES[nome].length;
  }

  // ---------- Trilha de desafios ----------
  const DESAFIOS_CFN = [
    {
      id: "cfn-1", servico: "cloudformation", nivel: 1, xp: 60,
      titulo: "Seu primeiro stack",
      descricao: "Infraestrutura como código: em vez de criar recursos um a um, você descreve tudo num <b>template</b> e o CloudFormation provisiona. Existe um template pronto <b>site-s3.yaml</b> (um bucket). Crie um stack chamado <b>site</b> a partir dele.",
      dicas: ["aws cloudformation create-stack --stack-name <nome> --template-body file://<arquivo>", "O template fica no disco local: file://site-s3.yaml"],
      solucao: ["aws cloudformation create-stack --stack-name site --template-body file://site-s3.yaml"],
      validar: (conta) => !!(conta.cloudformation && conta.cloudformation.stacks["site"]) && !!conta.s3.buckets["meu-site-cfn"],
    },
    {
      id: "cfn-2", servico: "cloudformation", nivel: 1, xp: 40,
      titulo: "O bucket apareceu?",
      descricao: "O stack criou um bucket de verdade. Liste seus <b>buckets do S3</b> e confirme que o <b>meu-site-cfn</b> está lá — criado pelo CloudFormation.",
      dicas: ["É o mesmo S3 de sempre: aws s3 ls", "O CloudFormation provisiona recursos reais na conta."],
      solucao: ["aws s3 ls"],
      validar: (conta, cmd, ok) => ok && ehCmd(cmd, "s3", "ls") && !!conta.s3.buckets["meu-site-cfn"],
    },
    {
      id: "cfn-3", servico: "cloudformation", nivel: 1, xp: 50,
      titulo: "Liste seus stacks",
      descricao: "Veja os stacks que você tem na conta.",
      dicas: ["aws cloudformation list-stacks"],
      solucao: ["aws cloudformation list-stacks"],
      validar: (conta, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "list-stacks"),
    },
    {
      id: "cfn-4", servico: "cloudformation", nivel: 2, xp: 60,
      titulo: "O que tem dentro do stack",
      descricao: "Inspecione os <b>recursos</b> que o stack <b>site</b> criou.",
      dicas: ["aws cloudformation describe-stack-resources --stack-name <nome>"],
      solucao: ["aws cloudformation describe-stack-resources --stack-name site"],
      validar: (conta, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "describe-stack-resources"),
    },
    {
      id: "cfn-5", servico: "cloudformation", nivel: 2, xp: 90,
      titulo: "Infra completa num arquivo só",
      descricao: "O poder do IaC: um template, vários serviços. Use o <b>infra.yaml</b> (S3 + DynamoDB + IAM) pra criar um stack chamado <b>app</b>. Depois confira no <b>aws dynamodb list-tables</b> que a tabela nasceu.",
      dicas: ["aws cloudformation create-stack --stack-name app --template-body file://infra.yaml", "Um stack só cria os 3 recursos de uma vez."],
      solucao: ["aws cloudformation create-stack --stack-name app --template-body file://infra.yaml"],
      validar: (conta) => !!(conta.cloudformation && conta.cloudformation.stacks["app"]) && !!conta.dynamodb.tabelas["AppTarefas"] && !!conta.s3.buckets["app-uploads-cfn"] && !!conta.iam.usuarios["app-deploy"],
    },
    {
      id: "cfn-6", servico: "cloudformation", nivel: 2, xp: 70,
      titulo: "Derrube o stack",
      descricao: "Uma das vantagens do IaC: apagar tudo de uma vez. <b>Delete o stack</b> <b>site</b> — o bucket que ele criou vai junto.",
      dicas: ["aws cloudformation delete-stack --stack-name <nome>", "Repare depois: o meu-site-cfn some do 'aws s3 ls'."],
      solucao: ["aws cloudformation delete-stack --stack-name site"],
      validar: (conta, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "delete-stack") && !(conta.cloudformation && conta.cloudformation.stacks["site"]) && !conta.s3.buckets["meu-site-cfn"],
    },
  ];

  if (typeof SERVICOS_META !== "undefined" && !SERVICOS_META.some((s) => s.id === "cloudformation")) {
    const iProj = SERVICOS_META.findIndex((s) => s.id === "projetos");
    const meta = { id: "cloudformation", nome: "CloudFormation", subtitulo: "Infraestrutura como código", icone: "📄" };
    if (iProj >= 0) SERVICOS_META.splice(iProj, 0, meta); else SERVICOS_META.push(meta);
    for (const d of DESAFIOS_CFN) DESAFIOS.push(d);
  }
})();
