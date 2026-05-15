---
title: 'The Floor Under the Agents: Where Does the Project Live?'
description: 'YC is flooded with agents, AI coworkers, vertical operating systems, and agent infrastructure. The missing question is where durable project memory lives.'
author: 'DJ Wayne'
date: '2026-05-14'
lastmod: '2026-05-15'
changefreq: 'monthly'
priority: '0.9'
published: true
tags:
    - AI-agents
    - agent-context
    - context-engineering
    - agent-infrastructure
    - agent-os
    - project-memory
    - yc-2026
    - build-os
    - AI-productivity
    - AI-tools
readingTime: 8
excerpt: 'The Launch YC feed is full of agents that run companies, agents that run clinics, and agents that watch other agents. The unresolved question is where the project itself lives.'
pic: 'project-layer-floor'
path: apps/web/src/content/blogs/philosophy/the-floor-under-the-agents.md
---

I scanned the [Launch YC](https://www.ycombinator.com/launches) feed this week. A long list of companies, mostly AI, mostly racing.

Agents that run companies. Agents that run clinics. Agents that schedule, route, audit, and watch other agents. Compression layers because the agents' context windows keep collapsing. Authorization layers because nobody wants those agents touching production without a leash. Observability layers because the agents fail in long, weird, stateful ways nobody can debug.

If you use AI heavily, you already know the missing piece. Your research is in one Claude thread, your outline is in Notion, your draft is in a doc, your product decisions are scattered across Slack, your todo list is somewhere else, and the stray thought that actually matters is in a voice memo from Tuesday. Every new agent asks you to explain the project again.

That is the part the launch feed mostly treats as background. It reads like a Cambrian explosion of action. Most of the energy is going into products that _do_ the work.

Watch what is still thin: the floor those agents have to stand on. A durable, user-owned place where the project itself lives.

## Four lanes, all running horizontally

There are roughly four lanes in the current launch feed. They look like different markets. They are actually all the same shape. The names matter less than the pattern, so skim the examples if you want. The map is here to show the shape of the race.

**Lane 1 — Agent doers.** Every pitch is some version of "the agent does the work for you."

- [Spine AI](https://www.getspine.ai) — spins up a swarm of agents on a visual canvas.
- [Tasklet](https://tasklet.ai) — cloud agent OS that runs knowledge-work jobs 24/7.
- [Naïve](https://usenaive.ai) — deploys autonomous AI employees to build and run businesses.
- [Hyper](https://heyhyper.ai) — self-driving company brain that learns from team tools and pipes knowledge back into AI tools.
- [Carson](https://usecarson.com) — replaces the chat box with generated, shareable task workspaces on the desktop.
- [Sila](https://silahq.com) — agentic workplace messaging where teams and AI work together in channels.
- [OpenWork](https://openworklabs.com) — open-source, enterprise-ready alternative to Claude Cowork.
- [Diana](https://getdiana.com/) — secure AI assistant in Slack with governance around every action.
- [Unify](https://unify.ai) — trains virtual colleagues that learn how teams work and improve over time.

**Lane 2 — Agent infrastructure.** Enormous and growing weekly. Split it by what it patches.

_Context and knowledge:_

- [Driver](https://www.driver.ai/) — turns codebases into structured context for humans and agents.
- [Memory Store](https://memory.store) — shared context for a team's agents across meetings, Claude sessions, and Slack.
- [Hyperspell](https://hyperspell.com), [Airweave](https://airweave.ai), and [Airbyte](https://airbyte.com/) — memory, retrieval, and context-store layers for production agents.
- [ReasonBlocks](https://reasonblocks.com/) — catches repeat failures and compounds reasoning patterns across runs.
- [Morph](https://morphllm.com) — specialized models and subagents for coding-agent context compaction and search.
- [The Token Company](https://thetokencompany.com) and [Compresr](https://compresr.ai) — compress context so agents stop choking on their own history.

_Identity, authorization, and trust:_

- [Agentic Fabriq](https://www.agenticfabriq.com) — Okta for agents (identity, governance, permissions, audit).
- [Clawvisor](https://clawvisor.com) — lets agents use apps without ever seeing credentials.
- [Velt](https://velt.dev) — collaboration infrastructure with activity logs for humans and agents both.

_Runtime, deployment, and observability:_

- [21st](https://21st.dev) — infrastructure and UI building blocks for deploying frontier agents into products.
- [Runtime](https://www.runtm.com/) — guardrails and sandboxes for team coding agents.
- [Laminar](https://laminar.sh) — open-source observability for long-running agents.
- [Chronicle Labs](https://chronicle-labs.com) — staging environments for enterprise AI agents.
- [Arga Labs](https://www.argalabs.com/) — validation infrastructure and realistic test environments.
- [Rubric AI](https://therubric.ai) — reasoning and verification infrastructure.

_Execution and integration:_

- [Zatanna](https://www.zatanna.ai/) — turns software without APIs into agent-first APIs.
- [Intuned](https://intunedhq.com) — code-first browser automation built and maintained by AI.
- [Minicor](https://minicor.com) — self-healing desktop automations at scale.
- [o11](https://o11.ai) — puts an AI agent inside every enterprise app, starting with Office and Google Workspace.

Pick a failure mode — context bloat, identity, sandboxing, traces, no-API surfaces — and there's a YC company shipping a patch this quarter.

**Lane 3 — Vertical AI OS.** Each collapses spreadsheets, chat, drives, and forms into one AI-native system of record. Clean, well-scoped, mostly defensible businesses.

- [mdhub](https://www.mdhub.ai/) — behavioral health clinics.
- [TakeCareOS](https://takecareos.com) — disability, aged care, and home care agencies.
- [Tepali](https://tepali.com) — medspas.
- [Patientdesk.ai](https://patientdesk.ai/) — dental practices.
- [Eos AI](https://www.helloeos.ai/) — hospitals and clinics.
- [Arzana](https://www.arzana.com/) — manufacturing office work like order entry, quoting, and customer updates.
- [Korso](https://korsoai.com/) — operational agents for manufacturing RFQs, quotes, suppliers, and production exceptions.
- [Trellis](https://trellistech.com) — short-term rental property management operations.
- [Avent](https://www.aventindustrial.com) — industrial distributors and manufacturers, especially quoting and order entry.
- [Burt](https://www.burthq.com/) — freight brokers and forwarders.
- [Foreman](https://foreman.co), formerly Scout Out — AI-powered project management for residential contractors.

**Lane 4 — Creator output.** Raw idea in, polished output out.

- [Mutiny](https://www.mutinyhq.com) — customer-facing sales and marketing assets.
- [Kuli](https://kuli.one) — social and creator marketing coworker for consumer brands.
- [InstaAgent](https://instaagent.com) — campaign generation across hundreds of marketing personas.
- [CharacterQuilt](https://characterquilt.com) — campaign execution inside existing marketing tools.
- [Remix](https://remix.re) — social content generated from voice notes, photos, messages, and social profiles.
- [Bluma](https://www.getbluma.com) — short-form video ads and AI UGC.
- [YouArt](https://youart.ai) — AI originals, fan funding, and creator monetization.
- [Awen](https://www.awen.ai/) — conversational visual creation.
- [Repaint](https://repaint.com) — AI website builder.
- [GladeKit](https://www.gladekit.com) and [CodeWisp](https://codewisp.ai/) — game-development agents and AI game creation.

Four lanes. Dozens of companies across the feed. Real money, real engineering, real progress. The map is credible. It is also incomplete.

## The object nobody owns

Many of these companies, especially in the agent-doer lane, assume the agent is the product.

The user shows up. The user asks for work. The agent does the work. The user goes away.

But the agent is not the durable object. The project is.

So where does the user's actual project live?

Not the artifact the agent produced. Not the chat transcript. The _project._ The accumulated decisions, the pivots, the notes from three weeks ago that explain why this is named what it is named, the half-formed thought from last night that hasn't been written down yet but is going to matter on Thursday.

Inside the agent? Agents are stateless across runs unless someone wires up memory, and even then the memory often belongs to the agent or vendor, not to the project.

Inside the model? Models compete. They lose state on every new chat. Anthropic is not going to be the system of record for work that flows through OpenAI tomorrow.

Inside one of the tools? The novelist has Sudowrite for chapters, Claude for research, Cursor for the side project, Notion for the outline, and a notes app on her phone for the things she thinks of while walking. The project doesn't live in any one of them. It lives in the gaps between them.

Pasted in by hand every morning? Yes — that's the actual answer right now. Heavy AI users spend an annoying chunk of their day re-pasting the same project context into a fresh tool. We have normalized this.

That is the gap. Some YC companies are clearly working on memory, context retrieval, and company knowledge. But most of them are building for agents, codebases, teams, or vertical workflows. The person-owned project layer is still thin.

## The infrastructure companies give it away

The agent infrastructure lane exists because agents are failing in predictable ways.

Not failing in some abstract way. Failing because their context is bad. The runtime context degrades over long runs, so [ReasonBlocks](https://reasonblocks.com/) catches the repeats. The context windows blow up, so [Morph](https://morphllm.com) and [Token Co](https://thetokencompany.com) compress them. The agent doesn't know enough about the codebase, so [Driver](https://www.driver.ai/) pre-computes a structured understanding of it. Teams cannot debug long-running agent work without traces, so [Laminar](https://laminar.sh) gives them observability.

Each one addresses a real failure mode. Taken together, they point at the same wound: _the agent didn't have the right project state at the right moment, and the user paid for it._

You can keep patching the wound. Or you can ask why the wound exists.

The wound exists because there is no canonical, persistent, user-owned place where the project lives.

The model is a brilliant stranger you hire for thirty minutes. The agent is the same stranger, slightly more autonomous, just as forgetful. Neither one has a desk in your office. Neither one knows what the project actually is. Every time they show up they ask the same questions, and you paste the same answers.

The fix is not only more agent. The fix is a floor.

## What the floor looks like

It is simple to describe and load-bearing to build.

A neutral, user-owned project layer. Reads _and_ writes. Persistent across agents, sessions, models, vendors. The human writes into it through whatever input they want — voice, brain dump, typing, file drops. The agents read off it before they do anything useful. Both parties make progress in parallel against the same project state.

This does not mean perfect context. Context is always lossy. The point is not to remember everything. The point is to keep enough shared orientation that humans and agents can keep moving without pretending they are starting from a blank page.

Not a vector database. Not a memory plugin bolted onto one provider. Not "long-term memory" that lives in someone else's product and gets revoked when the provider changes their mind. A neutral system of record for one person's work in the agent era, the same way Notion is for teams, the same way GitHub is for code, the same way Salesforce is for sales.

This is what I am building at [BuildOS](https://build-os.com). I will get back to that. It is a smaller part of this post than you would expect, because the more important argument is that _the category is going to exist whether I build it or not._ Either someone owns the person/project layer or every agent on the planet keeps starting from partial, borrowed context. There is no third option.

## An honest look at the neighbors

The closest companies split into three rings. They are all real, and they are all worth knowing.

**Direct / same-problem neighbors.** [Spine AI](https://www.getspine.ai) owns multi-agent execution on a visual canvas. [Tasklet](https://tasklet.ai) is a cloud agent OS for knowledge work. [Hyper](https://heyhyper.ai) is a self-driving company brain that learns from team tools and injects knowledge into AI tools. [Carson](https://usecarson.com) replaces the chat box with generated task workspaces. These overlap with BuildOS because they make complex AI work visible and actionable. The contrast is that they lead with the worker, the company brain, or the generated task surface. BuildOS should lead with the persistent project.

**Context-infrastructure neighbors.** [Driver](https://www.driver.ai/) is the cleanest code-scoped version of the thesis: pre-computed, structured context that humans and agents both read from. [Memory Store](https://memory.store), [Hyperspell](https://hyperspell.com), [Airweave](https://airweave.ai), and [Airbyte](https://airbyte.com/) are evidence that agent memory and context retrieval are becoming real infrastructure markets. I would not classify them as creator-facing project workspaces, but they make the same underlying point: agents need a shared source of truth before they act.

**Narrative competitors.** [Sila](https://silahq.com) is messaging-first. [Diana](https://getdiana.com/) and [OpenWork](https://openworklabs.com) are business-ready AI-coworker surfaces. [Naïve](https://usenaive.ai) and [Unify](https://unify.ai) sell the AI-employee or virtual-colleague story. These are not direct project-layer competitors in the narrow product sense. They become competitors only if BuildOS sounds like a generic AI coworker instead of the place where the project remembers.

None of these are wrong. All of them are evidence that the thesis is correct. The race is on for who owns this floor, and at what shape.

## Why this matters more for creative work than vertical AI OS

Vertical AI OS works when the workflow is narrow and regulated. A medspa has a clear loop: lead in, charting, billing, follow-up. The OS can sit on top of that loop and replace four tools and three spreadsheets. The agents inside it can do real work because the boundaries are obvious.

Creative work is not a workflow. It is a project that spans five tools and lives nowhere.

The novelist with a Substack and a podcast. The YouTuber writing a book that feeds a course that feeds the channel. The course creator with a newsletter and a research backlog and a quarterly launch. These projects don't fit any vertical AI tool because they aren't _vertical._ They are personal, multi-modal, idiosyncratic, and they sprawl.

For them, the absence of a project layer is loud. Their tabs are open. Their AI chats are full of half-explained context. Their thinking moves faster than their tools, and the gap is where everything gets lost.

The vertical OS companies are not wrong to ignore them — there is no clean workflow to operationalize. But that absence is exactly why the _horizontal_ project layer matters. Creative work exposes the missing layer first.

## The moat isn't the agent

If you build or invest in this space, here is the paragraph that matters.

Workflow-shaped agents will get copied. The model gets cheaper every quarter. The agent shapes will look familiar inside of a year. None of that is the moat.

The moat in the agent era is the project state the agent has to read before it can do anything useful. The user accumulates that state through every brain dump, every decision, every pivot, every document. It is the part the agent cannot generate, cannot guess, cannot import. It compounds with use.

The model is the cheap part. The project is the moat. And the project layer is the place that moat is supposed to live.

## The one question

If you believe the agent era is real, ask one question.

Where does the project live?

It can't live in each model — they compete and lose state on every chat. It can't live in each tool — they fragment. It can't live in each agent — agents are workers, not desks.

It has to be a neutral, user-owned surface. Either we build that, or someone else does. But it gets built.

That is the floor. That is the lane I care about. That is the thing I am building.

---

[BuildOS](https://build-os.com) is the project layer for one person and their agents. Talk into it. The project organizes. Your agents read off it. You stay in the work.

[Try BuildOS →](https://build-os.com/auth/register)
