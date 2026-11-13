begin;
-- Each invoice belongs to one existing client and service.
create unique index if not exists services_client_id_id_invoice_uq
  on public.services (client_id, id);

create table if not exists public.client_invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  service_id uuid not null,
  nif text not null check (nif ~ '^[0-9]{9}$'),
  service_number text not null check (length(btrim(service_number)) > 0),
  ncc text,
  document_number text not null check (length(btrim(document_number)) > 0),
  issued_at date not null,
  storage_path text not null unique,
  file_size_bytes integer not null check (file_size_bytes between 100 and 15728640),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  source text not null default 'crm_one',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint client_invoices_service_owner_fk
    foreign key (client_id, service_id)
    references public.services (client_id, id) on delete cascade,
  constraint client_invoices_external_document_uq
    unique (nif, service_number, document_number)
);
create index if not exists client_invoices_client_service_date_idx
  on public.client_invoices (client_id, service_id, issued_at desc);

create or replace function private.validate_client_invoice()
returns trigger language plpgsql set search_path = ''
as $function$
declare v_nif text; v_service_number text;
begin
  select regexp_replace(c.nif, '[^0-9]', '', 'g'), s.service_number
    into v_nif, v_service_number
    from public.clients c
    join public.services s on s.client_id = c.id
   where c.id = new.client_id and s.id = new.service_id;
  if not found or v_nif is distinct from new.nif
    or v_service_number is distinct from new.service_number then
    raise exception 'NIF ou número de serviço não corresponde ao cliente.';
  end if;
  if new.storage_path is distinct from
    concat(new.client_id::text, '/', new.service_id::text, '/', new.id::text, '.pdf') then
    raise exception 'Caminho de fatura inválido.';
  end if;
  return new;
end;
$function$;
drop trigger if exists client_invoice_identifiers_check on public.client_invoices;
create trigger client_invoice_identifiers_check
before insert or update on public.client_invoices
for each row execute function private.validate_client_invoice();

alter table public.client_invoices enable row level security;
drop policy if exists client_invoices_read_owner on public.client_invoices;
create policy client_invoices_read_owner on public.client_invoices
  for select to authenticated using (private.owns_client(client_id));
revoke all on public.client_invoices from anon;
revoke insert, update, delete on public.client_invoices from authenticated;
grant select on public.client_invoices to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crm-invoices', 'crm-invoices', false, 15728640, array['application/pdf'])
on conflict (id) do update
set public = false, file_size_limit = 15728640, allowed_mime_types = array['application/pdf'];
drop policy if exists crm_invoices_select_for_client_owner on storage.objects;
create policy crm_invoices_select_for_client_owner on storage.objects
for select to authenticated using (
  bucket_id = 'crm-invoices'
  and exists (
    select 1 from public.client_invoices ci
    where ci.storage_path = storage.objects.name
      and private.owns_client(ci.client_id)
  )
);
commit;
