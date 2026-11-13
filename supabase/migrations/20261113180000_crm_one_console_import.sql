-- CRM ONE: temporary credentials and private upload reservations.
-- Apply AFTER 20261113170000_client_invoices_by_service.sql.
begin;

create table if not exists public.crm_one_import_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists crm_one_import_tokens_user_exp_idx
  on public.crm_one_import_tokens(created_by, expires_at desc);

create table if not exists public.crm_one_import_uploads (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references public.crm_one_import_tokens(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  service_id uuid not null,
  nif text not null,
  service_number text not null,
  ncc text not null,
  document_number text not null,
  issued_at date not null,
  expected_bytes integer not null check(expected_bytes between 100 and 15728640),
  expected_sha256 text not null check(expected_sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text not null unique,
  status text not null default 'pending' check(status in ('pending','completed')),
  invoice_id uuid references public.client_invoices(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint crm_one_import_uploads_client_service_fk
    foreign key(client_id, service_id) references public.services(client_id,id) on delete cascade,
  constraint crm_one_import_uploads_document_uniq unique(nif,service_number,document_number)
);
create index if not exists crm_one_import_uploads_token_idx
  on public.crm_one_import_uploads(token_id, created_at desc);

alter table public.crm_one_import_tokens enable row level security;
alter table public.crm_one_import_uploads enable row level security;
-- No browser direct access. The server verifies session + role on token creation
-- and short-lived bearer authorisation on each import call.
revoke all on public.crm_one_import_tokens from anon, authenticated;
revoke all on public.crm_one_import_uploads from anon, authenticated;
commit;
