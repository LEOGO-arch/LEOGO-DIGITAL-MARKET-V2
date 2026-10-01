
alter table public.seller_products
  add column if not exists flash_sale_admin_notes text,
  add column if not exists flash_sale_reviewed_at timestamptz,
  add column if not exists flash_sale_reviewed_by uuid references auth.users(id) on delete set null;

alter table public.service_provider_services
  add column if not exists flash_sale_requested boolean not null default false,
  add column if not exists flash_sale_price_kes numeric(14,2),
  add column if not exists flash_sale_starts_at timestamptz,
  add column if not exists flash_sale_ends_at timestamptz,
  add column if not exists flash_sale_status text not null default 'none',
  add column if not exists flash_sale_admin_notes text,
  add column if not exists flash_sale_reviewed_at timestamptz,
  add column if not exists flash_sale_reviewed_by uuid references auth.users(id) on delete set null;

alter table public.service_provider_services
  drop constraint if exists service_provider_services_flash_sale_status_check;
alter table public.service_provider_services
  add constraint service_provider_services_flash_sale_status_check
  check (flash_sale_status in ('none','requested','approved','rejected','expired'));

alter table public.service_provider_services
  drop constraint if exists service_provider_services_flash_sale_terms_check;
alter table public.service_provider_services
  add constraint service_provider_services_flash_sale_terms_check
  check (
    not flash_sale_requested
    or (
      flash_sale_price_kes is not null
      and flash_sale_price_kes > 0
      and flash_sale_starts_at is not null
      and flash_sale_ends_at is not null
      and flash_sale_ends_at > flash_sale_starts_at
    )
  );

alter table public.service_requests
  add column if not exists service_pricing_model_snapshot text,
  add column if not exists service_normal_price_snapshot_kes numeric(14,2),
  add column if not exists service_price_snapshot_kes numeric(14,2),
  add column if not exists service_flash_sale_applied boolean not null default false;

create or replace function private.guard_seller_flash_sale_updates()
returns trigger
language plpgsql
set search_path=''
as $function$
declare
  v_min_variant_price numeric;
begin
  if (select auth.uid())=new.seller_id
     and not private.is_leogo_admin('approvals.manage') then

    if new.flash_sale_admin_notes is distinct from old.flash_sale_admin_notes
       or new.flash_sale_reviewed_at is distinct from old.flash_sale_reviewed_at
       or new.flash_sale_reviewed_by is distinct from old.flash_sale_reviewed_by then
      raise exception 'Flash Sale review fields are controlled by LEOGO Admin';
    end if;

    if row(
      new.flash_sale_requested,new.flash_sale_price_kes,new.flash_sale_starts_at,
      new.flash_sale_ends_at,new.flash_sale_quantity,new.flash_sale_status
    ) is distinct from row(
      old.flash_sale_requested,old.flash_sale_price_kes,old.flash_sale_starts_at,
      old.flash_sale_ends_at,old.flash_sale_quantity,old.flash_sale_status
    ) then
      if new.flash_sale_status not in ('none','requested') then
        raise exception 'Only LEOGO Admin can approve or reject a Flash Sale';
      end if;

      if new.flash_sale_status='requested' then
        if new.product_approval_status<>'approved' or new.listing_status<>'active'
           or new.availability_status<>'available' then
          raise exception 'Only an approved, active and available product can enter Flash Sale';
        end if;
        if new.fulfilment_type='group_order' then
          raise exception 'Group / Global MOQ products cannot use Flash Sale';
        end if;
        if new.flash_sale_price_kes is null or new.flash_sale_price_kes<=0
           or new.flash_sale_price_kes>=new.price_kes then
          raise exception 'Flash Sale price must be below the normal product price';
        end if;
        if new.has_variants then
          select min(v.price_kes) into v_min_variant_price
          from public.seller_product_variants v
          where v.product_id=new.id and v.is_active;
          if v_min_variant_price is not null and new.flash_sale_price_kes>=v_min_variant_price then
            raise exception 'Flash Sale price must be below every active variant price';
          end if;
        end if;
        if new.flash_sale_quantity is null or new.flash_sale_quantity<=0
           or new.flash_sale_quantity>new.quantity_available then
          raise exception 'Flash Sale quantity must be within current available stock';
        end if;
        if new.flash_sale_starts_at is null or new.flash_sale_ends_at is null
           or new.flash_sale_ends_at<=new.flash_sale_starts_at
           or new.flash_sale_ends_at<=now() then
          raise exception 'Choose a valid Flash Sale time window that has not already ended';
        end if;
      end if;
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists seller_flash_sale_update_guard on public.seller_products;
create trigger seller_flash_sale_update_guard
before update on public.seller_products
for each row execute function private.guard_seller_flash_sale_updates();

