"use strict";
// ============================================================
// CLImb — simulados-arte.js
// Diagramas em ASCII no gabarito comentado.
//
// POR QUE LIGADO À FONTE, E NÃO AO ID: cada questão já aponta para uma chave
// de conceito em simulados-fontes.js ("shared", "globalinfra", "sgnacl"...).
// Reusar esse índice faz um desenho cobrir todas as questões do mesmo tema —
// e mantém desenho e explicação sempre falando da mesma coisa.
//
// ONDE AJUDA MAIS: só entram conceitos que são ESPACIAIS ou de CAMADA, onde
// a figura diz em dois segundos o que o texto leva um parágrafo. Lista de
// nomes (os 6 pilares, as 7 Rs) não vira desenho — vira lista com moldura, e
// isso é enfeite, não ajuda. Por isso ficaram de fora.
//
// LARGURA: máximo 52 colunas. O gabarito é lido no celular, e monoespaçado
// que estoura a largura quebra a linha e destrói o alinhamento do desenho.
// ============================================================
(function () {
  if (typeof window === "undefined") return;

  const ARTE = {

    // Modelo de responsabilidade compartilhada — 13 questões
    shared: [
      "        VOCÊ  ── segurança NA nuvem ──",
      "  ┌──────────────────────────────────────┐",
      "  │  seus dados                          │",
      "  │  quem acessa o quê (IAM)             │",
      "  │  sistema operacional e app da EC2    │",
      "  │  criptografia · regras de firewall   │",
      "  ├──────────────────────────────────────┤",
      "  │  software: compute · storage · banco │",
      "  │  hardware: Regiões · AZs · rede      │",
      "  │  segurança física dos data centers   │",
      "  └──────────────────────────────────────┘",
      "        AWS   ── segurança DA nuvem ──",
      "",
      "  Regra de bolso: se você configura, é seu.",
    ].join("\n"),

    // Infraestrutura global — 10 questões
    globalinfra: [
      "  REGIÃO  (ex.: sa-east-1, São Paulo)",
      "  ┌────────────────────────────────────────┐",
      "  │   AZ-a         AZ-b         AZ-c       │",
      "  │  ┌───────┐    ┌───────┐    ┌───────┐   │",
      "  │  │ data  │    │ data  │    │ data  │   │",
      "  │  │center │    │center │    │center │   │",
      "  │  └───────┘    └───────┘    └───────┘   │",
      "  │   energia e rede independentes         │",
      "  └────────────────────────────────────────┘",
      "",
      "  EDGE LOCATIONS  ·  ·  ·  espalhados pelo",
      "  mundo, perto do usuário (cache CloudFront)",
      "",
      "  Alta disponibilidade = espalhar entre AZs.",
      "  Baixa latência global = edge locations.",
    ].join("\n"),

    // Security Group x NACL — a dúvida clássica é ONDE cada um age
    sgnacl: [
      "            internet",
      "               │",
      "  ┌────────────▼──────────── SUB-REDE ────┐",
      "  │  NACL — sem estado, permite E nega    │",
      "  │  (avalia entrada e saída separadas)   │",
      "  │                                       │",
      "  │   ┌───────────────────────────────┐   │",
      "  │   │ SECURITY GROUP — com estado   │   │",
      "  │   │ (só permite; resposta volta   │   │",
      "  │   │  automaticamente)             │   │",
      "  │   │        ┌────────────┐         │   │",
      "  │   │        │ instância  │         │   │",
      "  │   │        └────────────┘         │   │",
      "  │   └───────────────────────────────┘   │",
      "  └───────────────────────────────────────┘",
      "",
      "  NACL protege a SUB-REDE. SG protege a",
      "  INSTÂNCIA. O tráfego passa pelos dois.",
    ].join("\n"),

    // CloudFront — 6 questões
    cloudfront: [
      "  usuário          edge mais próximo      origem",
      "  (Recife)   ──►   (ponto de presença) ──► (S3/ALB)",
      "",
      "        tem no cache?",
      "          ├── sim ──► responde na hora  (rápido)",
      "          └── não ──► busca na origem, guarda",
      "                      e responde",
      "",
      "  A 2ª pessoa a pedir o mesmo arquivo já pega",
      "  do edge — sem atravessar o mundo de novo.",
    ].join("\n"),

    // Classes do S3 — o eixo é frequência de acesso x custo
    s3classes: [
      "  acesso frequente                  raro/nunca",
      "  ├──────────┬──────────┬──────────┬─────────►",
      "  Standard   Standard   Glacier    Glacier",
      "             -IA        Instant    Deep Archive",
      "",
      "  custo de ARMAZENAR:  alto ──────────► baixo",
      "  custo de RESGATAR:   baixo ─────────► alto",
      "  tempo pra recuperar: ms ──────► horas",
      "",
      "  Intelligent-Tiering: a AWS move sozinha,",
      "  quando você NÃO sabe o padrão de acesso.",
    ].join("\n"),

    // Modelos de compra do EC2
    ec2pricing: [
      "  mais caro, mais flexível",
      "  ┌───────────────────────────────────────┐",
      "  │ Sob demanda   paga por hora/segundo,  │",
      "  │               sem compromisso         │",
      "  ├───────────────────────────────────────┤",
      "  │ Savings Plans compromisso de gasto    │",
      "  │ / Reservadas  por 1 ou 3 anos (-72%)  │",
      "  ├───────────────────────────────────────┤",
      "  │ Spot          capacidade ociosa,      │",
      "  │               pode ser interrompida   │",
      "  └───────────────────────────────────────┘",
      "  mais barato, menos garantia",
      "",
      "  Spot = tolerante a interrupção (lote, teste).",
      "  Reservada/Savings = carga estável e prevista.",
    ].join("\n"),

    // Filas, tópicos e barramento — a confusão mais comum de integração
    sqs: [
      "  SQS — FILA (1 consumidor pega cada mensagem)",
      "    produtor ──► [ m3 m2 m1 ] ──► consumidor",
      "                  a mensagem espera até ser lida",
      "",
      "  SNS — TÓPICO (todos os inscritos recebem)",
      "                      ┌──► e-mail",
      "    publicador ──► () ├──► Lambda",
      "                      └──► fila SQS",
      "",
      "  EventBridge — BARRAMENTO (roteia por regra)",
      "    evento ──► [regra: origem? tipo?] ──► destino",
    ].join("\n"),

    // Alta disponibilidade com ELB + Auto Scaling
    autoscaling: [
      "              usuários",
      "                 │",
      "         ┌───────▼────────┐",
      "         │ Load Balancer  │  distribui a carga",
      "         └───┬───────┬────┘",
      "     AZ-a    │       │    AZ-b",
      "   ┌─────────▼──┐ ┌──▼─────────┐",
      "   │ EC2   EC2  │ │ EC2   EC2  │",
      "   └────────────┘ └────────────┘",
      "        ▲                ▲",
      "        └── Auto Scaling ┘",
      "     sobe quando a demanda cresce,",
      "     desce quando cai (elasticidade)",
      "",
      "  Duas AZs: se uma cai, a outra atende.",
    ].join("\n"),

    // VPC: pública x privada
    vpc: [
      "  VPC  10.0.0.0/16",
      "  ┌──────────────────────────────────────┐",
      "  │ SUB-REDE PÚBLICA                     │",
      "  │  ┌──────────┐        ┌────────────┐  │",
      "  │  │ servidor │◄──────►│  Internet  │  │",
      "  │  │   web    │        │  Gateway   │──┼─► net",
      "  │  └──────────┘        └────────────┘  │",
      "  ├──────────────────────────────────────┤",
      "  │ SUB-REDE PRIVADA                     │",
      "  │  ┌──────────┐        ┌────────────┐  │",
      "  │  │  banco   │───────►│ NAT Gateway│──┼─► saída",
      "  │  └──────────┘        └────────────┘  │",
      "  └──────────────────────────────────────┘",
      "",
      "  Pública = tem rota para o Internet Gateway.",
      "  NAT deixa a privada sair, mas ninguém entrar.",
    ].join("\n"),

    // Planos de suporte — escada de tempo de resposta
    support: [
      "  tempo de resposta (caso mais grave)",
      "",
      "  Basic          ──  sem suporte técnico",
      "  Developer*     ──  < 12 h (horário comercial)",
      "  Business*      ──  < 1 h  (produção fora do ar)",
      "  Ent. On-Ramp*  ──  < 30 min (business-critical)",
      "  Enterprise     ──  < 15 min (business-critical)",
      "                     + TAM dedicado",
      "",
      "  * Developer, Business e Enterprise On-Ramp",
      "    saem de linha em 01/01/2027; o substituto",
      "    é o Business Support+ (< 30 min).",
      "    A prova ainda cobra os nomes antigos.",
    ].join("\n"),

    // Modelos de implantação
    deploymodels: [
      "  NUVEM            HÍBRIDO           LOCAL",
      "  ┌─────────┐   ┌───────────────┐  ┌────────┐",
      "  │  tudo   │   │  parte AWS +  │  │ tudo no│",
      "  │  na AWS │   │  parte no seu │  │ seu    │",
      "  │         │   │  data center  │  │ prédio │",
      "  └─────────┘   └───────────────┘  └────────┘",
      "   nasce na       liga os dois      on-premises",
      "   nuvem          (Direct Connect,",
      "                   Outposts, VPN)",
    ].join("\n"),

    // Storage Gateway — 4 tipos, híbrido
    storagegateway: [
      "  SEU DATA CENTER          │        AWS",
      "                           │",
      "  aplicação ──► gateway ───┼──► armazenamento",
      "                           │",
      "  tipos:                   │",
      "   S3 File Gateway   NFS/SMB  ──► S3",
      "   FSx File Gateway  SMB      ──► FSx Windows",
      "   Volume Gateway    iSCSI    ──► EBS snapshots",
      "   Tape Gateway      VTL      ──► S3/Glacier",
      "",
      "  A aplicação continua falando o protocolo",
      "  de sempre — quem traduz é o gateway.",
    ].join("\n"),
  };

  // Um mesmo desenho serve chaves irmãs (o conceito é o mesmo).
  const APELIDOS = {
    sg: "sgnacl", nacl: "sgnacl",
    igw: "vpc", natgw: "vpc", routetable: "vpc", vpcflowlogs: "vpc",
    elb: "autoscaling",
    sns: "sqs", eventbridge: "sqs",
    spot: "ec2pricing", savingsplans: "ec2pricing", ec2types: "ec2pricing",
    s3lifecycle: "s3classes",
    datasync: "storagegateway",
  };

  function arteDe(chaveDaFonte) {
    if (!chaveDaFonte) return null;
    const k = APELIDOS[chaveDaFonte] || chaveDaFonte;
    return ARTE[k] || null;
  }

  window.SIMULADOS_ARTE = ARTE;
  window.SIMULADOS_ARTE_DE = arteDe;
})();
