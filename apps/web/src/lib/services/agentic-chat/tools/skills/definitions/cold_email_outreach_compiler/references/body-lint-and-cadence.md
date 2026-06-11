---
doc_type: skill-reference
skill: cold_email_outreach_compiler
reference: body-lint-and-cadence
visibility: internal
publish: false
created: 2026-06-10
purpose: The 9-point body lint checklist, the assumptive-language replacement table, the cadence map by mode, follow-up content rules, and compile-time refusal triggers for the final pass before bundling.
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_outreach_compiler/references/body-lint-and-cadence.md
---

# Body Lint, Cadence Map, and Refusal Triggers

Load this after drafting, before bundling. Every email ships with a cadence and reply routes attached; every lint failure is fixed or named in the bundle. The framing metric is qualified conversations started per unit of market trust consumed.

## 9-Point Body Lint Checklist

1. **Passive→assumptive sweep** (Connor Murray table below): "I was hoping…" → "I'm looking…"; "If you're interested…" → a date question; "Worth a chat?" → banned (root guardrail).
2. **Cliché sweep**: "I hope this finds you well," "hope all is well," "just checking in," "quick question" as a _body_ opener (Lavender 101, Greenhouse, Jackson).
3. **One CTA only**; the CTA is a Call-to-Conversation — easy to answer, not a booking demand (Lavender 101 CTC rule) — except modes where a time-ask is sanctioned (Murray strategic, recruiting).
4. **You:we ratio ≥3:1** (RecruitingDaily golden ratio).
5. **Word count and reading level** per the mode table in `mode-templates.md` (3rd–5th grade reading level: +67% replies — Lavender, directional).
6. **Proof claim-matched and permissioned** (Dunford; root guardrail). No vague "teams like yours," no unsupported outcomes.
7. **Follow-up content rules**: no attachment on follow-ups; follow-up #1 = same message, different format (long→2-sentence or the reverse); follow-up #2 = CTA restatement only; follow-up #3 = breakup/loss-aversion (Close follow-up plan).
8. **Subject/preview pass** per `subject-preview-rules.md`.
9. **Mobile render**: no paragraph longer than 2 lines on a phone (Lavender; Murray's one-screen rule). Line-length specifics are unsourced — keep this qualitative.

## Assumptive-Language Replacement Table (Murray)

Passive language is the single biggest reply-rate killer. The goal of every email is a response — yes, no, or objection — because you can book from any reply but never from silence.

| Passive (kills replies)             | Assumptive (gets replies)                                |
| ----------------------------------- | -------------------------------------------------------- |
| "I was hoping to set up some time…" | "I'm looking to set up some time…"                       |
| "If you're interested…"             | "Do either of these dates work for you?"                 |
| "Is this worth a chat?"             | "What does your availability look like later this week?" |
| "Is this worth exploring more?"     | "I'll send the invite once you share availability."      |
| "Warmest regards,"                  | "Thanks in advance,"                                     |

Time-ask phrasing is sanctioned only in strategic/enterprise sales and recruiting. It is banned in investor and PR modes — mode allowances never leak across modes.

## Cadence Map by Mode (attach to every bundle)

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

## Compile-Time Refusal Triggers

Refuse or flag instead of compiling when:

- Mixed personas in one campaign (route to `cold_email_icp_signal_design`).
- No artifact and the mode forbids meeting-first (route to `cold_email_offer_lab`).
- Anchor below Level 3 for strategic/single-target — Level 3 = specific post/article/hire/initiative; Level 4 = quote from a talk; Level 5 = real mutual (route to `cold_email_research_anchors`).
- Sender health unverified at volume (route to `cold_email_deliverability_readiness`). 2026 context: Google rejects non-compliant bulk mail at the SMTP level since Nov 2025; Microsoft returns 550 5.7.515 for unauthenticated high-volume senders — compiling great copy for a blocked sender is waste.
- Proof unapproved or not claim-matched.
- PR pitch without named beat fit verified against the recipient's recent work.
