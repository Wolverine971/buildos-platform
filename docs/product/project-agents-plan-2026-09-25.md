<!-- docs/product/project-agents-plan-2026-09-25.md -->

# Project Agents: plan

**Date:** 2026-09-25
**Status:** 9takes steward beta BUILT 2026-09-26 (uncommitted); writes to 9takes and the deploy wait on DJ. Tracker: `tasker/110-project-steward-beta.md`.
**Owner:** DJ
**Background:** `docs/product/day-30-moat-context-compounding-2026-07-07.md` (the context moat), and
`tasker/98-specialist-workflow-step-limits-speed-value.md` (the specialist test that led here).

## Settled 2026-09-26 (DJ, after the review)

- **Name and frame:** project **stewards**. Each is a collaborator inside its project that knows
  everything going on there and keeps the project's story.
- **The ambitious version.**
- **Born by a loop, not created up front.** A project gets a steward the first time it changes. Each
  later change triggers a check: does the steward need refreshing? It's fine for a steward to start
  stale.
- **No self-written code.** A steward gets things done four ways:
    - a **move**: its own tools, as a recipe with a check;
    - a **work order**: a task for Codex, Claude Code, DJ or a client, which DJ releases;
    - a **capability request**: connect an existing service;
    - a **feature request**: triaged in the BuildOS project.
- **9takes is the beta.** DJ approves the steward packet's contents first, then works with it in
  project chat.
- **Handoff style (DJ, 2026-09-26):** the general chat hands off to the project's steward chat when
  the conversation is specifically about that project, and the steward "comes online" knowing
  what's going on. Pick the project before the turn (Jev scores which project a message is about),
  so the steward is loaded for that same turn. Hand back when the topic leaves the project. Not
  yet decided: which comes first after the beta, this handoff or the Codex door.

- **Beta build (2026-09-26):** DJ approved the 9takes packet ("This is what I want") and added the
  goal ask: keep goals, plans, milestones and tasks straight, overview the documents, and notice a
  goal shift ("are we shifting the goals? are these getting deprioritized?"). Built: charter in a
  trusted slot (DJ's approved copy, written only by an approve click), START HERE as narration,
  code-computed Live Facts (goal tree, task counts, changes by who, document map by recency), a
  goal-shift rule, and a header chip to switch steward/standard and approve charter edits. Details,
  checks and the drafts: `tasker/110-project-steward-beta.md`.
- **Adversarial review (2026-09-27):** two fresh-context reviews, all findings verified before
  fixing. Approve is now a review sheet pinned to the exact text's hash; approve/toggle no longer
  write a project log row (it woke paid audits) and a profile-table trigger invalidates instead; the
  goal tree reads both edge directions; the stale saved next step and construction-shaped contract
  are gone from the steward prompt; goal tools stay mounted on steward turns. Real 9takes prompt
  24.3K → 22.1K chars. Details: tasker 110, "Adversarial review".

Proposed composition, awaiting DJ's markup:

- **Charter:** purpose, rules with their sources, moves, and where the work happens. DJ approves it,
  and it goes in a trusted prompt slot.
- **Narration:** START HERE's story sections, kept by the steward.
- **Live facts:** computed by code when the chat opens.
- **Reach:** Jev recall and tools.

The 9takes packet comes to about 4.7K characters (about 1.2K tokens). It replaces the generic
identity, the START HERE excerpt and the knowledge map. Design page:
https://claude.ai/artifact/8dsgfxPw8LU2ufUPXQfhpg. Review page:
https://claude.ai/artifact/HKMtwT2hoqqmhNP8kqWYct.

These corrections supersede figures below:

- The payload cap is 78,600 characters.
- The prompt labels START HERE "untrusted".
- A handoff applies on the next turn.
- 47% of recent project writes come from Codex through the connector.

## The idea, in DJ's words

> "Instead of having prebuilt specialists, prebuilt agents, how about I dynamically create the agents
> that are perfect, accustomed, and ready to deal with each project? When I start a project, I'm also
> starting to create an agent that is an expert in that project."

> "In the global chat, we are talking to the orchestrator agent, and it can do the same queries and
> everything as it does now. However, it can pass off control to the 9takes agent… The 9takes agent
> should take control of the chat because you're talking about 9takes."

> "They're kind of like the START HERE document on steroids… they know where everything is, always
> recently talked about what's coming up… Clients eventually should talk to their own project agent."

## The model

- **Orchestrator (global chat).** It works as it does today: cross-project queries, search, and
  anything that isn't one project's business. When the conversation is about one project, it hands
  control to that project's agent. When the conversation leaves that project, control comes back.
- **Project agent.** There is one per project, created with the project. It is the expert on that
  project. It takes over the chat while you talk about its project, and it gets better as the
  project accumulates context.
- **Handoff.** Control moves from one agent to another, and the conversation stays one thread. The
  screen shows who is talking.
- **Later:** clients talk to their own project's agent, and outside agents (Claude or Codex through
  the BuildOS connector) ask project agents instead of reading raw records.

