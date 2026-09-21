import { getPool } from "../../lib/db";
import { metaValida, lerEsperados, esperadosPadrao, ehFrequente } from "../../lib/perfil";

// Limites (em minutos desde o último evento) pro semáforo de cada LP.
const LIMITE_OK_MIN = 60; // até 1 h: recebendo dados
const LIMITE_ATENCAO_MIN = 24 * 60; // até 24 h: atenção; acima disso: parado

function calcularStatus(minutos) {
  if (minutos == null) return "sem_dados";
  if (minutos <= LIMITE_OK_MIN) return "ok";
  if (minutos <= LIMITE_ATENCAO_MIN) return "atencao";
  return "parado";
}

// --- Eventos esperados (perfil da LP) ---
const TRAFEGO_MINIMO_7D = 20; // com menos visitas que isso não dá pra cobrar eventos raros
const PARADO_FREQUENTE_MIN = 24 * 60; // evento frequente sem chegar há mais de 24 h

// situacao: "ok" | "parou" | "falta" | "sem_base"
function avaliarEsperado(chave, categorias, visitas7d, minUltimoSite) {
  const c = categorias[chave];
  const total = c ? c.total : 0;
  const minUltimo = c ? c.minUltimo : null;

  let situacao;
  if (total > 0) {
    // Frequente que sumiu enquanto a LP continua mandando outras coisas
    const sumiu =
      ehFrequente(chave) && minUltimo != null && minUltimo > PARADO_FREQUENTE_MIN && minUltimoSite != null && minUltimoSite <= PARADO_FREQUENTE_MIN;
    situacao = sumiu ? "parou" : "ok";
  } else if (chave === "visita" || visitas7d >= TRAFEGO_MINIMO_7D) {
    situacao = "falta";
  } else {
    situacao = "sem_base"; // pouco tráfego: ainda não dá pra saber
  }
  return { chave, situacao, total, minUltimo };
}

// Agrupa tipos de evento parecidos (clique_*, video_*...) numa categoria só.
function categoria(tipo) {
  if (tipo.indexOf("clique_") === 0) return "cliques";
  if (tipo.indexOf("video_") === 0) return "video";
  if (tipo.indexOf("quiz_") === 0) return "quiz";
  if (tipo.indexOf("gtm_") === 0) return "gtm";
  return tipo;
}

async function temColunaEstado(pool) {
  try {
    const [linhas] = await pool.query("SHOW COLUMNS FROM events LIKE 'estado'");
    return linhas.length > 0;
  } catch (e) {
    return false;
  }
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
    // "cor", "meta_principal" e "eventos_esperados" só existem depois das migrations 4 e 6.
    const [colunasSites] = await pool.query("SHOW COLUMNS FROM sites");
    const existentes = new Set(
      colunasSites.map(function (c) {
        return c.Field;
      })
    );
    const extras = ["cor", "meta_principal", "eventos_esperados"].filter(function (c) {
      return existentes.has(c);
    });
    const [sites] = await pool.query(
      "SELECT id, slug, nome, dominio" +
        extras
          .map(function (c) {
            return ", " + c;
          })
          .join("") +
        " FROM sites ORDER BY nome"
    );

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

    // % de visitas com localização (só existe depois da migration-5): serve pra
    // conferir que o recurso está funcionando na Vercel.
    const geoPorSite = new Map();
    try {
      const [linhasGeo] = await pool.query(
        `SELECT site_id, SUM(tipo_evento = 'visita' AND estado IS NOT NULL) AS visitas_geo
         FROM events
         WHERE criado_em >= NOW() - INTERVAL 7 DAY
         GROUP BY site_id`
      );
      linhasGeo.forEach(function (l) {
        geoPorSite.set(Number(l.site_id), numero(l.visitas_geo));
      });
    } catch (e) {
      // sem a migration-5: a Saúde simplesmente não mostra esse item
    }
    const geoDisponivel = geoPorSite.size > 0 || (await temColunaEstado(pool));

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
      const categorias = categoriasPorSite.get(id) || {};
      const meta = metaValida(s.meta_principal);
      const listaPropria = lerEsperados(s.eventos_esperados);
      const visitas7d = categorias.visita ? categorias.visita.total : 0;
      const esperados = (listaPropria || esperadosPadrao(meta)).map(function (chave) {
        return avaliarEsperado(chave, categorias, visitas7d, min);
      });
      return {
        id: s.id,
        slug: s.slug,
        nome: s.nome,
        dominio: s.dominio || null,
        cor: s.cor || null,
        status: calcularStatus(min),
        minUltimoEvento: min,
        categorias,
        perfil: { meta, personalizado: !!listaPropria },
        esperados,
        alertasEsperados: esperados.filter(function (e) {
          return e.situacao === "falta" || e.situacao === "parou";
        }).length,
        horas: horasPorSite.get(id) || new Array(24).fill(0),
        qualidade: {
          eventos7d: q.eventos,
          identificados: q.eventos > 0 ? ((q.eventos - q.semVisitor) / q.eventos) * 100 : null,
          comOrigem: q.visitas > 0 ? (q.visitasUtm / q.visitas) * 100 : null,
          comLocalizacao: geoDisponivel && q.visitas > 0 ? ((geoPorSite.get(id) || 0) / q.visitas) * 100 : null,
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
