-- Optional seller per-zone ETAs. Existing item durations and delivery fees remain unchanged.
alter table public.product_delivery_durations
  add column zone_minutes jsonb not null default '{}'::jsonb
  check (jsonb_typeof(zone_minutes) = 'object');

create function public.seller_save_product_zone_durations(p_product_id uuid,p_zone_minutes jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid(); v_key text; v_value text; v_min integer; v_settings jsonb;
begin
  if v_uid is null or not exists(
    select 1 from public.seller_products where id=p_product_id and seller_id=v_uid
  ) then raise exception 'Only the product seller may update its zone timelines'; end if;
  if p_zone_minutes is null or jsonb_typeof(p_zone_minutes)<>'object' then
    raise exception 'Zone times must be an object'; end if;
  select public.public_delivery_eta_settings() into v_settings;
  if v_settings is null then raise exception 'Admin delivery minimums are unavailable'; end if;
  for v_key,v_value in select key,value from jsonb_each_text(p_zone_minutes) loop
    if v_key not in ('cbd','estate','outside','pickup','inter_county') then
      raise exception 'Unknown delivery zone'; end if;
    if v_value !~ '^[0-9]+$' or length(v_value)>6 then
      raise exception 'Zone delivery time must be an integer in minutes'; end if;
    if v_value::integer not between 1 and 525600 then
      raise exception 'Zone delivery time must be between 1 minute and 365 days'; end if;
    v_min := (v_settings->>v_key)::integer;
    if v_value::integer < v_min then
      raise exception 'Seller timeline for % cannot be shorter than the Admin minimum (% minutes)',v_key,v_min;
    end if;
  end loop;
  insert into public.product_delivery_durations(product_id,seller_id,zone_minutes)
  values(p_product_id,v_uid,p_zone_minutes)
  on conflict(product_id) do update set zone_minutes=excluded.zone_minutes,updated_at=now();
end $$;
revoke all on function public.seller_save_product_zone_durations(uuid,jsonb) from public,anon;
grant execute on function public.seller_save_product_zone_durations(uuid,jsonb) to authenticated;

create or replace function public.public_product_delivery_durations()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('product_id',p.id,'seller_county',s.county,'seller_town',s.town,
   'local_minutes',d.local_minutes,'international_minutes',d.international_minutes,
   'zone_minutes',coalesce(d.zone_minutes,'{}'::jsonb))),'[]'::jsonb)
 from public.seller_products p
 join public.seller_accounts s on s.user_id=p.seller_id
 left join public.product_delivery_durations d on d.product_id=p.id
 where s.application_status='approved' and private.partner_has_active_subscription(s.user_id,'seller')
  and p.product_approval_status='approved' and p.listing_status='active'
  and p.availability_status in ('available','out_of_stock');
$$;
