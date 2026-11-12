begin;

create or replace function private.delete_deal_activity_entries(
  p_deal_id uuid,
  p_activity_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_old_data jsonb;
  v_requested integer;
  v_deleted integer;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null or not private.is_active_user() then
    raise exception 'Utilizador não autenticado ou inativo';
  end if;

  if not private.can_access_deal(p_deal_id) then
    raise exception 'Não tens acesso a este negócio.';
  end if;

  v_requested := coalesce(cardinality(p_activity_ids), 0);
  if v_requested < 1 or v_requested > 50 then
    raise exception 'Seleciona entre 1 e 50 registos do histórico.';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(i) order by i.occurred_at desc, i.id desc),
    '[]'::jsonb
  )
  into v_old_data
  from public.interactions i
  where i.deal_id = p_deal_id
    and i.id = any(p_activity_ids);

  if jsonb_array_length(v_old_data) <> v_requested then
    raise exception 'Um ou mais registos já não existem ou não pertencem a este negócio.';
  end if;

  insert into public.audit_log (
    actor_id, entity_type, entity_id, action, old_data, new_data, created_at
  ) values (
    v_user_id,
    'deal_activity',
    p_deal_id,
    'delete_entries',
    v_old_data,
    jsonb_build_object('deleted_count', v_requested),
    v_now
  );

  delete from public.interactions
  where deal_id = p_deal_id
    and id = any(p_activity_ids);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

revoke all on function private.delete_deal_activity_entries(uuid, uuid[])
  from public, anon, service_role;
grant execute on function private.delete_deal_activity_entries(uuid, uuid[])
  to authenticated;

create or replace function public.delete_deal_activity_entries(
  p_deal_id uuid,
  p_activity_ids uuid[]
)
returns integer
language sql
security invoker
set search_path = ''
as $function$
  select private.delete_deal_activity_entries(p_deal_id, p_activity_ids);
$function$;

revoke all on function public.delete_deal_activity_entries(uuid, uuid[])
  from public, anon, service_role;
grant execute on function public.delete_deal_activity_entries(uuid, uuid[])
  to authenticated;

commit;
