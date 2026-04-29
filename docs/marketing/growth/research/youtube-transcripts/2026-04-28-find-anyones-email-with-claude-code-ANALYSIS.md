---
title: "Find Anyone's Email With Claude Code — Analysis"
source_type: 'youtube_analysis'
video_id: 'xc7o9iXDF7M'
url: 'https://www.youtube.com/watch?v=xc7o9iXDF7M'
source_video: 'https://www.youtube.com/watch?v=xc7o9iXDF7M'
source_transcript: 'docs/marketing/growth/research/youtube-transcripts/2026-04-28-find-anyones-email-with-claude-code.md'
channel: 'Eric Nowoslawski'
channel_url: 'https://www.youtube.com/@ericnowoslawski'
upload_date: '2026-04-24'
duration: '11:10'
views: '4095'
library_category: 'sales-and-growth'
library_status: 'transcript, analysis'
transcript_status: 'available'
analysis_status: 'available'
processing_status: 'ready_for_skill_draft'
processed: false
buildos_use: 'both'
skill_candidate: true
skill_priority: 'high'
skill_draft: ''
public_article: ''
indexed_date: '2026-04-28'
last_reviewed: '2026-04-28'
speaker: 'Eric Nowoslawski'
speaker_company: 'Growth Engine X'
analyzed_date: '2026-04-28'
topics:
    - cold-email
    - email-finding
    - email-validation
    - claude-code
    - outbound-sales
    - lead-generation
relevance_to_buildos: 'Low for product, medium-high for outbound/lead-gen ops if BuildOS ever runs cold-email outreach. Useful as a Claude Code workflow case study.'
path: docs/marketing/growth/research/youtube-transcripts/2026-04-28-find-anyones-email-with-claude-code-ANALYSIS.md
---

# Find Anyone's Email With Claude Code — Analysis

## Skill Combo Links

This source contributes to these multi-source skill combo indexes:

- [Founder Ops And Career Skill Combos](../../../../research/youtube-library/skill-combo-indexes/FOUNDER_OPS_AND_CAREER.md): Enterprise founder-led sales
- [Sales And Growth Skill Combos](../../../../research/youtube-library/skill-combo-indexes/SALES_AND_GROWTH.md): Contextual outbound operating system; Local AI services sales machine

## TL;DR

Eric Nowoslawski (founder of Growth Engine X, an outbound agency that sends ~8M emails/month) walks through how to build a personal email-finding tool inside Claude Code in roughly the time it takes to plan the prompt. The thesis: **most B2B emails are guessable**, and you only need a paid provider for the awkward ~20% (catch-all domains, mismatched email/marketing domains, etc.). The actual "trick" is a waterfall: start with the cheapest provider (guess + validate), and only pay for premium providers when guessing fails.

Secondary thesis: this is a great beginner Claude Code project because the scope is bounded, the APIs are well-documented, and you get an immediately useful tool.

---

## How Email-Finding Actually Works (mental model)

The video opens by demystifying the big enrichment companies (ZoomInfo, Apollo, etc.):

1. **Scrape LinkedIn** for `first_name`, `last_name`, and `company_website`.
2. **Guess permutations** of the email (e.g., `eric@`, `ericn@`, `ericnowoslawski@`, `e.nowoslawski@`).
3. **Validate each guess** against the domain's mail server with an SMTP-handshake validator.
4. **Return the first one that comes back "okay."**

That's the whole game for the low-hanging-fruit ~80% of B2B contacts. The expensive providers exist mostly to handle the awkward edge cases.

---

## The Two Things That Break Naive Guessing

These are worth knowing whether or not you build the tool:

### 1. Catch-all domains

Some mail servers accept _every_ incoming address regardless of whether it actually exists. The SMTP handshake doesn't come back negative — it just goes "into the abyss." You can't tell if the email is real.

