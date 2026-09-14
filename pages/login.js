import { useState } from "react";
import { useRouter } from "next/router";

export default function Login() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  function entrar(e) {
    e.preventDefault();
    setErro("");
    setCarregando(true);

    fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: usuario, senha: senha }),
    })
      .then(function (r) {
        if (!r.ok) throw new Error("Usuário ou senha inválidos");
        return r.json();
      })
      .then(function () {
        const destino =
          (router.query.redirect && String(router.query.redirect)) || "/";
        router.push(destino);
      })
      .catch(function (err) {
        setErro(err.message);
      })
      .finally(function () {
        setCarregando(false);
      });
  }

  return (
    <div className="login-container">
      <form className="login-box" onSubmit={entrar}>
        <img
          src="https://lightblue-monkey-580531.hostingersite.com/wp-content/uploads/2026/09/logo-removebg-preview.png"
          alt="Relinq"
          className="logo-relinq"
        />
        <h1>Relinq Tracker</h1>
        <p>Acesso restrito ao time.</p>

        <label>
          Usuário
          <input
            type="text"
            value={usuario}
            onChange={function (e) {
              setUsuario(e.target.value);
            }}
            autoFocus
            required
          />
        </label>

        <label>
          Senha
          <input
            type="password"
            value={senha}
            onChange={function (e) {
              setSenha(e.target.value);
            }}
            required
          />
        </label>

        {erro ? <p className="login-erro">{erro}</p> : null}

        <button type="submit" disabled={carregando}>
          {carregando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
