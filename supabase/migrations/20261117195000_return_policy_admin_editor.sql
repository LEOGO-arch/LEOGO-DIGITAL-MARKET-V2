-- Versioned, explicitly publishable LEOGO Return, Refund & Exchange Policy.
-- Seeded from the existing 17 November 2026 public policy (no immediate text changes).
create table if not exists public.return_policy_content(
  id integer primary key check(id=1),
  published_title text not null,
  published_effective_date date not null,
  published_applicability text not null,
  published_summary text not null,
  published_body text not null,
  draft_title text not null,
  draft_effective_date date not null,
  draft_applicability text not null,
  draft_summary text not null,
  draft_body text not null,
  draft_version integer not null default 1,
  publication_version integer not null default 1,
  last_edited_by uuid,
  draft_saved_at timestamptz,
  published_by uuid,
  published_at timestamptz not null default now()
);
alter table public.return_policy_content enable row level security;
revoke all on public.return_policy_content from public,anon,authenticated;
create table if not exists private.return_policy_publications(
  id bigint generated always as identity primary key,
  publication_version integer not null unique,
  title text not null,
  effective_date date not null,
  applicability text not null,
  summary text not null,
  body text not null,
  published_by uuid,
  published_at timestamptz not null default now()
);
alter table private.return_policy_publications enable row level security;
revoke all on private.return_policy_publications from public,anon,authenticated;
insert into public.return_policy_content(id,published_title,published_effective_date,published_applicability,published_summary,published_body,
draft_title,draft_effective_date,draft_applicability,draft_summary,draft_body)
values(1,'Return, Refund & Exchange Policy','2026-11-17','Applies to eligible physical goods ordered through LEOGO Digital Market for delivery within Kenya.','At a glance: You can request a return for an eligible item within 7 calendar days after confirmed delivery. Approved refunds are targeted within 7 business days after approval and any required receipt or inspection of returned goods, excluding external payment-provider delays. Your statutory consumer rights remain protected.','## 1. When you can request help

LEOGO receives after-sales requests for items that are damaged, defective, incorrect, missing or materially different from their description. Depending on the circumstances, the available remedy may include replacement, exchange, repair, refund or another appropriate resolution.

You may also request a change-of-mind return for an eligible non-defective product within 7 calendar days after confirmed delivery. The standard voluntary return request window does not limit any longer or separate remedy you may be entitled to under applicable law.

## 2. Product condition and exceptions

For an eligible change-of-mind return, the item should be unused, complete and, where reasonably possible, supplied with its original accessories and packaging. Category-specific restrictions may apply to perishables, opened hygiene-sensitive items, personalised or made-to-order goods and other items where a lawful return exception applies. Any applicable exception should be disclosed with the product or before the order is completed.

A defective or misdescribed item is not automatically excluded merely because its packaging was opened or the voluntary seven-day window has expired. Claims will be assessed fairly under applicable Kenyan consumer law.

## 3. How to submit a request

• Sign in to LEOGO Digital Market and open your order or after-sales support section.

• Choose the relevant item and select the return, refund, damage, incorrect-item or other applicable issue.

• Describe the problem and attach available photos or other supporting information, then choose your preferred remedy.

• Follow the case updates and any seller response or LEOGO intervention instructions.

If you cannot use your account, email leogodigitalmarket@gmail.com or call 0700 192 545 with your order reference. Please do not email original identity documents or sensitive payment credentials.

## 4. Returning items and return shipping

Where a return is accepted, LEOGO will provide directions for an approved return pickup station or other return arrangement. Do not send an item to an address that LEOGO has not confirmed.

For a verified damaged, defective, incorrect or materially misdescribed item attributable to the seller or fulfilment process, the customer will not be charged for the return transport needed to correct that problem. For an approved change-of-mind return, the customer pays the return transport cost communicated before the return shipment is arranged. LEOGO does not charge a restocking fee for returns covered by this policy.

## 5. Assessment, exchanges and refunds

LEOGO may review the request, consult the seller and inspect returned goods where necessary. Where an exchange or replacement is appropriate, the team will coordinate the agreed next steps with you.

Once a refund is approved and the required return or inspection is completed, LEOGO aims to process it within 7 business days. Payments made through external providers can take additional time to appear in your account. Refunds will ordinarily be made through the original payment channel unless you expressly agree to another lawful method. LEOGO will keep the customer informed where further investigation or payment-provider processing is required.

## 6. Items and services covered by separate terms

This policy covers eligible physical-product purchases. It does not replace separate applicable terms for services, accommodation, rent instalments, Lipa Pole Pole arrangements, financial products or other specialist programmes. Their distinct cancellation or payment conditions should be reviewed before purchase. The Lipa Pole Pole cancellation deduction is not a general product-return fee.

## 7. Your statutory rights

Nothing in this policy removes or reduces rights and remedies provided under Kenya''s applicable consumer-protection laws. If those rights provide greater protection than this voluntary policy, the law takes precedence.

## 8. Questions or complaints

For help or an unresolved return, refund or exchange case, contact LEOGO customer support:

• Email: leogodigitalmarket@gmail.com

• Telephone: 0700 192 545

• Website: https://leogo.co.ke/',
'Return, Refund & Exchange Policy','2026-11-17','Applies to eligible physical goods ordered through LEOGO Digital Market for delivery within Kenya.','At a glance: You can request a return for an eligible item within 7 calendar days after confirmed delivery. Approved refunds are targeted within 7 business days after approval and any required receipt or inspection of returned goods, excluding external payment-provider delays. Your statutory consumer rights remain protected.','## 1. When you can request help

LEOGO receives after-sales requests for items that are damaged, defective, incorrect, missing or materially different from their description. Depending on the circumstances, the available remedy may include replacement, exchange, repair, refund or another appropriate resolution.

You may also request a change-of-mind return for an eligible non-defective product within 7 calendar days after confirmed delivery. The standard voluntary return request window does not limit any longer or separate remedy you may be entitled to under applicable law.

## 2. Product condition and exceptions

For an eligible change-of-mind return, the item should be unused, complete and, where reasonably possible, supplied with its original accessories and packaging. Category-specific restrictions may apply to perishables, opened hygiene-sensitive items, personalised or made-to-order goods and other items where a lawful return exception applies. Any applicable exception should be disclosed with the product or before the order is completed.

A defective or misdescribed item is not automatically excluded merely because its packaging was opened or the voluntary seven-day window has expired. Claims will be assessed fairly under applicable Kenyan consumer law.

## 3. How to submit a request

• Sign in to LEOGO Digital Market and open your order or after-sales support section.

• Choose the relevant item and select the return, refund, damage, incorrect-item or other applicable issue.

• Describe the problem and attach available photos or other supporting information, then choose your preferred remedy.

• Follow the case updates and any seller response or LEOGO intervention instructions.

If you cannot use your account, email leogodigitalmarket@gmail.com or call 0700 192 545 with your order reference. Please do not email original identity documents or sensitive payment credentials.

## 4. Returning items and return shipping

Where a return is accepted, LEOGO will provide directions for an approved return pickup station or other return arrangement. Do not send an item to an address that LEOGO has not confirmed.

For a verified damaged, defective, incorrect or materially misdescribed item attributable to the seller or fulfilment process, the customer will not be charged for the return transport needed to correct that problem. For an approved change-of-mind return, the customer pays the return transport cost communicated before the return shipment is arranged. LEOGO does not charge a restocking fee for returns covered by this policy.

## 5. Assessment, exchanges and refunds

LEOGO may review the request, consult the seller and inspect returned goods where necessary. Where an exchange or replacement is appropriate, the team will coordinate the agreed next steps with you.

Once a refund is approved and the required return or inspection is completed, LEOGO aims to process it within 7 business days. Payments made through external providers can take additional time to appear in your account. Refunds will ordinarily be made through the original payment channel unless you expressly agree to another lawful method. LEOGO will keep the customer informed where further investigation or payment-provider processing is required.

## 6. Items and services covered by separate terms

This policy covers eligible physical-product purchases. It does not replace separate applicable terms for services, accommodation, rent instalments, Lipa Pole Pole arrangements, financial products or other specialist programmes. Their distinct cancellation or payment conditions should be reviewed before purchase. The Lipa Pole Pole cancellation deduction is not a general product-return fee.

## 7. Your statutory rights

Nothing in this policy removes or reduces rights and remedies provided under Kenya''s applicable consumer-protection laws. If those rights provide greater protection than this voluntary policy, the law takes precedence.

## 8. Questions or complaints

For help or an unresolved return, refund or exchange case, contact LEOGO customer support:

• Email: leogodigitalmarket@gmail.com

• Telephone: 0700 192 545

• Website: https://leogo.co.ke/')
on conflict (id) do nothing;
insert into private.return_policy_publications(publication_version,title,effective_date,applicability,summary,body)
select publication_version,published_title,published_effective_date,published_applicability,published_summary,published_body
from public.return_policy_content where id=1
on conflict(publication_version) do nothing;

create or replace function public.public_get_return_policy()
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('title',p.published_title,'effective_date',p.published_effective_date,
 'applicability',p.published_applicability,'summary',p.published_summary,
 'body',p.published_body,'publication_version',p.publication_version,'published_at',p.published_at)
from public.return_policy_content p where p.id=1
$$;
revoke execute on function public.public_get_return_policy() from public;
grant execute on function public.public_get_return_policy() to anon,authenticated;

create or replace function public.admin_get_return_policy()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p record;
begin
 if auth.uid() is null or not private.is_leogo_admin('settings.manage') then raise exception 'Settings permission required';end if;
 select * into p from public.return_policy_content where id=1;
 return jsonb_build_object('draft_title',p.draft_title,'draft_effective_date',p.draft_effective_date,
 'draft_applicability',p.draft_applicability,'draft_summary',p.draft_summary,'draft_body',p.draft_body,
 'draft_version',p.draft_version,'publication_version',p.publication_version,
 'published_title',p.published_title,'published_effective_date',p.published_effective_date,
 'published_applicability',p.published_applicability,'published_summary',p.published_summary,
 'published_body',p.published_body,'published_at',p.published_at,
 'has_unpublished_changes',(p.draft_title,p.draft_effective_date,p.draft_applicability,p.draft_summary,p.draft_body)
  is distinct from (p.published_title,p.published_effective_date,p.published_applicability,p.published_summary,p.published_body));
end $$;
revoke execute on function public.admin_get_return_policy() from public,anon;
grant execute on function public.admin_get_return_policy() to authenticated;

create or replace function public.admin_save_return_policy_draft(
 p_title text,p_effective_date date,p_applicability text,p_summary text,p_body text,p_expected_version integer)
returns integer language plpgsql security definer set search_path='' as $$
declare v_version integer;
begin
 if auth.uid() is null or not private.is_leogo_admin('settings.manage') then raise exception 'Settings permission required';end if;
 if char_length(btrim(coalesce(p_title,''))) not between 8 and 180
    or p_effective_date is null or char_length(btrim(coalesce(p_applicability,''))) not between 20 and 1500
    or char_length(btrim(coalesce(p_summary,''))) not between 30 and 2500
    or char_length(btrim(coalesce(p_body,''))) not between 200 and 30000 then
    raise exception 'Complete all fields; policy body must contain at least 200 characters';end if;
 update public.return_policy_content
 set draft_title=btrim(p_title),draft_effective_date=p_effective_date,
  draft_applicability=btrim(p_applicability),draft_summary=btrim(p_summary),draft_body=btrim(p_body),
  draft_version=draft_version+1,last_edited_by=auth.uid(),draft_saved_at=now()
 where id=1 and draft_version=p_expected_version returning draft_version into v_version;
 if v_version is null then raise exception 'This policy was edited elsewhere. Reload before saving';end if;
 return v_version;
end $$;
revoke execute on function public.admin_save_return_policy_draft(text,date,text,text,text,integer) from public,anon;
grant execute on function public.admin_save_return_policy_draft(text,date,text,text,text,integer) to authenticated;

create or replace function public.admin_publish_return_policy(p_expected_draft_version integer)
returns integer language plpgsql security definer set search_path='' as $$
declare p public.return_policy_content%rowtype;v_version integer;
begin
 if auth.uid() is null or not private.is_leogo_admin('settings.manage') then raise exception 'Settings permission required';end if;
 select * into p from public.return_policy_content where id=1 for update;
 if not found or p.draft_version<>p_expected_draft_version then raise exception 'Policy draft changed. Reload before publishing';end if;
 if (p.draft_title,p.draft_effective_date,p.draft_applicability,p.draft_summary,p.draft_body)
  is not distinct from (p.published_title,p.published_effective_date,p.published_applicability,p.published_summary,p.published_body)
 then return p.publication_version;end if;
 v_version:=p.publication_version+1;
 update public.return_policy_content
 set published_title=p.draft_title,published_effective_date=p.draft_effective_date,
  published_applicability=p.draft_applicability,published_summary=p.draft_summary,
  published_body=p.draft_body,publication_version=v_version,published_by=auth.uid(),published_at=now()
 where id=1;
 insert into private.return_policy_publications(publication_version,title,effective_date,applicability,summary,body,published_by)
 values(v_version,p.draft_title,p.draft_effective_date,p.draft_applicability,p.draft_summary,p.draft_body,auth.uid());
 return v_version;
end $$;
revoke execute on function public.admin_publish_return_policy(integer) from public,anon;
grant execute on function public.admin_publish_return_policy(integer) to authenticated;
