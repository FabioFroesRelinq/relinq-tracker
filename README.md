# Relinq Tracker

Sistema próprio de rastreamento de funil (visita → clique → conversão) para
as LPs e funis da Relinq, com painel em tempo real para o time de
marketing. Um único snippet (`tracker.js`) detecta sozinho a maior parte
dos eventos importantes — sem precisar marcar nada manualmente no HTML de
cada página.

**Produção:** painel hospedado na Vercel, banco MySQL na Hostinger (via
MySQL remoto). Deploy automático: todo `git push` na branch `main` gera
uma nova publicação.

---

## Como rodar localmente

1. Instalar dependências:
   ```
   npm install
   ```

2. Criar o banco de dados (rode os três arquivos, na ordem, se for um
   banco novo — se já tiver rodado os anteriores antes, só falta o mais
   recente):
   ```
   mysql -u root -p < db/schema.sql
   mysql -u root -p relinq_tracker_db < db/migration-2.sql
   mysql -u root -p relinq_tracker_db < db/migration-3.sql
   ```
   Na Hostinger (via phpMyAdmin), é o mesmo conteúdo, só sem os comandos
   `CREATE DATABASE`/`USE` — cole direto com o banco certo já selecionado.

3. Copiar `.env.example` para `.env.local` e preencher:
   ```
   cp .env.example .env.local
   ```
   Além dos dados do MySQL (`DB_HOST`, `DB_PORT`, `DB_USER`,
   `DB_PASSWORD`, `DB_NAME`), preencha também o login do painel:
   - `PAINEL_USER` / `PAINEL_PASSWORD` — credencial compartilhada do time
   - `SESSION_SECRET` — uma string aleatória grande, gerada com
     `openssl rand -hex 32`

4. Rodar o projeto:
   ```
   npm run dev
   ```

5. Acessar `http://localhost:3000` — pede login, depois abre o painel
   principal. `/sites` cadastra LPs novas. `/visao-geral` compara todas
   as LPs lado a lado.

---

## Como adicionar uma LP nova

1. No painel, vá em **"+ Cadastrar LP"** e registre o nome (e domínio,
   opcional). Isso gera um `slug` único (ex: `relinq-beauty`).

2. Cole essa única linha antes do `</body>` da LP:
   ```html
   <script src="https://SEU-DOMINIO/tracker.js" data-site="relinq-beauty"></script>
   ```

**Só isso.** Nenhum outro código é necessário — o script sozinho já
captura visita, UTMs, cliques, vídeo e mais (ver seções abaixo). A LP
aparece no painel assim que o primeiro evento chegar.

---

## O que é automático (zero código extra na LP)

Assim que o snippet acima está instalado, o tracker já captura sozinho:

- **Visita** — com os parâmetros UTM da URL (`utm_source`, `utm_medium`,
  `utm_campaign`, `utm_content`, `utm_term`)
- **Visitante único** — um ID anônimo salvo no navegador (`localStorage`),
  então recarregar a página não conta como visitante novo
- **Dispositivo** — celular, tablet ou computador
- **Profundidade de rolagem** — marcos de 25%, 50%, 75% e 100%
- **Tempo na página** — segundos até a pessoa sair ou trocar de aba
- **Taxa de rejeição** — % de visitantes que só viram a página e não
  clicaram em nada nem converteram

### Cliques em CTAs — detectados sozinhos

Qualquer `<a>` ou `<button>` que aponte pra um destino conhecido (WhatsApp,
`tel:`, `mailto:`, App Store, Google Play, Instagram, Facebook, LinkedIn,
TikTok) ou cuja classe CSS contenha `cta`, `btn`, `button` ou `pricing` já
é trackeado automaticamente — sem precisar de `onclick` nem de nenhuma
marcação. O nome do evento é escolhido sozinho (ex: `clique_whatsapp`,
`clique_app_store`); pra outros botões, usa um nome derivado do texto do
botão (ex: `clique_cta_comecar_agora`).

**Qual botão específico foi clicado** (ex: qual plano — Grátis, Essential,
Pro) também é detectado automaticamente: o tracker sobe pelos elementos-pai
a partir do botão clicado e usa o título (`h1`–`h6`) do card mais próximo
como "rótulo" — sem separar da contagem agregada do tipo de evento. Se por
algum motivo a detecção pegar o título errado, dá pra forçar manualmente
com `data-plano="Nome"` num elemento em volta do botão, mas isso raramente
é necessário.

### Vídeo — YouTube e `<video>` nativo, ambos automáticos

- **YouTube:** qualquer iframe do YouTube na página é detectado sozinho —
  mesmo que só seja criado depois (facades que carregam o player ao
  clicar). Dispara `video_play`, `video_progress` (a cada 10%),
  `video_pause` e `video_complete`.
