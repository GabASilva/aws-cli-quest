"use strict";
// ============================================================
// CLImb — console-aws.js
// Emulação do AWS Management Console (começando pelo S3).
//
// PONTO-CHAVE: lê e escreve o MESMO estado da conta virtual que a CLI
// usa (jogo.conta). Criou um bucket no Console -> aparece no `aws s3 ls`,
// e vice-versa. Cada ação mostra o comando equivalente no CLI e ecoa a
// saída no terminal, conectando os dois mundos (Console <-> CLI).
//
// Arquivo aditivo: carrega DEPOIS de simulador.js/app.js e usa os globais
// já definidos (normalizarConta, dataFormatada, ARQUIVOS_LOCAIS, imprimir,
// salvarJogo, sincronizarNuvem, toast). Não toca na core.
// ============================================================
(function () {
  // Regex de nome de bucket igual à do simulador (mantém as duas em sincronia).
  const NOME_OK = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

  // ---------- Pontes com o resto da app (tudo via typeof pra não quebrar) ----------
  function conta() {
    if (typeof jogo === "undefined" || !jogo) return null;
    if (typeof normalizarConta === "function") jogo.conta = normalizarConta(jogo.conta);
    return jogo.conta;
  }
  function persistir() {
    try {
      if (typeof salvarJogo === "function") salvarJogo();
      if (typeof sincronizarNuvem === "function") sincronizarNuvem();
    } catch (e) {}
  }
  function ecoTerminal(texto, classe) {
    // Mostra a saída no terminal do CLI, como se o comando tivesse sido digitado.
    if (typeof imprimir === "function") imprimir(texto, classe || "");
  }
  function avisar(html, classe) {
    if (typeof toast === "function") toast(html, classe);
  }
  function dataConsole() {
    return typeof dataFormatada === "function" ? dataFormatada() : new Date().toISOString();
  }
  function arquivosLocais() {
    if (typeof ARQUIVOS_LOCAIS !== "undefined") return Object.keys(ARQUIVOS_LOCAIS);
    return ["index.html", "logo.png", "relatorio.csv", "app.zip"];
  }
  function tamanhoLocal(nome) {
    if (typeof ARQUIVOS_LOCAIS !== "undefined" && ARQUIVOS_LOCAIS[nome] != null) return ARQUIVOS_LOCAIS[nome];
    return Math.floor(Math.random() * 4000) + 200;
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function bytesHumano(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  // ---------- Estado de navegação do console ----------
  let view = { tela: "home", bucket: null, prefixo: "" };
  let overlay = null;

  // ---------- Montagem do overlay e do botão no cabeçalho ----------
  function montar() {
    // Botão no cabeçalho, antes do Ranking
    const btn = document.createElement("button");
    btn.className = "botao secundario";
    btn.id = "btnConsole";
    btn.textContent = "🖥️ Console";
    btn.title = "Abrir o Console da AWS (emulado) — espelha a mesma conta da CLI";
    const ranking = document.getElementById("btnRanking");
    if (ranking && ranking.parentNode) ranking.parentNode.insertBefore(btn, ranking);
    else document.querySelector("header").appendChild(btn);
    btn.addEventListener("click", abrir);

    // Overlay
    overlay = document.createElement("div");
    overlay.id = "consoleOverlay";
    overlay.innerHTML = `
      <div class="caws-topo">
        <div class="caws-logo">⚡ CLImb <span>Console</span></div>
        <div class="caws-busca"><input id="cawsBusca" placeholder="Buscar serviços (ex.: S3)" autocomplete="off"></div>
        <div class="caws-topo-dir">
          <span class="caws-regiao" id="cawsRegiao">us-east-1</span>
          <button class="caws-sair" id="cawsSair">✕ Sair do console</button>
        </div>
      </div>
      <div class="caws-corpo" id="cawsCorpo"></div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#cawsSair").addEventListener("click", fechar);
    overlay.querySelector("#cawsBusca").addEventListener("input", (e) => {
      const t = e.target.value.trim().toLowerCase();
      if (/s3|bucket|armazen/.test(t)) { view = { tela: "s3-buckets", bucket: null, prefixo: "" }; render(); }
    });
    // ESC fecha
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.classList.contains("aberto")) fechar();
    });
    // Delegação de eventos do corpo
    overlay.querySelector("#cawsCorpo").addEventListener("click", aoClicar);
    overlay.querySelector("#cawsCorpo").addEventListener("submit", aoSubmeter);
  }

  function abrir() {
    if (!conta()) { avisar("Carregando…"); return; }
    view = { tela: "home", bucket: null, prefixo: "" };
    overlay.classList.add("aberto");
    document.body.classList.add("console-aberto");
    const r = document.getElementById("cawsRegiao");
    if (r && conta()) r.textContent = conta().regiao || "us-east-1";
    render();
  }
  function fechar() {
    overlay.classList.remove("aberto");
    document.body.classList.remove("console-aberto");
    // Re-renderiza a sidebar caso desafios tenham mudado de estado (não muda XP,
    // mas mantém a UI consistente se algo dependeu da conta).
    if (typeof renderSidebar === "function") try { renderSidebar(); } catch (e) {}
  }

  // ---------- Roteador de telas ----------
  function render() {
    const corpo = overlay.querySelector("#cawsCorpo");
    if (view.tela === "home") corpo.innerHTML = telaHome();
    else if (view.tela === "s3-buckets") corpo.innerHTML = telaBuckets();
    else if (view.tela === "s3-objetos") corpo.innerHTML = telaObjetos();
    else corpo.innerHTML = telaHome();
    corpo.scrollTop = 0;
  }

  // ---------- Tela inicial (grade de serviços) ----------
  function telaHome() {
    const c = conta();
    const nBuckets = Object.keys(c.s3.buckets).length;
    const servicos = [
      { id: "s3", icone: "🪣", nome: "S3", desc: "Armazenamento de objetos", ativo: true, extra: `${nBuckets} bucket(s)` },
      { id: "ec2", icone: "🖧", nome: "EC2", desc: "Máquinas virtuais", ativo: false },
      { id: "iam", icone: "🔑", nome: "IAM", desc: "Usuários e permissões", ativo: false },
      { id: "lambda", icone: "λ", nome: "Lambda", desc: "Funções serverless", ativo: false },
      { id: "dynamodb", icone: "🗄️", nome: "DynamoDB", desc: "Banco NoSQL", ativo: false },
    ];
    return `
      <div class="caws-pagina">
        <div class="caws-banner">
          <h1>Console de gerenciamento</h1>
          <p>Você está numa <strong>emulação do Console da AWS</strong>. Tudo o que você faz aqui
          usa a <strong>mesma conta virtual</strong> da linha de comando — crie um bucket aqui e ele
          aparece no <code>aws s3 ls</code>. É o mesmo sistema, duas formas de operar.</p>
        </div>
        <h2 class="caws-secao">Serviços</h2>
        <div class="caws-grade">
          ${servicos.map((s) => `
            <div class="caws-servico ${s.ativo ? "" : "desativado"}" ${s.ativo ? `data-acao="abrir-servico" data-servico="${s.id}"` : ""}>
              <div class="caws-servico-ic">${s.icone}</div>
              <div class="caws-servico-info">
                <strong>${s.nome}</strong>
                <small>${s.desc}</small>
                ${s.ativo ? `<span class="caws-tag">${esc(s.extra || "Disponível")}</span>` : `<span class="caws-tag cinza">em breve</span>`}
              </div>
            </div>
          `).join("")}
        </div>
        <p class="caws-dica-rodape">💡 Mais serviços do Console chegam aqui em breve. Por ora, o S3 está completo:
        criar bucket, enviar arquivos, criar pastas e apagar — tudo refletindo no CLI.</p>
      </div>
    `;
  }

  // ---------- S3: lista de buckets ----------
  function telaBuckets() {
    const c = conta();
    const nomes = Object.keys(c.s3.buckets);
    const linhas = nomes.length
      ? nomes.map((n) => {
          const b = c.s3.buckets[n];
          const nObj = Object.keys(b.objetos || {}).length;
          const publico = b.website ? "Site estático ligado" : "Privado (bloqueado)";
          return `
            <tr>
              <td><a href="#" data-acao="abrir-bucket" data-bucket="${esc(n)}">🪣 ${esc(n)}</a></td>
              <td>${esc(c.regiao || "us-east-1")}</td>
              <td>${esc(b.criadoEm || "—")}</td>
              <td>${nObj} objeto(s)</td>
              <td>${publico}</td>
            </tr>`;
        }).join("")
      : `<tr><td colspan="5" class="caws-vazio">Você ainda não tem buckets. Clique em <strong>Criar bucket</strong> para começar.</td></tr>`;

    return `
      ${migalha([["Console", "home"], ["Amazon S3", "s3-buckets"]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico">
          <h1>🪣 Amazon S3 — Buckets</h1>
          <button class="caws-btn-primario" data-acao="form-criar-bucket">Criar bucket</button>
        </div>
        <table class="caws-tabela">
          <thead><tr><th>Nome</th><th>Região</th><th>Criado em</th><th>Objetos</th><th>Acesso</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
        ${dicaCli("Listar buckets no CLI:", "aws s3 ls")}
      </div>
    `;
  }

  // ---------- S3: criação de bucket (form inline) ----------
  function formCriarBucket() {
    const c = conta();
    return `
      ${migalha([["Console", "home"], ["Amazon S3", "s3-buckets"], ["Criar bucket", null]])}
      <div class="caws-pagina caws-form">
        <h1>Criar bucket</h1>
        <form data-form="criar-bucket">
          <label class="caws-campo">
            <span>Nome do bucket</span>
            <input name="nome" autocomplete="off" spellcheck="false" placeholder="ex.: meu-site-${Math.floor(Math.random()*900+100)}">
            <small>Letras minúsculas, números, ponto e hífen. 3 a 63 caracteres. Único globalmente.</small>
          </label>
          <label class="caws-campo">
            <span>Região</span>
            <input value="${esc(c.regiao || "us-east-1")}" disabled>
          </label>
          <label class="caws-check">
            <input type="checkbox" name="bloqueio" checked>
            <span>Bloquear todo o acesso público <small>(recomendado)</small></span>
          </label>
          <p class="caws-erro" data-erro></p>
          <div class="caws-form-acoes">
            <button type="button" class="caws-btn-secundario" data-acao="ir" data-tela="s3-buckets">Cancelar</button>
            <button type="submit" class="caws-btn-primario">Criar bucket</button>
          </div>
        </form>
        ${dicaCli("Mesma coisa no CLI:", "aws s3 mb s3://NOME-DO-BUCKET")}
      </div>
    `;
  }

  // ---------- S3: objetos dentro de um bucket ----------
  function telaObjetos() {
    const c = conta();
    const b = c.s3.buckets[view.bucket];
    if (!b) { view = { tela: "s3-buckets", bucket: null, prefixo: "" }; return telaBuckets(); }

    const prefixo = view.prefixo || "";
    const pastas = new Set();
    const arquivos = [];
    for (const [chave, obj] of Object.entries(b.objetos)) {
      if (!chave.startsWith(prefixo)) continue;
      const resto = chave.slice(prefixo.length);
      if (resto === "") continue;
      const barra = resto.indexOf("/");
      if (barra >= 0) pastas.add(resto.slice(0, barra + 1));
      else arquivos.push({ chave, nome: resto, tam: obj.tamanho, em: obj.enviadoEm });
    }

    const linhasPastas = [...pastas].sort().map((p) => `
      <tr>
        <td><a href="#" data-acao="entrar-pasta" data-prefixo="${esc(prefixo + p)}">📁 ${esc(p)}</a></td>
        <td>Pasta</td><td>—</td><td>—</td>
      </tr>`).join("");
    const linhasArq = arquivos.sort((a, b) => a.nome.localeCompare(b.nome)).map((a) => `
      <tr>
        <td>📄 ${esc(a.nome)}</td>
        <td>Objeto</td>
        <td>${bytesHumano(a.tam)}</td>
        <td><button class="caws-link-perigo" data-acao="apagar-objeto" data-chave="${esc(a.chave)}">Excluir</button></td>
      </tr>`).join("");
    const corpo = (linhasPastas + linhasArq) ||
      `<tr><td colspan="4" class="caws-vazio">Bucket/pasta vazia. Use <strong>Carregar</strong> para enviar um arquivo.</td></tr>`;

    // Migalha com navegação de prefixo
    const partes = prefixo ? prefixo.replace(/\/$/, "").split("/") : [];
    let acumulado = "";
    const migaPrefixo = partes.map((seg) => {
      acumulado += seg + "/";
      return `<a href="#" data-acao="entrar-pasta" data-prefixo="${esc(acumulado)}">${esc(seg)}</a>`;
    }).join(" / ");

    const cliPrefixo = prefixo ? `/${prefixo}` : "";
    return `
      ${migalha([["Console", "home"], ["Amazon S3", "s3-buckets"], [view.bucket, null]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico">
          <h1>🪣 ${esc(view.bucket)}</h1>
          <div class="caws-acoes-grupo">
            <button class="caws-btn-secundario" data-acao="form-pasta">Criar pasta</button>
            <button class="caws-btn-secundario" data-acao="form-upload">Carregar</button>
            <button class="caws-btn-secundario" data-acao="esvaziar-bucket">Esvaziar</button>
            <button class="caws-btn-perigo" data-acao="apagar-bucket">Excluir bucket</button>
          </div>
        </div>
        <div class="caws-prefixo-nav">
          <a href="#" data-acao="entrar-pasta" data-prefixo="">${esc(view.bucket)}</a>${migaPrefixo ? " / " + migaPrefixo : ""}
        </div>
        <div id="cawsPainelAcao"></div>
        <table class="caws-tabela">
          <thead><tr><th>Nome</th><th>Tipo</th><th>Tamanho</th><th></th></tr></thead>
          <tbody>${corpo}</tbody>
        </table>
        ${dicaCli("Listar o conteúdo no CLI:", `aws s3 ls s3://${view.bucket}${cliPrefixo}`)}
      </div>
    `;
  }

  // Painéis de ação (upload / criar pasta) injetados dentro da tela de objetos
  function painelUpload() {
    const opcoes = arquivosLocais().map((f) => `<option value="${esc(f)}">${esc(f)} (${bytesHumano(tamanhoLocal(f))})</option>`).join("");
    const alvo = `s3://${view.bucket}/${view.prefixo}`;
    return `
      <div class="caws-painel">
        <h3>Carregar arquivo</h3>
        <form data-form="upload">
          <label class="caws-campo">
            <span>Arquivo local (do seu "disco" fictício)</span>
            <select name="arquivo">${opcoes}</select>
            <small>São os mesmos arquivos que o <code>ls</code> e o <code>aws s3 cp</code> enxergam.</small>
          </label>
          <p class="caws-erro" data-erro></p>
          <div class="caws-form-acoes">
            <button type="button" class="caws-btn-secundario" data-acao="fechar-painel">Cancelar</button>
            <button type="submit" class="caws-btn-primario">Carregar</button>
          </div>
        </form>
        ${dicaCli("Mesma coisa no CLI:", `aws s3 cp ARQUIVO ${alvo}`)}
      </div>`;
  }
  function painelPasta() {
    return `
      <div class="caws-painel">
        <h3>Criar pasta</h3>
        <form data-form="pasta">
          <label class="caws-campo">
            <span>Nome da pasta</span>
            <input name="nome" autocomplete="off" placeholder="ex.: imagens">
            <small>No S3 "pastas" são só um prefixo no nome do objeto.</small>
          </label>
          <p class="caws-erro" data-erro></p>
          <div class="caws-form-acoes">
            <button type="button" class="caws-btn-secundario" data-acao="fechar-painel">Cancelar</button>
            <button type="submit" class="caws-btn-primario">Criar pasta</button>
          </div>
        </form>
        ${dicaCli("No CLI você cria a pasta enviando um objeto com ela no caminho:", `aws s3 cp ARQ s3://${view.bucket}/${view.prefixo}NOME-DA-PASTA/`)}
      </div>`;
  }

  // ---------- Componentes reutilizáveis ----------
  function migalha(itens) {
    return `<div class="caws-migalha">` + itens.map(([nome, tela], i) => {
      const ult = i === itens.length - 1;
      const link = tela && !ult ? `<a href="#" data-acao="ir" data-tela="${tela}">${esc(nome)}</a>` : `<span>${esc(nome)}</span>`;
      return link + (ult ? "" : " <em>›</em> ");
    }).join("") + `</div>`;
  }
  function dicaCli(rotulo, comando) {
    return `
      <div class="caws-cli">
        <span class="caws-cli-ic">💻</span>
        <div class="caws-cli-txt">
          <small>${esc(rotulo)}</small>
          <code>${esc(comando)}</code>
        </div>
      </div>`;
  }

  // ---------- Tratamento de cliques (delegação) ----------
  function aoClicar(e) {
    const alvo = e.target.closest("[data-acao]");
    if (!alvo) return;
    e.preventDefault();
    const acao = alvo.dataset.acao;
    const c = conta();

    if (acao === "abrir-servico") {
      if (alvo.dataset.servico === "s3") { view = { tela: "s3-buckets", bucket: null, prefixo: "" }; render(); }
      return;
    }
    if (acao === "ir") {
      view = { tela: alvo.dataset.tela, bucket: null, prefixo: "" }; render(); return;
    }
    if (acao === "abrir-bucket") {
      view = { tela: "s3-objetos", bucket: alvo.dataset.bucket, prefixo: "" }; render(); return;
    }
    if (acao === "entrar-pasta") {
      view.prefixo = alvo.dataset.prefixo || ""; render(); return;
    }
    if (acao === "form-criar-bucket") {
      overlay.querySelector("#cawsCorpo").innerHTML = formCriarBucket(); return;
    }
    if (acao === "form-upload") {
      const p = overlay.querySelector("#cawsPainelAcao"); if (p) p.innerHTML = painelUpload(); return;
    }
    if (acao === "form-pasta") {
      const p = overlay.querySelector("#cawsPainelAcao"); if (p) p.innerHTML = painelPasta(); return;
    }
    if (acao === "fechar-painel") {
      const p = overlay.querySelector("#cawsPainelAcao"); if (p) p.innerHTML = ""; return;
    }
    if (acao === "apagar-objeto") {
      const chave = alvo.dataset.chave;
      if (!confirm(`Excluir o objeto "${chave}"?`)) return;
      const b = c.s3.buckets[view.bucket];
      delete b.objetos[chave];
      ecoTerminal(`delete: s3://${view.bucket}/${chave}`, "ok");
      persistir(); render(); avisar("🗑️ Objeto excluído");
      return;
    }
    if (acao === "esvaziar-bucket") {
      const b = c.s3.buckets[view.bucket];
      const n = Object.keys(b.objetos).length;
      if (!n) { avisar("O bucket já está vazio."); return; }
      if (!confirm(`Esvaziar "${view.bucket}"? Isso apaga ${n} objeto(s).`)) return;
      for (const k of Object.keys(b.objetos)) ecoTerminal(`delete: s3://${view.bucket}/${k}`, "ok");
      b.objetos = {};
      persistir(); view.prefixo = ""; render(); avisar(`🧹 ${n} objeto(s) removidos`);
      return;
    }
    if (acao === "apagar-bucket") {
      const b = c.s3.buckets[view.bucket];
      const n = Object.keys(b.objetos).length;
      if (!confirm(`Excluir o bucket "${view.bucket}"?` + (n ? ` Ele tem ${n} objeto(s), que também serão apagados.` : ""))) return;
      for (const k of Object.keys(b.objetos)) ecoTerminal(`delete: s3://${view.bucket}/${k}`, "ok");
      delete c.s3.buckets[view.bucket];
      ecoTerminal(`remove_bucket: ${view.bucket}`, "ok");
      persistir(); view = { tela: "s3-buckets", bucket: null, prefixo: "" }; render();
      avisar("🗑️ Bucket excluído");
      return;
    }
  }

  // ---------- Tratamento de formulários ----------
  function aoSubmeter(e) {
    e.preventDefault();
    const form = e.target.closest("[data-form]");
    if (!form) return;
    const tipo = form.dataset.form;
    const c = conta();
    const erroEl = form.querySelector("[data-erro]");
    const erro = (msg) => { if (erroEl) erroEl.textContent = msg; };

    if (tipo === "criar-bucket") {
      const nome = (form.nome.value || "").trim();
      if (!NOME_OK.test(nome)) {
        erro("Nome inválido. Use letras minúsculas, números, ponto e hífen (3 a 63 caracteres, começa/termina com letra ou número).");
        return;
      }
      if (c.s3.buckets[nome]) { erro("Você já tem um bucket com esse nome."); return; }
      const bloqueio = form.bloqueio.checked;
      c.s3.buckets[nome] = { criadoEm: dataConsole(), objetos: {}, website: null, politica: null, versionamento: null };
      ecoTerminal(`make_bucket: ${nome}`, "ok");
      persistir();
      view = { tela: "s3-objetos", bucket: nome, prefixo: "" }; render();
      avisar(`✅ Bucket <strong>${esc(nome)}</strong> criado` + (bloqueio ? " (acesso público bloqueado)" : ""));
      return;
    }

    if (tipo === "upload") {
      const arquivo = form.arquivo.value;
      const b = c.s3.buckets[view.bucket];
      const chave = view.prefixo + arquivo.split("/").pop();
      b.objetos[chave] = { tamanho: tamanhoLocal(arquivo), enviadoEm: dataConsole() };
      ecoTerminal(`upload: ./${arquivo} to s3://${view.bucket}/${chave}`, "ok");
      persistir(); render(); avisar(`📤 ${esc(arquivo)} enviado`);
      return;
    }

    if (tipo === "pasta") {
      let nome = (form.nome.value || "").trim().replace(/^\/+|\/+$/g, "");
      if (!nome) { erro("Digite um nome de pasta."); return; }
      if (/[^a-zA-Z0-9._-]/.test(nome)) { erro("Use só letras, números, ponto, hífen ou underline."); return; }
      const b = c.s3.buckets[view.bucket];
      const chave = view.prefixo + nome + "/";
      if (b.objetos[chave]) { erro("Essa pasta já existe."); return; }
      b.objetos[chave] = { tamanho: 0, enviadoEm: dataConsole() };
      ecoTerminal(`make_folder: s3://${view.bucket}/${chave}`, "ok");
      persistir(); render(); avisar(`📁 Pasta ${esc(nome)} criada`);
      return;
    }
  }

  // ---------- Boot ----------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", montar);
  } else {
    montar();
  }

  // Exposto pra outros módulos (ex.: futuros desafios de console) abrirem o console.
  window.abrirConsoleAws = abrir;
})();
