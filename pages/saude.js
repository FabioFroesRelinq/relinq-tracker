import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Shell from "../components/Shell";
import Icone from "../components/Icones";
import Esqueleto from "../components/Esqueleto";
import EstadoVazio from "../components/EstadoVazio";
import { PontoLP } from "../components/coresLP";
import estilos from "../styles/saude.module.css";

var nf = new Intl.NumberFormat("pt-BR");

function fmtN(n) {
  return nf.format(n);
}

function fmtPct(n) {
  return n == null ? "—" : Math.round(n) + "%";
}

// "há 5 min", "há 3 h", "há 2 dias"
function haQuanto(min) {
  if (min == null) return "nunca";
  if (min < 1) return "agora há pouco";
  if (min < 60) return "há " + min + " min";
  if (min < 1440) return "há " + Math.floor(min / 60) + " h";
  var d = Math.floor(min / 1440);
  return "há " + d + (d === 1 ? " dia" : " dias");
}

var STATUS = {
  ok: { rotulo: "Recebendo dados", classe: "ok" },
  atencao: { rotulo: "Sem eventos recentes", classe: "atencao" },
  parado: { rotulo: "Parado", classe: "parado" },
  sem_dados: { rotulo: "Nenhum evento recebido", classe: "semDados" },
};

// Eventos que o tracker.js envia sozinho em qualquer LP.
var NUCLEO = [
  { chave: "visita", rotulo: "Visitas" },
  { chave: "scroll_profundidade", rotulo: "Rolagem" },
  { chave: "tempo_pagina", rotulo: "Tempo na página" },
];

// Outros eventos: só aparecem quando existem.
var EXTRAS = [
  { chave: "cliques", rotulo: "Cliques" },
  { chave: "card_criado", rotulo: "Cards criados" },
  { chave: "conversao", rotulo: "Conversões" },
  { chave: "video", rotulo: "Vídeo" },
  { chave: "quiz", rotulo: "Quiz" },
  { chave: "gtm", rotulo: "Eventos do GTM" },
];

function diagnostico(s) {
  if (s.status === "sem_dados") {
    return "Nenhum evento chegou ainda. Cole o script abaixo antes do </body> da LP e abra a página uma vez.";
  }
  if (s.status === "parado") {
    return 'Sem eventos há mais de 24 h. Confira se o script do tracker continua na página e se o data-site é "' + s.slug + '".';
  }
  if (s.status === "atencao") {
    return "Pode ser só pouco movimento. Se essa LP costuma receber visitas nesse horário, confira se o script continua na página.";
  }
  return null;
}

function CartaoSaude({ s, copiado, aoCopiar }) {
  var st = STATUS[s.status];
  var max = Math.max.apply(null, s.horas.concat([1]));
  var texto = st.rotulo;
  if (s.status === "atencao") texto = "Sem eventos " + haQuanto(s.minUltimoEvento);
  if (s.status === "parado") texto = "Parado " + haQuanto(s.minUltimoEvento);
  var aviso = diagnostico(s);
  var visitas = s.categorias.visita ? s.categorias.visita.total : 0;

  return (
    <article className={estilos.cartao}>
      <header className={estilos.topo}>
        <div className={estilos.nome}>
          <PontoLP site={s} tamanho={12} />
          <div>
            <h2>{s.nome}</h2>
            <span className={estilos.dominio}>{s.dominio || s.slug}</span>
          </div>
        </div>
        <span className={estilos.selo + " " + estilos[st.classe]}>{texto}</span>
      </header>

      <dl className={estilos.tempos}>
        <div>
          <dt>Último evento</dt>
          <dd>{haQuanto(s.minUltimoEvento)}</dd>
        </div>
        <div>
          <dt>Última visita</dt>
          <dd>{s.categorias.visita ? haQuanto(s.categorias.visita.minUltimo) : "nenhuma em 7 dias"}</dd>
        </div>
      </dl>

      <div>
        <div className={estilos.rotuloBloco}>Eventos por hora, nas últimas 24 h</div>
        <div className={estilos.horas} role="img" aria-label="Eventos por hora nas últimas 24 horas">
          {s.horas.map(function (v, i) {
            var atras = 23 - i;
            return (
              <span
                key={i}
                className={estilos.hora}
                style={{ height: Math.max(v > 0 ? 8 : 3, (v / max) * 100) + "%" }}
                title={(atras === 0 ? "Na última hora" : "Há " + atras + " h") + ": " + fmtN(v) + (v === 1 ? " evento" : " eventos")}
                data-vazio={v === 0 ? "1" : undefined}
              />
            );
          })}
        </div>
        <div className={estilos.eixoHoras}>
          <span>24 h atrás</span>
          <span>agora</span>
        </div>
      </div>

      <div>
        <div className={estilos.rotuloBloco}>Recebidos nos últimos 7 dias</div>
        <ul className={estilos.eventos}>
          {NUCLEO.map(function (e) {
            var c = s.categorias[e.chave];
            var faltando = !c;
            // Se nem visita chegou, não faz sentido cobrar rolagem e tempo.
            var cobrar = faltando && visitas > 0;
            return (
              <li
                key={e.chave}
                className={estilos.evento + " " + (c ? estilos.eventoOk : cobrar ? estilos.eventoAlerta : estilos.eventoVazio)}
                title={
                  cobrar
                    ? "O tracker.js envia esse evento sozinho. Se não chega, o script da LP pode estar desatualizado."
                    : undefined
                }
              >
                {e.rotulo}
                <strong>{c ? fmtN(c.total) : "não chegou"}</strong>
              </li>
            );
          })}
          {EXTRAS.filter(function (e) {
            return s.categorias[e.chave];
          }).map(function (e) {
            return (
              <li key={e.chave} className={estilos.evento + " " + estilos.eventoNeutro}>
                {e.rotulo}
                <strong>{fmtN(s.categorias[e.chave].total)}</strong>
              </li>
            );
          })}
        </ul>
      </div>

      {s.qualidade.eventos7d > 0 && (
        <div className={estilos.qualidade}>
          <div>
            <div className={estilos.medidor}>
              <span>Visitantes identificados</span>
              <strong>{fmtPct(s.qualidade.identificados)}</strong>
            </div>
            <div className={estilos.trilha}>
              <span
                className={s.qualidade.identificados < 90 ? estilos.trilhaAlerta : undefined}
                style={{ width: (s.qualidade.identificados || 0) + "%" }}
              />
            </div>
          </div>
          <div>
            <div className={estilos.medidor}>
              <span>Visitas com origem (UTM)</span>
              <strong>{fmtPct(s.qualidade.comOrigem)}</strong>
            </div>
            <div className={estilos.trilha}>
              <span style={{ width: (s.qualidade.comOrigem || 0) + "%" }} />
            </div>
          </div>
          {s.qualidade.identificados != null && s.qualidade.identificados < 90 && (
            <p className={estilos.nota}>
              Parte dos eventos chega sem ID de visitante (o navegador bloqueou o armazenamento ou o script é antigo).
              Isso pode subcontar visitantes únicos.
            </p>
          )}
        </div>
      )}

      {aviso && <p className={estilos.aviso}>{aviso}</p>}

      <button type="button" className={"btn-atalho " + estilos.copiar} onClick={function () { aoCopiar(s); }}>
        <Icone nome={copiado === s.slug ? "check" : "copiar"} tamanho={16} />
        {copiado === s.slug ? "Script copiado" : "Copiar script de instalação"}
      </button>
    </article>
  );
}

