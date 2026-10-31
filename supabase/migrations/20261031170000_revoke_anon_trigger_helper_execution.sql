-- Prevent direct API execution of internal trigger helpers.
-- These functions are invoked by PostgreSQL triggers, not browser RPC calls.
revoke execute on function public.apply_aftersales_exchange_delivery_preference() from public, anon, authenticated;
revoke execute on function public.apply_transport_profile_base_pin_on_approval() from public, anon, authenticated;
revoke execute on function public.notify_aftersales_exchange_progress() from public, anon, authenticated;
revoke execute on function public.record_aftersales_exchange_status() from public, anon, authenticated;
revoke execute on function public.record_aftersales_return_completion() from public, anon, authenticated;
revoke execute on function public.validate_aftersales_exchange_original_item() from public, anon, authenticated;
