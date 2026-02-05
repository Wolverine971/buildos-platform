<!-- design/blog-gas-town.md -->

https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04

# Welcome to Gas Town

**Steve Yegge**
January 1, 2026

Happy New Year, and Welcome to Gas Town!

## What the Heck is Gas Town?

Gas Town is a new take on the IDE for 2026. Gas Town helps you with the tedium of running lots of Claude Code instances. Stuff gets lost, it's hard to track who's doing what, etc. Gas Town helps with all that yak shaving, and lets you focus on what your Claude Codes are working on.

For this blog post, "Claude Code" means "Claude Code and all its identical-looking competitors", i.e. Codex, Gemini CLI, Amp, Amazon Q-developer CLI, blah blah, because that's what they are. Clones. The industry is an embarrassing little kid's soccer team chasing the 2025 CLI form factor of Claude Code, rather than building what's next.

I went ahead and built what's next. First I predicted it, back in March, in Revenge of the Junior Developer. I predicted someone would lash the Claude Code camels together into chariots, and that is exactly what I've done with Gas Town. I've tamed them to where you can use 20–30 at once, productively, on a sustained basis.

Gas Town is opinionated — much like Kubernetes, or Temporal, both of which Gas Town resembles, at least if you squint at it until your eyes are pretty much totally shut. I'll include comparisons to both k8s and Temporal at the end of this post. It is a little surprising how similar they are, despite having radically different underpinnings.

But the comparison should serve as a warning: Gas Town is complicated. Not because I wanted it to be, but because I had to keep adding components until it was a self-sustaining machine. And the parts that it now has, well, they look a lot like Kubernetes mated with Temporal and they had a very ugly baby together.

But it works! Gas Town solves the MAKER problem (20-disc Hanoi towers) trivially with a million-step wisp you can generate from a formula. I ran the 10-disc one last night for fun in a few minutes, just to prove a thousand steps was no issue (MAKER paper says LLMs fail after a few hundred). The 20-disc wisp would take about 30 hours.

## Gas Town Was No Secret

After Revenge of the Junior Developer, I traveled around all year, loudly telling everyone exactly what needed to be built, and I mean everyone. I was not shy about it. I would declare, "Orchestrators are next!" And everyone would nod slowly and frown thoughtfully and say, "huh."

I went to senior folks at companies like Temporal and Anthropic, telling them they should build an agent orchestrator, that Claude Code is just a building block, and it's going to be all about AI workflows and "Kubernetes for agents". I went up onstage at multiple events and described my vision for the orchestrator. I went everywhere, to everyone.

"It will be like kubernetes, but for agents," I said.

"It will have to have multiple levels of agents supervising other agents," I said.

"It will have a Merge Queue," I said.

"It will orchestrate workflows," I said.

"It will have plugins and quality gates," I said.

I said lots of things about it, for months. But hell, we couldn't even get people to use Claude Code, let alone think about using 10 to 20 of them at once.

So in August I started building my own orchestrator, since nobody else seemed to care. Eventually it failed, and I threw it out and started over on v2, which also failed, but we got Beads out of it. Then v3 (Python Gas Town), which lasted a good six or eight weeks.

Gas Town (in Go) is my fourth complete, functioning orchestrator of 2025. The story of how I arrived at Gas Town is fun, but we'll save it for another time.

## WARNING: Who Should NOT Use Gas Town

Let's talk about some of the reasons you shouldn't use Gas Town.

First of all, the code base is under 3 weeks old. It's also 100% vibe coded. I've never seen the code, and I never care to, which might give you pause.

Second, you are really, seriously, not ready yet. Consider the Evolution of the Programmer in 2024–2026:

**The 8 Stages of Dev Evolution to AI:**

