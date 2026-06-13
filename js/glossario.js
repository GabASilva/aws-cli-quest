"use strict";
// ============================================================
// AWS CLI Quest — glossario.js
// Botão "📖 Conceitos" + modal com cartões explicando os termos.
// NÃO altera o core: injeta o botão no header e o modal no body.
// ============================================================

const CONCEITOS = [
  { servico: "Geral", termo: "CLI", txt: "Command Line Interface — você controla a AWS digitando comandos, em vez de clicar num site. Mais rápido, automatizável e o que se usa no trabalho de verdade." },
  { servico: "Geral", termo: "Flag (--opção)", txt: "São os parâmetros do comando, sempre começam com --. Ex.: em 'aws s3 mb s3://x', o que vem com -- (quando tem) configura a ação." },
  { servico: "Geral", termo: "ARN", txt: "Amazon Resource Name — o 'endereço' único de qualquer recurso na AWS. Ex.: arn:aws:iam::123456789012:role/papel-lambda." },
  { servico: "Geral", termo: "Região", txt: "O lugar físico (data center) onde seus recursos ficam. Ex.: us-east-1 (Virgínia), sa-east-1 (São Paulo). Aqui usamos us-east-1." },

  { servico: "S3", termo: "Bucket", txt: "Uma 'pasta raiz' na nuvem onde você guarda arquivos. O nome é único no mundo todo. É a primeira coisa que se cria no S3." },
  { servico: "S3", termo: "Objeto", txt: "Cada arquivo guardado dentro de um bucket (uma foto, um CSV, um HTML). Tem uma 'chave' (o caminho/nome) e o conteúdo." },
  { servico: "S3", termo: "Site estático", txt: "O S3 pode servir um site direto do bucket (HTML/CSS/JS), sem servidor. Você define a página inicial e a de erro com 'aws s3 website'." },
  { servico: "S3", termo: "Versionamento", txt: "Quando ligado, o bucket guarda o histórico de cada objeto — dá pra voltar a uma versão antiga se sobrescrever ou apagar sem querer." },

  { servico: "EC2", termo: "Instância", txt: "Uma máquina virtual (um computador na nuvem). Você liga, usa e desliga. É o serviço de 'servidor' mais clássico da AWS." },
  { servico: "EC2", termo: "AMI", txt: "Amazon Machine Image — o 'molde' do sistema da instância (qual SO e softwares vêm instalados). Identificada por ami-xxxxxxxx." },
  { servico: "EC2", termo: "Tipo de instância", txt: "Define o tamanho (CPU/memória) da máquina. Ex.: t2.micro (pequena, de teste), m5.large (mais robusta). Quanto maior, mais cara." },
  { servico: "EC2", termo: "Security Group", txt: "O firewall da instância. Por padrão bloqueia toda entrada; você libera portas específicas (ex.: 80 pra web, 22 pra SSH)." },
  { servico: "EC2", termo: "Key Pair", txt: "Par de chaves (pública/privada) pra acessar a instância via SSH com segurança, sem senha. A AWS guarda a pública; você guarda a privada." },

  { servico: "IAM", termo: "Usuário", txt: "Uma identidade pra uma pessoa (ou app) acessar a conta. Começa sem nenhuma permissão — você concede o que ela pode fazer." },
  { servico: "IAM", termo: "Grupo", txt: "Um conjunto de usuários. Você dá permissões ao grupo de uma vez, e todos os membros herdam. Facilita gerenciar times." },
  { servico: "IAM", termo: "Role (papel)", txt: "Uma identidade que SERVIÇOS assumem (não pessoas). Ex.: uma função Lambda usa uma role pra ter permissão de escrever logs." },
  { servico: "IAM", termo: "Policy (política)", txt: "O documento que diz o que pode ou não ser feito. Você 'anexa' políticas a usuários, grupos ou roles. Ex.: AmazonS3ReadOnlyAccess." },

  { servico: "Lambda", termo: "Função", txt: "Um pedaço de código que roda sob demanda, sem você cuidar de servidor (serverless). Você sobe o código e a AWS executa quando chamado." },
  { servico: "Lambda", termo: "Runtime", txt: "A linguagem/versão que roda sua função. Ex.: python3.12, nodejs20.x, java21." },
  { servico: "Lambda", termo: "Handler", txt: "O ponto de entrada — qual função do seu código a AWS chama. Ex.: 'app.handler' = função handler dentro do arquivo app." },
  { servico: "Lambda", termo: "Invoke", txt: "Executar a função. Você 'invoca' e recebe a resposta. É o teste de fogo pra ver se ela funciona." },

  { servico: "DynamoDB", termo: "Tabela", txt: "Onde os dados ficam, no modelo NoSQL (sem esquema fixo de colunas como no SQL). Você define só a chave primária." },
  { servico: "DynamoDB", termo: "Chave primária", txt: "Identifica cada item de forma única. A 'partition key' (HASH) é obrigatória; opcionalmente há uma 'sort key' (RANGE)." },
  { servico: "DynamoDB", termo: "Item", txt: "Cada registro da tabela (equivale a uma 'linha'). É um conjunto de atributos." },
  { servico: "DynamoDB", termo: "Tipos (S/N/B)", txt: "No JSON do DynamoDB cada valor declara o tipo: S = string (texto), N = number (número), B = binary. Ex.: {\"id\": {\"S\": \"1\"}}." },
  { servico: "DynamoDB", termo: "PAY_PER_REQUEST", txt: "Modo de cobrança em que você paga por requisição, sem reservar capacidade. Simples e bom pra começar." },
];

