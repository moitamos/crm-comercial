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
    null::uuid
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