1. **Stage 1:** Zero or Near-Zero AI — maybe code completions, sometimes ask Chat questions
2. **Stage 2:** Coding agent in IDE, permissions turned on — a narrow coding agent in a sidebar asks your permission to run tools
3. **Stage 3:** Agent in IDE, YOLO mode — trust goes up, you turn off permissions, agent gets wider
4. **Stage 4:** In IDE, wide agent — your agent gradually grows to fill the screen, code is just for diffs
5. **Stage 5:** CLI, single agent, YOLO — diffs scroll by, you may or may not look at them
6. **Stage 6:** CLI, multi-agent, YOLO — you regularly use 3 to 5 parallel instances, you are very fast
7. **Stage 7:** 10+ agents, hand-managed — you are starting to push the limits of hand-management
8. **Stage 8:** Building your own orchestrator — you are on the frontier, automating your workflow

If you're not at least Stage 7, or maybe Stage 6 and very brave, then you will not be able to use Gas Town. You aren't ready yet.

## The Nature of Vibe Coding in Gas Town

Working effectively in Gas Town involves committing to vibe coding. Work becomes fluid, an uncountable substance that you sling around freely, like slopping shiny fish into wooden barrels at the docks. Most work gets done; some work gets lost. Fish fall out of the barrel. Some escape back to sea, or get stepped on. More fish will come. The focus is throughput: creation and correction at the speed of thought.

Work in Gas Town can be chaotic and sloppy, which is how it got its name. Some bugs get fixed 2 or 3 times, and someone has to pick the winner. Other fixes get lost. Designs go missing and need to be redone. It doesn't matter, because you are churning forward relentlessly on huge, huge piles of work, which Gas Town is both generating and consuming.

**In Gas Town, you let Claude Code do its thing. You are a Product Manager, and Gas Town is an Idea Compiler.** You just make up features, design them, file the implementation plans, and then sling the work around to your polecats and crew. Opus 4.5 can handle any reasonably sized task, so your job is to make tasks for it. That's it.

## Gas Town 101: The Worker Roles

Gas Town workers are regular coding agents, each prompted to play one of seven well-defined worker roles.

**Key Concepts:**

### 🏙️ The Town

This is your HQ. The town (Go binary `gt`) manages and orchestrates all the workers across all your rigs. You keep it in a separate repo, mostly for the configuration.

### 🏗️ Rigs

Each project (git repo) you put under Gas Town management is called a Rig. Some roles (Witness, Polecats, Refinery, Crew) are per-rig, while others (Mayor, Deacon, Dogs) are town-level roles.

### 👤 The Overseer (You)

The eighth role. As the Overseer, you have an identity in the system, and your own inbox, and you can send and receive town mail. You're the boss.

### 🎩 The Mayor

This is the main agent you talk to most of the time. It's your concierge and chief-of-staff. The Mayor typically kicks off most of your work convoys, and receives notifications when they finish.

### 😺 Polecats

Ephemeral per-rig workers that spin up on demand. Polecats work, often in swarms, to produce Merge Requests (MRs), then hand them off to the Merge Queue (MQ). After the merge they are fully decommissioned, though their names are recycled.

### 🏭 Refinery

As soon as you start swarming workers, you run into the Merge Queue (MQ) problem. Your workers get into a monkey knife fight over rebasing/merging. The Refinery is the engineer agent responsible for intelligently merging all changes, one at a time, to main. No work can be lost, though it is allowed to escalate.

### 🦉 The Witness

Once you spin up enough polecats, you realize you need an agent just to watch over them and help them get un-stuck. The Witness patrol helps smooth this out so it's almost perfect for most runs.

### 🐺 The Deacon

The deacon is the daemon beacon. It runs a "patrol" (a well-defined workflow) in a loop. Gas Town has a daemon that pings the Deacon every couple minutes and says, "Do your job." The Deacon intelligently propagates this DYFJ signal downward to the other town workers, ensuring Gas Town stays working.

### 🐶 Dogs

The Deacon's personal crew. Unlike polecats, Dogs are town-level workers. They do maintenance (cleaning up stale branches, etc.) and occasional handyman work for the Deacon.

### 🐕 Boot the Dog

