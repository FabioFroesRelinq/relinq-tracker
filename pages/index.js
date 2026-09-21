import { useEffect, useState, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Relogio from "../components/Relogio";
import Shell from "../components/Shell";
import Secao from "../components/Secao";
import Icone from "../components/Icones";
import CartaoKpi from "../components/CartaoKpi";
import EstadoVazio from "../components/EstadoVazio";
import Esqueleto from "../components/Esqueleto";
import { Delta, DeltaPP, variacao } from "../components/Delta";
import { PontoLP, corDaLP } from "../components/coresLP";
import { ResumoPainel } from "../components/Resumo";
import nomeFuso from "../components/nomeFuso";
import { nomeEstado, nomeCidade } from "../components/geo";
import { metaDoEscopo, resumoDaMeta } from "../lib/perfil";

function ehClique(tipoEvento) {
  return tipoEvento.indexOf("clique_") === 0;
}

function somarPorTipo(totaisPorTipo, tipo) {
  var item = totaisPorTipo.find(function (t) {
    return t.tipo_evento === tipo;
  });
  return item ? item.total : 0;
}

function somarTodosCliques(totaisPorTipo) {
  return totaisPorTipo
    .filter(function (t) {
      return ehClique(t.tipo_evento);
    })
    .reduce(function (soma, t) {
      return soma + t.total;
    }, 0);
}

// Agrupa por uma chave (ex: utm_source), somando visita/cliques(qualquer tipo)/conversão
function agruparPorChave(linhas, chave) {
  var mapa = {};
  linhas.forEach(function (linha) {
    var k = linha[chave] || "-";
    if (!mapa[k]) mapa[k] = { visita: 0, cliques: 0, conversao: 0 };
    if (linha.tipo_evento === "visita") mapa[k].visita += linha.total;
    else if (linha.tipo_evento === "conversao") mapa[k].conversao += linha.total;
    else if (ehClique(linha.tipo_evento)) mapa[k].cliques += linha.total;
  });
  return mapa;
}

function formatarData(date) {
  return date.toISOString().slice(0, 10);
}

function aplicarAtalho(dias, setDataInicio, setDataFim) {
  var fim = new Date();
  var inicio = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  setDataInicio(formatarData(inicio));
  setDataFim(formatarData(fim));
}

function nomeAmigavelEvento(tipoEvento) {
  // "clique_whatsapp" -> "Whatsapp", "clique_checkout" -> "Checkout"
  var resto = tipoEvento.replace("clique_", "").replace(/_/g, " ");
  return resto.charAt(0).toUpperCase() + resto.slice(1);
}

function nomeAmigavelDispositivo(d) {
  if (d === "mobile") return "Celular";
  if (d === "tablet") return "Tablet";
  if (d === "desktop") return "Computador";
  return "Desconhecido";
}

var nfInt = new Intl.NumberFormat("pt-BR");

function fmtN(n) {
  return n == null ? "—" : nfInt.format(n);
}

function fmtPct1(n) {
  return n == null ? "—" : n.toFixed(1).replace(".", ",") + "%";
}

function fmtTempo(segundos) {
  if (segundos == null) return "—";
  var s = Math.round(segundos);
  if (s < 60) return s + "s";
  return Math.floor(s / 60) + "m " + String(s % 60).padStart(2, "0") + "s";
}

// --- Datas AAAA-MM-DD (em UTC, sem fuso) ---
function somarDiasStr(str, n) {
  var d = new Date(str + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diasEntreStr(inicio, fim) {
  return Math.round((new Date(fim + "T00:00:00Z") - new Date(inicio + "T00:00:00Z")) / 86400000) + 1;
}

// Período de mesma duração colado logo antes do escolhido.
function periodoAnterior(inicio, fim) {
  var dias = diasEntreStr(inicio, fim);
  var novoFim = somarDiasStr(inicio, -1);
  return { inicio: somarDiasStr(novoFim, -(dias - 1)), fim: novoFim };
}

function listarDias(inicio, fim) {
  var total = Math.min(400, Math.max(1, diasEntreStr(inicio, fim)));
  var lista = [];
  for (var i = 0; i < total; i++) lista.push(somarDiasStr(inicio, i));
  return lista;
}

// Números-chave de um resultado de /api/stats (usados nos cards e nas variações).
function kpisDe(s) {
  if (!s || !s.totaisPorTipo || !s.engajamento) return null;
  var visitas = somarPorTipo(s.totaisPorTipo, "visita");
  var conversoes = somarPorTipo(s.totaisPorTipo, "conversao");
  var visitantes = s.engajamento.visitantesUnicos;
  return {
    visitantes: visitantes,
    cliques: somarTodosCliques(s.totaisPorTipo),
    conversoes: conversoes,
    quizzes: somarPorTipo(s.totaisPorTipo, "quiz_finalizado"),
    leads: somarPorTipo(s.totaisPorTipo, "lead_capturado"),
    cards: somarPorTipo(s.totaisPorTipo, "card_criado"),
    taxaCards: visitantes > 0 ? ((s.engajamento.visitantesComCard || 0) / visitantes) * 100 : 0,
    taxaConversao: visitas > 0 ? (conversoes / visitas) * 100 : 0,
    taxaRejeicao: s.engajamento.taxaRejeicao,
    tempo: s.engajamento.tempoMedioSegundos,
    whatsappCliques: s.funil ? s.funil.comCliqueWhatsapp || 0 : 0,
    whatsappVerificados: s.funil ? s.funil.whatsappVerificados || 0 : 0,
    whatsappAbriram: s.funil ? s.funil.whatsappAbriram || 0 : 0,
    taxaAbertura:
      s.funil && s.funil.whatsappVerificados > 0 ? (s.funil.whatsappAbriram / s.funil.whatsappVerificados) * 100 : null,
  };
}

// Série diária (uma posição por dia do período) pros mini gráficos dos cards.
function serieDe(s, chave) {
  if (!s || !s.serieKpi || !s.periodo) return null;
  var mapa = {};
  s.serieKpi.forEach(function (l) {
    mapa[l.dia] = l[chave];
  });
  return listarDias(s.periodo.inicio, s.periodo.fim).map(function (d) {
    return mapa[d] || 0;
  });
}

function RodapeDelta({ atual, anterior, formatar, invertido, rotulo }) {
  if (anterior == null) return null;
  return (
    <>
      <Delta v={variacao(atual, anterior)} invertido={invertido} />
      <span className="card-base">{rotulo || "antes"}: {formatar(anterior)}</span>
    </>
  );
}

function RodapePP({ atual, anterior, invertido, rotulo }) {
  if (anterior == null) return null;
  return (
    <>
      <DeltaPP atual={atual} anterior={anterior} invertido={invertido} />
      <span className="card-base">{rotulo || "antes"}: {fmtPct1(anterior)}</span>
    </>
  );
}

export default function Dashboard() {
  const router = useRouter();

  const [sites, setSites] = useState([]);
  const [siteSelecionado, setSiteSelecionado] = useState("");
  const [secoesFechadas, setSecoesFechadas] = useState({});
  const [visualizacoes, setVisualizacoes] = useState({});
  const [tipoDetalhamento, setTipoDetalhamento] = useState("clique_whatsapp");
  const [filtroCliquesLP, setFiltroCliquesLP] = useState("todas");
  const [statsCliquesLP, setStatsCliquesLP] = useState(null);

  function vizAtual(id) {
    return visualizacoes[id] || "tabela";
  }

  function mudarViz(id, valor) {
    setVisualizacoes(function (atual) {
      var novo = Object.assign({}, atual);
      novo[id] = valor;
      return novo;
    });
  }
  const [statsAnterior, setStatsAnterior] = useState(null);
  const [buscaCliques, setBuscaCliques] = useState("");
  const [dataInicio, setDataInicio] = useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));
  const [stats, setStats] = useState(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(function () {
    fetch("/api/sites")
      .then(function (r) {
        return r.json();
      })
      .then(function (dados) {
        setSites(dados);
        var slugDaUrl = router.query.site;
        if (slugDaUrl && dados.some(function (s) { return s.slug === slugDaUrl; })) {
          setSiteSelecionado(slugDaUrl);
        } else if (dados.length > 0) {
          setSiteSelecionado(dados[0].slug);
        }
      });
  }, [router.query.site]);

  useEffect(
    function () {
      if (!siteSelecionado) return;
      var primeiraCarga = true;

      function carregarStats() {
        if (primeiraCarga) setCarregando(true);
        fetch(
          "/api/stats?site=" +
            siteSelecionado +
            "&inicio=" +
            dataInicio +
            "&fim=" +
            dataFim
        )
          .then(function (r) {
            return r.json();
          })
          .then(function (dados) {
            setStats(dados);
            setCarregando(false);
            primeiraCarga = false;
          });
      }

      carregarStats();
      var intervalo = setInterval(carregarStats, 10000); // atualiza sozinho a cada 10s

      return function () {
        clearInterval(intervalo);
      };
    },
    [siteSelecionado, dataInicio, dataFim]
  );

  // Filtro de LP específico dentro de "Cliques por tipo", só relevante
  // quando o seletor principal está em "Todas as LPs juntas" — reseta
  // sozinho se você trocar pra uma LP específica lá em cima.
  useEffect(
    function () {
      if (siteSelecionado !== "todas") {
        setFiltroCliquesLP("todas");
        setStatsCliquesLP(null);
      }
    },
    [siteSelecionado]
  );

  useEffect(
    function () {
      if (siteSelecionado !== "todas" || filtroCliquesLP === "todas") {
        setStatsCliquesLP(null);
        return;
      }
      fetch(
        "/api/stats?site=" + filtroCliquesLP + "&inicio=" + dataInicio + "&fim=" + dataFim
      )
        .then(function (r) {
          return r.json();
        })
        .then(function (dados) {
          setStatsCliquesLP(dados);
        });
    },
    [siteSelecionado, filtroCliquesLP, dataInicio, dataFim]
  );

  // Período anterior (pras variações dos cards): buscado uma vez a cada
  // mudança de filtro, sem entrar no refresh automático de 10s.
  useEffect(
    function () {
      if (!siteSelecionado || dataInicio > dataFim) return;
      var cancelado = false;
      setStatsAnterior(null);
      var p = periodoAnterior(dataInicio, dataFim);
      // Hoje ainda não acabou: compara com ontem só até a mesma hora.
      var ehHoje = dataInicio === dataFim && dataFim === new Date().toISOString().slice(0, 10);

      function buscar() {
        fetch(
          "/api/stats?site=" + siteSelecionado + "&inicio=" + p.inicio + "&fim=" + p.fim + (ehHoje ? "&ateAgora=1" : "")
        )
          .then(function (r) {
            return r.ok ? r.json() : null;
          })
          .then(function (dados) {
            if (!cancelado && dados && dados.totaisPorTipo) setStatsAnterior(dados);
          })
          .catch(function () {});
      }

      buscar();
      // O corte de "ontem até agora" anda com o relógio, então renova a cada minuto.
      var id = ehHoje ? setInterval(buscar, 60000) : null;
      return function () {
        cancelado = true;
        if (id) clearInterval(id);
      };
    },
    [siteSelecionado, dataInicio, dataFim]
  );

  const visitas = stats ? somarPorTipo(stats.totaisPorTipo, "visita") : 0;
  const conversoes = stats ? somarPorTipo(stats.totaisPorTipo, "conversao") : 0;
  const quizzesFinalizados = stats ? somarPorTipo(stats.totaisPorTipo, "quiz_finalizado") : 0;
  const leadsCapturados = stats ? somarPorTipo(stats.totaisPorTipo, "lead_capturado") : 0;
  const cardsCriados = stats ? somarPorTipo(stats.totaisPorTipo, "card_criado") : 0;
  const taxaCards =
    stats && stats.engajamento.visitantesUnicos > 0
      ? (((stats.engajamento.visitantesComCard || 0) / stats.engajamento.visitantesUnicos) * 100).toFixed(1)
      : "0.0";
  const eventosGtm = stats
    ? stats.totaisPorTipo.filter(function (t) {
        return t.tipo_evento.indexOf("gtm_") === 0;
      })
    : [];
  const cliquesTotais = stats ? somarTodosCliques(stats.totaisPorTipo) : 0;
  const taxaConversao = visitas > 0 ? ((conversoes / visitas) * 100).toFixed(1) : "0.0";
  const k = kpisDe(stats);
  // Em "Hoje" a comparação é com ontem só até a mesma hora.
  const rotuloAntes =
    dataInicio === dataFim && dataFim === new Date().toISOString().slice(0, 10) ? "ontem até agora" : "antes";
  const siteAtual =
    siteSelecionado && siteSelecionado !== "todas"
      ? sites.filter(function (s) {
          return s.slug === siteSelecionado;
        })[0] || null
      : null;
  const corPrincipal = siteAtual ? corDaLP(siteAtual) : "#6366f1";
  // Meta da LP escolhida (ou a meta em comum, em "todas as LPs"). Sem meta: modo automático.
  const metaKey = metaDoEscopo(sites, siteAtual);
  const dm = metaKey && k ? resumoDaMeta(metaKey, k) : null;
  const kAnt = kpisDe(statsAnterior);
  const dmAnt = metaKey && kAnt ? resumoDaMeta(metaKey, kAnt) : null;

  const origemAgrupada = stats ? agruparPorChave(stats.porOrigem, "utm_source") : {};
  const campanhaAgrupada = stats ? agruparPorChave(stats.porCampanha, "utm_campaign") : {};
  const criativoAgrupado = stats ? agruparPorChave(stats.porCriativo, "utm_content") : {};

  var detalhamentoPorCriativo = {};
  if (stats && stats.cliquesPorCriativoDetalhado) {
    stats.cliquesPorCriativoDetalhado.forEach(function (linha) {
      if (!detalhamentoPorCriativo[linha.utm_content]) detalhamentoPorCriativo[linha.utm_content] = [];
      detalhamentoPorCriativo[linha.utm_content].push(linha);
    });
  }

  var termoBusca = buscaCliques.trim().toLowerCase();
  var baseCliques = statsCliquesLP || stats;
  var cliquesPorTipoFiltrado =
    baseCliques && termoBusca
      ? baseCliques.cliquesPorTipo.filter(function (c) {
          return nomeAmigavelEvento(c.tipo_evento).toLowerCase().indexOf(termoBusca) !== -1;
        })
      : baseCliques
      ? baseCliques.cliquesPorTipo
      : [];
  var cliquesPorRotuloFiltrado =
    baseCliques && termoBusca
      ? baseCliques.cliquesPorRotulo.filter(function (c) {
          return (
            nomeAmigavelEvento(c.tipo_evento).toLowerCase().indexOf(termoBusca) !== -1 ||
            (c.rotulo || "").toLowerCase().indexOf(termoBusca) !== -1
          );
        })
      : baseCliques
      ? baseCliques.cliquesPorRotulo
      : [];

  // Tipos de clique disponíveis pra escolher em "Detalhamento por botão"
  // (só os que realmente têm algum rótulo pra detalhar)
  var tiposDisponiveisDetalhamento = [];
  (baseCliques ? baseCliques.cliquesPorRotulo : []).forEach(function (c) {
    if (tiposDisponiveisDetalhamento.indexOf(c.tipo_evento) === -1) {
      tiposDisponiveisDetalhamento.push(c.tipo_evento);
    }
  });
  var tipoDetalhamentoAtivo =
    tiposDisponiveisDetalhamento.indexOf(tipoDetalhamento) !== -1
      ? tipoDetalhamento
      : tiposDisponiveisDetalhamento.indexOf("clique_whatsapp") !== -1
      ? "clique_whatsapp"
      : tiposDisponiveisDetalhamento[0];

  function alternarSecao(id) {
    setSecoesFechadas(function (atual) {
      var novo = Object.assign({}, atual);
      novo[id] = !novo[id];
      return novo;
    });
  }

  return (
    <Shell
      titulo="Painel por LP"
      subtitulo={
        <span className="atualizacao-automatica">
          Atualiza sozinho a cada 10s <Relogio />
        </span>
      }
    >
      {sites.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma LP cadastrada ainda"
          texto="Cadastre a primeira LP e cole o script do tracker nela. Os números aparecem aqui assim que chegar o primeiro evento."
          acao={
            <Link href="/sites" className="btn">
              Cadastrar a primeira LP
            </Link>
          }
        />
      ) : (
        <>
          <div className="barra-filtros">
          <div className="filtros">
            <span className="select-lp">
              <PontoLP site={siteAtual} tamanho={10} />
              <select
                value={siteSelecionado}
                onChange={function (e) {
                  setSiteSelecionado(e.target.value);
                }}
              >
                <option value="todas">Todas as LPs juntas</option>
                {sites.map(function (s) {
                  return (
                    <option key={s.slug} value={s.slug}>
                      {s.nome}
                    </option>
                  );
                })}
              </select>
            </span>
            <input
              type="date"
              value={dataInicio}
              onChange={function (e) {
                setDataInicio(e.target.value);
              }}
            />
            <input
              type="date"
              value={dataFim}
              onChange={function (e) {
                setDataFim(e.target.value);
              }}
            />
            <div className="atalhos">
              <button className="btn-atalho" onClick={function () { aplicarAtalho(0, setDataInicio, setDataFim); }}>
                Hoje
              </button>
              <button className="btn-atalho" onClick={function () { aplicarAtalho(7, setDataInicio, setDataFim); }}>
                7 dias
              </button>
              <button className="btn-atalho" onClick={function () { aplicarAtalho(30, setDataInicio, setDataFim); }}>
                30 dias
              </button>
              <button className="btn-atalho" onClick={function () { aplicarAtalho(90, setDataInicio, setDataFim); }}>
                90 dias
              </button>
            </div>
          </div>
          </div>

          {carregando && <Esqueleto cartoes={6} />}

          {!carregando && stats && (
            <>
              <ResumoPainel
                stats={stats}
                k={k}
                kAnt={kAnt}
                nomeLP={siteAtual ? siteAtual.nome : "a LP"}
                todas={!siteAtual}
                meta={metaKey}
              />

              <div className="cards">
                <CartaoKpi
                  rotulo="Visitantes únicos"
                  valor={fmtN(k.visitantes)}
                  acento={corPrincipal}
                  serie={serieDe(stats, "visitantes")}
                  rodape={kAnt && <RodapeDelta rotulo={rotuloAntes} atual={k.visitantes} anterior={kAnt.visitantes} formatar={fmtN} />}
                />
                {dm && (
                  <CartaoKpi
                    destaque="Meta"
                    rotulo={dm.rotuloContagem}
                    valor={dm.contagem === null ? "—" : fmtN(dm.contagem)}
                    acento="#14b8a6"
                    secundario={dm.medida ? null : "abertura ainda não medida"}
                    serie={dm.medida ? serieDe(stats, dm.chaveSerie) : null}
                    rodape={
                      kAnt && dmAnt && dm.medida && (
                        <RodapeDelta rotulo={rotuloAntes} atual={dm.contagem} anterior={dmAnt.contagem} formatar={fmtN} />
                      )
                    }
                  />
                )}
                {dm && (
                  <CartaoKpi
                    destaque="Meta"
                    rotulo={dm.rotuloTaxa}
                    valor={dm.taxa === null ? "—" : fmtPct1(dm.taxa)}
                    acento="#14b8a6"
                    secundario={dm.notaTaxa}
                    rodape={
                      kAnt && dmAnt && dm.medida && dm.taxa !== null && dmAnt.taxa !== null && (
                        <RodapePP rotulo={rotuloAntes} atual={dm.taxa} anterior={dmAnt.taxa} />
                      )
                    }
                  />
                )}
                {metaKey === "whatsapp" && (
                  <CartaoKpi
                    rotulo="Clicaram no WhatsApp"
                    valor={fmtN(k.whatsappCliques)}
                    acento="#06b6d4"
                    secundario="visitantes únicos (clique duplo conta uma vez)"
                    serie={serieDe(stats, "whatsappCliques")}
                    rodape={kAnt && <RodapeDelta rotulo={rotuloAntes} atual={k.whatsappCliques} anterior={kAnt.whatsappCliques} formatar={fmtN} />}
                  />
                )}
                <CartaoKpi
                  rotulo="Cliques (todos os tipos)"
                  valor={fmtN(k.cliques)}
                  acento="#f59e0b"
                  serie={serieDe(stats, "cliques")}
                  rodape={kAnt && <RodapeDelta rotulo={rotuloAntes} atual={k.cliques} anterior={kAnt.cliques} formatar={fmtN} />}
                />
                {/* Conversões só aparecem como card "comum" no modo automático (sem meta). Com meta
                    de conversão elas viram os cards da meta; com meta de card ou WhatsApp, não aparecem. */}
                {metaKey === null && (
                  <CartaoKpi
                    rotulo="Conversões"
                    valor={fmtN(k.conversoes)}
                    acento="#22c55e"
                    serie={serieDe(stats, "conversoes")}
                    rodape={kAnt && <RodapeDelta rotulo={rotuloAntes} atual={k.conversoes} anterior={kAnt.conversoes} formatar={fmtN} />}
                  />
                )}
                {k.quizzes > 0 && (
                  <CartaoKpi
                    rotulo="Quizzes finalizados"
                    valor={fmtN(k.quizzes)}
                    acento="#38bdf8"
                    serie={serieDe(stats, "quizzes")}
                    rodape={kAnt && <RodapeDelta rotulo={rotuloAntes} atual={k.quizzes} anterior={kAnt.quizzes} formatar={fmtN} />}
                  />
                )}
                {k.leads > 0 && (
                  <CartaoKpi
                    rotulo="Leads capturados"
                    valor={fmtN(k.leads)}
                    acento="#fb923c"
                    serie={serieDe(stats, "leads")}
                    rodape={kAnt && <RodapeDelta rotulo={rotuloAntes} atual={k.leads} anterior={kAnt.leads} formatar={fmtN} />}
                  />
                )}
                {metaKey !== "card_criado" && k.cards > 0 && (
                  <CartaoKpi
                    rotulo="Cards criados"
                    valor={fmtN(k.cards)}
                    acento="#14b8a6"
                    serie={serieDe(stats, "cards")}
                    rodape={kAnt && <RodapeDelta rotulo={rotuloAntes} atual={k.cards} anterior={kAnt.cards} formatar={fmtN} />}
                  />
                )}
                {metaKey !== "card_criado" && k.cards > 0 && (
                  <CartaoKpi
                    rotulo="Taxa de cards"
                    valor={fmtPct1(k.taxaCards)}
                    acento="#14b8a6"
                    secundario="dos visitantes únicos"
                    rodape={kAnt && <RodapePP rotulo={rotuloAntes} atual={k.taxaCards} anterior={kAnt.taxaCards} />}
                  />
                )}
                {metaKey === null && (
                  <CartaoKpi
                    rotulo="Taxa de conversão"
                    valor={fmtPct1(k.taxaConversao)}
                    acento="#22c55e"
                    rodape={kAnt && <RodapePP rotulo={rotuloAntes} atual={k.taxaConversao} anterior={kAnt.taxaConversao} />}
                  />
                )}
                <CartaoKpi
                  rotulo="Taxa de rejeição"
                  valor={fmtPct1(k.taxaRejeicao)}
                  acento="#f43f5e"
                  rodape={kAnt && <RodapePP rotulo={rotuloAntes} atual={k.taxaRejeicao} anterior={kAnt.taxaRejeicao} invertido />}
                />
                <CartaoKpi
                  rotulo="Tempo médio na página"
                  valor={fmtTempo(k.tempo)}
                  acento="#a78bfa"
                  rodape={kAnt && <RodapeDelta rotulo={rotuloAntes} atual={k.tempo} anterior={kAnt.tempo} formatar={fmtTempo} />}
                />
              </div>

              <Secao id="funil" titulo="Funil de visitantes" aberta={!secoesFechadas.funil} aoAlternar={alternarSecao}>
                <Funil funil={stats.funil} meta={metaKey} />
              </Secao>

              <Secao id="painel-visual" titulo="Painel de gráficos" aberta={!secoesFechadas["painel-visual"]} aoAlternar={alternarSecao}>
                <div className="graficos-topo">
                  <div>
                    <h3 className="grafico-subtitulo">Visitas por dia</h3>
                    <GraficoColunas serieDiaria={stats.serieDiaria} />
                  </div>
                  <div>
                    <h3 className="grafico-subtitulo">Dispositivo</h3>
                    <GraficoPizza porDispositivo={stats.engajamento.porDispositivo} totalVisitas={visitas} />
                  </div>
                </div>
              </Secao>

              <Secao
                id="horarios"
                titulo="Melhores horários"
                aberta={!secoesFechadas.horarios}
                aoAlternar={alternarSecao}
              >
                <MapaCalor dados={stats.mapaCalor} fuso={stats.fuso} />
              </Secao>

              <Secao
                id="geografia"
                titulo="De onde vêm os visitantes"
                aberta={!secoesFechadas.geografia}
                aoAlternar={alternarSecao}
              >
                <Geografia geo={stats.geografia} totalVisitantes={k.visitantes} />
              </Secao>

              <Secao
                id="cliques"
                titulo="Cliques por tipo"
                aberta={!secoesFechadas.cliques}
                aoAlternar={alternarSecao}
                extra={
                  <div className="secao-extra-grupo">
                    {siteSelecionado === "todas" && (
                      <select
                        className="busca-cliques"
                        value={filtroCliquesLP}
                        onChange={function (e) {
                          setFiltroCliquesLP(e.target.value);
                        }}
                      >
                        <option value="todas">Todas as LPs</option>
                        {sites.map(function (s) {
                          return (
                            <option key={s.slug} value={s.slug}>
                              {s.nome}
                            </option>
                          );
                        })}
                      </select>
                    )}
                    <input
                      className="busca-cliques"
                      type="text"
                      placeholder="Filtrar por tipo ou botão…"
                      value={buscaCliques}
                      onChange={function (e) {
                        setBuscaCliques(e.target.value);
                      }}
                    />
                    <SeletorVisualizacao
                      id="cliques"
                      valor={vizAtual("cliques")}
                      aoMudar={mudarViz}
                      opcoes={["tabela", "pizza", "colunas", "barras"]}
                    />
                  </div>
                }
              >
                {(function () {
                  var dadosGrafico = cliquesPorTipoFiltrado.map(function (c) {
                    return { rotulo: nomeAmigavelEvento(c.tipo_evento), total: c.total };
                  });
                  var v = vizAtual("cliques");
                  if (v === "pizza") return <GraficoPizzaGenerico dados={dadosGrafico} />;
                  if (v === "colunas") return <GraficoColunasGenerico dados={dadosGrafico} />;
                  if (v === "barras") return <GraficoBarrasHorizontais dados={dadosGrafico} />;
                  return <TabelaCliques cliquesPorTipo={cliquesPorTipoFiltrado} />;
                })()}
              </Secao>

              {cliquesPorRotuloFiltrado && cliquesPorRotuloFiltrado.length > 0 && (
                <Secao
                  id="rotulo"
                  titulo="Detalhamento por botão"
                  aberta={!secoesFechadas.rotulo}
                  aoAlternar={alternarSecao}
                  extra={
                    <div className="secao-extra-grupo">
                      <select
                        className="busca-cliques"
                        value={tipoDetalhamentoAtivo}
                        onChange={function (e) {
                          setTipoDetalhamento(e.target.value);
                        }}
                      >
                        {tiposDisponiveisDetalhamento.map(function (t) {
                          return (
                            <option key={t} value={t}>
                              {nomeAmigavelEvento(t)}
                            </option>
                          );
                        })}
                      </select>
                      <SeletorVisualizacao
                        id="rotulo"
                        valor={vizAtual("rotulo")}
                        aoMudar={mudarViz}
                        opcoes={["tabela", "pizza", "colunas", "barras"]}
                      />
                    </div>
                  }
                >
                  {(function () {
                    var linhasFiltradas = cliquesPorRotuloFiltrado.filter(function (c) {
                      return c.tipo_evento === tipoDetalhamentoAtivo;
                    });
                    var dadosGrafico = linhasFiltradas.map(function (c) {
                      return { rotulo: c.rotulo, total: c.total };
                    });
                    var v = vizAtual("rotulo");
                    if (v === "pizza") return <GraficoPizzaGenerico dados={dadosGrafico} />;
                    if (v === "colunas") return <GraficoColunasGenerico dados={dadosGrafico} />;
                    if (v === "barras") return <GraficoBarrasHorizontais dados={dadosGrafico} />;
                    return <TabelaRotuloSimples dados={linhasFiltradas} />;
                  })()}
                </Secao>
              )}

              <Secao
                id="scroll"
                titulo="Profundidade de rolagem"
                aberta={!secoesFechadas.scroll}
                aoAlternar={alternarSecao}
                extra={
                  <SeletorVisualizacao
                    id="scroll"
                    valor={vizAtual("scroll")}
                    aoMudar={mudarViz}
                    opcoes={["tabela", "pizza", "colunas", "barras"]}
                  />
                }
              >
                {(function () {
                  var dadosGrafico = stats.engajamento.scrollProfundidade.map(function (m) {
                    return { rotulo: m.marco + "%", total: m.total };
                  });
                  var v = vizAtual("scroll");
                  if (v === "pizza") return <GraficoPizzaGenerico dados={dadosGrafico} />;
                  if (v === "colunas") return <GraficoColunasGenerico dados={dadosGrafico} />;
                  if (v === "barras") return <GraficoBarrasHorizontais dados={dadosGrafico} cor="#a78bfa" />;
                  return (
                    <TabelaScroll
                      scrollProfundidade={stats.engajamento.scrollProfundidade}
                      visitantesUnicos={stats.engajamento.visitantesUnicos}
                    />
                  );
                })()}
              </Secao>


              <Secao
                id="origem"
                titulo="Por origem (utm_source)"
                aberta={!secoesFechadas.origem}
                aoAlternar={alternarSecao}
                extra={<SeletorVisualizacao id="origem" valor={vizAtual("origem")} aoMudar={mudarViz} />}
              >
                {vizAtual("origem") === "grafico" ? (
                  <GraficoBarrasAgrupadasH dados={origemAgrupada} />
                ) : (
                  <TabelaAgrupada dados={origemAgrupada} />
                )}
              </Secao>

              <Secao
                id="campanha"
                titulo="Por campanha (utm_campaign)"
                aberta={!secoesFechadas.campanha}
                aoAlternar={alternarSecao}
                extra={<SeletorVisualizacao id="campanha" valor={vizAtual("campanha")} aoMudar={mudarViz} />}
              >
                {vizAtual("campanha") === "grafico" ? (
                  <GraficoBarrasAgrupadasH dados={campanhaAgrupada} />
                ) : (
                  <TabelaAgrupada dados={campanhaAgrupada} />
                )}
              </Secao>


              <Secao
                id="criativo"
                titulo="Por anúncio/criativo (utm_content)"
                aberta={!secoesFechadas.criativo}
                aoAlternar={alternarSecao}
                extra={<SeletorVisualizacao id="criativo" valor={vizAtual("criativo")} aoMudar={mudarViz} />}
              >
                {vizAtual("criativo") === "grafico" ? (
                  <GraficoBarrasAgrupadasH dados={criativoAgrupado} />
                ) : (
                  <TabelaAgrupada dados={criativoAgrupado} detalhamento={detalhamentoPorCriativo} />
                )}
              </Secao>

              {stats.video && stats.video.plays.length > 0 && (
                <Secao id="video" titulo="Vídeo (VSL)" aberta={!secoesFechadas.video} aoAlternar={alternarSecao}>
                  <SecaoVideo video={stats.video} />
                </Secao>
              )}

              {eventosGtm.length > 0 && (
                <Secao id="gtm" titulo="Outros eventos do GTM" aberta={!secoesFechadas.gtm} aoAlternar={alternarSecao}>
                  <p className="vazio" style={{ marginBottom: 14 }}>
                    Capturados automaticamente do dataLayer (eventos que o GTM manda e não têm um mapeamento direto pra convenção da Relinq).
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Evento</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventosGtm.map(function (ev) {
                        return (
                          <tr key={ev.tipo_evento}>
                            <td>{nomeAmigavelEvento(ev.tipo_evento)}</td>
                            <td>{ev.total}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Secao>
              )}
            </>
          )}
        </>
      )}
    </Shell>
  );
}

function TabelaCliques({ cliquesPorTipo }) {
  if (!cliquesPorTipo || cliquesPorTipo.length === 0) {
    return <p className="vazio">Nenhum clique registrado nesse período.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Tipo de clique</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {cliquesPorTipo.map(function (c) {
          return (
            <tr key={c.tipo_evento}>
              <td>{nomeAmigavelEvento(c.tipo_evento)}</td>
              <td>{c.total}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TabelaRotuloSimples({ dados }) {
  if (!dados || dados.length === 0) {
    return <p className="vazio">Sem dados nesse período.</p>;
  }

  var ordenado = dados.slice().sort(function (a, b) {
    return b.total - a.total;
  });

  return (
    <table>
      <thead>
        <tr>
          <th>Botão / rótulo</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {ordenado.map(function (c) {
          return (
            <tr key={c.rotulo}>
              <td>{c.rotulo}</td>
              <td>{c.total}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GraficoPizza({ porDispositivo, totalVisitas }) {
  if (!porDispositivo || porDispositivo.length === 0) {
    return <p className="vazio">Sem dados nesse período.</p>;
  }

  var cores = {
    desktop: "#6366f1",
    mobile: "#06b6d4",
    tablet: "#f59e0b",
    desconhecido: "#64748b",
  };

  var total = porDispositivo.reduce(function (soma, d) {
    return soma + d.total;
  }, 0);

  var raio = 80;
  var raioInterno = 50;
  var centro = 100;
  var circunferencia = 2 * Math.PI * raio;

  var acumulado = 0;
  var fatias = porDispositivo.map(function (d) {
    var fracao = total > 0 ? d.total / total : 0;
    var fatia = {
      dispositivo: d.dispositivo,
      total: d.total,
      pct: total > 0 ? ((d.total / total) * 100).toFixed(1) : "0.0",
      cor: cores[d.dispositivo] || "#64748b",
      offset: acumulado,
      comprimento: fracao * circunferencia,
    };
    acumulado += fracao * circunferencia;
    return fatia;
  });

  return (
    <div className="pizza-wrap">
      <svg viewBox="0 0 200 200" className="pizza-svg">
        <g transform={"rotate(-90 " + centro + " " + centro + ")"}>
          {fatias.map(function (f) {
            return (
              <circle
                key={f.dispositivo}
                cx={centro}
                cy={centro}
                r={raio}
                fill="none"
                stroke={f.cor}
                strokeWidth={raio - raioInterno}
                strokeDasharray={f.comprimento + " " + (circunferencia - f.comprimento)}
                strokeDashoffset={-f.offset}
              >
                <title>
                  {(f.rotulo || nomeAmigavelDispositivo(f.dispositivo)) + ": " + f.total + " (" + f.pct + "%)"}
                </title>
              </circle>
            );
          })}
        </g>
        <text x={centro} y={centro - 6} textAnchor="middle" fontSize="26" fontWeight="800" fill="#fff">
          {totalVisitas}
        </text>
        <text x={centro} y={centro + 16} textAnchor="middle" fontSize="12" fill="#94a3b8">
          visitas
        </text>
      </svg>

      <div className="pizza-legenda">
        {fatias.map(function (f) {
          return (
            <div key={f.dispositivo} className="pizza-legenda-item">
              <span className="ponto" style={{ background: f.cor }} />
              <span className="pizza-legenda-nome">{nomeAmigavelDispositivo(f.dispositivo)}</span>
              <span className="pizza-legenda-valor">
                {f.total} <span className="pizza-legenda-pct">({f.pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TabelaScroll({ scrollProfundidade, visitantesUnicos }) {
  if (!scrollProfundidade || scrollProfundidade.length === 0) {
    return <p className="vazio">Sem dados nesse período.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Rolou até</th>
          <th>Visitantes que chegaram lá</th>
          <th>% dos visitantes únicos</th>
        </tr>
      </thead>
      <tbody>
        {scrollProfundidade.map(function (m) {
          var pct = visitantesUnicos > 0 ? ((m.total / visitantesUnicos) * 100).toFixed(1) : "0.0";
          return (
            <tr key={m.marco}>
              <td>{m.marco}%</td>
              <td>{m.total}</td>
              <td>{pct}%</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SecaoVideo({ video }) {
  return video.plays.map(function (item) {
    var videoId = item.video_id || "video";
    var totalPlays = item.total;

    var completoItem = video.completos.find(function (c) {
      return c.video_id === item.video_id;
    });
    var totalCompletos = completoItem ? completoItem.total : 0;
    var duracaoMedia = completoItem ? Math.round(completoItem.duracao_media_segundos) : null;
    var taxaConclusao = totalPlays > 0 ? ((totalCompletos / totalPlays) * 100).toFixed(1) : "0.0";

    var marcosDoVideo = video.retencao.filter(function (r) {
      return r.video_id === item.video_id;
    });

    return (
      <div key={videoId} style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>{videoId}</h3>

        <div className="cards" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="label">Plays</div>
            <div className="valor">{totalPlays}</div>
          </div>
          <div className="card">
            <div className="label">Assistiram até o fim</div>
            <div className="valor">{totalCompletos}</div>
          </div>
          <div className="card">
            <div className="label">Taxa de conclusão</div>
            <div className="valor">{taxaConclusao}%</div>
          </div>
          {duracaoMedia !== null && (
            <div className="card">
              <div className="label">Duração média assistida</div>
              <div className="valor">{duracaoMedia}s</div>
            </div>
          )}
        </div>

        <table>
          <thead>
            <tr>
              <th>Marco assistido</th>
              <th>Sessões que chegaram lá</th>
              <th>% em relação aos plays</th>
            </tr>
          </thead>
          <tbody>
            {marcosDoVideo.map(function (m) {
              var pct = totalPlays > 0 ? ((m.total / totalPlays) * 100).toFixed(1) : "0.0";
              return (
                <tr key={m.marco}>
                  <td>{m.marco}%</td>
                  <td>{m.total}</td>
                  <td>{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  });
}

function arredondarParaCima(valor) {
  if (valor <= 0) return 1;
  var magnitude = Math.pow(10, Math.floor(Math.log10(valor)));
  var normalizado = valor / magnitude;
  var passo;
  if (normalizado <= 1) passo = 1;
  else if (normalizado <= 2) passo = 2;
  else if (normalizado <= 5) passo = 5;
  else passo = 10;
  return passo * magnitude;
}

var ROTULOS_VIZ = {
  tabela: "Tabela",
  grafico: "Gráfico",
  pizza: "Pizza",
  colunas: "Colunas",
  barras: "Barras",
};

var ICONES_VIZ = {
  tabela: "tabela",
  grafico: "grafico",
  pizza: "pizza",
  colunas: "colunas",
  barras: "barras",
};

function SeletorVisualizacao({ id, valor, aoMudar, opcoes }) {
  var lista = opcoes || ["tabela", "grafico"];
  return (
    <div className="seletor-viz">
      {lista.map(function (op) {
        return (
          <button
            key={op}
            className={"seletor-viz-btn" + (valor === op ? " ativo" : "")}
            onClick={function () {
              aoMudar(id, op);
            }}
          >
            <Icone nome={ICONES_VIZ[op] || "grafico"} tamanho={15} />
            {ROTULOS_VIZ[op] || op}
          </button>
        );
      })}
    </div>
  );
}

var PALETA_GENERICA = [
  "#6366f1",
  "#06b6d4",
  "#f59e0b",
  "#22c55e",
  "#f43f5e",
  "#a78bfa",
  "#38bdf8",
  "#facc15",
  "#fb7185",
  "#34d399",
  "#818cf8",
  "#f472b6",
];

function GraficoPizzaGenerico({ dados }) {
  if (!dados || dados.length === 0) {
    return <p className="vazio">Sem dados nesse período.</p>;
  }

  var total = dados.reduce(function (soma, d) {
    return soma + d.total;
  }, 0);

  var raio = 80;
  var raioInterno = 50;
  var centro = 100;
  var circunferencia = 2 * Math.PI * raio;

  var acumulado = 0;
  var fatias = dados.map(function (d, i) {
    var fracao = total > 0 ? d.total / total : 0;
    var fatia = {
      rotulo: d.rotulo,
      total: d.total,
      pct: total > 0 ? ((d.total / total) * 100).toFixed(1) : "0.0",
      cor: PALETA_GENERICA[i % PALETA_GENERICA.length],
      offset: acumulado,
      comprimento: fracao * circunferencia,
    };
    acumulado += fracao * circunferencia;
    return fatia;
  });

  return (
    <div className="pizza-wrap">
      <svg viewBox="0 0 200 200" className="pizza-svg">
        <g transform={"rotate(-90 " + centro + " " + centro + ")"}>
          {fatias.map(function (f) {
            return (
              <circle
                key={f.rotulo}
                cx={centro}
                cy={centro}
                r={raio}
                fill="none"
                stroke={f.cor}
                strokeWidth={raio - raioInterno}
                strokeDasharray={f.comprimento + " " + (circunferencia - f.comprimento)}
                strokeDashoffset={-f.offset}
              >
                <title>
                  {(f.rotulo || nomeAmigavelDispositivo(f.dispositivo)) + ": " + f.total + " (" + f.pct + "%)"}
                </title>
              </circle>
            );
          })}
        </g>
        <text x={centro} y={centro - 6} textAnchor="middle" fontSize="24" fontWeight="800" fill="#fff">
          {total}
        </text>
        <text x={centro} y={centro + 16} textAnchor="middle" fontSize="12" fill="#94a3b8">
          total
        </text>
      </svg>

      <div className="pizza-legenda">
        {fatias.map(function (f) {
          return (
            <div key={f.rotulo} className="pizza-legenda-item">
              <span className="ponto" style={{ background: f.cor }} />
              <span className="pizza-legenda-nome" title={f.rotulo}>
                {f.rotulo}
              </span>
              <span className="pizza-legenda-valor">
                {f.total} <span className="pizza-legenda-pct">({f.pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GraficoColunasGenerico({ dados }) {
  if (!dados || dados.length === 0) {
    return <p className="vazio">Sem dados nesse período.</p>;
  }

  var largura = 1200;
  var altura = 380;
  var margem = { topo: 30, baixo: 120, esq: 72, dir: 20 };
  var areaLargura = largura - margem.esq - margem.dir;
  var areaAltura = altura - margem.topo - margem.baixo;

  var maiorValor = Math.max(
    1,
    ...dados.map(function (d) {
      return d.total;
    })
  );
  var maxEixo = arredondarParaCima(maiorValor);

  function coordY(valor) {
    return margem.topo + areaAltura - (valor / maxEixo) * areaAltura;
  }

  var n = dados.length;
  var larguraGrupo = areaLargura / n;
  var larguraBarra = Math.max(8, Math.min(60, larguraGrupo * 0.55));

  var linhasGrade = [0, 0.25, 0.5, 0.75, 1].map(function (fracao) {
    return { y: coordY(maxEixo * fracao), rotulo: Math.round(maxEixo * fracao) };
  });

  return (
    <svg viewBox={"0 0 " + largura + " " + altura} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id="col-generico-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="1" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.55" />
        </linearGradient>
        <filter id="sombra-coluna-generica" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>

      {linhasGrade.map(function (linha, i) {
        return (
          <g key={i}>
            <line
              x1={margem.esq}
              y1={linha.y}
              x2={largura - margem.dir}
              y2={linha.y}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="1"
            />
            <text x={margem.esq - 10} y={linha.y + 4} fontSize="19" fill="#64748b" textAnchor="end">
              {linha.rotulo}
            </text>
          </g>
        );
      })}

      {dados.map(function (d, i) {
        var x = margem.esq + i * larguraGrupo + (larguraGrupo - larguraBarra) / 2;
        var y = coordY(d.total);
        var altura2 = margem.topo + areaAltura - y;
        var centroX = x + larguraBarra / 2;
        var baseY = margem.topo + areaAltura + 18;
        var rotuloCurto = d.rotulo.length > 18 ? d.rotulo.slice(0, 18) + "…" : d.rotulo;
        return (
          <g key={d.rotulo + "-" + i} filter="url(#sombra-coluna-generica)">
            <title>{d.rotulo + ": " + d.total}</title>
            <rect
              x={x}
              y={y}
              width={larguraBarra}
              height={Math.max(altura2, 0)}
              rx={Math.min(4, larguraBarra / 2)}
              fill="url(#col-generico-grad)"
            />
            {d.total > 0 && (
              <text x={centroX} y={y - 6} fontSize="16" fill="#cbd5e1" textAnchor="middle">
                {d.total}
              </text>
            )}
            <text
              x={centroX}
              y={baseY}
              fontSize="16"
              fill="#94a3b8"
              textAnchor="end"
              transform={"rotate(-40 " + centroX + " " + baseY + ")"}
            >
              {rotuloCurto}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function GraficoBarrasHorizontais({ dados, cor }) {
  if (!dados || dados.length === 0) {
    return <p className="vazio">Sem dados nesse período.</p>;
  }

  var corBarra = cor || "#6366f1";
  var maxValor = Math.max(
    1,
    ...dados.map(function (d) {
      return d.total;
    })
  );

  return (
    <div className="barras-h">
      {dados.map(function (d, i) {
        var pct = (d.total / maxValor) * 100;
        return (
          <div className="barra-h-linha" key={d.rotulo + "-" + i}>
            <span className="barra-h-rotulo" title={d.rotulo}>
              {d.rotulo}
            </span>
            <div className="barra-h-trilha">
              <div className="barra-h-preenchimento" style={{ width: pct + "%", background: corBarra }} />
            </div>
            <span className="barra-h-valor">{d.total}</span>
          </div>
        );
      })}
    </div>
  );
}

function GraficoBarrasAgrupadasH({ dados }) {
  var chaves = Object.keys(dados);

  if (chaves.length === 0) {
    return <p className="vazio">Sem dados nesse período.</p>;
  }

  var series = [
    { chave: "visita", cor: "#6366f1", nome: "Visitas" },
    { chave: "cliques", cor: "#f59e0b", nome: "Cliques" },
    { chave: "conversao", cor: "#22c55e", nome: "Conversões" },
  ];

  var maxValor = Math.max(
    1,
    ...chaves.map(function (c) {
      var l = dados[c];
      return Math.max(l.visita, l.cliques, l.conversao);
    })
  );

  return (
    <div className="barras-h-agrupadas">
      {chaves.map(function (chave) {
        var linha = dados[chave];
        return (
          <div className="barra-h-grupo" key={chave}>
            <div className="barra-h-grupo-titulo">{chave}</div>
            {series.map(function (s) {
              var valor = linha[s.chave];
              var pct = (valor / maxValor) * 100;
              return (
                <div className="barra-h-linha" key={s.chave}>
                  <span className="barra-h-rotulo-mini">{s.nome}</span>
                  <div className="barra-h-trilha">
                    <div className="barra-h-preenchimento" style={{ width: pct + "%", background: s.cor }} />
                  </div>
                  <span className="barra-h-valor">{valor}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function GraficoColunas({ serieDiaria }) {
  if (!serieDiaria || serieDiaria.length === 0) {
    return <p className="vazio">Sem dados nesse período.</p>;
  }

  // Pivotar: um ponto por dia, com contagem de visita / cliques (qualquer tipo) / conversão
  var porDia = {};
  serieDiaria.forEach(function (linha) {
    var dia = linha.dia.slice(0, 10);
    if (!porDia[dia]) porDia[dia] = { dia: dia, visita: 0, cliques: 0, conversao: 0 };
    if (linha.tipo_evento === "visita") porDia[dia].visita += linha.total;
    else if (linha.tipo_evento === "conversao") porDia[dia].conversao += linha.total;
    else if (ehClique(linha.tipo_evento)) porDia[dia].cliques += linha.total;
  });

  var dias = Object.keys(porDia).sort();
  var pontos = dias.map(function (d) {
    return porDia[d];
  });

  var series = [
    { chave: "visita", cor: "#6366f1", nome: "Visitas" },
    { chave: "cliques", cor: "#f59e0b", nome: "Cliques" },
    { chave: "conversao", cor: "#22c55e", nome: "Conversões" },
  ];

  var largura = 1200;
  var altura = 380;
  var margem = { topo: 30, baixo: 52, esq: 72, dir: 20 };
  var areaLargura = largura - margem.esq - margem.dir;
  var areaAltura = altura - margem.topo - margem.baixo;

  var maiorValor = Math.max(
    1,
    ...pontos.map(function (p) {
      return Math.max(p.visita, p.cliques, p.conversao);
    })
  );
  var maxEixo = arredondarParaCima(maiorValor);

  function coordY(valor) {
    return margem.topo + areaAltura - (valor / maxEixo) * areaAltura;
  }

  // Cada dia ganha uma "fatia" de largura igual; dentro dela, uma coluna por série
  var larguraGrupo = pontos.length > 0 ? areaLargura / pontos.length : areaLargura;
  var espacamentoGrupo = Math.min(28, larguraGrupo * 0.18);
  var larguraGrupoUtil = larguraGrupo - espacamentoGrupo;
  var larguraColuna = Math.max(2, larguraGrupoUtil / series.length - 4);

  function coordXGrupo(i) {
    return margem.esq + i * larguraGrupo + espacamentoGrupo / 2;
  }

  var passoRotulo = Math.max(1, Math.ceil(pontos.length / 10));

  // Linhas de grade horizontais — 0%, 25%, 50%, 75%, 100% do eixo
  var linhasGrade = [0, 0.25, 0.5, 0.75, 1].map(function (fracao) {
    return { y: coordY(maxEixo * fracao), rotulo: Math.round(maxEixo * fracao) };
  });

  var mostrarRotuloValor = pontos.length <= 20;

  return (
    <div>
      <svg viewBox={"0 0 " + largura + " " + altura} style={{ width: "100%", height: "auto", display: "block" }}>
        <defs>
          {series.map(function (s) {
            return (
              <linearGradient key={s.chave} id={"col-gradiente-" + s.chave} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.cor} stopOpacity="1" />
                <stop offset="100%" stopColor={s.cor} stopOpacity="0.55" />
              </linearGradient>
            );
          })}
          <filter id="sombra-coluna" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.35" />
          </filter>
        </defs>

        {/* Grade horizontal + rótulos do eixo Y */}
        {linhasGrade.map(function (linha, i) {
          return (
            <g key={i}>
              <line
                x1={margem.esq}
                y1={linha.y}
                x2={largura - margem.dir}
                y2={linha.y}
                stroke="rgba(255,255,255,0.07)"
                strokeWidth="1"
              />
              <text x={margem.esq - 10} y={linha.y + 4} fontSize="19" fill="#64748b" textAnchor="end">
                {linha.rotulo}
              </text>
            </g>
          );
        })}

        {/* Colunas agrupadas por dia */}
        {pontos.map(function (p, i) {
          var xBase = coordXGrupo(i);
          return (
            <g key={p.dia} filter="url(#sombra-coluna)">
              <title>
                {p.dia.slice(8, 10) + "/" + p.dia.slice(5, 7) + ": " + p.visita + " visitas, " + p.cliques + " cliques, " + p.conversao + " conversões"}
              </title>
              {series.map(function (s, j) {
                var valor = p[s.chave];
                var yTopo = coordY(valor);
                var alturaColuna = margem.topo + areaAltura - yTopo;
                var x = xBase + j * (larguraColuna + 4);
                return (
                  <g key={s.chave}>
                    <rect
                      x={x}
                      y={alturaColuna > 0 ? yTopo : margem.topo + areaAltura}
                      width={larguraColuna}
                      height={Math.max(alturaColuna, 0)}
                      rx={Math.min(4, larguraColuna / 2)}
                      fill={"url(#col-gradiente-" + s.chave + ")"}
                    />
                    {mostrarRotuloValor && valor > 0 && (
                      <text
                        x={x + larguraColuna / 2}
                        y={yTopo - 6}
                        fontSize="16"
                        fill="#cbd5e1"
                        textAnchor="middle"
                      >
                        {valor}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Rótulos do eixo X (datas) */}
        {pontos.map(function (p, i) {
          return i % passoRotulo === 0 ? (
            <text
              key={p.dia}
              x={coordXGrupo(i) + larguraGrupoUtil / 2}
              y={altura - 10}
              fontSize="19"
              fill="#94a3b8"
              textAnchor="middle"
            >
              {p.dia.slice(8, 10) + "/" + p.dia.slice(5, 7)}
            </text>
          ) : null;
        })}
      </svg>

      <div className="grafico-legenda">
        {series.map(function (s) {
          return (
            <span key={s.chave}>
              <span className="ponto" style={{ background: s.cor }} />
              {s.nome}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function TabelaAgrupada({ dados, detalhamento }) {
  const chaves = Object.keys(dados);
  const [linhasAbertas, setLinhasAbertas] = useState({});

  if (chaves.length === 0) {
    return <p className="vazio">Sem dados nesse período.</p>;
  }

  function alternarLinha(chave) {
    setLinhasAbertas(function (atual) {
      var novo = Object.assign({}, atual);
      novo[chave] = !novo[chave];
      return novo;
    });
  }

  return (
    <table>
      <thead>
        <tr>
          <th></th>
          <th>Visitas</th>
          <th>Cliques</th>
          <th>Conversões</th>
        </tr>
      </thead>
      <tbody>
        {chaves.map(function (chave) {
          const linha = dados[chave];
          const itensDetalhe = detalhamento && detalhamento[chave];
          const temDetalhe = itensDetalhe && itensDetalhe.length > 0;
          const aberta = !!linhasAbertas[chave];

          return (
            <Fragment key={chave}>
              <tr>
                <td>
                  {temDetalhe && (
                    <button
                      className="link-acao"
                      style={{ marginRight: 8 }}
                      onClick={function () {
                        alternarLinha(chave);
                      }}
                    >
                      {aberta ? "▾" : "▸"}
                    </button>
                  )}
                  {chave}
                </td>
                <td>{linha.visita}</td>
                <td>{linha.cliques}</td>
                <td>{linha.conversao}</td>
              </tr>
              {temDetalhe && aberta && (
                <tr>
                  <td colSpan="4" className="linha-detalhe">
                    <div className="detalhe-titulo">Botões clicados por quem veio de "{chave}"</div>
                    <table className="tabela-aninhada">
                      <thead>
                        <tr>
                          <th>Botão / rótulo</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itensDetalhe.map(function (d, i) {
                          return (
                            <tr key={i}>
                              <td>
                                {nomeAmigavelEvento(d.tipo_evento)} — {d.rotulo}
                              </td>
                              <td>{d.total}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// --- Funil: visitantes únicos que chegaram em cada etapa ---
function Funil({ funil, meta }) {
  if (!funil || !funil.visitantes) {
    return <p className="vazio">Sem visitantes nesse período.</p>;
  }

  var etapas;
  var nota = null;
  if (meta === "whatsapp") {
    // Visitou -> clicou no WhatsApp -> WhatsApp abriu de verdade
    etapas = [
      { nome: "Visitaram a página", n: funil.visitantes, cor: "#6366f1" },
      { nome: "Clicaram no WhatsApp", n: funil.comCliqueWhatsapp || 0, cor: "#06b6d4" },
    ];
    if (funil.whatsappVerificados > 0) {
      // A % desta etapa é sobre quem teve a abertura MEDIDA (não sobre todos que clicaram).
      etapas.push({
        nome: "Abriram o WhatsApp",
        n: funil.whatsappAbriram || 0,
        cor: "#22c55e",
        passoFixo: (funil.whatsappAbriram / funil.whatsappVerificados) * 100,
        textoPasso: "dos que tiveram a abertura medida",
      });
      if (funil.whatsappVerificados < (funil.comCliqueWhatsapp || 0)) {
        nota =
          "A abertura foi medida em " + fmtN(funil.whatsappVerificados) + " dos " + fmtN(funil.comCliqueWhatsapp) +
          " visitantes que clicaram; os demais clicaram antes de a LP passar a usar a versão nova do tracker.js.";
      }
    } else if ((funil.comCliqueWhatsapp || 0) > 0) {
      nota = "A abertura do WhatsApp ainda não foi medida: a LP precisa carregar o tracker.js atualizado.";
    }
  } else {
    etapas = [
      { nome: "Visitaram a página", n: funil.visitantes, cor: "#6366f1" },
      { nome: "Clicaram em algum botão", n: funil.comClique, cor: "#06b6d4" },
    ];
    // Com meta, a etapa da meta aparece sempre (mesmo zerada); sem meta, só quando existe.
    if (meta === "card_criado" || funil.comCard > 0) etapas.push({ nome: "Criaram um card", n: funil.comCard, cor: "#14b8a6" });
    if (meta === "conversao" || funil.comConversao > 0) etapas.push({ nome: "Converteram", n: funil.comConversao, cor: "#22c55e" });
  }

  return (
    <div>
    <div className="funil">
      {etapas.map(function (e, i) {
        var pctTotal = Math.min(100, (e.n / funil.visitantes) * 100);
        var anterior = i > 0 ? etapas[i - 1].n : null;
        var passo = e.passoFixo != null ? e.passoFixo : anterior && e.n <= anterior ? (e.n / anterior) * 100 : null;
        return (
          <div className="funil-etapa" key={e.nome}>
            <span className="funil-nome">{e.nome}</span>
            <div className="funil-trilha">
              <div className="funil-barra" style={{ width: Math.max(pctTotal, 1.5) + "%", background: e.cor }} />
            </div>
            <div className="funil-numeros">
              <span className="funil-valor">{fmtN(e.n)}</span>
              <span className="funil-info">{fmtPct1(pctTotal)} dos visitantes</span>
              {passo != null && <span className="funil-info">{fmtPct1(passo)} {e.textoPasso || "da etapa anterior"}</span>}
            </div>
          </div>
        );
      })}
    </div>
    {nota && (
      <p className="valor-secundario" style={{ marginTop: 14 }}>
        {nota}
      </p>
    )}
    </div>
  );
}

// --- Mapa de calor: visitas por dia da semana x hora do dia ---
var DIAS_SEMANA = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];

function MapaCalor({ dados, fuso }) {
  if (!dados || dados.length === 0) {
    return <p className="vazio">Sem visitas nesse período.</p>;
  }

  // MySQL: DAYOFWEEK 1 = domingo ... 7 = sábado. Aqui a semana começa na segunda.
  var matriz = [];
  for (var d = 0; d < 7; d++) {
    matriz.push([]);
    for (var h = 0; h < 24; h++) matriz[d].push(0);
  }
  var maximo = 0;
  dados.forEach(function (l) {
    var linha = (l.dow + 5) % 7;
    if (l.hora >= 0 && l.hora < 24) {
      matriz[linha][l.hora] += l.total;
      if (matriz[linha][l.hora] > maximo) maximo = matriz[linha][l.hora];
    }
  });

  var horas = [];
  for (var i = 0; i < 24; i++) horas.push(i);

  return (
    <div>
      <div className="mapa-calor" role="img" aria-label="Mapa de calor das visitas por dia da semana e hora">
        <span />
        {horas.map(function (hora) {
          return (
            <span key={"h" + hora} className="mapa-calor-hora">
              {hora % 3 === 0 ? hora + "h" : ""}
            </span>
          );
        })}
        {matriz.map(function (linha, di) {
          return (
            <Fragment key={di}>
              <span className="mapa-calor-dia">{DIAS_SEMANA[di].slice(0, 3)}</span>
              {linha.map(function (valor, hora) {
                var p = valor > 0 ? Math.max(12, Math.round((valor / maximo) * 100)) : 0;
                return (
                  <span
                    key={hora}
                    className="mapa-calor-celula"
                    style={{ "--p": p + "%" }}
                    title={DIAS_SEMANA[di] + ", " + hora + "h: " + valor + (valor === 1 ? " visita" : " visitas")}
                  />
                );
              })}
            </Fragment>
          );
        })}
      </div>
      <div className="mapa-calor-legenda">
        <span>menos visitas</span>
        <span className="mapa-calor-escala" />
        <span>mais visitas (pico: {fmtN(maximo)} numa hora)</span>
      </div>
      <p className="valor-secundario" style={{ marginTop: 8 }}>
        Horas no {nomeFuso(fuso ? fuso.exibicaoMin : null)}.
      </p>
    </div>
  );
}

// --- Geografia: estados e cidades dos visitantes ---
function LinhaGeo({ nome, visitantes, cards, maximo }) {
  var largura = maximo > 0 ? Math.max(2, (visitantes / maximo) * 100) : 0;
  return (
    <div
      className="barra-h-linha"
      title={nome + ": " + fmtN(visitantes) + (visitantes === 1 ? " visitante" : " visitantes") + (cards > 0 ? ", " + cards + (cards === 1 ? " card" : " cards") : "")}
    >
      <span className="barra-h-rotulo">
        {nome}
        {cards > 0 && (
          <span className="geo-cards">
            {" "}
            · {cards} {cards === 1 ? "card" : "cards"}
          </span>
        )}
      </span>
      <div className="barra-h-trilha">
        <div className="barra-h-preenchimento" style={{ width: largura + "%", background: "#6366f1" }} />
      </div>
      <span className="barra-h-valor">{fmtN(visitantes)}</span>
    </div>
  );
}

function Geografia({ geo, totalVisitantes }) {
  if (!geo || !geo.disponivel) {
    return (
      <EstadoVazio
        titulo="A localização ainda não está ativada"
        texto="Rode o db/migration-5.sql no banco. Depois disso, cada visitante novo passa a ter país, estado e cidade (o IP não é guardado)."
      />
    );
  }
  if (geo.porEstado.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhum visitante com localização neste período"
        texto="Só quem chegou depois de ativar a localização tem esse dado; os eventos antigos ficam sem. Se já passou tempo desde a ativação, confira a tela Saúde do tracking."
      />
    );
  }

  var maxEstado = geo.porEstado.reduce(function (m, e) {
    return Math.max(m, e.visitantes);
  }, 0);
  var maxCidade = geo.porCidade.reduce(function (m, c) {
    return Math.max(m, c.visitantes);
  }, 0);
  var cobertura = totalVisitantes > 0 ? Math.min(100, (geo.visitantesComLocalizacao / totalVisitantes) * 100) : null;

  return (
    <div>
      {cobertura !== null && (
        <p className="valor-secundario" style={{ marginTop: 0, marginBottom: 16 }}>
          Localização identificada em <strong>{fmtPct1(cobertura)}</strong> dos visitantes únicos do período.
        </p>
      )}
      <div className="geo-grid">
        <div>
          <h3 className="grafico-subtitulo">Estados</h3>
          <div className="barras-h">
            {geo.porEstado.slice(0, 10).map(function (e) {
              return (
                <LinhaGeo
                  key={(e.pais || "") + e.estado}
                  nome={nomeEstado(e.pais, e.estado)}
                  visitantes={e.visitantes}
                  cards={e.cards}
                  maximo={maxEstado}
                />
              );
            })}
          </div>
        </div>
        <div>
          <h3 className="grafico-subtitulo">Cidades</h3>
          {geo.porCidade.length === 0 ? (
            <p className="vazio">Sem cidades identificadas neste período.</p>
          ) : (
            <div className="barras-h">
              {geo.porCidade.slice(0, 10).map(function (c) {
                return (
                  <LinhaGeo
                    key={(c.pais || "") + (c.estado || "") + c.cidade}
                    nome={nomeCidade(c.pais, c.estado, c.cidade)}
                    visitantes={c.visitantes}
                    cards={c.cards}
                    maximo={maxCidade}
                  />
                );
              })}
            </div>
          )}
          <p className="valor-secundario" style={{ marginTop: 12 }}>
            A cidade é aproximada: em celular, a operadora às vezes indica outra cidade da região. O estado é mais confiável.
          </p>
        </div>
      </div>
    </div>
  );
}
