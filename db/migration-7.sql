-- migration-7.sql: aba "Clientes" — guarda os dados de quem preenche o
-- formulário de cadastro/checkout (nome, e-mail, celular, plano...), mesmo
-- que a pessoa não conclua a assinatura. Rode uma vez pra habilitar a
-- tela /clientes.
--
-- A LP de origem (site_id) não vem no payload de captura — é resolvida
-- aqui pelo histórico de eventos do mesmo visitor_id (o último site em que
-- esse visitante teve algum evento registrado). Por isso pode ficar nula,
-- se por algum motivo o visitor_id não bater com nenhum evento conhecido.

CREATE TABLE IF NOT EXISTS clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    visitor_id VARCHAR(64) NOT NULL,
    site_id INT,
    nome VARCHAR(255),
    email VARCHAR(255),
    celular VARCHAR(30),
    empresa VARCHAR(255),
    cupom VARCHAR(60),
    plano VARCHAR(60),
    ciclo VARCHAR(20),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL
);

CREATE INDEX idx_clientes_visitor ON clientes (visitor_id);
CREATE INDEX idx_clientes_email ON clientes (email);
CREATE INDEX idx_clientes_site_data ON clientes (site_id, criado_em);
