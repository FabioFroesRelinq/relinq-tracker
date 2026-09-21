import Icone from "./Icones";

// Tela vazia que diz o que aconteceu e o que fazer a seguir.
export default function EstadoVazio({ titulo, texto, icone = "inbox", acao }) {
  return (
    <div className="estado-vazio">
      <div className="estado-icone">
        <Icone nome={icone} tamanho={22} />
      </div>
      <h3>{titulo}</h3>
      {texto && <p>{texto}</p>}
      {acao}
    </div>
  );
}
