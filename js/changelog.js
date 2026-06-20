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
      versao: "2026-06-20d",
      data: "20 jun 2026",
      titulo: "🎯 Saídas mais fiéis à AWS",
      itens: [
        "Afinamos as saídas e mensagens de erro dos comandos (EC2 e S3) pra ficarem <b>idênticas às da AWS de verdade</b> — assim o que você aprende aqui é exatamente o que vai ver lá.",
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
      icone: "🧩",
      titulo: "Mais serviços no Console",
      desc: "EC2, IAM, Lambda e DynamoDB também na interface visual — hoje só o S3 está disponível por lá.",
    },
    {
      icone: "📄",
      titulo: "Infraestrutura como código (CloudFormation)",
      desc: "Monte sua infra escrevendo YAML, com ajuda de IA pra desenhar arquiteturas (Bedrock).",
    },
    {
      icone: "👥",
      titulo: "Modo multiplayer",
      desc: "Salas e turmas pra estudar junto, e competições assíncronas com a galera — no seu tempo, sem pressão de tempo real.",
    },
    {
      icone: "🎯",
      titulo: "Desafios guiados no Console",
      desc: "Missões feitas direto na interface visual, não só no terminal.",
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