A special Dog awakened every 5 minutes by the daemon, just to check on the Deacon. Boot decides if the Deacon needs a heartbeat, a nudge, a restart, or simply to be left alone.

### 👷 The Crew

Per-Rig coding agents who work for the Overseer (you), and are not managed by the Witness. You choose their names and they have long-lived identities. The crew are great for stuff like design work, where there is a lot of back-and-forth.

## Mail and Messaging

Beads are the atomic unit of work in Gas Town. A bead is a special kind of issue-tracker issue, with an ID, description, status, assignee, and so on. Beads are stored in JSON (one issue per line) and tracked in Git along with your project repo.

Gas Town has a two-level Beads structure:

- **Rig-level work:** Project work — features, bug fixes, etc. Split between polecats and crew.
- **Town-level work:** Orchestration, including patrols and one-shot workflows like releases.

## Gastown Universal Propulsion Principle (GUPP)

GUPP is what keeps Gas Town moving. The biggest problem with Claude Code is it ends. The context window fills up, and it runs out of steam, and stops. GUPP is my solution to this problem.

**GUPP states, simply: If there is work on your hook, YOU MUST RUN IT.**

All Gas Town workers have persistent identities in Beads, which means in Git. A worker's identity type is represented by a Role Bead (like a domain table describing the role). And each worker has an Agent Bead (the agent's persistent identity).

**In Gas Town, an agent is not a session.** Sessions are ephemeral; they are the "cattle" in the Kubernetes "pets vs cattle" metaphor. Claude Code sessions are the cattle that Gas Town throws at persistent work. That work all lives in Beads, along with the persistent identities of the workers, and the mail, the event system, and even the ephemeral orchestration.

**What is a Hook?** Every Gas Town worker has its own hook 🪝. It's a special pinned bead, just for that agent, and it's where you hang molecules, which are Gas Town workflows.

### The GUPP Nudge

Gas Town workers are prompted to follow "physics over politeness," and are told to look at their hook on startup. If their hook has work, they must start working on it without waiting.

Unfortunately, in practice, Claude Code often waits until you type something — anything — before it checks its mail and hook, reports in, and begins working. So we have a workaround: agents get a startup poke with `gt nudge`.

## Talking to Dead Ancestors: `gt seance`

The GUPP Nudge led to an interesting feature, `gt seance`, which allows Gas Town workers to communicate directly with their predecessors in their role. The current Mayor can talk to the last Mayor, and so on. They do this with the help of Claude Code's `/resume` feature, which lets you restart old sessions that you killed.

With `gt seance`, the worker will literally spin Claude Code up in a subprocess, use `/resume` to revive its predecessor, and ask it, "Where the hell is my stuff you left for me?"

## Molecular Expression of Work (MEOW)

Gas Town is the tip of a deep iceberg. The MEOW stack may live on for several years to come.

### Evolution of the MEOW Stack:

1. **Beads** — Basic work units, like issues in an issue tracker, stored in Git
2. **Epics** — Beads with children, which could in turn be epics themselves. Children are parallel by default, with explicit dependencies to force sequencing.
3. **Molecules** — Workflows, chained with Beads. Unlike epics, they can have arbitrary shapes and can be stitched together at runtime.
4. **Protomolecules** — Templates made of actual Beads, with all the instructions and dependencies set up in advance, which you instantiate into a molecule.
5. **Formulas** — Source form for workflows in TOML format, which are "cooked" into protomolecules and then instantiated into wisps or mols in the Beads database.
6. **Guzzoline** — The term for the big sea of work molecules, all the work in the world.

### Why Molecules Matter

Because AIs are really good at following TODO lists and acceptance criteria, they are reliable at following molecules. They understand that the bureaucracy of checking off issues updates a live activity feed and puts the work on a permanent ledger.

This means **molecular workflows are durable**:

- The agent is persistent: a Bead backed by Git
- The hook is persistent, also a Bead backed by Git
- The molecule is persistent — a chain of Beads, also in Git

So it doesn't matter if Claude Code crashes, or runs out of context. As soon as another session starts up for this agent role, it will start working on that step in the molecule immediately.

