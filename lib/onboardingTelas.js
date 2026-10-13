// Telas do onboarding do app (relinq-onboarding), NA ORDEM EM QUE APARECEM.
//
// É a fonte da ordem do funil e de "onde a pessoa parou". Sem isso a ordem
// vinha de quantos visitantes chegaram em cada etapa, que embaralha com
// empate e com etapa opcional — e aí não dá pra ter certeza da tela em que
// alguém abandonou.
//
//   tela     — id da tela no app (é o stepId do rascunho que o tracker.js lê)
//   evento   — evento que marca a tela CONCLUÍDA (a linha dela no funil)
//   nome     — como aparece no painel
//
// Se o app ganhar, perder ou reordenar uma tela, é só aqui — e no tracker.js,
// que reporta a tela em que a pessoa está — que isso precisa mudar.
export const TELAS_DO_ONBOARDING = [
  { tela: "welcome", evento: "onboard_boas_vindas", nome: "Boas-vindas" },
  { tela: "identity", evento: "onboard_identificacao", nome: "Identificação" },
  { tela: "work_mode", evento: "onboard_modo_trabalho", nome: "Modo de trabalho" },
  { tela: "area", evento: "onboard_area_atuacao", nome: "Área de atuação" },
  { tela: "services", evento: "onboard_servicos", nome: "Serviços" },
  { tela: "service_prices", evento: "onboard_precos_duracao", nome: "Preços e duração" },
  { tela: "business", evento: "onboard_negocio", nome: "Sobre o negócio" },
  { tela: "contacts", evento: "onboard_contatos", nome: "Contatos" },
  { tela: "first_appointment", evento: "onboard_primeiro_agendamento", nome: "Primeiro agendamento" },
  { tela: "source", evento: "onboard_como_conheceu", nome: "Como conheceu" },
  { tela: "plan", evento: "onboard_plano", nome: "Escolha do plano" },
];

// Subtela da escolha do plano: a pessoa já escolheu e está na hora de pagar.
// Não tem evento de conclusão próprio — pagar encerra o fluxo. Conta como a
// tela do plano no funil, mas é mostrada à parte pra separar quem desistiu de
// escolher de quem desistiu de pagar.
export const TELA_PAGAMENTO = "plan_payment";
export const NOME_TELA_PAGAMENTO = "Pagamento do plano";

// Evento que o tracker.js manda a cada tela aberta (rotulo = id da tela,
// valor = número de sequência que só cresce, pra ordenar sem depender do
// horário, que tem resolução de 1 segundo).
export const EVENTO_TELA_VISTA = "tela_onboarding";

export function telaPorId(tela) {
  if (tela === TELA_PAGAMENTO) return TELAS_DO_ONBOARDING.find((t) => t.tela === "plan");
  return TELAS_DO_ONBOARDING.find((t) => t.tela === tela) || null;
}

export function telaPorEvento(evento) {
  return TELAS_DO_ONBOARDING.find((t) => t.evento === evento) || null;
}

export function nomeDaTela(tela) {
  if (tela === TELA_PAGAMENTO) return NOME_TELA_PAGAMENTO;
  const t = telaPorId(tela);
  return t ? t.nome : tela;
}

// Posição da tela na ordem do app (-1 se não for uma tela conhecida).
export function posicaoDoEvento(evento) {
  return TELAS_DO_ONBOARDING.findIndex((t) => t.evento === evento);
}

// Sem registro das telas abertas (dados antigos), estima onde a pessoa parou:
// a primeira tela depois da última concluída (a que ela estava vendo quando
// saiu). Contatos fica de fora da estimativa porque só existe no app — contar
// ela jogaria no lugar errado todo mundo da web.
export function proximaTelaDepoisDe(evento) {
  const posicao = posicaoDoEvento(evento);
  if (posicao === -1) return null;
  for (let i = posicao + 1; i < TELAS_DO_ONBOARDING.length; i++) {
    if (TELAS_DO_ONBOARDING[i].tela !== "contacts") return TELAS_DO_ONBOARDING[i];
  }
  return null;
}
