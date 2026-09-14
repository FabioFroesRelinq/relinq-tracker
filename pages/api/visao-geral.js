import { getPool } from "../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  const { inicio, fim } = req.query;

  const dataInicio = inicio || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const dataFim = fim || new Date().toISOString().slice(0, 10);

  try {
    const pool = getPool();

    const [linhas] = await pool.query(
      `SELECT s.id, s.nome, s.slug,
              SUM(CASE WHEN e.tipo_evento = 'visita' THEN 1 ELSE 0 END) AS visitas,
              SUM(CASE WHEN e.tipo_evento LIKE 'clique\\_%' THEN 1 ELSE 0 END) AS cliques,
              SUM(CASE WHEN e.tipo_evento = 'conversao' THEN 1 ELSE 0 END) AS conversoes
       FROM sites s
       LEFT JOIN events e
         ON e.site_id = s.id AND e.criado_em BETWEEN ? AND ?
       GROUP BY s.id, s.nome, s.slug
       ORDER BY visitas DESC`,
      [`${dataInicio} 00:00:00`, `${dataFim} 23:59:59`]
    );

    const resultado = linhas.map(function (l) {
      const taxa = l.visitas > 0 ? Number(((l.conversoes / l.visitas) * 100).toFixed(1)) : 0;
      return {
        id: l.id,
        nome: l.nome,
        slug: l.slug,
        visitas: Number(l.visitas),
        cliques: Number(l.cliques),
        conversoes: Number(l.conversoes),
        taxaConversao: taxa,
      };
    });

    return res.status(200).json({
      periodo: { inicio: dataInicio, fim: dataFim },
      sites: resultado,
    });
  } catch (erro) {
    console.error("Erro ao calcular visão geral:", erro);
    return res.status(500).json({ erro: "Erro interno ao calcular visão geral" });
  }
}
