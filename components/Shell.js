import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Icone from "./Icones";
import AvisosCards from "./AvisosCards";
import MenuAvisos from "./MenuAvisos";
import useAvisoCards from "./useAvisoCards";
import { montarQueryFiltro } from "../lib/filtroUrl";
import estilos from "../styles/shell.module.css";

const LOGO =
  "https://lightblue-monkey-580531.hostingersite.com/wp-content/uploads/2026/09/logo-removebg-preview.png";

const ITENS = [
  { href: "/", rotulo: "Painel por LP", icone: "painel" },
  { href: "/visao-geral", rotulo: "Visão geral", icone: "comparar" },
  { href: "/relatorios", rotulo: "Relatórios", icone: "relatorios" },
  { href: "/jornada", rotulo: "Jornada", icone: "jornada" },
  { href: "/saude", rotulo: "Saúde do tracking", icone: "pulso" },
  { href: "/sites", rotulo: "Cadastrar LP", icone: "mais" },
  { href: "/tv", rotulo: "Modo TV", icone: "tv" },
];

// Estrutura comum das telas logadas: menu lateral fixo (gaveta no celular),
// cabeçalho da página e alternância de tema claro/escuro.
export default function Shell({ titulo, subtitulo, acoes, children, filtro }) {
  const router = useRouter();
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const [tema, setTema] = useState("escuro");
  const avisosCard = useAvisoCards();
  // Sufixo com o filtro (LP/período) da página atual, pra quem navegar
  // pelo menu lateral continuar vendo o mesmo recorte na página seguinte.
  const sufixoFiltro = montarQueryFiltro(filtro);

  useEffect(function () {
    setTema(document.documentElement.getAttribute("data-tema") === "claro" ? "claro" : "escuro");
  }, []);

  useEffect(
    function () {
      function fechar() {
        setGavetaAberta(false);
      }
      router.events.on("routeChangeComplete", fechar);
      return function () {
        router.events.off("routeChangeComplete", fechar);
      };
    },
    [router.events]
  );

  function alternarTema() {
    var novo = tema === "claro" ? "escuro" : "claro";
    document.documentElement.setAttribute("data-tema", novo);
    try {
      localStorage.setItem("relinq_tema", novo);
    } catch (e) {}
    setTema(novo);
  }

  function sair() {
    fetch("/api/logout", { method: "POST" }).finally(function () {
      router.push("/login");
    });
  }

  function ativo(href) {
    return href === "/" ? router.pathname === "/" : router.pathname.indexOf(href) === 0;
  }

  return (
    <div className={estilos.app}>
      <AvisosCards avisos={avisosCard.avisos} aoFechar={avisosCard.dispensar} />

      <header className={estilos.topoMobile}>
        <button
          type="button"
          className={estilos.botaoIcone}
          aria-label="Abrir menu"
          onClick={function () {
            setGavetaAberta(true);
          }}
        >
          <Icone nome="menu" tamanho={22} />
        </button>
        <img src={LOGO} alt="Relinq" className={"logo-relinq " + estilos.logoMobile} />
        <button
          type="button"
          className={estilos.botaoIcone}
          aria-label={tema === "claro" ? "Usar tema escuro" : "Usar tema claro"}
          onClick={alternarTema}
        >
          <Icone nome={tema === "claro" ? "lua" : "sol"} tamanho={20} />
        </button>
      </header>

      {gavetaAberta && (
        <div
          className={estilos.fundoGaveta}
          onClick={function () {
            setGavetaAberta(false);
          }}
        />
      )}

      <aside className={estilos.lateral + (gavetaAberta ? " " + estilos.lateralAberta : "")} aria-label="Menu principal">
        <div className={estilos.marca}>
          <img src={LOGO} alt="Relinq" className="logo-relinq" />
          <span className={estilos.produto}>Tracker</span>
          <button
            type="button"
            className={estilos.fechar + " " + estilos.botaoIcone}
            aria-label="Fechar menu"
            onClick={function () {
              setGavetaAberta(false);
            }}
          >
            <Icone nome="fechar" tamanho={20} />
          </button>
        </div>

        <nav className={estilos.nav}>
          {ITENS.map(function (item) {
            var on = ativo(item.href);
            return (
              <Link
                key={item.href}
                href={item.href + sufixoFiltro}
                className={estilos.item + (on ? " " + estilos.itemAtivo : "")}
                aria-current={on ? "page" : undefined}
              >
                <Icone nome={item.icone} />
                {item.rotulo}
              </Link>
            );
          })}
        </nav>

        <div className={estilos.rodape}>
          <MenuAvisos
            prefs={avisosCard.prefs}
            atualizarPrefs={avisosCard.atualizarPrefs}
            permissao={avisosCard.permissao}
            pedirPermissao={avisosCard.pedirPermissao}
            classeItem={estilos.item}
          />
          <button type="button" className={estilos.item} onClick={alternarTema}>
            <Icone nome={tema === "claro" ? "lua" : "sol"} />
            {tema === "claro" ? "Tema escuro" : "Tema claro"}
          </button>
          <button type="button" className={estilos.item} onClick={sair}>
            <Icone nome="sair" />
            Sair
          </button>
        </div>
      </aside>

      <main className={estilos.principal}>
        <div className={estilos.conteudo}>
          <div className="pagina-topo">
            <div>
              <h1>{titulo}</h1>
              {subtitulo && <p className="pagina-sub">{subtitulo}</p>}
            </div>
            {acoes && <div className="pagina-acoes">{acoes}</div>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
