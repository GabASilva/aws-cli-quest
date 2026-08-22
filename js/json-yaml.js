"use strict";
// ============================================================
// CLImb — json-yaml.js
// Trilha "📄 JSON e YAML" (id: formatos), em Fundamentos, logo depois do
// Linux essencial — antes de S3/IAM, porque é pré-requisito deles.
//
// POR QUE ELA EXISTE (medido): 42 atividades exigem JSON escrito na linha de
// comando, 49 referenciam um arquivo com file:// e 19 usam --query. São ~15%
// do app. E até agora a pessoa era mandada usar `file://trust.json` dezenas de
// vezes sem NUNCA poder ver o que tem dentro — `cat trust.json` respondia
// "(arquivo de exemplo)". Ela copiava uma string que não entendia.
//
// Esta é a PARTE 1: ler e entender. Ler o arquivo, reconhecer a forma, achar o
// erro, e acertar as aspas no shell. A parte 2 (criar e editar arquivo) entra
// depois, com ids jy-9 em diante — deixados livres de propósito.
//
// A lição das aspas não é teoria: conferi no simulador que
//   --database-input '{"Name":"x"}'    funciona
//   --database-input "{\"Name\":\"x\"}"  falha com "Invalid JSON received"
// e é exatamente esse par que a jy-6 faz a pessoa sentir na mão.
//
// COBERTURA: estas 8 atividades SÃO executadas pelos testes. Elas usam `cat`,
// que antes só existia dentro da camada de UI — e por isso as trilhas de shell
// eram um ponto cego do harness. O linux-lab.js passou a expor
// `executarShellPuro` (núcleo sem DOM), e fumaca.js/analise.js ganharam um
// window/document falso pra carregar os arquivos guardados por `window`.
// Resultado: o harness foi de 583 para 618 atividades executadas.
// Ainda de fora: as 7 da trilha setup, cujo `aws configure` é interativo
// (guarda estado entre linhas) e precisa de extração própria.
// ============================================================

