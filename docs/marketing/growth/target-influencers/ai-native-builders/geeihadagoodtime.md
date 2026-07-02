---
date: 2026-06-17
title: GeeIHadAGoodTime — Target Profile + Outreach
status: draft-for-action
target: GeeIHadAGoodTime (GitHub: @GeeIHadAGoodTime · TikTok: @geeihadagoodtime)
segment: Frontier builder / technical validator (peer, not workspace-recruit) — gated on MCP
channel: GitHub (issue/discussion on his repo, builder-to-builder) → TikTok DM
artifact_status: not started
first_touch_sent: no
parent_strategy: docs/brainstorms/2026-05-21-faker-recruitment-strategy.md
related_docs:
    - docs/marketing/growth/target-influencers/ai-native-builder-influencer-study.md
    - docs/marketing/growth/target-influencers/ai-native-builders/simon-willison.md
    - docs/marketing/growth/target-influencers/ai-native-builders/riley-brown.md
voice_spec: ~/.claude/skills/sales-council/references/creator-outreach-voice.md
path: docs/marketing/growth/target-influencers/ai-native-builders/geeihadagoodtime.md
---

# GeeIHadAGoodTime — Target Profile + Outreach

> Stage 1 artifact (per the Faker funnel): research dossier + tailored draft outreach.
> Built off the Riley Brown profile template.

## TL;DR (read this first)

Gee is a **frontier AI-agent infrastructure builder** who ships real, opinionated open-source tooling for the exact problem BuildOS sits next to: what an agent _saw_ and _remembered_ at each decision point. His flagship, **Agent-Xray**, reconstructs an agent's "decision surface" to debug silent behavioral failures; **ViolaWake** is an open wake-word engine. This is a **Simon-Willison-class technical validator**, not a workspace-recruit — and the overlap with BuildOS's thesis ("durable project context every agent reads") is the whole conversation.

**The play is builder-to-builder, on his repo, on his terms.** No relief-language, no end-user pitch — he'll judge the substance. And like every technical validator on the list, he's **gated on the MCP server**: there's nothing rigorous for him to evaluate until BuildOS ships a real, security-hardened MCP server + one-command repro. Until then, the move is genuine engagement with his work, not a pitch.

## Who he is / what he's building