export default function SaudeTracking() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [copiado, setCopiado] = useState("");
  const temporizador = useRef(null);

  useEffect(function () {
    var cancelado = false;

    function carregar() {
      fetch("/api/saude")
        .then(function (r) {
          return r.json().then(function (json) {
            if (!r.ok) throw new Error(json.erro || "Erro ao carregar");
            return json;
          });
        })
        .then(function (json) {
          if (cancelado) return;
          setDados(json);
          setErro("");
          setAtualizadoEm(new Date());
        })
        .catch(function (e) {
          if (!cancelado) setErro(e.message);
        });
    }

    carregar();
    var id = setInterval(carregar, 30000);
    return function () {
      cancelado = true;
      clearInterval(id);
      clearTimeout(temporizador.current);
    };
  }, []);

  function copiarScript(s) {
    var tag = '<script src="' + window.location.origin + '/tracker.js" data-site="' + s.slug + '"></script>';
    function feito() {
      setCopiado(s.slug);
      clearTimeout(temporizador.current);
      temporizador.current = setTimeout(function () {
        setCopiado("");
      }, 2200);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tag).then(feito).catch(function () {
        window.prompt("Copie o script abaixo:", tag);
      });
    } else {
      window.prompt("Copie o script abaixo:", tag);
    }
  }

  var contagem = { ok: 0, atencao: 0, parado: 0, sem_dados: 0 };
  if (dados) {
    dados.sites.forEach(function (s) {
      contagem[s.status] += 1;
    });
  }

  return (
    <Shell
      titulo="Saúde do tracking"
      subtitulo={
        <span>
          Confira se cada LP está enviando dados. Atualiza a cada 30s
          {atualizadoEm ? " · última leitura " + atualizadoEm.toLocaleTimeString("pt-BR") : ""}
        </span>
      }
    >
      {erro && (
        <p className="login-erro" role="alert">
          Não foi possível atualizar agora ({erro}).{dados ? " Mostrando a última leitura." : ""}
        </p>
      )}

      {!dados && !erro && <Esqueleto cartoes={0} secoes={2} />}

      {dados && dados.sites.length === 0 && (
        <EstadoVazio
          titulo="Nenhuma LP cadastrada ainda"
          texto="Cadastre uma LP e cole o script do tracker nela para acompanhar a saúde do envio de dados."
          acao={
            <Link href="/sites" className="btn">
              Cadastrar a primeira LP
            </Link>
          }
        />
      )}

      {dados && dados.sites.length > 0 && (
        <>
          <div className={estilos.resumo}>
            <span className={estilos.selo + " " + estilos.ok}>{contagem.ok} recebendo dados</span>
            {contagem.atencao > 0 && (
              <span className={estilos.selo + " " + estilos.atencao}>{contagem.atencao} sem eventos recentes</span>
            )}
            {contagem.parado > 0 && (
              <span className={estilos.selo + " " + estilos.parado}>{contagem.parado} parada{contagem.parado > 1 ? "s" : ""}</span>
            )}
            {contagem.sem_dados > 0 && (
              <span className={estilos.selo + " " + estilos.semDados}>{contagem.sem_dados} sem nenhum evento</span>
            )}
            <span className={estilos.legenda}>
              Verde: evento na última hora. Âmbar: entre 1 h e 24 h. Vermelho: mais de 24 h sem eventos.
            </span>
          </div>

          <div className={estilos.grade}>
            {dados.sites.map(function (s) {
              return <CartaoSaude key={s.slug} s={s} copiado={copiado} aoCopiar={copiarScript} />;
            })}
          </div>
        </>
      )}
    </Shell>
  );
}
