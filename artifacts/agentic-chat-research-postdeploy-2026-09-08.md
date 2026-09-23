<!-- artifacts/agentic-chat-research-postdeploy-2026-09-08.md -->

# Research post-deployment verification — September 8, 2026

The deployment is healthy and focused-document loading is fixed. Public search and visits work in production. The complete workflow is **not yet clear**: a recoverable research failure still crashes provider continuation. That defect is fixed locally with regression coverage and requires another deployment.

## Deployed version and scope

- Repository and Railway worker release: `6db13144778170bcd6e658837bf6cf23e66cff62`.
- Railway agentic-chat deployment: `bba8d51d-bf7d-445c-aca2-4794237babf1`, SUCCESS, four running instances in the deployment inventory.
- Vercel production deployment serving build-os.com: `dpl_5QXJjQkGkmo6AFYvUa3ZAvKDjkvh`, Ready. Vercel inspect did not expose commit metadata; production prompt snapshots independently confirm the new prompt rules.
- Worker health checked at `2026-09-08T19:34:38.223Z`: healthy, correct release, database connected, zero consecutive claim failures, realtime connected, recovery healthy, zero active turns on the responding instance.
- Production checks used the signed-in web UI and read-only database inspection. Two QA chat turns were created. No project mutation tools were called. The focused document remains 155 characters, last updated `2026-09-07T15:59:56.227369Z`, MD5 `ac68202cf900304ceede81b9e6c3d4ef`.

## Production evidence

Project: `3128fd62-ab7c-43d0-b7ed-f343cd2d838a` — Pistol Shooting Client Website.

Focused document: `7558d92f-768e-41bf-88ba-10d2dd966d4f` — Meeting notes Sept 7.

QA session: [production audit](https://build-os.com/admin/chat/sessions?chat_session_id=ea16b253-42c9-4435-84c4-00b9cdbff99d).

| Check                                                | Result               | Evidence                                                                                                                                         |
| ---------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Exact focused document in initial context            | Passed               | Both QA prompt snapshots contain the full 155-character document in a system message. Neither turn called document-detail or section-read tools. |
| New research policy and skill selection              | Passed               | Both snapshots include “Workspace reads do not disable web research”; neither preloads cold_email.                                               |
| Automatic authorization of public queries            | Passed               | Real search-review calls and successful Tavily searches occurred with the private document already loaded.                                       |
| Public search → authorized page visit → cited answer | Passed for execution | Turn `f3fb0de6-282b-4058-afd9-b7b10bb8dbcb`, completed in 28.8 seconds with two successful tools and a final answer.                             |
| Denied page visit → graceful answer                  | **Failed**           | Turn `35f3e826-4203-468e-99d2-6ec4cbbc1250`, failed after 17.0 seconds with `provider_tool_feedback_kind_mismatch`.                              |
| UI tool status                                       | Passed               | The failed visit shows Failed while the two successful searches show Completed. The second turn shows a completed search and visit.              |
| Project data preservation                            | Passed               | Changes tab shows zero entries; document modification time and content checksum remain unchanged.                                                |

First QA request: summarize the decisions still missing from the focused notes and research Mailchimp limits/pricing using official sources, keeping the answer in chat and changing no project records.

The model first made two successful public searches. Their results did not contain `https://mailchimp.com/pricing/`. It guessed that address for web_visit, so the URL authorization check correctly denied it. The worker persisted a failed read receipt. The provider then rejected that receipt rather than continuing the answer; there is no assistant message for this turn. Snapshot: `390a030d-274c-55fe-b5f7-e4c47ed089ea`.

Second QA request explicitly directed a search with `include_domains: ["mailchimp.com"]`, followed by opening one exact returned URL. The search succeeded (5,852 ms, normalized to four results), and `https://mailchimp.com/pricing/marketing/compare-plans` succeeded (178 ms, HTTP 200, followed its safe redirect to the trailing-slash URL). The answer cited returned official sources. Snapshot: `d34278fb-a296-53da-be1e-c8b3aea2cba7`; assistant message: `cbb1d286-9bb5-4b49-aeb0-463a70d2c5ad`.

## Local correction prepared after the live check

`apps/worker/src/workers/agentic-chat/provider/feedback.ts` required `call.kind === 'mutation'` for every `known_execution_failure`, even though the executor now uses that failure kind for recoverable reads. Removed that obsolete restriction. Tool-call ID, tool name, exact canonical arguments, error text, category, and payload consistency are still validated. No search authorization or safe-fetch checks were removed.

`apps/worker/src/workers/agentic-chat/turn/turn-executor.ts` now distinguishes a denied page URL in its user-facing error. The model-only feedback explains how to obtain an authorized page through a targeted domain search. Other denial/unavailability cases retain the existing bounded failure guidance.

`apps/web/src/lib/services/agentic-chat-lite/prompt/situational-rules.ts` now tells the worker to use include_domains for official sources and search for a missing page instead of guessing its path. This prompt improvement is guidance, not a deterministic guarantee of model source selection.

Regression coverage:

- Actual provider continuation after a successful search followed by a failed visit or failed search; successful evidence remains available and the final response completes.
- Failed-read identity mismatches, contradictory error payloads, and empty errors remain rejected.
- Executor persists denied visits, provides actionable model-only recovery guidance, and completes the response.
- Existing partial-mutation recovery and other provider/executor behavior remain covered.

The two new provider cases failed with the exact production error before the fix. The previous executor tests mocked continuation and therefore did not catch this integration boundary.

Validation: **224 tests passed** across the provider (114), executor (77), feedback (6), and situational prompt (27) test files. Worker typecheck passed. Formatting and git diff whitespace checks passed. No deployment was performed during this verification.

## Follow-up work

1. **Deploy this local correction and recheck the failure path.** Redeploy the worker for the crash/recovery correction and web for source-selection guidance. A blocked lookup must produce a completed answer or an authorized subsequent search, retain successful evidence, show the failed tool honestly, and leave project data unchanged. Until that passes against the next release, the failure path is locally verified only.

2. **Fix retry intent for brainstorming/research.** The user's post-deploy `ok retry this` turn `3206de31-db11-4173-b145-c188cd9601c2` in session `177eaae4-3da0-4be5-aef1-daa005411e09` declared a document-update contract, repaired its missing content field, then the contract reviewer asked whether to append or replace. It never researched or answered the earlier brainstorming request. Its prompt contains the focused document and no legacy “save all research” or implicit-capture instruction. Add a semantic replay of the original user message plus retry, and ensure a prior model proposal does not turn a retry into an unrequested edit. Also retain coverage for retries of explicitly commissioned edits. The exact semantic cause is not yet isolated; do not fix this by bypassing write review.

3. **Improve page extraction and pricing claim precision.** The successful visit received 786,286 HTML bytes but returned only 8,000 characters, with substantial duplicated navigation before the pricing content and `truncated: true`. The answer added billing/renewal interpretations that were not fully established by the extracted text. Prefer main content, preserve pricing-table relationships/currency/conditions, and require another source or an explicit uncertainty statement when dynamic prices or renewal terms are missing. Search snippets and fetched pages also presented different currencies, so source locale needs attention.

4. **Track the intermittent acting-model route failure.** The user's retry recorded a 404 “No endpoints found” for `deepseek/deepseek-v4-flash`, then succeeded via `deepseek/deepseek-v4-flash-20260423`. This was recovered and is not the research crash, but adds latency and belongs with the existing production model-routing work.

These are targeted canaries, not a broad production reliability or answer-accuracy certification.
