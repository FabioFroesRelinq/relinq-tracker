import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Relogio from "../components/Relogio";
import Icone from "../components/Icones";
import CartaoKpi, { Sparkline } from "../components/CartaoKpi";
import { PontoLP, corDaLP } from "../components/coresLP";
import { ResumoPainel } from "../components/Resumo";
import AvisosCards from "../components/AvisosCards";
import nomeFuso from "../components/nomeFuso";
import useAvisoCards, { tocarSom } from "../components/useAvisoCards";
import estilos from "../styles/tv.module.css";

var PERIODOS = [
  { id: "hoje", rotulo: "Hoje", dias: 0 },
  { id: "7d", rotulo: "7 dias", dias: 7 },
  { id: "30d", rotulo: "30 dias", dias: 30 },
];
var INTERVALOS = [10, 20, 30];
var CHAVE_CFG = "relinq_tv_cfg";

var nf = new Intl.NumberFormat("pt-BR");

function fmtN(n) {
  return n == null ? "—" : nf.format(n);
}

function fmtPct1(n) {
  return n.toFixed(1).replace(".", ",") + "%";
}

function formatarData(date) {
  return date.toISOString().slice(0, 10);
}

function somarDiasStr(str, n) {
  var d = new Date(str + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function listarDias(inicio, fim) {
  var total = Math.round((new Date(fim + "T00:00:00Z") - new Date(inicio + "T00:00:00Z")) / 86400000) + 1;
  var lista = [];
  for (var i = 0; i < Math.min(400, Math.max(1, total)); i++) lista.push(somarDiasStr(inicio, i));
  return lista;
}

function total(s, tipo) {
  var item = s.totaisPorTipo.find(function (t) {
    return t.tipo_evento === tipo;
  });
  return item ? item.total : 0;
}

function serie(s, chave) {
  var mapa = {};
  (s.serieKpi || []).forEach(function (l) {
    mapa[l.dia] = l[chave];
  });
  return listarDias(s.periodo.inicio, s.periodo.fim).map(function (d) {
    return mapa[d] || 0;
  });
}

// Números que o resumo usa (mesmo formato do painel principal).
function kpisTV(s) {
  var visitas = total(s, "visita");
  var conversoes = total(s, "conversao");
  var visitantes = s.engajamento.visitantesUnicos;
  return {
    visitantes: visitantes,
    cliques: s.totaisPorTipo
      .filter(function (t) { return t.tipo_evento.indexOf("clique_") === 0; })
      .reduce(function (soma, t) { return soma + t.total; }, 0),
    conversoes: conversoes,
    cards: total(s, "card_criado"),
    taxaCards: visitantes > 0 ? ((s.engajamento.visitantesComCard || 0) / visitantes) * 100 : 0,
    taxaConversao: visitas > 0 ? (conversoes / visitas) * 100 : 0,
  };
}

// Período de mesma duração colado logo antes do escolhido.
function periodoAnterior(inicio, fim) {
  var dias = listarDias(inicio, fim).length;
  var novoFim = somarDiasStr(inicio, -1);
  return { inicio: somarDiasStr(novoFim, -(dias - 1)), fim: novoFim };
}

function haQuanto(min) {
  if (min < 1) return "agora";
  if (min < 60) return "há " + min + " min";
  return "há " + Math.floor(min / 60) + " h";
}

function nomeClique(tipo) {
  var resto = tipo.replace("clique_", "").replace(/_/g, " ");
  return resto.charAt(0).toUpperCase() + resto.slice(1);
}

// Modo TV: um painel de números grandes que alterna sozinho entre as LPs.
export default function ModoTV() {
  const [sites, setSites] = useState([]);
  // Avisos de "Novo card criado" + faixa com os últimos cards de hoje
  const avisosTv = useAvisoCards({ comRecentes: true });
  const [indice, setIndice] = useState(0);
  const [periodo, setPeriodo] = useState("7d");
  const [intervalo, setIntervalo] = useState(20);
  // Padrão: mostra "Todas as LPs" e fica parado. Quem quiser que alterne aperta o play.
  const [pausado, setPausado] = useState(true);
  const [selecionadas, setSelecionadas] = useState(null); // slugs escolhidos; null = padrão
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef(null);
  const menuAbertoRef = useRef(false);
  const [cache, setCache] = useState({});
  const [cacheAnt, setCacheAnt] = useState({});
  const [controlesVisiveis, setControlesVisiveis] = useState(true);
  const temporizador = useRef(null);

  // Preferências salvas neste navegador
  useEffect(function () {
    try {
      var salvo = JSON.parse(localStorage.getItem(CHAVE_CFG) || "null");
      if (salvo) {
        if (PERIODOS.some(function (p) { return p.id === salvo.periodo; })) setPeriodo(salvo.periodo);
        if (INTERVALOS.indexOf(salvo.intervalo) >= 0) setIntervalo(salvo.intervalo);
        if (Array.isArray(salvo.lps) && salvo.lps.every(function (s) { return typeof s === "string"; })) {
          setSelecionadas(salvo.lps);
        }
      }
    } catch (e) {}
  }, []);

  useEffect(
    function () {
      try {
        localStorage.setItem(CHAVE_CFG, JSON.stringify({ periodo: periodo, intervalo: intervalo, lps: selecionadas }));
      } catch (e) {}
    },
    [periodo, intervalo, selecionadas]
  );

  useEffect(function () {
    fetch("/api/sites")
      .then(function (r) {
        return r.json();
      })
      .then(function (lista) {
        if (Array.isArray(lista)) setSites(lista);
      });
  }, []);

  // Opções: "todas as LPs" (soma, se houver mais de uma) + cada LP.
  var opcoes = sites.length > 1 ? [{ slug: "todas", nome: "Todas as LPs" }].concat(sites) : sites;
  var escolhidas =
    selecionadas === null
      ? opcoes.length > 0
        ? [opcoes[0].slug]
        : []
      : selecionadas.filter(function (s) {
          return opcoes.some(function (o) {
            return o.slug === s;
          });
        });
  if (escolhidas.length === 0 && opcoes.length > 0) escolhidas = [opcoes[0].slug];

  // Slides: só o que foi marcado, na ordem do menu.
  var slides = opcoes.filter(function (o) {
    return escolhidas.indexOf(o.slug) >= 0;
  });
  var slide = slides.length > 0 ? slides[indice % slides.length] : null;
  var cfgPeriodo = PERIODOS.filter(function (p) { return p.id === periodo; })[0] || PERIODOS[1];
  var inicio = formatarData(new Date(Date.now() - cfgPeriodo.dias * 24 * 60 * 60 * 1000));
  var fim = formatarData(new Date());
  var chaveCache = slide ? slide.slug + "|" + periodo : null;

  var carregar = useCallback(
    function (slug, chave) {
      fetch("/api/stats?site=" + slug + "&inicio=" + inicio + "&fim=" + fim)
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (dados) {
          if (dados && dados.totaisPorTipo) {
            setCache(function (c) {
              var novo = Object.assign({}, c);
              novo[chave] = dados;
              return novo;
            });
          }
        })
        .catch(function () {});
    },
    [inicio, fim]
  );

  // Busca os dados do slide atual ao entrar nele e atualiza a cada 30s.
  useEffect(
    function () {
      if (!slide) return;
      carregar(slide.slug, chaveCache);
      var id = setInterval(function () {
        carregar(slide.slug, chaveCache);
      }, 30000);
      return function () {
        clearInterval(id);
      };
    },
    [chaveCache, carregar] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Período anterior (pra variação do resumo): uma busca por LP e período,
  // sem repetir a cada 30s, porque o período anterior já terminou.
  // Em "Hoje" o corte é "ontem até agora", então renova a cada minuto.
  useEffect(
    function () {
      if (!slide) return;
      var ehHoje = inicio === fim;
      if (!ehHoje && cacheAnt[chaveCache] !== undefined) return;
      var chave = chaveCache;
      var p = periodoAnterior(inicio, fim);

      function buscar() {
        fetch("/api/stats?site=" + slide.slug + "&inicio=" + p.inicio + "&fim=" + p.fim + (ehHoje ? "&ateAgora=1" : ""))
          .then(function (r) {
            return r.ok ? r.json() : null;
          })
          .then(function (dados) {
            setCacheAnt(function (c) {
              var novo = Object.assign({}, c);
              novo[chave] = dados && dados.totaisPorTipo ? dados : null;
              return novo;
            });
          })
          .catch(function () {});
      }

      buscar();
      var id = ehHoje ? setInterval(buscar, 60000) : null;
      return function () {
        if (id) clearInterval(id);
      };
    },
    [chaveCache] // eslint-disable-line react-hooks/exhaustive-deps
  );

  var chaveSelecao = escolhidas.join(",");
  useEffect(
    function () {
      setIndice(0);
    },
    [chaveSelecao]
  );

  function alternarLP(slug) {
    var atual = escolhidas.slice();
    var pos = atual.indexOf(slug);
    if (pos >= 0) {
      if (atual.length === 1) return; // sempre fica pelo menos uma
      atual.splice(pos, 1);
    } else {
      atual.push(slug);
    }
    setSelecionadas(atual);
  }

  function marcarTodas() {
    setSelecionadas(
      opcoes.map(function (o) {
        return o.slug;
      })
    );
  }

  // Menu de LPs: fecha ao clicar fora e com Esc
  useEffect(
    function () {
      menuAbertoRef.current = menuAberto;
      if (!menuAberto) return;
      function fora(e) {
        if (menuRef.current && !menuRef.current.contains(e.target)) setMenuAberto(false);
      }
      document.addEventListener("mousedown", fora);
      return function () {
        document.removeEventListener("mousedown", fora);
      };
    },
    [menuAberto]
  );

  // Rotação automática
  useEffect(
    function () {
      if (pausado || slides.length < 2) return;
      var id = setInterval(function () {
        setIndice(function (i) {
          return (i + 1) % slides.length;
        });
      }, intervalo * 1000);
      return function () {
        clearInterval(id);
      };
    },
    [pausado, intervalo, slides.length, indice]
  );

  function avancar(passo) {
    if (slides.length === 0) return;
    setIndice(function (i) {
      return (i + passo + slides.length) % slides.length;
    });
  }

  function telaCheia() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    }
  }

  // Controles somem quando o mouse fica parado
  function mostrarControles() {
    setControlesVisiveis(true);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(function () {
      if (menuAbertoRef.current) return; // com o menu aberto os controles ficam
      setControlesVisiveis(false);
    }, 3500);
  }

  useEffect(function () {
    mostrarControles();
    function tecla(e) {
      if (e.key === "Escape") setMenuAberto(false);
      else if (e.key === "ArrowRight") avancar(1);
      else if (e.key === "ArrowLeft") avancar(-1);
      else if (e.key === " ") {
        e.preventDefault();
        setPausado(function (p) {
          return !p;
        });
      } else if (e.key === "f" || e.key === "F") telaCheia();
      mostrarControles();
    }
    window.addEventListener("keydown", tecla);
    return function () {
      window.removeEventListener("keydown", tecla);
      clearTimeout(temporizador.current);
    };
  }, [slides.length]); // eslint-disable-line react-hooks/exhaustive-deps

  var dados = chaveCache ? cache[chaveCache] : null;
  var dadosAnt = chaveCache ? cacheAnt[chaveCache] : null;

  var visitantes = dados ? dados.engajamento.visitantesUnicos : 0;
  var cliques = dados
    ? dados.totaisPorTipo
        .filter(function (t) { return t.tipo_evento.indexOf("clique_") === 0; })
        .reduce(function (soma, t) { return soma + t.total; }, 0)
    : 0;
  var conversoes = dados ? total(dados, "conversao") : 0;
  var cards = dados ? total(dados, "card_criado") : 0;
  var leads = dados ? total(dados, "lead_capturado") : 0;
  var visitas = dados ? total(dados, "visita") : 0;
  var taxaConversao = visitas > 0 ? (conversoes / visitas) * 100 : 0;
  var taxaCards = dados && visitantes > 0 ? ((dados.engajamento.visitantesComCard || 0) / visitantes) * 100 : 0;

  // Em períodos de um dia só (ex: "Hoje") o gráfico mostra visitas por hora.
  var umDia = !!dados && dados.periodo.inicio === dados.periodo.fim;
  var visitasPorHora = new Array(24).fill(0);
  if (dados && umDia) {
    (dados.mapaCalor || []).forEach(function (l) {
      if (l.hora >= 0 && l.hora < 24) visitasPorHora[l.hora] += l.total;
    });
  }
  var picoHora = 0;
  visitasPorHora.forEach(function (v, h) {
    if (v > visitasPorHora[picoHora]) picoHora = h;
  });

  var topCliques = dados
    ? dados.cliquesPorTipo.slice(0, 5)
    : [];
  var maxClique = topCliques.reduce(function (m, c) { return Math.max(m, c.total); }, 1);
  var disp = dados ? dados.engajamento.porDispositivo : [];
  var totalDisp = disp.reduce(function (s, d) { return s + d.total; }, 0);
  var nomesDisp = { mobile: "Celular", desktop: "Computador", tablet: "Tablet" };

  return (
    <div className={estilos.tv} onMouseMove={mostrarControles}>
      <AvisosCards avisos={avisosTv.avisos} aoFechar={avisosTv.dispensar} grande />

      <div className={estilos.controles + (controlesVisiveis || menuAberto ? " " + estilos.controlesVisiveis : "")}>
        <div className={estilos.grupo} role="group" aria-label="Período">
          {PERIODOS.map(function (p) {
            return (
              <button
                key={p.id}
                className={estilos.opcao + (periodo === p.id ? " " + estilos.opcaoAtiva : "")}
                onClick={function () {
                  setPeriodo(p.id);
                }}
              >
                {p.rotulo}
              </button>
            );
          })}
        </div>
        <div className={estilos.grupo} role="group" aria-label="Tempo em cada LP">
          {INTERVALOS.map(function (s) {
            return (
              <button
                key={s}
                className={estilos.opcao + (intervalo === s ? " " + estilos.opcaoAtiva : "")}
                onClick={function () {
                  setIntervalo(s);
                }}
              >
                {s}s
              </button>
            );
          })}
        </div>
        <div className={estilos.menuLPs} ref={menuRef}>
          <button
            className={estilos.opcaoLPs}
            aria-expanded={menuAberto}
            aria-haspopup="true"
            onClick={function () {
              setMenuAberto(!menuAberto);
            }}
          >
            <Icone nome="painel" tamanho={16} />
            LPs ({slides.length}/{opcoes.length})
          </button>
          {menuAberto && (
            <div className={estilos.menu} role="group" aria-label="LPs exibidas na TV">
              <div className={estilos.menuTitulo}>Mostrar na TV</div>
              {opcoes.map(function (o) {
                var marcada = escolhidas.indexOf(o.slug) >= 0;
                var ultima = marcada && escolhidas.length === 1;
                return (
                  <label key={o.slug} className={estilos.menuItem} title={ultima ? "Pelo menos uma LP precisa ficar marcada" : undefined}>
                    <input
                      type="checkbox"
                      checked={marcada}
                      disabled={ultima}
                      onChange={function () {
                        alternarLP(o.slug);
                      }}
                    />
                    <PontoLP site={o.slug === "todas" ? null : o} tamanho={10} />
                    <span>{o.slug === "todas" ? "Todas as LPs (soma)" : o.nome}</span>
                  </label>
                );
              })}
              <div className={estilos.menuRodape}>
                <button type="button" className={estilos.menuLink} onClick={marcarTodas}>
                  Marcar todas
                </button>
                <span>Com mais de uma marcada, aperte o play para alternar sozinho.</span>
              </div>
            </div>
          )}
        </div>
        <button className={estilos.botao} onClick={function () { avancar(-1); }} aria-label="LP anterior">
          <Icone nome="chevron" tamanho={20} className={estilos.giraEsq} />
        </button>
        <button
          className={estilos.botao}
          onClick={function () { setPausado(!pausado); }}
          aria-label={pausado ? "Retomar rotação" : "Pausar rotação"}
        >
          <Icone nome={pausado ? "play" : "pausa"} tamanho={18} />
        </button>
        <button className={estilos.botao} onClick={function () { avancar(1); }} aria-label="Próxima LP">
          <Icone nome="chevron" tamanho={20} className={estilos.giraDir} />
        </button>
        <button
          className={estilos.botao}
          aria-pressed={avisosTv.prefs.som}
          aria-label={avisosTv.prefs.som ? "Desligar o som dos avisos" : "Ligar o som dos avisos"}
          title={avisosTv.prefs.som ? "Som dos avisos ligado" : "Som dos avisos desligado"}
          onClick={function () {
            var ligar = !avisosTv.prefs.som;
            avisosTv.atualizarPrefs({ som: ligar });
            if (ligar) tocarSom(); // o clique libera o áudio e já mostra como soa
          }}
        >
          <Icone nome={avisosTv.prefs.som ? "som" : "somMudo"} tamanho={18} />
        </button>
        <button className={estilos.botao} onClick={telaCheia} aria-label="Tela cheia">
          <Icone nome="tela" tamanho={18} />
        </button>
        <Link href="/" className={estilos.sair}>
          Sair do modo TV
        </Link>
      </div>

      {!slide && (
        <div className={estilos.vazio}>
          <h1>Nenhuma LP cadastrada</h1>
          <Link href="/sites" className="btn">
            Cadastrar LP
          </Link>
        </div>
      )}

      {slide && (
        <>
          <header className={estilos.topo}>
            <div>
              <h1 className={estilos.titulo}>
                <span className={estilos.pontoTitulo}>
                  <PontoLP site={slide.slug === "todas" ? null : slide} tamanho={26} />
                </span>
                {slide.nome}
              </h1>
              <p className={estilos.periodo}>
                {cfgPeriodo.rotulo === "Hoje" ? "Hoje" : "Últimos " + cfgPeriodo.rotulo}
                {slides.length > 1 ? " · " + ((indice % slides.length) + 1) + " de " + slides.length : ""}
                {pausado ? " · pausado" : ""}
              </p>
            </div>
            <div className={estilos.hora}>
              <Relogio />
            </div>
          </header>

          {dados && (
            <div className={estilos.resumoTv}>
              <ResumoPainel
                stats={dados}
                k={kpisTV(dados)}
                kAnt={dadosAnt ? kpisTV(dadosAnt) : null}
                nomeLP={slide.nome}
                todas={slide.slug === "todas"}
              />
            </div>
          )}

          {!dados ? (
            <div className={estilos.grade}>
              {[0, 1, 2, 3].map(function (k) {
                return <div key={k} className="skeleton skeleton-card" />;
              })}
            </div>
          ) : (
            <>
              <div className={estilos.grade}>
                <CartaoKpi rotulo="Visitantes únicos" valor={fmtN(visitantes)} acento={slide.slug === "todas" ? "#6366f1" : corDaLP(slide)} serie={serie(dados, "visitantes")} />
                <CartaoKpi rotulo="Cliques" valor={fmtN(cliques)} acento="#f59e0b" serie={serie(dados, "cliques")} />
                {cards > 0 ? (
                  <>
                    <CartaoKpi rotulo="Cards criados" valor={fmtN(cards)} acento="#14b8a6" serie={serie(dados, "cards")} />
                    <CartaoKpi rotulo="Taxa de cards" valor={fmtPct1(taxaCards)} acento="#14b8a6" secundario="dos visitantes únicos" />
                  </>
                ) : (
                  <>
                    <CartaoKpi rotulo="Conversões" valor={fmtN(conversoes)} acento="#22c55e" serie={serie(dados, "conversoes")} />
                    <CartaoKpi rotulo="Taxa de conversão" valor={fmtPct1(taxaConversao)} acento="#22c55e" secundario={leads > 0 ? fmtN(leads) + " leads capturados" : null} />
                  </>
                )}
              </div>

              <div className={estilos.baixo}>
                <section className={estilos.painel}>
                  <h2>{umDia ? "Visitas por hora (" + nomeFuso(dados.fuso ? dados.fuso.exibicaoMin : null) + ")" : "Visitantes por dia"}</h2>
                  <div className={estilos.grafico}>
                    <Sparkline valores={umDia ? visitasPorHora : serie(dados, "visitantes")} />
                  </div>
                  {umDia ? (
                    <div className={estilos.eixo}>
                      <span>0h</span>
                      <span>{visitasPorHora[picoHora] > 0 ? "pico às " + picoHora + "h (" + fmtN(visitasPorHora[picoHora]) + " visitas)" : "sem visitas ainda"}</span>
                      <span>23h</span>
                    </div>
                  ) : (
                    <div className={estilos.eixo}>
                      <span>{dados.periodo.inicio.slice(8, 10) + "/" + dados.periodo.inicio.slice(5, 7)}</span>
                      <span>{"pico de " + fmtN(Math.max.apply(null, serie(dados, "visitantes"))) + " por dia"}</span>
                      <span>{dados.periodo.fim.slice(8, 10) + "/" + dados.periodo.fim.slice(5, 7)}</span>
                    </div>
                  )}
                </section>
                <section className={estilos.painel}>
                  <h2>Mais clicados</h2>
                  {topCliques.length === 0 ? (
                    <p className={estilos.mudo}>Nenhum clique no período.</p>
                  ) : (
                    <div className={estilos.lista}>
                      {topCliques.map(function (c) {
                        return (
                          <div key={c.tipo_evento} className={estilos.linha}>
                            <span>{nomeClique(c.tipo_evento)}</span>
                            <span className={estilos.barra}>
                              <span style={{ width: (c.total / maxClique) * 100 + "%" }} />
                            </span>
                            <strong>{fmtN(c.total)}</strong>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
                <section className={estilos.painel}>
                  <h2>Dispositivo</h2>
                  {totalDisp === 0 ? (
                    <p className={estilos.mudo}>Sem visitas no período.</p>
                  ) : (
                    <div className={estilos.lista}>
                      {disp.map(function (d) {
                        var p = (d.total / totalDisp) * 100;
                        return (
                          <div key={d.dispositivo} className={estilos.linha}>
                            <span>{nomesDisp[d.dispositivo] || "Desconhecido"}</span>
                            <span className={estilos.barra}>
                              <span style={{ width: p + "%" }} />
                            </span>
                            <strong>{fmtPct1(p)}</strong>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}

          {avisosTv.recentes.length > 0 && (
            <div className={estilos.ultimos}>
              <span className={estilos.ultimosTitulo}>Últimos cards de hoje</span>
              <ul>
                {avisosTv.recentes.map(function (c) {
                  return (
                    <li key={c.id}>
                      <PontoLP site={{ id: c.siteId, cor: c.cor }} tamanho={10} />
                      {c.siteNome}
                      <span className={estilos.ultimosMudo}>
                        {(c.origem ? "via " + c.origem : "acesso direto") + " · " + haQuanto(c.minAtras)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {!pausado && slides.length > 1 && (
            <div className={estilos.progresso} aria-hidden="true">
              <div
                key={indice + "-" + intervalo + "-" + periodo}
                className={estilos.progressoBarra}
                style={{ animationDuration: intervalo + "s" }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
