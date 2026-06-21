"use strict";
// ============================================================
// AWS CLI Quest — simulador.js
// Conta AWS virtual + parser de comandos + handlers por serviço
// ============================================================

// ---------- Erro de CLI (mensagens no estilo do AWS CLI real) ----------
class ErroCli extends Error {}

// ---------- Aviso do CLImb ----------
// A saída do comando deve ser FIEL ao AWS de verdade (mesmo que seja vazia).
// Quando algo merece explicação (ex.: "a AWS não mostra nada quando não há
// buckets"), o handler chama avisarClimb(...) e o terminal mostra esse texto
// SEPARADO da saída do CLI, deixando claro que é um aviso do CLImb — não do CLI.
let _avisoClimb = null;
function avisarClimb(texto) { _avisoClimb = texto; }
// Sucesso "silencioso": muitos delete/put da AWS não respondem nada quando dão
// certo. Mantemos isso (saída vazia, fiel) e explicamos no aviso do CLImb.
function okSilencioso(oque) {
  avisarClimb(`${oque} A AWS não imprime nada quando uma operação dessas dá certo — por isso o terminal fica em branco.`);
  return "";
}

// ---------- Conta virtual ----------
function criarContaAws() {
  const conta = {
    regiao: "us-east-1",
    contaId: "123456789012",
    s3: { buckets: {} },
    ec2: { instancias: {}, securityGroups: {}, keyPairs: {} },
    iam: { usuarios: {}, grupos: {}, roles: {}, policies: {} },
    lambda: { funcoes: {} },
    dynamodb: { tabelas: {} },
    arquivosSalvos: {}, // arquivos criados via redirecionamento ">"
  };
  semearLabPolicy(conta);
  return conta;
}

// Política gerenciada pelo cliente já existente na conta (igual ao lab da AWS).
// Os desafios avançados pedem pra "baixar" essa política via CLI.
function semearLabPolicy(conta) {
  const doc = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "PermitirLeituraS3",
        Effect: "Allow",
        Action: ["s3:Get*", "s3:List*"],
        Resource: "*",
      },
    ],
  };
  conta.iam.policies["lab_policy"] = {
    nome: "lab_policy",
    arn: `arn:aws:iam::${conta.contaId}:policy/lab_policy`,
    scope: "Local",
    defaultVersionId: "v1",
    policyId: "ANPAEXAMPLELABPOLICY1",
    criadoEm: "2026-01-15T12:00:00+00:00",
    versions: { v1: { documento: doc, criadoEm: "2026-01-15T12:00:00+00:00" } },
  };
}

// Políticas gerenciadas PELA AWS (aparecem em list-policies --scope AWS/All).
const POLITICAS_AWS = [
  "AmazonS3ReadOnlyAccess",
  "AmazonS3FullAccess",
  "AmazonDynamoDBFullAccess",
  "AmazonEC2FullAccess",
  "IAMReadOnlyAccess",
  "AdministratorAccess",
];

// Migração: garante que uma conta carregada (de save antigo ou da nuvem) tenha
// TODOS os campos que o motor espera. Sem isso, contas criadas antes de um
// campo novo (ex.: iam.policies, arquivosSalvos) quebravam com "Erro interno".
function normalizarConta(c) {
  if (!c || typeof c !== "object") return criarContaAws();
  c.regiao = c.regiao || "us-east-1";
  c.contaId = c.contaId || "123456789012";
  c.s3 = c.s3 || {};
  c.s3.buckets = c.s3.buckets || {};
  c.ec2 = c.ec2 || {};
  c.ec2.instancias = c.ec2.instancias || {};
  c.ec2.securityGroups = c.ec2.securityGroups || {};
  c.ec2.keyPairs = c.ec2.keyPairs || {};
  c.iam = c.iam || {};
  c.iam.usuarios = c.iam.usuarios || {};
  c.iam.grupos = c.iam.grupos || {};
  c.iam.roles = c.iam.roles || {};
  c.iam.policies = c.iam.policies || {};
  c.lambda = c.lambda || {};
  c.lambda.funcoes = c.lambda.funcoes || {};
  c.dynamodb = c.dynamodb || {};
  c.dynamodb.tabelas = c.dynamodb.tabelas || {};
  c.arquivosSalvos = c.arquivosSalvos || {};
  if (!c.iam.policies["lab_policy"]) semearLabPolicy(c);
  return c;
}

// ---------- "Disco local" fictício (pra cp, sync, fileb:// etc.) ----------
const ARQUIVOS_LOCAIS = {
  "relatorio.csv": 2480,
  "index.html": 1320,
  "erro404.html": 540,
  "logo.png": 18204,
  "app.zip": 30215,
  "trust.json": 312,
  "politica-publica.json": 287,
  "site/index.html": 1320,
  "site/css/estilo.css": 2210,
  "site/js/app.js": 4105,
};

function normalizarCaminho(p) {
  return String(p).replace(/^\.\//, "").replace(/\/+$/, "");
}

function arquivoLocal(p) {
  const caminho = normalizarCaminho(p);
  return ARQUIVOS_LOCAIS[caminho] !== undefined ? { caminho, tamanho: ARQUIVOS_LOCAIS[caminho] } : null;
}

// ---------- Utilitários ----------
function js(obj) {
  return JSON.stringify(obj, null, 4);
}

function hexAleatorio(n) {
  let s = "";
  for (let i = 0; i < n; i++) s += "0123456789abcdef"[Math.floor(Math.random() * 16)];
  return s;
}

function agoraIso() {
  return new Date().toISOString().replace(/\.\d+Z$/, "+00:00");
}

function dataFormatada() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function exigirFlag(flags, nome) {
  const v = flags[nome];
  if (v === undefined || v === true || v === "") {
    throw new ErroCli(`aws: error: the following arguments are required: --${nome}`);
  }
  return v;
}

// Shorthand do CLI: "AttributeName=id,AttributeType=S" -> objeto
function parsearShorthand(str) {
  const obj = {};
  for (const par of String(str).split(",")) {
    const i = par.indexOf("=");
    if (i < 0) throw new ErroCli(`Error parsing parameter: valor shorthand inválido '${par}'. Formato esperado: Chave=valor,Chave2=valor2`);
    obj[par.slice(0, i).trim()] = par.slice(i + 1).trim();
  }
  return obj;
}

function parsearJsonFlag(flags, nome) {
  const bruto = exigirFlag(flags, nome);
  try {
    return JSON.parse(bruto);
  } catch (e) {
    throw new ErroCli(`Error parsing parameter '--${nome}': Invalid JSON: ${bruto}\nDica: coloque o JSON entre aspas simples, ex.: --${nome} '{"id": {"S": "1"}}'`);
  }
}

// ---------- Tokenizador (respeita aspas simples e duplas) ----------
function tokenizar(linha) {
  const tokens = [];
  let atual = "";
  let aspas = null;
  let teveAlgo = false;
  for (const ch of linha) {
    if (aspas) {
      if (ch === aspas) aspas = null;
      else atual += ch;
    } else if (ch === '"' || ch === "'") {
      aspas = ch;
      teveAlgo = true;
    } else if (/\s/.test(ch)) {
      if (atual || teveAlgo) { tokens.push(atual); atual = ""; teveAlgo = false; }
    } else {
      atual += ch;
    }
  }
  if (aspas) throw new ErroCli("Erro de sintaxe: aspas não fechadas.");
  if (atual || teveAlgo) tokens.push(atual);
  return tokens;
}

// ---------- Parser de argumentos (--flag valor | --flag=valor | --flag v1 v2) ----------
// Só as flags desta lista aceitam vários valores seguidos (como no CLI real);
// as demais consomem um valor só, pra não engolir argumentos posicionais.
const FLAGS_MULTI_VALOR = new Set([
  "instance-ids",
  "security-groups",
  "security-group-ids",
  "attribute-definitions",
  "key-schema",
]);

function parsearArgs(tokens) {
  const posicionais = [];
  const flags = {};
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.startsWith("--")) {
      let nome = t.slice(2);
      const igual = nome.indexOf("=");
      if (igual >= 0) {
        flags[nome.slice(0, igual)] = nome.slice(igual + 1);
        i++;
        continue;
      }
      i++;
      const valores = [];
      while (i < tokens.length && !tokens[i].startsWith("--")) {
        valores.push(tokens[i]);
        i++;
        if (!FLAGS_MULTI_VALOR.has(nome)) break;
      }
      flags[nome] = valores.length === 0 ? true : valores.length === 1 ? valores[0] : valores;
    } else {
      posicionais.push(t);
      i++;
    }
  }
  return { posicionais, flags };
}

