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
declare v_product public.seller_products%rowtype; v_entry jsonb; v_id uuid; v_price numeric; v_expected integer; v_seen integer:=0; v_before jsonb; v_seen_ids uuid[]:='{}'::uuid[];
begin
  if (select auth.uid()) is null or not private.is_leogo_admin('approvals.manage') then
    raise exception 'Product approval permission required';
  end if;
  select * into v_product from public.seller_products where id=p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  if v_product.product_approval_status not in ('pending','under_review','changes_requested') then
    raise exception 'Only products pending approval can be priced';
  end if;
  if p_price is null or p_price < v_product.price_kes or p_price<>round(p_price,2) then
    raise exception 'LEOGO product price must cover the Seller price';
  end if;
  if jsonb_typeof(coalesce(p_variants,'[]'::jsonb)) <> 'array' then raise exception 'Invalid variation price list'; end if;
  v_before:=to_jsonb(v_product);
  select count(*) into v_expected from public.seller_product_variants where product_id=p_product_id;
  if jsonb_array_length(p_variants) <> v_expected then raise exception 'Provide a price for every product variation'; end if;
  for v_entry in select value from jsonb_array_elements(p_variants) loop
    v_id:=nullif(v_entry->>'variant_id','')::uuid;
    v_price:=nullif(v_entry->>'leogo_price_kes','')::numeric;
    if v_id is null or v_price is null or v_price<>round(v_price,2) or v_seen>=v_expected then raise exception 'Invalid variant price'; end if;
    if v_id=any(v_seen_ids) then raise exception 'Each variation price must be supplied exactly once'; end if;
    v_seen_ids:=array_append(v_seen_ids,v_id);
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
        then least(v_variant.price_kes,v_product.flash_sale_price_kes) + (coalesce(v_variant.leogo_price_kes,v_variant.price_kes)-v_variant.price_kes)
        else coalesce(v_variant.leogo_price_kes,v_variant.price_kes) end;
    else
      if v_product.quantity_available < v_qty then
        raise exception '% does not have enough stock',v_product.product_name;
      end if;
      v_seller_unit_price:=case when v_flash_active
        then least(v_product.price_kes,v_product.flash_sale_price_kes)
        else v_product.price_kes end;
      v_unit_price:=case when v_flash_active
        then least(v_product.price_kes,v_product.flash_sale_price_kes) + (coalesce(v_product.leogo_price_kes,v_product.price_kes)-v_product.price_kes)
        else coalesce(v_product.leogo_price_kes,v_product.price_kes) end;
      v_variant_id:=null;
    end if;

    if not v_product.has_variants then
      v_unit_price:=private.market_day_checkout_unit_price(v_product.id,v_product.price_kes,v_qty,v_flash_active,false,p_county) + (coalesce(v_product.leogo_price_kes,v_product.price_kes)-v_product.price_kes);
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
        then least(v_variant.price_kes,v_product.flash_sale_price_kes) + (coalesce(v_variant.leogo_price_kes,v_variant.price_kes)-v_variant.price_kes)
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
        then least(v_product.price_kes,v_product.flash_sale_price_kes) + (coalesce(v_product.leogo_price_kes,v_product.price_kes)-v_product.price_kes)
        else coalesce(v_product.leogo_price_kes,v_product.price_kes) end;

      -- LEOGO-funded Market Day pricing changes the customer amount only.
      -- Preserve seller settlement at the agreed seller unit price and reserve the offer once.
      v_seller_unit_price:=private.market_day_checkout_unit_price(v_product.id,v_product.price_kes,v_qty,v_flash_active,true,p_county);
      v_unit_price:=v_seller_unit_price + (coalesce(v_product.leogo_price_kes,v_product.price_kes)-v_product.price_kes);

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

CREATE OR REPLACE FUNCTION public.admin_get_leogo_markup_financial_report()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select case when private.is_leogo_admin('reports.view') or private.is_leogo_admin('settlements.read')
then jsonb_build_object(
 'leogo_markup_verified_kes',coalesce(sum(i.leogo_markup_kes) filter(where o.payment_status='verified_paid' and o.order_status<>'cancelled' and not exists(select 1 from public.wallet_checkout_payments wp where wp.order_id=o.id and wp.status='refunded')),0),
 'leogo_marketplace_commission_verified_kes',coalesce((select sum(o2.service_fee_kes) from public.marketplace_orders o2 where o2.payment_status='verified_paid' and o2.order_status<>'cancelled' and not exists(select 1 from public.wallet_checkout_payments wp2 where wp2.order_id=o2.id and wp2.status='refunded')),0),
 'leogo_markup_earned_delivered_kes',coalesce(sum(i.leogo_markup_kes) filter(where o.payment_status='verified_paid' and o.order_status='delivered'),0),
 'generated_at',now()
)
else null end
from public.marketplace_orders o
left join public.marketplace_order_items i on i.order_id=o.id
$function$
;
revoke all on function public.admin_get_leogo_markup_financial_report() from public,anon;
grant execute on function public.admin_get_leogo_markup_financial_report() to authenticated;

