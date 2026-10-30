-- Track Admin changes to ticket availability, pricing and registration configuration.
create or replace function public.admin_save_advert_event_actions(p_advertisement_id uuid,p_config jsonb)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare f jsonb; v_fields jsonb := coalesce(p_config->'form_fields','[]'::jsonb);
v_ticket boolean := coalesce((p_config->>'allow_ticket')::boolean,false);
v_reg boolean := coalesce((p_config->>'allow_register')::boolean,false);
v_join boolean := coalesce((p_config->>'allow_join')::boolean,false);
v_price numeric := coalesce((p_config->>'ticket_price_kes')::numeric,0);
v_ticket_cap integer := nullif(p_config->>'ticket_capacity','')::integer;
v_reg_cap integer := nullif(p_config->>'registration_capacity','')::integer;
v_result jsonb; v_before jsonb;
begin
 if not private.is_leogo_admin('settings.manage') then raise exception 'Admin access required'; end if;
 if not exists(select 1 from public.advertisements where id=p_advertisement_id) then raise exception 'Advertisement not found'; end if;
 if v_price<0 or v_price>10000000 then raise exception 'Ticket price is outside the allowed range'; end if;
 if (v_ticket_cap is not null and v_ticket_cap not between 1 and 1000000)
 or (v_reg_cap is not null and v_reg_cap not between 1 and 1000000) then raise exception 'Invalid event capacity'; end if;
 if jsonb_typeof(v_fields)<>'array' or jsonb_array_length(v_fields)>12 then raise exception 'Provide up to 12 registration questions'; end if;
 for f in select value from jsonb_array_elements(v_fields) loop
  if coalesce(f->>'key','') !~ '^[a-z][a-z0-9_]{0,30}$'
    or length(coalesce(f->>'label','')) not between 2 and 100
    or f->>'type' not in ('text','number','date','select','checkbox') then
    raise exception 'Invalid registration question';
  end if;
  if f->>'type'='select' and (jsonb_typeof(f->'options')<>'array'
     or jsonb_array_length(f->'options') not between 1 and 20) then
    raise exception 'Select questions require 1 to 20 options';
  end if;
 end loop;
 if (select count(distinct x->>'key') from jsonb_array_elements(v_fields) x)<>jsonb_array_length(v_fields)
 then raise exception 'Question keys must be unique'; end if;
 select to_jsonb(a) into v_before from public.advert_event_actions a where a.advertisement_id=p_advertisement_id;
 insert into public.advert_event_actions(advertisement_id,allow_ticket,ticket_price_kes,ticket_capacity,
    allow_register,allow_join,registration_capacity,form_fields,updated_at)
 values(p_advertisement_id,v_ticket,v_price,v_ticket_cap,v_reg,v_join,v_reg_cap,v_fields,now())
 on conflict(advertisement_id) do update set
 allow_ticket=excluded.allow_ticket,ticket_price_kes=excluded.ticket_price_kes,ticket_capacity=excluded.ticket_capacity,
 allow_register=excluded.allow_register,allow_join=excluded.allow_join,registration_capacity=excluded.registration_capacity,
 form_fields=excluded.form_fields,updated_at=now();
 select to_jsonb(t) into v_result from public.advert_event_actions t where advertisement_id=p_advertisement_id;
 perform private.write_admin_audit(
   'advert_event.settings_saved','advert_event',p_advertisement_id::text,
   v_before,v_result,jsonb_build_object('ticket_enabled',v_ticket,'register_enabled',v_reg,'join_enabled',v_join)
 );
 return v_result;
end $fn$;