- **Why it matters:** Sending to catch-alls inflates your bounce rate (ESPs hide the bounces) and tanks your sender reputation.
- **Fix:** Don't trust a catch-all "okay" from a basic validator. Use a specialist provider that handles catch-alls (Lead Magic, Prospeo.io with BounceBan).

### 2. Marketing domain ≠ email domain

The example given: Slack's marketing site is `slack.com`, but they didn't own that domain originally, so their employee emails are on `slackhq.com`. Naive guessing on `slack.com` fails.

- **Fix:** Premium providers maintain mappings of these mismatches; that's part of what you're paying for.

---

## The Provider Waterfall (cheapest → most expensive)

Eric's stack, in order of cost:

| Tier                              | Provider                            | Why use it                                                                                    |
| --------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| 1 (cheapest)                      | **Million Verifier**                | Fast and cheap SMTP validation. He's used it for years.                                       |
| 1 (alt)                           | **mailtester.ninja**                | Even cheaper, "pretty good" accuracy, but slower. He hasn't switched yet.                     |
| 2 (catch-alls)                    | **Prospeo.io**                      | Every email is double-validated via BounceBan, so it can confidently return catch-all emails. |
| 2 (catch-alls)                    | **Lead Magic**                      | "Jesse has spent his entire life figuring out catch-alls." Worth paying for.                  |
| 2 (other)                         | **Blitz API** (`blitz-api.ai`)      | Used as final fallback in his demo.                                                           |
| Other partners (not used in demo) | ICPs, Better Contact, Full Enriched | Mentioned as additional fallback options.                                                     |

**Validation rule:** only accept status `okay`. Reject `invalid`, reject `catch-all`, reject anything ambiguous. If the cheap tier can't return a clean `okay`, fall through to the next tier.

---

## Claude Code Tips & Tricks (the real reusable lessons)

These generalize beyond email-finding. They're the part worth keeping.

### Prompting

- **Always plan first.** Especially for new projects, ask Claude to produce a plan before any code is written. Read the plan, sanity-check it, then approve.
- **End prompts with "ask me 5–10 clarifying questions."** This is the headline trick of the video. It forces Claude to surface the things you forgot to specify, and you build a much better prompt by answering its questions than by trying to write the perfect spec up front. Quote: _"as you're learning how to prompt, you need to cover your bases… if you just ask it to ask you clarifying questions, then you'll end up making much better plans."_
- **Dictate prompts with WhisperFlow.** He uses voice-to-text to draft long, ramble-style prompts because it's faster than typing and keeps the prompt richer. (Note: there is no editorial pass — the dictation goes straight in. Claude handles the cleanup.)

### Workflow

