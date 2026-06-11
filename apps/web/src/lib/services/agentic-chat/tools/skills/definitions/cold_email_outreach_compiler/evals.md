<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_outreach_compiler/evals.md -->

# Evals — cold_email_outreach_compiler

Golden tasks per `../../EVALS_GUIDE.md`. Run B gets the shell plus its one reference (`mode-templates.md`). The former `subject-preview-rules.md` and `body-lint-and-cadence.md` references were folded into the shell on 2026-06-11.

---

## Task 1 — Compile a strategic anchor-led email (complete ingredients)

### Task prompt

> Draft the cold email and follow-up plan. Everything is prepped:
>
> - **Sender:** Dana Reyes, founder of RampCheck (sales-onboarding diagnostics for B2B SaaS). Domain verified, SPF/DKIM/DMARC pass, sending ~10 emails/week by hand.
> - **Target:** Priya Nair, VP Sales at Northbeam-style B2B SaaS (~140 employees), scaling the sales team from 18 to 35 reps this year (public hiring-page evidence).
> - **Research anchor:** On the "Revenue Builders" podcast (3 weeks ago) Priya said: "We can hire reps fine — what kills us is that every new rep ramps differently and I can't see why."
> - **Offer artifact:** a 2-page "Ramp Variance Teardown" — RampCheck maps a team's last 6 ramp cohorts and names the top 2 sources of ramp variance. Takes Priya ~10 minutes to read; zero commitment.
> - **Proof:** Forma (a 120-person SaaS, similar motion) cut average ramp time 5 weeks → 3.5 using the teardown's findings; Forma's VP Sales approved being named.
> - **Mode preference:** this is a single high-value account, not a volume play.

### Delta markers

1. **M1 (ingredient gate):** Explicitly confirms the ingredient chain (person, moment, reason, artifact, proof, sender) before drafting, and names the mode as strategic anchor-led with a stated reason.
2. **M2 (body anatomy):** Body follows the strategic anatomy in order: anchor → bridge → problem/opportunity → proof → offer/artifact → CTA.
3. **M3 (length cap):** Body ≤170 words (the strategic hard cap), and the cap is cited.
4. **M4 (authenticity bridge):** The podcast quote _causes_ the email — applies/states the McKenna test (remove the hook and the outreach reason collapses); the quote is referenced specifically, not "loved your podcast episode".
5. **M5 (subject rules):** Subject is 3–8 words, internal-looking, title case (formal register), and violates none of the rejection list (no question, no numbers, no "?"/"!", no clichés, no "[Company] x [Company]"). One alternate subject provided.
6. **M6 (deliberate preview):** The first two sentences are written as the preview — extending the subject and surfacing the anchor — and labelled as such.
7. **M7 (9-point lint):** A 9-point lint result is reported pass/fail per point (passive→assumptive, cliché sweep, one CTA, you:we ≥3:1, word count/reading level, proof claim-matched, follow-up rules, subject/preview, mobile render).
8. **M8 (assumptive sweep):** No passive constructions survive — no "I was hoping…", "If you're interested…", "Worth a chat?"; any time-ask uses assumptive phrasing (sanctioned in strategic mode).
9. **M9 (smallest useful yes):** Exactly one CTA, artifact-first (e.g. "Want me to send the teardown?"), no calendar link on first touch; the bundle states why it's the smallest useful yes.
10. **M10 (cadence map):** Attaches the strategic cadence: 4 touches, alternating days, 7–8-day window, with Murray's three follow-up moves (benefit-of-the-doubt / "thoughts on this" preview / assumptive breakup) and the no-Monday-Monday-Monday warning.
11. **M11 (reply routes + handoff):** Defines yes / no / objection / silence routes and hands objection + revival handling to `cold_email_reply_os`.
12. **M12 (output contract):** Bundle contains all contract fields: mode + why, subject + alternate, preview, body + follow-up bodies, proof slot, CTA rationale, buyer progress/alternative, lint results, cadence, reply routes, tracking targets, refusal/risk notes.
13. **M13 (vendor-number hygiene):** If any Lavender/Recruiterflow-style percentage is cited, it is flagged as directional vendor data, not a governing threshold.

### Expected load path

- `skill_load(cold_email_outreach_compiler, full)` — the `## Output Contract` heading is not a short-format parsed section.
- References: `mode_templates` only (step 4 drafting). The packaging pass (step 5) and lint/cadence (steps 6–8) are inline shell sections (folded 2026-06-11) — no load needed; attempting to load `packaging_rules` or `lint_and_cadence` is a stale-reference failure.
- Should NOT load: sibling skills' references (`cold_email_offer_lab`, `cold_email_reply_os`) — routing is by name only.

### Discovery probe

"I've got my target, a podcast quote, and a teardown to offer — draft the cold email and follow-ups." → catalog description matches on "compiling prepared mode, segment, anchor, offer … into a finished cold outreach bundle."

---

## Task 2 — Missing offer → refusal and routing (guardrail path)

### Task prompt

> Write me a cold email campaign (first touch + follow-ups) I can send to ~200 heads of operations at 20–100 person e-commerce brands. My company is FlowKit; we do workflow automation. Goal of the email: get them to book a 15-minute intro call — here's my Calendly: calendly.com/flowkit/intro. My sending domain is warmed up and verified. I don't have a lead magnet or case study or anything to send — I just want the call. Make it punchy.

### Delta markers

1. **M1 (refusal fires):** Refuses to compile the campaign as specified. Does NOT deliver a finished meeting-first volume email, however punchy.
2. **M2 (gap named precisely):** Names the missing critical ingredient as the **artifact offer**, citing the rule: volume mode forbids meeting-first asks; a meeting-first ask is sanctioned only in strategic sales and recruiting.
3. **M3 (routing):** Routes to `cold_email_offer_lab` by name as the sibling that produces the missing ingredient (a vague-segment note routing to `cold_email_icp_signal_design` is bonus, not required).
4. **M4 (no laundering):** Does not launder the gap — no "soft" calendar-link variants, no "open to a quick chat?" rewrite. The artifact-to-meeting conversion guardrail ("do not turn an artifact offer into a meeting-first ask" and its inverse) is respected.
5. **M5 (refusal-shaped output):** Returns a bundle-shaped refusal per the output contract — refusal/risk notes naming the precondition, what was verified as ready (sender health, segment), and what must exist before compiling — rather than generic advice prose.
6. **M6 (cadence knowledge leaks correctly):** If it previews what the eventual campaign will look like, it states the volume cadence as two touches (Day 0 + Day ~3, stop) — not a 5+ touch sequence.
7. **M7 (no deliverability false alarm):** Does not route to `cold_email_deliverability_readiness` — the prompt states the sender is verified; a deliverability refusal is a marker miss.
8. **M8 (calendar-link rule cited):** Names the calendar-link-on-first-touch problem specifically (ask exceeds trust at volume; smallest useful yes is an artifact send).

### Expected load path

- `skill_load(cold_email_outreach_compiler, full)`.
- References: ZERO — shell only. The refusal is decidable from workflow step 1, and the compile-time refusal triggers are now inline in `## Body Lint, Cadence, and Refusal Triggers` (folded 2026-06-11). Loading `mode_templates` to start drafting is an over-load and a usage failure.

### Discovery probe

"Write me a punchy cold email blast to get ops leaders to book a call with me." → description matches on "compiling … into a finished cold outreach bundle" (compiler is the right pick; the refusal is the skill's job, not discovery's).

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

2026-06-11 — Tasks 1+2 manufacturing runs (with-skill, self-checked): embedded as ## Worked Examples. Markers: 13/13 and 8/8 self-assessed.
