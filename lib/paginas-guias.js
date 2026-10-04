"use strict";
// ============================================================
// CLImb — lib/paginas-guias.js
// Três guias públicos, montados no servidor, pras buscas mais feitas sobre a
// CLI que o site não respondia (pesquisa de 29/09/2026: autocompletar do
// Google em pt-BR + perguntas mais votadas da tag aws-cli no Stack Overflow):
//
//   /instalar-aws-cli   "como instalar aws cli" (windows, linux, mac)
//   /comandos-aws-cli   "comandos aws cli" / "aws cli cheat sheet"
//   /erros-aws-cli      "unable to locate credentials", "must specify a region"...
//
// FONTES — nada aqui é de memória:
//   - instalação: docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
//     (lida em 29/09/2026: o script install.sh/install.ps1 virou o método
//     recomendado, e o `aws update` existe nas versões novas — a 2.35.8 daqui
//     ainda não tem, por isso a página diz "nas versões mais novas");
//   - erros: .../cli-chap-troubleshooting.html (mesma data) + as mensagens
//     tiradas do AWS CLI 2.35.8 rodado com config vazia;
//   - comandos: o próprio MANUAIS do app, então a página muda junto.
//
// Regras do CLAUDE.md que valem aqui: ≥400 palavras próprias, title e meta
// description únicos, canonical absoluto, HTML do servidor, sitemap e link
// interno (vão no rodapé de todas as páginas públicas e no índice /aprender).
// ============================================================
const pag = require("./paginas-licoes.js");
const conteudoApp = require("./conteudo-app.js");
const { esc } = pag;

const GUIAS = {
  "instalar-aws-cli": {
    emoji: "⬇️", curto: "Instalar a AWS CLI",
    titulo: "Como instalar a AWS CLI no Windows, Linux e Mac (versão 2) — CLImb",
    descricao: "Passo a passo oficial pra instalar a AWS CLI v2 no Windows, Linux e macOS, conferir a versão, atualizar e resolver o \"command not found\".",
  },
  "comandos-aws-cli": {
    emoji: "⌨️", curto: "Comandos básicos da AWS CLI",
    titulo: "Comandos básicos da AWS CLI: guia de consulta rápida (S3, EC2, IAM, Lambda) — CLImb",
    descricao: "Os comandos da AWS CLI que se usa todo dia — configuração, S3, EC2, IAM, Lambda, logs e CloudFormation — com a forma de cada um e as opções que mais aparecem.",
  },
  "erros-aws-cli": {
    emoji: "🧯", curto: "Erros comuns da AWS CLI",
    titulo: "Erros comuns da AWS CLI e como resolver (credenciais, região, permissão) — CLImb",
    descricao: "Unable to locate credentials, You must specify a region, AccessDenied, InvalidClientTokenId, SignatureDoesNotMatch: o que cada erro da AWS CLI quer dizer e como resolver.",
  },
};

const pre = (s) => `<pre>${esc(s)}</pre>`;

function linksGuias(base, menos) {
  return Object.entries(GUIAS).filter(([id]) => id !== menos)
    .map(([id, g]) => `<li><a href="${esc(base)}/${id}">${g.emoji} ${esc(g.curto)}</a></li>`).join("");
}

