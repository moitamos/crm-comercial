-- CRM Comercial: PostgreSQL, Supabase Auth, RLS and private invoice storage.
-- Run once in the Supabase SQL Editor (or apply with Supabase CLI).

begin;

create type public.app_role as enum ('admin', 'commercial');
create type public.pipeline_stage as enum (
  'por_contactar',
  'em_negociacao',
  'agendado',
  'contactar_futuramente',
  'venda',
  'perdido'
);
create type public.service_package as enum ('M5', 'M4', 'M3', 'M2', 'M_MOVEL', 'GCP', 'OUTRO');
create type public.client_status as enum ('active', 'inactive');
create type public.activity_kind as enum ('note', 'call', 'email', 'whatsapp', 'meeting', 'system');
create type public.task_status as enum ('pending', 'done', 'cancelled');
create type public.invoice_status as enum ('uploaded', 'processed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'commercial',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolios_name_not_blank check (length(trim(name)) > 0)
);

create table public.portfolio_members (
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (portfolio_id, user_id)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  source text not null default 'excel',
  rows_read integer not null default 0 check (rows_read >= 0),
  rows_imported integer not null default 0 check (rows_imported >= 0),
  rows_rejected integer not null default 0 check (rows_rejected >= 0),
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  nif text not null,
  name text not null,
  email text,
  phone text,
  address text,
  notes text,
  status public.client_status not null default 'active',
  portfolio_id uuid not null references public.portfolios(id) on delete restrict,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_nif_format check (nif ~ '^[0-9]{9}$'),
  constraint clients_name_not_blank check (length(trim(name)) > 0),
  constraint clients_portfolio_member_fk
    foreign key (portfolio_id, assigned_to)
    references public.portfolio_members(portfolio_id, user_id)
    on update cascade
);

create unique index clients_nif_unique_idx on public.clients (nif);
create index clients_assigned_to_idx on public.clients (assigned_to);
create index clients_portfolio_id_idx on public.clients (portfolio_id);
create index clients_name_search_idx on public.clients using gin (to_tsvector('simple', name));

create table public.client_services (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  nic text,
  ncc text,
  service_number text,
  package public.service_package not null default 'OUTRO',
  service_label text,
  fidelity_end_date date,
  monthly_value numeric(12,2) check (monthly_value is null or monthly_value >= 0),
  is_active boolean not null default true,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  imported_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index client_services_client_id_idx on public.client_services (client_id);
create index client_services_fidelity_idx on public.client_services (fidelity_end_date) where is_active;
create index client_services_service_number_idx on public.client_services (service_number);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  title text not null,
  stage public.pipeline_stage not null default 'por_contactar',
  origin text not null default 'manual',
  description text,
  expected_value numeric(12,2) check (expected_value is null or expected_value >= 0),
  next_contact_date date,
  loss_reason text,
  renewal_control_date date,
  source_key text unique,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunities_title_not_blank check (length(trim(title)) > 0),
  constraint opportunities_contact_date_required
    check (stage not in ('agendado', 'contactar_futuramente') or next_contact_date is not null),
  constraint opportunities_loss_reason_required
    check (stage <> 'perdido' or nullif(trim(loss_reason), '') is not null)
);
create index opportunities_client_id_idx on public.opportunities (client_id);
create index opportunities_assigned_stage_idx on public.opportunities (assigned_to, stage);
create index opportunities_next_contact_idx on public.opportunities (next_contact_date) where next_contact_date is not null;

create table public.opportunity_services (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  client_service_id uuid not null references public.client_services(id) on delete restrict,
  is_renewed boolean not null default false,
  current_monthly_value numeric(12,2) check (current_monthly_value is null or current_monthly_value >= 0),
  new_monthly_value numeric(12,2) check (new_monthly_value is null or new_monthly_value >= 0),
  objective_points numeric(12,4) not null default 0 check (objective_points >= 0),
  created_at timestamptz not null default now(),
  unique (opportunity_id, client_service_id)
);
create index opportunity_services_service_id_idx on public.opportunity_services (client_service_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  kind public.activity_kind not null default 'note',
  body text not null,
  user_id uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  constraint activities_parent_required check (client_id is not null or opportunity_id is not null),
  constraint activities_body_not_blank check (length(trim(body)) > 0)
);
create index activities_client_created_idx on public.activities (client_id, created_at desc);
create index activities_opportunity_created_idx on public.activities (opportunity_id, created_at desc);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  client_id uuid references public.clients(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  due_at timestamptz not null,
  status public.task_status not null default 'pending',
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_title_not_blank check (length(trim(title)) > 0),
  constraint tasks_parent_required check (client_id is not null or opportunity_id is not null)
);
create index tasks_assigned_due_idx on public.tasks (assigned_to, due_at) where status = 'pending';

