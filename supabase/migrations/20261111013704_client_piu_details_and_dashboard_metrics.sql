alter table public.services
  add column if not exists service_type text not null default 'other',
  add column if not exists loyalty_conclusion_date date,
  add column if not exists source_data jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.services'::regclass
      and conname = 'services_service_type_check'
  ) then
    alter table public.services
      add constraint services_service_type_check
      check (service_type in ('meo', 'mobile', 'gcp', 'other'));
  end if;
end;
$$;

create index if not exists services_client_type_idx
  on public.services (client_id, service_type)
  where is_active = true;

create index if not exists services_conclusion_client_idx
  on public.services (client_id)
  where loyalty_conclusion_date is not null;

create table if not exists public.client_import_details (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  source_system text not null default 'PIU',
  source_data jsonb not null default '[]'::jsonb,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_import_details_client_source_key unique (client_id, source_system)
);

create table if not exists public.client_administrators (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  source_key text not null,
  full_name text,
  phone_numbers jsonb not null default '[]'::jsonb,
  email text,
  marketing_permission text,
  observations text,
  source_data jsonb not null default '{}'::jsonb,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_administrators_client_source_key unique (client_id, source_key)
);

create index if not exists client_administrators_client_idx
  on public.client_administrators (client_id, full_name);

alter table public.client_import_details enable row level security;
alter table public.client_administrators enable row level security;

drop policy if exists client_import_details_select_access on public.client_import_details;
create policy client_import_details_select_access
  on public.client_import_details
  for select to authenticated
  using (private.owns_client(client_id));

drop policy if exists client_import_details_insert_access on public.client_import_details;
create policy client_import_details_insert_access
  on public.client_import_details
  for insert to authenticated
  with check (private.owns_client(client_id) and private.is_active_user());

drop policy if exists client_import_details_update_access on public.client_import_details;
create policy client_import_details_update_access
  on public.client_import_details
  for update to authenticated
  using (private.owns_client(client_id))
  with check (private.owns_client(client_id) and private.is_active_user());

drop policy if exists client_import_details_delete_admin on public.client_import_details;
create policy client_import_details_delete_admin
  on public.client_import_details
  for delete to authenticated
  using (private.is_admin());

drop policy if exists client_administrators_select_access on public.client_administrators;
create policy client_administrators_select_access
  on public.client_administrators
  for select to authenticated
  using (private.owns_client(client_id));

drop policy if exists client_administrators_insert_access on public.client_administrators;
create policy client_administrators_insert_access
  on public.client_administrators
  for insert to authenticated
  with check (private.owns_client(client_id) and private.is_active_user());

drop policy if exists client_administrators_update_access on public.client_administrators;
create policy client_administrators_update_access
  on public.client_administrators
  for update to authenticated
  using (private.owns_client(client_id))
  with check (private.owns_client(client_id) and private.is_active_user());

drop policy if exists client_administrators_delete_admin on public.client_administrators;
create policy client_administrators_delete_admin
  on public.client_administrators
  for delete to authenticated
  using (private.is_admin());

grant select, insert, update, delete on public.client_import_details to authenticated;
grant select, insert, update, delete on public.client_administrators to authenticated;

create or replace function public.get_my_dashboard_metrics()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with active_client_ids as (
    select c.id
    from public.clients c
    where exists (
      select 1
      from public.services s
      where s.client_id = c.id
        and s.loyalty_conclusion_date is not null
    )
    union
    select d.client_id
    from public.sales sa
    join public.deals d on d.id = sa.deal_id
    where sa.status = 'completed'
  )
  select jsonb_build_object(
    'client_count', (select count(*) from public.clients),
    'active_client_count', (select count(*) from active_client_ids),
    'open_deal_count', (
      select count(*) from public.deals
      where stage not in ('sale', 'lost')
    ),
    'sales_this_month', (
      select count(*) from public.sales
      where status = 'completed'
        and completed_at >= date_trunc('month', now())
    ),
    'meo_service_count', (
      select count(*) from public.services
      where is_active = true and service_type = 'meo'
    ),
    'mobile_service_count', (
      select count(*) from public.services
      where is_active = true and service_type = 'mobile'
    ),
    'gcp_service_count', (
      select count(*) from public.services
      where is_active = true and service_type = 'gcp'
    ),
    'due_deal_count', (
      select count(*) from public.deals
      where stage not in ('sale', 'lost')
        and eligibility_month is not null
        and eligibility_month <= current_date
    )
  );
$function$;

revoke all on function public.get_my_dashboard_metrics() from public, anon;
grant execute on function public.get_my_dashboard_metrics() to authenticated;
