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
  if p_month is null or p_month <> date_trunc('month', p_month)::date then
    raise exception 'Seleciona um mês válido.';
  end if;
  v_is_admin := private.is_admin();

  insert into public.deals (
    client_id, commercial_id, deal_type, stage, eligibility_month, renewal_key, created_by
  )
  select distinct
    c.id,
    c.commercial_id,
    'portfolio_renewal',
    'to_contact',
    p_month,
    concat(
      'renewal:',
      c.id::text,
      ':',
      p_month::text,
      ':',
      (
        select count(*)::text
        from public.deals previous
        where previous.client_id = c.id
          and previous.deal_type = 'portfolio_renewal'
          and previous.eligibility_month = p_month
      )
    ),
    v_user_id
  from public.clients c
  join public.services s on s.client_id = c.id
  where (v_is_admin or c.commercial_id = v_user_id)
    and s.is_active = true
    and s.loyalty_end_date is not null
    and date_trunc('month', (s.loyalty_end_date - interval '6 months')::date)::date = p_month
    and not exists (
      select 1
      from public.deal_services linked
      join public.deals linked_deal on linked_deal.id = linked.deal_id
      where linked.service_id = s.id
        and linked_deal.stage not in ('lost', 'sale')
    )
    and (
      not exists (
        select 1
        from public.deal_services any_link
        where any_link.service_id = s.id
      )
      or (
        select latest.loss_decision
        from public.deal_services latest
        where latest.service_id = s.id
          and latest.loss_decision is not null
        order by latest.loss_decided_at desc nulls last, latest.created_at desc
        limit 1
      ) = 'recycle'
    )
    and not exists (
      select 1
      from public.deals active_month_deal
      where active_month_deal.client_id = c.id
        and active_month_deal.deal_type = 'portfolio_renewal'
        and active_month_deal.eligibility_month = p_month
        and active_month_deal.stage not in ('lost', 'sale')
    )
  on conflict (renewal_key) where renewal_key is not null do nothing;

  get diagnostics v_inserted = row_count;

  insert into public.deal_services (deal_id, service_id, current_monthly_fee)
  select d.id, s.id, s.current_monthly_fee
  from public.clients c
  join public.services s on s.client_id = c.id
  join lateral (
    select candidate.id
    from public.deals candidate
    where candidate.client_id = c.id
      and candidate.deal_type = 'portfolio_renewal'
      and candidate.eligibility_month = p_month
      and candidate.stage not in ('lost', 'sale')
    order by candidate.created_at desc
    limit 1
  ) d on true
  where (v_is_admin or c.commercial_id = v_user_id)
    and s.is_active = true
    and s.loyalty_end_date is not null
    and date_trunc('month', (s.loyalty_end_date - interval '6 months')::date)::date = p_month
    and not exists (
      select 1
      from public.deal_services linked
      join public.deals linked_deal on linked_deal.id = linked.deal_id
      where linked.service_id = s.id
        and linked_deal.stage not in ('lost', 'sale')
    )
    and (
      not exists (
        select 1 from public.deal_services any_link
        where any_link.service_id = s.id
      )
      or (
        select latest.loss_decision
        from public.deal_services latest
        where latest.service_id = s.id
          and latest.loss_decision is not null
        order by latest.loss_decided_at desc nulls last, latest.created_at desc
        limit 1
      ) = 'recycle'
    )
  on conflict do nothing;

  return v_inserted;
end;
$function$;
