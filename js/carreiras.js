"use strict";
// ============================================================
// CLImb — carreiras.js
// TRILHAS DE CARREIRA (estilo boot.dev).
//
// O app tem 62 trilhas e ~520 atividades. Isso responde "o que existe?" mas
// não responde a pergunta que o aluno realmente faz: "eu quero trabalhar com
// X — por onde eu começo e em que ordem?".
//
// Uma carreira NÃO duplica conteúdo: é uma ORDEM CURADA das trilhas que já
// existem, cada passo com uma frase dizendo por que ele está ali. O progresso
// é calculado das mesmas atividades — fazer S3 conta no Backend e no Dados.
//
// ADITIVO: botão no rodapé + modal próprio. Não toca o core.
// ============================================================
(function () {
  if (typeof window === "undefined") return;

  const CARREIRAS = [
    {
      id: "devops", nome: "DevOps / SRE", emoji: "🛠️",
      resumo: "Quem sustenta a infraestrutura de pé: sobe servidor, desenha a rede, monitora e conserta quando quebra.",
      passos: [
        ["setup", "Antes de tudo: instalar e configurar a CLI. É a ferramenta do dia a dia."],
        ["linux", "Servidor na nuvem é Linux. Sem terminal você cria a máquina e não sabe usá-la."],
        ["ec2", "A máquina virtual: ligar, parar, encerrar. O tijolo básico."],
        ["vpc", "A rede onde tudo vive. É aqui que a maioria dos problemas de acesso nasce."],
        ["iam", "Quem pode o quê. Errar aqui é incidente de segurança, não bug."],
        ["ebs", "Os discos das máquinas — e os backups (snapshots) deles."],
        ["autoscaling", "Subir e descer máquinas sozinho conforme a demanda."],
        ["elbv2", "O balanceador na frente das máquinas: escala e tolerância a falhas."],
        ["cloudwatch", "Métrica, alarme, painel e consulta de log. É como você SABE que está tudo bem."],
        ["diagnostico", "A prova de fogo: a infra chega quebrada e você conserta. É o que se faz num plantão."],
        ["cloudformation", "Parar de clicar: descrever a infra como código e recriá-la igual."],
        ["ssm", "Configuração centralizada, sem senha no código."],
      ],
    },
    {
      id: "backend", nome: "Backend / Dev", emoji: "💻",
      resumo: "Quem constrói a aplicação: guarda arquivo, roda código sem servidor, salva dado e expõe API.",
      passos: [
        ["setup", "Instalar e configurar a CLI."],
        ["s3", "Onde ficam os arquivos da sua aplicação — e onde se hospeda um site estático."],
        ["iam", "As permissões que a sua aplicação vai assumir (role), não só as suas."],
        ["lambda", "Rodar código sem cuidar de servidor. O coração do serverless."],
        ["dynamodb", "O banco NoSQL que escala sozinho, feito pra esse tipo de app."],
        ["apigateway", "A porta HTTP: transformar a sua função numa API de verdade."],
        ["sqs", "Fila: desacoplar o que é lento do que precisa responder rápido."],
        ["sns", "Notificação e fan-out: um evento avisando vários interessados."],
        ["cognito-idp", "Login pronto, sem você escrever autenticação do zero."],
        ["stepfunctions", "Orquestrar vários passos com repetição e tratamento de erro."],
      ],
    },
    {
      id: "dados", nome: "Dados / Analytics", emoji: "📊",
      resumo: "Quem transforma dado bruto em resposta: coleta, cataloga, consulta e analisa em escala.",
      passos: [
        ["setup", "Instalar e configurar a CLI."],
        ["s3", "O data lake começa aqui: é no S3 que o dado bruto cai."],
        ["iam", "Quem pode ler qual dado. Em dados isso é metade do trabalho."],
        ["glue", "O catálogo: descobrir sozinho o formato e as colunas do que está no S3."],
        ["athena", "SQL direto nos arquivos do S3, sem subir banco nenhum."],
        ["kinesis", "Dado que chega sem parar (cliques, sensores) — ingestão em tempo real."],
        ["redshift", "O data warehouse: analisar bilhões de linhas pra BI e relatório."],
        ["dynamodb", "O outro lado: banco operacional de baixa latência, não analítico."],
      ],
    },
    {
      id: "seguranca", nome: "Segurança", emoji: "🔐",
      resumo: "Quem protege a conta: controla acesso, cifra, audita e detecta ameaça.",
      passos: [
        ["setup", "Instalar e configurar a CLI."],
        ["iam", "A base de tudo: identidade, política e o princípio do menor privilégio."],
        ["kms", "Chaves de criptografia — cifrar e decifrar de verdade."],
        ["secretsmanager", "Senha e segredo fora do código, com rotação."],
        ["acm", "Certificado SSL/TLS: o cadeado do HTTPS, de graça e renovando sozinho."],
        ["cloudtrail", "A auditoria: quem fez o quê na conta, e quando."],
        ["guardduty", "Detecção de ameaça rodando sozinha em cima dos logs."],
        ["macie2", "Dado sensível exposto no S3 (CPF, cartão) antes que vire incidente."],
        ["wafv2", "Firewall de aplicação: SQL injection, XSS e bots."],
        ["configservice", "Conformidade: o que está fora do padrão e desde quando."],
      ],
    },
    {
      id: "finops", nome: "FinOps / Governança", emoji: "💰",
      resumo: "Quem cuida da conta no fim do mês: prevê, alerta, investiga o gasto e organiza várias contas.",
      passos: [
        ["budgets", "O primeiro passo pra não tomar susto: teto de gasto com alerta."],
        ["ce", "Investigar para onde o dinheiro foi — e prever onde vai parar."],
        ["organizations", "Várias contas sob uma fatura, com regra central."],
        ["support", "Trusted Advisor: recomendação automática de economia e segurança."],
        ["cloudwatch", "Métrica e alarme também servem pra custo, não só pra falha."],
      ],
    },
  ];

  // ---------- helpers ----------
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function nomeTrilha(id) {
    const m = typeof SERVICOS_META !== "undefined" ? SERVICOS_META.find((x) => x.id === id) : null;
    return m ? m.nome : id;
  }
  function iconeTrilha(id) {
    const m = typeof SERVICOS_META !== "undefined" ? SERVICOS_META.find((x) => x.id === id) : null;
    return m ? m.icone : "•";
  }
  function progresso(id) {
    try { return progressoServico(id); } catch (e) { return { feitos: 0, total: 0 }; }
  }
  function ehPro(id) {
    // uma trilha é Pro se as atividades dela não são grátis
    try {
      const d = DESAFIOS.find((x) => x.servico === id);
      return d ? !podeAcessar(d) : false;
    } catch (e) { return false; }
  }
  // 1ª atividade não concluída da carreira (é pra onde o "Continuar" leva)
  function proximaAtividade(c) {
    for (const [sid] of c.passos) {
      const lista = DESAFIOS.filter((d) => d.servico === sid);
      for (const d of lista) if (!desafioConcluido(d.id)) return d;
    }
    return null;
  }
  function totalDa(c) {
    let feitos = 0, total = 0;
    for (const [sid] of c.passos) { const p = progresso(sid); feitos += p.feitos; total += p.total; }
    return { feitos, total };
  }

  // ---------- modal ----------
  let modal = null;
  function montar() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "modalCarreiras";
    modal.innerHTML = `<div class="modal-caixa carreiras-caixa">
      <h2>🎓 Trilhas de carreira</h2>
      <p class="carreiras-intro">São <b>caminhos prontos</b> pelas trilhas que já existem: a mesma atividade conta em mais de um caminho. Escolha o que combina com onde você quer trabalhar — e siga na ordem.</p>
      <div id="carreirasLista"></div>
      <div class="modal-acoes"><button class="botao secundario" data-fechar>Fechar</button></div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.hasAttribute("data-fechar")) fechar();
    });
    return modal;
  }

  function pintar() {
    const alvo = document.querySelector("#carreirasLista");
    if (!alvo) return;
    alvo.innerHTML = CARREIRAS.map((c) => {
      const t = totalDa(c);
      const pct = t.total ? Math.round(t.feitos / t.total * 100) : 0;
      const passos = c.passos.map(([sid, porque]) => {
        const p = progresso(sid);
        const completo = p.total > 0 && p.feitos === p.total;
        const comecou = p.feitos > 0 && !completo;
        const pro = ehPro(sid);
        return `<li class="carr-passo${completo ? " ok" : comecou ? " andando" : ""}">
          <span class="carr-passo-ic">${completo ? "✅" : comecou ? "▶" : esc(iconeTrilha(sid))}</span>
          <span class="carr-passo-txt">
            <span class="carr-linha">
              <button class="carr-ir" data-servico="${esc(sid)}">${esc(nomeTrilha(sid))}</button>
              ${pro ? '<span class="carr-pro">Pro</span>' : ""}
            </span>
            <small>${esc(porque)}</small>
          </span>
          <span class="carr-passo-prog">${p.feitos}/${p.total}</span>
        </li>`;
      }).join("");
      return `<details class="carr" ${pct > 0 && pct < 100 ? "open" : ""}>
        <summary>
          <span class="carr-emoji">${c.emoji}</span>
          <span class="carr-nome">${esc(c.nome)}</span>
          <span class="carr-barra"><span style="width:${pct}%"></span></span>
          <span class="carr-pct">${t.feitos}/${t.total}</span>
        </summary>
        <p class="carr-resumo">${esc(c.resumo)}</p>
        <ol class="carr-passos">${passos}</ol>
        <button class="botao carr-continuar" data-carreira="${esc(c.id)}">▶ Continuar de onde parei</button>
      </details>`;
    }).join("");

    // ir direto pra uma trilha
    for (const b of alvo.querySelectorAll(".carr-ir")) {
      b.addEventListener("click", () => {
        const sid = b.dataset.servico;
        const d = DESAFIOS.filter((x) => x.servico === sid).find((x) => !desafioConcluido(x.id))
          || DESAFIOS.find((x) => x.servico === sid);
        fechar();
        if (typeof ui !== "undefined") ui.servicoAberto = sid;
        if (d && typeof selecionarDesafio === "function") selecionarDesafio(d.id);
        else if (typeof renderSidebar === "function") renderSidebar();
      });
    }
    // continuar de onde parou
    for (const b of alvo.querySelectorAll(".carr-continuar")) {
      b.addEventListener("click", () => {
        const c = CARREIRAS.find((x) => x.id === b.dataset.carreira);
        const d = c && proximaAtividade(c);
        if (!d) { if (typeof toast === "function") toast("🎉 Você já completou esta carreira inteira!", "sucesso"); return; }
        fechar();
        if (typeof ui !== "undefined") ui.servicoAberto = d.servico;
        selecionarDesafio(d.id);
      });
    }
  }

  function abrir() { montar(); pintar(); modal.classList.add("aberto"); }
  function fechar() { if (modal) modal.classList.remove("aberto"); }

  // ---------- botão no rodapé ----------
  function injetarBotao() {
    const rodape = document.querySelector("footer");
    if (!rodape || document.querySelector("#btnCarreiras")) return;
    const b = document.createElement("button");
    b.className = "botao secundario";
    b.id = "btnCarreiras";
    b.innerHTML = "🎓 Carreiras";
    b.title = "Caminhos prontos: DevOps, Backend, Dados, Segurança e FinOps";
    b.addEventListener("click", abrir);
    const ref = document.querySelector("#btnComoJogar") || document.querySelector("#btnArquitetoIa");
    if (ref && ref.parentElement === rodape) rodape.insertBefore(b, ref);
    else rodape.insertBefore(b, rodape.firstChild);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injetarBotao);
  else injetarBotao();
  window.addEventListener("load", () => setTimeout(injetarBotao, 400));

  window.abrirCarreiras = abrir;
  window.CARREIRAS = CARREIRAS;
})();
