---
doc_type: skill-reference
skill: cold_email_outreach_compiler
reference: subject-preview-rules
visibility: internal
publish: false
created: 2026-06-10
purpose: Mode-keyed subject-line rules, the universal rejection list with Lavender deltas, preview-text rules, and the title-case-vs-lowercase register resolution for the packaging pass.
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_outreach_compiler/references/subject-preview-rules.md
---

# Subject and Preview Rules (Packaging Pass)

Load this for the subject/preview pass. Subject plus preview is the first conversion point — never leave either to chance. All percentage deltas below are Lavender vendor data (231,818-email Feb-2026 benchmark across ~50k inboxes; sample stated, selection bias not characterized) — treat as directional, not governing thresholds.

## Mode-Keyed Subject Table

| Mode                  | Subject rule                                                                                                                                                           | Examples                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Volume outbound       | 2–5 words; internal-looking; no marketing language. Shepherd variant: 2–3 words, lowercase, no punctuation, curiosity not summary                                      | "quick question" (Shepherd subject use only — banned as a body opener), "book positioning"; Lavender good list: "Template Revisions," "Ramp," "Reply Rate Question" |
| Strategic account     | 3–8 words; a specific noun, initiative, or direct-report names; still internal-looking                                                                                 | "enterprise ramp," "Mark and Larry," "north america expansion"                                                                                                      |
| Single-target / SMYKM | May run longer if the recipient will recognize the hyper-specific hook instantly                                                                                       | Sam McKenna's CEO-of-LinkedIn public-phrase subject                                                                                                                 |
| Recruiting            | ≤30 characters; candidate first name OK (+16% opens, Recruiterflow 50k dataset — vendor, methodology unstated); location/remote mention helps; CTA at front if present | "[First Name], about your LinkedIn post"; "Remote [Job Title], [Company]" (Greenhouse)                                                                              |
| PR / podcast          | Upfront and clear on what the pitch is about; no cleverness                                                                                                            | Muck Rack checklist                                                                                                                                                 |

## Universal Rejection List

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

## Title-Case vs Lowercase Resolution

Lavender found subjects without title case lost **−30% opens**; Aaron Shepherd's casual volume register deliberately uses lowercase. These conflict, and the conflict is resolved editorially by register, not by data:

- Formal modes (enterprise, strategic, investor, recruiting, PR): title case.
- Casual-founder volume mode: lowercase.
- Never mix registers within one campaign.

## Preview Text Rules

The first two sentences of the body ARE the preview — write them deliberately (Florin Tatulea / Jason Bay).

- Extend the subject; never repeat it.
- Surface the anchor early so the preview proves relevance before the open.
- Never let a tracking-pixel disclaimer, unsubscribe text, or "view in browser" leak into the preview.
- Preview can carry the whole follow-up: Connor Murray's highest-reply follow-up of all time runs entirely on the preview line "Please give me your thoughts on this."

## 2026 Open-Rate Context

If opens are low in 2026, suspect a compliance/placement failure before a copy failure: Google rejects non-compliant bulk mail at the server level (since Nov 2025) and Microsoft enforces SPF/DKIM/DMARC for high-volume senders. Route sender-health questions to `cold_email_deliverability_readiness` — do not keep rewriting subjects for a blocked sender.
