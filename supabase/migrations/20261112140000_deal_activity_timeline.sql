begin;

-- Record deal changes and activities atomically, using the database clock.
create or replace function private.record_deal_activity(
  p_deal_id uuid,
  p_action text,
  p_stage text default null,
  p_next_contact_at timestamptz default null,
  p_lost_reason text default null,
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
  v_now timestamptz := clock_timestamp();
  v_next_contact_at timestamptz;
  v_lost_reason text;
begin
  if v_user_id is null or not private.is_active_user() then
    raise exception 'Utilizador não autenticado ou inativo';
  end if;

  if p_action not in ('update', 'observation', 'contact_attempt') then
    raise exception 'Ação de negócio inválida.';
  end if;

  if not private.can_access_deal(p_deal_id) then
    raise exception 'Não tens acesso a este negócio.';
  end if;

  select *
    into v_deal
  from public.deals
  where id = p_deal_id
  for update;

  if not found then
    raise exception 'Negócio não encontrado.';
  end if;

  if p_description is not null and length(p_description) > 5000 then
    raise exception 'O texto não pode ultrapassar 5.000 caracteres.';
  end if;

  if p_action = 'observation' then
    if nullif(btrim(p_description), '') is null then
      raise exception 'Escreve a observação antes de guardar.';
    end if;

    insert into public.interactions (
      deal_id, commercial_id, event_type, description, event_data, occurred_at
    ) values (
      p_deal_id, v_user_id, 'observation', btrim(p_description),
      jsonb_build_object('source', 'deal_popup'), v_now
    );
    return;
  end if;

  if p_action = 'contact_attempt' then
    update public.deals
    set last_contact_at = v_now,
        updated_at = v_now
    where id = p_deal_id;

    insert into public.interactions (
      deal_id, commercial_id, event_type, description, event_data, occurred_at
    ) values (
      p_deal_id, v_user_id, 'contact_attempt',
      coalesce(nullif(btrim(p_description), ''), 'Tentativa de contacto registada.'),
      jsonb_build_object('contact_at', v_now), v_now
    );
    return;
  end if;

  if p_stage is null or p_stage not in (
    'to_contact', 'negotiation', 'scheduled', 'future_contact', 'sale', 'lost'
  ) then
    raise exception 'Seleciona uma fase válida do funil.';
  end if;

  if p_stage in ('scheduled', 'future_contact') and p_next_contact_at is null then
    raise exception 'Indica a data em que devemos voltar a contactar o cliente.';
  end if;

  if p_stage = 'lost' and nullif(btrim(p_lost_reason), '') is null then
    raise exception 'Indica o motivo pelo qual o negócio foi perdido.';
  end if;

  v_next_contact_at := case
    when p_stage in ('scheduled', 'future_contact') then p_next_contact_at
    else null
  end;
  v_lost_reason := case
    when p_stage = 'lost' then nullif(btrim(p_lost_reason), '')
    else null
  end;

  if v_deal.stage is distinct from p_stage
     or v_deal.next_contact_at is distinct from v_next_contact_at
     or v_deal.lost_reason is distinct from v_lost_reason then

    update public.deals
    set stage = p_stage,
        next_contact_at = v_next_contact_at,
        lost_reason = v_lost_reason,
        updated_at = v_now
    where id = p_deal_id;

    insert into public.interactions (
      deal_id, commercial_id, event_type, description, event_data, occurred_at
    ) values (
      p_deal_id,
      v_user_id,
      case when v_deal.stage is distinct from p_stage then 'stage_changed' else 'deal_updated' end,
      case
        when v_deal.stage is distinct from p_stage then 'Fase do negócio alterada.'
        else 'Dados de acompanhamento do negócio atualizados.'
      end,
      jsonb_build_object(
        'old_stage', v_deal.stage,
        'new_stage', p_stage,
        'old_next_contact_at', v_deal.next_contact_at,
        'new_next_contact_at', v_next_contact_at,
        'old_lost_reason', v_deal.lost_reason,
        'new_lost_reason', v_lost_reason
      ),
      v_now
    );
  end if;

  if nullif(btrim(p_description), '') is not null then
    insert into public.interactions (
      deal_id, commercial_id, event_type, description, event_data, occurred_at
    ) values (
      p_deal_id, v_user_id, 'observation', btrim(p_description),
      jsonb_build_object('source', 'deal_popup', 'stage', p_stage), v_now
    );
  end if;
end;
$function$;

revoke all on function private.record_deal_activity(uuid, text, text, timestamptz, text, text)
  from public, anon, service_role;
grant execute on function private.record_deal_activity(uuid, text, text, timestamptz, text, text)
  to authenticated;

create or replace function public.record_deal_activity(
  p_deal_id uuid,
  p_action text,
  p_stage text default null,
  p_next_contact_at timestamptz default null,
  p_lost_reason text default null,
  p_description text default null
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.record_deal_activity(
    p_deal_id, p_action, p_stage, p_next_contact_at, p_lost_reason, p_description
  );
$function$;

revoke all on function public.record_deal_activity(uuid, text, text, timestamptz, text, text)
  from public, anon, service_role;
grant execute on function public.record_deal_activity(uuid, text, text, timestamptz, text, text)
  to authenticated;

-- Record month transfers in the same activity history.
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
  v_old_month date;
  v_new_key text;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null or not private.is_active_user() then
    raise exception 'Utilizador não autenticado ou inativo';
  end if;

  if p_month is not null
     and p_month <> date_trunc('month', p_month)::date then
    raise exception 'Seleciona um mês válido.';
  end if;

  v_is_admin := private.is_admin();

  select client_id, commercial_id, deal_type, stage, eligibility_month
    into v_client_id, v_commercial_id, v_deal_type, v_stage, v_old_month
  from public.deals
  where id = p_deal_id
  for update;

  if not found then
    raise exception 'Negócio não encontrado.';
  end if;

  if not v_is_admin and v_commercial_id is distinct from v_user_id then
    raise exception 'Não tens acesso a este negócio.';
  end if;

  if v_stage in ('sale', 'lost') then
    raise exception 'Só podes mover negócios que ainda estejam em aberto.';
  end if;

  if v_old_month is not distinct from p_month then
    return;
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
        updated_at = v_now
    where id = p_deal_id;
  else
    update public.deals
    set eligibility_month = p_month,
        updated_at = v_now
    where id = p_deal_id;
  end if;

  insert into public.interactions (
    deal_id, commercial_id, event_type, description, event_data, occurred_at
  ) values (
    p_deal_id,
    v_user_id,
    'month_moved',
    'Mês do negócio alterado: '
      || coalesce(to_char(v_old_month, 'MM/YYYY'), 'Sem mês definido')
      || ' → '
      || coalesce(to_char(p_month, 'MM/YYYY'), 'Sem mês definido'),
    jsonb_build_object('old_month', v_old_month, 'new_month', p_month),
    v_now
  );
end;
$function$;

commit;
