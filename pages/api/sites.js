import { getPool } from "../../lib/db";
import { metaValida, gravarEsperados, lerEsperados } from "../../lib/perfil";

function gerarSlug(nome) {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const RE_COR = /^#[0-9a-fA-F]{6}$/;

function normalizarCor(cor) {
  return typeof cor === "string" && RE_COR.test(cor) ? cor : null;
}

// Colunas opcionais da tabela sites: "cor" (migration-4) e "meta_principal" /
// "eventos_esperados" (migration-6). Sem elas tudo continua funcionando: o
// painel usa o modo automático e só não dá pra salvar o que depende delas.
let cacheColunas = { campos: new Set(), ate: 0 };

async function colunasExistentes(pool) {
  const agora = Date.now();
  if (agora < cacheColunas.ate) return cacheColunas.campos;
  try {
    const [linhas] = await pool.query("SHOW COLUMNS FROM sites");
    cacheColunas = {
      campos: new Set(
        linhas.map(function (l) {
          return l.Field;
        })
      ),
      ate: agora + 60000, // confere de novo em 1 min: logo depois de rodar uma migration já vale
    };
  } catch (e) {
    cacheColunas = { campos: new Set(), ate: agora + 10000 };
  }
  return cacheColunas.campos;
}

// Valores vindos do corpo da requisição, já validados. Só entra o que foi enviado.
function camposOpcionais(corpo) {
  const campos = {};
  if (corpo.cor !== undefined) campos.cor = normalizarCor(corpo.cor);
  if (corpo.meta_principal !== undefined) campos.meta_principal = metaValida(corpo.meta_principal);
  if (corpo.eventos_esperados !== undefined) {
    const e = corpo.eventos_esperados;
    campos.eventos_esperados = Array.isArray(e) ? gravarEsperados(e) : gravarEsperados(lerEsperados(e) || []);
  }
  return campos;
}

export default async function handler(req, res) {
  const pool = getPool();

  if (req.method === "GET") {
    const existentes = await colunasExistentes(pool);
    const extras = ["cor", "meta_principal", "eventos_esperados"].filter(function (c) {
      return existentes.has(c);
    });
    const [rows] = await pool.query(
      "SELECT id, slug, nome, dominio, criado_em" +
        extras
          .map(function (c) {
            return ", " + c;
          })
          .join("") +
        " FROM sites ORDER BY nome"
    );
    return res.status(200).json(rows);
  }

  if (req.method === "POST") {
    const corpo = req.body || {};
    const { nome, dominio } = corpo;

    if (!nome) {
      return res.status(400).json({ erro: "Campo 'nome' é obrigatório" });
    }

    const slug = gerarSlug(nome);

    try {
      const existentes = await colunasExistentes(pool);
      const pedidos = camposOpcionais(corpo);
      const colunas = ["slug", "nome", "dominio"];
      const valores = [slug, nome, dominio || null];
      let naoSalvos = 0;

      Object.keys(pedidos).forEach(function (c) {
        if (existentes.has(c)) {
          colunas.push(c);
          valores.push(pedidos[c]);
        } else if (pedidos[c] !== null) {
          naoSalvos += 1;
        }
      });

      await pool.query(
        "INSERT INTO sites (" + colunas.join(", ") + ") VALUES (" + colunas.map(function () { return "?"; }).join(", ") + ")",
        valores
      );
      return res.status(201).json({
        ok: true,
        slug,
        corSalva: !(pedidos.cor && !existentes.has("cor")),
        perfilSalvo: !(
          (pedidos.meta_principal && !existentes.has("meta_principal")) ||
          (pedidos.eventos_esperados && !existentes.has("eventos_esperados"))
        ),
        naoSalvos,
      });
    } catch (erro) {
      if (erro.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ erro: "Já existe um site com esse nome/slug" });
      }
      console.error("Erro ao cadastrar site:", erro);
      return res.status(500).json({ erro: "Erro interno ao cadastrar site" });
    }
  }

  if (req.method === "PUT") {
    const corpo = req.body || {};
    const { id, nome, dominio } = corpo;

    if (!id || !nome) {
      return res.status(400).json({ erro: "Campos 'id' e 'nome' são obrigatórios" });
    }

    try {
      const existentes = await colunasExistentes(pool);
      const pedidos = camposOpcionais(corpo);
      const sets = ["nome = ?", "dominio = ?"];
      const valores = [nome, dominio || null];

      Object.keys(pedidos).forEach(function (c) {
        if (existentes.has(c)) {
          sets.push(c + " = ?");
          valores.push(pedidos[c]);
        }
      });
      valores.push(id);

      await pool.query("UPDATE sites SET " + sets.join(", ") + " WHERE id = ?", valores);
      return res.status(200).json({
        ok: true,
        corSalva: !(pedidos.cor && !existentes.has("cor")),
        perfilSalvo: !(
          (pedidos.meta_principal && !existentes.has("meta_principal")) ||
          (pedidos.eventos_esperados && !existentes.has("eventos_esperados"))
        ),
      });
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
