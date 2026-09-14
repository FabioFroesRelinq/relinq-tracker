-- Migração: adiciona as colunas necessárias pras novas métricas
-- (visitantes únicos, dispositivo, scroll, tempo na página)
-- Rode isso no banco que você já criou (relinq_tracker_db) — não precisa recriar do zero.

USE relinq_tracker_db;

ALTER TABLE events
  ADD COLUMN visitor_id VARCHAR(64) AFTER valor,
  ADD COLUMN dispositivo VARCHAR(20) AFTER visitor_id;

CREATE INDEX idx_events_visitor ON events (site_id, visitor_id);
