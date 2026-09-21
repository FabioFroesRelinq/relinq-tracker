-- Migration 6: perfil da LP (meta principal e eventos esperados).
-- Rode uma vez no banco (phpMyAdmin, com o banco certo selecionado).
--   meta_principal:    'card_criado', 'conversao' ou 'whatsapp' (vazio = automática)
--   eventos_esperados: lista separada por vírgula (ex: 'visita,scroll_profundidade,card_criado');
--                      vazio = sugestão automática a partir da meta
-- Sem esta migration o painel continua funcionando no modo automático de sempre.
ALTER TABLE sites
  ADD COLUMN meta_principal VARCHAR(30) NULL,
  ADD COLUMN eventos_esperados VARCHAR(255) NULL;
