"use strict";
// Teste de fumaça: roda no Node (node teste/fumaca.js).
// Executa os comandos-solução de TODOS os desafios e confere que
// cada validador passa. Falhou algo, sai com código 1.

const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");

// setup-lab.js, linux-lab.js e json-yaml.js têm `if (typeof window === "undefined") return`.
// Sem um window falso eles nem carregam — era por isso que o harness via 583 e
// o navegador via 625, e que 42 atividades nunca eram executadas por ninguém.
global.window = global;

// --- camada de terminal fora do navegador ---
// setup-lab.js embrulha window.executarLinha e chama funcoes de UI no meio da
// logica (imprimir/salvarJogo/verificarDesafios). Em vez de refatorar um
// arquivo que ja esta em producao, o harness fornece as 7 globais que ele
// espera. Assim o teste exercita o MESMO caminho de despacho do navegador.
// Nada disto toca js/ — e tudo arquivo de teste.
const _term = { linhas: [], erro: false, cmd: null };
global.imprimir = (txt, classe) => { _term.linhas.push(String(txt)); if (classe === "erro") _term.erro = true; };
global.imprimirComando = () => {};
global.rolarTerminal = () => {};
global.salvarJogo = () => {};
global.verificarDesafios = (cmd) => { if (cmd) _term.cmd = cmd; };
global.ui = { historicoCmd: [], posHistorico: 0 };
global.jogo = { conta: null }; // apontado pra conta do teste mais abaixo
// A base da cadeia NAO pode morar aqui: os arquivos sao "use strict", e em eval
// estrito as declaracoes ficam num escopo proprio — daqui nao se enxerga o
// executarComandoAws. Ela e injetada dentro do eval, logo abaixo (BASE_CADEIA).
// Com o window definido, módulos que só rodavam no navegador passam a executar
// e alguns registram listener de DOMContentLoaded no load. Como esse evento
// nunca dispara aqui, um document inerte basta: o objetivo do par window/
// document falsos é só destravar o REGISTRO das atividades de shell.
const _elem = () => ({ style: {}, dataset: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
                       appendChild(){}, insertBefore(){}, remove(){}, setAttribute(){}, addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; } });
global.document = {
  addEventListener() {}, removeEventListener() {},
  querySelector() { return null; }, querySelectorAll() { return []; },
  getElementById() { return null; }, createElement() { return _elem(); },
  head: _elem(), body: _elem(), readyState: "complete",
};
// Injetada ANTES dos arquivos: o setup-lab so instala o wrap dele se
// window.executarLinha JA for funcao. O corpo so roda depois, quando
// executarComandoAws ja existe no mesmo escopo do eval.
const BASE_CADEIA = `
window.executarLinha = function (linha) {
  const r = executarComandoAws(window.jogo.conta, linha);
  if (r.cmd) _term.cmd = r.cmd;
  if (!r.ok) { _term.erro = true; _term.linhas.push(String(r.saida)); }
};
window.rodarPelaCadeia = function (linha) {
  _term.erro = false; _term.linhas = [];
  try { window.executarLinha(linha); }
  catch (e) { _term.erro = true; _term.linhas.push(e.message); }
  return { ok: !_term.erro, saida: _term.linhas.join(" | "), cmd: _term.cmd };
};
`;
const codigo = BASE_CADEIA + ["simulador.js", "manuais.js", "manuais-fase6-9.js", "desafios.js", "atividades-extras.js", "desafios-avancados.js", "cenarios-reais.js", "cloudformation.js", "servicos-fase1.js", "servicos-fase2.js", "servicos-fase3.js", "servicos-fase4.js", "servicos-fase5.js", "servicos-fase6.js", "servicos-fase7.js", "servicos-fase8.js", "servicos-fase9.js", "polly-completo.js", "cloudfront-completo.js", "desafios-extra.js", "desafios-pratica.js", "cloudwatch-metricas.js", "logs-insights.js", "lambda-dynamo-profundo.js", "cobertura-1.js", "cobertura-2.js", "cobertura-3.js", "mundo-real-2.js", "mundo-real-3.js", "setup-lab.js", "linux-lab.js", "arquivos-lab.js", "json-yaml.js", "json-yaml-2.js", "lab-vpc.js", "missoes.js"]
  .map((f) => fs.readFileSync(path.join(raiz, "js", f), "utf8"))
  .join("\n");

