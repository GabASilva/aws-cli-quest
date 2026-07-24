"use strict";
// ============================================================
// CLImb — changelog.js
// Página de Novidades (changelog) + Em breve (roadmap).
// Centraliza TODOS os anúncios de atualização num lugar só, em vez de
// deixá-los soltos pela interface. Botão "✨ Novidades" no rodapé com um
// selo de "novo" quando há atualização que a pessoa ainda não viu.
// ADITIVO: não toca o core. window.abrirChangelog('novidades'|'breve').
//
// REGRA DE PADRONIZAÇÃO (decisão do Gabriel, 2026-07-23): UMA ENTRADA POR DIA.
// Não crie entradas novas pra cada mudancinha — parece chat. Ao mexer no
// changelog no MESMO dia de uma entrada que já existe: COMPLEMENTE a entrada
// daquele dia (adicione/edite um item), NÃO crie outra. Mudanças relacionadas
// (ex.: várias levas de serviços novos) viram UM item guarda-chuva com
// sub-bullets "• ", não vários itens soltos. `versao` = a data pura
// ("2026-07-23"), sem sufixo a/b/c. Só há entrada nova quando vira o dia.
// ============================================================
(function () {
  if (typeof window === "undefined") return;

  const CHAVE_VISTO = "climb.changelog.visto"; // guarda a última versão vista

  // Histórico de mudanças — mais recente primeiro. UMA entrada por dia (ver a
  // regra no topo do arquivo). `versao` = data pura, marca o que a pessoa já viu.
  const NOVIDADES = [
    {
      versao: "2026-07-24",
      data: "24 jul 2026",
      titulo: "🗺️ Diagrama da sua arquitetura",
      itens: [
        "Novo botão <b>🗺️ Diagrama</b> no rodapé: ele <b>desenha os recursos da sua conta</b> como um diagrama de arquitetura, agrupados por categoria (rede, computação, dados, integração, identidade e operações) — com a <b>VPC</b> englobando as sub-redes, igual aos diagramas da AWS.",
        "As linhas mostram as <b>relações</b> que dá pra ler da sua conta: <i>fan-out</i> (SNS → SQS), <i>usa</i> (Lambda → role) e <i>protege</i> (Security Group → EC2). Combina com o 🤖 Arquiteto IA e o CloudFormation — você monta a infra e vê ela desenhada.",
        "Dá pra <b>baixar o diagrama</b> como imagem (SVG) pra pôr num documento ou apresentação.",
        "De quebra, aqui nas <b>Novidades</b>: as atualizações de dias anteriores agora vêm <b>recolhidas</b> — clique numa data pra expandir e ver o que mudou.",
      ],
    },
    {
      versao: "2026-07-23",
      data: "23 jul 2026",
      titulo: "🚀 Dia grande: 19 serviços novos, lições, laboratório de diagnóstico e perfil público",
      itens: [
        "<b>19 serviços AWS novos</b> na linha de comando — o CLImb saltou de 272 para <b>430 atividades</b> em <b>40 trilhas</b>, todos com comandos de verdade no terminal e espelhados no Console:",
        "• <b>Mensageria e web</b> — SQS (filas), SNS (notificações com <i>fan-out</i> real), EBS (discos), API Gateway, Route 53 (DNS) e CloudFront (CDN).",
        "• <b>Contêineres e automação</b> — ECR, ECS, Secrets Manager, Step Functions e EventBridge, respeitando os limites reais da AWS (o ECS recusa apagar serviço no ar, o EventBridge recusa apagar regra com alvo).",
        "• <b>Kubernetes e dados</b> — EKS, Glue e Athena (SQL direto no S3, lendo o catálogo do Glue) e KMS (que cifra e decifra de verdade).",
        "• <b>Operações</b> — CloudTrail (que grava tudo o que você roda no terminal), Systems Manager (Parameter Store), Cognito (login pronto) e Auto Scaling (que sobe máquinas de verdade).",
        "<b>📚 O CLImb agora explica antes de mandar fazer:</b> cada trilha abre com um bloco <b>Entenda o serviço</b> (o que é, pra que serve, casos reais, vocabulário e como cobra) e cada atividade ganhou um <b>💡 Por que este comando</b>. Cobrimos os 27 serviços e mais de 170 comandos.",
        "<b>🔧 Nova trilha Diagnóstico:</b> em vez de \"crie X\", você recebe um chamado — a infra já existe e está quebrada, com defeitos plantados, e você investiga e conserta. A rede funciona de verdade: consertou, o site volta na hora. E você comprova a falha nos <b>VPC Flow Logs</b> com <code>grep REJECT</code>.",
        "<b>🪪 Perfil, streak e link público:</b> cartão de progresso com bio e links, mapa de atividade de 20 semanas, <b>streak diário</b> (🔥) e um <b>link público</b> (<code>climb/u/seu-usuario</code>) pra colar no LinkedIn. Dá pra editar o e-mail da conta por ali.",
        "<b>🖥️ Console completo:</b> todas as seções da navegação lateral agora abrem telas fiéis ao AWS real, mostrando os dados da sua conta simulada (volumes, security groups, subnets, parameter groups…).",
        "<b>🎓 Simulados:</b> agora pedem conta (grátis) e são <b>1 por dia</b> no plano gratuito (ilimitado no Pro), com o contador zerando à meia-noite de Brasília.",
        "<b>🔧 Auditoria das atividades:</b> um pente-fino corrigiu 9 desafios que se completavam sozinhos e a ordem de uma trilha, com um teste automático pra manter a coerência daqui pra frente.",
      ],
    },
    {
      versao: "2026-06-28",
      data: "28 jun 2026",
      titulo: "🖥️ Console fiel à AWS, simulados de certificação e app no celular",
      itens: [
        "<b>🎓 Simulados de certificação:</b> nova aba com provas no estilo do <b>AWS Cloud Practitioner (CLF-C02)</b> — banco de <b>+300 questões</b>, 60 sorteadas por prova, <b>gabarito comentado</b> e análise dos erros por domínio.",
        "<b>🖥️ Console com cara de AWS de verdade:</b> agora em <b>dark mode</b>, com a navegação lateral, os dashboards e as telas (títulos, colunas, listas vazias) padronizados conforme o console real — de EC2 e S3 a IAM, Lambda, DynamoDB, VPC, RDS e CloudWatch. <b>SNS e SQS</b> também entraram no Console.",
        "<b>📱 App melhor no celular:</b> os botões do topo viraram um menu ☰, a tela rola normalmente (o rodapé não invade mais o meio) e as tabelas do Console rolam na horizontal.",
        "<b>🐧 +12 desafios de Linux:</b> <code>ls -l</code>, <code>mkdir -p</code>, <code>&gt;&gt;</code>, <code>head</code>, <code>grep</code>, <code>chmod</code>, preparar o <code>.ssh</code> e um projeto final — com o <code>mkdir -p</code> do lab criando os diretórios pais que faltam.",
      ],
    },
    {
      versao: "2026-06-21",
      data: "21 jun 2026",
      titulo: "🛜 VPC/RDS/CloudWatch, turmas, Arquiteto IA e ~300 atividades",
      itens: [
        "<b>🛜🛢️📈 Três serviços novos:</b> VPC (rede), RDS (banco relacional) e CloudWatch (alarmes + Logs) — nas trilhas do terminal <b>e</b> no Console visual, sempre espelhando um ao outro.",
        "<b>🔁 Muito mais prática:</b> chegamos a <b>quase 300 atividades</b>, com cada comando reaparecendo em vários cenários reais (pizzaria, backups, e-commerce…) e os reforços vindo logo depois de cada comando ser ensinado.",
        "<b>👥 Turmas e competições:</b> crie uma turma, compartilhe o código e a galera entra — cada turma tem <b>ranking próprio</b>, em competição assíncrona.",
        "<b>🤖 Arquiteto IA:</b> descreva em português o que você quer e ele monta um <b>template de CloudFormation</b> — dá pra criar o stack na hora.",
        "<b>📧 Confirmação de e-mail</b> (com o Google já vindo confirmado) e o <b>ranking mais seguro</b>, com checagens de sanidade no servidor.",
        "<b>🔬 Saídas mais fiéis à AWS:</b> <code>describe-instances</code> com o JSON completo, IAM com ids e paths, e ajustes finos (nome de tabela do DynamoDB, <code>s3 rm</code> idempotente).",
        "<b>🏅 Níveis recalibrados:</b> 10 títulos, do Estagiário de Cloud à Lenda do CLI.",
      ],
    },
    {
      versao: "2026-06-20",
      data: "20 jun 2026",
      titulo: "🖥️ Console visual (5 serviços) e CloudFormation",
      itens: [
        "<b>🖥️ Console de gerenciamento visual</b> no estilo AWS, cobrindo 5 serviços: <b>S3, EC2, IAM, Lambda e DynamoDB</b> — crie recursos no clique, sem decorar comando. Ele <b>espelha a linha de comando</b>: o que você faz aparece no <code>aws … describe</code>, e vice-versa.",
        "<b>🎯 Missões guiadas no Console:</b> 8 missões que você cumpre <b>fazendo</b> (criar bucket, subir instância, dar permissão…), com XP como os desafios do terminal.",
        "<b>📄 CloudFormation:</b> descreva os recursos num template (YAML/JSON) e o <code>create-stack</code> cria tudo — recursos de verdade, e o <code>delete-stack</code> apaga junto.",
        "<b>✉️ Login por usuário ou e-mail</b> e o primeiro lab de <b>SSH</b> mais fiel (a chave <code>.pem</code>, o <code>ec2-user</code> e o <code>chmod 400</code> obrigatório).",
        "<b>🎯 Saídas e erros mais fiéis à AWS</b> (EC2 e S3), com o aviso do CLImb (⚡) separado da saída do comando quando a AWS não mostra nada.",
      ],
    },
    {
      versao: "2026-06-17",
      data: "17 jun 2026",
      titulo: "⚡ CLImb chega com tudo",
      itens: [
        "Novo nome e cara nova: agora é <b>CLImb</b>.",
        "Trilha <b>🌎 Mundo real</b>: cenários que combinam vários serviços (IAM + DynamoDB + Lambda + S3 + EC2).",
        "Projeto final <b>🛒 Loja completa</b>, montado de ponta a ponta com 4 serviços.",
        "<b>Tutorial guiado</b> pra quem está começando (botão ❔ Como jogar).",
        "Entre com o <b>Google</b>, ative <b>verificação em duas etapas (2FA)</b> e recupere a senha por e-mail.",
        "O app agora atualiza sozinho — sem precisar de Ctrl+F5.",
      ],
    },
    {
      versao: "2026-06-16",
      data: "16 jun 2026",
      titulo: "🎯 Desafios diários e versão Pro",
      itens: [
        "<b>Desafio do dia</b> (com bônus de XP) e <b>Treino aleatório</b> infinito pra praticar.",
        "+30 <b>Missões relâmpago</b>.",
        "Versão gratuita + <b>CLImb Pro</b>, com planos flexíveis.",
      ],
    },
    {
      versao: "2026-06-15",
      data: "15 jun 2026",
      titulo: "🐧 Linux e desafios avançados",
      itens: [
        "Nova trilha <b>Linux essencial</b> — a AWS roda em Linux, então isso é base.",
        "+20 <b>desafios avançados</b> baseados em labs reais.",
        "Laboratório de <b>preparação do ambiente</b>: SSH, instalar e configurar a CLI do zero.",
      ],
    },
    {
      versao: "2026-06-13",
      data: "13 jun 2026",
      titulo: "🤝 Mais ajuda pra quem está começando",
      itens: [
        "<b>Autocomplete</b> no terminal (tecla Tab), <b>glossário</b> de termos, <b>conquistas</b> e mensagens de erro mais amigáveis.",
      ],
    },
    {
      versao: "2026-06-12",
      data: "12 jun 2026",
      titulo: "🚀 Lançamento",
      itens: [
        "Simulador de <b>AWS CLI</b> gamificado: XP, níveis, sequência de acertos e ranking da comunidade.",
        "<b>Conta na nuvem</b> pra salvar o progresso e jogar de qualquer lugar.",
      ],
    },
  ];

  // O que vem por aí — alinhado ao que combinamos (Console → CloudFormation,
  // mais serviços no Console e multiplayer assíncrono).
  const EM_BREVE = [
    {
      icone: "🎓",
      titulo: "Mais certificações nos simulados",
      desc: "Depois do Cloud Practitioner (já no ar), vêm os simulados de Solutions Architect Associate (SAA), SysOps e Developer — com certificado de conclusão.",
    },
    {
      icone: "🧩",
      titulo: "Mais laboratórios de diagnóstico",
      desc: "A trilha 🔧 Diagnóstico estreou com o caso da rede quebrada. Vêm mais plantões: permissão negada no IAM, bucket que não vira site, Lambda que não executa e conta com custo escondido. Tem um problema que te pegou no trabalho? Fale com o responsável pelo app — vira laboratório.",
    },
    {
      icone: "🏁",
      titulo: "Eventos com prazo",
      desc: "Competições cronometradas dentro das turmas (com início e fim), além do ranking contínuo.",
    },
    {
      icone: "👩‍🏫",
      titulo: "Modo professor",
      desc: "Relatório de progresso de cada aluno da turma — pra quem ensina turma de AWS.",
    },
  ];

  const VERSAO_ATUAL = NOVIDADES[0].versao;
  let modal = null;
  let abaAtiva = "novidades";

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function versaoVista() {
    try { return localStorage.getItem(CHAVE_VISTO) || ""; } catch (e) { return ""; }
  }
  function marcarVisto() {
    try { localStorage.setItem(CHAVE_VISTO, VERSAO_ATUAL); } catch (e) {}
    atualizarSelo();
  }
  function temNovidade() {
    return versaoVista() !== VERSAO_ATUAL;
  }
  function atualizarSelo() {
    const selo = document.querySelector("#seloNovidades");
    if (selo) selo.style.display = temNovidade() ? "inline-block" : "none";
  }

  function html() {
    // A entrada mais recente (idx 0) fica aberta; as anteriores colapsadas,
    // clicáveis pra expandir. <details> nativo — não precisa de JS.
    const itensNov = NOVIDADES.map((v, idx) => `
      <details class="cl-versao"${idx === 0 ? " open" : ""}>
        <summary class="cl-versao-cab">
          <h3>${esc(v.titulo)}</h3>
          <span class="cl-data">${esc(v.data)}${idx === 0 ? ' <em class="cl-atual">novo</em>' : ""}</span>
        </summary>
        <ul>${v.itens.map((it) => `<li>${it}</li>`).join("")}</ul>
      </details>`).join("");

    const itensBreve = EM_BREVE.map((e) => `
      <div class="cl-breve-item">
        <div class="cl-breve-ic">${e.icone}</div>
        <div>
          <strong>${esc(e.titulo)}</strong>
          <p>${esc(e.desc)}</p>
        </div>
      </div>`).join("");

    return `
      <div class="modal-caixa cl-caixa">
        <h2>✨ Novidades do CLImb</h2>
        <div class="cl-abas">
          <button class="cl-aba ${abaAtiva === "novidades" ? "ativa" : ""}" data-aba="novidades">📜 O que mudou</button>
          <button class="cl-aba ${abaAtiva === "breve" ? "ativa" : ""}" data-aba="breve">🔭 Em breve</button>
        </div>
        <div class="cl-conteudo" ${abaAtiva === "novidades" ? "" : 'style="display:none"'} data-painel="novidades">
          ${itensNov}
        </div>
        <div class="cl-conteudo" ${abaAtiva === "breve" ? "" : 'style="display:none"'} data-painel="breve">
          <p class="cl-breve-intro">Está em construção e chega por aqui. Sugestões? Manda pra gente! 🙌</p>
          ${itensBreve}
        </div>
        <div class="modal-acoes">
          <button class="botao secundario" data-fechar-cl>Fechar</button>
        </div>
      </div>`;
  }

  function montar() {
    modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "modalChangelog";
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.closest("[data-fechar-cl]")) { fechar(); return; }
      const aba = e.target.closest("[data-aba]");
      if (aba) { abaAtiva = aba.dataset.aba; modal.innerHTML = html(); }
    });
  }

  function abrir(aba) {
    if (!modal) montar();
    abaAtiva = aba === "breve" ? "breve" : "novidades";
    modal.innerHTML = html();
    modal.classList.add("aberto");
    marcarVisto();
  }
  function fechar() {
    if (modal) modal.classList.remove("aberto");
  }

  document.addEventListener("DOMContentLoaded", () => {
    montar();
    // Botão no rodapé, ao lado do "Como jogar"
    const footer = document.querySelector("footer");
    if (footer && !document.querySelector("#btnNovidades")) {
      const b = document.createElement("button");
      b.id = "btnNovidades";
      b.className = "botao secundario";
      b.innerHTML = `✨ Novidades <span id="seloNovidades" class="cl-selo">novo</span>`;
      const comoJogar = document.querySelector("#btnComoJogar");
      if (comoJogar) footer.insertBefore(b, comoJogar.nextSibling);
      else footer.insertBefore(b, footer.firstChild);
      b.addEventListener("click", () => abrir("novidades"));
    }
    atualizarSelo();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && modal.classList.contains("aberto")) fechar();
    });
  });

  window.abrirChangelog = abrir;
})();
