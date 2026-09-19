-- LEOGO V2 — remove anonymous execution from settlement / partner-notification SECURITY DEFINER RPCs.
revoke execute on function public.mark_partner_notification_read(uuid) from public, anon;
revoke execute on function public.mark_all_partner_notifications_read(text) from public, anon;
revoke execute on function public.seller_submit_settlement_account(uuid,text,text,text,text,text,text,text,text,boolean) from public, anon;
revoke execute on function public.admin_list_seller_settlement_accounts() from public, anon;
revoke execute on function public.admin_review_seller_settlement_account(uuid,text,text) from public, anon;
revoke execute on function public.admin_list_seller_settlements() from public, anon;
revoke execute on function public.admin_record_seller_settlement(uuid,uuid,numeric,text,text) from public, anon;

grant execute on function public.mark_partner_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_partner_notifications_read(text) to authenticated;
grant execute on function public.seller_submit_settlement_account(uuid,text,text,text,text,text,text,text,text,boolean) to authenticated;
grant execute on function public.admin_list_seller_settlement_accounts() to authenticated;
grant execute on function public.admin_review_seller_settlement_account(uuid,text,text) to authenticated;
grant execute on function public.admin_list_seller_settlements() to authenticated;
grant execute on function public.admin_record_seller_settlement(uuid,uuid,numeric,text,text) to authenticated;
