import { PALETA_LP, corValida } from "./coresLP";
import estilos from "../styles/seletorcor.module.css";

// Escolha de cor: paleta pronta, cor livre e "automática" (valor vazio).
export default function SeletorCor({ valor, aoMudar }) {
  var atual = corValida(valor) ? valor : "";
  return (
    <div className={estilos.grupo} role="group" aria-label="Cor da LP">
      <button
        type="button"
        className={estilos.auto + (atual === "" ? " " + estilos.ativo : "")}
        aria-pressed={atual === ""}
        onClick={function () {
          aoMudar("");
        }}
      >
        Automática
      </button>
      {PALETA_LP.map(function (cor) {
        return (
          <button
            key={cor}
            type="button"
            className={estilos.amostra + (atual === cor ? " " + estilos.ativo : "")}
            style={{ background: cor }}
            aria-label={"Usar a cor " + cor}
            aria-pressed={atual === cor}
            onClick={function () {
              aoMudar(cor);
            }}
          />
        );
      })}
      <label className={estilos.livre}>
        <input
          type="color"
          value={atual || "#6366f1"}
          onChange={function (e) {
            aoMudar(e.target.value);
          }}
          aria-label="Escolher outra cor"
        />
        Outra
      </label>
    </div>
  );
}