## Nondeterministic Idempotence (NDI)

Gas Town operates on Nondeterministic Idempotence. It is similar to Temporal's deterministic, durable replay, but Gas Town achieves its durability and guaranteed execution through completely different machinery.

Even though the path is fully nondeterministic, the outcome — the workflow you wanted to run — eventually finishes, "guaranteed", as long as you keep throwing agents at it. The agent may even make mistakes along the way, but can self-correct, because the molecule's acceptance criteria are presumably well-specified.

## Wisps: Ephemeral Orchestration Beads

Wisps are ephemeral Beads. They are in the database and get hash IDs, but they are not written to the JSONL file and thus not persisted to Git. At the end of their run, Wisps are "burned" (destroyed). Optionally they can be squashed into a single-line summary/digest that's committed to git.

Wisps are important for high-velocity orchestration workflows. All the patrol agents create wisp molecules for every single patrol or workflow run, ensuring workflows complete transactionally without polluting Git with orchestration noise.

## Patrols

Patrols are ephemeral workflows that run for Patrol Workers (Refinery, Witness, Deacon).

A patrol is an ephemeral (wisp) workflow that the agent runs in a loop. Patrols have exponential backoff: the agent will gradually go to sleep if it finds no work, by waiting longer and longer to start the next patrol.

## Convoys 🚚

Everything in Gas Town, all work, rolls up into a Convoy.

The Convoy is Gas Town's ticketing or work-order system. A Convoy is a special bead that wraps a bunch of work into a unit that you track for delivery.

**How it works:**

- You tell the Mayor to "file it and sling it"
- The Mayor files a bead for the problem, then `gt sling` it to a polecat
- The polecat works on it immediately
- When the Convoy lands/finishes, you're notified

Convoys are basically features. Whether tech debt cleanup, actual feature, or bug fix, each convoy is a ticketing unit of Gas Town's work-order architecture.

## Gas Town Workflow

The most fundamental workflow in Gas Town is the handoff, `gt handoff`. Your worker will optionally send itself work, then restart its session for you, right there in tmux. All workers require you to let them know it's time to hand off.

The Gas Town dev loop is the same as with Claude Code (and Beads), just more of it. You get swarms for free (they only cost money), decent dashboards, a way to describe workflows, and mail and messaging.

### Essential tmux Commands:

- `C-b s` — list sessions, snoop them, switch to one
- `C-b b` — move cursor backwards
- `C-b [` — enter "copy mode", which pauses output and lets you scroll (ESC exits)
- `C-b C-z C-z` — suspend process out to the shell
- `C-b n/p` — cycle to next worker in the group
- `C-b a` — brings up the activity feed view

## Planning in Gas Town

Gas Town needs a lot of fuel. It both consumes and produces guzzoline. Aside from keeping Gas Town on the rails, probably the hardest problem is keeping it fed. It churns through implementation plans so quickly that you have to do a LOT of design and planning to keep the engine fed.

On the consumption side, you feed Gas Town epics, issues, and molecules. It chews through them, spawning 12 to 30 workers, and you can burn through enormous work backlogs in a single sitting.

On the production side, you can use your own planning tool (like Spec Kit or BMAD), then convert plans into Beads epics. If the plan is large enough, you may want to swarm it.

### The Rule of Five Formula

I implemented a formula for Jeffrey Emanuel's "Rule of Five" — the observation that if you make an LLM review something five times, with different focus areas each time, it generates superior outcomes. You can take any workflow, cook it with the Rule of Five, and it will make each step get reviewed 4 times.

## Comparison to Kubernetes

Gas Town does maybe look a bit like Kubernetes, unintentionally. Both systems coordinate unreliable workers toward a goal. Both have a control plane watching over execution nodes, each with a local agent monitoring ephemeral workers. Both use a source of truth that the whole system reconciles against.

**The big difference:** Kubernetes asks "Is it running?" while Gas Town asks "Is it done?"

