"use strict";
// Gera o sobre.html a partir dos DADOS REAIS do app (SERVICOS_META + DESAFIOS).
// Rode depois de acrescentar trilhas ou atividades:  node scripts/gerar-sobre.js
//
// Por que gerado e não escrito à mão: a capa já anunciou "599 atividades" por
// dias depois de o app ter 630. Número de catálogo escrito à mão envelhece
// calado — este sai do mesmo lugar que a tela lê.
const fs = require("fs");
const path = require("path");
const raiz = path.join(__dirname, "..");

global.window = global;
const _el = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
                     appendChild() {}, insertBefore() {}, remove() {}, setAttribute() {}, addEventListener() {},
                     querySelector() { return null; }, querySelectorAll() { return []; } });
global.document = {
  addEventListener() {}, removeEventListener() {},
  querySelector() { return null; }, querySelectorAll() { return []; },
  getElementById() { return null; }, createElement() { return _el(); },
  head: _el(), body: _el(), readyState: "complete",
};

// mesma ordem do index.html (só o que define conteúdo)
const ordem = fs.readFileSync(path.join(raiz, "index.html"), "utf8")
  .match(/src="js\/([^"]+)"/g).map((m) => m.slice(8, -1));
const precisaDom = new Set(["api.js", "app.js", "erros-amigaveis.js", "autocomplete.js", "glossario.js",
  "conquistas.js", "quase-la.js", "licenca.js", "seguranca.js", "email-verificacao.js", "multiplayer.js",
  "eventos-aviso.js", "google-login.js", "tutorial.js", "console-aws.js", "console-subtelas.js",
  "console-desafios.js", "arquiteto-ia.js", "diagrama.js", "simulados.js", "simulados-limite.js",
  "perfil.js", "changelog.js", "sidebar-grupos.js", "carreiras.js", "tela-limpa.js",
  "primeiros-passos.js", "menus.js", "capa.js", "mobile-nav.js", "acessibilidade.js", "meus-dados.js"]);
const arquivos = ordem.filter((f) => !precisaDom.has(f) && fs.existsSync(path.join(raiz, "js", f)));
const codigo = arquivos.map((f) => fs.readFileSync(path.join(raiz, "js", f), "utf8")).join("\n");

