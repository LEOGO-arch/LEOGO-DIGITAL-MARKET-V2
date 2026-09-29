-- Storage RLS for Pickup Station proof images calls the private station resolver.
-- The private schema is not exposed through the API, but authenticated users need
-- EXECUTE privilege for the resolver to be evaluated inside the storage policy.
grant execute on function private.pickup_partner_station_id() to authenticated;
