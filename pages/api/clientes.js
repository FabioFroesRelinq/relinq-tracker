import { getPool } from "../../lib/db";

// Lista os clientes capturados via /api/lead-checkout, com o status de
// conversão calculado na hora (não guardado): se existe algum evento
// "conversao" pra esse mesmo visitor_id, veio como convertido.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  const { site, inicio, fim } = req.query;

  if (!inicio || !fim) {
    return res.status(400).json({ erro: "Parâmetros 'inicio' e 'fim' são obrigatórios" });
  }

  try {
    const pool = getPool();
    const condicoes = ["c.criado_em >= ?", "c.criado_em < DATE_ADD(?, INTERVAL 1 DAY)"];
    const valores = [inicio, fim];

    if (site && site !== "todas") {
      condicoes.push("s.slug = ?");
      valores.push(site);
    }

    const [linhas] = await pool.query(
      `SELECT c.id, c.nome, c.email, c.celular, c.empresa, c.cupom, c.plano, c.ciclo, c.criado_em,
              s.slug AS site_slug, s.nome AS site_nome,
              EXISTS (
                SELECT 1 FROM events e WHERE e.visitor_id = c.visitor_id AND e.tipo_evento = 'conversao'
              ) AS converteu
       FROM clientes c
       LEFT JOIN sites s ON s.id = c.site_id
       WHERE ${condicoes.join(" AND ")}
       ORDER BY c.criado_em DESC
       LIMIT 500`,
      valores
    );

    return res.status(200).json({
      clientes: linhas.map(function (l) {
        return {
          id: l.id,
          nome: l.nome,
          email: l.email,
          celular: l.celular,
          empresa: l.empresa,
          cupom: l.cupom,
          plano: l.plano,
          ciclo: l.ciclo,
          criadoEm: l.criado_em,
          siteSlug: l.site_slug,
          siteNome: l.site_nome || "LP não identificada",
          converteu: !!l.converteu,
        };
      }),
    });
  } catch (erro) {
    // Migration-7 ainda não rodou: devolve lista vazia com um aviso, em vez
    // de erro genérico — a tela usa isso pra orientar a rodar a migration.
    if (erro && erro.code === "ER_NO_SUCH_TABLE") {
      return res.status(200).json({ clientes: [], semTabela: true });
    }
    console.error("Erro ao listar clientes:", erro);
    return res.status(500).json({ erro: "Erro interno ao listar clientes" });
  }
}
