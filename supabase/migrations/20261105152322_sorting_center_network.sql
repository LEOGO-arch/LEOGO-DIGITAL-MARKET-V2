-- LEOGO Sorting Center Network
-- Additive parcel custody and consolidated shipment records. Existing order,
-- payment, settlement, rider, and pickup-station ledgers remain authoritative.

create sequence if not exists public.sorting_shipment_tracking_seq;

create table if not exists public.sorting_centers (
  id uuid primary key default gen_random_uuid(),
  center_code text not null unique check (center_code ~ '^[A-Z0-9-]{2,20}$'),
  center_name text not null check (char_length(btrim(center_name)) between 2 and 120),
  center_type text not null check (center_type in ('county','sub_county','local_town')),
  parent_center_id uuid references public.sorting_centers(id) on delete restrict,
  county text not null,
  county_code text references public.kenya_counties(code),
  sub_county text,
  sub_county_code text references public.kenya_subcounties(code),
  town text,
  estate text,
  physical_address text not null,
  contact_phone text,
  operating_hours jsonb not null default '{}'::jsonb,
  can_receive boolean not null default true,
  can_dispatch boolean not null default true,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((center_type='county' and parent_center_id is null) or center_type<>'county'),
  check (center_type<>'sub_county' or sub_county is not null),
  check (center_type<>'local_town' or town is not null)
);

create table if not exists public.sorting_center_routes (
  id uuid primary key default gen_random_uuid(),
  origin_center_id uuid not null references public.sorting_centers(id) on delete restrict,
  destination_center_id uuid not null references public.sorting_centers(id) on delete restrict,
  estimated_hours numeric(8,2) check (estimated_hours is null or estimated_hours > 0),
  is_active boolean not null default true,
  configured_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (origin_center_id,destination_center_id),
  check (origin_center_id<>destination_center_id)
);

create table if not exists public.sorting_center_staff (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.sorting_centers(id) on delete restrict,
  user_id uuid not null references public.leogo_staff(user_id) on delete cascade,
  role text not null check (role in ('manager','supervisor','receiving_officer','sorting_packing_officer','dispatch_officer')),
  is_active boolean not null default true,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (center_id,user_id)
);

