-- Incremental extension of the pre-existing CRM baseline.
begin;

alter table public.clients
  add column if not exists ncc text,
  add column if not exists address text,
  add column if not exists import_batch_id uuid;
alter table public.services add column if not exists import_batch_id uuid;
alter table public.deals
  alter column commercial_id drop not null,
  add column if not exists renewal_key text;

create unique index if not exists deals_renewal_key_uidx
  on public.deals (renewal_key) where renewal_key is not null;

alter table public.deals
  drop constraint if exists deals_required_contact_and_loss_reason_ck;
alter table public.deals add constraint deals_required_contact_and_loss_reason_ck check (
  (stage not in ('scheduled','future_contact') or next_contact_at is not null)
  and (stage <> 'lost' or nullif(trim(coalesce(lost_reason,'')), '') is not null)
);

create table if not exists public.import_batches (
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
alter table public.clients add constraint clients_import_batch_fk
  foreign key (import_batch_id) references public.import_batches(id) on delete set null;
alter table public.services add constraint services_import_batch_fk
  foreign key (import_batch_id) references public.import_batches(id) on delete set null;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  client_id uuid references public.clients(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','done','cancelled')),
  assigned_to uuid references public.profiles(id) on delete set null default auth.uid(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_parent_required_ck check (client_id is not null or deal_id is not null),
  constraint tasks_title_not_blank_ck check (length(trim(title)) > 0)
);
create index if not exists tasks_assigned_due_idx on public.tasks (assigned_to,due_at) where status='pending';
create index if not exists tasks_client_id_idx on public.tasks (client_id);
create index if not exists tasks_deal_id_idx on public.tasks (deal_id);
create index if not exists tasks_created_by_idx on public.tasks (created_by);
create index if not exists clients_import_batch_idx on public.clients (import_batch_id);
create index if not exists services_import_batch_idx on public.services (import_batch_id);
create index if not exists import_batches_created_by_idx on public.import_batches (created_by);

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.is_active=true);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.is_active=true and p.role='admin');
$$;

