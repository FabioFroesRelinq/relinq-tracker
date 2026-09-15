import { getPool } from "../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  const { site, inicio, fim } = req.query;

  if (!site) {
    return res.status(400).json({ erro: "Parâmetro 'site' é obrigatório" });
  }

  // Período padrão: últimos 30 dias
  const dataInicio = inicio || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const dataFim = fim || new Date().toISOString().slice(0, 10);

  const todasLPs = site === "todas";

  try {
    const pool = getPool();

    let nomeExibido = "Todas as LPs";
    let totalSites = null;

    let siteId = null;

    if (!todasLPs) {
      const [siteRows] = await pool.query(
        "SELECT id, nome FROM sites WHERE slug = ? LIMIT 1",
        [site]
      );

      if (siteRows.length === 0) {
        return res.status(404).json({ erro: `Site '${site}' não encontrado` });
      }

      nomeExibido = siteRows[0].nome;
      siteId = siteRows[0].id;
    } else {
      const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM sites");
      totalSites = total;
      nomeExibido = `Todas as LPs (${total})`;
    }

    // "site_id = ?" só entra na query quando um site específico foi escolhido;
    // no modo "todas as LPs" essa condição simplesmente não existe, e os
    // dados de todo mundo entram juntos nas mesmas somas/agrupamentos.
    const condSite = todasLPs ? "" : "site_id = ? AND ";

    const paramsSite = todasLPs ? [] : [siteId];
    const filtroData = [...paramsSite, `${dataInicio} 00:00:00`, `${dataFim} 23:59:59`];

    // Totais por tipo de evento (visita, clique_whatsapp, conversao, etc.)
    const [totaisPorTipo] = await pool.query(
      `SELECT tipo_evento, COUNT(*) AS total
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ?
       GROUP BY tipo_evento`,
      filtroData
    );

    // Série diária (pra gráfico)
    const [serieDiaria] = await pool.query(
      `SELECT DATE(criado_em) AS dia, tipo_evento, COUNT(*) AS total
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ?
       GROUP BY DATE(criado_em), tipo_evento
       ORDER BY dia`,
      filtroData
    );

    // Quebra por origem (utm_source)
    const [porOrigem] = await pool.query(
      `SELECT COALESCE(utm_source, 'direto') AS utm_source, tipo_evento, COUNT(*) AS total
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ?
       GROUP BY utm_source, tipo_evento`,
      filtroData
    );

    // Quebra por campanha
    const [porCampanha] = await pool.query(
      `SELECT utm_campaign, tipo_evento, COUNT(*) AS total
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ? AND utm_campaign IS NOT NULL
       GROUP BY utm_campaign, tipo_evento`,
      filtroData
    );

    // Quebra por anúncio/criativo
    const [porCriativo] = await pool.query(
      `SELECT utm_content, tipo_evento, COUNT(*) AS total
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ? AND utm_content IS NOT NULL
       GROUP BY utm_content, tipo_evento`,
      filtroData
    );

    // --- Cliques por tipo (qualquer evento "clique_*" conta separado) ---
    const [cliquesPorTipo] = await pool.query(
      `SELECT tipo_evento, COUNT(*) AS total
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ? AND tipo_evento LIKE 'clique\\_%'
       GROUP BY tipo_evento
       ORDER BY total DESC`,
      filtroData
    );

    // --- Cliques por rótulo, dentro de cada tipo (ex: qual plano/botão
    // específico foi clicado, sem separar da contagem agregada acima) ---
    const [cliquesPorRotuloBruto] = await pool.query(
      `SELECT tipo_evento, rotulo, COUNT(*) AS total
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ? AND tipo_evento LIKE 'clique\\_%' AND rotulo IS NOT NULL
       GROUP BY tipo_evento, rotulo
       ORDER BY tipo_evento, total DESC`,
      filtroData
    );

    // Completa com uma linha "Sem rótulo identificado" nos tipos que têm
    // ALGUM clique já rotulado, pra fechar a conta com o total de
    // "Cliques por tipo" (ex: nem todo botão de WhatsApp fica dentro de um
    // card com título, então parte dos cliques não tem rótulo detectável).
    // Tipos sem NENHUM clique rotulado ficam de fora — mostrar "100% sem
    // rótulo" ali não agregaria nada que "Cliques por tipo" já não mostre.
    const totalPorTipoMap = {};
    cliquesPorTipo.forEach(function (c) {
      totalPorTipoMap[c.tipo_evento] = c.total;
    });
    const somaRotuladoPorTipo = {};
    cliquesPorRotuloBruto.forEach(function (c) {
      somaRotuladoPorTipo[c.tipo_evento] = (somaRotuladoPorTipo[c.tipo_evento] || 0) + c.total;
    });

    const cliquesPorRotulo = cliquesPorRotuloBruto.slice();
    Object.keys(somaRotuladoPorTipo).forEach(function (tipo) {
      const semRotulo = (totalPorTipoMap[tipo] || 0) - somaRotuladoPorTipo[tipo];
      if (semRotulo > 0) {
        cliquesPorRotulo.push({ tipo_evento: tipo, rotulo: "Sem rótulo identificado", total: semRotulo });
      }
    });

    // --- Visitantes únicos ---
    const [[{ visitantesUnicos }]] = await pool.query(
      `SELECT COUNT(DISTINCT visitor_id) AS visitantesUnicos
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ? AND tipo_evento = 'visita' AND visitor_id IS NOT NULL`,
      filtroData
    );

    // --- Dispositivo (mobile/tablet/desktop) ---
    const [porDispositivo] = await pool.query(
      `SELECT COALESCE(dispositivo, 'desconhecido') AS dispositivo, COUNT(*) AS total
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ? AND tipo_evento = 'visita'
       GROUP BY dispositivo`,
      filtroData
    );

    // --- Profundidade de rolagem (25/50/75/100%) ---
    const [scrollProfundidade] = await pool.query(
      `SELECT valor AS marco, COUNT(DISTINCT visitor_id) AS total
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ? AND tipo_evento = 'scroll_profundidade'
       GROUP BY valor
       ORDER BY marco`,
      filtroData
    );

    // --- Tempo médio na página ---
    const [[{ tempoMedioSegundos }]] = await pool.query(
      `SELECT AVG(valor) AS tempoMedioSegundos
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ? AND tipo_evento = 'tempo_pagina'`,
      filtroData
    );

    // --- Taxa de rejeição (visitante que nunca clicou em nada nem converteu) ---
    const [[{ visitantesEngajados }]] = await pool.query(
      `SELECT COUNT(DISTINCT visitor_id) AS visitantesEngajados
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ?
         AND visitor_id IS NOT NULL
         AND (tipo_evento = 'conversao' OR tipo_evento LIKE 'clique\\_%')`,
      filtroData
    );
    const taxaRejeicao = visitantesUnicos > 0
      ? Number((((visitantesUnicos - visitantesEngajados) / visitantesUnicos) * 100).toFixed(1))
      : 0;

    // --- Métricas de vídeo (VSL) ---

    // Total de plays por vídeo (base pra calcular % de retenção)
    const [videoPlays] = await pool.query(
      `SELECT video_id, COUNT(*) AS total
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ? AND tipo_evento = 'video_play'
       GROUP BY video_id`,
      filtroData
    );

    // Curva de retenção: quantas sessões chegaram em cada marco de 10%
    const [videoRetencao] = await pool.query(
      `SELECT video_id, valor AS marco, COUNT(*) AS total
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ? AND tipo_evento = 'video_progress'
       GROUP BY video_id, valor
       ORDER BY video_id, marco`,
      filtroData
    );

    // Conclusões (assistiram até o fim)
    const [videoCompletos] = await pool.query(
      `SELECT video_id, COUNT(*) AS total, AVG(valor) AS duracao_media_segundos
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ? AND tipo_evento = 'video_complete'
       GROUP BY video_id`,
      filtroData
    );

    return res.status(200).json({
      site: nomeExibido,
      todasLPs,
      totalSites,
      periodo: { inicio: dataInicio, fim: dataFim },
      totaisPorTipo,
      serieDiaria,
      porOrigem,
      porCampanha,
      porCriativo,
      cliquesPorTipo,
      cliquesPorRotulo,
      engajamento: {
        visitantesUnicos: Number(visitantesUnicos),
        taxaRejeicao,
        tempoMedioSegundos: tempoMedioSegundos ? Math.round(tempoMedioSegundos) : null,
        porDispositivo,
        scrollProfundidade,
      },
      video: {
        plays: videoPlays,
        retencao: videoRetencao,
        completos: videoCompletos,
      },
    });
  } catch (erro) {
    console.error("Erro ao calcular estatísticas:", erro);
    return res.status(500).json({ erro: "Erro interno ao calcular estatísticas" });
  }
}
