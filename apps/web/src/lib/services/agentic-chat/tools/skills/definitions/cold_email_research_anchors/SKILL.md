---
name: Cold Email Research Anchors
description: Child skill for finding a reason to email a specific person — research one named prospect for outreach, mine a specific, real, recent anchor, grade it on the 0–5 specificity ladder, and write the bridge that makes the anchor cause the email. Use for "find a reason to email this person," "research this prospect," or any strategic, investor, recruiting, PR, podcast, partnership, or founder-led outreach that needs more than name/title/company. For segment-level signal design use cold_email_icp_signal_design; for building lists use lead_list_research.
skill_type: procedure # procedure | reference | strategy | resource | policy | orchestration
altitude: domain # task | domain | meta
activation: progressive # always_on | progressive | invoked
parent_id: cold_email_engagement_first_outreach
depth: 1
preserve_markdown: true
legacy_paths:
    - cold_email_outreach.research_anchors
    - cold_email_outreach.smykm
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_research_anchors/SKILL.md
---

# Cold Email Research Anchors

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Contract → Policy → Knowledge → Related Tools → Provenance.
  This file is skill_type: procedure, so Activation + Procedure carry the flow while Judgment carries the
  grading rubrics (specificity ladder, bridge/semantic-fit guards, privacy boundary). The mode/surface tables
  are Knowledge; named sources (McKenna / Holland / Elias) are collected under Provenance.
-->

## Identity

Use this child skill when one named, high-value, or relationship-sensitive recipient needs a real reason for the email. The bar (Sam McKenna, Show Me You Know Me): the buyer can tell whether the sender paid attention. The research line must signal care, not surveillance.

## Activation

- The anchor is only name, title, company, location, or generic industry
- The draft says "saw your recent post" without naming the post or its point
- The recipient is high-value, senior, or relationship-sensitive
- The bridge from research to offer feels decorative or removable
- The user needs one excellent email, not a scale template

## Judgment

### The Specificity Ladder (0–5)

Minimum shippable anchor for strategic or single-target outreach is **Level 3** (research bar shared with `cold_email_outreach_compiler` strategic mode).

