<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/calm_software_design_review/references/operations-and-roadmap.md -->

# Calm Operations & Roadmap Audit

Use this reference when reviewing a roadmap, feature list, team operating model, hiring plan, or per-feature metrics — the org behind the product. These checks come from Fried/DHH and Saarinen and explain why some products _can't_ feel calm: the company shipping them isn't. Also use it to triage which features are main-quest, which are side-quest, and which are engagement manufacturing in disguise.

## The main-quest / side-quest discipline (Saarinen)

For every feature, campaign, partnership conversation, and UI element under review, ask one question:

> Does this progress the main quest line — the company's core value proposition — or is this a side quest?

If side quest, defer or delete. The discipline does two things at once:

- **It kills feature creep at the source.** A team of <10 people cannot afford side quests. Even a team of 50 (Linear's scale through 10,000 paying customers) could not afford them.
- **It exposes engagement-manufacturing for what it is.** Streaks, badges, gamification, celebration confetti, re-engagement nags — almost always side quests. They appear when the team has stopped trusting the main quest to retain users on its merits.

The trap is treating "main quest" as ineffable. It isn't. For Linear: issue tracking and project management for software companies. For Things: personal task management as a private artifact. For Basecamp: low-stress project communication for small teams. For BuildOS: a thinking environment that turns messy thinking into structured work for people making complex things. If a feature does not directly advance that, it is a side quest.

## Calm-operations checklist

- **Default-no policy on new features.** The roadmap has visible refusals. If everything proposed makes it onto the plan, the team isn't editing.
- **Hire when it hurts** — not when revenue passes a threshold, not when a board deck says headcount should grow. Hire when work is observably breaking.
- **No mandatory meetings; written async first.** Decisions live as long-form posts in a persistent place, not as Slack threads or whiteboard photos. Verbal traditions tax everyone with repetition.
- **Profit > valuation framing.** The funding model is upstream of the culture. Profit funds calm; growth-at-all-costs funds crazy.
- **Internal MVP before external launch.** Every feature ships behind an internal flag and is used by the team for at least a week before any external opt-in.
- **7-day zero-bug fix window.** (Saarinen.) Bugs are defects. The team fixes within a week or pulls the feature back.
- **No A/B tests as a crutch.** A/B tests are appropriate for funnel optimization at scale; they are not a substitute for judgment on product direction. If the team can't decide between two designs without testing, the team doesn't have a point of view.
- **No engagement-driven feature goals.** Per-feature WAU targets are the engine that ships streaks. Company-level retention goals are fine; per-feature goals are calm-school violations.
- **Cycles + cooldowns.** (6-week + 2-week, Basecamp; or 1–2 week, Linear.) Time is fixed, scope is variable. Cooldowns are structured permission to fix the small things and breathe.
- **Sabbaticals or extended-rest mechanisms exist** (or are planned). Calm at scale requires structural rest.
- **Hiring is not hazing.** Real work samples, fewer rounds, shorter, sample-based. The interview is a sample of how the company operates — if hiring is hazing, working there will be hazing.

## Org-side red flags

Each is sufficient on its own to log an operations finding; flag them as practices that will leak into the product if uncorrected.

- **Per-feature engagement metrics on the team's wall** — leading indicator that engagement manufacturing is coming.
- **A roadmap with no visible refusals** — if every proposed feature shipped, the team isn't editing.
- **Configurability instead of opinion** — settings panels growing past a single screen-height because the team couldn't decide.
- **Verbal-tradition org** — decisions live in Slack threads and meeting memories instead of long-form persistent posts.
- **"It's crazy at work" language** — the phrase reframes a series of choices as a force of nature; stopping the language is part of stopping the pattern (Fried/DHH).