- K8s optimizes for uptime — keep N replicas alive, maintain the desired state forever
- Gas Town optimizes for completion — finish this work, land the convoy, then nuke the worker and move on
- K8s pods are anonymous cattle; Gas Town polecats are credited workers whose completions accumulate
- K8s reconciles toward a continuous desired state; Gas Town proceeds toward a terminal goal

## What Shipped vs. What Didn't

**What didn't make the cut:**

- Federation — remote workers on hyperscalers
- GUI — no Emacs UI or web UI yet
- Plugins — infrastructure in place, but no functionality implemented yet
- The Mol Mall — marketplace for molecules
- Million-step MAKER/Hanoi demonstration

**What did ship:**

- Self-handoffs work seamlessly
- Slinging works, convoys work
- The whole MEOW stack works
- Deacon, Witness and Refinery patrols all run automatically
- The Crew are great
- The tmux UI works surprisingly well

17 days, 75k lines of code, 2000 commits. It finally got off the ground just 2 days ago.

## Golden Rules

1. Do not use Gas Town if you do not juggle at least five Claude Codes at once, daily.
2. Do not use Gas Town if you care about money.
3. Do not use Gas Town.

---

## BuildOS Insights & Takeaways

### Core Thesis

**The future of productivity tools is orchestration, not automation.** When you can throw unlimited AI workers at a problem, the bottleneck shifts from execution to planning, design, and keeping the system fed with clear work.

> "You are a Product Manager, and Gas Town is an Idea Compiler. You just make up features, design them, file the implementation plans, and then sling the work around."

### Why This Matters for BuildOS

Gas Town is a glimpse of the future — and it reveals what humans will still need to do:

1. **Define what needs to be built** (clarity of intention)
2. **Break work into manageable chunks** (decomposition)
3. **Keep the system fed with work** (continuous planning)
4. **Handle edge cases and stuck states** (human judgment)

BuildOS serves the same function for personal productivity that Gas Town serves for code: helping users become the "Product Manager" of their own lives.

### Key Insights for BuildOS

#### 1. Persistent Identity vs. Ephemeral Sessions

> "In Gas Town, an agent is not a session. Sessions are ephemeral; they are the 'cattle' in the Kubernetes 'pets vs cattle' metaphor."

**BuildOS implication:** Users have persistent identities, goals, and projects. Each agentic chat session is ephemeral. BuildOS must bridge this gap — the system must remember who the user is and what they're working toward, even as individual sessions come and go.

#### 2. The GUPP Principle: Always Have Something to Work On

> "GUPP states, simply: If there is work on your hook, YOU MUST RUN IT."

**BuildOS implication:** Users need a "hook" — a clear next action or focus area. When they check in, there should always be something ready for them. The Daily Brief, active projects, and next actions serve this purpose.

#### 3. Vibe Coding = Throughput Over Perfection

> "Work becomes fluid, an uncountable substance that you sling around freely... Most work gets done; some work gets lost... It doesn't matter, because you are churning forward relentlessly."

**BuildOS implication:** For users who are stuck, sometimes the answer is just to MOVE. Don't optimize the task list — just pick something and do it. BuildOS could embrace this "throughput over perfection" mindset for users who need momentum more than precision.

#### 4. Hierarchical Supervision

> "The Witness patrol helps smooth this out... The Deacon intelligently propagates this DYFJ signal downward to the other town workers, ensuring Gas Town stays working."

**BuildOS implication:** BuildOS needs multiple "levels" of attention:

- **Daily level:** What's happening today?
- **Weekly level:** Are projects on track?
- **Monthly level:** Are goals still aligned?

Each level "supervises" the level below, ensuring nothing falls through the cracks.

#### 5. The Merge Queue Problem

> "As soon as you start swarming workers, you run into the Merge Queue (MQ) problem. Your workers get into a monkey knife fight over rebasing/merging."

**BuildOS implication:** When users have multiple projects and contexts, they experience the same "merge" problem — competing priorities, conflicting commitments, limited time. BuildOS needs a "Refinery" concept: a way to intelligently sequence and integrate all the user's work into their limited time.

