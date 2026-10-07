"use strict";
// ============================================================
// CLImb — lib/pagina-escolas.js
// /escolas: a vitrine do plano Escola (no ar desde 30/09/2026, v171). Até aqui
// o professor só descobria o "Sou professor" se abrisse 👥 Turmas por acaso —
// o plano existia e ninguém de fora conseguia achar.
//
// Quem lê: coordenador ou professor de curso técnico/faculdade de TI. O que a
// página tem de fazer em um minuto: mostrar o que o professor VÊ (o painel,
// reproduzido em HTML com as mesmas colunas do js/multiplayer.js), o que cada
// lado paga, e levar a um dos dois pedidos.
//
// Nada de número escrito à mão: preços vêm do servidor (PRECOS e
// PRECO_ESCOLA_ALUNO), contagem de trilhas e atividades vem do conteúdo, as
// trilhas abertas vêm do js/licenca.js. Preço de pacote de vagas NÃO aparece —
// é decisão comercial do Gabriel, caso a caso (memória plano-escola).
//
// Os botões levam a /?abrir=turmas e /?abrir=ajuda-escola, que o
// js/suporte.js abre depois que o app monta.
// Regras de página pública do CLAUDE.md: ≥400 palavras próprias, HTML do
// servidor, canonical, sitemap e link no rodapé de todas as páginas públicas.
// ============================================================
const pag = require("./paginas-licoes.js");
const { esc } = pag;

const TITULO = "CLImb para escolas: turma praticando AWS CLI, com painel do professor";
const DESCRICAO = "Conta de professor grátis, com painel de progresso por aluno e tarefas com prazo. " +
  "Os alunos praticam AWS no terminal do navegador, sem conta AWS nem cartão.";

const reais = (v) => "R$ " + Number(v).toFixed(2).replace(".", ",");
const milhar = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

// O painel de exemplo. Mesmas colunas e mesmo jeito de contar do painel real
// (multiplayer.js → painelHtml). Os alunos são fictícios.
const EXEMPLO = {
  turma: "Redes 2º B",
  tarefas: [["S3", "até 17/10"], ["IAM", "até 31/10"]],
  alunos: [
    ["bia_souza", 1240, 31, 2, "Hoje", "🎟️ vaga", [100, 64]],
    ["joao.pedro", 980, 26, 5, "Ontem", "🎟️ vaga", [92, 40]],
    ["larissa_m", 860, 22, 0, "Hoje", "✔", [88, 28]],
    ["caio_tec", 410, 12, 7, "3 dias atrás", "—", [44, 0]],
    ["renan.dev", 95, 3, 1, "11 dias atrás", "—", [8, 0]],
  ],
};

