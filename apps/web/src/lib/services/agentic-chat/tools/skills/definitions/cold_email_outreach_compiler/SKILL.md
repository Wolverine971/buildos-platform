---
name: Cold Email Outreach Compiler
description: Child skill for compiling prepared mode, segment, anchor, offer, proof, and sender constraints into a finished cold outreach bundle — seven mode scaffolds, a subject/preview packaging pass, a 9-point body lint, and a mode-keyed cadence map. Also executes full rebuilds routed from cold_email_taste_review; for judging or tightening an existing draft, use taste review first.
parent_id: cold_email_engagement_first_outreach
depth: 1
preserve_markdown: true
legacy_paths:
    - cold_email_outreach.compiler
    - cold_email_outreach.drafting
reference_modules:
    - id: cold_email_outreach_compiler.mode_templates
      name: Mode Templates and Scaffolds
      summary: Seven mode-specific compiler templates with verbatim scaffolds (Shepherd volume pattern, Murray three-paragraph, strategic anchor anatomy, Seibel investor payload and three-sentence framework, recruiting checklist, Kai Davis podcast template with PR beat seasoning, founder-to-founder), plus the body length and register table.
      when_to_load:
          - When drafting the body in the mode register (workflow step 4).
          - When the user asks what a given mode's email should look like, or needs the length/register rules for a mode.
      path: references/mode-templates.md
      visibility: internal
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_outreach_compiler/SKILL.md
---

# Cold Email Outreach Compiler

Use this child skill when the core inputs are ready and the user wants the finished email, sequence, or audit rewrite. The north star is qualified conversations started per unit of market trust consumed: the compiler's job is to spend prepared inputs well, never to paper over missing ones.

The seven mode scaffolds live in the `mode_templates` reference — load it before drafting the body. Everything else a compile needs is in this shell: the sequence, the routing rules, the subject/preview packaging rules, the 9-point lint, the cadence map, the refusal triggers, and the output contract.

## When to Use

- Mode, target/segment, offer, and sender constraints are already known
- The user asks to draft, rewrite, or package the outreach
- The user wants a campaign bundle or per-email bundle
- The root skill has routed weak inputs to other child skills already

## Workflow

1. Confirm the ingredient chain exists: person, moment, reason (anchor + bridge for relationship-sensitive modes), artifact offer, proof status, sender constraints. Refuse to compile around a missing critical ingredient — route it instead: vague segment/persona → `cold_email_icp_signal_design`; missing or meeting-first offer → `cold_email_offer_lab`; anchor below Level 3 for strategic/single-target → `cold_email_research_anchors`; unverified sender at volume → `cold_email_deliverability_readiness`.
2. Pick exactly one mode (volume casual, volume/enterprise formal, strategic anchor-led, investor, recruiting, PR/podcast, founder-to-founder — partnership and customer research as flagged thin variants) and restate why it is the right mode.
3. Confirm the offer is artifact-first, buyer-progress-oriented, and alternatives-aware. A meeting-first ask is allowed only where the mode sanctions it (strategic sales, recruiting) — never in investor or PR modes.
4. Load `cold_email_outreach_compiler.mode_templates` and draft the body in that mode's scaffold, length cap, and register. Add proof only if credible, relevant, approved, and claim-matched. For PR/podcast, package beat fit, audience reason, and the topic-angle menu. For strategic B2B, package the artifact so a Mobilizer could forward it internally.
5. Run the subject/preview pass per `## Subject and Preview Rules (Packaging Pass)` below: mode-keyed subject, rejection-list sweep, register resolution (title case for formal modes, lowercase for casual volume), and deliberate first-two-sentences preview that extends the subject and surfaces the anchor.
6. Run the 9-point lint per `## Body Lint, Cadence, and Refusal Triggers` below. Fix every failure or name it in the bundle; the passive-to-assumptive sweep and single-CTA rule are non-negotiable.
7. Attach the mode's cadence from the cadence map in that same section, with follow-up content per the follow-up rules (follow-up #1 reformats, #2 restates the CTA, #3 breaks up; volume stops at two touches; PR follows up exactly once).
8. Define reply routes (yes / no / objection / silence — hand objection and revival handling to `cold_email_reply_os`) and tracking targets per stage. Targets come from `cold_email_learning_review`'s benchmark bands and gate tree — set positive-reply-per-send and bounce/complaint ceilings there; do not invent target numbers here. Note: low opens in 2026 are more likely a compliance/placement failure than a copy failure.
9. Return the bundle with refusal notes for any precondition that remains weak.

