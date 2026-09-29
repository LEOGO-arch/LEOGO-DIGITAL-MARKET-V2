-- Customer seasonal theme settings. The Customer Front reads only these safe
-- public fields; Admin changes remain permission checked and audited.

alter table public.business_settings
  add column if not exists customer_theme_name text not null default 'LEOGO Default',
  add column if not exists customer_theme_primary text not null default '#071A3A',
  add column if not exists customer_theme_secondary text not null default '#123A76',
  add column if not exists customer_theme_accent text not null default '#FF7800',
  add column if not exists customer_theme_background text not null default '#F5F7FB',
  add column if not exists customer_theme_active boolean not null default true;

alter table public.business_settings
  drop constraint if exists business_settings_customer_theme_colours_check;

alter table public.business_settings
  add constraint business_settings_customer_theme_colours_check check (
    customer_theme_primary ~ '^#[0-9A-Fa-f]{6}$' and
    customer_theme_secondary ~ '^#[0-9A-Fa-f]{6}$' and
    customer_theme_accent ~ '^#[0-9A-Fa-f]{6}$' and
    customer_theme_background ~ '^#[0-9A-Fa-f]{6}$'
  );

create or replace function public.get_public_customer_theme()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', customer_theme_name,
    'primary', customer_theme_primary,
    'secondary', customer_theme_secondary,
    'accent', customer_theme_accent,
    'background', customer_theme_background,
    'active', customer_theme_active,
    'updated_at', updated_at
  )
  from public.business_settings
  where id = 1
$$;

revoke all on function public.get_public_customer_theme() from public;
grant execute on function public.get_public_customer_theme() to anon, authenticated;

create or replace function public.admin_update_customer_theme(p_theme jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(btrim(coalesce(p_theme->>'name', 'LEOGO Default')), 80);
  v_primary text := upper(btrim(coalesce(p_theme->>'primary', '')));
  v_secondary text := upper(btrim(coalesce(p_theme->>'secondary', '')));
  v_accent text := upper(btrim(coalesce(p_theme->>'accent', '')));
  v_background text := upper(btrim(coalesce(p_theme->>'background', '')));
  v_active boolean := coalesce((p_theme->>'active')::boolean, true);
  v_before jsonb;
  v_after jsonb;
begin
  if not private.is_leogo_admin('settings.manage') then
    raise exception 'Settings permission required';
  end if;
  if v_name = '' then raise exception 'Theme name is required'; end if;
  if v_primary !~ '^#[0-9A-F]{6}$'
     or v_secondary !~ '^#[0-9A-F]{6}$'
     or v_accent !~ '^#[0-9A-F]{6}$'
     or v_background !~ '^#[0-9A-F]{6}$' then
    raise exception 'Theme colours must use six-digit hex values';
  end if;

  select jsonb_build_object(
    'name', customer_theme_name,
    'primary', customer_theme_primary,
    'secondary', customer_theme_secondary,
    'accent', customer_theme_accent,
    'background', customer_theme_background,
    'active', customer_theme_active
  ) into v_before
  from public.business_settings where id = 1 for update;

  update public.business_settings set
    customer_theme_name = v_name,
    customer_theme_primary = v_primary,
    customer_theme_secondary = v_secondary,
    customer_theme_accent = v_accent,
    customer_theme_background = v_background,
    customer_theme_active = v_active,
    updated_by = (select auth.uid()),
    updated_at = now()
  where id = 1;

  select public.get_public_customer_theme() into v_after;
  perform private.write_admin_audit('settings.customer_theme.updated','business_settings','1',v_before,v_after);
  return v_after;
end;
$$;

revoke all on function public.admin_update_customer_theme(jsonb) from public, anon;
grant execute on function public.admin_update_customer_theme(jsonb) to authenticated;

comment on function public.get_public_customer_theme() is
  'Returns only non-sensitive Customer Front theme fields from centralized Admin settings.';
