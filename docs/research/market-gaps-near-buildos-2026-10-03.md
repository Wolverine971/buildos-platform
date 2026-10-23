<!-- docs/research/market-gaps-near-buildos-2026-10-03.md -->

# What the market needs that BuildOS is one step from

> Note (2026-10-03, synthesis): the "449 of 660 (68%) via external agents, 1 via BuildOS chat" figure below is a miscount. Re-checked in prod: 277 via outside connectors (42%), 169 from BuildOS's own agent path, 178 api/UI, 38 forms, 1 legacy chat.

Research for DJ, 2026-10-03. No code changes, no paid tests, no LLM API calls. Production was read with SELECT only (`scratchpad/gap_q1.sql`, `gap_q2.sql`).

**Labels.** Every claim carries one of these:

- **[V: source]** — VERIFIED at that source.
- **[V-agent: source]** — verified by one of six research passes run today, which cited the URL.
- **[V-snippet]** — a verbatim quote from a search-result snippet, because Reddit blocked direct fetch.
- **[I]** — INFERRED, meaning my judgment.

**Limits.**

- Reddit could not be opened directly. Reddit quotes come from search snippets or the Arctic Shift archive, so engagement counts are approximate.
- The session's 200-search budget ran out partway through. After that I used direct fetches: HN Algolia, OpenAI forum JSON, the GitHub API, vendor pages, and a live browse of the ChatGPT plugin directory in DJ's Chrome.
- X returned 402 and could not be read.

---

## 0. Five findings that shape everything below

1. **People are asking for an authoritative project state, not memory.** The requests use the same words again and again: "confirmed project state", "A2 superseded A", "Current / Proposed / Superseded", "a lightweight project notebook plus standing rules, rather than hidden memory." Between 2026-08-17 and 2026-10-02 there were at least 10 OpenAI-forum threads on this. OpenAI Support replied to at least 4 of them and committed to nothing. [V-agent: forum threads listed in §1]

2. **Generic AI memory is crowded, and the consumer side is retreating.**
    - Supermemory shut down its Company Brain and Nova (personal) products on 2026-09-09 and refunded users. The founder said "multiplayer agents will be the future" but that they weren't best placed to build it. [V: supermemory.ai/blog/an-update-to-supermemory]
    - About 7 memory plugins are already in the ChatGPT directory. [V-agent: live directory browse]
    - ChatGPT "Dreaming" memory, Claude memory plus memory import, and Gemini import all ship natively. [V-agent]

3. **The ChatGPT directory is a credibility badge, not a funnel.**
    - Bloomberg (2026-03-30): 300 integrations, "not easy for users to find," and they "delivered little traffic to partnering companies." [V: PYMNTS summary of Bloomberg]
    - Developers "can't apply for enhanced distribution, and it's unlikely a plugin will receive it when it first goes live." [V-agent: developers.openai.com/plugins/plugin-guidelines]
    - I found no developer reporting meaningful traction from a listing. [V-agent, search of Indie Hackers/HN/forum]
    - Basic Memory was approved in one week and published no traffic numbers. [V: basicmemory.com listing post]

4. **The platforms are building this, but each inside its own walls and higher tiers.**
    - ChatGPT Space, Pages and Dots are Pro/Business/Enterprise only, so Free and Plus users get none of it. [V-agent: openai.com/index/devday-2026-recap]
    - Notion External Agents covers Claude and Cursor (Codex via API). ChatGPT is not one of them. [V-agent: notion.com/releases/2026-07-01]
    - The Claude Projects redesign (2026-09-17) runs inside Claude only, as a Claude Code beta first. [V-agent: claude.com/blog/projects-redesigned]
    - What remains open is a cross-vendor, visible, user-owned project state for individuals on Free, Plus or Pro plans. [I]

5. **BuildOS already handles supersession, but only for the input nobody uses.**
    - The START HERE writer stamps decisions with dates, keeps the newest version of a restated decision, and preserves struck-through bullets as history. [V: `packages/shared-agent-ops/src/ontology/start-here.ts:10-17, 653, 776-790`]
    - Capture removes lines "the chat answered, contradicted or superseded." [V: `apps/worker/src/workers/chat/checkpoint/capturePrompts.ts:83`]
    - Capture runs only on BuildOS's own chat. Nothing in `checkpoint/` reads connector sessions. [V: grep]
    - In the last 30 days, **449 of 660 project changes (68%) arrived through external agents, and 1 through BuildOS chat.** [V: prod `onto_project_logs.change_source`, 2026-10-03]
    - The supersession logic is therefore wired to an input that carries almost no traffic. [I]

**BuildOS's own data (prod SELECT, 2026-10-03) [V]:**

- **Connector use is DJ alone.** Over 90 days: codex-cli 830 calls (273 writes), chatgpt 606 calls (0 writes), claude 115 calls (42 writes), all from DJ. One non-DJ user connected OpenClaw at some point; nobody else was active in the last 30 days.
- **Collaboration is DJ alone.** Only DJ has multi-member projects (5). There are 7 accepted editor invites. The viewer role has never been used.
- **Public pages are unused.** There are 2, both DJ's, with 0 views all-time.
- **Permission requests:** 0 rows.
- **Non-DJ projects:** 45 of about 64 use the generic `project.base` type. Only 2 have activity spanning 30 days or more.
- **Implication [I]:** there is no organic pull yet for any of these opportunities inside BuildOS. Demand evidence has to come from outside, and every test below has to recruit externally.

---

## 1. Top 5 opportunity gaps, ranked

