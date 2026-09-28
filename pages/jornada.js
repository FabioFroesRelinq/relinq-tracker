import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Shell from "../components/Shell";

function nomeAmigavelEvento(tipoEvento) {
  var mapa = {
    visita: "Visita",
    conversao: "Conversão",
    clique_whatsapp: "Clique no WhatsApp",
    whatsapp_aberto: "WhatsApp aberto",
    whatsapp_nao_abriu: "WhatsApp não abriu",
  };
  if (mapa[tipoEvento]) return mapa[tipoEvento];
  return tipoEvento.replace(/_/g, " ");
}

// A API já manda o horário pronto ("2026-09-21 13:45:00", em horário de Brasília).
// Lemos o texto direto: passar por new Date() aplicaria o fuso do navegador de novo.
function formatarData(texto) {
  var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(String(texto));
  if (m) return m[3] + "/" + m[2] + "/" + m[1] + ", " + m[4];
  return new Date(texto).toLocaleString("pt-BR");
}

export default function Jornada() {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [candidatos, setCandidatos] = useState(null);
  const [visitorAtual, setVisitorAtual] = useState(null);
  const [eventos, setEventos] = useState(null);
  const [respostasOnboarding, setRespostasOnboarding] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  // Abre direto a jornada de um visitante quando a página é acessada com
  // ?visitor_id=... na URL (ex: o link "Ver jornada" da tela /onboarding).
  useEffect(
    function () {
      if (!router.isReady) return;
      var id = router.query.visitor_id;
      if (id && !visitorAtual) abrirVisitante(String(id));
    },
    [router.isReady, router.query.visitor_id]
  );

  // IDs gerados pelo tracker.js seguem o formato v_<timestamp>_<aleatório>
  // (ex: v_muabo0k8_pnm4p1q7). Se o texto colado já bate com esse formato,
  // pula a busca por rótulo e abre a jornada direto por esse ID.
  var PADRAO_VISITOR_ID = /^v_[a-z0-9]+_[a-z0-9]+$/i;

  function buscarCandidatos(e) {
    e.preventDefault();
    var termo = busca.trim();
    if (!termo) return;

    if (PADRAO_VISITOR_ID.test(termo)) {
      abrirVisitante(termo);
      return;
    }

    setErro("");
    setCarregando(true);
    setEventos(null);
    setVisitorAtual(null);

    fetch("/api/jornada?busca=" + encodeURIComponent(termo))
      .then(function (r) {
        return r.json();
      })
      .then(function (dados) {
        setCandidatos(dados.candidatos || []);
        setCarregando(false);
      })
      .catch(function () {
        setErro("Erro ao buscar.");
        setCarregando(false);
      });
  }

  function abrirVisitante(id) {
    setErro("");
    setCarregando(true);
    setVisitorAtual(id);

    fetch("/api/jornada?visitor_id=" + encodeURIComponent(id))
      .then(function (r) {
        return r.json();
      })
      .then(function (dados) {
        setEventos(dados.eventos || []);
        setRespostasOnboarding(dados.respostasOnboarding || []);
        setCarregando(false);
      })
      .catch(function () {
        setErro("Erro ao carregar a jornada.");
        setCarregando(false);
      });
  }

  function voltarBusca() {
    setVisitorAtual(null);
    setEventos(null);
    setRespostasOnboarding(null);
  }

  return (
    <Shell
      titulo="Jornada do visitante"
      subtitulo="Veja o caminho completo de uma pessoa entre as LPs"
    >

      {!visitorAtual && (
        <div className="secao">
          <h2>Buscar visitante</h2>
          <p className="vazio" style={{ marginBottom: 16 }}>
            Busca por um pedaço de texto salvo como rótulo em algum evento — por
            exemplo, um e-mail capturado na conversão (
            <code>?relinq_evento=conversao&relinq_rotulo=email@exemplo.com</code>
            ). Se você já tem o ID do visitante, pode colar ele direto aqui também.
          </p>
          <form className="filtros" onSubmit={buscarCandidatos}>
            <input
              type="text"
              placeholder="E-mail, nome ou ID do visitante..."
              value={busca}
              onChange={function (e) {
                setBusca(e.target.value);
              }}
              style={{ minWidth: 280 }}
            />
            <button className="btn" type="submit">
              Buscar
            </button>
          </form>

          {carregando && <p className="vazio">Buscando...</p>}
          {erro && <p className="login-erro">{erro}</p>}

          {candidatos && candidatos.length === 0 && (
            <p className="vazio">Nada encontrado com esse termo.</p>
          )}

          {candidatos && candidatos.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Rótulo encontrado</th>
                  <th>Evento</th>
                  <th>Quando</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {candidatos.map(function (c, i) {
                  return (
                    <tr key={c.visitor_id + "-" + i}>
                      <td>{c.rotulo}</td>
                      <td>{nomeAmigavelEvento(c.tipo_evento)}</td>
                      <td>{formatarData(c.criado_em)}</td>
                      <td>
                        <button
                          className="link-acao"
                          onClick={function () {
                            abrirVisitante(c.visitor_id);
                          }}
                        >
                          Ver jornada
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {visitorAtual && (
        <div className="secao">
          <div className="secao-cabecalho">
            <h2>Linha do tempo</h2>
            <button className="link-acao" onClick={voltarBusca}>
              Nova busca
            </button>
          </div>

          {carregando && <p className="vazio">Carregando...</p>}

          {eventos && eventos.length === 0 && (
            <p className="vazio">Nenhum evento encontrado pra esse visitante.</p>
          )}

          {eventos && eventos.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>LP</th>
                  <th>Evento</th>
                  <th>Rótulo</th>
                  <th>Página</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map(function (ev, i) {
                  return (
                    <tr key={i}>
                      <td>{formatarData(ev.criado_em)}</td>
                      <td>{ev.site_nome}</td>
                      <td>{nomeAmigavelEvento(ev.tipo_evento)}</td>
                      <td>{ev.rotulo || "—"}</td>
                      <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ev.pagina || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {respostasOnboarding && respostasOnboarding.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h2>Respostas do onboarding</h2>
              <p className="vazio" style={{ marginBottom: 16 }}>
                Conteúdo completo enviado via relinqTrackPasso(..., {"{"} respostas {"}"}) em cada etapa.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Etapa</th>
                    <th>Resposta</th>
                  </tr>
                </thead>
                <tbody>
                  {respostasOnboarding.map(function (r, i) {
                    return (
                      <tr key={i}>
                        <td>{formatarData(r.criado_em)}</td>
                        <td>{nomeAmigavelEvento(r.passo)}</td>
                        <td style={{ maxWidth: 420, whiteSpace: "pre-wrap" }}>
                          {r.respostas ? JSON.stringify(r.respostas, null, 2) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}
