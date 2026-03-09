create table if not exists public.appointment_workspace_notes (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  tool text not null,
  content text not null default '',
  updated_by uuid,
  updated_at timestamp with time zone not null default now(),
  unique (appointment_id, tool)
);

create index if not exists idx_workspace_notes_appointment
  on public.appointment_workspace_notes(appointment_id);