create table if not exists public.sorting_parcels (
  id uuid primary key default gen_random_uuid(),
  parcel_reference text not null unique default ('LGP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  seller_order_id uuid not null unique references public.marketplace_seller_orders(id) on delete restrict,
  delivery_job_id uuid references public.marketplace_delivery_jobs(id) on delete set null,
  origin_center_id uuid not null references public.sorting_centers(id) on delete restrict,
  current_center_id uuid references public.sorting_centers(id) on delete restrict,
  destination_center_id uuid references public.sorting_centers(id) on delete restrict,
  package_weight_kg numeric(10,3) check (package_weight_kg is null or package_weight_kg > 0),
  status text not null default 'booked' check (status in (
    'booked','seller_handed_over','received','sorted','in_transit',
    'received_next_center','ready_for_last_mile','handed_to_rider',
    'delivered','exception','cancelled'
  )),
  booked_by uuid not null references auth.users(id) on delete restrict,
  booked_at timestamptz not null default now(),
  current_shipment_id uuid,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sorting_shipments (
  id uuid primary key default gen_random_uuid(),
  tracking_number text not null unique,
  origin_center_id uuid not null references public.sorting_centers(id) on delete restrict,
  destination_center_id uuid not null references public.sorting_centers(id) on delete restrict,
  status text not null default 'building' check (status in ('building','dispatched','in_transit','received','exception','cancelled')),
  assigned_transport_provider_id uuid references public.transport_provider_accounts(user_id) on delete set null,
  prepared_by uuid not null references auth.users(id) on delete restrict,
  verified_by uuid references auth.users(id) on delete set null,
  dispatched_by uuid references auth.users(id) on delete set null,
  received_by uuid references auth.users(id) on delete set null,
  dispatch_remarks text,
  receive_remarks text,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  received_at timestamptz,
  updated_at timestamptz not null default now(),
  check (origin_center_id<>destination_center_id)
);

create table if not exists public.sorting_shipment_parcels (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.sorting_shipments(id) on delete restrict,
  parcel_id uuid not null references public.sorting_parcels(id) on delete restrict,
  is_active boolean not null default true,
  added_by uuid not null references auth.users(id) on delete restrict,
  added_at timestamptz not null default now(),
  released_at timestamptz,
  unique (shipment_id,parcel_id)
);

create unique index if not exists sorting_shipment_parcels_one_active_per_parcel
  on public.sorting_shipment_parcels(parcel_id) where is_active;

create table if not exists public.sorting_parcel_events (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references public.sorting_parcels(id) on delete restrict,
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  shipment_id uuid references public.sorting_shipments(id) on delete restrict,
  event_type text not null check (event_type in (
    'booked','seller_handover','center_received','sorted','shipment_created',
    'shipment_dispatched','shipment_received','last_mile_assigned',
    'out_for_delivery','delivered','incident_reported','route_changed'
  )),
  from_center_id uuid references public.sorting_centers(id) on delete restrict,
  to_center_id uuid references public.sorting_centers(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_label text,
  verified boolean not null default false,
  evidence_photo_path text,
  remarks text,
  created_at timestamptz not null default now()
);

create table if not exists public.sorting_parcel_incidents (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid references public.sorting_parcels(id) on delete restrict,
  shipment_id uuid references public.sorting_shipments(id) on delete restrict,
  center_id uuid not null references public.sorting_centers(id) on delete restrict,
  incident_type text not null check (incident_type in ('missing','damaged','incorrect_route','count_mismatch','other')),
  details text not null check (char_length(btrim(details)) between 3 and 2000),
  reported_by uuid not null references auth.users(id) on delete restrict,
  evidence_photo_path text,
  status text not null default 'open' check (status in ('open','investigating','resolved')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (parcel_id is not null or shipment_id is not null)
);

create index if not exists sorting_parcels_center_status_idx on public.sorting_parcels(current_center_id,status,updated_at desc);
create index if not exists sorting_parcels_destination_idx on public.sorting_parcels(destination_center_id,status);
create index if not exists sorting_shipments_route_status_idx on public.sorting_shipments(origin_center_id,destination_center_id,status,created_at desc);
create index if not exists sorting_parcel_events_order_created_idx on public.sorting_parcel_events(order_id,created_at);
create index if not exists sorting_center_staff_user_active_idx on public.sorting_center_staff(user_id,is_active);

alter table public.sorting_centers enable row level security;
alter table public.sorting_center_routes enable row level security;
alter table public.sorting_center_staff enable row level security;
alter table public.sorting_parcels enable row level security;
alter table public.sorting_shipments enable row level security;
alter table public.sorting_shipment_parcels enable row level security;
alter table public.sorting_parcel_events enable row level security;
alter table public.sorting_parcel_incidents enable row level security;

revoke all on public.sorting_centers,public.sorting_center_routes,public.sorting_center_staff,
  public.sorting_parcels,public.sorting_shipments,public.sorting_shipment_parcels,
  public.sorting_parcel_events,public.sorting_parcel_incidents from public,anon,authenticated;

create or replace function private.sorting_center_has_access(p_center_id uuid,p_operation text default 'read')
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select (select auth.uid()) is not null and (
    private.is_leogo_admin('delivery.manage')
    or private.is_leogo_admin('orders.manage')
    or exists (
      select 1 from public.sorting_center_staff a
      join public.leogo_staff s on s.user_id=a.user_id
      where a.user_id=(select auth.uid()) and a.center_id=p_center_id
        and a.is_active and s.status='active'
        and (a.role in ('manager','supervisor')
          or p_operation='read'
          or (p_operation='receive' and a.role='receiving_officer')
          or (p_operation='sort' and a.role='sorting_packing_officer')
          or (p_operation='dispatch' and a.role='dispatch_officer'))
    )
  );
$function$;

revoke all on function private.sorting_center_has_access(uuid,text) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.sorting_center_has_access(uuid,text) to authenticated;

create or replace function public.admin_sorting_center_save(p_payload jsonb)
returns public.sorting_centers
language plpgsql
security definer
set search_path=''
as $function$
declare v_id uuid; v_before jsonb; v_row public.sorting_centers%rowtype; v_type text;
begin
  if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required'; end if;
  v_id:=nullif(p_payload->>'id','')::uuid;
  v_type:=p_payload->>'center_type';
  if v_type is null or v_type not in ('county','sub_county','local_town') then raise exception 'Choose a supported sorting center type'; end if;
  if v_id is not null then select to_jsonb(c) into v_before from public.sorting_centers c where c.id=v_id for update; end if;
  if v_id is not null and v_before is null then raise exception 'Sorting center not found'; end if;
  if v_type='county' and nullif(p_payload->>'parent_center_id','') is not null then raise exception 'County centers cannot have a parent'; end if;
  if v_type='sub_county' and not exists(select 1 from public.sorting_centers p where p.id=nullif(p_payload->>'parent_center_id','')::uuid and p.center_type='county' and p.county=p_payload->>'county') then raise exception 'Sub-county center must be linked to a county center in the same county'; end if;
  if v_type='local_town' and nullif(p_payload->>'parent_center_id','') is not null and not exists(select 1 from public.sorting_centers p where p.id=(p_payload->>'parent_center_id')::uuid and p.center_type in ('county','sub_county') and p.county=p_payload->>'county') then raise exception 'Local center parent must be in the same county'; end if;
  insert into public.sorting_centers(id,center_code,center_name,center_type,parent_center_id,county,county_code,sub_county,sub_county_code,town,estate,physical_address,contact_phone,operating_hours,can_receive,can_dispatch,is_active,created_by,updated_by,updated_at)
  values(coalesce(v_id,gen_random_uuid()),upper(btrim(p_payload->>'center_code')),btrim(p_payload->>'center_name'),v_type,nullif(p_payload->>'parent_center_id','')::uuid,btrim(p_payload->>'county'),nullif(p_payload->>'county_code',''),nullif(btrim(p_payload->>'sub_county'),''),nullif(p_payload->>'sub_county_code',''),nullif(btrim(p_payload->>'town'),''),nullif(btrim(p_payload->>'estate'),''),btrim(p_payload->>'physical_address'),nullif(btrim(p_payload->>'contact_phone'),''),coalesce(p_payload->'operating_hours','{}'::jsonb),coalesce((p_payload->>'can_receive')::boolean,true),coalesce((p_payload->>'can_dispatch')::boolean,true),coalesce((p_payload->>'is_active')::boolean,true),coalesce((select auth.uid()),(select auth.uid())),(select auth.uid()),now())
  on conflict(id) do update set center_code=excluded.center_code,center_name=excluded.center_name,center_type=excluded.center_type,parent_center_id=excluded.parent_center_id,county=excluded.county,county_code=excluded.county_code,sub_county=excluded.sub_county,sub_county_code=excluded.sub_county_code,town=excluded.town,estate=excluded.estate,physical_address=excluded.physical_address,contact_phone=excluded.contact_phone,operating_hours=excluded.operating_hours,can_receive=excluded.can_receive,can_dispatch=excluded.can_dispatch,is_active=excluded.is_active,updated_by=(select auth.uid()),updated_at=now()
  returning * into v_row;
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,before_data,after_data,metadata)
  values((select auth.uid()),case when v_before is null then 'sorting.center.created' else 'sorting.center.updated' end,'sorting_center',v_row.id::text,v_before,to_jsonb(v_row),jsonb_build_object('center_code',v_row.center_code));
  return v_row;
end
$function$;

create or replace function public.admin_sorting_center_assign_staff(p_center_id uuid,p_user_id uuid,p_role text,p_active boolean default true)
returns uuid
language plpgsql security definer set search_path=''
as $function$
declare v_id uuid; v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required'; end if;
  if p_role not in ('manager','supervisor','receiving_officer','sorting_packing_officer','dispatch_officer') then raise exception 'Unsupported sorting center staff role'; end if;
  if not exists(select 1 from public.sorting_centers where id=p_center_id and is_active) then raise exception 'Active sorting center required'; end if;
  if p_active and not exists(select 1 from public.leogo_staff where user_id=p_user_id and status='active') then raise exception 'Create and activate this LEOGO Staff account before assigning a center role'; end if;
  select a.id,to_jsonb(a) into v_id,v_before from public.sorting_center_staff a where a.center_id=p_center_id and a.user_id=p_user_id for update;
  insert into public.sorting_center_staff(center_id,user_id,role,is_active,assigned_by,updated_at)
  values(p_center_id,p_user_id,p_role,p_active,(select auth.uid()),now())
  on conflict(center_id,user_id) do update set role=excluded.role,is_active=excluded.is_active,assigned_by=excluded.assigned_by,updated_at=now()
  returning id,to_jsonb(sorting_center_staff) into v_id,v_after;
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,before_data,after_data,metadata)
  values((select auth.uid()),'sorting.center.staff_assigned','sorting_center_staff',v_id::text,v_before,v_after,jsonb_build_object('center_id',p_center_id,'user_id',p_user_id));
  return v_id;
end
$function$;

create or replace function public.admin_sorting_center_set_route(p_origin_center_id uuid,p_destination_center_id uuid,p_estimated_hours numeric,p_active boolean default true)
returns uuid
language plpgsql security definer set search_path=''
as $function$
declare v_id uuid;
begin
  if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required'; end if;
  if not exists(select 1 from public.sorting_centers where id=p_origin_center_id and is_active and can_dispatch) then raise exception 'Active dispatching origin center required'; end if;
  if not exists(select 1 from public.sorting_centers where id=p_destination_center_id and is_active and can_receive) then raise exception 'Active receiving destination center required'; end if;
  insert into public.sorting_center_routes(origin_center_id,destination_center_id,estimated_hours,is_active,configured_by,updated_at)
  values(p_origin_center_id,p_destination_center_id,p_estimated_hours,p_active,(select auth.uid()),now())
  on conflict(origin_center_id,destination_center_id) do update set estimated_hours=excluded.estimated_hours,is_active=excluded.is_active,configured_by=excluded.configured_by,updated_at=now()
  returning id into v_id;
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,after_data,metadata)
  values((select auth.uid()),'sorting.route.configured','sorting_center_route',v_id::text,to_jsonb((select r from public.sorting_center_routes r where r.id=v_id)),jsonb_build_object('origin_center_id',p_origin_center_id,'destination_center_id',p_destination_center_id));
  return v_id;
end
$function$;

create or replace function public.admin_sorting_center_list()
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_rows jsonb;
begin
  if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required'; end if;
  select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('parent_name',p.center_name,'staff_count',(select count(*) from public.sorting_center_staff s where s.center_id=c.id and s.is_active),'route_count',(select count(*) from public.sorting_center_routes r where r.origin_center_id=c.id and r.is_active)) order by c.county,c.center_type,c.center_name), '[]'::jsonb)
  into v_rows from public.sorting_centers c left join public.sorting_centers p on p.id=c.parent_center_id;
  return v_rows;
