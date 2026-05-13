---
date: 2026-05-13
topic: cross-agent-context-layer
status: brainstorm — design + phasing
companion_to:
    - docs/brainstorms/2026-05-11-buildos-agent-feed-brainstorm.md
    - docs/brainstorms/2026-05-12-buildos-feed-10x-vision.md
related:
    - /Users/djwayne/.claude/projects/-Users-djwayne-buildos-platform/memory/project_connect_your_agents_promo.md
    - /Users/djwayne/.claude/projects/-Users-djwayne-buildos-platform/memory/reference_buildos_agent_api.md
path: docs/brainstorms/2026-05-13-cross-agent-context-layer.md
---

# BuildOS Cross-Agent Context Layer

## The Idea in One Paragraph

BuildOS already stores the operational reality of one person's life: brain dumps, projects, decisions, voice samples, past patterns. The **cross-agent context layer** is the surface that lets _other agents_ — Cursor, Claude.ai, ChatGPT, custom agents — read that reality as context, and write back into it when they're done. It is the operational, working-product version of the "Connect Your Agents" positioning. BuildOS becomes the shared context surface every agent in DJ's life plugs into.

The right metaphor is a **librarian**. A librarian's value isn't the books — it's the services around them: catalog, retrieve, recommend, curate, preserve, interlibrary-loan, reference desk. The context layer provides those services for agents.

---

## The Two Personas, Clarified

The 10x vision named **Briefer** — the synthesis agent that writes the morning memo for DJ. The context layer needs a second persona, **Librarian** — the agent that mediates context queries from other agents. Same underlying memory. Different output discipline.

| Briefer                                        | Librarian                                |
| ---------------------------------------------- | ---------------------------------------- |
| Writes _for DJ_                                | Serves _other agents_                    |
| Opinionated. Recommends. Pushes back.          | Faithful. Citation-heavy. No opinions.   |
| Output: morning memo, feed cards, weekly retro | Output: briefings, voice exports, recall |
| Editor-in-chief                                | Reference desk                           |
| Has personality, voice, name                   | Quieter; serves the asker's task         |

Both read from the same store. Briefer is the principal's voice; Librarian is the institution's.

---

## What the Layer Concretely Does

Eight capabilities. Each is a real scenario, not an abstract feature.

### 1. Project briefing

An agent asks: _"What is DJ working on in the Payments project?"_

Librarian returns a briefed paragraph (not raw data): stated goal, current state, recent decisions, open threads, blockers, voice notes from DJ on this project, related past decisions. Target length: 300–800 tokens. Includes citations to the source cards / brain dumps so the agent can drill in if needed.

> **Scenario.** DJ opens Cursor at 10am. Cursor pings the Librarian via MCP, loads the engineering project briefing as system prompt. No "let me get you up to speed." The session begins with full context.

### 2. Voice / style export

An agent asks: _"How does DJ write LinkedIn posts?"_

Librarian returns: voice guide + 5 recent best examples + taboos + idioms + hook patterns + don't-repeat list. Surface-specific (LinkedIn voice ≠ blog voice ≠ Reddit voice).

> **Scenario.** Claude.ai is drafting a LinkedIn post. Before drafting, it queries `buildos://voice/linkedin`. The draft comes out fitting DJ's actual voice — without DJ teaching it from scratch every session.

This is the **highest-frequency query in the whole system**. Optimize for it.

### 3. Belief / prior export

An agent asks: _"What does DJ believe about pricing?"_

Librarian returns relevant past brain dumps + decisions where the topic came up, with citations. Prevents agents from contradicting positions DJ has already taken — which is one of the most expensive failure modes in agent work today.

### 4. Memory recall

Semantic query across history: _"Has DJ thought about [topic]?"_

Librarian returns synthesized answer with provenance: relevant cards, brain dumps, decisions. Your past selves become consultants in real time, accessible to any agent.

### 5. Coordination check

Agent about to act: _"Is another agent already on this?"_

Returns active claims and recent agent activity. Prevents two agents from drafting the same post or both editing the same file. Cheap to implement, prevents real problems.

### 6. Session handoff write-back

Every agent session ends with a card posted back: _"I worked on X. Here's the artifact. Here are open threads I left for the next session."_

Becomes input to tomorrow's brief. **This is the close-the-loop direction.** Without write-back, the layer is read-only and the feed doesn't compound. With it, every agent session adds to BuildOS's operational memory automatically.

### 7. Pattern injection

Proactive (Librarian initiates, not just responds): _"Last time you ran a launch, you decided X. Same call this time?"_

Librarian surfaces relevant past patterns when an agent is acting, before DJ has to ask. The "consultant of your past selves" service.

### 8. External signal pull-through

Agent asks: _"Has Stripe sent anything relevant this week?"_

