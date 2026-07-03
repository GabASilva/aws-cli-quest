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

**Objetos (dentro de um bucket)** **[OK]**: abas Objects / Properties /
Permissions / Metrics / Management / Access Points. Toolbar Objects: `Upload`,
`Create folder`, `Delete`, `Actions ▾`. Colunas: (checkbox) `Name` · `Type` ·
`Last modified` · `Size` · `Storage class`.

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
**Alarms**: colunas `Name` · `State` · `Last state update` · `Conditions` ·
`Actions`. **Log groups**: colunas `Log group` · `Retention` ·
`Metric filters` · `Contributor Insights` · `Class`.

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

### Glue e SageMaker (anotação rápida — telas ricas)
- **Glue**: nav com Data Catalog (Databases, Tables, Crawlers, Connections),
  ETL jobs, Visual ETL, Notebooks, Data quality. Lista de **Jobs**: colunas
  `Name` · `Type` · `Last modified`.
- **SageMaker**: nav com Studio, Domains, Notebooks, Training, Inference,
  Models. (Sandbox: instâncias ml.t/ml.m *.medium–xlarge, role LabRole.)

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
