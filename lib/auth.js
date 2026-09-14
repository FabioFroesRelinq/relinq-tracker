// Sessão do painel — usada pelas API routes de login/logout (Node.js normal).
// O middleware usa a versão equivalente em lib/auth-edge.js, porque o
// Edge Runtime não tem acesso ao módulo "crypto" do Node.
import crypto from "crypto";

export const COOKIE_NAME_SESSAO = "relinq_session";
export const DURACAO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function getSegredo() {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo) {
    throw new Error(
      "SESSION_SECRET não definido no .env.local — gere um valor aleatório e adicione lá."
    );
  }
  return segredo;
}

function assinar(valor) {
  return crypto.createHmac("sha256", getSegredo()).update(valor).digest("hex");
}

export function criarTokenSessao() {
  const expiraEm = Date.now() + DURACAO_SESSAO_MS;
  const payload = String(expiraEm);
  return payload + "." + assinar(payload);
}

export function tokenValido(token) {
  if (!token) return false;
  const partes = token.split(".");
  if (partes.length !== 2) return false;

  const [payload, assinatura] = partes;
  const esperada = assinar(payload);

  const bufA = Buffer.from(assinatura);
  const bufB = Buffer.from(esperada);
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return false;
  }

  const expiraEm = Number(payload);
  return !!expiraEm && Date.now() <= expiraEm;
}
