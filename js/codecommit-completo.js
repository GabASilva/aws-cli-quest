"use strict";
// ============================================================
// CLImb — codecommit-completo.js
// AWS CodeCommit: o repositório Git gerenciado da AWS. Segundo serviço da
// família Code (depois do CodeBuild) — é de onde a esteira puxa o código.
//
// Formato de saída conferido em 25/09/2026 nos exemplos do `aws codecommit
// <cmd> help` (AWS CLI 2.35.8) e na API Reference (docs.aws.amazon.com/
// codecommit/latest/APIReference). Onde os dois brigam, vale a API Reference:
// o help do get-branch mostra "BranchInfo"/"commitID" e o do delete-branch
// mostra "branch", mas a seção Output do próprio help e a API dizem
// "branch"/"commitId" e "deletedBranch". As mensagens de erro são o texto
// da seção Errors de cada operação na API Reference.
//
// Histórico que o aluno vai achar na internet: a AWS fechou o CodeCommit pra
// clientes novos em 25/07/2024 e VOLTOU à disponibilidade geral em
// 24/11/2025 (blog DevOps da AWS). Ensinamos sem ressalva.
//
// O Git aqui é de mentira, mas coerente: cada put-file gera um commit com o
// commit pai, a branch aponta pro commit da ponta, e o merge por fast-forward
// só passa se a ponta do destino for ancestral da ponta da origem.
// ============================================================
(function () {
  if (typeof SERVICOS === "undefined") return;

  const REGIAO = (c) => c.regiao || "us-east-1";
  const CONTA_ID = (c) => c.contaId || "123456789012";
  const agora = () => Math.round(Date.now()) / 1000;
  const sha = () => hexAleatorio(40);
  const uuid = () => `${hexAleatorio(8)}-${hexAleatorio(4)}-${hexAleatorio(4)}-${hexAleatorio(4)}-${hexAleatorio(12)}`;
  const autorArn = (c) => `arn:aws:iam::${CONTA_ID(c)}:user/estudante`;
  const b64 = (s) => { try { return btoa(unescape(encodeURIComponent(String(s)))); } catch (e) { return ""; } };
  const erro = (op, tipo, msg) => new ErroCli(`An error occurred (${tipo}) when calling the ${op} operation: ${msg}`);

  function st(conta) {
    conta.codecommit = conta.codecommit || { repos: {}, prs: {}, proxPr: 1 };
    return conta.codecommit;
  }
  function repoDe(conta, nome, op) {
    const r = st(conta).repos[String(nome)];
    if (!r) throw erro(op, "RepositoryDoesNotExistException", `${nome} does not exist\nConfira o nome com: aws codecommit list-repositories`);
    return r;
  }
  const semRefs = (ref) => String(ref).replace(/^refs\/heads\//, "");
  // commit-specifier: nome de branch, refs/heads/<branch> ou id de commit
  function resolverCommit(r, spec) {
    if (spec === undefined) return r.padrao ? r.branches[r.padrao] : undefined;
    const s = String(spec);
    if (r.branches[semRefs(s)]) return r.branches[semRefs(s)];
    if (r.commits[s]) return s;
    return undefined;
  }
  function ancestral(r, talvezPai, filho) {
    for (let id = filho; id; id = (r.commits[id] || {}).pai) if (id === talvezPai) return true;
    return false;
  }
  function metadados(conta, r) {
    const m = {
      accountId: CONTA_ID(conta), repositoryId: r.id, repositoryName: r.nome,
      repositoryDescription: r.descricao || undefined, defaultBranch: r.padrao || undefined,
      lastModifiedDate: r.modificado, creationDate: r.criado,
      cloneUrlHttp: `https://git-codecommit.${REGIAO(conta)}.amazonaws.com/v1/repos/${r.nome}`,
      cloneUrlSsh: `ssh://git-codecommit.${REGIAO(conta)}.amazonaws.com/v1/repos/${r.nome}`,
      Arn: `arn:aws:codecommit:${REGIAO(conta)}:${CONTA_ID(conta)}:${r.nome}`,
    };
    return m;
  }
  // --file-content é blob: fileb://arquivo (o normal), file://arquivo, ou o
  // conteúdo em base64 — o CLI v2 trata texto solto como base64.
  function conteudoDoArquivo(conta, valor) {
    const v = String(valor);
    const m = /^(fileb?):\/\/(.+)$/.exec(v);
    if (m) {
      const a = arquivoLocal(m[2], conta);
      if (!a) throw new ErroCli(`Error parsing parameter '--file-content': Unable to load paramfile ${v}: [Errno 2] No such file or directory: '${m[2]}'\nCrie o arquivo antes, ex.: echo "# Meu projeto" > ${m[2]}`);
      return a.conteudo !== undefined ? String(a.conteudo) : `(conteúdo de ${a.caminho}, ${a.tamanho} bytes)\n`;
    }
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(v) && v.length % 4 === 0) {
      try { return decodeURIComponent(escape(atob(v))); } catch (e) { /* cai no erro abaixo */ }
    }
    throw new ErroCli(`\nInvalid base64: "${v}"\n\nNo AWS CLI v2, --file-content é binário: texto solto é lido como base64. O jeito normal é mandar um arquivo: --file-content fileb://README.md`);
  }

  function prJson(conta, p) {
    const r = st(conta).repos[p.repo];
    const aberto = p.status === "OPEN" && r;
    const alvo = {
      repositoryName: p.repo, sourceReference: "refs/heads/" + p.origem, destinationReference: "refs/heads/" + p.destino,
      destinationCommit: aberto ? (r.branches[p.destino] || p.commitDestino) : p.commitDestino,
      sourceCommit: aberto ? (r.branches[p.origem] || p.commitOrigem) : p.commitOrigem,
      mergeBase: p.base,
      mergeMetadata: p.mesclado ? { isMerged: true, mergedBy: autorArn(conta), mergeOption: "FAST_FORWARD_MERGE" } : { isMerged: false },
    };
    return {
      pullRequestId: p.id, title: p.titulo, description: p.descricao || undefined,
      lastActivityDate: p.atividade, creationDate: p.criado, pullRequestStatus: p.status,
      authorArn: autorArn(conta), pullRequestTargets: [alvo], clientRequestToken: p.token, revisionId: p.revisao,
    };
  }

  SERVICOS.codecommit = {
    "list-repositories": (conta, pos, flags) => {
      const s = st(conta);
      let l = Object.values(s.repos);
      if (flags["sort-by"] !== undefined) {
        const por = String(flags["sort-by"]);
        if (["repositoryName", "lastModifiedDate"].indexOf(por) < 0) throw new ErroCli(`\nInvalid choice: '${por}', valid choices are: 'repositoryName', 'lastModifiedDate'`);
        const ch = por === "repositoryName" ? (r) => r.nome.toLowerCase() : (r) => r.modificado;
        l = l.slice().sort((a, b) => (ch(a) < ch(b) ? -1 : ch(a) > ch(b) ? 1 : 0));
      }
      if (flags.order !== undefined) {
        const o = String(flags.order);
        if (["ascending", "descending"].indexOf(o) < 0) throw new ErroCli(`\nInvalid choice: '${o}', valid choices are: 'ascending', 'descending'`);
        if (o === "descending") l = l.slice().reverse();
      }
      if (!l.length) avisarClimb("Nenhum repositório ainda. No CodeCommit o repositório é um Git igual ao do GitHub, só que dentro da sua conta AWS — acesso controlado pelo IAM. Crie com: aws codecommit create-repository --repository-name <nome>");
      return js({ repositories: l.map((r) => ({ repositoryName: r.nome, repositoryId: r.id })) });
    },
    "create-repository": (conta, pos, flags) => {
      const s = st(conta);
      const nome = String(exigirFlag(flags, "repository-name"));
      if (!/^[\w.-]{1,100}$/.test(nome) || /\.git$/i.test(nome)) throw erro("CreateRepository", "InvalidRepositoryNameException", "A specified repository name is not valid.\nUse até 100 caracteres: letras, números, ponto, - e _ (e não termine em .git).");
      if (s.repos[nome]) throw erro("CreateRepository", "RepositoryNameExistsException", `Repository named ${nome} already exists`);
      const t = agora();
      s.repos[nome] = { nome, id: uuid(), descricao: flags["repository-description"] !== undefined ? String(flags["repository-description"]) : "", criado: t, modificado: t, padrao: null, branches: {}, commits: {} };
      avisarClimb("Repositório criado — e vazio: ainda não tem nenhuma branch. O primeiro commit cria a branch e ela vira a padrão. O endereço pro git clone está em cloneUrlHttp.");
      const m = metadados(conta, s.repos[nome]);
      delete m.defaultBranch;
      return js({ repositoryMetadata: m });
    },
    "get-repository": (conta, pos, flags) => {
      const r = repoDe(conta, exigirFlag(flags, "repository-name"), "GetRepository");
      if (!r.padrao) avisarClimb("Sem defaultBranch: o repositório ainda está vazio. O primeiro put-file (ou git push) cria a branch.");
      return js({ repositoryMetadata: metadados(conta, r) });
    },
    "put-file": (conta, pos, flags) => {
      const op = "PutFile";
      const r = repoDe(conta, exigirFlag(flags, "repository-name"), op);
      const branch = semRefs(exigirFlag(flags, "branch-name"));
      const conteudo = conteudoDoArquivo(conta, exigirFlag(flags, "file-content"));
      const caminho = String(exigirFlag(flags, "file-path")).replace(/^\/+/, "");
      if (!caminho) throw erro(op, "PathRequiredException", "The folderPath for a location cannot be null.");
      if (!conteudo.length) throw erro(op, "FileContentRequiredException", "The file cannot be added because it is empty. Empty files cannot be added to the repository with this API.");
      const modo = flags["file-mode"] !== undefined ? String(flags["file-mode"]) : "NORMAL";
      if (["EXECUTABLE", "NORMAL", "SYMLINK"].indexOf(modo) < 0) throw erro(op, "InvalidFileModeException", "The specified file mode permission is not valid. Use EXECUTABLE, NORMAL ou SYMLINK.");
      const pai = flags["parent-commit-id"] !== undefined ? String(flags["parent-commit-id"]) : undefined;
      const vazio = !Object.keys(r.branches).length;
      let arvore = {};
      if (!vazio) {
        const ponta = r.branches[branch];
        if (!ponta) throw erro(op, "BranchDoesNotExistException", `The specified branch does not exist: ${branch}\nBranch nova se cria com create-branch; veja as que existem com list-branches.`);
        if (!pai) throw erro(op, "ParentCommitIdRequiredException", "A parent commit ID is required. To view the full commit ID of a branch in a repository, use GetBranch or a Git command (for example, git pull or git log).");
        if (pai !== ponta) {
          if (!r.commits[pai]) throw erro(op, "ParentCommitDoesNotExistException", "The parent commit ID is not valid because it does not exist. The specified parent commit ID does not exist in the specified branch of the repository.");
          throw erro(op, "ParentCommitIdOutdatedException", "The file could not be added because the provided parent commit ID is not the current tip of the specified branch. To view the full commit ID of the current head of the branch, use GetBranch.");
        }
        arvore = Object.assign({}, r.commits[ponta].arvore);
        const atual = arvore[caminho];
        if (atual && atual.conteudo === conteudo && atual.modo === modo) throw erro(op, "SameFileContentException", "The file was not added or updated because the content of the file is exactly the same as the content of that file in the repository and branch that you specified.");
      }
      const blob = sha();
      arvore[caminho] = { conteudo, modo, blob };
      const id = sha();
      r.commits[id] = { id, pai: vazio ? null : pai, arvore, arvoreId: sha(), mensagem: flags["commit-message"] !== undefined ? String(flags["commit-message"]) : "", autor: flags.name !== undefined ? String(flags.name) : "", email: flags.email !== undefined ? String(flags.email) : "", data: agora() };
      r.branches[branch] = id;
      if (vazio) r.padrao = branch;
      r.modificado = agora();
      avisarClimb(vazio
        ? `Primeiro commit! A branch ${branch} nasceu com ele e virou a branch padrão do repositório. O commitId que voltou é a nova ponta da branch.`
        : "Commit feito. O próximo put-file nesta branch vai pedir ESTE commitId como --parent-commit-id — é assim que a AWS garante que ninguém sobrescreve o trabalho de outro sem ver.");
      return js({ commitId: id, blobId: blob, treeId: r.commits[id].arvoreId });
    },
    "get-file": (conta, pos, flags) => {
      const op = "GetFile";
      const r = repoDe(conta, exigirFlag(flags, "repository-name"), op);
      const caminho = String(exigirFlag(flags, "file-path")).replace(/^\/+/, "");
      const commit = resolverCommit(r, flags["commit-specifier"]);
      if (!commit) {
        if (flags["commit-specifier"] === undefined) throw erro(op, "CommitDoesNotExistException", "The specified commit does not exist or no commit was specified, and the specified repository has no default branch.");
        throw erro(op, "CommitDoesNotExistException", `The specified commit does not exist: ${flags["commit-specifier"]}\nUse o nome de uma branch (veja com list-branches) ou um commitId completo.`);
      }
      const f = r.commits[commit].arvore[caminho];
      if (!f) throw erro(op, "FileDoesNotExistException", `The specified file does not exist: ${caminho}\nO caminho é relativo à raiz do repositório, com a extensão.`);
      avisarClimb("O conteúdo vem em base64 no fileContent (é binário na API). No terminal de verdade você lê como texto encadeando: ... --query fileContent --output text | base64 -d");
      return js({ commitId: commit, blobId: f.blob, filePath: caminho, fileMode: f.modo, fileSize: new TextEncoder().encode(f.conteudo).length, fileContent: b64(f.conteudo) });
    },
    "list-branches": (conta, pos, flags) => {
      const r = repoDe(conta, exigirFlag(flags, "repository-name"), "ListBranches");
      const l = Object.keys(r.branches).sort();
      if (!l.length) avisarClimb("Nenhuma branch: repositório vazio. O primeiro put-file cria a branch.");
      return js({ branches: l });
    },
    "get-branch": (conta, pos, flags) => {
      const op = "GetBranch";
      const r = repoDe(conta, exigirFlag(flags, "repository-name"), op);
      const b = semRefs(exigirFlag(flags, "branch-name"));
      if (!r.branches[b]) throw erro(op, "BranchDoesNotExistException", `The specified branch does not exist: ${b}\nVeja as que existem com: aws codecommit list-branches --repository-name ${r.nome}`);
      return js({ branch: { branchName: b, commitId: r.branches[b] } });
    },
    "create-branch": (conta, pos, flags) => {
      const op = "CreateBranch";
      const r = repoDe(conta, exigirFlag(flags, "repository-name"), op);
      const b = semRefs(exigirFlag(flags, "branch-name"));
      const commit = String(exigirFlag(flags, "commit-id"));
      if (!/^[A-Za-z0-9][\w./-]{0,255}$/.test(b) || /\.\.|\/$|\.lock$/.test(b)) throw erro(op, "InvalidBranchNameException", "The specified reference name is not valid.");
      if (r.branches[b]) throw erro(op, "BranchNameExistsException", "Cannot create the branch with the specified name because the commit conflicts with an existing branch with the same name. Branch names must be unique.");
      if (!r.commits[commit]) throw erro(op, "CommitDoesNotExistException", `The specified commit does not exist or no commit was specified, and the specified repository has no default branch.\nO --commit-id é o id COMPLETO (40 caracteres) — pegue com: aws codecommit get-branch --repository-name ${r.nome} --branch-name ${r.padrao || "main"}`);
      r.branches[b] = commit;
      r.modificado = agora();
      avisarClimb(`Branch ${b} criada apontando pro commit ${commit.slice(0, 8)}. Sem saída é sucesso. Ela é só um ponteiro: nada foi copiado, as duas branches começam no mesmo commit.`);
      return "";
    },
    "create-pull-request": (conta, pos, flags) => {
      const op = "CreatePullRequest";
      const s = st(conta);
      const titulo = String(exigirFlag(flags, "title"));
      if (titulo.length > 150) throw erro(op, "InvalidTitleException", "The title of the pull request is not valid. Pull request titles cannot exceed 100 characters in length.");
      const brutos = [].concat(exigirFlag(flags, "targets"));
      if (brutos.length > 1) throw erro(op, "MultipleRepositoriesInPullRequestException", "You cannot include more than one repository in a pull request. Make sure you have specified only one repository name in your request, and then try again.");
      const t = parsearShorthand(brutos[0]);
      if (!t.repositoryName) throw erro(op, "RepositoryNameRequiredException", "A repository name is required, but was not specified.\nForma: --targets repositoryName=<repo>,sourceReference=<branch>,destinationReference=<branch>");
      if (!t.sourceReference) throw erro(op, "ReferenceNameRequiredException", "A reference name is required, but none was provided.\nFaltou o sourceReference (a branch com as mudanças).");
      const r = repoDe(conta, t.repositoryName, op);
      const origem = semRefs(t.sourceReference);
      const destino = semRefs(t.destinationReference || r.padrao || "");
      if (!r.branches[origem] || !r.branches[destino]) throw erro(op, "ReferenceDoesNotExistException", `The specified reference does not exist: refs/heads/${r.branches[origem] ? destino : origem}`);
      if (origem === destino) throw erro(op, "SourceAndDestinationAreSameException", "The source branch and destination branch for the pull request are the same. You must specify different branches for the source and destination.");
      const id = String(s.proxPr++);
      const t0 = agora();
      s.prs[id] = { id, repo: r.nome, titulo, descricao: flags.description !== undefined ? String(flags.description) : "", origem, destino,
        commitOrigem: r.branches[origem], commitDestino: r.branches[destino], base: r.branches[destino],
        status: "OPEN", mesclado: false, criado: t0, atividade: t0, revisao: hexAleatorio(64),
        token: flags["client-request-token"] !== undefined ? String(flags["client-request-token"]) : uuid() };
      avisarClimb(`Pull request ${id} aberto: ${origem} → ${destino}. Nada foi mesclado ainda — o PR é o pedido de revisão. Guarde o pullRequestId, é ele que os outros comandos pedem.`);
      return js({ pullRequest: prJson(conta, s.prs[id]) });
    },
    "list-pull-requests": (conta, pos, flags) => {
      const s = st(conta);
      const r = repoDe(conta, exigirFlag(flags, "repository-name"), "ListPullRequests");
      let l = Object.values(s.prs).filter((p) => p.repo === r.nome);
      if (flags["pull-request-status"] !== undefined) {
        const st2 = String(flags["pull-request-status"]);
        if (["OPEN", "CLOSED"].indexOf(st2) < 0) throw new ErroCli(`\nInvalid choice: '${st2}', valid choices are: 'OPEN', 'CLOSED'`);
        l = l.filter((p) => p.status === st2);
      }
      if (flags["author-arn"] !== undefined && String(flags["author-arn"]) !== autorArn(conta)) l = [];
      l.sort((a, b) => Number(b.id) - Number(a.id));
      if (!l.length) avisarClimb("Nenhum pull request com esse filtro.");
      return js({ pullRequestIds: l.map((p) => p.id) });
    },
    "get-pull-request": (conta, pos, flags) => {
      const p = st(conta).prs[String(exigirFlag(flags, "pull-request-id"))];
      if (!p) throw erro("GetPullRequest", "PullRequestDoesNotExistException", "The pull request ID could not be found. Make sure that you have specified the correct repository name and pull request ID, and then try again.");
      return js({ pullRequest: prJson(conta, p) });
    },
    "merge-pull-request-by-fast-forward": (conta, pos, flags) => {
      const op = "MergePullRequestByFastForward";
      const p = st(conta).prs[String(exigirFlag(flags, "pull-request-id"))];
      const nomeRepo = String(exigirFlag(flags, "repository-name"));
      if (!p) throw erro(op, "PullRequestDoesNotExistException", "The pull request ID could not be found. Make sure that you have specified the correct repository name and pull request ID, and then try again.");
      const r = repoDe(conta, nomeRepo, op);
      if (p.repo !== r.nome) throw erro(op, "RepositoryNotAssociatedWithPullRequestException", "The repository does not contain any pull requests with that pull request ID. Use GetPullRequest to verify the correct repository name for the pull request ID.");
      if (p.status !== "OPEN") throw erro(op, "PullRequestAlreadyClosedException", "The pull request status cannot be updated because it is already closed.");
      const pontaOrigem = r.branches[p.origem];
      const pontaDestino = r.branches[p.destino];
      if (!pontaOrigem || !pontaDestino) throw erro(op, "ReferenceDoesNotExistException", "The specified reference does not exist. You must provide a full commit ID.");
      if (flags["source-commit-id"] !== undefined && String(flags["source-commit-id"]) !== pontaOrigem) throw erro(op, "TipOfSourceReferenceIsDifferentException", "The tip of the source branch in the destination repository does not match the tip of the source branch specified in your request. The pull request might have been updated. Make sure that you have the latest changes.");
      if (!ancestral(r, pontaDestino, pontaOrigem)) throw erro(op, "ManualMergeRequiredException", `The pull request cannot be merged automatically into the destination branch. You must manually merge the branches and resolve any conflicts.\nA ${p.destino} andou depois que a ${p.origem} saiu dela: não dá pra só "avançar o ponteiro".`);
      r.branches[p.destino] = pontaOrigem;
      r.modificado = agora();
      Object.assign(p, { status: "CLOSED", mesclado: true, commitOrigem: pontaOrigem, commitDestino: pontaOrigem, atividade: agora() });
      avisarClimb(`Mesclado por fast-forward: a ${p.destino} só avançou o ponteiro até o último commit da ${p.origem} — sem commit de merge. O PR fechou sozinho. A branch ${p.origem} continua existindo até você apagar.`);
      return js({ pullRequest: prJson(conta, p) });
    },
    "delete-branch": (conta, pos, flags) => {
      const op = "DeleteBranch";
      const r = repoDe(conta, exigirFlag(flags, "repository-name"), op);
      const b = semRefs(exigirFlag(flags, "branch-name"));
      if (!r.branches[b]) { avisarClimb("Essa branch não existia — a AWS responde sucesso sem nada dentro."); return js({}); }
      if (b === r.padrao) throw erro(op, "DefaultBranchCannotBeDeletedException", "The specified branch is the default branch for the repository, and cannot be deleted. To delete this branch, you must first set another branch as the default branch.");
      const commit = r.branches[b];
      delete r.branches[b];
      r.apagadas = (r.apagadas || []).concat(b);
      r.modificado = agora();
      avisarClimb("Branch apagada. Os commits dela não somem se já estão em outra branch (depois do merge, estão na de destino) — some só o ponteiro.");
      return js({ deletedBranch: { branchName: b, commitId: commit } });
    },
    "delete-repository": (conta, pos, flags) => {
      const s = st(conta);
      const nome = String(exigirFlag(flags, "repository-name"));
      const r = s.repos[nome];
      if (!r) { avisarClimb("Esse repositório não existia — a AWS responde sucesso sem repositoryId."); return js({}); }
      delete s.repos[nome];
      for (const id of Object.keys(s.prs)) if (s.prs[id].repo === nome) delete s.prs[id];
      avisarClimb("Repositório apagado — com todo o histórico, branches e pull requests. Não tem lixeira: quem tinha um clone local é o único com cópia.");
      return js({ repositoryId: r.id });
    },
  };

  // ============================================================
  // MANUAIS
  // ============================================================
  if (typeof MANUAIS !== "undefined") {
    const M = (uso, txt) => "USO\n    " + uso + "\n\n" + txt;
    Object.assign(MANUAIS, {
      codecommit: "aws codecommit — AWS CodeCommit\n\nRepositório Git gerenciado, dentro da sua conta AWS. O acesso é pelo\nIAM (sem conta separada num site de Git).\n\nAS PEÇAS\n    REPOSITÓRIO   o projeto (git clone pelo cloneUrlHttp)\n    BRANCH        ponteiro pro commit da ponta\n    COMMIT        cada mudança, com o commit pai\n    PULL REQUEST  pedido de revisão de uma branch pra outra\n\nCOMANDOS\n    list-repositories / create-repository / get-repository / delete-repository\n    put-file / get-file\n    list-branches / get-branch / create-branch / delete-branch\n    create-pull-request / list-pull-requests / get-pull-request\n    merge-pull-request-by-fast-forward",
      "codecommit.list-repositories": M("aws codecommit list-repositories [--sort-by repositoryName|lastModifiedDate] [--order ascending|descending]",
        "Lista nome e id dos repositórios da conta. O detalhe (endereço de clone,\nbranch padrão) vem do get-repository."),
      "codecommit.create-repository": M("aws codecommit create-repository --repository-name <nome> [--repository-description <texto>]",
        "Cria um repositório VAZIO — sem nenhuma branch. O primeiro commit (put-file\nou git push) cria a branch e ela vira a padrão.\n\nNOME\n    até 100 caracteres: letras, números, ponto, - e _"),
      "codecommit.get-repository": M("aws codecommit get-repository --repository-name <nome>",
        "Detalhe do repositório: endereços de clone (cloneUrlHttp, cloneUrlSsh),\nbranch padrão (defaultBranch), ARN e datas."),
      "codecommit.put-file": M("aws codecommit put-file --repository-name <repo> --branch-name <branch> \\\n        --file-content fileb://<arquivo> --file-path <caminho/no/repo> \\\n        [--parent-commit-id <commit-da-ponta>] [--commit-message <texto>] [--name <autor>] [--email <email>]",
        "Grava um arquivo numa branch e gera um COMMIT, sem precisar de git no\nseu computador.\n\nCOMMIT PAI\n    Repositório vazio: não precisa (a branch nasce com este commit).\n    Branch com commits: --parent-commit-id é OBRIGATÓRIO e tem de ser a\n    ponta atual da branch (pegue com get-branch). Se alguém commitou\n    antes de você, dá ParentCommitIdOutdatedException.\n\nCONTEÚDO\n    No CLI v2 é binário: use fileb://arquivo. Texto solto é lido como\n    base64.\n\nSAÍDA\n    commitId (a nova ponta), blobId e treeId."),
      "codecommit.get-file": M("aws codecommit get-file --repository-name <repo> --file-path <caminho> [--commit-specifier <branch|commit>]",
        "Lê um arquivo do repositório numa branch ou num commit (sem\n--commit-specifier, na branch padrão).\n\nO fileContent vem em BASE64. No terminal de verdade, pra ver como texto:\n    ... --query fileContent --output text | base64 -d"),
      "codecommit.list-branches": M("aws codecommit list-branches --repository-name <repo>",
        "Os nomes das branches do repositório."),
      "codecommit.get-branch": M("aws codecommit get-branch --repository-name <repo> --branch-name <branch>",
        "O commit da ponta da branch (commitId). É o valor que o put-file pede em\n--parent-commit-id e o create-branch em --commit-id.\n\nSó o id, pra usar em script:\n    ... --query branch.commitId --output text"),
      "codecommit.create-branch": M("aws codecommit create-branch --repository-name <repo> --branch-name <nova> --commit-id <commit>",
        "Cria uma branch apontando pra um commit (normalmente a ponta da main).\nNão produz saída. O --commit-id é o id COMPLETO, de 40 caracteres."),
      "codecommit.create-pull-request": M("aws codecommit create-pull-request --title <título> \\\n        --targets repositoryName=<repo>,sourceReference=<branch-com-mudança>,destinationReference=<branch-destino> \\\n        [--description <texto>]",
        "Abre o pedido de revisão: \"quero levar a branch X pra branch Y\".\nSem destinationReference, o destino é a branch padrão.\n\nDevolve o pullRequestId, que os outros comandos pedem."),
      "codecommit.list-pull-requests": M("aws codecommit list-pull-requests --repository-name <repo> [--pull-request-status OPEN|CLOSED] [--author-arn <arn>]",
        "Os ids dos pull requests do repositório, do mais novo pro mais velho."),
      "codecommit.get-pull-request": M("aws codecommit get-pull-request --pull-request-id <id>",
        "Detalhe do pull request: título, status (OPEN/CLOSED), branches de\norigem e destino, commits e se já foi mesclado (mergeMetadata)."),
      "codecommit.merge-pull-request-by-fast-forward": M("aws codecommit merge-pull-request-by-fast-forward --pull-request-id <id> --repository-name <repo> [--source-commit-id <commit>]",
        "Mescla o pull request AVANÇANDO o ponteiro da branch de destino até a\nponta da origem (sem commit de merge) e fecha o PR.\n\nSó funciona se o destino não andou desde que a origem saiu dele; se\nandou, dá ManualMergeRequiredException.\n\n--source-commit-id: trava de segurança — falha se a origem recebeu\ncommit novo depois da sua revisão."),
      "codecommit.delete-branch": M("aws codecommit delete-branch --repository-name <repo> --branch-name <branch>",
        "Apaga a branch (o ponteiro). A branch padrão não pode ser apagada.\nDevolve deletedBranch com o commit em que ela estava."),
      "codecommit.delete-repository": M("aws codecommit delete-repository --repository-name <repo>",
        "Apaga o repositório com todo o histórico. Não tem lixeira.\nRepositório que não existe: sucesso, sem repositoryId."),
    });
  }

  // ============================================================
  // LIÇÃO + PORQUE
  // ============================================================
  if (typeof LICOES !== "undefined" && !LICOES.codecommit) {
    LICOES.codecommit = {
      emoji: "🗃️", titulo: "AWS CodeCommit",
      oque: "O CodeCommit é um <b>GitHub dentro da sua conta AWS</b>: repositório Git de verdade (clone, branch, commit, pull request), só que quem entra é decidido pelo <b>IAM</b> — o mesmo usuário e a mesma role que já mandam no resto da conta.",
      serve: "É o \"onde o código mora\" da esteira de CI/CD na AWS. Empresa com regra rígida de acesso (banco, saúde, governo) prefere o código na mesma conta, com permissão por role e trilha no CloudTrail, em vez de um site de Git separado. Um detalhe que você vai achar em artigo antigo: a AWS fechou o CodeCommit pra clientes novos em julho de 2024 e voltou atrás em novembro de 2025 — hoje ele está disponível pra todo mundo.",
      casos: [
        "O time de um banco guarda o código das APIs no CodeCommit porque a auditoria exige que o acesso seja só por role do IAM, com registro no CloudTrail.",
        "Cada push na branch main dispara o CodePipeline, que chama o CodeBuild pra testar e o CodeDeploy pra publicar.",
        "Um script de automação grava um arquivo de configuração no repositório com put-file — sem precisar de git instalado na máquina.",
      ],
      vocab: [
        ["Repositório", "o projeto Git; o endereço de clone está em cloneUrlHttp."],
        ["Branch", "um ponteiro pro commit da ponta. Criar branch não copia nada."],
        ["Commit pai", "o commit anterior. O put-file exige a ponta atual pra ninguém sobrescrever o trabalho de outro sem ver."],
        ["Pull request", "o pedido de revisão: levar as mudanças de uma branch pra outra."],
        ["Fast-forward", "mesclar só avançando o ponteiro do destino, sem commit de merge — possível quando o destino não andou."],
        ["Branch padrão", "a que o clone traz e o destino padrão dos PRs; não pode ser apagada."],
      ],
      cobra: "Cobra por usuário ativo no mês: os 5 primeiros são grátis (com 50 GB e 10 mil requisições Git), e cada usuário a mais custa US$ 1 por mês. Comparando: <b>CodeCommit x GitHub</b> — o Git é o mesmo; a diferença é que o CodeCommit vive dentro da conta, com acesso pelo IAM, e não tem o ecossistema social do GitHub (Actions, marketplace, issues).",
    };
  }
  if (typeof PORQUE !== "undefined") {
    Object.assign(PORQUE, {
      "codecommit.list-repositories": "mostra quais repositórios de código existem na conta.",
      "codecommit.create-repository": "cria um repositório Git novo, vazio, dentro da conta.",
      "codecommit.get-repository": "traz o endereço de clone e a branch padrão de um repositório.",
      "codecommit.put-file": "grava um arquivo e gera um commit sem precisar de git na máquina — é o que scripts de automação usam.",
      "codecommit.get-file": "lê um arquivo do repositório numa branch ou num commit, sem clonar nada.",
      "codecommit.list-branches": "mostra as linhas de trabalho abertas no repositório.",
      "codecommit.get-branch": "diz em que commit a branch está — o id que o put-file e o create-branch pedem.",
      "codecommit.create-branch": "abre uma linha de trabalho separada a partir de um commit, sem mexer na main.",
      "codecommit.create-pull-request": "pede revisão antes de levar mudanças pra branch principal.",
      "codecommit.list-pull-requests": "mostra os pedidos de revisão abertos ou fechados de um repositório.",
      "codecommit.get-pull-request": "mostra o estado de um pedido de revisão: aberto, fechado, mesclado.",
      "codecommit.merge-pull-request-by-fast-forward": "leva as mudanças revisadas pro destino sem criar commit de merge.",
      "codecommit.delete-branch": "limpa a branch que já foi mesclada ou abandonada.",
      "codecommit.delete-repository": "remove um repositório que não é mais usado — com todo o histórico.",
    });
  }

  // ============================================================
  // ATIVIDADES
  // ============================================================
  if (typeof DESAFIOS === "undefined" || typeof SERVICOS_META === "undefined") return;
  function d(id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar) {
    return { id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar };
  }
  // helpers fora do d(...): acesso por índice dentro dele vira null no corte do gabarito
  const repo = (c, n) => (((c.codecommit || {}).repos) || {})[n];
  const ponta = (c, n, b) => ((repo(c, n) || {}).branches || {})[b];
  const arquivoNa = (c, n, b, caminho) => { const r = repo(c, n); const id = ponta(c, n, b); return !!(r && id && r.commits[id] && r.commits[id].arvore[caminho]); };
  const prsDe = (c, n, origem) => Object.values(((c.codecommit || {}).prs) || {}).filter((p) => p.repo === n && (!origem || p.origem === origem));
  const apagou = (c, n, b) => ((repo(c, n) || {}).apagadas || []).indexOf(b) >= 0;
  const flag = (cmd, nome) => String((cmd && cmd.flags && cmd.flags[nome]) || "");
  const put = (repoN, branch, arq, pai, msg) => `aws codecommit put-file --repository-name ${repoN} --branch-name ${branch} --file-content fileb://${arq} --file-path ${arq}` + (pai ? ` --parent-commit-id <commit-da-branch:${repoN}:${branch}>` : "") + ` --commit-message "${msg}"`;

  const TRILHA = [
    d("ccm-1", "codecommit", 1, 50, "Onde o código mora?",
      "O time de RH vai tirar o código do portal interno de um pendrive (sim, de um pendrive) e colocar num repositório de verdade, dentro da conta AWS. Antes de criar, veja quais <b>repositórios</b> já existem.",
      ["Pra ver o que existe, o verbo é `list-` e o recurso vai no plural.", "O serviço é o `codecommit`."],
      ["aws codecommit list-repositories"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codecommit", "list-repositories")),
    d("ccm-2", "codecommit", 1, 80, "O repositório do portal do RH",
      "Crie o repositório <b>portal-rh</b> com a descrição <b>Portal interno do RH</b>. É o marco da trilha: o código sai do pendrive.",
      ["Criar é `create-repository`, e o nome vai em `--repository-name`.", "A descrição vai em `--repository-description`, entre aspas por causa dos espaços."],
      ['aws codecommit create-repository --repository-name portal-rh --repository-description "Portal interno do RH"'],
      (c) => !!repo(c, "portal-rh")),
    d("ccm-f0", "codecommit", 1, 50, "O mais recente primeiro",
      "A conta vai acumular repositórios. Liste os repositórios ordenados pela <b>última modificação</b>, do mais recente pro mais antigo.",
      ["Mesmo `list-repositories`, com ordenação.", "As flags são `--sort-by lastModifiedDate` e `--order descending`."],
      ["aws codecommit list-repositories --sort-by lastModifiedDate --order descending"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codecommit", "list-repositories") && flag(cmd, "sort-by") === "lastModifiedDate" && flag(cmd, "order") === "descending"),
    d("ccm-3", "codecommit", 1, 50, "O endereço pro git clone",
      "Uma dev vai clonar o <b>portal-rh</b> no notebook dela e pediu o endereço. Veja o detalhe do repositório.",
      ["O detalhe de UM repositório é o `get-repository`.", "O endereço HTTPS está no campo `cloneUrlHttp`."],
      ["aws codecommit get-repository --repository-name portal-rh"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codecommit", "get-repository") && flag(cmd, "repository-name") === "portal-rh"),
    d("ccm-f1", "codecommit", 2, 60, "Só a URL, pro script",
      "O script que prepara a máquina de dev nova precisa só da URL de clone do <b>portal-rh</b>, como texto puro.",
      ["Mesmo `get-repository`, com `--query` e `--output text`.", "O caminho é `repositoryMetadata.cloneUrlHttp`."],
      ["aws codecommit get-repository --repository-name portal-rh --query repositoryMetadata.cloneUrlHttp --output text"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codecommit", "get-repository") && /cloneUrlHttp/.test(flag(cmd, "query"))),
    d("ccm-4", "codecommit", 2, 90, "O primeiro commit",
      "O repositório está vazio. Crie um <b>README.md</b> com o texto <b># Portal RH</b> e grave ele na branch <b>main</b> do <b>portal-rh</b>, com a mensagem <b>Primeiro commit</b>. Repositório vazio não pede commit pai.",
      ["Primeiro o arquivo no seu terminal: `echo \"# Portal RH\" > README.md`.", "Gravar arquivo no repositório (e gerar o commit) é o `put-file`. O conteúdo vai como arquivo: `--file-content fileb://README.md`.", "Também vão `--repository-name`, `--branch-name main`, `--file-path README.md` e `--commit-message`."],
      ['echo "# Portal RH" > README.md', put("portal-rh", "main", "README.md", false, "Primeiro commit")],
      (c) => arquivoNa(c, "portal-rh", "main", "README.md")),
    d("ccm-5", "codecommit", 2, 60, "Que branches existem?",
      "O primeiro commit criou uma branch. Confira quais branches o <b>portal-rh</b> tem agora.",
      ["As branches de um repositório vêm do `list-branches`.", "Ele pede o `--repository-name`."],
      ["aws codecommit list-branches --repository-name portal-rh"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codecommit", "list-branches") && flag(cmd, "repository-name") === "portal-rh"),
    d("ccm-6", "codecommit", 2, 60, "Em que commit a main está?",
      "O próximo commit vai precisar saber qual é a <b>ponta</b> da main. Consulte a branch <b>main</b> do <b>portal-rh</b> e veja o <code>commitId</code>.",
      ["O detalhe de uma branch é o `get-branch`.", "Ele pede `--repository-name` e `--branch-name`."],
      ["aws codecommit get-branch --repository-name portal-rh --branch-name main"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codecommit", "get-branch") && flag(cmd, "branch-name") === "main"),
    d("ccm-f2", "codecommit", 2, 60, "Só o id do commit",
      "Um script de deploy anota em que commit a main estava. Traga só o <b>commitId</b> da main do <b>portal-rh</b>, em texto puro.",
      ["Mesmo `get-branch`, com `--query` e `--output text`.", "O caminho é `branch.commitId`."],
      ["aws codecommit get-branch --repository-name portal-rh --branch-name main --query branch.commitId --output text"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codecommit", "get-branch") && /commitId/.test(flag(cmd, "query"))),
    d("ccm-7", "codecommit", 2, 90, "O buildspec vai pro repositório",
      "O CI precisa do <b>buildspec.yml</b> na raiz do repositório. Crie o arquivo com o texto <b>version: 0.2</b> e grave ele na <b>main</b> do <b>portal-rh</b>, com a mensagem <b>Adiciona buildspec</b>. Agora a branch já tem commit: o <code>put-file</code> vai exigir o commit pai.",
      ["Crie o arquivo com `echo \"version: 0.2\" > buildspec.yml`.", "É o mesmo `put-file`, mais `--parent-commit-id` com a ponta atual da main.", "A ponta você pega com o `get-branch` (o commitId inteiro, 40 caracteres)."],
      ['echo "version: 0.2" > buildspec.yml', put("portal-rh", "main", "buildspec.yml", true, "Adiciona buildspec")],
      (c) => arquivoNa(c, "portal-rh", "main", "buildspec.yml")),
    d("ccm-8", "codecommit", 2, 60, "Leia sem clonar",
      "Alguém perguntou o que está escrito no <b>README.md</b> da main. Leia o arquivo direto do repositório <b>portal-rh</b>, sem clonar.",
      ["Ler um arquivo do repositório é o `get-file`.", "Ele pede `--repository-name` e `--file-path`; a branch vai em `--commit-specifier main`.", "O conteúdo vem em base64 no campo fileContent."],
      ["aws codecommit get-file --repository-name portal-rh --commit-specifier main --file-path README.md"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codecommit", "get-file") && flag(cmd, "file-path") === "README.md"),
    d("ccm-f3", "codecommit", 2, 60, "O buildspec chegou mesmo?",
      "Antes de ligar o CI, confirme que o <b>buildspec.yml</b> está na main do <b>portal-rh</b> — e veja o tamanho dele (<code>fileSize</code>).",
      ["Mesmo `get-file`, com outro `--file-path`."],
      ["aws codecommit get-file --repository-name portal-rh --commit-specifier main --file-path buildspec.yml"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codecommit", "get-file") && flag(cmd, "file-path") === "buildspec.yml"),
    d("ccm-9", "codecommit", 3, 80, "Uma branch pra tela de férias",
      "A tela de <b>férias coletivas</b> vai ser feita sem mexer na main. Crie a branch <b>ferias-coletivas</b> no <b>portal-rh</b>, a partir da ponta atual da main.",
      ["Criar branch é o `create-branch`.", "Ele pede `--repository-name`, `--branch-name` e `--commit-id` — o commit de onde a branch sai.", "O commit é a ponta da main (get-branch). Sem saída é sucesso."],
      ["aws codecommit create-branch --repository-name portal-rh --branch-name ferias-coletivas --commit-id <commit-da-branch:portal-rh:main>"],
      (c) => !!ponta(c, "portal-rh", "ferias-coletivas")),
    d("ccm-f4", "codecommit", 3, 70, "Um experimento de layout",
      "O designer quer testar um layout novo sem compromisso. Crie a branch <b>experimento-layout</b> no <b>portal-rh</b>, também a partir da main.",
      ["Mesmo `create-branch`, com outro nome.", "O --commit-id é a ponta da main."],
      ["aws codecommit create-branch --repository-name portal-rh --branch-name experimento-layout --commit-id <commit-da-branch:portal-rh:main>"],
      (c) => !!ponta(c, "portal-rh", "experimento-layout")),
    d("ccm-f5", "codecommit", 3, 90, "O trabalho na branch",
      "Grave a tela nova na branch <b>ferias-coletivas</b>: um arquivo <b>ferias.md</b> com o texto <b>## Ferias coletivas</b>, mensagem <b>Tela de ferias</b>. O commit pai agora é a ponta da <b>ferias-coletivas</b>, não da main.",
      ["O mesmo `put-file` de antes, na outra branch.", "O `--parent-commit-id` é a ponta da ferias-coletivas (get-branch dela)."],
      ['echo "## Ferias coletivas" > ferias.md', put("portal-rh", "ferias-coletivas", "ferias.md", true, "Tela de ferias")],
      (c) => arquivoNa(c, "portal-rh", "ferias-coletivas", "ferias.md") && !arquivoNa(c, "portal-rh", "main", "ferias.md")),
    d("ccm-10", "codecommit", 3, 100, "Peça revisão",
      "A tela está pronta, mas nada vai pra main sem revisão. Abra um pull request da <b>ferias-coletivas</b> pra <b>main</b> no <b>portal-rh</b>, com o título <b>Tela de ferias coletivas</b>.",
      ["Abrir pull request é o `create-pull-request`, com `--title`.", "Origem e destino vão em `--targets`, na forma curta: `repositoryName=...,sourceReference=...,destinationReference=...`."],
      ['aws codecommit create-pull-request --title "Tela de ferias coletivas" --targets repositoryName=portal-rh,sourceReference=ferias-coletivas,destinationReference=main'],
      (c) => prsDe(c, "portal-rh", "ferias-coletivas").length > 0),
    d("ccm-11", "codecommit", 3, 70, "O que está esperando revisão?",
      "A tech lead quer ver os pull requests do <b>portal-rh</b>. Liste todos.",
      ["Listar pull requests é o `list-pull-requests`.", "Ele pede o `--repository-name` e devolve os ids."],
      ["aws codecommit list-pull-requests --repository-name portal-rh"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codecommit", "list-pull-requests") && flag(cmd, "repository-name") === "portal-rh"),
    d("ccm-f6", "codecommit", 3, 70, "Só os abertos",
      "Na reunião diária só interessa o que ainda está <b>aberto</b>. Liste os pull requests do <b>portal-rh</b> com status OPEN.",
      ["Mesmo `list-pull-requests`, com filtro.", "A flag é `--pull-request-status OPEN`."],
      ["aws codecommit list-pull-requests --repository-name portal-rh --pull-request-status OPEN"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codecommit", "list-pull-requests") && flag(cmd, "pull-request-status") === "OPEN"),
    d("ccm-12", "codecommit", 3, 70, "O detalhe do pull request",
      "Antes de aprovar, a tech lead quer ver o pull request da tela de férias por inteiro: branches, commits e se já foi mesclado.",
      ["O detalhe de um pull request é o `get-pull-request`.", "Ele pede o `--pull-request-id` (o id que voltou na criação, ou no list-pull-requests)."],
      ["aws codecommit get-pull-request --pull-request-id <pr-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codecommit", "get-pull-request")),
    d("ccm-f7", "codecommit", 3, 80, "Aberto ou fechado?",
      "Um bot do chat avisa quando um PR fecha. Traga só o <b>status</b> do pull request da tela de férias.",
      ["Mesmo `get-pull-request`, com `--query`.", "O caminho é `pullRequest.pullRequestStatus`."],
      ["aws codecommit get-pull-request --pull-request-id <pr-id> --query pullRequest.pullRequestStatus"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codecommit", "get-pull-request") && /pullRequestStatus/.test(flag(cmd, "query"))),
    d("ccm-13", "codecommit", 3, 120, "Aprovado: pra main",
      "Revisão aprovada. Mescle o pull request da tela de férias na main do <b>portal-rh</b> por <b>fast-forward</b> — a main só avança até o último commit da branch.",
      ["O merge é o `merge-pull-request-by-fast-forward`.", "Ele pede `--pull-request-id` e `--repository-name`."],
      ["aws codecommit merge-pull-request-by-fast-forward --pull-request-id <pr-id> --repository-name portal-rh"],
      (c) => arquivoNa(c, "portal-rh", "main", "ferias.md") && prsDe(c, "portal-rh", "ferias-coletivas").some((p) => p.mesclado)),
    d("ccm-f8", "codecommit", 3, 140, "O hotfix do holerite",
      "Bug em produção: o holerite mostra a data errada. Faça o ciclo inteiro no <b>portal-rh</b>: branch <b>hotfix-holerite</b> a partir da main, grave um <b>holerite.md</b> com o texto <b>data corrigida</b> nela (mensagem <b>Corrige data do holerite</b>), abra o pull request pra main (título <b>Hotfix holerite</b>) e mescle.",
      ["São os comandos da trilha, na ordem: create-branch → put-file → create-pull-request → merge-pull-request-by-fast-forward.", "Cada um pede o commit certo: a branch nova sai da ponta da main; o put-file usa a ponta da hotfix-holerite."],
      ["aws codecommit create-branch --repository-name portal-rh --branch-name hotfix-holerite --commit-id <commit-da-branch:portal-rh:main>",
        'echo "data corrigida" > holerite.md',
        put("portal-rh", "hotfix-holerite", "holerite.md", true, "Corrige data do holerite"),
        'aws codecommit create-pull-request --title "Hotfix holerite" --targets repositoryName=portal-rh,sourceReference=hotfix-holerite,destinationReference=main',
        "aws codecommit merge-pull-request-by-fast-forward --pull-request-id <pr-id> --repository-name portal-rh"],
      (c) => arquivoNa(c, "portal-rh", "main", "holerite.md") && prsDe(c, "portal-rh", "hotfix-holerite").some((p) => p.mesclado)),
    d("ccm-14", "codecommit", 3, 70, "Branch mesclada não precisa ficar",
      "A tela de férias já está na main. Apague a branch <b>ferias-coletivas</b> do <b>portal-rh</b> pra lista não virar um cemitério.",
      ["Apagar branch é o `delete-branch`.", "Ele pede `--repository-name` e `--branch-name`."],
      ["aws codecommit delete-branch --repository-name portal-rh --branch-name ferias-coletivas"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codecommit", "delete-branch") && !ponta(c, "portal-rh", "ferias-coletivas") && !!repo(c, "portal-rh")),
    d("ccm-f9", "codecommit", 3, 80, "O experimento não vingou",
      "O layout novo foi descartado. Apague a branch <b>experimento-layout</b> do <b>portal-rh</b> e confira as branches que sobraram.",
      ["Mesmo `delete-branch`, com a outra branch.", "Pra conferir, o `list-branches`."],
      ["aws codecommit delete-branch --repository-name portal-rh --branch-name experimento-layout",
        "aws codecommit list-branches --repository-name portal-rh"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codecommit", "list-branches") && apagou(c, "portal-rh", "experimento-layout") && !ponta(c, "portal-rh", "experimento-layout")),
    d("ccm-15", "codecommit", 3, 80, "O protótipo que ficou pra trás",
      "Alguém criou o repositório <b>prototipo-ponto</b> pra testar uma ideia e esqueceu. Crie pra ver o cenário e <b>apague</b>.",
      ["Criar você já sabe.", "Apagar é o `delete-repository`, com `--repository-name`. Ele devolve o repositoryId do que foi apagado."],
      ["aws codecommit create-repository --repository-name prototipo-ponto",
        "aws codecommit delete-repository --repository-name prototipo-ponto"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codecommit", "delete-repository") && flag(cmd, "repository-name") === "prototipo-ponto" && !repo(c, "prototipo-ponto")),
    d("ccm-f10", "codecommit", 3, 80, "O legado migrou pro GitHub",
      "O repositório <b>legado-folha</b> (descrição <b>Folha antiga</b>) foi migrado pra outro lugar e pode sair. Crie pra ver o cenário, apague, e rode o apagar <b>de novo</b>: repare que a segunda vez responde sucesso vazio.",
      ["Mesmo `delete-repository` da atividade anterior, duas vezes.", "Apagar o que já não existe não é erro no CodeCommit — só volta sem repositoryId."],
      ['aws codecommit create-repository --repository-name legado-folha --repository-description "Folha antiga"',
        "aws codecommit delete-repository --repository-name legado-folha",
        "aws codecommit delete-repository --repository-name legado-folha"],
      (c, cmd, ok) => ok && ehCmd(cmd, "codecommit", "delete-repository") && flag(cmd, "repository-name") === "legado-folha" && !repo(c, "legado-folha")),
  ];

  const PROJETO = { id: "ccm-proj", servico: "codecommit", tipo: "projeto", nivel: 3, xp: 360,
    titulo: "🗃️ Projeto: o repositório do app de ponto",
    descricao: "O app de ponto eletrônico vai nascer do jeito certo. Sem passo a passo: crie o repositório <b>app-ponto</b>, faça o primeiro commit de um <b>README.md</b> na <b>main</b>, abra a branch <b>dev</b> a partir dela, grave um <b>buildspec.yml</b> na <b>dev</b> e leve a mudança pra main por <b>pull request</b> mesclado.",
    dicas: [
      "É o caminho da trilha: create-repository → put-file (main) → create-branch → put-file (dev) → create-pull-request → merge.",
      "Repositório vazio não pede commit pai; depois disso, todo put-file pede a ponta da branch.",
    ],
    solucao: [
      "aws codecommit create-repository --repository-name app-ponto",
      'echo "# App de ponto" > README.md',
      put("app-ponto", "main", "README.md", false, "Primeiro commit"),
      "aws codecommit create-branch --repository-name app-ponto --branch-name dev --commit-id <commit-da-branch:app-ponto:main>",
      'echo "version: 0.2" > buildspec.yml',
      put("app-ponto", "dev", "buildspec.yml", true, "Adiciona buildspec"),
      'aws codecommit create-pull-request --title "Buildspec do app" --targets repositoryName=app-ponto,sourceReference=dev,destinationReference=main',
      "aws codecommit merge-pull-request-by-fast-forward --pull-request-id <pr-id> --repository-name app-ponto",
    ],
    etapas: [
      { texto: "Criar o repositório app-ponto", validar: (c) => !!repo(c, "app-ponto") },
      { texto: "Primeiro commit (README.md) na main", validar: (c) => arquivoNa(c, "app-ponto", "main", "README.md") },
      { texto: "Branch dev criada", validar: (c) => !!ponta(c, "app-ponto", "dev") },
      { texto: "buildspec.yml gravado na dev", validar: (c) => arquivoNa(c, "app-ponto", "dev", "buildspec.yml") },
      { texto: "Pull request dev → main mesclado", validar: (c) => arquivoNa(c, "app-ponto", "main", "buildspec.yml") && prsDe(c, "app-ponto", "dev").some((p) => p.mesclado) },
    ] };

  if (!SERVICOS_META.some((s) => s.id === "codecommit")) {
    const meta = { id: "codecommit", nome: "CodeCommit", subtitulo: "Repositório Git na AWS", icone: "🗃️" };
    // antes do CodeBuild: o código mora aqui antes de ser montado lá
    const iCb = SERVICOS_META.findIndex((s) => s.id === "codebuild");
    const iProj = SERVICOS_META.findIndex((s) => s.id === "projetos");
    const i = iCb >= 0 ? iCb : iProj;
    if (i >= 0) SERVICOS_META.splice(i, 0, meta); else SERVICOS_META.push(meta);
    for (const x of TRILHA) DESAFIOS.push(x);
    DESAFIOS.push(PROJETO);
  }
})();