Scores run 1–5, where 5 is best. For distance, 5 means closest to what BuildOS already has.

| #   | Gap                                                                                                         | Demand | Competition gap | Distance | ChatGPT/MCP fit | Willingness to pay | DJ edge | Total  | Distance class                                           |
| --- | ----------------------------------------------------------------------------------------------------------- | ------ | --------------- | -------- | --------------- | ------------------ | ------- | ------ | -------------------------------------------------------- |
| 1   | **Confirmed project state across AIs** ("pick up anywhere with what's _decided_")                           | 5      | 3               | 5        | 4               | 3                  | 3       | **23** | **ONE STEP**                                             |
| 2   | **Client-visible project state** for consultants, fractional executives and AI implementers                 | 3      | 3               | 3        | 3               | 5                  | 5       | **22** | **FEW FEATURES**                                         |
| 3   | **Maryland/DC/Virginia public and set-aside bid radar** for certified small subcontractors, concierge first | 3      | 4               | 3        | 2               | 5                  | 5       | **22** | **FEW FEATURES** as concierge, **FAR** as self-serve app |
| 4   | **Homeowner renovation source of truth** inside ChatGPT                                                     | 3      | 4               | 3        | 4               | 3                  | 4       | **21** | **FEW FEATURES**                                         |
| 5   | **Cross-vendor agent receipts plus one-click revert** ("since you were away")                               | 3      | 4               | 5        | 2               | 2                  | 3       | **19** | **ONE STEP**                                             |

All scores are [I], judged from the evidence in each section. #2 ranks above #3 on the tie because it reuses #1's core, so it costs less to build marginally and becomes #1's paid tier.

---

### #1 — Confirmed project state across AIs (ONE STEP)

**The need, in users' words**

- "ChatGPT should understand that A and A2 are not two equally valid pieces of memory. A2 superseded A." [V-agent: community.openai.com/t/1390864, 2026-08-17]
- "A confirmed state should remain authoritative until explicitly superseded." [V-agent: community.openai.com/t/1399308, 2026-09-20]
- "I am now spending more time restating context and constructing workarounds than doing the work itself." [V-agent: community.openai.com/t/1401852, 2026-09-29, a report of a Projects regression around 2026-08-31]
- "almost like a lightweight project notebook plus standing rules, rather than hidden memory" [V-agent: community.openai.com/t/1379164, 2026-04-17; OpenAI Support acknowledged it]
- "I gradually moved toward keeping a small evolving project state outside the individual chats… and letting the AI help update it during the work." [V: community.openai.com/t/1390890, 2026-09-01, re-fetched by me: 208 views. OpenAI Support replied 2026-09-08 pointing to Projects, with no timeline.]
- "Right now, the human becomes the copy/paste bridge between both sides" (ChatGPT ↔ Codex). [V-agent: community.openai.com/t/1382150; 297 views]
- r/ChatGPT: "Long ChatGPT chats go bad but starting a new one means losing all your context." [V-snippet: reddit.com/r/ChatGPT/comments/1ry3uxs, 2026-03-19, 130+ comments]
- r/WritingWithAI: "8 months in and I'm done pretending this is a prompting problem...the forgetting." [V-snippet: 1tfo4qk, 2026-05-17, 90+ comments]
- From a developer, but telling: "I've worked out a similar solution. So has the next person… and thousands and thousands of others." [V-agent: github.com/anthropics/claude-code/issues/11455; open, 25 👍, 37 comments]
- HN Ask, paraphrased by my fetch: one user runs Claude and Codex in parallel, and "both tools update a shared markdown file tracking progress, requirements, and decisions." [V: hn.algolia item 46885728, 2026-02-04]

**How often and how badly**

- **Frequency is high.** The OpenAI forum has 10+ threads in 7 weeks. Developer AGENTS.md threads draw 741 points and 285 comments (HN 49760187, 2026-09-18). [V: HN Algolia]
- **Intensity is high for multi-week work.** People build export scripts, "continuity ledgers" and master registers. [V-agent]
- **People pay for workarounds.** MemoryPlugin reports "6,381 users · Customers in 73 countries" at $89–180/yr. [V: memoryplugin.com]

**Who has it**

- Non-developers doing multi-week work who switch between ChatGPT and Claude: renovation, home-energy planning, engineering, nonfiction books, consultants.
- Free, Plus and Pro users, who are outside ChatGPT Space and Business tiers.
- Developers have it too, but they solve it themselves with "just write a file," so they make a poor paying segment. [V-agent: HN Skillsync/Segue threads] [I]

**What exists, and why it falls short**

| Product                                                                      | Shortfall                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT memory "Dreaming" (2026-06-04)                                       | A profile of _you_, not a project's state; ChatGPT only. [V-agent]                                                                                                                                                                                               |
| ChatGPT Projects                                                             | No browsable project state; users report regressions. [V-agent]                                                                                                                                                                                                  |
| ChatGPT Space / Pages (2026-09-29)                                           | Pro, Business and Enterprise only; ChatGPT only. [V-agent]                                                                                                                                                                                                       |
| Claude memory and import (2026-03-02)                                        | Per-project memory you can edit, but import is a one-time copy and other tools can't read it live. [V-agent]                                                                                                                                                     |
| Claude Projects redesign (2026-09-17)                                        | "Project memory every thread reads and writes," but inside Claude, and code-first beta. [V-agent]                                                                                                                                                                |
| MemoryPlugin ($89–180/yr)                                                    | Discrete memories and chat history, not decisions, tasks or a current state. [V]                                                                                                                                                                                 |
| Basic Memory (Cloud $15/seat; in both directories since 2026-07-13)          | **Closest in shape.** Schemas include Task, Person and Client. It is a knowledge base the user curates; it doesn't keep a current state up to date on its own; and it leans toward developers and Obsidian users. [V: basicmemory.com] [I on "doesn't maintain"] |
| Anthropic Productivity plugin                                                | `TASKS.md` plus "workplace memory," a dashboard, `/start` and `/update`. Local files, Claude only. [V: github.com/anthropics/knowledge-work-plugins]                                                                                                             |
| claude-mem (★95.6k)                                                          | Session compression for coding agents. [V-agent: gh API]                                                                                                                                                                                                         |
| Notion MCP                                                                   | Read/write workspace; keeping a state page current is the user's job. [V-agent]                                                                                                                                                                                  |
| Fiction-specific: BookWriter ($17/mo, MCP), Calliope (MCP), Continuity (MCP) | Domain story bibles; they show the shape works over MCP. [V-agent]                                                                                                                                                                                               |

