create table if not exists public.appointment_eta_notice_settings (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  first_service_starts_at timestamp with time zone,
  last_service_ends_at timestamp with time zone,
  enabled boolean not null default true,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.appointment_eta_notice_lines (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  supplier_name text not null,
  supplier_emails text not null,
  service_name text not null,
  in_mode text not null default 'none' check (in_mode in ('none', 'yes', 'qty')),
  in_qty integer,
  out_mode text not null default 'none' check (out_mode in ('none', 'yes', 'qty')),
  out_qty integer,
  trigger_eta_eosp boolean not null default false,
  trigger_epob boolean not null default false,
  trigger_etb boolean not null default false,
  trigger_etd boolean not null default false,
  trigger_eta_bunker boolean not null default false,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_eta_notice_lines_appointment_id
  on public.appointment_eta_notice_lines(appointment_id);

create index if not exists idx_eta_notice_lines_supplier_name
  on public.appointment_eta_notice_lines(lower(supplier_name));

create table if not exists public.appointment_eta_notice_dispatch_log (
  id uuid primary key default gen_random_uuid(),
  run_date_local date not null,
  slot_local text not null check (slot_local in ('1000', '2200')),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  supplier_name text not null,
  email_to text not null,
  subject text not null,
  email_id text,
  status text not null default 'sent',
  created_at timestamp with time zone not null default now()
);

create unique index if not exists uq_eta_notice_dispatch_once_per_slot
  on public.appointment_eta_notice_dispatch_log(run_date_local, slot_local, appointment_id, supplier_name);

