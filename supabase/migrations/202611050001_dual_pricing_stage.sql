-- STAGING ONLY. Do not merge until customer checkout, seller settlement and promotions are integrated and tested.
-- Seller price_kes is unchanged; LEOGO overrides are optional and can be backfilled after approval.
alter table public.seller_products add column if not exists leogo_price_kes numeric(12,2) check (leogo_price_kes is null or leogo_price_kes >= 0);
alter table public.seller_product_variants add column if not exists leogo_price_kes numeric(12,2) check (leogo_price_kes is null or leogo_price_kes >= 0);
alter table public.marketplace_order_items add column if not exists seller_unit_price_kes numeric(12,2);
alter table public.marketplace_order_items add column if not exists leogo_markup_kes numeric(12,2);

CREATE OR REPLACE FUNCTION public.admin_list_approval_queue()
 RETURNS TABLE(kind text, record_id uuid, applicant_id uuid, applicant_name text, applicant_email text, title text, subtitle text, amount_kes numeric, status text, submitted_at timestamp with time zone, payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;

  return query
  with combined(kind,record_id,applicant_id,applicant_name,applicant_email,title,subtitle,amount_kes,status,submitted_at,payload) as (
    select 'seller_application'::text,s.user_id,s.user_id,
      s.business_name,u.email::text,'Seller Registration'::text,
      concat_ws(' · ',s.owner_name,s.town,s.county),
      null::numeric,s.application_status,coalesce(s.submitted_at,s.created_at),to_jsonb(s)
    from public.seller_accounts s
    left join auth.users u on u.id=s.user_id
    where s.application_status in ('submitted','under_review','changes_requested')

    union all
    select 'seller_product'::text,p.id,p.seller_id,
      s.business_name,u.email::text,p.product_name,
      concat_ws(' · ',coalesce(nullif(p.custom_category_name,''),c.name),coalesce(nullif(p.custom_subcategory_name,''),sc.name)),
      p.price_kes::numeric,p.product_approval_status,coalesce(p.product_submitted_at,p.updated_at,p.created_at),
      to_jsonb(p)
        || jsonb_build_object(
          'seller_name',s.business_name,
          'seller_owner',s.owner_name,
          'category_name',coalesce(nullif(p.custom_category_name,''),c.name),
          'subcategory_name',coalesce(nullif(p.custom_subcategory_name,''),sc.name),
          'variant_count',(select count(*) from public.seller_product_variants v where v.product_id=p.id),
          'variants',coalesce((
            select jsonb_agg(jsonb_build_object(
              'variant_id',v.id,'variant_name',v.variant_name,'price_kes',v.price_kes,'leogo_price_kes',v.leogo_price_kes,
              'quantity_available',v.quantity_available,'image_path',v.image_path
            ) order by v.display_order,v.created_at)
            from public.seller_product_variants v where v.product_id=p.id
          ),'[]'::jsonb),
          'variant_image_paths',coalesce((
            select jsonb_agg(v.image_path order by v.display_order,v.created_at)
            from public.seller_product_variants v
            where v.product_id=p.id and nullif(v.image_path,'') is not null
          ),'[]'::jsonb)
        )
    from public.seller_products p
    join public.seller_accounts s on s.user_id=p.seller_id
    left join auth.users u on u.id=p.seller_id
    left join public.product_categories c on c.id=p.category_id
    left join public.product_subcategories sc on sc.id=p.subcategory_id
    where p.product_approval_status in ('pending','under_review','changes_requested')

    union all
    select 'premium_customer'::text,c.user_id,c.user_id,
      coalesce(d.real_name,u.email::text,'Premium Customer'),u.email::text,
      'Premium Customer Application'::text,concat_ws(' · ',c.sex,c.age::text || ' years',c.location),
      null::numeric,c.application_status,coalesce(c.submitted_at,c.created_at),
      to_jsonb(c)||coalesce(to_jsonb(d),'{}'::jsonb)
    from public.premium_customers c
    left join public.premium_customer_private_details d on d.user_id=c.user_id
    left join auth.users u on u.id=c.user_id
    where c.application_status in ('submitted','under_review')

    union all
    select 'premium_profile',p.user_id,p.user_id,
      coalesce(i.real_name,p.display_name,u.email::text,'Premium Profile'),u.email::text,
      'Verified Premium Profile'::text,concat_ws(' · ',p.display_name,p.gender,p.general_location),
      null::numeric,p.application_status,coalesce(p.submitted_at,p.created_at),
      to_jsonb(p)||coalesce(to_jsonb(i),'{}'::jsonb)
    from public.premium_profiles p
    left join public.premium_identity_details i on i.user_id=p.user_id
    left join auth.users u on u.id=p.user_id
    where p.application_status in ('submitted','under_review')

    union all
    select 'premium_payment',pay.id,pay.user_id,
      coalesce(cp.full_name,u.email::text,'Premium Customer'),u.email::text,
      pay.plan_name,'Premium membership payment · '||pay.payment_reference,
      pay.amount_kes::numeric,pay.payment_status,pay.submitted_at,to_jsonb(pay)
    from public.premium_membership_payments pay
    left join public.customer_profiles cp on cp.user_id=pay.user_id
    left join auth.users u on u.id=pay.user_id
    where pay.payment_status='pending'

    union all
    select 'wallet_deposit',d.id,d.user_id,
      coalesce(cp.full_name,u.email::text,'Wallet Customer'),u.email::text,
      case when d.deposit_kind='daily_challenge' then 'Daily Saving Challenge' else 'Wallet Saving Deposit' end,
      'Payment reference · '||d.payment_reference,d.requested_amount_kes::numeric,d.request_status,d.submitted_at,to_jsonb(d)
    from public.wallet_deposit_requests d
    left join public.customer_profiles cp on cp.user_id=d.user_id
    left join auth.users u on u.id=d.user_id
    where d.request_status='pending'

    union all
    select 'wallet_loan',l.id,l.user_id,
      coalesce(cp.full_name,u.email::text,'Loan Applicant'),u.email::text,
      'Wallet Loan Application'::text,l.purpose,l.requested_amount_kes::numeric,l.application_status,l.submitted_at,to_jsonb(l)
    from public.wallet_loan_applications l
    left join public.customer_profiles cp on cp.user_id=l.user_id
    left join auth.users u on u.id=l.user_id
    where l.application_status in ('pending','under_review')

    union all
    select 'wallet_withdrawal',w.id,w.user_id,
      coalesce(cp.full_name,u.email::text,'Wallet Customer'),u.email::text,
      'Wallet Withdrawal Request'::text,concat_ws(' · ',w.settlement_method,w.account_name,w.account_number),
      w.requested_amount_kes,w.request_status,w.submitted_at,to_jsonb(w)
    from public.wallet_withdrawal_requests w
    left join public.customer_profiles cp on cp.user_id=w.user_id
    left join auth.users u on u.id=w.user_id
    where w.request_status in ('pending_call','approved_processing')

    union all
    select 'accommodation_host',h.id,h.user_id,
      h.business_name,u.email::text,'Accommodation Host Application'::text,
      concat_ws(' · ',h.contact_phone,h.contact_email),null::numeric,h.verification_status,h.created_at,to_jsonb(h)
    from public.accommodation_hosts h
    left join auth.users u on u.id=h.user_id
    where h.verification_status in ('pending','under_review')

    union all
    select 'accommodation_property',p.id,h.user_id,
      h.business_name,u.email::text,p.property_name,concat_ws(' · ',p.property_type,p.town,p.county),
      null::numeric,p.approval_status,p.created_at,to_jsonb(p)
    from public.accommodation_properties p
    join public.accommodation_hosts h on h.id=p.host_id
    left join auth.users u on u.id=h.user_id
    where p.approval_status in ('submitted','under_review')
  )
  select * from combined
  order by submitted_at desc nulls last,kind,record_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_review_seller_product_priced(p_record_id uuid, p_decision text, p_notes text, p_leogo_price_kes numeric, p_variant_prices jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_prices jsonb;v_result jsonb;
begin
  if (select auth.uid()) is null or not private.is_leogo_admin('approvals.manage') then
    raise exception 'Product approval permission required';
  end if;
  if p_decision <> 'approve' then raise exception 'Priced approval supports approve only'; end if;
  v_prices:=public.admin_set_product_leogo_prices(p_record_id,p_leogo_price_kes,p_variant_prices);
  v_result:=public.admin_review_seller_product(p_record_id,p_decision,p_notes);
  return v_result||jsonb_build_object('pricing',v_prices);
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_set_product_leogo_prices(p_product_id uuid, p_price numeric, p_variants jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_product public.seller_products%rowtype; v_entry jsonb; v_id uuid; v_price numeric; v_expected integer; v_seen integer:=0; v_before jsonb;
begin
  if (select auth.uid()) is null or not private.is_leogo_admin('approvals.manage') then
    raise exception 'Product approval permission required';
  end if;
  select * into v_product from public.seller_products where id=p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  if v_product.product_approval_status not in ('pending','under_review','changes_requested') then
    raise exception 'Only products pending approval can be priced';
  end if;
  if p_price is null or p_price < v_product.price_kes then
    raise exception 'LEOGO product price must cover the Seller price';
  end if;
  if jsonb_typeof(coalesce(p_variants,'[]'::jsonb)) <> 'array' then raise exception 'Invalid variation price list'; end if;
  v_before:=to_jsonb(v_product);
  select count(*) into v_expected from public.seller_product_variants where product_id=p_product_id;
  if jsonb_array_length(p_variants) <> v_expected then raise exception 'Provide a price for every product variation'; end if;
  for v_entry in select value from jsonb_array_elements(p_variants) loop
    v_id:=nullif(v_entry->>'variant_id','')::uuid;
    v_price:=nullif(v_entry->>'leogo_price_kes','')::numeric;
    if v_id is null or v_price is null or v_seen>=v_expected then raise exception 'Invalid variant price'; end if;
    update public.seller_product_variants
    set leogo_price_kes=v_price,updated_at=now()
    where id=v_id and product_id=p_product_id and price_kes<=v_price;
    if not found then raise exception 'LEOGO variant price must cover the corresponding Seller price'; end if;
    v_seen:=v_seen+1;
  end loop;
  update public.seller_products set leogo_price_kes=p_price,updated_at=now() where id=p_product_id;
  perform private.write_admin_audit(
   'approval.seller_product.set_leogo_prices','seller_product',p_product_id::text,
   v_before,(select to_jsonb(p) from public.seller_products p where id=p_product_id),
   jsonb_build_object('seller_price',v_product.price_kes,'leogo_price',p_price,'variants',p_variants)
  );
  return jsonb_build_object('ok',true,'product_id',p_product_id,'leogo_price_kes',p_price,'variant_count',v_seen);
end $function$
;

revoke all on function public.admin_set_product_leogo_prices(uuid,numeric,jsonb) from public,anon;
grant execute on function public.admin_set_product_leogo_prices(uuid,numeric,jsonb) to authenticated;
revoke all on function public.admin_review_seller_product_priced(uuid,text,text,numeric,jsonb) from public,anon;
grant execute on function public.admin_review_seller_product_priced(uuid,text,text,numeric,jsonb) to authenticated;

-- Staged customer catalogue and exact checkout price snapshots.
CREATE OR REPLACE FUNCTION public.customer_marketplace_catalogue()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  perform private.close_expired_group_campaigns();

  select coalesce(jsonb_agg(row_data order by (row_data->>'updated_at')::timestamptz desc),'[]'::jsonb)
  into v_result
  from (
    select (to_jsonb(p) - 'leogo_price_kes' - 'price_kes' - ARRAY['product_review_notes','product_reviewed_by','product_reviewed_at','flash_sale_admin_notes','flash_sale_reviewed_by','flash_sale_reviewed_at']::text[])||jsonb_build_object(
      'price_kes',coalesce(p.leogo_price_kes,p.price_kes),
      'seller_name',s.business_name,
      'category_code',c.code,
      'category_name',coalesce(nullif(p.custom_category_name,''),c.name),
      'category_is_aggregator',c.is_aggregator,
      'category_restricted',c.restricted_category,
      'subcategory_name',coalesce(nullif(p.custom_subcategory_name,''),sc.name),
      'shipping_profile',case when ship.product_id is null then null else to_jsonb(ship)-'seller_id'-'created_at'-'updated_at' end,
      'shipping_defaults',(select to_jsonb(d)-'updated_by'-'updated_at' from public.platform_shipping_defaults d where d.id=1),
      'delivery_rates',(select public.public_get_delivery_rate_settings()),
      'group_campaign',case when go.id is null then null else jsonb_build_object(
        'id',go.id,
        'campaign_reference',go.campaign_reference,
        'minimum_quantity',go.minimum_quantity,
        'maximum_quantity',go.maximum_quantity,
        'customer_unit_price_kes',go.customer_unit_price_kes,
        'opening_at',go.opening_at,
        'closing_at',go.closing_at,
        'expected_dispatch_date',go.expected_dispatch_date,
        'expected_delivery_from',go.expected_delivery_from,
        'expected_delivery_to',go.expected_delivery_to,
        'close_policy',go.close_policy,
        'status',go.status,
        'quantity_committed',go.quantity_committed,
        'participant_count',go.participant_count
      ) end,
      'variants',coalesce((
        select jsonb_agg((to_jsonb(v)-'leogo_price_kes'-'price_kes')||jsonb_build_object('price_kes',coalesce(v.leogo_price_kes,v.price_kes)) order by v.display_order,v.created_at)
        from public.seller_product_variants v
        where v.product_id=p.id and v.is_active
      ),'[]'::jsonb),
      'rating_average',coalesce((
        select round(avg(r.rating)::numeric,1)
        from public.marketplace_product_reviews r
        where r.product_id=p.id and r.moderation_status='approved'
      ),0),
      'review_count',(
        select count(*)
        from public.marketplace_product_reviews r
        where r.product_id=p.id and r.moderation_status='approved'
      ),
      'approved_reviews',coalesce((
        select jsonb_agg(review_row order by (review_row->>'created_at')::timestamptz desc)
        from (
          select jsonb_build_object(
            'review_id',r.id,
            'rating',r.rating,
            'comment',r.comment,
            'variant_name',v.variant_name,
            'created_at',r.created_at,
            'verified_purchase',true
          ) review_row
          from public.marketplace_product_reviews r
          left join public.seller_product_variants v on v.id=r.variant_id
          where r.product_id=p.id and r.moderation_status='approved'
          order by r.created_at desc
          limit 8
        ) approved
      ),'[]'::jsonb)
    ) row_data
    from public.seller_products p
    join public.seller_accounts s on s.user_id=p.seller_id
    join public.product_categories c on c.id=p.category_id
    left join public.product_subcategories sc on sc.id=p.subcategory_id
    left join public.product_shipping_profiles ship on ship.product_id=p.id
    left join lateral(
      select g.*
      from public.group_order_campaigns g
      where g.product_id=p.id
        and g.status in (
          'collecting_orders','paused','moq_reached','order_confirmed',
          'seller_preparing','dispatched_origin','in_transit',
          'arrived_destination','at_sorting_center','out_for_delivery','ready_pickup'
        )
      order by g.created_at desc
      limit 1
    ) go on true
    where s.application_status='approved'
      and private.partner_has_active_subscription(s.user_id,'seller')
      and p.product_approval_status='approved'
      and p.listing_status='active'
      and p.availability_status in ('available','out_of_stock')
      and c.is_active
      and c.code<>'alcoholic_leogo_bar'
  ) q;

  return v_result;
end
$function$
;
CREATE OR REPLACE FUNCTION public.customer_marketplace_products()
 RETURNS TABLE(id uuid, seller_id uuid, seller_name text, product_name text, price_kes numeric, availability_status text, quantity_available numeric, measurement_unit text, accepts_lipa_pole_pole boolean, lipa_pole_pole_first_deposit_kes numeric, lipa_pole_pole_max_days integer, product_details text, main_image_path text, flash_sale_requested boolean, flash_sale_price_kes numeric, flash_sale_status text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id,p.seller_id,s.business_name,p.product_name,coalesce(p.leogo_price_kes,p.price_kes),p.availability_status,p.quantity_available,
    p.measurement_unit,p.accepts_lipa_pole_pole,p.lipa_pole_pole_first_deposit_kes,p.lipa_pole_pole_max_days,
    p.product_details,p.main_image_path,p.flash_sale_requested,p.flash_sale_price_kes,p.flash_sale_status
  from public.seller_products p
  join public.seller_accounts s on s.user_id=p.seller_id
  join public.product_categories c on c.id=p.category_id
  where s.application_status='approved'
    and private.partner_has_active_subscription(s.user_id,'seller')
    and p.product_approval_status='approved'
    and p.listing_status='active'
    and p.availability_status in ('available','out_of_stock')
    and c.is_active
    and not c.restricted_category
  order by random();
$function$
;
CREATE OR REPLACE FUNCTION public.customer_create_marketplace_order(p_items jsonb, p_receiver_name text, p_contact_number text, p_delivery_zone text, p_county text DEFAULT NULL::text, p_sub_county text DEFAULT NULL::text, p_estate text DEFAULT NULL::text, p_landmark text DEFAULT NULL::text, p_location_link text DEFAULT NULL::text, p_pickup_station_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT NULL::text, p_payment_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=(select auth.uid());
  v_order_id uuid;
  v_ref text;
  v_subtotal numeric:=0;
  v_service numeric:=0;
  v_pickup numeric:=0;
  v_delivery numeric:=0;
  v_total numeric:=0;
  v_item jsonb;
  v_product public.seller_products%rowtype;
  v_variant public.seller_product_variants%rowtype;
  v_variant_id uuid;
  v_qty numeric;
  v_unit_price numeric;
  v_seller_unit_price numeric;
  v_flash_active boolean:=false;
  v_flash_cart_qty numeric:=0;
  v_payment_status text;
  v_seller_approved boolean;
  v_delivery_campaign_id uuid;
  v_delivery_funded numeric:=0;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Cart is empty'; end if;
  if p_delivery_zone not in ('pickup','cbd','estate','outside') then raise exception 'Choose a supported delivery zone'; end if;
  if p_payment_method not in ('till','paybill','cod') then raise exception 'Choose a supported payment method'; end if;
  if char_length(btrim(coalesce(p_receiver_name,'')))<2 or char_length(btrim(coalesce(p_contact_number,'')))<7 then
    raise exception 'Receiver name and contact are required';
  end if;
  if p_delivery_zone='pickup' and p_pickup_station_id is null then raise exception 'Choose a pickup station'; end if;

  -- Validate every line and calculate the exact server-side subtotal.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty:=coalesce((v_item->>'quantity')::numeric,0);
    if v_qty<=0 then raise exception 'Invalid item quantity'; end if;

    select p.* into v_product
    from public.seller_products p
    where p.id=(v_item->>'product_id')::uuid
      and p.product_approval_status='approved'
      and p.listing_status='active'
      and p.availability_status='available'
    for update;

    if not found then raise exception 'A product in your cart is no longer approved or available'; end if;
    if v_product.fulfilment_type='group_order' and not coalesce((select s.local_available from public.product_shipping_profiles s where s.product_id=v_product.id),false) then raise exception 'Use Join Group Order for MOQ products'; end if;

    select exists(
      select 1 from public.seller_accounts s
      where s.user_id=v_product.seller_id and s.application_status='approved'
    ) into v_seller_approved;

    if not v_seller_approved then
      raise exception 'A Seller in your cart is not currently approved';
    end if;

    v_flash_active:=(
      v_product.flash_sale_requested
      and v_product.flash_sale_status='approved'
      and v_product.flash_sale_price_kes is not null
      and v_product.flash_sale_price_kes>0
      and v_product.flash_sale_starts_at<=now()
      and v_product.flash_sale_ends_at>now()
      and coalesce(v_product.flash_sale_quantity,0)>0
    );

    if v_flash_active then
      select coalesce(sum((cart_item->>'quantity')::numeric),0)
      into v_flash_cart_qty
      from jsonb_array_elements(p_items) cart_item
      where (cart_item->>'product_id')::uuid=v_product.id;

      if v_flash_cart_qty>v_product.flash_sale_quantity then
        raise exception 'Only % Flash Sale unit(s) remain for %',
          v_product.flash_sale_quantity,v_product.product_name;
      end if;
    end if;

    v_variant_id:=nullif(v_item->>'variant_id','')::uuid;

    if v_product.has_variants then
      if v_variant_id is null then
        raise exception 'Choose a variant for %',v_product.product_name;
      end if;

      select * into v_variant
      from public.seller_product_variants
      where id=v_variant_id
        and product_id=v_product.id
        and is_active=true
      for update;

      if not found then raise exception 'The selected variant for % is no longer available',v_product.product_name; end if;
      if v_variant.quantity_available < v_qty then
        raise exception '% — % does not have enough stock',v_product.product_name,v_variant.variant_name;
      end if;
      v_seller_unit_price:=case when v_flash_active
        then least(v_variant.price_kes,v_product.flash_sale_price_kes)
        else v_variant.price_kes end;
      v_unit_price:=case when v_flash_active
        then least(coalesce(v_variant.leogo_price_kes,v_variant.price_kes),v_product.flash_sale_price_kes)
        else coalesce(v_variant.leogo_price_kes,v_variant.price_kes) end;
    else
      if v_product.quantity_available < v_qty then
        raise exception '% does not have enough stock',v_product.product_name;
      end if;
      v_seller_unit_price:=case when v_flash_active
        then least(v_product.price_kes,v_product.flash_sale_price_kes)
        else v_product.price_kes end;
      v_unit_price:=case when v_flash_active
        then least(coalesce(v_product.leogo_price_kes,v_product.price_kes),v_product.flash_sale_price_kes)
        else coalesce(v_product.leogo_price_kes,v_product.price_kes) end;
      v_variant_id:=null;
    end if;

    if not v_product.has_variants then
      v_unit_price:=private.market_day_checkout_unit_price(v_product.id,v_unit_price,v_qty,v_flash_active,false,p_county);
    end if;
    v_subtotal:=v_subtotal+(v_unit_price*v_qty);
  end loop;

  v_service:=round(v_subtotal * case when v_subtotal>=coalesce((select service_fee_threshold_kes from public.order_settings where id=1),3000) then coalesce((select service_fee_at_or_above_percent from public.order_settings where id=1),1.5)/100 else coalesce((select service_fee_below_percent from public.order_settings where id=1),2)/100 end,2);

  if p_delivery_zone in ('cbd','estate','outside') then
    v_delivery:=private.delivery_fee_for_zone(p_delivery_zone);
  else
    select
      round(v_subtotal*(coalesce(service_fee_percent,0)/100),2),
      coalesce(shipping_fee_kes,0)
      into v_pickup,v_delivery
    from public.pickup_stations
    where id=p_pickup_station_id and is_active=true;

    if not found then raise exception 'Pickup station is not available'; end if;
  end if;

  v_delivery_campaign_id:=private.reserve_leogo_delivery_subsidy(
    v_subtotal,p_county,p_sub_county,p_estate,p_delivery_zone,v_delivery);
  if v_delivery_campaign_id is not null then
    v_delivery_funded:=v_delivery;
    v_delivery:=0;
  end if;
  v_total:=v_subtotal+v_service+v_pickup+v_delivery;
  if p_payment_method='cod' and v_subtotal>=coalesce((select cod_limit_kes from public.order_settings where id=1),10000) then
    raise exception 'Cash on Delivery is available only below KSh %',coalesce((select cod_limit_kes from public.order_settings where id=1),10000);
  end if;
  v_ref:='LEOGO-'||to_char(clock_timestamp(),'YYMMDDHH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
  v_payment_status:=case when p_payment_method='cod' then 'cod_due' else 'submitted' end;

  insert into public.marketplace_orders(
    order_reference,customer_id,receiver_name,contact_number,delivery_zone,county,sub_county,estate,landmark,location_link,pickup_station_id,
    items_subtotal_kes,service_fee_kes,pickup_fee_kes,delivery_fee_kes,grand_total_kes,payment_method,payment_status,payment_message
  )
  values(
    v_ref,v_uid,btrim(p_receiver_name),btrim(p_contact_number),p_delivery_zone,
    nullif(btrim(coalesce(p_county,'')),''),
    nullif(btrim(coalesce(p_sub_county,'')),''),
    nullif(btrim(coalesce(p_estate,'')),''),
    nullif(btrim(coalesce(p_landmark,'')),''),
    nullif(btrim(coalesce(p_location_link,'')),''),
    p_pickup_station_id,v_subtotal,v_service,v_pickup,v_delivery,v_total,p_payment_method,v_payment_status,
    nullif(btrim(coalesce(p_payment_message,'')),'')
  )
  returning id into v_order_id;

  if v_delivery_campaign_id is not null then
    insert into public.leogo_delivery_subsidy_redemptions(order_id,campaign_id,funded_fee_kes)
    values(v_order_id,v_delivery_campaign_id,v_delivery_funded);
  end if;

  -- Create immutable order lines and reserve stock.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty:=(v_item->>'quantity')::numeric;

    select * into v_product
    from public.seller_products
    where id=(v_item->>'product_id')::uuid
    for update;

    v_flash_active:=(
      v_product.flash_sale_requested
      and v_product.flash_sale_status='approved'
      and v_product.flash_sale_price_kes is not null
      and v_product.flash_sale_price_kes>0
      and v_product.flash_sale_starts_at<=now()
      and v_product.flash_sale_ends_at>now()
      and coalesce(v_product.flash_sale_quantity,0)>0
    );

    v_variant_id:=nullif(v_item->>'variant_id','')::uuid;

    if v_product.has_variants then
      select * into v_variant
      from public.seller_product_variants
      where id=v_variant_id and product_id=v_product.id
      for update;

      v_seller_unit_price:=case when v_flash_active
        then least(v_variant.price_kes,v_product.flash_sale_price_kes)
        else v_variant.price_kes end;
      v_unit_price:=case when v_flash_active
        then least(coalesce(v_variant.leogo_price_kes,v_variant.price_kes),v_product.flash_sale_price_kes)
        else coalesce(v_variant.leogo_price_kes,v_variant.price_kes) end;

      insert into public.marketplace_order_items(
        order_id,seller_id,product_id,variant_id,product_name,variant_name,variant_image_path,
        unit_price_kes,quantity,line_total_kes,seller_unit_price_kes,leogo_markup_kes
      )
      values(
        v_order_id,v_product.seller_id,v_product.id,v_variant.id,v_product.product_name,v_variant.variant_name,v_variant.image_path,
        v_unit_price,v_qty,v_unit_price*v_qty,v_seller_unit_price,(v_unit_price-v_seller_unit_price)*v_qty
      );

      update public.seller_product_variants
      set quantity_available=greatest(quantity_available-v_qty,0)
      where id=v_variant.id;

      update public.seller_products p
      set quantity_available=coalesce((
            select sum(v.quantity_available)
            from public.seller_product_variants v
            where v.product_id=p.id and v.is_active
          ),0),
          availability_status=case when coalesce((
            select sum(v.quantity_available)
            from public.seller_product_variants v
            where v.product_id=p.id and v.is_active
          ),0)<=0 then 'out_of_stock' else 'available' end,
          flash_sale_quantity=case when v_flash_active then greatest(coalesce(flash_sale_quantity,0)-v_qty,0) else flash_sale_quantity end,
          flash_sale_status=case when v_flash_active and coalesce(flash_sale_quantity,0)-v_qty<=0 then 'expired' else flash_sale_status end,
          flash_sale_requested=case when v_flash_active and coalesce(flash_sale_quantity,0)-v_qty<=0 then false else flash_sale_requested end,
          updated_at=now()
      where p.id=v_product.id;
    else
      v_seller_unit_price:=case when v_flash_active
        then least(v_product.price_kes,v_product.flash_sale_price_kes)
        else v_product.price_kes end;
      v_unit_price:=case when v_flash_active
        then least(coalesce(v_product.leogo_price_kes,v_product.price_kes),v_product.flash_sale_price_kes)
        else coalesce(v_product.leogo_price_kes,v_product.price_kes) end;

      v_seller_unit_price:=private.market_day_checkout_unit_price(v_product.id,v_seller_unit_price,v_qty,v_flash_active,true,p_county);
      v_unit_price:=private.market_day_checkout_unit_price(v_product.id,v_unit_price,v_qty,v_flash_active,true,p_county);

      insert into public.marketplace_order_items(
        order_id,seller_id,product_id,product_name,unit_price_kes,quantity,line_total_kes,seller_unit_price_kes,leogo_markup_kes
      )
      values(
        v_order_id,v_product.seller_id,v_product.id,v_product.product_name,v_unit_price,v_qty,v_unit_price*v_qty,v_seller_unit_price,(v_unit_price-v_seller_unit_price)*v_qty
      );

      update public.seller_products
      set quantity_available=greatest(quantity_available-v_qty,0),
          availability_status=case when quantity_available-v_qty<=0 then 'out_of_stock' else availability_status end,
          flash_sale_quantity=case when v_flash_active then greatest(coalesce(flash_sale_quantity,0)-v_qty,0) else flash_sale_quantity end,
          flash_sale_status=case when v_flash_active and coalesce(flash_sale_quantity,0)-v_qty<=0 then 'expired' else flash_sale_status end,
          flash_sale_requested=case when v_flash_active and coalesce(flash_sale_quantity,0)-v_qty<=0 then false else flash_sale_requested end,
          updated_at=now()
      where id=v_product.id;
    end if;
  end loop;

  if abs(coalesce((select sum(i.line_total_kes) from public.marketplace_order_items i
    where i.order_id=v_order_id),0)-v_subtotal)>0.01 then
    raise exception 'Market Day price changed during checkout. Please retry your order.';
  end if;

  insert into public.marketplace_seller_orders(order_id,seller_id,seller_subtotal_kes)
  select v_order_id,seller_id,sum(coalesce(seller_unit_price_kes,unit_price_kes)*quantity)
  from public.marketplace_order_items
  where order_id=v_order_id
  group by seller_id;

  perform private.notify_partner(
    so.seller_id,'seller','new_order','New customer order',
    'A customer placed order '||v_ref||'. Open Orders to receive and prepare it.',
    'marketplace_order',v_order_id,'orders',
    jsonb_build_object('order_reference',v_ref,'seller_subtotal_kes',so.seller_subtotal_kes)
  )
  from public.marketplace_seller_orders so
  where so.order_id=v_order_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    v_uid,'order','Order placed','Your order '||v_ref||' was created successfully.',
    'marketplace_order',v_order_id,'order_placed_'||v_order_id::text,'orders',
    jsonb_build_object('order_reference',v_ref)
  );

  return jsonb_build_object(
    'order_id',v_order_id,
    'order_reference',v_ref,
    'items_subtotal_kes',v_subtotal,
    'service_fee_kes',v_service,
    'pickup_fee_kes',v_pickup,
    'delivery_fee_kes',v_delivery,
    'grand_total_kes',v_total,
    'payment_status',v_payment_status
  );
end $function$
;
