-- Backfill seller notification for forwarded cases created before notification routing.
-- Idempotent: no duplicates for already notified cases.
insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
select n.seller_id,'seller','aftersales_forwarded','Aftersales case assigned',
 'Case '||c.case_reference||' has been assigned to you. Open Seller Orders to review the complaint.',
 'marketplace_aftersales_case',n.case_id,'orders',
 jsonb_build_object('case_id',n.case_id,'order_id',c.order_id)
from public.marketplace_aftersales_negotiations n
join public.marketplace_aftersales_cases c on c.id=n.case_id
where n.stage='forwarded'
  and c.status not in ('resolved','rejected','cancelled')
  and not exists (
    select 1 from public.partner_notifications pn
    where pn.user_id=n.seller_id and pn.source_id=n.case_id
      and pn.event_type in ('aftersales_forwarded','aftersales_submitted')
  );