// ---------- S3 ----------
function parsearUriS3(s) {
  const m = /^s3:\/\/([^/]+)\/?(.*)$/.exec(String(s));
  if (!m) return null;
  return { bucket: m[1], chave: m[2] };
}

function exigirBucket(conta, nome, operacao) {
  const b = conta.s3.buckets[nome];
  if (!b) throw new ErroCli(`An error occurred (NoSuchBucket) when calling the ${operacao} operation: The specified bucket does not exist`);
  return b;
}

const NOME_BUCKET_VALIDO = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

const cmdS3 = {
  mb: (conta, pos) => {
    const uri = parsearUriS3(pos[0] || "");
    if (!uri || uri.chave) throw new ErroCli("uso: aws s3 mb s3://<nome-do-bucket>");
    if (!NOME_BUCKET_VALIDO.test(uri.bucket)) {
      throw new ErroCli(`make_bucket failed: s3://${uri.bucket} Parameter validation failed: nome de bucket inválido (use só letras minúsculas, números e hífens, 3 a 63 caracteres).`);
    }
    if (conta.s3.buckets[uri.bucket]) {
      throw new ErroCli(`make_bucket failed: s3://${uri.bucket} An error occurred (BucketAlreadyOwnedByYou) when calling the CreateBucket operation: Your previous request to create the named bucket succeeded and you already own it.`);
    }
    conta.s3.buckets[uri.bucket] = { criadoEm: dataFormatada(), objetos: {}, website: null, politica: null, versionamento: null };
    return `make_bucket: ${uri.bucket}`;
  },

  rb: (conta, pos, flags) => {
    const uri = parsearUriS3(pos[0] || "");
    if (!uri || uri.chave) throw new ErroCli("uso: aws s3 rb s3://<nome-do-bucket> [--force]");
    const b = exigirBucket(conta, uri.bucket, "DeleteBucket");
    const chaves = Object.keys(b.objetos);
    if (chaves.length && !flags.force) {
      throw new ErroCli(`remove_bucket failed: s3://${uri.bucket} An error occurred (BucketNotEmpty) when calling the DeleteBucket operation: The bucket you tried to delete is not empty.`);
    }
    const linhas = chaves.map((c) => `delete: s3://${uri.bucket}/${c}`);
    delete conta.s3.buckets[uri.bucket];
    linhas.push(`remove_bucket: ${uri.bucket}`);
    return linhas.join("\n");
  },

  ls: (conta, pos) => {
    if (!pos.length) {
      const nomes = Object.keys(conta.s3.buckets);
      // Fiel à AWS: sem buckets, o comando não imprime nada (saída vazia).
      if (!nomes.length) {
        avisarClimb("A AWS não mostra nada quando você ainda não tem nenhum bucket — isso é normal, não é erro. Crie o primeiro com:  aws s3 mb s3://nome-do-bucket");
        return "";
      }
      return nomes.map((n) => `${conta.s3.buckets[n].criadoEm} ${n}`).join("\n");
    }
    const uri = parsearUriS3(pos[0]);
    if (!uri) throw new ErroCli("uso: aws s3 ls [s3://<bucket>[/prefixo]]");
    const b = exigirBucket(conta, uri.bucket, "ListObjectsV2");
    const prefixo = uri.chave;
    const linhas = [];
    const subpastas = new Set();
    for (const [chave, obj] of Object.entries(b.objetos)) {
      if (!chave.startsWith(prefixo)) continue;
      const resto = chave.slice(prefixo.length);
      const barra = resto.indexOf("/");
      if (barra >= 0) subpastas.add(resto.slice(0, barra + 1));
      else linhas.push(`${obj.enviadoEm} ${String(obj.tamanho).padStart(10)} ${chave}`);
    }
    const saida = [...[...subpastas].map((p) => `${" ".repeat(27)}PRE ${p}`), ...linhas];
    // Fiel à AWS: bucket/prefixo vazio não imprime nada.
    if (!saida.length) {
      avisarClimb(`O bucket "${uri.bucket}" está vazio (ou não há nada com esse prefixo). A AWS não imprime nada nesse caso. Envie um arquivo com:  aws s3 cp arquivo s3://${uri.bucket}/`);
      return "";
    }
    return saida.join("\n");
  },

  cp: (conta, pos) => {
    const [origem, destino] = pos;
    if (!origem || !destino) throw new ErroCli("uso: aws s3 cp <origem> <destino>\nEx.: aws s3 cp relatorio.csv s3://meu-bucket/");
    const uriOrigem = parsearUriS3(origem);
    const uriDestino = parsearUriS3(destino);

    if (!uriOrigem && uriDestino) {
      // upload: local -> s3
      const arq = arquivoLocal(origem);
      if (!arq) {
        let chaveDest = uriDestino.chave;
        if (!chaveDest || chaveDest.endsWith("/")) chaveDest += origem.split("/").pop();
        throw new ErroCli(`upload failed: ${origem} to s3://${uriDestino.bucket}/${chaveDest} [Errno 2] No such file or directory: '${origem}'`);
      }
      const b = exigirBucket(conta, uriDestino.bucket, "PutObject");
      let chave = uriDestino.chave;
      if (!chave || chave.endsWith("/")) chave += arq.caminho.split("/").pop();
      b.objetos[chave] = { tamanho: arq.tamanho, enviadoEm: dataFormatada() };
      return `upload: ./${arq.caminho} to s3://${uriDestino.bucket}/${chave}`;
    }
    if (uriOrigem && !uriDestino) {
      // download: s3 -> local
      const b = exigirBucket(conta, uriOrigem.bucket, "GetObject");
      const obj = b.objetos[uriOrigem.chave];
      if (!obj) throw new ErroCli(`download failed: s3://${uriOrigem.bucket}/${uriOrigem.chave} An error occurred (404) when calling the HeadObject operation: Not Found`);
      const nomeLocal = normalizarCaminho(destino) === "" || destino === "./" || destino === "."
        ? uriOrigem.chave.split("/").pop()
        : normalizarCaminho(destino);
      return `download: s3://${uriOrigem.bucket}/${uriOrigem.chave} to ./${nomeLocal}`;
    }
    if (uriOrigem && uriDestino) {
      // cópia s3 -> s3
      const bO = exigirBucket(conta, uriOrigem.bucket, "CopyObject");
      const obj = bO.objetos[uriOrigem.chave];
      if (!obj) throw new ErroCli(`copy failed: s3://${uriOrigem.bucket}/${uriOrigem.chave} Not Found`);
      const bD = exigirBucket(conta, uriDestino.bucket, "CopyObject");
      let chave = uriDestino.chave;
      if (!chave || chave.endsWith("/")) chave += uriOrigem.chave.split("/").pop();
      bD.objetos[chave] = { tamanho: obj.tamanho, enviadoEm: dataFormatada() };
      return `copy: s3://${uriOrigem.bucket}/${uriOrigem.chave} to s3://${uriDestino.bucket}/${chave}`;
    }
    throw new ErroCli("uso: aws s3 cp <origem> <destino> — pelo menos um dos lados precisa ser um caminho s3://");
  },

  rm: (conta, pos) => {
    const uri = parsearUriS3(pos[0] || "");
    if (!uri || !uri.chave) throw new ErroCli("uso: aws s3 rm s3://<bucket>/<chave>");
    const b = exigirBucket(conta, uri.bucket, "DeleteObject");
    // Fiel à AWS: DeleteObject é idempotente — apagar uma chave que não existe
    // também responde "delete: ..." com sucesso (não é erro).
    delete b.objetos[uri.chave];
    return `delete: s3://${uri.bucket}/${uri.chave}`;
  },

  sync: (conta, pos) => {
    const [origem, destino] = pos;
    const uriDestino = parsearUriS3(destino || "");
    if (!origem || !uriDestino) throw new ErroCli("uso: aws s3 sync <pasta-local> s3://<bucket>[/prefixo]\nEx.: aws s3 sync ./site s3://meu-bucket");
    const pasta = normalizarCaminho(origem);
    const arquivos = Object.keys(ARQUIVOS_LOCAIS).filter((c) => c.startsWith(pasta + "/"));
    if (!arquivos.length) throw new ErroCli(`sync failed: a pasta local '${origem}' não existe ou está vazia. Digite 'ls' para ver o que existe.`);
    const b = exigirBucket(conta, uriDestino.bucket, "PutObject");
    const prefixo = uriDestino.chave ? uriDestino.chave.replace(/\/$/, "") + "/" : "";
    const linhas = [];
    for (const caminho of arquivos) {
      const chave = prefixo + caminho.slice(pasta.length + 1);
      b.objetos[chave] = { tamanho: ARQUIVOS_LOCAIS[caminho], enviadoEm: dataFormatada() };
      linhas.push(`upload: ./${caminho} to s3://${uriDestino.bucket}/${chave}`);
    }
    return linhas.join("\n");
  },

  website: (conta, pos, flags) => {
    const uri = parsearUriS3(pos[0] || "");
    if (!uri) throw new ErroCli("uso: aws s3 website s3://<bucket> --index-document index.html [--error-document erro.html]");
    const b = exigirBucket(conta, uri.bucket, "PutBucketWebsite");
    const indice = exigirFlag(flags, "index-document");
    b.website = { indice, erro: typeof flags["error-document"] === "string" ? flags["error-document"] : null };
    return "";
  },
};

