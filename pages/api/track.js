import crypto from "crypto";
import { getPool } from "../../lib/db";

// Rate limit bem simples em memória (protege contra flood básico).
// Em produção com mais de 1 instância rodando, trocar por Redis.
// Só se aplica ao tráfego do navegador — chamadas autenticadas do GTM
// (ver mais abaixo) não passam por aqui, pois já são confiáveis.
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

// --- Integração com o GTM server-side ---
// A tag "Solicitação HTTP" criada no container server (vinculada ao
// trigger "Todos os Eventos - GA4" já existente) manda TODOS os eventos
// GA4 pra cá, autenticados por um header com um segredo compartilhado.
// Isso é proposital: o filtro de "quais eventos interessam" fica aqui no
// código (allowlist), não dentro do próprio GTM — assim ajustar o que
// entra no tracker nunca exige mexer na configuração do GTM de novo, e
// não corremos risco de interferir na tag que já manda dados pra Meta.
const HEADER_SECRET_GTM = "x-gtm-secret";

function listaDoEnv(nomeVar) {
  return (process.env[nomeVar] || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function requisicaoAutenticadaPeloGtm(req) {
  const secretEsperado = process.env.GTM_SERVER_SECRET;
  const secretRecebido = req.headers[HEADER_SECRET_GTM];

  // Sem GTM_SERVER_SECRET configurado no ambiente, esse caminho fica
  // sempre fechado (fail closed) — nunca aceita nada como vindo do GTM.
  if (!secretEsperado || !secretRecebido) return false;

  const bufferEsperado = Buffer.from(secretEsperado);
  const bufferRecebido = Buffer.from(String(secretRecebido));

  // Comparação em tempo constante, pra não vazar o tamanho/conteúdo do
  // secret através do tempo de resposta.
  if (bufferEsperado.length !== bufferRecebido.length) return false;
  return crypto.timingSafeEqual(bufferEsperado, bufferRecebido);
}

// --- Localização aproximada ---
// A Vercel informa país, estado e cidade de quem fez a requisição nos
// cabeçalhos abaixo. Guardamos SÓ esses três campos: o IP nunca é gravado.
// Chamadas do GTM server-side não entram: o IP delas é o do servidor do GTM,
// então a localização seria a errada.
function localizacaoDaRequisicao(req) {
  const pais = String(req.headers["x-vercel-ip-country"] || "").toUpperCase();
  const regiao = String(req.headers["x-vercel-ip-country-region"] || "");
  const cidadeBruta = String(req.headers["x-vercel-ip-city"] || "");

  let cidade = null;
  try {
    // A cidade vem codificada (ex: "S%C3%A3o%20Paulo").
    cidade =
      decodeURIComponent(cidadeBruta)
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 100) || null;
  } catch (e) {
    cidade = null;
  }

  return {
    pais: /^[A-Z]{2}$/.test(pais) ? pais : null,
    estado: /^[A-Za-z0-9-]{1,10}$/.test(regiao) ? regiao.toUpperCase() : null,
    cidade,
  };
}

// As colunas pais/estado/cidade vêm da migration-5. Enquanto ela não rodar, o
// tracker segue gravando do jeito antigo (nunca deixa de coletar por causa disso).
let geoCache = { existe: false, ate: 0 };

async function colunasGeoExistem(pool) {
  const agora = Date.now();
  if (agora < geoCache.ate) return geoCache.existe;
  try {
    const [linhas] = await pool.query(
      "SHOW COLUMNS FROM events WHERE Field IN ('pais', 'estado', 'cidade')"
    );
    const existe = linhas.length === 3;
    // Achou: confere de novo em 1 h. Não achou: tenta de novo em 1 min (logo após rodar a migration).
    geoCache = { existe, ate: agora + (existe ? 3600000 : 60000) };
  } catch (e) {
    geoCache = { existe: false, ate: agora + 60000 };
  }
  return geoCache.existe;
}

export default async function handler(req, res) {
  const vemDoGtm = requisicaoAutenticadaPeloGtm(req);

  // O CORS abaixo só existe pro tracker.js rodando no navegador (sendBeacon
  // sempre manda credenciais, então o navegador exige a origem exata, não
  // curinga). Chamada autenticada do GTM é servidor-a-servidor: não passa
  // por navegador, então não precisa (nem deve) ganhar esses headers.
  if (!vemDoGtm) {
    const origem = req.headers.origin || "*";
    res.setHeader("Access-Control-Allow-Origin", origem);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  if (!vemDoGtm) {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket.remoteAddress;

    if (estaAcimaDoLimite(ip)) {
      return res.status(429).json({ erro: "Muitas requisições, tente novamente em instantes" });
    }
  }

  const {
    site,           // slug do site, ex: "relinq-beauty"
    evento,         // tipo do evento, ex: "visita", "clique_whatsapp", "video_progress"
    rotulo,         // identifica qual botão específico gerou o evento (ex: "Essential - anual"),
                     // sem afetar a contagem agregada por "evento"
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
    respostas,      // opcional: conteúdo estruturado de uma etapa de onboarding (relinqTrackPasso),
                     // guardado à parte em "onboarding_respostas" — não afeta a contagem do funil
  } = req.body || {};

  if (!site || !evento) {
    return res.status(400).json({ erro: "Campos 'site' e 'evento' são obrigatórios" });
  }

  // Allowlist do que aceitamos vindo do GTM: como a tag manda TODOS os
  // eventos GA4 (o trigger não filtra nada), aqui a gente descarta
  // silenciosamente (204, sem gravar) qualquer evento ou site fora da
  // lista — hoje só a Relinq Sales usa essa integração. "Silencioso" é
  // proposital: um evento fora da lista não é um erro, é só ruído
  // esperado do "Todos os Eventos - GA4", e não queremos que o GTM
  // registre isso como falha de tag.
  if (vemDoGtm) {
    const sitesPermitidos = listaDoEnv("GTM_SITES_PERMITIDOS");
    const eventosPermitidos = listaDoEnv("GTM_EVENTOS_PERMITIDOS");

    // Fail closed: sem a lista configurada no ambiente, nada passa —
    // assim, esquecer de configurar a variável nunca vira "aceita tudo"
    // por padrão.
    const siteOk = sitesPermitidos.includes(String(site).toLowerCase());
    const eventoOk = eventosPermitidos.includes(String(evento).toLowerCase());

    if (!siteOk || !eventoOk) {
      return res.status(204).end();
    }
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

    const valores = [
      siteId,
      evento,
      rotulo || null,
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
    ];

    if (!vemDoGtm && (await colunasGeoExistem(pool))) {
      const geo = localizacaoDaRequisicao(req);
      await pool.query(
        `INSERT INTO events
          (site_id, tipo_evento, rotulo, pagina, video_id, valor, visitor_id, dispositivo, utm_source, utm_medium, utm_campaign, utm_content, utm_term, pais, estado, cidade)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        valores.concat([geo.pais, geo.estado, geo.cidade])
      );
    } else {
      await pool.query(
        `INSERT INTO events
          (site_id, tipo_evento, rotulo, pagina, video_id, valor, visitor_id, dispositivo, utm_source, utm_medium, utm_campaign, utm_content, utm_term)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        valores
      );
    }

    // Conteúdo estruturado de uma etapa de onboarding (respostas de múltipla
    // seleção, preço/duração, horário por dia da semana etc.) — guardado à
    // parte, sem afetar a contagem do funil acima. Precisa de visitor_id pra
    // ser possível cruzar com a jornada/funil depois.
    if (respostas && visitor_id) {
      try {
        await pool.query(
          `INSERT INTO onboarding_respostas (visitor_id, site_id, passo, respostas_json)
           VALUES (?, ?, ?, ?)`,
          [visitor_id, siteId, evento, JSON.stringify(respostas)]
        );
      } catch (erroRespostas) {
        // Tabela ainda não existe (migration-8 não rodou) -> não falha o
        // evento principal por causa disso, só avisa no log.
        if (erroRespostas && erroRespostas.code === "ER_NO_SUCH_TABLE") {
          console.error("Tabela 'onboarding_respostas' não existe — rode db/migration-8.sql no banco.");
        } else {
          console.error("Erro ao gravar respostas de onboarding:", erroRespostas);
        }
      }
    }

    return res.status(201).json({ ok: true });
  } catch (erro) {
    console.error("Erro ao gravar evento:", erro);
    return res.status(500).json({ erro: "Erro interno ao gravar evento" });
  }
}
