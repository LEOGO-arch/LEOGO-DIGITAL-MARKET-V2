-- Contact-through-LEOGO workflow and Admin sale-status management for personal customer listings.

create table if not exists public.customer_personal_sale_interests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.customer_personal_sale_listings(id) on delete cascade,
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  buyer_name text not null check (char_length(btrim(buyer_name)) between 2 and 120),
  buyer_phone text not null check (char_length(btrim(buyer_phone)) between 7 and 30),
  message text,
  status text not null default 'new' check (status in ('new','contacted','closed')),
  admin_notes text,
  contacted_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_personal_sale_interests enable row level security;

create index if not exists customer_personal_sale_interests_listing_idx on public.customer_personal_sale_interests(listing_id,created_at desc);
create index if not exists customer_personal_sale_interests_buyer_idx on public.customer_personal_sale_interests(buyer_user_id,created_at desc);
create index if not exists customer_personal_sale_interests_status_idx on public.customer_personal_sale_interests(status,created_at desc);

create or replace function public.customer_submit_personal_sale_interest(
  p_listing_id uuid,p_buyer_name text,p_buyer_phone text,p_message text default null
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := (select auth.uid()); v_listing public.customer_personal_sale_listings%rowtype; v_interest_id uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if char_length(btrim(coalesce(p_buyer_name,'')))<2 then raise exception 'Enter your name'; end if;
  if char_length(btrim(coalesce(p_buyer_phone,'')))<7 then raise exception 'Enter a valid phone number'; end if;
  if char_length(coalesce(p_message,''))>500 then raise exception 'Message is too long'; end if;

  select * into v_listing from public.customer_personal_sale_listings where id=p_listing_id;
  if not found then raise exception 'This item listing no longer exists'; end if;
  if v_listing.approval_status<>'approved' or v_listing.sale_status<>'available' then raise exception 'This item is no longer available'; end if;
  if v_listing.user_id=v_uid then raise exception 'You cannot send an interest request for your own item'; end if;
  if exists(select 1 from public.customer_personal_sale_interests i where i.listing_id=p_listing_id and i.buyer_user_id=v_uid and i.status in ('new','contacted')) then
    raise exception 'You already sent an active interest request for this item';
  end if;

  insert into public.customer_personal_sale_interests(listing_id,buyer_user_id,buyer_name,buyer_phone,message,status,created_at,updated_at)
  values(p_listing_id,v_uid,btrim(p_buyer_name),btrim(p_buyer_phone),nullif(btrim(coalesce(p_message,'')),''),'new',now(),now())
  returning id into v_interest_id;

  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values
  (v_listing.user_id,'personal_sale_interest','Someone is interested in your item',
   'A LEOGO customer is interested in "'||v_listing.item_name||'". LEOGO will coordinate the contact. Your private contact details remain hidden from the public.',
   'customer_personal_sale_interest',v_interest_id,'personal_sale_interest_owner_'||v_interest_id::text,'dashboard',
   jsonb_build_object('listing_id',p_listing_id,'interest_id',v_interest_id)),
  (v_uid,'personal_sale_interest_sent','Interest request sent',
   'Your interest in "'||v_listing.item_name||'" was sent through LEOGO. LEOGO Admin will coordinate contact without exposing private details publicly.',
   'customer_personal_sale_interest',v_interest_id,'personal_sale_interest_buyer_'||v_interest_id::text,'dashboard',
   jsonb_build_object('listing_id',p_listing_id,'interest_id',v_interest_id));

  return jsonb_build_object('ok',true,'interest_id',v_interest_id,'status','new');
end $$;

create or replace function public.admin_list_personal_marketplace()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_result jsonb;
begin
  if not private.is_leogo_admin('products.read') then raise exception 'Admin access required'; end if;
  select coalesce(jsonb_agg(row_data order by (row_data->>'created_at')::timestamptz desc),'[]'::jsonb)
  into v_result
  from (
    select to_jsonb(l)||jsonb_build_object(
      'seller_email',u.email,
      'interest_count',(select count(*) from public.customer_personal_sale_interests i where i.listing_id=l.id),
      'open_interest_count',(select count(*) from public.customer_personal_sale_interests i where i.listing_id=l.id and i.status in ('new','contacted'))
    ) row_data
    from public.customer_personal_sale_listings l
    left join auth.users u on u.id=l.user_id
  ) q;
  return v_result;
end $$;

create or replace function public.admin_list_personal_sale_interests()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_result jsonb;
begin
  if not private.is_leogo_admin('products.read') then raise exception 'Admin access required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'listing_id',i.listing_id,'item_name',l.item_name,'marked_price_kes',l.marked_price_kes,
    'listing_status',l.sale_status,'listing_approval_status',l.approval_status,
    'seller_user_id',l.user_id,'seller_name',l.seller_name,'seller_phone',l.phone,'seller_email',seller_user.email,
    'buyer_user_id',i.buyer_user_id,'buyer_name',i.buyer_name,'buyer_phone',i.buyer_phone,'buyer_email',buyer_user.email,
    'message',i.message,'status',i.status,'admin_notes',i.admin_notes,'contacted_at',i.contacted_at,
    'closed_at',i.closed_at,'created_at',i.created_at,'updated_at',i.updated_at
  ) order by i.created_at desc),'[]'::jsonb)
  into v_result
  from public.customer_personal_sale_interests i
  join public.customer_personal_sale_listings l on l.id=i.listing_id
  left join auth.users seller_user on seller_user.id=l.user_id
  left join auth.users buyer_user on buyer_user.id=i.buyer_user_id;
  return v_result;
