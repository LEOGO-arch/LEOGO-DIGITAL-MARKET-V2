
create table if not exists public.leogo_policy_documents (
 policy_key text primary key,
 effective_date date not null,
 introduction text not null,
 summary text not null,
 sections jsonb not null,
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
create table if not exists public.leogo_policy_revisions(
 id bigint generated always as identity primary key,
 policy_key text not null references public.leogo_policy_documents(policy_key),
 version integer not null,
 snapshot jsonb not null,
 changed_at timestamptz not null default now(),
 changed_by uuid not null references auth.users(id),
 unique(policy_key,version)
);
alter table public.leogo_policy_documents enable row level security;
alter table public.leogo_policy_revisions enable row level security;
revoke all on public.leogo_policy_documents,public.leogo_policy_revisions from anon,authenticated;
insert into public.leogo_policy_documents(policy_key,effective_date,introduction,summary,sections)
values('returns-refunds-exchanges','2026-11-17','Applies to eligible physical goods ordered through LEOGO Digital Market for delivery within Kenya.','You can request a return for an eligible item within 7 calendar days after confirmed delivery. Approved refunds are targeted within 7 business days after approval and any required receipt or inspection of returned goods, excluding external payment-provider delays. Your statutory consumer rights remain protected.','[{"heading":"1. When you can request help","body":"LEOGO receives after-sales requests for items that are damaged, defective, incorrect, missing or materially different from their description. Depending on the circumstances, the available remedy may include replacement, exchange, repair, refund or another appropriate resolution.\n\nYou may also request a change-of-mind return for an eligible non-defective product within 7 calendar days after confirmed delivery. The standard voluntary return request window does not limit any longer or separate remedy you may be entitled to under applicable law."},{"heading":"2. Product condition and exceptions","body":"For an eligible change-of-mind return, the item should be unused, complete and, where reasonably possible, supplied with its original accessories and packaging. Category-specific restrictions may apply to perishables, opened hygiene-sensitive items, personalised or made-to-order goods and other items where a lawful return exception applies. Any applicable exception should be disclosed with the product or before the order is completed.\n\nA defective or misdescribed item is not automatically excluded merely because its packaging was opened or the voluntary seven-day window has expired. Claims will be assessed fairly under applicable Kenyan consumer law."},{"heading":"3. How to submit a request","body":"Sign in to LEOGO Digital Market and open your order or after-sales support section.\n\nChoose the relevant item and select the return, refund, damage, incorrect-item or other applicable issue.\n\nDescribe the problem and attach available photos or other supporting information, then choose your preferred remedy.\n\nFollow the case updates and any seller response or LEOGO intervention instructions.\n\nIf you cannot use your account, email leogodigitalmarket@gmail.com or call 0700 192 545 with your order reference. Please do not email original identity documents or sensitive payment credentials."},{"heading":"4. Returning items and return shipping","body":"Where a return is accepted, LEOGO will provide directions for an approved return pickup station or other return arrangement. Do not send an item to an address that LEOGO has not confirmed.\n\nFor a verified damaged, defective, incorrect or materially misdescribed item attributable to the seller or fulfilment process, the customer will not be charged for the return transport needed to correct that problem. For an approved change-of-mind return, the customer pays the return transport cost communicated before the return shipment is arranged. LEOGO does not charge a restocking fee for returns covered by this policy."},{"heading":"5. Assessment, exchanges and refunds","body":"LEOGO may review the request, consult the seller and inspect returned goods where necessary. Where an exchange or replacement is appropriate, the team will coordinate the agreed next steps with you.\n\nOnce a refund is approved and the required return or inspection is completed, LEOGO aims to process it within 7 business days. Payments made through external providers can take additional time to appear in your account. Refunds will ordinarily be made through the original payment channel unless you expressly agree to another lawful method. LEOGO will keep the customer informed where further investigation or payment-provider processing is required."},{"heading":"6. Items and services covered by separate terms","body":"This policy covers eligible physical-product purchases. It does not replace separate applicable terms for services, accommodation, rent instalments, Lipa Pole Pole arrangements, financial products or other specialist programmes. Their distinct cancellation or payment conditions should be reviewed before purchase. The Lipa Pole Pole cancellation deduction is not a general product-return fee."},{"heading":"7. Your statutory rights","body":"Nothing in this policy removes or reduces rights and remedies provided under Kenya''s applicable consumer-protection laws. If those rights provide greater protection than this voluntary policy, the law takes precedence."},{"heading":"8. Questions or complaints","body":"For help or an unresolved return, refund or exchange case, contact LEOGO customer support:\n\nEmail: leogodigitalmarket@gmail.com\nTelephone: 0700 192 545\nWebsite: https://leogo.co.ke/"}]'::jsonb)
on conflict(policy_key) do nothing;
create or replace function public.public_get_return_refund_policy()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('effective_date',p.effective_date,'introduction',p.introduction,'summary',p.summary,'sections',p.sections,'version',p.version,'updated_at',p.updated_at)
 from public.leogo_policy_documents p where policy_key='returns-refunds-exchanges'
$$;
create or replace function public.admin_update_return_refund_policy(p_effective_date date,p_introduction text,p_summary text,p_sections jsonb,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_doc public.leogo_policy_documents%rowtype;v_section jsonb;v_changed jsonb;
begin
 if (select auth.uid()) is null or not private.is_leogo_admin('settings.manage') then raise exception 'System Settings management permission required';end if;
 if p_effective_date is null or length(btrim(coalesce(p_introduction,'')))<20 or length(btrim(coalesce(p_summary,'')))<40 then raise exception 'Effective date, introduction and full summary are required';end if;
 if jsonb_typeof(p_sections)<>'array' or jsonb_array_length(p_sections)<>8 then raise exception 'Keep all eight policy sections';end if;
 for v_section in select value from jsonb_array_elements(p_sections) loop
  if jsonb_typeof(v_section)<>'object' or length(btrim(coalesce(v_section->>'heading','')))<5 or length(btrim(coalesce(v_section->>'body','')))<20
    or length(v_section->>'heading')>180 or length(v_section->>'body')>12000 then raise exception 'Every section requires a heading and complete terms';end if;
 end loop;
 select * into v_doc from public.leogo_policy_documents where policy_key='returns-refunds-exchanges' for update;
 if not found or v_doc.version<>p_expected_version then raise exception 'Policy changed since you opened it. Refresh before saving';end if;
 insert into public.leogo_policy_revisions(policy_key,version,snapshot,changed_by)
 values(v_doc.policy_key,v_doc.version,jsonb_build_object('effective_date',v_doc.effective_date,'introduction',v_doc.introduction,'summary',v_doc.summary,'sections',v_doc.sections),auth.uid());
 update public.leogo_policy_documents set effective_date=p_effective_date,introduction=btrim(p_introduction),summary=btrim(p_summary),
 sections=p_sections,version=version+1,updated_by=auth.uid(),updated_at=now() where policy_key='returns-refunds-exchanges'
 returning to_jsonb(leogo_policy_documents.*) into v_changed;
 perform private.write_admin_audit('policy.return_refund.updated','policy','returns-refunds-exchanges',
 to_jsonb(v_doc),v_changed,jsonb_build_object('version',p_expected_version+1));
 return jsonb_build_object('version',p_expected_version+1,'updated_at',v_changed->>'updated_at');
end $$;
revoke execute on function public.public_get_return_refund_policy(),public.admin_update_return_refund_policy(date,text,text,jsonb,integer) from public;
grant execute on function public.public_get_return_refund_policy() to anon,authenticated;
grant execute on function public.admin_update_return_refund_policy(date,text,text,jsonb,integer) to authenticated;
