alter table public.vessels
  add column if not exists appointment_id uuid;

with candidate_links as (
  select
    v.id as vessel_id,
    a.id as appointment_id,
    row_number() over (
      partition by v.id
      order by a.created_at desc nulls last, a.id
    ) as vessel_rank,
    row_number() over (
      partition by a.id
      order by v.created_at desc nulls last, v.id
    ) as appointment_rank
  from public.appointments a
  join public.vessels v
    on v.short_id = split_part(split_part(split_part(a.shiftreporter_link, '/v/', 2), '?', 1), '#', 1)
  where a.shiftreporter_link like '%/v/%'
)
update public.vessels v
set appointment_id = c.appointment_id
from candidate_links c
where v.id = c.vessel_id
  and v.appointment_id is null
  and c.vessel_rank = 1
  and c.appointment_rank = 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vessels_appointment_id_fkey'
  ) then
    alter table public.vessels
      add constraint vessels_appointment_id_fkey
      foreign key (appointment_id) references public.appointments(id) on delete set null;
  end if;
end $$;

create unique index if not exists idx_vessels_appointment_id_unique
  on public.vessels(appointment_id)
  where appointment_id is not null;
