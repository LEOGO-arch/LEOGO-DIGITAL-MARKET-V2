# LEOGO DIGITAL MARKET V2

**Everything you need deliver at your Door Step**

## Project status

- Customer Front: Phase 1 foundation is implemented and currently locked against redesign.
- Admin Control Center V1: Stage 1 foundation and Stage 2 Approval Center are implemented for review.

This repository is the clean rebuild of LEOGO DIGITAL MARKET V2. V1 is reference material only and must not be copied as competing implementations.

## Build rule
Every module follows:

**SPECIFICATION → BUILD → TEST → USER APPROVES → LOCK → NEXT**

Locked modules must not be changed casually. Any required change to a locked module must be documented, regression-tested, and approved before proceeding.

## Repository structure
- `index.html` — locked Customer Front.
- `admin/` — separate, protected Admin Control Center.
- `assets/` — images and icons.
- `css/` — stylesheets.
- `js/` — application JavaScript.
- `supabase/migrations/` — versioned database migrations.
- `docs/` — project development rules and supporting documentation.

## Development principles
- No duplicate or competing implementations.
- Keep authentication, database, RPC/server operations, and UI responsibilities separated.
- Sensitive operations must be protected server-side/RPC and by appropriate database policies.
- Never expose Supabase service-role secrets in frontend code.
- Preserve historical transaction records and totals once recorded.
- Test desktop and mobile layouts and the required failure/authorization cases before locking a module.

## Admin V1 scope

Admin V1 reuses the production Supabase customer, wallet, Premium, accommodation and pickup-station foundation. It adds protected Admin roles, a consolidated Approval Center, central business details, multiple payment destinations, function-to-account assignments and an immutable audit trail. Modules whose production ledgers do not yet exist remain visibly reserved rather than creating duplicate data systems.

See `docs/admin-control-center-v1.md` for connected modules, security rules and testing notes.
