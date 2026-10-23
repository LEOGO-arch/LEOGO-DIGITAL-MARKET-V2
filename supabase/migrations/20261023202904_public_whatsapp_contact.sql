-- Public contact only. Keep the full business settings row and its Admin RLS private.
create or replace function public.get_public_whatsapp_contact()
returns jsonb language sql stable security definer set search_path=''
as $function$
  select jsonb_build_object('whatsapp_number',whatsapp_number)
  from public.business_settings where id=1;
$function$;
revoke all on function public.get_public_whatsapp_contact() from public;
grant execute on function public.get_public_whatsapp_contact() to anon,authenticated;
