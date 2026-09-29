"use strict";
// ============================================================
// CLImb — ambientes.js
// Uma conta AWS simulada POR TRILHA, preparada sozinha quando a atividade é
// aberta fora de ordem.
//
// POR QUE EXISTE (medido em 29/09/2026):
//   - bagunça: depois de todas as trilhas a conta única acumulava 62 buckets,
//     46 instâncias, 23 usuários IAM (361 KB) — um `aws s3 ls` virava parede;
//   - fora de ordem: rodando cada atividade SOZINHA numa conta limpa, 691 de
//     1.327 (52%) não completavam, porque dependem do que uma atividade
//     anterior da trilha criou. Desde que as atividades ficaram livres, quem
//     pulava pro meio de EKS/CodePipeline/KMS batia em "não encontrado".
//
// COMO FUNCIONA
//   - jogo.contas = { s3: {...}, iam: {...}, empresa: {...} } e jogo.conta vira
//     só o ponteiro pra conta da trilha aberta. Os 45 usos de jogo.conta no app
//     continuam iguais: quem troca o ponteiro é este arquivo, ao abrir atividade.
//   - Projetos, Mundo real e Diagnóstico ficam na "empresa", compartilhada de
//     propósito (lá a graça é tudo convivendo). Contas antigas viram a empresa.
//   - Ao abrir a atividade N, as soluções das anteriores que ainda não estão
//     naquela conta rodam em silêncio (o mesmo roteiro que o teste de fumaça
//     prova em cadeia) e o terminal diz o que foi criado — nunca os comandos,
//     que seriam a resposta das atividades puladas.
//   - O que é "o seu computador" (arquivos do terminal, pasta atual, ~/.aws,
//     estado da instalação) é UM só, compartilhado por todas as contas:
//     jogo.local, exposto em cada conta por acessor não enumerável.
//   - A conta é CACHE: não sobe mais pra nuvem (jogo.js). Qualquer ambiente é
//     reconstruível a partir do progresso — e isso encerra o limite de tamanho
//     da sincronização. Guardamos as MAX_CONTAS mais recentes no navegador.
//
// Garantia: teste/isolamento.js abre CADA atividade sozinha, com este
// preparo, numa conta limpa — e exige que a solução dela passe.
// ============================================================
(function () {
  if (typeof criarContaAws !== "function" || typeof DESAFIOS === "undefined") return;

  const COMPARTILHADAS = ["projetos", "mundo-real", "diagnostico"];
  const LOCAIS = ["fs", "cwd", "arquivosSalvos", "cli", "setup"];
  const MAX_CONTAS = 12;
  // Trilhas que usam o que OUTRA trilha criou (achadas pelo teste/isolamento.js
  // em 29/09/2026). Cada item é o id de UMA atividade, ou "trilha@id" — a outra
  // trilha do começo até aquela atividade (nunca inteira: o fim de trilha
  // costuma apagar o que foi criado).
  const DEPENDENCIAS = {
    codepipeline: ["codecommit@ccm-7", "codedeploy@cdp-9"], // repositório com buildspec + app, grupo e frota
    lambda: ["real-11"],   // a função processa-pedido nasce no Mundo real
    ebs: ["ec2@ec2-3"],    // o disco precisa de uma instância pra anexar
    sns: ["sqs-2"],        // a fila pedidos-novos, destino da inscrição
  };
  function passosDaDependencia(dep) {
    const [tr, ate] = dep.split("@");
    if (!ate) { const x = DESAFIOS.find((y) => y.id === dep); return x ? [x] : []; }
    const lista = trilha(tr).filter((x) => x.tipo !== "projeto");
    const i = lista.findIndex((x) => x.id === ate);
    return i >= 0 ? lista.slice(0, i + 1) : [];
  }

  const J = () => (typeof jogo !== "undefined" && jogo ? jogo : null);
  let localVivo = {};

  const chaveDe = (servico) => (COMPARTILHADAS.indexOf(servico) >= 0 ? "empresa" : String(servico || "empresa"));
  const trilha = (servico) => DESAFIOS.filter((d) => d.servico === servico);

  // ---------- o "computador" compartilhado ----------
  function localAtual() { const j = J(); return (j && j.local) || localVivo; }
  function ligarLocais(conta) {
    for (const k of LOCAIS) {
      const d = Object.getOwnPropertyDescriptor(conta, k);
      if (d && d.get) continue;
      if (d && d.value !== undefined && localAtual()[k] === undefined) localAtual()[k] = d.value;
      delete conta[k];
      Object.defineProperty(conta, k, {
        get() { return localAtual()[k]; },
        set(v) { localAtual()[k] = v; },
        enumerable: false, configurable: true,
      });
    }
    return conta;
  }
  function extrairLocais(conta) {
    const l = {};
    for (const k of LOCAIS) {
      const d = conta && Object.getOwnPropertyDescriptor(conta, k);
      if (!d) continue;
      l[k] = d.get ? localVivo[k] : d.value;
    }
    return l;
  }
  function novaConta(chave) {
    const c = criarContaAws();
    c.__amb = chave;
    c.__aplicadas = {};
    return ligarLocais(c);
  }

  // Reconstitui o estado depois de QUALQUER troca do objeto jogo (carregar,
  // login, reset, progresso da nuvem): todas criam um jogo novo com uma
  // `conta` solta, e aqui ela vira (ou volta a ser) o ponteiro.
  function garantir() {
    const j = J();
    if (!j) return null;
    if (!j.local) j.local = Object.assign({}, localVivo, extrairLocais(j.conta));
    localVivo = j.local;
    if (!j.contas || typeof j.contas !== "object") {
      const legado = j.conta || criarContaAws();
      legado.__amb = "empresa";
      legado.__aplicadas = legado.__aplicadas || {};
      j.contas = { empresa: legado };
      j.ambiente = "empresa";
    }
    if (!j.ambiente || !j.contas[j.ambiente]) j.ambiente = j.contas.empresa ? "empresa" : Object.keys(j.contas)[0];
    if (!j.contas[j.ambiente]) j.contas[j.ambiente] = novaConta(j.ambiente);
    // j.conta diferente do ponteiro: ou é a cópia que o JSON duplicou ao
    // carregar (mesmo __amb — descarta), ou alguém pôs uma conta nova de
    // propósito (limpar ambiente, teste) — ela passa a ser a do ambiente.
    if (j.conta !== j.contas[j.ambiente]) {
      if (j.conta && j.conta.__amb === j.ambiente) j.conta = j.contas[j.ambiente];
      else if (j.conta) {
        j.conta.__amb = j.ambiente;
        j.conta.__aplicadas = j.conta.__aplicadas || {};
        j.contas[j.ambiente] = j.conta;
      } else j.conta = j.contas[j.ambiente];
    }
    for (const c of Object.values(j.contas)) if (c && typeof c === "object") ligarLocais(c);
    return j;
  }

  // ---------- rodar a solução de uma atividade, sem tela ----------
  function rodarSolucao(conta, d) {
    const cwd = conta.cwd; // `cd` da solução não pode mudar a pasta da pessoa
    for (const bruto of (d.solucao || [])) {
      const l = typeof resolverPlaceholders === "function" ? resolverPlaceholders(conta, String(bruto)) : String(bruto);
      const t = l.trim();
      try {
        if (/^aws(\s|$)/.test(t)) executarComandoAws(conta, t);
        else if (d.servico === "diagnostico" && typeof labShell === "function") labShell(conta, t);
        else if (typeof executarShellPuro === "function") executarShellPuro(conta, t);
      } catch (e) { /* o preparo é melhor esforço: um passo que falha não trava a atividade */ }
    }
    conta.cwd = cwd;
  }

  // ---------- o que foi criado (pro aviso) ----------
  function fotografia(conta) {
    const f = {};
    for (const [svc, v] of Object.entries(conta || {})) {
      if (svc.indexOf("__") === 0 || !v || typeof v !== "object" || Array.isArray(v)) continue;
      for (const [col, m] of Object.entries(v)) {
        if (!m || typeof m !== "object" || Array.isArray(m)) continue;
        for (const id of Object.keys(m)) if (m[id] && typeof m[id] === "object") f[svc + "/" + col + "/" + id] = true;
      }
    }
    return f;
  }
  function novidades(antes, depois) {
    const grupos = {};
    for (const k of Object.keys(depois)) {
      if (antes[k]) continue;
      const [svc, col, id] = k.split("/");
      (grupos[svc + " " + col] = grupos[svc + " " + col] || []).push(id);
    }
    return Object.entries(grupos).map(([g, ids]) => `${g}: ${ids.slice(0, 3).join(", ")}${ids.length > 3 ? ` (+${ids.length - 3})` : ""}`);
  }

  // ---------- entrar numa atividade ----------
  // Devolve { chave, trocou, passos, faltou, criados } — a tela decide o aviso.
  function entrar(d) {
    const j = garantir();
    if (!j || !d) return null;
    const chave = chaveDe(d.servico);
    const trocou = j.ambiente !== chave;
    let conta = j.contas[chave];
    if (!conta) conta = j.contas[chave] = novaConta(chave);
    conta.__aplicadas = conta.__aplicadas || {};
    conta.__deps = conta.__deps || {};

    const lista = trilha(d.servico).filter((x) => x.tipo !== "projeto" || x === d);
    const idx = Math.max(0, lista.indexOf(d));
    const compartilhada = chave === "empresa";
    // Voltou pra uma atividade que o PREPARO já aplicou (pra abrir outra mais
    // à frente)? O estado dela já existe e o "crie X" daria "já existe": a
    // conta da trilha é refeita até o passo anterior. O que VOCÊ fez não
    // conta — isso é igual ao de sempre. A empresa nunca é refeita.
    let refez = false;
    if (!compartilhada && lista.slice(idx).some((x) => conta.__aplicadas[x.id] === "preparo")) {
      conta = j.contas[chave] = novaConta(chave);
      refez = true;
    }

    const antes = fotografia(conta);
    let passos = 0, faltou = 0;
    if (d.servico === "diagnostico" && typeof montarLabVpc === "function") { try { montarLabVpc(conta); } catch (e) { /* ok */ } }
    for (const dep of (DEPENDENCIAS[d.servico] || [])) {
      if (conta.__deps[dep]) continue;
      for (const x of passosDaDependencia(dep)) {
        if (!x.solucao || !x.solucao.length) { faltou++; continue; }
        rodarSolucao(conta, x); passos++;
      }
      conta.__deps[dep] = true;
    }
    if (d.tipo !== "projeto" || !compartilhada) {
      for (const x of lista.slice(0, idx)) {
        if (conta.__aplicadas[x.id] || x.tipo === "projeto") continue;
        if (!x.solucao || !x.solucao.length) { faltou++; continue; }
        rodarSolucao(conta, x);
        conta.__aplicadas[x.id] = "preparo";
        passos++;
      }
    }
    j.ambiente = chave;
    j.conta = conta;
    conta.__usado = Date.now();
    podar(j);
    return { chave, trocou, passos, faltou, refez, criados: passos ? novidades(antes, fotografia(conta)) : [] };
  }

  // guarda só as MAX_CONTAS usadas por último (a empresa e a atual sempre ficam)
  function podar(j) {
    const outras = Object.keys(j.contas).filter((k) => k !== "empresa" && k !== j.ambiente);
    if (outras.length <= MAX_CONTAS) return;
    outras.sort((a, b) => ((j.contas[a] || {}).__usado || 0) - ((j.contas[b] || {}).__usado || 0));
    for (const k of outras.slice(0, outras.length - MAX_CONTAS)) delete j.contas[k];
  }

  function marcarFeita(d) {
    const j = garantir();
    if (!j || !d) return;
    const c = j.contas[chaveDe(d.servico)];
    if (c) (c.__aplicadas = c.__aplicadas || {})[d.id] = "voce";
  }

  // limpar-ambiente.js: zera só a conta da trilha aberta
  function limparAtual() {
    const j = garantir();
    if (!j) return null;
    const c = novaConta(j.ambiente);
    j.contas[j.ambiente] = c;
    j.conta = c;
    return j.ambiente;
  }
  function nomeDoAmbiente(chave) {
    if (chave === "empresa") return "conta da empresa (Projetos, Mundo real e Diagnóstico)";
    const m = (typeof SERVICOS_META !== "undefined" ? SERVICOS_META : []).find((s) => s.id === chave);
    return "trilha " + (m ? m.nome : chave);
  }

  const API = { garantir, entrar, marcarFeita, limparAtual, nomeDoAmbiente, chaveDe, DEPENDENCIAS, COMPARTILHADAS };
  if (typeof globalThis !== "undefined") globalThis.CLIMB_AMBIENTES = API;

  // ============================================================
  // Tela (só no navegador)
  // ============================================================
  if (typeof window === "undefined" || typeof document === "undefined" || typeof window.selecionarDesafio !== "function") return;

  function avisar(r) {
    if (!r || typeof imprimir !== "function") return;
    if (r.trocou) imprimir(`📦 Ambiente: ${nomeDoAmbiente(r.chave)}. Cada trilha tem a sua conta AWS simulada — o que você criou em outras não aparece aqui.`, "aviso-climb");
    if (r.refez) imprimir("↩️ Você voltou pra um passo que eu tinha preparado sozinho: refiz o ambiente desta trilha até o passo anterior a este. O que existia dos passos seguintes saiu — ao abrir um deles, ele é preparado de novo.", "aviso-climb");
    if (r.passos) {
      imprimir(`⚙️ Preparei o ambiente desta atividade: ${r.passos} ${r.passos === 1 ? "passo anterior da trilha rodou" : "passos anteriores da trilha rodaram"} sozinhos.` +
        (r.criados.length ? " Já existe: " + r.criados.slice(0, 6).join(" · ") + (r.criados.length > 6 ? " …" : "") + "." : ""), "aviso-climb");
    }
    if (r.faltou) imprimir(`(${r.faltou} ${r.faltou === 1 ? "passo anterior não pôde" : "passos anteriores não puderam"} ser preparados — faça ${r.faltou === 1 ? "ele" : "eles"} antes se algo não existir.)`, "aviso-climb");
    if ((r.trocou || r.passos || r.refez) && typeof rolarTerminal === "function") rolarTerminal();
  }

  // Por FORA do lab-vpc.js (que carrega antes e monta o laboratório em
  // jogo.conta): o ponteiro tem de estar certo antes dele rodar.
  const abrirOriginal = window.selecionarDesafio;
  window.selecionarDesafio = function (id) {
    try {
      const d = typeof obterDesafio === "function" ? obterDesafio(id) : null;
      // atividade paga pra quem não é Pro: o licenca.js mostra o plano e não
      // abre — então aqui também não se troca nem se prepara nada
      const bloqueada = d && typeof podeAcessar === "function" && !podeAcessar(d);
      const r = d && !bloqueada ? entrar(d) : null;
      if (r && (r.passos || r.trocou || r.refez) && typeof salvarJogo === "function") salvarJogo();
      avisar(r);
    } catch (e) { /* nunca impede de abrir a atividade */ }
    return abrirOriginal.apply(this, arguments);
  };
  try { selecionarDesafio = window.selecionarDesafio; } catch (e) { /* já coberto pelo global */ }

  if (typeof concluirDesafio === "function") {
    const concluirOriginal = concluirDesafio;
    const envolvido = function (d) { try { marcarFeita(d); } catch (e) { /* ok */ } return concluirOriginal.apply(this, arguments); };
    window.concluirDesafio = envolvido;
    try { concluirDesafio = envolvido; } catch (e) { /* ok */ }
  }

  // Toda função que TROCA o objeto jogo (carregar, login, nuvem, reset) deixa
  // uma `conta` solta; logo depois dela o ponteiro é refeito. E antes de
  // salvar, pra nunca gravar uma cópia no lugar do ambiente.
  for (const nome of ["carregarJogo", "aplicarProgressoNuvem", "entrarComConta", "resetarJogo"]) {
    const orig = window[nome];
    if (typeof orig !== "function") continue;
    window[nome] = function () { const r = orig.apply(this, arguments); try { garantir(); } catch (e) { /* ok */ } return r; };
  }
  try { carregarJogo = window.carregarJogo; aplicarProgressoNuvem = window.aplicarProgressoNuvem; entrarComConta = window.entrarComConta; resetarJogo = window.resetarJogo; } catch (e) { /* ok */ }
  if (typeof salvarJogo === "function") {
    const salvarOriginal = salvarJogo;
    window.salvarJogo = function () { try { garantir(); } catch (e) { /* ok */ } return salvarOriginal.apply(this, arguments); };
    try { salvarJogo = window.salvarJogo; } catch (e) { /* ok */ }
  }

  // o jogo carregado antes deste arquivo já vira o formato novo
  try { garantir(); } catch (e) { /* ok */ }
})();
