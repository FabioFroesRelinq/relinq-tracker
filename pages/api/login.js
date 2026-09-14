import { criarTokenSessao, COOKIE_NAME_SESSAO, DURACAO_SESSAO_MS } from "../../lib/auth";

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  const { usuario, senha } = req.body || {};

  const usuarioOk = usuario && usuario === process.env.PAINEL_USER;
  const senhaOk = senha && senha === process.env.PAINEL_PASSWORD;

  if (!usuarioOk || !senhaOk) {
    return res.status(401).json({ erro: "Usuário ou senha inválidos" });
  }

  const token = criarTokenSessao();
  const maxAge = Math.floor(DURACAO_SESSAO_MS / 1000);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME_SESSAO}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
  );

  return res.status(200).json({ ok: true });
}