const CSS = `
  .env { max-width:780px; }
  .esc-topo h1 { font-size:2.05rem; line-height:1.18; letter-spacing:-0.01em; margin:4px 0 14px; max-width:20ch; }
  .esc-topo p.abre { font-size:1.06rem; color:var(--texto); max-width:62ch; }
  .esc-acoes { display:flex; flex-wrap:wrap; gap:10px 18px; align-items:center; margin:18px 0 6px; }
  .esc-acoes a.sec { color:var(--azul); font-weight:600; }
  .btn:focus-visible, .esc-acoes a:focus-visible { outline:2px solid var(--azul); outline-offset:3px; }

  /* A réplica do painel: é a peça que a página existe pra mostrar. Sai da
     coluna de texto pra ter a largura da tabela de verdade. */
  .esc-janela { margin:34px -16px 8px; background:var(--painel); border:1px solid var(--borda);
                border-radius:12px; overflow:hidden; }
  @media (min-width:860px) { .esc-janela { margin-left:-60px; margin-right:-60px; } }
  .esc-barra { display:flex; justify-content:space-between; align-items:baseline; gap:12px; flex-wrap:wrap;
               padding:14px 18px 10px; border-bottom:1px solid var(--borda); }
  .esc-barra strong { font-size:1.02rem; color:#fff; }
  .esc-barra span { color:var(--fraco); font-size:0.85rem; }
  .esc-rolagem { overflow-x:auto; }
  .esc-tab { width:100%; border-collapse:collapse; font-size:0.9rem; font-variant-numeric:tabular-nums; min-width:640px; }
  .esc-tab th { text-align:left; font-weight:600; color:var(--fraco); padding:10px 12px 8px; white-space:nowrap; }
  .esc-tab th small { display:block; font-weight:400; font-size:0.78rem; }
  .esc-tab td { padding:9px 12px; border-top:1px solid var(--borda); white-space:nowrap; }
  .esc-tab td.n, .esc-tab th.n { text-align:right; }
  .esc-tab td.pc { color:var(--laranja); font-weight:700; }
  .esc-tab td.pc.zero { color:var(--fraco); font-weight:400; }
  .esc-tab tr.parado td.quando { color:#ff9b8f; }
  .esc-legenda { color:var(--fraco); font-size:0.85rem; padding:10px 18px 14px; margin:0;
                 border-top:1px solid var(--borda); }

  .esc-passos { counter-reset:passo; list-style:none; padding:0; margin:10px 0 0; }
  .esc-passos li { counter-increment:passo; position:relative; padding:0 0 4px 46px; margin-bottom:16px; }
  .esc-passos li::before { content:counter(passo); position:absolute; left:0; top:0; width:30px; height:30px;
                           border:1.5px solid var(--laranja); border-radius:50%; color:var(--laranja);
                           font-weight:700; display:grid; place-items:center; font-size:0.92rem; }
  .esc-passos b { display:block; }

  .esc-precos { width:100%; border-collapse:collapse; margin:6px 0 10px; }
  .esc-precos th, .esc-precos td { text-align:left; vertical-align:top; padding:12px 12px 12px 0;
                                   border-top:1px solid var(--borda); }
  .esc-precos th { color:#fff; font-weight:700; width:34%; }
  .esc-precos td.valor { white-space:nowrap; color:var(--laranja); font-weight:700; width:22%; }
  .esc-precos td.valor small { display:block; color:var(--fraco); font-weight:400; }
  @media (max-width:560px) {
    .esc-precos, .esc-precos tbody, .esc-precos tr, .esc-precos th, .esc-precos td { display:block; width:auto; }
    .esc-precos th { padding-bottom:2px; } .esc-precos td { border-top:0; padding:2px 0 6px; }
    .esc-precos tr { border-top:1px solid var(--borda); padding:10px 0; }
    .esc-topo h1 { font-size:1.7rem; }
  }
  .esc-faq dt { font-size:1rem; margin-top:18px; }
  .esc-faq dd { color:var(--texto); }
  .esc-fim { margin:40px 0 0; padding:22px 0 0; border-top:2px solid var(--laranja); }
  .esc-fim h2 { color:#fff; font-size:1.3rem; margin-top:0; }
  .esc-marca { color:var(--fraco); font-size:0.82rem; margin-top:26px; }
`;

function painelExemplo() {
  const e = EXEMPLO;
  const cab = `<tr><th>Aluno</th><th class="n">XP</th><th class="n">Feitas</th><th class="n">Reveladas</th>` +
    `<th>Estudou por último</th><th>Pro</th>` +
    e.tarefas.map(([t, prazo]) => `<th class="n">${esc(t)}<small>${esc(prazo)}</small></th>`).join("") + `</tr>`;
  const linhas = e.alunos.map(([nome, xp, feitas, rev, quando, pro, pcs]) => {
    const parado = /\d+ dias/.test(quando) && parseInt(quando, 10) > 7;
    return `<tr${parado ? ` class="parado"` : ""}><td>${esc(nome)}</td><td class="n">${milhar(xp)}</td>` +
      `<td class="n">${feitas}</td><td class="n">${rev}</td><td class="quando">${esc(quando)}</td><td>${esc(pro)}</td>` +
      pcs.map((p) => `<td class="n pc${p ? "" : " zero"}">${p}%</td>`).join("") + `</tr>`;
  }).join("");
  return `
  <figure class="esc-janela" aria-labelledby="escLegenda">
    <div class="esc-barra"><strong>📊 ${esc(e.turma)} — ${e.alunos.length} alunos</strong>
      <span>Painel da turma, como o professor vê</span></div>
    <div class="esc-rolagem" tabindex="0" role="region" aria-label="Tabela de exemplo do painel da turma">
      <table class="esc-tab"><thead>${cab}</thead><tbody>${linhas}</tbody></table>
    </div>
    <figcaption class="esc-legenda" id="escLegenda">Exemplo com alunos fictícios. As colunas S3 e IAM são as
    tarefas que o professor marcou: quanto da trilha cada aluno já fez. "Reveladas" são atividades
    concluídas depois de ver a resposta. O <b>renan.dev</b>, parado há 11 dias, é quem precisa de uma conversa.
    O painel exporta tudo para planilha (CSV).</figcaption>
  </figure>`;
}

