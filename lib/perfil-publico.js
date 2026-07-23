"use strict";
// ============================================================
// CLImb — lib/perfil-publico.js
// Página pública de perfil: /u/<usuario>
//
// POR QUE RENDERIZAR NO SERVIDOR: o objetivo é colar o link no LinkedIn/
// WhatsApp. Esses robôs de preview NÃO rodam JavaScript — se a página fosse
// montada no navegador, o card do link sairia vazio. Então o HTML já sai
// pronto daqui, com as meta tags og:/twitter:.
//
// Só entra aqui informação que o próprio usuário escolheu publicar (bio, links)
// ou que já é pública no ranking (nome de usuário, XP). E-mail NUNCA sai daqui.
// ============================================================

// Espelho de NIVEIS em js/jogo.js — mantenha em sincronia.
// `node teste/analise.js` compara os dois e acusa se divergirem.
const NIVEIS = [
  { xp: 0, titulo: "Estagiário de Cloud", icone: "☁️" },
  { xp: 250, titulo: "Aprendiz de CLI", icone: "🐣" },
  { xp: 700, titulo: "DevOps Júnior", icone: "🔧" },
  { xp: 1500, titulo: "Cloud Pleno", icone: "🚀" },
  { xp: 3000, titulo: "Cloud Sênior", icone: "🏗️" },
  { xp: 5000, titulo: "Especialista em AWS", icone: "🧠" },
  { xp: 8000, titulo: "Arquiteto de Soluções", icone: "🏛️" },
  { xp: 12000, titulo: "Mestre da Nuvem", icone: "🥷" },
  { xp: 16000, titulo: "Guru do CLI", icone: "🧙" },
  { xp: 20000, titulo: "Lenda do CLI", icone: "🦸" },
];

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function nivelDe(xp) {
  let n = NIVEIS[0];
  for (const nivel of NIVEIS) if ((xp || 0) >= nivel.xp) n = nivel;
  return n;
}

