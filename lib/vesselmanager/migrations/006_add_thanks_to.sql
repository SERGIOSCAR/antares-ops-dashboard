alter table if exists public.appointments
  add column if not exists thanks_to text;