// ---------- s3api ----------
const cmdS3api = {
  "create-bucket": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "bucket");
    if (!NOME_BUCKET_VALIDO.test(nome)) throw new ErroCli("An error occurred (InvalidBucketName) when calling the CreateBucket operation: The specified bucket is not valid.");
    if (conta.s3.buckets[nome]) throw new ErroCli("An error occurred (BucketAlreadyOwnedByYou) when calling the CreateBucket operation: Your previous request to create the named bucket succeeded and you already own it.");
    conta.s3.buckets[nome] = { criadoEm: dataFormatada(), objetos: {}, website: null, politica: null, versionamento: null };
    return js({ Location: "/" + nome });
  },

  "list-buckets": (conta) => {
    return js({
      Buckets: Object.entries(conta.s3.buckets).map(([Name, b]) => ({ Name, CreationDate: b.criadoEm })),
      Owner: { DisplayName: "estudante", ID: "exemplo-id-do-dono-da-conta" },
    });
  },

  "put-bucket-versioning": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "bucket");
    const b = exigirBucket(conta, nome, "PutBucketVersioning");
    const conf = parsearShorthand(exigirFlag(flags, "versioning-configuration"));
    if (conf.Status !== "Enabled" && conf.Status !== "Suspended") {
      throw new ErroCli("An error occurred (MalformedXML) when calling the PutBucketVersioning operation: Status precisa ser 'Enabled' ou 'Suspended'.");
    }
    b.versionamento = conf.Status;
    return okSilencioso(`Versionamento ${conf.Status === "Enabled" ? "ativado" : "suspenso"} no bucket "${nome}". Confira com: aws s3api get-bucket-versioning --bucket ${nome}.`);
  },

  "get-bucket-versioning": (conta, pos, flags) => {
    const b = exigirBucket(conta, exigirFlag(flags, "bucket"), "GetBucketVersioning");
    return b.versionamento ? js({ Status: b.versionamento }) : "";
  },

  "put-bucket-policy": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "bucket");
    const b = exigirBucket(conta, nome, "PutBucketPolicy");
    const politica = exigirFlag(flags, "policy");
    if (politica.startsWith("file://")) {
      const arq = arquivoLocal(politica.slice(7));
      if (!arq) throw new ErroCli(`Error parsing parameter '--policy': Unable to load paramfile ${politica}: arquivo não existe. Digite 'ls' para ver os arquivos locais.`);
    } else {
      try { JSON.parse(politica); }
      catch (e) { throw new ErroCli("An error occurred (MalformedPolicy) when calling the PutBucketPolicy operation: Policies must be valid JSON"); }
    }
    b.politica = politica;
    return okSilencioso(`Política aplicada ao bucket "${nome}". Confira com: aws s3api get-bucket-policy --bucket ${nome}.`);
  },

  "get-bucket-policy": (conta, pos, flags) => {
    const b = exigirBucket(conta, exigirFlag(flags, "bucket"), "GetBucketPolicy");
    if (!b.politica) throw new ErroCli("An error occurred (NoSuchBucketPolicy) when calling the GetBucketPolicy operation: The bucket policy does not exist");
    return js({ Policy: b.politica });
  },
};

// ---------- EC2 ----------
const TIPOS_INSTANCIA = ["t2.nano", "t2.micro", "t2.small", "t3.nano", "t3.micro", "t3.small", "t3.medium", "m5.large", "c5.large"];

// Códigos de estado iguais aos da AWS (o JSON real traz Code + Name).
const COD_ESTADO_EC2 = { pending: 0, running: 16, "shutting-down": 32, terminated: 48, stopping: 64, stopped: 80 };
function estadoEc2(nome) {
  return { Code: COD_ESTADO_EC2[nome] != null ? COD_ESTADO_EC2[nome] : 0, Name: nome };
}

// VPC/sub-rede padrão fictícios (todas as instâncias do lab nascem aqui, igual
// à VPC default da AWS — por isso são constantes compartilhadas, não aleatórias).
const VPC_PADRAO = "vpc-0a1b2c3d4e5f6a7b8";
const SUBNET_PADRAO = "subnet-0a1b2c3d4e5f6a7b8";

// IPs estáveis derivados do id da instância (mesma instância => mesmo IP em todo
// describe-instances), na faixa 172.31.x.y da VPC default.
function ipsEc2(id) {
  const h = id.replace(/[^0-9a-f]/gi, "").padEnd(6, "0");
  const a = parseInt(h.slice(0, 2), 16) % 16; // /20 -> 0..15
  const b = parseInt(h.slice(2, 4), 16);
  const c = parseInt(h.slice(4, 6), 16);
  return { priv: `172.31.${a}.${b}`, pub: `54.${b}.${c}.${(a % 254) + 1}` };
}

function sgsJson(conta, inst) {
  if (inst.sgs && inst.sgs.length) {
    return inst.sgs.map((nome) => {
      const g = Object.values(conta.ec2.securityGroups).find((x) => x.nome === nome);
      return g ? { GroupName: nome, GroupId: g.id } : { GroupName: nome };
    });
  }
  // Sem --security-groups, a AWS coloca a instância no grupo "default" da VPC.
  return [{ GroupName: "default", GroupId: "sg-0" + inst.id.replace(/[^0-9a-f]/gi, "").slice(0, 16) }];
}

function instanciasJson(conta, lista) {
  const az = conta.regiao + "a";
  return lista.map((i) => {
    const ip = ipsEc2(i.id);
    const j = {
      InstanceId: i.id,
      ImageId: i.imagem,
      InstanceType: i.tipo,
      KeyName: i.chave || null,
      State: estadoEc2(i.estado),
      AmiLaunchIndex: 0,
      Architecture: "x86_64",
      Hypervisor: "xen",
      VirtualizationType: "hvm",
      RootDeviceName: "/dev/xvda",
      RootDeviceType: "ebs",
      PrivateDnsName: `ip-${ip.priv.replace(/\./g, "-")}.ec2.internal`,
      PrivateIpAddress: ip.priv,
      Placement: { AvailabilityZone: az, Tenancy: "default" },
      Monitoring: { State: "disabled" },
      SubnetId: SUBNET_PADRAO,
      VpcId: VPC_PADRAO,
      SecurityGroups: sgsJson(conta, i),
      LaunchTime: i.criadaEm,
    };
    // Instância ligada na VPC default ganha IP público; parada/encerrada perde.
    if (i.estado === "running" || i.estado === "pending") {
      j.PublicIpAddress = ip.pub;
      j.PublicDnsName = `ec2-${ip.pub.replace(/\./g, "-")}.compute-1.amazonaws.com`;
    }
    return j;
  });
}

function exigirInstancias(conta, flags, operacao) {
  const brutos = flags["instance-ids"];
  if (brutos === undefined || brutos === true) throw new ErroCli("aws: error: the following arguments are required: --instance-ids");
  const ids = [].concat(brutos);
  const achadas = [];
  for (const id of ids) {
    const inst = conta.ec2.instancias[id];
    if (!inst) throw new ErroCli(`An error occurred (InvalidInstanceID.NotFound) when calling the ${operacao} operation: The instance ID '${id}' does not exist`);
    achadas.push(inst);
  }
  return achadas;
}

