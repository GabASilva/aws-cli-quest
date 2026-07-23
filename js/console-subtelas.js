"use strict";
// ============================================================
// CLImb — console-subtelas.js
// Subpáginas SIMULADAS do console (as entradas da nav lateral que eram
// placeholder). Capturadas ao vivo do console AWS real (us-east-1, 2026-07)
// + docs/referencia-console-aws.md. SOMENTE visual/simulação: nada aqui cria
// funcionalidade nova — listas mostram o estado REAL da conta virtual quando
// ele existe (security groups, key pairs, subnets, log groups...) e, quando
// não existe, o empty-state com o wording do console real.
//
// ADITIVO: console-aws.js chama window.cawsSubtela(sid, label, conta) dentro
// de telaSecao(); se devolvermos HTML, ele usa; senão cai no vazio genérico.
// Botões decorativos usam data-acao="st-aviso" (toast explicando).
// ============================================================
(function () {
  if (typeof window === "undefined") return;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  // id derivado determinístico (ex.: volume da instância i-abc -> vol-0...)
  function idDeriv(prefixo, semente) {
    let h1 = 0, h2 = 0;
    for (const ch of String(semente)) { h1 = (h1 * 31 + ch.charCodeAt(0)) >>> 0; h2 = (h2 * 37 + ch.charCodeAt(0) + 7) >>> 0; }
    return prefixo + "0" + (h1.toString(16) + h2.toString(16)).padStart(16, "0").slice(0, 16);
  }
  function dataCurta(iso) {
    if (!iso) return "—";
    try { const d = new Date(iso); return d.toISOString().slice(0, 10) + " " + d.toISOString().slice(11, 16) + " UTC"; } catch (e) { return String(iso); }
  }
  function az(c) { return (c.regiao || "us-east-1") + "a"; }
  function vpcPadrao(c) {
    const ids = c.vpc ? Object.keys(c.vpc.vpcs || {}) : [];
    return ids[0] || "vpc-0f00d1e00c11ab001";
  }

  // ---------- renderizador de lista no padrão Cloudscape ----------
  // o = { h1, n, primario, botoes[], tabs[], colunas[], linhas[][], emptyT,
  //       emptyD, busca, cli }
  function lista(o) {
    const cont = o.n == null ? "" : ` (${o.n})`;
    const secund = (o.botoes || []).map((b) => `<button class="caws-btn-secundario" data-acao="st-aviso">${esc(b)}</button>`).join("");
    const prim = o.primario ? `<button class="caws-btn-primario" data-acao="${esc(o.primAcao || "st-aviso")}"${o.primTela ? ` data-tela="${esc(o.primTela)}"` : ""}>${esc(o.primario)}</button>` : "";
    const tabs = (o.tabs || []).length
      ? `<div class="caws-st-tabs">${o.tabs.map((t, i) => `<button class="caws-st-tab${i === 0 ? " ativo" : ""}" data-acao="st-aviso">${esc(t)}</button>`).join("")}</div>`
      : "";
    const toolbar = `
      <div class="caws-st-toolbar">
        <input class="caws-st-busca" placeholder="${esc(o.busca || "Find resources")}" data-acao-inerte title="Busca decorativa — filtre pelo CLI 😉">
        <span class="caws-st-tools"><button class="caws-btn-secundario" data-acao="st-aviso" title="Refresh">⟳</button><span class="caws-st-pag">&lt; 1 &gt;</span><button class="caws-btn-secundario" data-acao="st-aviso" title="Preferences">⚙</button></span>
      </div>`;
    const linhas = (o.linhas && o.linhas.length)
      ? o.linhas.map((l) => `<tr>${l.map((cel) => `<td>${cel}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${o.colunas.length}" class="caws-vazio"><strong>${esc(o.emptyT || "No resources")}</strong><br>${esc(o.emptyD || "You don't have any resources in this Region.")}</td></tr>`;
    return `
      <div class="caws-pagina">
        <div class="caws-cab-servico"><h1>${esc(o.h1)}${cont} <span class="caws-info">Info</span></h1>
          <span class="caws-cab-acoes">${secund}${prim}</span></div>
        ${tabs}${toolbar}
        <table class="caws-tabela"><thead><tr>${o.colunas.map((cn) => `<th>${esc(cn)}</th>`).join("")}</tr></thead><tbody>${linhas}</tbody></table>
        ${o.cli && typeof dicaClivisivel !== "function" ? `<p class="caws-st-cli">💻 Equivalente na CLI: <code>${esc(o.cli)}</code></p>` : ""}
      </div>`;
  }
  // painel informativo (páginas que não são lista)
  function painelInfo(h1, blocos, primario) {
    return `
      <div class="caws-pagina">
        <div class="caws-cab-servico"><h1>${esc(h1)} <span class="caws-info">Info</span></h1>
          ${primario ? `<button class="caws-btn-primario" data-acao="st-aviso">${esc(primario)}</button>` : ""}</div>
        ${blocos.map((b) => `<div class="caws-st-painel">${b.t ? `<h2>${esc(b.t)}</h2>` : ""}${b.html || `<p>${esc(b.p)}</p>`}</div>`).join("")}
      </div>`;
  }

  // ---------- dados derivados do estado da conta ----------
  function instAtivas(c) {
    return Object.entries(c.ec2.instancias || {}).filter(([, i]) => i.estado !== "terminated");
  }
  // Volumes REAIS criados pela CLI (aws ec2 create-volume) + o volume raiz que
  // toda instância ganha. Assim o Console e a CLI mostram a mesma coisa.
  function linhasVolumes(c) {
    const reais = Object.values((c.ec2 || {}).volumes || {}).map((v) => [
      "—", esc(v.id), esc(v.tipo), v.tamanho + " GiB", v.tipo === "gp3" ? "3000" : "100", "125", "—",
      esc(dataCurta(v.criadoEm)), esc(v.az),
      v.instancia ? `<span class="caws-estado ok">● In-use</span>` : `<span class="caws-estado off">● Available</span>`,
      "—", esc(v.instancia || "—"), "✔", "Not encrypted", "—",
    ]);
    const raiz = instAtivas(c).map(([id, i]) => [
      "—", esc(idDeriv("vol-", id)), "gp3", "8 GiB", "3000", "125", "—", esc(dataCurta(i.criadaEm)), esc(az(c)),
      `<span class="caws-estado ok">● In-use</span>`, "—", esc(id), "✔", "Not encrypted", "—",
    ]);
    return reais.concat(raiz);
  }
  function linhasSnapshots(c) {
    return Object.values((c.ec2 || {}).snapshots || {}).map((s) => [
      "—", esc(s.id), s.tamanho + " GiB", s.tamanho + " GiB", esc(s.descricao || "—"), "Standard",
      `<span class="caws-estado ok">● Completed</span>`, esc(dataCurta(s.criadoEm)), "100%", "Not encrypted", "—",
    ]);
  }
  function linhasEni(c) {
    return instAtivas(c).map(([id, i]) => [
      "—", esc(idDeriv("eni-", id)), esc(Object.keys((c.vpc || {}).subnets || {})[0] || "subnet-0a1b2c3d4e5f60001"), esc(vpcPadrao(c)),
      esc(az(c)), "default", "interface", `Attached to ${esc(id)}`, esc(id), `<span class="caws-estado ok">● In-use</span>`, "—", "172.31.0." + (10 + (id.charCodeAt(id.length - 1) % 200)),
    ]);
  }
  function linhasSg(c) {
    return Object.values(c.ec2.securityGroups || {}).map((g) => [
      "—", esc(g.id), esc(g.nome), esc(vpcPadrao(c)), esc(g.descricao || "—"), "123456789012",
      String((g.regras || []).length), "1",
    ]);
  }
  function linhasKp(c) {
    return Object.entries(c.ec2.keyPairs || {}).map(([nome, k]) => [
      esc(nome), "rsa", esc(dataCurta(k.criadoEm)), `<code>${esc(k.fingerprint || "—")}</code>`, esc(k.keyPairId || idDeriv("key-", nome)),
    ]);
  }

  // ---------- especificações de tipos de instância (fiéis à AWS) ----------
  const TIPOS_SPEC = [
    ["t2.nano", "No", 1, "i386, x86_64", 0.5], ["t2.micro", "Yes", 1, "i386, x86_64", 1],
    ["t2.small", "No", 1, "i386, x86_64", 2], ["t2.medium", "No", 2, "i386, x86_64", 4],
    ["t2.large", "No", 2, "x86_64", 8], ["t3.nano", "No", 2, "x86_64", 0.5],
    ["t3.micro", "Yes", 2, "x86_64", 1], ["t3.small", "No", 2, "x86_64", 2],
    ["t3.medium", "No", 2, "x86_64", 4], ["t3.large", "No", 2, "x86_64", 8],
    ["m5.large", "No", 2, "x86_64", 8], ["c5.large", "No", 2, "x86_64", 4],
  ];

  // ============================================================
  // REGISTRO — chave "servico|Label exatamente como na nav"
  // ============================================================
  const R = {};

  // ---------------- EC2 ----------------
  R["ec2|AWS Global View"] = (c) => painelInfo("AWS Global View", [
    { t: "Resource counts", html: `<div class="caws-st-grid">${[
      ["Instances", instAtivas(c).length], ["VPCs", Object.keys((c.vpc || {}).vpcs || {}).length],
      ["Subnets", Object.keys((c.vpc || {}).subnets || {}).length], ["Security groups", Object.keys(c.ec2.securityGroups || {}).length],
      ["Volumes", instAtivas(c).length], ["Elastic IPs", 0],
    ].map(([l, n]) => `<div class="caws-st-card"><strong>${n}</strong><span>${esc(l)}</span></div>`).join("")}</div>` },
    { p: "AWS Global View permite ver seus recursos do EC2 e VPC em todas as regiões numa tela só. No CLImb, a conta simulada vive numa região por vez." },
  ]);
  R["ec2|Events"] = () => lista({
    h1: "Events", n: 0, busca: "Find events",
    botoes: ["Actions"], colunas: ["Name", "Resource ID", "Event status", "Event type", "Description", "Progress", "Duration", "Start time", "Deadline"],
    emptyT: "No scheduled events", emptyD: "You do not have any scheduled events in this region.",
  });
  R["ec2|Instance Types"] = (c) => lista({
    h1: "Instance types", n: TIPOS_SPEC.length, busca: "Find instance types",
    botoes: ["Instance type finder", "Actions"],
    colunas: ["Instance type", "Free tier eligible", "vCPUs", "Architecture", "Memory (GiB)", "Storage (GB)", "Storage type", "Network performance", "On-Demand Linux pricing"],
    linhas: TIPOS_SPEC.map(([t, free, vcpu, arch, mem]) => [
      `<strong>${esc(t)}</strong>`, free === "Yes" ? `<span class="caws-estado ok">✔ Yes</span>` : "No", String(vcpu), esc(arch), String(mem),
      "EBS only", "EBS", t.startsWith("t2") ? "Low to Moderate" : "Up to 5 Gigabit", "—",
    ]),
    cli: "aws ec2 describe-instance-types",
  });
  R["ec2|Launch Templates"] = () => lista({
    h1: "Launch templates", n: 0, primario: "Create launch template", busca: "Find launch template",
    colunas: ["Name", "Launch template ID", "Default version", "Latest version", "Created by", "Created time"],
    emptyT: "No launch templates", emptyD: "You do not have any launch templates in this region.",
  });
  R["ec2|Spot Requests"] = () => lista({
    h1: "Spot Requests", n: 0, primario: "Request Spot Instances", botoes: ["Pricing history", "Actions"], busca: "Find Spot Requests",
    colunas: ["Request ID", "Request type", "State", "Capacity", "Status", "Persistence", "Created", "vCPU-hours", "Memory (GiB)-hours", "Total Spot cost (USD)", "Total savings"],
    emptyT: "No Spot Requests", emptyD: "You do not have any Spot Requests in this region.",
  });
  R["ec2|Savings Plans"] = () => painelInfo("Savings Plans", [
    { t: "Save up to 72% on compute", p: "Savings Plans é um modelo de preços flexível: você se compromete com um uso por hora (USD/h) por 1 ou 3 anos e ganha desconto sobre o preço On-Demand. Aplica-se a EC2, Fargate e Lambda." },
    { p: "No CLImb nada gera custo — esta página existe pra você conhecer o conceito antes de encontrá-lo no console real." },
  ], "Purchase Savings Plans");
  R["ec2|Reserved Instances"] = () => lista({
    h1: "Reserved Instances", n: 0, primario: "Purchase Reserved Instances", botoes: ["Actions"], busca: "Find Reserved Instances",
    colunas: ["Reserved Instance ID", "Instance type", "Scope", "Availability Zone", "Instance count", "Start", "Expires", "Term", "Payment option", "Offering class", "State"],
    emptyT: "No Reserved Instances", emptyD: "You do not have any Reserved Instances in this region.",
  });
  R["ec2|Dedicated Hosts"] = () => lista({
    h1: "Dedicated Hosts", n: 0, primario: "Allocate Dedicated Host", botoes: ["Dedicated Host Reservations", "Actions"], busca: "Find Dedicated Hosts",
    colunas: ["Name", "Host ID", "Availability Zone", "State", "vCPU utilization", "Instance family", "Instance type", "Owner", "Auto-placement", "Host recovery", "Total vCPUs"],
    emptyT: "No Dedicated Hosts", emptyD: "You do not have any Dedicated Hosts in this region.",
  });
  R["ec2|Capacity Reservations"] = () => painelInfo("Capacity Reservations", [
    { t: "Capacity assurance without long-term commitments", p: "Reservas de capacidade garantem capacidade computacional para instâncias EC2 numa zona de disponibilidade específica, por qualquer período — sem contrato de longo prazo." },
    { t: "On-Demand Capacity Reservations (ODCRs)", p: "Crie uma reserva imediata ou agende para uma data futura. Ideal pra workloads críticos e eventos de escala. Também existem Capacity Blocks for ML, para agendar GPU em blocos." },
  ], "Create Capacity Reservation");
  R["ec2|AMIs"] = () => lista({
    h1: "AMIs", n: 0, botoes: ["Actions"], primario: "Launch instance from AMI", busca: "Find AMI by attribute or tag",
    tabs: ["Owned by me", "Private images", "Public images", "Disabled images"],
    colunas: ["Name", "AMI name", "AMI ID", "Source", "Owner", "Visibility", "Status", "Creation date", "Platform", "Root device type", "Virtualization"],
    emptyT: "No AMIs found", emptyD: "You do not own any AMIs. An AMI is a template that contains the software configuration required to launch your instance.",
  });
  R["ec2|AMI Catalog"] = () => `
    <div class="caws-pagina">
      <div class="caws-cab-servico"><h1>AMI Catalog <span class="caws-info">Info</span></h1></div>
      <p class="caws-st-sub">Uma AMI é um modelo com a configuração de software (SO, servidor de aplicações e aplicações) necessária pra executar sua instância. Selecione uma AMI fornecida pela AWS, pela comunidade ou pelo AWS Marketplace.</p>
      <div class="caws-st-tabs">
        <button class="caws-st-tab ativo" data-acao="st-aviso">Quickstart AMIs (46)</button>
        <button class="caws-st-tab" data-acao="st-aviso">My AMIs (0)</button>
        <button class="caws-st-tab" data-acao="st-aviso">AWS Marketplace AMIs (8039)</button>
        <button class="caws-st-tab" data-acao="st-aviso">Community AMIs (500)</button>
      </div>
      <div class="caws-st-grid amis">${[
        ["Amazon Linux", "Amazon Linux 2023 AMI kernel-6.18", "Free tier eligible", "ami-0abcd1234ef567890"],
        ["Ubuntu", "Ubuntu Server 24.04 LTS (HVM), SSD Volume Type", "Free tier eligible", "ami-0ubu2404lts000001"],
        ["Windows", "Microsoft Windows Server 2025 Base", "Free tier eligible", "ami-0win2025base00001"],
        ["Red Hat", "Red Hat Enterprise Linux 10 (HVM)", "Free tier eligible", "ami-0rhel1000hvm00001"],
        ["Debian", "Debian 13 (HVM), SSD Volume Type", "Free tier eligible", "ami-0deb13hvm00000001"],
        ["macOS", "macOS Tahoe 26", "Dedicated Host required", "ami-0mactahoe26000001"],
      ].map(([so, nome, selo, ami]) => `
        <div class="caws-st-card ami">
          <strong>${esc(so)}</strong><span>${esc(nome)}</span>
          <small><code>${esc(ami)}</code></small>
          <span class="caws-tag">${esc(selo)}</span>
          <button class="caws-btn-secundario" data-acao="ec2-form-launch">Select</button>
        </div>`).join("")}
      </div>
    </div>`;
  R["ec2|Volumes"] = (c) => lista({
    h1: "Volumes", n: linhasVolumes(c).length, primario: "Create volume", botoes: ["Actions"], busca: "Find volume by attribute or tag",
    colunas: ["Name", "Volume ID", "Type", "Size", "IOPS", "Throughput", "Snapshot ID", "Created", "Availability Zone", "Volume state", "Alarm status", "Attached resources", "Status check", "Encryption", "KMS key ID"],
    linhas: linhasVolumes(c),
    emptyT: "No volumes", emptyD: "You do not have any volumes in this region. Every running instance gets a root EBS volume.",
    cli: "aws ec2 describe-volumes",
  });
  R["ec2|Snapshots"] = (c) => lista({
    h1: "Snapshots", n: linhasSnapshots(c).length, primario: "Create snapshot", botoes: ["Actions"], busca: "Find snapshot",
    tabs: ["Owned by me", "Private snapshots", "Public snapshots"],
    colunas: ["Name", "Snapshot ID", "Full snapshot size", "Volume size", "Description", "Storage tier", "Snapshot status", "Started", "Progress", "Encryption", "KMS key ID"],
    linhas: linhasSnapshots(c),
    emptyT: "No snapshots", emptyD: "You do not have any snapshots in this region.",
    cli: "aws ec2 create-snapshot --volume-id vol-xxxx",
  });
  R["ec2|Lifecycle Manager"] = () => painelInfo("Amazon Data Lifecycle Manager", [
    { t: "Automate snapshot and AMI lifecycles", p: "O Data Lifecycle Manager automatiza a criação, retenção e exclusão de snapshots do EBS e de AMIs. Escolha um tipo de política: EBS snapshot policy, EBS-backed AMI policy ou Cross-account copy event policy." },
  ], "Create lifecycle policy");
  R["ec2|Security Groups"] = (c) => lista({
    h1: "Security Groups", n: linhasSg(c).length, primario: "Create security group", botoes: ["Actions"], busca: "Find security group",
    colunas: ["Name", "Security group ID", "Security group name", "VPC ID", "Description", "Owner", "Inbound rules count", "Outbound rules count"],
    linhas: linhasSg(c),
    emptyT: "No security groups", emptyD: "You do not have any security groups in this region.",
    cli: "aws ec2 describe-security-groups",
  });
  R["ec2|Elastic IPs"] = () => lista({
    h1: "Elastic IP addresses", n: 0, primario: "Allocate Elastic IP address", botoes: ["Actions"], busca: "Find Elastic IP",
    colunas: ["Name", "Allocated IPv4 address", "Type", "Allocation ID", "Reverse DNS record", "Associated instance ID", "Private IP address", "Association ID", "Network border group"],
    emptyT: "No Elastic IP addresses", emptyD: "You do not have any Elastic IP addresses in this region.",
  });
  R["ec2|Placement Groups"] = () => lista({
    h1: "Placement groups", n: 0, primario: "Create placement group", botoes: ["Actions"], busca: "Find placement group",
    colunas: ["Group name", "Group Id", "Strategy", "State", "Partition", "Group ARN", "Parent group ID"],
    emptyT: "No placement groups", emptyD: "You do not have any placement groups in this region.",
  });
  R["ec2|Key Pairs"] = (c) => lista({
    h1: "Key pairs", n: linhasKp(c).length, primario: "Create key pair", botoes: ["Import key pair", "Actions"], busca: "Find key pair",
    colunas: ["Name", "Type", "Created", "Fingerprint", "ID"],
    linhas: linhasKp(c),
    emptyT: "No key pairs", emptyD: "You do not have any key pairs in this region.",
    cli: "aws ec2 describe-key-pairs",
  });
  R["ec2|Network Interfaces"] = (c) => lista({
    h1: "Network Interfaces", n: linhasEni(c).length, primario: "Create network interface", botoes: ["Actions"], busca: "Find network interface",
    colunas: ["Name", "Network interface ID", "Subnet ID", "VPC ID", "Availability Zone", "Security group names", "Interface Type", "Description", "Instance ID", "Status", "Public IPv4 address", "Primary private IPv4 address"],
    linhas: linhasEni(c),
    emptyT: "No network interfaces", emptyD: "You do not have any network interfaces in this region. Every running instance gets a primary network interface (eni).",
  });
  R["ec2|Load Balancers"] = () => lista({
    h1: "Load balancers", n: 0, primario: "Create load balancer", botoes: ["Actions"], busca: "Find load balancer",
    colunas: ["Name", "State", "Type", "Scheme", "IP address type", "VPC ID", "Availability Zones", "Security groups", "DNS name", "Date created"],
    emptyT: "No load balancers", emptyD: "You do not have any load balancers in this region.",
  });
  R["ec2|Target Groups"] = () => lista({
    h1: "Target groups", n: 0, primario: "Create target group", botoes: ["Actions"], busca: "Find target group",
    colunas: ["Name", "ARN", "Port", "Protocol", "Target type", "Load balancer", "VPC ID"],
    emptyT: "No target groups", emptyD: "You do not have any target groups in this region.",
  });
  R["ec2|Auto Scaling Groups"] = () => lista({
    h1: "Auto Scaling groups", n: 0, primario: "Create Auto Scaling group", busca: "Find Auto Scaling group",
    colunas: ["Name", "Launch template/configuration", "Instances", "Status", "Desired capacity", "Min", "Max", "Availability Zones"],
    emptyT: "No Auto Scaling groups", emptyD: "You do not have any Auto Scaling groups in this region.",
  });

  // ---------------- S3 ----------------
  R["s3|Directory buckets"] = () => lista({
    h1: "Directory buckets", n: 0, primario: "Create bucket", botoes: ["Copy ARN", "Empty", "Delete"], busca: "Find buckets by name",
    colunas: ["Name", "AWS Region", "Availability Zone", "Creation date"],
    emptyT: "No directory buckets", emptyD: "Directory buckets (S3 Express One Zone) armazenam dados numa única AZ para latência de milissegundos de um dígito.",
  });
  R["s3|Table buckets"] = () => lista({
    h1: "Table buckets", n: 0, primario: "Create table bucket", busca: "Find table buckets",
    colunas: ["Name", "ARN", "Creation date"],
    emptyT: "No table buckets", emptyD: "S3 Tables entregam armazenamento otimizado para dados tabulares (Apache Iceberg).",
  });
  R["s3|Vector buckets"] = () => lista({
    h1: "Vector buckets", n: 0, primario: "Create vector bucket", busca: "Find vector buckets",
    colunas: ["Name", "ARN", "Creation date"],
    emptyT: "No vector buckets", emptyD: "S3 Vectors armazena e consulta embeddings vetoriais para aplicações de IA.",
  });
  R["s3|File systems"] = () => lista({
    h1: "File systems", n: 0, busca: "Find file systems",
    colunas: ["Name", "File system ID", "Type", "Status", "Storage used"],
    emptyT: "No file systems", emptyD: "Sistemas de arquivos do Amazon FSx aparecem aqui.",
  });
  R["s3|Access Points"] = () => lista({
    h1: "Access Points", n: 0, primario: "Create access point", busca: "Find access points by name",
    colunas: ["Access Point name", "Bucket name", "Access", "Network origin"],
    emptyT: "No access points", emptyD: "Access points simplificam o acesso compartilhado a um bucket com políticas próprias por aplicação.",
  });
  R["s3|Access Points for FSx"] = () => lista({
    h1: "Access Points for FSx", n: 0, primario: "Create access point", busca: "Find access points",
    colunas: ["Access Point name", "File system", "Status", "Creation date"],
    emptyT: "No access points", emptyD: "Acesse dados do FSx for OpenZFS usando as APIs do S3.",
  });
  R["s3|Access Grants"] = () => painelInfo("Access Grants", [
    { t: "Manage access to your S3 data", p: "S3 Access Grants mapeia identidades (IAM ou corporativas, via IAM Identity Center) a permissões em buckets e prefixos — acesso granular sem escrever políticas gigantes." },
  ], "Create S3 Access Grants instance");
  R["s3|IAM Access Analyzer"] = () => lista({
    h1: "IAM Access Analyzer for S3", n: 0, busca: "Find findings",
    colunas: ["Bucket", "Shared through", "Shared with", "Access level"],
    emptyT: "No findings", emptyD: "O Access Analyzer alerta sobre buckets compartilhados publicamente ou com contas externas.",
  });
  R["s3|Storage Lens"] = (c) => {
    let objetos = 0, bytes = 0;
    for (const b of Object.values(c.s3.buckets || {})) for (const o of Object.values(b.objetos || {})) { objetos++; bytes += (o.tamanho || 0); }
    const kb = (bytes / 1024).toFixed(1);
    return painelInfo("S3 Storage Lens", [
      { t: "Account snapshot (updated daily)", html: `<div class="caws-st-grid">${[
        ["Total storage", kb + " KB"], ["Object count", String(objetos)],
        ["Buckets", String(Object.keys(c.s3.buckets || {}).length)], ["Avg. object size", objetos ? (bytes / objetos / 1024).toFixed(1) + " KB" : "—"],
      ].map(([l, n]) => `<div class="caws-st-card"><strong>${esc(n)}</strong><span>${esc(l)}</span></div>`).join("")}</div>` },
      { t: "Dashboards", p: "default-account-dashboard — visão de uso e atividade de armazenamento de toda a conta (28 métricas gratuitas, retenção de 14 dias)." },
    ], "Create dashboard");
  };
  R["s3|Batch Operations"] = () => lista({
    h1: "Batch Operations", n: 0, primario: "Create job", botoes: ["Run job", "Actions", "Clone job"], busca: "Find jobs",
    colunas: ["Job ID", "Status", "Description", "Operation", "Creation date", "Total objects", "% complete", "Total failed (rate)", "Priority"],
    emptyT: "No jobs", emptyD: "Um job executa uma operação em lote (copiar, etiquetar, restaurar...) numa lista de objetos do S3.",
  });
  R["s3|Account and organization settings"] = () => painelInfo("Account and organization settings", [
    { t: "Block Public Access (account level)", p: "Bloqueio de acesso público no nível da CONTA: sobrepõe qualquer política de bucket. As 4 opções (novas ACLs, quaisquer ACLs, novas políticas, quaisquer políticas) vêm LIGADAS por padrão." },
    { t: "Storage Lens default dashboard", p: "O dashboard padrão da conta fica habilitado com as métricas gratuitas." },
  ]);
  R["s3|AWS Marketplace for S3"] = () => painelInfo("AWS Marketplace for S3", [
    { p: "Soluções de terceiros integradas ao S3 (backup, análise, segurança, migração) disponíveis no AWS Marketplace." },
  ]);

  // ---------------- IAM ----------------
  R["iam|Roles"] = (c) => {
    const linhas = Object.entries(c.iam.roles || {}).map(([nome, r]) => [
      `<strong>${esc(nome)}</strong>`, "AWS Service: ec2", "—",
    ]);
    return lista({
      h1: "Roles", n: linhas.length, primario: "Create role", botoes: ["Delete"], busca: "Search roles by name",
      colunas: ["Role name", "Trusted entities", "Last activity"], linhas,
      emptyT: "No roles", emptyD: "Roles são identidades com permissões temporárias que serviços e usuários podem assumir.",
      cli: "aws iam list-roles",
    });
  };
  R["iam|Policies"] = (c) => {
    const proprias = Object.entries(c.iam.policies || {}).map(([nome]) => [
      `<strong>${esc(nome)}</strong>`, "Customer managed", "—", "—",
    ]);
    const daAws = [["AmazonS3ReadOnlyAccess"], ["AmazonEC2FullAccess"], ["AWSLambdaBasicExecutionRole"], ["AmazonDynamoDBReadOnlyAccess"], ["ReadOnlyAccess"]]
      .map(([n]) => [esc(n), "AWS managed", "—", "Provides read-only/full access managed by AWS"]);
    return lista({
      h1: "Policies", n: proprias.length + 1500, primario: "Create policy", botoes: ["Actions"], busca: "Filter policies by property or policy name",
      colunas: ["Policy name", "Type", "Used as", "Description"], linhas: proprias.concat(daAws),
      cli: "aws iam list-policies --scope Local",
    });
  };
  R["iam|IAM user groups"] = (c) => {
    const linhas = Object.entries(c.iam.grupos || {}).map(([nome, g]) => [
      `<strong>${esc(nome)}</strong>`, String((g.membros || []).length), String((g.politicas || []).length) + " policies", esc(dataCurta(g.criadoEm)),
    ]);
    return lista({
      h1: "User groups", n: linhas.length, primario: "Create group", botoes: ["Delete"], busca: "Search groups by name",
      colunas: ["Group name", "Users", "Permissions", "Creation time"], linhas,
      emptyT: "No groups", emptyD: "Grupos permitem aplicar o mesmo conjunto de permissões a vários usuários.",
      cli: "aws iam list-groups",
    });
  };
  R["iam|Identity providers"] = () => lista({
    h1: "Identity providers", n: 0, primario: "Add provider", busca: "Search identity providers",
    colunas: ["Name", "Type", "Creation time"],
    emptyT: "No identity providers", emptyD: "Federar um IdP (SAML ou OpenID Connect) permite login sem criar usuários IAM.",
  });
  R["iam|Account settings"] = () => painelInfo("Account settings", [
    { t: "Password policy", p: "Política padrão: mínimo de 8 caracteres, incluir ao menos 3 dos 4 tipos (maiúsculas, minúsculas, números, não alfanuméricos), nunca expirar, não pode ser igual ao nome da conta ou e-mail. Botão Edit permite personalizar." },
    { t: "Security Token Service (STS)", p: "O STS emite credenciais temporárias para usuários confiáveis. Endpoints regionais do STS podem ser ativados/desativados por região; o endpoint global fica em us-east-1." },
  ]);
  R["iam|Root access management"] = () => painelInfo("Root access management", [
    { p: "Gerencie centralmente o acesso root das contas-membro da organização: remover credenciais root, impedir recuperação de senha e executar ações privilegiadas pontuais." },
  ]);
  R["iam|Access Analyzer"] = () => lista({
    h1: "Access Analyzer", n: 0, primario: "Create analyzer", busca: "Find findings",
    colunas: ["Finding ID", "Resource", "Resource type", "External principal", "Condition", "Shared through", "Status"],
    emptyT: "No analyzers", emptyD: "O Access Analyzer identifica recursos compartilhados com entidades externas e acessos não utilizados.",
  });
  R["iam|Credential report"] = () => painelInfo("Credential report", [
    { t: "IAM users credential report", p: "O relatório lista todos os usuários IAM da conta e o status das credenciais (senha, chaves de acesso, MFA). Depois de gerado, fica disponível por até 4 horas. Formato CSV." },
  ], "Download credentials report");
  R["iam|Organization activity"] = () => painelInfo("Organization activity", [
    { p: "Veja a atividade de serviços das contas da sua organização pra identificar permissões concedidas mas não usadas." },
  ]);
  R["iam|Service control policies"] = () => painelInfo("Service control policies (SCPs)", [
    { p: "SCPs são políticas da organização que definem o TETO de permissões das contas-membro. Não concedem permissões — limitam o que as políticas IAM podem permitir." },
  ]);

  // ---------------- VPC ----------------
  R["vpc|AWS Global View"] = R["ec2|AWS Global View"];
  R["vpc|Subnets"] = (c) => {
    const linhas = Object.values((c.vpc || {}).subnets || {}).map((s) => [
      "—", esc(s.id), `<span class="caws-estado ok">● Available</span>`, esc(s.vpc), esc(s.cidr), "—", "250", esc(s.az || az(c)), "main", "default", "No",
    ]);
    return lista({
      h1: "Subnets", n: linhas.length, primario: "Create subnet", botoes: ["Actions"], busca: "Find subnet",
      colunas: ["Name", "Subnet ID", "State", "VPC", "IPv4 CIDR", "IPv6 CIDR", "Available IPv4 addresses", "Availability Zone", "Route table", "Network ACL", "Default subnet"],
      linhas, emptyT: "No subnets", emptyD: "You do not have any subnets in this region.",
      cli: "aws ec2 describe-subnets",
    });
  };
  R["vpc|Route tables"] = (c) => {
    const linhas = Object.values((c.vpc || {}).vpcs || {}).map((v) => [
      "—", esc(idDeriv("rtb-", v.id)), "—", "—", "Yes", esc(v.id), "123456789012",
    ]);
    return lista({
      h1: "Route tables", n: linhas.length, primario: "Create route table", botoes: ["Actions"], busca: "Find route table",
      colunas: ["Name", "Route table ID", "Explicit subnet associations", "Edge associations", "Main", "VPC", "Owner ID"],
      linhas, emptyT: "No route tables", emptyD: "Cada VPC tem uma route table principal criada automaticamente.",
    });
  };
  R["vpc|Internet gateways"] = (c) => {
    const igws = (c.vpc || {}).igws || {};
    const linhas = Object.values(igws).map((g) => [
      "—", esc(g.id || "igw-—"), g.vpc ? `<span class="caws-estado ok">● Attached</span>` : `<span class="caws-estado off">● Detached</span>`, esc(g.vpc || "—"), "123456789012",
    ]);
    return lista({
      h1: "Internet gateways", n: linhas.length, primario: "Create internet gateway", botoes: ["Actions"], busca: "Find internet gateway",
      colunas: ["Name", "Internet gateway ID", "State", "VPC ID", "Owner"],
      linhas, emptyT: "No internet gateways", emptyD: "You do not have any internet gateways in this region.",
      cli: "aws ec2 create-internet-gateway",
    });
  };
  R["vpc|Egress-only internet gateways"] = () => lista({
    h1: "Egress-only internet gateways", n: 0, primario: "Create egress only internet gateway", busca: "Find egress-only internet gateway",
    colunas: ["Name", "Egress-only internet gateway ID", "State", "VPC", "Owner"],
    emptyT: "No egress-only internet gateways", emptyD: "Permitem saída IPv6 da VPC sem aceitar conexões de entrada.",
  });
  R["vpc|Carrier gateways"] = () => lista({
    h1: "Carrier gateways", n: 0, primario: "Create carrier gateway", busca: "Find carrier gateway",
    colunas: ["Name", "Carrier gateway ID", "State", "VPC", "Owner"],
    emptyT: "No carrier gateways", emptyD: "Usados com AWS Wavelength para tráfego da rede da operadora.",
  });
  R["vpc|DHCP option sets"] = (c) => lista({
    h1: "DHCP option sets", n: 1, primario: "Create DHCP option set", busca: "Find DHCP option set",
    colunas: ["Name", "DHCP option set ID", "Owner"],
    linhas: [["—", esc(idDeriv("dopt-", "default" + (c.regiao || ""))), "123456789012"]],
  });
  R["vpc|Elastic IPs"] = R["ec2|Elastic IPs"];
  R["vpc|Managed prefix lists"] = (c) => lista({
    h1: "Managed prefix lists", n: 2, primario: "Create prefix list", busca: "Find prefix list",
    colunas: ["Name", "Prefix list ID", "Max entries", "Address family", "State"],
    linhas: [
      [`com.amazonaws.${esc(c.regiao || "us-east-1")}.s3`, esc(idDeriv("pl-", "s3")), "—", "IPv4", `<span class="caws-estado ok">● Create complete</span>`],
      [`com.amazonaws.${esc(c.regiao || "us-east-1")}.dynamodb`, esc(idDeriv("pl-", "ddb")), "—", "IPv4", `<span class="caws-estado ok">● Create complete</span>`],
    ],
  });
  R["vpc|NAT gateways"] = () => lista({
    h1: "NAT gateways", n: 0, primario: "Create NAT gateway", busca: "Find NAT gateway",
    colunas: ["Name", "NAT gateway ID", "Connectivity type", "State", "Primary public IPv4 address", "Primary private IPv4 address", "VPC", "Subnet", "Created"],
    emptyT: "No NAT gateways", emptyD: "NAT gateways dão saída à internet pra sub-redes privadas.",
  });
  R["vpc|Peering connections"] = () => lista({
    h1: "Peering connections", n: 0, primario: "Create peering connection", busca: "Find peering connection",
    colunas: ["Name", "Peering connection ID", "Status", "Requester VPC", "Accepter VPC"],
    emptyT: "No peering connections", emptyD: "Peering conecta duas VPCs para tráfego privado entre elas.",
  });
  R["vpc|Network ACLs"] = (c) => {
    const linhas = Object.values((c.vpc || {}).vpcs || {}).map((v) => [
      "—", esc(idDeriv("acl-", v.id)), "—", "Yes", esc(v.id), "2", "2", "123456789012",
    ]);
    return lista({
      h1: "Network ACLs", n: linhas.length, primario: "Create network ACL", busca: "Find network ACL",
      colunas: ["Name", "Network ACL ID", "Associated with", "Default", "VPC ID", "Inbound rules count", "Outbound rules count", "Owner"],
      linhas, emptyT: "No network ACLs", emptyD: "Cada VPC ganha uma network ACL padrão que permite todo o tráfego.",
    });
  };
  R["vpc|Security groups"] = R["ec2|Security Groups"];
  R["vpc|Endpoints"] = () => lista({
    h1: "Endpoints", n: 0, primario: "Create endpoint", botoes: ["Actions"], busca: "Find endpoint",
    colunas: ["Name", "VPC endpoint ID", "Endpoint type", "Status", "Service name", "VPC ID", "Creation time"],
    emptyT: "No endpoints", emptyD: "VPC endpoints conectam sua VPC a serviços AWS sem passar pela internet.",
  });
  R["vpc|Endpoint services"] = () => lista({
    h1: "Endpoint services", n: 0, primario: "Create endpoint service", busca: "Find endpoint service",
    colunas: ["Name", "Service ID", "Service name", "Service state", "Available Availability Zones"],
    emptyT: "No endpoint services", emptyD: "Exponha um serviço seu para outras VPCs via PrivateLink.",
  });

  // ---------------- RDS ----------------
  R["rds|Snapshots"] = () => lista({
    h1: "Snapshots", n: 0, primario: "Take snapshot", botoes: ["Actions"], busca: "Find snapshots",
    tabs: ["Manual", "System", "Shared with me", "Public", "Backup service", "Exports in Amazon S3"],
    colunas: ["Snapshot name", "Engine version", "DB cluster or instance", "Snapshot creation time", "Status", "Progress", "VPC", "Snapshot type", "Storage", "Zone", "Encrypted"],
    emptyT: "No snapshots", emptyD: "Manual snapshots ficam até você excluir; automáticos seguem a janela de retenção.",
  });
  R["rds|Query editor"] = () => painelInfo("Query editor", [
    { t: "Connect to a database", p: "O query editor roda SQL direto no console em bancos Aurora Serverless com a Data API habilitada. Escolha o cluster, informe credenciais (ou Secrets Manager) e execute consultas." },
  ], "Connect to database");
  R["rds|Performance insights"] = () => painelInfo("Performance Insights", [
    { p: "Painel de análise de carga do banco: gráfico de sessões ativas médias (AAS), top SQL, waits e hosts. Disponível por instância com o recurso habilitado." },
  ]);
  R["rds|Automated backups"] = () => lista({
    h1: "Automated backups", n: 0, busca: "Find automated backups",
    tabs: ["Current region", "Replicated backups", "Retained"],
    colunas: ["DB instance", "Region & AZ", "Status", "Engine", "Earliest restorable time", "Latest restorable time"],
    emptyT: "No automated backups", emptyD: "Backups automáticos aparecem para instâncias com retenção > 0 dias.",
  });
  R["rds|Reserved instances"] = () => lista({
    h1: "Reserved DB instances", n: 0, primario: "Purchase reserved DB instance", busca: "Find reserved instances",
    colunas: ["Reserved instance ID", "DB instance class", "Engine", "Multi-AZ", "Term", "Offering type", "Status", "Expires"],
    emptyT: "No reserved DB instances", emptyD: "Reserve 1 ou 3 anos de uso com desconto sobre o On-Demand.",
  });
  R["rds|Proxies"] = () => lista({
    h1: "Proxies", n: 0, primario: "Create proxy", busca: "Find proxies",
    colunas: ["Proxy identifier", "Status", "Engine compatibility", "VPC"],
    emptyT: "No proxies", emptyD: "RDS Proxy multiplexa conexões e melhora a resiliência de aplicações serverless.",
  });
  R["rds|Subnet groups"] = () => lista({
    h1: "Subnet groups", n: 0, primario: "Create DB subnet group", botoes: ["Edit", "Delete"], busca: "Find subnet groups",
    colunas: ["Name", "Description", "Status", "VPC"],
    emptyT: "No DB subnet groups", emptyD: "You don't have any DB subnet groups.",
  });
  R["rds|Parameter groups"] = (c) => {
    const engines = [...new Set(Object.values((c.rds || {}).instancias || {}).map((db) => db.engine))];
    const linhas = engines.map((e) => [
      `default.${esc(e)}`, esc(e), "DB parameter group", `Default parameter group for ${esc(e)}`,
    ]);
    return lista({
      h1: "Parameter groups", n: linhas.length, primario: "Create parameter group", busca: "Find parameter groups",
      colunas: ["Name", "Family", "Type", "Description"], linhas,
      emptyT: "No parameter groups", emptyD: "Ao criar um banco, ele usa o parameter group default da família do engine.",
    });
  };
  R["rds|Option groups"] = (c) => {
    const engines = [...new Set(Object.values((c.rds || {}).instancias || {}).map((db) => db.engine))];
    const linhas = engines.map((e) => [
      `default:${esc(String(e).replace(/\./g, "-"))}`, `Default option group for ${esc(e)}`, esc(e), "—",
    ]);
    return lista({
      h1: "Option groups", n: linhas.length, primario: "Create group", busca: "Find option groups",
      colunas: ["Name", "Description", "Engine", "Engine version"], linhas,
      emptyT: "No option groups", emptyD: "Option groups habilitam recursos extras do engine (ex.: auditoria).",
    });
  };
  R["rds|Events"] = (c) => {
    const linhas = Object.values((c.rds || {}).instancias || {}).map((db) => [
      esc(db.id), "DB instance", esc(dataCurta(db.criadaEm)), "DB instance created",
    ]);
    return lista({
      h1: "Events", n: linhas.length, busca: "Filter events",
      colunas: ["Source", "Type", "Time", "Message"], linhas,
      emptyT: "No events", emptyD: "Eventos das últimas 24h (criação, backup, failover...) aparecem aqui.",
    });
  };
  R["rds|Event subscriptions"] = () => lista({
    h1: "Event subscriptions", n: 0, primario: "Create event subscription", busca: "Find event subscriptions",
    colunas: ["Name", "Status", "Creation time", "SNS topic"],
    emptyT: "No event subscriptions", emptyD: "Receba notificações (via SNS) de eventos do RDS.",
  });
  R["rds|Exports in Amazon S3"] = () => lista({
    h1: "Exports in Amazon S3", n: 0, busca: "Find exports",
    colunas: ["Export", "Source", "Status", "Exported data", "S3 bucket", "Export time"],
    emptyT: "No exports", emptyD: "Exporte dados de snapshots para o S3 em formato Parquet.",
  });

  // ---------------- CloudWatch ----------------
  R["cloudwatch|Dashboards"] = () => lista({
    h1: "Custom dashboards", n: 0, primario: "Create dashboard", botoes: ["Share dashboard", "Delete"], busca: "Find dashboards",
    tabs: ["Custom dashboards", "Automatic dashboards"],
    colunas: ["Name", "Sharing", "Favorite", "Last updated (UTC)"],
    emptyT: "No dashboards", emptyD: "Dashboards agrupam gráficos de métricas e logs numa visão única.",
  });
  R["cloudwatch|Log groups"] = (c) => {
    const grupos = (c.logs || {}).grupos || {};
    const linhas = Object.values(grupos).map((g) => [
      `<strong>${esc(g.nome)}</strong>`, "Standard", "—", "—", "—", "Never expire", "0", "—", "0",
    ]);
    return lista({
      h1: "Log groups", n: linhas.length, primario: "Create log group", botoes: ["Actions"], busca: "Filter log groups or try prefix search",
      colunas: ["Log group", "Log class", "Anomaly detection", "Deletion protection", "Data protection", "Retention", "Metric filters", "Contributor Insights", "Subscription filters"],
      linhas, emptyT: "No log groups", emptyD: "You do not have any log groups in this region.",
      cli: "aws logs create-log-group --log-group-name /climb/app",
    });
  };
  R["cloudwatch|Logs Insights"] = () => `
    <div class="caws-pagina">
      <div class="caws-cab-servico"><h1>Logs Insights <span class="caws-info">Info</span></h1>
        <button class="caws-btn-primario" data-acao="st-aviso">Run query</button></div>
      <div class="caws-st-painel"><h2>Selected log groups (0)</h2><p>Selecione até 50 log groups pra consultar.</p></div>
      <div class="caws-st-painel"><h2>Query</h2>
        <pre class="caws-st-editor">fields @timestamp, @message, @logStream, @log
| sort @timestamp desc
| limit 10000</pre>
        <p>Linguagem de consulta própria (Logs Insights QL) com stats, filter, parse e regex.</p></div>
    </div>`;
  R["cloudwatch|All metrics"] = (c) => {
    const ns = [
      ["AWS/EC2", instAtivas(c).length], ["AWS/S3", Object.keys(c.s3.buckets || {}).length],
      ["AWS/Lambda", Object.keys(c.lambda.funcoes || {}).length], ["AWS/DynamoDB", Object.keys(c.dynamodb.tabelas || {}).length],
      ["AWS/RDS", Object.keys((c.rds || {}).instancias || {}).length], ["AWS/SNS", Object.keys((c.sns || {}).topicos || {}).length],
    ].filter(([, n]) => n > 0);
    return painelInfo("All metrics", [
      { t: "Browse namespaces", html: ns.length
        ? `<div class="caws-st-grid">${ns.map(([n, q]) => `<div class="caws-st-card"><strong>${esc(n)}</strong><span>${q} recurso(s) emitindo métricas</span></div>`).join("")}</div>`
        : "<p>Nenhum namespace com métricas ainda — crie recursos (EC2, S3, Lambda...) e eles aparecem aqui.</p>" },
      { p: "No console real você navega por namespace → dimensão → métrica e plota gráficos com períodos e estatísticas (Average, Sum, p99...)." },
    ]);
  };
  R["cloudwatch|Explorer"] = () => painelInfo("Metrics Explorer", [
    { p: "Explore métricas por TAGS e propriedades de recursos (ex.: todas as instâncias com tag ambiente=prod) em vez de escolher recurso por recurso." },
  ]);

  // ---------------- Lambda ----------------
  R["lambda|Applications"] = () => lista({
    h1: "Applications", n: 0, primario: "Create application", botoes: ["Delete"], busca: "Find applications",
    colunas: ["Name", "Description", "Status", "Last modified"],
    emptyT: "No applications", emptyD: "You don't have any serverless applications yet. Applications agrupam funções, filas e tabelas de uma solução (via SAM/CloudFormation).",
  });
  R["lambda|Layers"] = () => lista({
    h1: "Layers", n: 0, primario: "Create layer", botoes: ["Delete"], busca: "Find layers",
    colunas: ["Name", "Version", "Description", "Compatible runtimes", "Compatible architectures", "Created"],
    emptyT: "No layers", emptyD: "Layers empacotam bibliotecas compartilhadas entre funções (até 5 por função).",
  });
  R["lambda|Additional resources"] = () => painelInfo("Additional resources", [
    { p: "Code signing configurations, event source mappings e recursos relacionados das suas funções aparecem aqui." },
  ]);

  // ---------------- DynamoDB ----------------
  R["dynamodb|Explore items"] = (c) => {
    const tabelas = Object.keys(c.dynamodb.tabelas || {});
    const listaTabelas = tabelas.length
      ? `<ul class="caws-lista-links">${tabelas.map((t) => `<li><a href="#" data-acao="ir" data-tela="dynamo-tabelas">${esc(t)}</a></li>`).join("")}</ul>`
      : "<p>Você não tem tabelas nesta conta nesta região.</p>";
    return painelInfo("Explore items", [
      { t: `Tables (${tabelas.length})`, html: listaTabelas },
      { t: tabelas.length ? "Dica" : "No table available", p: tabelas.length
        ? "Abra a tabela (em Tables) pra escanear itens e adicionar registros — igual ao Explore items do console real."
        : "You can query and check items in a chosen table. Create a table to get started." },
    ]);
  };
  R["dynamodb|PartiQL editor"] = (c) => {
    const t = Object.keys(c.dynamodb.tabelas || {})[0] || "minha-tabela";
    return `
      <div class="caws-pagina">
        <div class="caws-cab-servico"><h1>PartiQL editor <span class="caws-info">Info</span></h1>
          <button class="caws-btn-primario" data-acao="st-aviso">Run</button></div>
        <div class="caws-st-painel"><h2>Query</h2>
          <pre class="caws-st-editor">SELECT * FROM "${esc(t)}" WHERE begins_with(id, '1')</pre>
          <p>PartiQL é um dialeto SQL pra consultar o DynamoDB. No CLImb, use <code>aws dynamodb scan/get-item</code> no terminal — o resultado é o mesmo.</p></div>
      </div>`;
  };
  R["dynamodb|Backups"] = () => lista({
    h1: "Backups", n: 0, primario: "Create backup", botoes: ["Actions"], busca: "Find backups",
    colunas: ["Backup name", "Status", "Creation date time", "Table name", "Backup size", "Backup type"],
    emptyT: "No backups", emptyD: "Backups sob demanda ficam até você excluir; PITR restaura qualquer ponto dos últimos 35 dias.",
  });
  R["dynamodb|Exports to S3"] = () => lista({
    h1: "Exports to S3", n: 0, primario: "Export to S3", busca: "Find exports",
    colunas: ["Export ARN", "Status", "Table", "S3 bucket", "Export time"],
    emptyT: "No exports", emptyD: "Exporte tabelas inteiras pro S3 (formato DynamoDB JSON ou Amazon Ion) sem consumir capacidade de leitura.",
  });
  R["dynamodb|Reserved capacity"] = () => painelInfo("Reserved capacity", [
    { p: "Compre capacidade reservada de leitura/escrita (modo provisionado) por 1 ou 3 anos com desconto. Só vale a pena com tráfego estável e previsível." },
  ], "Purchase reserved capacity");

  // ---------------- SNS ----------------
  R["sns|Dashboard"] = (c) => painelInfo("Amazon SNS dashboard", [
    { t: "Resources", html: `<div class="caws-st-grid">${[
      ["Topics", Object.keys((c.sns || {}).topicos || {}).length], ["Subscriptions", 0],
      ["Platform applications", 0], ["Text messaging (SMS)", "—"],
    ].map(([l, n]) => `<div class="caws-st-card"><strong>${esc(String(n))}</strong><span>${esc(l)}</span></div>`).join("")}</div>` },
    { t: "Common actions", p: "Create topic · Publish message · Create subscription — no CLImb, use a tela Topics (menu à esquerda) ou a CLI." },
  ]);
  R["sns|Subscriptions"] = () => lista({
    h1: "Subscriptions", n: 0, primario: "Create subscription", botoes: ["Edit", "Delete", "Request confirmation", "Confirm subscription"], busca: "Search",
    colunas: ["ID", "Endpoint", "Status", "Protocol", "Topic"],
    emptyT: "No subscriptions found", emptyD: "Assine um tópico com um endpoint (e-mail, SQS, Lambda, HTTP...) pra receber as mensagens publicadas.",
  });
  R["sns|Push notifications"] = () => lista({
    h1: "Mobile push notifications", n: 0, primario: "Create platform application", busca: "Search",
    colunas: ["Name", "ARN", "Platform"],
    emptyT: "No platform applications", emptyD: "Integre APNs (Apple), FCM (Google) e outros pra enviar push a apps móveis.",
  });
  R["sns|Text messaging (SMS)"] = () => painelInfo("Text messaging (SMS)", [
    { p: "Envie SMS direto a números de telefone (sem tópico) ou publique num tópico com assinaturas SMS. Regiões e remetentes variam por país." },
  ]);

  // ---------- ponto de entrada usado pelo console-aws.js ----------
  window.cawsSubtela = function (sid, label, c) {
    const f = R[sid + "|" + label];
    if (!f || !c) return null;
    try { return f(c); } catch (e) { return null; }
  };
})();
