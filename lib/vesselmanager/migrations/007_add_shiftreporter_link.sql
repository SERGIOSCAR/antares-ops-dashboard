alter table if exists public.appointments
  add column if not exists shiftreporter_link text;
