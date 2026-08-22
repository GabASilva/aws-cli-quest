"use strict";
// ============================================================
// CLImb — tela-limpa.js
// PROBLEMA (medido): com uma trilha aberta, a tela tinha 54 elementos
// clicáveis — 46 só na lista lateral. Abrir o S3 despeja 31 atividades, das
// quais 30 são <button disabled>. A 43px cada, são 1.290px de botão que não
// faz nada numa tela de 1.270px: a fila de cadeados é mais alta que o monitor.
//
// E no card, o "Revelar resposta" aparecia em VERMELHO junto com a primeira
// dica — o botão de desistir oferecido no mesmo instante que o de tentar, e
// com a cor mais chamativa dos dois.
//
// Duas correções:
//   1. A lista mostra o que já foi feito, a atual e as 3 próximas; o resto
//      vira UMA linha ("+26 desbloqueiam conforme você avança") que expande
//      com um clique. Nada some de verdade — só para de ocupar a tela.
//   2. "Revelar resposta" só aparece quando as dicas acabam, e como link
//      discreto. O alerta continua no modal de confirmação, que já existia.
//
// ADITIVO: embrulha renderSidebar/renderCard (declarações globais de app.js),
// não reescreve nada. Carrega DEPOIS de sidebar-grupos.js, pra embrulhar a
// versão final do renderSidebar.
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const QUANTAS_ADIANTAR = 3;      // quantas travadas ficam à mostra
  const MINIMO_PRA_CORTAR = 2;     // abaixo disso não compensa o corte
  const expandidas = new Set();    // trilhas que a pessoa mandou abrir (por sessão)

  function injetarEstilo() {
    if (document.getElementById("tlEstilo")) return;
    const st = document.createElement("style");
    st.id = "tlEstilo";
    st.textContent = `
      .tl-escondido { display: none !important; }
      .tl-mais {
        display: block; width: 100%; text-align: left;
        background: none; border: 0; cursor: pointer;
        padding: .55rem .75rem .55rem 1.6rem;
        color: var(--texto-fraco, #8b99b0); font-size: .78rem;
        font-family: inherit; line-height: 1.35;
        border-left: 2px solid var(--borda, #2a3650);
        transition: color .12s ease, border-color .12s ease;
      }
      .tl-mais:hover {
        color: var(--laranja, #ff9900);
        border-left-color: var(--laranja, #ff9900);
      }
      .tl-mais .tl-seta { display: inline-block; margin-right: .35rem; }
      /* "ver a resposta": link discreto, não botão de perigo */
      .botao.tl-desistir {
        background: none !important; border: 0 !important;
        color: var(--texto-fraco, #8b99b0) !important;
        font-size: .82rem !important; font-weight: 400 !important;
        padding: .5rem .25rem !important;
        text-decoration: underline; text-underline-offset: 3px;
        box-shadow: none !important;
      }
      .botao.tl-desistir:hover { color: var(--vermelho, #ff5c5c) !important; }
    `;
    document.head.appendChild(st);
  }

  // ---------- 1. cortar a fila de travadas ----------
  function enxugarLista(lista) {
    const servico = lista.closest("[data-servico]");
    const id = servico ? servico.getAttribute("data-servico") : null;

    // limpa marcação de um render anterior
    lista.querySelectorAll(".tl-mais").forEach((b) => b.remove());
    lista.querySelectorAll(".tl-escondido").forEach((b) => b.classList.remove("tl-escondido"));
    if (id && expandidas.has(id)) return; // a pessoa pediu pra ver tudo

    const itens = [...lista.querySelectorAll(".item-desafio")];
    if (!itens.length) return;

    // Só encolhemos o RABO de travadas. Assim o que já foi concluído e a
    // atividade atual nunca somem — independente das classes que o app use
    // pra marcá-las.
    let inicioDoRabo = itens.length;
    while (inicioDoRabo > 0 && itens[inicioDoRabo - 1].classList.contains("travado")) inicioDoRabo--;

    const rabo = itens.slice(inicioDoRabo);
    const escondidas = rabo.slice(QUANTAS_ADIANTAR);
    if (escondidas.length < MINIMO_PRA_CORTAR) return;

    escondidas.forEach((b) => b.classList.add("tl-escondido"));

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tl-mais";
    const n = escondidas.length;
    btn.innerHTML = `<span class="tl-seta" aria-hidden="true">⌄</span>+${n} ${n === 1 ? "atividade desbloqueia" : "atividades desbloqueiam"} conforme você avança`;
    btn.setAttribute("aria-expanded", "false");
    btn.title = "Ver todas as atividades desta trilha";
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation(); // não deixar o clique fechar/abrir a trilha
      if (id) expandidas.add(id);
      escondidas.forEach((b) => b.classList.remove("tl-escondido"));
      btn.remove();
    });
    lista.appendChild(btn);
  }

  function enxugarTudo() {
    document.querySelectorAll("#sidebar .lista-desafios").forEach(enxugarLista);
  }

  // ---------- 2. "ver a resposta" só depois das dicas ----------
  function ajustarCard() {
    const revelar = document.querySelector("#btnRevelar");
    if (!revelar) return;
    let total = 0;
    try {
      const d = DESAFIOS.find((x) => x.id === ui.desafioAtivo);
      total = d && d.dicas ? d.dicas.length : 0;
    } catch (e) { return; }

    // Enquanto houver dica pra pedir, o card oferece só o próximo empurrão.
    if (total && ui.dicasVisiveis < total) {
      revelar.classList.add("tl-escondido");
      return;
    }
    revelar.classList.remove("tl-escondido");
    revelar.classList.remove("perigo");
    revelar.classList.add("tl-desistir");
    revelar.textContent = "ver a resposta (zera o XP)";
  }

  // ---------- embrulhos ----------
  // Rodam DENTRO da mesma tarefa do render: o navegador só pinta quando ela
  // termina, então não há piscada do estado "antes do ajuste".
  function embrulhar(nome, depois) {
    const original = window[nome];
    if (typeof original !== "function" || original.__tl) return;
    function embrulhada() {
      const r = original.apply(this, arguments);
      try { depois(); } catch (e) { /* nunca quebrar a UI por causa disto */ }
      return r;
    }
    embrulhada.__tl = true;
    window[nome] = embrulhada;
  }

  // ---------- 3. quem terminou tudo merece ouvir isso ----------
  // Sem isto, quem conclui as 630 atividades — nível máximo, 10/10 conquistas —
  // continua recebendo o card de boas-vindas dizendo "comece pela trilha do S3
  // se for sua primeira vez". O fim da jornada simplesmente não existia.
  function cardDeConclusao() {
    const vazio = document.querySelector("#cardDesafio .card-vazio");
    if (!vazio) return;
    // Conta TUDO, projetos inclusive: dizer "625" quando a capa anuncia 630
    // faz a pessoa achar que ficou faltando alguma coisa. Projeto nao entra em
    // jogo.concluidos — a conclusao dele e ter todas as etapas marcadas.
    let total = 0, feitos = 0;
    try {
      for (const d of DESAFIOS) {
        total++;
        if (d.tipo === "projeto") {
          const et = (jogo.etapasProjetos || {})[d.id] || [];
          if (et.length && et.every(Boolean)) feitos++;
        } else if (desafioConcluido(d.id)) feitos++;
      }
    } catch (e) { return; }
    if (!total || feitos < total) return;
    vazio.innerHTML =
      "<h2>🏁 Você terminou o CLImb</h2>" +
      "<p>São <strong>" + total + " atividades</strong> concluídas — todas as trilhas, todos os cenários, " +
      "todos os projetos. Dá pra contar isso numa entrevista.</p>" +
      "<p>O terminal continua aqui: use o <strong>🎲 Treino aleatório</strong> pra não enferrujar, " +
      "ou o <strong>Console</strong> e os <strong>Simulados</strong> em Ferramentas. " +
      "Coisa nova entra pelo <strong>✨ Novidades</strong>.</p>" +
      "<p>E se quiser mostrar o resultado: seu <strong>perfil público</strong> tem um link pronto pra compartilhar.</p>";
  }

  function iniciar() {
    injetarEstilo();
    embrulhar("renderSidebar", enxugarTudo);
    embrulhar("renderCard", function () { ajustarCard(); cardDeConclusao(); });
    enxugarTudo();
    ajustarCard();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
