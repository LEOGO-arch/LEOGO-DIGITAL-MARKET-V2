-- Repair System Diagnosis finding: anonymous Admin RPC exposure.
-- These functions already enforce private.is_leogo_admin(...) internally.
-- Remove anonymous/public EXECUTE while preserving authenticated Admin calls.

revoke execute on function public.admin_accommodation_summary() from public,anon;
grant execute on function public.admin_accommodation_summary() to authenticated;

revoke execute on function public.admin_list_accommodation_corrections() from public,anon;
grant execute on function public.admin_list_accommodation_corrections() to authenticated;

revoke execute on function public.admin_list_accommodation_providers() from public,anon;
grant execute on function public.admin_list_accommodation_providers() to authenticated;

revoke execute on function public.admin_list_accommodation_unit_approvals() from public,anon;
grant execute on function public.admin_list_accommodation_unit_approvals() to authenticated;

revoke execute on function public.admin_list_transport_provider_settlement_accounts() from public,anon;
grant execute on function public.admin_list_transport_provider_settlement_accounts() to authenticated;

revoke execute on function public.admin_list_transport_provider_settlement_requests() from public,anon;
grant execute on function public.admin_list_transport_provider_settlement_requests() to authenticated;

revoke execute on function public.admin_list_transport_provider_settlements() from public,anon;
grant execute on function public.admin_list_transport_provider_settlements() to authenticated;

revoke execute on function public.admin_pay_transport_provider_settlement_request(uuid,text,text) from public,anon;
grant execute on function public.admin_pay_transport_provider_settlement_request(uuid,text,text) to authenticated;

revoke execute on function public.admin_record_transport_provider_settlement(uuid,uuid,numeric,text,text) from public,anon;
grant execute on function public.admin_record_transport_provider_settlement(uuid,uuid,numeric,text,text) to authenticated;

revoke execute on function public.admin_review_accommodation_unit(uuid,text,text) from public,anon;
grant execute on function public.admin_review_accommodation_unit(uuid,text,text) to authenticated;

revoke execute on function public.admin_review_transport_provider_settlement_account(uuid,text,text) from public,anon;
grant execute on function public.admin_review_transport_provider_settlement_account(uuid,text,text) to authenticated;

revoke execute on function public.admin_review_transport_provider_settlement_request(uuid,text,text) from public,anon;
grant execute on function public.admin_review_transport_provider_settlement_request(uuid,text,text) to authenticated;

revoke execute on function public.admin_set_accommodation_provider_status(uuid,boolean,text) from public,anon;
grant execute on function public.admin_set_accommodation_provider_status(uuid,boolean,text) to authenticated;