| Level | What it is                                                                                           | Example anchor                                                                                                                                   |
| ----- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0     | Name/title/company only — pure firmographic/demographic relevance (Becc Holland's two weakest types) | "As VP of Sales at Acme…"                                                                                                                        |
| 1     | Generic industry or stack observation any competitor could make                                      | "Logistics teams are under margin pressure this year." / "Noticed you run HubSpot."                                                              |
| 2     | Vague or decorative reference — unnamed activity, or personal overlap with no business consequence   | "Saw your recent post — loved it." / "Fellow Eagle Scout here!"                                                                                  |
| 3     | Specific, named, verifiable public detail: post + the point made, article, hire, initiative, trigger | "Your post Tuesday argued SDR comp should weight meetings held, not booked — and you just opened two RevOps roles."                              |
| 4     | Exact quote from a podcast/talk/interview, or detailed buyer language in their own words             | "In the Pavilion interview you described sales onboarding as 'getting the whole band in time.'" (McKenna's CEO-of-LinkedIn hook worked this way) |
| 5     | Real mutual contact or genuine insider context, accurately represented                               | "Maria Chen said you're rebuilding the partner program and suggested I write."                                                                   |

Grading guards:

- **Two-people test (Becc Holland):** if the anchor line could be sent to a second prospect unchanged, it is relevance, not personalization — cap it at Level 1–2 unless it is a strong trigger event, and never pay 1:1 research cost for a 1:many line.
- **Trigger strength (Becc Holland's relevance ranking):** firmographic < demographic < technographic < trigger-based. A bridgebound trigger (public news, job change, hiring, public statement) is the strongest scalable hook and often grades Level 3 on its own.
- **Freshness:** trigger anchors decay fast after the event — treat triggers older than ~30 days and quotes/content older than ~12 months as stale and re-dig (internal default; Holland and McKenna source the decay direction, not the numbers).

### Bridge-Integrity Test + Semantic-Fit Guard

**Bridge test (binary, Sam McKenna):** remove the hook — does the reason for outreach collapse?

- Reason still makes sense → the hook is decorative. Rewrite until the anchor _causes_ the email.
- Reason collapses → the bridge is real. Ship it.

Bad: "Saw you like Rush. We sell sales training."
Better: "Saw your interview where you described sales onboarding as 'getting the whole band in time.' That is why I am writing: we found two onboarding gaps that usually show up when teams scale past 20 reps."

**Semantic-fit guard (McKenna's context-miss failure mode):** AI word-matching produces absurd anchors — her example is a sales-training company messaged about a Turkish military training accident because "training" matched. Before using any mined or AI-suggested anchor, read it in its original context and confirm: (a) it means what the email assumes it means, (b) it is about this recipient, (c) the recipient would recognize it instantly. Fail any one → discard the anchor.

### Privacy / Invasiveness Boundary

Heuristic (internal default, in the spirit of McKenna's care-not-surveillance rule): would the recipient be comfortable hearing exactly how you found this? If not, do not use it.

**Fair game:**

- Anything they published professionally: posts, articles, talks, interviews, podcasts, bios
- Company-level public record: filings, earnings calls, press releases, launches, job postings, hires
- Public job changes, promotions, awards, conference appearances
- A real mutual contact, named only with that contact's awareness
- Public product/work output: GitHub, portfolio, published writing, reviews they wrote

**Forbidden (creepy or off-limits):**

- Personal facts with no business bridge: family, kids, home, real-estate records, vacation photos
- Non-professional social accounts (personal Instagram/Facebook) even if technically public
- Health, religion, politics, lawsuits-as-gossip, or anything implying physical tracking ("saw you at the gym")
- Deep-dig obscurities a stranger should not know: old forum posts, court records, leaked or private data
- Implying familiarity you do not have ("great catching up at SaaStr" when you never met)

A Level 5 insider anchor that violates this list is worth less than a clean Level 3. Privacy beats specificity.

## Procedure

1. Identify the recipient type and pick research surfaces from the surface map below.
2. Mine candidate anchors: specific, real, recent, verifiable. Prefer trigger events (Craig Elias) — changes are predictable and publicly observable.
3. Grade each candidate on the specificity ladder. Keep the best; keep one fallback.
4. Run the bridge-integrity test and the semantic-fit guard.
5. Run the privacy boundary check.
6. Write the bridge sentence: why this anchor causes the outreach and why the offer helps the recipient now.
7. Return the output contract. If nothing reaches Level 3 for strategic/single-target outreach, refuse and report what was searched (see Policy).

## Contract

- Recipient type and mode-specific standard used
- Anchor: exact detail or quote, source, and date
- Ladder grade (0–5) with one-line justification
- Bridge sentence (the line that makes the anchor cause the email)
- Freshness note: anchor age and whether it is inside the decay window
- Boundary check result: pass, or the specific list item it trips
- Fallback anchor (same fields, abbreviated) or "none found"
- Semantic-fit confirmation: anchor verified in original context

## Policy

- Never fabricate, embellish, or assume an anchor. If research surfaces return nothing, say so — an honest Level 1 beats an invented Level 4.
- Refuse to bless anchors below Level 3 for strategic or single-target outreach. Route back to research with the surface map; do not hand a sub-bar anchor to `cold_email_outreach_compiler`.
- Privacy boundaries are non-negotiable. No personal fact ships without a truthful business bridge, and forbidden-list items never ship, regardless of grade.
- Reject decorative personalization: any anchor that fails the bridge test or the two-people test does not count as personalization.
- Discard any anchor that fails the semantic-fit guard — a context-miss anchor is worse than no anchor.
- Do not pitch PR/podcast without named beat and audience fit; do not disguise a sales pitch as customer research.

## Knowledge

### Research-Surface Map by Mode

| Mode                | Mine these surfaces                                                                                                                                         | Anchor standard                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Strategic account   | LinkedIn profile + posts; company news and product launches; recent hires and open roles; earnings call, 10-K, shareholder letter; competitor announcements | Business trigger, buyer struggle, Mobilizer signal, or internal-consensus risk    |
| Executive / founder | Podcast and webinar appearances; interviews and conference talks; personal site or founder letter; their exact public phrases                               | Level 4 preferred — their own language (McKenna executive mode)                   |
| Investor            | Portfolio and published thesis; recent investments; fund announcements; partner's own writing                                                               | Thesis-fit anchor: why this company fits what they already say they want          |
| Recruiting          | Candidate's public work (GitHub, portfolio, talks, posts); career trajectory; tenure in current role                                                        | Their work + trajectory + explicit role fit and constraint                        |
| PR / podcast        | Last 10 articles or episodes; stated beat; audience questions in comments; editorial focus                                                                  | Named beat/episode fit and a reason their audience cares — never pitch without it |
| Customer research   | Real workflow evidence: community posts, reviews, public complaints, recent behavior                                                                        | Current workaround or struggling moment — never a disguised sales pitch           |

Trigger-watch surfaces, all modes (Craig Elias's six free monitors — _practitioner_): LinkedIn job-change notifications and saved searches; Google Alerts ("appointed VP…"); job postings; "left the company" email bounces; competitor announcements; prospect self-disclosure ("call me in six months" = they are in the window). Elias: a change in decision maker is the highest-leverage trigger — new-in-role hires are likelier Mobilizers — and one job change fires four opportunities (destination company, origin backfill, and both companies' vendors).

## Related Tools

- `util.web.search`
- `util.web.visit`

## Provenance

- **Sam McKenna** (_practitioner_) — Show Me You Know Me thesis (care-not-surveillance bar), the binary bridge test, the semantic-fit / context-miss failure mode, and executive-mode "their own language" (Level 4) standard.
- **Becc Holland** (_practitioner_) — the two weakest anchor types (Level 0), the two-people test, and the relevance ranking (firmographic < demographic < technographic < trigger-based).
- **Craig Elias** (_practitioner_) — trigger-event doctrine, the six free trigger monitors, decision-maker change as highest-leverage trigger, and one-job-change-fires-four-opportunities.
- **Freshness thresholds** (_internal default_) — the ~30-day trigger / ~12-month content decay windows are internal defaults; Holland and McKenna source the decay direction, not the numbers.
- **Privacy / invasiveness boundary** (_internal default_) — heuristic and fair-game/forbidden lists are internal defaults, in the spirit of McKenna's care-not-surveillance rule.
- **Level-3 minimum bar** (_internal default_) — research bar shared with `cold_email_outreach_compiler` strategic mode.