end
$function$;

create or replace function public.admin_sorting_center_directory()
returns jsonb language plpgsql security definer set search_path=''
as $function$
begin
  if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required'; end if;
  return jsonb_build_object(
    'staff',(select coalesce(jsonb_agg(jsonb_build_object('user_id',s.user_id,'display_name',s.display_name,'phone',s.phone,'staff_role',s.staff_role) order by s.display_name),'[]'::jsonb) from public.leogo_staff s where s.status='active'),
    'routes',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('origin_name',o.center_name,'destination_name',d.center_name) order by o.center_name,d.center_name),'[]'::jsonb) from public.sorting_center_routes r join public.sorting_centers o on o.id=r.origin_center_id join public.sorting_centers d on d.id=r.destination_center_id)
  );
end
$function$;

create or replace function public.seller_sorting_center_options()
returns table(center_id uuid,center_code text,center_name text,center_type text,county text,sub_county text,town text,physical_address text)
language plpgsql security definer set search_path=''
as $function$
declare v_seller public.seller_accounts%rowtype;
begin
  select * into v_seller from public.seller_accounts s where s.user_id=(select auth.uid()) and s.application_status='approved';
  if not found then raise exception 'Approved Seller account required'; end if;
  return query select c.id,c.center_code,c.center_name,c.center_type,c.county,c.sub_county,c.town,c.physical_address
    from public.sorting_centers c
    where c.is_active and c.can_receive and c.county=v_seller.county
      and (c.center_type='county' or c.sub_county is null or v_seller.sub_county is null or lower(c.sub_county)=lower(v_seller.sub_county))
    order by case when c.center_type='local_town' and lower(coalesce(c.town,''))=lower(v_seller.town) then 0 when c.center_type='sub_county' then 1 when c.center_type='county' then 2 else 3 end,c.center_name;
end
$function$;

create or replace function public.seller_book_order_to_sorting_center(p_seller_order_id uuid,p_center_id uuid,p_weight_kg numeric default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=(select auth.uid()); v_so public.marketplace_seller_orders%rowtype; v_o public.marketplace_orders%rowtype; v_c public.sorting_centers%rowtype; v_p public.sorting_parcels%rowtype; v_job uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select * into v_so from public.marketplace_seller_orders where id=p_seller_order_id and seller_id=v_uid for update;
  if not found then raise exception 'Seller order not found'; end if;
  if v_so.fulfilment_status<>'packed_ready' then raise exception 'Mark the order Packed & Ready before booking it'; end if;
  select * into v_o from public.marketplace_orders where id=v_so.order_id for update;
  if not found or v_o.order_status in ('cancelled','delivered') then raise exception 'This order cannot be booked for dispatch'; end if;
  select * into v_c from public.sorting_centers where id=p_center_id and is_active and can_receive;
  if not found then raise exception 'Choose an active receiving sorting center'; end if;
  if not exists(select 1 from public.seller_accounts s where s.user_id=v_uid and s.application_status='approved' and s.county=v_c.county and (v_c.center_type='county' or v_c.sub_county is null or s.sub_county is null or lower(s.sub_county)=lower(v_c.sub_county))) then raise exception 'Selected center is outside the seller collection area'; end if;
  if exists(select 1 from public.sorting_parcels where seller_order_id=v_so.id and status<>'cancelled') then raise exception 'This seller order already has an active sorting parcel'; end if;
  select id into v_job from public.marketplace_delivery_jobs where order_id=v_o.id;
  insert into public.sorting_parcels(order_id,seller_order_id,delivery_job_id,origin_center_id,current_center_id,status,booked_by,package_weight_kg)
  values(v_o.id,v_so.id,v_job,v_c.id,v_c.id,'booked',v_uid,p_weight_kg) returning * into v_p;
  insert into public.sorting_parcel_events(parcel_id,order_id,event_type,to_center_id,actor_user_id,actor_label,verified,remarks)
  values(v_p.id,v_o.id,'booked',v_c.id,v_uid,'Seller',true,'Parcel booked by seller. Physical receipt is still pending.');
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,after_data,metadata)
  values(v_uid,'sorting.parcel.booked','sorting_parcel',v_p.id::text,jsonb_build_object('order_id',v_o.id,'center_id',v_c.id,'status','booked'),jsonb_build_object('seller_order_id',v_so.id));
  return jsonb_build_object('parcel_id',v_p.id,'parcel_reference',v_p.parcel_reference,'order_reference',v_o.order_reference,'center_id',v_c.id,'center_name',v_c.center_name,'status',v_p.status);
