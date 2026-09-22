import { useEffect, useRef, useState } from "react";
import Icone from "./Icones";
import estilos from "../styles/ajuda.module.css";

// Ícone de ajuda ("?") que abre um textinho curto explicando a métrica ou
// a seção. Usa position:fixed calculada na hora de abrir (em vez de um
// popover absoluto) porque vários cards têm overflow:hidden — por causa
// do mini-gráfico — e cortariam a caixa de texto.
export default function Ajuda({ texto }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState(null);
  const raizRef = useRef(null);
  const botaoRef = useRef(null);

  useEffect(
    function () {
      if (!aberto) return;

      function posicionar() {
        if (!botaoRef.current) return;
        var r = botaoRef.current.getBoundingClientRect();
        var largura = Math.min(260, window.innerWidth - 24);
        var esquerda = Math.min(Math.max(r.left, 12), window.innerWidth - largura - 12);
        setPos({ top: r.bottom + 6, left: esquerda, largura: largura });
      }
      posicionar();

      function fechar() {
        setAberto(false);
      }
      function aoClicarFora(e) {
        if (raizRef.current && !raizRef.current.contains(e.target)) {
          setAberto(false);
        }
      }

      document.addEventListener("mousedown", aoClicarFora);
      window.addEventListener("scroll", fechar, true);
      window.addEventListener("resize", fechar);

      return function () {
        document.removeEventListener("mousedown", aoClicarFora);
        window.removeEventListener("scroll", fechar, true);
        window.removeEventListener("resize", fechar);
      };
    },
    [aberto]
  );

  if (!texto) return null;

  return (
    <span className={estilos.ajuda} ref={raizRef}>
      <button
        ref={botaoRef}
        type="button"
        className={estilos.botao}
        aria-label="O que é isso?"
        aria-expanded={aberto}
        onClick={function (e) {
          e.preventDefault();
          e.stopPropagation();
          setAberto(function (v) {
            return !v;
          });
        }}
      >
        <Icone nome="ajuda" tamanho={14} />
      </button>
      {aberto && pos && (
        <span className={estilos.balao} role="tooltip" style={{ top: pos.top, left: pos.left, width: pos.largura }}>
          {texto}
        </span>
      )}
    </span>
  );
}
