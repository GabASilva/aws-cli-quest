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
  Placeholders suportados: `<id-da-instância>`, `<vpc-id>`, `<igw-id>` e os
  demais de `teste/placeholders.js` — arquivo ÚNICO que o fumaça e o análise
  usam. Placeholder novo entra lá, uma vez só.

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

## Desempenho e SEO — o que NÃO pode regredir

Tudo abaixo foi **medido** (PageSpeed de 13 a 16/09/2026) e custou trabalho.
Cada regra existe porque a violação dela já aconteceu e apareceu na nota.
Contexto e números: memória `medir-performance`.

### Carregamento

- **Todo `<script>` novo entra com `defer`** e no fim do `<body>`. Sem defer o
  parser para em cada arquivo (eram 1.440 ms). `defer` preserva a ordem — o
  contrato da lista continua valendo.
- **`document.write` é proibido** e nada pode depender de rodar durante o parse.
- Arquivo que só serve DENTRO de tela aberta por clique (banco de dados, desenho
  de tela) não entra no `index.html`: entra em `js/sob-demanda.js`, que carrega
  o grupo no primeiro uso. **Não adie arquivo que cria botão no boot** — o botão
  chegaria atrasado e isso é CLS.
- Pré-carregar em `requestIdleCallback` **mede pior que não fazer nada** (LCP
  7,8 s contra 6,6 s): o ocioso chega logo depois do load e disputa banda. Se
  precisar pré-carregar, espere um sinal de uso (mouse no botão, tecla no
  terminal) — é o que o `sob-demanda.js` faz.

### A tela não pode tremer (CLS)

- **Caixa preenchida por JS precisa de altura reservada no CSS.** A caixa de XP
  nascia com 14px e ia a 56px, empurrando o `<main>`: sozinha, 0,358 de CLS.
- O miolo espera a montagem terminar e aparece pronto (`js/pronto.js` +
  `body:not(.app-pronto) ... visibility:hidden`). Ao mexer nisso:
  - o sinal de "montou" é o DOM ficar **quieto por 150 ms**, e a contagem só
    começa **depois da primeira mudança** — silêncio antes de montar não é fim;
  - **nunca libere dentro de `requestAnimationFrame`**: com a tela invisível o
    navegador não pinta, não gera quadro, e o rAF nunca dispara (isso travou a
    tela até o teto de 2 s e custou o FCP de 0,3 s → 2,2 s);
  - o teto de 2 s e o `<noscript>` do `index.html` são rede de segurança: tela
    em branco é pior que tela tremida. Não remova nenhum dos dois.
- Escreveu no DOM depois da montagem? Reescrever texto igual **conta como
  mudança** e segura a tela. Só escreva quando o valor mudou.

### Acessibilidade (está em 100 — mantenha)

- **Nunca use `opacity` para apagar texto.** Ela derruba o contraste do que está
  embaixo: `.streak` zerada, atividade travada e `.item-meta` estavam entre
  1,9:1 e 4,2:1. O "apagado" vem de COR, e a cor tem de passar 4,5:1 nos **dois
  temas**.
- Par elemento/role tem de ser válido: `<aside role="navigation">` é inválido
  (por isso a lista lateral é `<nav>`); filho de `role="list"` precisa de
  `role="listitem"`.
- **Overlay de tela cheia esconde o resto do app** (`aria-hidden` + `inert`),
  senão o leitor de tela lê o que ninguém está vendo — e o axe audita aquilo.

### Servidor

- A compressão é **síncrona** e trava o event loop. O cache existe e é
  **pré-aquecido no boot** (`aquecerCompressao`), um `setImmediate` por arquivo.
  Não tire: sem ele, quem acorda a máquina paga a compressão de ~100 arquivos e
  o resto entra na fila (foi assim que o `robots.txt` deu timeout e o SEO caiu
  pra 92 com o arquivo intacto).

### Página pública nova (SEO)

Toda rota que o Google pode indexar nasce com: `<title>` único, `meta
description` própria, `rel=canonical` absoluto, HTML **montado no servidor**
(não por JS) e entrada no `sitemap.xml`.

- **Não publique página com menos de ~400 palavras de conteúdo próprio.** As 53
  lições de `/aprender` saíram com ~240 (25% template repetido) e o Google
  rastreou sem indexar nenhuma. Página rasa não é neutra: ela ensina o buscador
  a ignorar o domínio.
- O material para engordar **já existe no repo** (450 verbetes de `MANUAIS`,
  descrição e dicas de 690 atividades, `PORQUE`): use-o antes de escrever texto
  novo. É conteúdo único — ninguém mais tem a saída simulada e a mensagem de
  erro real do comando.
