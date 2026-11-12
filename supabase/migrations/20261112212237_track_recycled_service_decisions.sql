alter table public.deal_services
  add column if not exists loss_decision text,
  add column if not exists loss_decided_at timestamptz,
  add column if not exists loss_decision_by uuid references public.profiles(id) on delete set null,
  add column if not exists recycled_loyalty_end_date date;

alter table public.deal_services
  drop constraint if exists deal_services_loss_decision_check;

alter table public.deal_services
  add constraint deal_services_loss_decision_check
  check (loss_decision is null or loss_decision in ('recycle', 'close'));

create or replace function private.mark_deal_lost_with_service_decisions(
  p_deal_id uuid,
  p_lost_reason text,
  p_service_decisions jsonb,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_deal public.deals%rowtype;
  v_service record;
  v_item jsonb;
  v_expected integer;
  v_provided integer;
  v_unique integer;
  v_decision text;
  v_date_text text;
  v_new_end_date date;
  v_return_month date;
  v_decisions jsonb := '[]'::jsonb;
  v_old_services jsonb := '[]'::jsonb;
  v_summary text := 'Negócio marcado como perdido.';
  v_reason text := nullif(btrim(coalesce(p_lost_reason, '')), '');
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null or not private.is_active_user() then
    raise exception 'Utilizador não autenticado ou inativo';
  end if;
  if not private.can_access_deal(p_deal_id) then
    raise exception 'Não tens acesso a este negócio.';
  end if;
  if v_reason is null then
    raise exception 'Indica o motivo pelo qual o negócio foi perdido.';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'O motivo de perda não pode ultrapassar 1.000 caracteres.';
  end if;
  if char_length(coalesce(p_description, '')) > 5000 then
    raise exception 'O texto não pode ultrapassar 5.000 caracteres.';
  end if;
  if jsonb_typeof(p_service_decisions) is distinct from 'array' then
    raise exception 'Tens de decidir o destino de cada serviço associado.';
  end if;

  select * into v_deal
  from public.deals d
  where d.id = p_deal_id
  for update;
  if not found then
    raise exception 'Negócio não encontrado.';
  end if;
  if v_deal.stage = 'lost' then
    raise exception 'Este negócio já está marcado como perdido.';
  end if;

  select count(*)::integer into v_expected
  from public.deal_services ds
  where ds.deal_id = p_deal_id;

  select count(*)::integer, count(distinct e.value->>'service_id')::integer
  into v_provided, v_unique
  from jsonb_array_elements(p_service_decisions) e(value);
  if v_provided <> v_expected or v_provided <> v_unique then
    raise exception 'Decide individualmente o destino de todos os serviços associados.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_service_decisions) e(value)
    where jsonb_typeof(e.value) is distinct from 'object'
       or coalesce(e.value->>'service_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not exists (
         select 1 from public.deal_services ds
         where ds.deal_id = p_deal_id and ds.service_id::text = e.value->>'service_id'
       )
       or coalesce(e.value->>'decision', '') not in ('recycle', 'close')
  ) then
    raise exception 'Uma das decisões dos serviços é inválida.';
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'service_id', s.id,
      'service_number', s.service_number,
      'package_name', s.package_name,
      'is_active', s.is_active,
      'loyalty_end_date', s.loyalty_end_date
    ) order by s.service_number),
    '[]'::jsonb
  )
  into v_old_services
  from public.deal_services ds
  join public.services s on s.id = ds.service_id
  where ds.deal_id = p_deal_id;

  for v_service in
    select s.id, s.service_number, s.package_name
    from public.deal_services ds
    join public.services s on s.id = ds.service_id
    where ds.deal_id = p_deal_id
    order by s.service_number
  loop
    select e.value into v_item
    from jsonb_array_elements(p_service_decisions) e(value)
    where e.value->>'service_id' = v_service.id::text;

    v_decision := v_item->>'decision';
    v_date_text := nullif(btrim(coalesce(v_item->>'loyalty_end_date', '')), '');

    if v_decision = 'recycle' then
      if v_date_text is null or v_date_text !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'Indica uma data de fim de fidelização válida para cada serviço a reciclar.';
      end if;
      v_new_end_date := v_date_text::date;
      if v_new_end_date <= current_date then
        raise exception 'A nova data de fidelização tem de ser futura.';
      end if;
      v_return_month := date_trunc('month', (v_new_end_date - interval '6 months')::date)::date;

      update public.services
      set is_active = true, loyalty_end_date = v_new_end_date, updated_at = v_now
      where id = v_service.id;

      update public.deal_services
      set loss_decision = 'recycle',
          loss_decided_at = v_now,
          loss_decision_by = v_user_id,
          recycled_loyalty_end_date = v_new_end_date
      where deal_id = p_deal_id and service_id = v_service.id;

      v_decisions := v_decisions || jsonb_build_array(jsonb_build_object(
        'service_id', v_service.id,
        'service_number', v_service.service_number,
        'package_name', v_service.package_name,
        'decision', 'recycle',
        'loyalty_end_date', v_new_end_date,
        'return_month', v_return_month
      ));
      v_summary := v_summary || E'\n' || v_service.service_number
        || ': reciclado — fidelização até ' || to_char(v_new_end_date, 'DD/MM/YYYY')
        || ' (regressa ao funil em ' || to_char(v_return_month, 'MM/YYYY') || ').';
    else
      update public.services
      set is_active = false, updated_at = v_now
      where id = v_service.id;

      update public.deal_services
      set loss_decision = 'close',
          loss_decided_at = v_now,
          loss_decision_by = v_user_id,
          recycled_loyalty_end_date = null
      where deal_id = p_deal_id and service_id = v_service.id;

      v_decisions := v_decisions || jsonb_build_array(jsonb_build_object(
        'service_id', v_service.id,
        'service_number', v_service.service_number,
        'package_name', v_service.package_name,
        'decision', 'close',
        'loyalty_end_date', null
      ));
      v_summary := v_summary || E'\n' || v_service.service_number || ': encerrado definitivamente.';
    end if;
  end loop;

  if nullif(btrim(coalesce(p_description, '')), '') is not null then
    v_summary := v_summary || E'\nObservação: ' || btrim(p_description);
  end if;

  update public.deals
  set stage = 'lost', next_contact_at = null, lost_reason = v_reason, updated_at = v_now
  where id = p_deal_id;

  insert into public.audit_log (
    actor_id, entity_type, entity_id, action, old_data, new_data, created_at
  ) values (
    v_user_id, 'deal', p_deal_id, 'mark_lost_with_service_decisions',
    jsonb_build_object('deal', to_jsonb(v_deal), 'services', v_old_services),
    jsonb_build_object('stage', 'lost', 'lost_reason', v_reason, 'service_decisions', v_decisions),
    v_now
  );

  insert into public.interactions (
    deal_id, commercial_id, event_type, description, event_data, occurred_at
  ) values (
    p_deal_id, v_user_id, 'deal_lost', v_summary,
    jsonb_build_object(
      'old_stage', v_deal.stage,
      'new_stage', 'lost',
      'lost_reason', v_reason,
      'service_decisions', v_decisions
    ),
    v_now
  );