// Links só podem virar URL https de domínio conhecido — nunca aceite a string
// crua do usuário como href (senão vira javascript:...).
function urlGithub(v) {
  v = String(v || "").trim();
  if (/^https:\/\/github\.com\/[\w.-]{1,40}\/?$/.test(v)) return v;
  const h = v.replace(/^@/, "").replace(/^(https?:\/\/)?(www\.)?github\.com\//, "").replace(/\/+$/, "");
  return /^[\w.-]{1,40}$/.test(h) ? "https://github.com/" + encodeURIComponent(h) : null;
}
function urlLinkedin(v) {
  v = String(v || "").trim();
  if (/^https:\/\/(www\.)?linkedin\.com\/in\/[\w%.-]{1,80}\/?$/.test(v)) return v;
  const h = v.replace(/^@/, "").replace(/^(https?:\/\/)?(www\.)?linkedin\.com\/in\//, "").replace(/\/+$/, "");
  return /^[\w%.-]{1,80}$/.test(h) ? "https://www.linkedin.com/in/" + encodeURIComponent(h) : null;
}

// Monta o objeto público a partir do registro do usuário no banco.
// `u` é bd.usuarios[nome]; `pro` vem de licencaPublica(u).pro.
function dadosPublicos(nome, u, pro) {
  const prog = (u && u.progresso) || {};
  const p = prog.perfilPublico || {};
  const sd = prog.streakDias || {};
  const xp = u.xp || 0;
  return {
    usuario: nome,
    nome: p.nome || nome,
    bio: p.bio || "",
    local: p.local || "",
    github: urlGithub(p.github),
    linkedin: urlLinkedin(p.linkedin),
    publico: p.publico !== false,
    pro: !!pro,
    xp,
    nivel: nivelDe(xp),
    atividades: prog.concluidos ? Object.keys(prog.concluidos).length : 0,
    streakAtual: sd.atual || 0,
    streakMelhor: sd.melhor || 0,
    melhorSequencia: u.melhorStreak || 0,
    diasAtivos: prog.atividadeDiaria ? Object.keys(prog.atividadeDiaria).filter((d) => prog.atividadeDiaria[d] > 0).length : 0,
    membroDesde: u.criadoEm || null,
    atividadeDiaria: prog.atividadeDiaria || {},
  };
}

// ---------- heatmap (mesma ideia do perfil no app) ----------
function htmlHeatmap(atividade, semanas) {
  semanas = semanas || 20;
  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - inicio.getDay() - (semanas - 1) * 7);
  const iso = (d) => d.toISOString().slice(0, 10);
  let colunas = "";
  let rotulos = "";
  let mesAnt = -1;
  let total = 0;
  for (let s = 0; s < semanas; s++) {
    const dom = new Date(inicio);
    dom.setDate(inicio.getDate() + s * 7);
    rotulos += `<span class="m">${dom.getMonth() !== mesAnt ? MESES[dom.getMonth()] : ""}</span>`;
    mesAnt = dom.getMonth();
    let cel = "";
    for (let d = 0; d < 7; d++) {
      const dia = new Date(dom);
      dia.setDate(dom.getDate() + d);
      if (dia > hoje) { cel += `<span class="c fora"></span>`; continue; }
      const n = atividade[iso(dia)] || 0;
      total += n;
      const nv = n === 0 ? 0 : n <= 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4;
      cel += `<span class="c n${nv}" title="${iso(dia)}: ${n} atividade(s)"></span>`;
    }
    colunas += `<div class="col">${cel}</div>`;
  }
  return { html: `<div class="rot">${rotulos}</div><div class="heat">${colunas}</div>`, total };
}

// ---------- página ----------
function paginaHtml(d, opts) {
  opts = opts || {};
  const base = opts.base || "";
  const url = base + "/u/" + encodeURIComponent(d.usuario);
  const heat = htmlHeatmap(d.atividadeDiaria);
  const desde = d.membroDesde
    ? `${MESES[new Date(d.membroDesde).getMonth()]}/${new Date(d.membroDesde).getFullYear()}`
    : null;
  const titulo = `${d.nome} — CLImb`;
  const plural = (n, um, muitos) => `${n} ${n === 1 ? um : muitos}`;
  const resumo = `${d.nivel.titulo} · ${d.xp.toLocaleString("pt-BR")} XP · ` +
    plural(d.atividades, "atividade concluída", "atividades concluídas") +
    (d.streakMelhor > 1 ? ` · ${d.streakMelhor} dias seguidos de estudo` : "") +
    " no CLImb, o simulador de AWS CLI.";

  const cards = [
    [d.xp.toLocaleString("pt-BR"), "XP total"],
    [d.atividades, d.atividades === 1 ? "atividade<br>concluída" : "atividades<br>concluídas"],
    ["🔥 " + d.streakAtual, `${d.streakAtual === 1 ? "dia seguido" : "dias seguidos"}<br>(recorde ${d.streakMelhor})`],
    [d.diasAtivos, d.diasAtivos === 1 ? "dia<br>ativo" : "dias<br>ativos"],
    [d.melhorSequencia, "melhor sequência<br>de acertos"],
  ].map(([v, l]) => `<div class="card"><strong>${esc(String(v))}</strong><span>${l}</span></div>`).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(resumo)}">
<meta property="og:type" content="profile">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(resumo)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="CLImb">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(resumo)}">
<link rel="canonical" href="${esc(url)}">
<style>
  :root { --fundo:#10151f; --painel:#161e2d; --painel2:#1c2638; --borda:#2a3650;
          --texto:#dce3ee; --fraco:#8b99b0; --laranja:#ff9900; --laranja2:#cc7a00; --azul:#58a6ff; }
  * { box-sizing:border-box; }
  body { margin:0; padding:24px 16px 48px; background:var(--fundo); color:var(--texto);
         font-family:"Segoe UI", system-ui, -apple-system, sans-serif; line-height:1.5; }
  .env { max-width:760px; margin:0 auto; }
  .marca { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:20px; }
  .marca a.logo { color:var(--laranja); font-weight:800; font-size:1.15rem; text-decoration:none; }
  .marca a.logo small { color:var(--fraco); font-weight:400; font-size:0.7rem; margin-left:4px; }
  .btn { background:linear-gradient(90deg,var(--laranja2),var(--laranja)); color:#10151f;
         padding:9px 18px; border-radius:20px; font-weight:700; text-decoration:none; font-size:0.85rem;
         display:inline-block; }
  .painel { background:var(--painel); border:1px solid var(--borda); border-radius:16px; padding:22px; }
  .topo { display:flex; align-items:flex-start; gap:16px; flex-wrap:wrap; }
  .av { width:72px; height:72px; flex:0 0 72px; border-radius:50%; display:flex; align-items:center;
        justify-content:center; font-size:2rem; font-weight:800; color:#10151f;
        background:linear-gradient(135deg,var(--laranja2),var(--laranja)); }
  .id { flex:1; min-width:200px; }
  .id h1 { margin:0 0 2px; font-size:1.5rem; }
  .id .arroba { color:var(--fraco); font-weight:400; font-size:0.9rem; }
  .nivel { margin:0; color:var(--laranja); font-weight:700; }
  .meta { margin:2px 0 0; font-size:0.82rem; color:var(--fraco); }
  .selo-pro { background:rgba(255,153,0,0.15); border:1px solid var(--laranja); color:var(--laranja);
              border-radius:20px; padding:2px 10px; font-size:0.7rem; font-weight:700; }
  .links { margin-top:8px; display:flex; gap:14px; flex-wrap:wrap; font-size:0.85rem; }
  .links a { color:var(--azul); text-decoration:none; }
  .links a:hover { text-decoration:underline; }
  .bio { margin:16px 0 0; font-size:0.95rem; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-top:20px; }
  .card { background:var(--painel2); border:1px solid var(--borda); border-radius:10px; padding:12px 10px; text-align:center; }
  .card strong { display:block; font-size:1.3rem; }
  .card span { font-size:0.7rem; color:var(--fraco); line-height:1.3; display:block; margin-top:2px; }
  h2 { font-size:1rem; margin:26px 0 10px; }
  .rot { display:flex; gap:3px; margin-bottom:2px; }
  .rot .m { width:12px; flex:0 0 12px; font-size:0.6rem; color:var(--fraco); white-space:nowrap; }
  .heat { display:flex; gap:3px; }
  .col { display:flex; flex-direction:column; gap:3px; }
  .c { width:12px; height:12px; border-radius:3px; background:var(--painel2); border:1px solid var(--borda); }
  .c.fora { visibility:hidden; }
  .c.n1 { background:#4a3413; border-color:#6b4a15; }
  .c.n2 { background:#8a5b10; border-color:#a06a12; }
  .c.n3 { background:#cc7a00; border-color:#e08600; }
  .c.n4 { background:var(--laranja); border-color:#ffb84d; }
  .heat-wrap { overflow-x:auto; }
  .legenda { font-size:0.72rem; color:var(--fraco); margin-top:6px; }
  .cta { margin-top:26px; text-align:center; }
  .cta p { color:var(--fraco); font-size:0.85rem; margin:0 0 10px; }
  .rodape { margin-top:28px; font-size:0.72rem; color:var(--fraco); text-align:center; line-height:1.6; }
  @media (max-width:520px){
    body { padding:16px 12px 40px; }
    .id h1 { font-size:1.25rem; }
    .marca { flex-direction:column; align-items:stretch; gap:10px; }
    .marca a.logo { text-align:center; }
    .marca .btn { text-align:center; }
    .painel { padding:16px; }
    .av { width:56px; height:56px; flex-basis:56px; font-size:1.6rem; }
  }
</style>
</head>
<body>
<div class="env">
  <div class="marca">
    <a class="logo" href="${esc(base)}/">⚡ CLImb <small>AWS CLI</small></a>
    <a class="btn" href="${esc(base)}/">Treinar AWS CLI de graça</a>
  </div>

  <div class="painel">
    <div class="topo">
      <div class="av">${esc((d.nome || "?").trim().charAt(0).toUpperCase() || "?")}</div>
      <div class="id">
        <h1>${esc(d.nome)} ${d.pro ? '<span class="selo-pro">⭐ PRO</span>' : ""}</h1>
        <div class="arroba">@${esc(d.usuario)}</div>
        <p class="nivel">${d.nivel.icone} ${esc(d.nivel.titulo)}</p>
        ${d.local ? `<p class="meta">📍 ${esc(d.local)}</p>` : ""}
        ${desde ? `<p class="meta">Estuda no CLImb desde ${esc(desde)}</p>` : ""}
        ${(d.github || d.linkedin) ? `<div class="links">
          ${d.github ? `<a href="${esc(d.github)}" rel="nofollow noopener noreferrer" target="_blank">GitHub ↗</a>` : ""}
          ${d.linkedin ? `<a href="${esc(d.linkedin)}" rel="nofollow noopener noreferrer" target="_blank">LinkedIn ↗</a>` : ""}
        </div>` : ""}
      </div>
    </div>
    ${d.bio ? `<p class="bio">${esc(d.bio)}</p>` : ""}
    <div class="cards">${cards}</div>

    <h2>📆 Atividade</h2>
    <div class="heat-wrap">${heat.html}</div>
    <div class="legenda">${heat.total} atividades nas últimas 20 semanas</div>

    <div class="cta">
      <p>Este é o progresso de ${esc(d.nome)} aprendendo AWS por linha de comando.</p>
      <a class="btn" href="${esc(base)}/">Começar o meu — é grátis</a>
    </div>
  </div>

  <p class="rodape">
    ⚡ <strong>CLImb</strong> — simulador para aprender a AWS CLI sem risco de conta nem custo.<br>
    Projeto independente e educativo, sem afiliação, patrocínio ou endosso da Amazon.
    “AWS” e “Amazon Web Services” são marcas registradas da Amazon.com, Inc. ou de suas afiliadas.
  </p>
</div>
</body>
</html>`;
}

// Página de "perfil não encontrado / fechado" — mesmo visual, sem vazar se a
// conta existe ou não (resposta idêntica nos dois casos).
function paginaIndisponivel(base) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Perfil não disponível — CLImb</title>
<meta name="robots" content="noindex">
<style>
  body { margin:0; padding:60px 20px; background:#10151f; color:#dce3ee; text-align:center;
         font-family:"Segoe UI", system-ui, sans-serif; }
  a { color:#ff9900; }
  .cx { max-width:460px; margin:0 auto; background:#161e2d; border:1px solid #2a3650;
        border-radius:16px; padding:32px; }
  h1 { font-size:1.3rem; margin:0 0 10px; }
  p { color:#8b99b0; font-size:0.9rem; line-height:1.6; }
</style></head>
<body><div class="cx">
  <h1>🔒 Perfil não disponível</h1>
  <p>Este perfil não existe ou está fechado pelo dono.</p>
  <p><a href="${esc(base)}/">Conhecer o CLImb ⚡</a></p>
</div></body></html>`;
}

module.exports = { NIVEIS, nivelDe, dadosPublicos, paginaHtml, paginaIndisponivel, urlGithub, urlLinkedin };
