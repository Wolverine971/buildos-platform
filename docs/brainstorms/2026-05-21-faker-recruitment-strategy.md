---
date: 2026-05-21
title: Recruiting the First Fakers — Strategy + Playbook
status: draft-for-action
parent_strategy: docs/brainstorms/2026-05-21-buildos-canvas-strategy-and-phased-plan.md
related_docs:
    - ai-influencers.md
    - docs/brainstorms/2026-05-21-agent-host-story.md
    - docs/brainstorms/2026-05-21-first-60-seconds-design.md
target_phase: Phase C
path: docs/brainstorms/2026-05-21-faker-recruitment-strategy.md
---

# Recruiting the First Fakers — Strategy + Playbook

> The deep-dive on how to actually win the people on `ai-influencers.md` —
> AI-native builders with distribution, future Fakers, frontier validators,
> and ecosystem amplifiers. This is the strategic and tactical playbook.

## Status & the real blocker (updated 2026-06-10)

Per-target profiles are now being built (the Stage-1 artifact this doc describes), and the deep research keeps overturning this doc's original assumptions. Profiles live in `docs/marketing/growth/target-influencers/ai-native-builders/`:

- **Riley Brown** — ✅ profiled. Reclassified from "Segment A workspace-recruit" to **peer-founder** (he shipped VibeCode's multi-agent CLI). Un-gated: a peer DM is sendable now.
- **Simon Willison** — ✅ profiled. **More gated than this doc assumed**, not less (see below).
- **Swyx** — 🟡 profiling next.
- **Matt Ganzak** — ✅ profiled (added 2026-06-17). AI-business educator/operator with distribution (250K newsletter, Sprint cohort, _Idea to Exit_ pod). Two-sided target: power user (multi-business sprawl) + amplifier (250K AI-operator audience = mainstream BuildOS persona). **Sendable now** (operator-to-operator note + offer to spin up a real project); deep demo gated on MCP. Defuse "Sprint competitor" read by layer.
- **GeeIHadAGoodTime** — ✅ profiled (added 2026-06-17). Frontier agent-infra builder (Agent-Xray = agent decision-surface observability; ViolaWake). Simon-class **technical validator/peer, gated on MCP**. First touch = genuine engagement on his repo, no pitch. Agent-Xray is the exact adjacent layer to BuildOS (diagnosis vs. source-of-truth). **Reach resolved 2026-06-19: essentially zero distribution (GitHub <1yr old, 0 followers, Agent-Xray 1★, no TikTok/X/YT) — he's a pure peer/validator, NOT an amplifier. Value = technical credibility, not reach.**
- **Elena Nisonoff** — ✅ profiled (added 2026-06-17). Tech-TikTok creator (~100K, recently banned) **and** co-founder of Halcyon PR (Bitcoin/stablecoins/AI). Amplifier + connector. **Sendable now.** Hook = her "needed somewhere else to offload" post after the TikTok ban. Two traps: don't pitch her firm, don't pitch her for PR — lead peer-to-peer.

**Candidate backlog (2026-06-19):** ~26 additional un-profiled tech/AI-influencer candidates are research-captured in `docs/marketing/growth/target-influencers/CANDIDATE-PIPELINE-2026-06-19.md` (Tier 1 recommended-first: Cole Medin, Francesco D'Alessio, Geoffrey Huntley, Karo Zieminski; plus a TikTok tier, amplifier tier, and a partner-lane). The cross-lane **dedup hub is now `docs/marketing/growth/target-influencers/INDEX.md`** — check it before researching anyone new. None are profiled or sent yet; each needs a Stage-1 profile before send. **Tier-1 + best-test candidates had a data-accuracy pass on 2026-06-19** (several emails were fabricated/stale and are now corrected in the pipeline doc); the rest still need data re-verification.

**The real blocker: there is no public, security-hardened BuildOS MCP server yet.** This doc was written assuming validators could "start now" with "an open-source MCP server" (Segment B) and that only Segment A needed MCP. That's wrong on both counts:

1. **The MCP server gates BOTH Segment A AND Segment B.** Validators (Simon, Hamel) have nothing rigorous to evaluate without it — and for Simon specifically, the artifact must survive his published **lethal-trifecta** attack on Supabase-backed MCP servers (BuildOS is Supabase). A naive server sent cold to him is the _worst_ outcome.
2. **So the critical path for ~6 of 10 targets is one piece of engineering**, not more outreach: ship an open-source, lethal-trifecta-self-audited MCP server + a one-command repro. Everything in Segments A and B queues behind it.

**What's genuinely sendable now (only two):** **Swyx** (ecosystem artifact — needs no product) and **Riley** (peer-to-peer DM — needs no demo). Everything else is _prep behind the MCP server._ The corrected "what to do this week" section at the bottom reflects this.

## The mindset shift — this is not B2B sales

The people on the list have heard from 50+ founders this month. They get pitched constantly. Generic outreach, demo requests, "would love to chat" — all of it pattern-matches to noise. The signal/noise ratio they face is brutal.

To get through:

- **Show, don't ask.** Build something useful for them. Send it. Ask for nothing.
- **Sound like a peer, not a pitch.** Builder-to-builder language. Specific. Direct. Brief.
- **Be useful first, ask never (or much later).** If the first touch is helpful, you're building credibility. Asking comes 30+ days in if at all.
- **Treat them like specialists.** Demonstrate that you've actually read their work, understand their stack, and know what they care about.

**The goal of first contact is not conversion. It is credibility.** Conversion comes after they've decided you're not noise.

## Segmenting the prospect list

The `ai-influencers.md` list isn't homogeneous. Different prospects need different pitches and different sequencing. Five segments:

### Segment A — Agent-stack power users (need MCP / agent-host before serious recruitment)

- **Riley Brown** — deep in Claude Code, Cursor, Codex, OpenClaw. **⚠️ Reclassified 2026-05-30 → peer-founder, not workspace-recruit.** Research revealed he co-founded VibeCode and shipped the Vibecode CLI (a multi-agent execution layer). The Segment A "build him a workspace" motion is the wrong move and the Worked Example below is partly obsolete. See full profile + corrected outreach: `docs/marketing/growth/target-influencers/ai-native-builders/riley-brown.md`.
- **Pietro Schirano** — design + AI app generation, MagicPath
- **Maor Shlomo** — solo founder (Base44), AI-native stack

**What they need from BuildOS:** cross-agent state. Their tools forget; BuildOS remembers. This pitch only lands if the agent integration works in a demo.

**Sequencing:** defer serious recruitment until MCP-first agent integration is demo-able (~3 months per agent-host doc).

### Segment B — Validators / technical evaluators (need rigor, not features)

- **Simon Willison** — practical, skeptical, technically grounded
- **Hamel Husain** — evals, applied AI engineering

**What they need from BuildOS:** something to evaluate honestly. They write technical analyses. The artifact is "here's a rigorously-built thing, please tear it apart."

**Sequencing:** ⚠️ **Corrected 2026-06-02 — NOT "start now."** This requires a public, security-hardened MCP server that doesn't exist yet (see "Status & the real blocker" up top). For Simon specifically the server must survive his lethal-trifecta lens before it's sendable. Their criticism is more valuable than their endorsement — which is exactly why you can't send them a half-built artifact. This segment is **gated behind the MCP server**, same as Segment A. See `simon-willison.md` for the full precondition.

### Segment C — Ecosystem amplifiers (need ideas + artifacts, not products)

- **Swyx** — runs AI Engineer + Latent Space
- **Rowan Cheung** — The Rundown AI, distribution

**What they need from BuildOS:** ideas worth amplifying. Artifacts their community would find useful. Swyx doesn't have a workflow pain; he has a curation role.

**Sequencing:** can start now. Contribute to AI Engineer with research artifacts ("context engineering primitives," "agent stack maps"). Build things their community references.

### Segment D — Business / enterprise voice (different audience)

- **Allie K. Miller** — enterprise AI adoption

**What they need from BuildOS:** boardroom-ready frameworks for AI adoption. She speaks to executives.

**Sequencing:** lower priority for the Faker hypothesis. Allie's audience is enterprise teams, not solo builders. Revisit when BuildOS has team/org features.

### Segment E — Case study targets (study, don't recruit)

- **Maor Shlomo** (Base44)
- **Matthew Gallagher** (Medvi)

**What they offer BuildOS:** lessons. They're the closest existing analogs to the AI Faker. The play is to study what they did, not to convert them as users. Maor might also fit Segment A; Matthew probably not.

### Outside the file — Segment F: protagonist-tier (Karpathy)

The file mentions Andrej Karpathy but explicitly says: _don't try to "work with him" first. Build artifacts around his frames._

This is the right call. Karpathy is a category-defining voice. Recruitment of him as a user is years away if it ever happens. Recruitment of his _frames_ (vibe coding, software 3.0, agentic engineering) into BuildOS's vocabulary is happening today and should continue.

## The artifact strategy

The single highest-leverage thing in this whole playbook: **what you send as the first touch.**

### The wrong artifacts (most cold outreach)

- Generic demo video
- "Schedule a call" link
- Marketing one-pager
- Beta access invite
- "Read about us" link

### The right artifact: a pre-built BuildOS workspace, specifically for them

For each top target, pre-build a BuildOS workspace that contains:

- **A project** for whatever they're publicly working on right now (their next podcast episode, current open-source release, ongoing course, etc.)
- **A goal** extracted from their public statements about that project
- **A plan** scaffolded from their workflow patterns (visible in their content)
- **Documents** populated from their public writing on the topic
- **Tasks** identified from what they've said they need to do next
- **Optional:** a draft brief generated from their existing work

Share via a link they can open without signup. Read-only initially; "take it over" if they want to claim it.

The framing line:

> "I built you a BuildOS workspace based on your last [N] posts. Link's below. No signup. Look around. Take it over if useful."

This works because:

- It demonstrates BuildOS's actual capability (taking messy public content and producing structure)
- It's obviously customized — they know it was made for them
- There's zero commitment (no signup, no call)
- It implicitly answers the "what is BuildOS?" question without explaining it
- The artifact IS the demo

### Why this works for this specific audience

People in the prospect list are sensitive to "show vs tell." They live in a world of demos. A demo that's specifically about _their_ work, that produces _their_ artifacts, is qualitatively different from a generic demo.

This is also what DJ already intuited: _"sending them demos of their projects or their project work in progress and courting them this way."_ The intuition is right. The work is in making the artifact actually good — not a half-baked "we tried to scrape your blog" version, but a real BuildOS workspace that would be useful to inherit.

## The outreach mechanics

### Channel selection (per target)

| Target          | Best channel                   | Why                                     |
| --------------- | ------------------------------ | --------------------------------------- |
| Riley Brown     | LinkedIn DM                    | He's most active there, posts long-form |
| Pietro Schirano | LinkedIn or X DM               | Mix of both                             |
| Swyx            | X DM or email                  | He's on X and has a public email        |
| Simon Willison  | Email (his blog has a contact) | Doesn't do DMs much                     |
| Hamel Husain    | X DM or email                  | Active on X                             |
| Nick St. Pierre | X DM                           | X-native                                |
| Rowan Cheung    | X DM                           | Distribution person, lives on X         |
| Allie K. Miller | LinkedIn DM                    | LinkedIn-native business voice          |
| Harrison Chase  | Email                          | CEO of LangChain, formal channels       |
| Maor Shlomo     | LinkedIn DM                    | Acquired-founder, more reachable        |

Don't multi-channel them. Pick the best one. Failing on the right channel is better than appearing desperate across three.

### Message structure (the template)

Five lines max. Optimal length.

```
[Specific reference to their recent work]

[One direct value claim — what BuildOS does for them, in their language]

[Link to the artifact you built for them]

[Zero-pressure close — "no reply needed" or similar]

— DJ
```

### Example: Riley Brown

```
Hey Riley,

Saw your post on "what I got wrong using Claude Code + Cursor + Codex."
I'm building something that holds project state across agent tools —
your three-agent stack could share context.

I pre-built a BuildOS workspace based on your last 3 LinkedIn posts about
your agent workflow: [link]. No signup; you don't need an account. Take it
over if useful.

No reply needed.

— DJ
```

### Example: Simon Willison

```
Hi Simon,

I built something I'd like an honest technical read on. It's a project
canvas with an MCP server exposing 7 primitive types (projects, plans,
goals, docs, tasks, actors, project groups).

The MCP server is open-source: [link]. Spec doc: [link]. Demo workspace:
[link].

Would be grateful for your evaluation, however brutal. Not asking for
endorsement — asking for analysis.

— DJ
```

Notice the differences:

- Riley gets the agent-stack pitch
- Simon gets the rigor / "tell me what's wrong" pitch
- Both are <100 words
- Both lead with specific knowledge of the person
- Neither asks for a meeting

### Anti-patterns (what NOT to do)

1. **Don't say "I'm a huge fan of your work."** Reads as flattery. Cut it.
2. **Don't say "we" if it's just you.** Honesty about scale is credibility.
3. **Don't ask for a call in the first message.** Calls happen later, if at all.
4. **Don't ask for a post or tweet.** Quid pro quo destroys trust instantly.
5. **Don't follow up if you didn't get a response.** Send a _different_ artifact instead. Three touches max, then graceful disengagement.
6. **Don't make BuildOS the subject.** The subject is their work. BuildOS is the verb.

## The funnel

Six stages from cold to cultural transmission.

### Stage 1 — Research (1-2 hours per target)

For each target:

- Read everything they've published in the last 90 days
- Identify what they're currently working on (their next launch, current project, ongoing series)
- Identify their workflow stack (often visible in their content)
- Identify their stated pain points (often expressed in tweets/posts)
- Map this against what BuildOS can demonstrably do
- Note: who's already in their orbit (mutual connections, ecosystem positioning)

Output: a research doc per target with the above + a draft outreach.

### Stage 2 — Build the artifact (2-4 hours per target)

Build a personalized BuildOS workspace for them. Quality matters more than speed. **A weak artifact is worse than no outreach.**

Quality bar:

- The project structure has to actually match how they think (not generic)
- The documents have to be substantive (not "here's a placeholder")
- The tasks have to be the ones they'd actually need to do
- The plan has to reflect their stated workflow

If it isn't impressive when you look at it yourself, don't send it.

### Stage 3 — First touch (5 minutes per target)

Send the message + artifact. Use the template. No pressure. No follow-up commitment.

### Stage 4 — Wait (2-3 weeks)

Most won't respond. That's fine. Move on to the next target while waiting.

### Stage 5a — If no response, second artifact (different, not a re-send)

Three weeks later, send something different:

- An analysis of their workflow pattern
- A comparison of their stack vs. similar builders
- A question that requires their expertise
- A piece of research relevant to what they care about

Never resend. Never increase urgency. Never reference the first message as "did you see this?"

Three total touches max. After that, disengage gracefully. Re-engage in 6 months only if there's a genuinely new reason.

### Stage 5b — If they respond positively

**Do NOT pitch the product.** They've already self-qualified by responding to the artifact.

Instead:

- Ask a question that demonstrates their expertise matters
- Offer to extend the artifact (more depth, more polish, more customization)
- Let them ask what BuildOS is — don't volunteer
- If they ask, answer briefly and offer to show them more if they're curious

The conversion happens when they ask to see more. Until they ask, you're still in trust-building mode.

### Stage 6 — They use BuildOS

If they sign up and start using it:

- Get out of the way
- Make sure the product delivers on the demo (this is where the first-60-seconds design matters)
- Don't add them to a "VIP user" list and start hovering
- Watch what they do; learn from it
- If they publish about it organically, amplify but don't push

### Stage 7 — Cultural transmission ask (30-60 days in)

Once they've used BuildOS for a month and have actual content there, ask:

> "Would you be open to publishing your [project] workspace as a public template? It'd help others see how someone like you structures this kind of work. Forks come back to you as attribution."

This is the moment cultural transmission begins. It's also the moment when the recruitment ROI compounds — each public template attracts more potential Fakers.

## Dependencies and timing

### Dependency 1 — MCP / agent-host integration ships before Segment A recruitment

Riley, Pietro, and Maor are agent-stack power users. Their pitch requires demonstrable cross-agent state. Until MCP is demo-able, the artifact for them is weaker than it could be.

**Timeline:** MCP-first agent host targeted ~3 months out (per agent-host doc). Defer Segment A serious outreach until then. Use the interim to build artifacts in advance.

### Dependency 2 — First 60 seconds works before any recruitment scales

If the first 60 seconds doesn't deliver the magic, no recruited prospect will stick around. Even worse: a high-credibility prospect who tries BuildOS and bounces will (deservedly) write something honest about why. That's an industry-wide negative signal.

**Implication:** ship the first 60 seconds design (Phase B) before sending high-stakes outreach.

### Dependency 3 — Recruitment itself should be a BuildOS project

DJ's recruitment of the first Fakers is its own complex project with multiple sub-projects, ongoing context, recurring tasks, and an evolving plan. **Run it inside BuildOS.** Each target is a project. Research docs live as documents. Outreach drafts live as documents. The plan view shows the funnel.

Three benefits:

1. DJ uses the product on a real, high-stakes workflow — finds gaps fast
2. The recruitment work itself becomes a forkable public template later ("how I recruited the first 10 AI-native builders to my product")
3. It demonstrates dogfooding — credibility signal for anyone who notices

## Tracking and accountability

For each prospect:

| Field                           | Notes                                                   |
| ------------------------------- | ------------------------------------------------------- |
| Name                            | Person                                                  |
| Segment                         | A/B/C/D/E                                               |
| Channel                         | Preferred outreach channel                              |
| Research date                   | When research was completed                             |
| Research doc link               | Link to the per-target research doc                     |
| Artifact status                 | Not started / in progress / shipped                     |
| Artifact link                   | Link to the BuildOS workspace built for them            |
| First touch sent                | Date                                                    |
| First touch response            | Yes/No/What kind                                        |
| Second artifact (if applicable) | Status                                                  |
| Outcome                         | No response / declined / engaged / converted / advocate |
| Notes                           | Anything else                                           |

Track in a BuildOS project. Each target as a task or sub-document.

## What to do this week (concrete starting point)

> **⚠️ Rewritten 2026-06-10.** The original "starting 3" (Simon, Hamel, Swyx) assumed the validators were sendable now. Per-target research proved Simon and Hamel are **gated behind the MCP server** (see "Status & the real blocker" up top). The genuinely-now-actionable set is smaller and split between two tracks.

**Track 1 — send now (2 targets, no product/MCP required):**

1. **Swyx** (Segment C) — publish a research artifact for the AI Engineer community ("Context Engineering Primitives" / "Agent Stack Maps"). Needs no BuildOS product surface; it's a contribution, not a pitch. _(Profile in progress — finish it before publishing.)_
2. **Riley Brown** (reclassified peer-founder) — a peer-to-peer DM, honest about the layer overlap. Sendable now; does **not** need the cross-agent demo. Draft is ready in `riley-brown.md`.

**Track 2 — the unlock (one engineering effort that ungated ~6 targets):**

3. **Ship the open-source, lethal-trifecta-self-audited MCP server + a one-command repro.** This is the critical path for the entire validator segment (Simon, Hamel) and Segment A. It is higher-leverage than any individual outreach right now: it converts ~6 gated targets into sendable ones. Until it exists, those targets are **prep** (build the repro, run the self-audit, warm up via genuine engagement on their posts) — **not send.**

The old framing ("three working examples of the funnel before scaling to agent-stack people") still holds in spirit — just understand that two of the original three were never actually unblocked. Get one full loop via **Swyx or Riley**, and put real weight behind the **MCP server** so the validators open up.

## Worked example — Riley Brown (when MCP ships)

> **⚠️ Superseded in part (2026-05-30).** This walkthrough was written before we knew Riley co-founded VibeCode and shipped the Vibecode CLI — a multi-agent execution layer that already does cross-agent execution + context persistence. The "pre-build him a workspace, your three-agent stack could share context" framing below would now read as pitching him his own product, or as competitor recon. **The corrected play treats him as a peer-founder** (BuildOS = the project/thinking layer _above_ his execution layer) and is **sendable now without MCP.** Use the full profile as the source of truth: `docs/marketing/growth/target-influencers/ai-native-builders/riley-brown.md`. Keep the structure below only as a generic "when MCP ships, here's the funnel shape" reference — not as Riley-specific guidance.

A complete walkthrough of how to recruit Riley Brown once the agent host is ready:

### Week 0 — Research

- Read his last 30 posts on LinkedIn
- Pull the workflow patterns he describes (Claude Code → Cursor → Codex flow)
- Note his stated frustrations (context loss between sessions, etc.)
- Identify his current project (latest course, video series, or product)
- Output: a research doc capturing all of this

### Week 1 — Build the artifact

- Create a BuildOS workspace called "Riley Brown — AI Agent Stack Workflow"
- Project: his current public project (e.g., his AI agent course)
- Goal: extracted from his stated goals
- Plan: scaffolded from his workflow patterns
- Documents: a "Workflow Comparison" doc showing how the 3-agent stack would share state via BuildOS; a "Course Outline" doc populated from his recent posts; a "Context Library" doc with key references he's mentioned
- Tasks: 10 concrete next actions for his course
- MCP demo: video showing Claude Code connecting to BuildOS, reading the project, then a fresh Claude Code session continuing where the first left off
- Loom video walkthrough (90 seconds)

### Week 2 — First touch

LinkedIn DM:

```
Hey Riley,

Saw your post about what you got wrong using Claude Code + Cursor + Codex —
the context loss between agents resonated. I've been building something
that solves exactly that.

I pre-built a BuildOS workspace for your current course, with a working demo
of Claude Code reading the same project across sessions: [link]. No signup.
Take it over if useful.

— DJ
```

### Week 5 — If no response, second artifact

Different angle. Maybe: an analysis of how his 3-agent stack compares to other prominent AI educators' stacks, hosted as a BuildOS public project. Send the link with: "Built this for the community; thought it might be useful if you reference it."

### Week 8 — If still no response

Disengage. Re-engage in 6 months only if there's a new reason (BuildOS hits a milestone, MCP ecosystem shifts, etc.).

### Week 12 — If converted

He's using BuildOS for his actual work. Don't hover. Let him discover features. Watch what he does.

### Week 16-20 — Cultural transmission ask

"Hey Riley — would you be open to publishing your agent-stack workspace as a public BuildOS template? Your audience would find the structure useful, and you'd get attribution on every fork."

If yes: this is the moment cultural transmission begins. Riley's template becomes the canonical "AI educator agent stack" template on BuildOS. Other agent educators fork it. The platform absorbs the meta.

## Risks

1. **Over-investing in any one prospect.** If a target doesn't respond after 3 touches, move on. Don't keep optimizing the artifact in hopes they'll see it.

2. **Lowering quality to scale.** A weak artifact is worse than no artifact. Better to send 3 great workspaces than 10 mediocre ones.

3. **Pushing for endorsements.** They sense it instantly. Never ask for a tweet, post, or quote. Let it happen organically or not at all.

4. **Premature scaling.** Recruiting before the first 60 seconds works is dangerous — burnt impressions are hard to undo with this audience.

5. **Losing voice.** This entire playbook collapses if the messages start sounding like marketing copy. Keep it builder-to-builder, short, specific, peer-to-peer.

6. **Public attribution conflicts.** If a target publishes about BuildOS and it goes mildly viral, others on the list might feel "passed over." Recruit in a sequence that handles this — talk to your top 5 in close succession.

## The one-line philosophy

**Build the thing they'd want to find. Send it. Ask for nothing. Win by being useful before you ever ask for anything.**

Everything else in this playbook is just execution detail on that line.
