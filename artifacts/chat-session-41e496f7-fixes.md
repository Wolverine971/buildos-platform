<!-- artifacts/chat-session-41e496f7-fixes.md -->

# Chat reviewer cost fixes — 2026-09-04

Local implementation for session `41e496f7-c911-4c4f-b581-aba81a1200e5`. Nothing was deployed and historical usage rows were not rewritten. The original investigation is [here](chat-session-41e496f7-cost-review.md).

## What “removing the correction loop” means

The exported document-edit turn paid for three Luna contract reviews: the first identified missing edit fields, its correction copied exact replacement text into short prose fields, and another correction/review followed. Those calls cost **$0.00656313 combined**, rather than approximately one cent each.

The fix targets avoidable formatting and field repairs. It preserves independent semantic review, the binding between an approval and the exact reviewed contract, and independent re-review when a substantive correction changes that contract. Ordinary bounded repairs still exist.

The contract schema now asks for the changed fields on updates and tells the actor to reference the original request for exact wording. A document update with no changed fields is rejected by deterministic validation before semantic review; a title-only rename remains valid. Short reviewer correction fields likewise reference the original request instead of copying or abbreviating exact replacement text.

## Implemented

- **Reviewer configuration:** `AGENTIC_CHAT_REVIEWER_MODEL` and `AGENTIC_CHAT_REVIEWER_FALLBACK_MODELS` select the reviewer independently of the actor. An explicit policy has no hidden model fallbacks. Startup rejects uncatalogued models, models without tool support, and overlap with any actor route. Luna-specific provider ordering is applied only to Luna.
- **Rejected-start accounting:** requests rejected before an accepted stream, with no usage evidence, keep an unknown cost source and zero recorded token/cost estimates. The worker no longer invents prompt charges for those attempts. An accepted stream that loses its usage receipt still gets an explicitly estimated cost.
- **Current Luna estimates:** the catalog now uses $0.20 input / $1.20 output per million tokens, replacing $1 / $6. Provider-reported historical charges are unchanged. Sources: [OpenAI model page](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [OpenRouter model page](https://openrouter.ai/openai/gpt-5.6-luna-20260709), checked September 4.
- **Cost chart:** each row identifies the pass role and model, with separate “This call” and “Reported total” amounts. Only provider-reported charges accumulate; estimated and unknown costs remain visible separately. Provider-reported zero is preserved. Older timeline records recover cost evidence from their full usage rows.

In the supplied export, provider-reported charges total **$0.01810684**. The legacy recorded total of **$0.02093444** includes **$0.00282760** in estimates for two rejected DeepSeek starts. The chart distinguishes these amounts rather than treating the estimates as receipts.

## Cheaper-model evaluation and decision

**The default remains Luna and its existing fallback pool.** The proposed GLM default change was withheld after inspecting the model's actual corrected contracts.

Eight synthetic live scenarios exercised exact document editing, read-only intent, target ambiguity, instructions embedded in source material, scalar task corrections, document corrections, existing-task dependencies, and dependencies between newly created tasks. There were 12 provider calls totaling **$0.00722465**, with no BuildOS mutations.

Seven scenarios passed the stronger semantic checks. In the existing-task dependency case, GLM returned two corrections containing three bare link outcomes, then approved them without recording endpoint IDs, endpoint kinds, or relationship type. The original replay checked only the terminal tool name and incorrectly counted this as success. The replay now checks scope, fields, scalar values, counts, and directed dependency bindings. Rechecking the saved responses without more API calls correctly yields **7 passed / 1 failed**. [Compact evidence](chat-session-41e496f7-reviewer-evaluation.json).

Configuration support makes further candidate evaluation and rollout possible without another routing-code change. This eight-case contract replay is a minimum screen; a model replacing the entire semantic reviewer lane also needs mutation-review evaluation and production-like reliability checks. Passing a small synthetic suite would not by itself establish production readiness.

## Validation

- Worker Agentic Chat suite: **892 tests passed across 64 files**.
- Shared runtime contract/tool validation: **103 tests passed**.
- Model catalog/selection: **22 tests passed**.
- Worker source typecheck passed. Test typecheck remained below the repository's existing debt baseline.
- Admin chart/cost tests: **38 passed across four files**.
- Final web check: no errors in the changed chart/cost files, but **two unrelated errors** in concurrently added Libri files: `apps/web/src/lib/server/libri/catalog.ts:114` (`Uint8Array` / `BlobPart` mismatch) and `apps/web/src/routes/libri/+page.server.ts:10` (possibly undefined first result). Those files were left untouched.
- Changed worker source lint, formatting, and `git diff HEAD --check` passed.
- The opt-in GLM quality evaluation intentionally fails its dependency case; the default model switch is therefore withheld.

The Svelte autofixer could not run because automatic approval review rejected uploading proprietary component source to the external service. Local Svelte compilation, component tests, and the web check were used instead, with the unrelated final-check errors noted above.
