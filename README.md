# ⚡ CLImb — aprenda AWS CLI digitando de verdade

**▶ Use online: [climb.dev.br](https://climb.dev.br)** — não precisa instalar
nada, não precisa de conta AWS.

Simulador de terminal AWS com **690 atividades em 63 trilhas**. Você digita os
comandos reais (`aws s3 mb`, `aws ec2 run-instances`, `aws iam create-role`...)
e o estado persiste entre eles, como na nuvem de verdade. Não é quiz, não é
vídeo: é terminal.

> Projeto independente e educativo, **sem afiliação, patrocínio ou endosso
> da Amazon**. "AWS" e "Amazon Web Services" são marcas da Amazon.com, Inc.

**Zero dependências, zero custo, zero risco**: tudo roda no navegador com uma
conta AWS 100% simulada. Nenhum comando toca a AWS de verdade — erre a flag à
vontade, a mensagem de erro que aparece é a mesma que a AWS devolveria.

## O que tem dentro

- **690 atividades em 63 trilhas** — de S3, EC2, IAM, Lambda e VPC a ECS, EKS,
  Bedrock, Athena e Step Functions. Cada uma é um pedido de trabalho real
  ("um funcionário saiu, revogue o acesso dele"), não um comando solto.
- **53 lições** explicando cada serviço: o que é, pra que serve, onde se usa e
  **como cobra**. Ficam em [climb.dev.br/aprender](https://climb.dev.br/aprender)
  e dá pra ler sem criar conta —
  [Amazon S3](https://climb.dev.br/aprender/s3),
  [EC2](https://climb.dev.br/aprender/ec2),
  [IAM](https://climb.dev.br/aprender/iam),
  [Lambda](https://climb.dev.br/aprender/lambda),
  [VPC](https://climb.dev.br/aprender/vpc).
- **450 verbetes de manual embutidos**: `aws help`, `aws s3 help`,
  `aws s3 mb help`... igual ao CLI real, em português.
- **Simulado da certificação** Cloud Practitioner (CLF-C02): **345 questões**,
  cada uma com gabarito comentado e link pra fonte oficial da AWS.
  [Sobre a prova](https://climb.dev.br/simulado-aws-clf-c02).
- **Console AWS emulado**: a mesma tarefa feita pela interface gráfica, pra ver
  a diferença entre clicar e digitar.
- **Trilha de Linux e de JSON/YAML**, porque ninguém usa a CLI sem `grep`,
  redirecionamento e `file://`.
- **XP, níveis e sequência de acertos** — de Estagiário de Cloud ☁️ a Lenda do
  CLI 🦸. Revelar a resposta zera o XP daquela atividade; as dicas são grátis.
- **Projetos finais**: completar trilhas destrava sistemas inteiros montados só
  no terminal (site estático no S3, servidor de produção no EC2, API serverless
  com Lambda + DynamoDB + IAM).

Seis trilhas são inteiramente gratuitas e, em todas as outras, as três
primeiras atividades são abertas.

## Como rodar localmente

```bash
node servidor.js          # http://localhost:8741
```

Node puro, sem `npm install` — o projeto não tem dependências. Abrir o
`index.html` direto no navegador funciona pro app, mas as páginas públicas
(`/aprender`, `/simulado-aws-clf-c02`, sitemap) são montadas no servidor.

## Estrutura

```
index.html            página única do app
css/estilo.css        tema escuro com o laranja AWS (+ tema claro opcional)
js/simulador.js       conta AWS virtual + parser + handlers dos comandos
js/manuais.js         os manuais (aws help / serviço / comando)
js/desafios*.js       as atividades, com validador e solução de cada uma
js/servicos-fase*.js  as trilhas por serviço
js/licoes*.js         a parte didática (o que é, pra que serve, como cobra)
js/simulados-clf-*.js banco de questões da certificação
js/jogo.js            XP, níveis, streak, persistência
js/app.js             interface (lista lateral, card, terminal, modais)
servidor.js           servidor + páginas públicas + API de contas/ranking
lib/                  geradores das páginas públicas (lições, simulado, perfil)
teste/fumaca.js       roda a solução de TODAS as atividades e valida
teste/analise.js      coerência didática (ordem, XP, ids, auto-pass)
```

## Contribuindo / adicionando atividades

As regras do projeto estão no [`CLAUDE.md`](CLAUDE.md) — schema da atividade,
ordem didática, armadilhas de validador e o que não pode regredir em
desempenho e acessibilidade.

Antes de qualquer commit:

```bash
node --check js/<arquivo>.js
node teste/fumaca.js      # executa a solução de todas as atividades
node teste/analise.js     # coerência didática
```

Os dois precisam passar verdes.
