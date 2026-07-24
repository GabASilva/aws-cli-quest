"use strict";
// ============================================================
// CLImb — licoes.js
// A parte DIDÁTICA que faltava: antes de "faça", explicar "o que é e por quê".
// Inspirado no boot.dev, onde cada capítulo abre com a explicação do conceito.
//
// COMO APARECE
//  - Um bloco "📚 Entenda o <serviço>" no topo do card da atividade, expansível.
//    Abre sozinho na 1ª atividade de cada trilha (quando você ainda não fez
//    nenhuma dela) e fica recolhido depois — mas sempre a um clique.
//  - Uma linha "💡 Por que este comando" logo abaixo da descrição, explicando
//    pra que serve o comando daquela atividade (reusada entre as atividades
//    que usam o mesmo comando).
//
// ADITIVO: faz wrap de renderCard e injeta os blocos via DOM. Não toca o core.
// ============================================================

// ---------- Lições por serviço (chave = id da trilha) ----------
const LICOES = {
  s3: {
    emoji: "🪣", titulo: "Amazon S3",
    oque: "O S3 (Simple Storage Service) é o \"HD infinito\" da AWS: você joga arquivos lá e eles ficam guardados com segurança, acessíveis de qualquer lugar por uma URL. Não é um sistema de arquivos com pastas de verdade — é um <b>armazenamento de objetos</b>, onde cada arquivo é um objeto identificado por um nome (a \"chave\").",
    serve: "Guardar qualquer coisa que não seja um banco de dados: fotos e vídeos de um app, backups, arquivos que usuários enviam, logs, e até <b>sites estáticos</b> (HTML/CSS/JS) servidos direto do bucket, sem servidor nenhum.",
    casos: [
      "Um app de fotos guarda as imagens dos usuários no S3 e serve pelo link.",
      "O site de uma empresa (páginas estáticas) roda inteiro num bucket, barato e sem manutenção.",
      "Backups automáticos de um banco de dados são despejados num bucket todo dia.",
    ],
    vocab: [
      ["Bucket", "a \"pasta raiz\" na nuvem. O nome é único no mundo TODO — não pode existir outro igual em nenhuma conta."],
      ["Objeto", "cada arquivo dentro do bucket. Tem uma chave (o caminho/nome) e o conteúdo."],
      ["Chave (key)", "o nome completo do objeto, incluindo o \"caminho\": fotos/2026/capa.png."],
      ["Versionamento", "quando ligado, o bucket guarda o histórico de cada objeto — dá pra voltar atrás se sobrescrever sem querer."],
    ],
    cobra: "Você paga pelo que guarda (GB por mês) e pelas requisições. Guardar alguns arquivos custa centavos — por isso é o primeiro serviço que quase todo mundo usa.",
  },

  ec2: {
    emoji: "🖥️", titulo: "Amazon EC2",
    oque: "O EC2 (Elastic Compute Cloud) é um <b>computador que você aluga por hora</b> na nuvem. Você liga uma máquina virtual (uma \"instância\"), instala o que quiser, usa, e desliga quando não precisa mais — pagando só pelo tempo ligado.",
    serve: "Rodar qualquer coisa que precisa de um servidor: um site com backend, uma API, um banco de dados que você mesmo gerencia, um processamento pesado. É o \"servidor clássico\" da nuvem — o mais flexível e o mais antigo da AWS.",
    casos: [
      "O servidor web de uma loja online roda numa instância, atendendo os visitantes.",
      "Um time sobe uma máquina potente por algumas horas pra processar um relatório gigante e desliga depois.",
      "Um servidor de jogo (Minecraft, por exemplo) fica numa instância ligada só nos horários de pico.",
    ],
    vocab: [
      ["Instância", "uma máquina virtual — um computador na nuvem. Você liga (run), para (stop) e encerra (terminate)."],
      ["AMI", "o \"molde\" do sistema: qual SO e softwares já vêm instalados. Identificada por ami-xxxx."],
      ["Tipo de instância", "o tamanho da máquina (CPU/memória). t2.micro é pequena (teste); m5.large é robusta. Maior = mais caro."],
      ["Security Group", "o firewall da instância. Bloqueia tudo por padrão; você libera portas (80 pra web, 22 pra SSH)."],
      ["Key Pair", "par de chaves pra entrar na máquina por SSH com segurança, sem senha."],
    ],
    cobra: "Você paga por hora (ou segundo) de máquina LIGADA. Parar a instância pausa a cobrança de computação — por isso \"desligar o que não usa\" é a economia nº 1 na AWS.",
  },

  iam: {
    emoji: "🔑", titulo: "IAM",
    oque: "O IAM (Identity and Access Management) é o <b>porteiro da sua conta</b>: define QUEM pode fazer O QUÊ. Nada na AWS acontece sem passar por ele. E a regra de ouro é o <b>menor privilégio</b>: cada identidade começa sem poder nada, e você concede só o necessário.",
    serve: "Controlar acesso com precisão: dar ao time de suporte só leitura, à aplicação só a permissão de escrever numa tabela, ao estagiário só um serviço. E permitir que serviços conversem entre si com segurança (uma Lambda que precisa gravar no S3, por exemplo).",
    casos: [
      "Uma empresa cria um usuário IAM pra cada funcionário, com as permissões do cargo dele.",
      "Uma função Lambda recebe uma role que deixa ela (e só ela) escrever numa tabela do DynamoDB.",
      "O time de auditoria ganha um grupo com acesso somente-leitura a tudo, pra investigar sem poder mexer.",
    ],
    vocab: [
      ["Usuário", "identidade de uma PESSOA (ou app fixo). Começa sem nenhuma permissão."],
      ["Grupo", "conjunto de usuários. Dá permissão ao grupo e todos herdam — facilita gerenciar times."],
      ["Role (papel)", "identidade que SERVIÇOS assumem (não pessoas). Ex.: uma Lambda \"veste\" uma role pra ter permissões."],
      ["Policy (política)", "o documento que diz o que pode/não pode. Você anexa a usuários, grupos ou roles."],
      ["Menor privilégio", "conceder só o mínimo necessário. Se vazar, o estrago é limitado."],
    ],
    cobra: "O IAM é <b>gratuito</b>. O que ele controla (os outros serviços) é que custa — mas configurar quem acessa o quê não tem custo nenhum.",
  },

  lambda: {
    emoji: "λ", titulo: "AWS Lambda",
    oque: "Lambda é <b>código que roda sem servidor</b> (serverless). Você não liga máquina nenhuma: sobe uma função, e a AWS a executa quando algo a chama — e some quando termina. Você paga só pelos milissegundos que ela rodou.",
    serve: "Reagir a eventos e rodar tarefas curtas sem manter um servidor ligado à toa: processar um arquivo assim que ele chega no S3, responder a uma requisição de API, redimensionar uma imagem, mandar um e-mail. Se o trabalho é esporádico, sai muito mais barato que um EC2 ligado 24h.",
    casos: [
      "Toda vez que alguém sobe uma foto no S3, uma Lambda gera automaticamente a miniatura.",
      "Uma API de pagamento chama uma Lambda pra processar cada transação — sem servidor ligado esperando.",
      "Uma Lambda roda todo dia à meia-noite (agendada) pra limpar registros velhos do banco.",
    ],
    vocab: [
      ["Função", "o pedaço de código que roda sob demanda. Você sobe o código e a AWS executa quando chamado."],
      ["Runtime", "a linguagem/versão que roda a função. Ex.: python3.12, nodejs20.x."],
      ["Handler", "o ponto de entrada — qual função do seu código a AWS chama. Ex.: app.handler."],
      ["Invoke", "executar a função. Você \"invoca\" e recebe a resposta."],
      ["Role de execução", "a permissão que a função tem (via IAM) pra falar com outros serviços."],
    ],
    cobra: "Você paga por número de execuções e tempo de cada uma (em ms). Tem um nível gratuito generoso — pra pouco tráfego, muitas vezes custa zero.",
  },

  dynamodb: {
    emoji: "🗄️", titulo: "DynamoDB",
    oque: "O DynamoDB é um <b>banco de dados NoSQL</b> totalmente gerenciado: rápido, escala sozinho e você nunca cuida de servidor. Diferente do SQL, ele não tem colunas fixas — cada item pode ter seus próprios atributos. Em troca dessa velocidade, você modela os dados pensando em COMO vai buscá-los.",
    serve: "Guardar dados que precisam ser lidos e escritos muito rápido, em qualquer escala: sessões de usuário, carrinho de compras, catálogo de produtos, placar de um jogo, dados de dispositivos IoT. Quando o tráfego explode, ele aguenta sem você mexer em nada.",
    casos: [
      "Um app de delivery guarda o estado de cada pedido no DynamoDB — leitura instantânea a qualquer escala.",
      "Um jogo mobile grava o progresso de milhões de jogadores sem nenhum servidor de banco pra administrar.",
      "Uma loja mantém o carrinho de cada usuário numa tabela, buscando pela chave (o id do usuário)."
    ],
    vocab: [
      ["Tabela", "onde os dados ficam. Você define só a chave — não um esquema fixo de colunas."],
      ["Partition key (HASH)", "a chave primária obrigatória. Identifica cada item e decide onde ele é guardado."],
      ["Sort key (RANGE)", "chave secundária opcional. Permite ordenar e agrupar itens sob a mesma partition key."],
      ["Item", "cada registro (equivale a uma \"linha\" do SQL). É um conjunto de atributos."],
      ["Tipos S/N/B", "no JSON cada valor declara o tipo: S = texto, N = número, B = binário."],
    ],
    cobra: "No modo PAY_PER_REQUEST você paga por requisição, sem reservar nada — simples e ótimo pra começar. Também tem um nível gratuito.",
  },

  vpc: {
    emoji: "🛜", titulo: "VPC",
    oque: "A VPC (Virtual Private Cloud) é a <b>sua rede privada</b> dentro da AWS — como se você montasse a rede de um escritório, mas na nuvem. Tudo o que você cria (instâncias, bancos) mora dentro de uma VPC, e você controla quem entra, quem sai e por onde.",
    serve: "Isolar e proteger seus recursos: colocar o servidor web numa parte que a internet enxerga (sub-rede pública) e o banco de dados numa parte trancada (sub-rede privada), controlando o tráfego entre eles. É a base de segurança de rede de qualquer arquitetura séria.",
    casos: [
      "Uma aplicação põe o servidor web numa sub-rede pública e o banco numa privada, sem acesso direto da internet.",
      "Uma empresa liga a VPC ao data center dela por VPN, estendendo a rede interna pra nuvem.",
      "Ambientes de produção e de testes ficam em VPCs separadas, sem risco de um afetar o outro.",
    ],
    vocab: [
      ["VPC", "a rede privada. Definida por um bloco de IPs (CIDR), ex.: 10.0.0.0/16."],
      ["Sub-rede (subnet)", "um pedaço da VPC. Pública = tem rota pra internet; privada = não tem."],
      ["Internet Gateway", "a \"porta\" que liga a VPC à internet. Sem ela + uma rota, nada entra ou sai."],
      ["Route table", "a tabela que diz pra onde cada pacote vai. É a rota 0.0.0.0/0 → gateway que torna uma sub-rede pública."],
      ["Network ACL", "firewall da SUB-REDE (o Security Group é o da instância). Vale a regra de menor número."],
    ],
    cobra: "Criar a VPC, sub-redes e o internet gateway é <b>gratuito</b>. Você paga pelos recursos que rodam dentro (instâncias) e por alguns extras (NAT gateway, tráfego entre regiões).",
  },
};

