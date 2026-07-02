<!-- docs/specs/buildos-corsair-plugin-priority-matrix-2026-05-21.md -->

# BuildOS × Corsair Plugin Priority Matrix

**Status:** Draft architecture/spec
**Date:** 2026-05-21
**Owner:** BuildOS
**Related:** `docs/specs/buildos-mcp-server-spec-2026-05-21.md`, `docs/marketing/strategy/ai-influencer-plugin-stack-map-2026-05-21.md`, `ai-influencers.md`

## 1. Decision Summary

BuildOS does not build third-party plugin integrations. Corsair (DevJane's progressive-disclosure plugin platform) is the integration layer for all external services. BuildOS engineering stays focused on the core thinking/orchestration primitives.

The architectural split:

```text
BuildOS                                Corsair (52-plugin catalog 2026-05-21)
=======                                ======================================
brain dump → projects/tasks            GitHub, Notion, Linear, Slack, Figma,
daily briefs                           Google suite, X, YouTube, Cursor, ...
agentic chat                           (everything third-party)
ontology / context
calendar sync (already native)
email send (already native)
```

User flow:

```text
User connects Corsair account to BuildOS
  → BuildOS stores per-user Corsair token
  → User picks plugins inside Corsair (or BuildOS settings wrapping Corsair)
  → BuildOS agent tools call Corsair endpoints with the user's token
  → Corsair brokers the third-party API call
```

This doc classifies the 52 current Corsair plugins, sets BuildOS surface treatment per tier, and enumerates the open questions for DevJane that must be answered before BuildOS commits Corsair to public demos.

## 2. Why This Architecture

- **Eliminates 52× OAuth app registrations.** Each Google/Slack/Notion/etc. integration normally requires DJ to register a verified OAuth app and own the security surface. Corsair absorbs all of that.
- **Eliminates 52× credential vault burden.** BuildOS does not store third-party tokens.
- **Eliminates 52× per-API maintenance cost.** Plugin API drift is Corsair's problem.
- **Frees BuildOS engineering for core primitives.** The thinking-environment moat is brain dump + ontology + agentic chat, not "we connected to GitHub."
- **Provides credibility surface for free.** Every Corsair-supported plugin becomes a checkbox on BuildOS's integrations page.

Trade: BuildOS is now dependent on Corsair's uptime, latency, and roadmap. Section 10 lists the questions that must be answered before that dependency goes live in public-facing flows.

## 3. Tiering Framework

Plugins are classified along two axes:

1. **AI-influencer relevance** — does this plugin appear in the stack of the 10 target builders in `ai-influencers.md`?
2. **Demo criticality** — does a live BuildOS demo require this plugin to work flawlessly?

| Tier  | Treatment                                                                | BuildOS surface                                                               |
| ----- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| **S** | Demo-critical. Must be tested end-to-end before any influencer outreach. | Featured in onboarding "Connect your stack" step. First-class agent tools.    |
| **A** | Creator workflow. High probability target influencers use these.         | Shown in plugin catalog with usage hints. Default-on in agentic chat.         |
| **B** | Team / business. Enable for completeness; not in core demo path.         | Searchable in catalog. Lazy-load tool surfaces.                               |
| **C** | Long tail. Credibility-only.                                             | Searchable but folded under "Show all 52" expansion. No special tool surface. |

## 4. S-Tier — Demo-Critical (6 plugins)

| Plugin              | Auth                            | Why S-tier                                                                                                                  |
| ------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **GitHub**          | OAuth 2.0                       | 100% of target technical influencers (Riley, Pietro, Simon, Hamel, Swyx, Harrison). Required for any developer-facing demo. |
| **Twitter (X)**     | OAuth 2.0 + paid tier           | 10/10 of target influencers. Required for any "post from BuildOS" or "scan timeline → brain dump" demo.                     |
| **Google Calendar** | OAuth 2.0 (Google verification) | Already native in BuildOS. Universal across targets.                                                                        |
| **Gmail**           | OAuth 2.0 (Google verification) | Already native in BuildOS. Universal across targets.                                                                        |
| **Notion**          | OAuth 2.0                       | Swyx (Latent Space), Pietro, Hamel, Harrison confirmed/likely. Doc/wiki primitive.                                          |
| **Linear**          | OAuth 2.0                       | Harrison Chase confirmed (LangChain). Strongest fit for "BuildOS plans, Linear executes" demo.                              |

S-tier action items:

- Confirm Corsair end-to-end flow works for each (DJ smoke test).
- Build BuildOS settings UI: "Connect [plugin]" → Corsair handoff → return token.
- Build agent tool wrappers that call Corsair with the user's token.
- One full demo recording per plugin before any external pitch.

## 5. A-Tier — Creator Workflow (8 plugins)

| Plugin            | Auth               | Why A-tier                                                                          |
| ----------------- | ------------------ | ----------------------------------------------------------------------------------- |
| **YouTube**       | OAuth 2.0 (Google) | Riley (Codex explainer), Pietro, Rowan, Nick — publishers.                          |
| **Figma**         | OAuth 2.0          | Pietro (MagicPath context), Nick St. Pierre. Designer-facing demos.                 |
| **Slack**         | OAuth 2.0          | Hamel (course communities), Harrison Chase (LangChain Slack). Team adoption signal. |
| **Cursor**        | OAuth / API        | Riley Brown explicitly. AI-coding demo path.                                        |
| **Discord**       | OAuth 2.0          | AI-builder community presence.                                                      |
| **Google Drive**  | OAuth 2.0 (Google) | Universal storage layer.                                                            |
| **Google Sheets** | OAuth 2.0 (Google) | "BuildOS pushes structured data to a sheet" demo.                                   |
| **Calendly**      | OAuth 2.0 / API    | Allie Miller, exec-y influencers.                                                   |

## 6. B-Tier — Team / Business (~17 plugins)

Enable via Corsair; visible in catalog; not in demo path.

- **PM alternates:** Asana, Trello, Todoist, Monday, Jira
- **MSFT stack:** Outlook, Microsoft Teams, SharePoint, OneDrive
- **Code-hosting alternate:** GitLab
- **Business ops:** Stripe, HubSpot, Intercom
- **Meetings / calls:** Zoom, Fireflies, Vapi
- **Devtools / ops:** PostHog, Sentry, Grafana, PagerDuty
- **Data:** Airtable
- **Scheduling alternate:** Cal
- **Creator long tail:** Reddit

## 7. C-Tier — Long Tail (~21 plugins)

Credibility-only. Show in catalog; no special tool surfaces; no onboarding placement.

- **Health / wearables:** Strava, Oura
- **International payments:** Razorpay, DodoPayments
- **Music:** Spotify
- **Weather:** OpenWeatherMap
- **Read-only feeds:** Hacker News
- **Backend search (server-side, not user-facing):** Tavily, Exa, Firecrawl
- **File / messaging long tail:** Telegram, Dropbox, Box
- **Forms:** Typeform
- **Analytics alternate:** Amplitude
- **Twitter alternate:** TwitterAPI.io
- **Email send (already used internally):** Resend

Note: Tavily / Exa / Firecrawl are interesting because BuildOS already uses similar capabilities server-side. If routed through Corsair, BuildOS gets per-user agentic search for free without holding the keys.

## 8. Auth Pattern Inventory

Corsair handles the auth flows; BuildOS needs to know what UX the user sees when clicking "Connect."

| Auth pattern                 | Plugins                                                                                                                                               | Notes                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **OAuth 2.0 (verified app)** | Google suite, Slack, Notion, GitHub, Figma, Linear, Asana, Trello, Monday, HubSpot, Dropbox, Box, Discord, Microsoft suite, Calendly, YouTube, Stripe | Most common. Corsair owns the verified-app registration.                                 |
| **OAuth 2.0 + paid tier**    | Twitter / X                                                                                                                                           | Twitter requires Basic+ tier (≈$100/mo) for app-level posting. Confirm Corsair holds it. |
| **OAuth + org-level**        | Stripe (Connect), Jira (cloud/server)                                                                                                                 | User may need admin in their org.                                                        |
| **API key paste**            | Tavily, Exa, Firecrawl, Resend, OpenWeatherMap, Sentry, PostHog, Grafana, Amplitude, TwitterAPI.io                                                    | User pastes their key into Corsair.                                                      |
| **OAuth + scope-sensitive**  | Reddit (read vs. post), Spotify (user vs. app), Fireflies                                                                                             | Different scopes for different actions; UX matters.                                      |
| **Trivial**                  | Hacker News (public), Vapi, PagerDuty                                                                                                                 | Mostly API key.                                                                          |

## 9. BuildOS Surface Treatment

### 9.1 Settings page — "Integrations"

```text
[ Connect Corsair ]    ← single button replaces 52 plugin buttons

Your connected plugins (via Corsair):
  ☑ GitHub        Connected as @djwayne          Disconnect
  ☑ Notion        2 workspaces                   Disconnect
  ☑ Linear        BuildOS workspace              Disconnect
  ☐ Slack         Not connected                  Connect →
  ...
  [ Show all 52 ]
```

### 9.2 Onboarding "Connect your stack" step

Show S-tier only. Copy: "We'll wire BuildOS to where you already work." One-click Corsair OAuth → plugin picker prefilled with S-tier. A-tier exposed via "Add more."

### 9.3 Agentic chat tool surfacing

- S + A-tier: available by default.
- B-tier: auto-suggested when user mentions plugin name in chat.
- C-tier: requires explicit `@plugin` invocation.
- Tool descriptions / schemas come from Corsair's catalog; BuildOS does not duplicate them in prompts.

### 9.4 Marketing surface

Public integrations page lists all 52 with a "Powered by Corsair" badge on non-S-tier. S-tier shown as "native to BuildOS" in marketing copy, even though the underlying call routes through Corsair — because the connect UX is in-app and the experience is seamless.

## 10. Open Questions for DevJane

Must be answered before BuildOS commits Corsair to public demos. Pressure-test in the next 1:1 with DevJane.

### 10.1 Protocol

- Auth handoff: OAuth-style redirect, embedded iframe, or API token exchange?
- Does Corsair give BuildOS a per-user vault token, or must the user re-auth per plugin call?
- Token lifetime and refresh model?

### 10.2 Plugin invocation

- Stable OpenAPI / MCP / JSON-RPC spec for calling plugins via Corsair?
- Can BuildOS list a user's connected plugins programmatically?
- Tool descriptions / schemas — Corsair-owned, or can BuildOS override?

### 10.3 Performance

- Median latency: BuildOS → Corsair → third-party API → return?
- Demo-acceptable target: <1s for chat tool calls.
- Streaming support for long-running plugin calls?

### 10.4 Reliability

- SLA / uptime commitment?
- Per-plugin status endpoints — can BuildOS surface "Notion plugin is down" cleanly?
- Webhook delivery for async plugin events (e.g., "PR merged" → trigger BuildOS)?
- Rate limits — per user, per plugin, per Corsair tenant?

### 10.5 Commercial

- Pricing model for BuildOS users — per user, per call, flat per integration?
- Whitelabel / co-brand terms? Can BuildOS show "Connect GitHub" without "via Corsair" visible?
- Founder-tier deal for early BuildOS commitment / case-study rights?
- Roadmap visibility — which plugins next, what cadence?

### 10.6 Failure modes

- If Corsair is down, what happens to BuildOS's agentic chat? (Plugin calls fail; chat itself should still work.)
- Migration path if Corsair ever pivots — can BuildOS export user OAuth grants?

### 10.7 Known catalog gaps (from stack-map analysis)

- **LinkedIn** — Allie Miller's primary surface; broadly important for BuildOS marketing too.
- **Instagram** — Nick St. Pierre's primary surface.
- **Substack / Beehiiv** — Swyx, Rowan publishing surfaces.

Raise these with DevJane; they may already be on the roadmap.

## 11. Rollout Plan

### Phase 0 — Pressure-test (this week)

- DJ + DevJane call: walk through §10.
- BuildOS engineer spikes a Corsair handoff for one S-tier plugin (recommend GitHub — simplest OAuth flow, highest value).
- Decision gate: does Corsair beta hold up? If yes → Phase 1. If no → revisit fallback (native build for top 5 only).

### Phase 1 — S-tier ship (2–3 weeks)

- BuildOS settings: "Connect Corsair" + plugin status list.
- Onboarding "Connect your stack" step with S-tier picker.
- Agent tool wrappers for all 6 S-tier plugins.
- Demo recording: agentic chat using GitHub + Notion + Linear in one session.

### Phase 2 — Influencer outreach

- Use `docs/marketing/strategy/ai-influencer-plugin-stack-map-2026-05-21.md` to tailor each pitch: "BuildOS works with _your_ GitHub + Cursor + X today."
- Do NOT claim "52 plugins" in outreach copy. Claim what's been tested.

### Phase 3 — A-tier + catalog (4–6 weeks)

- A-tier plugins added to onboarding and agentic chat.
- Full 52-plugin catalog visible in settings as "Connect via Corsair" badge.
- Public "Integrations" marketing page.

### Phase 4 — B/C-tier (ongoing)

- No active BuildOS work. Plugins inherited as Corsair adds them.

## 12. Related Docs

- `ai-influencers.md` — target influencer list and outreach angles (consider moving to `docs/research/`)
- `docs/marketing/strategy/ai-influencer-plugin-stack-map-2026-05-21.md` — per-influencer plugin stack overlap
- `docs/specs/buildos-mcp-server-spec-2026-05-21.md` — the inverse direction: how external agents call BuildOS
- `docs/specs/buildos-agent-oauth-remote-mcp-spec-2026-05-13.md` — BuildOS agent auth model
