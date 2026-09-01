"use strict";
// ============================================================
// CLImb — changelog.js
// Página de Novidades (changelog) + Em breve (roadmap).
// Centraliza TODOS os anúncios de atualização num lugar só, em vez de
// deixá-los soltos pela interface. Botão "✨ Novidades" no rodapé com um
// selo de "novo" quando há atualização que a pessoa ainda não viu.
// ADITIVO: não toca o core. window.abrirChangelog('novidades'|'breve').
//
// REGRA DE PADRONIZAÇÃO (decisão do Gabriel, 2026-07-23): UMA ENTRADA POR DIA.
// Não crie entradas novas pra cada mudancinha — parece chat. Ao mexer no
// changelog no MESMO dia de uma entrada que já existe: COMPLEMENTE a entrada
// daquele dia (adicione/edite um item), NÃO crie outra. Mudanças relacionadas
// (ex.: várias levas de serviços novos) viram UM item guarda-chuva com
// sub-bullets "• ", não vários itens soltos. `versao` = a data pura
// ("2026-07-23"), sem sufixo a/b/c. Só há entrada nova quando vira o dia.
// ============================================================
(function () {
  if (typeof window === "undefined") return;

  const CHAVE_VISTO = "climb.changelog.visto"; // guarda a última versão vista

  // Histórico de mudanças — mais recente primeiro. UMA entrada por dia (ver a
  // regra no topo do arquivo). `versao` = data pura, marca o que a pessoa já viu.
  const NOVIDADES = [
    {
      versao: "2026-09-01",
      data: "1 set 2026",
      titulo: "🎓 O simulado CLF-C02 agora tem uma página pública — com 12 questões abertas",
      itens: [
        "<b>🎓 Quem procura “simulado AWS Cloud Practitioner” no Google agora pode achar o CLImb.</b> Existe uma página nova em <code>climb.dev.br/simulado-aws-clf-c02</code> que explica a prova de verdade: o que cada domínio cobra e <b>com que peso</b> (Conceitos 24%, Segurança 30%, Tecnologia 34%, Cobrança 12%), quantas questões o simulado sorteia e qual é a nota de corte.",
        "<b>📖 E ela abre 12 questões do banco, com gabarito comentado.</b> Três de cada domínio, com a resposta certa, a explicação de <b>por quê</b> e o <b>link pra página oficial da AWS</b> que sustenta cada resposta — o mesmo padrão das <b>345</b>. São questões de verdade, não amostra enfeitada: é a forma honesta de alguém conferir a qualidade antes de criar conta. O restante do banco continua no app.",
      ],
    },
    {
      versao: "2026-08-31",
      data: "31 ago 2026",
      titulo: "⌨️ O terminal virou um terminal de verdade — e a ordem das trilhas foi arrumada",
      itens: [
        "<b>⌨️ O hábito mais básico de terminal passou a valer aqui: recuperar o que você já digitou.</b> O histórico existia (setas ↑ ↓), mas <b>morria quando você fechava a aba</b> — então na sessão seguinte você redigitava tudo.<br>• Agora ele <b>sobrevive entre sessões</b> (guarda as últimas 300 linhas, no seu próprio navegador).<br>• E chegou o <b>Ctrl+R</b>, a busca reversa do bash, igualzinha: o prompt vira <code>(reverse-i-search)`termo':</code>, Ctrl+R de novo pula pra ocorrência mais antiga, Backspace encurta o termo, Esc cancela devolvendo o que você estava escrevendo e Enter executa. Isso não é enfeite do CLImb: é o atalho que você vai usar no bash de verdade, no trabalho.",
        "<b>🧭 E o próprio terminal agora te leva às atividades.</b> Com <b>630 atividades em 63 trilhas</b>, rolar a lista pra achar algo é trabalho. Digite <code>climb --help</code> e veja:<br>• <code>climb proxima</code> — abre a próxima que você ainda não concluiu, na ordem certa de aprendizado.<br>• <code>climb buscar &lt;termo&gt;</code> — procura por título, serviço ou id.<br>• <code>climb ir &lt;id&gt;</code> — abre a atividade e a trilha dela na lateral.<br>A lista lateral continua fazendo tudo; isto é atalho pra quem já sabe onde quer chegar. E se a atividade estiver travada, ele <b>diz por quê</b> em vez de só recusar.",
        "<b>🚪 A primeira sessão agora começa no terminal, e você pode escolher a pele do app.</b> Quem chegava caía numa tela cheia de painéis sem saber onde clicar. Agora a primeira visita abre em <b>terminal de tela cheia</b>, com um colega pedindo um bucket — e a interface vai se montando conforme você digita (a barra de XP aparece quando você ganha XP, a lateral quando você pergunta por ela). <b>Não é um terminal de mentira:</b> é o app real, então <code>aws s3 help</code> abre o manual de verdade e concluir a tarefa vale os <b>50 XP</b> do desafio de verdade. E em ⚙️ tem um <b>tema claro</b> opcional, com a fonte hospedada aqui mesmo (usar a do Google exigiria afrouxar a segurança do site — não vale a troca).",
        "<b>🐣 Socorro pra quem nunca viu um terminal na vida.</b> Fizemos o percurso do app como alguém que usa computador só no dia a dia: foram <b>quatro erros antes do primeiro acerto</b>, e três não eram desatenção — eram coisas que ninguém tinha contado.<br>• <code>ajuda</code> (e <i>socorro</i>, <i>não sei</i>, <i>estou perdido</i>) dava “comando não encontrado”. Agora roda o help — mas avisa antes que, em terminal, o comando é <code>help</code>, em inglês; senão você aprende a falar uma palavra que não existe em terminal nenhum.<br>• Quando a mensagem diz <code>s3://&lt;nome-do-bucket&gt;</code>, ninguém explicou que <b>&lt; &gt; significa “escreva aqui”</b> — muita gente digitava os sinais junto. Agora isso é interceptado, com o antes/depois na tela.<br>• Esquecer o <code>s3://</code>, digitar uma barra só ou usar maiúscula davam todos a MESMA mensagem. Agora cada caso diz o que foi, e o mais comum <b>devolve o comando já corrigido</b>.<br>• E três tentativas erradas seguidas apontam pro botão de <b>Dica</b>.",
        "<b>📝 O simulado foi de 308 para 345 questões — e duas estavam ensinando coisa errada.</b> Auditamos o banco inteiro contra a documentação oficial: estrutura limpa, mas <b>conteúdo que envelheceu</b>. Uma questão dava ao plano <b>Business</b> o tempo de resposta de 30 minutos que é do <b>Enterprise On-Ramp</b>; outra ensinava o Free Tier antigo dos “12 meses grátis”, que a AWS substituiu pelo <b>Free plan com créditos</b>. Nos dois casos a explicação agora mostra <b>o antigo (que a prova ainda cobra) E o novo</b>, em vez de simplesmente trocar — quem estuda precisa reconhecer as duas versões. As <b>37 novas</b> fecham serviços que nunca apareciam (Transcribe, Storage Gateway, DataSync, FSx, DocumentDB, EventBridge, Amplify, License Manager), e a distribuição por domínio segue o peso oficial da prova. <b>Todas com fonte oficial.</b> No gabarito comentado, algumas explicações agora vêm com <b>diagrama</b> pra você ver o desenho em vez de imaginar.",
        "<b>🪜 A ordem das trilhas foi arrumada: 11 atividades estavam no lugar errado.</b> Elas eram <b>reforço fácil pendurado no fim da trilha</b>, ou seja, <b>depois</b> da atividade mais difícil. Você suava pra montar uma rede completa de ponta a ponta e a atividade seguinte era “liste suas VPCs”. Agora cada reforço vem <b>logo depois da lição que ensina aquele comando</b>, que é onde ele serve pra fixar: em <b>VPC</b>, <b>RDS</b>, <b>EC2</b>, <b>Lambda</b>, <b>DynamoDB</b> e <b>Linux</b> a dificuldade só sobe até o fim. Nenhuma atividade foi removida — as 630 continuam lá, em ordem melhor.",
        "<b>🔎 As lições agora existem fora do app — e o Google pode encontrá-las.</b> O CLImb tinha <b>três</b> páginas visíveis pra buscador (início, sobre e privacidade); as <b>53 lições</b> escritas viviam dentro do JavaScript, invisíveis pra quem procura <i>“o que é IAM”</i> ou <i>“pra que serve o S3”</i>. Agora cada lição tem endereço próprio em <code>climb.dev.br/aprender</code>, montada no servidor, com o mesmo texto de dentro do app (uma fonte só: mexeu na lição, a página muda junto). São 53 portas de entrada novas pra quem ainda não conhece o CLImb — e um link <b>Lições de AWS</b> no rodapé pra você chegar nelas.",
        "<b>📄 A trilha de JSON e YAML ganhou a introdução que faltava</b> — o bloco “Entenda o serviço” que todas as trilhas têm e essa não tinha, explicando por que quase tudo que é mais complexo que uma opção chega à AWS como arquivo, o que é <code>file://</code> e por que no YAML a indentação <b>é</b> a estrutura.",
        "<b>🔒 E dois detalhes que atrapalhavam no dia a dia:</b><br>• Botão de atividade bloqueada agora <b>mostra um cadeado</b> e diz o motivo ao passar o mouse, em vez de simplesmente não responder ao clique.<br>• O botão de <b>entrar com Google</b> às vezes não aparecia — era uma corrida entre a página e a checagem de conexão. Corrigido.<br>• Uma atividade do Linux vinha <b>concluída de graça</b> pra quem tinha feito a trilha de Setup antes (as duas mexem no mesmo arquivo de chave). Agora ela exige que você rode o comando.",
      ],
    },
    {
      versao: "2026-08-22",
      data: "22 ago 2026",
      titulo: "🧩 Os serviços pararam de ser ilhas: 8 cenários que juntam as peças",
      itens: [
        "<b>📄 Trilha nova em Fundamentos: JSON e YAML.</b> Levantamos que <b>42 atividades</b> pedem JSON escrito na linha de comando, <b>49</b> apontam pra um arquivo com <code>file://</code> e <b>19</b> usam <code>--query</code> — quase 15% do app. E até agora, se você desse <code>cat trust.json</code>, a resposta era <b>“(arquivo de exemplo)”</b>: a pessoa era mandada usar aquele arquivo dezenas de vezes sem nunca poder ver o que tem dentro. Copiava uma string que não entendia.",
        "<b>👀 Agora os arquivos abrem de verdade.</b> <code>cat trust.json</code>, <code>cat politica-publica.json</code>, <code>cat infra.yaml</code> e <code>cat site-s3.yaml</code> mostram o conteúdo real — e no caso dos dois YAML é <b>exatamente o texto que o <code>create-stack</code> processa</b>, não uma cópia parecida. Quem já jogava também passa a ver: antes o arquivo antigo ficava preso ao texto de exemplo pra sempre.",
        "<b>🧩 São 8 atividades, e a trilha é grátis</b> (é pré-requisito, cobrar por ela seria cobrar pra entender o que já está sendo pedido). Você abre uma <b>trust policy</b> e descobre que ela responde uma pergunta só — <i>quem pode vestir esta role</i>; aprende a diferença entre objeto <code>{ }</code> e lista <code>[ ]</code>; caça a <b>vírgula sobrando</b> que a AWS recusa; vê o mesmo dado em YAML e por que <b>indentação ali é sintaxe, não enfeite</b>; e enfrenta a pegadinha que mais trava gente de verdade: <b>aspas simples por fora, duplas por dentro</b> — se inverter, a AWS responde <i>Invalid JSON received</i>. No fim, <code>--query</code> pra pescar um campo no meio do despejo.",
        "<b>🔐 Seu perfil agora nasce privado, e você manda nos seus dados.</b> Antes, toda conta nova já ficava visível em <code>climb.dev.br/u/seu-usuario</code> — com XP, atividades e sequência — sem você ter marcado nada. Agora é o contrário: só fica público se você <b>ligar</b> a opção em Perfil → Editar, e o texto lá diz exatamente o que passa a aparecer. Quem já tinha marcado continua como estava.",
        "<b>⬇️ E em Perfil → Seus dados tem dois botões novos:</b> <b>Baixar meus dados</b>, que gera um arquivo com tudo o que o sistema guarda sobre você, e <b>Apagar minha conta</b>, que remove conta, progresso, XP, sessões e perfil público de uma vez — sem cópia guardada. Antes isso só era possível pedindo pra alguém. Também escrevemos uma <b>página de privacidade e termos</b> (link no rodapé) dizendo em português o que é coletado, com quem é compartilhado e por quanto tempo fica.",
        "<b>⌨️ O app ficou bem mais fácil de usar só com o teclado.</b> Faltavam <b>23 Tabs</b> para chegar no campo do terminal — a lista lateral inteira vinha antes, toda vez. Agora o primeiro Tab da página oferece <b>“Pular para o terminal”</b>: um Tab e um Enter e você está digitando. Num app de linha de comando, isso ajuda todo mundo, não só quem depende de tecnologia assistiva.",
        "<b>🔊 E quem usa leitor de tela passou a ouvir o que antes era só visual.</b> A lista de atividades agora se anuncia como lista (<i>“item 3 de 31”</i>), a atividade bloqueada diz <b>por que</b> está bloqueada, a barra de XP virou barra de progresso de verdade, as trilhas avisam se estão abertas ou fechadas, e a página ganhou um título principal para quem navega por cabeçalhos. No celular, o botão do menu ☰ cresceu para o tamanho mínimo recomendado de toque.",
        "<b>🔧 Consertamos a trilha de entrada — ela estava impossível.</b> Um teste feito do zero, como usuário novo, mostrou que as <b>4 primeiras atividades do app</b> (Primeiros passos: SSH, curl, unzip, instalar) <b>não podiam ser concluídas</b>: o laboratório de rede estava capturando os comandos <code>ssh</code> e <code>curl</code> de todo o app, mesmo desligado, e lia o arquivo da chave como se fosse o endereço do servidor. Agora funciona do começo ao fim, incluindo o <code>aws configure</code>. Também corrigimos uma atividade do IAM que pedia para listar as permissões de uma usuária que só é criada numa trilha bem posterior.",
        "<b>🏁 E quem termina tudo agora recebe uma despedida.</b> Antes, ao concluir as <b>630 atividades</b> — nível máximo, 10 de 10 conquistas — o app continuava mostrando o texto de boas-vindas dizendo <i>“comece pela trilha do S3 se for sua primeira vez”</i>. O fim da jornada simplesmente não existia.",
        "<b>✍️ E agora você ESCREVE os arquivos, não só lê.</b> A trilha de JSON e YAML ganhou mais <b>5 atividades</b> (são 13 no total) e fecha o ciclo inteiro: você escreve um <b>trust.json</b> seu com <code>echo</code> e <code>></code>, confere com <code>cat</code>, e cria uma <b>role de verdade</b> apontando pra ele com <code>file://</code>. Depois conserta a política quebrada e aplica num bucket. No fim, monta um <b>template YAML linha a linha</b> com <code>>></code> e <b>sobe a stack</b> — o bucket nasce com o nome que <b>você</b> digitou. É Infraestrutura como Código do começo ao fim, em cinco atividades.",
        "<b>🔌 Isso só passou a ser possível porque duas coisas foram ligadas.</b> Havia dois sistemas de arquivos separados no simulador: o <code>echo ... > x.json</code> gravava num, e o <code>file://x.json</code> lia de outro. O resultado era absurdo — você criava o arquivo, via ele no <code>ls</code>, e a AWS respondia <i>“arquivo não existe”</i>. Agora qualquer arquivo que você criar pode ser usado em <b>qualquer</b> comando que aceite <code>file://</code>, em qualquer serviço.",
        "<b>🧩 Fizemos um raio-x das 599 atividades e achamos um buraco estrutural.</b> As trilhas de <b>cenário</b> — Mundo real, Projetos, Diagnóstico e as de desafio — usavam só <b>7 serviços</b>: S3, EC2, IAM, Lambda, DynamoDB, RDS e CloudWatch. Os outros <b>42 ficavam órfãos</b>: você aprendia SQS, KMS, CloudFormation, ECS, Route53, Step Functions e companhia na trilha deles e <b>nunca usava nenhum pra construir nada</b>. Eram ensinados e abandonados.",
        "<b>🏗️ Chegaram 8 cenários novos no Mundo real</b> (a trilha foi de 24 para 32), cada um juntando serviços que antes nunca se encontravam: <b>fila que não perde pedido</b> (SQS + SNS), <b>senha do banco fora do código</b> (KMS + Secrets Manager), <b>infra que se reconstrói sozinha</b> (CloudFormation), <b>atendimento multilíngue</b> (Comprehend + Translate + Polly), <b>do build ao ar em contêiner</b> (ECR + ECS), <b>site com domínio e HTTPS</b> (S3 + ACM + CloudFront + Route53), <b>fluxo com etapas e horário</b> (Step Functions + EventBridge) e <b>teto de gasto antes do susto</b> (Budgets + Cost Explorer).",
        "<b>✅ E a conta fechou: zero serviços órfãos.</b> Na mesma leva entraram mais <b>10 cenários</b> (o Mundo real foi de 32 para <b>42</b>) cobrindo os 25 que ainda faltavam: <b>API com login</b> (API Gateway + Cognito), <b>tráfego que cresce sozinho</b> (ELB + Auto Scaling), <b>do evento bruto à consulta SQL</b> (Kinesis + Glue + Athena), <b>Kubernetes com disco compartilhado</b> (EKS + EFS), <b>quem vigia a conta</b> (GuardDuty + Inspector + Macie), <b>a borda e a saúde da conta</b> (WAF + Shield + Trusted Advisor), <b>quem mexeu e o que saiu do padrão</b> (CloudTrail + Config + Organizations), <b>cada dado no banco certo</b> (ElastiCache + Redshift), <b>app gerenciado e configurável</b> (Beanstalk + SSM) e <b>a máquina que lê a foto e escreve o laudo</b> (Rekognition + Bedrock). Os serviços que aparecem em algum cenário passaram de <b>7 para 52</b> — agora <b>todos</b> os que têm trilha também têm um lugar onde são usados pra construir algo.",
        "<b>🔗 Nenhum comando novo — e é esse o ponto.</b> Tudo que aparece nesses cenários já tinha sido ensinado na trilha de origem. O que mudou é que agora as peças <b>se encaixam</b>: em vez de criar uma fila e parar, você desacopla um checkout; em vez de subir um stack e parar, você <b>derruba e reconstrói</b> a infra a partir do template, que é o que IaC compra de verdade. Os serviços que aparecem em algum cenário passaram de <b>7 para 27</b>.",
      ],
    },
    {
      versao: "2026-08-21",
      data: "21 ago 2026",
      titulo: "🚪 O CLImb ganhou porta de entrada — e a tela parou de assustar quem chega",
      itens: [
        "<b>🚪 Quem abre o CLImb pela primeira vez agora vê uma apresentação.</b> Antes o link caía <b>direto dentro do app</b>: terminal, barra de XP zerada e 15 botões, sem nunca dizer o que isso aqui é nem por que valeria o seu tempo. Agora a primeira visita começa por uma capa que <b>mostra o CLImb funcionando</b> — o terminal roda os comandos na sua frente — e tem <b>um botão só</b>, que já te larga na primeira atividade. Ela some pra sempre depois de dispensada: quem já joga nunca vê.",
        "<b>🧹 A tela parou de mostrar tudo de uma vez.</b> Console, Simulados, Turmas, Carreiras, Diagrama, Arquiteto IA, Conquistas — ferramentas boas, e nenhuma faz sentido <b>antes</b> da sua primeira atividade. Agora elas <b>aparecem sozinhas assim que você conclui a primeira</b>; e se quiser fuçar antes disso, o <b>⋯ Mais</b> no rodapé libera tudo na hora, nada fica trancado. No celular o rodapé encolheu de <b>6 botões para 2</b> — sobrou tela pro que importa. A barra de XP também mudou de conversa: em vez de dizer <b>quanto falta</b> antes de você ter feito qualquer coisa, ela diz <b>o que fazer</b>.",
        "<b>📋 A lista de atividades parou de ser um paredão de cadeados.</b> Abrir uma trilha despejava <b>todas</b> as atividades de uma vez — no S3 são 31, e <b>30 vinham trancadas</b>. Eram 1.290px de botão que não faz nada numa tela de 1.270px: a fila de cadeados era mais alta que o monitor inteiro. Agora a trilha mostra o que você já fez, a atividade atual e <b>as 3 próximas</b>; o resto vira uma linha só — <b>“+27 desbloqueiam conforme você avança”</b> — que abre com um clique quando você quiser espiar o caminho todo. A lista caiu de <b>2.301px para 1.088px</b> e os itens clicáveis na tela, de <b>53 para 27</b>.",
        "<b>👁️ O “Revelar resposta” parou de aparecer antes da primeira dica.</b> Ele ficava em <b>vermelho</b>, lado a lado com o botão de dica — o botão de desistir oferecido no mesmo instante que o de tentar, e com a cor mais chamativa dos dois. Agora ele só aparece <b>depois que as dicas acabam</b>, e como link discreto em vez de botão de perigo. O aviso de que zera o XP continua no passo de confirmação, que é onde ele importa.",
        "<b>🧰 Os botões viraram dois menus.</b> Pra quem já está jogando, o topo tinha <b>10 botões</b> e o rodapé <b>6</b>. Agora eles estão agrupados por tarefa: <b>🧰 Ferramentas</b> (Console, Simulados, Arquiteto IA, Diagrama, Carreiras, Conceitos, Turmas) e <b>👤 Você</b> (Perfil, Conquistas, Segurança, Assinar Pro, Resetar). <b>Ranking</b> e <b>Entrar</b> continuam diretos, e no rodapé sobraram <b>“Como jogar”</b> e <b>“Novidades”</b> como links. O topo foi de 10 botões pra 4 itens; o rodapé, de 6 pra 2. Os menus andam com o teclado (setas, Home/End, Esc) pra quem não usa mouse.",
        "<b>📱 No celular o rodapé finalmente some junto.</b> O menu ☰ já recolhia os botões do topo, mas <b>ignorava o rodapé</b> — que ficava com 6 botões e <b>139px, 17% da tela</b>, logo acima do aviso legal. Agora ele recolhe os dois: o rodapé caiu para <b>13px</b> e tudo que era botão está no mesmo ☰, num lugar só.",
        "<b>🧯 O “Resetar progresso” saiu da frente.</b> Ele morava em vermelho no rodapé mesmo para quem tinha <b>zero</b> progresso a apagar — a ação mais destrutiva do app no lugar mais visível. Agora ele só aparece quando <b>existe</b> progresso, e deixou de ser botão vermelho de perigo: o alerta de verdade continua sendo a pergunta de confirmação, que é onde ele serve pra alguma coisa.",
        "<b>🔗 Compartilhar o link parou de dar em branco.</b> Colar <code>climb.dev.br</code> no LinkedIn ou no WhatsApp mostrava um retângulo cinza, sem imagem e sem descrição — o link parecia quebrado. Agora ele abre com <b>cartão, imagem e resumo</b>, e a aba do navegador finalmente tem ícone.",
      ],
    },
    {
      versao: "2026-08-19",
      data: "19 ago 2026",
      titulo: "🧩 Cobertura completa: todo comando do simulador agora tem atividade",
      itens: [
        "<b>🧩 Fizemos um pente-fino comando a comando.</b> De <b>351 comandos</b> que o simulador entende, <b>67 nunca apareciam em atividade nenhuma</b> — dava pra rodar no terminal, mas ninguém era ensinado a usar. Agora a cobertura é de <b>100%</b>, com <b>66 atividades novas</b> (o app passou de 533 para <b>599</b>).",
        "<b>🌐 Rede e roteamento (VPC):</b> a trilha ensinava a criar rede e nunca a fazer o pacote <b>sair</b> dela. Entraram tabela de rotas, associação com a sub-rede, remoção de rota, conferência do internet gateway e as <b>interfaces de rede</b> — que é como se liga uma linha de log à máquina certa.",
        "<b>🔑 Auditoria de IAM:</b> a trilha ensinava a <b>conceder</b> permissão e nunca a <b>conferir</b> quem tem o quê — que é metade do trabalho de segurança. Agora dá pra ver quem está num grupo, o que uma pessoa pode fazer, o histórico de versões de uma política e como revogar acesso de grupo e de role.",
        "<b>🔐 As trilhas curtas ficaram completas:</b> Shield, Macie, Inspector, WAF, GuardDuty e Config tinham 1 ou 2 atividades — várias ensinavam a <b>ligar</b> o serviço e nunca a <b>ver o que ele achou</b>. Agora fecham o ciclo: ligar, consultar o resultado e desligar (com a nota de quanto cada um cobra).",
        "<b>⚙️ E o resto:</b> versões e apelidos do Lambda, chaves do KMS (rotação e desabilitar), o S3 pela API crua (<code>s3api</code>), esvaziar fila do SQS, cancelar inscrição no SNS, religar regra do EventBridge, publicar API com stage, e a limpeza que ninguém lembra — como o <b>target group que não some junto com o load balancer</b> e continua na fatura.",
      ],
    },
    {
      versao: "2026-07-31",
      data: "31 jul 2026",
      titulo: "🧭 A lista virou grupos, chegaram as trilhas de carreira e o CloudWatch fechou o ciclo",
      itens: [
        "<b>🧭 A lista lateral agora tem grupos.</b> Eram <b>62 trilhas soltas</b>, uma embaixo da outra — dava pra rolar sem fim sem achar nada. Agora são <b>10 grupos por tema</b> (Fundamentos, Computação, Bancos, Rede, Integração, Dados e IA, Segurança, Custos, Operações e Praticar), que abrem e fecham com um clique. As trilhas continuam as mesmas; cada grupo mostra quantas tem e o progresso somado.",
        "<b>🎓 Trilhas de carreira</b> — botão novo no rodapé. São <b>5 caminhos prontos</b> pelas trilhas que já existem: <b>DevOps/SRE</b>, <b>Backend/Dev</b>, <b>Dados/Analytics</b>, <b>Segurança</b> e <b>FinOps</b>. Cada passo diz <b>por que ele está ali naquela ordem</b>, e tem um <b>Continuar de onde parei</b> que leva direto pra próxima atividade do caminho. A mesma atividade conta em mais de uma carreira — fazer S3 vale no Backend e no Dados.",
        "<b>🔍 Consulta de log (CloudWatch Logs Insights).</b> A trilha criava grupos de log mas nunca <b>lia</b> um — e ler log é o que se faz num plantão. Agora tem os dois jeitos: <b>filter-log-events</b> (a busca simples por texto) e o <b>Logs Insights</b>, com linguagem de consulta de verdade (<code>filter</code>, <code>stats count() by</code>, <code>sort</code>, <code>limit</code>). O motor <b>roda a sua consulta</b>: consulta diferente dá resposta diferente, não é resultado enlatado. Você descobre <b>quantos erros de cada tipo</b> e <b>qual rota está mais lenta</b> — e que o Insights cobra pelo volume <b>escaneado</b>, por isso se filtra cedo.",
        "<b>⚖️ Lambda e DynamoDB ganharam profundidade.</b> As duas tinham bastante atividade repetindo os mesmos poucos comandos. Agora o <b>Lambda</b> ensina o deploy de verdade: publicar código novo, <b>congelar uma versão</b>, apontar um <b>alias</b> (é assim que se faz deploy e rollback sem derrubar ninguém) e dar <b>permissão pra outro serviço invocar</b> a função — a causa mais comum de \"meu gatilho não dispara\". E o <b>DynamoDB</b> finalmente ensina o <b>query</b>: a diferença entre ir direto na partição e varrer a tabela inteira com o scan, além de chave composta, <b>update-item</b> (muda um campo só) e delete-item.",
      ],
    },
    {
      versao: "2026-07-29",
      data: "29 jul 2026",
      titulo: "🔓 EC2 e IAM liberados no grátis + as dicas agora ensinam (não entregam)",
      itens: [
        "<b>🔓 As trilhas de EC2 e IAM ficaram grátis</b> — mais <b>37 atividades</b> abertas pra todo mundo. São justamente as duas em que o simulador mais se prova: você liga e para uma máquina de verdade, e escreve uma política que <b>realmente</b> nega acesso. Agora dá pra experimentar isso antes de decidir assinar.",
        "<b>📊 CloudWatch: métrica personalizada e painel — 10 atividades novas.</b> A trilha passou a contar a história do meio: <b>meço → alarmo → visualizo</b>.",
        "• <b>Métrica personalizada:</b> até agora o CLImb só falava das métricas que a AWS coleta sozinha (CPU, invocações). Faltava o outro lado — <b>publicar a SUA métrica</b>, aquela que só a sua aplicação sabe (pedidos por minuto). Com <b>put-metric-data</b>, leitura agregada em <b>get-metric-statistics</b> (Sum, Average, Maximum) e <b>alarme em cima dela</b>, igual a qualquer métrica da AWS. Inclusive o erro que todo mundo comete: namespace começando com <b>AWS/</b>, que é reservado.",
        "• <b>Painel (dashboard):</b> alarme te acorda quando quebra; painel é o que alguém olha de manhã. Criar com widgets de <b>gráfico</b> e de <b>recado</b> (markdown), listar, baixar e apagar. Com as duas pegadinhas de verdade: o <b>put substitui o painel inteiro</b> (não existe \"adicionar um widget\") e o painel <b>aceita métrica que nunca foi publicada</b> — a AWS não reclama, o gráfico só aparece vazio, que é a causa nº 1 de \"meu dashboard não mostra nada\".",
        "<b>🔧 A trilha Diagnóstico agora abre explicando o método.</b> O formato dela é diferente de tudo (a infra já está quebrada e você conserta), e antes o aluno caía nela sem aviso. Agora tem um bloco <b>Como esta trilha funciona</b> com o passo a passo do diagnóstico — reproduzir o erro, ligar os flow logs, descartar a hipótese óbvia, seguir o caminho do pacote camada por camada, consertar uma coisa por vez e comprovar nos logs.",
        "<b>📚 Aulas nas trilhas de entrada:</b> \"Primeiros passos\" e \"Linux essencial\" não tinham nenhuma explicação — agora abrem contando <b>o que é a AWS CLI</b> e <b>por que quem trabalha com nuvem precisa do terminal</b>. E os comandos mais difíceis (políticas do IAM, discos EBS, versionamento do S3) ganharam o \"💡 Por que este comando\" que faltava: agora <b>todos</b> têm.",
        "<b>💡 As dicas foram reescritas — 292 atividades.</b> Antes muitas dicas eram o comando pronto, então clicar em \"Dica\" era o mesmo que ver a resposta. Agora cada uma tem <b>dois níveis</b>: a primeira explica o <b>conceito</b> (o que significa <code>create-</code>, <code>describe-</code>, <code>list-</code>… e onde procurar no <code>help</code>) e a segunda mostra a <b>forma do comando</b>, com as opções à mostra e os valores escondidos — ex.: <code>aws kinesis create-stream --stream-name &lt;nome&gt; --shard-count &lt;número&gt;</code>. O comando completo continua só na revelação, que custa XP.",
        "<b>🎯 Novo aviso \"Quase lá\".</b> Quando o comando roda certo mas não completa a atividade, o CLImb <b>não fica mais em silêncio</b>: ele diz onde está o problema — se é outro serviço, se o comando não é esse, se falta uma opção (e qual) ou se algum nome não bate com o enunciado. Sem entregar a resposta.",
        "<b>⚡ O app ficou 73% mais leve</b> — a primeira abertura baixava 1,4 MB e agora baixa 389 KB. Diferença grande pra quem entra pelo celular pelo 4G.",
        "<b>📱 Muito melhor no celular:</b> abrir uma atividade exigia rolar quase 3 telas até o campo de digitar. Agora o bloco <b>Entenda o serviço</b> começa recolhido (com um selo <b>leia antes</b>, é só tocar pra abrir) e a tela já vai direto pro enunciado — com o terminal logo abaixo.",
        "<b>♿ Acessibilidade:</b> quem navega por <b>teclado</b> agora enxerga onde está (indicador de foco em tudo) e consegue sair do terminal com <b>Shift+Tab</b>; as janelas anunciam-se corretamente pra <b>leitores de tela</b>, prendem o Tab enquanto abertas, fecham com <b>Esc</b> e devolvem o foco pro lugar. O app também respeita quem pediu <b>menos animação</b> no sistema.",
      ],
    },
    {
      versao: "2026-07-24",
      data: "24 jul 2026",
      titulo: "🧱 22 serviços novos (arquitetura, custos, segurança e IA) + 🗺️ Diagrama",
      itens: [
        "<b>🧱 22 serviços AWS novos</b> — o CLImb passou de 430 para <b>473 atividades</b>, cada uma com comando de verdade no terminal, <b>manual</b> (<code>aws … help</code>) e a parte didática (<b>Entenda o serviço</b> + <b>Por que este comando</b>):",
        "• <b>Núcleo de arquitetura</b> — Load Balancer (ELB), Elastic Beanstalk, EFS (disco compartilhado), ElastiCache (cache) e ACM (certificados HTTPS). O load balancer registra <b>instâncias EC2 de verdade</b> no target group.",
        "• <b>Custos e governança</b> — Budgets (alertas de gasto), Cost Explorer (para onde vai o dinheiro), Organizations (várias contas, uma fatura) e Trusted Advisor.",
        "• <b>Segurança</b> — GuardDuty (detecção de ameaças), Inspector (vulnerabilidades), Macie (dado sensível no S3), WAF (firewall de aplicação), Shield (anti-DDoS) e AWS Config (auditoria de configuração).",
        "• <b>IA e dados</b> — Rekognition (visão), Translate, Polly (voz), Comprehend (NLP), Bedrock (IA generativa), Kinesis (streaming) e Redshift (data warehouse).",
        "Novo botão <b>🗺️ Diagrama</b> no rodapé: ele <b>desenha os recursos da sua conta</b> como um diagrama de arquitetura, agrupados por categoria (rede, computação, dados, integração, identidade e operações) — com a <b>VPC</b> englobando as sub-redes, igual aos diagramas da AWS.",
        "As linhas mostram as <b>relações</b> que dá pra ler da sua conta: <i>fan-out</i> (SNS → SQS), <i>usa</i> (Lambda → role) e <i>protege</i> (Security Group → EC2). Combina com o 🤖 Arquiteto IA e o CloudFormation — você monta a infra e vê ela desenhada.",
        "Dá pra <b>baixar o diagrama</b> como imagem (SVG) pra pôr num documento ou apresentação.",
        "De quebra, aqui nas <b>Novidades</b>: as atualizações de dias anteriores agora vêm <b>recolhidas</b> — clique numa data pra expandir e ver o que mudou.",
      ],
    },
    {
      versao: "2026-07-23",
      data: "23 jul 2026",
      titulo: "🚀 Dia grande: 19 serviços novos, lições, laboratório de diagnóstico e perfil público",
      itens: [
        "<b>19 serviços AWS novos</b> na linha de comando — o CLImb saltou de 272 para <b>430 atividades</b> em <b>40 trilhas</b>, todos com comandos de verdade no terminal e espelhados no Console:",
        "• <b>Mensageria e web</b> — SQS (filas), SNS (notificações com <i>fan-out</i> real), EBS (discos), API Gateway, Route 53 (DNS) e CloudFront (CDN).",
        "• <b>Contêineres e automação</b> — ECR, ECS, Secrets Manager, Step Functions e EventBridge, respeitando os limites reais da AWS (o ECS recusa apagar serviço no ar, o EventBridge recusa apagar regra com alvo).",
        "• <b>Kubernetes e dados</b> — EKS, Glue e Athena (SQL direto no S3, lendo o catálogo do Glue) e KMS (que cifra e decifra de verdade).",
        "• <b>Operações</b> — CloudTrail (que grava tudo o que você roda no terminal), Systems Manager (Parameter Store), Cognito (login pronto) e Auto Scaling (que sobe máquinas de verdade).",
        "<b>📚 O CLImb agora explica antes de mandar fazer:</b> cada trilha abre com um bloco <b>Entenda o serviço</b> (o que é, pra que serve, casos reais, vocabulário e como cobra) e cada atividade ganhou um <b>💡 Por que este comando</b>. Cobrimos os 27 serviços e mais de 170 comandos.",
        "<b>🔧 Nova trilha Diagnóstico:</b> em vez de \"crie X\", você recebe um chamado — a infra já existe e está quebrada, com defeitos plantados, e você investiga e conserta. A rede funciona de verdade: consertou, o site volta na hora. E você comprova a falha nos <b>VPC Flow Logs</b> com <code>grep REJECT</code>.",
        "<b>🪪 Perfil, streak e link público:</b> cartão de progresso com bio e links, mapa de atividade de 20 semanas, <b>streak diário</b> (🔥) e um <b>link público</b> (<code>climb/u/seu-usuario</code>) pra colar no LinkedIn. Dá pra editar o e-mail da conta por ali.",
        "<b>🖥️ Console completo:</b> todas as seções da navegação lateral agora abrem telas fiéis ao AWS real, mostrando os dados da sua conta simulada (volumes, security groups, subnets, parameter groups…).",
        "<b>🎓 Simulados:</b> agora pedem conta (grátis) e são <b>1 por dia</b> no plano gratuito (ilimitado no Pro), com o contador zerando à meia-noite de Brasília.",
        "<b>🔧 Auditoria das atividades:</b> um pente-fino corrigiu 9 desafios que se completavam sozinhos e a ordem de uma trilha, com um teste automático pra manter a coerência daqui pra frente.",
      ],
    },
    {
      versao: "2026-06-28",
      data: "28 jun 2026",
      titulo: "🖥️ Console fiel à AWS, simulados de certificação e app no celular",
      itens: [
        "<b>🎓 Simulados de certificação:</b> nova aba com provas no estilo do <b>AWS Cloud Practitioner (CLF-C02)</b> — banco de <b>+300 questões</b>, 60 sorteadas por prova, <b>gabarito comentado</b> e análise dos erros por domínio.",
        "<b>🖥️ Console com cara de AWS de verdade:</b> agora em <b>dark mode</b>, com a navegação lateral, os dashboards e as telas (títulos, colunas, listas vazias) padronizados conforme o console real — de EC2 e S3 a IAM, Lambda, DynamoDB, VPC, RDS e CloudWatch. <b>SNS e SQS</b> também entraram no Console.",
        "<b>📱 App melhor no celular:</b> os botões do topo viraram um menu ☰, a tela rola normalmente (o rodapé não invade mais o meio) e as tabelas do Console rolam na horizontal.",
        "<b>🐧 +12 desafios de Linux:</b> <code>ls -l</code>, <code>mkdir -p</code>, <code>&gt;&gt;</code>, <code>head</code>, <code>grep</code>, <code>chmod</code>, preparar o <code>.ssh</code> e um projeto final — com o <code>mkdir -p</code> do lab criando os diretórios pais que faltam.",
      ],
    },
    {
      versao: "2026-06-21",
      data: "21 jun 2026",
      titulo: "🛜 VPC/RDS/CloudWatch, turmas, Arquiteto IA e ~300 atividades",
      itens: [
        "<b>🛜🛢️📈 Três serviços novos:</b> VPC (rede), RDS (banco relacional) e CloudWatch (alarmes + Logs) — nas trilhas do terminal <b>e</b> no Console visual, sempre espelhando um ao outro.",
        "<b>🔁 Muito mais prática:</b> chegamos a <b>quase 300 atividades</b>, com cada comando reaparecendo em vários cenários reais (pizzaria, backups, e-commerce…) e os reforços vindo logo depois de cada comando ser ensinado.",
        "<b>👥 Turmas e competições:</b> crie uma turma, compartilhe o código e a galera entra — cada turma tem <b>ranking próprio</b>, em competição assíncrona.",
        "<b>🤖 Arquiteto IA:</b> descreva em português o que você quer e ele monta um <b>template de CloudFormation</b> — dá pra criar o stack na hora.",
        "<b>📧 Confirmação de e-mail</b> (com o Google já vindo confirmado) e o <b>ranking mais seguro</b>, com checagens de sanidade no servidor.",
        "<b>🔬 Saídas mais fiéis à AWS:</b> <code>describe-instances</code> com o JSON completo, IAM com ids e paths, e ajustes finos (nome de tabela do DynamoDB, <code>s3 rm</code> idempotente).",
        "<b>🏅 Níveis recalibrados:</b> 10 títulos, do Estagiário de Cloud à Lenda do CLI.",
      ],
    },
    {
      versao: "2026-06-20",
      data: "20 jun 2026",
      titulo: "🖥️ Console visual (5 serviços) e CloudFormation",
      itens: [
        "<b>🖥️ Console de gerenciamento visual</b> no estilo AWS, cobrindo 5 serviços: <b>S3, EC2, IAM, Lambda e DynamoDB</b> — crie recursos no clique, sem decorar comando. Ele <b>espelha a linha de comando</b>: o que você faz aparece no <code>aws … describe</code>, e vice-versa.",
        "<b>🎯 Missões guiadas no Console:</b> 8 missões que você cumpre <b>fazendo</b> (criar bucket, subir instância, dar permissão…), com XP como os desafios do terminal.",
        "<b>📄 CloudFormation:</b> descreva os recursos num template (YAML/JSON) e o <code>create-stack</code> cria tudo — recursos de verdade, e o <code>delete-stack</code> apaga junto.",
        "<b>✉️ Login por usuário ou e-mail</b> e o primeiro lab de <b>SSH</b> mais fiel (a chave <code>.pem</code>, o <code>ec2-user</code> e o <code>chmod 400</code> obrigatório).",
        "<b>🎯 Saídas e erros mais fiéis à AWS</b> (EC2 e S3), com o aviso do CLImb (⚡) separado da saída do comando quando a AWS não mostra nada.",
      ],
    },
    {
      versao: "2026-06-17",
      data: "17 jun 2026",
      titulo: "⚡ CLImb chega com tudo",
      itens: [
        "Novo nome e cara nova: agora é <b>CLImb</b>.",
        "Trilha <b>🌎 Mundo real</b>: cenários que combinam vários serviços (IAM + DynamoDB + Lambda + S3 + EC2).",
        "Projeto final <b>🛒 Loja completa</b>, montado de ponta a ponta com 4 serviços.",
        "<b>Tutorial guiado</b> pra quem está começando (botão ❔ Como jogar).",
        "Entre com o <b>Google</b>, ative <b>verificação em duas etapas (2FA)</b> e recupere a senha por e-mail.",
        "O app agora atualiza sozinho — sem precisar de Ctrl+F5.",
      ],
    },
    {
      versao: "2026-06-16",
      data: "16 jun 2026",
      titulo: "🎯 Desafios diários e versão Pro",
      itens: [
        "<b>Desafio do dia</b> (com bônus de XP) e <b>Treino aleatório</b> infinito pra praticar.",
        "+30 <b>Missões relâmpago</b>.",
        "Versão gratuita + <b>CLImb Pro</b>, com planos flexíveis.",
      ],
    },
    {
      versao: "2026-06-15",
      data: "15 jun 2026",
      titulo: "🐧 Linux e desafios avançados",
      itens: [
        "Nova trilha <b>Linux essencial</b> — a AWS roda em Linux, então isso é base.",
        "+20 <b>desafios avançados</b> baseados em labs reais.",
        "Laboratório de <b>preparação do ambiente</b>: SSH, instalar e configurar a CLI do zero.",
      ],
    },
    {
      versao: "2026-06-13",
      data: "13 jun 2026",
      titulo: "🤝 Mais ajuda pra quem está começando",
      itens: [
        "<b>Autocomplete</b> no terminal (tecla Tab), <b>glossário</b> de termos, <b>conquistas</b> e mensagens de erro mais amigáveis.",
      ],
    },
    {
      versao: "2026-06-12",
      data: "12 jun 2026",
      titulo: "🚀 Lançamento",
      itens: [
        "Simulador de <b>AWS CLI</b> gamificado: XP, níveis, sequência de acertos e ranking da comunidade.",
        "<b>Conta na nuvem</b> pra salvar o progresso e jogar de qualquer lugar.",
      ],
    },
  ];

  // O que vem por aí — alinhado ao que combinamos (Console → CloudFormation,
  // mais serviços no Console e multiplayer assíncrono).
  const EM_BREVE = [
    {
      icone: "🎓",
      titulo: "Mais certificações nos simulados",
      desc: "Depois do Cloud Practitioner (já no ar), vêm os simulados de Solutions Architect Associate (SAA), SysOps e Developer — com certificado de conclusão.",
    },
    {
      icone: "🧩",
      titulo: "Mais laboratórios de diagnóstico",
      desc: "A trilha 🔧 Diagnóstico estreou com o caso da rede quebrada. Vêm mais plantões: permissão negada no IAM, bucket que não vira site, Lambda que não executa e conta com custo escondido. Tem um problema que te pegou no trabalho? Fale com o responsável pelo app — vira laboratório.",
    },
    {
      icone: "🏁",
      titulo: "Eventos com prazo",
      desc: "Competições cronometradas dentro das turmas (com início e fim), além do ranking contínuo.",
    },
    {
      icone: "👩‍🏫",
      titulo: "Modo professor",
      desc: "Relatório de progresso de cada aluno da turma — pra quem ensina turma de AWS.",
    },
  ];

  const VERSAO_ATUAL = NOVIDADES[0].versao;
  let modal = null;
  let abaAtiva = "novidades";

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function versaoVista() {
    try { return localStorage.getItem(CHAVE_VISTO) || ""; } catch (e) { return ""; }
  }
  function marcarVisto() {
    try { localStorage.setItem(CHAVE_VISTO, VERSAO_ATUAL); } catch (e) {}
    atualizarSelo();
  }
  function temNovidade() {
    return versaoVista() !== VERSAO_ATUAL;
  }
  function atualizarSelo() {
    const selo = document.querySelector("#seloNovidades");
    if (selo) selo.style.display = temNovidade() ? "inline-block" : "none";
  }

  function html() {
    // A entrada mais recente (idx 0) fica aberta; as anteriores colapsadas,
    // clicáveis pra expandir. <details> nativo — não precisa de JS.
    const itensNov = NOVIDADES.map((v, idx) => `
      <details class="cl-versao"${idx === 0 ? " open" : ""}>
        <summary class="cl-versao-cab">
          <h3>${esc(v.titulo)}</h3>
          <span class="cl-data">${esc(v.data)}${idx === 0 ? ' <em class="cl-atual">novo</em>' : ""}</span>
        </summary>
        <ul>${v.itens.map((it) => `<li>${it}</li>`).join("")}</ul>
      </details>`).join("");

    const itensBreve = EM_BREVE.map((e) => `
      <div class="cl-breve-item">
        <div class="cl-breve-ic">${e.icone}</div>
        <div>
          <strong>${esc(e.titulo)}</strong>
          <p>${esc(e.desc)}</p>
        </div>
      </div>`).join("");

    return `
      <div class="modal-caixa cl-caixa">
        <h2>✨ Novidades do CLImb</h2>
        <div class="cl-abas">
          <button class="cl-aba ${abaAtiva === "novidades" ? "ativa" : ""}" data-aba="novidades">📜 O que mudou</button>
          <button class="cl-aba ${abaAtiva === "breve" ? "ativa" : ""}" data-aba="breve">🔭 Em breve</button>
        </div>
        <div class="cl-conteudo" ${abaAtiva === "novidades" ? "" : 'style="display:none"'} data-painel="novidades">
          ${itensNov}
        </div>
        <div class="cl-conteudo" ${abaAtiva === "breve" ? "" : 'style="display:none"'} data-painel="breve">
          <p class="cl-breve-intro">Está em construção e chega por aqui. Sugestões? Manda pra gente! 🙌</p>
          ${itensBreve}
        </div>
        <div class="modal-acoes">
          <button class="botao secundario" data-fechar-cl>Fechar</button>
        </div>
      </div>`;
  }

  function montar() {
    modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "modalChangelog";
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.closest("[data-fechar-cl]")) { fechar(); return; }
      const aba = e.target.closest("[data-aba]");
      if (aba) { abaAtiva = aba.dataset.aba; modal.innerHTML = html(); }
    });
  }

  function abrir(aba) {
    if (!modal) montar();
    abaAtiva = aba === "breve" ? "breve" : "novidades";
    modal.innerHTML = html();
    modal.classList.add("aberto");
    marcarVisto();
  }
  function fechar() {
    if (modal) modal.classList.remove("aberto");
  }

  document.addEventListener("DOMContentLoaded", () => {
    montar();
    // Botão no rodapé, ao lado do "Como jogar"
    const footer = document.querySelector("footer");
    if (footer && !document.querySelector("#btnNovidades")) {
      const b = document.createElement("button");
      b.id = "btnNovidades";
      b.className = "botao secundario";
      b.innerHTML = `✨ Novidades <span id="seloNovidades" class="cl-selo">novo</span>`;
      const comoJogar = document.querySelector("#btnComoJogar");
      if (comoJogar) footer.insertBefore(b, comoJogar.nextSibling);
      else footer.insertBefore(b, footer.firstChild);
      b.addEventListener("click", () => abrir("novidades"));
    }
    atualizarSelo();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && modal.classList.contains("aberto")) fechar();
    });
  });

  window.abrirChangelog = abrir;
})();
