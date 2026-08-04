<!-- apps/web/scripts/reentry-compass/README.md -->

# Re-entry Compass Phase 0 probes (tasker/43)

Read-only prod probes + the deterministic offline packet generator behind
`docs/product/reentry-compass-phase0-evidence-2026-08-04.md`.

Run from this directory (reads `apps/web/.env` service-role key; writes to `./out`,
override with `OUT_DIR`):

1. `node probe1-recon.mjs` — table counts, log distributions, column recon
2. `node probe2-episodes.mjs` — dumps raw pulls, detects ≥72h return episodes, baseline advance rates
3. `node probe3-eligibility.mjs` — tasker/43 eligibility funnel (re-run monthly; Compass revisit trigger = ≥15 external users/month in the 3–30d window)
4. `node generate-packets.mjs` — deterministic Compass packets (no LLM)
5. `node render-packets.mjs` — per-packet markdown + evidence appendix for blind scoring

`./out` contains real user project text — never commit it.

Known harness debts (found via blind scoring, must fix before reusing replays):

- evidence renderer filters tasks by CURRENT deleted flag, hiding tasks that were alive at as_of;
- packet source metadata leaks CURRENT `state_key` into as-of packets;
- authored-orientation fallback misses "What this is" one-liners and START HERE-format docs (~10 packets omitted usable orientation).
