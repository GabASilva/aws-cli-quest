"use strict";
// ============================================================
// AWS CLI Quest — linux-lab.js
// Trilha "🐧 Linux essencial": como a AWS roda em Linux, aqui você aprende
// os comandos de shell que todo mundo de cloud usa, num SISTEMA DE ARQUIVOS
// simulado de verdade (com diretórios, navegação, permissões e arquivos).
//   pwd, ls, cd, mkdir, touch, cat, echo >, cp, mv, rm, chmod, grep, wc, man
//
// ADITIVO: faz wrap da global executarLinha (por cima do setup-lab). Os comandos
// Linux agem sobre jogo.conta.fs (persiste/sincroniza). Não toca app.js/jogo.js.
// ============================================================

const LAR = "/home/ec2-user";

function semearArvore() {
  const raiz = {};
  function por(caminho, conteudo, modo) {
    const partes = caminho.split("/");
    let filhos = raiz;
    for (let i = 0; i < partes.length - 1; i++) {
      const d = partes[i];
      if (!filhos[d]) filhos[d] = { tipo: "dir", modo: "755", filhos: {} };
      filhos = filhos[d].filhos;
    }
    const nome = partes[partes.length - 1];
    filhos[nome] = { tipo: "arquivo", conteudo: conteudo !== undefined ? conteudo : "(arquivo de exemplo)\n", modo: modo || "644" };
  }
  // mesma lista que o 'aws s3 cp' enxerga, pra o 'ls' bater com os desafios
  if (typeof ARQUIVOS_LOCAIS !== "undefined") {
    for (const p of Object.keys(ARQUIVOS_LOCAIS)) por(p);
  }
  // conteúdos e arquivos próprios do tutorial de Linux
  por("relatorio.csv", "data,valor\n2026-01,1200\n2026-02,1850\n");
  por("notas.txt", "Estudar AWS CLI\nFazer o lab de IAM\nRevisar permissoes\n");
  por("labsuser.pem", "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n", "644");
  por("logs/app.log",
    "INFO servidor iniciado\n" +
    "INFO conexao recebida\n" +
    "erro: falha ao ler config\n" +
    "INFO tentando de novo\n" +
    "erro: timeout no banco\n" +
    "INFO finalizado\n");
  if (!raiz["projetos"]) raiz["projetos"] = { tipo: "dir", modo: "755", filhos: { "leiame.txt": { tipo: "arquivo", conteudo: "Coloque seus projetos aqui.\n", modo: "644" } } };
  return raiz;
}

// ---------- Sistema de arquivos ----------
function fsSeed(conta) {
  if (!conta.fs) {
    conta.fs = { tipo: "dir", modo: "755", filhos: { home: { tipo: "dir", modo: "755", filhos: { "ec2-user": { tipo: "dir", modo: "755", filhos: semearArvore() } } } } };
  }
  if (!conta.cwd) conta.cwd = LAR;
}

function resolver(p, cwd) {
  let base;
  if (!p || p === "~") base = LAR;
  else if (p.startsWith("~/")) base = LAR + p.slice(1);
  else if (p.startsWith("/")) base = p;
  else base = cwd + "/" + p;
  const pilha = [];
  for (const seg of base.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") { pilha.pop(); continue; }
    pilha.push(seg);
  }
  return "/" + pilha.join("/");
}

function noEm(conta, abs) {
  if (abs === "/" || abs === "") return conta.fs;
  let no = conta.fs;
  for (const seg of abs.split("/").filter(Boolean)) {
    if (!no || no.tipo !== "dir" || !no.filhos[seg]) return null;
    no = no.filhos[seg];
  }
  return no;
}

function pai(abs) {
  const partes = abs.split("/").filter(Boolean);
  const nome = partes.pop();
  return { paiAbs: "/" + partes.join("/"), nome };
}

// helper pros validadores: nó a partir de um caminho relativo à home
function noRelHome(conta, rel) {
  fsSeed(conta);
  return noEm(conta, resolver(rel, LAR));
}

// ---------- Erros e formatação ----------
class ErroLinux extends Error {}

