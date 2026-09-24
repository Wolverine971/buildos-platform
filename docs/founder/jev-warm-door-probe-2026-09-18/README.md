<!-- docs/founder/jev-warm-door-probe-2026-09-18/README.md -->
<!-- doc-status: point-in-time -->

# Warm Door probe (Jev iteration 2)

Iteration 1 (`../jev-30-day-probe-2026-09-18/`) asked Jev to forecast 100 abstract strategies against a
self-written profile. Seven of ten questions were forecasts, which TypeSafe says Jev is not built for,
and the profile was wrong on load-bearing facts (Tacemus client history, job-search outcomes). Its
one durable finding: **warm beats cold in every category** (a07 former colleague, a02 referrals,
f09 recon trainer, b10 vet-to-vet, b02 walk-ins).

Iteration 2 flips the design:

|                   | Iteration 1                                   | Iteration 2                                            |
| ----------------- | --------------------------------------------- | ------------------------------------------------------ |
| Unit scored       | a strategy ("pitch veteran-owned businesses") | a **named business** with researched evidence          |
| Question kind     | 7 forecasts, 3 evidence                       | 8 evidence, 2 typed choices, 0 forecasts               |
| Where the work is | Jev guesses the future                        | Claude researches; Jev judges the evidence; code ranks |
| Output            | tiers of strategies                           | a ranked call list with a pitch angle per business     |

Jev never knew anything beyond the state we gave it. Iteration 1 put self-description in the state;
iteration 2 puts sourced evidence in it. That is the whole change.

## Files

- `probe2.json` — profile v2 (short, three `TODO_DJ` fields), the offer, 10 questions, weights, 3 controls.
- `run_probe2.py` — dry run by default; `--live` sends with a $0.25 cap, `data_collection: deny`, no fallbacks.
- `prospects/*.json` — sourced records (see schema below). `prospects/SOURCING_NOTES.md` says which sources worked.
- `ground_truth.todo.json` — re-score of iteration 1's top 25 with corrected facts, via the patched
  `../jev-30-day-probe-2026-09-18/run_probe.py --review ground_truth.todo.json` (`profile_edits`, `profile_add`, `only`).
- `out/` (gitignored) — request dumps, raw results, `summary-*.md`.

## The ten questions

| id                   | type      | what Jev judges from the record                                                                         |
| -------------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| `veteran_verified`   | noul      | ownership evidence is a quote from the business, a veteran directory, or a certification                |
| `takes_inbound_work` | noul      | a recurring stream of quotes, bids, or bookings is observed                                             |
| `ops_strain_now`     | noul      | an open estimator/office/dispatch posting, slow-response reviews, or a stated backlog                   |
| `size_band`          | choice    | under_1m / 1m_to_5m / 5m_to_30m / over_30m / unknown, from staff and facility signals                   |
| `staffed_office`     | noul      | a place an owner can be met in person                                                                   |
| `warm_path`          | score 0–3 | none / both veterans / shared org or branch / named mutual contact                                      |
| `offer_fit`          | score 0–3 | how directly the Diagnostic addresses what the evidence shows                                           |
| `owner_reachable`    | noul      | owner named with a personal channel                                                                     |
| `evidence_grounded`  | score 0–3 | how much of the record is sourced                                                                       |
| `pitch_angle`        | choice    | which entry point the evidence supports: bid triage, unsold estimates, inquiry response, dispatch, none |

Distance is handled in code (Jev is weak at numbers): ≤25 min ×1.0, ≤35 ×0.85, else ×0.6.

## Controls

- `ctl-low` — a name with nothing verified. Should score near zero on veteran, office, reach, grounding.
- `ctl-high` — a synthetic ideal (Marine-owned electrical contractor in Glen Burnie, 45 staff, hiring an
  estimator, owner on LinkedIn, same chamber). Should score high everywhere and pick `bid_invite_triage`.
- `ctl-high-twin` — the same synthetic record reworded. Gaps over 0.15 mean wording is moving the score.

## What DJ has to fill in (three fields)

1. `probe2.json` → `what_he_does`: Tacemus client count, how many pay monthly, two reference names.
2. `probe2.json` → `rooms_and_memberships`: chambers, associations, church, veteran groups he actually belongs to.
   This is what turns a `warm_path` of 1 into a 2 for a given prospect.
3. `ground_truth.todo.json`: job-search numbers since Feb 2025 and the Tacemus facts. This decides whether
   iteration 1's "career wins" headline survives contact with reality.

## Run

```bash
python3 run_probe2.py --controls-only            # smoke test, 3 records
python3 run_probe2.py                            # dry run over prospects/*.json
python3 run_probe2.py --live                     # ~60 records × 2 repeats ≈ $0.01
```

## After the run

1. Read `out/summary-*.md`: controls first, then the ranked list.
2. Top 15 → Claude drafts a one-paragraph opener per business using the evidence in its record and the
   `pitch_angle` Jev picked. That is the "tailor the pitch" step; Jev cannot write it.
3. Group the top 15 by drive time into two walk-in routes (Glen Burnie/Pasadena/Severna Park; Annapolis).
4. Log outcomes (met / not met / meeting booked / passed) back into the record. Those labels are the
   only thing that can tell us whether Jev's ordering was any good.