- Página órfã não vale: toda página nova precisa de **link interno** apontando
  pra ela de algum lugar que já é rastreado.

### Antes de dizer que melhorou

Meça **A e B na mesma máquina, no mesmo momento**, com a máquina do Fly já
quente (o TTFB do despertar é 700–930 ms e domina o resultado). E confira o
edge antes: `curl -s -D - -o /dev/null https://climb.dev.br/robots.txt | grep
fly-request-id` tem de terminar em `-gru` — com VPN ligada o tráfego ia por
Paris e **toda** medição saía errada. O número absoluto que vale como "a nota
do site" é o do PageSpeed, não o do Lighthouse local.

## Gabarito fora do cliente (o que é pago não desce pro navegador)

O app é client-side, então até 17/09/2026 um `curl` em `/js/servicos-fase2.js`
devolvia 41 soluções de trilhas pagas — sem login. O bloqueio morava no
`js/licenca.js`, que roda no navegador de quem está olhando.

Agora o servidor **corta `dicas` e `solucao` de todo o JavaScript de conteúdo**
(`lib/sem-gabarito.js`) e devolve por dois canais:

- `/js/gabarito.js` — as atividades **abertas** (trilhas grátis, as 3 primeiras
  de cada trilha e o Desafio do dia). Público e cacheável.
- `GET /api/gabarito` — as **pagas**. Exige token e licença Pro, responde 402
  sem plano, e vai por `fetch` com `Authorization` (nunca `<script src>` com
  token na URL, que vaza em log e Referer).

Ao mexer em atividade, no servidor ou na regra de acesso:

- **`node teste/gabarito.js` TEM que passar**, junto do fumaça e do análise. Ele
  confere as quatro coisas que já quebraram: sintaxe depois do corte, vazamento
  no objeto, o ciclo remover→devolver reproduzindo o conteúdo, e a **contagem**
  da solução no texto servido.
- A regra de quem-vê-o-quê é lida do `js/licenca.js` pelo
  `lib/licenca-servidor.js`. **Não duplique a lista** `SERVICOS_GRATIS` — abrir
  uma trilha lá passa a valer no servidor sozinho.
- Arquivo de atividade novo entra em `ARQUIVOS` de `lib/conteudo-app.js` (mesma
  lista do `teste/analise.js`). Fora dela, o gabarito dele **vaza**.
- O `js/gabarito.js` fica DEPOIS do último arquivo de conteúdo no `index.html`
  (hoje `missoes.js`). Antes dele, o merge alcançou 217 das 293 abertas —
  trilha grátis sem dica é produto quebrado.
- Cortar o gabarito NÃO protege sozinho: o `aquecerCompressao` também tem de
  usar o texto cortado. Na primeira versão ele lia do disco e punha o original
  no cache comprimido — quem aceitava gzip recebia tudo, e um `curl` sem
  compressão parecia limpo. **Teste no navegador, não só com curl.**
- **`[...]` solto dentro de `d(...)` vira `null` no corte** — e o pior caso NÃO
  quebra a sintaxe: `c.iam.usuarios["pedro"]` vira `c.iam.usuariosnull`, o
  validador fica sempre falso e a atividade não completa pra ninguém. Ficou
  assim em produção de 17 a 25/09 em 9 atividades. O `teste/analise.js` acusa
  (seção do corte de gabarito); a regra é: acesso por índice dentro de `d(...)`
  vai **entre parênteses** ou num helper declarado fora.
- O `validar` FICA no cliente, de propósito: 35 dos 556 validadores usam
  helpers do escopo do próprio arquivo, e serializá-los quebraria 6% das
  atividades. Sem dica e sem solução, o validador só confere — não entrega.
- Efeito colateral aceito: quem é Pro e abre o app **sem rede** não recebe o
  gabarito das pagas (antes vinha no pacote). O app funciona, as dicas não.

### O banco do simulado também não é arquivo

As 345 questões (com gabarito e explicação) saem por **`GET /api/simulados/banco`**,
que exige conta — a mesma regra que o `js/simulados-limite.js` já aplicava pra
usar o simulado. Antes, `/js/simulados-clf-1.js` baixava com um `curl`.

- Os arquivos `js/simulados-clf-*.js` e `js/simulados-fontes.js` estão no
  `PROIBIDO` do servidor: respondem **404**, de propósito. Banco novo segue o
  mesmo padrão de nome, ou ele passa a ser servido ao público.
- `js/simulados-arte.js` continua público: é desenho do gabarito comentado, não
  conteúdo.
- Questão nova entra no `ARQUIVOS` de `lib/pagina-simulado.js` (é de lá que a
  rota lê), e a página pública `/simulado-aws-clf-c02` continua mostrando as 12
  de amostra — essa vitrine é intencional.
