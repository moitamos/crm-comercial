begin;

create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated,service_role;

alter function public.is_active_user() set schema private;
alter function public.is_admin() set schema private;
alter function public.owns_client(uuid) set schema private;
alter function public.can_access_deal(uuid) set schema private;
alter function public.handle_new_auth_user() set schema private;
alter function public.guard_client_owner_change() set schema private;
alter function public.unassign_records_for_inactive_profile() set schema private;

grant execute on function private.is_active_user() to authenticated,service_role;
grant execute on function private.is_admin() to authenticated,service_role;
grant execute on function private.owns_client(uuid) to authenticated,service_role;
grant execute on function private.can_access_deal(uuid) to authenticated,service_role;

revoke all on function private.handle_new_auth_user() from public,anon,authenticated;
revoke all on function private.guard_client_owner_change() from public,anon,authenticated;
revoke all on function private.unassign_records_for_inactive_profile() from public,anon,authenticated;

drop policy if exists import_batches_select_owner_admin on public.import_batches;
create policy import_batches_select_owner_admin on public.import_batches for select to authenticated
using (private.is_admin() or (private.is_active_user() and created_by=(select auth.uid())));
drop policy if exists import_batches_insert_owner on public.import_batches;
create policy import_batches_insert_owner on public.import_batches for insert to authenticated
with check (private.is_active_user() and created_by=(select auth.uid()));

drop policy if exists tasks_select_assigned_admin on public.tasks;
create policy tasks_select_assigned_admin on public.tasks for select to authenticated
using (private.is_admin() or (
  private.is_active_user() and assigned_to=(select auth.uid())
  and (client_id is null or private.owns_client(client_id))
  and (deal_id is null or private.can_access_deal(deal_id))
));
drop policy if exists tasks_insert_assigned_admin on public.tasks;
create policy tasks_insert_assigned_admin on public.tasks for insert to authenticated
with check (private.is_admin() or (
  private.is_active_user() and created_by=(select auth.uid()) and assigned_to=(select auth.uid())
  and (client_id is null or private.owns_client(client_id))
  and (deal_id is null or private.can_access_deal(deal_id))
));
drop policy if exists tasks_update_assigned_admin on public.tasks;
create policy tasks_update_assigned_admin on public.tasks for update to authenticated
using (private.is_admin() or (private.is_active_user() and assigned_to=(select auth.uid())))
with check (private.is_admin() or (
  private.is_active_user() and assigned_to=(select auth.uid())
  and (client_id is null or private.owns_client(client_id))
  and (deal_id is null or private.can_access_deal(deal_id))
));
drop policy if exists tasks_delete_admin on public.tasks;
create policy tasks_delete_admin on public.tasks for delete to authenticated
using (private.is_admin());

commit;
