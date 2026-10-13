import { getPool } from "../../lib/db";
import { infoFuso } from "../../lib/fuso";

// Passo especial: dados de quem se cadastra dentro do onboarding, lidos da
// própria tela pelo tracker.js (negócio, e-mail, celular, nome). Não é uma
// etapa do funil — ver "capturarCadastroDoOnboarding" em public/tracker.js.
const PASSO_CADASTRO = "dados_cadastro";
// Desfecho do fluxo (free ou pago, plano, ciclo, forma de pagamento): vem
// anexado ao "quiz_finalizado" pelo tracker.js. Também é mostrado à parte.
const PASSO_FIM = "quiz_finalizado";

function escaparLike(texto) {
  return String(texto).replace(/[\\%_]/g, "\\$&");
}

function lerJson(texto) {
  try {
    return JSON.parse(texto);
  } catch (e) {
    return null;
  }
}

// Junta todas as linhas de "dados_cadastro" de um visitante: o tracker manda
// o cadastro aos poucos (cada campo preenchido), então vale o valor mais
// recente de cada chave.
function juntarCadastro(linhas) {
  const dados = {};
  linhas.forEach(function (l) {
    const r = lerJson(l.respostas_json);
    if (r && typeof r === "object" && !Array.isArray(r)) Object.assign(dados, r);
  });
  return dados;
}

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
           WHERE visitor_id = ? AND passo NOT IN (?, ?)
           ORDER BY criado_em ASC, id ASC`,
          [visitor_id, PASSO_CADASTRO, PASSO_FIM]
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

      // Cadastro da pessoa (quem ela é): primeiro o que o tracker leu da tela
      // do onboarding; o que faltar vem da aba Clientes (migration-7), se
      // esse visitante também caiu lá. Ambas as tabelas são opcionais.
      let cadastro = null;
      try {
        const [linhasCadastro] = await pool.query(
          `SELECT respostas_json,
                  DATE_FORMAT(DATE_ADD(criado_em, INTERVAL ${desl} MINUTE), '%Y-%m-%d %H:%i:%s') AS criado_em
           FROM onboarding_respostas
           WHERE visitor_id = ? AND passo = ?
           ORDER BY criado_em ASC, id ASC`,
          [visitor_id, PASSO_CADASTRO]
        );
        if (linhasCadastro.length > 0) {
          cadastro = juntarCadastro(linhasCadastro);
          cadastro.atualizado_em = linhasCadastro[linhasCadastro.length - 1].criado_em;
        }
      } catch (erroCadastro) {
        if (!(erroCadastro && erroCadastro.code === "ER_NO_SUCH_TABLE")) {
          console.error("Erro ao buscar cadastro do onboarding na jornada:", erroCadastro);
        }
      }

      try {
        const [clientes] = await pool.query(
          `SELECT nome, email, celular, empresa, cupom, plano, ciclo
           FROM clientes WHERE visitor_id = ? LIMIT 1`,
          [visitor_id]
        );
        if (clientes.length > 0) {
          const c = clientes[0];
          const doCliente = {
            negocio: c.empresa,
            email: c.email,
            celular: c.celular,
            nome_responsavel: c.nome,
            cupom: c.cupom,
            plano: c.plano,
            ciclo: c.ciclo,
          };
          cadastro = cadastro || {};
          Object.keys(doCliente).forEach(function (chave) {
            if (doCliente[chave] && !cadastro[chave]) cadastro[chave] = doCliente[chave];
          });
        }
      } catch (erroClientes) {
        if (!(erroClientes && erroClientes.code === "ER_NO_SUCH_TABLE")) {
          console.error("Erro ao buscar cliente na jornada:", erroClientes);
        }
      }

      // Desfecho da tela de planos: o mais recente "quiz_finalizado" desse visitante.
      let desfecho = null;
      try {
        const [linhasFim] = await pool.query(
          `SELECT respostas_json,
                  DATE_FORMAT(DATE_ADD(criado_em, INTERVAL ${desl} MINUTE), '%Y-%m-%d %H:%i:%s') AS criado_em
           FROM onboarding_respostas
           WHERE visitor_id = ? AND passo = ?
           ORDER BY criado_em DESC, id DESC
           LIMIT 1`,
          [visitor_id, PASSO_FIM]
        );
        if (linhasFim.length > 0) {
          const dados = lerJson(linhasFim[0].respostas_json);
          if (dados && typeof dados === "object") {
            desfecho = Object.assign({}, dados, { criado_em: linhasFim[0].criado_em });
          }
        }
      } catch (erroFim) {
        if (!(erroFim && erroFim.code === "ER_NO_SUCH_TABLE")) {
          console.error("Erro ao buscar desfecho do onboarding na jornada:", erroFim);
        }
      }

      return res.status(200).json({ visitor_id, eventos, respostasOnboarding, cadastro, desfecho });
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
      // Também procura no cadastro de quem passou pelo onboarding (e-mail,
      // negócio, nome, celular) e na aba Clientes — assim dá pra achar a
      // pessoa sem ter o ID do visitante. Tabelas opcionais.
      const jaListados = new Set(candidatos.map((c) => c.visitor_id));
      const doCadastro = [];
      const termoLike = "%" + escaparLike(busca) + "%";

      try {
        const [linhas] = await pool.query(
          `SELECT visitor_id, respostas_json,
                  DATE_FORMAT(DATE_ADD(criado_em, INTERVAL ${desl} MINUTE), '%Y-%m-%d %H:%i:%s') AS criado_em
           FROM onboarding_respostas
           WHERE passo = ? AND respostas_json LIKE ?
           ORDER BY criado_em DESC, id DESC
           LIMIT 50`,
          [PASSO_CADASTRO, termoLike]
        );
        linhas.forEach(function (l) {
          if (jaListados.has(l.visitor_id)) return;
          jaListados.add(l.visitor_id);
          const dados = lerJson(l.respostas_json) || {};
          doCadastro.push({
            visitor_id: l.visitor_id,
            rotulo: [dados.email, dados.negocio, dados.celular].filter(Boolean).join(" · "),
            tipo_evento: PASSO_CADASTRO,
            criado_em: l.criado_em,
          });
        });
      } catch (erroBuscaCadastro) {
        if (!(erroBuscaCadastro && erroBuscaCadastro.code === "ER_NO_SUCH_TABLE")) {
          console.error("Erro ao buscar no cadastro do onboarding:", erroBuscaCadastro);
        }
      }

      try {
        const [clientes] = await pool.query(
          `SELECT visitor_id, nome, email, celular, empresa,
                  DATE_FORMAT(DATE_ADD(criado_em, INTERVAL ${desl} MINUTE), '%Y-%m-%d %H:%i:%s') AS criado_em
           FROM clientes
           WHERE nome LIKE ? OR email LIKE ? OR celular LIKE ? OR empresa LIKE ?
           ORDER BY criado_em DESC
           LIMIT 20`,
          [termoLike, termoLike, termoLike, termoLike]
        );
        clientes.forEach(function (c) {
          if (jaListados.has(c.visitor_id)) return;
          jaListados.add(c.visitor_id);
          doCadastro.push({
            visitor_id: c.visitor_id,
            rotulo: [c.email, c.empresa || c.nome, c.celular].filter(Boolean).join(" · "),
            tipo_evento: PASSO_CADASTRO,
            criado_em: c.criado_em,
          });
        });
      } catch (erroBuscaClientes) {
        if (!(erroBuscaClientes && erroBuscaClientes.code === "ER_NO_SUCH_TABLE")) {
          console.error("Erro ao buscar em clientes:", erroBuscaClientes);
        }
      }

      return res.status(200).json({ candidatos: candidatos.concat(doCadastro).slice(0, 20) });
    }

    return res.status(400).json({ erro: "Informe visitor_id ou busca" });
  } catch (erro) {
    console.error("Erro ao buscar jornada:", erro);
    return res.status(500).json({ erro: "Erro interno ao buscar jornada" });
  }
}
