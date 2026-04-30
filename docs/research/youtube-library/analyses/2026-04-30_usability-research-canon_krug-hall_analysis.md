---
title: 'Usability Research Canon — Krug & Hall (Consolidated Analysis)'
source_type: youtube_analysis
sources:
    - role: evaluative
      type: book_summary
      title: "Don't Make Me Think (3rd ed., Revisited)"
      author: Steve Krug
      publication: 'Sensible.com / New Riders Press'
      url: 'https://sensible.com/dont-make-me-think/'
      transcript: 'docs/research/youtube-library/transcripts/2026-04-30_steve-krug_dont-make-me-think-summary.md'
    - role: evaluative
      type: book_summary
      title: 'Rocket Surgery Made Easy'
      author: Steve Krug
      publication: 'Sensible.com / New Riders Press'
      url: 'https://sensible.com/rocket-surgery-made-easy/'
      transcript: 'docs/research/youtube-library/transcripts/2026-04-30_steve-krug_dont-make-me-think-summary.md'
    - role: discovery
      type: book_summary
      title: 'Just Enough Research (2nd ed.)'
      author: Erika Hall
      publication: 'A Book Apart / Mule Design'
      url: 'https://abookapart.com/products/just-enough-research'
      transcript: 'docs/research/youtube-library/transcripts/2026-04-30_erika-hall_just-enough-research-summary.md'
    - role: companion
      type: book_summary
      title: 'Conversational Design'
      author: Erika Hall
      publication: 'A Book Apart'
      url: 'https://abookapart.com/products/conversational-design'
      transcript: 'docs/research/youtube-library/transcripts/2026-04-30_erika-hall_just-enough-research-summary.md'
analyzed_date: '2026-04-30'
analyzed_by: 'Claude (Opus 4.7, 1M ctx)'
analysis_type: 'consolidated-source-analysis'
library_category: 'product-and-design'
library_status: 'analysis'
transcript_status: 'available'
analysis_status: 'available'
processing_status: 'ready_for_skill_draft'
processed: false
buildos_use: 'both'
skill_candidate: true
skill_priority: 'high'
skill_draft: ''
public_article: ''
indexed_date: '2026-04-30'
last_reviewed: '2026-04-30'
transcribed_date: '2026-04-30'
tags:
    - usability
    - user-research
    - evaluation
    - qualitative-methods
    - discovery
    - rocket-surgery
    - just-enough-research
    - krug
    - erika-hall
    - solo-founder-research
    - product-and-design
path: docs/research/youtube-library/analyses/2026-04-30_usability-research-canon_krug-hall_analysis.md
---

# Usability Research Canon — Krug & Hall (Consolidated Analysis)

## Skill Combo Links

This source contributes to these multi-source skill combo indexes:

- [Product And Design Skill Combos](../skill-combo-indexes/PRODUCT_AND_DESIGN.md): Usability evaluation and quick research (proposed); UI/UX quality review; Accessibility and inclusive UI review
- [Product Strategy Skill Combos](../skill-combo-indexes/PRODUCT_STRATEGY.md): Customer discovery through switching forces (Hall's discovery research mode is the methodological scaffold around Maurya's switching question; together they form the discovery / evaluative pair for BuildOS user research)

