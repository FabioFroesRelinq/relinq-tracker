// Placeholder de carregamento com a mesma "silhueta" do painel.
export default function Esqueleto({ cartoes = 4, secoes = 2 }) {
  var c = [];
  var s = [];
  for (var i = 0; i < cartoes; i++) c.push(i);
  for (var j = 0; j < secoes; j++) s.push(j);
  return (
    <div aria-busy="true" aria-label="Carregando">
      <div className="cards">
        {c.map(function (k) {
          return <div key={k} className="skeleton skeleton-card" />;
        })}
      </div>
      {s.map(function (k) {
        return <div key={k} className="skeleton skeleton-secao" />;
      })}
    </div>
  );
}