const cmdEc2 = {
  "describe-instances": (conta) => {
    // A AWS agrupa as instâncias por "reserva" (cada run-instances é uma reserva).
    const grupos = {};
    for (const i of Object.values(conta.ec2.instancias)) {
      if (!i.resId) i.resId = "r-0" + i.id.replace(/[^0-9a-f]/gi, "").slice(0, 16); // backfill estável p/ saves antigos
      (grupos[i.resId] = grupos[i.resId] || []).push(i);
    }
    return js({
      Reservations: Object.entries(grupos).map(([resId, insts]) => ({
        ReservationId: resId,
        OwnerId: conta.contaId,
        Groups: [],
        Instances: instanciasJson(conta, insts),
      })),
    });
  },

  "run-instances": (conta, pos, flags) => {
    const imagem = exigirFlag(flags, "image-id");
    if (!/^ami-[0-9a-f]+$/i.test(imagem)) {
      throw new ErroCli(`An error occurred (InvalidAMIID.Malformed) when calling the RunInstances operation: Invalid id: "${imagem}"`);
    }
    const tipo = exigirFlag(flags, "instance-type");
    if (!TIPOS_INSTANCIA.includes(tipo)) {
      throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the RunInstances operation: Invalid value '${tipo}' for InstanceType.`);
    }
    const quantidade = parseInt(flags.count || "1", 10);
    if (!(quantidade >= 1 && quantidade <= 10)) {
      throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the RunInstances operation: Invalid value '${flags.count}' for parameter maxCount.`);
    }
    const chave = typeof flags["key-name"] === "string" ? flags["key-name"] : null;
    if (chave && !conta.ec2.keyPairs[chave]) throw new ErroCli(`An error occurred (InvalidKeyPair.NotFound) when calling the RunInstances operation: The key pair '${chave}' does not exist`);
    const sgs = flags["security-groups"] ? [].concat(flags["security-groups"]) : [];
    for (const sg of sgs) {
      if (!Object.values(conta.ec2.securityGroups).some((g) => g.nome === sg)) {
        throw new ErroCli(`An error occurred (InvalidGroup.NotFound) when calling the RunInstances operation: The security group '${sg}' does not exist`);
      }
    }
    const resId = "r-0" + hexAleatorio(16);
    const novas = [];
    for (let i = 0; i < quantidade; i++) {
      const inst = { id: "i-0" + hexAleatorio(16), imagem, tipo, chave, sgs, estado: "running", criadaEm: agoraIso(), resId };
      conta.ec2.instancias[inst.id] = inst;
      novas.push(inst);
    }
    // run-instances mostra o estado transitório "pending" (igual à AWS real).
    const Instances = instanciasJson(conta, novas).map((j) => ({ ...j, State: estadoEc2("pending") }));
    return js({ Groups: [], Instances, OwnerId: conta.contaId, ReservationId: resId });
  },

  "stop-instances": (conta, pos, flags) => {
    const insts = exigirInstancias(conta, flags, "StopInstances");
    const saida = insts.map((i) => {
      const anterior = i.estado;
      i.estado = "stopped";
      return { CurrentState: estadoEc2("stopping"), InstanceId: i.id, PreviousState: estadoEc2(anterior) };
    });
    return js({ StoppingInstances: saida });
  },

  "start-instances": (conta, pos, flags) => {
    const insts = exigirInstancias(conta, flags, "StartInstances");
    const saida = insts.map((i) => {
      const anterior = i.estado;
      i.estado = "running";
      return { CurrentState: estadoEc2("pending"), InstanceId: i.id, PreviousState: estadoEc2(anterior) };
    });
    return js({ StartingInstances: saida });
  },

  "terminate-instances": (conta, pos, flags) => {
    const insts = exigirInstancias(conta, flags, "TerminateInstances");
    const saida = insts.map((i) => {
      const anterior = i.estado;
      i.estado = "terminated";
      return { CurrentState: estadoEc2("shutting-down"), InstanceId: i.id, PreviousState: estadoEc2(anterior) };
    });
    return js({ TerminatingInstances: saida });
  },

  "create-key-pair": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "key-name");
    if (conta.ec2.keyPairs[nome]) throw new ErroCli(`An error occurred (InvalidKeyPair.Duplicate) when calling the CreateKeyPair operation: The keypair '${nome}' already exists.`);
    const digitos = hexAleatorio(40).match(/.{2}/g).join(":");
    const keyPairId = "key-0" + hexAleatorio(16);
    conta.ec2.keyPairs[nome] = { criadoEm: agoraIso(), fingerprint: digitos, keyPairId };
    return js({ KeyFingerprint: digitos, KeyMaterial: "-----BEGIN RSA PRIVATE KEY-----\n(chave privada simulada — guarde com carinho)\n-----END RSA PRIVATE KEY-----", KeyName: nome, KeyPairId: keyPairId });
  },

  "describe-key-pairs": (conta) => {
    return js({ KeyPairs: Object.entries(conta.ec2.keyPairs).map(([KeyName, k]) => {
      // backfill estável p/ key pairs de saves antigos (criados sem id/fingerprint)
      if (!k.keyPairId) k.keyPairId = "key-0" + hexAleatorio(16);
      if (!k.fingerprint) k.fingerprint = hexAleatorio(40).match(/.{2}/g).join(":");
      return { KeyPairId: k.keyPairId, KeyName, KeyFingerprint: k.fingerprint };
    }) });
  },

  "create-security-group": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "group-name");
    const descricao = exigirFlag(flags, "description");
    if (Object.values(conta.ec2.securityGroups).some((g) => g.nome === nome)) {
      throw new ErroCli(`An error occurred (InvalidGroup.Duplicate) when calling the CreateSecurityGroup operation: The security group '${nome}' already exists`);
    }
    const id = "sg-0" + hexAleatorio(16);
    conta.ec2.securityGroups[id] = { id, nome, descricao, regras: [] };
    return js({ GroupId: id });
  },

  "authorize-security-group-ingress": (conta, pos, flags) => {
    const nome = typeof flags["group-name"] === "string" ? flags["group-name"] : null;
    const id = typeof flags["group-id"] === "string" ? flags["group-id"] : null;
    if (!nome && !id) throw new ErroCli("aws: error: informe --group-name ou --group-id");
    const grupo = id ? conta.ec2.securityGroups[id] : Object.values(conta.ec2.securityGroups).find((g) => g.nome === nome);
    if (!grupo) throw new ErroCli(`An error occurred (InvalidGroup.NotFound) when calling the AuthorizeSecurityGroupIngress operation: The security group '${id || nome}' does not exist`);
    const protocolo = exigirFlag(flags, "protocol");
    const porta = parseInt(exigirFlag(flags, "port"), 10);
    const cidr = exigirFlag(flags, "cidr");
    if (!/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(cidr)) throw new ErroCli(`An error occurred (InvalidParameterValue): CIDR inválido '${cidr}' (ex.: 0.0.0.0/0)`);
    grupo.regras.push({ protocolo, porta, cidr });
    return js({ Return: true, SecurityGroupRules: [{ SecurityGroupRuleId: "sgr-0" + hexAleatorio(16), GroupId: grupo.id, IpProtocol: protocolo, FromPort: porta, ToPort: porta, CidrIpv4: cidr }] });
  },

  "describe-security-groups": (conta) => {
    return js({
      SecurityGroups: Object.values(conta.ec2.securityGroups).map((g) => ({
        GroupId: g.id,
        GroupName: g.nome,
        Description: g.descricao,
        IpPermissions: g.regras.map((r) => ({ IpProtocol: r.protocolo, FromPort: r.porta, ToPort: r.porta, IpRanges: [{ CidrIp: r.cidr }] })),
      })),
    });
  },
};

// ---------- IAM ----------
function arnIam(conta, tipo, nome) {
  return `arn:aws:iam::${conta.contaId}:${tipo}/${nome}`;
}

function exigirArnPolitica(flags) {
  const arn = exigirFlag(flags, "policy-arn");
  if (!/^arn:aws:iam::(aws|\d{12}):policy\/.+$/.test(arn)) {
    throw new ErroCli(`An error occurred (InvalidInput) when calling the AttachPolicy operation: ARN ${arn} is not valid.\nEx. válido: arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess`);
  }
  return arn;
}

// ID único de IAM (ABCD + 17 chars base32) estável a partir de um texto — usado
// pras políticas gerenciadas pela AWS, que não ficam guardadas na conta.
function idEstavelIam(prefixo, str) {
  let s = "";
  for (let i = 0; i < 17; i++) {
    const code = str.charCodeAt(i % str.length) + i * 7;
    s += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[code % 32];
  }
  return prefixo + s;
}

// Conta quantas identidades (usuários, grupos, roles) têm a política anexada.
function contarAnexos(conta, arn) {
  let n = 0;
  for (const u of Object.values(conta.iam.usuarios)) if (u.politicas && u.politicas.includes(arn)) n++;
  for (const g of Object.values(conta.iam.grupos)) if (g.politicas && g.politicas.includes(arn)) n++;
  for (const r of Object.values(conta.iam.roles)) if (r.politicas && r.politicas.includes(arn)) n++;
  return n;
}

function usuarioJson(conta, nome, u) {
  if (!u.userId) u.userId = "AIDA" + hexAleatorio(17).toUpperCase(); // backfill estável p/ contas antigas
  return { Path: "/", UserName: nome, UserId: u.userId, Arn: arnIam(conta, "user", nome), CreateDate: u.criadoEm };
}