- **`<video>` nativo (VSL hospedada na própria LP):** precisa de uma linha
  a mais, conectando o tracker ao elemento:
  ```html
  <video id="vsl" src="video-vendas.mp4" controls></video>
  <script src="https://SEU-DOMINIO/tracker.js" data-site="relinq-beauty"></script>
  <script>
    relinqTrackVideo(document.getElementById('vsl'), 'vsl-principal');
  </script>
  ```
  Se a LP tiver mais de um vídeo nativo, chama `relinqTrackVideo` de novo
  pra cada um, com um `video_id` diferente.

No painel, cada vídeo (YouTube ou nativo) aparece junto, com total de
plays, taxa de conclusão, duração média assistida e a curva de retenção
por marco de 10%.

---

## Eventos manuais (quando o automático não é suficiente)

Pra marcar algo que o automático não cobre, chame `relinqTrack` direto no
HTML ou JS da própria LP:

```html
<button onclick="relinqTrack('conversao')">Finalizar compra</button>
```

Ou de dentro de um handler JS:
```js
document.getElementById('form-cadastro').addEventListener('submit', function () {
  relinqTrack('conversao');
});
```

### Convenções de nome — importantes pro painel entender o evento

- **`clique_algumacoisa`** — qualquer evento começando com `clique_` vira
  um tipo de clique separado na seção "Cliques por tipo". Normalmente nem
  precisa disparar manual, já que a maioria já é auto-detectada.
- **`conversao`** — reserve **só pra venda de verdade** (pagamento
  confirmado, cadastro pago concluído). É o que calcula a "taxa de
  conversão" nos cards do topo.
