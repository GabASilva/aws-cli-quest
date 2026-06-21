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
    else if (view.tela === "ec2-instancias") corpo.innerHTML = telaInstancias();
    else if (view.tela === "ec2-launch") corpo.innerHTML = formLaunch();
    else if (view.tela === "iam-usuarios") corpo.innerHTML = telaIamUsuarios();
    else if (view.tela === "iam-user") corpo.innerHTML = telaIamUserDetail();
    else corpo.innerHTML = telaHome();
    corpo.scrollTop = 0;
  }

  // ---------- Tela inicial (grade de serviços) ----------
  function telaHome() {
    const c = conta();
    const nBuckets = Object.keys(c.s3.buckets).length;
    const nInst = Object.values(c.ec2.instancias).filter((i) => i.estado !== "terminated").length;
    const nUsers = Object.keys(c.iam.usuarios).length;
    const servicos = [
      { id: "s3", icone: "🪣", nome: "S3", desc: "Armazenamento de objetos", ativo: true, extra: `${nBuckets} bucket(s)` },
      { id: "ec2", icone: "🖥️", nome: "EC2", desc: "Máquinas virtuais", ativo: true, extra: `${nInst} instância(s)` },
      { id: "iam", icone: "🔑", nome: "IAM", desc: "Usuários e permissões", ativo: true, extra: `${nUsers} usuário(s)` },
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
            <div class="caws-servico ${s.ativo ? "" : "desativado"}" ${s.ativo ? `data-acao="abrir-servico" data-servico="${s.id}"` : `data-acao="ver-roadmap"`}>
              <div class="caws-servico-ic">${s.icone}</div>
              <div class="caws-servico-info">
                <strong>${s.nome}</strong>
                <small>${s.desc}</small>
                ${s.ativo ? `<span class="caws-tag">${esc(s.extra || "Disponível")}</span>` : `<span class="caws-tag cinza">em breve</span>`}
              </div>
            </div>
          `).join("")}
        </div>
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

  // ---------- EC2: badge de estado ----------
  function badgeEstado(estado) {
    const cls = {
      running: "ok", pending: "pend", stopping: "pend", "shutting-down": "pend",
      stopped: "off", terminated: "fim",
    }[estado] || "off";
    return `<span class="caws-estado ${cls}">● ${esc(estado)}</span>`;
  }

  // ---------- EC2: lista de instâncias ----------
  function telaInstancias() {
    const c = conta();
    const ids = Object.keys(c.ec2.instancias);
    const linhas = ids.length
      ? ids.map((id) => {
          const i = c.ec2.instancias[id];
          const acoes = [];
          if (i.estado === "running") acoes.push(`<button class="caws-link" data-acao="ec2-stop" data-id="${esc(id)}">Parar</button>`);
          if (i.estado === "stopped") acoes.push(`<button class="caws-link" data-acao="ec2-start" data-id="${esc(id)}">Iniciar</button>`);
          if (i.estado !== "terminated") acoes.push(`<button class="caws-link-perigo" data-acao="ec2-terminate" data-id="${esc(id)}">Encerrar</button>`);
          return `
            <tr>
              <td>${esc(id)}</td>
              <td>${badgeEstado(i.estado)}</td>
              <td>${esc(i.tipo)}</td>
              <td>${esc(i.imagem)}</td>
              <td>${esc(i.chave || "—")}</td>
              <td>${acoes.join(" ") || "—"}</td>
            </tr>`;
        }).join("")
      : `<tr><td colspan="6" class="caws-vazio">Nenhuma instância. Clique em <strong>Executar instância</strong> para criar a primeira.</td></tr>`;

    return `
      ${migalha([["Console", "home"], ["EC2", "ec2-instancias"]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico">
          <h1>🖥️ EC2 — Instâncias</h1>
          <button class="caws-btn-primario" data-acao="ec2-form-launch">Executar instância</button>
        </div>
        <table class="caws-tabela">
          <thead><tr><th>ID da instância</th><th>Estado</th><th>Tipo</th><th>AMI</th><th>Par de chaves</th><th></th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
        ${dicaCli("Listar instâncias no CLI:", "aws ec2 describe-instances")}
      </div>
    `;
  }

  // ---------- EC2: executar instância (wizard) ----------
  function formLaunch() {
    const c = conta();
    const tipos = (typeof TIPOS_INSTANCIA !== "undefined" ? TIPOS_INSTANCIA : ["t2.micro", "t3.small"]);
    const optTipos = tipos.map((t) => `<option value="${esc(t)}"${t === "t2.micro" ? " selected" : ""}>${esc(t)}</option>`).join("");
    const chaves = Object.keys(c.ec2.keyPairs || {});
    const optChaves = `<option value="">(nenhuma)</option>` + chaves.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join("");
    return `
      ${migalha([["Console", "home"], ["EC2", "ec2-instancias"], ["Executar instância", null]])}
      <div class="caws-pagina caws-form">
        <h1>Executar instância</h1>
        <form data-form="launch">
          <label class="caws-campo">
            <span>Imagem (AMI)</span>
            <input name="ami" value="ami-0abcd1234ef567890" autocomplete="off" spellcheck="false">
            <small>O ID da imagem que vira o disco da máquina. Começa com <code>ami-</code>.</small>
          </label>
          <label class="caws-campo">
            <span>Tipo da instância</span>
            <select name="tipo">${optTipos}</select>
            <small>Define CPU e memória. <code>t2.micro</code> é o do nível gratuito.</small>
          </label>
          <label class="caws-campo">
            <span>Par de chaves (opcional)</span>
            <select name="chave">${optChaves}</select>
            <small>É a chave de SSH pra acessar a máquina. Crie uma na CLI com <code>aws ec2 create-key-pair</code>.</small>
          </label>
          <label class="caws-campo">
            <span>Quantidade</span>
            <input name="count" type="number" min="1" max="10" value="1">
          </label>
          <p class="caws-erro" data-erro></p>
          <div class="caws-form-acoes">
            <button type="button" class="caws-btn-secundario" data-acao="ir" data-tela="ec2-instancias">Cancelar</button>
            <button type="submit" class="caws-btn-primario">Executar instância</button>
          </div>
        </form>
        ${dicaCli("Mesma coisa no CLI:", "aws ec2 run-instances --image-id AMI --instance-type TIPO [--key-name CHAVE] [--count N]")}
      </div>
    `;
  }

  // ---------- IAM: lista de usuários ----------
  function telaIamUsuarios() {
    const c = conta();
    const nomes = Object.keys(c.iam.usuarios);
    const linhas = nomes.length
      ? nomes.map((n) => {
          const u = c.iam.usuarios[n];
          const grupos = Object.values(c.iam.grupos).filter((g) => g.membros.includes(n)).length;
          return `
            <tr>
              <td><a href="#" data-acao="iam-abrir-user" data-user="${esc(n)}">👤 ${esc(n)}</a></td>
              <td>${esc(u.criadoEm || "—")}</td>
              <td>${(u.politicas || []).length} política(s)</td>
              <td>${grupos} grupo(s)</td>
              <td><button class="caws-link-perigo" data-acao="iam-delete-user" data-user="${esc(n)}">Excluir</button></td>
            </tr>`;
        }).join("")
      : `<tr><td colspan="5" class="caws-vazio">Nenhum usuário. Clique em <strong>Criar usuário</strong> para começar.</td></tr>`;

    return `
      ${migalha([["Console", "home"], ["IAM", "iam-usuarios"]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico">
          <h1>🔑 IAM — Usuários</h1>
          <button class="caws-btn-primario" data-acao="iam-form-criar-user">Criar usuário</button>
        </div>
        <table class="caws-tabela">
          <thead><tr><th>Nome</th><th>Criado em</th><th>Políticas</th><th>Grupos</th><th></th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
        ${dicaCli("Listar usuários no CLI:", "aws iam list-users")}
      </div>
    `;
  }

  // ---------- IAM: criar usuário ----------
  function formIamUser() {
    return `
      ${migalha([["Console", "home"], ["IAM", "iam-usuarios"], ["Criar usuário", null]])}
      <div class="caws-pagina caws-form">
        <h1>Criar usuário</h1>
        <form data-form="iam-criar-user">
          <label class="caws-campo">
            <span>Nome do usuário</span>
            <input name="nome" autocomplete="off" spellcheck="false" placeholder="ex.: ana">
            <small>Letras, números e os símbolos <code>+=,.@_-</code>.</small>
          </label>
          <p class="caws-erro" data-erro></p>
          <div class="caws-form-acoes">
            <button type="button" class="caws-btn-secundario" data-acao="ir" data-tela="iam-usuarios">Cancelar</button>
            <button type="submit" class="caws-btn-primario">Criar usuário</button>
          </div>
        </form>
        ${dicaCli("Mesma coisa no CLI:", "aws iam create-user --user-name NOME")}
      </div>
    `;
  }

  // ---------- IAM: detalhe do usuário (políticas + grupos) ----------
  function telaIamUserDetail() {
    const c = conta();
    const n = view.usuario;
    const u = c.iam.usuarios[n];
    if (!u) { view = { tela: "iam-usuarios" }; return telaIamUsuarios(); }
    const pols = u.politicas || [];
    const polRows = pols.length
      ? pols.map((arn) => `<tr><td>📜 ${esc(arn.split("/").pop())}</td><td><code>${esc(arn)}</code></td><td><button class="caws-link-perigo" data-acao="iam-detach-policy" data-user="${esc(n)}" data-arn="${esc(arn)}">Desanexar</button></td></tr>`).join("")
      : `<tr><td colspan="3" class="caws-vazio">Nenhuma política anexada.</td></tr>`;
    const grupos = Object.keys(c.iam.grupos).filter((g) => c.iam.grupos[g].membros.includes(n));
    const grpRows = grupos.length
      ? grupos.map((g) => `<tr><td>👥 ${esc(g)}</td><td><button class="caws-link-perigo" data-acao="iam-remove-group" data-user="${esc(n)}" data-group="${esc(g)}">Remover</button></td></tr>`).join("")
      : `<tr><td colspan="2" class="caws-vazio">Não está em nenhum grupo.</td></tr>`;
    const polOpts = (typeof POLITICAS_AWS !== "undefined" ? POLITICAS_AWS : []).map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
    const grpOpts = Object.keys(c.iam.grupos).map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join("");

    return `
      ${migalha([["Console", "home"], ["IAM", "iam-usuarios"], [n, null]])}
      <div class="caws-pagina">
        <div class="caws-cab-servico">
          <h1>👤 ${esc(n)}</h1>
          <button class="caws-btn-perigo" data-acao="iam-delete-user" data-user="${esc(n)}">Excluir usuário</button>
        </div>
        <p class="caws-sub">ARN: <code>arn:aws:iam::${esc(c.contaId)}:user/${esc(n)}</code> · UserId: <code>${esc(u.userId || "—")}</code></p>

        <h2 class="caws-secao">Políticas anexadas</h2>
        <form data-form="iam-attach" class="caws-inline-form">
          <select name="politica">${polOpts}</select>
          <button type="submit" class="caws-btn-secundario">Anexar política</button>
        </form>
        <table class="caws-tabela">
          <thead><tr><th>Política</th><th>ARN</th><th></th></tr></thead>
          <tbody>${polRows}</tbody>
        </table>

        <h2 class="caws-secao">Grupos</h2>
        ${grpOpts
          ? `<form data-form="iam-addgroup" class="caws-inline-form"><select name="grupo">${grpOpts}</select><button type="submit" class="caws-btn-secundario">Adicionar a grupo</button></form>`
          : `<p class="caws-sub">Nenhum grupo existe ainda. Crie um no CLI: <code>aws iam create-group --group-name NOME</code>.</p>`}
        <table class="caws-tabela">
          <thead><tr><th>Grupo</th><th></th></tr></thead>
          <tbody>${grpRows}</tbody>
        </table>

        ${dicaCli("Anexar política no CLI:", `aws iam attach-user-policy --user-name ${n} --policy-arn arn:aws:iam::aws:policy/NOME`)}
      </div>
    `;
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
      else if (alvo.dataset.servico === "ec2") { view = { tela: "ec2-instancias", bucket: null, prefixo: "" }; render(); }
      else if (alvo.dataset.servico === "iam") { view = { tela: "iam-usuarios" }; render(); }
      return;
    }
    if (acao === "ver-roadmap") {
      // serviço ainda não disponível -> manda pro roadmap centralizado (changelog)
      if (typeof abrirChangelog === "function") abrirChangelog("breve");
      else avisar("Esse serviço chega em breve no Console. 🚧");
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

    // ----- EC2 -----
    if (acao === "ec2-form-launch") {
      overlay.querySelector("#cawsCorpo").innerHTML = formLaunch(); return;
    }
    if (acao === "ec2-stop") {
      const i = c.ec2.instancias[alvo.dataset.id];
      if (i && i.estado === "running") { i.estado = "stopped"; ecoTerminal(`(stop-instances) ${i.id}: running → stopping`, "ok"); persistir(); render(); avisar(`⏸️ Instância ${esc(i.id)} parada`); }
      return;
    }
    if (acao === "ec2-start") {
      const i = c.ec2.instancias[alvo.dataset.id];
      if (i && i.estado === "stopped") { i.estado = "running"; ecoTerminal(`(start-instances) ${i.id}: stopped → pending`, "ok"); persistir(); render(); avisar(`▶️ Instância ${esc(i.id)} iniciada`); }
      return;
    }
    if (acao === "ec2-terminate") {
      const i = c.ec2.instancias[alvo.dataset.id];
      if (!i || i.estado === "terminated") return;
      if (!confirm(`Encerrar a instância ${i.id}? Encerrar é definitivo (diferente de parar).`)) return;
      i.estado = "terminated";
      ecoTerminal(`(terminate-instances) ${i.id}: shutting-down`, "ok");
      persistir(); render(); avisar(`🗑️ Instância ${esc(i.id)} encerrada`);
      return;
    }

    // ----- IAM -----
    if (acao === "iam-form-criar-user") {
      overlay.querySelector("#cawsCorpo").innerHTML = formIamUser(); return;
    }
    if (acao === "iam-abrir-user") {
      view = { tela: "iam-user", usuario: alvo.dataset.user }; render(); return;
    }
    if (acao === "iam-delete-user") {
      const n = alvo.dataset.user;
      if (!c.iam.usuarios[n]) return;
      if (!confirm(`Excluir o usuário "${n}"?`)) return;
      delete c.iam.usuarios[n];
      for (const g of Object.values(c.iam.grupos)) g.membros = g.membros.filter((m) => m !== n);
      ecoTerminal(`(delete-user) usuário ${n} removido`, "ok");
      persistir(); view = { tela: "iam-usuarios" }; render(); avisar(`🗑️ Usuário ${esc(n)} excluído`);
      return;
    }
    if (acao === "iam-detach-policy") {
      const u = c.iam.usuarios[alvo.dataset.user];
      if (!u) return;
      u.politicas = (u.politicas || []).filter((a) => a !== alvo.dataset.arn);
      ecoTerminal(`(detach-user-policy) ${alvo.dataset.arn.split("/").pop()} desanexada de ${alvo.dataset.user}`, "ok");
      persistir(); render(); avisar("Política desanexada");
      return;
    }
    if (acao === "iam-remove-group") {
      const g = c.iam.grupos[alvo.dataset.group];
      if (!g) return;
      g.membros = g.membros.filter((m) => m !== alvo.dataset.user);
      ecoTerminal(`(remove-user-from-group) ${alvo.dataset.user} saiu de ${alvo.dataset.group}`, "ok");
      persistir(); render(); avisar("Removido do grupo");
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

    if (tipo === "launch") {
      const ami = (form.ami.value || "").trim();
      const tipoInst = form.tipo.value;
      const chave = form.chave.value || null;
      const count = parseInt(form.count.value, 10) || 1;
      if (!/^ami-[0-9a-f]+$/i.test(ami)) { erro("AMI inválida. Comece com 'ami-' seguido de hexadecimal (ex.: ami-0abcd1234ef567890)."); return; }
      if (!(count >= 1 && count <= 10)) { erro("A quantidade precisa ser de 1 a 10."); return; }
      const ids = [];
      for (let k = 0; k < count; k++) {
        const id = "i-0" + (typeof hexAleatorio === "function" ? hexAleatorio(16) : Date.now().toString(16));
        c.ec2.instancias[id] = { id, imagem: ami, tipo: tipoInst, chave, sgs: [], estado: "running", criadaEm: (typeof agoraIso === "function" ? agoraIso() : new Date().toISOString()) };
        ids.push(id);
      }
      ecoTerminal(`(run-instances) ${count} instância(s) ${tipoInst} iniciada(s): ${ids.join(", ")}`, "ok");
      persistir();
      view = { tela: "ec2-instancias", bucket: null, prefixo: "" }; render();
      avisar(`✅ ${count} instância(s) <strong>${esc(tipoInst)}</strong> executada(s)`);
      return;
    }

    if (tipo === "iam-criar-user") {
      const nome = (form.nome.value || "").trim();
      if (!/^[\w+=,.@-]{1,64}$/.test(nome)) { erro("Nome inválido. Use letras, números e os símbolos +=,.@_- (até 64 caracteres)."); return; }
      if (c.iam.usuarios[nome]) { erro("Já existe um usuário com esse nome."); return; }
      const userId = "AIDA" + (typeof hexAleatorio === "function" ? hexAleatorio(17).toUpperCase() : Date.now().toString(16).toUpperCase());
      c.iam.usuarios[nome] = { criadoEm: dataConsole(), politicas: [], userId };
      ecoTerminal(`(create-user) usuário ${nome} criado`, "ok");
      persistir();
      view = { tela: "iam-user", usuario: nome }; render();
      avisar(`✅ Usuário <strong>${esc(nome)}</strong> criado`);
      return;
    }

    if (tipo === "iam-attach") {
      const u = c.iam.usuarios[view.usuario];
      if (!u) return;
      const nomePol = form.politica.value;
      const arn = `arn:aws:iam::aws:policy/${nomePol}`;
      u.politicas = u.politicas || [];
      if (u.politicas.includes(arn)) { avisar("Essa política já está anexada."); return; }
      u.politicas.push(arn);
      ecoTerminal(`(attach-user-policy) ${nomePol} anexada a ${view.usuario}`, "ok");
      persistir(); render(); avisar(`📜 Política ${esc(nomePol)} anexada`);
      return;
    }

    if (tipo === "iam-addgroup") {
      const grupo = c.iam.grupos[form.grupo.value];
      if (!grupo) return;
      if (!grupo.membros.includes(view.usuario)) grupo.membros.push(view.usuario);
      ecoTerminal(`(add-user-to-group) ${view.usuario} entrou em ${form.grupo.value}`, "ok");
      persistir(); render(); avisar(`👥 Adicionado ao grupo ${esc(form.grupo.value)}`);
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
