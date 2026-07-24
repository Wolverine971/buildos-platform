<!-- docs/architecture/agent-first-orchestration/A0_CONTRACT_REVIEW.md -->

# Slice A0 Contract Review

**Status:** Awaiting DJ gate 2
**Date:** 2026-07-24
**Implementation:** `packages/agent-orchestrator/src/contracts/`

## Draft-level decisions

- All persisted/model-facing core contracts use `schema_version: 1` and reject unknown versions.
- Objects are strict: unexpected model fields are rejected rather than silently stripped.
- `RouteDecision` and `TransitionDecision` are discriminated unions, so route/action-specific
  payloads are required and mutually exclusive.
- Route reason codes are closed and route-specific:
    - `direct`: `simple_read`, `status_summary`, `low_risk_direct_operation`;
    - `workflow`: `single_source_research`, `multi_source_research`,
      `context_research_recommendation`, `multi_step_synthesis`;
    - `clarify`: `ambiguous_request`, `ambiguous_scope`, `missing_required_context`;
    - `capability_gap`: `unsupported_capability`, `unavailable_agent`, `unavailable_tool`,
      `insufficient_permission`, `unsafe_operation`.
- Artifact payloads must be JSON values and are capped at 256 KB; artifact/digest summaries are
  capped at 1,000 characters.
- `WorkflowStageSpec` rejects duplicate keys, self-dependencies, unknown same-stage dependencies,
  and dependency cycles at the contract boundary.

## Leaf types for review

| Leaf                  | Draft shape                                                                                                      | Rationale                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `AcceptanceCriterion` | Discriminated `machine_checkable \| judgment`; machine-checkable criteria require `validator_id` and JSON config | Makes omission of deterministic validation explicit instead of silently accepting specialist self-grading |
| `AcceptanceResult`    | Criterion ID, verdict, `runtime \| agent` source, validator ID, details, evidence artifact IDs                   | Preserves which authority produced a verdict and the evidence it used                                     |
| `CapabilityGap`       | Gap kind, capability, description, blocking flag, optional resolution                                            | Makes unsupported work measurable and prevents vague fallback improvisation                               |
| `PermissionGrant`     | §10 mode, exact project UUIDs, canonical operations, network mode, artifact read/write types, expiry             | Carries the server-computed least-privilege intersection in an inspectable form                           |
| `ProvenancedFact`     | Fact UUID, statement, source, `as_of`, confidence                                                                | Keeps source identity and freshness beside every claim                                                    |
| `ProvenancedExcerpt`  | Excerpt UUID, bounded text, source, optional locator                                                             | Retains a verifiable fragment without moving full source material into context                            |
| `ArtifactReference`   | Artifact UUID/type/version plus bounded summary                                                                  | Supports selective loading instead of embedding full artifacts in digests                                 |
| `ArtifactProvenance`  | Derivation relationship plus typed source                                                                        | Makes quoted, summarized, derived, and generated content auditable                                        |
| `ArtifactDraft`       | Versioned type, summary, bounded JSON payload, provenance; no storage identity/lineage                           | Validates model output before persistence while leaving IDs/version lineage to storage                    |
| `RetrievalOption`     | Option ID, bounded read kind, canonical operation, label/reason, JSON arguments                                  | Describes a possible next read without granting authority to execute it                                   |
| `ProjectScope`        | Project UUID/name, `primary \| related` role, rationale                                                          | Makes cross-project context deliberate while retaining an understandable label                            |
| `DirectOperation`     | Canonical operation, nullable project UUID, JSON args, expected result, literal low risk                         | Keeps the direct lane declarative and below its risk ceiling                                              |

## Review calls

1. Approve or revise the 12 leaf shapes above.
2. Confirm that `ArtifactEnvelope` should continue matching §6.6 exactly (it has run/producer/
   supersedes IDs but no `artifact_id` of its own). Recommendation: add `artifact_id` before the
   durable persistence slice so a parsed persisted envelope is self-identifying.
3. Confirm that `ProjectScope.project_name` is useful denormalized display context; authorization
   remains keyed only by `project_id`.

No corpus queries, LLM calls, or baseline runs proceed until this gate is resolved.
