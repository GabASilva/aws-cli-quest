"use strict";
// ============================================================
// CLImb — acm-completo.js
// A trilha do ACM parava em "pedi o certificado e ele está PENDING_VALIDATION".
// Faltava tudo o que vem depois — e é aí que mora o trabalho de verdade:
//
//   VALIDAÇÃO — o certificado não se emite sozinho. Você precisa PROVAR que é
//        dono do domínio, e a prova sai daqui: um registro CNAME que você cria
//        no Route 53. Sem esse passo o certificado fica pendente pra sempre.
//   RENOVAÇÃO — certificado emitido pela AWS renova sozinho, mas SÓ enquanto a
//        validação continuar de pé. Quem apaga o CNAME "que não servia pra
//        nada" descobre no dia em que o certificado vence.
//   IMPORTADO — certificado comprado fora entra por import-certificate, e esse
//        NÃO renova sozinho: é você que tem que lembrar.
//
// Comandos conferidos na referência oficial (aws acm).
// ADITIVO: complementa SERVICOS.acm, MANUAIS e PORQUE.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.acm) return;

  function st(conta) {
    conta.acm = conta.acm || { certificados: {} };
    conta.acm.certificados = conta.acm.certificados || {};
    return conta.acm;
  }
  function certDe(conta, flags, op) {
    const s = st(conta);
    const arn = String(exigirFlag(flags, "certificate-arn"));
    const c = s.certificados[arn] || Object.values(s.certificados).find((x) => x.dominio === arn);
    if (!c) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the ${op} operation: Could not find certificate ${arn}`);
    return c;
  }

  // O request-certificate já existia, mas não guardava o registro de validação
  // — que é exatamente a informação que o aluno precisa levar pro Route 53.
  const pedirOriginal = SERVICOS.acm["request-certificate"];
  SERVICOS.acm["request-certificate"] = function (conta, pos, flags) {
    const saida = pedirOriginal(conta, pos, flags);
    try {
      const s = st(conta);
      const arn = (String(saida).match(/"CertificateArn":\s*"([^"]+)"/) || [])[1];
      const c = arn && s.certificados[arn];
      if (c) {
        c.validacao = {
          Name: `_${hexAleatorio(32)}.${c.dominio}.`,
          Type: "CNAME",
          Value: `_${hexAleatorio(32)}.acm-validations.aws.`,
        };
      }
    } catch (e) { /* acessório: o comando principal já respondeu */ }
    return saida;
  };

  Object.assign(SERVICOS.acm, {
    "get-certificate": (conta, pos, flags) => {
      const c = certDe(conta, flags, "GetCertificate");
      if (c.status === "PENDING_VALIDATION") {
        throw new ErroCli(
          "An error occurred (RequestInProgressException) when calling the GetCertificate operation: " +
          "The certificate request is in process and the certificate in your account is not yet available.\n" +
          "Valide o domínio primeiro (crie o CNAME que o describe-certificate mostra)."
        );
      }
      avisarClimb(
        "Vem o certificado E a cadeia (CertificateChain). A cadeia é o que liga o seu certificado à " +
        "autoridade em que o navegador confia — servidor configurado só com o certificado, sem a cadeia, " +
        "funciona no seu navegador e falha no celular de alguém. É um clássico."
      );
      return js({
        Certificate: `-----BEGIN CERTIFICATE-----\n${hexAleatorio(32)}...\n-----END CERTIFICATE-----`,
        CertificateChain: `-----BEGIN CERTIFICATE-----\n${hexAleatorio(32)}...\n-----END CERTIFICATE-----`,
      });
    },

    "add-tags-to-certificate": (conta, pos, flags) => {
      const c = certDe(conta, flags, "AddTagsToCertificate");
      const bruto = String(exigirFlag(flags, "tags"));
      const lista = [];
      for (const p of bruto.split(/\s+/)) {
        const o = parsearShorthand(p);
        if (o.Key) lista.push({ Key: o.Key, Value: o.Value === undefined ? "" : o.Value });
      }
      if (!lista.length) throw new ErroCli("An error occurred (InvalidTagException) when calling the AddTagsToCertificate operation: Tags can't be empty.");
      c.tags = c.tags || {};
      for (const t of lista) c.tags[t.Key] = t.Value;
      return okSilencioso(`Etiquetas aplicadas em ${c.dominio}.`);
    },

    "list-tags-for-certificate": (conta, pos, flags) => {
      const c = certDe(conta, flags, "ListTagsForCertificate");
      return js({ Tags: Object.entries(c.tags || {}).map(([k, v]) => ({ Key: k, Value: v })) });
    },

    "import-certificate": (conta, pos, flags) => {
      const s = st(conta);
      exigirFlag(flags, "certificate");
      exigirFlag(flags, "private-key");
      const arn = `arn:aws:acm:us-east-1:123456789012:certificate/${hexAleatorio(8)}-${hexAleatorio(12)}`;
      s.certificados[arn] = {
        arn, dominio: flags["domain-name"] ? String(flags["domain-name"]) : "importado.exemplo.com",
        metodo: "IMPORTED", status: "ISSUED", tipo: "IMPORTED", criadoEm: agoraIso(),
      };
      avisarClimb(
        "Certificado IMPORTADO já nasce ISSUED — não precisa validar, porque quem validou foi a autoridade " +
        "que o emitiu. Mas atenção ao preço disso: ele NÃO renova sozinho. Certificado emitido pela AWS " +
        "renova automático; o importado é você que tem que lembrar de trocar antes de vencer."
      );
      return js({ CertificateArn: arn });
    },

    "renew-certificate": (conta, pos, flags) => {
      const c = certDe(conta, flags, "RenewCertificate");
      if (c.tipo === "IMPORTED") {
        throw new ErroCli(
          "An error occurred (InvalidRequestException) when calling the RenewCertificate operation: " +
          "Certificate is not eligible for renewal because it was imported.\n" +
          "Certificado importado não renova pela AWS — você precisa importar a versão nova."
        );
      }
      c.renovadoEm = agoraIso();
      avisarClimb(
        "Renovação de certificado emitido pela AWS é automática — este comando só força a checagem. " +
        "O que faz ela FALHAR é o registro de validação ter sido apagado do DNS. Muita gente apaga aquele " +
        "CNAME estranho achando que não serve pra nada, e descobre o erro no dia em que o certificado vence."
      );
      return okSilencioso(`Renovação solicitada para ${c.dominio}.`);
    },

    "resend-validation-email": (conta, pos, flags) => {
      const c = certDe(conta, flags, "ResendValidationEmail");
      exigirFlag(flags, "domain");
      exigirFlag(flags, "validation-domain");
      if (c.metodo !== "EMAIL") {
        throw new ErroCli(
          "An error occurred (InvalidStateException) when calling the ResendValidationEmail operation: " +
          "This certificate is not using email validation.\n" +
          "Só faz sentido com --validation-method EMAIL; com DNS a prova é o registro CNAME."
        );
      }
      return okSilencioso(`E-mail de validação reenviado para os contatos de ${c.dominio}.`);
    },
  });

  // Mostra o registro de validação no describe — é o dado que o aluno leva
  // pro Route 53 e sem o qual o certificado nunca sai de PENDING_VALIDATION.
  const descreverOriginal = SERVICOS.acm["describe-certificate"];
  SERVICOS.acm["describe-certificate"] = function (conta, pos, flags) {
    const saida = descreverOriginal(conta, pos, flags);
    try {
      const c = certDe(conta, flags, "DescribeCertificate");
      if (!c.validacao) return saida;
      const obj = JSON.parse(saida);
      obj.Certificate.Type = c.tipo === "IMPORTED" ? "IMPORTED" : "AMAZON_ISSUED";
      obj.Certificate.RenewalEligibility = c.tipo === "IMPORTED" ? "INELIGIBLE" : "ELIGIBLE";
      obj.Certificate.DomainValidationOptions = [{
        DomainName: c.dominio,
        ValidationMethod: c.metodo,
        ValidationStatus: c.status,
        ResourceRecord: c.validacao,
      }];
      if (c.tags) obj.Certificate.Tags = Object.entries(c.tags).map(([k, v]) => ({ Key: k, Value: v }));
      avisarClimb(
        "O ResourceRecord é a PROVA de que o domínio é seu: crie esse CNAME no Route 53 e a AWS emite o " +
        "certificado sozinha. Enquanto ele não existir, o status fica PENDING_VALIDATION pra sempre — e " +
        "apagá-lo depois quebra a renovação automática."
      );
      return js(obj);
    } catch (e) { return saida; }
  };

  // ---------------- manuais ----------------
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => `USO\n    ${uso}\n\n${txt}`;
    Object.assign(MANUAIS, {
      "acm.get-certificate": M(
        "aws acm get-certificate --certificate-arn <arn>",
        "Baixa o certificado E a cadeia (CertificateChain). A cadeia liga o seu\ncertificado à autoridade em que o navegador confia: servidor configurado\nsem ela funciona num navegador e falha em outro.\nSó funciona depois de ISSUED."),
      "acm.add-tags-to-certificate": M(
        "aws acm add-tags-to-certificate --certificate-arn <arn> --tags Key=ambiente,Value=producao",
        "Aplica etiquetas no certificado — pra saber de qual sistema ele é quando\na conta tiver dezenas."),
      "acm.list-tags-for-certificate": M(
        "aws acm list-tags-for-certificate --certificate-arn <arn>",
        "Mostra as etiquetas do certificado."),
      "acm.import-certificate": M(
        "aws acm import-certificate --certificate file://cert.pem \\\n        --private-key file://chave.pem",
        "Traz pra dentro do ACM um certificado emitido FORA da AWS (comprado de\noutra autoridade). Ele já nasce ISSUED.\n\nO PREÇO: certificado importado NÃO renova sozinho. O emitido pela AWS\nrenova automático; este é você que precisa trocar antes de vencer."),
      "acm.renew-certificate": M(
        "aws acm renew-certificate --certificate-arn <arn>",
        "Força a checagem de renovação de um certificado emitido pela AWS (ela já\né automática). Não funciona em certificado importado.\n\nO que faz a renovação falhar é o registro CNAME de validação ter sido\napagado do DNS — ele precisa continuar lá pra sempre."),
      "acm.resend-validation-email": M(
        "aws acm resend-validation-email --certificate-arn <arn> \\\n        --domain loja.com --validation-domain loja.com",
        "Reenvia o e-mail de validação. Só vale pra certificado pedido com\n--validation-method EMAIL; com DNS a prova é o registro CNAME."),
    });
  }

  // ---------------- porquês ----------------
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "acm.get-certificate": "baixa o certificado e a cadeia. A cadeia é o que faz o navegador confiar: sem ela o site funciona num aparelho e dá erro de segurança em outro.",
      "acm.add-tags-to-certificate": "etiqueta o certificado pra você saber de qual sistema ele é quando a conta tiver dezenas deles.",
      "acm.list-tags-for-certificate": "mostra as etiquetas — é como se descobre o dono de um certificado que ninguém lembra por que existe.",
      "acm.import-certificate": "traz pra dentro da AWS um certificado comprado fora. Ele já nasce válido, mas em troca não renova sozinho: essa lembrança passa a ser sua.",
      "acm.renew-certificate": "força a checagem da renovação. Ela é automática, e o que costuma quebrá-la é alguém ter apagado do DNS o registro de validação achando que não servia pra nada.",
      "acm.resend-validation-email": "reenvia o e-mail que prova que o domínio é seu — só pra quem escolheu validação por e-mail em vez de DNS.",
    });
  }

  // ---------------- arquivos do laboratório ----------------
  // A atividade acm-8 manda importar file://cert.pem — então esses arquivos
  // precisam EXISTIR de verdade: dá pra vê-los no `ls` e ler com `cat`.
  // Mandar usar um arquivo que a pessoa não pode abrir é o defeito que o
  // arquivos-lab.js foi criado pra consertar; não vamos reintroduzi-lo.
  if (typeof ARQUIVOS_LOCAIS !== "undefined") {
    const CONTEUDOS = {
      "cert.pem":
        "-----BEGIN CERTIFICATE-----\n" +
        "MIIDdzCCAl+gAwIBAgIEbG9qYTANBgkqhkiG9w0BAQsFADBcMQswCQYDVQQGEwJC\n" +
        "UjEQMA4GA1UECAwHRXhlbXBsbzEQMA4GA1UECgwHRXhlbXBsbzEjMCEGA1UEAwwa\n" +
        "cGFkYXJpYS1jbGltYi5jb20uYnIgKGZha2UpMB4XDTI2MDkwMTAwMDAwMFoXDTI3\n" +
        "(exemplo didático — não é um certificado real)\n" +
        "-----END CERTIFICATE-----\n",
      "chave.pem":
        "-----BEGIN PRIVATE KEY-----\n" +
        "(chave privada de EXEMPLO, gerada só pra este laboratório)\n" +
        "Numa conta de verdade este arquivo nunca sairia do lugar seguro:\n" +
        "quem tem a chave privada consegue se passar pelo seu site.\n" +
        "-----END PRIVATE KEY-----\n",
    };
    for (const nome of Object.keys(CONTEUDOS)) {
      ARQUIVOS_LOCAIS[nome] = CONTEUDOS[nome].length;
      if (typeof window !== "undefined") {
        window.ARQUIVOS_CONTEUDO = window.ARQUIVOS_CONTEUDO || {};
        window.ARQUIVOS_CONTEUDO[nome] = CONTEUDOS[nome];
      }
    }
  }

  // ---------------- atividades ----------------
  const certs = (c) => Object.values(((c.acm || {}).certificados) || {});

  const ANTES_DA_LIMPEZA = [
    { id: "acm-5", servico: "acm", nivel: 3, xp: 90, titulo: "Onde está a prova de que o domínio é seu",
      descricao: "O certificado está <b>PENDING_VALIDATION</b> e vai continuar assim pra sempre até você provar que o domínio é seu. Essa prova é um <b>registro CNAME</b> que a AWS te dá — e você cria no Route 53. <b>Descreva o certificado</b> e ache o <b>ResourceRecord</b>. <small>(o mesmo describe de antes, agora que você sabe o que procurar nele)</small>",
      dicas: ["É o describe-certificate que você já usou — desta vez olhe o campo DomainValidationOptions.", "A forma é: aws acm describe-certificate --certificate-arn <arn>"],
      solucao: ["aws acm describe-certificate --certificate-arn <cert-arn>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "acm", "describe-certificate") },

    { id: "acm-6", servico: "acm", nivel: 3, xp: 85, titulo: "De qual sistema é este certificado?",
      descricao: "A conta acumulou certificados e ninguém sabe qual é de quê. <b>Etiquete</b> o seu com <b>ambiente=producao</b>.",
      dicas: ["`add-tags-to-certificate` aplica etiquetas na forma abreviada Key=...,Value=...", "A forma é: aws acm add-tags-to-certificate --certificate-arn <arn> --tags Key=ambiente,Value=producao"],
      solucao: ["aws acm add-tags-to-certificate --certificate-arn <cert-arn> --tags Key=ambiente,Value=producao"],
      validar: (c) => certs(c).some((x) => x.tags && x.tags.ambiente === "producao") },

    { id: "acm-7", servico: "acm", nivel: 3, xp: 70, titulo: "Confira as etiquetas",
      descricao: "Alguém do time pergunta se aquele certificado já está marcado como produção. <b>Liste as etiquetas</b> dele.",
      dicas: ["`list-tags-…` mostra as etiquetas — veja a lista de comandos com: aws acm help", "A forma é: aws acm list-tags-for-certificate --certificate-arn <arn>"],
      solucao: ["aws acm list-tags-for-certificate --certificate-arn <cert-arn>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "acm", "list-tags-for-certificate") },

    { id: "acm-8", servico: "acm", nivel: 3, xp: 110, titulo: "Certificado comprado fora",
      descricao: "A empresa já tinha um certificado <b>comprado de outra autoridade</b> e quer usá-lo no load balancer. <b>Importe</b> ele pro ACM (os arquivos <b>cert.pem</b> e <b>chave.pem</b> estão no disco). <small>(digite <code>ls</code> se quiser conferir)</small>",
      dicas: ["`import-certificate` traz pra dentro do ACM um certificado emitido por outra autoridade. Como o conteúdo está em arquivo e não colado na tela, o CLI usa o prefixo `file://`.", "São duas flags: o certificado público e a chave privada. Cuidado com a armadilha: o nome da flag e o nome do arquivo no disco não são iguais — rode `ls` e use exatamente os nomes que estiverem lá."],
      solucao: ["aws acm import-certificate --certificate file://cert.pem --private-key file://chave.pem"],
      validar: (c) => certs(c).some((x) => x.tipo === "IMPORTED") },

    { id: "acm-9", servico: "acm", nivel: 3, xp: 95, titulo: "O que quebra a renovação automática",
      descricao: "Certificado emitido pela AWS <b>renova sozinho</b> — desde que o registro de validação continue no DNS. Muita gente apaga aquele CNAME estranho achando que não serve pra nada e descobre o erro no dia em que o site fica sem HTTPS. <b>Force a checagem de renovação</b> do seu certificado.",
      dicas: ["`renew-certificate` força a checagem — veja a lista de comandos com: aws acm help", "A forma é: aws acm renew-certificate --certificate-arn <arn>"],
      solucao: ["aws acm renew-certificate --certificate-arn <cert-arn>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "acm", "renew-certificate") },

    { id: "acm-10", servico: "acm", nivel: 3, xp: 90, titulo: "Baixe o certificado e a cadeia",
      descricao: "Um servidor fora da AWS vai usar o mesmo certificado, e quem configura pediu os arquivos. <b>Baixe</b> o certificado — e repare que vem a <b>cadeia</b> junto. <small>(servidor configurado sem a cadeia funciona no seu navegador e falha no celular de alguém — é clássico)</small>",
      dicas: ["`get-certificate` baixa o certificado e a cadeia — veja a lista de comandos com: aws acm help", "A forma é: aws acm get-certificate --certificate-arn <arn>"],
      solucao: ["aws acm get-certificate --certificate-arn <cert-importado>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "acm", "get-certificate") },
  ];

  const PROJETO = { id: "acm-proj", servico: "acm", tipo: "projeto", nivel: 3, xp: 330,
    titulo: "🔒 Projeto: HTTPS do pedido à renovação",
    descricao: "A loja vai ganhar cadeado. Você conduz o certificado do começo ao fim: <b>pedir</b> com validação por DNS, <b>achar a prova</b> que o domínio é seu, <b>etiquetar</b> pra ninguém ficar sem saber de quem é, e <b>garantir a renovação</b>. Faça em qualquer ordem — o checklist marca sozinho.",
    dicas: [
      "É o caminho que você praticou: request-certificate → describe-certificate (ache o ResourceRecord) → add-tags-to-certificate → renew-certificate.",
      "O domínio do projeto é padaria-climb.com.br.",
    ],
    solucao: [
      "aws acm request-certificate --domain-name padaria-climb.com.br --validation-method DNS",
      "aws acm describe-certificate --certificate-arn <cert-arn>",
      "aws acm add-tags-to-certificate --certificate-arn <cert-arn> --tags Key=ambiente,Value=producao",
      "aws acm renew-certificate --certificate-arn <cert-arn>",
    ],
    etapas: [
      { texto: "Pedir o certificado de padaria-climb.com.br com validação por DNS", validar: (c) => certs(c).some((x) => x.dominio === "padaria-climb.com.br" && x.metodo === "DNS") },
      { texto: "Descobrir o registro CNAME que prova o domínio (describe)", validar: (c) => certs(c).some((x) => x.dominio === "padaria-climb.com.br" && !!x.validacao) },
      { texto: "Etiquetar o certificado com ambiente=producao", validar: (c) => certs(c).some((x) => x.dominio === "padaria-climb.com.br" && x.tags && x.tags.ambiente === "producao") },
      { texto: "Garantir a renovação (renew-certificate)", validar: (c) => certs(c).some((x) => x.dominio === "padaria-climb.com.br" && !!x.renovadoEm) },
    ] };

  if (typeof DESAFIOS !== "undefined") {
    // As novas entram ANTES do acm-4 (delete-certificate): apagar é o fecho.
    const iLimpeza = DESAFIOS.findIndex((d) => d.id === "acm-4");
    if (iLimpeza >= 0) DESAFIOS.splice(iLimpeza, 0, ...ANTES_DA_LIMPEZA);
    else DESAFIOS.push(...ANTES_DA_LIMPEZA);
    let ultimo = -1;
    for (let k = 0; k < DESAFIOS.length; k++) if (DESAFIOS[k].servico === "acm") ultimo = k;
    if (ultimo >= 0) DESAFIOS.splice(ultimo + 1, 0, PROJETO);
    else DESAFIOS.push(PROJETO);
  }
})();
