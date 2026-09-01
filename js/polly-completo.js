"use strict";
// ============================================================
// CLImb — polly-completo.js
// O Polly tinha só 2 dos 9 comandos reais do serviço (synthesize-speech e
// describe-voices), e por isso só 2 atividades. Este arquivo completa o motor
// com os 7 que faltavam e leva a trilha a 10 atividades + projeto.
//
// Comandos conferidos na referência oficial da AWS CLI (aws polly):
//   delete-lexicon · describe-voices · get-lexicon · get-speech-synthesis-task
//   list-lexicons · list-speech-synthesis-tasks · put-lexicon
//   start-speech-synthesis-task · synthesize-speech
//
// As duas metades do serviço que faltavam ensinar:
//   LÉXICO  — dicionário de pronúncia. É o que faz "AWS" ser lido "a-dáblio-és"
//             e não "aus", e a marca da empresa sair certa na narração.
//   TAREFA  — síntese ASSÍNCRONA. O synthesize-speech responde na hora, mas tem
//             limite de texto; capítulo de livro ou artigo inteiro vai por
//             start-speech-synthesis-task, que entrega o áudio num bucket S3.
//
// ADITIVO: complementa SERVICOS.polly, MANUAIS e PORQUE com Object.assign e
// insere as atividades por posição. Não reescreve servicos-fase9.js.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.polly) return;

  function estado(conta) {
    conta.polly = conta.polly || {};
    conta.polly.lexicons = conta.polly.lexicons || {};
    conta.polly.tarefas = conta.polly.tarefas || {};
    return conta.polly;
  }

  const VOZES_OK = ["Camila", "Vitoria", "Thiago", "Joanna", "Matthew", "Ricardo", "Ines"];

  // O synthesize-speech já existia e continua fazendo o mesmo — só passa a
  // DEIXAR RASTRO no estado (voz, léxicos, arquivo). Sem isso o checklist do
  // projeto não teria como saber que a vinheta foi gerada: etapa de projeto é
  // avaliada por ESTADO (ela marca sozinha, a cada comando), não pelo comando
  // do momento. Wrap aditivo: não reescreve servicos-fase9.js.
  const sintetizarOriginal = SERVICOS.polly["synthesize-speech"];
  SERVICOS.polly["synthesize-speech"] = function (conta, pos, flags) {
    const r = sintetizarOriginal(conta, pos, flags);
    const st = estado(conta);
    st.ultimaSintese = {
      voz: flags["voice-id"] ? String(flags["voice-id"]) : "",
      lexicons: flags["lexicon-names"] ? String(flags["lexicon-names"]) : "",
      arquivo: pos && pos.length ? pos[pos.length - 1] : "fala.mp3",
    };
    return r;
  };

  // ---------------- comandos novos ----------------
  Object.assign(SERVICOS.polly, {
    // ---- léxicos de pronúncia ----
    "put-lexicon": (conta, pos, flags) => {
      const nome = String(exigirFlag(flags, "name"));
      const conteudo = String(exigirFlag(flags, "content"));
      const st = estado(conta);
      const jaExistia = !!st.lexicons[nome];
      st.lexicons[nome] = {
        nome,
        conteudo,
        alfabeto: /ipa/i.test(conteudo) ? "ipa" : "ipa",
        idioma: (conteudo.match(/xml:lang="([^"]+)"/) || [])[1] || "pt-BR",
        // quantos <lexeme> o conteúdo declara — é o que a AWS conta em LexemesCount
        lexemas: (conteudo.match(/<lexeme>/g) || []).length || 1,
        tamanho: conteudo.length,
        criadoEm: agoraIso(),
      };
      avisarClimb(
        "Léxico é o dicionário de pronúncia do Polly: você diz como uma palavra DEVE ser lida. " +
        "É o que resolve sigla lida como palavra (AWS virando \"aus\"), nome de produto e estrangeirismo. " +
        "Sem ele, narração de marca sai errada — e ninguém percebe até um cliente reclamar."
      );
      return okSilencioso(jaExistia ? `Léxico ${nome} atualizado.` : `Léxico ${nome} criado.`);
    },
    "list-lexicons": (conta) => {
      const st = estado(conta);
      return js({
        Lexicons: Object.values(st.lexicons).map((l) => ({
          Name: l.nome,
          Attributes: {
            Alphabet: l.alfabeto, LanguageCode: l.idioma, LastModified: l.criadoEm,
            LexemesCount: l.lexemas, LexiconArn: `arn:aws:polly:us-east-1:123456789012:lexicon/${l.nome}`,
            Size: l.tamanho,
          },
        })),
      });
    },
    "get-lexicon": (conta, pos, flags) => {
      const nome = String(exigirFlag(flags, "name"));
      const st = estado(conta);
      const l = st.lexicons[nome];
      if (!l) throw new ErroCli(`An error occurred (LexiconNotFoundException) when calling the GetLexicon operation: Lexicon not found: ${nome}`);
      return js({
        Lexicon: { Name: l.nome, Content: l.conteudo },
        LexiconAttributes: {
          Alphabet: l.alfabeto, LanguageCode: l.idioma, LastModified: l.criadoEm,
          LexemesCount: l.lexemas, LexiconArn: `arn:aws:polly:us-east-1:123456789012:lexicon/${l.nome}`,
          Size: l.tamanho,
        },
      });
    },
    "delete-lexicon": (conta, pos, flags) => {
      const nome = String(exigirFlag(flags, "name"));
      const st = estado(conta);
      if (!st.lexicons[nome]) throw new ErroCli(`An error occurred (LexiconNotFoundException) when calling the DeleteLexicon operation: Lexicon not found: ${nome}`);
      delete st.lexicons[nome];
      avisarClimb("Apagar o léxico NÃO muda áudio já gerado — o que já virou mp3 continua com a pronúncia antiga. Ele só afeta as próximas sínteses.");
      return okSilencioso(`Léxico ${nome} apagado.`);
    },

    // ---- síntese assíncrona (texto longo → S3) ----
    "start-speech-synthesis-task": (conta, pos, flags) => {
      exigirFlag(flags, "text");
      const formato = String(exigirFlag(flags, "output-format"));
      const voz = String(exigirFlag(flags, "voice-id"));
      const bucket = String(exigirFlag(flags, "output-s3-bucket-name"));
      const st = estado(conta);
      if (!VOZES_OK.includes(voz)) {
        throw new ErroCli(`An error occurred (InvalidParameterValueException) when calling the StartSpeechSynthesisTask operation: ${voz} is not a valid voice ID.`);
      }
      const id = `${hexAleatorio(8)}-${hexAleatorio(4)}-${hexAleatorio(4)}-${hexAleatorio(4)}-${hexAleatorio(12)}`;
      st.tarefas[id] = {
        id, voz, formato, bucket,
        prefixo: flags["output-s3-key-prefix"] ? String(flags["output-s3-key-prefix"]) : "",
        estado: "completed", // no simulador a tarefa já nasce pronta
        criadoEm: agoraIso(),
        uri: `https://s3.us-east-1.amazonaws.com/${bucket}/${flags["output-s3-key-prefix"] || ""}${id}.${formato}`,
      };
      avisarClimb(
        "Esta é a síntese ASSÍNCRONA. O synthesize-speech responde na hora, mas tem teto de texto — " +
        "capítulo de livro ou artigo inteiro não cabe. A tarefa processa em segundo plano e entrega o " +
        "áudio direto num bucket do S3; você guarda o TaskId e consulta depois."
      );
      return js({ SynthesisTask: {
        TaskId: id, TaskStatus: "scheduled", OutputUri: st.tarefas[id].uri,
        CreationTime: st.tarefas[id].criadoEm, RequestCharacters: 0,
        OutputFormat: formato, VoiceId: voz,
      } });
    },
    "get-speech-synthesis-task": (conta, pos, flags) => {
      const id = String(exigirFlag(flags, "task-id"));
      const st = estado(conta);
      const t = st.tarefas[id];
      if (!t) throw new ErroCli(`An error occurred (SynthesisTaskNotFoundException) when calling the GetSpeechSynthesisTask operation: Synthesis task not found: ${id}`);
      st.consultouTarefa = true; // rastro pro checklist do projeto (ver acima)
      return js({ SynthesisTask: {
        TaskId: t.id, TaskStatus: "completed", OutputUri: t.uri,
        CreationTime: t.criadoEm, OutputFormat: t.formato, VoiceId: t.voz,
      } });
    },
    "list-speech-synthesis-tasks": (conta) => {
      const st = estado(conta);
      st.consultouTarefa = true; // rastro pro checklist do projeto (ver acima)
      return js({ SynthesisTasks: Object.values(st.tarefas).map((t) => ({
        TaskId: t.id, TaskStatus: "completed", OutputUri: t.uri,
        CreationTime: t.criadoEm, OutputFormat: t.formato, VoiceId: t.voz,
      })) });
    },
  });

  // ---------------- manuais (o fumaça falha sem) ----------------
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => `USO\n    ${uso}\n\n${txt}`;
    Object.assign(MANUAIS, {
      polly: `aws polly — Amazon Polly\n\nTransforma texto em voz (fala) com vozes naturais. Suporta SSML pra\ncontrolar entonação. Usos: acessibilidade, URA de telefonia, narração.\n\nDUAS FORMAS DE GERAR ÁUDIO\n    synthesize-speech             responde na hora, texto curto\n    start-speech-synthesis-task   assíncrono, texto longo, entrega no S3\n\nLÉXICO\n    dicionário de pronúncia: ensina o Polly a ler siglas e nomes próprios\n    do jeito certo (AWS, nome de produto, estrangeirismo).\n\nCOMANDOS\n    synthesize-speech, describe-voices,\n    put-lexicon, get-lexicon, list-lexicons, delete-lexicon,\n    start-speech-synthesis-task, get-speech-synthesis-task,\n    list-speech-synthesis-tasks`,
      "polly.put-lexicon": M(
        'aws polly put-lexicon --name marcas --content file://lexico.xml',
        "Cria ou SUBSTITUI um léxico de pronúncia (formato PLS, do W3C).\nNão existe 'update': mandar de novo com o mesmo nome troca o anterior\ninteiro. O conteúdo costuma vir de arquivo, com file://."),
      "polly.get-lexicon": M(
        "aws polly get-lexicon --name marcas",
        "Mostra o conteúdo do léxico e seus atributos (idioma, alfabeto,\nquantos lexemas tem, tamanho). Útil pra conferir o que está valendo\nantes de sintetizar."),
      "polly.list-lexicons": M(
        "aws polly list-lexicons",
        "Lista os léxicos da conta na região, com tamanho e nº de lexemas.\nO limite de léxicos por conta é por REGIÃO."),
      "polly.delete-lexicon": M(
        "aws polly delete-lexicon --name marcas",
        "Apaga o léxico. Não altera áudio já gerado — só as próximas sínteses."),
      "polly.start-speech-synthesis-task": M(
        'aws polly start-speech-synthesis-task --text "..." --output-format mp3 \\\n        --voice-id Camila --output-s3-bucket-name meu-bucket',
        "Síntese ASSÍNCRONA pra texto longo: processa em segundo plano e grava\no áudio no bucket S3 que você indicar. Devolve um TaskId — guarde-o, é\ncomo você acompanha o resultado.\n\nOPCIONAL\n    --output-s3-key-prefix   pasta/prefixo do arquivo no bucket"),
      "polly.get-speech-synthesis-task": M(
        "aws polly get-speech-synthesis-task --task-id <id>",
        "Consulta uma tarefa pelo id: status (scheduled, inProgress, completed,\nfailed) e o OutputUri, o endereço do áudio no S3."),
      "polly.list-speech-synthesis-tasks": M(
        "aws polly list-speech-synthesis-tasks",
        "Lista as tarefas de síntese e o estado de cada uma. Serve pra achar o\nid que você perdeu e pra ver o que falhou."),
    });
  }

  // ---------------- porquês (parte didática obrigatória) ----------------
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "polly.put-lexicon": "ensina o Polly a pronunciar o que ele erraria: sigla, nome de produto, estrangeirismo. É a diferença entre uma narração profissional e uma que fala o nome da sua empresa errado.",
      "polly.get-lexicon": "mostra o léxico que está valendo. Antes de culpar a voz por uma pronúncia estranha, confira aqui o que você mandou.",
      "polly.list-lexicons": "diz quais léxicos existem na região. Léxico é por região — o que você criou em São Paulo não existe na Virgínia.",
      "polly.delete-lexicon": "remove o dicionário. Áudio já gerado continua como está: apagar o léxico muda o futuro, não o passado.",
      "polly.start-speech-synthesis-task": "é como se narra texto LONGO. O synthesize-speech tem teto de caracteres; um artigo inteiro só passa por aqui, e o áudio sai direto num bucket do S3.",
      "polly.get-speech-synthesis-task": "acompanha a tarefa assíncrona e devolve o endereço do áudio no S3 quando termina. É o par natural do start.",
      "polly.list-speech-synthesis-tasks": "mostra todas as tarefas e seus estados — pra achar o id que se perdeu e ver o que falhou.",
    });
  }

  // ---------------- atividades ----------------
  // Nomes conferidos com grep antes de escolher: 'marcas-climb' e
  // 'narracao-climb' não aparecem em nenhuma outra atividade do projeto.
  const LEX = "marcas-climb";
  const CONTEUDO_LEX =
    `'<?xml version="1.0" encoding="UTF-8"?><lexicon version="1.0" xmlns="http://www.w3.org/2005/01/pronunciation-lexicon" xml:lang="pt-BR"><lexeme><grapheme>AWS</grapheme><alias>a dáblio és</alias></lexeme></lexicon>'`;
  const lexDe = (c, n) => ((c.polly || {}).lexicons || {})[n];
  const tarefas = (c) => Object.values(((c.polly || {}).tarefas) || {});

  const NOVOS = [
    { id: "pol-3", servico: "polly", nivel: 2, xp: 85, titulo: "Ensine a pronunciar a marca",
      descricao: "A narração do treinamento está lendo <b>AWS</b> como se fosse uma palavra (\"aus\"), e o time de marketing reclamou. A correção é um <b>léxico</b>: um dicionário de pronúncia. Crie o léxico <b>marcas-climb</b> ensinando a leitura certa.",
      dicas: ["`put-…` grava o recurso — veja a lista de comandos com: aws polly help", "A forma do comando é: aws polly put-lexicon --name <nome> --content <o XML do léxico>"],
      solucao: [`aws polly put-lexicon --name ${LEX} --content ${CONTEUDO_LEX}`],
      validar: (c) => !!lexDe(c, LEX) },

    { id: "pol-4", servico: "polly", nivel: 2, xp: 60, titulo: "Quais léxicos existem?",
      descricao: "Antes de sintetizar, confira o que a conta tem. <b>Liste os léxicos</b> desta região. <small>(léxico é por região: o que existe em São Paulo não existe na Virgínia)</small>",
      dicas: ["`list-…` mostra o que existe — veja a lista de comandos com: aws polly help", "A forma do comando é: aws polly list-lexicons"],
      solucao: ["aws polly list-lexicons"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "polly", "list-lexicons") },

    { id: "pol-5", servico: "polly", nivel: 2, xp: 70, titulo: "Confira o que está valendo",
      descricao: "A pronúncia continua saindo estranha e alguém suspeita do léxico. Antes de acusar a voz, <b>veja o conteúdo</b> do <b>marcas-climb</b> — é ele que diz o que o Polly vai ler.",
      dicas: ["`get-…` mostra UM recurso pelo nome — veja a lista de comandos com: aws polly help", "A forma do comando é: aws polly get-lexicon --name <nome>"],
      solucao: [`aws polly get-lexicon --name ${LEX}`],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "polly", "get-lexicon") && cmd.flags.name === LEX },

    { id: "pol-6", servico: "polly", nivel: 3, xp: 95, titulo: "Narração com a pronúncia certa",
      descricao: "Agora junte as peças: gere o áudio <b>abertura.mp3</b> com a voz <b>Camila</b> aplicando o léxico <b>marcas-climb</b>. <small>(o léxico só vale se você pedir por ele na síntese — criar não basta)</small>",
      dicas: ["É o mesmo synthesize-speech de antes, com uma opção a mais que aponta o léxico.", "A forma é: aws polly synthesize-speech --text <texto> --output-format mp3 --voice-id Camila --lexicon-names <nome-do-léxico> <arquivo>"],
      solucao: [`aws polly synthesize-speech --text "Bem-vindo ao curso de AWS" --output-format mp3 --voice-id Camila --lexicon-names ${LEX} abertura.mp3`],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "polly", "synthesize-speech") && String(cmd.flags["lexicon-names"] || "").includes(LEX) },

    { id: "pol-7", servico: "polly", nivel: 3, xp: 110, titulo: "Narre um texto longo",
      descricao: "O time quer o artigo inteiro em áudio, e ele não cabe no <b>synthesize-speech</b> (que tem teto de caracteres). Use a <b>síntese assíncrona</b>: ela processa em segundo plano e entrega o áudio no bucket <b>narracao-climb</b>." +
        "<br><small>⚠️ <b>Simplificado aqui:</b> na AWS real a tarefa leva tempo e passa por <code>scheduled</code> → <code>inProgress</code> → <code>completed</code>; você consulta até terminar. Neste simulador ela fica pronta na hora, pra você não precisar esperar.</small>",
      dicas: ["`start-…-task` começa um trabalho que roda em segundo plano — veja a lista de comandos com: aws polly help", "A forma é: aws polly start-speech-synthesis-task --text <texto> --output-format mp3 --voice-id <voz> --output-s3-bucket-name <bucket>"],
      solucao: ['aws polly start-speech-synthesis-task --text "Capitulo um: o que e a nuvem" --output-format mp3 --voice-id Camila --output-s3-bucket-name narracao-climb'],
      validar: (c) => tarefas(c).some((t) => t.bucket === "narracao-climb") },

    { id: "pol-8", servico: "polly", nivel: 3, xp: 85, titulo: "Quais narrações estão rodando?",
      descricao: "Você perdeu o <b>TaskId</b> que o comando anterior devolveu — acontece. <b>Liste as tarefas</b> de síntese pra achar o id e ver o estado de cada uma.",
      dicas: ["`list-…` mostra o que existe — veja a lista de comandos com: aws polly help", "A forma do comando é: aws polly list-speech-synthesis-tasks"],
      solucao: ["aws polly list-speech-synthesis-tasks"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "polly", "list-speech-synthesis-tasks") },

    { id: "pol-9", servico: "polly", nivel: 3, xp: 90, titulo: "Cadê o áudio pronto?",
      descricao: "Com o id em mãos, <b>consulte a tarefa</b> pra ver o status e pegar o <b>OutputUri</b> — o endereço do arquivo no S3. <small>(use o id da tarefa que você criou)</small>",
      dicas: ["`get-…` consulta UM item pelo identificador — veja a lista de comandos com: aws polly help", "A forma do comando é: aws polly get-speech-synthesis-task --task-id <id>"],
      solucao: ["aws polly get-speech-synthesis-task --task-id <task-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "polly", "get-speech-synthesis-task") },

    { id: "pol-10", servico: "polly", nivel: 3, xp: 85, titulo: "Aposente o léxico",
      descricao: "A marca mudou de nome e o léxico <b>marcas-climb</b> ficou obsoleto. <b>Apague</b> ele. <small>(o áudio já gerado NÃO muda — apagar o léxico só afeta as próximas sínteses)</small>",
      dicas: ["`delete-…` remove o recurso — veja a lista de comandos com: aws polly help", "A forma do comando é: aws polly delete-lexicon --name <nome>"],
      solucao: [`aws polly delete-lexicon --name ${LEX}`],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "polly", "delete-lexicon") && !lexDe(c, LEX) },

    // -------- projeto da trilha: usa tudo que foi ensinado --------
    { id: "pol-proj", servico: "polly", tipo: "projeto", nivel: 3, xp: 320,
      titulo: "🎙️ Projeto: audiobook do curso",
      descricao: "A escola vai publicar o curso em áudio. Você monta a narração inteira: o <b>dicionário de pronúncia</b> pra marca sair certa, a <b>vinheta curta</b> gerada na hora, o <b>capítulo longo</b> pela síntese assíncrona entregue no S3, a <b>conferência</b> de que ficou pronto e a <b>faxina</b> no fim. Faça em qualquer ordem — o checklist marca sozinho.",
      dicas: [
        "São os 5 passos que você já praticou: put-lexicon → synthesize-speech (com --lexicon-names) → start-speech-synthesis-task → get/list da tarefa → delete-lexicon.",
        "O léxico do projeto é o audiobook-climb e o bucket de saída é audiobook-climb.",
      ],
      solucao: [
        `aws polly put-lexicon --name audiobook-climb --content ${CONTEUDO_LEX}`,
        'aws polly synthesize-speech --text "Curso de AWS do CLImb" --output-format mp3 --voice-id Thiago --lexicon-names audiobook-climb vinheta.mp3',
        'aws polly start-speech-synthesis-task --text "Capitulo um: computacao em nuvem do zero" --output-format mp3 --voice-id Camila --output-s3-bucket-name audiobook-climb',
        "aws polly list-speech-synthesis-tasks",
        "aws polly delete-lexicon --name audiobook-climb",
      ],
      // Todas as etapas validam por ESTADO — o checklist é reavaliado a cada
      // comando, então depender do `cmd` do momento faria a etapa "desmarcar"
      // no comando seguinte.
      etapas: [
        { texto: "Criar o léxico audiobook-climb", validar: (c) => !!lexDe(c, "audiobook-climb") || !!((c.polly || {}).ultimaSintese || {}).lexicons?.includes("audiobook-climb") },
        { texto: "Gerar a vinheta na hora, com a voz Thiago e o léxico aplicado", validar: (c) => { const s = (c.polly || {}).ultimaSintese; return !!s && s.voz === "Thiago" && String(s.lexicons || "").includes("audiobook-climb"); } },
        { texto: "Mandar o capítulo longo pela síntese assíncrona, saindo no bucket audiobook-climb", validar: (c) => tarefas(c).some((t) => t.bucket === "audiobook-climb") },
        { texto: "Conferir as tarefas de síntese (list ou get)", validar: (c) => !!(c.polly || {}).consultouTarefa },
        { texto: "Apagar o léxico audiobook-climb no fim", validar: (c) => tarefas(c).some((t) => t.bucket === "audiobook-climb") && !lexDe(c, "audiobook-climb") },
      ] },
  ];

  // Entram logo depois da última atividade de polly que já existe.
  if (typeof DESAFIOS !== "undefined") {
    let i = -1;
    for (let k = 0; k < DESAFIOS.length; k++) if (DESAFIOS[k].servico === "polly") i = k;
    if (i >= 0) DESAFIOS.splice(i + 1, 0, ...NOVOS);
    else for (const d of NOVOS) DESAFIOS.push(d);
  }
})();
