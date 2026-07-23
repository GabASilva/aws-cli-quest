"use strict";
// ============================================================
// CLImb — changelog.js
// Página de Novidades (changelog) + Em breve (roadmap).
// Centraliza TODOS os anúncios de atualização num lugar só, em vez de
// deixá-los soltos pela interface. Botão "✨ Novidades" no rodapé com um
// selo de "novo" quando há atualização que a pessoa ainda não viu.
// ADITIVO: não toca o core. window.abrirChangelog('novidades'|'breve').
// ============================================================
(function () {
  if (typeof window === "undefined") return;

  const CHAVE_VISTO = "climb.changelog.visto"; // guarda a última versão vista

  // Histórico de mudanças — mais recente primeiro. `versao` é o id usado pra
  // marcar o que a pessoa já viu (a 1ª da lista é sempre a "atual").
  const NOVIDADES = [
    {
      versao: "2026-07-23b",
      data: "23 jul 2026",
      titulo: "🖥️ Console completo: todas as seções da nav agora abrem",
      itens: [
        "Todos os itens da navegação lateral do Console que eram \"em branco\" agora abrem <b>telas fiéis ao AWS real</b> (capturadas do console ao vivo): EC2 (Instance Types, Volumes, Snapshots, Security Groups, Key Pairs, AMI Catalog, Spot, Reserved, Dedicated Hosts…), VPC (Subnets, Route tables, Internet gateways, NACLs…), S3, IAM, RDS, CloudWatch, Lambda, DynamoDB e SNS.",
        "Onde a sua conta simulada tem recursos, as listas mostram os <b>dados de verdade</b>: security groups e key pairs criados na CLI, volumes e interfaces de rede das suas instâncias, log groups, subnets, roles/policies e até parameter groups derivados dos seus bancos RDS.",
        "É tudo <b>simulação visual</b> (nada gera custo nem cria recurso novo) — os controles decorativos avisam quando clicados, e as ações de verdade continuam nas telas em destaque e na CLI.",
      ],
    },
    {
      versao: "2026-07-23a",
      data: "23 jul 2026",
      titulo: "🪪 Perfil, streak diário e revisão inteligente",
      itens: [
        "Novo botão <b>🪪 Perfil</b>: seu cartão de progresso com bio, localização e links (GitHub/LinkedIn) editáveis, métricas, conquistas, trilhas e um <b>mapa de atividade</b> das últimas 20 semanas — cada dia estudado acende um quadradinho.",
        "<b>🔥 Streak diário</b>: conclua ao menos 1 atividade por dia e construa sua sequência de dias (chip <b>📅</b> no topo). Marcos de 3, 7, 14, 30, 50 e 100 dias têm comemoração especial.",
        "O <b>🎲 Treino aleatório</b> ficou inteligente: quando você termina o banco, ele vira <b>revisão espaçada</b> — prioriza o que você fez com ajuda e o que fez há mais tempo, pra memória não enferrujar (revisão não repete XP).",
        "A home do <b>Console</b> ganhou os widgets <b>Visitados recentemente</b> e <b>Integridade do serviço</b>, como na página inicial do console real da AWS.",
      ],
    },
    {
      versao: "2026-06-28h",
      data: "28 jun 2026",
      titulo: "🐧 +12 desafios de Linux",
      itens: [
        "A trilha <b>Linux essencial</b> ganhou <b>12 desafios novos</b> com o que mais aparece no dia a dia de cloud: ler permissões com <code>ls -l</code>, criar árvore de pastas com <code>mkdir -p</code>, anexar com <code>&gt;&gt;</code>, ver o começo de um log com <code>head</code>, filtrar com <code>grep</code>, ajustar permissões (<code>chmod</code>), preparar o <code>.ssh</code> e um projeto final juntando tudo.",
        "De quebra, o <code>mkdir -p</code> do laboratório agora cria os diretórios pais que faltam, igual ao Linux de verdade.",
      ],
    },
    {
      versao: "2026-06-28g",
      data: "28 jun 2026",
      titulo: "📱 App melhor no celular",
      itens: [
        "No celular, os botões do topo (Conceitos, Conquistas, Turmas, Simulados, Console, Ranking…) agora ficam num <b>menu ☰</b> — o cabeçalho parou de ocupar meia tela.",
        "A tela agora <b>rola normalmente</b> no celular: o rodapé não invade mais o meio e o terminal ganhou espaço de verdade (o topo fica fixo ao rolar).",
        "As tabelas do Console <b>rolam na horizontal</b> em vez de ficarem espremidas.",
      ],
    },
    {
      versao: "2026-06-28f",
      data: "28 jun 2026",
      titulo: "📋 Telas do Console iguais às da AWS",
      itens: [
        "Padronizamos as telas de <b>IAM, Lambda, DynamoDB, VPC, RDS, CloudWatch</b> (e refinamos EC2/S3/SNS/SQS) com os <b>mesmos títulos e colunas do console real</b> — ex.: DynamoDB agora mostra Status, Partition key, Sort key e capacity mode; RDS mostra Status, Role, Region &amp; AZ.",
        "As mensagens de lista vazia também ficaram iguais às da AWS.",
      ],
    },
    {
      versao: "2026-06-28e",
      data: "28 jun 2026",
      titulo: "🖥️ Dashboard do EC2 igual ao real",
      itens: [
        "O painel do EC2 agora tem o <b>layout de 3 colunas</b> do console real, com os painéis <b>Launch instance</b>, <b>Service health</b> (com a tabela de <b>Zonas</b>), <b>Scheduled events</b>, <b>Account attributes</b>, <b>Explore AWS</b> e <b>Additional information</b> — além do Resources que já existia.",
      ],
    },
    {
      versao: "2026-06-28d",
      data: "28 jun 2026",
      titulo: "📣📨 SNS e SQS no Console + telas mais fiéis",
      itens: [
        "Dois serviços novos no Console: <b>SNS</b> (tópicos/pub-sub) e <b>SQS</b> (filas) — crie, liste e exclua, com Standard e FIFO.",
        "Telas de <b>EC2</b> e <b>S3</b> agora com as <b>colunas iguais às da AWS</b> (ex.: instâncias mostram Nome, ID, Estado, Tipo, Zona de disponibilidade) e as mesmas mensagens de lista vazia.",
      ],
    },
    {
      versao: "2026-06-28c",
      data: "28 jun 2026",
      titulo: "🌙 Console em dark mode, igual ao AWS real",
      itens: [
        "O Console agora é <b>escuro, igual ao console da AWS de verdade</b> (dark mode), e combina com o resto do app.",
        "A <b>navegação lateral</b> de cada serviço foi refeita item por item conforme o console real (EC2, S3, IAM, VPC, RDS) — mesma ordem, grupos e nomes.",
        "Os <b>painéis</b> ganharam o bloco <b>Resources</b> em duas colunas e o <b>Service health</b>, no mesmo formato do AWS.",
      ],
    },
    {
      versao: "2026-06-28b",
      data: "28 jun 2026",
      titulo: "🖥️ Console mais fiel à AWS",
      itens: [
        "Cada serviço agora tem a <b>barra de navegação lateral</b> igual à do console da AWS de verdade (ex.: no EC2 — Instances, Images, Elastic Block Store, Network & Security, Load Balancing, Auto Scaling).",
        "Novo <b>painel (dashboard)</b> por serviço com o resumo de recursos e o status do serviço, no mesmo estilo do console real.",
        "As seções que ainda não fazem parte do CLImb aparecem com o <b>estado-vazio</b> fiel à AWS — você reconhece o layout na hora.",
      ],
    },
    {
      versao: "2026-06-28a",
      data: "28 jun 2026",
      titulo: "🎓 Simulados de certificação (Cloud Practitioner)",
      itens: [
        "Nova aba <b>🎓 Simulados</b> no topo: provas no estilo da certificação <b>AWS Cloud Practitioner (CLF-C02)</b>, com banco de <b>+300 questões</b> — cada simulado sorteia <b>60 aleatórias</b>, então toda tentativa é diferente.",
        "No fim você vê o <b>gabarito comentado</b> (o que você marcou × a resposta certa, com explicação) e uma <b>análise dos erros por domínio</b> dizendo o que reforçar.",
        "Mais certificações (Solutions Architect, SysOps, Developer) vêm na sequência.",
      ],
    },
    {
      versao: "2026-06-21j",
      data: "21 jun 2026",
      titulo: "🏅 Níveis recalibrados (e mais títulos)",
      itens: [
        "Com tanto conteúdo novo, o XP do jogo cresceu muito — então refizemos a <b>curva de níveis</b>: agora são <b>10 títulos</b>, do Estagiário de Cloud até a <b>Lenda do CLI</b> (que vale por completar quase tudo).",
        "Novos postos no caminho: Aprendiz de CLI 🐣, Especialista em AWS 🧠, Mestre da Nuvem 🥷 e Guru do CLI 🧙.",
      ],
    },
    {
      versao: "2026-06-21i",
      data: "21 jun 2026",
      titulo: "🔁 Prática de verdade — quase 300 atividades",
      itens: [
        "Cada comando agora aparece em <b>várias atividades</b>, com cenários reais do dia a dia (site da pizzaria, backups, servidor de jogo, banco do e-commerce...). Repetir em contextos diferentes é o que faz fixar.",
        "Os reforços vêm <b>logo depois</b> de cada comando ser ensinado, na própria trilha. São <b>294 atividades</b> no total.",
      ],
    },
    {
      versao: "2026-06-21h",
      data: "21 jun 2026",
      titulo: "🎯 250 atividades!",
      itens: [
        "Chegamos a <b>250 atividades</b> pra praticar — reforçamos todas as trilhas, com bastante coisa nova de <b>VPC, RDS, CloudWatch</b> e mais cenários do <b>Mundo real</b>.",
        "Mais prática de ponta a ponta, do básico ao avançado, em todos os serviços.",
      ],
    },
    {
      versao: "2026-06-21g",
      data: "21 jun 2026",
      titulo: "🖥️ VPC, RDS e CloudWatch no Console",
      itens: [
        "Os três serviços novos agora também na <b>interface visual</b>: crie VPCs/sub-redes/gateway, suba bancos RDS (parar/iniciar/excluir) e configure alarmes + grupos de logs — tudo no clique.",
        "Como sempre, <b>espelha o CLI</b>: o que você faz aqui aparece no <code>aws ec2 describe-vpcs</code>, <code>aws rds describe-db-instances</code> e companhia.",
      ],
    },
    {
      versao: "2026-06-21f",
      data: "21 jun 2026",
      titulo: "🛜🛢️📈 VPC, RDS e CloudWatch",
      itens: [
        "Três trilhas novas, do que mais cai nas certificações: <b>VPC</b> (rede — <code>aws ec2 create-vpc</code>, subnets, internet gateway), <b>RDS</b> (banco relacional) e <b>CloudWatch</b> (alarmes + Logs).",
        "São <b>11 desafios novos</b> — agora dá pra praticar quase todo o núcleo do Cloud Practitioner e do Solutions Architect.",
      ],
    },
    {
      versao: "2026-06-21e",
      data: "21 jun 2026",
      titulo: "👥 Turmas e competições",
      itens: [
        "Crie uma <b>turma</b>, compartilhe o código e a galera entra — cada turma tem seu <b>ranking próprio</b>.",
        "É competição <b>assíncrona</b>: todo mundo joga no seu tempo e o placar da turma compara o XP. Botão <b>👥 Turmas</b> no topo.",
      ],
    },
    {
      versao: "2026-06-21d",
      data: "21 jun 2026",
      titulo: "📧 Confirmação de e-mail",
      itens: [
        "Cadastrou com e-mail? Agora a gente manda um link de confirmação. E-mail confirmado deixa a conta mais segura e habilita a entrada em competições.",
        "Entrou com o <b>Google</b>? Seu e-mail já vem confirmado automaticamente.",
      ],
    },
    {
      versao: "2026-06-21c",
      data: "21 jun 2026",
      titulo: "🤖 Arquiteto IA (gera infra a partir de texto)",
      itens: [
        "Descreva em português o que você quer (\"um site com banco de dados e uma função\") e o <b>Arquiteto IA</b> monta um <b>template de CloudFormation</b> pra você.",
        "Dá pra <b>criar o stack na hora</b> — os recursos passam a existir de verdade na sua conta. Botão <b>🤖 Arquiteto IA</b> no rodapé.",
      ],
    },
    {
      versao: "2026-06-21b",
      data: "21 jun 2026",
      titulo: "🛡️ Ranking mais justo e seguro",
      itens: [
        "Reforçamos as validações do servidor pra manter o <b>ranking justo</b> — pontuação e progresso agora passam por checagens de sanidade antes de serem salvos. Obrigado a quem reportou! 🙌",
      ],
    },
    {
      versao: "2026-06-21a",
      data: "21 jun 2026",
      titulo: "🔬 Saídas ainda mais fiéis à AWS de verdade",
      itens: [
        "Varredura de fidelidade comparando o CLImb com uma AWS real rodando na bancada: o <code>describe-instances</code> agora traz o JSON completo (IP privado/público, VPC, sub-rede, AZ, monitoramento...) e agrupa por reserva igual à AWS.",
        "<b>IAM</b> mais completo: grupos, roles e políticas agora mostram <code>GroupId</code>/<code>RoleId</code>/<code>PolicyId</code>, <code>Path</code>, contagem de anexos e o documento de confiança da role — tudo no mesmo formato da AWS.",
        "Ajustes finos: <code>dynamodb create-table</code> recusa nome com menos de 3 letras, <code>s3 rm</code> de objeto inexistente é idempotente (não dá erro), e a Lambda só mostra <code>Environment</code> quando há variáveis.",
      ],
    },
    {
      versao: "2026-06-20i",
      data: "20 jun 2026",
      titulo: "📄 CloudFormation (infra como código)",
      itens: [
        "Nova trilha <b>CloudFormation</b>: descreva seus recursos num template (<b>YAML</b> ou JSON) e o <code>create-stack</code> cria tudo de uma vez.",
        "Os recursos são <b>de verdade</b>: um bucket no template aparece no <code>aws s3 ls</code>; um <code>delete-stack</code> apaga tudo junto. Tem template pronto pra começar.",
      ],
    },
    {
      versao: "2026-06-20h",
      data: "20 jun 2026",
      titulo: "🎯 Missões guiadas no Console",
      itens: [
        "Um <b>passeio guiado</b> dentro do Console: 8 missões que você cumpre <b>fazendo</b> (criar bucket, subir instância, dar permissão...) — com XP e progresso, igual aos desafios do terminal.",
        "Abra o Console e clique em <b>🎯 Missões</b> no topo pra começar.",
      ],
    },
    {
      versao: "2026-06-20g",
      data: "20 jun 2026",
      titulo: "⚡🗄️ Lambda e DynamoDB no Console",
      itens: [
        "Chegaram <b>Lambda</b> (criar/testar/excluir função) e <b>DynamoDB</b> (criar tabela, adicionar itens, excluir) ao Console.",
        "Com isso o Console já tem os <b>5 serviços</b>: S3, EC2, IAM, Lambda e DynamoDB — todos espelhando a linha de comando.",
      ],
    },
    {
      versao: "2026-06-20f",
      data: "20 jun 2026",
      titulo: "🔑 IAM no Console",
      itens: [
        "O Console agora tem <b>IAM</b>: crie e exclua usuários, anexe políticas e adicione a grupos — pelo clique.",
        "Espelha o CLI: aparece no <code>aws iam list-users</code> e companhia, e vice-versa.",
      ],
    },
    {
      versao: "2026-06-20e",
      data: "20 jun 2026",
      titulo: "🖥️ EC2 no Console",
      itens: [
        "O Console agora também tem <b>EC2</b>: execute instâncias, pare, inicie e encerre — tudo no clique.",
        "Igual ao S3, <b>espelha a linha de comando</b>: o que você faz aqui aparece no <code>aws ec2 describe-instances</code>, e vice-versa.",
      ],
    },
    {
      versao: "2026-06-20d",
      data: "20 jun 2026",
      titulo: "🎯 Saídas mais fiéis à AWS",
      itens: [
        "Afinamos as saídas e mensagens de erro dos comandos (EC2 e S3) pra ficarem <b>idênticas às da AWS de verdade</b> — assim o que você aprende aqui é exatamente o que vai ver lá.",
        "Quando a AWS não mostra nada (ex.: <code>aws s3 ls</code> sem buckets), agora o terminal também não mostra — mas aparece um <b>aviso do CLImb</b> (⚡) explicando o que aconteceu, separado da saída do comando.",
      ],
    },
    {
      versao: "2026-06-20c",
      data: "20 jun 2026",
      titulo: "✉️ Entre com usuário ou e-mail",
      itens: [
        "Agora dá pra fazer login usando o <b>e-mail</b> cadastrado, não só o nome de usuário — o que for mais fácil de lembrar.",
      ],
    },
    {
      versao: "2026-06-20b",
      data: "20 jun 2026",
      titulo: "🔑 Primeiro lab (SSH) mais fiel",
      itens: [
        "O lab de conexão agora <b>ensina o SSH de verdade</b>: o que é a chave <code>.pem</code>, o usuário <b>ec2-user</b> e o passo do <code>chmod 400</code> — que na AWS real é obrigatório (sem ele o SSH recusa a chave).",
      ],
    },
    {
      versao: "2026-06-20",
      data: "20 jun 2026",
      titulo: "🖥️ Console de gerenciamento (S3)",
      itens: [
        "Novo <b>Console visual</b> no estilo AWS: crie buckets, envie arquivos, crie pastas e apague — tudo no clique, sem decorar comando.",
        "Ele <b>espelha a linha de comando</b>: o que você faz no Console aparece no <code>aws s3 ls</code>, e cada ação mostra o comando equivalente. Aprenda dos dois jeitos ao mesmo tempo.",
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
      titulo: "Mais serviços AWS",
      desc: "SQS (filas), SNS (notificações), EBS (discos), API Gateway, Route 53 (DNS) e CloudFront — ampliando além de VPC/RDS/CloudWatch.",
    },
    {
      icone: "🗺️",
      titulo: "Diagrama da sua arquitetura",
      desc: "Veja os recursos da sua conta desenhados como um diagrama — combina com o Arquiteto IA e o CloudFormation.",
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
    const itensNov = NOVIDADES.map((v, idx) => `
      <div class="cl-versao">
        <div class="cl-versao-cab">
          <h3>${esc(v.titulo)}</h3>
          <span class="cl-data">${esc(v.data)}${idx === 0 ? ' <em class="cl-atual">novo</em>' : ""}</span>
        </div>
        <ul>${v.itens.map((it) => `<li>${it}</li>`).join("")}</ul>
      </div>`).join("");

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
