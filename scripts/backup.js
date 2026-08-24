"use strict";
// Cópia do banco para FORA do Fly.
//
// O QUE JÁ EXISTE: o Fly tira snapshot diário do volume. Isso cobre corrupção
// e erro de operação, mas mora todo dentro da mesma conta — se a conta tiver
// problema, ou se um estrago só for percebido depois da retenção, não há de
// onde voltar. Este script resolve isso guardando uma cópia na SUA máquina.
//
// USO:
//   set ADMIN_TOKEN=...   (PowerShell: $env:ADMIN_TOKEN="...")
//   node scripts/backup.js
//
// Opcional:
//   node scripts/backup.js --url http://localhost:8899   (backup do local)
//   node scripts/backup.js --manter 30                   (quantos guardar)
//
// PRIVACIDADE: o arquivo contém e-mails dos usuários e hashes de senha. Ele é
// salvo em backups/, que está no .gitignore — nunca deve ir para o repositório,
// que é público. Guarde num lugar de confiança.

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const raiz = path.join(__dirname, "..");
const args = process.argv.slice(2);
const pegar = (nome, padrao) => {
  const i = args.indexOf("--" + nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};

const URL_BASE = pegar("url", "https://climb.dev.br").replace(/\/+$/, "");
const MANTER = parseInt(pegar("manter", "30"), 10);
const TOKEN = process.env.ADMIN_TOKEN || "";
const DESTINO = path.join(raiz, "backups");

if (!TOKEN) {
  console.error("Falta o ADMIN_TOKEN.");
  console.error("  PowerShell:  $env:ADMIN_TOKEN=\"seu-token\"");
  console.error("  Git Bash:    export ADMIN_TOKEN=seu-token");
  console.error("\nÉ o mesmo segredo que o painel de admin usa (flyctl secrets list -a aws-cli-quest).");
  process.exit(1);
}

function buscar(url) {
  return new Promise((ok, erro) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url + "/api/admin/backup", { headers: { "x-admin-token": TOKEN } }, (res) => {
      let corpo = "";
      res.on("data", (c) => (corpo += c));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          return erro(new Error(`HTTP ${res.statusCode}: ${corpo.slice(0, 160)}`));
        }
        ok(corpo);
      });
    });
    req.on("error", erro);
    req.setTimeout(60000, () => { req.destroy(); erro(new Error("tempo esgotado (60s)")); });
  });
}

(async () => {
  console.log(`Buscando backup de ${URL_BASE} …`);
  let corpo;
  try {
    corpo = await buscar(URL_BASE);
  } catch (e) {
    console.error("Falhou: " + e.message);
    process.exit(1);
  }

  // Confere que veio um banco de verdade antes de gravar. Sem isto, uma
  // resposta de erro em JSON viraria um "backup" vazio que só se descobre
  // inútil no dia em que precisar dele.
  let bd;
  try { bd = JSON.parse(corpo); } catch (e) {
    console.error("A resposta não é JSON válido — nada foi gravado.");
    process.exit(1);
  }
  const nUsuarios = Object.keys(bd.usuarios || {}).length;
  if (!bd.usuarios || nUsuarios === 0) {
    console.error("O backup veio sem usuários. Isso não parece certo — nada foi gravado.");
    console.error("Chaves recebidas: " + Object.keys(bd).join(", "));
    process.exit(1);
  }

  fs.mkdirSync(DESTINO, { recursive: true });
  const carimbo = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const arquivo = path.join(DESTINO, `climb-${carimbo}.json`);
  fs.writeFileSync(arquivo, corpo);

  const kb = Math.round(Buffer.byteLength(corpo) / 1024);
  console.log(`OK: ${path.relative(raiz, arquivo)}  (${kb} KB, ${nUsuarios} usuários)`);

  // Rotação: guarda os N mais recentes.
  const antigos = fs.readdirSync(DESTINO)
    .filter((f) => /^climb-.*\.json$/.test(f))
    .sort()
    .reverse()
    .slice(MANTER);
  for (const f of antigos) {
    fs.unlinkSync(path.join(DESTINO, f));
    console.log("  removido (antigo): " + f);
  }
  const total = fs.readdirSync(DESTINO).filter((f) => /^climb-.*\.json$/.test(f)).length;
  console.log(`${total} backup(s) guardado(s) em backups/`);
})();