- **Agent-Xray** (Python, MIT) — _"Reconstruct what your AI agent saw at each decision point — so you can debug behavioral failures that produce no error logs."_ Local-first, framework-agnostic trace normalization (OpenAI, Anthropic, LangChain, CrewAI, OpenTelemetry), 22-category root-cause taxonomy, pytest/CI plugin, enforce mode with gaming detection. [github.com/GeeIHadAGoodTime/Agent-Xray](https://github.com/GeeIHadAGoodTime/Agent-Xray)
- **ViolaWake** (Python) — open-source wake-word detection, _"the open alternative to Porcupine,"_ production TemporalCNN + ONNX inference. [github.com/GeeIHadAGoodTime](https://github.com/GeeIHadAGoodTime)
- Profile reads as a **hands-on ML/agent-systems engineer** building developer tooling, not a marketer. Real-name / location / bio not surfaced publicly (verify).

## Distribution & channel

- **GitHub: @GeeIHadAGoodTime** — his primary credibility surface. This is where a peer reaches him.
- **Reach RESOLVED (2026-06-19):** ✅ He is a **pure peer/validator with essentially zero public distribution — NOT an amplifier.** GitHub account is <1yr old (created 2025-06-25), **0 followers**, 3 repos; Agent-Xray has **1 star**, ViolaWake 0. **No verifiable TikTok, X, or YouTube presence** ("geeihadagoodtime" is a phrase, not a confirmed channel). His entire value is technical credibility/validation, not reach — recruit him as a Simon-class validator, never as a distribution channel.
- **TikTok: @geeihadagoodtime** — ~~exists; audience unconfirmed~~ → no confirmed account found; treat as nil.
- **Best first touch: a substantive GitHub issue/discussion on Agent-Xray** — a real observation about the decision-surface reconstruction, builder-to-builder. _Then_, if there's rapport, a TikTok DM. Cold-DMing a frontier engineer with a product pitch is the worst opening.

## Stack & workflow he teaches/builds

- Lives in the **agent-observability / agent-reliability** layer: traces, decision surfaces, failure taxonomies, CI gates for agent quality.
- Framework-agnostic by design — explicitly normalizes across the major agent frameworks, which signals he thinks about the _portable_ layer above any one tool. That mindset maps directly onto BuildOS's "one context layer every agent reads."

## Stated pains / thesis overlap (the BuildOS-relevant part)

- His entire premise — _agents fail silently because you can't see what they had access to at each step_ — is the **read side** of the same problem BuildOS addresses on the **state side**: agents are only as good as the context they can see and carry forward.
- Agent-Xray reconstructs _what the agent saw after the fact_; BuildOS is _the durable place the agent reads from in the first place_. Genuinely adjacent layers — diagnosis vs. source-of-truth.

## The strategic wrinkle

He builds **agent infrastructure**, so a naive "BuildOS remembers so your agents don't forget" pitch risks reading as either (a) pitching him something in his own domain, or (b) competitor recon. Same trap as Riley.

Honest framing: **Agent-Xray is observability (what did the agent see/do?). BuildOS is the durable project/context layer the agent reads from.** They could even compose — a project's context layer is exactly the kind of "decision surface" his tool wants to reconstruct. Lead with curiosity about _his_ layer, not a pitch for mine.

### Register note (anti-AI rule)

The anti-AI "lead with relief" rule is for end-users. Gee is a **frontier engineer** — technical agent language is the correct register (same call as Riley/Simon). No hype, no "revolutionary AI," no urgency, no marketing gloss. He'll smell it instantly.

## Draft outreach (NOT sendable as a product pitch yet — gated on MCP)

**First touch now = genuine engagement, no ask.** Channel: GitHub issue/discussion on Agent-Xray.

> Agent-Xray's framing — reconstructing the decision surface instead of just reading the trace — is the right level to debug agents at. The 22-category root-cause taxonomy especially. [one specific, real observation or question about the tool here]
>
> I build BuildOS — a durable project/context layer agents read from (goals, plans, docs, decisions, the people + agents involved). Different end of your problem: you reconstruct what the agent saw, I'm trying to make what it sees worth seeing and stable across sessions. Curious whether you've thought about the context-source side as part of the decision surface. Following the repo regardless.

**Why this works:** opens on _his_ work with a specific, real observation (the only way to reach a frontier engineer). Positions BuildOS by honest layer-difference, not as a competitor or a thing-he-should-buy. No ask. Following-regardless close.

> **When MCP ships:** the credible artifact for Gee is the **open-source, security-hardened MCP server + a repro he can poke at** — ideally one where Agent-Xray could literally trace an agent reading a BuildOS project. That's a builder's "evaluate the real thing" artifact, not a demo-for-show.

## Artifact plan

- **Now:** read his code for real, engage substantively on the repo. Build a relationship, not a funnel.
- **Gated on MCP:** open MCP server + repro; bonus if it interoperates with Agent-Xray's trace model (huge credibility signal to him specifically).
- **Do NOT** build a fake workspace or send a marketing demo — wrong motion for a frontier engineer.

## Verify before send

- [x] ~~**Confirm the TikTok @geeihadagoodtime audience size + content**~~ → ✅ RESOLVED 2026-06-19: no verifiable social presence; he's a **pure peer/validator, not an amplifier** (see Where to find him).
- [ ] Find his **real name / canonical identity / preferred contact** (GitHub bio, repo READMEs, linked socials).
- [ ] Read Agent-Xray properly and land **one specific, genuine observation or question** before opening — generic praise will not work on him.
- [ ] Do NOT send a product pitch until the MCP server exists and survives scrutiny (same gate as Simon/Hamel).

## Funnel tracking row

| Field            | Value                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Name             | GeeIHadAGoodTime                                                                                                                                       |
| Segment          | Frontier builder / technical validator (peer) — gated on MCP                                                                                           |
| Channel          | GitHub @GeeIHadAGoodTime (repo issue/discussion) → TikTok DM                                                                                           |
| Research date    | 2026-06-17                                                                                                                                             |
| Artifact status  | Not started (no fake workspace; credible artifact = open MCP server + repro, ideally Agent-Xray-interoperable)                                         |
| First touch sent | No                                                                                                                                                     |
| Outcome          | —                                                                                                                                                      |
| Notes            | Agent-Xray (decision-surface observability) is the exact adjacent layer to BuildOS. Peer engagement now; pitch gated on MCP. TikTok reach unconfirmed. |
