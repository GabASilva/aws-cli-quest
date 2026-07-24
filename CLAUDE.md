# CLAUDE.md — regras do CLImb

> Contexto de negócio e histórico: `memory` da sessão + `docs/`. Este arquivo é
> a regra dura que NÃO pode ser violada, com foco em **criação de atividades**.
> Conversa, código, strings: **português** (tratamento você/seu, nunca tu/teu).
> Labels do Console emulado: **inglês** (fiéis ao AWS real).

## Arquitetura (essencial)

- Vanilla JS, **zero dependências**. Feature nova = **arquivo próprio** em `js/`
  + `<script>` no `index.html` (ordem importa; `mobile-nav.js` é sempre o último).
  Arquivos aditivos usam wrap de globais (`salvarJogo`, `verificarDesafios`,
  `executarLinha`...) e nunca reescrevem `app.js`/`jogo.js`/`simulador.js` inteiros.
- `jogo` é `let` (binding léxico): use `typeof jogo`, **não** `window.jogo`.
- Antes de subir QUALQUER js: `node --check js/<arquivo>.js`.
- Testes obrigatórios: `node teste/fumaca.js` (executa a solução de todos os
  desafios "aws" e valida) e `node teste/analise.js` (coerência didática:
  auto-pass, ordem, XP, ids). **Os dois verdes antes de commitar.**
- Todo comando novo em `SERVICOS` PRECISA de manual em `manuais.js` (o fumaça
  falha sem). O tokenizer remove aspas; validadores de `--query` recebem o valor
  sem aspas.
- Deploy: `flyctl deploy -a aws-cli-quest --yes` (app de infra continua
  `aws-cli-quest`; a marca é CLImb). Feature visível ao aluno vai pro
  `NOVIDADES` no `js/changelog.js` (nunca anúncio solto na UI).

## Changelog — UMA ENTRADA POR DIA (regra de padronização)

O `NOVIDADES` (`js/changelog.js`) tem **uma entrada por dia**, não uma por
mudança — senão vira chat. Ao publicar algo:

- **Já existe entrada do dia de hoje?** COMPLEMENTE ela (adicione ou edite um
  `item`), NÃO crie outra. Só há entrada nova quando vira o dia.
- Mudanças **relacionadas** (ex.: várias levas de serviços novos) viram **um
  item guarda-chuva** com sub-bullets `"• …"`, não vários itens soltos.
- `versao` = a **data pura** (`"2026-07-23"`), sem sufixo a/b/c. É o id que o
  selo "novo" compara com o localStorage.
- Mesmo tom das entradas existentes: PT-BR, você/seu, `<b>`/`<code>` pra
  destaque, foco no que MUDA pro aluno (não no detalhe técnico).

## Regras de ATIVIDADES (siga TODAS ao criar/alterar desafios)

### Schema

```js
{ id, servico, nivel: 1|2|3, xp, titulo, descricao, dicas: [...],
  solucao: ["aws ..."], validar: (conta, cmd, ok) => bool }
```

- `id` único no projeto inteiro, prefixado pela família (`s3-`, `pec2-`, `rel-`,
  `tr-`, `real-`, `lnx-`...). `teste/analise.js` acusa duplicata.
- `titulo` único e específico (nada de repetir "Crie uma role" em dois desafios).
- `descricao` sempre com **cenário de trabalho real** ("O time precisa de...",
  "Um funcionário saiu..."), não comando seco. Nomes de recursos em `<b>`.

### Ordem didática (a regra de ouro)

1. **Um comando novo por atividade.** A atividade que INTRODUZ um comando usa só
   ele (mais, no máximo, comandos já ensinados ANTES na mesma trilha).
2. **Reforço vem logo depois da lição** que ensina o comando — inserir com
   `at("id-da-licao", [...])` (padrão de `desafios-pratica.js`), NUNCA anexado
   no fim da trilha (o fim é o clímax; reforço fácil depois do clímax quebra a
   rampa — é o defeito das caudas atuais de rds/vpc/dynamodb, não repita).
3. **Rampa de nível**: dentro da trilha o `nivel` só sobe (1→1→2→2→3). Nunca
   coloque n3 nas 5 primeiras posições de uma trilha. `teste/analise.js` acusa
   "nível despenca".
4. **Nunca exija o que não foi ensinado**: flag/comando que aparece na solução
   ou é necessário pro validador tem que ter sido introduzido antes na trilha
   (confira a seção "PRIMEIRO USO" do `teste/analise.js`). Exceção: seções
   `adv-*` e `cegas` (desafio às cegas é proposital, avisado na descrição).
5. Trilha nova entra em `SERVICOS_META` ANTES de "projetos". Fluxo padrão de uma
   trilha: observar (list/describe) → criar → usar → configurar → limpar
   (delete) — igual ao ciclo real de trabalho.

### Validadores (onde TODOS os bugs históricos aconteceram)

1. **Criar-e-apagar**: NUNCA valide só com estado negativo
   (`!conta.x["nome"]` já é verdade numa conta limpa = completa sozinho).
   Padrão obrigatório:
   `validar: (c, cmd, ok) => ok && ehCmd(cmd, "svc", "delete-x") && !c.svc.x["nome"]`
2. **Criação/estado**: valide o estado com **nome de recurso único no projeto
   inteiro** (`grep` antes de escolher!). Nome repetido = atividade completa de
   graça porque outra atividade já criou o recurso. Prefixe pelo contexto
   (`tr-`, `lab-`...). Não valide por TIPO de recurso ("alguma t3.micro") — use
   nome, ou valide o comando (`cmd.flags["instance-type"]`).
