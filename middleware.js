import { NextResponse } from "next/server";
import { tokenValidoEdge } from "./lib/auth-edge";

const COOKIE_NAME_SESSAO = "relinq_session";

export async function middleware(req) {
  const token = req.cookies.get(COOKIE_NAME_SESSAO)?.value;
  const valido = await tokenValidoEdge(token, process.env.SESSION_SECRET);

  if (valido) {
    return NextResponse.next();
  }

  // Rotas de API do painel (não a /api/track, que é usada pelas LPs) ->
  // responde 401 em JSON, sem redirecionar.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  // Páginas do painel -> redireciona pro login, guardando pra onde ia.
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("redirect", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

// Só essas rotas passam pelo middleware — /api/track, /tracker.js e /login
// ficam de fora da lista, então continuam acessíveis sem sessão.
export const config = {
  matcher: [
    "/",
    "/sites",
    "/visao-geral",
    "/api/sites",
    "/api/sites/:path*",
    "/api/stats",
    "/api/stats/:path*",
    "/api/visao-geral",
    "/api/visao-geral/:path*",
  ],
};
