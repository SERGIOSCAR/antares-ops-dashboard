insert into public.timeline_event_types (code, label, display_order)
values ('ETHI', 'ETHI', 4)
on conflict (code) do update
set label = excluded.label,
    display_order = excluded.display_order;
