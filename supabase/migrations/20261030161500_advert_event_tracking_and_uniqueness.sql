-- Ensure a payment reference cannot approve two tickets, even under concurrent reviews.
create unique index if not exists advert_event_one_confirmed_ticket_per_reference
on public.advert_event_entries (upper(payment_reference))
where action_kind='ticket' and status='confirmed' and payment_reference is not null;
-- Customer may check only their own entry status, never another attendee's data.
create or replace function public.customer_check_advert_event_entry(p_ticket_code text)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_row record;
begin
 if auth.uid() is null then raise exception 'Please sign in to track your event request'; end if;
 select e.ticket_code,e.action_kind,e.status,e.amount_due_kes,e.created_at,
        a.title as advert_title
 into v_row from public.advert_event_entries e
 join public.advertisements a on a.id=e.advertisement_id
 where e.ticket_code=upper(trim(coalesce(p_ticket_code,''))) and e.user_id=auth.uid();
 if not found then raise exception 'No event request found for your account and reference'; end if;
 return jsonb_build_object('tracking_code',v_row.ticket_code,'kind',v_row.action_kind,
 'status',v_row.status,'amount_due_kes',v_row.amount_due_kes,
 'event',v_row.advert_title,'requested_at',v_row.created_at);
end $fn$;
revoke all on function public.customer_check_advert_event_entry(text) from public,anon;
grant execute on function public.customer_check_advert_event_entry(text) to authenticated;
