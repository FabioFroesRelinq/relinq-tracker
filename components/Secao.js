import Icone from "./Icones";

// Seção recolhível. O título é um botão de verdade (teclado e leitor de tela).
export default function Secao({ id, titulo, aberta, aoAlternar, extra, children }) {
  return (
    <section className="secao">
      <div className="secao-cabecalho">
        <h2>
          <button
            type="button"
            className="secao-titulo"
            aria-expanded={aberta}
            onClick={function () {
              aoAlternar(id);
            }}
          >
            {titulo}
            <span className={"secao-seta" + (aberta ? "" : " fechada")}>
              <Icone nome="chevron" tamanho={16} />
            </span>
          </button>
        </h2>
        {extra}
      </div>
      {aberta && children}
    </section>
  );
}
