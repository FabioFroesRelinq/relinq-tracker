# Relinq Tracker

Sistema próprio de rastreamento de funil (visita → clique → conversão) para as LPs da Relinq, com painel simples para o time de marketing.

## Como rodar localmente

1. Instalar dependências:
   ```
   npm install
   ```

2. Criar o banco de dados:
   ```
   mysql -u root -p < db/schema.sql
   ```

3. Copiar `.env.example` para `.env.local` e preencher com os dados do seu MySQL:
   ```
   cp .env.example .env.local
   ```

4. Rodar o projeto:
   ```
   npm run dev
   ```

5. Acessar `http://localhost:3000` — painel principal
   Acessar `http://localhost:3000/sites` — cadastro de LPs

## Como adicionar uma nova LP

1. Vá em **"+ Cadastrar LP"** no painel e cadastre o nome (e domínio, opcional). Isso gera um `slug` único (ex: `relinq-beauty`).

2. Cole o snippet no `<head>` (ou antes do `</body>`) da LP, usando o slug gerado:
   ```html
   <script src="https://SEU-DOMINIO/tracker.js" data-site="relinq-beauty"></script>
   ```
   O evento de `visita` é disparado automaticamente ao carregar a página, já capturando os parâmetros UTM da URL (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`).

3. Marque os eventos importantes da LP manualmente, chamando `relinqTrack(nome_do_evento)`:
   ```html
   <a href="https://wa.me/5511999999999" onclick="relinqTrack('clique_whatsapp')">
     Falar no WhatsApp
   </a>
   ```
   Para marcar uma conversão (ex: envio de formulário):
   ```html
   <script>
     document.getElementById('form-cadastro').addEventListener('submit', function () {
       relinqTrack('conversao');
     });
   </script>
   ```

4. A LP aparece automaticamente no painel assim que o primeiro evento chegar.

**Se você já tinha o banco criado antes dessa atualização**, rode a migração pra adicionar as colunas novas:
```
mysql -u root -p relinq_tracker_db < db/migration-2.sql
```
(no Windows/PowerShell: `Get-Content db/migration-2.sql | mysql -u root -p relinq_tracker_db`)

## Tipos de clique — cada CTA separado

Qualquer evento cujo nome comece com `clique_` vira um tipo de clique separado no painel, contado à parte. Use nomes diferentes pra cada tipo de botão da LP:

```html
<a href="https://wa.me/..." onclick="relinqTrack('clique_whatsapp')">Falar no WhatsApp</a>
<button onclick="relinqTrack('clique_cta')">Quero começar agora</button>
<button onclick="relinqTrack('clique_checkout')">Finalizar compra</button>
```

No painel, a seção "Cliques por tipo" mostra o total de cada um separadamente. Use `relinqTrack('conversao')` só pra marcar a conversão de verdade (ex: pagamento confirmado, cadastro concluído) — isso continua contando à parte, nos cards de topo.

## Métricas de engajamento (automáticas, sem precisar mexer na LP)

Assim que o snippet é instalado, o tracker já captura sozinho:

- **Visitantes únicos** — um ID anônimo é salvo no navegador (`localStorage`), então recarregar a página não conta como visitante novo
- **Dispositivo** — classifica cada visita como celular, tablet ou computador
- **Profundidade de rolagem** — marcos de 25%, 50%, 75% e 100% da página rolada
- **Tempo na página** — quantos segundos a pessoa ficou antes de sair ou trocar de aba
- **Taxa de rejeição** — % de visitantes que só viram a página e não clicaram em nada

Nenhuma dessas precisa de código adicional na LP — já vem junto do snippet padrão.

## Rastreando a VSL (vídeo hospedado na LP)

Se a LP tem um vídeo (`<video>`) hospedado direto nela, basta conectar o tracker a esse elemento:

```html
<video id="vsl" src="video-vendas.mp4" controls></video>

<script src="https://SEU-DOMINIO/tracker.js" data-site="relinq-beauty"></script>
<script>
  relinqTrackVideo(document.getElementById('vsl'), 'vsl-principal');
</script>
```

A partir daí, o tracker passa a capturar sozinho:
- **`video_play`** — quando o vídeo começa a tocar (primeira vez)
- **`video_progress`** — a cada marco de 10% assistido (10%, 20%, ... 100%) — isso monta a **curva de retenção**, mostrando exatamente em que ponto a audiência abandona o vídeo
- **`video_pause`** — quando o usuário pausa, com os segundos assistidos até ali
- **`video_complete`** — quando o vídeo termina, com a duração total

No painel, cada vídeo cadastrado aparece com: total de plays, taxa de conclusão, duração média assistida e a tabela de retenção por marco. Se a LP tiver mais de um vídeo, é só chamar `relinqTrackVideo` de novo pra cada um, passando um `video_id` diferente.

## Estrutura do projeto

```
relinq-tracker/
  db/schema.sql        -> schema do MySQL (tabelas sites e events)
  lib/db.js             -> conexão com o MySQL
  pages/api/track.js    -> recebe os eventos do tracker.js
  pages/api/sites.js    -> cadastra/lista as LPs
  pages/api/stats.js    -> calcula as métricas do painel
  pages/index.js         -> painel principal (visitas, cliques, conversões, UTMs)
  pages/sites.js          -> tela de cadastro de LPs
  public/tracker.js       -> snippet a ser instalado nas LPs
```

## Segurança e uso de dados

Conforme a política de uso da conta Claude da Relinq, nenhum dado real de cliente, credencial ou informação sensível deve ser usado nos testes/exemplos deste projeto — usar sempre dados fictícios.