function grupoJson(conta, nome, g) {
  if (!g.groupId) g.groupId = "AGPA" + hexAleatorio(17).toUpperCase();
  return { Path: "/", GroupName: nome, GroupId: g.groupId, Arn: arnIam(conta, "group", nome), CreateDate: g.criadoEm };
}

const TRUST_PADRAO = { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "ec2.amazonaws.com" }, Action: "sts:AssumeRole" }] };

function roleJson(conta, nome, r) {
  if (!r.roleId) r.roleId = "AROA" + hexAleatorio(17).toUpperCase();
  return {
    Path: "/",
    RoleName: nome,
    RoleId: r.roleId,
    Arn: arnIam(conta, "role", nome),
    CreateDate: r.criadoEm,
    AssumeRolePolicyDocument: r.trustDoc || TRUST_PADRAO,
    Description: "",
    MaxSessionDuration: 3600,
  };
}

function politicaJson(conta, p) {
  if (!p.policyId) p.policyId = "ANPA" + hexAleatorio(17).toUpperCase();
  return {
    PolicyName: p.nome,
    PolicyId: p.policyId,
    Arn: p.arn,
    Path: "/",
    DefaultVersionId: p.defaultVersionId,
    AttachmentCount: contarAnexos(conta, p.arn),
    IsAttachable: true,
    CreateDate: p.criadoEm,
    UpdateDate: p.atualizadoEm || p.criadoEm,
  };
}

