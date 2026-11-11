create or replace function private.can_access_deal(p_deal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.is_admin() or (
    private.is_active_user()
    and exists (
      select 1
      from public.deals d
      where d.id = p_deal_id
        and d.commercial_id = (select auth.uid())
    )
  );
$function$;

create or replace function private.owns_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.is_admin() or (
    private.is_active_user()
    and exists (
      select 1
      from public.clients c
      where c.id = p_client_id
        and c.commercial_id = (select auth.uid())
    )
  );
$function$;

create or replace function private.guard_client_owner_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if current_setting('crm.allow_internal_unassign', true) = 'on' then
    return new;
  end if;

  if not private.is_admin() then
    if old.commercial_id is distinct from new.commercial_id then
      raise exception 'Apenas um administrador pode transferir clientes entre comerciais.';
    end if;
    if old.portfolio_id is distinct from new.portfolio_id then
      raise exception 'Apenas um administrador pode alterar a carteira do cliente.';
    end if;
    if old.nif is distinct from new.nif then
      raise exception 'O NIF não pode ser alterado por um comercial.';
    end if;
  end if;

  return new;
end;
$function$;
