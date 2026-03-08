-- Normalize appointment status values to the new naming model.
update public.appointments
set status = case status
  when 'PROSPECT' then 'EN ROUTE'
  when 'EN_ROUTE' then 'EN ROUTE'
  when 'OUTER_ROADS' then 'ANCHORED OUTER ROADS'
  when 'IN_PORT' then 'IN PORT'
  when 'SAILING' then 'SAILED'
  else status
end
where status in ('PROSPECT', 'EN_ROUTE', 'OUTER_ROADS', 'IN_PORT', 'SAILING');
