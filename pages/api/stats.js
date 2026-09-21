import { getPool } from "../../lib/db";
import { infoFuso } from "../../lib/fuso";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  const { site, inicio, fim, ateAgora } = req.query;

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
    // Com ?ateAgora=1 o último dia vai só até a hora atual do banco. É o que
    // permite comparar "hoje até agora" com "ontem até a mesma hora".
    let horaFim = "23:59:59";
    if (ateAgora === "1") {
      const [[{ agora }]] = await pool.query("SELECT TIME_FORMAT(NOW(), '%H:%i:%s') AS agora");
      horaFim = agora;
    }

    const filtroData = [...paramsSite, `${dataInicio} 00:00:00`, `${dataFim} ${horaFim}`];

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

    // Detalhamento de QUAIS botões foram clicados por quem veio de cada
    // utm_content específico (ex: "8 pessoas vieram do link da bio e
    // clicaram em 21 botões" -> aqui dá pra ver quais botões foram esses)
    const [cliquesPorCriativoDetalhado] = await pool.query(
      `SELECT utm_content, tipo_evento, COALESCE(rotulo, 'Sem rótulo identificado') AS rotulo, COUNT(*) AS total
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ? AND utm_content IS NOT NULL AND tipo_evento LIKE 'clique\\_%'
       GROUP BY utm_content, tipo_evento, rotulo
       ORDER BY utm_content, total DESC`,
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

    // --- Visitantes que criaram card (formulário da LP de evento) ---
    // O evento "card_criado" é disparado pelo tracker.js quando a caixa de
    // sucesso do formulário aparece (depois que o card foi criado).
    const [[{ visitantesComCard }]] = await pool.query(
      `SELECT COUNT(DISTINCT visitor_id) AS visitantesComCard
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ? AND tipo_evento = 'card_criado' AND visitor_id IS NOT NULL`,
      filtroData
    );

    // --- Funil: quantos visitantes únicos chegaram em cada etapa ---
    const [[{ visitantesComClique }]] = await pool.query(
      `SELECT COUNT(DISTINCT visitor_id) AS visitantesComClique
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ? AND tipo_evento LIKE 'clique\\_%' AND visitor_id IS NOT NULL`,
      filtroData
    );
    const [[{ visitantesComConversao }]] = await pool.query(
      `SELECT COUNT(DISTINCT visitor_id) AS visitantesComConversao
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ? AND tipo_evento = 'conversao' AND visitor_id IS NOT NULL`,
      filtroData
    );

    // --- Série diária pros mini gráficos (sparklines) dos cards ---
    const [serieKpiBruta] = await pool.query(
      `SELECT DATE_FORMAT(criado_em, '%Y-%m-%d') AS dia,
              SUM(tipo_evento = 'visita') AS visitas,
              COUNT(DISTINCT CASE WHEN tipo_evento = 'visita' THEN visitor_id END) AS visitantes,
              SUM(tipo_evento LIKE 'clique\\_%') AS cliques,
              SUM(tipo_evento = 'conversao') AS conversoes,
              SUM(tipo_evento = 'card_criado') AS cards,
              SUM(tipo_evento = 'lead_capturado') AS leads,
              SUM(tipo_evento = 'quiz_finalizado') AS quizzes
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ?
       GROUP BY dia
       ORDER BY dia`,
      filtroData
    );
    const serieKpi = serieKpiBruta.map(function (l) {
      return {
        dia: l.dia,
        visitas: Number(l.visitas) || 0,
        visitantes: Number(l.visitantes) || 0,
        cliques: Number(l.cliques) || 0,
        conversoes: Number(l.conversoes) || 0,
        cards: Number(l.cards) || 0,
        leads: Number(l.leads) || 0,
        quizzes: Number(l.quizzes) || 0,
      };
    });

    // --- Mapa de calor: visitas por dia da semana x hora ---
    // criado_em está no relógio do servidor do banco (geralmente UTC). O
    // deslocamento até o horário de Brasília é descoberto sozinho (lib/fuso.js).
    const fuso = await infoFuso(pool);
    const deslocamento = Math.trunc(fuso.deslocamentoMin);
    const [mapaCalorBruto] = await pool.query(
      `SELECT DAYOFWEEK(DATE_ADD(criado_em, INTERVAL ${deslocamento} MINUTE)) AS dow,
              HOUR(DATE_ADD(criado_em, INTERVAL ${deslocamento} MINUTE)) AS hora,
              COUNT(*) AS total
       FROM events
       WHERE ${condSite}criado_em BETWEEN ? AND ? AND tipo_evento = 'visita'
       GROUP BY dow, hora`,
      filtroData
    );
    const mapaCalor = mapaCalorBruto.map(function (l) {
      return { dow: Number(l.dow), hora: Number(l.hora), total: Number(l.total) || 0 };
    });

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

    // Adiciona o marco "0%" — visitantes que entraram e saíram sem rolar
    // nem 25% da página. Como cada marco é cumulativo (quem chegou a
    // 100% também disparou o de 25% no caminho), dá pra calcular: quem
    // nunca rolou = todos os visitantes únicos menos quem alcançou 25%.
    const alcancou25 = scrollProfundidade.find(function (m) {
      return m.marco === 25;
    });
    const nuncaRolou = Math.max(0, Number(visitantesUnicos) - (alcancou25 ? alcancou25.total : 0));
    scrollProfundidade.unshift({ marco: 0, total: nuncaRolou });

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
      cliquesPorCriativoDetalhado,
      cliquesPorTipo,
      cliquesPorRotulo,
      serieKpi,
      mapaCalor,
      fuso: { bancoMin: fuso.bancoMin, exibicaoMin: fuso.exibicaoMin },
      funil: {
        visitantes: Number(visitantesUnicos),
        comClique: Number(visitantesComClique),
        comCard: Number(visitantesComCard),
        comConversao: Number(visitantesComConversao),
      },
      engajamento: {
        visitantesUnicos: Number(visitantesUnicos),
        visitantesComCard: Number(visitantesComCard),
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