// ---------- 1. instalar ----------
function corpoInstalar(base) {
  return `
  <h1><span class="emoji">⬇️</span>Como instalar a AWS CLI</h1>
  <p>A <b>AWS CLI</b> é o programa de linha de comando da AWS: com ela você cria
  bucket, sobe máquina, lê log e dá permissão digitando, em vez de clicar no
  Console. Este guia instala a <b>versão 2</b> (a atual) nos três sistemas, confere
  se deu certo e mostra o que fazer quando o terminal responde que o comando
  <code>aws</code> não existe. Os comandos são os da documentação oficial da AWS.</p>

  <h2>Antes de começar</h2>
  <ul>
    <li><b>Versão 1 e versão 2 usam o mesmo comando</b> <code>aws</code>. Se você tem
    a 1 instalada (comum em máquina antiga ou instalada pelo <code>pip</code>),
    remova antes — duas instalações brigando pelo mesmo nome é a causa nº 1 de
    "instalei e continua a versão velha".</li>
    <li><b>Windows:</b> 64 bits, numa versão que a Microsoft ainda suporta.</li>
    <li><b>macOS:</b> versão 11 ou mais nova, pras versões atuais da CLI.</li>
    <li><b>Linux:</b> 64 bits (x86 ou ARM), com <code>unzip</code> disponível; a CLI usa
    <code>glibc</code>, <code>groff</code> e <code>less</code>, que as distribuições
    grandes já trazem.</li>
  </ul>

  <h2>Linux</h2>
  <p>O jeito recomendado hoje é o <b>script de instalação</b>: baixa, confere a
  assinatura e instala num passo só, no seu usuário (sem <code>sudo</code>). Serve pra
  x86 e ARM.</p>
  ${pre("curl -fsSL https://awscli.amazonaws.com/v2/install.sh | bash")}
  <p>Pra instalar pra todos os usuários da máquina (em <code>/usr/local</code>, com sudo):</p>
  ${pre("curl -fsSL https://awscli.amazonaws.com/v2/install.sh | sudo bash -s -- --system")}
  <p>O caminho clássico — baixar o zip, descompactar e rodar o instalador — continua
  valendo e é o que aparece em quase todo tutorial e laboratório de curso:</p>
  ${pre(`curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install`)}
  <p>Em máquina ARM (Graviton, Raspberry Pi 64 bits) troque o arquivo por
  <code>awscli-exe-linux-aarch64.zip</code>. Sem <code>sudo</code>, dá pra escolher
  pastas suas com <code>./aws/install -i ~/aws-cli -b ~/bin</code>. No Amazon Linux
  que já veio com a CLI do <code>yum</code>, a documentação manda remover a versão do
  pacote antes (<code>sudo yum remove awscli</code>).</p>

  <h2>Windows</h2>
  <p>No PowerShell, o script instala no seu usuário, sem precisar de administrador:</p>
  ${pre("irm https://awscli.amazonaws.com/v2/install.ps1 | iex")}
  <p>Se preferir o instalador tradicional (pra todos os usuários, pede administrador),
  é o MSI — dá pra baixar pelo navegador ou mandar direto:</p>
  ${pre("msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi")}
  <p>Existe também o <code>AWSCLIV2-User.msi</code>, que instala só pro seu usuário.
  Depois de instalar, <b>feche e abra de novo</b> o terminal: a janela que já estava
  aberta não enxerga o PATH novo.</p>

  <h2>macOS</h2>
  <p>O mesmo script do Linux funciona no Mac:</p>
  ${pre("curl -fsSL https://awscli.amazonaws.com/v2/install.sh | bash")}
  <p>Ou o pacote oficial, pelo terminal, pra todos os usuários:</p>
  ${pre(`curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /`)}

  <h2>Confira se instalou</h2>
  ${pre(`aws --version
aws-cli/2.x.x Python/3.x.x Linux/... exe/x86_64`)}
  <p>O número começando com <b>2</b> é o que importa. Se aparecer <code>aws-cli/1.</code>,
  é a instalação antiga que está na frente no PATH. No Linux e no Mac,
  <code>which aws</code> mostra qual arquivo está sendo executado.</p>

  <h2>"aws: command not found"</h2>
  <p>Quase sempre é uma de três coisas, nesta ordem de probabilidade:</p>
  <ul>
    <li><b>Terminal aberto antes da instalação.</b> Feche todos e abra de novo. No
    Windows, às vezes só reiniciando a máquina.</li>
    <li><b>A pasta não está no PATH.</b> O script instala em
    <code>~/.local/bin</code>, que nem toda distribuição põe no PATH. Acrescente ao
    <code>~/.bashrc</code> (ou <code>~/.zshrc</code>): <code>export PATH=$HOME/.local/bin:$PATH</code>
    e rode <code>source ~/.bashrc</code>.</li>
    <li><b>Instalação incompleta ou sem permissão</b> (Linux): rode a instalação de
    novo; se o arquivo existe mas não executa, é permissão da pasta de instalação.</li>
  </ul>

  <h2>Como atualizar</h2>
  <p>Nas versões mais novas da CLI existe o comando <code>aws update</code>, que atualiza
  qualquer instalação feita pelos instaladores oficiais (com <code>sudo</code> ou
  PowerShell de administrador se a instalação foi pra todos os usuários). Se a sua
  responde que <code>update</code> é um comando inválido, ela é anterior a isso:
  rode de novo o mesmo instalador que você usou na primeira vez. A AWS solta versão
  nova quase todo dia útil — comando ou opção que "não existe" na sua máquina e
  existe na documentação costuma ser só versão velha.</p>

  <h2>Instalou. E agora?</h2>
  <p>A CLI instalada ainda não sabe <b>quem é você</b>. O próximo passo é configurar
  credencial e região com <code>aws configure</code> (ou entrar com
  <code>aws login</code> / <code>aws sso login</code>) — e é aí que aparecem os erros
  mais comuns, explicados em <a href="${esc(base)}/erros-aws-cli">Erros comuns da AWS CLI</a>.
  A lição <a href="${esc(base)}/aprender/cli-config">Configurar a AWS CLI</a> explica
  perfis, arquivos <code>~/.aws/config</code> e <code>~/.aws/credentials</code>, SSO e
  assume-role.</p>

  <div class="cta">
    <p>Quer praticar antes de instalar? No CLImb a trilha <b>Primeiros passos</b>
    refaz essa instalação — SSH, <code>curl</code>, <code>unzip</code>,
    <code>sudo ./aws/install</code>, <code>aws --version</code> e o
    <code>aws configure</code> — num terminal simulado, de graça, sem conta na AWS.</p>
    <a class="btn" href="${esc(base)}/">Praticar no terminal</a>
  </div>`;
}

