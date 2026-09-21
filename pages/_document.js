import { Html, Head, Main, NextScript } from "next/document";

// Aplica o tema salvo ANTES da página aparecer, pra não piscar o tema
// errado no carregamento. Padrão: escuro.
const SCRIPT_TEMA = `try{var t=localStorage.getItem("relinq_tema");if(t==="claro"||t==="escuro"){document.documentElement.setAttribute("data-tema",t)}}catch(e){}`;

export default function Document() {
  return (
    <Html lang="pt-BR" data-tema="escuro">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
