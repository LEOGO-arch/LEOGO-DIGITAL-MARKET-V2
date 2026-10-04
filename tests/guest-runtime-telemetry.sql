-- Run only in an isolated staging database with artificial records.
-- Never use production for flood/forged-report tests. All test inserts roll back.
begin;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select set_config('request.jwt.claim.sub','',true);
do $test$
declare r jsonb; fp text; e private.system_runtime_error_events%rowtype; count_before integer;
begin
 select count(*) into count_before from private.system_runtime_error_events;
 r:=public.record_system_runtime_error('customer','health','http_error','phase1 artificial fake Critical','rpc:artificial_test',null,'/','/rest/v1/rpc/artificial_test',null,null,'admin','client-one','critical','{"status":400,"method":"POST"}');
 assert r->>'ok'='true'; fp:=r->>'fingerprint';
 select * into e from private.system_runtime_error_events where fingerprint=fp order by recorded_at desc limit 1;
 assert e.severity='warning'; assert e.user_type='guest'; assert e.metadata->>'report_trust'='client_unverified';
 r:=public.record_system_runtime_error('customer','health','http_error','phase1 artificial fake Critical','rpc:artificial_test',null,'/','/rest/v1/rpc/artificial_test',null,null,'admin','client-two','critical','{"status":400}');
 assert r->>'deduped'='true';
 r:=public.record_system_runtime_error('customer','health','js_error','phase1 artificial TypeError: bad collection',null,'TypeError','/',null,null,null,'guest','client-three','critical','{}');
 assert r->>'ok'='true';
 r:=public.record_system_runtime_error('customer','health','http_error','phase1 artificial HTTP 500','rpc:artificial_test',null,'/',null,null,null,'guest','client-four','critical','{"status":500}');
 assert r->>'ok'='true';
 r:=public.record_system_runtime_error('customer','health','http_error','phase1 artificial@example.invalid +254700000000 access_token=SECRET_A passport=AB1234567 account_number=900123 national_id=12345678 eyJabcdefghijk.abcdefghijk.abcdefghijk https://example.invalid/private.pdf','rpc:sb_secret_FAKE_OPERATION','sb_secret_FAKE_CODE','/','https://example.invalid/private.pdf',null,null,'guest','client-five','warning','{"status":401,"secret":"DO_NOT_STORE"}');
 select * into e from private.system_runtime_error_events where fingerprint=r->>'fingerprint' order by recorded_at desc limit 1;
 assert e.message !~ 'artificial@example|254700000000|SECRET_A|AB1234567|900123|12345678|eyJabcdefgh|private.pdf';
 assert e.error_code is null; assert e.operation is null; assert e.source is null; assert e.metadata->>'status'='401'; assert not e.metadata ? 'secret';
 r:=public.record_system_runtime_error('invalid','health','http_error','phase1 malformed',null,null,null,null,null,null,null,null,null,'{}');
 assert r->>'reason'='invalid_portal';
 r:=public.record_system_runtime_error('customer','health','http_error','phase1 malformed',null,null,null,null,null,null,null,null,null,'[]');
 assert r->>'reason'='invalid_metadata';
 for i in 1..70 loop
  r:=public.record_system_runtime_error('customer','health','http_error','phase1 artificial flood '||i,'rpc:artificial_test',null,'/',null,null,null,'guest','rotating-client-'||i,'warning','{}');
 end loop;
 assert r->>'rate_limited'='true';
 assert (select count(*) from private.system_runtime_error_events)-count_before<=60;
end $test$;
rollback;
