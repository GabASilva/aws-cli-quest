"use strict";
// ============================================================
// AWS CLI Quest — manuais.js
// Manuais embutidos: aws help, aws <serviço> help, aws <serviço> <comando> help
// ============================================================

const MANUAIS = {
  "": `AWS CLI (simulador) — manual geral
==================================

USO
    aws <serviço> <comando> [opções]

SERVIÇOS DISPONÍVEIS
    s3          Armazenamento de objetos — comandos de alto nível (mb, cp, ls, sync...)
    s3api       Operações de baixo nível do S3 (versionamento, políticas...)
    ec2         Máquinas virtuais (instâncias, security groups, key pairs)
    iam         Usuários, grupos, papéis (roles) e permissões
    lambda      Funções serverless
    dynamodb    Banco de dados NoSQL
    sqs         Filas de mensagens
    sns         Notificações (pub/sub)
    apigateway  APIs HTTP gerenciadas
    route53     DNS e domínios
    cloudfront  CDN (cache nas bordas)
    ecr         Registro de imagens de contêiner
    ecs         Rodar contêineres (clusters, tarefas, serviços)
    secretsmanager  Senhas e segredos
    stepfunctions   Orquestração de passos (fluxos)
    events      EventBridge: eventos e agendamentos
    eks         Kubernetes gerenciado
    glue        Catálogo de dados (e crawlers)
    athena      SQL direto nos arquivos do S3
    kms         Chaves de criptografia
    sts         Identidade da sessão (get-caller-identity)

MANUAIS
    aws <serviço> help                p. ex.: aws s3 help
    aws <serviço> <comando> help      p. ex.: aws s3 mb help

OPÇÕES QUE VALEM PRA QUALQUER COMANDO
    --query '<expressão>'   filtra/transforma a saída (JMESPath).
                            Ex.: --query 'Policies[*].Arn'
    --output <formato>      json (padrão) ou text.
    comando > arquivo       redireciona a saída pra um arquivo (salva).
                            Ex.: ... get-policy-version ... > lab_policy.json

UTILITÁRIOS DO TERMINAL
    ls            lista os arquivos (fictícios + os que você criou com '>')
    cat <arq>     mostra o conteúdo de um arquivo
    clear         limpa a tela
    help          este manual`,

  s3: `aws s3 — comandos de alto nível do S3
=====================================

COMANDOS
    mb        cria um bucket                 aws s3 mb s3://meu-bucket
    rb        remove um bucket               aws s3 rb s3://meu-bucket [--force]
    ls        lista buckets ou objetos       aws s3 ls | aws s3 ls s3://meu-bucket
    cp        copia arquivos                 aws s3 cp relatorio.csv s3://meu-bucket/
    rm        apaga um objeto                aws s3 rm s3://meu-bucket/arquivo.txt
    sync      sincroniza uma pasta local     aws s3 sync ./site s3://meu-bucket
    website   configura hospedagem de site   aws s3 website s3://meu-bucket --index-document index.html

Digite 'aws s3 <comando> help' para detalhes de cada um.
Pra operações avançadas (versionamento, políticas), veja 'aws s3api help'.`,

  "s3.mb": `aws s3 mb — make bucket (criar bucket)

USO
    aws s3 mb s3://<nome-do-bucket>

REGRAS DO NOME
    3 a 63 caracteres; só letras minúsculas, números, pontos e hífens;
    precisa ser único (na AWS de verdade, único no mundo inteiro!).

EXEMPLO
    aws s3 mb s3://meu-bucket-exemplo`,

  "s3.rb": `aws s3 rb — remove bucket (apagar bucket)

USO
    aws s3 rb s3://<nome-do-bucket> [--force]

OPÇÕES
    --force    apaga o bucket mesmo com objetos dentro (apaga tudo junto)

EXEMPLO
    aws s3 rb s3://bucket-antigo --force`,

  "s3.ls": `aws s3 ls — listar buckets ou objetos

USO
    aws s3 ls                          lista todos os seus buckets
    aws s3 ls s3://<bucket>            lista os objetos do bucket
    aws s3 ls s3://<bucket>/<prefixo>  lista objetos com aquele prefixo

EXEMPLOS
    aws s3 ls
    aws s3 ls s3://meu-bucket-exemplo`,

  "s3.cp": `aws s3 cp — copiar arquivos de/para o S3

USO
    aws s3 cp <origem> <destino>

DIREÇÕES
    upload      aws s3 cp relatorio.csv s3://meu-bucket/
    download    aws s3 cp s3://meu-bucket/relatorio.csv ./
    cópia       aws s3 cp s3://bucket-a/x.txt s3://bucket-b/x.txt

DICA
    Se o destino terminar com '/', o nome do arquivo é mantido.
    Digite 'ls' no terminal pra ver os arquivos locais disponíveis.`,

  "s3.rm": `aws s3 rm — apagar um objeto do bucket

USO
    aws s3 rm s3://<bucket>/<chave>

EXEMPLO
    aws s3 rm s3://meu-bucket-exemplo/arquivo.txt`,

  "s3.sync": `aws s3 sync — sincronizar pasta local com o bucket

USO
    aws s3 sync <pasta-local> s3://<bucket>[/prefixo]

EXEMPLO
    aws s3 sync ./site s3://meu-bucket

Envia todos os arquivos da pasta (recursivo). Digite 'ls' pra ver
que existe uma pasta ./site pronta no disco local fictício.`,

  "s3.website": `aws s3 website — configurar hospedagem de site estático

USO
    aws s3 website s3://<bucket> --index-document <arquivo> [--error-document <arquivo>]

EXEMPLO
    aws s3 website s3://meu-site --index-document index.html --error-document erro404.html

Na AWS real, depois disso o site fica acessível em
http://<bucket>.s3-website-<região>.amazonaws.com`,

  s3api: `aws s3api — operações de baixo nível do S3
==========================================

COMANDOS
    create-bucket            cria bucket (estilo API)
    list-buckets             lista buckets em JSON
    put-bucket-versioning    liga/desliga versionamento
    get-bucket-versioning    consulta o versionamento
    put-bucket-policy        aplica política de acesso ao bucket
    get-bucket-policy        consulta a política

Digite 'aws s3api <comando> help' para detalhes.`,

  "s3api.create-bucket": `aws s3api create-bucket

USO
    aws s3api create-bucket --bucket <nome> [--region <região>]

EXEMPLO
    aws s3api create-bucket --bucket meu-bucket-api --region us-east-1`,

  "s3api.list-buckets": `aws s3api list-buckets

USO
    aws s3api list-buckets

Retorna a lista de buckets em JSON (diferente de 'aws s3 ls', que é texto).`,

  "s3api.put-bucket-versioning": `aws s3api put-bucket-versioning

USO
    aws s3api put-bucket-versioning --bucket <nome> --versioning-configuration Status=Enabled

STATUS
    Enabled      liga o versionamento (guarda versões antigas dos objetos)
    Suspended    suspende

EXEMPLO
    aws s3api put-bucket-versioning --bucket meu-bucket-exemplo --versioning-configuration Status=Enabled`,

  "s3api.get-bucket-versioning": `aws s3api get-bucket-versioning

USO
    aws s3api get-bucket-versioning --bucket <nome>`,

  "s3api.put-bucket-policy": `aws s3api put-bucket-policy

USO
    aws s3api put-bucket-policy --bucket <nome> --policy file://<arquivo.json>

EXEMPLO
    aws s3api put-bucket-policy --bucket meu-site --policy file://politica-publica.json

Existe um politica-publica.json pronto no disco local (digite 'ls').
É assim que se libera leitura pública pra hospedar um site, por exemplo.`,

  "s3api.get-bucket-policy": `aws s3api get-bucket-policy

USO
    aws s3api get-bucket-policy --bucket <nome>`,

  ec2: `aws ec2 — máquinas virtuais
===========================

COMANDOS
    describe-instances                   lista suas instâncias
    run-instances                        cria/inicia instâncias novas
    stop-instances                       para instâncias
    start-instances                      liga instâncias paradas
    terminate-instances                  encerra (apaga) instâncias
    create-key-pair                      cria par de chaves SSH
    describe-key-pairs                   lista pares de chaves
    create-security-group                cria grupo de segurança (firewall)
    authorize-security-group-ingress     libera porta de entrada
    describe-security-groups             lista grupos de segurança

Digite 'aws ec2 <comando> help' para detalhes.`,

  "ec2.describe-instances": `aws ec2 describe-instances

USO
    aws ec2 describe-instances

Lista todas as suas instâncias com estado, tipo, IP etc.`,

  "ec2.run-instances": `aws ec2 run-instances — criar instâncias

USO
    aws ec2 run-instances --image-id <ami> --instance-type <tipo>
                          [--count N] [--key-name <chave>] [--security-groups <sg>]

PARÂMETROS
    --image-id         a imagem (AMI), ex.: ami-0abcd1234ef567890
    --instance-type    ex.: t2.micro, t3.micro, t3.small...
    --count            quantas instâncias (padrão 1)
    --key-name         par de chaves pra acessar via SSH
    --security-groups  grupo(s) de segurança

EXEMPLO
    aws ec2 run-instances --image-id ami-0123456789abcdef0 --instance-type t3.micro

(troque o --image-id e o --instance-type pelos que o desafio pedir.)`,

  "ec2.stop-instances": `aws ec2 stop-instances

USO
    aws ec2 stop-instances --instance-ids <id> [<id2> ...]

EXEMPLO
    aws ec2 stop-instances --instance-ids i-0abc123def456

Pegue o id com 'aws ec2 describe-instances'.`,

  "ec2.start-instances": `aws ec2 start-instances

USO
    aws ec2 start-instances --instance-ids <id> [<id2> ...]

Liga instâncias que estavam paradas (stopped).`,

  "ec2.terminate-instances": `aws ec2 terminate-instances

USO
    aws ec2 terminate-instances --instance-ids <id> [<id2> ...]

ATENÇÃO: encerrar é definitivo — a instância é apagada (na AWS real,
o disco junto, a menos que configure o contrário).`,

  "ec2.create-key-pair": `aws ec2 create-key-pair

USO
    aws ec2 create-key-pair --key-name <nome>

EXEMPLO
    aws ec2 create-key-pair --key-name chave-exemplo

Retorna a chave privada — na vida real, salve num .pem e proteja!`,

  "ec2.describe-key-pairs": `aws ec2 describe-key-pairs

USO
    aws ec2 describe-key-pairs`,

  "ec2.create-security-group": `aws ec2 create-security-group

USO
    aws ec2 create-security-group --group-name <nome> --description "<descrição>"

EXEMPLO
    aws ec2 create-security-group --group-name exemplo-sg --description "Meu grupo"

Um security group é um firewall: por padrão bloqueia toda entrada.
Use authorize-security-group-ingress pra liberar portas.`,

  "ec2.authorize-security-group-ingress": `aws ec2 authorize-security-group-ingress — liberar porta de entrada

USO
    aws ec2 authorize-security-group-ingress --group-name <nome>
        --protocol tcp --port <porta> --cidr <faixa-de-ip>

EXEMPLOS
    aws ec2 authorize-security-group-ingress --group-name exemplo-sg --protocol tcp --port 443 --cidr 0.0.0.0/0
    aws ec2 authorize-security-group-ingress --group-name exemplo-sg --protocol tcp --port 3306 --cidr 10.0.0.0/16

0.0.0.0/0 = qualquer IP do mundo (cuidado com a porta 22 na vida real!).
/32 no fim = um IP só; /16 = uma faixa. Troque porta e CIDR pelo que o desafio pedir.`,

  "ec2.describe-security-groups": `aws ec2 describe-security-groups

USO
    aws ec2 describe-security-groups`,

  iam: `aws iam — identidade e permissões
=================================

USUÁRIOS / GRUPOS / ROLES
    create-user / list-users / delete-user
    create-group / list-groups / get-group / delete-group
    add-user-to-group / remove-user-from-group
    create-role / list-roles / attach-role-policy / delete-role

PERMISSÕES (anexar / desanexar)
    attach-user-policy / detach-user-policy / list-attached-user-policies
    attach-group-policy / detach-group-policy
    attach-role-policy / detach-role-policy

POLÍTICAS GERENCIADAS PELO CLIENTE (customer managed)
    create-policy / list-policies / get-policy / delete-policy
    get-policy-version / list-policy-versions / create-policy-version

POLÍTICAS GERENCIADAS PELA AWS (--policy-arn)
    arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
    arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess
    arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

Digite 'aws iam <comando> help' para detalhes.`,

  "iam.create-policy": `aws iam create-policy — criar política gerenciada pelo cliente

USO
    aws iam create-policy --policy-name <nome> --policy-document file://<doc.json>

EXEMPLO
    aws iam create-policy --policy-name minha-politica --policy-document file://politica-publica.json

Cria uma política "Local" (customer managed). Nasce com a versão v1
como padrão. Depois dá pra conferir na lista das suas políticas.`,

  "iam.list-policies": `aws iam list-policies — listar políticas

USO
    aws iam list-policies [--scope Local | AWS | All]

ESCOPO
    Local   só as gerenciadas por você (customer managed)
    AWS     só as gerenciadas pela AWS
    All     todas (padrão)

EXEMPLO
    aws iam list-policies --scope AWS

Dica: o ARN e o DefaultVersionId que aparecem aqui são o que você usa
no get-policy-version. Use --scope Local pra ver só as SUAS políticas.`,

  "iam.get-policy": `aws iam get-policy — metadados de uma política

USO
    aws iam get-policy --policy-arn <arn>

EXEMPLO
    aws iam get-policy --policy-arn arn:aws:iam::123456789012:policy/minha-politica

Retorna o DefaultVersionId (a versão ativa), entre outros dados. O JSON
da política em si vem com get-policy-version.`,

  "iam.get-policy-version": `aws iam get-policy-version — pegar o JSON de uma versão

USO
    aws iam get-policy-version --policy-arn <arn> --version-id <vN>

EXEMPLO
    aws iam get-policy-version --policy-arn arn:aws:iam::123456789012:policy/minha-politica --version-id v1

Retorna o documento JSON da política (campo Document). Combine com '>'
pra salvar num arquivo: ... --version-id v1 > politica.json`,

  "iam.list-policy-versions": `aws iam list-policy-versions

USO
    aws iam list-policy-versions --policy-arn <arn>

Lista as versões da política e indica qual é a padrão (IsDefaultVersion).`,

  "iam.create-policy-version": `aws iam create-policy-version

USO
    aws iam create-policy-version --policy-arn <arn> --policy-document file://<doc.json> [--set-as-default]

EXEMPLO
    aws iam create-policy-version --policy-arn arn:aws:iam::123456789012:policy/minha-politica --policy-document file://politica-publica.json --set-as-default

Cria uma nova versão (v2, v3...). Com --set-as-default ela vira a ativa.`,

  "iam.delete-policy": `aws iam delete-policy

USO
    aws iam delete-policy --policy-arn <arn>`,

  "iam.detach-user-policy": `aws iam detach-user-policy

USO
    aws iam detach-user-policy --user-name <usuário> --policy-arn <arn>

O contrário do attach-user-policy: tira a política do usuário.`,

  "iam.detach-group-policy": `aws iam detach-group-policy

USO
    aws iam detach-group-policy --group-name <grupo> --policy-arn <arn>`,

  "iam.detach-role-policy": `aws iam detach-role-policy

USO
    aws iam detach-role-policy --role-name <role> --policy-arn <arn>`,

  "iam.remove-user-from-group": `aws iam remove-user-from-group

USO
    aws iam remove-user-from-group --user-name <usuário> --group-name <grupo>

Tira o usuário do grupo (precisa fazer isso antes de apagar um grupo cheio).`,

  "iam.delete-group": `aws iam delete-group

USO
    aws iam delete-group --group-name <nome>

Só funciona com o grupo VAZIO — remova os membros antes com
remove-user-from-group.`,

  "iam.delete-role": `aws iam delete-role

USO
    aws iam delete-role --role-name <nome>`,

  "iam.create-user": `aws iam create-user

USO
    aws iam create-user --user-name <nome>

EXEMPLO
    aws iam create-user --user-name fulano`,

  "iam.list-users": `aws iam list-users

USO
    aws iam list-users`,

  "iam.delete-user": `aws iam delete-user

USO
    aws iam delete-user --user-name <nome>`,

  "iam.create-group": `aws iam create-group

USO
    aws iam create-group --group-name <nome>

EXEMPLO
    aws iam create-group --group-name grupo-exemplo

Grupos servem pra dar permissões a várias pessoas de uma vez.`,

  "iam.list-groups": `aws iam list-groups

USO
    aws iam list-groups`,

  "iam.add-user-to-group": `aws iam add-user-to-group

USO
    aws iam add-user-to-group --user-name <usuário> --group-name <grupo>

EXEMPLO
    aws iam add-user-to-group --user-name fulano --group-name grupo-exemplo`,

  "iam.get-group": `aws iam get-group

USO
    aws iam get-group --group-name <nome>

Mostra o grupo e quem está dentro dele.`,

  "iam.attach-user-policy": `aws iam attach-user-policy

USO
    aws iam attach-user-policy --user-name <usuário> --policy-arn <arn>

EXEMPLO
    aws iam attach-user-policy --user-name fulano --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess`,

  "iam.attach-group-policy": `aws iam attach-group-policy

USO
    aws iam attach-group-policy --group-name <grupo> --policy-arn <arn>

EXEMPLO
    aws iam attach-group-policy --group-name grupo-exemplo --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess`,

  "iam.list-attached-user-policies": `aws iam list-attached-user-policies

USO
    aws iam list-attached-user-policies --user-name <usuário>`,

  "iam.create-role": `aws iam create-role — criar papel (role)

USO
    aws iam create-role --role-name <nome>
        --assume-role-policy-document file://<trust.json>

EXEMPLO
    aws iam create-role --role-name role-exemplo --assume-role-policy-document file://trust.json

Uma role é uma identidade que SERVIÇOS assumem (ex.: uma função Lambda).
O trust policy diz QUEM pode assumir a role. Existe um trust.json
pronto no disco local (digite 'ls').`,

  "iam.list-roles": `aws iam list-roles

USO
    aws iam list-roles`,

  "iam.attach-role-policy": `aws iam attach-role-policy

USO
    aws iam attach-role-policy --role-name <role> --policy-arn <arn>

EXEMPLO
    aws iam attach-role-policy --role-name role-exemplo --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole`,

  lambda: `aws lambda — funções serverless
===============================

COMANDOS
    create-function                  cria uma função
    list-functions                   lista as funções
    get-function                     detalhes de uma função
    invoke                           executa a função
    update-function-configuration    altera timeout, memória, variáveis de ambiente
    delete-function                  apaga a função

RUNTIMES ACEITOS
    python3.11, python3.12, python3.13, nodejs18.x, nodejs20.x,
    nodejs22.x, java21, ruby3.3, go1.x

Digite 'aws lambda <comando> help' para detalhes.`,

  "lambda.create-function": `aws lambda create-function

USO
    aws lambda create-function --function-name <nome>
        --runtime <runtime> --role <arn-da-role>
        --handler <arquivo.função> --zip-file fileb://<código.zip>

EXEMPLO
    aws lambda create-function --function-name minha-funcao --runtime python3.12 --role arn:aws:iam::123456789012:role/role-exemplo --handler app.handler --zip-file fileb://app.zip

Existe um app.zip pronto no disco local (digite 'ls').`,

  "lambda.list-functions": `aws lambda list-functions

USO
    aws lambda list-functions`,

  "lambda.get-function": `aws lambda get-function

USO
    aws lambda get-function --function-name <nome>`,

  "lambda.invoke": `aws lambda invoke — executar a função

USO
    aws lambda invoke --function-name <nome> <arquivo-de-saida>

EXEMPLO
    aws lambda invoke --function-name minha-funcao resposta.json

O arquivo de saída recebe a resposta da função.`,

  "lambda.update-function-configuration": `aws lambda update-function-configuration

USO
    aws lambda update-function-configuration --function-name <nome>
        [--timeout <segundos>] [--memory-size <MB>]
        [--environment Variables={CHAVE=valor,OUTRA=valor}]

EXEMPLOS
    aws lambda update-function-configuration --function-name minha-funcao --timeout 15 --memory-size 512
    aws lambda update-function-configuration --function-name minha-funcao --environment Variables={ETAPA=teste}`,

  "lambda.delete-function": `aws lambda delete-function

USO
    aws lambda delete-function --function-name <nome>`,

  dynamodb: `aws dynamodb — banco NoSQL
==========================

COMANDOS
    create-table      cria uma tabela
    list-tables       lista as tabelas
    describe-table    detalhes de uma tabela
    put-item          insere/substitui um item
    get-item          busca um item pela chave
    scan              lista todos os itens
    delete-table      apaga a tabela

Digite 'aws dynamodb <comando> help' para detalhes.`,

  "dynamodb.create-table": `aws dynamodb create-table

USO
    aws dynamodb create-table --table-name <nome>
        --attribute-definitions AttributeName=<attr>,AttributeType=<S|N|B>
        --key-schema AttributeName=<attr>,KeyType=HASH
        --billing-mode PAY_PER_REQUEST

EXEMPLO
    aws dynamodb create-table --table-name catalogo --attribute-definitions AttributeName=produto,AttributeType=S --key-schema AttributeName=produto,KeyType=HASH --billing-mode PAY_PER_REQUEST

TIPOS: S = string, N = número, B = binário.
PAY_PER_REQUEST = paga por requisição (sem capacidade provisionada).`,

  "dynamodb.list-tables": `aws dynamodb list-tables

USO
    aws dynamodb list-tables`,

  "dynamodb.describe-table": `aws dynamodb describe-table

USO
    aws dynamodb describe-table --table-name <nome>`,

  "dynamodb.put-item": `aws dynamodb put-item

USO
    aws dynamodb put-item --table-name <nome> --item '<json>'

EXEMPLO
    aws dynamodb put-item --table-name catalogo --item '{"produto": {"S": "café"}, "preco": {"N": "25"}}'

O JSON usa o formato do DynamoDB: cada valor declara o tipo
("S" string, "N" número). Use aspas simples por fora.`,

  "dynamodb.get-item": `aws dynamodb get-item

USO
    aws dynamodb get-item --table-name <nome> --key '<json>'

EXEMPLO
    aws dynamodb get-item --table-name catalogo --key '{"produto": {"S": "café"}}'`,

  "dynamodb.scan": `aws dynamodb scan

USO
    aws dynamodb scan --table-name <nome>

Retorna TODOS os itens da tabela (na vida real, cuidado: scan em
tabela grande custa caro e é lento).`,

  "dynamodb.delete-table": `aws dynamodb delete-table

USO
    aws dynamodb delete-table --table-name <nome>`,

  sts: `aws sts — security token service

COMANDOS
    get-caller-identity    mostra quem você é (conta, usuário, ARN)

EXEMPLO
    aws sts get-caller-identity

É o "whoami" da AWS — ótimo pra conferir com que credenciais
você está operando.`,

  "sts.get-caller-identity": `aws sts get-caller-identity

USO
    aws sts get-caller-identity

Retorna o id da conta, o usuário e o ARN da sessão atual.`,

  cloudformation: `aws cloudformation — Infraestrutura como Código (IaC)

Em vez de criar recursos um a um, você descreve tudo num TEMPLATE
(YAML ou JSON) e o CloudFormation cria/atualiza/apaga em conjunto,
como uma "stack". Apagar a stack remove todos os recursos dela.

COMANDOS
    create-stack               provisiona os recursos de um template
    list-stacks                lista as stacks da conta
    describe-stacks            detalhes de uma ou de todas as stacks
    describe-stack-resources   recursos criados por uma stack
    validate-template          confere se o template é válido
    delete-stack               apaga a stack e seus recursos

Tipos de recurso suportados no simulador: AWS::S3::Bucket,
AWS::IAM::User, AWS::EC2::Instance, AWS::Lambda::Function,
AWS::DynamoDB::Table. Há templates prontos: file://site-s3.yaml e
file://infra.yaml.`,

  "cloudformation.create-stack": `aws cloudformation create-stack

USO
    aws cloudformation create-stack --stack-name <nome> --template-body <template>

O --template-body aceita um arquivo (file://infra.yaml) ou o conteúdo
direto. Cada recurso do template é criado de verdade na conta.

EXEMPLO
    aws cloudformation create-stack --stack-name app --template-body file://infra.yaml`,

  "cloudformation.list-stacks": `aws cloudformation list-stacks

USO
    aws cloudformation list-stacks

Lista as stacks da conta com nome e status.`,

  "cloudformation.describe-stacks": `aws cloudformation describe-stacks

USO
    aws cloudformation describe-stacks [--stack-name <nome>]

Sem --stack-name, mostra todas. Traz status, descrição e id da stack.`,

  "cloudformation.describe-stack-resources": `aws cloudformation describe-stack-resources

USO
    aws cloudformation describe-stack-resources --stack-name <nome>

Lista os recursos (lógico -> físico) que a stack criou.`,

  "cloudformation.validate-template": `aws cloudformation validate-template

USO
    aws cloudformation validate-template --template-body <template>

Confere se o template é válido (tem a seção Resources) antes de criar.`,

  "cloudformation.delete-stack": `aws cloudformation delete-stack

USO
    aws cloudformation delete-stack --stack-name <nome>

Apaga a stack e TODOS os recursos que ela criou. Não responde nada
quando dá certo (igual ao AWS de verdade).`,

  // ===== VPC (subcomandos do aws ec2) =====
  "ec2.create-vpc": `aws ec2 create-vpc\n\nUSO\n    aws ec2 create-vpc --cidr-block 10.0.0.0/16\n\nCria sua rede privada (VPC). O CIDR define a faixa de IPs.`,
  "ec2.describe-vpcs": `aws ec2 describe-vpcs\n\nUSO\n    aws ec2 describe-vpcs\n\nLista as VPCs da conta (com VpcId e CidrBlock).`,
  "ec2.delete-vpc": `aws ec2 delete-vpc\n\nUSO\n    aws ec2 delete-vpc --vpc-id <vpc-id>\n\nApaga uma VPC (e as sub-redes dela neste simulador).`,
  "ec2.create-subnet": `aws ec2 create-subnet\n\nUSO\n    aws ec2 create-subnet --vpc-id <vpc-id> --cidr-block 10.0.1.0/24\n\nCria uma sub-rede dentro de uma VPC.`,
  "ec2.describe-subnets": `aws ec2 describe-subnets\n\nUSO\n    aws ec2 describe-subnets\n\nLista as sub-redes (SubnetId, VpcId, AZ).`,
  "ec2.create-internet-gateway": `aws ec2 create-internet-gateway\n\nUSO\n    aws ec2 create-internet-gateway\n\nCria um internet gateway (a saída da VPC pra internet).`,
  "ec2.attach-internet-gateway": `aws ec2 attach-internet-gateway\n\nUSO\n    aws ec2 attach-internet-gateway --internet-gateway-id <igw-id> --vpc-id <vpc-id>\n\nConecta o internet gateway a uma VPC.`,

  // ===== RDS =====
  rds: `aws rds — banco de dados relacional gerenciado\n\nCOMANDOS\n    create-db-instance     cria um banco (MySQL, Postgres...)\n    describe-db-instances  lista os bancos\n    start-db-instance      liga um banco parado\n    stop-db-instance       para (não cobra computação)\n    delete-db-instance     apaga o banco\n\nEngines: mysql, postgres, mariadb, aurora-mysql, aurora-postgresql, sqlserver-ex, oracle-se2.`,
  "rds.create-db-instance": `aws rds create-db-instance\n\nUSO\n    aws rds create-db-instance --db-instance-identifier <nome> --db-instance-class db.t3.micro --engine mysql --master-username admin --allocated-storage 20\n\nSobe um banco relacional gerenciado.`,
  "rds.describe-db-instances": `aws rds describe-db-instances\n\nUSO\n    aws rds describe-db-instances\n\nLista as instâncias de banco e seus endpoints.`,
  "rds.start-db-instance": `aws rds start-db-instance\n\nUSO\n    aws rds start-db-instance --db-instance-identifier <nome>\n\nLiga um banco que estava parado.`,
  "rds.stop-db-instance": `aws rds stop-db-instance\n\nUSO\n    aws rds stop-db-instance --db-instance-identifier <nome>\n\nPara o banco (economiza — não cobra computação).`,
  "rds.delete-db-instance": `aws rds delete-db-instance\n\nUSO\n    aws rds delete-db-instance --db-instance-identifier <nome> --skip-final-snapshot\n\nApaga o banco. Em produção, guarde um snapshot final antes!`,

  // ===== CloudWatch =====
  cloudwatch: `aws cloudwatch — métricas e alarmes\n\nCOMANDOS\n    put-metric-alarm   cria/atualiza um alarme\n    describe-alarms    lista os alarmes\n    delete-alarms      apaga alarmes\n    list-metrics       lista métricas disponíveis\n\nPra logs use 'aws logs'.`,
  "cloudwatch.put-metric-alarm": `aws cloudwatch put-metric-alarm\n\nUSO\n    aws cloudwatch put-metric-alarm --alarm-name <nome> --metric-name CPUUtilization --namespace AWS/EC2 --threshold 80 --comparison-operator GreaterThanThreshold\n\nDispara quando a métrica cruza o limite.`,
  "cloudwatch.describe-alarms": `aws cloudwatch describe-alarms\n\nUSO\n    aws cloudwatch describe-alarms\n\nLista os alarmes e o estado de cada um.`,
  "cloudwatch.delete-alarms": `aws cloudwatch delete-alarms\n\nUSO\n    aws cloudwatch delete-alarms --alarm-names <nome> [<nome2> ...]\n\nApaga um ou mais alarmes.`,
  "cloudwatch.list-metrics": `aws cloudwatch list-metrics\n\nUSO\n    aws cloudwatch list-metrics\n\nLista métricas disponíveis (por namespace).`,

  // ===== CloudWatch Logs =====
  logs: `aws logs — CloudWatch Logs\n\nCOMANDOS\n    create-log-group     cria um grupo de logs\n    describe-log-groups  lista os grupos\n    delete-log-group     apaga um grupo`,
  "logs.create-log-group": `aws logs create-log-group\n\nUSO\n    aws logs create-log-group --log-group-name /climb/app\n\nCria um grupo onde os logs ficam guardados.`,
  "logs.describe-log-groups": `aws logs describe-log-groups\n\nUSO\n    aws logs describe-log-groups\n\nLista os grupos de logs.`,
  "logs.delete-log-group": `aws logs delete-log-group\n\nUSO\n    aws logs delete-log-group --log-group-name /climb/app\n\nApaga um grupo de logs.`,

  // ===== SQS (filas) =====
  sqs: `aws sqs — filas de mensagens (Simple Queue Service)\n\nA fila desacopla: quem produz joga a tarefa nela e segue a vida; quem\nconsome processa no ritmo dele. Se o consumidor cair, nada se perde.\n\nCOMANDOS\n    create-queue           cria uma fila\n    list-queues            lista as filas\n    get-queue-url          descobre a URL de uma fila pelo nome\n    send-message           coloca uma mensagem na fila\n    receive-message        pega mensagens pra processar\n    delete-message         confirma o processamento (tira da fila)\n    get-queue-attributes   quantas mensagens estão esperando\n    purge-queue            esvazia a fila\n    delete-queue           apaga a fila\n\nATENÇÃO: quase todo comando pede a --queue-url (não o nome).`,
  "sqs.create-queue": `aws sqs create-queue\n\nUSO\n    aws sqs create-queue --queue-name pedidos-novos\n    aws sqs create-queue --queue-name pagamentos.fifo --attributes FifoQueue=true\n\nCria a fila e devolve a QueueUrl. Fila FIFO garante a ORDEM e exige\nnome terminando em .fifo.`,
  "sqs.list-queues": `aws sqs list-queues\n\nUSO\n    aws sqs list-queues\n\nLista as URLs das filas da conta.`,
  "sqs.get-queue-url": `aws sqs get-queue-url\n\nUSO\n    aws sqs get-queue-url --queue-name pedidos-novos\n\nDescobre a URL a partir do nome da fila.`,
  "sqs.send-message": `aws sqs send-message\n\nUSO\n    aws sqs send-message --queue-url <url> --message-body "pedido 1001"\n\nColoca uma mensagem na fila. Devolve o MessageId.`,
  "sqs.receive-message": `aws sqs receive-message\n\nUSO\n    aws sqs receive-message --queue-url <url> [--max-number-of-messages 10]\n\nPega mensagens pra processar. Cada uma vem com um ReceiptHandle —\nguarde: é o comprovante que o delete-message pede.`,
  "sqs.delete-message": `aws sqs delete-message\n\nUSO\n    aws sqs delete-message --queue-url <url> --receipt-handle <handle>\n\nConfirma que a mensagem foi processada e tira ela da fila. Sem isso\nela volta a ficar visível — é assim que a SQS garante que nenhuma\ntarefa se perde se o processador cair no meio.`,
  "sqs.get-queue-attributes": `aws sqs get-queue-attributes\n\nUSO\n    aws sqs get-queue-attributes --queue-url <url> --attribute-names All\n\nMostra ApproximateNumberOfMessages (esperando),\nApproximateNumberOfMessagesNotVisible (sendo processadas) e o ARN.`,
  "sqs.purge-queue": `aws sqs purge-queue\n\nUSO\n    aws sqs purge-queue --queue-url <url>\n\nDescarta TODAS as mensagens da fila (não tem volta).`,
  "sqs.delete-queue": `aws sqs delete-queue\n\nUSO\n    aws sqs delete-queue --queue-url <url>\n\nApaga a fila inteira.`,

  // ===== SNS (notificações) =====
  sns: `aws sns — notificações (Simple Notification Service)\n\nÉ o megafone: você publica num TÓPICO e todo mundo que ASSINOU recebe\n(e-mail, SMS, fila SQS, Lambda...). Um publica, muitos recebem.\n\nCOMANDOS\n    create-topic                 cria um tópico\n    list-topics                  lista os tópicos\n    subscribe                    inscreve alguém no tópico\n    list-subscriptions-by-topic  lista quem assinou\n    publish                      publica uma mensagem\n    unsubscribe                  cancela uma assinatura\n    delete-topic                 apaga o tópico`,
  "sns.create-topic": `aws sns create-topic\n\nUSO\n    aws sns create-topic --name alertas-loja\n\nCria o tópico e devolve o TopicArn (guarde: os outros pedem ele).`,
  "sns.list-topics": `aws sns list-topics\n\nUSO\n    aws sns list-topics\n\nLista os ARNs dos tópicos da conta.`,
  "sns.subscribe": `aws sns subscribe\n\nUSO\n    aws sns subscribe --topic-arn <arn> --protocol email --notification-endpoint voce@exemplo.com\n    aws sns subscribe --topic-arn <arn> --protocol sqs --notification-endpoint <arn-da-fila>\n\nPROTOCOLOS: email, sms, sqs, lambda, https, http\n\nE-mail e SMS entram como "pending confirmation": a pessoa precisa\nconfirmar antes de começar a receber.`,
  "sns.list-subscriptions-by-topic": `aws sns list-subscriptions-by-topic\n\nUSO\n    aws sns list-subscriptions-by-topic --topic-arn <arn>\n\nLista as assinaturas do tópico (protocolo e endpoint de cada uma).`,
  "sns.publish": `aws sns publish\n\nUSO\n    aws sns publish --topic-arn <arn> --message "Estoque acabando"\n\nEnvia a mensagem pra TODOS os assinantes. Se uma fila SQS assinou,\na mensagem cai dentro dela (é o padrão fan-out).`,
  "sns.unsubscribe": `aws sns unsubscribe\n\nUSO\n    aws sns unsubscribe --subscription-arn <arn-da-assinatura>\n\nCancela uma assinatura. Pegue o ARN no list-subscriptions-by-topic.`,
  "sns.delete-topic": `aws sns delete-topic\n\nUSO\n    aws sns delete-topic --topic-arn <arn>\n\nApaga o tópico e todas as assinaturas dele.`,

  // ===== EBS (discos — dentro do aws ec2) =====
  "ec2.create-volume": `aws ec2 create-volume\n\nUSO\n    aws ec2 create-volume --availability-zone us-east-1a --size 10 --volume-type gp3\n\nCria um disco EBS. Ele nasce numa ZONA e só encaixa em instância da\nmesma zona. Tipos: gp2, gp3, io1, io2, st1, sc1, standard.`,
  "ec2.describe-volumes": `aws ec2 describe-volumes\n\nUSO\n    aws ec2 describe-volumes\n\nLista os volumes, o tamanho e em qual instância cada um está preso.`,
  "ec2.attach-volume": `aws ec2 attach-volume\n\nUSO\n    aws ec2 attach-volume --volume-id vol-xxxx --instance-id i-xxxx --device /dev/sdf\n\nEncaixa o disco na máquina. Depois, dentro do Linux, ainda é preciso\nformatar e montar (mkfs / mount).`,
  "ec2.detach-volume": `aws ec2 detach-volume\n\nUSO\n    aws ec2 detach-volume --volume-id vol-xxxx\n\nTira o disco da máquina (obrigatório antes de apagar o volume).`,
  "ec2.delete-volume": `aws ec2 delete-volume\n\nUSO\n    aws ec2 delete-volume --volume-id vol-xxxx\n\nApaga o disco. CUIDADO: volume solto (sem instância) continua\ncustando — é o desperdício mais comum numa conta AWS.`,
  "ec2.create-snapshot": `aws ec2 create-snapshot\n\nUSO\n    aws ec2 create-snapshot --volume-id vol-xxxx --description "backup-diario"\n\nTira uma "foto" do disco (backup incremental, guardado no S3).`,
  "ec2.describe-snapshots": `aws ec2 describe-snapshots\n\nUSO\n    aws ec2 describe-snapshots\n\nLista os snapshots da conta.`,

  // ===== API Gateway =====
  apigateway: `aws apigateway — APIs HTTP gerenciadas\n\nA porta de entrada da aplicação: recebe a requisição HTTP e encaminha\n(pra uma Lambda, um servidor, outro serviço).\n\nORDEM DE MONTAGEM\n    1. create-rest-api      cria a API (guarde o id)\n    2. get-resources        pega o id do recurso raiz "/"\n    3. create-resource      cria o caminho (ex.: /pedidos)\n    4. put-method           define o verbo (GET, POST...)\n    5. create-deployment    publica num estágio (ex.: prod)\n\nOUTROS\n    get-rest-apis    lista as APIs\n    get-stages       lista os estágios publicados\n    delete-rest-api  apaga a API`,
  "apigateway.create-rest-api": `aws apigateway create-rest-api\n\nUSO\n    aws apigateway create-rest-api --name api-loja\n\nCria a API e devolve o id (os outros comandos pedem --rest-api-id).`,
  "apigateway.get-rest-apis": `aws apigateway get-rest-apis\n\nUSO\n    aws apigateway get-rest-apis\n\nLista as REST APIs da conta com seus ids.`,
  "apigateway.get-resources": `aws apigateway get-resources\n\nUSO\n    aws apigateway get-resources --rest-api-id <id>\n\nLista os caminhos da API. O recurso com path "/" é a raiz — é o id\ndele que vai no --parent-id do create-resource.`,
  "apigateway.create-resource": `aws apigateway create-resource\n\nUSO\n    aws apigateway create-resource --rest-api-id <id> --parent-id <id-do-pai> --path-part pedidos\n\nCria um caminho pendurado no pai (a raiz ou outro recurso).`,
  "apigateway.put-method": `aws apigateway put-method\n\nUSO\n    aws apigateway put-method --rest-api-id <id> --resource-id <id> --http-method GET --authorization-type NONE\n\nDefine qual verbo HTTP o caminho aceita.\n--authorization-type NONE = aberto; AWS_IAM = exige credencial.`,
  "apigateway.create-deployment": `aws apigateway create-deployment\n\nUSO\n    aws apigateway create-deployment --rest-api-id <id> --stage-name prod\n\nPublica a API num ESTÁGIO. Enquanto não houver deployment, nada do\nque você configurou responde pro mundo.`,
  "apigateway.get-stages": `aws apigateway get-stages\n\nUSO\n    aws apigateway get-stages --rest-api-id <id>\n\nLista os estágios publicados e a URL de cada um.`,
  "apigateway.delete-rest-api": `aws apigateway delete-rest-api\n\nUSO\n    aws apigateway delete-rest-api --rest-api-id <id>\n\nApaga a API inteira (recursos, métodos e estágios juntos).`,

  // ===== Route 53 (DNS) =====
  route53: `aws route53 — DNS gerenciado\n\nTraduz nome (climb-labs.com) em endereço (203.0.113.10). A "hosted zone"\né o conjunto de registros de um domínio.\n\nCOMANDOS\n    create-hosted-zone           cria a zona de um domínio\n    list-hosted-zones            lista as zonas\n    list-resource-record-sets    lista os registros da zona\n    change-resource-record-sets  cria/atualiza/apaga registros\n    delete-hosted-zone           apaga a zona\n\nTIPOS DE REGISTRO comuns: A (aponta pra um IP), CNAME (apelido pra\noutro nome), MX (e-mail), TXT (verificações), NS/SOA (a AWS cria).`,
  "route53.create-hosted-zone": `aws route53 create-hosted-zone\n\nUSO\n    aws route53 create-hosted-zone --name climb-labs.com --caller-reference climb-1\n\n--caller-reference é um texto único que VOCÊ inventa: repetindo a\nchamada com o mesmo valor, a AWS não cria duplicado.\nA zona já nasce com os registros NS e SOA.`,
  "route53.list-hosted-zones": `aws route53 list-hosted-zones\n\nUSO\n    aws route53 list-hosted-zones\n\nLista as zonas e seus ids (formato /hostedzone/ZXXXX).`,
  "route53.list-resource-record-sets": `aws route53 list-resource-record-sets\n\nUSO\n    aws route53 list-resource-record-sets --hosted-zone-id <id>\n\nLista todos os registros DNS da zona.`,
  "route53.change-resource-record-sets": `aws route53 change-resource-record-sets\n\nUSO\n    aws route53 change-resource-record-sets --hosted-zone-id <id> --change-batch file://registro-dns.json\n    aws route53 change-resource-record-sets --hosted-zone-id <id> --change-batch '{"Changes":[...]}'\n\nCria (CREATE), substitui (UPSERT) ou remove (DELETE) registros.\nExiste um registro-dns.json pronto no lab — veja com 'cat registro-dns.json'.`,
  "route53.delete-hosted-zone": `aws route53 delete-hosted-zone\n\nUSO\n    aws route53 delete-hosted-zone --id <id>\n\nApaga a zona. Só funciona se ela não tiver registros próprios\n(os NS e SOA que a AWS criou não contam).`,

  // ===== CloudFront (CDN) =====
  cloudfront: `aws cloudfront — CDN (rede de entrega de conteúdo)\n\nCopia seu conteúdo pra servidores espalhados pelo mundo: quem acessa do\nJapão pega do Japão, não da Virgínia. Mais rápido pra quem acessa e\nmais barato que servir tudo da origem.\n\nCOMANDOS\n    create-distribution   cria a distribuição (aponta pra uma origem)\n    list-distributions    lista as distribuições\n    get-distribution      detalhes (inclusive o domínio .cloudfront.net)\n    create-invalidation   limpa o cache de um caminho\n    list-invalidations    histórico de limpezas`,
  "cloudfront.create-distribution": `aws cloudfront create-distribution\n\nUSO\n    aws cloudfront create-distribution --origin-domain-name meu-site-climb.s3.amazonaws.com\n\nA ORIGEM é de onde o CloudFront busca o conteúdo original\n(normalmente um bucket S3 ou um load balancer).`,
  "cloudfront.list-distributions": `aws cloudfront list-distributions\n\nUSO\n    aws cloudfront list-distributions\n\nLista as distribuições, o status e o domínio de cada uma.`,
  "cloudfront.get-distribution": `aws cloudfront get-distribution\n\nUSO\n    aws cloudfront get-distribution --id <id>\n\nDetalhes da distribuição, incluindo o DomainName\n(ex.: d123abc.cloudfront.net) que você usa pra acessar.`,
  "cloudfront.create-invalidation": `aws cloudfront create-invalidation\n\nUSO\n    aws cloudfront create-invalidation --distribution-id <id> --paths "/*"\n\nApaga o cache das bordas. Use quando publicou uma versão nova e as\npessoas ainda veem a antiga. "/*" limpa tudo.\n(Na AWS real, invalidação em excesso é cobrada.)`,
  "cloudfront.list-invalidations": `aws cloudfront list-invalidations\n\nUSO\n    aws cloudfront list-invalidations --id <id>\n\nLista as invalidações já pedidas pra essa distribuição.`,

  // ===== ECR (registro de imagens) =====
  ecr: `aws ecr — Elastic Container Registry\n\nO "armário" das imagens de contêiner. A imagem é construída na sua\nmáquina (docker build), enviada pro ECR (docker push) e o ECS/EKS\nbaixa dali pra rodar.\n\nCOMANDOS\n    create-repository       cria um repositório\n    describe-repositories   lista os repositórios\n    get-login-password      senha temporária pro docker login\n    list-images             lista as imagens de um repositório\n    delete-repository       apaga o repositório`,
  "ecr.create-repository": `aws ecr create-repository\n\nUSO\n    aws ecr create-repository --repository-name loja-imagens\n\nCria o repositório e devolve a repositoryUri — é ela que vai na\n"image" da task definition do ECS.`,
  "ecr.describe-repositories": `aws ecr describe-repositories\n\nUSO\n    aws ecr describe-repositories\n\nLista os repositórios da conta com suas URIs.`,
  "ecr.get-login-password": `aws ecr get-login-password\n\nUSO\n    aws ecr get-login-password\n    aws ecr get-login-password | docker login --username AWS --password-stdin <conta>.dkr.ecr.<regiao>.amazonaws.com\n\nGera uma senha temporária (12h) pro Docker autenticar no ECR.`,
  "ecr.list-images": `aws ecr list-images\n\nUSO\n    aws ecr list-images --repository-name loja-imagens\n\nLista as tags de imagem do repositório. As imagens chegam pelo\n'docker push' — isso acontece fora da AWS CLI.`,
  "ecr.delete-repository": `aws ecr delete-repository\n\nUSO\n    aws ecr delete-repository --repository-name loja-imagens [--force]\n\nApaga o repositório. Com imagens dentro, exige --force.`,

  // ===== ECS (contêineres) =====
  ecs: `aws ecs — Elastic Container Service\n\nRoda contêineres sem você cuidar de servidor (Fargate).\n\nAS TRÊS PEÇAS\n    CLUSTER          onde roda\n    TASK DEFINITION  a receita (qual imagem, quanta memória)\n    SERVICE          mantém N cópias da tarefa no ar pra sempre\n\nCOMANDOS\n    create-cluster / list-clusters / delete-cluster\n    register-task-definition / list-task-definitions\n    create-service / list-services / describe-services\n    update-service (escalar)  / delete-service`,
  "ecs.create-cluster": `aws ecs create-cluster\n\nUSO\n    aws ecs create-cluster --cluster-name cluster-loja\n\nCria o cluster (o "lugar" onde as tarefas vão rodar).`,
  "ecs.list-clusters": `aws ecs list-clusters\n\nUSO\n    aws ecs list-clusters\n\nLista os ARNs dos clusters da conta.`,
  "ecs.register-task-definition": `aws ecs register-task-definition\n\nUSO\n    aws ecs register-task-definition --family tarefa-web --container-definitions file://tarefa-web.json\n    aws ecs register-task-definition --family tarefa-web --container-definitions '[{"name":"web","image":"nginx:latest","memory":512}]'\n\nCada registro cria uma REVISÃO nova (tarefa-web:1, :2, :3...) — as\nanteriores continuam existindo, então dá pra voltar atrás.`,
  "ecs.list-task-definitions": `aws ecs list-task-definitions\n\nUSO\n    aws ecs list-task-definitions\n\nLista as task definitions registradas (com a revisão).`,
  "ecs.create-service": `aws ecs create-service\n\nUSO\n    aws ecs create-service --cluster cluster-loja --service-name servico-web --task-definition tarefa-web --desired-count 2\n\nO serviço mantém --desired-count cópias rodando. Se uma cair, o ECS\nsobe outra sozinho.`,
  "ecs.list-services": `aws ecs list-services\n\nUSO\n    aws ecs list-services --cluster cluster-loja\n\nLista os serviços (de um cluster, se você passar --cluster).`,
  "ecs.describe-services": `aws ecs describe-services\n\nUSO\n    aws ecs describe-services --cluster cluster-loja --services servico-web\n\nMostra quantas cópias estão rodando x quantas você pediu.`,
  "ecs.update-service": `aws ecs update-service\n\nUSO\n    aws ecs update-service --cluster cluster-loja --service servico-web --desired-count 5\n\nEscala o serviço (pra cima ou pra baixo) e também troca a versão da\ntask definition em produção.`,
  "ecs.delete-service": `aws ecs delete-service\n\nUSO\n    aws ecs delete-service --cluster cluster-loja --service servico-web\n\nApaga o serviço. Precisa estar com 0 cópias (--desired-count 0) ou\nusar --force.`,
  "ecs.delete-cluster": `aws ecs delete-cluster\n\nUSO\n    aws ecs delete-cluster --cluster cluster-loja\n\nApaga o cluster. Só funciona sem serviços ativos dentro.`,

  // ===== Secrets Manager =====
  secretsmanager: `aws secretsmanager — guarda senhas e chaves\n\nSenha no código vaza no primeiro commit. Aqui o segredo fica cifrado,\ncom permissão por IAM, e a aplicação busca pelo NOME em tempo de\nexecução — trocar a senha não exige novo deploy.\n\nCOMANDOS\n    create-secret      guarda um segredo\n    list-secrets       lista os segredos (sem mostrar valor)\n    get-secret-value   lê o valor\n    update-secret      troca o valor\n    delete-secret      marca pra apagar (com janela de recuperação)\n    restore-secret     desfaz a exclusão agendada`,
  "secretsmanager.create-secret": `aws secretsmanager create-secret\n\nUSO\n    aws secretsmanager create-secret --name senha-banco-loja --secret-string troque-me-123\n\nGuarda o segredo cifrado. O valor pode ser texto ou JSON\n(ex.: {"usuario":"admin","senha":"..."}).`,
  "secretsmanager.list-secrets": `aws secretsmanager list-secrets\n\nUSO\n    aws secretsmanager list-secrets\n\nLista os segredos — repare que o VALOR nunca aparece aqui.`,
  "secretsmanager.get-secret-value": `aws secretsmanager get-secret-value\n\nUSO\n    aws secretsmanager get-secret-value --secret-id senha-banco-loja\n\nDevolve o SecretString. É esta chamada que a aplicação faz ao subir.`,
  "secretsmanager.update-secret": `aws secretsmanager update-secret\n\nUSO\n    aws secretsmanager update-secret --secret-id senha-banco-loja --secret-string senha-nova\n\nCria uma versão nova do valor. Quem lê pelo nome já pega a nova.`,
  "secretsmanager.delete-secret": `aws secretsmanager delete-secret\n\nUSO\n    aws secretsmanager delete-secret --secret-id senha-banco-loja --recovery-window-in-days 7\n    aws secretsmanager delete-secret --secret-id senha-banco-loja --force-delete-without-recovery\n\nPor padrão NÃO apaga na hora: agenda (7 a 30 dias) e dá pra desfazer\ncom restore-secret. O --force apaga de vez, sem volta.`,
  "secretsmanager.restore-secret": `aws secretsmanager restore-secret\n\nUSO\n    aws secretsmanager restore-secret --secret-id senha-banco-loja\n\nCancela a exclusão agendada e devolve o segredo ao normal.`,

  // ===== Step Functions =====
  stepfunctions: `aws stepfunctions — orquestração de passos\n\nQuando um processo tem várias etapas (validar ➜ cobrar ➜ enviar), a\nmáquina de estados coordena, repete o que falhou e mostra em qual\npasso cada execução parou.\n\nCOMANDOS\n    create-state-machine     cria o fluxo (definição em JSON/ASL)\n    list-state-machines      lista os fluxos\n    describe-state-machine   mostra a definição\n    start-execution          roda o fluxo\n    list-executions          histórico de execuções\n    describe-execution       detalhe de uma execução\n    delete-state-machine     apaga o fluxo`,
  "stepfunctions.create-state-machine": `aws stepfunctions create-state-machine\n\nUSO\n    aws stepfunctions create-state-machine --name pedido-fluxo --definition file://maquina-estados.json --role-arn arn:aws:iam::123456789012:role/papel-lambda\n\nA definição é escrita em ASL (Amazon States Language): precisa de\n"StartAt" e "States". Existe um maquina-estados.json pronto no lab.`,
  "stepfunctions.list-state-machines": `aws stepfunctions list-state-machines\n\nUSO\n    aws stepfunctions list-state-machines\n\nLista as máquinas de estados e seus ARNs.`,
  "stepfunctions.describe-state-machine": `aws stepfunctions describe-state-machine\n\nUSO\n    aws stepfunctions describe-state-machine --state-machine-arn <arn>\n\nMostra a definição completa e a role usada.`,
  "stepfunctions.start-execution": `aws stepfunctions start-execution\n\nUSO\n    aws stepfunctions start-execution --state-machine-arn <arn> --input '{"pedido":1001}'\n\nInicia uma execução. O --input é o JSON que chega no primeiro estado.`,
  "stepfunctions.list-executions": `aws stepfunctions list-executions\n\nUSO\n    aws stepfunctions list-executions --state-machine-arn <arn>\n\nLista as execuções e o status de cada uma (RUNNING, SUCCEEDED, FAILED).`,
  "stepfunctions.describe-execution": `aws stepfunctions describe-execution\n\nUSO\n    aws stepfunctions describe-execution --execution-arn <arn>\n\nDetalhe de uma execução: entrada, saída e status.`,
  "stepfunctions.delete-state-machine": `aws stepfunctions delete-state-machine\n\nUSO\n    aws stepfunctions delete-state-machine --state-machine-arn <arn>\n\nApaga a máquina de estados.`,

  // ===== EventBridge (aws events) =====
  events: `aws events — EventBridge (eventos e agendamentos)\n\nDuas utilidades:\n  1. AGENDAR   "todo dia às 3h, chame essa Lambda"\n  2. REAGIR    "quando uma instância EC2 parar, avise no SNS"\n\nUma REGRA define quando dispara; os ALVOS definem quem é chamado.\n\nCOMANDOS\n    put-rule              cria/atualiza a regra\n    list-rules            lista as regras\n    describe-rule         detalhe de uma regra\n    put-targets           liga a regra a um alvo (Lambda, SQS, SNS...)\n    list-targets-by-rule  lista os alvos\n    remove-targets        tira alvos\n    disable-rule / enable-rule   pausa e retoma\n    delete-rule           apaga a regra`,
  "events.put-rule": `aws events put-rule\n\nUSO\n    aws events put-rule --name limpeza-noturna --schedule-expression "rate(1 day)"\n    aws events put-rule --name ec2-parou --event-pattern '{"source":["aws.ec2"]}'\n\nAGENDAMENTO: rate(5 minutes) | rate(1 day) | cron(0 3 * * ? *)\nEVENTO: um padrão que casa com o que acontece na conta.`,
  "events.list-rules": `aws events list-rules\n\nUSO\n    aws events list-rules\n\nLista as regras, o agendamento/padrão e se estão ENABLED.`,
  "events.describe-rule": `aws events describe-rule\n\nUSO\n    aws events describe-rule --name limpeza-noturna\n\nDetalhe de uma regra.`,
  "events.put-targets": `aws events put-targets\n\nUSO\n    aws events put-targets --rule limpeza-noturna --targets '[{"Id":"1","Arn":"arn:aws:lambda:us-east-1:123456789012:function:limpeza"}]'\n\nSem alvo, a regra dispara e não chama ninguém. Cada alvo precisa de\num Id (seu, pra referência) e o Arn de quem será chamado.`,
  "events.list-targets-by-rule": `aws events list-targets-by-rule\n\nUSO\n    aws events list-targets-by-rule --rule limpeza-noturna\n\nLista os alvos ligados à regra.`,
  "events.remove-targets": `aws events remove-targets\n\nUSO\n    aws events remove-targets --rule limpeza-noturna --ids 1\n\nDesliga alvos da regra (pelos Ids).`,
  "events.disable-rule": `aws events disable-rule\n\nUSO\n    aws events disable-rule --name limpeza-noturna\n\nPausa a regra sem apagar (para de disparar, configuração preservada).`,
  "events.enable-rule": `aws events enable-rule\n\nUSO\n    aws events enable-rule --name limpeza-noturna\n\nVolta a disparar uma regra pausada.`,
  "events.delete-rule": `aws events delete-rule\n\nUSO\n    aws events delete-rule --name limpeza-noturna\n\nApaga a regra. Precisa remover os alvos antes (ou usar --force).`,

  // ===== EKS (Kubernetes gerenciado) =====
  eks: `aws eks — Kubernetes gerenciado\n\nA AWS cuida do control plane (o "cérebro" do Kubernetes) e você cuida\ndos seus contêineres. Duas peças:\n    CLUSTER     o control plane (precisa de 2+ sub-redes, em AZs diferentes)\n    NODEGROUP   as máquinas EC2 onde os pods realmente rodam\n\nCOMANDOS\n    create-cluster / list-clusters / describe-cluster / delete-cluster\n    create-nodegroup / list-nodegroups / delete-nodegroup\n    update-kubeconfig   liga o kubectl ao cluster\n\nECS x EKS: o ECS é mais simples e só existe na AWS; o EKS é Kubernetes\nde verdade — mais complexo, mas seu conhecimento vale em qualquer nuvem.`,
  "eks.create-cluster": `aws eks create-cluster\n\nUSO\n    aws eks create-cluster --name cluster-k8s --role-arn <arn-da-role> --resources-vpc-config subnetIds=subnet-aaa1,subnet-bbb2\n\nExige ao menos 2 sub-redes em zonas diferentes (o control plane fica\nespalhado). Na AWS real demora ~10 minutos pra ficar ACTIVE.`,
  "eks.list-clusters": `aws eks list-clusters\n\nUSO\n    aws eks list-clusters\n\nLista os nomes dos clusters EKS da região.`,
  "eks.describe-cluster": `aws eks describe-cluster\n\nUSO\n    aws eks describe-cluster --name cluster-k8s\n\nMostra status, versão do Kubernetes, endpoint e sub-redes.`,
  "eks.update-kubeconfig": `aws eks update-kubeconfig\n\nUSO\n    aws eks update-kubeconfig --name cluster-k8s\n\nEscreve o contexto no ~/.kube/config — é o comando que faz o kubectl\nconseguir falar com o cluster. Depois dele, 'kubectl get nodes' funciona.`,
  "eks.create-nodegroup": `aws eks create-nodegroup\n\nUSO\n    aws eks create-nodegroup --cluster-name cluster-k8s --nodegroup-name nos-app --node-role <arn> --subnets subnet-aaa1 subnet-bbb2\n\nCria o grupo de máquinas que executa os pods. Sem nodegroup o cluster\nexiste, mas não tem onde rodar nada.`,
  "eks.list-nodegroups": `aws eks list-nodegroups\n\nUSO\n    aws eks list-nodegroups --cluster-name cluster-k8s\n\nLista os nodegroups do cluster.`,
  "eks.delete-nodegroup": `aws eks delete-nodegroup\n\nUSO\n    aws eks delete-nodegroup --cluster-name cluster-k8s --nodegroup-name nos-app\n\nApaga o grupo de máquinas.`,
  "eks.delete-cluster": `aws eks delete-cluster\n\nUSO\n    aws eks delete-cluster --name cluster-k8s\n\nApaga o cluster. Só funciona depois de apagar os nodegroups.`,

  // ===== Glue (catálogo de dados) =====
  glue: `aws glue — catálogo de dados e ETL\n\nO Glue guarda o MAPA dos seus dados: quais tabelas existem, quais\ncolunas têm e onde os arquivos estão no S3. Quem consulta é o Athena.\n\nIMPORTANTE: a tabela do Glue é só METADADO. O dado continua no S3 —\ncriar uma tabela não copia nada.\n\nCOMANDOS\n    create-database / get-databases / delete-database\n    create-table / get-tables\n    create-crawler / start-crawler / get-crawler\n\nO CRAWLER é o robô que varre o S3 e descobre as colunas sozinho.`,
  "glue.create-database": `aws glue create-database\n\nUSO\n    aws glue create-database --database-input '{"Name":"dados_loja"}'\n\nCria um banco no catálogo (um agrupador de tabelas).`,
  "glue.get-databases": `aws glue get-databases\n\nUSO\n    aws glue get-databases\n\nLista os bancos do catálogo.`,
  "glue.create-table": `aws glue create-table\n\nUSO\n    aws glue create-table --database-name dados_loja --table-input file://tabela-vendas.json\n\nO TableInput descreve as colunas e o Location (caminho no S3).\nExiste um tabela-vendas.json pronto no lab — veja com 'cat'.`,
  "glue.get-tables": `aws glue get-tables\n\nUSO\n    aws glue get-tables --database-name dados_loja\n\nLista as tabelas do banco, com colunas e caminho no S3.`,
  "glue.create-crawler": `aws glue create-crawler\n\nUSO\n    aws glue create-crawler --name crawler-vendas --role <arn> --database-name dados_loja --targets '{"S3Targets":[{"Path":"s3://meu-bucket/vendas/"}]}'\n\nCria o robô que lê os arquivos do S3 e escreve a tabela sozinho\n(descobre colunas e tipos).`,
  "glue.start-crawler": `aws glue start-crawler\n\nUSO\n    aws glue start-crawler --name crawler-vendas\n\nRoda o crawler agora (também dá pra agendar).`,
  "glue.get-crawler": `aws glue get-crawler\n\nUSO\n    aws glue get-crawler --name crawler-vendas\n\nMostra o estado do crawler (READY, RUNNING, STOPPING).`,
  "glue.delete-database": `aws glue delete-database\n\nUSO\n    aws glue delete-database --name dados_loja\n\nApaga o banco do catálogo. Os arquivos no S3 NÃO são apagados.`,

  // ===== Athena (SQL no S3) =====
  athena: `aws athena — SQL direto nos arquivos do S3\n\nSem servidor, sem carregar nada: o Athena lê o catálogo do Glue pra\nsaber onde estão os dados e roda SQL em cima dos arquivos. Você paga\npor dado escaneado.\n\nO FLUXO É ASSÍNCRONO\n    1. start-query-execution   devolve um QueryExecutionId\n    2. get-query-execution     a consulta terminou? (SUCCEEDED/FAILED)\n    3. get-query-results       traz as linhas\n\nSempre precisa de um bucket de saída (--result-configuration).`,
  "athena.start-query-execution": `aws athena start-query-execution\n\nUSO\n    aws athena start-query-execution --query-string "SELECT * FROM dados_loja.vendas" --result-configuration OutputLocation=s3://meu-bucket-resultados/\n\nEnvia a consulta e devolve o QueryExecutionId. A tabela precisa\nexistir no catálogo do Glue.`,
  "athena.get-query-execution": `aws athena get-query-execution\n\nUSO\n    aws athena get-query-execution --query-execution-id <id>\n\nMostra o estado (QUEUED, RUNNING, SUCCEEDED, FAILED), o motivo do\nerro e quantos bytes foram escaneados (é o que você paga).`,
  "athena.get-query-results": `aws athena get-query-results\n\nUSO\n    aws athena get-query-results --query-execution-id <id>\n\nTraz as linhas do resultado. A PRIMEIRA linha é o cabeçalho com os\nnomes das colunas.`,
  "athena.list-query-executions": `aws athena list-query-executions\n\nUSO\n    aws athena list-query-executions\n\nLista os ids das consultas já executadas.`,

  // ===== KMS (chaves) =====
  kms: `aws kms — Key Management Service\n\nGuarda as chaves que cifram seus dados. O ponto central: a chave\nNUNCA sai do KMS — você manda o dado pra lá pra cifrar/decifrar, e\nquem pode usar a chave é definido por IAM.\n\nCOMANDOS\n    create-key / list-keys / describe-key\n    create-alias / list-aliases      apelido no lugar do id enorme\n    encrypt / decrypt                cifra e decifra\n    enable-key-rotation / get-key-rotation-status\n    disable-key / enable-key\n    schedule-key-deletion / cancel-key-deletion\n\nAPAGAR CHAVE É IRREVERSÍVEL: o que foi cifrado com ela nunca mais abre.\nPor isso a AWS obriga uma espera de 7 a 30 dias.`,
  "kms.create-key": `aws kms create-key\n\nUSO\n    aws kms create-key --description "chave da loja"\n\nCria uma chave simétrica. Anote o KeyId — ou melhor, dê um alias.`,
  "kms.list-keys": `aws kms list-keys\n\nUSO\n    aws kms list-keys\n\nLista os ids das chaves da conta.`,
  "kms.describe-key": `aws kms describe-key\n\nUSO\n    aws kms describe-key --key-id alias/chave-loja\n\nDetalhes da chave: estado, uso e data de exclusão (se agendada).\nAceita o id, o ARN ou o alias.`,
  "kms.create-alias": `aws kms create-alias\n\nUSO\n    aws kms create-alias --alias-name alias/chave-loja --target-key-id <key-id>\n\nO alias precisa começar com "alias/". Com ele você referencia a chave\npor nome — e pode apontar pra outra chave depois sem mexer no código.`,
  "kms.list-aliases": `aws kms list-aliases\n\nUSO\n    aws kms list-aliases\n\nLista os aliases e pra qual chave cada um aponta.`,
  "kms.encrypt": `aws kms encrypt\n\nUSO\n    aws kms encrypt --key-id alias/chave-loja --plaintext cartao-1234\n\nDevolve o CiphertextBlob — é ISSO que você guarda no banco/arquivo.\n(No CLImb a "cifra" é didática, não criptografia real.)`,
  "kms.decrypt": `aws kms decrypt\n\nUSO\n    aws kms decrypt --ciphertext-blob <blob>\n\nVolta ao texto original. Repare que você NÃO informa a chave: o blob\njá carrega qual chave foi usada — o KMS descobre sozinho.`,
  "kms.enable-key-rotation": `aws kms enable-key-rotation\n\nUSO\n    aws kms enable-key-rotation --key-id alias/chave-loja\n\nA AWS passa a trocar o material da chave uma vez por ano, sozinha.\nO que já foi cifrado continua abrindo normalmente.`,
  "kms.get-key-rotation-status": `aws kms get-key-rotation-status\n\nUSO\n    aws kms get-key-rotation-status --key-id alias/chave-loja\n\nDiz se a rotação automática está ligada.`,
  "kms.disable-key": `aws kms disable-key\n\nUSO\n    aws kms disable-key --key-id alias/chave-loja\n\nDesliga a chave: ninguém cifra nem decifra com ela até habilitar\nde novo. Reversível (diferente de apagar).`,
  "kms.enable-key": `aws kms enable-key\n\nUSO\n    aws kms enable-key --key-id alias/chave-loja\n\nLiga de volta uma chave desabilitada.`,
  "kms.schedule-key-deletion": `aws kms schedule-key-deletion\n\nUSO\n    aws kms schedule-key-deletion --key-id alias/chave-loja --pending-window-in-days 7\n\nAgenda a destruição (7 a 30 dias — não dá pra apagar na hora).\nÉ IRREVERSÍVEL depois do prazo: dado cifrado com ela vira lixo.`,
  "kms.cancel-key-deletion": `aws kms cancel-key-deletion\n\nUSO\n    aws kms cancel-key-deletion --key-id alias/chave-loja\n\nCancela a exclusão agendada. A chave volta DESABILITADA — ligue com\n'aws kms enable-key'.`,
};

function obterManual(caminho) {
  const m = MANUAIS[caminho];
  if (m) return m;
  // tenta o manual do serviço, se o do comando não existir
  const servico = caminho.split(".")[0];
  if (MANUAIS[servico]) return `(não há manual específico pra '${caminho.replace(".", " ")}')\n\n` + MANUAIS[servico];
  return `Não há manual pra '${caminho.replace(".", " ")}'. Digite 'aws help' pra ver os serviços disponíveis.`;
}
