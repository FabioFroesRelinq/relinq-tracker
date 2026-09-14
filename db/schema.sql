-- Banco de dados do Relinq Tracker
-- Schema simples: 2 tabelas (sites e events)

CREATE DATABASE IF NOT EXISTS relinq_tracker_db;
USE relinq_tracker_db;

-- Cadastro das LPs rastreadas
CREATE TABLE IF NOT EXISTS sites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(100) NOT NULL UNIQUE,   -- identificador usado no snippet (data-site="relinq-beauty")
    nome VARCHAR(150) NOT NULL,
    dominio VARCHAR(255),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Eventos brutos (visita, clique, conversao, eventos de video, scroll, etc.)
CREATE TABLE IF NOT EXISTS events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    site_id INT NOT NULL,
    tipo_evento VARCHAR(50) NOT NULL,       -- 'visita', 'conversao',
                                             -- 'clique_whatsapp', 'clique_cta', 'clique_checkout', etc.
                                             --   (qualquer evento começando com "clique_" vira um
                                             --   tipo de clique separado no painel)
                                             -- 'video_play', 'video_progress', 'video_pause', 'video_complete',
                                             -- 'scroll_profundidade', 'tempo_pagina'
    pagina VARCHAR(255),                    -- path da URL onde o evento ocorreu
    video_id VARCHAR(100),                  -- identifica qual video, se houver mais de um na LP
    valor INT,                              -- uso livre por tipo de evento:
                                             --   video_progress -> percentual (10, 20, ..., 100)
                                             --   video_pause/video_complete -> segundos assistidos
                                             --   scroll_profundidade -> percentual rolado (25, 50, 75, 100)
                                             --   tempo_pagina -> segundos de permanência na página
    visitor_id VARCHAR(64),                 -- ID anônimo gerado no navegador (localStorage),
                                             -- persiste entre visitas -> permite visitantes únicos e bounce rate
    dispositivo VARCHAR(20),                -- 'mobile', 'tablet' ou 'desktop'
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(150),
    utm_content VARCHAR(150),
    utm_term VARCHAR(150),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

-- Índices para acelerar as consultas do painel (filtro por site + período + tipo)
CREATE INDEX idx_events_site_data ON events (site_id, criado_em);
CREATE INDEX idx_events_tipo ON events (tipo_evento);
CREATE INDEX idx_events_utm_source ON events (utm_source);
CREATE INDEX idx_events_utm_campaign ON events (utm_campaign);
CREATE INDEX idx_events_video ON events (video_id, tipo_evento);
CREATE INDEX idx_events_visitor ON events (site_id, visitor_id);
