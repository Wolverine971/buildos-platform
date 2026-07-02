---
date: 2026-06-02
title: Simon Willison — Target Profile + Outreach
status: draft-for-action
target: Simon Willison (simonwillison.net)
segment: B (validator / technical evaluator)
channel: Email (contact-page reveal) — secondary: Mastodon @simon@simonwillison.net
artifact_status: blocked — needs public, hardened MCP server + one-command repro
first_touch_sent: no
parent_strategy: docs/brainstorms/2026-05-21-faker-recruitment-strategy.md
related_docs:
    - docs/marketing/growth/target-influencers/ai-native-builder-influencer-study.md
    - docs/brainstorms/2026-05-21-agent-host-story.md
    - docs/marketing/growth/target-influencers/ai-native-builders/riley-brown.md
voice_spec: ~/.claude/skills/sales-council/references/creator-outreach-voice.md
path: docs/marketing/growth/target-influencers/ai-native-builders/simon-willison.md
---

# Simon Willison — Target Profile + Outreach

> Stage 1 artifact (per the Faker funnel): research dossier + tailored draft outreach.
> Second per-target profile. Validator segment — exercises the **rigor register**, not the warm creator voice.

## TL;DR (read this first)

Simon is the **validator play done right** — his criticism is worth more than his endorsement, and he genuinely engages with runnable artifacts from builders. But the research surfaced two things that change the plan:

1. **His signature critique is the "lethal trifecta" for MCP — and he published a Supabase-MCP exfiltration proof-of-concept.** BuildOS is Supabase + an MCP server. The obvious "evaluate our MCP server" pitch walks into his single most-publicized objection. The fix is to **make that the frame**: "here's our MCP server — tell me where the lethal trifecta bites." That's the move most likely to get a reply _and_ it shows you've actually read him.
2. **He's gated, not sendable-this-week.** The Faker doc lists Simon as a "do this week" pick because "he doesn't need agent integration to evaluate." But a validator's whole value is the artifact, and for Simon the artifact is a **public, runnable, security-defensible MCP server** — which doesn't exist yet (MCP is Tier 2 in the agent-host doc, ~3-4 months out, and open-sourcing it is still an open question). **Don't send until there's a one-command repro you'd be proud to have him attack.**

Net: highest-value validator, highest bar. Sequence him as the **first send once the MCP server is real and has passed an internal lethal-trifecta self-audit** — not before.

## Who he is / what he's building

