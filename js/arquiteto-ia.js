"use strict";
// ============================================================
// CLImb — arquiteto-ia.js
// "Arquiteto IA" (inspirado no Amazon Bedrock): você descreve em português o
// que quer e ele gera um template de CloudFormation — que dá pra CRIAR de
// verdade no simulador (descreve → IA gera → deploy → recursos aparecem nos
// serviços). É um assistente SIMULADO (sem chamada externa, sem custo): casa
// palavras-chave da descrição com os recursos suportados pelo nosso CFN.
// ADITIVO: botão no rodapé + modal. Usa jogo.conta, executarComandoAws,
// salvarJogo, toast. window.abrirArquitetoIa().
// ============================================================
(function () {
  if (typeof window === "undefined") return;

  function semAcento(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  // Detecta os serviços citados na descrição.
  const REGRAS = [
    { tipo: "s3", chaves: ["site", "estatic", "hospedar", "frontend", "front-end", "html", "pagina", "bucket", "armazen", "arquivo", "upload", "storage", "s3", "imagem", "foto", "midia"] },
    { tipo: "dynamo", chaves: ["banco", "tabela", "dado", "nosql", "dynamo", "database", " db", "cadastro", "registro", "persist"] },
    { tipo: "lambda", chaves: ["funcao", "lambda", "serverless", "backend", "back-end", "api", "processar", "evento", "microservi"] },
    { tipo: "ec2", chaves: ["servidor", "maquina", "vm", "instancia", "ec2", "computa", "processamento", "host", "virtual"] },
    { tipo: "iam", chaves: ["usuario", "permiss", "acesso", "iam", "deploy", "credencial", "role", "papel"] },
  ];

  // Blocos YAML por tipo (indentação de 2 espaços — bate com o parser do CFN).
  function bloco(tipo, suf) {
    if (tipo === "s3") return {
      yaml: "  SiteBucket:\n    Type: AWS::S3::Bucket\n    Properties:\n      BucketName: site-" + suf + "\n",
      expl: "🪣 Bucket S3 <b>site-" + suf + "</b> — guarda arquivos / hospeda site.",
    };
    if (tipo === "dynamo") return {
      yaml: "  AppTable:\n    Type: AWS::DynamoDB::Table\n    Properties:\n      TableName: Dados" + suf + "\n      AttributeDefinitions:\n        - AttributeName: id\n          AttributeType: S\n      KeySchema:\n        - AttributeName: id\n          KeyType: HASH\n      BillingMode: PAY_PER_REQUEST\n",
      expl: "🗄️ Tabela DynamoDB <b>Dados" + suf + "</b> — chave de partição <code>id</code>.",
    };
    if (tipo === "lambda") return {
      yaml: "  AppFunction:\n    Type: AWS::Lambda::Function\n    Properties:\n      FunctionName: api-" + suf + "\n      Runtime: python3.12\n      Handler: index.handler\n      Role: arn:aws:iam::123456789012:role/lambda-exec\n",
      expl: "⚡ Função Lambda <b>api-" + suf + "</b> — Python, serverless.",
    };
    if (tipo === "ec2") return {
      yaml: "  WebServer:\n    Type: AWS::EC2::Instance\n    Properties:\n      InstanceType: t2.micro\n      ImageId: ami-0abcd1234ef567890\n",
      expl: "🖥️ Instância EC2 <b>t2.micro</b> — um servidor.",
    };
    if (tipo === "iam") return {
      yaml: "  DeployUser:\n    Type: AWS::IAM::User\n    Properties:\n      UserName: deploy-" + suf + "\n",
      expl: "🔑 Usuário IAM <b>deploy-" + suf + "</b> — pra deploy/acesso.",
    };
    return null;
  }

  function gerar(descricao) {
    const t = " " + semAcento(descricao) + " ";
    const tipos = [];
    for (const r of REGRAS) if (r.chaves.some((k) => t.includes(k))) tipos.push(r.tipo);
    let nota = "";
    if (!tipos.length) { tipos.push("s3"); nota = "Não identifiquei um serviço específico, então sugeri um bucket S3 de partida. Tente citar: site, banco, função, servidor, usuário…"; }
    const suf = Math.random().toString(36).replace(/[^a-z0-9]/g, "").slice(0, 4) || "abcd";
    const descLimpa = (String(descricao).replace(/[\r\n]+/g, " ").trim().slice(0, 80)) || "Arquitetura gerada pelo Arquiteto IA";
    let yaml = 'AWSTemplateFormatVersion: "2010-09-09"\n' + "Description: " + descLimpa + "\n" + "Resources:\n";
    const expl = [];
    for (const tipo of tipos) { const b = bloco(tipo, suf); if (b) { yaml += b.yaml; expl.push(b.expl); } }
    return { yaml, expl, nota, suf, arquivo: "ia-" + suf + ".yaml", stack: "ia-" + suf };
  }

  // ---------- UI ----------
  let modal = null, ultimo = null;

  const EXEMPLOS = [
    "um site estático com um banco de dados",
    "uma API serverless com banco e bucket de uploads",
    "um servidor web com usuário de deploy",
    "uma loja: front no S3, backend Lambda, dados no DynamoDB",
  ];

  function montar() {
    modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "modalIa";
    document.body.appendChild(modal);
    modal.addEventListener("click", aoClicar);
    modal.addEventListener("submit", (e) => { e.preventDefault(); if (e.target.id === "iaForm") gerarERender(); });

    const footer = document.querySelector("footer");
    if (footer && !document.querySelector("#btnArquitetoIa")) {
      const b = document.createElement("button");
      b.id = "btnArquitetoIa";
      b.className = "botao secundario";
      b.textContent = "🤖 Arquiteto IA";
      const nov = document.querySelector("#btnNovidades");
      footer.insertBefore(b, nov ? nov.nextSibling : footer.firstChild);
      b.addEventListener("click", abrir);
    }
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("aberto")) fechar(); });
  }

  function telaInicial() {
    return `
      <div class="modal-caixa ia-caixa">
        <h2>🤖 Arquiteto IA</h2>
        <p class="ia-intro">Descreva em português o que você quer construir, que eu monto um
        <b>template de CloudFormation</b> pra você — e dá pra criar de verdade aqui no simulador.
        <small>(Assistente simulado, inspirado no Amazon Bedrock — sem custo, roda no navegador.)</small></p>
        <form id="iaForm">
          <textarea id="iaDesc" rows="3" placeholder="ex.: um site estático com um banco de dados e uma função pra processar uploads"></textarea>
          <div class="ia-exemplos">${EXEMPLOS.map((x) => `<button type="button" class="ia-chip" data-ex="${esc(x)}">${esc(x)}</button>`).join("")}</div>
          <div class="modal-acoes ia-acoes-topo">
            <button type="button" class="botao secundario" data-fechar-ia>Fechar</button>
            <button type="submit" class="botao">✨ Gerar arquitetura</button>
          </div>
        </form>
        <div id="iaResultado"></div>
      </div>`;
  }

  function gerarERender() {
    const desc = (modal.querySelector("#iaDesc").value || "").trim();
    if (!desc) { modal.querySelector("#iaResultado").innerHTML = `<p class="ia-erro">Escreva uma descrição primeiro 🙂</p>`; return; }
    ultimo = gerar(desc);
    modal.querySelector("#iaResultado").innerHTML = `
      ${ultimo.nota ? `<p class="ia-nota">💡 ${esc(ultimo.nota)}</p>` : ""}
      <h3 class="ia-h3">O que vou criar</h3>
      <ul class="ia-lista">${ultimo.expl.map((e) => `<li>${e}</li>`).join("")}</ul>
      <h3 class="ia-h3">Template (CloudFormation)</h3>
      <pre class="ia-yaml">${esc(ultimo.yaml)}</pre>
      <div class="ia-acoes">
        <button type="button" class="botao secundario" data-ia-salvar>💾 Salvar como ${esc(ultimo.arquivo)}</button>
        <button type="button" class="botao" data-ia-criar>🚀 Criar stack agora</button>
      </div>
      <div id="iaDeploy"></div>
      ${dicaCli(ultimo)}`;
  }

  function dicaCli(g) {
    return `<p class="ia-cli">💻 No CLI seria: <code>aws cloudformation create-stack --stack-name ${esc(g.stack)} --template-body file://${esc(g.arquivo)}</code></p>`;
  }

  function salvarArquivo() {
    if (!ultimo || typeof jogo === "undefined") return;
    jogo.conta.arquivosSalvos = jogo.conta.arquivosSalvos || {};
    jogo.conta.arquivosSalvos[ultimo.arquivo] = ultimo.yaml;
    if (typeof salvarJogo === "function") salvarJogo();
    if (typeof toast === "function") toast(`💾 Template salvo como <strong>${esc(ultimo.arquivo)}</strong> — use no <code>file://</code>`, "sucesso");
  }

  function criarStack() {
    if (!ultimo || typeof jogo === "undefined" || typeof executarComandoAws !== "function") return;
    salvarArquivo(); // garante que o file:// existe
    const cmd = `aws cloudformation create-stack --stack-name ${ultimo.stack} --template-body file://${ultimo.arquivo}`;
    const r = executarComandoAws(jogo.conta, cmd);
    if (typeof salvarJogo === "function") salvarJogo();
    const alvo = modal.querySelector("#iaDeploy");
    if (r.ok) {
      alvo.innerHTML = `<p class="ia-ok">✅ Stack <b>${esc(ultimo.stack)}</b> criado! Os recursos já existem na conta — abra o <b>Console</b> ou rode <code>aws s3 ls</code> / <code>aws dynamodb list-tables</code> pra ver.</p>`;
      if (typeof toast === "function") toast(`🚀 Stack <strong>${esc(ultimo.stack)}</strong> criado pela IA!`, "sucesso");
      if (typeof imprimir === "function") imprimir(cmd + "\n" + r.saida, "ok");
    } else {
      alvo.innerHTML = `<p class="ia-erro">${esc(r.saida)}</p>`;
    }
  }

  function aoClicar(e) {
    if (e.target === modal || e.target.closest("[data-fechar-ia]")) { fechar(); return; }
    const ex = e.target.closest("[data-ex]");
    if (ex) { modal.querySelector("#iaDesc").value = ex.getAttribute("data-ex"); return; }
    if (e.target.closest("[data-ia-salvar]")) { salvarArquivo(); return; }
    if (e.target.closest("[data-ia-criar]")) { criarStack(); return; }
  }

  function abrir() {
    if (typeof jogo === "undefined") { if (typeof toast === "function") toast("Carregando…"); return; }
    ultimo = null;
    modal.innerHTML = telaInicial();
    modal.classList.add("aberto");
  }
  function fechar() { modal.classList.remove("aberto"); }

  document.addEventListener("DOMContentLoaded", montar);
  window.abrirArquitetoIa = abrir;
})();
