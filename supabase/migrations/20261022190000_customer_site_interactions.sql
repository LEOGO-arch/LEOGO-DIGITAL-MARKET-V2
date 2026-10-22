-- Separate, privacy-minimized customer website events; existing visitor counter untouched.
create table if not exists public.customer_site_interaction_events (
 id bigint generated always as identity primary key,
 visitor_token uuid not null,
 event_kind text not null check (event_kind in ('page_view','navigation','category_view','product_view','add_to_cart','checkout','advert_click','partner_view','contact_click')),
 event_target text not null check (event_target in ('home','marketplace','groceries','food','pharmacy','services','transport','accommodation','property','premium','cyber','advertisement','cart','checkout','product','partner','whatsapp','phone','other')),
 occurred_at timestamptz not null default now()
);
create index if not exists customer_site_events_date_idx on public.customer_site_interaction_events(occurred_at desc);
create index if not exists customer_site_events_kind_date_idx on public.customer_site_interaction_events(event_kind,occurred_at desc);
alter table public.customer_site_interaction_events enable row level security;
revoke all on public.customer_site_interaction_events from anon,authenticated;
create or replace function public.record_customer_site_interaction(p_visitor_token uuid,p_event_kind text,p_event_target text)
returns void language plpgsql security definer set search_path to '' as $fn$
declare v_today date := (now() at time zone 'Africa/Nairobi')::date;
begin
 if p_visitor_token is null
   or p_event_kind not in ('page_view','navigation','category_view','product_view','add_to_cart','checkout','advert_click','partner_view','contact_click')
   or p_event_target not in ('home','marketplace','groceries','food','pharmacy','services','transport','accommodation','property','premium','cyber','advertisement','cart','checkout','product','partner','whatsapp','phone','other')
 then return; end if;
 -- Limit per anonymous browser token. No IP addresses, URL queries or typed text stored.
 perform pg_advisory_xact_lock(hashtext(p_visitor_token::text));
 if (select count(*) from public.customer_site_interaction_events e
     where e.visitor_token=p_visitor_token and e.occurred_at >= v_today::timestamp at time zone 'Africa/Nairobi'
       and e.occurred_at < (v_today+1)::timestamp at time zone 'Africa/Nairobi') >= 200 then return; end if;
 insert into public.customer_site_interaction_events(visitor_token,event_kind,event_target)
 values(p_visitor_token,p_event_kind,p_event_target);
end $fn$;
revoke all on function public.record_customer_site_interaction(uuid,text,text) from public;
grant execute on function public.record_customer_site_interaction(uuid,text,text) to anon,authenticated;
