
create or replace function public.admin_list_wallet_loan_applications_v2()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Approval permission required'; end if;
  select coalesce(jsonb_agg(
    to_jsonb(a)||jsonb_build_object(
      'customer_name',coalesce(cp.full_name,u.email::text,'Customer'),
      'customer_phone',cp.phone,
      'customer_email',u.email,
      'collateral',case when c.id is null then null else to_jsonb(c)||jsonb_build_object(
        'pickup_station_name',ps.station_name,
        'pickup_station_location',concat_ws(', ',ps.address_line,ps.town,ps.sub_county,ps.county),
        'pickup_station_phone',ps.contact_phone
      ) end
    ) order by a.submitted_at desc
  ),'[]'::jsonb) into v_result
  from public.wallet_loan_applications a
  left join public.wallet_loan_asset_collateral c on c.application_id=a.id
  left join public.pickup_stations ps on ps.id=c.pickup_station_id
  left join public.customer_profiles cp on cp.user_id=a.user_id
  left join auth.users u on u.id=a.user_id;
  return v_result;
end
$function$;

revoke execute on function public.admin_list_wallet_loan_applications_v2() from public,anon;
grant execute on function public.admin_list_wallet_loan_applications_v2() to authenticated;

create or replace function public.admin_review_wallet_loan_repayment(
  p_repayment_id uuid,p_decision text,p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  r public.wallet_loan_repayment_requests%rowtype;l public.wallet_loans%rowtype;
  v_before jsonb;v_after jsonb;v_new_repaid numeric(14,2);v_new_outstanding numeric(14,2);
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('verify','reject') then raise exception 'Choose verify or reject'; end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'Add a rejection reason'; end if;
  select * into r from public.wallet_loan_repayment_requests where id=p_repayment_id for update;
  if not found or r.payment_status<>'pending' then raise exception 'Pending repayment not found'; end if;
  select * into l from public.wallet_loans where id=r.loan_id for update;
  if not found then raise exception 'Loan not found'; end if;
  v_before:=to_jsonb(r);
  if p_decision='reject' then
    update public.wallet_loan_repayment_requests set payment_status='rejected',reviewed_at=now(),reviewed_by=auth.uid(),
      admin_notes=btrim(p_notes),updated_at=now() where id=r.id;
  else
    if r.amount_kes>l.outstanding_kes then raise exception 'Repayment exceeds the current outstanding balance'; end if;
    v_new_repaid:=round(l.amount_repaid_kes+r.amount_kes,2);
    v_new_outstanding:=greatest(0,round(l.total_due_kes-v_new_repaid,2));
    update public.wallet_loan_repayment_requests set payment_status='verified',reviewed_at=now(),reviewed_by=auth.uid(),
      admin_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now() where id=r.id;
    update public.wallet_loans set amount_repaid_kes=v_new_repaid,outstanding_kes=v_new_outstanding,
      status=case when v_new_outstanding<=0 then 'paid' else status end,
      paid_at=case when v_new_outstanding<=0 then now() else paid_at end,updated_at=now() where id=l.id;

    if v_new_outstanding<=0 and l.loan_type='asset_secured' and l.collateral_id is not null then
      update public.wallet_loan_asset_collateral
      set custody_status=case
            when custody_status in ('stored','recovery_review','sale_authorized') then 'release_ready'
            else custody_status
          end,
          release_authorized_at=case
            when custody_status in ('stored','recovery_review','sale_authorized') then now()
            else release_authorized_at
          end,
          updated_at=now()
      where id=l.collateral_id and custody_status<>'sold';
      if found then
        insert into public.wallet_loan_asset_events(collateral_id,event_type,actor_user_id,actor_role,notes,metadata)
        values(l.collateral_id,'release_authorized',auth.uid(),'admin','Loan fully repaid before asset sale. Asset authorized for return to customer.',
          jsonb_build_object('loan_id',l.id));
        insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
        values(l.user_id,'wallet_loan','Asset ready for return',
          'Your Asset Loan is fully paid. The held asset is now authorized for release by the Pickup Station.',
          'wallet_loan_asset',l.collateral_id,'wallet_loan_asset_release_ready_'||l.collateral_id::text,'wallet','{}'::jsonb)
        on conflict do nothing;
      end if;
    end if;
  end if;
  select to_jsonb(x) into v_after from public.wallet_loan_repayment_requests x where id=r.id;
  perform private.write_admin_audit('wallet_loan.repayment.'||p_decision,'wallet_loan_repayment',r.id::text,v_before,v_after,
    jsonb_build_object('loan_id',r.loan_id,'notes',nullif(btrim(coalesce(p_notes,'')),''))
  );
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(r.user_id,'wallet_loan',
    case when p_decision='verify' then 'Loan repayment verified' else 'Loan repayment rejected' end,
    case when p_decision='verify' then 'Your repayment of KSh '||to_char(r.amount_kes,'FM999G999G990D00')||' has been applied to loan '||l.loan_reference||'.'
      else 'Your loan repayment was rejected.'||case when nullif(btrim(coalesce(p_notes,'')),'') is null then '' else ' Reason: '||btrim(p_notes) end end,
    'wallet_loan_repayment',r.id,'wallet_loan_repayment_'||p_decision||'_'||r.id::text,'wallet',
    jsonb_build_object('loan_id',r.loan_id,'amount_kes',r.amount_kes)
  );
  return jsonb_build_object('ok',true,'decision',p_decision,'repayment_id',r.id);
end
$function$;
