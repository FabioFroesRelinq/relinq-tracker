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
  try {
    visitorId = localStorage.getItem(CHAVE_VISITOR);
    if (!visitorId) {
      visitorId = "v_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(CHAVE_VISITOR, visitorId);
    }
  } catch (e) {
    // localStorage pode estar bloqueado (modo privado, etc.) — segue sem persistir
    visitorId = "v_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

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
        enviar(evento);
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

  // Dispara pageview automaticamente ao carregar
  enviar("visita");
})();