Prebuilt specialists stop being agents. Their know-how becomes expertise that a project agent draws
on because its project needs it.

## What a project agent knows ("START HERE on steroids")

| Layer                                        | What it gives the agent                                                                                                                | Built from (today)                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Where everything is**                      | The project map: documents, goals, plans, tasks, and where each topic lives                                                            | START HERE map, the document tree, Jev's context finder                                                        |
| **What happened recently**                   | What changed, what was decided, and the gist of recent conversations                                                                   | Checkpoint capture (Thinking Log, START HERE current state), the change ledger (`onto_project_logs`), `/today` |
| **What's coming up**                         | Due tasks, events, milestones, things going stale                                                                                      | Tasks and calendar, the freshness radar                                                                        |
| **What the project needs to know how to do** | Expertise assembled for this project, e.g. Grace: Florida school registration, scholarships, donors; 9takes: growth for a consumer app | The 53 chat skills, chosen per project; a domain primer researched with sources                                |
| **How you like it done**                     | Rules, voice, and preferences learned from your corrections and decisions                                                              | New: the agent brief                                                                                           |
| **Who it is**                                | A name, a one-line purpose, what it is accountable for                                                                                 | New: the agent brief                                                                                           |

**The agent brief** is the one genuinely new artifact. It is a readable, editable document
beside START HERE. BuildOS writes it when the project is created and capture keeps it current. It
holds the expertise, the rules, the voice and the preferences. START HERE stays the project's
orientation; the brief is how the agent works on it.

## How the handoff works

1. **Trigger.** Handoff happens in one of three ways:
    - The orchestrator decides with a structured tool call: hand off to project X, with a reason and
      a handoff note.
    - You pick the project explicitly, with an @-mention or the project picker.
    - You open a project chat, which means you're already talking to that project's agent.

    Never with keyword matching, per the repo rule in `AGENTS.md`.

2. **Switch.** The plumbing exists. A tool result carrying `context_shift` persists a session
   handoff (`persistSessionHandoff` in `apps/worker/src/workers/agentic-chat/turn/turn-run-services.ts`).
   The web chat then moves its focus (`apps/web/src/lib/components/agent/agent-chat-sse-handler.ts`),
   and the next turn runs in the project's context. Today only project creation and task moves use it.
3. **What carries over.** The handoff note (what you want and the relevant part of the
   conversation so far). The thread stays visible.
4. **Hand back.** The project agent returns control when the topic leaves its project or when you
   say so. Early on, moves between projects go through the orchestrator (9takes agent → orchestrator
   → Samos agent).
5. **On screen.** The header names the agent speaking ("9takes"). A divider in the thread records
   each handoff and its reason, and one click returns to global chat.

**Side benefit.** Today, talking about 9takes in global chat never reaches 9takes's memory, because
only project chats are captured. With handoff, those turns become project turns, so capture records
them in the project.

## What changes vs today

