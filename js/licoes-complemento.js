"use strict";
// ============================================================
// CLImb — licoes-complemento.js
// Preenche as lacunas didáticas que a auditoria de 2026-07-29 apontou:
//
//  1) 35 comandos de atividade estavam sem "💡 Por que este comando" — e não
//     eram periféricos: quase toda a família de POLÍTICAS do IAM, os discos
//     (EBS) e o versionamento/política de bucket do S3. Justamente os
//     conceitos mais difíceis pra quem está começando.
//
//  2) As duas trilhas GRÁTIS e INICIAIS não tinham aula nenhuma: "Primeiros
//     passos" (o que é a AWS CLI) e "Linux essencial" (por que quem trabalha
//     com nuvem precisa do terminal). São a primeira coisa que um iniciante vê.
//
// Carrega DEPOIS de licoes.js (LICOES/PORQUE já existem) — só complementa.
// ============================================================
(function () {
  if (typeof LICOES === "undefined" || typeof PORQUE === "undefined") return;

  // ============================================================
  // 1) Aulas das trilhas grátis de entrada
  // ============================================================
  Object.assign(LICOES, {
    setup: {
      emoji: "🚀", titulo: "AWS CLI",
      oque: "A <b>AWS CLI</b> é um programa que você instala no computador pra <b>conversar com a AWS digitando</b>, em vez de clicar no site. Tudo que dá pra fazer no console (criar servidor, subir arquivo, criar usuário) dá pra fazer por um comando — e o comando é sempre <b>aws <serviço> <ação></b>.",
      serve: "Fazer o que o mouse faz, mas <b>rápido, repetível e automatizável</b>. Clicar em 40 telas pra criar 40 usuários é inviável; um comando num laço resolve. É também assim que a nuvem é operada de verdade no trabalho: por script, não por clique.",
      casos: [
        "Um time sobe a mesma infraestrutura em 3 ambientes rodando o mesmo script, sem chance de esquecer um passo.",
        "Alguém precisa do endereço de 50 servidores: um comando devolve a lista pronta, em vez de abrir 50 páginas.",
        "Um backup roda toda madrugada sozinho porque é um comando dentro de um agendamento — ninguém precisa acordar.",
      ],
      vocab: [
        ["CLI", "\"Command Line Interface\" — interface de linha de comando. Você digita, ela responde."],
        ["Access Key / Secret Key", "o \"usuário e senha\" que o programa usa pra provar quem você é. A secret aparece UMA vez só."],
        ["Região", "onde seus recursos ficam fisicamente (us-east-1, sa-east-1…). O CLI precisa saber a região padrão."],
        ["Perfil (profile)", "um conjunto de credenciais com nome. Dá pra ter um pra trabalho e outro pra estudo na mesma máquina."],
        ["Formato de saída", "como a resposta vem: json (padrão), table ou text."],
      ],
      cobra: "A CLI é <b>gratuita</b> — é só um programa. Você paga pelos recursos que ela cria (uma instância, um bucket). Rodar um <b>describe</b> pra ver o que existe não custa nada.",
    },

    linux: {
      emoji: "🐧", titulo: "Linux e o terminal",
      oque: "A <b>maioria dos servidores da nuvem roda Linux</b>, e a forma de operá-los é pelo <b>terminal</b> — aquela tela preta onde você digita. Não tem mouse dentro de um servidor: você entra por SSH e resolve tudo com comandos.",
      serve: "Ser capaz de entrar numa máquina e trabalhar: navegar entre pastas, ler um log pra descobrir por que a aplicação caiu, instalar um programa, ajustar permissão de arquivo. Sem isso, você cria o servidor pela AWS CLI mas não consegue usá-lo.",
      casos: [
        "O site saiu do ar: você entra no servidor por SSH e procura a causa no log com <b>grep</b>.",
        "A chave <b>.pem</b> baixada da AWS não conecta — o SSH recusa porque ela está com permissão aberta demais; um <b>chmod 400</b> resolve.",
        "Você precisa instalar a AWS CLI numa instância nova: baixar, descompactar e rodar o instalador, tudo por comando.",
      ],
      vocab: [
        ["Terminal / shell", "o programa que lê o que você digita e executa. O mais comum no Linux é o bash."],
        ["Diretório", "o mesmo que \"pasta\". Você está sempre dentro de um (o <b>pwd</b> diz qual)."],
        ["Caminho", "o endereço de um arquivo. <b>logs/app.log</b> é relativo a onde você está; <b>/home/ec2-user</b> é absoluto."],
        ["Permissões", "quem pode ler, escrever e executar cada arquivo. Aparecem como <b>rwx</b> e se ajustam com <b>chmod</b>."],
        ["SSH", "o jeito seguro de abrir um terminal dentro de uma máquina remota, usando uma chave em vez de senha."],
      ],
    },
  });

  // ============================================================
  // 2) "Por que este comando" que faltava
  // ============================================================
  Object.assign(PORQUE, {
    // ---------- IAM: grupos e usuários ----------
    "iam.add-user-to-group": "coloca a pessoa no grupo — e ela herda na hora todas as permissões dele. É assim que se dá acesso a vários de uma vez, sem repetir política por usuário.",
    "iam.remove-user-from-group": "tira a pessoa do grupo e, com isso, as permissões que vinham dele. É o primeiro passo quando alguém troca de time.",
    "iam.list-groups": "mostra os grupos que existem na conta — o mapa de \"quais perfis de acesso eu tenho montados\".",
    "iam.list-roles": "lista as roles (identidades que SERVIÇOS assumem, não pessoas). Útil pra achar a role que uma Lambda ou uma instância está usando.",
    "iam.delete-user": "apaga a identidade da pessoa. A AWS exige que ela esteja \"limpa\" antes: sem políticas anexadas e fora dos grupos.",
    "iam.delete-group": "apaga o grupo. Só sai vazio — remova os usuários antes, senão a AWS recusa.",
    "iam.delete-role": "apaga a role. Se algum serviço ainda estiver usando, ele para de conseguir o que fazia — confira antes.",

    // ---------- IAM: políticas (a família mais difícil) ----------
    "iam.list-policies": "lista as políticas disponíveis. O <b>--scope</b> é o que importa: <b>AWS</b> são as prontas da Amazon, <b>Local</b> são as que você escreveu. Sem ele vêm centenas.",
    "iam.create-policy": "cria uma permissão SUA, escrita num JSON. É o que se usa quando nenhuma política pronta da AWS serve — e o caminho pro \"mínimo privilégio\": liberar só o necessário.",
    "iam.get-policy": "mostra os dados da política (ARN, qual versão está valendo, quantas existem). É o \"crachá\" dela, não o conteúdo.",
    "iam.get-policy-version": "aqui sim vem o CONTEÚDO — o JSON com as permissões. Você precisa dizer QUAL versão, e é assim que se audita o que uma política realmente libera.",
    "iam.create-policy-version": "políticas têm histórico: em vez de sobrescrever, você cria uma versão nova. Com <b>--set-as-default</b> ela passa a valer, e as antigas ficam guardadas pra você poder voltar atrás.",
    "iam.detach-user-policy": "desanexa a permissão do usuário. Ele continua existindo, só perde o que aquela política dava — é o jeito certo de revogar acesso sem apagar a pessoa.",
    "iam.delete-policy": "apaga a política de vez. Só depois de desanexar de todo mundo — a AWS não deixa apagar algo em uso.",

    // ---------- S3 (baixo nível) ----------
    "s3api.put-bucket-versioning": "liga o histórico do bucket: cada vez que um objeto é sobrescrito ou apagado, a versão anterior fica guardada. É a proteção contra o \"apaguei sem querer\" — e não dá pra desligar depois, só suspender.",
    "s3api.put-bucket-policy": "define quem pode fazer o quê NO BUCKET, num JSON. Diferente do IAM (que fala de quem acessa), a política de bucket fala do recurso — é o que libera um site estático pro público.",
    "s3api.list-buckets": "a versão de baixo nível do <b>aws s3 ls</b>: devolve os buckets em JSON, com data de criação. Boa quando você quer filtrar a saída com <b>--query</b>.",

    // ---------- EC2: discos (EBS) ----------
    "ec2.describe-volumes": "lista os discos (volumes) da conta e a qual instância cada um está preso. É onde se descobre disco órfão pagando sem ninguém usar.",
    "ec2.create-volume": "cria um disco vazio. Ele nasce SOLTO e numa zona específica — só pode ser encaixado numa instância da mesma zona.",
    "ec2.attach-volume": "encaixa o disco na máquina, num ponto (<b>/dev/sdf</b>). Depois disso ainda falta formatar e montar por dentro do sistema — a AWS entrega o \"cabo\", não a pasta pronta.",
    "ec2.detach-volume": "desencaixa o disco sem apagar nada. Serve pra mover um volume de uma instância pra outra.",
    "ec2.delete-volume": "apaga o disco e o que tem dentro. Precisa estar desencaixado — e é o comando que efetivamente para a cobrança dele.",
    "ec2.create-snapshot": "tira uma foto do disco e guarda no S3. É o backup do EBS: incremental (só o que mudou) e a base pra criar um disco novo igual.",
    "ec2.describe-snapshots": "lista seus backups de disco. O <b>--owner-ids self</b> é quase obrigatório: sem ele vêm milhares de snapshots públicos da AWS.",

    // ---------- EC2: rede e chaves ----------
    "ec2.describe-key-pairs": "mostra as chaves de acesso SSH cadastradas. Você vê o nome e a impressão digital — a chave privada em si só existe no seu computador.",
    "ec2.describe-security-groups": "mostra os firewalls e as portas que cada um libera. É a PRIMEIRA coisa a olhar quando algo \"não conecta\".",
    "ec2.describe-subnets": "lista as sub-redes e em qual zona cada uma está. É aqui que se confere se uma sub-rede é pública (tem rota pra internet) ou privada.",
    "ec2.describe-vpcs": "mostra as redes virtuais da conta e suas faixas de IP. Toda conta já vem com uma VPC padrão — por isso costuma aparecer mais de uma.",
    "ec2.delete-vpc": "apaga a rede. Só sai vazia: sub-redes, gateways e instâncias precisam ir antes.",

    // ---------- outros ----------
    "sts.get-caller-identity": "responde \"quem eu sou agora?\" — conta, usuário e ARN da identidade que está rodando o comando. É o primeiro comando pra conferir se o CLI está apontando pra conta certa.",
    "lambda.get-function": "mostra a configuração completa da função (memória, timeout, runtime, role) e um link pro código. É como você audita o que está no ar.",
    "dynamodb.describe-table": "mostra o desenho da tabela: chave, índices, modo de cobrança e status. Serve pra confirmar que ela ficou do jeito que você pediu.",
    "dynamodb.delete-table": "apaga a tabela e todos os itens de uma vez. Não tem lixeira — no DynamoDB isso é imediato.",
    "eks.delete-nodegroup": "remove as máquinas onde os contêineres rodavam. O cluster continua existindo, mas sem nó nenhum ele não executa nada.",
    "kms.enable-key": "reativa uma chave que estava desabilitada. Enquanto desabilitada, nada que foi cifrado com ela pode ser lido — reativar devolve o acesso.",
  });
})();