const cmdIam = {
  "create-user": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "user-name");
    if (conta.iam.usuarios[nome]) throw new ErroCli(`An error occurred (EntityAlreadyExists) when calling the CreateUser operation: User with name ${nome} already exists.`);
    conta.iam.usuarios[nome] = { criadoEm: agoraIso(), politicas: [], userId: "AIDA" + hexAleatorio(17).toUpperCase() };
    const u = conta.iam.usuarios[nome];
    return js({ User: { Path: "/", UserName: nome, UserId: u.userId, Arn: arnIam(conta, "user", nome), CreateDate: u.criadoEm } });
  },

  "list-users": (conta) => {
    return js({ Users: Object.entries(conta.iam.usuarios).map(([nome, u]) => {
      if (!u.userId) u.userId = "AIDA" + hexAleatorio(17).toUpperCase(); // backfill estável p/ contas antigas
      return { Path: "/", UserName: nome, UserId: u.userId, Arn: arnIam(conta, "user", nome), CreateDate: u.criadoEm };
    }) });
  },

  "delete-user": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "user-name");
    if (!conta.iam.usuarios[nome]) throw new ErroCli(`An error occurred (NoSuchEntity) when calling the DeleteUser operation: The user with name ${nome} cannot be found.`);
    delete conta.iam.usuarios[nome];
    for (const g of Object.values(conta.iam.grupos)) g.membros = g.membros.filter((m) => m !== nome);
    return okSilencioso(`Usuário "${nome}" apagado.`);
  },

  "create-group": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "group-name");
    if (conta.iam.grupos[nome]) throw new ErroCli(`An error occurred (EntityAlreadyExists) when calling the CreateGroup operation: Group with name ${nome} already exists.`);
    conta.iam.grupos[nome] = { criadoEm: agoraIso(), membros: [], politicas: [], groupId: "AGPA" + hexAleatorio(17).toUpperCase() };
    return js({ Group: grupoJson(conta, nome, conta.iam.grupos[nome]) });
  },

  "list-groups": (conta) => {
    return js({ Groups: Object.entries(conta.iam.grupos).map(([nome, g]) => grupoJson(conta, nome, g)) });
  },

  "add-user-to-group": (conta, pos, flags) => {
    const usuario = exigirFlag(flags, "user-name");
    const grupo = exigirFlag(flags, "group-name");
    if (!conta.iam.usuarios[usuario]) throw new ErroCli(`An error occurred (NoSuchEntity) when calling the AddUserToGroup operation: The user with name ${usuario} cannot be found.`);
    const g = conta.iam.grupos[grupo];
    if (!g) throw new ErroCli(`An error occurred (NoSuchEntity) when calling the AddUserToGroup operation: The group with name ${grupo} cannot be found.`);
    if (!g.membros.includes(usuario)) g.membros.push(usuario);
    return okSilencioso(`"${usuario}" entrou no grupo "${grupo}". Confira com: aws iam get-group --group-name ${grupo}.`);
  },

  "get-group": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "group-name");
    const g = conta.iam.grupos[nome];
    if (!g) throw new ErroCli(`An error occurred (NoSuchEntity) when calling the GetGroup operation: The group with name ${nome} cannot be found.`);
    return js({
      Group: grupoJson(conta, nome, g),
      Users: g.membros.map((m) => {
        const u = conta.iam.usuarios[m];
        return u ? usuarioJson(conta, m, u) : { Path: "/", UserName: m, Arn: arnIam(conta, "user", m) };
      }),
    });
  },

  "attach-user-policy": (conta, pos, flags) => {
    const usuario = exigirFlag(flags, "user-name");
    const u = conta.iam.usuarios[usuario];
    if (!u) throw new ErroCli(`An error occurred (NoSuchEntity) when calling the AttachUserPolicy operation: The user with name ${usuario} cannot be found.`);
    const arn = exigirArnPolitica(flags);
    if (!u.politicas.includes(arn)) u.politicas.push(arn);
    return okSilencioso(`Política anexada ao usuário "${usuario}". Confira com: aws iam list-attached-user-policies --user-name ${usuario}.`);
  },

  "attach-group-policy": (conta, pos, flags) => {
    const grupo = exigirFlag(flags, "group-name");
    const g = conta.iam.grupos[grupo];
    if (!g) throw new ErroCli(`An error occurred (NoSuchEntity) when calling the AttachGroupPolicy operation: The group with name ${grupo} cannot be found.`);
    const arn = exigirArnPolitica(flags);
    if (!g.politicas.includes(arn)) g.politicas.push(arn);
    return okSilencioso(`Política anexada ao grupo "${grupo}".`);
  },

  "list-attached-user-policies": (conta, pos, flags) => {
    const usuario = exigirFlag(flags, "user-name");
    const u = conta.iam.usuarios[usuario];
    if (!u) throw new ErroCli(`An error occurred (NoSuchEntity): The user with name ${usuario} cannot be found.`);
    return js({ AttachedPolicies: u.politicas.map((arn) => ({ PolicyName: arn.split("/").pop(), PolicyArn: arn })) });
  },

  "create-role": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "role-name");
    if (conta.iam.roles[nome]) throw new ErroCli(`An error occurred (EntityAlreadyExists) when calling the CreateRole operation: Role with name ${nome} already exists.`);
    const doc = exigirFlag(flags, "assume-role-policy-document");
    let trustDoc;
    if (doc.startsWith("file://")) {
      if (!arquivoLocal(doc.slice(7))) throw new ErroCli(`Error parsing parameter '--assume-role-policy-document': Unable to load paramfile ${doc}: arquivo não existe. Digite 'ls' (existe um trust.json pronto).`);
      trustDoc = TRUST_PADRAO; // o trust.json pronto confia no serviço EC2
    } else {
      try { trustDoc = JSON.parse(doc); }
      catch (e) { throw new ErroCli("An error occurred (MalformedPolicyDocument) when calling the CreateRole operation: JSON strings must not have leading spaces / documento inválido."); }
    }
    conta.iam.roles[nome] = { criadoEm: agoraIso(), politicas: [], trust: doc, trustDoc, roleId: "AROA" + hexAleatorio(17).toUpperCase() };
    return js({ Role: roleJson(conta, nome, conta.iam.roles[nome]) });
  },

  "list-roles": (conta) => {
    return js({ Roles: Object.entries(conta.iam.roles).map(([nome, r]) => roleJson(conta, nome, r)) });
  },

  "attach-role-policy": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "role-name");
    const r = conta.iam.roles[nome];
    if (!r) throw new ErroCli(`An error occurred (NoSuchEntity) when calling the AttachRolePolicy operation: The role with name ${nome} cannot be found.`);
    const arn = exigirArnPolitica(flags);
    if (!r.politicas.includes(arn)) r.politicas.push(arn);
    return "";
  },

  // ----- Políticas gerenciadas pelo cliente (customer managed) -----
  "create-policy": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "policy-name");
    if (conta.iam.policies[nome]) throw new ErroCli(`An error occurred (EntityAlreadyExists) when calling the CreatePolicy operation: A policy called ${nome} already exists.`);
    const doc = exigirFlag(flags, "policy-document");
    let documento;
    if (doc.startsWith("file://")) {
      if (!arquivoLocal(doc.slice(7))) throw new ErroCli(`Error parsing parameter '--policy-document': Unable to load paramfile ${doc}: arquivo não existe. Digite 'ls' (existe um politica-publica.json pronto).`);
      documento = { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "s3:*", Resource: "*" }] };
    } else {
      try { documento = JSON.parse(doc); }
      catch (e) { throw new ErroCli("An error occurred (MalformedPolicyDocument) when calling the CreatePolicy operation: o documento precisa ser JSON válido."); }
    }
    conta.iam.policies[nome] = {
      nome,
      arn: arnIam(conta, "policy", nome),
      scope: "Local",
      defaultVersionId: "v1",
      policyId: "ANPA" + hexAleatorio(17).toUpperCase(),
      criadoEm: agoraIso(),
      versions: { v1: { documento, criadoEm: agoraIso() } },
    };
    return js({ Policy: politicaJson(conta, conta.iam.policies[nome]) });
  },

  "list-policies": (conta, pos, flags) => {
    const escopo = typeof flags.scope === "string" ? flags.scope : "All";
    if (!["Local", "AWS", "All"].includes(escopo)) throw new ErroCli(`An error occurred (ValidationError) when calling the ListPolicies operation: --scope precisa ser Local, AWS ou All (recebido '${escopo}').`);
    const locais = Object.values(conta.iam.policies).map((p) => politicaJson(conta, p));
    const awsManaged = POLITICAS_AWS.map((n) => {
      const arn = `arn:aws:iam::aws:policy/${n}`;
      return {
        PolicyName: n,
        PolicyId: idEstavelIam("ANPA", n),
        Arn: arn,
        Path: "/",
        DefaultVersionId: "v1",
        AttachmentCount: contarAnexos(conta, arn),
        IsAttachable: true,
        CreateDate: "2015-02-06T18:39:00+00:00",
        UpdateDate: "2015-02-06T18:39:00+00:00",
      };
    });
    let lista = [];
    if (escopo === "Local") lista = locais;
    else if (escopo === "AWS") lista = awsManaged;
    else lista = [...locais, ...awsManaged];
    return js({ Policies: lista });
  },

  "get-policy": (conta, pos, flags) => {
    const p = exigirPolitica(conta, flags, "GetPolicy");
    return js({ Policy: politicaJson(conta, p) });
  },

  "list-policy-versions": (conta, pos, flags) => {
    const p = exigirPolitica(conta, flags, "ListPolicyVersions");
    return js({
      Versions: Object.entries(p.versions).map(([vid, v]) => ({
        VersionId: vid,
        IsDefaultVersion: vid === p.defaultVersionId,
        CreateDate: v.criadoEm,
      })),
    });
  },

  "get-policy-version": (conta, pos, flags) => {
    const p = exigirPolitica(conta, flags, "GetPolicyVersion");
    const vid = exigirFlag(flags, "version-id");
    const v = p.versions[vid];
    if (!v) throw new ErroCli(`An error occurred (NoSuchEntity) when calling the GetPolicyVersion operation: Policy ${p.arn} version ${vid} does not exist or is not attachable.`);
    return js({ PolicyVersion: { Document: v.documento, VersionId: vid, IsDefaultVersion: vid === p.defaultVersionId, CreateDate: v.criadoEm } });
  },

  "create-policy-version": (conta, pos, flags) => {
    const p = exigirPolitica(conta, flags, "CreatePolicyVersion");
    const doc = exigirFlag(flags, "policy-document");
    let documento;
    if (doc.startsWith("file://")) {
      if (!arquivoLocal(doc.slice(7))) throw new ErroCli(`Error parsing parameter '--policy-document': Unable to load paramfile ${doc}: arquivo não existe.`);
      documento = { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "s3:*", Resource: "*" }] };
    } else {
      try { documento = JSON.parse(doc); }
      catch (e) { throw new ErroCli("An error occurred (MalformedPolicyDocument) when calling the CreatePolicyVersion operation: JSON inválido."); }
    }
    const num = Object.keys(p.versions).length + 1;
    const vid = "v" + num;
    p.versions[vid] = { documento, criadoEm: agoraIso() };
    if (flags["set-as-default"] !== undefined) { p.defaultVersionId = vid; p.atualizadoEm = agoraIso(); }
    return js({ PolicyVersion: { VersionId: vid, IsDefaultVersion: vid === p.defaultVersionId, CreateDate: p.versions[vid].criadoEm } });
  },

  "delete-policy": (conta, pos, flags) => {
    const p = exigirPolitica(conta, flags, "DeletePolicy");
    delete conta.iam.policies[p.nome];
    return okSilencioso(`Política "${p.nome}" apagada.`);
  },

  // ----- Desanexar e remover (gestão / faxina) -----
  "detach-user-policy": (conta, pos, flags) => {
    const u = conta.iam.usuarios[exigirFlag(flags, "user-name")];
    if (!u) throw new ErroCli("An error occurred (NoSuchEntity) when calling the DetachUserPolicy operation: o usuário não existe.");
    const arn = exigirArnPolitica(flags);
    u.politicas = u.politicas.filter((a) => a !== arn);
    return okSilencioso("Política desanexada do usuário.");
  },

  "detach-group-policy": (conta, pos, flags) => {
    const g = conta.iam.grupos[exigirFlag(flags, "group-name")];
    if (!g) throw new ErroCli("An error occurred (NoSuchEntity) when calling the DetachGroupPolicy operation: o grupo não existe.");
    const arn = exigirArnPolitica(flags);
    g.politicas = g.politicas.filter((a) => a !== arn);
    return okSilencioso("Política desanexada do grupo.");
  },

  "detach-role-policy": (conta, pos, flags) => {
    const r = conta.iam.roles[exigirFlag(flags, "role-name")];
    if (!r) throw new ErroCli("An error occurred (NoSuchEntity) when calling the DetachRolePolicy operation: a role não existe.");
    const arn = exigirArnPolitica(flags);
    r.politicas = r.politicas.filter((a) => a !== arn);
    return okSilencioso("Política desanexada da role.");
  },

  "remove-user-from-group": (conta, pos, flags) => {
    const usuario = exigirFlag(flags, "user-name");
    const g = conta.iam.grupos[exigirFlag(flags, "group-name")];
    if (!g) throw new ErroCli("An error occurred (NoSuchEntity) when calling the RemoveUserFromGroup operation: o grupo não existe.");
    g.membros = g.membros.filter((m) => m !== usuario);
    return okSilencioso(`"${usuario}" removido do grupo.`);
  },

  "delete-group": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "group-name");
    const g = conta.iam.grupos[nome];
    if (!g) throw new ErroCli(`An error occurred (NoSuchEntity) when calling the DeleteGroup operation: The group with name ${nome} cannot be found.`);
    if (g.membros.length) throw new ErroCli(`An error occurred (DeleteConflict) when calling the DeleteGroup operation: Cannot delete entity, must remove users from group first. Use remove-user-from-group antes.`);
    delete conta.iam.grupos[nome];
    return okSilencioso(`Grupo "${nome}" apagado.`);
  },

  "delete-role": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "role-name");
    if (!conta.iam.roles[nome]) throw new ErroCli(`An error occurred (NoSuchEntity) when calling the DeleteRole operation: Role ${nome} cannot be found.`);
    delete conta.iam.roles[nome];
    return okSilencioso(`Role "${nome}" apagada.`);
  },
};

// Acha uma política (gerenciada pelo cliente) pelo --policy-arn.
function exigirPolitica(conta, flags, operacao) {
  const arn = exigirFlag(flags, "policy-arn");
  const p = Object.values(conta.iam.policies).find((x) => x.arn === arn);
  if (!p) throw new ErroCli(`An error occurred (NoSuchEntity) when calling the ${operacao} operation: Policy ${arn} does not exist or is not attachable.\nDica: pegue o ARN certo com 'aws iam list-policies --scope Local'.`);
  return p;
}

// ---------- Lambda ----------
const RUNTIMES = ["python3.11", "python3.12", "python3.13", "nodejs18.x", "nodejs20.x", "nodejs22.x", "java21", "ruby3.3", "go1.x"];

