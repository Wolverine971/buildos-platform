<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_reply_os/evals.md -->

# Evals — cold_email_reply_os

Golden tasks per `../../EVALS_GUIDE.md`. Run B gets the shell (taxonomy + SLA matrix inline since 2026-06-11) plus all three references (`objection-route-table.md`, `numbered-fork-library.md`, `tactical-empathy-routes.md`) pasted verbatim. Load-path expectations below test which references a well-behaved agent loads at runtime — Task 1 should touch only the objection routes, Task 2 only the fork library.

---

## Task 1 — Classify-and-respond: "send me some info" brush-off

### Task prompt

> I got this reply to my cold email — how should I respond? I was thinking I'd send over our company deck and ask if she's free Thursday or Friday for a quick call while she's engaged.
>
> **My original email (sent Monday — she's one of 8 hand-picked target accounts):**
>
> > Subject: Pipeline reviews at Meridian
> >
> > Hi Dana — saw your post last week about Meridian's move to pod-based selling (the part about pipeline reviews getting noisier rang true).
> >
> > We mapped how six RevOps teams restructured pipeline reviews after going to pods — where deals stall and who actually owns the number. I wrote it up as a 2-page teardown.
> >
> > Want me to send the Meridian-relevant version?
> >
> > — Alex
>
> **Her reply (this morning):**
>
> > Thanks Alex. Sounds interesting — send me some info and I'll take a look when I get a chance.

### Delta markers

1. **M1 (classify-first):** Assigns exactly one taxonomy class by name — class 2 **Send info** ("send me some info" detection cue) — BEFORE drafting any response, per the classify-first discipline ("a route without a taxonomy class is not a route").
2. **M2 (brush-off recognized):** Reads "I'll take a look when I get a chance" as deferral language and routes it as the **send-me-info-as-brushoff** pattern (objection route table row), not as class 1 yes/interested — while keeping intent at medium-high, not writing her off.
3. **M3 (SLA cited):** States owner (sender or assistant) and first-response SLA (**same business day**) from the SLA matrix, and flags send-info as a same-day class explicitly.
4. **M4 (artifact, not brochure):** Refuses the company deck — sends the promised 2-page teardown (the Meridian-relevant version), citing the preserve-the-original-promise rule / "send the promised artifact, never a brochure."
5. **M5 (no call push):** Explicitly declines the Thursday/Friday call ask — pushing a call after weak interest violates the guardrail; reply-to-call is reserved for clear interest.
6. **M6 (response shape):** Draft follows the route row's shape — no label needed for the brushoff row, the artifact itself, and exactly ONE calibrated question. Never two CTAs (no deck + call combo, no artifact + meeting combo).
7. **M7 (route's calibrated question):** The single question is the route's active-vs-polite-no fork — "Should I close the loop after this, or is [pain] still live?" form — phrased as what/how, never "why."
8. **M8 (honest negative — no numbered fork):** Does NOT deploy a numbered fork from the fork library — the thread is not silent, and the one-fork-per-thread budget is preserved for a possible later ghosted-thread revival.
9. **M9 (output contract):** Output contains all contract fields: reply class, intent level, chosen route (named row), response draft, artifact to send, owner + SLA note, stop/follow-up rule, buyer-language log line.
10. **M10 (buyer-language log):** Logs the class plus the reply language **verbatim** ("Sounds interesting — send me some info and I'll take a look when I get a chance") as feed for `cold_email_learning_review`.

### Expected load path

- `skill_load(cold_email_reply_os, full)` — the taxonomy table, SLA matrix, and `## Output Contract` live outside the short-format parsed sections.
- References: `objection_routes` ONLY (workflow step 2 routes send-info-brushoff there for the route row and calibrated question).
- Should NOT load: `fork_library` (no silence to revive) or `tactical_empathy_routes` (reply is neither tense nor ambiguous; the brushoff row says no label needed). Loading either is an over-load usage failure even if the answer is right.

### Discovery probe

"Got a reply to my cold email saying 'send me some info' — what do I send back?" → catalog description matches on "classifying cold outreach replies into a 12-class taxonomy, routing objections… and answering within SLA."

---

## Task 2 — Ghosted-thread fork: two touches, no reply

### Task prompt

> Need advice. I emailed the Head of Engineering at Corvid Systems about our flaky-test triage tool — this is strategic outreach, one of eight target accounts I'm working by hand. First email went out 10 days ago, I sent a follow-up bumping it 5 days ago. Nothing back, not even an open I can confirm.
>
> I drafted touch three: "Hi Priya — just checking in on my note below. Any thoughts? I know you're busy but would hate for this to slip through the cracks!"
>
> Good to send, or should I do something else?

### Delta markers

1. **M1 (silence, not objection):** Treats this as silence revival (workflow step 7 — no reply exists to classify into the taxonomy), not objection handling; states that silence is the only dead state and a fork is the prescribed move.
2. **M2 (rejects "just checking in"):** Rejects the drafted touch by rule — "just checking in" is zero-content automation register, and "hate for this to slip through the cracks" leans guilt-adjacent (do not guilt; avoid generic checking in) — not as a mere style preference.
3. **M3 (correct fork):** Picks the **ghosted-thread fork** by name — explicitly not the qualification fork (this is not a first touch) and not the Hail Mary (the lead is quiet, not churned/long-dead).
4. **M4 (fork construction rules):** The drafted fork satisfies fork discipline: 3–4 mutually exclusive real buyer states, a dignified no/exit option ("wrong person / close the loop"), reply burden of one keystroke, light tone, and no second CTA.
5. **M5 (one fork per thread, ever):** States the rule explicitly — this is the only fork this thread will ever get; if it goes unanswered there is no second fork.
6. **M6 (cadence by mode):** Applies the **strategic** revival cadence (4 touches over ~7–8 days, then stop — Murray), so the fork is touch 3 and at most one touch remains — and does NOT apply the volume cadence (stop after touch 2, recycle) or the post-interaction 2-7-14-30 rhythm (she never engaged).
7. **M7 (redirect, not re-pitch):** Follow-up content redirects to the original email rather than pitching fresh material (Murray's follow-up content rule — the mechanism that most meetings come from follow-ups).
8. **M8 (honest negative — anecdote numbers):** Does NOT cite the Steli "457% more replies" / "7%→39%" figures as facts (mechanism only, never the numbers) and does NOT import list-email cadence advice (Hormozi-style rhythms) into a cold thread.
9. **M9 (follow-through readiness):** Names the prepared next step for every fork number (e.g. 1 → send the artifact same day, 2 → permission-tagged future touch on the calendar, 3 → close gracefully + learning question, 4 → close the loop / ask routing) — per "have a response ready for every number."
10. **M10 (output contract):** Output contains the contract fields that apply: chosen fork (named), response draft, owner + timing, stop/follow-up rule (one more touch max then stop, per strategic cadence), and a log line noting the thread state for the learning review.

### Expected load path

- `skill_load(cold_email_reply_os, full)`.
- References: `fork_library` ONLY (workflow steps 2/7 route silence revival there for the fork text, discipline rules, and cadence-by-mode).
- Should NOT load: `objection_routes` (no objection exists) or `tactical_empathy_routes` (no reply to label). Over-loading is a usage failure.

### Discovery probe

"My prospect went quiet after two emails — should I follow up again or let it go?" → catalog description matches on "reviving silence with numbered forks."

---

## Results log

<!-- Append per EVALS_GUIDE.md. Template: -->
<!--
### YYYY-MM-DD — Task N — performer: <model>, judge: <model>
| Marker | A (without) | B (with) |
| --- | --- | --- |
| M1 | miss | hit |
Verdict: STRONG/WEAK/NO DELTA. Load path: as expected / deviations. Discovery probe: pass/fail.
Notes:
-->

### 2026-06-11 — Task 1 — manufacturing run — performer: Fable 5 (with skill), judge: self-check (not blind)

Single with-skill run to manufacture the `## Worked Example` for SKILL.md, per AUTHORING_GUIDE ingredient 1 — not a with/without A/B pair; no Run A, no verdict.

Self-assessed markers: **10/10 hit** (M1–M10). Load path honored in-manufacture: shell full + `objection_routes` only; `fork_library` and `tactical_empathy_routes` deliberately not consulted. Output trimmed to ~55 lines and embedded as `## Worked Example` in SKILL.md after `## Output Contract`.
Notes: The user-instinct trap (deck + call ask) pulled hard toward two CTAs; the route row's "no label needed" plus the never-two-CTAs guardrail resolved it. First draft buried the SLA note at the end — moved owner/SLA up to match contract order before embedding. A real blind A/B pair is still owed for both tasks.

### 2026-06-12 — Task 1 — BLIND A/B (the owed pair; prior wave-2 entry was a with-skill self-check) — performer (with/without) + blind judge: claude-opus-4-8 (workflow subagents)

| Marker | without | with |
| --- | --- | --- |
| M1 | miss | hit |
| M2 | miss | hit |
| M3 | miss | hit |
| M4 | hit | hit |
| M5 | hit | hit |
| M6 | miss | hit |
| M7 | miss | hit |
| M8 | hit | hit |
| M9 | miss | hit |
| M10 | miss | hit |

Verdict: **STRONG DELTA**. With-skill hit 10/10 markers; gap over no-skill = 7 markers. Refusal missed by skill run: False.
Load path (expected, not re-tested this run): skill_load(cold_email_reply_os, full) for the taxonomy table, SLA matrix, and Output Contract; load the objection_routes reference ONLY (for the route row + calibrated question); must NOT load fork_library (no silence to revive) or tactical_empathy_routes (reply is neither tense nor ambiguous) — loading either is an over-load failure even if the answer is correct.
Notes: X hits all 10 markers; Y hits only 4 (M4, M5, M8 + nothing of the contract scaffolding). Gap of 6 markers includes named-rule (M1, M2, M7), threshold (M3), and both contract-log markers (M9, M10), satisfying STRONG DELTA. Y gives solid sales-instinct prose and correctly refuses deck+call, but lacks the named classification, owner/SLA, the active-vs-polite-no fork, and the buyer-language log. Y also softly violates the single-CTA contract (walkthrough offer + "no need to reply"), missing M6/M7. Both guardrail/refusal markers (M5, M8) were hit by the stronger output X, so no refusal miss.
