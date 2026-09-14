import { getPool } from "../../lib/db";

function gerarSlug(nome) {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default async function handler(req, res) {
  const pool = getPool();

  if (req.method === "GET") {
    const [rows] = await pool.query(
      "SELECT id, slug, nome, dominio, criado_em FROM sites ORDER BY nome"
    );
    return res.status(200).json(rows);
  }

  if (req.method === "POST") {
    const { nome, dominio } = req.body || {};

    if (!nome) {
      return res.status(400).json({ erro: "Campo 'nome' é obrigatório" });
    }

    const slug = gerarSlug(nome);

    try {
      await pool.query(
        "INSERT INTO sites (slug, nome, dominio) VALUES (?, ?, ?)",
        [slug, nome, dominio || null]
      );
      return res.status(201).json({ ok: true, slug });
    } catch (erro) {
      if (erro.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ erro: "Já existe um site com esse nome/slug" });
      }
      console.error("Erro ao cadastrar site:", erro);
      return res.status(500).json({ erro: "Erro interno ao cadastrar site" });
    }
  }

  if (req.method === "PUT") {
    const { id, nome, dominio } = req.body || {};

    if (!id || !nome) {
      return res.status(400).json({ erro: "Campos 'id' e 'nome' são obrigatórios" });
    }

    try {
      await pool.query(
        "UPDATE sites SET nome = ?, dominio = ? WHERE id = ?",
        [nome, dominio || null, id]
      );
      return res.status(200).json({ ok: true });
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
