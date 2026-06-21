# 🛠️ Painel de Admin do CLImb (local)

Um painel que roda **só no seu computador** pra você moderar o sistema, criar
códigos/eventos, resetar senhas, mudar XP, ver alertas e relatórios de uso/custo.

A UI nunca vai pra web. Ele fala com o servidor por **HTTPS** (cifrado), usando
um **token de admin** que fica só aqui na sua máquina (nunca no navegador).

## 1. Ligar a API de admin no servidor (uma vez)

Escolha um segredo forte (>= 16 caracteres) e configure no Fly:

```
flyctl secrets set ADMIN_TOKEN="cole-aqui-um-segredo-bem-grande" -a aws-cli-quest
```

Sem `ADMIN_TOKEN`, a API de admin fica **desligada** (responde 503). Ou seja:
ninguém acessa admin até você ligar, e só com o token certo.

## 2. Rodar o painel (no seu PC)

Use o **mesmo** token. Duas formas:

```
# por variável de ambiente:
ADMIN_TOKEN="o-mesmo-segredo" node painel/painel.js

# ou crie painel/config.json (NÃO vai pro git):
#   { "ADMIN_TOKEN": "o-mesmo-segredo", "URL_BASE": "https://aws-cli-quest.fly.dev" }
node painel/painel.js
```

Abra **http://localhost:7077**.

## O que dá pra fazer

- **📊 Resumo**: nº de usuários, ativos (24h/7d/30d), contas Pro, turmas, alertas,
  uptime, requisições/dia e **estimativa de custo do mês**. Botão pra **baixar
  backup** do banco (JSON).
- **👤 Usuários**: buscar, mudar **XP**, conceder **licença**, **resetar senha**
  (gera link / manda e-mail), marcar **e-mail como verificado**, **banir/desbanir**
  e **apagar** conta.
- **🎟️ Códigos**: gerar e listar códigos de ativação (Pro/escola/vitalício).
- **📅 Eventos**: criar avisos/competições que aparecem pra galera no app.
- **🚨 Alertas**: os alertas antifraude (XP suspeito, cadastro em massa).
- **🛡️ Auditoria**: log de tudo que você fez pelo painel.

## Segurança

- Token comparado em tempo constante, rate-limit por IP, e **toda ação fica no
  log de auditoria**.
- Banir derruba as sessões ativas da conta na hora.
- O `painel/config.json` está no `.gitignore` — o segredo não vaza pro repositório.
- Trate o `ADMIN_TOKEN` como a senha-mestra do sistema. Se vazar, gere outro
  (`flyctl secrets set ADMIN_TOKEN=...` de novo).