- Co-creator of **Django**, creator of **Datasette** (~11k stars) and the **`llm`** CLI/library (~12k stars). Independent, not lab-employed. Coined **"prompt injection."**
- **Current flagship — Datasette Agent** (first alpha **May 21, 2026**, iterating fast): an extensible, plugin-based AI assistant over Datasette that writes/executes SQLite from natural language. Live demo at agent.datasette.io (running Gemini 3.1 Flash-Lite via `llm-gemini`). Plugins for charts, imagegen, sandboxed code execution. He notes "Claude Code and OpenAI Codex are both proving excellent at writing plugins." [datasette.io/blog/2026/datasette-agent](https://datasette.io/blog/2026/datasette-agent/) · [simonwillison.net/2026/May/21/datasette-agent](https://simonwillison.net/2026/May/21/datasette-agent/)
- **`llm` 0.32** — major backwards-compatible refactor in alpha since Apr 29 2026 (message-sequence inputs; streamed differently-typed response parts). Released as alpha specifically so plugin authors could exercise the new design. [simonwillison.net/2026/Apr/29/llm](https://simonwillison.net/2026/Apr/29/llm/)
- **Showboat + Rodney** (Feb 2026) — CLI tools so coding agents can _demonstrate and prove_ their work (re-executable Markdown with captured output). This is the single best signal of what artifact he respects. [simonw.substack.com/p/introducing-showboat-and-rodney-so](https://simonw.substack.com/p/introducing-showboat-and-rodney-so)

## Distribution & channel

- **Blog (simonwillison.net) is the center of gravity; Mastodon (`@simon@simonwillison.net`) is his most active interactive surface in 2026.** Bluesky + X secondary and de-emphasized.
- **Best channel: email** via his contact-page "Reveal my Address" mechanism. Secondary: a concise, public, technical Mastodon mention. **Avoid X DMs and LinkedIn.**
- No public policy inviting or refusing cold pitches; he responds to _thoughtful, technical, specific_ messages and ignores marketing/PR. (Inferred from consistent multi-year pattern — see verify list.)

## Worldview (what he values — match this or get ignored)

- **"Vibe engineering"** (his term): agents can fly _only_ with engineering discipline — tests, review, manual QA, specs, version control. _"AI tools amplify existing expertise."_ Agents _"will absolutely cheat if you give them a chance."_ [simonw.substack.com/p/vibe-engineering](https://simonw.substack.com/p/vibe-engineering)
- **Proof-of-work over demos:** _"The job of a software engineer isn't to write code, it's to deliver code that works"_ and _"I never trust any feature until I've seen it running with my own eye[s]."_
- **Skeptic, not doomer.** Measured, comparative, price-aware model coverage. The "without the hype" voice.
- **Editorial independence is sacred:** _"Sponsors do not have any influence over my editorial content."_ Has **not** accepted payments from LLM vendors. → **Never ask for an endorsement; he'll reject it.** Ask only for evaluation.

## The MCP wrinkle (this is the strategic core)

Simon is **skeptical-to-wary of MCP, on security grounds**, and has written about it extensively ([tag](https://simonwillison.net/tags/model-context-protocol/)):

- **Lethal trifecta:** danger when an agent has (1) private-data access + (2) exposure to untrusted content + (3) an exfiltration channel. _"MCP makes the lethal trifecta worse because mix-and-match tools mean combining private data access with untrusted content sources with communication channels, often without realizing it."_ [simonw.substack.com/p/the-lethal-trifecta-for-ai-agents](https://simonw.substack.com/p/the-lethal-trifecta-for-ai-agents)
- **He published the Supabase-MCP PoC** — Supabase MCP + an untrusted-token source + an outbound channel = data exfiltration. BuildOS runs on Supabase and plans an MCP server, so this is **directly on point**. [x.com/simonw/status/1941674715720057258](https://x.com/simonw/status/1941674715720057258)
- Also flags **"rug pull"** (a tool mutates its own definition post-approval) and **"tool shadowing."** And reportedly prefers CLI tools over MCP for his own work (_paraphrase — verify before quoting_).

**Implication — cuts both ways:**

- **Risk:** if BuildOS's MCP server naively exposes Supabase-backed project data + ingests untrusted content (brain dumps! emails! web content!) + has any outbound channel, Simon will find the trifecta and could write it up. Per the Faker doc's own risk note, a credible prospect writing honestly about why it's broken is an industry-wide negative signal.
- **Opportunity / correct play:** this _is_ the Segment B move. Invite him to break it, framed through his own lens. His teardown — before a wider launch — is worth more than any endorsement, and prepping for it forces a real security pass on the MCP surface (good regardless of whether he ever replies).

## What earns his attention

- An **open-source repo + a one-command runnable repro** (his own ergonomic bar: `uvx`/`llm`-style). A working artifact is the currency; slide decks and closed demos get ignored.
- Bonus if it slots into his ecosystem — an `llm` plugin, a Datasette plugin, or a Showboat-shaped reproducible artifact (commentary + executable blocks + captured output that a verifier can re-run).
- **Pre-empting the hard part** (the lethal-trifecta surface) signals you've read him and aren't pitching blind.

## Recommended positioning + precondition

**Positioning:** peer engineer asking a sharper engineer to find the holes — specifically the security holes he's already famous for caring about. Zero marketing. Explicitly not-an-endorsement-ask.

**Precondition before any send (do not skip):**

1. A **public (or access-granted) MCP server** for BuildOS exists.
2. A **one-command repro** stands up a scoped instance and exercises the tool surface.
3. An **internal lethal-trifecta self-audit** is done against his published criteria — and the honest result (even "here's where we're still exposed") is something you'd stand behind. Sending him a trifecta-vulnerable server cold, unacknowledged, is the worst outcome.

Until those exist, Simon is **prep, not send.** Interim work: build the repro, run the self-audit, and warm up by genuinely engaging his Datasette Agent / MCP posts on Mastodon (no pitch).

## Draft outreach (email — hold until precondition met)

**Channel:** email via contact-page reveal. Rigor register.

> **Subject:** an MCP server I'd like you to try to break
>
> Simon —
>
> I build BuildOS — a durable project-context layer (projects, goals, plans, docs, tasks) that agents read and write over MCP. It's built on Supabase, which means I've read your Supabase-MCP lethal-trifecta writeup more times than is comfortable.
>
> I'd like an honest technical read, specifically on where the trifecta applies here. The MCP server is open source [link]; this one command stands up a scoped instance and runs the full tool surface [command]. Tokens are project-scoped, read/write-split, time-limited, and every action is actor-attributed — but I'd rather you tell me where that's not enough than take my word for it. The part that keeps me up: brain-dump content is untrusted input, and the project data is exactly the private data your PoC exfiltrated.
>
> Not asking for an endorsement — asking for the analysis, however brutal. If it's broken, that's the most useful thing you could tell me.
>
> DJ

**Why this works:** leads with a runnable artifact + one-command repro (his currency). Frames the ask around his own lethal-trifecta lens and names the exact exposure (untrusted brain-dump input + private project data) instead of hiding it — the rigor-register equivalent of the accusation audit. Invokes consistency (he's published the critique; applying it is on-brand for him — Cialdini). Explicitly disclaims endorsement, which he'd reject. Signed DJ.

_Drier variant if the "more times than is comfortable" line feels too casual for him: cut it and open "It's built on Supabase, so your Supabase-MCP lethal-trifecta writeup is why I'm writing."_

## Artifact plan

**Not a pre-built workspace** (wrong for a validator) and **not a marketing demo.** The artifact IS the eval target:

- **Primary:** open-source BuildOS MCP server + `uvx`-style one-command repro + a short Showboat-shaped writeup of an internal lethal-trifecta self-audit ("here's the surface, here's what we mitigated, here's what we're unsure about").
- **Ecosystem bonus (optional, sooner, lower bar):** a small `llm` plugin or Datasette-shaped artifact that demonstrates BuildOS's context model reproducibly — a way to earn a first interaction before the full MCP server is ready. Evaluate whether this is substantive enough to be worth his time; a weak artifact is worse than none.

## Verify before send

- [ ] Load the live contact page and confirm the **email reveal** still works.
- [ ] Confirm current flagship naming/state (**Datasette Agent**, `llm` 0.32) so any reference is exact and current.
- [ ] Do **not** quote "he no longer uses MCP / prefers CLI" — secondary-source paraphrase, unverified wording.
- [ ] Confirm the open-source MCP server + one-command repro actually exist and the links resolve before sending (the draft assumes them).
- [ ] Run the lethal-trifecta self-audit first; do not send a server you haven't honestly probed.

## Funnel tracking row

| Field            | Value                                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name             | Simon Willison                                                                                                                                                 |
| Segment          | B (validator)                                                                                                                                                  |
| Channel          | Email (contact-page reveal); Mastodon secondary                                                                                                                |
| Research date    | 2026-06-02                                                                                                                                                     |
| Artifact status  | Blocked — needs public hardened MCP server + one-command repro + self-audit                                                                                    |
| First touch sent | No                                                                                                                                                             |
| Outcome          | —                                                                                                                                                              |
| Notes            | Highest-value validator, highest bar. Gated on real MCP artifact, NOT sendable this week despite Faker doc. Frame the ask around his lethal-trifecta critique. |
