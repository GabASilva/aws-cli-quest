"use strict";
// ============================================================
// CLImb — console-desafios.js
// Missões GUIADAS feitas dentro do Console visual (não no terminal).
// Cada missão é validada pelo ESTADO da conta (jogo.conta) após cada ação
// no Console — o console-aws.js chama window.aposAcaoConsole() depois de
// persistir, e aqui a gente confere se a missão da vez foi cumprida, dá XP
// (integrado ao jogo) e avança. Progresso em jogo.missoesConsole (persiste
// local + nuvem). ADITIVO: carrega depois de console-aws.js. Não toca o core.
// ============================================================
(function () {
  if (typeof window === "undefined") return;

  // Passeio guiado pelos 5 serviços do Console. `ir` = tela do console-aws
  // pra onde o botão "Ir" leva. `feito(conta)` = objetivo cumprido.
  const MISSOES_CONSOLE = [
    {
      id: "mc-s3-bucket", servico: "S3", ir: "s3-buckets", xp: 50,
      titulo: "Crie seu primeiro bucket",
      descricao: "No serviço <b>S3</b>, clique em <b>Criar bucket</b> e crie um chamado <b>meu-site</b>.",
      dica: "O botão <b>Criar bucket</b> fica no topo da lista do S3.",
      feito: (c) => !!c.s3.buckets["meu-site"],
    },
    {
      id: "mc-s3-upload", servico: "S3", ir: "s3-buckets", xp: 50,
      titulo: "Envie um arquivo",
      descricao: "Abra o bucket <b>meu-site</b> e use <b>Carregar</b> pra enviar qualquer arquivo.",
      dica: "Clique no nome do bucket na lista, depois em <b>Carregar</b>.",
      feito: (c) => { const b = c.s3.buckets["meu-site"]; return !!b && Object.keys(b.objetos).length > 0; },
    },
    {
      id: "mc-ec2-run", servico: "EC2", ir: "ec2-instancias", xp: 60,
      titulo: "Suba uma instância EC2",
      descricao: "No <b>EC2</b>, clique em <b>Executar instância</b> e crie uma máquina (pode deixar os valores padrão).",
      dica: "Botão <b>Executar instância</b>. Só apertar e confirmar.",
      feito: (c) => Object.values(c.ec2.instancias).some((i) => i.estado === "running"),
    },
    {
      id: "mc-ec2-stop", servico: "EC2", ir: "ec2-instancias", xp: 50,
      titulo: "Pare a instância",
      descricao: "Na lista do EC2, clique em <b>Parar</b> na instância que você criou.",
      dica: "O botão <b>Parar</b> aparece nas instâncias que estão <b>running</b>.",
      feito: (c) => Object.values(c.ec2.instancias).some((i) => i.estado === "stopped"),
    },
    {
      id: "mc-iam-user", servico: "IAM", ir: "iam-usuarios", xp: 50,
      titulo: "Crie um usuário IAM",
      descricao: "No <b>IAM</b>, clique em <b>Criar usuário</b> e crie um chamado <b>ana</b>.",
      dica: "Botão <b>Criar usuário</b> no topo da lista do IAM.",
      feito: (c) => !!c.iam.usuarios["ana"],
    },
    {
      id: "mc-iam-policy", servico: "IAM", ir: "iam-usuarios", xp: 60,
      titulo: "Dê uma permissão",
      descricao: "Abra a <b>ana</b> e <b>anexe uma política</b> (ex.: AmazonS3ReadOnlyAccess).",
      dica: "Clique no nome <b>ana</b>, escolha a política na lista e clique em <b>Anexar política</b>.",
      feito: (c) => { const u = c.iam.usuarios["ana"]; return !!u && (u.politicas || []).length > 0; },
    },
    {
      id: "mc-lambda", servico: "Lambda", ir: "lambda-funcoes", xp: 60,
      titulo: "Crie uma função Lambda",
      descricao: "No <b>Lambda</b>, clique em <b>Criar função</b> e crie uma (pode deixar os padrões).",
      dica: "Botão <b>Criar função</b>. Basta dar um nome.",
      feito: (c) => Object.keys(c.lambda.funcoes).length > 0,
    },
    {
      id: "mc-dynamo", servico: "DynamoDB", ir: "dynamo-tabelas", xp: 70,
      titulo: "Crie uma tabela e um item",
      descricao: "No <b>DynamoDB</b>, crie uma tabela e adicione <b>1 item</b> a ela.",
      dica: "Crie a tabela (nome + chave de partição), depois use <b>Adicionar item</b> na tela da tabela.",
      feito: (c) => Object.values(c.dynamodb.tabelas).some((t) => t.itens.length > 0),
    },
  ];

  let painelVisivel = true; // aparece quando o Console abre (a pessoa pode fechar)
  let overlay = null, painel = null, btn = null;

  function jogoOk() { return typeof jogo !== "undefined" && jogo; }
  function feitas() { if (jogoOk()) { jogo.missoesConsole = jogo.missoesConsole || {}; return jogo.missoesConsole; } return {}; }
  function conta() {
    if (!jogoOk()) return null;
    return (typeof normalizarConta === "function") ? normalizarConta(jogo.conta) : jogo.conta;
  }
  function totalFeitas() { const f = feitas(); return MISSOES_CONSOLE.filter((m) => f[m.id]).length; }
  function missaoAtual() { const f = feitas(); return MISSOES_CONSOLE.find((m) => !f[m.id]) || null; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function montar() {
    overlay = document.getElementById("consoleOverlay");
    if (!overlay) return;
    // botão no topo do console
    const topoDir = overlay.querySelector(".caws-topo-dir");
    btn = document.createElement("button");
    btn.id = "cawsMissoesBtn";
    btn.className = "caws-missoes-btn";
    btn.title = "Missões guiadas no Console";
    btn.addEventListener("click", () => { painelVisivel = !painelVisivel; renderPainel(); });
    if (topoDir) topoDir.insertBefore(btn, topoDir.firstChild);
    else overlay.querySelector(".caws-topo").appendChild(btn);

    // painel flutuante
    painel = document.createElement("div");
    painel.id = "cawsMissoesPainel";
    painel.className = "caws-missoes-painel";
    overlay.appendChild(painel);
    painel.addEventListener("click", (e) => {
      if (e.target.closest("[data-mc-fechar]")) { painelVisivel = false; renderPainel(); return; }
      if (e.target.closest("[data-mc-dica]")) { const d = painel.querySelector(".mc-dica"); if (d) d.classList.toggle("aberta"); return; }
      const ir = e.target.closest("[data-mc-ir]");
      if (ir && typeof consoleIrPara === "function") { consoleIrPara(ir.getAttribute("data-mc-ir")); return; }
    });

    if (totalFeitas() >= MISSOES_CONSOLE.length) painelVisivel = false; // já zerou tudo: não incomoda
    atualizarBtn();
    renderPainel();
  }

  function atualizarBtn() {
    if (!btn) return;
    const f = totalFeitas(), tot = MISSOES_CONSOLE.length;
    const pendente = f < tot;
    btn.innerHTML = `🎯 Missões <span class="mc-badge${pendente ? " ativa" : ""}">${f}/${tot}</span>`;
  }

  function renderPainel() {
    if (!painel) return;
    painel.style.display = painelVisivel ? "block" : "none";
    if (!painelVisivel) return;
    const f = totalFeitas(), tot = MISSOES_CONSOLE.length;
    const m = missaoAtual();
    if (!m) {
      painel.innerHTML = `
        <div class="mc-cab"><strong>🏆 Missões do Console</strong><button class="mc-x" data-mc-fechar title="Fechar">✕</button></div>
        <div class="mc-corpo">
          <p class="mc-parabens">Você completou todas as ${tot} missões! 🎉</p>
          <p class="mc-sub">Mandou bem — já sabe operar pelo Console e pela linha de comando.</p>
        </div>`;
      return;
    }
    painel.innerHTML = `
      <div class="mc-cab"><strong>🎯 Missões do Console</strong><span class="mc-prog">${f}/${tot}</span><button class="mc-x" data-mc-fechar title="Fechar">✕</button></div>
      <div class="mc-corpo">
        <div class="mc-num">Missão ${f + 1} · ${esc(m.servico)} · +${m.xp} XP</div>
        <h4>${m.titulo}</h4>
        <p>${m.descricao}</p>
        <div class="mc-acoes">
          <button class="mc-ir" data-mc-ir="${esc(m.ir)}">Ir pro ${esc(m.servico)}</button>
          <button class="mc-dica-btn" data-mc-dica>💡 Dica</button>
        </div>
        <p class="mc-dica">${m.dica}</p>
      </div>`;
  }

  // Chamado pelo console-aws.js após cada ação (criar/excluir/etc.)
  function verificar() {
    if (!jogoOk()) return;
    const c = conta();
    if (!c) return;
    const f = feitas();
    const ganhos = [];
    // avalia em ordem: completa as pendentes consecutivas que já estão cumpridas
    for (const m of MISSOES_CONSOLE) {
      if (f[m.id]) continue;
      let ok = false;
      try { ok = m.feito(c); } catch (e) { ok = false; }
      if (!ok) break; // mantém o passo-a-passo guiado
      f[m.id] = true;
      jogo.xp = (jogo.xp || 0) + m.xp;
      ganhos.push(m);
    }
    if (ganhos.length) {
      if (typeof salvarJogo === "function") salvarJogo();
      if (typeof renderCabecalho === "function") { try { renderCabecalho(); } catch (e) {} }
      atualizarBtn();
      for (const m of ganhos) {
        if (typeof toast === "function") toast(`🎯 Missão concluída: <strong>${m.titulo}</strong> (+${m.xp} XP)`, "sucesso");
      }
      if (painelVisivel) renderPainel();
    }
  }

  window.aposAcaoConsole = verificar;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();
})();
