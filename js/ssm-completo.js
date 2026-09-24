"use strict";
// ============================================================
// CLImb — ssm-completo.js
// O `aws ssm` tinha 5 dos 147 comandos reais, e todos os cinco eram Parameter
// Store. Faltavam justamente as duas metades que aparecem escritas na vaga de
// Suporte Cloud N1/N2: *"executar rotinas operacionais"* e *"reinicio de
// servicos"* (ver [[trilhas-por-profissao]] no vault).
//
// Meta do servico: SELETIVA (147 comandos). O que entra:
//
//   RUN COMMAND — rodar comando em 1 ou 300 maquinas sem abrir SSH em nenhuma.
//        E a rotina operacional literal do cargo, e o jeito certo: fica
//        registrado quem rodou o que, quando e com qual saida.
//   SESSION MANAGER — terminal na maquina SEM porta 22 aberta, sem chave .pem
//        e sem bastion. Toda empresa que fecha a 22 usa isto, e e o assunto do
//        chamado mais comum do mundo: "minha instância não aparece na lista".
//   AUTOMATION — o runbook. O material de SRE fala nisso o tempo todo: alarme
//        dispara, o runbook roda sozinho, ninguem acorda.
//   INSTANCE INFORMATION — a resposta daquele chamado: a maquina so aparece se
//        tiver agente rodando E uma role com permissao. E sempre um dos dois.
//   PARAMETER STORE — o que faltava: ler varios de uma vez e ver o HISTORICO
//        de versoes, que e como se descobre "quem mudou a config e quebrou".
//
// CARREGA DEPOIS do servicos-fase5.js (que cria SERVICOS.ssm).
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.ssm) return;

  const REGIAO = (c) => c.regiao || "us-east-1";

  function st(conta) {
    conta.ssm = conta.ssm || { parametros: {} };
    conta.ssm.parametros = conta.ssm.parametros || {};
    conta.ssm.comandos = conta.ssm.comandos || {};
    conta.ssm.sessoes = conta.ssm.sessoes || {};
    conta.ssm.automacoes = conta.ssm.automacoes || {};
    return conta.ssm;
  }
  const uuid = () => hexAleatorio(8) + "-" + hexAleatorio(4) + "-" + hexAleatorio(4) + "-" + hexAleatorio(12);

  // Documentos que a AWS ja traz prontos. Nao sao todos: sao os que aparecem
  // no dia a dia de quem opera.
  const DOCUMENTOS = {
    "AWS-RunShellScript": { tipo: "Command", plataforma: "Linux", descricao: "Roda um script de shell no Linux" },
    "AWS-RunPowerShellScript": { tipo: "Command", plataforma: "Windows", descricao: "Roda um script do PowerShell no Windows" },
    "AWS-UpdateSSMAgent": { tipo: "Command", plataforma: "Linux,Windows", descricao: "Atualiza o agente do SSM" },
    "AWS-RestartEC2Instance": { tipo: "Automation", plataforma: "Linux,Windows", descricao: "Reinicia a instância (runbook)" },
    "AWS-StartEC2Instance": { tipo: "Automation", plataforma: "Linux,Windows", descricao: "Liga a instância (runbook)" },
    "AWS-StopEC2Instance": { tipo: "Automation", plataforma: "Linux,Windows", descricao: "Desliga a instância (runbook)" },
    "AWS-CreateSnapshot": { tipo: "Automation", plataforma: "Linux,Windows", descricao: "Tira snapshot do volume (runbook)" },
    "SSM-SessionManagerRunShell": { tipo: "Session", plataforma: "Linux,Windows", descricao: "Preferencias da sessão do Session Manager" },
  };

  function instanciasDa(conta) {
    return Object.entries((conta.ec2 || {}).instancias || {})
      .map(([id, i]) => ({ id: id, estado: (i && (i.estado || i.state)) || "running", tipo: (i && (i.tipo || i.instanceType)) || "t2.micro" }));
  }
  function exigirInstancia(conta, id, op) {
    const achada = instanciasDa(conta).find((x) => x.id === id);
    if (!achada) {
      throw new ErroCli(
        "An error occurred (InvalidInstanceId) when calling the " + op + " operation: Instances [[" + id + "]] not in a valid state for account " + (conta.contaId || "123456789012") + ".\n" +
        "Na AWS de verdade esse erro quase sempre quer dizer uma de três coisas: a máquina não existe, o agente do SSM não está rodando nela, ou ela não tem uma role com a política AmazonSSMManagedInstanceCore.\n" +
        "Veja quem estÃ¡ registrado com: aws ssm describe-instance-information"
      );
    }
    return achada;
  }
  // O tokenizer entrega a flag so o primeiro token; o resto cai nos
  // posicionais. Mesmo remendo do sqs-completo.js e do logs-completo.js.
  function juntar(valor, pos) {
    return [String(valor)].concat((pos || []).map(String)).join(" ").trim();
  }
  // --parameters commands="uptime" / commands=uptime,df -h
  function lerParametros(texto) {
    const fora = {};
    const m = String(texto).match(/^([A-Za-z0-9_]+)=([\s\S]*)$/);
    if (!m) return fora;
    fora[m[1]] = m[2].split(",").map((x) => x.trim()).filter(Boolean);
    return fora;
  }
  // Saida plausivel pro comando pedido — fidelidade importa (ver a memoria
  // "MiniStack"): inventar saida bonita ensina errado.
  function saidaDe(linha) {
    const c = String(linha);
    if (/^uptime/.test(c)) return " 14:32:07 up 12 days,  3:41,  0 users,  load average: 0.08, 0.12, 0.09";
    if (/^df/.test(c)) return "Filesystem      Size  Used Avail Use% Mounted on\n/dev/nvme0n1p1   20G   14G  5.4G  72% /\ntmpfs           483M     0  483M   0% /dev/shm";
    if (/^free/.test(c)) return "               total        used        free\nMem:          964Mi       412Mi       118Mi\nSwap:             0B          0B          0B";
    if (/systemctl\s+restart/.test(c)) return "";
    if (/systemctl\s+status/.test(c)) return "● nginx.service - A high performance web server\n   Active: active (running) since Mon 2026-09-22 14:30:11 UTC; 5s ago";
    if (/^whoami/.test(c)) return "root";
    if (/^hostname/.test(c)) return "ip-10-0-1-47";
    return "(comando executado; sem saída)";
  }

  Object.assign(SERVICOS.ssm, {
    // ---------- quem estÃ¡ registrado ----------
    "describe-instance-information": (conta) => {
      st(conta);
      const lista = instanciasDa(conta).filter((i) => i.estado === "running");
      if (!lista.length) {
        avisarClimb(
          "Nenhuma máquina registrada no SSM. Na AWS de verdade este e O chamado mais comum do suporte: a instância só aparece aqui " +
          "se o AGENTE estiver rodando nela E ela tiver uma ROLE com a política AmazonSSMManagedInstanceCore. Falta um dos dois em 9 de cada 10 casos."
        );
        return "";
      }
      return js({ InstanceInformationList: lista.map((i) => ({
        InstanceId: i.id, PingStatus: "Online", PlatformType: "Linux",
        PlatformName: "Amazon Linux", PlatformVersion: "2023",
        AgentVersion: "3.3.1345.0", IsLatestVersion: true,
        ResourceType: "EC2Instance", IPAddress: "10.0.1." + (40 + (i.id.length % 50)),
      })) });
    },
    "list-documents": (conta, pos, flags) => {
      st(conta);
      let nomes = Object.keys(DOCUMENTOS);
      const filtro = flags.filters ? String(flags.filters) : "";
      const tipo = filtro.match(/DocumentType[,=]+([A-Za-z]+)/);
      if (tipo) nomes = nomes.filter((n) => DOCUMENTOS[n].tipo === tipo[1]);
      return js({ DocumentIdentifiers: nomes.map((n) => ({
        Name: n, Owner: "Amazon", DocumentType: DOCUMENTOS[n].tipo,
        PlatformTypes: DOCUMENTOS[n].plataforma.split(","), DocumentVersion: "1",
      })) });
    },

    // ---------- Run Command: rotina operacional sem SSH ----------
    "send-command": (conta, pos, flags) => {
      const s = st(conta);
      const documento = String(exigirFlag(flags, "document-name"));
      if (!DOCUMENTOS[documento]) {
        throw new ErroCli(
          "An error occurred (InvalidDocument) when calling the SendCommand operation: Document with name " + documento + " does not exist.\n" +
          "Veja os disponíveis com: aws ssm list-documents"
        );
      }
      if (DOCUMENTOS[documento].tipo !== "Command") {
        throw new ErroCli(
          "An error occurred (InvalidDocument) when calling the SendCommand operation: The document " + documento + " is of type " + DOCUMENTOS[documento].tipo + ", not Command.\n" +
          "Documento de Automation roda com: aws ssm start-automation-execution --document-name " + documento
        );
      }
      if (flags["instance-ids"] === undefined && flags.targets === undefined) {
        throw new ErroCli("An error occurred (ValidationException) when calling the SendCommand operation: Either instance-ids or targets must be specified.");
      }
      // `--instance-ids i-1 i-2` espalha: o primeiro vai pra flag, o resto pros
      // posicionais. Só recolhemos do posicional o que TEM CARA de id de
      // instância — senão um valor solto de outra flag viraria alvo.
      const ids = String(flags["instance-ids"] !== undefined ? flags["instance-ids"] : "")
        .split(/[,\s]+/).filter(Boolean)
        .concat((pos || []).map(String).filter((x) => /^i-[0-9a-f]+$/i.test(x)));
      for (const id of ids) exigirInstancia(conta, id, "SendCommand");
      const params = flags.parameters ? lerParametros(String(flags.parameters)) : {};
      const linhas = params.commands || [];
      const id = uuid();
      s.comandos[id] = {
        id: id, documento: documento, instancias: ids, linhas: linhas,
        comentario: flags.comment ? String(flags.comment) : "",
        estado: "Success", quando: Date.now(),
        saidas: ids.map((i) => ({ instancia: i, saida: linhas.map(saidaDe).join("\n") })),
      };
      avisarClimb(
        "Rodou em " + ids.length + (ids.length === 1 ? " maquina" : " maquinas") + " sem abrir SSH em nenhuma. É a diferença entre operar e improvisar: " +
        "fica registrado QUEM rodou, O QUE rodou, QUANDO e qual foi a saída — e o mesmo comando serve pra 1 ou pra 300 máquinas."
      );
      return js({ Command: {
        CommandId: id, DocumentName: documento, InstanceIds: ids,
        Status: "Pending", StatusDetails: "Pending", Comment: s.comandos[id].comentario,
        RequestedDateTime: new Date().toISOString(),
      } });
    },
    "list-commands": (conta, pos, flags) => {
      const s = st(conta);
      let lista = Object.values(s.comandos);
      if (flags["command-id"]) lista = lista.filter((c) => c.id === String(flags["command-id"]));
      if (flags["instance-id"]) lista = lista.filter((c) => c.instancias.indexOf(String(flags["instance-id"])) >= 0);
      if (!lista.length) {
        avisarClimb("Nenhum comando enviado ainda. Mande um com: aws ssm send-command --instance-ids <id> --document-name AWS-RunShellScript --parameters commands=uptime");
        return "";
      }
      return js({ Commands: lista.map((c) => ({
        CommandId: c.id, DocumentName: c.documento, Comment: c.comentario,
        Status: c.estado, StatusDetails: c.estado, TargetCount: c.instancias.length,
        CompletedCount: c.instancias.length, ErrorCount: 0,
        RequestedDateTime: new Date(c.quando).toISOString(),
      })) });
    },
    "list-command-invocations": (conta, pos, flags) => {
      const s = st(conta);
      let lista = Object.values(s.comandos);
      if (flags["command-id"]) lista = lista.filter((c) => c.id === String(flags["command-id"]));
      const fora = [];
      for (const c of lista) {
        for (const saida of c.saidas) {
          const inv = {
            CommandId: c.id, InstanceId: saida.instancia, DocumentName: c.documento,
            Status: c.estado, StatusDetails: c.estado,
            RequestedDateTime: new Date(c.quando).toISOString(),
          };
          if (flags.details !== undefined) {
            inv.CommandPlugins = [{ Name: "aws:runShellScript", Status: c.estado, ResponseCode: 0, Output: saida.saida }];
          }
          fora.push(inv);
        }
      }
      if (!fora.length) { avisarClimb("Nenhuma execução encontrada. Confira o --command-id."); return ""; }
      if (flags.details === undefined) {
        avisarClimb("Sem --details você ve só o estado de cada máquina. Com --details vem a SAÍDA de cada uma junto.");
      }
      return js({ CommandInvocations: fora });
    },
    "get-command-invocation": (conta, pos, flags) => {
      const s = st(conta);
      const id = String(exigirFlag(flags, "command-id"));
      const instancia = String(exigirFlag(flags, "instance-id"));
      const c = s.comandos[id];
      if (!c) throw new ErroCli("An error occurred (InvalidCommandId) when calling the GetCommandInvocation operation: The command id " + id + " does not exist.");
      const saida = c.saidas.find((x) => x.instancia === instancia);
      if (!saida) {
        throw new ErroCli(
          "An error occurred (InvocationDoesNotExist) when calling the GetCommandInvocation operation: The command " + id + " was not sent to instance " + instancia + ".\n" +
          "Foi enviado pra: " + c.instancias.join(", ")
        );
      }
      return js({
        CommandId: c.id, InstanceId: instancia, DocumentName: c.documento,
        Status: c.estado, StatusDetails: c.estado, ResponseCode: 0,
        StandardOutputContent: saida.saida, StandardErrorContent: "",
        ExecutionStartDateTime: new Date(c.quando).toISOString(),
      });
    },

    // ---------- Session Manager: terminal sem porta 22 ----------
    "start-session": (conta, pos, flags) => {
      const s = st(conta);
      const alvo = String(exigirFlag(flags, "target"));
      exigirInstancia(conta, alvo, "StartSession");
      const id = "climb-" + hexAleatorio(17); // o usuario do simulador e "climb" (e o que iam get-user devolve)
      s.sessoes[id] = { id: id, alvo: alvo, estado: "Connected", quando: Date.now(), motivo: flags.reason ? String(flags.reason) : "" };
      avisarClimb(
        "Terminal aberto na máquina SEM porta 22 liberada, sem chave .pem e sem bastion — o trafego sai pelo agente, de dentro pra fora. " +
        "Fora do simulador este comando éxige o plugin `session-manager-plugin` instalado na sua máquina; sem ele a AWS devolve " +
        "\"SessionManagerPlugin is not found\", que é o primeiro tropeço de todo mundo."
      );
      return js({ SessionId: id, TokenValue: "AAEAA" + hexAleatorio(40), StreamUrl: "wss://ssmmessages." + REGIAO(conta) + ".amazonaws.com/v1/data-channel/" + id });
    },
    "describe-sessions": (conta, pos, flags) => {
      const s = st(conta);
      const estado = String(exigirFlag(flags, "state"));
      if (["Active", "History"].indexOf(estado) < 0) {
        throw new ErroCli("An error occurred (ValidationException) when calling the DescribeSessions operation: Value '" + estado + "' at 'state' failed to satisfy constraint: Member must satisfy enum value set: [Active, History]");
      }
      const querAtiva = estado === "Active";
      const lista = Object.values(s.sessoes).filter((x) => (x.estado === "Connected") === querAtiva);
      if (!lista.length) {
        avisarClimb(querAtiva ? "Nenhuma sessão aberta agora." : "Nenhuma sessão encerrada no histórico ainda.");
        return "";
      }
      return js({ Sessions: lista.map((x) => ({
        SessionId: x.id, Target: x.alvo, Status: x.estado,
        StartDate: new Date(x.quando).toISOString(),
        Owner: "arn:aws:iam::" + (conta.contaId || "123456789012") + ":user/climb",
        Reason: x.motivo,
      })) });
    },
    "terminate-session": (conta, pos, flags) => {
      const s = st(conta);
      const id = String(exigirFlag(flags, "session-id"));
      const sessao = s.sessoes[id];
      if (!sessao) throw new ErroCli("An error occurred (DoesNotExistException) when calling the TerminateSession operation: Session " + id + " does not exist.");
      sessao.estado = "Terminated";
      avisarClimb("Sessão encerrada — e ela fica no histórico. Auditoria de quem entrou em qual máquina é exatamente o motivo de a empresa fechar a porta 22 e usar isto.");
      return js({ SessionId: id });
    },

    // ---------- Automation: o runbook do plantao ----------
    "start-automation-execution": (conta, pos, flags) => {
      const s = st(conta);
      const documento = String(exigirFlag(flags, "document-name"));
      if (!DOCUMENTOS[documento]) {
        throw new ErroCli("An error occurred (AutomationDefinitionNotFoundException) when calling the StartAutomationExecution operation: Document " + documento + " does not exist.");
      }
      if (DOCUMENTOS[documento].tipo !== "Automation") {
        throw new ErroCli(
          "An error occurred (AutomationDefinitionNotFoundException) when calling the StartAutomationExecution operation: " + documento + " is of type " + DOCUMENTOS[documento].tipo + ", not Automation.\n" +
          "Documento de Command roda com: aws ssm send-command --document-name " + documento
        );
      }
      const params = flags.parameters ? lerParametros(juntar(flags.parameters, pos)) : {};
      const alvos = params.InstanceId || [];
      for (const id of alvos) exigirInstancia(conta, id, "StartAutomationExecution");
      const id = uuid();
      s.automacoes[id] = { id: id, documento: documento, estado: "Success", alvos: alvos, quando: Date.now() };
      avisarClimb(
        "Runbook disparado. A diferença pro send-command: automation é um PROCEDIMENTO com passos, condição e rollback — " +
        "e um alarme do CloudWatch pode disparar ele sozinho. É assim que o plantão deixa de ser acordado pro que já se sabe consertar."
      );
      return js({ AutomationExecutionId: id });
    },
    "describe-automation-executions": (conta) => {
      const s = st(conta);
      const lista = Object.values(s.automacoes);
      if (!lista.length) {
        avisarClimb("Nenhuma automação executada. Dispare uma com: aws ssm start-automation-execution --document-name AWS-RestartEC2Instance --parameters InstanceId=<id>");
        return "";
      }
      return js({ AutomationExecutionMetadataList: lista.map((a) => ({
        AutomationExecutionId: a.id, DocumentName: a.documento, DocumentVersion: "1",
        AutomationExecutionStatus: a.estado, Mode: "Auto",
        ExecutionStartTime: new Date(a.quando).toISOString(),
        ExecutedBy: "arn:aws:iam::" + (conta.contaId || "123456789012") + ":user/climb",
      })) });
    },
    "get-automation-execution": (conta, pos, flags) => {
      const s = st(conta);
      const id = String(exigirFlag(flags, "automation-execution-id"));
      const a = s.automacoes[id];
      if (!a) throw new ErroCli("An error occurred (AutomationExecutionNotFoundException) when calling the GetAutomationExecution operation: Automation execution " + id + " does not exist.");
      return js({ AutomationExecution: {
        AutomationExecutionId: a.id, DocumentName: a.documento,
        AutomationExecutionStatus: a.estado, Mode: "Auto",
        ExecutionStartTime: new Date(a.quando).toISOString(),
        Targets: a.alvos.map((x) => ({ Key: "InstanceId", Values: [x] })),
        StepExecutions: [
          { StepName: "stopInstance", Action: "aws:changeInstanceState", StepStatus: "Success" },
          { StepName: "startInstance", Action: "aws:changeInstanceState", StepStatus: "Success" },
          { StepName: "verifyInstanceRunning", Action: "aws:assertAwsResourceProperty", StepStatus: "Success" },
        ],
      } });
    },

    // ---------- Parameter Store: o que faltava ----------
    "get-parameters": (conta, pos, flags) => {
      const s = st(conta);
      const nomes = juntar(exigirFlag(flags, "names"), pos).split(/[,\s]+/).filter(Boolean);
      const decifrar = flags["with-decryption"] !== undefined;
      const achados = [], invalidos = [];
      for (const n of nomes) {
        const p = s.parametros[n];
        if (!p) { invalidos.push(n); continue; }
        achados.push({
          Name: p.nome, Type: p.tipo, Version: p.versao,
          Value: p.tipo === "SecureString" && !decifrar ? "AQICAHh" + hexAleatorio(24) : p.valor,
        });
      }
      if (invalidos.length) {
        avisarClimb("Repare: nome que não existe NÃO derruba a chamada — ele volta em InvalidParameters. Isso é de propósito, pra um parâmetro faltando não quebrar o boot da aplicação inteira.");
      }
      return js({ Parameters: achados, InvalidParameters: invalidos });
    },
    "get-parameter-history": (conta, pos, flags) => {
      const s = st(conta);
      const nome = String(exigirFlag(flags, "name"));
      const p = s.parametros[nome];
      if (!p) throw new ErroCli("An error occurred (ParameterNotFound) when calling the GetParameterHistory operation: " + nome);
      const decifrar = flags["with-decryption"] !== undefined;
      const hist = (p.historico && p.historico.length) ? p.historico : [{ versao: p.versao, valor: p.valor, tipo: p.tipo }];
      if (hist.length > 1) {
        avisarClimb("Cada put-parameter --overwrite cria uma VERSÃO nova, e as antigas ficam. É assim que se responde 'quem mudou a config e quebrou a produção' — e como se volta pro valor anterior.");
      }
      return js({ Parameters: hist.map((h) => ({
        Name: nome, Type: h.tipo, Version: h.versao,
        Value: h.tipo === "SecureString" && !decifrar ? "AQICAHh" + hexAleatorio(24) : h.valor,
        LastModifiedDate: new Date().toISOString(),
      })) });
    },
  });

  // O put-parameter original nao guarda historico. Em vez de reescrever o
  // handler do servicos-fase5.js, embrulhamos ele — mesma tecnica que os
  // arquivos aditivos usam com as globais do app.
  const putOriginal = SERVICOS.ssm["put-parameter"];
  SERVICOS.ssm["put-parameter"] = function (conta, pos, flags) {
    const nome = flags && flags.name !== undefined ? String(flags.name) : "";
    const antes = ((conta.ssm || {}).parametros || {})[nome];
    const r = putOriginal(conta, pos, flags);
    const p = ((conta.ssm || {}).parametros || {})[nome];
    if (p) {
      p.historico = (antes && antes.historico ? antes.historico.slice() : []);
      p.historico.push({ versao: p.versao, valor: p.valor, tipo: p.tipo });
    }
    return r;
  };

  // ============================================================
  // MANUAIS
  // ============================================================
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => "USO\n    " + uso + "\n\n" + txt;
    Object.assign(MANUAIS, {
      "ssm.describe-instance-information": M(
        "aws ssm describe-instance-information",
        "Lista as máquinas REGISTRADAS no Systems Manager.\n\nÉ a primeira coisa a olhar quando o Session Manager não acha a\ninstância — e esse é o chamado mais comum do suporte. A máquina só\naparece aqui se tiver:\n\n    1. o agente do SSM rodando (vem pronto na Amazon Linux e Ubuntu)\n    2. uma role com a política AmazonSSMManagedInstanceCore\n\nFalta um dos dois em 9 de cada 10 casos."),
      "ssm.list-documents": M(
        "aws ssm list-documents [--filters Key=DocumentType,Values=Automation]",
        "Lista os documentos: os scripts prontos que o SSM sabe executar.\n\nDOIS TIPOS QUE NÃO SE MISTURAM\n    Command      roda com send-command (ex.: AWS-RunShellScript)\n    Automation   roda com start-automation-execution\n                 (ex.: AWS-RestartEC2Instance)"),
      "ssm.send-command": M(
        "aws ssm send-command --instance-ids i-0abc --document-name AWS-RunShellScript \\\n        --parameters commands=uptime",
        "Roda comando em 1 ou em 300 máquinas SEM abrir SSH em nenhuma.\n\nÉ a diferença entre operar e improvisar: fica registrado quem rodou,\no quê, quando e qual foi a saída. Devolve um CommandId — a saída em\nsi você busca depois, com get-command-invocation."),
      "ssm.get-command-invocation": M(
        "aws ssm get-command-invocation --command-id <id> --instance-id i-0abc",
        "A saída do comando NAQUELA máquina: StandardOutputContent,\nStandardErrorContent e o código de retorno.\n\nO send-command não devolve a saída — ele devolve o protocolo. Este\naqui é o comando que responde \"e aí, deu certo?\"."),
      "ssm.list-commands": M(
        "aws ssm list-commands [--command-id <id>] [--instance-id i-0abc]",
        "Histórico do que foi enviado: documento, comentário, quantas\nmáquinas e quantas falharam. É o log de operação da conta."),
      "ssm.list-command-invocations": M(
        "aws ssm list-command-invocations --command-id <id> --details",
        "Uma linha por máquina do envio. Sem --details vem só o estado de\ncada uma; com --details vem a saída de todas juntas — é como você vê\nas 300 respostas de uma vez."),
      "ssm.start-session": M(
        "aws ssm start-session --target i-0abc [--reason \"investigar disco cheio\"]",
        "Abre um terminal na máquina SEM porta 22 liberada, sem chave .pem e\nsem bastion: o tráfego sai pelo agente, de dentro pra fora.\n\nATENÇÃO fora do simulador: exige o `session-manager-plugin`\ninstalado na SUA máquina. Sem ele a AWS devolve\n\"SessionManagerPlugin is not found\" — é o primeiro tropeço de todos."),
      "ssm.describe-sessions": M(
        "aws ssm describe-sessions --state Active",
        "Quem está dentro de qual máquina agora (Active) ou quem esteve\n(History), com o motivo declarado. Essa auditoria é justamente o\nmotivo de a empresa fechar a 22 e usar o Session Manager.\n\n--state é obrigatório e só aceita Active ou History."),
      "ssm.terminate-session": M(
        "aws ssm terminate-session --session-id <id>",
        "Encerra a sessão. Ela não some: passa pro histórico."),
      "ssm.start-automation-execution": M(
        "aws ssm start-automation-execution --document-name AWS-RestartEC2Instance \\\n        --parameters InstanceId=i-0abc",
        "Dispara um RUNBOOK. A diferença pro send-command: automation é um\nprocedimento com passos, condição e rollback — não um comando solto.\n\nE um alarme do CloudWatch pode disparar ele sozinho. É assim que o\nplantão deixa de ser acordado pro que já se sabe consertar."),
      "ssm.describe-automation-executions": M(
        "aws ssm describe-automation-executions",
        "Lista as automações e o estado de cada uma (Success, Failed,\nInProgress, Cancelled), com quem disparou."),
      "ssm.get-automation-execution": M(
        "aws ssm get-automation-execution --automation-execution-id <id>",
        "Abre a automação PASSO A PASSO: qual etapa rodou, qual falhou e em\nqual ação ela parou. É onde se descobre por que o runbook não\nconsertou o que devia."),
      "ssm.get-parameters": M(
        "aws ssm get-parameters --names /loja/url-api /loja/senha-db [--with-decryption]",
        "Lê VÁRIOS parâmetros numa chamada só.\n\nRepare na resposta: nome que não existe não derruba a chamada — ele\nvolta em InvalidParameters. É de propósito, pra um parâmetro\nfaltando não quebrar o boot da aplicação inteira."),
      "ssm.get-parameter-history": M(
        "aws ssm get-parameter-history --name /loja/url-api [--with-decryption]",
        "Todas as versões do parâmetro, da mais antiga pra mais nova.\n\nCada put-parameter --overwrite cria uma versão e as antigas ficam.\nÉ assim que se responde \"quem mudou a config e quebrou a produção\"\n— e como se volta pro valor anterior."),
    });
  }

  // ============================================================
  // PORQUE
  // ============================================================
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "ssm.describe-instance-information": "mostra quais máquinas o SSM enxerga — a primeira coisa a olhar quando o Session Manager não acha a instância.",
      "ssm.list-documents": "lista os scripts prontos que o SSM sabe executar, e de que tipo é cada um.",
      "ssm.send-command": "roda comando em uma ou em trezentas máquinas sem abrir SSH em nenhuma, e deixa registro.",
      "ssm.get-command-invocation": "mostra a saída do comando naquela máquina — é o 'e aí, deu certo?'.",
      "ssm.list-commands": "é o histórico de operação: o que foi rodado na conta e por quem.",
      "ssm.list-command-invocations": "mostra máquina por máquina como foi o envio, com a saída junto se pedir --details.",
      "ssm.start-session": "abre terminal na máquina sem porta 22, sem chave e sem bastion.",
      "ssm.describe-sessions": "audita quem entrou em qual máquina, agora ou no passado.",
      "ssm.terminate-session": "encerra a sessão, que fica registrada no histórico.",
      "ssm.start-automation-execution": "dispara um runbook: procedimento com passos e rollback, que o alarme pode acionar sozinho.",
      "ssm.describe-automation-executions": "lista os runbooks que rodaram e como terminaram.",
      "ssm.get-automation-execution": "abre o runbook passo a passo pra achar onde ele parou.",
      "ssm.get-parameters": "lê vários parâmetros de uma vez, sem derrubar tudo se um faltar.",
      "ssm.get-parameter-history": "mostra as versões anteriores do parâmetro — quem mudou a config e o que era antes.",
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
    if (i < 0) { for (const n of novos) DESAFIOS.push(n); return; }
    DESAFIOS.splice(i + 1, 0, ...novos);
  }
  const param = (c, n) => ((c.ssm || {}).parametros || {})[n];
  const comandos = (c) => Object.values(((c.ssm || {}).comandos) || {});
  const sessoes = (c) => Object.values(((c.ssm || {}).sessoes) || {});
  const automacoes = (c) => Object.values(((c.ssm || {}).automacoes) || {});

  // --- Parameter Store: ler vários, e o histórico ---
  at("ssm-3", [
    d("ssmc-multi1", "ssm", 2, 80, "A aplicação sobe e pede três configs",
      "No boot, a aplicação precisa da URL da API e da senha do banco — e fazer uma chamada por config e desperdicio. Leia <b>/loja/url-api</b> e <b>/loja/inexistente</b> numa única chamada e repare no que a AWS faz com o nome que não existe.",
      ["Existe a versão no plural do get-parameter, e ela recebe os nomes separados por espaço.", "Repare na resposta: a AWS separa o que achou do que não achou, em vez de falhar tudo."],
      ["aws ssm get-parameters --names /loja/url-api /loja/inexistente"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ssm", "get-parameters")),
  ]);
  at("ssm-6", [
    d("ssmc-hist1", "ssm", 3, 110, "Quem mudou a config e quebrou a produção?",
      "A loja parou de responder depois que alguém mexeu num parâmetro. Reproduza: troque o <b>/loja/url-api</b> pra <b>https://api-nova.loja.com</b> (a AWS exige <b>--overwrite</b> pra sobrescrever) e depois veja <b>todas as versões</b> do parâmetro pra descobrir qual era o valor antigo.",
      ["Sem --overwrite a AWS recusa a sobrescrita, de propósito — é uma trava contra mudar config sem querer.", "Cada sobrescrita cria uma VERSÃO, e existe um comando que lista o histórico delas."],
      ["aws ssm put-parameter --name /loja/url-api --value https://api-nova.loja.com --type String --overwrite",
        "aws ssm get-parameter-history --name /loja/url-api"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ssm", "get-parameter-history") &&
        ((param(c, "/loja/url-api") || {}).versao || 0) >= 2),
  ]);

  // --- operar a frota: Run Command, Session Manager e runbook ---
  at("cob-ssm-1", [
    d("ssmc-inv1", "ssm", 2, 80, "A máquina não aparece na lista",
      "Chamado clássico do suporte: <i>\"não consigo abrir sessão na instância\"</i>. Antes de qualquer coisa, veja <b>quais máquinas o SSM enxerga</b> — se ela não estiver nessa lista, o problema não é a sessão.",
      ["A pergunta não é sobre a EC2: é sobre quem estÃ¡ REGISTRADO no Systems Manager.", "Repare no PingStatus da resposta: Online quer dizer que o agente estÃ¡ conversando."],
      ["aws ssm describe-instance-information"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ssm", "describe-instance-information")),
    d("ssmc-doc1", "ssm", 2, 70, "O que o SSM já sabe fazer sozinho",
      "Antes de escrever script, veja o que a AWS já traz pronto. Liste os <b>documentos</b> disponíveis e repare que eles se dividem em dois tipos que não se misturam: <b>Command</b> e <b>Automation</b>.",
      ["Documento é o script pronto que o SSM executa.", "Um `list-…` simples resolve; dá pra estreitar por tipo com --filters."],
      ["aws ssm list-documents"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ssm", "list-documents")),
    d("ssmc-run1", "ssm", 3, 130, "Rode um comando sem abrir SSH",
      "Precisa saber há quanto tempo o servidor está de pé, mas a porta 22 está fechada e você não tem a chave .pem. Suba uma instância <b>t3.micro</b> e rode <b>uptime</b> nela pelo Run Command, com o documento <b>AWS-RunShellScript</b>.",
      ["A forma de rodar script em máquina gerenciada é `send-command`, e ela pede QUAL documento usar.", "O comando em si vai dentro de `--parameters`, na forma `commands=<comando>`.", "Guarde o CommandId que volta: a saída não vem aqui."],
      ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.micro",
        "aws ssm send-command --instance-ids <id-da-instância> --document-name AWS-RunShellScript --parameters commands=uptime"],
      (c) => comandos(c).some((x) => x.documento === "AWS-RunShellScript")),
    d("ssmc-run2", "ssm", 3, 110, "E aí, deu certo?",
      "O send-command devolveu um protocolo, não a resposta. Busque a <b>saída</b> do comando que você acabou de rodar naquela máquina. <small>(é por isso que operar pela CLI da certo em 300 máquinas: a saída de cada uma fica guardada)</small>",
      ["Você precisa de duas coisas: qual envio e qual máquina.", "Liste primeiro os envios pra achar o CommandId; a saída vem em StandardOutputContent."],
      ["aws ssm list-commands",
        "aws ssm get-command-invocation --command-id <comando-id> --instance-id <id-da-instância>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ssm", "get-command-invocation")),
    d("ssmc-run3", "ssm", 3, 120, "Reinicie o nginx da frota",
      "O time relatou que o site voltou a responder depois de reiniciar o nginx na mão — e isso precisa virar rotina, não heroísmo. Rode <b>systemctl restart nginx</b> na instância, deixando o comentario <b>reinicio nginx chamado 4412</b>.",
      ["Mesmo send-command do exercicio anterior, outro conteúdo em commands — e aqui o comando tem espaços, então vai entre aspas.", "O `--comment` não é enfeite: é ele que aparece no histórico dizendo POR QUE aquilo foi rodado.", "No fim, veja máquina por máquina como foi: `list-command-invocations --details`."],
      ["aws ssm send-command --instance-ids <id-da-instância> --document-name AWS-RunShellScript --parameters commands=\"systemctl restart nginx\" --comment \"reinicio nginx chamado 4412\"",
        "aws ssm list-command-invocations --command-id <comando-id> --details"],
      (c) => comandos(c).some((x) => String(x.comentario).indexOf("4412") >= 0)),
    d("ssmc-sess1", "ssm", 3, 130, "Terminal sem porta 22, sem chave, sem bastion",
      "A empresa fechou a porta 22 em todas as máquinas — e fez certo. Abra uma <b>sessão</b> na instância declarando o motivo <b>investigar-disco-cheio</b>.",
      ["Aqui a máquina não é --instance-ids: este comando chama de `--target`.", "O `--reason` fica registrado na auditoria; é o que transforma acesso em rastro."],
      ["aws ssm start-session --target <id-da-instância> --reason investigar-disco-cheio"],
      (c) => sessoes(c).some((s) => String(s.motivo).indexOf("disco-cheio") >= 0)),
    d("ssmc-sess2", "ssm", 3, 100, "Quem está dentro das máquinas agora?",
      "Auditoria de segurança: liste as sessões <b>abertas neste momento</b> e encerre a que você deixou aberta. <small>(sessão esquecida e terminal vivo numa máquina de produção)</small>",
      ["O `--state` é obrigatório e só aceita dois valores: Active ou History.", "Pra encerrar, use o SessionId que apareceu na listagem."],
      ["aws ssm describe-sessions --state Active",
        "aws ssm terminate-session --session-id <sessao-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ssm", "terminate-session") &&
        sessoes(c).some((s) => s.estado === "Terminated")),
    d("ssmc-auto1", "ssm", 3, 140, "O runbook que roda sozinho de madrugada",
      "A instância trava toda semana de madrugada e alguém precisa reiniciar. Isso é trabalho de <b>runbook</b>, não de gente acordada: dispare o documento <b>AWS-RestartEC2Instance</b> na instância. <small>(depois, um alarme do CloudWatch pode disparar isso sozinho)</small>",
      ["Documento de Automation NÃO roda com send-command — tem comando próprio, e o simulador te avisa se trocar.", "O alvo vai em `--parameters`, na forma `InstanceId=<id>`."],
      ["aws ssm start-automation-execution --document-name AWS-RestartEC2Instance --parameters InstanceId=<id-da-instância>"],
      (c) => automacoes(c).some((a) => a.documento === "AWS-RestartEC2Instance")),
    d("ssmc-auto2", "ssm", 3, 110, "Em que passo o runbook parou?",
      "De manhã, o relatório: o runbook rodou mesmo? Liste as automações executadas e repare que cada uma tem <b>passos</b> — e no passo que falha que mora a resposta.",
      ["Primeiro liste o que rodou; o detalhe passo a passo e outro comando, da família `get-…`.", "O identificador aqui é o AutomationExecutionId, não o CommandId."],
      ["aws ssm describe-automation-executions"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ssm", "describe-automation-executions")),
  ]);
})();
