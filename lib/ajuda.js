// Textos curtos pro ícone de ajuda ("?") ao lado de cards e seções.
// Reaproveitados em `/`, `/relatorios` e `/saude` via <Ajuda texto={AJUDA.chave} />.
const AJUDA = {
  visitantes: "Visitantes únicos no período — cada pessoa conta uma vez, mesmo recarregando a página.",
  rejeicao: "% de visitantes que só viram a página: não clicaram em nada nem converteram.",
  conversao:
    'Só conta o evento "conversao" — reservado pra venda de verdade (pagamento confirmado ou cadastro pago concluído).',
  taxaConversao: "Visitantes que converteram ÷ visitantes totais do período.",
  cardsCriados: 'Quantas vezes o evento "card_criado" disparou — normalmente quando o formulário da LP é enviado com sucesso.',
  taxaCards: "Visitantes únicos que criaram card ÷ visitantes únicos do período.",
  tempoNaPagina:
    "Tempo médio até a pessoa sair da página ou trocar de aba (limitado a 30 min, pra uma aba esquecida aberta não distorcer a média).",
  profundidadeRolagem: "Até onde a pessoa rolou a página, em marcos de 25%, 50%, 75% e 100%.",
  dispositivo: "Celular, tablet ou computador, detectado automaticamente pelo navegador de quem visita.",
  funil: "Visita → clique → card criado → conversão — cada etapa conta visitantes únicos que passaram por ela.",
  variacao: "Comparação com o mesmo intervalo de tempo, no período imediatamente anterior a este.",
  saudeSemaforo: "Verde: evento na última hora. Âmbar: entre 1h e 24h sem eventos. Vermelho: mais de 24h sem eventos.",
};

export default AJUDA;
