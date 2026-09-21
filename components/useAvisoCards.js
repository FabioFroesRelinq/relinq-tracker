import { useCallback, useEffect, useRef, useState } from "react";

var INTERVALO_MS = 15000; // consulta a cada 15s (navegadores podem espaçar mais em aba oculta)
var DURACAO_MS = 12000; // quanto tempo o aviso fica na tela
var MAX_VISIVEIS = 3;
var CHAVE_PREFS = "relinq_avisos";
var CHAVE_ULTIMO = "relinq_card_ultimo_id"; // por aba (sessionStorage)

var PREFS_PADRAO = { card: true, som: false, sistema: false };

function lerPrefs() {
  try {
    var salvo = JSON.parse(localStorage.getItem(CHAVE_PREFS) || "null");
    if (salvo && typeof salvo === "object") {
      return {
        card: salvo.card !== false,
        som: salvo.som === true,
        sistema: salvo.sistema === true,
      };
    }
  } catch (e) {}
  return PREFS_PADRAO;
}

// Dois toques curtos gerados no navegador (sem arquivo de áudio). Só toca
// depois que a pessoa já interagiu com a página (regra dos navegadores).
var contextoAudio = null;
export function tocarSom() {
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!contextoAudio) contextoAudio = new Ctx();
    if (contextoAudio.state === "suspended") contextoAudio.resume();
    var agora = contextoAudio.currentTime;
    [660, 880].forEach(function (freq, i) {
      var osc = contextoAudio.createOscillator();
      var ganho = contextoAudio.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      ganho.gain.setValueAtTime(0.0001, agora + i * 0.16);
      ganho.gain.exponentialRampToValueAtTime(0.18, agora + i * 0.16 + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.0001, agora + i * 0.16 + 0.22);
      osc.connect(ganho);
      ganho.connect(contextoAudio.destination);
      osc.start(agora + i * 0.16);
      osc.stop(agora + i * 0.16 + 0.24);
    });
  } catch (e) {}
}

function textoOrigem(c) {
  if (c.origem && c.campanha) return "via " + c.origem + " · campanha " + c.campanha;
  if (c.origem) return "via " + c.origem;
  return "sem origem identificada (acesso direto)";
}

