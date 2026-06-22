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
};

function obterManual(caminho) {
  const m = MANUAIS[caminho];
  if (m) return m;
  // tenta o manual do serviço, se o do comando não existir
  const servico = caminho.split(".")[0];
  if (MANUAIS[servico]) return `(não há manual específico pra '${caminho.replace(".", " ")}')\n\n` + MANUAIS[servico];
  return `Não há manual pra '${caminho.replace(".", " ")}'. Digite 'aws help' pra ver os serviços disponíveis.`;
}
