-- migration-8.sql: tabela "onboarding_respostas" — guarda o CONTEÚDO das
-- respostas dadas passo a passo em fluxos internos do app (ex: o
-- onboarding/quiz de configuração em app.relinqbeauty.com.br), quando a
-- resposta é rica demais pra caber no "rotulo" de um evento comum
-- (múltipla seleção, preço/duração por serviço, horário de atendimento
-- por dia da semana, etc.)
--
-- O FUNIL das etapas (quantos visitantes chegaram em cada passo, tempo
-- gasto, onde abandonaram) continua usando a tabela "events" normalmente
-- — convenção: qualquer evento começando com "onboard_" vira uma etapa
-- desse funil automaticamente no painel, do mesmo jeito que "clique_" já
-- vira um tipo de clique separado. Essa tabela aqui é só pro CONTEÚDO das
-- respostas mais estruturadas de cada etapa, disparadas via
-- relinqTrackPasso(evento, { respostas: {...} }) no tracker.js.
--
-- Rode uma vez pra habilitar a tela /onboarding.

CREATE TABLE IF NOT EXISTS onboarding_respostas (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    visitor_id VARCHAR(64) NOT NULL,
    site_id INT,
    passo VARCHAR(60) NOT NULL,        -- nome do evento que gerou a resposta (ex: "onboard_servicos")
    respostas_json LONGTEXT NOT NULL,  -- JSON livre, formato definido por cada passo
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL
);

CREATE INDEX idx_onboarding_respostas_visitor ON onboarding_respostas (visitor_id);
CREATE INDEX idx_onboarding_respostas_site_data ON onboarding_respostas (site_id, criado_em);
CREATE INDEX idx_onboarding_respostas_passo ON onboarding_respostas (passo);
