-- Audit every event registration or ticket confirmation/rejection.
-- A paid ticket must be checked against the official LEOGO notification.
-- Guard against one M-PESA reference being used for two confirmed event tickets.
create or replace function public.admin_review_advert_event_entry(
 p_entry_id uuid,p_approve boolean,p_notes text default null,p_official_reference text default null)
returns void language plpgsql security definer set search_path='' as $fn$
declare v_entry public.advert_event_entries%rowtype; v_capacity integer; v_used integer;
v_official text := upper(trim(coalesce(p_official_reference,'')));
begin
 if not private.is_leogo_admin('settings.manage') then raise exception 'Admin access required'; end if;
 select * into v_entry from public.advert_event_entries where id=p_entry_id for update;
 if not found then raise exception 'Event entry not found'; end if;
 if v_entry.status not in ('pending_payment','submitted') then raise exception 'Entry already reviewed'; end if;
 if p_approve and v_entry.action_kind='ticket' then
   perform 1 from public.advert_event_actions where advertisement_id=v_entry.advertisement_id for update;
   select ticket_capacity into v_capacity from public.advert_event_actions where advertisement_id=v_entry.advertisement_id;
   if v_capacity is not null then
     select count(*) into v_used from public.advert_event_entries
       where advertisement_id=v_entry.advertisement_id and action_kind='ticket' and status='confirmed';
     if v_used>=v_capacity then raise exception 'Ticket capacity reached'; end if;
   end if;
   if v_entry.amount_due_kes>0 then
     if v_official !~ '^[A-Z0-9]{10}$' or v_official<>coalesce(v_entry.payment_reference,'')
     then raise exception 'Enter the verified 10-character code from the official LEOGO receiving account; it must match the submitted reference'; end if;
     if exists(select 1 from public.advert_event_entries e where e.payment_reference=v_official
       and e.action_kind='ticket' and e.status='confirmed' and e.id<>v_entry.id)
     then raise exception 'This M-PESA reference has already been used to confirm a different ticket'; end if;
   end if;
 end if;
 update public.advert_event_entries set status=case when p_approve then 'confirmed' else 'rejected' end,
 admin_notes=left(coalesce(p_notes,''),1000),reviewed_at=now(),reviewed_by=auth.uid()
 where id=p_entry_id;
 perform private.write_admin_audit(
   case when p_approve then 'advert_event_entry.confirmed' else 'advert_event_entry.rejected' end,
   'advert_event_entry',p_entry_id::text,
   jsonb_build_object('status',v_entry.status,'action_kind',v_entry.action_kind),
   jsonb_build_object('status',case when p_approve then 'confirmed' else 'rejected' end),
   jsonb_build_object('advertisement_id',v_entry.advertisement_id,'amount_kes',v_entry.amount_due_kes,
      'official_reference_last4',case when v_official<>'' then right(v_official,4) else null end)
 );
end $fn$;
revoke all on function public.admin_review_advert_event_entry(uuid,boolean,text,text) from public,anon;
grant execute on function public.admin_review_advert_event_entry(uuid,boolean,text,text) to authenticated;
-- Remove the legacy three-argument function to prevent bypassing official-code matching.
drop function if exists public.admin_review_advert_event_entry(uuid,boolean,text);