create table public.monthly_objectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  month_start date not null,
  target_points numeric(12,4) not null default 0 check (target_points >= 0),
  target_sales integer not null default 0 check (target_sales >= 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_objectives_first_day check (extract(day from month_start) = 1),
  unique (user_id, month_start)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  invoice_number text,
  issued_at date,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  total_value numeric(12,2) check (total_value is null or total_value >= 0),
  status public.invoice_status not null default 'uploaded',
  uploaded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index invoices_client_created_idx on public.invoices (client_id, created_at desc);

create or replace function public.validate_invoice_storage_path()
returns trigger
language plpgsql
set search_path = ''
as $
declare
  expected_path text;
begin
  if new.uploaded_by is distinct from (select auth.uid()) then
    raise exception 'A fatura tem de ser carregada pelo utilizador autenticado.';
  end if;

  expected_path :=
    new.uploaded_by::text || '/' ||
    new.client_id::text || '/' ||
    new.id::text || '.pdf';

  if new.storage_path <> expected_path then
    raise exception 'O caminho da fatura não corresponde ao utilizador, cliente e identificador do documento.';
  end if;

  if new.file_name !~* '\.pdf
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  client_service_id uuid references public.client_services(id) on delete set null,
  description text not null,
  package public.service_package,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_value numeric(12,2) not null default 0 check (unit_value >= 0),
  created_at timestamptz not null default now(),
  constraint invoice_items_description_not_blank check (length(trim(description)) > 0)
);
create index invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

create or replace function public.validate_invoice_item_client()
returns trigger
language plpgsql
set search_path = ''
as $
declare
  invoice_client uuid;
  service_client uuid;
begin
  if new.client_service_id is null then
    return new;
  end if;

  select client_id into invoice_client
  from public.invoices where id = new.invoice_id;
  select client_id into service_client
  from public.client_services where id = new.client_service_id;

  if invoice_client is null or service_client is null or invoice_client <> service_client then
    raise exception 'O serviço tem de pertencer ao mesmo cliente da fatura.';
  end if;
  return new;
end;
$;

create trigger invoice_items_validate_client
before insert or update on public.invoice_items
for each row execute procedure public.validate_invoice_item_client();

-- Security helpers. SECURITY DEFINER avoids recursive RLS evaluation while
-- exposing only narrow boolean checks to authenticated policies.
create or replace function public.is_active_user()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active = true
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true
  );
$$;

create or replace function public.can_access_client(p_client_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.clients c
    where c.id = p_client_id and c.assigned_to = (select auth.uid())
  );
$$;

create or replace function public.can_access_opportunity(p_opportunity_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.opportunities o
    where o.id = p_opportunity_id and o.assigned_to = (select auth.uid())
  );
$$;

create or replace function public.can_access_invoice(p_invoice_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.invoices i
    where i.id = p_invoice_id and public.can_access_client(i.client_id)
  );
$$;

revoke all on function public.is_active_user() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.can_access_client(uuid) from public;
revoke all on function public.can_access_opportunity(uuid) from public;
revoke all on function public.can_access_invoice(uuid) from public;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_access_client(uuid) to authenticated;
grant execute on function public.can_access_opportunity(uuid) to authenticated;
grant execute on function public.can_access_invoice(uuid) to authenticated;

-- Create a profile whenever an Auth user is created. Public sign-up must still
-- be disabled in Supabase Auth settings; accounts are created by the owner/admin.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, is_active)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, 'utilizador'), '@', 1)
    ),
    'commercial',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();
create trigger portfolios_set_updated_at before update on public.portfolios
for each row execute procedure public.set_updated_at();
create trigger clients_set_updated_at before update on public.clients
for each row execute procedure public.set_updated_at();
create trigger client_services_set_updated_at before update on public.client_services
for each row execute procedure public.set_updated_at();
create trigger opportunities_set_updated_at before update on public.opportunities
for each row execute procedure public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks
for each row execute procedure public.set_updated_at();
create trigger monthly_objectives_set_updated_at before update on public.monthly_objectives
for each row execute procedure public.set_updated_at();

