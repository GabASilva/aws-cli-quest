"use strict";
// ============================================================
// CLImb — ec2-completo.js
// O `aws ec2` e o maior servico do CLI (769 comandos) e o CLImb cobria 39 —
// criar, ligar, desligar, apagar, mais a VPC. Faltava o que a operacao faz com
// a maquina DEPOIS que ela existe.
//
// A escolha do que entra saiu da pesquisa de vagas ([[trilhas-por-profissao]]),
// nao da lista alfabetica:
//
//   TAGS — `create-tags` e o comando mais subestimado da AWS. Sem etiqueta nao
//        existe relatorio de custo por time, nem inventario, nem faxina: voce
//        fica com 40 maquinas e ninguem sabe de quem e nenhuma.
//   IP ELASTICO — alocar, associar e (principalmente) LIBERAR. IP elastico
//        parado e cobrado, e e um dos achados mais comuns de FinOps.
//   AMI — tirar imagem da maquina antes de mexer nela. E o "backup" que se faz
//        antes de qualquer manutencao arriscada.
//   STATUS e TIPOS — `describe-instance-status` e a checagem de saude que o
//        suporte olha primeiro; `modify-instance-attribute` e o rightsizing.
//   FECHAR PORTA — `revoke-security-group-ingress`. A trilha ensinava a ABRIR
//        a porta 22 e nunca a fechar, que e o que a auditoria pede.
//   NAT GATEWAY — sub-rede privada com saida pra internet. E tambem uma das
//        linhas mais caras da fatura, entao apagar tambem se aprende.
//
// CARREGA DEPOIS de desafios.js e desafios-pratica.js (as atividades se
// ancoram nas de la — se carregar antes, o `at()` joga tudo pro fim).
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.ec2) return;

  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";

  function st(conta) {
    conta.ec2 = conta.ec2 || { instancias: {}, securityGroups: {}, keyPairs: {} };
    conta.ec2.tags = conta.ec2.tags || {};
    conta.ec2.enderecos = conta.ec2.enderecos || {};
    conta.ec2.imagens = conta.ec2.imagens || {};
    conta.ec2.nats = conta.ec2.nats || {};
    return conta.ec2;
  }
  // O tokenizer entrega a flag so o primeiro token; o resto cai nos
  // posicionais. Mesmo remendo dos outros arquivos *-completo.
  function lista(valor, pos, filtro) {
    return String(valor === undefined ? "" : valor)
      .split(/[,\s]+/).filter(Boolean)
      .concat((pos || []).map(String).filter((x) => (filtro ? filtro.test(x) : true)));
  }
  function estruturas(texto, pos) {
    return [String(texto)].concat((pos || []).map(String))
      .join(" ").split(/\s+/).filter(Boolean)
      .map((p) => (typeof parsearShorthand === "function" ? parsearShorthand(p) : {}))
      .filter((e) => e && Object.keys(e).length);
  }
  function instanciaDe(conta, id, op) {
    st(conta);
    const i = conta.ec2.instancias[id];
    if (!i) throw new ErroCli("An error occurred (InvalidInstanceID.NotFound) when calling the " + op + " operation: The instance ID '" + id + "' does not exist");
    return i;
  }
  function grupoDe(conta, flags, op) {
    const s = st(conta);
    const porId = flags["group-id"] ? String(flags["group-id"]) : "";
    const porNome = flags["group-name"] ? String(flags["group-name"]) : "";
    if (!porId && !porNome) {
      throw new ErroCli("An error occurred (MissingParameter) when calling the " + op + " operation: Either group-id or group-name must be specified.");
    }
    const achado = porId
      ? s.securityGroups[porId]
      : Object.values(s.securityGroups).find((g) => g.nome === porNome);
    if (!achado) {
      throw new ErroCli("An error occurred (InvalidGroup.NotFound) when calling the " + op + " operation: The security group '" + (porId || porNome) + "' does not exist");
    }
    return achado;
  }

  const TIPOS = [
    { nome: "t2.micro", vcpu: 1, mem: 1, rede: "Low to Moderate" },
    { nome: "t3.micro", vcpu: 2, mem: 1, rede: "Up to 5 Gigabit" },
    { nome: "t3.small", vcpu: 2, mem: 2, rede: "Up to 5 Gigabit" },
    { nome: "t3.medium", vcpu: 2, mem: 4, rede: "Up to 5 Gigabit" },
    { nome: "m5.large", vcpu: 2, mem: 8, rede: "Up to 10 Gigabit" },
    { nome: "m5.xlarge", vcpu: 4, mem: 16, rede: "Up to 10 Gigabit" },
    { nome: "c5.large", vcpu: 2, mem: 4, rede: "Up to 10 Gigabit" },
    { nome: "r5.large", vcpu: 2, mem: 16, rede: "Up to 10 Gigabit" },
  ];
  const REGIOES = ["us-east-1", "us-east-2", "us-west-1", "us-west-2", "sa-east-1", "eu-west-1", "eu-central-1", "ap-southeast-1"];

  Object.assign(SERVICOS.ec2, {
    // ---------- etiquetas: sem elas não existe inventário ----------
    "create-tags": (conta, pos, flags) => {
      const s = st(conta);
      const recursos = lista(exigirFlag(flags, "resources"), pos, /^(i|vol|snap|sg|vpc|subnet|ami|eipalloc|nat|igw|rtb)-/);
      const tags = estruturas(exigirFlag(flags, "tags"), pos).filter((t) => t.Key !== undefined);
      if (!tags.length) {
        throw new ErroCli(
          "An error occurred (MissingParameter) when calling the CreateTags operation: The request must contain the parameter tags.\n" +
          "Forma: --tags Key=Time,Value=plataforma Key=Ambiente,Value=producao"
        );
      }
      for (const r of recursos) {
        s.tags[r] = s.tags[r] || {};
        for (const t of tags) s.tags[r][t.Key] = t.Value === undefined ? "" : String(t.Value);
      }
      avisarClimb(
        "Etiqueta não muda nada no funcionamento — é por isso que ela é o comando mais subestimado da AWS. Sem ela não existe " +
        "relatório de custo por time, nem inventario, nem faxina: você fica com 40 máquinas e ninguém sabe de quem e nenhuma."
      );
      return okSilencioso("Etiquetas aplicadas em " + recursos.length + (recursos.length === 1 ? " recurso." : " recursos."));
    },
    "describe-tags": (conta, pos, flags) => {
      const s = st(conta);
      const filtro = flags.filters ? String(flags.filters) : "";
      const chave = filtro.match(/Values?[,=]+([A-Za-z0-9:_-]+)/);
      const fora = [];
      for (const [rec, tags] of Object.entries(s.tags)) {
        for (const [k, v] of Object.entries(tags)) {
          if (chave && k !== chave[1] && v !== chave[1]) continue;
          fora.push({ Key: k, ResourceId: rec, ResourceType: rec.indexOf("i-") === 0 ? "instance" : "resource", Value: v });
        }
      }
      if (!fora.length) {
        avisarClimb("Nenhum recurso etiquetado. No relatório de custo isso aparece como 'sem tag' — o balde onde ninguém consegue achar responsável.");
        return "";
      }
      return js({ Tags: fora });
    },
    "delete-tags": (conta, pos, flags) => {
      const s = st(conta);
      const recursos = lista(exigirFlag(flags, "resources"), pos, /^(i|vol|snap|sg|vpc|subnet|ami|eipalloc|nat)-/);
      const tags = estruturas(flags.tags === undefined ? "" : flags.tags, pos);
      for (const r of recursos) {
        if (!s.tags[r]) continue;
        if (!tags.length) { delete s.tags[r]; continue; }
        for (const t of tags) delete s.tags[r][t.Key];
      }
      return okSilencioso("Etiquetas removidas.");
    },

    // ---------- IP elástico: o que fica cobrando parado ----------
    "allocate-address": (conta, pos, flags) => {
      const s = st(conta);
      const dominio = flags.domain ? String(flags.domain) : "vpc";
      if (dominio !== "vpc") {
        throw new ErroCli("An error occurred (InvalidParameterValue) when calling the AllocateAddress operation: Invalid value '" + dominio + "' for domain. EC2-Classic foi aposentado: use vpc.");
      }
      const id = "eipalloc-0" + hexAleatorio(16);
      const ip = "54." + (100 + Math.floor(Math.random() * 100)) + "." + Math.floor(Math.random() * 250) + "." + Math.floor(Math.random() * 250);
      s.enderecos[id] = { id: id, ip: ip, instancia: null, associacao: null };
      avisarClimb(
        "Atenção ao contrário do que parece: IP elástico ASSOCIADO a uma máquina ligada é de graça — o que a AWS cobra é o IP " +
        "PARADO, sem uso. É um dos achados mais comuns de FinOps: dezenas de IPs alocados de migrações antigas, cobrando por hora."
      );
      return js({ PublicIp: ip, AllocationId: id, Domain: "vpc" });
    },
    "associate-address": (conta, pos, flags) => {
      const s = st(conta);
      const alloc = String(exigirFlag(flags, "allocation-id"));
      const e = s.enderecos[alloc];
      if (!e) throw new ErroCli("An error occurred (InvalidAllocationID.NotFound) when calling the AssociateAddress operation: Allocation ID " + alloc + " not found.");
      const id = String(exigirFlag(flags, "instance-id"));
      instanciaDe(conta, id, "AssociateAddress");
      e.instancia = id;
      e.associacao = "eipassoc-0" + hexAleatorio(16);
      return js({ AssociationId: e.associacao });
    },
    "disassociate-address": (conta, pos, flags) => {
      const s = st(conta);
      const assoc = flags["association-id"] ? String(flags["association-id"]) : "";
      const e = Object.values(s.enderecos).find((x) => x.associacao === assoc || (flags["public-ip"] && x.ip === String(flags["public-ip"])));
      if (!e) throw new ErroCli("An error occurred (InvalidAssociationID.NotFound) when calling the DisassociateAddress operation: Association ID not found.");
      e.instancia = null;
      e.associacao = null;
      avisarClimb("Soltou da máquina — mas o IP continua SEU e agora está parado, que é justamente o estado que a AWS cobra. Se não vai usar, libere com release-address.");
      return okSilencioso("Endereco desassociado.");
    },
    "release-address": (conta, pos, flags) => {
      const s = st(conta);
      const alloc = String(exigirFlag(flags, "allocation-id"));
      const e = s.enderecos[alloc];
      if (!e) throw new ErroCli("An error occurred (InvalidAllocationID.NotFound) when calling the ReleaseAddress operation: Allocation ID " + alloc + " not found.");
      if (e.instancia) {
        throw new ErroCli(
          "An error occurred (InvalidIPAddress.InUse) when calling the ReleaseAddress operation: Address is in use.\n" +
          "Solte da máquina antes: aws ec2 disassociate-address --association-id " + e.associacao
        );
      }
      delete s.enderecos[alloc];
      avisarClimb("Liberado: para de cobrar. Mas o IP volta pro bolo da AWS e você NÃO consegue ele de volta — se algum DNS ou allowlist apontava pra ele, quebrou.");
      return okSilencioso("Endereco " + e.ip + " liberado.");
    },
    "describe-addresses": (conta) => {
      const s = st(conta);
      const lista2 = Object.values(s.enderecos);
      if (!lista2.length) {
        avisarClimb("Nenhum IP elástico alocado.");
        return "";
      }
      const parados = lista2.filter((e) => !e.instancia).length;
      if (parados) {
        avisarClimb(parados + (parados === 1 ? " IP está PARADO" : " IPs estão PARADOS") + " (sem máquina associada) — e é exatamente isso que aparece na fatura. Procure por 'Association' vazio na saída.");
      }
      return js({ Addresses: lista2.map((e) => ({
        PublicIp: e.ip, AllocationId: e.id, Domain: "vpc",
        InstanceId: e.instancia || undefined, AssociationId: e.associacao || undefined,
      })) });
    },

    // ---------- AMI: o backup antes de mexer ----------
    "create-image": (conta, pos, flags) => {
      const s = st(conta);
      const id = String(exigirFlag(flags, "instance-id"));
      const inst = instanciaDe(conta, id, "CreateImage");
      const nome = String(exigirFlag(flags, "name"));
      if (Object.values(s.imagens).some((im) => im.nome === nome)) {
        throw new ErroCli("An error occurred (InvalidAMIName.Duplicate) when calling the CreateImage operation: AMI name " + nome + " is already in use by another AMI.");
      }
      const ami = "ami-0" + hexAleatorio(16);
      s.imagens[ami] = {
        id: ami, nome: nome, instancia: id, tipo: inst.tipo,
        descricao: flags.description ? String(flags.description) : "",
        semReboot: flags["no-reboot"] !== undefined, criadaEm: new Date().toISOString(),
      };
      avisarClimb(
        flags["no-reboot"] !== undefined
          ? "Com --no-reboot a máquina não reinicia, mas a AWS não garante que o disco esteja consistente: se o banco estava escrevendo, a imagem pode sair no meio de uma transação."
          : "Por padrão a AWS REINICIA a máquina pra garantir que o disco esteja consistente. Em produção isso é uma queda — por isso existe o --no-reboot, com a ressalva de consistência."
      );
      return js({ ImageId: ami });
    },
    "describe-images": (conta, pos, flags) => {
      const s = st(conta);
      const minhas = Object.values(s.imagens);
      if (flags.owners !== undefined && !minhas.length) {
        avisarClimb("Nenhuma imagem sua. Sem --owners self a AWS devolveria dezenas de milhares de AMIs públicas — por isso o filtro é quase obrigatório.");
        return "";
      }
      if (!minhas.length) {
        avisarClimb("Nenhuma imagem própria ainda. Crie uma com: aws ec2 create-image --instance-id <id> --name <nome>");
        return "";
      }
      return js({ Images: minhas.map((im) => ({
        ImageId: im.id, Name: im.nome, Description: im.descricao,
        OwnerId: CONTA_ID(conta), State: "available", Public: false,
        CreationDate: im.criadaEm, Architecture: "x86_64", RootDeviceType: "ebs",
      })) });
    },
    "deregister-image": (conta, pos, flags) => {
      const s = st(conta);
      const ami = String(exigirFlag(flags, "image-id"));
      if (!s.imagens[ami]) throw new ErroCli("An error occurred (InvalidAMIID.NotFound) when calling the DeregisterImage operation: The image id '" + ami + "' does not exist");
      delete s.imagens[ami];
      avisarClimb("Cuidado: dar baixa na AMI NÃO apaga os snapshots que ela criou — eles continuam na fatura. Por isso existe o --delete-associated-snapshots.");
      return okSilencioso("Imagem " + ami + " deu baixa.");
    },

    // ---------- saúde, tipo e reinício ----------
    "describe-instance-status": (conta, pos, flags) => {
      const s = st(conta);
      const ids = lista(flags["instance-ids"], pos, /^i-/);
      const todas = ids.length ? ids.map((id) => instanciaDe(conta, id, "DescribeInstanceStatus")) : Object.values(s.instancias);
      const incluirTodas = flags["include-all-instances"] !== undefined;
      const visiveis = incluirTodas ? todas : todas.filter((i) => i.estado === "running");
      if (!visiveis.length) {
        avisarClimb("Nada aqui — é a pegadinha do comando: por padrão ele só mostra máquina LIGADA. A que está parada some da lista, e parece que nem existe. Use --include-all-instances.");
        return "";
      }
      return js({ InstanceStatuses: visiveis.map((i) => ({
        InstanceId: i.id, AvailabilityZone: REGIAO(conta) + "a",
        InstanceState: { Code: i.estado === "running" ? 16 : 80, Name: i.estado },
        InstanceStatus: { Status: i.estado === "running" ? "ok" : "not-applicable", Details: [{ Name: "reachability", Status: i.estado === "running" ? "passed" : "not-applicable" }] },
        SystemStatus: { Status: i.estado === "running" ? "ok" : "not-applicable", Details: [{ Name: "reachability", Status: i.estado === "running" ? "passed" : "not-applicable" }] },
      })) });
    },
    "describe-instance-types": (conta, pos, flags) => {
      const pedidos = lista(flags["instance-types"], pos, /^[a-z][0-9][a-z]*\./);
      const alvo = pedidos.length ? TIPOS.filter((t) => pedidos.indexOf(t.nome) >= 0) : TIPOS;
      if (!alvo.length) {
        throw new ErroCli("An error occurred (InvalidInstanceType) when calling the DescribeInstanceTypes operation: The following supplied instance types do not exist: " + pedidos.join(", "));
      }
      return js({ InstanceTypes: alvo.map((t) => ({
        InstanceType: t.nome,
        VCpuInfo: { DefaultVCpus: t.vcpu },
        MemoryInfo: { SizeInMiB: t.mem * 1024 },
        NetworkInfo: { NetworkPerformance: t.rede },
        CurrentGeneration: true, SupportedUsageClasses: ["on-demand", "spot"],
      })) });
    },
    "modify-instance-attribute": (conta, pos, flags) => {
      const id = String(exigirFlag(flags, "instance-id"));
      const inst = instanciaDe(conta, id, "ModifyInstanceAttribute");
      const atributo = flags.attribute ? String(flags.attribute) : (flags["instance-type"] !== undefined ? "instanceType" : "");
      const valor = flags.value !== undefined ? String(flags.value) : (flags["instance-type"] !== undefined ? String(flags["instance-type"]) : "");
      if (atributo !== "instanceType") {
        throw new ErroCli(
          "An error occurred (InvalidParameterValue) when calling the ModifyInstanceAttribute operation: atributo não suportado no simulador: " + (atributo || "(vazio)") + ".\n" +
          "Aqui dá pra trocar o tipo: --attribute instanceType --value t3.small"
        );
      }
      if (inst.estado !== "stopped") {
        throw new ErroCli(
          "An error occurred (IncorrectInstanceState) when calling the ModifyInstanceAttribute operation: The instance '" + id + "' is not in the 'stopped' state.\n" +
          "Trocar o tipo exige a máquina PARADA: aws ec2 stop-instances --instance-ids " + id
        );
      }
      if (!TIPOS.some((t) => t.nome === valor)) {
        throw new ErroCli("An error occurred (InvalidParameterValue) when calling the ModifyInstanceAttribute operation: Invalid value '" + valor + "' for InstanceType.");
      }
      inst.tipo = valor;
      avisarClimb("Isto é rightsizing: a máquina volta a ligar com outro tamanho, sem recriar nada e sem perder o disco. É o conserto mais barato de uma instância superdimensionada.");
      return okSilencioso("Instancia " + id + " agora e " + valor + ".");
    },
    "reboot-instances": (conta, pos, flags) => {
      const ids = lista(exigirFlag(flags, "instance-ids"), pos, /^i-/);
      for (const id of ids) {
        const i = instanciaDe(conta, id, "RebootInstances");
        if (i.estado !== "running") {
          throw new ErroCli("An error occurred (IncorrectInstanceState) when calling the RebootInstances operation: The instance '" + id + "' is not in the 'running' state.");
        }
      }
      avisarClimb("Reboot NÃO e stop + start: a máquina continua no mesmo hardware e mantém o IP público. O stop/start pode mudar de host — e, sem IP elástico, muda o IP também.");
      return okSilencioso("Reiniciando " + ids.length + (ids.length === 1 ? " instancia." : " instancias."));
    },

    // ---------- onde rodar ----------
    "describe-regions": (conta, pos, flags) => {
      const pedidas = lista(flags["region-names"], pos, /^[a-z]{2}-/);
      const alvo = pedidas.length ? REGIOES.filter((r) => pedidas.indexOf(r) >= 0) : REGIOES;
      return js({ Regions: alvo.map((r) => ({
        RegionName: r, Endpoint: "ec2." + r + ".amazonaws.com", OptInStatus: "opt-in-not-required",
      })) });
    },
    "describe-availability-zones": (conta) => {
      const r = REGIAO(conta);
      return js({ AvailabilityZones: ["a", "b", "c"].map((letra) => ({
        State: "available", RegionName: r, ZoneName: r + letra,
        ZoneId: r.split("-").map((x) => x[0]).join("") + "-az" + (letra.charCodeAt(0) - 96),
        ZoneType: "availability-zone",
      })) });
    },

    // ---------- fechar a porta ----------
    "revoke-security-group-ingress": (conta, pos, flags) => {
      const g = grupoDe(conta, flags, "RevokeSecurityGroupIngress");
      const porta = flags.port !== undefined ? String(flags.port) : "";
      const cidr = flags.cidr !== undefined ? String(flags.cidr) : "";
      g.regras = g.regras || [];
      const antes = g.regras.length;
      g.regras = g.regras.filter((r) => {
        const mesmaPorta = !porta || String(r.porta) === porta || String(r.from) === porta;
        const mesmoCidr = !cidr || String(r.cidr) === cidr;
        return !(mesmaPorta && mesmoCidr);
      });
      if (antes === g.regras.length) {
        avisarClimb("Nenhuma regra batia com o que você pediu — e a AWS não reclama disso. Confira as regras com: aws ec2 describe-security-groups");
      } else {
        avisarClimb("Porta fechada. A trilha te ensinou a ABRIR a 22 e a 80; fechar o que não é mais usado é o que a auditoria cobra — e ninguém ensina.");
      }
      return okSilencioso("Regra de entrada revogada do grupo \"" + g.nome + "\".");
    },
    "authorize-security-group-egress": (conta, pos, flags) => {
      const g = grupoDe(conta, flags, "AuthorizeSecurityGroupEgress");
      g.saida = g.saida || [];
      g.saida.push({
        protocolo: flags.protocol ? String(flags.protocol) : "-1",
        porta: flags.port !== undefined ? String(flags.port) : "all",
        cidr: flags.cidr ? String(flags.cidr) : "0.0.0.0/0",
      });
      avisarClimb("Regra de SAÍDA. Quase ninguém mexe nisso porque o padrão já libera tudo pra fora — e é justamente por isso que restringir a saída é um controle forte contra exfiltração de dado.");
      return okSilencioso("Regra de saída adicionada ao grupo \"" + g.nome + "\".");
    },
    "delete-security-group": (conta, pos, flags) => {
      const s = st(conta);
      const g = grupoDe(conta, flags, "DeleteSecurityGroup");
      const emUso = Object.values(s.instancias).some((i) => (i.sgs || []).indexOf(g.nome) >= 0);
      if (emUso) {
        throw new ErroCli(
          "An error occurred (DependencyViolation) when calling the DeleteSecurityGroup operation: resource " + (g.id || g.nome) + " has a dependent object.\n" +
          "Alguma instância ainda usa esse grupo. A AWS não deixa apagar grupo em uso — de propósito."
        );
      }
      const chave = Object.keys(s.securityGroups).find((k) => s.securityGroups[k] === g);
      if (chave) delete s.securityGroups[chave];
      return okSilencioso("Grupo \"" + g.nome + "\" apagado.");
    },
    "delete-key-pair": (conta, pos, flags) => {
      const s = st(conta);
      const nome = String(exigirFlag(flags, "key-name"));
      if (!s.keyPairs[nome]) throw new ErroCli("An error occurred (InvalidKeyPair.NotFound) when calling the DeleteKeyPair operation: The key pair '" + nome + "' does not exist");
      delete s.keyPairs[nome];
      avisarClimb("Apagar o par no console NÃO tira a chave publica de dentro das máquinas que já subiram com ela: quem tem o .pem continua entrando. Apagar aqui só impede novos usos.");
      return okSilencioso("Par de chaves \"" + nome + "\" apagado.");
    },

    // ---------- NAT gateway: saída da sub-rede privada ----------
    "create-nat-gateway": (conta, pos, flags) => {
      const s = st(conta);
      const subnet = String(exigirFlag(flags, "subnet-id"));
      if (conta.vpc && conta.vpc.subnets && !conta.vpc.subnets[subnet]) {
        throw new ErroCli("An error occurred (InvalidSubnetID.NotFound) when calling the CreateNatGateway operation: The subnet ID '" + subnet + "' does not exist");
      }
      const alloc = String(exigirFlag(flags, "allocation-id"));
      if (!s.enderecos[alloc]) {
        throw new ErroCli(
          "An error occurred (InvalidAllocationID.NotFound) when calling the CreateNatGateway operation: Allocation ID " + alloc + " not found.\n" +
          "NAT gateway precisa de um IP elástico próprio: aws ec2 allocate-address --domain vpc"
        );
      }
      s.enderecos[alloc].instancia = "nat";
      const id = "nat-0" + hexAleatorio(16);
      s.nats[id] = { id: id, subnet: subnet, alocacao: alloc, estado: "available", criadoEm: new Date().toISOString() };
      avisarClimb(
        "O NAT deixa a sub-rede PRIVADA sair pra internet (baixar pacote, chamar API) sem ficar alcançável de fora. " +
        "É também uma das linhas mais caras da fatura: cobra por hora E por GB que passa. Ambiente de teste com NAT esquecido ligado e clássico."
      );
      return js({ NatGateway: { NatGatewayId: id, SubnetId: subnet, State: "pending", NatGatewayAddresses: [{ AllocationId: alloc, PublicIp: s.enderecos[alloc].ip }] } });
    },
    "describe-nat-gateways": (conta) => {
      const s = st(conta);
      const lista2 = Object.values(s.nats);
      if (!lista2.length) {
        avisarClimb("Nenhum NAT gateway. Se a sua sub-rede privada precisa baixar pacote, e disto que ela depende.");
        return "";
      }
      return js({ NatGateways: lista2.map((n) => ({
        NatGatewayId: n.id, SubnetId: n.subnet, State: n.estado, CreateTime: n.criadoEm,
        NatGatewayAddresses: [{ AllocationId: n.alocacao, PublicIp: (s.enderecos[n.alocacao] || {}).ip }],
      })) });
    },
    "delete-nat-gateway": (conta, pos, flags) => {
      const s = st(conta);
      const id = String(exigirFlag(flags, "nat-gateway-id"));
      const n = s.nats[id];
      if (!n) throw new ErroCli("An error occurred (NatGatewayNotFound) when calling the DeleteNatGateway operation: NAT gateway " + id + " was not found.");
      n.estado = "deleted";
      if (s.enderecos[n.alocacao]) s.enderecos[n.alocacao].instancia = null;
      avisarClimb("Apagou o NAT, mas o IP elástico dele continua SEU e agora está parado — cobrando. Libere também, senao você trocou uma conta grande por uma pequena eterna.");
      return okSilencioso("NAT gateway " + id + " apagado.");
    },
  });

  // ============================================================
  // MANUAIS
  // ============================================================
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => "USO\n    " + uso + "\n\n" + txt;
    Object.assign(MANUAIS, {
      "ec2.create-tags": M(
        "aws ec2 create-tags --resources i-0abc --tags Key=Time,Value=plataforma Key=Ambiente,Value=producao",
        "Etiqueta qualquer recurso do EC2 (instância, volume, snapshot, VPC…).\n\nÉ o comando mais subestimado da AWS: etiqueta não muda nada no\nfuncionamento, mas sem ela não existe relatório de custo por time,\nnem inventário, nem faxina — você fica com 40 máquinas e ninguém\nsabe de quem é nenhuma.\n\nAceita vários recursos e várias tags na mesma chamada."),
      "ec2.describe-tags": M(
        "aws ec2 describe-tags [--filters Name=key,Values=Time]",
        "Lista as etiquetas da conta. É por aqui que se acha o que ficou sem\ndono — e o que está etiquetado errado."),
      "ec2.delete-tags": M(
        "aws ec2 delete-tags --resources i-0abc --tags Key=Ambiente",
        "Remove etiquetas. Sem --tags remove TODAS as do recurso."),
      "ec2.allocate-address": M(
        "aws ec2 allocate-address --domain vpc",
        "Reserva um IP público fixo na sua conta.\n\não CONTRÁRIO DO QUE PARECE: IP elástico ASSOCIADO a uma máquina\nligada é de graça. O que a AWS cobra é o IP PARADO.\n\nÉ um dos achados mais comuns de FinOps: dezenas de IPs sobrando de\nmigrações antigas, cobrando por hora."),
      "ec2.associate-address": M(
        "aws ec2 associate-address --allocation-id eipalloc-0abc --instance-id i-0abc",
        "Gruda o IP fixo na máquina. Sem isso, cada stop/start troca o IP\npúblico — e o DNS que apontava pra ela quebra."),
      "ec2.disassociate-address": M(
        "aws ec2 disassociate-address --association-id eipassoc-0abc",
        "Solta o IP da máquina. Ele continua SEU — e agora está parado, que\né justamente o estado cobrado."),
      "ec2.release-address": M(
        "aws ec2 release-address --allocation-id eipalloc-0abc",
        "Devolve o IP pra AWS: para de cobrar.\n\nIRREVERSÍVEL: o IP volta pro bolo e você não consegue ele de volta.\nSe algum DNS ou allowlist apontava pra ele, quebrou."),
      "ec2.describe-addresses": M(
        "aws ec2 describe-addresses",
        "Lista os IPs elásticos. Procure os que estão SEM InstanceId: são\nesses que aparecem na fatura sem estar servindo pra nada."),
      "ec2.create-image": M(
        "aws ec2 create-image --instance-id i-0abc --name backup-antes-do-deploy [--no-reboot]",
        "Tira uma imagem (AMI) da máquina — o \"backup\" que se faz antes de\nqualquer manutenção arriscada, e o molde de que novas máquinas\nnascem iguais.\n\nPOR PADRÃO A AWS REINICIA a máquina pra garantir disco consistente.\nEm produção isso é uma queda — daí o --no-reboot, com a ressalva de\nque aí a consistência não é garantida."),
      "ec2.describe-images": M(
        "aws ec2 describe-images --owners self",
        "Lista imagens. O --owners self é quase obrigatório: sem ele a AWS\ndevolve dezenas de milhares de AMIs públicas."),
      "ec2.deregister-image": M(
        "aws ec2 deregister-image --image-id ami-0abc",
        "Dá baixa na AMI.\n\nCUIDADO: isso NÃO apaga os snapshots que ela criou — eles continuam\nna fatura. Por isso existe o --delete-associated-snapshots."),
      "ec2.describe-instance-status": M(
        "aws ec2 describe-instance-status --instance-ids i-0abc [--include-all-instances]",
        "As duas checagens de saúde da AWS: SystemStatus (o hardware/host) e\nInstanceStatus (o sistema dentro da máquina). É o primeiro lugar que\no suporte olha.\n\nPEGADINHA: por padrão só mostra máquina LIGADA. A parada some da\nlista e parece que nem existe — use --include-all-instances."),
      "ec2.describe-instance-types": M(
        "aws ec2 describe-instance-types --instance-types t3.micro m5.large",
        "Quantas vCPUs, quanta memória e que rede cada tipo tem. É a tabela\nque se consulta antes de escolher tamanho — ou de reduzir um que\nestá grande demais."),
      "ec2.modify-instance-attribute": M(
        "aws ec2 modify-instance-attribute --instance-id i-0abc --attribute instanceType --value t3.small",
        "Troca o tipo da máquina sem recriar nada e sem perder o disco —\nisto é rightsizing, o conserto mais barato de uma instância\nsuperdimensionada.\n\nEXIGE A MÁQUINA PARADA."),
      "ec2.reboot-instances": M(
        "aws ec2 reboot-instances --instance-ids i-0abc",
        "Reinicia a máquina.\n\nNÃO é stop + start: no reboot ela continua no MESMO hardware e\nmantém o IP público. O stop/start pode mudar de host — e, sem IP\nelástico, muda o IP também."),
      "ec2.describe-regions": M(
        "aws ec2 describe-regions",
        "As regiões disponíveis pra conta. Útil pra varrer todas atrás de\nrecurso esquecido — recurso em região que ninguém olha é clássico."),
      "ec2.describe-availability-zones": M(
        "aws ec2 describe-availability-zones",
        "As zonas da região atual. Alta disponibilidade começa aqui: pôr as\nmáquinas em zonas diferentes é o mínimo pra sobreviver à queda de\num data center."),
      "ec2.revoke-security-group-ingress": M(
        "aws ec2 revoke-security-group-ingress --group-name web-sg --protocol tcp --port 22 --cidr 0.0.0.0/0",
        "FECHA uma porta que estava aberta. É o comando que a auditoria\ncobra e que quase nenhum tutorial ensina — todos ensinam a abrir.\n\nSe nada bater com o que você pediu, a AWS não reclama: confira com\ndescribe-security-groups."),
      "ec2.authorize-security-group-egress": M(
        "aws ec2 authorize-security-group-egress --group-id sg-0abc --protocol tcp --port 443 --cidr 10.0.0.0/16",
        "Regra de SAÍDA. Quase ninguém mexe porque o padrão já libera tudo\npra fora — e é justamente por isso que restringir a saída é um\ncontrole forte contra exfiltração de dados."),
      "ec2.delete-security-group": M(
        "aws ec2 delete-security-group --group-name web-sg",
        "Apaga o grupo. A AWS recusa (DependencyViolation) se alguma\ninstância ainda usa — de propósito."),
      "ec2.delete-key-pair": M(
        "aws ec2 delete-key-pair --key-name minha-chave",
        "Apaga o par de chaves da conta.\n\nNÃO tira a chave pública de dentro das máquinas que já subiram com\nela: quem tem o .pem continua entrando. Isso só impede novos usos."),
      "ec2.create-nat-gateway": M(
        "aws ec2 create-nat-gateway --subnet-id subnet-0abc --allocation-id eipalloc-0abc",
        "Deixa a sub-rede PRIVADA sair pra internet (baixar pacote, chamar\nAPI) sem ficar alcançável de fora.\n\nVai numa sub-rede PÚBLICA e precisa de um IP elástico próprio.\n\nCUSTO: é uma das linhas mais caras da fatura — cobra por hora E por\nGB que passa."),
      "ec2.describe-nat-gateways": M(
        "aws ec2 describe-nat-gateways",
        "Lista os NAT gateways e o estado de cada um. Vale varrer de vez em\nquando: NAT esquecido ligado em ambiente de teste é clássico."),
      "ec2.delete-nat-gateway": M(
        "aws ec2 delete-nat-gateway --nat-gateway-id nat-0abc",
        "Apaga o NAT.\n\nO IP elástico dele continua SEU e agora está parado, cobrando —\nlibere também, senão você trocou uma conta grande por uma pequena\neterna."),
    });
  }

  // ============================================================
  // PORQUE
  // ============================================================
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "ec2.create-tags": "etiqueta o recurso — sem isso não existe relatório de custo por time nem inventário.",
      "ec2.describe-tags": "acha o que ficou sem dono e o que está etiquetado errado.",
      "ec2.delete-tags": "remove etiqueta que não vale mais.",
      "ec2.allocate-address": "reserva um IP público fixo; parado ele é cobrado, associado é de graça.",
      "ec2.associate-address": "gruda o IP fixo na máquina pra ele não mudar a cada stop/start.",
      "ec2.disassociate-address": "solta o IP da máquina — e é aí que ele passa a ser cobrado.",
      "ec2.release-address": "devolve o IP pra AWS e para a cobrança; não tem volta.",
      "ec2.describe-addresses": "mostra quais IPs estão parados aparecendo na fatura.",
      "ec2.create-image": "tira uma imagem da máquina: o backup antes da manutenção e o molde de novas máquinas.",
      "ec2.describe-images": "lista suas imagens (com --owners self, senão vêm milhares públicas).",
      "ec2.deregister-image": "dá baixa na imagem — sem apagar os snapshots, que continuam custando.",
      "ec2.describe-instance-status": "mostra as duas checagens de saúde da AWS; é onde o suporte olha primeiro.",
      "ec2.describe-instance-types": "compara vCPU, memória e rede antes de escolher (ou reduzir) o tamanho.",
      "ec2.modify-instance-attribute": "troca o tipo da máquina sem recriar nada — é o rightsizing.",
      "ec2.reboot-instances": "reinicia mantendo o mesmo host e o mesmo IP, diferente de stop+start.",
      "ec2.describe-regions": "lista as regiões, pra varrer todas atrás de recurso esquecido.",
      "ec2.describe-availability-zones": "lista as zonas — alta disponibilidade começa por espalhar entre elas.",
      "ec2.revoke-security-group-ingress": "FECHA a porta que alguém abriu; é o que a auditoria cobra.",
      "ec2.authorize-security-group-egress": "restringe a saída, que é controle contra exfiltração de dados.",
      "ec2.delete-security-group": "apaga o grupo, se nenhuma instância depender dele.",
      "ec2.delete-key-pair": "apaga o par de chaves — sem expulsar quem já tem o .pem.",
      "ec2.create-nat-gateway": "dá saída pra internet à sub-rede privada, sem expor ela.",
      "ec2.describe-nat-gateways": "mostra os NAT ligados — inclusive o esquecido em ambiente de teste.",
      "ec2.delete-nat-gateway": "apaga o NAT; lembre de liberar o IP elástico dele também.",
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
  const tagsDe = (c, r) => (((c.ec2 || {}).tags || {})[r]) || {};
  const enderecos = (c) => Object.values(((c.ec2 || {}).enderecos) || {});
  const imagens = (c) => Object.values(((c.ec2 || {}).imagens) || {});
  const nats = (c) => Object.values(((c.ec2 || {}).nats) || {});
  const grupoPorNome = (c, n) => Object.values(((c.ec2 || {}).securityGroups) || {}).find((g) => g.nome === n);
  // Helper de propósito: validar tipo de instância direto no `d(...)` cairia em
  // duas armadilhas de uma vez — o auto-pass (outra atividade já cria t3.small)
  // e o `[...]` no nível 0, que o corte de gabarito troca por null.
  const instDe = (c, id) => ((c.ec2 || {}).instancias || {})[String(id)];

  // Revisão de 24/09: uma atividade por comando novo; quando a original fazia
  // dois, a seguinte faz o segundo reusando o primeiro. Cada família fecha com
  // uma fixação em cenário novo — e os quatro comandos que tinham manual e
  // nenhuma atividade (delete-tags, disassociate-address, deregister-image,
  // reboot-instances) entram agora.
  at("ec2-12", [
    d("ec2c-reg1", "ec2", 1, 50, "Onde eu posso rodar isso?",
      "Antes de subir qualquer coisa, a pergunta de base: em quais <b>regiões</b> a conta pode operar? <small>(recurso esquecido em região que ninguém olha é clássico — e é por essa lista que se varre)</small>",
      ["É um `describe-…` sem argumento nenhum.", "Repare no OptInStatus: algumas regiões precisam ser ligadas antes de usar."],
      ["aws ec2 describe-regions"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-regions")),
    d("ec2c-reg1b", "ec2", 1, 50, "Quantos data centers tem aqui?",
      "Dentro da região, as máquinas se espalham por <b>zonas</b> — prédios separados, com energia e rede próprias. Liste as zonas da região atual. <small>(alta disponibilidade começa aqui: máquina em zona diferente sobrevive à queda de um data center)</small>",
      ["É o `describe-…` irmão, das zonas de disponibilidade.", "A zona é sempre a região mais uma letra: us-east-1a, us-east-1b…"],
      ["aws ec2 describe-availability-zones"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-availability-zones")),
    d("ec2c-fix-reg", "ec2", 1, 50, "O servidor precisa ficar no Brasil",
      "Um cliente exige que os dados fiquem no país. Confira se a região de <b>São Paulo</b> (<b>sa-east-1</b>) está disponível pra conta e liste as zonas da região em que você está.",
      ["O describe-regions aceita `--region-names` pra perguntar por uma só.", "As zonas saem do mesmo comando da atividade anterior."],
      ["aws ec2 describe-regions --region-names sa-east-1",
        "aws ec2 describe-availability-zones"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-availability-zones")),
    d("ec2c-status1", "ec2", 2, 80, "A máquina está de pé mesmo?",
      "Chamado aberto: <i>\"o site caiu\"</i>. Antes de entrar na máquina, olhe as <b>duas checagens de saúde</b> que a AWS faz — a do hardware e a do sistema. <small>(a pegadinha: por padrão esse comando só mostra máquina LIGADA; a parada some da lista)</small>",
      ["Não é o describe-instances: existe um comando só de STATUS.", "Se a máquina estiver parada e você quiser vê-la assim mesmo, use --include-all-instances."],
      ["aws ec2 describe-instance-status --include-all-instances"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-instance-status")),
  ]);

  at("cob-ec2-1", [
    d("ec2c-tag1", "ec2", 2, 90, "Quarenta máquinas e nenhum dono",
      "O relatório de custo chegou com tudo num bolo só: ninguém sabe qual time paga o quê. Comece pela sua máquina — suba uma <b>t3.micro</b> e etiquete ela com <b>Time=plataforma</b> e <b>Ambiente=producao</b> de uma vez.",
      ["Etiqueta não muda nada no funcionamento; muda o relatório — e é por isso que ela é o comando mais esquecido da AWS.", "Cada etiqueta vai na forma `Key=<chave>,Value=<valor>`, e dá pra mandar várias separadas por espaço."],
      ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.micro",
        "aws ec2 create-tags --resources <id-da-instância> --tags Key=Time,Value=plataforma Key=Ambiente,Value=producao"],
      (c) => Object.values(((c.ec2 || {}).tags) || {}).some((t) => t.Time === "plataforma" && t.Ambiente === "producao")),
    d("ec2c-tag2", "ec2", 2, 70, "O que ainda está sem dono?",
      "Com a primeira etiquetada, levante o inventário: liste <b>todas as etiquetas</b> da conta pra ver o que já tem dono e o que ficou de fora.",
      ["É o `describe-…` das etiquetas, sem alvo: ele varre a conta.", "Dá pra estreitar com --filters, mas aqui queremos o retrato inteiro."],
      ["aws ec2 describe-tags"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-tags")),
    d("ec2c-tag3", "ec2", 2, 70, "A etiqueta que mente no relatório",
      "Alguém marcou a máquina como <b>Ambiente=teste</b> por engano, e ela sumiu do custo de produção. Grave essa etiqueta errada na instância pra reproduzir o problema e depois <b>remova</b> a chave <b>Ambiente</b>.",
      ["Gravar é o `create-tags` de antes; ele sobrescreve o valor de uma chave que já existe.", "Remover é `delete-tags`, e basta a CHAVE: `--tags Key=Ambiente`."],
      ["aws ec2 create-tags --resources <id-da-instância> --tags Key=Ambiente,Value=teste",
        "aws ec2 delete-tags --resources <id-da-instância> --tags Key=Ambiente"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-tags")),
    d("ec2c-fix-tag", "ec2", 2, 90, "Inventário da máquina de relatórios",
      "Suba a máquina de relatórios (<b>t3.small</b>), etiquete com <b>Time=dados</b> e <b>Projeto=bi</b>, confira no inventário e — como o projeto BI foi cancelado — tire a etiqueta <b>Projeto</b>.",
      ["Pôr, conferir e tirar etiqueta: os três comandos da família.", "A remoção só precisa da chave."],
      ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.small",
        "aws ec2 create-tags --resources <id-da-instância> --tags Key=Time,Value=dados Key=Projeto,Value=bi",
        "aws ec2 describe-tags",
        "aws ec2 delete-tags --resources <id-da-instância> --tags Key=Projeto"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-tags") &&
        Object.values(((c.ec2 || {}).tags) || {}).some((t) => t.Time === "dados" && t.Projeto === undefined)),
    d("ec2c-ip1", "ec2", 2, 80, "Reserve um endereço fixo",
      "O DNS aponta pra máquina, mas todo stop/start ela ganha um IP novo e o site cai. A solução começa por <b>reservar</b> um IP elástico na conta.",
      ["Reservar é `allocate-address`.", "O domínio é `vpc` — o EC2-Classic foi aposentado.", "Guarde o AllocationId que volta: é por ele que o IP é usado depois."],
      ["aws ec2 allocate-address --domain vpc"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "allocate-address")),
    d("ec2c-ip1b", "ec2", 2, 90, "O IP muda toda vez que reinicia",
      "Com o IP reservado, <b>grude</b> ele na instância — daqui pra frente o stop/start não muda mais o endereço.",
      ["Associar é `associate-address`, com o AllocationId e o id da instância.", "IP associado a máquina ligada é de graça; o que a AWS cobra é o parado."],
      ["aws ec2 associate-address --allocation-id <eip-id> --instance-id <id-da-instância>"],
      (c) => enderecos(c).some((e) => !!e.instancia && e.instancia !== "nat")),
    d("ec2c-ip2", "ec2", 3, 100, "Tem IP parado aí?",
      "Faxina de custo: reserve um segundo IP simulando uma migração antiga e liste os endereços pra <b>achar o que está sem máquina</b>. <small>(ao contrário do que parece, IP associado é de graça — o que a AWS cobra é o parado)</small>",
      ["A reserva é a mesma da atividade anterior.", "Listar é o `describe-addresses`; o parado é o que aparece SEM InstanceId."],
      ["aws ec2 allocate-address --domain vpc",
        "aws ec2 describe-addresses"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-addresses")),
    d("ec2c-ip2b", "ec2", 3, 100, "O IP parado que ninguém viu na fatura",
      "Achou o IP sem máquina. <b>Libere</b> ele — parado, ele cobra por hora e não serve pra nada.",
      ["Liberar é `release-address`, e ele exige o AllocationId.", "A AWS recusa liberar IP que ainda está associado."],
      ["aws ec2 release-address --allocation-id <eip-parado>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "release-address")),
    d("ec2c-ip3", "ec2", 3, 110, "A máquina foi aposentada, o IP ficou",
      "O servidor antigo vai ser desligado. Antes, <b>solte</b> o IP elástico dele e <b>libere</b> o endereço — senão ele fica cobrando sozinho depois que a máquina sumir.",
      ["Soltar é `disassociate-address`, pelo AssociationId (ele aparece no describe-addresses).", "Liberar é o mesmo `release-address` de antes — e só funciona depois de soltar."],
      ["aws ec2 disassociate-address --association-id <eip-assoc>",
        "aws ec2 release-address --allocation-id <eip-parado>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "release-address")),
    d("ec2c-fix-ip", "ec2", 3, 120, "Um IP fixo pro servidor de e-mail",
      "Servidor de e-mail precisa de IP fixo pra não cair em lista de spam. Reserve um, grude na máquina, confira na lista — e, como o servidor vai ser migrado, solte no fim.",
      ["Reservar, associar, listar e soltar: tudo desta trilha.", "O AssociationId pra soltar aparece na listagem."],
      ["aws ec2 allocate-address --domain vpc",
        "aws ec2 associate-address --allocation-id <eip-id> --instance-id <id-da-instância>",
        "aws ec2 describe-addresses",
        "aws ec2 disassociate-address --association-id <eip-assoc>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "disassociate-address")),
    d("ec2c-ami1", "ec2", 3, 120, "Backup antes de mexer em produção",
      "Você vai aplicar uma atualização arriscada e quer poder voltar atrás. Tire uma <b>imagem</b> da máquina chamada <b>antes-do-upgrade</b> — e <b>sem reiniciar</b> ela, porque é produção.",
      ["Imagem de máquina se chama AMI, e o comando é `create-image`.", "Por padrão a AWS REINICIA a máquina pra garantir disco consistente; a flag que evita isso diz exatamente isso no nome."],
      ["aws ec2 create-image --instance-id <id-da-instância> --name antes-do-upgrade --no-reboot"],
      (c) => imagens(c).some((im) => im.nome === "antes-do-upgrade" && im.semReboot)),
    d("ec2c-ami2", "ec2", 3, 90, "Quais imagens são minhas?",
      "Liste as imagens da conta. <small>(sem filtrar por dono a AWS devolveria dezenas de milhares de AMIs públicas — por isso o <code>--owners self</code> é quase obrigatório)</small>",
      ["O filtro de dono é `--owners`, e o valor pra 'minhas' é `self`.", "Repare no State: a imagem leva alguns minutos até ficar `available`."],
      ["aws ec2 describe-images --owners self"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-images")),
    d("ec2c-ami3", "ec2", 3, 100, "O upgrade deu certo: dê baixa no backup",
      "Uma semana de produção estável depois do upgrade. Dê <b>baixa</b> na imagem <b>antes-do-upgrade</b> — imagem velha acumula snapshot e snapshot aparece na fatura.",
      ["Dar baixa é `deregister-image`, pelo id da AMI (ele aparece no describe-images).", "Cuidado: a baixa NÃO apaga os snapshots por baixo — por isso existe o `--delete-associated-snapshots`."],
      ["aws ec2 deregister-image --image-id <ami-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "deregister-image") && !imagens(c).some((im) => im.nome === "antes-do-upgrade")),
    d("ec2c-fix-ami", "ec2", 3, 120, "O molde do servidor web",
      "Toda máquina web nova precisa nascer igual. Tire a imagem <b>base-servidor-web</b> da instância, confira que ela está entre as suas e — porque ainda vai mudar a configuração — dê baixa nela no fim.",
      ["Criar, listar e dar baixa: os três comandos de imagem.", "Aqui pode reiniciar: a máquina não é produção."],
      ["aws ec2 create-image --instance-id <id-da-instância> --name base-servidor-web",
        "aws ec2 describe-images --owners self",
        "aws ec2 deregister-image --image-id <ami-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "deregister-image") && !imagens(c).some((im) => im.nome === "base-servidor-web")),
    d("ec2c-size1", "ec2", 3, 100, "Compare antes de trocar",
      "O Compute Optimizer apontou: a instância usa 8% de CPU e está pagando por uma grande. Antes de mexer, compare <b>t3.micro</b> e <b>t3.small</b> — vCPU e memória de cada uma.",
      ["Existe um `describe-…` que mostra a ficha técnica de cada tipo.", "Os tipos vão em `--instance-types`, separados por espaço."],
      ["aws ec2 describe-instance-types --instance-types t3.micro t3.small"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-instance-types")),
    d("ec2c-size1b", "ec2", 3, 120, "Essa máquina está grande demais",
      "Comparado. Agora <b>pare</b> a máquina e troque ela pra <b>t3.small</b> — sem recriar nada e sem perder o disco.",
      ["Trocar o tipo EXIGE a máquina parada — a AWS recusa com a máquina ligada.", "O comando é `modify-instance-attribute`, com `--attribute instanceType --value <tipo>`."],
      ["aws ec2 stop-instances --instance-ids <id-da-instância>",
        "aws ec2 modify-instance-attribute --instance-id <id-da-instância> --attribute instanceType --value t3.small"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "modify-instance-attribute") &&
        ((instDe(c, (cmd.flags || {})["instance-id"]) || {}).tipo === "t3.small")),
    d("ec2c-reboot1", "ec2", 3, 100, "Reinicie sem perder o IP",
      "Máquina no tamanho novo. Ligue ela e, depois de aplicar a atualização do sistema, <b>reinicie</b> — sem stop/start, pra ela continuar no mesmo host e com o mesmo IP.",
      ["Ligar é o `start-instances` da trilha.", "Reiniciar é `reboot-instances`: NÃO é stop + start, a máquina fica no mesmo hardware."],
      ["aws ec2 start-instances --instance-ids <id-da-instância>",
        "aws ec2 reboot-instances --instance-ids <id-da-instância>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "reboot-instances")),
    d("ec2c-fix-ops", "ec2", 3, 140, "Rightsizing de ponta a ponta",
      "A máquina de testes de carga (<b>t3.medium</b>) passa o mês ociosa. Faça o ciclo completo: suba ela, compare com a <b>t3.small</b>, pare, troque o tipo, ligue, reinicie depois da atualização e confira a saúde no fim.",
      ["Nenhum comando novo — é a trilha inteira de operação numa tacada.", "A saúde é o describe-instance-status, agora apontando pra instância."],
      ["aws ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t3.medium",
        "aws ec2 describe-instance-types --instance-types t3.medium t3.small",
        "aws ec2 stop-instances --instance-ids <id-da-instância>",
        "aws ec2 modify-instance-attribute --instance-id <id-da-instância> --attribute instanceType --value t3.small",
        "aws ec2 start-instances --instance-ids <id-da-instância>",
        "aws ec2 reboot-instances --instance-ids <id-da-instância>",
        "aws ec2 describe-instance-status --instance-ids <id-da-instância>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-instance-status") &&
        ((instDe(c, (cmd.flags || {})["instance-ids"]) || {}).tipo === "t3.small")),
    d("ec2c-fecha1", "ec2", 3, 130, "Feche a porta 22 que ficou aberta",
      "A auditoria encontrou o grupo <b>acesso-ssh</b> com a porta <b>22</b> aberta pra <b>0.0.0.0/0</b> — o mundo inteiro. A trilha te ensinou a abrir; agora feche. <small>(o Session Manager da trilha de SSM é justamente o que substitui essa porta)</small>",
      ["Abrir é `authorize-…`; fechar é o oposto dele, com o mesmo formato de argumentos.", "Você precisa repetir protocolo, porta e faixa — é assim que a AWS sabe QUAL regra tirar.", "Se nada bater, a AWS não reclama: confira depois com describe-security-groups."],
      ["aws ec2 revoke-security-group-ingress --group-name acesso-ssh --protocol tcp --port 22 --cidr 0.0.0.0/0"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "revoke-security-group-ingress") && !!grupoPorNome(c, "acesso-ssh")),
    d("ec2c-fecha2", "ec2", 3, 110, "Restrinja também a saída",
      "Controle que quase ninguém aplica: por padrão a máquina pode falar com qualquer lugar da internet, o que é ótimo pra quem exfiltra dado. Crie o grupo <b>saida-restrita</b> e libere a saída <b>só</b> pra porta <b>443</b> dentro da rede <b>10.0.0.0/16</b>.",
      ["Regra de saída tem comando próprio: `authorize-security-group-egress`.", "O grupo precisa existir antes — crie com create-security-group."],
      ["aws ec2 create-security-group --group-name saida-restrita --description \"Saida controlada\"",
        "aws ec2 authorize-security-group-egress --group-name saida-restrita --protocol tcp --port 443 --cidr 10.0.0.0/16"],
      (c) => (((grupoPorNome(c, "saida-restrita") || {}).saida) || []).length >= 1),
    d("ec2c-fix-sg", "ec2", 3, 130, "O banco só fala com a rede interna",
      "Crie o grupo <b>banco-interno</b>. Por engano, alguém liberou a <b>3306</b> pra <b>10.0.0.0/16</b> antes da hora — reproduza, feche, e deixe só a saída pra <b>443</b> na rede interna.",
      ["Abrir entrada, fechar entrada e liberar saída: os três comandos de regra.", "Fechar pede exatamente os mesmos protocolo, porta e faixa que abriram."],
      ["aws ec2 create-security-group --group-name banco-interno --description \"Banco interno\"",
        "aws ec2 authorize-security-group-ingress --group-name banco-interno --protocol tcp --port 3306 --cidr 10.0.0.0/16",
        "aws ec2 revoke-security-group-ingress --group-name banco-interno --protocol tcp --port 3306 --cidr 10.0.0.0/16",
        "aws ec2 authorize-security-group-egress --group-name banco-interno --protocol tcp --port 443 --cidr 10.0.0.0/16"],
      (c, cmd, ok) => {
        const g = grupoPorNome(c, "banco-interno") || {};
        return ok && ehCmd(cmd, "ec2", "authorize-security-group-egress") && (g.regras || []).length === 0 && (g.saida || []).length >= 1;
      }),
    d("ec2c-limpa1", "ec2", 3, 90, "A chave que ninguém usa mais",
      "Fim de projeto. Apague o par de chaves <b>chave-backup</b>. <small>(apagar o par NÃO expulsa quem já tem o .pem — só impede novos usos)</small>",
      ["É o `delete-…` do par de chaves, pelo nome.", "Quem já tem o arquivo .pem continua entrando nas máquinas que subiram com ele."],
      ["aws ec2 delete-key-pair --key-name chave-backup"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-key-pair") && !(((c.ec2 || {}).keyPairs || {})["chave-backup"])),
    d("ec2c-limpa1b", "ec2", 3, 90, "O grupo que sobrou do projeto",
      "Do mesmo projeto sobrou o grupo <b>saida-restrita</b>, que nenhuma máquina usa. Apague.",
      ["É o `delete-…` do security group.", "A AWS recusa apagar grupo que alguma instância ainda usa — se acontecer, é dependência, não erro seu."],
      ["aws ec2 delete-security-group --group-name saida-restrita"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-security-group") && !grupoPorNome(c, "saida-restrita")),
    d("ec2c-fix-limpa", "ec2", 3, 110, "Faxina do laboratório de sexta",
      "O laboratório de sexta criou a chave <b>chave-temporaria</b> e o grupo <b>grupo-temporario</b>, e ninguém apagou. Recrie os dois (pra reproduzir) e faça a faxina.",
      ["Criar os dois é o que você já fez na trilha; apagar, nas duas atividades anteriores.", "O grupo pede uma descrição na criação."],
      ["aws ec2 create-key-pair --key-name chave-temporaria",
        "aws ec2 create-security-group --group-name grupo-temporario --description \"Lab de sexta\"",
        "aws ec2 delete-key-pair --key-name chave-temporaria",
        "aws ec2 delete-security-group --group-name grupo-temporario"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-security-group") &&
        !grupoPorNome(c, "grupo-temporario") && !(((c.ec2 || {}).keyPairs || {})["chave-temporaria"])),
  ]);

  // ----- NAT gateway entra na trilha de VPC, que é onde ele faz sentido -----
  at("cob-vpc-6", [
    d("ec2c-nat1", "vpc", 3, 90, "O IP próprio do NAT",
      "O banco está numa sub-rede <b>privada</b> — inalcançável de fora, como tem que ser. Mas ele precisa <b>sair</b> pra baixar atualização. Quem faz isso é o NAT gateway, e ele precisa de um IP público próprio: reserve um IP elástico.",
      ["Reservar IP é `allocate-address`, com `--domain vpc`.", "Guarde o AllocationId: o NAT vai usar."],
      ["aws ec2 allocate-address --domain vpc"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "allocate-address")),
    d("ec2c-nat1b", "vpc", 3, 130, "A sub-rede privada precisa baixar pacote",
      "Com o IP reservado, crie o <b>NAT gateway</b> numa sub-rede sua usando esse IP.",
      ["O NAT vai numa sub-rede PÚBLICA e serve a privada.", "O comando pede a sub-rede e a alocação do IP.", "Cuidado com a conta: o NAT cobra por hora E por GB que passa."],
      ["aws ec2 create-nat-gateway --subnet-id <subnet-id> --allocation-id <eip-id>"],
      (c) => nats(c).some((n) => n.estado === "available")),
    d("ec2c-nat2", "vpc", 3, 90, "Tem NAT ligado à toa?",
      "Clássico de fatura: NAT ligado num ambiente que ninguém usa há meses. Liste os NAT gateways da conta.",
      ["É o `describe-…` dos NAT gateways.", "Repare no State: `available` é ligado — e cobrando."],
      ["aws ec2 describe-nat-gateways"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-nat-gateways")),
    d("ec2c-nat2b", "vpc", 3, 110, "O NAT esquecido do ambiente de teste",
      "Achou o NAT do ambiente de teste. <b>Apague</b>. <small>(e lembre: o IP elástico dele continua seu, e parado ele cobra)</small>",
      ["Apagar pede o NatGatewayId, que aparece na listagem.", "Apagar o NAT não libera o IP elástico — são dois recursos separados na fatura."],
      ["aws ec2 delete-nat-gateway --nat-gateway-id <nat-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-nat-gateway") && nats(c).some((n) => n.estado === "deleted")),
    d("ec2c-fix-nat", "vpc", 3, 130, "NAT só durante a janela de atualização",
      "Pra economizar, o time decidiu ligar o NAT só na janela de atualização de domingo. Faça o ciclo da janela: reserve o IP, crie o NAT, confira que está ligado e apague no fim.",
      ["Reservar, criar, listar e apagar — os quatro comandos desta trilha pro NAT.", "O NAT novo usa o IP que você acabou de reservar."],
      ["aws ec2 allocate-address --domain vpc",
        "aws ec2 create-nat-gateway --subnet-id <subnet-id> --allocation-id <eip-id>",
        "aws ec2 describe-nat-gateways",
        "aws ec2 delete-nat-gateway --nat-gateway-id <nat-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-nat-gateway") && nats(c).filter((n) => n.estado === "deleted").length >= 2),
  ]);
})();
