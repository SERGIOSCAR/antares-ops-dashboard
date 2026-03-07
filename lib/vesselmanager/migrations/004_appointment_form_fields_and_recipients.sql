alter table if exists public.appointments
  add column if not exists holds integer,
  add column if not exists appointment_datetime timestamp with time zone,
  add column if not exists other_agents text,
  add column if not exists other_agents_role text,
  add column if not exists notify_eta_suppliers boolean not null default false,
  add column if not exists notify_eta_agents_terminals boolean not null default false,
  add column if not exists notify_none boolean not null default false,
  add column if not exists needs_daily_prospect boolean not null default true;

create table if not exists public.appointment_recipients (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  category text not null,
  name text,
  email text not null,
  is_onetimer boolean not null default false,
  created_at timestamp without time zone not null default now()
);

create index if not exists idx_appointment_recipients_appointment_id
  on public.appointment_recipients(appointment_id);

create unique index if not exists idx_appointments_unique_vessel_port_datetime
  on public.appointments (lower(vessel_name), lower(port), appointment_datetime)
  where appointment_datetime is not null and port is not null;
