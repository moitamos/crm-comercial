-- Run this once after creating your own user in Supabase Authentication > Users.
-- Replace the email below. This promotes only the matching Auth user.
-- The Auth trigger creates the matching profile with role= commercial first.

do $$
declare
  v_admin_id uuid;
  v_profile_id uuid;
  v_portfolio_id uuid;
begin
  select u.id into v_admin_id
  from auth.users u
  where lower(u.email) = lower('SUBSTITUIR_PELO_TEU_EMAIL')
  limit 1;

  if v_admin_id is null then
    raise exception 'Não foi encontrada uma conta Auth com esse email. Cria primeiro o utilizador em Authentication > Users.';
  end if;

  select p.id into v_profile_id
  from public.profiles p
  where p.id = v_admin_id;

  if v_profile_id is null then
    raise exception 'O perfil não foi criado pelo trigger Auth. Confirma a migração crm_schema_hardening_and_auth.';
  end if;

  update public.profiles
  set role = 'admin',
      is_active = true,
      updated_at = now()
  where id = v_admin_id;

  select p.id into v_portfolio_id
  from public.portfolios p
  where p.name = 'Carteira Principal'
  order by case when p.created_by = v_admin_id then 0 else 1 end,
           p.created_at
  limit 1;

  if v_portfolio_id is null then
    insert into public.portfolios (name, description, created_by)
    values ('Carteira Principal', 'Carteira inicial do CRM Comercial.', v_admin_id)
    returning id into v_portfolio_id;
  else
    update public.portfolios
    set created_by = coalesce(created_by, v_admin_id),
        updated_at = now()
    where id = v_portfolio_id;
  end if;

  insert into public.portfolio_members (portfolio_id, user_id)
  values (v_portfolio_id, v_admin_id)
  on conflict (portfolio_id, user_id) do nothing;
end;
$$;

-- Confirm in public.profiles: role='admin', is_active=true.
-- Confirm in public.portfolio_members: one row linking the admin to Carteira Principal.