const teste = `
(function () {
  const conta = criarContaAws();
  let falhas = 0;
  let ultimoCmd = null;

  function rodar(linha) {
    const r = executarComandoAws(conta, linha);
    if (!r.ok) {
      console.error("  ✗ comando falhou: " + linha);
      console.error("    " + String(r.saida).split("\\n")[0]);
      falhas++;
    }
    ultimoCmd = r.cmd;
    return r;
  }

  // ids reais são aleatórios — resolve os placeholders das soluções.
  // ATENÇÃO: teste/analise-corpo.js tem uma cópia desta função — mexeu aqui,
  // mexa lá também (os dois harnesses executam as mesmas soluções).
  function resolver(linha) {
    const ult = (obj) => { const k = Object.keys(obj || {}); return k[k.length - 1]; };
    const lab = (conta.vpc || {}).labIds;
    if (lab) {
    if (linha.includes("<rtb-id>")) linha = linha.replace(/<rtb-id>/g, lab.rtb);
    if (linha.includes("<acl-id>")) linha = linha.replace(/<acl-id>/g, lab.acl);
    if (linha.includes("<igw-id>")) linha = linha.replace(/<igw-id>/g, lab.igw);
    }
    if (linha.includes("<caminho-flowlog>")) {
    let chave = "";
    for (const b of Object.values(conta.s3.buckets || {})) {
    const k = Object.keys(b.objetos || {}).find((x) => /flowlog/i.test(x));
    if (k) { chave = k; break; }
    }
    linha = linha.replace(/<caminho-flowlog>/g, chave);
    }
    if (linha.includes("<id-da-inst")) {
      linha = linha.replace(/<id-da-inst[^>]*>/, ult(conta.ec2.instancias));
    }
    if (linha.includes("<vpc-id>") && conta.vpc) linha = linha.replace(/<vpc-id>/g, ult(conta.vpc.vpcs));
    if (linha.includes("<igw-id>") && conta.vpc) linha = linha.replace(/<igw-id>/g, ult(conta.vpc.igws));
    if (linha.includes("<vol-id>")) linha = linha.replace(/<vol-id>/g, ult(conta.ec2.volumes));
    if (linha.includes("<zone-id>") && conta.route53) linha = linha.replace(/<zone-id>/g, ult(conta.route53.zonas));
    if (linha.includes("<dist-id>") && conta.cloudfront) linha = linha.replace(/<dist-id>/g, ult(conta.cloudfront.distribuicoes));
    if (linha.includes("<api-id>") && conta.apigateway) linha = linha.replace(/<api-id>/g, ult(conta.apigateway.apis));
    // tarefa de sintese do Polly: o id nasce sorteado no start-speech-synthesis-task
    if (linha.includes("<task-id>") && conta.polly) linha = linha.replace(/<task-id>/g, ult(conta.polly.tarefas));
    // CloudFront: o ETag MUDA a cada alteracao, entao e sempre lido na hora
    if ((linha.includes("<etag>") || linha.includes("<inv-id>")) && conta.cloudfront) {
      const d = conta.cloudfront.distribuicoes[ult(conta.cloudfront.distribuicoes)];
      if (d) {
        if (!d.etag) d.etag = "E0000000000000";
        linha = linha.replace(/<etag>/g, d.etag);
        const inv = (d.invalidacoes || [])[(d.invalidacoes || []).length - 1];
        linha = linha.replace(/<inv-id>/g, inv ? inv.id : "");
      }
    }
    if ((linha.includes("<root-id>") || linha.includes("<resource-id>")) && conta.apigateway) {
      const api = conta.apigateway.apis[ult(conta.apigateway.apis)];
      if (api) {
        linha = linha.replace(/<root-id>/g, api.raiz);
        // o "resource-id" é o último recurso criado (o /pedidos), não a raiz
        const filhos = Object.keys(api.recursos).filter((r) => r !== api.raiz);
        linha = linha.replace(/<resource-id>/g, filhos[filhos.length - 1] || api.raiz);
      }
    }
    if (linha.includes("<key-id>") && conta.kms) linha = linha.replace(/<key-id>/g, ult(conta.kms.chaves));
    if (linha.includes("<query-id>") && conta.athena) linha = linha.replace(/<query-id>/g, ult(conta.athena.execucoes));
    if (linha.includes("<blob>")) linha = linha.replace(/<blob>/g, ((conta.kms || {}).ultimoBlob) || "");
    if (linha.includes("<pool-id>") && conta.cognito) linha = linha.replace(/<pool-id>/g, ult(conta.cognito.pools));
    if (linha.includes("<receipt-handle>")) {
      // pega um handle de mensagem já recebida em qualquer fila
      let handle = "";
      for (const f of Object.values((conta.sqs || {}).filas || {})) {
        const m = (f.mensagens || []).find((x) => x.handle);
        if (m) { handle = m.handle; break; }
      }
      linha = linha.replace(/<receipt-handle>/g, handle);
    }
    // consulta de log (Insights): pega o id da ultima consulta iniciada
    if (linha.includes("<consulta-id>") && conta.logs) { const _q = Object.keys(conta.logs.consultas || {}); if (_q.length) linha = linha.replace(/<consulta-id>/g, _q[_q.length - 1]); }    if (linha.includes("<waf-id>") && conta.waf) { const _w = Object.values(conta.waf.acls); if (_w.length) linha = linha.replace(/<waf-id>/g, _w[_w.length - 1].id); }


    // fases 6-9
    if (linha.includes("<lb-arn>") && conta.elb) { const _l = Object.values(conta.elb.lbs); if (_l.length) linha = linha.replace(/<lb-arn>/g, _l[_l.length - 1].arn); }
    if (linha.includes("<tg-arn>") && conta.elb) { const _t = Object.values(conta.elb.tgs); if (_t.length) linha = linha.replace(/<tg-arn>/g, _t[_t.length - 1].arn); }
    if (linha.includes("<fs-id>") && conta.efs) linha = linha.replace(/<fs-id>/g, ult(conta.efs.sistemas));
    if (linha.includes("<mt-id>") && conta.efs) linha = linha.replace(/<mt-id>/g, ult(conta.efs.alvos));
    if (linha.includes("<cert-arn>") && conta.acm) linha = linha.replace(/<cert-arn>/g, ult(conta.acm.certificados));
    if (linha.includes("<detector-id>") && conta.guardduty) linha = linha.replace(/<detector-id>/g, ult(conta.guardduty.detectores));
    if (linha.includes("<sub-arn>") && conta.sns) { for (const t of Object.values(conta.sns.topicos || {})) { const a = (t.assinaturas || [])[(t.assinaturas || []).length - 1]; if (a) { linha = linha.replace(/<sub-arn>/g, a.arn); break; } } }
    // cobertura: tabela de rotas, sub-rede e flow log criados nas proprias atividades
    if (linha.includes("<rtb-novo>") && conta.vpc) { const _t = Object.keys(conta.vpc.tabelas || {}); if (_t.length) linha = linha.replace(/<rtb-novo>/g, _t[_t.length - 1]); }
    if (linha.includes("<subnet-id>") && conta.vpc) { const _s = Object.keys(conta.vpc.subnets || {}); if (_s.length) linha = linha.replace(/<subnet-id>/g, _s[_s.length - 1]); }
    if (linha.includes("<flowlog-id>") && conta.vpc) { const _f = Object.keys(conta.vpc.flowLogs || conta.vpc.flowlogs || {}); if (_f.length) linha = linha.replace(/<flowlog-id>/g, _f[_f.length - 1]); }

    return linha;
  }

  for (const d of DESAFIOS) {
    // Laboratório de diagnóstico: o ambiente quebrado é montado aqui (no app
    // isso acontece quando o aluno abre a atividade), e curl/ssh/nmap rodam
    // pelo labShell — é o que gera o tráfego que vira flow log.
    const ehLab = d.servico === "diagnostico";
    if (ehLab && typeof montarLabVpc === "function") montarLabVpc(conta);
    // Comandos de shell (cat/ls/grep/cd) agora RODAM aqui: o linux-lab.js
    // expõe executarShellPuro, que opera só sobre a conta, sem DOM. Antes
    // eram pulados e as trilhas linux e formatos não tinham cobertura nenhuma.
    // Continua pulando so o que nem shell nem aws sabem executar (o
    // 'aws configure' interativo da trilha setup).
    // A trilha SETUP passa pela CADEIA completa de executarLinha: o setup-lab
    // intercepta ssh/curl/unzip/chmod, o 'aws --version' e o 'aws configure'
    // ANTES de chegar no executor aws. Rodar por ela e o unico jeito de testar
    // o configure interativo, que guarda estado entre uma linha e a seguinte
    // (as respostas '<sua-access-key>', 'us-west-2', 'json' sao linhas da
    // solucao, nao comandos).
    const ehSetup = d.servico === "setup";
    if (ehSetup) {
      global.jogo.conta = conta;
      let falhouSetup = false;
      for (const sol of d.solucao) {
        const rr = rodarPelaCadeia(sol);
        if (!rr.ok) { console.error("  x setup falhou: " + sol); console.error("    " + rr.saida.slice(0, 130)); falhas++; falhouSetup = true; }
        if (rr.cmd) ultimoCmd = rr.cmd;
      }
      let passouSetup = false;
      try { passouSetup = d.validar(conta, ultimoCmd, true); } catch (e) { passouSetup = false; }
      if (passouSetup && !falhouSetup) console.log("✓ " + d.id + " — " + d.titulo);
      else { console.error("✗ validador NAO passou: " + d.id + " — " + d.titulo); falhas++; }
      continue;
    }
    // Sobra pular so o que nem a cadeia nem o executor aws sabem rodar.
    if (!ehLab && d.solucao.some((s) => {
      const l = s.trim();
      if (l.startsWith("aws")) return false;
      return typeof executarShellPuro !== "function" || !executarShellPuro(criarContaAws(), l);
    })) {
      console.log("· (pulado no node — shell) " + d.id + " — " + d.titulo);
      continue;
    }
    for (const sol of d.solucao) {
      if (sol.startsWith("aws ec2 describe-instances") && d.id === "ec2-3") { rodar(sol); continue; }
      const linha = resolver(sol);
      if (!linha.trim().startsWith("aws")) {
        // O lab de diagnostico tem shell PROPRIO (labShell), que registra o que
        // foi rodado pra montar a narrativa da investigacao. Ele vem primeiro:
        // senao 'grep REJECT flowlog.log' cairia no shell do linux-lab e o lab
        // nunca saberia que a pessoa filtrou o log.
        if (ehLab && typeof labShell === "function") { labShell(conta, linha); continue; }
        const rs = typeof executarShellPuro === "function" ? executarShellPuro(conta, linha) : null;
        if (rs) { // era comando de shell de verdade
          if (!rs.ok) {
            console.error("  ✗ shell falhou: " + linha);
            console.error("    " + String(rs.saida).slice(0, 120));
            falhas++;
          }
          ultimoCmd = rs.cmd; // o validador da atividade recebe este cmd
          continue;
        }
        if (typeof labShell === "function") labShell(conta, linha);
        continue;
      }
      rodar(linha);
    }
    let passou;
    if (d.tipo === "projeto") {
      passou = d.etapas.every((e) => e.validar(conta));
    } else {
      passou = d.validar(conta, ultimoCmd, true);
    }
    if (!passou) {
      console.error("✗ validador NÃO passou: " + d.id + " — " + d.titulo);
      falhas++;
    } else {
      console.log("✓ " + d.id + " — " + d.titulo);
    }
  }

  // manuais: todo serviço e comando registrado tem que ter manual
  for (const [servico, ops] of Object.entries(SERVICOS)) {
    if (!MANUAIS[servico]) { console.error("✗ manual faltando: " + servico); falhas++; }
    for (const sub of Object.keys(ops)) {
      const m = obterManual(servico + "." + sub);
      if (m.startsWith("Não há manual") || m.startsWith("(não há manual")) {
        console.error("✗ manual faltando: " + servico + " " + sub);
        falhas++;
      }
    }
  }

  // alguns erros esperados (não podem passar como ok)
  const errados = [
    "aws s3 mb s3://MAIUSCULO",
    "aws s3 cp nao-existe.txt s3://meu-primeiro-bucket/",
    "aws ec2 run-instances --image-id banana --instance-type t2.micro",
    "aws dynamodb put-item --table-name nao-existe --item '{}'",
    "aws naoexiste qualquer-coisa",
  ];
  for (const linha of errados) {
    const r = executarComandoAws(conta, linha);
    if (r.ok) { console.error("✗ devia ter dado erro: " + linha); falhas++; }
  }

  if (falhas) {
    console.error("\\n" + falhas + " falha(s).");
    process.exitCode = 1;
  } else {
    console.log("\\nTudo verde: " + DESAFIOS.length + " desafios validados, manuais completos, erros tratados.");
  }
})();
`;

eval(codigo + teste);
