import { getPool } from "../../lib/db";
import {
  TELAS_DO_ONBOARDING,
  TELA_PAGAMENTO,
  NOME_TELA_PAGAMENTO,
  EVENTO_TELA_VISTA,
  telaPorId,
  posicaoDoEvento,
  proximaTelaDepoisDe,
} from "../../lib/onboardingTelas";

// Estatísticas da tela /onboarding: funil de etapas de um fluxo de várias
// telas dentro do próprio app (ex: o onboarding/quiz de configuração em
// app.relinqbeauty.com.br). Convenção: qualquer evento "onboard_algumacoisa"
// em "events" vira uma etapa do funil automaticamente (mesmo princípio de
// "clique_" já virar um tipo de clique) — sem precisar cadastrar os passos
// em lugar nenhum. A conclusão do fluxo inteiro é o evento "quiz_finalizado"
// (convenção já usada pra marcos do meio do funil que não são a venda em
// si). O conteúdo detalhado de cada resposta (quando rico demais pra caber
// no "rotulo" de um evento comum) vem de "onboarding_respostas".

// Onde parou cada pessoa que iniciou o fluxo e nunca concluiu ("quiz_finalizado").
//
// Fonte, da mais exata pra mais fraca:
//   1. "registrada" — a última tela ABERTA ("tela_onboarding", pela sequência
//      do tracker.js). É a tela em que a pessoa estava quando saiu.
//   2. "estimada"   — sem registro de telas (dados de antes dele), pega a tela
//      seguinte à última concluída na ordem do app: os eventos "onboard_*"
//      marcam tela CONCLUÍDA, então quem concluiu a área parou nos serviços.
//   3. "evento"     — evento que não é do onboarding do app (outro onboard):
//      sem ordem conhecida, vale o último evento enviado.
async function localizarSaidas(pool, condSiteId, filtroData) {
  // O alias "e" é o do SELECT; condSiteId vem sem alias (usado em outras queries).
  const condComAlias = condSiteId ? "e.site_id = ? AND " : "";
  const [brutas] = await pool.query(
    `SELECT e.visitor_id, s.nome AS site_nome, s.slug AS site_slug,
            MAX(e.criado_em) AS ultimo_em,
            GROUP_CONCAT(DISTINCT CASE WHEN e.tipo_evento LIKE 'onboard\\_%' THEN e.tipo_evento END) AS eventos,
            SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN e.tipo_evento LIKE 'onboard\\_%' THEN e.tipo_evento END
                                         ORDER BY e.criado_em DESC, e.id DESC), ',', 1) AS ultimo_evento,
            SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN e.tipo_evento = ? THEN e.rotulo END
                                         ORDER BY e.valor DESC, e.id DESC), ',', 1) AS ultima_tela
     FROM events e
     JOIN sites s ON s.id = e.site_id
     WHERE ${condComAlias}e.criado_em BETWEEN ? AND ?
       AND (e.tipo_evento LIKE 'onboard\\_%' OR e.tipo_evento = ?)
       AND e.visitor_id IS NOT NULL
       AND e.visitor_id NOT IN (
         SELECT visitor_id FROM events WHERE tipo_evento = 'quiz_finalizado' AND visitor_id IS NOT NULL
       )
     GROUP BY e.visitor_id, s.nome, s.slug
     ORDER BY ultimo_em DESC`,
    [EVENTO_TELA_VISTA, ...filtroData, EVENTO_TELA_VISTA]
  );

  return brutas.map(function (l) {
    const base = {
      visitorId: l.visitor_id,
      ultimoEm: l.ultimo_em,
      siteNome: l.site_nome,
      siteSlug: l.site_slug,
    };

    if (l.ultima_tela) {
      const t = telaPorId(l.ultima_tela);
      const noPagamento = l.ultima_tela === TELA_PAGAMENTO;
      return Object.assign(base, {
        origem: "registrada",
        tela: l.ultima_tela,
        telaNome: noPagamento ? NOME_TELA_PAGAMENTO : t ? t.nome : l.ultima_tela,
        evento: t ? t.evento : null,
        noPagamento,
      });
    }

    const eventos = (l.eventos || "").split(",").filter(Boolean);
    let melhor = null;
    eventos.forEach(function (ev) {
      if (posicaoDoEvento(ev) > (melhor ? posicaoDoEvento(melhor) : -1)) melhor = ev;
    });

    if (melhor) {
      const prox = proximaTelaDepoisDe(melhor);
      // Concluiu até a última tela e não finalizou: parou nela mesma.
      const t = prox || telaPorId("plan");
      return Object.assign(base, {
        origem: "estimada",
        tela: t.tela,
        telaNome: t.nome,
        evento: t.evento,
        noPagamento: false,
      });
    }

    return Object.assign(base, {
      origem: "evento",
      tela: null,
      telaNome: null,
      evento: l.ultimo_evento || null,
      noPagamento: false,
    });
  });
}

