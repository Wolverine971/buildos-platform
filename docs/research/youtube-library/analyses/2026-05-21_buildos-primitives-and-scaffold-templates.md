---
phase: 4
companion_to:
    - 2026-05-21_league-of-legends-worlds-evolution_analysis.md
    - 2026-05-21_lol-worlds-meta-evolution-and-ai-parallels.md
    - 2026-05-21_buildos-as-canvas-template-economy.md
analysis_date: 2026-05-21
analyst: DJ + Claude
status: working-thinking-doc
purpose: |
    Phase 4 of the LoL → AI parallel exercise. Sharpens the primitive set
    for BuildOS, reframes templates from "creator marketplace" to
    "expert-modeled scaffolds for onboarding," and engages with the
    "AI Faker = first solo-billion-dollar builder" hypothesis as a
    product north star.
path: docs/research/youtube-library/analyses/2026-05-21_buildos-primitives-and-scaffold-templates.md
---

# BuildOS Primitives, Scaffold Templates, and the Faker Hypothesis

## Part 1: The primitive set, sharpened

DJ named:

- Projects
- Project groups
- Tasks
- Documents
- Possibly: goals and plans

This is mostly right, but the cut is worth tightening. Two suggestions:

### Suggestion 1 — Add actors as a primitive

The SQL file open in the IDE (`accept_project_invite.sql`) shows BuildOS already has an actor system with token-based invites. Multi-actor projects (collaboration) is in the architecture. **Actors are a primitive whether or not they get top billing in marketing.**

The full primitive set then becomes:

| Primitive         | Role                          | Example                              |
| ----------------- | ----------------------------- | ------------------------------------ |
| **Project Group** | Container of related projects | "Career," "BuildOS work," "Personal" |
| **Project**       | The unit of work              | "Launch creator outreach campaign"   |
| **Document**      | Persistent context            | Strategy doc, brief, notes           |
| **Task**          | Ephemeral work unit           | "Email 20 creators by Friday"        |
| **Actor**         | Person involved               | DJ, collaborator, agent              |

This is 5 primitives — small enough to be teachable, expressive enough to handle most project types.

### Suggestion 2 — Goals and plans are project features, not separate primitives

A project IS a goal + plan + context + tasks + people. Making goal and plan separate primitives creates conceptual overhead without adding power. Better: every project has a _goal field_ and a _plan view_. Same primitive, different views.

Why this matters: the fewer primitives, the more teachable the canvas. Notion has roughly 4 (page, database, block, link). Linear has roughly 3 (workspace, project, issue). The good canvases are small.

**Recommended cut: 5 primitives, not 7.** Goals and plans are first-class _features of projects_, not separate things.

### What's deliberately NOT in the primitive set

This is also revealing. The list does NOT include:

- Meetings / events
- Habits / routines
- Files / attachments
- Tags / labels

If those aren't primitives, the implication is that BuildOS is opinionated against being a calendar, a habit tracker, a file storage system, or a tag-based organizational tool. **That's actually a sharp wedge.** Most "productivity tools" become some combination of those. BuildOS deliberately is not.

The wedge: _projects, context, work, people — that's it._ Everything else lives somewhere else and connects in via integration.

---

## Part 2: Templates reframed — from marketplace to scaffold

DJ's revision is important. I was building toward a template economy (creators publish → marketplace dynamics → cultural transmission). DJ's actual vision is different and probably better:

**Templates are research-backed onboarding scaffolds**, not user-contributed artifacts. BuildOS authors them. Each one is _inspired by_ a subject matter expert's known workflow.

Examples DJ gave:

- "Starting a startup" template inspired by Gary Tan's workflow
- "Writing a book" template inspired by Tim Ferriss
- "Buying a house" template inspired by a popular realtor's process

### Why this is more defensible than the marketplace version

