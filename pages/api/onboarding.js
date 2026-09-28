import { getPool } from "../../lib/db";

// Estatísticas da tela /onboarding: funil de etapas de um fluxo de várias
// telas dentro do próprio app (ex: o onboarding/quiz de configuração em
// app.relinqbeauty.com.br). Convenção: qualquer evento "onboard_algumacoisa"
// em "events" vira uma etapa do funil automaticamente (mesmo princípio de
// "clique_" já virar um tipo de clique) — sem precisar cadastrar os passos
// em lugar nenhum. A conclusão do fluxo inteiro é o evento "quiz_finalizado"
// (convenção já usada pra marcos do meio do funil que não são a venda em
// si). O conteúdo detalhado de cada resposta (quando rico demais pra caber
// no "rotulo" de um evento comum) vem de "onboarding_respostas".
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  const { site, inicio, fim } = req.query;

  if (!inicio || !fim) {
    return res.status(400).json({ erro: "Parâmetros 'inicio' e 'fim' são obrigatórios" });
  }

  const todasLPs = !site || site === "todas";

  try {
    const pool = getPool();

    let siteId = null;
    if (!todasLPs) {
      const [siteRows] = await pool.query("SELECT id FROM sites WHERE slug = ? LIMIT 1", [site]);
      if (siteRows.length === 0) {
        return res.status(404).json({ erro: `Site '${site}' não encontrado` });
      }
      siteId = siteRows[0].id;
    }

    // events guarda site_id (não o slug), então o filtro por LP usa o id
    // já resolvido acima.
    const condSiteId = todasLPs ? "" : "site_id = ? AND ";
    const paramsSiteId = todasLPs ? [] : [siteId];
    const filtroData = [...paramsSiteId, `${inicio} 00:00:00`, `${fim} 23:59:59`];

    // --- Funil: visitantes únicos e tempo médio por etapa "onboard_*" ---
    const [etapasBrutas] = await pool.query(
      `SELECT tipo_evento, COUNT(DISTINCT visitor_id) AS visitantes, AVG(valor) AS tempo_medio_segundos
       FROM events
       WHERE ${condSiteId}criado_em BETWEEN ? AND ? AND tipo_evento LIKE 'onboard\\_%' AND visitor_id IS NOT NULL
       GROUP BY tipo_evento
       ORDER BY visitantes DESC`,
      filtroData
    );
    const etapas = etapasBrutas.map(function (l) {
      return {
        evento: l.tipo_evento,
        visitantes: Number(l.visitantes) || 0,
        tempoMedioSegundos: l.tempo_medio_segundos ? Math.round(l.tempo_medio_segundos) : null,
      };
    });

    // --- Quem iniciou (qualquer evento onboard_*) e quem concluiu (quiz_finalizado) ---
    const [[{ iniciaram }]] = await pool.query(
      `SELECT COUNT(DISTINCT visitor_id) AS iniciaram
       FROM events
       WHERE ${condSiteId}criado_em BETWEEN ? AND ? AND tipo_evento LIKE 'onboard\\_%' AND visitor_id IS NOT NULL`,
      filtroData
    );

    const [[{ concluiram }]] = await pool.query(
      `SELECT COUNT(DISTINCT e.visitor_id) AS concluiram
       FROM events e
       WHERE ${condSiteId}e.criado_em BETWEEN ? AND ? AND e.tipo_evento = 'quiz_finalizado' AND e.visitor_id IS NOT NULL
         AND e.visitor_id IN (
           SELECT visitor_id FROM events
           WHERE ${condSiteId}criado_em BETWEEN ? AND ? AND tipo_evento LIKE 'onboard\\_%' AND visitor_id IS NOT NULL
         )`,
      [...filtroData, ...filtroData]
    );

    const taxaConclusao = iniciaram > 0 ? Number(((concluiram / iniciaram) * 100).toFixed(1)) : 0;

    // --- Respostas curtas rotuladas (ex: "Como nos conheceu" -> "Instagram") ---
    const [respostasRotulo] = await pool.query(
      `SELECT tipo_evento, rotulo, COUNT(*) AS total
       FROM events
       WHERE ${condSiteId}criado_em BETWEEN ? AND ? AND tipo_evento LIKE 'onboard\\_%' AND rotulo IS NOT NULL
       GROUP BY tipo_evento, rotulo
       ORDER BY tipo_evento, total DESC`,
      filtroData
    );

    // --- Quem abandonou: teve algum passo, mas nunca concluiu ---
    const condSiteAbandono = todasLPs ? "" : "e.site_id = ? AND ";
    const [abandonosBrutos] = await pool.query(
      `SELECT e.visitor_id, MAX(e.criado_em) AS ultimo_em,
              SUBSTRING_INDEX(GROUP_CONCAT(e.tipo_evento ORDER BY e.criado_em DESC), ',', 1) AS ultimo_passo,
              s.nome AS site_nome, s.slug AS site_slug
       FROM events e
       JOIN sites s ON s.id = e.site_id
       WHERE ${condSiteAbandono}e.criado_em BETWEEN ? AND ? AND e.tipo_evento LIKE 'onboard\\_%' AND e.visitor_id IS NOT NULL
         AND e.visitor_id NOT IN (SELECT visitor_id FROM events WHERE tipo_evento = 'quiz_finalizado' AND visitor_id IS NOT NULL)
       GROUP BY e.visitor_id, s.nome, s.slug
       ORDER BY ultimo_em DESC
       LIMIT 50`,
      [...paramsSiteId, `${inicio} 00:00:00`, `${fim} 23:59:59`]
    );
    const abandonos = abandonosBrutos.map(function (l) {
      return {
        visitorId: l.visitor_id,
        ultimoEm: l.ultimo_em,
        ultimoPasso: l.ultimo_passo,
        siteNome: l.site_nome,
        siteSlug: l.site_slug,
      };
    });

    // --- Conteúdo das respostas estruturadas (onboarding_respostas) ---
    // Tabela opcional (migration-8): sem ela, a tela mostra só o funil acima.
    let respostas = { disponivel: false, porPasso: {} };
    try {
      const condSiteResp = todasLPs ? "" : "site_id = ? AND ";
      const [linhas] = await pool.query(
        `SELECT passo, respostas_json
         FROM onboarding_respostas
         WHERE ${condSiteResp}criado_em BETWEEN ? AND ?
         ORDER BY criado_em DESC
         LIMIT 1000`,
        filtroData
      );

      // Agregação simples e best-effort: valores curtos (texto/número) ou
      // listas de texto (multi-seleção) viram contagem por opção; qualquer
      // coisa mais composta (ex: preço+duração por serviço, horário por dia
      // da semana) só entra na contagem total do passo, pra ver no detalhe
      // por visitante (/jornada) em vez de agregado aqui.
      const porPasso = {};
      linhas.forEach(function (l) {
        if (!porPasso[l.passo]) porPasso[l.passo] = { total: 0, opcoes: {} };
        porPasso[l.passo].total += 1;

        let valor;
        try {
          valor = JSON.parse(l.respostas_json);
        } catch (e) {
          return;
        }

        const itens = Array.isArray(valor)
          ? valor
          : valor && typeof valor === "object" && Array.isArray(valor.selecionados)
          ? valor.selecionados
          : typeof valor === "string" || typeof valor === "number"
          ? [valor]
          : null;

        if (itens) {
          itens.forEach(function (item) {
            const chave = String(item);
            porPasso[l.passo].opcoes[chave] = (porPasso[l.passo].opcoes[chave] || 0) + 1;
          });
        }
      });

      respostas = { disponivel: true, porPasso };
    } catch (erro) {
      if (!(erro && erro.code === "ER_NO_SUCH_TABLE")) {
        console.error("Erro ao ler respostas de onboarding:", erro);
      }
      respostas = { disponivel: false, porPasso: {} };
    }

    return res.status(200).json({
      periodo: { inicio, fim },
      etapas,
      iniciaram: Number(iniciaram) || 0,
      concluiram: Number(concluiram) || 0,
      taxaConclusao,
      respostasRotulo,
      abandonos,
      respostas,
    });
  } catch (erro) {
    console.error("Erro ao calcular estatísticas de onboarding:", erro);
    return res.status(500).json({ erro: "Erro interno ao calcular estatísticas de onboarding" });
  }
}
