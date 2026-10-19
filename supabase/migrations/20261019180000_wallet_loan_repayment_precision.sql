-- Guard wallet loan repayment cent precision; preserve loan/account status and approval flow.
CREATE OR REPLACE FUNCTION public.submit_wallet_loan_repayment(p_loan_id uuid, p_amount_kes numeric, p_payment_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  l public.wallet_loans%rowtype;
  s public.wallet_loan_settings%rowtype;
  v_id uuid;
  v_ref text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  perform private.refresh_wallet_loan_statuses();

  select * into l from public.wallet_loans
  where id=p_loan_id and user_id=v_uid for update;
  if not found then raise exception 'Loan not found'; end if;
  if l.status not in ('active','overdue') or l.outstanding_kes<=0 then
    raise exception 'This loan does not have an outstanding balance';
  end if;

  select * into s from public.wallet_loan_settings where id=1;
  if p_amount_kes is null or p_amount_kes<=0 or p_amount_kes>l.outstanding_kes then
    raise exception 'Enter a repayment amount up to KSh %',l.outstanding_kes;
  end if;
  if p_amount_kes<>round(p_amount_kes,2) then raise exception 'Loan repayment amount may have at most two decimal places'; end if;
  if not s.allow_partial_repayment and p_amount_kes<l.outstanding_kes then
    raise exception 'Partial repayment is not enabled for loans';
  end if;
  if char_length(btrim(coalesce(p_payment_reference,''))) not between 6 and 120 then
    raise exception 'Enter a valid repayment transaction reference';
  end if;
  if not exists(
    select 1 from public.payment_account_assignments a
    join public.payment_accounts p on p.id=a.account_id
    where a.function_code='loan_repayment' and p.status='active'
  ) then
    raise exception 'Loan repayment payment destination is being configured';
  end if;

  v_ref:='LRP-'||to_char(now() at time zone 'Africa/Nairobi','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.wallet_loan_repayment_requests(
    repayment_reference,loan_id,user_id,amount_kes,payment_reference
  ) values(
    v_ref,l.id,v_uid,round(p_amount_kes,2),upper(btrim(p_payment_reference))
  ) returning id into v_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_uid,'wallet_loan','Loan repayment submitted',
    'Your repayment for '||l.loan_reference||' is waiting for Admin verification.',
    'wallet_loan_repayment',v_id,'wallet_loan_repayment_submitted_'||v_id::text,'wallet',
    jsonb_build_object('loan_id',l.id,'amount_kes',round(p_amount_kes,2))
  );

  return jsonb_build_object('ok',true,'repayment_id',v_id,'repayment_reference',v_ref,'status','pending');
exception when unique_violation then
  raise exception 'This repayment transaction reference has already been submitted';
end
$function$
;
