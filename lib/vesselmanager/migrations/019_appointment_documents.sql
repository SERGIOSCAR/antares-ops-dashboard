create table if not exists public.appointment_documents (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  storage_bucket text not null default 'appointment-documents',
  storage_path text not null unique,
  mime_type text,
  file_size bigint,
  uploaded_by uuid,
  created_at timestamp with time zone not null default now(),
  constraint appointment_documents_type_check
    check (document_type in ('SOF', 'ITC', 'SHIP_PART', 'OTHER_DOX'))
);

create index if not exists idx_appointment_documents_appointment_id
  on public.appointment_documents(appointment_id);

create index if not exists idx_appointment_documents_type
  on public.appointment_documents(document_type);

insert into storage.buckets (id, name, public)
select 'appointment-documents', 'appointment-documents', false
where not exists (
  select 1 from storage.buckets where id = 'appointment-documents'
);
