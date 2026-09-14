import { getPool } from "../../lib/db";

// Rate limit bem simples em memória (protege contra flood básico).
// Em produção com mais de 1 instância rodando, trocar por Redis.
const hits = new Map();
const LIMIT_JANELA_MS = 10_000; // 10s
const LIMIT_MAX = 20; // no máximo 20 eventos por IP a cada 10s

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
  // Libera CORS pois as LPs ficam em domínios diferentes do tracker.
  // Não usamos "*" porque o sendBeacon sempre envia a requisição com
  // credenciais incluídas, e o navegador exige a origem exata (não curinga)
  // nesse caso — por isso ecoamos de volta o Origin recebido.
  const origem = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origem);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress;

  if (estaAcimaDoLimite(ip)) {
    return res.status(429).json({ erro: "Muitas requisições, tente novamente em instantes" });
  }

  const {
    site,           // slug do site, ex: "relinq-beauty"
    evento,         // tipo do evento, ex: "visita", "clique_whatsapp", "video_progress"
    pagina,
    video_id,       // identifica o video, se houver mais de um na LP
    valor,          // uso livre: percentual (video_progress/scroll_profundidade) ou segundos (tempo_pagina, etc.)
    visitor_id,     // ID anônimo do visitante (localStorage), pra visitantes únicos e bounce rate
    dispositivo,    // 'mobile', 'tablet' ou 'desktop'
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
  } = req.body || {};

  if (!site || !evento) {
    return res.status(400).json({ erro: "Campos 'site' e 'evento' são obrigatórios" });
  }

  try {
    const pool = getPool();

    const [siteRows] = await pool.query(
      "SELECT id FROM sites WHERE slug = ? LIMIT 1",
      [site]
    );

    if (siteRows.length === 0) {
      return res.status(404).json({ erro: `Site '${site}' não cadastrado` });
    }

    const siteId = siteRows[0].id;

    await pool.query(
      `INSERT INTO events
        (site_id, tipo_evento, pagina, video_id, valor, visitor_id, dispositivo, utm_source, utm_medium, utm_campaign, utm_content, utm_term)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        siteId,
        evento,
        pagina || null,
        video_id || null,
        valor === undefined || valor === null ? null : Number(valor),
        visitor_id || null,
        dispositivo || null,
        utm_source || null,
        utm_medium || null,
        utm_campaign || null,
        utm_content || null,
        utm_term || null,
      ]
    );

    return res.status(201).json({ ok: true });
  } catch (erro) {
    console.error("Erro ao gravar evento:", erro);
    return res.status(500).json({ erro: "Erro interno ao gravar evento" });
  }
}
