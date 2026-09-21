// "Horário de Brasília" (UTC-3) ou "UTC+2" etc., a partir do fuso em minutos.
export default function nomeFuso(exibicaoMin) {
  if (exibicaoMin === undefined || exibicaoMin === null || exibicaoMin === -180) return "horário de Brasília";
  var sinal = exibicaoMin < 0 ? "-" : "+";
  var abs = Math.abs(exibicaoMin);
  var h = Math.floor(abs / 60);
  var m = abs % 60;
  return "UTC" + sinal + h + (m ? ":" + String(m).padStart(2, "0") : "");
}
