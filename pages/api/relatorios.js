import { getPool } from "../../lib/db";

// Cada medição de "tempo_pagina" é limitada a 30 min antes de entrar na média.
// Sem isso, uma aba esquecida aberta em segundo plano distorce o número.
const TEMPO_MAXIMO_SEGUNDOS = 1800;

// Evento disparado pelo tracker.js quando a caixa de sucesso do formulário aparece.
const EVENTO_CARD = "card_criado";

// Intervalo máximo aceito (protege o banco de consultas gigantes).
const MAX_DIAS = 366;

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

// Identifica o visitante. Eventos antigos sem visitor_id contam como um
// visitante cada, pra não sumirem dos totais.
const VID = "COALESCE(visitor_id, CONCAT('e', id))";

// Métricas de engajamento (usadas no total e por site).
const COLUNAS_METRICAS = `
  COALESCE(SUM(tipo_evento = 'visita'), 0) AS visitas,
  COUNT(DISTINCT CASE WHEN tipo_evento = 'visita' THEN ${VID} END) AS visitantes,
  COUNT(DISTINCT CASE WHEN tipo_evento = 'visita' AND dispositivo = 'mobile' THEN ${VID} END) AS mobile,
  COUNT(DISTINCT CASE WHEN tipo_evento = 'visita' AND dispositivo = 'desktop' THEN ${VID} END) AS desktop,
  COUNT(DISTINCT CASE WHEN tipo_evento = 'visita' AND dispositivo = 'tablet' THEN ${VID} END) AS tablet,
  COUNT(DISTINCT CASE WHEN tipo_evento = 'visita'
    AND (dispositivo IS NULL OR dispositivo NOT IN ('mobile', 'desktop', 'tablet')) THEN ${VID} END) AS outro,
  COUNT(DISTINCT CASE WHEN tipo_evento = 'scroll_profundidade' AND valor = 25 THEN ${VID} END) AS scroll25,
  COUNT(DISTINCT CASE WHEN tipo_evento = 'scroll_profundidade' AND valor = 50 THEN ${VID} END) AS scroll50,
  COUNT(DISTINCT CASE WHEN tipo_evento = 'scroll_profundidade' AND valor = 75 THEN ${VID} END) AS scroll75,
  COUNT(DISTINCT CASE WHEN tipo_evento = 'scroll_profundidade' AND valor = 100 THEN ${VID} END) AS scroll100,
  COALESCE(SUM(tipo_evento = '${EVENTO_CARD}'), 0) AS cards,
  COUNT(DISTINCT CASE WHEN tipo_evento = '${EVENTO_CARD}' THEN ${VID} END) AS visitantes_card,
  AVG(CASE WHEN tipo_evento = 'tempo_pagina' AND valor IS NOT NULL
    THEN LEAST(valor, ${TEMPO_MAXIMO_SEGUNDOS}) END) AS tempo_medio
`;

// Métricas do gráfico diário.
const COLUNAS_SERIE = `
  COALESCE(SUM(tipo_evento = 'visita'), 0) AS visitas,
  COUNT(DISTINCT CASE WHEN tipo_evento = 'visita' THEN ${VID} END) AS visitantes,
  COALESCE(SUM(tipo_evento = '${EVENTO_CARD}'), 0) AS cards,
  AVG(CASE WHEN tipo_evento = 'tempo_pagina' AND valor IS NOT NULL
    THEN LEAST(valor, ${TEMPO_MAXIMO_SEGUNDOS}) END) AS tempo_medio
`;

// --- Datas (tudo em UTC, só com strings AAAA-MM-DD, pra não sofrer com fuso) ---

function paraDataUTC(str) {
  return new Date(str + "T00:00:00Z");
}

function paraString(data) {
  return data.toISOString().slice(0, 10);
}

function dataValida(str) {
  if (typeof str !== "string" || !RE_DATA.test(str)) return false;
  const d = paraDataUTC(str);
  return !isNaN(d.getTime()) && paraString(d) === str; // barra "2026-02-31"
}

function somarDias(str, n) {
  const d = paraDataUTC(str);
  d.setUTCDate(d.getUTCDate() + n);
  return paraString(d);
}

function diasEntre(inicio, fim) {
  return Math.round((paraDataUTC(fim) - paraDataUTC(inicio)) / 86400000) + 1;
}

function listarDias(inicio, quantidade) {
  const lista = [];
  for (let i = 0; i < quantidade; i++) lista.push(somarDias(inicio, i));
  return lista;
}

function primeiro(valor) {
  return Array.isArray(valor) ? valor[0] : valor;
}

// --- Normalização dos resultados ---

function numero(v) {
  return Number(v) || 0;
}

function normalizarMetricas(r) {
  const linha = r || {};
  return {
    visitas: numero(linha.visitas),
    visitantes: numero(linha.visitantes),
    cards: numero(linha.cards),
    visitantesCard: numero(linha.visitantes_card),
    dispositivo: {
      mobile: numero(linha.mobile),
      desktop: numero(linha.desktop),
      tablet: numero(linha.tablet),
      outro: numero(linha.outro),
    },
    scroll: {
      25: numero(linha.scroll25),
      50: numero(linha.scroll50),
      75: numero(linha.scroll75),
      100: numero(linha.scroll100),
    },
    tempoMedio: linha.tempo_medio == null ? null : Number(linha.tempo_medio),
  };
}