// ---------- 2. comandos ----------
// Grupos da consulta rápida. A descrição de cada linha sai do MANUAIS do app
// (resumoDoManual), então o texto é o mesmo que o `aws <cmd> help` do CLImb
// mostra — e muda junto quando o manual muda.
const GRUPOS = [
  ["Configuração e identidade", "Antes de tudo: com que conta e em que região você está.", [
    ["aws configure", null, "pergunta chave, segredo, região e formato e grava no perfil default"],
    ["aws configure list", "configure.list", "mostra o perfil, a chave (mascarada) e a região em uso — e de onde veio cada um"],
    ["aws configure list-profiles", "configure.list-profiles", "lista os perfis configurados neste computador"],
    ["aws sts get-caller-identity", "sts.get-caller-identity", "responde quem você é: conta, usuário ou role"],
  ]],
  ["S3 — arquivos", "O serviço mais usado pela CLI, e o que mais aparece em script de deploy e backup.", [
    ["aws s3 ls", "s3.ls", "lista seus buckets; com s3://bucket/ lista o que tem dentro"], ["aws s3 mb s3://meu-bucket", "s3.mb", "cria um bucket (o nome é único no mundo inteiro)"],
    ["aws s3 cp relatorio.csv s3://meu-bucket/", "s3.cp", "envia um arquivo pro bucket; invertendo origem e destino, baixa"],
    ["aws s3 cp pasta s3://meu-bucket/pasta --recursive", null, "copia uma pasta inteira (--exclude/--include filtram)"],
    ["aws s3 sync ./site s3://meu-bucket --delete", "s3.sync", "espelha a pasta no bucket: manda só o que mudou e, com --delete, apaga o que saiu da pasta"],
    ["aws s3 rm s3://meu-bucket/velho.txt", "s3.rm", "apaga um objeto; com --recursive, um prefixo inteiro"], ["aws s3 rb s3://meu-bucket --force", "s3.rb", "apaga o bucket; --force esvazia antes"],
    ["aws s3 presign s3://meu-bucket/relatorio.pdf --expires-in 900", "s3.presign", "gera um link temporário pra um arquivo privado, sem abrir o bucket"],
  ]],
  ["EC2 — máquinas", "Listar, subir, parar e apagar instância.", [
    ["aws ec2 describe-instances", "ec2.describe-instances", "lista as instâncias da região, com estado, tipo e IPs"],
    ["aws ec2 run-instances --image-id ami-... --instance-type t3.micro", "ec2.run-instances", "sobe uma instância nova a partir de uma AMI"],
    ["aws ec2 stop-instances --instance-ids i-...", "ec2.stop-instances", "desliga a instância (o disco continua e continua cobrando)"],
    ["aws ec2 start-instances --instance-ids i-...", "ec2.start-instances", "liga de novo uma instância parada"],
    ["aws ec2 terminate-instances --instance-ids i-...", "ec2.terminate-instances", "apaga a instância de vez — não tem volta"],
    ["aws ec2 describe-security-groups", "ec2.describe-security-groups", "mostra os firewalls e as portas que cada um libera"],
  ]],
  ["IAM — quem pode o quê", "Usuário, grupo, role e política.", [
    ["aws iam list-users", "iam.list-users", "lista os usuários IAM da conta"], ["aws iam create-user --user-name ana", "iam.create-user", "cria um usuário (ainda sem permissão nenhuma)"],
    ["aws iam attach-user-policy --user-name ana --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess", "iam.attach-user-policy", "dá permissão ao usuário anexando uma política"],
    ["aws iam create-access-key --user-name ana", "iam.create-access-key", "cria a chave de acesso da CLI — o segredo só aparece nesta resposta"],
    ["aws iam create-role --role-name minha-role --assume-role-policy-document file://trust.json", "iam.create-role", "cria uma role: permissão que um serviço ou pessoa assume, sem chave fixa"],
    ["aws sts assume-role --role-arn arn:aws:iam::123456789012:role/minha-role --role-session-name s1", "sts.assume-role", "pega credenciais temporárias de uma role"],
  ]],
  ["Lambda, logs e infraestrutura", "O dia a dia de quem mantém aplicação na AWS.", [
    ["aws lambda list-functions", "lambda.list-functions", "lista as funções Lambda da região"],
    ["aws lambda invoke --function-name minha-funcao saida.json", "lambda.invoke", "executa a função e grava a resposta no arquivo"],
    ["aws lambda update-function-code --function-name minha-funcao --zip-file fileb://app.zip", "lambda.update-function-code", "publica código novo na função"],
    ["aws logs tail /aws/lambda/minha-funcao --follow", "logs.tail", "mostra o log ao vivo, como o tail -f"],
    ["aws cloudformation deploy --template-file stack.yaml --stack-name minha-stack", "cloudformation.deploy", "cria ou atualiza uma stack a partir do template"],
    ["aws cloudformation describe-stacks --stack-name minha-stack", "cloudformation.describe-stacks", "mostra o estado e as saídas (Outputs) da stack"],
  ]],
];