-- Commercial users may edit client data, but never move a client between
-- portfolios or reassign its owner. Only an admin can do that.
create or replace function public.prevent_commercial_client_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('crm.internal_unassign', true) = 'on' then
    return new;
  end if;

  if not public.is_admin() and (
    new.portfolio_id is distinct from old.portfolio_id
    or new.assigned_to is distinct from old.assigned_to
  ) then
    raise exception 'Só um administrador pode alterar a carteira ou o comercial atribuído.';
  end if;
  return new;
end;
$$;
create trigger clients_protect_assignment
before update on public.clients
for each row execute procedure public.prevent_commercial_client_reassignment();

-- When a commercial user is deactivated, their clients and open opportunities
-- become unassigned. Nothing is automatically transferred to another user.
create or replace function public.unassign_records_for_inactive_profile()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.is_active = true and new.is_active = false then
    perform set_config('crm.internal_unassign', 'on', true);
    update public.clients set assigned_to = null where assigned_to = new.id;
    update public.opportunities
      set assigned_to = null
      where assigned_to = new.id and stage not in ('venda', 'perdido');
    perform set_config('crm.internal_unassign', 'off', true);
  end if;
  return new;
end;
$$;
create trigger profiles_unassign_on_deactivation
after update of is_active on public.profiles
for each row execute procedure public.unassign_records_for_inactive_profile();

-- Prevent linking a service to an opportunity belonging to another client.
create or replace function public.validate_opportunity_service_client()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  opportunity_client uuid;
  service_client uuid;
begin
  select client_id into opportunity_client
  from public.opportunities where id = new.opportunity_id;
  select client_id into service_client
  from public.client_services where id = new.client_service_id;
  if opportunity_client is null or service_client is null or opportunity_client <> service_client then
    raise exception 'O serviço tem de pertencer ao mesmo cliente da oportunidade.';
  end if;
  return new;
end;
$$;
create trigger opportunity_services_validate_client
before insert or update on public.opportunity_services
for each row execute procedure public.validate_opportunity_service_client();

-- Renewal control: create one opportunity per service and fidelity-end month,
-- on the first day of the month six months before the contract ends.
create or replace function public.generate_due_renewal_opportunities()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  insert into public.opportunities (
    client_id, title, stage, origin, renewal_control_date, source_key, assigned_to, created_by
  )
  select
    cs.client_id,
    'Renovação ' || cs.package::text ||
      case when nullif(trim(coalesce(cs.service_number, '')), '') is null
        then '' else ' · ' || cs.service_number end,
    'por_contactar',
    'automatic_renewal',
    (date_trunc('month', cs.fidelity_end_date)::date - interval '6 months')::date,
    'renewal:' || cs.id::text || ':' || to_char(cs.fidelity_end_date, 'YYYY-MM'),
    c.assigned_to,
    null
  from public.client_services cs
  join public.clients c on c.id = cs.client_id
  where cs.is_active = true
    and cs.fidelity_end_date is not null
    and (date_trunc('month', cs.fidelity_end_date)::date - interval '6 months')::date <= current_date
  on conflict (source_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function public.generate_due_renewal_opportunities() from public, anon, authenticated;
grant execute on function public.generate_due_renewal_opportunities() to service_role;

-- RLS is enabled on every application table.
alter table public.profiles enable row level security;
alter table public.portfolios enable row level security;
alter table public.portfolio_members enable row level security;
alter table public.import_batches enable row level security;
alter table public.clients enable row level security;
alter table public.client_services enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_services enable row level security;
alter table public.activities enable row level security;
alter table public.tasks enable row level security;
alter table public.monthly_objectives enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

create policy profiles_read_self_or_admin on public.profiles
for select to authenticated
using (id = (select auth.uid()) or public.is_admin());
create policy profiles_admin_insert on public.profiles
for insert to authenticated
with check (public.is_admin());
create policy profiles_admin_update on public.profiles
for update to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy profiles_admin_delete on public.profiles
for delete to authenticated
using (public.is_admin());

create policy portfolios_read_member_or_admin on public.portfolios
for select to authenticated
using (public.is_admin() or exists (
  select 1 from public.portfolio_members pm
  where pm.portfolio_id = id and pm.user_id = (select auth.uid())
));
create policy portfolios_admin_all on public.portfolios
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy portfolio_members_read_self_or_admin on public.portfolio_members
for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());
create policy portfolio_members_admin_all on public.portfolio_members
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy import_batches_read_own_or_admin on public.import_batches
for select to authenticated
using (public.is_admin() or created_by = (select auth.uid()));
create policy import_batches_insert_own_or_admin on public.import_batches
for insert to authenticated
with check (public.is_admin() or created_by = (select auth.uid()));