end
$function$;

create or replace function public.seller_confirm_sorting_center_handover(p_parcel_id uuid,p_remarks text default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=(select auth.uid()); v_p public.sorting_parcels%rowtype; v_o public.marketplace_orders%rowtype;
begin
  select p.* into v_p from public.sorting_parcels p join public.marketplace_seller_orders so on so.id=p.seller_order_id where p.id=p_parcel_id and so.seller_id=v_uid for update of p;
  if not found then raise exception 'Parcel not found for this Seller'; end if;
  if v_p.status<>'booked' then raise exception 'Only a booked parcel can be handed over'; end if;
  update public.sorting_parcels set status='seller_handed_over',updated_at=now() where id=v_p.id;
  select * into v_o from public.marketplace_orders where id=v_p.order_id;
  insert into public.sorting_parcel_events(parcel_id,order_id,event_type,from_center_id,to_center_id,actor_user_id,actor_label,verified,remarks)
  values(v_p.id,v_p.order_id,'seller_handover',v_p.origin_center_id,v_p.origin_center_id,v_uid,'Seller',true,nullif(btrim(p_remarks),''));
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,after_data,metadata)
  values(v_uid,'sorting.parcel.seller_handover','sorting_parcel',v_p.id::text,jsonb_build_object('status','seller_handed_over'),jsonb_build_object('order_reference',v_o.order_reference));
  return jsonb_build_object('ok',true,'status','seller_handed_over','parcel_reference',v_p.parcel_reference);
end
$function$;

create or replace function public.sorting_staff_get_centers()
returns jsonb language plpgsql security definer set search_path=''
as $function$
begin
  if (select auth.uid()) is null or not exists(select 1 from public.leogo_staff where user_id=(select auth.uid()) and status='active') then raise exception 'Active LEOGO Staff account required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('center_id',c.id,'center_code',c.center_code,'center_name',c.center_name,'center_type',c.center_type,'county',c.county,'sub_county',c.sub_county,'town',c.town,'role',a.role,'can_receive',c.can_receive,'can_dispatch',c.can_dispatch) order by c.center_name)
    from public.sorting_center_staff a join public.sorting_centers c on c.id=a.center_id where a.user_id=(select auth.uid()) and a.is_active and c.is_active),'[]'::jsonb);
end
$function$;

