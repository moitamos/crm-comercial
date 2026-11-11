begin;

drop policy if exists portfolios_admin_all on public.portfolios;
create policy portfolios_insert_admin on public.portfolios for insert to authenticated
with check (private.is_admin());
create policy portfolios_update_admin on public.portfolios for update to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy portfolios_delete_admin on public.portfolios for delete to authenticated
using (private.is_admin());

drop policy if exists portfolio_members_admin_all on public.portfolio_members;
create policy portfolio_members_insert_admin on public.portfolio_members for insert to authenticated
with check (private.is_admin());
create policy portfolio_members_update_admin on public.portfolio_members for update to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy portfolio_members_delete_admin on public.portfolio_members for delete to authenticated
using (private.is_admin());

drop index if exists public.deal_services_deal_service_uidx;
create index if not exists clients_portfolio_commercial_idx
  on public.clients(portfolio_id,commercial_id);
create index if not exists portfolios_created_by_idx
  on public.portfolios(created_by);

commit;
