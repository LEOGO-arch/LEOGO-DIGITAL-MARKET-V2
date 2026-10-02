-- LEOGO Assisted Shopping / Shopping List V1
-- Separate Customer -> Admin preparation workflow that hands accepted orders
-- into the existing LEOGO Rider / Pickup Station fulfilment infrastructure.

create table if not exists public.assisted_shopping_settings(
  id smallint primary key default 1 check(id=1),
  service_fee_percent numeric(7,4) not null default 5 check(service_fee_percent between 0 and 100),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.assisted_shopping_settings(id,service_fee_percent)
values(1,5)
on conflict(id) do nothing;

alter table public.assisted_shopping_settings enable row level security;
revoke all on table public.assisted_shopping_settings from anon,authenticated;

create table if not exists public.assisted_shopping_requests(
  id uuid primary key default gen_random_uuid(),
  request_reference text not null unique,
  customer_id uuid not null references auth.users(id) on delete restrict,
  receiver_name text not null,
  contact_number text not null,
  written_list text,
  substitution_policy text not null default 'contact_first'
    check(substitution_policy in ('allow_similar','contact_first','no_substitutes')),
  budget_kes numeric check(budget_kes is null or budget_kes>=0),
  preferred_delivery_date date,
  preferred_delivery_time time,
  fulfilment_method text not null check(fulfilment_method in ('delivery','pickup')),
  delivery_zone text not null check(delivery_zone in ('cbd','estate','outside','pickup')),
  county text,
  sub_county text,
  estate text,
  landmark text,
  location_link text,
  pickup_station_id uuid references public.pickup_stations(id) on delete set null,
  status text not null default 'submitted'
    check(status in (
      'submitted','under_review','changes_requested','quotation_ready',
      'payment_submitted','payment_rejected','preparing','ready_for_dispatch',
      'assigned','picked_up','at_sorting_center','on_the_way',
      'at_pickup_station','ready_for_pickup','completed','cancelled'
    )),
  admin_notes text,
  customer_change_notes text,
  items_subtotal_kes numeric not null default 0 check(items_subtotal_kes>=0),
  service_fee_percent_snapshot numeric not null default 0 check(service_fee_percent_snapshot between 0 and 100),
  service_fee_kes numeric not null default 0 check(service_fee_kes>=0),
  pickup_fee_kes numeric not null default 0 check(pickup_fee_kes>=0),
  delivery_fee_kes numeric not null default 0 check(delivery_fee_kes>=0),
  grand_total_kes numeric not null default 0 check(grand_total_kes>=0),
  payment_method text check(payment_method is null or payment_method in ('till','paybill','cod')),
  payment_reference text,
  payment_status text not null default 'not_required'
    check(payment_status in ('not_required','submitted','verified_paid','cod_due','cod_paid','rejected')),
  marketplace_order_id uuid unique references public.marketplace_orders(id) on delete set null,
  prepared_by uuid references auth.users(id) on delete set null,
  quoted_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(
    (fulfilment_method='pickup' and delivery_zone='pickup' and pickup_station_id is not null)
    or
    (fulfilment_method='delivery' and delivery_zone in ('cbd','estate','outside'))
  )
);

create index if not exists assisted_shopping_customer_idx
  on public.assisted_shopping_requests(customer_id,created_at desc);
create index if not exists assisted_shopping_admin_status_idx
  on public.assisted_shopping_requests(status,created_at desc);
create index if not exists assisted_shopping_order_idx
  on public.assisted_shopping_requests(marketplace_order_id);

alter table public.assisted_shopping_requests enable row level security;
revoke all on table public.assisted_shopping_requests from anon,authenticated;

create table if not exists public.assisted_shopping_files(
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.assisted_shopping_requests(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  size_bytes bigint check(size_bytes is null or size_bytes>=0),
  created_at timestamptz not null default now()
);

create index if not exists assisted_shopping_files_request_idx
  on public.assisted_shopping_files(request_id,created_at);

alter table public.assisted_shopping_files enable row level security;
revoke all on table public.assisted_shopping_files from anon,authenticated;

create table if not exists public.assisted_shopping_quote_items(
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.assisted_shopping_requests(id) on delete cascade,
  item_name text not null check(char_length(btrim(item_name)) between 2 and 180),
  requested_quantity numeric not null default 1 check(requested_quantity>0),
  prepared_quantity numeric not null default 1 check(prepared_quantity>=0),
  unit_label text,
  unit_price_kes numeric not null default 0 check(unit_price_kes>=0),
  line_total_kes numeric not null default 0 check(line_total_kes>=0),
  item_status text not null default 'available'
    check(item_status in ('available','substituted','unavailable')),
  substitution_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assisted_shopping_quote_items_request_idx
  on public.assisted_shopping_quote_items(request_id,sort_order,created_at);

alter table public.assisted_shopping_quote_items enable row level security;
revoke all on table public.assisted_shopping_quote_items from anon,authenticated;

create table if not exists public.assisted_shopping_events(
  id bigint generated always as identity primary key,
  request_id uuid not null references public.assisted_shopping_requests(id) on delete cascade,
  event_type text not null,
  title text not null,
  message text,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists assisted_shopping_events_request_idx
  on public.assisted_shopping_events(request_id,created_at desc);

alter table public.assisted_shopping_events enable row level security;
revoke all on table public.assisted_shopping_events from anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'assisted-shopping-files','assisted-shopping-files',false,20971520,array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg','image/png','image/webp','text/plain'
  ]
)
on conflict(id) do update
set public=excluded.public,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists assisted_shopping_files_insert_own on storage.objects;
create policy assisted_shopping_files_insert_own
on storage.objects for insert to authenticated
with check(
  bucket_id='assisted-shopping-files'
  and split_part(name,'/',1)=(select auth.uid())::text
);

drop policy if exists assisted_shopping_files_read_authorized on storage.objects;
create policy assisted_shopping_files_read_authorized
on storage.objects for select to authenticated
using(
  bucket_id='assisted-shopping-files'
  and (
    split_part(name,'/',1)=(select auth.uid())::text
    or private.is_leogo_admin('orders.read')
  )
);

drop policy if exists assisted_shopping_files_delete_own_unsubmitted on storage.objects;
create policy assisted_shopping_files_delete_own_unsubmitted
on storage.objects for delete to authenticated
using(
  bucket_id='assisted-shopping-files'
  and split_part(name,'/',1)=(select auth.uid())::text
  and not exists(
    select 1
    from public.assisted_shopping_files f
    where f.storage_path=name
  )
);

create or replace function private.assisted_shopping_reference()
returns text
language sql
volatile
set search_path=''
as $function$
  select 'ASL-'||to_char(clock_timestamp(),'YYMMDDHH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
$function$;

create or replace function private.assisted_shopping_notify_customer(
  p_customer_id uuid,
  p_request_id uuid,
  p_event_key text,
  p_title text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    p_customer_id,'order',p_title,p_message,
    'assisted_shopping_request',p_request_id,p_event_key,'home',
    jsonb_build_object('request_id',p_request_id,'feature','assisted_shopping')
  )
  on conflict(user_id,source_type,source_id,event_key)
  where source_id is not null
  do update set
    title=excluded.title,
    message=excluded.message,
    metadata=excluded.metadata,
    read_at=null,
    created_at=now();
end
$function$;

create or replace function public.public_get_assisted_shopping_settings()
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select jsonb_build_object('service_fee_percent',s.service_fee_percent)
  from public.assisted_shopping_settings s
  where s.id=1;
$function$;

revoke execute on function public.public_get_assisted_shopping_settings() from public;
grant execute on function public.public_get_assisted_shopping_settings() to anon,authenticated;

create or replace function public.public_get_assisted_shopping_payment_account()
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select case when a.id is null then null else jsonb_build_object(
    'display_name',a.display_name,
    'account_type',a.account_type,
    'business_name',a.business_name,
    'account_name',a.account_name,
    'till_number',a.till_number,
    'paybill_number',a.paybill_number,
    'account_number',a.account_number,
    'bank_name',a.bank_name,
    'instructions',a.instructions
  ) end
  from public.payment_account_assignments x
  join public.payment_accounts a on a.id=x.account_id and a.status='active'
  where x.function_code='marketplace_orders'
  limit 1;
$function$;

revoke execute on function public.public_get_assisted_shopping_payment_account() from public;
grant execute on function public.public_get_assisted_shopping_payment_account() to anon,authenticated;

create or replace function public.admin_get_assisted_shopping_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if not private.is_leogo_admin('settings.manage')
     and not private.is_leogo_admin('fees.manage') then
    raise exception 'Settings management permission required';
  end if;
  return (select to_jsonb(s) from public.assisted_shopping_settings s where s.id=1);
end
$function$;

create or replace function public.admin_save_assisted_shopping_settings(
  p_service_fee_percent numeric
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not private.is_leogo_admin('settings.manage')
     and not private.is_leogo_admin('fees.manage') then
    raise exception 'Settings management permission required';
  end if;

  if p_service_fee_percent is null or p_service_fee_percent<0 or p_service_fee_percent>100 then
    raise exception 'Assisted Shopping service fee must be between 0 and 100 percent';
  end if;

  select to_jsonb(s) into v_before
  from public.assisted_shopping_settings s
  where s.id=1
  for update;

  update public.assisted_shopping_settings
  set service_fee_percent=p_service_fee_percent,
      updated_by=(select auth.uid()),
      updated_at=now()
  where id=1
  returning to_jsonb(assisted_shopping_settings) into v_after;

  perform private.write_admin_audit(
    'settings.assisted_shopping.updated',
    'assisted_shopping_settings',
    '1',
    v_before,
    v_after,
    '{}'::jsonb
  );

  return v_after;
end
$function$;

revoke execute on function public.admin_get_assisted_shopping_settings() from public,anon;
revoke execute on function public.admin_save_assisted_shopping_settings(numeric) from public,anon;
grant execute on function public.admin_get_assisted_shopping_settings() to authenticated;
grant execute on function public.admin_save_assisted_shopping_settings(numeric) to authenticated;

create or replace function public.customer_submit_assisted_shopping_request(
  p_receiver_name text,
  p_contact_number text,
  p_written_list text,
  p_files jsonb,
  p_substitution_policy text,
  p_budget_kes numeric,
  p_preferred_delivery_date date,
  p_preferred_delivery_time time,
  p_fulfilment_method text,
  p_delivery_zone text,
  p_county text,
  p_sub_county text,
  p_estate text,
  p_landmark text,
  p_location_link text,
  p_pickup_station_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_id uuid:=gen_random_uuid();
  v_ref text:=private.assisted_shopping_reference();
  v_file jsonb;
  v_path text;
  v_file_count integer:=0;
begin
  if v_uid is null then raise exception 'Sign in before sending a Shopping List'; end if;
  if not exists(select 1 from public.customer_profiles p where p.user_id=v_uid) then
    raise exception 'Complete your customer profile before sending a Shopping List';
  end if;
  if char_length(btrim(coalesce(p_receiver_name,'')))<2 then raise exception 'Receiver name is required'; end if;
  if char_length(btrim(coalesce(p_contact_number,'')))<7 then raise exception 'Enter a valid contact number'; end if;
  if p_substitution_policy not in ('allow_similar','contact_first','no_substitutes') then
    raise exception 'Choose a substitution preference';
  end if;
  if p_budget_kes is not null and p_budget_kes<0 then raise exception 'Budget cannot be negative'; end if;
  if p_fulfilment_method not in ('delivery','pickup') then raise exception 'Choose delivery or Pickup Station'; end if;

  if p_fulfilment_method='pickup' then
    if p_delivery_zone<>'pickup' or p_pickup_station_id is null then raise exception 'Choose an active Pickup Station'; end if;
    if not exists(select 1 from public.pickup_stations s where s.id=p_pickup_station_id and s.is_active) then
      raise exception 'The selected Pickup Station is not available';
    end if;
  else
    if p_delivery_zone not in ('cbd','estate','outside') then raise exception 'Choose the customer delivery zone'; end if;
    if char_length(btrim(coalesce(p_county,'')))<2 then raise exception 'Delivery county is required'; end if;
  end if;

  if p_files is not null and jsonb_typeof(p_files)<>'array' then raise exception 'Uploaded file information is invalid'; end if;
  v_file_count:=coalesce(jsonb_array_length(coalesce(p_files,'[]'::jsonb)),0);

  if char_length(btrim(coalesce(p_written_list,'')))<3 and v_file_count=0 then
    raise exception 'Write your Shopping List or upload a file/photo';
  end if;
  if v_file_count>5 then raise exception 'Upload at most 5 Shopping List files'; end if;

  insert into public.assisted_shopping_requests(
    id,request_reference,customer_id,receiver_name,contact_number,written_list,
    substitution_policy,budget_kes,preferred_delivery_date,preferred_delivery_time,
    fulfilment_method,delivery_zone,county,sub_county,estate,landmark,location_link,pickup_station_id
  )
  values(
    v_id,v_ref,v_uid,btrim(p_receiver_name),btrim(p_contact_number),
    nullif(btrim(coalesce(p_written_list,'')),''),
    p_substitution_policy,p_budget_kes,p_preferred_delivery_date,p_preferred_delivery_time,
    p_fulfilment_method,p_delivery_zone,
    nullif(btrim(coalesce(p_county,'')),''),
    nullif(btrim(coalesce(p_sub_county,'')),''),
    nullif(btrim(coalesce(p_estate,'')),''),
    nullif(btrim(coalesce(p_landmark,'')),''),
    nullif(btrim(coalesce(p_location_link,'')),''),
    case when p_fulfilment_method='pickup' then p_pickup_station_id else null end
  );

  if p_files is not null then
    for v_file in select * from jsonb_array_elements(p_files)
    loop
      v_path:=nullif(btrim(coalesce(v_file->>'path','')),'');
      if v_path is null or split_part(v_path,'/',1)<>v_uid::text then
        raise exception 'Invalid Shopping List file path';
      end if;

      insert into public.assisted_shopping_files(
        request_id,customer_id,storage_path,original_name,mime_type,size_bytes
      )
      values(
        v_id,v_uid,v_path,
        left(coalesce(nullif(v_file->>'name',''),'Shopping List file'),240),
        nullif(v_file->>'mime',''),
        case when nullif(v_file->>'size','') is null then null else (v_file->>'size')::bigint end
      );
    end loop;
  end if;

  insert into public.assisted_shopping_events(
    request_id,event_type,title,message,actor_user_id,actor_role
  ) values(
    v_id,'submitted','Shopping List received',
    'LEOGO received the Shopping List and will prepare an item-by-item quotation.',
    v_uid,'customer'
  );

  perform private.assisted_shopping_notify_customer(
    v_uid,v_id,'assisted_shopping_submitted_'||v_id::text,
    'Shopping List received',
    'Your Shopping List '||v_ref||' has been received by LEOGO and is waiting for preparation.'
  );

  return jsonb_build_object(
    'ok',true,
    'request_id',v_id,
    'request_reference',v_ref,
    'status','submitted'
  );
end
$function$;

revoke execute on function public.customer_submit_assisted_shopping_request(
  text,text,text,jsonb,text,numeric,date,time,text,text,text,text,text,text,text,uuid
) from public,anon;
grant execute on function public.customer_submit_assisted_shopping_request(
  text,text,text,jsonb,text,numeric,date,time,text,text,text,text,text,text,text,uuid
) to authenticated;

create or replace function public.customer_list_assisted_shopping_requests()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select coalesce(jsonb_agg(row_data order by (row_data->>'created_at')::timestamptz desc),'[]'::jsonb)
  into v_result
  from (
    select to_jsonb(r)||jsonb_build_object(
      'pickup_station_name',ps.station_name,
      'files',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',f.id,'path',f.storage_path,'name',f.original_name,'mime',f.mime_type,'size',f.size_bytes
        ) order by f.created_at)
        from public.assisted_shopping_files f
        where f.request_id=r.id
      ),'[]'::jsonb),
      'items',coalesce((
        select jsonb_agg(to_jsonb(i) order by i.sort_order,i.created_at)
        from public.assisted_shopping_quote_items i
        where i.request_id=r.id
      ),'[]'::jsonb),
      'events',coalesce((
        select jsonb_agg(jsonb_build_object(
          'event_type',e.event_type,'title',e.title,'message',e.message,'created_at',e.created_at
        ) order by e.created_at desc)
        from public.assisted_shopping_events e
        where e.request_id=r.id
      ),'[]'::jsonb),
      'order_reference',o.order_reference,
      'order_status',o.order_status,
      'delivery_status',d.status,
      'rider_name',staff.display_name,
      'rider_phone',staff.phone
    ) row_data
    from public.assisted_shopping_requests r
    left join public.pickup_stations ps on ps.id=r.pickup_station_id
    left join public.marketplace_orders o on o.id=r.marketplace_order_id
    left join public.marketplace_delivery_jobs d on d.order_id=o.id
    left join public.leogo_staff staff on staff.user_id=d.rider_id
    where r.customer_id=v_uid
  ) q;

  return v_result;
end
$function$;

revoke execute on function public.customer_list_assisted_shopping_requests() from public,anon;
grant execute on function public.customer_list_assisted_shopping_requests() to authenticated;

create or replace function public.customer_request_assisted_shopping_changes(
  p_request_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  r public.assisted_shopping_requests%rowtype;
begin
  select * into r
  from public.assisted_shopping_requests
  where id=p_request_id and customer_id=(select auth.uid())
  for update;

  if not found then raise exception 'Shopping List request not found'; end if;
  if r.status<>'quotation_ready' then raise exception 'Changes can be requested only while the quotation is awaiting your approval'; end if;
  if char_length(btrim(coalesce(p_note,'')))<3 then raise exception 'Tell LEOGO what should be changed'; end if;

  update public.assisted_shopping_requests
  set status='changes_requested',
      customer_change_notes=btrim(p_note),
      updated_at=now()
  where id=r.id;

  insert into public.assisted_shopping_events(
    request_id,event_type,title,message,actor_user_id,actor_role
  ) values(
    r.id,'changes_requested','Customer requested changes',btrim(p_note),(select auth.uid()),'customer'
  );

  return jsonb_build_object('ok',true,'status','changes_requested');
end
$function$;

revoke execute on function public.customer_request_assisted_shopping_changes(uuid,text) from public,anon;
grant execute on function public.customer_request_assisted_shopping_changes(uuid,text) to authenticated;

create or replace function public.admin_list_assisted_shopping_requests()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_result jsonb;
begin
  if not private.is_leogo_admin('orders.read') then raise exception 'Order access required'; end if;

  select coalesce(jsonb_agg(row_data order by
    case row_data->>'status'
      when 'submitted' then 0
      when 'changes_requested' then 1
      when 'payment_submitted' then 2
      when 'under_review' then 3
      when 'quotation_ready' then 4
      when 'payment_rejected' then 5
      when 'preparing' then 6
      when 'ready_for_dispatch' then 7
      else 8
    end,
    (row_data->>'created_at')::timestamptz desc
  ),'[]'::jsonb)
  into v_result
  from (
    select to_jsonb(r)||jsonb_build_object(
      'customer_name',cp.full_name,
      'customer_phone',cp.phone,
      'customer_email',u.email,
      'pickup_station_name',ps.station_name,
      'pickup_station_address',concat_ws(', ',ps.address_line,ps.town,ps.county),
      'files',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',f.id,'path',f.storage_path,'name',f.original_name,'mime',f.mime_type,'size',f.size_bytes
        ) order by f.created_at)
        from public.assisted_shopping_files f
        where f.request_id=r.id
      ),'[]'::jsonb),
      'items',coalesce((
        select jsonb_agg(to_jsonb(i) order by i.sort_order,i.created_at)
        from public.assisted_shopping_quote_items i
        where i.request_id=r.id
      ),'[]'::jsonb),
      'events',coalesce((
        select jsonb_agg(to_jsonb(e) order by e.created_at desc)
        from public.assisted_shopping_events e
        where e.request_id=r.id
      ),'[]'::jsonb),
      'order_reference',o.order_reference,
      'order_payment_status',o.payment_status,
      'order_status',o.order_status,
      'delivery_job_id',d.id,
      'delivery_status',d.status,
      'rider_id',d.rider_id,
      'rider_name',staff.display_name,
      'rider_phone',staff.phone
    ) row_data
    from public.assisted_shopping_requests r
    left join public.customer_profiles cp on cp.user_id=r.customer_id
    left join auth.users u on u.id=r.customer_id
    left join public.pickup_stations ps on ps.id=r.pickup_station_id
    left join public.marketplace_orders o on o.id=r.marketplace_order_id
    left join public.marketplace_delivery_jobs d on d.order_id=o.id
    left join public.leogo_staff staff on staff.user_id=d.rider_id
  ) q;

  return v_result;
