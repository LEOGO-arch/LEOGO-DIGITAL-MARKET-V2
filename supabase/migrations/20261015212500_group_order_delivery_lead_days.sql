-- Optional relative delivery estimate for new Group / Global campaigns.
-- Existing fixed-date campaign terms are unchanged.
alter table public.group_order_campaigns
  add column if not exists delivery_lead_days integer
    check (delivery_lead_days between 1 and 365);

create or replace function public.public_group_delivery_lead_days()
returns table(campaign_id uuid, delivery_lead_days integer)
language sql stable security definer set search_path=''
as $$
  select id, delivery_lead_days
  from public.group_order_campaigns
  where delivery_lead_days is not null
    and status in ('collecting_orders','moq_reached','paused');
$$;
revoke all on function public.public_group_delivery_lead_days() from public;
grant execute on function public.public_group_delivery_lead_days() to anon, authenticated;

create or replace function public.seller_set_group_delivery_lead_days(
  p_product_id uuid,p_days integer
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_campaign public.group_order_campaigns%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_days is null or p_days not between 1 and 365 then
    raise exception 'Enter an estimated delivery period between 1 and 365 calendar days';
  end if;
  select c.* into v_campaign from public.group_order_campaigns c
  where c.product_id=p_product_id and c.seller_id=auth.uid()
    and c.status in ('collecting_orders','paused','moq_reached')
  order by c.created_at desc limit 1 for update;
  if not found then raise exception 'Editable Group Order campaign not found'; end if;
  if exists(select 1 from public.group_order_participations p where p.campaign_id=v_campaign.id) then
    if v_campaign.delivery_lead_days=p_days then
      return jsonb_build_object('ok',true,'campaign_id',v_campaign.id,'delivery_lead_days',p_days,'unchanged',true);
    end if;
    raise exception 'Delivery terms are locked after a customer joins this Group Order';
  end if;
  update public.group_order_campaigns
  set delivery_lead_days=p_days
  where id=v_campaign.id;
  return jsonb_build_object('ok',true,'campaign_id',v_campaign.id,'delivery_lead_days',p_days);
end;
$$;
revoke all on function public.seller_set_group_delivery_lead_days(uuid,integer) from public,anon;
grant execute on function public.seller_set_group_delivery_lead_days(uuid,integer) to authenticated;

-- A joined customer sees an ETA anchored to their own join date.
-- Only return campaigns in which the caller actually participates.
create or replace function public.customer_group_delivery_lead_days()
returns table(campaign_id uuid, delivery_lead_days integer)
language sql stable security definer set search_path=''
as $$
  select distinct c.id,c.delivery_lead_days
  from public.group_order_participations p
  join public.group_order_campaigns c on c.id=p.campaign_id
  where p.customer_id=auth.uid() and c.delivery_lead_days is not null;
$$;
revoke all on function public.customer_group_delivery_lead_days() from public,anon;
grant execute on function public.customer_group_delivery_lead_days() to authenticated;
