import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Shell from "../components/Shell";
import EstadoVazio from "../components/EstadoVazio";
import Esqueleto from "../components/Esqueleto";
import { PontoLP } from "../components/coresLP";
import { lerSiteInicial, salvarSite, lerPeriodoInicial, salvarPeriodo } from "../lib/filtroUrl";

function formatarData(date) {
  return date.toISOString().slice(0, 10);
}

function dataHoraBR(iso) {
  if (!iso) return "—";
  var d = new Date(iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function Clientes() {
  const router = useRouter();

  const [sites, setSites] = useState([]);
  const [siteSelecionado, setSiteSelecionado] = useState("todas");
  const [dataInicio, setDataInicio] = useState(
    formatarData(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
  );
  const [dataFim, setDataFim] = useState(formatarData(new Date()));
  const [filtroHidratado, setFiltroHidratado] = useState(false);
  const [clientes, setClientes] = useState(null);
  const [semTabela, setSemTabela] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");

  // Hidrata o filtro (mesmo esquema do painel principal) e persiste ao
  // mudar, pra manter o recorte ao navegar entre as telas.
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
      fetch("/api/clientes?site=" + siteSelecionado + "&inicio=" + dataInicio + "&fim=" + dataFim)
        .then(function (r) {
          return r.json();
        })
        .then(function (json) {
          if (cancelado) return;
          setClientes(json.clientes || []);
          setSemTabela(!!json.semTabela);
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

  var termo = busca.trim().toLowerCase();
  var listaFiltrada =
    clientes &&
    (termo
      ? clientes.filter(function (c) {
          return (
            (c.nome || "").toLowerCase().indexOf(termo) !== -1 ||
            (c.email || "").toLowerCase().indexOf(termo) !== -1 ||
            (c.empresa || "").toLowerCase().indexOf(termo) !== -1
          );
        })
      : clientes);

  var infoSites = {};
  sites.forEach(function (s) {
    infoSites[s.slug] = s;
  });

  return (
    <Shell
      titulo="Clientes"
      subtitulo="Quem preencheu o formulário de cadastro, converteu ou não"
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
          <input
            type="search"
            placeholder="Buscar por nome, e-mail ou empresa"
            value={busca}
            onChange={function (e) { setBusca(e.target.value); }}
            style={{ marginLeft: "auto", minWidth: 220 }}
          />
        </div>
      </div>

      {carregando && <Esqueleto cartoes={0} secoes={1} />}

      {!carregando && semTabela && (
        <EstadoVazio
          titulo="Tabela de clientes ainda não existe"
          texto="Rode db/migration-7.sql no banco pra habilitar a captura e essa tela."
        />
      )}

      {!carregando && !semTabela && listaFiltrada && listaFiltrada.length === 0 && (
        <EstadoVazio
          titulo="Nenhum cliente nesse período"
          texto="Assim que o formulário de cadastro enviar os primeiros dados, eles aparecem aqui."
        />
      )}

      {!carregando && !semTabela && listaFiltrada && listaFiltrada.length > 0 && (
        <div className="secao">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Contato</th>
                <th>Empresa</th>
                <th>Plano</th>
                <th>Cupom</th>
                <th>LP de origem</th>
                <th>Converteu</th>
                <th>Recebido em</th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map(function (c) {
                return (
                  <tr key={c.id}>
                    <td>{c.nome || "—"}</td>
                    <td>
                      {c.email || "—"}
                      {c.celular ? <div style={{ color: "var(--texto-mudo)", fontSize: "0.85em" }}>{c.celular}</div> : null}
                    </td>
                    <td>{c.empresa || "—"}</td>
                    <td>{c.plano ? c.plano + (c.ciclo ? " (" + c.ciclo + ")" : "") : "—"}</td>
                    <td>{c.cupom || "—"}</td>
                    <td>
                      {c.siteSlug ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <PontoLP site={infoSites[c.siteSlug]} />
                          {c.siteNome}
                        </span>
                      ) : (
                        c.siteNome
                      )}
                    </td>
                    <td>
                      {c.converteu ? (
                        <span style={{ color: "var(--sucesso)" }}>Sim</span>
                      ) : (
                        <span style={{ color: "var(--texto-mudo)" }}>Não</span>
                      )}
                    </td>
                    <td>{dataHoraBR(c.criadoEm)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