| Today                                                                                       | With project agents                                                                                   |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Global chat answers 9takes questions by calling tools. Nothing it learns is saved to 9takes | It hands off. The 9takes agent answers from full memory, and the conversation is captured into 9takes |
| Project chat reloads START HERE each session and speaks as a generic assistant              | The same chat speaks as that project's expert: brief, expertise, rules, what's coming up              |
| Workflow Lab specialists are a read-only review committee (0 of 4 in DJ's blind test)       | Retired as agents; their know-how becomes expertise that project agents draw on                       |
| Outside agents get raw read/write tools                                                     | Later: "ask the 9takes agent" through the connector                                                   |
| Clients see nothing                                                                         | Later: clients talk to their own project agent on a scoped page                                       |

## Why this is ours

- **Projects are BuildOS's native unit,** and the moat doc already names the per-project graph plus
  its change ledger as the thing that compounds. A project agent is that moat made talkable.
- **It changes what BuildOS is to outside agents.** The moat review's worry was that BuildOS becomes
  a database behind someone else's agent. Here it becomes an expert behind their agent, which is
  worth more and runs cheaply.
- **It is the service demo.** Every client engagement is a project, so every client gets an agent
  that knows them. "Here's your project's agent, ask it anything" is easy to show and easy to say
  yes to.
- **Nobody else offers this, as far as research found.** Lab "Projects" are containers you chat
  inside, not agents that other chats hand control to.

## Reuse map

| Need                              | Exists                                            | Where                                                                      |
| --------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| Switch a live chat into a project | `context_shift` → session handoff → web focus     | `turn-run-services.ts`, `read-tool-runner.ts`, `agent-chat-sse-handler.ts` |
| Project map and current state     | START HERE with managed regions; context snapshot | `packages/shared-agent-ops/src/ontology/start-here.ts`                     |
| Memory of conversations           | Checkpoint capture, Thinking Log                  | `apps/worker/src/workers/chat/checkpoint/checkpointCapture.ts`             |
| What changed                      | Change ledger, `/today`                           | `onto_project_logs`                                                        |
| Finding things in a project       | Jev context finder                                | `docs/architecture/CONTEXT_FINDER_2026-09-22.md`                           |
| Expertise                         | 53 chat skills                                    | `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/`         |
| What's going stale                | Freshness radar                                   | tracker 106                                                                |
| Project chat prompt               | Lite prompt's project branch                      | `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`  |
| Outside access                    | MCP connector with per-project scopes             | `docs/architecture/EXTERNAL_AGENT_PROJECT_ACCESS.md`                       |

## What's missing

1. **The agent brief:** generated when a project is created, refreshed by capture, editable by DJ.
2. **Project-agent identity in project chat:** the brief, the chosen expertise and what's coming up,
   replacing generic prompt text rather than adding to it.
3. **Handoff and hand-back tools** for the orchestrator, plus the on-screen treatment.
4. **Expertise assembly:** Jev picks skills per project; a domain primer researched with sources,
   never invented.
5. **Capture routing:** once a global chat hands off, its turns are captured into the project.
6. **Later:** client access (permissions, what the agent may reveal, DJ's approval), an "ask project
   agent" connector tool, and scheduled check-ins if they prove useful.

## Phases (each needs DJ's go)

- **Phase 0: prove the brief.** Generate agent briefs for 9takes and the book from their current
  state, as documents DJ reads. The test is DJ's judgment: does it read like an expert who knows the
  project? It is reversible and uses a few cheap model calls, which are paid, so it needs approval.
- **Phase 1: project agent in project chat.** Project chat loads the brief and speaks as the
  project's agent. Test it on DJ's real re-entry questions ("where are we", "what's next", "what did
  we decide about X") against today's project chat.
- **Phase 2: handoff from global chat.** The orchestrator hands off and back, and captured turns
  route to the project. Test it on conversations that move between global and project topics.
- **Phase 3: clients talk to their project agent,** Beyond Exit first. A scoped page, permissions,
  limits on what it may say, and DJ in the loop.
- **Phase 4: outside agents and schedules.** Outside agents ask project agents over the connector,
  and scheduled check-ins are added only if Phases 1–3 show a need.

## How we'll know it works

Test what a project agent should win, not lookups. The 2026-09-23 blind test showed that an extra
agent answering a lookup adds nothing.

- **Re-entry.** "Pick 9takes back up." Does it know what's recent, what's next, and what's stalled?
- **Decisions and preferences across sessions.** "What did we decide about the IG series?"
- **Handoff correctness.** The right project at the right moment, no ping-pong, and it hands back
  when the topic moves on.
- **Capture.** After a global conversation about 9takes, does 9takes's memory reflect it?
- **DJ's blind read.** The project agent against today's project chat on the same questions.
- **Speed and cost** per turn on the cheap model.

## Decisions for DJ

1. **Recent conversations.** The agent would know the gist through capture (distilled notes), not
   by replaying old chats. DJ said on 2026-09-23 he doesn't want old chats auto-loaded. Is the
   distilled version what "always knows what we recently talked about" means?
2. **Handoff style.** Does the orchestrator hand off automatically when it's confident, or ask
   first ("Want me to bring in the 9takes agent?")?
3. **Identity.** Is each agent named after its project ("9takes") with its own voice, or a generic
   "project agent"?
4. **Brief location.** A separate document beside START HERE (proposed), or a section inside START
   HERE.
5. **Workflow Lab specialists.** Retire them, or keep them as expertise packs.

## Landmines

- Every Agentic Chat change set needs the paid `pnpm agentic:gate`, and DJ approves each run.
- The chat prompt's payload cap is binding (76,588 of 76,600 characters). Brief content must replace
  generic text, not add to it.
- Handoff is decided by a tool call or an explicit UI action. It is never decided by keyword matching.
- Other sessions are working in the same places:
    - chat: trackers 96, 97, and 99–109;
    - START HERE and capture: trackers 93, 95, 96;
    - the book project: the book loop.

    Coordinate, and commit with explicit pathspecs.

- Placement in the prompt decides whether a rule takes effect on DeepSeek V4.1 Flash (tracker 97
  lesson). Test the handoff rules where they will actually sit.
- Client-facing agents expose data. They need a permission model and a security review before any
  client sees one.