function paginaEscolas(opts) {
  opts = opts || {};
  const base = opts.base || "";
  const c = opts.conteudo || { desafios: [], meta: [] };
  const g = opts.gratis || { servicos: [], porTrilha: 0 };
  const precos = opts.precos || {};
  const precoEscola = opts.precoEscola;
  const nTrilhas = c.meta.length;
  const nAtiv = c.desafios.length;
  const nomes = g.servicos.map((id) => (c.meta.find((m) => m.id === id) || {}).nome).filter(Boolean);
  const listaGratis = nomes.length
    ? nomes.slice(0, -1).join(", ") + (nomes.length > 1 ? " e " : "") + nomes[nomes.length - 1] : "";
  const app = `${esc(base)}/`;

  const corpo = `
  <div class="esc-topo">
    <h1>Sua turma pratica AWS no terminal. Você vê quem está avançando.</h1>
    <p class="abre">O CLImb é um curso de AWS CLI em que o aluno aprende digitando comandos num
    terminal simulado, direto no navegador: cria bucket, sobe máquina, dá permissão, lê log. Para o
    professor, há uma <b>conta grátis</b> com painel de progresso de cada aluno e tarefas com prazo, e
    a turma ganha um preço menor no plano completo.</p>
    <div class="esc-acoes">
      <a class="btn" href="${app}?abrir=turmas">Pedir conta de professor</a>
      <a class="sec" href="${app}?abrir=ajuda-escola">A escola quer pagar as vagas dos alunos</a>
    </div>
  </div>

  ${painelExemplo()}

  <h2>Como funciona</h2>
  <ol class="esc-passos">
    <li><b>Você pede a conta de professor.</b> Crie uma conta no CLImb e, em 👥 Turmas, informe a
    instituição e o seu e-mail da escola. A confirmação do vínculo é feita por uma pessoa, e a resposta
    chega no seu e-mail.</li>
    <li><b>Cria a turma e passa o código.</b> A turma tem um código curto; o aluno digita em 👥 Turmas
    e entra. Pode ser uma turma por disciplina ou por semestre.</li>
    <li><b>Marca as tarefas.</b> Escolha a trilha (S3, IAM, EC2, Lambda…) e, se quiser, um prazo. O
    aluno vê a tarefa e o próprio andamento dentro da turma.</li>
    <li><b>Acompanha pelo painel.</b> XP, atividades feitas, respostas reveladas, último dia de estudo
    e o quanto cada um fez de cada tarefa. Dá para baixar em planilha para lançar onde a escola usa.</li>
  </ol>

  <h2>O que os alunos praticam</h2>
  <p>São <b>${nTrilhas} trilhas</b> e <b>${milhar(nAtiv)} atividades</b>, do primeiro <code>aws configure</code>
  até projetos que juntam vários serviços. Cada atividade é um cenário de trabalho ("o time precisa de
  um bucket para os relatórios", "um funcionário saiu e a chave dele tem de ser desativada"), e o
  terminal responde como a AWS responde: a mesma saída, os mesmos erros. Errar faz parte do exercício.</p>
  <p>Não precisa de conta na AWS, de cartão de crédito nem de instalar nada: roda no navegador, inclusive
  nos computadores do laboratório. Ninguém deixa uma máquina ligada por esquecimento e recebe uma
  fatura no fim do mês.</p>
  ${listaGratis ? `<p>Sem pagar nada, o aluno faz as trilhas <b>${esc(listaGratis)}</b> inteiras, e as
  ${g.porTrilha} primeiras atividades de todas as outras.</p>` : ""}
  <p>Para quem vai prestar a certificação de entrada, há também um
  <a href="${esc(base)}/simulado-aws-clf-c02" style="color:#58a6ff">simulado da AWS Certified Cloud
  Practitioner (CLF-C02)</a>, com a explicação de cada resposta.</p>

  <h2>Quanto custa</h2>
  <table class="esc-precos">
    <tbody>
      <tr><th scope="row">Professor</th><td class="valor">Grátis</td>
        <td>O plano completo por um ano, o painel e as tarefas, depois da confirmação do vínculo com a escola.</td></tr>
      <tr><th scope="row">Aluno que não paga</th><td class="valor">Grátis</td>
        <td>Entra na turma, aparece no painel e faz tudo o que é aberto.</td></tr>
      ${precoEscola ? `<tr><th scope="row">Aluno de turma do professor</th><td class="valor">${reais(precoEscola)}<small>por um ano</small></td>
        <td>O plano completo, com tudo liberado. Fora da turma o mesmo plano custa ${precos.anual ? reais(precos.anual) : "mais"} por ano.
        Pix, cartão ou boleto, pelo Mercado Pago.</td></tr>` : ""}
      <tr><th scope="row">Escola que paga as vagas</th><td class="valor">Sob consulta</td>
        <td>A escola compra um número de vagas; quem entra na turma ganha o plano completo enquanto houver
        vaga. Se um aluno sai, o professor libera a vaga e ela passa para o próximo.</td></tr>
    </tbody>
  </table>

  <h2>Perguntas de quem coordena</h2>
  <dl class="esc-faq">
    <dt>O que o professor vê de cada aluno?</dt>
    <dd>Só o que está no painel: nome de usuário, XP, atividades feitas e reveladas, último dia de estudo
    e o andamento nas tarefas. E-mail e senha do aluno não aparecem. O aviso de que o professor acompanha
    o progresso fica visível para o aluno dentro da própria turma, e a
    <a href="${esc(base)}/privacidade.html" style="color:#58a6ff">política de privacidade</a> descreve o resto.</dd>
    <dt>Dá para usar o painel como nota?</dt>
    <dd>Como acompanhamento, sim; como prova, não. O progresso é registrado no navegador de cada aluno, e a
    coluna de respostas reveladas mostra quem concluiu depois de ver a solução. Para avaliar, o painel
    diz quem precisa de ajuda; a prova continua sendo sua.</dd>
    <dt>Os alunos precisam de e-mail institucional?</dt>
    <dd>Não. O e-mail da escola é pedido só do professor, para confirmar o vínculo. O aluno cria a conta
    com o e-mail que tiver.</dd>
    <dt>O conteúdo segue a AWS de verdade?</dt>
    <dd>Os comandos, as opções e as mensagens de erro são conferidos com a AWS CLI versão 2 e a
    documentação oficial. O que muda é que nenhum recurso é criado de verdade e nada é cobrado: é um simulador.
    Antes de levar para a turma, dá para ver o nível pelos
    <a href="${esc(base)}/comandos-aws-cli" style="color:#58a6ff">comandos básicos</a> e pelas
    <a href="${esc(base)}/aprender" style="color:#58a6ff">lições de cada serviço</a>.</dd>
  </dl>

  <div class="esc-fim">
    <h2>Comece pela sua turma</h2>
    <p>A conta de professor é grátis. Se preferir conversar antes, sobre vagas pagas pela escola ou sobre
    como encaixar na sua disciplina, mande uma mensagem: a resposta vem por e-mail.</p>
    <div class="esc-acoes">
      <a class="btn" href="${app}?abrir=turmas">Pedir conta de professor</a>
      <a class="sec" href="${app}?abrir=ajuda-escola">Falar sobre a escola</a>
    </div>
  </div>

  <p class="esc-marca">CLImb é um projeto independente e educativo, sem afiliação, patrocínio ou endosso da
  Amazon. "AWS" e "Amazon Web Services" são marcas registradas da Amazon.com, Inc. ou de suas afiliadas.</p>`;

  return pag.cabecalho(TITULO, DESCRICAO, `${base}/escolas`, base, CSS) +
    pag.trilhaJsonLd(base, [{ nome: "Para escolas", url: `${base}/escolas` }]) + corpo + pag.rodape(base);
}

const ROTA_ESCOLAS = "/escolas";

module.exports = { paginaEscolas, ROTA_ESCOLAS };
