begin;

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolios_name_not_blank_ck check (length(trim(name))>0)
);
create table if not exists public.portfolio_members (
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (portfolio_id,user_id)
);
insert into public.portfolios (name,description)
select 'Carteira Principal','Carteira inicial do CRM Comercial.'
where not exists(select 1 from public.portfolios);

alter table public.clients add column if not exists portfolio_id uuid;
do $$
declare v_portfolio uuid;
begin
  select id into v_portfolio from public.portfolios order by created_at limit 1;
  update public.clients set portfolio_id=v_portfolio where portfolio_id is null;
end;
$$;
alter table public.clients alter column portfolio_id set not null;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='clients_portfolio_id_fkey'
    and conrelid='public.clients'::regclass) then
    alter table public.clients add constraint clients_portfolio_id_fkey
      foreign key (portfolio_id) references public.portfolios(id) on delete restrict;
  end if;
  if not exists(select 1 from pg_constraint where conname='clients_portfolio_member_fkey'
    and conrelid='public.clients'::regclass) then
    alter table public.clients add constraint clients_portfolio_member_fkey
      foreign key (portfolio_id,commercial_id)
      references public.portfolio_members(portfolio_id,user_id) on update cascade;
  end if;
end;
$$;

create index if not exists clients_portfolio_id_idx on public.clients(portfolio_id);
create index if not exists portfolio_members_user_id_idx on public.portfolio_members(user_id);
create unique index if not exists deal_services_deal_service_uidx
  on public.deal_services(deal_id,service_id);

create or replace function public.guard_client_owner_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if current_setting('crm.allow_internal_unassign',true)='on' then return new; end if;
  if not public.is_admin() then
    if old.commercial_id is distinct from new.commercial_id then
      raise exception 'Apenas um administrador pode transferir clientes entre comerciais.';
    end if;
    if old.portfolio_id is distinct from new.portfolio_id then
      raise exception 'Apenas um administrador pode alterar a carteira do cliente.';
    end if;
    if old.nif is distinct from new.nif then
      raise exception 'O NIF não pode ser alterado por um comercial.';
    end if;
  end if;
  return new;
end;
$$;

alter table public.portfolios enable row level security;
alter table public.portfolio_members enable row level security;
drop policy if exists portfolios_select_member_admin on public.portfolios;
create policy portfolios_select_member_admin on public.portfolios for select to authenticated
using (public.is_admin() or exists(
  select 1 from public.portfolio_members pm
  where pm.portfolio_id=id and pm.user_id=(select auth.uid())
));
drop policy if exists portfolios_admin_all on public.portfolios;
create policy portfolios_admin_all on public.portfolios for all to authenticated
using (public.is_admin()) with check (public.is_admin());
drop policy if exists portfolio_members_select_self_admin on public.portfolio_members;
create policy portfolio_members_select_self_admin on public.portfolio_members for select to authenticated
using (user_id=(select auth.uid()) or public.is_admin());
drop policy if exists portfolio_members_admin_all on public.portfolio_members;
create policy portfolio_members_admin_all on public.portfolio_members for all to authenticated
using (public.is_admin()) with check (public.is_admin());

commit;
