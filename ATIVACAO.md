# Guia de ativação — abrir pro mercado

Tudo já está **implementado e no ar**. Falta só plugar as contas dos provedores
(cada um é uma variável de ambiente / "secret" no Fly). Sem elas, o app funciona
normalmente — só os recursos abaixo ficam inativos com um aviso amigável.

> Pra aplicar qualquer `secret`, rode o comando e o Fly reinicia o app sozinho.
> Conferir o que já está setado: `flyctl secrets list -a aws-cli-quest`

---

## 1. Pagamento — Mercado Pago (Checkout Pro)

1. Painel do Mercado Pago → **Suas integrações** → sua aplicação (produto **Checkout Pro**).
2. **Credenciais de produção** → copie o **Access Token** (`APP_USR-...`).
3. Setar no Fly:
   ```
   flyctl secrets set MP_TOKEN="APP_USR-xxxxx" -a aws-cli-quest
   ```
4. No painel do MP → **Webhooks/Notificações** → URL:
   `https://aws-cli-quest.fly.dev/api/mp/webhook` (evento: **Pagamentos**).
5. Teste: assinar um plano → pagar (Pix/cartão) → a licença ativa sozinha.

Enquanto `MP_TOKEN` não existir: o painel mostra os preços mas cai no
**resgate por código** (você gera códigos no admin).

---

## 2. E-mail — Resend (recuperação de senha E confirmação de e-mail)

> O mesmo `RESEND_KEY` cobre os dois: o link de "esqueci a senha" E o link de
> **confirmação de e-mail** (enviado ao cadastrar com e-mail / ao trocar o e-mail).

1. Crie conta em **resend.com** (grátis: 3.000 e-mails/mês).
2. Pra testar rápido, dá pra enviar com o remetente `onboarding@resend.dev` —
   **MAS** ele só entrega pro e-mail da SUA conta Resend. Pra confirmar o e-mail
   de qualquer aluno (e pra competições), **verifique um domínio seu** no painel
   da Resend (uns registros DNS) e use-o no `RESEND_FROM`. Esse é o passo que
   falta pra confirmação de e-mail funcionar pra todo mundo.
3. Pegue a **API Key** (`re_...`) e setar:
   ```
   flyctl secrets set RESEND_KEY="re_xxxxx" -a aws-cli-quest
   flyctl secrets set RESEND_FROM="AWS CLI Quest <nao-responda@seudominio.com>" -a aws-cli-quest
   ```
   (Se não setar `RESEND_FROM`, usa `onboarding@resend.dev`.)

Enquanto `RESEND_KEY` não existir: o link de redefinição é **escrito no log do
servidor** (modo dev) — útil pra teste, mas o usuário final não recebe e-mail.

---

## 3. Login com Google (one-click)

1. **Google Cloud Console** → crie um projeto → **APIs e serviços → Credenciais**.
2. **Criar credenciais → ID do cliente OAuth** → tipo **Aplicativo da Web**.
3. Em **Origens JavaScript autorizadas**, adicione:
   `https://aws-cli-quest.fly.dev`
4. Copie o **Client ID** (`...apps.googleusercontent.com` — não é secreto) e setar:
   ```
   flyctl secrets set GOOGLE_CLIENT_ID="xxxxx.apps.googleusercontent.com" -a aws-cli-quest
   ```

Enquanto `GOOGLE_CLIENT_ID` não existir: o botão "Continuar com o Google"
simplesmente **não aparece**.

---

## 4. (Opcional) Base URL

Só precisa se mudar o domínio. Padrão já é a URL do Fly.
```
flyctl secrets set URL_BASE="https://aws-cli-quest.fly.dev" -a aws-cli-quest
```

---

## Administração (rodar no servidor)

> Acorde a máquina abrindo o site uma vez, depois:

```
flyctl ssh console -a aws-cli-quest -C "node /app/scripts/admin.js listar"
flyctl ssh console -a aws-cli-quest -C "node /app/scripts/admin.js licenca <usuario> vitalicio"   # liberar colega
flyctl ssh console -a aws-cli-quest -C "node /app/scripts/admin.js codigo anual 10"               # gerar 10 códigos anuais
flyctl ssh console -a aws-cli-quest -C "node /app/scripts/admin.js codigo escola 30 365 escola"   # 30 códigos escola (1 ano)
flyctl ssh console -a aws-cli-quest -C "node /app/scripts/admin.js codigos"                        # listar códigos
flyctl ssh console -a aws-cli-quest -C "node /app/scripts/admin.js alertas"                         # ver alertas antifraude
flyctl ssh console -a aws-cli-quest -C "node /app/scripts/admin.js resetxp <usuario>"              # zerar XP de trapaceiro
```

## Antifraude / alertas (ranking e competições)

O servidor monitora anomalias e registra um **alerta** (visível em
`admin.js alertas`). Se você setar `ALERTA_EMAIL`, ele também te avisa por e-mail
(usa o Resend; precisa do `RESEND_KEY`).

```
flyctl secrets set ALERTA_EMAIL="voce@exemplo.com" -a aws-cli-quest
```

Gatilhos (todos ajustáveis por env; valores padrão):

- `ALERTA_XP_DIA` (5000) — XP ganho por um usuário num dia acima disso → alerta.
- `ALERTA_XP_SALTO` (3000) — pulo de XP num único save → alerta.
- `ALERTA_CADASTRO_IP_DIA` (10) — contas criadas do mesmo IP num dia → alerta
  (pode ser uma turma estudando junto atrás do mesmo Wi-Fi — você confere).

> ⚠️ Honestidade técnica: como o XP é calculado no navegador (e o treino é
> infinito), não dá pra *provar* honestidade no servidor — esses alertas servem
> pra **você revisar** manualmente. Pra competição "pra valer", o caminho é
> exigir e-mail verificado / conta Pro pra entrar, ou apurar os campeões pelos
> alertas antes de premiar.

Criação de contas em massa já tem **limite de 5 contas por IP por hora** no
cadastro; o alerta acima cobre o acúmulo ao longo do dia.

Planos e preços: Mensal R$ 19,90 · Semestral R$ 89,90 · Anual R$ 149,90 ·
Personalizado (1–24 meses, desconto progressivo) · Escola R$ 49,90/aluno/ano ·
Vitalício só por concessão sua.
