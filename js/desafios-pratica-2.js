"use strict";
// ============================================================
// CLImb — desafios-pratica-2.js
// Reforço das trilhas da fase 2 em diante. O `desafios-pratica.js` só cobre os
// oito serviços da fase 1 (S3, EC2, IAM, Lambda, DynamoDB, VPC, RDS,
// CloudWatch) — do SQS pra frente cada comando era ensinado UMA vez e nunca
// mais praticado, e por isso aquelas trilhas tinham 9 ou 10 atividades contra
// as 21 do EC2.
//
// O molde é o mesmo do EC2, que é o que faz aquela trilha funcionar: a
// atividade que INTRODUZ o comando é seguida de uma que mostra ONDE ele é usado
// de verdade (com as flags que acompanham) e de uma ou duas de fixação, cada
// uma num cenário diferente. Nunca o mesmo enunciado com outro nome de recurso.
//
// Regras que valem aqui (ver CLAUDE.md):
// - inserido logo DEPOIS do comando que pratica (`at`), nunca no fim da trilha;
// - nome de recurso único no projeto inteiro (a conta do fumaça é compartilhada);
// - `dicas` escritas uma a uma — dica de molde repetido é o que o analise.js
//   acusa, e é exatamente a repetição que faz o aluno parar de ler.
// ============================================================
(function () {
  if (typeof DESAFIOS === "undefined") return;

  // Insere `novos` logo depois do desafio `anchorId` (mesma trilha = ordem certa).
  function at(anchorId, novos) {
    const i = DESAFIOS.findIndex((d) => d.id === anchorId);
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
  // atalho pra montar desafio (mesma assinatura do desafios-pratica.js — o
  // lib/sem-gabarito.js corta os argumentos 7 e 8 por POSIÇÃO, então não mexa)
  function d(id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar) {
    return { id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar };
  }

  const URL = (n) => "https://sqs.us-east-1.amazonaws.com/123456789012/" + n;
  const ARN = (n) => "arn:aws:sns:us-east-1:123456789012:" + n;
  const fila = (c, n) => ((c.sqs || {}).filas || {})[n];
  const msgs = (c, n) => ((fila(c, n) || {}).mensagens || []);
  const topico = (c, n) => ((c.sns || {}).topicos || {})[n];
  const assin = (c, n) => ((topico(c, n) || {}).assinaturas || []);

  // ===================== SQS =====================
  // create-queue — onde a fila entra no dia a dia, e dois cenários de fixação
  // Fixacao de create-queue DEPOIS do send-message, e nao logo apos o sqs-2:
  // a trilha e paga e as 3 primeiras sao a amostra gratis. Com a fixacao na
  // posicao 3 a amostra virava list + create + create de novo, e o aluno nao
  // chegava ao send-message, que e a parte que mostra pra que fila serve.
  at("sqs-3", [
    d("psqs-cq1", "sqs", 2, 50, "O app de entrega não pode travar",
      "No seu app de delivery, confirmar o pedido e chamar o entregador são duas coisas: se a segunda demora, o cliente fica olhando a telinha girar. A fila resolve — o pedido é aceito na hora e o despacho acontece atrás. Crie a fila <b>entregas-app</b>.",
      ["Fila serve pra desacoplar: quem produz não espera quem consome.", "Criar é `create-queue`, e o nome vai em `--queue-name`."],
      ["aws sqs create-queue --queue-name entregas-app"],
      (c) => !!fila(c, "entregas-app")),
    d("psqs-cq2", "sqs", 2, 50, "E-mail de boas-vindas não pode se perder",
      "Todo cadastro novo dispara um e-mail de boas-vindas. Se o servidor de e-mail estiver fora do ar, o cadastro não pode falhar junto. Crie a fila <b>emails-boas-vindas</b> pra segurar esses envios.",
      ["A fila guarda a tarefa até alguém conseguir executá-la — é isso que evita perder o e-mail.", "Mesma forma da anterior, trocando o nome da fila."],
      ["aws sqs create-queue --queue-name emails-boas-vindas"],
      (c) => !!fila(c, "emails-boas-vindas")),
    // send-message — a mensagem é o pedido de trabalho
    d("psqs-sm1", "sqs", 2, 60, "O pedido da marmita entra na fila",
      "A cozinha do restaurante lê a fila pra saber o que preparar. Crie a fila <b>pedidos-marmita</b> e mande o primeiro pedido: <b>marmita 42</b>.",
      ["São dois comandos: primeiro a fila existe, depois a mensagem entra.", "O texto da mensagem vai em `--message-body`, entre aspas.", "A URL da fila é a que o create-queue devolveu."],
      ["aws sqs create-queue --queue-name pedidos-marmita", "aws sqs send-message --queue-url " + URL("pedidos-marmita") + " --message-body \"marmita 42\""],
      (c) => msgs(c, "pedidos-marmita").some((m) => String(m.corpo).indexOf("marmita 42") >= 0)),
    d("psqs-sm2", "sqs", 2, 70, "Três vídeos esperando conversão",
      "Converter vídeo é lento, então o site só joga o trabalho na fila e responde na hora. Crie <b>uploads-video</b> e enfileire os três uploads do dia: <b>video-1</b>, <b>video-2</b> e <b>video-3</b>.",
      ["Uma mensagem por vídeo: o send-message roda três vezes.", "Cada envio repete a mesma URL e muda só o `--message-body`."],
      ["aws sqs create-queue --queue-name uploads-video",
        "aws sqs send-message --queue-url " + URL("uploads-video") + " --message-body \"video-1\"",
        "aws sqs send-message --queue-url " + URL("uploads-video") + " --message-body \"video-2\"",
        "aws sqs send-message --queue-url " + URL("uploads-video") + " --message-body \"video-3\""],
      (c) => msgs(c, "uploads-video").length >= 3),
  ]);
  // get-queue-attributes — medir o acúmulo antes de culpar o servidor
  at("sqs-4", [
    d("psqs-attr1", "sqs", 2, 60, "O relatório da noite não saiu",
      "Os relatórios noturnos não chegaram e ninguém sabe se o problema foi o gerador ou a entrada. Crie <b>relatorios-noturnos</b>, enfileire <b>fechamento-caixa</b> e <b>ranking-vendas</b> e <b>olhe quantas mensagens estão paradas</b> — é esse número que diz se o trabalho está chegando e não sendo consumido.",
      ["`ApproximateNumberOfMessages` é a medida de fila parada; ela sai do get-queue-attributes.", "Peça tudo de uma vez com `--attribute-names All`."],
      ["aws sqs create-queue --queue-name relatorios-noturnos",
        "aws sqs send-message --queue-url " + URL("relatorios-noturnos") + " --message-body \"fechamento-caixa\"",
        "aws sqs send-message --queue-url " + URL("relatorios-noturnos") + " --message-body \"ranking-vendas\"",
        "aws sqs get-queue-attributes --queue-url " + URL("relatorios-noturnos") + " --attribute-names All"],
      (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "get-queue-attributes") &&
        String(cmd.flags["queue-url"] || "").indexOf("relatorios-noturnos") >= 0),
  ]);
  // receive-message — o trabalhador puxando serviço
  at("sqs-5", [
    d("psqs-rm1", "sqs", 2, 70, "A impressora puxa o próximo trabalho",
      "No laboratório, cada impressora 3D pega uma peça por vez da fila. Crie <b>tarefas-impressao</b>, enfileire a peça <b>suporte-camera</b> e <b>puxe</b> a tarefa como a impressora faria.",
      ["Quem consome não recebe a mensagem de presente: ele vai buscar, com receive-message.", "Enquanto a mensagem está em processamento ela some da fila pros outros — é o visibility timeout."],
      ["aws sqs create-queue --queue-name tarefas-impressao",
        "aws sqs send-message --queue-url " + URL("tarefas-impressao") + " --message-body \"suporte-camera\"",
        "aws sqs receive-message --queue-url " + URL("tarefas-impressao")],
      (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "receive-message") &&
        msgs(c, "tarefas-impressao").some((m) => m.recebida)),
  ]);
  // delete-message — fecha a história da impressora
  at("sqs-6", [
    d("psqs-dm1", "sqs", 3, 90, "A peça saiu: confirme o serviço",
      "A impressora terminou o <b>suporte-camera</b>. Enquanto você não confirmar, a SQS vai achar que o trabalho se perdeu e devolver a peça pra fila — e amanhã tem duas iguais. Apague a mensagem da fila <b>tarefas-impressao</b>.",
      ["Confirmar processamento é apagar a mensagem; não existe comando ack.", "O `--receipt-handle` é o comprovante que veio no receive-message, não o id da mensagem."],
      ["aws sqs delete-message --queue-url " + URL("tarefas-impressao") + " --receipt-handle <receipt-handle>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "delete-message") &&
        !!fila(c, "tarefas-impressao") && msgs(c, "tarefas-impressao").length === 0),
  ]);
  // FIFO — quando a ordem muda o resultado
  at("sqs-7", [
    d("psqs-fifo1", "sqs", 3, 80, "Baixa de estoque fora de ordem vende o que não tem",
      "Se a baixa de estoque chegar antes da reposição, o site anuncia produto que não existe. Aqui a ordem é o produto. Crie a fila <b>estoque-baixa.fifo</b> garantindo a entrega em ordem.",
      ["Fila FIFO é escolha na criação, não dá pra converter depois.", "O nome precisa terminar em `.fifo` E o atributo `FifoQueue=true` precisa ir junto."],
      ["aws sqs create-queue --queue-name estoque-baixa.fifo --attributes FifoQueue=true"],
      (c) => !!fila(c, "estoque-baixa.fifo") && fila(c, "estoque-baixa.fifo").tipo === "FIFO"),
  ]);
  // delete-queue — limpar o que a campanha deixou
  at("sqs-8", [
    d("psqs-dq1", "sqs", 3, 80, "A campanha de Natal acabou",
      "A promoção terminou e a fila <b>promo-natal</b> só ocupa espaço no inventário do time. Crie ela e, em seguida, apague — é o ciclo de vida completo de um recurso temporário.",
      ["Apagar a fila pede a URL, não o nome.", "Fila apagada não volta, e a AWS bloqueia recriar o mesmo nome por 60 segundos."],
      ["aws sqs create-queue --queue-name promo-natal",
        "aws sqs delete-queue --queue-url " + URL("promo-natal")],
      (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "delete-queue") && !fila(c, "promo-natal")),
  ]);
  // get-queue-url — achar a fila pelo nome
  at("cob-sqs-1", [
    d("psqs-url1", "sqs", 2, 60, "O script só sabe o nome da fila",
      "Seu script de deploy recebe o nome da fila, mas todo comando da SQS quer a URL. Crie <b>notas-fiscais</b> e descubra a URL dela a partir do nome.",
      ["O nome é seu, a URL é da AWS: quem traduz um no outro é o get-queue-url.", "A flag aqui é `--queue-name`, e não `--queue-url`."],
      ["aws sqs create-queue --queue-name notas-fiscais",
        "aws sqs get-queue-url --queue-name notas-fiscais"],
      (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "get-queue-url") && cmd.flags["queue-name"] === "notas-fiscais"),
  ]);
  // purge-queue — o botão perigoso
  at("cob-sqs-2", [
    d("psqs-purge1", "sqs", 3, 90, "O teste de carga sujou a fila",
      "Alguém apontou o teste de carga pra fila errada e deixou lixo lá dentro. Crie <b>testes-carga</b>, enfileire <b>lote-a</b> e <b>lote-b</b> e limpe tudo de uma vez. <small>(em produção pense duas vezes: o purge descarta mensagem boa junto)</small>",
      ["Apagar uma por uma seria delete-message; aqui o assunto é esvaziar a fila inteira.", "O purge não apaga a fila — ela continua lá, vazia."],
      ["aws sqs create-queue --queue-name testes-carga",
        "aws sqs send-message --queue-url " + URL("testes-carga") + " --message-body \"lote-a\"",
        "aws sqs send-message --queue-url " + URL("testes-carga") + " --message-body \"lote-b\"",
        "aws sqs purge-queue --queue-url " + URL("testes-carga")],
      (c, cmd, ok) => ok && ehCmd(cmd, "sqs", "purge-queue") &&
        !!fila(c, "testes-carga") && msgs(c, "testes-carga").length === 0),
  ]);

  // ===================== SNS =====================
  // create-topic — o tópico é o megafone, não o destinatário
  // Mesmo motivo do SQS: fixacao fora das 3 primeiras (amostra gratis).
  at("sns-3", [
    d("psns-ct1", "sns", 2, 50, "Um aviso, muitos interessados",
      "Quando um pedido sai pra entrega, o cliente quer saber, o suporte quer saber e o painel quer atualizar. Em vez de avisar um por um, você publica uma vez num tópico e cada interessado se inscreve. Crie o tópico <b>avisos-entrega</b>.",
      ["Tópico não guarda mensagem: ele repassa na hora pra quem estiver inscrito.", "O nome do tópico vai em `--name` (e não em `--topic-name`)."],
      ["aws sns create-topic --name avisos-entrega"],
      (c) => !!topico(c, "avisos-entrega")),
    d("psns-ct2", "sns", 2, 50, "O plantão precisa acordar",
      "Se o servidor cair às 3 da manhã, alguém tem que ser acordado. Crie o tópico <b>alertas-servidor</b>, que é pra onde os alarmes vão gritar.",
      ["É o mesmo comando de criar tópico — muda o propósito, não a forma.", "Guarde o ARN que volta: é ele que identifica o tópico nos próximos comandos."],
      ["aws sns create-topic --name alertas-servidor"],
      (c) => !!topico(c, "alertas-servidor")),
    // subscribe — cada protocolo tem seu uso
    d("psns-sub1", "sns", 2, 70, "Inscreva o plantonista",
      "O plantonista desta semana é a <b>plantao@climb-labs.com</b>. Inscreva esse e-mail no tópico <b>alertas-servidor</b>. <small>(na AWS de verdade ele ainda precisa clicar no link de confirmação — por isso a resposta vem como pending confirmation)</small>",
      ["Inscrição tem três partes: em qual tópico, por qual meio, e pra qual endereço.", "O meio é `--protocol email` e o endereço vai em `--notification-endpoint`."],
      ["aws sns subscribe --topic-arn " + ARN("alertas-servidor") + " --protocol email --notification-endpoint plantao@climb-labs.com"],
      (c) => assin(c, "alertas-servidor").some((a) => a.protocolo === "email" && a.endpoint === "plantao@climb-labs.com")),
    d("psns-sub2", "sns", 2, 70, "O cliente prefere SMS",
      "Cliente não lê e-mail esperando a pizza, mas olha o celular. Inscreva o número <b>+5511999990000</b> no tópico <b>avisos-entrega</b> por SMS.",
      ["O tópico é o mesmo pra todo mundo; o que muda por inscrito é o protocolo.", "Troque o protocolo pra `sms` e mande o número no endpoint, com o código do país."],
      ["aws sns subscribe --topic-arn " + ARN("avisos-entrega") + " --protocol sms --notification-endpoint +5511999990000"],
      (c) => assin(c, "avisos-entrega").some((a) => a.protocolo === "sms")),
  ]);
  // publish — publicar é disparar pra todos de uma vez
  at("sns-4", [
    d("psns-pub1", "sns", 2, 70, "Saiu pra entrega",
      "O entregador pegou o pedido. Publique <b>Seu pedido saiu para entrega</b> no tópico <b>avisos-entrega</b> e repare: você não escolhe quem recebe — quem se inscreveu recebe.",
      ["Publicar é pro tópico, nunca pro inscrito.", "O texto vai em `--message`, entre aspas."],
      ["aws sns publish --topic-arn " + ARN("avisos-entrega") + " --message \"Seu pedido saiu para entrega\""],
      (c, cmd, ok) => ok && ehCmd(cmd, "sns", "publish") &&
        String(cmd.flags["topic-arn"] || "").indexOf("avisos-entrega") >= 0),
    d("psns-pub2", "sns", 2, 80, "Disco cheio às 3 da manhã",
      "O monitoramento detectou o disco em 95%. Publique <b>Disco em 95 por cento no servidor de banco</b> no tópico <b>alertas-servidor</b> pra acordar o plantonista que você acabou de inscrever.",
      ["O mesmo publish serve pra alarme e pra aviso de cliente — o que muda é o tópico.", "Confira o ARN: publicar no tópico errado avisa a pessoa errada."],
      ["aws sns publish --topic-arn " + ARN("alertas-servidor") + " --message \"Disco em 95 por cento no servidor de banco\""],
      (c, cmd, ok) => ok && ehCmd(cmd, "sns", "publish") &&
        String(cmd.flags["topic-arn"] || "").indexOf("alertas-servidor") >= 0),
  ]);
  // list-subscriptions-by-topic — auditoria de quem recebe
  at("sns-5", [
    d("psns-list1", "sns", 2, 60, "Quem ainda recebe isso?",
      "Faz meses que ninguém revisa a lista, e avisos internos podem estar indo pra gente que saiu da empresa. Liste <b>as inscrições do tópico avisos-entrega</b> e veja quem está lá.",
      ["A pergunta é por tópico, então o comando pede o ARN dele.", "Olhe a coluna Protocol: e-mail, SMS e fila aparecem misturados na mesma lista."],
      ["aws sns list-subscriptions-by-topic --topic-arn " + ARN("avisos-entrega")],
      (c, cmd, ok) => ok && ehCmd(cmd, "sns", "list-subscriptions-by-topic") &&
        String(cmd.flags["topic-arn"] || "").indexOf("avisos-entrega") >= 0),
  ]);
  // fan-out SNS ➜ SQS — o padrão que aparece em toda arquitetura séria
  at("sns-6", [
    d("psns-fan1", "sns", 3, 100, "A venda tem que virar nota fiscal",
      "Toda venda concluída precisa gerar nota fiscal, e a emissora é lenta demais pra segurar o checkout. Crie a fila <b>nota-fiscal-fila</b>, o tópico <b>venda-concluida</b> e inscreva a fila no tópico.",
      ["SNS avisa na hora; SQS guarda até dar conta. Juntos, o checkout não espera e nada se perde.", "O endpoint da inscrição é o ARN da fila (arn:aws:sqs:...), não a URL dela."],
      ["aws sqs create-queue --queue-name nota-fiscal-fila",
        "aws sns create-topic --name venda-concluida",
        "aws sns subscribe --topic-arn " + ARN("venda-concluida") + " --protocol sqs --notification-endpoint arn:aws:sqs:us-east-1:123456789012:nota-fiscal-fila"],
      (c) => !!fila(c, "nota-fiscal-fila") &&
        assin(c, "venda-concluida").some((a) => a.protocolo === "sqs")),
    d("psns-fan2", "sns", 3, 110, "Publique e veja a nota cair sozinha",
      "Agora publique <b>venda 7781 concluida</b> no tópico <b>venda-concluida</b> e confira a fila <b>nota-fiscal-fila</b>: a mensagem chega lá sem ninguém ter mandado pra fila. Esse é o ponto do fan-out — o produtor não conhece os consumidores.",
      ["São dois comandos: publicar no tópico e depois olhar os atributos da fila.", "Se ApproximateNumberOfMessages subir, a entrega funcionou."],
      ["aws sns publish --topic-arn " + ARN("venda-concluida") + " --message \"venda 7781 concluida\"",
        "aws sqs get-queue-attributes --queue-url " + URL("nota-fiscal-fila") + " --attribute-names All"],
      (c) => msgs(c, "nota-fiscal-fila").some((m) => String(m.corpo).indexOf("7781") >= 0)),
  ]);
  // delete-topic — desligar o megafone da campanha
  at("sns-8", [
    d("psns-del1", "sns", 3, 80, "Black Friday encerrada",
      "A campanha acabou e o tópico <b>promo-black-friday</b> não deve mais existir — tópico esquecido é aviso indo pra cliente em fevereiro. Crie e apague.",
      ["Apagar o tópico leva junto todas as inscrições dele.", "Quem se inscreveu não é avisado do fim: simplesmente para de receber."],
      ["aws sns create-topic --name promo-black-friday",
        "aws sns delete-topic --topic-arn " + ARN("promo-black-friday")],
      (c, cmd, ok) => ok && ehCmd(cmd, "sns", "delete-topic") && !topico(c, "promo-black-friday")),
  ]);
  // fan-out pra DUAS filas — o clímax da trilha
  at("cob-sns-1", [
    d("psns-fan3", "sns", 3, 120, "Um pagamento, dois times",
      "Quando o pagamento é aprovado, o estoque precisa reservar a peça e a logística precisa agendar a coleta — times diferentes, sistemas diferentes, mesma notícia. Crie as filas <b>estoque-fila</b> e <b>entrega-fila</b>, o tópico <b>pedido-pago</b>, inscreva as duas e publique <b>pedido 902 pago</b> uma única vez.",
      ["Repare no que você NÃO faz: nenhum send-message. Quem entrega nas filas é o tópico.", "Duas inscrições no mesmo tópico, uma pra cada ARN de fila.", "Um único publish alimenta as duas — é por isso que o padrão se chama fan-out."],
      ["aws sqs create-queue --queue-name estoque-fila",
        "aws sqs create-queue --queue-name entrega-fila",
        "aws sns create-topic --name pedido-pago",
        "aws sns subscribe --topic-arn " + ARN("pedido-pago") + " --protocol sqs --notification-endpoint arn:aws:sqs:us-east-1:123456789012:estoque-fila",
        "aws sns subscribe --topic-arn " + ARN("pedido-pago") + " --protocol sqs --notification-endpoint arn:aws:sqs:us-east-1:123456789012:entrega-fila",
        "aws sns publish --topic-arn " + ARN("pedido-pago") + " --message \"pedido 902 pago\""],
      (c) => msgs(c, "estoque-fila").length >= 1 && msgs(c, "entrega-fila").length >= 1),
  ]);
})();