end $$;

create or replace function public.admin_set_personal_sale_status(p_listing_id uuid,p_status text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_listing public.customer_personal_sale_listings%rowtype; v_before jsonb; v_after jsonb; v_title text; v_message text;
begin
  if not private.is_leogo_admin('products.manage') then raise exception 'Admin permission required'; end if;
  if p_status not in ('available','sold','removed') then raise exception 'Unsupported listing status'; end if;

  select * into v_listing from public.customer_personal_sale_listings where id=p_listing_id for update;
  if not found then raise exception 'Personal item listing not found'; end if;
  if v_listing.approval_status<>'approved' then raise exception 'Only approved personal listings can be managed here'; end if;

  v_before:=to_jsonb(v_listing);
  update public.customer_personal_sale_listings
  set sale_status=p_status,admin_notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),admin_notes),updated_at=now()
  where id=p_listing_id;

  if p_status in ('sold','removed') then
    update public.customer_personal_sale_interests
    set status='closed',closed_at=coalesce(closed_at,now()),updated_at=now()
    where listing_id=p_listing_id and status in ('new','contacted');
  end if;

  select to_jsonb(l) into v_after from public.customer_personal_sale_listings l where l.id=p_listing_id;

  v_title:=case p_status when 'sold' then 'Your item was marked sold' when 'removed' then 'Your item was removed from the marketplace' else 'Your item is available again' end;
  v_message:=case p_status when 'sold' then '"'||v_listing.item_name||'" has been marked SOLD and is no longer shown in the public marketplace.'
    when 'removed' then '"'||v_listing.item_name||'" has been removed from the public marketplace by LEOGO Admin.'
    else '"'||v_listing.item_name||'" is available again on the LEOGO Marketplace.' end;

  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(v_listing.user_id,'personal_sale_'||p_status,v_title,v_message,'customer_personal_sale',p_listing_id,
    'personal_sale_status_'||p_status||'_'||p_listing_id::text||'_'||extract(epoch from now())::bigint::text,'dashboard',
    jsonb_build_object('listing_id',p_listing_id,'sale_status',p_status,'notes',nullif(btrim(coalesce(p_notes,'')),'')));

  if p_status in ('sold','removed') then
    insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
    select distinct i.buyer_user_id,'personal_sale_unavailable',
      case when p_status='sold' then 'Item sold' else 'Item no longer available' end,
      '"'||v_listing.item_name||'" is '||case when p_status='sold' then 'now marked sold.' else 'no longer available on LEOGO.' end,
      'customer_personal_sale',p_listing_id,'personal_sale_unavailable_'||p_status||'_'||p_listing_id::text||'_'||i.buyer_user_id::text,
      'dashboard',jsonb_build_object('listing_id',p_listing_id,'sale_status',p_status)
    from public.customer_personal_sale_interests i where i.listing_id=p_listing_id;
  end if;

  perform private.write_admin_audit('personal_sale.status.'||p_status,'customer_personal_sale',p_listing_id::text,
    v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),'')));

  return jsonb_build_object('ok',true,'listing_id',p_listing_id,'sale_status',p_status);
