begin;
create unique index if not exists services_client_service_number_uidx
  on public.services (client_id, service_number);
drop policy if exists import_batches_update_owner_admin on public.import_batches;
create policy import_batches_update_owner_admin
on public.import_batches
for update to authenticated
using (private.is_admin() or (private.is_active_user() and created_by = (select auth.uid())))
with check (private.is_admin() or (private.is_active_user() and created_by = (select auth.uid())));
commit;