create or replace function public.sorting_staff_list_parcels(p_center_id uuid,p_search text default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_rows jsonb;
begin
  if not private.sorting_center_has_access(p_center_id,'read') then raise exception 'Sorting center access required'; end if;
  select coalesce(jsonb_agg(row_data order by created_at desc),'[]'::jsonb) into v_rows from (
    select p.created_at,jsonb_build_object('parcel_id',p.id,'parcel_reference',p.parcel_reference,'status',p.status,'order_id',o.id,'order_reference',o.order_reference,'seller_order_id',p.seller_order_id,'seller_name',sa.business_name,'seller_phone',sa.phone,'customer_name',o.receiver_name,'customer_phone',o.contact_number,'county',o.county,'sub_county',o.sub_county,'estate',o.estate,'destination_center_id',p.destination_center_id,'destination_center_name',dc.center_name,'shipment_tracking_number',sh.tracking_number,'package_weight_kg',p.package_weight_kg,'booked_at',p.booked_at,'updated_at',p.updated_at) row_data
    from public.sorting_parcels p join public.marketplace_orders o on o.id=p.order_id join public.marketplace_seller_orders so on so.id=p.seller_order_id join public.seller_accounts sa on sa.user_id=so.seller_id left join public.sorting_centers dc on dc.id=p.destination_center_id left join public.sorting_shipments sh on sh.id=p.current_shipment_id
    where p.current_center_id=p_center_id and (nullif(btrim(coalesce(p_search,'')),'') is null or concat_ws(' ',p.parcel_reference,o.order_reference,o.receiver_name,sa.business_name,o.county,o.sub_county,sh.tracking_number) ilike '%'||btrim(p_search)||'%')
  ) x;
  return v_rows;
end
$function$;

create or replace function public.sorting_staff_record_parcel(p_parcel_id uuid,p_action text,p_destination_center_id uuid default null,p_photo_path text default null,p_remarks text default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=(select auth.uid()); v_p public.sorting_parcels%rowtype; v_o public.marketplace_orders%rowtype; v_center public.sorting_centers%rowtype; v_dest public.sorting_centers%rowtype; v_event text; v_status text;
begin
  select * into v_p from public.sorting_parcels where id=p_parcel_id for update;
  if not found or v_p.current_center_id is null then raise exception 'Parcel is not assigned to an active sorting center'; end if;
  select * into v_center from public.sorting_centers where id=v_p.current_center_id;
  if p_action='receive' then
    if not private.sorting_center_has_access(v_center.id,'receive') then raise exception 'Receiving permission required'; end if;
    if v_p.status<>'seller_handed_over' then raise exception 'Seller handover must be recorded before physical receipt'; end if;
    v_status:='received'; v_event:='center_received';
  elsif p_action='sort' then
    if not private.sorting_center_has_access(v_center.id,'sort') then raise exception 'Sorting permission required'; end if;
    if v_p.status<>'received' then raise exception 'Only a physically received parcel can be sorted'; end if;
    if p_destination_center_id is null then raise exception 'Choose the next sorting center'; end if;
    select * into v_dest from public.sorting_centers where id=p_destination_center_id and is_active and can_receive;
    if not found then raise exception 'Choose an active receiving destination center'; end if;
    if v_dest.id=v_center.id or v_dest.county<>(select o.county from public.marketplace_orders o where o.id=v_p.order_id) then raise exception 'Destination center must serve the order destination county'; end if;
    if not exists(select 1 from public.sorting_center_routes r where r.origin_center_id=v_center.id and r.destination_center_id=v_dest.id and r.is_active) then raise exception 'This center route is not configured by Admin'; end if;
    v_status:='sorted'; v_event:='sorted';
  elsif p_action='mark_ready_for_last_mile' then
    if not private.sorting_center_has_access(v_center.id,'dispatch') then raise exception 'Dispatch permission required'; end if;
    if v_p.status not in ('received','sorted','received_next_center') then raise exception 'Parcel must be received and sorted before last-mile preparation'; end if;
    if not exists(select 1 from public.sorting_centers c where c.id=v_center.id and c.county=(select o.county from public.marketplace_orders o where o.id=v_p.order_id) and (c.sub_county is null or c.sub_county=(select o.sub_county from public.marketplace_orders o where o.id=v_p.order_id))) then raise exception 'This center does not serve the parcel destination'; end if;
    v_status:='ready_for_last_mile'; v_event:='sorted';
  else raise exception 'Unsupported parcel operation'; end if;
  update public.sorting_parcels set status=v_status,destination_center_id=case when p_action='sort' then p_destination_center_id else destination_center_id end,updated_at=now() where id=v_p.id;
  select * into v_o from public.marketplace_orders where id=v_p.order_id;
  insert into public.sorting_parcel_events(parcel_id,order_id,event_type,from_center_id,to_center_id,actor_user_id,actor_label,verified,evidence_photo_path,remarks)
  values(v_p.id,v_p.order_id,v_event,v_center.id,case when p_action='sort' then p_destination_center_id else v_center.id end,v_uid,(select display_name from public.leogo_staff where user_id=v_uid),true,p_photo_path,nullif(btrim(p_remarks),''));
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,before_data,after_data,metadata)
  values(v_uid,'sorting.parcel.'||p_action,'sorting_parcel',v_p.id::text,jsonb_build_object('status',v_p.status,'center_id',v_center.id),jsonb_build_object('status',v_status,'destination_center_id',case when p_action='sort' then p_destination_center_id else v_p.destination_center_id end),jsonb_build_object('order_reference',v_o.order_reference));
  return jsonb_build_object('ok',true,'status',v_status,'parcel_reference',v_p.parcel_reference,'order_reference',v_o.order_reference);
end
$function$;

create or replace function public.sorting_staff_create_shipment(p_origin_center_id uuid,p_destination_center_id uuid,p_parcel_ids uuid[])
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=(select auth.uid()); v_origin public.sorting_centers%rowtype; v_dest public.sorting_centers%rowtype; v_id uuid; v_tracking text; v_count int;
begin
  if not private.sorting_center_has_access(p_origin_center_id,'dispatch') then raise exception 'Dispatch permission required at origin center'; end if;
  select * into v_origin from public.sorting_centers where id=p_origin_center_id and is_active and can_dispatch;
  if not found then raise exception 'Active dispatching origin center required'; end if;
  select * into v_dest from public.sorting_centers where id=p_destination_center_id and is_active and can_receive;
  if not found or v_origin.id=v_dest.id then raise exception 'Choose a different active receiving destination center'; end if;
  if not exists(select 1 from public.sorting_center_routes r where r.origin_center_id=v_origin.id and r.destination_center_id=v_dest.id and r.is_active) then raise exception 'This center route is not configured by Admin'; end if;
  if p_parcel_ids is null or cardinality(p_parcel_ids)=0 or cardinality(p_parcel_ids)>200 then raise exception 'Select between 1 and 200 parcels'; end if;
  if cardinality(p_parcel_ids)<>(select count(distinct x) from unnest(p_parcel_ids) x) then raise exception 'Duplicate parcels are not allowed in a shipment'; end if;
  perform p.id from public.sorting_parcels p where p.id=any(p_parcel_ids) order by p.id for update;
  select count(*) into v_count from public.sorting_parcels p where p.id=any(p_parcel_ids) and p.current_center_id=v_origin.id and p.status in ('sorted','received_next_center') and p.destination_center_id=v_dest.id and not exists(select 1 from public.sorting_shipment_parcels sp where sp.parcel_id=p.id and sp.is_active);
  if v_count<>cardinality(p_parcel_ids) then raise exception 'Every selected parcel must be sorted at this origin for this destination and not active in another shipment'; end if;
  v_tracking:='LGS-'||upper(v_origin.center_code)||'-'||upper(v_dest.center_code)||'-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.sorting_shipment_tracking_seq')::text,5,'0');
  insert into public.sorting_shipments(tracking_number,origin_center_id,destination_center_id,prepared_by)
  values(v_tracking,v_origin.id,v_dest.id,v_uid) returning id into v_id;
  insert into public.sorting_shipment_parcels(shipment_id,parcel_id,added_by) select v_id,x,v_uid from unnest(p_parcel_ids) x;
  update public.sorting_parcels set current_shipment_id=v_id,updated_at=now() where id=any(p_parcel_ids);
  insert into public.sorting_parcel_events(parcel_id,order_id,shipment_id,event_type,from_center_id,to_center_id,actor_user_id,actor_label,verified)
  select p.id,p.order_id,v_id,'shipment_created',v_origin.id,v_dest.id,v_uid,(select display_name from public.leogo_staff where user_id=v_uid),true from public.sorting_parcels p where p.id=any(p_parcel_ids);
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,after_data,metadata)
  values(v_uid,'sorting.shipment.created','sorting_shipment',v_id::text,jsonb_build_object('tracking_number',v_tracking,'origin_center_id',v_origin.id,'destination_center_id',v_dest.id,'parcel_count',v_count),jsonb_build_object('parcel_ids',to_jsonb(p_parcel_ids)));
  return jsonb_build_object('shipment_id',v_id,'tracking_number',v_tracking,'origin_center',v_origin.center_name,'destination_center',v_dest.center_name,'parcel_count',v_count,'status','building');
end
$function$;

