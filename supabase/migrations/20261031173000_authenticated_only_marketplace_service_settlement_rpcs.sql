-- Authenticated-only RPCs: retain execution for signed-in clients.
-- Each function scopes records using auth.uid() or rejects a missing user.
revoke execute on function public.customer_list_marketplace_orders() from public, anon;
grant execute on function public.customer_list_marketplace_orders() to authenticated;
revoke execute on function public.seller_list_marketplace_orders() from public, anon;
grant execute on function public.seller_list_marketplace_orders() to authenticated;
revoke execute on function public.service_provider_update_job(uuid,text,numeric,text,date,numeric) from public, anon;
grant execute on function public.service_provider_update_job(uuid,text,numeric,text,date,numeric) to authenticated;
revoke execute on function public.transport_provider_request_settlement(uuid,numeric,text) from public, anon;
grant execute on function public.transport_provider_request_settlement(uuid,numeric,text) to authenticated;