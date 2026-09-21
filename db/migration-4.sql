-- Migration 4: cor de destaque de cada LP (usada em chips, tabelas e gráficos).
-- Rode uma vez no banco (phpMyAdmin, com o banco certo selecionado).
-- Sem ela o painel continua funcionando: cada LP usa uma cor automática.
ALTER TABLE sites ADD COLUMN cor VARCHAR(7) NULL;
