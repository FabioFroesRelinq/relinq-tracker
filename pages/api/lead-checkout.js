import crypto from "crypto";
import { getPool } from "../../lib/db";

// Recebe os dados do formulário de cadastro/checkout de sistemas externos
// (ex: app.relinqbeauty.com.br) e guarda na tabela "clientes", mesmo que a
// pessoa nunca chegue a converter — é o que alimenta a aba /clientes.
//
// Fora do login (não passa pelo middleware, ver a lista em middleware.js),
// autenticado por um segredo compartilhado no header "x-lead-secret" —
// mesmo esquema já usado na integração com o GTM server-side (ver
// pages/api/track.js).

const HEADER_SECRET = "x-lead-secret";

function requisicaoAutenticada(req) {
  const secretEsperado = process.env.LEAD_CHECKOUT_SECRET;
  const secretRecebido = req.headers[HEADER_SECRET];

  // Sem LEAD_CHECKOUT_SECRET configurado, esse endpoint fica sempre
  // fechado (fail closed) — nunca aceita nada por engano.
  if (!secretEsperado || !secretRecebido) return false;

  const bufferEsperado = Buffer.from(secretEsperado);
  const bufferRecebido = Buffer.from(String(secretRecebido));

  if (bufferEsperado.length !== bufferRecebido.length) return false;
  return crypto.timingSafeEqual(bufferEsperado, bufferRecebido);
}

// Rate limit simples em memória (protege contra flood/abuso básico).
const hits = new Map();
const LIMIT_JANELA_MS = 10_000;
const LIMIT_MAX = 20;

function estaAcimaDoLimite(ip) {
  const agora = Date.now();
  const registro = hits.get(ip) || { inicio: agora, contagem: 0 };
  if (agora - registro.inicio > LIMIT_JANELA_MS) {
    hits.set(ip, { inicio: agora, contagem: 1 });
    return false;
  }
  registro.contagem += 1;
  hits.set(ip, registro);
  return registro.contagem > LIMIT_MAX;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  if (!requisicaoAutenticada(req)) {
    return res.status(401).json({ erro: "Não autorizado" });
  }

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
  if (estaAcimaDoLimite(ip)) {
    return res.status(429).json({ erro: "Muitas requisições, tente novamente em instantes" });
  }

  const { visitor_id, nome, email, celular, empresa, cupom, plano, ciclo } = req.body || {};

  if (!visitor_id || (!nome && !email)) {
    return res.status(400).json({ erro: "Campos 'visitor_id' e ao menos 'nome' ou 'email' são obrigatórios" });
  }

  try {
    const pool = getPool();

    // Resolve a LP de origem pelo histórico desse visitante: o site do
    // evento mais recente que ele gerou (normalmente a visita/clique na
    // própria LP, minutos antes de chegar no formulário). Fica nula se
    // não achar nenhum evento com esse visitor_id.
    const [origemRows] = await pool.query(
      "SELECT site_id FROM events WHERE visitor_id = ? ORDER BY criado_em DESC LIMIT 1",
      [visitor_id]
    );
    const siteId = origemRows.length > 0 ? origemRows[0].site_id : null;

    // "ON DUPLICATE KEY" (migration-9: visitor_id único) — permite chamar
    // esse endpoint mais de uma vez pro mesmo visitante (ex: um POST a cada
    // passo de um cadastro em várias etapas, pra capturar quem abandona no
    // meio) sem criar linhas duplicadas: a 2ª chamada atualiza a linha já
    // existente. COALESCE evita apagar um campo já salvo quando uma
    // chamada seguinte simplesmente não manda esse campo de novo (ex: o
    // passo 2 manda "empresa" mas não repete "celular" do passo 1).
    await pool.query(
      `INSERT INTO clientes (visitor_id, site_id, nome, email, celular, empresa, cupom, plano, ciclo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         site_id = COALESCE(VALUES(site_id), site_id),
         nome = COALESCE(VALUES(nome), nome),
         email = COALESCE(VALUES(email), email),
         celular = COALESCE(VALUES(celular), celular),
         empresa = COALESCE(VALUES(empresa), empresa),
         cupom = COALESCE(VALUES(cupom), cupom),
         plano = COALESCE(VALUES(plano), plano),
         ciclo = COALESCE(VALUES(ciclo), ciclo)`,
      [
        visitor_id,
        siteId,
        nome || null,
        email || null,
        celular || null,
        empresa || null,
        cupom || null,
        plano || null,
        ciclo || null,
      ]
    );

    return res.status(201).json({ ok: true });
  } catch (erro) {
    // Tabela ainda não existe (migration-7 não rodou) -> erro claro em vez
    // de 500 genérico, pra facilitar o diagnóstico na primeira instalação.
    if (erro && erro.code === "ER_NO_SUCH_TABLE") {
      console.error("Tabela 'clientes' não existe — rode db/migration-7.sql no banco.");
      return res.status(500).json({ erro: "Tabela 'clientes' não existe — rode db/migration-7.sql" });
    }
    console.error("Erro ao gravar cliente:", erro);
    return res.status(500).json({ erro: "Erro interno ao gravar cliente" });
  }
}
