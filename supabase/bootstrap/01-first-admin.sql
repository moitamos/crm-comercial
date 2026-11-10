-- Run this once in Supabase SQL Editor after creating your own Auth user.
-- Replace the email below with the exact email used to sign in to the CRM.
-- Do not run this for any other account.
update public.profiles as p
set role = 'admin',
    is_active = true,
    updated_at = now()
from auth.users as u
where u.id = p.id
  and lower(u.email) = lower('SUBSTITUIR_PELO_TEU_EMAIL');

-- Expected result: UPDATE 1.
-- If the result is UPDATE 0, create the Auth user first and run this again.
