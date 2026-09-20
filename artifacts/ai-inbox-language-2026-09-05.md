<!-- artifacts/ai-inbox-language-2026-09-05.md -->

# AI Inbox language investigation

The screenshot matched the saved manager brief for **[QA RETEST 6d78728] Cedar House Renovation**. This was generated text in the database, rather than an interface locale change.

## Evidence

- Project: `5e97b8d7-d7f2-43e8-8382-da5915b96f86`.
- Review: `7e2af43a-76e4-4bea-b170-8d5e1ae33b81`, generated September 4, 2026 at 17:26–17:27 UTC.
- The source project description, task titles/descriptions, and document metadata were English.
- The drift detector saved Chinese title, rationale, preview, and evidence text in suggestion `3006f012-b8a3-488a-b91b-abd236cd8dd0`.
- The following manager synthesis also returned Chinese. Usage logs identify `deepseek/deepseek-v4-flash` through Novita for both calls.
- Neither shared detector nor brief-generation boundary specified an output language or validated the returned script. The precise reason the first model response switched language is not recorded; the downstream propagation is visible in the saved records.

## Completed live correction

Corrected the affected suggestion, source review brief, and inbox index text in one transaction, using original-value predicates to stop if the records changed concurrently. Approval states, IDs, evidence links, and executable operations were preserved. The review remains awaiting the user's decision.

Read-back verification confirmed all corrected fields match the prepared replacement, no Chinese remains in these three records, and the suggestion and inbox item remain pending. Refreshing AI Inbox loads the corrected text.

Before/after snapshots and the exact repair SQL are beside this report:

- `ai-inbox-language-2026-09-05-before.json`
- `ai-inbox-language-2026-09-05-after.json`
- `ai-inbox-language-2026-09-05-repair.sql`

## Prevention patch

Both shared Project Review generation boundaries now require English prose, preserve original entity names, and treat project content and detector findings as evidence rather than language instructions. A script check detects unexpected non-Latin letters, retries once, and refuses persistently invalid detector output. A failed detector is recorded as unchecked; a failed manager synthesis uses the existing deterministic fallback. Legacy detector prose is also filtered from fallback copy and attached evidence. Both attempts retain usage attribution and cancellation handling.

This is a targeted script safeguard, not a general language classifier: unexpected Latin-script languages depend on the explicit English prompt. It adds no extra LLM call to a valid response and at most one language retry to an invalid response. The patch applies to the light Project Review detectors and brief generators implicated here; the separate Complete Project Audit synthesizer is outside this patch.

Validation: 38 tests passed across `projectLoopGenerators`, `projectLoopDetectorFailure`, and `projectLoopDegradedRun`; worker TypeScript check passed. Tests cover language recovery, nested output rejection, legacy fallback contamination, preserved non-Latin source names, usage attribution, and cancellation.

The data correction is live. The code patch is local and still requires worker deployment.
