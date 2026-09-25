"use strict";
// Placeholders das soluções (<tarefa-id>, <vpc-id>, <chave-antiga>...).
// Os ids reais são sorteados na criação, então a solução guarda um marcador e
// o harness troca pelo id que existe na conta NAQUELE momento.
//
// Fonte ÚNICA: teste/fumaca.js e teste/analise.js injetam este arquivo no
// mesmo eval dos módulos do jogo. Até 25/09/2026 eram duas cópias à mão, e
// cada placeholder novo tinha de ser escrito duas vezes.
//
// Placeholder novo entra AQUI. Ele resolve pro ÚLTIMO recurso criado daquele
// tipo, então a ordem das atividades importa (a conta do teste é compartilhada).
function resolverPlaceholders(conta, linha) {
  const ult = (obj) => { const k = Object.keys(obj || {}); return k[k.length - 1]; };
  const lab = (conta.vpc || {}).labIds;
  if (lab) {
  if (linha.includes("<rtb-id>")) linha = linha.replace(/<rtb-id>/g, lab.rtb);
  if (linha.includes("<acl-id>")) linha = linha.replace(/<acl-id>/g, lab.acl);
  if (linha.includes("<igw-id>")) linha = linha.replace(/<igw-id>/g, lab.igw);
  if (linha.includes("<sg-lab>")) linha = linha.replace(/<sg-lab>/g, lab.sg);
  if (linha.includes("<vpc-lab>")) linha = linha.replace(/<vpc-lab>/g, lab.vpc);
  }
  if (linha.includes("<caminho-flowlog>")) {
  let chave = "";
  for (const b of Object.values(conta.s3.buckets || {})) {
  const k = Object.keys(b.objetos || {}).find((x) => /flowlog/i.test(x));
  if (k) { chave = k; break; }
  }
  linha = linha.replace(/<caminho-flowlog>/g, chave);
  }
  if (linha.includes("<id-da-inst")) linha = linha.replace(/<id-da-inst[^>]*>/, ult(conta.ec2.instancias));
  if (linha.includes("<vpc-id>") && conta.vpc) linha = linha.replace(/<vpc-id>/g, ult(conta.vpc.vpcs));
  if (linha.includes("<igw-id>") && conta.vpc) linha = linha.replace(/<igw-id>/g, ult(conta.vpc.igws));
  if (linha.includes("<vol-id>")) linha = linha.replace(/<vol-id>/g, ult(conta.ec2.volumes));
  if (linha.includes("<zone-id>") && conta.route53) linha = linha.replace(/<zone-id>/g, ult(conta.route53.zonas));
  if (linha.includes("<dist-id>") && conta.cloudfront) linha = linha.replace(/<dist-id>/g, ult(conta.cloudfront.distribuicoes));
  if (linha.includes("<api-id>") && conta.apigateway) linha = linha.replace(/<api-id>/g, ult(conta.apigateway.apis));
  // tarefa de sintese do Polly: o id nasce sorteado no start-speech-synthesis-task
  if (linha.includes("<task-id>") && conta.polly) linha = linha.replace(/<task-id>/g, ult(conta.polly.tarefas));
  // ECR: a imagem ORFA (sem tag) do repositorio do projeto so pode ser apontada
  // pelo digest - e e justamente isso que a atividade do marco ensina.
  if (linha.includes("<digest-orfa>") && conta.ecr) {
    const r = (conta.ecr.repositorios || {})["pagamentos/checkout-api"];
    const orfa = ((r || {}).detalhes || []).find((d) => !d.tags.length);
    if (orfa) linha = linha.replace(/<digest-orfa>/g, orfa.digest);
  }
  // ACM: o arn do certificado emitido pela AWS e o do importado sao diferentes
  if ((linha.includes("<cert-arn>") || linha.includes("<cert-importado>")) && conta.acm) {
    const todos = Object.values(conta.acm.certificados || {});
    const emitido = todos.filter((x) => x.tipo !== "IMPORTED").pop();
    const importado = todos.filter((x) => x.tipo === "IMPORTED").pop();
    if (emitido) linha = linha.replace(/<cert-arn>/g, emitido.arn);
    if (importado) linha = linha.replace(/<cert-importado>/g, importado.arn);
  }
  // Route 53: id da ultima mudanca de registro e do health check criado
  if (linha.includes("<change-id>") && conta.route53) linha = linha.replace(/<change-id>/g, ult(conta.route53.mudancas));
  if (linha.includes("<hc-id>") && conta.route53) linha = linha.replace(/<hc-id>/g, ult(conta.route53.checks));
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
      const filhos = Object.keys(api.recursos).filter((r) => r !== api.raiz);
      linha = linha.replace(/<resource-id>/g, filhos[filhos.length - 1] || api.raiz);
    }
  }
  if (linha.includes("<key-id>") && conta.kms) linha = linha.replace(/<key-id>/g, ult(conta.kms.chaves));
  if (linha.includes("<query-id>") && conta.athena) linha = linha.replace(/<query-id>/g, ult(conta.athena.execucoes));
  if (linha.includes("<blob>")) linha = linha.replace(/<blob>/g, ((conta.kms || {}).ultimoBlob) || "");
  if (linha.includes("<pool-id>") && conta.cognito) linha = linha.replace(/<pool-id>/g, ult(conta.cognito.pools));
  if (linha.includes("<receipt-handle>")) {
    let handle = "";
    for (const f of Object.values((conta.sqs || {}).filas || {})) {
      const m = (f.mensagens || []).find((x) => x.handle);
      if (m) { handle = m.handle; break; }
    }
    linha = linha.replace(/<receipt-handle>/g, handle);
  }
  // Lote: os comandos *-batch precisam de DOIS comprovantes. De trás pra
  // frente porque a fila que interessa é a que a própria atividade criou.
  if (linha.includes("<handle-1>") || linha.includes("<handle-2>")) {
    let par = [];
    for (const f of Object.values((conta.sqs || {}).filas || {}).reverse()) {
      const hs = (f.mensagens || []).filter((x) => x.handle).map((x) => x.handle);
      if (hs.length >= 2) { par = hs.slice(0, 2); break; }
    }
    linha = linha.replace(/<handle-1>/g, par[0] || "").replace(/<handle-2>/g, par[1] || "");
  }
  if (linha.includes("<task-handle>")) {
    const t = Object.keys(((conta.sqs || {}).tarefasMove) || {});
    linha = linha.replace(/<task-handle>/g, t.length ? t[t.length - 1] : "");
  }
  // SSM: o id do ultimo envio do Run Command e o da sessao ainda aberta
  if (linha.includes("<comando-id>")) {
    const k = Object.keys(((conta.ssm || {}).comandos) || {});
    linha = linha.replace(/<comando-id>/g, k.length ? k[k.length - 1] : "");
  }
  if (linha.includes("<sessao-id>")) {
    const abertas = Object.values(((conta.ssm || {}).sessoes) || {}).filter((s) => s.estado === "Connected");
    linha = linha.replace(/<sessao-id>/g, abertas.length ? abertas[abertas.length - 1].id : "");
  }
  // SSM: a ultima automacao disparada (o get-automation-execution pede o id)
  if (linha.includes("<automacao-id>")) {
    const a = Object.keys(((conta.ssm || {}).automacoes) || {});
    linha = linha.replace(/<automacao-id>/g, a.length ? a[a.length - 1] : "");
  }
  // EC2: associacao do IP elastico (pra soltar) e a ultima imagem criada
  if (linha.includes("<eip-assoc>")) {
    const com = Object.values(((conta.ec2 || {}).enderecos) || {}).filter((e) => e.associacao);
    linha = linha.replace(/<eip-assoc>/g, com.length ? com[com.length - 1].associacao : "");
  }
  if (linha.includes("<ami-id>")) {
    const im = Object.keys(((conta.ec2 || {}).imagens) || {});
    linha = linha.replace(/<ami-id>/g, im.length ? im[im.length - 1] : "");
  }
  // Containers: a tarefa do ECS que está rodando e o update do EKS
  if (linha.includes("<tarefa-id>")) {
    const t = Object.values(((conta.ecs || {}).execucoes) || {});
    const viva = t.filter((x) => x.estado === "RUNNING").pop() || t[t.length - 1];
    linha = linha.replace(/<tarefa-id>/g, viva ? viva.id : "");
  }
  if (linha.includes("<update-id>")) {
    const u = Object.keys(((conta.eks || {}).atualizacoes) || {});
    linha = linha.replace(/<update-id>/g, u.length ? u[u.length - 1] : "");
  }
  // EC2: IP elástico recém-alocado, o que está parado, e o NAT criado
  if (linha.includes("<eip-id>") || linha.includes("<eip-parado>")) {
    const eips = Object.values(((conta.ec2 || {}).enderecos) || {});
    const ultimo = eips.length ? eips[eips.length - 1].id : "";
    const parado = (eips.find((e) => !e.instancia) || {}).id || "";
    linha = linha.replace(/<eip-id>/g, ultimo).replace(/<eip-parado>/g, parado);
  }
  if (linha.includes("<nat-id>")) {
    const n = Object.keys(((conta.ec2 || {}).nats) || {});
    linha = linha.replace(/<nat-id>/g, n.length ? n[n.length - 1] : "");
  }
  // IAM: a chave mais velha ainda ativa, e a que já foi inativada
  if (linha.includes("<chave-antiga>") || linha.includes("<chave-inativa>")) {
    let velha = "", inativa = "";
    for (const u of Object.values(((conta.iam || {}).usuarios) || {})) {
      for (const k of (u.chaves || [])) {
        if (!velha && k.status === "Active") velha = k.id;
        if (!inativa && k.status === "Inactive") inativa = k.id;
      }
    }
    linha = linha.replace(/<chave-antiga>/g, velha).replace(/<chave-inativa>/g, inativa);
  }
  // fases 6-9
  if (linha.includes("<lb-arn>") && conta.elb) { const _l = Object.values(conta.elb.lbs); if (_l.length) linha = linha.replace(/<lb-arn>/g, _l[_l.length - 1].arn); }
  if (linha.includes("<tg-arn>") && conta.elb) { const _t = Object.values(conta.elb.tgs); if (_t.length) linha = linha.replace(/<tg-arn>/g, _t[_t.length - 1].arn); }
  if (linha.includes("<fs-id>") && conta.efs) linha = linha.replace(/<fs-id>/g, ult(conta.efs.sistemas));
  if (linha.includes("<mt-id>") && conta.efs) linha = linha.replace(/<mt-id>/g, ult(conta.efs.alvos));
  if (linha.includes("<cert-arn>") && conta.acm) linha = linha.replace(/<cert-arn>/g, ult(conta.acm.certificados));
  if (linha.includes("<detector-id>") && conta.guardduty) linha = linha.replace(/<detector-id>/g, ult(conta.guardduty.detectores));
  // consulta de log (Insights) e Web ACL do WAF — ids sorteados na criação
  if (linha.includes("<consulta-id>") && conta.logs) { const _q = Object.keys(conta.logs.consultas || {}); if (_q.length) linha = linha.replace(/<consulta-id>/g, _q[_q.length - 1]); }
  if (linha.includes("<waf-id>") && conta.waf) { const _w = Object.values(conta.waf.acls); if (_w.length) linha = linha.replace(/<waf-id>/g, _w[_w.length - 1].id); }
  // Rede pelo CIDR: <vpc-de:10.60.0.0/16>, <subnet-de:10.60.1.0/24>, <igw-de:10.60.0.0/16>
  // (o <vpc-id> pega a ÚLTIMA VPC, e a desmontagem precisa de uma específica)
  if (conta.vpc && /<(vpc|subnet|igw)-de:/.test(linha)) {
    const vpcDe = (cidr) => (Object.values(conta.vpc.vpcs || {}).find((v) => v.cidr === cidr) || {});
    linha = linha.replace(/<vpc-de:([^>]+)>/g, (m, cidr) => vpcDe(cidr).id || "");
    linha = linha.replace(/<subnet-de:([^>]+)>/g, (m, cidr) => (Object.values(conta.vpc.subnets || {}).find((s) => s.cidr === cidr) || {}).id || "");
    linha = linha.replace(/<igw-de:([^>]+)>/g, (m, cidr) => { const v = vpcDe(cidr); return (Object.values(conta.vpc.igws || {}).find((g) => g.vpc && g.vpc === v.id) || {}).id || ""; });
  }
  // CodeBuild: o build mais recente e o último que FALHOU (FAILED)
  if (linha.includes("<build-id>") && conta.codebuild) { const _b = Object.keys(conta.codebuild.builds || {}); linha = linha.replace(/<build-id>/g, _b.length ? _b[_b.length - 1] : ""); }
  if (linha.includes("<build-falho>") && conta.codebuild) { const _f = Object.values(conta.codebuild.builds || {}).filter((b) => b.status === "FAILED"); linha = linha.replace(/<build-falho>/g, _f.length ? _f[_f.length - 1].id : ""); }
  // CodeCommit: a ponta de uma branch (<commit-da-branch:portal-rh:main>) e o
  // pull request aberto por último
  if (linha.includes("<commit-da-branch:") && conta.codecommit) linha = linha.replace(/<commit-da-branch:([^:>]+):([^>]+)>/g, (m, r, b) => (((conta.codecommit.repos || {})[r] || {}).branches || {})[b] || "");
  if (linha.includes("<pr-id>") && conta.codecommit) { const _p = Object.keys(conta.codecommit.prs || {}).sort((a, b) => Number(a) - Number(b)); linha = linha.replace(/<pr-id>/g, _p.length ? _p[_p.length - 1] : ""); }
  // KMS: o KeyId por trás de um alias (<chave-do-alias:alias/chave-loja>) — as
  // operações de gestão da chave não aceitam alias, só o KeyId
  if (linha.includes("<chave-do-alias:") && conta.kms) linha = linha.replace(/<chave-do-alias:([^>]+)>/g, (m, a) => (conta.kms.aliases || {})[a] || "");
  // volume pelo tamanho (<vol-tam:10>) — a trilha de EBS trabalha com dois discos
  if (linha.includes("<vol-tam:") && conta.ec2) linha = linha.replace(/<vol-tam:(\d+)>/g, (m, t) => (Object.values(conta.ec2.volumes || {}).find((v) => String(v.tamanho) === t) || {}).id || "");
  // a PENÚLTIMA instância viva (a última é a do <id-da-instância>)
  if (linha.includes("<instancia-anterior>") && conta.ec2) { const _v = Object.values(conta.ec2.instancias || {}).filter((i) => i.estado !== "terminated"); linha = linha.replace(/<instancia-anterior>/g, _v.length > 1 ? _v[_v.length - 2].id : ""); }
  // a inscrição por SMS (o cliente que pediu pra sair) — procura em todos os tópicos
  if (linha.includes("<sub-sms>") && conta.sns) { let _a = ""; for (const t of Object.values(conta.sns.topicos || {})) { const s = (t.assinaturas || []).find((x) => x.protocolo === "sms"); if (s) { _a = s.arn; break; } } linha = linha.replace(/<sub-sms>/g, _a); }
  // <sub-arn>: a inscrição do tópico criado por ÚLTIMO (a que a atividade acabou
  // de fazer). Pegar a do primeiro tópico cancelava a inscrição SMS de outra
  // atividade sem ninguém perceber (achado em 25/09/2026).
  if (linha.includes("<sub-arn>") && conta.sns) { for (const t of Object.values(conta.sns.topicos || {}).reverse()) { const a = (t.assinaturas || [])[(t.assinaturas || []).length - 1]; if (a) { linha = linha.replace(/<sub-arn>/g, a.arn); break; } } }
  // cobertura: tabela de rotas, sub-rede e flow log criados nas proprias atividades
  if (linha.includes("<rtb-novo>") && conta.vpc) { const _t = Object.keys(conta.vpc.tabelas || {}); if (_t.length) linha = linha.replace(/<rtb-novo>/g, _t[_t.length - 1]); }
  if (linha.includes("<subnet-id>") && conta.vpc) { const _s = Object.keys(conta.vpc.subnets || {}); if (_s.length) linha = linha.replace(/<subnet-id>/g, _s[_s.length - 1]); }
  if (linha.includes("<flowlog-id>") && conta.vpc) { const _f = Object.keys(conta.vpc.flowLogs || conta.vpc.flowlogs || {}); if (_f.length) linha = linha.replace(/<flowlog-id>/g, _f[_f.length - 1]); }

  return linha;
}
