import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

function formatarData(date) {
  return date.toISOString().slice(0, 10);
}

export default function VisaoGeral() {
  const router = useRouter();

  function sair() {
    fetch("/api/logout", { method: "POST" }).finally(function () {
      router.push("/login");
    });
  }

  const [dataInicio, setDataInicio] = useState(
    formatarData(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
  );
  const [dataFim, setDataFim] = useState(formatarData(new Date()));
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(
    function () {
      setCarregando(true);
      fetch("/api/visao-geral?inicio=" + dataInicio + "&fim=" + dataFim)
        .then(function (r) {
          return r.json();
        })
        .then(function (resultado) {
          setDados(resultado);
          setCarregando(false);
        });
    },
    [dataInicio, dataFim]
  );

  function aplicarAtalho(dias) {
    setDataInicio(formatarData(new Date(Date.now() - dias * 24 * 60 * 60 * 1000)));
    setDataFim(formatarData(new Date()));
  }

  return (
    <div className="container">
      <div className="header">
        <h1>Visão geral</h1>
        <div className="nav">
          <Link href="/">← Painel por LP</Link>
          <button className="btn-sair" onClick={sair}>Sair</button>
        </div>
      </div>

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

      {carregando && <p className="vazio">Carregando...</p>}

      {!carregando && dados && dados.sites.length === 0 && (
        <p className="vazio">
          Nenhuma LP cadastrada ainda. <Link href="/sites">Cadastre a primeira aqui</Link>.
        </p>
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
                    <td>{s.nome}</td>
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
    </div>
  );
}
