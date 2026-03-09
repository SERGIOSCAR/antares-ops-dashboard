alter table if exists public.appointments
  add column if not exists charterer_agent text;
