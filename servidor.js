"use strict";
// Mini servidor estático pra desenvolvimento (node servidor.js [porta]).
// Serve a própria pasta do projeto — sem dependências.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORTA = parseInt(process.argv[2] || "8741", 10);
const RAIZ = __dirname;

const MIMES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const relativo = url === "/" ? "index.html" : url.replace(/^\/+/, "");
  const arquivo = path.normalize(path.join(RAIZ, relativo));
  if (!arquivo.startsWith(RAIZ) || relativo.includes("\0")) {
    res.writeHead(403);
    res.end("403");
    return;
  }
  fs.readFile(arquivo, (erro, conteudo) => {
    if (erro) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 — " + relativo);
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIMES[path.extname(arquivo).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(conteudo);
  });
}).listen(PORTA, () => console.log(`AWS CLI Quest no ar: http://localhost:${PORTA}`));
