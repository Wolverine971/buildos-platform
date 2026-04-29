---
title: 'Stop Managing Tickets, Start Managing Thinking: A Workflow Architecture for Tech PMs'
description: 'Why your projects are failing between tools — and the workflow patterns that actually fix it. A practical guide for tech project managers drowning in context fragmentation.'
slug: 'tech-pm-workflow-architecture'
author: 'DJ Wayne'
date: '2026-03-28'
lastmod: '2026-03-29'
category: 'Productivity'
tags:
    [
        'project-management',
        'workflow',
        'tech-pm',
        'context-engineering',
        'productivity',
        'tools',
        'sprint-planning',
        'technical-debt'
    ]
featured: true
published: true
seo:
    title: 'Tech PM Workflow Architecture: Stop Managing Tickets, Start Managing Thinking'
    description: "The #1 reason tech projects stall isn't bad engineers or bad tools — it's scattered thinking. Here's how to fix your workflow architecture."
    keywords:
        [
            'tech project manager workflow',
            'context switching productivity',
            'sprint planning problems',
            'project management tools',
            'technical project management',
            'shape up methodology',
            'engineering team productivity'
        ]
readingTime: 15
path: apps/web/src/content/blogs/productivity-tips/tech-project-managers-guide.md
faq:
    - q: 'What is the biggest productivity killer for tech project managers?'
      a: 'Context fragmentation — project thinking scattered across multiple tools like Slack, Jira, Confluence, and Google Docs. Research shows knowledge workers toggle between apps 1,200 times per day, and it takes roughly 23 minutes to refocus after each interruption.'
    - q: 'What are appetites in project management and how do they replace estimates?'
      a: 'Appetites come from Basecamp''s Shape Up methodology. Instead of asking "how long will this take?" you ask "how much time is this problem worth?" Time becomes a design constraint that drives creative scoping decisions, rather than a deadline imposed after estimation theater.'
    - q: 'How do decision logs improve engineering team productivity?'
      a: 'Decision logs capture the choices your team made and why — not task completion percentages. They survive people leaving, prevent teams from re-deriving the same conclusions, and compound over time into an intellectual history that makes every future decision faster.'
    - q: 'What is impact mapping and how does it connect goals to engineering tasks?'
      a: "Impact mapping (from Gojko Adzic) creates a chain from Goal to Actors to Impacts to Deliverables. Every ticket traces back to an actor and a behavior change, so engineers understand why they're building something — not just what to build."
    - q: 'How do you get an engineering team to start writing things down?'
      a: "Start by being the scribe yourself — write the decision records after meetings, and the team's only job is to correct inaccuracies. Find the question that gets asked three times a week, write one document answering it, and share the link next time someone asks. Frame documentation as meeting elimination, not more writing."
---

Here's an uncomfortable truth: your projects aren't failing because your engineers are slow. They're not failing because you picked the wrong sprint methodology or the wrong issue tracker. They're failing because the _thinking_ behind the project is scattered across seven tools and fifteen Slack threads, and nobody — including you — can point to one place where it all lives.

You know this. You feel it every Monday morning when you spend the first 90 minutes reconstructing context you already had last Friday. You feel it when a stakeholder asks "why are we building this?" and you have to go on a scavenger hunt through Confluence, Slack, Jira, a Google Doc from March, and that one whiteboard photo on someone's phone.

