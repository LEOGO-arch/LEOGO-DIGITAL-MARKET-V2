-- STAGING ONLY: restore the missing production LPP foundation, schema only.
-- Source: production catalog snapshot, 24 October 2026. No customer data, cron jobs or credentials.
-- Refuse databases where the LPP ledger already exists (including production).
DO $$ BEGIN IF to_regclass('public.lipa_pole_pole_accounts') IS NOT NULL OR to_regclass('public.lipa_pole_pole_payments') IS NOT NULL OR to_regclass('public.lipa_pole_pole_events') IS NOT NULL THEN RAISE EXCEPTION 'Missing-ledger staging repair only: existing LPP ledgers must not be changed'; END IF; END $$;
SET LOCAL search_path=public;
CREATE TABLE public.lipa_pole_pole_accounts (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "account_reference" text NOT NULL,
  "customer_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "variant_id" uuid,
  "product_name" text NOT NULL,
  "variant_name" text,
  "variant_image_path" text,
  "quantity" numeric NOT NULL,
  "unit_price_kes" numeric NOT NULL,
  "items_subtotal_kes" numeric NOT NULL,
  "service_fee_kes" numeric DEFAULT 0 NOT NULL,
  "pickup_fee_kes" numeric DEFAULT 0 NOT NULL,
  "delivery_fee_kes" numeric DEFAULT 0 NOT NULL,
  "overdue_charge_kes" numeric DEFAULT 0 NOT NULL,
  "total_payable_kes" numeric NOT NULL,
  "required_first_deposit_kes" numeric NOT NULL,
  "approved_paid_kes" numeric DEFAULT 0 NOT NULL,
  "max_days" integer NOT NULL,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deadline_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'deposit_pending'::text NOT NULL,
  "receiver_name" text NOT NULL,
  "contact_number" text NOT NULL,
  "delivery_zone" text NOT NULL,
  "county" text,
  "sub_county" text,
  "estate" text,
  "landmark" text,
  "location_link" text,
  "pickup_station_id" uuid,
  "cancellation_requested_at" timestamp with time zone,
  "cancellation_reason" text,
  "cancellation_details" text,
  "cancellation_reviewed_at" timestamp with time zone,
  "cancellation_reviewed_by" uuid,
  "cancellation_review_notes" text,
  "cancellation_deduction_kes" numeric DEFAULT 0 NOT NULL,
  "refund_due_kes" numeric DEFAULT 0 NOT NULL,
  "refund_status" text DEFAULT 'not_required'::text NOT NULL,
  "refund_paid_at" timestamp with time zone,
  "refund_paid_by" uuid,
  "refund_reference" text,
  "marketplace_order_id" uuid,
  "stock_reserved" boolean DEFAULT true NOT NULL,
  "stock_released" boolean DEFAULT false NOT NULL,
  "flash_sale_applied" boolean DEFAULT false NOT NULL,
  "flash_sale_quantity_reserved" numeric DEFAULT 0 NOT NULL,
  "last_reminder_at" timestamp with time zone,
  "fully_paid_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lipa_pole_pole_accounts_account_reference_key" UNIQUE (account_reference),
  CONSTRAINT "lipa_pole_pole_accounts_approved_paid_kes_check" CHECK ((approved_paid_kes >= (0)::numeric)),
  CONSTRAINT "lipa_pole_pole_accounts_cancellation_deduction_kes_check" CHECK ((cancellation_deduction_kes >= (0)::numeric)),
  CONSTRAINT "lipa_pole_pole_accounts_delivery_fee_kes_check" CHECK ((delivery_fee_kes >= (0)::numeric)),
  CONSTRAINT "lipa_pole_pole_accounts_delivery_zone_check" CHECK ((delivery_zone = ANY (ARRAY['pickup'::text, 'cbd'::text, 'estate'::text, 'outside'::text]))),
  CONSTRAINT "lipa_pole_pole_accounts_flash_sale_quantity_reserved_check" CHECK ((flash_sale_quantity_reserved >= (0)::numeric)),
  CONSTRAINT "lipa_pole_pole_accounts_items_subtotal_kes_check" CHECK ((items_subtotal_kes >= (0)::numeric)),
  CONSTRAINT "lipa_pole_pole_accounts_max_days_check" CHECK (((max_days >= 1) AND (max_days <= 365))),
  CONSTRAINT "lipa_pole_pole_accounts_overdue_charge_kes_check" CHECK ((overdue_charge_kes >= (0)::numeric)),
  CONSTRAINT "lipa_pole_pole_accounts_pickup_fee_kes_check" CHECK ((pickup_fee_kes >= (0)::numeric)),
  CONSTRAINT "lipa_pole_pole_accounts_pkey" PRIMARY KEY (id),
  CONSTRAINT "lipa_pole_pole_accounts_quantity_check" CHECK ((quantity > (0)::numeric)),
  CONSTRAINT "lipa_pole_pole_accounts_refund_due_kes_check" CHECK ((refund_due_kes >= (0)::numeric)),
  CONSTRAINT "lipa_pole_pole_accounts_refund_status_check" CHECK ((refund_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'paid'::text]))),
  CONSTRAINT "lipa_pole_pole_accounts_required_first_deposit_kes_check" CHECK ((required_first_deposit_kes > (0)::numeric)),
  CONSTRAINT "lipa_pole_pole_accounts_service_fee_kes_check" CHECK ((service_fee_kes >= (0)::numeric)),
  CONSTRAINT "lipa_pole_pole_accounts_status_check" CHECK ((status = ANY (ARRAY['deposit_pending'::text, 'active'::text, 'fully_paid'::text, 'overdue'::text, 'cancellation_pending'::text, 'cancelled'::text, 'refund_pending'::text, 'refunded'::text]))),
  CONSTRAINT "lipa_pole_pole_accounts_total_payable_kes_check" CHECK ((total_payable_kes >= (0)::numeric)),
  CONSTRAINT "lipa_pole_pole_accounts_unit_price_kes_check" CHECK ((unit_price_kes >= (0)::numeric))
);
ALTER TABLE public.lipa_pole_pole_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lipa_pole_pole_accounts FROM PUBLIC, anon, authenticated;
CREATE TABLE public.lipa_pole_pole_events (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "account_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "actor_id" uuid,
  "actor_role" text,
  "event_note" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lipa_pole_pole_events_pkey" PRIMARY KEY (id)
);
ALTER TABLE public.lipa_pole_pole_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lipa_pole_pole_events FROM PUBLIC, anon, authenticated;
CREATE TABLE public.lipa_pole_pole_payments (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "payment_type" text NOT NULL,
  "amount_kes" numeric NOT NULL,
  "payment_reference" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_at" timestamp with time zone,
  "reviewed_by" uuid,
  "review_notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lipa_pole_pole_payments_amount_kes_check" CHECK ((amount_kes > (0)::numeric)),
  CONSTRAINT "lipa_pole_pole_payments_payment_type_check" CHECK ((payment_type = ANY (ARRAY['deposit'::text, 'instalment'::text]))),
  CONSTRAINT "lipa_pole_pole_payments_pkey" PRIMARY KEY (id),
  CONSTRAINT "lipa_pole_pole_payments_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);
ALTER TABLE public.lipa_pole_pole_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lipa_pole_pole_payments FROM PUBLIC, anon, authenticated;
ALTER TABLE public.lipa_pole_pole_accounts ADD CONSTRAINT "lipa_pole_pole_accounts_cancellation_reviewed_by_fkey" FOREIGN KEY (cancellation_reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.lipa_pole_pole_accounts ADD CONSTRAINT "lipa_pole_pole_accounts_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.lipa_pole_pole_accounts ADD CONSTRAINT "lipa_pole_pole_accounts_marketplace_order_id_fkey" FOREIGN KEY (marketplace_order_id) REFERENCES marketplace_orders(id) ON DELETE SET NULL;
ALTER TABLE public.lipa_pole_pole_accounts ADD CONSTRAINT "lipa_pole_pole_accounts_pickup_station_id_fkey" FOREIGN KEY (pickup_station_id) REFERENCES pickup_stations(id) ON DELETE SET NULL;
ALTER TABLE public.lipa_pole_pole_accounts ADD CONSTRAINT "lipa_pole_pole_accounts_product_id_fkey" FOREIGN KEY (product_id) REFERENCES seller_products(id) ON DELETE RESTRICT;
ALTER TABLE public.lipa_pole_pole_accounts ADD CONSTRAINT "lipa_pole_pole_accounts_refund_paid_by_fkey" FOREIGN KEY (refund_paid_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.lipa_pole_pole_accounts ADD CONSTRAINT "lipa_pole_pole_accounts_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.lipa_pole_pole_accounts ADD CONSTRAINT "lipa_pole_pole_accounts_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES seller_product_variants(id) ON DELETE RESTRICT;
CREATE INDEX lpp_accounts_customer_idx ON public.lipa_pole_pole_accounts USING btree (customer_id, updated_at DESC);
CREATE INDEX lpp_accounts_seller_idx ON public.lipa_pole_pole_accounts USING btree (seller_id, updated_at DESC);
CREATE INDEX lpp_accounts_status_deadline_idx ON public.lipa_pole_pole_accounts USING btree (status, deadline_at);
CREATE UNIQUE INDEX lpp_active_customer_product_no_variant_uq ON public.lipa_pole_pole_accounts USING btree (customer_id, product_id) WHERE ((variant_id IS NULL) AND (status = ANY (ARRAY['deposit_pending'::text, 'active'::text, 'overdue'::text, 'cancellation_pending'::text])));
CREATE UNIQUE INDEX lpp_active_customer_product_variant_uq ON public.lipa_pole_pole_accounts USING btree (customer_id, product_id, variant_id) WHERE ((variant_id IS NOT NULL) AND (status = ANY (ARRAY['deposit_pending'::text, 'active'::text, 'overdue'::text, 'cancellation_pending'::text])));
ALTER TABLE public.lipa_pole_pole_events ADD CONSTRAINT "lipa_pole_pole_events_account_id_fkey" FOREIGN KEY (account_id) REFERENCES lipa_pole_pole_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public.lipa_pole_pole_events ADD CONSTRAINT "lipa_pole_pole_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX lpp_events_account_idx ON public.lipa_pole_pole_events USING btree (account_id, created_at);
ALTER TABLE public.lipa_pole_pole_payments ADD CONSTRAINT "lipa_pole_pole_payments_account_id_fkey" FOREIGN KEY (account_id) REFERENCES lipa_pole_pole_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public.lipa_pole_pole_payments ADD CONSTRAINT "lipa_pole_pole_payments_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.lipa_pole_pole_payments ADD CONSTRAINT "lipa_pole_pole_payments_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX lpp_payment_reference_uq ON public.lipa_pole_pole_payments USING btree (lower(btrim(payment_reference)));
CREATE INDEX lpp_payments_account_idx ON public.lipa_pole_pole_payments USING btree (account_id, submitted_at DESC);
CREATE INDEX lpp_payments_pending_idx ON public.lipa_pole_pole_payments USING btree (status, submitted_at) WHERE (status = 'pending'::text);
ALTER TABLE public.marketplace_orders ADD COLUMN lipa_pole_pole_account_id uuid REFERENCES public.lipa_pole_pole_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.marketplace_orders DROP CONSTRAINT marketplace_orders_payment_method_check;
ALTER TABLE public.marketplace_orders ADD CONSTRAINT marketplace_orders_payment_method_check CHECK(payment_method IN ('till','paybill','cod','points','lipa_pole_pole'));
CREATE OR REPLACE FUNCTION public.admin_review_lipa_pole_pole_payment(p_payment_id uuid, p_approve boolean, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  pay public.lipa_pole_pole_payments%rowtype;
  a public.lipa_pole_pole_accounts%rowtype;
  v_new_paid numeric;
  v_order_id uuid;
begin
  if (p_approve) then perform private.require_payment_notice('lipa_pole_pole',p_payment_id,p_notes); end if;
  if not private.is_leogo_admin('orders.payment_verify')
     and not private.is_leogo_admin('approvals.manage') then
    raise exception 'Payment verification permission required';
  end if;

  select * into pay
  from public.lipa_pole_pole_payments
  where id=p_payment_id
  for update;

  if not found then raise exception 'Lipa Pole Pole payment not found'; end if;
  if pay.status<>'pending' then raise exception 'This payment has already been reviewed'; end if;

  select * into a
  from public.lipa_pole_pole_accounts
  where id=pay.account_id
  for update;

  if not found then raise exception 'Lipa Pole Pole account not found'; end if;
  if a.status in ('cancelled','refund_pending','refunded','fully_paid') then
    raise exception 'This account cannot accept payment review at its current status';
  end if;

  if p_approve then
    v_new_paid:=least(a.total_payable_kes,a.approved_paid_kes+pay.amount_kes);

    update public.lipa_pole_pole_payments
    set status='approved',reviewed_at=now(),reviewed_by=(select auth.uid()),
        review_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now()
    where id=pay.id;

    update public.lipa_pole_pole_accounts
    set approved_paid_kes=v_new_paid,
        status=case
          when v_new_paid>=total_payable_kes then 'fully_paid'
          when status='deposit_pending' and v_new_paid>=required_first_deposit_kes then 'active'
          when status='overdue' then 'active'
          else status
        end,
        fully_paid_at=case when v_new_paid>=total_payable_kes then coalesce(fully_paid_at,now()) else fully_paid_at end,
        updated_at=now()
    where id=a.id;

    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    )
    values(
      a.customer_id,'payment','Lipa Pole Pole payment verified',
      'LEOGO verified KSh '||pay.amount_kes||' for '||a.account_reference||'.',
      'lipa_pole_pole_account',a.id,'lpp_payment_approved_'||pay.id::text,'lipapolepole',
      jsonb_build_object('account_reference',a.account_reference,'payment_id',pay.id,'amount_kes',pay.amount_kes)
    )
    on conflict do nothing;

    perform private.notify_partner(
      a.seller_id,'seller','lpp_payment_verified','Lipa Pole Pole payment verified',
      'LEOGO verified KSh '||pay.amount_kes||' on '||a.account_reference||'.',
      'lipa_pole_pole_account',a.id,'lipa-pole-pole',
      jsonb_build_object('account_reference',a.account_reference,'amount_kes',pay.amount_kes,'approved_paid_kes',v_new_paid)
    );

    perform private.lpp_write_event(a.id,'payment_approved','admin',p_notes,jsonb_build_object('payment_id',pay.id,'amount_kes',pay.amount_kes,'approved_paid_kes',v_new_paid));

    if v_new_paid>=a.total_payable_kes then
      v_order_id:=private.lpp_create_marketplace_order(a.id);
    end if;
  else
    if char_length(btrim(coalesce(p_notes,'')))<3 then
      raise exception 'Provide a clear reason for rejecting the payment';
    end if;

    update public.lipa_pole_pole_payments
    set status='rejected',reviewed_at=now(),reviewed_by=(select auth.uid()),
        review_notes=btrim(p_notes),updated_at=now()
    where id=pay.id;

    if pay.payment_type='deposit' and a.approved_paid_kes=0 then
      perform private.lpp_release_reserved_stock(a.id);
      update public.lipa_pole_pole_accounts
      set status='cancelled',updated_at=now()
      where id=a.id;

      perform private.notify_partner(
        a.seller_id,'seller','lpp_deposit_rejected','Lipa Pole Pole deposit rejected',
        a.account_reference||' was closed because the first deposit was not verified. Reserved stock has been returned.',
        'lipa_pole_pole_account',a.id,'lipa-pole-pole',
        jsonb_build_object('account_reference',a.account_reference)
      );
    end if;

    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    )
    values(
      a.customer_id,'payment','Lipa Pole Pole payment needs attention',
      case when pay.payment_type='deposit' and a.approved_paid_kes=0
        then 'The first deposit for '||a.account_reference||' was not verified and the reservation was cancelled. '||btrim(p_notes)
        else 'A payment for '||a.account_reference||' was not verified. '||btrim(p_notes)
      end,
      'lipa_pole_pole_account',a.id,'lpp_payment_rejected_'||pay.id::text,'lipapolepole',
      jsonb_build_object('account_reference',a.account_reference,'payment_id',pay.id,'amount_kes',pay.amount_kes)
    )
    on conflict do nothing;

    perform private.lpp_write_event(
      a.id,
      case when pay.payment_type='deposit' and a.approved_paid_kes=0 then 'deposit_rejected_account_cancelled' else 'payment_rejected' end,
      'admin',p_notes,jsonb_build_object('payment_id',pay.id,'amount_kes',pay.amount_kes)
    );
  end if;

  perform private.write_admin_audit(
    case when p_approve then 'lipa_pole_pole.payment.approved' else 'lipa_pole_pole.payment.rejected' end,
    'lipa_pole_pole_payment',pay.id::text,
    jsonb_build_object('status','pending'),
    jsonb_build_object('status',case when p_approve then 'approved' else 'rejected' end),
    jsonb_build_object('account_id',a.id,'account_reference',a.account_reference,'amount_kes',pay.amount_kes,'notes',nullif(btrim(coalesce(p_notes,'')),''))
  );

  return jsonb_build_object(
    'ok',true,'payment_id',pay.id,
    'status',case when p_approve then 'approved' else 'rejected' end,
    'marketplace_order_id',v_order_id
  );
end;
$function$;

REVOKE ALL ON FUNCTION admin_review_lipa_pole_pole_payment(uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION admin_review_lipa_pole_pole_payment(uuid,boolean,text) TO authenticated;
CREATE OR REPLACE FUNCTION private.lpp_account_reference()
 RETURNS text
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select 'LPP-'||to_char(clock_timestamp(),'YYMMDDHH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
$function$;

REVOKE ALL ON FUNCTION private.lpp_account_reference() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.lpp_write_event(p_account_id uuid, p_event_type text, p_actor_role text, p_event_note text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  insert into public.lipa_pole_pole_events(
    account_id,event_type,actor_id,actor_role,event_note,metadata
  )
  values(
    p_account_id,p_event_type,(select auth.uid()),p_actor_role,
    nullif(btrim(coalesce(p_event_note,'')),''),
    coalesce(p_metadata,'{}'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION private.lpp_write_event(uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.lpp_release_reserved_stock(p_account_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.lipa_pole_pole_accounts%rowtype;
begin
  select * into a
  from public.lipa_pole_pole_accounts
  where id=p_account_id
  for update;

  if not found or not a.stock_reserved or a.stock_released then
    return;
  end if;

  if a.variant_id is not null then
    update public.seller_product_variants
    set quantity_available=quantity_available+a.quantity
    where id=a.variant_id and product_id=a.product_id;

    update public.seller_products p
    set quantity_available=coalesce((
          select sum(v.quantity_available)
          from public.seller_product_variants v
          where v.product_id=p.id and v.is_active
        ),0),
        availability_status=case when coalesce((
          select sum(v.quantity_available)
          from public.seller_product_variants v
          where v.product_id=p.id and v.is_active
        ),0)>0 then 'available' else availability_status end,
        updated_at=now()
    where p.id=a.product_id;
  else
    update public.seller_products
    set quantity_available=quantity_available+a.quantity,
        availability_status=case when quantity_available+a.quantity>0 then 'available' else availability_status end,
        updated_at=now()
    where id=a.product_id;
  end if;

  if a.flash_sale_applied
     and a.flash_sale_quantity_reserved>0
     and exists(
       select 1 from public.seller_products p
       where p.id=a.product_id
         and p.flash_sale_ends_at>now()
     ) then
    update public.seller_products
    set flash_sale_quantity=coalesce(flash_sale_quantity,0)+a.flash_sale_quantity_reserved,
        flash_sale_requested=true,
        flash_sale_status='approved',
        updated_at=now()
    where id=a.product_id;
  end if;

  update public.lipa_pole_pole_accounts
  set stock_released=true,updated_at=now()
  where id=a.id;
end;
$function$;

REVOKE ALL ON FUNCTION private.lpp_release_reserved_stock(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.customer_open_lipa_pole_pole_account(p_product_id uuid, p_variant_id uuid, p_quantity numeric, p_receiver_name text, p_contact_number text, p_delivery_zone text, p_county text DEFAULT NULL::text, p_sub_county text DEFAULT NULL::text, p_estate text DEFAULT NULL::text, p_landmark text DEFAULT NULL::text, p_location_link text DEFAULT NULL::text, p_pickup_station_id uuid DEFAULT NULL::uuid, p_payment_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=(select auth.uid());
  p public.seller_products%rowtype;
  v public.seller_product_variants%rowtype;
  v_account_id uuid;
  v_ref text;
  v_qty numeric:=coalesce(p_quantity,0);
  v_unit_price numeric;
  v_subtotal numeric;
  v_service numeric:=0;
  v_pickup numeric:=0;
  v_delivery numeric:=0;
  v_total numeric;
  v_deposit numeric;
  v_days integer;
  v_flash_active boolean:=false;
  v_payment_ref text:=btrim(coalesce(p_payment_reference,''));
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if v_qty<=0 then raise exception 'Choose a valid quantity'; end if;
  if char_length(btrim(coalesce(p_receiver_name,'')))<2
     or char_length(btrim(coalesce(p_contact_number,'')))<7 then
    raise exception 'Receiver name and contact are required';
  end if;
  if p_delivery_zone not in ('pickup','cbd','estate','outside') then
    raise exception 'Choose a supported delivery zone';
  end if;
  if p_delivery_zone='pickup' and p_pickup_station_id is null then
    raise exception 'Choose a pickup station';
  end if;
  if char_length(v_payment_ref)<8 then
    raise exception 'Paste the M-Pesa first-deposit payment reference/message';
  end if;

  select sp.* into p
  from public.seller_products sp
  join public.seller_accounts s on s.user_id=sp.seller_id
  join public.product_categories c on c.id=sp.category_id
  where sp.id=p_product_id
    and s.application_status='approved'
    and private.partner_has_active_subscription(s.user_id,'seller')
    and sp.product_approval_status='approved'
    and sp.listing_status='active'
    and sp.availability_status='available'
    and c.is_active
  for update of sp;

  if not found then raise exception 'This product is no longer available for Lipa Pole Pole'; end if;
  if not coalesce(p.accepts_lipa_pole_pole,false) then
    raise exception 'Seller has not enabled Lipa Pole Pole for this product';
  end if;
  if coalesce(p.lipa_pole_pole_first_deposit_kes,0)<=0
     or coalesce(p.lipa_pole_pole_max_days,0)<=0 then
    raise exception 'Seller must configure the first deposit and maximum payment period';
  end if;
  if p.fulfilment_type='group_order'
     and not coalesce((select local_available from public.product_shipping_profiles where product_id=p.id),false) then
    raise exception 'Use Join Group Order for this product';
  end if;

  v_flash_active:=(
    p.flash_sale_requested
    and p.flash_sale_status='approved'
    and p.flash_sale_price_kes is not null
    and p.flash_sale_price_kes>0
    and p.flash_sale_starts_at<=now()
    and p.flash_sale_ends_at>now()
    and coalesce(p.flash_sale_quantity,0)>=v_qty
  );

  if p.has_variants then
    if p_variant_id is null then raise exception 'Choose a product variant'; end if;
    select * into v
    from public.seller_product_variants
    where id=p_variant_id and product_id=p.id and is_active=true
    for update;
    if not found then raise exception 'Selected variant is no longer available'; end if;
    if v.quantity_available<v_qty then raise exception 'Selected variant does not have enough stock'; end if;
    v_unit_price:=case when v_flash_active then least(v.price_kes,p.flash_sale_price_kes) else v.price_kes end;
  else
    if p.quantity_available<v_qty then raise exception 'Product does not have enough stock'; end if;
    p_variant_id:=null;
    v_unit_price:=case when v_flash_active then least(p.price_kes,p.flash_sale_price_kes) else p.price_kes end;
  end if;

  v_subtotal:=round(v_unit_price*v_qty,2);
  v_service:=round(v_subtotal * case
    when v_subtotal>=coalesce((select service_fee_threshold_kes from public.order_settings where id=1),3000)
      then coalesce((select service_fee_at_or_above_percent from public.order_settings where id=1),1.5)/100
    else coalesce((select service_fee_below_percent from public.order_settings where id=1),2)/100
  end,2);

  if p_delivery_zone in ('cbd','estate','outside') then
    v_delivery:=private.delivery_fee_for_zone(p_delivery_zone);
  else
    select round(v_subtotal*(coalesce(service_fee_percent,0)/100),2),
           coalesce(shipping_fee_kes,0)
    into v_pickup,v_delivery
    from public.pickup_stations
    where id=p_pickup_station_id and is_active=true;
    if not found then raise exception 'Pickup station is not available'; end if;
  end if;

  v_total:=round(v_subtotal+v_service+v_pickup+v_delivery,2);
  v_deposit:=least(round(p.lipa_pole_pole_first_deposit_kes*v_qty,2),v_total);
  v_days:=p.lipa_pole_pole_max_days;

  if v_deposit<=0 then raise exception 'Seller-set first deposit is invalid'; end if;

  if exists(
    select 1 from public.lipa_pole_pole_payments
    where lower(btrim(payment_reference))=lower(v_payment_ref)
  ) then
    raise exception 'This M-Pesa reference has already been submitted';
  end if;

  v_ref:=private.lpp_account_reference();

  insert into public.lipa_pole_pole_accounts(
    account_reference,customer_id,seller_id,product_id,variant_id,
    product_name,variant_name,variant_image_path,quantity,unit_price_kes,
    items_subtotal_kes,service_fee_kes,pickup_fee_kes,delivery_fee_kes,
    total_payable_kes,required_first_deposit_kes,max_days,deadline_at,
    receiver_name,contact_number,delivery_zone,county,sub_county,estate,landmark,
    location_link,pickup_station_id,flash_sale_applied,flash_sale_quantity_reserved
  )
  values(
    v_ref,v_uid,p.seller_id,p.id,p_variant_id,p.product_name,
    case when p_variant_id is null then null else v.variant_name end,
    case when p_variant_id is null then null else v.image_path end,
    v_qty,v_unit_price,v_subtotal,v_service,v_pickup,v_delivery,
    v_total,v_deposit,v_days,now()+make_interval(days=>v_days),
    btrim(p_receiver_name),btrim(p_contact_number),p_delivery_zone,
    nullif(btrim(coalesce(p_county,'')),''),
    nullif(btrim(coalesce(p_sub_county,'')),''),
    nullif(btrim(coalesce(p_estate,'')),''),
    nullif(btrim(coalesce(p_landmark,'')),''),
    nullif(btrim(coalesce(p_location_link,'')),''),
    p_pickup_station_id,v_flash_active,case when v_flash_active then v_qty else 0 end
  )
  returning id into v_account_id;

  -- Reserve the item immediately after first-deposit proof is submitted.
  if p_variant_id is not null then
    update public.seller_product_variants
    set quantity_available=greatest(quantity_available-v_qty,0)
    where id=p_variant_id;

    update public.seller_products sp
    set quantity_available=coalesce((
          select sum(vv.quantity_available)
          from public.seller_product_variants vv
          where vv.product_id=sp.id and vv.is_active
        ),0),
        availability_status=case when coalesce((
          select sum(vv.quantity_available)
          from public.seller_product_variants vv
          where vv.product_id=sp.id and vv.is_active
        ),0)<=0 then 'out_of_stock' else 'available' end,
        updated_at=now()
    where sp.id=p.id;
  else
    update public.seller_products
    set quantity_available=greatest(quantity_available-v_qty,0),
        availability_status=case when quantity_available-v_qty<=0 then 'out_of_stock' else availability_status end,
        updated_at=now()
    where id=p.id;
  end if;

  if v_flash_active then
    update public.seller_products
    set flash_sale_quantity=greatest(coalesce(flash_sale_quantity,0)-v_qty,0),
        flash_sale_status=case when coalesce(flash_sale_quantity,0)-v_qty<=0 then 'expired' else flash_sale_status end,
        flash_sale_requested=case when coalesce(flash_sale_quantity,0)-v_qty<=0 then false else flash_sale_requested end,
        updated_at=now()
    where id=p.id;
  end if;

  insert into public.lipa_pole_pole_payments(
    account_id,customer_id,payment_type,amount_kes,payment_reference,status
  )
  values(v_account_id,v_uid,'deposit',v_deposit,v_payment_ref,'pending');

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    v_uid,'payment','Lipa Pole Pole deposit submitted',
    'Your first deposit for '||v_ref||' is waiting for LEOGO verification.',
    'lipa_pole_pole_account',v_account_id,'lpp_deposit_submitted_'||v_account_id::text,'lipapolepole',
    jsonb_build_object('account_reference',v_ref,'amount_kes',v_deposit)
  )
  on conflict do nothing;

  perform private.notify_partner(
    p.seller_id,'seller','lpp_account_opened','New Lipa Pole Pole reservation',
    'A customer opened '||v_ref||' for '||p.product_name||'. Stock is reserved while LEOGO verifies instalment payments.',
    'lipa_pole_pole_account',v_account_id,'lipa-pole-pole',
    jsonb_build_object('account_reference',v_ref,'product_id',p.id,'quantity',v_qty,'deadline_at',now()+make_interval(days=>v_days))
  );

  perform private.lpp_write_event(
    v_account_id,'account_opened','customer',
    'First deposit submitted and stock reserved.',
    jsonb_build_object('first_deposit_kes',v_deposit,'total_payable_kes',v_total)
  );

  return jsonb_build_object(
    'ok',true,'account_id',v_account_id,'account_reference',v_ref,
    'required_first_deposit_kes',v_deposit,'total_payable_kes',v_total,
    'deadline_at',now()+make_interval(days=>v_days),'status','deposit_pending'
  );
end;
$function$;

REVOKE ALL ON FUNCTION customer_open_lipa_pole_pole_account(uuid,uuid,numeric,text,text,text,text,text,text,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION customer_open_lipa_pole_pole_account(uuid,uuid,numeric,text,text,text,text,text,text,text,text,uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION private.lpp_create_marketplace_order(p_account_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.lipa_pole_pole_accounts%rowtype;
  v_order_id uuid;
  v_order_ref text;
begin
  select * into a
  from public.lipa_pole_pole_accounts
  where id=p_account_id
  for update;

  if not found then raise exception 'Lipa Pole Pole account not found'; end if;
  if a.status<>'fully_paid' then raise exception 'Lipa Pole Pole account is not fully paid'; end if;
  if a.marketplace_order_id is not null then return a.marketplace_order_id; end if;

  v_order_ref:='LEOGO-'||to_char(clock_timestamp(),'YYMMDDHH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));

  insert into public.marketplace_orders(
    order_reference,customer_id,receiver_name,contact_number,delivery_zone,
    county,sub_county,estate,landmark,location_link,pickup_station_id,
    items_subtotal_kes,service_fee_kes,pickup_fee_kes,delivery_fee_kes,
    grand_total_kes,payment_method,payment_status,payment_message,
    payment_verified_at,payment_verified_by,reward_points_redeemed_kes,
    external_amount_due_kes,lipa_pole_pole_account_id
  )
  values(
    v_order_ref,a.customer_id,a.receiver_name,a.contact_number,a.delivery_zone,
    a.county,a.sub_county,a.estate,a.landmark,a.location_link,a.pickup_station_id,
    a.items_subtotal_kes,a.service_fee_kes,a.pickup_fee_kes,a.delivery_fee_kes,
    a.total_payable_kes,'lipa_pole_pole','verified_paid',
    'Fully paid through '||a.account_reference,
    now(),(select auth.uid()),0,0,a.id
  )
  returning id into v_order_id;

  insert into public.marketplace_order_items(
    order_id,seller_id,product_id,variant_id,product_name,variant_name,variant_image_path,
    unit_price_kes,quantity,line_total_kes
  )
  values(
    v_order_id,a.seller_id,a.product_id,a.variant_id,a.product_name,a.variant_name,a.variant_image_path,
    a.unit_price_kes,a.quantity,a.items_subtotal_kes
  );

  insert into public.marketplace_seller_orders(order_id,seller_id,seller_subtotal_kes)
  values(v_order_id,a.seller_id,a.items_subtotal_kes);

  update public.lipa_pole_pole_accounts
  set marketplace_order_id=v_order_id,updated_at=now()
  where id=a.id;

  perform private.notify_partner(
    a.seller_id,'seller','new_order','Lipa Pole Pole fully paid',
    'Lipa Pole Pole account '||a.account_reference||' is fully paid. Order '||v_order_ref||' is now ready for normal Seller fulfilment.',
    'marketplace_order',v_order_id,'orders',
    jsonb_build_object('order_reference',v_order_ref,'lipa_pole_pole_account',a.account_reference,'seller_subtotal_kes',a.items_subtotal_kes)
  );

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    a.customer_id,'order','Lipa Pole Pole completed',
    'Your Lipa Pole Pole account '||a.account_reference||' is fully paid. Order '||v_order_ref||' has moved to fulfilment.',
    'marketplace_order',v_order_id,'lpp_fully_paid_order_'||a.id::text,'orders',
    jsonb_build_object('order_reference',v_order_ref,'lipa_pole_pole_account',a.account_reference)
  )
  on conflict do nothing;

  perform private.lpp_write_event(
    a.id,'marketplace_order_created','system',
    'Fully paid Lipa Pole Pole account entered the standard marketplace fulfilment workflow.',
    jsonb_build_object('marketplace_order_id',v_order_id,'order_reference',v_order_ref)
  );

  return v_order_id;
end;
$function$;

REVOKE ALL ON FUNCTION private.lpp_create_marketplace_order(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.mark_lipa_pole_pole_overdue()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count integer:=0; r record;
begin
  for r in
    select id,customer_id,seller_id,account_reference
    from public.lipa_pole_pole_accounts
    where status in ('deposit_pending','active')
      and marketplace_order_id is null
      and deadline_at<now()
      and approved_paid_kes<total_payable_kes
    for update skip locked
  loop
    update public.lipa_pole_pole_accounts
    set status='overdue',updated_at=now()
    where id=r.id;

    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    )
    values(
      r.customer_id,'payment','Lipa Pole Pole deadline missed',
      r.account_reference||' is overdue. LEOGO Admin will resolve it under the configured Lipa Pole Pole rules.',
      'lipa_pole_pole_account',r.id,'lpp_overdue_'||r.id::text,'lipapolepole',
      jsonb_build_object('account_reference',r.account_reference)
    )
    on conflict do nothing;

    perform private.notify_partner(
      r.seller_id,'seller','lpp_overdue','Lipa Pole Pole account overdue',
      r.account_reference||' has passed its payment deadline.',
      'lipa_pole_pole_account',r.id,'lipa-pole-pole',
      jsonb_build_object('account_reference',r.account_reference)
    );

    perform private.lpp_write_event(r.id,'overdue','system','Payment deadline passed.','{}'::jsonb);
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$;

REVOKE ALL ON FUNCTION private.mark_lipa_pole_pole_overdue() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.send_lipa_pole_pole_deadline_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_days integer:=3;
  v_count integer:=0;
  r record;
begin
  select coalesce(reminder_days_before_due,3)
  into v_days
  from public.lipa_pole_pole_settings
  where id=1;

  for r in
    select id,customer_id,account_reference,deadline_at,total_payable_kes,approved_paid_kes
    from public.lipa_pole_pole_accounts
    where status in ('deposit_pending','active')
      and marketplace_order_id is null
      and approved_paid_kes<total_payable_kes
      and deadline_at>now()
      and deadline_at<=now()+make_interval(days=>v_days)
      and (
        last_reminder_at is null
        or last_reminder_at<deadline_at-make_interval(days=>v_days)
      )
    for update skip locked
  loop
    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    )
    values(
      r.customer_id,'payment','Lipa Pole Pole deadline reminder',
      r.account_reference||' is due on '||to_char(r.deadline_at at time zone 'Africa/Nairobi','DD Mon YYYY')||
        '. Verified balance remaining: KSh '||greatest(r.total_payable_kes-r.approved_paid_kes,0)||'.',
      'lipa_pole_pole_account',r.id,
      'lpp_deadline_reminder_'||r.id::text||'_'||to_char(r.deadline_at,'YYYYMMDDHH24MISS'),
      'lipapolepole',
      jsonb_build_object(
        'account_reference',r.account_reference,
        'deadline_at',r.deadline_at,
        'balance_kes',greatest(r.total_payable_kes-r.approved_paid_kes,0)
      )
    )
    on conflict do nothing;

    update public.lipa_pole_pole_accounts
    set last_reminder_at=now(),updated_at=now()
    where id=r.id;

    perform private.lpp_write_event(r.id,'deadline_reminder','system','Upcoming payment deadline reminder sent.','{}'::jsonb);
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$;

REVOKE ALL ON FUNCTION private.send_lipa_pole_pole_deadline_reminders() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.customer_list_lipa_pole_pole_accounts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=(select auth.uid()); v_result jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select coalesce(jsonb_agg(account_row order by (account_row->>'updated_at')::timestamptz desc),'[]'::jsonb)
  into v_result
  from (
    select to_jsonb(a)
      - 'customer_id'
      - 'cancellation_reviewed_by'
      - 'refund_paid_by'
      || jsonb_build_object(
        'seller_name',s.business_name,
        'pending_paid_kes',coalesce((
          select sum(p.amount_kes) from public.lipa_pole_pole_payments p
          where p.account_id=a.id and p.status='pending'
        ),0),
        'balance_kes',greatest(a.total_payable_kes-a.approved_paid_kes,0),
        'payments',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',p.id,'payment_type',p.payment_type,'amount_kes',p.amount_kes,
            'payment_reference',p.payment_reference,'status',p.status,
            'submitted_at',p.submitted_at,'reviewed_at',p.reviewed_at,'review_notes',p.review_notes
          ) order by p.submitted_at)
          from public.lipa_pole_pole_payments p where p.account_id=a.id
        ),'[]'::jsonb),
        'events',coalesce((
          select jsonb_agg(jsonb_build_object(
            'event_type',e.event_type,'event_note',e.event_note,'metadata',e.metadata,'created_at',e.created_at
          ) order by e.created_at desc)
          from public.lipa_pole_pole_events e where e.account_id=a.id
        ),'[]'::jsonb)
      ) account_row
    from public.lipa_pole_pole_accounts a
    join public.seller_accounts s on s.user_id=a.seller_id
    where a.customer_id=v_uid
  ) q;

  return v_result;
end;
$function$;

REVOKE ALL ON FUNCTION customer_list_lipa_pole_pole_accounts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION customer_list_lipa_pole_pole_accounts() TO authenticated;
CREATE OR REPLACE FUNCTION public.customer_submit_lipa_pole_pole_payment(p_account_id uuid, p_amount_kes numeric, p_payment_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=(select auth.uid());
  a public.lipa_pole_pole_accounts%rowtype;
  v_pending numeric:=0;
  v_available numeric;
  v_ref text:=btrim(coalesce(p_payment_reference,''));
  v_payment_id uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select * into a
  from public.lipa_pole_pole_accounts
  where id=p_account_id and customer_id=v_uid
  for update;

  if not found then raise exception 'Lipa Pole Pole account not found'; end if;
  if a.status not in ('active','deposit_pending','overdue') then
    raise exception 'This Lipa Pole Pole account cannot accept another payment';
  end if;
  if a.cancellation_requested_at is not null or a.status='cancellation_pending' then
    raise exception 'Cancellation is already under review';
  end if;
  if coalesce(p_amount_kes,0)<=0 then raise exception 'Enter a valid payment amount'; end if;
  if char_length(v_ref)<8 then raise exception 'Paste the M-Pesa payment reference/message'; end if;
  if exists(select 1 from public.lipa_pole_pole_payments where lower(btrim(payment_reference))=lower(v_ref)) then
    raise exception 'This M-Pesa reference has already been submitted';
  end if;

  select coalesce(sum(amount_kes),0) into v_pending
  from public.lipa_pole_pole_payments
  where account_id=a.id and status='pending';

  v_available:=greatest(a.total_payable_kes-a.approved_paid_kes-v_pending,0);
  if p_amount_kes>v_available then
    raise exception 'Payment cannot exceed the outstanding amount awaiting submission: KSh %',v_available;
  end if;

  if a.status='deposit_pending' then
    if exists(
      select 1 from public.lipa_pole_pole_payments p
      where p.account_id=a.id and p.status='pending' and p.payment_type='deposit'
    ) then
      raise exception 'Wait for LEOGO to verify the first deposit before submitting another payment';
    end if;
    if p_amount_kes < greatest(a.required_first_deposit_kes-a.approved_paid_kes,0) then
      raise exception 'The first verified deposit must be at least KSh %',greatest(a.required_first_deposit_kes-a.approved_paid_kes,0);
    end if;
  end if;

  insert into public.lipa_pole_pole_payments(
    account_id,customer_id,payment_type,amount_kes,payment_reference,status
  )
  values(a.id,v_uid,'instalment',round(p_amount_kes,2),v_ref,'pending')
  returning id into v_payment_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    v_uid,'payment','Lipa Pole Pole payment submitted',
    'Your payment of KSh '||round(p_amount_kes,2)||' for '||a.account_reference||' is waiting for LEOGO verification.',
    'lipa_pole_pole_account',a.id,'lpp_payment_submitted_'||v_payment_id::text,'lipapolepole',
    jsonb_build_object('account_reference',a.account_reference,'payment_id',v_payment_id,'amount_kes',round(p_amount_kes,2))
  )
  on conflict do nothing;

  perform private.lpp_write_event(
    a.id,'payment_submitted','customer',
    'Instalment submitted for Admin verification.',
    jsonb_build_object('payment_id',v_payment_id,'amount_kes',round(p_amount_kes,2))
  );

  return jsonb_build_object('ok',true,'payment_id',v_payment_id,'status','pending');
end;
$function$;

REVOKE ALL ON FUNCTION customer_submit_lipa_pole_pole_payment(uuid,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION customer_submit_lipa_pole_pole_payment(uuid,numeric,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.customer_request_lipa_pole_pole_cancellation(p_account_id uuid, p_reason text, p_details text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=(select auth.uid());
  a public.lipa_pole_pole_accounts%rowtype;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if char_length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Choose or enter a cancellation reason'; end if;

  select * into a
  from public.lipa_pole_pole_accounts
  where id=p_account_id and customer_id=v_uid
  for update;

  if not found then raise exception 'Lipa Pole Pole account not found'; end if;
  if a.status not in ('deposit_pending','active','overdue') then
    raise exception 'This Lipa Pole Pole account cannot be cancelled at this stage';
  end if;
  if a.marketplace_order_id is not null then raise exception 'This account is already in fulfilment'; end if;

  update public.lipa_pole_pole_accounts
  set status='cancellation_pending',
      cancellation_requested_at=now(),
      cancellation_reason=btrim(p_reason),
      cancellation_details=nullif(btrim(coalesce(p_details,'')),''),
      updated_at=now()
  where id=a.id;

  perform private.lpp_write_event(a.id,'cancellation_requested','customer',p_reason,jsonb_build_object('details',nullif(btrim(coalesce(p_details,'')),'')));

  return jsonb_build_object('ok',true,'status','cancellation_pending');
end;
$function$;

REVOKE ALL ON FUNCTION customer_request_lipa_pole_pole_cancellation(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION customer_request_lipa_pole_pole_cancellation(uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_list_lipa_pole_pole_accounts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  if not private.is_leogo_admin('orders.read')
     and not private.is_leogo_admin('orders.payment_verify')
     and not private.is_leogo_admin('approvals.manage') then
    raise exception 'Admin permission required';
  end if;

  select coalesce(jsonb_agg(account_row order by (account_row->>'updated_at')::timestamptz desc),'[]'::jsonb)
  into v_result
  from (
    select to_jsonb(a)||jsonb_build_object(
      'seller_name',s.business_name,
      'customer_email',u.email,
      'pending_paid_kes',coalesce((select sum(p.amount_kes) from public.lipa_pole_pole_payments p where p.account_id=a.id and p.status='pending'),0),
      'balance_kes',greatest(a.total_payable_kes-a.approved_paid_kes,0),
      'payments',coalesce((
        select jsonb_agg(to_jsonb(p) order by p.submitted_at)
        from public.lipa_pole_pole_payments p where p.account_id=a.id
      ),'[]'::jsonb)
    ) account_row
    from public.lipa_pole_pole_accounts a
    join public.seller_accounts s on s.user_id=a.seller_id
    join auth.users u on u.id=a.customer_id
  ) q;

  return v_result;
end;
$function$;

REVOKE ALL ON FUNCTION admin_list_lipa_pole_pole_accounts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION admin_list_lipa_pole_pole_accounts() TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_review_lipa_pole_pole_cancellation(p_account_id uuid, p_approve boolean, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.lipa_pole_pole_accounts%rowtype;
  v_percent numeric;
  v_deduction numeric;
  v_refund numeric;
begin
  if not private.is_leogo_admin('orders.manage')
     and not private.is_leogo_admin('orders.payment_verify')
     and not private.is_leogo_admin('approvals.manage') then
    raise exception 'Admin permission required';
  end if;

  select * into a from public.lipa_pole_pole_accounts where id=p_account_id for update;
  if not found then raise exception 'Lipa Pole Pole account not found'; end if;
  if a.status<>'cancellation_pending' then raise exception 'No cancellation request is pending'; end if;
  if not p_approve and char_length(btrim(coalesce(p_notes,'')))<3 then
    raise exception 'Provide a reason for declining cancellation';
  end if;

  if p_approve then
    select coalesce(cancellation_deduction_percent,25)
    into v_percent
    from public.lipa_pole_pole_settings where id=1;

    v_deduction:=round(a.approved_paid_kes*(v_percent/100),2);
    v_refund:=greatest(a.approved_paid_kes-v_deduction,0);

    update public.lipa_pole_pole_payments
    set status='rejected',reviewed_at=now(),reviewed_by=(select auth.uid()),
        review_notes='Account cancelled before payment verification',updated_at=now()
    where account_id=a.id and status='pending';

    perform private.lpp_release_reserved_stock(a.id);

    update public.lipa_pole_pole_accounts
    set status=case when v_refund>0 then 'refund_pending' else 'cancelled' end,
        cancellation_reviewed_at=now(),
        cancellation_reviewed_by=(select auth.uid()),
        cancellation_review_notes=nullif(btrim(coalesce(p_notes,'')),''),
        cancellation_deduction_kes=v_deduction,
        refund_due_kes=v_refund,
        refund_status=case when v_refund>0 then 'pending' else 'not_required' end,
        updated_at=now()
    where id=a.id;

    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    )
    values(
      a.customer_id,'payment','Lipa Pole Pole cancellation approved',
      'Cancellation for '||a.account_reference||' was approved. Refund due: KSh '||v_refund||' after the configured deduction.',
      'lipa_pole_pole_account',a.id,'lpp_cancellation_approved_'||a.id::text,'lipapolepole',
      jsonb_build_object('account_reference',a.account_reference,'refund_due_kes',v_refund,'deduction_kes',v_deduction)
    )
    on conflict do nothing;

    perform private.notify_partner(
      a.seller_id,'seller','lpp_cancelled','Lipa Pole Pole cancelled',
      a.account_reference||' was cancelled. Reserved stock has been returned.',
      'lipa_pole_pole_account',a.id,'lipa-pole-pole',
      jsonb_build_object('account_reference',a.account_reference)
    );

    perform private.lpp_write_event(a.id,'cancellation_approved','admin',p_notes,jsonb_build_object('refund_due_kes',v_refund,'deduction_kes',v_deduction));
  else
    update public.lipa_pole_pole_accounts
    set status=case when deadline_at<now() then 'overdue' when approved_paid_kes>0 then 'active' else 'deposit_pending' end,
        cancellation_requested_at=null,
        cancellation_reason=null,
        cancellation_details=null,
        cancellation_reviewed_at=now(),
        cancellation_reviewed_by=(select auth.uid()),
        cancellation_review_notes=btrim(p_notes),
        updated_at=now()
    where id=a.id;

    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    )
    values(
      a.customer_id,'payment','Lipa Pole Pole cancellation declined',
      'Cancellation for '||a.account_reference||' was declined. '||btrim(p_notes),
      'lipa_pole_pole_account',a.id,'lpp_cancellation_declined_'||extract(epoch from now())::bigint,'lipapolepole',
      jsonb_build_object('account_reference',a.account_reference)
    );

    perform private.lpp_write_event(a.id,'cancellation_declined','admin',p_notes,'{}'::jsonb);
  end if;

  perform private.write_admin_audit(
    case when p_approve then 'lipa_pole_pole.cancellation.approved' else 'lipa_pole_pole.cancellation.declined' end,
    'lipa_pole_pole_account',a.id::text,to_jsonb(a),
    jsonb_build_object('status',case when p_approve then case when a.approved_paid_kes>0 then 'refund_pending' else 'cancelled' end else 'restored' end),
    jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );

  return jsonb_build_object('ok',true,'approved',p_approve,'refund_due_kes',case when p_approve then v_refund else 0 end);
end;
$function$;

REVOKE ALL ON FUNCTION admin_review_lipa_pole_pole_cancellation(uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION admin_review_lipa_pole_pole_cancellation(uuid,boolean,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_mark_lipa_pole_pole_refund_paid(p_account_id uuid, p_refund_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.lipa_pole_pole_accounts%rowtype; v_ref text:=btrim(coalesce(p_refund_reference,''));
begin
  if not private.is_leogo_admin('orders.payment_verify')
     and not private.is_leogo_admin('approvals.manage') then
    raise exception 'Payment permission required';
  end if;
  if char_length(v_ref)<3 then raise exception 'Enter the refund reference'; end if;

  select * into a from public.lipa_pole_pole_accounts where id=p_account_id for update;
  if not found then raise exception 'Lipa Pole Pole account not found'; end if;
  if a.refund_status<>'pending' or a.refund_due_kes<=0 then raise exception 'No refund is pending for this account'; end if;

  update public.lipa_pole_pole_accounts
  set refund_status='paid',refund_paid_at=now(),refund_paid_by=(select auth.uid()),
      refund_reference=v_ref,status='refunded',updated_at=now()
  where id=a.id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    a.customer_id,'payment','Lipa Pole Pole refund completed',
    'Refund of KSh '||a.refund_due_kes||' for '||a.account_reference||' has been marked paid.',
    'lipa_pole_pole_account',a.id,'lpp_refund_paid_'||a.id::text,'lipapolepole',
    jsonb_build_object('account_reference',a.account_reference,'refund_due_kes',a.refund_due_kes,'refund_reference',v_ref)
  )
  on conflict do nothing;

  perform private.lpp_write_event(a.id,'refund_paid','admin',v_ref,jsonb_build_object('refund_due_kes',a.refund_due_kes));

  return jsonb_build_object('ok',true,'status','refunded');
end;
$function$;

REVOKE ALL ON FUNCTION admin_mark_lipa_pole_pole_refund_paid(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION admin_mark_lipa_pole_pole_refund_paid(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_resolve_lipa_pole_pole_overdue(p_account_id uuid, p_action text, p_new_deadline timestamp with time zone DEFAULT NULL::timestamp with time zone, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.lipa_pole_pole_accounts%rowtype;
  v_percent numeric;
  v_charge numeric:=0;
  v_deduction numeric:=0;
  v_refund numeric:=0;
begin
  if not private.is_leogo_admin('orders.manage')
     and not private.is_leogo_admin('approvals.manage') then
    raise exception 'Admin permission required';
  end if;
  if p_action not in ('extend','refund') then raise exception 'Choose extend or refund'; end if;

  select * into a from public.lipa_pole_pole_accounts where id=p_account_id for update;
  if not found then raise exception 'Lipa Pole Pole account not found'; end if;
  if a.status<>'overdue' then raise exception 'This account is not overdue'; end if;

  if p_action='extend' then
    if p_new_deadline is null or p_new_deadline<=now() then raise exception 'Choose a future extension deadline'; end if;
    select coalesce(overdue_interest_percent,5) into v_percent from public.lipa_pole_pole_settings where id=1;
    v_charge:=round((a.items_subtotal_kes+a.service_fee_kes+a.pickup_fee_kes+a.delivery_fee_kes)*(v_percent/100),2);

    update public.lipa_pole_pole_accounts
    set overdue_charge_kes=overdue_charge_kes+v_charge,
        total_payable_kes=total_payable_kes+v_charge,
        deadline_at=p_new_deadline,
        status='active',
        last_reminder_at=null,
        updated_at=now()
    where id=a.id;

    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    )
    values(
      a.customer_id,'payment','Lipa Pole Pole deadline extended',
      a.account_reference||' has a new deadline. An overdue charge of KSh '||v_charge||' was added.',
      'lipa_pole_pole_account',a.id,'lpp_overdue_extended_'||extract(epoch from now())::bigint,'lipapolepole',
      jsonb_build_object('account_reference',a.account_reference,'overdue_charge_kes',v_charge,'new_deadline',p_new_deadline)
    );

    perform private.lpp_write_event(a.id,'overdue_extended','admin',p_notes,jsonb_build_object('overdue_charge_kes',v_charge,'new_deadline',p_new_deadline));
  else
    select coalesce(overdue_refund_deduction_percent,25) into v_percent from public.lipa_pole_pole_settings where id=1;
    v_deduction:=round(a.approved_paid_kes*(v_percent/100),2);
    v_refund:=greatest(a.approved_paid_kes-v_deduction,0);

    update public.lipa_pole_pole_payments
    set status='rejected',reviewed_at=now(),reviewed_by=(select auth.uid()),
        review_notes='Overdue account resolved by refund',updated_at=now()
    where account_id=a.id and status='pending';

    perform private.lpp_release_reserved_stock(a.id);

    update public.lipa_pole_pole_accounts
    set status=case when v_refund>0 then 'refund_pending' else 'cancelled' end,
        cancellation_deduction_kes=v_deduction,
        refund_due_kes=v_refund,
        refund_status=case when v_refund>0 then 'pending' else 'not_required' end,
        updated_at=now()
    where id=a.id;

    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    )
    values(
      a.customer_id,'payment','Lipa Pole Pole overdue refund',
      a.account_reference||' was closed after missing the deadline. Refund due: KSh '||v_refund||'.',
      'lipa_pole_pole_account',a.id,'lpp_overdue_refund_'||extract(epoch from now())::bigint,'lipapolepole',
      jsonb_build_object('account_reference',a.account_reference,'refund_due_kes',v_refund,'deduction_kes',v_deduction)
    );

    perform private.notify_partner(
      a.seller_id,'seller','lpp_overdue_closed','Lipa Pole Pole overdue account closed',
      a.account_reference||' was closed. Reserved stock has been returned.',
      'lipa_pole_pole_account',a.id,'lipa-pole-pole',
      jsonb_build_object('account_reference',a.account_reference)
    );

    perform private.lpp_write_event(a.id,'overdue_refund','admin',p_notes,jsonb_build_object('refund_due_kes',v_refund,'deduction_kes',v_deduction));
  end if;

  return jsonb_build_object('ok',true,'action',p_action,'overdue_charge_kes',v_charge,'refund_due_kes',v_refund);
end;
$function$;

REVOKE ALL ON FUNCTION admin_resolve_lipa_pole_pole_overdue(uuid,text,timestamp with time zone,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION admin_resolve_lipa_pole_pole_overdue(uuid,text,timestamp with time zone,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.seller_list_lipa_pole_pole_accounts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=(select auth.uid()); v_result jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.seller_accounts where user_id=v_uid and application_status='approved') then
    raise exception 'Approved Seller account required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'account_reference',a.account_reference,'product_id',a.product_id,
    'product_name',a.product_name,'variant_name',a.variant_name,'variant_image_path',a.variant_image_path,
    'quantity',a.quantity,'items_subtotal_kes',a.items_subtotal_kes,
    'total_payable_kes',a.total_payable_kes,'approved_paid_kes',a.approved_paid_kes,
    'pending_paid_kes',coalesce((select sum(p.amount_kes) from public.lipa_pole_pole_payments p where p.account_id=a.id and p.status='pending'),0),
    'balance_kes',greatest(a.total_payable_kes-a.approved_paid_kes,0),
    'required_first_deposit_kes',a.required_first_deposit_kes,'status',a.status,
    'opened_at',a.opened_at,'deadline_at',a.deadline_at,'fully_paid_at',a.fully_paid_at,
    'receiver_name',a.receiver_name,'marketplace_order_id',a.marketplace_order_id,
    'refund_status',a.refund_status
  ) order by a.updated_at desc),'[]'::jsonb)
  into v_result
  from public.lipa_pole_pole_accounts a
  where a.seller_id=v_uid;

  return v_result;
end;
$function$;

REVOKE ALL ON FUNCTION seller_list_lipa_pole_pole_accounts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION seller_list_lipa_pole_pole_accounts() TO authenticated;
CREATE TRIGGER lpp_account_admin_signal AFTER UPDATE OF status, refund_status, cancellation_requested_at ON public.lipa_pole_pole_accounts FOR EACH STATEMENT EXECUTE FUNCTION private.bump_admin_notification_signal('approvals');
CREATE TRIGGER lpp_payment_admin_signal AFTER INSERT ON public.lipa_pole_pole_payments FOR EACH STATEMENT EXECUTE FUNCTION private.bump_admin_notification_signal('approvals');

-- Seed the existing staging configuration with its declared defaults, never production data.
INSERT INTO public.delivery_rate_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
INSERT INTO public.lipa_pole_pole_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
