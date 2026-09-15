# LEOGO DIGITAL MARKET V2 — Development Rules

## Mandatory workflow
1. SPECIFICATION
2. BUILD
3. TEST
4. USER APPROVES
5. LOCK
6. NEXT

Do not skip approval before locking a module.

## Clean rebuild rule
LEOGO DIGITAL MARKET V2 is a clean rebuild. V1 may be used only as reference material. Do not create duplicate competing versions of the same feature.

## Locked modules
A locked module is treated as stable. Do not modify it without:
- documenting the reason for the change;
- identifying affected dependencies;
- running regression tests;
- obtaining user approval before re-locking.

## Security rules
- Never place a Supabase service-role key or other privileged secret in frontend code.
- Protect sensitive data with appropriate Supabase RLS and controlled server-side/RPC operations.
- Customers must not be able to alter payment records or protected historical transaction data.
- Premium/private information must not be publicly exposed or accessible by URL/UI bypass.

## Quality rules
Each module must be checked for:
- happy path;
- invalid input;
- unauthorized access;
- refresh;
- logout/login;
- mobile and desktop layouts;
- slow or failed requests;
- database correctness;
- related notifications;
- duplicate clicks/submissions;
- duplicate scripts/forms/implementations.

## Scope control
Only implement the approved step. Do not silently build later modules or introduce unrelated functionality.