// Núcleo do funil (etapas + KPIs) de UM site (ou de todas as LPs juntas, se
// siteId vier null) — usado tanto no modo normal quanto no modo comparação
// entre onboards, pra não duplicar as mesmas 5 queries duas vezes.
async function calcularFunilDoSite(pool, siteId, inicio, fim) {
  const todasLPs = siteId == null;
  const condSiteId = todasLPs ? "" : "site_id = ? AND ";
  const paramsSiteId = todasLPs ? [] : [siteId];
  const filtroData = [...paramsSiteId, `${inicio} 00:00:00`, `${fim} 23:59:59`];

  // Etapas CONCLUÍDAS: cada "onboard_*" marca uma tela concluída.
  const [etapasBrutas] = await pool.query(
    `SELECT tipo_evento, COUNT(DISTINCT visitor_id) AS visitantes, AVG(valor) AS tempo_medio_segundos
     FROM events
     WHERE ${condSiteId}criado_em BETWEEN ? AND ? AND tipo_evento LIKE 'onboard\\_%' AND visitor_id IS NOT NULL
     GROUP BY tipo_evento`,
    filtroData
  );

  // --- Telas ABERTAS: o tracker.js manda "tela_onboarding" (rotulo = tela,
  // valor = sequência crescente) a cada tela que a pessoa abre. Dá "quantos
  // chegaram" em cada tela e, no abandono, a tela exata onde a pessoa estava.
  const [telasAbertas] = await pool.query(
    `SELECT rotulo AS tela, COUNT(DISTINCT visitor_id) AS visitantes
     FROM events
     WHERE ${condSiteId}criado_em BETWEEN ? AND ? AND tipo_evento = ? AND rotulo IS NOT NULL AND visitor_id IS NOT NULL
     GROUP BY rotulo`,
    [...filtroData, EVENTO_TELA_VISTA]
  );
  const chegaramPorTela = {};
  telasAbertas.forEach(function (l) {
    chegaramPorTela[l.tela] = Number(l.visitantes) || 0;
  });

  // --- Onde cada pessoa que nunca concluiu parou ---
  const saidas = await localizarSaidas(pool, condSiteId, filtroData);

  // Monta as linhas do funil: uma por tela do app (na ordem do app) e uma por
  // evento desconhecido (outros onboards, que usam nomes próprios).
  const linhas = new Map();
  function linha(evento) {
    if (!linhas.has(evento)) {
      linhas.set(evento, {
        evento,
        visitantes: 0,
        tempoMedioSegundos: null,
        chegaram: null,
        abandonos: 0,
        abandonosNoPagamento: 0,
      });
    }
    return linhas.get(evento);
  }

  etapasBrutas.forEach(function (l) {
    const r = linha(l.tipo_evento);
    r.visitantes = Number(l.visitantes) || 0;
    r.tempoMedioSegundos = l.tempo_medio_segundos ? Math.round(l.tempo_medio_segundos) : null;
  });

  // Quem chegou na tela: contagem das telas abertas (a do plano e a do
  // pagamento ficam na mesma linha; "chegou" no plano = abriu a escolha).
  Object.keys(chegaramPorTela).forEach(function (tela) {
    if (tela === TELA_PAGAMENTO) return;
    const t = telaPorId(tela);
    if (t) linha(t.evento).chegaram = chegaramPorTela[tela];
  });

  saidas.forEach(function (sd) {
    if (!sd.evento) return;
    const r = linha(sd.evento);
    r.abandonos += 1;
    if (sd.noPagamento) r.abandonosNoPagamento += 1;
  });

  // Quem concluiu a tela e quem parou nela, com certeza chegou nela — piso pra
  // "chegaram" quando os dados misturam períodos com e sem registro das telas
  // abertas (sem isso, "pararam" poderia passar de "chegaram"). Também cobre
  // dados antigos, que só têm as telas concluídas.
  linhas.forEach(function (r) {
    r.chegaram = Math.max(r.chegaram || 0, r.visitantes + r.abandonos);
  });

  let etapas = Array.from(linhas.values());

  // Ordem: a do app pras telas conhecidas; o resto (nomes próprios de outros
  // onboards) vai depois, pela posição média em que cada evento aparece na
  // sequência de cada pessoa — não por volume, que embaralha com empate.
  const desconhecidos = etapas.filter(function (e) { return posicaoDoEvento(e.evento) === -1; });
  const rankMedio = {};
  if (desconhecidos.length > 0) {
    const [sequencias] = await pool.query(
      `SELECT visitor_id, tipo_evento, MIN(id) AS primeiro
       FROM events
       WHERE ${condSiteId}criado_em BETWEEN ? AND ? AND tipo_evento LIKE 'onboard\\_%' AND visitor_id IS NOT NULL
       GROUP BY visitor_id, tipo_evento
       ORDER BY visitor_id, primeiro`,
      filtroData
    );
    const soma = {};
    const qtd = {};
    let atual = null;
    let posicao = 0;
    sequencias.forEach(function (l) {
      if (l.visitor_id !== atual) {
        atual = l.visitor_id;
        posicao = 0;
      }
      posicao += 1;
      soma[l.tipo_evento] = (soma[l.tipo_evento] || 0) + posicao;
      qtd[l.tipo_evento] = (qtd[l.tipo_evento] || 0) + 1;
    });
    Object.keys(soma).forEach(function (ev) {
      rankMedio[ev] = soma[ev] / qtd[ev];
    });
  }

  etapas.sort(function (a, b) {
    const pa = posicaoDoEvento(a.evento);
    const pb = posicaoDoEvento(b.evento);
    if (pa !== -1 && pb !== -1) return pa - pb;
    if (pa !== -1) return -1;
    if (pb !== -1) return 1;
    const ra = rankMedio[a.evento] != null ? rankMedio[a.evento] : Infinity;
    const rb = rankMedio[b.evento] != null ? rankMedio[b.evento] : Infinity;
    return ra - rb || b.visitantes - a.visitantes;
  });

  etapas = etapas.map(function (e) {
    const t = TELAS_DO_ONBOARDING.find(function (x) { return x.evento === e.evento; });
    return Object.assign({ nome: t ? t.nome : null }, e);
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
    saidas,
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
          const { saidas, ...stats } = await calcularFunilDoSite(pool, s.id, inicio, fim);
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

    // --- Quem abandonou: abriu o fluxo, mas nunca concluiu ---
    // A tela de cada um vem de localizarSaidas (tela aberta por último).
    const { saidas, ...nucleoSemSaidas } = nucleo;
    const abandonos = saidas.slice(0, 50).map(function (sd) {
      return {
        visitorId: sd.visitorId,
        ultimoEm: sd.ultimoEm,
        // Evento da linha do funil onde a pessoa parou (a tela de saída).
        ultimoPasso: sd.evento,
        telaNome: sd.telaNome,
        origem: sd.origem,
        noPagamento: sd.noPagamento,
        siteNome: sd.siteNome,
        siteSlug: sd.siteSlug,
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
      Object.assign({ periodo: { inicio, fim } }, nucleoSemSaidas, {
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
