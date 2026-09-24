<!-- docs/founder/jev-warm-door-probe-2026-09-18/FINDINGS.md -->
<!-- doc-status: point-in-time -->

# Findings from the three Jev runs of 18 Sep 2026

Four runs, 480 requests, $0.056 total, zero failures. Every control passed on every run.

## 1. Probe 1 (100 strategies × 10 questions) was scoped wrong, and its headline did not survive

What was right: anchors, twins, three repeats, dry-run-by-default, weights applied in code. What was wrong:

- Seven of ten questions were forecasts. TypeSafe says Jev is built for judging evidence, not predicting. The $1M column compressed to 0.11–0.37 and "sell your gear" landed next to "change nothing".
- The profile was wrong on load-bearing facts: it said "paid client history is thin" (DJ has three clients) and had no job-search outcomes (DJ has interviewed for FDE roles and failed technical rounds on systems engineering).
- "Will you actually do it" keyed on one profile line and flattened every action to 0.35 ± 0.1. It measured DJ, not the action.
- Head-to-head over 100 candidates spread probability too thin and favored big swings the per-action scoring penalized.
- Repeats were nearly wasted: run-to-run wobble was 0.04. Two repeats suffice; spend the budget on state variants instead.

**Re-score with the corrected profile (top 25, $0.008):** every career action fell 0.08–0.19 in composite. The "$125/hr 1099 through a former colleague" row collapsed (composite 0.418 → 0.232; missing-prerequisite 0.34 → 0.75) because the Curri network is not active. The warm operator moves (vet-to-vet 0.334 → 0.292, walk-ins 0.314 → 0.287) held. The cold Bid Desk sale fell below "change nothing". New top tier: pitch the recon trainer he knows (0.325), first AI engineer at a Baltimore mid-size company (0.324), remote senior role (0.312), annotation cash (0.292), vet-to-vet (0.292), walk-ins (0.287).

## 2. Iteration 2: 50 veteran-owned prospects on evidence questions ($0.011)

Design: named businesses with sourced records; 8 evidence questions + 2 typed picks (revenue band, pitch angle); no forecasts; distance in code. Controls 15/15; reworded twin within 0.03; median wobble 0.028.

Top of the list (composite): Dvorak Electric, Dundalk, hiring an estimator (0.746); FiberPlus, Jessup, hiring a project estimator (0.713); Brothers Flooring, Annapolis, hiring an ops manager (0.642); SanDow Construction, downtown, owner reachable (0.639); Kanga Roof, Columbia (0.631); Valor Home, Annapolis (0.620); Stolar Construction, Hanover, 10 min, owner is the estimating contact (0.620).

Marine-owned: Charm City Builders (#14), RightDirection Technology (#23), Severn Excavation (#25, 10 min, owner-led), Tidewater Refrigeration (#26, owner reachable 0.97).

Data gaps the scoring exposed: revenue band unknown for 34 of 50 (scout found no staff or facility signals); warm path flat at "both veterans" for 45 of 50 because DJ belongs to no room yet; eMMA's VSBE directory is not scrapeable and needs a browser session; seven records are directory-only and need a phone check.

## 3. Cash probe: 33 actions for a household with under three months of runway ($0.009)

Design: structural questions (first step goes to someone he knows; requires contacting strangers; has a forcing function; pays inside 30 days if it works; pays monthly if it works; uses existing assets; concrete and countable; missing prerequisite) plus the two money forecasts kept for comparability. Anchors in the right places; twins within 0.08.

| #   | action                                                                                   | composite | note                                        |
| --- | ---------------------------------------------------------------------------------------- | --------- | ------------------------------------------- |
| 1   | Convert the wealth manager's social push into a $1,500/mo retainer, first month up front | 0.558     | warm 0.92, pays in 30d 0.90, recurring 0.87 |
| 2   | Subcontract on the co-founder's backlog, paid weekly                                     | 0.527     | pays in 30d 0.83                            |
| 3   | $2,500 inbound follow-up automation for the financial analyst, 50% deposit               | 0.525     | pays in 30d 0.85                            |
| 4   | Co-founder split: he sells and diagnoses, DJ builds; leave with two clients              | 0.520     | H2H fastest $10k: 65% (+17% for its twin)   |
| 5   | Shared pipeline: the 50 veteran-owned prospects through his front end                    | 0.516     | uses assets 1.00                            |
| 7   | $1,500 one-day triage setup to client referrals, deposit up front                        | 0.473     |                                             |
| 8   | Cadre owner introduces two veteran-owned businesses                                      | 0.461     |                                             |
| 22  | Change nothing (anchor)                                                                  | 0.189     | eleven real actions scored below it         |

Head-to-head "best first move this week": ask the three clients for one introduction each (27%), the wealth-manager retainer (18%), annotation work (13%), the co-founder split (9%).

Cold walk-ins (Severn Excavation and Stolar, 0.176; the eight-office walk-in day, 0.245; Kroeger and Arundel Electrical, 0.158) all score "requires contacting strangers" above 0.85 and "pays inside 30 days" near 0.10. They are month-two pipeline, not month-one cash. The chamber luncheon has the strongest forcing function on the list (0.89) but no money behind it. The systems-design interview sprint is last among real actions (0.127).

## What the three runs say together

Money in the next 30 days comes from the four people who already trust DJ: the wealth manager, the financial analyst, the Cadre owner, and the former co-founder. The veteran-owned list is what he brings to the co-founder meeting and what fills months two and three. Walk-ins and the luncheon are how the warm-path column stops being flat.

## 4. The 23 beachhead-board subcontractors, enriched and scored ($0.006)

Controls 15/15. With real association memberships and one Marine in the evidence, the warm-path column finally varies: Ashton Manor Environmental 0.66 (its Director of Operations is a retired USMC lieutenant colonel; PM and Estimator seats open now), Arundel Electrical Contractors 0.61 (service-disabled-veteran-owned, NECA member, 8 minutes from Glen Burnie, both domains dead), Anchor Mechanical 0.58.

Top of the merged list: Ashton Manor (0.612, hiring, owner on LinkedIn), Cole Roofing (0.583, 20 min, owner on LinkedIn), L.R. Willson (0.583, office is Gambrills at 15 min, not Baltimore), Arundel Electrical (0.580), Ruff Roofers (0.537; note it was bought by Audax in March 2025, so the "family since 1939" story is stale), Blue Horizon (0.524), Temp Air (0.520), Premier Concrete (0.516).

Corrections to the beachhead board from this pass: Ruff Roofers is private-equity owned; L.R. Willson is in Gambrills; Lynch Design Build is Harford County (50 min); Kroeger's headcount is genuinely unknown (aggregators say about 9, the earlier research said 50+); Clinton Electric's president conflicts across sources. Indeed, Glassdoor, ZipRecruiter, Bluebook and ZoomInfo all blocked fetches, so job-posting dates are unverified except where a company careers page rendered (Comer, Ashton Manor, Clinton, Ruff).

Merged board: 73 businesses, published as the Warm Door Call List.
