
alter table public.wallet_loan_applications
  add column if not exists asset_ltv_percent_snapshot numeric(8,4),
  add column if not exists overdue_penalty_percent_snapshot numeric(8,4);

CREATE OR REPLACE FUNCTION public.submit_wallet_loan_application_v3(p_application jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  s public.wallet_loan_settings%rowtype;
  e jsonb;
  v_type text:=btrim(coalesce(p_application->>'loan_type',''));
  v_amount numeric:=coalesce((p_application->>'requested_amount_kes')::numeric,0);
  v_purpose text:=btrim(coalesce(p_application->>'purpose',''));
  v_term integer:=nullif(p_application->>'requested_term_days','')::integer;
  v_identity_type text:=btrim(coalesce(p_application->>'identity_type',''));
  v_identity_number text:=upper(btrim(coalesce(p_application->>'identity_number','')));
  v_front text:=btrim(coalesce(p_application->>'identity_front_path',''));
  v_back text:=btrim(coalesce(p_application->>'identity_back_path',''));
  v_passport_photo text:=btrim(coalesce(p_application->>'applicant_passport_photo_path',''));
  v_asset jsonb:=coalesce(p_application->'asset','{}'::jsonb);
  v_photos text[];
  v_proof text;
  v_station uuid;
  v_id uuid;
  v_collateral uuid;
  v_max numeric:=0;
  v_interest numeric:=0;
  v_fee numeric:=0;
  v_grace integer:=0;
  v_recovery integer:=0;
  v_path text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_type not in ('savings_history','asset_secured') then raise exception 'Choose a loan type'; end if;
  if coalesce((p_application->>'consent_accepted')::boolean,false) is distinct from true then raise exception 'Loan consent is required'; end if;
  if char_length(v_purpose) not between 10 and 1000 then raise exception 'Explain the loan purpose using at least 10 characters'; end if;
  if v_identity_type not in ('national_id','passport') then raise exception 'Choose National ID or Passport'; end if;
  if v_identity_number !~ '^[A-Z0-9-]{5,30}$' then raise exception 'Enter a valid ID or passport number'; end if;

  perform private.assert_owned_loan_upload('loan-private-documents',v_front);
  perform private.assert_owned_loan_upload('loan-private-documents',v_back);
  perform private.assert_owned_loan_upload('loan-private-documents',v_passport_photo);

  perform private.ensure_wallet_account(v_uid);
  if not exists(select 1 from public.wallet_accounts where user_id=v_uid and account_status='active') then
    raise exception 'Your LEOGO Wallet is not active. Contact LEOGO customer care before applying for a loan';
  end if;
  select * into s from public.wallet_loan_settings where id=1;

  if exists(select 1 from public.wallet_loans where user_id=v_uid and status in ('active','overdue')) then
    raise exception 'Complete your current loan before applying for another';
  end if;
  if exists(select 1 from public.wallet_loan_applications where user_id=v_uid and application_status in ('pending','under_review')) then
    raise exception 'You already have a loan application awaiting review';
  end if;

  if v_type='savings_history' then
    e:=private.wallet_loan_eligibility(v_uid);
    if not coalesce(s.applications_enabled,false) then raise exception 'Saving-history loan applications are currently closed'; end if;
    if not coalesce((e->>'eligible')::boolean,false) then
      raise exception 'Your verified saving history does not yet meet the current loan eligibility rules';
    end if;
    v_max:=(e->>'max_eligible_amount_kes')::numeric;
    v_interest:=s.interest_percent;
    v_fee:=s.processing_fee_percent;
    v_grace:=s.grace_days;
    v_recovery:=0;
    v_term:=coalesce(v_term,s.default_term_days);
  else
    if not coalesce(s.asset_applications_enabled,false) then raise exception 'Asset loan applications are currently closed'; end if;
    v_max:=s.asset_max_loan_amount_kes;
    v_interest:=s.asset_interest_percent;
    v_fee:=s.asset_processing_fee_percent;
    v_grace:=s.asset_grace_days;
    v_recovery:=s.asset_recovery_after_overdue_days;
    v_term:=coalesce(v_term,s.asset_default_term_days);

    if coalesce((p_application->>'asset_terms_accepted')::boolean,false) is distinct from true then
      raise exception 'Accept the asset custody and default-recovery terms before submitting';
    end if;
    v_station:=nullif(v_asset->>'pickup_station_id','')::uuid;
    if v_station is null or not exists(select 1 from public.pickup_stations where id=v_station and is_active) then
      raise exception 'Choose an active LEOGO Pickup Station for asset inspection and storage';
    end if;
    if char_length(btrim(coalesce(v_asset->>'asset_type','')))<2 or char_length(btrim(coalesce(v_asset->>'asset_name','')))<2 then
      raise exception 'Enter the asset type and item name';
    end if;
    if char_length(btrim(coalesce(v_asset->>'asset_description','')))<10 then
      raise exception 'Describe the asset and its current condition';
    end if;
    select coalesce(array_agg(value),array[]::text[]) into v_photos
    from jsonb_array_elements_text(coalesce(v_asset->'asset_photo_paths','[]'::jsonb));
    if cardinality(v_photos)<4 or cardinality(v_photos)>8 then raise exception 'Upload at least 4 and at most 8 asset pictures'; end if;
    foreach v_path in array v_photos loop
      perform private.assert_owned_loan_upload('loan-asset-media',v_path);
    end loop;
    v_proof:=btrim(coalesce(v_asset->>'ownership_proof_path',''));
    perform private.assert_owned_loan_upload('loan-private-documents',v_proof);
    if coalesce(v_asset->>'ownership_proof_type','') not in ('receipt','police_abstract','other') then
      raise exception 'Choose a valid proof of ownership type';
    end if;
  end if;

  if v_term<1 or v_term>3650 then raise exception 'Choose a valid repayment period'; end if;
  if v_amount<=0 or v_amount>v_max then raise exception 'Requested amount exceeds the current maximum for this loan type'; end if;

  insert into public.wallet_loan_applications(
    user_id,requested_amount_kes,purpose,consent_accepted,loan_type,
    identity_type,identity_number,identity_front_path,identity_back_path,applicant_passport_photo_path,
    confirmed_balance_at_application,total_saved_at_application,confirmed_saving_days_at_application,
    requested_term_days,eligibility_snapshot_eligible,max_eligible_amount_kes,
    interest_percent_snapshot,processing_fee_percent_snapshot,grace_days_snapshot,
    asset_terms_accepted,recovery_after_overdue_days_snapshot,asset_ltv_percent_snapshot,overdue_penalty_percent_snapshot
  ) values(
    v_uid,round(v_amount)::bigint,v_purpose,true,v_type,
    v_identity_type,v_identity_number,v_front,v_back,v_passport_photo,
    coalesce((e->>'wallet_balance_kes')::numeric,0),coalesce((e->>'total_saved_kes')::numeric,0),coalesce((e->>'saving_days')::integer,0),
    v_term,true,v_max,v_interest,v_fee,v_grace,
    v_type='asset_secured',v_recovery,
    case when v_type='asset_secured' then s.asset_loan_to_value_percent else null end,
    case when v_type='asset_secured' then s.asset_overdue_penalty_percent else s.overdue_penalty_percent end
  ) returning id into v_id;

  if v_type='asset_secured' then
    insert into public.wallet_loan_asset_collateral(
      application_id,user_id,pickup_station_id,asset_type,asset_name,brand,model,serial_number,
      asset_description,declared_value_kes,asset_photo_paths,ownership_proof_type,ownership_proof_path
    ) values(
      v_id,v_uid,v_station,btrim(v_asset->>'asset_type'),btrim(v_asset->>'asset_name'),
      nullif(btrim(coalesce(v_asset->>'brand','')),''),nullif(btrim(coalesce(v_asset->>'model','')),''),
      nullif(btrim(coalesce(v_asset->>'serial_number','')),''),
      btrim(v_asset->>'asset_description'),nullif(v_asset->>'declared_value_kes','')::numeric,
      v_photos,v_asset->>'ownership_proof_type',v_proof
    ) returning id into v_collateral;

    insert into public.wallet_loan_asset_events(collateral_id,event_type,actor_user_id,actor_role,notes,metadata)
    values(v_collateral,'application_submitted',v_uid,'customer',
      'Asset loan application submitted. Asset must be physically delivered to the selected Pickup Station for inspection and storage.',
      jsonb_build_object('pickup_station_id',v_station));
  end if;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_uid,'wallet_loan',
    case when v_type='asset_secured' then 'Asset loan application submitted' else 'Loan application submitted' end,
    case when v_type='asset_secured'
      then 'Take the listed asset to your selected LEOGO Pickup Station for inspection and secure storage. Admin approval can only happen after the station records the asset as stored.'
      else 'Your saving-history loan application has been sent to LEOGO Admin for review.'
    end,
    'wallet_loan_application',v_id,'wallet_loan_application_submitted_'||v_id::text,'wallet',
    jsonb_build_object('loan_type',v_type,'requested_amount_kes',round(v_amount),'collateral_id',v_collateral)
  );

  return jsonb_build_object('ok',true,'application_id',v_id,'loan_type',v_type,'collateral_id',v_collateral,'status','pending');