create or replace function public.sorting_staff_update_shipment(p_shipment_id uuid,p_action text,p_transport_provider_id uuid default null,p_remarks text default null,p_received_parcel_ids uuid[] default null,p_damaged_parcel_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=(select auth.uid()); v_sh public.sorting_shipments%rowtype; v_center_id uuid; v_expected int; v_actual int; v_damaged int;
begin
  select * into v_sh from public.sorting_shipments where id=p_shipment_id for update;
  if not found then raise exception 'Shipment not found'; end if;
  if p_action='dispatch' then
    v_center_id:=v_sh.origin_center_id;
    if not private.sorting_center_has_access(v_center_id,'dispatch') then raise exception 'Dispatch permission required at origin center'; end if;
    if v_sh.status<>'building' then raise exception 'Only a prepared shipment can be dispatched'; end if;
    if v_sh.verified_by is null or v_sh.verified_by=v_uid then raise exception 'A different authorized staff member must verify the shipment before dispatch'; end if;
    if not exists(select 1 from public.sorting_center_routes where origin_center_id=v_sh.origin_center_id and destination_center_id=v_sh.destination_center_id and is_active) then raise exception 'Configured route is required'; end if;
    if not exists(select 1 from public.sorting_shipment_parcels sp join public.sorting_parcels p on p.id=sp.parcel_id where sp.shipment_id=v_sh.id and sp.is_active and p.current_shipment_id=v_sh.id and p.status in ('sorted','received_next_center')) then raise exception 'Shipment has no valid active parcels'; end if;
    if p_transport_provider_id is not null and not exists(select 1 from public.transport_provider_accounts a where a.user_id=p_transport_provider_id and a.application_status='approved') then raise exception 'Choose an approved transport provider'; end if;
    update public.sorting_shipments set status='in_transit',assigned_transport_provider_id=p_transport_provider_id,dispatched_by=v_uid,dispatch_remarks=nullif(btrim(p_remarks),''),dispatched_at=now(),updated_at=now() where id=v_sh.id;
    update public.sorting_parcels p set status='in_transit',updated_at=now() from public.sorting_shipment_parcels sp where sp.shipment_id=v_sh.id and sp.parcel_id=p.id and sp.is_active;
    insert into public.sorting_parcel_events(parcel_id,order_id,shipment_id,event_type,from_center_id,to_center_id,actor_user_id,actor_label,verified,remarks)
      select p.id,p.order_id,v_sh.id,'shipment_dispatched',v_sh.origin_center_id,v_sh.destination_center_id,v_uid,(select display_name from public.leogo_staff where user_id=v_uid),true,nullif(btrim(p_remarks),'') from public.sorting_shipment_parcels sp join public.sorting_parcels p on p.id=sp.parcel_id where sp.shipment_id=v_sh.id and sp.is_active;
  elsif p_action='receive' then
    v_center_id:=v_sh.destination_center_id;
    if not private.sorting_center_has_access(v_center_id,'receive') then raise exception 'Receiving permission required at destination center'; end if;
    if v_sh.status<>'in_transit' then raise exception 'Only an in-transit shipment can be received'; end if;
    select count(*) into v_expected from public.sorting_shipment_parcels where shipment_id=v_sh.id and is_active;
    if p_received_parcel_ids is null then raise exception 'Scan or select the individual parcels physically received'; end if;
    if cardinality(p_received_parcel_ids)<>(select count(distinct x) from unnest(p_received_parcel_ids) x) then raise exception 'Duplicate parcel scans are not allowed'; end if;
    if exists(select 1 from unnest(p_received_parcel_ids) x where not exists(select 1 from public.sorting_shipment_parcels sp where sp.shipment_id=v_sh.id and sp.parcel_id=x and sp.is_active)) then raise exception 'A scanned parcel is not part of this shipment manifest'; end if;
    if exists(select 1 from unnest(coalesce(p_damaged_parcel_ids,'{}'::uuid[])) x where not x=any(p_received_parcel_ids)) then raise exception 'Damaged parcels must also be recorded as physically received'; end if;
    if exists(select 1 from unnest(coalesce(p_damaged_parcel_ids,'{}'::uuid[])) x where not exists(select 1 from public.sorting_shipment_parcels sp where sp.shipment_id=v_sh.id and sp.parcel_id=x and sp.is_active)) then raise exception 'Damaged parcel is not part of this shipment manifest'; end if;
    v_actual:=cardinality(p_received_parcel_ids);
    v_damaged:=coalesce(cardinality(p_damaged_parcel_ids),0);
    if v_actual<>v_expected then
      insert into public.sorting_parcel_incidents(shipment_id,center_id,incident_type,details,reported_by,status)
      values(v_sh.id,v_center_id,'count_mismatch','Manifest contains '||v_expected||' parcels; receiver scanned '||v_actual||'. '||coalesce(nullif(btrim(p_remarks),''),''),v_uid,'open');
    end if;
    update public.sorting_shipments set status=case when v_actual=v_expected and v_damaged=0 then 'received' else 'exception' end,received_by=v_uid,receive_remarks=nullif(btrim(p_remarks),''),received_at=now(),updated_at=now() where id=v_sh.id;
    update public.sorting_parcels p set status=case when p.id=any(coalesce(p_damaged_parcel_ids,'{}'::uuid[])) then 'exception' else 'received_next_center' end,current_center_id=v_center_id,current_shipment_id=null,destination_center_id=null,updated_at=now() from public.sorting_shipment_parcels sp where sp.shipment_id=v_sh.id and sp.parcel_id=p.id and sp.is_active and p.id=any(p_received_parcel_ids);
    update public.sorting_parcels p set status='exception',current_center_id=null,current_shipment_id=null,updated_at=now() from public.sorting_shipment_parcels sp where sp.shipment_id=v_sh.id and sp.parcel_id=p.id and sp.is_active and not (p.id=any(p_received_parcel_ids));
    insert into public.sorting_parcel_incidents(parcel_id,shipment_id,center_id,incident_type,details,reported_by,status)
      select p.id,v_sh.id,v_center_id,'missing','Manifest parcel was not scanned at receipt. '||coalesce(nullif(btrim(p_remarks),''),''),v_uid,'open' from public.sorting_shipment_parcels sp join public.sorting_parcels p on p.id=sp.parcel_id where sp.shipment_id=v_sh.id and sp.is_active and not (p.id=any(p_received_parcel_ids));
    insert into public.sorting_parcel_incidents(parcel_id,shipment_id,center_id,incident_type,details,reported_by,status)
      select p.id,v_sh.id,v_center_id,'damaged',coalesce(nullif(btrim(p_remarks),''),'Parcel reported damaged at receipt.'),v_uid,'open' from public.sorting_parcels p where p.id=any(coalesce(p_damaged_parcel_ids,'{}'::uuid[]));
    update public.sorting_shipment_parcels set is_active=false,released_at=now() where shipment_id=v_sh.id and is_active;
    insert into public.sorting_parcel_events(parcel_id,order_id,shipment_id,event_type,from_center_id,to_center_id,actor_user_id,actor_label,verified,remarks)
      select p.id,p.order_id,v_sh.id,'shipment_received',v_sh.origin_center_id,v_center_id,v_uid,(select display_name from public.leogo_staff where user_id=v_uid),true,nullif(btrim(p_remarks),'') from public.sorting_shipment_parcels sp join public.sorting_parcels p on p.id=sp.parcel_id where sp.shipment_id=v_sh.id and p.id=any(p_received_parcel_ids);
  elsif p_action='verify' then
    v_center_id:=v_sh.origin_center_id;
    if not private.sorting_center_has_access(v_center_id,'dispatch') then raise exception 'Dispatch verification permission required'; end if;
    if v_sh.status<>'building' then raise exception 'Only a building manifest can be verified'; end if;
    if v_sh.prepared_by=v_uid then raise exception 'A different staff member must verify this shipment'; end if;
    update public.sorting_shipments set verified_by=v_uid,updated_at=now() where id=v_sh.id;
  else raise exception 'Unsupported shipment operation'; end if;
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,before_data,after_data,metadata)
  values(v_uid,'sorting.shipment.'||p_action,'sorting_shipment',v_sh.id::text,jsonb_build_object('status',v_sh.status),jsonb_build_object('action',p_action,'received_count',v_actual,'damaged_count',v_damaged,'remarks',nullif(btrim(p_remarks),'')),jsonb_build_object('tracking_number',v_sh.tracking_number));
  select count(*) into v_actual from public.sorting_shipment_parcels where shipment_id=v_sh.id;
  return jsonb_build_object('ok',true,'tracking_number',v_sh.tracking_number,'action',p_action,'parcel_count',v_actual,'status',(select status from public.sorting_shipments where id=v_sh.id));
