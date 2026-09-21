// Perfil da LP: meta principal + eventos esperados.
// Módulo sem dependências de servidor: as API routes usam pra validar e as
// páginas usam pra montar telas.

// Metas que o painel entende. "null" = automática (comportamento de antes:
// mostra cards se houver, senão conversões).
export const METAS = {
  card_criado: {
    chave: "card_criado",
    rotulo: "Card criado",
    resumo: "Cards criados pelo formulário",
    eventosEsperados: ["card_criado"],
  },
  conversao: {
    chave: "conversao",
    rotulo: "Conversão",
    resumo: "Conversões (compra, cadastro concluído)",
    eventosEsperados: ["conversao"],
  },
  whatsapp: {
    chave: "whatsapp",
    rotulo: "Contato no WhatsApp",
    resumo: "Pessoas que abriram o WhatsApp a partir da LP",
    eventosEsperados: ["cliques", "whatsapp_aberto"],
  },
};

export const CHAVES_METAS = Object.keys(METAS);

// Eventos que dá pra esperar de uma LP. "frequente" = costuma chegar toda hora
// (a Saúde avisa quando param); os outros dependem do que a pessoa faz.
export const EVENTOS_ESPERAVEIS = [
  { chave: "visita", rotulo: "Visitas", frequente: true },
  { chave: "scroll_profundidade", rotulo: "Rolagem", frequente: true },
  { chave: "tempo_pagina", rotulo: "Tempo na página", frequente: true },
  { chave: "cliques", rotulo: "Cliques em botões", frequente: false },
  { chave: "whatsapp_aberto", rotulo: "WhatsApp aberto", frequente: false },
  { chave: "card_criado", rotulo: "Cards criados", frequente: false },
  { chave: "conversao", rotulo: "Conversões", frequente: false },
  { chave: "video", rotulo: "Vídeo", frequente: false },
  { chave: "quiz", rotulo: "Quiz", frequente: false },
];

export const CHAVES_ESPERAVEIS = EVENTOS_ESPERAVEIS.map(function (e) {
  return e.chave;
});

export function rotuloEvento(chave) {
  var e = EVENTOS_ESPERAVEIS.filter(function (x) {
    return x.chave === chave;
  })[0];
  return e ? e.rotulo : chave;
}

export function ehFrequente(chave) {
  var e = EVENTOS_ESPERAVEIS.filter(function (x) {
    return x.chave === chave;
  })[0];
  return !!(e && e.frequente);
}

export function metaValida(meta) {
  return typeof meta === "string" && CHAVES_METAS.indexOf(meta) >= 0 ? meta : null;
}

// Sem lista definida: o básico que o tracker.js envia sozinho + o que a meta pede.
export function esperadosPadrao(meta) {
  var base = ["visita", "scroll_profundidade", "tempo_pagina"];
  var m = METAS[metaValida(meta)];
  if (!m) return base;
  return base.concat(
    m.eventosEsperados.filter(function (c) {
      return base.indexOf(c) < 0;
    })
  );
}

// "visita,scroll_profundidade" -> ["visita","scroll_profundidade"] (só chaves conhecidas). null = automático.
export function lerEsperados(texto) {
  if (typeof texto !== "string" || texto.trim() === "") return null;
  var lista = texto
    .split(",")
    .map(function (s) {
      return s.trim();
    })
    .filter(function (s, i, a) {
      return CHAVES_ESPERAVEIS.indexOf(s) >= 0 && a.indexOf(s) === i;
    });
  return lista.length > 0 ? lista : null;
}

export function gravarEsperados(lista) {
  var validos = (Array.isArray(lista) ? lista : []).filter(function (s, i, a) {
    return CHAVES_ESPERAVEIS.indexOf(s) >= 0 && a.indexOf(s) === i;
  });
  return validos.length > 0 ? validos.join(",") : null;
}

// Lista final de esperados de uma LP (a dela, ou a sugestão pela meta).
export function esperadosDaLP(site) {
  if (!site) return esperadosPadrao(null);
  return lerEsperados(site.eventos_esperados) || esperadosPadrao(site.meta_principal);
}

// Meta que vale para a tela: a da LP escolhida, ou — em "todas as LPs" — a meta
// em comum, se todas tiverem a mesma. Metas diferentes ou nenhuma: automática (null).
export function metaDoEscopo(sites, siteAtual) {
  if (siteAtual) return metaValida(siteAtual.meta_principal);
  var lista = Array.isArray(sites) ? sites : [];
  if (lista.length === 0) return null;
  var primeira = metaValida(lista[0].meta_principal);
  for (var i = 1; i < lista.length; i++) {
    if (metaValida(lista[i].meta_principal) !== primeira) return null;
  }
  return primeira;
}

// Números da meta a partir dos KPIs (mesmo formato no painel, no resumo e na TV).
// contagem/taxa = null quando ainda não há como medir (ex: WhatsApp sem o tracker novo).
export function resumoDaMeta(meta, k) {
  if (!k) return null;
  if (meta === "card_criado") {
    return {
      meta: meta,
      rotuloContagem: "Cards criados",
      contagem: k.cards,
      rotuloTaxa: "Taxa de cards",
      taxa: k.taxaCards,
      notaTaxa: "dos visitantes únicos",
      chaveSerie: "cards",
      medida: true,
    };
  }
  if (meta === "conversao") {
    return {
      meta: meta,
      rotuloContagem: "Conversões",
      contagem: k.conversoes,
      rotuloTaxa: "Taxa de conversão",
      taxa: k.taxaConversao,
      notaTaxa: "das visitas",
      chaveSerie: "conversoes",
      medida: true,
    };
  }
  if (meta === "whatsapp") {
    var medida = k.whatsappVerificados > 0;
    return {
      meta: meta,
      rotuloContagem: "WhatsApp aberto",
      contagem: medida ? k.whatsappAbriram : null,
      rotuloTaxa: "Taxa de abertura",
      taxa: medida ? k.taxaAbertura : null,
      notaTaxa: "dos que clicaram",
      chaveSerie: "whatsappAbertos",
      medida: medida,
    };
  }
  return null;
}