function octRwx(oct) {
  const m = { "0": "---", "1": "--x", "2": "-w-", "3": "-wx", "4": "r--", "5": "r-x", "6": "rw-", "7": "rwx" };
  return String(oct).padStart(3, "0").slice(-3).split("").map((d) => m[d] || "---").join("");
}
function modoLongo(no) {
  return (no.tipo === "dir" ? "d" : "-") + octRwx(no.modo || (no.tipo === "dir" ? "755" : "644"));
}
function tamanho(no) {
  return no.tipo === "dir" ? 4096 : (no.conteudo || "").length;
}

// ---------- Tokenizador simples (respeita aspas) ----------
function tokensLinux(s) {
  const out = [];
  let atual = "", aspas = null, tem = false;
  for (const ch of s) {
    if (aspas) { if (ch === aspas) aspas = null; else atual += ch; }
    else if (ch === '"' || ch === "'") { aspas = ch; tem = true; }
    else if (/\s/.test(ch)) { if (atual || tem) { out.push(atual); atual = ""; tem = false; } }
    else atual += ch;
  }
  if (atual || tem) out.push(atual);
  return out;
}

// ---------- Comandos ----------
const COMANDOS_LINUX = {
  pwd: (conta) => conta.cwd,

  whoami: () => "ec2-user",

  ls: (conta, args) => {
    const longo = args.includes("-l") || args.includes("-la") || args.includes("-al");
    const alvoArg = args.find((a) => !a.startsWith("-"));
    const abs = resolver(alvoArg || ".", conta.cwd);
    const no = noEm(conta, abs);
    if (!no) throw new ErroLinux(`ls: não foi possível acessar '${alvoArg}': Arquivo ou diretório inexistente`);
    if (no.tipo === "arquivo") return alvoArg;
    const nomes = Object.keys(no.filhos).sort();
    // arquivos criados via redirecionamento do aws ">" também aparecem
    const salvos = abs === LAR ? Object.keys(conta.arquivosSalvos || {}) : [];
    if (longo) {
      const linhas = nomes.map((n) => {
        const f = no.filhos[n];
        return `${modoLongo(f)} 1 ec2-user ec2-user ${String(tamanho(f)).padStart(6)} jun 15 12:00 ${n}${f.tipo === "dir" ? "/" : ""}`;
      });
      return linhas.concat(salvos.map((n) => `-rw-r--r-- 1 ec2-user ec2-user ${String((conta.arquivosSalvos[n] || "").length).padStart(6)} jun 15 12:00 ${n}`)).join("\n") || "(vazio)";
    }
    const itens = nomes.map((n) => (no.filhos[n].tipo === "dir" ? n + "/" : n)).concat(salvos);
    return itens.join("   ") || "(vazio)";
  },

  cd: (conta, args) => {
    const abs = resolver(args[0] || "~", conta.cwd);
    const no = noEm(conta, abs);
    if (!no) throw new ErroLinux(`cd: ${args[0]}: Arquivo ou diretório inexistente`);
    if (no.tipo !== "dir") throw new ErroLinux(`cd: ${args[0]}: Não é um diretório`);
    conta.cwd = abs;
    return "";
  },

  mkdir: (conta, args) => {
    const comP = args.includes("-p");
    const alvo = args.find((a) => !a.startsWith("-"));
    if (!alvo) throw new ErroLinux("mkdir: faltou o nome do diretório (uso: mkdir <nome>)");
    const abs = resolver(alvo, conta.cwd);
    if (comP) {
      // -p cria toda a árvore de diretórios que faltar (e não reclama se já existe)
      let no = conta.fs;
      for (const seg of abs.split("/").filter(Boolean)) {
        if (!no.filhos[seg]) no.filhos[seg] = { tipo: "dir", modo: "755", filhos: {} };
        else if (no.filhos[seg].tipo !== "dir") throw new ErroLinux(`mkdir: '${alvo}': o caminho tem um arquivo no lugar de um diretório`);
        no = no.filhos[seg];
      }
      return "";
    }
    const { paiAbs, nome } = pai(abs);
    const p = noEm(conta, paiAbs);
    if (!p || p.tipo !== "dir") throw new ErroLinux(`mkdir: não é possível criar o diretório '${alvo}': caminho inexistente`);
    if (p.filhos[nome]) throw new ErroLinux(`mkdir: não é possível criar o diretório '${alvo}': Arquivo existe`);
    p.filhos[nome] = { tipo: "dir", modo: "755", filhos: {} };
    return "";
  },

  touch: (conta, args) => {
    const alvo = args.find((a) => !a.startsWith("-"));
    if (!alvo) throw new ErroLinux("touch: faltou o nome do arquivo");
    const abs = resolver(alvo, conta.cwd);
    const { paiAbs, nome } = pai(abs);
    const p = noEm(conta, paiAbs);
    if (!p || p.tipo !== "dir") throw new ErroLinux(`touch: não foi possível tocar em '${alvo}': caminho inexistente`);
    if (!p.filhos[nome]) p.filhos[nome] = { tipo: "arquivo", conteudo: "", modo: "644" };
    return "";
  },

  cat: (conta, args) => {
    const alvo = args.find((a) => !a.startsWith("-"));
    if (!alvo) throw new ErroLinux("cat: faltou o nome do arquivo");
    const no = noEm(conta, resolver(alvo, conta.cwd));
    if (no && no.tipo === "arquivo") return no.conteudo.replace(/\n$/, "");
    if (no && no.tipo === "dir") throw new ErroLinux(`cat: ${alvo}: É um diretório`);
    const salvo = (conta.arquivosSalvos || {})[alvo];
    if (salvo !== undefined) return salvo;
    throw new ErroLinux(`cat: ${alvo}: Arquivo ou diretório inexistente`);
  },

  echo: (conta, args, redir, alvo) => {
    const texto = args.join(" ");
    if (!redir) return texto;
    const abs = resolver(alvo, conta.cwd);
    const { paiAbs, nome } = pai(abs);
    const p = noEm(conta, paiAbs);
    if (!p || p.tipo !== "dir") throw new ErroLinux(`bash: ${alvo}: caminho inexistente`);
    const existente = p.filhos[nome];
    const anterior = redir === ">>" && existente && existente.tipo === "arquivo" ? existente.conteudo : "";
    p.filhos[nome] = { tipo: "arquivo", conteudo: anterior + texto + "\n", modo: "644" };
    return "";
  },

  rm: (conta, args) => {
    const rec = args.includes("-r") || args.includes("-rf") || args.includes("-fr");
    const alvo = args.find((a) => !a.startsWith("-"));
    if (!alvo) throw new ErroLinux("rm: faltou o nome do arquivo");
    const abs = resolver(alvo, conta.cwd);
    const { paiAbs, nome } = pai(abs);
    const p = noEm(conta, paiAbs);
    if (!p || !p.filhos[nome]) throw new ErroLinux(`rm: não foi possível remover '${alvo}': Arquivo ou diretório inexistente`);
    if (p.filhos[nome].tipo === "dir" && !rec) throw new ErroLinux(`rm: não foi possível remover '${alvo}': É um diretório (use -r pra apagar pasta)`);
    delete p.filhos[nome];
    return "";
  },

  cp: (conta, args) => {
    const reais = args.filter((a) => !a.startsWith("-"));
    if (reais.length < 2) throw new ErroLinux("cp: uso: cp <origem> <destino>");
    const origem = noEm(conta, resolver(reais[0], conta.cwd));
    if (!origem || origem.tipo !== "arquivo") throw new ErroLinux(`cp: não foi possível abrir '${reais[0]}': arquivo inexistente`);
    let destAbs = resolver(reais[1], conta.cwd);
    const destNo = noEm(conta, destAbs);
    if (destNo && destNo.tipo === "dir") destAbs = destAbs + "/" + reais[0].split("/").pop();
    const { paiAbs, nome } = pai(destAbs);
    const p = noEm(conta, paiAbs);
    if (!p || p.tipo !== "dir") throw new ErroLinux(`cp: destino '${reais[1]}' inexistente`);
    p.filhos[nome] = { tipo: "arquivo", conteudo: origem.conteudo, modo: origem.modo };
    return "";
  },

  mv: (conta, args) => {
    const reais = args.filter((a) => !a.startsWith("-"));
    if (reais.length < 2) throw new ErroLinux("mv: uso: mv <origem> <destino>");
    const origemAbs = resolver(reais[0], conta.cwd);
    const origem = noEm(conta, origemAbs);
    if (!origem) throw new ErroLinux(`mv: não foi possível mover '${reais[0]}': arquivo inexistente`);
    let destAbs = resolver(reais[1], conta.cwd);
    const destNo = noEm(conta, destAbs);
    if (destNo && destNo.tipo === "dir") destAbs = destAbs + "/" + reais[0].split("/").pop();
    const dp = pai(destAbs);
    const pDest = noEm(conta, dp.paiAbs);
    if (!pDest || pDest.tipo !== "dir") throw new ErroLinux(`mv: destino '${reais[1]}' inexistente`);
    pDest.filhos[dp.nome] = origem;
    const op = pai(origemAbs);
    delete noEm(conta, op.paiAbs).filhos[op.nome];
    return "";
  },

  chmod: (conta, args) => {
    const reais = args.filter((a) => !a.startsWith("-"));
    const modo = reais[0];
    const alvo = reais[1];
    if (!/^[0-7]{3}$/.test(modo) || !alvo) throw new ErroLinux("chmod: uso: chmod <NNN> <arquivo>  (ex.: chmod 400 labsuser.pem)");
    const no = noEm(conta, resolver(alvo, conta.cwd));
    if (!no) throw new ErroLinux(`chmod: não foi possível acessar '${alvo}': Arquivo ou diretório inexistente`);
    no.modo = modo;
    return "";
  },

  grep: (conta, args) => {
    const reais = args.filter((a) => !a.startsWith("-"));
    if (reais.length < 2) throw new ErroLinux("grep: uso: grep <padrão> <arquivo>");
    const padrao = reais[0];
    const no = noEm(conta, resolver(reais[1], conta.cwd));
    if (!no || no.tipo !== "arquivo") throw new ErroLinux(`grep: ${reais[1]}: Arquivo ou diretório inexistente`);
    const linhas = no.conteudo.split("\n").filter((l) => l.includes(padrao));
    return linhas.join("\n");
  },

  head: (conta, args) => {
    let n = 10;
    const iN = args.indexOf("-n");
    if (iN >= 0) n = parseInt(args[iN + 1], 10) || 10;
    const alvo = args.filter((a) => !a.startsWith("-") && !/^\d+$/.test(a))[0];
    const no = noEm(conta, resolver(alvo, conta.cwd));
    if (!no || no.tipo !== "arquivo") throw new ErroLinux(`head: ${alvo}: Arquivo ou diretório inexistente`);
    return no.conteudo.split("\n").slice(0, n).join("\n");
  },

  wc: (conta, args) => {
    const soLinhas = args.includes("-l");
    const alvo = args.find((a) => !a.startsWith("-"));
    const no = noEm(conta, resolver(alvo, conta.cwd));
    if (!no || no.tipo !== "arquivo") throw new ErroLinux(`wc: ${alvo}: Arquivo ou diretório inexistente`);
    const txt = no.conteudo.replace(/\n$/, "");
    const linhas = txt === "" ? 0 : txt.split("\n").length;
    if (soLinhas) return `${linhas} ${alvo}`;
    const palavras = txt.split(/\s+/).filter(Boolean).length;
    return `${linhas} ${palavras} ${no.conteudo.length} ${alvo}`;
  },

  man: (conta, args) => {
    const cmd = args[0];
    const M = {
      ls: "ls — lista o conteúdo de um diretório. Opção -l mostra detalhes (permissões, tamanho).",
      cd: "cd — muda de diretório. 'cd ..' sobe um nível, 'cd ~' vai pra sua home.",
      pwd: "pwd — mostra o caminho do diretório atual (print working directory).",
      mkdir: "mkdir — cria diretório. Opção -p cria os pais que faltarem.",
      cp: "cp — copia arquivos. Uso: cp <origem> <destino>.",
      mv: "mv — move ou renomeia. Uso: mv <origem> <destino>.",
      rm: "rm — remove arquivos. Opção -r remove diretórios.",
      chmod: "chmod — muda permissões. Ex.: chmod 400 deixa o arquivo só-leitura pro dono.",
      grep: "grep — procura linhas que casam com um padrão. Uso: grep <padrão> <arquivo>.",
      cat: "cat — mostra o conteúdo de um arquivo.",
    };
    if (!cmd) throw new ErroLinux("O que você quer ler? Uso: man <comando> (ex.: man ls)");
    return (M[cmd] || `man: nenhuma entrada de manual para ${cmd}`) + "\n(aperte 'q' pra sair — aqui já voltou sozinho 😉)";
  },
};