end
$function$;

create or replace function public.sorting_staff_report_incident(p_center_id uuid,p_parcel_id uuid,p_shipment_id uuid,p_type text,p_details text,p_photo_path text default null)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_id uuid;
begin
  if not private.sorting_center_has_access(p_center_id,'receive') and not private.sorting_center_has_access(p_center_id,'sort') and not private.sorting_center_has_access(p_center_id,'dispatch') then raise exception 'Sorting center access required'; end if;
  if p_type not in ('missing','damaged','incorrect_route','count_mismatch','other') then raise exception 'Unsupported incident type'; end if;
  if p_parcel_id is not null and not exists(select 1 from public.sorting_parcels where id=p_parcel_id and (current_center_id=p_center_id or exists(select 1 from public.sorting_shipment_parcels sp join public.sorting_shipments sh on sh.id=sp.shipment_id where sp.parcel_id=p_parcel_id and sh.destination_center_id=p_center_id and sh.status in ('in_transit','exception')))) then raise exception 'Parcel is outside this center operation'; end if;
  if p_shipment_id is not null and not exists(select 1 from public.sorting_shipments where id=p_shipment_id and (origin_center_id=p_center_id or destination_center_id=p_center_id)) then raise exception 'Shipment is outside this center operation'; end if;
  insert into public.sorting_parcel_incidents(parcel_id,shipment_id,center_id,incident_type,details,reported_by,evidence_photo_path)
  values(p_parcel_id,p_shipment_id,p_center_id,p_type,btrim(p_details),(select auth.uid()),p_photo_path) returning id into v_id;
  if p_parcel_id is not null then
    update public.sorting_parcels set status='exception',updated_at=now() where id=p_parcel_id and status not in ('delivered','cancelled');
    insert into public.sorting_parcel_events(parcel_id,order_id,shipment_id,event_type,from_center_id,actor_user_id,actor_label,verified,evidence_photo_path,remarks)
    select p.id,p.order_id,p_shipment_id,'incident_reported',p_center_id,(select auth.uid()),s.display_name,true,p_photo_path,btrim(p_details) from public.sorting_parcels p left join public.leogo_staff s on s.user_id=(select auth.uid()) where p.id=p_parcel_id;
  end if;
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,after_data,metadata)
  values((select auth.uid()),'sorting.incident.reported','sorting_parcel_incident',v_id::text,jsonb_build_object('type',p_type,'details',btrim(p_details)),jsonb_build_object('center_id',p_center_id,'parcel_id',p_parcel_id,'shipment_id',p_shipment_id));
  return v_id;
end
$function$;