let META = [], TOTAL = 0;
eval(codigo + `
  META = SERVICOS_META.map((s) => ({
    nome: s.nome,
    sub: s.subtitulo || "",
    n: DESAFIOS.filter((d) => d.servico === s.id).length,
  })).filter((t) => t.n > 0);
  TOTAL = DESAFIOS.length;
`);

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const linhas = META.map((t) =>
  `    <tr><td><strong>${esc(t.nome)}</strong></td><td>${esc(t.sub)}</td><td>${t.n}</td></tr>`
).join("\n");

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>O que o CLImb ensina — ${TOTAL} atividades de AWS CLI</title>
<meta name="description" content="Catálogo completo do CLImb: ${TOTAL} atividades em ${META.length} trilhas de AWS CLI, de S3 e IAM a VPC, Lambda, CloudFormation e Kubernetes. Você digita os comandos num terminal simulado.">
<link rel="canonical" href="https://climb.dev.br/sobre.html">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#10151f">
<meta property="og:type" content="website">
<meta property="og:title" content="O que o CLImb ensina — ${TOTAL} atividades de AWS CLI">
<meta property="og:description" content="Catálogo completo: ${TOTAL} atividades em ${META.length} trilhas, de S3 e IAM a VPC, Lambda e CloudFormation.">
<meta property="og:url" content="https://climb.dev.br/sobre.html">
<meta property="og:image" content="https://climb.dev.br/img/og.jpg">
<style>
  :root { --fundo:#10151f; --painel:#161e2d; --borda:#2a3650;
          --texto:#dce3ee; --fraco:#8b99b0; --laranja:#ff9900; }
  * { box-sizing: border-box; }
  body { margin:0; padding:2rem 1.2rem 4rem; background:var(--fundo); color:var(--texto);
         font-family:"Segoe UI", system-ui, -apple-system, sans-serif; line-height:1.65; }
  .env { max-width: 48rem; margin: 0 auto; }
  a { color: var(--laranja); }
  h1 { font-size: clamp(1.5rem,4vw,2.1rem); line-height:1.2; margin:0 0 .4rem; }
  h2 { font-size: 1.15rem; margin: 2.4rem 0 .6rem; color: var(--laranja); }
  .sub { color: var(--fraco); margin:0 0 2rem; }
  table { width:100%; border-collapse:collapse; margin:1rem 0; font-size:.9rem; }
  th, td { text-align:left; padding:.5rem .6rem; border-bottom:1px solid var(--borda); }
  th { color: var(--fraco); font-weight:600; }
  td:last-child, th:last-child { text-align:right; white-space:nowrap; }
  .caixa { background:var(--painel); border:1px solid var(--borda); border-radius:.6rem;
           padding:1rem 1.1rem; margin:1.4rem 0; }
  .cta { display:inline-block; background:var(--laranja); color:#10151f; font-weight:700;
         padding:.8rem 1.5rem; border-radius:.6rem; text-decoration:none; margin:.6rem 0; }
  .voltar { display:inline-block; margin-bottom:1.5rem; color:var(--fraco); text-decoration:none; }
  code { background:var(--painel); padding:.1rem .35rem; border-radius:.25rem; font-size:.9em; }
  footer { margin-top:3rem; padding-top:1.2rem; border-top:1px solid var(--borda);
           color:var(--fraco); font-size:.8rem; }
</style>
</head>
<body>
<div class="env">
  <a class="voltar" href="/">&larr; voltar ao CLImb</a>

  <h1>O que o CLImb ensina</h1>
  <p class="sub">${TOTAL} atividades em ${META.length} trilhas &mdash; todas praticadas digitando comandos de verdade.</p>

  <div class="caixa">
    O CLImb é um <strong>simulador de terminal AWS</strong>. Você digita
    <code>aws s3 mb s3://loja</code> e o bucket passa a existir; digita
    <code>aws s3 ls</code> depois e ele está lá. O estado persiste entre um comando e o
    seguinte, os erros são os mesmos que a AWS devolveria, e <strong>nada custa dinheiro</strong>
    &mdash; não há conexão com nenhuma conta AWS real.
  </div>

  <a class="cta" href="/">Começar agora &mdash; grátis</a>

  <h2>Como funciona</h2>
  <p>Cada atividade é um problema de trabalho, não um comando solto: <em>&ldquo;o time precisa
  de um bucket para o site&rdquo;</em>, <em>&ldquo;um funcionário saiu, revogue o acesso&rdquo;</em>.
  Você lê o cenário, digita o comando e o simulador responde como a AWS responderia.</p>
  <p>Antes de cada comando novo há uma explicação de <strong>por que ele existe</strong> &mdash;
  não só o que digitar. E há dicas graduais: a resposta só aparece depois que as dicas acabam.</p>
  <p>Na trilha <strong>Diagnóstico</strong>, a infraestrutura chega quebrada e você precisa
  achar a causa nos <em>flow logs</em>, como num plantão de verdade.</p>

  <h2>As ${META.length} trilhas</h2>
  <table>
    <tr><th>Trilha</th><th>Sobre</th><th>Atividades</th></tr>
${linhas}
  </table>

  <h2>Para quem é</h2>
  <p>Para quem está estudando computação em nuvem, se preparando para certificação AWS, ou
  precisa usar a linha de comando no trabalho e cansou de copiar comando de tutorial sem
  entender. Também serve para quem já sabe: as trilhas avançadas cobrem
  <code>--query</code> (JMESPath), políticas IAM próprias e missões com poucas dicas.</p>

  <h2>Quanto custa</h2>
  <p>As trilhas de fundamentos &mdash; Primeiros passos, Linux essencial, JSON e YAML, S3, EC2 e
  IAM &mdash; são <strong>gratuitas</strong>, sem cartão e sem prazo. O restante do catálogo faz
  parte do plano Pro. Seu progresso salva no navegador mesmo sem conta.</p>

  <a class="cta" href="/">Abrir o terminal</a>

  <footer>
    CLImb &mdash; projeto independente e educativo, sem afiliação, patrocínio ou endosso da
    Amazon. &ldquo;AWS&rdquo; e &ldquo;Amazon Web Services&rdquo; são marcas registradas da
    Amazon.com, Inc. ou de suas afiliadas.<br>
    <a href="/">Início</a> &middot; <a href="/privacidade.html">Privacidade e termos</a>
  </footer>
</div>
</body>
</html>
`;

fs.writeFileSync(path.join(raiz, "sobre.html"), html);
console.log(`sobre.html gerado: ${TOTAL} atividades, ${META.length} trilhas listadas`);