end
$function$;

revoke execute on function public.admin_list_assisted_shopping_requests() from public,anon;
grant execute on function public.admin_list_assisted_shopping_requests() to authenticated;

create or replace function public.admin_prepare_assisted_shopping_quote(
  p_request_id uuid,
  p_items jsonb,
  p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  r public.assisted_shopping_requests%rowtype;
  v_item jsonb;
  v_name text;
  v_requested numeric;
  v_prepared numeric;
  v_unit text;
  v_price numeric;
  v_status text;
  v_note text;
  v_line numeric;
  v_subtotal numeric:=0;
  v_fee_percent numeric:=0;
  v_fee numeric:=0;
  v_pickup numeric:=0;
  v_delivery numeric:=0;
  v_total numeric:=0;
  v_sort integer:=0;
begin
  if not private.is_leogo_admin('orders.manage') then raise exception 'Order management permission required'; end if;

  select * into r
  from public.assisted_shopping_requests
  where id=p_request_id
  for update;

  if not found then raise exception 'Shopping List request not found'; end if;
  if r.status in ('payment_submitted','preparing','ready_for_dispatch','assigned','picked_up','at_sorting_center','on_the_way','at_pickup_station','ready_for_pickup','completed','cancelled') then
    raise exception 'This Shopping List can no longer be re-quoted';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Add at least one prepared Shopping List item';
  end if;

  delete from public.assisted_shopping_quote_items where request_id=r.id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sort:=v_sort+1;
    v_name:=btrim(coalesce(v_item->>'item_name',''));
    v_requested:=coalesce(nullif(v_item->>'requested_quantity','')::numeric,1);
    v_prepared:=coalesce(nullif(v_item->>'prepared_quantity','')::numeric,v_requested);
    v_unit:=nullif(btrim(coalesce(v_item->>'unit_label','')),'');
    v_price:=coalesce(nullif(v_item->>'unit_price_kes','')::numeric,0);
    v_status:=coalesce(nullif(v_item->>'item_status',''),'available');
    v_note:=nullif(btrim(coalesce(v_item->>'substitution_note','')),'');

    if char_length(v_name)<2 then raise exception 'Every prepared item needs a name'; end if;
    if v_requested<=0 or v_prepared<0 or v_price<0 then raise exception 'Item quantities and prices cannot be negative'; end if;
    if v_status not in ('available','substituted','unavailable') then raise exception 'Invalid prepared item status'; end if;
    if v_status='unavailable' then
      v_prepared:=0;
      v_price:=0;
      v_line:=0;
    else
      v_line:=round(v_prepared*v_price,2);
    end if;

    insert into public.assisted_shopping_quote_items(
      request_id,item_name,requested_quantity,prepared_quantity,unit_label,
      unit_price_kes,line_total_kes,item_status,substitution_note,sort_order
    ) values(
      r.id,v_name,v_requested,v_prepared,v_unit,
      v_price,v_line,v_status,v_note,v_sort
    );

    v_subtotal:=v_subtotal+v_line;
  end loop;

  select coalesce(service_fee_percent,0)
  into v_fee_percent
  from public.assisted_shopping_settings
  where id=1;

  v_fee:=round(v_subtotal*(v_fee_percent/100),2);

  if r.delivery_zone='pickup' then
    select
      round(v_subtotal*(coalesce(service_fee_percent,0)/100),2),
      coalesce(shipping_fee_kes,0)
    into v_pickup,v_delivery
    from public.pickup_stations
    where id=r.pickup_station_id and is_active=true;

    if not found then raise exception 'Selected Pickup Station is no longer active'; end if;
  else
    v_delivery:=coalesce(private.delivery_fee_for_zone(r.delivery_zone),0);
  end if;

  v_total:=round(v_subtotal+v_fee+v_pickup+v_delivery,2);

  update public.assisted_shopping_requests
  set status='quotation_ready',
      admin_notes=nullif(btrim(coalesce(p_admin_notes,'')),''),
      customer_change_notes=null,
      items_subtotal_kes=v_subtotal,
      service_fee_percent_snapshot=v_fee_percent,
      service_fee_kes=v_fee,
      pickup_fee_kes=v_pickup,
      delivery_fee_kes=v_delivery,
      grand_total_kes=v_total,
      prepared_by=(select auth.uid()),
      quoted_at=now(),
      updated_at=now()
  where id=r.id;

  insert into public.assisted_shopping_events(
    request_id,event_type,title,message,actor_user_id,actor_role,
    metadata
  ) values(
    r.id,'quotation_ready','Shopping List prepared',
    'LEOGO prepared the Shopping List quotation. Customer approval is required before fulfilment.',
    (select auth.uid()),'admin',
    jsonb_build_object(
      'items_subtotal_kes',v_subtotal,
      'service_fee_percent',v_fee_percent,
      'service_fee_kes',v_fee,
      'delivery_fee_kes',v_delivery,
      'pickup_fee_kes',v_pickup,
      'grand_total_kes',v_total
    )
  );

  perform private.assisted_shopping_notify_customer(
    r.customer_id,r.id,'assisted_quote_ready_'||r.id::text,
    'Your Shopping List is ready',
    'LEOGO has prepared '||r.request_reference||'. Review the items, substitutions and total before accepting the order.'
  );

  perform private.write_admin_audit(
    'assisted_shopping.quote.prepared',
    'assisted_shopping_request',
    r.id::text,
    to_jsonb(r),
    (select to_jsonb(x) from public.assisted_shopping_requests x where x.id=r.id),
    jsonb_build_object('grand_total_kes',v_total,'service_fee_percent',v_fee_percent)
  );

  return jsonb_build_object(
    'ok',true,
    'status','quotation_ready',
    'items_subtotal_kes',v_subtotal,
    'service_fee_percent',v_fee_percent,
    'service_fee_kes',v_fee,
    'pickup_fee_kes',v_pickup,
    'delivery_fee_kes',v_delivery,
    'grand_total_kes',v_total
  );
end
$function$;

revoke execute on function public.admin_prepare_assisted_shopping_quote(uuid,jsonb,text) from public,anon;
grant execute on function public.admin_prepare_assisted_shopping_quote(uuid,jsonb,text) to authenticated;

create or replace function public.customer_accept_assisted_shopping_quote(
  p_request_id uuid,
  p_payment_method text,
  p_payment_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  r public.assisted_shopping_requests%rowtype;
  v_order_id uuid;
  v_order_ref text;
  v_payment_status text;
  v_profile public.customer_profiles%rowtype;
begin
  if p_payment_method not in ('till','paybill','cod') then raise exception 'Choose a supported payment method'; end if;

  select * into r
  from public.assisted_shopping_requests
  where id=p_request_id and customer_id=(select auth.uid())
  for update;

  if not found then raise exception 'Shopping List request not found'; end if;
  if r.status not in ('quotation_ready','payment_rejected') then
    raise exception 'This Shopping List quotation is not awaiting payment';
  end if;
  if r.grand_total_kes<=0 then raise exception 'LEOGO quotation total is not ready'; end if;

  if p_payment_method='cod' and r.items_subtotal_kes>=coalesce((select cod_limit_kes from public.order_settings where id=1),10000) then
    raise exception 'Cash on Delivery is available only below KSh %',coalesce((select cod_limit_kes from public.order_settings where id=1),10000);
  end if;
  if p_payment_method in ('till','paybill') and char_length(btrim(coalesce(p_payment_reference,'')))<3 then
    raise exception 'Enter the payment reference';
  end if;

  select * into v_profile from public.customer_profiles where user_id=r.customer_id;

  if r.marketplace_order_id is null then
    v_order_ref:='ASO-'||to_char(clock_timestamp(),'YYMMDDHH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
    v_payment_status:=case when p_payment_method='cod' then 'cod_due' else 'submitted' end;

    insert into public.marketplace_orders(
      order_reference,customer_id,receiver_name,contact_number,delivery_zone,
      county,sub_county,estate,landmark,location_link,pickup_station_id,
      items_subtotal_kes,service_fee_kes,pickup_fee_kes,delivery_fee_kes,grand_total_kes,
      payment_method,payment_status,payment_message,order_status
    )
    values(
      v_order_ref,r.customer_id,r.receiver_name,r.contact_number,r.delivery_zone,
      r.county,r.sub_county,r.estate,r.landmark,r.location_link,r.pickup_station_id,
      r.items_subtotal_kes,r.service_fee_kes,r.pickup_fee_kes,r.delivery_fee_kes,r.grand_total_kes,
      p_payment_method,v_payment_status,
      case when p_payment_method='cod' then 'Assisted Shopping · Cash on Delivery' else btrim(p_payment_reference) end,
      'placed'
    )
    returning id into v_order_id;

    insert into public.marketplace_delivery_jobs(order_id)
    values(v_order_id)
    on conflict(order_id) do nothing;

    update public.assisted_shopping_requests
    set marketplace_order_id=v_order_id,
        payment_method=p_payment_method,
        payment_reference=case when p_payment_method='cod' then null else btrim(p_payment_reference) end,
        payment_status=v_payment_status,
        status=case when p_payment_method='cod' then 'preparing' else 'payment_submitted' end,
        accepted_at=coalesce(accepted_at,now()),
        updated_at=now()
    where id=r.id;
  else
    v_order_id:=r.marketplace_order_id;
    v_payment_status:=case when p_payment_method='cod' then 'cod_due' else 'submitted' end;

    update public.marketplace_orders
    set payment_method=p_payment_method,
        payment_status=v_payment_status,
        payment_message=case when p_payment_method='cod' then 'Assisted Shopping · Cash on Delivery' else btrim(p_payment_reference) end,
        updated_at=now()
    where id=v_order_id
      and customer_id=r.customer_id
      and order_status not in ('delivered','cancelled');

    update public.assisted_shopping_requests
    set payment_method=p_payment_method,
        payment_reference=case when p_payment_method='cod' then null else btrim(p_payment_reference) end,
        payment_status=v_payment_status,
        status=case when p_payment_method='cod' then 'preparing' else 'payment_submitted' end,
        accepted_at=coalesce(accepted_at,now()),
        updated_at=now()
    where id=r.id;
  end if;

  insert into public.assisted_shopping_events(
    request_id,event_type,title,message,actor_user_id,actor_role,
    metadata
  ) values(
    r.id,
    case when p_payment_method='cod' then 'quotation_accepted_cod' else 'payment_submitted' end,
    case when p_payment_method='cod' then 'Quotation accepted — COD' else 'Payment submitted' end,
    case when p_payment_method='cod'
      then 'Customer accepted the quotation using Cash on Delivery. LEOGO can prepare the order.'
      else 'Customer accepted the quotation and submitted a payment reference for Admin verification.'
    end,
    r.customer_id,'customer',
    jsonb_build_object('marketplace_order_id',v_order_id,'payment_method',p_payment_method)
  );

  perform private.assisted_shopping_notify_customer(
    r.customer_id,r.id,'assisted_quote_accepted_'||r.id::text,
    case when p_payment_method='cod' then 'Shopping List accepted' else 'Payment submitted' end,
    case when p_payment_method='cod'
      then 'LEOGO is preparing '||r.request_reference||'. Full COD payment must be collected before handover.'
      else 'Payment for '||r.request_reference||' is waiting for Admin verification.'
    end
  );

  return jsonb_build_object(
    'ok',true,
    'request_id',r.id,
    'marketplace_order_id',v_order_id,
    'payment_status',v_payment_status,
    'status',case when p_payment_method='cod' then 'preparing' else 'payment_submitted' end
  );
end
$function$;

revoke execute on function public.customer_accept_assisted_shopping_quote(uuid,text,text) from public,anon;
grant execute on function public.customer_accept_assisted_shopping_quote(uuid,text,text) to authenticated;

create or replace function public.admin_mark_assisted_shopping_ready(
  p_request_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  r public.assisted_shopping_requests%rowtype;
begin
  if not private.is_leogo_admin('orders.manage') then raise exception 'Order management permission required'; end if;

  select * into r
  from public.assisted_shopping_requests
  where id=p_request_id
  for update;

  if not found then raise exception 'Shopping List request not found'; end if;
  if r.marketplace_order_id is null then raise exception 'Customer has not accepted this Shopping List quotation'; end if;
  if r.payment_status not in ('verified_paid','cod_due') then
    raise exception 'Verify payment first, unless this is an approved Cash on Delivery order';
  end if;
  if r.status not in ('preparing','ready_for_dispatch') then
    raise exception 'This Shopping List is not in internal preparation';
  end if;

  update public.assisted_shopping_requests
  set status='ready_for_dispatch',
      admin_notes=coalesce(nullif(btrim(coalesce(p_note,'')),''),admin_notes),
      updated_at=now()
  where id=r.id;

  update public.marketplace_orders
  set order_status='processing',updated_at=now()
  where id=r.marketplace_order_id and order_status='placed';

  insert into public.assisted_shopping_events(
    request_id,event_type,title,message,actor_user_id,actor_role
  ) values(
    r.id,'ready_for_dispatch','Assisted order prepared',
    coalesce(nullif(btrim(coalesce(p_note,'')),''),'LEOGO has prepared the Shopping List order and it is ready for Rider assignment.'),
    (select auth.uid()),'admin'
  );

  perform private.assisted_shopping_notify_customer(
    r.customer_id,r.id,'assisted_ready_'||r.id::text,
    'Shopping List order prepared',
    r.request_reference||' is prepared and ready for dispatch.'
  );

  return jsonb_build_object('ok',true,'status','ready_for_dispatch','marketplace_order_id',r.marketplace_order_id);
end
$function$;

revoke execute on function public.admin_mark_assisted_shopping_ready(uuid,text) from public,anon;
grant execute on function public.admin_mark_assisted_shopping_ready(uuid,text) to authenticated;

create or replace function public.admin_cancel_assisted_shopping_request(
  p_request_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  r public.assisted_shopping_requests%rowtype;
begin
  if not private.is_leogo_admin('orders.manage') then raise exception 'Order management permission required'; end if;
  if char_length(btrim(coalesce(p_note,'')))<3 then raise exception 'Add a cancellation reason'; end if;

  select * into r
  from public.assisted_shopping_requests
  where id=p_request_id
  for update;

  if not found then raise exception 'Shopping List request not found'; end if;
  if r.status in ('completed','cancelled') then raise exception 'This request is already closed'; end if;
  if r.marketplace_order_id is not null and r.payment_status in ('verified_paid','cod_paid') then
    raise exception 'A paid Assisted Shopping order must use the controlled refund/aftersales process; it cannot be silently cancelled here';
  end if;

  update public.assisted_shopping_requests
  set status='cancelled',
      cancelled_at=now(),
      admin_notes=btrim(p_note),
      updated_at=now()
  where id=r.id;

  if r.marketplace_order_id is not null then
    update public.marketplace_orders
    set order_status='cancelled',updated_at=now()
    where id=r.marketplace_order_id and order_status<>'delivered';

    update public.marketplace_delivery_jobs
    set status='cancelled',updated_at=now()
    where order_id=r.marketplace_order_id and status not in ('delivered','cancelled');
  end if;

  insert into public.assisted_shopping_events(
    request_id,event_type,title,message,actor_user_id,actor_role
  ) values(r.id,'cancelled','Assisted Shopping cancelled',btrim(p_note),(select auth.uid()),'admin');

  perform private.assisted_shopping_notify_customer(
    r.customer_id,r.id,'assisted_cancelled_'||r.id::text,
    'Shopping List cancelled',
    r.request_reference||' was cancelled by LEOGO. '||btrim(p_note)
  );

  return jsonb_build_object('ok',true,'status','cancelled');
end
$function$;

revoke execute on function public.admin_cancel_assisted_shopping_request(uuid,text) from public,anon;
grant execute on function public.admin_cancel_assisted_shopping_request(uuid,text) to authenticated;

create or replace function private.sync_assisted_shopping_marketplace_order()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  r public.assisted_shopping_requests%rowtype;
  v_status text;
begin
  select * into r
  from public.assisted_shopping_requests
  where marketplace_order_id=new.id
  for update;

  if not found then return new; end if;

  v_status:=r.status;

  if new.payment_status='verified_paid'
     and old.payment_status is distinct from new.payment_status
     and r.status in ('payment_submitted','payment_rejected') then
    v_status:='preparing';

    insert into public.assisted_shopping_events(
      request_id,event_type,title,message,actor_user_id,actor_role
    ) values(
      r.id,'payment_verified','Payment verified',
      'LEOGO verified the Assisted Shopping payment. Internal preparation can continue.',
      new.payment_verified_by,'admin'
    );

    perform private.assisted_shopping_notify_customer(
      r.customer_id,r.id,'assisted_payment_verified_'||r.id::text,
      'Assisted Shopping payment verified',
      r.request_reference||' payment has been verified. LEOGO is preparing your order.'
    );
  elsif new.payment_status='rejected'
        and old.payment_status is distinct from new.payment_status
        and r.status='payment_submitted' then
    v_status:='payment_rejected';

    insert into public.assisted_shopping_events(
      request_id,event_type,title,message,actor_user_id,actor_role
    ) values(
      r.id,'payment_rejected','Payment needs attention',
      coalesce(new.payment_message,'The submitted payment could not be verified.'),
      new.payment_verified_by,'admin'
    );

    perform private.assisted_shopping_notify_customer(
      r.customer_id,r.id,'assisted_payment_rejected_'||r.id::text,
      'Assisted Shopping payment needs attention',
      'Payment for '||r.request_reference||' could not be verified. Open the Shopping List and submit a valid payment reference.'
    );
  end if;

  if new.order_status='delivered' and old.order_status is distinct from new.order_status then
    v_status:='completed';
  end if;

  update public.assisted_shopping_requests
  set payment_status=new.payment_status,
      status=v_status,
      completed_at=case when v_status='completed' then coalesce(completed_at,now()) else completed_at end,
      updated_at=now()
  where id=r.id;

  return new;
end
$function$;

drop trigger if exists sync_assisted_shopping_marketplace_order on public.marketplace_orders;
create trigger sync_assisted_shopping_marketplace_order
after update of payment_status,order_status,delivered_at
on public.marketplace_orders
for each row execute function private.sync_assisted_shopping_marketplace_order();

create or replace function private.sync_assisted_shopping_delivery_job()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  r public.assisted_shopping_requests%rowtype;
  v_status text;
begin
  select * into r
  from public.assisted_shopping_requests
  where marketplace_order_id=new.order_id
  for update;

  if not found then return new; end if;

  v_status:=case new.status
    when 'assigned' then 'assigned'
    when 'picked_up' then 'picked_up'
    when 'arrived_sorting_center' then 'at_sorting_center'
    when 'sorting_received' then 'at_sorting_center'
    when 'ready_for_dispatch' then 'ready_for_dispatch'
    when 'on_the_way' then 'on_the_way'
    when 'delivered_to_pickup_station' then 'at_pickup_station'
    when 'ready_for_pickup' then 'ready_for_pickup'
    when 'delivered' then 'completed'
    when 'cancelled' then 'cancelled'
    else r.status
  end;

  update public.assisted_shopping_requests
  set status=v_status,
      completed_at=case when v_status='completed' then coalesce(completed_at,now()) else completed_at end,
      cancelled_at=case when v_status='cancelled' then coalesce(cancelled_at,now()) else cancelled_at end,
      updated_at=now()
  where id=r.id;

  if old.status is distinct from new.status then
    insert into public.assisted_shopping_events(
      request_id,event_type,title,message,actor_user_id,actor_role,
      metadata
    ) values(
      r.id,'delivery_'||new.status,
      'Delivery update',
      'Assisted Shopping delivery status changed to '||replace(new.status,'_',' ')||'.',
      new.rider_id,
      case when new.rider_id is null then 'system' else 'rider' end,
      jsonb_build_object('delivery_job_id',new.id,'status',new.status)
    );
  end if;

  return new;
end
$function$;

drop trigger if exists sync_assisted_shopping_delivery_job on public.marketplace_delivery_jobs;
create trigger sync_assisted_shopping_delivery_job
after update of status,rider_id
on public.marketplace_delivery_jobs
for each row execute function private.sync_assisted_shopping_delivery_job();

-- Give Admins safe direct file visibility through Storage policies only; all
-- business records stay behind Security Definer RPCs.
revoke execute on function private.assisted_shopping_reference() from public,anon,authenticated;
revoke execute on function private.assisted_shopping_notify_customer(uuid,uuid,text,text,text) from public,anon,authenticated;
