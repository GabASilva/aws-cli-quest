"use strict";
// ============================================================
// CLImb — servicos-fase6.js
// Fase 6 — Núcleo de arquitetura: ELB (load balancer), Elastic Beanstalk,
// EFS (file system compartilhado), ElastiCache (cache) e ACM (certificados).
//
// Estes 5 fecham o desenho de uma aplicação web real: o LOAD BALANCER na
// frente distribuindo pras instâncias do Auto Scaling, o EFS como disco
// compartilhado, o ElastiCache acelerando as leituras e o ACM dando o HTTPS.
//
// INTEGRAÇÃO REAL: o target group do ELB registra instâncias de verdade
// (as mesmas do EC2/Auto Scaling), e o EFS/mount target pede uma subnet
// existente da VPC. Mesmo padrão das fases anteriores.
// ============================================================
(function () {
  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";

  function estado(conta) {
    conta.elb = conta.elb || { lbs: {}, tgs: {}, listeners: {} };
    conta.eb = conta.eb || { apps: {}, envs: {} };
    conta.efs = conta.efs || { sistemas: {}, alvos: {} };
    conta.elasticache = conta.elasticache || { clusters: {} };
    conta.acm = conta.acm || { certificados: {} };
    return conta;
  }

  // ============================================================
  // ELB — Elastic Load Balancing (aws elbv2)
  // ============================================================
  function acharLb(conta, flags, operacao) {
    estado(conta);
    const arn = exigirFlag(flags, "load-balancer-arn");
    const nome = String(arn).split("/").slice(-2, -1)[0] || String(arn).split("loadbalancer/app/")[1];
    const lb = conta.elb.lbs[nome] || Object.values(conta.elb.lbs).find((l) => l.arn === arn);
    if (!lb) throw new ErroCli(`An error occurred (LoadBalancerNotFound) when calling the ${operacao} operation: Load balancers '[${arn}]' not found\nDica: veja os ARNs com 'aws elbv2 describe-load-balancers'.`);
    return lb;
  }
  function acharTg(conta, flags, operacao) {
    estado(conta);
    const arn = exigirFlag(flags, "target-group-arn");
    const tg = Object.values(conta.elb.tgs).find((t) => t.arn === arn) || conta.elb.tgs[String(arn).split("/").slice(-2, -1)[0]];
    if (!tg) throw new ErroCli(`An error occurred (TargetGroupNotFound) when calling the ${operacao} operation: Target groups '[${arn}]' not found`);
    return tg;
  }
  const cmdElb = {
    "create-load-balancer": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "name");
      const subnets = [].concat(exigirFlag(flags, "subnets")).map(String);
      if (subnets.length < 2) throw new ErroCli(`An error occurred (ValidationError) when calling the CreateLoadBalancer operation: At least two subnets in two different Availability Zones must be specified\nUm load balancer precisa de 2+ sub-redes (pra ficar espalhado em zonas).`);
      if (conta.elb.lbs[nome]) throw new ErroCli(`An error occurred (DuplicateLoadBalancerName) when calling the CreateLoadBalancer operation: A load balancer with the same name '${nome}' exists`);
      const tipo = flags.type ? String(flags.type) : "application";
      const dns = `${nome}-${hexAleatorio(8)}.${REGIAO(conta)}.elb.amazonaws.com`;
      const arn = `arn:aws:elasticloadbalancing:${REGIAO(conta)}:${CONTA_ID(conta)}:loadbalancer/app/${nome}/${hexAleatorio(16)}`;
      conta.elb.lbs[nome] = { nome, arn, dns, tipo, subnets, criadoEm: agoraIso() };
      avisarClimb("O load balancer distribui o tráfego entre várias instâncias — se uma cai, ele para de mandar pra ela sozinho. O próximo passo é criar um target group e registrar as máquinas.");
      return js({ LoadBalancers: [{ LoadBalancerArn: arn, DNSName: dns, LoadBalancerName: nome, Type: tipo, State: { Code: "provisioning" }, Scheme: "internet-facing", AvailabilityZones: subnets.map((s) => ({ SubnetId: s })) }] });
    },
    "describe-load-balancers": (conta) => {
      estado(conta);
      const l = Object.values(conta.elb.lbs);
      if (!l.length) { avisarClimb("Nenhum load balancer ainda. Crie um com: aws elbv2 create-load-balancer --name loja-alb --subnets subnet-a subnet-b"); return js({ LoadBalancers: [] }); }
      return js({ LoadBalancers: l.map((lb) => ({ LoadBalancerArn: lb.arn, DNSName: lb.dns, LoadBalancerName: lb.nome, Type: lb.tipo, State: { Code: "active" }, Scheme: "internet-facing" })) });
    },
    "create-target-group": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "name");
      exigirFlag(flags, "protocol");
      exigirFlag(flags, "port");
      exigirFlag(flags, "vpc-id");
      if (conta.elb.tgs[nome]) throw new ErroCli(`An error occurred (DuplicateTargetGroupName) when calling the CreateTargetGroup operation: A target group with the same name '${nome}' exists`);
      const arn = `arn:aws:elasticloadbalancing:${REGIAO(conta)}:${CONTA_ID(conta)}:targetgroup/${nome}/${hexAleatorio(16)}`;
      conta.elb.tgs[nome] = { nome, arn, protocolo: String(flags.protocol), porta: parseInt(flags.port, 10), vpc: String(flags["vpc-id"]), alvos: [], criadoEm: agoraIso() };
      avisarClimb("O target group é o \"grupo de destino\": você registra as instâncias nele, e o load balancer manda o tráfego pra esse grupo. Registre as máquinas com 'aws elbv2 register-targets'.");
      return js({ TargetGroups: [{ TargetGroupArn: arn, TargetGroupName: nome, Protocol: String(flags.protocol), Port: parseInt(flags.port, 10), VpcId: String(flags["vpc-id"]), TargetType: "instance" }] });
    },
    "describe-target-groups": (conta) => {
      estado(conta);
      return js({ TargetGroups: Object.values(conta.elb.tgs).map((t) => ({ TargetGroupArn: t.arn, TargetGroupName: t.nome, Protocol: t.protocolo, Port: t.porta, VpcId: t.vpc, TargetType: "instance" })) });
    },
    "register-targets": (conta, pos, flags) => {
      const tg = acharTg(conta, flags, "RegisterTargets");
      const alvos = String(exigirFlag(flags, "targets"));
      const ids = (alvos.match(/Id=(i-[\w]+)/g) || []).map((m) => m.slice(3));
      if (!ids.length) throw new ErroCli(`An error occurred (InvalidTarget) when calling the RegisterTargets operation: Formato: --targets Id=i-xxxxxxxx Id=i-yyyyyyyy`);
      for (const id of ids) {
        if (!conta.ec2.instancias[id]) throw new ErroCli(`An error occurred (InvalidTarget) when calling the RegisterTargets operation: The following targets are not registered: '${id}' — instância não existe.`);
        if (!tg.alvos.includes(id)) tg.alvos.push(id);
      }
      avisarClimb(`${ids.length} instância(s) registrada(s). O load balancer agora faz health check nelas e só manda tráfego pras saudáveis.`);
      return okSilencioso("Alvos registrados.");
    },
    "describe-target-health": (conta, pos, flags) => {
      const tg = acharTg(conta, flags, "DescribeTargetHealth");
      return js({ TargetHealthDescriptions: (tg.alvos || []).map((id) => ({ Target: { Id: id, Port: tg.porta }, TargetHealth: { State: conta.ec2.instancias[id] && conta.ec2.instancias[id].estado === "running" ? "healthy" : "unhealthy" } })) });
    },
    "create-listener": (conta, pos, flags) => {
      const lb = acharLb(conta, flags, "CreateListener");
      const porta = parseInt(exigirFlag(flags, "port"), 10);
      exigirFlag(flags, "protocol");
      exigirFlag(flags, "default-actions");
      const id = `arn:aws:elasticloadbalancing:${REGIAO(conta)}:${CONTA_ID(conta)}:listener/app/${lb.nome}/${hexAleatorio(16)}`;
      conta.elb.listeners[id] = { arn: id, lb: lb.nome, porta, protocolo: String(flags.protocol) };
      avisarClimb("O listener é quem escuta numa porta (80/443) e encaminha pro target group. Com ele, o load balancer finalmente responde requisições.");
      return js({ Listeners: [{ ListenerArn: id, LoadBalancerArn: lb.arn, Port: porta, Protocol: String(flags.protocol) }] });
    },
    "delete-load-balancer": (conta, pos, flags) => {
      const lb = acharLb(conta, flags, "DeleteLoadBalancer");
      for (const [id, l] of Object.entries(conta.elb.listeners)) if (l.lb === lb.nome) delete conta.elb.listeners[id];
      delete conta.elb.lbs[lb.nome];
      return okSilencioso(`Load balancer "${lb.nome}" apagado.`);
    },
    "delete-target-group": (conta, pos, flags) => {
      const tg = acharTg(conta, flags, "DeleteTargetGroup");
      delete conta.elb.tgs[tg.nome];
      return okSilencioso(`Target group "${tg.nome}" apagado.`);
    },
  };

  // ============================================================
  // Elastic Beanstalk
  // ============================================================
  const cmdEb = {
    "create-application": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "application-name");
      if (conta.eb.apps[nome]) throw new ErroCli(`An error occurred (TooManyApplicationsException / InvalidParameterValue) when calling the CreateApplication operation: Application ${nome} already exists.`);
      conta.eb.apps[nome] = { nome, descricao: flags.description || "", criadoEm: agoraIso() };
      avisarClimb("O Beanstalk é o \"deploy fácil\": você sobe o código e ele monta EC2, load balancer e Auto Scaling por baixo, sem você configurar cada peça. Agora crie um ENVIRONMENT pra rodar a app.");
      return js({ Application: { ApplicationName: nome, Description: flags.description || undefined, DateCreated: agoraIso() } });
    },
    "describe-applications": (conta) => {
      estado(conta);
      const l = Object.values(conta.eb.apps);
      if (!l.length) { avisarClimb("Nenhuma aplicação ainda. Crie uma com: aws elasticbeanstalk create-application --application-name loja-app"); return js({ Applications: [] }); }
      return js({ Applications: l.map((a) => ({ ApplicationName: a.nome, Description: a.descricao, DateCreated: a.criadoEm })) });
    },
    "create-environment": (conta, pos, flags) => {
      estado(conta);
      const app = exigirFlag(flags, "application-name");
      const env = exigirFlag(flags, "environment-name");
      exigirFlag(flags, "solution-stack-name");
      if (!conta.eb.apps[app]) throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the CreateEnvironment operation: No Application named '${app}' found.\nCrie antes: aws elasticbeanstalk create-application --application-name ${app}`);
      if (conta.eb.envs[env]) throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the CreateEnvironment operation: Environment ${env} already exists.`);
      const cname = `${env}.${hexAleatorio(8)}.${REGIAO(conta)}.elasticbeanstalk.com`;
      conta.eb.envs[env] = { nome: env, app, stack: String(flags["solution-stack-name"]), cname, status: "Ready", saude: "Green", criadoEm: agoraIso() };
      avisarClimb(`Ambiente subindo. Em minutos ele fica Green e a app responde em http://${cname} — com EC2, load balancer e Auto Scaling criados automaticamente por baixo.`);
      return js({ EnvironmentName: env, ApplicationName: app, CNAME: cname, Status: "Launching", Health: "Grey" });
    },
    "describe-environments": (conta) => {
      estado(conta);
      return js({ Environments: Object.values(conta.eb.envs).map((e) => ({ EnvironmentName: e.nome, ApplicationName: e.app, CNAME: e.cname, Status: e.status, Health: e.saude, SolutionStackName: e.stack })) });
    },
    "terminate-environment": (conta, pos, flags) => {
      estado(conta);
      const env = exigirFlag(flags, "environment-name");
      if (!conta.eb.envs[env]) throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the TerminateEnvironment operation: No Environment found for EnvironmentName = '${env}'.`);
      delete conta.eb.envs[env];
      avisarClimb("Encerrar o ambiente apaga TUDO que o Beanstalk criou (EC2, load balancer, Auto Scaling) — é a vantagem do deploy gerenciado: some junto.");
      return js({ EnvironmentName: env, Status: "Terminating" });
    },
    "delete-application": (conta, pos, flags) => {
      estado(conta);
      const nome = exigirFlag(flags, "application-name");
      if (!conta.eb.apps[nome]) throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the DeleteApplication operation: No Application named '${nome}' found.`);
      if (Object.values(conta.eb.envs).some((e) => e.app === nome)) throw new ErroCli(`An error occurred (OperationInProgressException) when calling the DeleteApplication operation: The application still has environments. Encerre os ambientes antes.`);
      delete conta.eb.apps[nome];
      return okSilencioso(`Aplicação "${nome}" apagada.`);
    },
  };

  // ============================================================
  // EFS — Elastic File System
  // ============================================================
  const cmdEfs = {
    "create-file-system": (conta, pos, flags) => {
      estado(conta);
      const token = exigirFlag(flags, "creation-token");
      const id = "fs-0" + hexAleatorio(15);
      conta.efs.sistemas[id] = { id, token, modo: flags["performance-mode"] || "generalPurpose", criadoEm: agoraIso() };
      avisarClimb("Diferente do EBS (um disco pra UMA máquina), o EFS é um disco que VÁRIAS máquinas montam ao mesmo tempo — ótimo pra arquivos compartilhados. Crie um mount target numa sub-rede pra as instâncias alcançarem.");
      return js({ FileSystemId: id, CreationToken: token, PerformanceMode: conta.efs.sistemas[id].modo, LifeCycleState: "creating", NumberOfMountTargets: 0 });
    },
    "describe-file-systems": (conta) => {
      estado(conta);
      const l = Object.values(conta.efs.sistemas);
      if (!l.length) { avisarClimb("Nenhum file system ainda. Crie um com: aws efs create-file-system --creation-token dados-efs"); return js({ FileSystems: [] }); }
      return js({ FileSystems: l.map((f) => ({ FileSystemId: f.id, CreationToken: f.token, PerformanceMode: f.modo, LifeCycleState: "available", NumberOfMountTargets: Object.values(conta.efs.alvos).filter((a) => a.fs === f.id).length })) });
    },
    "create-mount-target": (conta, pos, flags) => {
      estado(conta);
      const fs = exigirFlag(flags, "file-system-id");
      const subnet = exigirFlag(flags, "subnet-id");
      if (!conta.efs.sistemas[fs]) throw new ErroCli(`An error occurred (FileSystemNotFound) when calling the CreateMountTarget operation: File system '${fs}' does not exist.`);
      if (!/^subnet-/.test(String(subnet))) throw new ErroCli(`An error occurred (InvalidSubnetID.Malformed) when calling the CreateMountTarget operation: subnet-id inválido: '${subnet}' (esperado algo como subnet-xxxxxxxx).`);
      const id = "fsmt-0" + hexAleatorio(15);
      conta.efs.alvos[id] = { id, fs, subnet, criadoEm: agoraIso() };
      avisarClimb("Agora as instâncias dessa sub-rede conseguem montar o EFS (com mount / o comando do fstab). É o \"ponto de conexão\" do disco compartilhado na rede.");
      return js({ MountTargetId: id, FileSystemId: fs, SubnetId: subnet, LifeCycleState: "creating" });
    },
    "describe-mount-targets": (conta, pos, flags) => {
      estado(conta);
      const fs = exigirFlag(flags, "file-system-id");
      return js({ MountTargets: Object.values(conta.efs.alvos).filter((a) => a.fs === fs).map((a) => ({ MountTargetId: a.id, FileSystemId: a.fs, SubnetId: a.subnet, LifeCycleState: "available" })) });
    },
    "delete-file-system": (conta, pos, flags) => {
      estado(conta);
      const fs = exigirFlag(flags, "file-system-id");
      if (!conta.efs.sistemas[fs]) throw new ErroCli(`An error occurred (FileSystemNotFound) when calling the DeleteFileSystem operation: File system '${fs}' does not exist.`);
      if (Object.values(conta.efs.alvos).some((a) => a.fs === fs)) throw new ErroCli(`An error occurred (FileSystemInUse) when calling the DeleteFileSystem operation: File system ${fs} has mount targets. Apague os mount targets antes.`);
      delete conta.efs.sistemas[fs];
      return okSilencioso(`File system ${fs} apagado.`);
    },
    "delete-mount-target": (conta, pos, flags) => {
      estado(conta);
      const id = exigirFlag(flags, "mount-target-id");
      if (!conta.efs.alvos[id]) throw new ErroCli(`An error occurred (MountTargetNotFound) when calling the DeleteMountTarget operation: invalid mount target ID`);
      delete conta.efs.alvos[id];
      return okSilencioso(`Mount target ${id} apagado.`);
    },
  };

  // ============================================================
  // ElastiCache
  // ============================================================
  const ENGINES_CACHE = ["redis", "memcached", "valkey"];
  const cmdElastiCache = {
    "create-cache-cluster": (conta, pos, flags) => {
      estado(conta);
      const id = exigirFlag(flags, "cache-cluster-id");
      const engine = String(exigirFlag(flags, "engine"));
      if (!ENGINES_CACHE.includes(engine)) throw new ErroCli(`An error occurred (InvalidParameterValue) when calling the CreateCacheCluster operation: Invalid engine: ${engine}. Aceitos: ${ENGINES_CACHE.join(", ")}`);
      if (conta.elasticache.clusters[id]) throw new ErroCli(`An error occurred (CacheClusterAlreadyExists) when calling the CreateCacheCluster operation: Cache cluster ${id} already exists.`);
      const tipo = flags["cache-node-type"] || "cache.t3.micro";
      const nos = parseInt(flags["num-cache-nodes"] || "1", 10);
      conta.elasticache.clusters[id] = { id, engine, tipo, nos, endpoint: `${id}.${hexAleatorio(6)}.cache.amazonaws.com`, criadoEm: agoraIso() };
      avisarClimb("Cache guarda em memória o que é caro de buscar (uma consulta pesada, um perfil) — a aplicação lê do cache em microssegundos em vez de bater no banco toda hora. Redis é o mais usado.");
      return js({ CacheCluster: { CacheClusterId: id, Engine: engine, CacheNodeType: tipo, NumCacheNodes: nos, CacheClusterStatus: "creating" } });
    },
    "describe-cache-clusters": (conta) => {
      estado(conta);
      const l = Object.values(conta.elasticache.clusters);
      if (!l.length) { avisarClimb("Nenhum cache ainda. Crie um com: aws elasticache create-cache-cluster --cache-cluster-id cache-loja --engine redis --cache-node-type cache.t3.micro --num-cache-nodes 1"); return js({ CacheClusters: [] }); }
      return js({ CacheClusters: l.map((c) => ({ CacheClusterId: c.id, Engine: c.engine, CacheNodeType: c.tipo, NumCacheNodes: c.nos, CacheClusterStatus: "available" })) });
    },
    "delete-cache-cluster": (conta, pos, flags) => {
      estado(conta);
      const id = exigirFlag(flags, "cache-cluster-id");
      if (!conta.elasticache.clusters[id]) throw new ErroCli(`An error occurred (CacheClusterNotFound) when calling the DeleteCacheCluster operation: Cache cluster ${id} not found.`);
      delete conta.elasticache.clusters[id];
      return okSilencioso(`Cache cluster "${id}" apagado.`);
    },
  };

  // ============================================================
  // ACM — Certificate Manager
  // ============================================================
  const cmdAcm = {
    "request-certificate": (conta, pos, flags) => {
      estado(conta);
      const dominio = String(exigirFlag(flags, "domain-name"));
      const metodo = flags["validation-method"] || "DNS";
      const arn = `arn:aws:acm:${REGIAO(conta)}:${CONTA_ID(conta)}:certificate/${hexAleatorio(8)}-${hexAleatorio(12)}`;
      conta.acm.certificados[arn] = { arn, dominio, metodo: String(metodo), status: "PENDING_VALIDATION", criadoEm: agoraIso() };
      avisarClimb("Certificado pedido — mas ele fica PENDING_VALIDATION até você PROVAR que é dono do domínio (criando um registro DNS no Route 53). Depois de validado, dá pra usar HTTPS no load balancer e no CloudFront, de graça.");
      return js({ CertificateArn: arn });
    },
    "list-certificates": (conta) => {
      estado(conta);
      const l = Object.values(conta.acm.certificados);
      if (!l.length) { avisarClimb("Nenhum certificado ainda. Peça um com: aws acm request-certificate --domain-name loja-climb.com"); return js({ CertificateSummaryList: [] }); }
      return js({ CertificateSummaryList: l.map((c) => ({ CertificateArn: c.arn, DomainName: c.dominio, Status: c.status })) });
    },
    "describe-certificate": (conta, pos, flags) => {
      estado(conta);
      const arn = exigirFlag(flags, "certificate-arn");
      const c = conta.acm.certificados[arn];
      if (!c) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the DescribeCertificate operation: Could not find certificate ${arn}`);
      return js({ Certificate: { CertificateArn: c.arn, DomainName: c.dominio, Status: c.status, Type: "AMAZON_ISSUED", KeyAlgorithm: "RSA-2048", RenewalEligibility: "INELIGIBLE" } });
    },
    "delete-certificate": (conta, pos, flags) => {
      estado(conta);
      const arn = exigirFlag(flags, "certificate-arn");
      if (!conta.acm.certificados[arn]) throw new ErroCli(`An error occurred (ResourceNotFoundException) when calling the DeleteCertificate operation: Could not find certificate ${arn}`);
      delete conta.acm.certificados[arn];
      return okSilencioso("Certificado apagado.");
    },
  };

  // ---------- Registro ----------
  if (typeof SERVICOS !== "undefined") {
    SERVICOS.elbv2 = cmdElb;
    SERVICOS.elasticbeanstalk = cmdEb;
    SERVICOS.efs = cmdEfs;
    SERVICOS.elasticache = cmdElastiCache;
    SERVICOS.acm = cmdAcm;
  }

  // ============================================================
  // Trilhas
  // ============================================================
  const ARN_TG = "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/loja-tg/PLACEHOLDER";

  const DESAFIOS_FASE6 = [
    // ===================== ELB =====================
    { id: "elb-1", servico: "elbv2", nivel: 1, xp: 50, titulo: "Quem distribui o tráfego?",
      descricao: "O <b>Load Balancer</b> fica na frente das suas máquinas e reparte as requisições entre elas — se uma cai, ele desvia sozinho. Comece <b>listando</b> os load balancers.",
      dicas: ["aws elbv2 describe-load-balancers"], solucao: ["aws elbv2 describe-load-balancers"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "elbv2", "describe-load-balancers") },
    { id: "elb-2", servico: "elbv2", nivel: 2, xp: 90, titulo: "Suba o balanceador",
      descricao: "Crie um <b>Application Load Balancer</b> chamado <b>loja-alb</b> em <b>2 sub-redes</b> (ele precisa de duas zonas, como na AWS real).",
      dicas: ["aws elbv2 create-load-balancer --name loja-alb --subnets subnet-aaa1 subnet-bbb2"],
      solucao: ["aws elbv2 create-load-balancer --name loja-alb --subnets subnet-aaa1 subnet-bbb2"],
      validar: (c) => !!(c.elb && c.elb.lbs["loja-alb"]) },
    { id: "elb-3", servico: "elbv2", nivel: 2, xp: 90, titulo: "O grupo de destino",
      descricao: "O load balancer manda o tráfego pra um <b>target group</b>. Crie o <b>loja-tg</b> na porta <b>80</b> (HTTP) da sua VPC.",
      dicas: ["aws elbv2 create-target-group --name loja-tg --protocol HTTP --port 80 --vpc-id vpc-0f00d1e00c11ab001"],
      solucao: ["aws elbv2 create-target-group --name loja-tg --protocol HTTP --port 80 --vpc-id vpc-0f00d1e00c11ab001"],
      validar: (c) => !!(c.elb && c.elb.tgs["loja-tg"]) },
    { id: "elb-4", servico: "elbv2", nivel: 3, xp: 100, titulo: "Registre as máquinas",
      descricao: "Suba uma instância EC2 e <b>registre</b> ela no target group. <small>(o load balancer só manda tráfego pras máquinas registradas e saudáveis)</small>",
      dicas: ["Primeiro: aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t2.micro",
        `aws elbv2 register-targets --target-group-arn <tg-arn> --targets Id=<id-da-instância>`],
      solucao: ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t2.micro",
        `aws elbv2 register-targets --target-group-arn <tg-arn> --targets Id=<id-da-instância>`],
      validar: (c) => !!(c.elb && Object.values(c.elb.tgs).some((t) => (t.alvos || []).length > 0)) },
    { id: "elb-5", servico: "elbv2", nivel: 3, xp: 90, titulo: "Abra a porta de entrada (listener)",
      descricao: "Falta o <b>listener</b>: quem escuta na porta 80 e encaminha pro target group. Crie um listener HTTP na porta <b>80</b> do <b>loja-alb</b>.",
      dicas: ["aws elbv2 create-listener --load-balancer-arn <lb-arn> --protocol HTTP --port 80 --default-actions Type=forward,TargetGroupArn=<tg-arn>"],
      solucao: ["aws elbv2 create-listener --load-balancer-arn <lb-arn> --protocol HTTP --port 80 --default-actions Type=forward,TargetGroupArn=<tg-arn>"],
      validar: (c) => !!(c.elb && Object.keys(c.elb.listeners || {}).length > 0) },
    { id: "elb-6", servico: "elbv2", nivel: 2, xp: 60, titulo: "As máquinas estão saudáveis?",
      descricao: "Veja a <b>saúde dos alvos</b> do target group (o load balancer faz health check e evita as que estão fora).",
      dicas: ["aws elbv2 describe-target-health --target-group-arn <tg-arn>"],
      solucao: ["aws elbv2 describe-target-health --target-group-arn <tg-arn>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "elbv2", "describe-target-health") },
    { id: "elb-7", servico: "elbv2", nivel: 3, xp: 80, titulo: "Desmonte o balanceador",
      descricao: "<b>Apague</b> o load balancer <b>loja-alb</b>.",
      dicas: ["aws elbv2 delete-load-balancer --load-balancer-arn <lb-arn>"],
      solucao: ["aws elbv2 delete-load-balancer --load-balancer-arn <lb-arn>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "elbv2", "delete-load-balancer") && !(c.elb && c.elb.lbs["loja-alb"]) },

    // ===================== Elastic Beanstalk =====================
    { id: "bs-1", servico: "elasticbeanstalk", nivel: 1, xp: 50, titulo: "Deploy sem dor de cabeça",
      descricao: "O <b>Elastic Beanstalk</b> é o \"deploy fácil\": você sobe o código e ele monta EC2, load balancer e Auto Scaling sozinho. Liste as <b>aplicações</b>.",
      dicas: ["aws elasticbeanstalk describe-applications"], solucao: ["aws elasticbeanstalk describe-applications"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "elasticbeanstalk", "describe-applications") },
    { id: "bs-2", servico: "elasticbeanstalk", nivel: 1, xp: 70, titulo: "Crie a aplicação",
      descricao: "Crie a aplicação <b>loja-app</b>.",
      dicas: ["aws elasticbeanstalk create-application --application-name loja-app"],
      solucao: ["aws elasticbeanstalk create-application --application-name loja-app"],
      validar: (c) => !!(c.eb && c.eb.apps["loja-app"]) },
    { id: "bs-3", servico: "elasticbeanstalk", nivel: 2, xp: 100, titulo: "Coloque no ar (environment)",
      descricao: "Crie o <b>environment</b> <b>loja-prod</b> da aplicação, rodando <b>Python</b>. <small>(é aqui que o Beanstalk sobe toda a infra por baixo)</small>",
      dicas: ['aws elasticbeanstalk create-environment --application-name loja-app --environment-name loja-prod --solution-stack-name "64bit Amazon Linux 2023 v4.0.0 running Python 3.12"'],
      solucao: ['aws elasticbeanstalk create-environment --application-name loja-app --environment-name loja-prod --solution-stack-name "64bit Amazon Linux 2023 v4.0.0 running Python 3.12"'],
      validar: (c) => !!(c.eb && c.eb.envs["loja-prod"]) },
    { id: "bs-4", servico: "elasticbeanstalk", nivel: 2, xp: 60, titulo: "Está no ar e saudável?",
      descricao: "Veja os <b>environments</b> — o <code>Health</code> precisa estar <b>Green</b> e o <code>CNAME</code> é a URL da app.",
      dicas: ["aws elasticbeanstalk describe-environments"], solucao: ["aws elasticbeanstalk describe-environments"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "elasticbeanstalk", "describe-environments") },
    { id: "bs-5", servico: "elasticbeanstalk", nivel: 3, xp: 90, titulo: "Encerre tudo de uma vez",
      descricao: "<b>Encerre</b> o environment <b>loja-prod</b> — some com EC2, load balancer e Auto Scaling juntos. Depois <b>apague</b> a aplicação. <small>(a AWS recusa apagar app com ambiente vivo)</small>",
      dicas: ["Primeiro: aws elasticbeanstalk terminate-environment --environment-name loja-prod",
        "Depois: aws elasticbeanstalk delete-application --application-name loja-app"],
      solucao: ["aws elasticbeanstalk terminate-environment --environment-name loja-prod",
        "aws elasticbeanstalk delete-application --application-name loja-app"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "elasticbeanstalk", "delete-application") && !(c.eb && c.eb.apps["loja-app"]) },

    // ===================== EFS =====================
    { id: "efs-1", servico: "efs", nivel: 1, xp: 50, titulo: "Disco compartilhado",
      descricao: "O <b>EFS</b> é um disco que <b>várias máquinas montam ao mesmo tempo</b> (o EBS é de uma máquina só). Liste os <b>file systems</b>.",
      dicas: ["aws efs describe-file-systems"], solucao: ["aws efs describe-file-systems"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "efs", "describe-file-systems") },
    { id: "efs-2", servico: "efs", nivel: 1, xp: 70, titulo: "Crie o file system",
      descricao: "Crie um EFS com o token <b>dados-efs</b> <small>(o token evita criar dois iguais sem querer)</small>.",
      dicas: ["aws efs create-file-system --creation-token dados-efs"],
      solucao: ["aws efs create-file-system --creation-token dados-efs"],
      validar: (c) => !!(c.efs && Object.values(c.efs.sistemas).some((f) => f.token === "dados-efs")) },
    { id: "efs-3", servico: "efs", nivel: 2, xp: 90, titulo: "Ponto de conexão na rede",
      descricao: "Pra as máquinas alcançarem o EFS, crie um <b>mount target</b> numa sub-rede da sua VPC.",
      dicas: ["aws efs create-mount-target --file-system-id <fs-id> --subnet-id subnet-aaa1"],
      solucao: ["aws efs create-mount-target --file-system-id <fs-id> --subnet-id subnet-aaa1"],
      validar: (c) => !!(c.efs && Object.keys(c.efs.alvos || {}).length > 0) },
    { id: "efs-4", servico: "efs", nivel: 3, xp: 80, titulo: "Descarte o disco",
      descricao: "<b>Apague</b> o mount target e depois o <b>file system</b>. <small>(a AWS recusa apagar o EFS com mount target ativo)</small>",
      dicas: ["Primeiro: aws efs delete-mount-target --mount-target-id <mt-id>",
        "Depois: aws efs delete-file-system --file-system-id <fs-id>"],
      solucao: ["aws efs delete-mount-target --mount-target-id <mt-id>",
        "aws efs delete-file-system --file-system-id <fs-id>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "efs", "delete-file-system") },

    // ===================== ElastiCache =====================
    { id: "cache-1", servico: "elasticache", nivel: 1, xp: 50, titulo: "Memória que acelera",
      descricao: "O <b>ElastiCache</b> guarda em memória o que é caro de buscar — a app lê do cache em microssegundos em vez de bater no banco toda hora. Liste os <b>clusters de cache</b>.",
      dicas: ["aws elasticache describe-cache-clusters"], solucao: ["aws elasticache describe-cache-clusters"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "elasticache", "describe-cache-clusters") },
    { id: "cache-2", servico: "elasticache", nivel: 2, xp: 90, titulo: "Suba um Redis",
      descricao: "Crie o cache <b>cache-loja</b> com engine <b>redis</b>, tipo <b>cache.t3.micro</b>, <b>1</b> nó.",
      dicas: ["aws elasticache create-cache-cluster --cache-cluster-id cache-loja --engine redis --cache-node-type cache.t3.micro --num-cache-nodes 1"],
      solucao: ["aws elasticache create-cache-cluster --cache-cluster-id cache-loja --engine redis --cache-node-type cache.t3.micro --num-cache-nodes 1"],
      validar: (c) => { const k = c.elasticache && c.elasticache.clusters["cache-loja"]; return !!k && k.engine === "redis"; } },
    { id: "cache-3", servico: "elasticache", nivel: 3, xp: 70, titulo: "Desligue o cache",
      descricao: "<b>Apague</b> o cluster <b>cache-loja</b>.",
      dicas: ["aws elasticache delete-cache-cluster --cache-cluster-id cache-loja"],
      solucao: ["aws elasticache delete-cache-cluster --cache-cluster-id cache-loja"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "elasticache", "delete-cache-cluster") && !(c.elasticache && c.elasticache.clusters["cache-loja"]) },

    // ===================== ACM =====================
    { id: "acm-1", servico: "acm", nivel: 1, xp: 50, titulo: "Cadeado do HTTPS",
      descricao: "O <b>ACM</b> emite certificados SSL/TLS <b>de graça</b> — é o cadeado do HTTPS. Liste os <b>certificados</b>.",
      dicas: ["aws acm list-certificates"], solucao: ["aws acm list-certificates"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "acm", "list-certificates") },
    { id: "acm-2", servico: "acm", nivel: 2, xp: 80, titulo: "Peça o certificado",
      descricao: "Peça um certificado pro domínio <b>loja-climb.com</b> (validação por <b>DNS</b>).",
      dicas: ["aws acm request-certificate --domain-name loja-climb.com --validation-method DNS"],
      solucao: ["aws acm request-certificate --domain-name loja-climb.com --validation-method DNS"],
      validar: (c) => !!(c.acm && Object.values(c.acm.certificados).some((x) => x.dominio === "loja-climb.com")) },
    { id: "acm-3", servico: "acm", nivel: 2, xp: 70, titulo: "Ainda validando?",
      descricao: "Veja os detalhes do certificado — ele fica <b>PENDING_VALIDATION</b> até você provar que é dono do domínio (criando o registro DNS no Route 53).",
      dicas: ["aws acm describe-certificate --certificate-arn <cert-arn>"],
      solucao: ["aws acm describe-certificate --certificate-arn <cert-arn>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "acm", "describe-certificate") },
    { id: "acm-4", servico: "acm", nivel: 3, xp: 70, titulo: "Revogue o certificado",
      descricao: "<b>Apague</b> o certificado de <b>loja-climb.com</b>.",
      dicas: ["aws acm delete-certificate --certificate-arn <cert-arn>"],
      solucao: ["aws acm delete-certificate --certificate-arn <cert-arn>"],
      validar: (c, cmd, ok) => ok && ehCmd(cmd, "acm", "delete-certificate") },
  ];

  // ---------- Registro das trilhas ----------
  if (typeof SERVICOS_META !== "undefined" && typeof DESAFIOS !== "undefined") {
    const metas = [
      { id: "elbv2", nome: "Load Balancer", subtitulo: "Distribui o tráfego", icone: "⚖️" },
      { id: "elasticbeanstalk", nome: "Elastic Beanstalk", subtitulo: "Deploy gerenciado", icone: "🌱" },
      { id: "efs", nome: "EFS", subtitulo: "Disco compartilhado", icone: "📁" },
      { id: "elasticache", nome: "ElastiCache", subtitulo: "Cache em memória", icone: "⚡" },
      { id: "acm", nome: "ACM", subtitulo: "Certificados HTTPS", icone: "🔏" },
    ];
    if (!SERVICOS_META.some((s) => s.id === "elbv2")) {
      for (const m of metas) {
        const iProj = SERVICOS_META.findIndex((s) => s.id === "projetos");
        if (iProj >= 0) SERVICOS_META.splice(iProj, 0, m); else SERVICOS_META.push(m);
      }
      for (const d of DESAFIOS_FASE6) DESAFIOS.push(d);
    }
  }
})();
