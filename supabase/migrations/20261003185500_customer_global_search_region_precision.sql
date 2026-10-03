-- Customer global search across approved LEOGO marketplace listings.
-- Supports product/service/business/location searches from one fast RPC.

create or replace function public.customer_global_search(
  p_query text,
  p_limit integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
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
      p.price_kes::numeric as price_kes,
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
$function$;

revoke all on function public.customer_global_search(text,integer) from public;
grant execute on function public.customer_global_search(text,integer) to anon,authenticated;
