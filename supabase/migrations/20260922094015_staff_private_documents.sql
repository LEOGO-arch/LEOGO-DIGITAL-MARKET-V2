create table if not exists public.staff_private_documents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_kind text not null check (account_kind in ('admin_staff','rider')),
  passport_photo_path text,
  id_picture_path text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_private_documents enable row level security;
revoke all on table public.staff_private_documents from anon, authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'staff-private-documents',
  'staff-private-documents',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Super Admin can view staff private documents" on storage.objects;
create policy "Super Admin can view staff private documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'staff-private-documents'
  and private.is_leogo_super_admin()
);

drop policy if exists "Super Admin can upload staff private documents" on storage.objects;
create policy "Super Admin can upload staff private documents"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'staff-private-documents'
  and private.is_leogo_super_admin()
);

drop policy if exists "Super Admin can update staff private documents" on storage.objects;
create policy "Super Admin can update staff private documents"
on storage.objects for update
to authenticated
using (
  bucket_id = 'staff-private-documents'
  and private.is_leogo_super_admin()
)
with check (
  bucket_id = 'staff-private-documents'
  and private.is_leogo_super_admin()
);

drop policy if exists "Super Admin can delete staff private documents" on storage.objects;
create policy "Super Admin can delete staff private documents"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'staff-private-documents'
  and private.is_leogo_super_admin()
);

create or replace function public.admin_get_staff_documents(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.staff_private_documents%rowtype;
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  select *
  into v_row
  from public.staff_private_documents
  where user_id = p_user_id;

  return jsonb_build_object(
    'user_id', p_user_id,
    'account_kind', v_row.account_kind,
    'passport_photo_path', v_row.passport_photo_path,
    'id_picture_path', v_row.id_picture_path,
    'updated_at', v_row.updated_at
  );
end
$function$;

create or replace function public.admin_set_staff_documents(
  p_user_id uuid,
  p_account_kind text,
  p_passport_photo_path text default null,
  p_id_picture_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  if p_account_kind not in ('admin_staff','rider') then
    raise exception 'Unsupported staff account type';
  end if;

  if p_account_kind = 'admin_staff' then
    if not exists (
      select 1 from public.admin_users
      where user_id = p_user_id and role <> 'super_admin'
    ) then
      raise exception 'Admin staff account not found';
    end if;
  else
    if not exists (
      select 1 from public.leogo_staff
      where user_id = p_user_id
    ) then
      raise exception 'Rider staff account not found';
    end if;
  end if;

  select to_jsonb(d)
  into v_before
  from public.staff_private_documents d
  where d.user_id = p_user_id;

  insert into public.staff_private_documents (
    user_id, account_kind, passport_photo_path, id_picture_path,
    created_by, updated_by, created_at, updated_at
  )
  values (
    p_user_id, p_account_kind,
    nullif(btrim(coalesce(p_passport_photo_path,'')),''),
    nullif(btrim(coalesce(p_id_picture_path,'')),''),
    (select auth.uid()), (select auth.uid()), now(), now()
  )
  on conflict (user_id) do update set
    account_kind = excluded.account_kind,
    passport_photo_path = excluded.passport_photo_path,
    id_picture_path = excluded.id_picture_path,
    updated_by = (select auth.uid()),
    updated_at = now();

  select to_jsonb(d)
  into v_after
  from public.staff_private_documents d
  where d.user_id = p_user_id;

  perform private.write_admin_audit(
    'staff.documents.updated',
    'staff_private_documents',
    p_user_id::text,
    v_before,
    v_after,
    jsonb_build_object('account_kind', p_account_kind)
  );

  return jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'passport_photo_path', v_after->>'passport_photo_path',
    'id_picture_path', v_after->>'id_picture_path'
  );
end
$function$;

revoke execute on function public.admin_get_staff_documents(uuid) from public, anon;
revoke execute on function public.admin_set_staff_documents(uuid,text,text,text) from public, anon;

grant execute on function public.admin_get_staff_documents(uuid) to authenticated;
grant execute on function public.admin_set_staff_documents(uuid,text,text,text) to authenticated;
