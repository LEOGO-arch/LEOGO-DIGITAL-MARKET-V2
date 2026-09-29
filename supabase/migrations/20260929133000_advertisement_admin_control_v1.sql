create table if not exists public.advertisements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body_html text not null default '',
  poster_path text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','published','paused','archived')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint advertisements_period_valid check (ends_at > starts_at),
  constraint advertisements_content_present check (
    nullif(btrim(title),'') is not null
    and (nullif(btrim(body_html),'') is not null or nullif(btrim(coalesce(poster_path,'')),'') is not null)
  )
);

create index if not exists advertisements_public_schedule_idx
on public.advertisements(status,starts_at,ends_at,created_at desc);

alter table public.advertisements enable row level security;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'advertisement-media',
  'advertisement-media',
  true,
  8388608,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public=excluded.public,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists advertisement_media_public_read on storage.objects;
create policy advertisement_media_public_read
on storage.objects for select
to public
using (bucket_id='advertisement-media');

drop policy if exists advertisement_media_admin_insert on storage.objects;
create policy advertisement_media_admin_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id='advertisement-media'
  and private.is_leogo_admin('settings.manage')
);

drop policy if exists advertisement_media_admin_update on storage.objects;
create policy advertisement_media_admin_update
on storage.objects for update
to authenticated
using (
  bucket_id='advertisement-media'
  and private.is_leogo_admin('settings.manage')
)
with check (
  bucket_id='advertisement-media'
  and private.is_leogo_admin('settings.manage')
);

drop policy if exists advertisement_media_admin_delete on storage.objects;
create policy advertisement_media_admin_delete
on storage.objects for delete
to authenticated
using (
  bucket_id='advertisement-media'
  and private.is_leogo_admin('settings.manage')
);

create or replace function public.public_get_active_advertisement()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'id',a.id,
        'title',a.title,
        'body_html',a.body_html,
        'poster_path',a.poster_path,
        'starts_at',a.starts_at,
        'ends_at',a.ends_at
      )
      from public.advertisements a
      where a.status='published'
        and a.starts_at <= now()
        and a.ends_at > now()
      order by a.starts_at desc,a.created_at desc
      limit 1
    ),
    '{}'::jsonb
  );
$$;

revoke all on function public.public_get_active_advertisement() from public;
grant execute on function public.public_get_active_advertisement() to anon,authenticated;

create or replace function public.admin_list_advertisements()
returns table(
  id uuid,
  title text,
  body_html text,
  poster_path text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  published_at timestamptz,
  created_by uuid,
  updated_by uuid
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not private.is_leogo_admin('settings.manage') then
    raise exception 'Admin access required';
  end if;

  return query
  select a.id,a.title,a.body_html,a.poster_path,a.starts_at,a.ends_at,a.status,
         a.created_at,a.updated_at,a.published_at,a.created_by,a.updated_by
  from public.advertisements a
  order by
    case a.status when 'published' then 0 when 'draft' then 1 when 'paused' then 2 else 3 end,
    a.starts_at desc,
    a.created_at desc;
end
$$;

revoke all on function public.admin_list_advertisements() from public,anon;
grant execute on function public.admin_list_advertisements() to authenticated;

create or replace function public.admin_save_advertisement(
  p_advertisement_id uuid,
  p_advertisement jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_title text := nullif(btrim(coalesce(p_advertisement->>'title','')),'');
  v_body text := coalesce(p_advertisement->>'body_html','');
  v_poster text := nullif(btrim(coalesce(p_advertisement->>'poster_path','')),'');
  v_status text := coalesce(nullif(btrim(p_advertisement->>'status'),''),'draft');
  v_starts timestamptz;
  v_ends timestamptz;
  v_before jsonb;
  v_after jsonb;
  v_id uuid;
begin
  if not private.is_leogo_admin('settings.manage') then
    raise exception 'Admin access required';
  end if;

  if v_title is null then
    raise exception 'Advertisement title is required';
  end if;
  if length(v_title) > 180 then
    raise exception 'Advertisement title is too long';
  end if;
  if length(v_body) > 12000 then
    raise exception 'Advertisement text is too long';
  end if;
  if nullif(btrim(v_body),'') is null and v_poster is null then
    raise exception 'Add advertisement text or upload a poster';
  end if;
  if v_status not in ('draft','published','paused','archived') then
    raise exception 'Invalid advertisement status';
  end if;

  begin
    v_starts := (p_advertisement->>'starts_at')::timestamptz;
    v_ends := (p_advertisement->>'ends_at')::timestamptz;
  exception when others then
    raise exception 'Enter a valid advertisement start and end time';
  end;

  if v_starts is null or v_ends is null or v_ends <= v_starts then
    raise exception 'Advertisement end time must be after the start time';
  end if;

  if p_advertisement_id is null then
    insert into public.advertisements(
      title,body_html,poster_path,starts_at,ends_at,status,
      created_by,updated_by,published_at
    )
    values(
      v_title,v_body,v_poster,v_starts,v_ends,v_status,
      (select auth.uid()),(select auth.uid()),
      case when v_status='published' then now() else null end
    )
    returning advertisements.id into v_id;
    v_before := null;
  else
    select to_jsonb(a) into v_before
    from public.advertisements a
    where a.id=p_advertisement_id;

    if v_before is null then
      raise exception 'Advertisement not found';
    end if;

    update public.advertisements a
    set title=v_title,
        body_html=v_body,
        poster_path=v_poster,
        starts_at=v_starts,
        ends_at=v_ends,
        status=v_status,
        updated_by=(select auth.uid()),
        updated_at=now(),
        published_at=case
          when v_status='published' and a.published_at is null then now()
          when v_status<>'published' then a.published_at
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
    jsonb_build_object('status',v_status,'starts_at',v_starts,'ends_at',v_ends)
  );

  return v_after;
end
$$;

revoke all on function public.admin_save_advertisement(uuid,jsonb) from public,anon;
grant execute on function public.admin_save_advertisement(uuid,jsonb) to authenticated;

create or replace function public.admin_set_advertisement_status(
  p_advertisement_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not private.is_leogo_admin('settings.manage') then
    raise exception 'Admin access required';
  end if;
  if p_status not in ('draft','published','paused','archived') then
    raise exception 'Invalid advertisement status';
  end if;

  select to_jsonb(a) into v_before
  from public.advertisements a
  where a.id=p_advertisement_id;

  if v_before is null then
    raise exception 'Advertisement not found';
  end if;

  update public.advertisements a
  set status=p_status,
      updated_by=(select auth.uid()),
      updated_at=now(),
      published_at=case
        when p_status='published' and a.published_at is null then now()
        else a.published_at
      end
  where a.id=p_advertisement_id;

  select to_jsonb(a) into v_after
  from public.advertisements a
  where a.id=p_advertisement_id;

  perform private.write_admin_audit(
    'advertisement.status_changed',
    'advertisement',
    p_advertisement_id::text,
    v_before,
    v_after,
    jsonb_build_object('status',p_status)
  );

  return v_after;
end
$$;

revoke all on function public.admin_set_advertisement_status(uuid,text) from public,anon;
grant execute on function public.admin_set_advertisement_status(uuid,text) to authenticated;