- **`quiz_finalizado`** (ou nome parecido) — pra marcos do meio do funil
  que não são a venda em si (ex: quiz respondido até o fim, lead
  capturado). Aparece como um card separado no painel ("Quizzes
  finalizados") quando presente, sem misturar com a conversão real.

---

## Ferramentas de terceiros (quiz builders, checkout, etc.)

Quando a LP não é código seu — só uma ferramenta com um campo tipo
"Head", "Pixel" ou "Scripts customizados" (ex: **InLead**, Typeform,
checkouts prontos) — dois recursos cobrem o funil sem precisar de código:

1. **Cliques continuam sendo auto-detectados** normalmente, contanto que
   os botões da ferramenta sejam `<a>` ou `<button>` (praticamente sempre
   são).

2. **Evento automático por parâmetro de URL** — pra marcar uma etapa
   específica (ex: quiz finalizado, lead capturado) numa página de
   destino que a própria ferramenta permite configurar (ex: a "página de
   obrigado" depois do formulário), configure essa URL de destino com:
   ```
   https://sua-pagina-de-obrigado.com/?relinq_evento=quiz_finalizado
   ```
   O tracker detecta esse parâmetro sozinho ao carregar a página e
   dispara o evento — zero código na ferramenta. Aceita também
   `&relinq_rotulo=algo`, se quiser rotular esse evento específico.

**Instalando na InLead:** abra o funil → aba **Configurações** →
**Pixel/Scripts** → cole a tag do tracker no campo **Head** → **Concluído**
→ **Publicar**.

---

## Integração com o GTM server-side (Relinq Sales)

Além do `tracker.js` do navegador, o `pages/api/track.js` também aceita
eventos vindos do **container GTM server-side** da empresa (o
"[SERVER] Relinq..."), através de uma tag "Solicitação HTTP" vinculada ao
trigger **"Todos os Eventos - GA4"** já existente lá. Isso roda em
paralelo ao envio pra Meta, sem interferir nele — a tag nova não tem
nenhum "fire before/after" com a tag da Meta, então mesmo que o endpoint
falhe, o envio pra Meta continua normal.

**Por enquanto, só a Relinq Sales usa essa integração.**

### 1. Variáveis de ambiente (ver `.env.example`)

- `GTM_SERVER_SECRET` — segredo compartilhado com a tag do GTM. Gere com
  `openssl rand -hex 32`. Sem essa variável configurada, o endpoint
  recusa qualquer requisição que se diga vinda do GTM.
- `GTM_SITES_PERMITIDOS` — slugs de site aceitos (ex: `relinq-sales`).
- `GTM_EVENTOS_PERMITIDOS` — nomes de evento aceitos (ex:
  `lead,generate_lead,purchase`). Como o trigger manda **todo** evento
  GA4, é essa lista que decide o que de fato vira registro no banco;
  ajustar o que entra no tracker é só editar essa variável, sem tocar no
  GTM.

### 2. Configuração da tag no GTM (container server)

Na tag "Solicitação HTTP" vinculada ao trigger "Todos os Eventos - GA4":

- **Método:** POST
- **URL:** `https://SEU-DOMINIO/api/track`
- **Header:** `x-gtm-secret: <mesmo valor de GTM_SERVER_SECRET>`
- **Corpo (JSON)**, montado com as variáveis já disponíveis nesse
  trigger:
  ```json
  {
    "site": "relinq-sales",
    "evento": "{{Nome do Evento}}",
    "pagina": "{{Page Location}}",
    "visitor_id": "{{Client ID}}",
    "utm_source": "{{utm_source}}",
    "utm_medium": "{{utm_medium}}",
    "utm_campaign": "{{utm_campaign}}",
    "utm_content": "{{utm_content}}",
    "utm_term": "{{utm_term}}"
  }
  ```
  (`site` fica fixo em `"relinq-sales"` direto na tag — não precisa vir
  de variável, já que essa tag é dedicada a essa LP/quiz.)

### 3. Testando

1. Publique a tag em modo **Preview** do GTM antes de publicar de
   verdade, e confirme no debug que ela dispara com status `201`
   (evento aceito) ou `204` (evento fora da allowlist — normal, não é
   erro) — nunca `401`/`403` (secret errado) nem `404`/`500`.
2. Confirme, no mesmo Preview, que a tag da Meta continua disparando
   normalmente, sem nenhuma mudança de comportamento.
3. Só então publique a versão do container.

---

## Usando o painel

- **Seletor de LP** (topo): escolhe uma LP específica, ou **"📊 Todas as
  LPs juntas"** pra ver tudo somado de uma vez.
- **Atualização automática**: os números se atualizam sozinhos a cada 10
  segundos, sem precisar dar F5 — bom pra deixar o painel aberto numa TV.
  O clique/evento em si já é gravado instantaneamente; o intervalo de 10s
  é só sobre quando a *tela* vai buscar de novo os dados atualizados.
- **Filtro de datas**: período customizado ou atalhos (Hoje, 7 dias, 30
  dias).
- **Gráfico de colunas**: Visitas / Cliques / Conversões por dia.
- **Seções recolhíveis**: clique no título de qualquer seção pra
  esconder/mostrar (útil conforme a lista de tipos de clique cresce).
- **Busca em "Cliques por tipo"**: filtra tanto essa tabela quanto o
  "Detalhamento por botão" pelo nome do evento ou do rótulo.
- **`/visao-geral`**: compara todas as LPs cadastradas lado a lado, uma
  linha por LP.
- **`/relatorios`**: relatório de engajamento (dispositivo, profundidade de
  rolagem e tempo médio na página). Filtra por uma ou várias LPs e por
  período, compara com o período anterior (variação % nos cards e linha
  tracejada nos gráficos), compara LPs lado a lado e exporta a tabela
  resumo em CSV. O tempo médio limita cada medição a 30 min
  (`TEMPO_MAXIMO_SEGUNDOS` em `pages/api/relatorios.js`) pra uma aba
  esquecida aberta não distorcer a média.
- **Cards criados (formulário da LP de evento)**: o próprio `tracker.js`
  observa a caixa de sucesso do formulário (`#reg-success`) e dispara
  `card_criado` quando ela aparece, ou seja, depois que o card foi criado
  (sem alterar o código da LP; basta ter o `<script>` do tracker instalado).
  Para outras LPs, use `data-sucesso="#seletor"` (e, opcionalmente,
  `data-sucesso-evento="nome"`) no `<script>` de instalação.
  Quando existe ao menos um evento `card_criado` no período, o painel e o
  `/relatorios` mostram "Cards criados" e "Taxa de cards" (visitantes
  únicos que criaram card ÷ visitantes únicos); no relatório entram também
  na comparação entre LPs, no gráfico diário e no CSV.

---

## Estrutura do projeto

```
relinq-tracker/
  db/schema.sql          -> schema inicial do MySQL (tabelas sites e events)
  db/migration-2.sql     -> adiciona colunas de engajamento (visitor_id, dispositivo, etc.)
  db/migration-3.sql     -> adiciona a coluna "rotulo" (qual botão específico)
  lib/db.js              -> conexão com o MySQL
  lib/auth.js             -> sessão de login (Node.js — usado pelas rotas de API)
  lib/auth-edge.js         -> mesma verificação de sessão, versão Edge Runtime (middleware)
  middleware.js             -> protege o painel e as APIs internas, exige login
  components/Relogio.js      -> relógio ao vivo no cabeçalho do painel
  pages/api/track.js          -> recebe eventos do tracker.js e (autenticado) do GTM server-side (pública, sem login)
  pages/api/sites.js            -> cadastra/lista as LPs (protegida)
  pages/api/stats.js              -> calcula as métricas do painel (protegida)
  pages/api/login.js                -> confere usuário/senha, grava cookie de sessão
  pages/api/logout.js                 -> limpa o cookie de sessão
  pages/login.js                        -> tela de login
  pages/index.js                          -> painel principal (visitas, cliques, conversões, UTMs, vídeo)
  pages/sites.js                            -> tela de cadastro de LPs
  pages/visao-geral.js                        -> comparativo entre todas as LPs
  pages/relatorios.js                           -> relatório de dispositivo, rolagem e tempo (com comparação e CSV)
  pages/api/relatorios.js                         -> métricas do relatório (protegida)
  styles/relatorios.module.css                      -> estilos exclusivos da página de relatórios
  public/tracker.js                             -> snippet único a ser instalado em qualquer LP
```

---

## Segurança e uso de dados

Conforme a política de uso da conta Claude da Relinq, nenhum dado real de
cliente, credencial ou informação sensível deve ser usado nos
testes/exemplos deste projeto — usar sempre dados fictícios.
