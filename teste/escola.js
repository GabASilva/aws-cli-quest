"use strict";
// Teste do plano Escola (node teste/escola.js) — ponta a ponta contra um
// servidor de verdade, subido aqui com banco TEMPORÁRIO e token de admin
// sorteado (nada toca o quest-dados.json nem a produção).
// Cobre: pedido e aprovação de professor (B), turma escola e preço escola pro
// aluno (A), pacote de vagas pago pela escola, painel, tarefas, liberar vaga e
// sair da turma devolvendo a vaga. Memória: plano-escola.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const PORTA = 8700 + Math.floor(Math.random() * 90);
const B = "http://localhost:" + PORTA;
const ADM = crypto.randomBytes(24).toString("hex");
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "climb-escola-"));
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) falhas++; };
async function req(caminho, { token, metodo, corpo, admin } = {}) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  if (admin) h["x-admin-token"] = ADM;
  const r = await fetch(B + caminho, { method: metodo || (corpo ? "POST" : "GET"), headers: h, body: corpo ? JSON.stringify(corpo) : undefined });
  let j = {}; try { j = await r.json(); } catch (e) {}
  return { status: r.status, ...j };
}
const conta = async (usuario) => (await req("/api/cadastrar", { corpo: { usuario, senha: "senha-de-teste-123" } })).token;

