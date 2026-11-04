-- Additive delivery estimates. No existing fee, checkout, or settlement logic changes.
create table public.product_delivery_durations (
 product_id uuid primary key references public.seller_products(id) on delete cascade,
 seller_id uuid not null references auth.users(id),
 local_minutes integer check (local_minutes between 1 and 525600),
 international_minutes integer check (international_minutes between 1 and 525600),
 updated_at timestamptz not null default now()
);
alter table public.product_delivery_durations enable row level security;
create policy delivery_duration_seller_read on public.product_delivery_durations for select to authenticated using (seller_id=(select auth.uid()));
revoke all on public.product_delivery_durations from public,anon,authenticated;
grant select on public.product_delivery_durations to authenticated;

create function public.seller_save_product_delivery_durations(p_product_id uuid,p_local_minutes integer,p_international_minutes integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null or not exists(select 1 from public.seller_products where id=p_product_id and seller_id=v_uid) then
  raise exception 'Only the product seller may change its delivery times';
 end if;
 if (p_local_minutes is not null and p_local_minutes not between 1 and 525600)
  or (p_international_minutes is not null and p_international_minutes not between 1 and 525600) then
  raise exception 'Delivery time must be within one minute and 365 days';
 end if;
 insert into public.product_delivery_durations(product_id,seller_id,local_minutes,international_minutes)
 values(p_product_id,v_uid,p_local_minutes,p_international_minutes)
 on conflict(product_id) do update set local_minutes=excluded.local_minutes,
  international_minutes=excluded.international_minutes,updated_at=now();
end; $$;
revoke all on function public.seller_save_product_delivery_durations(uuid,integer,integer) from public,anon;
grant execute on function public.seller_save_product_delivery_durations(uuid,integer,integer) to authenticated;

create function public.public_product_delivery_durations()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('product_id',p.id,'seller_county',s.county,'seller_town',s.town,
   'local_minutes',d.local_minutes,'international_minutes',d.international_minutes)),'[]'::jsonb)
 from public.seller_products p
 join public.seller_accounts s on s.user_id=p.seller_id
 left join public.product_delivery_durations d on d.product_id=p.id
 where s.application_status='approved' and private.partner_has_active_subscription(s.user_id,'seller')
  and p.product_approval_status='approved' and p.listing_status='active'
  and p.availability_status in ('available','out_of_stock');
$$;
revoke all on function public.public_product_delivery_durations() from public;
grant execute on function public.public_product_delivery_durations() to anon,authenticated;

alter table public.delivery_rate_settings
 add column cbd_eta_minutes integer not null default 120 check (cbd_eta_minutes between 1 and 525600),
 add column estate_eta_minutes integer not null default 240 check (estate_eta_minutes between 1 and 525600),
 add column outside_eta_minutes integer not null default 1440 check (outside_eta_minutes between 1 and 525600),
 add column inter_county_eta_minutes integer not null default 2880 check (inter_county_eta_minutes between 1 and 525600),
 add column pickup_eta_minutes integer not null default 1440 check (pickup_eta_minutes between 1 and 525600);

create function public.public_delivery_eta_settings() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('cbd',cbd_eta_minutes,'estate',estate_eta_minutes,'outside',outside_eta_minutes,
  'inter_county',inter_county_eta_minutes,'pickup',pickup_eta_minutes)
 from public.delivery_rate_settings where id=1;
$$;
revoke all on function public.public_delivery_eta_settings() from public;
grant execute on function public.public_delivery_eta_settings() to anon,authenticated;

create function public.admin_set_delivery_eta_settings(p_values jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v jsonb; v_before jsonb;
begin
 if auth.uid() is null or not (private.is_leogo_admin('settings.manage') or private.is_leogo_admin('delivery.manage')) then
  raise exception 'Delivery settings permission required';
 end if;
 if (select count(*) from jsonb_object_keys(coalesce(p_values,'{}'::jsonb)))<>5
 or (select count(*) from jsonb_object_keys(p_values) k where k in ('cbd','estate','outside','inter_county','pickup'))<>5 then
  raise exception 'Supply all five delivery zone durations';
 end if;
 if exists(select 1 from jsonb_each_text(p_values) e where e.value !~ '^[0-9]+$' or e.value::numeric not between 1 and 525600) then
  raise exception 'Each duration must be an integer from 1 to 525600 minutes';
 end if;
 select to_jsonb(s) into v_before from public.delivery_rate_settings s where id=1 for update;
 update public.delivery_rate_settings set cbd_eta_minutes=(p_values->>'cbd')::integer,
  estate_eta_minutes=(p_values->>'estate')::integer,outside_eta_minutes=(p_values->>'outside')::integer,
  inter_county_eta_minutes=(p_values->>'inter_county')::integer,pickup_eta_minutes=(p_values->>'pickup')::integer,
  updated_by=auth.uid(),updated_at=now() where id=1;
 select public.public_delivery_eta_settings() into v;
 perform private.write_admin_audit('delivery.eta.updated','delivery_rate_settings','1',v_before,
  (select to_jsonb(s) from public.delivery_rate_settings s where id=1),jsonb_build_object('scope','delivery time only'));
 return v;
end; $$;
revoke all on function public.admin_set_delivery_eta_settings(jsonb) from public,anon;
grant execute on function public.admin_set_delivery_eta_settings(jsonb) to authenticated;
