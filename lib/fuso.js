// Fuso dos horários mostrados no painel.
//
// O MySQL guarda "criado_em" como DATETIME, ou seja, no relógio do próprio
// servidor do banco (na Hostinger costuma ser UTC), sem indicar o fuso. Pra
// mostrar horas certas (ex: "pico às 15h"), descobrimos sozinhos quanto o
// relógio do banco está à frente/atrás do UTC e deslocamos até o fuso de
// exibição — Brasília (UTC-3, sem horário de verão desde 2019). Se precisar de
// outro fuso, defina FUSO_EXIBICAO_HORAS (ex: -4).
function fusoExibicaoMin() {
  const bruto = process.env.FUSO_EXIBICAO_HORAS;
  if (bruto === undefined || bruto === "") return -180;
  const horas = Number(bruto);
  return Number.isFinite(horas) ? Math.round(horas * 60) : -180;
}

let cache = null;

// Devolve { bancoMin, exibicaoMin, deslocamentoMin }:
//   bancoMin        quantos minutos o relógio do banco está à frente do UTC
//   exibicaoMin     fuso de exibição, em minutos em relação ao UTC
//   deslocamentoMin quanto somar a um horário do banco pra obter o de exibição
export async function infoFuso(pool) {
  const agora = Date.now();
  if (cache && agora < cache.ate) return cache.info;

  // As duas funções valem o mesmo instante dentro da consulta, então a
  // diferença é exata (arredondamos a 15 min só por segurança).
  const [[linha]] = await pool.query("SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS offset_banco");
  const bancoMin = Math.round((Number(linha.offset_banco) || 0) / 15) * 15;
  const exibicaoMin = fusoExibicaoMin();
  const info = { bancoMin, exibicaoMin, deslocamentoMin: exibicaoMin - bancoMin };

  // Renova a cada 10 min: cobre a virada de horário de verão de um banco em outro país.
  cache = { info, ate: agora + 10 * 60 * 1000 };
  return info;
}