-- Secondary catalogue, search, promotional display and quote compatibility.
CREATE OR REPLACE FUNCTION public.customer_global_search(p_query text, p_limit integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_query text:=lower(btrim(coalesce(p_query,'')));
  v_limit integer:=greatest(1,least(coalesce(p_limit,24),50));
  v_location_only boolean:=false;
  v_result jsonb;
begin
  if char_length(v_query)<2 then
    return '[]'::jsonb;
  end if;

  select
    exists(select 1 from public.kenya_counties c where lower(c.name)=v_query or lower(c.code)=v_query)
    or exists(select 1 from public.kenya_subcounties s where lower(s.name)=v_query or lower(s.code)=v_query)
  into v_location_only;

  with searchable as (
    select
      'product'::text as result_type,
      p.id,
      p.seller_id as provider_id,
      p.product_name::text as title,
      s.business_name::text as subtitle,
      coalesce(p.product_details,'')::text as description,
      concat_ws(' · ',nullif(s.town,''),nullif(s.sub_county,''),nullif(s.county,''))::text as location,
      s.county::text,
      s.sub_county::text,
      s.town::text,
      coalesce(p.leogo_price_kes,p.price_kes)::numeric as price_kes,
      coalesce(nullif(p.custom_category_name,''),c.name)::text as category,
      p.main_image_path::text as image_path,
      'seller-product-media'::text as media_bucket,
      null::text as image_url,
      'live-product-catalogue'::text as section_id,
      p.availability_status::text as availability,
      (
        p.flash_sale_requested=true
        and p.flash_sale_status='approved'
        and p.flash_sale_price_kes is not null
        and p.flash_sale_starts_at<=now()
        and p.flash_sale_ends_at>now()
      ) as is_flash_sale,
      p.updated_at,
      lower(concat_ws(' ',
        p.product_name,s.business_name,p.product_details,p.group_name,
        coalesce(nullif(p.custom_category_name,''),c.name),
        coalesce(nullif(p.custom_subcategory_name,''),sc.name),
        s.town,s.sub_county,s.county,s.location_details
      )) as haystack
    from public.seller_products p
    join public.seller_accounts s on s.user_id=p.seller_id
    join public.product_categories c on c.id=p.category_id
    left join public.product_subcategories sc on sc.id=p.subcategory_id
    where s.application_status='approved'
      and private.partner_has_active_subscription(s.user_id,'seller')
      and p.product_approval_status='approved'
      and p.listing_status='active'
      and p.availability_status in ('available','out_of_stock')
      and c.is_active
      and c.code<>'alcoholic_leogo_bar'

    union all

    select
      'service'::text,
      sv.id,
      sv.provider_id,
      sv.service_name,
      sp.business_name,
      coalesce(sv.description,''),
      concat_ws(' · ',nullif(sv.service_area,''),nullif(sp.town,''),nullif(sp.sub_county,''),nullif(sp.county,'')),
      sp.county,sp.sub_county,sp.town,
      sv.price_from_kes,
      coalesce(nullif(sv.category_name,''),sp.service_category,'Services'),
      sp.profile_picture_path,
      'service-provider-public-media'::text,
      null::text,
      'services'::text,
      sp.availability_status,
      (
        sv.pricing_model='fixed'
        and sv.flash_sale_requested=true
        and sv.flash_sale_status='approved'
        and sv.flash_sale_price_kes is not null
        and sv.flash_sale_starts_at<=now()
        and sv.flash_sale_ends_at>now()
      ),
      sv.updated_at,
      lower(concat_ws(' ',
        sv.service_name,sv.category_name,sv.description,sv.service_area,sv.availability_notes,
        sp.business_name,sp.primary_service,sp.service_category,sp.business_description,
        sp.town,sp.sub_county,sp.county,sp.location_details,sp.service_area_notes
      ))
    from public.service_provider_services sv
    join public.service_provider_accounts sp on sp.user_id=sv.provider_id
    where sv.approval_status='approved'
      and sv.is_available
      and sp.application_status='approved'
      and sp.availability_status<>'offline'
      and private.partner_has_active_subscription(sp.user_id,'service_provider')

    union all

    select
      'transport'::text,
      v.id,
      tp.user_id,
      concat_ws(' ',nullif(v.vehicle_type,''),nullif(v.make_model,''))::text,
      tp.business_name,
      coalesce(v.capacity_description,tp.business_description,''),
      concat_ws(' · ',nullif(v.service_area,''),nullif(tp.town,''),nullif(tp.sub_county,''),nullif(tp.county,'')),
      tp.county,tp.sub_county,tp.town,
      null::numeric,
      'Transport & Parcel Delivery'::text,
      v.vehicle_profile_picture_path,
      'transport-public-media'::text,
      null::text,
      'verifiedTransportProviders'::text,
      tp.availability_status,
      false,
      v.updated_at,
      lower(concat_ws(' ',
        v.vehicle_type,v.make_model,v.registration_number,v.capacity_description,v.service_area,
        array_to_string(v.service_types,' '),
        tp.business_name,tp.provider_type,array_to_string(tp.services_offered,' '),
        tp.business_description,tp.coverage_notes,tp.town,tp.sub_county,tp.county,tp.location_details
      ))
    from public.transport_provider_accounts tp
    join public.transport_provider_vehicles v on v.provider_id=tp.user_id
    where tp.application_status='approved'
      and tp.availability_status<>'offline'
      and private.partner_has_active_subscription(tp.user_id,'transport')
      and v.approval_status='approved'
      and v.is_available=true

    union all

    select
      'accommodation'::text,
      ap.id,
      ah.user_id,
      ap.property_name,
      ah.business_name,
      coalesce(ap.description,''),
      concat_ws(' · ',nullif(ap.public_location,''),nullif(ap.town,''),nullif(ap.sub_county,''),nullif(ap.county,'')),
      ap.county,ap.sub_county,ap.town,
      (
        select min(u.nightly_price_kes)::numeric
        from public.accommodation_units u
        where u.property_id=ap.id
          and u.is_active
          and u.approval_status='approved'
      ),
      initcap(replace(coalesce(ap.property_type,'accommodation'),'_',' ')),
      null::text,
      null::text,
      ap.cover_image_url,
      'accommodation'::text,
      'available'::text,
      false,
      ap.updated_at,
      lower(concat_ws(' ',
        ap.property_name,ap.property_type,ap.description,ap.public_location,
        array_to_string(ap.amenities,' '),
        ah.business_name,ah.business_description,
        ap.town,ap.sub_county,ap.county,ah.location_details
      ))
    from public.accommodation_properties ap
    join public.accommodation_hosts ah on ah.id=ap.host_id
    where ah.verification_status='approved'
      and private.partner_has_active_subscription(ah.user_id,'accommodation')
      and ap.approval_status='approved'
      and ap.is_published=true
      and exists(
        select 1 from public.accommodation_units u
        where u.property_id=ap.id
          and u.is_active
          and u.approval_status='approved'
      )

    union all

    select
      'cyber_service'::text,
      cs.id,
      cp.user_id,
      cs.service_name,
      cp.business_name,
      coalesce(cs.description,''),
      concat_ws(' · ',nullif(cp.location_details,''),nullif(cp.town,''),nullif(cp.sub_county,''),nullif(cp.county,'')),
      cp.county,cp.sub_county,cp.town,
      cs.price_kes,
      coalesce(nullif(cs.service_category,''),'Cyber Service'),
      cp.profile_picture_path,
      'cyber-public-media'::text,
      null::text,
      'cyberMarketplace'::text,
      cp.availability_status,
      (
        cs.pricing_model='fixed'
        and cs.flash_sale_requested=true
        and cs.flash_sale_status='approved'
        and cs.flash_sale_price_kes is not null
        and cs.flash_sale_starts_at<=now()
        and cs.flash_sale_ends_at>now()
      ),
      cs.updated_at,
      lower(concat_ws(' ',
        cs.service_name,cs.service_category,cs.description,cs.unit_label,
        cp.business_name,cp.business_description,cp.location_details,
        cp.town,cp.sub_county,cp.county
      ))
    from public.cyber_services cs
    join public.cyber_provider_accounts cp on cp.user_id=cs.provider_id
    where cp.application_status='approved'
      and private.partner_has_active_subscription(cp.user_id,'cyber')
      and cs.approval_status='approved'
      and cs.is_available

    union all

    select
      'cyber_product'::text,
      cprod.id,
      cp.user_id,
      cprod.product_name,
      cp.business_name,
      coalesce(cprod.description,''),
      concat_ws(' · ',nullif(cp.location_details,''),nullif(cp.town,''),nullif(cp.sub_county,''),nullif(cp.county,'')),
      cp.county,cp.sub_county,cp.town,
      cprod.price_kes,
      'Cyber Shop Item'::text,
      cprod.image_path,
      'cyber-public-media'::text,
      null::text,
      'cyberMarketplace'::text,
      cprod.availability_status,
      false,
      cprod.updated_at,
      lower(concat_ws(' ',
        cprod.product_name,cprod.description,cprod.measurement_unit,
        cp.business_name,cp.business_description,cp.location_details,
        cp.town,cp.sub_county,cp.county
      ))
    from public.cyber_products cprod
    join public.cyber_provider_accounts cp on cp.user_id=cprod.provider_id
    where cp.application_status='approved'
      and private.partner_has_active_subscription(cp.user_id,'cyber')
      and cprod.approval_status='approved'
      and cprod.availability_status='available'
      and cprod.quantity_available>0

    union all

    select
      'personal_sale'::text,
      ps.id,
      ps.user_id,
      ps.item_name,
      split_part(btrim(ps.seller_name),' ',1),
      'Admin-approved personal marketplace listing'::text,
      ps.location,
      null::text,null::text,null::text,
      ps.marked_price_kes,
      'Personal Marketplace'::text,
      ps.item_image_path,
      'customer-sale-media'::text,
      null::text,
      'live-product-catalogue'::text,
      ps.sale_status,
      false,
      ps.updated_at,
      lower(concat_ws(' ',ps.item_name,ps.location,split_part(btrim(ps.seller_name),' ',1)))
    from public.customer_personal_sale_listings ps
    where ps.approval_status='approved'
      and ps.sale_status='available'
  ),
  ranked as (
    select
      *,
      case
        when lower(title)=v_query then 100
        when lower(title) like v_query||'%' then 95
        when lower(title) like '%'||v_query||'%' then 90
        when lower(coalesce(subtitle,'')) like '%'||v_query||'%' then 82
        when lower(coalesce(category,'')) like '%'||v_query||'%' then 78
        when lower(coalesce(location,'')) like '%'||v_query||'%' then 74
        else 60
      end as score
    from searchable
    where haystack like '%'||v_query||'%'
      and (
        not v_location_only
        or lower(coalesce(location,'')) like '%'||v_query||'%'
        or lower(coalesce(county,''))=v_query
        or lower(coalesce(sub_county,''))=v_query
        or lower(coalesce(town,''))=v_query
      )
  ),
  limited as (
    select *
    from ranked
    order by score desc,
      case result_type
        when 'product' then 1
        when 'service' then 2
        when 'accommodation' then 3
        when 'cyber_service' then 4
        when 'cyber_product' then 5
        when 'transport' then 6
        else 7
      end,
      updated_at desc nulls last
    limit v_limit
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'type',result_type,
      'id',id,
      'provider_id',provider_id,
      'title',title,
      'subtitle',subtitle,
      'description',description,
      'location',location,
      'county',county,
      'sub_county',sub_county,
      'town',town,
      'price_kes',price_kes,
      'category',category,
      'image_path',image_path,
      'media_bucket',media_bucket,
      'image_url',image_url,
      'section_id',section_id,
      'availability',availability,
      'is_flash_sale',is_flash_sale,
      'score',score
    )
    order by score desc,updated_at desc nulls last
  ),'[]'::jsonb)
  into v_result
  from limited;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.customer_leogo_bar_catalogue()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  if auth.uid() is null or not exists(
    select 1 from public.customer_bar_age_declarations d where d.user_id=auth.uid()
  ) then raise exception 'Sign in and confirm you are 18 or older to view LEOGO BAR'; end if;
  perform private.close_expired_group_campaigns();

  select coalesce(jsonb_agg(row_data order by (row_data->>'updated_at')::timestamptz desc),'[]'::jsonb)
  into v_result
  from (
    select (to_jsonb(p) - 'leogo_price_kes' - 'price_kes' - ARRAY['product_review_notes','product_reviewed_by','product_reviewed_at','flash_sale_admin_notes','flash_sale_reviewed_by','flash_sale_reviewed_at']::text[])||jsonb_build_object(
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
        'price_kes',coalesce(p.leogo_price_kes,p.price_kes),
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
      and c.code='alcoholic_leogo_bar'
  ) q;

  return v_result;
end
$function$
;

CREATE OR REPLACE FUNCTION public.customer_market_day_checkout_quote(p_items jsonb, p_delivery_zone text, p_county text DEFAULT NULL::text, p_sub_county text DEFAULT NULL::text, p_estate text DEFAULT NULL::text, p_pickup_station_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item jsonb; v_product public.seller_products%rowtype;
  v_variant public.seller_product_variants%rowtype;
  v_qty numeric; v_price numeric; v_regular numeric; v_subtotal numeric:=0;
  v_regular_subtotal numeric:=0; v_service numeric:=0; v_pickup numeric:=0;
  v_delivery numeric:=0; v_subsidy numeric:=0; v_flash boolean; v_campaign uuid;
begin
  if (select auth.uid()) is null then raise exception 'Sign in required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then
    raise exception 'Choose a valid cart'; end if;
  if p_delivery_zone not in ('pickup','cbd','estate','outside') then raise exception 'Choose delivery zone'; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty:=nullif(v_item->>'quantity','')::numeric;
    if v_qty is null or v_qty<=0 then raise exception 'Invalid quantity'; end if;
    select * into v_product from public.seller_products p where p.id=(v_item->>'product_id')::uuid
      and p.product_approval_status='approved' and p.listing_status='active'
      and p.availability_status='available';
    if not found or v_product.fulfilment_type='group_order' then raise exception 'Product is unavailable'; end if;
    if not exists(select 1 from public.seller_accounts a where a.user_id=v_product.seller_id
      and a.application_status='approved') then raise exception 'Seller is unavailable'; end if;
    v_flash:=v_product.flash_sale_requested and v_product.flash_sale_status='approved'
      and v_product.flash_sale_price_kes>0 and v_product.flash_sale_starts_at<=now()
      and v_product.flash_sale_ends_at>now() and coalesce(v_product.flash_sale_quantity,0)>0;
    if v_flash and (select coalesce(sum((x->>'quantity')::numeric),0)
      from jsonb_array_elements(p_items) x where (x->>'product_id')::uuid=v_product.id)>v_product.flash_sale_quantity then
      raise exception 'Flash Sale quantity is no longer available'; end if;
    if v_product.has_variants then
      select * into v_variant from public.seller_product_variants x
      where x.id=nullif(v_item->>'variant_id','')::uuid and x.product_id=v_product.id and x.is_active=true;
      if not found then raise exception 'Choose a valid product variant'; end if;
      if v_variant.quantity_available<v_qty then raise exception 'Not enough variant stock'; end if;
      v_regular:=coalesce(v_variant.leogo_price_kes,v_variant.price_kes);
      v_price:=case when v_flash then least(v_variant.price_kes,v_product.flash_sale_price_kes) + (v_regular-v_variant.price_kes) else v_regular end;
    else
      if v_product.quantity_available<v_qty then raise exception 'Not enough product stock'; end if;
      v_regular:=coalesce(v_product.leogo_price_kes,v_product.price_kes);
      v_price:=case when v_flash then least(v_product.price_kes,v_product.flash_sale_price_kes) + (v_regular-v_product.price_kes) else v_regular end;
      v_price:=private.market_day_checkout_unit_price(v_product.id,v_product.price_kes,v_qty,v_flash,false,p_county) + (v_regular-v_product.price_kes);
    end if;
    v_subtotal:=v_subtotal+(v_price*v_qty);
    v_regular_subtotal:=v_regular_subtotal+(v_regular*v_qty);
  end loop;

  v_service:=round(v_subtotal * case when v_subtotal>=coalesce((select service_fee_threshold_kes from public.order_settings where id=1),3000)
    then coalesce((select service_fee_at_or_above_percent from public.order_settings where id=1),1.5)/100
    else coalesce((select service_fee_below_percent from public.order_settings where id=1),2)/100 end,2);
  if p_delivery_zone='pickup' then
    select round(v_subtotal*(coalesce(service_fee_percent,0)/100),2),coalesce(shipping_fee_kes,0)
    into v_pickup,v_delivery from public.pickup_stations where id=p_pickup_station_id and is_active=true;
    if not found then raise exception 'Pickup station unavailable'; end if;
  else
    v_delivery:=private.delivery_fee_for_zone(p_delivery_zone);
    select c.id into v_campaign from public.leogo_free_delivery_campaigns c
    where c.status='active' and now() between c.starts_at and c.ends_at
      and v_subtotal>=c.min_items_subtotal_kes and c.budget_kes>=v_delivery
      and c.max_funded_delivery_kes>=v_delivery
      and lower(btrim(c.county))=lower(btrim(coalesce(p_county,'')))
      and (c.sub_county is null or lower(btrim(c.sub_county))=lower(btrim(coalesce(p_sub_county,''))))
      and (c.estate is null or lower(btrim(c.estate))=lower(btrim(coalesce(p_estate,''))))
      and c.delivery_zone=p_delivery_zone order by c.max_funded_delivery_kes desc,c.starts_at desc limit 1;
    if found then v_subsidy:=v_delivery;v_delivery:=0;end if;
  end if;
  return jsonb_build_object('items_subtotal_kes',round(v_subtotal,2),
    'discount_kes',round(greatest(0,v_regular_subtotal-v_subtotal),2),
    'service_fee_kes',v_service,'pickup_fee_kes',v_pickup,'delivery_fee_kes',v_delivery,
    'leogo_delivery_subsidy_kes',v_subsidy,
    'grand_total_kes',round(v_subtotal+v_service+v_pickup+v_delivery,2));
end $function$
;

CREATE OR REPLACE FUNCTION public.customer_public_partner_flash_sales()
 RETURNS TABLE(partner_type text, item_type text, item_id uuid, partner_id uuid, partner_name text, item_name text, normal_price_kes numeric, flash_price_kes numeric, remaining_quantity numeric, starts_at timestamp with time zone, ends_at timestamp with time zone, image_path text, media_bucket text, category_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.expire_partner_flash_sales();

  return query
    select
      q.partner_type,
      q.item_type,
      q.item_id,
      q.partner_id,
      q.partner_name,
      q.item_name,
      q.normal_price_kes,
      q.flash_price_kes,
      q.remaining_quantity,
      q.starts_at,
      q.ends_at,
      q.image_path,
      q.media_bucket,
      q.category_name
    from (
      select
        'seller'::text as partner_type,
        'product'::text as item_type,
        p.id as item_id,
        p.seller_id as partner_id,
        s.business_name as partner_name,
        p.product_name as item_name,
        coalesce(p.leogo_price_kes,p.price_kes) as normal_price_kes,
        least(p.price_kes,p.flash_sale_price_kes) + (coalesce(p.leogo_price_kes,p.price_kes)-p.price_kes) as flash_price_kes,
        least(p.flash_sale_quantity,p.quantity_available) as remaining_quantity,
        p.flash_sale_starts_at as starts_at,
        p.flash_sale_ends_at as ends_at,
        p.main_image_path as image_path,
        'seller-product-media'::text as media_bucket,
        c.name as category_name
      from public.seller_products p
      join public.seller_accounts s on s.user_id=p.seller_id
      join public.product_categories c on c.id=p.category_id
      where s.application_status='approved'
        and private.partner_has_active_subscription(s.user_id,'seller')
        and p.product_approval_status='approved'
        and p.listing_status='active'
        and p.availability_status='available'
        and c.is_active
        and not c.restricted_category
        and c.code<>'alcoholic_leogo_bar'
        and p.fulfilment_type<>'group_order'
        and p.flash_sale_requested
        and p.flash_sale_status='approved'
        and p.flash_sale_price_kes>0 and p.flash_sale_price_kes<p.price_kes and p.quantity_available>0
        and p.flash_sale_starts_at<=now()
        and p.flash_sale_ends_at>now()
        and coalesce(p.flash_sale_quantity,0)>0

      union all

      select
        'service_provider'::text,
        'service'::text,
        v.id,
        v.provider_id,
        a.business_name,
        v.service_name,
        v.price_from_kes,
        v.flash_sale_price_kes,
        null::numeric,
        v.flash_sale_starts_at,
        v.flash_sale_ends_at,
        a.profile_picture_path,
        'service-provider-public-media'::text,
        coalesce(v.category_name,a.primary_service)
      from public.service_provider_services v
      join public.service_provider_accounts a on a.user_id=v.provider_id
      where a.application_status='approved'
        and a.availability_status<>'offline'
        and private.partner_has_active_subscription(a.user_id,'service_provider')
        and v.approval_status='approved'
        and v.is_available
        and v.pricing_model='fixed'
        and v.flash_sale_requested
        and v.flash_sale_status='approved'
        and v.flash_sale_price_kes>0
        and v.flash_sale_price_kes<v.price_from_kes
        and v.flash_sale_starts_at<=now()
        and v.flash_sale_ends_at>now()

      union all

      select
        'cyber'::text,
        'service'::text,
        c.id,
        c.provider_id,
        a.business_name,
        c.service_name,
        c.price_kes,
        c.flash_sale_price_kes,
        null::numeric,
        c.flash_sale_starts_at,
        c.flash_sale_ends_at,
        a.profile_picture_path,
        'cyber-public-media'::text,
        c.service_category
      from public.cyber_services c
      join public.cyber_provider_accounts a on a.user_id=c.provider_id
      where a.application_status='approved'
        and a.availability_status<>'offline'
        and private.partner_has_active_subscription(a.user_id,'cyber')
        and c.approval_status='approved'
        and c.is_available
        and c.flash_sale_requested
        and c.flash_sale_status='approved'
        and c.flash_sale_price_kes>0
        and c.flash_sale_price_kes<c.price_kes
        and c.flash_sale_starts_at<=now()
        and c.flash_sale_ends_at>now()
    ) q
    order by q.ends_at asc,q.item_name;
end
$function$
;


-- Seller edits require fresh approval and fresh LEOGO pricing; existing order snapshots remain unchanged.
CREATE OR REPLACE FUNCTION public.seller_save_product_with_variants(p_product_id uuid, p_product jsonb, p_variants jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_product_id uuid := p_product_id;
  v_has_variants boolean := coalesce((p_product->>'has_variants')::boolean,false);
  v_variant jsonb;
  v_variant_count integer := 0;
  v_gallery text[];
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(
    select 1 from public.seller_accounts s
    where s.user_id=v_uid and s.application_status='approved'
  ) then
    raise exception 'Approved Seller account required';
  end if;

  if jsonb_typeof(coalesce(p_product,'{}'::jsonb)) <> 'object' then
    raise exception 'Invalid product payload';
  end if;
  if jsonb_typeof(coalesce(p_variants,'[]'::jsonb)) <> 'array' then
    raise exception 'Invalid variants payload';
  end if;

  v_gallery := array(
    select jsonb_array_elements_text(coalesce(p_product->'gallery_image_paths','[]'::jsonb))
  );

  if char_length(btrim(coalesce(p_product->>'product_name',''))) < 2 then
    raise exception 'Product name is required';
  end if;
  if coalesce((p_product->>'price_kes')::numeric,-1) < 0 then
    raise exception 'Enter a valid product price';
  end if;
  if coalesce((p_product->>'quantity_available')::numeric,-1) < 0 then
    raise exception 'Enter a valid product quantity';
  end if;
  if nullif(btrim(coalesce(p_product->>'main_image_path','')),'') is null then
    raise exception 'Add a main product picture';
  end if;
  if nullif(btrim(coalesce(p_product->>'category_id','')),'') is null then
    raise exception 'Choose a category';
  end if;

  if v_has_variants and jsonb_array_length(p_variants)=0 then
    raise exception 'Add at least one variant or switch off variants';
  end if;

  if v_has_variants then
    for v_variant in select * from jsonb_array_elements(p_variants)
    loop
      if char_length(btrim(coalesce(v_variant->>'variant_name',''))) < 1 then
        raise exception 'Every variant requires a name';
      end if;
      if coalesce((v_variant->>'price_kes')::numeric,-1) < 0 then
        raise exception 'Every variant requires a valid Amount (KSh)';
      end if;
      if coalesce((v_variant->>'quantity_available')::numeric,-1) < 0 then
        raise exception 'Every variant requires a valid quantity';
      end if;
      if nullif(btrim(coalesce(v_variant->>'image_path','')),'') is null then
        raise exception 'Every variant requires a profile picture';
      end if;
    end loop;
  end if;

  if v_product_id is null then
    insert into public.seller_products(
      seller_id,product_name,price_kes,availability_status,quantity_available,
      measurement_unit,measurement_unit_other,accepts_lipa_pole_pole,
      lipa_pole_pole_first_deposit_kes,lipa_pole_pole_max_days,has_variants,
      product_details,main_image_path,gallery_image_paths,category_id,subcategory_id,
      custom_category_name,custom_subcategory_name,group_name,listing_status,updated_at
    )
    values(
      v_uid,
      btrim(p_product->>'product_name'),
      (p_product->>'price_kes')::numeric,
      p_product->>'availability_status',
      (p_product->>'quantity_available')::numeric,
      p_product->>'measurement_unit',
      nullif(btrim(coalesce(p_product->>'measurement_unit_other','')),''),
      coalesce((p_product->>'accepts_lipa_pole_pole')::boolean,false),
      nullif(p_product->>'lipa_pole_pole_first_deposit_kes','')::numeric,
      nullif(p_product->>'lipa_pole_pole_max_days','')::integer,
      v_has_variants,
      btrim(p_product->>'product_details'),
      p_product->>'main_image_path',
      coalesce(v_gallery,'{}'::text[]),
      (p_product->>'category_id')::uuid,
      nullif(p_product->>'subcategory_id','')::uuid,
      nullif(btrim(coalesce(p_product->>'custom_category_name','')),''),
      nullif(btrim(coalesce(p_product->>'custom_subcategory_name','')),''),
      nullif(btrim(coalesce(p_product->>'group_name','')),''),
      p_product->>'listing_status',
      now()
    )
    returning id into v_product_id;
  else
    if not exists(
      select 1 from public.seller_products p
      where p.id=v_product_id and p.seller_id=v_uid
    ) then
      raise exception 'Product not found';
    end if;

    update public.seller_products set
      product_name=btrim(p_product->>'product_name'),
      price_kes=(p_product->>'price_kes')::numeric,
      availability_status=p_product->>'availability_status',
      quantity_available=(p_product->>'quantity_available')::numeric,
      measurement_unit=p_product->>'measurement_unit',
      measurement_unit_other=nullif(btrim(coalesce(p_product->>'measurement_unit_other','')),''),
      accepts_lipa_pole_pole=coalesce((p_product->>'accepts_lipa_pole_pole')::boolean,false),
      lipa_pole_pole_first_deposit_kes=nullif(p_product->>'lipa_pole_pole_first_deposit_kes','')::numeric,
      lipa_pole_pole_max_days=nullif(p_product->>'lipa_pole_pole_max_days','')::integer,
      has_variants=v_has_variants,
      product_details=btrim(p_product->>'product_details'),
      main_image_path=p_product->>'main_image_path',
      gallery_image_paths=coalesce(v_gallery,'{}'::text[]),
      category_id=(p_product->>'category_id')::uuid,
      subcategory_id=nullif(p_product->>'subcategory_id','')::uuid,
      custom_category_name=nullif(btrim(coalesce(p_product->>'custom_category_name','')),''),
      custom_subcategory_name=nullif(btrim(coalesce(p_product->>'custom_subcategory_name','')),''),
      group_name=nullif(btrim(coalesce(p_product->>'group_name','')),''),
      listing_status=p_product->>'listing_status',
      leogo_price_kes=null,
      product_approval_status='pending',
      product_submitted_at=now(),
      product_reviewed_at=null,
      product_reviewed_by=null,
      product_review_notes=null,
      flash_sale_requested=false,
      flash_sale_price_kes=null,
      flash_sale_quantity=null,
      flash_sale_starts_at=null,
      flash_sale_ends_at=null,
      flash_sale_status='none',
      flash_sale_admin_notes=null,
      flash_sale_reviewed_at=null,
      flash_sale_reviewed_by=null,
      updated_at=now()
    where id=v_product_id and seller_id=v_uid;
  end if;

  delete from public.seller_product_variants where product_id=v_product_id;

  if v_has_variants then
    for v_variant in select * from jsonb_array_elements(p_variants)
    loop
      insert into public.seller_product_variants(
        product_id,variant_name,sku,price_kes,quantity_available,is_active,display_order,image_path,updated_at
      )
      values(
        v_product_id,
        btrim(v_variant->>'variant_name'),
        nullif(btrim(coalesce(v_variant->>'sku','')),''),
        (v_variant->>'price_kes')::numeric,
        (v_variant->>'quantity_available')::numeric,
        coalesce((v_variant->>'is_active')::boolean,true),
        coalesce((v_variant->>'display_order')::integer,v_variant_count),
        btrim(v_variant->>'image_path'),
        now()
      );
      v_variant_count := v_variant_count + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'ok',true,
    'product_id',v_product_id,
    'variant_count',v_variant_count
  );
end $function$
;
