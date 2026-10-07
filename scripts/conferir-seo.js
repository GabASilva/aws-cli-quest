"use strict";
// Confere as páginas do sitemap contra o que o Bing Webmaster acusa (07/10/2026):
// <title> até 70 caracteres, meta description entre 25 e 160, e UM <h1>.
// Uso: com o servidor rodando (node servidor.js 8741), `node scripts/conferir-seo.js [porta]`.
// A home é conferida nas duas formas: com a capa (visitante novo, robôs) e sem.
const porta = process.argv[2] || "8741";
const local = `http://localhost:${porta}`;
const texto = (s) => s.replace(/&[a-z#0-9]+;/gi, "x");

async function conferir(url, cookie) {
  const h = await (await fetch(url, { headers: cookie ? { cookie } : {} })).text();
  const d = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  const t = (h.match(/<title>([^<]*)/) || [])[1] || "";
  const h1 = (h.match(/<h1[\s>]/g) || []).length;
  const prob = [];
  if (!d) prob.push("sem description");
  else if (texto(d).length > 160 || texto(d).length < 25) prob.push(`description com ${texto(d).length}`);
  if (!t) prob.push("sem title");
  else if (texto(t).length > 70) prob.push(`title com ${texto(t).length}`);
  if (h1 !== 1) prob.push(`${h1} h1`);
  return prob;
}

(async () => {
  const sm = await (await fetch(`${local}/sitemap.xml`)).text();
  const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, local));
  let ruins = 0;
  for (const u of urls) {
    const casos = u === `${local}/` ? [null, "climb_capa=1"] : [null];
    for (const c of casos) {
      const prob = await conferir(u, c);
      if (prob.length) { ruins++; console.log(u.replace(local, "") + (c ? " (sem capa)" : ""), "→", prob.join(", ")); }
    }
  }
  console.log(ruins ? `\n${ruins} página(s) com problema de ${urls.length}.` : `Tudo certo: ${urls.length} páginas.`);
  process.exit(ruins ? 1 : 0);
})().catch((e) => { console.error("Servidor rodando na porta " + porta + "?", e.message); process.exit(2); });