create policy clients_read_admin_or_assignee on public.clients
for select to authenticated
using (public.is_admin() or assigned_to = (select auth.uid()));
create policy clients_insert_admin_or_self on public.clients
for insert to authenticated
with check (
  public.is_admin()
  or (assigned_to = (select auth.uid()) and exists (
    select 1 from public.portfolio_members pm
    where pm.portfolio_id = clients.portfolio_id and pm.user_id = (select auth.uid())
  ))
);
create policy clients_update_admin_or_self on public.clients
for update to authenticated
using (public.is_admin() or assigned_to = (select auth.uid()))
with check (public.is_admin() or assigned_to = (select auth.uid()));
create policy clients_delete_admin_only on public.clients
for delete to authenticated
using (public.is_admin());

create policy client_services_access_via_client on public.client_services
for select to authenticated
using (public.can_access_client(client_id));
create policy client_services_insert_via_client on public.client_services
for insert to authenticated
with check (public.can_access_client(client_id));
create policy client_services_update_via_client on public.client_services
for update to authenticated
using (public.can_access_client(client_id))
with check (public.can_access_client(client_id));
create policy client_services_delete_admin_only on public.client_services
for delete to authenticated
using (public.is_admin());

create policy opportunities_read_admin_or_assignee on public.opportunities
for select to authenticated
using (public.is_admin() or assigned_to = (select auth.uid()));
create policy opportunities_insert_admin_or_self on public.opportunities
for insert to authenticated
with check (
  public.is_admin()
  or (assigned_to = (select auth.uid()) and public.can_access_client(client_id))
);
create policy opportunities_update_admin_or_self on public.opportunities
for update to authenticated
using (public.is_admin() or assigned_to = (select auth.uid()))
with check (public.is_admin() or (assigned_to = (select auth.uid()) and public.can_access_client(client_id)));
create policy opportunities_delete_admin_only on public.opportunities
for delete to authenticated
using (public.is_admin());

create policy opportunity_services_access_parent on public.opportunity_services
for select to authenticated
using (public.can_access_opportunity(opportunity_id));
create policy opportunity_services_insert_parent on public.opportunity_services
for insert to authenticated
with check (public.can_access_opportunity(opportunity_id));
create policy opportunity_services_update_parent on public.opportunity_services
for update to authenticated
using (public.can_access_opportunity(opportunity_id))
with check (public.can_access_opportunity(opportunity_id));
create policy opportunity_services_delete_admin_only on public.opportunity_services
for delete to authenticated
using (public.is_admin());

create policy activities_read_related on public.activities
for select to authenticated
using (
  public.is_admin()
  or (
    user_id = (select auth.uid())
    and (client_id is null or public.can_access_client(client_id))
    and (opportunity_id is null or public.can_access_opportunity(opportunity_id))
  )
);
create policy activities_insert_own on public.activities
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (client_id is null or public.can_access_client(client_id))
  and (opportunity_id is null or public.can_access_opportunity(opportunity_id))
);

create policy tasks_read_assigned_or_admin on public.tasks
for select to authenticated
using (
  public.is_admin()
  or (
    assigned_to = (select auth.uid())
    and (client_id is null or public.can_access_client(client_id))
    and (opportunity_id is null or public.can_access_opportunity(opportunity_id))
  )
);
create policy tasks_insert_assigned_or_admin on public.tasks
for insert to authenticated
with check (
  public.is_admin()
  or (
    created_by = (select auth.uid())
    and assigned_to = (select auth.uid())
    and (client_id is null or public.can_access_client(client_id))
    and (opportunity_id is null or public.can_access_opportunity(opportunity_id))
  )
);
create policy tasks_update_assigned_or_admin on public.tasks
for update to authenticated
using (public.is_admin() or assigned_to = (select auth.uid()))
with check (
  public.is_admin()
  or (
    assigned_to = (select auth.uid())
    and (client_id is null or public.can_access_client(client_id))
    and (opportunity_id is null or public.can_access_opportunity(opportunity_id))
  )
);
create policy tasks_delete_admin_only on public.tasks
for delete to authenticated
using (public.is_admin());

