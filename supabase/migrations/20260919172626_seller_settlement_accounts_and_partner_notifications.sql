-- LEOGO V2 — Seller settlement accounts + partner notifications
-- Mirrors production migration 20260919172626.

create table if not exists public.partner_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  partner_type text not null check (partner_type in ('seller','transport','service','cyber','premium','accommodation')),
  event_type text not null,
  title text not null check (char_length(title) between 2 and 140),
  message text not null check (char_length(message) between 2 and 700),
  source_type text,
  source_id uuid,
  action_view text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists partner_notifications_user_created_idx on public.partner_notifications(user_id,created_at desc);
alter table public.partner_notifications enable row level security;
drop policy if exists "Partner reads own notifications" on public.partner_notifications;
create policy "Partner reads own notifications" on public.partner_notifications for select using (user_id=(select auth.uid()));
drop policy if exists "Admin reads partner notifications" on public.partner_notifications;
create policy "Admin reads partner notifications" on public.partner_notifications for select using (private.is_leogo_admin());

create table if not exists public.seller_settlement_accounts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_accounts(user_id) on delete cascade,
  account_type text not null check (account_type in ('mpesa_mobile','mpesa_till','mpesa_paybill','bank')),
  account_name text not null check (char_length(btrim(account_name)) between 2 and 120),
  phone_number text,
  till_number text,
  paybill_number text,
  account_number text,
  bank_name text,
  bank_branch text,
  status text not null default 'pending_review' check (status in ('pending_review','approved','rejected','superseded','disabled')),
  is_primary boolean not null default false,
  replaces_account_id uuid references public.seller_settlement_accounts(id) on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_settlement_destination_check check (
    (account_type='mpesa_mobile' and phone_number is not null and btrim(phone_number)<>'') or
    (account_type='mpesa_till' and till_number is not null and btrim(till_number)<>'') or
    (account_type='mpesa_paybill' and paybill_number is not null and btrim(paybill_number)<>'' and account_number is not null and btrim(account_number)<>'') or
    (account_type='bank' and bank_name is not null and btrim(bank_name)<>'' and account_number is not null and btrim(account_number)<>'')
  )
);
create index if not exists seller_settlement_accounts_seller_idx on public.seller_settlement_accounts(seller_id,created_at desc);
create index if not exists seller_settlement_accounts_status_idx on public.seller_settlement_accounts(status,submitted_at desc);
create unique index if not exists seller_one_primary_approved_settlement_idx on public.seller_settlement_accounts(seller_id) where status='approved' and is_primary=true;
alter table public.seller_settlement_accounts enable row level security;
drop policy if exists "Seller reads own settlement accounts" on public.seller_settlement_accounts;
create policy "Seller reads own settlement accounts" on public.seller_settlement_accounts for select using (seller_id=(select auth.uid()));
drop policy if exists "Admin reads settlement accounts" on public.seller_settlement_accounts;
create policy "Admin reads settlement accounts" on public.seller_settlement_accounts for select using (private.is_leogo_admin('sellers.read'));

