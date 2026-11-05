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
