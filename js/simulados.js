"use strict";
// ============================================================
// CLImb — simulados.js  (motor dos simulados de certificação)
// Aba "🎓 Simulados": provas no estilo das certificações AWS, separadas por
// certificação. Começa pela AWS Certified Cloud Practitioner (CLF-C02).
//
// As questões ficam em arquivos próprios (simulados-clf-*.js) que empilham em
// window.SIMULADOS_CLF. Este arquivo só cuida da UI/lógica:
//  - sorteia N questões aleatórias do banco (padrão 60);
//  - prova navegável (uma por vez) com paleta numerada e "marcar p/ revisar";
//  - corrige, mostra nota, aprovado/reprovado (corte 70%);
//  - revisão questão a questão: o que você marcou x o gabarito + explicação;
//  - análise dos erros por domínio oficial do exame, com o que reforçar.
//
// ADITIVO: não toca o core. Carrega DEPOIS dos bancos no index.html.
// ============================================================
(function () {
  if (typeof window === "undefined") return;

  // ---------- Catálogo de certificações ----------
  // `banco` aponta pro array global preenchido pelos arquivos de questões.
  const CERTS = {
    clf: {
      id: "clf",
      codigo: "CLF-C02",
      nome: "AWS Certified Cloud Practitioner",
      icone: "☁️",
      nivel: "Fundacional",
      desc: "A porta de entrada da AWS. Conceitos de nuvem, segurança, serviços principais e cobrança.",
      qtdProva: 60, // questões por simulado (o exame real tem 65)
      corte: 70, // % pra passar (o real é ~700/1000)
      banco: function () { return window.SIMULADOS_CLF || []; },
      dominios: {
        conceitos: {
          nome: "Conceitos de Nuvem",
          peso: 24,
          dica: "Vantagens da nuvem (CapEx→OpEx, elasticidade, economia de escala, agilidade, alcance global), o Well-Architected Framework e o Cloud Adoption Framework (CAF).",
          reforco: "Revise os 6 pilares do Well-Architected, as 6 vantagens da nuvem e as perspectivas do CAF.",
        },
        seguranca: {
          nome: "Segurança e Conformidade",
          peso: 30,
          dica: "Modelo de responsabilidade compartilhada, IAM (usuários, grupos, funções, MFA, privilégio mínimo), e serviços de segurança (WAF, Shield, GuardDuty, Inspector, KMS, Config, CloudTrail).",
          reforco: "Pratique a trilha de IAM no CLImb e memorize quem é responsável pelo quê no modelo compartilhado.",
          trilha: "iam",
        },
        tecnologia: {
          nome: "Tecnologia e Serviços",
          peso: 34,
          dica: "Computação (EC2, Lambda, Beanstalk), rede (VPC, gateways, Route 53, CloudFront), bancos (RDS, Aurora, DynamoDB) e armazenamento (S3, EBS).",
          reforco: "Faça as trilhas de EC2, S3, VPC, RDS e DynamoDB no CLImb — é onde mais cai prova.",
          trilha: "ec2",
        },
        cobranca: {
          nome: "Cobrança, Preços e Suporte",
          peso: 12,
          dica: "Modelos de preço do EC2 (Sob Demanda, Reservadas, Spot, Savings Plans), ferramentas de custo (Pricing Calculator, Budgets, Cost Explorer) e planos de suporte.",
          reforco: "Decore quando usar cada modelo de preço e a diferença entre Budgets (avisar) e Cost Explorer (analisar).",
        },
      },
    },
  };

  const CHAVE_HIST = "climb.simulados.hist"; // histórico de tentativas por cert

  // ---------- Estado da prova em andamento ----------
  let cert = null; // certificação escolhida
  let questoes = []; // questões sorteadas (já com opções embaralhadas)
  let respostas = []; // resposta do usuário por questão (array de índices)
  let marcadas = []; // "marcar para revisar"
  let atual = 0; // índice da questão atual
  let view = "home"; // home | prova | resultado
  let ultimoResultado = null;
  let overlay = null;

  // ---------- Utilidades ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function embaralhar(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // Embaralha as opções de uma questão e recalcula os índices corretos.
  function prepararQuestao(q) {
    const ordem = embaralhar(q.o.map((_, i) => i));
    const opcoes = ordem.map((i) => q.o[i]);
    const corretas = q.c.map((ci) => ordem.indexOf(ci)).sort((a, b) => a - b);
    return {
      id: q.id, d: q.d, multi: !!q.multi || q.c.length > 1,
      q: q.q, o: opcoes, c: corretas, e: q.e || "",
    };
  }
  // Fonte oficial da explicação de uma questão (link no gabarito).
  function fonteDe(q) {
    const F = window.SIMULADOS_FONTES || {};
    const P = window.SIMULADOS_FONTE_POR_ID || {};
    const FB = window.SIMULADOS_FONTE_FALLBACK || {};
    const chave = P[q.id] || FB[q.d];
    return chave && F[chave] ? F[chave] : null;
  }
  function lerHist() {
    try { return JSON.parse(localStorage.getItem(CHAVE_HIST) || "{}"); } catch (e) { return {}; }
  }
  function salvarHist(h) {
    try { localStorage.setItem(CHAVE_HIST, JSON.stringify(h)); } catch (e) {}
  }

  // ---------- Montagem do overlay + botão no cabeçalho ----------
  function montar() {
    const btn = document.createElement("button");
    btn.className = "botao secundario";
    btn.id = "btnSimulados";
    btn.textContent = "🎓 Simulados";
    btn.title = "Provas no estilo das certificações AWS (começa pelo Cloud Practitioner)";
    const consoleBtn = document.getElementById("btnConsole");
    const ranking = document.getElementById("btnRanking");
    const ref = consoleBtn || ranking;
    if (ref && ref.parentNode) ref.parentNode.insertBefore(btn, ref);
    else document.querySelector("header").appendChild(btn);
    btn.addEventListener("click", abrir);

    overlay = document.createElement("div");
    overlay.id = "simOverlay";
    overlay.innerHTML = `
      <div class="sim-topo">
        <div class="sim-logo">⚡ CLImb <span>Simulados</span></div>
        <div class="sim-topo-dir">
          <span class="sim-info" id="simInfoTopo"></span>
          <button class="sim-sair" id="simSair">✕ Sair</button>
        </div>
      </div>
      <div class="sim-corpo" id="simCorpo"></div>`;
    document.body.appendChild(overlay);

    overlay.querySelector("#simSair").addEventListener("click", aoSair);
    overlay.querySelector("#simCorpo").addEventListener("click", aoClicar);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.classList.contains("aberto")) aoSair();
    });
    injetarEstilo();
  }

  function abrir() {
    view = "home";
    overlay.classList.add("aberto");
    document.body.classList.add("sim-aberto");
    render();
  }
  function fechar() {
    overlay.classList.remove("aberto");
    document.body.classList.remove("sim-aberto");
  }
  // Sair com confirmação se há prova em andamento.
  function aoSair() {
    if (view === "prova") {
      const respondidas = respostas.filter((r) => r && r.length).length;
      if (respondidas > 0 && respondidas < questoes.length) {
        if (!confirm("Você está no meio de um simulado. Sair vai descartar este teste. Quer mesmo sair?")) return;
      }
    }
    fechar();
  }

  // ---------- Roteador ----------
  function render() {
    const corpo = overlay.querySelector("#simCorpo");
    const info = overlay.querySelector("#simInfoTopo");
    if (view === "home") { corpo.innerHTML = telaHome(); info.textContent = ""; }
    else if (view === "prova") { corpo.innerHTML = telaProva(); info.textContent = `${cert.codigo} · ${atual + 1}/${questoes.length}`; }
    else if (view === "resultado") { corpo.innerHTML = telaResultado(); info.textContent = `${cert.codigo} · resultado`; }
    corpo.scrollTop = 0;
  }

  // ---------- Tela inicial: escolher certificação ----------
  function telaHome() {
    const hist = lerHist();
    const cards = Object.values(CERTS).map((c) => {
      const total = c.banco().length;
      const ativo = total > 0;
      const h = hist[c.id];
      const melhor = h && typeof h.melhor === "number" ? `Melhor: <b>${h.melhor}%</b> · ${h.tentativas} tentativa(s)` : "Você ainda não fez este.";
      return `
        <div class="sim-cert ${ativo ? "" : "off"}" ${ativo ? `data-acao="cert" data-cert="${c.id}"` : ""}>
          <div class="sim-cert-ic">${c.icone}</div>
          <div class="sim-cert-info">
            <strong>${esc(c.nome)}</strong>
            <span class="sim-cert-cod">${c.codigo} · ${c.nivel}</span>
            <p>${esc(c.desc)}</p>
            ${ativo
              ? `<span class="sim-tag">${total} questões no banco</span><span class="sim-hist">${melhor}</span>`
              : `<span class="sim-tag cinza">em breve</span>`}
          </div>
        </div>`;
    }).join("");

    // Certificações que ainda vão entrar (placeholders informativos)
    const futuras = [
      { ic: "🏗️", nome: "Solutions Architect Associate", cod: "SAA-C03" },
      { ic: "🛠️", nome: "SysOps Administrator Associate", cod: "SOA-C02" },
      { ic: "💻", nome: "Developer Associate", cod: "DVA-C02" },
    ].map((f) => `
      <div class="sim-cert off">
        <div class="sim-cert-ic">${f.ic}</div>
        <div class="sim-cert-info">
          <strong>${esc(f.nome)}</strong>
          <span class="sim-cert-cod">${f.cod}</span>
          <span class="sim-tag cinza">em breve</span>
        </div>
      </div>`).join("");

    return `
      <div class="sim-pagina">
        <div class="sim-banner">
          <h1>🎓 Simulados de certificação</h1>
          <p>Provas no estilo das certificações da AWS, separadas por certificação. Cada simulado
          sorteia questões aleatórias do banco — então cada tentativa é diferente. No fim, você vê
          o gabarito comentado e uma <strong>análise dos erros por domínio</strong> pra saber o que reforçar.</p>
        </div>
        <h2 class="sim-secao">Disponível</h2>
        <div class="sim-grade">${cards}</div>
        <h2 class="sim-secao">Próximas certificações</h2>
        <div class="sim-grade">${futuras}</div>
      </div>`;
  }

  // ---------- Configurar e iniciar a prova ----------
  function abrirCert(id) {
    cert = CERTS[id];
    if (!cert) return;
    const total = cert.banco().length;
    const qtd = Math.min(cert.qtdProva, total);
    iniciarProva(qtd);
  }
  function iniciarProva(qtd) {
    const banco = cert.banco();
    questoes = embaralhar(banco).slice(0, qtd).map(prepararQuestao);
    respostas = questoes.map(() => []);
    marcadas = questoes.map(() => false);
    atual = 0;
    view = "prova";
    render();
  }

  // ---------- Tela da prova (uma questão por vez) ----------
  function telaProva() {
    const q = questoes[atual];
    const sel = respostas[atual] || [];
    const tipo = q.multi ? `<span class="sim-multi">Escolha ${q.c.length}</span>` : "";
    const opcoes = q.o.map((op, i) => {
      const marcado = sel.indexOf(i) >= 0;
      const letra = String.fromCharCode(65 + i);
      return `
        <button class="sim-opcao ${marcado ? "sel" : ""}" data-acao="opcao" data-i="${i}">
          <span class="sim-letra">${letra}</span>
          <span class="sim-op-txt">${esc(op)}</span>
        </button>`;
    }).join("");

    // paleta numerada
    const paleta = questoes.map((_, i) => {
      const respondida = respostas[i] && respostas[i].length;
      const cls = [i === atual ? "atual" : "", respondida ? "feita" : "", marcadas[i] ? "marc" : ""].join(" ");
      return `<button class="sim-pal ${cls}" data-acao="ir" data-i="${i}">${i + 1}</button>`;
    }).join("");

    const respondidas = respostas.filter((r) => r && r.length).length;

    return `
      <div class="sim-prova">
        <div class="sim-q">
          <div class="sim-q-cab">
            <span class="sim-q-num">Questão ${atual + 1} de ${questoes.length}</span>
            ${tipo}
            <button class="sim-marcar ${marcadas[atual] ? "on" : ""}" data-acao="marcar">${marcadas[atual] ? "★ Marcada" : "☆ Marcar p/ revisar"}</button>
          </div>
          <p class="sim-enunciado">${esc(q.q)}</p>
          <div class="sim-opcoes">${opcoes}</div>
          <div class="sim-nav">
            <button class="botao secundario" data-acao="anterior" ${atual === 0 ? "disabled" : ""}>← Anterior</button>
            ${atual < questoes.length - 1
              ? `<button class="botao" data-acao="proxima">Próxima →</button>`
              : `<button class="botao sim-finalizar" data-acao="finalizar">Finalizar prova</button>`}
          </div>
        </div>
        <aside class="sim-lado">
          <div class="sim-progresso-box">
            <strong>${respondidas}/${questoes.length}</strong> respondidas
          </div>
          <div class="sim-paleta">${paleta}</div>
          <button class="botao sim-finalizar-2" data-acao="finalizar">Finalizar prova</button>
          <p class="sim-legenda"><span class="sim-pal feita"></span> respondida · <span class="sim-pal marc"></span> marcada</p>
        </aside>
      </div>`;
  }

  function marcarOpcao(i) {
    const q = questoes[atual];
    const sel = respostas[atual] || [];
    const pos = sel.indexOf(i);
    if (q.multi) {
      if (pos >= 0) sel.splice(pos, 1);
      else {
        if (sel.length >= q.c.length) sel.shift(); // mantém no máx. o nº de corretas
        sel.push(i);
      }
      respostas[atual] = sel.sort((a, b) => a - b);
    } else {
      respostas[atual] = [i];
    }
    render();
  }

  // ---------- Correção ----------
  function corrigir() {
    let acertos = 0;
    const porDominio = {};
    const detalhe = questoes.map((q, idx) => {
      const sel = (respostas[idx] || []).slice().sort((a, b) => a - b);
      const certo = q.c.slice().sort((a, b) => a - b);
      const ok = sel.length === certo.length && sel.every((v, i) => v === certo[i]);
      if (ok) acertos++;
      const dd = porDominio[q.d] || (porDominio[q.d] = { total: 0, acertos: 0 });
      dd.total++; if (ok) dd.acertos++;
      return { q, sel, ok };
    });
    const pct = Math.round((acertos / questoes.length) * 100);
    const aprovado = pct >= cert.corte;

    // histórico
    const hist = lerHist();
    const h = hist[cert.id] || { tentativas: 0, melhor: 0 };
    h.tentativas++;
    h.melhor = Math.max(h.melhor, pct);
    h.ultimo = pct;
    hist[cert.id] = h;
    salvarHist(hist);

    ultimoResultado = { acertos, total: questoes.length, pct, aprovado, porDominio, detalhe };
    view = "resultado";
    render();
  }

  // ---------- Tela de resultado + análise ----------
  function telaResultado() {
    const r = ultimoResultado;
    const doms = cert.dominios;

    // barras por domínio + coleta dos que precisam reforço
    const linhas = Object.keys(doms).map((k) => {
      const d = doms[k];
      const stat = r.porDominio[k] || { total: 0, acertos: 0 };
      const pct = stat.total ? Math.round((stat.acertos / stat.total) * 100) : null;
      const cor = pct == null ? "var(--texto-fraco)" : pct >= 70 ? "var(--verde)" : pct >= 50 ? "var(--laranja)" : "var(--vermelho)";
      return `
        <div class="sim-dom">
          <div class="sim-dom-cab">
            <span>${esc(d.nome)} <small>(${d.peso}% do exame)</small></span>
            <span>${stat.total ? `${stat.acertos}/${stat.total} · ${pct}%` : "—"}</span>
          </div>
          <div class="sim-dom-barra"><div style="width:${pct || 0}%;background:${cor}"></div></div>
        </div>`;
    }).join("");

    // análise: domínios fracos (< 70%) viram recomendações de reforço
    const fracos = Object.keys(doms)
      .map((k) => ({ k, d: doms[k], stat: r.porDominio[k] || { total: 0, acertos: 0 } }))
      .filter((x) => x.stat.total && (x.stat.acertos / x.stat.total) < 0.7)
      .sort((a, b) => (a.stat.acertos / a.stat.total) - (b.stat.acertos / b.stat.total));

    const analise = fracos.length
      ? `<div class="sim-analise">
          <h3>🎯 O que reforçar</h3>
          ${fracos.map((x) => {
            const trilha = x.d.trilha ? `<button class="sim-link-trilha" data-acao="trilha" data-t="${x.d.trilha}">Praticar ${x.d.nome} no CLImb →</button>` : "";
            return `<div class="sim-rec">
              <strong>${esc(x.d.nome)}</strong> — você acertou ${x.stat.acertos} de ${x.stat.total}.
              <p>${esc(x.d.reforco || x.d.dica)}</p>
              ${trilha}
            </div>`;
          }).join("")}
        </div>`
      : `<div class="sim-analise"><h3>🌟 Mandou bem em todos os domínios!</h3>
          <p>Nenhum domínio ficou abaixo de 70%. Continue praticando pra manter o ritmo.</p></div>`;

    const cor = r.aprovado ? "var(--verde)" : "var(--vermelho)";
    const selo = r.aprovado ? "✅ Aprovado" : "❌ Reprovado";

    return `
      <div class="sim-pagina sim-resultado">
        <div class="sim-placar" style="border-color:${cor}">
          <div class="sim-placar-pct" style="color:${cor}">${r.pct}%</div>
          <div class="sim-placar-info">
            <div class="sim-placar-selo" style="color:${cor}">${selo}</div>
            <div>Você acertou <b>${r.acertos}</b> de <b>${r.total}</b> questões.</div>
            <small>Corte de aprovação: ${cert.corte}%</small>
          </div>
        </div>

        <h2 class="sim-secao">Desempenho por domínio</h2>
        ${linhas}
        ${analise}

        <h2 class="sim-secao">Gabarito comentado</h2>
        <p class="sim-rev-intro">Veja cada questão: <span class="sim-tagok">o que você marcou</span> e <span class="sim-tagcerto">a resposta certa</span>.</p>
        ${r.detalhe.map((dt, i) => revisaoQuestao(dt, i)).join("")}

        <div class="sim-acoes-fim">
          <button class="botao" data-acao="refazer">🔁 Novo simulado</button>
          <button class="botao secundario" data-acao="home">Voltar às certificações</button>
        </div>
      </div>`;
  }

  function revisaoQuestao(dt, i) {
    const q = dt.q;
    const opcoes = q.o.map((op, j) => {
      const ehCerta = q.c.indexOf(j) >= 0;
      const marcou = dt.sel.indexOf(j) >= 0;
      let cls = "";
      if (ehCerta) cls = "certa";
      else if (marcou) cls = "errada";
      const tags = `${marcou ? '<span class="sim-mini sim-mini-voce">você</span>' : ""}${ehCerta ? '<span class="sim-mini sim-mini-certo">correta</span>' : ""}`;
      return `<li class="${cls}"><span class="sim-letra">${String.fromCharCode(65 + j)}</span> ${esc(op)} ${tags}</li>`;
    }).join("");
    const status = dt.ok ? '<span class="sim-st ok">✔ acertou</span>' : '<span class="sim-st no">✘ errou</span>';
    const fonte = fonteDe(q);
    const fonteHtml = fonte
      ? `<div class="sim-rev-fonte">📚 Fonte: <a href="${esc(fonte.url)}" target="_blank" rel="noopener noreferrer">${esc(fonte.texto)}</a></div>`
      : "";
    return `
      <div class="sim-rev ${dt.ok ? "ok" : "no"}">
        <div class="sim-rev-cab"><span>Questão ${i + 1}</span> ${status}</div>
        <p class="sim-rev-q">${esc(q.q)}</p>
        <ul class="sim-rev-ops">${opcoes}</ul>
        ${q.e ? `<div class="sim-rev-exp"><strong>Por quê:</strong> ${esc(q.e)}${fonteHtml}</div>` : fonteHtml}
      </div>`;
  }

  // ---------- Eventos ----------
  function aoClicar(e) {
    const alvo = e.target.closest("[data-acao]");
    if (!alvo) return;
    const acao = alvo.dataset.acao;
    if (acao === "cert") return abrirCert(alvo.dataset.cert);
    if (acao === "opcao") return marcarOpcao(Number(alvo.dataset.i));
    if (acao === "ir") { atual = Number(alvo.dataset.i); return render(); }
    if (acao === "anterior") { if (atual > 0) atual--; return render(); }
    if (acao === "proxima") { if (atual < questoes.length - 1) atual++; return render(); }
    if (acao === "marcar") { marcadas[atual] = !marcadas[atual]; return render(); }
    if (acao === "finalizar") return tentarFinalizar();
    if (acao === "refazer") { view = "home"; return render(); }
    if (acao === "home") { view = "home"; return render(); }
    if (acao === "trilha") return irParaTrilha(alvo.dataset.t);
  }

  function tentarFinalizar() {
    const respondidas = respostas.filter((r) => r && r.length).length;
    const faltam = questoes.length - respondidas;
    if (faltam > 0) {
      if (!confirm(`Ainda faltam ${faltam} questão(ões) sem resposta (contam como erradas). Quer finalizar mesmo assim?`)) return;
    }
    corrigir();
  }

  // Manda o usuário praticar uma trilha do CLImb (fecha o simulado e seleciona o serviço).
  function irParaTrilha(servico) {
    fechar();
    try {
      if (typeof selecionarServico === "function") selecionarServico(servico);
      else if (window.selecionarServico) window.selecionarServico(servico);
    } catch (e) { /* se a função não existir, só fecha o overlay */ }
  }

  // ---------- Estilo (injetado, pra não mexer no estilo.css gigante) ----------
  function injetarEstilo() {
    if (document.getElementById("simEstilo")) return;
    const st = document.createElement("style");
    st.id = "simEstilo";
    st.textContent = `
      #simOverlay{position:fixed;inset:0;background:var(--fundo);z-index:1000;display:none;flex-direction:column}
      #simOverlay.aberto{display:flex}
      body.sim-aberto{overflow:hidden}
      .sim-topo{display:flex;align-items:center;justify-content:space-between;padding:.7rem 1.2rem;background:var(--painel);border-bottom:1px solid var(--borda);flex-shrink:0}
      .sim-logo{font-weight:700;font-size:1.1rem}.sim-logo span{color:var(--laranja)}
      .sim-topo-dir{display:flex;align-items:center;gap:1rem}
      .sim-info{color:var(--texto-fraco);font-family:var(--fonte-mono);font-size:.85rem}
      .sim-sair{background:none;border:1px solid var(--borda);color:var(--texto);border-radius:6px;padding:.4rem .8rem;cursor:pointer}
      .sim-sair:hover{border-color:var(--vermelho);color:var(--vermelho)}
      .sim-corpo{flex:1;overflow-y:auto;padding:1.4rem;max-width:1100px;margin:0 auto;width:100%}
      .sim-banner{background:var(--painel);border:1px solid var(--borda);border-radius:12px;padding:1.2rem 1.4rem;margin-bottom:1.4rem}
      .sim-banner h1{margin:0 0 .4rem}.sim-banner p{margin:0;color:var(--texto-fraco);line-height:1.5}
      .sim-secao{margin:1.4rem 0 .8rem;font-size:1.05rem;color:var(--texto)}
      .sim-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.9rem}
      .sim-cert{display:flex;gap:.9rem;background:var(--painel);border:1px solid var(--borda);border-radius:12px;padding:1rem;cursor:pointer;transition:border-color .15s,transform .1s}
      .sim-cert:hover:not(.off){border-color:var(--laranja);transform:translateY(-2px)}
      .sim-cert.off{opacity:.55;cursor:default}
      .sim-cert-ic{font-size:2rem;line-height:1}
      .sim-cert-info{display:flex;flex-direction:column;gap:.25rem}
      .sim-cert-info strong{font-size:1rem}
      .sim-cert-cod{font-size:.78rem;color:var(--laranja);font-family:var(--fonte-mono)}
      .sim-cert-info p{margin:.2rem 0;font-size:.85rem;color:var(--texto-fraco);line-height:1.4}
      .sim-tag{display:inline-block;background:rgba(255,153,0,.15);color:var(--laranja);border-radius:20px;padding:.15rem .6rem;font-size:.75rem;width:fit-content}
      .sim-tag.cinza{background:rgba(139,153,176,.15);color:var(--texto-fraco)}
      .sim-hist{font-size:.75rem;color:var(--texto-fraco)}
      /* prova */
      .sim-prova{display:grid;grid-template-columns:1fr 230px;gap:1.2rem;align-items:start}
      .sim-q{background:var(--painel);border:1px solid var(--borda);border-radius:12px;padding:1.2rem 1.4rem}
      .sim-q-cab{display:flex;align-items:center;gap:.8rem;margin-bottom:.8rem;flex-wrap:wrap}
      .sim-q-num{color:var(--texto-fraco);font-size:.85rem}
      .sim-multi{background:rgba(88,166,255,.18);color:var(--azul);border-radius:20px;padding:.15rem .6rem;font-size:.72rem}
      .sim-marcar{margin-left:auto;background:none;border:1px solid var(--borda);color:var(--texto-fraco);border-radius:6px;padding:.3rem .6rem;font-size:.78rem;cursor:pointer}
      .sim-marcar.on{border-color:var(--laranja);color:var(--laranja)}
      .sim-enunciado{font-size:1.05rem;line-height:1.55;margin:.4rem 0 1.1rem}
      .sim-opcoes{display:flex;flex-direction:column;gap:.55rem}
      .sim-opcao{display:flex;align-items:flex-start;gap:.7rem;text-align:left;background:var(--fundo);border:1px solid var(--borda);color:var(--texto);border-radius:8px;padding:.7rem .9rem;cursor:pointer;transition:border-color .12s,background .12s;font-size:.95rem;line-height:1.4}
      .sim-opcao:hover{border-color:var(--azul)}
      .sim-opcao.sel{border-color:var(--laranja);background:rgba(255,153,0,.12)}
      .sim-letra{flex-shrink:0;width:24px;height:24px;border-radius:50%;background:var(--borda);display:inline-flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700}
      .sim-opcao.sel .sim-letra{background:var(--laranja);color:#111}
      .sim-nav{display:flex;justify-content:space-between;margin-top:1.3rem;gap:.8rem}
      .sim-finalizar{background:var(--verde);border-color:var(--verde);color:#06210f}
      /* lateral */
      .sim-lado{background:var(--painel);border:1px solid var(--borda);border-radius:12px;padding:1rem;position:sticky;top:0}
      .sim-progresso-box{font-size:.85rem;color:var(--texto-fraco);margin-bottom:.7rem}
      .sim-progresso-box b,.sim-progresso-box strong{color:var(--texto)}
      .sim-paleta{display:grid;grid-template-columns:repeat(6,1fr);gap:.35rem;margin-bottom:.9rem}
      .sim-pal{aspect-ratio:1;border:1px solid var(--borda);background:var(--fundo);color:var(--texto-fraco);border-radius:6px;cursor:pointer;font-size:.78rem;padding:0}
      .sim-pal.feita{background:rgba(62,207,111,.2);color:var(--verde);border-color:transparent}
      .sim-pal.marc{box-shadow:inset 0 0 0 2px var(--laranja)}
      .sim-pal.atual{outline:2px solid var(--azul);outline-offset:1px}
      .sim-finalizar-2{width:100%;background:var(--verde);border-color:var(--verde);color:#06210f}
      .sim-legenda{font-size:.72rem;color:var(--texto-fraco);margin:.7rem 0 0;display:flex;gap:.8rem;align-items:center;flex-wrap:wrap}
      .sim-legenda .sim-pal{width:16px;height:16px;aspect-ratio:auto;cursor:default}
      /* resultado */
      .sim-placar{display:flex;align-items:center;gap:1.4rem;background:var(--painel);border:2px solid;border-radius:14px;padding:1.4rem 1.6rem;margin-bottom:1.2rem}
      .sim-placar-pct{font-size:3rem;font-weight:800;line-height:1}
      .sim-placar-selo{font-weight:700;font-size:1.1rem;margin-bottom:.3rem}
      .sim-placar-info small{color:var(--texto-fraco)}
      .sim-dom{margin-bottom:.8rem}
      .sim-dom-cab{display:flex;justify-content:space-between;font-size:.9rem;margin-bottom:.3rem}
      .sim-dom-cab small{color:var(--texto-fraco)}
      .sim-dom-barra{height:10px;background:var(--fundo);border-radius:6px;overflow:hidden;border:1px solid var(--borda)}
      .sim-dom-barra div{height:100%;border-radius:6px;transition:width .4s}
      .sim-analise{background:var(--painel);border:1px solid var(--borda);border-radius:12px;padding:1.1rem 1.3rem;margin:1.2rem 0}
      .sim-analise h3{margin:0 0 .7rem}
      .sim-rec{border-left:3px solid var(--laranja);padding:.2rem 0 .2rem .9rem;margin-bottom:.9rem}
      .sim-rec p{margin:.3rem 0;color:var(--texto-fraco);line-height:1.5}
      .sim-link-trilha{background:none;border:1px solid var(--laranja);color:var(--laranja);border-radius:6px;padding:.35rem .7rem;cursor:pointer;font-size:.82rem;margin-top:.3rem}
      .sim-link-trilha:hover{background:rgba(255,153,0,.12)}
      .sim-rev-intro{color:var(--texto-fraco);font-size:.88rem}
      .sim-tagok{color:var(--azul)}.sim-tagcerto{color:var(--verde)}
      .sim-rev{background:var(--painel);border:1px solid var(--borda);border-left:4px solid var(--vermelho);border-radius:10px;padding:.9rem 1.1rem;margin-bottom:.8rem}
      .sim-rev.ok{border-left-color:var(--verde)}
      .sim-rev-cab{display:flex;justify-content:space-between;font-size:.85rem;color:var(--texto-fraco);margin-bottom:.4rem}
      .sim-st.ok{color:var(--verde)}.sim-st.no{color:var(--vermelho)}
      .sim-rev-q{font-weight:600;margin:.2rem 0 .7rem;line-height:1.5}
      .sim-rev-ops{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:.35rem}
      .sim-rev-ops li{display:flex;align-items:center;gap:.5rem;padding:.45rem .6rem;border-radius:6px;background:var(--fundo);border:1px solid var(--borda);font-size:.9rem;line-height:1.4}
      .sim-rev-ops li.certa{border-color:var(--verde);background:rgba(62,207,111,.12)}
      .sim-rev-ops li.errada{border-color:var(--vermelho);background:rgba(255,92,92,.12)}
      .sim-mini{font-size:.68rem;border-radius:10px;padding:.1rem .45rem;margin-left:auto;white-space:nowrap}
      .sim-mini-voce{background:rgba(88,166,255,.2);color:var(--azul)}
      .sim-mini-certo{background:rgba(62,207,111,.2);color:var(--verde)}
      .sim-rev-exp{margin-top:.6rem;font-size:.86rem;color:var(--texto-fraco);line-height:1.5;border-top:1px dashed var(--borda);padding-top:.5rem}
      .sim-rev-fonte{margin-top:.5rem;font-size:.82rem}
      .sim-rev-fonte a{color:var(--azul);text-decoration:none}
      .sim-rev-fonte a:hover{text-decoration:underline}
      .sim-acoes-fim{display:flex;gap:.8rem;margin:1.4rem 0 2rem;flex-wrap:wrap}
      @media(max-width:760px){.sim-prova{grid-template-columns:1fr}.sim-lado{position:static}.sim-paleta{grid-template-columns:repeat(8,1fr)}}
    `;
    document.head.appendChild(st);
  }

  document.addEventListener("DOMContentLoaded", montar);
  window.abrirSimulados = abrir;
})();