create or replace function public.sorting_staff_dashboard(p_center_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
begin
  if not private.sorting_center_has_access(p_center_id,'read') then raise exception 'Sorting center access required'; end if;
  return jsonb_build_object(
    'expected_incoming',(select count(*) from public.sorting_shipments where destination_center_id=p_center_id and status='in_transit'),
    'pending_receipt',(select count(*) from public.sorting_parcels where current_center_id=p_center_id and status='seller_handed_over'),
    'received_today',(select count(*) from public.sorting_parcel_events where to_center_id=p_center_id and event_type='center_received' and created_at>=date_trunc('day',now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'),
    'pending_sorting',(select count(*) from public.sorting_parcels where current_center_id=p_center_id and status='received'),
    'sorted',(select count(*) from public.sorting_parcels where current_center_id=p_center_id and status='sorted'),
    'pending_dispatch',(select count(*) from public.sorting_shipments where origin_center_id=p_center_id and status='building'),
    'shipments_in_transit',(select count(*) from public.sorting_shipments where origin_center_id=p_center_id and status='in_transit'),
    'incidents',(select count(*) from public.sorting_parcel_incidents where center_id=p_center_id and status<>'resolved'),
    'parcels',(select count(*) from public.sorting_parcels where current_center_id=p_center_id and status not in ('delivered','cancelled'))
  );
end
$function$;

create or replace function public.customer_list_sorting_order_tracking(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=(select auth.uid()); v_rows jsonb;
begin
  if v_uid is null or not exists(select 1 from public.marketplace_orders where id=p_order_id and customer_id=v_uid) then raise exception 'Order not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('event_type',e.event_type,'created_at',e.created_at,'verified',e.verified,'from_center',fc.center_name,'to_center',tc.center_name,'shipment_tracking_number',sh.tracking_number) order by e.created_at),'[]'::jsonb)
  into v_rows from public.sorting_parcel_events e left join public.sorting_centers fc on fc.id=e.from_center_id left join public.sorting_centers tc on tc.id=e.to_center_id left join public.sorting_shipments sh on sh.id=e.shipment_id where e.order_id=p_order_id and e.verified and e.event_type not in ('booked','incident_reported');
  return jsonb_build_object('order_id',p_order_id,'events',v_rows);
end
$function$;

create or replace function public.admin_sorting_center_incidents()
returns jsonb language plpgsql security definer set search_path=''
as $function$
begin
  if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('incident_id',i.id,'incident_type',i.incident_type,'details',i.details,'status',i.status,'created_at',i.created_at,'center_name',c.center_name,'parcel_reference',p.parcel_reference,'order_reference',o.order_reference,'shipment_tracking_number',sh.tracking_number,'reported_by_name',s.display_name,'evidence_photo_path',i.evidence_photo_path) order by i.created_at desc),'[]'::jsonb)
    from public.sorting_parcel_incidents i join public.sorting_centers c on c.id=i.center_id left join public.sorting_parcels p on p.id=i.parcel_id left join public.marketplace_orders o on o.id=p.order_id left join public.sorting_shipments sh on sh.id=i.shipment_id left join public.leogo_staff s on s.user_id=i.reported_by);
end
$function$;

create or replace function public.admin_sorting_center_resolve_incident(p_incident_id uuid,p_status text,p_notes text default null)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required'; end if;
  if p_status not in ('investigating','resolved') then raise exception 'Choose investigating or resolved'; end if;
  select to_jsonb(i) into v_before from public.sorting_parcel_incidents i where i.id=p_incident_id for update;
  if v_before is null then raise exception 'Incident not found'; end if;
  update public.sorting_parcel_incidents set status=p_status,resolved_by=case when p_status='resolved' then (select auth.uid()) else null end,resolved_at=case when p_status='resolved' then now() else null end,details=case when nullif(btrim(coalesce(p_notes,'')),'') is null then details else details||E'\nAdmin: '||btrim(p_notes) end where id=p_incident_id;
  select to_jsonb(i) into v_after from public.sorting_parcel_incidents i where i.id=p_incident_id;
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,before_data,after_data)
  values((select auth.uid()),'sorting.incident.'||p_status,'sorting_parcel_incident',p_incident_id::text,v_before,v_after);
  return true;
end
$function$;

-- Only authenticated callers may reach the narrowly validated RPCs. Tables are
-- intentionally inaccessible directly; center boundaries are checked in RPCs.
revoke all on function public.admin_sorting_center_save(jsonb) from public,anon;
revoke all on function public.admin_sorting_center_assign_staff(uuid,uuid,text,boolean) from public,anon;
revoke all on function public.admin_sorting_center_set_route(uuid,uuid,numeric,boolean) from public,anon;
revoke all on function public.admin_sorting_center_list() from public,anon;
revoke all on function public.admin_sorting_center_directory() from public,anon;
revoke all on function public.seller_sorting_center_options() from public,anon;
revoke all on function public.seller_book_order_to_sorting_center(uuid,uuid,numeric) from public,anon;
revoke all on function public.seller_confirm_sorting_center_handover(uuid,text) from public,anon;
revoke all on function public.sorting_staff_get_centers() from public,anon;
revoke all on function public.sorting_staff_list_parcels(uuid,text) from public,anon;
revoke all on function public.sorting_staff_record_parcel(uuid,text,uuid,text,text) from public,anon;
revoke all on function public.sorting_staff_create_shipment(uuid,uuid,uuid[]) from public,anon;
revoke all on function public.sorting_staff_update_shipment(uuid,text,uuid,text,uuid[],uuid[]) from public,anon;
revoke all on function public.sorting_staff_report_incident(uuid,uuid,uuid,text,text,text) from public,anon;
revoke all on function public.sorting_staff_dashboard(uuid) from public,anon;
revoke all on function public.customer_list_sorting_order_tracking(uuid) from public,anon;
revoke all on function public.admin_sorting_center_incidents() from public,anon;
revoke all on function public.admin_sorting_center_resolve_incident(uuid,text,text) from public,anon;

grant execute on function public.admin_sorting_center_save(jsonb) to authenticated;
grant execute on function public.admin_sorting_center_assign_staff(uuid,uuid,text,boolean) to authenticated;
grant execute on function public.admin_sorting_center_set_route(uuid,uuid,numeric,boolean) to authenticated;
grant execute on function public.admin_sorting_center_list() to authenticated;
grant execute on function public.admin_sorting_center_directory() to authenticated;
grant execute on function public.seller_sorting_center_options() to authenticated;
grant execute on function public.seller_book_order_to_sorting_center(uuid,uuid,numeric) to authenticated;
grant execute on function public.seller_confirm_sorting_center_handover(uuid,text) to authenticated;
grant execute on function public.sorting_staff_get_centers() to authenticated;
grant execute on function public.sorting_staff_list_parcels(uuid,text) to authenticated;
grant execute on function public.sorting_staff_record_parcel(uuid,text,uuid,text,text) to authenticated;
grant execute on function public.sorting_staff_create_shipment(uuid,uuid,uuid[]) to authenticated;
grant execute on function public.sorting_staff_update_shipment(uuid,text,uuid,text,uuid[],uuid[]) to authenticated;
grant execute on function public.sorting_staff_report_incident(uuid,uuid,uuid,text,text,text) to authenticated;
grant execute on function public.sorting_staff_dashboard(uuid) to authenticated;
grant execute on function public.customer_list_sorting_order_tracking(uuid) to authenticated;
grant execute on function public.admin_sorting_center_incidents() to authenticated;
grant execute on function public.admin_sorting_center_resolve_incident(uuid,text,text) to authenticated;
