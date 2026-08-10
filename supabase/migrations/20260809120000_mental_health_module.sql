-- Módulo SAÚDE MENTAL — pacote com "Comportamento e Emoção", "Fatores
-- Ambientais" e "Percepção sobre Saúde e Qualidade de Vida".
--
-- Rode este arquivo no SQL Editor do Supabase do projeto (não há CLI/migrations
-- automatizadas neste repositório).
--
-- Decisão estrutural: **não existe tabela de fórmulas**. As respostas brutas
-- ficam em `mental_health_answers` e todos os derivados (flags, níveis, notas,
-- média ponderada, índice e classificação) são calculados pelo motor em
-- src/lib/analytics/mental-health.ts. `mental_health_derived` é apenas um cache
-- desse cálculo, gravado junto da submissão para que o dashboard agregue sem
-- recomputar — e sempre reconstituível a partir de `mental_health_answers`.

alter table responses
  add column if not exists mental_health_answers jsonb,
  add column if not exists mental_health_derived jsonb,
  add column if not exists mental_health_score numeric,
  add column if not exists mental_health_class text;

comment on column responses.mental_health_answers is
  'Respostas brutas dos 73 campos do módulo Saúde Mental, chaveadas pelo nome do campo (ver src/lib/analytics/mental-health-definition.ts). Fonte da verdade: tudo o mais é derivado daqui.';

comment on column responses.mental_health_derived is
  'Cache do resultado de calculateMentalHealth(): componentes com nota/peso, níveis, categorias e flags descritivas. Recalculável a partir de mental_health_answers.';

comment on column responses.mental_health_score is
  'Índice de Saúde Mental (0–10; 0–5 quando há indicador de risco de suicídio, pois o divisor vira 2). NULL quando a soma dos pesos respondidos fica abaixo do piso de confiabilidade.';

comment on column responses.mental_health_class is
  'Classificação do índice: Insatisfatório (<5), Regular (<7), Bom (<9), Excelente (>=9) ou Sem dados.';

-- Índice usado pelas agregações do dashboard, que filtram por colaborador e
-- descartam respostas sem módulo de saúde mental.
create index if not exists responses_mental_health_class_idx
  on responses (mental_health_class)
  where mental_health_class is not null;
