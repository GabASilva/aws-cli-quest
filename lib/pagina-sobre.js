"use strict";
// ============================================================
// CLImb — lib/pagina-sobre.js
// /sobre.html ("O que o CLImb ensina"), montada no servidor a cada boot.
//
// Antes era um arquivo estático gerado por scripts/gerar-sobre.js, que só rodava
// quando alguém lembrava. Em 04/10/2026 ele ainda dizia "630 atividades em 63
// trilhas" (eram 1.407 em 70), S3 com 31 atividades (eram 66) e a lista de
// trilhas grátis sem "Configurar a CLI". Agora os números saem do mesmo
// conteúdo que o app carrega, as trilhas vêm agrupadas como na lateral do app
// (GRUPOS_TRILHA_BASE) e a lista grátis vem do js/licenca.js.
//
// A URL continua /sobre.html: já está no sitemap, no rodapé do app e indexada.
// ============================================================
const pag = require("./paginas-licoes.js");
const { esc } = pag;

const milhar = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const lista = (nomes) => nomes.length > 1 ? nomes.slice(0, -1).join(", ") + " e " + nomes[nomes.length - 1] : (nomes[0] || "");

const CSS = `
  .sobre-lead { font-size:1.06rem; max-width:62ch; }
  .sobre-tab { width:100%; border-collapse:collapse; margin:0 0 8px; font-size:0.94rem; }
  .sobre-tab th { text-align:left; color:var(--fraco); font-weight:600; padding:6px 10px 6px 0; }
  .sobre-tab td { padding:7px 10px 7px 0; border-top:1px solid var(--borda); vertical-align:top; }
  .sobre-tab td:first-child { color:#fff; font-weight:600; width:38%; }
  .sobre-tab td.n, .sobre-tab th.n { text-align:right; padding-right:0; font-variant-numeric:tabular-nums; width:5.5em; }
  .sobre-tab a { color:var(--texto); text-decoration:underline; text-decoration-color:var(--borda); text-underline-offset:3px; }
  .sobre-tab a:hover { color:var(--laranja); }
  .sobre-marca { color:var(--fraco); font-size:0.82rem; margin-top:26px; }
`;

