"use strict";
// ============================================================
// CLImb — s3-pastas.js
// O S3 com PASTA INTEIRA: `cp --recursive`, `rm --recursive`, os filtros
// `--exclude`/`--include`, o `sync --delete` e o `--dryrun`. É o 2º tema mais
// buscado sobre a CLI (pesquisa de 29/09/2026: autocompletar do Google e as
// perguntas mais votadas da tag aws-cli no Stack Overflow) e o simulador só
// copiava arquivo um por um.
//
// Fonte (29/09/2026): o AWS CLI 2.35.8 instalado, rodado com --dryrun sobre
// uma pasta de teste (sem rede):
//   - "(dryrun) upload: relatorios/2026-07.csv to s3://b/relatorios/2026-07.csv"
//     — o caminho local sai como você digitou, um arquivo por linha;
//   - `--exclude "*" --include "*.csv"`: os filtros valem NA ORDEM, o último
//     que casa decide; o `*` atravessa subpasta ("graficos/*" pega a pasta);
//   - o caminho que o filtro vê é relativo à pasta de origem.
// O `sync --delete` imprime "delete: s3://..." pra cada objeto que sumiu da
// origem (documentação do `aws s3 sync help`).
//
// Como encaixa: substitui cp/rm/sync do SERVICOS.s3 só quando a linha usa
// --recursive, filtros, --delete ou --dryrun (ou quando o sync precisa); o
// resto cai no handler de antes, intacto. A ORDEM dos filtros não sobrevive
// ao parsearArgs (flag repetida sobrescreve), então um embrulho do dispatcher
// guarda os tokens da linha pro handler ler.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.s3 || typeof executarComandoAwsBase !== "function") return;
  const S3 = SERVICOS.s3;
  const base = { cp: S3.cp, rm: S3.rm, sync: S3.sync };

  // ---------- a pasta de lab ----------
  const PASTA_LAB = {
    "fechamento-mensal/2026-07.csv": "mes,receita,despesa\n2026-07,48200,31950\n",
    "fechamento-mensal/2026-08.csv": "mes,receita,despesa\n2026-08,51730,33410\n",
    "fechamento-mensal/2026-09.csv": "mes,receita,despesa\n2026-09,50110,35020\n",
    "fechamento-mensal/rascunho.tmp": "(rascunho do editor — não é pra subir)\n",
    "fechamento-mensal/graficos/receita.png": "(imagem)\n",
  };
  if (typeof ARQUIVOS_LOCAIS !== "undefined") for (const [p, t] of Object.entries(PASTA_LAB)) ARQUIVOS_LOCAIS[p] = t.length;
  if (typeof ARQUIVOS_CONTEUDO !== "undefined") for (const [p, t] of Object.entries(PASTA_LAB)) ARQUIVOS_CONTEUDO[p] = t;

  // ---------- a ordem dos filtros ----------
  let tokensDaLinha = [];
  const alvo = typeof globalThis !== "undefined" ? globalThis : null;
  const disp = (alvo && alvo.executarComandoAwsBase) || executarComandoAwsBase;
  const envolvido = function (conta, linha) {
    try { tokensDaLinha = tokenizar(linha); } catch (e) { tokensDaLinha = []; }
    try { return disp(conta, linha); } finally { tokensDaLinha = []; }
  };
  if (alvo) alvo.executarComandoAwsBase = envolvido;
  try { executarComandoAwsBase = envolvido; } catch (e) { /* já coberto pelo global acima */ }

  function filtros() {
    const f = [];
    for (let i = 0; i < tokensDaLinha.length - 1; i++) {
      const t = tokensDaLinha[i];
      if (t === "--exclude" || t === "--include") f.push({ incluir: t === "--include", re: glob(tokensDaLinha[i + 1]) });
    }
    return f;
  }
  // fnmatch do Python (o que a CLI usa): * e ? atravessam a barra
  function glob(p) {
    let r = "";
    for (const ch of String(p)) r += ch === "*" ? ".*" : ch === "?" ? "." : ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    return new RegExp("^" + r + "$");
  }
  const passa = (rel, fs) => fs.reduce((ok, f) => (f.re.test(rel) ? f.incluir : ok), true);
  const ligado = (v) => v === true || v === "true";

  // ---------- os dois lados: pasta local ou prefixo s3:// ----------
  const semBarra = (p) => String(p).replace(/^\.\//, "").replace(/\/+$/, "");
  function noLocal(conta, pasta) {
    if (typeof noRelHome !== "function" || typeof resolver !== "function") return null;
    try { fsSeed(conta); return noEm(conta, resolver(pasta, conta.cwd || LAR)); } catch (e) { return null; }
  }
  function itensLocais(conta, pastaArg) {
    const pasta = semBarra(pastaArg);
    const itens = new Map();
    if (typeof ARQUIVOS_LOCAIS !== "undefined") {
      for (const [c, t] of Object.entries(ARQUIVOS_LOCAIS)) if (pasta === "" || pasta === "." ? true : c.indexOf(pasta + "/") === 0) itens.set(pasta === "" || pasta === "." ? c : c.slice(pasta.length + 1), t);
    }
    const no = noLocal(conta, pasta || ".");
    if (no && no.tipo === "dir") {
      (function andar(n, pre) {
        for (const [nome, f] of Object.entries(n.filhos || {})) {
          if (f.tipo === "dir") andar(f, pre + nome + "/");
          else if (!itens.has(pre + nome)) itens.set(pre + nome, String(f.conteudo || "").length);
        }
      })(no, "");
    }
    return itens;
  }
  function lado(conta, arg, operacao) {
    const uri = parsearUriS3(arg);
    if (uri) {
      const b = exigirBucket(conta, uri.bucket, operacao);
      const prefixo = uri.chave ? uri.chave.replace(/\/?$/, "/") : "";
      const itens = new Map();
      for (const [k, o] of Object.entries(b.objetos || {})) if (k.indexOf(prefixo) === 0 && k.length > prefixo.length) itens.set(k.slice(prefixo.length), o.tamanho);
      return { s3: true, b, bucket: uri.bucket, prefixo, itens, nome: (rel) => `s3://${uri.bucket}/${prefixo}${rel}` };
    }
    const pasta = semBarra(arg);
    return { s3: false, pasta, itens: itensLocais(conta, pasta), nome: (rel) => (pasta && pasta !== "." ? pasta + "/" : "") + rel };
  }
  // download de pasta: os arquivos aparecem no `ls` de verdade
  function gravarLocal(conta, caminho, texto) {
    const no = noLocal(conta, ".");
    if (!no) return;
    const partes = semBarra(caminho).split("/").filter(Boolean);
    let dir = noEm(conta, resolver(".", conta.cwd || LAR));
    for (let i = 0; i < partes.length - 1; i++) {
      dir.filhos[partes[i]] = dir.filhos[partes[i]] && dir.filhos[partes[i]].tipo === "dir" ? dir.filhos[partes[i]] : { tipo: "dir", modo: "755", filhos: {} };
      dir = dir.filhos[partes[i]];
    }
    dir.filhos[partes[partes.length - 1]] = { tipo: "arquivo", modo: "644", conteudo: texto };
  }
  function escrever(conta, dest, rel, tamanho, deOnde) {
    if (dest.s3) dest.b.objetos[dest.prefixo + rel] = { tamanho, enviadoEm: dataFormatada() };
    else gravarLocal(conta, dest.nome(rel), `(baixado de ${deOnde})\n`);
  }
  const verbo = (o, d) => (o.s3 && d.s3 ? "copy" : o.s3 ? "download" : "upload");

  // ---------- cp ----------
  S3.cp = (conta, pos, flags) => {
    const [origem, destino] = pos;
    const rec = ligado(flags.recursive), seco = ligado(flags.dryrun);
    if (!rec) {
      // pasta sem --recursive: o erro que todo mundo toma na primeira vez
      if (origem && destino && !parsearUriS3(origem) && parsearUriS3(destino) && !arquivoLocal(origem, conta) && itensLocais(conta, origem).size && semBarra(origem) !== "") {
        avisarClimb(`"${semBarra(origem)}" é uma PASTA. Sem --recursive o cp copia um arquivo só — pra pasta inteira: aws s3 cp ${semBarra(origem)} ${destino} --recursive`);
        throw new ErroCli(`upload failed: ${semBarra(origem)} to ${destino} [Errno 21] Is a directory: '${semBarra(origem)}'`);
      }
      if (!seco) return base.cp(conta, pos, flags);
      const saida = base.cp(JSON.parse(JSON.stringify(conta)), pos, flags);
      return String(saida).split("\n").map((l) => "(dryrun) " + l).join("\n");
    }
    if (!origem || !destino) throw new ErroCli("uso: aws s3 cp <origem> <destino> --recursive\nEx.: aws s3 cp fechamento-mensal s3://meu-bucket/fechamento --recursive");
    if (!parsearUriS3(origem) && !parsearUriS3(destino)) throw new ErroCli("uso: aws s3 cp <origem> <destino> — pelo menos um dos lados precisa ser um caminho s3://");
    const o = lado(conta, origem, "ListObjectsV2");
    if (!o.s3 && !o.itens.size) throw new ErroCli(`The user-provided path ${origem} does not exist.`);
    const d = lado(conta, destino, "PutObject");
    const fs = filtros();
    const linhas = [];
    for (const [rel, tam] of o.itens) {
      if (!passa(rel, fs)) continue;
      linhas.push(`${seco ? "(dryrun) " : ""}${verbo(o, d)}: ${o.nome(rel)} to ${d.nome(rel)}`);
      if (!seco) escrever(conta, d, rel, tam, o.nome(rel));
    }
    if (!linhas.length) avisarClimb(o.itens.size ? "Nada passou pelos filtros — confira o --exclude/--include (a ordem importa: o último que casa decide)." : "A origem está vazia: nada pra copiar.");
    else if (fs.length) avisarClimb("Os filtros valem NA ORDEM e o último que casa decide. Por isso \"só os .csv\" é --exclude \"*\" --include \"*.csv\": primeiro tira tudo, depois devolve o que interessa.");
    return linhas.join("\n");
  };

  // ---------- rm ----------
  S3.rm = (conta, pos, flags) => {
    const rec = ligado(flags.recursive), seco = ligado(flags.dryrun);
    if (!rec && !seco) {
      const uri = parsearUriS3(pos[0] || "");
      if (uri && !uri.chave) {
        avisarClimb(`Pra esvaziar o bucket (ou uma pasta dele) inteiro é --recursive: aws s3 rm s3://${uri.bucket} --recursive`);
      }
      return base.rm(conta, pos, flags);
    }
    if (!rec) { base.rm(JSON.parse(JSON.stringify(conta)), pos, flags); return `(dryrun) delete: ${pos[0]}`; }
    const uri = parsearUriS3(pos[0] || "");
    if (!uri) throw new ErroCli("uso: aws s3 rm s3://<bucket>[/prefixo] --recursive");
    const o = lado(conta, pos[0], "ListObjectsV2");
    const fs = filtros();
    const linhas = [];
    for (const rel of o.itens.keys()) {
      if (!passa(rel, fs)) continue;
      linhas.push(`${seco ? "(dryrun) " : ""}delete: ${o.nome(rel)}`);
      if (!seco) delete o.b.objetos[o.prefixo + rel];
    }
    if (!linhas.length) avisarClimb("Nada pra apagar com esse prefixo e esses filtros — a AWS também não imprime nada.");
    else if (!seco && !fs.length) avisarClimb("--recursive apaga TUDO debaixo do prefixo, sem perguntar e sem lixeira (a não ser que o bucket tenha versionamento). O --dryrun mostra a lista antes.");
    return linhas.join("\n");
  };

  // ---------- sync ----------
  // Manda só o que é novo ou mudou (aqui: tamanho diferente) — rodar duas
  // vezes seguidas não manda nada. Com --delete, apaga do destino o que
  // sumiu da origem.
  S3.sync = (conta, pos, flags) => {
    const [origem, destino] = pos;
    if (!origem || !destino) throw new ErroCli("uso: aws s3 sync <origem> <destino> [--delete] [--exclude ...]\nEx.: aws s3 sync ./site s3://meu-bucket");
    if (!parsearUriS3(origem) && !parsearUriS3(destino)) throw new ErroCli("uso: aws s3 sync <origem> <destino> — pelo menos um dos lados precisa ser um caminho s3://");
    const seco = ligado(flags.dryrun), apagar = ligado(flags.delete);
    const o = lado(conta, origem, "ListObjectsV2");
    if (!o.s3 && !o.itens.size) throw new ErroCli(`sync failed: a pasta local '${origem}' não existe ou está vazia. Digite 'ls' para ver o que existe.`);
    const d = lado(conta, destino, "ListObjectsV2");
    const fs = filtros();
    const linhas = [];
    let iguais = 0;
    for (const [rel, tam] of o.itens) {
      if (!passa(rel, fs)) continue;
      if (d.itens.has(rel) && d.itens.get(rel) === tam) { iguais++; continue; }
      linhas.push(`${seco ? "(dryrun) " : ""}${verbo(o, d)}: ${o.nome(rel)} to ${d.nome(rel)}`);
      if (!seco) escrever(conta, d, rel, tam, o.nome(rel));
    }
    const sumiram = [];
    if (apagar) {
      for (const rel of d.itens.keys()) {
        if (o.itens.has(rel) || !passa(rel, fs)) continue;
        sumiram.push(rel);
        linhas.push(`${seco ? "(dryrun) " : ""}delete: ${d.nome(rel)}`);
        if (!seco) { if (d.s3) delete d.b.objetos[d.prefixo + rel]; }
      }
    }
    if (seco && sumiram.length) avisarClimb(`Nada mudou ainda: é o ensaio. Sem o --dryrun, ${sumiram.length === 1 ? "este arquivo seria apagado" : "estes " + sumiram.length + " arquivos seriam apagados"} do destino. Olhar a lista antes é o hábito que evita apagar o bucket errado.`);
    else if (apagar && sumiram.length) avisarClimb("--delete deixa o destino IGUAL à origem: o que não existe mais na pasta sai do bucket. É o que tira a página velha do ar — e o que apaga tudo se você inverter origem e destino.");
    else if (!linhas.length && iguais) avisarClimb("Nada pra mandar: tudo já está igual no destino. O sync só envia o que é novo ou mudou — por isso ele é o comando de deploy, e o cp --recursive não.");
    else if (!apagar && d.s3 && [...d.itens.keys()].some((rel) => !o.itens.has(rel))) avisarClimb("O sync NÃO apaga do destino o que você tirou da pasta — o arquivo velho continua no bucket. Pra espelhar de verdade existe o --delete.");
    return linhas.join("\n");
  };

  // fsSeed: quem já jogava antes não tinha a pasta de lab no disco
  if (typeof fsSeed === "function") {
    const fsBase = fsSeed;
    fsSeed = function (conta) {
      fsBase(conta);
      try {
        const home = noEm(conta, "/home/ec2-user");
        if (home && home.tipo === "dir" && !home.filhos["fechamento-mensal"]) {
          const raiz = { tipo: "dir", modo: "755", filhos: {} };
          home.filhos["fechamento-mensal"] = raiz;
          for (const [p, t] of Object.entries(PASTA_LAB)) {
            const partes = p.split("/").slice(1);
            let dir = raiz;
            for (let i = 0; i < partes.length - 1; i++) dir = dir.filhos[partes[i]] = dir.filhos[partes[i]] || { tipo: "dir", modo: "755", filhos: {} };
            dir.filhos[partes[partes.length - 1]] = { tipo: "arquivo", modo: "644", conteudo: t };
          }
        }
      } catch (e) { /* o disco é conveniência */ }
    };
  }

  // ============================================================
  // MANUAIS + PORQUE
  // ============================================================
  if (typeof MANUAIS !== "undefined") {
    const junta = (k, txt) => { if (MANUAIS[k] && MANUAIS[k].indexOf(txt.slice(0, 30)) < 0) MANUAIS[k] += "\n\n" + txt; };
    const FILTROS = "FILTROS (cp/rm/sync)\n    --exclude \"<padrão>\"   tira o que casar\n    --include \"<padrão>\"   devolve o que casar\n    Valem NA ORDEM; o último que casa decide. * atravessa subpasta.\n    Só os .csv:  --exclude \"*\" --include \"*.csv\"\n    O caminho que o filtro vê é relativo à pasta de origem.\n\n--dryrun   mostra o que faria, sem fazer nada.";
    junta("s3.cp", "PASTA INTEIRA\n    aws s3 cp fechamento-mensal s3://meu-bucket/fechamento --recursive\n    aws s3 cp s3://meu-bucket/fechamento ./restaurado --recursive\n    Sem --recursive, apontar pra uma pasta dá \"Is a directory\".\n\n" + FILTROS);
    junta("s3.rm", "PREFIXO INTEIRO\n    aws s3 rm s3://meu-bucket/logs --recursive\n    aws s3 rm s3://meu-bucket --recursive       (esvazia o bucket)\n    Sem lixeira: rode antes com --dryrun.\n\n" + FILTROS);
    junta("s3.sync", "SÓ O QUE MUDOU\n    Rodar de novo não manda nada: o sync compara origem e destino e\n    envia só o que é novo ou mudou. Também funciona s3:// → s3:// e\n    s3:// → pasta local.\n\n--delete\n    Apaga do destino o que não existe mais na origem (espelho). Sem\n    ele, o arquivo que você tirou da pasta continua no bucket.\n    Cuidado com a ordem: sync <origem> <destino>. Invertido, o\n    --delete apaga o que você queria manter.\n\n" + FILTROS);
  }
  if (typeof PORQUE !== "undefined") Object.assign(PORQUE, {
    "s3.rm": PORQUE["s3.rm"] || "apaga objeto do bucket — um, ou um prefixo inteiro com --recursive.",
  });

  // ============================================================
  // ATIVIDADES — logo depois do sync na trilha de S3 (reforço junto da lição)
  // ============================================================
  if (typeof DESAFIOS === "undefined") return;
  function d(id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar) {
    return { id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar };
  }
  function at(ancora, novos) {
    const i = DESAFIOS.findIndex((x) => x.id === ancora);
    if (i < 0) { for (const n of novos) DESAFIOS.push(n); return; }
    DESAFIOS.splice(i + 1, 0, ...novos);
  }
  const objs = (c, b) => Object.keys(((((c.s3 || {}).buckets) || {})[b] || {}).objetos || {});
  const tem = (c, b, k) => objs(c, b).indexOf(k) >= 0;
  const flag = (cmd, n) => !!cmd && !!cmd.flags && (cmd.flags[n] === true || cmd.flags[n] === "true");
  const PASTA = "fechamento-mensal";

  at("ps3-sync1", [
    d("s3p-1", "s3", 2, 90, "A pasta do fechamento inteira",
      `A contabilidade guarda o fechamento de cada mês na pasta <b>${PASTA}</b> (com uma subpasta de gráficos). Crie o bucket <b>arquivo-contabil-2026</b> e mande a pasta INTEIRA pra dentro dele, no prefixo <b>fechamento/</b>. <small>(com o cp de sempre, apontar pra uma pasta dá "Is a directory")</small>`,
      ["O cp que você já conhece copia pasta com uma flag a mais.", "A flag é `--recursive`, no fim do cp que tem a pasta como origem e `s3://arquivo-contabil-2026/fechamento` como destino."],
      ["aws s3 mb s3://arquivo-contabil-2026", `aws s3 cp ${PASTA} s3://arquivo-contabil-2026/fechamento --recursive`],
      (c, cmd, ok) => ok && ehCmd(cmd, "s3", "cp") && flag(cmd, "recursive") && tem(c, "arquivo-contabil-2026", "fechamento/graficos/receita.png")),
    d("s3p-f1", "s3", 2, 80, "O notebook novo da contadora",
      "A contadora trocou de notebook e precisa da pasta de volta. Baixe o prefixo <b>fechamento/</b> do bucket <b>arquivo-contabil-2026</b> inteiro pra pasta local <b>restaurado</b> — e confira com <code>ls restaurado</code>.",
      ["É o mesmo cp com --recursive, só que com a origem no S3 e o destino local.", "Origem `s3://arquivo-contabil-2026/fechamento`, destino `restaurado`."],
      ["aws s3 cp s3://arquivo-contabil-2026/fechamento restaurado --recursive"],
      (c, cmd, ok) => ok && ehCmd(cmd, "s3", "cp") && flag(cmd, "recursive") && /^s3:\/\/arquivo-contabil-2026/.test(String((cmd.posicionais || [])[0] || ""))),
    d("s3p-2", "s3", 2, 90, "O rascunho não vai pra auditoria",
      `A auditoria fiscal pediu a pasta <b>${PASTA}</b> no bucket <b>auditoria-fiscal-set</b> — mas o <b>rascunho.tmp</b> do editor NÃO pode ir junto. Crie o bucket e mande a pasta sem os arquivos <b>.tmp</b>.`,
      ["O cp --recursive aceita um filtro que TIRA o que casar com um padrão.", "É `--exclude` com o padrão entre aspas: `\"*.tmp\"`."],
      ["aws s3 mb s3://auditoria-fiscal-set", `aws s3 cp ${PASTA} s3://auditoria-fiscal-set/ --recursive --exclude "*.tmp"`],
      (c, cmd, ok) => ok && ehCmd(cmd, "s3", "cp") && tem(c, "auditoria-fiscal-set", "2026-09.csv") && !objs(c, "auditoria-fiscal-set").some((k) => /\.tmp$/.test(k))),
    d("s3p-f2", "s3", 2, 90, "Só as planilhas",
      `O time de BI só quer as planilhas: crie o bucket <b>planilhas-contab-set</b> e mande da pasta <b>${PASTA}</b> <b>somente os .csv</b> — nada de gráfico, nada de rascunho. <small>(os filtros valem na ordem, e o último que casa decide)</small>`,
      ["Pensar ao contrário ajuda: primeiro tire TUDO, depois devolva só o que interessa.", "Dois filtros, nessa ordem: `--exclude \"*\"` e depois `--include \"*.csv\"`."],
      ["aws s3 mb s3://planilhas-contab-set", `aws s3 cp ${PASTA} s3://planilhas-contab-set/ --recursive --exclude "*" --include "*.csv"`],
      (c, cmd, ok) => ok && ehCmd(cmd, "s3", "cp") && objs(c, "planilhas-contab-set").length >= 3 && objs(c, "planilhas-contab-set").every((k) => /\.csv$/.test(k))),
    d("s3p-3", "s3", 2, 90, "A promoção que não sai do ar",
      "O site da loja está no bucket <b>vitrine-loja-set</b>: crie, publique a pasta <b>./site</b> com sync e simule a página velha subindo o <b>erro404.html</b> como <b>s3://vitrine-loja-set/promo-antiga.html</b>. Ela já foi apagada da pasta, mas o sync de sempre não tira do bucket. Sincronize de novo de um jeito que <b>apague do bucket</b> o que não existe mais na pasta.",
      ["O sync tem uma flag que deixa o destino IGUAL à origem — inclusive apagando.", "É `--delete`, no fim do mesmo sync da pasta ./site pro bucket da loja."],
      ["aws s3 mb s3://vitrine-loja-set", "aws s3 sync ./site s3://vitrine-loja-set", "aws s3 cp erro404.html s3://vitrine-loja-set/promo-antiga.html", "aws s3 sync ./site s3://vitrine-loja-set --delete"],
      (c, cmd, ok) => ok && ehCmd(cmd, "s3", "sync") && flag(cmd, "delete") && tem(c, "vitrine-loja-set", "index.html") && !tem(c, "vitrine-loja-set", "promo-antiga.html")),
    d("s3p-f3", "s3", 2, 90, "Ensaie antes de apagar",
      "No bucket de homologação <b>vitrine-homolog-set</b> a mesma coisa aconteceu. Crie, publique <b>./site</b>, suba o <b>erro404.html</b> como <b>promo-antiga.html</b> — e desta vez, antes de rodar o sync que apaga, veja <b>o que ele faria</b> sem mudar nada. <small>(é o hábito que evita apagar o bucket errado)</small>",
      ["Todo cp/rm/sync aceita uma flag de ensaio: mostra as linhas com \"(dryrun)\" e não mexe em nada.", "É `--dryrun`, junto do `--delete`, no sync da pasta ./site pro bucket de homologação."],
      ["aws s3 mb s3://vitrine-homolog-set", "aws s3 sync ./site s3://vitrine-homolog-set", "aws s3 cp erro404.html s3://vitrine-homolog-set/promo-antiga.html", "aws s3 sync ./site s3://vitrine-homolog-set --delete --dryrun"],
      (c, cmd, ok) => ok && ehCmd(cmd, "s3", "sync") && flag(cmd, "delete") && flag(cmd, "dryrun") && tem(c, "vitrine-homolog-set", "promo-antiga.html")),
    d("s3p-4", "s3", 2, 80, "Esvazie o prefixo de uma vez",
      "O fechamento de 2026 foi reprocessado e o prefixo <b>fechamento/</b> do bucket <b>arquivo-contabil-2026</b> precisa ser apagado inteiro antes de subir de novo. Apague tudo debaixo dele com UM comando.",
      ["O rm de sempre apaga um objeto; pra um prefixo inteiro é a mesma flag do cp de pasta.", "`aws s3 rm` com o caminho do prefixo e `--recursive`."],
      ["aws s3 rm s3://arquivo-contabil-2026/fechamento --recursive"],
      (c, cmd, ok) => ok && ehCmd(cmd, "s3", "rm") && flag(cmd, "recursive") && !!(((c.s3 || {}).buckets || {})["arquivo-contabil-2026"]) && !objs(c, "arquivo-contabil-2026").some((k) => k.indexOf("fechamento/") === 0)),
    d("s3p-f4", "s3", 2, 90, "Tire os gráficos, fique com as planilhas",
      "Na <b>auditoria-fiscal-set</b> só as planilhas interessam agora: apague do bucket <b>tudo que não for .csv</b>, deixando os .csv onde estão.",
      ["O rm --recursive aceita os mesmos filtros do cp.", "Filtre pra PROTEGER os .csv: `--exclude \"*.csv\"` no rm recursivo do bucket inteiro."],
      ["aws s3 rm s3://auditoria-fiscal-set --recursive --exclude \"*.csv\""],
      (c, cmd, ok) => ok && ehCmd(cmd, "s3", "rm") && flag(cmd, "recursive") && objs(c, "auditoria-fiscal-set").length >= 3 && objs(c, "auditoria-fiscal-set").every((k) => /\.csv$/.test(k))),
  ]);
})();
