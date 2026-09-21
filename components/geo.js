// Nomes dos estados brasileiros a partir da sigla que a Vercel envia (ex: "SP").
var UF = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão",
  MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará",
  PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

// "São Paulo" para BR/SP; fora do Brasil, "US · CA".
export function nomeEstado(pais, estado) {
  if (!estado) return pais || "Sem localização";
  if (pais === "BR" || !pais) return UF[estado] || estado;
  return pais + " · " + estado;
}

// "Sorocaba (SP)" no Brasil; "Austin (US · TX)" fora.
export function nomeCidade(pais, estado, cidade) {
  if (!cidade) return nomeEstado(pais, estado);
  if (!estado) return cidade;
  return cidade + " (" + (pais === "BR" || !pais ? estado : pais + " · " + estado) + ")";
}