revoke execute on function private.guard_seller_flash_sale_updates() from public,anon,authenticated;

create or replace function public.seller_request_product_flash_sale(
  p_product_id uuid,
  p_flash_price_kes numeric,
  p_flash_quantity numeric,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_product public.seller_products%rowtype;
  v_min_variant_price numeric;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select * into v_product
  from public.seller_products
  where id=p_product_id and seller_id=v_uid
  for update;

  if not found then raise exception 'Product not found'; end if;
  if not exists(
    select 1 from public.seller_accounts s
    where s.user_id=v_uid and s.application_status='approved'
  ) then raise exception 'Approved Seller account required'; end if;
  if v_product.product_approval_status<>'approved'
     or v_product.listing_status<>'active'
     or v_product.availability_status<>'available' then
    raise exception 'Only an approved, active and available product can enter Flash Sale';
  end if;
  if v_product.fulfilment_type='group_order' then
    raise exception 'Group / Global MOQ products cannot use Flash Sale';
  end if;
  if p_flash_price_kes is null or p_flash_price_kes<=0 or p_flash_price_kes>=v_product.price_kes then
    raise exception 'Flash Sale price must be below the normal product price';
  end if;
  if v_product.has_variants then
    select min(v.price_kes) into v_min_variant_price
    from public.seller_product_variants v
    where v.product_id=v_product.id and v.is_active;
    if v_min_variant_price is not null and p_flash_price_kes>=v_min_variant_price then
      raise exception 'Flash Sale price must be below every active variant price';
    end if;
  end if;
  if p_flash_quantity is null or p_flash_quantity<=0 or p_flash_quantity>v_product.quantity_available then
    raise exception 'Flash Sale quantity must be greater than zero and within current available stock';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at or p_ends_at<=now() then
    raise exception 'Choose a valid Flash Sale start and end time';
  end if;

  update public.seller_products
  set flash_sale_requested=true,
      flash_sale_price_kes=round(p_flash_price_kes,2),
      flash_sale_quantity=p_flash_quantity,
      flash_sale_starts_at=p_starts_at,
      flash_sale_ends_at=p_ends_at,
      flash_sale_status='requested',
      flash_sale_admin_notes=null,
      flash_sale_reviewed_at=null,
      flash_sale_reviewed_by=null,
      updated_at=now()
  where id=v_product.id;

  return jsonb_build_object(
    'ok',true,'product_id',v_product.id,'flash_sale_status','requested'
  );
end
$function$;

revoke execute on function public.seller_request_product_flash_sale(uuid,numeric,numeric,timestamptz,timestamptz) from public,anon;
grant execute on function public.seller_request_product_flash_sale(uuid,numeric,numeric,timestamptz,timestamptz) to authenticated;

create or replace function public.service_provider_request_flash_sale(
  p_service_id uuid,
  p_flash_price_kes numeric,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_service public.service_provider_services%rowtype;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(
    select 1 from public.service_provider_accounts a
    where a.user_id=v_uid and a.application_status='approved'
  ) then raise exception 'Approved Service Provider account required'; end if;

  select * into v_service
  from public.service_provider_services
  where id=p_service_id and provider_id=v_uid
  for update;

  if not found then raise exception 'Service listing not found'; end if;
  if v_service.approval_status<>'approved' or not v_service.is_available then
    raise exception 'Only an approved and available service can enter Flash Sale';
  end if;
  if v_service.pricing_model<>'fixed' or coalesce(v_service.price_from_kes,0)<=0 then
    raise exception 'Flash Sale is available only for fixed-price services';
  end if;
  if p_flash_price_kes is null or p_flash_price_kes<=0 or p_flash_price_kes>=v_service.price_from_kes then
    raise exception 'Flash Sale price must be below the approved fixed service price';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at or p_ends_at<=now() then
    raise exception 'Choose a valid Flash Sale start and end time';
  end if;

  update public.service_provider_services
  set flash_sale_requested=true,
      flash_sale_price_kes=round(p_flash_price_kes,2),
      flash_sale_starts_at=p_starts_at,
      flash_sale_ends_at=p_ends_at,
      flash_sale_status='requested',
      flash_sale_admin_notes=null,
      flash_sale_reviewed_at=null,
      flash_sale_reviewed_by=null,
      updated_at=now()
  where id=v_service.id;

  return jsonb_build_object(
    'ok',true,'service_id',v_service.id,'flash_sale_status','requested'
  );
end
$function$;

revoke execute on function public.service_provider_request_flash_sale(uuid,numeric,timestamptz,timestamptz) from public,anon;
grant execute on function public.service_provider_request_flash_sale(uuid,numeric,timestamptz,timestamptz) to authenticated;

create or replace function public.customer_public_service_flash_sales()
returns table(
  service_id uuid,
  normal_price_kes numeric,
  flash_sale_price_kes numeric,
  flash_sale_starts_at timestamptz,
  flash_sale_ends_at timestamptz
)
language sql
security definer
set search_path=''
as $function$
  select s.id,s.price_from_kes,s.flash_sale_price_kes,s.flash_sale_starts_at,s.flash_sale_ends_at
  from public.service_provider_services s
  join public.service_provider_accounts p on p.user_id=s.provider_id
  where s.approval_status='approved'
    and s.is_available
    and s.pricing_model='fixed'
    and s.flash_sale_requested
    and s.flash_sale_status='approved'
    and s.flash_sale_price_kes>0
    and s.flash_sale_price_kes<s.price_from_kes
    and s.flash_sale_starts_at<=now()
    and s.flash_sale_ends_at>now()
    and p.application_status='approved'
    and p.availability_status<>'offline'
$function$;

revoke execute on function public.customer_public_service_flash_sales() from public;
grant execute on function public.customer_public_service_flash_sales() to anon,authenticated;

create or replace function public.admin_list_partner_flash_sales()
returns table(
  partner_type text,
  item_type text,
  item_id uuid,
  partner_id uuid,
  partner_name text,
  item_name text,
  normal_price_kes numeric,
  flash_price_kes numeric,
  flash_quantity numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  flash_status text,
  admin_notes text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not private.is_leogo_admin('approvals.read') then
    raise exception 'Approval permission required';
  end if;

  return query
    select 'seller'::text,'product'::text,p.id,p.seller_id,s.business_name,p.product_name,
           p.price_kes,p.flash_sale_price_kes,p.flash_sale_quantity,p.flash_sale_starts_at,p.flash_sale_ends_at,
           p.flash_sale_status,p.flash_sale_admin_notes,p.updated_at
    from public.seller_products p
    join public.seller_accounts s on s.user_id=p.seller_id
    where p.flash_sale_requested or p.flash_sale_status<>'none'

    union all

    select 'service_provider'::text,'service'::text,v.id,v.provider_id,a.business_name,v.service_name,
           v.price_from_kes,v.flash_sale_price_kes,null::numeric,v.flash_sale_starts_at,v.flash_sale_ends_at,
           v.flash_sale_status,v.flash_sale_admin_notes,v.updated_at
    from public.service_provider_services v
    join public.service_provider_accounts a on a.user_id=v.provider_id
    where v.flash_sale_requested or v.flash_sale_status<>'none'

    union all

    select 'cyber'::text,'service'::text,c.id,c.provider_id,a.business_name,c.service_name,
           c.price_kes,c.flash_sale_price_kes,null::numeric,c.flash_sale_starts_at,c.flash_sale_ends_at,
           c.flash_sale_status,c.flash_sale_admin_notes,c.updated_at
    from public.cyber_services c
    join public.cyber_provider_accounts a on a.user_id=c.provider_id
    where c.flash_sale_requested or c.flash_sale_status<>'none'

    order by
      case flash_status when 'requested' then 0 when 'approved' then 1 else 2 end,
      updated_at desc;
end
$function$;

revoke execute on function public.admin_list_partner_flash_sales() from public,anon;
grant execute on function public.admin_list_partner_flash_sales() to authenticated;

create or replace function public.admin_review_partner_flash_sale(
  p_partner_type text,
  p_item_id uuid,
  p_decision text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_product public.seller_products%rowtype;
  v_service public.service_provider_services%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_partner_id uuid;
  v_item_name text;
  v_status text;
  v_min_variant_price numeric;
begin
  if not private.is_leogo_admin('approvals.manage') then
    raise exception 'Approval permission required';
  end if;
  if p_partner_type not in ('seller','service_provider','cyber') then
    raise exception 'Unsupported Flash Sale partner type';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'Choose approve or reject';
  end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_notes,'')))<3 then
    raise exception 'Add a clear rejection reason';
  end if;

  if p_partner_type='cyber' then
    return public.admin_review_cyber_service_flash_sale(p_item_id,p_decision,p_notes);
  end if;

  v_status:=case when p_decision='approve' then 'approved' else 'rejected' end;

  if p_partner_type='seller' then
    select * into v_product from public.seller_products
    where id=p_item_id and flash_sale_requested
    for update;
    if not found then raise exception 'Seller Flash Sale request not found'; end if;
    if v_product.flash_sale_status not in ('requested','rejected') then
      raise exception 'This Seller Flash Sale is no longer awaiting review';
    end if;

    if p_decision='approve' then
      if v_product.product_approval_status<>'approved'
         or v_product.listing_status<>'active'
         or v_product.availability_status<>'available'
         or not exists(
           select 1 from public.seller_accounts s
           where s.user_id=v_product.seller_id and s.application_status='approved'
         ) then
        raise exception 'Seller product must still be approved, active and available';
      end if;
      if v_product.fulfilment_type='group_order' then
        raise exception 'Group / Global MOQ products cannot use Flash Sale';
      end if;
      if v_product.flash_sale_price_kes is null or v_product.flash_sale_price_kes<=0
         or v_product.flash_sale_price_kes>=v_product.price_kes
         or v_product.flash_sale_quantity is null or v_product.flash_sale_quantity<=0
         or v_product.flash_sale_quantity>v_product.quantity_available
         or v_product.flash_sale_ends_at<=now() then
        raise exception 'The Seller Flash Sale request is no longer valid';
      end if;
      if v_product.has_variants then
        select min(v.price_kes) into v_min_variant_price
        from public.seller_product_variants v
        where v.product_id=v_product.id and v.is_active;
        if v_min_variant_price is not null and v_product.flash_sale_price_kes>=v_min_variant_price then
          raise exception 'Flash Sale price must be below every active variant price';
        end if;
      end if;
    end if;

    v_before:=to_jsonb(v_product);
    update public.seller_products
    set flash_sale_status=v_status,
        flash_sale_admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
        flash_sale_reviewed_at=now(),
        flash_sale_reviewed_by=(select auth.uid()),
        updated_at=now()
    where id=v_product.id
    returning to_jsonb(public.seller_products.*) into v_after;

    v_partner_id:=v_product.seller_id;
    v_item_name:=v_product.product_name;

    perform private.notify_partner(
      v_partner_id,'seller',
      case when p_decision='approve' then 'flash_sale_approved' else 'flash_sale_rejected' end,
      case when p_decision='approve' then 'Flash Sale approved' else 'Flash Sale needs attention' end,
      v_item_name||case when p_decision='approve'
        then ' is approved for Flash Sale during the submitted time window.'
        else ' Flash Sale request was not approved. Admin note: '||btrim(p_notes) end,
      'seller_product',p_item_id,'flashsale',
      jsonb_build_object('flash_sale_status',v_status)
    );

    perform private.write_admin_audit(
      'flash_sale.'||p_decision,'seller_product',p_item_id::text,v_before,v_after,
      jsonb_build_object('partner_type','seller')
    );

  else
    select * into v_service from public.service_provider_services
    where id=p_item_id and flash_sale_requested
    for update;
    if not found then raise exception 'Service Provider Flash Sale request not found'; end if;
    if v_service.flash_sale_status not in ('requested','rejected') then
      raise exception 'This Service Provider Flash Sale is no longer awaiting review';
    end if;

    if p_decision='approve' then
      if v_service.approval_status<>'approved'
         or not v_service.is_available
         or v_service.pricing_model<>'fixed'
         or not exists(
           select 1 from public.service_provider_accounts a
           where a.user_id=v_service.provider_id and a.application_status='approved'
         ) then
        raise exception 'Service must still be approved, fixed-price and available';
      end if;
      if v_service.flash_sale_price_kes is null or v_service.flash_sale_price_kes<=0
         or v_service.flash_sale_price_kes>=v_service.price_from_kes
         or v_service.flash_sale_ends_at<=now() then
        raise exception 'The Service Provider Flash Sale request is no longer valid';
      end if;
    end if;

    v_before:=to_jsonb(v_service);
    update public.service_provider_services
    set flash_sale_status=v_status,
        flash_sale_admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
        flash_sale_reviewed_at=now(),
        flash_sale_reviewed_by=(select auth.uid()),
        updated_at=now()
    where id=v_service.id
    returning to_jsonb(public.service_provider_services.*) into v_after;

    v_partner_id:=v_service.provider_id;
    v_item_name:=v_service.service_name;

    perform private.notify_partner(
      v_partner_id,'service_provider',
      case when p_decision='approve' then 'service_flash_sale_approved' else 'service_flash_sale_rejected' end,
      case when p_decision='approve' then 'Service Flash Sale approved' else 'Service Flash Sale needs attention' end,
      v_item_name||case when p_decision='approve'
        then ' is approved for Flash Sale during the submitted time window.'
        else ' Flash Sale request was not approved. Admin note: '||btrim(p_notes) end,
      'service_provider_service',p_item_id,'flashsale',
      jsonb_build_object('flash_sale_status',v_status)
    );

    perform private.write_admin_audit(
      'flash_sale.'||p_decision,'service_provider_service',p_item_id::text,v_before,v_after,
      jsonb_build_object('partner_type','service_provider')
    );
  end if;

  return jsonb_build_object(
    'ok',true,'partner_type',p_partner_type,'item_id',p_item_id,'flash_sale_status',v_status
  );
end
$function$;

revoke execute on function public.admin_review_partner_flash_sale(text,uuid,text,text) from public,anon;
grant execute on function public.admin_review_partner_flash_sale(text,uuid,text,text) to authenticated;
