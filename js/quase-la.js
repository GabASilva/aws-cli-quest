"use strict";
// ============================================================
// CLImb — quase-la.js
// Feedback de "quase lá": quando o comando RODA CERTO mas não completa a
// atividade, o app ficava MUDO — a pessoa via a saída de sucesso e não
// entendia por que nada aconteceu. Esse silêncio empurrava todo mundo pro
// botão de dica.
//
// Aqui a gente compara o que foi digitado com o que a atividade espera e
// aponta a CATEGORIA do problema (serviço errado / comando errado / falta uma
// opção / nome diferente). De propósito NÃO entregamos o comando pronto —
// isso é papel da revelação, que custa XP.
//
// ADITIVO: faz wrap de window.verificarDesafios (mesmo padrão do missoes.js).
// Carrega DEPOIS de missoes.js pra envolver a versão já envolvida.
// ============================================================
(function () {
  if (typeof window === "undefined") return;

  // ---------- parse da solução esperada ----------
  // Reusa o tokenizador do simulador pra ler a solução do mesmo jeito que o
  // motor lê o que a pessoa digitou (aspas, --flag=valor etc.).
  function passosEsperados(d) {
    const passos = [];
    for (const linha of d.solucao || []) {
      if (!/^\s*aws\s/.test(linha)) continue; // linhas de shell (linux lab) não entram
      let tokens;
      try { tokens = tokenizar(linha); } catch (e) { continue; }
      if (tokens[1] === undefined || tokens[2] === undefined) continue;
      let args;
      try { args = parsearArgs(tokens.slice(3)); } catch (e) { args = { flags: {} }; }
      passos.push({ servico: tokens[1], sub: tokens[2], flags: args.flags || {} });
    }
    return passos;
  }

  // Nome bonito da trilha (pra falar "esta atividade é sobre Budgets", sem
  // entregar o comando).
  function nomeDaTrilha(servicoId) {
    if (typeof SERVICOS_META === "undefined") return null;
    const m = SERVICOS_META.find((s) => s.id === servicoId);
    return m ? m.nome : null;
  }

  // ---------- a análise ----------
  // Devolve o texto do empurrãozinho, ou null se não há nada útil a dizer.
  function analisar(d, cmd) {
    if (!cmd || !cmd.servico || cmd.servico === "help" || cmd.servico === "configure") return null;
    const passos = passosEsperados(d);
    if (!passos.length) return null;

    // 1) acertou serviço E comando? Então é detalhe: falta opção ou o nome difere.
    const igual = passos.find((p) => p.servico === cmd.servico && p.sub === cmd.sub);
    if (igual) {
      const usadas = cmd.flags || {};
      // alguma opção que a atividade precisa e não foi passada?
      const faltando = Object.keys(igual.flags).filter((f) => usadas[f] === undefined);
      if (faltando.length) {
        const lista = faltando.slice(0, 2).map((f) => "--" + f).join(" e ");
        return `Quase! O comando está certo — falta a opção ${lista}. Veja o que ela faz em: aws ${cmd.servico} ${cmd.sub} help`;
      }
      // comando e opções certos: o que difere é algum VALOR (nome do recurso).
      return "Quase! O comando está certo, mas algum valor não bate com o que a atividade pediu — confira os nomes em destaque no enunciado (eles precisam ser iguaizinhos).";
    }

    // 2) serviço certo, comando errado.
    const mesmoServico = passos.find((p) => p.servico === cmd.servico);
    if (mesmoServico) {
      return `Você está no serviço certo, mas esse não é o comando que a atividade pede. Veja a lista com: aws ${cmd.servico} help`;
    }

    // 3) serviço diferente. Não dizemos qual é o certo — dizemos de onde é a
    // atividade (a trilha já está visível na lista lateral, então não é spoiler).
    const nome = nomeDaTrilha(d.servico);
    return nome
      ? `Esse comando é de outro serviço. Esta atividade é da trilha ${nome} — o comando começa por aí.`
      : "Esse comando é de outro serviço, diferente do que a atividade pede.";
  }

  // ---------- wrap ----------
  const original = window.verificarDesafios;
  if (typeof original !== "function") return;

  let ultimoTexto = null; // não repetir o mesmo empurrão duas vezes seguidas

  window.verificarDesafios = function (cmd) {
    const antes = ui && ui.desafioAtivo ? ui.desafioAtivo : null;
    const d = antes ? obterDesafio(antes) : null;
    const jaFeito = d ? desafioConcluido(d.id) : true;

    original.apply(this, arguments);

    // Só falamos quando: há atividade aberta, ela NÃO era concluída antes,
    // continua não concluída depois, e não é do banco de treino (avulso) nem
    // projeto (esse tem checklist próprio, que já dá feedback por etapa).
    if (!d || jaFeito || d.avulso || d.tipo === "projeto") { ultimoTexto = null; return; }
    if (desafioConcluido(d.id)) { ultimoTexto = null; return; } // acabou de passar

    let texto = null;
    try { texto = analisar(d, cmd); } catch (e) { texto = null; }
    if (!texto || texto === ultimoTexto) return;
    ultimoTexto = texto;

    if (typeof imprimir === "function") {
      imprimir(texto, "quase-la");
      if (typeof rolarTerminal === "function") rolarTerminal();
    }
  };
})();
