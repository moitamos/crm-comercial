-- Run this once in Supabase SQL Editor after creating your own Auth user.
-- Replace the email below with the exact email used to sign in to the CRM.
-- This promotes only that account and creates the first private portfolio.

do $$
declare
  v_admin_id uuid;
  v_portfolio_id uuid;
begin
  select u.id
    into v_admin_id
  from auth.users u
  where lower(u.email) = lower('SUBSTITUIR_PELO_TEU_EMAIL')
  limit 1;

  if v_admin_id is null then
    raise exception 'Não foi encontrada uma conta Auth com esse email. Cria primeiro o utilizador em Authentication > Users.';
  end if;

  update public.profiles
  set role = 'admin',
      is_active = true,
      updated_at = now()
  where id = v_admin_id;

  select p.id
    into v_portfolio_id
  from public.portfolios p
  where p.created_by = v_admin_id
    and p.name = 'Carteira Principal'
  order by p.created_at
  limit 1;

  if v_portfolio_id is null then
    insert into public.portfolios (name, description, created_by)
    values ('Carteira Principal', 'Carteira inicial do CRM Comercial.', v_admin_id)
    returning id into v_portfolio_id;
  end if;

  insert into public.portfolio_members (portfolio_id, user_id)
  values (v_portfolio_id, v_admin_id)
  on conflict (portfolio_id, user_id) do nothing;
end;
$$;

-- O SQL Editor deve indicar "Success". Depois, confirma em public.profiles
-- que a tua conta tem role = 'admin' e is_active = true.
