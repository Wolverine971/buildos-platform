<!-- docs/architecture/agent-first-orchestration/adr/0001-phase-a-evaluation-model-pins.md -->

# ADR 0001: Phase A evaluation model pins

- **Status:** Accepted for Phase A; route role amended after A1 Change evidence
- **Date:** 2026-07-24
- **Scope:** Disposable A1/A2 evaluation code only

## Context

Phase A tests an orchestration hypothesis. Allowing smart-llm or OpenRouter to silently change
the responding model would confound route accuracy, workflow quality, cost, and latency. The
repository's reviewed smart-llm catalog currently places GLM 5.2 first in the `powerful` JSON
profile and lists DeepSeek V4 Pro in the `quality` text profile.

The A0 control is not repinned: its observed model was DeepSeek V4 Flash with the `balanced`
profile. These pins apply only to the new evaluation lane.

## Decision

| Evaluation role            | Pinned model                   | smart-llm profile | Call policy                                             |
| -------------------------- | ------------------------------ | ----------------- | ------------------------------------------------------- |
| CEO route primary          | `google/gemini-3.1-flash-lite` | JSON `fast`       | Structured JSON, temperature `0.1`, exact-model request |
| CEO route bounded reviewer | `z-ai/glm-5.2`                 | JSON `powerful`   | Same prompt; only policy-triggered or primary failure   |
| CEO transition decisions   | `z-ai/glm-5.2`                 | JSON `powerful`   | Structured JSON, temperature `0.1`, exact-model request |
| CEO final synthesis        | `z-ai/glm-5.2`                 | Text `quality`    | Temperature `0.2`, exact-model request                  |
| Research specialist        | `deepseek/deepseek-v4-pro`     | Text `quality`    | Temperature `0.2`, exact-model request                  |
| Librarian                  | No model                       | N/A               | Deterministic snapshot-to-`ContextPacket` code          |

For CEO JSON calls, A1/A2 use smart-llm's single-request spend reservation to collapse the provider
route to the explicit model and disable smart-llm's internal parse retry. If Zod validation fails,
the caller may make exactly one bounded repair call using the same model.

After the first two A1 passes returned Change, route calls requested low reasoning effort for the
v3 rerun because GLM 5.2 had spent the 900-token output budget reasoning about long requests. The
experiment removed final JSON failures but materially worsened route latency and project-relative
classification consistency, so v4 restored the provider-default reasoning policy. The failed
mitigation remains recorded in the v3 report.

Prompt v4 then reached 70/72 correct routes with GLM 5.2 but missed both direct-path latency bounds
and included two double-timeout outcomes. The separately labeled fast-model pilots rejected Gemini
Flash Lite alone at 19/24 and DeepSeek V4 Flash at 17/24. Gemini nevertheless met the latency
budget and correctly handled every straightforward direct, workflow, and capability-gap pilot
case.

The amended route strategy is therefore `phase-a-route-review-v1`: Gemini Flash Lite runs first.
GLM 5.2 reviews only when the primary exhausts its bounded repair or returns `direct`/`clarify`
despite explicit research intent. The 24-call pre-pin pilot scored 24/24 with direct route latency
of 929 ms p50 and 1,200 ms p95. No other route invokes the reviewer. This role split is frozen
before the full 72-call confirmation; changing the review trigger, prompt, or pins requires a new
version and full rerun.

For text calls, the evaluation adapter must request the explicit model and record the actual
model and provider returned by smart-llm. A scored run whose actual model differs from the pin is
an infrastructure-invalid run: retain its spend in operational accounting, exclude it from the
quality denominator, and rerun it once the pin is available. Provider-node variation for the
same model is allowed and must remain visible in telemetry.

Every paid call records role, logical model ID, actual model ID, provider, profile, latency,
tokens, and cost. Provider failure is never converted into a scored fallback-model result.

### Evaluation data-policy exception — 2026-07-25

The first workflow attempt and its one permitted replacement established that OpenRouter has no
`deepseek/deepseek-v4-pro` endpoint compatible with SmartLLM's default `zdr: true` request. Both
attempts failed before researcher inference and are preserved as infrastructure-invalid evidence.

DJ approved non-zero-data-retention provider handling for the already anonymized Phase A corpus
and fixture on 2026-07-25. This approval preserves the frozen researcher pin. The implementation
must be an explicit evaluation-only opt-in, initially limited to the researcher request that needs
it; SmartLLM's default and production behavior remain `data_collection: deny` and `zdr: true`.
Actual provider/model identity and token usage must still be verified before a run can be scored.
No transport change or paid rerun occurred as part of this approval record.

### Amendments — 2026-07-25, after the Phase A audit

Recommended by [`PHASE_A_AUDIT_2026-07-25.md`](../PHASE_A_AUDIT_2026-07-25.md); DJ authorized the
audit's recommended changes on 2026-07-25. No pin changed. Four call-policy items did.

**Route prompt v5.** `phase-a-route-prompt-v4` reached 72/72 partly because it carried three
numbered scope rules that paraphrased three specific corpus items — one near-verbatim. v5 replaces
them with three general tests (unresolved project referent / self-contained / out of scope) and
adds an ordered first-match procedure for selecting the workflow reason code. This requires a full
72-call rerun; the v4 report remains canonical evidence for the fast-first latency mitigation,
which is unaffected.

**Reason codes are pinned behaviour for the comparison scenarios.** A2's `compileWorkflowStage`
branches on `reason_code`, so for C06/C07/C08 it is not a diagnostic — it selects the plan. It is
now gated at ≥25/27. Changing the reason-code taxonomy, the selection procedure, or the plan
mapping requires a new prompt version and a full rerun, exactly as a pin change would.

**A transition gate with one legal action no longer calls a model.** `transitionPolicy` computes
the allowed actions deterministically and offers exactly one in every non-failure path, so the
`powerful` JSON call was rubber-stamping a foregone conclusion at roughly $0.0016–$0.0033 and
several seconds per gate. Gates with a genuine branch (partial or failed stages) still reach GLM
5.2, and the run record now reports `transitionModelCalls` and `forcedTransitions` so the split is
visible. Phase A therefore does **not** test decision-gate reasoning; that is a Phase B claim.

**Pin verification is per role.** The harness previously accepted any of the five pins for any
call, so a researcher call that silently resolved to GLM 5.2 — the transition and synthesis pin —
would have scored. Every `ModelUsageEvent` now carries its `role`, an untagged event is itself
infrastructure-invalid, and each observed model is checked against that role's pin. This matters
most for the pending non-ZDR researcher opt-in, which touches exactly one role's transport.

## Consequences

- A1/A2 comparisons attribute behavior to a stable role/model assignment.
- Gemini Flash Lite handles routine route classification; GLM 5.2 carries the bounded ambiguous
  route reviews and later high-leverage CEO decisions. DeepSeek V4 Pro handles the larger research
  workload at a lower catalog price than GLM 5.2.
- The evaluation accepts reduced availability in exchange for causal clarity. Production
  fallback policy remains a separate Phase B decision.
- The blind judge model is deliberately not chosen here; DJ gate 4 freezes that mechanic before
  A2 and must use a model outside the compared role/model pair.