**Verdict [I]:** Generic memory is crowded. A visible, structured, supersession-aware "where we are" that any AI updates as part of doing the work, and that works across vendors, is thin. None of the 20+ products checked keeps a dated Decided / Superseded / Open / Next record that is updated through ChatGPT, Claude and Codex alike.

**What BuildOS already has [V: repo]**

- **START HERE.** Sections for Current state, Decisions (dated, with code-owned stamps), Open questions and Non-goals. Restated decisions collapse to the newest wording, and struck-through bullets are kept as history.
    - `packages/shared-agent-ops/src/ontology/start-here.ts:10-17, 200-215, 653-665, 776-790`
- **Capture.**
    - Removes superseded lines: `apps/worker/src/workers/chat/checkpoint/capturePrompts.ts:83`
    - Staged START HERE reviews: `checkpointCapture.ts:145, 513-518`
- **Resume packet.** `get_onto_project_status` with a START HERE excerpt: `packages/shared-agent-ops/src/gateway/op-execution-gateway.project-status.ts`
- **Remote MCP.** OAuth 2.1, project grants and tool profiles.
    - `apps/web/src/lib/server/agent-call/mcp-connector.service.ts:472-491` (profiles)
    - `oauth-connector.service.ts`, `project-access.service.ts`
- **Idempotent write receipts.** `packages/shared-agent-ops/src/gateway/write-audit.service.ts`
- **Thinking log** of the user's verbatim words: `packages/shared-agent-ops/src/ontology/thinking-log.ts`
- **Freshness radar** that detects stale content: `apps/worker/src/workers/freshness-radar/`
- **START HERE protection.** The gateway refuses to create a second START HERE: `op-execution-gateway.core.ts:437-467`

**Missing features**

