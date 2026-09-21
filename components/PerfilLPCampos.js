import { METAS, CHAVES_METAS, EVENTOS_ESPERAVEIS, esperadosPadrao, rotuloEvento } from "../lib/perfil";
import estilos from "../styles/perfillp.module.css";

// Campos do perfil da LP: meta principal e eventos esperados.
// `valor` = { meta: "" | "card_criado" | ..., esperados: [chaves], personalizado: bool }
export default function PerfilLPCampos({ valor, aoMudar }) {
  function mudarMeta(nova) {
    aoMudar({
      meta: nova,
      personalizado: valor.personalizado,
      // enquanto não personaliza, a lista acompanha a sugestão da meta
      esperados: valor.personalizado ? valor.esperados : esperadosPadrao(nova || null),
    });
  }

  function alternarPersonalizar(ligado) {
    aoMudar({
      meta: valor.meta,
      personalizado: ligado,
      esperados: ligado ? valor.esperados : esperadosPadrao(valor.meta || null),
    });
  }

  function alternarEvento(chave) {
    var atual = valor.esperados.slice();
    var pos = atual.indexOf(chave);
    if (pos >= 0) atual.splice(pos, 1);
    else atual.push(chave);
    aoMudar({ meta: valor.meta, personalizado: true, esperados: atual });
  }

  var meta = METAS[valor.meta];

  return (
    <div className={estilos.bloco}>
      <label htmlFor="perfil-meta">Meta principal (opcional)</label>
      <select
        id="perfil-meta"
        className={estilos.select}
        value={valor.meta}
        onChange={function (e) {
          mudarMeta(e.target.value);
        }}
      >
        <option value="">Automática (como era antes)</option>
        {CHAVES_METAS.map(function (c) {
          return (
            <option key={c} value={c}>
              {METAS[c].rotulo}
            </option>
          );
        })}
      </select>
      <p className={estilos.ajuda}>
        {meta
          ? meta.resumo + ". O painel, o resumo, o funil e a TV passam a girar em torno dela."
          : "Sem meta, o painel mostra cards criados quando existirem e conversões nos outros casos."}
      </p>

      <label className={estilos.personalizar}>
        <input
          type="checkbox"
          checked={valor.personalizado}
          onChange={function (e) {
            alternarPersonalizar(e.target.checked);
          }}
        />
        Escolher os eventos esperados
      </label>

      {valor.personalizado ? (
        <div className={estilos.lista} role="group" aria-label="Eventos esperados">
          {EVENTOS_ESPERAVEIS.map(function (e) {
            return (
              <label key={e.chave} className={estilos.item}>
                <input
                  type="checkbox"
                  checked={valor.esperados.indexOf(e.chave) >= 0}
                  onChange={function () {
                    alternarEvento(e.chave);
                  }}
                />
                {e.rotulo}
              </label>
            );
          })}
        </div>
      ) : (
        <p className={estilos.ajuda}>
          Esperados (sugestão): {valor.esperados.map(rotuloEvento).join(", ")}. A tela Saúde do tracking avisa quando um
          deles deixa de chegar.
        </p>
      )}
    </div>
  );
}