function exigirFuncao(conta, flags, operacao) {
  const nome = exigirFlag(flags, "function-name");
  const f = conta.lambda.funcoes[nome];
  if (!f) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the ${operacao} operation: Function not found: arn:aws:lambda:us-east-1:123456789012:function:${nome}`);
  return f;
}

function parsearEnvironment(str) {
  const m = /^Variables=\{(.*)\}$/.exec(String(str));
  if (!m) throw new ErroCli("Error parsing parameter '--environment': formato esperado: Variables={CHAVE=valor,OUTRA=valor}");
  const vars = {};
  if (m[1].trim()) {
    for (const par of m[1].split(",")) {
      const i = par.indexOf("=");
      if (i < 0) throw new ErroCli(`Error parsing parameter '--environment': par inválido '${par}'`);
      vars[par.slice(0, i).trim()] = par.slice(i + 1).trim();
    }
  }
  return vars;
}

function funcaoJson(conta, nome, f) {
  const j = {
    FunctionName: nome,
    FunctionArn: `arn:aws:lambda:${conta.regiao}:${conta.contaId}:function:${nome}`,
    Runtime: f.runtime,
    Role: f.role,
    Handler: f.handler,
    Timeout: f.timeout,
    MemorySize: f.memoria,
  };
  // Fiel à AWS: o campo Environment só aparece quando há variáveis definidas.
  if (f.env && Object.keys(f.env).length) j.Environment = { Variables: f.env };
  j.State = "Active";
  j.LastModified = f.criadaEm;
  return j;
}

const cmdLambda = {
  "create-function": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "function-name");
    if (conta.lambda.funcoes[nome]) throw new ErroCli(`An error occurred (ResourceConflictException) when calling the CreateFunction operation: Function already exist: ${nome}`);
    const runtime = exigirFlag(flags, "runtime");
    if (!RUNTIMES.includes(runtime)) throw new ErroCli(`An error occurred (InvalidParameterValueException) when calling the CreateFunction operation: Value '${runtime}' at 'runtime' failed to satisfy constraint.\nRuntimes aceitos no simulador: ${RUNTIMES.join(", ")}`);
    const role = exigirFlag(flags, "role");
    if (!/^arn:aws:iam::\d{12}:role\/.+$/.test(role)) throw new ErroCli(`An error occurred (ValidationException) when calling the CreateFunction operation: '${role}' failed to satisfy constraint: Role ARN inválido.\nEx.: arn:aws:iam::123456789012:role/papel-lambda`);
    const handler = exigirFlag(flags, "handler");
    const zip = exigirFlag(flags, "zip-file");
    if (!zip.startsWith("fileb://") || !arquivoLocal(zip.slice(8))) {
      throw new ErroCli(`Error parsing parameter '--zip-file': use fileb://<arquivo.zip> com um arquivo que existe. Digite 'ls' (existe um app.zip pronto).`);
    }
    conta.lambda.funcoes[nome] = { runtime, role, handler, timeout: 3, memoria: 128, env: {}, invocada: false, criadaEm: agoraIso() };
    return js(funcaoJson(conta, nome, conta.lambda.funcoes[nome]));
  },

  "list-functions": (conta) => {
    return js({ Functions: Object.entries(conta.lambda.funcoes).map(([nome, f]) => funcaoJson(conta, nome, f)) });
  },

  "get-function": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "function-name");
    const f = exigirFuncao(conta, flags, "GetFunction");
    return js({ Configuration: funcaoJson(conta, nome, f) });
  },

  invoke: (conta, pos, flags) => {
    const f = exigirFuncao(conta, flags, "Invoke");
    if (!pos[0]) throw new ErroCli("uso: aws lambda invoke --function-name <nome> <arquivo-de-saida>\nEx.: aws lambda invoke --function-name ola-mundo saida.json");
    f.invocada = true;
    avisarClimb(`A resposta da função foi gravada no arquivo "${pos[0]}" — é lá que sai o retorno da Lambda. O StatusCode 200 acima só diz que a invocação deu certo.`);
    return js({ StatusCode: 200, ExecutedVersion: "$LATEST" });
  },

  "update-function-configuration": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "function-name");
    const f = exigirFuncao(conta, flags, "UpdateFunctionConfiguration");
    if (flags.timeout !== undefined) {
      const t = parseInt(flags.timeout, 10);
      if (!(t >= 1 && t <= 900)) throw new ErroCli("An error occurred (ValidationException): --timeout precisa estar entre 1 e 900 segundos.");
      f.timeout = t;
    }
    if (flags["memory-size"] !== undefined) {
      const m = parseInt(flags["memory-size"], 10);
      if (!(m >= 128 && m <= 10240)) throw new ErroCli("An error occurred (ValidationException): --memory-size precisa estar entre 128 e 10240 MB.");
      f.memoria = m;
    }
    if (flags.environment !== undefined) {
      f.env = parsearEnvironment(flags.environment);
    }
    return js(funcaoJson(conta, nome, f));
  },

  "delete-function": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "function-name");
    exigirFuncao(conta, flags, "DeleteFunction");
    delete conta.lambda.funcoes[nome];
    return okSilencioso(`Função "${nome}" apagada.`);
  },
};

