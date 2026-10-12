-- Permit independent active complaints for distinct purchased items in the same order.
-- Preserve one-active-case behavior for legacy order-level (NULL item) cases.
drop index if exists public.marketplace_aftersales_one_open_case_per_order;
create unique index if not exists marketplace_aftersales_one_open_case_per_item
 on public.marketplace_aftersales_cases(order_id,order_item_id)
 where order_item_id is not null and status in ('submitted','in_review','contacted');
create unique index if not exists marketplace_aftersales_one_legacy_open_case_per_order
 on public.marketplace_aftersales_cases(order_id)
 where order_item_id is null and status in ('submitted','in_review','contacted');
