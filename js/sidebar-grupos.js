"use strict";
// ============================================================
// CLImb — sidebar-grupos.js
// A lista lateral tinha 62 trilhas SOLTAS, uma embaixo da outra. Quem chega
// não sabe por onde começar e rola sem fim procurando um serviço.
//
// Aqui elas viram ~10 GRUPOS colapsáveis por tema. As trilhas continuam as
// mesmas (nada de fundir): é só uma camada de organização por cima.
//
// ADITIVO: faz wrap de renderSidebar e reorganiza os blocos que o original
// gerou. Carrega DEPOIS de licenca.js (que também envolve o renderSidebar pra
// pôr os cadeados) — senão os cadeados sumiriam.
// ============================================================
(function () {
  if (typeof window === "undefined") return;

  const CHAVE = "climb.grupos.abertos";

  // Ordem dos grupos = ordem de aprendizado sugerida.
  const GRUPOS = [
    { id: "fundamentos", nome: "Fundamentos", emoji: "🚀",
      servicos: ["setup", "linux", "s3", "ec2", "iam"] },
    { id: "computacao", nome: "Computação e contêineres", emoji: "⚙️",
      servicos: ["lambda", "ebs", "autoscaling", "elbv2", "elasticbeanstalk", "ecr", "ecs", "eks"] },
    { id: "dados", nome: "Bancos e armazenamento", emoji: "🗄️",
      servicos: ["dynamodb", "rds", "efs", "elasticache"] },
    { id: "rede", nome: "Rede e entrega", emoji: "🌐",
      servicos: ["vpc", "route53", "cloudfront", "apigateway"] },
    { id: "integracao", nome: "Integração e mensageria", emoji: "📨",
      servicos: ["sqs", "sns", "events", "stepfunctions"] },
    { id: "analytics", nome: "Dados e IA", emoji: "📊",
      servicos: ["glue", "athena", "kinesis", "redshift", "rekognition", "translate", "polly", "comprehend", "bedrock"] },
    { id: "seguranca", nome: "Segurança", emoji: "🔐",
      servicos: ["kms", "acm", "cognito-idp", "secretsmanager", "guardduty", "inspector2", "macie2", "wafv2", "shield", "configservice", "cloudtrail"] },
    { id: "custos", nome: "Custos e governança", emoji: "💰",
      servicos: ["budgets", "ce", "organizations", "support"] },
    { id: "operacoes", nome: "Operações", emoji: "🛠️",
      servicos: ["cloudwatch", "ssm", "cloudformation"] },
    { id: "praticar", nome: "Praticar e desafiar", emoji: "🎯",
      servicos: ["extras-cenarios", "extras-conserte", "extras-relampago", "mundo-real", "diagnostico",
        "adv-politicas", "adv-query", "adv-gestao", "adv-cegas", "projetos"] },
    // rede de segurança: trilha nova que ninguém mapeou cai aqui em vez de sumir
    { id: "outros", nome: "Outros serviços", emoji: "📦", servicos: [] },
  ];

  const grupoDe = {};
  for (const g of GRUPOS) for (const s of g.servicos) grupoDe[s] = g.id;

  function abertos() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (bruto) return new Set(JSON.parse(bruto));
    } catch (e) { /* ok */ }
    return new Set(["fundamentos"]); // 1ª visita: só o começo aberto
  }
  function salvar(set) {
    try { localStorage.setItem(CHAVE, JSON.stringify([...set])); } catch (e) { /* ok */ }
  }

  function agrupar() {
    const aside = document.querySelector("#sidebar");
    if (!aside || aside.dataset.agrupado === "1") return;
    const blocos = [...aside.querySelectorAll(":scope > .servico")];
    if (!blocos.length) return;

    // O original monta os blocos na ordem de SERVICOS_META — casa 1 a 1.
    const meta = typeof SERVICOS_META !== "undefined" ? SERVICOS_META : [];
    blocos.forEach((b, i) => { if (meta[i]) b.dataset.servico = meta[i].id; });

    const set = abertos();
    // grupo do serviço aberto tem que estar visível, senão o clique "some"
    const aberto = typeof ui !== "undefined" ? ui.servicoAberto : null;
    if (aberto && grupoDe[aberto]) set.add(grupoDe[aberto]);

    const porGrupo = new Map();
    for (const b of blocos) {
      const gid = grupoDe[b.dataset.servico] || "outros";
      if (!porGrupo.has(gid)) porGrupo.set(gid, []);
      porGrupo.get(gid).push(b);
    }

    aside.innerHTML = "";
    for (const g of GRUPOS) {
      const lista = porGrupo.get(g.id);
      if (!lista || !lista.length) continue; // grupo vazio não aparece

      // progresso somado das trilhas do grupo
      let feitos = 0, total = 0;
      for (const b of lista) {
        const p = b.querySelector(".servico-prog");
        const m = p && /(\d+)\s*\/\s*(\d+)/.exec(p.textContent || "");
        if (m) { feitos += +m[1]; total += +m[2]; }
      }

      const cx = document.createElement("div");
      cx.className = "grupo" + (set.has(g.id) ? " aberto" : "");
      const cab = document.createElement("button");
      cab.className = "grupo-cab";
      cab.setAttribute("aria-expanded", set.has(g.id) ? "true" : "false");
      cab.innerHTML = `<span class="grupo-seta">▸</span>
        <span class="grupo-emoji">${g.emoji}</span>
        <span class="grupo-nome">${g.nome}</span>
        <span class="grupo-cont">${lista.length}</span>
        ${total ? `<span class="grupo-prog${feitos === total ? " completo" : ""}">${feitos}/${total}</span>` : ""}`;
      cab.addEventListener("click", () => {
        const s = abertos();
        if (s.has(g.id)) s.delete(g.id); else s.add(g.id);
        salvar(s);
        cx.classList.toggle("aberto");
        cab.setAttribute("aria-expanded", cx.classList.contains("aberto") ? "true" : "false");
      });
      cx.appendChild(cab);

      const corpo = document.createElement("div");
      corpo.className = "grupo-corpo";
      for (const b of lista) corpo.appendChild(b);
      cx.appendChild(corpo);
      aside.appendChild(cx);
    }
    aside.dataset.agrupado = "1";
  }

  // wrap: roda o render original (com os cadeados do licenca.js) e agrupa depois
  const original = window.renderSidebar;
  if (typeof original !== "function") return;
  window.renderSidebar = function () {
    const r = original.apply(this, arguments);
    const aside = document.querySelector("#sidebar");
    if (aside) delete aside.dataset.agrupado; // o original recriou tudo
    try { agrupar(); } catch (e) { /* se algo mudar no core, a lista some? não: fica plana */ }
    return r;
  };

  // a sidebar já pode ter sido montada antes deste arquivo carregar
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { try { agrupar(); } catch (e) {} });
  else setTimeout(() => { try { agrupar(); } catch (e) {} }, 0);

  window.GRUPOS_TRILHA = GRUPOS; // as trilhas de carreira reusam este mapa
})();