## Subject and Preview Rules (Packaging Pass)

Subject plus preview is the first conversion point — never leave either to chance. All percentage deltas below are Lavender vendor data (231,818-email Feb-2026 benchmark across ~50k inboxes; sample stated, selection bias not characterized) — treat as directional, not governing thresholds.

### Mode-Keyed Subject Table

| Mode                  | Subject rule                                                                                                                                                           | Examples                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Volume outbound       | 2–5 words; internal-looking; no marketing language. Shepherd variant: 2–3 words, lowercase, no punctuation, curiosity not summary                                      | "quick question" (Shepherd subject use only — banned as a body opener), "book positioning"; Lavender good list: "Template Revisions," "Ramp," "Reply Rate Question" |
| Strategic account     | 3–8 words; a specific noun, initiative, or direct-report names; still internal-looking                                                                                 | "enterprise ramp," "Mark and Larry," "north america expansion"                                                                                                      |
| Single-target / SMYKM | May run longer if the recipient will recognize the hyper-specific hook instantly                                                                                       | Sam McKenna's CEO-of-LinkedIn public-phrase subject                                                                                                                 |
| Recruiting            | ≤30 characters; candidate first name OK (+16% opens, Recruiterflow 50k dataset — vendor, methodology unstated); location/remote mention helps; CTA at front if present | "[First Name], about your LinkedIn post"; "Remote [Job Title], [Company]" (Greenhouse)                                                                              |
| PR / podcast          | Upfront and clear on what the pitch is about; no cleverness                                                                                                            | Muck Rack checklist                                                                                                                                                 |

### Universal Rejection List

Reject the subject and rewrite when it contains:

- A question — **−56% opens** (Lavender)
- Numbers — **−46% opens** (Lavender)
- "?" or "!" — **−36% opens** (Lavender)
- More than necessary words — going 2→4 words cost **−17.5% replies** (Lavender); shortest honest noun phrase wins
- Clichés: "Quick Question" in capitalized-cliché form, "Thoughts?", "15 minutes?"
- Commands or superlatives
- Emojis
- Misleading "Re:" / "Fwd:" prefixes (Greenhouse)
- Money words ("discount," "pricing," "save") in the subject
- A generic trigger everyone else will use, or a personal hook with no business bridge (McKenna)
- "[Company] x [Company]" and "Loved your post" framings

### Title-Case vs Lowercase Resolution

Lavender found subjects without title case lost **−30% opens**; Aaron Shepherd's casual volume register deliberately uses lowercase. These conflict, and the conflict is resolved editorially by register, not by data:

- Formal modes (enterprise, strategic, investor, recruiting, PR): title case.
- Casual-founder volume mode: lowercase.
- Never mix registers within one campaign.

### Preview Text Rules

The first two sentences of the body ARE the preview — write them deliberately (Florin Tatulea / Jason Bay).

- Extend the subject; never repeat it.
- Surface the anchor early so the preview proves relevance before the open.
- Never let a tracking-pixel disclaimer, unsubscribe text, or "view in browser" leak into the preview.
- Preview can carry the whole follow-up: Connor Murray's highest-reply follow-up of all time runs entirely on the preview line "Please give me your thoughts on this."

### 2026 Open-Rate Context

If opens are low in 2026, suspect a compliance/placement failure before a copy failure: Google rejects non-compliant bulk mail at the server level (since Nov 2025) and Microsoft enforces SPF/DKIM/DMARC for high-volume senders. Route sender-health questions to `cold_email_deliverability_readiness` — do not keep rewriting subjects for a blocked sender.

## Body Lint, Cadence, and Refusal Triggers

Run this after drafting, before bundling. Every email ships with a cadence and reply routes attached; every lint failure is fixed or named in the bundle. The framing metric is qualified conversations started per unit of market trust consumed.

### 9-Point Body Lint Checklist

