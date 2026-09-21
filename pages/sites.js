import { useEffect, useState } from "react";
import Shell from "../components/Shell";
import SeletorCor from "../components/SeletorCor";
import PerfilLPCampos from "../components/PerfilLPCampos";
import { esperadosPadrao, lerEsperados } from "../lib/perfil";
import { PontoLP } from "../components/coresLP";

export default function CadastroSites() {
  const [sites, setSites] = useState([]);
  const [nome, setNome] = useState("");
  const [dominio, setDominio] = useState("");
  const [cor, setCor] = useState("");
  const [perfil, setPerfil] = useState({ meta: "", esperados: esperadosPadrao(null), personalizado: false });
  const [perfilEdicao, setPerfilEdicao] = useState({ meta: "", esperados: esperadosPadrao(null), personalizado: false });
  const [mensagem, setMensagem] = useState("");
  const [editando, setEditando] = useState(null); // guarda o site em edição, ou null

  function carregarSites() {
    fetch("/api/sites")
      .then(function (r) {
        return r.json();
      })
      .then(setSites);
  }

  useEffect(carregarSites, []);

  function cadastrar(e) {
    e.preventDefault();
    setMensagem("");

    fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: nome,
        dominio: dominio,
        cor: cor,
        meta_principal: perfil.meta,
        eventos_esperados: perfil.personalizado ? perfil.esperados : "",
      }),
    })
      .then(function (r) {
        return r.json().then(function (dados) {
          return { status: r.status, dados: dados };
        });
      })
      .then(function (resultado) {
        if (resultado.status === 201) {
          setMensagem(
            "LP cadastrada! Slug: " +
              resultado.dados.slug +
              (resultado.dados.corSalva === false
                ? ". A cor não foi salva: falta rodar o db/migration-4.sql no banco (veja o README)."
                : "") +
              (resultado.dados.perfilSalvo === false
                ? ". O perfil (meta e eventos esperados) não foi salvo: falta rodar o db/migration-6.sql no banco (veja o README)."
                : "")
          );
          setNome("");
          setDominio("");
          setCor("");
          setPerfil({ meta: "", esperados: esperadosPadrao(null), personalizado: false });
          carregarSites();
        } else {
          setMensagem(resultado.dados.erro || "Erro ao cadastrar");
        }
      });
  }

  function iniciarEdicao(site) {
    setEditando({ id: site.id, nome: site.nome, dominio: site.dominio || "", cor: site.cor || "" });
    var salvos = lerEsperados(site.eventos_esperados);
    setPerfilEdicao({
      meta: site.meta_principal || "",
      personalizado: !!salvos,
      esperados: salvos || esperadosPadrao(site.meta_principal || null),
    });
  }

  function salvarEdicao(e) {
    e.preventDefault();

    fetch("/api/sites", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        Object.assign({}, editando, {
          meta_principal: perfilEdicao.meta,
          eventos_esperados: perfilEdicao.personalizado ? perfilEdicao.esperados : "",
        })
      ),
    }).then(function (r) {
      if (r.ok) {
        r.json().then(function (dados) {
          if (dados && dados.corSalva === false) {
            setMensagem("A cor não foi salva: falta rodar o db/migration-4.sql no banco (veja o README).");
          } else if (dados && dados.perfilSalvo === false) {
            setMensagem("O perfil não foi salvo: falta rodar o db/migration-6.sql no banco (veja o README).");
          }
        });
        setEditando(null);
        carregarSites();
      }
    });
  }

  function excluir(site) {
    var confirmou = window.confirm(
      "Excluir a LP \"" + site.nome + "\"? Isso apaga também todos os eventos registrados dela. Essa ação não pode ser desfeita."
    );
    if (!confirmou) return;

    fetch("/api/sites?id=" + site.id, { method: "DELETE" }).then(function (r) {
      if (r.ok) carregarSites();
    });
  }

  return (
    <Shell titulo="Cadastrar LP" subtitulo="Cada LP recebe um slug para usar no script do tracker">

      <form className="form-cadastro" onSubmit={cadastrar}>
        <label>Nome da LP</label>
        <input
          value={nome}
          onChange={function (e) {
            setNome(e.target.value);
          }}
          placeholder="Ex: Relinq Beauty"
          required
        />

        <label>Domínio (opcional)</label>
        <input
          value={dominio}
          onChange={function (e) {
            setDominio(e.target.value);
          }}
          placeholder="Ex: beauty.relinq.com"
        />

        <label>Cor de destaque (opcional)</label>
        <SeletorCor valor={cor} aoMudar={setCor} />

        <PerfilLPCampos valor={perfil} aoMudar={setPerfil} />

        <button className="btn" type="submit">
          Cadastrar
        </button>

        {mensagem && <p style={{ marginTop: 12, fontSize: 14 }}>{mensagem}</p>}
      </form>

      <div className="secao" style={{ marginTop: 24 }}>
        <h2>LPs cadastradas</h2>
        {sites.length === 0 ? (
          <p className="vazio">Nenhuma LP cadastrada ainda.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Slug (usar no data-site)</th>
                <th>Domínio</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sites.map(function (s) {
                return (
                  <tr key={s.slug}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                        <PontoLP site={s} />
                        {s.nome}
                      </span>
                    </td>
                    <td>
                      <code>{s.slug}</code>
                    </td>
                    <td>{s.dominio || "-"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="link-acao" onClick={function () { iniciarEdicao(s); }}>
                        Editar
                      </button>
                      {" · "}
                      <button className="link-acao link-perigo" onClick={function () { excluir(s); }}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editando && (
        <div className="modal-fundo" onClick={function () { setEditando(null); }}>
          <form
            className="form-cadastro"
            onClick={function (e) { e.stopPropagation(); }}
            onSubmit={salvarEdicao}
          >
            <h2 style={{ marginTop: 0 }}>Editar LP</h2>

            <label>Nome da LP</label>
            <input
              value={editando.nome}
              onChange={function (e) {
                setEditando(Object.assign({}, editando, { nome: e.target.value }));
              }}
              required
            />

            <label>Domínio (opcional)</label>
            <input
              value={editando.dominio}
              onChange={function (e) {
                setEditando(Object.assign({}, editando, { dominio: e.target.value }));
              }}
            />

            <label>Cor de destaque</label>
            <SeletorCor
              valor={editando.cor}
              aoMudar={function (nova) {
                setEditando(Object.assign({}, editando, { cor: nova }));
              }}
            />

            <PerfilLPCampos valor={perfilEdicao} aoMudar={setPerfilEdicao} />

            <p className="vazio" style={{ marginTop: 8 }}>
              O slug (usado no data-site do snippet) não muda ao editar, pra não quebrar
              o código já instalado na LP.
            </p>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" type="submit">
                Salvar
              </button>
              <button
                className="btn-atalho"
                type="button"
                onClick={function () { setEditando(null); }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </Shell>
  );
}
