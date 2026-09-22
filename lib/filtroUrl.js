// Mantém o filtro de LP e período na URL e no navegador, e leva esse
// filtro de uma página do painel pra outra (link no menu lateral já sai
// com o mesmo recorte). Roda só no cliente; em SSR os valores somem e
// cada tela cai no padrão de sempre — sem quebrar nada.

function lerStorage(chave) {
  try {
    return localStorage.getItem(chave) || "";
  } catch (e) {
    return "";
  }
}

function salvarStorage(chave, valor) {
  try {
    if (valor) localStorage.setItem(chave, valor);
    else localStorage.removeItem(chave);
  } catch (e) {}
}

// Site único (slug ou "todas") — usado no painel principal (`/`).
export function lerSiteInicial(query) {
  if (query && query.site) return query.site;
  return lerStorage("relinq_filtro_site");
}

export function salvarSite(slug) {
  salvarStorage("relinq_filtro_site", slug);
}

// Período — compartilhado entre painel, relatórios e visão geral.
export function lerPeriodoInicial(query, padraoInicio, padraoFim) {
  if (query && query.inicio && query.fim) {
    return { inicio: query.inicio, fim: query.fim };
  }
  var salvo = lerStorage("relinq_filtro_periodo");
  if (salvo) {
    try {
      var p = JSON.parse(salvo);
      if (p && p.inicio && p.fim) return p;
    } catch (e) {}
  }
  return { inicio: padraoInicio, fim: padraoFim };
}

export function salvarPeriodo(inicio, fim) {
  salvarStorage("relinq_filtro_periodo", JSON.stringify({ inicio: inicio, fim: fim }));
}

// Seleção múltipla de LPs — usada em `/relatorios`. Se a página anterior
// só mandou um "site" (seletor único), essa lista já abre com ele.
export function lerSelecionadosInicial(query) {
  if (query && query.lps) {
    return String(query.lps).split(",").filter(Boolean);
  }
  if (query && query.site && query.site !== "todas") {
    return [query.site];
  }
  var salvo = lerStorage("relinq_filtro_lps");
  if (salvo) {
    try {
      var arr = JSON.parse(salvo);
      if (Array.isArray(arr)) return arr;
    } catch (e) {}
  }
  return [];
}

export function salvarSelecionados(lista) {
  salvarStorage("relinq_filtro_lps", JSON.stringify(lista || []));
}

// Monta a query string do filtro atual, pro Shell anexar nos links do
// menu lateral (ex: "?site=relinq-beauty&inicio=2026-09-01&fim=2026-09-22").
export function montarQueryFiltro(filtro) {
  if (!filtro) return "";
  var partes = [];
  if (filtro.site) partes.push("site=" + encodeURIComponent(filtro.site));
  if (filtro.lps && filtro.lps.length) partes.push("lps=" + encodeURIComponent(filtro.lps.join(",")));
  if (filtro.inicio) partes.push("inicio=" + filtro.inicio);
  if (filtro.fim) partes.push("fim=" + filtro.fim);
  return partes.length ? "?" + partes.join("&") : "";
}
