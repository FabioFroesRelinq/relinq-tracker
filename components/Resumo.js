import Icone from "./Icones";

var nf = new Intl.NumberFormat("pt-BR");
var nf1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function fmtN(n) {
  return nf.format(n);
}

function fmtPct1(n) {
  return nf1.format(n) + "%";
}

function fmtTempo(segundos) {
  var s = Math.round(segundos);
  if (s < 60) return s + "s";
  return Math.floor(s / 60) + "m " + String(s % 60).padStart(2, "0") + "s";
}

function ddmm(str) {
  return str.slice(8, 10) + "/" + str.slice(5, 7);
}

// "Hoje", "Em 15/09" ou "Entre 01/09 e 15/09" (sempre as datas reais do filtro)
function frasePeriodo(inicio, fim) {
  var hoje = new Date().toISOString().slice(0, 10);
  if (inicio === fim) return fim === hoje ? "Hoje" : "Em " + ddmm(fim);
  return "Entre " + ddmm(inicio) + " e " + ddmm(fim);
}

// Período de um dia só, que é hoje: ainda não terminou. A comparação é com
// ontem só até a mesma hora (a busca do período anterior usa ?ateAgora=1).
function hojeParcial(inicio, fim) {
  return inicio === fim && fim === new Date().toISOString().slice(0, 10);
}

function F({ children }) {
  return <strong>{children}</strong>;
}

// "(12% a mais que no período anterior)" — null se não dá pra comparar.
function fraseVariacao(atual, anterior, curta, parcial) {
  var relacao = parcial ? "a ontem até este horário" : "ao período anterior";
  if (anterior == null || atual == null) return null;
  if (anterior === 0) return atual > 0 ? (parcial ? "ontem ainda não tinha visitas até este horário" : "sem período anterior para comparar") : null;
  var pct = ((atual - anterior) / anterior) * 100;
  if (Math.abs(pct) < 1) return <>{curta ? "estável" : "estável em relação " + relacao}</>;
  return (
    <>
      <F>{fmtPct1(Math.abs(pct))} {pct > 0 ? "a mais" : "a menos"}</F>
      {curta ? "" : parcial ? " que ontem até este horário" : " que no período anterior"}
    </>
  );
}

function Caixa({ children }) {
  return (
    <p className="resumo">
      <span className="resumo-icone">
        <Icone nome="brilho" tamanho={18} />
      </span>
      <span>{children}</span>
    </p>
  );
}

// Origem que mais trouxe visitas e hora de pico, a partir do /api/stats.
function maiorOrigem(stats) {
  var soma = {};
  var total = 0;
  (stats.porOrigem || []).forEach(function (l) {
    if (l.tipo_evento !== "visita") return;
    var k = l.utm_source || "direto";
    soma[k] = (soma[k] || 0) + l.total;
    total += l.total;
  });
  var chaves = Object.keys(soma).sort(function (a, b) {
    return soma[b] - soma[a];
  });
  if (chaves.length === 0 || total === 0) return null;
  return { nome: chaves[0], pct: (soma[chaves[0]] / total) * 100 };
}

function horaDePico(stats) {
  var porHora = {};
  (stats.mapaCalor || []).forEach(function (l) {
    porHora[l.hora] = (porHora[l.hora] || 0) + l.total;
  });
  var horas = Object.keys(porHora);
  if (horas.length === 0) return null;
  horas.sort(function (a, b) {
    return porHora[b] - porHora[a];
  });
  return Number(horas[0]);
}

