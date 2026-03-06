-- VesselManager Phase 1 schema
create extension if not exists pgcrypto;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  vessel_name text not null,
  role text not null,
  appointed_by text not null,
  port text,
  terminal text,
  cargo_operation text,
  cargo_grade text,
  cargo_qty numeric,
  status text not null default 'PROSPECT',
  created_by uuid,
  created_at timestamp without time zone not null default now()
);

create table if not exists public.timeline_event_types (
  code text primary key,
  label text,
  display_order integer
);

insert into public.timeline_event_types (code, label, display_order)
values
  ('ETA_OUTER_ROADS', 'ETA Outer Roads', 1),
  ('EPOB', 'EPOB', 2),
  ('ETA_RIVER', 'ETA River', 3),
  ('ETB', 'ETB', 4),
  ('COMMENCE_OPS', 'Commence Ops', 5),
  ('COMPLETE_OPS', 'Complete Ops', 6),
  ('ETD', 'ETD', 7)
on conflict (code) do update
set label = excluded.label,
    display_order = excluded.display_order;

create table if not exists public.appointment_timeline (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  event_type text not null references public.timeline_event_types(code),
  eta timestamp without time zone,
  ata timestamp without time zone
);

create index if not exists idx_appointments_status on public.appointments(status);
create index if not exists idx_appointments_created_at on public.appointments(created_at desc);
create index if not exists idx_appointment_timeline_appointment on public.appointment_timeline(appointment_id);
create index if not exists idx_appointment_timeline_event_type on public.appointment_timeline(event_type);