- **Editar um `js/` sem reiniciar o servidor local engana:** o cache de
  compressão é chaveado por `caminho@VERSAO`, a VERSÃO é calculada no boot, e
  você recebe o arquivo velho. Em produção não acontece (cada deploy muda a
  VERSÃO), mas em teste custou meia hora.

## Segurança / dados

- Nunca commitar `.env`, tokens, `quest-dados.json*`, `painel/config.json`,
  pasta `paginas AWS/` (gitignore cobre — confira com `git status` antes do add;
  NUNCA `git add -A` cego neste repo).
- XP é calculado no cliente: qualquer endpoint novo que receba progresso passa
  por `sanearProgresso` (servidor.js) — não afrouxe os limites.

---

## Trabalho em dois lugares (celular + PC)

O Remote Control (`claude --remote-control <nome>`) faz o celular controlar a
**mesma** sessão que roda no PC — mesma pasta, mesmos arquivos. Não existe
divergência entre os dois por construção. O que quebra é outra coisa:

**1. Comece toda sessão olhando o estado.** Antes de tocar em qualquer arquivo:

```bash
git status                      # tem coisa não commitada de antes?
git log --oneline origin/main..HEAD   # tem commit sem push?
```

Dez segundos que evitam trabalhar em cima de algo esquecido — ou refazer o
que já estava pronto.

**2. Uma sessão por pasta.** Se o Remote Control está de pé, não dirija também
o app de desktop nesta mesma pasta: viram dois trabalhadores editando os
mesmos arquivos sem saber um do outro. `ListAgents` mostra o que está rodando.

**3. Não encerre um bloco de trabalho com coisa não commitada** se houver
chance de trocar de aparelho. Trabalho não commitado é a ÚNICA coisa invisível
de qualquer outro lugar — inclusive do `claude.ai/code`, que enxerga só o que
está no GitHub.

**4. Só publique com a árvore limpa, e dê push ANTES do deploy.**
`flyctl deploy` empacota o **diretório de trabalho**, não o git. Ou seja: dá
pra publicar código que não está commitado, e dá pra achar que publicou algo
que só existia no git. Com a árvore limpa e o push feito antes, "o que está no
ar?" tem uma resposta só.

> Isto já aconteceu: em 25/08 o CSP foi dado como publicado quando ainda estava
> só na máquina — o release mais recente do Fly era de horas antes. A conferência
> que resolve é `flyctl releases -a aws-cli-quest` comparado com `git log`.

---

## Regra nº 0 — NUNCA CHUTAR (não pule esta de jeito nenhum)

Se você não tem a informação, **encontre antes de prosseguir**. Não escreva
"provavelmente é assim", não invente nome de recurso, não suponha parâmetro,
não deduza data. Um `grep` de 5 segundos evita meia hora de retrabalho.

Isto não é teoria — foi assim que quebrou:

| O que chutei | O que era de verdade | Como custou |
|---|---|---|
| tabela `Pedidos` | já existia noutra atividade | smoke test quebrou (conta compartilhada) |
| regra `limpeza-diaria` | `limpeza-noturna` | 2 atividades falharam |
| trilha `trilha-principal` | `trilha-auditoria` | 1 atividade falhou |
| parâmetro `/loja/api-url` | `/loja/url-api` | 1 atividade falhou |
| bucket `site-publico` | não existia | 1 atividade falhou |
| usuário `renata` | `helena` (essa tem política) | 1 atividade falhou |
| data "29 jul" no changelog | era 31 jul | entrada publicada com data errada |

**Antes de escrever, verifique com o comando certo:**

```bash
# nome de recurso já usado? (a conta do smoke test é COMPARTILHADA)
grep -rho 'table-name [A-Za-z][A-Za-z0-9_-]*' js/*.js | sort -u
grep -rho '<comando> --name [a-z0-9-]*' js/*.js | sort -u

# o parâmetro existe mesmo? veja a solução de uma atividade que JÁ funciona
grep -o 'solucao: \["aws <servico> <sub>[^]]*\]' js/*.js | head

# a trilha APAGA o recurso no fim? (se sim, sua atividade tem que criá-lo)
node teste/analise.js 2>&1 | grep -A 20 "^--- <trilha>"

# a data de hoje (nunca deduza do contexto)
date "+%Y-%m-%d"
git log --format="%ad %s" --date=format:"%Y-%m-%d" -5
```

Vale também pra: estado que o handler guarda (leia o código, não suponha o
shape), formato de saída da AWS, e o que já existe em `PORQUE`/`MANUAIS`.
