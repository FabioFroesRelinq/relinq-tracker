// Cores de destaque das LPs. Se a LP não tem cor escolhida (ou a migration-4
// ainda não rodou), usa uma da paleta, sempre a mesma pro mesmo id.
export const PALETA_LP = [
  "#6366f1",
  "#06b6d4",
  "#f59e0b",
  "#22c55e",
  "#f43f5e",
  "#a78bfa",
  "#14b8a6",
  "#fb923c",
  "#38bdf8",
  "#f472b6",
];

var RE_COR = /^#[0-9a-fA-F]{6}$/;

export function corValida(cor) {
  return typeof cor === "string" && RE_COR.test(cor);
}

export function corDaLP(site) {
  if (!site) return PALETA_LP[0];
  if (corValida(site.cor)) return site.cor;
  var n = Number(site.id) || 1;
  return PALETA_LP[(n - 1 + PALETA_LP.length) % PALETA_LP.length];
}

// Texto escuro ou branco, o que tiver mais contraste sobre a cor da LP.
export function corTextoSobre(hex) {
  if (!corValida(hex)) return "#ffffff";
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  var luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminancia > 0.62 ? "#0f172a" : "#ffffff";
}

// Bolinha colorida ao lado do nome da LP. "cor" força uma cor específica.
export function PontoLP({ site, tamanho = 10, cor }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: tamanho,
        height: tamanho,
        borderRadius: "50%",
        background: cor || corDaLP(site),
        flexShrink: 0,
      }}
    />
  );
}
