-- Health & Medicine search: official county/sub-county terms must match registered location fields.

create or replace function public.public_search_health_medicine(p_query text,p_limit integer default 12)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_query text:=lower(btrim(coalesce(p_query,'')));
  v_limit integer:=greatest(1,least(coalesce(p_limit,12),30));
  v_location_only boolean:=false;
  v_result jsonb;
begin
  if char_length(v_query)<2 then return '[]'::jsonb; end if;

  select
    exists(select 1 from public.kenya_counties c where lower(c.name)=v_query or lower(c.code)=v_query)
    or exists(select 1 from public.kenya_subcounties s where lower(s.name)=v_query or lower(s.code)=v_query)
  into v_location_only;

  with rows as (
    select
      'health_product'::text type,
      p.id,
      p.provider_id,
      p.product_name::text title,
      h.business_name::text subtitle,
      concat_ws(' · ',nullif(h.location_details,''),nullif(h.town,''),nullif(h.sub_county,''),nullif(h.county,''))::text location,
      h.county::text,
      h.sub_county::text,
      h.town::text,
      p.price_kes,
      p.product_kind::text category,
      p.image_path,
      'health-medicine-public-media'::text media_bucket,
      p.requires_prescription,
      p.medicine_classification,
      p.updated_at,
      lower(concat_ws(' ',p.product_name,p.brand,p.description,p.product_kind,p.medicine_classification,h.business_name,h.business_type,h.location_details,h.town,h.sub_county,h.county)) haystack
    from public.health_medicine_products p
    join public.health_medicine_accounts h on h.user_id=p.provider_id
    where h.application_status='approved'
      and h.availability_status<>'closed'
      and p.approval_status='approved'
      and p.availability_status<>'inactive'

    union all

    select
      'health_partner'::text,
      h.user_id,
      h.user_id,
      h.business_name,
      initcap(replace(coalesce(nullif(h.other_business_type,''),h.business_type),'_',' ')),
      concat_ws(' · ',nullif(h.location_details,''),nullif(h.town,''),nullif(h.sub_county,''),nullif(h.county,'')),
      h.county,h.sub_county,h.town,
      null::numeric,
      h.business_type,
      h.profile_picture_path,
      'health-medicine-public-media'::text,
      false,
      'non_medicine'::text,
      h.updated_at,
      lower(concat_ws(' ',h.business_name,h.business_type,h.other_business_type,h.business_description,h.location_details,h.town,h.sub_county,h.county))
    from public.health_medicine_accounts h
    where h.application_status='approved'
      and h.availability_status<>'closed'
  ),
  ranked as (
    select r.*,
      case
        when lower(r.title)=v_query then 100
        when lower(r.title) like v_query||'%' then 90
        when lower(r.title) like '%'||v_query||'%' then 80
        when lower(coalesce(r.location,'')) like '%'||v_query||'%' then 75
        else 60
      end score
    from rows r
    where r.haystack like '%'||v_query||'%'
      and (
        not v_location_only
        or lower(coalesce(r.location,'')) like '%'||v_query||'%'
        or lower(coalesce(r.county,''))=v_query
        or lower(coalesce(r.sub_county,''))=v_query
        or lower(coalesce(r.town,''))=v_query
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'type',x.type,'id',x.id,'provider_id',x.provider_id,'title',x.title,'subtitle',x.subtitle,
    'location',x.location,'county',x.county,'sub_county',x.sub_county,'town',x.town,
    'price_kes',x.price_kes,'category',x.category,'image_path',x.image_path,
    'media_bucket',x.media_bucket,'requires_prescription',x.requires_prescription,
    'medicine_classification',x.medicine_classification,'section_id','health-medicine','score',x.score
  ) order by x.score desc,x.updated_at desc),'[]'::jsonb)
  into v_result
  from (
    select * from ranked order by score desc,updated_at desc limit v_limit
  ) x;

  return v_result;
end;
$$;

revoke all on function public.public_search_health_medicine(text,integer) from public;
grant execute on function public.public_search_health_medicine(text,integer) to anon,authenticated;
