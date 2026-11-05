create table if not exists public.sorting_center_notifications (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.sorting_centers(id) on delete cascade,
  user_id uuid not null references public.leogo_staff(user_id) on delete cascade,
  parcel_id uuid references public.sorting_parcels(id) on delete cascade,
  event_type text not null,
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists sorting_center_notifications_user_idx on public.sorting_center_notifications(user_id,read_at,created_at desc);
alter table public.sorting_center_notifications enable row level security;
revoke all on public.sorting_center_notifications from public,anon,authenticated;

create or replace function private.notify_sorting_center_staff()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_center uuid; v_order text; v_title text; v_type text; v_parcel uuid;
begin
  if tg_table_name='sorting_parcels' then
    v_center:=new.origin_center_id; v_parcel:=new.id; v_type:='parcel_booked'; v_title:='Expected incoming parcel';
    select order_reference into v_order from public.marketplace_orders where id=new.order_id;
  else
    if new.event_type<>'seller_handover' then return new; end if;
    select origin_center_id into v_center from public.sorting_parcels where id=new.parcel_id;
    select order_reference into v_order from public.marketplace_orders where id=new.order_id;
    v_parcel:=new.parcel_id; v_type:='seller_handover'; v_title:='Parcel handed over by seller';
  end if;
  insert into public.sorting_center_notifications(center_id,user_id,parcel_id,event_type,title,message)
  select v_center,a.user_id,v_parcel,v_type,v_title,'Order '||coalesce(v_order,'')||' is expected at '||c.center_name||'. Staff receipt is still required.'
    from public.sorting_center_staff a join public.sorting_centers c on c.id=a.center_id
    where a.center_id=v_center and a.is_active and c.is_active;
  return new;
end
$function$;
drop trigger if exists sorting_parcel_expected_notification on public.sorting_parcels;
create trigger sorting_parcel_expected_notification after insert on public.sorting_parcels for each row execute function private.notify_sorting_center_staff();
drop trigger if exists sorting_handover_notification on public.sorting_parcel_events;
create trigger sorting_handover_notification after insert on public.sorting_parcel_events for each row execute function private.notify_sorting_center_staff();

create or replace function public.seller_list_sorting_parcels()
returns jsonb language plpgsql security definer set search_path=''
as $function$
begin
  if (select auth.uid()) is null then raise exception 'Sign in required'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('parcel_id',p.id,'seller_order_id',p.seller_order_id,'parcel_reference',p.parcel_reference,'order_reference',o.order_reference,'status',p.status,'center_id',c.id,'center_name',c.center_name,'center_code',c.center_code,'county',o.county,'sub_county',o.sub_county,'town',o.estate,'booked_at',p.booked_at,'updated_at',p.updated_at) order by p.booked_at desc),'[]'::jsonb)
    from public.sorting_parcels p join public.marketplace_seller_orders so on so.id=p.seller_order_id join public.marketplace_orders o on o.id=p.order_id join public.sorting_centers c on c.id=p.origin_center_id where so.seller_id=(select auth.uid()));
end
$function$;

create or replace function public.sorting_staff_list_notifications(p_center_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
begin
  if not private.sorting_center_has_access(p_center_id,'read') then raise exception 'Sorting center access required'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'title',n.title,'message',n.message,'event_type',n.event_type,'created_at',n.created_at,'read_at',n.read_at,'parcel_id',n.parcel_id) order by n.created_at desc),'[]'::jsonb) from public.sorting_center_notifications n where n.center_id=p_center_id and n.user_id=(select auth.uid()) limit 50);
end
$function$;

revoke all on function public.seller_list_sorting_parcels() from public,anon;
revoke all on function public.sorting_staff_list_notifications(uuid) from public,anon;
grant execute on function public.seller_list_sorting_parcels() to authenticated;
grant execute on function public.sorting_staff_list_notifications(uuid) to authenticated;
