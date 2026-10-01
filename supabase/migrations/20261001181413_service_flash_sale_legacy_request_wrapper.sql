
create or replace function public.customer_create_service_request(
  p_service_id uuid,
  p_request_type text,
  p_request_details text,
  p_service_location text,
  p_nearest_landmark text default null,
  p_preferred_date date default null,
  p_payment_reference text default null,
  p_preferred_time time default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  return public.customer_create_service_request(
    p_service_id,p_request_type,p_request_details,p_service_location,p_nearest_landmark,
    p_preferred_date,p_payment_reference,p_preferred_time,
    null,null,null,null,null,null,null
  );
end
$function$;
