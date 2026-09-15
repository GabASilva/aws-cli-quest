---
description: Fecha um bloco de trabalho no CLImb — salva na memória o que vale sobreviver, e deixa a árvore num estado seguro para trocar de aparelho ou desligar o PC.
argument-hint: [nota opcional sobre a sessão]
allowed-tools: Bash(git status:*) Bash(git log:*)
---

# Fechar a sessão

## Estado agora

```!
git status --short
```

```!
git log --oneline origin/main..HEAD
```

---

## 1. Decida o que merece virar memória

Olhe o que aconteceu **nesta conversa** e separe o durável do datado.

**Vale guardar** (vai para o vault em
`~/.claude/projects/C--Users-Gabriel-Alves-Desktop-aws-cli-quest/memory/`):

- uma **decisão** e o **porquê** dela ("escolhemos X porque Y")
- uma **armadilha** que custou tempo e não se descobre lendo código
  (ferramenta que mente, padrão de ignore que não casa, binding léxico)
- uma **preferência** que o Gabriel declarou
- um **número medido** (métrica, tempo, custo) — sempre com a data

**Não guarde** (é ruído, e envelhece mal):

- "mudei o arquivo X" → isso é o `git log`, e ele conta melhor
- regra dura → isso é o `CLAUDE.md` do repo
- detalhe que só importava dentro desta conversa

Se nada se encaixar, **não invente memória**. Sessão sem aprendizado durável é
normal — diga isso e siga.

## 2. Escreva

Atualize o arquivo existente que já cobre o assunto, em vez de criar um novo
quase igual. Arquivo novo só quando o assunto não tem casa. Formato: frontmatter
com `name` (igual ao nome do arquivo), `description` e `metadata.type`
(`user` | `feedback` | `project` | `reference`). Ligue aos vizinhos com
`[[nome]]`, e acrescente a linha no `MEMORY.md`.

Datas sempre **absolutas** (`15/09/2026`), nunca "semana passada".

## 3. Teto do vault — a regra que impede o inchaço

Confira o tamanho:

```bash
du -sh ~/.claude/projects/C--Users-Gabriel-Alves-Desktop-aws-cli-quest/memory/
wc -c ~/.claude/projects/C--Users-Gabriel-Alves-Desktop-aws-cli-quest/memory/*.md | sort -n | tail -5
```

Gatilhos:

- **Arquivo único acima de ~6 KB** → ele virou log. Separe o durável, aposente o
  resto.
- **Vault acima de ~60 KB** → hora de consolidar (`/consolidate-memory`).
- **`MEMORY.md` acima de 25 linhas** → o índice deixou de ser índice.

**Seções protegidas, que nunca são arquivadas:** `quem-e-o-gabriel`,
`mapa-do-projeto`, `mapa-dos-arquivos`, `ordem-de-carregamento`,
`comecar-sem-contexto`.

> Isto já aconteceu: o `aws-cli-quest.md` do vault do os-pro chegou a **92 KB**
> de log append-only — maior sozinho que todo este vault — e foi consolidado em
> 15/09/2026. O gatilho existe para não repetir.

## 4. Deixe a árvore segura

Pelo estado no topo:

- **Coisa não commitada?** Commite. Trabalho não commitado é a única coisa
  invisível de qualquer outro aparelho — inclusive do celular.
- **Commit sem push?** Dê push.
- **Publicar é tarefa do Gabriel** — o modo automático bloqueia deploy de
  produção. Entregue o comando pronto, não tente rodar.

## 5. Encerre em três linhas

O que ficou pronto · o que ficou pendente · qual o próximo passo.

Se veio algo em `$ARGUMENTS`, trate como a nota do Gabriel sobre a sessão e
inclua no que for guardado.
