"use strict";
// ============================================================
// CLImb — limpar-ambiente.js
// "Limpar ambiente": zera a conta AWS simulada SEM mexer no progresso.
//
// POR QUE EXISTE (medido em 29/09/2026): depois de todas as trilhas a conta
// acumula 62 buckets, 46 instâncias, 23 usuários IAM, 26 tabelas e 17 Lambdas
// (361 KB). O `aws s3 ls` vira uma parede, e o único jeito de limpar era o
// "Resetar progresso" — que leva junto o XP e as atividades concluídas.
//
// O QUE APAGA E O QUE FICA: apaga tudo o que existe "na AWS" (recursos de
// todos os serviços). Fica o que é do "seu computador": os arquivos do
// terminal (conta.fs, os salvos com ">"), a pasta ~/.aws e os perfis
// (conta.cli), o estado da instalação da trilha Primeiros passos
// (conta.setup) e a região/conta configuradas. XP, atividades e conquistas
// não são tocados — vivem fora de jogo.conta.
//
// Onde aparece: botão 🧹 no menu "Você" (o botão está no index.html desde o
// HTML, pra não chegar atrasado) e `climb limpar` no terminal.
// ============================================================
(function () {
  if (typeof criarContaAws !== "function") return;

  // chaves de jogo.conta que são "o computador", não "a AWS"
  const LOCAIS = ["fs", "cwd", "arquivosSalvos", "cli", "setup", "regiao", "contaId"];
  // o que a conta nova já traz de fábrica não conta como "coisa sua"
  const BASE = criarContaAws();
  const NOMES = {
    s3: "buckets S3", ec2: "recursos EC2", iam: "itens do IAM", lambda: "funções Lambda",
    dynamodb: "tabelas DynamoDB", rds: "bancos RDS", vpc: "recursos de rede (VPC)",
    cloudformation: "stacks CloudFormation", sqs: "filas SQS", sns: "tópicos SNS",
    ecs: "recursos ECS", ecr: "repositórios ECR", logs: "recursos do CloudWatch Logs",
    codecommit: "repositórios CodeCommit", codebuild: "recursos CodeBuild",
    codepipeline: "pipelines", codedeploy: "recursos CodeDeploy",
  };

  // Conta recursos: em cada serviço, soma os itens de cada coleção (objeto
  // de objetos). Genérico de propósito — serviço novo entra sozinho.
  function inventario(conta) {
    const linhas = [];
    let total = 0;
    for (const [svc, v] of Object.entries(conta || {})) {
      if (LOCAIS.indexOf(svc) >= 0 || !v || typeof v !== "object" || Array.isArray(v)) continue;
      let n = 0;
      for (const [k, col] of Object.entries(v)) {
        if (!col || typeof col !== "object" || Array.isArray(col)) continue;
        const base = ((BASE[svc] || {})[k]) || {};
        for (const id of Object.keys(col)) if (col[id] && typeof col[id] === "object" && !(id in base)) n++;
      }
      if (n) { linhas.push({ svc, n, nome: NOMES[svc] || "recursos de " + svc }); total += n; }
    }
    linhas.sort((a, b) => b.n - a.n);
    return { total, linhas };
  }

  function resumo(inv, max) {
    if (!inv.total) return "a conta já está limpa";
    const partes = inv.linhas.slice(0, max || 6).map((l) => `${l.n} ${l.nome}`);
    const resto = inv.linhas.slice(max || 6).reduce((a, l) => a + l.n, 0);
    return partes.join(", ") + (resto ? ` e mais ${resto} em outros serviços` : "");
  }

  function limpar() {
    if (typeof jogo === "undefined" || !jogo) return null;
    const velha = jogo.conta || {};
    const antes = inventario(velha);
    const nova = criarContaAws();
    for (const k of LOCAIS) if (velha[k] !== undefined) nova[k] = velha[k];
    jogo.conta = nova;
    if (typeof salvarJogo === "function") salvarJogo();
    try {
      if (typeof renderCard === "function") renderCard();
      if (typeof renderSidebar === "function") renderSidebar();
    } catch (e) { /* a tela se ajeita no próximo render */ }
    return antes;
  }

  function avisoFeito(antes) {
    return `🧹 Ambiente limpo: ${antes.total} ${antes.total === 1 ? "recurso apagado" : "recursos apagados"}. ` +
      "Seu XP, as atividades concluídas, os arquivos do terminal e os perfis em ~/.aws continuam onde estavam.";
  }

  // ---------- botão ----------
  function ligarBotao() {
    const b = document.getElementById("btnLimparAmbiente");
    if (!b || b.__ligado) return;
    b.__ligado = true;
    b.addEventListener("click", () => {
      const inv = inventario(jogo && jogo.conta);
      if (!inv.total) {
        if (typeof imprimir === "function") { imprimir("🧹 Nada pra limpar: a conta simulada já está vazia.", "aviso-climb"); if (typeof rolarTerminal === "function") rolarTerminal(); }
        return;
      }
      if (!confirm(`Limpar o ambiente AWS simulado?\n\nVai apagar ${inv.total} recursos: ${resumo(inv, 5)}.\n\nSeu XP e as atividades concluídas NÃO são afetados.`)) return;
      const antes = limpar();
      if (antes && typeof imprimir === "function") { imprimir(avisoFeito(antes), "aviso-climb"); if (typeof rolarTerminal === "function") rolarTerminal(); }
    });
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ligarBotao);
    else ligarBotao();
  }

  // pro `climb limpar` (climb-cmd.js) e pros testes
  if (typeof window !== "undefined") window.CLIMB_AMBIENTE = { inventario, resumo, limpar, avisoFeito };
})();
