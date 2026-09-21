import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Relogio from "../components/Relogio";
import estilos from "../styles/relatorios.module.css";

// ---------- Formatação ----------

const nf = new Intl.NumberFormat("pt-BR");
const nf1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function fmtNum(n) {
  return n == null ? "—" : nf.format(n);
}

function fmtPct(n) {
  return n == null ? "—" : nf1.format(n) + "%";
}

function fmtTempo(segundos) {
  if (segundos == null) return "—";
  var s = Math.round(segundos);
  if (s < 60) return s + "s";
  var m = Math.floor(s / 60);
  var r = s % 60;
  return m + "m " + String(r).padStart(2, "0") + "s";
}

function formatarData(date) {
  return date.toISOString().slice(0, 10);
}

function diaMes(str) {
  var p = str.split("-");
  return p[2] + "/" + p[1];
}

function dataBR(str) {
  var p = str.split("-");
  return p[2] + "/" + p[1] + "/" + p[0];
}

// ---------- Cálculos ----------

var COR_ATUAL = "#6366f1";
var COR_ANTERIOR = "#94a3b8";

var NOMES_DISPOSITIVO = {
  mobile: "Celular",
  desktop: "Computador",
  tablet: "Tablet",
  outro: "Desconhecido",
};

var CORES_DISPOSITIVO = {
  mobile: "#06b6d4",
  desktop: "#6366f1",
  tablet: "#f59e0b",
  outro: "#64748b",
};

var METRICAS_GRAFICO = {
  visitantes: { rotulo: "Visitantes únicos", tipo: "colunas", formatar: fmtNum, inteiro: true, cor: "#6366f1" },
  visitas: { rotulo: "Visitas", tipo: "colunas", formatar: fmtNum, inteiro: true, cor: "#06b6d4" },
  cards: { rotulo: "Cards criados", tipo: "colunas", formatar: fmtNum, inteiro: true, cor: "#14b8a6" },
  tempo: { rotulo: "Tempo médio", tipo: "linha", formatar: fmtTempo, inteiro: false, cor: "#f59e0b" },
};

function pct(parte, total) {
  return total > 0 ? Math.min(100, (parte / total) * 100) : 0;
}

// Transforma as contagens da API em percentuais prontos pra exibir.
function derivar(m) {
  if (!m) return null;
  var d = m.dispositivo;
  var somaDisp = d.mobile + d.desktop + d.tablet + d.outro;
  return {
    visitantes: m.visitantes,
    visitas: m.visitas,
    tempoMedio: m.tempoMedio,
    cards: m.cards,
    taxaCard: pct(m.visitantesCard, m.visitantes),
    dispN: d,
    disp: {
      mobile: pct(d.mobile, somaDisp),
      desktop: pct(d.desktop, somaDisp),
      tablet: pct(d.tablet, somaDisp),
      outro: pct(d.outro, somaDisp),
    },
    scrollN: m.scroll,
    scroll: {
      25: pct(m.scroll[25], m.visitantes),
      50: pct(m.scroll[50], m.visitantes),
      75: pct(m.scroll[75], m.visitantes),
      100: pct(m.scroll[100], m.visitantes),
    },
  };
}

// Variação relativa (%) entre dois números.
function variacao(atual, anterior) {
  if (atual == null || anterior == null) return null;
  if (anterior === 0) return atual === 0 ? { pct: 0 } : { novo: true };
  return { pct: ((atual - anterior) / anterior) * 100 };
}

function valorDaMetrica(ponto, chave) {
  if (chave === "tempo") return ponto.tempoMedio;
  return ponto[chave];
}

// O bloco de cards só aparece quando existe ao menos um card criado no
// período (atual ou anterior) — LPs sem formulário não ganham colunas vazias.
function temCardsNosDados(dados) {
  if (!dados) return false;
  var a = dados.total.atual;
  var p = dados.total.anterior;
  return a.cards > 0 || (!!p && p.cards > 0);
}

