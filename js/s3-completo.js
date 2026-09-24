"use strict";
// ============================================================
// CLImb — s3-completo.js
// Fecha o `aws s3` (alto nivel) e engorda o `aws s3api` (baixo nivel).
//
// O `aws s3` tinha 7 dos 9 comandos reais — faltavam `mv` e `presign`, e o
// presign e uma das coisas mais uteis que existem: link temporario pra um
// arquivo privado, sem tornar o bucket publico. Com este arquivo o `aws s3`
// fica **100% coberto**.
//
// O `s3api` tinha 6 de 113, e e nele que mora tudo que aparece em vaga e em
// auditoria (ver [[trilhas-por-profissao]] no vault):
//
//   PUBLIC ACCESS BLOCK — o item numero um de todo vazamento de S3 noticiado.
//        Hoje a AWS ja liga por padrao; saber conferir e desligar conscientemente
//        e o que separa quem entende de quem repete tutorial.
//   CICLO DE VIDA — mover sozinho pra classe mais barata e apagar o que
//        venceu. E a maior economia de S3 que existe, e quase ninguem configura.
//   CRIPTOGRAFIA padrao do bucket, exigida em qualquer auditoria.
//   VERSIONAMENTO de verdade: `list-object-versions` mostra que "apagar" com
//        versionamento ligado nao apaga nada — cria um delete marker.
//   HEAD — a consulta barata: existe? qual o tamanho? sem baixar o arquivo.
//   DELETE-OBJECTS em lote, COPY-OBJECT (copia sem baixar) e RESTORE-OBJECT
//        (tirar do Glacier, que leva horas e cobra a parte).
//
// CARREGA DEPOIS de desafios.js e desafios-pratica.js.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.s3api) return;

  const REGIAO = (c) => c.regiao || "us-east-1";

  function bucketDe(conta, flags, op) {
    conta.s3 = conta.s3 || { buckets: {} };
    const nome = String(exigirFlag(flags, "bucket"));
    const b = conta.s3.buckets[nome];
    if (!b) {
      throw new ErroCli(
        "An error occurred (NoSuchBucket) when calling the " + op + " operation: The specified bucket does not exist\n" +
        "Crie antes com: aws s3 mb s3://" + nome
      );
    }
    b.objetos = b.objetos || {};
    b.tags = b.tags || {};
    b.versoes = b.versoes || {};
    return [nome, b];
  }
  // Os documentos do s3api sao JSON ou shorthand aninhado, e o tokenizer do
  // simulador come as aspas pelo caminho. A leitura e TOLERANTE: tenta o JSON
  // e, se nao der, pesca os campos que importam. A forma mostrada ao aluno
  // continua sendo a REAL.
  function campo(texto, nome) {
    const m = String(texto).match(new RegExp(nome + "[^A-Za-z0-9_-]+([A-Za-z0-9_./:-]+)"));
    return m ? m[1] : "";
  }
  function bool(texto, nome) {
    return new RegExp(nome + "[^A-Za-z]+true", "i").test(String(texto));
  }

  const CLASSES = ["STANDARD", "STANDARD_IA", "ONEZONE_IA", "INTELLIGENT_TIERING", "GLACIER", "GLACIER_IR", "DEEP_ARCHIVE"];

  Object.assign(SERVICOS.s3api, {
    // ---------- o bloqueio que evita a manchete ----------
    "put-public-access-block": (conta, pos, flags) => {
      const [nome, b] = bucketDe(conta, flags, "PutPublicAccessBlock");
      const cfg = [String(exigirFlag(flags, "public-access-block-configuration"))]
        .concat((pos || []).map(String)).join(" ");
      b.bloqueio = {
        BlockPublicAcls: bool(cfg, "BlockPublicAcls"),
        IgnorePublicAcls: bool(cfg, "IgnorePublicAcls"),
        BlockPublicPolicy: bool(cfg, "BlockPublicPolicy"),
        RestrictPublicBuckets: bool(cfg, "RestrictPublicBuckets"),
      };
      const todos = Object.values(b.bloqueio).every(Boolean);
      avisarClimb(
        todos
          ? "As quatro travas ligadas: nem ACL nem política conseguem tornar \"" + nome + "\" público, mesmo que alguém tente. É o item número um de todo vazamento de S3 que virou noticia."
          : "ATENÇÃO: alguma trava ficou DESLIGADA. Isso é escolha válida (site estático precisa disso), mas só vale se for consciente — o padrão da AWS hoje e ligar as quatro."
      );
      return okSilencioso("Bloqueio de acesso público ajustado em \"" + nome + "\".");
    },
    "get-public-access-block": (conta, pos, flags) => {
      const [nome, b] = bucketDe(conta, flags, "GetPublicAccessBlock");
      if (!b.bloqueio) {
        throw new ErroCli(
          "An error occurred (NoSuchPublicAccessBlockConfiguration) when calling the GetPublicAccessBlock operation: The public access block configuration was not found\n" +
          "Bucket sem bloqueio configurado e achado de auditoria. Configure com: aws s3api put-public-access-block --bucket " + nome + " --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
        );
      }
      return js({ PublicAccessBlockConfiguration: b.bloqueio });
    },

    // ---------- ciclo de vida: a maior economia de S3 ----------
    "put-bucket-lifecycle-configuration": (conta, pos, flags) => {
      const [nome, b] = bucketDe(conta, flags, "PutBucketLifecycleConfiguration");
      const doc = [String(exigirFlag(flags, "lifecycle-configuration"))]
        .concat((pos || []).map(String)).join(" ");
      const classe = campo(doc, "StorageClass");
      const dias = campo(doc, "Days");
      const prefixo = campo(doc, "Prefix");
      if (classe && CLASSES.indexOf(classe) < 0) {
        throw new ErroCli(
          "An error occurred (MalformedXML) when calling the PutBucketLifecycleConfiguration operation: classe de armazenamento inválida: " + classe + ".\n" +
          "Validas: " + CLASSES.join(", ")
        );
      }
      if (!dias) {
        throw new ErroCli(
          "An error occurred (MalformedXML) when calling the PutBucketLifecycleConfiguration operation: a regra precisa de Days.\n" +
          "Forma: --lifecycle-configuration '{\"Rules\":[{\"ID\":\"arquivar\",\"Status\":\"Enabled\",\"Filter\":{\"Prefix\":\"logs/\"},\"Transitions\":[{\"Days\":30,\"StorageClass\":\"GLACIER\"}]}]}'"
        );
      }
      b.cicloVida = { id: campo(doc, "ID") || "regra-1", dias: Number(dias), classe: classe || "GLACIER", prefixo: prefixo, expira: /Expiration/i.test(doc) };
      avisarClimb(
        "Agora o que está em \"" + (prefixo || "todo o bucket") + "\" desce sozinho pra " + (classe || "GLACIER") + " depois de " + dias + " dias. " +
        "É a maior economia de S3 que existe e quase ninguém configura: o arquivo continua lá, só custa uma fração — em troca de demorar mais pra ler."
      );
      return okSilencioso("Regra de ciclo de vida gravada em \"" + nome + "\".");
    },
    "get-bucket-lifecycle-configuration": (conta, pos, flags) => {
      const [, b] = bucketDe(conta, flags, "GetBucketLifecycleConfiguration");
      if (!b.cicloVida) {
        throw new ErroCli(
          "An error occurred (NoSuchLifecycleConfiguration) when calling the GetBucketLifecycleConfiguration operation: The lifecycle configuration does not exist\n" +
          "Sem regra de ciclo de vida, TUDO fica na classe mais cara pra sempre."
        );
      }
      const r = b.cicloVida;
      return js({ Rules: [{
        ID: r.id, Status: "Enabled",
        Filter: { Prefix: r.prefixo || "" },
        Transitions: [{ Days: r.dias, StorageClass: r.classe }],
      }] });
    },

    // ---------- criptografia padrão ----------
    "put-bucket-encryption": (conta, pos, flags) => {
      const [nome, b] = bucketDe(conta, flags, "PutBucketEncryption");
      const doc = [String(exigirFlag(flags, "server-side-encryption-configuration"))]
        .concat((pos || []).map(String)).join(" ");
      const alg = campo(doc, "SSEAlgorithm") || "AES256";
      if (["AES256", "aws:kms"].indexOf(alg) < 0 && alg !== "aws") {
        throw new ErroCli("An error occurred (InvalidArgument) when calling the PutBucketEncryption operation: algoritmo inválido: " + alg + ". Use AES256 ou aws:kms.");
      }
      b.criptografia = { algoritmo: alg === "aws" ? "aws:kms" : alg };
      avisarClimb(
        b.criptografia.algoritmo === "AES256"
          ? "AES256 e a chave gerenciada pela própria AWS (SSE-S3): liga e esquece, sem custo. Serve pra quase tudo."
          : "aws:kms usa uma chave SUA do KMS: dá pra auditar quem decifrou o que e revogar acesso ao conteúdo sem mexer no bucket. Custa por chamada."
      );
      return okSilencioso("Criptografia padrão ligada em \"" + nome + "\" (" + b.criptografia.algoritmo + ").");
    },
    "get-bucket-encryption": (conta, pos, flags) => {
      const [, b] = bucketDe(conta, flags, "GetBucketEncryption");
      if (!b.criptografia) {
        throw new ErroCli("An error occurred (ServerSideEncryptionConfigurationNotFoundError) when calling the GetBucketEncryption operation: The server side encryption configuration was not found");
      }
      return js({ ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: b.criptografia.algoritmo } }] } });
    },

    // ---------- versionamento de verdade ----------
    "list-object-versions": (conta, pos, flags) => {
      const [nome, b] = bucketDe(conta, flags, "ListObjectVersions");
      if (b.versionamento !== "Enabled") {
        avisarClimb("O versionamento deste bucket não está ligado, então só existe uma versão de cada objeto. Ligue com: aws s3api put-bucket-versioning --bucket " + nome + " --versioning-configuration Status=Enabled");
      }
      const versoes = [], marcadores = [];
      for (const [chave, obj] of Object.entries(b.objetos)) {
        versoes.push({ Key: chave, VersionId: obj.versao || "null", IsLatest: true, Size: obj.tamanho, LastModified: obj.enviadoEm, StorageClass: obj.classe || "STANDARD" });
      }
      for (const [chave, v] of Object.entries(b.versoes)) {
        if (v.apagado) marcadores.push({ Key: chave, VersionId: v.versao, IsLatest: true });
      }
      if (!versoes.length && !marcadores.length) { avisarClimb("Bucket vazio."); return ""; }
      if (marcadores.length) {
        avisarClimb(
          "Repare nos DeleteMarkers: com versionamento ligado, apagar NÃO apaga. A AWS poe uma lápide por cima e o conteúdo continua lá — " +
          "e continua na fatura. É também por isso que dá pra desfazer: some a lápide e o arquivo volta."
        );
      }
      return js({ Versions: versoes, DeleteMarkers: marcadores });
    },

    // ---------- consultas baratas ----------
    "head-object": (conta, pos, flags) => {
      const [, b] = bucketDe(conta, flags, "HeadObject");
      const chave = String(exigirFlag(flags, "key"));
      const obj = b.objetos[chave];
      if (!obj) {
        throw new ErroCli(
          "An error occurred (404) when calling the HeadObject operation: Not Found\n" +
          "Repare: o head devolve só o CÓDIGO, sem mensagem — é assim mesmo na AWS. 404 é não existe, 403 é existe mas você não pode ver."
        );
      }
      avisarClimb("O head pergunta SEM baixar: tamanho, tipo e data. Num arquivo de 4 GB a diferença é entre um instante e a transferência inteira (que você paga).");
      return js({
        ContentLength: obj.tamanho, LastModified: obj.enviadoEm,
        ContentType: /\.(html|htm)$/.test(chave) ? "text/html" : (/\.json$/.test(chave) ? "application/json" : "binary/octet-stream"),
        ETag: "\"" + hexAleatorio(32) + "\"", StorageClass: obj.classe || "STANDARD",
        ServerSideEncryption: b.criptografia ? b.criptografia.algoritmo : undefined,
      });
    },
    "head-bucket": (conta, pos, flags) => {
      const [nome] = bucketDe(conta, flags, "HeadBucket");
      avisarClimb("Resposta vazia é SUCESSO aqui: o bucket existe e você tem acesso. É o teste de permissão mais barato que existe — em script, vale mais que qualquer list.");
      return okSilencioso("Bucket \"" + nome + "\" existe e está acessível.");
    },
    "get-bucket-location": (conta, pos, flags) => {
      bucketDe(conta, flags, "GetBucketLocation");
      const r = REGIAO(conta);
      avisarClimb("Região importa: transferência entre regiões CUSTA, e latência de bucket do outro lado do mundo aparece no tempo de resposta da sua aplicação.");
      return js({ LocationConstraint: r === "us-east-1" ? null : r });
    },

    // ---------- etiquetas do bucket ----------
    "put-bucket-tagging": (conta, pos, flags) => {
      const [nome, b] = bucketDe(conta, flags, "PutBucketTagging");
      const doc = [String(exigirFlag(flags, "tagging"))].concat((pos || []).map(String)).join(" ");
      const pares = String(doc).match(/Key[^A-Za-z0-9]+([A-Za-z0-9_-]+)[^A-Za-z0-9]+Value[^A-Za-z0-9]+([A-Za-z0-9_.-]+)/g) || [];
      if (!pares.length) {
        throw new ErroCli(
          "An error occurred (MalformedXML) when calling the PutBucketTagging operation: nenhuma tag valida.\n" +
          "Forma: --tagging 'TagSet=[{Key=Time,Value=plataforma}]'"
        );
      }
      for (const p of pares) {
        const k = campo(p, "Key"), v = campo(p, "Value");
        if (k) b.tags[k] = v;
      }
      return okSilencioso("Bucket \"" + nome + "\" etiquetado: " + Object.keys(b.tags).join(", ") + ".");
    },
    "get-bucket-tagging": (conta, pos, flags) => {
      const [, b] = bucketDe(conta, flags, "GetBucketTagging");
      if (!Object.keys(b.tags).length) {
        throw new ErroCli("An error occurred (NoSuchTagSet) when calling the GetBucketTagging operation: The TagSet does not exist");
      }
      return js({ TagSet: Object.entries(b.tags).map(([k, v]) => ({ Key: k, Value: v })) });
    },

    // ---------- copiar, apagar em lote, restaurar ----------
    "copy-object": (conta, pos, flags) => {
      const [destino, bd] = bucketDe(conta, flags, "CopyObject");
      const chave = String(exigirFlag(flags, "key"));
      const origem = String(exigirFlag(flags, "copy-source"));
      const partes = origem.replace(/^\/+/, "").split("/");
      const bucketOrigem = partes.shift();
      const chaveOrigem = partes.join("/");
      const bo = (conta.s3.buckets || {})[bucketOrigem];
      if (!bo || !(bo.objetos || {})[chaveOrigem]) {
        throw new ErroCli(
          "An error occurred (NoSuchKey) when calling the CopyObject operation: The specified key does not exist.\n" +
          "O --copy-source e <bucket>/<chave>, sem s3:// na frente."
        );
      }
      const classe = flags["storage-class"] ? String(flags["storage-class"]) : undefined;
      if (classe && CLASSES.indexOf(classe) < 0) {
        throw new ErroCli("An error occurred (InvalidStorageClass) when calling the CopyObject operation: classe inválida: " + classe + ".");
      }
      bd.objetos[chave] = { tamanho: bo.objetos[chaveOrigem].tamanho, enviadoEm: typeof dataFormatada === "function" ? dataFormatada() : new Date().toISOString(), classe: classe };
      avisarClimb("A cópia acontece DENTRO da AWS: o arquivo não desce pra sua máquina e não sobe de novo. Em arquivo grande isso é a diferença entre segundos e horas — e entre pagar transferência ou não.");
      return js({ CopyObjectResult: { ETag: "\"" + hexAleatorio(32) + "\"", LastModified: new Date().toISOString() } });
    },
    "delete-objects": (conta, pos, flags) => {
      const [nome, b] = bucketDe(conta, flags, "DeleteObjects");
      const doc = [String(exigirFlag(flags, "delete"))].concat((pos || []).map(String)).join(" ");
      const chaves = (String(doc).match(/Key[^A-Za-z0-9]+([A-Za-z0-9_./-]+)/g) || [])
        .map((p) => campo(p, "Key")).filter(Boolean);
      if (!chaves.length) {
        throw new ErroCli(
          "An error occurred (MalformedXML) when calling the DeleteObjects operation: nenhuma chave informada.\n" +
          "Forma: --delete 'Objects=[{Key=a.txt},{Key=b.txt}]'"
        );
      }
      const apagadas = [], erros = [];
      for (const k of chaves) {
        if (!b.objetos[k]) { erros.push({ Key: k, Code: "NoSuchKey", Message: "The specified key does not exist." }); continue; }
        delete b.objetos[k];
        if (b.versionamento === "Enabled") b.versoes[k] = { versao: hexAleatorio(16), apagado: true };
        apagadas.push({ Key: k, DeleteMarker: b.versionamento === "Enabled" });
      }
      avisarClimb("Até 1.000 chaves por chamada. Apagar uma a uma um bucket com milhoes de objetos levaria dias — e cada chamada é cobrada.");
      return js({ Deleted: apagadas, Errors: erros });
    },
    "restore-object": (conta, pos, flags) => {
      const [, b] = bucketDe(conta, flags, "RestoreObject");
      const chave = String(exigirFlag(flags, "key"));
      const obj = b.objetos[chave];
      if (!obj) throw new ErroCli("An error occurred (NoSuchKey) when calling the RestoreObject operation: The specified key does not exist.");
      if (String(obj.classe || "STANDARD").indexOf("GLACIER") < 0 && obj.classe !== "DEEP_ARCHIVE") {
        throw new ErroCli(
          "An error occurred (InvalidObjectState) when calling the RestoreObject operation: Restore is not allowed for the object's current storage class.\n" +
          "Só faz sentido restaurar o que está em GLACIER ou DEEP_ARCHIVE — o resto já está disponível."
        );
      }
      const dias = campo([String(exigirFlag(flags, "restore-request"))].concat((pos || []).map(String)).join(" "), "Days") || "1";
      obj.restaurando = Number(dias);
      avisarClimb(
        "Restaurar do Glacier NÃO e instantâneo: leva de minutos a horas, dependendo do modo. E a cópia fica disponível só por " + dias +
        (Number(dias) === 1 ? " dia" : " dias") + " — depois some de novo, e restaurar outra vez custa outra vez. Arquivo frio é barato pra guardar e caro pra ter pressa."
      );
      return okSilencioso("Restauracao de \"" + chave + "\" iniciada (" + dias + " dia(s) disponivel).");
    },
    "delete-bucket-policy": (conta, pos, flags) => {
      const [nome, b] = bucketDe(conta, flags, "DeleteBucketPolicy");
      if (!b.politica) throw new ErroCli("An error occurred (NoSuchBucketPolicy) when calling the DeleteBucketPolicy operation: The bucket policy does not exist");
      b.politica = null;
      avisarClimb("Política removida. Se ela era o que liberava o acesso público do site, o site caiu agora — confira antes de apagar política de bucket em produção.");
      return okSilencioso("Política do bucket \"" + nome + "\" removida.");
    },
  });

  // ---------- os dois que faltavam no alto nível ----------
  Object.assign(SERVICOS.s3, {
    mv: (conta, pos) => {
      conta.s3 = conta.s3 || { buckets: {} };
      const origem = String((pos || [])[0] || "");
      const destino = String((pos || [])[1] || "");
      if (!origem || !destino) {
        throw new ErroCli("usage: aws s3 mv <origem> <destino>\nEx.: aws s3 mv s3://meu-bucket/velho.txt s3://meu-bucket/novo.txt");
      }
      const parse = (u) => {
        const m = String(u).match(/^s3:\/\/([^/]+)\/?(.*)$/);
        return m ? { bucket: m[1], chave: m[2] } : null;
      };
      const o = parse(origem), dst = parse(destino);
      if (!o) throw new ErroCli("O `mv` do simulador move entre caminhos s3://. Origem inválida: " + origem);
      const bo = conta.s3.buckets[o.bucket];
      if (!bo || !(bo.objetos || {})[o.chave]) {
        throw new ErroCli("fatal error: An error occurred (404) when calling the HeadObject operation: Key \"" + o.chave + "\" does not exist");
      }
      if (!dst) throw new ErroCli("Destino invalido: " + destino);
      const bd = conta.s3.buckets[dst.bucket];
      if (!bd) throw new ErroCli("fatal error: An error occurred (NoSuchBucket) when calling the CopyObject operation: The specified bucket does not exist");
      const chaveFinal = dst.chave || o.chave;
      bd.objetos = bd.objetos || {};
      bd.objetos[chaveFinal] = bo.objetos[o.chave];
      delete bo.objetos[o.chave];
      avisarClimb("Não existe \"renomear\" no S3: o mv é uma cópia seguida de um apagar. Por isso renomear um arquivo de 5 GB não é instantâneo — e por isso o nome da chave importa desde o começo.");
      return "move: " + origem + " to " + destino;
    },
    presign: (conta, pos, flags) => {
      conta.s3 = conta.s3 || { buckets: {} };
      const uri = String((pos || [])[0] || "");
      const m = uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
      if (!m) throw new ErroCli("usage: aws s3 presign <s3://bucket/chave> [--expires-in <segundos>]");
      const b = conta.s3.buckets[m[1]];
      if (!b || !(b.objetos || {})[m[2]]) {
        throw new ErroCli("An error occurred (NoSuchKey): o objeto " + uri + " nao existe.");
      }
      const segundos = flags["expires-in"] !== undefined ? Number(flags["expires-in"]) : 3600;
      if (!(segundos > 0 && segundos <= 604800)) {
        throw new ErroCli("An error occurred: --expires-in precisa estar entre 1 e 604800 segundos (7 dias, o máximo da AWS).");
      }
      avisarClimb(
        "Isto resolve o problema mais comum do S3: dar um arquivo privado pra alguém SEM tornar o bucket público. " +
        "O link carrega a assinatura e morre em " + segundos + " segundos. Cuidado: quem tiver o link acessa — ele é o segredo."
      );
      return "https://" + m[1] + ".s3." + REGIAO(conta) + ".amazonaws.com/" + m[2] +
        "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=" + segundos +
        "&X-Amz-SignedHeaders=host&X-Amz-Signature=" + hexAleatorio(64);
    },
  });

  // ============================================================
  // MANUAIS
  // ============================================================
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => "USO\n    " + uso + "\n\n" + txt;
    Object.assign(MANUAIS, {
      "s3.mv": M(
        "aws s3 mv s3://meu-bucket/velho.txt s3://meu-bucket/novo.txt",
        "Move (ou renomeia) objeto.\n\nNÃO EXISTE \"renomear\" no S3: o mv é uma cópia seguida de um\napagar. Por isso renomear um arquivo de 5 GB não é instantâneo — e\npor isso o nome da chave importa desde o começo."),
      "s3.presign": M(
        "aws s3 presign s3://meu-bucket/relatorio.pdf --expires-in 900",
        "Gera um link temporário assinado pro objeto.\n\nResolve o problema mais comum do S3: entregar um arquivo privado a\nalguém SEM tornar o bucket público. O link carrega a assinatura e\nmorre no prazo (padrão 3600s, máximo 604800 = 7 dias).\n\nCUIDADO: quem tiver o link acessa. O link É o segredo."),
      "s3api.put-public-access-block": M(
        "aws s3api put-public-access-block --bucket meu-bucket \\\n        --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true",
        "As quatro travas contra exposição acidental. Com as quatro ligadas,\nnem ACL nem política conseguem tornar o bucket público — mesmo que\nalguém tente.\n\nÉ o item nº 1 de todo vazamento de S3 que virou notícia. Hoje a AWS\njá liga por padrão em bucket novo; desligar é escolha válida (site\nestático precisa), mas que seja consciente."),
      "s3api.get-public-access-block": M(
        "aws s3api get-public-access-block --bucket meu-bucket",
        "Mostra as quatro travas. Erro NoSuchPublicAccessBlockConfiguration\nquer dizer que não há bloqueio nenhum configurado — e isso é achado\nde auditoria."),
      "s3api.put-bucket-lifecycle-configuration": M(
        "aws s3api put-bucket-lifecycle-configuration --bucket meu-bucket \\\n        --lifecycle-configuration '{\"Rules\":[{\"ID\":\"arquivar\",\"Status\":\"Enabled\",\"Filter\":{\"Prefix\":\"logs/\"},\"Transitions\":[{\"Days\":30,\"StorageClass\":\"GLACIER\"}]}]}'",
        "Move sozinho pra classe mais barata (e/ou apaga o que venceu).\n\nÉ a maior economia de S3 que existe e quase ninguém configura: o\narquivo continua lá, só custa uma fração — em troca de demorar mais\npra ler.\n\nCLASSES: STANDARD, STANDARD_IA, ONEZONE_IA, INTELLIGENT_TIERING,\nGLACIER_IR, GLACIER, DEEP_ARCHIVE (do mais caro/rápido ao mais\nbarato/lento)."),
      "s3api.get-bucket-lifecycle-configuration": M(
        "aws s3api get-bucket-lifecycle-configuration --bucket meu-bucket",
        "Mostra as regras. Erro NoSuchLifecycleConfiguration quer dizer que\nTUDO fica na classe mais cara, pra sempre."),
      "s3api.put-bucket-encryption": M(
        "aws s3api put-bucket-encryption --bucket meu-bucket \\\n        --server-side-encryption-configuration '{\"Rules\":[{\"ApplyServerSideEncryptionByDefault\":{\"SSEAlgorithm\":\"AES256\"}}]}'",
        "Criptografia padrão do bucket: todo objeto novo entra cifrado.\n\nAES256   chave da própria AWS (SSE-S3): liga e esquece, sem custo\naws:kms  chave SUA do KMS: dá pra auditar quem decifrou o quê e\n         revogar acesso ao conteúdo sem mexer no bucket. Cobra por\n         chamada."),
      "s3api.get-bucket-encryption": M(
        "aws s3api get-bucket-encryption --bucket meu-bucket",
        "Mostra a criptografia padrão em vigor."),
      "s3api.list-object-versions": M(
        "aws s3api list-object-versions --bucket meu-bucket",
        "Todas as versões e os DELETE MARKERS.\n\nCom versionamento ligado, apagar NÃO apaga: a AWS põe uma lápide por\ncima e o conteúdo continua lá — e continua na fatura. É também por\nisso que dá pra desfazer: some a lápide e o arquivo volta."),
      "s3api.head-object": M(
        "aws s3api head-object --bucket meu-bucket --key relatorio.pdf",
        "Pergunta SEM baixar: tamanho, tipo, data, criptografia.\n\nNum arquivo de 4 GB a diferença é entre um instante e a\ntransferência inteira (que você paga).\n\nO head devolve só o CÓDIGO: 404 é não existe, 403 é existe mas você\nnão pode ver."),
      "s3api.head-bucket": M(
        "aws s3api head-bucket --bucket meu-bucket",
        "Resposta vazia é SUCESSO: o bucket existe e você tem acesso. É o\nteste de permissão mais barato que existe — em script vale mais que\nqualquer list."),
      "s3api.get-bucket-location": M(
        "aws s3api get-bucket-location --bucket meu-bucket",
        "Em qual região o bucket vive. Importa: transferência entre regiões\ncusta, e latência do outro lado do mundo aparece no tempo de\nresposta da aplicação.\n\nCuriosidade real: pra us-east-1 a resposta vem null."),
      "s3api.put-bucket-tagging": M(
        "aws s3api put-bucket-tagging --bucket meu-bucket --tagging 'TagSet=[{Key=Time,Value=plataforma}]'",
        "Etiqueta o bucket — é por aqui que o relatório de custo separa\nquanto cada time gasta em armazenamento.\n\nATENÇÃO: este comando SUBSTITUI o conjunto inteiro de tags. Não\nexiste \"adicionar uma\": leia as atuais, junte a nova, grave todas."),
      "s3api.get-bucket-tagging": M(
        "aws s3api get-bucket-tagging --bucket meu-bucket",
        "Mostra as etiquetas. Erro NoSuchTagSet = bucket sem dono no\nrelatório de custo."),
      "s3api.copy-object": M(
        "aws s3api copy-object --bucket destino --key copia.txt --copy-source origem/arquivo.txt",
        "Copia DENTRO da AWS: o arquivo não desce pra sua máquina e não sobe\nde novo. Em arquivo grande é a diferença entre segundos e horas — e\nentre pagar transferência ou não.\n\nO --copy-source é <bucket>/<chave>, SEM s3:// na frente."),
      "s3api.delete-objects": M(
        "aws s3api delete-objects --bucket meu-bucket --delete 'Objects=[{Key=a.txt},{Key=b.txt}]'",
        "Apaga até 1.000 chaves numa chamada.\n\nApagar uma a uma num bucket com milhões de objetos levaria dias — e\ncada chamada é cobrada. A resposta separa Deleted de Errors."),
      "s3api.restore-object": M(
        "aws s3api restore-object --bucket meu-bucket --key antigo.zip --restore-request Days=7",
        "Tira do Glacier/Deep Archive uma cópia temporária.\n\nNÃO é instantâneo: leva de minutos a horas conforme o modo. É a\ncópia fica disponível só pelos dias pedidos — depois some, e\nrestaurar de novo custa de novo.\n\nArquivo frio é barato pra guardar e caro pra ter pressa."),
      "s3api.delete-bucket-policy": M(
        "aws s3api delete-bucket-policy --bucket meu-bucket",
        "Remove a política do bucket.\n\nSe era ela que liberava o acesso público do site, o site cai agora.\nConfira com get-bucket-policy antes de apagar em produção."),
    });
  }

  // ============================================================
  // PORQUE
  // ============================================================
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "s3.mv": "move ou renomeia — que no S3 é copiar e apagar, não uma operação só.",
      "s3.presign": "entrega um arquivo privado por link temporário, sem tornar o bucket público.",
      "s3api.put-public-access-block": "liga as quatro travas contra exposição acidental do bucket.",
      "s3api.get-public-access-block": "confere se essas travas existem — a ausência é achado de auditoria.",
      "s3api.put-bucket-lifecycle-configuration": "faz o arquivo velho descer sozinho pra classe barata, ou sumir.",
      "s3api.get-bucket-lifecycle-configuration": "mostra se existe essa regra; sem ela, tudo fica na classe cara pra sempre.",
      "s3api.put-bucket-encryption": "cifra por padrão todo objeto novo do bucket.",
      "s3api.get-bucket-encryption": "confere qual criptografia está valendo.",
      "s3api.list-object-versions": "mostra as versões e as lápides — com versionamento, apagar não apaga.",
      "s3api.head-object": "pergunta tamanho e tipo sem baixar o arquivo (nem pagar a transferência).",
      "s3api.head-bucket": "testa existência e permissão do jeito mais barato possível.",
      "s3api.get-bucket-location": "diz em que região o bucket está — o que muda custo e latência.",
      "s3api.put-bucket-tagging": "etiqueta o bucket pro relatório de custo; substitui o conjunto inteiro.",
      "s3api.get-bucket-tagging": "mostra de quem é o bucket.",
      "s3api.copy-object": "copia dentro da AWS, sem descer e subir o arquivo.",
      "s3api.delete-objects": "apaga até mil chaves numa chamada só.",
      "s3api.restore-object": "tira do Glacier uma cópia temporária — leva horas e tem prazo.",
      "s3api.delete-bucket-policy": "remove a política do bucket (e o acesso que ela dava).",
    });
  }

  // ============================================================
  // ATIVIDADES
  // ============================================================
  if (typeof DESAFIOS === "undefined") return;

  function d(id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar) {
    return { id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar };
  }
  function at(anchorId, novos) {
    const i = DESAFIOS.findIndex((x) => x.id === anchorId);
    if (i < 0) {
      // Âncora que não existe na hora = arquivo carregando cedo demais. O
      // analise.js lê esta lista e acusa como PROBLEMA (bug de 21 a 24/09/2026).
      const g = typeof globalThis !== "undefined" ? globalThis : window;
      (g.__ancorasPerdidas = g.__ancorasPerdidas || []).push(anchorId);
      for (const n of novos) DESAFIOS.push(n);
      return;
    }
    DESAFIOS.splice(i + 1, 0, ...novos);
  }
  const bkt = (c, n) => ((c.s3 || {}).buckets || {})[n];
  const obj = (c, n, k) => ((bkt(c, n) || {}).objetos || {})[k];

  at("s3-13", [
    d("s3c-mv1", "s3", 2, 80, "O arquivo subiu com o nome errado",
      "O deploy mandou <b>relatorio.csv</b> pro bucket <b>docs-fiscais</b> com nome provisório e agora precisa virar <b>fechamento-2026.csv</b>. Mova ele. <small>(spoiler: não existe 'renomear' no S3 — o mv copia e apaga)</small>",
      ["O comando tem duas letras e e o mesmo do Linux.", "Origem e destino são os dois caminhos `s3://`, completos."],
      ["aws s3 mv s3://docs-fiscais/relatorio.csv s3://docs-fiscais/fechamento-2026.csv"],
      (c) => !!obj(c, "docs-fiscais", "fechamento-2026.csv") && !obj(c, "docs-fiscais", "relatorio.csv")),
    d("s3c-presign1", "s3", 2, 90, "O cliente quer o PDF, mas o bucket e privado",
      "O contrato está num bucket privado e o cliente precisa baixar — e tornar o bucket público só por causa disso seria um erro grave. Crie <b>contratos-2026</b>, suba o <b>relatorio.csv</b> e gere um <b>link temporário</b> que expira em <b>900</b> segundos.",
      ["Existe um comando do `aws s3` que assina uma URL temporária pro objeto.", "O prazo vai em `--expires-in`, em segundos (o máximo da AWS são 7 dias).", "Repare: quem tiver o link acessa — o link E o segredo."],
      ["aws s3 mb s3://contratos-2026",
        "aws s3 cp relatorio.csv s3://contratos-2026/",
        "aws s3 presign s3://contratos-2026/relatorio.csv --expires-in 900"],
      (c, cmd, ok) => ok && ehCmd(cmd, "s3", "presign")),
  ]);

  at("cob-s3-3", [
    d("s3c-block1", "s3", 3, 140, "As quatro travas que evitam a manchete",
      "Todo vazamento de S3 que virou noticia tem a mesma origem: bucket que ficou público sem ninguém perceber. Ligue as <b>quatro travas</b> no <b>contratos-2026</b> e confira que ficaram valendo.",
      ["São quatro chaves numa flag só, separadas por virgula — e as quatro começam com Block, Ignore ou Restrict.", "Com as quatro ligadas, nem ACL nem política conseguem expor o bucket, mesmo que alguém tente.", "Depois de gravar, existe o `get-…` correspondente."],
      ["aws s3api put-public-access-block --bucket contratos-2026 --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true",
        "aws s3api get-public-access-block --bucket contratos-2026"],
      (c) => {
        const b = bkt(c, "contratos-2026") || {};
        return !!b.bloqueio && b.bloqueio.BlockPublicAcls === true && b.bloqueio.RestrictPublicBuckets === true;
      }),
    d("s3c-enc1", "s3", 3, 120, "A auditoria exige tudo cifrado",
      "O contrato com o cliente exige criptografia em repouso. Ligue a <b>criptografia padrão</b> do <b>contratos-2026</b> com <b>AES256</b> — a chave gerenciada pela própria AWS, que não custa nada.",
      ["A configuração vai em JSON na flag `--server-side-encryption-configuration`.", "A estrutura tem Rules ➜ ApplyServerSideEncryptionByDefault ➜ SSEAlgorithm.", "AES256 e a chave da AWS; `aws:kms` seria uma chave sua, auditável e cobrada por chamada."],
      ["aws s3api put-bucket-encryption --bucket contratos-2026 --server-side-encryption-configuration '{\"Rules\":[{\"ApplyServerSideEncryptionByDefault\":{\"SSEAlgorithm\":\"AES256\"}}]}'",
        "aws s3api get-bucket-encryption --bucket contratos-2026"],
      (c) => (((bkt(c, "contratos-2026") || {}).criptografia) || {}).algoritmo === "AES256"),
    d("s3c-life1", "s3", 3, 150, "Log de 2019 na classe mais cara",
      "O bucket de logs cresce sem parar e tudo está na classe padrão — inclusive log que ninguém abre há anos. Crie <b>logs-aplicacao</b> e configure o <b>ciclo de vida</b>: o que está em <b>logs/</b> desce pro <b>GLACIER</b> depois de <b>30</b> dias.",
      ["Ciclo de vida é uma REGRA que a AWS aplica sozinha todo dia — você não roda nada depois.", "O documento vai em JSON, com Rules ➜ Transitions ➜ Days e StorageClass.", "O Filter ➜ Prefix e o que limita a regra a uma pasta em vez do bucket inteiro."],
      ["aws s3 mb s3://logs-aplicacao",
        "aws s3api put-bucket-lifecycle-configuration --bucket logs-aplicacao --lifecycle-configuration '{\"Rules\":[{\"ID\":\"arquivar\",\"Status\":\"Enabled\",\"Filter\":{\"Prefix\":\"logs/\"},\"Transitions\":[{\"Days\":30,\"StorageClass\":\"GLACIER\"}]}]}'"],
      (c) => (((bkt(c, "logs-aplicacao") || {}).cicloVida) || {}).classe === "GLACIER"),
    d("s3c-ver1", "s3", 3, 130, "Apagar com versionamento não apaga",
      "Prove pra si mesmo: no bucket versionado, suba o <b>relatorio.csv</b>, apague ele e depois <b>liste as versões</b>. Você vai ver o arquivo continuar lá, com uma lápide (DeleteMarker) por cima — e continuar na fatura.",
      ["Primeiro ligue o versionamento com o put-bucket-versioning (Status=Enabled).", "Apagar em lote e `delete-objects`, com a lista em `Objects=[{Key=...}]`.", "O `list-object-versions` é o único comando que mostra as lápides."],
      ["aws s3 mb s3://arquivos-versionados",
        "aws s3api put-bucket-versioning --bucket arquivos-versionados --versioning-configuration Status=Enabled",
        "aws s3 cp relatorio.csv s3://arquivos-versionados/",
        "aws s3api delete-objects --bucket arquivos-versionados --delete 'Objects=[{Key=relatorio.csv}]'",
        "aws s3api list-object-versions --bucket arquivos-versionados"],
      (c, cmd, ok) => ok && ehCmd(cmd, "s3api", "list-object-versions") &&
        !!(((bkt(c, "arquivos-versionados") || {}).versoes || {})["relatorio.csv"])),
    d("s3c-head1", "s3", 3, 100, "Qual o tamanho daquele arquivo de 4 GB?",
      "Você só precisa saber o tamanho e a data — baixar o arquivo inteiro pra descobrir seria absurdo (e você paga a transferência). Confira o <b>relatorio.csv</b> do <b>contratos-2026</b> sem baixar, e de passagem teste se o bucket existe e você tem acesso.",
      ["Existe uma família de comandos que pergunta o cabeçalho sem trazer o corpo.", "São dois: um pro objeto e outro pro bucket.", "No do bucket, resposta VAZIA é sucesso — é o teste de permissão mais barato que existe."],
      ["aws s3api head-object --bucket contratos-2026 --key relatorio.csv",
        "aws s3api head-bucket --bucket contratos-2026"],
      (c, cmd, ok) => ok && ehCmd(cmd, "s3api", "head-bucket")),
    d("s3c-copy1", "s3", 3, 120, "Copie 4 GB sem baixar 4 GB",
      "Você precisa de uma cópia do <b>relatorio.csv</b> do <b>contratos-2026</b> dentro do <b>logs-aplicacao</b>, como <b>backup-contrato.csv</b>. Faça a cópia acontecer <b>dentro da AWS</b> — sem o arquivo passar pela sua máquina.",
      ["O `s3api copy-object` manda a AWS copiar internamente: nada desce e nada sobe.", "Repare no formato do `--copy-source`: e `<bucket>/<chave>`, SEM o s3:// na frente.", "O `--bucket` e o `--key` aqui são o DESTINO."],
      ["aws s3api copy-object --bucket logs-aplicacao --key backup-contrato.csv --copy-source contratos-2026/relatorio.csv"],
      (c) => !!obj(c, "logs-aplicacao", "backup-contrato.csv")),
    d("s3c-tag1", "s3", 3, 100, "Quanto esse bucket custa pro time?",
      "O relatório de custo mostra o S3 num bolo só. Etiquete o <b>logs-aplicacao</b> com <b>Time=plataforma</b> e leia de volta. <small>(cuidado: este comando SUBSTITUI o conjunto inteiro de tags — não existe 'adicionar uma')</small>",
      ["A tag vai numa estrutura chamada TagSet, em forma de lista.", "A forma e `--tagging 'TagSet=[{Key=<chave>,Value=<valor>}]'`."],
      ["aws s3api put-bucket-tagging --bucket logs-aplicacao --tagging 'TagSet=[{Key=Time,Value=plataforma}]'",
        "aws s3api get-bucket-tagging --bucket logs-aplicacao"],
      (c) => (((bkt(c, "logs-aplicacao") || {}).tags) || {}).Time === "plataforma"),
    d("s3c-loc1", "s3", 3, 90, "Em que região esse bucket está?",
      "Antes de ligar uma aplicação nova nele, descubra <b>onde</b> o <b>logs-aplicacao</b> fica. <small>(transferência entre regiões custa, e latência do outro lado do mundo aparece no tempo de resposta)</small>",
      ["Existe um `get-…` só pra isso no s3api.", "Curiosidade real: se a resposta vier `null`, o bucket está em us-east-1 — é assim mesmo na AWS."],
      ["aws s3api get-bucket-location --bucket logs-aplicacao"],
      (c, cmd, ok) => ok && ehCmd(cmd, "s3api", "get-bucket-location")),
    d("s3c-rest1", "s3", 3, 130, "Precisamos daquele arquivo de três anos atrás",
      "O jurídico pediu um arquivo que já desceu pro Glacier. Copie o <b>relatorio.csv</b> pro <b>logs-aplicacao</b> como <b>antigo.csv</b> já na classe <b>GLACIER</b> e peça a <b>restauração</b> por <b>7</b> dias. <small>(não é instantâneo — leva horas, e depois do prazo some de novo)</small>",
      ["Dá pra nascer direto na classe fria usando `--storage-class` no copy-object.", "Restaurar pede quantos dias a cópia fica disponível: `--restore-request Days=<n>`.", "Tentar restaurar algo que não está em Glacier devolve InvalidObjectState — o arquivo já está disponível."],
      ["aws s3api copy-object --bucket logs-aplicacao --key antigo.csv --copy-source contratos-2026/relatorio.csv --storage-class GLACIER",
        "aws s3api restore-object --bucket logs-aplicacao --key antigo.csv --restore-request Days=7"],
      (c) => ((obj(c, "logs-aplicacao", "antigo.csv") || {}).restaurando) === 7),
    d("s3c-pol1", "s3", 3, 110, "Revogue a política que abria o bucket",
      "O site antigo saiu do ar e a política que liberava leitura publica continua valendo — permissão que sobra e incidente esperando. Recrie o cenario no bucket <b>site-aposentado</b>: ponha a política publica nele, <b>leia</b> o que está valendo e só então <b>remova</b>.",
      ["Primeiro olhe o que está valendo com o `get-bucket-policy`: apagar política sem ler e como apagar regra de firewall no escuro.", "O comando de remover é o `delete-…` do mesmo par.", "A política vem do arquivo pronto: `file://politica-publica.json` (digite `ls` pra ver)."],
      ["aws s3 mb s3://site-aposentado",
        "aws s3api put-bucket-policy --bucket site-aposentado --policy file://politica-publica.json",
        "aws s3api get-bucket-policy --bucket site-aposentado",
        "aws s3api delete-bucket-policy --bucket site-aposentado"],
      (c, cmd, ok) => ok && ehCmd(cmd, "s3api", "delete-bucket-policy") &&
        !!bkt(c, "site-aposentado") && !((bkt(c, "site-aposentado") || {}).politica)),
  ]);
})();
