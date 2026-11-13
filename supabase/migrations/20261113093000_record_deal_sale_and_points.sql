create or replace function private.prevent_manual_deal_sale()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.stage = 'sale'
     and coalesce(current_setting('crm.allow_sale_completion', true), 'off') <> 'on' then
    raise exception 'Para concluir uma venda, regista primeiro o resultado de cada serviço.';
  end if;
  return new;
end;
$function$;

drop trigger if exists prevent_manual_deal_sale on public.deals;
create trigger prevent_manual_deal_sale
before insert or update of stage on public.deals
for each row
execute function private.prevent_manual_deal_sale();

create or replace function private.mark_deal_sale_with_service_decisions(
  p_deal_id uuid,
  p_service_decisions jsonb,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_commercial_id uuid;
  v_deal public.deals%rowtype;
  v_service record;
  v_item jsonb;
  v_expected integer;
  v_provided integer;
  v_unique integer;
  v_decision text;
  v_before_fee numeric(12,2);
  v_after_fee numeric(12,2);
  v_before_package text;
  v_after_package text;
  v_scoring_package text;
  v_family text;
  v_increase_rate numeric(8,5);
  v_reduction_rate numeric(8,5);
  v_maintenance_rate numeric(8,5);
  v_points numeric(12,2);
  v_total_points numeric(12,2) := 0;
  v_sale_id uuid;
  v_sale_service_id uuid;
  v_previous_end_date date;
  v_new_end_date date;
  v_now timestamptz := clock_timestamp();
  v_local_date date;
  v_reference_month date;
  v_decisions jsonb := '[]'::jsonb;
  v_old_services jsonb := '[]'::jsonb;
  v_summary text := 'Venda concluída.';
begin
  if v_user_id is null or not private.is_active_user() then
    raise exception 'Utilizador não autenticado ou inativo';
  end if;

  if not private.can_access_deal(p_deal_id) then
    raise exception 'Não tens acesso a este negócio.';
  end if;

  if char_length(coalesce(p_description, '')) > 5000 then
    raise exception 'A observação não pode ultrapassar 5.000 caracteres.';
  end if;

  if jsonb_typeof(p_service_decisions) is distinct from 'array' then
    raise exception 'Tens de indicar a decisão de cada serviço.';
  end if;

  select *
  into v_deal
  from public.deals d
  where d.id = p_deal_id
  for update;

  if not found then
    raise exception 'Negócio não encontrado.';
  end if;

  if v_deal.stage in ('sale', 'lost') then
    raise exception 'Este negócio já está concluído.';
  end if;

  if exists (select 1 from public.sales s where s.deal_id = p_deal_id) then
    raise exception 'Este negócio já tem uma venda registada.';
  end if;

  select count(*)::integer
  into v_expected
  from public.deal_services ds
  where ds.deal_id = p_deal_id;

  select
    count(*)::integer,
    count(distinct e.value->>'service_id')::integer
  into v_provided, v_unique
  from jsonb_array_elements(p_service_decisions) e(value);

  if v_provided <> v_expected or v_provided <> v_unique then
    raise exception 'Decide individualmente o resultado de todos os serviços associados.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_service_decisions) e(value)
    where jsonb_typeof(e.value) is distinct from 'object'
       or coalesce(e.value->>'service_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not exists (
         select 1
         from public.deal_services ds
         where ds.deal_id = p_deal_id
           and ds.service_id::text = e.value->>'service_id'
       )
       or coalesce(e.value->>'decision', '') not in ('renew', 'keep_active', 'cancel')
  ) then
    raise exception 'Uma das decisões dos serviços é inválida.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'service_id', s.id,
        'service_number', s.service_number,
        'package_name', s.package_name,
        'current_monthly_fee', s.current_monthly_fee,
        'is_active', s.is_active,
        'loyalty_end_date', s.loyalty_end_date
      ) order by s.service_number
    ),
    '[]'::jsonb
  )
  into v_old_services
  from public.deal_services ds
  join public.services s on s.id = ds.service_id
  where ds.deal_id = p_deal_id;

  v_local_date := (v_now at time zone 'Europe/Lisbon')::date;
  v_reference_month := date_trunc('month', v_local_date)::date;
  v_commercial_id := coalesce(v_deal.commercial_id, v_user_id);

  insert into public.sales (
    deal_id, commercial_id, status, completed_at, sp_generated
  ) values (
    p_deal_id, v_commercial_id, 'completed', v_now, 0
  )
  returning id into v_sale_id;

  for v_service in
    select
      ds.id as deal_service_id,
      ds.service_id,
      s.service_number,
      s.package_name,
      s.current_monthly_fee as stored_monthly_fee,
      s.loyalty_end_date,
      s.source_data,
      s.is_active
    from public.deal_services ds
    join public.services s on s.id = ds.service_id
    where ds.deal_id = p_deal_id
    order by s.service_number
  loop
    select e.value
    into v_item
    from jsonb_array_elements(p_service_decisions) e(value)
    where e.value->>'service_id' = v_service.service_id::text;

    v_decision := v_item->>'decision';

    if coalesce(v_item->>'before_monthly_fee', '') !~ '^\d+(\.\d{1,2})?$' then
      raise exception 'Indica uma mensalidade actual válida para todos os serviços.';
    end if;
    v_before_fee := (v_item->>'before_monthly_fee')::numeric(12,2);

    if v_before_fee < 0 then
      raise exception 'A mensalidade actual não pode ser negativa.';
    end if;

    v_before_package := coalesce(
      nullif(v_service.source_data #>> '{0,Oferta Comercial}', ''),
      nullif(v_service.source_data #>> '{0,Tarifário}', ''),
      nullif(v_service.source_data #>> '{0,Pacote Base}', ''),
      nullif(v_service.package_name, '')
    );
    v_previous_end_date := v_service.loyalty_end_date;
    v_new_end_date := null;

    if v_decision = 'cancel' then
      v_after_fee := 0;
      v_after_package := null;
    elsif v_decision = 'keep_active' then
      v_after_fee := v_before_fee;
      v_after_package := v_before_package;
    else
      if coalesce(v_item->>'after_monthly_fee', '') !~ '^\d+(\.\d{1,2})?$' then
        raise exception 'Indica uma mensalidade nova válida para cada serviço renovado.';
      end if;
      v_after_fee := (v_item->>'after_monthly_fee')::numeric(12,2);
      v_after_package := nullif(btrim(coalesce(v_item->>'after_package', '')), '');
      if v_after_fee < 0 then
        raise exception 'A nova mensalidade não pode ser negativa.';
      end if;
      if v_after_package is null or char_length(v_after_package) > 120 then
        raise exception 'Seleciona um pacote futuro válido para cada serviço renovado.';
      end if;
      v_new_end_date := (v_local_date + interval '24 months')::date;
    end if;

    v_scoring_package := coalesce(v_after_package, v_before_package, '');
    v_family := case
      when v_scoring_package ~* '(^|[^a-z0-9])m[45]([^a-z0-9]|$)' then 'mxo'
      when v_scoring_package ~* '(^|[^a-z0-9])m[23]([^a-z0-9]|$)' then 'm3m2'
      else 'other'
    end;

    v_points := 0;
    if v_family = 'mxo' then
      v_increase_rate := 0.04;
      v_reduction_rate := 0.02;
      v_maintenance_rate := 0.03;
    elsif v_family = 'm3m2' then
      v_increase_rate := 0.033;
      v_reduction_rate := 0.018;
      v_maintenance_rate := 0.025;
    else
      v_increase_rate := 0;
      v_reduction_rate := 0;
      v_maintenance_rate := 0;
    end if;

    if v_after_fee > v_before_fee then
      v_points := round((v_after_fee - v_before_fee) * v_increase_rate, 2);
    elsif v_after_fee < v_before_fee then
      v_points := round((v_before_fee - v_after_fee) * v_reduction_rate, 2);
    else
      v_points := round(v_before_fee * v_maintenance_rate, 2);
    end if;

    insert into public.sale_services (
      sale_id, service_id, decision,
      before_package, after_package,
      before_monthly_fee, after_monthly_fee, points,
      previous_loyalty_end_date, new_loyalty_end_date
    ) values (
      v_sale_id, v_service.service_id, v_decision,
      v_before_package, v_after_package,
      v_before_fee, v_after_fee, v_points,
      v_previous_end_date, v_new_end_date
    )
    returning id into v_sale_service_id;

    insert into public.points_ledger (
      sale_service_id, commercial_id, points, reference_month
    ) values (
      v_sale_service_id, v_commercial_id, v_points, v_reference_month
    );

    update public.deal_services
    set decision = v_decision,
        future_package = v_after_package,
        current_monthly_fee = v_before_fee,
        future_monthly_fee = v_after_fee
    where id = v_service.deal_service_id;

    if v_decision = 'cancel' then
      update public.services
      set is_active = false,
          current_monthly_fee = 0,
          updated_at = v_now
      where id = v_service.service_id;
    elsif v_decision = 'keep_active' then
      update public.services
      set is_active = true,
          current_monthly_fee = v_after_fee,
          updated_at = v_now
      where id = v_service.service_id;
    else
      update public.services
      set is_active = true,
          current_monthly_fee = v_after_fee,
          loyalty_end_date = v_new_end_date,
          source_data = case
            when jsonb_typeof(source_data) = 'array' and jsonb_array_length(source_data) > 0
              then jsonb_set(source_data, '{0,Oferta Comercial}', to_jsonb(v_after_package), true)
            when jsonb_typeof(source_data) = 'object'
              then jsonb_set(source_data, '{Oferta Comercial}', to_jsonb(v_after_package), true)
            else source_data
          end,
          updated_at = v_now
      where id = v_service.service_id;

      insert into public.loyalty_history (
        service_id, sale_service_id, start_date, end_date, source, recorded_by
      ) values (
        v_service.service_id, v_sale_service_id, v_local_date, v_new_end_date, 'crm_sale', v_user_id
      );
    end if;

    v_total_points := v_total_points + v_points;
    v_decisions := v_decisions || jsonb_build_array(jsonb_build_object(
      'service_id', v_service.service_id,
      'service_number', v_service.service_number,
      'decision', v_decision,
      'before_monthly_fee', v_before_fee,
      'after_monthly_fee', v_after_fee,
      'before_package', v_before_package,
      'after_package', v_after_package,
      'points', v_points,
      'new_loyalty_end_date', v_new_end_date
    ));

    v_summary := v_summary || E'\n' || v_service.service_number
      || ': ' || case v_decision
        when 'renew' then 'renovado'
        when 'keep_active' then 'mantido activo'
        else 'cancelado'
      end
      || ' — ' || to_char(v_points, 'FM999999990.00') || ' SP.';
  end loop;

  update public.sales
  set sp_generated = v_total_points
  where id = v_sale_id;

  perform pg_catalog.set_config('crm.allow_sale_completion', 'on', true);

  update public.deals
  set stage = 'sale',
      next_contact_at = null,
      lost_reason = null,
      updated_at = v_now
  where id = p_deal_id;

  insert into public.audit_log (
    actor_id, entity_type, entity_id, action, old_data, new_data, created_at
  ) values (
    v_user_id,
    'deal',
    p_deal_id,
    'complete_sale',
    jsonb_build_object('deal', to_jsonb(v_deal), 'services', v_old_services),
    jsonb_build_object(
      'stage', 'sale',
      'sale_id', v_sale_id,
      'commercial_id', v_commercial_id,
      'points_generated', v_total_points,
      'service_decisions', v_decisions
    ),
    v_now
  );

  if nullif(btrim(coalesce(p_description, '')), '') is not null then
    v_summary := v_summary || E'\nObservação: ' || btrim(p_description);
  end if;

  insert into public.interactions (
    deal_id, commercial_id, event_type, description, event_data, occurred_at
  ) values (
    p_deal_id,
    v_user_id,
    'sale_completed',
    v_summary,
    jsonb_build_object(
      'old_stage', v_deal.stage,
      'new_stage', 'sale',
      'sale_id', v_sale_id,
      'points_generated', v_total_points,
      'service_decisions', v_decisions
    ),
    v_now
  );

  return v_sale_id;
end;
$function$;

create or replace function public.mark_deal_sale_with_service_decisions(
  p_deal_id uuid,
  p_service_decisions jsonb,
  p_description text default null
)
returns uuid
language sql
set search_path = ''
as $function$
  select private.mark_deal_sale_with_service_decisions(
    p_deal_id, p_service_decisions, p_description
  );
$function$;

revoke all on function private.mark_deal_sale_with_service_decisions(uuid, jsonb, text) from public, anon;
grant execute on function private.mark_deal_sale_with_service_decisions(uuid, jsonb, text) to authenticated;

revoke all on function public.mark_deal_sale_with_service_decisions(uuid, jsonb, text) from public, anon;
grant execute on function public.mark_deal_sale_with_service_decisions(uuid, jsonb, text) to authenticated;