// Consulta /api/cards-novos e avisa quando um card é criado.
// Não guarda nem mostra nenhum dado pessoal: só LP, origem e horário.
export default function useAvisoCards(opcoes) {
  var comRecentes = !!(opcoes && opcoes.comRecentes);
  var [prefs, setPrefsEstado] = useState(PREFS_PADRAO);
  var [avisos, setAvisos] = useState([]);
  var [recentes, setRecentes] = useState([]);
  var [permissao, setPermissao] = useState("indisponivel");
  var prefsRef = useRef(PREFS_PADRAO);
  var ultimoRef = useRef(null);
  var contador = useRef(0);
  var timers = useRef([]);

  // Preferências salvas (e sincronizadas entre abas)
  useEffect(function () {
    var p = lerPrefs();
    prefsRef.current = p;
    setPrefsEstado(p);
    if (typeof Notification !== "undefined") setPermissao(Notification.permission);

    function alterou(e) {
      if (e.key === CHAVE_PREFS) {
        var novo = lerPrefs();
        prefsRef.current = novo;
        setPrefsEstado(novo);
      }
    }
    window.addEventListener("storage", alterou);
    return function () {
      window.removeEventListener("storage", alterou);
    };
  }, []);

  var atualizarPrefs = useCallback(function (parcial) {
    var novo = Object.assign({}, prefsRef.current, parcial);
    prefsRef.current = novo;
    setPrefsEstado(novo);
    try {
      localStorage.setItem(CHAVE_PREFS, JSON.stringify(novo));
    } catch (e) {}
  }, []);

  var dispensar = useCallback(function (chave) {
    setAvisos(function (lista) {
      return lista.filter(function (a) {
        return a.chave !== chave;
      });
    });
  }, []);

  var mostrar = useCallback(
    function (itens) {
      if (itens.length === 0) return;
      setAvisos(function (lista) {
        return lista.concat(itens).slice(-MAX_VISIVEIS);
      });
      itens.forEach(function (a) {
        timers.current.push(
          setTimeout(function () {
            dispensar(a.chave);
          }, DURACAO_MS)
        );
      });
    },
    [dispensar]
  );

  // Quando vários cards chegam de uma vez, vira um aviso só.
  function tratarNovos(novos) {
    var p = prefsRef.current;
    if (!p.card || novos.length === 0) return;

    var itens;
    if (novos.length <= MAX_VISIVEIS) {
      itens = novos.map(function (c) {
        contador.current += 1;
        return {
          chave: "c" + c.id + "-" + contador.current,
          titulo: "Novo card criado",
          corpo: c.siteNome,
          meta: textoOrigem(c),
          cor: c.cor || null,
          siteSlug: c.siteSlug,
        };
      });
    } else {
      var nomes = [];
      novos.forEach(function (c) {
        if (nomes.indexOf(c.siteNome) < 0) nomes.push(c.siteNome);
      });
      contador.current += 1;
      itens = [
        {
          chave: "lote-" + contador.current,
          titulo: novos.length + " novos cards criados",
          corpo: nomes.slice(0, 3).join(", ") + (nomes.length > 3 ? " e outras" : ""),
          meta: null,
          cor: null,
          siteSlug: null,
        },
      ];
    }

    mostrar(itens);
    if (p.som) tocarSom();

    if (p.sistema && typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
      itens.forEach(function (a) {
        try {
          new Notification(a.titulo, {
            body: a.corpo + (a.meta ? " · " + a.meta : ""),
            tag: "relinq-" + a.chave,
          });
        } catch (e) {}
      });
    }
  }

  useEffect(
    function () {
      var cancelado = false;

      try {
        var salvo = sessionStorage.getItem(CHAVE_ULTIMO);
        if (salvo && /^\d+$/.test(salvo)) ultimoRef.current = Number(salvo);
      } catch (e) {}

      function consultar() {
        var partes = [];
        if (ultimoRef.current !== null) partes.push("desde=" + ultimoRef.current);
        if (comRecentes) partes.push("recentes=1");

        fetch("/api/cards-novos" + (partes.length ? "?" + partes.join("&") : ""))
          .then(function (r) {
            return r.ok ? r.json() : null;
          })
          .then(function (dados) {
            if (cancelado || !dados || typeof dados.ultimoId !== "number") return;
            var primeira = ultimoRef.current === null;
            ultimoRef.current = dados.ultimoId;
            try {
              sessionStorage.setItem(CHAVE_ULTIMO, String(dados.ultimoId));
            } catch (e) {}
            if (!primeira) tratarNovos(dados.novos || []);
            if (comRecentes) setRecentes(dados.recentes || []);
          })
          .catch(function () {});
      }

      consultar();
      var id = setInterval(consultar, INTERVALO_MS);

      function voltou() {
        if (!document.hidden) consultar();
      }
      document.addEventListener("visibilitychange", voltou);

      return function () {
        cancelado = true;
        clearInterval(id);
        document.removeEventListener("visibilitychange", voltou);
        timers.current.forEach(clearTimeout);
        timers.current = [];
      };
    },
    [comRecentes] // eslint-disable-line react-hooks/exhaustive-deps
  );

  var pedirPermissao = useCallback(
    function () {
      if (typeof Notification === "undefined") return;
      Notification.requestPermission().then(function (p) {
        setPermissao(p);
        if (p === "granted") atualizarPrefs({ sistema: true });
      });
    },
    [atualizarPrefs]
  );

  return {
    avisos: avisos,
    recentes: recentes,
    dispensar: dispensar,
    prefs: prefs,
    atualizarPrefs: atualizarPrefs,
    permissao: permissao,
    pedirPermissao: pedirPermissao,
  };
}
