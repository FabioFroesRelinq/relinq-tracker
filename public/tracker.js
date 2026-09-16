/**
 * Relinq Tracker — snippet de rastreamento para LPs.
 *
 * Instalação na LP:
 *   <script src="https://SEU-DOMINIO/tracker.js" data-site="relinq-beauty"></script>
 *
 * Disparar evento manual (clique em qualquer CTA):
 *   <a href="https://wa.me/..." onclick="relinqTrack('clique_whatsapp')">Falar no WhatsApp</a>
 *   <button onclick="relinqTrack('clique_cta')">Quero começar</button>
 *   <button onclick="relinqTrack('clique_checkout')">Finalizar compra</button>
 *
 * Convenção: qualquer evento com nome começando em "clique_" vira um tipo de
 * clique separado no painel (clique_whatsapp, clique_cta, clique_checkout, etc.
 * podem conviver na mesma LP, cada um contado à parte).
 *
 * Pra marcar uma conversão de verdade (ex: pagamento confirmado, cadastro concluído):
 *   relinqTrack('conversao')
 *
 * Rotulando qual botão específico foi clicado (ex: qual plano):
 * Isso é AUTOMÁTICO, sem precisar mexer no HTML da LP — o tracker olha o
 * "card" em volta do botão clicado e usa o título (h1–h6) mais próximo
 * como rótulo (ex: o card do plano "Essential" tem um <h3>Essential</h3>,
 * então cliques nesse botão específico ficam rotulados "Essential",
 * mesmo continuando a contar juntos em clique_whatsapp).
 * Se a LP tiver um seletor de período de cobrança com a classe "cycle-btn"
 * e "active" no botão selecionado (ex: <button class="cycle-btn active"
 * data-cycle="anual">Anual</button>), esse período entra junto no rótulo
 * automaticamente (ex: "Essential (anual)").
 * Em algum caso raro onde a detecção automática pegar o título errado,
 * dá pra forçar manualmente com data-plano="Nome" num elemento em volta
 * do botão — mas isso é só um ajuste fino opcional, não é necessário.
 *
 * FERRAMENTAS DE TERCEIROS (ex: quiz builders como InLead, checkouts, etc.)
 * Quando você não tem acesso ao código da página — só a um campo tipo
 * "Head/Pixel/Scripts" pra colar essa mesma tag de script — dois recursos
 * ajudam a cobrir o funil sem precisar de código:
 *
 * 1) Cliques continuam sendo auto-detectados normalmente (respostas do
 *    quiz, botões de avançar, etc.), contanto que sejam <a> ou <button>.
 *
 * 2) Pra marcar uma etapa específica (ex: "quiz finalizado", "lead
 *    capturado") numa página de destino que você configura na própria
 *    ferramenta (ex: a "página de obrigado" depois do quiz/formulário),
 *    coloca esse parâmetro na URL de destino configurada na ferramenta:
 *      https://sua-pagina.com/obrigado?relinq_evento=quiz_finalizado
 *    O tracker detecta esse parâmetro sozinho ao carregar a página e
 *    dispara o evento — sem precisar editar nada no código da ferramenta.
 *    Também aceita &relinq_rotulo=algo, se quiser rotular esse evento.
 *    Reserve o evento "conversao" pra venda de verdade, não pra etapas
 *    intermediárias do funil como essa.
 *
 * 3) Se a ferramenta já empurra eventos pro dataLayer (GTM) — o que é
 *    bem comum em quiz builders como a InLead — o tracker escuta sozinho
 *    e replica cada evento como "quiz_<nome_original>" no painel, com
 *    tentativa automática de achar um rótulo (pergunta/resposta) e um
 *    valor numérico (progresso/percentual) dentro do objeto do evento.
 *    Não precisa configurar nada a mais pra isso funcionar.
 */
