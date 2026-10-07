-- Restrict internal transactional SMS helpers to database-owned execution paths only.
revoke all on function private.dispatch_order_sms_job(uuid) from public, anon, authenticated;
revoke all on function private.dispatch_order_sms_job_trigger() from public, anon, authenticated;
revoke all on function private.retry_due_order_sms() from public, anon, authenticated;
revoke all on function private.enqueue_pickup_order_sms(uuid,text) from public, anon, authenticated;
revoke all on function private.enqueue_sms_when_rider_arrives_at_station() from public, anon, authenticated;
revoke all on function private.enqueue_sms_when_station_receives_parcel() from public, anon, authenticated;