function paginaSobre(opts) {
  opts = opts || {};
  const base = opts.base || "";
  const c = opts.conteudo || { desafios: [], meta: [] };
  const g = opts.gratis || { servicos: [], porTrilha: 0 };
  const licoes = opts.licoes || {};

  const porTrilha = {};
  for (const d of c.desafios) porTrilha[d.servico] = (porTrilha[d.servico] || 0) + 1;
  const trilhas = c.meta.filter((m) => porTrilha[m.id]);
  const total = c.desafios.length;
  const nomeTrilha = (id) => (c.meta.find((m) => m.id === id) || {}).nome || id;
  const gratis = g.servicos.map(nomeTrilha);

  // mesma divisão da lateral do app; trilha nova sem grupo cai em "Outros"
  const grupos = pag.grupos();
  const usados = new Set();
  const blocos = [];
  for (const gr of grupos) {
    const ids = (gr.servicos || []).filter((id) => porTrilha[id] && !usados.has(id));
    ids.forEach((id) => usados.add(id));
    if (ids.length) blocos.push({ nome: gr.nome, ids });
  }
  const sobra = trilhas.map((m) => m.id).filter((id) => !usados.has(id));
  if (sobra.length) blocos.push({ nome: grupos.length ? "Outros serviços" : "Trilhas", ids: sobra });

  const linha = (id) => {
    const m = c.meta.find((x) => x.id === id) || { nome: id };
    const nome = licoes[id] ? `<a href="${esc(base)}/aprender/${esc(id)}">${esc(m.nome)}</a>` : esc(m.nome);
    const livre = g.servicos.includes(id) ? ' <span class="livre">grátis</span>' : "";
    return `<tr><td>${nome}${livre}</td><td>${esc(m.subtitulo || "")}</td><td class="n">${porTrilha[id]}</td></tr>`;
  };
  const tabelas = blocos.map((b) => `<h2 class="grupo">${esc(b.nome)}</h2>
    <table class="sobre-tab"><thead><tr><th>Trilha</th><th>Sobre</th><th class="n">Atividades</th></tr></thead>
    <tbody>${b.ids.map(linha).join("")}</tbody></table>`).join("");

  const titulo = `O que o CLImb ensina — ${milhar(total)} atividades de AWS CLI`;
  const descricao = `Catálogo completo do CLImb: ${milhar(total)} atividades em ${trilhas.length} trilhas de AWS CLI, ` +
    "de S3 e IAM a VPC, Lambda, CloudFormation e Kubernetes. Você digita os comandos num terminal simulado.";

  const corpo = `
  <h1>O que o CLImb ensina</h1>
  <p class="sobre-lead">${milhar(total)} atividades em ${trilhas.length} trilhas, todas praticadas digitando
  comandos de verdade.</p>
  <p>O CLImb é um <b>simulador de terminal AWS</b>. Você digita <code>aws s3 mb s3://loja</code> e o bucket
  passa a existir; digita <code>aws s3 ls</code> depois e ele está lá. O estado persiste entre um comando e o
  seguinte, os erros são os mesmos que a AWS devolveria, e <b>nada custa dinheiro</b>: não há conexão com
  nenhuma conta AWS real.</p>
  <p><a class="btn" href="${esc(base)}/">Começar agora, grátis</a></p>

  <h2>Como funciona</h2>
  <p>Cada atividade é um problema de trabalho, não um comando solto: <em>"o time precisa de um bucket para o
  site"</em>, <em>"um funcionário saiu, revogue o acesso"</em>. Você lê o cenário, digita o comando e o
  simulador responde como a AWS responderia.</p>
  <p>Antes de cada comando novo há uma explicação de <b>por que ele existe</b>, não só do que digitar. E há
  dicas graduais: a resposta só aparece depois que as dicas acabam.</p>
  <p>Na trilha <b>Diagnóstico</b>, a infraestrutura chega quebrada e você precisa achar a causa nos
  <em>flow logs</em>, como num plantão de verdade. E no <b>Sandbox livre</b> não há tarefa: todos os
  serviços ficam abertos pra você experimentar.</p>

  <h2>As ${trilhas.length} trilhas</h2>
  <p>Agrupadas do mesmo jeito que aparecem dentro do app, na ordem sugerida de estudo. As que têm lição
  pública levam pra ela.</p>
  ${tabelas}

  <h2>Para quem é</h2>
  <p>Para quem está estudando computação em nuvem, se preparando para certificação AWS, ou precisa usar a
  linha de comando no trabalho e cansou de copiar comando de tutorial sem entender. Também serve para quem
  já sabe: as trilhas avançadas cobrem <code>--query</code> (JMESPath), políticas IAM próprias e missões com
  poucas dicas. Para turmas, há a <a href="${esc(base)}/escolas" style="color:#58a6ff">conta de professor
  grátis</a>.</p>

  <h2>Quanto custa</h2>
  <p>${gratis.length ? `As trilhas <b>${esc(lista(gratis))}</b> são <b>gratuitas</b> inteiras, sem cartão e
  sem prazo${g.porTrilha ? `, e as ${g.porTrilha} primeiras atividades de todas as outras também` : ""}.` : ""}
  O restante do catálogo faz parte do plano Pro. Seu progresso salva no navegador mesmo sem conta.</p>
  <p><a class="btn" href="${esc(base)}/">Abrir o terminal</a></p>

  <p class="sobre-marca">CLImb é um projeto independente e educativo, sem afiliação, patrocínio ou endosso da
  Amazon. "AWS" e "Amazon Web Services" são marcas registradas da Amazon.com, Inc. ou de suas afiliadas.
  <a href="${esc(base)}/privacidade.html" style="color:#58a6ff">Privacidade e termos</a>.</p>`;

  return pag.cabecalho(titulo, descricao, `${base}/sobre.html`, base, CSS) +
    pag.trilhaJsonLd(base, [{ nome: "O que o CLImb ensina", url: `${base}/sobre.html` }]) + corpo + pag.rodape(base);
}

module.exports = { paginaSobre, ROTA_SOBRE: "/sobre.html" };
