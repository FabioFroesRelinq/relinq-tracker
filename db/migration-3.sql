-- Migração: adiciona a coluna "rotulo" na tabela events.
-- Serve pra identificar QUAL botão específico gerou o clique, sem deixar
-- de contar todos juntos em tipo_evento (ex: vários botões de WhatsApp
-- diferentes continuam contando juntos como "clique_whatsapp", mas agora
-- dá pra ver, dentro desse total, quantos vieram do plano Grátis, do
-- Essential, do Pro, etc.
--
-- Rode isso no banco que você já está usando — sem CREATE DATABASE/USE,
-- já que na Hostinger o nome do banco é o que você criou lá (ex:
-- u410883670_Tracker), não "relinq_tracker_db". Só confirma que o banco
-- certo está selecionado no phpMyAdmin antes de rodar.

ALTER TABLE events
  ADD COLUMN rotulo VARCHAR(150) AFTER tipo_evento;

CREATE INDEX idx_events_tipo_rotulo ON events (tipo_evento, rotulo);
