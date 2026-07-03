# Referência do Console AWS — base para replicar no console do CLImb

> Documentação levantada **ao vivo** do AWS Management Console (sandbox Vocareum,
> conta de escola, região **us-west-2 / Oregon**, dark mode) via extensão
> Claude-in-Chrome. Objetivo: base fiel (não precisa ser 1:1) para reproduzir as
> páginas de cada serviço no console emulado do CLImb (`js/console-aws.js`).
>
> **Tokens visuais (Cloudscape dark, já aplicados no CLImb):** fundo `#161d26` ·
> container `#1b232d` · borda/divisor `#424650` · texto `#c6c6cd` · título
> `#ebebf0` · link/acento `#42b4ff` · verde/sucesso `#2bb534` · barra de topo
> `#0f141a` · botão primário `#ff9900` (texto `#0f141a`) · botões em **pílula**
> (raio 20px) · container raio 16px · input raio 8px · fonte **Amazon Ember**
> (fallback Helvetica Neue/Arial). Fonte tamanho corpo 14px, heading L 20px.
>
> **Padrões comuns de todas as telas Cloudscape:**
> - Barra de topo (squid ink `#0f141a`): logo AWS, app switcher (grade), busca
>   global `[Alt+S]`, ícones (CloudShell, notificações, ajuda, config), seletor
>   de Região, conta.
> - Breadcrumb acima do título (ex.: `EC2 › Instances`).
> - Cabeçalho de página: `<h1>` + link **Info** + botões de ação à direita
>   (primário laranja + secundários em pílula com borda azul).
> - Conteúdo em **containers** (card `#1b232d`, borda, raio 16px) com header
>   próprio (título + contador + ações) e, quando vazio, um **empty state**.
> - Tabelas Cloudscape: checkbox de seleção, colunas com ícone de ordenação,
>   linha de ferramentas (busca "Find … by …", paginação `< 1 >`, engrenagem de
>   preferências).
>
> Legenda: **[OK]** = já existe no CLImb · **[+]** = seção a criar · cada item de
> nav vira uma sub-página.

