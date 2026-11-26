-- LEOGO DIGITAL MARKET V2 — Admin live property listing controls.
-- "Delete" is a soft removal: it hides the property while preserving viewing/payment history.
alter table public.vacant_house_listings
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists vacant_house_admin_live_management_idx
  on public.vacant_house_listings(approval_status,availability_status,deleted_at,submitted_at desc);

create or replace function public.admin_get_vacant_house_live_listings()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_rows jsonb;
begin
  if not private.is_leogo_admin('approvals.read')
     and not private.is_leogo_admin('approvals.manage')
     and not private.is_leogo_admin('settings.manage')
     and not private.is_leogo_admin('fees.manage') then
    raise exception 'Property listing management permission required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'listing_reference',l.listing_reference,'title',l.title,
    'listing_purpose',l.listing_purpose,'house_type',l.house_type,
    'monthly_rent_kes',l.monthly_rent_kes,'sale_price_kes',l.sale_price_kes,
    'county',l.county,'sub_county',l.sub_county,'area_estate',l.area_estate,
    'approval_status',l.approval_status,'availability_status',l.availability_status,
    'deleted_at',l.deleted_at,'admin_notes',l.admin_notes,'submitted_at',l.submitted_at
  ) order by (l.deleted_at is not null),l.submitted_at desc),'[]'::jsonb)
  into v_rows
  from public.vacant_house_listings l
  where l.approval_status in ('approved','suspended') or l.deleted_at is not null;

  return v_rows;
end
$function$;
revoke all on function public.admin_get_vacant_house_live_listings() from public,anon;
grant execute on function public.admin_get_vacant_house_live_listings() to authenticated;

create or replace function public.admin_manage_vacant_house_listing(
  p_listing_id uuid,
  p_action text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row public.vacant_house_listings%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_event text;
begin
  if not private.is_leogo_admin('approvals.manage') then
    raise exception 'Property approval permission required';
  end if;
  if p_action not in ('suspend','restore','delete') then
    raise exception 'Unsupported property management action';
  end if;

  select * into v_row
  from public.vacant_house_listings
  where id=p_listing_id
  for update;
  if not found then raise exception 'Property listing not found'; end if;
  v_before:=to_jsonb(v_row);

  if p_action='suspend' then
    if v_row.deleted_at is not null then raise exception 'Restore this listing before suspending it'; end if;
    if v_row.approval_status<>'approved' then raise exception 'Only a live approved listing can be suspended'; end if;
    update public.vacant_house_listings
    set approval_status='suspended',
        admin_notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),admin_notes),
        updated_at=now()
    where id=p_listing_id;
    v_event:='vacant_house.listing.suspended';
  elsif p_action='restore' then
    if v_row.deleted_at is null and v_row.approval_status<>'suspended' then
      raise exception 'This property listing is already live';
    end if;
    update public.vacant_house_listings
    set approval_status='approved',
        deleted_at=null,
        deleted_by=null,
        admin_notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),admin_notes),
        updated_at=now()
    where id=p_listing_id;
    v_event:='vacant_house.listing.restored';
  else
    if v_row.deleted_at is not null then raise exception 'This property listing has already been removed'; end if;
    update public.vacant_house_listings
    set approval_status='suspended',
        deleted_at=now(),
        deleted_by=(select auth.uid()),
        admin_notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),admin_notes),
        updated_at=now()
    where id=p_listing_id;
    v_event:='vacant_house.listing.deleted';
  end if;

  select to_jsonb(l) into v_after
  from public.vacant_house_listings l where l.id=p_listing_id;

  perform private.write_admin_audit(
    v_event,'vacant_house_listing',p_listing_id::text,
    v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );

  return jsonb_build_object(
    'success',true,'listing_id',p_listing_id,'action',p_action,
    'approval_status',v_after->>'approval_status','deleted_at',v_after->>'deleted_at'
  );
end
$function$;
revoke all on function public.admin_manage_vacant_house_listing(uuid,text,text) from public,anon;
grant execute on function public.admin_manage_vacant_house_listing(uuid,text,text) to authenticated;

notify pgrst,'reload schema';
