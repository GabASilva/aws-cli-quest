"use strict";
// ============================================================
// CLImb — lib/indexnow.js
// Avisa o Bing (e o Yandex, Seznam, Naver — o protocolo é compartilhado) quando
// uma página pública nasce ou muda, em vez de esperar o rastreamento. O Bing
// alimenta o DuckDuckGo e a busca do ChatGPT; em 04/10/2026 o site não estava
// lá. O Google NÃO usa IndexNow: pra ele continuam o sitemap e a Inspeção de URL.
//
// COMO: depois do boot em produção, o servidor busca cada URL do sitemap NELE
// MESMO (localhost, mesma rota que o visitante usa), tira um hash do HTML e
// compara com o último aviso (gravado no volume, em indexnow.json). Só vai pro
// IndexNow o que é novo ou mudou — reenviar tudo a cada deploy é o que o
// protocolo pede pra não fazer.
//
// A CHAVE é pública por desenho: o IndexNow confere a posse do domínio buscando
// https://climb.dev.br/<chave>.txt. Não é segredo, pode ficar no código.
// ============================================================
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CHAVE = "2eebb7fd484de7ec77ae72702f8daa7a";
const ROTA_CHAVE = "/" + CHAVE + ".txt";
const ENDPOINT = "https://api.indexnow.org/indexnow";

const hash = (txt) => crypto.createHash("sha1").update(txt).digest("hex").slice(0, 16);

// O HTML tem pedaços que mudam a cada deploy sem a página mudar (?v=VERSAO nos
// links de js/css). Sem tirar isso, todo deploy reenviaria tudo.
const normalizar = (html) => String(html).replace(/\?v=[0-9a-f]+/g, "");

// estado.hashes[url] = hash do HTML; estado.mod[url] = dia em que esse hash
// mudou pela última vez. O sitemap usa o mod como <lastmod>: é a data em que o
// CONTEÚDO mudou, não a do deploy (data de deploy em tudo ensina o Google a
// ignorar o lastmod do site inteiro).
function lerEstado(arquivo) {
  try {
    const e = JSON.parse(fs.readFileSync(arquivo, "utf8"));
    e.hashes = e.hashes || {};
    // estado gravado antes do mod existir: tudo nasce na data do último aviso
    if (!e.mod) { e.mod = {}; const dia = String(e.em || "").slice(0, 10); if (dia) for (const u of Object.keys(e.hashes)) e.mod[u] = dia; }
    return e;
  } catch (e) { return { hashes: {}, mod: {} }; }
}

// Pro sitemap. Lido uma vez e guardado; avisarMudancas() atualiza.
let modEmMemoria = null;
function lastmods(dir) {
  if (modEmMemoria === null) modEmMemoria = dir ? lerEstado(path.join(dir, "indexnow.json")).mod : {};
  return modEmMemoria;
}

// urls: absolutas (https://climb.dev.br/...); porta: a do próprio servidor.
async function avisarMudancas({ urls, porta, dir, host, log }) {
  log = log || console.log;
  if (!dir || !urls.length) return;
  const arquivo = path.join(dir, "indexnow.json");
  const estado = lerEstado(arquivo);
  const novos = {};
  const mudaram = [];
  for (const u of urls) {
    const caminho = u.replace(/^https?:\/\/[^/]+/, "") || "/";
    try {
      const r = await fetch("http://127.0.0.1:" + porta + caminho, { headers: { "User-Agent": "climb-indexnow" } });
      if (!r.ok) continue; // página quebrada não é anunciada
      const h = hash(normalizar(await r.text()));
      novos[u] = h;
      if (estado.hashes[u] !== h) mudaram.push(u);
    } catch (e) { /* fica pra próxima vez */ }
  }
  if (!mudaram.length) { log("IndexNow: nada mudou desde o último aviso"); return; }
  // modo de teste (teste/indexnow.js): mostra o que iria, não envia nem grava
  if (process.env.INDEXNOW_SECO) { log("IndexNow (seco): " + mudaram.length + " URL(s)"); return mudaram; }
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key: CHAVE, keyLocation: "https://" + host + ROTA_CHAVE, urlList: mudaram.slice(0, 10000) }),
    });
    // 200 e 202 = recebido. Só grava o estado se foi aceito: senão tenta de novo no próximo boot.
    if (r.status === 200 || r.status === 202) {
      const hoje = new Date().toISOString().slice(0, 10);
      const mod = Object.assign({}, estado.mod);
      for (const u of mudaram) mod[u] = hoje;
      fs.writeFileSync(arquivo, JSON.stringify({ hashes: Object.assign({}, estado.hashes, novos), mod, em: new Date().toISOString() }));
      modEmMemoria = mod;
      log("IndexNow: " + mudaram.length + " URL(s) avisada(s) (HTTP " + r.status + ")");
    } else {
      log("IndexNow: recusado, HTTP " + r.status + " " + (await r.text()).slice(0, 200));
    }
  } catch (e) {
    log("IndexNow: falhou (" + e.message + "), tenta no próximo boot");
  }
}

module.exports = { CHAVE, ROTA_CHAVE, avisarMudancas, lastmods };
