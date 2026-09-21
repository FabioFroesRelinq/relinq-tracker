import { useEffect, useRef, useState } from "react";
import Icone from "./Icones";
import estilos from "../styles/avisos.module.css";

// Botão de sino no menu lateral: liga/desliga os avisos de card criado.
export default function MenuAvisos({ prefs, atualizarPrefs, permissao, pedirPermissao, classeItem }) {
  var [aberto, setAberto] = useState(false);
  var raiz = useRef(null);

  useEffect(
    function () {
      if (!aberto) return;
      function fora(e) {
        if (raiz.current && !raiz.current.contains(e.target)) setAberto(false);
      }
      function esc(e) {
        if (e.key === "Escape") setAberto(false);
      }
      document.addEventListener("mousedown", fora);
      document.addEventListener("keydown", esc);
      return function () {
        document.removeEventListener("mousedown", fora);
        document.removeEventListener("keydown", esc);
      };
    },
    [aberto]
  );

  var sistemaSuportado = permissao !== "indisponivel";
  var sistemaBloqueado = permissao === "denied";

  function alternarSistema(marcado) {
    if (marcado && permissao !== "granted") {
      pedirPermissao(); // marca sozinho se a pessoa permitir
      return;
    }
    atualizarPrefs({ sistema: marcado });
  }

  return (
    <div ref={raiz} className={estilos.menuRaiz}>
      <button
        type="button"
        className={classeItem}
        aria-expanded={aberto}
        aria-haspopup="true"
        onClick={function () {
          setAberto(!aberto);
        }}
      >
        <Icone nome="sino" />
        {prefs.card ? "Avisos de card" : "Avisos desligados"}
      </button>

      {aberto && (
        <div className={estilos.menu} role="group" aria-label="Avisos de card criado">
          <label className={estilos.opcao}>
            <input
              type="checkbox"
              checked={prefs.card}
              onChange={function (e) {
                atualizarPrefs({ card: e.target.checked });
              }}
            />
            <span>
              Avisar quando um card for criado
              <small>Aparece um popup em qualquer página do painel.</small>
            </span>
          </label>

          <label className={estilos.opcao + (prefs.card ? "" : " " + estilos.desligada)}>
            <input
              type="checkbox"
              checked={prefs.som}
              disabled={!prefs.card}
              onChange={function (e) {
                atualizarPrefs({ som: e.target.checked });
              }}
            />
            <span>
              Tocar um som
              <small>Toca depois que você interagir com a página.</small>
            </span>
          </label>

          {sistemaSuportado && (
            <label className={estilos.opcao + (prefs.card && !sistemaBloqueado ? "" : " " + estilos.desligada)}>
              <input
                type="checkbox"
                checked={prefs.sistema && permissao === "granted"}
                disabled={!prefs.card || sistemaBloqueado}
                onChange={function (e) {
                  alternarSistema(e.target.checked);
                }}
              />
              <span>
                Notificação do sistema
                <small>
                  {sistemaBloqueado
                    ? "Bloqueada no navegador: libere nas configurações do site."
                    : "Avisa também quando você estiver em outra aba ou programa. O painel precisa continuar aberto."}
                </small>
              </span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
