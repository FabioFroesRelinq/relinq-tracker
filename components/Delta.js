const nf1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Variação relativa (%) entre dois números. null quando não dá pra comparar.
export function variacao(atual, anterior) {
  if (atual == null || anterior == null) return null;
  if (anterior === 0) return atual === 0 ? { pct: 0 } : { novo: true };
  return { pct: ((atual - anterior) / anterior) * 100 };
}

// invertido: quando cair é bom (ex: taxa de rejeição).
export function Delta({ v, invertido }) {
  if (!v) return null;
  if (v.novo) return <span className="delta delta-neutro">sem base anterior</span>;
  if (Math.abs(v.pct) < 0.05) return <span className="delta delta-neutro">sem variação</span>;
  var sobe = v.pct > 0;
  var bom = invertido ? !sobe : sobe;
  return (
    <span className={"delta " + (bom ? "delta-sobe" : "delta-desce")}>
      {sobe ? "▲" : "▼"} {nf1.format(Math.abs(v.pct))}%
    </span>
  );
}

// Variação em pontos percentuais (p.p.), pra métricas que já são porcentagem.
export function DeltaPP({ atual, anterior, invertido, neutro }) {
  if (atual == null || anterior == null) return null;
  var d = atual - anterior;
  if (Math.abs(d) < 0.05) return <span className="delta delta-neutro">0,0 p.p.</span>;
  var bom = invertido ? d < 0 : d > 0;
  var classe = neutro ? "delta-neutro" : bom ? "delta-sobe" : "delta-desce";
  return <span className={"delta " + classe}>{(d > 0 ? "+" : "−") + nf1.format(Math.abs(d)) + " p.p."}</span>;
}
