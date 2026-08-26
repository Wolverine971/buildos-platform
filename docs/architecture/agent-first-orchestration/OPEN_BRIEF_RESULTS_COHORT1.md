<!-- docs/architecture/agent-first-orchestration/OPEN_BRIEF_RESULTS_COHORT1.md -->

# Open-brief evaluation — cohort 1 results

**Status:** instrument build in progress; no paid lane output has been generated or scored.  
**Pre-registration:** `OPEN_BRIEF_EVAL_METHODOLOGY.md` §4.5, recorded 2026-07-29 before execution.  
**Decision scope:** distributions + instrument validation only; no Go-class conclusion on this
denominator.

## Current gate

The corpus is not score-ready. DJ's veto packet is
`OPEN_BRIEF_DJ_VETO_PACKET_COHORT1.md`; until that pass is recorded, the mechanical readiness gate
blocks all lane execution.

## Planned denominator

- 8 brief × snapshot cells receive one three-lane triplet.
- The 2 swap-anchor cells receive two additional triplets each.
- Planned total: 12 triplets / 36 unique outputs.
- Maximum blind pairwise denominator per contrast: 12, before symmetric infrastructure/L0
  exclusions. The ~37-pair power target is not met.

## Machine scores by lane

_Pending execution._

| Lane                  | Attempted | Infra-valid | L0 clean | Feasibility check | Grounding ratio | Model-only cost | All-in cost | Latency |
| --------------------- | --------: | ----------: | -------: | ----------------: | --------------: | --------------: | ----------: | ------: |
| Production v2 control |         — |           — |        — |                 — |               — |               — |           — |       — |
| Phase A workflow      |         — |           — |        — |                 — |               — |               — |           — |       — |
| Single strong agent   |         — |           — |        — |                 — |               — |               — |           — |       — |

## Swap test

_Pending three runs per lane on ob-04 × project-alpha and project-beta. No cohort-1 threshold is
pre-registered._

## DJ blind readout

_Pending. Mapping remains sealed until the full packet is scored._

| Contrast                        | Wins | Losses | Ties | Eligible n | Binomial tail |
| ------------------------------- | ---: | -----: | ---: | ---------: | ------------: |
| Workflow vs control             |    — |      — |    — |          — |             — |
| Workflow vs single strong agent |    — |      — |    — |          — |             — |
| Single strong agent vs control  |    — |      — |    — |          — |             — |

## Instrument defects and invalid runs

_Record every defect, replacement, exclusion, and silent cap here. An infrastructure-invalid run
never becomes a model loss or a free win for another lane._

## Decision brief for DJ

_Pending scored cohort. Final language must remain “replicate / change / stop” at this denominator,
never Go._
