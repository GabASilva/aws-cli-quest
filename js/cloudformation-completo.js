"use strict";
// ============================================================
// CLImb — cloudformation-completo.js
// O CloudFormation do trabalho de verdade, por cima do cloudformation.js
// (que continua sendo o parser e o provisionador — CFN_BASE):
//   - template com Parameters, Outputs/Export, !Ref, !Sub, !GetAtt
//     (e a forma JSON Ref / Fn::Sub / Fn::GetAtt), pseudo-parâmetros;
//   - --capabilities: recurso IAM exige CAPABILITY_IAM, com nome próprio
//     exige CAPABILITY_NAMED_IAM (InsufficientCapabilitiesException);
//   - falha na criação NÃO é erro do comando: o stack vai pra
//     ROLLBACK_COMPLETE e o motivo fica nos eventos (describe-stack-events);
//   - update-stack, change sets (com Replacement, como no console), drift,
//     proteção contra exclusão, list-exports, get-template.
//
// Fontes (26/09/2026): `aws cloudformation <cmd> help` (AWS CLI 2.35.8) —
// formatos de saída e o texto das capabilities. Mensagens de erro usadas:
// "No updates are to be performed.", "Requires capabilities : [...]",
// "Parameters: [X] must have values", "The following resource(s) failed to
// create: [X]. Rollback requested by user.", "Stack [x] cannot be deleted
// while TerminationProtection is enabled" e "The submitted information
// didn't contain changes. Submit different information to create a change
// set." — o texto que o serviço devolve.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.cloudformation || typeof CFN_BASE === "undefined") return;
  const B = CFN_BASE;
  const base = Object.assign({}, SERVICOS.cloudformation);
  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";
  const uuid = () => `${hexAleatorio(8)}-${hexAleatorio(4)}-${hexAleatorio(4)}-${hexAleatorio(4)}-${hexAleatorio(12)}`;
  const erro = (op, tipo, msg) => new ErroCli(`An error occurred (${tipo}) when calling the ${op} operation: ${msg}`);
  const lista = (v) => [].concat(v === undefined || v === true ? [] : v).map(String).filter(Boolean);
  let relogio = 0;
  const carimbo = () => { relogio = Math.max(relogio + 7, Date.now()); return new Date(relogio).toISOString(); };

  const TIPOS_IAM = ["AWS::IAM::User", "AWS::IAM::Role", "AWS::IAM::Group", "AWS::IAM::ManagedPolicy", "AWS::IAM::Policy", "AWS::IAM::InstanceProfile", "AWS::IAM::AccessKey", "AWS::IAM::UserToGroupAddition"];
  const NOME_PROPRIO = { "AWS::IAM::User": "UserName", "AWS::IAM::Role": "RoleName", "AWS::IAM::Group": "GroupName", "AWS::IAM::ManagedPolicy": "ManagedPolicyName" };
  // propriedade que, mudando, obriga a AWS a criar um recurso NOVO
  const RECRIA = { "AWS::S3::Bucket": ["BucketName"], "AWS::DynamoDB::Table": ["TableName", "KeySchema"], "AWS::Lambda::Function": ["FunctionName"], "AWS::IAM::User": ["UserName"], "AWS::EC2::Instance": ["ImageId"] };
  const NOME_FISICO = { "AWS::S3::Bucket": "BucketName", "AWS::DynamoDB::Table": "TableName", "AWS::Lambda::Function": "FunctionName", "AWS::IAM::User": "UserName" };

  function cfn(conta) {
    const s = B.cfn(conta);
    s.apagadas = s.apagadas || [];
    s.deteccoes = s.deteccoes || {};
    return s;
  }
  function stackDe(conta, nome, op) {
    const st = cfn(conta);
    const s = st.stacks[String(nome)] || Object.values(st.stacks).find((x) => x.arn === String(nome));
    if (!s) throw erro(op, "ValidationError", `Stack with id ${nome} does not exist`);
    completar(s);
    return s;
  }
  // stacks criados antes deste arquivo (ou pelo cloudformation.js puro) ganham os campos novos
  function completar(s) {
    s.eventos = s.eventos || [];
    s.params = s.params || {};
    s.saidas = s.saidas || [];
    s.changeSets = s.changeSets || {};
    s.caps = s.caps || [];
    s.protecao = !!s.protecao;
    s.atualizado = s.atualizado || s.criadoEm;
    for (const r of s.recursos || []) { r.props = r.props || {}; r.atualizado = r.atualizado || s.criadoEm; }
    return s;
  }

  // ---------- o template ----------
  function lerCorpo(conta, flags, op) {
    const tb = flags["template-body"];
    if (tb === undefined || tb === true) throw new ErroCli("aws: error: one of the arguments --template-body --template-url is required" + (op === "UpdateStack" || op === "CreateChangeSet" ? " (ou --use-previous-template)" : ""));
    let texto;
    if (String(tb).startsWith("file://")) {
      const nome = String(tb).slice(7);
      texto = B.CFN_TEMPLATES[nome] !== undefined ? B.CFN_TEMPLATES[nome] : ((arquivoLocal(nome, conta) || {}).conteudo);
      if (texto === undefined) throw new ErroCli(`Error parsing parameter '--template-body': Unable to load paramfile ${tb}: [Errno 2] No such file or directory: '${nome}'`);
    } else texto = String(tb);
    let t;
    try { t = B.parseTemplate(texto); } catch (e) { throw erro(op, "ValidationError", String(e.message).replace(/^An error occurred \(\w+\) when calling the \w+ operation: /, "")); }
    if (!t.Resources || typeof t.Resources !== "object" || !Object.keys(t.Resources).length) throw erro(op, "ValidationError", "Template format error: At least one Resources member must be defined.");
    return { t, texto };
  }
  function tiposNaoSuportados(t) {
    const suportados = ["AWS::S3::Bucket", "AWS::IAM::User", "AWS::EC2::Instance", "AWS::Lambda::Function", "AWS::DynamoDB::Table"];
    return Object.values(t.Resources).map((r) => r && r.Type).filter((x) => x && suportados.indexOf(x) < 0);
  }
  function capsExigidas(t) {
    let iam = false, nomeado = false, recursos = [];
    for (const r of Object.values(t.Resources)) {
      if (r && TIPOS_IAM.indexOf(r.Type) >= 0) {
        iam = true;
        if (recursos.indexOf(r.Type) < 0) recursos.push(r.Type);
        if (NOME_PROPRIO[r.Type] && r.Properties && r.Properties[NOME_PROPRIO[r.Type]] !== undefined) nomeado = true;
      }
    }
    return { exige: nomeado ? "CAPABILITY_NAMED_IAM" : iam ? "CAPABILITY_IAM" : null, recursos };
  }
  function conferirCaps(t, flags, op) {
    const { exige } = capsExigidas(t);
    if (!exige) return lista(flags.capabilities);
    const dadas = lista(flags.capabilities);
    const basta = exige === "CAPABILITY_NAMED_IAM" ? dadas.indexOf("CAPABILITY_NAMED_IAM") >= 0 : (dadas.indexOf("CAPABILITY_IAM") >= 0 || dadas.indexOf("CAPABILITY_NAMED_IAM") >= 0);
    if (!basta) throw erro(op, "InsufficientCapabilitiesException", `Requires capabilities : [${exige}]\nO template cria recurso do IAM${exige === "CAPABILITY_NAMED_IAM" ? " com nome próprio" : ""}: declare com --capabilities ${exige}.`);
    return dadas;
  }
  // --parameters ParameterKey=X,ParameterValue=Y (ou UsePreviousValue=true)
  function resolverParams(t, flags, anteriores, op) {
    const decl = t.Parameters || {};
    const dados = {};
    for (const bruto of lista(flags.parameters)) {
      const p = parsearShorthand(bruto);
      if (!p.ParameterKey) throw new ErroCli(`Error parsing parameter '--parameters': cada parâmetro precisa de ParameterKey. Forma: ParameterKey=Ambiente,ParameterValue=dev`);
      dados[p.ParameterKey] = String(p.UsePreviousValue) === "true" ? { anterior: true } : { valor: p.ParameterValue };
    }
    const sobrando = Object.keys(dados).filter((k) => !decl[k]);
    if (sobrando.length) throw erro(op, "ValidationError", `Parameters: [${sobrando.join(", ")}] do not exist in the template`);
    const out = {}, faltam = [];
    for (const [k, d] of Object.entries(decl)) {
      let v;
      if (dados[k] && dados[k].anterior) {
        if (!anteriores || anteriores[k] === undefined) throw erro(op, "ValidationError", `Invalid input for parameter key ${k}. Cannot specify usePreviousValue as true for a parameter key not in the previous template`);
        v = anteriores[k];
      } else if (dados[k]) v = dados[k].valor;
      else if (d && d.Default !== undefined) v = String(d.Default);
      if (v === undefined) { faltam.push(k); continue; }
      const permitidos = d && d.AllowedValues ? [].concat(d.AllowedValues).map(String) : null;
      if (permitidos && permitidos.indexOf(String(v)) < 0) throw erro(op, "ValidationError", `Parameter '${k}' must be one of AllowedValues`);
      if (d && d.Type === "Number" && !/^-?\d+(\.\d+)?$/.test(String(v))) throw erro(op, "ValidationError", `Parameter '${k}' must be a number.`);
      out[k] = String(v);
    }
    if (faltam.length) throw erro(op, "ValidationError", `Parameters: [${faltam.join(", ")}] must have values`);
    return out;
  }

  // ---------- funções intrínsecas ----------
  function arnDe(conta, tipo, fisico) {
    if (tipo === "AWS::S3::Bucket") return `arn:aws:s3:::${fisico}`;
    if (tipo === "AWS::DynamoDB::Table") return `arn:aws:dynamodb:${REGIAO(conta)}:${CONTA_ID(conta)}:table/${fisico}`;
    if (tipo === "AWS::Lambda::Function") return `arn:aws:lambda:${REGIAO(conta)}:${CONTA_ID(conta)}:function:${fisico}`;
    if (tipo === "AWS::IAM::User") return `arn:aws:iam::${CONTA_ID(conta)}:user/${fisico}`;
    return fisico;
  }
  function contexto(conta, t, params, nomeStack, fisicos, tipos) {
    return { conta, t, params, nomeStack, fisicos, tipos };
  }
  class Pendente extends Error {}
  function ref(ctx, nome) {
    if (nome === "AWS::Region") return REGIAO(ctx.conta);
    if (nome === "AWS::AccountId") return CONTA_ID(ctx.conta);
    if (nome === "AWS::StackName") return ctx.nomeStack;
    if (nome === "AWS::Partition") return "aws";
    if (ctx.params[nome] !== undefined) return ctx.params[nome];
    if (ctx.t.Resources[nome]) {
      if (ctx.fisicos[nome] === undefined) throw new Pendente(nome);
      return ctx.fisicos[nome];
    }
    throw erro("CreateStack", "ValidationError", `Template format error: Unresolved resource dependencies [${nome}] in the Resources block of the template`);
  }
  function getAtt(ctx, alvo) {
    const [nome, atrib] = String(alvo).split(".");
    const fis = ref(ctx, nome);
    const tipo = ctx.tipos[nome] || (ctx.t.Resources[nome] || {}).Type;
    if (atrib === "Arn") return arnDe(ctx.conta, tipo, fis);
    return fis;
  }
  function sub(ctx, texto) {
    return String(texto).replace(/\$\{([^}]+)\}/g, (m, dentro) => dentro.indexOf(".") > 0 && !/^AWS::/.test(dentro) ? getAtt(ctx, dentro) : ref(ctx, dentro));
  }
  const tiraAspas = (s) => String(s).trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  function resolver(ctx, v) {
    if (typeof v === "string") {
      if (/^!Ref\s+/.test(v)) return ref(ctx, tiraAspas(v.replace(/^!Ref\s+/, "")));
      if (/^!Sub\s+/.test(v)) return sub(ctx, tiraAspas(v.replace(/^!Sub\s+/, "")));
      if (/^!GetAtt\s+/.test(v)) return getAtt(ctx, tiraAspas(v.replace(/^!GetAtt\s+/, "")));
      return v;
    }
    if (Array.isArray(v)) return v.map((x) => resolver(ctx, x));
    if (v && typeof v === "object") {
      if (v.Ref !== undefined && Object.keys(v).length === 1) return ref(ctx, v.Ref);
      if (v["Fn::Sub"] !== undefined) return sub(ctx, v["Fn::Sub"]);
      if (v["Fn::GetAtt"] !== undefined) return getAtt(ctx, [].concat(v["Fn::GetAtt"]).join("."));
      const o = {};
      for (const [k, x] of Object.entries(v)) o[k] = resolver(ctx, x);
      return o;
    }
    return v;
  }
  // referências a recursos que ainda não existem viram "(a criar)" — pra comparar
  function resolverSeguro(ctx, v) {
    try { return resolver(ctx, v); } catch (e) { if (e instanceof Pendente) return "{{a criar}}"; throw e; }
  }

  // ---------- estado de cada recurso ----------
  function existe(conta, tipo, nome) {
    if (tipo === "AWS::S3::Bucket") return !!(conta.s3.buckets || {})[nome];
    if (tipo === "AWS::IAM::User") return !!(conta.iam.usuarios || {})[nome];
    if (tipo === "AWS::Lambda::Function") return !!(conta.lambda.funcoes || {})[nome];
    if (tipo === "AWS::DynamoDB::Table") return !!(conta.dynamodb.tabelas || {})[nome];
    if (tipo === "AWS::EC2::Instance") { const i = (conta.ec2.instancias || {})[nome]; return !!i && i.estado !== "terminated"; }
    return false;
  }
  function criar(conta, logical, tipo, props) {
    const fis = B.criarRecurso(conta, logical, tipo, props);
    ajustar(conta, tipo, fis, props);
    return fis;
  }
  function ajustar(conta, tipo, fis, props) {
    if (tipo === "AWS::Lambda::Function") {
      const f = conta.lambda.funcoes[fis];
      if (f) {
        if (props.Timeout !== undefined) f.timeout = Number(props.Timeout);
        if (props.MemorySize !== undefined) f.memoria = Number(props.MemorySize);
        if (props.Runtime) f.runtime = props.Runtime;
        if (props.Handler) f.handler = props.Handler;
      }
    }
    if (tipo === "AWS::DynamoDB::Table" && conta.dynamodb.tabelas[fis] && props.BillingMode) conta.dynamodb.tabelas[fis].cobranca = props.BillingMode;
    if (tipo === "AWS::EC2::Instance" && conta.ec2.instancias[fis] && props.InstanceType) conta.ec2.instancias[fis].tipo = props.InstanceType;
  }
  function nomeQueVaiUsar(tipo, props) { return NOME_FISICO[tipo] ? props[NOME_FISICO[tipo]] : undefined; }
  const motivoExiste = (tipo, nome) => `Resource of type '${tipo}' with identifier '${nome}' already exists.`;

  // ordem de criação: quem é referenciado nasce antes
  function ordem(t) {
    const ids = Object.keys(t.Resources);
    const deps = {};
    for (const id of ids) {
      const txt = JSON.stringify(t.Resources[id].Properties || {});
      deps[id] = ids.filter((o) => o !== id && (new RegExp(`(!Ref ${o}\\b|"Ref":"${o}"|\\$\\{${o}[.}]|!GetAtt ${o}\\.|"Fn::GetAtt":\\["${o}")`)).test(txt));
    }
    const feito = [], vistos = {};
    const visitar = (id) => { if (vistos[id]) return; vistos[id] = true; for (const d of deps[id]) visitar(d); feito.push(id); };
    ids.forEach(visitar);
    return feito;
  }

  // ---------- eventos ----------
  function evento(s, logical, fisico, tipo, status, motivo) {
    const e = { StackId: s.arn, EventId: uuid(), StackName: s.nome, LogicalResourceId: logical, PhysicalResourceId: fisico || "", ResourceType: tipo, Timestamp: carimbo(), ResourceStatus: status };
    if (motivo) e.ResourceStatusReason = motivo;
    s.eventos.push(e);
    // a conta sincroniza com o servidor (teto de 100 KB): história curta
    if (s.eventos.length > 60) s.eventos.splice(0, s.eventos.length - 60);
  }
  // stack apagado vira só o resumo (o list-stacks e os eventos finais)
  const resumoApagado = (s) => ({ nome: s.nome, arn: s.arn, descricao: s.descricao, criadoEm: s.criadoEm, status: "DELETE_COMPLETE", apagadoEm: carimbo(), eventos: (s.eventos || []).slice(-20) });
  function guardarApagado(conta, s) {
    const l = cfn(conta).apagadas;
    l.push(resumoApagado(s));
    if (l.length > 15) l.splice(0, l.length - 15);
  }
  const evStack = (s, status, motivo) => evento(s, s.nome, s.arn, "AWS::CloudFormation::Stack", status, motivo);

  function calcularSaidas(conta, s, t, ctx) {
    const out = [];
    for (const [k, o] of Object.entries(t.Outputs || {})) {
      const x = { OutputKey: k, OutputValue: String(resolver(ctx, o.Value)) };
      if (o.Description) x.Description = o.Description;
      if (o.Export && o.Export.Name !== undefined) x.ExportName = String(resolver(ctx, o.Export.Name));
      out.push(x);
    }
    return out;
  }
  function exportConflito(conta, s, saidas) {
    for (const x of saidas) {
      if (!x.ExportName) continue;
      for (const o of Object.values(cfn(conta).stacks)) {
        if (o === s) continue;
        if ((o.saidas || []).some((y) => y.ExportName === x.ExportName)) return `Export with name ${x.ExportName} is already exported by stack ${o.nome}`;
      }
    }
    return null;
  }

  // ---------- criar (com rollback) ----------
  function provisionar(conta, s, t, params, onFailure) {
    const ctx = contexto(conta, t, params, s.nome, {}, {});
    const criados = [];
    let falha = null;
    for (const id of ordem(t)) {
      const def = t.Resources[id];
      ctx.tipos[id] = def.Type;
      const props = resolver(ctx, def.Properties || {});
      const nome = nomeQueVaiUsar(def.Type, props);
      evento(s, id, "", def.Type, "CREATE_IN_PROGRESS");
      if (nome && existe(conta, def.Type, nome)) { falha = { id, tipo: def.Type, motivo: motivoExiste(def.Type, nome) }; evento(s, id, "", def.Type, "CREATE_FAILED", falha.motivo); break; }
      const fis = criar(conta, id, def.Type, props);
      ctx.fisicos[id] = fis;
      evento(s, id, fis, def.Type, "CREATE_IN_PROGRESS", "Resource creation Initiated");
      evento(s, id, fis, def.Type, "CREATE_COMPLETE");
      criados.push({ LogicalResourceId: id, ResourceType: def.Type, PhysicalResourceId: fis, ResourceStatus: "CREATE_COMPLETE", props, atualizado: carimbo() });
    }
    let saidas = [];
    if (!falha) {
      saidas = calcularSaidas(conta, s, t, ctx);
      const c = exportConflito(conta, s, saidas);
      if (c) falha = { id: s.nome, tipo: "AWS::CloudFormation::Stack", motivo: c, deStack: true };
    }
    if (!falha) { s.recursos = criados; s.saidas = saidas; s.status = "CREATE_COMPLETE"; evStack(s, "CREATE_COMPLETE"); return true; }
    const msg = falha.deStack ? falha.motivo : `The following resource(s) failed to create: [${falha.id}]. `;
    if (onFailure === "DO_NOTHING") { s.recursos = criados; s.status = "CREATE_FAILED"; evStack(s, "CREATE_FAILED", msg.trim()); return false; }
    evStack(s, "ROLLBACK_IN_PROGRESS", falha.deStack ? msg : msg + "Rollback requested by user.");
    for (const r of criados.slice().reverse()) {
      evento(s, r.LogicalResourceId, r.PhysicalResourceId, r.ResourceType, "DELETE_IN_PROGRESS");
      B.apagarRecurso(conta, r.ResourceType, r.PhysicalResourceId);
      evento(s, r.LogicalResourceId, r.PhysicalResourceId, r.ResourceType, "DELETE_COMPLETE");
    }
    s.recursos = []; s.saidas = [];
    s.status = "ROLLBACK_COMPLETE";
    evStack(s, "ROLLBACK_COMPLETE");
    return false;
  }

  // ---------- update: o plano (é o que o change set mostra) ----------
  function planejar(conta, s, t, params) {
    const antigos = {};
    for (const r of s.recursos) antigos[r.LogicalResourceId] = r;
    const fisicos = {}, tipos = {};
    for (const r of s.recursos) { fisicos[r.LogicalResourceId] = r.PhysicalResourceId; tipos[r.LogicalResourceId] = r.ResourceType; }
    const ctx = contexto(conta, t, params, s.nome, Object.assign({}, fisicos), tipos);
    // recurso que vai ser recriado ou é novo: o nome físico ainda não existe
    const novos = Object.keys(t.Resources).filter((id) => !antigos[id]);
    for (const id of novos) delete ctx.fisicos[id];
    const mudancas = [];
    const brutoAntes = s.template ? s.template.Resources : null;
    for (const id of Object.keys(t.Resources)) {
      const def = t.Resources[id];
      const props = resolverSeguro(ctx, def.Properties || {});
      const velho = antigos[id];
      if (!velho) { mudancas.push({ acao: "Add", id, tipo: def.Type, props }); continue; }
      if (velho.ResourceType !== def.Type) { mudancas.push({ acao: "Modify", id, tipo: def.Type, fisico: velho.PhysicalResourceId, props, recria: true, detalhes: [{ nome: "Type", recria: true }] }); continue; }
      const chaves = Object.keys(Object.assign({}, velho.props, props));
      const difs = chaves.filter((k) => JSON.stringify(velho.props[k]) !== JSON.stringify(props[k]));
      if (!difs.length) continue;
      const brutoIgual = brutoAntes && brutoAntes[id] && JSON.stringify(brutoAntes[id].Properties || {}) === JSON.stringify(def.Properties || {});
      const detalhes = difs.map((k) => ({ nome: k, recria: (RECRIA[def.Type] || []).indexOf(k) >= 0, origem: brutoIgual ? "ParameterReference" : "DirectModification" }));
      mudancas.push({ acao: "Modify", id, tipo: def.Type, fisico: velho.PhysicalResourceId, props, recria: detalhes.some((x) => x.recria), detalhes });
    }
    for (const id of Object.keys(antigos)) if (!t.Resources[id]) mudancas.push({ acao: "Remove", id, tipo: antigos[id].ResourceType, fisico: antigos[id].PhysicalResourceId });
    return mudancas;
  }
  function mudancasJson(mudancas) {
    return mudancas.map((m) => {
      const rc = { Action: m.acao, LogicalResourceId: m.id, ResourceType: m.tipo };
      if (m.fisico) rc.PhysicalResourceId = m.fisico;
      if (m.acao === "Modify") {
        rc.Replacement = m.recria ? "True" : "False";
        rc.Scope = ["Properties"];
        rc.Details = m.detalhes.map((x) => ({ Target: { Attribute: "Properties", Name: x.nome, RequiresRecreation: x.recria ? "Always" : "Never" }, Evaluation: "Static", ChangeSource: x.origem || "DirectModification" }));
      } else { rc.Scope = []; rc.Details = []; }
      return { Type: "Resource", ResourceChange: rc };
    });
  }
  // aplica o plano; conflito de nome = UPDATE_ROLLBACK_COMPLETE, nada muda
  function aplicar(conta, s, t, params, texto, caps, mudancas) {
    evStack(s, "UPDATE_IN_PROGRESS", "User Initiated");
    const ctx = contexto(conta, t, params, s.nome, {}, {});
    for (const r of s.recursos) { ctx.fisicos[r.LogicalResourceId] = r.PhysicalResourceId; ctx.tipos[r.LogicalResourceId] = r.ResourceType; }
    for (const m of mudancas) if (m.acao === "Add" || m.recria) delete ctx.fisicos[m.id];
    // checagem antes de mexer: nome físico novo que já existe na conta
    for (const m of mudancas) {
      if (m.acao !== "Add" && !m.recria) continue;
      const props = resolverSeguro(ctx, t.Resources[m.id].Properties || {});
      const nome = nomeQueVaiUsar(m.tipo, props);
      if (nome && nome !== "{{a criar}}" && existe(conta, m.tipo, nome)) {
        evento(s, m.id, "", m.tipo, m.acao === "Add" ? "CREATE_FAILED" : "UPDATE_FAILED", motivoExiste(m.tipo, nome));
        evStack(s, "UPDATE_ROLLBACK_IN_PROGRESS", `The following resource(s) failed to ${m.acao === "Add" ? "create" : "update"}: [${m.id}]. `);
        evStack(s, "UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS");
        evStack(s, "UPDATE_ROLLBACK_COMPLETE");
        s.status = "UPDATE_ROLLBACK_COMPLETE"; s.atualizado = carimbo();
        return false;
      }
    }
    const porId = {};
    for (const r of s.recursos) porId[r.LogicalResourceId] = r;
    const velhosParaApagar = [];
    for (const id of ordem(t)) {
      const m = mudancas.find((x) => x.id === id);
      if (!m) continue;
      const def = t.Resources[id];
      ctx.tipos[id] = def.Type;
      const props = resolver(ctx, def.Properties || {});
      if (m.acao === "Add") {
        evento(s, id, "", def.Type, "CREATE_IN_PROGRESS");
        const fis = criar(conta, id, def.Type, props);
        ctx.fisicos[id] = fis;
        evento(s, id, fis, def.Type, "CREATE_COMPLETE");
        porId[id] = { LogicalResourceId: id, ResourceType: def.Type, PhysicalResourceId: fis, ResourceStatus: "CREATE_COMPLETE", props, atualizado: carimbo() };
      } else if (m.recria) {
        evento(s, id, m.fisico, def.Type, "UPDATE_IN_PROGRESS", "Requested update requires the creation of a new physical resource; hence creating one.");
        const fis = criar(conta, id, def.Type, props);
        ctx.fisicos[id] = fis;
        evento(s, id, fis, def.Type, "UPDATE_COMPLETE");
        velhosParaApagar.push({ id, tipo: def.Type, fisico: m.fisico });
        porId[id] = { LogicalResourceId: id, ResourceType: def.Type, PhysicalResourceId: fis, ResourceStatus: "UPDATE_COMPLETE", props, atualizado: carimbo() };
      } else {
        evento(s, id, m.fisico, def.Type, "UPDATE_IN_PROGRESS");
        ajustar(conta, def.Type, m.fisico, props);
        evento(s, id, m.fisico, def.Type, "UPDATE_COMPLETE");
        porId[id] = Object.assign({}, porId[id], { ResourceStatus: "UPDATE_COMPLETE", props, atualizado: carimbo() });
      }
    }
    evStack(s, "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS");
    for (const m of mudancas.filter((x) => x.acao === "Remove")) {
      evento(s, m.id, m.fisico, m.tipo, "DELETE_IN_PROGRESS");
      B.apagarRecurso(conta, m.tipo, m.fisico);
      evento(s, m.id, m.fisico, m.tipo, "DELETE_COMPLETE");
      delete porId[m.id];
    }
    for (const v of velhosParaApagar) {
      evento(s, v.id, v.fisico, v.tipo, "DELETE_IN_PROGRESS");
      B.apagarRecurso(conta, v.tipo, v.fisico);
      evento(s, v.id, v.fisico, v.tipo, "DELETE_COMPLETE");
    }
    s.recursos = Object.keys(t.Resources).filter((id) => porId[id]).map((id) => porId[id]);
    s.template = t; s.texto = texto; s.params = params; s.caps = caps;
    s.saidas = calcularSaidas(conta, s, t, ctx);
    s.status = "UPDATE_COMPLETE"; s.atualizado = carimbo();
    evStack(s, "UPDATE_COMPLETE");
    return true;
  }
  function podeAtualizar(s, op) {
    if (["CREATE_COMPLETE", "UPDATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE"].indexOf(s.status) < 0) throw erro(op, "ValidationError", `Stack:${s.arn} is in ${s.status} state and can not be updated.${s.status === "ROLLBACK_COMPLETE" ? "\nStack que nasceu em ROLLBACK_COMPLETE não se conserta: apague (delete-stack) e crie de novo." : ""}`);
  }
  function novoTemplate(conta, s, flags, op) {
    if (flags["use-previous-template"] === true || flags["use-previous-template"] === "true") {
      if (!s.template) throw erro(op, "ValidationError", "Template format error: o stack não guardou o template anterior.");
      return { t: s.template, texto: s.texto };
    }
    return lerCorpo(conta, flags, op);
  }

  // ---------- drift ----------
  function driftDe(conta, r) {
    const p = r.props || {}, tipo = r.ResourceType, id = r.PhysicalResourceId;
    const x = { StackResourceDriftStatus: "IN_SYNC", PropertyDifferences: [], esperado: p, atual: null };
    if (!existe(conta, tipo, id)) { x.StackResourceDriftStatus = "DELETED"; return x; }
    const atual = Object.assign({}, p);
    const comparar = (prop, valorReal) => {
      atual[prop] = valorReal;
      if (p[prop] !== undefined && String(p[prop]) !== String(valorReal)) x.PropertyDifferences.push({ PropertyPath: "/" + prop, ExpectedValue: String(p[prop]), ActualValue: String(valorReal), DifferenceType: "NOT_EQUAL" });
    };
    if (tipo === "AWS::Lambda::Function") { const f = conta.lambda.funcoes[id]; comparar("Timeout", f.timeout); comparar("MemorySize", f.memoria); }
    if (tipo === "AWS::DynamoDB::Table") comparar("BillingMode", conta.dynamodb.tabelas[id].cobranca);
    if (tipo === "AWS::EC2::Instance") comparar("InstanceType", conta.ec2.instancias[id].tipo);
    x.atual = atual;
    if (x.PropertyDifferences.length) x.StackResourceDriftStatus = "MODIFIED";
    return x;
  }

  // ---------- saídas comuns ----------
  function stackJson(conta, s) {
    const o = { StackId: s.arn, StackName: s.nome, Description: s.descricao || undefined, Parameters: Object.keys(s.params).length ? Object.entries(s.params).map(([k, v]) => ({ ParameterKey: k, ParameterValue: v })) : undefined,
      CreationTime: s.criadoEm, LastUpdatedTime: s.atualizado !== s.criadoEm ? s.atualizado : undefined, RollbackConfiguration: {}, StackStatus: s.status,
      DisableRollback: false, NotificationARNs: [], Capabilities: s.caps.length ? s.caps : undefined, Outputs: s.saidas.length ? s.saidas : undefined, Tags: [],
      EnableTerminationProtection: s.protecao, DriftInformation: s.drift ? { StackDriftStatus: s.drift.status, LastCheckTimestamp: s.drift.quando } : { StackDriftStatus: "NOT_CHECKED" } };
    const motivo = s.eventos.slice().reverse().find((e) => e.LogicalResourceId === s.nome && e.ResourceStatusReason && /ROLLBACK|FAILED/.test(e.ResourceStatus));
    if (motivo && /ROLLBACK|FAILED/.test(s.status)) o.StackStatusReason = motivo.ResourceStatusReason;
    return o;
  }
  const driftRecurso = (s, r) => ({ StackResourceDriftStatus: s.drift && s.drift.recursos[r.LogicalResourceId] ? s.drift.recursos[r.LogicalResourceId] : "NOT_CHECKED" });

  function changeSetDe(conta, flags, op) {
    const nome = String(exigirFlag(flags, "change-set-name"));
    const st = cfn(conta);
    let s = null, cs = null;
    if (/^arn:aws:cloudformation:/.test(nome)) {
      for (const x of Object.values(st.stacks)) { completar(x); const a = Object.values(x.changeSets).find((y) => y.arn === nome); if (a) { s = x; cs = a; } }
    } else {
      if (flags["stack-name"] === undefined) throw erro(op, "ValidationError", "StackName must be specified if ChangeSetName is not specified as an ARN.");
      s = st.stacks[String(flags["stack-name"])];
      if (s) { completar(s); cs = s.changeSets[nome]; }
    }
    if (!cs) throw erro(op, "ChangeSetNotFound", `ChangeSet [${nome}] does not exist`);
    return { s, cs };
  }

  Object.assign(SERVICOS.cloudformation, {
    "create-stack": (conta, pos, flags) => {
      const op = "CreateStack";
      const nome = String(exigirFlag(flags, "stack-name"));
      const st = cfn(conta);
      if (st.stacks[nome]) throw erro(op, "AlreadyExistsException", `Stack [${nome}] already exists`);
      const { t, texto } = lerCorpo(conta, flags, op);
      const fora = tiposNaoSuportados(t);
      if (fora.length) throw erro(op, "ValidationError", `Template format error: Unrecognized resource types: [${fora.join(", ")}]\n(no simulador: AWS::S3::Bucket, AWS::IAM::User, AWS::EC2::Instance, AWS::Lambda::Function, AWS::DynamoDB::Table)`);
      const caps = conferirCaps(t, flags, op);
      const params = resolverParams(t, flags, null, op);
      // referência a algo que não existe no template é erro na hora, não rollback
      const ctx = contexto(conta, t, params, nome, {}, {});
      for (const def of Object.values(t.Resources)) resolverSeguro(ctx, def.Properties || {});
      const onFailure = flags["on-failure"] !== undefined ? String(flags["on-failure"]) : (flags["disable-rollback"] === true ? "DO_NOTHING" : "ROLLBACK");
      if (["DO_NOTHING", "ROLLBACK", "DELETE"].indexOf(onFailure) < 0) throw new ErroCli(`\nInvalid choice: '${onFailure}', valid choices are: 'DO_NOTHING', 'ROLLBACK', 'DELETE'`);
      const agora = carimbo();
      const s = completar({ nome, arn: B.stackArn(conta, nome), status: "CREATE_IN_PROGRESS", descricao: t.Description || "", recursos: [], criadoEm: agora, template: t, texto, params, caps });
      st.stacks[nome] = s;
      evStack(s, "CREATE_IN_PROGRESS", "User Initiated");
      const ok = provisionar(conta, s, t, params, onFailure);
      if (!ok && onFailure === "DELETE") { delete st.stacks[nome]; guardarApagado(conta, s); }
      avisarClimb(ok
        ? "Stack criado. Aqui ele termina na hora; na AWS de verdade o create-stack só RECEBE o pedido — o resultado (CREATE_COMPLETE ou rollback) você confere com describe-stacks."
        : "O comando voltou sucesso — mas o stack FALHOU e fez rollback: tudo o que ele chegou a criar foi apagado. É assim na AWS: o create-stack só recebe o pedido. Confira com describe-stacks (StackStatus) e o motivo em describe-stack-events.");
      return js({ StackId: s.arn });
    },
    "validate-template": (conta, pos, flags) => {
      const { t } = lerCorpo(conta, flags, "ValidateTemplate");
      const { exige, recursos } = capsExigidas(t);
      const o = { Parameters: Object.entries(t.Parameters || {}).map(([k, d]) => { const x = { ParameterKey: k, NoEcho: false }; if (d && d.Default !== undefined) x.DefaultValue = String(d.Default); if (d && d.Description) x.Description = d.Description; return x; }), Description: t.Description || undefined };
      if (exige) { o.Capabilities = [exige]; o.CapabilitiesReason = `The following resource(s) require capabilities: [${recursos.join(", ")}]`; }
      return js(o);
    },
    "list-stacks": (conta, pos, flags) => {
      const st = cfn(conta);
      const filtro = lista(flags["stack-status-filter"]);
      let l = Object.values(st.stacks).map((s) => { completar(s); return { StackId: s.arn, StackName: s.nome, TemplateDescription: s.descricao || undefined, CreationTime: s.criadoEm, LastUpdatedTime: s.atualizado !== s.criadoEm ? s.atualizado : undefined, StackStatus: s.status, DriftInformation: { StackDriftStatus: s.drift ? s.drift.status : "NOT_CHECKED" } }; })
        .concat(st.apagadas.map((s) => ({ StackId: s.arn, StackName: s.nome, TemplateDescription: s.descricao || undefined, CreationTime: s.criadoEm, DeletionTime: s.apagadoEm, StackStatus: "DELETE_COMPLETE", DriftInformation: { StackDriftStatus: "NOT_CHECKED" } })));
      if (filtro.length) l = l.filter((x) => filtro.indexOf(x.StackStatus) >= 0);
      return js({ StackSummaries: l });
    },
    "describe-stacks": (conta, pos, flags) => {
      const st = cfn(conta);
      const l = flags["stack-name"] !== undefined && flags["stack-name"] !== true ? [stackDe(conta, flags["stack-name"], "DescribeStacks")] : Object.values(st.stacks).map(completar);
      return js({ Stacks: l.map((s) => stackJson(conta, s)) });
    },
    "describe-stack-resources": (conta, pos, flags) => {
      const s = stackDe(conta, exigirFlag(flags, "stack-name"), "DescribeStackResources");
      return js({ StackResources: s.recursos.map((r) => ({ StackName: s.nome, StackId: s.arn, LogicalResourceId: r.LogicalResourceId, PhysicalResourceId: r.PhysicalResourceId, ResourceType: r.ResourceType, Timestamp: r.atualizado, ResourceStatus: r.ResourceStatus, DriftInformation: driftRecurso(s, r) })) });
    },
    "delete-stack": (conta, pos, flags) => {
      const op = "DeleteStack";
      const s = stackDe(conta, exigirFlag(flags, "stack-name"), op);
      if (s.protecao) { s.tentouApagar = true; throw erro(op, "ValidationError", `Stack [${s.nome}] cannot be deleted while TerminationProtection is enabled`); }
      evStack(s, "DELETE_IN_PROGRESS", "User Initiated");
      for (const r of s.recursos.slice().reverse()) {
        evento(s, r.LogicalResourceId, r.PhysicalResourceId, r.ResourceType, "DELETE_IN_PROGRESS");
        B.apagarRecurso(conta, r.ResourceType, r.PhysicalResourceId);
        evento(s, r.LogicalResourceId, r.PhysicalResourceId, r.ResourceType, "DELETE_COMPLETE");
      }
      evStack(s, "DELETE_COMPLETE");
      delete cfn(conta).stacks[s.nome];
      guardarApagado(conta, s);
      return okSilencioso(`Stack "${s.nome}" e seus ${s.recursos.length} recurso(s) foram removidos. Ele continua aparecendo no list-stacks como DELETE_COMPLETE por 90 dias.`);
    },
    "describe-stack-events": (conta, pos, flags) => {
      const nome = exigirFlag(flags, "stack-name");
      const st = cfn(conta);
      const s = st.stacks[String(nome)] || st.apagadas.slice().reverse().find((x) => x.nome === String(nome));
      if (!s) throw erro("DescribeStackEvents", "ValidationError", `Stack [${nome}] does not exist`);
      completar(s);
      const l = s.eventos.slice().reverse();
      if (/ROLLBACK|FAILED/.test(s.status)) avisarClimb("Os eventos vêm do mais novo pro mais velho. O motivo de verdade está no primeiro evento com status *_FAILED (ResourceStatusReason) — os ROLLBACK que vêm depois são só a limpeza.");
      return js({ StackEvents: l });
    },
    "list-exports": (conta) => {
      const out = [];
      for (const s of Object.values(cfn(conta).stacks)) for (const x of (s.saidas || [])) if (x.ExportName) out.push({ ExportingStackId: s.arn, Name: x.ExportName, Value: x.OutputValue });
      if (!out.length) avisarClimb("Nenhum export. Export é uma saída (Outputs) com Export.Name: o jeito de um stack passar um valor pra outro (Fn::ImportValue) sem copiar e colar.");
      return js({ Exports: out });
    },
    "update-stack": (conta, pos, flags) => {
      const op = "UpdateStack";
      const s = stackDe(conta, exigirFlag(flags, "stack-name"), op);
      podeAtualizar(s, op);
      const { t, texto } = novoTemplate(conta, s, flags, op);
      const fora = tiposNaoSuportados(t);
      if (fora.length) throw erro(op, "ValidationError", `Template format error: Unrecognized resource types: [${fora.join(", ")}]`);
      const caps = conferirCaps(t, flags, op);
      const params = resolverParams(t, flags, s.params, op);
      const mudancas = planejar(conta, s, t, params);
      if (!mudancas.length) throw erro(op, "ValidationError", "No updates are to be performed.");
      const ok = aplicar(conta, s, t, params, texto, caps, mudancas);
      const recria = mudancas.filter((m) => m.recria).map((m) => m.id);
      avisarClimb(!ok ? "O update FALHOU e voltou atrás (UPDATE_ROLLBACK_COMPLETE): nada mudou. O motivo está em describe-stack-events."
        : recria.length ? `Atualizado — e ${recria.join(", ")} foi RECRIADO (recurso novo, o antigo apagado). Pra ver isso ANTES de aplicar, use change set.`
          : "Atualizado. Update direto aplica sem mostrar o que vai mudar; em produção, o time costuma passar por um change set antes.");
      return js({ StackId: s.arn });
    },
    "get-template": (conta, pos, flags) => {
      const s = stackDe(conta, exigirFlag(flags, "stack-name"), "GetTemplate");
      let corpo = s.texto;
      if (corpo === undefined) corpo = s.template || "";
      else if (String(corpo).trim().charAt(0) === "{") { try { corpo = JSON.parse(corpo); } catch (e) { /* fica texto */ } }
      avisarClimb("É o template que está APLICADO no stack agora — a fonte da verdade, mesmo que o arquivo no seu computador tenha mudado.");
      return js({ TemplateBody: corpo, StagesAvailable: ["Original", "Processed"] });
    },
    "list-stack-resources": (conta, pos, flags) => {
      const s = stackDe(conta, exigirFlag(flags, "stack-name"), "ListStackResources");
      return js({ StackResourceSummaries: s.recursos.map((r) => ({ LogicalResourceId: r.LogicalResourceId, PhysicalResourceId: r.PhysicalResourceId, ResourceType: r.ResourceType, LastUpdatedTimestamp: r.atualizado, ResourceStatus: r.ResourceStatus, DriftInformation: driftRecurso(s, r) })) });
    },
    "describe-stack-resource": (conta, pos, flags) => {
      const op = "DescribeStackResource";
      const s = stackDe(conta, exigirFlag(flags, "stack-name"), op);
      const id = String(exigirFlag(flags, "logical-resource-id"));
      const r = s.recursos.find((x) => x.LogicalResourceId === id);
      if (!r) throw erro(op, "ValidationError", `Resource ${id} does not exist for stack ${s.nome}`);
      return js({ StackResourceDetail: { StackName: s.nome, StackId: s.arn, LogicalResourceId: r.LogicalResourceId, PhysicalResourceId: r.PhysicalResourceId, ResourceType: r.ResourceType, LastUpdatedTimestamp: r.atualizado, ResourceStatus: r.ResourceStatus, Metadata: "{}", DriftInformation: driftRecurso(s, r) } });
    },
    "update-termination-protection": (conta, pos, flags) => {
      const s = stackDe(conta, exigirFlag(flags, "stack-name"), "UpdateTerminationProtection");
      if (flags["enable-termination-protection"] === true) s.protecao = true;
      else if (flags["no-enable-termination-protection"] === true) s.protecao = false;
      else throw new ErroCli("aws: error: one of the arguments --enable-termination-protection --no-enable-termination-protection is required");
      avisarClimb(s.protecao ? "Proteção ligada: delete-stack agora é recusado. Quem precisar apagar de propósito tem que desligar antes — um passo a mais que evita o desastre do comando no terminal errado."
        : "Proteção desligada: o stack pode ser apagado de novo.");
      return js({ StackId: s.arn });
    },
    "create-change-set": (conta, pos, flags) => {
      const op = "CreateChangeSet";
      const st = cfn(conta);
      const nomeStack = String(exigirFlag(flags, "stack-name"));
      const nome = String(exigirFlag(flags, "change-set-name"));
      if (!/^[A-Za-z][-A-Za-z0-9]{0,127}$/.test(nome)) throw erro(op, "ValidationError", `1 validation error detected: Value '${nome}' at 'changeSetName' failed to satisfy constraint: começa com letra; só letras, números e hífen.`);
      const tipoCs = flags["change-set-type"] !== undefined ? String(flags["change-set-type"]) : "UPDATE";
      if (["CREATE", "UPDATE"].indexOf(tipoCs) < 0) throw new ErroCli(`\nInvalid choice: '${tipoCs}', valid choices are: 'CREATE', 'UPDATE', 'IMPORT'`);
      let s = st.stacks[nomeStack];
      if (tipoCs === "UPDATE" && !s) throw erro(op, "ValidationError", `Stack [${nomeStack}] does not exist\nPra um stack que ainda não existe, use --change-set-type CREATE.`);
      if (tipoCs === "CREATE" && s) throw erro(op, "ValidationError", `Stack [${nomeStack}] already exists and cannot be created again with the changeSet [${nome}].`);
      if (s) { completar(s); if (s.status !== "REVIEW_IN_PROGRESS") podeAtualizar(s, op); }
      if (s && s.changeSets[nome]) throw erro(op, "AlreadyExistsException", `ChangeSet [${nome}] already exists`);
      const { t, texto } = s && tipoCs === "UPDATE" ? novoTemplate(conta, s, flags, op) : lerCorpo(conta, flags, op);
      const caps = conferirCaps(t, flags, op);
      const params = resolverParams(t, flags, s ? s.params : null, op);
      if (!s) {
        s = completar({ nome: nomeStack, arn: B.stackArn(conta, nomeStack), status: "REVIEW_IN_PROGRESS", descricao: t.Description || "", recursos: [], criadoEm: carimbo(), template: null, texto: undefined, params: {}, caps: [] });
        st.stacks[nomeStack] = s;
        evStack(s, "REVIEW_IN_PROGRESS", "User Initiated");
      }
      const mudancas = planejar(conta, s, t, params);
      const cs = { nome, arn: `arn:aws:cloudformation:${REGIAO(conta)}:${CONTA_ID(conta)}:changeSet/${nome}/${uuid()}`, tipo: tipoCs, t, texto, params, caps, mudancas, criado: carimbo(),
        status: mudancas.length ? "CREATE_COMPLETE" : "FAILED", exec: mudancas.length ? "AVAILABLE" : "UNAVAILABLE",
        motivo: mudancas.length ? undefined : "The submitted information didn't contain changes. Submit different information to create a change set.", descricao: flags.description !== undefined ? String(flags.description) : undefined };
      s.changeSets[nome] = cs;
      avisarClimb(mudancas.length ? `Change set criado — nada mudou ainda. Veja o que ele FARIA com: aws cloudformation describe-change-set --stack-name ${s.nome} --change-set-name ${nome} (repare no campo Replacement).`
        : "Change set criado com status FAILED: o template e os parâmetros não mudam nada no stack.");
      return js({ Id: cs.arn, StackId: s.arn });
    },
    "describe-change-set": (conta, pos, flags) => {
      const { s, cs } = changeSetDe(conta, flags, "DescribeChangeSet");
      const troca = cs.mudancas.filter((m) => m.recria).map((m) => m.id);
      if (troca.length) avisarClimb(`ATENÇÃO: Replacement "True" em ${troca.join(", ")} — o recurso seria APAGADO e criado de novo. Numa tabela, isso é perder os dados. É pra isso que change set existe: ver antes.`);
      return js({ Changes: mudancasJson(cs.mudancas), ChangeSetName: cs.nome, ChangeSetId: cs.arn, StackId: s.arn, StackName: s.nome, Description: cs.descricao || null,
        Parameters: Object.keys(cs.params).length ? Object.entries(cs.params).map(([k, v]) => ({ ParameterKey: k, ParameterValue: v })) : null,
        CreationTime: cs.criado, ExecutionStatus: cs.exec, Status: cs.status, StatusReason: cs.motivo || null, NotificationARNs: [], RollbackConfiguration: {}, Capabilities: cs.caps, Tags: null });
    },
    "list-change-sets": (conta, pos, flags) => {
      const s = stackDe(conta, exigirFlag(flags, "stack-name"), "ListChangeSets");
      const l = Object.values(s.changeSets);
      if (!l.length) avisarClimb("Nenhum change set pendente nesse stack. Quando um change set é executado, a AWS apaga todos os outros do stack.");
      return js({ Summaries: l.map((cs) => ({ StackId: s.arn, StackName: s.nome, ChangeSetId: cs.arn, ChangeSetName: cs.nome, ExecutionStatus: cs.exec, Status: cs.status, StatusReason: cs.motivo, CreationTime: cs.criado, Description: cs.descricao })) });
    },
    "execute-change-set": (conta, pos, flags) => {
      const op = "ExecuteChangeSet";
      const { s, cs } = changeSetDe(conta, flags, op);
      if (cs.exec !== "AVAILABLE") throw erro(op, "InvalidChangeSetStatus", `ChangeSet [${cs.arn}] cannot be executed in its current status of [${cs.status}]`);
      let ok;
      if (s.status === "REVIEW_IN_PROGRESS") {
        s.template = cs.t; s.texto = cs.texto; s.params = cs.params; s.caps = cs.caps;
        evStack(s, "CREATE_IN_PROGRESS", "User Initiated");
        ok = provisionar(conta, s, cs.t, cs.params, "ROLLBACK");
      } else ok = aplicar(conta, s, cs.t, cs.params, cs.texto, cs.caps, planejar(conta, s, cs.t, cs.params));
      s.changeSets = {};
      avisarClimb(ok ? "Change set executado: o stack mudou exatamente como o describe-change-set mostrou. A AWS apaga os outros change sets do stack — eles foram calculados em cima da versão antiga."
        : "Change set executado, mas o stack falhou e voltou atrás. O motivo está em describe-stack-events.");
      return "";
    },
    "delete-change-set": (conta, pos, flags) => {
      const { s, cs } = changeSetDe(conta, flags, "DeleteChangeSet");
      delete s.changeSets[cs.nome];
      avisarClimb("Change set apagado. O stack não mudou nada — é o jeito de dizer \"não, isso não vai pra produção\".");
      return "";
    },
    "detect-stack-drift": (conta, pos, flags) => {
      const s = stackDe(conta, exigirFlag(flags, "stack-name"), "DetectStackDrift");
      if (["CREATE_COMPLETE", "UPDATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE"].indexOf(s.status) < 0) throw erro("DetectStackDrift", "ValidationError", `Stack ${s.nome} is in ${s.status} state and drift detection cannot be performed.`);
      const id = uuid();
      const recursos = {}, detalhes = {};
      for (const r of s.recursos) { const x = driftDe(conta, r); recursos[r.LogicalResourceId] = x.StackResourceDriftStatus; detalhes[r.LogicalResourceId] = x; }
      const n = Object.values(recursos).filter((v) => v !== "IN_SYNC").length;
      const quando = carimbo();
      s.drift = { id, status: n ? "DRIFTED" : "IN_SYNC", quando, recursos, detalhes, contagem: n };
      cfn(conta).deteccoes[id] = { stack: s.nome, arn: s.arn, status: s.drift.status, contagem: n, quando };
      avisarClimb("Detecção iniciada. Ela compara cada recurso do stack com o que está na conta AGORA. O resultado: describe-stack-drift-detection-status --stack-drift-detection-id " + id);
      return js({ StackDriftDetectionId: id });
    },
    "describe-stack-drift-detection-status": (conta, pos, flags) => {
      const id = String(exigirFlag(flags, "stack-drift-detection-id"));
      const d = cfn(conta).deteccoes[id];
      if (!d) throw erro("DescribeStackDriftDetectionStatus", "ValidationError", `Drift detection operation ${id} does not exist\nO id vem do detect-stack-drift.`);
      if (d.status === "DRIFTED") avisarClimb(`DRIFTED: ${d.contagem} recurso(s) não bate(m) mais com o template — alguém mexeu fora do CloudFormation. O quê exatamente: describe-stack-resource-drifts --stack-name ${d.stack}`);
      return js({ StackId: d.arn, StackDriftDetectionId: id, StackDriftStatus: d.status, DetectionStatus: "DETECTION_COMPLETE", DriftedStackResourceCount: d.contagem, Timestamp: d.quando });
    },
    "describe-stack-resource-drifts": (conta, pos, flags) => {
      const s = stackDe(conta, exigirFlag(flags, "stack-name"), "DescribeStackResourceDrifts");
      if (!s.drift) { avisarClimb("Esse stack nunca passou por detecção de drift. Rode antes: aws cloudformation detect-stack-drift --stack-name " + s.nome); return js({ StackResourceDrifts: [] }); }
      const filtro = lista(flags["stack-resource-drift-status-filters"]);
      const l = s.recursos.filter((r) => s.drift.detalhes[r.LogicalResourceId]).map((r) => {
        const x = s.drift.detalhes[r.LogicalResourceId];
        const o = { StackId: s.arn, LogicalResourceId: r.LogicalResourceId, PhysicalResourceId: r.PhysicalResourceId, ResourceType: r.ResourceType, ExpectedProperties: JSON.stringify(x.esperado) };
        if (x.atual) o.ActualProperties = JSON.stringify(x.atual);
        o.PropertyDifferences = x.PropertyDifferences;
        o.StackResourceDriftStatus = x.StackResourceDriftStatus;
        o.Timestamp = s.drift.quando;
        return o;
      }).filter((o) => !filtro.length || filtro.indexOf(o.StackResourceDriftStatus) >= 0);
      return js({ StackResourceDrifts: l });
    },
  });

  // ============================================================
  // TEMPLATES DO LAB
  // ============================================================
  const lambda = (timeout, memoria) =>
    "  FuncaoPedidos:\n" +
    "    Type: AWS::Lambda::Function\n" +
    "    Properties:\n" +
    '      FunctionName: !Sub "pedidos-api-${Ambiente}"\n' +
    "      Runtime: python3.12\n" +
    "      Handler: index.handler\n" +
    "      Role: arn:aws:iam::123456789012:role/lambda-exec\n" +
    `      Timeout: ${timeout}\n` +
    `      MemorySize: ${memoria}\n`;
  const tabela = (nome) =>
    "  TabelaPedidos:\n" +
    "    Type: AWS::DynamoDB::Table\n" +
    "    Properties:\n" +
    `      TableName: !Sub "${nome}"\n` +
    "      AttributeDefinitions:\n" +
    "        - AttributeName: id\n" +
    "          AttributeType: S\n" +
    "      KeySchema:\n" +
    "        - AttributeName: id\n" +
    "          KeyType: HASH\n" +
    "      BillingMode: PAY_PER_REQUEST\n";
  const bucket =
    "  BucketAnexos:\n" +
    "    Type: AWS::S3::Bucket\n" +
    "    Properties:\n" +
    '      BucketName: !Sub "pedidos-anexos-${Ambiente}-${AWS::AccountId}"\n';
  const cabeca = (desc) =>
    'AWSTemplateFormatVersion: "2010-09-09"\n' +
    `Description: ${desc}\n` +
    "Parameters:\n" +
    "  Ambiente:\n" +
    "    Type: String\n" +
    "    Default: dev\n" +
    "    AllowedValues:\n" +
    "      - dev\n" +
    "      - prod\n" +
    "    Description: Ambiente da API (dev ou prod)\n" +
    "Resources:\n";
  const saidas =
    "Outputs:\n" +
    "  NomeDaTabela:\n" +
    "    Description: Tabela onde a API grava os pedidos\n" +
    "    Value: !Ref TabelaPedidos\n" +
    "    Export:\n" +
    '      Name: !Sub "${AWS::StackName}-tabela"\n' +
    "  FuncaoArn:\n" +
    "    Description: ARN da funcao da API\n" +
    "    Value: !GetAtt FuncaoPedidos.Arn\n";
  const TEMPLATES = {
    "pedidos-api.yaml": cabeca("API de pedidos - tabela e funcao") + tabela("pedidos-${Ambiente}") + lambda(10, 128) + saidas,
    "pedidos-api-v2.yaml": cabeca("API de pedidos - timeout maior e bucket de anexos") + tabela("pedidos-${Ambiente}") + lambda(30, 128) + bucket + saidas,
    "pedidos-api-v3.yaml": cabeca("API de pedidos - tabela renomeada") + tabela("pedidos-v2-${Ambiente}") + lambda(30, 128) + bucket + saidas,
    "pedidos-api-v4.yaml": cabeca("API de pedidos - mais memoria na funcao") + tabela("pedidos-${Ambiente}") + lambda(30, 256) + bucket + saidas,
    "estoque-copia.yaml":
      'AWSTemplateFormatVersion: "2010-09-09"\n' +
      "Description: Estoque - copiado do template de pedidos\n" +
      "Resources:\n" +
      "  TabelaEstoque:\n" +
      "    Type: AWS::DynamoDB::Table\n" +
      "    Properties:\n" +
      "      TableName: estoque-central\n" +
      "      AttributeDefinitions:\n" +
      "        - AttributeName: sku\n" +
      "          AttributeType: S\n" +
      "      KeySchema:\n" +
      "        - AttributeName: sku\n" +
      "          KeyType: HASH\n" +
      "      BillingMode: PAY_PER_REQUEST\n" +
      "  TabelaMovimentos:\n" +
      "    Type: AWS::DynamoDB::Table\n" +
      "    Properties:\n" +
      "      TableName: pedidos-dev\n" +
      "      AttributeDefinitions:\n" +
      "        - AttributeName: id\n" +
      "          AttributeType: S\n" +
      "      KeySchema:\n" +
      "        - AttributeName: id\n" +
      "          KeyType: HASH\n" +
      "      BillingMode: PAY_PER_REQUEST\n",
  };
  TEMPLATES["estoque.yaml"] = TEMPLATES["estoque-copia.yaml"]
    .replace("Estoque - copiado do template de pedidos", "Estoque - tabela de itens e de movimentos")
    .replace("TableName: pedidos-dev", "TableName: estoque-movimentos");
  for (const [nome, texto] of Object.entries(TEMPLATES)) {
    B.CFN_TEMPLATES[nome] = texto;
    if (typeof ARQUIVOS_LOCAIS !== "undefined") ARQUIVOS_LOCAIS[nome] = texto.length;
    if (typeof window !== "undefined") { window.ARQUIVOS_CONTEUDO = window.ARQUIVOS_CONTEUDO || {}; window.ARQUIVOS_CONTEUDO[nome] = texto; }
  }

  // ============================================================
  // MANUAIS
  // ============================================================
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => "USO\n    " + uso + "\n\n" + txt;
    Object.assign(MANUAIS, {
      cloudformation: "aws cloudformation — AWS CloudFormation\n\nInfraestrutura como código: você descreve os recursos num template (YAML\nou JSON) e o CloudFormation cria, atualiza e apaga tudo junto, como um\nSTACK.\n\nO TEMPLATE\n    Parameters   valores que mudam por ambiente (dev, prod)\n    Resources    o que criar (obrigatório)\n    Outputs      o que o stack devolve (e Export pra outros stacks)\n    !Ref, !Sub, !GetAtt   ligam uma parte na outra\n\nCOMANDOS\n    validate-template / create-stack / describe-stacks / list-stacks / delete-stack\n    describe-stack-events / describe-stack-resources / list-stack-resources\n    describe-stack-resource / get-template / list-exports\n    update-stack / create-change-set / describe-change-set / list-change-sets\n    execute-change-set / delete-change-set\n    detect-stack-drift / describe-stack-drift-detection-status\n    describe-stack-resource-drifts / update-termination-protection\n\nTipos de recurso no simulador: AWS::S3::Bucket, AWS::IAM::User,\nAWS::EC2::Instance, AWS::Lambda::Function, AWS::DynamoDB::Table.",
      "cloudformation.create-stack": M("aws cloudformation create-stack --stack-name <nome> --template-body file://<template> \\\n        [--parameters ParameterKey=<p>,ParameterValue=<v> ...] [--capabilities CAPABILITY_IAM|CAPABILITY_NAMED_IAM] \\\n        [--on-failure ROLLBACK|DO_NOTHING|DELETE]",
        "Cria o stack. O comando só RECEBE o pedido e devolve o StackId: se um\nrecurso falhar, o stack faz ROLLBACK (apaga o que criou) e termina em\nROLLBACK_COMPLETE — confira com describe-stacks e describe-stack-events.\n\nCAPABILITIES\n    template com recurso do IAM exige CAPABILITY_IAM; com nome próprio\n    (UserName, RoleName...) exige CAPABILITY_NAMED_IAM. Sem isso:\n    InsufficientCapabilitiesException.\n\nPARÂMETROS\n    os declarados em Parameters; sem valor e sem Default, o create falha."),
      "cloudformation.validate-template": M("aws cloudformation validate-template --template-body file://<template>",
        "Confere a sintaxe do template sem criar nada. Devolve os Parameters\n(com o DefaultValue) e, se o template mexe com IAM, as Capabilities que\no create vai exigir."),
      "cloudformation.list-stacks": M("aws cloudformation list-stacks [--stack-status-filter CREATE_COMPLETE DELETE_COMPLETE ...]",
        "Os stacks da conta com status — incluindo os APAGADOS (DELETE_COMPLETE),\nque continuam na lista por 90 dias."),
      "cloudformation.describe-stacks": M("aws cloudformation describe-stacks [--stack-name <nome>]",
        "Detalhe dos stacks: StackStatus, parâmetros usados, Outputs, proteção\ncontra exclusão e drift. Só as saídas:\n    ... --query Stacks[0].Outputs"),
      "cloudformation.describe-stack-events": M("aws cloudformation describe-stack-events --stack-name <nome>",
        "A história do stack, do evento mais NOVO pro mais velho: cada recurso\nentrando em *_IN_PROGRESS, *_COMPLETE ou *_FAILED. Quando algo falha, o\nmotivo está no ResourceStatusReason do primeiro *_FAILED."),
      "cloudformation.list-exports": M("aws cloudformation list-exports",
        "Os valores exportados por todos os stacks da região (Outputs com\nExport.Name). Nome de export é único na região."),
      "cloudformation.update-stack": M("aws cloudformation update-stack --stack-name <nome> (--template-body file://<t> | --use-previous-template) \\\n        [--parameters ParameterKey=<p>,UsePreviousValue=true ...]",
        "Aplica um template (ou parâmetros) novo direto, sem mostrar antes o que\nmuda. Nada mudou: \"No updates are to be performed.\" Falhou: volta\natrás (UPDATE_ROLLBACK_COMPLETE). Stack em ROLLBACK_COMPLETE não\natualiza — apague e crie de novo."),
      "cloudformation.get-template": M("aws cloudformation get-template --stack-name <nome>",
        "O template que está APLICADO no stack (TemplateBody)."),
      "cloudformation.list-stack-resources": M("aws cloudformation list-stack-resources --stack-name <nome>",
        "Resumo dos recursos do stack: nome lógico, nome físico (o de verdade na\nconta), tipo, status e drift."),
      "cloudformation.describe-stack-resource": M("aws cloudformation describe-stack-resource --stack-name <nome> --logical-resource-id <id-no-template>",
        "Detalhe de UM recurso do stack, pelo nome que ele tem no template."),
      "cloudformation.update-termination-protection": M("aws cloudformation update-termination-protection --stack-name <nome> (--enable-termination-protection | --no-enable-termination-protection)",
        "Liga ou desliga a proteção contra exclusão. Ligada, o delete-stack é\nrecusado."),
      "cloudformation.create-change-set": M("aws cloudformation create-change-set --stack-name <nome> --change-set-name <cs> \\\n        (--template-body file://<t> | --use-previous-template) [--parameters ...] [--change-set-type UPDATE|CREATE]",
        "Calcula o que um update FARIA, sem aplicar. Olhe com describe-change-set;\ndecida com execute-change-set ou delete-change-set.\nSem mudança nenhuma: o change set nasce FAILED."),
      "cloudformation.describe-change-set": M("aws cloudformation describe-change-set --stack-name <nome> --change-set-name <cs>",
        "O que o change set faria: cada recurso com Action (Add, Modify, Remove)\ne Replacement. Replacement \"True\" = o recurso é APAGADO e criado de\nnovo (numa tabela, os dados se perdem)."),
      "cloudformation.list-change-sets": M("aws cloudformation list-change-sets --stack-name <nome>",
        "Os change sets pendentes do stack."),
      "cloudformation.execute-change-set": M("aws cloudformation execute-change-set --stack-name <nome> --change-set-name <cs>",
        "Aplica o change set. Não produz saída. Os outros change sets do stack\nsão apagados."),
      "cloudformation.delete-change-set": M("aws cloudformation delete-change-set --stack-name <nome> --change-set-name <cs>",
        "Descarta o change set sem aplicar. Não produz saída."),
      "cloudformation.detect-stack-drift": M("aws cloudformation detect-stack-drift --stack-name <nome>",
        "Compara cada recurso do stack com o que existe na conta agora. Devolve\no StackDriftDetectionId."),
      "cloudformation.describe-stack-drift-detection-status": M("aws cloudformation describe-stack-drift-detection-status --stack-drift-detection-id <id>",
        "O resultado da detecção: IN_SYNC ou DRIFTED, e quantos recursos\nmudaram."),
      "cloudformation.describe-stack-resource-drifts": M("aws cloudformation describe-stack-resource-drifts --stack-name <nome> [--stack-resource-drift-status-filters MODIFIED DELETED]",
        "O drift de cada recurso: MODIFIED (com PropertyDifferences: esperado x\nreal), DELETED ou IN_SYNC."),
    });
  }
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "cloudformation.describe-stack-events": "conta a história do stack — é onde está o motivo quando algo falha.",
      "cloudformation.list-exports": "mostra os valores que um stack oferece pros outros usarem.",
      "cloudformation.update-stack": "aplica uma versão nova do template no stack que já existe.",
      "cloudformation.get-template": "mostra o template que está valendo, não o que está no seu computador.",
      "cloudformation.list-stack-resources": "lista o que o stack criou, com o nome de verdade de cada coisa.",
      "cloudformation.describe-stack-resource": "detalha um recurso do stack pelo nome que ele tem no template.",
      "cloudformation.update-termination-protection": "impede que um delete-stack no terminal errado derrube produção.",
      "cloudformation.create-change-set": "calcula o que uma mudança faria, sem aplicar nada.",
      "cloudformation.describe-change-set": "mostra, antes de aplicar, o que vai ser criado, mudado, apagado — ou recriado.",
      "cloudformation.list-change-sets": "mostra as mudanças que estão esperando revisão.",
      "cloudformation.execute-change-set": "aplica a mudança que foi revisada, exatamente como ela foi mostrada.",
      "cloudformation.delete-change-set": "descarta uma mudança revisada que não deve ir pra produção.",
      "cloudformation.detect-stack-drift": "procura recurso que alguém mudou na mão, fora do template.",
      "cloudformation.describe-stack-drift-detection-status": "diz se o stack ainda bate com o template ou se desviou.",
      "cloudformation.describe-stack-resource-drifts": "mostra o que exatamente mudou em cada recurso desviado.",
    });
  }

  // ============================================================
  // ATIVIDADES — a continuação da trilha de CloudFormation
  // ============================================================
  if (typeof DESAFIOS === "undefined" || typeof SERVICOS_META === "undefined") return;
  function d(id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar) {
    return { id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar };
  }
  // helpers fora do d(...): acesso por índice dentro dele vira null no corte do gabarito
  const stack = (c, n) => ((((c.cloudformation || {}).stacks) || {})[n]);
  const apagado = (c, n) => ((((c.cloudformation || {}).apagadas) || []).some((x) => x.nome === n));
  const lambdaDe = (c, n) => ((((c.lambda || {}).funcoes) || {})[n]);
  const temTabela = (c, n) => !!((((c.dynamodb || {}).tabelas) || {})[n]);
  const temBucket = (c, n) => !!((((c.s3 || {}).buckets) || {})[n]);
  const csDe = (c, n, cs) => ((stack(c, n) || {}).changeSets || {})[cs];
  const flag = (cmd, nome) => String((cmd && cmd.flags && cmd.flags[nome]) || "");
  const P = (v) => `ParameterKey=Ambiente,ParameterValue=${v}`;
  const ANT = "ParameterKey=Ambiente,UsePreviousValue=true";
  const criarPedidos = (n, amb) => `aws cloudformation create-stack --stack-name ${n} --template-body file://pedidos-api.yaml --parameters ${P(amb)}`;
  const cs = (n, nome, arq) => `aws cloudformation create-change-set --stack-name ${n} --change-set-name ${nome} --template-body file://${arq} --parameters ${ANT}`;
  const ver = (n, nome) => `aws cloudformation describe-change-set --stack-name ${n} --change-set-name ${nome}`;
  const BUCKET_DEV = "pedidos-anexos-dev-123456789012";

  const TRILHA = [
    d("cfc-1", "cloudformation", 2, 60, "Um template que serve pra dev e pra prod",
      "O time da API de pedidos quer o MESMO template pra dev e pra produção. Leia o <b>pedidos-api.yaml</b> e repare em três coisas novas: o bloco <b>Parameters</b> (o Ambiente), o <code>!Sub</code> que monta os nomes com ele, e o bloco <b>Outputs</b>.",
      ["Ler arquivo no terminal é o `cat`.", "O arquivo está na sua pasta."],
      ["cat pedidos-api.yaml"],
      (c, cmd, ok) => ok && cmd && cmd.sub === "cat" && /pedidos-api\.yaml/.test((cmd.args || []).join(" "))),
    d("cfc-2", "cloudformation", 2, 60, "Que parâmetros ele pede?",
      "Antes de subir, confira o que o template exige: valide o <b>pedidos-api.yaml</b> e veja os <code>Parameters</code> (com o valor padrão de cada um).",
      ["É o validate-template que você já usou.", "Olhe o campo Parameters da resposta: DefaultValue é o que vale se você não mandar nada."],
      ["aws cloudformation validate-template --template-body file://pedidos-api.yaml"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "validate-template") && /pedidos-api\.yaml/.test(flag(cmd, "template-body"))),
    d("cfc-3", "cloudformation", 2, 90, "O stack de dev",
      "Suba o stack <b>pedidos-dev</b> com o <b>pedidos-api.yaml</b>, passando o parâmetro <b>Ambiente=dev</b>. A tabela vai nascer como <b>pedidos-dev</b> e a função como <b>pedidos-api-dev</b>.",
      ["O mesmo create-stack, com `--parameters`.", "A forma é `--parameters ParameterKey=Ambiente,ParameterValue=dev`."],
      [criarPedidos("pedidos-dev", "dev")],
      (c) => (stack(c, "pedidos-dev") || {}).status === "CREATE_COMPLETE" && temTabela(c, "pedidos-dev")),
    d("cfc-4", "cloudformation", 2, 70, "O que o stack devolveu",
      "O template tem <b>Outputs</b>: o nome da tabela e o ARN da função. Traga só as saídas do <b>pedidos-dev</b>.",
      ["O describe-stacks mostra tudo do stack; o `--query` recorta.", "O caminho é `Stacks[0].Outputs`."],
      ["aws cloudformation describe-stacks --stack-name pedidos-dev --query Stacks[0].Outputs"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "describe-stacks") && /Outputs/.test(flag(cmd, "query"))),
    d("cfc-5", "cloudformation", 2, 60, "O que um stack oferece pros outros",
      "A saída <b>NomeDaTabela</b> tem <code>Export</code>: outro stack pode importar esse valor sem copiar e colar. Liste os exports da conta.",
      ["O comando é `list-exports`.", "Ele não pede nada."],
      ["aws cloudformation list-exports"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "list-exports")),
    d("cfc-f1", "cloudformation", 2, 90, "O mesmo template, produção",
      "Suba o stack <b>pedidos-prod</b> com o mesmo <b>pedidos-api.yaml</b>, agora com <b>Ambiente=prod</b>, e liste os exports — são dois, um de cada stack.",
      ["O create-stack de antes, com o valor prod.", "Depois, o list-exports."],
      [criarPedidos("pedidos-prod", "prod"), "aws cloudformation list-exports"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "list-exports") && (stack(c, "pedidos-prod") || {}).status === "CREATE_COMPLETE"),
    d("cfc-6", "cloudformation", 3, 70, "A história do stack",
      "Veja passo a passo o que o CloudFormation fez pra montar o <b>pedidos-dev</b>: cada recurso entrando em CREATE_IN_PROGRESS e terminando em CREATE_COMPLETE.",
      ["A história é o `describe-stack-events`, com `--stack-name`.", "Os eventos vêm do mais NOVO pro mais velho."],
      ["aws cloudformation describe-stack-events --stack-name pedidos-dev"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "describe-stack-events") && flag(cmd, "stack-name") === "pedidos-dev"),
    d("cfc-7", "cloudformation", 3, 120, "O template copiado",
      "Um colega copiou o template de pedidos pra fazer o do estoque e esqueceu de trocar o nome de uma tabela. Suba o stack <b>estoque</b> com o <b>estoque-copia.yaml</b> e confira o <b>StackStatus</b>. O create-stack vai responder sucesso — o que acontece depois é outra história.",
      ["Criar você já sabe (esse template não tem parâmetro).", "O status é o `describe-stacks --stack-name estoque`."],
      ["aws cloudformation create-stack --stack-name estoque --template-body file://estoque-copia.yaml",
        "aws cloudformation describe-stacks --stack-name estoque"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "describe-stacks") && (stack(c, "estoque") || {}).status === "ROLLBACK_COMPLETE"),
    d("cfc-f2", "cloudformation", 3, 90, "Por que voltou atrás?",
      "O stack está em <b>ROLLBACK_COMPLETE</b> e a tabela <b>estoque-central</b> sumiu (ela chegou a ser criada e foi apagada no rollback). Ache o motivo: traga dos eventos do <b>estoque</b> só o <code>ResourceStatusReason</code> do recurso que falhou.",
      ["São os eventos do describe-stack-events, recortados com `--query`.", "Filtre pelo status: `StackEvents[?ResourceStatus==CREATE_FAILED].ResourceStatusReason`."],
      ["aws cloudformation describe-stack-events --stack-name estoque --query StackEvents[?ResourceStatus==CREATE_FAILED].ResourceStatusReason"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "describe-stack-events") && /FAILED/.test(flag(cmd, "query"))),
    d("cfc-f3", "cloudformation", 3, 110, "Stack que nasceu quebrado não se conserta",
      "Stack em ROLLBACK_COMPLETE não aceita update — o caminho é apagar e criar de novo. Apague o <b>estoque</b> e suba de novo com o template corrigido, <b>estoque.yaml</b>.",
      ["delete-stack e create-stack, os dois você já sabe.", "O estoque.yaml usa estoque-movimentos no lugar do nome copiado."],
      ["aws cloudformation delete-stack --stack-name estoque",
        "aws cloudformation create-stack --stack-name estoque --template-body file://estoque.yaml"],
      (c) => (stack(c, "estoque") || {}).status === "CREATE_COMPLETE" && temTabela(c, "estoque-movimentos")),
    d("cfc-8", "cloudformation", 3, 110, "A versão 2 da API",
      "A função precisa de mais tempo (30 segundos) e a API ganhou um bucket de anexos: está tudo no <b>pedidos-api-v2.yaml</b>. Atualize o <b>pedidos-dev</b> com ele, mantendo o Ambiente que já estava.",
      ["Atualizar é o `update-stack`, com `--stack-name` e `--template-body`.", "Pra manter o parâmetro: `--parameters ParameterKey=Ambiente,UsePreviousValue=true`."],
      ["aws cloudformation update-stack --stack-name pedidos-dev --template-body file://pedidos-api-v2.yaml --parameters " + ANT],
      (c) => (stack(c, "pedidos-dev") || {}).status === "UPDATE_COMPLETE" && temBucket(c, BUCKET_DEV) && (lambdaDe(c, "pedidos-api-dev") || {}).timeout === 30),
    d("cfc-f4", "cloudformation", 3, 100, "Produção também",
      "Leve a versão 2 pro <b>pedidos-prod</b> e confira nos eventos o que mudou (UPDATE_IN_PROGRESS na função, CREATE na do bucket).",
      ["O mesmo update-stack, no outro stack.", "Depois, describe-stack-events."],
      ["aws cloudformation update-stack --stack-name pedidos-prod --template-body file://pedidos-api-v2.yaml --parameters " + ANT,
        "aws cloudformation describe-stack-events --stack-name pedidos-prod"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "describe-stack-events") && (stack(c, "pedidos-prod") || {}).status === "UPDATE_COMPLETE"),
    d("cfc-9", "cloudformation", 3, 80, "O que está aplicado de verdade",
      "Alguém pergunta se o timeout do dev já é 30. O arquivo no seu computador pode ter mudado — a resposta confiável é o template que está <b>aplicado</b> no <b>pedidos-dev</b>. Pegue ele.",
      ["O template aplicado é o `get-template`, com `--stack-name`."],
      ["aws cloudformation get-template --stack-name pedidos-dev"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "get-template")),
    d("cfc-10", "cloudformation", 3, 110, "Antes de mexer, calcule",
      "Pediram pra renomear a tabela pra <b>pedidos-v2-dev</b> (está no <b>pedidos-api-v3.yaml</b>). Em vez de aplicar direto, crie um <b>change set</b> chamado <b>renomeia-tabela</b> no <b>pedidos-dev</b> — ele calcula a mudança sem aplicar nada.",
      ["O comando é `create-change-set`: `--stack-name`, `--change-set-name` e o template.", "Mantenha o parâmetro com `UsePreviousValue=true`."],
      [cs("pedidos-dev", "renomeia-tabela", "pedidos-api-v3.yaml")],
      (c) => !!csDe(c, "pedidos-dev", "renomeia-tabela")),
    d("cfc-11", "cloudformation", 3, 100, "O que ele faria?",
      "Olhe o change set <b>renomeia-tabela</b>: que recurso muda e o campo <b>Replacement</b> dele. \"True\" quer dizer apagar e criar de novo.",
      ["O detalhe é o `describe-change-set`, com `--stack-name` e `--change-set-name`."],
      [ver("pedidos-dev", "renomeia-tabela")],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "describe-change-set") && flag(cmd, "change-set-name") === "renomeia-tabela"),
    d("cfc-12", "cloudformation", 3, 100, "Não, isso não vai pra produção",
      "Replacement True numa tabela = tabela NOVA, vazia, e a velha apagada com todos os pedidos. Renomear não vale isso. Descarte o change set <b>renomeia-tabela</b>.",
      ["Descartar é o `delete-change-set`, com `--stack-name` e `--change-set-name`.", "O stack não muda nada."],
      ["aws cloudformation delete-change-set --stack-name pedidos-dev --change-set-name renomeia-tabela"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "delete-change-set") && !csDe(c, "pedidos-dev", "renomeia-tabela") && temTabela(c, "pedidos-dev")),
    d("cfc-f5", "cloudformation", 3, 100, "Uma mudança segura",
      "A função precisa de mais memória: <b>pedidos-api-v4.yaml</b> sobe de 128 pra 256 MB. Crie o change set <b>mais-memoria</b> no <b>pedidos-dev</b> e confira que dessa vez é <b>Replacement False</b>.",
      ["create-change-set e describe-change-set, os dois de antes.", "Modify com Replacement False = muda no lugar, sem recriar."],
      [cs("pedidos-dev", "mais-memoria", "pedidos-api-v4.yaml"), ver("pedidos-dev", "mais-memoria")],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "describe-change-set") && !!csDe(c, "pedidos-dev", "mais-memoria")),
    d("cfc-13", "cloudformation", 3, 70, "O que está esperando revisão",
      "Antes da reunião de mudanças, liste os change sets pendentes do <b>pedidos-dev</b>.",
      ["O comando é `list-change-sets`, com `--stack-name`."],
      ["aws cloudformation list-change-sets --stack-name pedidos-dev"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "list-change-sets") && flag(cmd, "stack-name") === "pedidos-dev"),
    d("cfc-14", "cloudformation", 3, 100, "Aprovado na reunião",
      "A mudança de memória foi aprovada. Execute o change set <b>mais-memoria</b> no <b>pedidos-dev</b> e confirme no template aplicado que o MemorySize agora é 256.",
      ["Aplicar é o `execute-change-set`, com `--stack-name` e `--change-set-name`. Ele não devolve nada.", "Pra confirmar, o get-template do stack."],
      ["aws cloudformation execute-change-set --stack-name pedidos-dev --change-set-name mais-memoria",
        "aws cloudformation get-template --stack-name pedidos-dev"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "get-template") && (lambdaDe(c, "pedidos-api-dev") || {}).memoria === 256),
    d("cfc-f6", "cloudformation", 3, 120, "Produção pelo mesmo caminho",
      "Leve a memória nova pro <b>pedidos-prod</b> do jeito certo: change set <b>mais-memoria</b>, confira na lista de pendentes e execute.",
      ["create-change-set → list-change-sets → execute-change-set.", "Se quiser, describe-change-set no meio."],
      [cs("pedidos-prod", "mais-memoria", "pedidos-api-v4.yaml"),
        "aws cloudformation list-change-sets --stack-name pedidos-prod",
        "aws cloudformation execute-change-set --stack-name pedidos-prod --change-set-name mais-memoria"],
      (c) => (lambdaDe(c, "pedidos-api-prod") || {}).memoria === 256),
    d("cfc-f7", "cloudformation", 3, 100, "A renomeação chegou de novo",
      "Outro time pediu de novo pra renomear a tabela, agora em produção. Faça o change set <b>renomeia-tabela</b> no <b>pedidos-prod</b> com o <b>pedidos-api-v3.yaml</b>, veja o Replacement e descarte.",
      ["São os três comandos da renomeação no dev, agora no prod.", "create-change-set → describe-change-set → delete-change-set."],
      [cs("pedidos-prod", "renomeia-tabela", "pedidos-api-v3.yaml"), ver("pedidos-prod", "renomeia-tabela"),
        "aws cloudformation delete-change-set --stack-name pedidos-prod --change-set-name renomeia-tabela"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "delete-change-set") && flag(cmd, "stack-name") === "pedidos-prod" && temTabela(c, "pedidos-prod")),
    d("cfc-15", "cloudformation", 3, 80, "O nome de verdade de cada coisa",
      "No template a função se chama <b>FuncaoPedidos</b>; na conta, ela tem outro nome. Liste os recursos do <b>pedidos-dev</b> com nome lógico e físico.",
      ["O resumo dos recursos é o `list-stack-resources`, com `--stack-name`."],
      ["aws cloudformation list-stack-resources --stack-name pedidos-dev"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "list-stack-resources")),
    d("cfc-16", "cloudformation", 3, 80, "Um recurso só",
      "Detalhe só o recurso <b>TabelaPedidos</b> do <b>pedidos-dev</b>, pelo nome que ele tem no template.",
      ["O detalhe de UM recurso é o `describe-stack-resource`.", "O nome do template vai em `--logical-resource-id`."],
      ["aws cloudformation describe-stack-resource --stack-name pedidos-dev --logical-resource-id TabelaPedidos"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "describe-stack-resource") && flag(cmd, "logical-resource-id") === "TabelaPedidos"),
    d("cfc-f8", "cloudformation", 3, 90, "Os recursos de produção",
      "Pro inventário de produção: liste os recursos do <b>pedidos-prod</b> trazendo só o nome físico de cada um, e detalhe a <b>FuncaoPedidos</b> dele.",
      ["list-stack-resources com `--query StackResourceSummaries[].PhysicalResourceId`.", "Depois, describe-stack-resource com o nome lógico."],
      ["aws cloudformation list-stack-resources --stack-name pedidos-prod --query StackResourceSummaries[].PhysicalResourceId",
        "aws cloudformation describe-stack-resource --stack-name pedidos-prod --logical-resource-id FuncaoPedidos"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "describe-stack-resource") && flag(cmd, "stack-name") === "pedidos-prod"),
    d("cfc-17", "cloudformation", 3, 80, "Alguém mexeu na mão",
      "Sexta à noite, um dev baixou o timeout da <b>pedidos-api-dev</b> pra 5 segundos direto no Lambda, sem passar pelo template. Reproduza o que ele fez.",
      ["É o `aws lambda update-function-configuration` da trilha de Lambda.", "Ele pede `--function-name` e `--timeout`."],
      ["aws lambda update-function-configuration --function-name pedidos-api-dev --timeout 5"],
      (c) => (lambdaDe(c, "pedidos-api-dev") || {}).timeout === 5 && !!stack(c, "pedidos-dev")),
    d("cfc-18", "cloudformation", 3, 90, "O stack ainda bate com o template?",
      "Mudança feita fora do template é <b>drift</b>. Peça ao CloudFormation pra comparar o <b>pedidos-dev</b> com o que existe na conta.",
      ["O comando é `detect-stack-drift`, com `--stack-name`.", "Ele devolve um id da detecção."],
      ["aws cloudformation detect-stack-drift --stack-name pedidos-dev"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "detect-stack-drift") && !!(stack(c, "pedidos-dev") || {}).drift),
    d("cfc-19", "cloudformation", 3, 80, "O resultado da detecção",
      "Consulte o resultado pelo id que voltou: o stack está <b>IN_SYNC</b> ou <b>DRIFTED</b>?",
      ["O comando é `describe-stack-drift-detection-status`.", "O id vai em `--stack-drift-detection-id`."],
      ["aws cloudformation describe-stack-drift-detection-status --stack-drift-detection-id <drift-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "describe-stack-drift-detection-status")),
    d("cfc-20", "cloudformation", 3, 100, "O que exatamente desviou",
      "DRIFTED. Veja qual recurso mudou e em que propriedade: o esperado pelo template contra o que está na conta.",
      ["O detalhe por recurso é o `describe-stack-resource-drifts`, com `--stack-name`.", "Olhe o PropertyDifferences do recurso MODIFIED."],
      ["aws cloudformation describe-stack-resource-drifts --stack-name pedidos-dev"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "describe-stack-resource-drifts") && (((stack(c, "pedidos-dev") || {}).drift) || {}).status === "DRIFTED"),
    d("cfc-f9", "cloudformation", 3, 120, "De volta ao combinado",
      "O template é a fonte da verdade: volte o timeout da <b>pedidos-api-dev</b> pra <b>30</b>, rode a detecção de novo e confira que o stack voltou a <b>IN_SYNC</b>.",
      ["update-function-configuration com --timeout 30.", "Depois, detect-stack-drift e describe-stack-drift-detection-status com o id NOVO."],
      ["aws lambda update-function-configuration --function-name pedidos-api-dev --timeout 30",
        "aws cloudformation detect-stack-drift --stack-name pedidos-dev",
        "aws cloudformation describe-stack-drift-detection-status --stack-drift-detection-id <drift-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "describe-stack-drift-detection-status") && (((stack(c, "pedidos-dev") || {}).drift) || {}).status === "IN_SYNC"),
    d("cfc-f10", "cloudformation", 3, 120, "O bucket que sumiu",
      "Alguém apagou na mão o bucket de anexos de produção, <b>pedidos-anexos-prod-123456789012</b>. Reproduza, rode a detecção no <b>pedidos-prod</b> e traga só os recursos com drift <b>DELETED</b>.",
      ["Apagar bucket vazio é o `aws s3 rb s3://<nome>` da trilha de S3.", "Depois, detect-stack-drift e describe-stack-resource-drifts com `--stack-resource-drift-status-filters DELETED`."],
      ["aws s3 rb s3://pedidos-anexos-prod-123456789012",
        "aws cloudformation detect-stack-drift --stack-name pedidos-prod",
        "aws cloudformation describe-stack-resource-drifts --stack-name pedidos-prod --stack-resource-drift-status-filters DELETED"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "describe-stack-resource-drifts") && flag(cmd, "stack-name") === "pedidos-prod" && (((stack(c, "pedidos-prod") || {}).drift) || {}).status === "DRIFTED"),
    d("cfc-21", "cloudformation", 3, 90, "Produção não se apaga por engano",
      "Um delete-stack no terminal errado derrubaria produção inteira. Ligue a <b>proteção contra exclusão</b> no <b>pedidos-prod</b>.",
      ["O comando é `update-termination-protection`, com `--stack-name`.", "Pra ligar: `--enable-termination-protection`."],
      ["aws cloudformation update-termination-protection --stack-name pedidos-prod --enable-termination-protection"],
      (c) => !!(stack(c, "pedidos-prod") || {}).protecao),
    d("cfc-f11", "cloudformation", 3, 90, "A trava funciona?",
      "O auditor quer a prova de que a trava está ligada. Traga do describe-stacks do <b>pedidos-prod</b> só o campo <b>EnableTerminationProtection</b>. <small>(se quiser ver a trava agindo, tente um delete-stack nele: a AWS recusa com ValidationError)</small>",
      ["O describe-stacks mostra o campo; o `--query` recorta.", "O caminho é `Stacks[0].EnableTerminationProtection`."],
      ["aws cloudformation describe-stacks --stack-name pedidos-prod --query Stacks[0].EnableTerminationProtection"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "describe-stacks") && /EnableTerminationProtection/.test(flag(cmd, "query")) && !!(stack(c, "pedidos-prod") || {}).protecao),
    d("cfc-f12", "cloudformation", 3, 110, "Fim do ambiente de dev",
      "O dev vai ser recriado do zero em outra conta. Apague os stacks <b>estoque</b> e <b>pedidos-dev</b> e liste só os stacks <b>DELETE_COMPLETE</b> — stack apagado continua na lista por 90 dias.",
      ["delete-stack nos dois.", "list-stacks com `--stack-status-filter DELETE_COMPLETE`."],
      ["aws cloudformation delete-stack --stack-name estoque",
        "aws cloudformation delete-stack --stack-name pedidos-dev",
        "aws cloudformation list-stacks --stack-status-filter DELETE_COMPLETE"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "list-stacks") && !stack(c, "pedidos-dev") && apagado(c, "pedidos-dev") && !stack(c, "estoque")),
    d("cfc-f13", "cloudformation", 3, 110, "A API antiga saiu de produção",
      "A API de pedidos foi substituída por outra. Pra apagar o <b>pedidos-prod</b> de propósito, primeiro desligue a proteção; depois apague.",
      ["O mesmo update-termination-protection, agora com `--no-enable-termination-protection`.", "Depois, delete-stack."],
      ["aws cloudformation update-termination-protection --stack-name pedidos-prod --no-enable-termination-protection",
        "aws cloudformation delete-stack --stack-name pedidos-prod"],
      (c, cmd, ok) => ok && ehCmd(cmd, "cloudformation", "delete-stack") && flag(cmd, "stack-name") === "pedidos-prod" && !stack(c, "pedidos-prod") && apagado(c, "pedidos-prod")),
  ];
  for (const x of TRILHA) DESAFIOS.push(x);
})();