3. **Listagem/consulta**: valide o comando, não o estado:
   `(c, cmd, ok) => ok && ehCmd(cmd, "iam", "list-users")` (+ flags quando o
   ponto é a flag: `cmd.flags.output === "text"`, `/Arn/.test(cmd.flags.query)`).
4. Validador NUNCA pode lançar exceção em conta vazia (use `?.`/`||{}`/`!!`).
5. Depois de escrever: rode `teste/analise.js` — a seção "Auto-pass" TEM que
   continuar zerada.

### XP e nível (faixas oficiais — fora delas o analise.js avisa)

| nível | uso                          | XP        |
|-------|------------------------------|-----------|
| 1     | 1 comando simples            | 30–60     |
| 2     | 2–3 comandos ou flags novas  | 50–90     |
| 3     | fluxo completo/multi-serviço | 70–160    |
| 3 (cegas/capstone de trilha)  | até 220   |
| projeto (tipo:"projeto")      | 300–600   |

Marco de trilha (1ª criação de recurso do serviço) pode estourar levemente a
faixa (ex.: dyn-2 120xp) — é proposital, comemore o marco.

### Dicas e solução

- `dicas[0]` aponta o caminho sem entregar; a última pode ser o comando quase
  completo. Revelar solução zera o XP — a dica NÃO pode ser a solução literal.
- `solucao` precisa RODAR verde no fumaça (conta compartilhada entre todos os
  desafios do teste: cuidado com nome já usado e com ordem de dependências).
  Placeholders suportados: `<id-da-instância>`, `<vpc-id>`, `<igw-id>`.

### Depois de criar

1. `node --check` em cada arquivo tocado.
2. `node teste/fumaca.js` E `node teste/analise.js` verdes (auto-pass = 0,
   sem id duplicado, sem "solução falhou").
3. Desafios shell/Linux (solução não começa com "aws") não rodam no fumaça —
   teste no preview manualmente.
4. **Serviço novo? Escreva a lição** (`LICOES` + `PORQUE` em `licoes.js`) —
   ver seção "Parte didática". Não é opcional.
5. Entrada no `changelog.js` (NOVIDADES) se for conteúdo visível.
6. Commit em português no padrão `feat(escopo): resumo`.

## Parte didática — OBRIGATÓRIA ao implementar serviço novo (`js/licoes.js`)

Todo serviço com **trilha própria** tem que ganhar a explicação didática junto
com as atividades — não é opcional, é o que faz o CLImb ser um curso e não uma
lista de exercícios. Ao criar uma trilha de serviço novo:

1. **Lição do serviço** em `LICOES[<id-da-trilha>]` com TODOS os campos:
   `{ emoji, titulo, oque, serve, casos: [3 casos reais], vocab: [[termo, def]],
   cobra }`. Tom PT-BR, você/seu, mesma pegada das existentes (analogia no
   `oque`, casos concretos do mundo real, comparação quando ajuda a fixar —
   ex.: "RDS x DynamoDB", "ECS x EKS"). Serviços que rodam sob o motor de
   outro reaproveitam via `LICAO_ALIAS` (ex.: `ebs: "ec2"`).
2. **Porquê de cada comando** em `PORQUE["<servico>.<sub>"]` — uma linha curta
   explicando por que o comando EXISTE (não como digitá-lo; isso a descrição da
   atividade e o `aws <cmd> help` já fazem). É reusado entre todas as atividades
   que usam o mesmo comando.
3. Trilhas de **exercício/reforço** (extras-*, mundo-real, adv-*, projetos,
   diagnóstico) NÃO têm lição de serviço — mas os comandos que elas usam devem
   ter o `PORQUE`. É intencional: exercício não abre com introdução.
4. Confira que ninguém ficou de fora: um serviço com trilha em `SERVICOS_META`
   sem entrada em `LICOES` (e sem alias) é um furo. Nenhum serviço com trilha
   própria pode ficar sem lição.

`licoes.js` é UI pura (wrap idempotente de `renderCard`, injeta via DOM) — não
mexe em validador, então não muda o resultado do fumaça/análise.

O botão **📖 Conceitos** (glossário em modal, `glossario.js`) **FICA** —
decisão do Gabriel (2026-07-23). Ele e as lições coexistem: o glossário é
consulta rápida por termo, as lições são a introdução no fluxo. Não aposentar.

## Simulados (banco de questões)

- NUNCA inventar questão sem verificar o fato em fonte oficial AWS; cada questão
  TEM fonte explícita em `simulados-fontes.js` (`SIMULADOS_FONTE_POR_ID`).
- Schema `{id, d, q, o:[4+], c:[índices], e, multi?}`; `c.length>1` exige
  `multi: true`. Distribuição por domínio segue os pesos do exame (CLF-C02:
  conceitos 24%, segurança 30%, tecnologia 34%, cobrança 12%).

## Segurança / dados

- Nunca commitar `.env`, tokens, `quest-dados.json*`, `painel/config.json`,
  pasta `paginas AWS/` (gitignore cobre — confira com `git status` antes do add;
  NUNCA `git add -A` cego neste repo).
- XP é calculado no cliente: qualquer endpoint novo que receba progresso passa
  por `sanearProgresso` (servidor.js) — não afrouxe os limites.
