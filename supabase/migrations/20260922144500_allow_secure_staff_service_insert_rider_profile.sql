-- Allow the secure admin-create-staff Edge Function to insert Rider staff profiles.
-- The Edge Function authenticates the caller and requires an active Super Admin
-- before it uses the service role for this insert.
grant insert on table public.leogo_staff to service_role;