// ---------- Desafios ----------
const DESAFIOS_LINUX = [
  { id: "lnx-1", servico: "linux", nivel: 1, xp: 30, titulo: "Onde eu estou?",
    descricao: "No Linux você se localiza com <b>pwd</b> (print working directory). Mostre o diretório atual.",
    dicas: ["É só digitar: pwd"], solucao: ["pwd"],
    validar: (c, cmd, ok) => ok && cmd && cmd.sub === "pwd" },
  { id: "lnx-2", servico: "linux", nivel: 1, xp: 30, titulo: "O que tem aqui?",
    descricao: "Liste os arquivos e pastas da sua pasta atual com <b>ls</b>.",
    dicas: ["Digite: ls", "Dica: 'ls -l' mostra detalhes (permissões, tamanho)."], solucao: ["ls"],
    validar: (c, cmd, ok) => ok && cmd && cmd.sub === "ls" },
  { id: "lnx-3", servico: "linux", nivel: 1, xp: 40, titulo: "Entre numa pasta",
    descricao: "Existe uma pasta <b>logs</b> aí. Entre nela com <b>cd</b> e confirme com pwd se quiser.",
    dicas: ["cd logs"], solucao: ["cd logs"],
    validar: (c) => c.cwd === LAR + "/logs" },
  { id: "lnx-4", servico: "linux", nivel: 1, xp: 40, titulo: "Volte pra casa",
    descricao: "Volte para a sua pasta pessoal (home). Dá pra usar <b>cd ..</b> ou <b>cd ~</b>.",
    dicas: ["cd ..  sobe um nível;  cd ~  vai direto pra home."], solucao: ["cd ~"],
    validar: (c) => c.cwd === LAR },
  { id: "lnx-5", servico: "linux", nivel: 1, xp: 50, titulo: "Crie uma pasta",
    descricao: "Crie um diretório chamado <b>backups</b> com <b>mkdir</b>.",
    dicas: ["mkdir backups"], solucao: ["mkdir backups"],
    validar: (c) => { const n = noRelHome(c, "backups"); return !!n && n.tipo === "dir"; } },
  { id: "lnx-6", servico: "linux", nivel: 1, xp: 50, titulo: "Crie um arquivo vazio",
    descricao: "Crie um arquivo vazio chamado <b>tarefas.txt</b> com <b>touch</b>.",
    dicas: ["touch tarefas.txt"], solucao: ["touch tarefas.txt"],
    validar: (c) => { const n = noRelHome(c, "tarefas.txt"); return !!n && n.tipo === "arquivo"; } },
  { id: "lnx-7", servico: "linux", nivel: 2, xp: 70, titulo: "Escreva num arquivo",
    descricao: "Escreva o texto <b>Estudar Linux</b> dentro do tarefas.txt usando <b>echo</b> e o redirecionamento <code>></code>.",
    dicas: ['echo "texto" > arquivo', 'echo "Estudar Linux" > tarefas.txt'], solucao: ['echo "Estudar Linux" > tarefas.txt'],
    validar: (c) => { const n = noRelHome(c, "tarefas.txt"); return !!n && n.tipo === "arquivo" && n.conteudo.includes("Estudar Linux"); } },
  { id: "lnx-8", servico: "linux", nivel: 1, xp: 40, titulo: "Leia o arquivo",
    descricao: "Mostre o conteúdo do <b>tarefas.txt</b> com <b>cat</b>.",
    dicas: ["cat tarefas.txt"], solucao: ["cat tarefas.txt"],
    validar: (c, cmd, ok) => ok && cmd && cmd.sub === "cat" },
  { id: "lnx-9", servico: "linux", nivel: 2, xp: 70, titulo: "Copie pra pasta de backup",
    descricao: "Copie o <b>tarefas.txt</b> pra dentro da pasta <b>backups</b> com <b>cp</b>.",
    dicas: ["cp <origem> <destino>", "cp tarefas.txt backups/"], solucao: ["cp tarefas.txt backups/"],
    validar: (c) => { const n = noRelHome(c, "backups/tarefas.txt"); return !!n && n.tipo === "arquivo"; } },
  { id: "lnx-10", servico: "linux", nivel: 2, xp: 70, titulo: "Renomeie",
    descricao: "Renomeie o <b>tarefas.txt</b> (o da pasta atual) para <b>todo.txt</b> usando <b>mv</b>.",
    dicas: ["mv também serve pra renomear: mv <de> <para>", "mv tarefas.txt todo.txt"], solucao: ["mv tarefas.txt todo.txt"],
    validar: (c) => !noRelHome(c, "tarefas.txt") && !!noRelHome(c, "todo.txt") },
  { id: "lnx-11", servico: "linux", nivel: 2, xp: 60, titulo: "Faxina",
    descricao: "Apague o arquivo <b>todo.txt</b> com <b>rm</b>.",
    dicas: ["rm todo.txt", "Pra apagar pasta, seria 'rm -r <pasta>'."], solucao: ["rm todo.txt"],
    validar: (c) => !noRelHome(c, "todo.txt") },
  { id: "lnx-12", servico: "linux", nivel: 3, xp: 90, titulo: "Proteja a chave (chmod 400)",
    descricao: "Igual no lab de SSH: a chave <b>labsuser.pem</b> precisa ficar <b>só com leitura pro dono</b>. Aplique <b>chmod 400</b> nela. (É o que destrava o ssh!)",
    dicas: ["chmod 400 labsuser.pem", "400 = dono lê (4), grupo nada (0), outros nada (0)."], solucao: ["chmod 400 labsuser.pem"],
    validar: (c) => { const n = noRelHome(c, "labsuser.pem"); return !!n && n.modo === "400"; } },
  { id: "lnx-13", servico: "linux", nivel: 3, xp: 90, titulo: "Procure no log",
    descricao: "No arquivo <b>logs/app.log</b> tem linhas de erro. Use <b>grep</b> pra mostrar só as linhas que contêm <b>erro</b>.",
    dicas: ["grep <padrão> <arquivo>", "grep erro logs/app.log"], solucao: ["grep erro logs/app.log"],
    validar: (c, cmd, ok) => ok && cmd && cmd.sub === "grep" && /erro/.test((cmd.args || []).join(" ")) },
  { id: "lnx-14", servico: "linux", nivel: 3, xp: 80, titulo: "Conte as linhas",
    descricao: "Quantas linhas tem o <b>logs/app.log</b>? Descubra com <b>wc -l</b>.",
    dicas: ["wc -l <arquivo>", "wc -l logs/app.log"], solucao: ["wc -l logs/app.log"],
    validar: (c, cmd, ok) => ok && cmd && cmd.sub === "wc" },
  { id: "lnx-15", servico: "linux", nivel: 2, xp: 70, titulo: "Leia o manual",
    descricao: "A habilidade mais importante: ler a documentação. Abra o manual do comando <b>ls</b> com <b>man</b>.",
    dicas: ["man <comando>", "man ls"], solucao: ["man ls"],
    validar: (c, cmd, ok) => ok && cmd && cmd.sub === "man" },

  // --- Nível 2: fundamentos que faltavam (inspirado no "Learn Linux") ---
  { id: "lnx-16", servico: "linux", nivel: 1, xp: 30, titulo: "Quem é você?",
    descricao: "Toda instância EC2 loga como um usuário. Descubra quem você é com <b>whoami</b>.",
    dicas: ["Digite: whoami"], solucao: ["whoami"],
    validar: (c, cmd, ok) => ok && cmd && cmd.sub === "whoami" },
  { id: "lnx-17", servico: "linux", nivel: 2, xp: 50, titulo: "Veja as permissões (ls -l)",
    descricao: "Liste com detalhes (permissões, dono, tamanho) usando <b>ls -l</b>. Repare na 1ª coluna, tipo <code>-rw-r--r--</code>: são as permissões de <b>dono</b>, <b>grupo</b> e <b>outros</b>.",
    dicas: ["ls -l", "d no começo = diretório; rwx = ler/escrever/executar."], solucao: ["ls -l"],
    validar: (c, cmd, ok) => ok && cmd && cmd.sub === "ls" && (cmd.args || []).some((a) => a === "-l" || a === "-la" || a === "-al") },
  { id: "lnx-18", servico: "linux", nivel: 2, xp: 70, titulo: "Estrutura de uma vez (mkdir -p)",
    descricao: "Crie de uma tacada só a estrutura <b>deploy/artefatos</b> com <b>mkdir -p</b> — o <code>-p</code> cria os diretórios pais que faltam.",
    dicas: ["mkdir -p deploy/artefatos"], solucao: ["mkdir -p deploy/artefatos"],
    validar: (c) => { const n = noRelHome(c, "deploy/artefatos"); return !!n && n.tipo === "dir"; } },
  { id: "lnx-19", servico: "linux", nivel: 2, xp: 70, titulo: "Anexe sem apagar (>>)",
    descricao: "O <b>notas.txt</b> já tem conteúdo. <b>Anexe</b> a linha <b>Revisar billing</b> no fim (sem apagar o resto) usando o redirecionamento duplo <code>&gt;&gt;</code>.",
    dicas: ['Com um &gt; só, você SOBRESCREVE. Com &gt;&gt;, você ANEXA.', 'echo "Revisar billing" >> notas.txt'],
    solucao: ['echo "Revisar billing" >> notas.txt'],
    validar: (c) => { const n = noRelHome(c, "notas.txt"); return !!n && n.tipo === "arquivo" && n.conteudo.includes("Revisar billing") && n.conteudo.includes("Estudar AWS CLI"); } },
  { id: "lnx-20", servico: "linux", nivel: 3, xp: 70, titulo: "Só o começo do log (head)",
    descricao: "Arquivos de log ficam enormes. Mostre só as <b>3 primeiras linhas</b> do <b>logs/app.log</b> com <b>head -n 3</b>.",
    dicas: ["head -n 3 logs/app.log", "head mostra o começo; tail mostraria o fim."], solucao: ["head -n 3 logs/app.log"],
    validar: (c, cmd, ok) => ok && cmd && cmd.sub === "head" },
  { id: "lnx-21", servico: "linux", nivel: 3, xp: 70, titulo: "Filtre o que interessa (grep)",
    descricao: "No <b>logs/app.log</b> tem linhas de INFO e de erro. Mostre só as de <b>INFO</b> com <b>grep</b>.",
    dicas: ["grep INFO logs/app.log"], solucao: ["grep INFO logs/app.log"],
    validar: (c, cmd, ok) => ok && cmd && cmd.sub === "grep" && /INFO/.test((cmd.args || []).join(" ")) },
  { id: "lnx-22", servico: "linux", nivel: 3, xp: 60, titulo: "Restrinja um arquivo (chmod 600)",
    descricao: "Deixe o <b>notas.txt</b> acessível só pro dono (ler e escrever) com <b>chmod 600</b> — ninguém mais mexe.",
    dicas: ["chmod 600 notas.txt", "6 = rw- (ler+escrever); 0 = nada."], solucao: ["chmod 600 notas.txt"],
    validar: (c) => { const n = noRelHome(c, "notas.txt"); return !!n && n.modo === "600"; } },
  { id: "lnx-23", servico: "linux", nivel: 4, xp: 90, titulo: "Prepare o SSH (.ssh em 700)",
    descricao: "Na AWS de verdade, a pasta <b>.ssh</b> precisa ser privada ou o SSH recusa. Crie a pasta <b>.ssh</b> e deixe ela em <b>700</b> (só o dono entra).",
    dicas: ["mkdir .ssh", "chmod 700 .ssh", "700 = dono rwx, grupo e outros nada."],
    solucao: ["mkdir .ssh", "chmod 700 .ssh"],
    validar: (c) => { const n = noRelHome(c, ".ssh"); return !!n && n.tipo === "dir" && n.modo === "700"; } },
  { id: "lnx-24", servico: "linux", nivel: 3, xp: 80, titulo: "Apague uma pasta inteira (rm -r)",
    descricao: "A pasta <b>projetos</b> não é mais necessária. Apague ela e tudo que tem dentro com <b>rm -r</b>.",
    dicas: ["rm -r projetos", "Sem o -r, o rm se recusa a apagar diretórios."], solucao: ["rm -r projetos"],
    validar: (c) => !noRelHome(c, "projetos") },
  { id: "lnx-25", servico: "linux", nivel: 2, xp: 50, titulo: "Espie o relatório (cat)",
    descricao: "Veja o conteúdo do <b>relatorio.csv</b> com <b>cat</b>.",
    dicas: ["cat relatorio.csv"], solucao: ["cat relatorio.csv"],
    validar: (c, cmd, ok) => ok && cmd && cmd.sub === "cat" && /relatorio/.test((cmd.args || []).join(" ")) },
  { id: "lnx-26", servico: "linux", nivel: 3, xp: 60, titulo: "Conte as linhas do notas",
    descricao: "Quantas linhas o <b>notas.txt</b> tem agora (depois do que você anexou)? Descubra com <b>wc -l</b>.",
    dicas: ["wc -l notas.txt"], solucao: ["wc -l notas.txt"],
    validar: (c, cmd, ok) => ok && cmd && cmd.sub === "wc" && /notas/.test((cmd.args || []).join(" ")) },
  { id: "lnx-27", servico: "linux", nivel: 4, xp: 120, titulo: "Projeto do zero (juntando tudo)",
    descricao: "Monte um projeto do começo ao fim: crie a pasta <b>projeto-final</b>, <b>entre</b> nela, e crie o <b>readme.md</b> com o texto <b>Deploy na AWS</b> dentro.",
    dicas: ["mkdir projeto-final", "cd projeto-final", 'echo "Deploy na AWS" > readme.md'],
    solucao: ["mkdir projeto-final", "cd projeto-final", 'echo "Deploy na AWS" > readme.md'],
    validar: (c) => { const n = noRelHome(c, "projeto-final/readme.md"); return !!n && n.tipo === "arquivo" && n.conteudo.includes("Deploy na AWS"); } },
];

