-- Transfer LEOGO Super Admin access to the official business login.
-- The previous Admin remains an ordinary customer; customer data is not deleted.

do $$
declare
  v_new_id uuid;
  v_old_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  select id into v_new_id
  from auth.users
  where lower(email) = lower('leogodigitalmarket2@gmail.com');

  select id into v_old_id
  from auth.users
  where lower(email) = lower('vincentozzomondi1997@gmail.com');

  if v_new_id is null then
    raise exception 'The official LEOGO Admin Auth account must exist before transferring access';
  end if;

  select to_jsonb(a) into v_before
  from public.admin_users a
  where a.user_id = v_old_id;

  insert into public.admin_users (
    user_id, display_name, role, status, permissions, created_by
  ) values (
    v_new_id, 'LEOGO Super Admin', 'super_admin', 'active', '{}'::text[], v_old_id
  )
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    role = 'super_admin',
    status = 'active',
    updated_at = now();

  if v_old_id is distinct from v_new_id then
    delete from public.admin_users where user_id = v_old_id;
  end if;

  select to_jsonb(a) into v_after
  from public.admin_users a
  where a.user_id = v_new_id;

  if not exists (
    select 1 from public.admin_audit_log
    where action = 'admin.super_admin.transferred'
      and entity_id = v_new_id::text
  ) then
    insert into public.admin_audit_log (
      actor_id, actor_email, action, entity_type, entity_id,
      before_data, after_data, metadata
    ) values (
      null, 'system-migration', 'admin.super_admin.transferred',
      'admin_user', v_new_id::text, v_before, v_after,
      jsonb_build_object(
        'previous_admin_user_id', v_old_id,
        'reason', 'Owner-requested Admin account replacement'
      )
    );
  end if;
end $$;
