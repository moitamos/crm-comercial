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
        and s.is_active = true
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