Librarian queries Gmail / Calendar / GitHub on the agent's behalf and returns a _summary tuned to the asking agent's task_. Interlibrary loan. The agent doesn't have to integrate with Gmail directly — BuildOS already did it.

---

## Architecture

### Protocol layer: MCP

BuildOS exposes an **MCP (Model Context Protocol) server**. This is the right bet because:

- MCP is rapidly becoming the cross-agent standard (Cursor, Claude Desktop, Claude.ai, VS Code, ChatGPT surfaces, plus custom agents all support it).
- We get distribution into every major agent surface essentially for free.
- We don't have to invent or document a custom API — agents already know how to consume MCP.
- The protocol has discovery built in, so agents can introspect what resources are available.

### Server shape

**Resources (read paths):**

| Resource                                   | Returns                                         |
| ------------------------------------------ | ----------------------------------------------- |
| `buildos://projects/active`                | List of active projects (handles + one-liners)  |
| `buildos://project/{handle}`               | Full briefed project context                    |
| `buildos://voice/{surface}`                | Voice guide + samples for a surface             |
| `buildos://beliefs?topic={topic}`          | DJ's stated positions on a topic                |
| `buildos://memory?q={query}`               | Semantic search synthesis                       |
| `buildos://feed/current`                   | Current feed state (DECISIONS / MOVING / WATCH) |
| `buildos://calendar/today`                 | Today's commitments, briefed                    |
| `buildos://patterns/similar?context={...}` | Past situations matching current shape          |

**Tools (write paths):**

| Tool                | Effect                                               |
| ------------------- | ---------------------------------------------------- |
| `post_card`         | Agent posts a card into the feed                     |
| `summarize_session` | Agent ends session with a written-back summary card  |
| `claim_work`        | Agent claims a piece of work to prevent duplication  |
| `release_work`      | Agent releases its claim                             |
| `request_decision`  | Agent surfaces a question to DJ via DECISIONS NEEDED |

**Prompts (reusable templates):**

| Prompt                | Use                                       |
| --------------------- | ----------------------------------------- |
| `brief_me_on_project` | Template for project briefing             |
| `write_in_dj_voice`   | Pulls voice + samples for a given surface |
| `librarian_query`     | Template for arbitrary context queries    |

### Fast path vs slow path

Not every query needs an LLM call.

- **Fast path (cached briefings)**: Simple resource queries return pre-generated briefings. `buildos://project/payments` returns the most recent project briefing, regenerated when triggering events fire (new card, decision made, brain dump on this project). Cheap, fast, predictable. Most queries hit this path.
- **Slow path (Librarian synthesis)**: Novel queries route through an LLM. "What does DJ think about [topic]?" requires synthesis across multiple sources. Cached after first run with a sensible TTL.

### System shape

```
                 ┌─────────────┐
                 │   BuildOS   │
                 │   memory    │  brain dumps · projects · cards · voice samples
                 └──────┬──────┘
                        │
            ┌───────────┴───────────┐
            │                       │
       ┌────▼────┐             ┌────▼────┐
       │ Briefer │             │Librarian│
       │ for DJ  │             │for      │
       │         │             │ agents  │
       └────┬────┘             └────┬────┘
            │                       │
      daily brief             MCP server
      feed cards                    │
      weekly retro                  ▼
                          external agents
                       (Cursor · Claude · ChatGPT · custom)
```

---

## Data Shape

Every resource returns a consistent envelope:

```json
{
  "kind": "project_briefing",
  "subject": "payments",
  "as_of": "2026-05-13T10:00:00Z",
  "briefing": "Free-form prose written by the Librarian. Tight (300–800 tokens). Tuned to the asking agent's likely task.",
  "facts": {
    "stated_goal": "...",
    "open_decisions": [...],
    "current_blockers": [...]
  },
  "citations": [
    { "ref": "card:abc123", "title": "Webhook handler shipped", "date": "..." },
    { "ref": "brain_dump:def456", "title": "Stripe retry strategy", "date": "..." }
  ],
  "next_actions": [ /* if relevant */ ]
}
```

Two disciplines that matter:

1. **Citations are mandatory.** Agents must be able to cite their sources back to DJ. Ungrounded output kills trust.
2. **Briefings stay small enough to fit in system prompts.** Hard cap ~1KB / 800 tokens for primary briefings. Deeper context is fetched via citation links only if the agent needs it. The librarian wrote a one-pager, not a research dossier.

---

## Auth & Scoping

Extend the existing BuildOS Agent API bearer-token pattern (DJ already has this). Add scopes:

| Scope          | Grants                                  |
| -------------- | --------------------------------------- |
| `read:context` | Query resources                         |
| `write:feed`   | Post cards, summarize sessions          |
| `coordinate`   | Claim / release work, request decisions |
| `full`         | All of the above                        |

**Per-agent tokens.** One token per external agent, so DJ can revoke individually. Suggested defaults:

