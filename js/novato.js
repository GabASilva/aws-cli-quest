"use strict";
// ============================================================
// CLImb — novato.js
// Socorro para quem nunca viu um terminal na vida.
//
// DE ONDE VEIO: percorri o app como uma pessoa que usa computador só pro
// dia a dia e nunca ouviu falar de AWS. Foram QUATRO erros antes do primeiro
// acerto, e três deles não eram falta de atenção — eram coisas que ninguém
// tinha contado:
//
//   1. Pedi ajuda em português (`ajuda`) e levei "comando não encontrado" —
//      sendo que `help` existe e faz exatamente o que eu queria.
//   2. O erro manda usar `s3://<nome-do-bucket>`. Ninguém me ensinou que
//      `< >` quer dizer "escreva aqui", então digitei os sinais junto.
//   3. Esquecer o `s3://`, digitar uma barra só e usar maiúscula davam a
//      MESMA linha de erro, sem dizer qual dos três eu tinha feito.
//   4. Depois de três tentativas perdidas, nada me lembrava que existe um
//      botão de dica logo acima do terminal.
//
// ADITIVO: não altera simulador.js nem erros-amigaveis.js. Embrulha
// window.executarLinha (mesmo padrão do abertura.js) e observa imprimir().
// Carrega DEPOIS de erros-amigaveis.js.
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  function diz(t, cls) { if (typeof imprimir === "function") imprimir(t, cls || ""); }
  function rolar() { if (typeof rolarTerminal === "function") rolarTerminal(); }

  function simples(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  // ---------- 1. pedido de ajuda em português ----------
  // Não é só apelido: imprime o equivalente em inglês antes de rodar, senão a
  // pessoa aprende a falar "ajuda" — que não existe em terminal nenhum.
  const PEDIDOS_DE_AJUDA = [
    "ajuda", "socorro", "me ajuda", "help me", "comandos", "menu", "?", "??",
    "nao sei", "nao sei o que fazer", "e agora", "o que eu faco", "o que fazer",
    "como funciona", "como usar", "estou perdido", "to perdido", "perdido",
  ];

  function ehPedidoDeAjuda(linha) {
    const s = simples(linha);
    return PEDIDOS_DE_AJUDA.indexOf(s) >= 0;
  }

  // ---------- 2. sinais < > copiados junto ----------
  // Só casa <palavra> grudado. O `>` sozinho é redirecionamento de arquivo
  // (echo x > a.txt), que o simulador usa de verdade — não pode ser capturado.
  const SINAIS = /<[^<>\s]+>/;

  // ---------- 3. o que exatamente está errado no s3:// ----------
  // Só `mb` e `rb`: são os únicos cujo PRIMEIRO argumento é obrigatoriamente
  // um endereço s3://. Em `cp` e `sync` o primeiro argumento é um arquivo
  // local (aws s3 cp relatorio.csv s3://bucket/) — incluí-los aqui faria o
  // aviso disparar em comando correto.
  function diagnosticarS3(linha) {
    const m = /^\s*aws\s+s3\s+(mb|rb)\s+(\S+)/i.exec(linha);
    if (!m) return null;
    const arg = m[2];
    if (/^s3:\/\//i.test(arg)) {
      if (/^S3:\/\//.test(arg)) return "O esquema é minúsculo: `s3://`, não `S3://`.";
      return null;                                  // forma certa; erro é outro
    }
    if (/^s3:\/[^/]/i.test(arg)) return "São DUAS barras depois dos dois-pontos: `s3://` — você digitou uma só.";
    if (/^s3:/i.test(arg)) return "Depois de `s3:` vêm duas barras: `s3://nome-do-bucket`.";
    if (/^https?:\/\//i.test(arg)) return "Aqui não é endereço de site: o endereço de um bucket começa com `s3://`.";
    return "Faltou o `s3://` na frente do nome. O comando inteiro fica: `aws s3 " + m[1] + " s3://" + arg + "`";
  }

  // ---------- 4. três tentativas perdidas seguidas ----------
  let perdidasSeguidas = 0;
  let erroDeComando = false;

  function apontarParaADica() {
    const card = document.getElementById("cardDesafio");
    const temDica = card && /Dica \(/.test(card.textContent || "");
    diz("");
    diz("Perdido? Não tem problema — todo mundo começa assim.", "aviso-climb");
    if (temDica) diz("Clique em 💡 Dica no card acima: ela conta o comando aos poucos, de graça.", "aviso-climb");
    else diz("Escolha uma atividade na lista à esquerda: cada uma diz exatamente o que fazer.", "aviso-climb");
    diz("E `aws s3 help` lista os comandos do S3 com um exemplo de cada.", "aviso-climb");
    rolar();
  }

  // ---------- ganchos ----------
  function observarImprimir() {
    const original = window.imprimir;
    if (typeof original !== "function" || original.__nv) return;
    function comObservador(texto, classe) {
      if (classe === "erro" && /comando não encontrado/i.test(String(texto))) erroDeComando = true;
      return original.apply(this, arguments);
    }
    comObservador.__nv = true;
    window.imprimir = comObservador;
  }

  function embrulharLinha() {
    const original = window.executarLinha;
    if (typeof original !== "function" || original.__nv) return;

    function comSocorro(linha) {
      const bruto = String(linha || "").trim();

      // 1. pedido de ajuda em português: mostra o comando de verdade e roda
      if (bruto && ehPedidoDeAjuda(bruto)) {
        if (typeof imprimirComando === "function") imprimirComando(bruto);
        diz("Em terminal o comando é `help`, em inglês. Rodei pra você:", "aviso-climb");
        perdidasSeguidas = 0;
        return original.call(this, "help");
      }

      // 2. os sinais < > vieram junto
      if (bruto && SINAIS.test(bruto)) {
        if (typeof imprimirComando === "function") imprimirComando(bruto);
        diz("Os sinais `<` e `>` não fazem parte do comando — eles só marcam", "aviso-climb");
        diz("onde VOCÊ escreve o nome. Tire os dois e digite só o nome dentro.", "aviso-climb");
        diz("Ex.: `aws s3 mb s3://<nome-do-bucket>`  vira  `aws s3 mb s3://meu-bucket`", "aviso-climb");
        rolar();
        return;
      }

      erroDeComando = false;
      const r = original.apply(this, arguments);

      // 3. o s3:// estava malformado — explica QUAL foi o engano
      const diag = diagnosticarS3(bruto);
      if (diag) { diz("💡 " + diag, "dica-erro"); rolar(); }

      // 4. três seguidas sem acertar comando nenhum
      if (erroDeComando) {
        perdidasSeguidas++;
        if (perdidasSeguidas === 3) { apontarParaADica(); perdidasSeguidas = 0; }
      } else if (bruto) {
        perdidasSeguidas = 0;
      }
      return r;
    }
    comSocorro.__nv = true;
    window.executarLinha = comSocorro;
  }

  function iniciar() { observarImprimir(); embrulharLinha(); }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
