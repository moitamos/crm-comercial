create or replace function public.create_client_with_services(
  p_client jsonb,
  p_services jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_client_id uuid;
  v_service jsonb;
  v_service_number text;
  v_service_type text;
  v_package_name text;
  v_conclusion_date date;
  v_end_date date;
  v_monthly_fee numeric;
begin
  if v_user_id is null or not private.is_active_user() then
    raise exception 'Utilizador não autenticado ou inativo.';
  end if;

  if jsonb_typeof(p_client) <> 'object' then
    raise exception 'Dados do cliente inválidos.';
  end if;

  if jsonb_typeof(coalesce(p_services, '[]'::jsonb)) <> 'array' then
    raise exception 'A lista de serviços é inválida.';
  end if;

  if jsonb_array_length(coalesce(p_services, '[]'::jsonb)) > 50 then
    raise exception 'Um cliente não pode ter mais de 50 serviços nesta operação.';
  end if;

  if not exists (
    select 1
    from public.portfolio_members pm
    where pm.portfolio_id = (p_client->>'portfolio_id')::uuid
      and pm.user_id = v_user_id
  ) then
    raise exception 'Não tens acesso à carteira selecionada.';
  end if;

  insert into public.clients (
    full_name, nif, nic, ncc, phone, email, address, notes,
    portfolio_id, commercial_id, created_by
  )
  values (
    trim(p_client->>'full_name'),
    regexp_replace(coalesce(p_client->>'nif', ''), '[^0-9]', '', 'g'),
    nullif(trim(p_client->>'nic'), ''),
    nullif(trim(p_client->>'ncc'), ''),
    nullif(trim(p_client->>'phone'), ''),
    nullif(lower(trim(p_client->>'email')), ''),
    nullif(trim(p_client->>'address'), ''),
    nullif(trim(p_client->>'notes'), ''),
    (p_client->>'portfolio_id')::uuid,
    v_user_id,
    v_user_id
  )
  returning id into v_client_id;

  for v_service in
    select value from jsonb_array_elements(coalesce(p_services, '[]'::jsonb))
  loop
    v_service_number := nullif(trim(v_service->>'service_number'), '');
    if v_service_number is null then
      raise exception 'Cada serviço preenchido tem de ter um número de serviço/cartão.';
    end if;

    v_service_type := coalesce(nullif(v_service->>'service_type', ''), 'meo');
    if v_service_type not in ('meo', 'mobile', 'gcp', 'other') then
      raise exception 'Tipo de serviço inválido.';
    end if;

    v_package_name := nullif(trim(v_service->>'package_name'), '');
    v_conclusion_date := nullif(v_service->>'loyalty_conclusion_date', '')::date;
    v_end_date := nullif(v_service->>'loyalty_end_date', '')::date;
    if v_conclusion_date is not null then
      v_end_date := (v_conclusion_date + interval '24 months')::date;
    end if;

    v_monthly_fee := nullif(v_service->>'current_monthly_fee', '')::numeric;
    if v_monthly_fee is not null and v_monthly_fee < 0 then
      raise exception 'A mensalidade de um serviço não pode ser negativa.';
    end if;

    insert into public.services (
      client_id, service_number, package_name, current_monthly_fee,
      loyalty_end_date, loyalty_conclusion_date, service_type,
      is_active, source, created_at, updated_at
    )
    values (
      v_client_id, v_service_number, v_package_name, v_monthly_fee,
      v_end_date, v_conclusion_date, v_service_type,
      true, 'crm', now(), now()
    );
  end loop;

  return v_client_id;
end;
$function$;

revoke all on function public.create_client_with_services(jsonb, jsonb) from public, anon, service_role;
grant execute on function public.create_client_with_services(jsonb, jsonb) to authenticated;
