# ⚡ CLImb — treinador de AWS CLI

Simulador gamificado pra aprender a linha de comando da AWS no estilo
boot.dev: XP, níveis, sequência de acertos com bônus, ranking e projetos
finais onde você monta sistemas completos só com comandos.

> Projeto independente e educativo, **sem afiliação, patrocínio ou endosso
> da Amazon**. "AWS" e "Amazon Web Services" são marcas da Amazon.com, Inc.

**Zero dependências, zero custo, zero risco**: tudo roda no navegador com uma
conta AWS 100% simulada. Nenhum comando toca a AWS de verdade.

## Como rodar

Abra o `index.html` direto no navegador — pronto.

Se preferir servir via HTTP (recomendado pra garantir o localStorage):

```
node servidor.js          # http://localhost:8741
```

## Como funciona

- **Trilhas por serviço**: S3, EC2, IAM, Lambda e DynamoDB, cada uma com
  desafios em 3 níveis (Básico → Intermediário → Avançado). Cada desafio
  concluído libera o próximo.
- **Projetos** 🏗️: completar trilhas destrava projetos finais — sistemas
  completos feitos só no CLI (site estático no S3, servidor de produção no
  EC2, onboarding de time no IAM e uma API serverless com Lambda + DynamoDB
  + IAM). Cada projeto é um checklist de etapas validadas em tempo real.
- **XP e níveis**: de Estagiário de Cloud ☁️ até Lenda do CLI 🦸.
- **Sequência de acertos** 🔥: cada desafio seguido sem revelar a resposta
  dá +10% de XP (máximo +50%).
- **Revelar resposta** 👁️: mostra os comandos da solução, mas zera o XP do
  desafio e a sequência. As **dicas** 💡 são sempre grátis.
- **Manuais embutidos**: `aws help`, `aws s3 help`, `aws s3 mb help`...
  igual ao CLI real. O terminal também tem `ls` (arquivos locais fictícios)
  e `clear`.
- **Ranking** 🏆: dispute com a comunidade fictícia do Quest; dá pra trocar
  seu nome no modal.
- **Progresso salvo**: tudo fica no localStorage do navegador (XP, desafios
  e até o estado da sua conta AWS simulada). O botão "Resetar progresso"
  zera tudo.

## Estrutura

```
index.html          página única
css/estilo.css      tema dark com o laranja AWS
js/simulador.js     conta AWS virtual + parser + comandos (s3, s3api, ec2,
                    iam, lambda, dynamodb, sts)
js/manuais.js       manuais (aws help / serviço / comando)
js/desafios.js      37 desafios + 4 projetos, com validadores e soluções
js/jogo.js          XP, níveis, streak, ranking, persistência
js/app.js           interface (sidebar, card, terminal, modais, toasts)
servidor.js         mini servidor estático opcional (node servidor.js)
teste/fumaca.js     teste de ponta a ponta: node teste/fumaca.js
```

## Adicionando desafios novos

1. Em `js/desafios.js`, acrescente um objeto no array `DESAFIOS` com
   `id`, `servico`, `nivel`, `xp`, `titulo`, `descricao`, `dicas`,
   `solucao` e `validar(conta, cmd, ok)`.
2. Se o desafio usar um comando que o simulador ainda não conhece,
   implemente o handler em `js/simulador.js` e o manual em `js/manuais.js`.
3. Rode `node teste/fumaca.js` — ele executa a solução de todos os
   desafios e confere que os validadores passam.
