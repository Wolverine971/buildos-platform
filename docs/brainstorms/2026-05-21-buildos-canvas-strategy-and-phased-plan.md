---
date: 2026-05-21
title: BuildOS as Canvas — Consolidated Strategy & Phased Action Plan
analyst: DJ + Claude
source_discussion: |
    4-phase analytical exercise that started with a YouTube video on the
    evolution of League of Legends Worlds (15 years of esports maturation)
    and used the LoL arc to interrogate where AI / LLMs / agents are in
    their own evolution, then collapsed into a BuildOS product/positioning
    strategy.
upstream_analyses:
    - docs/research/youtube-library/inbox/every-worlds-explained-in-28-minutes.md
    - docs/research/youtube-library/analyses/2026-05-21_league-of-legends-worlds-evolution_analysis.md
    - docs/research/youtube-library/analyses/2026-05-21_lol-worlds-meta-evolution-and-ai-parallels.md
    - docs/research/youtube-library/analyses/2026-05-21_buildos-as-canvas-template-economy.md
    - docs/research/youtube-library/analyses/2026-05-21_buildos-primitives-and-scaffold-templates.md
related_specs:
    - docs/brainstorms/2026-05-21-project-forking-spec.md
status: ready-for-action
path: docs/brainstorms/2026-05-21-buildos-canvas-strategy-and-phased-plan.md
---

# BuildOS as Canvas — Consolidated Strategy & Phased Plan

## The thesis in one paragraph

