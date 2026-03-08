insert into public.timeline_event_types (code, label, display_order)
values ('ET_COSP', 'ET-COSP', 8)
on conflict (code) do update
set label = excluded.label,
    display_order = excluded.display_order;