create table if not exists public.seller_settlements (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_accounts(user_id) on delete restrict,
  settlement_account_id uuid not null references public.seller_settlement_accounts(id) on delete restrict,
  amount_kes numeric(14,2) not null check (amount_kes>0),
  settlement_reference text not null check (char_length(btrim(settlement_reference)) between 3 and 160),
  status text not null default 'paid' check (status in ('paid','reversed')),
  paid_at timestamptz not null default now(),
  processed_by uuid not null references auth.users(id) on delete restrict,
  notes text,
  destination_snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists seller_settlements_seller_paid_idx on public.seller_settlements(seller_id,paid_at desc);
alter table public.seller_settlements enable row level security;
drop policy if exists "Seller reads own settlements" on public.seller_settlements;
create policy "Seller reads own settlements" on public.seller_settlements for select using (seller_id=(select auth.uid()));
drop policy if exists "Admin reads seller settlements" on public.seller_settlements;
create policy "Admin reads seller settlements" on public.seller_settlements for select using (private.is_leogo_admin('sellers.read'));

create or replace function private.notify_partner(p_user_id uuid,p_partner_type text,p_event_type text,p_title text,p_message text,p_source_type text default null,p_source_id uuid default null,p_action_view text default null,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
  values(p_user_id,p_partner_type,p_event_type,p_title,p_message,p_source_type,p_source_id,p_action_view,coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.mark_partner_notification_read(p_notification_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  update public.partner_notifications set read_at=coalesce(read_at,now())
  where id=p_notification_id and user_id=(select auth.uid());
  if not found then raise exception 'Notification not found'; end if;
  return jsonb_build_object('ok',true,'id',p_notification_id);
end $$;

create or replace function public.mark_all_partner_notifications_read(p_partner_type text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  update public.partner_notifications set read_at=coalesce(read_at,now())
  where user_id=(select auth.uid()) and read_at is null and (p_partner_type is null or partner_type=p_partner_type);
  get diagnostics v_count=row_count;
  return jsonb_build_object('ok',true,'updated',v_count);
end $$;

create or replace function public.seller_submit_settlement_account(
  p_account_id uuid default null,p_account_type text default null,p_account_name text default null,p_phone_number text default null,
  p_till_number text default null,p_paybill_number text default null,p_account_number text default null,p_bank_name text default null,
  p_bank_branch text default null,p_make_primary boolean default true)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_existing public.seller_settlement_accounts%rowtype; v_new_id uuid; v_clean_phone text:=nullif(btrim(coalesce(p_phone_number,'')),'');
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.seller_accounts s where s.user_id=v_uid and s.application_status='approved') then raise exception 'Approved Seller account required'; end if;
  if p_account_type not in ('mpesa_mobile','mpesa_till','mpesa_paybill','bank') then raise exception 'Unsupported settlement account type'; end if;
  if char_length(btrim(coalesce(p_account_name,'')))<2 then raise exception 'Account name is required'; end if;
  if p_account_type='mpesa_mobile' and (v_clean_phone is null or v_clean_phone !~ '^\\+254[17][0-9]{8}$') then raise exception 'Enter a valid Kenyan M-Pesa phone number'; end if;

  if p_account_id is not null then
    select * into v_existing from public.seller_settlement_accounts where id=p_account_id and seller_id=v_uid for update;
    if not found then raise exception 'Settlement account not found'; end if;
    if v_existing.status in ('pending_review','rejected') then
      update public.seller_settlement_accounts set
        account_type=p_account_type,account_name=btrim(p_account_name),phone_number=v_clean_phone,
        till_number=nullif(btrim(coalesce(p_till_number,'')),''),paybill_number=nullif(btrim(coalesce(p_paybill_number,'')),''),
        account_number=nullif(btrim(coalesce(p_account_number,'')),''),bank_name=nullif(btrim(coalesce(p_bank_name,'')),''),
        bank_branch=nullif(btrim(coalesce(p_bank_branch,'')),''),status='pending_review',is_primary=coalesce(p_make_primary,true),
        submitted_at=now(),reviewed_at=null,reviewed_by=null,admin_notes=null,updated_at=now()
      where id=v_existing.id returning id into v_new_id;
    else
      insert into public.seller_settlement_accounts(seller_id,account_type,account_name,phone_number,till_number,paybill_number,account_number,bank_name,bank_branch,status,is_primary,replaces_account_id)
      values(v_uid,p_account_type,btrim(p_account_name),v_clean_phone,nullif(btrim(coalesce(p_till_number,'')),''),nullif(btrim(coalesce(p_paybill_number,'')),''),
        nullif(btrim(coalesce(p_account_number,'')),''),nullif(btrim(coalesce(p_bank_name,'')),''),nullif(btrim(coalesce(p_bank_branch,'')),''),'pending_review',coalesce(p_make_primary,true),v_existing.id)
      returning id into v_new_id;
    end if;
  else
    insert into public.seller_settlement_accounts(seller_id,account_type,account_name,phone_number,till_number,paybill_number,account_number,bank_name,bank_branch,status,is_primary)
    values(v_uid,p_account_type,btrim(p_account_name),v_clean_phone,nullif(btrim(coalesce(p_till_number,'')),''),nullif(btrim(coalesce(p_paybill_number,'')),''),
      nullif(btrim(coalesce(p_account_number,'')),''),nullif(btrim(coalesce(p_bank_name,'')),''),nullif(btrim(coalesce(p_bank_branch,'')),''),'pending_review',coalesce(p_make_primary,true))
    returning id into v_new_id;
  end if;
  perform private.notify_partner(v_uid,'seller','settlement_account_submitted','Settlement account sent for verification',
    'LEOGO Admin must verify and approve this settlement account before it can receive Seller payouts.','seller_settlement_account',v_new_id,'settlements',jsonb_build_object('status','pending_review'));
  return v_new_id;
end $$;

create or replace function public.admin_list_seller_settlement_accounts()
returns table(id uuid,seller_id uuid,seller_name text,seller_email text,account_type text,account_name text,phone_number text,till_number text,paybill_number text,account_number text,bank_name text,bank_branch text,status text,is_primary boolean,replaces_account_id uuid,submitted_at timestamptz,reviewed_at timestamptz,reviewed_by uuid,admin_notes text)
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_leogo_admin('sellers.read') then raise exception 'Admin access required'; end if;
  return query select a.id,a.seller_id,s.business_name,u.email::text,a.account_type,a.account_name,a.phone_number,a.till_number,a.paybill_number,a.account_number,a.bank_name,a.bank_branch,a.status,a.is_primary,a.replaces_account_id,a.submitted_at,a.reviewed_at,a.reviewed_by,a.admin_notes
  from public.seller_settlement_accounts a join public.seller_accounts s on s.user_id=a.seller_id left join auth.users u on u.id=a.seller_id
  order by case when a.status='pending_review' then 0 else 1 end,a.submitted_at desc;
end $$;

create or replace function public.admin_review_seller_settlement_account(p_account_id uuid,p_decision text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_account public.seller_settlement_accounts%rowtype; v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','disable') then raise exception 'Unsupported decision'; end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'A clear rejection reason is required'; end if;
  select * into v_account from public.seller_settlement_accounts where id=p_account_id for update;
  if not found then raise exception 'Settlement account not found'; end if;
  v_before:=to_jsonb(v_account);
  if p_decision='approve' then
    if v_account.status<>'pending_review' then raise exception 'Only pending accounts can be approved'; end if;
    if v_account.is_primary then update public.seller_settlement_accounts set is_primary=false,updated_at=now() where seller_id=v_account.seller_id and id<>v_account.id and status='approved' and is_primary=true; end if;
    update public.seller_settlement_accounts set status='approved',reviewed_at=now(),reviewed_by=(select auth.uid()),admin_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now() where id=p_account_id;
    if v_account.replaces_account_id is not null then update public.seller_settlement_accounts set status='superseded',is_primary=false,updated_at=now() where id=v_account.replaces_account_id and seller_id=v_account.seller_id and status='approved'; end if;
  elsif p_decision='reject' then
    if v_account.status<>'pending_review' then raise exception 'Only pending accounts can be rejected'; end if;
    update public.seller_settlement_accounts set status='rejected',reviewed_at=now(),reviewed_by=(select auth.uid()),admin_notes=btrim(p_notes),updated_at=now() where id=p_account_id;
  else
    if v_account.status<>'approved' then raise exception 'Only approved accounts can be disabled'; end if;
    update public.seller_settlement_accounts set status='disabled',is_primary=false,reviewed_at=now(),reviewed_by=(select auth.uid()),admin_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now() where id=p_account_id;
  end if;
  select to_jsonb(a) into v_after from public.seller_settlement_accounts a where a.id=p_account_id;
  perform private.write_admin_audit('seller.settlement_account.'||p_decision,'seller_settlement_account',p_account_id::text,v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),'')));
  return jsonb_build_object('ok',true,'account_id',p_account_id,'decision',p_decision);
end $$;

create or replace function public.admin_list_seller_settlements()
returns table(id uuid,seller_id uuid,seller_name text,seller_email text,settlement_account_id uuid,amount_kes numeric,settlement_reference text,status text,paid_at timestamptz,processed_by uuid,notes text,destination_snapshot jsonb)
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_leogo_admin('sellers.read') then raise exception 'Admin access required'; end if;
  return query select st.id,st.seller_id,s.business_name,u.email::text,st.settlement_account_id,st.amount_kes,st.settlement_reference,st.status,st.paid_at,st.processed_by,st.notes,st.destination_snapshot
  from public.seller_settlements st join public.seller_accounts s on s.user_id=st.seller_id left join auth.users u on u.id=st.seller_id order by st.paid_at desc;
end $$;

create or replace function public.admin_record_seller_settlement(p_seller_id uuid,p_account_id uuid,p_amount_kes numeric,p_reference text,p_notes text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_account public.seller_settlement_accounts%rowtype; v_id uuid;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Settlement permission required'; end if;
  if coalesce(p_amount_kes,0)<=0 then raise exception 'Settlement amount must be greater than zero'; end if;
  if char_length(btrim(coalesce(p_reference,'')))<3 then raise exception 'Payment reference is required'; end if;
  select * into v_account from public.seller_settlement_accounts where id=p_account_id and seller_id=p_seller_id and status='approved';
  if not found then raise exception 'Choose an approved settlement account for this Seller'; end if;
  insert into public.seller_settlements(seller_id,settlement_account_id,amount_kes,settlement_reference,status,paid_at,processed_by,notes,destination_snapshot)
  values(p_seller_id,p_account_id,p_amount_kes,btrim(p_reference),'paid',now(),(select auth.uid()),nullif(btrim(coalesce(p_notes,'')),''),
    jsonb_build_object('account_type',v_account.account_type,'account_name',v_account.account_name,'phone_number',v_account.phone_number,'till_number',v_account.till_number,'paybill_number',v_account.paybill_number,'account_number',v_account.account_number,'bank_name',v_account.bank_name,'bank_branch',v_account.bank_branch))
  returning id into v_id;
  perform private.write_admin_audit('seller.settlement.paid','seller_settlement',v_id::text,null,jsonb_build_object('seller_id',p_seller_id,'amount_kes',p_amount_kes,'reference',btrim(p_reference)),jsonb_build_object('settlement_account_id',p_account_id));
  perform private.notify_partner(p_seller_id,'seller','settlement_paid','Seller settlement completed','LEOGO recorded a Seller settlement of KSh '||to_char(p_amount_kes,'FM999,999,999,990.00')||' with reference '||btrim(p_reference)||'.','seller_settlement',v_id,'settlements',jsonb_build_object('amount_kes',p_amount_kes,'reference',btrim(p_reference)));
  return v_id;
end $$;

create or replace function private.notify_seller_application_status()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_title text; v_message text;
begin
  if old.application_status is distinct from new.application_status then
    v_title:=case new.application_status when 'approved' then 'Seller account approved' when 'changes_requested' then 'Seller application needs correction' when 'rejected' then 'Seller application not approved' when 'under_review' then 'Seller application under review' when 'submitted' then 'Seller application submitted' when 'suspended' then 'Seller account suspended' else 'Seller account updated' end;
    v_message:=case new.application_status when 'approved' then 'Your Seller registration has been approved. Product management and settlement account setup are now available.' when 'changes_requested' then 'LEOGO Admin requested corrections to your Seller application. Open My Profile to review the note and resubmit.' when 'rejected' then 'Your Seller application was rejected. Open My Profile to review the Admin note.' when 'under_review' then 'LEOGO Admin is reviewing your Seller application.' when 'submitted' then 'Your Seller application has been submitted for Admin review.' when 'suspended' then 'Your Seller account has been suspended. Contact LEOGO Admin for assistance.' else 'Your Seller account status changed.' end;
    perform private.notify_partner(new.user_id,'seller','seller_application_'||new.application_status,v_title,v_message,'seller_account',new.user_id,'profile',jsonb_build_object('status',new.application_status,'admin_notes',new.admin_notes));
  end if;
  return new;
end $$;
drop trigger if exists seller_application_status_notification on public.seller_accounts;
create trigger seller_application_status_notification after update of application_status on public.seller_accounts for each row execute function private.notify_seller_application_status();

create or replace function private.notify_seller_settlement_account_status()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_title text; v_message text;
begin
  if old.status is distinct from new.status then
    v_title:=case new.status when 'approved' then 'Settlement account approved' when 'rejected' then 'Settlement account rejected' when 'disabled' then 'Settlement account disabled' when 'superseded' then 'Settlement account replaced' else 'Settlement account updated' end;
    v_message:=case new.status when 'approved' then 'LEOGO Admin verified and approved your settlement account. It can now be used for Seller payouts.' when 'rejected' then 'LEOGO Admin rejected this settlement account. Open Settlement Accounts to review the reason and correct it.' when 'disabled' then 'This settlement account has been disabled and cannot receive new Seller payouts.' when 'superseded' then 'This settlement account was replaced by a newly approved account.' else 'Your settlement account status changed.' end;
    perform private.notify_partner(new.seller_id,'seller','settlement_account_'||new.status,v_title,v_message,'seller_settlement_account',new.id,'settlements',jsonb_build_object('status',new.status,'admin_notes',new.admin_notes));
  end if;
  return new;
end $$;
drop trigger if exists seller_settlement_account_status_notification on public.seller_settlement_accounts;
create trigger seller_settlement_account_status_notification after update of status on public.seller_settlement_accounts for each row execute function private.notify_seller_settlement_account_status();

revoke all on public.partner_notifications from anon;
revoke all on public.seller_settlement_accounts from anon;
revoke all on public.seller_settlements from anon;
grant select on public.partner_notifications to authenticated;
grant select on public.seller_settlement_accounts to authenticated;
grant select on public.seller_settlements to authenticated;
grant execute on function public.mark_partner_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_partner_notifications_read(text) to authenticated;
grant execute on function public.seller_submit_settlement_account(uuid,text,text,text,text,text,text,text,text,boolean) to authenticated;
grant execute on function public.admin_list_seller_settlement_accounts() to authenticated;
grant execute on function public.admin_review_seller_settlement_account(uuid,text,text) to authenticated;
grant execute on function public.admin_list_seller_settlements() to authenticated;
grant execute on function public.admin_record_seller_settlement(uuid,uuid,numeric,text,text) to authenticated;