create policy monthly_objectives_read_own_or_admin on public.monthly_objectives
for select to authenticated
using (public.is_admin() or user_id = (select auth.uid()));
create policy monthly_objectives_admin_all on public.monthly_objectives
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy invoices_read_via_client on public.invoices
for select to authenticated
using (public.can_access_client(client_id));
create policy invoices_insert_via_client on public.invoices
for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and public.can_access_client(client_id)
);
create policy invoices_update_admin_only on public.invoices
for update to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy invoices_delete_admin_only on public.invoices
for delete to authenticated
using (public.is_admin());

create policy invoice_items_read_via_invoice on public.invoice_items
for select to authenticated
using (public.can_access_invoice(invoice_id));
create policy invoice_items_insert_via_invoice on public.invoice_items
for insert to authenticated
with check (public.can_access_invoice(invoice_id));
create policy invoice_items_update_via_invoice on public.invoice_items
for update to authenticated
using (public.can_access_invoice(invoice_id))
with check (public.can_access_invoice(invoice_id));
create policy invoice_items_delete_admin_only on public.invoice_items
for delete to authenticated
using (public.is_admin());

-- Authenticated users can reach tables, but RLS remains the actual gate.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- Private bucket for PDF invoices. Files are stored under:
-- <auth-user-id>/<client-id>/<invoice-id>.pdf
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crm-invoices', 'crm-invoices', false, 15728640, array['application/pdf'])
on conflict (id) do update
set public = false, file_size_limit = 15728640, allowed_mime_types = array['application/pdf'];

create policy crm_invoice_files_read on storage.objects
for select to authenticated
using (
  bucket_id = 'crm-invoices'
  and exists (
    select 1 from public.invoices i
    where i.storage_path = name and public.can_access_client(i.client_id)
  )
);
create policy crm_invoice_files_insert_own_folder on storage.objects
for insert to authenticated
with check (
  bucket_id = 'crm-invoices'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy crm_invoice_files_update_own_folder on storage.objects
for update to authenticated
using (
  bucket_id = 'crm-invoices'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
)
with check (
  bucket_id = 'crm-invoices'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
);
create policy crm_invoice_files_delete_admin_only on storage.objects
for delete to authenticated
using (bucket_id = 'crm-invoices' and public.is_admin());

-- pg_cron is optional. If unavailable, the database is still usable; run
-- public.generate_due_renewal_opportunities() from a scheduled Supabase job later.
do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.unschedule(jobid) from cron.job where jobname = 'crm-generate-renewal-opportunities';
  perform cron.schedule(
    'crm-generate-renewal-opportunities',
    '5 6 * * *',
    'select public.generate_due_renewal_opportunities();'
  );
exception
  when undefined_file or insufficient_privilege or undefined_table
    or undefined_function or invalid_schema_name or feature_not_supported then
    raise notice 'pg_cron unavailable; renewal generation function is ready but not scheduled.';
end;
$$;

commit;
 then
    raise exception 'Apenas ficheiros PDF são permitidos.';
  end if;

  return new;
end;
$;

create trigger invoices_validate_storage_path
before insert on public.invoices
for each row execute procedure public.validate_invoice_storage_path();

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  client_service_id uuid references public.client_services(id) on delete set null,
  description text not null,
  package public.service_package,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_value numeric(12,2) not null default 0 check (unit_value >= 0),
  created_at timestamptz not null default now(),
  constraint invoice_items_description_not_blank check (length(trim(description)) > 0)
);
create index invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

create or replace function public.validate_invoice_item_client()
returns trigger
language plpgsql
set search_path = ''
as $
declare
  invoice_client uuid;
  service_client uuid;
begin
  if new.client_service_id is null then
    return new;
  end if;

  select client_id into invoice_client
  from public.invoices where id = new.invoice_id;
  select client_id into service_client
  from public.client_services where id = new.client_service_id;

  if invoice_client is null or service_client is null or invoice_client <> service_client then
    raise exception 'O serviço tem de pertencer ao mesmo cliente da fatura.';
  end if;
  return new;
end;
$;

create trigger invoice_items_validate_client
before insert or update on public.invoice_items
for each row execute procedure public.validate_invoice_item_client();

-- Security helpers. SECURITY DEFINER avoids recursive RLS evaluation while
-- exposing only narrow boolean checks to authenticated policies.
create or replace function public.is_active_user()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active = true
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true
  );
$$;

create or replace function public.can_access_client(p_client_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.clients c
    where c.id = p_client_id and c.assigned_to = (select auth.uid())
  );
