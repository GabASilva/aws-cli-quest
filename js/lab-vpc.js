"use strict";
// ============================================================
// CLImb — lab-vpc.js
// Rede a fundo + o primeiro LABORATÓRIO DE DIAGNÓSTICO do CLImb.
//
// POR QUE ESTE ARQUIVO EXISTE
// Até aqui toda atividade era "crie X". No trabalho de verdade o que mais
// acontece é o contrário: já existe uma infra, ela está QUEBRADA, e você
// precisa descobrir por quê. Este módulo traz esse formato.
//
// TRÊS PARTES
//  1. Comandos de rede que faltavam: route tables, network ACLs, flow logs,
//     internet gateways (describe) e network interfaces.
//  2. Um MODELO DE CONECTIVIDADE de verdade: o `curl` só responde se a rota
//     pro internet gateway existir, a network ACL deixar passar E o security
//     group liberar a porta. Consertou? O curl volta a funcionar na hora.
//  3. O laboratório "Diagnóstico": monta um ambiente com dois defeitos
//     plantados e o aluno investiga, conserta e comprova nos flow logs.
//
// Os flow logs registram o tráfego no FORMATO REAL da AWS e são entregues no
// bucket S3 — e o download escreve o arquivo no sistema de arquivos, então
// `grep REJECT` funciona de verdade.
// ============================================================
(function () {
  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";

  function rede(conta) {
    conta.vpc = conta.vpc || { vpcs: {}, subnets: {}, igws: {} };
    conta.vpc.tabelas = conta.vpc.tabelas || {};   // route tables
    conta.vpc.nacls = conta.vpc.nacls || {};        // network ACLs
    conta.vpc.flowLogs = conta.vpc.flowLogs || {};
    conta.vpc.registros = conta.vpc.registros || []; // linhas de flow log
    return conta;
  }

  // ============================================================
  // Route tables
  // ============================================================
  function tabelaDaSubnet(conta, subnetId) {
    rede(conta);
    const tabelas = Object.values(conta.vpc.tabelas);
    const explicita = tabelas.find((t) => (t.associacoes || []).includes(subnetId));
    if (explicita) return explicita;
    const sub = conta.vpc.subnets[subnetId];
    if (!sub) return null;
    // sem associação explícita, vale a tabela PRINCIPAL da VPC (igual à AWS)
    return tabelas.find((t) => t.vpc === sub.vpc && t.principal) || null;
  }
  function acharTabela(conta, flags, operacao) {
    rede(conta);
    const id = exigirFlag(flags, "route-table-id");
    const t = conta.vpc.tabelas[id];
    if (!t) throw new ErroCli(`An error occurred (InvalidRouteTableID.NotFound) when calling the ${operacao} operation: The routeTable ID '${id}' does not exist\nDica: veja os ids com 'aws ec2 describe-route-tables'.`);
    return t;
  }
  const cmdRotas = {
    "create-route-table": (conta, pos, flags) => {
      rede(conta);
      const vpcId = exigirFlag(flags, "vpc-id");
      if (!conta.vpc.vpcs[vpcId]) throw new ErroCli(`An error occurred (InvalidVpcID.NotFound) when calling the CreateRouteTable operation: The vpc ID '${vpcId}' does not exist`);
      const id = "rtb-0" + hexAleatorio(16);
      conta.vpc.tabelas[id] = { id, vpc: vpcId, principal: false, associacoes: [], rotas: [{ destino: conta.vpc.vpcs[vpcId].cidr, alvo: "local", estado: "active" }] };
      return js({ RouteTable: { RouteTableId: id, VpcId: vpcId, Routes: [{ DestinationCidrBlock: conta.vpc.vpcs[vpcId].cidr, GatewayId: "local", State: "active" }], Associations: [] } });
    },
    "describe-route-tables": (conta, pos, flags) => {
      rede(conta);
      let lista = Object.values(conta.vpc.tabelas);
      // --route-table-ids rtb-xxx  e  --filter "Name=association.subnet-id,Values='subnet-x'"
      if (flags["route-table-ids"] !== undefined) {
        const ids = [].concat(flags["route-table-ids"]).map(String);
        lista = lista.filter((t) => ids.includes(t.id));
      }
      const filtro = flags.filter || flags.filters;
      if (filtro) {
        const txt = String(filtro);
        const sub = (txt.match(/association\.subnet-id[^']*'?([\w-]+)'?/) || [])[1];
        if (sub) lista = lista.filter((t) => (t.associacoes || []).includes(sub) || (t.principal && conta.vpc.subnets[sub] && conta.vpc.subnets[sub].vpc === t.vpc));
      }
      if (!lista.length) { avisarClimb("Nenhuma route table encontrada com esse filtro."); return js({ RouteTables: [] }); }
      return js({ RouteTables: lista.map((t) => ({
        RouteTableId: t.id, VpcId: t.vpc,
        Routes: t.rotas.map((r) => ({ DestinationCidrBlock: r.destino, GatewayId: r.alvo, State: r.estado || "active", Origin: r.alvo === "local" ? "CreateRouteTable" : "CreateRoute" })),
        Associations: (t.associacoes || []).map((s) => ({ RouteTableAssociationId: "rtbassoc-0" + hexAleatorio(16), RouteTableId: t.id, SubnetId: s, Main: false }))
          .concat(t.principal ? [{ RouteTableAssociationId: "rtbassoc-0" + hexAleatorio(16), RouteTableId: t.id, Main: true }] : []),
      })) });
    },
    "create-route": (conta, pos, flags) => {
      const t = acharTabela(conta, flags, "CreateRoute");
      const destino = exigirFlag(flags, "destination-cidr-block");
      const alvo = flags["gateway-id"] || flags["nat-gateway-id"] || flags["instance-id"];
      if (!alvo) throw new ErroCli(`An error occurred (MissingParameter) when calling the CreateRoute operation: The request must contain a gateway or target.\nEx.: --gateway-id igw-xxxx`);
      if (String(alvo).startsWith("igw-") && !conta.vpc.igws[String(alvo)]) {
        throw new ErroCli(`An error occurred (InvalidGatewayID.NotFound) when calling the CreateRoute operation: The gateway ID '${alvo}' does not exist\nDica: veja com 'aws ec2 describe-internet-gateways'.`);
      }
      if (t.rotas.some((r) => r.destino === destino)) {
        throw new ErroCli(`An error occurred (RouteAlreadyExists) when calling the CreateRoute operation: The route identified by ${destino} already exists.`);
      }
      t.rotas.push({ destino, alvo: String(alvo), estado: "active" });
      if (destino === "0.0.0.0/0" && String(alvo).startsWith("igw-")) {
        avisarClimb("Essa é a rota que torna a sub-rede PÚBLICA: tudo que não for da própria VPC (0.0.0.0/0) sai pelo internet gateway.");
      }
      return js({ Return: true });
    },
    "delete-route": (conta, pos, flags) => {
      const t = acharTabela(conta, flags, "DeleteRoute");
      const destino = exigirFlag(flags, "destination-cidr-block");
      const i = t.rotas.findIndex((r) => r.destino === destino && r.alvo !== "local");
      if (i < 0) throw new ErroCli(`An error occurred (InvalidRoute.NotFound) when calling the DeleteRoute operation: no route with destination-cidr-block ${destino}`);
      t.rotas.splice(i, 1);
      return okSilencioso("Rota removida.");
    },
    "associate-route-table": (conta, pos, flags) => {
      const t = acharTabela(conta, flags, "AssociateRouteTable");
      const sub = exigirFlag(flags, "subnet-id");
      if (!conta.vpc.subnets[sub]) throw new ErroCli(`An error occurred (InvalidSubnetID.NotFound) when calling the AssociateRouteTable operation: The subnet ID '${sub}' does not exist`);
      for (const outra of Object.values(conta.vpc.tabelas)) {
        outra.associacoes = (outra.associacoes || []).filter((s) => s !== sub);
      }
      t.associacoes.push(sub);
      return js({ AssociationId: "rtbassoc-0" + hexAleatorio(16), AssociationState: { State: "associated" } });
    },
    "describe-internet-gateways": (conta) => {
      rede(conta);
      const l = Object.values(conta.vpc.igws);
      if (!l.length) { avisarClimb("Nenhum internet gateway. Crie com: aws ec2 create-internet-gateway"); return js({ InternetGateways: [] }); }
      return js({ InternetGateways: l.map((g) => ({
        InternetGatewayId: g.id, OwnerId: CONTA_ID(conta),
        Attachments: g.vpc ? [{ State: "available", VpcId: g.vpc }] : [],
      })) });
    },
  };

  // ============================================================
  // Network ACLs (o firewall da SUB-REDE, sem estado)
  // ============================================================
  function naclDaSubnet(conta, subnetId) {
    rede(conta);
    const nacls = Object.values(conta.vpc.nacls);
    const explicita = nacls.find((n) => (n.subnets || []).includes(subnetId));
    if (explicita) return explicita;
    const sub = conta.vpc.subnets[subnetId];
    if (!sub) return null;
    return nacls.find((n) => n.vpc === sub.vpc && n.padrao) || null;
  }
  // A primeira regra (menor número) que casa DECIDE — e a NACL não tem estado.
  function naclPermite(nacl, porta, saida) {
    if (!nacl) return true; // sem NACL associada, nada bloqueia
    const regras = (nacl.entradas || []).filter((e) => !!e.saida === !!saida).sort((a, b) => a.numero - b.numero);
    for (const r of regras) {
      const casaPorta = !r.de || (porta >= r.de && porta <= r.ate);
      if (casaPorta) return r.acao === "allow";
    }
    return false; // regra implícita final: nega tudo
  }
  function acharNacl(conta, flags, operacao) {
    rede(conta);
    const id = exigirFlag(flags, "network-acl-id");
    const n = conta.vpc.nacls[id];
    if (!n) throw new ErroCli(`An error occurred (InvalidNetworkAclID.NotFound) when calling the ${operacao} operation: The networkAcl ID '${id}' does not exist\nDica: veja com 'aws ec2 describe-network-acls'.`);
    return n;
  }
  const cmdNacl = {
    "describe-network-acls": (conta, pos, flags) => {
      rede(conta);
      let lista = Object.values(conta.vpc.nacls);
      const filtro = flags.filter || flags.filters;
      if (filtro) {
        const sub = (String(filtro).match(/association\.subnet-id[^']*'?([\w-]+)'?/) || [])[1];
        if (sub) {
          const alvo = naclDaSubnet(conta, sub);
          lista = alvo ? [alvo] : [];
        }
      }
      if (flags["network-acl-ids"] !== undefined) {
        const ids = [].concat(flags["network-acl-ids"]).map(String);
        lista = lista.filter((n) => ids.includes(n.id));
      }
      return js({ NetworkAcls: lista.map((n) => ({
        NetworkAclId: n.id, VpcId: n.vpc, IsDefault: !!n.padrao,
        Associations: (n.subnets || []).map((s) => ({ NetworkAclAssociationId: "aclassoc-0" + hexAleatorio(16), NetworkAclId: n.id, SubnetId: s })),
        Entries: (n.entradas || []).slice().sort((a, b) => a.numero - b.numero).map((e) => ({
          RuleNumber: e.numero, Protocol: e.protocolo || "-1", RuleAction: e.acao,
          Egress: !!e.saida, CidrBlock: e.cidr || "0.0.0.0/0",
          PortRange: e.de ? { From: e.de, To: e.ate } : undefined,
        })),
      })) });
    },
    "create-network-acl-entry": (conta, pos, flags) => {
      const n = acharNacl(conta, flags, "CreateNetworkAclEntry");
      const numero = parseInt(exigirFlag(flags, "rule-number"), 10);
      const acao = String(exigirFlag(flags, "rule-action")).toLowerCase();
      if (acao !== "allow" && acao !== "deny") throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the CreateNetworkAclEntry operation: Invalid rule action: ${acao} (use allow ou deny)`);
      const saida = flags.egress !== undefined;
      if (n.entradas.some((e) => e.numero === numero && !!e.saida === saida)) {
        throw new ErroCli(`An error occurred (NetworkAclEntryAlreadyExists) when calling the CreateNetworkAclEntry operation: The network acl entry identified by ${numero} already exists.`);
      }
      const faixa = String(flags["port-range"] || "");
      const de = (faixa.match(/From=(\d+)/) || [])[1];
      const ate = (faixa.match(/To=(\d+)/) || [])[1];
      n.entradas.push({
        numero, acao, saida, cidr: String(flags["cidr-block"] || "0.0.0.0/0"),
        protocolo: String(flags.protocol || "-1"),
        de: de ? parseInt(de, 10) : null, ate: ate ? parseInt(ate, 10) : null,
      });
      avisarClimb("Lembre: na network ACL vale a regra de MENOR número que casar. Uma regra 40 de deny vence uma regra 100 de allow.");
      return okSilencioso(`Regra ${numero} criada na ${n.id}.`);
    },
    "delete-network-acl-entry": (conta, pos, flags) => {
      const n = acharNacl(conta, flags, "DeleteNetworkAclEntry");
      const numero = parseInt(exigirFlag(flags, "rule-number"), 10);
      const saida = flags.egress !== undefined;
      const i = n.entradas.findIndex((e) => e.numero === numero && !!e.saida === saida);
      if (i < 0) throw new ErroCli(`An error occurred (InvalidNetworkAclEntry.NotFound) when calling the DeleteNetworkAclEntry operation: The network acl entry identified by ${numero} does not exist.\nDica: passe --ingress (entrada) ou --egress (saída) igual ao da regra.`);
      n.entradas.splice(i, 1);
      return okSilencioso(`Regra ${numero} removida da ${n.id}.`);
    },
  };

  // ============================================================
  // Flow Logs — registram o tráfego no formato real da AWS
  // ============================================================
  function eniDaInstancia(conta, id) {
    // id determinístico (a mesma instância sempre tem a mesma eni)
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return "eni-0" + h.toString(16).padStart(16, "0").slice(0, 16);
  }
  function caminhoFlowLog(conta) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `AWSLogs/${CONTA_ID(conta)}/vpcflowlogs/${REGIAO(conta)}/${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}/flowlog.log`;
  }
  // Registra uma linha de flow log (só se houver flow log ativo na VPC).
  function registrarFluxo(conta, dados) {
    rede(conta);
    const ativos = Object.values(conta.vpc.flowLogs).filter((f) => f.status === "ACTIVE");
    if (!ativos.length) return;
    const agora = Math.floor(Date.now() / 1000);
    // formato oficial: version account-id interface-id srcaddr dstaddr srcport
    // dstport protocol packets bytes start end action log-status
    const linha = [
      2, CONTA_ID(conta), dados.eni, dados.origem, dados.destino, dados.portaOrigem,
      dados.porta, 6, dados.acao === "ACCEPT" ? 12 : 1, dados.acao === "ACCEPT" ? 3240 : 40,
      agora - 30, agora, dados.acao, "OK",
    ].join(" ");
    conta.vpc.registros.push(linha);
    if (conta.vpc.registros.length > 500) conta.vpc.registros.shift();
    // entrega no bucket do flow log (é o que a AWS faz)
    for (const f of ativos) {
      const b = conta.s3.buckets[f.bucket];
      if (!b) continue;
      const chave = caminhoFlowLog(conta);
      b.objetos[chave] = {
        tamanho: conta.vpc.registros.join("\n").length,
        conteudo: cabecalhoFlow() + "\n" + conta.vpc.registros.join("\n") + "\n",
        modificadoEm: typeof dataFormatada === "function" ? dataFormatada() : agoraIso(),
      };
    }
  }
  function cabecalhoFlow() {
    return "version account-id interface-id srcaddr dstaddr srcport dstport protocol packets bytes start end action log-status";
  }
  const cmdFlowLogs = {
    "create-flow-logs": (conta, pos, flags) => {
      rede(conta);
      const tipo = String(exigirFlag(flags, "resource-type"));
      const ids = [].concat(exigirFlag(flags, "resource-ids")).map(String);
      const trafego = String(exigirFlag(flags, "traffic-type")).toUpperCase();
      if (!["ALL", "ACCEPT", "REJECT"].includes(trafego)) throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the CreateFlowLogs operation: Invalid traffic type: ${trafego} (use ALL, ACCEPT ou REJECT)`);
      const destino = String(exigirFlag(flags, "log-destination"));
      const bucket = destino.replace(/^arn:aws:s3:::/, "").split("/")[0];
      if (!conta.s3.buckets[bucket]) throw new ErroCli(`An error occurred (InvalidParameter) when calling the CreateFlowLogs operation: Access Denied for LogDestination: ${bucket}. Please check your permissions.\nO bucket precisa existir: aws s3 mb s3://${bucket}`);
      const criados = [];
      for (const rid of ids) {
        if (tipo === "VPC" && !conta.vpc.vpcs[rid]) throw new ErroCli(`An error occurred (InvalidVpcID.NotFound) when calling the CreateFlowLogs operation: The vpc ID '${rid}' does not exist`);
        const id = "fl-0" + hexAleatorio(16);
        conta.vpc.flowLogs[id] = { id, recurso: rid, tipo, trafego, bucket, status: "ACTIVE", criadoEm: agoraIso() };
        criados.push(id);
      }
      avisarClimb("Flow log ativo. A partir de agora, cada tentativa de conexão vira uma linha com ACCEPT ou REJECT — é o que você vai analisar depois.");
      return js({ ClientToken: hexAleatorio(20), FlowLogIds: criados, Unsuccessful: [] });
    },
    "describe-flow-logs": (conta) => {
      rede(conta);
      const l = Object.values(conta.vpc.flowLogs);
      if (!l.length) { avisarClimb("Nenhum flow log. Crie com: aws ec2 create-flow-logs --resource-type VPC --resource-ids <vpc-id> --traffic-type ALL --log-destination-type s3 --log-destination arn:aws:s3:::<bucket>"); return js({ FlowLogs: [] }); }
      return js({ FlowLogs: l.map((f) => ({
        FlowLogId: f.id, ResourceId: f.recurso, TrafficType: f.trafego,
        FlowLogStatus: f.status, LogDestinationType: "s3",
        LogDestination: `arn:aws:s3:::${f.bucket}`, CreationTime: f.criadoEm,
      })) });
    },
    "delete-flow-logs": (conta, pos, flags) => {
      rede(conta);
      const ids = [].concat(exigirFlag(flags, "flow-log-ids")).map(String);
      for (const id of ids) delete conta.vpc.flowLogs[id];
      return js({ ClientToken: hexAleatorio(20), Unsuccessful: [] });
    },
    "describe-network-interfaces": (conta, pos, flags) => {
      rede(conta);
      let lista = Object.values(conta.ec2.instancias).filter((i) => i.estado !== "terminated");
      const filtro = flags.filters || flags.filter;
      if (filtro) {
        const ip = (String(filtro).match(/association\.public-ip[^']*'?([\d.]+)'?/) || [])[1];
        if (ip) lista = lista.filter((i) => i.ipPublico === ip);
      }
      return js({ NetworkInterfaces: lista.map((i) => ({
        NetworkInterfaceId: eniDaInstancia(conta, i.id), SubnetId: i.subnet || "—",
        VpcId: i.vpc || "—", Status: "in-use", PrivateIpAddress: i.ipPrivado || "10.0.1.10",
        Attachment: { InstanceId: i.id, Status: "attached" },
        Association: i.ipPublico ? { PublicIp: i.ipPublico } : undefined,
      })) });
    },
  };

  // ============================================================
  // MODELO DE CONECTIVIDADE — o coração do laboratório
  // Uma conexão só entra se: existe rota pro IGW + a network ACL deixa +
  // o security group libera a porta. Cada tentativa vira flow log.
  // ============================================================
  function tentarConexao(conta, ip, porta) {
    rede(conta);
    const inst = Object.values(conta.ec2.instancias).find((i) => i.ipPublico === ip && i.estado === "running");
    if (!inst) return { ok: false, motivo: "sem-host" };

    const eni = eniDaInstancia(conta, inst.id);
    const origem = "203.0.113.25"; // "o seu computador" na internet
    const base = { eni, origem, destino: inst.ipPrivado || "10.0.1.10", porta, portaOrigem: 40000 + (porta % 1000) };

    // 1. a sub-rede tem rota pra internet?
    const tabela = inst.subnet ? tabelaDaSubnet(conta, inst.subnet) : null;
    const temRota = tabela && tabela.rotas.some((r) => r.destino === "0.0.0.0/0" && String(r.alvo).startsWith("igw-"));
    if (inst.subnet && !temRota) {
      // sem rota o pacote nem chega na instância: não gera flow log
      return { ok: false, motivo: "sem-rota" };
    }
    // 2. a network ACL da sub-rede deixa passar?
    const nacl = inst.subnet ? naclDaSubnet(conta, inst.subnet) : null;
    if (!naclPermite(nacl, porta, false)) {
      registrarFluxo(conta, Object.assign({ acao: "REJECT" }, base));
      return { ok: false, motivo: "nacl", nacl: nacl && nacl.id };
    }
    // 3. o security group libera a porta?
    const grupos = (inst.sgs || []).map((n) => Object.values(conta.ec2.securityGroups).find((g) => g.nome === n || g.id === n)).filter(Boolean);
    const liberado = !grupos.length || grupos.some((g) => (g.regras || []).some((r) => r.porta === porta));
    if (!liberado) {
      registrarFluxo(conta, Object.assign({ acao: "REJECT" }, base));
      return { ok: false, motivo: "sg" };
    }
    registrarFluxo(conta, Object.assign({ acao: "ACCEPT" }, base));
    return { ok: true, inst };
  }

  // ---------- comandos de terminal: curl, nmap, ssh ----------
  // "Provas": registram que o aluno REALMENTE rodou o comando. Sem isso, uma
  // atividade que pede "rode o curl de novo" seria dada de graça, porque o
  // estado da rede já foi consertado na atividade anterior.
  function prova(conta, chave) {
    rede(conta);
    conta.vpc.provas = conta.vpc.provas || {};
    conta.vpc.provas[chave] = true;
  }
  function textoCurl(conta, alvo) {
    const ip = String(alvo).replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
    const r = tentarConexao(conta, ip, 80);
    prova(conta, "curl");
    if (r.motivo === "sem-host") return { erro: `curl: (6) Could not resolve host: ${ip}` };
    if (!r.ok) return { erro: `curl: (28) Failed to connect to ${ip} port 80 after 75002 ms: Couldn't connect to server` };
    prova(conta, "curlOk");
    return { saida: "<html><body><h1>Bem-vindo à Loja do CLImb!</h1><p>Servidor no ar. 🎉</p></body></html>" };
  }
  function textoSsh(conta, alvo) {
    const ip = String(alvo).replace(/^\w+@/, "");
    const r = tentarConexao(conta, ip, 22);
    prova(conta, "ssh");
    if (r.motivo === "sem-host") return { erro: `ssh: Could not resolve hostname ${ip}: Name or service not known` };
    if (!r.ok) return { erro: `ssh: connect to host ${ip} port 22: Connection timed out` };
    prova(conta, "sshOk");
    return { saida: "Bem-vindo ao servidor web da loja!\n[ec2-user@web-server ~]$ (conexão de teste encerrada)" };
  }
  function textoNmap(conta, alvo) {
    prova(conta, "nmap");
    const ip = String(alvo).replace(/^https?:\/\//, "").split("/")[0];
    const portas = [22, 80];
    const abertas = portas.filter((p) => tentarConexao(conta, ip, p).ok);
    let out = `Starting Nmap 7.94 ( https://nmap.org )\nNmap scan report for ${ip}\n`;
    if (!abertas.length) {
      out += "Host seems down. If it is really up, but blocking our ping probes, try -Pn\n";
      out += "\n(nenhuma porta respondeu — pode ser rota, network ACL ou security group)";
      return { saida: out };
    }
    out += "Host is up (0.023s latency).\n\nPORT   STATE  SERVICE\n";
    for (const p of portas) {
      out += `${String(p).padEnd(6)} ${abertas.includes(p) ? "open  " : "closed"} ${p === 22 ? "ssh" : "http"}\n`;
    }
    return { saida: out.trimEnd() };
  }

  // ============================================================
  // Registro dos comandos AWS
  // ============================================================
  if (typeof SERVICOS !== "undefined") {
    Object.assign(SERVICOS.ec2, cmdRotas, cmdNacl, cmdFlowLogs);
  }

  // ---------- wrap 1: comandos de shell (curl, ssh, nmap) ----------
  (function ligarShell() {
    if (typeof window === "undefined" || typeof window.executarLinha !== "function") return;
    const anterior = window.executarLinha;
    window.executarLinha = function (linha) {
      const bruto = (linha || "").trim();
      const nome = bruto.split(/\s+/)[0];
      // o grep é do laboratório de Linux — só marcamos que a busca por REJECT
      // aconteceu (prova da última atividade) e deixamos ele seguir o fluxo
      if (nome === "grep" && /REJECT/i.test(bruto)) {
        try { prova(jogo.conta, "grepReject"); } catch (e) { /* ok */ }
      }
      if (!["curl", "ssh", "nmap"].includes(nome)) return anterior(linha);
      if (typeof imprimirComando === "function") imprimirComando(bruto);
      const alvo = bruto.split(/\s+/).filter((t) => !t.startsWith("-"))[1];
      if (!alvo) {
        imprimir(`${nome}: falta o endereço. Ex.: ${nome} ${nome === "curl" ? "http://" : ""}198.51.100.10`, "erro");
        return;
      }
      const conta = jogo.conta;
      const r = nome === "curl" ? textoCurl(conta, alvo) : nome === "ssh" ? textoSsh(conta, alvo) : textoNmap(conta, alvo);
      imprimir(r.erro || r.saida, r.erro ? "erro" : "");
      try { salvarJogo(); } catch (e) { /* ok */ }
      if (typeof verificarDesafios === "function") verificarDesafios(null);
    };
  })();

  // ---------- wrap 2: download do flow log cai no sistema de arquivos ----------
  // Assim o fluxo do lab funciona de verdade: baixar e depois 'grep REJECT'.
  (function ligarDownload() {
    const alvo = typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null);
    // no navegador vem do window; nos testes (eval no Node) vem do escopo local
    const base = (alvo && alvo.executarComandoAwsBase) || (typeof executarComandoAwsBase === "function" ? executarComandoAwsBase : null);
    if (typeof base !== "function" || base.__climbDownload) return;
    const envolvido = function (conta, linha) {
      const r = base(conta, linha);
      try {
        const c = r && r.cmd;
        if (c && c.servico === "s3" && c.sub === "cp" && r.ok) {
          const origem = (c.posicionais || [])[0] || "";
          const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(String(origem));
          if (m) {
            const obj = ((conta.s3.buckets[m[1]] || {}).objetos || {})[m[2]];
            if (obj && obj.conteudo && typeof escreverNoFs === "function") {
              escreverNoFs(conta, m[2].split("/").pop(), obj.conteudo);
            }
          }
        }
      } catch (e) { /* download nunca quebra o comando */ }
      return r;
    };
    envolvido.__climbDownload = true;
    if (alvo) alvo.executarComandoAwsBase = envolvido;
    try { executarComandoAwsBase = envolvido; } catch (e) { /* ok */ }
  })();

  // Escreve um arquivo no home do sistema de arquivos simulado.
  // Não depende do linux-lab estar carregado: se o fs ainda não existir, cria
  // a estrutura mínima (os testes rodam sem o linux-lab.js).
  function escreverNoFs(conta, nome, conteudo) {
    if (typeof fsSeed === "function") fsSeed(conta);
    if (!conta.fs) {
      conta.fs = { tipo: "dir", modo: "755", filhos: { home: { tipo: "dir", modo: "755", filhos: { "ec2-user": { tipo: "dir", modo: "755", filhos: {} } } } } };
      conta.cwd = conta.cwd || "/home/ec2-user";
    }
    const home = ((((conta.fs || {}).filhos || {}).home || {}).filhos || {})["ec2-user"];
    if (!home) return;
    home.filhos = home.filhos || {};
    home.filhos[nome] = { tipo: "arquivo", conteudo, modo: "644" };
  }
  if (typeof window !== "undefined") window.escreverNoFs = escreverNoFs;

  // ============================================================
  // O LABORATÓRIO — ambiente com defeitos plantados
  // ============================================================
  const IP_WEB = "198.51.100.42";
  function montarLab(conta) {
    rede(conta);
    if (conta.vpc.labMontado) return;

    // VPC + sub-rede pública + gateway
    const vpcId = "vpc-0" + hexAleatorio(16);
    conta.vpc.vpcs[vpcId] = { id: vpcId, cidr: "10.0.0.0/16", criadaEm: agoraIso(), igw: null, nome: "loja-vpc" };
    const subId = "subnet-0" + hexAleatorio(16);
    conta.vpc.subnets[subId] = { id: subId, vpc: vpcId, cidr: "10.0.1.0/24", az: REGIAO(conta) + "a", nome: "loja-publica" };
    const igwId = "igw-0" + hexAleatorio(16);
    conta.vpc.igws[igwId] = { id: igwId, vpc: vpcId };
    conta.vpc.vpcs[vpcId].igw = igwId;

    // DEFEITO 1: a route table da sub-rede NÃO tem rota pra internet
    const rtbId = "rtb-0" + hexAleatorio(16);
    conta.vpc.tabelas[rtbId] = {
      id: rtbId, vpc: vpcId, principal: true, associacoes: [subId],
      rotas: [{ destino: "10.0.0.0/16", alvo: "local", estado: "active" }],
    };

    // DEFEITO 2: a network ACL tem uma regra 40 negando SSH (porta 22)
    const aclId = "acl-0" + hexAleatorio(16);
    conta.vpc.nacls[aclId] = {
      id: aclId, vpc: vpcId, padrao: true, subnets: [subId],
      entradas: [
        { numero: 40, acao: "deny", saida: false, cidr: "0.0.0.0/0", protocolo: "6", de: 22, ate: 22 },
        { numero: 100, acao: "allow", saida: false, cidr: "0.0.0.0/0", protocolo: "-1", de: null, ate: null },
        { numero: 100, acao: "allow", saida: true, cidr: "0.0.0.0/0", protocolo: "-1", de: null, ate: null },
      ],
    };

    // security group CORRETO (80 e 22 liberados) — pra o aluno descartar essa hipótese
    const sgId = "sg-0" + hexAleatorio(16);
    conta.ec2.securityGroups[sgId] = {
      id: sgId, nome: "loja-web-sg", descricao: "Servidor web da loja",
      regras: [{ porta: 80, protocolo: "tcp", cidr: "0.0.0.0/0" }, { porta: 22, protocolo: "tcp", cidr: "0.0.0.0/0" }],
    };

    // o servidor web, rodando
    const instId = "i-0" + hexAleatorio(16);
    conta.ec2.instancias[instId] = {
      id: instId, imagem: "ami-0abcd1234ef567890", tipo: "t3.micro", chave: null,
      sgs: ["loja-web-sg"], estado: "running", criadaEm: agoraIso(),
      resId: "r-0" + hexAleatorio(16), nome: "loja-web-server",
      ipPublico: IP_WEB, ipPrivado: "10.0.1.10", subnet: subId, vpc: vpcId,
    };

    conta.vpc.labMontado = true;
    conta.vpc.labIds = { vpc: vpcId, subnet: subId, igw: igwId, rtb: rtbId, acl: aclId, sg: sgId, inst: instId };
  }

  // monta o ambiente quando o aluno abre qualquer atividade do lab
  (function ligarMontagem() {
    if (typeof window === "undefined" || typeof window.selecionarDesafio !== "function") return;
    const anterior = window.selecionarDesafio;
    window.selecionarDesafio = function (id) {
      try {
        const d = typeof obterDesafio === "function" ? obterDesafio(id) : null;
        if (d && d.servico === "diagnostico" && typeof jogo !== "undefined" && jogo.conta) {
          const antes = !!jogo.conta.vpc && !!jogo.conta.vpc.labMontado;
          montarLab(jogo.conta);
          if (!antes) {
            salvarJogo();
            if (typeof toast === "function") {
              toast("🔧 <strong>Ambiente do laboratório criado!</strong> A infra da loja já existe na sua conta — e está com defeito. Boa investigação!", "neutro");
            }
          }
        }
      } catch (e) { /* nunca impede de abrir a atividade */ }
      return anterior(id);
    };
  })();

  // ---------- helpers dos validadores ----------
  const temRotaInternet = (c) => {
    const ids = (c.vpc || {}).labIds;
    if (!ids) return false;
    const t = (c.vpc.tabelas || {})[ids.rtb];
    return !!t && t.rotas.some((r) => r.destino === "0.0.0.0/0" && String(r.alvo).startsWith("igw-"));
  };
  const naclLiberada = (c) => {
    const ids = (c.vpc || {}).labIds;
    if (!ids) return false;
    const n = (c.vpc.nacls || {})[ids.acl];
    return !!n && !n.entradas.some((e) => e.acao === "deny" && !e.saida && e.de === 22);
  };
  const flowLogAtivo = (c) => !!(c.vpc && Object.values(c.vpc.flowLogs || {}).some((f) => f.status === "ACTIVE"));
  // provou que RODOU o comando (não basta a rede estar consertada)
  const rodou = (c, chave) => !!(c.vpc && c.vpc.provas && c.vpc.provas[chave]);
  const temRegistroRejeitado = (c) => !!(c.vpc && (c.vpc.registros || []).some((l) => / REJECT /.test(l)));
  const baixouLog = (c) => {
    const home = ((((c.fs || {}).filhos || {}).home || {}).filhos || {})["ec2-user"];
    return !!home && Object.keys(home.filhos || {}).some((n) => /flowlog/i.test(n));
  };

  // ============================================================
  // Atividades da trilha "Diagnóstico"
  // ============================================================
  const DESAFIOS_LAB = [
    { id: "diag-1", servico: "diagnostico", nivel: 2, xp: 70, titulo: "O chamado chegou",
      descricao: "<b>Segunda-feira, 8h.</b> O site da loja não abre e ninguém consegue entrar no servidor por SSH. A infra existe e o servidor está ligado — alguém mexeu na rede na sexta.<br><br>Comece <b>reproduzindo o problema</b>: tente acessar o site com <b>curl http://198.51.100.42</b>. <small>(sim, vai falhar — é esse o ponto de partida de todo diagnóstico)</small>",
      dicas: ["curl http://198.51.100.42", "Reproduzir o erro antes de mexer em qualquer coisa é o passo que mais gente pula."],
      solucao: ["curl http://198.51.100.42"],
      validar: (c) => rodou(c, "curl") },
    { id: "diag-2", servico: "diagnostico", nivel: 2, xp: 80, titulo: "Ligue as câmeras (flow logs)",
      descricao: "Antes de sair mexendo, registre o tráfego. Crie o bucket <b>flowlogs-loja</b> e ative um <b>flow log</b> na VPC do laboratório capturando <b>ALL</b>. <small>(pegue o id da VPC com <code>aws ec2 describe-vpcs</code>)</small>",
      dicas: ["aws s3 mb s3://flowlogs-loja",
        "aws ec2 describe-vpcs",
        "aws ec2 create-flow-logs --resource-type VPC --resource-ids <vpc-id> --traffic-type ALL --log-destination-type s3 --log-destination arn:aws:s3:::flowlogs-loja"],
      solucao: ["aws s3 mb s3://flowlogs-loja",
        "aws ec2 create-flow-logs --resource-type VPC --resource-ids <vpc-id> --traffic-type ALL --log-destination-type s3 --log-destination arn:aws:s3:::flowlogs-loja"],
      validar: (c) => flowLogAtivo(c) },
    { id: "diag-3", servico: "diagnostico", nivel: 2, xp: 70, titulo: "Confirme que está gravando",
      descricao: "Verifique o <b>flow log</b>: o <code>FlowLogStatus</code> precisa estar <b>ACTIVE</b> e apontar pro seu bucket.",
      dicas: ["aws ec2 describe-flow-logs"], solucao: ["aws ec2 describe-flow-logs"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-flow-logs") },
    { id: "diag-4", servico: "diagnostico", nivel: 3, xp: 90, titulo: "Descarte a hipótese óbvia",
      descricao: "Todo mundo chuta \"é o firewall\". <b>Verifique o security group</b> do servidor: as portas <b>80</b> e <b>22</b> estão liberadas? <small>(spoiler: estão — e descartar hipótese também é diagnóstico)</small>",
      dicas: ["aws ec2 describe-security-groups"], solucao: ["aws ec2 describe-security-groups"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-security-groups") },
    { id: "diag-5", servico: "diagnostico", nivel: 3, xp: 100, titulo: "Siga o caminho do pacote",
      descricao: "Se o firewall libera, o problema está <b>antes</b>: o pacote não sabe voltar pra internet. Veja a <b>route table</b> da sub-rede do servidor.",
      dicas: ["aws ec2 describe-route-tables", "Uma sub-rede PÚBLICA precisa de uma rota 0.0.0.0/0 apontando pro internet gateway. Está lá?"],
      solucao: ["aws ec2 describe-route-tables"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-route-tables") },
    { id: "diag-6", servico: "diagnostico", nivel: 3, xp: 120, titulo: "Conserto #1: a rota que faltava",
      descricao: "Achou: não existe rota pra internet. <b>Crie a rota</b> <b>0.0.0.0/0</b> apontando pro internet gateway. <small>(pegue o id do gateway com <code>aws ec2 describe-internet-gateways</code>)</small>",
      dicas: ["aws ec2 describe-internet-gateways",
        "aws ec2 create-route --route-table-id <rtb-id> --gateway-id <igw-id> --destination-cidr-block 0.0.0.0/0"],
      solucao: ["aws ec2 create-route --route-table-id <rtb-id> --gateway-id <igw-id> --destination-cidr-block 0.0.0.0/0"],
      validar: (c) => temRotaInternet(c) },
    { id: "diag-7", servico: "diagnostico", nivel: 3, xp: 80, titulo: "O site voltou?",
      descricao: "Momento da verdade: rode <b>curl http://198.51.100.42</b> de novo. Se aparecer a página da loja, o primeiro defeito está resolvido. 🎉",
      dicas: ["curl http://198.51.100.42"], solucao: ["curl http://198.51.100.42"],
      validar: (c) => rodou(c, "curlOk") },
    { id: "diag-8", servico: "diagnostico", nivel: 3, xp: 90, titulo: "Mas o SSH continua morto",
      descricao: "O site abre, mas <b>ssh 198.51.100.42</b> ainda dá timeout. Confirme com o <b>nmap</b>: qual porta responde e qual não? <small>(a 80 abre e a 22 não — então não é a instância, é a rede)</small>",
      dicas: ["nmap 198.51.100.42", "Se uma porta abre e a outra não, o bloqueio é específico daquela porta."],
      solucao: ["nmap 198.51.100.42"],
      validar: (c) => rodou(c, "nmap") && temRotaInternet(c) },
    { id: "diag-9", servico: "diagnostico", nivel: 3, xp: 110, titulo: "O firewall que quase ninguém lembra",
      descricao: "O security group libera a 22, a rota existe… falta a <b>network ACL</b>, o firewall da <i>sub-rede</i>. Liste as network ACLs e olhe as regras de entrada.",
      dicas: ["aws ec2 describe-network-acls", "Na network ACL vale a regra de MENOR número que casar — procure uma regra baixa com deny."],
      solucao: ["aws ec2 describe-network-acls"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-network-acls") },
    { id: "diag-10", servico: "diagnostico", nivel: 3, xp: 130, titulo: "Conserto #2: remova a regra sabotadora",
      descricao: "Lá está: a regra <b>40</b> nega a porta 22 e, por ter número menor, vence a regra 100 que permite tudo. <b>Apague a regra 40</b> de entrada.",
      dicas: ["aws ec2 delete-network-acl-entry --network-acl-id <acl-id> --ingress --rule-number 40",
        "O --ingress diz que é regra de ENTRADA (a de saída seria --egress)."],
      solucao: ["aws ec2 delete-network-acl-entry --network-acl-id <acl-id> --ingress --rule-number 40"],
      validar: (c) => naclLiberada(c) },
    { id: "diag-11", servico: "diagnostico", nivel: 3, xp: 90, titulo: "Entre no servidor",
      descricao: "Agora sim: <b>ssh 198.51.100.42</b>. Se o servidor te receber, os dois defeitos foram resolvidos. 🏆",
      dicas: ["ssh 198.51.100.42"], solucao: ["ssh 198.51.100.42"],
      validar: (c) => rodou(c, "sshOk") },
    { id: "diag-12", servico: "diagnostico", nivel: 3, xp: 110, titulo: "A prova nos logs",
      descricao: "Todas as tentativas que falharam viraram registro. <b>Baixe o flow log</b> do bucket <b>flowlogs-loja</b> pra sua máquina. <small>(use <code>aws s3 ls s3://flowlogs-loja</code> pra achar o caminho do arquivo)</small>",
      dicas: ["aws s3 ls s3://flowlogs-loja",
        "aws s3 cp s3://flowlogs-loja/<caminho-do-arquivo> ."],
      solucao: ["aws s3 cp s3://flowlogs-loja/<caminho-flowlog> ."],
      validar: (c) => baixouLog(c) },
    { id: "diag-13", servico: "diagnostico", nivel: 4, xp: 150, titulo: "Cace os REJECT",
      descricao: "Abra o arquivo e <b>filtre as linhas com REJECT</b> — são as conexões que a rede recusou enquanto estava quebrada. <small>(cada linha traz origem, destino, <b>porta</b> e a ação; a porta é o 7º campo)</small>",
      dicas: ["cat flowlog.log", "grep REJECT flowlog.log", "Repare que as rejeições são na porta 22 — exatamente o que a network ACL bloqueava."],
      solucao: ["grep REJECT flowlog.log"],
      validar: (c) => rodou(c, "grepReject") && temRegistroRejeitado(c) && baixouLog(c) },
  ];

  // ---------- Registro da trilha ----------
  if (typeof SERVICOS_META !== "undefined" && typeof DESAFIOS !== "undefined") {
    if (!SERVICOS_META.some((s) => s.id === "diagnostico")) {
      const iProj = SERVICOS_META.findIndex((s) => s.id === "projetos");
      const meta = { id: "diagnostico", nome: "Diagnóstico", subtitulo: "Conserte a infra quebrada", icone: "🔧" };
      if (iProj >= 0) SERVICOS_META.splice(iProj, 0, meta); else SERVICOS_META.push(meta);
      for (const d of DESAFIOS_LAB) DESAFIOS.push(d);
    }
  }

  // Executa curl/ssh/nmap SEM DOM — é assim que os testes (que rodam no Node)
  // conseguem gerar o tráfego do laboratório. No navegador quem chama é o wrap
  // de executarLinha lá em cima.
  function labShell(conta, linha) {
    const t = String(linha).trim().split(/\s+/);
    const nome = t[0];
    const alvo = t.filter((x) => !x.startsWith("-"))[1];
    if (!alvo) return null;
    if (nome === "curl") return textoCurl(conta, alvo);
    if (nome === "ssh") return textoSsh(conta, alvo);
    if (nome === "nmap") return textoNmap(conta, alvo);
    if (nome === "grep" && /REJECT/i.test(linha)) { prova(conta, "grepReject"); return { saida: "(grep executado)" }; }
    return null;
  }

  // exposto pros testes montarem o ambiente e gerarem tráfego sem passar pela UI
  const alvoGlobal = typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null);
  if (alvoGlobal) {
    alvoGlobal.montarLabVpc = montarLab;
    alvoGlobal.labShell = labShell;
  }
})();
