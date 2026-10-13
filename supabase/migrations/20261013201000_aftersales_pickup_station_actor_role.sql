-- Preserve the actual station actor identity in Aftersales custody history.
alter table public.marketplace_aftersales_negotiation_events
 drop constraint if exists marketplace_aftersales_negotiation_events_actor_role_check;
alter table public.marketplace_aftersales_negotiation_events
 add constraint marketplace_aftersales_negotiation_events_actor_role_check
 check(actor_role in ('admin','seller','customer','pickup_station'));