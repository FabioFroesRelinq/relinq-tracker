-- migration-9.sql: torna "visitor_id" único na tabela "clientes", pra
-- permitir que /api/lead-checkout seja chamado mais de uma vez pro mesmo
-- visitante (ex: um cadastro em 2 passos, disparando um POST a cada passo
-- pra capturar quem abandona no meio) sem criar linhas duplicadas — a
-- segunda chamada atualiza a linha já existente em vez de criar outra.
--
-- Precisa rodar depois de migration-7.sql. Se a tabela "clientes" já tiver
-- linhas com visitor_id repetido (pouco provável, mas possível se o
-- endpoint já foi chamado mais de uma vez pra mesma pessoa antes dessa
-- migration), rode antes uma limpeza manual — este ALTER falha nesse caso,
-- em vez de apagar dado silenciosamente.

ALTER TABLE clientes
  DROP INDEX idx_clientes_visitor,
  ADD UNIQUE INDEX idx_clientes_visitor (visitor_id);
