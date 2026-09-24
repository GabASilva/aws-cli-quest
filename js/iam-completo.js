"use strict";
// ============================================================
// CLImb — iam-completo.js
// O IAM e o servico mais citado em TODAS as vagas que a pesquisa levantou
// (ver [[trilhas-por-profissao]] no vault) — e o CLImb cobria 26 dos 178
// comandos reais, so o CRUD de usuario, grupo, role e politica.
//
// Meta do servico: SELETIVA (178 comandos). O que entra, e por que:
//
//   CHAVE DE ACESSO — criar, rotacionar e apagar. A rotacao e a rotina de
//        seguranca mais comum que existe, e tem uma ordem certa: cria a nova,
//        troca nas aplicacoes, INATIVA a velha, espera, so entao apaga.
//        Quem pula a inativacao derruba producao.
//   CREDENTIAL REPORT — o raio-x da conta: quem tem chave velha, quem nao tem
//        MFA, quem nunca usou o acesso. E o primeiro artefato de auditoria.
//   POLITICA INLINE — a que vive DENTRO do usuario e some junto com ele. E o
//        contrario da gerenciada, e a diferenca cai em prova e em entrevista.
//   INSTANCE PROFILE — a ponte entre role e maquina. E literalmente a peca que
//        faltava na instancia que nao aparecia no `aws ssm
//        describe-instance-information` da trilha anterior.
//   SIMULATE — "essa pessoa PODE fazer isso?" respondido sem testar em
//        producao. Quase ninguem sabe que existe.
//   PERMISSIONS BOUNDARY — o teto. Citado nas vagas de seguranca como
//        privilegio minimo de verdade.
//   POLITICA DE SENHA da conta e versao padrao de politica.
//
// CARREGA DEPOIS do simulador.js (que cria SERVICOS.iam).
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined" || !SERVICOS.iam) return;

  const CONTA_ID = (c) => c.contaId || "123456789012";
  const arnIam = (c, tipo, nome) => "arn:aws:iam::" + CONTA_ID(c) + ":" + tipo + "/" + nome;

  function st(conta) {
    conta.iam = conta.iam || { usuarios: {}, grupos: {}, roles: {}, policies: {} };
    conta.iam.perfis = conta.iam.perfis || {};
    return conta.iam;
  }
  function usuarioDe(conta, flags, op) {
    const s = st(conta);
    const nome = String(exigirFlag(flags, "user-name"));
    const u = s.usuarios[nome];
    if (!u) {
      throw new ErroCli("An error occurred (NoSuchEntity) when calling the " + op + " operation: The user with name " + nome + " cannot be found.");
    }
    u.chaves = u.chaves || [];
    u.inline = u.inline || {};
    return [nome, u];
  }
  function roleDe(conta, flags, op) {
    const s = st(conta);
    const nome = String(exigirFlag(flags, "role-name"));
    const r = s.roles[nome];
    if (!r) {
      throw new ErroCli("An error occurred (NoSuchEntity) when calling the " + op + " operation: The role with name " + nome + " cannot be found.");
    }
    r.politicas = r.politicas || [];
    r.inline = r.inline || {};
    return [nome, r];
  }
  function lerDocumento(doc, flag, op) {
    const texto = String(doc);
    if (texto.indexOf("file://") === 0) {
      return { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "s3:*", Resource: "*" }], __arquivo: texto.slice(7) };
    }
    try { return JSON.parse(texto); }
    catch (e) {
      throw new ErroCli(
        "An error occurred (MalformedPolicyDocument) when calling the " + op + " operation: o documento precisa ser JSON valido.\n" +
        "Na prática quase ninguém digita JSON na linha de comando: usa-se " + flag + " file://<arquivo>.json (tem um pronto aqui — digite ls)."
      );
    }
  }
  const b64 = (txt) => (typeof btoa === "function" ? btoa(txt) : txt);

  // Decide se uma acao e permitida, olhando as politicas ANEXADAS. Nao e o
  // motor de avaliacao da AWS inteiro — e a parte que importa pra ensinar:
  // ReadOnly deixa ler e nao deixa escrever.
  function permite(conta, politicas, acao) {
    const s = st(conta);
    const servico = String(acao).split(":")[0];
    const verbo = String(acao).split(":")[1] || "";
    const soLeitura = /^(Get|List|Describe|Head|Batch?Get)/.test(verbo);
    for (const p of politicas || []) {
      const nome = String(p).split("/").pop();
      if (/^AdministratorAccess$/.test(nome)) return true;
      if (new RegExp("^Amazon" + servico + "FullAccess$", "i").test(nome)) return true;
      if (new RegExp("^Amazon" + servico + "ReadOnlyAccess$", "i").test(nome)) return soLeitura;
      if (/ReadOnly/i.test(nome)) return soLeitura;
      const local = s.policies[nome];
      if (local) {
        const versao = local.versions && local.versions[local.defaultVersionId];
        const stmts = (versao && versao.documento && versao.documento.Statement) || [];
        for (const stm of stmts) {
          if (stm.Effect !== "Allow") continue;
          const acoes = [].concat(stm.Action || []);
          for (const a of acoes) {
            const re = new RegExp("^" + String(a).replace(/\*/g, ".*") + "$", "i");
            if (re.test(acao)) return true;
          }
        }
      }
    }
    return false;
  }

  Object.assign(SERVICOS.iam, {
    // ---------- ler o detalhe ----------
    "get-user": (conta, pos, flags) => {
      const s = st(conta);
      if (flags["user-name"] === undefined) {
        avisarClimb("Sem --user-name o get-user descreve QUEM ESTA CHAMANDO. No terminal de verdade é o jeito rápido de saber com qual credencial você está logado.");
        return js({ User: { UserName: "climb", UserId: "AIDACLIMB" + hexAleatorio(8).toUpperCase(), Arn: arnIam(conta, "user", "climb"), CreateDate: new Date().toISOString() } });
      }
      const [nome, u] = usuarioDe(conta, flags, "GetUser");
      return js({ User: {
        UserName: nome, UserId: u.userId, Arn: arnIam(conta, "user", nome),
        CreateDate: u.criadoEm,
        PermissionsBoundary: u.boundary ? { PermissionsBoundaryType: "Policy", PermissionsBoundaryArn: u.boundary } : undefined,
      } });
    },
    "get-role": (conta, pos, flags) => {
      const [nome, r] = roleDe(conta, flags, "GetRole");
      return js({ Role: {
        RoleName: nome, RoleId: r.roleId, Arn: arnIam(conta, "role", nome),
        CreateDate: r.criadoEm, MaxSessionDuration: 3600,
        AssumeRolePolicyDocument: r.trustDoc || r.trust || { Version: "2012-10-17", Statement: [] },
      } });
    },
    "list-attached-role-policies": (conta, pos, flags) => {
      const [, r] = roleDe(conta, flags, "ListAttachedRolePolicies");
      const lista = r.politicas || [];
      if (!lista.length) {
        avisarClimb("Role sem política anexada: ela pode ser assumida, mas quem assumir não consegue fazer NADA. É um erro comum — a role existe e parece certa.");
        return "";
      }
      return js({ AttachedPolicies: lista.map((p) => ({ PolicyName: String(p).split("/").pop(), PolicyArn: p })) });
    },

    // ---------- chave de acesso: a rotação ----------
    "create-access-key": (conta, pos, flags) => {
      const [nome, u] = usuarioDe(conta, flags, "CreateAccessKey");
      if (u.chaves.length >= 2) {
        throw new ErroCli(
          "An error occurred (LimitExceeded) when calling the CreateAccessKey operation: Cannot exceed quota for AccessKeysPerUser: 2.\n" +
          "O limite de 2 existe justamente pra caber a rotação: a nova entra, a velha sai."
        );
      }
      const id = "AKIA" + hexAleatorio(16).toUpperCase();
      const segredo = hexAleatorio(40);
      u.chaves.push({ id: id, segredo: segredo, status: "Active", criadoEm: new Date().toISOString() });
      avisarClimb(
        "O SecretAccessKey aparece UMA VEZ e nunca mais — a AWS não guarda copia. Perdeu, só criando outra. " +
        "E nunca commite isso: chave em repositório público e varrida por robô em minutos."
      );
      return js({ AccessKey: {
        UserName: nome, AccessKeyId: id, Status: "Active",
        SecretAccessKey: segredo, CreateDate: new Date().toISOString(),
      } });
    },
    "list-access-keys": (conta, pos, flags) => {
      const [nome, u] = usuarioDe(conta, flags, "ListAccessKeys");
      if (!u.chaves.length) {
        avisarClimb("Usuário sem chave de acesso: ele só entra pelo console, não pela CLI. Pra robô de deploy é o contrário — chave sim, console não.");
        return "";
      }
      return js({ AccessKeyMetadata: u.chaves.map((k) => ({
        UserName: nome, AccessKeyId: k.id, Status: k.status, CreateDate: k.criadoEm,
      })) });
    },
    "update-access-key": (conta, pos, flags) => {
      const [, u] = usuarioDe(conta, flags, "UpdateAccessKey");
      const id = String(exigirFlag(flags, "access-key-id"));
      const status = String(exigirFlag(flags, "status"));
      if (["Active", "Inactive"].indexOf(status) < 0) {
        throw new ErroCli("An error occurred (ValidationError) when calling the UpdateAccessKey operation: Value '" + status + "' at 'status' failed to satisfy constraint: Member must satisfy enum value set: [Active, Inactive]");
      }
      const k = u.chaves.find((x) => x.id === id);
      if (!k) throw new ErroCli("An error occurred (NoSuchEntity) when calling the UpdateAccessKey operation: The Access Key with id " + id + " cannot be found.");
      k.status = status;
      if (status === "Inactive") {
        avisarClimb(
          "Este é o passo que quase todo mundo pula. INATIVAR primeiro e reversível: se algum serviço esquecido ainda usava essa chave, " +
          "ele quebra e você reativa em um comando. Apagar direto é irreversível — e você só descobre quem usava quando a produção cai."
        );
      }
      return okSilencioso("Chave " + id + " agora esta " + status + ".");
    },
    "delete-access-key": (conta, pos, flags) => {
      const [, u] = usuarioDe(conta, flags, "DeleteAccessKey");
      const id = String(exigirFlag(flags, "access-key-id"));
      const i = u.chaves.findIndex((x) => x.id === id);
      if (i < 0) throw new ErroCli("An error occurred (NoSuchEntity) when calling the DeleteAccessKey operation: The Access Key with id " + id + " cannot be found.");
      if (u.chaves[i].status === "Active") {
        avisarClimb("Você apagou uma chave que ainda estava ATIVA. Funcionou, mas o caminho seguro e inativar, esperar, e só então apagar.");
      }
      u.chaves.splice(i, 1);
      return okSilencioso("Chave " + id + " apagada.");
    },

    // ---------- o raio-x da conta ----------
    "generate-credential-report": (conta) => {
      const s = st(conta);
      s.relatorio = { geradoEm: new Date().toISOString() };
      return js({ State: "COMPLETE", Description: "No report exists. Starting a new report generation task" });
    },
    "get-credential-report": (conta) => {
      const s = st(conta);
      if (!s.relatorio) {
        throw new ErroCli(
          "An error occurred (ReportNotPresent) when calling the GetCredentialReport operation: Credential report not present.\n" +
          "Peça a geracao antes: aws iam generate-credential-report"
        );
      }
      const linhas = ["user,arn,password_enabled,mfa_active,access_key_1_active,access_key_1_last_rotated"];
      linhas.push("<root_account>,arn:aws:iam::" + CONTA_ID(conta) + ":root,not_supported,false,false,N/A");
      for (const [nome, u] of Object.entries(s.usuarios)) {
        const chaves = u.chaves || [];
        linhas.push([
          nome, arnIam(conta, "user", nome), "true", "false",
          chaves.length ? String(chaves[0].status === "Active") : "false",
          chaves.length ? String(chaves[0].criadoEm).slice(0, 10) : "N/A",
        ].join(","));
      }
      const csv = linhas.join("\n");
      avisarClimb(
        "Repare no formato: o relatório vem em CSV codificado em BASE64, então no terminal de verdade você encadeia\n" +
        "  aws iam get-credential-report --query Content --output text | base64 -d\n\n" +
        "Decodificado, ele fica assim:\n\n" + csv + "\n\n" +
        "É o primeiro artefato de qualquer auditoria: quem não tem MFA, quem tem chave velha e quem nunca usou o acesso."
      );
      return js({ Content: b64(csv), ReportFormat: "text/csv", GeneratedTime: s.relatorio.geradoEm });
    },

    // ---------- política inline ----------
    "put-user-policy": (conta, pos, flags) => {
      const [nome, u] = usuarioDe(conta, flags, "PutUserPolicy");
      const politica = String(exigirFlag(flags, "policy-name"));
      const doc = lerDocumento(exigirFlag(flags, "policy-document"), "--policy-document", "PutUserPolicy");
      u.inline[politica] = doc;
      avisarClimb(
        "Política INLINE vive dentro do usuário \"" + nome + "\" e morre junto com ele. A gerenciada é um objeto separado, com ARN próprio, " +
        "que dá pra anexar em vários. Regra pratica: inline só pra exceção de uma pessoa só; tudo que se repete vira gerenciada."
      );
      return okSilencioso("Politica inline \"" + politica + "\" gravada em \"" + nome + "\".");
    },
    "get-user-policy": (conta, pos, flags) => {
      const [nome, u] = usuarioDe(conta, flags, "GetUserPolicy");
      const politica = String(exigirFlag(flags, "policy-name"));
      if (!u.inline[politica]) {
        throw new ErroCli(
          "An error occurred (NoSuchEntity) when calling the GetUserPolicy operation: The user policy with name " + politica + " cannot be found.\n" +
          "Cuidado: este comando só enxerga política INLINE. As gerenciadas aparecem em list-attached-user-policies."
        );
      }
      return js({ UserName: nome, PolicyName: politica, PolicyDocument: u.inline[politica] });
    },
    "list-user-policies": (conta, pos, flags) => {
      const [, u] = usuarioDe(conta, flags, "ListUserPolicies");
      const nomes = Object.keys(u.inline);
      if (!nomes.length) {
        avisarClimb("Nenhuma política inline. Isso NÃO quer dizer sem permissão: as gerenciadas saem no list-attached-user-policies — são duas listas diferentes, e quem audita precisa olhar as duas.");
        return "";
      }
      return js({ PolicyNames: nomes });
    },
    "delete-user-policy": (conta, pos, flags) => {
      const [nome, u] = usuarioDe(conta, flags, "DeleteUserPolicy");
      const politica = String(exigirFlag(flags, "policy-name"));
      if (!u.inline[politica]) throw new ErroCli("An error occurred (NoSuchEntity) when calling the DeleteUserPolicy operation: The user policy with name " + politica + " cannot be found.");
      delete u.inline[politica];
      return okSilencioso("Politica inline \"" + politica + "\" removida de \"" + nome + "\".");
    },

    // ---------- quem pode assumir a role ----------
    "update-assume-role-policy": (conta, pos, flags) => {
      const [nome, r] = roleDe(conta, flags, "UpdateAssumeRolePolicy");
      const doc = lerDocumento(exigirFlag(flags, "policy-document"), "--policy-document", "UpdateAssumeRolePolicy");
      r.trustDoc = doc;
      avisarClimb(
        "Isto NÃO muda o que a role pode fazer — muda QUEM pode virar ela. São duas políticas diferentes na mesma role: " +
        "a de confiança (quem entra) e as anexadas (o que faz depois de entrar). Confundir as duas é o erro clássico do 'AccessDenied ao assumir role'."
      );
      return okSilencioso("Política de confiança da role \"" + nome + "\" atualizada.");
    },

    // ---------- a ponte entre role e máquina ----------
    "create-instance-profile": (conta, pos, flags) => {
      const s = st(conta);
      const nome = String(exigirFlag(flags, "instance-profile-name"));
      if (s.perfis[nome]) throw new ErroCli("An error occurred (EntityAlreadyExists) when calling the CreateInstanceProfile operation: Instance Profile " + nome + " already exists.");
      s.perfis[nome] = { nome: nome, roles: [], criadoEm: new Date().toISOString() };
      return js({ InstanceProfile: {
        InstanceProfileName: nome, InstanceProfileId: "AIPA" + hexAleatorio(17).toUpperCase(),
        Arn: arnIam(conta, "instance-profile", nome), Roles: [], CreateDate: new Date().toISOString(),
      } });
    },
    "add-role-to-instance-profile": (conta, pos, flags) => {
      const s = st(conta);
      const perfil = String(exigirFlag(flags, "instance-profile-name"));
      const [nomeRole] = roleDe(conta, flags, "AddRoleToInstanceProfile");
      const p = s.perfis[perfil];
      if (!p) throw new ErroCli("An error occurred (NoSuchEntity) when calling the AddRoleToInstanceProfile operation: Instance Profile " + perfil + " cannot be found.");
      if (p.roles.length) {
        throw new ErroCli(
          "An error occurred (LimitExceeded) when calling the AddRoleToInstanceProfile operation: Cannot exceed quota for InstanceSessionsPerInstanceProfile: 1.\n" +
          "Um instance profile carrega UMA role. Se a máquina precisa de mais permissão, você junta tudo numa role só."
        );
      }
      p.roles.push(nomeRole);
      avisarClimb(
        "Esta é a peça que liga role e máquina: EC2 não recebe role direto, recebe um INSTANCE PROFILE que carrega a role. " +
        "É exatamente isto que falta quando a instância não aparece no `aws ssm describe-instance-information`."
      );
      return okSilencioso("Role \"" + nomeRole + "\" adicionada ao perfil \"" + perfil + "\".");
    },

    // ---------- "essa pessoa pode fazer isso?" ----------
    "simulate-principal-policy": (conta, pos, flags) => {
      const s = st(conta);
      const arn = String(exigirFlag(flags, "policy-source-arn"));
      const nome = arn.split("/").pop();
      const tipo = arn.indexOf(":role/") >= 0 ? "roles" : "usuarios";
      const alvo = s[tipo][nome];
      if (!alvo) throw new ErroCli("An error occurred (NoSuchEntity) when calling the SimulatePrincipalPolicy operation: " + arn + " cannot be found.");
      const acoes = [String(exigirFlag(flags, "action-names"))]
        .concat((pos || []).map(String))
        .join(" ").split(/[,\s]+/).filter(Boolean);
      const politicas = (alvo.politicas || []).slice();
      for (const p of Object.keys(alvo.inline || {})) politicas.push(p);
      const resultados = acoes.map((a) => ({
        EvalActionName: a,
        EvalResourceName: flags["resource-arns"] ? String(flags["resource-arns"]) : "*",
        EvalDecision: permite(conta, politicas, a) ? "allowed" : "implicitDeny",
        MatchedStatements: [],
      }));
      avisarClimb(
        "Responder \"essa pessoa pode fazer isso?\" sem testar em produção é o que este comando faz — e quase ninguém sabe que ele existe. " +
        "`implicitDeny` quer dizer que nada permitiu (não que algo proibiu): no IAM, o que não é explicitamente permitido e negado."
      );
      return js({ EvaluationResults: resultados });
    },
    "put-user-permissions-boundary": (conta, pos, flags) => {
      const [nome, u] = usuarioDe(conta, flags, "PutUserPermissionsBoundary");
      const arn = String(exigirFlag(flags, "permissions-boundary"));
      if (arn.indexOf("arn:aws:iam::") !== 0) {
        throw new ErroCli("An error occurred (InvalidInput) when calling the PutUserPermissionsBoundary operation: ARN " + arn + " is not valid.");
      }
      u.boundary = arn;
      avisarClimb(
        "Boundary é TETO, não permissão: ele não da nada a \"" + nome + "\" — só limita o máximo que as políticas dele conseguem alcancar. " +
        "É assim que se delega a criação de usuários pra um time sem que ele possa criar alguém mais poderoso que ele mesmo."
      );
      return okSilencioso("Permissions boundary aplicado em \"" + nome + "\".");
    },
    "set-default-policy-version": (conta, pos, flags) => {
      const s = st(conta);
      const arn = String(exigirFlag(flags, "policy-arn"));
      const versao = String(exigirFlag(flags, "version-id"));
      const nome = arn.split("/").pop();
      const p = s.policies[nome];
      if (!p) throw new ErroCli("An error occurred (NoSuchEntity) when calling the SetDefaultPolicyVersion operation: Policy " + arn + " does not exist.");
      if (!p.versions || !p.versions[versao]) {
        throw new ErroCli("An error occurred (NoSuchEntity) when calling the SetDefaultPolicyVersion operation: Policy " + arn + " version " + versao + " does not exist.");
      }
      p.defaultVersionId = versao;
      avisarClimb("A versão padrão é a que VALE. As outras ficam guardadas — é por isso que voltar atrás numa política que quebrou tudo é um comando só, não um resgate de backup.");
      return okSilencioso("Versão padrão da política \"" + nome + "\" agora e " + versao + ".");
    },

    // ---------- política de senha da conta ----------
    "update-account-password-policy": (conta, pos, flags) => {
      const s = st(conta);
      const tam = flags["minimum-password-length"] !== undefined ? Number(flags["minimum-password-length"]) : 8;
      if (tam < 6 || tam > 128) {
        throw new ErroCli("An error occurred (ValidationError) when calling the UpdateAccountPasswordPolicy operation: 1 validation error detected: Value '" + tam + "' at 'minimumPasswordLength' failed to satisfy constraint: Member must have value greater than or equal to 6 and less than or equal to 128");
      }
      s.senha = {
        MinimumPasswordLength: tam,
        RequireSymbols: flags["require-symbols"] !== undefined,
        RequireNumbers: flags["require-numbers"] !== undefined,
        RequireUppercaseCharacters: flags["require-uppercase-characters"] !== undefined,
        RequireLowercaseCharacters: flags["require-lowercase-characters"] !== undefined,
        AllowUsersToChangePassword: flags["allow-users-to-change-password"] !== undefined,
        MaxPasswordAge: flags["max-password-age"] !== undefined ? Number(flags["max-password-age"]) : undefined,
        PasswordReusePrevention: flags["password-reuse-prevention"] !== undefined ? Number(flags["password-reuse-prevention"]) : undefined,
      };
      avisarClimb("Isto vale pra conta INTEIRA, não por usuário. É um dos itens que o Security Hub e a auditoria conferem primeiro.");
      return okSilencioso("Política de senha da conta atualizada.");
    },
    "get-account-password-policy": (conta) => {
      const s = st(conta);
      if (!s.senha) {
        throw new ErroCli(
          "An error occurred (NoSuchEntity) when calling the GetAccountPasswordPolicy operation: The Password Policy with domain name " + CONTA_ID(conta) + " cannot be found.\n" +
          "Conta sem política de senha e achado de auditoria: defina uma com aws iam update-account-password-policy."
        );
      }
      return js({ PasswordPolicy: s.senha });
    },
  });

  // ============================================================
  // MANUAIS
  // ============================================================
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => "USO\n    " + uso + "\n\n" + txt;
    Object.assign(MANUAIS, {
      "iam.get-user": M(
        "aws iam get-user [--user-name ana]",
        "Detalhe do usuário: ARN, id, data e o permissions boundary se houver.\n\nSEM --user-name ele descreve QUEM ESTÁ CHAMANDO — é o jeito rápido\nde saber com qual credencial você está logado."),
      "iam.get-role": M(
        "aws iam get-role --role-name papel-lambda",
        "Detalhe da role, incluindo o AssumeRolePolicyDocument: a política\nde CONFIANÇA, que diz quem pode virar essa role.\n\nNão confunda com o que ela PODE FAZER — isso são as políticas\nanexadas, que saem no list-attached-role-policies."),
      "iam.list-attached-role-policies": M(
        "aws iam list-attached-role-policies --role-name papel-lambda",
        "As políticas gerenciadas anexadas à role. Lista vazia é armadilha:\na role existe, pode ser assumida, e quem assumir não faz nada."),
      "iam.create-access-key": M(
        "aws iam create-access-key --user-name robo-deploy",
        "Cria par de chaves pra usar a CLI/SDK.\n\nO SecretAccessKey APARECE UMA VEZ e a AWS não guarda cópia. Perdeu,\nsó criando outra.\n\nLIMITE: 2 chaves por usuário — o limite existe justamente pra caber\na rotação (a nova entra antes de a velha sair)."),
      "iam.list-access-keys": M(
        "aws iam list-access-keys --user-name robo-deploy",
        "Mostra os ids e o estado (Active/Inactive) das chaves. O segredo\nnão volta aqui — nunca."),
      "iam.update-access-key": M(
        "aws iam update-access-key --user-name robo-deploy --access-key-id AKIA... --status Inactive",
        "Liga e desliga a chave sem apagar.\n\nÉ O PASSO QUE TODO MUNDO PULA na rotação. Inativar é reversível: se\num serviço esquecido ainda usava a chave, ele quebra e você reativa\nem um comando. Apagar direto é irreversível — e você descobre quem\nusava quando a produção cai."),
      "iam.delete-access-key": M(
        "aws iam delete-access-key --user-name robo-deploy --access-key-id AKIA...",
        "Apaga a chave de vez. Última etapa da rotação: criar a nova, trocar\nnas aplicações, inativar a velha, esperar, então apagar."),
      "iam.generate-credential-report": M(
        "aws iam generate-credential-report",
        "Pede à AWS a geração do relatório de credenciais da conta. Leva uns\nsegundos; depois você busca com get-credential-report."),
      "iam.get-credential-report": M(
        "aws iam get-credential-report --query Content --output text | base64 -d",
        "O raio-x da conta em CSV: quem tem senha, quem tem MFA, quantas\nchaves, quando cada uma foi rotacionada e quando foi usada pela\núltima vez.\n\nVEM EM BASE64 — por isso o `| base64 -d` no fim. É o primeiro\nartefato de qualquer auditoria de IAM."),
      "iam.put-user-policy": M(
        "aws iam put-user-policy --user-name ana --policy-name acesso-temp --policy-document file://politica-publica.json",
        "Grava uma política INLINE: ela vive dentro do usuário e morre junto\ncom ele.\n\nINLINE x GERENCIADA (cai em prova e em entrevista)\n    inline      pertence a UM usuário/grupo/role, sem ARN próprio\n    gerenciada  objeto separado, com ARN, anexável a vários\n\nRegra prática: inline só pra exceção de uma pessoa; o que se repete\nvira gerenciada."),
      "iam.get-user-policy": M(
        "aws iam get-user-policy --user-name ana --policy-name acesso-temp",
        "Mostra o documento da política inline. Só enxerga inline — as\ngerenciadas aparecem em list-attached-user-policies."),
      "iam.list-user-policies": M(
        "aws iam list-user-policies --user-name ana",
        "Lista os NOMES das políticas inline do usuário.\n\nLista vazia não quer dizer sem permissão: quem audita precisa olhar\nas DUAS listas, esta e a das gerenciadas."),
      "iam.delete-user-policy": M(
        "aws iam delete-user-policy --user-name ana --policy-name acesso-temp",
        "Remove a política inline do usuário."),
      "iam.update-assume-role-policy": M(
        "aws iam update-assume-role-policy --role-name papel-lambda --policy-document file://trust.json",
        "Muda QUEM pode assumir a role — não o que ela pode fazer.\n\nSão duas políticas diferentes na mesma role: a de confiança (quem\nentra) e as anexadas (o que se faz depois de entrar). Confundir as\nduas é o erro clássico do \"AccessDenied ao assumir role\"."),
      "iam.create-instance-profile": M(
        "aws iam create-instance-profile --instance-profile-name perfil-web",
        "O instance profile é o invólucro que leva uma role até uma EC2 —\nmáquina não recebe role direto."),
      "iam.add-role-to-instance-profile": M(
        "aws iam add-role-to-instance-profile --instance-profile-name perfil-web --role-name papel-web",
        "Põe a role dentro do perfil. É exatamente esta peça que falta\nquando a instância não aparece no\n`aws ssm describe-instance-information`.\n\nLIMITE: um perfil carrega UMA role."),
      "iam.simulate-principal-policy": M(
        "aws iam simulate-principal-policy --policy-source-arn arn:aws:iam::123456789012:user/ana \\\n        --action-names s3:GetObject s3:DeleteObject",
        "Responde \"essa pessoa PODE fazer isso?\" sem testar em produção.\n\nRESULTADOS\n    allowed        alguma política permite\n    implicitDeny   NADA permitiu (não que algo proibiu)\n    explicitDeny   alguma política proíbe na cara\n\nNo IAM o que não é explicitamente permitido é negado — por isso\nimplicitDeny é o resultado mais comum."),
      "iam.put-user-permissions-boundary": M(
        "aws iam put-user-permissions-boundary --user-name ana --permissions-boundary arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
        "Boundary é TETO, não permissão: não dá nada a ninguém, só limita o\nmáximo que as políticas da pessoa conseguem alcançar.\n\nÉ assim que se delega a criação de usuários pra um time sem que ele\npossa criar alguém mais poderoso que ele mesmo."),
      "iam.set-default-policy-version": M(
        "aws iam set-default-policy-version --policy-arn arn:aws:iam::123456789012:policy/acesso-s3 --version-id v1",
        "Escolhe qual versão da política VALE. As outras ficam guardadas —\npor isso voltar atrás numa política que quebrou tudo é um comando,\nnão um resgate de backup."),
      "iam.update-account-password-policy": M(
        "aws iam update-account-password-policy --minimum-password-length 14 --require-symbols --require-numbers",
        "Regras de senha da CONTA INTEIRA (não por usuário): tamanho mínimo,\nexigência de símbolo/número/maiúscula, validade e reuso.\n\nÉ um dos primeiros itens que auditoria e Security Hub conferem."),
      "iam.get-account-password-policy": M(
        "aws iam get-account-password-policy",
        "Mostra a política de senha vigente. Erro NoSuchEntity quer dizer que\na conta não tem nenhuma — e isso é achado de auditoria."),
    });
  }

  // ============================================================
  // PORQUE
  // ============================================================
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "iam.get-user": "mostra o detalhe do usuário — e, sem argumento, diz com qual credencial você está logado.",
      "iam.get-role": "mostra a role e, principalmente, quem tem permissão de assumir ela.",
      "iam.list-attached-role-policies": "diz o que a role pode fazer depois que alguém a assume.",
      "iam.create-access-key": "cria a credencial que a CLI e o SDK usam — o segredo aparece uma vez só.",
      "iam.list-access-keys": "mostra quais chaves existem e se estão ativas.",
      "iam.update-access-key": "inativa a chave sem apagar: é o passo reversível da rotação.",
      "iam.delete-access-key": "apaga a chave de vez, no fim da rotação.",
      "iam.generate-credential-report": "pede o relatório de credenciais da conta.",
      "iam.get-credential-report": "baixa o raio-x da conta: quem tem MFA, chave velha e acesso sem uso.",
      "iam.put-user-policy": "grava uma política inline, que vive dentro do usuário e morre com ele.",
      "iam.get-user-policy": "lê o documento dessa política inline.",
      "iam.list-user-policies": "lista as inline — a outra metade que o auditor precisa olhar.",
      "iam.delete-user-policy": "remove a política inline.",
      "iam.update-assume-role-policy": "muda quem pode assumir a role, não o que ela faz.",
      "iam.create-instance-profile": "cria o invólucro que leva uma role até uma máquina EC2.",
      "iam.add-role-to-instance-profile": "põe a role no perfil — a peça que falta quando a instância não aparece no SSM.",
      "iam.simulate-principal-policy": "responde 'essa pessoa pode fazer isso?' sem testar em produção.",
      "iam.put-user-permissions-boundary": "define o teto de permissão da pessoa, sem dar permissão nenhuma.",
      "iam.set-default-policy-version": "escolhe qual versão da política vale — é o voltar atrás.",
      "iam.update-account-password-policy": "define as regras de senha da conta inteira.",
      "iam.get-account-password-policy": "mostra essas regras; a ausência delas é achado de auditoria.",
    });
  }

  // ============================================================
  // ATIVIDADES
  // ============================================================
  if (typeof DESAFIOS === "undefined") return;

  function d(id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar) {
    return { id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar };
  }
  function at(anchorId, novos) {
    const i = DESAFIOS.findIndex((x) => x.id === anchorId);
    if (i < 0) { for (const n of novos) DESAFIOS.push(n); return; }
    DESAFIOS.splice(i + 1, 0, ...novos);
  }
  const usr = (c, n) => ((c.iam || {}).usuarios || {})[n];
  const rol = (c, n) => ((c.iam || {}).roles || {})[n];
  const perfil = (c, n) => ((c.iam || {}).perfis || {})[n];
  const chaves = (c, n) => ((usr(c, n) || {}).chaves) || [];

  at("iam-2", [
    d("iamc-get1", "iam", 1, 50, "Com qual credencial eu estou?",
      "Antes de mexer em qualquer coisa numa conta que não é sua, a primeira pergunta é: <b>quem sou eu aqui?</b> Veja o detalhe do usuário <b>ana</b> — e repare que, sem informar o nome, o mesmo comando responde quem está chamando.",
      ["É o `get-…` do usuário, irmão do `list-users` que você acabou de usar.", "Sem --user-name ele descreve a própria credencial — guarde esse truque."],
      ["aws iam get-user --user-name ana"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "get-user")),
  ]);

  at("piam-u3", [
    d("iamc-key1", "iam", 2, 90, "O robô de deploy precisa de credencial",
      "O usuário <b>ci-deploy</b> não entra pelo console: ele roda num servidor e usa a CLI. Crie a <b>chave de acesso</b> dele. <small>(repare na resposta: o segredo aparece UMA vez — a AWS não guarda copia)</small>",
      ["Chave de acesso é um recurso do usuário, então o comando pede --user-name.", "Guarde o AccessKeyId que volta: o segredo você nunca mais ve."],
      ["aws iam create-access-key --user-name ci-deploy"],
      (c) => chaves(c, "ci-deploy").length >= 1),
    d("iamc-key2", "iam", 2, 70, "Quantas chaves esse robô tem?",
      "Auditoria de rotina: liste as chaves do <b>ci-deploy</b> e veja o estado de cada uma. <small>(o limite da AWS e 2 por usuário — e existe justamente pra caber a rotação)</small>",
      ["O `list-…` das chaves, sempre por usuário.", "Repare que o segredo NÃO volta nessa listagem. Nunca volta."],
      ["aws iam list-access-keys --user-name ci-deploy"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "list-access-keys")),
  ]);

  // Revisão de 24/09: cada atividade abaixo introduz UM comando; quando a
  // atividade original fazia dois, a seguinte faz o segundo reusando o
  // primeiro (que vira a fixação dele). No fim do bloco, fixações em cenário
  // novo, sem comando inédito.
  at("iam-11", [
    d("iamc-pw1", "iam", 2, 90, "Senha de seis caracteres não passa na auditoria",
      "A auditoria apontou que a conta não tem regra de senha nenhuma. Defina: mínimo de <b>14</b> caracteres, exigindo <b>símbolo</b> e <b>número</b>.",
      ["Isto vale pra conta INTEIRA, não por usuário.", "As exigências são flags sem valor: `--require-symbols` e `--require-numbers`."],
      ["aws iam update-account-password-policy --minimum-password-length 14 --require-symbols --require-numbers"],
      (c) => (((c.iam || {}).senha || {}).MinimumPasswordLength === 14)),
    d("iamc-pw1b", "iam", 2, 80, "E a senha tem validade?",
      "A auditoria voltou: além do tamanho, a senha precisa expirar em <b>90</b> dias. Regrave a política mantendo o que já estava e acrescentando a validade — e confira o que ficou valendo.",
      ["O `update-…` substitui a política inteira: o que você não repetir, some.", "Pra conferir existe o `get-…` correspondente, sem argumento."],
      ["aws iam update-account-password-policy --minimum-password-length 14 --require-symbols --require-numbers --max-password-age 90",
        "aws iam get-account-password-policy"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "get-account-password-policy") &&
        (((c.iam || {}).senha || {}).MaxPasswordAge === 90)),
  ]);

  at("cob-iam-3", [
    d("iamc-ver1", "iam", 3, 100, "Publique a política nova",
      "O time pediu mais permissão na política <b>acesso-s3</b>. Publique uma <b>versão nova</b> dela, já valendo. <small>(a versão padrão é a que VALE; as antigas ficam guardadas)</small>",
      ["Publicar versão nova é `create-policy-version`, e a flag `--set-as-default` já faz ela valer na hora.", "A política é identificada pelo ARN: `arn:aws:iam::123456789012:policy/<nome>`."],
      ["aws iam create-policy-version --policy-arn arn:aws:iam::123456789012:policy/acesso-s3 --policy-document file://politica-publica.json --set-as-default"],
      (c) => {
        const p = ((c.iam || {}).policies || {})["acesso-s3"];
        return !!p && Object.keys(p.versions || {}).length >= 2 && p.defaultVersionId !== "v1";
      }),
    d("iamc-ver1b", "iam", 3, 110, "A política nova quebrou tudo: volte a anterior",
      "Metade da aplicação parou depois da versão nova. Não precisa de backup nem de recriar nada: <b>volte a versão padrão da acesso-s3 pra v1</b>.",
      ["Voltar atrás é outro comando, que só troca qual versão é a padrão.", "Ele pede o ARN da política e o `--version-id`."],
      ["aws iam set-default-policy-version --policy-arn arn:aws:iam::123456789012:policy/acesso-s3 --version-id v1"],
      (c, cmd, ok) => {
        const p = ((c.iam || {}).policies || {})["acesso-s3"];
        return ok && ehCmd(cmd, "iam", "set-default-policy-version") && !!p && p.defaultVersionId === "v1";
      }),
    d("iamc-fix-ver", "iam", 3, 120, "O mesmo susto, noutra política",
      "Crie a política <b>leitura-relatorios</b>, publique uma versão nova dela já valendo e — porque o relatório parou de abrir — volte pra <b>v1</b>.",
      ["Criar política você já viu na trilha; publicar versão e voltar atrás, nas duas atividades anteriores.", "O ARN da política nova segue o mesmo formato."],
      ["aws iam create-policy --policy-name leitura-relatorios --policy-document file://politica-publica.json",
        "aws iam create-policy-version --policy-arn arn:aws:iam::123456789012:policy/leitura-relatorios --policy-document file://politica-publica.json --set-as-default",
        "aws iam set-default-policy-version --policy-arn arn:aws:iam::123456789012:policy/leitura-relatorios --version-id v1"],
      (c, cmd, ok) => {
        const p = ((c.iam || {}).policies || {})["leitura-relatorios"];
        return ok && ehCmd(cmd, "iam", "set-default-policy-version") && !!p && p.defaultVersionId === "v1" && Object.keys(p.versions || {}).length >= 2;
      }),
  ]);

  at("cob-iam-5", [
    d("iamc-key3", "iam", 3, 130, "Rotacione a chave do jeito certo",
      "A chave do <b>ci-deploy</b> tem oito meses e a política da empresa manda rotacionar. A ordem importa: crie a nova, e só então <b>inative</b> a antiga — sem apagar ainda, porque inativar é reversível e apagar não é.",
      ["Criar a nova é o comando que você já usou; o passo novo é mudar o ESTADO da antiga.", "O estado vai em `--status`, e só aceita Active ou Inactive.", "Se algum serviço esquecido ainda usava a chave, ele quebra agora — e você reativa em um comando. É esse o ponto."],
      ["aws iam create-access-key --user-name ci-deploy",
        "aws iam update-access-key --user-name ci-deploy --access-key-id <chave-antiga> --status Inactive"],
      (c) => chaves(c, "ci-deploy").some((k) => k.status === "Inactive")),
    d("iamc-key4", "iam", 3, 100, "Uma semana depois: apague a velha",
      "Passou a semana, ninguém reclamou, nenhum log de erro. Agora sim: <b>apague</b> a chave inativa do <b>ci-deploy</b>.",
      ["Apagar pede o mesmo par de informações: usuário e id da chave.", "Chave apagada não volta — por isso a inativação veio antes."],
      ["aws iam delete-access-key --user-name ci-deploy --access-key-id <chave-inativa>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "delete-access-key") &&
        !chaves(c, "ci-deploy").some((k) => k.status === "Inactive")),
    d("iamc-fix-key", "iam", 3, 130, "A rotação do semestre seguinte",
      "Seis meses depois, a rotação do <b>ci-deploy</b> de novo — agora sem a atividade anterior aberta do lado. Crie a chave nova, confira que ficaram duas, inative a antiga e apague ela.",
      ["Os quatro passos, na ordem: criar, listar, inativar, apagar.", "Na vida real entre o inativar e o apagar passa uma semana; aqui é a sequência que importa."],
      ["aws iam create-access-key --user-name ci-deploy",
        "aws iam list-access-keys --user-name ci-deploy",
        "aws iam update-access-key --user-name ci-deploy --access-key-id <chave-antiga> --status Inactive",
        "aws iam delete-access-key --user-name ci-deploy --access-key-id <chave-inativa>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "delete-access-key") &&
        chaves(c, "ci-deploy").length === 1 && chaves(c, "ci-deploy").every((k) => k.status === "Active")),
    d("iamc-rep1", "iam", 3, 100, "Peça o raio-x da conta",
      "O time de segurança pediu o levantamento: quem tem MFA, quem tem chave velha, quem nunca usou o acesso. O primeiro passo é pedir à AWS que <b>gere</b> o relatório de credenciais.",
      ["Gerar é um comando só, sem argumento: o relatório é da conta inteira.", "Ele não devolve o relatório — só avisa que a geração começou."],
      ["aws iam generate-credential-report"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "generate-credential-report")),
    d("iamc-rep1b", "iam", 3, 110, "Leia o raio-x",
      "Relatório gerado. Agora <b>busque</b> o conteúdo. <small>(vem em base64 — no terminal de verdade você encadeia com <code>| base64 -d</code>)</small>",
      ["Buscar é o `get-…` do relatório, também sem argumento.", "Se ele disser que o relatório não existe, é porque faltou o passo de gerar."],
      ["aws iam get-credential-report"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "get-credential-report")),
    d("iamc-inline1", "iam", 3, 110, "Uma exceção pra uma pessoa só",
      "A <b>ana</b> precisa de um acesso temporário que não vale pra mais ninguém do time. Criar política gerenciada pra isso polui a conta: grave uma política <b>inline</b> chamada <b>acesso-temp</b>, que vive dentro dela e some junto.",
      ["Inline se grava com `put-…`, não com create — ela não é um objeto separado.", "O documento vem de arquivo: use `file://politica-publica.json` (digite `ls` pra ver os arquivos)."],
      ["aws iam put-user-policy --user-name ana --policy-name acesso-temp --policy-document file://politica-publica.json"],
      (c) => !!(((usr(c, "ana") || {}).inline || {})["acesso-temp"])),
    d("iamc-inline1b", "iam", 3, 110, "Leia o que ficou gravado nela",
      "A ana também vai precisar de <b>acesso-noturno</b>, igual ao anterior. Grave essa segunda inline e depois <b>leia o documento</b> da <b>acesso-temp</b> pra conferir o que ela libera.",
      ["A gravação é a mesma do exercício anterior, com outro nome.", "Ler uma inline é o `get-user-policy`, que pede o usuário e o nome da política."],
      ["aws iam put-user-policy --user-name ana --policy-name acesso-noturno --policy-document file://politica-publica.json",
        "aws iam get-user-policy --user-name ana --policy-name acesso-temp"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "get-user-policy") && !!(((usr(c, "ana") || {}).inline || {})["acesso-noturno"])),
    d("iamc-inline2", "iam", 3, 90, "O auditor olha as DUAS listas",
      "Auditar permissão de alguém exige olhar dois lugares: as políticas gerenciadas e as inline. Liste as <b>inline</b> da <b>ana</b>.",
      ["São duas listas diferentes: `list-user-policies` (inline) e `list-attached-user-policies` (gerenciadas).", "Ver uma vazia não quer dizer que a pessoa não tem permissão."],
      ["aws iam list-user-policies --user-name ana"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "list-user-policies")),
    d("iamc-inline2b", "iam", 3, 100, "O acesso temporário acabou",
      "O prazo da exceção venceu. <b>Remova</b> a <b>acesso-temp</b> e a <b>acesso-noturno</b> da ana — exceção que fica é permissão que ninguém lembra de ter dado.",
      ["Remover inline é o `delete-user-policy`, uma política por vez.", "Ele pede o usuário e o nome da política."],
      ["aws iam delete-user-policy --user-name ana --policy-name acesso-temp",
        "aws iam delete-user-policy --user-name ana --policy-name acesso-noturno"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "delete-user-policy") &&
        Object.keys(((usr(c, "ana") || {}).inline) || {}).length === 0),
    d("iamc-fix-inline", "iam", 3, 120, "A exceção do Pedro no plantão",
      "O <b>pedro</b> vai cobrir o plantão no feriado e precisa da inline <b>acesso-plantao</b> só por esses dias. Grave, confira o documento, veja a lista de inline dele — e, passado o feriado, remova.",
      ["Os quatro comandos de inline, na ordem: gravar, ler, listar, remover.", "Todos pedem `--user-name`; os de uma política específica pedem também `--policy-name`."],
      ["aws iam put-user-policy --user-name pedro --policy-name acesso-plantao --policy-document file://politica-publica.json",
        "aws iam get-user-policy --user-name pedro --policy-name acesso-plantao",
        "aws iam list-user-policies --user-name pedro",
        "aws iam delete-user-policy --user-name pedro --policy-name acesso-plantao"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "delete-user-policy") &&
        String(cmd.flags["user-name"] || "") === "pedro" && !(((usr(c, "pedro") || {}).inline || {})["acesso-plantao"])),
    d("iamc-role1", "iam", 3, 90, "A role existe, mas não faz nada",
      "Chamado: <i>\"assumi a role e dá AccessDenied em tudo\"</i>. Comece pelo detalhe da <b>papel-lambda</b> — e repare que ele mostra QUEM pode entrar, não o que ela pode fazer.",
      ["O `get-role` traz a política de CONFIANÇA (quem entra).", "O que a role pode fazer são as políticas anexadas — isso fica pra próxima."],
      ["aws iam get-role --role-name papel-lambda"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "get-role")),
    d("iamc-role1b", "iam", 3, 100, "O que essa role pode fazer?",
      "Agora a outra metade do chamado: veja <b>quais políticas estão anexadas</b> à <b>papel-lambda</b>. Lista vazia explica o AccessDenied inteiro.",
      ["É o `list-attached-role-policies`, pelo nome da role.", "Role sem política anexada pode ser assumida e não faz nada — é o erro que parece certo."],
      ["aws iam list-attached-role-policies --role-name papel-lambda"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "list-attached-role-policies")),
    d("iamc-trust1", "iam", 3, 130, "Quem pode virar essa role?",
      "A role <b>papel-lambda</b> vai passar a ser assumida também por outro serviço. Atualize a <b>política de confiança</b> dela com o arquivo <b>trust.json</b>. <small>(isto muda QUEM entra, não o que a role faz depois de entrar)</small>",
      ["Toda role tem DUAS políticas: a de confiança e as anexadas. Esta mexe na primeira.", "O comando é `update-assume-role-policy`, e o documento vem de `file://trust.json`."],
      ["aws iam update-assume-role-policy --role-name papel-lambda --policy-document file://trust.json"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "update-assume-role-policy") && !!rol(c, "papel-lambda")),
    d("iamc-prof1", "iam", 3, 110, "O invólucro que leva a role até a máquina",
      "Lembra da instância que não aparecia no <b>aws ssm describe-instance-information</b>? Faltava isto: máquina EC2 não recebe role direto — ela recebe um <b>instance profile</b>. Crie o perfil <b>perfil-ssm</b>.",
      ["O perfil é um objeto próprio do IAM, com nome e ARN.", "Criar é `create-instance-profile`, e ele nasce vazio."],
      ["aws iam create-instance-profile --instance-profile-name perfil-ssm"],
      (c) => !!perfil(c, "perfil-ssm")),
    d("iamc-prof1b", "iam", 3, 130, "A peça que faltava pra máquina ter permissão",
      "O perfil nasceu vazio. Ponha a role <b>papel-lambda</b> dentro do <b>perfil-ssm</b> — é essa a peça que liga a permissão à máquina.",
      ["É o `add-role-to-instance-profile`, com o nome do perfil e o da role.", "Um perfil carrega UMA role — se a máquina precisa de mais permissão, você junta tudo numa role só."],
      ["aws iam add-role-to-instance-profile --instance-profile-name perfil-ssm --role-name papel-lambda"],
      (c) => (((perfil(c, "perfil-ssm") || {}).roles) || []).length >= 1),
    d("iamc-fix-role", "iam", 3, 140, "A máquina de relatórios, do zero",
      "Uma máquina nova vai gerar relatórios e precisa de permissão sem chave nenhuma dentro dela. Crie a role <b>papel-relatorios</b> (confiança em <b>trust.json</b>), anexe <b>AmazonS3ReadOnlyAccess</b>, confira as anexadas e o detalhe, atualize a confiança — e monte o perfil <b>perfil-relatorios</b> com ela dentro.",
      ["Tudo aqui você já fez nesta trilha — é o caminho completo de role até máquina.", "A ordem natural: role, política anexada, conferência, confiança, perfil, role no perfil."],
      ["aws iam create-role --role-name papel-relatorios --assume-role-policy-document file://trust.json",
        "aws iam attach-role-policy --role-name papel-relatorios --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
        "aws iam list-attached-role-policies --role-name papel-relatorios",
        "aws iam get-role --role-name papel-relatorios",
        "aws iam update-assume-role-policy --role-name papel-relatorios --policy-document file://trust.json",
        "aws iam create-instance-profile --instance-profile-name perfil-relatorios",
        "aws iam add-role-to-instance-profile --instance-profile-name perfil-relatorios --role-name papel-relatorios"],
      (c) => (((perfil(c, "perfil-relatorios") || {}).roles) || []).indexOf("papel-relatorios") >= 0),
    d("iamc-sim1", "iam", 3, 140, "Ela pode apagar do S3?",
      "Antes de liberar a <b>ana</b> pra mexer em produção, responda sem testar em produção: ela consegue <b>ler</b> e consegue <b>apagar</b> objeto no S3? Simule as duas ações de uma vez.",
      ["Existe um comando que AVALIA as políticas da pessoa sem executar nada — poucos sabem que ele existe.", "A pessoa vai em `--policy-source-arn` (o ARN dela), e as ações em `--action-names`.", "Repare no resultado: `implicitDeny` quer dizer que NADA permitiu, não que algo proibiu."],
      ["aws iam simulate-principal-policy --policy-source-arn arn:aws:iam::123456789012:user/ana --action-names s3:GetObject s3:DeleteObject"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "simulate-principal-policy")),
    d("iamc-bound1", "iam", 3, 130, "Delegar sem entregar a conta",
      "O time de plataforma vai criar usuários sozinho, e você precisa garantir que ninguém crie alguém mais poderoso que o próprio time. A ferramenta é o <b>permissions boundary</b>: um TETO que não dá permissão nenhuma, só limita o máximo. Aplique <b>AmazonS3ReadOnlyAccess</b> como teto da <b>ana</b>.",
      ["Boundary não é política anexada: é limite. Mesmo com AdministratorAccess anexado, a pessoa não passa do teto.", "O ARN da política da AWS tem a forma `arn:aws:iam::aws:policy/<nome>`."],
      ["aws iam put-user-permissions-boundary --user-name ana --permissions-boundary arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"],
      (c) => !!((usr(c, "ana") || {}).boundary)),
    d("iamc-fix-sim", "iam", 3, 130, "O Pedro pode ler o relatório?",
      "O <b>pedro</b> vai começar a abrir relatórios no S3. Antes de ele tentar, simule se ele consegue <b>ler</b> (<b>s3:GetObject</b>) — e, pra garantir que nunca passe disso, ponha <b>AmazonS3ReadOnlyAccess</b> como teto dele.",
      ["Simular e pôr teto: os dois comandos das atividades anteriores.", "O ARN do usuário é `arn:aws:iam::123456789012:user/<nome>`."],
      ["aws iam simulate-principal-policy --policy-source-arn arn:aws:iam::123456789012:user/pedro --action-names s3:GetObject",
        "aws iam put-user-permissions-boundary --user-name pedro --permissions-boundary arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "put-user-permissions-boundary") && !!((usr(c, "pedro") || {}).boundary)),
    d("iamc-fix-audit", "iam", 3, 130, "A auditoria anual da conta",
      "Chegou a auditoria anual. Ela pede três coisas, e você entrega em sequência: <b>com qual credencial</b> você está operando, a <b>política de senha</b> da conta e o <b>relatório de credenciais</b> atualizado.",
      ["Sem `--user-name`, o `get-user` responde quem está chamando.", "O relatório precisa ser gerado de novo antes de ser buscado — o antigo está velho."],
      ["aws iam get-user",
        "aws iam get-account-password-policy",
        "aws iam generate-credential-report",
        "aws iam get-credential-report"],
      (c, cmd, ok) => ok && ehCmd(cmd, "iam", "get-credential-report")),
  ]);
})();