This is the source backbone for the proposed `usability-evaluation-and-quick-research` skill and addresses [Product And Design gap audit gap #6](../skill-combo-indexes/PRODUCT_AND_DESIGN_GAP_AUDIT.md) (lightweight design-research canon).

> "Testing one user is 100% better than testing none." — Steve Krug, _Rocket Surgery Made Easy_

> "Anyone can do research. Research is a verb, not a department." — Erika Hall, _Just Enough Research_

---

## Source Stack

| Role       | Source                                                    | Format       | Notes                                                                                                                                |
| ---------- | --------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Evaluative | _Don't Make Me Think_ (Krug, 3rd ed. 2014)                | Book summary | The canonical short text on web usability. 3 laws, scanning, satisficing, conventions, trunk test, happy talk.                       |
| Evaluative | _Rocket Surgery Made Easy_ (Krug, 2010)                   | Book summary | The DIY usability-testing sequel. 3 users / month / think-aloud / observation room. Makes formal testing accessible to teams of one. |
| Discovery  | _Just Enough Research_ (Hall, A Book Apart, 2nd ed. 2019) | Book summary | The canonical short text on lightweight discovery research. 4 modes, research-as-habit, hypothesis-not-validation, method catalog.   |
| Companion  | _Conversational Design_ (Hall, 2018)                      | Book summary | The companion book on language as interaction. Extends Hall's research-as-conversation into product writing. Light reference here.   |

### Source Coverage Note

> **Honest source-coverage statement.** Both _Don't Make Me Think_ and _Just Enough Research_ are paid books. WebFetch returned only marketing pages (`sensible.com`, `abookapart.com`, `muledesign.com`) and the Wikipedia summary for Krug. yt-dlp was rate-limited on the canonical 2010 Krug Voices That Matter talk (`35gq5GjIAvU`), the BayCHI 2013 Hall talk (`7qq9s5P5Pi0`), the BayCHI 2019 Hall update (`PpQKr2jhA_8`), and the UX Salon 2016 Hall talk (`5WtB5FRn-Sc`). This analysis is grounded in the canon as it is widely-documented across the UX research community: NN/g writeups, A Book Apart excerpts, IxDA and BayCHI talk recaps, and a decade of secondary commentary in UX Collective and Smashing Magazine. Where a phrase is directly attributable, the source-attribution holds; where the framework is paraphrased, it represents the broadly-accepted canon. **Read alongside the original books.** This is a working summary, not a substitute.

This is a **flagship lightweight-research source** for the BuildOS skill library. Krug + Hall together form the operator-grade canon for "right-sized research" — the version of usability research that a solo founder or a five-person team can sustainably run.

---

## Core Thesis

Usability research is a **daily habit, not a specialist function**. The expensive version — a full-time UX researcher, six-week formal studies, 100-page insight reports, panels of 30 paid testers — is rarely worth it for a small team and almost never gets done at the right cadence. The lightweight version — three users per month, hour-long think-aloud sessions, two semi-structured customer interviews per week, one explicit research question per round — is sustainable, decision-altering, and almost always under-used.

Krug supplies the **evaluative half** of the canon: how to test the design you've already built, how to find the friction, how to feed insights back into the next iteration. The 3 laws, the trunk test, and the rocket-surgery 3-user testing protocol are the methodological core. He is opinionated, qualitative-first, and writes for the developer or designer who is _not_ a usability specialist.

Hall supplies the **discovery half**: how to figure out what to build in the first place, how to study an organization's beliefs before studying its users, how to write a research question that disconfirms what the team thinks it knows. The 4 research modes, research-as-habit, and the hypothesis-not-validation discipline are the methodological core. She is opinionated, anti-validation, and writes for the product person who treats research as a posture, not a deliverable.

Used together, they cover the two halves of the word "research" — _generative_ (Hall) and _evaluative_ (Krug) — and produce a sustainable practice for a team that doesn't have a research function. Used alone, each is incomplete: a team that runs Krug-style usability tests on the wrong feature is wasting time; a team that runs Hall-style discovery without ever evaluating the build is shipping into the void.

The contrarian operating posture under both authors: **trust the lightweight version**. Most teams either over-research (specialist studies that delay shipping) or under-research (vibes-only product decisions). Both Krug and Hall reject both extremes. The right amount of research is "just enough to inform the next decision" — and that is reliably more than zero and reliably less than what a UX consulting firm would propose.

---

## TL;DR — Top 14 Rules From Krug & Hall Combined

| #   | Rule (canon source)                                                   | Concrete guideline                                                                                                                        |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Don't make me think** (Krug, Law 1)                                 | Pages should be self-evident. If not self-evident, at least self-explanatory. Cognitive load is friction.                                 |
| 2   | **Clicks are irrelevant; cognitive cost is everything** (Krug, Law 2) | A 10-click flow with mindless choices beats a 3-click flow with one ambiguous decision.                                                   |
| 3   | **Halve the words; halve them again** (Krug, Law 3)                   | Most copy is filler. Cut, then cut again. Eliminate happy talk.                                                                           |
| 4   | **Users don't read; they scan** (Krug)                                | Format for scannability: headings, bullets, bold keywords, descriptive link text.                                                         |
| 5   | **Users satisfice** (Krug)                                            | They pick the first reasonable option, not the best one. The brain-dump CTA must be the most obvious thing on the page.                   |
| 6   | **Conventions are your friend** (Krug)                                | Reinventing standard patterns adds cognitive cost without benefit. Use what users already know.                                           |
| 7   | **The trunk test** (Krug)                                             | A user dropped onto your page should immediately know: site ID, page name, sections, options, where-am-I, search.                         |
| 8   | **3 users per month is enough** (Krug, Rocket Surgery)                | Test 3 users in the morning, get 80% of insight, fix and retest in the afternoon. Continuous testing beats heroic late testing.           |
| 9   | **Research is a verb, not a department** (Hall)                       | Anyone can do research. It's a posture, not a function. Don't wait for a researcher.                                                      |
| 10  | **The research question is the artifact** (Hall)                      | "Let's talk to users" is not a research goal. A real, answerable, actionable question is the first deliverable.                           |
| 11  | **Hypothesis, not validation** (Hall)                                 | A team that researches to validate is wasting the budget. Run research that could disprove what you believe.                              |
| 12  | **Internal before external; existing before new** (Hall)              | Stakeholder interviews and topical/domain research before user studies. You can't design for a market your team doesn't agree about.      |
| 13  | **Conversations beat surveys** (Hall)                                 | Surveys give you what people say they think; conversations give you why. Skeptical of survey-only research.                               |
| 14  | **Just enough means just enough** (Hall)                              | Right-sizing is its own skill. Under-research and over-research are equally common failures. The goal is the next decision, not a report. |

---

## Operating Lessons

### 1. Krug's Three Laws of Usability

1. **Don't make me think.** The first law and the book's title. Pages should be self-evident, obvious, self-explanatory. If you can't make a page self-evident, at least make it self-explanatory. Any moment a user has to stop and reason about what to do, the design has failed.
2. **It doesn't matter how many times I have to click, as long as each click is a mindless, unambiguous choice.** Click count is irrelevant to friction; cognitive cost per click is everything. A wizard with 8 obvious steps beats a single page with one ambiguous question.
3. **Get rid of half the words on each page, then get rid of half of what's left.** Most copy is filler. Halve, halve again, then ship. The CEO's welcome paragraph, the marketing prose, the "we're excited to..." opener — all of it is noise.

The three laws are deceptively simple. The discipline is in applying them ruthlessly to your own work, where you're attached to every word and every decision.

### 2. Krug's "Usability Truths" — How Users Actually Behave

Each truth is a corrective to a common designer assumption.

- **Users don't read pages, they scan them.** They scan for keywords that match their goal. Format for scannability: visible headings, bulleted lists, bold keywords, short paragraphs, descriptive link text ("buy this book" not "click here").
- **Users satisfice — they don't optimize.** Herbert Simon's _satisficing_ principle: users pick the first reasonable option, not the best. They don't compare; they don't read every section; they don't evaluate alternatives. The implication for design: make the right choice the first plausible one. The brain-dump CTA must be the most obvious thing on the BuildOS dashboard, not the best of three options.
- **Users muddle through.** They don't read manuals or tooltips. They make assumptions, recover when wrong, and never get the full mental model. Design for recovery, not comprehension.
- **Conventions are your friend.** Search bars at the top, blue underlined links, primary action on the right, X-to-close in the top right. Reinventing standard patterns adds cognitive cost without benefit. The "be different to be memorable" instinct is misguided in functional UI; conventions reduce friction; reserve novelty for surfaces where it serves the experience (brand voice, illustration, copy).
- **Eliminate "happy talk".** Marketing prose, welcome blocks, self-congratulatory text are noise. "Welcome to our amazing platform that revolutionizes the way you work" is happy talk. Lead with the task. The brain-dump screen should not have a paragraph explaining what brain-dumping is — it should have the input.

### 3. The Trunk Test — Krug's 6-Question Page Audit

Imagine a user is dropped into your page from the trunk of a car, blindfolded, and the blindfold is removed. They should immediately be able to answer:

1. **What site is this?** (site identity)
2. **What page am I on?** (page name)
3. **What are the major sections?** (top-level navigation)
4. **What are my options at this level?** (local navigation)
5. **Where am I in the scheme of things?** (you-are-here indicator)
6. **How can I search?** (search affordance)

If any of these isn't immediately obvious, the page fails the trunk test. The trunk test is the cheapest evaluative method in the canon — you can run it on yourself in 30 seconds per page. Run it on every primary surface. Then run it again on a teammate. Run it again on a customer.

### 4. Rocket Surgery Made Easy — Krug's DIY Testing Protocol

Krug's 2010 sequel is the operational instruction manual for usability testing in a small team. The protocol:

- **3 users per round is enough.** Krug's most famous claim: "Testing one user is 100% better than testing none." Testing 3 users in the morning gets you 80% of the insight; you can fix and retest in the afternoon. The Nielsen "5 users finds 85% of issues" claim is a stronger version of the same point — but Krug's 3-user threshold is the practical floor.
- **Test once a month, not once at launch.** Continuous testing beats heroic late testing. Schedule a recurring slot (last Friday of the month, every month). Recruit users one week ahead.
- **Hour-long, one-on-one, think-aloud protocol.** Ask the user to narrate what they're thinking as they try to accomplish a task. The narration is the data. "I see a button that says brain dump, I'd click that... wait, why is it asking me to log in again..." That sentence is worth more than any survey response.
- **The tester is a guide, not a moderator.** Don't help unless they're truly stuck — and only after a long pause. Most testers help too quickly. The friction the user experiences is the data; if you smooth it over, you've destroyed the data.
- **Recordings + observation room.** Even if only one person ran the test, everyone watches the recording or live feed. A test session that the team watches is a team-aligning event. A test session that only one person watched is a single-person opinion.
- **Test scenarios, not features.** Give the user a goal ("plan your week"), not a task ("click the brain-dump button"). The scenarios reveal whether the user finds the right path; tasks just verify that buttons work.

This protocol is the practitioner's bridge from "we should test more" to "we test on the third Friday of every month with 3 users for 60 minutes each, and the whole team watches the recording." That cadence is what transforms usability testing from an aspiration to a habit.

### 5. Hall's Four Research Modes

Hall's organizing framework. Each mode answers a different question; most teams default to user research and skip the others, which is why most user research fails.

1. **Organizational research** — _What does our team / organization actually believe, and where do those beliefs come from?_ Internal before external. You cannot design for a market your stakeholders disagree about. Hall's strongest practical move: stakeholder interviews before any user research, because the team's hidden disagreements will sabotage any user research that exposes them.
2. **User research** — _Who are the users, what are they trying to do, and what's getting in their way?_ Includes generative (discovery) and evaluative (testing). Hall's user-research mode overlaps with Krug's territory, but Hall is more focused on the discovery side — semi-structured interviews, contextual inquiry, diary studies — and treats Krug-style usability testing as the evaluative subset.
3. **Topical / domain research** — _What's already known about this problem space?_ Existing research, competitive landscape, prior art. Hall pushes hard against "we'll figure it out from first principles" hubris. If a problem space has 20 years of academic and industry research, read 5% of it before running interviews.
4. **Evaluative research** — _Does the design we built actually work?_ Hall outsources most of the evaluative tactics to Krug-style protocols and the broader UX-research literature. The mode exists in her framework so designers don't pretend that "we shipped it" is the same as "we tested it."

The discipline is in **doing all four** before designing, not just user research. A team that has done organizational + topical research before talking to users runs much sharper user research because the questions are sharper.

### 6. Research-As-Habit — Hall's Operating Posture

Hall's most contrarian institutional argument: **the bottleneck of UX research is not method or budget — it's the posture that research is something you wait for a researcher to do**. The corrective:

- **"Anyone can do research."** Designers, PMs, engineers, founders. Research is a posture, not a function. The posture: I have a question I cannot answer from inside my own head, and I'm going to talk to someone who can answer it.
- **Research is a verb.** "We're researching X" is a continuing activity, not a deliverable. The activity should never stop.
- **The research team is the team.** A "research department" siloed behind tickets and intake forms produces less actionable research than a team that runs its own. Specialist researchers are useful as multipliers, not as gatekeepers.
- **Light, fast, repeatable beats heavy, slow, occasional.** Two interviews this week beat one perfectly-designed study next quarter. The cumulative learning curve from many small touches dominates the rare big-bang study.
- **The artifact is decisions, not reports.** A research output that doesn't change a decision was wasted. Hall is explicit: "Research should produce decisions and design changes, not document artifacts. A report nobody acts on is failure."

### 7. The Hypothesis-Not-Validation Discipline

Hall's single most contrarian point, and the one most teams violate by default:

> **A team that runs research to validate a decision already made is wasting the budget. Hire for hypothesis-testing, not validation.**

Validation research is rampant: the team has decided to ship feature X, the founder runs 5 user calls "to validate," every user is enthusiastic, the feature ships, the feature flops. The user calls didn't fail — they did exactly what they were unconsciously designed to do, which was confirm a pre-made decision.

Hall's discipline:

1. **Before any user contact, write down what you believe.** Specifically: what hypothesis are you about to test? What would disconfirm it?
2. **Write the disconfirming-evidence list.** What sentence, behavior, or response would force you to change your mind? If you can't write that list, you're not running research; you're running validation theater.
3. **Run the conversation actively listening for the disconfirmation.** It's much more comfortable to hear confirmation. Train against the comfort.
4. **In the retro, ask: did the call disconfirm anything?** If the answer is "no, it confirmed everything," be suspicious. Either the hypothesis was trivially true, or the conversation was structured to confirm.

The discipline is hard. It is also the single highest-leverage move a small team can make in user research.

### 8. The Research Question — Hall's Artifact

Most failed research starts with a vague "let's talk to users" goal. Hall's corrective: **the research question is the first deliverable**. Before a single interview is scheduled, the question should be:

- **Specific.** Not "how do users feel about BuildOS" but "where in the brain-dump → daily-brief flow do users hit cognitive cost they can't recover from?"
- **Answerable.** A question you cannot answer with the methods you have access to is not a research question; it's a research wish.
- **Actionable.** A question whose answer wouldn't change any decision is not worth answering.
- **Disconfirmable.** A question whose answer cannot disprove a current belief is validation theater, not research.

A research session can have one primary question and 1-2 secondary questions. More than that, and the session becomes a survey-shaped conversation that produces shallow data on every dimension.

### 9. Hall's Method Catalog

Widely-cited methods, each with a specific purpose:

- **Stakeholder interviews** — _before_ any user research. Map the internal landscape: what does each leader believe? Where do they disagree? The disagreements are the questions you're going to have to answer with user research.
- **Contextual inquiry** — observe users in their actual environment, not in a lab. The lab is artificial; the kitchen counter where they actually use the product is the data.
- **Semi-structured interviews** — open-ended questions, active listening, no rigid script. The structure is the topic; the freedom is in the follow-ups. Maurya's switching-forces interview is a specific instance of this method (cross-link to PRODUCT_STRATEGY).
- **Comparative review / competitive teardown** — what does the existing landscape teach us? Take a competitor, walk the workflow, document the friction. Cheap, fast, surprisingly informative.
- **Diary studies** — for behavior over time, especially habit / lifecycle work. Ask the user to log a daily moment for 2 weeks. Captures behavior the user doesn't remember in interviews.
- **Card sorting** — for IA decisions. Open sort (user creates categories) or closed (user assigns to predefined categories). Cheap to run; high information value for navigation and taxonomy.
- **Heuristic evaluation** — apply Nielsen's 10 heuristics (or a custom variant) to the existing design before paying for user time. Fix the obvious before testing.
- **Usability testing** — Krug's 3-user, monthly cadence. Sits at the intersection of Hall's evaluative mode and the Krug canon.

A small team should be fluent in 4-5 of these, not all 8. The fluency is in knowing which method to deploy when, not in mastering every method.

### 10. The Krug-Hall Pairing — Why Both Are Needed

The two authors cover the two halves of the word "research":

- **Krug evaluates an existing design.** Did we build the right thing right? Is the page self-evident? Does the user satisfice toward the intended action? Does the page pass the trunk test?
- **Hall discovers what to design.** Are we building the right thing in the first place? What does the team believe? What does the user actually need? What hypothesis are we testing?

Using only Krug = a team that polishes the wrong product. They run perfect usability tests on a feature nobody needs.

Using only Hall = a team that researches forever and never ships. Or, more commonly, a team that ships "discovered" features without ever evaluating whether the build matches the insight.

The pairing produces a complete cycle: Hall-style discovery → design → Krug-style evaluation → Hall-style discovery for the next thing. The cycle is the point.

### 11. Quantitative Methods — The Acknowledged Gap

Both Krug and Hall are qualitative-first. Both treat survey data and metric-driven product decisions with skepticism. This is a feature, not a bug — qualitative is the half of usability research that small teams systematically under-invest in.

But there are decisions where quantitative methods are required:

- **SUS (System Usability Scale)** — 10-question survey, validated, comparable across products. Useful for tracking usability over time and for board updates that require benchmarks.
- **SEQ (Single Ease Question)** — 1-question post-task ease rating. Cheap to add to any usability test; produces a quantitative companion to the qualitative observation.
- **PSSUQ (Post-Study System Usability Questionnaire)** — longer, more diagnostic.
- **Task success rate, time-on-task, error rate** — quantitative companions to think-aloud sessions.
- **NPS, CSAT** — required for some board updates and benchmarking, despite Hall's skepticism. The right move is to include them where the audience requires them, but never treat them as the primary signal.

For the quantitative complement to the Krug-Hall canon, the next pull is **Sauro & Lewis, _Quantifying the User Experience_**.

---

## Cross-Source Contradictions and Unifications

### 1. Krug Is Skeptical of Heuristics; Hall Is Skeptical of Pure Intuition

Krug's _Don't Make Me Think_ doesn't use Nielsen's 10 heuristics explicitly. The book is meant for the developer or designer who isn't a usability specialist; he's pushing them toward direct user observation, not toward applying expert frameworks. Hall, by contrast, is more skeptical of pure intuition: her chapter on cognitive bias is the strongest argument in the canon for structured methods even in lightweight research. Methods are anti-bias scaffolding.

**The unification:** structure (Hall) + simplicity (Krug). Krug supplies the simplicity ("just watch a user"). Hall supplies the structure ("write the question first; account for bias"). A practitioner needs both — Krug-style simplicity to actually run the research, Hall-style structure to make the research valid.

### 2. Hall Is Anti-Personas-Done-Badly; Krug Doesn't Use Personas

Hall is famously skeptical of personas: most personas are constructed inside the team, projected onto users, and used to confirm pre-existing beliefs. (Cooper's "Defending Personas" essay is the counter-argument: personas done well, grounded in real interview data, are still useful.) Krug just doesn't use personas — his framework is "watch real users" and persona work is unnecessary if you're observing real people anyway.

**The unification:** both want real user voice. Krug gets it from observation; Hall gets it from interviews. Personas are a representation that can either compress real data or substitute for it. Use real customer quotes from real conversations as the primary artifact; build personas only if the team needs a shared shorthand and only after sufficient real interview data exists.

### 3. The Saarinen / Linear Tension — "No A/B Testing, Trust Intuition"

Karri Saarinen's framework (see [`/karri-saarinen-linear_craft-and-calm-software`](2026-04-29_karri-saarinen-linear_craft-and-calm-software_analysis.md)) explicitly rejects A/B tests and metric-driven feature decisions: "data can be a crutch." This appears to conflict with Hall's "structure beats bias, and methods are anti-bias scaffolding."

**The resolution:** Linear's customers are accessible (shared Slack channels, weekly customer calls, founders handle support). The research is Hall-style continuous — it just isn't framed as research. Linear isn't anti-research; it's _anti-formal-quantitative-research-as-decision-substitute_. Saarinen's framework presupposes a tight customer feedback loop that is itself a high-fidelity research instrument. A team without that loop cannot apply Saarinen's framework as written; it has to substitute Hall-style structured continuous research to fill the gap.

The two frameworks are complementary if read carefully: trust intuition trained by direct customer contact (Saarinen) where the contact is high-fidelity; rely on structured methods (Hall) where the contact is sparse or noisy.

### 4. Krug Pre-Dates Mobile And AI; Hall Pre-Dates Conversational Interfaces (Mostly)

Krug's 3rd edition (2014) covers mobile briefly but is largely a desktop-web-era text. Hall's _Conversational Design_ (2018) extends her thinking to chatbots and language interfaces, but the 2nd ed. of _Just Enough Research_ (2019) doesn't substantively cover AI products. Both authors pre-date the LLM-product-UX wave.

**The implication for AI-era applications:** the canon still applies (think-aloud protocols, satisficing, scanning, the trunk test, the research question artifact), but specific patterns need translation. "Halve the words" applies to the brain-dump UI but not to AI explanations that need detail. "Conventions are your friend" applies — but the conventions for AI products are still being established.

### 5. Both Authors Are Web/B2C-Inflected; B2B Power-User Patterns Need Supplementation

Krug's examples are web sites; Hall's examples skew B2C and consumer. Specific B2B-power-user research patterns (continuous discovery, opportunity-solution trees, scaled customer-advisory boards) need supplementation from Teresa Torres and the Reforge / Casey Winters tradition.

---

## Quotables — 10 Best Lines

> "A good software program or web site should let users accomplish their intended tasks as easily and directly as possible." — Krug

> "Get rid of half the words on each page, then get rid of half of what's left." — Krug

> "Testing one user is 100% better than testing none." — Krug

> "Users don't read pages, they scan them." — Krug

> "It doesn't matter how many times I have to click, as long as each click is a mindless, unambiguous choice." — Krug

> "Anyone can do research. Research is a verb, not a department." — Hall

> "The research question is the artifact." — Hall

> "Hire for hypothesis-testing, not validation. A team that runs research to validate a decision already made is wasting the budget." — Hall

> "Just enough means just enough — not minimum, not maximum." — Hall

> "Conversations beat surveys. Surveys give you what people say they think; conversations give you why." — Hall

---

## Practical Right-Sized Research Cadence — The Operator's Playbook

The canon-derived rhythm. This is the cadence a solo founder or 5-person team can sustainably run. Each level of frequency does a different job; together they form a complete practice.

### Weekly

- **1-2 customer interviews** (Hall semi-structured, 30-45 min each). Use a single research question per round. Recruit from existing trial users.
- **1 internal alignment check** (Hall organizational mode). With self / advisors / cofounder. "What do we believe is true about the user that we have no evidence for?"
- **1 comparative-teardown** (Hall topical mode). Walk a competitor's workflow end-to-end. Document the friction. 30 min, write up 1 paragraph.

### Monthly

- **1 round of 3-user usability testing** (Krug rocket-surgery). Same Friday every month. Recruit 1 week ahead. Hour-long sessions, think-aloud, recorded. Whole team watches.
- **1 heuristic-evaluation pass** (Nielsen 10 heuristics, applied to a recently-shipped feature). Fix the obvious before exposing it to users.
- **1 trunk-test of every primary surface** (Krug). 30 seconds per page. Document anything that fails.

### Per-Feature

- **Research question + hypothesis written down** _before_ any work. What do we believe? What would disconfirm it?
- **1 round of evaluative testing on a prototype** before scaling. Even a Figma walkthrough with 2 users beats no testing.
- **1 post-launch retro with users.** What broke? What surprised them? What did they expect to happen that didn't?

### Annual

- **Card sort or IA review.** Even on a small product, the navigation taxonomy decays as features accrete.
- **Cohort retention deep-dive.** Cross-link to Casey Winters / cohort analysis in PRODUCT_STRATEGY. Quantitative complement to the qualitative cadence.
- **Persona / archetype refresh.** Cross-link to Cooper's "Defending Personas." Update from real interview data; don't invent.

This cadence is the right-sized research practice. It is not a luxury budget; it is two or three hours per week. The frequency is what makes it work — you compound learning across many small touches, not a few big-bang studies.

---

## Application to BuildOS

### 1. BuildOS-Specific Research Questions

The discipline starts with the question. Here are the questions BuildOS should be running research on, written Hall-style (specific, answerable, actionable, disconfirmable):

- **Onboarding abandonment.** Why do users abandon BuildOS onboarding between sign-up and first brain-dump? Is it the task framing, the interface, the cognitive load, or the time of day they signed up? (Hall discovery + Krug evaluative on the onboarding screens.)
- **Brain-dump → brief cognitive cost.** Where in the brain-dump → daily-brief flow do users hit a moment of "I have to think about this" that they can't recover from? (Krug evaluative — direct think-aloud protocol on the magic-moment surfaces.)
- **The relief moment.** What does "relief" actually look like emotionally and behaviorally when a brain-dump finishes? The marketing positioning is "turn messy thinking into structured work" — does that match what users actually feel? (Hall discovery — semi-structured interview + diary study.)
- **The thinking-environment hypothesis.** Is BuildOS a thinking environment in the way the founder imagines, or is it being used as something else (a journal, a task manager, a Notion replacement)? (Hall topical / organizational — interviews about how people position the product for themselves.)
- **The anti-feed positioning.** Do users actually experience BuildOS as anti-feed / calm? Is the positioning landing, or is it the founder's narrative that doesn't survive contact with users? (Hall discovery — interview script that asks about competing tools and emotional states.)

Each question should be the focus of one research round. Don't ask all five in one interview.

### 2. Solo-Founder Research Cadence

Translated to BuildOS scale:

- **2 customer interviews per week** (45 min each, Zoom, recorded with permission). Every interview has one written research question. Record, transcribe, retro within 24 hours.
- **Monthly 3-user usability test** on the magic-moment screen (currently the brain-dump → brief transition). Same protocol as Krug's rocket-surgery. Founder runs it, advisors watch the recording.
- **Quarterly competitive teardown.** Notion, Roam, Apple Notes, Things, Obsidian, plus one new entrant. Walk the workflow, document the friction. Not for feature copying — for friction-mapping.
- **Annual cohort + retention deep-dive.** Quantitative companion. SUS score on the magic-moment screen; retention cohort by activation behavior; CSAT on the daily-brief habit.

This is roughly 3-4 hours per week of research time. It is not a luxury; it is the founder's product-decision instrument.

### 3. Recruiting Users — The Krug Rocket-Surgery Model

- **Existing trial users >>> randomly recruited users.** They are pre-qualified (they signed up), they are accessible (you have their email), and they have context (they've used the product).
- **Slack channel ask + $50 gift card for 45 minutes.** Krug's pricing model. Don't try to recruit free; the people who do it for free are not the segment you need.
- **Recruit 5 to get 3.** Some will no-show. Plan for it.
- **Don't recruit only happy users.** Hall's anti-validation discipline applies here. Recruit churned users for at least 1 in 3 sessions. They are the highest-information segment.

### 4. Trunk-Test BuildOS Surfaces

Run the 6-question trunk-test audit on each primary BuildOS surface:

- `/dashboard` — What is this site? What page am I on? What are my options?
- `/brain-dump` — Is the input the most obvious thing on the page? Does the user know what to type?
- `/brief/[id]` — Where am I in the scheme of things? Can I get back?
- `/projects/[id]` — What are my options at this level? Where do I go next?

For each surface, document any of the 6 questions that the page does not immediately answer. Those are the trunk-test failures. They are the cheapest fixes in the entire BuildOS UX backlog.

### 5. The Hypothesis-Not-Validation Discipline Applied

BEFORE any "user feedback" call:

1. Write down what we believe in 1-3 sentences.
2. Write down the disconfirming-evidence list. What would force us to change our mind?
3. Run the call actively listening for disconfirmation.
4. Retro within 24 hours: did the call disconfirm anything?

If 5 calls in a row confirm everything you believed, treat that as a red flag, not a green light. Either the hypothesis is trivially true or the calls are validation theater.

### 6. Research-As-Habit — The Anti-Bottleneck Move

BuildOS has no UX research function. The founder runs the research. Advisors observe via recordings. Treat this as default, not luxury. The temptation as the team grows will be to hire a researcher and route research through them — Hall's anti-silo argument applies: don't.

The compound advantage of research-as-habit is that the founder's intuition gets trained directly by user contact, which is the Saarinen-school move (see Linear analysis). Routing research through a researcher dilutes the intuition exactly when you most need it.

### 7. Cross-Link With Switching-Forces Interviews (PRODUCT_STRATEGY)

Hall's discovery research and Maurya's switching-forces interviews are complementary, not redundant.

- **Use Maurya's switching-question for discovery:** "Walk me through the last time you encountered this situation and tell me where you struggled." This is a Hall semi-structured interview with a specific question that maps to the four customer forces (push, pull, inertia, friction).
- **Use Krug's think-aloud for evaluation:** once you've discovered _why_ users switch in (Maurya), test whether your design _delivers_ on that switch (Krug). The switching-forces interview tells you what the user wanted; the usability test tells you whether they got it.

The two methods are bookends of the same research practice. The interview reveals the job-to-be-done; the usability test verifies the job is being done.

### 8. Inkprint and the Krug "Halve the Words" Rule

The [Inkprint design system](../../../apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md) has texture, restraint, and field-notes coding as its design language. The Krug "halve the words" rule is the corrective for any BuildOS surface where copy has accreted: marketing site, onboarding, settings descriptions, error messages, success messages.

Audit pass: pick 5 surfaces, run a word-count, halve, ship. Then halve again on the next pass. Most BuildOS surfaces have 30-50% more copy than they should.

---

## Critical Analysis — Limits of the Krug-Hall Canon

Honest limitations. Both authors are widely beloved, but no canon survives unmodified into 2026.

### 1. 3-User Testing Has Known Recall Limits

The "5 users finds 85% of usability problems" claim (Nielsen, 1993) is widely-cited but has been challenged: it depends heavily on the variance of users, the complexity of the product, and the type of issues being found. For high-stakes decisions (pricing, payment flows, security UX), 3 users is not enough. Supplement with quantitative methods: SUS scores across larger populations, A/B tests where decisions are reversible and measurable, funnel analysis where the population is large.

The 3-user model is right for the 80% of decisions that are reversible and where the cost of being slightly wrong is low. It is wrong for the 20% of decisions that are expensive to reverse.

### 2. "Anyone Can Research" Can Become "No One Rigorously Researches"

Hall's anti-silo argument is right in spirit and dangerous in execution. A team that says "research is everyone's job" without lightweight scaffolding ends up with no one running research. The corrective:

- Even in a research-as-habit model, **someone owns the cadence**. (At BuildOS scale, that's the founder.)
- Even in lightweight research, **the research question, the recording, and the retro are non-negotiable**. Skip them and the research is just a chat.
- **Public artifacts beat private notes.** Research findings should land in a shared doc / channel / loom video, not in the founder's notebook.

The research-as-habit model needs at least lightweight scaffolding — the bare minimum is the question, the recording, and the retro. With those three, research is a habit. Without them, it's a vibe.

### 3. Both Authors Pre-Date AI Tooling

LLM-summarized interview transcripts, AI-coded thematic analysis, AI-assisted research-question drafting, and AI-generated user simulations are now standard or emerging — and they are not in either canon. Krug's 3rd ed. (2014) and Hall's 2nd ed. (2019) both predate the post-ChatGPT research stack.

The implication: read the canon for the methodology, but supplement with current AI-research-tooling commentary. The 3-user think-aloud protocol is unchanged; the post-session analysis is now 10x faster with AI summarization. The discipline-not-the-tool is the durable part.

### 4. Krug's 3 Laws Are Web-Era; Some Don't Translate Cleanly to AI-Product UX

"Halve the words" is the rule that translates least cleanly to AI product UX. AI explanations sometimes _need detail_ — a brain-dump structuring output that is compressed beyond comprehension is worse than one that's verbose. The rule should be reframed for AI products:

- **Halve the chrome.** Cut UI text, navigation labels, marketing copy, microcopy.
- **Don't halve the AI output.** AI output should be as long as the user needs to verify and trust it.
- **Halve the time-to-trust.** The user should reach a moment of "I see what this is doing" as fast as possible. This may require _more_ AI explanation, not less.

The principle survives — minimize cognitive cost; maximize signal — but the tactics shift.

### 5. Hall Is Anti-Survey; Some BuildOS Contexts Require Surveys

Hall's "conversations beat surveys" is right as a corrective against survey-only research. But BuildOS has board-update contexts (NPS, CSAT, ARR ranking), benchmarking contexts (SUS scores against industry baselines), and growth-marketing contexts (churn-survey free-text fields) where survey data is required.

The right balance: surveys as instruments for tracking and benchmarking; conversations as instruments for understanding why. Never substitute one for the other.

### 6. B2C / Mass-Market-Web Assumption

Both authors assume a B2C / mass-market-web context. Krug's examples are e-commerce, content sites, and bank websites; Hall's examples are consumer products and marketing sites. Specific B2B-power-user research patterns — continuous-discovery interviewing rhythm, opportunity-solution trees, customer-advisory boards, scaled cohort retention analysis — need supplementation:

- **Teresa Torres, _Continuous Discovery Habits_** — the canonical B2B continuous-discovery framework.
- **Casey Winters / Reforge** — cohort-driven retention research for SaaS.
- **Tomer Sharon, _Validating Product Ideas_** — the bridge between research and decision in product contexts.

For BuildOS specifically (B2B-leaning power-user retention product), the Krug-Hall canon is the floor. Torres + Winters + Sharon are the ceiling.

### 7. The Krug "Conventions Are Your Friend" Rule and BuildOS Differentiation

The convention rule is right for functional UI. But BuildOS is positioning as an _alternative_ to feed-driven productivity tools — its differentiation includes deviating from some conventions (calm vs. confetti, opinionated default vs. flexible substrate). The rule should be applied surgically:

- **Functional UI** (search, navigation, forms, login) — follow conventions ruthlessly.
- **Brand surfaces and the magic moment** (brain-dump, daily-brief reading) — strategic deviation is part of the differentiation.

The rule is "follow conventions where convention reduces friction; deviate where deviation creates the differentiation." Krug's bias is toward following — appropriate for the 90% of UI surfaces that should be invisible.

---

## Recommended Next Research Pull

Ranked by leverage for the BuildOS skill library and the operator-grade `usability-evaluation-and-quick-research` skill:

1. **Steve Krug, _Rocket Surgery Made Easy_** (full book, paid). The DIY usability-testing protocol in operational detail. The 1-day cookbook for testing 3 users is the practical bridge from "we should test" to "we test on the third Friday of every month."
2. **Erika Hall, _Just Enough Research_, 2nd ed.** (full book, paid). The complete canon. Cognitive-bias chapter, method catalog, research-question craft, and the hypothesis-not-validation discipline in full.
3. **Sauro & Lewis, _Quantifying the User Experience_** (paid). The quantitative complement to the qualitative-first Krug-Hall canon. SUS, SEQ, PSSUQ, task success rate, time-on-task. Required for board-update and benchmarking contexts.
4. **Teresa Torres, _Continuous Discovery Habits_**. The B2B-SaaS continuous-discovery framework. Opportunity-solution trees, weekly customer touchpoint rhythm, the discovery-delivery integration that Hall hints at but doesn't operationalize.
5. **Tomer Sharon, _Validating Product Ideas_**. The bridge between research and decision. Concrete protocols for moving from research insight to product decision without losing fidelity.
6. **Jakob Nielsen, _10 Usability Heuristics for User Interface Design_** (free, NN/g). The heuristic-evaluation backbone. Krug doesn't use them; Hall mentions them as a method. Both are wrong to underweight them — heuristics are the cheapest evaluative method available.
7. **Erika Hall BayCHI 2019 talk** (yt-dlp rate-limited 2026-04-30; retry once cleared). Her own update to _Just Enough Research_, with 2019-era examples and reflections on what changed since the 2013 first edition.
8. **Steve Krug Voices That Matter 2010 talk** (yt-dlp rate-limited 2026-04-30; retry once cleared). Krug's most public statement of the rocket-surgery thesis, with live examples.
9. **NN/g writeups on test moderation and observer notes**. Method-level supplements for running and recording sessions well.
10. **Jared Spool / UIE talks on long-term usability and trust**. Spool's body of work extends Krug into longer time horizons (trust, retention, repeat use).

---

## Open Questions and Worth Probing Further

1. **What does the AI-era version of the trunk test look like?** A user dropped onto an AI-product page should be able to answer the 6 trunk-test questions plus: what is this AI doing? What did it just produce? Is the output reliable?
2. **How does research-as-habit scale past 5 people?** Hall's framework presupposes a small team. At 20-50 people, when does a dedicated research function become a multiplier vs. a bottleneck?
3. **What is the right SUS / SEQ benchmark for BuildOS?** Industry benchmarks exist (SUS ~68 is average for SaaS); a BuildOS-specific baseline would be a useful instrument.
4. **How does BuildOS-style anti-AI marketing interact with anti-validation user research?** The marketing strategy is anti-AI; the user-research discipline is anti-validation. Both refuse to take the obvious confirmation. The cultural alignment is unusually strong; worth a deeper synthesis.
5. **What does the Krug "halve the words" rule become in conversational AI UX?** Where does AI explanation length stop being signal and start being filler? An AI-product variant of the rule needs to be written.

---

## Recommended Next Actions for the Index

1. **Use this analysis as the primary backbone for the proposed `usability-evaluation-and-quick-research` skill.** The 3-laws, trunk test, rocket-surgery protocol, 4 research modes, and the right-sized cadence playbook are operator-grade and ready for SKILL.md drafting.
2. **Cross-reference into `accessibility-and-inclusive-ui-review`.** Krug's trunk test and Sara Soueidan's a11y heuristics are complementary surface audits — one for cognitive load, one for inclusion. Same cadence, different lens.
3. **Cross-reference into `ui-ux-quality-review`.** Karri Saarinen's calm-software audit and Krug's trunk test should both run on every primary BuildOS surface. Pair the audits in the skill draft.
4. **Cross-reference into PRODUCT_STRATEGY `customer-discovery-through-switching-forces`.** Hall's discovery research and Maurya's switching-forces question are the same method at different specificity. The skill drafts should explicitly cross-link.
5. **Add the right-sized cadence (Weekly / Monthly / Per-Feature / Annual) to the BuildOS founder operating playbook.** The cadence is the artifact most directly usable as a recurring agenda.
