import { useEffect, useState } from "react";
import Link from "next/link";
import Relogio from "../components/Relogio";
import Shell from "../components/Shell";
import EstadoVazio from "../components/EstadoVazio";
import Esqueleto from "../components/Esqueleto";
import { PontoLP } from "../components/coresLP";

function formatarData(date) {
  return date.toISOString().slice(0, 10);
}

export default function VisaoGeral() {
  const [dataInicio, setDataInicio] = useState(
    formatarData(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
  );
  const [dataFim, setDataFim] = useState(formatarData(new Date()));
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [infoSites, setInfoSites] = useState({}); // slug -> LP (pra pegar a cor)

  useEffect(function () {
    fetch("/api/sites")
      .then(function (r) {
        return r.json();
      })
      .then(function (lista) {
        if (!Array.isArray(lista)) return;
        var mapa = {};
        lista.forEach(function (s) {
          mapa[s.slug] = s;
        });
        setInfoSites(mapa);
      })
      .catch(function () {});
  }, []);

  useEffect(
    function () {
      var primeiraCarga = true;

      function carregarVisaoGeral() {
        if (primeiraCarga) setCarregando(true);
        fetch("/api/visao-geral?inicio=" + dataInicio + "&fim=" + dataFim)
          .then(function (r) {
            return r.json();
          })
          .then(function (resultado) {
            setDados(resultado);
            setCarregando(false);
            primeiraCarga = false;
          });
      }

      carregarVisaoGeral();
      var intervalo = setInterval(carregarVisaoGeral, 10000); // atualiza sozinho a cada 10s

      return function () {
        clearInterval(intervalo);
      };
    },
    [dataInicio, dataFim]
  );

  function aplicarAtalho(dias) {
    setDataInicio(formatarData(new Date(Date.now() - dias * 24 * 60 * 60 * 1000)));
    setDataFim(formatarData(new Date()));
  }

  return (
    <Shell
      titulo="Visão geral"
      subtitulo={
        <span className="atualizacao-automatica">
          Atualiza sozinho a cada 10s <Relogio />
        </span>
      }
    >

      <div className="barra-filtros">
      <div className="filtros">
        <input type="date" value={dataInicio} onChange={function (e) { setDataInicio(e.target.value); }} />
        <input type="date" value={dataFim} onChange={function (e) { setDataFim(e.target.value); }} />
        <div className="atalhos">
          <button className="btn-atalho" onClick={function () { aplicarAtalho(0); }}>Hoje</button>
          <button className="btn-atalho" onClick={function () { aplicarAtalho(7); }}>7 dias</button>
          <button className="btn-atalho" onClick={function () { aplicarAtalho(30); }}>30 dias</button>
          <button className="btn-atalho" onClick={function () { aplicarAtalho(90); }}>90 dias</button>
        </div>
      </div>
      </div>

      {carregando && <Esqueleto cartoes={0} secoes={1} />}

      {!carregando && dados && dados.sites.length === 0 && (
        <EstadoVazio
          titulo="Nenhuma LP cadastrada ainda"
          texto="Cadastre a primeira LP para comparar o desempenho entre elas."
          acao={
            <Link href="/sites" className="btn">
              Cadastrar a primeira LP
            </Link>
          }
        />
      )}

      {!carregando && dados && dados.sites.length > 0 && (
        <div className="secao">
          <table>
            <thead>
              <tr>
                <th>LP</th>
                <th>Visitas</th>
                <th>Cliques</th>
                <th>Conversões</th>
                <th>Taxa de conversão</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dados.sites.map(function (s) {
                return (
                  <tr key={s.slug}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                        <PontoLP site={infoSites[s.slug] || { id: s.id }} />
                        {s.nome}
                      </span>
                    </td>
                    <td>{s.visitas}</td>
                    <td>{s.cliques}</td>
                    <td>{s.conversoes}</td>
                    <td>{s.taxaConversao}%</td>
                    <td>
                      <Link href={"/?site=" + s.slug}>Ver detalhes</Link>
                    </td>
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
