import { useEffect, useState } from "react";

export default function Relogio() {
  const [agora, setAgora] = useState(null);

  useEffect(function () {
    setAgora(new Date());
    var intervalo = setInterval(function () {
      setAgora(new Date());
    }, 1000);
    return function () {
      clearInterval(intervalo);
    };
  }, []);

  if (!agora) return null; // evita mismatch de horário entre servidor e cliente no primeiro render

  var hora = agora.toLocaleTimeString("pt-BR");
  var data = agora.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <span className="relogio">
      {data} · {hora}
    </span>
  );
}
