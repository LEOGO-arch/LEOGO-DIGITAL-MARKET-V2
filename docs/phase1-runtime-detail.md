# Phase 1D — sanitized HTTP diagnostics

Current baseline: `acde466b4e03bed61a00dda8ca4afd4efd853e31`. Supports LEOGO-SELL-001 and LEOGO-DIAG-001. Reproduction: current fetch wrapper records status-only messages and no Supabase/PostgREST code; live Seller telemetry confirms that detail loss.

Smallest fix: asynchronously inspect a response clone, allowlist a short error code, sanitize its message and preserve status/method/operation/portal/module/page/time. No body details/hints, request payloads or headers enter telemetry. The caller receives its original response without waiting or consuming its body. Non-JSON failures retain the generic diagnostic and genuine 401/500 events remain reported. Private Storage paths are reduced to bucket operation; quoted SQL values, URLs, phone/email-like values, keys/tokens and labelled private credentials are scrubbed before truncation. Existing session tokens are used only as Authorization transport for the telemetry RPC and never included in its payload.

Changes: `js/runtime-monitor.js` and its cache version in the five portal entry HTML files, plus tests/documentation. No business-module/RPC/table/migration changes. The recorder's existing signature accepts this payload. Server-side sanitation/severity/quota changes are a separate draft migration PR.

5 Node tests pass for sanitized JSON errors, caller response preservation, 401 code retention, non-JSON 500, private Storage paths and avoiding recursion. JS syntax/diff checks pass. Dependencies: native Fetch Response.clone/json, existing optional Auth clients, record_system_runtime_error. Regression risk: monitoring must never delay/break requests; response JSON parsing may complete after the original request. Full desktop/mobile browser telemetry, network-loss and staging authenticated ingestion checks remain pending. Production remains unchanged and its current incidents are neither deleted nor suppressed.

## Isolated staging follow-up

PR58–61 were integrated on current main acde466b4e03bed61a00dda8ca4afd4efd853e31. The Customer HTML cache conflict was resolved by retaining both Health and monitor versions. Runtime test endpoints now derive the configured public project URL, allowing the same assertions against an isolated frontend. All 20 integrated focused Node tests passed. Staging authenticated APIs provide exact P0001/42501/PGRST301 details; deployed browser ingestion and desktop/mobile verification remain blocked on private owner sign-in. No production deployment.
