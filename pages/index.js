import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

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
      setCarregando(true);
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
        });
    },
    [siteSelecionado, dataInicio, dataFim]
  );

  const visitas = stats ? somarPorTipo(stats.totaisPorTipo, "visita") : 0;
  const conversoes = stats ? somarPorTipo(stats.totaisPorTipo, "conversao") : 0;
  const cliquesTotais = stats ? somarTodosCliques(stats.totaisPorTipo) : 0;
  const taxaConversao = visitas > 0 ? ((conversoes / visitas) * 100).toFixed(1) : "0.0";

  const origemAgrupada = stats ? agruparPorChave(stats.porOrigem, "utm_source") : {};
  const campanhaAgrupada = stats ? agruparPorChave(stats.porCampanha, "utm_campaign") : {};
  const criativoAgrupado = stats ? agruparPorChave(stats.porCriativo, "utm_content") : {};

  return (
    <div className="container">
      <div className="header">
        <h1>Relinq Tracker</h1>
        <div className="nav">
          <Link href="/visao-geral">Visão geral</Link>
          <Link href="/sites">+ Cadastrar LP</Link>
          <button className="btn-sair" onClick={sair}>Sair</button>
        </div>
      </div>

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
                <div className="card">
                  <div className="label">Visitas</div>
                  <div className="valor">{visitas}</div>
                </div>
                <div className="card">
                  <div className="label">Visitantes únicos</div>
                  <div className="valor">{stats.engajamento.visitantesUnicos}</div>
                </div>
                <div className="card">
                  <div className="label">Cliques (todos os tipos)</div>
                  <div className="valor">{cliquesTotais}</div>
                </div>
                <div className="card">
                  <div className="label">Conversões</div>
                  <div className="valor">{conversoes}</div>
                </div>
                <div className="card">
                  <div className="label">Taxa de conversão</div>
                  <div className="valor">{taxaConversao}%</div>
                </div>
                <div className="card">
                  <div className="label">Taxa de rejeição</div>
                  <div className="valor">{stats.engajamento.taxaRejeicao}%</div>
                </div>
                <div className="card">
                  <div className="label">Tempo médio na página</div>
                  <div className="valor">
                    {stats.engajamento.tempoMedioSegundos !== null
                      ? stats.engajamento.tempoMedioSegundos + "s"
                      : "-"}
                  </div>
                </div>
              </div>

              <div className="secao">
                <h2>Visitas por dia</h2>
                <GraficoLinha serieDiaria={stats.serieDiaria} />
              </div>

              <div className="secao">
                <h2>Cliques por tipo</h2>
                <TabelaCliques cliquesPorTipo={stats.cliquesPorTipo} />
              </div>

              <div className="secao">
                <h2>Dispositivo</h2>
                <TabelaDispositivo porDispositivo={stats.engajamento.porDispositivo} totalVisitas={visitas} />
              </div>

              <div className="secao">
                <h2>Profundidade de rolagem</h2>
                <TabelaScroll scrollProfundidade={stats.engajamento.scrollProfundidade} visitantesUnicos={stats.engajamento.visitantesUnicos} />
              </div>

              <div className="secao">
                <h2>Por origem (utm_source)</h2>
                <TabelaAgrupada dados={origemAgrupada} />
              </div>

              <div className="secao">
                <h2>Por campanha (utm_campaign)</h2>
                <TabelaAgrupada dados={campanhaAgrupada} />
              </div>

              <div className="secao">
                <h2>Por anúncio/criativo (utm_content)</h2>
                <TabelaAgrupada dados={criativoAgrupado} />
              </div>

              {stats.video && stats.video.plays.length > 0 && (
                <div className="secao">
                  <h2>Vídeo (VSL)</h2>
                  <SecaoVideo video={stats.video} />
                </div>
              )}
            </>
          )}
        </>
      )}
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

function TabelaDispositivo({ porDispositivo, totalVisitas }) {
  if (!porDispositivo || porDispositivo.length === 0) {
    return <p className="vazio">Sem dados nesse período.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Dispositivo</th>
          <th>Visitas</th>
          <th>%</th>
        </tr>
      </thead>
      <tbody>
        {porDispositivo.map(function (d) {
          var pct = totalVisitas > 0 ? ((d.total / totalVisitas) * 100).toFixed(1) : "0.0";
          return (
            <tr key={d.dispositivo}>
              <td>{nomeAmigavelDispositivo(d.dispositivo)}</td>
              <td>{d.total}</td>
              <td>{pct}%</td>
            </tr>
          );
        })}
      </tbody>
    </table>
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

function GraficoLinha({ serieDiaria }) {
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

  var largura = 900;
  var altura = 240;
  var margem = { topo: 20, baixo: 30, esq: 40, dir: 20 };
  var areaLargura = largura - margem.esq - margem.dir;
  var areaAltura = altura - margem.topo - margem.baixo;

  var maxValor = Math.max(
    1,
    ...pontos.map(function (p) {
      return Math.max(p.visita, p.cliques, p.conversao);
    })
  );

  function coordX(i) {
    return pontos.length <= 1
      ? margem.esq
      : margem.esq + (i / (pontos.length - 1)) * areaLargura;
  }

  function coordY(valor) {
    return margem.topo + areaAltura - (valor / maxValor) * areaAltura;
  }

  function gerarLinha(campo) {
    return pontos
      .map(function (p, i) {
        return (i === 0 ? "M" : "L") + coordX(i) + "," + coordY(p[campo]);
      })
      .join(" ");
  }

  var passoRotulo = Math.max(1, Math.ceil(pontos.length / 6));

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={"0 0 " + largura + " " + altura} style={{ width: "100%", maxWidth: largura }}>
        <line
          x1={margem.esq}
          y1={margem.topo + areaAltura}
          x2={largura - margem.dir}
          y2={margem.topo + areaAltura}
          stroke="#e5e7eb"
        />
        <path d={gerarLinha("visita")} fill="none" stroke="#4f46e5" strokeWidth="2" />
        <path d={gerarLinha("cliques")} fill="none" stroke="#f59e0b" strokeWidth="2" />
        <path d={gerarLinha("conversao")} fill="none" stroke="#16a34a" strokeWidth="2" />

        {pontos.map(function (p, i) {
          return i % passoRotulo === 0 ? (
            <text key={p.dia} x={coordX(i)} y={altura - 8} fontSize="10" fill="#6b7280" textAnchor="middle">
              {p.dia.slice(5)}
            </text>
          ) : null;
        })}
      </svg>
      <div style={{ display: "flex", gap: 16, fontSize: 13, marginTop: 8 }}>
        <span style={{ color: "#4f46e5" }}>● Visitas</span>
        <span style={{ color: "#f59e0b" }}>● Cliques</span>
        <span style={{ color: "#16a34a" }}>● Conversões</span>
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
