<!-- docs/specs/connect-your-agents-promotion-readiness-2026-05-08.md -->

# Connect Your Agents — Promotion Readiness Spec

**Status:** Draft implementation spec
**Author:** DJ + Claude
**Date:** 2026-05-08
**Scope:** Onboarding V3, public `/integrations` page, `connect-agents.md` doc, `/profile?tab=agent-keys` UI polish, supporting marketing assets
**Related docs:**

- `apps/web/src/content/docs/connect-agents.md` (existing public doc — strong technical content)
- `apps/web/src/routes/(public)/integrations/+page.svelte` (existing public page — OpenClaw-shaped)
- `apps/web/src/lib/components/profile/AgentKeysTab.svelte` (existing settings UI)
- `apps/web/src/lib/components/onboarding-v3/ReadyStep.svelte` (final onboarding step — current "what to do next" copy)
- `docs/integrations/openclaw/setup.md` (non-technical setup doc — currently fearful)
- `docs/marketing/strategy/buildos-marketing-strategy-2026.md` (positioning)
- `docs/marketing/strategy/anti-ai-show-dont-tell-strategy.md` (anti-AI positioning thesis)
- `docs/marketing/strategy/thinking-environment-creator-strategy.md` (creator-as-wedge audience)
- `docs/marketing/social-media/publish-kits/2026-03-12-buildos-guerrilla-seed-campaign.md` (active campaign — slot promo into a week)
- `docs/marketing/social-media/buildos-agent-keys-twitter-posts.md` (existing draft posts — needs reframing)

---

## 0. Why this spec exists

DJ wants to publicly position BuildOS as the **context surface between his AI agents** — the place where his projects live, that any tool he uses (Claude Code, Cursor, Claude Desktop, ChatGPT custom GPT, his own scripts) can read from and write to so they're all "reading off the same sheet of paper."

The technical foundation already exists. The agent call gateway is shipped. Per-key scoping, audit, rotate/revoke, one-paste bootstrap link — all live. (See §1.)

The blocker is **discoverability + framing**:

1. **Onboarding never mentions it.** Onboarding V3 ends at `ReadyStep.svelte` with "open a project / chat with BuildOS / check daily brief." A new user has zero chance of organically finding `/profile?tab=agent-keys`.
2. **Public surface is OpenClaw-shaped.** `/integrations` and `docs/integrations/openclaw/setup.md` lean hard on "OpenClaw still needs a connector." That sentence makes the page read as "this doesn't work yet" — which is **actively misleading** for the Claude Code / Cursor / Claude Desktop / custom-script flow that DJ is doing every day and is fully supported.
3. **No "context surface" framing.** The product calls this an "external agent call gateway." Promotional posts will pitch it as a "thinking environment your agents share." Today nothing in the product or docs uses the user-facing language we want to amplify.

A post saying "BuildOS is my context surface across agents" sends curious viewers to a public page that sounds like a half-built OpenClaw integration. Promotion will land soft until that gap closes.

This spec is the closing of that gap. It is not a feature build. It is an onboarding callout + a positioning rewrite + doc cleanup + demo asset capture.

---

## 1. What is already shipped (do not rebuild)

| Capability                       | Where                                                                                                                              | Status     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| JSON-RPC gateway                 | `POST /api/agent-call/buildos`                                                                                                     | Live       |
| Session protocol                 | `call.dial → tools/list → tools/call → call.hangup`                                                                                | Live       |
| Per-key scope                    | `read_only` / `read_write`, per-project allowlist, per-write-op whitelist (`AgentKeysTab.svelte:160`)                              | Live       |
| Permission bundles               | Read only / Author docs+tasks (default) / Full / Custom                                                                            | Live       |
| Token hygiene                    | SHA-256 hash stored; full secret shown once on generate/rotate                                                                     | Live       |
| Rotate / Reissue / Revoke        | UI flows in `AgentKeysTab.svelte`                                                                                                  | Live       |
| Audit + usage analytics          | Per-key page at `/profile/agent-keys/[callerId]` (sessions, tool calls, writes, errors, denied, latency, security events)          | Live       |
| One-paste bootstrap              | `GET /api/agent-call/bootstrap/<setupToken>` → env block + paste prompt as text or JSON (`bootstrap-link.service.ts`)              | Live       |
| Copy Prompt                      | "Copy Prompt" button in `AgentKeysTab.svelte:586-649` builds a self-contained instruction prompt for any external agent            | Live       |
| Public technical doc             | `/docs/connect-agents` (`apps/web/src/content/docs/connect-agents.md`)                                                             | Live, good |
| Public marketing surface         | `/integrations` (`apps/web/src/routes/(public)/integrations/+page.svelte`)                                                         | Live, off  |

