-- Order the combined approval queue from an outer query. PostgreSQL does not
-- allow expressions or unresolved branch aliases in a UNION-level ORDER BY.
create or replace function public.admin_list_approval_queue()
returns table (
  kind text,
  record_id uuid,
  applicant_id uuid,
  applicant_name text,
  applicant_email text,
  title text,
  subtitle text,
  amount_kes numeric,
  status text,
  submitted_at timestamptz,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_leogo_admin('approvals.read') then
    raise exception 'Admin access required';
  end if;

  return query
  with combined (
    kind,
    record_id,
    applicant_id,
    applicant_name,
    applicant_email,
    title,
    subtitle,
    amount_kes,
    status,
    submitted_at,
    payload
  ) as (
    select 'premium_customer'::text, c.user_id, c.user_id,
           coalesce(d.real_name, u.email::text, 'Premium Customer'), u.email::text,
           'Premium Customer Application'::text,
           concat_ws(' · ', c.sex, c.age::text || ' years', c.location),
           null::numeric, c.application_status, coalesce(c.submitted_at,c.created_at),
           to_jsonb(c) || coalesce(to_jsonb(d),'{}'::jsonb)
    from public.premium_customers c
    left join public.premium_customer_private_details d on d.user_id=c.user_id
    left join auth.users u on u.id=c.user_id
    where c.application_status in ('submitted','under_review')

    union all

    select 'premium_profile', p.user_id, p.user_id,
           coalesce(i.real_name,p.display_name,u.email::text,'Premium Profile'), u.email::text,
           'Verified Premium Profile'::text,
           concat_ws(' · ',p.display_name,p.gender,p.general_location),
           null::numeric,p.application_status,coalesce(p.submitted_at,p.created_at),
           to_jsonb(p) || coalesce(to_jsonb(i),'{}'::jsonb)
    from public.premium_profiles p
    left join public.premium_identity_details i on i.user_id=p.user_id
    left join auth.users u on u.id=p.user_id
    where p.application_status in ('submitted','under_review')

    union all

    select 'premium_payment', pay.id, pay.user_id,
           coalesce(cp.full_name,u.email::text,'Premium Customer'),u.email::text,
           pay.plan_name,
           'Premium membership payment · ' || pay.payment_reference,
           pay.amount_kes::numeric,pay.payment_status,pay.submitted_at,to_jsonb(pay)
    from public.premium_membership_payments pay
    left join public.customer_profiles cp on cp.user_id=pay.user_id
    left join auth.users u on u.id=pay.user_id
    where pay.payment_status='pending'

    union all

    select 'wallet_deposit',d.id,d.user_id,
           coalesce(cp.full_name,u.email::text,'Wallet Customer'),u.email::text,
           case when d.deposit_kind='daily_challenge' then 'Daily Saving Challenge' else 'Wallet Saving Deposit' end,
           'Payment reference · ' || d.payment_reference,
           d.requested_amount_kes::numeric,d.request_status,d.submitted_at,to_jsonb(d)
    from public.wallet_deposit_requests d
    left join public.customer_profiles cp on cp.user_id=d.user_id
    left join auth.users u on u.id=d.user_id
    where d.request_status='pending'

    union all

    select 'wallet_loan',l.id,l.user_id,
           coalesce(cp.full_name,u.email::text,'Loan Applicant'),u.email::text,
           'Wallet Loan Application'::text,l.purpose,
           l.requested_amount_kes::numeric,l.application_status,l.submitted_at,to_jsonb(l)
    from public.wallet_loan_applications l
    left join public.customer_profiles cp on cp.user_id=l.user_id
    left join auth.users u on u.id=l.user_id
    where l.application_status in ('pending','under_review')

    union all

    select 'wallet_withdrawal',w.id,w.user_id,
           coalesce(cp.full_name,u.email::text,'Wallet Customer'),u.email::text,
           'Wallet Withdrawal Request'::text,
           concat_ws(' · ',w.settlement_method,w.account_name,w.account_number),
           w.requested_amount_kes,w.request_status,w.submitted_at,to_jsonb(w)
    from public.wallet_withdrawal_requests w
    left join public.customer_profiles cp on cp.user_id=w.user_id
    left join auth.users u on u.id=w.user_id
    where w.request_status in ('pending_call','approved_processing')

    union all

    select 'accommodation_host',h.id,h.user_id,
           h.business_name,u.email::text,'Accommodation Host Application'::text,
           concat_ws(' · ',h.contact_phone,h.contact_email),null::numeric,
           h.verification_status,h.created_at,to_jsonb(h)
    from public.accommodation_hosts h
    left join auth.users u on u.id=h.user_id
    where h.verification_status in ('pending','under_review')

    union all

    select 'accommodation_property',p.id,h.user_id,
           h.business_name,u.email::text,p.property_name,
           concat_ws(' · ',p.property_type,p.town,p.county),null::numeric,
           p.approval_status,p.created_at,to_jsonb(p)
    from public.accommodation_properties p
    join public.accommodation_hosts h on h.id=p.host_id
    left join auth.users u on u.id=h.user_id
    where p.approval_status in ('submitted','under_review')
  )
  select q.kind, q.record_id, q.applicant_id, q.applicant_name,
         q.applicant_email, q.title, q.subtitle, q.amount_kes, q.status,
         q.submitted_at, q.payload
  from combined q
  order by q.submitted_at desc nulls last, q.kind, q.record_id;
end;
$$;

revoke execute on function public.admin_list_approval_queue() from public, anon;
grant execute on function public.admin_list_approval_queue() to authenticated;

notify pgrst, 'reload schema';