$$;

create or replace function public.can_access_opportunity(p_opportunity_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.opportunities o
    where o.id = p_opportunity_id and o.assigned_to = (select auth.uid())
  );
$$;

create or replace function public.can_access_invoice(p_invoice_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.invoices i
    where i.id = p_invoice_id and public.can_access_client(i.client_id)
  );
$$;

revoke all on function public.is_active_user() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.can_access_client(uuid) from public;
revoke all on function public.can_access_opportunity(uuid) from public;
revoke all on function public.can_access_invoice(uuid) from public;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_access_client(uuid) to authenticated;
grant execute on function public.can_access_opportunity(uuid) to authenticated;
grant execute on function public.can_access_invoice(uuid) to authenticated;

-- Create a profile whenever an Auth user is created. Public sign-up must still
-- be disabled in Supabase Auth settings; accounts are created by the owner/admin.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, is_active)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, 'utilizador'), '@', 1)
    ),
    'commercial',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();
create trigger portfolios_set_updated_at before update on public.portfolios
for each row execute procedure public.set_updated_at();
create trigger clients_set_updated_at before update on public.clients
for each row execute procedure public.set_updated_at();
create trigger client_services_set_updated_at before update on public.client_services
for each row execute procedure public.set_updated_at();
create trigger opportunities_set_updated_at before update on public.opportunities
for each row execute procedure public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks
for each row execute procedure public.set_updated_at();
create trigger monthly_objectives_set_updated_at before update on public.monthly_objectives
for each row execute procedure public.set_updated_at();

-- Commercial users may edit client data, but never move a client between
-- portfolios or reassign its owner. Only an admin can do that.
create or replace function public.prevent_commercial_client_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('crm.internal_unassign', true) = 'on' then
    return new;
  end if;

  if not public.is_admin() and (
    new.portfolio_id is distinct from old.portfolio_id
    or new.assigned_to is distinct from old.assigned_to
  ) then
    raise exception 'Só um administrador pode alterar a carteira ou o comercial atribuído.';
  end if;
  return new;
end;
$$;
create trigger clients_protect_assignment
before update on public.clients
for each row execute procedure public.prevent_commercial_client_reassignment();

-- When a commercial user is deactivated, their clients and open opportunities
-- become unassigned. Nothing is automatically transferred to another user.
create or replace function public.unassign_records_for_inactive_profile()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.is_active = true and new.is_active = false then
    perform set_config('crm.internal_unassign', 'on', true);
    update public.clients set assigned_to = null where assigned_to = new.id;
    update public.opportunities
      set assigned_to = null
      where assigned_to = new.id and stage not in ('venda', 'perdido');
    perform set_config('crm.internal_unassign', 'off', true);
  end if;
  return new;
end;
$$;
create trigger profiles_unassign_on_deactivation
after update of is_active on public.profiles
for each row execute procedure public.unassign_records_for_inactive_profile();

-- Prevent linking a service to an opportunity belonging to another client.
create or replace function public.validate_opportunity_service_client()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  opportunity_client uuid;
  service_client uuid;
begin
  select client_id into opportunity_client
  from public.opportunities where id = new.opportunity_id;
  select client_id into service_client
  from public.client_services where id = new.client_service_id;
  if opportunity_client is null or service_client is null or opportunity_client <> service_client then
    raise exception 'O serviço tem de pertencer ao mesmo cliente da oportunidade.';
  end if;
  return new;
end;
$$;
create trigger opportunity_services_validate_client
before insert or update on public.opportunity_services
for each row execute procedure public.validate_opportunity_service_client();

