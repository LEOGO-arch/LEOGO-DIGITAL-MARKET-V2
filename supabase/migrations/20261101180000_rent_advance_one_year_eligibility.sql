-- STAGING ONLY. Strengthens the simulation approval gate; never transfers money.
create or replace function public.rent_admin_simulate_advance(p_application uuid,p_amount numeric,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.rent_installment_applications%rowtype; v_id uuid; v_count integer;
begin
 if auth.uid() is null or not private.is_leogo_admin('approvals.manage') then
   raise exception 'Approval permission required';
 end if;
 select * into a from public.rent_installment_applications where id=p_application for update;
 if not found or a.status <> 'active' or a.landlord_verified_at is null
   or a.verified_account_snapshot is null or a.customer_accepted_at is null then
   raise exception 'An active accepted plan and verified landlord are required';
 end if;
 if not exists (select 1 from auth.users u where u.id=a.customer_id
   and u.created_at <= now()-interval '1 year') then
   raise exception 'Customer must have been a LEOGO member for at least one year';
 end if;
 if exists(select 1 from public.rent_change_requests where application_id=a.id and status='pending') then
   raise exception 'Resolve landlord or location changes before simulation';
 end if;
 -- Two different rent periods with verified payments made by their due dates.
 select count(distinct c.schedule_id) into v_count
 from public.rent_payment_claims c
 join public.rent_payment_schedule s on s.id=c.schedule_id and s.application_id=c.application_id
 where c.application_id=a.id and c.status='verified' and s.category='rent' and c.paid_on<=s.due_on;
 if v_count < 2 then raise exception 'At least two different rent periods with on-time verified payments are required'; end if;
 -- A currently overdue, incompletely paid rent period is not good payment history.
 if exists(
   select 1 from public.rent_payment_schedule s
   left join public.rent_payment_claims c on c.schedule_id=s.id and c.status='verified'
   where s.application_id=a.id and s.category='rent' and s.due_on<current_date
   group by s.id,s.amount having coalesce(sum(c.amount),0)<s.amount
 ) then raise exception 'Outstanding overdue rent period prevents Rent Advance approval'; end if;
 if p_amount is null or p_amount<=0 or p_amount>a.monthly_rent then
   raise exception 'Staging simulated advance must be no greater than one month rent';
 end if;
 if length(trim(coalesce(p_note,''))) not between 15 and 1000 then
   raise exception 'Record a 15-1000 character eligibility assessment';
 end if;
 insert into public.rent_advance_simulations(application_id,customer_id,simulated_advance,eligibility_note,simulated_by)
 values(a.id,a.customer_id,p_amount,trim(p_note),auth.uid()) returning id into v_id;
 return v_id;
end; $$;
revoke all on function public.rent_admin_simulate_advance(uuid,numeric,text) from public,anon;
grant execute on function public.rent_admin_simulate_advance(uuid,numeric,text) to authenticated;
