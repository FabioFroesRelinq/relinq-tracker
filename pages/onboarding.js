import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Shell from "../components/Shell";
import Secao from "../components/Secao";
import CartaoKpi from "../components/CartaoKpi";
import EstadoVazio from "../components/EstadoVazio";
import Esqueleto from "../components/Esqueleto";
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

export default function Onboarding() {
  const router = useRouter();

  const [sites, setSites] = useState([]);
  const [siteSelecionado, setSiteSelecionado] = useState("todas");
  const [dataInicio, setDataInicio] = useState(formatarData(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [dataFim, setDataFim] = useState(formatarData(new Date()));
  const [filtroHidratado, setFiltroHidratado] = useState(false);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);

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

      {carregando && <Esqueleto cartoes={4} secoes={2} />}

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
            <CartaoKpi rotulo="Iniciaram" valor={fmtN(dados.iniciaram)} acento="#6366f1" />
            <CartaoKpi rotulo="Concluíram" valor={fmtN(dados.concluiram)} acento="#22c55e" />
            <CartaoKpi rotulo="Taxa de conclusão" valor={fmtPct1(dados.taxaConclusao)} acento="#14b8a6" />
          </div>

          <Secao id="funil-onboarding" titulo="Funil de etapas" aberta aoAlternar={function () {}}>
            <div className="funil">
              {dados.etapas.map(function (e, i) {
                var pctTotal = dados.etapas[0].visitantes > 0 ? Math.min(100, (e.visitantes / dados.etapas[0].visitantes) * 100) : 0;
                var anterior = i > 0 ? dados.etapas[i - 1].visitantes : null;
                var passo = anterior && e.visitantes <= anterior ? (e.visitantes / anterior) * 100 : null;
                return (
                  <div className="funil-etapa" key={e.evento}>
                    <span className="funil-nome">{nomeAmigavelEtapa(e.evento)}</span>
                    <div className="funil-trilha">
                      <div className="funil-barra" style={{ width: Math.max(pctTotal, 1.5) + "%", background: "#6366f1" }} />
                    </div>
                    <div className="funil-numeros">
                      <span className="funil-valor">{fmtN(e.visitantes)}</span>
                      <span className="funil-info">{fmtPct1(pctTotal)} do 1º passo</span>
                      {passo != null && <span className="funil-info">{fmtPct1(passo)} da etapa anterior</span>}
                      {e.tempoMedioSegundos != null && (
                        <span className="funil-info">tempo médio: {fmtTempo(e.tempoMedioSegundos)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="valor-secundario" style={{ marginTop: 14 }}>
              A ordem das etapas segue quantos visitantes chegaram em cada uma (não uma ordem fixa configurada) —
              conforme os passos do fluxo forem enviados pelo app, a ordem aqui se ajusta sozinha. A conclusão
              (evento "quiz_finalizado") entra no card "Concluíram" acima, fora dessa lista.
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
                    <h3 className="grafico-subtitulo">{nomeAmigavelEtapa(evento)}</h3>
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
                      {nomeAmigavelEtapa(passo)} <span className="valor-secundario">— {fmtN(info.total)} respostas</span>
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
                        <td>{nomeAmigavelEtapa(a.ultimoPasso)}</td>
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