end;
$function$;

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
    c.id, c.commercial_id, 'portfolio_renewal', 'to_contact', p_month,
    concat('renewal:', c.id::text, ':', p_month::text), v_user_id
  from public.clients c
  join public.services s on s.client_id = c.id
  where (v_is_admin or c.commercial_id = v_user_id)
    and s.is_active = true
    and s.loyalty_end_date is not null
    and date_trunc('month', (s.loyalty_end_date - interval '6 months')::date)::date = p_month
    and not exists (
      select 1 from public.deal_services linked
      join public.deals linked_deal on linked_deal.id = linked.deal_id
      where linked.service_id = s.id and linked_deal.stage <> 'lost'
    )
    and (
      not exists (select 1 from public.deal_services any_link where any_link.service_id = s.id)
      or (
        select latest.loss_decision
        from public.deal_services latest
        where latest.service_id = s.id and latest.loss_decision is not null
        order by latest.loss_decided_at desc nulls last, latest.created_at desc
        limit 1
      ) = 'recycle'
    )
  on conflict (renewal_key) where renewal_key is not null do nothing;

  get diagnostics v_inserted = row_count;

  insert into public.deal_services (deal_id, service_id, current_monthly_fee)
  select d.id, s.id, s.current_monthly_fee
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
    and date_trunc('month', (s.loyalty_end_date - interval '6 months')::date)::date = p_month
    and not exists (
      select 1 from public.deal_services linked
      join public.deals linked_deal on linked_deal.id = linked.deal_id
      where linked.service_id = s.id and linked_deal.stage <> 'lost'
    )
    and (
      not exists (select 1 from public.deal_services any_link where any_link.service_id = s.id)
      or (
        select latest.loss_decision
        from public.deal_services latest
        where latest.service_id = s.id and latest.loss_decision is not null
        order by latest.loss_decided_at desc nulls last, latest.created_at desc
        limit 1
      ) = 'recycle'
    )
  on conflict do nothing;

  return v_inserted;
end;
$function$;
