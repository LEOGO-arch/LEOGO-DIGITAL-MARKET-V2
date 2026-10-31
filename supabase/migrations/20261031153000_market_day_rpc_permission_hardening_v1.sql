-- Supabase project-level default grants can give anon EXECUTE independently
-- of the PostgreSQL PUBLIC role. Revoke both sources explicitly.
revoke execute on function public.seller_submit_market_day_offer(uuid,uuid,text,numeric,jsonb,numeric) from public,anon;
revoke execute on function public.seller_market_day_overview() from public,anon;
revoke execute on function public.admin_review_market_day_offer(uuid,boolean,text) from public,anon;
revoke execute on function public.admin_save_market_day(uuid,text,date,date,time,time,integer[],text,text,text) from public,anon;
revoke execute on function public.admin_save_free_delivery_campaign(uuid,text,numeric,text,text,text,text,timestamptz,timestamptz,numeric,numeric,text) from public,anon;
revoke execute on function public.admin_set_free_delivery_campaign_status(uuid,text) from public,anon;
revoke execute on function public.admin_market_day_overview() from public,anon;
