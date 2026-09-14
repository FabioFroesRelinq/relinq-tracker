import { COOKIE_NAME_SESSAO } from "../../lib/auth";

export default function handler(req, res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME_SESSAO}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
  return res.status(200).json({ ok: true });
}