(function () {
  var scriptTag = document.currentScript;
  var site = scriptTag ? scriptTag.getAttribute("data-site") : null;

  if (!site) {
    console.warn("[Relinq Tracker] atributo data-site não encontrado no <script>. Eventos não serão enviados.");
    return;
  }

  var apiBase = scriptTag.src.replace(/\/tracker\.js.*$/, "");
  var apiUrl = apiBase + "/api/track";

  // --- Visitante anônimo (persistente, pra contar visitantes únicos) ---
  var CHAVE_VISITOR = "relinq_visitor_id";
  var visitorId = null;

  // Se a pessoa chegou com ?relinq_visitor=... na URL (porque veio de outro
  // domínio que já leva esse mesmo tracker instalado — ex: saiu do quiz e
  // entrou na página de vendas), adota esse ID em vez de gerar um novo.
  // Isso é o que permite seguir a mesma pessoa de um domínio pro outro.
  var visitorDaUrl = new URLSearchParams(window.location.search).get("relinq_visitor");

  try {
    if (visitorDaUrl) {
      visitorId = visitorDaUrl;
      localStorage.setItem(CHAVE_VISITOR, visitorId);
    } else {
      visitorId = localStorage.getItem(CHAVE_VISITOR);
      if (!visitorId) {
        visitorId = "v_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(CHAVE_VISITOR, visitorId);
      }
    }
  } catch (e) {
    // localStorage pode estar bloqueado (modo privado, etc.) — segue sem persistir
    visitorId = visitorDaUrl || "v_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  // --- Propaga o mesmo visitor_id pra links que saem pra OUTRO domínio ---
  // Sem isso, ao clicar num link pra outro site (ex: quiz -> página de
  // vendas em domínio diferente), o próximo domínio geraria um visitor_id
  // novo, e a jornada da pessoa entre os dois se perderia. Isso reaplica
  // periodicamente pra pegar links que aparecem depois (SPA, quiz builders
  // que montam a página aos poucos, etc.)
  (function propagarVisitorEntreDominios() {
    function marcarLinks() {
      var links = document.getElementsByTagName("a");
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute("href");
        if (!href || href.indexOf("#") === 0 || href.toLowerCase().indexOf("javascript:") === 0) continue;
        try {
          var url = new URL(href, window.location.href);
          if (url.protocol !== "http:" && url.protocol !== "https:") continue;
          if (url.hostname === window.location.hostname) continue; // mesmo domínio: localStorage já resolve sozinho
          if (url.searchParams.get("relinq_visitor") === visitorId) continue; // já marcado
          url.searchParams.set("relinq_visitor", visitorId);
          links[i].setAttribute("href", url.toString());
        } catch (e) {
          // href inválido ou relativo estranho — ignora esse link
        }
      }
    }
    marcarLinks();
    setInterval(marcarLinks, 1000);
  })();

  // --- Dispositivo (heurística simples via user-agent) ---
  function detectarDispositivo() {
    var ua = navigator.userAgent || "";
    if (/tablet|ipad/i.test(ua)) return "tablet";
    if (/mobile|android|iphone/i.test(ua)) return "mobile";
    return "desktop";
  }
  var dispositivo = detectarDispositivo();

  function pegarUtms() {
    var params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
      utm_content: params.get("utm_content"),
      utm_term: params.get("utm_term"),
    };
  }

  function enviarPayload(payload) {
    if (navigator.sendBeacon) {
      var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon(apiUrl, blob);
    } else {
      fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(function () {
        // falha silenciosa: tracking nunca deve quebrar a LP
      });
    }
  }

  function montarPayload(evento, extra) {
    return Object.assign(
      {
        site: site,
        evento: evento,
        pagina: window.location.pathname,
        visitor_id: visitorId,
        dispositivo: dispositivo,
      },
      pegarUtms(),
      extra || {}
    );
  }

  function enviar(evento) {
    enviarPayload(montarPayload(evento));
  }

  function enviarComRotulo(evento, rotulo) {
    enviarPayload(montarPayload(evento, { rotulo: rotulo }));
  }

  function enviarVideo(evento, videoId, valor) {
    enviarPayload(montarPayload(evento, { video_id: videoId, valor: valor }));
  }

  function enviarComValor(evento, valor) {
    enviarPayload(montarPayload(evento, { valor: valor }));
  }

  // --- Auto-detecção de CTAs (sem precisar de onclick="relinqTrack(...)") ---
  // Detecta destinos conhecidos (WhatsApp, tel, mailto, lojas de app, redes
  // sociais) e qualquer link/botão cuja classe pareça um CTA (cta/btn/pricing).
  // Elementos que já têm onclick="relinqTrack(...)" manual são ignorados aqui,
  // pra não disparar o evento em dobro.
  //
  // ROTULAGEM: quando o elemento clicado (ou um ancestral próximo) tem o
  // atributo data-plano="Essential", isso vira o "rotulo" do evento — o
  // tipo_evento continua o mesmo (ex: clique_whatsapp), então a contagem
  // agregada não muda, mas agora dá pra ver a quebra por botão no painel.
  // Se a página tiver um seletor de período de cobrança com a classe
  // "cycle-btn" e "active" no botão selecionado (ex: <button class="cycle-btn
  // active" data-cycle="anual">), esse período entra junto no rótulo.
  (function autoTrackCtas() {
    function destinoConhecido(href) {
      if (!href) return null;
      var h = href.toLowerCase();
      if (h.indexOf("wa.me") !== -1 || h.indexOf("api.whatsapp.com") !== -1 || h.indexOf("whatsapp:") === 0)
        return "clique_whatsapp";
      if (h.indexOf("tel:") === 0) return "clique_telefone";
      if (h.indexOf("mailto:") === 0) return "clique_email";
      if (h.indexOf("apps.apple.com") !== -1) return "clique_app_store";
      if (h.indexOf("play.google.com") !== -1) return "clique_google_play";
      if (h.indexOf("instagram.com") !== -1) return "clique_instagram";
      if (h.indexOf("facebook.com") !== -1) return "clique_facebook";
      if (h.indexOf("linkedin.com") !== -1) return "clique_linkedin";
      if (h.indexOf("tiktok.com") !== -1) return "clique_tiktok";
      return null;
    }

    function pareceCta(el) {
      var cls = (el.className && el.className.toString()) || "";
      return /\b(cta|btn|button|pricing)\b/i.test(cls);
    }

    function slugify(texto) {
      return texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40);
    }

    function nomeDoEvento(el, destino) {
      if (destino) return destino;
      var texto = (el.textContent || "").trim();
      var slug = texto ? slugify(texto) : "";
      return slug ? "clique_cta_" + slug : "clique_cta";
    }

    function comCiclo(rotulo) {
      // Se a página tiver um seletor de período de cobrança (padrão comum:
      // botão com classe "cycle-btn" e "active" quando selecionado), esse
      // período entra junto no rótulo automaticamente. Se a LP não tiver
      // esse padrão, isso simplesmente não encontra nada e é ignorado.
      var cicloAtivo = document.querySelector(".cycle-btn.active[data-cycle]");
      var ciclo = cicloAtivo ? cicloAtivo.getAttribute("data-cycle") : null;
      return ciclo ? rotulo + " (" + ciclo + ")" : rotulo;
    }

    // Descobre automaticamente qual "card" ou bloco o botão pertence, sem
    // precisar de nenhuma marcação manual no HTML da LP — funciona em
    // qualquer LP com o padrão comum de "card com título + botão".
    //
    // Sobe pelos elementos-pai a partir do botão clicado. A cada nível,
    // olha se aquele container tem só ESSE botão dentro dele (não vários) —
    // se tiver mais de um link/botão, já passou do "card" e entrou numa
    // seção que lista vários CTAs juntos (ex: a fileira inteira de planos),
    // então para a busca ali, pra não pegar um título errado. Dentro do
    // nível certo, usa o texto do primeiro título (h1–h6) que encontrar
    // como rótulo — normalmente é o nome do plano/produto daquele card.
    //
    // Continua aceitando um data-plano="..." manual no HTML como forma de
    // corrigir um caso específico, mas isso deixou de ser necessário.
    function pegarRotulo(el) {
      var comPlanoManual = el.closest ? el.closest("[data-plano]") : null;
      if (comPlanoManual) {
        return comCiclo(comPlanoManual.getAttribute("data-plano"));
      }

      var atual = el.parentElement;
      var nivel = 0;

      while (atual && nivel < 6) {
        var interativosDentro = atual.querySelectorAll("a[href], button").length;
        if (interativosDentro > 1) break; // container amplo demais — não é mais um card específico

        var titulo = atual.querySelector("h1, h2, h3, h4, h5, h6");
        if (titulo && titulo.textContent.trim()) {
          return comCiclo(titulo.textContent.trim());
        }

        atual = atual.parentElement;
        nivel++;
      }

      // Não achou nenhum card com título por perto — usa o próprio texto
      // do botão/link como rótulo (ex: "Falar com especialista"), que já
      // é bem mais útil do que ficar sem identificação nenhuma.
      var textoBotao = (el.textContent || "").trim();
      if (textoBotao) {
        return comCiclo(textoBotao.length > 60 ? textoBotao.slice(0, 60) + "…" : textoBotao);
      }

      // Botão só com ícone, sem texto nenhum (ex: o WhatsApp flutuante) —
      // tenta o aria-label ou title, que costumam existir justamente pra
      // descrever o que é o botão pra quem usa leitor de tela.
      var rotuloAcessivel = el.getAttribute("aria-label") || el.getAttribute("title");
      if (rotuloAcessivel && rotuloAcessivel.trim()) {
        return comCiclo(rotuloAcessivel.trim());
      }

      // Último recurso: identifica pelo destino do link (ex: o próprio
      // número/endereço de WhatsApp), melhor do que não saber nada.
      var href = el.getAttribute("href");
      if (href) {
        return comCiclo(href.length > 60 ? href.slice(0, 60) + "…" : href);
      }

      return null;
    }

    function jaTemTrackingManual(el) {
      var onclick = el.getAttribute("onclick") || "";
      return onclick.indexOf("relinqTrack(") !== -1;
    }

    function elegivel(el) {
      if (el.tagName !== "A" && el.tagName !== "BUTTON") return false;
      if (jaTemTrackingManual(el)) return false;
      if (el.dataset.relinqBound) return false;
      var href = el.getAttribute("href");
      return !!destinoConhecido(href) || pareceCta(el);
    }

    function ligar(el) {
      el.dataset.relinqBound = "1";
      var destino = destinoConhecido(el.getAttribute("href"));
      var evento = nomeDoEvento(el, destino);
      el.addEventListener("click", function () {
        var rotulo = pegarRotulo(el);
        if (rotulo) {
          enviarComRotulo(evento, rotulo);
        } else {
          enviar(evento);
        }
      });
    }

    function escanear(raiz) {
      var root = raiz || document;
      if (!root.querySelectorAll) return;
      root.querySelectorAll("a, button").forEach(function (el) {
        if (elegivel(el)) ligar(el);
      });
    }

    function iniciar() {
      escanear();
      var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          m.addedNodes.forEach(function (node) {
            if (node.nodeType !== 1) return;
            escanear(node);
          });
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", iniciar);
    } else {
      iniciar();
    }
  })();

  // --- Auto-detecção de vídeo do YouTube (iframe já presente ou criado
  // depois, como em facades que só carregam o player ao clicar) ---
  (function autoTrackYoutube() {
    var apiCarregando = false;

    function carregarApiEntao(callback) {
      if (window.YT && window.YT.Player) {
        callback();
        return;
      }
      var anterior = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof anterior === "function") anterior();
        callback();
      };
      if (!apiCarregando && !document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        apiCarregando = true;
        var s = document.createElement("script");
        s.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(s);
      }
    }

    function garantirEnableJsApi(iframe) {
      try {
        var url = new URL(iframe.src, window.location.href);
        if (!url.searchParams.has("enablejsapi")) {
          url.searchParams.set("enablejsapi", "1");
          iframe.src = url.toString();
        }
      } catch (e) {}
    }

    var contadorVideos = 0;

    function ligarVideo(iframe) {
      if (iframe.dataset.relinqYt) return;
      iframe.dataset.relinqYt = "1";
      garantirEnableJsApi(iframe);

      var idPadrao = "video_" + ++contadorVideos;

      carregarApiEntao(function () {
        var marcosDisparados = {};
        var tick = null;
        var jaTocou = false;

        function videoId(player) {
          try {
            return player.getVideoData().video_id || idPadrao;
          } catch (e) {
            return idPadrao;
          }
        }

        function pararProgresso() {
          if (tick) {
            clearInterval(tick);
            tick = null;
          }
        }

        new YT.Player(iframe, {
          events: {
            onStateChange: function (e) {
              var id = videoId(e.target);
              if (e.data === YT.PlayerState.PLAYING) {
                if (!jaTocou) {
                  jaTocou = true;
                  enviarVideo("video_play", id, 0);
                }
                marcosDisparados = {};
                pararProgresso();
                tick = setInterval(function () {
                  if (!e.target.getDuration) return;
                  var dur = e.target.getDuration();
                  if (dur > 0) {
                    var percentual = Math.floor((e.target.getCurrentTime() / dur) * 100);
                    var marco = Math.floor(percentual / 10) * 10;
                    if (marco > 0 && marco <= 100 && !marcosDisparados[marco]) {
                      marcosDisparados[marco] = true;
                      enviarVideo("video_progress", id, marco);
                    }
                  }
                }, 1000);
              } else if (e.data === YT.PlayerState.PAUSED) {
                pararProgresso();
                enviarVideo("video_pause", id, Math.floor(e.target.getCurrentTime()));
              } else if (e.data === YT.PlayerState.ENDED) {
                pararProgresso();
                enviarVideo("video_complete", id, Math.floor(e.target.getDuration()));
              }
            },
          },
        });
      });
    }

    function escanear(raiz) {
      var root = raiz || document;
      if (!root.querySelectorAll) return;
      root
        .querySelectorAll('iframe[src*="youtube.com"], iframe[src*="youtube-nocookie.com"]')
        .forEach(ligarVideo);
    }

    function iniciar() {
      escanear();
      var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          m.addedNodes.forEach(function (node) {
            if (node.nodeType !== 1) return;
            if (node.tagName === "IFRAME") escanear(node.parentNode || document);
            else escanear(node);
          });
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", iniciar);
    } else {
      iniciar();
    }
  })();

  // --- Profundidade de rolagem (25%, 50%, 75%, 100%) ---
  (function rastrearScroll() {
    var marcosDisparados = {};

    function checar() {
      var alturaTotal = document.documentElement.scrollHeight - window.innerHeight;
      if (alturaTotal <= 0) return;

      var percentual = Math.min(100, Math.round(((window.scrollY || window.pageYOffset) / alturaTotal) * 100));
      var marco = Math.floor(percentual / 25) * 25; // 0, 25, 50, 75, 100

      if (marco > 0 && !marcosDisparados[marco]) {
        marcosDisparados[marco] = true;
        enviarComValor("scroll_profundidade", marco);
      }
    }

    window.addEventListener("scroll", throttle(checar, 500));
  })();

  function throttle(fn, espera) {
    var ultimaExecucao = 0;
    return function () {
      var agora = Date.now();
      if (agora - ultimaExecucao >= espera) {
        ultimaExecucao = agora;
        fn();
      }
    };
  }

  // --- Tempo na página (enviado quando o usuário sai ou troca de aba) ---
  (function rastrearTempoNaPagina() {
    var inicio = Date.now();
    var jaEnviado = false;

    function enviarTempo() {
      if (jaEnviado) return;
      jaEnviado = true;
      var segundos = Math.round((Date.now() - inicio) / 1000);
      enviarComValor("tempo_pagina", segundos);
    }

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") enviarTempo();
    });
    window.addEventListener("pagehide", enviarTempo);
  })();

  /**
   * Conecta o tracker a um elemento <video> (a VSL hospedada na LP) e passa
   * a rastrear automaticamente: play, marcos de progresso a cada 10%,
   * pausa (com segundos assistidos) e conclusão.
   *
   * Uso na LP:
   *   <video id="vsl" src="video.mp4" controls></video>
   *   <script>
   *     relinqTrackVideo(document.getElementById('vsl'), 'vsl-principal');
   *   </script>
   */
  function relinqTrackVideo(videoEl, videoId) {
    if (!videoEl) {
      console.warn("[Relinq Tracker] elemento de vídeo não encontrado.");
      return;
    }

    var id = videoId || videoEl.id || "video";
    var jaTocou = false;
    var marcosDisparados = {};

    videoEl.addEventListener("play", function () {
      if (!jaTocou) {
        jaTocou = true;
        enviarVideo("video_play", id, 0);
      }
    });

    videoEl.addEventListener("timeupdate", function () {
      if (!videoEl.duration) return;

      var percentual = Math.floor((videoEl.currentTime / videoEl.duration) * 100);
      var marco = Math.floor(percentual / 10) * 10;

      if (marco > 0 && marco <= 100 && !marcosDisparados[marco]) {
        marcosDisparados[marco] = true;
        enviarVideo("video_progress", id, marco);
      }
    });

    videoEl.addEventListener("pause", function () {
      if (videoEl.ended) return;
      enviarVideo("video_pause", id, Math.floor(videoEl.currentTime));
    });

    videoEl.addEventListener("ended", function () {
      enviarVideo("video_complete", id, Math.floor(videoEl.duration));
    });
  }

  // Expõe funções globais pra disparar eventos manuais no HTML da LP
  window.relinqTrack = enviar;
  window.relinqTrackVideo = relinqTrackVideo;

  // --- Evento automático via parâmetro na URL ---
  // Útil pra ferramentas de terceiros (quiz builders, checkout, etc.) onde
  // você não tem acesso ao código da página, mas consegue configurar pra
  // onde ela redireciona depois de uma ação (ex: "página de obrigado" após
  // capturar um lead). Configurando essa página de destino com
  // ?relinq_evento=conversao (ou qualquer nome de evento) na URL, o evento
  // é disparado sozinho ao carregar, sem precisar de nenhum código extra.
  // Também aceita ?relinq_rotulo=algo pra rotular esse evento.
  (function eventoViaUrl() {
    var params = new URLSearchParams(window.location.search);
    var evento = params.get("relinq_evento");
    if (!evento) return;
    var rotulo = params.get("relinq_rotulo");
    if (rotulo) {
      enviarComRotulo(evento, rotulo);
    } else {
      enviar(evento);
    }
  })();

  // --- Ponte com o dataLayer (Google Tag Manager) ---
  // Útil pra ferramentas de terceiros que já empurram eventos estruturados
  // pro dataLayer (ex: quiz builders como a InLead, que costumam disparar
  // algo tipo {event: 'quiz_question_answered', question: '...', answer: '...'}
  // a cada resposta). Sem precisar saber o formato exato de antemão, isso
  // escuta TODO evento que chega no dataLayer e replica pro Relinq Tracker
  // automaticamente — tanto os que já estavam lá quando essa página carregou
  // quanto os que chegarem depois.
  //
  // Nome do evento no painel: "quiz_" + o nome do evento original (ex:
  // dataLayer manda "question_answered" -> vira "quiz_question_answered").
  //
  // Tenta também achar um rótulo e um valor numérico dentro do objeto do
  // evento, olhando por nomes de campo comuns (funciona com qualquer
  // ferramenta que siga essa convenção, não só a InLead):
  //   rótulo: quiz_question, question, pergunta, answer, resposta, label, title
  //   valor:  percent, progress, value  (quando forem número)
  (function ponteDataLayer() {
    if (!window.dataLayer) window.dataLayer = [];

    function ignoravel(nomeEvento) {
      return /^gtm\.|^optimize\.|^page_view$/i.test(nomeEvento);
    }

    function processar(item) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return;
      var nomeEvento = item.event;
      if (!nomeEvento || ignoravel(String(nomeEvento))) return;

      var nomeFinal = "quiz_" + String(nomeEvento).toLowerCase().replace(/[^a-z0-9]+/g, "_");

      var rotulo =
        item.quiz_question || item.question || item.pergunta ||
        item.answer || item.resposta || item.label || item.title || null;

      var valor =
        typeof item.percent === "number" ? item.percent :
        typeof item.progress === "number" ? item.progress :
        typeof item.value === "number" ? item.value :
        null;

      var extra = {};
      if (rotulo) extra.rotulo = String(rotulo);
      if (valor !== null) extra.valor = valor;

      enviarPayload(montarPayload(nomeFinal, extra));
    }

    // Processa o que já estava no dataLayer antes desse script carregar
    window.dataLayer.forEach(processar);

    // Intercepta os próximos pushes, sem deixar de funcionar normalmente
    // pro resto do que já usa o dataLayer (GTM, GA4, etc. continuam OK)
    var pushOriginal = window.dataLayer.push;
    window.dataLayer.push = function () {
      for (var i = 0; i < arguments.length; i++) {
        processar(arguments[i]);
      }
      return pushOriginal.apply(window.dataLayer, arguments);
    };
  })();

  // Dispara pageview automaticamente ao carregar
  enviar("visita");
})();