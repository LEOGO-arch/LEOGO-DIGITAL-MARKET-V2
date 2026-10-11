-- Additive aftersales negotiation layer; existing case statuses and order flows remain unchanged.
create table if not exists public.marketplace_aftersales_negotiations (
  case_id uuid primary key references public.marketplace_aftersales_cases(id) on delete cascade,
  seller_id uuid not null,
  stage text not null default 'forwarded' check (stage in ('forwarded','seller_review','seller_proposed','seller_rejected','customer_accepted','customer_rejected','intervention_requested','admin_review','closed')),
  seller_solution text,
  seller_comment text,
  customer_comment text,
  admin_comment text,
  updated_at timestamptz not null default now(),
  forwarded_at timestamptz not null default now()
);
create table if not exists public.marketplace_aftersales_negotiation_events (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.marketplace_aftersales_cases(id) on delete cascade,
 actor_id uuid not null,
 actor_role text not null check(actor_role in ('admin','seller','customer')),
 event_type text not null,
 comment text,
 created_at timestamptz not null default now()
);
create index if not exists aftersales_negotiation_events_case_idx on public.marketplace_aftersales_negotiation_events(case_id,created_at);
alter table public.marketplace_aftersales_negotiations enable row level security;
alter table public.marketplace_aftersales_negotiation_events enable row level security;
revoke all on public.marketplace_aftersales_negotiations,public.marketplace_aftersales_negotiation_events from anon,authenticated;
create or replace function public.aftersales_forward_to_seller(p_case_id uuid,p_seller_id uuid,p_comment text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_case public.marketplace_aftersales_cases%rowtype;
begin
 if not private.is_leogo_admin('orders.manage') then raise exception 'Aftersales management permission required'; end if;
 if char_length(coalesce(p_comment,''))>2000 then raise exception 'Comment too long'; end if;
 select * into v_case from public.marketplace_aftersales_cases where id=p_case_id for update;
 if not found then raise exception 'Case not found'; end if;
 if v_case.status in ('resolved','rejected','cancelled') then raise exception 'Case already closed'; end if;
 if not exists (select 1 from public.marketplace_seller_orders so where so.order_id=v_case.order_id and so.seller_id=p_seller_id) then
  raise exception 'Selected seller is not associated with this order';
 end if;
 insert into public.marketplace_aftersales_negotiations(case_id,seller_id,stage,admin_comment)
 values(p_case_id,p_seller_id,'forwarded',nullif(btrim(p_comment),''))
 on conflict(case_id) do update set seller_id=excluded.seller_id,stage='forwarded',seller_solution=null,seller_comment=null,
   customer_comment=null,admin_comment=excluded.admin_comment,updated_at=now(),forwarded_at=now();
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,auth.uid(),'admin','forwarded',nullif(btrim(p_comment),''));
 return jsonb_build_object('ok',true,'case_id',p_case_id,'stage','forwarded');
end;$fn$;
revoke all on function public.aftersales_forward_to_seller(uuid,uuid,text) from public,anon;
grant execute on function public.aftersales_forward_to_seller(uuid,uuid,text) to authenticated;
create or replace function public.aftersales_seller_respond(p_case_id uuid,p_action text,p_solution text default null,p_comment text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v public.marketplace_aftersales_negotiations%rowtype;
begin
 select * into v from public.marketplace_aftersales_negotiations where case_id=p_case_id and seller_id=auth.uid() for update;
 if not found then raise exception 'Case not assigned to this seller'; end if;
 if v.stage not in ('forwarded','seller_review','customer_rejected') then raise exception 'Case cannot be updated at this stage'; end if;
 if p_action not in ('review','propose','reject') then raise exception 'Unsupported seller action'; end if;
 if char_length(coalesce(p_comment,''))>2000 or char_length(coalesce(p_solution,''))>2000 then raise exception 'Comment too long'; end if;
 if p_action='propose' and char_length(btrim(coalesce(p_solution,'')))<5 then raise exception 'Describe the proposed solution'; end if;
 if p_action='reject' and char_length(btrim(coalesce(p_comment,'')))<5 then raise exception 'Provide a reason for rejection'; end if;
 update public.marketplace_aftersales_negotiations set
 stage=case p_action when 'review' then 'seller_review' when 'propose' then 'seller_proposed' else 'seller_rejected' end,
 seller_solution=case when p_action='propose' then btrim(p_solution) else seller_solution end,
 seller_comment=nullif(btrim(p_comment),''),updated_at=now() where case_id=p_case_id;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,auth.uid(),'seller',p_action,coalesce(nullif(btrim(p_solution),''),nullif(btrim(p_comment),'')));
 return jsonb_build_object('ok',true,'case_id',p_case_id);
end;$fn$;
revoke all on function public.aftersales_seller_respond(uuid,text,text,text) from public,anon;
grant execute on function public.aftersales_seller_respond(uuid,text,text,text) to authenticated;
create or replace function public.aftersales_customer_respond(p_case_id uuid,p_action text,p_comment text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v public.marketplace_aftersales_negotiations%rowtype;
begin
 select n.* into v from public.marketplace_aftersales_negotiations n
 join public.marketplace_aftersales_cases c on c.id=n.case_id
 where n.case_id=p_case_id and c.customer_id=auth.uid() for update of n;
 if not found then raise exception 'Case not found for customer'; end if;
 if p_action='accept' and v.stage<>'seller_proposed' then raise exception 'No seller solution awaiting acceptance'; end if;
 if p_action='reject' and v.stage<>'seller_proposed' then raise exception 'No seller solution awaiting rejection'; end if;
 if p_action='intervene' and v.stage not in ('seller_rejected','customer_rejected') then raise exception 'Intervention is not available at this stage'; end if;
 if p_action not in ('accept','reject','intervene') then raise exception 'Unsupported customer action'; end if;
 if char_length(coalesce(p_comment,''))>2000 then raise exception 'Comment too long'; end if;
 update public.marketplace_aftersales_negotiations set
 stage=case p_action when 'accept' then 'customer_accepted' when 'reject' then 'customer_rejected' else 'intervention_requested' end,
 customer_comment=nullif(btrim(p_comment),''),updated_at=now() where case_id=p_case_id;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,auth.uid(),'customer',p_action,nullif(btrim(p_comment),''));
 return jsonb_build_object('ok',true,'case_id',p_case_id);
end;$fn$;
revoke all on function public.aftersales_customer_respond(uuid,text,text) from public,anon;
grant execute on function public.aftersales_customer_respond(uuid,text,text) to authenticated;
create or replace function public.aftersales_list_negotiations()
returns jsonb language sql stable security definer set search_path='' as $fn$
 select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc),'[]'::jsonb) from (
  select n.*,c.customer_id,c.order_id,c.case_reference,
   coalesce((select jsonb_agg(jsonb_build_object('event_type',e.event_type,'actor_role',e.actor_role,'comment',e.comment,'created_at',e.created_at) order by e.created_at)
    from public.marketplace_aftersales_negotiation_events e where e.case_id=n.case_id),'[]'::jsonb) as history
  from public.marketplace_aftersales_negotiations n
  join public.marketplace_aftersales_cases c on c.id=n.case_id
  where private.is_leogo_admin('orders.manage') or n.seller_id=auth.uid() or c.customer_id=auth.uid()
 ) q
$fn$;
revoke all on function public.aftersales_list_negotiations() from public,anon;
grant execute on function public.aftersales_list_negotiations() to authenticated;