end
$function$;

CREATE OR REPLACE FUNCTION public.review_wallet_loan_application(p_application_id uuid, p_status text, p_partner_notes text DEFAULT NULL::text, p_reviewed_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.wallet_loan_applications%rowtype;
  s public.wallet_loan_settings%rowtype;
  c public.wallet_loan_asset_collateral%rowtype;
  v_principal numeric(14,2);
  v_interest numeric(14,2);
  v_fee numeric(14,2);
  v_total numeric(14,2);
  v_term integer;
  v_loan_id uuid;
  v_ref text;
  v_max numeric(14,2);
  v_penalty numeric(8,4);
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_status not in ('under_review','approved','rejected') then raise exception 'Select a valid loan review status'; end if;

  select * into a from public.wallet_loan_applications where id=p_application_id for update;
  if not found or a.application_status not in ('pending','under_review') then raise exception 'Open loan application not found'; end if;

  if nullif(a.identity_number,'') is null or nullif(a.identity_front_path,'') is null
     or nullif(a.identity_back_path,'') is null or nullif(a.applicant_passport_photo_path,'') is null then
    raise exception 'Identity verification documents are incomplete';
  end if;

  select * into s from public.wallet_loan_settings where id=1;

  if p_status='under_review' then
    update public.wallet_loan_applications set application_status='under_review',reviewed_at=now(),reviewed_by=auth.uid(),
      partner_notes=nullif(btrim(coalesce(p_partner_notes,'')),'') where id=a.id;

  elsif p_status='rejected' then
    if char_length(btrim(coalesce(p_partner_notes,'')))<3 then raise exception 'Add a clear rejection reason'; end if;
    update public.wallet_loan_applications set application_status='rejected',reviewed_at=now(),reviewed_by=auth.uid(),
      partner_notes=btrim(p_partner_notes) where id=a.id;
    if a.loan_type='asset_secured' then
      update public.wallet_loan_asset_collateral
      set custody_status=case when custody_status in ('received','stored') then 'return_required' else custody_status end,
          release_authorized_at=case when custody_status in ('received','stored') then now() else release_authorized_at end,
          updated_at=now()
      where application_id=a.id;
    end if;

  else
    if exists(select 1 from public.wallet_loans where user_id=a.user_id and status in ('active','overdue')) then
      raise exception 'Customer already has an active loan';
    end if;

    if a.loan_type='asset_secured' then
      select * into c from public.wallet_loan_asset_collateral where application_id=a.id for update;
      if not found then raise exception 'Asset collateral record is missing'; end if;
      if c.custody_status<>'stored' or c.inspection_value_kes is null then
        raise exception 'Pickup Station inspection and secure storage must be completed before approving an Asset Loan';
      end if;
      v_max:=least(coalesce(a.max_eligible_amount_kes,s.asset_max_loan_amount_kes),round(c.inspection_value_kes*coalesce(a.asset_ltv_percent_snapshot,s.asset_loan_to_value_percent)/100,2));
      if a.requested_amount_kes>v_max then
        raise exception 'Requested amount exceeds the inspected asset lending value of KSh %',v_max;
      end if;
      v_penalty:=coalesce(a.overdue_penalty_percent_snapshot,s.asset_overdue_penalty_percent);
    else
      if a.eligibility_snapshot_eligible is distinct from true then raise exception 'This application does not contain a valid eligibility snapshot'; end if;
      if a.requested_amount_kes>a.max_eligible_amount_kes then raise exception 'Requested amount exceeds the eligibility snapshot'; end if;
      v_penalty:=coalesce(a.overdue_penalty_percent_snapshot,s.overdue_penalty_percent);
    end if;

    v_principal:=round(a.requested_amount_kes::numeric,2);
    v_term:=coalesce(a.requested_term_days,case when a.loan_type='asset_secured' then s.asset_default_term_days else s.default_term_days end);
    v_interest:=round(v_principal*coalesce(a.interest_percent_snapshot,0)/100,2);
    v_fee:=round(v_principal*coalesce(a.processing_fee_percent_snapshot,0)/100,2);
    v_total:=v_principal+v_interest+v_fee;
    v_ref:='LOAN-'||to_char(now() at time zone 'Africa/Nairobi','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

    insert into public.wallet_loans(
      loan_reference,application_id,user_id,principal_kes,interest_percent,interest_kes,
      processing_fee_percent,processing_fee_kes,overdue_penalty_percent,total_due_kes,
      amount_repaid_kes,outstanding_kes,term_days,approved_at,disbursed_at,due_date,grace_until,
      status,approved_by,loan_type,collateral_id,recovery_after_overdue_days
    ) values(
      v_ref,a.id,a.user_id,v_principal,coalesce(a.interest_percent_snapshot,0),v_interest,
      coalesce(a.processing_fee_percent_snapshot,0),v_fee,v_penalty,
      v_total,0,v_total,v_term,now(),now(),
      (now() at time zone 'Africa/Nairobi')::date+v_term,
      (now() at time zone 'Africa/Nairobi')::date+v_term+coalesce(a.grace_days_snapshot,0),
      'active',auth.uid(),a.loan_type,c.id,coalesce(a.recovery_after_overdue_days_snapshot,0)
    ) returning id into v_loan_id;

    if a.loan_type='asset_secured' then
      update public.wallet_loan_asset_collateral set loan_id=v_loan_id,updated_at=now() where id=c.id;
      insert into public.wallet_loan_asset_events(collateral_id,event_type,actor_user_id,actor_role,notes,metadata)
      values(c.id,'loan_approved',auth.uid(),'admin','Asset Loan approved; collateral remains in secure Pickup Station custody.',
        jsonb_build_object('loan_id',v_loan_id,'loan_reference',v_ref));
    end if;

    insert into public.wallet_ledger_entries(
      user_id,entry_type,direction,amount_kes,loan_id,external_reference,description
    ) values(a.user_id,'loan_disbursement','credit',v_principal,v_loan_id,v_ref,'LEOGO Wallet loan disbursement');

    update public.wallet_loan_applications set
      application_status='approved',reviewed_at=now(),reviewed_by=auth.uid(),
      partner_notes=nullif(btrim(coalesce(p_partner_notes,'')),''),
      approved_amount_kes=v_principal,approved_term_days=v_term,approved_at=now()
    where id=a.id;

    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    ) values(
      a.user_id,'wallet_loan','Loan approved and credited',
      'Loan '||v_ref||' has been approved and KSh '||to_char(v_principal,'FM999G999G990D00')||
      ' was credited to your LEOGO Wallet.'||
      case when a.loan_type='asset_secured' then ' Your asset remains securely held at the selected Pickup Station until the loan is fully settled.' else '' end,
      'wallet_loan',v_loan_id,'wallet_loan_approved_'||v_loan_id::text,'wallet',
      jsonb_build_object('loan_reference',v_ref,'loan_type',a.loan_type,'principal_kes',v_principal,'total_due_kes',v_total)
    );
  end if;

  if p_status in ('under_review','rejected') then
    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    ) values(
      a.user_id,'wallet_loan',
      case when p_status='under_review' then 'Loan application under review' else 'Loan application not approved' end,
      case when p_status='under_review' then 'LEOGO Admin is reviewing your loan application.'
        else 'LEOGO Admin did not approve this loan application.'||
          case when nullif(btrim(coalesce(p_partner_notes,'')),'') is null then '' else ' Reason: '||btrim(p_partner_notes) end
      end,
      'wallet_loan_application',a.id,'wallet_loan_application_'||p_status||'_'||a.id::text,'wallet',
      jsonb_build_object('status',p_status,'loan_type',a.loan_type)
    ) on conflict do nothing;
  end if;

  return p_application_id;
end
$function$;
