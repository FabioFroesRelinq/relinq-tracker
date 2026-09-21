import { getPool } from "../../lib/db";

function gerarSlug(nome) {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const RE_COR = /^#[0-9a-fA-F]{6}$/;

// A coluna "cor" vem da migration-4. Sem ela, tudo continua funcionando
// (as LPs usam uma cor automática) — só não dá pra salvar a cor escolhida.
let colunaCorExiste = false;

async function verificarColunaCor(pool) {
  if (colunaCorExiste) return true;
  try {
    const [rows] = await pool.query("SHOW COLUMNS FROM sites LIKE 'cor'");
    colunaCorExiste = rows.length > 0;
  } catch (e) {
    colunaCorExiste = false;
  }
  return colunaCorExiste;
}

function normalizarCor(cor) {
  return typeof cor === "string" && RE_COR.test(cor) ? cor : null;
}

export default async function handler(req, res) {
  const pool = getPool();

  if (req.method === "GET") {
    const temCor = await verificarColunaCor(pool);
    const [rows] = await pool.query(
      "SELECT id, slug, nome, dominio, criado_em" + (temCor ? ", cor" : "") + " FROM sites ORDER BY nome"
    );
    return res.status(200).json(rows);
  }

  if (req.method === "POST") {
    const { nome, dominio, cor } = req.body || {};

    if (!nome) {
      return res.status(400).json({ erro: "Campo 'nome' é obrigatório" });
    }

    const slug = gerarSlug(nome);

    try {
      const temCor = await verificarColunaCor(pool);
      const corEscolhida = normalizarCor(cor);
      if (temCor) {
        await pool.query(
          "INSERT INTO sites (slug, nome, dominio, cor) VALUES (?, ?, ?, ?)",
          [slug, nome, dominio || null, corEscolhida]
        );
      } else {
        await pool.query(
          "INSERT INTO sites (slug, nome, dominio) VALUES (?, ?, ?)",
          [slug, nome, dominio || null]
        );
      }
      return res.status(201).json({ ok: true, slug, corSalva: temCor || !corEscolhida });
    } catch (erro) {
      if (erro.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ erro: "Já existe um site com esse nome/slug" });
      }
      console.error("Erro ao cadastrar site:", erro);
      return res.status(500).json({ erro: "Erro interno ao cadastrar site" });
    }
  }

  if (req.method === "PUT") {
    const { id, nome, dominio, cor } = req.body || {};

    if (!id || !nome) {
      return res.status(400).json({ erro: "Campos 'id' e 'nome' são obrigatórios" });
    }

    try {
      const temCor = await verificarColunaCor(pool);
      const corEscolhida = normalizarCor(cor);
      if (temCor) {
        await pool.query(
          "UPDATE sites SET nome = ?, dominio = ?, cor = ? WHERE id = ?",
          [nome, dominio || null, corEscolhida, id]
        );
      } else {
        await pool.query(
          "UPDATE sites SET nome = ?, dominio = ? WHERE id = ?",
          [nome, dominio || null, id]
        );
      }
      return res.status(200).json({ ok: true, corSalva: temCor || !corEscolhida });
    } catch (erro) {
      console.error("Erro ao editar site:", erro);
      return res.status(500).json({ erro: "Erro interno ao editar site" });
    }
  }

  if (req.method === "DELETE") {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ erro: "Parâmetro 'id' é obrigatório" });
    }

    try {
      // Apagar o site também apaga seus eventos (FK com ON DELETE CASCADE)
      await pool.query("DELETE FROM sites WHERE id = ?", [id]);
      return res.status(200).json({ ok: true });
    } catch (erro) {
      console.error("Erro ao excluir site:", erro);
      return res.status(500).json({ erro: "Erro interno ao excluir site" });
    }
  }

  return res.status(405).json({ erro: "Método não permitido" });
}
