import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Relogio from "../components/Relogio";

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

export default function Dashboard() {
  const router = useRouter();

  function sair() {
    fetch("/api/logout", { method: "POST" }).finally(function () {
      router.push("/login");
    });
  }

  const [sites, setSites] = useState([]);
  const [siteSelecionado, setSiteSelecionado] = useState("");
  const [secoesFechadas, setSecoesFechadas] = useState({});
  const [visualizacoes, setVisualizacoes] = useState({});
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
  const [modoTV, setModoTV] = useState(false);

  // Lê a preferência salva no navegador ao carregar (só no cliente, pra
  // não dar erro de hidratação comparando servidor x navegador)
  useEffect(function () {
    try {
      var salvo = localStorage.getItem("relinq_modo_tv");
      if (salvo === "1") setModoTV(true);
    } catch (e) {}
  }, []);

  useEffect(
    function () {
      document.body.classList.toggle("modo-tv", modoTV);
      try {
        localStorage.setItem("relinq_modo_tv", modoTV ? "1" : "0");
      } catch (e) {}
    },
    [modoTV]
  );
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

  const visitas = stats ? somarPorTipo(stats.totaisPorTipo, "visita") : 0;
  const conversoes = stats ? somarPorTipo(stats.totaisPorTipo, "conversao") : 0;
  const quizzesFinalizados = stats ? somarPorTipo(stats.totaisPorTipo, "quiz_finalizado") : 0;
  const eventosQuiz = stats
    ? stats.totaisPorTipo.filter(function (t) {
        return t.tipo_evento.indexOf("quiz_") === 0 && t.tipo_evento !== "quiz_finalizado";
      })
    : [];
  const cliquesTotais = stats ? somarTodosCliques(stats.totaisPorTipo) : 0;
  const taxaConversao = visitas > 0 ? ((conversoes / visitas) * 100).toFixed(1) : "0.0";

  const origemAgrupada = stats ? agruparPorChave(stats.porOrigem, "utm_source") : {};
  const campanhaAgrupada = stats ? agruparPorChave(stats.porCampanha, "utm_campaign") : {};
  const criativoAgrupado = stats ? agruparPorChave(stats.porCriativo, "utm_content") : {};

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

  function alternarSecao(id) {
    setSecoesFechadas(function (atual) {
      var novo = Object.assign({}, atual);
      novo[id] = !novo[id];
      return novo;
    });
  }

  return (
    <div className="container">
      <div className="header">
        <div className="header-titulo">
          <img
            src="https://lightblue-monkey-580531.hostingersite.com/wp-content/uploads/2026/09/logo-removebg-preview.png"
            alt="Relinq"
            className="logo-relinq"
          />
          <h1>Relinq Tracker</h1>
        </div>
        <div className="nav">
          <Link href="/visao-geral">Visão geral</Link>
          <Link href="/jornada">Jornada do visitante</Link>
          <Link href="/sites">+ Cadastrar LP</Link>
          <button
            className={"btn-modo-tv" + (modoTV ? " ativo" : "")}
            onClick={function () {
              setModoTV(!modoTV);
            }}
          >
            📺 {modoTV ? "Sair do Modo TV" : "Modo TV"}
          </button>
          <button className="btn-sair" onClick={sair}>Sair</button>
        </div>
      </div>
      <p className="atualizacao-automatica">
        Atualiza automaticamente a cada 10s <Relogio />
      </p>

      {sites.length === 0 ? (
        <p className="vazio">
          Nenhuma LP cadastrada ainda. <Link href="/sites">Cadastre a primeira aqui</Link>.
        </p>
      ) : (
        <>
          <div className="filtros">
            <select
              value={siteSelecionado}
              onChange={function (e) {
                setSiteSelecionado(e.target.value);
              }}
            >
              <option value="todas">📊 Todas as LPs juntas</option>
              {sites.map(function (s) {
                return (
                  <option key={s.slug} value={s.slug}>
                    {s.nome}
                  </option>
                );
              })}
            </select>
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

          {carregando && <p className="vazio">Carregando...</p>}

          {!carregando && stats && (
            <>
              <div className="cards">
                <div className="card" style={{ "--acento": "#6366f1" }}>
                  <div className="label">Visitas</div>
                  <div className="valor">{visitas}</div>
                </div>
                <div className="card" style={{ "--acento": "#06b6d4" }}>
                  <div className="label">Visitantes únicos</div>
                  <div className="valor">{stats.engajamento.visitantesUnicos}</div>
                </div>
                <div className="card" style={{ "--acento": "#f59e0b" }}>
                  <div className="label">Cliques (todos os tipos)</div>
                  <div className="valor">{cliquesTotais}</div>
                </div>
                <div className="card" style={{ "--acento": "#22c55e" }}>
                  <div className="label">Conversões</div>
                  <div className="valor">{conversoes}</div>
                </div>
                {quizzesFinalizados > 0 && (
                  <div className="card" style={{ "--acento": "#38bdf8" }}>
                    <div className="label">Quizzes finalizados</div>
                    <div className="valor">{quizzesFinalizados}</div>
                  </div>
                )}
                <div className="card" style={{ "--acento": "#22c55e" }}>
                  <div className="label">Taxa de conversão</div>
                  <div className="valor">{taxaConversao}%</div>
                </div>
                <div className="card" style={{ "--acento": "#f43f5e" }}>
                  <div className="label">Taxa de rejeição</div>
                  <div className="valor">{stats.engajamento.taxaRejeicao}%</div>
                </div>
                <div className="card" style={{ "--acento": "#a78bfa" }}>
                  <div className="label">Tempo médio na página</div>
                  <div className="valor">
                    {stats.engajamento.tempoMedioSegundos !== null
                      ? stats.engajamento.tempoMedioSegundos + "s"
                      : "-"}
                  </div>
                </div>
              </div>

              <div className="graficos-topo">
                <Secao id="grafico" titulo="Visitas por dia" aberta={!secoesFechadas.grafico} aoAlternar={alternarSecao}>
                  <GraficoColunas serieDiaria={stats.serieDiaria} />
                </Secao>

                <Secao id="dispositivo" titulo="Dispositivo" aberta={!secoesFechadas.dispositivo} aoAlternar={alternarSecao}>
                  <GraficoPizza porDispositivo={stats.engajamento.porDispositivo} totalVisitas={visitas} />
                </Secao>
              </div>

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
                      placeholder="🔎 Filtrar por tipo ou botão..."
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
                    <SeletorVisualizacao
                      id="rotulo"
                      valor={vizAtual("rotulo")}
                      aoMudar={mudarViz}
                      opcoes={["tabela", "pizza", "colunas", "barras"]}
                    />
                  }
                >
                  {(function () {
                    var dadosGrafico = cliquesPorRotuloFiltrado.map(function (c) {
                      return { rotulo: nomeAmigavelEvento(c.tipo_evento) + " — " + c.rotulo, total: c.total };
                    });
                    var v = vizAtual("rotulo");
                    if (v === "pizza") return <GraficoPizzaGenerico dados={dadosGrafico} />;
                    if (v === "colunas") return <GraficoColunasGenerico dados={dadosGrafico} />;
                    if (v === "barras") return <GraficoBarrasHorizontais dados={dadosGrafico} />;
                    return <TabelaRotulo cliquesPorRotulo={cliquesPorRotuloFiltrado} />;
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
                  <TabelaAgrupada dados={criativoAgrupado} />
                )}
              </Secao>

              {stats.video && stats.video.plays.length > 0 && (
                <Secao id="video" titulo="Vídeo (VSL)" aberta={!secoesFechadas.video} aoAlternar={alternarSecao}>
                  <SecaoVideo video={stats.video} />
                </Secao>
              )}

              {eventosQuiz.length > 0 && (
                <Secao id="quiz" titulo="Eventos do quiz" aberta={!secoesFechadas.quiz} aoAlternar={alternarSecao}>
                  <p className="vazio" style={{ marginBottom: 14 }}>
                    Capturados automaticamente do dataLayer da ferramenta de quiz.
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Evento</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventosQuiz.map(function (ev) {
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
    </div>
  );
}

function Secao({ titulo, aberta, aoAlternar, id, extra, children }) {
  return (
    <div className="secao">
      <div className="secao-cabecalho">
        <h2
          onClick={function () {
            aoAlternar(id);
          }}
        >
          {titulo}
          <span className={"secao-seta" + (aberta ? "" : " fechada")}>▾</span>
        </h2>
        {extra}
      </div>
      {aberta && children}
    </div>
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

function TabelaRotulo({ cliquesPorRotulo }) {
  var porTipo = {};
  cliquesPorRotulo.forEach(function (c) {
    if (!porTipo[c.tipo_evento]) porTipo[c.tipo_evento] = [];
    porTipo[c.tipo_evento].push(c);
  });

  return (
    <table>
      <thead>
        <tr>
          <th>Tipo de clique</th>
          <th>Botão / rótulo</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {Object.keys(porTipo).map(function (tipo) {
          return porTipo[tipo].map(function (c, i) {
            return (
              <tr key={tipo + "-" + c.rotulo}>
                <td>{i === 0 ? nomeAmigavelEvento(tipo) : ""}</td>
                <td>{c.rotulo}</td>
                <td>{c.total}</td>
              </tr>
            );
          });
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
              />
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
  tabela: "☰ Tabela",
  grafico: "📊 Gráfico",
  pizza: "🥧 Pizza",
  colunas: "📈 Colunas",
  barras: "▤ Barras",
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
              />
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
  var altura = 340;
  var margem = { topo: 24, baixo: 90, esq: 48, dir: 20 };
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
            <text x={margem.esq - 10} y={linha.y + 4} fontSize="12" fill="#64748b" textAnchor="end">
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
            <rect
              x={x}
              y={y}
              width={larguraBarra}
              height={Math.max(altura2, 0)}
              rx={Math.min(4, larguraBarra / 2)}
              fill="url(#col-generico-grad)"
            />
            {d.total > 0 && (
              <text x={centroX} y={y - 6} fontSize="11" fill="#cbd5e1" textAnchor="middle">
                {d.total}
              </text>
            )}
            <text
              x={centroX}
              y={baseY}
              fontSize="11"
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
  var altura = 340;
  var margem = { topo: 24, baixo: 36, esq: 48, dir: 20 };
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
              <text x={margem.esq - 10} y={linha.y + 4} fontSize="12" fill="#64748b" textAnchor="end">
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
                        fontSize="11"
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
              fontSize="12"
              fill="#94a3b8"
              textAnchor="middle"
            >
              {p.dia.slice(5)}
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

function TabelaAgrupada({ dados }) {
  const chaves = Object.keys(dados);

  if (chaves.length === 0) {
    return <p className="vazio">Sem dados nesse período.</p>;
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
          return (
            <tr key={chave}>
              <td>{chave}</td>
              <td>{linha.visita}</td>
              <td>{linha.cliques}</td>
              <td>{linha.conversao}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
