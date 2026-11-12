create or replace function private.edit_deal_activity_entry(
  p_deal_id uuid,
  p_activity_id uuid,
  p_description text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_activity public.interactions%rowtype;
  v_new_data jsonb;
  v_description text := btrim(coalesce(p_description, ''));
begin
  if v_user_id is null or not private.is_active_user() then
    raise exception 'Utilizador não autenticado ou inativo';
  end if;

  if not private.can_access_deal(p_deal_id) then
    raise exception 'Não tens acesso a este negócio.';
  end if;

  if v_description = '' then
    raise exception 'A observação não pode ficar vazia.';
  end if;

  if char_length(v_description) > 5000 then
    raise exception 'O texto não pode ultrapassar 5.000 caracteres.';
  end if;

  select *
  into v_activity
  from public.interactions i
  where i.id = p_activity_id
    and i.deal_id = p_deal_id
  for update;

  if not found then
    raise exception 'O registo já não existe ou não pertence a este negócio.';
  end if;

  if v_activity.event_type not in ('observation', 'contact_attempt') then
    raise exception 'Só podes editar observações e tentativas de contacto.';
  end if;

  v_new_data := jsonb_set(
    to_jsonb(v_activity),
    '{description}',
    to_jsonb(v_description),
    true
  );

  insert into public.audit_log (
    actor_id, entity_type, entity_id, action, old_data, new_data, created_at
  ) values (
    v_user_id,
    'deal_activity',
    p_activity_id,
    'edit_entry',
    to_jsonb(v_activity),
    v_new_data,
    clock_timestamp()
  );

  update public.interactions
  set description = v_description
  where id = p_activity_id
    and deal_id = p_deal_id;

  return 1;
end;
$function$;

create or replace function public.edit_deal_activity_entry(
  p_deal_id uuid,
  p_activity_id uuid,
  p_description text
)
returns integer
language sql
set search_path = ''
as $function$
  select private.edit_deal_activity_entry(p_deal_id, p_activity_id, p_description);
$function$;

revoke all on function private.edit_deal_activity_entry(uuid, uuid, text) from public, anon;
grant execute on function private.edit_deal_activity_entry(uuid, uuid, text) to authenticated;

revoke all on function public.edit_deal_activity_entry(uuid, uuid, text) from public, anon;
grant execute on function public.edit_deal_activity_entry(uuid, uuid, text) to authenticated;
