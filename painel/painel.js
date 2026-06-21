"use strict";
// ============================================================
// CLImb — painel/painel.js  (RODA SÓ NA SUA MÁQUINA)
// Mini-servidor local que serve o painel de admin e faz PROXY pra API de
// admin do servidor (https://...). O ADMIN_TOKEN fica AQUI (no seu PC),
// nunca vai pro navegador. A comunicação com o servidor é HTTPS (cifrada).
//
// Como rodar:
//   ADMIN_TOKEN=seu-segredo  node painel/painel.js
//   (ou crie painel/config.json: { "ADMIN_TOKEN": "...", "URL_BASE": "https://aws-cli-quest.fly.dev" })
// Depois abra http://localhost:7077 no navegador.
// ============================================================
const http = require("http");
const fs = require("fs");
const path = require("path");

function lerConfig() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8")); } catch (e) { /* sem arquivo, ok */ }
  return {
    ADMIN_TOKEN: process.env.ADMIN_TOKEN || cfg.ADMIN_TOKEN || "",
    URL_BASE: (process.env.URL_BASE || cfg.URL_BASE || "https://aws-cli-quest.fly.dev").replace(/\/+$/, ""),
    PORTA: Number(process.env.PAINEL_PORTA || cfg.PORTA || 7077),
  };
}
const CFG = lerConfig();

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
    console.log("   Abra:    http://localhost:" + CFG.PORTA);
    console.log("   Servidor: " + CFG.URL_BASE);
    console.log("   (token carregado, fica só aqui; a conexão com o servidor é HTTPS)\n");
  });
