-- STAGING ONLY: Supabase default table grants may include write privileges.
-- Remove them; all simulation creation is constrained by the admin RPC.
revoke insert,update,delete,truncate,references,trigger on public.rent_advance_simulations from public,anon,authenticated;
grant select on public.rent_advance_simulations to authenticated;
