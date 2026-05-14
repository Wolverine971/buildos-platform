---
title: 'The Floor Under the Agents: What Every YC AI Launch Forgot to Build'
description: 'A read of the current YC launch feed. Four lanes are racing for the agent era. None of them are building the one layer the agents have to stand on.'
author: 'DJ Wayne'
date: '2026-05-14'
lastmod: '2026-05-14'
changefreq: 'monthly'
priority: '0.9'
published: false
tags:
    [
        'AI-agents',
        'agent-context',
        'context-engineering',
        'agent-infrastructure',
        'agent-os',
        'project-memory',
        'yc-2026',
        'build-os',
        'AI-productivity',
        'AI-tools'
    ]
readingTime: 8
excerpt: 'The Launch YC feed is full of agents that run companies, agents that run clinics, agents that watch other agents. Watch what is missing. Nobody is building the floor they all have to stand on.'
pic: 'project-layer-floor'
path: apps/web/src/content/blogs/philosophy/the-floor-under-the-agents.md
---

I scanned the [Launch YC](https://www.ycombinator.com/launches) feed yesterday. A few hundred companies, mostly AI, mostly racing.

Agents that run companies. Agents that run clinics. Agents that schedule, route, audit, and watch other agents. Compression layers because the agents' context windows keep collapsing. Authorization layers because nobody wants those agents touching production without a leash. Observability layers because the agents fail in long, weird, stateful ways nobody can debug.

It reads like a Cambrian explosion of action. Everyone is building something that *does* the work.

Watch what is missing.

Nobody is building the floor those agents have to stand on.

## Four lanes, all running horizontally

There are roughly four lanes in the current launch feed. They look like different markets. They are actually all the same shape.

**Lane 1 — Agent doers.** [Spine AI](https://www.ycombinator.com/companies/spine-ai) spins up a swarm of agents on a visual canvas. [Tasklet](https://www.ycombinator.com/companies/tasklet-2) is a cloud agent OS that runs knowledge-work jobs 24/7. [Naive](https://www.ycombinator.com/companies/naive) deploys AI employees to run companies. [Sila](https://www.ycombinator.com/companies/sila) and [OpenWork](https://www.ycombinator.com/companies/openwork) put AI coworkers in your team chat. Every pitch is some version of "the agent does the work for you."

**Lane 2 — Agent infrastructure.** [Driver](https://www.ycombinator.com/companies/driver) turns codebases into structured context for AI. [ReasonBlocks](https://www.ycombinator.com/companies/reasonblocks) is a runtime that catches repeat failures and compounds reasoning across runs. [Morph](https://www.ycombinator.com/companies/morph), [The Token Company](https://www.ycombinator.com/companies/the-token-company), and [Compresr](https://www.ycombinator.com/companies/compresr) compress context so the agents stop choking on their own history. [Agentic Fabriq](https://www.ycombinator.com/companies/agentic-fabriq) is Okta for agents. [Clawvisor](https://www.ycombinator.com/companies/clawvisor) and [Clam](https://www.ycombinator.com/companies/clam/) handle authorization and safety. [Laminar](https://www.ycombinator.com/companies/laminar) and [Runtime](https://www.ycombinator.com/companies/runtime) handle observability and sandboxing. Pick a failure mode and there is a company patching it.

**Lane 3 — Vertical AI OS.** [mdhub](https://www.ycombinator.com/companies/mdhub) for behavioral health clinics. [TakeCareOS](https://www.ycombinator.com/companies/takecareos) for home care. [Tepali](https://www.ycombinator.com/companies/tepali) for medspas. Logistics, construction, manufacturing, dental clinics — each one collapses the spreadsheets, the chat, the drives, and the forms into one AI-native system of record. These are clean, well-scoped, mostly defensible businesses.

**Lane 4 — Creator output.** [Mutiny](https://www.ycombinator.com/companies/mutiny), [Remix](https://www.ycombinator.com/companies/remix-2), [Bluma](https://www.ycombinator.com/companies/bluma), [InstaAgent](https://www.ycombinator.com/companies/instaagent), [Kuli](https://www.ycombinator.com/companies/kuli). Raw idea in, polished campaign or ad or video out.

Four lanes, dozens of companies, real money, real progress. Now look at the assumption sitting under all of them.

## The assumption nobody questions

Every one of these companies assumes the agent is the product.

The user shows up. The user asks for work. The agent does the work. The user goes away.

So where does the user's actual project live?

Not the artifact the agent produced. Not the chat transcript. The *project.* The accumulated decisions, the pivots, the notes from three weeks ago that explain why this is named what it is named, the half-formed thought from last night that hasn't been written down yet but is going to matter on Thursday.

Inside the agent? Agents are stateless across runs unless someone wires up memory, and even then the memory is per-agent.

Inside the model? Models compete. They lose state on every new chat. Anthropic is not going to be the system of record for work that flows through OpenAI tomorrow.

Inside one of the tools? The novelist has Sudowrite for chapters, Claude for research, Cursor for the side project, Notion for the outline, and a notes app on her phone for the things she thinks of while walking. The project doesn't live in any one of them. It lives in the gaps between them.

Pasted in by hand every morning? Yes — that's the actual answer right now. Heavy AI users spend a measurable fraction of their day re-pasting the same project context into a fresh tool. We have normalized this.

That is the gap. None of the four lanes is closing it. They are all building things that run on a floor that doesn't exist yet.

## The infrastructure companies prove it from the other direction

Here is the part that should embarrass us. The agent infrastructure lane exists because the agents are failing.

Not failing in some abstract way. Failing because their context is bad. The runtime context degrades over long runs, so [ReasonBlocks](https://www.ycombinator.com/companies/reasonblocks) catches the repeats. The context windows blow up, so [Morph](https://www.ycombinator.com/companies/morph) and [Token Co](https://www.ycombinator.com/companies/the-token-company) compress them. The agent doesn't know enough about the codebase, so [Driver](https://www.ycombinator.com/companies/driver) pre-computes a structured understanding of it. The agent doesn't know what its peers did, so [Laminar](https://www.ycombinator.com/companies/laminar) gives you traces.

Every one of these is a patch on the same wound: *the agent didn't have the right project state at the right moment, and the user paid for it.*

You can keep patching the wound. Or you can ask why the wound exists.

The wound exists because there is no canonical, persistent, user-owned place where the project lives.

The model is a brilliant stranger you hire for thirty minutes. The agent is the same stranger, slightly more autonomous, just as forgetful. Neither one has a desk in your office. Neither one knows what the project actually is. Every time they show up they ask the same questions, and you paste the same answers.

The fix is not more agent. The fix is a floor.

## What the floor looks like

It is small to describe and load-bearing to build.

A neutral, user-owned project layer. Reads *and* writes. Persistent across agents, sessions, models, vendors. The human writes into it through whatever input they want — voice, brain dump, typing, file drops. The agents read off it before they do anything useful. Both parties make progress in parallel against the same project state.

Not a vector database. Not a memory plugin bolted onto one provider. Not "long-term memory" that lives in someone else's product and gets revoked when the provider changes their mind. A neutral system of record for one person's work in the agent era, the same way Notion is for teams, the same way GitHub is for code, the same way Salesforce is for sales.

This is what I am building at [BuildOS](https://build-os.com). I will get back to that. It is a smaller part of this post than you would expect, because the more important argument is that *the category is going to exist whether I build it or not.* Either someone owns the project layer or every agent on the planet keeps starting from zero. There is no third option.

## An honest look at the neighbors

The five companies closest to this thesis are all real and all worth knowing. Here is the fair read.

**[Spine AI](https://www.ycombinator.com/companies/spine-ai).** Owns multi-agent execution on a visual canvas. You prompt, agents spin up, work happens in front of you. Beautiful surface. The project state still lives in the canvas runs — between sessions, it is a question mark.

**[Tasklet](https://www.ycombinator.com/companies/tasklet-2).** A cloud agent OS that connects to your tools and runs workflows around the clock. Closest narrative competitor for the heavy AI user. The contrast is direct: Tasklet is built around the worker. The project layer should be built around the work.

**[Hyper](https://www.ycombinator.com/companies/hyper-4).** A self-driving company brain that learns from team tools and injects knowledge into AI tools. This is the closest existing pitch to "context layer," and it is good. Hyper is company-first. The project layer I am describing is person-first, then team-ready, then agent-ready.

**[Carson](https://www.ycombinator.com/companies/carson).** A desktop AI app that replaces the chat box with custom task workspaces. Same instinct that chat is an input, not an interface. Where Carson generates the workspace per task, the project layer holds the workspace per project, across tasks, across tools, across years.

**[Driver](https://www.ycombinator.com/companies/driver).** A code-scoped version of the same idea. Pre-computed, structured context that humans and agents both read from. If you want to know whether the project-layer thesis is real, look at how fast Driver-shaped products are getting funded for a single vertical (code) and ask what happens when somebody does it for the rest of the work.

None of these are wrong. All of them are evidence that the thesis is correct. The race is on for who owns this floor and at what shape.

## Why this matters more for creative work than vertical AI OS

Vertical AI OS works when the workflow is narrow and regulated. A medspa has a clear loop: lead in, charting, billing, follow-up. The OS can sit on top of that loop and replace four tools and three spreadsheets, and the agents inside it can do real work because the boundaries of the project are obvious.

Creative work is not a workflow. It is a project that spans five tools and lives nowhere.

The novelist with a Substack and a podcast. The YouTuber writing a book that feeds a course that feeds the channel. The course creator with a newsletter and a research backlog and a quarterly launch. These projects don't fit any vertical AI tool because they aren't *vertical.* They are personal, multi-modal, idiosyncratic, and they sprawl.

For them, the absence of a project layer is loud. Their tabs are open. Their AI chats are full of half-explained context. Their thinking moves faster than their tools, and the gap is where everything gets lost.

The vertical OS companies are not wrong to ignore them — there is no clean workflow to operationalize. But that absence is exactly what makes the *horizontal* project layer worth building.

## The moat isn't the agent

If you are an investor and you have read this far, here is the one paragraph that matters.

An agent can clone a workflow in a weekend. The model gets cheaper every quarter. The agent shapes will look familiar inside of a year. None of that is the moat.

The moat in the agent era is the project state the agent has to read before it can do anything useful. The user accumulates that state through every brain dump, every decision, every pivot, every document. It is the part the agent cannot generate, cannot guess, cannot import. It compounds with use.

The model is the cheap part. The project is the moat. And the project layer is the place that moat is supposed to live.

## The one question

If you believe the agent era is real, ask one question.

Where does the project live?

It can't live in each model — they compete and lose state on every chat. It can't live in each tool — they fragment. It can't live in each agent — agents are workers, not desks.

It has to be a neutral, user-owned surface. Either we build that, or someone else does. But it gets built.

That is the floor. That is the lane nobody is racing in. That is the thing I am building.

---

[BuildOS](https://build-os.com) is the project layer for one person and their agents. Talk into it. The project organizes. Your agents read off it. You stay in the work.

[Try BuildOS →](https://build-os.com/auth/register)
