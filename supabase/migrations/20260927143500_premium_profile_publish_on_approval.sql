-- Publish approved Premium Profiles automatically.
-- First approval makes the profile available to the customer directory.
-- Partner can still switch availability off later from the Premium Partner dashboard.

create or replace function private.premium_profile_publish_on_approval()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.application_status='approved'
     and old.application_status is distinct from 'approved' then
    new.is_available:=true;
  elsif new.application_status in ('suspended','rejected','changes_requested') then
    new.is_available:=false;
  end if;
  return new;
end;
$$;

drop trigger if exists premium_profile_publish_on_approval
on public.premium_profiles;

create trigger premium_profile_publish_on_approval
before update of application_status
on public.premium_profiles
for each row
execute function private.premium_profile_publish_on_approval();

update public.premium_profiles
set is_available=true,
    updated_at=now()
where application_status='approved'
  and is_available=false;
