// Mini gráfico de tendência (sem eixos), desenhado esticado na largura do card.
export function Sparkline({ valores }) {
  if (!valores || valores.length < 2) return null;

  var max = Math.max.apply(null, valores);
  var min = Math.min.apply(null, valores);
  var faixa = max - min;
  var n = valores.length;

  var pontos = valores.map(function (v, i) {
    var x = (i / (n - 1)) * 100;
    // Deixa 4 de folga em cima e embaixo pra linha não colar na borda.
    var y = faixa === 0 ? 22 : 36 - ((v - min) / faixa) * 30;
    return [x, y];
  });

  var linha = pontos
    .map(function (p, i) {
      return (i === 0 ? "M" : "L") + p[0].toFixed(2) + " " + p[1].toFixed(2);
    })
    .join(" ");
  var area = linha + " L100 40 L0 40 Z";

  return (
    <svg className="card-spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path className="spark-area" d={area} />
      <path className="spark-linha" d={linha} />
    </svg>
  );
}

// Card de número: rótulo, valor, rodapé (variação etc.) e, se houver, tendência.
export default function CartaoKpi({ rotulo, valor, acento, rodape, serie, secundario }) {
  var temSpark = serie && serie.length > 1;
  return (
    <div className={"card" + (temSpark ? "" : " card-sem-spark")} style={{ "--acento": acento }}>
      <div className="card-topo">
        <span className="card-ponto" />
        <span className="label">{rotulo}</span>
      </div>
      <div className="valor">{valor}</div>
      {secundario && <div className="valor-secundario">{secundario}</div>}
      {rodape && <div className="card-rodape">{rodape}</div>}
      {temSpark && <Sparkline valores={serie} />}
    </div>
  );
}