const DESAFIOS_FORMATOS = [
  { id: "jy-1", servico: "formatos", nivel: 1, xp: 40,
    titulo: "Abra a caixa-preta",
    descricao:
      "Daqui a pouco você vai criar uma role com <b>--assume-role-policy-document file://trust.json</b> " +
      "e provavelmente vai copiar isso sem saber o que tem dentro. Não hoje: " +
      "abra o <b>trust.json</b> e veja. " +
      "<small>(uma <b>trust policy</b> responde uma pergunta só: <b>quem pode vestir esta role?</b> " +
      "Ela não fala de bucket nem de tabela — isso é a policy de permissão, que é outro arquivo)</small>",
    dicas: [
      "Se você acabou de terminar o Linux, ainda está dentro de ~/projeto-final — volte pra casa antes.",
      "São dois passos: cd ~   e depois   cat <nome-do-arquivo>",
    ],
    // O `cd ~` não é enfeite: a trilha do Linux termina com `cd projeto-final`
    // (lnx-27), então quem chega aqui está noutra pasta e o `cat` relativo
    // falharia. Voltar pra casa antes de trabalhar é o que se faz de verdade.
    solucao: ["cd ~", "cat trust.json"],
    validar: (c, cmd, ok) => ok && cmd && cmd.sub === "cat" && /trust\.json/.test((cmd.args || []).join(" ")) },

  { id: "jy-2", servico: "formatos", nivel: 1, xp: 40,
    titulo: "Chave, valor, objeto e lista",
    descricao:
      "Abra a <b>politica-publica.json</b> — é ela que deixa um site do S3 visível pra internet. " +
      "Repare em quatro coisas: <b>{ }</b> é um objeto (um conjunto de pares nome/valor), " +
      "<b>[ ]</b> é uma lista, o nome vem sempre <b>entre aspas duplas</b>, e o par é separado por <b>:</b>. " +
      "<small>(o <b>\"Principal\": \"*\"</b> ali dentro é o que significa “qualquer um da internet” — " +
      "um caractere que já vazou muito bucket por aí)</small>",
    dicas: ["Mesmo comando de antes, outro arquivo.", "A forma é: cat <nome-do-arquivo>"],
    solucao: ["cat politica-publica.json"],
    validar: (c, cmd, ok) => ok && cmd && cmd.sub === "cat" && /politica-publica\.json/.test((cmd.args || []).join(" ")) },

  { id: "jy-3", servico: "formatos", nivel: 2, xp: 60,
    titulo: "A vírgula que derruba tudo",
    descricao:
      "Existe uma <b>politica-quebrada.json</b> aí que a AWS recusa. Abra e procure o defeito. " +
      "<small>(é o erro mais comum de todos: <b>vírgula sobrando antes do fecha-chaves</b>. " +
      "JavaScript aceita, YAML nem tem vírgula, mas <b>JSON não perdoa</b> — e a mensagem que a AWS " +
      "devolve costuma apontar a linha errada, o que faz muita gente procurar no lugar errado)</small>",
    dicas: [
      "Abra o arquivo e leia com calma a linha ANTES de cada `}` e `]`.",
      "A forma é: cat politica-quebrada.json — o defeito está no fim de uma das linhas.",
    ],
    solucao: ["cat politica-quebrada.json"],
    validar: (c, cmd, ok) => ok && cmd && cmd.sub === "cat" && /politica-quebrada\.json/.test((cmd.args || []).join(" ")) },

  { id: "jy-4", servico: "formatos", nivel: 1, xp: 40,
    titulo: "O mesmo dado, sem chaves nem aspas",
    descricao:
      "Abra o <b>site-s3.yaml</b>. É a mesma ideia do JSON — nome e valor — mas em <b>YAML</b>: " +
      "sem <b>{ }</b>, sem aspas obrigatórias, e a lista vira <b>-</b> no começo da linha. " +
      "<small>(YAML existe porque template de infraestrutura é escrito e lido por gente. " +
      "Todo YAML válido pode virar JSON e vice-versa — muda a roupa, não o conteúdo)</small>",
    dicas: ["Mesmo `cat`, agora num arquivo .yaml.", "A forma é: cat <nome-do-arquivo>"],
    solucao: ["cat site-s3.yaml"],
    validar: (c, cmd, ok) => ok && cmd && cmd.sub === "cat" && /site-s3\.yaml/.test((cmd.args || []).join(" ")) },

  { id: "jy-5", servico: "formatos", nivel: 2, xp: 60,
    titulo: "Indentação é sintaxe, não enfeite",
    descricao:
      "Abra o <b>infra.yaml</b>, que descreve três recursos de uma vez. Repare que o que diz " +
      "“<b>isto está dentro daquilo</b>” é só o <b>espaço no começo da linha</b> — não há chave nenhuma fechando bloco. " +
      "<small>(por isso YAML quebra com <b>TAB</b>: o formato exige espaços. E um espaço a mais muda " +
      "de qual recurso a propriedade é — o arquivo continua válido e faz outra coisa, que é o pior tipo de bug)</small>",
    dicas: ["Mesmo comando; agora conte os espaços de cada nível.", "A forma é: cat infra.yaml"],
    solucao: ["cat infra.yaml"],
    validar: (c, cmd, ok) => ok && cmd && cmd.sub === "cat" && /infra\.yaml/.test((cmd.args || []).join(" ")) },

  { id: "jy-6", servico: "formatos", nivel: 2, xp: 60,
    titulo: "Aspas: onde quase todo mundo trava",
    descricao:
      "Agora escreva JSON <b>direto no comando</b>, sem arquivo. Crie o catálogo <b>catalogo_formatos</b> " +
      "passando <code>--database-input</code> com o JSON entre <b>aspas simples</b>. " +
      "<small>(não importa o que o Glue faz agora — o que importa é a regra: o JSON usa aspas DUPLAS por dentro, " +
      "então o pacote todo vai entre aspas SIMPLES por fora. Se você trocar e usar duplas nas duas pontas, " +
      "o shell come as de dentro e a AWS responde <b>Invalid JSON received</b>. Pode testar o erro depois)</small>",
    dicas: [
      "Aspas simples por fora, duplas por dentro — nunca o contrário.",
      "A forma é: aws glue create-database --database-input '{\"Name\":\"<nome>\"}'",
    ],
    solucao: ["aws glue create-database --database-input '{\"Name\":\"catalogo_formatos\"}'"],
    // exige o COMANDO, não só o estado: se validasse só pelo banco existir,
    // qualquer comando passaria depois que ele fosse criado uma vez — e o
    // ponto da atividade é justamente rodar isto com as aspas certas.
    validar: (c, cmd, ok) =>
      ok && ehCmd(cmd, "glue", "create-database") &&
      !!(c.glue && c.glue.bancos && c.glue.bancos["catalogo_formatos"]) },

  { id: "jy-7", servico: "formatos", nivel: 2, xp: 60,
    titulo: "Pescar um campo no meio do despejo",
    descricao:
      "Liste os catálogos com <b>aws glue get-databases</b> e repare no tanto de JSON que volta pra dizer um nome. " +
      "Agora peça só o que interessa com <code>--query</code>: os <b>nomes</b> da lista. " +
      "<small>(<code>--query</code> é JMESPath, uma linguagem de caminho dentro do JSON. " +
      "<b>DatabaseList[].Name</b> quer dizer: entre na lista e traga o campo Name de cada item. " +
      "É o que transforma a saída da AWS em algo que dá pra usar num script)</small>",
    dicas: [
      "Primeiro rode sem nada pra ver o despejo inteiro, depois filtre.",
      "A forma é: aws glue get-databases --query 'DatabaseList[].Name'",
    ],
    solucao: [
      "aws glue get-databases",
      "aws glue get-databases --query 'DatabaseList[].Name'",
    ],
    validar: (c, cmd, ok) => ok && ehCmd(cmd, "glue", "get-databases") && !!(cmd.flags && cmd.flags.query) },

  { id: "jy-8", servico: "formatos", nivel: 3, xp: 90,
    titulo: "Do arquivo ao comando",
    descricao:
      "Fecha o ciclo: leia o <b>tarefa-web.json</b> (a receita de um contêiner) e repare que ele começa " +
      "com <b>[</b> — é uma <b>lista</b> de contêineres, não um objeto solto. Depois confira o " +
      "<b>maquina-estados.json</b>, que é um objeto com passos aninhados. " +
      "<small>(saber se o arquivo é lista ou objeto é o que decide se a AWS aceita: passar objeto onde " +
      "ela espera lista dá erro de tipo, não de sintaxe — o JSON está “certo” e mesmo assim não serve)</small>",
    dicas: [
      "São dois `cat`, um em cada arquivo. Olhe o PRIMEIRO caractere de cada um.",
      "A forma é: cat tarefa-web.json  e depois  cat maquina-estados.json",
    ],
    solucao: ["cat tarefa-web.json", "cat maquina-estados.json"],
    validar: (c, cmd, ok) => ok && cmd && cmd.sub === "cat" && /maquina-estados\.json/.test((cmd.args || []).join(" ")) },
];

(function () {
  if (typeof window === "undefined") return;
  if (typeof SERVICOS_META === "undefined" || typeof DESAFIOS === "undefined") return;
  if (SERVICOS_META.some((s) => s.id === "formatos")) return;

  // entra logo depois do Linux essencial — é pré-requisito de IAM e CloudFormation
  const iLinux = SERVICOS_META.findIndex((s) => s.id === "linux");
  const pos = iLinux >= 0 ? iLinux + 1 : 0;
  SERVICOS_META.splice(pos, 0, {
    id: "formatos", nome: "JSON e YAML", subtitulo: "Os arquivos que a AWS lê", icone: "📄",
  });
  for (const d of DESAFIOS_FORMATOS) DESAFIOS.push(d);
})();
