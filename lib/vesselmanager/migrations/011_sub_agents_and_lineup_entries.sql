create table if not exists public.sub_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamp without time zone not null default now()
);

alter table if exists public.appointments
  add column if not exists sub_agent_id uuid references public.sub_agents(id);

create table if not exists public.lineup_entries (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  content text not null default '',
  version integer not null default 1,
  updated_at timestamp without time zone not null default now(),
  updated_by text,
  updated_by_type text,
  source text
);

create table if not exists public.lineup_audit (
  id uuid primary key default gen_random_uuid(),
  lineup_entry_id uuid,
  appointment_id uuid not null,
  previous_content text,
  new_content text,
  version_from integer,
  version_to integer,
  changed_at timestamp without time zone not null default now(),
  changed_by text,
  changed_by_type text,
  source text
);

create index if not exists idx_appointments_sub_agent_id on public.appointments(sub_agent_id);
create index if not exists idx_lineup_entries_appointment_id on public.lineup_entries(appointment_id);
create index if not exists idx_lineup_audit_appointment_id on public.lineup_audit(appointment_id);