end $$;

create or replace function public.admin_update_personal_sale_interest(p_interest_id uuid,p_status text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_interest public.customer_personal_sale_interests%rowtype; v_listing public.customer_personal_sale_listings%rowtype; v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('products.manage') then raise exception 'Admin permission required'; end if;
  if p_status not in ('new','contacted','closed') then raise exception 'Unsupported interest status'; end if;

  select * into v_interest from public.customer_personal_sale_interests where id=p_interest_id for update;
  if not found then raise exception 'Interest request not found'; end if;
  select * into v_listing from public.customer_personal_sale_listings where id=v_interest.listing_id;

  v_before:=to_jsonb(v_interest);
  update public.customer_personal_sale_interests
  set status=p_status,admin_notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),admin_notes),
      contacted_at=case when p_status='contacted' then coalesce(contacted_at,now()) else contacted_at end,
      closed_at=case when p_status='closed' then coalesce(closed_at,now()) else null end,updated_at=now()
  where id=p_interest_id;
  select to_jsonb(i) into v_after from public.customer_personal_sale_interests i where i.id=p_interest_id;

  if p_status='contacted' then
    insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
    values
    (v_interest.buyer_user_id,'personal_sale_contacted','LEOGO is coordinating your interest',
      'LEOGO Admin has started coordinating your interest in "'||v_listing.item_name||'".',
      'customer_personal_sale_interest',p_interest_id,'personal_sale_interest_contacted_buyer_'||p_interest_id::text,'dashboard',
      jsonb_build_object('listing_id',v_interest.listing_id,'interest_id',p_interest_id)),
    (v_listing.user_id,'personal_sale_contacted','LEOGO is coordinating a buyer',
      'LEOGO Admin has started coordinating a customer interested in "'||v_listing.item_name||'".',
      'customer_personal_sale_interest',p_interest_id,'personal_sale_interest_contacted_owner_'||p_interest_id::text,'dashboard',
      jsonb_build_object('listing_id',v_interest.listing_id,'interest_id',p_interest_id));
  end if;

  perform private.write_admin_audit('personal_sale.interest.'||p_status,'customer_personal_sale_interest',p_interest_id::text,
    v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),'')));

  return jsonb_build_object('ok',true,'interest_id',p_interest_id,'status',p_status);
end $$;

revoke execute on function public.customer_submit_personal_sale_interest(uuid,text,text,text) from public;
revoke execute on function public.admin_list_personal_marketplace() from public;
revoke execute on function public.admin_list_personal_sale_interests() from public;
revoke execute on function public.admin_set_personal_sale_status(uuid,text,text) from public;
revoke execute on function public.admin_update_personal_sale_interest(uuid,text,text) from public;

grant execute on function public.customer_submit_personal_sale_interest(uuid,text,text,text) to authenticated;
grant execute on function public.admin_list_personal_marketplace() to authenticated;
grant execute on function public.admin_list_personal_sale_interests() to authenticated;
grant execute on function public.admin_set_personal_sale_status(uuid,text,text) to authenticated;
grant execute on function public.admin_update_personal_sale_interest(uuid,text,text) to authenticated;