(function () {
  if (typeof window === "undefined") return;

  // registra a seção (logo após "Primeiros passos") e os desafios
  if (typeof SERVICOS_META !== "undefined" && !SERVICOS_META.some((s) => s.id === "linux")) {
    const iSetup = SERVICOS_META.findIndex((s) => s.id === "setup");
    const pos = iSetup >= 0 ? iSetup + 1 : 0;
    SERVICOS_META.splice(pos, 0, { id: "linux", nome: "Linux essencial", subtitulo: "Comandos de shell", icone: "🐧" });
    for (const d of DESAFIOS_LINUX) DESAFIOS.push(d);
  }

  if (typeof window.executarLinha !== "function") return;
  const execAnterior = window.executarLinha;

  function eco(linha) {
    imprimirComando(linha);
    ui.historicoCmd.push(linha);
    ui.posHistorico = ui.historicoCmd.length;
  }

  window.executarLinha = function (linha) {
    const bruto = (linha || "").trim();
    const nome = bruto.split(/\s+/)[0];
    // 'ls'/'cat' são tratados aqui (versões com sistema de arquivos);
    // 'clear'/'help' e tudo o mais continuam no fluxo anterior.
    if (!COMANDOS_LINUX[nome]) return execAnterior(linha);

    eco(bruto);
    fsSeed(jogo.conta);

    // separa um eventual redirecionamento ">" / ">>"
    let redir = null, alvo = null, corpo = bruto;
    const mr = /\s(>>?)\s*([^\s>]+)\s*$/.exec(bruto);
    if (mr) { redir = mr[1]; alvo = mr[2]; corpo = bruto.slice(0, mr.index); }

    const toks = tokensLinux(corpo);
    const args = toks.slice(1);
    let saida = "", ok = true;
    try {
      saida = COMANDOS_LINUX[nome](jogo.conta, args, redir, alvo);
    } catch (e) {
      ok = false;
      saida = e.message;
    }
    imprimir(saida, ok ? "" : "erro");
    salvarJogo();
    if (ok) verificarDesafios({ servico: "linux", sub: nome, args, posicionais: args, flags: {}, linha: bruto });
    rolarTerminal();
  };
})();
