-- Reset sub-agent catalog to fixed list requested by operations.
-- This keeps appointments valid by clearing existing foreign keys first.

update public.appointments
set sub_agent_id = null
where sub_agent_id is not null;

delete from public.sub_agents;

insert into public.sub_agents (name, slug, is_active)
values
  ('Walsh', 'walsh', true),
  ('Ramos', 'ramos', true),
  ('Brisamar', 'brisamar', true),
  ('Consultores', 'consultores', true),
  ('Tamic', 'tamic', true),
  ('Blue', 'blue', true),
  ('Uria', 'uria', true);

