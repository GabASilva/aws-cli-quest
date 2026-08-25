"use strict";
// ============================================================
// CLImb — climb-cmd.js
// O comando `climb` dentro do próprio terminal do jogo.
//
// POR QUE SÓ ESTES QUATRO: `climb proxima` e `climb buscar` são mais rápidos
// que a lateral — com 630 atividades em 63 trilhas, rolar pra achar algo é
// trabalho. Já um `climb trilhas` seria só uma versão pior da lista que já
// está na tela, então ficou de fora.
//
// A lateral CONTINUA fazendo tudo. Isto é um atalho para quem já sabe onde
// quer chegar, não um pedágio: exigir um comando pra escolher tarefa somaria
// um passo justamente onde o app mais perde gente (17 dos 39 cadastrados
// nunca digitaram nada).
//
// `climb --help` existe de propósito na forma com dois traços: é o hábito que
// o produto quer instalar — ler o manual antes de adivinhar.
//
// ADITIVO: embrulha window.executarLinha, mesmo padrão do abertura.js. Carrega
// DEPOIS dele e sai do caminho enquanto a abertura estiver rodando, porque lá
// o `climb` tem outro papel (conduzir o roteiro).
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  function diz(t, cls) { if (typeof imprimir === "function") imprimir(t, cls || ""); }
  function rolar() { if (typeof rolarTerminal === "function") rolarTerminal(); }
  function naAbertura() { return document.body.classList.contains("ab-modo"); }

  // tira acento pra "próxima" e "proxima" caírem no mesmo lugar
  function simples(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  function nomeDoServico(id) {
    try {
      const m = SERVICOS_META.find((s) => s.id === id);
      return m ? m.nome : id;
    } catch (e) { return id; }
  }

  function abrir(d) {
    try {
      // abre a trilha na lateral também: senão a atividade fica selecionada
      // dentro de um grupo fechado e a pessoa não vê onde caiu
      if (typeof ui !== "undefined") ui.servicoAberto = d.servico;
      selecionarDesafio(d.id);
      return true;
    } catch (e) { return false; }
  }

  function linhaDoDesafio(d) {
    const feito = desafioConcluido(d.id) ? "✓ " : desafioLiberado(d) ? "  " : "· ";
    const nivel = (typeof NOMES_NIVEL !== "undefined" && NOMES_NIVEL[d.nivel]) || "";
    return `  ${feito}${d.id.padEnd(12)} ${d.titulo}`
         + `\n       ${nomeDoServico(d.servico)} · ${nivel} · ${d.xp} XP`;
  }

  // ---------- comandos ----------
  function ajuda() {
    diz("climb — atalhos do próprio CLImb (a lista à esquerda faz o mesmo)");
    diz("");
    diz("  climb proxima            abre a próxima atividade não concluída");
    diz("  climb buscar <termo>     procura entre as 630 atividades");
    diz("  climb ir <id>            abre uma atividade pelo id (ex.: s3-7)");
    diz("  climb --help             esta ajuda");
    diz("");
    diz("O id de cada atividade aparece na busca. Comandos da AWS são os de verdade:", "aviso-climb");
    diz("  aws help · aws s3 help · aws s3 mb help", "aviso-climb");
    rolar();
  }

  function proxima() {
    let alvo = null;
    try {
      // respeita a ordem das trilhas, que é a ordem pedagógica
      for (const s of (typeof SERVICOS_TRILHA !== "undefined" ? SERVICOS_TRILHA : SERVICOS_META.map((m) => m.id))) {
        const cand = (desafiosDoServico(s) || []).find((d) => !desafioConcluido(d.id) && desafioLiberado(d));
        if (cand) { alvo = cand; break; }
      }
    } catch (e) { /* cai no aviso abaixo */ }

    if (!alvo) {
      diz("Nada pendente e liberado — você concluiu tudo que está aberto. 🎉", "aviso-climb");
      rolar();
      return;
    }
    if (abrir(alvo)) {
      diz(`Abrindo ${alvo.id} — ${alvo.titulo}`, "aviso-climb");
      diz(`${nomeDoServico(alvo.servico)} · ${alvo.xp} XP. O enunciado está no card acima.`);
    }
    rolar();
  }

  function buscar(termo) {
    const t = simples(termo);
    if (!t) {
      diz("Uso: climb buscar <termo>   (ex.: climb buscar lambda)", "erro");
      rolar();
      return;
    }
    let achados = [];
    try {
      achados = DESAFIOS.filter((d) =>
        simples(d.titulo).includes(t) ||
        simples(d.servico).includes(t) ||
        simples(nomeDoServico(d.servico)).includes(t) ||
        simples(d.id).includes(t)
      );
    } catch (e) { /* lista vazia */ }

    if (!achados.length) {
      diz(`Nada encontrado para "${termo}".`, "erro");
      diz("Tente o nome de um serviço (lambda, iam, vpc) ou parte do título.", "aviso-climb");
      rolar();
      return;
    }

    const LIMITE = 12;
    diz(`${achados.length} resultado(s) para "${termo}"` + (achados.length > LIMITE ? ` — mostrando ${LIMITE}` : ""));
    diz("");
    achados.slice(0, LIMITE).forEach((d) => diz(linhaDoDesafio(d)));
    diz("");
    diz("✓ concluída · (vazio) liberada · · ainda travada", "aviso-climb");
    diz("Abra com: climb ir <id>", "aviso-climb");
    rolar();
  }

  function ir(id) {
    const alvo = String(id || "").trim();
    if (!alvo) {
      diz("Uso: climb ir <id>   (ex.: climb ir s3-7)", "erro");
      rolar();
      return;
    }
    let d = null;
    try { d = obterDesafio(alvo); } catch (e) { /* segue */ }
    if (!d) {
      diz(`Não existe atividade com id "${alvo}".`, "erro");
      diz("Use climb buscar <termo> pra descobrir o id.", "aviso-climb");
      rolar();
      return;
    }
    if (!desafioLiberado(d)) {
      diz(`"${d.titulo}" ainda está travada.`, "erro");
      diz("Ela abre quando você concluir as anteriores da trilha " + nomeDoServico(d.servico) + ".", "aviso-climb");
      rolar();
      return;
    }
    if (abrir(d)) {
      diz(`Abrindo ${d.id} — ${d.titulo}`, "aviso-climb");
      if (desafioConcluido(d.id)) diz("Você já concluiu esta. Refazer não dá XP de novo.", "aviso-climb");
    }
    rolar();
  }

  // ---------- despacho ----------
  function tratar(linha) {
    const bruto = String(linha).trim();
    if (typeof imprimirComando === "function") imprimirComando(bruto);

    const partes = bruto.split(/\s+/);
    const sub = simples(partes[1] || "");
    const resto = partes.slice(2).join(" ");

    if (!sub || sub === "--help" || sub === "-h" || sub === "help" || sub === "ajuda") return ajuda();
    if (sub === "proxima" || sub === "next") return proxima();
    if (sub === "buscar" || sub === "busca" || sub === "procurar") return buscar(resto);
    if (sub === "ir" || sub === "abrir") return ir(resto);

    diz(`climb: subcomando desconhecido "${partes[1]}".`, "erro");
    diz("Veja os disponíveis com: climb --help", "aviso-climb");
    rolar();
  }

  function embrulhar() {
    const original = window.executarLinha;
    if (typeof original !== "function" || original.__cc) return;

    function comClimb(linha) {
      const cmd = String(linha || "").trim();
      // durante a abertura, `climb` pertence ao roteiro de lá
      if (!naAbertura() && /^climb(\s|$)/i.test(cmd)) {
        tratar(cmd);
        return;
      }
      return original.apply(this, arguments);
    }
    comClimb.__cc = true;
    window.executarLinha = comClimb;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", embrulhar);
  else embrulhar();
})();
