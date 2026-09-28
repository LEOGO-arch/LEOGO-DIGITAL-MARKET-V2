
revoke execute on function public.cyber_provider_get_own_account() from public, anon;
revoke execute on function public.cyber_provider_submit_application(text,text,text,text,text,text,text,text,numeric,numeric,text,text,text,text,text,text,text[]) from public, anon;
revoke execute on function public.cyber_provider_submit_profile_change(jsonb) from public, anon;
revoke execute on function public.cyber_provider_list_services() from public, anon;
revoke execute on function public.cyber_provider_save_service(uuid,text,text,text,text,numeric,text,boolean,boolean,boolean) from public, anon;
revoke execute on function public.cyber_provider_list_products() from public, anon;
revoke execute on function public.cyber_provider_save_product(uuid,text,text,numeric,numeric,text,text,text) from public, anon;
revoke execute on function public.cyber_provider_list_orders() from public, anon;
revoke execute on function public.cyber_provider_quote_order(uuid,numeric,text) from public, anon;
revoke execute on function public.cyber_provider_update_order_status(uuid,text,text) from public, anon;

revoke execute on function public.customer_create_cyber_order(text,uuid,numeric,text,text,text,text,text,text,numeric,numeric,text,jsonb) from public, anon;
revoke execute on function public.customer_list_cyber_orders() from public, anon;
revoke execute on function public.customer_decide_cyber_quote(uuid,text,text) from public, anon;

revoke execute on function public.admin_list_cyber_providers() from public, anon;
revoke execute on function public.admin_list_cyber_services() from public, anon;
revoke execute on function public.admin_list_cyber_products() from public, anon;
revoke execute on function public.admin_list_cyber_orders() from public, anon;
revoke execute on function public.admin_list_cyber_profile_changes() from public, anon;
revoke execute on function public.admin_review_cyber_provider(uuid,text,text) from public, anon;
revoke execute on function public.admin_review_cyber_service(uuid,text,text) from public, anon;
revoke execute on function public.admin_review_cyber_product(uuid,text,text) from public, anon;
revoke execute on function public.admin_verify_cyber_order_payment(uuid,text,text) from public, anon;
revoke execute on function public.admin_get_cyber_settings() from public, anon;
revoke execute on function public.admin_update_cyber_settings(numeric,numeric,numeric,text) from public, anon;
revoke execute on function public.admin_review_cyber_profile_change(uuid,text,text) from public, anon;

revoke execute on function public.get_customer_payment_destination(text) from public, anon;

grant execute on function public.cyber_provider_get_own_account() to authenticated;
grant execute on function public.cyber_provider_submit_application(text,text,text,text,text,text,text,text,numeric,numeric,text,text,text,text,text,text,text[]) to authenticated;
grant execute on function public.cyber_provider_submit_profile_change(jsonb) to authenticated;
grant execute on function public.cyber_provider_list_services() to authenticated;
grant execute on function public.cyber_provider_save_service(uuid,text,text,text,text,numeric,text,boolean,boolean,boolean) to authenticated;
grant execute on function public.cyber_provider_list_products() to authenticated;
grant execute on function public.cyber_provider_save_product(uuid,text,text,numeric,numeric,text,text,text) to authenticated;
grant execute on function public.cyber_provider_list_orders() to authenticated;
grant execute on function public.cyber_provider_quote_order(uuid,numeric,text) to authenticated;
grant execute on function public.cyber_provider_update_order_status(uuid,text,text) to authenticated;
grant execute on function public.customer_create_cyber_order(text,uuid,numeric,text,text,text,text,text,text,numeric,numeric,text,jsonb) to authenticated;
grant execute on function public.customer_list_cyber_orders() to authenticated;
grant execute on function public.customer_decide_cyber_quote(uuid,text,text) to authenticated;
grant execute on function public.admin_list_cyber_providers() to authenticated;
grant execute on function public.admin_list_cyber_services() to authenticated;
grant execute on function public.admin_list_cyber_products() to authenticated;
grant execute on function public.admin_list_cyber_orders() to authenticated;
grant execute on function public.admin_list_cyber_profile_changes() to authenticated;
grant execute on function public.admin_review_cyber_provider(uuid,text,text) to authenticated;
grant execute on function public.admin_review_cyber_service(uuid,text,text) to authenticated;
grant execute on function public.admin_review_cyber_product(uuid,text,text) to authenticated;
grant execute on function public.admin_verify_cyber_order_payment(uuid,text,text) to authenticated;
grant execute on function public.admin_get_cyber_settings() to authenticated;
grant execute on function public.admin_update_cyber_settings(numeric,numeric,numeric,text) to authenticated;
grant execute on function public.admin_review_cyber_profile_change(uuid,text,text) to authenticated;
grant execute on function public.get_customer_payment_destination(text) to authenticated;
