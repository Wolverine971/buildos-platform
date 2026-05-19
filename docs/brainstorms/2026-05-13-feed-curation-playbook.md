---
date: 2026-05-13
topic: feed-curation-playbook
status: brainstorm — risk-mitigation design
companion_to:
    - docs/brainstorms/2026-05-11-buildos-agent-feed-brainstorm.md
    - docs/brainstorms/2026-05-12-buildos-feed-10x-vision.md
    - docs/brainstorms/2026-05-13-cross-agent-context-layer.md
    - docs/brainstorms/2026-05-13-feed-and-context-layer-handoff.md
trigger: handoff-review feedback identified curation quality as the single riskiest assumption
path: docs/brainstorms/2026-05-13-feed-curation-playbook.md
---

# Feed Curation: The Playbook

## The Risk, Stated Plainly

The single riskiest assumption in the whole design is that **agents will post high-signal, grounded, decision-worthy cards** instead of turning the feed into another noisy inbox. The product succeeds or fails on the quality of what reaches the screen.

This isn't a polish concern. It's the load-bearing assumption. Get this wrong and:

- The PDB analogy collapses. A real PDB doesn't include "the Joint Chiefs had a meeting today." It includes things the President must act on or imminently care about.
- The brand promise collapses. The anti-feed reframe — "the inverse of social media" — only holds if a glance at the feed makes you feel oriented, not behind.
- The trust collapses. Users only need to see one low-signal card to start triaging. Once they're triaging, the feed has failed.
- The reframe to "chief of staff in a box" stops being defensible. A noisy chief of staff is just a worse inbox.

The natural slope of any "agents can post" system is toward more posts, not fewer. Agents are cheap to run. Cheap to run means cheap to post. **Curation discipline must be designed in from day one, at every layer.**

---

## The Reframe: The Curator IS the Product

The feed is not the product. The **curator that decides what reaches the feed** is the product. Briefer is not a nice-to-have personality layer on top of a feed — Briefer is the editorial chief whose entire job is to defend the user's attention.

This reframe changes a few things:

- Briefer is in v1, not v2. The MVP cannot ship without an editor.
- Every other agent's relationship to the feed is **submission, not posting**. Agents submit candidate cards; Briefer publishes them (or doesn't).
- The Decisionability Test becomes a first-class schema requirement, not a guideline.
- The system is built to _reject_ more than it accepts. Most agent-generated content never reaches the user.

---

## Six Layers of Curation Discipline

No single mechanism is sufficient. Curation has to happen at every layer — submission, gating, display, feedback, learning, and user control.

### Layer 1 — Submission-time discipline (agent side)

Before a card is even submitted, the agent must populate a structured envelope. The format itself rejects vague output:

```
{
  "section": "DECISIONS_NEEDED" | "MOVING" | "WATCHING",
  "project_handle": "payments",
  "title": "≤ 80 chars, declarative",
  "summary": "≤ 240 chars, action-oriented, signed",
  "why_it_matters": "ONE sentence justification. Required.",
  "decision_required": boolean,
  "decision_question": "the literal question for DJ" | null,
  "decision_deadline": ISO 8601 | null,
  "awareness_value": "high" | "medium" | "low",
  "citations": [{ ref, title, date }, ...]
}
```

Reject at the submission API if:

- `why_it_matters` is empty or fluffy ("FYI", "for your awareness")
- `section = DECISIONS_NEEDED` but `decision_question = null`
- `awareness_value = low` and `decision_required = false` (nothing to do here)
- No citations at all (ungrounded)

This is editorial discipline encoded as schema. Agents can't be lazy because the format won't let them.

### Layer 2 — Briefer gate (LLM editor)

Every submitted card runs through Briefer before publishing. Briefer is a fast LLM call (Haiku-class, ~1s) that does four things:

1. **Score signal.** "Is this decision-worthy? Is this awareness-worthy? Is this noise?" Output: pass / downgrade / reject.
2. **Downgrade section.** A `DECISIONS_NEEDED` submission with weak decision-question gets moved to `MOVING`, or rejected.
3. **Merge with related open cards.** If there's already an open card on this project covering the same topic, merge — don't double-post.
4. **Tighten the writing.** Enforce the PDB voice register; rewrite if needed.

Briefer can reject with feedback. The agent receives the rejection reason so it can learn ("this card was rejected because the decision wasn't clear — restate as a question and resubmit"). This loop trains agents to submit better over time.

### Layer 3 — Quotas and cooldowns (rate discipline)

Even with quality gating, raw volume is a failure mode. Cap it:

- **Per-agent per-day quota**: e.g. 3 `DECISIONS_NEEDED` + 10 total cards per agent per day. Excess queues for next day or auto-merges.
- **Per-agent cooldown**: same agent + same project can't submit twice within 15 minutes. Forces batching.
- **Global daily ceiling**: hard cap on cards shown to the user — e.g. 12 cards total across all sections per day. Beyond that, Briefer rolls up: "and 6 other moves today."

Quotas are configurable per agent. A trusted agent earns higher quotas over time.

### Layer 4 — Display-time roll-up

By the time cards reach the screen, multiple low-signal events from the same project should appear as **one card with bullets**, not five separate cards:

> **[■ payments]** Briefer · 6:00am
> Payments project advanced overnight.
> • Claude shipped webhook handler (PR open)
> • 3 follow-up emails drafted
> • Stripe call moved to Wed
>
> _Recommended next: review the PR before merge._

This is the difference between a memo and an inbox. Same content; different cognitive load.

### Layer 5 — Post-display feedback loop

The user's behavior teaches the system what's signal vs noise:

- **Acted on in < 30s** → strong positive signal. Agent reputation +.
- **Acted on after > 5min** → ambivalent.
- **Dismissed without action** → strong negative signal. Agent reputation -.
- **Snoozed** → neutral (user agrees it matters, just not now).
- **Never seen (rolled up away)** → neutral.

Each agent accumulates a reputation score. Low-reputation agents get tighter gates, smaller quotas, more aggressive Briefer scrutiny. High-reputation agents earn looser thresholds and faster publishing.

### Layer 6 — User controls and weekly retro

Even with all the above, the user needs override:

- **Mute agent.** Per-agent, per-project, or globally. Time-bounded (an hour, a day) or permanent.
- **Threshold dial.** "Show me everything" ↔ "show me only urgent." A single global signal-to-noise slider.
- **Weekly retro card.** Every Sunday, Briefer audits the past week:
    > _"We published 47 cards this week. 12 got fast action, 8 got deferred, 27 got dismissed without action. The pattern in dismissed cards: Claude's status updates on the Resume project — none acted on. Tightening Claude's threshold there. Want to override?"_

The retro turns curation into a continuously-tuning system, with the user in the loop. The user isn't just consuming curation; they're shaping it.

---

## The Decisionability Test (The Most Important Single Rule)

If we could only ship one piece of curation discipline, it would be this: **every card must pass the Decisionability Test before publishing.**

The test is one of two questions:

1. **Does this require a decision from the principal?** If yes — what's the question, by when?
2. **Does this change the principal's understanding in a way they would imminently act on?** If yes — what changes?

If the answer to both is "no," the card is noise. Reject.

This single rule is what makes a PDB feel like a PDB instead of like an inbox. The CIA officers writing the President's Daily Brief don't ask "is this true?" or "is this interesting?" They ask "does the President need this to make a decision in the next 48 hours, or does it change something they're about to act on?" That's the bar.

Encode it in schema. Encode it in Briefer's gate. Encode it in the agent submission prompt. The Decisionability Test is the keystone.

---

## What Actually Ships With v1

Minimum viable curation, included in the 1x MVP (not v2):

