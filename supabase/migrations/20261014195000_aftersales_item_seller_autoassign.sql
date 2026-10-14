create or replace function public.aftersales_order_item_responsible_seller(p_case_id uuid)
returns table(seller_id uuid,business_name text,owner_name text,product_name text)
language sql stable security definer set search_path='' as $fn$
select i.seller_id,nullif(btrim(sa.business_name),''),nullif(btrim(sa.owner_name),''),i.product_name
from public.marketplace_aftersales_cases c
join public.marketplace_order_items i on i.id=c.order_item_id and i.order_id=c.order_id
left join public.seller_accounts sa on sa.user_id=i.seller_id
where c.id=p_case_id and private.is_leogo_admin('orders.manage') and i.seller_id is not null;
$fn$;
revoke all on function public.aftersales_order_item_responsible_seller(uuid) from public,anon;
grant execute on function public.aftersales_order_item_responsible_seller(uuid) to authenticated;
create or replace function public.aftersales_forward_to_seller(p_case_id uuid,p_seller_id uuid,p_comment text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_case public.marketplace_aftersales_cases%rowtype;v_seller uuid;
begin
 if not private.is_leogo_admin('orders.manage') then raise exception 'Aftersales management permission required';end if;
 if char_length(coalesce(p_comment,''))>2000 then raise exception 'Comment too long';end if;
 select * into v_case from public.marketplace_aftersales_cases where id=p_case_id for update;
 if not found then raise exception 'Case not found';end if;
 if v_case.status in ('resolved','rejected','cancelled') then raise exception 'Case already closed';end if;
 select i.seller_id into v_seller from public.marketplace_order_items i
 where i.id=v_case.order_item_id and i.order_id=v_case.order_id;
 if v_seller is null then raise exception 'Aftersales case has no verified order item seller; Admin must resolve item linkage first';end if;
 if p_seller_id is distinct from v_seller then raise exception 'Responsible seller must match the purchased item seller';end if;
 insert into public.marketplace_aftersales_negotiations(case_id,seller_id,stage,admin_comment)
 values(p_case_id,v_seller,'forwarded',nullif(btrim(p_comment),''))
 on conflict(case_id) do update set seller_id=excluded.seller_id,stage='forwarded',seller_solution=null,seller_comment=null,
 customer_comment=null,admin_comment=excluded.admin_comment,updated_at=now(),forwarded_at=now();
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,auth.uid(),'admin','forwarded',nullif(btrim(p_comment),''));
 return jsonb_build_object('ok',true,'case_id',p_case_id,'stage','forwarded');
end;$fn$;