// Trilhas que usam o mesmo motor de outro serviço reaproveitam a lição.
const LICAO_ALIAS = { ebs: "ec2" };

// ---------- "Por que este comando existe" (chave = servico.sub) ----------
// Reutilizado entre todas as atividades que usam o mesmo comando.
const PORQUE = {
  "s3.mb": "\"make bucket\" — cria o balde onde os arquivos vão morar. É sempre o primeiro passo no S3: sem bucket, não há onde guardar nada.",
  "s3.ls": "lista o que você tem — os buckets, ou os objetos dentro de um. É como você confere o que já existe antes de mexer.",
  "s3.cp": "\"copy\" — envia um arquivo pro bucket (upload) ou traz de volta (download). É o comando que efetivamente move seus dados.",
  "s3.rm": "\"remove\" — apaga um objeto do bucket. Cuidado: é imediato e não vai pra lixeira.",
  "s3.sync": "sincroniza uma pasta inteira com o bucket de uma vez — só o que mudou. É como se publica um site ou sobe muitos arquivos.",
  "s3.rb": "\"remove bucket\" — apaga o balde inteiro. A AWS exige que ele esteja vazio (ou --force) pra evitar acidente.",
  "s3.website": "transforma o bucket num site: você diz qual é a página inicial e a de erro, e o S3 serve o HTML direto.",
  "ec2.run-instances": "liga uma máquina nova. É o comando que \"cria o servidor\" — você escolhe a imagem (AMI) e o tamanho (tipo).",
  "ec2.describe-instances": "mostra suas máquinas e o estado de cada uma. É o \"o que eu tenho ligado?\" do EC2.",
  "ec2.stop-instances": "pausa a máquina sem apagá-la — e pausa a cobrança de computação. Você liga de novo quando precisar.",
  "ec2.start-instances": "religa uma máquina que estava parada, do jeito que ela estava.",
  "ec2.terminate-instances": "encerra a máquina de vez (apaga). Diferente de parar: não tem volta.",
  "ec2.create-key-pair": "cria o par de chaves pra você entrar na máquina por SSH com segurança, sem senha.",
  "ec2.create-security-group": "cria o firewall da instância. Ele nasce bloqueando tudo — você abre as portas depois.",
  "ec2.authorize-security-group-ingress": "abre uma porta de ENTRADA no firewall. Ex.: a 80 pra o site responder, a 22 pra SSH.",
  "iam.create-user": "cria uma identidade pra uma pessoa acessar a conta. Ela nasce sem poder fazer nada — você concede depois.",
  "iam.create-group": "cria um grupo pra dar permissões a vários usuários de uma vez. Todo mundo no grupo herda.",
  "iam.create-role": "cria uma identidade pra um SERVIÇO assumir (não uma pessoa). Ex.: a role que uma Lambda \"veste\".",
  "iam.attach-user-policy": "concede uma permissão a um usuário, anexando uma política. É o \"deixar a pessoa fazer X\".",
  "iam.attach-group-policy": "concede a permissão ao grupo inteiro de uma vez.",
  "iam.attach-role-policy": "dá a uma role a permissão de falar com outro serviço.",
  "iam.list-users": "mostra quem tem acesso à conta. O primeiro passo de qualquer auditoria de segurança.",
  "lambda.create-function": "sobe uma função nova: o código, a linguagem (runtime) e a permissão (role) que ela terá.",
  "lambda.invoke": "executa a função agora e te mostra a resposta. É o teste pra ver se ela funciona.",
  "lambda.list-functions": "lista as funções que existem na conta.",
  "lambda.update-function-configuration": "muda a configuração da função (memória, tempo limite, variáveis) sem reenviar o código.",
  "dynamodb.create-table": "cria a tabela e define a chave primária — a decisão mais importante, porque é por ela que você vai buscar.",
  "dynamodb.put-item": "insere (ou substitui) um registro na tabela.",
  "dynamodb.get-item": "busca um item pela chave. É a leitura mais rápida e barata do DynamoDB.",
  "dynamodb.scan": "varre a tabela inteira. Útil, mas caro em tabelas grandes — o normal é buscar pela chave.",
  "dynamodb.list-tables": "lista as tabelas da conta.",
  "ec2.create-vpc": "cria a sua rede privada, definida por um bloco de IPs (CIDR). Tudo mais mora dentro dela.",
  "ec2.create-subnet": "divide a VPC num pedaço menor. É onde as instâncias efetivamente ficam.",
  "ec2.create-internet-gateway": "cria a porta que vai ligar a VPC à internet (ainda precisa conectar e criar a rota).",
  "ec2.attach-internet-gateway": "conecta o gateway à VPC. É um dos passos pra tornar uma sub-rede pública.",
};

