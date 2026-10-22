create or replace function public.admin_site_interaction_report(p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path to '' as $fn$
declare v_records jsonb;
begin
 if not private.is_leogo_admin('reports.export') then raise exception 'Reports permission required';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Invalid report period';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc,x.event_count desc),'[]'::jsonb)
 into v_records
 from (
  select (e.occurred_at at time zone 'Africa/Nairobi')::date as date,
    e.event_kind as event_kind,e.event_target as event_target,
    count(*)::integer as event_count,
    count(distinct e.visitor_token)::integer as unique_browsers
  from public.customer_site_interaction_events e
  where e.occurred_at >= p_from::timestamp at time zone 'Africa/Nairobi'
    and e.occurred_at < (p_to+1)::timestamp at time zone 'Africa/Nairobi'
  group by 1,2,3
 ) x;
 return jsonb_build_object('records',v_records,'generated_at',now());
end $fn$;
revoke all on function public.admin_site_interaction_report(date,date) from public;
grant execute on function public.admin_site_interaction_report(date,date) to authenticated;
