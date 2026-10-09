-- After the COD delivery fee is verified, the amount collected at handover
-- excludes that already-paid delivery fee. Accounting/order gross totals remain unchanged.
-- Changes only the display-facing due amount in protected Rider and Pickup lookup RPCs.

do $fn$
declare v_name text; v_sig regprocedure; v_definition text; v_anchor text;
  v_replacement text; v_patched integer := 0;
begin
  for v_name in
    select unnest(array['rider_list_delivery_jobs','rider_list_delivery_jobs_v2',
      'rider_list_delivery_jobs_v3','rider_list_delivery_jobs_v4'])
  loop
    select p.oid::regprocedure, pg_get_functiondef(p.oid)
      into v_sig,v_definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=v_name and p.pronargs=0;
    if v_sig is null then continue; end if;
    v_anchor := 'o.reward_points_redeemed_kes,o.external_amount_due_kes,';
    v_replacement :=
      'o.reward_points_redeemed_kes,' ||
      'case when o.payment_method=''cod'' and o.cod_delivery_fee_status=''verified'' ' ||
      'then greatest(0,o.external_amount_due_kes-coalesce(o.delivery_fee_kes,0)) ' ||
      'else o.external_amount_due_kes end,';
    if position(v_anchor in v_definition)>0 then
      execute replace(v_definition,v_anchor,v_replacement);
      v_patched := v_patched+1;
    elsif v_name='rider_list_delivery_jobs_v4' then
      raise exception 'Current Rider V4 COD amount mapping changed: manual reconciliation needed';
    end if;
    v_sig := null;
  end loop;
  if v_patched=0 then raise exception 'No Rider COD collection mapping was updated'; end if;
end;
$fn$;

do $fn$
declare v_definition text;
  v_anchor text := '''external_amount_due_kes'',o.external_amount_due_kes,';
  v_replacement text :=
    '''external_amount_due_kes'','||
    'case when o.payment_method=''cod'' and o.cod_delivery_fee_status=''verified'' '||
    'then greatest(0,o.external_amount_due_kes-coalesce(o.delivery_fee_kes,0)) '||
    'else o.external_amount_due_kes end,';
begin
  select pg_get_functiondef('public.pickup_partner_lookup_parcel(text)'::regprocedure)
    into v_definition;
  if position(v_anchor in v_definition)=0 then
    raise exception 'Pickup COD amount mapping changed: manual reconciliation needed';
  end if;
  execute replace(v_definition,v_anchor,v_replacement);
end;
$fn$;