BuildOS is not "an AI productivity tool." It is the **canvas / thinking platform on which complex, long-horizon projects get built** — opinionated about the _infrastructure of thinking_ (primitives, context accumulation, agent integration) and unopinionated about the _content of thinking_ (what you're actually working on). The category to win is "thinking environment for people making complex things," with a north-star user: **the future AI Faker — the first individual to build a billion-dollar business using AI as primary leverage**, who probably already exists somewhere as an ambitious solo builder on the internet.

## The LoL parallel that shapes the strategy

15 years of LoL Worlds evolution maps to a phase model that helps locate where AI/BuildOS is right now:

| LoL Era                            | What defined it                         | AI equivalent (May 2026)                                                       |
| ---------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| Discovery (S1, 2011)               | "We haven't decided what the roles are" | Product / agent layer — most AI usage is "two bruisers in bot lane"            |
| Scaling pains (S2-S3, 2012-2013)   | Big screen behind players, tech delays  | Operational gaps everywhere (prompt injection, no evals, hallucination chains) |
| Macro innovation (2014)            | Samsung White invents the macro game    | **Not yet at the commercial layer — 1-2 years away**                           |
| Maturation & dominance (2014-2017) | Korea's 5-year run                      | Frontier labs pulling away on model layer                                      |
| Deviation > mastery (2018-2022)    | Doinby's Nautilus mid                   | Not yet — meta isn't articulated enough                                        |
| Format reinvention (2023+)         | Swiss stage replaces groups             | Chat interface will get replaced                                               |

**Calibration:** the commercial AI category (post-ChatGPT, ~3.5 years old) is roughly at LoL's S2-S3. We're in scaling pains. The macro innovation hasn't happened yet. **BuildOS's bet is that context engineering + the canvas + templates IS the macro innovation.**

## What BuildOS is (and is not)

**BuildOS is:**

- The Riot Games of personal projects — the platform/surface, not a team
- A canvas opinionated about thinking infrastructure
- An invite-driven system where projects flow between actors (peer-to-peer, BuildOS-to-user via scaffold templates, agent-to-user via spawned projects)
- A place where compound context accumulates across sessions and projects
- The probable home of the future AI Faker

**BuildOS is NOT:**

- An "AI productivity tool"
- A PM tool
- A calendar / habit tracker / file storage / tag-based organizer
- Opinionated about workflow content
- A template marketplace where quality is creator-dependent (at least not at the start)

## The primitive set — and what makes something a primitive

### The distinction between a primitive and a feature

This came up as a real question. Here's the working definition:

**A primitive is something with independent existence and identity in the data model.**

- Can be created and destroyed on its own
- Has its own lifecycle
- Can be referenced from elsewhere
- Has its own listing / search / filter
- Manipulated directly by users
- Anchors the user's mental model

**A feature is an attribute, view, or behavior of a primitive.**

- Doesn't exist without its parent
- Lifecycle tied to its parent
- May have UI, but that UI is "of" the parent

**The test:** if "show me all the [X]s in my workspace" makes sense as a user request, X is a primitive. If you have to say "show me all the [X]s of [parent Y]," X is a feature.

- "Show me all my projects" ✓ primitive
- "Show me all my tasks" ✓ primitive
- "Show me all my goals" — does this make sense across projects?

### Applying the test to goals and plans

This was originally the open question. The revised decision is: **Goal and Plan are primitives.**

Reason: the product is agent-native. If an agent needs to create, read, update, list, or version something directly, that thing needs an addressable identity. Goals and plans pass that test.

The remaining nuance:

- Goals start project-scoped, but the model should leave room for cross-project goals later.
- Plans are primitives in the API/data sense, while plan **views** remain UI projections over plans, tasks, and documents.
- The risk is plan/project drift, so plan updates need provenance and versioning rather than being treated as disposable UI state.

### Recommended primitive set — 7 primitives (agent-native reasoning)

**DJ's argument:** if an agent needs to address something as a first-class object — create it, read it, list it, version it — it must be a primitive. Agents will create plans. Agents will read goals. Agents will list tasks across projects. The agent-native lens pushes more things toward primitive status than a UI-only lens does.

**The 7 primitives:**

1. **Project Group** — Container of related projects
2. **Project** — The unit of work
3. **Goal** — What the project aims to achieve (project-scoped initially; cross-project goals possible later)
4. **Plan** — The sequence/strategy artifact (a creatable, versionable thing, not just a view)
5. **Document** — Persistent context
6. **Task** — Ephemeral work unit
7. **Actor** — Person involved (human or agent)

**Why goal and plan ARE primitives (revised reasoning):**

- An agent needs to call `create_goal(project_id, content)` — that's a primitive operation
- An agent needs to call `create_plan(project_id, content)` — same
- An agent needs to version plans ("v2 of the plan, after we learned X") — only works if plan is an addressable artifact
- An agent needs to query: "show me all the goals I have right now" — only works if goal is queryable

The UI consequence is mild ("every project shows a goal field and a plan view"). The agent-API consequence is significant (goals and plans become addressable resources, not nested project fields).

Plans-as-primitive vs. plans-as-view is the same data viewed differently. Making it a primitive doesn't preclude plan views; it adds the ability for agents to manipulate the plan as an artifact.

### Implementation audit note

This primitive decision is now a **product/API decision**, not a greenfield schema decision.

Current repo reality:

- `Project`, `Goal`, `Plan`, `Document`, `Task`, and `Actor` already exist as first-class ontology entities or tables.
- `Goal` and `Plan` are already addressable resources in agent/project flows, so the old "maybe not primitive" framing is stale.
- `Project Group` does **not** appear to have a dedicated first-class model yet. Treat it as a required product primitive, but budget explicit implementation work before relying on it in agent permissions, onboarding, or navigation.

Near-term interpretation: lock the 7-primitive language, but do not pretend all 7 have equal implementation maturity. Project Group is the gap.

### What's deliberately NOT in the primitive set

- Meetings / events (live in calendar integrations)
- Habits / routines (lives in a habit tracker if needed)
- Files / attachments (supporting assets, not top-level primitives; still need explicit handling in publishing/forking)
- Tags / labels (don't bake organizational ontology into the primitives)

This is the wedge. Most productivity tools become some mix of those four. BuildOS deliberately is not.

## Templates — the dual model

DJ's correction: scaffold templates and a forking marketplace **coexist.** They serve different jobs.

### Scaffold templates (the onboarding growth hack)

- **Authored by BuildOS** based on research into known SME workflows
- **Inspired by** subject matter experts (Gary Tan for startups, Tim Ferriss for books, popular realtors for home purchases) — citations on sources, no endorsement claims
- **Purpose:** solve the blank-canvas problem for new users; give them a credible starting structure
- **Quality:** controlled by BuildOS curation
- **Risk profile:** lower creator dependency, but not "low" in the absolute sense — still needs source citation review, endorsement-risk review, privacy/safety review, and template versioning

### Forking marketplace (the cultural transmission layer)

- **Authored by users** who choose to publish their projects publicly
- **Mechanism:** fork-a-project, similar to forking a GitHub repo
- **Tim Ferriss example:** he uses BuildOS, builds a book project, publishes it as a public template; users fork it into their own workspace
- **Purpose:** cultural transmission — adopt the mental model of someone you respect
- **Quality:** variable, market-driven
- **Risk profile:** higher — depends on creator behavior, but distributed across many creators

### How they coexist

New users → scaffold templates (curated by BuildOS)
Power users → fork from public projects (community)
Both → use the same **project intake surface**, but not necessarily the same backend operation

### Architectural unification

The product surface should feel unified:

- Alice invites Bob to her project
- BuildOS starts a new user from a scaffold
- An agent spawns a generated project for a user
- A user forks a public template project

But the backend operations are different:

- **Peer invite:** current `onto_project_invites` / `accept_project_invite` path grants membership on an existing project.
- **Scaffold start:** instantiates a new project from a BuildOS-authored canonical project/spec.
- **Agent-spawned project:** instantiates a new project attributed to an agent actor and accepted by the user.
- **Fork:** deep-copies a public project snapshot into the user's workspace with provenance.

Important correction from the repo audit: `accept_project_invite` is **not** the forking substrate by itself. It currently accepts a token and inserts/restores `onto_project_members`; it does not clone projects, reset state, copy documents/tasks/edges, or preserve fork provenance. The right architecture is **one intake UX, multiple backend operations**.

### Attribution path for scaffold templates

1. **Phase 1 (now → ~18 months):** "Inspired by" workflows. Cite public sources (books, podcasts, public writings). No claims of endorsement.
2. **Phase 2 (mature product):** Approach SMEs whose workflows are templated. Offer official co-branding when both sides see upside.
3. **Phase 3 (long-term):** Some SMEs become genuine BuildOS power users and publish their own forkable projects. Real cultural transmission begins.

Andrew Chen's framing: borrow authority first, earn it second, become it third.

## The AI Faker hypothesis — product north star

**Hypothesis:** the first culturally-legible "Faker of AI" will be the first individual who builds a billion-dollar business using AI as their primary leverage. This person probably already exists as an ambitious solo builder somewhere on the internet.

**DJ's framing:** don't just _design_ for that person — actively _recruit_ them onto BuildOS. The strategy is to find the future Fakers (and the AI influencers around them) and bring them on as users / template authors / public-project owners. The product becomes the place where the future Faker chooses to do their work.

**The prospect list already exists:** see `ai-influencers.md` at the repo root. 10 ranked AI-native builders with distribution + 2 "one-person near-billion-dollar" case studies (Maor Shlomo / Base44, Matthew Gallagher / Medvi).

The top targets cluster into four functional types:

- **Model-drop → demo** translators (Pietro Schirano, Nick St. Pierre, Riley Brown)
- **Demo → workflow** teachers (Riley Brown, Hamel Husain, Simon Willison)
- **Workflow → ecosystem** connectors (Swyx, Harrison Chase)
- **Leverage → outcome** operators (Maor Shlomo, Matthew Gallagher, Pieter-Levels-style indie hackers)

These are the four lanes BuildOS recruits from.

**Recommended marketing wedge (from `ai-influencers.md`):** "The AI-Native Operator Index" — a public living database of frontier builders, their stacks, workflows, and leverage patterns. Hosted on BuildOS as public projects. Each profile is essentially a public project that others can fork. This is the cultural transmission layer made operational.

**Design BuildOS for that person.** Not the average productivity-tool user. Not even the average ambitious knowledge worker. **The most ambitious solo builder currently trying to do something disproportionate to their headcount.**

### What this implies for the product

The Faker hypothesis isn't just positioning — it's a feature roadmap:

- **Memory that compounds across projects** (most AI tools forget you between sessions)
- **Agents that work on long-horizon goals** (most agent frameworks are single-task)
- **Project containers that hold years of work** (most tools are session-based or sprint-based)
- **A canvas that accepts complexity** (most opinionated tools fight complexity instead of embracing it)

### What this implies for distribution

The marketing question changes from "how do we make BuildOS famous?" to **"how do we get in front of the 1,000 most ambitious solo builders on the internet?"** That's a knowable target. They contain the next Faker.

Creator outreach should be filtered through: _is this person trying to do something disproportionate to their headcount?_ Not just "do they have an audience." Tougher filter; narrows the list; makes wins count more.

### The hedge

If the Faker hypothesis is wrong (maybe AI doesn't enable solo unicorns at scale), the capabilities you build for the solo-Faker (compound context, agent orchestration, project durability) also work for ambitious teams. **Bet on the Faker hypothesis. Build things that work even if it's wrong.**

---

## Phased action plan

### Phase A — Foundation (next 2-4 weeks)

Goal: lock the structural decisions so everything else builds on stable ground.

| #   | Action                                               | Owner                                           | Notes                                                                                                                                                     |
| --- | ---------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Lock primitive set at 7** (agent-native reasoning) | DJ + product                                    | Project Group, Project, Goal, Plan, Document, Task, Actor. Decided per DJ's agent-native argument.                                                        |
| A2  | Document the 7-primitive agent API surface           | Eng + DJ                                        | The 7 primitives are also the 7 core resource types in the agent API. See `2026-05-21-agent-host-story.md`.                                               |
| A3  | Write project-forking spec (lightweight)             | Done — see `2026-05-21-project-forking-spec.md` | Side task, captured separately                                                                                                                            |
| A4  | Audit existing invite system architecture            | Eng                                             | **Done at high level:** invite acceptance grants membership; forking/templates need a separate instantiate/copy operation behind the same intake surface. |
| A5  | Decide first 5-10 SME workflows to scaffold          | DJ                                              | Candidates: startup (YC-flavored), book (Ferriss-flavored), house purchase, course creation, consulting practice                                          |
| A6  | Score `ai-influencers.md` list with Faker filter     | DJ                                              | Drop / keep / prioritize based on "trying to do something disproportionate" — top 5 become Phase C targets                                                |
| A7  | Define Project Group implementation model            | Eng + product                                   | Required because Project Group is in the 7 primitives but does not appear to have a first-class repo model yet.                                           |

### Phase B — Scaffold templates + activation moment (next 4-8 weeks)

Goal: nail the first 60 seconds for a new user and prove the scaffold-template thesis.

| #   | Action                                                       | Owner         | Notes                                                                                                            |
| --- | ------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| B1  | Design the **first 60 seconds** experience                   | DJ + design   | Riff doc: `2026-05-21-first-60-seconds-design.md`. "Talk to AI → see structured project."                        |
| B2  | Define scaffold artifact/version model                       | Eng + content | Canonical project/spec, version, source citations, safety review, and update policy before scaling templates.    |
| B3  | Build 3 high-quality scaffold templates (not all 10 at once) | DJ + content  | Start small. Test before scaling.                                                                                |
| B4  | Build project-intake UI surface                              | Eng           | One screen can route to "accept invite," "start from template," and later "fork project"; backend routes differ. |
| B5  | Test scaffold flow with 5-10 cold users                      | DJ            | Real feedback before scaling content                                                                             |
| B6  | Iterate scaffolds based on testing                           | DJ            | Quality > quantity at this stage                                                                                 |

### Phase C — Forking + creator outreach v2 (next 4-12 weeks)

Goal: enable the marketplace layer + refilter creator outreach through the Faker lens.

| #   | Action                                                                                     | Owner | Notes                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Implement project forking (per spec)                                                       | Eng   | After project-intake surface; implement as clone/snapshot service, not `accept_project_invite`.                                     |
| C2  | Build public project / publish flow                                                        | Eng   | Required for forking; must include privacy/safety review, field export allowlist, and provenance metadata.                          |
| C3  | Re-score `ai-influencers.md` prospect list with Faker filter                               | DJ    | Already-ranked list of 10 AI-native builders. Filter on "trying to do something disproportionate" + agent-stack relevance.          |
| C4  | Pivot creator ask: from testimonial → "publish your BuildOS workflow as a public project"  | DJ    | Different artifact, different upside. For top-tier targets, layer on the "AI-Native Operator Index" framing as research collab.     |
| C5  | Begin "AI-Native Operator Index" as public BuildOS projects                                | DJ    | Each profile from `ai-influencers.md` becomes a public BuildOS project. Forkable. Becomes both marketing artifact AND product demo. |
| C6  | Engage top 5 candidates (Riley Brown, Pietro Schirano, Swyx, Simon Willison, Hamel Husain) | DJ    | Personalized outreach. Lead with the operator-index angle, not "use my product."                                                    |

### Phase D — Architecture deepening (ongoing, in parallel)

Goal: build the moat — compound context, agent integration, long-horizon project containers.

| #   | Action                                                                  | Owner    | Notes                                                                                                                         |
| --- | ----------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| D1  | **In-project collaboration depth** (revised from cross-project context) | Eng + DJ | DJ's revision: the moat is depth of in-project context + multi-actor collaboration, not cross-project context.                |
| D2  | Agent-host architecture decision                                        | Eng + DJ | Riff doc: `2026-05-21-agent-host-story.md`. MCP-first, REST-second. Token-scoped, actor-attributed.                           |
| D3  | Template evolution system                                               | Eng      | Some basics move into B2/C2 now: canonical version, fork source version, update policy. Advanced update propagation can wait. |
| D4  | Cost/perf model for compound context                                    | Eng      | If context grows forever, context costs grow forever. Pricing matters.                                                        |

---

## Open questions that still need answers

1. ~~Is "goal" a primitive?~~ **RESOLVED:** Yes. Primitive set locked at 7. Agent-native reasoning won. (See `Recommended primitive set` above.)
2. **What does the first 60 seconds actually look like?** Riff doc shipped: `2026-05-21-first-60-seconds-design.md`. Now needs DJ reaction + design iteration.
3. **What's the agent-host story?** Riff doc shipped: `2026-05-21-agent-host-story.md`. Now needs DJ reaction + architecture decisions (MCP-first? when?).
4. ~~How does cross-project context flow?~~ **DEPRIORITIZED.** Per DJ: the moat is in-project collaboration depth, not cross-project context. Revisit later if signal emerges.
5. **Top 5 from `ai-influencers.md` — which 5?** Best read: Riley Brown, Pietro Schirano, Swyx, Simon Willison, Hamel Husain. DJ to confirm or substitute.
6. **What's BuildOS's stance on the "new idea" DJ flagged but didn't share yet?** Parked — revisit when surfaces.
7. **NEW — Is the "AI-Native Operator Index" Phase C or Phase E?** The index is a strong marketing artifact. Could ship before scaffold templates if it's a faster path to credibility with target users.
8. **NEW — What is the Project Group implementation model?** Product primitive is decided; repo-level model appears unimplemented.

---

## Success metrics and gates

Phase B should not be considered successful just because the scaffold flow ships. Minimum learning gates:

- **Activation:** cold user reaches a structured project with at least one goal, one plan/document, and actionable tasks within the first session.
- **Time to first useful structure:** median under 2 minutes from first prompt or template selection.
- **Scaffold quality:** at least 60% of test users keep or lightly modify the scaffold structure instead of deleting/rebuilding it.
- **Return signal:** at least 40% of test users return to the scaffolded project within 7 days.

Phase C should not be considered successful just because public projects/forking ship. Minimum learning gates:

- **Fork usability:** fork completes in under 10 seconds for normal-sized projects and lands as an independently editable project.
- **Provenance:** forked projects retain visible source attribution and internal source version metadata.
- **Creator value:** first creator/public-project owner gets measurable value from fork count, inbound interest, or reuse.
- **Safety:** public project publish/fork flow blocks obvious secrets, private data, and unsafe content before publication.

---

## What to revisit

This document is a working snapshot of strategy on **2026-05-21**. Revisit when:

- The "new idea" DJ parked surfaces
- The Faker hypothesis gets validated or invalidated by market signal
- The first scaffold template batch tests with real users
- The forking mechanism ships and gets early usage data
- A creator publishes their first public project (the moment cultural transmission begins)
