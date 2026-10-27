-- Publish the reviewed LEOGO partner agreement text as new, immutable versions.
-- This does not alter existing order, delivery, payment, or acceptance functions.
do $migration$
declare
  v_type text;
  v_terms text;
  v_version integer;
begin
  for v_type in select unnest(array['seller','service_provider']::text[]) loop
    v_terms := format($agreement$
LEOGO DIGITAL MARKET - %s PARTNER AGREEMENT - VERSION 1.0

PLATFORM: LEOGO DIGITAL MARKET, a legally registered business in Kenya ("LEOGO"). LEOGO operates a digital marketplace connecting customers to independent sellers and service providers for goods and services. LEOGO facilitates listings, promotion, ordering, delivery or collection arrangements, customer support and payment-related processes where lawfully authorised, and earns disclosed commissions and fees. The Partner remains the supplier unless expressly agreed otherwise.

PARTNER: The verified individual or registered entity accepting this agreement through its authenticated LEOGO account. Partner identity, registration details and acceptance timestamp form part of the execution record.

1. APPOINTMENT AND INDEPENDENT STATUS
LEOGO may approve the Partner to offer lawful goods or services through its marketplace. The Partner is an independent business, not an employee, shareholder or general agent of LEOGO. Each party is responsible for its own legally required registrations, permits and taxes.

2. VERIFICATION AND ACCURATE INFORMATION
The Partner shall supply accurate identity, business, contact, licensing and settlement details and keep them updated. LEOGO may verify information, request corrections and restrict unsafe or fraudulent activity. Verification documents shall be protected and accessible only to authorised personnel.

3. GOODS AND SERVICES
The Partner must list accurate prices, descriptions, available stock and service availability, supply lawful and safe goods, possess required permissions, and provide competent services with reasonable care and skill. Counterfeit, unsafe or misleading listings are prohibited. Material substitutions require customer consent.

4. ORDERS AND FULFILMENT
The Partner shall honour accepted orders and agreed bookings, prepare and hand over goods promptly, and cooperate with the existing delivery and customer-support processes. Seller-entered completion alone is insufficient for settlement: receipt must be confirmed by the customer or verified authorised rider/pickup-station proof.

5. COMMISSIONS AND FEES
For goods, the current LEOGO commission is 2%% on applicable orders below KSh 3,000 and 1.5%% on orders from KSh 3,000, unless another explicitly accepted schedule applies. For service providers, the current commission is 10%% of the agreed service value unless another accepted schedule applies. Any other fees must be disclosed. LEOGO may change rates from time to time with prior notice and a versioned fee schedule accepted as applicable to future transactions only; changes do not retroactively affect accepted orders. Applicable taxes remain payable under Kenyan law.

6. PAYMENTS AND SETTLEMENT
Where a lawfully authorised payment-provider arrangement permits platform collection and settlement, transactions shall follow the provider's approved terms. LEOGO may deduct disclosed agreed commissions and evidenced adjustments but shall not treat amounts owed to Partners as unrestricted operating funds. A payment-confirmed, reconciled, fulfilled and independently verified transaction without an unresolved affecting dispute becomes settlement-eligible. LEOGO shall initiate the Partner's net settlement within 24 hours after verified delivery or service completion and confirmed customer payment, subject to documented disputes, provider outages or legally required holds with prompt notification. Payment is complete only upon provider confirmation; the Partner can view the transaction breakdown.

7. RETURNS, REFUNDS AND DISPUTES
Kenyan consumer rights and the published customer policy apply. The Partner shall cooperate with evidence requests, rectification and lawful refunds. Only disputed amounts should be held where reasonably possible; no arbitrary forfeiture or undisclosed deduction is permitted.

8. CONDUCT AND PERSONAL DATA
The Partner shall act honestly and respectfully, use customer details only for authorised fulfilment, implement reasonable privacy safeguards, refrain from unsolicited marketing and report suspected data breaches promptly. Both parties remain bound by applicable Kenyan data protection law.

9. PLATFORM CONTENT AND BRAND
LEOGO owns or licenses its platform and branding. The Partner retains rights to authorised listing content and grants LEOGO a non-exclusive licence to display and promote it during the partnership. The Partner warrants that its submitted content is lawful and non-infringing.

10. RECORDS AND COMMUNICATION
LEOGO may preserve versioned agreements, electronic acceptance evidence, delivery, payment and settlement records, and customer-service correspondence. The Partner may download its agreement and statements. Notices may be delivered through verified dashboard or contact channels.

11. TERMINATION
Either party may terminate on 30 days' written notice, or immediately for material fraud, illegality, serious safety risk or repeated material breach. Ending the partnership does not extinguish accrued lawful settlements, refund duties, confidentiality or data protection obligations.

12. RESPONSIBILITY AND LIABILITY
Each party is responsible for its own proven unlawful conduct, negligence or breach subject to applicable law. Nothing excludes fraud liability or mandatory consumer rights. Loss claims and deductions require substantiating evidence.

13. UPDATED TERMS
Material changes shall be published as a new version with notice and fresh affirmative acceptance before applying to future activities. Older accepted versions and audit evidence remain preserved. No material revision is deemed accepted merely by silence.

14. GOVERNING LAW AND RESOLUTION
Kenyan law applies. Parties shall attempt good-faith resolution within 30 days after written dispute notice. Urgent legal relief and statutory regulatory complaints remain available; unresolved matters may proceed to a competent Kenyan court.

15. ELECTRONIC EXECUTION
The Partner shall review the complete agreement and accept through an authenticated, identity-linked signing procedure. Where required, an authorised LEOGO representative countersigns electronically or by signing, stamping and uploading the complete document. The final executed copy and reliable signing/audit evidence shall be retained. A checkbox or typed name alone is not represented as a certified advanced electronic signature.

16. SCHEDULES
Applicable separately published and accepted fees, delivery, privacy, customer refund and sector-specific terms form part of the relationship where identified by version. Mandatory law prevails over inconsistent terms.
$agreement$, case when v_type='seller' then 'SELLER' else 'SERVICE PROVIDER' end);

    -- Avoid duplicating this content if deployment is retried or another admin
    -- has already published precisely the same contractual version.
    if not exists(select 1 from public.leogo_partner_terms
                  where partner_type=v_type and terms_text=v_terms) then
      perform pg_advisory_xact_lock(hashtext('leogo_partner_terms:'||v_type));
      select coalesce(max(version),0)+1 into v_version from public.leogo_partner_terms where partner_type=v_type;
      insert into public.leogo_partner_terms(partner_type,version,terms_text)
      values(v_type,v_version,v_terms);
    end if;
  end loop;
end;
$migration$;
