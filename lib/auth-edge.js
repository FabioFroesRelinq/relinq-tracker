// O middleware.js roda no Edge Runtime, que não tem o módulo "crypto" do
// Node — por isso essa versão usa a Web Crypto API (globalThis.crypto),
// mas calcula a MESMA assinatura HMAC-SHA256 que lib/auth.js, então os
// tokens gerados no login (Node) são validados normalmente aqui.

async function assinar(valor, segredo) {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const buffer = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(valor));
  return Array.from(new Uint8Array(buffer))
    .map(function (b) {
      return b.toString(16).padStart(2, "0");
    })
    .join("");
}

export async function tokenValidoEdge(token, segredo) {
  if (!token || !segredo) return false;

  const partes = token.split(".");
  if (partes.length !== 2) return false;

  const [payload, assinatura] = partes;
  const esperada = await assinar(payload, segredo);
  if (assinatura !== esperada) return false;

  const expiraEm = Number(payload);
  return !!expiraEm && Date.now() <= expiraEm;
}
