alter table public.product_categories add column if not exists image_path text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('category-public-media','category-public-media',true,2097152,array['image/webp','image/jpeg','image/png'])
on conflict(id) do nothing;
drop policy if exists "Admin upload category media" on storage.objects;
create policy "Admin upload category media" on storage.objects for insert to authenticated
with check(bucket_id='category-public-media' and private.is_leogo_admin('products.manage'));
drop policy if exists "Public read category media" on storage.objects;
create policy "Public read category media" on storage.objects for select to public
using(bucket_id='category-public-media');
create or replace function public.admin_set_category_image(p_category_id uuid,p_image_path text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_id uuid;
begin
 if not private.is_leogo_admin('products.manage') then raise exception 'Admin permission required'; end if;
 if p_image_path is null or p_image_path !~ '^categories/[a-f0-9-]{36}/[a-zA-Z0-9_-]+[.]webp$'
 or split_part(p_image_path,'/',2)<>p_category_id::text then raise exception 'Invalid category image'; end if;
 if not exists(select 1 from storage.objects where bucket_id='category-public-media' and name=p_image_path) then raise exception 'Image upload not found'; end if;
 update public.product_categories set image_path=p_image_path where id=p_category_id returning id into v_id;
 if v_id is null then raise exception 'Category not found'; end if;
 return jsonb_build_object('id',v_id,'image_path',p_image_path);
end;$fn$;
revoke all on function public.admin_set_category_image(uuid,text) from public,anon;
grant execute on function public.admin_set_category_image(uuid,text) to authenticated;
create or replace function public.customer_category_images()
returns table(code text,image_path text) language sql stable security definer set search_path='' as $fn$
 select c.code,c.image_path from public.product_categories c where c.is_active and c.image_path is not null;
$fn$;
revoke all on function public.customer_category_images() from public;
grant execute on function public.customer_category_images() to anon,authenticated;
create or replace function public.admin_category_images() returns table(id uuid,image_path text) language plpgsql security definer set search_path='' as $fn$ begin if not private.is_leogo_admin('products.read') then raise exception 'Admin access required'; end if; return query select c.id,c.image_path from public.product_categories c; end;$fn$;
revoke all on function public.admin_category_images() from public,anon;
grant execute on function public.admin_category_images() to authenticated;