create or replace function public.owns_client(p_client_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select public.is_admin() or (
    public.is_active_user() and exists(
      select 1 from public.clients c
      where c.id=p_client_id and c.commercial_id=(select auth.uid())
    )
  );
$$;

create or replace function public.can_access_deal(p_deal_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select public.is_admin() or (
    public.is_active_user() and exists(
      select 1 from public.deals d
      where d.id=p_deal_id and d.commercial_id=(select auth.uid())
    )
  );
$$;

drop policy if exists clients_select_owner_admin on public.clients;
create policy clients_select_owner_admin on public.clients for select to authenticated
using (public.is_admin() or (public.is_active_user() and commercial_id=(select auth.uid())));
drop policy if exists clients_update_owner_admin on public.clients;
create policy clients_update_owner_admin on public.clients for update to authenticated
using (public.is_admin() or (public.is_active_user() and commercial_id=(select auth.uid())))
with check (public.is_admin() or (public.is_active_user() and commercial_id=(select auth.uid())));

drop policy if exists deals_select_owner_admin on public.deals;
create policy deals_select_owner_admin on public.deals for select to authenticated
using (public.is_admin() or (public.is_active_user() and commercial_id=(select auth.uid())));
drop policy if exists deals_update_owner_admin on public.deals;
create policy deals_update_owner_admin on public.deals for update to authenticated
using (public.is_admin() or (public.is_active_user() and commercial_id=(select auth.uid())))
with check (public.is_admin() or (
  public.is_active_user() and commercial_id=(select auth.uid()) and public.owns_client(client_id)
));

drop policy if exists sales_select_owner_admin on public.sales;
create policy sales_select_owner_admin on public.sales for select to authenticated
using (public.is_admin() or (public.is_active_user() and commercial_id=(select auth.uid())));
drop policy if exists goals_select_owner_admin on public.monthly_goals;
create policy goals_select_owner_admin on public.monthly_goals for select to authenticated
using (public.is_admin() or (public.is_active_user() and commercial_id=(select auth.uid())));
drop policy if exists points_select_owner_admin on public.points_ledger;
create policy points_select_owner_admin on public.points_ledger for select to authenticated
using (public.is_admin() or (public.is_active_user() and commercial_id=(select auth.uid())));

drop policy if exists goals_write_admin on public.monthly_goals;
drop policy if exists goals_insert_admin on public.monthly_goals;
drop policy if exists goals_update_admin on public.monthly_goals;
drop policy if exists goals_delete_admin on public.monthly_goals;
create policy goals_insert_admin on public.monthly_goals for insert to authenticated
with check (public.is_admin());
create policy goals_update_admin on public.monthly_goals for update to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy goals_delete_admin on public.monthly_goals for delete to authenticated
using (public.is_admin());

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_full_name text;
begin
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'),''),
    nullif(trim(new.raw_user_meta_data->>'name'),''),
    nullif(split_part(coalesce(new.email,''),'@',1),''),
    'Utilizador'
  );
  insert into public.profiles (id,email,full_name,role,is_active)
  values (new.id,coalesce(new.email,''),v_full_name,'commercial',true)
  on conflict (id) do update set email=excluded.email;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.guard_client_owner_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if current_setting('crm.allow_internal_unassign',true)='on' then return new; end if;
  if not public.is_admin() then
    if old.commercial_id is distinct from new.commercial_id then
      raise exception 'Apenas um administrador pode transferir clientes entre comerciais.';
    end if;
    if old.nif is distinct from new.nif then
      raise exception 'O NIF não pode ser alterado por um comercial.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.unassign_records_for_inactive_profile()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if old.is_active=true and new.is_active=false then
    perform set_config('crm.allow_internal_unassign','on',true);
    update public.clients set commercial_id=null where commercial_id=new.id;
    update public.deals set commercial_id=null
      where commercial_id=new.id and stage not in ('sale','lost');
    perform set_config('crm.allow_internal_unassign','off',true);
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_unassign_on_deactivation on public.profiles;
create trigger profiles_unassign_on_deactivation after update of is_active on public.profiles
for each row execute function public.unassign_records_for_inactive_profile();

alter table public.deal_documents
  drop constraint if exists deal_documents_pdf_only_ck;
alter table public.deal_documents
  add constraint deal_documents_pdf_only_ck check (mime_type='application/pdf');

create or replace function public.validate_deal_document()
returns trigger language plpgsql set search_path=''
as $$
declare v_expected_path text;
begin
  if new.uploaded_by is distinct from (select auth.uid()) then
    raise exception 'O documento tem de ser carregado pelo utilizador autenticado.';
  end if;
  v_expected_path := concat(new.uploaded_by::text,'/',new.deal_id::text,'/',new.id::text,'.pdf');
  if new.storage_path<>v_expected_path then
    raise exception 'O caminho do PDF não corresponde ao utilizador e ao negócio.';
  end if;
  if new.mime_type<>'application/pdf' or right(lower(new.file_name),4)<>'.pdf' then
    raise exception 'Apenas documentos PDF são permitidos.';
  end if;
  return new;
end;
$$;
drop trigger if exists deal_documents_validate_path on public.deal_documents;
create trigger deal_documents_validate_path before insert on public.deal_documents
for each row execute function public.validate_deal_document();

drop policy if exists deal_documents_insert_access on public.deal_documents;
create policy deal_documents_insert_access on public.deal_documents for insert to authenticated
with check (uploaded_by=(select auth.uid()) and public.is_active_user() and public.can_access_deal(deal_id));
drop policy if exists deal_documents_delete_admin on public.deal_documents;
create policy deal_documents_delete_admin on public.deal_documents for delete to authenticated
using (public.is_admin());

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('crm-deal-documents','crm-deal-documents',false,15728640,array['application/pdf'])
on conflict (id) do update set public=false,file_size_limit=15728640,allowed_mime_types=array['application/pdf'];

drop policy if exists crm_deal_documents_read on storage.objects;
create policy crm_deal_documents_read on storage.objects for select to authenticated
using (bucket_id='crm-deal-documents' and exists (
  select 1 from public.deal_documents dd
  where dd.storage_path=storage.objects.name and public.can_access_deal(dd.deal_id)
));
drop policy if exists crm_deal_documents_insert on storage.objects;
create policy crm_deal_documents_insert on storage.objects for insert to authenticated
with check (
  bucket_id='crm-deal-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and public.is_active_user()
  and exists (
    select 1 from public.deals d
    where d.id=((storage.foldername(name))[2])::uuid
      and (d.commercial_id=(select auth.uid()) or public.is_admin())
  )
);
drop policy if exists crm_deal_documents_delete_admin on storage.objects;
create policy crm_deal_documents_delete_admin on storage.objects for delete to authenticated
using (bucket_id='crm-deal-documents' and public.is_admin());

alter table public.import_batches enable row level security;
alter table public.tasks enable row level security;
drop policy if exists import_batches_select_owner_admin on public.import_batches;
create policy import_batches_select_owner_admin on public.import_batches for select to authenticated
using (public.is_admin() or (public.is_active_user() and created_by=(select auth.uid())));
drop policy if exists import_batches_insert_owner on public.import_batches;
create policy import_batches_insert_owner on public.import_batches for insert to authenticated
with check (public.is_active_user() and created_by=(select auth.uid()));

drop policy if exists tasks_select_assigned_admin on public.tasks;
create policy tasks_select_assigned_admin on public.tasks for select to authenticated
using (public.is_admin() or (
  public.is_active_user() and assigned_to=(select auth.uid())
  and (client_id is null or public.owns_client(client_id))
  and (deal_id is null or public.can_access_deal(deal_id))
));
drop policy if exists tasks_insert_assigned_admin on public.tasks;
create policy tasks_insert_assigned_admin on public.tasks for insert to authenticated
with check (public.is_admin() or (
  public.is_active_user() and created_by=(select auth.uid()) and assigned_to=(select auth.uid())
  and (client_id is null or public.owns_client(client_id))
  and (deal_id is null or public.can_access_deal(deal_id))
));
drop policy if exists tasks_update_assigned_admin on public.tasks;
create policy tasks_update_assigned_admin on public.tasks for update to authenticated
using (public.is_admin() or (public.is_active_user() and assigned_to=(select auth.uid())))
with check (public.is_admin() or (
  public.is_active_user() and assigned_to=(select auth.uid())
  and (client_id is null or public.owns_client(client_id))
  and (deal_id is null or public.can_access_deal(deal_id))
));
drop policy if exists tasks_delete_admin on public.tasks;
create policy tasks_delete_admin on public.tasks for delete to authenticated
using (public.is_admin());

create or replace function public.generate_due_renewal_deals()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_inserted integer:=0;
begin
  insert into public.deals (client_id,commercial_id,deal_type,stage,eligibility_month,renewal_key,created_by)
  select distinct c.id,c.commercial_id,'portfolio_renewal','to_contact',
    (date_trunc('month',s.loyalty_end_date)::date-interval '6 months')::date,
    concat('renewal:',c.id::text,':',
      (date_trunc('month',s.loyalty_end_date)::date-interval '6 months')::date::text),
    null
  from public.clients c join public.services s on s.client_id=c.id
  where s.is_active=true and s.loyalty_end_date is not null
    and (date_trunc('month',s.loyalty_end_date)::date-interval '6 months')::date<=current_date
  on conflict (renewal_key) where renewal_key is not null do nothing;
  get diagnostics v_inserted=row_count;

  insert into public.deal_services (deal_id,service_id,current_monthly_fee)
  select d.id,s.id,s.current_monthly_fee
  from public.deals d join public.services s
    on s.client_id=d.client_id and s.is_active=true and s.loyalty_end_date is not null
    and (date_trunc('month',s.loyalty_end_date)::date-interval '6 months')::date=d.eligibility_month
  where d.deal_type='portfolio_renewal' and d.renewal_key is not null
  on conflict do nothing;
  return v_inserted;
end;
$$;
revoke all on function public.generate_due_renewal_deals() from public,anon,authenticated;
grant execute on function public.generate_due_renewal_deals() to service_role;

create index if not exists audit_log_actor_id_idx on public.audit_log(actor_id);
create index if not exists clients_created_by_idx on public.clients(created_by);
create index if not exists deal_documents_deal_id_idx on public.deal_documents(deal_id);
create index if not exists deal_documents_uploaded_by_idx on public.deal_documents(uploaded_by);
create index if not exists deal_services_service_id_idx on public.deal_services(service_id);
create index if not exists deals_created_by_idx on public.deals(created_by);
create index if not exists interactions_commercial_id_idx on public.interactions(commercial_id);
create index if not exists loyalty_history_recorded_by_idx on public.loyalty_history(recorded_by);
create index if not exists loyalty_history_sale_service_id_idx on public.loyalty_history(sale_service_id);
create index if not exists loyalty_history_service_id_idx on public.loyalty_history(service_id);
create index if not exists sale_services_service_id_idx on public.sale_services(service_id);
create index if not exists sales_commercial_id_idx on public.sales(commercial_id);

do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.unschedule(jobid) from cron.job where jobname='crm-generate-due-renewal-deals';
  perform cron.schedule('crm-generate-due-renewal-deals','5 6 * * *',
    'select public.generate_due_renewal_deals();');
exception when others then
  raise notice 'pg_cron unavailable; schedule public.generate_due_renewal_deals() in Supabase Cron.';
end;
$$;

commit;