-- Renewal control: create one opportunity per service and fidelity-end month,
-- on the first day of the month six months before the contract ends.
create or replace function public.generate_due_renewal_opportunities()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  insert into public.opportunities (
    client_id, title, stage, origin, renewal_control_date, source_key, assigned_to, created_by
  )
  select
    cs.client_id,
    'Renovação ' || cs.package::text ||
      case when nullif(trim(coalesce(cs.service_number, '')), '') is null
        then '' else ' · ' || cs.service_number end,
    'por_contactar',
    'automatic_renewal',
    (date_trunc('month', cs.fidelity_end_date)::date - interval '6 months')::date,
    'renewal:' || cs.id::text || ':' || to_char(cs.fidelity_end_date, 'YYYY-MM'),
    c.assigned_to,
    null
  from public.client_services cs
  join public.clients c on c.id = cs.client_id
  where cs.is_active = true
    and cs.fidelity_end_date is not null
    and (date_trunc('month', cs.fidelity_end_date)::date - interval '6 months')::date <= current_date
  on conflict (source_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function public.generate_due_renewal_opportunities() from public, anon, authenticated;
grant execute on function public.generate_due_renewal_opportunities() to service_role;

-- RLS is enabled on every application table.
alter table public.profiles enable row level security;
alter table public.portfolios enable row level security;
alter table public.portfolio_members enable row level security;
alter table public.import_batches enable row level security;
alter table public.clients enable row level security;
alter table public.client_services enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_services enable row level security;
alter table public.activities enable row level security;
alter table public.tasks enable row level security;
alter table public.monthly_objectives enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

create policy profiles_read_self_or_admin on public.profiles
for select to authenticated
using (id = (select auth.uid()) or public.is_admin());
create policy profiles_admin_insert on public.profiles
for insert to authenticated
with check (public.is_admin());
create policy profiles_admin_update on public.profiles
for update to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy profiles_admin_delete on public.profiles
for delete to authenticated
using (public.is_admin());

create policy portfolios_read_member_or_admin on public.portfolios
for select to authenticated
using (public.is_admin() or exists (
  select 1 from public.portfolio_members pm
  where pm.portfolio_id = id and pm.user_id = (select auth.uid())
));
create policy portfolios_admin_all on public.portfolios
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy portfolio_members_read_self_or_admin on public.portfolio_members
for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());
create policy portfolio_members_admin_all on public.portfolio_members
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy import_batches_read_own_or_admin on public.import_batches
for select to authenticated
using (public.is_admin() or created_by = (select auth.uid()));
create policy import_batches_insert_own_or_admin on public.import_batches
for insert to authenticated
with check (public.is_admin() or created_by = (select auth.uid()));

create policy clients_read_admin_or_assignee on public.clients
for select to authenticated
using (public.is_admin() or assigned_to = (select auth.uid()));
create policy clients_insert_admin_or_self on public.clients
for insert to authenticated
with check (
  public.is_admin()
  or (assigned_to = (select auth.uid()) and exists (
    select 1 from public.portfolio_members pm
    where pm.portfolio_id = clients.portfolio_id and pm.user_id = (select auth.uid())
  ))
);
create policy clients_update_admin_or_self on public.clients
for update to authenticated
using (public.is_admin() or assigned_to = (select auth.uid()))
with check (public.is_admin() or assigned_to = (select auth.uid()));
create policy clients_delete_admin_only on public.clients
for delete to authenticated
using (public.is_admin());

create policy client_services_access_via_client on public.client_services
for select to authenticated
using (public.can_access_client(client_id));
create policy client_services_insert_via_client on public.client_services
for insert to authenticated
with check (public.can_access_client(client_id));
create policy client_services_update_via_client on public.client_services
for update to authenticated
using (public.can_access_client(client_id))
with check (public.can_access_client(client_id));
create policy client_services_delete_admin_only on public.client_services
for delete to authenticated
using (public.is_admin());

create policy opportunities_read_admin_or_assignee on public.opportunities
for select to authenticated
using (public.is_admin() or assigned_to = (select auth.uid()));
create policy opportunities_insert_admin_or_self on public.opportunities
for insert to authenticated
with check (
  public.is_admin()
  or (assigned_to = (select auth.uid()) and public.can_access_client(client_id))
);
create policy opportunities_update_admin_or_self on public.opportunities
for update to authenticated
using (public.is_admin() or assigned_to = (select auth.uid()))
with check (public.is_admin() or (assigned_to = (select auth.uid()) and public.can_access_client(client_id)));
create policy opportunities_delete_admin_only on public.opportunities
for delete to authenticated
using (public.is_admin());

create policy opportunity_services_access_parent on public.opportunity_services
for select to authenticated
using (public.can_access_opportunity(opportunity_id));
create policy opportunity_services_insert_parent on public.opportunity_services
for insert to authenticated
with check (public.can_access_opportunity(opportunity_id));
create policy opportunity_services_update_parent on public.opportunity_services
for update to authenticated
using (public.can_access_opportunity(opportunity_id))
with check (public.can_access_opportunity(opportunity_id));
create policy opportunity_services_delete_admin_only on public.opportunity_services
for delete to authenticated
using (public.is_admin());

