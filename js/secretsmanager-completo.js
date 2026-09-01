"use strict";
// ============================================================
// CLImb — secretsmanager-completo.js
// A trilha ensinava guardar, ler, trocar, apagar e restaurar segredo. Faltava
// justamente o que separa o Secrets Manager de um "arquivo de senha caro":
//
//   ROTAÇÃO — trocar a senha sozinho, de tempos em tempos. É a razão de o
//        serviço existir e de ser mais caro que o Parameter Store.
//   describe-secret — auditar o segredo SEM ler o valor. Ver quem/quando usou
//        pela última vez não deveria exigir permissão pra ler a senha.
//   get-random-password — parar de inventar senha na mão.
//   tag-resource — sem etiqueta, ninguém sabe de quem é o segredo nem de qual
//        ambiente; e é por etiqueta que se separa custo e acesso.
//
// Comandos conferidos na referência oficial (aws secretsmanager).
// ADITIVO: complementa SERVICOS.secretsmanager, MANUAIS e PORQUE.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.secretsmanager) return;

  function st(conta) {
    conta.secrets = conta.secrets || { segredos: {} };
    conta.secrets.segredos = conta.secrets.segredos || {};
    return conta.secrets;
  }
  function segredoDe(conta, flags, op) {
    const s = st(conta);
    const id = String(exigirFlag(flags, "secret-id"));
    const achado = s.segredos[id] || Object.values(s.segredos).find((x) => x.nome === id);
    if (!achado) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the ${op} operation: Secrets Manager can't find the specified secret.`);
    return achado;
  }

  Object.assign(SERVICOS.secretsmanager, {
    "describe-secret": (conta, pos, flags) => {
      const s = segredoDe(conta, flags, "DescribeSecret");
      avisarClimb(
        "Repare no que NÃO veio: o valor do segredo. O describe mostra os metadados (quando foi criado, " +
        "se tem rotação, etiquetas) sem devolver a senha — e é de propósito. Auditar quem tem qual segredo " +
        "não deveria exigir permissão pra LER a senha."
      );
      return js({
        ARN: `arn:aws:secretsmanager:us-east-1:123456789012:secret:${s.nome}`,
        Name: s.nome, Description: s.descricao || "",
        CreatedDate: s.criadoEm, LastChangedDate: s.alteradoEm || s.criadoEm,
        RotationEnabled: !!s.rotacao,
        RotationRules: s.rotacao ? { AutomaticallyAfterDays: s.rotacaoDias || 30 } : undefined,
        LastRotatedDate: s.rotadoEm || undefined,
        DeletedDate: s.apagandoEm || undefined,
        Tags: Object.entries(s.tags || {}).map(([k, v]) => ({ Key: k, Value: v })),
      });
    },

    "tag-resource": (conta, pos, flags) => {
      const s = segredoDe(conta, flags, "TagResource");
      const bruto = exigirFlag(flags, "tags");
      let lista;
      if (String(bruto).trim().startsWith("[")) {
        try { lista = JSON.parse(bruto); } catch (e) { throw new ErroCli("Error parsing parameter '--tags': Invalid JSON received."); }
      } else {
        // forma abreviada: Key=ambiente,Value=producao (podendo repetir)
        lista = [];
        const partes = String(bruto).split(/\s+/);
        for (const p of partes) {
          const o = parsearShorthand(p);
          if (o.Key) lista.push({ Key: o.Key, Value: o.Value === undefined ? "" : o.Value });
        }
      }
      if (!lista.length) throw new ErroCli("An error occurred (InvalidParameterException) when calling the TagResource operation: Tags can't be empty.");
      s.tags = s.tags || {};
      for (const t of lista) s.tags[t.Key] = t.Value;
      avisarClimb(
        "Etiqueta não é enfeite: é por ela que a fatura mostra quanto cada time/ambiente gastou, e é por ela " +
        "que se escreve política do tipo \"só quem é do time pode ler os segredos com ambiente=producao\"."
      );
      return okSilencioso(`Etiquetas aplicadas em ${s.nome}.`);
    },

    "get-random-password": (conta, pos, flags) => {
      const tam = flags["password-length"] ? parseInt(flags["password-length"], 10) : 32;
      if (isNaN(tam) || tam < 4 || tam > 4096) {
        throw new ErroCli("An error occurred (InvalidParameterException) when calling the GetRandomPassword operation: PasswordLength must be between 4 and 4096.");
      }
      let alfabeto = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      const semPontuacao = flags["exclude-punctuation"] === true || String(flags["exclude-punctuation"]) === "true";
      if (!semPontuacao) alfabeto += "!#$%&*+-=?@^_";
      let senha = "";
      for (let i = 0; i < tam; i++) alfabeto[Math.floor(Math.random() * alfabeto.length)] && (senha += alfabeto[Math.floor(Math.random() * alfabeto.length)]);
      avisarClimb(
        "Senha inventada por gente tem padrão — e padrão se quebra. Este comando existe pra você nunca mais " +
        "digitar \"Senha@123\" num banco de produção. Na prática ele é encadeado com o create-secret."
      );
      return js({ RandomPassword: senha });
    },

    "rotate-secret": (conta, pos, flags) => {
      const s = segredoDe(conta, flags, "RotateSecret");
      if (s.apagandoEm) throw new ErroCli("An error occurred (InvalidRequestException) when calling the RotateSecret operation: You can't perform this operation on the secret because it was marked for deletion.");
      const regras = flags["rotation-rules"] ? parsearShorthand(String(flags["rotation-rules"])) : {};
      s.rotacao = true;
      s.rotacaoDias = regras.AutomaticallyAfterDays ? parseInt(regras.AutomaticallyAfterDays, 10) : 30;
      s.rotadoEm = agoraIso();
      s.versao = hexAleatorio(8);
      avisarClimb(
        "Rotação é a razão de o Secrets Manager existir (e de custar mais que o Parameter Store): a senha " +
        "troca sozinha de tempos em tempos, sem ninguém editar nada. Quem lê o segredo pelo nome nem percebe — " +
        "por isso a aplicação NUNCA deve copiar o valor pra uma variável e esquecer lá."
      );
      return js({
        ARN: `arn:aws:secretsmanager:us-east-1:123456789012:secret:${s.nome}`,
        Name: s.nome, VersionId: s.versao,
      });
    },
  });

  // ---------------- manuais ----------------
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => `USO\n    ${uso}\n\n${txt}`;
    Object.assign(MANUAIS, {
      "secretsmanager.describe-secret": M(
        "aws secretsmanager describe-secret --secret-id senha-banco-loja",
        "Metadados do segredo: criação, última alteração, rotação e etiquetas.\nNÃO devolve o valor — de propósito. Auditar não deveria exigir permissão\npra ler a senha."),
      "secretsmanager.tag-resource": M(
        "aws secretsmanager tag-resource --secret-id senha-banco-loja \\\n        --tags Key=ambiente,Value=producao",
        "Aplica etiquetas. É por elas que a fatura separa gasto por time/ambiente\ne que se escreve política do tipo \"só o time X lê o que tem\nambiente=producao\"."),
      "secretsmanager.get-random-password": M(
        "aws secretsmanager get-random-password --password-length 32 --exclude-punctuation",
        "Gera uma senha aleatória forte. Serve pra você nunca mais inventar senha\nna mão. Na prática, o valor gerado vai direto pro create-secret.\n\nOPÇÕES ÚTEIS\n    --password-length        tamanho (4 a 4096; padrão 32)\n    --exclude-punctuation    sem pontuação (útil quando o banco reclama)"),
      "secretsmanager.rotate-secret": M(
        "aws secretsmanager rotate-secret --secret-id senha-banco-loja \\\n        --rotation-rules AutomaticallyAfterDays=30",
        "Liga a rotação automática: a senha troca sozinha a cada N dias.\nÉ o que justifica o Secrets Manager custar mais que o Parameter Store.\n\nNA AWS REAL a rotação exige uma função Lambda que sabe trocar a senha no\nbanco e gravar a nova versão — sem ela o comando falha. Aqui a rotação é\nsimulada pra você ver o efeito no describe-secret."),
    });
  }

  // ---------------- porquês ----------------
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "secretsmanager.describe-secret": "mostra tudo sobre o segredo MENOS o valor. É o comando que permite auditar (quando mudou, se tem rotação, de quem é) sem dar a ninguém o direito de ler a senha.",
      "secretsmanager.tag-resource": "etiqueta o segredo. É por etiqueta que a fatura separa gasto por time e que se escreve política de acesso por ambiente — sem elas, ninguém sabe de quem é o quê.",
      "secretsmanager.get-random-password": "gera senha forte de verdade. Existe pra ninguém mais digitar \"Senha@123\" em produção: senha inventada por gente tem padrão, e padrão se quebra.",
      "secretsmanager.rotate-secret": "faz a senha trocar sozinha de tempos em tempos. É a razão de o Secrets Manager existir e de custar mais que o Parameter Store — segredo que nunca muda é só um arquivo de senha caro.",
    });
  }

  // ---------------- atividades ----------------
  const seg = (c, n) => (((c.secrets || {}).segredos) || {})[n];

  const NOVOS = [
    { id: "sec-7", servico: "secretsmanager", nivel: 3, xp: 75, titulo: "Auditar sem poder ler",
      descricao: "A auditoria quer saber <b>quando</b> a senha do banco foi criada e se ela <b>troca sozinha</b> — mas ninguém da auditoria pode <b>ler</b> a senha. <b>Descreva</b> o segredo <b>senha-banco-loja</b>. <small>(repare no que NÃO vem na resposta)</small>",
      dicas: ["`describe-…` mostra os metadados do recurso — veja a lista de comandos com: aws secretsmanager help", "A forma do comando é: aws secretsmanager describe-secret --secret-id <nome-do-segredo>"],
      solucao: ["aws secretsmanager describe-secret --secret-id senha-banco-loja"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "secretsmanager", "describe-secret") },

    { id: "sec-8", servico: "secretsmanager", nivel: 3, xp: 85, titulo: "De quem é este segredo?",
      descricao: "A conta tem dezenas de segredos e ninguém sabe de qual ambiente é cada um — nem a fatura separa. <b>Etiquete</b> o <b>senha-banco-loja</b> com <b>ambiente=producao</b>.",
      dicas: ["`tag-resource` aplica etiquetas; elas vão na forma abreviada Key=...,Value=...", "A forma é: aws secretsmanager tag-resource --secret-id <nome> --tags Key=ambiente,Value=producao"],
      solucao: ["aws secretsmanager tag-resource --secret-id senha-banco-loja --tags Key=ambiente,Value=producao"],
      validar: (c) => { const s = seg(c, "senha-banco-loja"); return !!s && !!s.tags && s.tags.ambiente === "producao"; } },

    { id: "sec-9", servico: "secretsmanager", nivel: 3, xp: 80, titulo: "Pare de inventar senha",
      descricao: "Vai nascer um banco novo e alguém já ia digitar <b>Senha@123</b>. Senha inventada por gente tem padrão, e padrão se quebra. <b>Gere</b> uma senha de <b>32 caracteres</b> <b>sem pontuação</b> (o banco antigo não aceita símbolos).",
      dicas: ["Não precisa inventar: o próprio Secrets Manager gera a senha. Repare no verbo — é `get-`, não `create-`: nada fica guardado, o valor só é devolvido na sua tela.", "São duas flags: uma diz o tamanho, a outra tira os símbolos. Se não lembrar o nome exato da segunda, faça o que se faz no trabalho: `aws secretsmanager get-random-password help`."],
      solucao: ["aws secretsmanager get-random-password --password-length 32 --exclude-punctuation"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "secretsmanager", "get-random-password") && String(cmd.flags["password-length"]) === "32" },

    { id: "sec-10", servico: "secretsmanager", nivel: 3, xp: 120, titulo: "Que a senha troque sozinha",
      descricao: "Segredo que nunca muda é só um arquivo de senha caro. Ligue a <b>rotação automática</b> do <b>senha-banco-loja</b> a cada <b>30 dias</b> — é isto que justifica o Secrets Manager em vez do Parameter Store." +
        "<br><small>⚠️ <b>Simplificado aqui:</b> na AWS real a rotação exige uma <b>função Lambda</b> que saiba trocar a senha no banco e gravar a nova versão; sem ela o comando falha. Neste simulador a rotação é simulada pra você ver o efeito no <code>describe-secret</code>.</small>",
      dicas: ["`rotate-secret` liga a rotação; a regra vai na forma abreviada.", "A forma é: aws secretsmanager rotate-secret --secret-id <nome> --rotation-rules AutomaticallyAfterDays=30"],
      solucao: ["aws secretsmanager rotate-secret --secret-id senha-banco-loja --rotation-rules AutomaticallyAfterDays=30"],
      validar: (c) => { const s = seg(c, "senha-banco-loja"); return !!s && s.rotacao === true && s.rotacaoDias === 30; } },

    { id: "sec-proj", servico: "secretsmanager", tipo: "projeto", nivel: 3, xp: 330,
      titulo: "🔐 Projeto: segredo de produção como se deve",
      descricao: "Um serviço novo vai pra produção e a senha dele não pode nascer errada. Você faz o caminho inteiro: <b>gerar</b> uma senha forte, <b>guardar</b> como segredo, <b>etiquetar</b> pra saber de quem é, <b>ligar a rotação</b> e <b>conferir</b> tudo pelo describe — sem nunca precisar ler a senha pra auditar. Faça em qualquer ordem: o checklist marca sozinho.",
      dicas: [
        "É o que você praticou: get-random-password → create-secret → tag-resource → rotate-secret → describe-secret.",
        "O segredo do projeto se chama api-pagamentos-prod e a etiqueta é ambiente=producao.",
      ],
      solucao: [
        "aws secretsmanager get-random-password --password-length 32",
        'aws secretsmanager create-secret --name api-pagamentos-prod --secret-string "trocada-pela-rotacao" --description "Credencial da API de pagamentos"',
        "aws secretsmanager tag-resource --secret-id api-pagamentos-prod --tags Key=ambiente,Value=producao",
        "aws secretsmanager rotate-secret --secret-id api-pagamentos-prod --rotation-rules AutomaticallyAfterDays=30",
        "aws secretsmanager describe-secret --secret-id api-pagamentos-prod",
      ],
      etapas: [
        { texto: "Criar o segredo api-pagamentos-prod", validar: (c) => !!seg(c, "api-pagamentos-prod") },
        { texto: "Etiquetar com ambiente=producao", validar: (c) => { const s = seg(c, "api-pagamentos-prod"); return !!s && !!s.tags && s.tags.ambiente === "producao"; } },
        { texto: "Ligar a rotação automática (30 dias)", validar: (c) => { const s = seg(c, "api-pagamentos-prod"); return !!s && s.rotacao === true; } },
        { texto: "Conferir pelo describe-secret (sem ler o valor)", validar: (c) => { const s = seg(c, "api-pagamentos-prod"); return !!s && !!s.rotadoEm; } },
      ] },
  ];

  if (typeof DESAFIOS !== "undefined") {
    let i = -1;
    for (let k = 0; k < DESAFIOS.length; k++) if (DESAFIOS[k].servico === "secretsmanager") i = k;
    if (i >= 0) DESAFIOS.splice(i + 1, 0, ...NOVOS);
    else DESAFIOS.push(...NOVOS);
  }
})();
