"use strict";
// ============================================================
// AWS CLI Quest — setup-lab.js
// Trilha "🚀 Primeiros passos (Setup)": recria o lab da AWS de instalar e
// configurar o CLI numa instância Red Hat — a parte que vem ANTES dos
// comandos aws e que o resto do Quest assume pronta:
//   SSH → curl → unzip → sudo ./aws/install → aws --version → aws configure
//   (interativo!) → aws iam list-users
//
// ADITIVO: faz wrap da global executarLinha (app.js) pra entender os comandos
// de shell do lab e o configure interativo. Não toca app.js/jogo.js.
// O estado do setup vive em jogo.conta.setup (sincroniza/persiste junto).
// ============================================================

const DESAFIOS_SETUP = [
  {
    id: "setup-1", servico: "setup", nivel: 1, xp: 40,
    titulo: "Conecte na instância (SSH)",
    descricao: "Tudo começa entrando na máquina. Estabeleça uma conexão <b>SSH</b> na instância Red Hat usando a chave <b>labsuser.pem</b> e o usuário <b>ec2-user</b> (o IP do lab é <b>54.81.12.34</b>).",
    dicas: ["O formato é: ssh -i <chave> <usuário>@<ip>", "ssh -i labsuser.pem ec2-user@54.81.12.34"],
    solucao: ["ssh -i labsuser.pem ec2-user@54.81.12.34"],
    validar: (conta) => !!(conta.setup && conta.setup.ssh),
  },
  {
    id: "setup-2", servico: "setup", nivel: 1, xp: 50,
    titulo: "Baixe o instalador do CLI",
    descricao: "Red Hat não vem com o AWS CLI. Baixe o instalador oficial com <b>curl</b>, salvando como <b>awscliv2.zip</b> (opção <code>-o</code>).",
    dicas: ["curl \"<url>\" -o \"awscliv2.zip\"", 'curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"'],
    solucao: ['curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"'],
    validar: (conta) => !!(conta.setup && conta.setup.baixou),
  },
  {
    id: "setup-3", servico: "setup", nivel: 1, xp: 50,
    titulo: "Descompacte",
    descricao: "Descompacte o <b>awscliv2.zip</b> com <b>unzip</b> (a opção <code>-u</code> sobrescreve sem ficar perguntando).",
    dicas: ["unzip -u awscliv2.zip"],
    solucao: ["unzip -u awscliv2.zip"],
    validar: (conta) => !!(conta.setup && conta.setup.descompactou),
  },
  {
    id: "setup-4", servico: "setup", nivel: 2, xp: 60,
    titulo: "Instale o CLI",
    descricao: "Rode o instalador com permissão de administrador: <b>sudo ./aws/install</b>.",
    dicas: ["sudo dá a permissão de escrita necessária pra instalar.", "sudo ./aws/install"],
    solucao: ["sudo ./aws/install"],
    validar: (conta) => !!(conta.setup && conta.setup.instalado),
  },
  {
    id: "setup-5", servico: "setup", nivel: 1, xp: 40,
    titulo: "Confirme a versão",
    descricao: "Confirme que o CLI foi instalado direitinho checando a <b>versão</b>.",
    dicas: ["aws --version"],
    solucao: ["aws --version"],
    validar: (conta) => !!(conta.setup && conta.setup.versao),
  },
  {
    id: "setup-6", servico: "setup", nivel: 2, xp: 90,
    titulo: "Configure as credenciais",
    descricao: "Conecte o CLI à conta com <b>aws configure</b>. Ele vai te perguntar 4 coisas (uma por linha): a <b>Access Key ID</b>, a <b>Secret Access Key</b> (pode inventar qualquer valor aqui no simulador), a região <b>us-west-2</b> e o formato de saída <b>json</b>.",
    dicas: ["Digite 'aws configure' e responda cada pergunta apertando Enter.", "Na região digite us-west-2 e no formato digite json (igual ao lab)."],
    solucao: ["aws configure", "<sua-access-key>", "<sua-secret-key>", "us-west-2", "json"],
    validar: (conta) => !!(conta.setup && conta.setup.configurado && conta.setup.regiao === "us-west-2" && conta.setup.output === "json"),
  },
  {
    id: "setup-7", servico: "setup", nivel: 2, xp: 70,
    titulo: "Teste o acesso ao IAM",
    descricao: "Hora da verdade: teste a configuração <b>listando os usuários IAM</b> da conta. Se vier um JSON com a lista, está tudo conectado! 🎉",
    dicas: ["aws iam list-users"],
    solucao: ["aws iam list-users"],
    validar: (conta, cmd, ok) => ok && ehCmd(cmd, "iam", "list-users"),
  },
];