function montarGlossario() {
  // botão no header
  const header = document.querySelector("header");
  const btnRanking = document.querySelector("#btnRanking");
  if (!header || document.querySelector("#btnConceitos")) return;
  const btn = document.createElement("button");
  btn.id = "btnConceitos";
  btn.className = "botao secundario";
  btn.textContent = "📖 Conceitos";
  btn.title = "Glossário rápido de termos da AWS";
  header.insertBefore(btn, btnRanking || null);

  // modal
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "modalConceitos";
  modal.innerHTML = `
    <div class="modal-caixa modal-largo">
      <h2>📖 Conceitos — glossário rápido</h2>
      <input id="buscaConceito" class="busca-conceito" placeholder="🔎 Filtrar (ex.: bucket, role, runtime...)" autocomplete="off">
      <div id="listaConceitos" class="grade-conceitos"></div>
      <div class="modal-acoes"><button class="botao secundario" data-fechar-conceitos>Fechar</button></div>
    </div>`;
  document.body.appendChild(modal);

  const lista = modal.querySelector("#listaConceitos");
  function pintar(filtro) {
    const f = (filtro || "").toLowerCase().trim();
    const itens = CONCEITOS.filter((c) =>
      !f || c.termo.toLowerCase().includes(f) || c.txt.toLowerCase().includes(f) || c.servico.toLowerCase().includes(f)
    );
    lista.innerHTML = itens.length
      ? itens.map((c) => `<div class="cartao-conceito">
          <div class="cartao-topo"><strong>${c.termo}</strong><span class="tag-servico">${c.servico}</span></div>
          <p>${c.txt}</p>
        </div>`).join("")
      : `<p class="conceito-vazio">Nada encontrado pra "${f}".</p>`;
  }
  pintar("");

  function abrir() { pintar(""); modal.querySelector("#buscaConceito").value = ""; modal.classList.add("aberto"); modal.querySelector("#buscaConceito").focus(); }
  function fechar() { modal.classList.remove("aberto"); }

  btn.addEventListener("click", abrir);
  modal.querySelector("#buscaConceito").addEventListener("input", (e) => pintar(e.target.value));
  modal.querySelector("[data-fechar-conceitos]").addEventListener("click", fechar);
  modal.addEventListener("click", (e) => { if (e.target === modal) fechar(); });
}

document.addEventListener("DOMContentLoaded", montarGlossario);