function corpoComandos(base, conteudo) {
  const manuais = (conteudo && conteudo.manuais) || {};
  const comPagina = conteudo ? conteudoApp.comandosComPagina(conteudo) : {};
  const grupos = GRUPOS.map(([nome, intro, cmds]) => {
    const linhas = cmds.map(([linha, chave, fixo]) => {
      const manual = chave && manuais[chave];
      const resumo = fixo || (manual ? conteudoApp.resumoDoManual(manual) : "");
      const pagina = chave && comPagina[chave];
      const link = pagina ? ` <a href="${esc(base)}/aprender/${esc(pagina.servico)}/${esc(pagina.sub)}" style="color:#58a6ff">manual e exercícios →</a>` : "";
      return `<div class="cmd"><h3><code>${esc(linha)}</code></h3><p>${esc(resumo)}${link}</p></div>`;
    }).join("");
    return `<h2>${esc(nome)}</h2><p>${esc(intro)}</p>${linhas}`;
  }).join("");

  return `
  <h1><span class="emoji">⌨️</span>Comandos básicos da AWS CLI</h1>
  <p>Uma folha de consulta com os comandos que aparecem no trabalho de verdade — em
  vaga de cloud, em script de deploy e em tutorial de laboratório. Não é a lista
  completa (a CLI tem milhares de comandos em mais de 400 serviços): é o pedaço que
  você usa quase todo dia, agrupado pelo que você quer fazer.</p>

  <h2>Como um comando da CLI é montado</h2>
  <p>Todo comando segue a mesma forma, e entender isso vale mais do que decorar:</p>
  ${pre("aws <serviço> <operação> [--opções]\n\naws  ec2  describe-instances  --instance-ids i-0abc --output table")}
  <p>O <b>serviço</b> é o produto da AWS (<code>s3</code>, <code>ec2</code>,
  <code>iam</code>, <code>lambda</code>). A <b>operação</b> quase sempre começa com um
  verbo que diz o que acontece: <code>describe-</code> e <code>list-</code> só leem
  (seguros), <code>create-</code> e <code>put-</code> criam, <code>update-</code> muda,
  <code>delete-</code> e <code>terminate-</code> apagam. Ler o verbo antes do Enter é o
  hábito que evita o pior incidente. O <code>s3</code> é a exceção: tem comandos curtos
  de alto nível (<code>cp</code>, <code>ls</code>, <code>sync</code>), e a API completa
  fica no <code>s3api</code>.</p>

  <h2>Opções que valem em qualquer comando</h2>
  <ul>
    <li><code>--region sa-east-1</code> — roda em outra região só dessa vez.</li>
    <li><code>--profile dev</code> — usa outro perfil (outra conta ou outra credencial).</li>
    <li><code>--output table</code> (ou <code>text</code>, <code>json</code>, <code>yaml</code>)
    — muda o formato da resposta; <code>text</code> é o melhor pra script.</li>
    <li><code>--query 'Reservations[].Instances[].InstanceId'</code> — filtra a resposta
    (JMESPath) e traz só o campo que interessa.</li>
    <li><code>--no-cli-pager</code> — não abre a resposta no paginador
    (<code>less</code>); essencial em script.</li>
    <li><code>--debug</code> — mostra cada passo: que credencial achou, o que mandou e
    o que voltou. É o primeiro recurso quando um erro não faz sentido.</li>
    <li><code>aws &lt;serviço&gt; &lt;operação&gt; help</code> — o manual do comando, com
    exemplos.</li>
  </ul>
  ${grupos}

  <h2>Três hábitos que separam quem sabe usar</h2>
  <ul>
    <li><b>Confira onde você está antes de apagar:</b> <code>aws sts get-caller-identity</code>
    mostra a conta; <code>aws configure list</code>, a região. Delete na conta errada é o
    erro mais caro de quem tem várias contas.</li>
    <li><b>Ensaie o que é destrutivo:</b> <code>--dryrun</code> no <code>s3 cp/sync/rm</code>
    e <code>--dry-run</code> no EC2 mostram o que aconteceria sem fazer.</li>
    <li><b>Peça só o campo:</b> <code>--query</code> + <code>--output text</code> transforma
    uma resposta de 200 linhas no id que o próximo comando precisa.</li>
  </ul>

  <p>Quando um comando falhar, a explicação da mensagem está em
  <a href="${esc(base)}/erros-aws-cli">Erros comuns da AWS CLI</a>. Ainda não instalou?
  Veja <a href="${esc(base)}/instalar-aws-cli">Como instalar a AWS CLI</a>.</p>

  <div class="cta">
    <p>Consulta rápida ajuda a lembrar; <b>digitar é o que fixa</b>. No CLImb cada um
    desses comandos vira um pedido de trabalho real num terminal AWS simulado, com a
    saída e a mensagem de erro de verdade — sem conta na AWS e sem risco de fatura.</p>
    <a class="btn" href="${esc(base)}/">Praticar no terminal</a>
  </div>`;
}

