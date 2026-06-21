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
      icone: "🏁",
      titulo: "Eventos com prazo",
      desc: "Competições cronometradas dentro das turmas (com início e fim), além do ranking contínuo.",
    },
    {
      icone: "💬",
      titulo: "Sua ideia aqui",
      desc: "Manda sua sugestão! O CLImb cresce com o que a galera que estuda junto pede.",
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