// ---------- Componentes pequenos ----------

function Delta({ v }) {
  if (!v) return null;
  if (v.novo) {
    return <span className={estilos.delta + " " + estilos.deltaNeutro}>sem base anterior</span>;
  }
  if (Math.abs(v.pct) < 0.05) {
    return <span className={estilos.delta + " " + estilos.deltaNeutro}>sem variação</span>;
  }
  var sobe = v.pct > 0;
  return (
    <span className={estilos.delta + " " + (sobe ? estilos.deltaSobe : estilos.deltaDesce)}>
      {sobe ? "▲" : "▼"} {nf1.format(Math.abs(v.pct))}%
    </span>
  );
}

// Variação em pontos percentuais (p.p.), pra métricas que já são porcentagem.
function DeltaPP({ atual, anterior, invertido, neutro }) {
  if (atual == null || anterior == null) return null;
  var d = atual - anterior;
  if (Math.abs(d) < 0.05) {
    return <span className={estilos.delta + " " + estilos.deltaNeutro}>0,0 p.p.</span>;
  }
  var bom = invertido ? d < 0 : d > 0;
  var classe = neutro ? estilos.deltaNeutro : bom ? estilos.deltaSobe : estilos.deltaDesce;
  return (
    <span className={estilos.delta + " " + classe}>
      {(d > 0 ? "+" : "−") + nf1.format(Math.abs(d)) + " p.p."}
    </span>
  );
}

function CartaoKpi({ rotulo, valor, acento, rodape }) {
  return (
    <div className="card" style={{ "--acento": acento }}>
      <div className="label">{rotulo}</div>
      <div className="valor">{valor}</div>
      {rodape && <div className={estilos.cartaoRodape}>{rodape}</div>}
    </div>
  );
}

