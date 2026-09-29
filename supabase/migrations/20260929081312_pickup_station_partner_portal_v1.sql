-- LEOGO DIGITAL MARKET V2
-- Pickup Station Partner portal foundation: station assignment, parcel scan/receive/handover,
-- returns, earnings, withdrawals, and Admin/customer/seller notifications.

create table if not exists public.pickup_station_partner_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pickup_station_id uuid not null unique references public.pickup_stations(id) on delete cascade,
  display_name text,
  phone text,
  status text not null default 'active' check (status in ('active','suspended')),
  payout_method text not null default 'mpesa' check (payout_method in ('mpesa','bank','till','paybill')),
  payout_account_name text,
  payout_phone text,
  payout_account_number text,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pickup_station_parcels (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.marketplace_orders(id) on delete cascade,
  pickup_station_id uuid not null references public.pickup_stations(id) on delete cascade,
  parcel_reference text not null unique,
  status text not null default 'booked' check (status in ('booked','received','handed_over','cancelled')),
  earnings_amount_kes numeric(12,2) not null default 0 check (earnings_amount_kes>=0),
  booked_at timestamptz not null default now(),
  received_at timestamptz,
  received_by uuid references auth.users(id) on delete set null,
  handed_over_at timestamptz,
  handed_over_by uuid references auth.users(id) on delete set null,
  last_notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.pickup_station_return_parcels (
  id uuid primary key default gen_random_uuid(),
  return_reference text not null unique,
  pickup_station_id uuid not null references public.pickup_stations(id) on delete cascade,
  original_order_id uuid references public.marketplace_orders(id) on delete set null,
  original_order_reference text,
  customer_name text not null,
  customer_phone text not null,
  item_description text not null,
  return_reason text not null,
  status text not null default 'received_at_station' check (status in ('received_at_station','awaiting_dispatch','dispatched','completed','cancelled')),
  booked_by uuid not null references auth.users(id) on delete restrict,
  booked_at timestamptz not null default now(),
  dispatched_at timestamptz,
  admin_notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.pickup_station_parcel_events (
  id uuid primary key default gen_random_uuid(),
  pickup_station_id uuid not null references public.pickup_stations(id) on delete cascade,
  parcel_id uuid references public.pickup_station_parcels(id) on delete cascade,
  order_id uuid references public.marketplace_orders(id) on delete cascade,
  return_parcel_id uuid references public.pickup_station_return_parcels(id) on delete cascade,
  event_type text not null check (event_type in ('booked','received','handed_over','return_booked','return_dispatched','withdrawal_requested')),
  parcel_reference text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.pickup_station_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references auth.users(id) on delete restrict,
  pickup_station_id uuid not null references public.pickup_stations(id) on delete cascade,
  requested_amount_kes numeric(12,2) not null check (requested_amount_kes>0),
  payout_method text not null,
  payout_account_name text,
  payout_phone text,
  payout_account_number text,
  partner_note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','paid')),
  admin_notes text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists pickup_station_parcels_station_status_idx on public.pickup_station_parcels(pickup_station_id,status,booked_at desc);
create index if not exists pickup_station_events_station_created_idx on public.pickup_station_parcel_events(pickup_station_id,created_at desc);
create index if not exists pickup_station_returns_station_created_idx on public.pickup_station_return_parcels(pickup_station_id,booked_at desc);
create index if not exists pickup_station_withdrawals_station_created_idx on public.pickup_station_withdrawal_requests(pickup_station_id,submitted_at desc);

alter table public.pickup_station_partner_accounts enable row level security;
alter table public.pickup_station_parcels enable row level security;
alter table public.pickup_station_parcel_events enable row level security;
alter table public.pickup_station_return_parcels enable row level security;
alter table public.pickup_station_withdrawal_requests enable row level security;

CREATE OR REPLACE FUNCTION private.create_pickup_parcel_from_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_partner uuid;
  v_station_name text;
  v_parcel_id uuid;
begin
  if new.delivery_zone<>'pickup' or new.pickup_station_id is null then
    return new;
  end if;

  insert into public.pickup_station_parcels(
    order_id,pickup_station_id,parcel_reference,status,earnings_amount_kes,booked_at
  ) values (
    new.id,new.pickup_station_id,new.order_reference,
    case when new.order_status='delivered' then 'handed_over' else 'booked' end,
    coalesce(new.pickup_fee_kes,0),
    new.created_at
  )
  on conflict(order_id) do update
  set pickup_station_id=excluded.pickup_station_id,
      parcel_reference=excluded.parcel_reference,
      earnings_amount_kes=excluded.earnings_amount_kes,
      updated_at=now()
  returning id into v_parcel_id;

  insert into public.pickup_station_parcel_events(
    pickup_station_id,parcel_id,order_id,event_type,parcel_reference,actor_user_id,notes,created_at
  ) values (
    new.pickup_station_id,v_parcel_id,new.id,'booked',new.order_reference,new.customer_id,
    'Customer booked this order for Pickup Station collection.',new.created_at
  );

  select a.user_id,s.station_name
    into v_partner,v_station_name
  from public.pickup_stations s
  left join public.pickup_station_partner_accounts a
    on a.pickup_station_id=s.id and a.status='active'
  where s.id=new.pickup_station_id;

  if v_partner is not null then
    perform private.notify_partner(
      v_partner,'pickup_station','parcel_booked','New parcel booked for your Pickup Station',
      new.order_reference||' is booked for collection at '||coalesce(v_station_name,'your Pickup Station')||'.',
      'marketplace_order',new.id,'pickup-parcels',
      jsonb_build_object('order_reference',new.order_reference,'pickup_station_id',new.pickup_station_id)
    );
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.pickup_notify_order_parties(p_order_id uuid, p_event text, p_station_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.marketplace_orders%rowtype;
  v_title text;
  v_message text;
  v_event_key text;
  v_seller record;
begin
  select * into v_order from public.marketplace_orders where id=p_order_id;
  if not found then return; end if;

  if p_event='received' then
    v_title:='Parcel received at Pickup Station';
    v_message:='Order '||v_order.order_reference||' has arrived at '||p_station_name||' and is ready for collection.';
  elsif p_event='handed_over' then
    v_title:='Parcel collected';
    v_message:='Order '||v_order.order_reference||' has been handed over to the customer at '||p_station_name||'.';
  else
    v_title:='Pickup Station update';
    v_message:='Order '||v_order.order_reference||' has a new Pickup Station update.';
  end if;

  v_event_key:='pickup_'||p_event||'_'||v_order.id::text;

  if not exists(select 1 from public.customer_notifications where event_key=v_event_key) then
    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    ) values (
      v_order.customer_id,'pickup_station',v_title,v_message,
      'marketplace_order',v_order.id,v_event_key,'orders',
      jsonb_build_object('order_reference',v_order.order_reference,'pickup_station',p_station_name,'event',p_event)
    );
  end if;

  for v_seller in
    select distinct so.seller_id
    from public.marketplace_seller_orders so
    where so.order_id=v_order.id
  loop
    perform private.notify_partner(
      v_seller.seller_id,'seller','pickup_'||p_event,
      v_title,
      case when p_event='received'
        then 'Order '||v_order.order_reference||' was received at '||p_station_name||'.'
        else 'Order '||v_order.order_reference||' was collected by the customer at '||p_station_name||'.'
      end,
      'marketplace_order',v_order.id,'orders',
      jsonb_build_object('order_reference',v_order.order_reference,'pickup_station',p_station_name,'event',p_event)
    );
  end loop;
end
$function$;

CREATE OR REPLACE FUNCTION private.pickup_partner_station_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select a.pickup_station_id
  from public.pickup_station_partner_accounts a
  join public.pickup_stations s on s.id=a.pickup_station_id
  where a.user_id=(select auth.uid())
    and a.status='active'
    and s.is_active=true
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION private.pickup_resolve_order_for_partner(p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_station uuid := private.pickup_partner_station_id();
  v_code text := btrim(coalesce(p_code,''));
  v_id uuid;
begin
  if v_station is null then raise exception 'Your account is not assigned to an active Pickup Station'; end if;
  if v_code='' then raise exception 'Enter or scan an order / waybill number'; end if;

  select o.id into v_id
  from public.marketplace_orders o
  where o.pickup_station_id=v_station
    and o.delivery_zone='pickup'
    and (
      upper(o.order_reference)=upper(v_code)
      or (v_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and o.id=v_code::uuid)
    )
  limit 1;

  if v_id is null then raise exception 'No parcel booked for this Pickup Station matches that order / waybill number'; end if;
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_assign_pickup_station_partner(p_station_id uuid, p_email text, p_display_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid;
  v_existing uuid;
  v_station_name text;
begin
  if not (private.is_leogo_admin('delivery.manage') or private.is_leogo_admin('settings.manage')) then
    raise exception 'Pickup Station partner assignment permission required';
  end if;

  select id into v_uid from auth.users where lower(email)=lower(btrim(p_email)) limit 1;
  if v_uid is null then raise exception 'No LEOGO account uses that email. Ask the partner to create/sign in to a LEOGO account first'; end if;

  select station_name into v_station_name from public.pickup_stations where id=p_station_id;
  if v_station_name is null then raise exception 'Pickup Station not found'; end if;

  select user_id into v_existing
  from public.pickup_station_partner_accounts
  where pickup_station_id=p_station_id and user_id<>v_uid;
  if v_existing is not null then raise exception 'This Pickup Station is already assigned to another partner'; end if;

  insert into public.pickup_station_partner_accounts(
    user_id,pickup_station_id,display_name,phone,status,assigned_by,assigned_at
  ) values (
    v_uid,p_station_id,nullif(btrim(coalesce(p_display_name,'')),''),nullif(btrim(coalesce(p_phone,'')),''),
    'active',(select auth.uid()),now()
  )
  on conflict(user_id) do update
  set pickup_station_id=excluded.pickup_station_id,
      display_name=coalesce(excluded.display_name,pickup_station_partner_accounts.display_name),
      phone=coalesce(excluded.phone,pickup_station_partner_accounts.phone),
      status='active',assigned_by=(select auth.uid()),assigned_at=now(),updated_at=now();

  perform private.notify_partner(
    v_uid,'pickup_station','station_assigned','Pickup Station access activated',
    'You can now manage parcels for '||v_station_name||' from the LEOGO Pickup Station Partner Portal.',
    'pickup_station',p_station_id,'pickup-dashboard',jsonb_build_object('pickup_station_id',p_station_id,'station_name',v_station_name)
  );

  perform private.write_admin_audit(
    'pickup.partner.assigned','pickup_station',p_station_id::text,
    null,jsonb_build_object('partner_user_id',v_uid,'partner_email',lower(btrim(p_email)),'station_name',v_station_name),
    '{}'::jsonb
  );

  return jsonb_build_object('ok',true,'user_id',v_uid,'pickup_station_id',p_station_id,'station_name',v_station_name);
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_pickup_station_events(p_limit integer DEFAULT 50)
 RETURNS TABLE(event_id uuid, pickup_station_id uuid, station_name text, event_type text, parcel_reference text, actor_email text, notes text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (private.is_leogo_admin('delivery.manage') or private.is_leogo_admin('orders.read')) then raise exception 'Admin access required'; end if;
  return query
  select e.id,e.pickup_station_id,s.station_name,e.event_type,e.parcel_reference,u.email::text,e.notes,e.created_at
  from public.pickup_station_parcel_events e
  join public.pickup_stations s on s.id=e.pickup_station_id
  left join auth.users u on u.id=e.actor_user_id
  order by e.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),200));
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_pickup_station_partners()
 RETURNS TABLE(pickup_station_id uuid, station_name text, station_active boolean, service_fee_percent numeric, partner_user_id uuid, partner_email text, partner_name text, partner_phone text, partner_status text, payout_method text, payout_account_name text, payout_phone text, payout_account_number text, assigned_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (private.is_leogo_admin('delivery.manage') or private.is_leogo_admin('orders.read') or private.is_leogo_admin('settings.manage')) then
    raise exception 'Admin access required';
  end if;
  return query
  select s.id,s.station_name,s.is_active,s.service_fee_percent,
    a.user_id,u.email::text,a.display_name,a.phone,a.status,
    a.payout_method,a.payout_account_name,a.payout_phone,a.payout_account_number,a.assigned_at
  from public.pickup_stations s
  left join public.pickup_station_partner_accounts a on a.pickup_station_id=s.id
  left join auth.users u on u.id=a.user_id
  order by s.display_order,s.station_name;
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_pickup_station_returns()
 RETURNS TABLE(id uuid, return_reference text, pickup_station_id uuid, station_name text, original_order_reference text, customer_name text, customer_phone text, item_description text, return_reason text, status text, booked_at timestamp with time zone, dispatched_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (private.is_leogo_admin('delivery.manage') or private.is_leogo_admin('orders.read')) then raise exception 'Admin access required'; end if;
  return query
  select r.id,r.return_reference,r.pickup_station_id,s.station_name,r.original_order_reference,
    r.customer_name,r.customer_phone,r.item_description,r.return_reason,r.status,r.booked_at,r.dispatched_at
  from public.pickup_station_return_parcels r
  join public.pickup_stations s on s.id=r.pickup_station_id
  order by r.booked_at desc;
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_pickup_station_withdrawals()
 RETURNS TABLE(id uuid, pickup_station_id uuid, station_name text, partner_id uuid, partner_email text, partner_name text, requested_amount_kes numeric, payout_method text, payout_account_name text, payout_phone text, payout_account_number text, partner_note text, status text, admin_notes text, submitted_at timestamp with time zone, reviewed_at timestamp with time zone, paid_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (private.is_leogo_admin('settlements.read') or private.is_leogo_admin('delivery.manage') or private.is_leogo_admin('approvals.read')) then raise exception 'Admin access required'; end if;
  return query
  select w.id,w.pickup_station_id,s.station_name,w.partner_id,u.email::text,a.display_name,
    w.requested_amount_kes,w.payout_method,w.payout_account_name,w.payout_phone,w.payout_account_number,
    w.partner_note,w.status,w.admin_notes,w.submitted_at,w.reviewed_at,w.paid_at
  from public.pickup_station_withdrawal_requests w
  join public.pickup_stations s on s.id=w.pickup_station_id
  left join public.pickup_station_partner_accounts a on a.user_id=w.partner_id
  left join auth.users u on u.id=w.partner_id
  order by case w.status when 'pending' then 0 when 'approved' then 1 else 2 end,w.submitted_at desc;
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_review_pickup_station_withdrawal(p_withdrawal_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row public.pickup_station_withdrawal_requests%rowtype; v_title text; v_message text;
begin
  if not (private.is_leogo_admin('settlements.manage') or private.is_leogo_admin('delivery.manage') or private.is_leogo_admin('settings.manage')) then
    raise exception 'Pickup Station withdrawal permission required';
  end if;
  if p_decision not in ('approve','reject','paid') then raise exception 'Choose approve, reject or paid'; end if;

  select * into v_row from public.pickup_station_withdrawal_requests where id=p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal request not found'; end if;

  if p_decision='approve' then
    update public.pickup_station_withdrawal_requests
    set status='approved',admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
        reviewed_at=now(),reviewed_by=(select auth.uid()),updated_at=now()
    where id=p_withdrawal_id;
    v_title:='Pickup Station withdrawal approved';
    v_message:='Your withdrawal request of KSh '||v_row.requested_amount_kes::text||' has been approved.';
  elsif p_decision='reject' then
    update public.pickup_station_withdrawal_requests
    set status='rejected',admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
        reviewed_at=now(),reviewed_by=(select auth.uid()),updated_at=now()
    where id=p_withdrawal_id;
    v_title:='Pickup Station withdrawal rejected';
    v_message:='Your withdrawal request of KSh '||v_row.requested_amount_kes::text||' was not approved.';
  else
    if v_row.status not in ('approved','pending') then raise exception 'Only a pending or approved withdrawal can be marked paid'; end if;
    update public.pickup_station_withdrawal_requests
    set status='paid',admin_notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),admin_notes),
        reviewed_at=coalesce(reviewed_at,now()),reviewed_by=coalesce(reviewed_by,(select auth.uid())),
        paid_at=now(),updated_at=now()
    where id=p_withdrawal_id;
    v_title:='Pickup Station withdrawal paid';
    v_message:='Your withdrawal request of KSh '||v_row.requested_amount_kes::text||' has been marked paid.';
  end if;

  perform private.notify_partner(
    v_row.partner_id,'pickup_station','withdrawal_'||p_decision,v_title,v_message,
    'pickup_station_withdrawal',v_row.id,'pickup-earnings',
    jsonb_build_object('withdrawal_id',v_row.id,'amount_kes',v_row.requested_amount_kes,'decision',p_decision)
  );

  perform private.write_admin_audit(
    'pickup.withdrawal.'||p_decision,'pickup_station_withdrawal',v_row.id::text,
    to_jsonb(v_row),null,jsonb_build_object('notes',p_notes)
  );
  return jsonb_build_object('ok',true,'decision',p_decision);
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_unassign_pickup_station_partner(p_station_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid; v_station_name text;
begin
  if not (private.is_leogo_admin('delivery.manage') or private.is_leogo_admin('settings.manage')) then
    raise exception 'Pickup Station partner assignment permission required';
  end if;
  select a.user_id,s.station_name into v_uid,v_station_name
  from public.pickup_station_partner_accounts a
  join public.pickup_stations s on s.id=a.pickup_station_id
  where a.pickup_station_id=p_station_id;
  if v_uid is null then return jsonb_build_object('ok',true,'already_unassigned',true); end if;

  delete from public.pickup_station_partner_accounts where pickup_station_id=p_station_id;

  perform private.notify_partner(
    v_uid,'pickup_station','station_unassigned','Pickup Station access removed',
    'Your Pickup Station assignment for '||coalesce(v_station_name,'this station')||' has been removed by LEOGO Admin.',
    'pickup_station',p_station_id,'pickup-dashboard','{}'::jsonb
  );

  perform private.write_admin_audit('pickup.partner.unassigned','pickup_station',p_station_id::text,
    jsonb_build_object('partner_user_id',v_uid),null,'{}'::jsonb);

  return jsonb_build_object('ok',true);
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_pickup_return_status(p_return_id uuid, p_status text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row public.pickup_station_return_parcels%rowtype; v_partner uuid;
begin
  if not (private.is_leogo_admin('delivery.manage') or private.is_leogo_admin('orders.write')) then raise exception 'Admin access required'; end if;
  if p_status not in ('received_at_station','awaiting_dispatch','dispatched','completed','cancelled') then raise exception 'Invalid return status'; end if;
  select * into v_row from public.pickup_station_return_parcels where id=p_return_id for update;
  if not found then raise exception 'Return parcel not found'; end if;

  update public.pickup_station_return_parcels
  set status=p_status,admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
      dispatched_at=case when p_status='dispatched' then coalesce(dispatched_at,now()) else dispatched_at end,
      updated_at=now()
  where id=p_return_id;

  if p_status='dispatched' then
    insert into public.pickup_station_parcel_events(
      pickup_station_id,return_parcel_id,order_id,event_type,parcel_reference,actor_user_id,notes
    ) values (
      v_row.pickup_station_id,v_row.id,v_row.original_order_id,'return_dispatched',v_row.return_reference,(select auth.uid()),
      coalesce(nullif(btrim(coalesce(p_notes,'')),''),'Return parcel dispatched from Pickup Station.')
    );
  end if;

  select user_id into v_partner from public.pickup_station_partner_accounts
  where pickup_station_id=v_row.pickup_station_id and status='active';
  if v_partner is not null then
    perform private.notify_partner(
      v_partner,'pickup_station','return_status_'||p_status,'Return parcel updated',
      v_row.return_reference||' is now '||replace(p_status,'_',' ')||'.',
      'pickup_station_return',v_row.id,'pickup-returns',
      jsonb_build_object('return_reference',v_row.return_reference,'status',p_status)
    );
  end if;

  perform private.write_admin_audit('pickup.return.status_updated','pickup_station_return',v_row.id::text,to_jsonb(v_row),
    jsonb_build_object('status',p_status),jsonb_build_object('notes',p_notes));
  return jsonb_build_object('ok',true,'status',p_status);
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_book_return(p_original_order_reference text, p_customer_name text, p_customer_phone text, p_item_description text, p_return_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_station uuid := private.pickup_partner_station_id();
  v_original public.marketplace_orders%rowtype;
  v_return_id uuid;
  v_ref text;
  v_event_key text;
  v_seller record;
begin
  if v_station is null then raise exception 'Your account is not assigned to an active Pickup Station'; end if;
  if char_length(btrim(coalesce(p_customer_name,'')))<2 then raise exception 'Enter customer name'; end if;
  if char_length(regexp_replace(coalesce(p_customer_phone,''),'\D','','g'))<9 then raise exception 'Enter customer phone'; end if;
  if char_length(btrim(coalesce(p_item_description,'')))<3 then raise exception 'Describe the return parcel'; end if;
  if char_length(btrim(coalesce(p_return_reason,'')))<3 then raise exception 'Enter the return reason'; end if;

  if nullif(btrim(coalesce(p_original_order_reference,'')),'') is not null then
    select * into v_original
    from public.marketplace_orders
    where upper(order_reference)=upper(btrim(p_original_order_reference))
      and pickup_station_id=v_station
    limit 1;
    if not found then raise exception 'Original order was not found for this Pickup Station'; end if;
  end if;

  v_ref:='RET-'||to_char(now() at time zone 'Africa/Nairobi','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  insert into public.pickup_station_return_parcels(
    return_reference,pickup_station_id,original_order_id,original_order_reference,
    customer_name,customer_phone,item_description,return_reason,booked_by
  ) values (
    v_ref,v_station,
    case when v_original.id is null then null else v_original.id end,
    case when v_original.id is null then null else v_original.order_reference end,
    btrim(p_customer_name),btrim(p_customer_phone),btrim(p_item_description),btrim(p_return_reason),v_uid
  ) returning id into v_return_id;

  insert into public.pickup_station_parcel_events(
    pickup_station_id,return_parcel_id,order_id,event_type,parcel_reference,actor_user_id,notes
  ) values (
    v_station,v_return_id,case when v_original.id is null then null else v_original.id end,
    'return_booked',v_ref,v_uid,
    'Return parcel received at station: '||btrim(p_item_description)||'. Reason: '||btrim(p_return_reason)
  );

  if v_original.id is not null then
    v_event_key:='pickup_return_'||v_return_id::text;
    if not exists(select 1 from public.customer_notifications where event_key=v_event_key) then
      insert into public.customer_notifications(
        user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
      ) values (
        v_original.customer_id,'pickup_return','Return parcel booked',
        'Return '||v_ref||' linked to order '||v_original.order_reference||' has been received at the Pickup Station.',
        'marketplace_order',v_original.id,v_event_key,'orders',
        jsonb_build_object('return_reference',v_ref,'order_reference',v_original.order_reference)
      );
    end if;

    for v_seller in select distinct seller_id from public.marketplace_seller_orders where order_id=v_original.id
    loop
      perform private.notify_partner(
        v_seller.seller_id,'seller','pickup_return_booked','Return parcel booked',
        'Return '||v_ref||' linked to order '||v_original.order_reference||' has been received at the Pickup Station.',
        'marketplace_order',v_original.id,'orders',jsonb_build_object('return_reference',v_ref)
      );
    end loop;
  end if;

  perform private.write_admin_audit(
    'pickup.return.booked','pickup_station_return',v_return_id::text,
    null,jsonb_build_object('return_reference',v_ref,'pickup_station_id',v_station,'original_order_reference',v_original.order_reference),
    jsonb_build_object('actor_role','pickup_station_partner')
  );

  return jsonb_build_object('ok',true,'return_id',v_return_id,'return_reference',v_ref,'status','received_at_station');
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_earnings_report(p_from date DEFAULT (date_trunc('month'::text, (now() AT TIME ZONE 'Africa/Nairobi'::text)))::date, p_to date DEFAULT ((now() AT TIME ZONE 'Africa/Nairobi'::text))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_station uuid := private.pickup_partner_station_id();
  v_period numeric:=0;
  v_total numeric:=0;
  v_reserved numeric:=0;
  v_count bigint:=0;
  v_daily jsonb;
begin
  if v_station is null then raise exception 'Your account is not assigned to an active Pickup Station'; end if;

  select coalesce(sum(earnings_amount_kes),0),count(*)
  into v_period,v_count
  from public.pickup_station_parcels
  where pickup_station_id=v_station and status='handed_over'
    and (handed_over_at at time zone 'Africa/Nairobi')::date between p_from and p_to;

  select coalesce(sum(earnings_amount_kes),0) into v_total
  from public.pickup_station_parcels
  where pickup_station_id=v_station and status='handed_over';

  select coalesce(sum(requested_amount_kes),0) into v_reserved
  from public.pickup_station_withdrawal_requests
  where pickup_station_id=v_station and status in ('pending','approved','paid');

  select coalesce(jsonb_agg(x order by x.day desc),'[]'::jsonb) into v_daily
  from (
    select
      (handed_over_at at time zone 'Africa/Nairobi')::date as day,
      count(*) as parcels,
      sum(earnings_amount_kes) as earnings_kes
    from public.pickup_station_parcels
    where pickup_station_id=v_station and status='handed_over'
      and (handed_over_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by 1
  ) x;

  return jsonb_build_object(
    'from',p_from,'to',p_to,'parcels',v_count,'period_earnings_kes',v_period,
    'total_earnings_kes',v_total,'reserved_withdrawals_kes',v_reserved,
    'available_balance_kes',greatest(v_total-v_reserved,0),'daily',v_daily
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_get_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_account public.pickup_station_partner_accounts%rowtype;
  v_station public.pickup_stations%rowtype;
  v_month_start timestamptz := date_trunc('month',now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi';
  v_month_earned numeric := 0;
  v_total_earned numeric := 0;
  v_reserved numeric := 0;
  v_booked bigint := 0;
  v_received bigint := 0;
  v_today_received bigint := 0;
  v_today_handed bigint := 0;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select * into v_account from public.pickup_station_partner_accounts where user_id=v_uid;
  if not found then return jsonb_build_object('assigned',false); end if;
  select * into v_station from public.pickup_stations where id=v_account.pickup_station_id;

  select
    coalesce(sum(case when p.status='handed_over' then p.earnings_amount_kes else 0 end),0),
    coalesce(sum(case when p.status='handed_over' and p.handed_over_at>=v_month_start then p.earnings_amount_kes else 0 end),0),
    count(*) filter(where p.status='booked'),
    count(*) filter(where p.status='received'),
    count(*) filter(where p.received_at is not null and (p.received_at at time zone 'Africa/Nairobi')::date=(now() at time zone 'Africa/Nairobi')::date),
    count(*) filter(where p.handed_over_at is not null and (p.handed_over_at at time zone 'Africa/Nairobi')::date=(now() at time zone 'Africa/Nairobi')::date)
  into v_total_earned,v_month_earned,v_booked,v_received,v_today_received,v_today_handed
  from public.pickup_station_parcels p
  where p.pickup_station_id=v_account.pickup_station_id;

  select coalesce(sum(requested_amount_kes),0) into v_reserved
  from public.pickup_station_withdrawal_requests
  where pickup_station_id=v_account.pickup_station_id and status in ('pending','approved','paid');

  return jsonb_build_object(
    'assigned',true,
    'account',jsonb_build_object(
      'user_id',v_account.user_id,'display_name',v_account.display_name,'phone',v_account.phone,
      'status',v_account.status,'payout_method',v_account.payout_method,
      'payout_account_name',v_account.payout_account_name,'payout_phone',v_account.payout_phone,
      'payout_account_number',v_account.payout_account_number
    ),
    'station',to_jsonb(v_station),
    'booked_parcels',v_booked,
    'parcels_at_station',v_received,
    'received_today',v_today_received,
    'handed_over_today',v_today_handed,
    'month_earnings_kes',v_month_earned,
    'total_earnings_kes',v_total_earned,
    'reserved_withdrawals_kes',v_reserved,
    'available_balance_kes',greatest(v_total_earned-v_reserved,0)
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_handover_parcel(p_code text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_station uuid := private.pickup_partner_station_id();
  v_order_id uuid := private.pickup_resolve_order_for_partner(p_code);
  v_order public.marketplace_orders%rowtype;
  v_parcel public.pickup_station_parcels%rowtype;
  v_station_name text;
begin
  if v_station is null then raise exception 'Your account is not assigned to an active Pickup Station'; end if;
  select * into v_order from public.marketplace_orders where id=v_order_id for update;
  select * into v_parcel from public.pickup_station_parcels where order_id=v_order_id for update;
  select station_name into v_station_name from public.pickup_stations where id=v_station;

  if v_parcel.status='handed_over' then
    return jsonb_build_object('ok',true,'already_handed_over',true,'order_reference',v_order.order_reference,'status','handed_over');
  end if;
  if v_parcel.status<>'received' then raise exception 'Receive this parcel at the Pickup Station before handing it over'; end if;
  if v_order.payment_status in ('submitted','rejected') then
    raise exception 'Payment is not verified. Do not hand over this parcel yet';
  end if;

  update public.pickup_station_parcels
  set status='handed_over',handed_over_at=now(),handed_over_by=v_uid,last_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now()
  where id=v_parcel.id
  returning * into v_parcel;

  update public.marketplace_orders
  set order_status='delivered',
      delivered_at=coalesce(delivered_at,now()),
      payment_status=case when payment_status='cod_due' then 'cod_paid' else payment_status end,
      updated_at=now()
  where id=v_order.id;

  update public.marketplace_seller_orders
  set fulfilment_status='delivered',delivered_at=coalesce(delivered_at,now()),updated_at=now()
  where order_id=v_order.id and fulfilment_status<>'cancelled';

  insert into public.pickup_station_parcel_events(
    pickup_station_id,parcel_id,order_id,event_type,parcel_reference,actor_user_id,notes
  ) values (
    v_station,v_parcel.id,v_order.id,'handed_over',v_order.order_reference,v_uid,
    coalesce(nullif(btrim(coalesce(p_notes,'')),''),'Parcel handed over to customer.')
  );

  perform private.pickup_notify_order_parties(v_order.id,'handed_over',coalesce(v_station_name,'Pickup Station'));
  perform private.write_admin_audit(
    'pickup.parcel.handed_over','marketplace_order',v_order.id::text,
    null,jsonb_build_object('order_reference',v_order.order_reference,'pickup_station_id',v_station,'status','handed_over','earnings_amount_kes',v_parcel.earnings_amount_kes),
    jsonb_build_object('actor_role','pickup_station_partner')
  );

  return jsonb_build_object(
    'ok',true,'order_id',v_order.id,'order_reference',v_order.order_reference,
    'status','handed_over','earnings_amount_kes',v_parcel.earnings_amount_kes
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_list_history(p_from date DEFAULT (((now() AT TIME ZONE 'Africa/Nairobi'::text))::date - 30), p_to date DEFAULT ((now() AT TIME ZONE 'Africa/Nairobi'::text))::date)
 RETURNS TABLE(event_id uuid, event_type text, parcel_reference text, notes text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_station uuid := private.pickup_partner_station_id();
begin
  if v_station is null then return; end if;
  return query
  select e.id,e.event_type,e.parcel_reference,e.notes,e.created_at
  from public.pickup_station_parcel_events e
  where e.pickup_station_id=v_station
    and (e.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to
  order by e.created_at desc;
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_list_parcels()
 RETURNS TABLE(parcel_id uuid, order_id uuid, order_reference text, customer_name text, customer_phone text, payment_method text, payment_status text, order_status text, parcel_status text, pickup_fee_kes numeric, grand_total_kes numeric, booked_at timestamp with time zone, received_at timestamp with time zone, handed_over_at timestamp with time zone, seller_names text, item_summary text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_station uuid := private.pickup_partner_station_id();
begin
  if v_station is null then return; end if;
  return query
  select
    p.id,o.id,o.order_reference,o.receiver_name,o.contact_number,
    o.payment_method,o.payment_status,o.order_status,p.status,
    p.earnings_amount_kes,o.grand_total_kes,p.booked_at,p.received_at,p.handed_over_at,
    coalesce((
      select string_agg(distinct coalesce(sa.business_name,'Seller'),', ' order by coalesce(sa.business_name,'Seller'))
      from public.marketplace_seller_orders so
      left join public.seller_accounts sa on sa.user_id=so.seller_id
      where so.order_id=o.id
    ),'Seller'),
    coalesce((
      select string_agg(i.product_name||case when i.quantity<>1 then ' ×'||i.quantity::text else '' end,', ' order by i.created_at)
      from public.marketplace_order_items i where i.order_id=o.id
    ),'Order items')
  from public.pickup_station_parcels p
  join public.marketplace_orders o on o.id=p.order_id
  where p.pickup_station_id=v_station
  order by
    case p.status when 'received' then 0 when 'booked' then 1 when 'handed_over' then 2 else 3 end,
    coalesce(p.received_at,p.booked_at) desc;
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_list_returns()
 RETURNS TABLE(id uuid, return_reference text, original_order_reference text, customer_name text, customer_phone text, item_description text, return_reason text, status text, booked_at timestamp with time zone, dispatched_at timestamp with time zone, admin_notes text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_station uuid := private.pickup_partner_station_id();
begin
  if v_station is null then return; end if;
  return query
  select r.id,r.return_reference,r.original_order_reference,r.customer_name,r.customer_phone,
    r.item_description,r.return_reason,r.status,r.booked_at,r.dispatched_at,r.admin_notes
  from public.pickup_station_return_parcels r
  where r.pickup_station_id=v_station
  order by r.booked_at desc;
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_list_withdrawals()
 RETURNS TABLE(id uuid, requested_amount_kes numeric, payout_method text, payout_account_name text, payout_phone text, payout_account_number text, status text, partner_note text, admin_notes text, submitted_at timestamp with time zone, reviewed_at timestamp with time zone, paid_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_station uuid := private.pickup_partner_station_id();
begin
  if v_station is null then return; end if;
  return query
  select w.id,w.requested_amount_kes,w.payout_method,w.payout_account_name,w.payout_phone,
    w.payout_account_number,w.status,w.partner_note,w.admin_notes,w.submitted_at,w.reviewed_at,w.paid_at
  from public.pickup_station_withdrawal_requests w
  where w.pickup_station_id=v_station
  order by w.submitted_at desc;
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_lookup_parcel(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order_id uuid := private.pickup_resolve_order_for_partner(p_code);
  v_result jsonb;
begin
  select jsonb_build_object(
    'parcel_id',p.id,
    'order_id',o.id,
    'order_reference',o.order_reference,
    'customer_name',o.receiver_name,
    'customer_phone',o.contact_number,
    'payment_method',o.payment_method,
    'payment_status',o.payment_status,
    'grand_total_kes',o.grand_total_kes,
    'parcel_status',p.status,
    'booked_at',p.booked_at,
    'received_at',p.received_at,
    'handed_over_at',p.handed_over_at,
    'items',coalesce((
      select jsonb_agg(jsonb_build_object('name',i.product_name,'variant',i.variant_name,'quantity',i.quantity) order by i.created_at)
      from public.marketplace_order_items i where i.order_id=o.id
    ),'[]'::jsonb)
  ) into v_result
  from public.pickup_station_parcels p
  join public.marketplace_orders o on o.id=p.order_id
  where o.id=v_order_id;
  return v_result;
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_receive_parcel(p_code text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_station uuid := private.pickup_partner_station_id();
  v_order_id uuid := private.pickup_resolve_order_for_partner(p_code);
  v_order public.marketplace_orders%rowtype;
  v_parcel public.pickup_station_parcels%rowtype;
  v_station_name text;
begin
  if v_station is null then raise exception 'Your account is not assigned to an active Pickup Station'; end if;
  select * into v_order from public.marketplace_orders where id=v_order_id for update;
  select * into v_parcel from public.pickup_station_parcels where order_id=v_order_id for update;
  select station_name into v_station_name from public.pickup_stations where id=v_station;

  if v_parcel.status='handed_over' then raise exception 'This parcel has already been handed over'; end if;
  if v_parcel.status='received' then
    return jsonb_build_object('ok',true,'already_received',true,'order_reference',v_order.order_reference,'status','received');
  end if;
  if v_order.order_status='cancelled' then raise exception 'This order is cancelled and cannot be received'; end if;

  update public.pickup_station_parcels
  set status='received',received_at=now(),received_by=v_uid,last_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now()
  where id=v_parcel.id
  returning * into v_parcel;

  update public.marketplace_delivery_jobs
  set status='delivered',delivered_at=coalesce(delivered_at,now()),updated_at=now()
  where order_id=v_order.id and status not in ('delivered','cancelled','failed');

  insert into public.pickup_station_parcel_events(
    pickup_station_id,parcel_id,order_id,event_type,parcel_reference,actor_user_id,notes
  ) values (
    v_station,v_parcel.id,v_order.id,'received',v_order.order_reference,v_uid,
    coalesce(nullif(btrim(coalesce(p_notes,'')),''),'Parcel received and stored for customer collection.')
  );

  perform private.pickup_notify_order_parties(v_order.id,'received',coalesce(v_station_name,'Pickup Station'));
  perform private.write_admin_audit(
    'pickup.parcel.received','marketplace_order',v_order.id::text,
    null,jsonb_build_object('order_reference',v_order.order_reference,'pickup_station_id',v_station,'status','received'),
    jsonb_build_object('actor_role','pickup_station_partner')
  );

  return jsonb_build_object('ok',true,'order_id',v_order.id,'order_reference',v_order.order_reference,'status','received');
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_request_withdrawal(p_amount_kes numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_account public.pickup_station_partner_accounts%rowtype;
  v_total numeric:=0;
  v_reserved numeric:=0;
  v_available numeric:=0;
  v_id uuid;
  v_station_name text;
begin
  select * into v_account
  from public.pickup_station_partner_accounts
  where user_id=v_uid and status='active'
  for update;
  if not found then raise exception 'Your account is not assigned to an active Pickup Station'; end if;

  if p_amount_kes is null or p_amount_kes<=0 then raise exception 'Enter a valid withdrawal amount'; end if;
  if nullif(btrim(coalesce(v_account.payout_account_name,'')),'') is null then
    raise exception 'Save your payout account before requesting a withdrawal';
  end if;
  if v_account.payout_method='mpesa' and nullif(btrim(coalesce(v_account.payout_phone,'')),'') is null then
    raise exception 'Save your M-Pesa payout phone before requesting a withdrawal';
  end if;

  select coalesce(sum(earnings_amount_kes),0) into v_total
  from public.pickup_station_parcels
  where pickup_station_id=v_account.pickup_station_id and status='handed_over';

  select coalesce(sum(requested_amount_kes),0) into v_reserved
  from public.pickup_station_withdrawal_requests
  where pickup_station_id=v_account.pickup_station_id and status in ('pending','approved','paid');

  v_available:=greatest(v_total-v_reserved,0);
  if p_amount_kes>v_available then raise exception 'Requested amount is higher than your available balance'; end if;

  insert into public.pickup_station_withdrawal_requests(
    partner_id,pickup_station_id,requested_amount_kes,payout_method,payout_account_name,
    payout_phone,payout_account_number,partner_note
  ) values (
    v_uid,v_account.pickup_station_id,round(p_amount_kes,2),v_account.payout_method,v_account.payout_account_name,
    v_account.payout_phone,v_account.payout_account_number,nullif(btrim(coalesce(p_note,'')),'')
  ) returning id into v_id;

  select station_name into v_station_name from public.pickup_stations where id=v_account.pickup_station_id;

  insert into public.pickup_station_parcel_events(
    pickup_station_id,event_type,parcel_reference,actor_user_id,notes
  ) values (
    v_account.pickup_station_id,'withdrawal_requested','WITHDRAWAL-'||v_id::text,v_uid,
    'Withdrawal request '||v_id::text||' for KSh '||round(p_amount_kes,2)::text||' from '||coalesce(v_station_name,'Pickup Station')
  );

  perform private.write_admin_audit(
    'pickup.withdrawal.requested','pickup_station_withdrawal',v_id::text,
    null,jsonb_build_object('amount_kes',round(p_amount_kes,2),'pickup_station_id',v_account.pickup_station_id),
    jsonb_build_object('actor_role','pickup_station_partner')
  );

  return jsonb_build_object('ok',true,'withdrawal_id',v_id,'requested_amount_kes',round(p_amount_kes,2),'status','pending');
end
$function$;

CREATE OR REPLACE FUNCTION public.pickup_partner_update_payout(p_method text, p_account_name text, p_phone text DEFAULT NULL::text, p_account_number text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_row public.pickup_station_partner_accounts%rowtype;
begin
  if p_method not in ('mpesa','bank','till','paybill') then raise exception 'Choose a supported payout method'; end if;
  if char_length(btrim(coalesce(p_account_name,'')))<2 then raise exception 'Enter the payout account name'; end if;
  if p_method='mpesa' and char_length(regexp_replace(coalesce(p_phone,''),'\D','','g'))<9 then raise exception 'Enter a valid M-Pesa phone number'; end if;

  update public.pickup_station_partner_accounts
  set payout_method=p_method,payout_account_name=btrim(p_account_name),
      payout_phone=nullif(btrim(coalesce(p_phone,'')),''),
      payout_account_number=nullif(btrim(coalesce(p_account_number,'')),''),
      updated_at=now()
  where user_id=v_uid and status='active'
  returning * into v_row;
  if not found then raise exception 'Your account is not assigned to an active Pickup Station'; end if;
  return jsonb_build_object('ok',true,'account',to_jsonb(v_row));
end
$function$;


drop trigger if exists trg_create_pickup_parcel_from_order on public.marketplace_orders;
create trigger trg_create_pickup_parcel_from_order
after insert on public.marketplace_orders
for each row execute function private.create_pickup_parcel_from_order();

insert into public.pickup_station_parcels(
  order_id,pickup_station_id,parcel_reference,status,earnings_amount_kes,booked_at,handed_over_at,updated_at
)
select o.id,o.pickup_station_id,o.order_reference,
       case when o.order_status='delivered' then 'handed_over' else 'booked' end,
       coalesce(o.pickup_fee_kes,0),o.created_at,
       case when o.order_status='delivered' then o.delivered_at else null end,now()
from public.marketplace_orders o
where o.delivery_zone='pickup' and o.pickup_station_id is not null
on conflict(order_id) do nothing;

alter table public.partner_notifications drop constraint if exists partner_notifications_partner_type_check;
alter table public.partner_notifications add constraint partner_notifications_partner_type_check
check (partner_type = any(array[
  'seller'::text,'transport'::text,'service'::text,'service_provider'::text,
  'cyber'::text,'premium'::text,'accommodation'::text,'pickup_station'::text
]));

grant execute on function public.pickup_partner_get_dashboard() to authenticated;
grant execute on function public.pickup_partner_list_parcels() to authenticated;
grant execute on function public.pickup_partner_lookup_parcel(text) to authenticated;
grant execute on function public.pickup_partner_receive_parcel(text,text) to authenticated;
grant execute on function public.pickup_partner_handover_parcel(text,text) to authenticated;
grant execute on function public.pickup_partner_list_history(date,date) to authenticated;
grant execute on function public.pickup_partner_earnings_report(date,date) to authenticated;
grant execute on function public.pickup_partner_update_payout(text,text,text,text) to authenticated;
grant execute on function public.pickup_partner_request_withdrawal(numeric,text) to authenticated;
grant execute on function public.pickup_partner_list_withdrawals() to authenticated;
grant execute on function public.pickup_partner_book_return(text,text,text,text,text) to authenticated;
grant execute on function public.pickup_partner_list_returns() to authenticated;

grant execute on function public.admin_list_pickup_station_partners() to authenticated;
grant execute on function public.admin_assign_pickup_station_partner(uuid,text,text,text) to authenticated;
grant execute on function public.admin_unassign_pickup_station_partner(uuid) to authenticated;
grant execute on function public.admin_list_pickup_station_events(integer) to authenticated;
grant execute on function public.admin_list_pickup_station_withdrawals() to authenticated;
grant execute on function public.admin_review_pickup_station_withdrawal(uuid,text,text) to authenticated;
grant execute on function public.admin_list_pickup_station_returns() to authenticated;
grant execute on function public.admin_update_pickup_return_status(uuid,text,text) to authenticated;
