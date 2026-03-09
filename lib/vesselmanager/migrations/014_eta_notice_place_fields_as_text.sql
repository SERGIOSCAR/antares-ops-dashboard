alter table if exists public.appointment_eta_notice_settings
  alter column first_service_starts_at type text using coalesce(first_service_starts_at::text, ''),
  alter column last_service_ends_at type text using coalesce(last_service_ends_at::text, '');

