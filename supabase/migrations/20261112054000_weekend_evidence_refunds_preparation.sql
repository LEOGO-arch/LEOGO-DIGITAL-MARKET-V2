
-- Weekend Shopping staging safeguards; no external money movement.
create table private.weekend_payment_evidence (
 payment_id uuid primary key references public.weekend_shopping_payments(id),
 account_id uuid not null references public.payment_accounts(id),
 provider_reference text not null unique check(length(btrim(provider_reference))>=6),
 received_amount_kes numeric(12,2) not null check(received_amount_kes>0),
 received_at timestamptz not null,
 evidence_locator text not null check(length(btrim(evidence_locator))>=8),
 recorded_by uuid not null references auth.users(id),
 recorded_at timestamptz not null default now()
);
alter table private.weekend_payment_evidence enable row level security;
revoke all on private.weekend_payment_evidence from public,anon,authenticated;
create table public.weekend_shopping_refunds (
 id uuid primary key default gen_random_uuid(),
 cycle_id uuid not null unique references public.weekend_shopping_cycles(id),
 customer_id uuid not null references auth.users(id),
 amount_kes numeric(12,2) not null check(amount_kes>0),
 reason text not null, status text not null default 'requested' check(status in('requested','approved','completed')),
 requested_at timestamptz not null default now(),
 approved_by uuid references auth.users(id),approved_at timestamptz,
 completed_by uuid references auth.users(id),completed_at timestamptz,
 refund_reference text unique,evidence_locator text
);
alter table public.weekend_shopping_refunds enable row level security;
revoke all on public.weekend_shopping_refunds from public,anon,authenticated;
grant select(id,cycle_id,customer_id,amount_kes,reason,status,requested_at,approved_at,completed_at,refund_reference) on public.weekend_shopping_refunds to authenticated;
create policy weekend_refund_owner on public.weekend_shopping_refunds for select to authenticated using(customer_id=(select auth.uid()));
alter table public.weekend_shopping_cycles add column preparation_date date,add column preparation_status text not null default 'not_planned' check(preparation_status in('not_planned','planned','checked')),add column preparation_notes text,add column preparation_reviewed_by uuid references auth.users(id);
create or replace function public.admin_record_weekend_payment_evidence(p_payment_id uuid,p_account_id uuid,p_provider_reference text,p_received_amount numeric,p_received_at timestamptz,p_evidence_locator text)
returns void language plpgsql security definer set search_path='' as $$
declare w record;
begin
 if auth.uid() is null or not private.is_leogo_admin('settlements.read') then raise exception 'Finance permission required';end if;
 select * into w from public.weekend_shopping_payments where id=p_payment_id for update;
 if not found or w.status<>'pending' then raise exception 'Pending claim required';end if;
 if p_received_amount is distinct from w.amount_kes or upper(btrim(p_provider_reference)) is distinct from upper(btrim(w.payment_reference)) or p_received_at is null or p_received_at>now() then raise exception 'Evidence does not match payment claim';end if;
 if not exists(select 1 from public.payment_account_assignments a join public.payment_accounts b on b.id=a.account_id where a.function_code='weekend_shopping' and a.account_id=p_account_id and b.status='active') then raise exception 'Assign an active Weekend Shopping receiving account first';end if;
 insert into private.weekend_payment_evidence(payment_id,account_id,provider_reference,received_amount_kes,received_at,evidence_locator,recorded_by)
 values(p_payment_id,p_account_id,upper(btrim(p_provider_reference)),p_received_amount,p_received_at,btrim(p_evidence_locator),auth.uid());
