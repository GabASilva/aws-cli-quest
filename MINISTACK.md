# 🧪 MiniStack — bancada de fidelidade do CLImb

Este guia é pra **você** (dono do projeto), não pro aluno. O MiniStack é um
emulador da AWS que roda na sua máquina via Docker. A gente **não** usa ele
dentro do CLImb — o app continua 100% no navegador. Usamos o MiniStack só como
**bancada**: rodar um comando de verdade nele e comparar a saída com a do
simulador do CLImb, pra deixar o conteúdo o mais fiel possível à AWS real.

> MiniStack é open-source (MIT), grátis, sem cadastro. Site: https://ministack.org
> · Repo: https://github.com/ministackorg/ministack

---

## 1. Pré-requisitos

Você vai precisar de **dois** programas instalados no Windows:

1. **Docker Desktop** (pra rodar o MiniStack).
2. **AWS CLI v2** (pra mandar os comandos — é o mesmo `aws ...` que o aluno digita).

### Instalar o Docker Desktop

1. Baixe em https://www.docker.com/products/docker-desktop/ (versão Windows).
2. Rode o instalador. Ele vai pedir pra ativar o **WSL2** — aceite (se pedir pra
   reiniciar, reinicie).
3. Abra o **Docker Desktop** e espere o ícone da baleia ficar verde ("Engine
   running"). O Docker precisa estar **aberto** sempre que você for usar o MiniStack.

Confirme no PowerShell:

```powershell
docker --version
```

### Instalar o AWS CLI v2

```powershell
winget install -e --id Amazon.AWSCLI
```

(ou baixe o instalador MSI em
https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)

Feche e reabra o PowerShell e confirme:

```powershell
aws --version
```

---

## 2. Subir o MiniStack

Com o Docker Desktop aberto, rode:

```powershell
docker run --rm -p 4566:4566 ministackorg/ministack
```

- Na primeira vez ele baixa a imagem (~150 MB) — depois sobe em ~2 segundos.
- Ele fica **ocupando esse terminal** (mostrando os logs). Deixe aberto e use
  **outro** terminal pros comandos `aws`.
- O `--rm` faz ele se limpar quando você fechar (Ctrl+C). Cada vez que sobe, começa
  do zero — ótimo pra teste limpo.

Tudo responde em `http://localhost:4566`.

---

## 3. Apontar o AWS CLI pro MiniStack

O MiniStack aceita **qualquer** credencial (é local). Configure uma vez, com
valores fajutos:

```powershell
aws configure set aws_access_key_id test
aws configure set aws_secret_access_key test
aws configure set region us-east-1
```

A partir daí, todo comando precisa do `--endpoint-url http://localhost:4566` pra
ir pro MiniStack em vez da AWS de verdade. Pra não digitar isso toda hora, crie um
atalho no seu perfil do PowerShell:

```powershell
notepad $PROFILE
```

Cole esta função no arquivo, salve e reabra o PowerShell:

```powershell
function aws-ms { aws --endpoint-url http://localhost:4566 @args }
```

Agora é só usar `aws-ms ...` no lugar de `aws ...`. Teste:

```powershell
aws-ms s3 mb s3://meu-bucket
aws-ms s3 ls
```

---

## 4. Como usar de bancada (o que interessa)

A ideia é simples: **pegue um comando que existe num desafio do CLImb, rode no
MiniStack e compare a saída** com a que o simulador mostra. Onde divergir, a gente
ajusta o simulador (`js/simulador.js`).

Comandos bons pra conferir (são os que os desafios usam):

```powershell
# S3
aws-ms s3 mb s3://meu-site
aws-ms s3 ls
aws-ms s3 ls s3://meu-site
aws-ms s3 rb s3://meu-site

# EC2 (compare o JSON com o do Console/CLI do CLImb)
aws-ms ec2 run-instances --image-id ami-0abcd1234ef567890 --instance-type t2.micro
aws-ms ec2 describe-instances
aws-ms ec2 create-key-pair --key-name minha-chave

# IAM
aws-ms iam create-user --user-name ana
aws-ms iam list-users
```

Dica: pra ver a saída crua, é o mesmo `aws`, então `--output json` (padrão) e
`--query` funcionam igual.

### O que anotar quando achar diferença

- Texto exato de **mensagens de erro** (ex.: `An error occurred (...) when calling
  the X operation: ...`).
- **Campos do JSON** que faltam ou têm nome/valor diferente.
- O que a AWS imprime quando **dá certo mas não retorna nada** (a gente trata isso
  no CLImb com o aviso "⚡ CLImb").

Me manda o print/colagem da diferença que eu ajusto o simulador.

> ⚠️ Lembrete: o MiniStack é ~95% fiel à AWS — ele também tem quirks próprios. Pra
> formato de saída ele é uma ótima referência; em caso de dúvida forte, a palavra
> final é a AWS real (ou a doc oficial do `aws cli`).

---

## 5. Parar e limpar

- Pra parar: volte no terminal onde ele está rodando e aperte **Ctrl+C**.
- Como subimos com `--rm`, não fica resíduo. Pra apagar a imagem baixada (libera
  os ~150 MB):

```powershell
docker rmi ministackorg/ministack
```

Pronto. Sempre que quiser testar fidelidade de novo, é só repetir o passo 2.
