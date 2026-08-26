<!-- docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_COMPARATOR_2026-08-18.md -->
<!-- doc-status: point-in-time -->

# Agentic Chat Worker Phase 4 — Legacy Judgment Comparator

**Derived:** 2026-08-18  
**Purpose:** Pin the per-scenario legacy quality bar required by the 2026-08-18 Phase 4 exit
policy before any six-class worker battery is graded.

## Method

The source set is the four retained Phase 0 artifacts from 2026-07-31. One scenario attempt is
the tuple `(artifact run, scenarioId, repetition)`. An attempt passes only when every retained
turn in that tuple has `assertionPassed: true`. Each artifact requested three repetitions of all
eight scenarios, so every scenario has exactly 12 attempts across the four-run comparator.

This scenario-level grouping is the Phase 4 judgment bar. Turn-assertion totals are retained below
as an audit aid, but they are not substituted for scenario attempts: two scenarios have two turns,
and one failed `research-log-readback` attempt correctly stopped before its second turn.

## Comparator

| Scenario                         | Legacy scenario passes / attempts |  Pass rate | Retained turn assertions (supplementary) |
| -------------------------------- | --------------------------------: | ---------: | ---------------------------------------: |
| `project-catchup-cold`           |                           12 / 12 |    100.00% |                                  12 / 12 |
| `project-organize`               |                           10 / 12 |     83.33% |                                  10 / 12 |
| `research-log-readback`          |                           11 / 12 |     91.67% |                                  22 / 23 |
| `research-turn-finalizes`        |                           10 / 12 |     83.33% |                                  10 / 12 |
| `restraint-noop-and-ambiguity`   |                           12 / 12 |    100.00% |                                  24 / 24 |
| `task-complete-cold-reference`   |                           11 / 12 |     91.67% |                                  11 / 12 |
| `task-multi-update`              |                           12 / 12 |    100.00% |                                  12 / 12 |
| `task-reschedule-cold-reference` |                            9 / 12 |     75.00% |                                   9 / 12 |
| **All scenarios**                |                       **87 / 96** | **90.63%** |                            **110 / 119** |

For the six-class Phase 4 exit battery, the applicable rows are every row above except the two
`research-*` scenarios. Research remains Phase 5 work under the 2026-08-18 course correction.

## Source-run cross-check

| Artifact revision | Scenario passes / attempts | Turn assertions |
| ----------------- | -------------------------: | --------------: |
| `fa3987ba7`       |                    19 / 24 |         25 / 30 |
| `90d99599c`       |                    21 / 24 |         26 / 29 |
| `90796dc5e`       |                    23 / 24 |         29 / 30 |
| `0f63e47bb`       |                    24 / 24 |         30 / 30 |

## Source integrity

| Artifact                                                    | SHA-256                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `agentic_chat_worker_phase0_gate_2026-07-31_0f63e47bb.json` | `894adc1541ce4753966b43a11856af852bacc1ff5a26f3a802df7af85f26b067` |
| `agentic_chat_worker_phase0_gate_2026-07-31_90796dc5e.json` | `c8e13766cc5d91df1a4a187e09f3e40b42addc02d8c96ac9d2e1e263e99a52f7` |
| `agentic_chat_worker_phase0_gate_2026-07-31_90d99599c.json` | `540ee73be1ade074f77a38ed42f502999a5400efb3cf1397d069d778f2dd1557` |
| `agentic_chat_worker_phase0_gate_2026-07-31_fa3987ba7.json` | `6d5a41bf91ad3996861f08374849b06d2982961fc89b5be22a9c957213bebdc7` |

## Reproduction

```bash
jq -s -r '
  [.[] as $artifact | $artifact.turns[] | . + {artifactRunId: $artifact.runId}]
  | group_by(.scenarioId)[]
  | . as $turns
  | ($turns | group_by([.artifactRunId, .repetition])) as $attempts
  | [
      $turns[0].scenarioId,
      ([ $attempts[] | select(all(.assertionPassed)) ] | length),
      ($attempts | length),
      ([ $turns[] | select(.assertionPassed) ] | length),
      ($turns | length)
    ]
  | @tsv
' docs/plans/evidence/agentic_chat_worker_phase0_gate_2026-07-31_*.json
```
