drop policy if exists "Super Admin can read staff document metadata" on public.staff_private_documents;
create policy "Super Admin can read staff document metadata"
on public.staff_private_documents for select
to authenticated
using (private.is_leogo_super_admin());

drop policy if exists "Super Admin can insert staff document metadata" on public.staff_private_documents;
create policy "Super Admin can insert staff document metadata"
on public.staff_private_documents for insert
to authenticated
with check (private.is_leogo_super_admin());

drop policy if exists "Super Admin can update staff document metadata" on public.staff_private_documents;
create policy "Super Admin can update staff document metadata"
on public.staff_private_documents for update
to authenticated
using (private.is_leogo_super_admin())
with check (private.is_leogo_super_admin());

drop policy if exists "Super Admin can delete staff document metadata" on public.staff_private_documents;
create policy "Super Admin can delete staff document metadata"
on public.staff_private_documents for delete
to authenticated
using (private.is_leogo_super_admin());
