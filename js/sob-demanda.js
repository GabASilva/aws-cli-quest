"use strict";
// ============================================================
// CLImb — sob-demanda.js
// PROBLEMA (medido em 16/09/2026): a página entrega 676 KiB de JS comprimido
// ANTES do primeiro pixel, e com `defer` o DOMContentLoaded — que é quando o
// app.js monta a tela — só dispara depois que o ÚLTIMO script chegou. Ou seja:
// todo visitante espera o banco inteiro de questões do simulado para ver a
// primeira atividade, mesmo que nunca abra um simulado.
//
// Este arquivo tira do caminho crítico o que só existe DENTRO de uma tela que
// se abre por clique. Ele carrega um grupo de scripts na primeira vez que
// alguém precisa dele, na ordem declarada, e memoriza a promessa.
//
// O que NÃO entra aqui (e é o motivo de a lista ser curta): arquivo que cria
// botão, registra atividade, manual ou lição. Esses precisam existir no boot —
// se chegarem depois, o botão aparece atrasado (volta o CLS) ou a trilha some
// da lateral. Os grupos abaixo são só dados e desenho de tela: ninguém os
// consulta antes de a tela abrir.
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const GRUPOS = {
    // Só a arte do gabarito comentado (desenho, não conteúdo). O BANCO de
    // questões e as fontes NÃO entram aqui: eles exigem conta e vêm por
    // GET /api/simulados/banco — ver buscarBanco() no js/simulados.js. Antes
    // desta mudança, os 345 gabaritos baixavam com um curl em
    // /js/simulados-clf-1.js, sem login.
    simulados: ["js/simulados-arte.js"],
    // As subtelas do Console emulado (window.cawsSubtela), usadas só depois de
    // o Console estar aberto.
    console: ["js/console-subtelas.js"],
  };

  // A versão dos assets vem do próprio HTML: o servidor injeta ?v=<hash> em
  // todo src de js/ e css/. Sem repetir isso aqui, o arquivo seria pedido numa
  // URL sem versão — que o servidor manda revalidar a cada visita em vez de
  // guardar pra sempre. Pegamos de um <script> já presente na página.
  function versao() {
    for (const s of document.scripts) {
      const m = (s.src || "").match(/[?&]v=([^&]+)/);
      if (m) return m[1];
    }
    return null;
  }

  function carregarUm(caminho) {
    return new Promise((ok, falhou) => {
      const v = versao();
      const tag = document.createElement("script");
      tag.src = caminho + (v ? "?v=" + v : "");
      tag.async = false; // preserva a ordem entre os scripts do grupo
      tag.onload = () => ok(caminho);
      tag.onerror = () => falhou(new Error("não consegui carregar " + caminho));
      document.head.appendChild(tag);
    });
  }

  const emAndamento = {};

  // Devolve sempre a MESMA promessa por grupo: chamar duas vezes (dois cliques
  // rápidos) não baixa duas vezes, e quem chamar depois de pronto continua
  // podendo dar .then() sem esperar nada.
  window.carregarGrupo = function (nome) {
    if (emAndamento[nome]) return emAndamento[nome];
    const lista = GRUPOS[nome];
    if (!lista) return Promise.reject(new Error("grupo desconhecido: " + nome));
    emAndamento[nome] = lista.reduce(
      (fila, caminho) => fila.then(() => carregarUm(caminho)),
      Promise.resolve()
    );
    return emAndamento[nome];
  };

  // Pré-carga no primeiro SINAL DE USO, não no ocioso.
  //
  // A primeira versão disto pré-carregava em requestIdleCallback, e a medição
  // mostrou que era pior que não fazer nada: o ocioso chega logo depois do
  // load, então os 74 KiB voltavam a disputar banda com o que a tela ainda
  // precisava — LCP 7,8 s contra 6,6 s sem a pré-carga (Lighthouse local,
  // celular, 16/09). Esperar um sinal de que a pessoa está USANDO o app tira
  // esse tráfego da janela de carregamento e ainda assim chega bem antes do
  // clique: passar o mouse sobre o botão já basta, e quem vai fazer simulado
  // costuma antes digitar alguma coisa no terminal.
  function prepararPreCarga() {
    let pedido = false;
    const puxar = () => {
      if (pedido) return;
      pedido = true;
      window.carregarGrupo("simulados").catch(() => { /* o clique tenta de novo */ });
    };
    const btn = document.getElementById("btnSimulados");
    if (btn) {
      btn.addEventListener("pointerenter", puxar, { once: true });
      btn.addEventListener("touchstart", puxar, { once: true, passive: true });
    }
    const entrada = document.getElementById("entradaTerminal");
    if (entrada) entrada.addEventListener("keydown", puxar, { once: true });
  }
  if (document.readyState === "complete") prepararPreCarga();
  else window.addEventListener("load", prepararPreCarga);
})();
