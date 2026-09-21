import { getPool } from "../../lib/db";

// Limites (em minutos desde o último evento) pro semáforo de cada LP.
const LIMITE_OK_MIN = 60; // até 1 h: recebendo dados
const LIMITE_ATENCAO_MIN = 24 * 60; // até 24 h: atenção; acima disso: parado

function calcularStatus(minutos) {
  if (minutos == null) return "sem_dados";
  if (minutos <= LIMITE_OK_MIN) return "ok";
  if (minutos <= LIMITE_ATENCAO_MIN) return "atencao";
  return "parado";
}

// Agrupa tipos de evento parecidos (clique_*, video_*...) numa categoria só.
function categoria(tipo) {
  if (tipo.indexOf("clique_") === 0) return "cliques";
  if (tipo.indexOf("video_") === 0) return "video";
  if (tipo.indexOf("quiz_") === 0) return "quiz";
  if (tipo.indexOf("gtm_") === 0) return "gtm";
  return tipo;
}

function numero(v) {
  return Number(v) || 0;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  res.setHeader("Cache-Control", "no-store");

  try {
    const pool = getPool();

    // "cor" só existe depois da migration-4; sem ela, cai na consulta sem a coluna.
    let sites;
    try {
      [sites] = await pool.query("SELECT id, slug, nome, dominio, cor FROM sites ORDER BY nome");
    } catch (e) {
      [sites] = await pool.query("SELECT id, slug, nome, dominio FROM sites ORDER BY nome");
    }

    // Todas as idades são calculadas no próprio banco (NOW()), pra não depender
    // de o servidor da aplicação e o banco estarem no mesmo fuso.
    const [resUltimo, resTipos, resHoras, resQualidade] = await Promise.all([
      pool.query(
        `SELECT site_id,
                TIMESTAMPDIFF(MINUTE, MAX(criado_em), NOW()) AS min_ultimo
         FROM events
         GROUP BY site_id`
      ),
      pool.query(
        `SELECT site_id, tipo_evento, COUNT(*) AS total,
                TIMESTAMPDIFF(MINUTE, MAX(criado_em), NOW()) AS min_ultimo
         FROM events
         WHERE criado_em >= NOW() - INTERVAL 7 DAY
         GROUP BY site_id, tipo_evento`
      ),
      pool.query(
        `SELECT site_id, TIMESTAMPDIFF(HOUR, criado_em, NOW()) AS h_atras, COUNT(*) AS total
         FROM events
         WHERE criado_em >= NOW() - INTERVAL 24 HOUR
         GROUP BY site_id, h_atras`
      ),
      pool.query(
        `SELECT site_id,
                COUNT(*) AS eventos,
                SUM(visitor_id IS NULL) AS sem_visitor,
                SUM(tipo_evento = 'visita') AS visitas,
                SUM(tipo_evento = 'visita' AND utm_source IS NOT NULL) AS visitas_utm
         FROM events
         WHERE criado_em >= NOW() - INTERVAL 7 DAY
         GROUP BY site_id`
      ),
    ]);

    const ultimoPorSite = new Map();
    resUltimo[0].forEach(function (l) {
      ultimoPorSite.set(Number(l.site_id), l.min_ultimo == null ? null : Number(l.min_ultimo));
    });

    const categoriasPorSite = new Map();
    resTipos[0].forEach(function (l) {
      const id = Number(l.site_id);
      if (!categoriasPorSite.has(id)) categoriasPorSite.set(id, {});
      const cats = categoriasPorSite.get(id);
      const cat = categoria(String(l.tipo_evento));
      const min = l.min_ultimo == null ? null : Number(l.min_ultimo);
      if (!cats[cat]) cats[cat] = { total: 0, minUltimo: min };
      cats[cat].total += numero(l.total);
      if (min != null && (cats[cat].minUltimo == null || min < cats[cat].minUltimo)) {
        cats[cat].minUltimo = min;
      }
    });

    // 24 barras: a posição 23 é a última hora, a 0 é de 23 h atrás.
    const horasPorSite = new Map();
    resHoras[0].forEach(function (l) {
      const id = Number(l.site_id);
      if (!horasPorSite.has(id)) horasPorSite.set(id, new Array(24).fill(0));
      const h = Number(l.h_atras);
      if (h >= 0 && h < 24) horasPorSite.get(id)[23 - h] += numero(l.total);
    });

    const qualidadePorSite = new Map();
    resQualidade[0].forEach(function (l) {
      qualidadePorSite.set(Number(l.site_id), {
        eventos: numero(l.eventos),
        semVisitor: numero(l.sem_visitor),
        visitas: numero(l.visitas),
        visitasUtm: numero(l.visitas_utm),
      });
    });

    const resultado = sites.map(function (s) {
      const id = Number(s.id);
      const min = ultimoPorSite.has(id) ? ultimoPorSite.get(id) : null;
      const q = qualidadePorSite.get(id) || { eventos: 0, semVisitor: 0, visitas: 0, visitasUtm: 0 };
      return {
        id: s.id,
        slug: s.slug,
        nome: s.nome,
        dominio: s.dominio || null,
        cor: s.cor || null,
        status: calcularStatus(min),
        minUltimoEvento: min,
        categorias: categoriasPorSite.get(id) || {},
        horas: horasPorSite.get(id) || new Array(24).fill(0),
        qualidade: {
          eventos7d: q.eventos,
          identificados: q.eventos > 0 ? ((q.eventos - q.semVisitor) / q.eventos) * 100 : null,
          comOrigem: q.visitas > 0 ? (q.visitasUtm / q.visitas) * 100 : null,
        },
      };
    });

    return res.status(200).json({
      limites: { okMin: LIMITE_OK_MIN, atencaoMin: LIMITE_ATENCAO_MIN },
      sites: resultado,
    });
  } catch (erro) {
    console.error("Erro ao calcular saúde do tracking:", erro);
    return res.status(500).json({ erro: "Erro interno ao calcular a saúde do tracking" });
  }
}
