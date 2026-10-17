-- LEOGO: Require independent payment-notification evidence on every
-- positive payment-verification RPC. No historical payment state is changed.
-- Records are private; customer-supplied references do not count as verifier proof.
create table if not exists private.payment_verification_evidence (
  id bigint generated always as identity primary key,
  payment_kind text not null,
  payment_record_id uuid not null,
  verified_by uuid not null,
  notification_reference text,
  notification_time_eat timestamp without time zone,
  captured_at timestamptz not null default now(),
  constraint leogo_payment_notification_present check (
    notification_reference is not null or notification_time_eat is not null
  )
);
revoke all on table private.payment_verification_evidence from public, anon, authenticated;

create or replace function private.require_payment_notice(
  p_kind text, p_record_id uuid, p_notes text
) returns void
language plpgsql security definer set search_path to ''
as $proof$
declare
  v_user uuid := (select auth.uid());
  v_reference text;
  v_time_text text;
  v_time timestamp without time zone;
begin
  if v_user is null then
    raise exception 'Sign in as the authorized payment verifier';
  end if;
  v_reference := (regexp_match(coalesce(p_notes,''),
    '^Payment notification reference:[[:blank:]]*([A-Za-z0-9][A-Za-z0-9/-]{5,40})[[:blank:]]*$','im'))[1];
  v_time_text := (regexp_match(coalesce(p_notes,''),
    '^Payment notification time \(EAT\):[[:blank:]]*([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2})[[:blank:]]*$','im'))[1];
  if v_reference is null and v_time_text is null then
    raise exception 'Enter the payment notification transaction reference (6+ characters) OR its transaction date/time (EAT) before verifying payment';
  end if;
  if v_time_text is not null then
    begin
      v_time := v_time_text::timestamp;
    exception when datetime_field_overflow or invalid_datetime_format then
      raise exception 'Payment notification time must be a valid date/time in EAT';
    end;
    if v_time > (now() at time zone 'Africa/Nairobi') + interval '5 minutes' then
      raise exception 'Payment notification time cannot be in the future';
    end if;
  end if;
  insert into private.payment_verification_evidence(
    payment_kind,payment_record_id,verified_by,notification_reference,notification_time_eat
  ) values (p_kind,p_record_id,v_user,upper(v_reference),v_time);
end
$proof$;

-- Modify existing RPCs in place; approval, amounts, assignment, COD and refund
-- logic remain unchanged. The record insert rolls back with a failed verification.
do $patch$
declare
  v_rule record;
  v_definition text;
  v_anchor text := E'\nbegin\n';
  v_guard text;
begin
  for v_rule in
    select * from (values
      ('public.admin_verify_marketplace_order_payment(uuid,boolean,text)', 'p_paid', 'p_order_id', 'p_notes', 'marketplace_order'),
      ('public.admin_review_cod_delivery_fee(uuid,boolean,text)', 'p_verified', 'p_order_id', 'p_notes', 'cod_upfront'),
      ('public.admin_review_health_cod_delivery_fee(uuid,boolean,text)', 'p_verified', 'p_order_id', 'p_notes', 'health_cod_upfront'),
      ('public.admin_review_lipa_pole_pole_payment(uuid,boolean,text)', 'p_approve', 'p_payment_id', 'p_notes', 'lipa_pole_pole'),
      ('public.admin_review_group_order_payment(uuid,text,text)', 'p_decision=''verify''', 'p_participation_id', 'p_notes', 'group_order'),
      ('public.admin_verify_service_quotation_payment(uuid,boolean,text)', 'p_approved', 'p_request_id', 'p_notes', 'service_request'),
      ('public.review_wallet_deposit(uuid,boolean,text,uuid)', 'p_approve', 'p_request_id', 'p_admin_notes', 'wallet_deposit'),
      ('public.admin_review_wallet_loan_repayment(uuid,text,text)', 'p_decision=''verify''', 'p_repayment_id', 'p_notes', 'wallet_loan_repayment'),
      ('public.admin_review_partner_billing_payment(uuid,text,text)', 'p_decision=''approve''', 'p_payment_id', 'p_notes', 'partner_subscription_or_credit'),
      ('public.admin_review_premium_customer_meetup_payment(uuid,text,text)', 'p_decision=''approve''', 'p_payment_id', 'p_notes', 'premium_meetup'),
      ('public.admin_review_vacant_house_viewing_payment(uuid,text,text)', 'p_decision=''verify''', 'p_request_id', 'p_notes', 'vacant_house_viewing'),
      ('public.admin_verify_cyber_order_payment(uuid,text,text)', 'p_decision=''verify''', 'p_order_id', 'p_notes', 'cyber_order'),
      ('public.admin_review_health_medicine_order_payment(uuid,text,text)', 'p_decision=''verify''', 'p_order_id', 'p_notes', 'health_medicine_order'),
      ('public.admin_review_health_specialist_booking_payment(uuid,text,text)', 'p_decision=''verify''', 'p_booking_id', 'p_notes', 'health_specialist_booking'),
      ('public.admin_aftersales_verify_return_shipping_payment(uuid,boolean,text)', 'p_approve', 'p_case_id', 'p_note', 'aftersales_return_shipping'),
      ('public.admin_review_approval(text,uuid,text,text)', 'p_kind=''premium_payment'' and p_decision=''approve''', 'p_record_id', 'p_notes', 'premium_membership')
    ) r(signature,positive_condition,record_arg,notes_arg,kind)
  loop
    -- Staging can lag production for newer modules. Skip missing RPCs there;
    -- production coverage is separately asserted before the release is accepted.
    if to_regprocedure(v_rule.signature) is null then
      raise notice 'Payment verification function not installed here: %', v_rule.signature;
      continue;
    end if;
    select pg_get_functiondef(to_regprocedure(v_rule.signature)) into v_definition;
    if position('private.require_payment_notice(' in v_definition)>0 then
      continue;
    end if;
    if position(v_anchor in v_definition)=0 then
      raise exception 'Verification function has changed; review % before applying',v_rule.signature;
    end if;
    v_guard := '  if ('||v_rule.positive_condition||') then '||
      'perform private.require_payment_notice('||
      quote_literal(v_rule.kind)||','||v_rule.record_arg||','||v_rule.notes_arg||
      '); end if;';
    execute replace(v_definition,v_anchor,v_anchor||v_guard||E'\n');
  end loop;
end
$patch$;