(function () {
  if (typeof window === "undefined") return;

  const CHAVE_VISTAS = "climb.licoes.vistas";
  function lerVistas() {
    try { return new Set(JSON.parse(localStorage.getItem(CHAVE_VISTAS) || "[]")); }
    catch (e) { return new Set(); }
  }
  function marcarVista(sid) {
    try { const s = lerVistas(); s.add(sid); localStorage.setItem(CHAVE_VISTAS, JSON.stringify([...s])); }
    catch (e) { /* ok */ }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  // guarda o <b>...</b> que escrevemos de propósito nos textos das lições
  function ricoSeguro(s) {
    return esc(s).replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>")
      .replace(/&lt;i&gt;/g, "<i>").replace(/&lt;\/i&gt;/g, "</i>");
  }

  function licaoDoDesafio(d) {
    if (!d) return null;
    const sid = LICAO_ALIAS[d.servico] || d.servico;
    return LICOES[sid] ? { sid, licao: LICOES[sid] } : null;
  }
  // extrai "servico.sub" do 1º comando "aws ..." da solução
  function porqueDoDesafio(d) {
    if (!d || !Array.isArray(d.solucao)) return null;
    for (const s of d.solucao) {
      const m = String(s).trim().match(/^aws\s+(\S+)\s+(\S+)/);
      if (m && PORQUE[m[1] + "." + m[2]]) return PORQUE[m[1] + "." + m[2]];
    }
    return null;
  }
  // é a 1ª atividade da trilha que o aluno abre (nada concluído ainda)?
  function primeiraDaTrilha(d) {
    try { return typeof progressoServico === "function" && progressoServico(d.servico).feitos === 0; }
    catch (e) { return false; }
  }

  function htmlLicao(sid, licao, aberta) {
    const casos = (licao.casos || []).map((c) => `<li>${ricoSeguro(c)}</li>`).join("");
    const vocab = (licao.vocab || []).map(([t, x]) => `<dt>${esc(t)}</dt><dd>${ricoSeguro(x)}</dd>`).join("");
    return `<details class="licao"${aberta ? " open" : ""} data-sid="${esc(sid)}">
      <summary><span class="licao-emoji">${licao.emoji || "📚"}</span> Entenda o ${esc(licao.titulo)}</summary>
      <div class="licao-corpo">
        <p class="licao-oque">${ricoSeguro(licao.oque)}</p>
        ${licao.serve ? `<div class="licao-sec"><h4>Pra que serve</h4><p>${ricoSeguro(licao.serve)}</p></div>` : ""}
        ${casos ? `<div class="licao-sec"><h4>Onde se usa no mundo real</h4><ul class="licao-casos">${casos}</ul></div>` : ""}
        ${vocab ? `<div class="licao-sec"><h4>Vocabulário</h4><dl class="licao-vocab">${vocab}</dl></div>` : ""}
        ${licao.cobra ? `<p class="licao-cobra">💰 <strong>Como cobra:</strong> ${ricoSeguro(licao.cobra)}</p>` : ""}
      </div>
    </details>`;
  }

  // injeta a lição + o "porquê" no card, DEPOIS do renderCard original
  function injetar() {
    const card = document.querySelector("#cardDesafio");
    if (!card) return;
    const d = (typeof ui !== "undefined" && ui.desafioAtivo && typeof obterDesafio === "function")
      ? obterDesafio(ui.desafioAtivo) : null;
    if (!d) return;
    const desc = card.querySelector(".descricao");
    if (!desc) return;

    // "💡 Por que este comando" logo abaixo da descrição
    const porque = porqueDoDesafio(d);
    if (porque && !card.querySelector(".licao-porque")) {
      const p = document.createElement("p");
      p.className = "licao-porque";
      p.innerHTML = `💡 <strong>Por que este comando:</strong> ${ricoSeguro(porque)}`;
      desc.insertAdjacentElement("afterend", p);
    }

    // bloco "📚 Entenda o <serviço>" no topo (antes da descrição)
    const info = licaoDoDesafio(d);
    if (info && !card.querySelector(".licao")) {
      const vistas = lerVistas();
      const abrir = !vistas.has(info.sid) || primeiraDaTrilha(d);
      const wrap = document.createElement("div");
      wrap.innerHTML = htmlLicao(info.sid, info.licao, abrir);
      const bloco = wrap.firstElementChild;
      const titulo = card.querySelector("h2");
      if (titulo) titulo.insertAdjacentElement("afterend", bloco);
      else desc.insertAdjacentElement("beforebegin", bloco);
      // abrir a lição = considerá-la vista (não reabre sozinha na próxima)
      bloco.addEventListener("toggle", () => { if (bloco.open) marcarVista(info.sid); });
      if (abrir) marcarVista(info.sid);
    }
  }

  // wrap do renderCard: roda o original e injeta a didática por cima
  function ligar() {
    if (typeof window.renderCard !== "function") return false;
    if (window.renderCard.__climbLicoes) return true;
    const original = window.renderCard;
    window.renderCard = function () {
      const r = original.apply(this, arguments);
      try { injetar(); } catch (e) { /* didática nunca quebra o card */ }
      return r;
    };
    window.renderCard.__climbLicoes = true;
    return true;
  }

  // renderCard é definido em app.js (carrega antes). Garante o wrap.
  if (!ligar()) document.addEventListener("DOMContentLoaded", ligar);
})();