**Out of scope for this spec.** No new write ops. No new auth flow. No connector SDK. No changes to `agent-call-policy.ts` or `caller-provisioning.service.ts`. We are wrapping what exists in the right surface.

---

## 2. Goals and non-goals

### Goals

1. A new BuildOS user can finish onboarding and, **without anyone telling them**, see that BuildOS is the place their other AI tools should read from.
2. A curious viewer who lands on `build-os.com/integrations` from a tweet immediately understands "this works today, with the tools I already use" and can be set up in under 3 minutes.
3. The "context surface across agents" framing is consistent across the product, the public page, the doc, and the social posts.
4. We capture one short demo (≤ 60s) that pairs with the launch post and is reusable across Twitter, LinkedIn, Instagram, TikTok.
5. Existing keys keep working. No rotation forced.

### Non-goals

- Building a native OpenClaw connector. (Tracked separately.)
- Writing a true OAuth flow for agent installs. (Future.)
- Adding new write ops to the gateway. (Tracked in `connect-agents.md` roadmap.)
- Deprecating the OpenClaw-specific docs. (We rewrite them. We keep the path.)

---

## 3. Positioning lock — the words we use everywhere

This section is the source of truth for copy. Every component, page, and doc edited by this spec uses these words.

### Category framing

> **A thinking environment your agents can share.**

### Core promise (one-liner)

> Your messy thinking lives in BuildOS. Your AI tools — Claude Code, Cursor, Claude Desktop, ChatGPT, anything that can call HTTP — read off the same sheet of paper instead of starting from zero each session.

### What it is, in plain terms (3 lines)

> Generate a key. Paste it into your AI tool's config. Now that tool can see your projects, read your tasks and docs, and (if you allow it) write back to them.
>
> Per-project scoping. Per-op write whitelist. Audit log. Rotate or revoke any time.
>
> No vendor SDK. No OAuth dance. No retraining your agents on your context every session.

### What it is **not** (the anti-claims, ordered by importance)

1. Not "our chatbot." This is for the agents you already use.
2. Not "AI talking to AI." It's a scoped read/write surface, not a conversation bridge.
3. Not "paste your secret into chat." The token lives in your agent's secret config, never in chat memory.
4. Not OpenClaw-specific. OpenClaw was the first integration. The same key works for every HTTP-capable agent.

### Words to avoid

- "External agent call gateway." (Internal language. Never user-facing again.)
- "JSON-RPC." (Mention in technical doc only.)
- "Caller key" / "callee handle." (Keep in low-level reference. Hide from marketing surface.)
- "AI-powered." (Anti-AI marketing rule from `anti-ai-show-dont-tell-strategy.md`.)

### Words to use

- **Context surface.** **Reading off the same sheet of paper.** **Your projects, your tools, one place.** **Connect your agents.**

---

## 4. Workstream A — Onboarding callout in `ReadyStep`

**Goal:** Every new user finishes onboarding and sees a one-line, skippable, low-pressure callout that names this capability and points them to the settings tab.

### File

`apps/web/src/lib/components/onboarding-v3/ReadyStep.svelte`

### Current state

The "What to do next" card (`ReadyStep.svelte:300-326`) shows up to three items: open a project, chat with BuildOS, check daily brief. No mention of agent keys.

### Required changes

Add a fourth item to the "What to do next" list, after the existing entries, **always shown** (not gated on `summary.projectsCreated` or notifications):

