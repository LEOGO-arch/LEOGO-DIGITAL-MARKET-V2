
create or replace function public.public_list_vacant_houses(
  p_search text default null,
  p_county text default null,
  p_house_type text default null,
  p_min_rent numeric default null,
  p_max_rent numeric default null
)
returns table(
  id uuid,
  listing_reference text,
  title text,
  house_type text,
  monthly_rent_kes numeric,
  deposit_kes numeric,
  county text,
  sub_county text,
  area_estate text,
  bedrooms smallint,
  bathrooms smallint,
  furnished boolean,
  water_available boolean,
  electricity_available boolean,
  parking_available boolean,
  gated_compound boolean,
  description text,
  available_from date,
  photo_paths text[],
  submitted_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $function$
  select
    l.id,l.listing_reference,l.title,l.house_type,l.monthly_rent_kes,l.deposit_kes,
    l.county,l.sub_county,l.area_estate,l.bedrooms,l.bathrooms,l.furnished,
    l.water_available,l.electricity_available,l.parking_available,l.gated_compound,
    l.description,l.available_from,l.photo_paths,l.submitted_at
  from public.vacant_house_listings l
  join public.vacant_house_settings s on s.id=1 and s.is_enabled=true
  where l.approval_status='approved'
    and l.availability_status='vacant'
    and l.listing_purpose='rent'
    and (nullif(btrim(coalesce(p_county,'')),'') is null or lower(l.county)=lower(btrim(p_county)))
    and (nullif(btrim(coalesce(p_house_type,'')),'') is null or l.house_type=btrim(p_house_type))
    and (p_min_rent is null or l.monthly_rent_kes>=p_min_rent)
    and (p_max_rent is null or l.monthly_rent_kes<=p_max_rent)
    and (
      nullif(btrim(coalesce(p_search,'')),'') is null
      or l.title ilike '%'||btrim(p_search)||'%'
      or l.area_estate ilike '%'||btrim(p_search)||'%'
      or l.sub_county ilike '%'||btrim(p_search)||'%'
      or l.county ilike '%'||btrim(p_search)||'%'
      or l.description ilike '%'||btrim(p_search)||'%'
    )
  order by l.submitted_at desc
  limit 250;
$function$;

revoke all on function public.public_list_vacant_houses(text,text,text,numeric,numeric) from public;
grant execute on function public.public_list_vacant_houses(text,text,text,numeric,numeric) to anon,authenticated;

notify pgrst,'reload schema';
