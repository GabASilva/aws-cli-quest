"use strict";
// ============================================================
// CLImb — servicos-fase1.js
// Fase 1 da expansão: VPC (rede, dentro do `aws ec2`), RDS (banco relacional)
// e CloudWatch (alarmes + Logs). Registra nos SERVICOS do simulador e empurra
// as trilhas em DESAFIOS/SERVICOS_META. Usa os globais do simulador.js
// (ErroCli, js, agoraIso, hexAleatorio, exigirFlag, okSilencioso, ehCmd).
// ============================================================
(function () {
  function estado(conta) {
    conta.vpc = conta.vpc || { vpcs: {}, subnets: {}, igws: {} };
    conta.rds = conta.rds || { instancias: {} };
    conta.cloudwatch = conta.cloudwatch || { alarmes: {} };
    conta.logs = conta.logs || { grupos: {} };
    return conta;
  }
  const CIDR_OK = /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/;

  // --<recurso>-ids e --filters Name=x,Values=a,b nos describe-* de rede.
  // Id que não existe é ERRO na AWS; filtro que não casa devolve lista vazia.
  // Nome de filtro desconhecido também é erro (e diz quais existem).
  function filtrarEc2(lista, flags, pos, flagIds, op, codigoNaoAchou, campos) {
    flags = flags || {};
    const extras = (pos || []).map(String);
    if (flags[flagIds] !== undefined) {
      const ids = [String(flags[flagIds])].concat(extras.filter((x) => /^[a-z]+-[0-9a-f]+$/.test(x)));
      const falta = ids.find((id) => !lista.some((r) => r.id === id));
      if (falta) throw new ErroCli(`An error occurred (${codigoNaoAchou}) when calling the ${op} operation: The ID '${falta}' does not exist`);
      lista = lista.filter((r) => ids.indexOf(r.id) >= 0);
    }
    if (flags.filters !== undefined) {
      const filtros = [String(flags.filters)].concat(extras.filter((x) => /^Name=/.test(x)));
      for (const f of filtros) {
        const nome = (f.match(/Name=([^,\s]+)/) || [])[1];
        const valores = ((f.match(/Values=(.+)$/) || [])[1] || "").split(",").filter(Boolean);
        if (!nome || !valores.length) throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the ${op} operation: filtro inválido "${f}". Forma: --filters Name=<nome>,Values=<valor>`);
        if (!campos[nome]) throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the ${op} operation: The filter '${nome}' is invalid\nFiltros no simulador: ${Object.keys(campos).join(", ")}`);
        lista = lista.filter((r) => valores.indexOf(String(campos[nome](r))) >= 0);
      }
    }
    return lista;
  }

  // ---------- VPC (subcomandos do aws ec2) ----------
  const cmdVpc = {
    "create-vpc": (conta, pos, flags) => {
      estado(conta);
      const cidr = exigirFlag(flags, "cidr-block");
      if (!CIDR_OK.test(cidr)) throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the CreateVpc operation: Value (${cidr}) for parameter cidrBlock is invalid. Ex.: 10.0.0.0/16`);
      const id = "vpc-0" + hexAleatorio(16);
      conta.vpc.vpcs[id] = { id, cidr, criadaEm: agoraIso(), igw: null };
      return js({ Vpc: { VpcId: id, CidrBlock: cidr, State: "available", IsDefault: false } });
    },
    "describe-vpcs": (conta, pos, flags) => {
      estado(conta);
      const vpcs = filtrarEc2(Object.values(conta.vpc.vpcs), flags, pos, "vpc-ids", "DescribeVpcs", "InvalidVpcID.NotFound",
        { "vpc-id": (v) => v.id, "cidr-block": (v) => v.cidr, "cidr": (v) => v.cidr });
      return js({ Vpcs: vpcs.map((v) => ({ VpcId: v.id, CidrBlock: v.cidr, State: "available", IsDefault: false })) });
    },
    "delete-vpc": (conta, pos, flags) => {
      estado(conta);
      const id = exigirFlag(flags, "vpc-id");
      if (!conta.vpc.vpcs[id]) throw new ErroCli(`An error occurred (InvalidVpcID.NotFound) when calling the DeleteVpc operation: The vpc ID '${id}' does not exist`);
      // A AWS não apaga em cascata: sub-rede ou gateway pendurado = DependencyViolation.
      const penduradas = Object.values(conta.vpc.subnets).filter((s) => s.vpc === id);
      const igwPreso = Object.values(conta.vpc.igws || {}).find((g) => g.vpc === id);
      if (penduradas.length || igwPreso) {
        throw new ErroCli(`An error occurred (DependencyViolation) when calling the DeleteVpc operation: The vpc '${id}' has dependencies and cannot be deleted.\n` +
          (penduradas.length ? `Apague antes as sub-redes: ${penduradas.map((s) => s.id).join(", ")} (aws ec2 delete-subnet --subnet-id ...)\n` : "") +
          (igwPreso ? `Desconecte antes o gateway: aws ec2 detach-internet-gateway --internet-gateway-id ${igwPreso.id} --vpc-id ${id}` : ""));
      }
      delete conta.vpc.vpcs[id];
      for (const s of Object.values(conta.vpc.subnets)) if (s.vpc === id) delete conta.vpc.subnets[s.id];
      return okSilencioso(`VPC ${id} apagada.`);
    },
    "create-subnet": (conta, pos, flags) => {
      estado(conta);
      const vpcId = exigirFlag(flags, "vpc-id");
      const cidr = exigirFlag(flags, "cidr-block");
      if (!conta.vpc.vpcs[vpcId]) throw new ErroCli(`An error occurred (InvalidVpcID.NotFound) when calling the CreateSubnet operation: The vpc ID '${vpcId}' does not exist`);
      if (!CIDR_OK.test(cidr)) throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the CreateSubnet operation: Value (${cidr}) for parameter cidrBlock is invalid.`);
      // A sub-rede tem que caber na faixa da VPC (e não pode ser maior que ela).
      const faixa = (c) => { const [ip, bits] = c.split("/"); const n = ip.split(".").reduce((a, o) => a * 256 + Number(o), 0); return [n, Number(bits)]; };
      const [redeVpc, bitsVpc] = faixa(conta.vpc.vpcs[vpcId].cidr);
      const [redeSub, bitsSub] = faixa(cidr);
      const cabe = bitsSub >= bitsVpc && Math.floor(redeSub / Math.pow(2, 32 - bitsVpc)) === Math.floor(redeVpc / Math.pow(2, 32 - bitsVpc));
      if (!cabe) throw new ErroCli(`An error occurred (InvalidSubnet.Range) when calling the CreateSubnet operation: The CIDR '${cidr}' is invalid.\nA sub-rede precisa caber dentro da VPC ${vpcId} (${conta.vpc.vpcs[vpcId].cidr}). Confira se pegou o id da VPC certa.`);
      if (Object.values(conta.vpc.subnets).some((s) => s.vpc === vpcId && s.cidr === cidr)) throw new ErroCli(`An error occurred (InvalidSubnet.Conflict) when calling the CreateSubnet operation: The CIDR '${cidr}' conflicts with another subnet`);
      const id = "subnet-0" + hexAleatorio(16);
      conta.vpc.subnets[id] = { id, vpc: vpcId, cidr, az: (conta.regiao || "us-east-1") + "a" };
      return js({ Subnet: { SubnetId: id, VpcId: vpcId, CidrBlock: cidr, AvailabilityZone: conta.vpc.subnets[id].az, State: "available" } });
    },
    "describe-subnets": (conta, pos, flags) => {
      estado(conta);
      const subnets = filtrarEc2(Object.values(conta.vpc.subnets), flags, pos, "subnet-ids", "DescribeSubnets", "InvalidSubnetID.NotFound",
        { "vpc-id": (s) => s.vpc, "subnet-id": (s) => s.id, "cidr-block": (s) => s.cidr, "availability-zone": (s) => s.az });
      return js({ Subnets: subnets.map((s) => ({ SubnetId: s.id, VpcId: s.vpc, CidrBlock: s.cidr, AvailabilityZone: s.az, State: "available" })) });
    },
    "create-internet-gateway": (conta) => {
      estado(conta);
      const id = "igw-0" + hexAleatorio(16);
      conta.vpc.igws[id] = { id, vpc: null };
      return js({ InternetGateway: { InternetGatewayId: id, Attachments: [] } });
    },
    "attach-internet-gateway": (conta, pos, flags) => {
      estado(conta);
      const igw = exigirFlag(flags, "internet-gateway-id");
      const vpcId = exigirFlag(flags, "vpc-id");
      if (!conta.vpc.igws[igw]) throw new ErroCli(`An error occurred (InvalidInternetGatewayID.NotFound) when calling the AttachInternetGateway operation: The gateway ID '${igw}' does not exist`);
      if (!conta.vpc.vpcs[vpcId]) throw new ErroCli(`An error occurred (InvalidVpcID.NotFound) when calling the AttachInternetGateway operation: The vpc ID '${vpcId}' does not exist`);
      conta.vpc.igws[igw].vpc = vpcId;
      conta.vpc.vpcs[vpcId].igw = igw;
      return okSilencioso(`Internet gateway ${igw} conectado à VPC ${vpcId}.`);
    },

    // ---------- desmontar a rede (25/09/2026) ----------
    // A AWS não apaga VPC em cascata. A ordem é: sub-redes → desconectar o
    // gateway → apagar o gateway → apagar a VPC. Estes três faltavam, e sem
    // eles a mensagem de DependencyViolation mandava rodar comando inexistente.
    "delete-subnet": (conta, pos, flags) => {
      estado(conta);
      const id = String(exigirFlag(flags, "subnet-id"));
      const s = conta.vpc.subnets[id];
      if (!s) throw new ErroCli(`An error occurred (InvalidSubnetID.NotFound) when calling the DeleteSubnet operation: The subnet ID '${id}' does not exist`);
      const inst = Object.values((conta.ec2 || {}).instancias || {}).find((i) => i.subnet === id && i.estado !== "terminated");
      if (inst) throw new ErroCli(`An error occurred (DependencyViolation) when calling the DeleteSubnet operation: The subnet '${id}' has dependencies and cannot be deleted.\nA instância ${inst.id} ainda está nela.`);
      delete conta.vpc.subnets[id];
      for (const t of Object.values(conta.vpc.tabelas || {})) if (t.associacoes) t.associacoes = t.associacoes.filter((x) => x !== id);
      return okSilencioso(`Sub-rede ${id} apagada.`);
    },
    "detach-internet-gateway": (conta, pos, flags) => {
      estado(conta);
      const igw = String(exigirFlag(flags, "internet-gateway-id"));
      const vpcId = String(exigirFlag(flags, "vpc-id"));
      const g = conta.vpc.igws[igw];
      if (!g) throw new ErroCli(`An error occurred (InvalidInternetGatewayID.NotFound) when calling the DetachInternetGateway operation: The gateway ID '${igw}' does not exist`);
      if (g.vpc !== vpcId) throw new ErroCli(`An error occurred (Gateway.NotAttached) when calling the DetachInternetGateway operation: resource ${igw} is not attached to network ${vpcId}`);
      g.vpc = null;
      if (conta.vpc.vpcs[vpcId]) conta.vpc.vpcs[vpcId].igw = null;
      avisarClimb("Gateway desconectado: a VPC perdeu a saída pra internet na hora. As rotas que apontavam pra ele ficam como 'blackhole' — o pacote vai e some.");
      return okSilencioso(`Internet gateway ${igw} desconectado da VPC ${vpcId}.`);
    },
    "delete-internet-gateway": (conta, pos, flags) => {
      estado(conta);
      const igw = String(exigirFlag(flags, "internet-gateway-id"));
      const g = conta.vpc.igws[igw];
      if (!g) throw new ErroCli(`An error occurred (InvalidInternetGatewayID.NotFound) when calling the DeleteInternetGateway operation: The gateway ID '${igw}' does not exist`);
      if (g.vpc) throw new ErroCli(`An error occurred (DependencyViolation) when calling the DeleteInternetGateway operation: The internetGateway '${igw}' has dependencies and cannot be deleted.\nDesconecte antes: aws ec2 detach-internet-gateway --internet-gateway-id ${igw} --vpc-id ${g.vpc}`);
      delete conta.vpc.igws[igw];
      return okSilencioso(`Internet gateway ${igw} apagado.`);
    },
  };
  if (typeof globalThis !== "undefined") globalThis.filtrarEc2 = filtrarEc2;

  // ---------- RDS ----------
  const ENGINES = ["mysql", "postgres", "mariadb", "aurora-mysql", "aurora-postgresql", "sqlserver-ex", "oracle-se2"];
  function rdsJson(d) {
    return {
      DBInstanceIdentifier: d.id, DBInstanceClass: d.classe, Engine: d.engine,
      DBInstanceStatus: d.status, MasterUsername: d.usuario, AllocatedStorage: d.storage,
      Endpoint: { Address: `${d.id}.${hexAleatorio(8)}.${d.regiao}.rds.amazonaws.com`, Port: d.porta },
    };
  }
  function exigirDb(conta, flags, operacao) {
    estado(conta);
    const id = exigirFlag(flags, "db-instance-identifier");
    const d = conta.rds.instancias[id];
    if (!d) throw new ErroCli(`An error occurred (DBInstanceNotFound) when calling the ${operacao} operation: DBInstance ${id} not found.`);
    return d;
  }
  const cmdRds = {
    "create-db-instance": (conta, pos, flags) => {
      estado(conta);
      const id = exigirFlag(flags, "db-instance-identifier");
      if (conta.rds.instancias[id]) throw new ErroCli(`An error occurred (DBInstanceAlreadyExists) when calling the CreateDBInstance operation: DB instance already exists`);
      const classe = exigirFlag(flags, "db-instance-class");
      const engine = exigirFlag(flags, "engine");
      if (!ENGINES.includes(engine)) throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the CreateDBInstance operation: Invalid DB engine: ${engine}.\nEngines aceitos no simulador: ${ENGINES.join(", ")}`);
      const usuario = exigirFlag(flags, "master-username");
      const storage = parseInt(flags["allocated-storage"] || "20", 10);
      const porta = engine.includes("postgres") ? 5432 : engine.includes("sqlserver") ? 1433 : engine.includes("oracle") ? 1521 : 3306;
      conta.rds.instancias[id] = { id, classe, engine, usuario, storage, porta, status: "available", regiao: conta.regiao || "us-east-1", criadaEm: agoraIso() };
      const j = rdsJson(conta.rds.instancias[id]); j.DBInstanceStatus = "creating";
      return js({ DBInstance: j });
    },
    "describe-db-instances": (conta) => {
      estado(conta);
      return js({ DBInstances: Object.values(conta.rds.instancias).map(rdsJson) });
    },
    "start-db-instance": (conta, pos, flags) => {
      const d = exigirDb(conta, flags, "StartDBInstance"); d.status = "available";
      return js({ DBInstance: rdsJson(d) });
    },
    "stop-db-instance": (conta, pos, flags) => {
      const d = exigirDb(conta, flags, "StopDBInstance"); d.status = "stopped";
      return js({ DBInstance: rdsJson(d) });
    },
    "delete-db-instance": (conta, pos, flags) => {
      const d = exigirDb(conta, flags, "DeleteDBInstance");
      d.status = "deleting";
      const j = rdsJson(d);
      delete conta.rds.instancias[d.id];
      return js({ DBInstance: j });
    },
  };

  // ---------- CloudWatch (alarmes) ----------
  const cmdCw = {
    "put-metric-alarm": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "alarm-name");
      const metrica = exigirFlag(flags, "metric-name");
      conta.cloudwatch.alarmes[nome] = {
        nome, metrica, namespace: flags.namespace || "AWS/EC2",
        threshold: flags.threshold, comparador: flags["comparison-operator"] || "GreaterThanThreshold",
        estado: "OK", criadoEm: agoraIso(),
      };
      return okSilencioso(`Alarme "${nome}" criado/atualizado.`);
    },
    "describe-alarms": (conta, pos, flags) => {
      estado(conta);
      flags = flags || {};
      // Filtros da AWS: --alarm-names (lista), --alarm-name-prefix e --state-value
      let alarmes = Object.values(conta.cloudwatch.alarmes);
      if (flags["alarm-names"] !== undefined) {
        // alarm-names é flag de VÁRIOS valores no parser: já chega como lista
        const nomes = [].concat(flags["alarm-names"]).concat(pos || []).map(String);
        alarmes = alarmes.filter((a) => nomes.indexOf(a.nome) >= 0);
      }
      if (flags["alarm-name-prefix"] !== undefined) alarmes = alarmes.filter((a) => a.nome.indexOf(String(flags["alarm-name-prefix"])) === 0);
      if (flags["state-value"] !== undefined) {
        const estadoPedido = String(flags["state-value"]);
        if (["OK", "ALARM", "INSUFFICIENT_DATA"].indexOf(estadoPedido) < 0) {
          throw new ErroCli("An error occurred (ValidationError) when calling the DescribeAlarms operation: --state-value precisa ser OK, ALARM ou INSUFFICIENT_DATA.");
        }
        alarmes = alarmes.filter((a) => a.estado === estadoPedido);
      }
      return js({
        MetricAlarms: alarmes.map((a) => ({
          AlarmName: a.nome, MetricName: a.metrica, Namespace: a.namespace,
          Threshold: a.threshold !== undefined ? Number(a.threshold) : null,
          ComparisonOperator: a.comparador, StateValue: a.estado,
        })),
      });
    },
    "delete-alarms": (conta, pos, flags) => {
      estado(conta);
      // A lista vem espalhada: o 1º nome na flag, os outros como posicionais.
      const nomes = [].concat(flags["alarm-names"] || []).concat(flags["alarm-names"] !== undefined ? (pos || []) : []).map(String);
      for (const n of nomes) delete conta.cloudwatch.alarmes[n];
      return okSilencioso("Alarme(s) removido(s).");
    },
    "list-metrics": (conta) => {
      return js({ Metrics: [
        { Namespace: "AWS/EC2", MetricName: "CPUUtilization" },
        { Namespace: "AWS/S3", MetricName: "BucketSizeBytes" },
        { Namespace: "AWS/Lambda", MetricName: "Invocations" },
      ] });
    },
  };

  // ---------- CloudWatch Logs (aws logs) ----------
  const cmdLogs = {
    "create-log-group": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "log-group-name");
      if (conta.logs.grupos[nome]) throw new ErroCli(`An error occurred (ResourceAlreadyExistsException) when calling the CreateLogGroup operation: The specified log group already exists`);
      conta.logs.grupos[nome] = { nome, criadoEm: agoraIso() };
      return okSilencioso(`Grupo de logs "${nome}" criado.`);
    },
    "describe-log-groups": (conta, pos, flags) => {
      estado(conta);
      const prefixo = flags && flags["log-group-name-prefix"] !== undefined ? String(flags["log-group-name-prefix"]) : "";
      return js({ logGroups: Object.values(conta.logs.grupos).filter((g) => g.nome.indexOf(prefixo) === 0).map((g) => ({ logGroupName: g.nome, arn: `arn:aws:logs:${conta.regiao || "us-east-1"}:${conta.contaId}:log-group:${g.nome}:*`, storedBytes: 0 })) });
    },
    "delete-log-group": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "log-group-name");
      if (!conta.logs.grupos[nome]) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the DeleteLogGroup operation: The specified log group does not exist`);
      delete conta.logs.grupos[nome];
      return okSilencioso(`Grupo de logs "${nome}" apagado.`);
    },
  };

  // ---------- Registro no motor ----------
  if (typeof SERVICOS !== "undefined") {
    Object.assign(SERVICOS.ec2, cmdVpc); // VPC vive dentro do aws ec2
    SERVICOS.rds = cmdRds;
    SERVICOS.cloudwatch = cmdCw;
    SERVICOS.logs = cmdLogs;
  }

  // ---------- Trilhas de desafios ----------
  const DESAFIOS_FASE1 = [
    // ===== VPC =====
    { id: "vpc-1", servico: "vpc", nivel: 1, xp: 60, titulo: "Crie sua rede (VPC)",
      descricao: "A <b>VPC</b> é a sua rede privada na AWS. Crie uma com o bloco <b>10.0.0.0/16</b>. <small>(comandos de VPC ficam dentro do <code>aws ec2</code>)</small>",
      dicas: ["Criar recurso no AWS CLI é sempre `create-…` — veja a lista de comandos com: aws ec2 help", "A forma do comando é: aws ec2 create-vpc --cidr-block <faixa de ips>"], solucao: ["aws ec2 create-vpc --cidr-block 10.0.0.0/16"],
      validar: (conta) => !!(conta.vpc && Object.values(conta.vpc.vpcs).some((v) => v.cidr === "10.0.0.0/16")) },
    { id: "vpc-2", servico: "vpc", nivel: 2, xp: 70, titulo: "Crie uma sub-rede",
      descricao: "Divida a VPC <b>10.0.0.0/16</b> em uma <b>subnet</b> <b>10.0.1.0/24</b>. Você precisa do <b>--vpc-id</b> dela (pegue no describe-vpcs). <small>(a sub-rede tem que caber dentro da faixa da VPC — noutra VPC, a AWS recusa)</small>",
      dicas: ["Pegue o id: aws ec2 describe-vpcs", "aws ec2 create-subnet --vpc-id <id> --cidr-block <faixa de ips>"],
      solucao: ["aws ec2 create-subnet --vpc-id <vpc-de:10.0.0.0/16> --cidr-block 10.0.1.0/24"],
      validar: (conta) => !!(conta.vpc && Object.values(conta.vpc.subnets).some((s) => s.cidr === "10.0.1.0/24")) },
    { id: "vpc-3", servico: "vpc", nivel: 2, xp: 60, titulo: "Porta pra internet",
      descricao: "Crie um <b>internet gateway</b> (a saída da VPC pra internet).",
      dicas: ["Criar recurso no AWS CLI é sempre `create-…` — veja a lista de comandos com: aws ec2 help"], solucao: ["aws ec2 create-internet-gateway"],
      validar: (conta) => !!(conta.vpc && Object.keys(conta.vpc.igws).length > 0) },
    { id: "vpc-4", servico: "vpc", nivel: 3, xp: 80, titulo: "Conecte o gateway",
      descricao: "Conecte o internet gateway à sua VPC (<b>attach</b>).",
      dicas: ["`attach-…` conecta um recurso a outro — veja a lista de comandos com: aws ec2 help", "A forma do comando é: aws ec2 attach-internet-gateway --internet-gateway-id <id> --vpc-id <id>"],
      solucao: ["aws ec2 attach-internet-gateway --internet-gateway-id <igw-id> --vpc-id <vpc-id>"],
      validar: (conta) => !!(conta.vpc && Object.values(conta.vpc.igws).some((g) => g.vpc)) },

    // ===== RDS =====
    { id: "rds-1", servico: "rds", nivel: 1, xp: 70, titulo: "Seu primeiro banco (RDS)",
      descricao: "Suba um banco <b>MySQL</b> chamado <b>meu-banco</b>, classe <b>db.t3.micro</b>, usuário mestre <b>admin</b>.",
      dicas: ["Precisa de --db-instance-identifier, --db-instance-class, --engine e --master-username.", "aws rds create-db-instance --db-instance-identifier <identificador> --db-instance-class <valor> --engine <tipo> --master-username <valor> --allocated-storage <valor>"],
      solucao: ["aws rds create-db-instance --db-instance-identifier meu-banco --db-instance-class db.t3.micro --engine mysql --master-username admin --allocated-storage 20"],
      validar: (conta) => !!(conta.rds && conta.rds.instancias["meu-banco"]) },
    { id: "rds-2", servico: "rds", nivel: 1, xp: 50, titulo: "Liste seus bancos",
      descricao: "Veja as instâncias de banco da conta.",
      dicas: ["`describe-…` é o que mostra os detalhes/estado de um recurso — veja a lista de comandos com: aws rds help"], solucao: ["aws rds describe-db-instances"],
      validar: (conta, cmd, ok) => ok && ehCmd(cmd, "rds", "describe-db-instances") },
    { id: "rds-3", servico: "rds", nivel: 2, xp: 60, titulo: "Pare o banco",
      descricao: "Banco parado não cobra computação. <b>Pare</b> o <b>meu-banco</b>.",
      dicas: ["`stop-…` pausa sem apagar — veja a lista de comandos com: aws rds help", "A forma do comando é: aws rds stop-db-instance --db-instance-identifier <identificador>"],
      solucao: ["aws rds stop-db-instance --db-instance-identifier meu-banco"],
      validar: (conta) => !!(conta.rds && conta.rds.instancias["meu-banco"] && conta.rds.instancias["meu-banco"].status === "stopped") },
    { id: "rds-4", servico: "rds", nivel: 3, xp: 70, titulo: "Apague o banco",
      descricao: "Remova o <b>meu-banco</b> (em produção você guardaria um snapshot antes!).",
      dicas: ["Apagar é sempre `delete-…` — veja a lista de comandos com: aws rds help", "A forma do comando é: aws rds delete-db-instance --db-instance-identifier <identificador> --skip-final-snapshot"],
      solucao: ["aws rds delete-db-instance --db-instance-identifier meu-banco --skip-final-snapshot"],
      validar: (conta, cmd, ok) => ok && ehCmd(cmd, "rds", "delete-db-instance") && !(conta.rds && conta.rds.instancias["meu-banco"]) },

    // ===== CloudWatch =====
    { id: "cw-1", servico: "cloudwatch", nivel: 1, xp: 50, titulo: "Crie um grupo de logs",
      descricao: "No <b>CloudWatch Logs</b>, crie um grupo chamado <b>/climb/app</b> (onde os logs vão parar).",
      dicas: ["Criar recurso no AWS CLI é sempre `create-…` — veja a lista de comandos com: aws logs help", "A forma do comando é: aws logs create-log-group --log-group-name <nome>"],
      solucao: ["aws logs create-log-group --log-group-name /climb/app"],
      validar: (conta) => !!(conta.logs && conta.logs.grupos["/climb/app"]) },
    { id: "cw-2", servico: "cloudwatch", nivel: 2, xp: 80, titulo: "Alarme de CPU",
      descricao: "Crie um <b>alarme</b> chamado <b>cpu-alta</b> na métrica <b>CPUUtilization</b> com limite (<b>--threshold</b>) <b>80</b>.",
      dicas: ["`put-…` grava/substitui uma configuração (é o \"salvar\" do CLI) — veja a lista de comandos com: aws cloudwatch help", "A forma do comando é: aws cloudwatch put-metric-alarm --alarm-name <nome> --metric-name <nome> --namespace <valor> --threshold <número> --comparison-operator <valor>"],
      solucao: ["aws cloudwatch put-metric-alarm --alarm-name cpu-alta --metric-name CPUUtilization --namespace AWS/EC2 --threshold 80 --comparison-operator GreaterThanThreshold"],
      validar: (conta) => !!(conta.cloudwatch && conta.cloudwatch.alarmes["cpu-alta"]) },
    { id: "cw-3", servico: "cloudwatch", nivel: 2, xp: 50, titulo: "Veja seus alarmes",
      descricao: "Liste os alarmes configurados.",
      dicas: ["`describe-…` é o que mostra os detalhes/estado de um recurso — veja a lista de comandos com: aws cloudwatch help"], solucao: ["aws cloudwatch describe-alarms"],
      validar: (conta, cmd, ok) => ok && ehCmd(cmd, "cloudwatch", "describe-alarms") },
  ];

  if (typeof SERVICOS_META !== "undefined") {
    const iProj = SERVICOS_META.findIndex((s) => s.id === "projetos");
    const metas = [
      { id: "vpc", nome: "VPC", subtitulo: "Rede na nuvem", icone: "🛜" },
      { id: "rds", nome: "RDS", subtitulo: "Banco relacional", icone: "🛢️" },
      { id: "cloudwatch", nome: "CloudWatch", subtitulo: "Monitoramento e logs", icone: "📈" },
    ];
    if (!SERVICOS_META.some((s) => s.id === "vpc")) {
      for (const m of metas) { if (iProj >= 0) SERVICOS_META.splice(SERVICOS_META.findIndex((s) => s.id === "projetos"), 0, m); else SERVICOS_META.push(m); }
      for (const d of DESAFIOS_FASE1) DESAFIOS.push(d);
    }
  }
})();