- **Build local first, then deploy.** Get the script working on your machine before moving to the cloud. Saves debugging cycles.
- **Test on a small batch first.** He runs 50 rows, reviews results, _then_ runs the full 1,000. Cheap insurance against burning API credits on a broken prompt.
- **Hand Claude the docs, not the implementation.** The pattern was: "Here's the Million Verifier API key, go read their docs. Here's the Prospeo key, go read theirs. Here's Blitz." Claude reads, integrates, you review. You don't write the integration code yourself.
- **Save the work as a Skill.** Once the tool works, register it as a Claude Code skill so future invocations are one command instead of a fresh prompt. (He doesn't show this; he just notes it as the next step.)

### Deployment & storage stack he uses

- **trigger.dev** for serverless job execution (so you can run lookups overnight or while away from your machine).
- **Supabase** for the database (store the emails you've already found so you don't pay to look them up again).
- He claims a **personal database of 20M cached emails** built up just by saving every result. This is the strongest argument for building your own tool: every lookup you pay for once becomes free forever after.

---

## The Actual Prompt He Used (paraphrased from the video)

Useful as a template:

> Take the CSV of first names, last names, and company domains loaded into this chat. Build a mini email-permutation guesser that tries the 10 most common email-address permutations per contact. Validate each against Million Verifier. Only accept status `okay` — reject invalid and catch-all. If Million Verifier can't find it, fall through to Prospeo.io. If Prospeo can't find it, fall through to the Blitz API. Eventually we'll deploy on trigger.dev and store results in Supabase, but get the script working locally first. **Then ask me 5–10 clarifying questions before building.**

Note the structure: data input → core logic → fallback waterfall → deferred deployment concerns → request for clarifying questions.

---

## What's Useful, What's Hype

### Genuinely useful

- The waterfall pattern (cheap validation first, premium for catch-alls only).
- The "ask me clarifying questions" prompt suffix.
- Caching results in your own DB to amortize cost.
- The mental model of how all enrichment tools work — demystifies the category.
- The "build locally → test on 50 → run full → deploy" loop is solid for any Claude Code project.

### Lightweight / glossed-over

- He never shows the actual code or the final accuracy numbers. The "found most of the emails with Million Verifier" claim is unquantified.
- No discussion of GDPR/CCPA compliance, opt-out, or sender-reputation hygiene.
- The video is implicitly an ad for Growth Engine X (and contains a Clay affiliate link). The framing is "this is easy, but you should also hire us."
- "Almost anyone's email" is a real qualifier: catch-alls, personal domains, and weird corporate setups will fail.

### Not addressed

- What happens when a domain hard-blocks SMTP probing (some servers detect and rate-limit verification traffic).
- Whether the cached 20M-email database has decay (people change jobs; ~25%+/year staleness is normal in B2B data).
- Cost numbers per lookup at each tier — would be useful for ROI math.

---

## Relevance to BuildOS

**Direct product relevance: low.** This is outbound sales tooling, not productivity tooling.

**Workflow relevance: medium.** The Claude Code patterns (clarifying-questions suffix, plan-first, build-local-then-deploy, save-as-skill, trigger.dev + Supabase deployment template) are reusable for any internal tool we build — e.g., the BuildOS waitlist enrichment, founder-context research scripts, or the `youtube-to-skill` workflow we already have.

**Lead-gen relevance: medium-high if/when we run cold outreach.** If BuildOS ever needs to email creators, indie devs, or specific personas at scale, the waterfall pattern (Million Verifier → Prospeo → Lead Magic) is the right architecture. Don't pay enrichment-platform prices for the 80% of contacts whose emails are guessable.

---

## Quick-Reference Cheat Sheet

```
Email-finding waterfall:
  1. Get first_name, last_name, domain (LinkedIn or other source)
  2. Generate top-10 permutations
  3. Validate via Million Verifier (or mailtester.ninja)
     → accept only status "okay"
  4. If no hit: Prospeo.io  (handles catch-alls via BounceBan)
  5. If no hit: Lead Magic   (specialist catch-all)
  6. If no hit: Blitz API    (general fallback)
  7. Cache every result in your own DB to avoid re-paying

Claude Code prompt template:
  - Describe input data + goal
  - Specify the API waterfall + fallback rules
  - Specify acceptance criteria (status "okay" only)
  - Defer deployment concerns ("locally first")
  - End with: "ask me 5–10 clarifying questions before building"

Deploy stack:
  - trigger.dev for scheduled / async runs
  - Supabase for the result cache
  - Register the finished tool as a Claude Code skill
```

---

## Quotes Worth Keeping

> "Anybody can do that."
> — On building this whole tool in Claude Code.

> "If you just ask it to ask you clarifying questions, then you'll end up making much better plans because it'll include things that you weren't going to include before."
> — The headline trick of the video.

> "I've been keeping my own database of emails, and now we have over 20 million emails that we've saved because we've just been storing them."
> — The argument for building your own waterfall instead of paying per-lookup forever.

> "Jesse has spent his entire life figuring out catch-all emails. That is something that's worth paying for, and you don't want to figure it out yourself."
> — Useful framing for build-vs-buy in any specialist domain.