// ---------- DynamoDB ----------
function exigirTabela(conta, flags, operacao) {
  const nome = exigirFlag(flags, "table-name");
  const t = conta.dynamodb.tabelas[nome];
  if (!t) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the ${operacao} operation: Requested resource not found: Table: ${nome} not found`);
  return t;
}

function chaveHash(tabela) {
  return tabela.esquema.find((k) => k.KeyType === "HASH").AttributeName;
}

function tabelaJson(conta, nome, t, status) {
  return {
    TableName: nome,
    TableStatus: status,
    AttributeDefinitions: t.defs,
    KeySchema: t.esquema,
    BillingModeSummary: { BillingMode: t.cobranca },
    ItemCount: t.itens.length,
    TableArn: `arn:aws:dynamodb:${conta.regiao}:${conta.contaId}:table/${nome}`,
    CreationDateTime: t.criadaEm,
  };
}

const cmdDynamo = {
  "create-table": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "table-name");
    if (String(nome).length < 3) {
      throw new ErroCli(`An error occurred (ValidationException) when calling the CreateTable operation: 1 validation error detected: Value '${nome}' at 'tableName' failed to satisfy constraint: Member must have length greater than or equal to 3`);
    }
    if (conta.dynamodb.tabelas[nome]) throw new ErroCli(`An error occurred (ResourceInUseException) when calling the CreateTable operation: Table already exists: ${nome}`);
    const defsBrutas = flags["attribute-definitions"];
    if (defsBrutas === undefined || defsBrutas === true) throw new ErroCli("aws: error: the following arguments are required: --attribute-definitions");
    const esquemaBruto = flags["key-schema"];
    if (esquemaBruto === undefined || esquemaBruto === true) throw new ErroCli("aws: error: the following arguments are required: --key-schema");
    const defs = [].concat(defsBrutas).map(parsearShorthand);
    const esquema = [].concat(esquemaBruto).map(parsearShorthand);
    for (const d of defs) {
      if (!d.AttributeName || !["S", "N", "B"].includes(d.AttributeType)) {
        throw new ErroCli("An error occurred (ValidationException): attribute-definitions precisa de AttributeName=<nome>,AttributeType=<S|N|B>");
      }
    }
    for (const k of esquema) {
      if (!k.AttributeName || !["HASH", "RANGE"].includes(k.KeyType)) {
        throw new ErroCli("An error occurred (ValidationException): key-schema precisa de AttributeName=<nome>,KeyType=<HASH|RANGE>");
      }
      if (!defs.some((d) => d.AttributeName === k.AttributeName)) {
        throw new ErroCli(`An error occurred (ValidationException) when calling the CreateTable operation: One or more parameter values were invalid: Some index key attributes are not defined in AttributeDefinitions. Keys: [${k.AttributeName}]`);
      }
    }
    if (!esquema.some((k) => k.KeyType === "HASH")) throw new ErroCli("An error occurred (ValidationException): o key-schema precisa de pelo menos uma chave KeyType=HASH.");
    let cobranca;
    if (flags["billing-mode"] === "PAY_PER_REQUEST") cobranca = "PAY_PER_REQUEST";
    else if (typeof flags["provisioned-throughput"] === "string") cobranca = "PROVISIONED";
    else throw new ErroCli("An error occurred (ValidationException): informe --billing-mode PAY_PER_REQUEST ou --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5");
    conta.dynamodb.tabelas[nome] = { defs, esquema, cobranca, itens: [], criadaEm: agoraIso() };
    return js({ TableDescription: tabelaJson(conta, nome, conta.dynamodb.tabelas[nome], "CREATING") });
  },

  "list-tables": (conta) => {
    return js({ TableNames: Object.keys(conta.dynamodb.tabelas) });
  },

  "describe-table": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "table-name");
    const t = exigirTabela(conta, flags, "DescribeTable");
    return js({ Table: tabelaJson(conta, nome, t, "ACTIVE") });
  },

  "put-item": (conta, pos, flags) => {
    const t = exigirTabela(conta, flags, "PutItem");
    const nomeTabela = exigirFlag(flags, "table-name");
    const item = parsearJsonFlag(flags, "item");
    const hash = chaveHash(t);
    if (!item[hash]) throw new ErroCli(`An error occurred (ValidationException) when calling the PutItem operation: One or more parameter values were invalid: Missing the key ${hash} in the item`);
    const chave = JSON.stringify(item[hash]);
    t.itens = t.itens.filter((i) => JSON.stringify(i[hash]) !== chave);
    t.itens.push(item);
    return okSilencioso(`Item gravado na tabela. Confira com: aws dynamodb scan --table-name ${nomeTabela}.`);
  },

  "get-item": (conta, pos, flags) => {
    const t = exigirTabela(conta, flags, "GetItem");
    const chave = parsearJsonFlag(flags, "key");
    const hash = chaveHash(t);
    if (!chave[hash]) throw new ErroCli(`An error occurred (ValidationException) when calling the GetItem operation: The provided key element does not match the schema (esperado: ${hash})`);
    const alvo = JSON.stringify(chave[hash]);
    const item = t.itens.find((i) => JSON.stringify(i[hash]) === alvo);
    if (!item) {
      avisarClimb("Nenhum item com essa chave. A AWS não retorna nada no get-item quando o item não existe (a resposta vem sem o campo \"Item\") — por isso o terminal fica em branco.");
      return "";
    }
    return js({ Item: item });
  },

  scan: (conta, pos, flags) => {
    const t = exigirTabela(conta, flags, "Scan");
    return js({ Items: t.itens, Count: t.itens.length, ScannedCount: t.itens.length });
  },

  "delete-table": (conta, pos, flags) => {
    const nome = exigirFlag(flags, "table-name");
    const t = exigirTabela(conta, flags, "DeleteTable");
    delete conta.dynamodb.tabelas[nome];
    return js({ TableDescription: tabelaJson(conta, nome, t, "DELETING") });
  },
};

// ---------- STS ----------
const cmdSts = {
  "get-caller-identity": (conta) => {
    return js({ UserId: "AIDAEXEMPLO1234567890", Account: conta.contaId, Arn: `arn:aws:iam::${conta.contaId}:user/estudante` });
  },
};

// ---------- Registro de serviços ----------
const SERVICOS = {
  s3: cmdS3,
  s3api: cmdS3api,
  ec2: cmdEc2,
  iam: cmdIam,
  lambda: cmdLambda,
  dynamodb: cmdDynamo,
  sts: cmdSts,
};

// ---------- --query (JMESPath enxuto) e --output ----------
// Suporta o essencial pro curso: caminhos com ponto, [*] / [], índice [n]
// e filtro [?Campo=='valor']. Acessar um campo numa lista mapeia sobre ela.
function consultaJmes(valor, expr) {
  for (const seg of String(expr).split(".")) {
    const m = /^([A-Za-z_]\w*)?(.*)$/.exec(seg);
    const id = m[1];
    let resto = m[2];
    if (id) valor = acessar(valor, id);
    let br;
    const reBr = /\[([^\]]*)\]/g;
    while ((br = reBr.exec(resto))) {
      const dentro = br[1];
      if (dentro === "*" || dentro === "") {
        // projeção: mantém a lista como está
      } else if (/^\?/.test(dentro)) {
        // o valor pode chegar com ou sem aspas (o tokenizer já as remove)
        const f = /^\?\s*([A-Za-z_]\w*)\s*==\s*(.+?)\s*$/.exec(dentro);
        if (f && Array.isArray(valor)) {
          const alvo = f[2].replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1");
          valor = valor.filter((v) => v && String(v[f[1]]) === alvo);
        }
      } else if (/^\d+$/.test(dentro)) {
        valor = Array.isArray(valor) ? valor[parseInt(dentro, 10)] : undefined;
      }
    }
  }
  return valor;
}

function acessar(valor, id) {
  if (Array.isArray(valor)) return valor.map((v) => (v == null ? null : v[id]));
  if (valor && typeof valor === "object") return valor[id];
  return undefined;
}

function formatarTexto(valor) {
  if (valor == null) return "None";
  if (Array.isArray(valor)) {
    return valor
      .map((v) => (v && typeof v === "object" ? Object.values(v).join("\t") : String(v)))
      .join("\n");
  }
  if (typeof valor === "object") return Object.values(valor).join("\t");
  return String(valor);
}

function aplicarQueryEOutput(saida, flags) {
  let valor;
  try { valor = JSON.parse(saida); }
  catch (e) { return saida; } // saída não-JSON (texto puro): deixa como está
  if (typeof flags.query === "string") valor = consultaJmes(valor, flags.query);
  const formato = typeof flags.output === "string" ? flags.output : "json";
  if (formato === "text") return formatarTexto(valor);
  return js(valor);
}

// ---------- Dispatcher principal ----------
// Wrapper: trata o redirecionamento ">" (salva a saída num arquivo virtual)
// e delega a execução do comando AWS pro executarComandoAwsBase.
function executarComandoAws(conta, linha) {
  normalizarConta(conta); // blinda contra contas antigas sem algum campo
  let alvo = null;
  const m = /\s>\s*([^\s>|]+)\s*$/.exec(linha);
  if (m) {
    alvo = m[1];
    linha = linha.slice(0, m.index);
  }
  const r = executarComandoAwsBase(conta, linha);
  if (alvo && r.ok) {
    conta.arquivosSalvos = conta.arquivosSalvos || {};
    conta.arquivosSalvos[alvo] = r.saida;
    return { ok: true, saida: `(saída salva em ${alvo})`, cmd: r.cmd, aviso: r.aviso };
  }
  return r;
}

// Retorna { ok, saida, cmd } — cmd é o comando parseado (ou null).
function executarComandoAwsBase(conta, linha) {
  let tokens;
  try {
    tokens = tokenizar(linha);
  } catch (e) {
    return { ok: false, saida: e.message, cmd: null };
  }
  if (!tokens.length) return { ok: true, saida: "", cmd: null };
  if (tokens[0] !== "aws") {
    return { ok: false, saida: `${tokens[0]}: comando não encontrado. Este terminal executa 'aws ...' e os utilitários: help, ls, clear.`, cmd: null };
  }

  // Manuais: qualquer comando terminando em "help"
  if (tokens[tokens.length - 1] === "help") {
    const caminho = tokens.slice(1, -1).join(".");
    return { ok: true, saida: obterManual(caminho), cmd: { servico: "help", sub: caminho, posicionais: [], flags: {} } };
  }

  if (tokens.length === 1) {
    return { ok: false, saida: "uso: aws <serviço> <comando> [opções]\nDigite 'aws help' para ver os serviços disponíveis.", cmd: null };
  }

  const servico = tokens[1];
  if (servico === "configure") {
    return { ok: true, saida: "Simulador: suas credenciais já estão configuradas no perfil 'quest'. Pode mandar os comandos direto. 😉", cmd: { servico: "configure", sub: null, posicionais: [], flags: {} } };
  }

  const ops = SERVICOS[servico];
  if (!ops) {
    return { ok: false, saida: `aws: error: argument command: Invalid choice: '${servico}'\nServiços disponíveis no simulador: ${Object.keys(SERVICOS).join(", ")}\nDigite 'aws help' para detalhes.`, cmd: null };
  }

  const sub = tokens[2];
  if (!sub) {
    return { ok: false, saida: `uso: aws ${servico} <comando> [opções]\nDigite 'aws ${servico} help' para ver os comandos.`, cmd: null };
  }

  const handler = ops[sub];
  if (!handler) {
    return { ok: false, saida: `Invalid choice: '${sub}'\nComandos de '${servico}' no simulador: ${Object.keys(ops).join(", ")}\nDigite 'aws ${servico} help' para os manuais.`, cmd: null };
  }

  const { posicionais, flags } = parsearArgs(tokens.slice(3));
  const cmd = { servico, sub, posicionais, flags, linha };
  _avisoClimb = null; // zera antes de cada handler (ele pode chamar avisarClimb)
  try {
    let saida = handler(conta, posicionais, flags);
    if (flags.query !== undefined || flags.output !== undefined) {
      saida = aplicarQueryEOutput(saida, flags);
    }
    return { ok: true, saida, cmd, aviso: _avisoClimb };
  } catch (e) {
    if (e instanceof ErroCli) return { ok: false, saida: e.message, cmd, aviso: _avisoClimb };
    return { ok: false, saida: "Erro interno do simulador: " + e.message, cmd };
  }
}
