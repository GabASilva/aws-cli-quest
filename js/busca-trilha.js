"use strict";
// ============================================================
// CLImb — busca-trilha.js
// Uma busca DENTRO de cada trilha aberta na lateral: você digita "stop",
// "--query", "apagar" ou "timeout" e a lista mostra só as atividades que
// tratam daquilo — e, em cima, os comandos do serviço que casam, com o porquê
// de cada um. Pedido do Gabriel (25/09/2026): trilhas passaram de 30
// atividades e achar "aquela do delete" virou rolagem.
//
// O QUE ELA OLHA: título, descrição e — só quando o navegador JÁ tem — a
// solução da atividade. A solução das trilhas pagas não desce pra quem não é
// Pro (lib/sem-gabarito.js), então pra esse aluno a busca casa por título e
// descrição e não revela qual comando resolve uma atividade paga. Os comandos
// do topo vêm do MANUAIS do serviço, que é público (é o `aws <svc> help`).
//
// ADITIVO: embrulha renderSidebar DEPOIS do tela-limpa.js (que esconde as
// travadas além das 3 próximas), por isso se registra no DOMContentLoaded.
// Não recria a lista: filtra os botões que já existem.
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const MINIMO = 6;              // trilha curta não precisa de busca
  const MAX_COMANDOS = 6;        // quantos comandos mostrar no topo
  const consultas = {};          // o que foi digitado, por trilha (dura a sessão)

  // A trilha usa comandos de outro serviço da CLI em alguns casos. Formato:
  // [serviço da CLI, filtro opcional no nome do comando]. VPC, EBS e o lab de
  // diagnóstico moram no `aws ec2`, então pegam só os comandos do assunto deles.
  const CLI_DA_TRILHA = {
    s3: [["s3"], ["s3api"]], cloudwatch: [["cloudwatch"], ["logs"]],
    vpc: [["ec2", /vpc|subnet|route|internet-gateway|nat-gateway|network|flow-log|address/]],
    ebs: [["ec2", /volume|snapshot/]],
    diagnostico: [["ec2", /network|flow-log|security-group|route|vpc/]],
    autoscaling: [["autoscaling"], ["ec2", /launch-template/]],
    bedrock: [["bedrock"], ["bedrock-runtime"]],
    codedeploy: [["deploy"]],
    // o EC2 também é o aws ec2, mas sem os assuntos que têm trilha própria
    ec2: [["ec2", null, /vpc|subnet|route|internet-gateway|network-acl|network-interface|flow-log|volume|snapshot|launch-template/]],
  };
  // Quem procura em português acha o verbo em inglês (e vice-versa).
  const SINONIMOS = [
    ["apag", "delet", "remov", "exclu", "destru", "desliga"],
    ["cri", "create", "novo", "put", "registr"],
    ["list", "descri", "mostr", "consult", "get"],
    ["par", "stop", "interromp"],
    ["lig", "start", "inici", "enable", "rod", "run"],
    ["atualiz", "update", "alter", "mud", "modify", "troc"],
    ["etiquet", "tag"],
    ["anex", "attach", "associ"],
    ["desanex", "detach", "disassoci"],
    ["repet", "retry", "tent", "refaz"],
    ["histor", "list"],
    ["cancel", "stop", "abort"],
    ["restaur", "restore", "recuper"],
  ];
  function alternativas(pedaco) {
    // casa o grupo se o que foi digitado é o começo de um radical ("apa" → apag) ou
    // o radical com terminação curta ("apagar", "delete") — "parametro" não é "par".
    for (const grupo of SINONIMOS) if (grupo.some((g) => g.indexOf(pedaco) === 0 || (pedaco.indexOf(g) === 0 && pedaco.length - g.length <= 3))) return grupo.concat([pedaco]);
    return [pedaco];
  }

  const norm = (s) => String(s || "").replace(/<[^>]+>/g, " ").normalize("NFD")
    .replace(/[̀-ͯ]/g, "").toLowerCase();

  function comandosDe(d) {
    const out = [];
    for (const l of d.solucao || []) {
      const m = /^aws\s+(\S+)\s+(\S+)/.exec(String(l));
      if (m && out.indexOf(m[1] + " " + m[2]) < 0) out.push(m[1] + " " + m[2]);
    }
    return out;
  }
  function textoDe(d) {
    return norm([d.titulo, d.descricao, (d.solucao || []).join(" ")].join(" "));
  }
  // Casa pelo COMEÇO de palavra: "tag" acha create-tags, mas não "desmontagem";
  // "descr" acha describe-*; "--query" acha query. Todas as palavras têm de casar.
  const palavrasDe = (texto) => texto.split(/[^a-z0-9]+/).filter(Boolean);
  function casa(texto, palavras) {
    const ws = palavrasDe(texto);
    for (const p of palavras) {
      for (const pedaco of palavrasDe(p)) {
        // palavra curta (até 2 letras) não puxa sinônimo: "ve" não vira "ver"
        const alts = pedaco.length >= 3 ? alternativas(pedaco) : [pedaco];
        if (!ws.some((w) => alts.some((a) => w.indexOf(a) === 0))) return false;
      }
    }
    return true;
  }

  // Comandos do serviço: os do MANUAIS (públicos) + os que as soluções que o
  // navegador já tem usam (cobre trilhas como vpc/ebs, que moram no aws ec2).
  function comandosDaTrilha(trilha, desafios) {
    const mapa = new Map();
    const clis = CLI_DA_TRILHA[trilha] || [[trilha]];
    if (typeof MANUAIS !== "undefined") {
      for (const k of Object.keys(MANUAIS)) {
        const i = k.indexOf(".");
        if (i < 0) continue;
        const svc = k.slice(0, i), sub = k.slice(i + 1);
        if (clis.some(([c, filtro, fora]) => c === svc && (!filtro || filtro.test(sub)) && !(fora && fora.test(sub)))) mapa.set(svc + " " + sub, []);
      }
    }
    for (const d of desafios) for (const c of comandosDe(d)) {
      if (!mapa.has(c)) mapa.set(c, []);
      mapa.get(c).push(d);
    }
    return mapa;
  }
  function porqueDe(cmd) {
    if (typeof PORQUE === "undefined") return "";
    return PORQUE[cmd.replace(" ", ".")] || "";
  }

  function injetarEstilo() {
    if (document.getElementById("btEstilo")) return;
    const st = document.createElement("style");
    st.id = "btEstilo";
    st.textContent = `
      .busca-trilha { padding: 2px 0 6px; }
      .busca-trilha input {
        width: 100%; box-sizing: border-box;
        background: var(--painel-2); border: 1px solid var(--borda); border-radius: 8px;
        color: var(--texto); padding: 7px 10px; font-size: .82rem; font-family: inherit;
      }
      .busca-trilha input:focus { outline: none; border-color: var(--laranja); }
      .busca-trilha input::placeholder { color: var(--texto-fraco); }
      .bt-cmds { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; }
      .bt-cmd {
        display: block; width: 100%; text-align: left; cursor: pointer;
        background: transparent; border: 1px solid var(--borda); border-radius: 7px;
        color: var(--texto); padding: 5px 8px; font-family: inherit; font-size: .74rem; line-height: 1.3;
      }
      .bt-cmd:hover, .bt-cmd:focus-visible { border-color: var(--laranja); outline: none; }
      .bt-cmd code { font-family: var(--fonte-mono); color: var(--laranja); font-size: .76rem; }
      .bt-cmd span { display: block; color: var(--texto-fraco); margin-top: 1px; }
      .bt-resumo { color: var(--texto-fraco); font-size: .72rem; margin: 6px 2px 0; }
      .item-desafio.bt-oculto { display: none !important; }
      .bt-buscando .item-desafio.tl-escondido:not(.bt-oculto) { display: grid !important; }
      .bt-buscando .tl-mais { display: none !important; }
    `;
    document.head.appendChild(st);
  }

  function aplicar(lista, trilha, desafios, itens, caixa) {
    const q = (consultas[trilha] || "").trim();
    const palavras = norm(q).split(/\s+/).filter(Boolean);
    lista.classList.toggle("bt-buscando", palavras.length > 0);
    let visiveis = 0;
    itens.forEach((el, i) => {
      const d = desafios[i];
      const ok = !palavras.length || (d && casa(textoDe(d), palavras));
      el.classList.toggle("bt-oculto", !ok);
      if (ok && palavras.length) visiveis++;
    });

    const cmds = caixa.querySelector(".bt-cmds");
    const resumo = caixa.querySelector(".bt-resumo");
    cmds.innerHTML = "";
    if (!palavras.length) { resumo.textContent = ""; return; }

    const mapa = comandosDaTrilha(trilha, desafios);
    const achados = [];
    for (const [cmd, usam] of mapa) {
      if (casa(norm(cmd + " " + porqueDe(cmd)), palavras)) achados.push([cmd, usam]);
    }
    // o comando cujo NOME casa vem antes do que só casou pelo porquê
    const peso = ([cmd, usam]) => (casa(norm(cmd), palavras) ? 2 : 0) + (usam.length ? 1 : 0);
    achados.sort((a, b) => peso(b) - peso(a));
    for (const [cmd, usam] of achados.slice(0, MAX_COMANDOS)) {
      const bt = document.createElement("button");
      bt.type = "button";
      bt.className = "bt-cmd";
      const alvo = usam.find((d) => typeof desafioLiberado !== "function" || desafioLiberado(d));
      bt.title = alvo ? "Abrir a atividade que ensina este comando" : "Mandar o manual deste comando pro terminal";
      bt.innerHTML = `<code>aws ${cmd}</code>` + (porqueDe(cmd) ? `<span>${escapar(porqueDe(cmd))}</span>` : "");
      bt.addEventListener("click", () => {
        if (alvo && typeof selecionarDesafio === "function") { selecionarDesafio(alvo.id); return; }
        const entrada = document.getElementById("entradaTerminal");
        if (entrada) { entrada.value = "aws " + cmd + " help"; entrada.focus(); }
      });
      cmds.appendChild(bt);
    }
    const n = visiveis;
    resumo.textContent = n
      ? `${n} de ${itens.length} atividade${itens.length > 1 ? "s" : ""}`
      : (achados.length ? "Nenhuma atividade da lista cita isso pelo nome — clique no comando acima pra ver o manual dele." : "Nada encontrado nesta trilha.");
  }
  function escapar(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function montar() {
    if (typeof ui === "undefined" || !ui.servicoAberto || typeof desafiosDoServico !== "function") return;
    const trilha = ui.servicoAberto;
    const bloco = document.querySelector("#sidebar .servico.aberto");
    const lista = bloco && bloco.querySelector(".lista-desafios");
    if (!lista || lista.querySelector(".busca-trilha")) return;
    const desafios = desafiosDoServico(trilha);
    const itens = [...lista.querySelectorAll(".item-desafio")];
    if (desafios.length < MINIMO || itens.length !== desafios.length) return;

    injetarEstilo();
    const caixa = document.createElement("div");
    caixa.className = "busca-trilha";
    caixa.setAttribute("role", "search");
    const nome = ((typeof SERVICOS_META !== "undefined" && SERVICOS_META.find((m) => m.id === trilha)) || {}).nome || trilha;
    caixa.innerHTML = `<input type="search" autocomplete="off" spellcheck="false"
        aria-label="Buscar comando ou atividade na trilha ${escapar(nome)}"
        placeholder="🔎 Buscar nesta trilha (ex.: delete, --query)">
      <div class="bt-cmds"></div>
      <p class="bt-resumo" aria-live="polite"></p>`;
    lista.insertBefore(caixa, lista.firstChild);
    const input = caixa.querySelector("input");
    input.value = consultas[trilha] || "";
    input.addEventListener("input", () => { consultas[trilha] = input.value; aplicar(lista, trilha, desafios, itens, caixa); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && input.value) { e.stopPropagation(); input.value = ""; consultas[trilha] = ""; aplicar(lista, trilha, desafios, itens, caixa); }
    });
    aplicar(lista, trilha, desafios, itens, caixa);
  }

  function iniciar() {
    const original = window.renderSidebar;
    if (typeof original !== "function") return;
    window.renderSidebar = function () {
      // O render recria a lista: se o foco estava na busca, devolve depois.
      const tinhaFoco = document.activeElement && document.activeElement.closest && document.activeElement.closest(".busca-trilha");
      const r = original.apply(this, arguments);
      try { montar(); } catch (e) { /* busca é acessório: a lista segue sem ela */ }
      if (tinhaFoco) { const i = document.querySelector("#sidebar .busca-trilha input"); if (i) { i.focus(); const n = i.value.length; try { i.setSelectionRange(n, n); } catch (e) {} } }
      return r;
    };
    try { montar(); } catch (e) { /* idem */ }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else setTimeout(iniciar, 0);
})();
