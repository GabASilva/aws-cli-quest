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
    "describe-vpcs": (conta) => {
      estado(conta);
      return js({ Vpcs: Object.values(conta.vpc.vpcs).map((v) => ({ VpcId: v.id, CidrBlock: v.cidr, State: "available", IsDefault: false })) });
    },
    "delete-vpc": (conta, pos, flags) => {
      estado(conta);
      const id = exigirFlag(flags, "vpc-id");
      if (!conta.vpc.vpcs[id]) throw new ErroCli(`An error occurred (InvalidVpcID.NotFound) when calling the DeleteVpc operation: The vpc ID '${id}' does not exist`);
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
      const id = "subnet-0" + hexAleatorio(16);
      conta.vpc.subnets[id] = { id, vpc: vpcId, cidr, az: (conta.regiao || "us-east-1") + "a" };
      return js({ Subnet: { SubnetId: id, VpcId: vpcId, CidrBlock: cidr, AvailabilityZone: conta.vpc.subnets[id].az, State: "available" } });
    },
    "describe-subnets": (conta) => {
      estado(conta);
      return js({ Subnets: Object.values(conta.vpc.subnets).map((s) => ({ SubnetId: s.id, VpcId: s.vpc, CidrBlock: s.cidr, AvailabilityZone: s.az, State: "available" })) });
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
  };

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
    "describe-alarms": (conta) => {
      estado(conta);
      return js({
        MetricAlarms: Object.values(conta.cloudwatch.alarmes).map((a) => ({
          AlarmName: a.nome, MetricName: a.metrica, Namespace: a.namespace,
          Threshold: a.threshold !== undefined ? Number(a.threshold) : null,
          ComparisonOperator: a.comparador, StateValue: a.estado,
        })),
      });
    },
    "delete-alarms": (conta, pos, flags) => {
      estado(conta);
      const nomes = [].concat(flags["alarm-names"] || []);
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
    "describe-log-groups": (conta) => {
      estado(conta);
      return js({ logGroups: Object.values(conta.logs.grupos).map((g) => ({ logGroupName: g.nome, arn: `arn:aws:logs:${conta.regiao || "us-east-1"}:${conta.contaId}:log-group:${g.nome}:*`, storedBytes: 0 })) });
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
      dicas: ["aws ec2 create-vpc --cidr-block 10.0.0.0/16"], solucao: ["aws ec2 create-vpc --cidr-block 10.0.0.0/16"],
      validar: (conta) => !!(conta.vpc && Object.values(conta.vpc.vpcs).some((v) => v.cidr === "10.0.0.0/16")) },
    { id: "vpc-2", servico: "vpc", nivel: 2, xp: 70, titulo: "Crie uma sub-rede",
      descricao: "Divida a VPC em uma <b>subnet</b> <b>10.0.1.0/24</b>. Você precisa do <b>--vpc-id</b> (pegue no describe-vpcs).",
      dicas: ["Pegue o id: aws ec2 describe-vpcs", "aws ec2 create-subnet --vpc-id <vpc-id> --cidr-block 10.0.1.0/24"],
      solucao: ["aws ec2 create-subnet --vpc-id <vpc-id> --cidr-block 10.0.1.0/24"],
      validar: (conta) => !!(conta.vpc && Object.keys(conta.vpc.subnets).length > 0) },
    { id: "vpc-3", servico: "vpc", nivel: 2, xp: 60, titulo: "Porta pra internet",
      descricao: "Crie um <b>internet gateway</b> (a saída da VPC pra internet).",
      dicas: ["aws ec2 create-internet-gateway"], solucao: ["aws ec2 create-internet-gateway"],
      validar: (conta) => !!(conta.vpc && Object.keys(conta.vpc.igws).length > 0) },
    { id: "vpc-4", servico: "vpc", nivel: 3, xp: 80, titulo: "Conecte o gateway",
      descricao: "Conecte o internet gateway à sua VPC (<b>attach</b>).",
      dicas: ["aws ec2 attach-internet-gateway --internet-gateway-id <igw-id> --vpc-id <vpc-id>"],
      solucao: ["aws ec2 attach-internet-gateway --internet-gateway-id <igw-id> --vpc-id <vpc-id>"],
      validar: (conta) => !!(conta.vpc && Object.values(conta.vpc.igws).some((g) => g.vpc)) },

    // ===== RDS =====
    { id: "rds-1", servico: "rds", nivel: 1, xp: 70, titulo: "Seu primeiro banco (RDS)",
      descricao: "Suba um banco <b>MySQL</b> chamado <b>meu-banco</b>, classe <b>db.t3.micro</b>, usuário mestre <b>admin</b>.",
      dicas: ["Precisa de --db-instance-identifier, --db-instance-class, --engine e --master-username.", "aws rds create-db-instance --db-instance-identifier meu-banco --db-instance-class db.t3.micro --engine mysql --master-username admin --allocated-storage 20"],
      solucao: ["aws rds create-db-instance --db-instance-identifier meu-banco --db-instance-class db.t3.micro --engine mysql --master-username admin --allocated-storage 20"],
      validar: (conta) => !!(conta.rds && conta.rds.instancias["meu-banco"]) },
    { id: "rds-2", servico: "rds", nivel: 1, xp: 50, titulo: "Liste seus bancos",
      descricao: "Veja as instâncias de banco da conta.",
      dicas: ["aws rds describe-db-instances"], solucao: ["aws rds describe-db-instances"],
      validar: (conta, cmd, ok) => ok && ehCmd(cmd, "rds", "describe-db-instances") },
    { id: "rds-3", servico: "rds", nivel: 2, xp: 60, titulo: "Pare o banco",
      descricao: "Banco parado não cobra computação. <b>Pare</b> o <b>meu-banco</b>.",
      dicas: ["aws rds stop-db-instance --db-instance-identifier meu-banco"],
      solucao: ["aws rds stop-db-instance --db-instance-identifier meu-banco"],
      validar: (conta) => !!(conta.rds && conta.rds.instancias["meu-banco"] && conta.rds.instancias["meu-banco"].status === "stopped") },
    { id: "rds-4", servico: "rds", nivel: 3, xp: 70, titulo: "Apague o banco",
      descricao: "Remova o <b>meu-banco</b> (em produção você guardaria um snapshot antes!).",
      dicas: ["aws rds delete-db-instance --db-instance-identifier meu-banco --skip-final-snapshot"],
      solucao: ["aws rds delete-db-instance --db-instance-identifier meu-banco --skip-final-snapshot"],
      validar: (conta, cmd, ok) => ok && ehCmd(cmd, "rds", "delete-db-instance") && !(conta.rds && conta.rds.instancias["meu-banco"]) },

    // ===== CloudWatch =====
    { id: "cw-1", servico: "cloudwatch", nivel: 1, xp: 50, titulo: "Crie um grupo de logs",
      descricao: "No <b>CloudWatch Logs</b>, crie um grupo chamado <b>/climb/app</b> (onde os logs vão parar).",
      dicas: ["aws logs create-log-group --log-group-name /climb/app"],
      solucao: ["aws logs create-log-group --log-group-name /climb/app"],
      validar: (conta) => !!(conta.logs && conta.logs.grupos["/climb/app"]) },
    { id: "cw-2", servico: "cloudwatch", nivel: 2, xp: 80, titulo: "Alarme de CPU",
      descricao: "Crie um <b>alarme</b> chamado <b>cpu-alta</b> na métrica <b>CPUUtilization</b> com limite (<b>--threshold</b>) <b>80</b>.",
      dicas: ["aws cloudwatch put-metric-alarm --alarm-name cpu-alta --metric-name CPUUtilization --namespace AWS/EC2 --threshold 80 --comparison-operator GreaterThanThreshold"],
      solucao: ["aws cloudwatch put-metric-alarm --alarm-name cpu-alta --metric-name CPUUtilization --namespace AWS/EC2 --threshold 80 --comparison-operator GreaterThanThreshold"],
      validar: (conta) => !!(conta.cloudwatch && conta.cloudwatch.alarmes["cpu-alta"]) },
    { id: "cw-3", servico: "cloudwatch", nivel: 2, xp: 50, titulo: "Veja seus alarmes",
      descricao: "Liste os alarmes configurados.",
      dicas: ["aws cloudwatch describe-alarms"], solucao: ["aws cloudwatch describe-alarms"],
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
