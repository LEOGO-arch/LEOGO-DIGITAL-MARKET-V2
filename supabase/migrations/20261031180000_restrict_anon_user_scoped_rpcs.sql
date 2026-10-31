-- Restrict user-scoped, SECURITY DEFINER RPCs to signed-in sessions.
-- Their bodies already enforce auth.uid() ownership; the anonymous grant is unnecessary.
-- Keep public catalogue, public settings, and anonymous telemetry RPCs unchanged.
do $migration$
declare
  v record;
  v_count integer;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and has_function_privilege('anon',p.oid,'EXECUTE')
    and p.proname in (
      'accommodation_provider_get_own_account',
      'accommodation_provider_list_catalogue',
      'accommodation_provider_replace_unit_rates',
      'accommodation_provider_save_property',
      'accommodation_provider_save_unit',
      'accommodation_provider_submit_application',
      'customer_create_service_request',
      'customer_decide_transport_quote',
      'customer_list_marketplace_orders',
      'seller_list_marketplace_orders',
      'service_provider_update_job',
      'transport_provider_get_earnings_report',
      'transport_provider_request_settlement',
      'transport_provider_submit_settlement_account'
    );

  if v_count <> 15 then
    raise exception 'Expected 15 reviewed user-scoped RPC overloads; found %', v_count;
  end if;

  for v in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prosecdef
      and has_function_privilege('anon',p.oid,'EXECUTE')
      and p.proname in (
        'accommodation_provider_get_own_account',
        'accommodation_provider_list_catalogue',
        'accommodation_provider_replace_unit_rates',
        'accommodation_provider_save_property',
        'accommodation_provider_save_unit',
        'accommodation_provider_submit_application',
        'customer_create_service_request',
        'customer_decide_transport_quote',
        'customer_list_marketplace_orders',
        'seller_list_marketplace_orders',
        'service_provider_update_job',
        'transport_provider_get_earnings_report',
        'transport_provider_request_settlement',
        'transport_provider_submit_settlement_account'
      )
      and (
        p.prosrc ilike '%auth.uid()%'
        or (
          p.proname='customer_create_service_request'
          and p.prosrc ilike '%return public.customer_create_service_request%'
        )
      )
  loop
    execute format('revoke execute on function %s from public, anon',v.signature);
    execute format('grant execute on function %s to authenticated',v.signature);
  end loop;
end
$migration$;