Índice: [EC2](#ec2) · [S3](#s3) · [IAM](#iam) · [VPC](#vpc) · [RDS](#rds) ·
[Lambda](#lambda) · [DynamoDB](#dynamodb) · [CloudWatch](#cloudwatch) ·
[demais serviços](#demais-servicos)

---

## EC2
`https://us-west-2.console.aws.amazon.com/ec2/home?region=us-west-2#Home:`
(console clássico — conteúdo dentro de iframe)

**Navegação lateral (título "EC2", exata):**
- Dashboard **[OK]**
- AWS Global View
- Events
- **Instances**: Instances **[OK]** · Instance Types · Launch Templates · Spot Requests · Savings Plans · Reserved Instances · Dedicated Hosts · Capacity Reservations
- **Images**: AMIs · AMI Catalog
- **Elastic Block Store**: Volumes · Snapshots · Lifecycle Manager
- **Network & Security**: Security Groups · Elastic IPs · Placement Groups · Key Pairs · Network Interfaces
- **Load Balancing**: Load Balancers · Target Groups
- **Auto Scaling**: Auto Scaling Groups

**Dashboard (EC2 › Dashboard):** cabeçalho "EC2". Painéis (containers):
- **Resources** — "You are using the following Amazon EC2 resources in the …
  Region:" grade 2 colunas de `Recurso → contagem` (Instances (running),
  Auto Scaling Groups, Dedicated Hosts, Elastic IPs, Instances, Key pairs,
  Load balancers, Placement groups, Security groups, Snapshots, Volumes) +
  engrenagem/refresh no header. **[OK]**
- **Launch instance** — texto "To get started, launch an Amazon EC2 instance…",
  botão primário **Launch instance** (com dropdown) + **Migrate a server**.
- **Service health** — link "AWS Health Dashboard", tabela **Zones** (colunas:
  `Zone name`, `Zone ID`).
- **Instance alarms**, **Scheduled events**, **EC2 cost** (Total cost, gráfico),
  **Account attributes** (Default VPC, Settings…), **Explore AWS**,
  **Additional information**.

**Instances (EC2 › Instances)** **[OK]**: cabeçalho "Instances" + Info; botões:
`Connect`, `Instance state ▾`, `Actions ▾`, **Launch instances** (laranja) +
dropdown. Toolbar: "Saved filter sets", busca "Find Instance by attribute or tag
(case-sensitive)", paginação, engrenagem. Colunas: (checkbox) `Name` (editável)
· `Instance ID` · `Instance state` · `Instance type` · `Status check` ·
`Availability Zone` · (Public IPv4, etc.). Empty state: "No instances / You do
not have any instances in this region / Launch instances". Painel inferior:
"Select an instance".

**Subpáginas do EC2 (colunas reais, extraídas ao vivo):**
- **Volumes** (EBS): `Name` · `Volume ID` · `Type` · `Size` · `IOPS` ·
  `Throughput` · `Snapshot ID` · `Created` · `Availability Zone` ·
  `Volume state` · `Alarm status` · `Attached resources` · `Status check` ·
  `Encryption` · `KMS key ID`. Botão **Create volume**.
- **Snapshots**: `Name` · `Snapshot ID` · `Full snapshot size` · `Volume size`
  · `Description` · `Storage tier` · `Snapshot status` · `Started` · `Progress`
  · `Encryption` · `KMS key ID`. Botão **Create snapshot**.
- **Security Groups**: `Name` · `Security group ID` · `Security group name` ·
  `VPC ID` · `Description` · `Owner` · `Inbound rules count` ·
  `Outbound rules count`. Botão **Create security group**.
- **Key Pairs**: `Name` · `Type` · `Created` · `Fingerprint` · `ID`.
  Botões **Create key pair** / `Import key pair`.
- **Elastic IPs**: `Name` · `Allocated IPv4 address` · `Type` · `Allocation ID`
  · `Reverse DNS record` · `Associated instance ID` · `Private IP address` ·
  `Association ID` · `Network border group`. Botão **Allocate Elastic IP address**.
- **AMIs**: `Name` · `AMI name` · `AMI ID` · `Source` · `Owner` · `Visibility` ·
  `Status` · `Creation date` · `Platform` · `Root device type` · `Block devices`
  · `Virtualization` · `Deprecation time` · `Last launched time`.
- **Launch Templates**: `Name` · `Launch template ID` · `Default version` ·
  `Latest version` · `Created by` · `Created time`. Botão **Create launch template**.
- **Placement Groups**: `Group name` · `Group Id` · `Strategy` · `State` ·
  `Partition` · `Group ARN` · `Parent group ID`. Botão **Create placement group**.
- **Network Interfaces**: `Name` · `Network interface ID` · `Subnet ID` ·
  `VPC ID` · `Availability Zone` · `Security group names/IDs` · `Interface Type`
  · `Description` · `Instance ID` · `Status` · `Public IPv4 address` ·
  `Primary private IPv4 address`.
- **Load Balancers** (ELB): `Name` · `State` · `Type` · `Scheme` ·
  `IP address type` · `VPC ID` · `Availability Zones` · `Security groups` ·
  `DNS name` · `ARN` · `Date created`. Botão **Create load balancer**. Empty:
  "No load balancers".
- **Target Groups**: `Name` · `ARN` · `Port` · `Protocol` · `Target type` ·
  `Load balancer` · `VPC ID`. Botão **Create target group**.
- **Auto Scaling Groups**: botão **Create Auto Scaling group**. Colunas típicas:
  `Name` · `Launch template/config` · `Instances` · `Status` ·
  `Desired/Min/Max capacity` · `Availability Zones`.

---

## S3
`https://us-west-2.console.aws.amazon.com/s3/buckets?region=us-west-2`
(Cloudscape puro — sem iframe)

**Navegação lateral (título "Amazon S3"):**
- **Buckets**: General purpose buckets **[OK]** · Directory buckets · Table buckets · Vector buckets
- **Files**: File systems
- **Access management and security**: Access Points · Access Points for FSx · Access Grants · IAM Access Analyzer
- **Storage management and insights**: Storage Lens · Batch Operations
- Account and organization settings
- AWS Marketplace for S3

**Buckets (General purpose buckets)** **[OK]**: `<h1>` **Buckets**. Abas:
`General purpose buckets` (badge "All AWS Regions") · `Directory buckets`.
Container "General purpose buckets (N) Info" com botões: refresh, `Copy ARN`,
`Empty`, `Delete`, **Create bucket** (laranja). Busca "Find buckets by name".
Colunas: (checkbox) `Name` · `AWS Region` · `Creation date`. Empty state:
"No buckets / You don't have any buckets. / Create bucket". Abaixo, dois
containers: **Account snapshot** (Storage Lens, "Updated daily", botão "View
dashboard") e **External access summary** ("Updated daily").

**Detalhe do bucket** **[OK]** (abas reais, confirmadas criando um bucket
temporário): `Objects` · `Metadata` · `Properties` · `Permissions` · `Metrics`
· `Management` · `File systems` · `Access Points`. Toolbar Objects: `Copy S3 URI`,
`Copy URL`, `Download`, `Open`, `Delete`, `Actions ▾`, **Upload**, `Create folder`.
Colunas Objects: (checkbox) `Name` · `Type` · `Last modified` · `Size` ·
`Storage class`.

---

## IAM
`https://us-east-1.console.aws.amazon.com/iam/home#/home` (Global — Cloudscape)

**Navegação lateral (título "Identity and Access Management (IAM)"):**
- Dashboard **[OK]**
- **Access Management**: Roles · Policies · IAM users **[OK]** · IAM user groups · Identity providers · Account settings · Root access management · Temporary delegation requests
- **Access reports**: Access Analyzer (Resource analysis · Unused access · Analyzer settings) · Credential report · Organization activity · Service control policies · Resource control policies
- **Related consoles**: IAM Identity Center · AWS Organizations

**Dashboard (IAM › Dashboard)** **[OK]**: `<h1>` **IAM Dashboard** + Info.
Painéis: **IAM resources** ("Resources in this AWS Account" — cards horizontais
`User groups`, `Users`, `Roles`, `Policies`, `Identity providers` com número
grande) · **What's new** · **AWS Account** (Account ID, Account Alias, Sign-in
URL) · **Tools** (Policy simulator) · **Additional information**.

**Users (IAM › Users)** **[OK]**: colunas `User name` · `Path` · `Group(s)` ·
`Last activity` · `MFA` · `Password age` · `Console last sign-in` ·
`Access key ID` · `Active key age`. Botões: **Create user**, `Delete`.
(No sandbox o IAM é **read-only** — criar usuário/grupo/policy é bloqueado.)

**Subpáginas do IAM (colunas reais):**
- **Roles** ("Roles (N)"): `Role name` · `Trusted entities` · `Last activity`.
  Botão **Create role**.
- **Policies** ("Policies (N)" — ~1500 gerenciadas pela AWS): `Policy name` ·
  `Type` · `Used as` · `Description`. Botão **Create policy**.
- **User groups**: `Group name` · `Users` · `Permissions` · `Creation time`.
  Botão **Create group**.
- **Identity providers**: `Name` · `Type` · `Creation time`. Botão **Add provider**.

---

## VPC
`https://us-west-2.console.aws.amazon.com/vpcconsole/home?region=us-west-2#Home:`

**Navegação lateral (título "VPC dashboard"):**
- VPC Dashboard **[OK]** · AWS Global View · (filtro "Filter by VPC")
- **Virtual private cloud**: Your VPCs **[OK]** · Subnets · Route tables · Internet gateways · Egress-only internet gateways · Carrier gateways · DHCP option sets · Elastic IPs · Managed prefix lists · NAT gateways · Peering connections · Route servers
- **Security**: Network ACLs · Security groups
- **PrivateLink and Lattice**: Getting started · Endpoints · Endpoint services · Service networks · Lattice services · Resource configurations · Resource gateways · Target groups · Domain verifications
- **DNS firewall**: Rule groups · Domain lists
- **Network Firewall**: Firewalls · Firewall policies · …

**VPC Dashboard** **[OK]**: botões **Create VPC** (laranja) + `Launch EC2
Instances`. Painel **Resources by Region** ("You are using the following Amazon
VPC resources") — grade 2 colunas de cards, cada um `Nome (link) · Região ·
contagem` + "See all regions": VPCs, Subnets, Route Tables, Internet Gateways,
Egress-only Internet Gateways, DHCP option sets, Elastic IPs, Endpoint Services,
NAT Gateways, VPC Peering Connections, Network ACLs, Security Groups, Customer
Gateways, Virtual Private Gateways. Lado direito: **Service Health**,
**Settings** (Block Public Access, Zones, Console Experiments), **Additional
Information**, **AWS Network Manager**.

**Your VPCs**: colunas `Name` · `VPC ID` · `State` · `IPv4 CIDR` · `IPv6 CIDR` ·
`DHCP option set` · `Main route table` · `Default VPC` · `Tenancy`.

**Subpáginas do VPC (colunas reais):**
- **Subnets**: `Name` · `Subnet ID` · `State` · `VPC` · `IPv4 CIDR` ·
  `IPv6 CIDR` · `Available IPv4 addresses` · `Availability Zone` ·
  `Route table` · `Network ACL` · `Default subnet`. Botão **Create subnet**.
- **Route tables**: `Name` · `Route table ID` · `Explicit subnet associations`
  · `Edge associations` · `Main` · `VPC` · `Owner ID`. Botão **Create route table**.
- **Internet gateways**: `Name` · `Internet gateway ID` · `State` · `VPC ID` ·
  `Owner`. Botão **Create internet gateway**.
- **NAT gateways**: `Name` · `NAT gateway ID` · `Connectivity type` · `State` ·
  `Primary public IPv4 address` · `Primary private IPv4 address` · `VPC` ·
  `Subnet` · `Created`. Botão **Create NAT gateway**.
- **Network ACLs**: `Name` · `Network ACL ID` · `Associated with` · `Default` ·
  `VPC ID` · `Inbound rules count` · `Outbound rules count` · `Owner`.
- **Endpoints**: `Name` · `VPC endpoint ID` · `Endpoint type` · `Status` ·
  `Service name` · `VPC ID` · `Creation time`. Botão **Create endpoint**.
- **Peering connections**: `Name` · `Peering connection ID` · `Status` ·
  `Requester VPC` · `Accepter VPC`. **DHCP option sets**: `Name` ·
  `DHCP option set ID` · `Owner`. **Managed prefix lists**: `Name` ·
  `Prefix list ID` · `Max entries` · `Address family` · `State`.
- **Security groups / Elastic IPs**: mesmas telas do EC2 (ver seção EC2).

---

## RDS
`https://us-west-2.console.aws.amazon.com/rds/home?region=us-west-2#databases:`

**Navegação lateral (título "Aurora and RDS"):**
- Dashboard **[OK]** · Databases **[OK]** · Query editor · Performance insights · Snapshots · Exports in Amazon S3 · Automated backups · Reserved instances · Proxies
- Subnet groups · Parameter groups · Option groups · Custom engine versions · Zero-ETL integrations
- Events · Event subscriptions
- Recommendations · Certificate update

**Databases (RDS › Databases)** **[OK]**: `<h2>` "Databases (N)" + toggle
**Group resources**; botões: refresh, `Modify`, `Actions ▾`, **Create database**
(laranja, com dropdown). Colunas: (checkbox) `DB identifier` · `Status` · `Role`
· `Engine` · `Upgrade rollout order` · `Region & AZ` · `Size` · `Recommendations`
· `CPU` · `Current activity` · `Maintenance` · `VPC` · `Multi-AZ`. Empty state:
ilustração do robô "No resources / No resources to display".
(Sandbox: engines Aurora/MySQL/PostgreSQL/MariaDB, db.t3.micro–medium, gp2 ≤100GB.)

---

## Lambda
`https://us-west-2.console.aws.amazon.com/lambda/home?region=us-west-2#/functions`

**Navegação lateral (título "Lambda"):**
- Dashboard · Applications · Functions **[OK]**
- **Function resources**: Capacity providers · Code signing configurations · Event source mappings · Layers · Replicas
- **MicroVMs**: MicroVM Images · MicroVMs · Network connectors
- **Related AWS resources**: Step Functions state machines

**Functions (Lambda › Functions)** **[OK]**: `<h1>` "Functions (N)". Botões:
`Actions ▾`, **Create function** (laranja). Busca "Search functions by name".
Colunas: `Function name` · `Description` · `Package type` · `Runtime` · `Type`
· `Last modified`. (Sandbox: role só **LabRole**.)

---

## DynamoDB
`https://us-west-2.console.aws.amazon.com/dynamodbv2/home?region=us-west-2#tables`

**Navegação lateral (título "DynamoDB"):**
- Dashboard · Tables **[OK]** · Explore items · PartiQL editor · Backups · Exports to S3 · Imports from S3 · Integrations · Reserved capacity · Settings
- **DAX**: Clusters · Subnet groups · Parameter groups · Events

**Tables (DynamoDB › Tables)** **[OK]**: `<h1>` "Tables (N)". Botões: `Actions ▾`,
`Delete`, **Create table** (laranja). Filtros por tag. Colunas: (checkbox)
`Name` · `Status` · `Partition key` · `Sort key` · `Indexes` ·
`Replication Regions` · `Deletion protection` · `Favorite` ·
`Read capacity mode` · `Write capacity mode` · `Total size` · `Table class`.

---

## CloudWatch
`https://us-west-2.console.aws.amazon.com/cloudwatch/home?region=us-west-2#home:`

**Navegação lateral (título "CloudWatch"):**
- Favorites and recents · Dashboards
- **Alarms** **[OK]** (sub-contadores In alarm / Insufficient / OK): All alarms
- AI Operations · GenAI Observability · Application Signals (APM) ·
  Infrastructure Monitoring
- **Logs**: Log groups · Logs Insights
- **Metrics**: All metrics · Explorer
- Network Monitoring · Setup

**Overview (CloudWatch › home)**: `<h1>` "Overview", seletor de janela de tempo
(`1h`, `3h`, `12h`, `1d`, `1w`, `Custom`), painéis de métricas por recurso.
**Alarms** (colunas reais): `Name` · `State` · `Actions` · `Actions muted` ·
`Last state update (UTC)` · `Conditions`. Botão **Create alarm**.
**Log groups** (colunas reais): `Log group` · `Log class` · `Anomaly detection`
· `Deletion protection` · `Data protection` · `Retention` · `Metric filters` ·
`Contributor Insights` · `Subscription filters`. Botão **Create log group**.
**Metrics**: UI de gráfico (sem tabela de lista).

---

## Demais serviços
Serviços do sandbox ainda **não** no console do CLImb — candidatos a **[+]**.
Nav lateral + página principal (colunas/botões) de cada um.

### SNS — Simple Notification Service
`.../sns/v3/home#/topics` · Nav: Dashboard · **Topics** · Subscriptions ·
Mobile (Push notifications, Text messaging SMS, Origination numbers).
**Topics**: `<h1>` "Topics (N)"; botões `Edit`, `Delete`, `Publish message`,
**Create topic**. Colunas: `Name` · `Type` · `ARN`.

### SQS — Simple Queue Service
`.../sqs/v3/home#/queues` · Nav: Amazon SQS › **Queues** (nav enxuta).
**Queues**: `<h1>` "Queues (N)"; botões `Delete`, `Send and receive messages`,
`Actions`, **Create queue**. Colunas: `Name` · `Type` · `Created` ·
`Messages available` · `Messages in flight` · `Encryption` ·
`Content-based deduplication`.

### CloudFront (Global)
`.../cloudfront/v4/home#/distributions` · Nav: **Distributions** · Policies ·
Functions · Static IPs · VPC origins · SaaS (Multi-tenant distributions,
Distribution tenants) · Telemetry (Monitoring, Alarms, Logs) · Reports &
analytics (Cache statistics, Popular objects, Top referrers, Usage, Viewers) ·
Security (Origin access, Trust stores, Field-level encryption) · Key management
(Public keys, Key groups) · Settings.
**Distributions**: botões `Enable`, `Disable`, **Create distribution**. Colunas:
`ID` · `Status` · `Description` · `Type` · `Domain name (standard)` ·
`Alternate domain names` · `Origins` · `Last modified`.

### CloudTrail
`.../cloudtrailv2/home#/dashboard` · Nav: **Dashboard** · Event coverage ·
Event history · Insights · Trails · Lake (Dashboards, Query, Event data stores,
Integrations) · Settings.
**Dashboard**: botões `Create a new query`, `Copy events to Lake`,
**Create trail**. Eventos recentes — colunas: `Event name` · `Event time` ·
`Event source` · `Name` · `Status`. **Event history**: `Event name` ·
`Event time` · `User name` · `Event source` · `Resource type` · `Resource name`.

### Route 53 (Global)
`.../route53/v2/home#Dashboard` · Nav: **Dashboard** · Hosted zones ·
Health checks · Profiles · Global Resolver (Global resolvers, Shared DNS views) ·
VPC Resolver (VPCs, Inbound/Outbound endpoints, Rules, Query logging) · Domains
(Registered domains, Requests) · Traffic flow (Traffic policies, Policy records)
· DNS Firewall. (Sandbox: registro/transferência de domínio **restrito**.)
**Hosted zones**: botão **Create hosted zone**. Colunas: `Domain name` · `Type`
· `Created by` · `Record count` · `Description` · `Hosted zone ID`.

### ECS — Elastic Container Service
`.../ecs/v2/home#/clusters` · Nav: **Clusters** · Namespaces · Task definitions ·
Daemon task definitions · Account settings · (atalhos AWS Batch, Amazon ECR).
**Clusters**: botão **Create cluster**. Colunas: `Cluster` · `Services` ·
`Tasks (running/desired)` · `Container instances` · `Provider`.

### ECR — Elastic Container Registry
`.../ecr/repositories` · Nav: **Private registry** (Repositories, Features &
Settings) · **Public registry** (Repositories, Settings).
**Repositories**: botão **Create repository**. Colunas: `Repository name` ·
`URI` · `Created at` · `Tag immutability` · `Scan frequency` · `Encryption type`.

### EFS — Elastic File System
`.../efs/home#/file-systems` · Nav: **File systems** · Access points.
**File systems**: botões `Delete`, **Create file system**. Colunas: `Name` ·
`File system ID` · `Encrypted` · `Total size` · `Size in Standard` ·
`Size in IA` · `Provisioned Throughput (MiB/s)` · `File system state` ·
`Availability Zone`.

### KMS — Key Management Service
`.../kms/home#/kms/keys` · Nav: **AWS managed keys** · **Customer managed keys**
· Custom key stores (AWS CloudHSM key stores, External key stores).
**Customer managed keys**: botões `Key actions ▾`, **Create key**. Colunas:
`Aliases` · `Key ID` · `Status` · `Key type` · `Key spec` · `Key usage`.
(Sandbox: KMS **read-only**.)

### Systems Manager (SSM)
`.../systems-manager/home` · Nav (grande, por grupos):
- **Node Tools**: Compliance · Distributor · Fleet Manager · Hybrid Activations ·
  Inventory · Patch Manager · Run Command · Session Manager · State Manager
- **Change Management Tools**: Automation · Change Calendar · Change Manager ·
  Documents · Maintenance Windows · Quick Setup
- **Application Tools**: AppConfig · Application Manager · **Parameter Store**
- **Operations Tools**: Explorer · Incident Manager · OpsCenter
Home: `<h1>` "AWS Systems Manager". **Parameter Store** costuma ser o mais
usado (colunas `Name` · `Tier` · `Type` · `Last modified` · `Description`).

### CloudFormation
`.../cloudformation/home#/stacks` · Nav: **Stacks** · Stack refactors ·
StackSets · Exports · Infrastructure Composer · IaC generator · Hooks (Hooks
overview, Invocation summary, Hooks) · Registry (Public/Activated extensions,
Publisher).
**Stacks**: botões `Delete stack`, `Update stack`, `Stack actions ▾`,
**Create stack** (laranja). Colunas: `Stack name` · `Status` · `Created time` ·
`Description`. Detalhe do stack — abas: `Stack info` · `Events` · `Resources` ·
`Outputs` · `Parameters` · `Template` · `Change sets` · `Git sync`.
(O CLImb já emula create/list/delete stack — dá pra alinhar essas abas.)

### Athena
`.../athena/home#/query-editor` · Nav: Query editor · Recent queries ·
Saved queries · Settings · Workgroups · Data sources. Foco em **Query editor**
(abas `Editor`, `Recent queries`, `Saved queries`, `Settings`; painéis `Query`,
`Query results`, `Query stats`). Menos "lista"; é editor SQL.

### Cognito
`.../cognito/v2/home` · Nav: **User pools** · **Identity pools**. Landing com
dois caminhos: "Add sign-in and sign-up experiences to your app" (User pools) e
"Grant app access to AWS services" (Identity pools). **User pools**: colunas
`User pool name` · `User pool ID` · `Status` · `Created time`.

### Kinesis
`.../kinesis/home#/home` · Landing "Amazon Kinesis services" com **Data
Streams** e **Data Firehose**. **Data Streams**: colunas `Name` · `Status` ·
`Data retention period` · `Shard count / Capacity mode`.

### EKS — Elastic Kubernetes Service
`.../eks/home#/clusters` · Nav: Dashboard · **Clusters** · Settings ·
Amazon EKS Anywhere. **Clusters**: botão **Create cluster**. Colunas:
`Cluster name` · `Status` · `Kubernetes version` · `Support period` ·
`Upgrade policy` · `Created` · `Provider`.

### IoT Core
`.../iot/home#/home` · Nav (grande): Monitor · **Connect** (Connect one/many
devices, Domain configurations) · **Test** (Device Advisor, MQTT test client) ·
Device Location · **Manage** (All devices → Things/Thing groups/Thing types,
Greengrass devices, LPWAN devices, Software packages, Remote actions → Jobs,
Message routing → Rules/Destinations, Retained messages) · **Security**
(Certificates, Policies, CAs, Role aliases) · Logs · Billing groups · Settings.

### Amazon Data Firehose (Kinesis Firehose)
`.../firehose/home#/streams` · `<h1>` "Amazon Data Firehose"; botão
**Create Firehose stream**. Colunas: `Firehose stream name` · `Source` ·
`Destination` · `Creation time` · `Status`.

### Serviços descontinuados / de nicho (sem console de lista pra replicar)
- **S3 Glacier** (console próprio): "no longer accepting new customers" — hoje é
  **classe de armazenamento do S3** (S3 Glacier Instant/Flexible/Deep Archive).
- **Cloud9**: IDE no navegador (em descontinuação p/ novos clientes) — é um editor,
  não uma lista de recursos.
- **IoT Analytics**, **IoT Events**, **Kinesis Data Analytics**: consoles de
  nicho/legados; baixa prioridade — replicar só se houver demanda.
- **Resource Groups & Tag Editor**: utilitário transversal (agrupar/etiquetar
  recursos); não é um "serviço" de recurso próprio.

### Glue e SageMaker (anotação rápida — telas ricas)
- **Glue**: nav com Data Catalog (Databases, Tables, Crawlers, Connections),
  ETL jobs, Visual ETL, Notebooks, Data quality. Lista de **Jobs**: colunas
  `Name` · `Type` · `Last modified`.
- **SageMaker**: nav com Studio, Domains, Notebooks, Training, Inference,
  Models. (Sandbox: instâncias ml.t/ml.m *.medium–xlarge, role LabRole.)

---

## Wizards de criação (seções dos formulários "Create …")
Abri cada formulário e li as seções (sem criar recursos, exceto o bucket S3 temp
que foi criado e **apagado** para documentar as abas de detalhe).
- **S3 › Create bucket**: General configuration (AWS Region, Bucket type
  general/directory, Bucket name) · Object Ownership (ACL disabled/enabled) ·
  Block Public Access settings · Bucket Versioning (off/on) · Tags ·
  Default encryption (SSE-S3 AES256 / SSE-KMS / DSSE-KMS, Bucket Key) ·
  Advanced settings. Botões: `Cancel`, **Create bucket**.
- **EC2 › Launch an instance**: Name and tags · Application and OS Images (AMI) ·
  Instance type · Key pair (login) · Network settings · Configure storage ·
  File systems · Advanced details · **Summary** (painel lateral + `Launch instance`).
- **DynamoDB › Create table**: Table details (Table name, Partition key,
  Sort key opcional) · Table settings (Default / Customize) · Tags.
- **RDS › Create database**: Choose a database creation method (Standard/Easy) ·
  Engine options · Templates (Production / Dev-Test / Free tier) · Settings
  (DB identifier, Master username/senha) · Cluster storage · Availability &
  durability · Connectivity · Monitoring · Additional configuration ·
  Estimated monthly costs.
- **SNS › Create topic** (Standard/FIFO, Name, Display name), **SQS › Create
  queue** (Standard/FIFO, Name, Configuration), **Lambda › Create function**
  (Author from scratch/Blueprint/Container, Function name, Runtime, Architecture,
  Permissions→**LabRole** no sandbox).

---

## Prioridades para replicar no CLImb (sugestão)
Ordem por valor didático + facilidade (já temos o motor Cloudscape dark + nav):
1. **Refinar as 8 telas atuais** com colunas/botões/empty-states exatos deste doc
   (EC2 Instances, S3 Buckets/Objects, IAM Users, VPC, RDS, Lambda, DynamoDB, CW).
2. **SNS + SQS** — telas simples (1 lista cada), alta relação didática.
3. **CloudTrail (Event history)** e **CloudWatch (Alarms/Logs)** — auditoria/monitoramento.
4. **CloudFront**, **Route 53 (Hosted zones)**, **KMS (Customer managed keys)**.
5. **CloudFormation** (alinhar abas do stack, já emulado).
6. Extras conforme demanda: ECS/ECR, EFS, Systems Manager (Parameter Store),
   Cognito, Kinesis, Athena, Glue, SageMaker.

> Este doc é **vivo**: extraído ao vivo do console (us-west-2). Para pegar mais
> detalhes de uma sub-página específica (colunas completas, wording de wizard),
> reconectar via extensão e rodar o mesmo extrator na URL da página.
