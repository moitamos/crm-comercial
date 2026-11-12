begin;

-- Stop the daily job: renewal opportunities are now created only when a user asks for a month.
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'crm-generate-due-renewal-deals'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

-- Remove service links whose current six-month renewal month no longer matches
-- the month on the automatically generated opportunity.
delete from public.deal_services ds
using public.deals d, public.services s
where ds.deal_id = d.id
  and ds.service_id = s.id
  and d.deal_type = 'portfolio_renewal'
  and d.renewal_key is not null
  and date_trunc('month', (s.loyalty_end_date - interval '6 months')::date)::date
      is distinct from d.eligibility_month;

-- Remove only auto-generated renewal opportunities left with no currently eligible services.
delete from public.deals d
where d.deal_type = 'portfolio_renewal'
  and d.renewal_key is not null
  and not exists (
    select 1 from public.deal_services ds where ds.deal_id = d.id
  );

-- Legacy refresh paths remain callable for compatibility, but no longer create deals.
create or replace function private.generate_user_due_renewal_deals()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or not private.is_active_user() then
    raise exception 'Utilizador não autenticado ou inativo';
  end if;
  return 0;
end;
$function$;

revoke all on function private.generate_user_due_renewal_deals() from public, anon, service_role;
grant execute on function private.generate_user_due_renewal_deals() to authenticated;

create or replace function public.generate_due_renewal_deals()
returns integer
language sql
security definer
set search_path = ''
as $function$
  select 0;
$function$;

revoke all on function public.generate_due_renewal_deals() from public, anon, authenticated;
grant execute on function public.generate_due_renewal_deals() to service_role;

-- Create renewal opportunities only for the selected month.
-- A client's several services entering renewal in the same month share one deal.
create or replace function private.create_renewal_deals_for_month(p_month date)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_is_admin boolean;
  v_inserted integer := 0;
begin
  if v_user_id is null or not private.is_active_user() then
    raise exception 'Utilizador não autenticado ou inativo';
  end if;

  if p_month is null
     or p_month <> date_trunc('month', p_month)::date then
    raise exception 'Seleciona um mês válido.';
  end if;

  v_is_admin := private.is_admin();

  insert into public.deals (
    client_id,
    commercial_id,
    deal_type,
    stage,
    eligibility_month,
    renewal_key,
    created_by
  )
  select distinct
    c.id,
    c.commercial_id,
    'portfolio_renewal',
    'to_contact',
    p_month,
    concat('renewal:', c.id::text, ':', p_month::text),
    v_user_id
  from public.clients c
  join public.services s on s.client_id = c.id
  where (v_is_admin or c.commercial_id = v_user_id)
    and s.is_active = true
    and s.loyalty_end_date is not null
    and date_trunc(
      'month',
      (s.loyalty_end_date - interval '6 months')::date
    )::date = p_month
    and not exists (
      select 1
      from public.deal_services linked
      where linked.service_id = s.id
    )
  on conflict (renewal_key) where renewal_key is not null do nothing;

  get diagnostics v_inserted = row_count;

  -- Attach every still-unlinked service entering renewal in this month,
  -- including services for an existing deal that was moved into this month.
  insert into public.deal_services (deal_id, service_id, current_monthly_fee)
  select
    d.id,
    s.id,
    s.current_monthly_fee
  from public.clients c
  join public.services s on s.client_id = c.id
  join public.deals d
    on d.client_id = c.id
   and d.deal_type = 'portfolio_renewal'
   and d.eligibility_month = p_month
   and d.renewal_key = concat('renewal:', c.id::text, ':', p_month::text)
  where (v_is_admin or c.commercial_id = v_user_id)
    and s.is_active = true
    and s.loyalty_end_date is not null
    and date_trunc(
      'month',
      (s.loyalty_end_date - interval '6 months')::date
    )::date = p_month
    and not exists (
      select 1
      from public.deal_services linked
      where linked.service_id = s.id
    )
  on conflict do nothing;

  return v_inserted;
end;
$function$;

revoke all on function private.create_renewal_deals_for_month(date) from public, anon, service_role;
grant execute on function private.create_renewal_deals_for_month(date) to authenticated;

create or replace function public.create_renewal_deals_for_month(p_month date)
returns integer
language sql
security invoker
set search_path = ''
as $function$
  select private.create_renewal_deals_for_month(p_month);
$function$;

revoke all on function public.create_renewal_deals_for_month(date) from public, anon, service_role;
grant execute on function public.create_renewal_deals_for_month(date) to authenticated;

-- A deal can be moved between months without changing the underlying client or services.
create or replace function private.move_renewal_deal_to_month(p_deal_id uuid, p_month date)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_is_admin boolean;
  v_client_id uuid;
  v_commercial_id uuid;
  v_deal_type text;
  v_stage text;
  v_new_key text;
begin
  if v_user_id is null or not private.is_active_user() then
    raise exception 'Utilizador não autenticado ou inativo';
  end if;

  if p_month is not null
     and p_month <> date_trunc('month', p_month)::date then
    raise exception 'Seleciona um mês válido.';
  end if;

  v_is_admin := private.is_admin();

  select client_id, commercial_id, deal_type, stage
    into v_client_id, v_commercial_id, v_deal_type, v_stage
  from public.deals
  where id = p_deal_id;

  if not found then
    raise exception 'Negócio não encontrado.';
  end if;

  if not v_is_admin and v_commercial_id is distinct from v_user_id then
    raise exception 'Não tens acesso a este negócio.';
  end if;

  if v_stage in ('sale', 'lost') then
    raise exception 'Só podes mover negócios que ainda estejam em aberto.';
  end if;

  if v_deal_type = 'portfolio_renewal' and p_month is not null then
    v_new_key := concat('renewal:', v_client_id::text, ':', p_month::text);

    if exists (
      select 1
      from public.deals other
      where other.id <> p_deal_id
        and other.renewal_key = v_new_key
    ) then
      raise exception 'Este cliente já tem um negócio de renovação nesse mês.';
    end if;

    update public.deals
    set eligibility_month = p_month,
        renewal_key = v_new_key,
        updated_at = now()
    where id = p_deal_id;
  else
    update public.deals
    set eligibility_month = p_month,
        updated_at = now()
    where id = p_deal_id;
  end if;
end;
$function$;

revoke all on function private.move_renewal_deal_to_month(uuid, date) from public, anon, service_role;
grant execute on function private.move_renewal_deal_to_month(uuid, date) to authenticated;

create or replace function public.move_renewal_deal_to_month(p_deal_id uuid, p_month date)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.move_renewal_deal_to_month(p_deal_id, p_month);
$function$;

revoke all on function public.move_renewal_deal_to_month(uuid, date) from public, anon, service_role;
grant execute on function public.move_renewal_deal_to_month(uuid, date) to authenticated;

grant usage on schema private to authenticated;

commit;
