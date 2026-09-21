-- Migration 5: localização aproximada dos visitantes (país, estado e cidade).
-- Rode uma vez no banco (phpMyAdmin, com o banco certo selecionado).
-- O IP NUNCA é guardado: só estes três campos, lidos dos cabeçalhos que a Vercel
-- envia (x-vercel-ip-country, x-vercel-ip-country-region e x-vercel-ip-city).
-- Só eventos novos ganham localização; os antigos ficam em branco.
-- Sem esta migration o tracker continua gravando normalmente, só sem localização.
ALTER TABLE events
  ADD COLUMN pais CHAR(2) NULL,
  ADD COLUMN estado VARCHAR(10) NULL,
  ADD COLUMN cidade VARCHAR(100) NULL;
