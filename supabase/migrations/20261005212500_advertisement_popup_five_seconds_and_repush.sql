-- Improve timed advertisement pop-up:
-- 1) increase auto-close from 3 seconds to 5 seconds;
-- 2) re-push existing timed adverts by incrementing popup_revision;
-- 3) preserve the existing Admin advertisement workflow.

alter table public.advertisements
  drop constraint if exists advertisements_popup_auto_close_seconds_check;

update public.advertisements
set popup_auto_close_seconds=5,
    popup_revision=coalesce(popup_revision,0)+1,
    updated_at=now()
where popup_auto_close_seconds=3;

alter table public.advertisements
  add constraint advertisements_popup_auto_close_seconds_check
  check (popup_auto_close_seconds in (0,5));

create or replace function public.admin_save_advertisement(
  p_advertisement_id uuid,
  p_advertisement jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_title text := nullif(btrim(coalesce(p_advertisement->>'title','')),'');
  v_body text := coalesce(p_advertisement->>'body_html','');
  v_poster text := nullif(btrim(coalesce(p_advertisement->>'poster_path','')),'');
  v_status text := coalesce(nullif(btrim(p_advertisement->>'status'),''),'draft');
  v_popup boolean := coalesce((p_advertisement->>'popup_on_entry')::boolean,false);
  v_requested_auto_close integer := coalesce(nullif(p_advertisement->>'popup_auto_close_seconds','')::integer,0);
  v_auto_close smallint := case when v_requested_auto_close in (3,5) then 5 else 0 end;
  v_starts timestamptz;
  v_ends timestamptz;
  v_before jsonb;
  v_after jsonb;
  v_id uuid;
  v_old_popup boolean := false;
  v_old_revision integer := 0;
  v_old_auto_close smallint := 0;
begin
  if not private.is_leogo_admin('settings.manage') then
    raise exception 'Admin access required';
  end if;

  if v_title is null then raise exception 'Advertisement title is required'; end if;
  if length(v_title)>180 then raise exception 'Advertisement title is too long'; end if;
  if length(v_body)>12000 then raise exception 'Advertisement text is too long'; end if;
  if nullif(btrim(v_body),'') is null and v_poster is null then
    raise exception 'Add advertisement text or upload a poster';
  end if;
  if v_status not in ('draft','published','paused','archived') then
    raise exception 'Invalid advertisement status';
  end if;

  if not v_popup then
    v_auto_close := 0;
  end if;

  begin
    v_starts := (p_advertisement->>'starts_at')::timestamptz;
    v_ends := (p_advertisement->>'ends_at')::timestamptz;
  exception when others then
    raise exception 'Enter a valid advertisement start and end time';
  end;

  if v_starts is null or v_ends is null or v_ends<=v_starts then
    raise exception 'Advertisement end time must be after the start time';
  end if;

  if p_advertisement_id is null then
    insert into public.advertisements(
      title,body_html,poster_path,starts_at,ends_at,status,
      popup_on_entry,popup_revision,popup_auto_close_seconds,
      created_by,updated_by,published_at
    )
    values(
      v_title,v_body,v_poster,v_starts,v_ends,v_status,
      v_popup,case when v_popup then 1 else 0 end,v_auto_close,
      (select auth.uid()),(select auth.uid()),
      case when v_status='published' then now() else null end
    )
    returning advertisements.id into v_id;
    v_before := null;
  else
    select to_jsonb(a),a.popup_on_entry,a.popup_revision,a.popup_auto_close_seconds
    into v_before,v_old_popup,v_old_revision,v_old_auto_close
    from public.advertisements a
    where a.id=p_advertisement_id;

    if v_before is null then raise exception 'Advertisement not found'; end if;

    update public.advertisements a
    set title=v_title,
        body_html=v_body,
        poster_path=v_poster,
        starts_at=v_starts,
        ends_at=v_ends,
        status=v_status,
        popup_on_entry=v_popup,
        popup_auto_close_seconds=v_auto_close,
        popup_revision=case
          when v_popup=true and (
            coalesce(v_old_popup,false)=false
            or coalesce(v_old_auto_close,0)<>v_auto_close
          ) then coalesce(v_old_revision,0)+1
          else coalesce(v_old_revision,0)
        end,
        updated_by=(select auth.uid()),
        updated_at=now(),
        published_at=case
          when v_status='published' and a.published_at is null then now()
          else a.published_at
        end
    where a.id=p_advertisement_id
    returning a.id into v_id;
  end if;

  select to_jsonb(a) into v_after
  from public.advertisements a
  where a.id=v_id;

  perform private.write_admin_audit(
    case when p_advertisement_id is null then 'advertisement.created' else 'advertisement.updated' end,
    'advertisement',
    v_id::text,
    v_before,
    v_after,
    jsonb_build_object(
      'status',v_status,
      'starts_at',v_starts,
      'ends_at',v_ends,
      'popup_on_entry',v_popup,
      'popup_auto_close_seconds',v_auto_close
    )
  );

  return v_after;
end
$function$;

revoke all on function public.admin_save_advertisement(uuid,jsonb) from public,anon;
grant execute on function public.admin_save_advertisement(uuid,jsonb) to authenticated;