async function rodar() {
  const prof = await conta("prof_teste"), a1 = await conta("aluno_um"), a2 = await conta("aluno_dois"), fora = await conta("aluno_fora");
  ok(prof && a1 && a2 && fora, "4 contas de teste criadas");

  console.log("B — professor");
  let r = await req("/api/professor/pedir", { token: prof, corpo: { instituicao: "x", emailInst: "prof@escola.edu.br" } });
  ok(r.status === 400, "recusa instituição curta demais: " + r.erro);
  r = await req("/api/professor/pedir", { token: prof, corpo: { instituicao: "Escola Técnica Teste", emailInst: "prof@escola.edu.br", link: "https://escola.edu.br/prof" } });
  ok(r.ok, "pedido enviado");
  r = await req("/api/professor", { token: prof });
  ok(r.professor && r.professor.status === "pendente" && !r.aprovado, "status pendente");
  r = await req("/api/admin/alertas", { admin: true });
  ok((r.alertas || []).some((a) => a.tipo === "professor"), "o pedido caiu nos alertas do painel");
  // turma criada ANTES da aprovação vira escola depois (é calculado, não gravado)
  r = await req("/api/salas/criar", { token: prof, corpo: { nome: "Cloud T1" } });
  const cod = r.sala.codigo;
  ok(r.sala.escola === false, "antes da aprovação a turma não é escola");
  r = await req("/api/admin/professor/decidir", { admin: true, corpo: { usuario: "prof_teste", aprovar: true, dias: 365 } });
  ok(r.ok === true && r.status === "aprovado", "admin aprovou");
  r = await req("/api/eu", { token: prof });
  ok(r.licenca && r.licenca.pro, "professor ganhou o Pro");
  r = await req("/api/salas", { token: prof });
  ok(r.salas[0].escola === true && r.salas[0].precoEscola === 49.9, "turma virou escola, com preço escola");

  console.log("A — aluno paga");
  r = await req("/api/salas/entrar", { token: a1, corpo: { codigo: cod } });
  ok(r.sala && r.ganhouVaga === false, "aluno_um entrou (sem pacote de vagas, sem Pro)");
  r = await req("/api/assinar", { token: fora, corpo: { tier: "escola" } });
  ok(r.status === 403, "quem não é de turma escola não compra o preço escola");
  r = await req("/api/assinar", { token: a1, corpo: { tier: "escola" } });
  ok(r.status === 503 && r.fallback === "codigo", "aluno da turma passa na regra (aqui sem MP_TOKEN: cai no aviso de código)");
  r = await req("/api/assinar", { token: prof, corpo: { tier: "escola" } });
  ok(r.status === 403, "o próprio professor não compra preço escola");

  console.log("A — escola paga (vagas)");
  r = await req("/api/admin/sala/vagas", { admin: true, corpo: { codigo: cod, total: 1, dias: 180 } });
  ok(r.ok && r.novas === 1 && r.vagas.usadas === 1, "1 vaga lançada: aluno_um ganhou na hora");
  r = await req("/api/eu", { token: a1 });
  ok(r.licenca.pro && r.licenca.tier === "escola", "aluno_um é Pro (escola)");
  r = await req("/api/salas/entrar", { token: a2, corpo: { codigo: cod } });
  ok(r.ganhouVaga === false, "aluno_dois entrou com as vagas esgotadas");

  console.log("Painel e tarefas");
  r = await req("/api/salas/painel?codigo=" + cod, { token: a1 });
  ok(r.status === 403, "aluno não abre o painel");
  r = await req("/api/salas/tarefa", { token: prof, corpo: { codigo: cod, servico: "nao-existe" } });
  ok(r.status === 400, "tarefa com trilha inexistente é recusada");
  r = await req("/api/salas/tarefa", { token: prof, corpo: { codigo: cod, servico: "s3", prazo: Date.now() + 7 * 864e5 } });
  ok(r.sala && r.sala.tarefas.length === 1, "tarefa S3 com prazo marcada");
  // aluno_dois faz 2 atividades de S3 e revela 1
  await req("/api/progresso", { token: a2, corpo: { xp: 110, melhorStreak: 1, progresso: { concluidos: { "s3-1": { xpGanho: 50 }, "s3-2": { xpGanho: 40 } }, revelados: { "s3-2": true }, atividadeDiaria: { "2026-09-30": 2 } } } });
  r = await req("/api/salas/painel?codigo=" + cod, { token: prof });
  const d2 = (r.alunos || []).find((a) => a.usuario === "aluno_dois");
  ok(r.alunos && r.alunos.length === 2 && !r.alunos.some((a) => a.usuario === "prof_teste"), "painel lista os 2 alunos, sem o professor");
  ok(d2 && d2.feitas === 2 && d2.reveladas === 1 && d2.porTrilha.s3 === 2 && d2.ultimoDia === "2026-09-30", "progresso do aluno_dois certo (2 feitas, 1 revelada, S3, último dia)");
  ok(r.totaisTrilha && r.totaisTrilha.s3 > 50, "total da trilha S3 vem do conteúdo (" + (r.totaisTrilha || {}).s3 + ")");

  console.log("Vaga liberada passa pro próximo");
  r = await req("/api/salas/vaga/liberar", { token: prof, corpo: { codigo: cod, aluno: "aluno_um" } });
  ok(r.ok, "professor liberou a vaga do aluno_um");
  ok(!(await req("/api/eu", { token: a1 })).licenca.pro, "aluno_um perdeu o Pro da escola");
  ok((await req("/api/eu", { token: a2 })).licenca.pro, "aluno_dois ganhou a vaga que abriu");
  r = await req("/api/salas/sair", { token: a2, corpo: { codigo: cod } });
  ok(!(await req("/api/eu", { token: a2 })).licenca.pro, "aluno_dois saiu da turma e a vaga voltou pra escola");

  console.log("Suporte (💬 Ajuda)");
  r = await req("/api/suporte", { corpo: { tipo: "duvida", mensagem: "oi", email: "x@y.com" } });
  ok(r.status === 400, "mensagem curta demais é recusada");
  r = await req("/api/suporte", { corpo: { tipo: "duvida", mensagem: "Como faço pra usar na minha turma?" } });
  ok(r.status === 400, "sem conta e sem e-mail é recusado (não teria como responder)");
  r = await req("/api/suporte", { corpo: { tipo: "pagamento", mensagem: "Paguei no Pix e o Pro não liberou <script>x</script>", email: "Aluno@Exemplo.com" } });
  ok(r.ok && /^sup-/.test(r.id), "anônimo com e-mail manda (protocolo " + r.id + ")");
  r = await req("/api/suporte", { token: a1, corpo: { tipo: "atividade", mensagem: "A s3-7 não completa com o comando certo", email: "aluno1@escola.edu.br", contexto: { atividade: "s3-7 — Sincronize um site inteiro", trilha: "s3", comandos: ["aws s3 sync ./site s3://meu-primeiro-bucket"] } } });
  const idSup = r.id;
  ok(r.ok, "logado manda com contexto da atividade");
  r = await req("/api/admin/suporte", { admin: true });
  const msg = (r.mensagens || []).find((m) => m.id === idSup);
  ok(msg && msg.usuario === "aluno_um" && msg.contexto.comandos.length === 1 && msg.status === "aberto", "admin vê a mensagem, o usuário e os comandos");
  ok((r.mensagens || []).some((m) => m.email === "aluno@exemplo.com" && m.mensagem.includes("<script>")), "guarda o texto como veio (o escape é na hora de mostrar/mandar)");
  r = await req("/api/admin/suporte/responder", { admin: true, corpo: { id: idSup, resposta: "Corrigido, obrigado!" } });
  ok(r.ok, "admin respondeu");
  r = await req("/api/admin/suporte", { admin: true });
  ok(r.mensagens.find((m) => m.id === idSup).status === "respondido", "status virou respondido");
  r = await req("/api/admin/resumo", { admin: true });
  ok(r.suporteAbertos === 1, "resumo conta 1 mensagem ainda aberta");

  console.log("Recusa e revogação");
  r = await req("/api/admin/professores", { admin: true });
  ok(r.professores.length === 1 && r.professores[0].turmas[0].vagas.total === 1, "admin vê professor, turma e vagas");
  console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo verde.");
  return falhas;
}

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, "..", "servidor.js"), String(PORTA)], {
    env: Object.assign({}, process.env, { DADOS_DIR: DIR, ADMIN_TOKEN: ADM, MP_TOKEN: "", RESEND_KEY: "", ALERTA_EMAIL: "" }), stdio: "ignore",
  });
  let falhas = 1;
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(B + "/api/saude")).ok) break; } catch (e) {} await new Promise((r) => setTimeout(r, 250)); }
    falhas = await rodar();
  } finally {
    srv.kill();
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  }
  process.exitCode = falhas ? 1 : 0;
})();