A [Harvard Business Review study](https://hbr.org/2022/08/how-much-time-and-energy-do-we-waste-toggling-between-applications) found that the average knowledge worker toggles between apps **1,200 times per day** — roughly once every 24 seconds. UC Irvine researcher Gloria Mark's work shows it takes roughly **23 minutes** to fully refocus after a single interruption. Do the math on that and you'll understand why your sprint velocity is a fiction.

This isn't a tools problem. It's a thinking architecture problem. And fixing it is the single highest-leverage thing you can do as a tech PM.

## The Tool Stack Autopsy

Let's be honest about what's actually happening in your workflow.

### The Slack Graveyard

A critical architecture decision happens in a Slack thread at 3pm on a Tuesday. An engineer explains why the team should use WebSockets instead of polling. Three people react with thumbs up. The tech lead adds a caveat about connection limits. Someone replies "sounds good, let's go with that."

That decision now lives exclusively in a Slack thread that will be buried by tomorrow morning. Three months later, a new engineer joins the team and chooses polling. Nobody remembers the original conversation. You just lost two weeks of work.

This happens constantly. Slack is where decisions go to die.

### The Context Gap

Your issue tracker — Jira, Linear, Asana, whatever — manages _what_ you're building. It has no concept of _why_. The goal-to-task linkage lives in your head, and the architecture decision that shaped the approach is in a Confluence page last updated eight months ago. The tracker manages execution, not thinking.

Here's where every tool stack actually breaks:

**Between Figma and Jira.** Design evolves through Figma comments and threads. The Jira ticket still reflects the original spec. Engineers build to the ticket. You ship the wrong thing.

**Between meetings and everything else.** A stakeholder says "let's cut scope on feature X" during a Zoom call. It lands in someone's meeting notes, maybe. The board doesn't reflect it for days. Engineers keep building the cut feature.

**Between goals and tasks.** Why are you building this specific microservice? The OKR lives in a Google Sheet. The roadmap lives in your PM tool. The tickets live in Jira. The connection between them exists in exactly one place: your brain.

**Between documentation and reality.** Everyone has a Confluence space or a Notion workspace. Nobody updates it. The docs describe the system as it was six months ago. New team members learn the wrong architecture. Decisions get relitigated because the original rationale is lost.

The problem isn't any single tool. The problem is that **project thinking fragments across the gaps between tools**, and nobody owns those gaps.

## The Three Patterns That Actually Work

After talking to dozens of tech PMs and digging through what actually moves the needle, three workflow patterns stand out. None of them require a specific tool. All of them require a shift in how you think about your job.

### Pattern 1: Appetites Over Estimates

Basecamp's Shape Up methodology has one insight that's worth the entire book: **stop estimating how long things take and start deciding how much time they're worth.**

Traditional sprint planning is estimation theater. An 8-person team easily burns 4-6 hours of collective time per sprint on estimation activities — backlog grooming, sprint planning, story pointing — and the estimates are still wrong. Software estimation for complex work is mathematically impossible. Requirements are incomplete, dependencies are hidden, and codebases have emergent complexity that no planning poker session can predict.

The Shape Up alternative: **appetites.**

Instead of asking "how long will this take?" ask "how much time is this problem worth?" That's a fundamentally different question. The first invites sandbagging and negotiation. The second forces a real conversation about priority and scope.

Here's how it works in practice:

**Scenario: Your team needs to rebuild the notification system.**

Old way: You write a spec. Engineers estimate 6-8 weeks. Stakeholders want it in 4. You "negotiate" to 5 weeks. Six weeks later, it's still not done. Everyone's frustrated.

Appetite approach: You decide the notification rebuild is worth a **4-week appetite**. You shape the work to fit that constraint — what's the smallest version that solves the real problem? Maybe that means rebuilding push notifications but keeping email notifications on the old system for now. Maybe it means a simpler preference UI than the one in the Figma file. The constraint drives creative scoping decisions instead of just creating deadline pressure.

If it's not shippable in 4 weeks, you don't extend the deadline. You ask: did we shape the problem wrong, or is this actually a bigger bet than we thought? Either way, you get information instead of status meetings about delays.

**The key shift:** Time becomes a design constraint, not a deadline imposed after the fact.

### Pattern 2: Decision Logs Over Status Updates

Your weekly status meeting is a waste of everyone's time. You know it. They know it. It persists because nobody has proposed a better mechanism for stakeholder alignment.

Here's the replacement: **decision logs.**

As Ross Snyder [wrote in the PMI Learning Library](https://www.pmi.org/learning/library/hate-project-status-meetings-5045): "The weekly meeting should not be used to _report_ status — it may be used to _discuss_ status." When team members go person-by-person saying "last week I worked on what I was supposed to work on," you're burning 30 minutes of everyone's time to learn nothing.

A decision log captures the thing that actually matters: **the choices your team made and why.** Not task completion percentages. Not burndown charts. The actual thinking.

Format is dead simple:

```
Decision: Use operational transforms for real-time sync (not CRDTs)
Date: 2026-03-10
Context: Need conflict resolution for collaborative editing feature
Alternatives considered: CRDTs (too complex for v1), last-write-wins (poor UX)
Decided by: Engineering team + PM
Reversible? Yes, but would require significant refactoring
```

When a stakeholder asks "why are we building it this way?" — you send them a link. When a new engineer asks "why didn't we use CRDTs?" — same link. When six months from now you're planning v2 and need to revisit this choice — the context is right there.

Decision logs do three things status updates never will:

1. **They survive people leaving.** Status updates live in someone's head. Decision logs persist.
2. **They prevent relitigating.** "We already decided this, here's why, here's the context." No 45-minute meeting to re-derive the same conclusion.
3. **They compound.** After six months of logging decisions, you have an intellectual history of the project that makes every future decision faster.

Amazon figured this out years ago with their PR/FAQ process — write down the _thinking_ before you build. The decision log is the lightweight version of this that works for any team.

### Pattern 3: Impact Mapping for Goal-Task Linkage

The most dangerous moment in any project is when engineers lose sight of _why_ they're building something. This is when you get gold-plated solutions to the wrong problems, scope creep that "seemed like a good idea," and perfectly executed features that nobody uses.

Impact mapping (from Gojko Adzic) fixes this with a simple chain: **Goal → Actors → Impacts → Deliverables.**

Most teams jump straight from a business objective to a feature list. "We need to improve retention" becomes "build a notification system, add a referral program, redesign the onboarding flow." Why those features? How do they connect to retention? Which actors are we trying to impact? What behavior change would indicate success?

Impact mapping forces those questions before you write a single ticket.

**Scenario: Leadership wants to reduce churn by 20%.**

Without impact mapping, the PM gets a list of feature requests from various stakeholders and tries to prioritize them. Engineers build the loudest request first. Three months later, churn hasn't moved.

With impact mapping:

```
Goal: Reduce churn by 20% in Q3

Actors:
  - Power users (low churn risk, high expansion potential)
  - Trial users (highest churn risk, week 1 is critical)
  - Team admins (decision-makers for renewal)

Impacts (behavior changes we need):
  - Trial users complete onboarding in first session
  - Team admins see team-wide ROI dashboard before renewal
  - Power users discover advanced features within 30 days

Deliverables (things we might build):
  - Guided onboarding flow (targets trial users)
  - Admin ROI dashboard (targets team admins)
  - Feature discovery prompts (targets power users)
```

Now every ticket traces back to an actor and a behavior change. When an engineer picks up the admin dashboard ticket, they don't just see "build dashboard" — they see "this exists so team admins can see ROI before renewal, targeting the churn reduction goal." They'll make better micro-decisions about what data to surface, what to cut, what matters.

The impact map is also your conversation tool with stakeholders. When someone suggests adding a feature that doesn't trace to any actor or impact, you have a framework for saying "interesting idea, but how does it connect to reducing churn?" That's not pushback — it's alignment.

### How These Three Patterns Work Together

Individually, each pattern solves one problem. Together, they form a system.

You start with the **impact map** — that's the foundation. It tells you what you're trying to change, for whom, and how you'll measure it. Then you set an **appetite** for the work: how much time is this behavior change worth? The appetite constrains the scope; the impact map ensures you're constraining toward the right outcome, not just cutting blindly. As the team works, every significant choice goes into the **decision log** — anchored back to the impact map's goals. When someone asks "why did we cut feature Y?" the decision log has the answer, and the impact map has the reason.

Monday morning, instead of reconstructing context from seven tools, you check three artifacts: the impact map (are we still aimed at the right outcome?), the decision log (what changed since last week?), and the appetite clock (are we on track or do we need to re-shape?). That's 15 minutes instead of 90.

Later, I'll walk through exactly how adoption plays out week by week — because the hardest part isn't understanding these patterns, it's getting a team to actually use them.

## Three Scenarios You'll Recognize

### The Migration That's Already Behind

**The situation:** You're 3 weeks into a 6-week API migration. The original estimate was optimistic (they always are). The legacy system has undocumented edge cases that keep surfacing. Engineers are frustrated. Your skip-level wants a status update Thursday.

**What most PMs do:** Try to "manage up" with a positive spin. "We're making good progress, just some unexpected complexity." Add buffer to the remaining estimate. Hope it works out.

**What actually works:**

First, stop treating the timeline as a promise. It was always a guess — now it's a guess with new information. Your job is to surface that information clearly, not to spin it.

Write a one-page project brief that answers three questions:

1. **What did we learn?** (The legacy system has 14 undocumented edge cases in payment processing. We've resolved 9. The remaining 5 are in order fulfillment and affect ~8% of transactions.)

2. **What are our options?** (A: Continue as planned, estimated 3 additional weeks. B: Ship the migration for non-payment endpoints now, tackle payment endpoints in a dedicated follow-up. C: Build an adapter layer that handles edge cases at the boundary.)

3. **What do we recommend and why?** (Option B — we ship value in 1 week instead of 3, payment processing stays stable on the legacy system, and we do the payment migration with dedicated focus rather than as the tail end of an overrun project.)

Send that brief _before_ the Thursday meeting. Your skip-level reads it in 5 minutes. The meeting becomes a 15-minute decision conversation instead of a 45-minute status update where you're ambushed with questions you're not prepared for.

This is what "managing thinking" looks like. You didn't manage the timeline — you managed the _decision_ about what to do with new information.

### The "When Will It Ship?" Stakeholder

**The situation:** The VP of Sales asks you every week when the enterprise SSO feature will be ready. She has a pipeline of deals waiting on it. You've told her Q2 three times but she keeps asking because she doesn't trust the answer.

**What most PMs do:** Repeat the timeline. Get annoyed. Add her to a Jira dashboard she'll never check.

**What actually works:**

She's not asking about the date. She's asking because she has no visibility into the _progress_. A date without context is just a number she can't do anything with.

Give her a living document — one page, updated weekly — that shows:

- **What's done:** SSO framework, SAML integration, admin console UI
- **What's in progress:** SCIM provisioning (this week), session management (next week)
- **What's blocking:** Okta sandbox access (requested, waiting on their team)
- **What's left:** QA, load testing, security review, docs
- **Current confidence:** Medium-high for late Q2 delivery. The Okta dependency is the risk — if it slips past April 15, the timeline shifts by 2 weeks.

Now she has something she can actually use. She can tell her deals "SAML is done, SCIM is in progress, we're on track for late Q2 unless the Okta dependency slips." She stops asking you every week because the document gives her what she needs.

Five minutes of writing replaces thirty minutes of meetings. Every week. For months.

### The Tech Debt Conversation Nobody Wants to Have

**The situation:** Your codebase has a payment processing module that three engineers refuse to touch. Every feature that interacts with payments takes 3x longer because of the workarounds required. Engineering wants to refactor it. Product wants new features. Nobody's winning.

**What most PMs do:** Acknowledge the problem. Add "payment refactor" to the backlog. Watch it sit there for 18 months while product always has something more urgent.

**What actually works:**

Stop framing tech debt as a cleanup task. Frame it as a **capacity investment**.

Morgan Cohn's framework nails this: add a "Cost of Delay" dimension to your prioritization. Don't just ask "should we refactor payments or build feature X?" Ask: **"What gets worse over time if we don't do this?"**

Build the case in language stakeholders understand:

- Every feature touching payments takes 3x longer. That's 3 features per quarter instead of 5.
- We've had 2 payment-related incidents in the last 6 months. Each one cost 40 engineering hours and affected revenue.
- The next three features on the roadmap all touch payments. Without the refactor, that's roughly 9 extra weeks of engineering time.
- Investing 4 weeks now saves 9 weeks over the next two quarters. That's a 225% ROI.

The reframe that works: **"Sometimes, the best feature you can ship is the ability to build the next one faster."**

**And when they still say no?**

It happens. Your best move: **the strangler fig.** Martin Fowler named this pattern after rainforest vines that slowly envelop a host tree. Instead of a dedicated refactor sprint, you wrap new functionality around the legacy code and replace it piece by piece as you build new features. Every feature that touches the payment module improves it slightly. No separate line item on the roadmap. [Shopify's engineering team used this approach](https://shopify.engineering/refactoring-legacy-code-strangler-fig-pattern) to dismantle a 3,000-line God Object — extracting it into bounded contexts incrementally, with every step reversible and monitored.

The other lever is Marty Cagan's 20% rule from _Inspired_: take 20% of engineering capacity off the top for technical health. It's a standing allocation, not a negotiation each sprint. Either way, if leadership declines the investment, put that decision in your decision log — who decided, when, the known risks, the projected consequences. Nobody wants to sign their name next to "accepted the risk of payment system failure."

## "But My Team Won't Write Things Down"

Every PM who's tried to introduce decision logs or project context docs has hit this wall. The team nods in the meeting, agrees it's a good idea, and then nobody does it. This isn't laziness — it's a rational response. Writing things down creates accountability, and most people have been burned by documentation that became busywork with no payoff.

The fix is not to mandate documentation. It's to make the value undeniable before you ask anyone else to contribute.

**Be the scribe first.** You write the decision records. You attend the meeting, you capture the decision, you post it. The team's only job is to correct inaccuracies. This is critical: if you launch with "everyone needs to write ADRs now," adoption dies in week one. If you launch with "I'm going to start writing down our decisions so we stop having the same conversations," nobody objects.

**Start with the question that gets asked three times a week.** Every team has one — "why didn't we use Kafka?" or "what's the deploy process for the billing service?" or "did we decide to support Safari?" Find that question. Write one document that answers it. Share the link the next time someone asks. That single moment — where a link replaces a 10-minute Slack thread — is worth more than any process pitch.

**Frame it as meeting elimination.** Every decision record you write is a meeting you'll never have again. A new team member reads the record instead of requesting a catch-up meeting. A colleague who missed the original conversation checks the log instead of cornering three people for their version of what happened. When you frame documentation as "fewer meetings" instead of "more writing," the calculus changes.

**Keep it in the workflow.** Documentation that lives outside the workflow dies. Michael Nygard's original ADR proposal from 2011 put decision records in the code repository — the same place developers already work. A decision record in a PR or a markdown file next to the code has a much longer half-life than one in a wiki nobody visits.

**Only record significant decisions.** Trying to document everything kills adoption. The signal-to-noise ratio collapses and people stop reading. If the decision wouldn't be worth a 30-minute meeting, it doesn't need a record. This keeps the archive valuable and the overhead low.

## Building Your Context Architecture

Here's the practical framework. This is tool-agnostic — use whatever you have, but organize it this way.

### The Four Layers of Project Thinking

Organize project thinking into four layers:

**Layer 1: The Why (Goals)**
What user outcome are we delivering? What business metric are we moving? What does success look like?

This is the layer that stakeholders care about and engineers need to see. It should be the first thing anyone encounters when they look at the project.

**Layer 2: The How (Decisions + Plans)**
Architecture decisions. Technical approach. Scope boundaries. Tradeoffs we've accepted. Risks we've identified.

Every "why did we choose X?" question should resolve here.

**Layer 3: The What (Tasks + Deliverables)**
Concrete work items. Milestones. Dependencies. Blockers.

This is the layer your issue tracker handles. But it should _link back_ to Layer 1 and Layer 2 — every task connected to a goal, every technical approach traceable to a decision.

**Layer 4: The Context (Research + Learning)**
User interviews. Competitive analysis. Performance benchmarks. Post-mortems. Things we learned along the way.

This is the layer that compounds. Six months from now, this context makes your next project faster.

### The Rule: One Source of Truth for Thinking

What matters is that your team can answer four questions with one link each:

- **Why are we building this?**
- **How did we decide to build it this way?**
- **What's the current state?**
- **What have we learned so far?**

Notion, Google Docs, a dedicated context tool — the tool matters less than the discipline of keeping these four layers connected and current.

### Start Small: The One-Project Experiment

Don't try to migrate everything. Pick one active project — the one causing the most context chaos — and build the four layers for it. Here's what the adoption arc actually looks like:

**Week 1: Plant the seed.**

Spend 30 minutes total. Write one paragraph for the Why (goal, success metric, constraint). Document the last 3 decisions your team made using the format above. Link your existing tickets to the Why document — even a comment with a URL counts. You're the only one writing at this stage. That's fine.

The friction is real in week one. You'll feel like you're doing extra work for no payoff. The template feels bureaucratic. Nobody's sure what counts as a "significant decision." Push through — the first records are the hardest because there's no archive to reference yet.

**Week 2: The first link moment.**

Someone asks a question in Slack that your context doc already answers. You drop the link instead of re-explaining. That single moment — a link replacing a 10-minute thread — is the turning point. When Spotify's engineering teams adopted decision records, the breakthrough was cross-office: engineers in Stockholm started referencing ADRs that New York-based engineers had written, eliminating duplicative conversations entirely.

**Week 3: Others start contributing.**

An engineer logs a decision without being asked — because they saw you do it and it took 5 minutes. A stakeholder bookmarks the project doc because it's more current than the status meeting. The overhead starts to feel lighter than the alternative.

**Week 4: The compound effect kicks in.**

A new team member joins and reads the decision log instead of scheduling four catch-up meetings. Your sprint planning takes 20 minutes less because scope decisions trace to documented reasoning. You have an intellectual history of the project that makes every future decision faster.

UserVoice [went through a similar arc](https://www.uservoice.com/blog/adopting-shape-up) when they adopted Shape Up. After the initial discomfort of abandoning estimates and backlogs, they reported doubling their product releases year-over-year. Not from working harder, but from spending less time on process overhead and more time building.

## A Note on AI

AI can accelerate the patterns above — but only if the patterns exist first.

Meeting transcription that auto-extracts decisions into your decision log? That's real value. AI that synthesizes updates from multiple sources into a stakeholder-ready summary? That saves hours. Tools that turn unstructured thinking into organized projects and tasks — so you dump the chaos in your head and get structure back to review and refine — that's genuinely useful.

What doesn't work: layering AI onto broken processes. If your team doesn't have clear goals, a decision log, or a shared context architecture, AI just automates the mess faster. You get polished summaries with no action logic and false confidence from weak data inputs.

The dividing line is simple: **AI is good at organizing information. It is not good at deciding what matters.** Appetites, decision logs, impact maps — those are judgment calls. AI can maintain them. It cannot replace the thinking behind them.

## The Level-Up

There's a meta-insight that separates tech PMs who manage tickets from tech PMs who ship products:

**Your job is not to track execution. Your job is to create clarity.**

When the thinking is clear — the goal is sharp, the decisions are logged, the scope is shaped, the context is accessible — execution follows naturally. Engineers build faster because they understand _why_. Stakeholders relax because they can see _what's happening_. You spend less time in meetings because the writing does the communicating.

The PMs who write well win. Amazon figured this out with their six-page memos. Shape Up figured it out with pitches. The best tech PMs I've encountered figured it out by keeping a decision log that makes every conversation shorter and every onboarding faster.

Here's the uncomfortable version: PM software provides psychological comfort for organizations unwilling to do the hard work of creating clarity. The real issues are always organizational — unclear goals, scattered context, authority deficits, decision latency. No tool fixes those. But a PM who owns the thinking architecture? That PM changes everything.

Stop shuffling tickets. Start managing thinking. The clarity compounds.

---

_What's the biggest context gap in your current workflow? Where does project thinking go to die on your team? [I'd love to hear about it](mailto:dj@build-os.com) — I'm always curious how this shows up on different teams._

---

<!--
AUDIT 2026-04-29
QUALITY: 8/10
RECOMMENDATION: KEEP_AS_IS
PURPOSE: Long-form thesis post for tech PMs — Shape Up appetites, decision logs, impact mapping — positioned as the "manage thinking, not tickets" frame. Targets engineering org leaders.
READER VALUE: High. Real research citations (HBR app-toggling, Gloria Mark, Shopify strangler fig, Marty Cagan, UserVoice Shape Up adoption, Spotify ADRs). Three concrete scenarios that read like they came from real PM experience. Adoption arc (Week 1–4) is honest about discomfort. FAQ at top is well-written and SEO-useful.
VOICE FIT: Strong fit with the literary, founder-direct style of the Obsidian post. "PM software provides psychological comfort for organizations unwilling to do the hard work of creating clarity" is exactly the voice the strategy doc calls for. The "But My Team Won't Write Things Down" section is best-in-class — anticipates objections and answers them concretely.
ISSUES:
- Doesn't lead with AI (good!) but also barely mentions BuildOS until the "Note on AI" section near the end — almost too restrained. Could end with a sharper BuildOS-specific scenario without breaking voice.
- Long (~5,500 words by my count, frontmatter says readingTime: 15). Audience is right for this length, but a TL;DR or pull-quote would help.
- "AI is good at organizing information. It is not good at deciding what matters." is the perfect anti-AI line and should probably be a tweet/LinkedIn pull, not buried in a closing aside.
- `category: 'Productivity'` in frontmatter — should this be 'Project Management' or 'For PMs'? "Productivity" is generic and undersells the targeting.
- The post is filed in /productivity-tips/ but it's targeted at tech PMs. Consider /guides/ or /for-pms/ if such a folder exists, or accept that productivity-tips is the catch-all.
GAPS:
- No worked example of using BuildOS specifically as the "context architecture" the post argues for. It says "tool-agnostic" — true and honorable — but BuildOS readers will want to see the bridge.
- Doesn't reference brain dump → impact map mechanic, which is the obvious BuildOS angle.
DUPLICATES/OVERLAP: None in this folder — this is the only PM-targeted post. The "context fragmentation across tools" framing has minor overlap with anti-AI / Obsidian posts but the angle (team workflow, not personal capture) is distinct.
NOTES: This is the best post in the folder. Use it as the bar. SEO frontmatter (FAQ, keywords, slug, seo block) is also the most complete in the folder — other posts could borrow the structure.
-->