1. **The submission schema** — agents can't post freeform. The envelope above is enforced at the API.
2. **The Decisionability Test** — schema-level rejection of cards that don't articulate a decision or awareness change.
3. **Briefer as a one-call gate** — every submission runs through one Haiku-class LLM call that scores pass/downgrade/reject, with a 1-sentence reason. No merging yet. No rewriting yet.
4. **Per-agent quotas** — 3 `DECISIONS_NEEDED` + 10 total per agent per day, hardcoded.
5. **Same-project cooldown** — 15-minute window.
6. **Dismissal as negative signal logged** — even if the feedback loop doesn't yet adjust agent thresholds, log dismissals so we can analyze the first week.
7. **Mute agent for 24h** — one user control, exposed in the card overflow menu.

What's deferred to v2:

- Briefer roll-up (multi-card merging)
- Per-agent reputation that adjusts thresholds automatically
- Voice/format rewriting by Briefer
- Global threshold dial
- Weekly retro card with audit

That v1 set is shippable in the original 1–2 week window. The Decisionability Test alone covers ~70% of the noise risk; the rest of the layers compound the protection.

---

## What Makes This Hard

The hard parts are not the mechanisms — those are mostly straightforward LLM-grader plumbing. The hard parts are calibration:

- **False negatives.** Over-tightening rejects things the user actually wanted to see. Worse failure mode than false positives, because the user never knows what was hidden.
- **Calibrating "awareness value."** When is a status update genuinely useful awareness vs noise? Borderline cases are common. Briefer needs a sharp prior.
- **Briefer's own taste.** Briefer is itself an LLM. If its judgment is mediocre, the whole curation collapses. The Briefer system prompt is the most consequential piece of design in the entire product.
- **The cold-start problem.** With no reputation data and no dismissal history, every agent starts at the default threshold. The first week is the noisiest week.
- **Trust recovery.** Once the user sees a few low-signal cards, they stop trusting the feed quickly. Trust is asymmetric: takes weeks to build, hours to lose.
- **The legitimate noisy day.** Some days _really do_ have 30 things happening. The feed has to handle real busy days without either drowning the user or hiding important things.

---

## Strategic Note

This playbook implies a small but real positioning shift:

The 10x doc framed the product as "a chief of staff in a box." This playbook sharpens it: the product is **an editor in a box**. The chief of staff metaphor implies an assistant who _does things_. The editor metaphor implies an assistant who _decides what reaches you_. Both are true, but the editor function is what makes the chief-of-staff function trustworthy.

This is also content-marketing fodder. "I built an AI that says no to other AIs on my behalf" is itself a viral-grade anti-feed cluster post. The Decisionability Test is a quotable artifact.

---

## Open Questions

- **What's Briefer's first system prompt?** This is the single most consequential piece of LLM design in the whole product. Worth a dedicated session.
- **What's the right default agent quota?** 3+10 per day is a guess. Real usage will calibrate, but the first-week default sets the tone.
- **Do all agents submit, or do trusted ones get fast-path posting?** E.g., is BuildOS itself a privileged agent that can bypass Briefer for certain card types?
- **How is "rejected" surfaced to the agent?** Synchronous response to the submission API? Async via a separate "rejected submissions" log the agent can read?
- **Reputation portability.** If an agent gets a great reputation in one workspace, does that transfer to another user's workspace? (Probably no — too easy to game.)
- **Public Decisionability rule.** Should the rule be a public-facing thing ("BuildOS only shows you what passes the Decisionability Test")? Marketing differentiator or unnecessary inside-baseball?

---

## Next Steps

1. **Draft Briefer's first system prompt** — including the Decisionability Test in plain English. This is the unblock for the v1 curation layer.
2. **Update the handoff packet** to reflect that curation is now considered v1 scope, not v2. The shipping plan table in the handoff doc should be updated.
3. **Decide whether to publish the Decisionability Test as a public artifact** in the marketing. "Here's the bar your agents have to clear to be published in your brief" is itself a strong positioning statement.
4. **Wire dismissal logging from day one** — even before any threshold adjustment is built. The week-one dismissal data is gold.