// Resumo do painel principal (uma LP ou todas).
export function ResumoPainel({ stats, k, kAnt, nomeLP, todas }) {
  if (!stats || !k) return null;

  var periodo = frasePeriodo(stats.periodo.inicio, stats.periodo.fim);

  if (k.visitantes === 0) {
    return (
      <Caixa>
        {periodo}, <F>nenhuma visita</F> foi registrada {todas ? "nas LPs" : "em " + nomeLP}.
      </Caixa>
    );
  }

  var parcial = hojeParcial(stats.periodo.inicio, stats.periodo.fim);
  var variacao = kAnt ? fraseVariacao(k.visitantes, kAnt.visitantes, false, parcial) : null;
  var origem = maiorOrigem(stats);
  var pico = horaDePico(stats);

  var partes = [];
  if (origem) {
    partes.push(function (primeiro) {
      return (
        <>
          {primeiro ? "A" : "a"} maior parte veio de{" "}
          {origem.nome === "direto" ? <F>acesso direto</F> : <F>{origem.nome}</F>} ({fmtPct1(origem.pct)} das visitas)
        </>
      );
    });
  }
  if (pico != null) {
    partes.push(function (primeiro) {
      return (
        <>
          {primeiro ? "O" : "o"} pico de visitas é por volta das <F>{pico}h</F>
        </>
      );
    });
  }
  if (k.cards > 0) {
    partes.push(function () {
      return (
        <>
          <F>{fmtN(k.cards)} {k.cards === 1 ? "card foi criado" : "cards foram criados"}</F> ({fmtPct1(k.taxaCards)} dos visitantes)
        </>
      );
    });
  } else if (k.conversoes > 0) {
    partes.push(function (primeiro) {
      return (
        <>
          {primeiro ? "H" : "h"}ouve <F>{fmtN(k.conversoes)} {k.conversoes === 1 ? "conversão" : "conversões"}</F> ({fmtPct1(k.taxaConversao)} das visitas)
        </>
      );
    });
  } else if (k.cliques > 0) {
    partes.push(function (primeiro) {
      return (
        <>
          {primeiro ? "H" : "h"}ouve <F>{fmtN(k.cliques)} {k.cliques === 1 ? "clique" : "cliques"}</F>, sem conversões
        </>
      );
    });
  }

  return (
    <Caixa>
      {periodo}, {todas ? "as LPs somadas tiveram" : nomeLP + " teve"} <F>{fmtN(k.visitantes)} {k.visitantes === 1 ? "visitante único" : "visitantes únicos"}</F>
      {variacao ? <> ({variacao})</> : null}.
      {partes.length > 0 && (
        <>
          {" "}
          {partes.map(function (parte, i) {
            var ultimo = i === partes.length - 1;
            return (
              <span key={i}>
                {i > 0 ? (ultimo ? " e " : ", ") : ""}
                {parte(i === 0)}
                {ultimo ? "." : ""}
              </span>
            );
          })}
        </>
      )}
    </Caixa>
  );
}

// Resumo da página de relatórios (engajamento).
export function ResumoRelatorio({ dados, atual, anterior, escopo, plural }) {
  if (!dados || !atual) return null;

  var periodo = frasePeriodo(dados.periodo.inicio, dados.periodo.fim);
  // Quem decide se a comparação é "até a mesma hora" é o servidor (relógio do banco).
  var parcial = !!dados.comparacaoParcial;
  var variacao = anterior ? fraseVariacao(atual.visitantes, anterior.visitantes, false, parcial) : null;

  var celular = atual.disp ? atual.disp.mobile : null;
  var tempoVar = anterior && atual.tempoMedio != null && anterior.tempoMedio ? fraseVariacao(atual.tempoMedio, anterior.tempoMedio, true) : null;

  return (
    <Caixa>
      {periodo}, {escopo} {plural ? "tiveram" : "teve"} <F>{fmtN(atual.visitantes)} {atual.visitantes === 1 ? "visitante único" : "visitantes únicos"}</F>
      {variacao ? <> ({variacao})</> : null}.
      {celular != null && atual.visitantes > 0 && (
        <>
          {" "}
          <F>{fmtPct1(celular)}</F> acessaram pelo celular, <F>{fmtPct1(atual.scroll[50])}</F> rolaram até a metade da página
          {atual.tempoMedio != null ? (
            <>
              {" "}
              e o tempo médio foi de <F>{fmtTempo(atual.tempoMedio)}</F>
              {tempoVar ? <> ({tempoVar})</> : null}
            </>
          ) : null}
          .
        </>
      )}
    </Caixa>
  );
}