#### 6. Molecules: Durable Workflows

> "Molecular workflows are durable. If a molecule is on an agent's hook, then the agent is persistent, the hook is persistent, the molecule is persistent."

**BuildOS implication:** User workflows (routines, recurring tasks, project phases) should be "durable" — they survive context switches, forgotten sessions, and life interruptions. When the user returns, they should be able to pick up exactly where they left off.

#### 7. The Nudge Problem

> "Unfortunately, in practice, Claude Code often waits until you type something — anything — before it checks its mail and hook, reports in, and begins working."

**BuildOS implication:** Users often need a nudge to get started. BuildOS should proactively reach out (Daily Brief, check-in prompts, notifications) rather than waiting passively for the user to initiate.

#### 8. Talking to Dead Ancestors (Context Recovery)

> "`gt seance` allows Gas Town workers to communicate directly with their predecessors in their role."

**BuildOS implication:** When users return after being away, they've "lost" the context from their previous session. BuildOS should make it easy to "seance" — to quickly understand what past-self was thinking, what was left incomplete, and what decisions were made.

### The 8 Stages — Applied to Personal Productivity

Yegge's 8 stages can be translated to personal productivity tool adoption:

1. **Stage 1:** Paper and memory — no system
2. **Stage 2:** Basic todo app — single list, manual everything
3. **Stage 3:** Task manager with reminders — some automation
4. **Stage 4:** Project-based organization — contexts and hierarchies
5. **Stage 5:** AI-assisted task capture — brain dumps, voice input
6. **Stage 6:** AI-assisted planning — suggestions and prioritization
7. **Stage 7:** Multiple AI tools coordinated manually — calendar + tasks + notes
8. **Stage 8:** Orchestrated productivity system — BuildOS

BuildOS is Stage 8: an orchestrator that coordinates all aspects of personal productivity into a unified, agentic system.

### Key Quotes for BuildOS

> "Gas Town churns through implementation plans so quickly that you have to do a LOT of design and planning to keep the engine fed."

> "You let Claude Code do its thing. You are a Product Manager, and Gas Town is an Idea Compiler."

> "So it doesn't matter if Claude Code crashes, or runs out of context. As soon as another session starts up for this agent role, it will start working on that step in the molecule immediately."

> "Kubernetes asks 'Is it running?' while Gas Town asks 'Is it done?'"

> "The focus is throughput: creation and correction at the speed of thought."

### Architectural Patterns for BuildOS

| Gas Town Concept | BuildOS Equivalent                              |
| ---------------- | ----------------------------------------------- |
| Mayor            | Agentic Chat (user's primary interface)         |
| Polecats         | Task execution (ephemeral focus sessions)       |
| Refinery         | Prioritization engine (merge competing demands) |
| Witness          | Check-in system (are projects on track?)        |
| Deacon           | Recurring routines (Daily Brief, weekly review) |
| Beads            | Projects, tasks, notes (atomic work units)      |
| Molecules        | Workflows (multi-step routines and processes)   |
| GUPP             | Always have a clear next action                 |
| Convoys          | Goals (units of tracked progress)               |
| Hook             | Current focus (what am I working on right now?) |

### Summary: Yegge's Principles for BuildOS

1. **Be the orchestrator, not the executor** — help users manage many streams of work at once
2. **Persistent identity, ephemeral sessions** — the user's context survives individual interactions
3. **Always have work ready** — users should never wonder "what should I do?"
4. **Throughput over perfection** — sometimes moving forward matters more than optimizing
5. **Hierarchical supervision** — multiple levels of attention (daily, weekly, monthly)
6. **Durable workflows** — routines and projects survive interruption
7. **Proactive nudging** — don't wait for users to initiate
8. **Easy context recovery** — help users understand where they left off
9. **The goal is "done," not "running"** — focus on completion, not just activity
10. **Swarm when needed** — some problems benefit from parallel attention
