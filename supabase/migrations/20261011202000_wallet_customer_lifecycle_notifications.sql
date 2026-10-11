-- Notify wallet customers on request and status lifecycle changes, including approved savings deposits.
CREATE OR REPLACE FUNCTION private.notify_wallet_customer_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status text;
  v_old_status text;
  v_kind text;
  v_title text;
  v_message text;
begin
  if TG_TABLE_NAME='wallet_deposit_requests' then
    v_status:=NEW.request_status;
    v_old_status:=case when TG_OP='UPDATE' then OLD.request_status else null end;
    v_kind:=case when NEW.challenge_id is not null or NEW.deposit_kind='challenge' then 'Savings deposit' else 'Wallet deposit' end;
  elsif TG_TABLE_NAME='wallet_withdrawal_requests' then
    v_status:=NEW.request_status;
    v_old_status:=case when TG_OP='UPDATE' then OLD.request_status else null end;
    v_kind:='Wallet withdrawal';
  elsif TG_TABLE_NAME='wallet_loan_applications' then
    v_status:=NEW.application_status;
    v_old_status:=case when TG_OP='UPDATE' then OLD.application_status else null end;
    v_kind:='Wallet loan application';
  elsif TG_TABLE_NAME='wallet_loan_repayment_requests' then
    v_status:=NEW.payment_status;
    v_old_status:=case when TG_OP='UPDATE' then OLD.payment_status else null end;
    v_kind:='Loan repayment';
  elsif TG_TABLE_NAME='wallet_challenges' then
    v_status:=NEW.challenge_status;
    v_old_status:=case when TG_OP='UPDATE' then OLD.challenge_status else null end;
    v_kind:='Savings challenge';
  else
    return NEW;
  end if;
  if v_status is null or (TG_OP='UPDATE' and v_status is not distinct from v_old_status) then return NEW; end if;
  v_title:=v_kind||' '||replace(v_status,'_',' ');
  v_message:='Your '||lower(v_kind)||' status is now '||replace(v_status,'_',' ')||'. Open Wallet & SACCO for details.';
  insert into public.customer_notifications
    (user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values
    (NEW.user_id,'wallet',v_title,v_message,TG_TABLE_NAME,NEW.id,
     TG_TABLE_NAME||':'||NEW.id::text||':'||v_status,'wallet',
     jsonb_build_object('status',v_status,'previous_status',v_old_status))
  on conflict do nothing;
  return NEW;
end;
$function$
;
do $$ declare v_table text; begin
 foreach v_table in array array['wallet_deposit_requests','wallet_withdrawal_requests','wallet_loan_applications','wallet_loan_repayment_requests','wallet_challenges'] loop
 execute format('drop trigger if exists leogo_wallet_customer_status_notification on public.%I',v_table);
 execute format('create trigger leogo_wallet_customer_status_notification after insert or update on public.%I for each row execute function private.notify_wallet_customer_status()',v_table);
 end loop;
end $$;