end $$;
create or replace function public.admin_review_weekend_payment(p_payment_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path='' as $$
declare w record;c record;e record;
begin
 if auth.uid() is null or not private.is_leogo_admin('settlements.read') then raise exception 'Finance permission required';end if;
 select * into w from public.weekend_shopping_payments where id=p_payment_id;
 if not found then raise exception 'Payment missing';end if;
 select * into c from public.weekend_shopping_cycles where id=w.cycle_id for update;
 select * into w from public.weekend_shopping_payments where id=p_payment_id for update;
 if w.status<>'pending' then raise exception 'Payment already reviewed';end if;
 if p_approve then
 select * into e from private.weekend_payment_evidence where payment_id=w.id;
 if not found or e.recorded_by=auth.uid() or e.received_amount_kes<>w.amount_kes then raise exception 'Matching evidence and independent second reviewer required';end if;
 if c.status<>'funding' or c.quote_confirmed_at is null or c.verified_paid_kes+w.amount_kes>c.amount_due_kes then raise exception 'Cycle not eligible';end if;
 update public.weekend_shopping_cycles set verified_paid_kes=verified_paid_kes+w.amount_kes,status=case when verified_paid_kes+w.amount_kes=amount_due_kes then 'funded' else 'funding' end where id=c.id;
 end if;
 update public.weekend_shopping_payments set status=case when p_approve then 'verified' else 'rejected' end,verified_at=now(),verified_by=auth.uid() where id=w.id;
end $$;
create or replace function public.customer_cancel_weekend_cycle(p_cycle_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare c record;v_id uuid;
begin
 if auth.uid() is null or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Sign in and provide reason';end if;
 select c0.* into c from public.weekend_shopping_cycles c0 join public.weekend_shopping_plans p on p.id=c0.plan_id where c0.id=p_cycle_id and p.customer_id=auth.uid() for update of c0;
 if not found or c.status not in('funding','funded','release_ready') or c.released_order_id is not null then raise exception 'Cycle cannot be cancelled here';end if;
 if exists(select 1 from public.weekend_shopping_payments where cycle_id=c.id and status='pending') then raise exception 'Resolve pending payment claims first';end if;
 update public.weekend_shopping_cycles set status='cancelled' where id=c.id;
 if c.verified_paid_kes>0 then
 insert into public.weekend_shopping_refunds(cycle_id,customer_id,amount_kes,reason) values(c.id,auth.uid(),c.verified_paid_kes,btrim(p_reason)) returning id into v_id;
 end if;
 return v_id;
end $$;
create or replace function public.admin_review_weekend_refund(p_refund_id uuid,p_action text,p_reference text default null,p_evidence_locator text default null)
returns void language plpgsql security definer set search_path='' as $$
declare r record;
begin
 if auth.uid() is null or not private.is_leogo_admin('settlements.read') then raise exception 'Finance permission required';end if;
 select * into r from public.weekend_shopping_refunds where id=p_refund_id for update;
 if not found then raise exception 'Refund missing';end if;
 if p_action='approve' and r.status='requested' then
 update public.weekend_shopping_refunds set status='approved',approved_by=auth.uid(),approved_at=now() where id=r.id;
 elsif p_action='complete' and r.status='approved' then
 if r.approved_by=auth.uid() or length(btrim(coalesce(p_reference,'')))<6 or length(btrim(coalesce(p_evidence_locator,'')))<8 then raise exception 'Independent reviewer and refund evidence required';end if;
 update public.weekend_shopping_refunds set status='completed',completed_by=auth.uid(),completed_at=now(),refund_reference=upper(btrim(p_reference)),evidence_locator=btrim(p_evidence_locator) where id=r.id;
 else raise exception 'Invalid refund transition';end if;
end $$;
create or replace function public.admin_plan_weekend_preparation(p_cycle_id uuid,p_preparation_date date,p_checked boolean,p_notes text)
returns void language plpgsql security definer set search_path='' as $$
declare c record;
begin
 if auth.uid() is null or not private.is_leogo_admin() then raise exception 'Admin permission required';end if;
 select * into c from public.weekend_shopping_cycles where id=p_cycle_id for update;
 if not found or c.status not in('funded','release_ready') or c.verified_paid_kes<>c.amount_due_kes or p_preparation_date is null or p_preparation_date>c.delivery_date or length(btrim(coalesce(p_notes,'')))<3 then raise exception 'Funded cycle, valid preparation date and notes required';end if;
 update public.weekend_shopping_cycles set preparation_date=p_preparation_date,preparation_status=case when p_checked then 'checked' else 'planned' end,preparation_notes=btrim(p_notes),preparation_reviewed_by=auth.uid() where id=c.id;
end $$;
revoke execute on function public.admin_record_weekend_payment_evidence(uuid,uuid,text,numeric,timestamptz,text),public.customer_cancel_weekend_cycle(uuid,text),public.admin_review_weekend_refund(uuid,text,text,text),public.admin_plan_weekend_preparation(uuid,date,boolean,text) from public,anon;
grant execute on function public.admin_record_weekend_payment_evidence(uuid,uuid,text,numeric,timestamptz,text),public.customer_cancel_weekend_cycle(uuid,text),public.admin_review_weekend_refund(uuid,text,text,text),public.admin_plan_weekend_preparation(uuid,date,boolean,text) to authenticated;