```svelte
<div class="flex items-center gap-3 text-foreground">
  <Plug class="w-5 h-5 text-accent flex-shrink-0" />
  <span>
    Connect Claude, Cursor, or any AI tool — they'll read off the same projects.
    <a
      href="/profile?tab=agent-keys"
      class="text-accent underline underline-offset-2 hover:text-accent/80"
    >
      Set up
    </a>
  </span>
</div>
```

Notes:

- Use the `Plug` icon from `lucide-svelte` (already used elsewhere; matches the doc page's `icon: Plug` frontmatter in `connect-agents.md`).
- Keep this **inside** the existing card. Do not promote to a hero CTA — onboarding must end on the dashboard, not on settings.
- Copy is intentional: names two specific tools (Claude, Cursor) so it grounds. Does not say "agent keys" — that is the destination, not the pitch.
- The link is the only interaction. No state. No analytics requirement beyond the existing onboarding telemetry.

### Acceptance criteria

- [ ] New onboarding completion shows the row.
- [ ] Row is present regardless of `projectsCreated` count or notification state.
- [ ] "Set up" links to `/profile?tab=agent-keys` and lands the user on the Agent Keys tab.
- [ ] Light + dark modes both legible.
- [ ] Mobile (≤ 380px) does not overflow.

### Risk

Low. Single component, additive change.

---

## 5. Workstream B — Public `/integrations` rewrite

**Goal:** Replace the current OpenClaw-shaped page with a "Connect your agents" landing that treats Claude Code, Cursor, Claude Desktop, custom HTTP, and OpenClaw as peers — all using the same key. This is the page promotional posts will link to.

### Files

- `apps/web/src/routes/(public)/integrations/+page.svelte` (rewrite)
- `apps/web/src/routes/(public)/integrations/+page.ts` (update SEO meta)

### Current state

`+page.svelte` is 577 lines, structured as a 4-step OpenClaw walkthrough with concept cards, gate warnings about "OpenClaw still needs a connector," and call-to-action buttons that all link to `/profile?tab=agent-keys`. The technical content is correct. The framing is wrong for the post we want to write.

### Page structure (new)

```
1. Hero
   - H1: Connect your agents to BuildOS
   - Sub: One key. Every project. Read or write, your call.
   - Primary CTA: Generate a key (→ /profile?tab=agent-keys)
   - Secondary link: Read the docs (→ /docs/connect-agents)
   - Visual: short looping clip of "Copy Prompt → paste into Claude Code → list projects"

2. Why this exists (3 short paragraphs, anti-AI voice)
   - "Your AI tools forget every session. BuildOS doesn't."
   - "Your projects live in BuildOS. Your tools should read off them, not from your last copy-paste."
   - "Per-project scope. Per-op write whitelist. Rotate or revoke any time."

3. How it works (4 numbered steps, generic — not OpenClaw-specific)
   1. Generate a key in BuildOS (Profile → Agent Keys)
   2. Pick scope: which projects, read-only or read+write, which write ops
   3. Paste the env block into your tool's config
   4. Tell your agent: "connect to BuildOS, list my projects"

4. Tools that work today (grid of 4–6 cards, each linkable to a per-tool walkthrough)
   - Claude Code (CLI, dev tooling)
   - Cursor (IDE)
   - Claude Desktop (chat with file access)
   - Custom HTTP / scripts (the bootstrap URL is enough)
   - OpenClaw (when its connector ships)
   - "Anything that can call an HTTP endpoint" — explicit catch-all

5. What you control (table — keep the table from the current page, simplified)
   - Mode (read_only / read_write)
   - Project scope
   - Write op whitelist
   - Audit trail
   - Rotate / Revoke

6. Safety + secrets (3 lines, NOT a fearful wall)
   - The token belongs in your tool's secret store or env, not in chat history.
   - BuildOS stores only a hash. The full key is shown once on generate.
   - If a key leaks, rotate it from /profile?tab=agent-keys.

7. FAQ (5–7 short questions)
   - Does this work with [tool I use]?
   - What does "read+write" actually mean?
   - Can I limit which projects an agent sees?
   - What gets logged?
   - Can I undo a write?
   - How do I rotate a key?
   - Where's the technical reference?

8. Closing CTA
   - Heading: "Stop re-explaining your projects to every chat."
   - Button: Generate your first key
```

### Per-tool walkthrough cards

Each card on §4 either links to a small subsection on the same page (anchor) or — preferred — to a focused doc page in `apps/web/src/content/docs/connect-agents/<tool>.md` (new files). For v1 of this spec, do anchored sections on the same page. Doc pages can come later.

Each tool section follows the same shape:

```
## Claude Code
- One-line description: what it is, why this is good
- Setup (3 numbered steps using the same env block)
- "Copy this into your Claude Code config" — fenced env block placeholder
- "Then say:" — example user prompt
- (Optional) screenshot or 5-second clip
```

### SEO meta updates

`+page.ts`:

- Title: "Connect Your AI Agents to BuildOS"
- Description: "One key, every project. Connect Claude Code, Cursor, Claude Desktop, ChatGPT, or any HTTP tool to your BuildOS workspace with per-project scope and audit logs."
- Keywords: drop "agent call gateway." Keep "BuildOS integrations, Claude Code BuildOS, Cursor BuildOS, agent context, AI context surface."

### Acceptance criteria

- [ ] Page no longer says "OpenClaw still needs a connector" anywhere above the fold.
- [ ] Hero clip plays inline (or static image fallback in v1).
- [ ] All four tool cards link or anchor to a per-tool block.
- [ ] Generate-key CTA appears at top and bottom.
- [ ] Page ranks "BuildOS Claude Code" / "BuildOS Cursor" against current "BuildOS OpenClaw" baseline within 30 days (track in `docs/marketing/growth/`).
- [ ] No regressions on `/integrations` SEO impressions in Search Console for 30 days post-deploy.

### Risk

Medium. Public-page rewrite. Get the copy approved before shipping. Keep the URL stable. Server-render unchanged.

---

## 6. Workstream C — Doc rewrite for `connect-agents.md`

**Goal:** Tighten the technical reference to lead with the "shared context across tools" framing, expand the per-tool guidance, and drop the OpenClaw-only feel.

### File

`apps/web/src/content/docs/connect-agents.md`

### Current state

149 lines. Technical content is strong (scope table, permission bundles, write op list, bootstrap URL, custom-agent JSON-RPC pointer). Headers and "Why you'd want this" lean OpenClaw-ish in tone.

### Required edits

1. **Replace the "Why you'd want this" section (lines 14–18) with the §3 framing of this spec.** Two short paragraphs.
2. **Add a "Tools that work today" section** mirroring §5.4 of this spec, with one-paragraph guidance per tool. Keep the existing scope table and write-op list — they're correct and useful.
3. **Add a per-tool subsection: "Setting it up in Claude Code"** with the exact env-var block, where to put it, and the "ask Claude to dial" prompt. This is the highest-trafficked path; it deserves first-class treatment.
4. **Add a similar subsection for Cursor and Claude Desktop.** Shorter is fine.
5. **Trim the OpenClaw bias.** "OpenClaw default" stays in the bundle table (technically accurate). "This replaces the old copy-and-paste-your-context workflow" stays. References to OpenClaw as the headline get demoted.
6. **Update `lastUpdated` to `2026-05-08`.**

### Acceptance criteria

- [ ] Doc renders cleanly on `/docs/connect-agents`.
- [ ] Frontmatter `summary` updated to match §3 promise (one sentence).
- [ ] Internal links from `/integrations` resolve.
- [ ] Existing roadmap section preserved.

### Risk

Low. Doc edit.

---

## 7. Workstream D — Soften and reposition `docs/integrations/openclaw/setup.md`

**Goal:** Stop telling users "do not paste tokens into chat" in a way that bleeds onto the Claude Code / Cursor flow, where pasting into the tool's config is the supported flow.

### File

`docs/integrations/openclaw/setup.md`

### Required edits

1. Move the file to `docs/integrations/openclaw/setup-openclaw.md` and update `docs/integrations/openclaw/README.md` to point to it. (Keeps the path namespace; signals scope.)
2. **Rewrite the "Important Rule" section.** The current copy says "Do not paste `BUILDOS_AGENT_TOKEN` into normal Telegram or OpenClaw chat" and reads as a warning against pasting *anywhere*. New copy:

   > **Where the token belongs:** in your tool's secret store, env file, or plugin config — wherever it stores credentials it won't echo back. For Claude Code that's the relevant config file. For Cursor, the agent settings. For OpenClaw, the secret store. Never paste it into the agent's chat input or have the agent read it from a chat message.

3. Add a one-line caveat at the top: "This guide is OpenClaw-specific. For Claude Code, Cursor, Claude Desktop, or any other tool, see `/docs/connect-agents`."
4. Remove the "What to tell users right now" section, which says "BuildOS is ready, but OpenClaw still needs a BuildOS connector tool" as a generic answer. Limit it to the OpenClaw-specific case.

### Acceptance criteria

- [ ] No copy on this page reads as a blanket "agent keys don't work yet."
- [ ] Top-of-page link to the generic `/docs/connect-agents` reference.
- [ ] OpenClaw connector status is still clearly stated (it's still missing).

### Risk

Low.

---

## 8. Workstream E — Polish in the `/profile?tab=agent-keys` UI

**Goal:** The settings tab is well-built, but two affordances would lift it from "developer console" to "promotable surface."

### File

`apps/web/src/lib/components/profile/AgentKeysTab.svelte`

### Required edits

1. **Tagline above the "Registered Keys" card.** Currently the tab opens with a small sub-header "Manage API keys for external agents (like OpenClaw) to access your BuildOS data" (`AgentKeysTab.svelte:937-939`). Replace with: "Give Claude, Cursor, ChatGPT, or any AI tool a scoped read/write into your projects. One key per tool. Rotate or revoke any time." Drop the "(like OpenClaw)" qualifier — same reason as everywhere else in this spec.

2. **Empty state copy.** Currently `AgentKeysTab.svelte:1012-1014` says "No keys yet. Generate your first key to connect an external agent." Replace with: "No tools connected yet. Generate a key for the AI tool you use most — Claude Code, Cursor, ChatGPT, or anything that can call HTTP."

3. **"What is this?" disclosure.** Add a small `<details>` block under the tab header that expands a 4-bullet "what / why / how / safety" using the §3 framing. Default closed. Keeps the tab clean for power users, gives new users a path.

4. **Verify the `Copy Prompt` button works for every existing key, not just newly-provisioned ones.** Per current code, `agentConnectionPromptForCaller` (`AgentKeysTab.svelte:665-672`) substitutes `<BUILDOS_AGENT_TOKEN>` placeholder for existing keys (because the secret was destroyed at hash time). That's correct behavior. Add a tooltip on the button that reads: "Token redacted — paste your stored env value where this placeholder appears." Today the user has to read the long prompt to find the placeholder.

### Acceptance criteria

- [ ] Tagline appears, mentions Claude / Cursor / ChatGPT explicitly, drops "OpenClaw" parenthetical.
- [ ] Empty state copy updated.
- [ ] `<details>` disclosure renders correctly in light + dark.
- [ ] Tooltip on Copy Prompt explains the placeholder.
- [ ] No behavioral changes to provisioning, rotation, or revocation flows.

### Risk

Low.

---

## 9. Workstream F — Demo asset capture

**Goal:** A 30–60 second screen recording that pairs with the launch post and is reusable across all four social platforms. Same one asset; different captions.

### Source of truth for asset

`docs/marketing/social-media/assets/connect-your-agents/` (new dir)

### Recording script

```
[0:00] Cursor on /profile?tab=agent-keys, empty state.
[0:02] Click Generate. Modal opens, "Author docs + tasks" preselected.
[0:05] Type "claude-code" as installation name. (Show project allowlist briefly.)
[0:10] Click Generate. Confirmation modal opens with the env block.
[0:13] Click Copy Prompt.
[0:15] Cut to a Claude Code terminal — paste the prompt. (Token already in env, so no secret on screen.)
[0:18] Claude says "Connected to BuildOS. I see 30 projects." (Or similar — a real session, not staged.)
[0:22] Cut back to BuildOS, /profile/agent-keys/<id>. Show 1 session, 5 tool calls in the chart.
[0:28] Hold on the dashboard for 2 seconds.
[0:30] End card: "Connect your agents. build-os.com/integrations"
```

### Captions / variations

The `docs/marketing/social-media/buildos-agent-keys-twitter-posts.md` file already has draft copy that leads with "agent keys" / "external agent." That post needs a rewrite **after** this spec ships — with the framing from §3. Create:

- `docs/marketing/social-media/publish-kits/2026-05-15-connect-your-agents-launch.md`
  - Twitter: 4-tweet thread + reply variants
  - LinkedIn: long-form personal + short company post
  - Instagram: single-image carousel (4 slides) + caption
  - TikTok: 30s hook script using the screen recording

Slot this kit into the active **Guerrilla Seed Campaign** (`docs/marketing/social-media/publish-kits/2026-03-12-buildos-guerrilla-seed-campaign.md`) at the next open week. Reference: that file already has weekly themes; check the table and book the slot.

### Acceptance criteria

- [ ] One source recording (≤ 60s, 1080p, captioned).
- [ ] Four platform-specific cuts/captions.
- [ ] Publish kit linked from `/integrations` rebuilt page (in the hero clip slot).
- [ ] Posts use **§3 language**, never "external agent call gateway."

### Risk

Low — but capture early. Don't ship Workstream B without the hero clip slot ready.

---

## 10. Workstream G — Future-proofing notes (track, don't build)

These belong in this spec's neighborhood but are **out of scope** for the immediate ship. Capture them so we don't lose track when promo lands.

1. **Per-tool doc pages.** When traffic justifies it, split §5.4 into `apps/web/src/content/docs/connect-agents/{claude-code,cursor,claude-desktop,custom-http,openclaw}.md`.
2. **First-class Claude Code skill.** A skill that wraps `call.dial → tools/list → tools/call → call.hangup` into a one-line "use BuildOS" skill the user can drop into `~/.claude/skills/`. This is the next-best lever after promo. Track in `docs/marketing/strategy/`.
3. **Onboarding "wire it up" branch.** When a user picks `intent_stakes.intent === "organize"` and has > 3 projects after capture, consider showing the agent-keys callout earlier (between `notifications` and `ready`) — they're the highest-likelihood "I want my AI tools on this" persona. **Do not build until §4 ships and we have data.**
4. **OAuth-style install flow.** Today users paste env vars. Eventually a one-click "Authorize Claude Code in BuildOS" deeplink. Tracked in OpenClaw connector spec.
5. **Usage analytics for promotion.** Add a `/admin/agent-keys` view that shows total keys, weekly active keys, top tools by name, write volume by tool. Helps measure whether this works.

---

## 11. Sequencing and ownership

| Phase | Workstream                                | Order | Owner | ETA target |
| ----- | ----------------------------------------- | ----- | ----- | ---------- |
| 1     | A. ReadyStep callout                      | 1st   | DJ    | 1 day      |
| 1     | E. AgentKeysTab polish                    | 1st   | DJ    | 1 day      |
| 1     | C. `connect-agents.md` rewrite            | 1st   | DJ    | 1 day      |
| 2     | D. OpenClaw doc soften + relocate         | 2nd   | DJ    | 0.5 day    |
| 2     | F. Demo asset capture                     | 2nd   | DJ    | 1 day      |
| 3     | B. `/integrations` rewrite (with clip)    | 3rd   | DJ    | 2 days     |
| 4     | F. Publish kit + post launch              | 4th   | DJ    | day-of     |

Total elapsed estimate: 5–6 working days, single-builder.

**Critical path:** Workstream B can't ship without F. Workstream F can't ship without C and E (the surfaces it shows). Workstream A can ship independently and probably *should* ship first as a one-line PR.

---

## 12. Open questions

1. **Do we put the `/integrations` page on the marketing site nav or only link to it from posts?** Today it's not linked from the public homepage. Recommendation: add to footer; do not promote to top nav. Keeps top nav clean, matches anti-AI doctrine.
2. **Per-tool doc pages now or later?** Spec says later. Re-evaluate after the launch post ships if traffic warrants.
3. **Should the ReadyStep callout track click-through?** Probably yes — but the existing onboarding telemetry doesn't have a clean event for "clicked a 'what to do next' link." Punt to Workstream G.
4. **What do we do about `docs/marketing/social-media/buildos-agent-keys-twitter-posts.md`?** Recommendation: archive (add `_ARCHIVED-` prefix), reference it from the new publish kit as "v0 phrasing," and write fresh posts using §3.
5. **OpenClaw mention strategy in posts.** OpenClaw is mid-build elsewhere. Recommendation: do not mention OpenClaw in launch posts. Keep the language tool-agnostic. Mention OpenClaw only in the OpenClaw-specific doc and in the per-tool grid on `/integrations`.

---

## 13. Acceptance — full ship

The spec is complete when:

- [ ] A new user can finish onboarding and see the agent-keys callout in `ReadyStep`.
- [ ] `/integrations` reads as "Connect your agents," not "OpenClaw walkthrough."
- [ ] `/docs/connect-agents` has per-tool guidance for Claude Code, Cursor, and Claude Desktop.
- [ ] `docs/integrations/openclaw/setup.md` is OpenClaw-only and points outward.
- [ ] The `AgentKeysTab` tagline and empty state use §3 language.
- [ ] One demo recording exists and renders on `/integrations`.
- [ ] One publish kit exists in `docs/marketing/social-media/publish-kits/2026-05-15-connect-your-agents-launch.md`, slotted into the guerrilla seed campaign.
- [ ] Launch post is live on at least Twitter and LinkedIn, using §3 language.
- [ ] Old `buildos-agent-keys-twitter-posts.md` archived.

---

## 14. Risks and mitigations

| Risk                                                                                                         | Likelihood | Impact | Mitigation                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------ | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/integrations` rewrite ships without the hero clip and feels lighter than the current page                  | Medium     | Medium | Block ship of B until F is captured. F can be a static image fallback for v1 if needed.                                                   |
| New users misinterpret "Connect your agents" as a feature they need before doing anything else               | Low        | Medium | Keep the ReadyStep callout one-line, low-pressure, last in the list. Do not modal it. Do not redirect.                                    |
| OpenClaw shipping its connector mid-launch dilutes the message                                               | Medium     | Low    | Coordinate publish kit timing. If OpenClaw ships within the launch week, fold it into a follow-up post, not the launch.                   |
| A user pastes their token into a chat and complains when it leaks                                            | Medium     | Medium | Existing safety doc is good. Reinforce in §6 and §7. Keep rotate-from-`/profile?tab=agent-keys` one click away.                           |
| `/integrations` SEO ranking drops on rewrite                                                                 | Low        | Medium | Preserve URL. Preserve key headers in body. Add 301-equivalent intent in canonical. Track Search Console weekly post-ship.                |
| The "this works with anything HTTP" claim invites support questions for tools we haven't tested              | Medium     | Low    | FAQ on `/integrations` includes "if you're getting a 401, here's what's wrong" + a pointer to `/profile/agent-keys/[callerId]` audit log. |

---

## 15. Summary

DJ wants to publicly position BuildOS as the **context surface** between his AI agents. The technical foundation is shipped. The gap is discoverability, framing, and per-tool clarity.

This spec closes that gap with **seven small workstreams** (A–G), keeps the surface area tight, locks the language in §3, and ties the launch into the existing guerrilla seed campaign. Ship A + E + C first as a single small PR. Ship B + D + F as the launch PR. Promote with the publish kit in F.

The spec deliberately does not invent new features. The product is ready. The packaging is the work.
