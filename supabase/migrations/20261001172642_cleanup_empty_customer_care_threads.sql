
delete from public.customer_care_threads t
where not exists(
  select 1 from public.customer_care_messages m
  where m.thread_id=t.id
);