// ---------- 3. erros ----------
const ERROS = [
  ["Unable to locate credentials",
    'aws: [ERROR]: An error occurred (NoCredentials): Unable to locate credentials. You can configure credentials by running "aws login".',
    "A CLI procurou uma credencial em todos os lugares onde ela olha (variáveis de ambiente, <code>~/.aws/credentials</code>, SSO, role da máquina) e não achou nenhuma. Não é problema de permissão: a AWS nem chegou a ser chamada.",
    "Configure uma credencial: <code>aws configure</code> (chave de acesso), <code>aws login</code> (sua sessão do Console) ou <code>aws sso login --profile x</code> (SSO da empresa). Se você usa perfil com nome, lembre do <code>--profile</code> — sem ele a CLI procura o <b>default</b>."],
  ["You must specify a region",
    'aws: [ERROR]: An error occurred (NoRegion): You must specify a region. You can also configure your region by running "aws configure".',
    "A credencial existe, mas nem o comando nem o perfil dizem a região — e quase todo serviço da AWS é regional.",
    "Grave uma região no perfil (<code>aws configure set region sa-east-1</code>) ou passe <code>--region</code> no comando. A ordem de prioridade é: <code>--region</code>, variável <code>AWS_REGION</code>, variável <code>AWS_DEFAULT_REGION</code> e, por último, o <code>region</code> do perfil."],
  ["The config profile could not be found",
    "aws: [ERROR]: The config profile (dev) could not be found",
    "O <code>--profile</code> (ou a variável <code>AWS_PROFILE</code>) aponta pra um perfil que não existe no <code>~/.aws/config</code> — geralmente erro de digitação, ou o perfil existe noutro computador.",
    "Liste os perfis com <code>aws configure list-profiles</code> e use um deles, ou crie o que falta com <code>aws configure --profile dev</code>."],
  ["AccessDenied / is not authorized to perform",
    "An error occurred (AccessDenied) when calling the AssumeRole operation: User: arn:aws:iam::123456789012:user/ana is not authorized to perform: sts:AssumeRole on resource: arn:aws:iam::123456789012:role/admin",
    "Aqui a credencial funcionou: a AWS sabe quem você é e respondeu que <b>essa identidade</b> não tem permissão pra essa ação. A mensagem diz as três coisas que importam — quem (<code>User:</code>), qual ação e em qual recurso.",
    "Confira primeiro se a identidade é a que você imagina (<code>aws sts get-caller-identity</code>) — metade dos casos é perfil errado. Se for a certa, falta uma política que permita exatamente aquela ação naquele recurso. Comandos como <code>aws s3 sync</code> chamam várias APIs; o <code>--debug</code> mostra quais."],
  ["InvalidClientTokenId / InvalidAccessKeyId",
    "An error occurred (InvalidClientTokenId) when calling the GetCallerIdentity operation: The security token included in the request is invalid.",
    "A chave de acesso configurada não existe mais (ou foi desativada). No S3 a mesma situação aparece como <code>InvalidAccessKeyId</code>: \"The AWS Access Key Id you provided does not exist in our records\". O caso clássico é depois de uma <b>rotação de chave</b>: a nova foi criada, a velha desativada, e um perfil ficou com a velha.",
    "Veja qual chave o perfil usa (<code>aws configure list --profile x</code> mostra os 4 últimos caracteres) e compare com <code>aws iam list-access-keys</code>. Atualize com <code>aws configure set aws_access_key_id ...</code> e <code>aws_secret_access_key</code>. Confira também se não há <code>AWS_ACCESS_KEY_ID</code> antiga numa variável de ambiente — ela vence o arquivo."],
  ["SignatureDoesNotMatch",
    "An error occurred (SignatureDoesNotMatch) when calling the ListBuckets operation: The request signature we calculated does not match the signature you provided. Check your key and signing method.",
    "Toda chamada é assinada com o seu segredo e com a hora do seu computador. Se o segredo está errado (copiado pela metade, com espaço, com caractere especial mastigado por algum script) ou se o relógio da máquina está vários minutos fora, a assinatura não bate.",
    "Confira o relógio (<code>date</code>) — em máquina virtual que hibernou é comum ele ficar pra trás. Se a hora está certa, gere o segredo de novo: a AWS não mostra o segredo antigo outra vez."],
  ["ExpiredToken",
    "An error occurred (ExpiredToken) when calling the ... operation",
    "Credencial temporária (de <code>assume-role</code>, SSO ou <code>aws login</code>) tem prazo. Passou do <code>Expiration</code>, toda chamada falha — mesmo que tenha funcionado há uma hora.",
    "Renove: <code>aws sso login --profile x</code> no SSO; um novo <code>assume-role</code> se você copiou as credenciais à mão. Melhor ainda: perfil com <code>role_arn</code> + <code>source_profile</code>, que renova sozinho."],
  ["Found invalid choice / Unknown options",
    "aws: [ERROR]: An error occurred (ParamValidation): argument subcommand: Found invalid choice 'copy'\n...\naws: [ERROR]: Unknown options: --regiao, x",
    "O comando ou a opção não existe — ou existe numa versão da CLI mais nova que a sua. A CLI lança versão quase todo dia útil, e serviço novo só aparece depois de atualizar.",
    "Confira a grafia no manual (<code>aws s3 help</code> lista os comandos do serviço). Se está certa e a documentação mostra o comando, atualize a CLI — veja <a href=\"/instalar-aws-cli\">Como instalar a AWS CLI</a>."],
  ["aws: command not found",
    "command not found: aws",
    "O sistema não acha o programa: instalação incompleta, terminal aberto antes da instalação, ou pasta de instalação fora do PATH.",
    "Feche e abra o terminal; confira com <code>which aws</code> (Linux/Mac) ou <code>where aws</code> (Windows); se não aparecer, a pasta precisa entrar no PATH."],
  ["A resposta abre numa tela que não sai",
    "(a saída aparece no less; é preciso apertar q pra voltar ao terminal)",
    "A versão 2 manda respostas longas pro paginador do sistema. Em script, isso trava a execução esperando uma tecla.",
    "Use <code>--no-cli-pager</code> no comando, ou defina <code>cli_pager =</code> (vazio) no perfil, ou a variável <code>AWS_PAGER=\"\"</code>."],
  ["CERTIFICATE_VERIFY_FAILED",
    "[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed",
    "Quase sempre é rede de empresa com proxy que abre o HTTPS com um certificado próprio, que a CLI não conhece.",
    "Aponte a CLI pro certificado da empresa (<code>.pem</code>) com <code>--ca-bundle</code>, com <code>ca_bundle</code> no perfil ou com a variável <code>AWS_CA_BUNDLE</code>. Desligar a verificação de SSL resolve o sintoma e abre um buraco — não faça."],
];

