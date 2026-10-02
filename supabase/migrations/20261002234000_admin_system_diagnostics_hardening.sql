-- Harden internal System Diagnostics helpers.
-- Public wrappers remain authenticated + Super Admin checked.

revoke execute on function private.verify_system_diagnostics_pin(text)
  from public,anon,authenticated;
revoke execute on function private.system_diagnostic_check(text,text,text,text,text,text,text,boolean)
  from public,anon,authenticated;
