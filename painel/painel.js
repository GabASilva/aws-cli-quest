"use strict";
// ============================================================
// CLImb — painel/painel.js  (RODA SÓ NA SUA MÁQUINA)
// Mini-servidor local que serve o painel de admin e faz PROXY pra API de
// admin do servidor (https://...). O ADMIN_TOKEN fica AQUI (no seu PC),
// nunca vai pro navegador. A comunicação com o servidor é HTTPS (cifrada).
//
// Como rodar:
//   ADMIN_TOKEN=seu-segredo  node painel/painel.js
//   (ou crie painel/config.json: { "ADMIN_TOKEN": "...", "URL_BASE": "https://climb.dev.br" })
// Depois abra http://localhost:7077 no navegador.
// ============================================================
const http = require("http");
const fs = require("fs");
const path = require("path");

function lerConfig() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8")); } catch (e) { /* sem arquivo, ok */ }
  const doAmbiente = process.env.ADMIN_TOKEN || "";
  const doArquivo = cfg.ADMIN_TOKEN || "";
  return {
    ADMIN_TOKEN: doAmbiente || doArquivo,
    // De ONDE veio importa: a variável de ambiente VENCE o arquivo, e um
    // terminal aberto antes de ela ser apagada continua carregando o valor
    // velho em memória. Isso já custou uma hora de depuração: o painel subia
    // dizendo só "token carregado" e devolvia 403 em toda tela.
    ORIGEM: doAmbiente ? "variável de ambiente" : (doArquivo ? "painel/config.json" : "(nenhuma)"),
    DISCORDAM: !!(doAmbiente && doArquivo && doAmbiente !== doArquivo),
    URL_BASE: (process.env.URL_BASE || cfg.URL_BASE || "https://climb.dev.br").replace(/\/+$/, ""),
    PORTA: Number(process.env.PAINEL_PORTA || cfg.PORTA || 7077),
  };
}
// Impressão digital do token: 8 hex de um SHA-256. Não revela o segredo e
// deixa comparar duas execuções ("é o mesmo de ontem?") num relance.
function digital(t) {
  return require("crypto").createHash("sha256").update(t).digest("hex").slice(0, 8);
}

const CFG = lerConfig();

// Pergunta ao servidor se o token vale, já no boot. Sem isto, token errado só
// aparece quando você clica em alguma coisa e leva 403 sem explicação nenhuma.
function conferirToken() {
  // usa o fetch global (mesmo do proxy abaixo) — o arquivo não importa https
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  fetch(CFG.URL_BASE + "/api/admin/resumo", {
    headers: { "X-Admin-Token": CFG.ADMIN_TOKEN },
    signal: ctrl.signal,
  }).then((r) => {
    clearTimeout(t);
    if (r.status === 200) { console.log("   Servidor aceitou o token.\n"); return; }
    if (r.status === 403) {
      console.log("");
      console.log("   >> O SERVIDOR RECUSOU ESTE TOKEN (403).");
      console.log("      O painel abre, mas nenhuma tela vai carregar.");
      console.log("      Acerte os dois lados com o mesmo valor:");
      console.log("        flyctl secrets set ADMIN_TOKEN=<valor> -a aws-cli-quest\n");
      return;
    }
    console.log("   Servidor respondeu " + r.status + " na checagem.\n");
  }).catch((err) => {
    clearTimeout(t);
    const q = err && err.name === "AbortError" ? "expirou (servidor acordando?)" : err.message;
    console.log("   (não consegui conferir o token agora: " + q + ")\n");
  });
}

if (!CFG.ADMIN_TOKEN || CFG.ADMIN_TOKEN.length < 16) {
  console.error("\n⚠️  Falta o ADMIN_TOKEN (>= 16 caracteres).");
  console.error("   Defina por env:   ADMIN_TOKEN=seu-segredo node painel/painel.js");
  console.error("   ou crie painel/config.json com { \"ADMIN_TOKEN\": \"...\" }.\n");
  console.error("   E no servidor:    flyctl secrets set ADMIN_TOKEN=seu-segredo -a aws-cli-quest\n");
  process.exit(1);
}

function lerCorpo(req) {
  return new Promise((resolve) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => resolve(d)); req.on("error", () => resolve("")); });
}

http
  .createServer(async (req, res) => {
    const u = new URL(req.url, "http://localhost");
    // Painel (HTML) — só servimos pra localhost
    if (u.pathname === "/" || u.pathname === "/index.html") {
      try {
        const html = fs.readFileSync(path.join(__dirname, "index.html"));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(html);
      } catch (e) { res.writeHead(500); return res.end("painel/index.html não encontrado"); }
    }
    // Proxy autenticado pra API de admin (injeta o token aqui, não no navegador)
    if (u.pathname.startsWith("/admin/")) {
      const alvo = CFG.URL_BASE + "/api/admin/" + u.pathname.slice("/admin/".length) + (u.search || "");
      const corpo = (req.method === "POST" || req.method === "DELETE") ? await lerCorpo(req) : undefined;
      try {
        const r = await fetch(alvo, {
          method: req.method,
          headers: { "Content-Type": "application/json", "X-Admin-Token": CFG.ADMIN_TOKEN },
          body: corpo,
        });
        const txt = await r.text();
        res.writeHead(r.status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(txt);
      } catch (e) {
        res.writeHead(502, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ erro: "Não consegui falar com o servidor: " + e.message }));
      }
    }
    res.writeHead(404); res.end("not found");
  })
  .listen(CFG.PORTA, "127.0.0.1", () => {
    console.log("\n🛠️  Painel de admin do CLImb rodando — SÓ neste computador.");
    console.log("   Abra:     http://localhost:" + CFG.PORTA);
    console.log("   Servidor: " + CFG.URL_BASE);
    console.log("   Token:    " + CFG.ORIGEM + "  ·  impressão " + digital(CFG.ADMIN_TOKEN));
    if (CFG.DISCORDAM) {
      console.log("");
      console.log("   >> A variável de ambiente e o config.json têm tokens DIFERENTES,");
      console.log("      e a variável VENCE. Se o painel der 403, é isto. Para limpar:");
      console.log("        [Environment]::SetEnvironmentVariable(\"ADMIN_TOKEN\", $null, \"User\")");
      console.log("      e abra um terminal NOVO (o atual guarda o valor antigo em memória).");
    }
    conferirToken();
  });
