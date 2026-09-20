<!-- artifacts/agentic-chat-postdeploy-4ac73bde7-fixes.md -->

# Agentic chat postdeploy fixes

Implemented locally on September 4, 2026, following the [assessment](./agentic-chat-postdeploy-4ac73bde7-assessment.md). Calendar configuration remains outside this change. No deployment, production mutation, or migration was performed.

## Duration minutes: supported shape and root cause

The existing tool call was correct:

```json
{ "props": { "duration_minutes": 120 }, "calendar_sync": "none" }
```

Task estimates belong in `props.duration_minutes`. The task create/update tools already described that shape, and production saved it correctly. The failure was in the contract/receipt vocabulary: the declared top-level `duration_minutes` never matched the nested value.

The nested field is now explicit in the tool schema. Task contracts canonicalize the older `duration_minutes` name to `props.duration_minutes`; reviewer field descriptions and executable-field validation understand that path. The ledger extracts the saved estimate and rejects mismatched, missing, failed, wrong-target, and subsequently overwritten values. Date storage and calendar behavior are unchanged.

## Other implemented changes

| Issue                                     | Local change                                                                                                                                                                                                                                                                                                                                                                   | Verification boundary                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing dependencies                      | Admit `link_onto_entities` on the project surface. Add `src_label`/`dst_label` references to reviewed creates, require one outcome per edge, bind returned IDs, and check endpoint kind, direction and relation before execution. Retain exact edge IDs/endpoints in receipts.                                                                                                 | Regression proves five creates plus three exact directed dependencies; reversed, wrong, duplicated-substitute, failed, and unbound edges do not satisfy the request. Existing adapter tests cover reuse of an existing edge. |
| No-heading document failures              | Admit the full-document reader on General Chat's fixed surface.                                                                                                                                                                                                                                                                                                                | Runtime membership and worker-projected surface checks pass.                                                                                                                                                                 |
| Start Here navigation                     | Both Start Here actions navigate to the existing canonical document page.                                                                                                                                                                                                                                                                                                      | Component tests assert the destination. Browser-visible content and Back navigation still need release verification.                                                                                                         |
| Plain IDs in retrieval answers            | Add canonical project/task/document references to successful tool evidence, using known IDs and project ownership. Keep references outside content truncation and tell the assistant to use Markdown links.                                                                                                                                                                    | Tests reject missing ownership, failed lookups and fake records embedded in document content/props. The model's final choice to include the links still needs a live check.                                                  |
| Overstated owner reports                  | Distinguish recorded facts, bounded search findings and unknown real-world status, including conclusions. Add concrete permit/todo guidance.                                                                                                                                                                                                                                   | Prompt checks pass; actual report wording remains a model-behavior acceptance test.                                                                                                                                          |
| Corrupted text during reviewer correction | Short descriptions summarize edit scope and refer back to the original request/source; they no longer serve as containers for exact replacement text.                                                                                                                                                                                                                          | Existing reviewer/document regression tests pass. Exact production document replay remains required.                                                                                                                         |
| Stale Start Here                          | Queue forced refresh on active project-chat close independently of classification, with an RLS access check. Refresh again after classification. Revision-specific dedup keys prevent older queued work from absorbing a new revision. Label known stale counts, reload on window focus/opening the brief, and recheck for up to 60 seconds after chat mutation notifications. | Close-route tests cover classification failure, no activity, inaccessible projects and General Chat. Worker tests cover TTL bypass and distinct revisions. UI tests cover stale labeling and refreshed content.              |
| Avoidable provider passes                 | Restore lazy initial contracts for the current `global`/`project` profiles. Complex-write guards and independent semantic review remain in place.                                                                                                                                                                                                                              | Full worker protocol suite passes. No production latency improvement is claimed.                                                                                                                                             |

Freshness detection compares the snapshot with timestamps of loaded source records; it is not a complete server-side dirty index. After the bounded recheck window, returning to the page or reopening the brief fetches the current document. Overlapping builds and long queue delays belong in the release check.

## Local validation

- Runtime: all **445 tests passed**; build and type check passed.
- Worker: full suite **1,782 passed, 12 skipped**. After the final revision-key and surface assertions, the affected snapshot/classifier/surface suites passed **14 tests**. Worker type check passed.
- Web: prompt suites **82 passed**; workspace/session suites **29 passed**. Svelte check: **0 errors, 0 warnings**.
- Svelte autofixer: no issues; existing binding/telemetry suggestions did not require unrelated refactoring.
- Formatting and whitespace checks passed for changed code. Existing unrelated workspace edits were preserved.

The sandbox initially prevented temporary PostgreSQL shared memory and HTTP sockets. The complete worker suite passed when rerun with those local test facilities available.

Measured worker opening tool schemas: General Chat **28,285 bytes**, project **34,360 bytes**. Project's full admitted schema is **38,463 bytes**, including the contract and relationship tools. Canonical system prose remains below its existing **12,850-character** cap; the measured value is **12,780**. Schema budget increases are explicitly documented in the tests.

## Release verification still required

Deploy matching web and worker builds and run fresh conversations against one release. Re-run the original battery with saved-state checks: five tasks/three directed edges/zero events; the 120-minute update without a failure footer; exact document replacement and preservation token; scoped owner-report claims; clickable retrieval references; Start Here visible destination and post-close freshness.

For latency, repeat the narrow update, ambiguity and selective-edit cases at least five times without harness retries. Record total time, time to useful text, provider attempts and route. Provider routing remains unchanged; the 68–99-second observations are not resolved by local unit tests.
