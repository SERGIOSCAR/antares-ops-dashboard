alter table if exists public.appointment_accounting
  add column if not exists pda_due_days_override integer,
  add column if not exists ada_attention_days_override integer,
  add column if not exists ada_urgent_days_override integer,
  add column if not exists fda_attention_days_override integer,
  add column if not exists fda_urgent_days_override integer;

drop view if exists public.v_appointment_accounting_board;

create view public.v_appointment_accounting_board as
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
),
base as (
  select
    a.id as appointment_id,
    a.vessel_name,
    a.role,
    a.port,
    a.terminal,
    a.appointed_by as client_name,
    a.cargo_operation,
    a.other_agents,
    a.other_agents_role,
    a.shiftreporter_link,
    a.thanks_to,
    a.status as appointment_status,
    acc.accounting_reference,
    acc.nomination_received_on,
    coalesce(etd.departure_date, acc.departure_override_on) as departure_date,
    acc.roe,
    acc.pda_due_days_override,
    acc.pda_sent_on,
    acc.pda_not_required,
    acc.ada_attention_days_override,
    acc.ada_urgent_days_override,
    acc.ada_created_on,
    acc.ada_sent_on,
    acc.ada_not_required,
    acc.fda_attention_days_override,
    acc.fda_urgent_days_override,
    acc.fda_created_on,
    acc.fda_sent_on,
    acc.fda_not_required,
    acc.comments,
    acc.berth,
    acc.days_count,
    coalesce(acc.operator_initials, p.username) as operator_initials,
    a.created_by,
    a.created_at as appointment_created_at,
    acc.created_at as accounting_created_at,
    acc.updated_at as accounting_updated_at
  from public.appointments a
  left join public.appointment_accounting acc
    on acc.appointment_id = a.id
  left join etd
    on etd.appointment_id = a.id
  left join public.profiles p
    on p.id = a.created_by
)
select
  base.appointment_id,
  base.vessel_name,
  base.role,
  base.port,
  base.terminal,
  base.client_name,
  base.cargo_operation,
  base.other_agents,
  base.other_agents_role,
  base.shiftreporter_link,
  base.thanks_to,
  base.appointment_status,
  base.accounting_reference,
  base.nomination_received_on,
  base.departure_date,
  greatest(
    0,
    current_date - coalesce(base.nomination_received_on, base.appointment_created_at::date)
  )::integer as days_since_nomination,
  case
    when base.accounting_reference is null or btrim(base.accounting_reference) = '' then
      case
        when current_date - coalesce(base.nomination_received_on, base.appointment_created_at::date) >= 5 then 'OVERDUE'
        else 'PENDING'
      end
    else 'OK'
  end as accounting_reference_status,
  base.roe,
  base.pda_due_days_override,
  base.pda_sent_on,
  case
    when base.pda_not_required then 'NO'
    when base.pda_sent_on is not null then 'SI'
    else 'PENDIENTE'
  end as pda_status,
  base.ada_attention_days_override,
  base.ada_urgent_days_override,
  base.ada_created_on,
  base.ada_sent_on,
  case
    when base.ada_created_on is not null and base.ada_sent_on is not null then 'SI'
    when base.ada_created_on is not null and base.ada_sent_on is null then 'PENDIENTE'
    else 'NO'
  end as ada_status,
  case
    when base.ada_not_required then 'NO ENVIADO'
    when base.ada_sent_on is not null then 'ENVIADO'
    when base.departure_date is null then 'OK'
    when current_date - base.departure_date >= coalesce(base.ada_urgent_days_override, 11) then 'URGENTE'
    when current_date - base.departure_date >= coalesce(base.ada_attention_days_override, 6) then 'ATENCION'
    else 'OK'
  end as ada_priority,
  base.fda_attention_days_override,
  base.fda_urgent_days_override,
  base.fda_created_on,
  base.fda_sent_on,
  case
    when base.fda_not_required then 'NO'
    when base.fda_sent_on is not null then 'SI'
    else ''
  end as fda_status,
  case
    when base.fda_not_required then 'NO ENVIADO'
    when base.fda_sent_on is not null then 'ENVIADO'
    when base.departure_date is null then 'OK'
    when current_date - base.departure_date >= coalesce(base.fda_urgent_days_override, 45) then 'URGENTE'
    when current_date - base.departure_date >= coalesce(base.fda_attention_days_override, 30) then 'ATENCION'
    else 'OK'
  end as fda_priority,
  base.comments,
  base.berth,
  base.days_count,
  base.operator_initials,
  base.created_by,
  base.appointment_created_at,
  base.accounting_created_at,
  base.accounting_updated_at
from base;