1. **Passive→assumptive sweep** (Connor Murray table below): "I was hoping…" → "I'm looking…"; "If you're interested…" → a date question; "Worth a chat?" → banned (root guardrail).
2. **Cliché sweep**: "I hope this finds you well," "hope all is well," "just checking in," "quick question" as a _body_ opener (Lavender 101, Greenhouse, Jackson).
3. **One CTA only**; the CTA is a Call-to-Conversation — easy to answer, not a booking demand (Lavender 101 CTC rule) — except modes where a time-ask is sanctioned (Murray strategic, recruiting).
4. **You:we ratio ≥3:1** (RecruitingDaily golden ratio).
5. **Word count and reading level** per the mode table in `mode-templates.md` (3rd–5th grade reading level: +67% replies — Lavender, directional).
6. **Proof claim-matched and permissioned** (Dunford; root guardrail). No vague "teams like yours," no unsupported outcomes.
7. **Follow-up content rules**: no attachment on follow-ups; follow-up #1 = same message, different format (long→2-sentence or the reverse); follow-up #2 = CTA restatement only; follow-up #3 = breakup/loss-aversion (Close follow-up plan).
8. **Subject/preview pass** per `## Subject and Preview Rules (Packaging Pass)` above.
9. **Mobile render**: no paragraph longer than 2 lines on a phone (Lavender; Murray's one-screen rule). Line-length specifics are unsourced — keep this qualitative.

### Assumptive-Language Replacement Table (Murray)

Passive language is the single biggest reply-rate killer. The goal of every email is a response — yes, no, or objection — because you can book from any reply but never from silence.

| Passive (kills replies)             | Assumptive (gets replies)                                |
| ----------------------------------- | -------------------------------------------------------- |
| "I was hoping to set up some time…" | "I'm looking to set up some time…"                       |
| "If you're interested…"             | "Do either of these dates work for you?"                 |
| "Is this worth a chat?"             | "What does your availability look like later this week?" |
| "Is this worth exploring more?"     | "I'll send the invite once you share availability."      |
| "Warmest regards,"                  | "Thanks in advance,"                                     |

Time-ask phrasing is sanctioned only in strategic/enterprise sales and recruiting. It is banned in investor and PR modes — mode allowances never leak across modes.

### Cadence Map by Mode (attach to every bundle)

| Mode                    | Cadence                                                                                                                                                                                                                                                            | Source                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Volume                  | Day 0 + Day ~3, stop; recycle non-responders into a new angle/offer campaign                                                                                                                                                                                       | Austin Schneider two-touch (touch 2 +49% replies, touch 3 −20%, touch 4+ −55% and trains filters to flag the sender as bulk — vendor data, directional) |
| Strategic               | 4 touches, alternating days, 7–8-day window: initial / benefit-of-the-doubt / "thoughts on this" / assumptive breakup ("Is next month a better time? Just want to close the loop either way."). Never Monday-Monday-Monday — buyers pattern-match it as automation | Connor Murray; 70–80% of meetings come from the follow-ups                                                                                              |
| Executive single-target | ≤4 touches, all in the original thread, pointing back to the original context; test Thursday/Friday (and cautiously weekend) initial sends; follow up within 48h while the research is fresh                                                                       | Sam McKenna                                                                                                                                             |
| Investor                | Slow; never rapid-fire after confirmed opens                                                                                                                                                                                                                       | Michael Seibel                                                                                                                                          |
| Recruiting engage       | 4 steps: Day 0 / +2d / +3d / +5d over ~2 weeks (1–2 steps get lost; >4 frustrates); nurture monthly thereafter                                                                                                                                                     | Greenhouse engage cadence                                                                                                                               |
| PR / podcast            | One follow-up, 3–7 days later; nothing more (51% of reporters say 3–7 days is right; ~45% say exactly one follow-up is ideal)                                                                                                                                      | Muck Rack                                                                                                                                               |
| Post-engagement revival | 2-7-14-30 then monthly; the numbered fork as the revival instrument (hand off to `cold_email_reply_os`)                                                                                                                                                            | Close follow-up guide; Steli Efti                                                                                                                       |

Murray's three follow-up moves for the strategic cadence, in order:

1. **Benefit-of-the-doubt**: "Hey — just want to make sure you caught my note. Do either of those dates work, or let me know if you have time to speak this week."
2. **Professional dissatisfaction**: preview text reads "Please give me your thoughts on this" — his highest-reply-rate line, email or phone.
3. **Assumptive breakup**: "Is next month a better time to talk about this? Just want to close the loop either way — let me know."

Cadence hygiene: do not import opt-in newsletter or list-email cadence advice (e.g., 3x/week sends, reward-loop framing) into cold outreach — list-email tactics are banned across this suite. Recruiting and PR cadence numbers stay in their modes.

### Compile-Time Refusal Triggers

Refuse or flag instead of compiling when:

- Mixed personas in one campaign (route to `cold_email_icp_signal_design`).
- No artifact and the mode forbids meeting-first (route to `cold_email_offer_lab`).
- Anchor below Level 3 for strategic/single-target — Level 3 = specific post/article/hire/initiative; Level 4 = quote from a talk; Level 5 = real mutual (route to `cold_email_research_anchors`).
- Sender health unverified at volume (route to `cold_email_deliverability_readiness`). 2026 context: Google rejects non-compliant bulk mail at the SMTP level since Nov 2025; Microsoft returns 550 5.7.515 for unauthenticated high-volume senders — compiling great copy for a blocked sender is waste.
- Proof unapproved or not claim-matched.
- PR pitch without named beat fit verified against the recipient's recent work.

## Output Contract

- Mode and why it fits
- Subject and one alternate
- Preview text (the first two sentences, written deliberately)
- Email body (plus follow-up bodies for a campaign bundle)
- Proof slot or named proof gap
- CTA and why it is the smallest useful yes
- Buyer progress / alternative being addressed
- Lint results (9-point pass/fail with fixes applied)
- Cadence map for the mode
- Reply routes
- Tracking targets (sourced from `cold_email_learning_review` benchmark bands — never invented)
- Refusal or risk notes

## Worked Examples

### Full compile (strategic mode)

Manufactured from the evals.md Task 1 fixture (RampCheck → Priya Nair, complete ingredients); self-checked 13/13 markers.

**Ingredient gate:** person (Priya Nair, VP Sales, ~140-person B2B SaaS) · moment (Revenue Builders podcast, 3 weeks ago) · reason (Level 4 anchor — a verbatim quote — plus bridge) · artifact (2-page Ramp Variance Teardown, ~10-minute read) · proof (Forma, naming approved) · sender (domain verified, ~10/week by hand — no deliverability gap). Chain complete; compile proceeds.

**Mode + why:** strategic anchor-led — single high-value account with a Level 4 quote anchor; a volume register would waste the anchor.

**Subject:** `Rep Ramp Variance` — 3 words, internal-looking, title case (formal register). Rejection-list sweep: no question, no numbers, no "?"/"!", no cliché, no "[Company] x [Company]", no money words — pass. **Alternate:** `New Rep Ramp`.

**Preview:** the body's first two sentences, written deliberately — they extend the subject and surface the anchor before the open.

**Body (131 words — under the ≤170-word strategic hard cap; anatomy in order: anchor → bridge → problem → proof → offer → CTA):**

> Hi Priya,
>
> On Revenue Builders three weeks ago you said hiring reps isn't the problem — it's that every new rep ramps differently and you can't see why.
>
> That line is why I'm writing: you're taking the team from 18 to 35 this year, and ramp variance compounds at exactly that stage. Each cohort that ramps unevenly costs you quota coverage you've already paid for.
>
> When Forma — a 120-person SaaS running a similar motion — mapped their last six ramp cohorts, two variance sources explained most of the gap. Fixing them cut average ramp from 5 weeks to 3.5.
>
> I run RampCheck. I can build the same two-page Ramp Variance Teardown from your last six cohorts — about ten minutes of reading, nothing required from your team.
>
> Want me to send the teardown?
>
> Dana

**Bridge test (McKenna):** remove the podcast quote and the outreach reason collapses — the teardown exists to answer the visibility problem Priya named. The anchor causes the email; pass.

**Proof slot:** Forma, ramp 5 weeks → 3.5 — peer company, same motion, claim-matched to the teardown's promise, naming approved.

**CTA + why it's the smallest useful yes:** exactly one CTA, artifact-first ("Want me to send the teardown?") — a one-word yes that costs Priya nothing; no calendar link on first touch. The sanctioned strategic time-ask is held for the yes route.

**Buyer progress / alternative:** moves Priya from "can't see why reps ramp differently" to two named variance sources before the 18→35 scale-up — versus her default alternative of riding it out with the enablement stack she already has.

**Lint (9-point):** 1 passive→assumptive — pass (no "I was hoping…", "If you're interested…", "Worth a chat?"). 2 cliché sweep — pass. 3 one CTA — pass. 4 you:we ≥3:1 — pass (7 you-words, zero we-words). 5 length/reading level — pass (131 words, plain language). 6 proof claim-matched + permissioned — pass. 7 follow-up rules — pass (no attachments; #1 reformats, #2 restates CTA, #3 breaks up). 8 subject/preview — pass (above). 9 mobile render — pass (no paragraph over 2 phone lines).

**Cadence (strategic):** 4 touches, alternating days, 7–8-day window, same thread; never Monday-Monday-Monday (buyers pattern-match it as automation).

- FU1, benefit-of-the-doubt (same message, 2-sentence reformat): "Just want to make sure you caught my note. Want me to send the two-page teardown on your ramp variance?"
- FU2, preview carries it ("Please give me your thoughts on this."), body is CTA restatement only: "Happy to send the Ramp Variance Teardown — say the word."
- FU3, assumptive breakup: "Is next month a better time to dig into ramp variance? Just want to close the loop either way — let me know."

**Reply routes:** yes → send teardown same day, then the sanctioned strategic time-ask once she's read it. no → thank and close the loop. objection or post-cadence silence/revival → hand to `cold_email_reply_os`.

**Tracking targets:** taken from `cold_email_learning_review` benchmark bands (positive-reply-per-send, bounce/complaint ceilings) — never invented here.

**Refusal/risk notes:** none open. Vendor-number hygiene: the short-body, reading-level, and subject deltas that shaped this draft are Lavender vendor benchmarks — directional patterns, not governing thresholds.

### Refusal (missing offer)

Manufactured from the evals.md Task 2 fixture (FlowKit, ~200 ops leaders, meeting-first ask, no artifact); self-checked 8/8 markers.

**Refusal:** not compiling this campaign as specified. At ~200 sends this is volume mode, and volume mode forbids a meeting-first ask — a time-ask is sanctioned only in strategic sales and recruiting. A Calendly link on first touch asks for more trust than a cold volume send has earned: the smallest useful yes at volume is an artifact send, and no artifact exists.

**Missing critical ingredient:** the offer artifact → route to `cold_email_offer_lab`. Build a front-end artifact (teardown, checklist, benchmark, mini-audit) the email can lead with; the 15-minute call becomes the second yes, not the first.

**Not offered:** no laundered variants — no "open to a quick chat?" rewrite, no softened or buried calendar link. Politer phrasing of the meeting ask is still the meeting ask.

**Verified ready (keep as-is):** sender health — domain warmed and verified, so no `cold_email_deliverability_readiness` routing is needed; segment — heads of operations at 20–100-person e-commerce brands is a workable single persona.

**Shape of the eventual compile, once the artifact exists:** volume mode, single artifact-first CTA, two-touch cadence (Day 0 + Day ~3, stop; recycle non-responders into a new angle/offer campaign).

**Refusal/risk notes:** the only open gap is the offer. Compiling "punchy" copy around it would spend market trust on an ask the mode forbids.

## Guardrails

- Do not compile around missing critical inputs — name the gap and route to the sibling that produces it (`cold_email_icp_signal_design`, `cold_email_offer_lab`, `cold_email_research_anchors`).
- Do not compile for an unverified sender at volume — name the deliverability gap and route to `cold_email_deliverability_readiness` instead.
- Do not use multiple CTAs.
- Do not leave preview text to chance.
- Do not turn an artifact offer into a meeting-first ask.
- Do not compile PR/podcast outreach without verified audience/beat fit.
- Do not compile strategic B2B outreach without a recipient or internal-consensus logic.
- Do not let mode allowances leak across modes: time-asks stay in strategic/recruiting; recruiting and PR benchmarks stay in their modes; never mix registers in one campaign.
- Do not treat vendor numbers (Lavender, Recruiterflow, Greenhouse, Schneider) as governing thresholds — they are directional patterns.
- Do not import opt-in newsletter or list-email tactics as cold-email advice.

## Notes

- Reference modules: `cold_email_outreach_compiler.mode_templates` (seven scaffolds, length/register table) — the only remaining reference, loaded once per task for the chosen mode's scaffold.
- The former `packaging_rules` and `lint_and_cadence` references were folded into this shell on 2026-06-11 (`## Subject and Preview Rules (Packaging Pass)` and `## Body Lint, Cadence, and Refusal Triggers`): their when_to_load fired on every standard compile (workflow steps 5–8), making them shell body in disguise.
- Primary sources: Connor Murray (three-paragraph body, assumptive language, strategic cadence), Aaron Shepherd (casual volume pattern), Sam McKenna (anchor/bridge, executive single-target), Michael Seibel and Y Combinator (investor payload, three-sentence framework), Kai Davis and Muck Rack (podcast/PR), Gem/Greenhouse/RecruitingDaily (recruiting patterns), Sahil Bloom (founder operator variant), Lavender (subject/body deltas — 231,818-email vendor benchmark, directional), Austin Schneider/Instantly (two-touch volume cadence), Close/Steli Efti (follow-up content rules).
- Maintainers: enrichment lineage lives at `docs/research/youtube-library/cold-email-children-enrichment-plan-2026-06-10.md` with ported draft references under `docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/references/` (not available at runtime).
