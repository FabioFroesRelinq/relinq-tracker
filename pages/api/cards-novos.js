import { getPool } from "../../lib/db";

// Evento que dispara o aviso. Sem dados pessoais: só LP, origem e "há quanto tempo".
const TIPO_AVISO = "card_criado";
const JANELA_NOVOS_MIN = 30; // avisos mais velhos que isso não fazem sentido
const MAX_NOVOS = 10;
const MAX_RECENTES = 8;

function numero(v) {
  return Number(v) || 0;
}

// Cor da LP só existe depois da migration-4; sem ela, cai na consulta sem a coluna.
async function buscarSites(pool, ids) {
  if (ids.length === 0) return new Map();
  let linhas;
  try {
    [linhas] = await pool.query("SELECT id, slug, nome, cor FROM sites WHERE id IN (?)", [ids]);
  } catch (e) {
    [linhas] = await pool.query("SELECT id, slug, nome FROM sites WHERE id IN (?)", [ids]);
  }
  return new Map(
    linhas.map(function (s) {
      return [Number(s.id), s];
    })
  );
}

function montar(linha, sites) {
  const s = sites.get(Number(linha.site_id)) || {};
  return {
    id: Number(linha.id),
    siteId: Number(linha.site_id),
    siteSlug: s.slug || null,
    siteNome: s.nome || "LP",
    cor: s.cor || null,
    origem: linha.utm_source || null,
    campanha: linha.utm_campaign || null,
    minAtras: numero(linha.min_atras),
  };
}

// GET /api/cards-novos
//   sem "desde"   -> devolve só o último id (ponto de partida; não avisa nada antigo)
//   ?desde=<id>   -> cards criados depois desse id (últimos 30 min)
//   &recentes=1   -> junta os últimos cards de hoje (faixa do modo TV)
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  res.setHeader("Cache-Control", "no-store");

  const desdeBruto = Array.isArray(req.query.desde) ? req.query.desde[0] : req.query.desde;
  const comRecentes = req.query.recentes === "1";
  const desde = desdeBruto !== undefined && /^\d+$/.test(String(desdeBruto)) ? Number(desdeBruto) : null;

  try {
    const pool = getPool();
    let ultimoId = desde;
    let novos = [];
    let recentes = [];

    if (desde === null) {
      const [[linha]] = await pool.query(
        "SELECT COALESCE(MAX(id), 0) AS ultimo FROM events WHERE tipo_evento = ?",
        [TIPO_AVISO]
      );
      ultimoId = numero(linha.ultimo);
    } else {
      const [linhas] = await pool.query(
        `SELECT id, site_id, utm_source, utm_campaign,
                TIMESTAMPDIFF(MINUTE, criado_em, NOW()) AS min_atras
         FROM events
         WHERE tipo_evento = ? AND id > ? AND criado_em >= NOW() - INTERVAL ${JANELA_NOVOS_MIN} MINUTE
         ORDER BY id ASC
         LIMIT ${MAX_NOVOS}`,
        [TIPO_AVISO, desde]
      );
      // O ponto de partida só avança até o último card devolvido: se chegar um
      // card durante a consulta, ele aparece na próxima, nunca se perde.
      if (linhas.length > 0) ultimoId = numero(linhas[linhas.length - 1].id);
      novos = linhas;
    }

    if (comRecentes) {
      const [linhas] = await pool.query(
        `SELECT id, site_id, utm_source, utm_campaign,
                TIMESTAMPDIFF(MINUTE, criado_em, NOW()) AS min_atras
         FROM events
         WHERE tipo_evento = ? AND criado_em >= CURDATE()
         ORDER BY id DESC
         LIMIT ${MAX_RECENTES}`,
        [TIPO_AVISO]
      );
      recentes = linhas;
    }

    const ids = Array.from(
      new Set(
        novos.concat(recentes).map(function (l) {
          return Number(l.site_id);
        })
      )
    );
    const sites = await buscarSites(pool, ids);

    return res.status(200).json({
      ultimoId,
      novos: novos.map(function (l) {
        return montar(l, sites);
      }),
      recentes: recentes.map(function (l) {
        return montar(l, sites);
      }),
    });
  } catch (erro) {
    console.error("Erro ao buscar cards novos:", erro);
    return res.status(500).json({ erro: "Erro interno ao buscar cards novos" });
  }
}
