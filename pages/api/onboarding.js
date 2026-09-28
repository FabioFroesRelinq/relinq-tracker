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

// Núcleo do funil (etapas + KPIs) de UM site (ou de todas as LPs juntas, se
// siteId vier null) — usado tanto no modo normal quanto no modo comparação
// entre onboards, pra não duplicar as mesmas 5 queries duas vezes.
async function calcularFunilDoSite(pool, siteId, inicio, fim) {
  const todasLPs = siteId == null;
  const condSiteId = todasLPs ? "" : "site_id = ? AND ";
  const paramsSiteId = todasLPs ? [] : [siteId];
  const filtroData = [...paramsSiteId, `${inicio} 00:00:00`, `${fim} 23:59:59`];

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

  // --- Quem visitou a página (mesmo sem chegar a iniciar o fluxo) ---
  // Vem do evento "visita" que o tracker.js já dispara sozinho em toda
  // página, então não exige nada novo instalado no app.
  const [[{ visitaram }]] = await pool.query(
    `SELECT COUNT(DISTINCT visitor_id) AS visitaram
     FROM events
     WHERE ${condSiteId}criado_em BETWEEN ? AND ? AND tipo_evento = 'visita' AND visitor_id IS NOT NULL`,
    filtroData
  );

  // --- Quem iniciou (qualquer evento onboard_*) e quem concluiu (quiz_finalizado) ---
  const [[{ iniciaram }]] = await pool.query(
    `SELECT COUNT(DISTINCT visitor_id) AS iniciaram
     FROM events
     WHERE ${condSiteId}criado_em BETWEEN ? AND ? AND tipo_evento LIKE 'onboard\\_%' AND visitor_id IS NOT NULL`,
    filtroData
  );

  // --- De quem visitou, quantos nunca chegaram a disparar um passo do
  // fluxo — a "taxa de rejeição de início" (bounce antes do 1º passo).
  const [[{ visitaramSemIniciar }]] = await pool.query(
    `SELECT COUNT(DISTINCT e.visitor_id) AS visitaramSemIniciar
     FROM events e
     WHERE ${condSiteId}e.criado_em BETWEEN ? AND ? AND e.tipo_evento = 'visita' AND e.visitor_id IS NOT NULL
       AND e.visitor_id NOT IN (
         SELECT visitor_id FROM events
         WHERE ${condSiteId}criado_em BETWEEN ? AND ? AND tipo_evento LIKE 'onboard\\_%' AND visitor_id IS NOT NULL
       )`,
    [...filtroData, ...filtroData]
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
  const taxaRejeicaoInicio = visitaram > 0 ? Number(((visitaramSemIniciar / visitaram) * 100).toFixed(1)) : 0;

  return {
    etapas,
    visitaram: Number(visitaram) || 0,
    iniciaram: Number(iniciaram) || 0,
    concluiram: Number(concluiram) || 0,
    taxaConclusao,
    taxaRejeicaoInicio,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  const { site, sites, inicio, fim } = req.query;

  if (!inicio || !fim) {
    return res.status(400).json({ erro: "Parâmetros 'inicio' e 'fim' são obrigatórios" });
  }

  try {
    const pool = getPool();

    // --- Modo comparação: 2+ onboards lado a lado ("sites=slug-a,slug-b") ---
    // Devolve só o funil e os KPIs de cada um (sem respostas/abandonos —
    // esse detalhe continua no modo normal, de 1 onboard por vez), pra
    // comparar posição a posição ("Tela 01 de A" x "Tela 01 de B") mesmo
    // que o conteúdo de cada tela seja diferente entre os dois fluxos.
    if (sites) {
      const slugs = String(sites)
        .split(",")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);

      if (slugs.length === 0) {
        return res.status(400).json({ erro: "Parâmetro 'sites' vazio" });
      }

      const [siteRows] = await pool.query(
        `SELECT id, slug, nome FROM sites WHERE slug IN (${slugs.map(function () { return "?"; }).join(",")})`,
        slugs
      );

      if (siteRows.length === 0) {
        return res.status(404).json({ erro: "Nenhum dos sites em 'sites' foi encontrado" });
      }

      const porSite = await Promise.all(
        siteRows.map(async function (s) {
          const stats = await calcularFunilDoSite(pool, s.id, inicio, fim);
          return Object.assign({ slug: s.slug, nome: s.nome }, stats);
        })
      );

      // Mantém a ordem que veio em "sites" (a ordem que a pessoa selecionou),
      // não a ordem arbitrária que o SQL devolveu.
      porSite.sort(function (a, b) {
        return slugs.indexOf(a.slug) - slugs.indexOf(b.slug);
      });

      return res.status(200).json({ modo: "comparacao", periodo: { inicio, fim }, porSite });
    }

    // --- Modo normal: 1 onboard (ou "todas as LPs" somadas) ---
    const todasLPs = !site || site === "todas";

    let siteId = null;
    if (!todasLPs) {
      const [siteRows] = await pool.query("SELECT id FROM sites WHERE slug = ? LIMIT 1", [site]);
      if (siteRows.length === 0) {
        return res.status(404).json({ erro: `Site '${site}' não encontrado` });
      }
      siteId = siteRows[0].id;
    }

    const nucleo = await calcularFunilDoSite(pool, siteId, inicio, fim);

    // events guarda site_id (não o slug), então o filtro por LP usa o id
    // já resolvido acima.
    const condSiteId = todasLPs ? "" : "site_id = ? AND ";
    const paramsSiteId = todasLPs ? [] : [siteId];
    const filtroData = [...paramsSiteId, `${inicio} 00:00:00`, `${fim} 23:59:59`];

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

    return res.status(200).json(
      Object.assign({ periodo: { inicio, fim } }, nucleo, {
        respostasRotulo,
        abandonos,
        respostas,
      })
    );
  } catch (erro) {
    console.error("Erro ao calcular estatísticas de onboarding:", erro);
    return res.status(500).json({ erro: "Erro interno ao calcular estatísticas de onboarding" });
  }
}
