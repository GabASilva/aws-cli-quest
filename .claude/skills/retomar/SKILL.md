---
description: Orienta uma sessão nova do CLImb em poucos tokens — estado de git, push e publicação já injetados. Aceita um termo para buscar na memória (ex.\: /retomar scrypt).
argument-hint: [termo para buscar na memória]
allowed-tools: Bash(git status:*) Bash(git log:*) Bash(flyctl releases:*) Bash(grep:*)
---

# Retomar o CLImb

O estado abaixo **já foi coletado** — não rode estes comandos de novo.

## Árvore de trabalho

```!
git status --short
```

## Commits sem push

```!
git log --oneline origin/main..HEAD
```

## Últimos commits

```!
git log --oneline -5
```

## O que está publicado

```!
flyctl releases -a aws-cli-quest 2>&1 | head -4
```

---

## O que fazer com isso

1. **Compare** o `git log` com o `flyctl releases`. As três coisas que se perdem
   entre dias são: trabalho não commitado, commit sem push, commit sem publicar.
   Se alguma divergir, **essa é a primeira frase da sua resposta** — não um
   detalhe pro fim.

2. **Não confie no código de saída do `flyctl`** para concluir que algo foi
   publicado. Ele já reportou falha tendo publicado e sucesso sem aplicar.
   Confira pelo conteúdo quando importar (`curl` do ar contra o arquivo local).

3. **O índice da memória já está no seu contexto** (`MEMORY.md` carrega sozinho).
   Não leia o vault inteiro. Abra **só** o arquivo que a tarefa pedir:
   - mexer em arquivo JS → `mapa-dos-arquivos` e `ordem-de-carregamento`
   - preço, plano, limite do grátis → `o-produto`
   - máquina, secret, senha, custo → `infra-e-segredos`
   - ranking, turma, XP, fraude → `turmas-e-ranking`
   - ferramenta se comportando estranho → `armadilhas-de-ambiente`

4. **Se veio um termo em `$ARGUMENTS`**, procure por ele na memória **com grep**,
   não lendo arquivo por arquivo:

   ```bash
   grep -rin "$ARGUMENTS" ~/.claude/projects/C--Users-Gabriel-Alves-Desktop-aws-cli-quest/memory/
   ```

   Leia por inteiro apenas os arquivos que o grep apontar.

5. Antes de commitar qualquer JS: `node --check`, depois `node teste/fumaca.js`
   **e** `node teste/analise.js` — os dois verdes.

Responda em **duas ou três frases**: onde o trabalho parou, o que diverge (se
diverge) e o que você sugere fazer agora. Sem relatório longo.
