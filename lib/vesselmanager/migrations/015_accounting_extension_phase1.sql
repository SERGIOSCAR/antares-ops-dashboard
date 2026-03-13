create table if not exists public.appointment_accounting (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  accounting_reference text,
  nomination_received_on date,
  pda_sent_on date,
  pda_not_required boolean not null default false,
  departure_override_on date,
  roe numeric(12,4),
  ada_created_on date,
  ada_sent_on date,
  ada_not_required boolean not null default false,
  fda_created_on date,
  fda_sent_on date,
  fda_not_required boolean not null default false,
  comments text,
  berth text,
  days_count integer,
  operator_initials text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table if exists public.appointment_accounting
  add column if not exists accounting_reference text,
  add column if not exists nomination_received_on date,
  add column if not exists pda_sent_on date,
  add column if not exists pda_not_required boolean not null default false,
  add column if not exists departure_override_on date,
  add column if not exists roe numeric(12,4),
  add column if not exists ada_created_on date,
  add column if not exists ada_sent_on date,
  add column if not exists ada_not_required boolean not null default false,
  add column if not exists fda_created_on date,
  add column if not exists fda_sent_on date,
  add column if not exists fda_not_required boolean not null default false,
  add column if not exists comments text,
  add column if not exists berth text,
  add column if not exists days_count integer,
  add column if not exists operator_initials text,
  add column if not exists created_at timestamp with time zone not null default now(),
  add column if not exists updated_at timestamp with time zone not null default now();

create index if not exists idx_appointment_accounting_nomination_received_on
  on public.appointment_accounting(nomination_received_on);

create index if not exists idx_appointment_accounting_pda_sent_on
  on public.appointment_accounting(pda_sent_on);

create index if not exists idx_appointment_accounting_ada_sent_on
  on public.appointment_accounting(ada_sent_on);

create index if not exists idx_appointment_accounting_fda_sent_on
  on public.appointment_accounting(fda_sent_on);

create or replace view public.v_appointment_accounting_board as
with etd as (
  select
    appointment_id,
    coalesce(
      max(ata::date) filter (where ata is not null),
      max(eta::date) filter (where eta is not null),
      max(event_date)
    ) as departure_date
  from public.appointment_timeline
  where event_type = 'ETD'
  group by appointment_id
)
select
  a.id as appointment_id,
  a.vessel_name,
  a.port,
  a.terminal,
  a.appointed_by as client_name,
  a.cargo_operation,
  a.status as appointment_status,
  acc.accounting_reference,
  acc.nomination_received_on,
  coalesce(etd.departure_date, acc.departure_override_on) as departure_date,
  acc.roe,
  acc.pda_sent_on,
  case
    when acc.pda_not_required then 'NO'
    when acc.pda_sent_on is not null then 'SI'
    else 'PENDIENTE'
  end as pda_status,
  acc.ada_created_on,
  acc.ada_sent_on,
  case
    when acc.ada_created_on is not null then 'SI'
    when acc.ada_not_required then 'NO'
    when acc.ada_sent_on is not null then 'SI'
    else 'PENDIENTE'
  end as ada_status,
  case
    when acc.ada_not_required then 'NO ENVIADO'
    when acc.ada_sent_on is not null then 'ENVIADO'
    when coalesce(etd.departure_date, acc.departure_override_on) is null then 'OK'
    when current_date - coalesce(etd.departure_date, acc.departure_override_on) >= 11 then 'URGENTE'
    when current_date - coalesce(etd.departure_date, acc.departure_override_on) between 6 and 10 then 'ATENCION'
    else 'OK'
  end as ada_priority,
  acc.fda_created_on,
  acc.fda_sent_on,
  case
    when acc.fda_not_required then 'NO'
    when acc.fda_sent_on is not null then 'SI'
    else ''
  end as fda_status,
  case
    when acc.fda_not_required then 'NO ENVIADO'
    when acc.fda_sent_on is not null then 'ENVIADO'
    when coalesce(etd.departure_date, acc.departure_override_on) is null then 'OK'
    when current_date - coalesce(etd.departure_date, acc.departure_override_on) >= 45 then 'URGENTE'
    when current_date - coalesce(etd.departure_date, acc.departure_override_on) between 30 and 44 then 'ATENCION'
    else 'OK'
  end as fda_priority,
  acc.comments,
  acc.berth,
  acc.days_count,
  coalesce(acc.operator_initials, p.username) as operator_initials,
  a.created_by,
  a.created_at as appointment_created_at,
  acc.created_at as accounting_created_at,
  acc.updated_at as accounting_updated_at
from public.appointments a
left join public.appointment_accounting acc on acc.appointment_id = a.id
left join etd on etd.appointment_id = a.id
left join public.profiles p on p.id = a.created_by;