(function () {
  if (typeof window === "undefined") return;

  // 1) registra a seção (no TOPO — é o ponto de partida) e os desafios
  if (typeof SERVICOS_META !== "undefined" && !SERVICOS_META.some((s) => s.id === "setup")) {
    SERVICOS_META.unshift({ id: "setup", nome: "Primeiros passos", subtitulo: "Instalar e configurar o CLI", icone: "🚀" });
    for (const d of DESAFIOS_SETUP) DESAFIOS.push(d);
  }

  // 2) wrap da global executarLinha pra entender os comandos de shell do lab
  if (typeof window.executarLinha !== "function") return;
  const execOriginal = window.executarLinha;

  function estado() {
    jogo.conta.setup = jogo.conta.setup || {};
    return jogo.conta.setup;
  }
  function eco(linha) {
    imprimirComando(linha);
    ui.historicoCmd.push(linha);
    ui.posHistorico = ui.historicoCmd.length;
  }
  function fechar(cmdSintetico) {
    salvarJogo();
    if (cmdSintetico) verificarDesafios(cmdSintetico);
    rolarTerminal();
  }

  // --- configure interativo ---
  let config = null; // { passo, valores: [] }
  const PERGUNTAS = [
    "AWS Access Key ID [None]: ",
    "AWS Secret Access Key [None]: ",
    "Default region name [None]: ",
    "Default output format [None]: ",
  ];

  function iniciarConfigure() {
    eco("aws configure");
    config = { passo: 0, valores: [] };
    imprimir(PERGUNTAS[0]);
    rolarTerminal();
  }

  function responderConfigure(linha) {
    const resp = (linha || "").trim();
    imprimirComando(resp); // ecoa a resposta digitada
    config.valores.push(resp);
    config.passo++;
    if (config.passo < PERGUNTAS.length) {
      imprimir(PERGUNTAS[config.passo]);
      rolarTerminal();
      return;
    }
    // terminou: grava o "perfil"
    const st = estado();
    st.configurado = true;
    st.regiao = config.valores[2];
    st.output = config.valores[3];
    config = null;
    imprimir("(perfil 'default' configurado — credenciais salvas em ~/.aws/credentials)", "ok");
    fechar({ servico: "setup", sub: "configure", posicionais: [], flags: {} });
  }

  // --- comandos de shell do lab ---
  function tratarShell(c) {
    const st = estado();
    eco(c);

    if (/^ssh\s+-i\s+\S+\s+ec2-user@\S+/.test(c)) {
      st.ssh = true;
      imprimir("The authenticity of host can't be established.\nWarning: Permanently added to the list of known hosts.\n\n       __|  __|_  )\n       _|  (     /   Red Hat Enterprise Linux\n      ___|\\___|___|\n\n[ec2-user@ip-172-31-10-5 ~]$  (conectado! agora você está dentro da instância)", "ok");
      return fechar({ servico: "setup", sub: "ssh", posicionais: [], flags: {} });
    }
    if (/^curl\b/.test(c) && /awscli.*\.zip/.test(c) && /-o\b/.test(c)) {
      st.baixou = true;
      imprimir("  % Total    % Received  Time   Speed\n100 45.2M  100 45.2M   0:00:02  18.1M\n(awscliv2.zip baixado no diretório atual)", "ok");
      return fechar({ servico: "setup", sub: "curl", posicionais: [], flags: {} });
    }
    if (/^unzip\b/.test(c)) {
      if (!st.baixou) { imprimir("unzip: cannot find or open awscliv2.zip — baixe o instalador com curl primeiro.", "erro"); return fechar(null); }
      st.descompactou = true;
      imprimir("Archive:  awscliv2.zip\n  inflating: aws/install\n  inflating: aws/dist/aws\n(descompactado em ./aws)", "ok");
      return fechar({ servico: "setup", sub: "unzip", posicionais: [], flags: {} });
    }
    if (/^sudo\s+\.\/aws\/install\b/.test(c)) {
      if (!st.descompactou) { imprimir("sudo: ./aws/install: No such file or directory — descompacte o zip primeiro (unzip).", "erro"); return fechar(null); }
      st.instalado = true;
      imprimir("You can now run: /usr/local/bin/aws --version\n(AWS CLI instalado com sucesso)", "ok");
      return fechar({ servico: "setup", sub: "install", posicionais: [], flags: {} });
    }
    if (c === "aws --version") {
      st.versao = true;
      imprimir("aws-cli/2.15.0 Python/3.11.6 Linux/4.14.133 botocore/2.4.5");
      return fechar({ servico: "setup", sub: "version", posicionais: [], flags: {} });
    }
    if (/^chmod\s+400\b/.test(c)) {
      imprimir("(permissões da chave ajustadas)", "ok");
      return fechar(null);
    }
    // não deveria chegar aqui
    return fechar(null);
  }

  function ehShellDoLab(c) {
    return (
      /^ssh\s+-i\s/.test(c) ||
      (/^curl\b/.test(c) && /-o\b/.test(c)) ||
      /^unzip\b/.test(c) ||
      /^sudo\s+\.\/aws\/install\b/.test(c) ||
      c === "aws --version" ||
      /^chmod\s+400\b/.test(c)
    );
  }

  window.executarLinha = function (linha) {
    const c = (linha || "").trim();
    if (config) return responderConfigure(linha); // no meio do aws configure
    if (c === "aws configure") return iniciarConfigure();
    if (ehShellDoLab(c)) return tratarShell(c);
    return execOriginal(linha); // tudo o mais segue o fluxo normal
  };
})();
