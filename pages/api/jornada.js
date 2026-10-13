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

// Lista de pessoas que já têm pelo menos NOME e CELULAR, sem precisar buscar.
//
// Une duas fontes por visitante (o que faltar numa vem da outra):
//   - o cadastro lido da tela do onboarding ("dados_cadastro": negócio, nome de
//     quem atende, e-mail, celular);
//   - a aba Clientes (/api/lead-checkout: nome, e-mail, celular, empresa...).
// "Nome" é o do negócio, o de quem atende ou o da aba Clientes; "celular" tem
// que ter pelo menos 8 dígitos. Ambas as tabelas são opcionais.
const LIMITE_MAXIMO_LISTA = 200;
const LIMITE_LINHAS_LEITURA = 50000;

function somenteDigitos(texto) {
  return String(texto || "").replace(/\D+/g, "");
}

async function listarPessoas(pool, desl, { q, limite, offset }) {
  const pessoas = new Map();

  function pessoa(visitorId) {
    if (!pessoas.has(visitorId)) {
      pessoas.set(visitorId, { visitor_id: visitorId, dados: {}, atualizado_em: "", site_nome: null });
    }
    return pessoas.get(visitorId);
  }

  function atualizar(p, quando) {
    if (quando && quando > p.atualizado_em) p.atualizado_em = quando;
  }

  try {
    const [linhas] = await pool.query(
      `SELECT r.visitor_id, r.respostas_json, s.nome AS site_nome,
              DATE_FORMAT(DATE_ADD(r.criado_em, INTERVAL ${desl} MINUTE), '%Y-%m-%d %H:%i:%s') AS criado_em
       FROM onboarding_respostas r
       LEFT JOIN sites s ON s.id = r.site_id
       WHERE r.passo = ?
       ORDER BY r.criado_em ASC, r.id ASC
       LIMIT ${LIMITE_LINHAS_LEITURA}`,
      [PASSO_CADASTRO]
    );
    linhas.forEach(function (l) {
      const dados = lerJson(l.respostas_json);
      if (!dados || typeof dados !== "object" || Array.isArray(dados)) return;
      const p = pessoa(l.visitor_id);
      // Mais recente por último: o valor novo de cada campo vence.
      Object.assign(p.dados, dados);
      if (l.site_nome) p.site_nome = l.site_nome;
      atualizar(p, l.criado_em);
    });
  } catch (erro) {
    if (!(erro && erro.code === "ER_NO_SUCH_TABLE")) {
      console.error("Erro ao listar cadastros do onboarding:", erro);
    }
  }

  try {
    const [clientes] = await pool.query(
      `SELECT c.visitor_id, c.nome, c.email, c.celular, c.empresa, c.cupom, c.plano, c.ciclo, s.nome AS site_nome,
              DATE_FORMAT(DATE_ADD(c.criado_em, INTERVAL ${desl} MINUTE), '%Y-%m-%d %H:%i:%s') AS criado_em
       FROM clientes c
       LEFT JOIN sites s ON s.id = c.site_id
       LIMIT ${LIMITE_LINHAS_LEITURA}`
    );
    clientes.forEach(function (c) {
      const p = pessoa(c.visitor_id);
      const doCliente = {
        negocio: c.empresa,
        nome_responsavel: c.nome,
        email: c.email,
        celular: c.celular,
        cupom: c.cupom,
        plano: c.plano,
        ciclo: c.ciclo,
      };
      // O que o onboarding já leu da tela tem prioridade; a aba Clientes só completa.
      Object.keys(doCliente).forEach(function (chave) {
        if (doCliente[chave] && !p.dados[chave]) p.dados[chave] = doCliente[chave];
      });
      if (!p.site_nome && c.site_nome) p.site_nome = c.site_nome;
      atualizar(p, c.criado_em);
    });
  } catch (erro) {
    if (!(erro && erro.code === "ER_NO_SUCH_TABLE")) {
      console.error("Erro ao listar clientes:", erro);
    }
  }

  const termo = String(q || "").trim().toLowerCase();
  const termoDigitos = somenteDigitos(termo);

  const completas = Array.from(pessoas.values())
    .map(function (p) {
      const d = p.dados;
      return {
        visitor_id: p.visitor_id,
        nome: d.negocio || d.nome_responsavel || null,
        negocio: d.negocio || null,
        nome_responsavel: d.nome_responsavel || null,
        email: d.email || null,
        celular: d.celular || null,
        plano: d.plano || null,
        site_nome: p.site_nome,
        atualizado_em: p.atualizado_em,
      };
    })
    .filter(function (p) {
      if (!p.nome || somenteDigitos(p.celular).length < 8) return false;
      if (!termo) return true;
      const texto = [p.negocio, p.nome_responsavel, p.email].filter(Boolean).join(" ").toLowerCase();
      return texto.indexOf(termo) !== -1 || (termoDigitos.length > 0 && somenteDigitos(p.celular).indexOf(termoDigitos) !== -1);
    })
    .sort(function (a, b) {
      return a.atualizado_em < b.atualizado_em ? 1 : a.atualizado_em > b.atualizado_em ? -1 : 0;
    });

  const itens = completas.slice(offset, offset + limite);

  // Como cada um terminou a tela de planos (free / pago), só pra quem aparece
  // nesta página da lista.
  if (itens.length > 0) {
    try {
      const [fins] = await pool.query(
        `SELECT visitor_id, respostas_json FROM onboarding_respostas
         WHERE passo = ? AND visitor_id IN (${itens.map(function () { return "?"; }).join(",")})
         ORDER BY criado_em ASC, id ASC`,
        [PASSO_FIM].concat(itens.map(function (i) { return i.visitor_id; }))
      );
      const porVisitante = {};
      fins.forEach(function (f) {
        const dados = lerJson(f.respostas_json);
        if (dados && typeof dados === "object") porVisitante[f.visitor_id] = dados;
      });
      itens.forEach(function (i) {
        i.desfecho = porVisitante[i.visitor_id] || null;
      });
    } catch (erro) {
      if (!(erro && erro.code === "ER_NO_SUCH_TABLE")) {
        console.error("Erro ao buscar desfechos da lista:", erro);
      }
    }
  }

  return { total: completas.length, itens };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  const { visitor_id, busca, lista } = req.query;

  try {
    const pool = getPool();
    const desl = Math.trunc((await infoFuso(pool)).deslocamentoMin);

    // Lista de pessoas com nome e celular (a tela abre com ela, sem busca).
    if (lista) {
      const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 50, 1), LIMITE_MAXIMO_LISTA);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      const resultado = await listarPessoas(pool, desl, { q: req.query.q, limite, offset });
      return res.status(200).json(resultado);
    }

    // Busca o histórico completo de um visitante específico, em qualquer LP
    if (visitor_id) {
      const [eventos] = await pool.query(
        `SELECT e.tipo_evento, e.rotulo, e.pagina, e.video_id, e.valor,
                DATE_FORMAT(DATE_ADD(e.criado_em, INTERVAL ${desl} MINUTE), '%Y-%m-%d %H:%i:%s') AS criado_em,
                s.nome AS site_nome, s.slug AS site_slug
         FROM events e
         JOIN sites s ON s.id = e.site_id
         WHERE e.visitor_id = ?
         ORDER BY e.criado_em ASC, e.id ASC`,
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
