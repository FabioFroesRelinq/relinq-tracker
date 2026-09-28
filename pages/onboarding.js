import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Shell from "../components/Shell";
import Secao from "../components/Secao";
import CartaoKpi from "../components/CartaoKpi";
import EstadoVazio from "../components/EstadoVazio";
import Esqueleto from "../components/Esqueleto";
import Icone from "../components/Icones";
import { PontoLP } from "../components/coresLP";
import { lerSiteInicial, salvarSite, lerPeriodoInicial, salvarPeriodo } from "../lib/filtroUrl";

const nf = new Intl.NumberFormat("pt-BR");
const nf1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function fmtN(n) {
  return n == null ? "—" : nf.format(n);
}

function fmtPct1(n) {
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

function dataHoraBR(iso) {
  if (!iso) return "—";
  var d = new Date(String(iso).replace(" ", "T"));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// "onboard_precos_duracao" -> "Precos duracao" (só pra não mostrar o nome
// técnico cru enquanto o app não manda um rótulo melhor pra etapa).
function nomeAmigavelEtapa(evento) {
  var semPrefixo = evento.replace(/^onboard_/, "").replace(/_/g, " ");
  return semPrefixo.charAt(0).toUpperCase() + semPrefixo.slice(1);
}

// Nome exibido pro visitante do painel: "Tela 01", "Tela 02"... na ordem em
// que as etapas aparecem no funil (a ordem já vem ajustada por quantos
// visitantes chegaram em cada uma). O nome técnico do evento continua
// disponível junto, pra não perder a referência de qual passo é qual.
function rotuloTela(indice) {
  return "Tela " + String(indice + 1).padStart(2, "0");
}

// Some "onboard_*" não tem posição no funil da página atual (ex: chave de
// "onboarding_respostas" que não bate com nenhum tipo_evento visto no
// período) — nesse caso cai pro nome técnico legível, só como reserva.
function criarRotuladorEtapas(etapas) {
  var indicePorEvento = {};
  etapas.forEach(function (e, i) {
    indicePorEvento[e.evento] = i;
  });
  return function (evento) {
    var indice = indicePorEvento[evento];
    return indice != null ? rotuloTela(indice) : nomeAmigavelEtapa(evento);
  };
}

function corConclusao(pct) {
  if (pct >= 80) return "#22c55e";
  if (pct >= 50) return "#eab308";
  return "#ef4444";
}

// Duas visões auxiliares da mesma coluna de números do funil: quanto dessa
// etapa concluiu em relação à etapa anterior, e o tempo médio gasto nela
// (na mesma escala entre etapas, pra dar pra comparar de olho quem trava).
function FunilMini({ rotulo, pct, cor, valorTexto }) {
  return (
    <div className="funil-mini-linha">
      <span className="funil-mini-rotulo">{rotulo}</span>
      <div className="funil-mini-trilha">
        <div className="funil-mini-preenchimento" style={{ width: Math.max(Math.min(pct, 100), 2) + "%", background: cor }} />
      </div>
      <span className="funil-mini-valor">{valorTexto}</span>
    </div>
  );
}

// Gráfico de colunas alternativo ao funil de barras: visitantes por etapa,
// na mesma ordem, pra quem prefere comparar volumes lado a lado.
function GraficoColunasEtapas({ etapas, rotularEtapa }) {
  var largura = 1200;
  var altura = 340;
  var margem = { topo: 26, baixo: 70, esq: 60, dir: 20 };
  var areaLargura = largura - margem.esq - margem.dir;
  var areaAltura = altura - margem.topo - margem.baixo;

  var maiorValor = Math.max(1, ...etapas.map(function (e) { return e.visitantes; }));
  var n = etapas.length;
  var larguraGrupo = areaLargura / n;
  var larguraBarra = Math.max(10, Math.min(70, larguraGrupo * 0.5));

  function coordY(valor) {
    return margem.topo + areaAltura - (valor / maiorValor) * areaAltura;
  }

  return (
    <svg viewBox={"0 0 " + largura + " " + altura} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id="col-onboarding-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="1" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <line x1={margem.esq} y1={margem.topo + areaAltura} x2={largura - margem.dir} y2={margem.topo + areaAltura} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      {etapas.map(function (e, i) {
        var x = margem.esq + i * larguraGrupo + (larguraGrupo - larguraBarra) / 2;
        var y = coordY(e.visitantes);
        var alturaBarra = margem.topo + areaAltura - y;
        var centroX = x + larguraBarra / 2;
        var baseY = margem.topo + areaAltura + 22;
        return (
          <g key={e.evento}>
            <title>{rotularEtapa(e.evento) + ": " + e.visitantes + " visitantes"}</title>
            <rect x={x} y={y} width={larguraBarra} height={Math.max(alturaBarra, 0)} rx={4} fill="url(#col-onboarding-grad)" />
            <text x={centroX} y={y - 8} fontSize="16" fill="#cbd5e1" textAnchor="middle">
              {e.visitantes}
            </text>
            <text x={centroX} y={baseY} fontSize="15" fill="#94a3b8" textAnchor="middle">
              {rotularEtapa(e.evento)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Segunda visão: em vez de volume, compara diretamente conclusão da etapa
// anterior (%) e tempo médio gasto — as duas métricas que o funil de barras
// só mostrava em texto pequeno.
function GraficoComparativoEtapas({ etapas, rotularEtapa }) {
  var maiorTempo = Math.max(1, ...etapas.map(function (e) { return e.tempoMedioSegundos || 0; }));

  return (
    <div className="comparativo-grid">
      <div>
        <h3 className="grafico-subtitulo">Conclusão da etapa anterior</h3>
        <div className="barras-h">
          {etapas.map(function (e, i) {
            var anterior = i > 0 ? etapas[i - 1].visitantes : null;
            var pct = anterior ? Math.min(100, (e.visitantes / anterior) * 100) : 100;
            return (
              <div className="barra-h-linha" key={e.evento}>
                <span className="barra-h-rotulo" title={nomeAmigavelEtapa(e.evento)}>
                  {rotularEtapa(e.evento)}
                </span>
                <div className="barra-h-trilha">
                  <div className="barra-h-preenchimento" style={{ width: Math.max(pct, 2) + "%", background: corConclusao(pct) }} />
                </div>
                <span className="barra-h-valor">{fmtPct1(pct)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <h3 className="grafico-subtitulo">Tempo médio na etapa</h3>
        <div className="barras-h">
          {etapas.map(function (e) {
            var pct = e.tempoMedioSegundos ? (e.tempoMedioSegundos / maiorTempo) * 100 : 0;
            return (
              <div className="barra-h-linha" key={e.evento}>
                <span className="barra-h-rotulo" title={nomeAmigavelEtapa(e.evento)}>
                  {rotularEtapa(e.evento)}
                </span>
                <div className="barra-h-trilha">
                  <div className="barra-h-preenchimento" style={{ width: Math.max(pct, 2) + "%", background: "#06b6d4" }} />
                </div>
                <span className="barra-h-valor">{fmtTempo(e.tempoMedioSegundos)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SeletorVisualizacaoFunil({ valor, aoMudar }) {
  var opcoes = [
    { chave: "funil", rotulo: "Funil", icone: "barras" },
    { chave: "colunas", rotulo: "Colunas", icone: "colunas" },
    { chave: "comparativo", rotulo: "Conclusão x tempo", icone: "grafico" },
  ];
  return (
    <div className="seletor-viz">
      {opcoes.map(function (op) {
        return (
          <button
            key={op.chave}
            type="button"
            className={"seletor-viz-btn" + (valor === op.chave ? " ativo" : "")}
            onClick={function () {
              aoMudar(op.chave);
            }}
          >
            <Icone nome={op.icone} tamanho={15} />
            {op.rotulo}
          </button>
        );
      })}
    </div>
  );
}

export default function Onboarding() {
  const router = useRouter();

  const [sites, setSites] = useState([]);
  const [siteSelecionado, setSiteSelecionado] = useState("todas");
  const [dataInicio, setDataInicio] = useState(formatarData(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [dataFim, setDataFim] = useState(formatarData(new Date()));
  const [filtroHidratado, setFiltroHidratado] = useState(false);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [visualizacaoFunil, setVisualizacaoFunil] = useState("funil");

  useEffect(
    function () {
      if (!router.isReady || filtroHidratado) return;
      var slugPreferido = router.query.site || lerSiteInicial(router.query);
      if (slugPreferido) setSiteSelecionado(slugPreferido);
      var p = lerPeriodoInicial(router.query, dataInicio, dataFim);
      if (p.inicio !== dataInicio) setDataInicio(p.inicio);
      if (p.fim !== dataFim) setDataFim(p.fim);
      setFiltroHidratado(true);
    },
    [router.isReady]
  );

  useEffect(
    function () {
      if (!filtroHidratado) return;
      salvarSite(siteSelecionado);
      salvarPeriodo(dataInicio, dataFim);
      var query = Object.assign({}, router.query, { site: siteSelecionado, inicio: dataInicio, fim: dataFim });
      router.replace({ pathname: router.pathname, query: query }, undefined, { shallow: true });
    },
    [siteSelecionado, dataInicio, dataFim]
  );

  useEffect(function () {
    fetch("/api/sites")
      .then(function (r) {
        return r.json();
      })
      .then(function (lista) {
        if (Array.isArray(lista)) setSites(lista);
      })
      .catch(function () {});
  }, []);

  useEffect(
    function () {
      if (!filtroHidratado || dataInicio > dataFim) return;
      var cancelado = false;
      setCarregando(true);
      fetch("/api/onboarding?site=" + siteSelecionado + "&inicio=" + dataInicio + "&fim=" + dataFim)
        .then(function (r) {
          return r.json();
        })
        .then(function (json) {
          if (cancelado) return;
          setDados(json);
          setCarregando(false);
        })
        .catch(function () {
          if (cancelado) return;
          setCarregando(false);
        });
      return function () {
        cancelado = true;
      };
    },
    [siteSelecionado, dataInicio, dataFim, filtroHidratado]
  );

  function aplicarAtalho(dias) {
    setDataInicio(formatarData(new Date(Date.now() - dias * 24 * 60 * 60 * 1000)));
    setDataFim(formatarData(new Date()));
  }

  var infoSites = {};
  sites.forEach(function (s) {
    infoSites[s.slug] = s;
  });

  var semDados = dados && dados.etapas && dados.etapas.length === 0;
  var rotularEtapa = dados ? criarRotuladorEtapas(dados.etapas) : nomeAmigavelEtapa;

  return (
    <Shell
      titulo="Onboarding"
      subtitulo="Funil, tempo por etapa e respostas de fluxos internos do app (ex: o onboarding de configuração)"
      filtro={{ site: siteSelecionado === "todas" ? "" : siteSelecionado, inicio: dataInicio, fim: dataFim }}
    >
      <div className="barra-filtros">
        <div className="filtros">
          <span className="select-lp">
            <select
              value={siteSelecionado}
              onChange={function (e) {
                setSiteSelecionado(e.target.value);
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
          </span>
          <input type="date" value={dataInicio} onChange={function (e) { setDataInicio(e.target.value); }} />
          <input type="date" value={dataFim} onChange={function (e) { setDataFim(e.target.value); }} />
          <div className="atalhos">
            <button className="btn-atalho" onClick={function () { aplicarAtalho(7); }}>7 dias</button>
            <button className="btn-atalho" onClick={function () { aplicarAtalho(30); }}>30 dias</button>
            <button className="btn-atalho" onClick={function () { aplicarAtalho(90); }}>90 dias</button>
          </div>
        </div>
      </div>

      {carregando && <Esqueleto cartoes={5} secoes={2} />}

      {!carregando && semDados && (
        <EstadoVazio
          titulo="Nenhuma etapa de onboarding nesse período"
          texto={
            'Assim que o app disparar eventos começando com "onboard_" (via relinqTrackPasso), o funil aparece aqui.'
          }
        />
      )}

      {!carregando && dados && !semDados && (
        <>
          <div className="cards">
            <CartaoKpi rotulo="Visitaram" valor={fmtN(dados.visitaram)} acento="#94a3b8" />
            <CartaoKpi rotulo="Taxa de rejeição de início" valor={fmtPct1(dados.taxaRejeicaoInicio)} acento="#ef4444" />
            <CartaoKpi rotulo="Iniciaram" valor={fmtN(dados.iniciaram)} acento="#6366f1" />
            <CartaoKpi rotulo="Concluíram" valor={fmtN(dados.concluiram)} acento="#22c55e" />
            <CartaoKpi rotulo="Taxa de conclusão" valor={fmtPct1(dados.taxaConclusao)} acento="#14b8a6" />
          </div>

          <Secao
            id="funil-onboarding"
            titulo="Funil de etapas"
            aberta
            aoAlternar={function () {}}
            extra={<SeletorVisualizacaoFunil valor={visualizacaoFunil} aoMudar={setVisualizacaoFunil} />}
          >
            {visualizacaoFunil === "funil" && (
              <div className="funil">
                {dados.etapas.map(function (e, i) {
                  var pctTotal = dados.etapas[0].visitantes > 0 ? Math.min(100, (e.visitantes / dados.etapas[0].visitantes) * 100) : 0;
                  var anterior = i > 0 ? dados.etapas[i - 1].visitantes : null;
                  var passo = anterior ? Math.min(100, (e.visitantes / anterior) * 100) : null;
                  var maiorTempo = Math.max(1, ...dados.etapas.map(function (x) { return x.tempoMedioSegundos || 0; }));
                  var pctTempo = e.tempoMedioSegundos ? (e.tempoMedioSegundos / maiorTempo) * 100 : 0;
                  return (
                    <div className="funil-etapa" key={e.evento}>
                      <div className="funil-nome-wrap">
                        <span className="funil-nome">{rotularEtapa(e.evento)}</span>
                        <span className="funil-nome-original" title={nomeAmigavelEtapa(e.evento)}>
                          {nomeAmigavelEtapa(e.evento)}
                        </span>
                      </div>
                      <div className="funil-trilha">
                        <div className="funil-barra" style={{ width: Math.max(pctTotal, 1.5) + "%", background: "#6366f1" }} />
                      </div>
                      <div className="funil-numeros">
                        <span className="funil-valor">{fmtN(e.visitantes)}</span>
                        <span className="funil-info">{fmtPct1(pctTotal)} do 1º passo</span>
                        <div className="funil-mini">
                          {passo != null && (
                            <FunilMini rotulo="conclusão" pct={passo} cor={corConclusao(passo)} valorTexto={fmtPct1(passo)} />
                          )}
                          {e.tempoMedioSegundos != null && (
                            <FunilMini rotulo="tempo" pct={pctTempo} cor="#06b6d4" valorTexto={fmtTempo(e.tempoMedioSegundos)} />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {visualizacaoFunil === "colunas" && <GraficoColunasEtapas etapas={dados.etapas} rotularEtapa={rotularEtapa} />}

            {visualizacaoFunil === "comparativo" && (
              <GraficoComparativoEtapas etapas={dados.etapas} rotularEtapa={rotularEtapa} />
            )}

            <p className="valor-secundario" style={{ marginTop: 14 }}>
              A ordem das etapas ("Tela 01", "Tela 02"...) segue quantos visitantes chegaram em cada uma (não uma
              ordem fixa configurada) — conforme os passos do fluxo forem enviados pelo app, a ordem aqui se ajusta
              sozinha; o nome técnico do evento aparece junto, menor, pra identificar cada tela. A conclusão (evento
              "quiz_finalizado") entra no card "Concluíram" acima, fora dessa lista.
            </p>
          </Secao>

          {dados.respostasRotulo && dados.respostasRotulo.length > 0 && (
            <Secao id="respostas-curtas" titulo="Respostas rotuladas por etapa" aberta aoAlternar={function () {}}>
              {Object.entries(
                dados.respostasRotulo.reduce(function (acc, r) {
                  (acc[r.tipo_evento] = acc[r.tipo_evento] || []).push(r);
                  return acc;
                }, {})
              ).map(function ([evento, linhas]) {
                var total = linhas.reduce(function (s, l) { return s + l.total; }, 0);
                return (
                  <div key={evento} style={{ marginBottom: 18 }}>
                    <h3 className="grafico-subtitulo">{rotularEtapa(evento)}</h3>
                    <table>
                      <thead>
                        <tr>
                          <th>Resposta</th>
                          <th>Total</th>
                          <th>%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linhas.map(function (l) {
                          return (
                            <tr key={l.rotulo}>
                              <td>{l.rotulo}</td>
                              <td>{fmtN(l.total)}</td>
                              <td>{fmtPct1(total > 0 ? (l.total / total) * 100 : 0)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </Secao>
          )}

          {dados.respostas && dados.respostas.disponivel && Object.keys(dados.respostas.porPasso).length > 0 && (
            <Secao id="respostas-estruturadas" titulo="Respostas estruturadas por etapa" aberta aoAlternar={function () {}}>
              <p className="valor-secundario" style={{ marginBottom: 14 }}>
                Vem de relinqTrackPasso(..., {"{"} respostas: {"{...}"} {"}"}) — respostas curtas (texto único ou
                lista de opções) aparecem quebradas abaixo; respostas mais compostas (ex: preço/duração por
                serviço, horário por dia da semana) só entram na contagem total, e o conteúdo completo fica
                disponível na Jornada de cada visitante.
              </p>
              {Object.entries(dados.respostas.porPasso).map(function ([passo, info]) {
                var opcoes = Object.entries(info.opcoes || {}).sort(function (a, b) { return b[1] - a[1]; });
                return (
                  <div key={passo} style={{ marginBottom: 18 }}>
                    <h3 className="grafico-subtitulo">
                      {rotularEtapa(passo)} <span className="valor-secundario">— {fmtN(info.total)} respostas</span>
                    </h3>
                    {opcoes.length > 0 && (
                      <table>
                        <thead>
                          <tr>
                            <th>Opção</th>
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {opcoes.map(function ([opcao, total]) {
                            return (
                              <tr key={opcao}>
                                <td>{opcao}</td>
                                <td>{fmtN(total)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </Secao>
          )}

          <Secao id="abandonos" titulo="Quem abandonou no meio do caminho" aberta aoAlternar={function () {}}>
            {dados.abandonos.length === 0 ? (
              <p className="vazio">Ninguém abandonou nesse período (ou todos concluíram).</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>LP</th>
                    <th>Parou em</th>
                    <th>Quando</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {dados.abandonos.map(function (a) {
                    return (
                      <tr key={a.visitorId}>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <PontoLP site={infoSites[a.siteSlug]} />
                            {a.siteNome}
                          </span>
                        </td>
                        <td>{rotularEtapa(a.ultimoPasso)}</td>
                        <td>{dataHoraBR(a.ultimoEm)}</td>
                        <td>
                          <Link className="link-acao" href={"/jornada?visitor_id=" + encodeURIComponent(a.visitorId)}>
                            Ver jornada
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Secao>
        </>
      )}
    </Shell>
  );
}