create policy activities_read_related on public.activities
for select to authenticated
using (
  public.is_admin()
  or (
    user_id = (select auth.uid())
    and (client_id is null or public.can_access_client(client_id))
    and (opportunity_id is null or public.can_access_opportunity(opportunity_id))
  )
);
create policy activities_insert_own on public.activities
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (client_id is null or public.can_access_client(client_id))
  and (opportunity_id is null or public.can_access_opportunity(opportunity_id))
);

create policy tasks_read_assigned_or_admin on public.tasks
for select to authenticated
using (
  public.is_admin()
  or (
    assigned_to = (select auth.uid())
    and (client_id is null or public.can_access_client(client_id))
    and (opportunity_id is null or public.can_access_opportunity(opportunity_id))
  )
);
create policy tasks_insert_assigned_or_admin on public.tasks
for insert to authenticated
with check (
  public.is_admin()
  or (
    created_by = (select auth.uid())
    and assigned_to = (select auth.uid())
    and (client_id is null or public.can_access_client(client_id))
    and (opportunity_id is null or public.can_access_opportunity(opportunity_id))
  )
);
create policy tasks_update_assigned_or_admin on public.tasks
for update to authenticated
using (public.is_admin() or assigned_to = (select auth.uid()))
with check (
  public.is_admin()
  or (
    assigned_to = (select auth.uid())
    and (client_id is null or public.can_access_client(client_id))
    and (opportunity_id is null or public.can_access_opportunity(opportunity_id))
  )
);
create policy tasks_delete_admin_only on public.tasks
for delete to authenticated
using (public.is_admin());

create policy monthly_objectives_read_own_or_admin on public.monthly_objectives
for select to authenticated
using (public.is_admin() or user_id = (select auth.uid()));
create policy monthly_objectives_admin_all on public.monthly_objectives
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy invoices_read_via_client on public.invoices
for select to authenticated
using (public.can_access_client(client_id));
create policy invoices_insert_via_client on public.invoices
for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and public.can_access_client(client_id)
);
create policy invoices_update_admin_only on public.invoices
for update to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy invoices_delete_admin_only on public.invoices
for delete to authenticated
using (public.is_admin());

create policy invoice_items_read_via_invoice on public.invoice_items
for select to authenticated
using (public.can_access_invoice(invoice_id));
create policy invoice_items_insert_via_invoice on public.invoice_items
for insert to authenticated
with check (public.can_access_invoice(invoice_id));
create policy invoice_items_update_via_invoice on public.invoice_items
for update to authenticated
using (public.can_access_invoice(invoice_id))
with check (public.can_access_invoice(invoice_id));
create policy invoice_items_delete_admin_only on public.invoice_items
for delete to authenticated
using (public.is_admin());

-- Authenticated users can reach tables, but RLS remains the actual gate.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- Private bucket for PDF invoices. Files are stored under:
-- <auth-user-id>/<client-id>/<invoice-id>.pdf
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crm-invoices', 'crm-invoices', false, 15728640, array['application/pdf'])
on conflict (id) do update
set public = false, file_size_limit = 15728640, allowed_mime_types = array['application/pdf'];

create policy crm_invoice_files_read on storage.objects
for select to authenticated
using (
  bucket_id = 'crm-invoices'
  and exists (
    select 1 from public.invoices i
    where i.storage_path = name and public.can_access_client(i.client_id)
  )
);
create policy crm_invoice_files_insert_own_folder on storage.objects
for insert to authenticated
with check (
  bucket_id = 'crm-invoices'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy crm_invoice_files_update_own_folder on storage.objects
for update to authenticated
using (
  bucket_id = 'crm-invoices'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
)
with check (
  bucket_id = 'crm-invoices'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
);
create policy crm_invoice_files_delete_admin_only on storage.objects
for delete to authenticated
using (bucket_id = 'crm-invoices' and public.is_admin());

-- pg_cron is optional. If unavailable, the database is still usable; run
-- public.generate_due_renewal_opportunities() from a scheduled Supabase job later.
do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.unschedule(jobid) from cron.job where jobname = 'crm-generate-renewal-opportunities';
  perform cron.schedule(
    'crm-generate-renewal-opportunities',
    '5 6 * * *',
    'select public.generate_due_renewal_opportunities();'
  );
exception
  when undefined_file or insufficient_privilege or undefined_table then
    raise notice 'pg_cron unavailable; renewal generation function is ready but not scheduled.';
end;
$$;

commit;
