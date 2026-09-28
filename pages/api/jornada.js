import { getPool } from "../../lib/db";
import { infoFuso } from "../../lib/fuso";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  const { visitor_id, busca } = req.query;

  try {
    const pool = getPool();
    const desl = Math.trunc((await infoFuso(pool)).deslocamentoMin);

    // Busca o histórico completo de um visitante específico, em qualquer LP
    if (visitor_id) {
      const [eventos] = await pool.query(
        `SELECT e.tipo_evento, e.rotulo, e.pagina, e.video_id, e.valor,
                DATE_FORMAT(DATE_ADD(e.criado_em, INTERVAL ${desl} MINUTE), '%Y-%m-%d %H:%i:%s') AS criado_em,
                s.nome AS site_nome, s.slug AS site_slug
         FROM events e
         JOIN sites s ON s.id = e.site_id
         WHERE e.visitor_id = ?
         ORDER BY e.criado_em ASC`,
        [visitor_id]
      );

      // Conteúdo detalhado das respostas de onboarding desse visitante
      // (migration-8, opcional) — mostrado à parte da linha do tempo acima,
      // já que é uma etapa "onboard_*" com o JSON completo da resposta.
      let respostasOnboarding = [];
      try {
        const [linhas] = await pool.query(
          `SELECT passo, respostas_json,
                  DATE_FORMAT(DATE_ADD(criado_em, INTERVAL ${desl} MINUTE), '%Y-%m-%d %H:%i:%s') AS criado_em
           FROM onboarding_respostas
           WHERE visitor_id = ?
           ORDER BY criado_em ASC`,
          [visitor_id]
        );
        respostasOnboarding = linhas.map(function (l) {
          let respostas = null;
          try {
            respostas = JSON.parse(l.respostas_json);
          } catch (e) {}
          return { passo: l.passo, respostas, criado_em: l.criado_em };
        });
      } catch (erroRespostas) {
        if (!(erroRespostas && erroRespostas.code === "ER_NO_SUCH_TABLE")) {
          console.error("Erro ao buscar respostas de onboarding na jornada:", erroRespostas);
        }
      }

      return res.status(200).json({ visitor_id, eventos, respostasOnboarding });
    }

    // Busca candidatos por um pedaço de texto no rótulo (ex: e-mail
    // capturado como relinq_rotulo em algum evento de conversão/lead)
    if (busca) {
      const [candidatos] = await pool.query(
        `SELECT visitor_id, rotulo, tipo_evento,
                DATE_FORMAT(DATE_ADD(criado_em, INTERVAL ${desl} MINUTE), '%Y-%m-%d %H:%i:%s') AS criado_em
         FROM events
         WHERE rotulo LIKE ? AND visitor_id IS NOT NULL
         ORDER BY criado_em DESC
         LIMIT 20`,
        ["%" + busca + "%"]
      );
      return res.status(200).json({ candidatos });
    }

    return res.status(400).json({ erro: "Informe visitor_id ou busca" });
  } catch (erro) {
    console.error("Erro ao buscar jornada:", erro);
    return res.status(500).json({ erro: "Erro interno ao buscar jornada" });
  }
}
