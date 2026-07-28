-- Adiciona armazenamento dinâmico para colunas de CSV que o cliente escolhe
-- como filtro do dashboard ou dado demográfico, mas que não correspondem a
-- nenhum campo canônico fixo de collaborators (area, role, gender, ...).
--
-- Rode este arquivo no SQL Editor do Supabase do projeto (não há CLI/migrations
-- automatizadas neste repositório).
alter table collaborators
  add column if not exists extra_fields jsonb not null default '{}'::jsonb;

comment on column collaborators.extra_fields is
  'Valores de colunas customizadas do CSV do cliente, escolhidas como filtro/demográfico na criação do mapeamento, chaveadas pelo slug do cabeçalho (ver src/lib/mapping/column-key.ts).';
