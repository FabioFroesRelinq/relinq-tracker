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
   mysql -u root -p relinq_tracker_db < db/migration-4.sql   # cor das LPs (opcional)
   mysql -u root -p relinq_tracker_db < db/migration-5.sql   # geografia dos visitantes (opcional)
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
- **Geografia ("De onde vêm os visitantes")**: ranking de estados e cidades dos
  visitantes, com quantos cards cada um gerou, uma frase no resumo e os estados
  na TV. O `/api/track` lê os cabeçalhos que a **Vercel** envia
  (`x-vercel-ip-country`, `x-vercel-ip-country-region`, `x-vercel-ip-city`) e grava
  só país, estado e cidade; **o IP nunca é guardado**. Para ativar, rode uma vez
  `db/migration-5.sql` no banco. Antes disso o tracker segue gravando normalmente,
  sem localização (ele confere as colunas sozinho, no máximo 1 min depois da
  migration). Só eventos novos têm localização; os antigos ficam em branco. Chamadas
  do GTM server-side não recebem localização (o IP delas é o do servidor do GTM).
  Fora da Vercel (ex: `npm run dev`) os cabeçalhos não existem. A cidade é
  aproximada (em celular a operadora pode indicar outra cidade); o estado é mais
  confiável. A tela **Saúde do tracking** mostra "Visitas com localização" por LP
  pra conferir que está funcionando.
- **Avisos de "Novo card criado"**: em qualquer página do painel aparece um
  popup (LP, origem e campanha, sem dado pessoal) quando um card é criado. O
  painel consulta `/api/cards-novos` a cada 15s; ao abrir, só marca o ponto de
  partida, então nunca avisa cards antigos. O sino no menu lateral liga/desliga
  o aviso, o som e a **notificação do sistema** (aparece com a aba em segundo
  plano; o navegador pede permissão uma vez). Limites: só funciona com o painel
  aberto em alguma aba (com o navegador fechado seria preciso Web Push), abas
  ocultas podem atrasar até ~1 min, e o som só toca depois de você interagir
  com a página. No modo TV o aviso é grande e há uma faixa com os últimos cards
  do dia; o botão de alto-falante liga o som.
- **`/saude` (saúde do tracking)**: um cartão por LP com semáforo (verde: evento
  na última hora; âmbar: entre 1 h e 24 h; vermelho: mais de 24 h sem eventos),
  último evento e última visita, eventos por hora nas últimas 24 h, o que
  chegou nos últimos 7 dias (visitas, rolagem e tempo na página são enviados
  sozinhos pelo `tracker.js`; se algum não chega, o script da LP pode estar
  desatualizado), % de visitantes identificados, % de visitas com UTM e o botão
  "Copiar script de instalação" já com o `data-site` da LP. Atualiza a cada 30s.
  As idades são calculadas no banco (`NOW()`), sem depender de fuso.
- **Cor de cada LP**: escolhida em "Cadastrar LP" (paleta ou cor livre) e usada
  em chips, tabelas, no seletor do painel e no modo TV. Para salvar a cor,
  rode uma vez `db/migration-4.sql` no banco. Sem isso nada quebra: cada LP
  usa uma cor automática e o cadastro avisa que a cor não foi salva.
- **Resumo em uma frase** (painel, relatórios e modo TV): no topo, um texto com
  visitantes, variação contra o período anterior, melhor origem, horário de
  pico e resultado (cards, conversões ou cliques). No filtro "Hoje" ele compara
  com ontem só até a mesma hora (`?ateAgora=1` em `/api/stats`), pra não
  parecer queda só porque o dia ainda não acabou.
- **`/tv` (modo TV)**: painel de números grandes. Ao abrir, mostra "Todas as LPs"
  e fica **pausado**; aperte o play para alternar sozinho entre as LPs. O botão
  "LPs" escolhe quais entram (a soma de todas e/ou cada LP; pelo menos uma fica
  marcada). Período (hoje, 7 ou 30 dias), tempo em cada LP (10, 20 ou 30s) e as
  LPs escolhidas ficam salvos no navegador; o play não (sempre abre pausado).
  Os controles aparecem ao mexer o mouse; teclas: ← e → trocam de LP (mesmo
  pausado), espaço pausa/retoma, F tela cheia, Esc fecha o menu de LPs.
- **Menu lateral e tema**: o menu fica fixo à esquerda (gaveta no celular) e
  a barra de filtros acompanha a rolagem. O botão "Tema claro/escuro" no
  menu guarda a escolha no navegador (padrão: escuro).
- **Painel principal**: cada card mostra a tendência dos dias do período e a
  variação contra o período anterior (mesma duração, logo antes). Também tem
  o funil de visitantes (visita, clique, card, conversão) e o mapa de calor
  de visitas por dia da semana e hora. As horas aparecem no horário de
  Brasília: o painel descobre sozinho o fuso do relógio do banco (`lib/fuso.js`)
  e converte, sem configuração. Para outro fuso, defina `FUSO_EXIBICAO_HORAS`
  (ex: `-4`). A tela Jornada usa a mesma conversão. Os dias (filtros e gráficos
  por dia) ainda viram à meia-noite do relógio do banco.
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
  components/Resumo.js         -> resumo em linguagem natural (painel e relatórios)
  components/geo.js              -> nomes dos estados e cidades (sigla -> nome)
  db/migration-5.sql              -> colunas pais/estado/cidade em events (geografia)
  components/useAvisoCards.js   -> consulta cards novos, popup, som e notificação do sistema
  components/AvisosCards.js      -> popup "Novo card criado"
  components/MenuAvisos.js        -> sino do menu lateral (preferências dos avisos)
  pages/api/cards-novos.js         -> cards criados desde um id (protegida)
  components/coresLP.js         -> cores das LPs e bolinha colorida
  components/SeletorCor.js       -> escolha de cor no cadastro de LPs
  pages/saude.js                  -> saúde do tracking por LP
  pages/api/saude.js               -> dados da saúde do tracking (protegida)
  db/migration-4.sql                -> coluna "cor" da tabela sites
  components/Shell.js          -> menu lateral, cabeçalho da página e tema claro/escuro
  components/CartaoKpi.js       -> card de número com mini gráfico (sparkline)
  components/Delta.js            -> variação ▲▼ (% e pontos percentuais)
  components/Secao.js             -> seção recolhível
  components/Icones.js             -> ícones (SVG) usados no lugar de emojis
  components/Esqueleto.js           -> placeholder de carregamento
  components/EstadoVazio.js          -> tela vazia com orientação
  pages/_document.js                  -> fonte (Manrope) e tema aplicado sem piscar
  pages/tv.js                          -> modo TV com rotação entre LPs
  styles/shell.module.css               -> estilos do menu lateral
  styles/tv.module.css                   -> estilos do modo TV
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