function Secao({ id, titulo, aberta, aoAlternar, extra, children }) {
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

// ---------- Gráfico (SVG) com o período anterior sobreposto ----------

function passoBonito(valor) {
  if (valor <= 0) return 1;
  var magnitude = Math.pow(10, Math.floor(Math.log10(valor)));
  var n = valor / magnitude;
  var passo = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return passo * magnitude;
}

function montarCaminho(pontos, chave, xDe, yDe) {
  var d = "";
  var aberto = false;
  pontos.forEach(function (p, i) {
    var v = p[chave];
    if (v == null) {
      aberto = false;
      return;
    }
    d += (aberto ? "L" : "M") + xDe(i).toFixed(1) + " " + yDe(v).toFixed(1) + " ";
    aberto = true;
  });
  return d;
}

function GraficoComparativo({ pontos, tipo, formatar, inteiro, cor, mostrarAnterior }) {
  var LARGURA = 640;
  var ALTURA = 260;
  var mEsq = 56;
  var mDir = 12;
  var mTopo = 12;
  var mBase = 30;
  var w = LARGURA - mEsq - mDir;
  var h = ALTURA - mTopo - mBase;

  var maxBruto = 0;
  pontos.forEach(function (p) {
    if (p.atual != null && p.atual > maxBruto) maxBruto = p.atual;
    if (mostrarAnterior && p.anterior != null && p.anterior > maxBruto) maxBruto = p.anterior;
  });

  var passo = passoBonito(maxBruto / 4);
  if (inteiro && passo < 1) passo = 1;
  var maxEixo = passo * 4;

  var n = pontos.length;
  var fatia = w / n;
  var xDe = function (i) {
    return mEsq + fatia * (i + 0.5);
  };
  var yDe = function (v) {
    return mTopo + h - (v / maxEixo) * h;
  };

  var larguraBarra = Math.max(1.5, fatia * 0.62);
  var passoRotulo = Math.ceil(n / 8);
  var ticks = [0, 1, 2, 3, 4];

  return (
    <svg
      className={estilos.grafico}
      viewBox={"0 0 " + LARGURA + " " + ALTURA}
      role="img"
      aria-label="Gráfico diário comparando o período atual com o anterior"
    >
      {ticks.map(function (i) {
        var valor = passo * i;
        var y = yDe(valor);
        return (
          <g key={i}>
            <line x1={mEsq} x2={LARGURA - mDir} y1={y} y2={y} stroke="#1e293b" strokeWidth="1" />
            <text x={mEsq - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">
              {formatar(valor)}
            </text>
          </g>
        );
      })}

      {tipo === "colunas" &&
        pontos.map(function (p, i) {
          if (p.atual == null || p.atual === 0) return null;
          var y = yDe(p.atual);
          return (
            <rect
              key={i}
              x={xDe(i) - larguraBarra / 2}
              y={y}
              width={larguraBarra}
              height={mTopo + h - y}
              rx="2"
              fill={cor}
            />
          );
        })}

      {tipo === "linha" && (
        <path d={montarCaminho(pontos, "atual", xDe, yDe)} fill="none" stroke={cor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {tipo === "linha" &&
        n <= 31 &&
        pontos.map(function (p, i) {
          if (p.atual == null) return null;
          return <circle key={i} cx={xDe(i)} cy={yDe(p.atual)} r="3" fill={cor} />;
        })}

      {mostrarAnterior && (
        <path
          d={montarCaminho(pontos, "anterior", xDe, yDe)}
          fill="none"
          stroke={COR_ANTERIOR}
          strokeWidth="2"
          strokeDasharray="5 4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {pontos.map(function (p, i) {
        if (i % passoRotulo !== 0) return null;
        return (
          <text key={i} x={xDe(i)} y={ALTURA - 8} textAnchor="middle" fontSize="11" fill="#64748b">
            {diaMes(p.dia)}
          </text>
        );
      })}

      {pontos.map(function (p, i) {
        var texto = dataBR(p.dia) + ": " + formatar(p.atual);
        if (mostrarAnterior && p.diaAnterior) {
          texto += "\n" + dataBR(p.diaAnterior) + " (anterior): " + formatar(p.anterior);
        }
        return (
          <rect key={i} x={mEsq + fatia * i} y={mTopo} width={fatia} height={h} fill="transparent">
            <title>{texto}</title>
          </rect>
        );
      })}
    </svg>
  );
}

// ---------- Barras comparativas (dispositivo e rolagem) ----------

function BarrasComparativas({ linhas, comparando }) {
  return (
    <div className={estilos.barras}>
      {linhas.map(function (l) {
        return (
          <div key={l.rotulo} className={estilos.barraLinha}>
            <div className={estilos.barraRotulo}>{l.rotulo}</div>
            <div className={estilos.trilha}>
              <div className={estilos.preenchimento} style={{ width: l.atual + "%", background: l.cor }} />
              {comparando && l.anterior != null && (
                <span
                  className={estilos.marca}
                  style={{ left: "calc(" + Math.min(l.anterior, 100) + "% - 1px)" }}
                  title={"Período anterior: " + fmtPct(l.anterior)}
                />
              )}
            </div>
            <div className={estilos.barraValor}>
              <span>
                {fmtPct(l.atual)} <span className={estilos.sub}>({fmtNum(l.n)})</span>
              </span>
              {comparando && (
                <DeltaPP atual={l.atual} anterior={l.anterior} invertido={l.invertido} neutro={l.neutro} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Exportação CSV ----------

function csvNumero(n) {
  if (n == null) return "";
  return String(Math.round(n * 10) / 10).replace(".", ",");
}

function csvCelula(valor) {
  var s = valor == null ? "" : String(valor);
  return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Evita que o Excel interprete o nome de uma LP como fórmula.
function csvTexto(valor) {
  var s = String(valor == null ? "" : valor);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function exportarCsv(dados) {
  var comparando = !!dados.anterior;
  var cabecalho = [
    "Período",
    "LP",
    "Visitantes únicos",
    "Visitas",
    "Celular (%)",
    "Computador (%)",
    "Tablet (%)",
    "Rolagem 25% (%)",
    "Rolagem 50% (%)",
    "Rolagem 75% (%)",
    "Rolagem 100% (%)",
    "Tempo médio (s)",
  ];
  var comCards = temCardsNosDados(dados);
  if (comCards) cabecalho.push("Cards criados", "Taxa de cards (%)");
  if (comparando) {
    cabecalho.push("Período anterior", "Var. visitantes (%)", "Var. tempo médio (%)");
    if (comCards) cabecalho.push("Var. cards (%)");
  }

  var periodo = dataBR(dados.periodo.inicio) + " a " + dataBR(dados.periodo.fim);
  var periodoAnterior = comparando ? dataBR(dados.anterior.inicio) + " a " + dataBR(dados.anterior.fim) : "";

  function montarLinha(nome, metAtual, metAnterior) {
    var a = derivar(metAtual);
    var p = metAnterior ? derivar(metAnterior) : null;
    var linha = [
      periodo,
      csvTexto(nome),
      a.visitantes,
      a.visitas,
      csvNumero(a.disp.mobile),
      csvNumero(a.disp.desktop),
      csvNumero(a.disp.tablet),
      csvNumero(a.scroll[25]),
      csvNumero(a.scroll[50]),
      csvNumero(a.scroll[75]),
      csvNumero(a.scroll[100]),
      csvNumero(a.tempoMedio),
    ];
    if (comCards) linha.push(a.cards, csvNumero(a.taxaCard));
    if (comparando) {
      var vv = variacao(a.visitantes, p.visitantes);
      var vt = variacao(a.tempoMedio, p.tempoMedio);
      linha.push(periodoAnterior, vv && vv.pct != null ? csvNumero(vv.pct) : "", vt && vt.pct != null ? csvNumero(vt.pct) : "");
      if (comCards) {
        var vc = variacao(a.cards, p.cards);
        linha.push(vc && vc.pct != null ? csvNumero(vc.pct) : "");
      }
    }
    return linha;
  }

  var linhas = dados.porSite.map(function (s) {
    return montarLinha(s.nome, s.atual, s.anterior);
  });
  linhas.push(montarLinha("Todas as LPs selecionadas", dados.total.atual, dados.total.anterior));

  var texto = [cabecalho]
    .concat(linhas)
    .map(function (linha) {
      return linha.map(csvCelula).join(";");
    })
    .join("\r\n");

  // BOM + ponto e vírgula: abre certo no Excel em português.
  var blob = new Blob(["\uFEFF" + texto], { type: "text/csv;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var link = document.createElement("a");
  link.href = url;
  link.download = "relatorio-tracker_" + dados.periodo.inicio + "_a_" + dados.periodo.fim + ".csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------- Página ----------

export default function Relatorios() {
  const router = useRouter();

  function sair() {
    fetch("/api/logout", { method: "POST" }).finally(function () {
      router.push("/login");
    });
  }

  const [sites, setSites] = useState([]);
  const [selecionados, setSelecionados] = useState([]); // slugs; vazio = todas as LPs
  const [dataInicio, setDataInicio] = useState(
    formatarData(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
  );
  const [dataFim, setDataFim] = useState(formatarData(new Date()));
  const [comparar, setComparar] = useState(true);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [metrica, setMetrica] = useState("visitantes");
  const [fechadas, setFechadas] = useState({});

  useEffect(function () {
    fetch("/api/sites")
      .then(function (r) {
        return r.json();
      })
      .then(function (lista) {
        if (Array.isArray(lista)) setSites(lista);
      });
  }, []);

  useEffect(
    function () {
      if (dataInicio > dataFim) {
        setErro("A data inicial precisa ser anterior à data final.");
        setCarregando(false);
        return;
      }

      var cancelado = false;
      setCarregando(true);
      setErro("");

      var params = new URLSearchParams({
        inicio: dataInicio,
        fim: dataFim,
        comparar: comparar ? "1" : "0",
        sites: selecionados.length > 0 ? selecionados.join(",") : "todas",
      });

      fetch("/api/relatorios?" + params.toString())
        .then(function (r) {
          if (r.status === 401) {
            router.push("/login?redirect=" + encodeURIComponent("/relatorios"));
            throw new Error("Sessão expirada");
          }
          return r.json().then(function (json) {
            if (!r.ok) throw new Error(json.erro || "Erro ao carregar os relatórios");
            return json;
          });
        })
        .then(function (json) {
          if (cancelado) return;
          setDados(json);
          setCarregando(false);
        })
        .catch(function (e) {
          if (cancelado) return;
          setErro(e.message);
          setCarregando(false);
        });

      return function () {
        cancelado = true;
      };
    },
    [selecionados, dataInicio, dataFim, comparar]
  );

  function alternarSite(slug) {
    setSelecionados(function (atual) {
      return atual.indexOf(slug) >= 0
        ? atual.filter(function (s) {
            return s !== slug;
          })
        : atual.concat(slug);
    });
  }

  function aplicarAtalho(dias) {
    setDataInicio(formatarData(new Date(Date.now() - dias * 24 * 60 * 60 * 1000)));
    setDataFim(formatarData(new Date()));
  }

  function alternarSecao(id) {
    setFechadas(function (atual) {
      var novo = Object.assign({}, atual);
      novo[id] = !novo[id];
      return novo;
    });
  }

  // ----- Dados derivados -----

  var comparando = !!(dados && dados.anterior);
  var atual = dados ? derivar(dados.total.atual) : null;
  var anterior = dados && dados.total.anterior ? derivar(dados.total.anterior) : null;
  var semDados = !!atual && atual.visitas === 0 && atual.visitantes === 0;

  var temCards = !!dados && temCardsNosDados(dados);
  var chaveMetrica = metrica === "cards" && !temCards ? "visitantes" : metrica;
  var configMetrica = METRICAS_GRAFICO[chaveMetrica];
  var pontosGrafico = dados
    ? dados.serie.map(function (s) {
        return {
          dia: s.dia,
          diaAnterior: s.diaAnterior,
          atual: valorDaMetrica(s.atual, chaveMetrica),
          anterior: s.anterior ? valorDaMetrica(s.anterior, chaveMetrica) : null,
        };
      })
    : [];

  var linhasDispositivo = atual
    ? ["mobile", "desktop", "tablet", "outro"]
        .filter(function (k) {
          return atual.dispN[k] > 0 || (anterior && anterior.dispN[k] > 0);
        })
        .map(function (k) {
          return {
            rotulo: NOMES_DISPOSITIVO[k],
            cor: CORES_DISPOSITIVO[k],
            atual: atual.disp[k],
            anterior: anterior ? anterior.disp[k] : null,
            n: atual.dispN[k],
            neutro: true,
          };
        })
    : [];

  var linhasScroll = atual
    ? [
        {
          rotulo: "Saíram antes de 25%",
          cor: "#64748b",
          atual: 100 - atual.scroll[25],
          anterior: anterior ? 100 - anterior.scroll[25] : null,
          n: Math.max(0, atual.visitantes - atual.scrollN[25]),
          invertido: true,
        },
      ].concat(
        [25, 50, 75, 100].map(function (marco) {
          return {
            rotulo: "Chegaram a " + marco + "% da página",
            cor: "#a78bfa",
            atual: atual.scroll[marco],
            anterior: anterior ? anterior.scroll[marco] : null,
            n: atual.scrollN[marco],
          };
        })
      )
    : [];

  var linhasLP = dados
    ? dados.porSite
        .map(function (s) {
          return { slug: s.slug, nome: s.nome, a: derivar(s.atual), p: s.anterior ? derivar(s.anterior) : null };
        })
        .sort(function (x, y) {
          return y.a.visitantes - x.a.visitantes;
        })
    : [];

  function celulasLP(a, p) {
    return [
      <td key="v" className={estilos.numero}>{fmtNum(a.visitantes)}</td>,
      comparando ? (
        <td key="dv" className={estilos.numero}>
          <Delta v={variacao(a.visitantes, p ? p.visitantes : null)} />
        </td>
      ) : null,
      <td key="vs" className={estilos.numero}>{fmtNum(a.visitas)}</td>,
      <td key="m" className={estilos.numero}>{fmtPct(a.disp.mobile)}</td>,
      <td key="d" className={estilos.numero}>{fmtPct(a.disp.desktop)}</td>,
      <td key="t" className={estilos.numero}>{fmtPct(a.disp.tablet)}</td>,
      <td key="s50" className={estilos.numero}>{fmtPct(a.scroll[50])}</td>,
      <td key="s100" className={estilos.numero}>{fmtPct(a.scroll[100])}</td>,
      <td key="tm" className={estilos.numero}>{fmtTempo(a.tempoMedio)}</td>,
      temCards ? <td key="c" className={estilos.numero}>{fmtNum(a.cards)}</td> : null,
      temCards ? <td key="tc" className={estilos.numero}>{fmtPct(a.taxaCard)}</td> : null,
    ];
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
          <h1>Relatórios</h1>
        </div>
        <div className="nav">
          <Link href="/">← Painel por LP</Link>
          <Link href="/visao-geral">Visão geral</Link>
          <Link href="/jornada">Jornada do visitante</Link>
          <button className="btn-sair" onClick={sair}>
            Sair
          </button>
        </div>
      </div>
      <p className="atualizacao-automatica">
        {dados
          ? comparando
            ? "Período " + dataBR(dados.periodo.inicio) + " a " + dataBR(dados.periodo.fim) + ", comparado com " + dataBR(dados.anterior.inicio) + " a " + dataBR(dados.anterior.fim)
            : "Período " + dataBR(dados.periodo.inicio) + " a " + dataBR(dados.periodo.fim)
          : "Carregando relatório..."}{" "}
        <Relogio />
      </p>

      {/* --- Filtros --- */}
      <div className={estilos.blocoSites}>
        <div className={estilos.chips} role="group" aria-label="Filtrar por LP">
          <button
            className={estilos.chip + (selecionados.length === 0 ? " " + estilos.chipAtivo : "")}
            aria-pressed={selecionados.length === 0}
            onClick={function () {
              setSelecionados([]);
            }}
          >
            Todas as LPs
          </button>
          {sites.map(function (s) {
            var ativo = selecionados.indexOf(s.slug) >= 0;
            return (
              <button
                key={s.slug}
                className={estilos.chip + (ativo ? " " + estilos.chipAtivo : "")}
                aria-pressed={ativo}
                onClick={function () {
                  alternarSite(s.slug);
                }}
              >
                {s.nome}
              </button>
            );
          })}
        </div>
      </div>

      <div className="filtros" style={{ marginBottom: 14 }}>
        <input
          type="date"
          value={dataInicio}
          aria-label="Data inicial"
          onChange={function (e) {
            setDataInicio(e.target.value);
          }}
        />
        <input
          type="date"
          value={dataFim}
          aria-label="Data final"
          onChange={function (e) {
            setDataFim(e.target.value);
          }}
        />
        <div className="atalhos">
          <button className="btn-atalho" onClick={function () { aplicarAtalho(0); }}>Hoje</button>
          <button className="btn-atalho" onClick={function () { aplicarAtalho(7); }}>7 dias</button>
          <button className="btn-atalho" onClick={function () { aplicarAtalho(30); }}>30 dias</button>
          <button className="btn-atalho" onClick={function () { aplicarAtalho(90); }}>90 dias</button>
        </div>
      </div>

      <div className={estilos.acoes}>
        <label className={estilos.toggle}>
          <input
            type="checkbox"
            checked={comparar}
            onChange={function (e) {
              setComparar(e.target.checked);
            }}
          />
          Comparar com o período anterior
        </label>
        <button
          className="btn-atalho"
          disabled={!dados || carregando || !!erro}
          onClick={function () {
            exportarCsv(dados);
          }}
        >
          Exportar CSV
        </button>
      </div>

      {erro && <p className="login-erro">{erro}</p>}
      {carregando && !erro && <p className="vazio">Carregando...</p>}

      {!carregando && !erro && dados && semDados && (
        <p className="vazio">
          Nenhuma visita registrada nesse período para as LPs escolhidas. Tente um intervalo maior ou confira se o
          tracker está instalado.
        </p>
      )}

      {!carregando && !erro && dados && !semDados && (
        <div>
          {/* --- Cards --- */}
          <div className="cards">
            <CartaoKpi
              rotulo="Visitantes únicos"
              valor={fmtNum(atual.visitantes)}
              acento="#6366f1"
              rodape={
                comparando && (
                  <>
                    <Delta v={variacao(atual.visitantes, anterior.visitantes)} />
                    <span className={estilos.base}>antes: {fmtNum(anterior.visitantes)}</span>
                  </>
                )
              }
            />
            <CartaoKpi
              rotulo="Visitas"
              valor={fmtNum(atual.visitas)}
              acento="#06b6d4"
              rodape={
                comparando && (
                  <>
                    <Delta v={variacao(atual.visitas, anterior.visitas)} />
                    <span className={estilos.base}>antes: {fmtNum(anterior.visitas)}</span>
                  </>
                )
              }
            />
            <CartaoKpi
              rotulo="Tempo médio na página"
              valor={fmtTempo(atual.tempoMedio)}
              acento="#f59e0b"
              rodape={
                comparando && (
                  <>
                    <Delta v={variacao(atual.tempoMedio, anterior.tempoMedio)} />
                    <span className={estilos.base}>antes: {fmtTempo(anterior.tempoMedio)}</span>
                  </>
                )
              }
            />
            <CartaoKpi
              rotulo="Rolaram até 50%"
              valor={fmtPct(atual.scroll[50])}
              acento="#a78bfa"
              rodape={
                comparando && (
                  <>
                    <DeltaPP atual={atual.scroll[50]} anterior={anterior.scroll[50]} />
                    <span className={estilos.base}>antes: {fmtPct(anterior.scroll[50])}</span>
                  </>
                )
              }
            />
            {temCards && (
              <CartaoKpi
                rotulo="Cards criados"
                valor={fmtNum(atual.cards)}
                acento="#14b8a6"
                rodape={
                  comparando && (
                    <>
                      <Delta v={variacao(atual.cards, anterior.cards)} />
                      <span className={estilos.base}>antes: {fmtNum(anterior.cards)}</span>
                    </>
                  )
                }
              />
            )}
            {temCards && (
              <CartaoKpi
                rotulo="Taxa de cards"
                valor={fmtPct(atual.taxaCard)}
                acento="#14b8a6"
                rodape={
                  <>
                    {comparando && <DeltaPP atual={atual.taxaCard} anterior={anterior.taxaCard} />}
                    <span className={estilos.base}>
                      {comparando ? "antes: " + fmtPct(anterior.taxaCard) : "dos visitantes únicos"}
                    </span>
                  </>
                }
              />
            )}
          </div>

          {/* --- Evolução por dia --- */}
          <Secao
            id="evolucao"
            titulo="Evolução por dia"
            aberta={!fechadas.evolucao}
            aoAlternar={alternarSecao}
            extra={
              <div className="seletor-viz">
                {Object.keys(METRICAS_GRAFICO)
                  .filter(function (chave) {
                    return chave !== "cards" || temCards;
                  })
                  .map(function (chave) {
                  return (
                    <button
                      key={chave}
                      className={"seletor-viz-btn" + (chaveMetrica === chave ? " ativo" : "")}
                      onClick={function () {
                        setMetrica(chave);
                      }}
                    >
                      {METRICAS_GRAFICO[chave].rotulo}
                    </button>
                  );
                })}
              </div>
            }
          >
            <GraficoComparativo
              pontos={pontosGrafico}
              tipo={configMetrica.tipo}
              formatar={configMetrica.formatar}
              inteiro={configMetrica.inteiro}
              cor={configMetrica.cor}
              mostrarAnterior={comparando}
            />
            <div className="grafico-legenda">
              <span>
                <span className="ponto" style={{ background: configMetrica.cor }} /> Período atual
              </span>
              {comparando && (
                <span>
                  <span className={estilos.tracoAnterior} /> Período anterior (dia a dia, na mesma posição)
                </span>
              )}
            </div>
            {chaveMetrica === "tempo" && (
              <p className={estilos.nota}>
                Média das visitas em que a saída da página foi registrada. Cada medição é limitada a{" "}
                {Math.round(dados.tempoMaximoSegundos / 60)} min para uma aba esquecida aberta não distorcer o resultado.
              </p>
            )}
          </Secao>

          {/* --- Dispositivo --- */}
          <Secao id="dispositivo" titulo="Dispositivo (visitantes únicos)" aberta={!fechadas.dispositivo} aoAlternar={alternarSecao}>
            <BarrasComparativas linhas={linhasDispositivo} comparando={comparando} />
            {comparando && <p className={estilos.nota}>A marca branca em cada barra indica o valor do período anterior.</p>}
          </Secao>

          {/* --- Rolagem --- */}
          <Secao id="rolagem" titulo="Profundidade de rolagem" aberta={!fechadas.rolagem} aoAlternar={alternarSecao}>
            <BarrasComparativas linhas={linhasScroll} comparando={comparando} />
            <p className={estilos.nota}>
              Percentual dos visitantes únicos que chegaram a cada marco. Quem chega a 100% também conta nos marcos
              anteriores.
              {comparando ? " A marca branca indica o período anterior." : ""}
            </p>
          </Secao>

          {/* --- Comparação entre LPs --- */}
          <Secao id="lps" titulo="Comparação entre LPs" aberta={!fechadas.lps} aoAlternar={alternarSecao}>
            <div className={estilos.tabelaRolagem}>
              <table>
                <thead>
                  <tr>
                    <th>LP</th>
                    <th className={estilos.numero}>Visitantes</th>
                    {comparando && <th className={estilos.numero}>Variação</th>}
                    <th className={estilos.numero}>Visitas</th>
                    <th className={estilos.numero}>Celular</th>
                    <th className={estilos.numero}>Computador</th>
                    <th className={estilos.numero}>Tablet</th>
                    <th className={estilos.numero}>Rolou 50%</th>
                    <th className={estilos.numero}>Chegou ao fim</th>
                    <th className={estilos.numero}>Tempo médio</th>
                    {temCards && <th className={estilos.numero}>Cards</th>}
                    {temCards && <th className={estilos.numero}>Taxa de cards</th>}
                  </tr>
                </thead>
                <tbody>
                  {linhasLP.map(function (l) {
                    return (
                      <tr key={l.slug}>
                        <td>{l.nome}</td>
                        {celulasLP(l.a, l.p)}
                      </tr>
                    );
                  })}
                  {linhasLP.length > 1 && (
                    <tr className={estilos.linhaTotal}>
                      <td>Todas as selecionadas</td>
                      {celulasLP(atual, anterior)}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {linhasLP.length > 1 && (
              <p className={estilos.nota}>
                O total conta cada visitante uma única vez, mesmo que ele tenha passado por mais de uma LP. Por isso pode
                ser menor que a soma das linhas.
              </p>
            )}
          </Secao>
        </div>
      )}
    </div>
  );
}