function normalizarDia(r) {
  if (!r) return { visitas: 0, visitantes: 0, cards: 0, tempoMedio: null };
  return {
    visitas: numero(r.visitas),
    visitantes: numero(r.visitantes),
    cards: numero(r.cards),
    tempoMedio: r.tempo_medio == null ? null : Number(r.tempo_medio),
  };
}

async function consultarPeriodo(pool, siteIds, inicio, fim, horaFim) {
  const janela = [siteIds, `${inicio} 00:00:00`, `${fim} ${horaFim || "23:59:59"}`];

  const [resTotal, resSites, resDias] = await Promise.all([
    pool.query(
      `SELECT ${COLUNAS_METRICAS}
       FROM events
       WHERE site_id IN (?) AND criado_em BETWEEN ? AND ?`,
      janela
    ),
    pool.query(
      `SELECT site_id, ${COLUNAS_METRICAS}
       FROM events
       WHERE site_id IN (?) AND criado_em BETWEEN ? AND ?
       GROUP BY site_id`,
      janela
    ),
    pool.query(
      `SELECT DATE_FORMAT(criado_em, '%Y-%m-%d') AS dia, ${COLUNAS_SERIE}
       FROM events
       WHERE site_id IN (?) AND criado_em BETWEEN ? AND ?
       GROUP BY dia
       ORDER BY dia`,
      janela
    ),
  ]);

  const porSite = new Map();
  resSites[0].forEach(function (linha) {
    porSite.set(Number(linha.site_id), linha);
  });

  const porDia = new Map();
  resDias[0].forEach(function (linha) {
    porDia.set(linha.dia, linha);
  });

  return { total: resTotal[0][0], porSite, porDia };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  res.setHeader("Cache-Control", "no-store");

  const inicio = primeiro(req.query.inicio);
  const fim = primeiro(req.query.fim);
  const sitesParam = primeiro(req.query.sites);
  const compararAtivo = primeiro(req.query.comparar) !== "0";

  if (!dataValida(inicio) || !dataValida(fim)) {
    return res.status(400).json({ erro: "Informe 'inicio' e 'fim' no formato AAAA-MM-DD" });
  }
  if (inicio > fim) {
    return res.status(400).json({ erro: "A data inicial não pode ser depois da data final" });
  }

  const dias = diasEntre(inicio, fim);
  if (dias > MAX_DIAS) {
    return res.status(400).json({ erro: `O período máximo é de ${MAX_DIAS} dias` });
  }

  try {
    const pool = getPool();

    const [todosSites] = await pool.query("SELECT id, slug, nome FROM sites ORDER BY nome");

    let selecionados = todosSites;
    const pedido = String(sitesParam || "todas");
    if (pedido !== "todas") {
      const slugs = new Set(
        pedido
          .split(",")
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean)
      );
      selecionados = todosSites.filter(function (s) {
        return slugs.has(s.slug);
      });
    }

    if (selecionados.length === 0) {
      return res.status(404).json({ erro: "Nenhuma LP encontrada para o filtro escolhido" });
    }

    const siteIds = selecionados.map(function (s) {
      return s.id;
    });

    // Período anterior: mesma duração, colado no começo do período atual.
    let anteriorInicio = null;
    let anteriorFim = null;
    if (compararAtivo) {
      anteriorFim = somarDias(inicio, -1);
      anteriorInicio = somarDias(anteriorFim, -(dias - 1));
    }

    // Se o período é só o dia de hoje (no relógio do banco), ele ainda não
    // acabou: compara com ontem só até a mesma hora, pra não parecer queda.
    let horaCorte = null;
    if (compararAtivo && inicio === fim) {
      const [[relogio]] = await pool.query(
        "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS hoje, TIME_FORMAT(NOW(), '%H:%i:%s') AS agora"
      );
      if (relogio && relogio.hoje === inicio) horaCorte = relogio.agora;
    }

    const [atual, anterior] = await Promise.all([
      consultarPeriodo(pool, siteIds, inicio, fim),
      compararAtivo ? consultarPeriodo(pool, siteIds, anteriorInicio, anteriorFim, horaCorte) : null,
    ]);

    // Série diária alinhada por posição: dia 1 do atual x dia 1 do anterior, etc.
    const diasAtual = listarDias(inicio, dias);
    const diasAnterior = compararAtivo ? listarDias(anteriorInicio, dias) : null;

    const serie = diasAtual.map(function (dia, i) {
      return {
        dia,
        diaAnterior: diasAnterior ? diasAnterior[i] : null,
        atual: normalizarDia(atual.porDia.get(dia)),
        anterior: anterior ? normalizarDia(anterior.porDia.get(diasAnterior[i])) : null,
      };
    });

    const porSite = selecionados.map(function (s) {
      return {
        slug: s.slug,
        nome: s.nome,
        atual: normalizarMetricas(atual.porSite.get(s.id)),
        anterior: anterior ? normalizarMetricas(anterior.porSite.get(s.id)) : null,
      };
    });

    return res.status(200).json({
      periodo: { inicio, fim, dias },
      anterior: compararAtivo ? { inicio: anteriorInicio, fim: anteriorFim } : null,
      comparacaoParcial: horaCorte !== null,
      tempoMaximoSegundos: TEMPO_MAXIMO_SEGUNDOS,
      total: {
        atual: normalizarMetricas(atual.total),
        anterior: anterior ? normalizarMetricas(anterior.total) : null,
      },
      porSite,
      serie,
    });
  } catch (erro) {
    console.error("Erro ao calcular relatórios:", erro);
    return res.status(500).json({ erro: "Erro interno ao calcular relatórios" });
  }
}
