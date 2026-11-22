-- Staff provisioning reads active locations through the secure service-role client.
-- Restrict the grant to only fields read by admin-create-staff. No writes or RLS changes.
grant select (code,name,is_active) on table public.kenya_counties to service_role;
grant select (code,name,county_code,is_active) on table public.kenya_subcounties to service_role;