| Dimension             | Marketplace templates                     | Scaffold templates (DJ's version)              |
| --------------------- | ----------------------------------------- | ---------------------------------------------- |
| Quality control       | Variable (creator-dependent)              | Built-in (BuildOS curates)                     |
| Platform risk         | Creator dependency, capture risk          | None — BuildOS owns the templates              |
| Cooperation required  | Yes (creators must publish)               | No (research-backed, no labor required)        |
| Scale                 | Long tail, mostly noise                   | Small, high-quality set                        |
| Cultural transmission | Strong (creator-driven)                   | Weaker (curation-driven)                       |
| Brand association     | Risky (creator misbehavior hurts BuildOS) | Safer (BuildOS chooses what to associate with) |

The trade-off: **scaffold templates have weaker cultural transmission but stronger control.** That's the right trade for an early-stage product where activation and quality matter more than viral cultural energy.

### The "inspired by" attribution path

There's a real legal/ethical question. "BuildOS's startup template draws from publicly-known practices of Y Combinator and Gary Tan's writings" — defensible. "Gary Tan's BuildOS Template" — not, without his cooperation.

Recommended path:

1. **Phase 1 (now → 18mo)**: Build templates _inspired by_ known SME workflows. Cite sources. Don't claim endorsement.
2. **Phase 2 (when product is mature)**: Approach SMEs whose workflows are already templated. Offer official co-branding when both sides see upside.
3. **Phase 3 (long-term)**: Some SMEs become genuine BuildOS power users and author their own templates. Real cultural transmission begins.

This is the same path Andrew Chen has described for influencer-led products: borrow authority first, earn it second, become it third.

### The architectural insight from the SQL file

The `accept_project_invite` function is interesting in this context. It accepts a tokenized invite, validates the user, and grants project access. **The exact same mechanism could deliver templates.**

A template isn't a static "starter file" — it's a **pre-scaffolded project that BuildOS _invites_ you to accept**. The same invite plumbing handles:

- Alice inviting Bob to her project (peer invite)
- BuildOS inviting a new user to the "Write a Book" scaffold (template invite)
- An agent inviting a user to a generated project (agent-spawned invite)

If this is the architecture, then **templates are an emergent property of the actor + invite system, not a separate feature.** That's a much cleaner mental model than "template = special object type."

This also has product implications:

- Templates can be versioned (like invites can be reissued)
- Templates can have provenance (who created it, who endorsed it, what it's based on)
- Templates can have permissions (some open, some private, some org-scoped)
- The same UI surface handles "accept project invite" and "start from template"

---

## Part 3: The Faker hypothesis — "first solo billion-dollar builder"

DJ's read on the AI Faker question: _the person who builds a billion-dollar business by themselves, using AI as their primary leverage. Still in the making._

This is probably right. The historical signal supports it:

- Sam Altman has explicitly predicted this (the "one-person unicorn" narrative)
- Karpathy has hinted at it
- The pattern is observable in adjacent fields: solo-founder games hitting $100M+ (Stardew Valley), solo-creator media empires (MrBeast pre-team), solo-founder SaaS hitting $10M+ (Pieter Levels)
- The leverage curve is moving from team-required to solo-possible

If the AI Faker is the "one-person billion-dollar builder," several things follow.

### What this implies about the product target

BuildOS should be designed for the person who will become the first AI Faker. Not the average productivity-tool user. Not even the average ambitious knowledge worker. **The most ambitious solo builder who is currently trying to build something disproportionate.**

This clarifies:

- **Who you're optimizing for**: the solo builder operating beyond their natural capacity
- **What capabilities matter**: compound context (memory), agent orchestration (leverage), project depth (durability)
- **What positioning matters**: "thinking environment for people making complex things" — literally the description of who Faker is for AI

This is a sharper north star than "AI for productivity." The product becomes about _capacity multiplication for ambitious solo builders._

### The structural advantage

Notice what this target user _needs_ that competitors aren't building:

- **Memory that compounds across projects** — most AI tools forget you between sessions
- **Agents that work on long-horizon goals** — most agent frameworks are single-task
- **Project containers that hold years of work** — most tools are session-based or sprint-based
- **A canvas that accepts complexity** — most opinionated tools fight complexity instead of embracing it

These are the things BuildOS is uniquely positioned to build. **The Faker hypothesis isn't just a north star — it's a feature roadmap.**

### The marketing implication

If BuildOS's user base includes the future AI Faker, then BuildOS doesn't have to _create_ the protagonist. It has to be where the protagonist already is.

That changes the marketing question from "how do we make BuildOS famous?" to "how do we get in front of the 1,000 most ambitious solo builders on the internet?" Those 1,000 people contain the next Faker. They're a knowable target.

The creator outreach campaign (per memory: 20 creators queued) should be scored against this filter: **does this person look like someone who could become the AI Faker?** Not just "do they have an audience" but "are they themselves trying to do something disproportionate?"

This is a tougher filter and probably narrows the list. But it makes every win count more.

### The risk of this framing

The risk is that the AI Faker hypothesis is wrong. Maybe AI doesn't enable solo unicorns at scale. Maybe the leverage curve stops short. Maybe team-based use still wins.

If that's the case, BuildOS optimized for the solo-Faker becomes a niche product for an audience that never materializes. The mitigation: the things you build for the solo-Faker (compound context, agent orchestration, project durability) are _also_ useful to teams. Even if no one becomes the Faker, the product is still good.

So: bet on the Faker hypothesis, but build things that work even if it's wrong.

---

## Part 4: The LoL parallel, updated

Phase 3 said BuildOS = Riot Games (the platform). With DJ's refinements, the parallel sharpens further:

**BuildOS is closer to Riot's product team than to Riot itself.** Riot doesn't just host the game — they design the systems, ship the patches, build the in-client coaching, and curate the cultural surface. BuildOS does the equivalent: designs the primitives, ships the templates, integrates the AI, curates the experience.

The new mapping:

| LoL                                                            | BuildOS                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Riot's product team                                            | BuildOS product team                                                     |
| The game itself (with primitives like champions, items, runes) | The canvas (with primitives: projects, groups, tasks, documents, actors) |
| Pre-configured loadouts based on top players' setups           | Scaffold templates inspired by SME workflows                             |
| Pro players (Faker, etc.)                                      | The future AI Faker — currently a BuildOS power user                     |
| The patch cycle (every 2 weeks, ships meta changes)            | BuildOS product evolution (model improvements, primitive refinements)    |
| The cultural surface (esports broadcasts, social content)      | DJ's anti-AI positioning, creator outreach, brand narrative              |

The point of this updated mapping: **BuildOS controls all the surfaces.** It's not waiting for a community to emerge — it's designing the conditions under which the right community emerges. That's Riot-level platform thinking.

---

## Part 5: What's actionable

Six things that follow directly from this round:

1. **Lock the primitive set to 5: project group, project, document, task, actor.** Goals and plans are project features, not separate primitives. Resist scope creep.

2. **Templates = invite-delivered scaffolds.** Use the existing actor/invite infrastructure. Templates are pre-scaffolded projects you can "accept" into your workspace.

3. **First template batch**: 5–10 high-quality scaffolds inspired by clearly-known SME workflows. Citations on sources. No claims of endorsement. Examples to ship: startup (YC-flavored), book writing (Ferriss-flavored), house buying, course creation, consulting practice.

4. **Filter creator outreach through the Faker lens.** Each candidate: _is this person trying to do something disproportionate?_ Score on that, not just audience size. Cut the list to the people who actually fit.

5. **Architectural unification**: same invite mechanism delivers peer invites, template invites, and agent-spawned project invites. Don't build three systems.

6. **Build for the Faker hypothesis, but hedge.** The capabilities needed (compound context, agent orchestration, project durability) work for solo Fakers AND for ambitious teams. You don't need the Faker hypothesis to be right for the product to be good.

---

## Part 6: Open questions still worth sitting with

1. **What's the activation moment for a new BuildOS user?** Picking a template is a start. But what's the magical first 60 seconds? Notion is famously bad at this. BuildOS has a chance to nail it because the AI can take a half-formed thought and turn it into a structured project. _That_ is the activation moment — not "pick a template," but "talk to the AI and see your messy thinking become structure."

2. **How does context compound across projects?** This is the BuildOS macro innovation. Within a project, context accumulates. Across projects, does context flow? Does the AI know I'm working on creator outreach because I also have a brand strategy project open? This cross-project context might be the actual moat.

3. **What's the agent-host story?** DJ mentioned "you could connect your agent." If BuildOS is the surface where multiple agents work on the same project, that's a real architectural play. But it requires clarity about: which agents, with what permissions, in what protocol. _Is this MCP? Is it a custom integration? Is it agent-to-agent communication via BuildOS?_

4. **How do templates evolve over time?** Real expert workflows change. Tim Ferriss's book process in 2010 vs. 2026 — completely different. If templates go stale, they hurt the product. Who maintains them? Is there a "template version updated" workflow?

5. **The Faker question continues**: if BuildOS's bet is that the AI Faker is currently a solo builder somewhere on the internet, what's the _outreach_ to find them? It's not the 20-creator campaign — those are amplifiers. It's the search for the actual person. Where do they live? Twitter? Hacker News? Specific Discord communities? IndieHackers? _Knowing where to look for the Faker is itself a product decision._

---

## The takeaway

DJ's refinements collapse the analysis into something tighter:

- **5 primitives** (not 7)
- **Curated scaffold templates** (not a marketplace)
- **Invite-delivered templates** (not a separate system)
- **SME-inspired attribution** (with a path to official partnership later)
- **The Faker hypothesis as product north star** — design for the solo builder operating beyond capacity

What's left to figure out: the activation moment (first 60 seconds), cross-project context (the real moat), agent-host architecture (the differentiator from Notion), and where to find the future Faker before anyone else does.

The hardest single question: **what does the first 60 seconds of BuildOS look like for someone who just heard about it?** Everything else follows from that.
