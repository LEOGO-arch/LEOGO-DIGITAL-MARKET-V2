create or replace function public.admin_media_housekeeping_approved()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_leogo_super_admin() then raise exception 'Super Admin required'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'bucket',bucket_id,'path',object_name,'bytes',size_bytes,'approved_at',approved_at))
 from (select * from public.media_housekeeping_jobs where status='approved' order by approved_at desc limit 100) a),'[]'::jsonb);
end $$;
revoke all on function public.admin_media_housekeeping_approved() from public,anon;
grant execute on function public.admin_media_housekeeping_approved() to authenticated;