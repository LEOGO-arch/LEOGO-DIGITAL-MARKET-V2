-- Accommodation room categories + atomic room/rate submission.
-- Keeps room submission and rate plans in one transaction so Admin never receives a partial room.

alter table public.accommodation_units
  add column if not exists room_category text;

update public.accommodation_units
set room_category = coalesce(nullif(btrim(room_category),''),'standard')
where room_category is null or btrim(room_category)='';

alter table public.accommodation_units
  alter column room_category set default 'standard',
  alter column room_category set not null;

alter table public.accommodation_units
  drop constraint if exists accommodation_units_room_category_check;

alter table public.accommodation_units
  add constraint accommodation_units_room_category_check
  check (char_length(btrim(room_category)) between 2 and 80);

create or replace function public.accommodation_provider_save_unit_with_rates(
  p_unit_id uuid,
  p_property_id uuid,
  p_room_category text,
  p_unit_name text,
  p_description text,
  p_max_guests smallint,
  p_beds_description text,
  p_inventory_count smallint,
  p_unit_image_url text,
  p_gallery_image_urls text[],
  p_amenities text[],
  p_rates jsonb,
  p_submit boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_host uuid;
  v_id uuid;
  v_existing public.accommodation_units%rowtype;
  v_rate jsonb;
  v_rate_name text;
  v_meal_plan text;
  v_occupancy_type text;
  v_pax integer;
  v_price integer;
  v_base_price integer := null;
  v_has_bed_only boolean := false;
  v_has_bb_1 boolean := false;
  v_has_bb_2 boolean := false;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select id into v_host
  from public.accommodation_hosts
  where user_id=v_uid and verification_status='approved';

  if v_host is null then
    raise exception 'Approved Accommodation Provider account required';
  end if;

  if not exists (
    select 1 from public.accommodation_properties
    where id=p_property_id and host_id=v_host
  ) then
    raise exception 'Property not found';
  end if;

  if char_length(btrim(coalesce(p_room_category,''))) < 2 then
    raise exception 'Room category is required';
  end if;

  if char_length(btrim(coalesce(p_unit_name,''))) < 2 then
    raise exception 'Room / unit name is required';
  end if;

  if coalesce(p_max_guests,0) < 1 then
    raise exception 'Maximum guests must be at least 1';
  end if;

  if coalesce(p_inventory_count,0) < 1 then
    raise exception 'Inventory must be at least 1';
  end if;

  if p_rates is null or jsonb_typeof(p_rates) <> 'array' or jsonb_array_length(p_rates)=0 then
    raise exception 'Add room pricing before submission';
  end if;

  for v_rate in select value from jsonb_array_elements(p_rates)
  loop
    v_rate_name := btrim(coalesce(v_rate->>'rate_name',''));
    v_meal_plan := coalesce(v_rate->>'meal_plan','bed_only');
    v_occupancy_type := coalesce(v_rate->>'occupancy_type','custom');
    v_pax := coalesce((v_rate->>'occupancy_pax')::integer,0);
    v_price := coalesce((v_rate->>'nightly_price_kes')::integer,0);

    if char_length(v_rate_name) < 2 then raise exception 'Every rate plan needs a name'; end if;
    if v_price <= 0 then raise exception 'Every rate plan needs a valid nightly price'; end if;
    if v_pax < 1 or v_pax > p_max_guests then raise exception 'Every rate plan must have a valid pax count within the room maximum'; end if;
    if v_meal_plan not in ('bed_only','bed_breakfast','half_board','full_board','self_catering','other') then raise exception 'Unsupported meal plan'; end if;
    if v_occupancy_type not in ('single','double','triple','family','custom') then raise exception 'Unsupported occupancy type'; end if;

    v_base_price := case when v_base_price is null then v_price else least(v_base_price,v_price) end;
    if v_meal_plan='bed_only' then v_has_bed_only := true; end if;
    if v_meal_plan='bed_breakfast' and v_pax=1 then v_has_bb_1 := true; end if;
    if v_meal_plan='bed_breakfast' and v_pax=2 then v_has_bb_2 := true; end if;
  end loop;

  if not v_has_bed_only then raise exception 'Bed Only price is required'; end if;
  if not v_has_bb_1 then raise exception 'Bed & Breakfast for 1 pax price is required'; end if;
  if p_max_guests >= 2 and not v_has_bb_2 then raise exception 'Bed & Breakfast for 2 pax price is required'; end if;

  if p_unit_id is not null then
    select u.* into v_existing
    from public.accommodation_units u
    join public.accommodation_properties p on p.id=u.property_id
    where u.id=p_unit_id and p.host_id=v_host
    for update;

    if not found then raise exception 'Room / unit not found'; end if;
    if v_existing.approval_status='suspended' then raise exception 'This room / unit is suspended. Contact LEOGO Admin'; end if;

    update public.accommodation_units
    set property_id=p_property_id,
        room_category=btrim(p_room_category),
        unit_name=btrim(p_unit_name),
        description=nullif(btrim(coalesce(p_description,'')),''),
        nightly_price_kes=v_base_price,
        max_guests=p_max_guests,
        beds_description=nullif(btrim(coalesce(p_beds_description,'')),''),
        inventory_count=p_inventory_count,
        unit_image_url=coalesce(nullif(btrim(coalesce(p_unit_image_url,'')),''),unit_image_url),
        gallery_image_urls=case when coalesce(array_length(p_gallery_image_urls,1),0)>0 then p_gallery_image_urls else gallery_image_urls end,
        amenities=coalesce(p_amenities,'{}'),
        approval_status=case when p_submit then 'submitted' else 'draft' end,
        is_active=false,
        submitted_at=case when p_submit then now() else submitted_at end,
        reviewed_at=null,
        reviewed_by=null,
        admin_notes=null,
        updated_at=now()
    where id=p_unit_id
    returning id into v_id;
  else
    insert into public.accommodation_units(
      property_id,room_category,unit_name,description,nightly_price_kes,max_guests,beds_description,
      inventory_count,unit_image_url,gallery_image_urls,amenities,approval_status,is_active,submitted_at
    ) values(
      p_property_id,btrim(p_room_category),btrim(p_unit_name),nullif(btrim(coalesce(p_description,'')),''),
      v_base_price,p_max_guests,nullif(btrim(coalesce(p_beds_description,'')),''),
      p_inventory_count,nullif(btrim(coalesce(p_unit_image_url,'')),''),
      coalesce(p_gallery_image_urls,'{}'),coalesce(p_amenities,'{}'),
      case when p_submit then 'submitted' else 'draft' end,false,
      case when p_submit then now() else null end
    )
    returning id into v_id;
  end if;

  delete from public.accommodation_unit_rates where unit_id=v_id;

  for v_rate in select value from jsonb_array_elements(p_rates)
  loop
    insert into public.accommodation_unit_rates(
      unit_id,rate_name,meal_plan,occupancy_type,occupancy_pax,nightly_price_kes,is_active
    ) values(
      v_id,
      btrim(v_rate->>'rate_name'),
      v_rate->>'meal_plan',
      v_rate->>'occupancy_type',
      (v_rate->>'occupancy_pax')::smallint,
      (v_rate->>'nightly_price_kes')::integer,
      true
    );
  end loop;

  return v_id;
end;
$$;

revoke all on function public.accommodation_provider_save_unit_with_rates(
  uuid,uuid,text,text,text,smallint,text,smallint,text,text[],text[],jsonb,boolean
) from public, anon;

grant execute on function public.accommodation_provider_save_unit_with_rates(
  uuid,uuid,text,text,text,smallint,text,smallint,text,text[],text[],jsonb,boolean
) to authenticated;

create or replace function public.admin_list_accommodation_unit_approvals()
returns table(
  kind text,
  record_id uuid,
  applicant_id uuid,
  applicant_name text,
  applicant_email text,
  title text,
  subtitle text,
  amount_kes numeric,
  status text,
  submitted_at timestamptz,
  payload jsonb
)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_leogo_admin('approvals.read') then
    raise exception 'Admin access required';
  end if;

  return query
  select
    'accommodation_unit'::text,
    u.id,
    h.user_id,
    h.business_name,
    au.email::text,
    'Accommodation Room / Unit'::text,
    p.property_name||' · '||u.room_category||' · '||u.unit_name||' · From KSh '||u.nightly_price_kes::text||'/night',
    u.nightly_price_kes::numeric,
    u.approval_status,
    coalesce(u.submitted_at,u.created_at),
    to_jsonb(u) ||
      jsonb_build_object(
        'property_name',p.property_name,
        'property_status',p.approval_status,
        'host_name',h.business_name,
        'rates',coalesce((
          select jsonb_agg(to_jsonb(r) order by r.nightly_price_kes,r.created_at)
          from public.accommodation_unit_rates r
          where r.unit_id=u.id
        ),'[]'::jsonb)
      )
  from public.accommodation_units u
  join public.accommodation_properties p on p.id=u.property_id
  join public.accommodation_hosts h on h.id=p.host_id
  left join auth.users au on au.id=h.user_id
  where u.approval_status in ('submitted','under_review')
  order by coalesce(u.submitted_at,u.created_at) desc;
end;
$$;