function corpoErros(base) {
  const ancora = (i) => "erro-" + (i + 1);
  const itens = ERROS.map(([nome, msg, causa, solucao], i) => `
  <h2 id="${ancora(i)}">${esc(nome)}</h2>
  ${pre(msg)}
  <p><b>O que quer dizer:</b> ${causa}</p>
  <p><b>Como resolver:</b> ${solucao}</p>`).join("");
  const indice = ERROS.map(([nome], i) => `<li><a href="#${ancora(i)}" style="color:#58a6ff">${esc(nome)}</a></li>`).join("");
  return `
  <h1><span class="emoji">🧯</span>Erros comuns da AWS CLI e como resolver</h1>
  <p>Os erros da AWS CLI parecem todos iguais pra quem está começando — um bloco em
  inglês com um nome entre parênteses. Mas o nome entre parênteses é o diagnóstico:
  ele diz se o problema é <b>achar</b> a credencial, <b>a credencial em si</b>, a
  <b>permissão</b> ou o <b>comando</b>. Abaixo, os que mais aparecem, com a mensagem
  como ela sai no terminal (tirada da CLI versão 2 e da documentação oficial de
  solução de problemas), o que ela quer dizer e o que fazer.</p>

  <h2>Antes de tudo: dois comandos que resolvem metade</h2>
  ${pre(`aws configure list          # que perfil, que chave, que região — e de onde veio cada um
aws sts get-caller-identity # com que conta e identidade a AWS acha que está falando`)}
  <p>A maioria dos "não funciona" é a CLI usando uma credencial ou uma região
  diferente da que você imagina — uma variável de ambiente esquecida, um perfil sem
  <code>--profile</code>. Esses dois comandos mostram isso em segundos. Se ainda
  assim não fizer sentido, rode o comando que falhou com <code>--debug</code>: ele
  mostra onde a credencial foi encontrada, o pedido enviado e a resposta crua.</p>

  <h2>Neste guia</h2>
  <ul>${indice}</ul>
  ${itens}

  <h2>Como ler qualquer erro da AWS</h2>
  <p>O formato é sempre <code>An error occurred (<b>Código</b>) when calling the
  <b>Operação</b> operation: <b>mensagem</b></code>. A <b>operação</b> diz qual API
  falhou — útil quando um comando chama várias, como o <code>s3 sync</code>. O
  <b>código</b> é o que você pesquisa. Erro sem esse formato, começando com
  <code>aws: [ERROR]:</code> e sem "when calling", aconteceu <b>antes</b> de sair da
  sua máquina: é configuração local, não permissão na AWS.</p>

  <p>Veja também: <a href="${esc(base)}/comandos-aws-cli">Comandos básicos da AWS CLI</a>
  e a lição <a href="${esc(base)}/aprender/cli-config">Configurar a AWS CLI</a>
  (perfis, credenciais, SSO e assume-role).</p>

  <div class="cta">
    <p>O jeito mais rápido de reconhecer esses erros é <b>provocar cada um</b> num lugar
    seguro. A trilha grátis <b>Configurar a CLI</b> do CLImb faz exatamente isso: você
    erra o perfil, fica sem região, rotaciona a chave e vê o token inválido — e
    conserta — num terminal simulado, sem conta na AWS.</p>
    <a class="btn" href="${esc(base)}/">Praticar no terminal</a>
  </div>`;
}

function paginaGuia(id, opts) {
  opts = opts || {};
  const g = GUIAS[id];
  if (!g) return null;
  const base = opts.base || "";
  const corpo = id === "instalar-aws-cli" ? corpoInstalar(base)
    : id === "comandos-aws-cli" ? corpoComandos(base, opts.conteudo)
      : corpoErros(base);
  return pag.cabecalho(g.titulo, g.descricao, `${base}/${id}`, base) +
    pag.trilhaJsonLd(base, [{ nome: g.curto, url: `${base}/${id}` }]) + corpo +
    `<h2>Outros guias</h2><ul class="vizinhas">${linksGuias(base, id)}</ul>` + pag.rodape(base);
}

function secaoGuiasDoIndice(base) {
  return `<h2>Guias da AWS CLI</h2><ul class="vizinhas">${linksGuias(base)}</ul>`;
}

const ROTAS_GUIAS = Object.keys(GUIAS).map((id) => "/" + id);

module.exports = { GUIAS, ROTAS_GUIAS, paginaGuia, secaoGuiasDoIndice };
