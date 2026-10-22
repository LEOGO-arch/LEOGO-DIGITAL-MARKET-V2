-- Supabase default grants may explicitly give anon EXECUTE, even after PUBLIC revoke.
revoke all on function public.admin_site_interaction_report(date,date) from anon;
grant execute on function public.admin_site_interaction_report(date,date) to authenticated;