- **Engineering token** (for Cursor): full read on engineering projects, voice export for code/PR; no marketing or personal scope.
- **Writing token** (for Claude.ai): voice + style, recent posts, blog drafts; no engineering internals.
- **Personal assistant token**: calendar, communications context; no engineering.

Defense in depth — if a token leaks, the blast radius is limited to that surface.

---

## Phasing — How We Ship This

### Phase 0 (week 1): MCP scaffold

- Stand up an MCP server endpoint on the BuildOS web app (`/mcp` route, SvelteKit handler).
- Implement one resource end-to-end: `buildos://projects/active`.
- Wire existing bearer-token auth with one scope: `read:context`.
- Verify DJ can connect Cursor / Claude Desktop and see his active projects.

This phase exists to **prove the wire works**. Nothing else.

### Phase 1 (weeks 2–3): the two highest-value reads

- `buildos://project/{handle}` — full project briefing (Librarian-mediated, slow path with caching).
- `buildos://voice/{surface}` — voice export with examples and taboos.

These two cover ~80% of daily use. After this phase, DJ can have Cursor open a project session with full context loaded, and Claude.ai can draft in his voice without re-teaching every time. **This is the demo that makes people say "wait, I want this."**

### Phase 2 (weeks 3–4): write-back closes the loop

- `summarize_session` tool — every agent session ends with a card posted back.
- `post_card` tool — agents can surface things into the feed proactively.
- Cards from external agents land in the same feed as Briefer's cards. The feed starts compounding.

This is the phase where BuildOS stops being one-way storage and starts being a living context surface.

### Phase 3 (weeks 5+): higher-order

- `buildos://memory?q={...}` — semantic recall.
- `buildos://beliefs?topic={...}` — belief / prior export.
- `claim_work` / `release_work` — coordination.
- `patterns/similar` — proactive pattern injection.
- External signal pull-through (Gmail / Calendar / GitHub summaries on demand).

---

## The Connect Your Agents Promo, Operationalized

The Connect Your Agents promo (drafted 2026-05-08) positions BuildOS as "the context surface across AI agents." Today, that lives as positioning copy. The MCP server is **what the promo is actually pointing at.**

When the layer ships:

- The promo's claim becomes provable in 30 seconds — show Cursor loaded with real BuildOS context.
- Demo videos become trivial: "Watch me start a Cursor session. It already knows what I'm doing." Cut.
- "Connect Your Agents" becomes a real product action (paste this MCP URL into your agent of choice), not just a positioning frame.

The promo doc should get a follow-up edit once this is live, pointing to the working product.

---

## Open Questions

- **Librarian voice.** Briefer has a register and a personality. Does the Librarian? Or is it utility code with no personality, designed to be invisible? Argument either way — invisible is more honest as a serving layer; named gives the system a consistent face.
- **Relationship to the existing BuildOS Agent API.** DJ already has a working API for connecting his BuildOS agent. Does the MCP server wrap that, replace it, or live alongside? Recommend: MCP server wraps and supersedes; existing endpoints stay as compatibility surface for one quarter.
- **Cache staleness.** How stale can a project briefing be before it misleads? Regenerate on triggering events (new card, decision made, brain dump tagged to project) plus a hard TTL ceiling (60min?).
- **Discovery.** MCP has a built-in discovery protocol. Should BuildOS publish a "starter pack" of recommended resources for each agent surface (Cursor vs Claude.ai vs ChatGPT)? Lower onboarding friction.
- **Rate limits.** Some agents will query aggressively (every keystroke). Need a cheap cache layer and per-token quota.
- **Multi-user future.** Everything here assumes single-user (DJ). When BuildOS has teams, the layer needs scoping by user + workspace. Worth designing the table schema with this in mind even if we don't expose it yet.
- **Privacy red lines.** What never leaves BuildOS, even with the right scope? Personal communications? Financial details? Need a hard allow-list for what each scope can return, not just a deny-list.

---

## Next Steps

1. **Lock the MVP wedge.** Phase 0 + Phase 1 is the demoable slice (~3 weeks). Decide whether to ship in parallel with the feed MVP (`DECISIONS NEEDED` lane) or sequence them. Recommend parallel — they reinforce each other and the demo story.
2. **Sketch the Librarian's first prompt.** What does the system prompt look like that takes a query + relevant BuildOS data and produces a briefing? This is the single most consequential piece of LLM design in the layer.
3. **Pick the first two voice surfaces.** LinkedIn and code-PR are the highest-frequency. Worth getting the voice/style export right for those two before adding more.
4. **Update the Connect Your Agents promo doc** with a footnote pointing to this brainstorm — they're the same project from different angles.
5. **Mine this for content.** "I built an MCP server that makes my agents share context" is itself a piece of anti-feed content. The implementation is the proof.
