# LEOGO DIGITAL MARKET V2

**Everything you need deliver at your Door Step**

## Project status
Phase 0 — Project Setup

This repository is the clean rebuild of LEOGO DIGITAL MARKET V2. V1 is reference material only and must not be copied as competing implementations.

## Build rule
Every module follows:

**SPECIFICATION → BUILD → TEST → USER APPROVES → LOCK → NEXT**

Locked modules must not be changed casually. Any required change to a locked module must be documented, regression-tested, and approved before proceeding.

## Repository structure
- `index.html` — clean technical shell; Phase 1 UI is not implemented yet.
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

## Phase 0 scope
Establish the clean repository, development rules, migration structure, application shell, test/deployment foundations, and production-ready project setup before building marketplace functionality.

No customer dashboard, login system, seller tools, product catalogue, checkout, payments, delivery, services, or Premium module is implemented in this step.
