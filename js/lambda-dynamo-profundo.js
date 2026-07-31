"use strict";
// ============================================================
// CLImb — lambda-dynamo-profundo.js
// EQUILÍBRIO DAS TRILHAS: Lambda e DynamoDB tinham 12 atividades cada, mas só
// 5 e 6 COMANDOS. Ou seja: muita repetição do mesmo create/invoke e nenhuma
// profundidade — enquanto o CloudWatch chegou a 25 atividades e 16 comandos.
// E são justamente os dois pilares da carreira Backend.
//
// O que faltava era o que se usa no trabalho de verdade:
//   Lambda    — publicar código novo, variável de ambiente, versão + alias
//               (deploy seguro) e permissão pra outro serviço invocar
//   DynamoDB  — QUERY (contra scan: a decisão nº1 de custo/desempenho),
//               update-item e delete-item
//
// ADITIVO. Carrega depois de licoes.js e dos arquivos de desafio.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.lambda || !SERVICOS.dynamodb) return;

  // ============================================================
  // Lambda — deploy de verdade
  // ============================================================
  function acharFuncao(conta, flags, op) {
    const nome = String(exigirFlag(flags, "function-name"));
    const f = conta.lambda.funcoes[nome];
    if (!f) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the ${op} operation: Function not found: ${nome}`);
    return f;
  }

  Object.assign(SERVICOS.lambda, {
    "update-function-code": (conta, pos, flags) => {
      const f = acharFuncao(conta, flags, "UpdateFunctionCode");
      if (flags["zip-file"] === undefined && flags["s3-bucket"] === undefined) {
        throw new ErroCli("An error occurred (InvalidParameterValueException) when calling the UpdateFunctionCode operation: informe o código novo com --zip-file fileb://<arquivo>.zip (ou --s3-bucket/--s3-key).");
      }
      f.versaoCodigo = (f.versaoCodigo || 0) + 1;
      f.ultimaAtualizacao = agoraIso();
      avisarClimb("Código novo publicado — é ESTE o comando de \"deploy\" de uma Lambda no dia a dia (o create-function só serve na primeira vez). Repare que ele sobrescreve o $LATEST: quem já estava chamando a função passa a rodar o código novo na hora.");
      return js({ FunctionName: f.nome, LastModified: f.ultimaAtualizacao, Version: "$LATEST", State: "Active", LastUpdateStatus: "Successful" });
    },

    "publish-version": (conta, pos, flags) => {
      const f = acharFuncao(conta, flags, "PublishVersion");
      f.versoes = f.versoes || [];
      const v = String(f.versoes.length + 1);
      f.versoes.push({ versao: v, publicadaEm: agoraIso() });
      avisarClimb(`Versão ${v} publicada — uma FOTO imutável do código de agora. O $LATEST continua mudando a cada deploy, mas a versão ${v} fica congelada pra sempre. É assim que se consegue voltar atrás: basta apontar o alias pra versão anterior.`);
      return js({ FunctionName: f.nome, Version: v, LastModified: agoraIso(), State: "Active" });
    },

    "list-versions-by-function": (conta, pos, flags) => {
      const f = acharFuncao(conta, flags, "ListVersionsByFunction");
      const vs = [{ Version: "$LATEST" }].concat((f.versoes || []).map((x) => ({ Version: x.versao })));
      return js({ Versions: vs.map((v) => ({ FunctionName: f.nome, Version: v.Version, Runtime: f.runtime })) });
    },

    "create-alias": (conta, pos, flags) => {
      const f = acharFuncao(conta, flags, "CreateAlias");
      const nome = String(exigirFlag(flags, "name"));
      const versao = String(exigirFlag(flags, "function-version"));
      f.aliases = f.aliases || {};
      if (f.aliases[nome]) throw new ErroCli(`An error occurred (ResourceConflictException) when calling the CreateAlias operation: Alias already exists: ${nome}`);
      const existe = versao === "$LATEST" || (f.versoes || []).some((v) => v.versao === versao);
      if (!existe) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the CreateAlias operation: Function not found: versão ${versao} não existe.\nPublique antes com: aws lambda publish-version --function-name ${f.nome}`);
      f.aliases[nome] = { nome, versao };
      avisarClimb(`Alias "${nome}" aponta pra versão ${versao}. O alias é um APELIDO estável: quem chama a função usa "${nome}" e nunca precisa saber o número. Pra promover uma versão nova você só reaponta o alias — e pra voltar atrás, reaponta de novo. É o deploy sem downtime.`);
      return js({ AliasArn: `arn:aws:lambda:${conta.regiao}:${conta.contaId}:function:${f.nome}:${nome}`, Name: nome, FunctionVersion: versao });
    },

    "update-alias": (conta, pos, flags) => {
      const f = acharFuncao(conta, flags, "UpdateAlias");
      const nome = String(exigirFlag(flags, "name"));
      const versao = String(exigirFlag(flags, "function-version"));
      f.aliases = f.aliases || {};
      if (!f.aliases[nome]) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the UpdateAlias operation: Alias not found: ${nome}`);
      const antes = f.aliases[nome].versao;
      f.aliases[nome].versao = versao;
      avisarClimb(`"${nome}" saiu da versão ${antes} pra ${versao}. Foi isso: um deploy (ou um rollback) sem mexer em quem chama a função. Nenhuma requisição caiu.`);
      return js({ Name: nome, FunctionVersion: versao });
    },

    "add-permission": (conta, pos, flags) => {
      const f = acharFuncao(conta, flags, "AddPermission");
      const sid = String(exigirFlag(flags, "statement-id"));
      const acao = String(exigirFlag(flags, "action"));
      const principal = String(exigirFlag(flags, "principal"));
      f.permissoes = f.permissoes || [];
      if (f.permissoes.some((p) => p.sid === sid)) throw new ErroCli(`An error occurred (ResourceConflictException) when calling the AddPermission operation: The statement id (${sid}) provided already exists.`);
      f.permissoes.push({ sid, acao, principal });
      avisarClimb(`Agora ${principal} pode invocar esta função. É o passo que mais gente esquece: dar a role pra Lambda deixa ELA usar outros serviços; esta permissão é o contrário — deixa OUTRO serviço chamar ELA. Sem isso, o gatilho do S3/API Gateway falha silenciosamente.`);
      return js({ Statement: JSON.stringify({ Sid: sid, Effect: "Allow", Principal: { Service: principal }, Action: acao, Resource: `arn:aws:lambda:${conta.regiao}:${conta.contaId}:function:${f.nome}` }) });
    },

    "get-policy": (conta, pos, flags) => {
      const f = acharFuncao(conta, flags, "GetPolicy");
      if (!f.permissoes || !f.permissoes.length) {
        throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the GetPolicy operation: The resource you requested does not exist.\nEsta função ainda não tem permissão nenhuma — ninguém de fora pode invocá-la. Use add-permission.`);
      }
      return js({ Policy: JSON.stringify({ Version: "2012-10-17", Statement: f.permissoes.map((p) => ({ Sid: p.sid, Effect: "Allow", Principal: { Service: p.principal }, Action: p.acao })) }) });
    },
  });

  // ============================================================
  // DynamoDB — query, update-item, delete-item
  // ============================================================
  // "{":c":{"S":"ana"}}" -> {":c":{S:"ana"}}
  function valoresDe(flags, obrigatorio) {
    const bruto = flags["expression-attribute-values"];
    if (bruto === undefined || bruto === true) {
      if (!obrigatorio) return {};
      throw new ErroCli("An error occurred (ValidationException): faltou --expression-attribute-values.\nÉ nele que vão os valores dos apelidos (:algo) que você usou na expressão.\nEx.: --expression-attribute-values '{\":c\":{\"S\":\"ana\"}}'");
    }
    try { return typeof bruto === "string" ? JSON.parse(bruto) : bruto; }
    catch (e) { throw new ErroCli("An error occurred (ValidationException): --expression-attribute-values precisa ser JSON válido, no formato {\":apelido\":{\"S\":\"valor\"}}."); }
  }
  const cru = (v) => (v && typeof v === "object") ? Object.values(v)[0] : v;

  Object.assign(SERVICOS.dynamodb, {
    "query": (conta, pos, flags) => {
      const t = exigirTabela(conta, flags, "Query");
      const expr = String(exigirFlag(flags, "key-condition-expression"));
      const vals = valoresDe(flags, true);
      const hash = chaveHash(t);
      const range = chaveRange(t);

      // parte da partição: "campo = :apelido" (obrigatória e sempre igualdade)
      const partes = expr.split(/\s+and\s+/i).map((s) => s.trim());
      const mPk = /^(\S+)\s*=\s*(:\S+)$/.exec(partes[0]);
      if (!mPk) {
        throw new ErroCli(`An error occurred (ValidationException) when calling the Query operation: Query condition missed key schema element.\nA condição precisa começar pela chave de partição, com igualdade: "${hash} = :algo".\nQuery NÃO procura por campo comum — pra isso é o scan (que lê a tabela inteira).`);
      }
      if (mPk[1] !== hash) {
        throw new ErroCli(`An error occurred (ValidationException) when calling the Query operation: Query condition missed key schema element: ${hash}\nVocê filtrou por "${mPk[1]}", que não é a chave de PARTIÇÃO desta tabela. Query só sabe ir direto na partição — o resto é scan.`);
      }
      const alvoPk = JSON.stringify(vals[mPk[2]]);
      if (vals[mPk[2]] === undefined) throw new ErroCli(`An error occurred (ValidationException) when calling the Query operation: o apelido ${mPk[2]} não foi definido em --expression-attribute-values.`);

      let itens = t.itens.filter((i) => JSON.stringify(i[hash]) === alvoPk);

      // parte opcional da ordenação: "sk > :x" ou "begins_with(sk, :x)"
      if (partes[1]) {
        if (!range) throw new ErroCli(`An error occurred (ValidationException) when calling the Query operation: esta tabela não tem chave de ordenação — não há segundo critério pra filtrar.`);
        const mBw = /^begins_with\s*\(\s*(\S+)\s*,\s*(:\S+)\s*\)$/i.exec(partes[1]);
        const mOp = /^(\S+)\s*(=|<|>|<=|>=)\s*(:\S+)$/.exec(partes[1]);
        if (mBw) {
          const p = String(cru(vals[mBw[2]]));
          itens = itens.filter((i) => String(cru(i[mBw[1]]) || "").startsWith(p));
        } else if (mOp) {
          const alvo = cru(vals[mOp[3]]);
          const num = !isNaN(Number(alvo));
          itens = itens.filter((i) => {
            const v = cru(i[mOp[1]]);
            const a = num ? Number(v) : String(v), b = num ? Number(alvo) : String(alvo);
            switch (mOp[2]) {
              case "=": return a === b; case "<": return a < b; case ">": return a > b;
              case "<=": return a <= b; case ">=": return a >= b; default: return false;
            }
          });
        } else {
          throw new ErroCli(`An error occurred (ValidationException) when calling the Query operation: não entendi "${partes[1]}".\nNa chave de ordenação valem: =, <, >, <=, >= e begins_with(campo, :apelido).`);
        }
      }
      if (String(flags["scan-index-forward"]) === "false" && range) {
        itens = itens.slice().reverse();
      }
      avisarClimb(`${itens.length} item(ns). A diferença que importa: o QUERY vai direto na partição e lê só o que interessa; o SCAN lê a tabela INTEIRA e joga fora o resto. Numa tabela com milhões de itens isso é a diferença entre alguns milissegundos e uma conta cara — por isso se modela a tabela pensando na query que você vai fazer.`);
      return js({ Items: itens, Count: itens.length, ScannedCount: itens.length });
    },

    "update-item": (conta, pos, flags) => {
      const t = exigirTabela(conta, flags, "UpdateItem");
      const chave = parsearJsonFlag(flags, "key");
      const expr = String(exigirFlag(flags, "update-expression"));
      const vals = valoresDe(flags, true);
      const hash = chaveHash(t), range = chaveRange(t);
      if (!chave[hash]) throw new ErroCli(`An error occurred (ValidationException) when calling the UpdateItem operation: The provided key element does not match the schema (falta ${hash}).`);
      const alvo = JSON.stringify(chave[hash]) + (range ? "|" + JSON.stringify(chave[range]) : "");
      let item = t.itens.find((i) => JSON.stringify(i[hash]) + (range ? "|" + JSON.stringify(i[range]) : "") === alvo);
      const eraNovo = !item;
      if (!item) { item = Object.assign({}, chave); t.itens.push(item); }

      const mSet = /^\s*SET\s+(.+)$/i.exec(expr);
      const mRem = /^\s*REMOVE\s+(.+)$/i.exec(expr);
      if (mSet) {
        for (const par of mSet[1].split(",")) {
          const m = /^\s*(\S+)\s*=\s*(:\S+)\s*$/.exec(par);
          if (!m) throw new ErroCli(`An error occurred (ValidationException) when calling the UpdateItem operation: não entendi "${par.trim()}".\nA forma é: SET campo = :apelido (com o valor em --expression-attribute-values).`);
          if (vals[m[2]] === undefined) throw new ErroCli(`An error occurred (ValidationException) when calling the UpdateItem operation: o apelido ${m[2]} não foi definido em --expression-attribute-values.`);
          item[m[1]] = vals[m[2]];
        }
      } else if (mRem) {
        for (const c of mRem[1].split(",")) delete item[c.trim()];
      } else {
        throw new ErroCli(`An error occurred (ValidationException) when calling the UpdateItem operation: o CLImb entende SET campo = :apelido e REMOVE campo.`);
      }
      avisarClimb(eraNovo
        ? "Repare: o item não existia e o update-item CRIOU ele (upsert). No DynamoDB não há erro de \"registro não encontrado\" nessa operação — se não achar, ele insere."
        : "Só o campo citado mudou; o resto do item continua igual. É a diferença pro put-item, que SUBSTITUI o item inteiro (e apaga o que você não mandou).");
      return js({ Attributes: item });
    },

    "delete-item": (conta, pos, flags) => {
      const t = exigirTabela(conta, flags, "DeleteItem");
      const chave = parsearJsonFlag(flags, "key");
      const hash = chaveHash(t), range = chaveRange(t);
      if (!chave[hash]) throw new ErroCli(`An error occurred (ValidationException) when calling the DeleteItem operation: The provided key element does not match the schema (falta ${hash}).`);
      const alvo = JSON.stringify(chave[hash]) + (range ? "|" + JSON.stringify(chave[range]) : "");
      const antes = t.itens.length;
      t.itens = t.itens.filter((i) => JSON.stringify(i[hash]) + (range ? "|" + JSON.stringify(i[range]) : "") !== alvo);
      avisarClimb(antes === t.itens.length
        ? "Nenhum item casou com essa chave — e mesmo assim a AWS responde SUCESSO. O delete-item é idempotente: apagar o que não existe não é erro."
        : "Item apagado. Não há lixeira: no DynamoDB isso é imediato e definitivo.");
      return js({});
    },
  });

  // ============================================================
  // Atividades
  // ============================================================
  const NOVAS_LAMBDA = [
    { id: "lamp-1", servico: "lambda", nivel: 2, xp: 90, titulo: "Publique código novo (o deploy real)",
      descricao: "O <b>create-function</b> só serve na primeira vez. No dia a dia, o que você roda é o comando que <b>troca o código</b> de uma função que já existe. Atualize o código da <b>processa-pedido</b>.",
      dicas: ["`update-…` altera algo que já existe. Aqui o que muda é o CÓDIGO, não a configuração.", "A forma do comando é: aws lambda update-function-code --function-name <nome> --zip-file <fileb://arquivo.zip>"],
      solucao: ["aws lambda update-function-code --function-name processa-pedido --zip-file fileb://app.zip"],
      validar: (c) => !!(c.lambda.funcoes["processa-pedido"] && c.lambda.funcoes["processa-pedido"].versaoCodigo) },

    { id: "lamp-2", servico: "lambda", nivel: 3, xp: 110, titulo: "Congele uma versão",
      descricao: "O <b>$LATEST</b> muda a cada deploy — não dá pra confiar nele em produção. <b>Publique uma versão</b> da <b>processa-pedido</b>: uma foto imutável do código de agora.",
      dicas: ["`publish-…` cria a foto. Só precisa dizer de qual função.", "A forma do comando é: aws lambda publish-version --function-name <nome>"],
      solucao: ["aws lambda publish-version --function-name processa-pedido"],
      validar: (c) => { const f = c.lambda.funcoes["processa-pedido"]; return !!(f && f.versoes && f.versoes.length); } },

    { id: "lamp-3", servico: "lambda", nivel: 3, xp: 130, titulo: "Aponte o apelido de produção",
      descricao: "Quem chama a função não deve precisar saber o número da versão. Crie o alias <b>prod</b> apontando pra <b>versão 1</b> da <b>processa-pedido</b>.",
      dicas: ["`create-…` cria o apelido. Ele precisa saber a função, o nome do apelido e pra qual versão apontar.", "A forma do comando é: aws lambda create-alias --function-name <nome> --name <apelido> --function-version <número>"],
      solucao: ["aws lambda create-alias --function-name processa-pedido --name prod --function-version 1"],
      validar: (c) => { const f = c.lambda.funcoes["processa-pedido"]; return !!(f && f.aliases && f.aliases.prod); } },

    { id: "lamp-4", servico: "lambda", nivel: 3, xp: 120, titulo: "Deixe o S3 chamar sua função",
      descricao: "A <b>role</b> deixa a Lambda usar outros serviços. Isto aqui é o contrário: deixar <b>outro serviço invocar ELA</b>. Sem isso, o gatilho falha calado. Dê permissão pro <b>s3.amazonaws.com</b> invocar a <b>processa-pedido</b>.",
      dicas: ["`add-…` acrescenta uma permissão à política da função. Ela precisa de um id do enunciado (statement-id), a ação e quem pode.", "A forma do comando é: aws lambda add-permission --function-name <nome> --statement-id <id> --action lambda:InvokeFunction --principal <serviço>"],
      solucao: ["aws lambda add-permission --function-name processa-pedido --statement-id s3-invoca --action lambda:InvokeFunction --principal s3.amazonaws.com"],
      validar: (c) => { const f = c.lambda.funcoes["processa-pedido"]; return !!(f && (f.permissoes || []).some((p) => /s3/.test(p.principal))); } },
  ];

  const NOVAS_DYNAMO = [
    { id: "dynp-1", servico: "dynamodb", nivel: 3, xp: 110, titulo: "Uma tabela com chave composta",
      descricao: "Pra guardar <b>vários pedidos do mesmo cliente</b> a chave precisa de duas partes: a de <b>partição</b> (cliente) e a de <b>ordenação</b> (data). Crie a tabela <b>PedidosCliente</b> assim.",
      dicas: ["São duas entradas em cada parâmetro: uma pra chave de partição (HASH) e outra pra de ordenação (RANGE).", "A forma é: --attribute-definitions AttributeName=<a>,AttributeType=S AttributeName=<b>,AttributeType=S --key-schema AttributeName=<a>,KeyType=HASH AttributeName=<b>,KeyType=RANGE"],
      solucao: ["aws dynamodb create-table --table-name PedidosCliente --attribute-definitions AttributeName=cliente,AttributeType=S AttributeName=data,AttributeType=S --key-schema AttributeName=cliente,KeyType=HASH AttributeName=data,KeyType=RANGE --billing-mode PAY_PER_REQUEST"],
      validar: (c) => { const t = c.dynamodb.tabelas["PedidosCliente"]; return !!(t && t.esquema.some((k) => k.KeyType === "RANGE")); } },

    { id: "dynp-2", servico: "dynamodb", nivel: 2, xp: 80, titulo: "Dois pedidos do mesmo cliente",
      descricao: "Grave <b>dois</b> pedidos da cliente <b>ana</b>, em datas diferentes (<b>2026-07-01</b> e <b>2026-07-15</b>). Com chave composta os dois convivem — não se sobrescrevem.",
      dicas: ["É o mesmo put-item de sempre, duas vezes. O item precisa trazer as DUAS partes da chave.", "A forma é: aws dynamodb put-item --table-name <nome> --item '{\"cliente\":{\"S\":\"...\"},\"data\":{\"S\":\"...\"},...}'"],
      solucao: [
        "aws dynamodb put-item --table-name PedidosCliente --item '{\"cliente\":{\"S\":\"ana\"},\"data\":{\"S\":\"2026-07-01\"},\"valor\":{\"N\":\"120\"}}'",
        "aws dynamodb put-item --table-name PedidosCliente --item '{\"cliente\":{\"S\":\"ana\"},\"data\":{\"S\":\"2026-07-15\"},\"valor\":{\"N\":\"340\"}}'",
      ],
      validar: (c) => { const t = c.dynamodb.tabelas["PedidosCliente"]; return !!t && t.itens.filter((i) => i.cliente && i.cliente.S === "ana").length >= 2; } },

    { id: "dynp-3", servico: "dynamodb", nivel: 3, xp: 150, titulo: "Query: vá direto na partição",
      descricao: "O <b>scan</b> lê a tabela inteira; o <b>query</b> vai direto na partição. Traga <b>todos os pedidos da ana</b> usando query. <small>(a condição usa um apelido <code>:c</code>, cujo valor vai em outro parâmetro)</small>",
      dicas: ["A condição sempre começa pela chave de PARTIÇÃO, com igualdade. Os valores não vão na expressão: vão num JSON à parte, referenciados por :apelido.", "A forma é: aws dynamodb query --table-name <nome> --key-condition-expression \"<chave> = :apelido\" --expression-attribute-values '{\":apelido\":{\"S\":\"<valor>\"}}'"],
      solucao: ["aws dynamodb query --table-name PedidosCliente --key-condition-expression \"cliente = :c\" --expression-attribute-values '{\":c\":{\"S\":\"ana\"}}'"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "dynamodb", "query") },

    { id: "dynp-4", servico: "dynamodb", nivel: 3, xp: 140, titulo: "Só os pedidos a partir de uma data",
      descricao: "A chave de ordenação permite <b>recortar um intervalo</b> sem ler o resto. Traga só os pedidos da <b>ana</b> com data <b>maior que 2026-07-10</b>.",
      dicas: ["Duas condições ligadas por AND: a partição com igualdade e a ordenação com o operador de comparação.", "A forma é: --key-condition-expression \"<chave> = :c AND <ordenacao> > :d\" com os DOIS apelidos definidos nos valores"],
      solucao: ["aws dynamodb query --table-name PedidosCliente --key-condition-expression \"cliente = :c AND data > :d\" --expression-attribute-values '{\":c\":{\"S\":\"ana\"},\":d\":{\"S\":\"2026-07-10\"}}'"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "dynamodb", "query") && /AND/i.test(String((cmd.flags || {})["key-condition-expression"] || "")) },

    { id: "dynp-5", servico: "dynamodb", nivel: 3, xp: 120, titulo: "Mude um campo só",
      descricao: "O <b>put-item</b> substitui o item inteiro (e apaga o que você não mandou). O <b>update-item</b> mexe só no que você pedir. Mude o <b>valor</b> do pedido da <b>ana</b> de <b>2026-07-01</b> para <b>199</b>.",
      dicas: ["Você diz QUAL item (--key, com as duas partes da chave) e O QUE muda (--update-expression), com o valor novo no JSON de apelidos.", "A forma é: aws dynamodb update-item --table-name <n> --key '{...}' --update-expression \"SET <campo> = :v\" --expression-attribute-values '{\":v\":{\"N\":\"...\"}}'"],
      solucao: ["aws dynamodb update-item --table-name PedidosCliente --key '{\"cliente\":{\"S\":\"ana\"},\"data\":{\"S\":\"2026-07-01\"}}' --update-expression \"SET valor = :v\" --expression-attribute-values '{\":v\":{\"N\":\"199\"}}'"],
      validar: (c) => { const t = c.dynamodb.tabelas["PedidosCliente"]; if (!t) return false; const i = t.itens.find((x) => x.cliente && x.cliente.S === "ana" && x.data && x.data.S === "2026-07-01"); return !!(i && i.valor && i.valor.N === "199"); } },

    { id: "dynp-6", servico: "dynamodb", nivel: 3, xp: 90, titulo: "Apague um pedido",
      descricao: "<b>Apague</b> o pedido da <b>ana</b> de <b>2026-07-15</b>. <small>(com chave composta, a chave do delete também precisa das duas partes)</small>",
      dicas: ["Apagar é sempre `delete-…`. Aqui você só precisa dizer QUAL item, pela chave completa.", "A forma é: aws dynamodb delete-item --table-name <nome> --key '{...as duas partes da chave...}'"],
      solucao: ["aws dynamodb delete-item --table-name PedidosCliente --key '{\"cliente\":{\"S\":\"ana\"},\"data\":{\"S\":\"2026-07-15\"}}'"],
      validar: (c) => { const t = c.dynamodb.tabelas["PedidosCliente"]; return !!t && !t.itens.some((x) => x.cliente && x.cliente.S === "ana" && x.data && x.data.S === "2026-07-15"); } },
  ];

  function inserirNoFim(servico, novas) {
    if (typeof DESAFIOS === "undefined" || DESAFIOS.some((d) => d.id === novas[0].id)) return;
    let i = -1;
    for (let k = 0; k < DESAFIOS.length; k++) if (DESAFIOS[k].servico === servico) i = k;
    if (i >= 0) DESAFIOS.splice(i + 1, 0, ...novas);
    else for (const d of novas) DESAFIOS.push(d);
  }
  inserirNoFim("lambda", NOVAS_LAMBDA);
  inserirNoFim("dynamodb", NOVAS_DYNAMO);

  // ---------- manuais ----------
  if (typeof MANUAIS !== "undefined") {
    Object.assign(MANUAIS, {
      "lambda.update-function-code": `aws lambda update-function-code\n\nUSO\n    aws lambda update-function-code --function-name processa-pedido \\\n        --zip-file fileb://app.zip\n\nTroca o CÓDIGO de uma função que já existe — é o "deploy" do dia a dia\n(create-function só na primeira vez). Sobrescreve o $LATEST, então quem já\nchamava a função passa a rodar o código novo na hora.\n\nPra trocar MEMÓRIA, TIMEOUT ou VARIÁVEL DE AMBIENTE é outro comando:\nupdate-function-configuration.`,
      "lambda.publish-version": `aws lambda publish-version\n\nUSO\n    aws lambda publish-version --function-name processa-pedido\n\nCongela o código atual numa VERSÃO numerada e imutável (1, 2, 3...). O\n$LATEST continua mudando a cada deploy; a versão publicada nunca muda.\n\nÉ o que torna rollback possível: você aponta o alias pra versão anterior.`,
      "lambda.list-versions-by-function": `aws lambda list-versions-by-function\n\nUSO\n    aws lambda list-versions-by-function --function-name processa-pedido\n\nLista o $LATEST e todas as versões publicadas da função.`,
      "lambda.create-alias": `aws lambda create-alias\n\nUSO\n    aws lambda create-alias --function-name processa-pedido \\\n        --name prod --function-version 1\n\nCria um APELIDO estável apontando pra uma versão. Quem chama a função usa o\napelido ("prod") e nunca precisa saber o número.\n\nPromover = reapontar o alias (update-alias). Rollback = reapontar de volta.\nÉ assim que se faz deploy sem downtime.`,
      "lambda.update-alias": `aws lambda update-alias\n\nUSO\n    aws lambda update-alias --function-name processa-pedido \\\n        --name prod --function-version 2\n\nMove o apelido pra outra versão. Uma linha faz o deploy — e a mesma linha,\ncom o número antigo, faz o rollback.`,
      "lambda.add-permission": `aws lambda add-permission\n\nUSO\n    aws lambda add-permission --function-name processa-pedido \\\n        --statement-id s3-invoca --action lambda:InvokeFunction \\\n        --principal s3.amazonaws.com\n\nDeixa OUTRO serviço invocar a sua função. Não confunda:\n    role da função        -> o que a Lambda pode usar\n    esta permissão        -> quem pode chamar a Lambda\n\nSem ela o gatilho (S3, API Gateway, EventBridge) falha SILENCIOSAMENTE —\né uma das causas mais comuns de "meu trigger não dispara".`,
      "lambda.get-policy": `aws lambda get-policy\n\nUSO\n    aws lambda get-policy --function-name processa-pedido\n\nMostra quem tem permissão pra invocar a função. Se ninguém tem, a AWS\nresponde ResourceNotFoundException (não é uma política vazia — é a ausência\nde política).`,
      "dynamodb.query": `aws dynamodb query\n\nUSO\n    aws dynamodb query --table-name PedidosCliente \\\n        --key-condition-expression "cliente = :c" \\\n        --expression-attribute-values '{":c":{"S":"ana"}}'\n\n    aws dynamodb query --table-name PedidosCliente \\\n        --key-condition-expression "cliente = :c AND data > :d" \\\n        --expression-attribute-values '{":c":{"S":"ana"},":d":{"S":"2026-07-10"}}'\n\nA operação mais importante do DynamoDB. Vai DIRETO na partição e lê só o que\ninteressa — diferente do scan, que lê a tabela inteira e descarta o resto.\n\nREGRAS:\n  - a condição SEMPRE começa pela chave de partição, com igualdade (=)\n  - na chave de ordenação valem =, <, >, <=, >= e begins_with(campo, :x)\n  - não dá pra filtrar por campo comum: pra isso é scan (ou um índice)\n  - --scan-index-forward false inverte a ordem\n\nOs valores não vão na expressão: vão em --expression-attribute-values,\nreferenciados por :apelido.`,
      "dynamodb.update-item": `aws dynamodb update-item\n\nUSO\n    aws dynamodb update-item --table-name PedidosCliente \\\n        --key '{"cliente":{"S":"ana"},"data":{"S":"2026-07-01"}}' \\\n        --update-expression "SET valor = :v" \\\n        --expression-attribute-values '{":v":{"N":"199"}}'\n\nMuda SÓ os campos citados. É a diferença pro put-item, que substitui o item\ninteiro (e apaga o que você não mandou).\n\nSe o item não existir, ele é CRIADO (upsert) — não dá erro.\nAceita SET campo = :apelido e REMOVE campo.`,
      "dynamodb.delete-item": `aws dynamodb delete-item\n\nUSO\n    aws dynamodb delete-item --table-name PedidosCliente \\\n        --key '{"cliente":{"S":"ana"},"data":{"S":"2026-07-15"}}'\n\nApaga um item pela chave (todas as partes dela, se a chave for composta).\nÉ idempotente: apagar o que não existe responde sucesso, não erro.\nNão há lixeira.`,
    });
  }

  // ---------- didática ----------
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "lambda.update-function-code": "o \"deploy\" de verdade: troca o código de uma função que já existe. O create-function só serve na primeira vez.",
      "lambda.publish-version": "congela o código de agora numa versão imutável. É o que torna o rollback possível — o $LATEST muda a cada deploy, a versão publicada não.",
      "lambda.list-versions-by-function": "mostra o $LATEST e as versões publicadas — o histórico pra onde você pode voltar.",
      "lambda.create-alias": "cria um apelido estável (prod, staging) apontando pra uma versão. Quem chama usa o apelido e nunca precisa saber o número.",
      "lambda.update-alias": "reaponta o apelido pra outra versão. Essa uma linha é o deploy — e, com o número antigo, o rollback.",
      "lambda.add-permission": "deixa OUTRO serviço invocar sua função. A role diz o que a Lambda pode usar; isto diz quem pode chamá-la. Sem isso, o gatilho falha calado.",
      "lambda.get-policy": "mostra quem pode invocar a função — o jeito de conferir se o gatilho vai mesmo funcionar.",
      "dynamodb.query": "a operação que define se o DynamoDB é rápido ou caro: vai direto na partição, em vez de ler a tabela inteira como o scan. Por isso se modela a tabela pensando na consulta.",
      "dynamodb.update-item": "muda só o campo que você citar, sem reescrever o item inteiro (que é o que o put-item faz). Se o item não existir, ele cria.",
      "dynamodb.delete-item": "apaga um item pela chave. É idempotente — apagar o que não existe não é erro.",
    });
  }
})();
