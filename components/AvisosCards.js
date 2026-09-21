import Icone from "./Icones";
import estilos from "../styles/avisos.module.css";

// Pilha de avisos ("Novo card criado"). Na TV ganha o tamanho "grande".
export default function AvisosCards({ avisos, aoFechar, grande }) {
  return (
    <div className={estilos.pilha + (grande ? " " + estilos.grande : "")} role="status" aria-live="polite">
      {avisos.map(function (a) {
        return (
          <div key={a.chave} className={estilos.aviso} style={a.cor ? { "--cor": a.cor } : undefined}>
            <span className={estilos.icone}>
              <Icone nome="brilho" tamanho={grande ? 26 : 18} />
            </span>
            <div className={estilos.texto}>
              <strong>{a.titulo}</strong>
              <span>{a.corpo}</span>
              {a.meta && <small>{a.meta}</small>}
            </div>
            <button
              type="button"
              className={estilos.fechar}
              aria-label="Fechar aviso"
              onClick={function () {
                aoFechar(a.chave);
              }}
            >
              <Icone nome="fechar" tamanho={16} />
            </button>
            <span className={estilos.barra} aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
}