1. **A `save_state` connector tool.** It would take the explicit content the AI passes (what's decided, superseded, open and next) and run it through the same capture and narration writer. Today external agents can only make raw `update_onto_document` edits, which skip supersession and date stamps. This also satisfies OpenAI's rule that a plugin must "not pull, reconstruct, or infer the full chat log." [V-agent: plugin guidelines]
2. **A ChatGPT and Claude profile exposing capture, resume and save back** with receipts. The current `chatgpt_data_app` profile only allows read-only search and fetch. [V: `mcp-connector.service.ts:486, 885-1010`]
3. _(Nice to have)_ **A state-diff receipt in each response**: "Decided +2, Superseded 1, Still open 3."

**How it shows up in ChatGPT or Claude [I]**

- **Late in a long chat**, the user says "save where we are to BuildOS." The tool returns a receipt: what's decided, what was superseded, what's next.
- **In a fresh chat**, "pick up the renovation" brings up a resume card with Decided / Superseded / Open / Next.
- **Directory listing name** should lead with the job, since the name weighs heavily in search [I, per Phiture via agent]. For example: "BuildOS — Pick up any project."
- **Starter prompts:** "Save where we are" · "Pick up my book" · "What did we decide about X?"
- **Claude:** list in the Claude Marketplace too. It opened 2026-09-23 with 2,000+ connectors, and submissions opened 2026-09-25. [V-agent: gHacks]

**Size, risk and test**

- **Build size [I]:** about 1–1.5 weeks. It is the existing 10-day plugin plan, with `save_state` wrapping the capture writer instead of document edits.
- **Main risk [I]:** OpenAI or Anthropic close the gap natively. OpenAI Support has acknowledged the request at least 4 times, and Claude Projects is moving toward it. The window is likely 6–12 months. A second risk is getting lost among the memory plugins if it's positioned as "memory."
- **Cheapest 2-week test:** see §2.

---

### #2 — Client-visible project state for consultants and AI implementers (FEW FEATURES)

**The need, in users' words**

- Freelancers disclose AI use "only when asked, as they assume clients can already detect it. Clients, however, are far less confident… and prefer proactive disclosure." [V-agent: arXiv 2603.07459, 2026-03-08]
- r/consulting: "The per-client model makes sense in theory but gets messy fast when you're using Claude for research on three clients in the same afternoon." [V-snippet: 1rdkpfm, about 2026-02, 40+ comments]
- r/ClaudeAI: per-project "Memory (this is current state snapshot, not history log, less than 30 lines)." [V-snippet: 1s594eq, 70+ comments]
- r/ClaudeAI: "Anyone using Claude mainly for project tracking?… take in meeting minutes for logging, more ongoing visibility." [V-snippet: 1t2agqk, 40+ comments]
- **Small-business side.**
    - 76% use AI but "only 14% have it fully embedded." [V-agent: Goldman Sachs 10KSB, snippet]
    - 70% need more training. [V-agent: Thryv 2026-07-09]
    - "I don't know how, and there is nobody to teach me." [V-agent: SF Fed brief 2026-07]
    - Owners pay implementers $1.2k–7.5k/mo on retainer. [V-agent, low-rigor blog sources]
- **Vendors are betting on this.**
    - OpenAI added named external viewers to ChatGPT Sites for client review. [V-agent: omidsaffari.com, 2026-09-03]
    - Asana Client Management reached GA on 2026-09-28: a "branded client portal that replaces the status call," with AI that "drafts client-facing status updates." [V-agent: asana.com]

**How often and how badly [I]:** Moderate frequency. Willingness to pay is the highest of any candidate because the work is billable. I have no direct evidence of how sharp the pain is for freelancers, because the Reddit pass was blocked.

**Who has it:** consultants, fractional executives, agencies, and AI implementers serving small businesses, including DJ (Wayne Strategies, Beyond Exit / Rod). [I]

**What exists, and why it falls short**

| Product                                                                                                                                                       | Shortfall                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT Sites (public beta 2026-07-09)                                                                                                                        | **The main threat.** External viewers, scheduled updates, hosted database. But each client page is a custom app; it sees only ChatGPT work; there's no project model underneath. [V-agent: help.openai.com article; my re-fetch returned 403] |
| Asana Client Management                                                                                                                                       | Requires running the agency inside Asana; no MCP mentioned. [V-agent]                                                                                                                                                                         |
| Client-operations portals: Assembly (formerly Copilot.com; ChatGPT plugin + MCP), HoneyBook (ChatGPT plugin), Bonsai (MCP), SuiteDash, Moxo ($5k+/yr), Plutio | They run invoices, forms and messages, not the state of the work. [V-agent]                                                                                                                                                                   |
| Teamwork.com AI summaries; OzBrain (shared brain, $20–99)                                                                                                     | No client-facing view of current state built from cross-tool AI work. [V-agent]                                                                                                                                                               |
| ChatGPT directory (live search 2026-10-03)                                                                                                                    | "client portal," "share with client" and "status update" returned **no relevant plugins**. [V-agent]                                                                                                                                          |

**Verdict [I]:** Both ends are crowded: portals on one side, Sites as a do-it-yourself page builder on the other. The middle is open: an always-current project record that work from ChatGPT, Claude, Codex or Cursor flows into, published as a client-safe page with "what changed / what's next / what we need from you."

**What BuildOS already has [V: repo]**

- **Public pages with live sync from documents and view counts.** `onto_public_pages.live_sync_enabled`, `view_count_30d`; `apps/web/src/lib/server/public-page.service.ts:93-271`; route `apps/web/src/routes/(public)/p/[slug]/`
- **Project invites with editor and viewer roles.** `apps/web/src/routes/api/onto/projects/[id]/invites/+server.ts:137, 290`
- **Per-agent change ledger with before and after.** `onto_project_logs` (`before_data`, `after_data`, `external_agent_caller_id`, `agent_call_session_id`): `packages/shared-types/src/database.types.ts:14810-14826`
- **Daily brief reads the last 24 hours of logs.** `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts:1687-1699`
- **START HERE, comments** (`onto_comments`) **and the MCP connector.**

**Missing features**

1. **A client view of a project.** A curated, client-safe live page built from START HERE plus the ledger, with private items excluded through a per-item "client-visible" flag. Today public pages are per document, and a viewer invite exposes the whole project and requires an account.
2. **A weekly client update.** A draft built from the ledger ("what changed, what's next, what we need"), approved by the owner, sent by email, and linked to the page.
3. **Client reply and approval capture.** An approve or comment on the page flows back into the project as a decision or task.
4. _(For implementers)_ **An "AI rollout" project template**: audit → roadmap → rollout → wins log.

**How it shows up in ChatGPT or Claude [I]**

- "Send Rod this week's update" produces a draft from the ledger, a receipt, and a client link.
- In the directory, it can own the empty "client update / status report" search.
- It becomes the paid upgrade on top of #1.

**Size, risk and test**

- **Build size [I]:** 2–3 weeks on top of #1.
- **Main risk [I]:** OpenAI ships a "client tracker" Sites template. Confidentiality concerns. A small market that DJ can reach directly.
- **Cheapest 2-week test:** DJ hand-runs it for Rod plus 2 Wayne Strategies clients. Each week he assembles a live-synced status page from BuildOS and sends the link, then tracks `view_count` and replies. Separately, he offers it to 5 peer consultants at $49–99/mo.
- **Pass:** clients open it in at least 3 of 4 weeks, and at least 2 consultants pre-pay.

---

### #3 — Maryland/DC/Virginia public and set-aside bid radar for certified small subs (FEW FEATURES as concierge / FAR as self-serve app)

**The need, in users' words**

- "Most firms have just a few estimators, meaning they physically cannot bid on most of the work available to them." [V-agent: Launch HN Rudus (YC P26), HN 48374528, 2026-06-02, 41 pts]
- 22% of commercial specialty contractors use AI for bid management, and 38% report measurable AI impact (up from 17%). [V-agent: ServiceTitan 2026 Commercial Specialty report, 2026-03-30]
- A preconstruction lead wants AI for "staying organized across multiple projects." [V-agent: r/ConstructionManagers 1vlxbkd, 2026-08-11]
- **Maryland structure.**
    - About 20% of state solicitations are set aside for Certified Small Businesses (construction qualifies up to 50 employees and $7M in sales).
    - VSBE goal 3%; MBE goal 29%.
    - Bids post on eMMA, while Anne Arundel uses its own Harbor system and Baltimore City has a separate page.
    - [V-agent: gomdsmallbiz.maryland.gov; county sites]
- **Funders are interested.** YC's Fall 2026 RFS includes "New Operating Systems for the Physical World." [V: ycombinator.com/rfs] Agave raised a $15M Series A (Accel, 2026-07-07) for contractor back-office work delivered in ChatGPT and Claude via MCP. [V-agent: accel.com]

**How often and how badly [I]:** The trade pain (missed bids, too few estimators) is chronic, and willingness to pay is proven by Townline's tiers. Trade subreddits are hostile to vendors: "There are five of these posts every day." [V-agent: r/Contractor 1se57oq]

**Who has it:** CSB, MBE and VSBE-certified specialty subs under 50 people in the Baltimore/Anne Arundel/DC corridor. [I]

**What exists, and why it falls short**

| Product                                                                                                               | Shortfall                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Townline** (public bids + permits by trade and county; Free / $79/mo / **$299/mo concierge**)                       | **Covers 46 counties in NY, NJ, CT and PA only.** [V: townline.app] The website markets an iOS app; the research pass also found it in a ChatGPT directory search. [V-agent] It proves the format and price. |
| BidIntell (go/no-go triage, $49–179/mo)                                                                               | **Undercuts the earlier Bid Desk idea:** go/no-go is now a $49 product. Traction unproven. [V-agent: bidintell.ai]                                                                                           |
| ConstructConnect ($129–199/mo leads; $10k+/yr premium), GovSpend (MCP), GovTribe and Tenqual (ChatGPT apps), BidPrime | Broad lead databases or government-sales tools, not tuned to local certified subs. [V-agent]                                                                                                                 |
| Pelles, Trunk Tools, BuildingConnected                                                                                | Document review, GC workflows, invite forwarding. [V-agent]                                                                                                                                                  |

**Verdict [I]:** Go/no-go software is crowding. A Maryland, DC and Virginia radar for local public and set-aside bids, sold done-for-you, is open. It is also the only candidate that builds the cross-customer outcome data in a vertical (bids → wins) that the 09-24 moat review called defensible.

**What BuildOS already has [V: repo]**

- One project per bid with START HERE (due date, scope, go/no-go reason).
- Calendar events.
- Public share pages.
- Daily brief: `apps/worker/src/workers/brief/`
- The MCP connector, so a sub can ask ChatGPT "what's due this week?"
- Gmail integration: `apps/web/src/routes/api/integrations/gmail`. It could read eMMA vendor-notice emails. [I]

**Missing features**

- **As a concierge (FEW FEATURES):**
    1. A per-sub profile: trade, certifications, size, geography.
    2. A matching and go/no-go rubric document.
    3. A Monday brief template.
    4. A list of likely primes for each bid, for outreach to them.
    - DJ does intake by hand. eMMA's public list sits behind bot detection, so it must not be scraped. [V-agent]
- **As a self-serve ChatGPT app (FAR):** ingestion from eMMA, Harbor, Baltimore City and the counties; a bid database shared across tenants; automated matching.

**How it shows up [I]:** Not through the directory at first. It's a Monday email brief, plus a connector the sub's own ChatGPT can query. Later, "Maryland Bids" could become a vertical ChatGPT app: Townline for the DMV.

**Size, risk and test**

- **Build size [I]:** concierge setup 2–3 days; self-serve app 6–10 weeks.
- **Main risk [I]:** it's a services business that consumes DJ's hours; local sources are scattered; and it does little for BuildOS's own growth.
- **Cheapest 2-week test** (the construction research pass proposed this):
    - Pick one trade, for example electrical, painting or roofing.
    - Do 10 discovery calls through DJ's network and Maryland's certification directories, not Reddit.
    - Show a sample Monday brief of 3–5 matched bids, each as a BuildOS project with a share link.
    - **Pass:** 3 paid commitments at $149–299/mo.

---

### #4 — Homeowner renovation source of truth inside ChatGPT (FEW FEATURES)

**The need, in users' words**

- "I use ChatGPT on a long-running renovation project with hundreds of conversations… ChatGPT can remember a lot, but it does not maintain a clear authoritative project state… status such as Current / Proposed / Superseded… know the difference between 'we discussed this before' and 'this is the final version we are now using'." [V: community.openai.com/t/1397677, 2026-09-15, re-fetched by me; 21 views, 0 replies]
- r/Homebuilding: "I'm catching details that were already discussed or documented before they get installed incorrectly." [V-snippet: 1vl1zfl, 2026-08-11, top comment 167 upvotes]
- r/DIY: existing apps are "either too simple (basic checklists) or aimed at contractors rather than DIYers." [V-snippet: 1u0r4gv, 2026-06-09, 30+ comments]
- r/Remodel, top answer: "spiral bound notebook and a freezer bag with like 400 receipts." [V-snippet: 1ulc3fk]
- Houzz 2026: 22% of homeowners use AI on projects, 79% of them general chatbots, and use falls off after the idea stage (timeline planning 11%). [V-agent: Houzz State of AI 2026]

**How often and how badly [I]:** The pain is intense per person because real money is at stake. Fewer people have it, and each project is episodic.

**Who has it:** homeowners and owner-builders running $25k+ projects across several contractors, mostly on ChatGPT Free and Plus. [I]

**What exists, and why it falls short**

| Product                                                                                     | Shortfall                                                                  |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Buildertrend, JobTread, Houzz Pro, Projul client portals                                    | The contractor's view of one contractor's job. [V-agent]                   |
| HomeZada ($99–189/yr)                                                                       | Home records and budget; not a decision log, not in ChatGPT. [V-agent]     |
| ChatGPT directory: HomeBuddy ("Plan and price home projects"), Angi, Thumbtack, visualizers | Stop at hiring and pricing. A "Houzz" search returned no plugin. [V-agent] |

**Verdict [I]:** Open. Nothing in ChatGPT holds the homeowner's single source of truth across all their contractors. It is also a strong demo vertical for #1's supersession feature.

**What BuildOS already has [V: repo]**

- Projects with a `type_key`, a document tree, risks, milestones and calendar.
- Assets and images (`onto_assets`; connector tools `search_onto_assets` and `get_onto_asset`).
- Voice capture and START HERE Decisions.
- Metrics tables `onto_metrics` and `onto_metric_points` exist. Whether they fit a budget is unverified. [I]

**Missing features**

1. A per-item decision register (Current / Proposed / Superseded) for selections and specs. This builds on #1.
2. A budget and change-order ledger. There is no money entity today. [V: no budget column in `onto_*` types]
3. Contractor contacts and commitments. `onto_actors` are BuildOS users; there's no entity for outside contacts. [V: schema]
4. Intake of receipts and photos from chat into linked assets.

**How it shows up [I]:** In the directory, under searches like "renovation" and "home project." In conversation: "the tile guy changed his quote, update the reno" produces a decision marked superseded, the budget change and a receipt.

**Size, risk and test**

- **Build size [I]:** about 3 weeks on top of #1.
- **Main risk [I]:** built-in churn when the project ends; consumer acquisition cost; weak directory traffic.
- **Cheapest 2-week test:**
    - Make a landing page and set up 3–5 real renovations by hand through DJ's local network.
    - Post helpful replies in the 1397677 thread and in renovation subreddits.
    - **Pass:** 3 homeowners still using it after 2 weeks, and 2 willing to pay $15–20/mo for the length of their project.

---

### #5 — Cross-vendor agent receipts plus one-click revert (ONE STEP)

**The need, in users' words**

- "An AI agent deleted our production database… No confirmation step." [V-agent: HN 47911524, 2026-04-26, 860 pts / 1,032 comments]
- "launch 826 parallel agents… roughly USD 78,000 and deleting all records of what was done." [V-agent: HN 49861047, 2026-09-26]
- "Add an option to trust specific connectors… so I don't need to manually approve every call." [V-agent: community.openai.com/t/1359246, 12 replies]
- A Claude Desktop request for an "Audit/log of auto-approved write calls," closed as not planned. [V-agent: anthropics/claude-code#79734, 2026-07-21]
- "8 parallel cards means 8x the diffs to read" / "how people accept a nights worth of agent activity." [V-agent: HN 48239413, 263 pts]
- "I kept finding out what my agents did after the fact." [V-agent: HN 47413969, 1 pt]
- Greylock's "Rogue Agents" (2026-09-10) asks for "a new primitive of delegation provenance." [V-agent: greylock.com]

**How often and how badly [I]:**

- Incidents draw huge engagement, but products built for this get 1–24 points. HN has 132 "audit trail for AI agents" stories since 2025-07, and the top one scored 24 points (Ponytrail). [V: HN Algolia]
- Users don't shop for this. What they ask for is to let low-risk writes through, keep a readable log, and allow undo. Approval fatigue is as loud as fear.

**Who has it:** anyone letting two or more vendors' agents write to their own stuff. In practice that is DJ and power users today. [I]

**What exists, and why it falls short**

- **Inside single vendors:**
    - ChatGPT Dots: Activity View plus Custom Rules (act / ask first / never), OpenAI-only. [V-agent]
    - Notion: "every agent run is logged, and all changes are reversible"; the audit log is Enterprise-only. [V-agent]
    - monday: Activity tab. Linear: agent sessions. GitHub: Mission Control. [V-agent]
- **Enterprise MCP gateways:** Runlayer ($30M A), MintMCP, Obot, Docker. These are raw logs for IT. [V-agent]
- **Standalone approval layers are failing:**
    - Relay.app shut down in Sept 2026.
    - HumanLayer pivoted to a coding IDE.
    - LangChain Agent Inbox was archived on 2026-09-20.
    - [V-agent]
- **Verdict [I]:** A cross-vendor, user-owned, readable "what changed, by which agent, revert" feed for non-code work is open, but as a _feature_, not as a standalone product.

**What BuildOS already has [V: repo]**

- **Per-agent ledger with before and after:** `onto_project_logs` (`database.types.ts:14810-14826`).
- **Tool-execution receipts:** `agent_call_tool_executions` via `write-audit.service.ts`.
- **Per-connection activity page:** `apps/web/src/routes/profile/agent-keys/[callerId]/`, loaded in `caller-provisioning.service.ts:1600-1630`.
- **Permission requests:** `apps/web/src/lib/server/agent-call/permission-requests.service.ts`, with routes `profile/agent-keys/[callerId]/requests/`. Zero prod rows so far.
- **Document versions:** `packages/shared-agent-ops/src/ontology/versioning.service.ts`.

**Missing features**

1. **A per-project "who changed what" feed with one-click revert** from `before_data`.
2. **A "since you were away" section** in the daily brief and the resume packet. The brief selects logs without `change_source` or `external_agent_caller_id`, so it can't say "Codex did X." [V: `ontologyBriefDataLoader.ts:1691-1693`]
3. **A sealed version for each connector save.** Today an agent's edit is merged into the owner's version within the merge window. [V: `versioning.service.ts:27-107`; prior plan page]

**How it shows up [I]:** It isn't something people search for. It appears as the receipt on every #1 save and as "since you were away: Claude did 3 things, ChatGPT did 1, 1 needs you" when a project is resumed.

**Size, risk and test**

- **Build size [I]:** about 1 week.
- **Main risk [I]:** the platforms ship native receipts, and there's no buyer for this on its own.
- **Test:** ship it inside #1's pilot and measure whether testers open it or revert anything. Don't test it separately.

---

## 2. Recommendation: the #1 bet

**Bet on #1, "Confirmed project state across AIs."** In the user's words: _start a new chat anywhere without starting over, with what's decided and not just what was said._ Make #5's receipts part of every save, and make #2's client page the paid tier.

**Why [I]:**

- **It has the most, and most recent, demand evidence:** 10+ OpenAI-forum threads in 7 weeks, a reported Projects regression, and Reddit threads with 130+ comments.
- **Users ask for a feature BuildOS has already built:** dated decisions, newest-wins, struck-through history, and capture that removes superseded lines.
- **The gap is structural.** OpenAI's answer (Space, Pages, Dots) is Pro/Business-only and ChatGPT-only. Claude's is Claude-only. Memory products store facts, not state.
- **It's ONE STEP away:** a `save_state` tool that runs the existing capture writer, plus the 3-workflow plugin profile.
- **DJ is already its most extreme user:** 68% of his project changes come from external agents. That is a true FDE story: "I built the state layer my own agents write to."

**How it relates to the current plugin plan (capture → resume → save back): it reinforces the plan, with four changes.**

1. **Make save back run through the START HERE capture writer, not document edits.** The product's noun becomes "project state (decided / superseded / open / next)," not "memory" or "save this conversation." That is what sets it apart from the roughly 7 memory plugins already listed.
2. **Pass explicit content in `save_state`.** OpenAI forbids reconstructing the chat, so ChatGPT must pass the decisions and state itself. That fits the plan's capture step. [V-agent: plugin guidelines]
3. **Don't count on the directory for users.** Submit to both ChatGPT and Claude the same week as credibility badges, and recruit pilots directly (below). The plan's "pilot where writes already work" holds: Claude, Codex and Claude Code today, and ChatGPT once listed.
4. **Target Free, Plus and Pro individuals,** the people outside Space and Team Tasks, rather than teams.

**Cheapest 2-week test (no paid tests; testers' own models do the reasoning)**

- **Days 1–4.** Build `save_state` behind a flag, wrapping the capture writer around explicit content, and expose the 3-workflow profile in the general connector, where Claude can already write. Until it ships, run a manual version: testers paste their AI's "state summary" into BuildOS, and DJ's capture writes START HERE.
- **Days 1–3, in parallel.** Recruit 10 people with active multi-month, non-code projects:
    - Reply helpfully in the OpenAI-forum threads (1390890, 1390864, 1399308, 1401852, 1402945, 1397677 and others). Give the do-it-yourself method first and a link second, to respect forum norms.
    - Do the same in r/WritingWithAI and r/ChatGPTPro threads.
    - Add 2–3 of DJ's own clients.
    - Landing-page headline: "Start a new chat without starting over."
- **Days 5–14.** Measure "second useful sessions," meaning a fresh session that resumes and then saves state. Use the tool log (`agent_call_tool_executions`) plus `onto_project_logs`.
- **Pass:** at least 5 of 10 testers complete 2 or more resume→save cycles, and at least 3 pre-pay or commit to $10–15/mo.
- **Fail:** fewer than 3 come back for a second session. Then pivot the same engine to #2 (DJ's clients) or #4 (renovation) as a vertical demo.
- **Cost:** $0 in test spend. BuildOS's own capture calls run on the existing cheap model at a few cents per save. [I]

**Ambitious version, for DJ to choose:** run #1 and a #3 concierge in parallel. #1 is the product bet that spreads; #3 is the cash bet that builds data and uses the same engine (each bid is a project with a state). The lean version is #1 alone.

---

## 3. Kill list: tempting, but crowded or far

| Idea                                                                   | Who owns it                                                                                                                                                                                                                                                                                             | Status                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Generic cross-AI memory ("remember me everywhere")                     | ChatGPT Dreaming; Claude memory and import; Gemini import; MemoryPlugin (6,381 users); Basic Memory (both directories); Mem0 (Claude connector); about 7 memory plugins in the ChatGPT directory; Anthropic Productivity plugin; claude-mem ★95.6k. Supermemory **retreated** to its API on 2026-09-09. | [V / V-agent]                    |
| Developer session handoff, AGENTS.md sync, coding-agent boards         | AGENTS.md standard (Claude Code reads it as of 2026-09-18); ruler and rulesync; GitHub Agent HQ; Linear; Jira agents; Conductor; Codex `/agents`. **Vibe Kanban (28k★) shut down 2026-04-10; Terragon shut down.**                                                                                      | [V-agent]                        |
| Standalone approval / human-in-the-loop layer                          | Relay.app shut down; HumanLayer pivoted; LangChain Agent Inbox archived; vendors ship it natively (Dots Custom Rules, Notion reversible runs)                                                                                                                                                           | [V-agent]                        |
| Team "multiplayer" agent workspace                                     | ChatGPT Space + Dots + Team Tasks (2026-09-29); Notion External Agents (June 2026); Ando (2026-09-24); Viktor ($75M Series A). YC asks for it, and the platforms are already there.                                                                                                                     | [V-agent]                        |
| Job-search tracking                                                    | Huntr ($40/mo Pro); Jobright (3M+ users); Teal; Simplify; JobLoop, Indeed and LinkedIn in the ChatGPT directory                                                                                                                                                                                         | [V-agent]                        |
| Fiction-writing continuity                                             | Sudowrite; Novelcrafter; BookWriter (MCP, $17/mo); Calliope (MCP); Novelist plugin in ChatGPT. Nonfiction "book as a project" is a pilot vertical for #1, not a separate bet.                                                                                                                           | [V-agent]                        |
| Job memory and paperwork for remodelers and residential GCs in ChatGPT | Handoff ($119–719/mo, MCP, Daily Logs, Change Orders, Client Portal); JobTread (ChatGPT app + MCP); CompanyCam (MCP beta); Constructable (ChatGPT + Claude); WhatSync Construction (ChatGPT); Jobber (ChatGPT app)                                                                                      | [V: handoff.ai/pricing; V-agent] |
| Bid go/no-go SaaS (the 09-24 Bid Desk framing)                         | BidIntell ($49–179/mo); Pelles; BuildingConnected. This **revises** the moat review's "open slot" claim.                                                                                                                                                                                                | [V-agent]                        |
| Takeoff and estimating AI                                              | Togal ($299/user/mo); Beam/Attentive (1,200+ customers); Rudus (YC P26). Needs computer vision.                                                                                                                                                                                                         | [V-agent]                        |
| Client-operations portals                                              | Assembly (ChatGPT plugin + MCP); HoneyBook (ChatGPT plugin); Bonsai (MCP); SuiteDash; Moxo; Plutio; Asana Client Management                                                                                                                                                                             | [V-agent]                        |
| Self-serve small-business "AI employee"                                | Claude for Small Business (25+ connectors); OpenAI ChatGPT for Small Business; Lindy; Sintra; Marblism; Motion. Jobber, Housecall Pro and ServiceTitan bundle AI free or cheap.                                                                                                                         | [V-agent]                        |
| ADHD / executive-function planner                                      | Tiimo; Saner.ai (claims 100k+ users); Goblin.tools; Motion. Demand is very high, but willingness to pay tops out around $5–16/mo and DJ has no edge here.                                                                                                                                               | [V-agent] [I on edge]            |

---

## 4. How this bears on the earlier strategy work

- **"Orchestration has no moat" (09-24): confirmed.** Coding-agent orchestration is a graveyard, and non-code orchestration is being taken by Space and Notion. [V-agent]
- **"Defensible context = cross-customer outcome data in a vertical": partly confirmed.** Only #3 builds that kind of data. #1's edge is narrower: it's cross-vendor and below Pro/Business tiers, a window rather than a moat. [I]
- **Bid Desk: corrected.** Go/no-go is now a $49 product (BidIntell). The open part is the local Maryland/DC/Virginia public and set-aside radar, sold done-for-you. [V-agent]
- **Stewards: compatible.** A steward is #1 as seen from inside BuildOS. #1 is the steward's state, made writable by outside agents. [I]
- **The prior plugin plan: reinforced and sharpened** (§2). Its point about read-only access for Plus and Pro before listing still applies.
- **One conflict to resolve:** one research pass read the DevDay recap as putting MCP Events on all plans. The prior session's verified docs say Work chats and dots only. Keep treating it as Work and dots only until checked. [conflict noted]

---

## 5. Sources

**Repo and production [V]**

- `packages/shared-agent-ops/src/ontology/start-here.ts`
- `apps/worker/src/workers/chat/checkpoint/{capturePrompts,checkpointCapture}.ts`
- `packages/shared-agent-ops/src/gateway/{op-execution-gateway.project-status,write-audit.service,op-execution-gateway.core}.ts`
- `apps/web/src/lib/server/agent-call/{mcp-connector.service,permission-requests.service,caller-provisioning.service}.ts`
- `apps/web/src/lib/server/public-page.service.ts`
- `apps/web/src/routes/api/onto/projects/[id]/invites/+server.ts`
- `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts`
- `packages/shared-types/src/database.types.ts`
- Prod SELECTs: `scratchpad/gap_q1.sql`, `scratchpad/gap_q2.sql` (2026-10-03)

**External, fetched by me [V]**

- community.openai.com/t/1390890 and /t/1397677
- memoryplugin.com
- basicmemory.com and its directory-listing post
- supermemory.ai/blog/an-update-to-supermemory
- pymnts.com (summary of Bloomberg, 2026-03-30)
- github.com/anthropics/knowledge-work-plugins/productivity
- townline.app
- handoff.ai/pricing
- ycombinator.com/rfs
- github.com/openclaw/openclaw (391k★; ClawHub marketplace)
- clawhub.ai (Memory LanceDB is the most-downloaded plugin shown, 14.6k)
- HN Algolia queries: AGENTS.md (282 stories since 2025), "audit trail AI agents" (132), "AI memory across ChatGPT Claude" (28), HN items 46885728 and 48291522

**External, verified by research passes [V-agent]**

- Every URL cited inline above. The full source lists are in the six research-agent reports from this session.

**Distribution side note [V]:** OpenClaw (391k★) runs its own marketplace, ClawHub, where the top plugin shown is a memory plugin (Memory LanceDB, 14.6k downloads). One non-DJ BuildOS user connected OpenClaw. A ClawHub skill could be a cheap second channel for #1 alongside the ChatGPT and Claude directories. [I]
