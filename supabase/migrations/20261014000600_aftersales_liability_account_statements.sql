-- Show assessed versus effective charges to the actual account holder, without exposing other parties' private details.
create or replace function public.partner_aftersales_liability_statement(p_party text)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_id uuid; v_uid uuid:=auth.uid();
begin
 if v_uid is null then raise exception 'Sign in required';end if;
 if p_party='seller' and exists(select 1 from public.seller_accounts where user_id=v_uid and application_status='approved') then v_id:=v_uid;
 elsif p_party='transport_provider' and exists(select 1 from public.transport_provider_accounts where user_id=v_uid and application_status='approved') then v_id:=v_uid;
 elsif p_party='staff_rider' and exists(select 1 from public.leogo_staff where user_id=v_uid and staff_role='rider' and status='active') then v_id:=v_uid;
 elsif p_party='pickup_station' then
 select pickup_station_id into v_id from public.pickup_station_partner_accounts where user_id=v_uid and status='active';
 else raise exception 'Unauthorized liability statement';end if;
 if v_id is null then raise exception 'No authorized account';end if;
 return (select jsonb_build_object(
 'approved_total_kes',coalesce(sum(assessed_amount_kes) filter(where status='approved'),0),
 'pending_total_kes',coalesce(sum(assessed_amount_kes) filter(where status='pending_review'),0),
 'records',coalesce(jsonb_agg(jsonb_build_object(
 'aftersales_number',c.case_reference,'reason',l.charge_reason,'amount_kes',l.assessed_amount_kes,
 'status',l.status,'created_at',l.created_at,'decision_notes',l.decision_notes,
 'reversal_reason',l.reversal_reason
 ) order by l.created_at desc) filter(where l.id is not null),'[]'::jsonb)
 ) from public.aftersales_liability_cases l
 join public.marketplace_aftersales_cases c on c.id=l.aftersales_case_id
 where l.liability_type=p_party and l.liable_account_id=v_id);
end;$fn$;
revoke all on function public.partner_aftersales_liability_statement(text) from public,anon;
grant execute on function public.partner_aftersales_liability_statement(text) to authenticated;