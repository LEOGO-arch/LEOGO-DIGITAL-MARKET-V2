
-- Storage RLS helper functions must be executable by the authenticated role
-- because storage.objects policies invoke them. They remain SECURITY DEFINER
-- boolean checks and do not expose private records themselves.
grant execute on function private.pickup_partner_can_read_loan_asset_media(text) to authenticated;
grant execute on function private.loan_private_document_is_referenced(text) to authenticated;
grant execute on function private.loan_asset_media_is_referenced(text) to authenticated;
