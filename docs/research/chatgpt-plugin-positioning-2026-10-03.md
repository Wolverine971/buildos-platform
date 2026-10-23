<!-- docs/research/chatgpt-plugin-positioning-2026-10-03.md -->

# BuildOS in the ChatGPT plugin directory: value prop, positioning, launch features

Research date: 2026-10-03. Scope: demand research, the live ChatGPT plugin directory, competitor homepages, the BuildOS repo, and SELECT-only production queries. No code changed, no paid or LLM tests run.

**Labels**

- **VERIFIED**: seen on a live page, in OpenAI's docs, in the repo, or in a production query. The source is named.
- **INFERRED**: my judgement from the evidence.
- **V2 / snippet**: seen only through a secondary page or a search snippet.

**Coverage limits**

- The session's web-search budget (200 calls) ran out mid-research.
- X/Twitter is barely sampled (1 tweet).
- No third-party directory traffic analysis was found.
- openai.com and help.openai.com returned 403 for the competitor sweep. OpenAI's plugin rules came from the raw markdown on developers.openai.com.
- Directory listings were read in Chrome while signed in to DJ's ChatGPT account. Rankings may be personalised.
- Production query files are in this scratchpad folder: `r_users.sql` and `r_q2.sql` through `r_q13.sql`.

---

## 0. The answer in five lines

1. **Value prop:** BuildOS keeps each project's decisions, current state and next step outside the chat, so a new conversation picks up the work instead of starting over. Saving the update is part of the conversation, with a receipt.
2. **Listing:** display name "BuildOS". Subtitle "Pick up projects in a new chat" (30 characters).
3. **Launch with three things:**
    - A one-call resume ("pick up my project")
    - A one-call save-back into the project's Decisions, Current state and Next step, with a receipt
    - Capture of a conversation into a new project. This one is already built.

    Ship them as a small curated ChatGPT tool set, with write access on selected projects as the default.

4. **Verdict on the current hypothesis:** keep its loop (capture, resume, save back) and its north-star. Change its headline.
    - "Turn this conversation into a project…" leads with capture.
    - Capture is the most crowded promise in the directory. Asana's listing subtitle is literally "Turn chats into actions".
    - Capture is also not BuildOS's bottleneck. 15 of 48 signups in 2026 created a project on day one, but only 2 came back on a second day.
    - Lead with what survives the chat: _what you decided, and where things stand._
5. **Most surprising finding:** BuildOS's background "keep it current" machinery is almost unused, even by DJ.
    - Only 2 of the 217 review suggestions created in the last 30 days were applied; 136 are still pending.
    - Meanwhile 414 of 660 project changes came from AIs saving as they worked: 277 by outside agents (mostly Codex CLI) and 137 in BuildOS's own chat.
    - Low-effort accuracy comes from saving in the flow, not from a review queue.

---

## 1. Demand: what people struggle with, in their own words

Method: about 170 items read closely, out of roughly 560 Reddit posts, 211 OpenAI forum posts, about 350 Hacker News comments, about 1,700 YouTube comments and 4 Product Hunt pages. About a third of the "re-explain / AI memory" posts were written by people launching memory tools. That is still a demand signal, but it inflates the counts.

### Themes by how often they came up (VERIFIED counts; sampling is uneven)

| #   | Theme                                                                                     | Items (of ~170) | Strongest quote                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Long chats degrade or hit the length limit, forcing a new chat                            | ~55             | "for a complex project, starting a new chat is not really the same as continuing the existing conversation." ([OpenAI forum, 2026-08-27](https://community.openai.com/t/youve-reached-the-maximum-length-for-this-conversation-but-you-can-keep-talking-by-starting-a-new-chat-but-how-do-you-actually-continue-a-complex-project/1392865))  |
| 3   | Re-explaining every session; hand-made handoff summaries                                  | ~45             | "I have to ask the old chat for a handoff summary, copy it, paste it into the new chat, and rebuild enough context to keep going… I'm not looking for better prompt advice or bigger context windows." ([r/ChatGPT, Pro user, 2026-06-01](https://www.reddit.com/r/ChatGPT/comments/1ttkvb6/do_other_chatgpt_pro_users_constantly_restart/)) |
| 2   | Lost decisions and plans; can't find the old chat                                         | ~35             | "finding stuff feels harder than just re-explaining everything from scratch." ([r/ChatGPT, 2026-07-16](https://www.reddit.com/r/ChatGPT/comments/1uxze41/anyone_elses_chatgpt_history_basically_a_black/))                                                                                                                                   |
| 4   | Limits of ChatGPT Projects and memory (~10 of these are praise)                           | ~35             | "It remembers who I am. It doesn't remember what I decided or why… It suggests the same options I already killed." ([r/ChatGPT, 2026-04-10](https://www.reddit.com/r/ChatGPT/comments/1shxujg/chatgpts_memory_got_way_better_but_i_still_hit_a/))                                                                                            |
| 5   | Chat sprawl; exporting to Notion or Obsidian                                              | ~30             | "it feels impossible to "resume" a line of thinking without starting over." ([r/ChatGPTPro, 2026-01-25](https://www.reddit.com/r/ChatGPTPro/comments/1qmkmo2/how_do_you_organize_chats_as_a_power_user/))                                                                                                                                    |
| 6   | Several AI tools, and context that doesn't carry between them (about half vendor-written) | ~28             | "Discuss the problem in normal ChatGPT. Reach a concrete implementation plan. Open Codex… Re-explain or copy the relevant context" ([OpenAI forum, 2026-09-02](https://community.openai.com/t/feature-request-seamless-chatgpt-codex-handoff-with-shared-vs-code-context/1394261))                                                           |
| 7   | Brainstorm to plan to follow-through (including ADHD)                                     | ~18             | "What have we finished? What are we working on now? What should we do next?" ([OpenAI forum, 2026-08-12](https://community.openai.com/t/persistent-active-long-running-work-checklist-for-chats-and-projects/1390165))                                                                                                                       |
| 9   | Apps and connectors inside ChatGPT: friction and reliability                              | ~14             | "ChatGPT currently asks for manual confirmation every time it updates Notion page properties… the repeated modal makes the workflow unnecessarily slow." ([OpenAI forum, 2026-05-21](https://community.openai.com/t/trusted-approval-policy-for-repeated-connector-write-actions/1381447))                                                   |
| 8   | Consultants and founders doing client work across sessions                                | ~10 (weakest)   | "I don't want to have to explain in detail who is John, what is project A and what John was working on before." ([HN, 2026-03-01](https://news.ycombinator.com/item?id=47208260))                                                                                                                                                            |

### What the evidence says (INFERRED from the table above)

- **Themes 1–4 make up most of the pain.** They are one problem seen from four sides: the chat is the only place project state lives, and chats end.
- **Users separate memory from project state.**
    - Memory means who I am and what I prefer. People increasingly say ChatGPT handles this well.
    - Project state means what we decided and why, where we are, and what's next. People say nothing handles it.
    - One forum user stated BuildOS's job almost word for word: "a new chat does not necessarily need the entire old conversation. It needs a reliable way to recover the current state of the work from artifacts outside the conversation." ([OpenAI forum, 2026-09-01](https://community.openai.com/t/youve-reached-the-maximum-length-for-this-conversation-but-you-can-keep-talking-by-starting-a-new-chat-but-how-do-you-actually-continue-a-complex-project/1392865/5))
    - Another: "There is no native way to promote finalized decisions or content from a chat into project knowledge." ([OpenAI forum, 2026-01-17](https://community.openai.com/t/what-s-the-point-of-projects-if-they-can-t-cross-reference-chats-big-untapped-potential/1073347/31))
- **Someone described BuildOS's loop unprompted, as something they wanted from Notion:** "I discuss and develop projects directly with ChatGPT, and it automatically updates the corresponding pages and subpages in a structured Notion workspace (like a project folder with plans, notes, and logs)." ([r/ChatGPTPro, 2025-10-19](https://www.reddit.com/r/ChatGPTPro/comments/1oayaet/notion_x_chatgpt_how_can_i_synchronize_my/))

### Counter-evidence (VERIFIED quotes)

- **"Projects already solve this":**
    - "I put all context into custom instructions in Projects… I don't re-explain anything." ([r/ChatGPTPro](https://www.reddit.com/r/ChatGPTPro/comments/1ok44la/do_you_ever_get_frustrated_reexplaining_the_same/nmbogqi/))
    - "That's what projects are for." (HN id 47205992)
- **"Just keep a markdown journal"** is a common answer from developers.
- **Some people don't want hidden memory:** "I absolutely don't want things to get added to some memory behind my back." (HN id 49052275)
    - Design implication (INFERRED): every save must be visible and chosen by the user.
- **Tool fatigue:** "notion i rebuilt 3 times and used twice."
- **The platforms are closing the gap:** ChatGPT Pages and Space (see §3), reports of an OpenAI "Personal Wiki", and Claude's memory import.

### Words people actually use

Counted across 1,391 AI-related documents (VERIFIED counts).

- **The words to use:** "decisions" (255), "new chat" (233), "summary" (213), "lost" (192), "handoff" (142), "every time" (134), "start over / from scratch" (98), "re-explain" (61), "left off / pick up where" (23).
- **Builder words that are rare in users' mouths:** "second brain" (14), "memory layer" (27), "portability / lock-in" (31).

### Who shows up most (VERIFIED from the sample)

- Developers. Biggest group, but they often solve it themselves.
- Heavy Plus/Pro knowledge workers on long research, strategy or design work.
- Founders and owner-operators.
- Writers and worldbuilders.
- ADHD users.
- Non-technical people with long life projects (benefits, housing, legal).
- Consultants are sparse, and their stated blocker is client confidentiality.

---

## 2. How listings win in the directory

### OpenAI's rules (VERIFIED: [plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines), [submission](https://developers.openai.com/plugins/deploy/submission), [submission errors](https://developers.openai.com/plugins/deploy/submission-errors), [MCP review](https://developers.openai.com/plugins/deploy/app-review), [optimize metadata](https://developers.openai.com/plugins/guides/optimize-metadata))

**Listing fields**

- **Display name:** at most 30 characters. Don't add "Plugin", "MCP" or "MCP Server". Avoid generic dictionary words.
- **Subtitle (`shortDescription`):** at most 30 characters.
- **Long description:** at most 4,000 characters.
- **Starter prompts:** at most 3, each at most 128 characters, with no `@mention`. The brief asked for 4–6. OpenAI's limit is 3, so §5 gives 3 for the listing and 3 extra for the long description and test set. Canva's long description already includes "Try prompts like…", so that placement is allowed.
- **Category:** for BuildOS, `Productivity`.

**Copy rules**

- No comparisons, disparagement or unverifiable claims.
- No pricing, trials or promotions.
- No wording in model-readable fields that steers the model away from other plugins.

**Review materials**

- Exactly 5 positive and 3 negative test cases.
- A demo video.
- A reviewer login that works without MFA.
- A domain-verification file.
- Explicit `readOnlyHint`, `destructiveHint` and `openWorldHint` on every tool.
- No screenshots when there is no custom UI.

**Discovery**

- "ChatGPT and Codex decide when to call your tool based on the metadata you provide."
- Build a "golden prompt set" with direct, indirect and negative prompts.
- Tool descriptions should "start with 'Use this when…'".

**Distribution**

- "few plugins will receive enhanced distribution at publication. Developers cannot request enhanced distribution."
- At launch, a new plugin is found only by exact-name search or a direct link (VERIFIED, guidelines plus the Flowlines write-up).
- One listing serves both ChatGPT and Codex.

### Landmines in today's BuildOS package (VERIFIED)

- **The subtitle is too long.** `plugins/buildos/.codex-plugin/plugin.json` has the subtitle "Persistent context for complex project work". That's 43 characters, so final submission would reject it.
- **The listing describes a read-only product.** It declares `capabilities: ["Search","Read"]`, and its long description says only "Search and retrieve…".
- **DJ's ChatGPT connection needs re-auth.** In his account the private BuildOS plugin shows "Authentication update required" (seen by the directory research agent).
- **Tool descriptions don't follow OpenAI's metadata guidance.**
    - None start with "Use this when…".
    - They contain internal wording such as "caller-approved BuildOS scope" and "whitelisted" (`packages/shared-agent-ops/src/gateway/op-execution-gateway.core.ts:309-321`).
    - Read/write hints are already set (`apps/web/src/lib/server/agent-call/mcp-connector.service.ts:330-333`).
- **Team workspaces may block writes.** In Business and Enterprise workspaces, app write actions are off until an admin enables them (V2, [usecarly](https://www.usecarly.com/blog/chatgpt-connectors/)).
    - INFERRED: the first users should be Plus and Pro individuals.

### How the leading productivity listings are worded (VERIFIED, chatgpt.com/plugins, 2026-10-03, rank within Productivity's 665 listings)

| Listing (rank)            | Subtitle                         | Starter prompt shape                                                                                                                                              |
| ------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notion (#4)               | "Notion docs and workflows"      | Specific jobs: "Find the latest decision on pricing for [project]…", "Create a roadmap database… from this list", "Audit our top product docs for outdated info…" |
| Granola (#7)              | "Add your meeting context"       | "Summarize what happened in the Hearthbase deal so far"                                                                                                           |
| Asana (#13)               | "Turn chats into actions"        | "Create a project to track creative requests" / "Create a task to track follow up actions" / "Show me what's on my plate in Asana today."                         |
| ClickUp (#20)             | "Run your projects from ChatGPT" | "What should I work on today?" / "What's blocking my team right now?" / "What did we accomplish this week?"                                                       |
| Trello (#24)              | "Get things done in Trello"      | "Create a Trello board for the Italy travel plan **we just discussed**."                                                                                          |
| Linear (#26)              | "Plan and build products"        | "Triage or update relevant issues for this task with clear next actions"                                                                                          |
| Mem (#78)                 | "Save & Search Notes & Meetings" | none                                                                                                                                                              |
| Basic Memory Cloud (#111) | "One memory for your AI tools"   | —                                                                                                                                                                 |
| Unabyss (#127)            | "Your context layer for AI"      | —                                                                                                                                                                 |
| **Giraffe (#615)**        | "Keep your AI projects clear"    | "Show me where I left off in my most recently updated project, including current decisions and open questions."                                                   |
| **Sonjapgo (#617)**       | "Continue projects with AI"      | "…find my current work, and tell me what I should work on next."                                                                                                  |

**The pattern that works**

- The name is the bare brand.
- 68–70% of subtitles start with a verb ("manage", "search", "create", "turn"), averaging 26 characters.
- Good listings use all 3 prompts:
    - a status question
    - a write action tied to the current chat ("we just discussed")
    - a concrete deliverable
- The long description runs: one sentence on what it does for you, then the capabilities, then a permissions line ("only accesses files available to you").

**What the data shows about memory and resume plugins**

- Two plugins with BuildOS's exact resume pitch, Giraffe and Sonjapgo, are already listed. They sit near the bottom of Productivity.
- Pure "memory" plugins sit at #111 and below. Only meeting-source tools (Granola #7, Krisp #35) rank high.
- INFERRED: a resume pitch alone doesn't earn usage or ranking. The listing needs a reason to install that ChatGPT's own Projects and memory don't already give.

---

## 3. Competitors: who owns which words

### What OpenAI and Anthropic now claim (V2 unless marked)

- **ChatGPT Space** (DevDay 2026-09-29; Pro, Business and Enterprise): "a new collaborative layer where employees, ChatGPT, Codex and Dots can work against the same shared context." A Dot "keeps owners, deadlines and next steps current as priorities shift" ([VentureBeat](https://venturebeat.com/technology/openai-launches-dots-always-on-ai-agent-coworkers-and-chatgpt-space-where-they-can-collaborate-with-human-teams)).
- **ChatGPT Pages:** "documents that update as underlying information changes", with one-click chat-to-Page conversion.
- **Activity View:** "inspect background work and intervene."
- **ChatGPT memory** was upgraded in June 2026 "to keep your context up to date". Projects gained project-only memory (snippet, OpenAI help).
- **Claude:** "picks up right where you left off" ([claude.com/import-memory](https://claude.com/import-memory), VERIFIED). Claude chat and Cowork now share one memory; Claude Code projects have shared thread memory.

### Word ownership (VERIFIED headlines; crowding is INFERRED)

| Word or promise                                                    | Owner(s)                                                                                                                         | Status                                         |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| "never re-explain"                                                 | Unabyss (headline: "Never Re-Explain Yourself to AI Again"), Plurality, Pickup                                                   | Owned                                          |
| "pick up where you left off"                                       | Claude; Giraffe and Sonjapgo prompts                                                                                             | Owned and generic                              |
| "memory", "second brain"                                           | Mem, Reflect, Craft, Mem0, Supermemory, Basic Memory, ChatGPT memory                                                             | Saturated                                      |
| "context"                                                          | Notion, ClickUp, Asana, Atlassian, Tana, Unabyss, Plurality, OpenAI Space                                                        | Saturated                                      |
| "teams and agents" / "agents"                                      | In the headlines of Notion, Asana, Linear, monday and Airtable                                                                   | Saturated, team-focused                        |
| "turn chats into actions / ideas into action"                      | Asana in the directory ("Turn chats into actions"; "go from ideas to action"); Linear; Trello prompts                            | Owned inside ChatGPT                           |
| "keeps itself current / living"                                    | ChatGPT Pages and Dots, Mem ("living picture"), Tana, Unabyss ("self-updating"), Taskade                                         | Claimed by OpenAI on 09-29                     |
| "AI chief of staff"                                                | Mem, Asana Dash                                                                                                                  | Owned                                          |
| "calm / clarity / relief"                                          | Sunsama ("Start Calm…"), Todoist ("Clarity, finally.")                                                                           | Planners, no AI claim attached                 |
| "decisions" as the noun people keep                                | No headline found. Notion uses it in one starter prompt ("Find the latest decision on pricing…"); Giraffe uses it in one prompt. | **Open as a headline word** (see caveat below) |
| "where things stand / current state of the work"                   | No headline found                                                                                                                | **Open as a headline word**                    |
| "thinking environment", "turn messy thinking into structured work" | No other product uses them as a tagline (snippet search). BuildOS's live homepage doesn't use them either.                       | Unused, but generic                            |

**Caveat on "unclaimed":** before calling "decisions / current state" open, I checked the closest products:

- Giraffe and Sonjapgo (decisions and open questions in prompts)
- Notion (a decision-lookup prompt)
- ChatGPT Pages and Space ("next steps current", teams)
- Mem ("living picture of your tasks, projects, and goals")
- Tana ("update your context graph while you talk")

None leads with _decisions and current state of one person's project, readable from any AI_. Every piece exists somewhere; the combination is not claimed as a headline.

### The six candidate promises

Detail is in the competitor research; verdicts are INFERRED.

| Candidate promise                                      | Verdict                                                        | Biggest threat inside ChatGPT                          |
| ------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------ |
| (a) Pick up in a new chat without re-explaining        | Crowded                                                        | ChatGPT Projects, Space, memory                        |
| (b) Stays accurate with little effort                  | Contested since 09-29                                          | Pages and Dots (paid plans, OpenAI-only, team-focused) |
| (c) One project state that all your AIs read and write | Table stakes as a feature; only weakly claimed for one person  | Notion                                                 |
| (d) Turn a messy conversation into a project           | Most crowded                                                   | Asana                                                  |
| (e) Oversight across multiple agents                   | Open but demand unproven                                       | Activity View (Dots only)                              |
| (f) A playbook of what worked, for consultants         | Under-tested (search budget ran out); no consultant tool found | Dots learning, Gemini Skills                           |

---

## 4. What BuildOS actually does well

### Real and working (VERIFIED in the repo)

| Capability                                                                                                                                                                                                                                                                                                                                                                                                                               | Where it lives                                                                                                                                                                                                            | Status for ChatGPT                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **One-call capture into a full project.** `create_onto_project` takes a project, `entities` (goal, plan, task, document, risk, milestone…), `relationships` and a `context_document`, so a project, its structure and its START HERE doc are built in one call. Every write accepts `idempotency_key` and `dry_run`.                                                                                                                     | `packages/shared-agent-ops/src/gateway/op-execution-gateway.mutations.ts:67`; `op-execution-gateway.core.ts:285`; idempotency and dry-run schema at `apps/web/src/lib/server/agent-call/external-tool-gateway.ts:188-209` | In the general profile; not in the `chatgpt_data_app` profile                                                                                  |
| **A project page built for decisions and state.** START HERE has authored sections "What this is", "Non-goals", "Current state", "Decisions" ("settled decisions and one-line rationale, with dates") and "Open questions", plus a managed **State / Now / Next step** header. This maps directly to the user complaint "doesn't remember what I decided or why… suggests the same options I already killed" (Decisions plus Non-goals). | `packages/shared-agent-ops/src/ontology/start-here.ts:10-17, 180-262`                                                                                                                                                     | Readable and editable by connectors                                                                                                            |
| **One-call resume.** `get_onto_project_status` returns the START HERE excerpt, counts, recent changes (each tagged with `change_source`), overdue and due-soon tasks, upcoming events and collaborators.                                                                                                                                                                                                                                 | `packages/shared-agent-ops/src/gateway/op-execution-gateway.project-status.ts:385-466`                                                                                                                                    | In the general profile. Leaks collaborator **email** (`:114-122`), which is a review risk.                                                     |
| **Precise save-back.** `update_onto_document` supports `section_edits` (replace or append by heading) and exact-text `edits`, and refuses large deletions.                                                                                                                                                                                                                                                                               | Tool schema (MCP), `packages/shared-agent-ops/src/ontology/document-edits.ts`                                                                                                                                             | General profile                                                                                                                                |
| **Auto-capture from BuildOS's own chat.** After in-app chats, a checkpoint job writes a near-verbatim thinking log and rewrites START HERE sections. Removals wait for review.                                                                                                                                                                                                                                                           | `apps/worker/src/workers/chat/checkpoint/checkpointCapture.ts:1-13`                                                                                                                                                       | **Does not run for ChatGPT conversations.** It reads only BuildOS `chat_sessions`, so ChatGPT work reaches BuildOS only if the model saves it. |
| **Scoped cross-AI access.** OAuth 2.1, per-project grants, projects created by a connector automatically join its grant, permission requests, an audit trail with source.                                                                                                                                                                                                                                                                | `apps/web/src/routes/oauth/authorize/+page.svelte`; `op-execution-gateway.core.ts:1345, 1458`; `apps/web/src/lib/server/agent-call/permission-requests.service.ts`                                                        | Consent defaults to **read-only, all projects** (`+page.svelte:16-17`)                                                                         |
| **ChatGPT profile today**                                                                                                                                                                                                                                                                                                                                                                                                                | `search` and `fetch` only (`mcp-connector.service.ts:472-560`)                                                                                                                                                            | Read-only by design                                                                                                                            |
| **No in-chat UI**                                                                                                                                                                                                                                                                                                                                                                                                                        | No Apps SDK `outputTemplate` or widget anywhere in the repo (grep)                                                                                                                                                        | Panel and cards are net-new                                                                                                                    |

### What retained users actually use (VERIFIED, production, SELECT only)

Accounts excluded from these counts: DJ, build-os.com addresses, test accounts and example.com accounts (7 in total).

- **There is no independent retained cohort.**
    - Of 118 accounts after exclusions, 48 signed up in 2026.
    - 15 of those 48 created a project, all on signup day.
    - Only 2 were active on 2 or more distinct days; 1 on 3 or more.
    - The most active "non-DJ" accounts own projects named after BuildOS, 9takes and BuildOS investor research, or sit on a DJ-client domain. They are DJ-adjacent.
    - Daily brief emails to non-DJ users: 17 sent to 2 people, **0 opened, ever.**
    - INFERRED: the "second useful session" is unproven for anyone except DJ. That is exactly what the plugin has to prove.
- **DJ, the one retained user, over the last 30 days:**
    - 166 in-app chat messages on 22 days, across 71 sessions (136 tied to a project, 23 general).
    - 46 active projects, 20 updated in the window.
    - 29 of 36 daily brief emails opened.
- **Who writes his project changes (last 30 days, 660 changes):**
    - 277 from outside agents
    - 137 from BuildOS's own chat
    - 172 from the API or UI
    - 38 from forms
    - 35 from other agent calls
    - 1 from the legacy chat path
- **Outside-agent calls by tool:**
    - **Codex CLI:** 538 calls in September across 28 days. Its top operations all-time are `project.status.get` (134), `task.list` (81), `document.update` (78) and `task.update` (72).
    - **ChatGPT:** 175 calls in September across 18 days. **Zero writes, ever.** All-time: `onto.search` 427, `document.get` 77, `project.get` 70.
- **Background "keep it current" machinery is ignored.**
    - Project-review suggestions in the last 30 days: 217 created → 2 applied, 4 addressed, 8 rejected, 67 superseded, 136 pending.
    - All-time: 56 applied out of 547.
    - Project-loop runs in the last 30 days: 64 completed, 14 failed. All-time: 242 failed out of 482.
- **START HERE in practice:** 123 live documents, 14 updated in the last 14 days. 8 thinking logs, all updated in the last 14 days. 40 checkpoint-capture jobs have completed since the feature shipped on 2026-09-23.

**What this means for the reviewer's thesis** (INFERRED): "how little effort it takes to keep the project accurate" is the right advantage. But the mechanism that actually runs is **the AI you're already working with saving as part of the work.** A background reviewer asking for approval is not it. The plugin should make the save a single in-chat step, and the listing must not claim the project "keeps itself current".

---

## 5. Synthesis

### The value prop

**One sentence:** _BuildOS keeps what you decided, where things stand and what's next for each project outside the chat, so your next conversation picks up the work instead of starting over._

**Proof point 1: it keeps decisions, not just memory.**

- **What BuildOS does (VERIFIED):** START HERE has dedicated Decisions (with rationale and date), Non-goals, Current state and Open questions sections, plus a Next step header (`packages/shared-agent-ops/src/ontology/start-here.ts:10-17, 180-262`).
- **Demand (VERIFIED):**
    - "It remembers who I am. It doesn't remember what I decided or why." ([link](https://www.reddit.com/r/ChatGPT/comments/1shxujg/chatgpts_memory_got_way_better_but_i_still_hit_a/))
    - "There is no native way to promote finalized decisions… into project knowledge." ([link](https://community.openai.com/t/what-s-the-point-of-projects-if-they-can-t-cross-reference-chats-big-untapped-potential/1073347/31))
    - "decisions" appeared in 255 of 1,391 documents.
- **Competitor check (VERIFIED):** ChatGPT memory is framed around the person. Giraffe has a decisions prompt but ranks #615. Notion has a decision-lookup prompt but no decision structure is promised.

**Proof point 2: a new chat starts from the current state in one step.**

- **What BuildOS does (VERIFIED):** `get_onto_project_status` returns state, next step, recent changes by source, what's due, and the START HERE excerpt (`op-execution-gateway.project-status.ts:385-466`).
- **Usage (VERIFIED):** it is the most-used operation from DJ's main agent, Codex CLI (134 calls).
- **Demand (VERIFIED):**
    - Theme 1 (~55 of 170 items) plus "It needs a reliable way to recover the current state of the work from artifacts outside the conversation." ([link](https://community.openai.com/t/youve-reached-the-maximum-length-for-this-conversation-but-you-can-keep-talking-by-starting-a-new-chat-but-how-do-you-actually-continue-a-complex-project/1392865/5))
- **Honest limit:**
    - The same project opens in Claude and Codex. That supports the claim but doesn't set BuildOS apart, because Notion, Linear, Asana and Todoist all offer read-write MCP.
    - In ChatGPT today this tool is not exposed. DJ's ChatGPT connection falls back to 427 searches.

**Proof point 3: saving is part of the conversation, with a receipt and no duplicates.**

- **What BuildOS does (VERIFIED):**
    - Capture in one call (`create_onto_project` with a `context_document`).
    - Section edits into START HERE (`update_onto_document` `section_edits`).
    - `idempotency_key` and `dry_run` on every write (`external-tool-gateway.ts:188-209`).
    - Every change logged with its source (`onto_project_logs.change_source`, `external_agent_caller_id`).
- **Usage (VERIFIED):** in-flow saves are the maintenance that actually happens (414 of 660 changes in 30 days). Background suggestions mostly don't get acted on (2 applied out of 217).
- **Demand (VERIFIED):**
    - The handoff ritual (Theme 3, ~45 items): "ask the old chat for a handoff summary, copy it, paste it into the new chat".
    - Approval fatigue (Theme 9): "asks for manual confirmation every time it updates Notion."
- **Implication (INFERRED):** one save should be one write call, so it triggers one approval prompt.

### Who it's for first (INFERRED, from the demand segments and the write-access constraint)

**The ideal first user:**

- Pays for ChatGPT Plus or Pro.
- Is carrying **one long, multi-week project** across many chats: a book, a launch, a strategy or pricing decision, a client engagement, or a long personal case such as benefits, a renovation or a legal matter.
- **Already does the handoff ritual by hand:** asks for a summary and pastes it into a new chat.

They have felt the pain, they have a workaround to replace, and individual plans aren't blocked by an admin switch on writes. Developers are a strong second group, through Codex. They already use BuildOS the way DJ does, but they're also the group most likely to settle for a markdown file.

**When ChatGPT should bring BuildOS in** (this goes into the tool metadata as "Use this when…"):

1. **The handoff moment (primary).** The user asks for a summary so they can carry on in a new chat, or hits the "maximum length for this conversation" wall. BuildOS should offer: "Save the decisions and next step to your project so the new chat can pick it up."
2. **The cold-start moment.** A new chat opens with "where were we on X", "pick up my book project" or "what did I decide about pricing". BuildOS loads the project status before the user re-explains anything.
3. **The decision moment.** Mid-conversation, the user settles something ("ok, let's go with one clip a week") or rejects an option. BuildOS offers to record it under Decisions or Non-goals.

**Caveat (VERIFIED):** OpenAI decides whether to suggest a plugin a user hasn't installed, and new listings get no enhanced distribution. The moments above are what BuildOS can control: how often ChatGPT picks BuildOS once a user has installed it. Installs at launch will come from DJ's own channels and direct links.

### Directory listing draft

Lengths below are character counts.

- **Display name:** `BuildOS`
- **Subtitle:** `Pick up projects in a new chat` (30)
    - Alternate: `Save decisions, pick up later` (29). It uses the users' most distinctive noun, but scans less clearly.
    - Don't use `Turn messy thinking into plans` (30). It sits in Asana's capture lane.
- **Category:** `Productivity`

**Long description** (~1,000 characters; no comparisons, pricing or superlatives):

> Keep the state of your work outside any one chat. BuildOS holds each project's decisions, current state, open questions, and next step, so a new conversation can pick the project back up without you pasting a summary.
>
> What you can do:
> • Save what you worked out in this chat — decisions, tasks, constraints, drafts — to a new project or one you name.
> • Pick a project back up in a fresh chat: where it stands, what's next, what was decided and why, and what's due.
> • Save what changed as you work. Each save lists exactly what was added or updated, and links to it in BuildOS.
> • Open the same projects in BuildOS on the web, and in other AI tools you connect.
>
> Try: "Save what we decided here to my launch project." "What did I decide about pricing, and why?" "Turn this brain dump into a project with tasks."
>
> You choose which projects BuildOS can read and update. It never deletes anything, and every change is recorded in the project's history.

Check before shipping: the "never deletes" claim must match the ChatGPT profile, so ship no delete tools in it. "Every change is recorded" matches `onto_project_logs`.

**Starter prompts** (3 maximum, each under 128 characters):

1. `Save what we decided in this chat to my project, with next steps` (capture / save back)
2. `Pick up my book project where I left off` (resume)
3. `What did I decide about this, and what's still open?` (the decision lookup, in the users' own words)

**Extra prompts** for the long description and test set:

- `What needs my attention across my projects this week?`
- `Turn this brain dump into a project with tasks`
- `Update my project with what changed today`

**Words to own:**

- decisions ("what you decided and why")
- where things stand / current state
- next step
- pick up / pick back up
- save (always followed by a receipt)
- new chat / fresh chat
- your project

DJ's homepage line, "Pick up your project without piecing it back together", already sits in this family. Use it on the site and in the demo.

**Words to avoid:**

- "never re-explain" (Unabyss)
- "memory" and "second brain" (saturated, and they compete with ChatGPT's own memory)
- "context layer" or "context" as the headline (saturated)
- "agents" in the listing headline (Notion, Asana, Linear, monday, Airtable)
- "AI chief of staff" (Mem, Asana)
- "keeps itself up to date" / "automatically" (OpenAI Pages and Dots; also untrue for ChatGPT sessions)
- "turn chats into tasks/projects" as the lead (Asana)
- "AI-powered" (brand rule)
- "thinking environment" in the listing (generic, and unused on BuildOS's own homepage)
- Anything with "only", "best", "unlike" or a user count (OpenAI rules)

### Launch feature set

Sizes are INFERRED: S is up to a day, M is 2–4 days, L is 1–2 weeks.

**MUST (the three workflows plus what review requires)**

| Feature                                                                                                                                                                                                                                                             | Existing code                                                                                                                                                   | Gap                                                                                                                                               | Size |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| A curated ChatGPT tool profile (~8–10 tools: search projects, project status, document read, create project, save to project, task create/update, document section edit; **no deletes**)                                                                            | Profile switch at `mcp-connector.service.ts:472-495, 885-1010`; tools in the gateway registry                                                                   | Add the profile; rewrite tool descriptions to start "Use this when…" and drop internal wording                                                    | M    |
| **Resume:** `get_onto_project_status` in that profile                                                                                                                                                                                                               | `op-execution-gateway.project-status.ts:385-466`                                                                                                                | Remove collaborator emails and internal IDs from the output (`:114-122`); add a "Use this when a new chat names a project" description            | S    |
| **Save back as one call:** a composite `save_to_project` (decisions → START HERE Decisions; rejected options → Non-goals; state → Current state; next step → the status header; new tasks; an optional draft document), returning one receipt with links            | Building blocks exist: `update_onto_document` section edits, `create_onto_task`, idempotency keys, the START HERE section model in `start-here.ts`              | The composite tool and receipt don't exist. They give one approval prompt per save instead of 4–6, and stop the model making multi-call mistakes. | M    |
| **Capture:** a new project from the conversation, with a filled START HERE                                                                                                                                                                                          | `create_onto_project` with `context_document` (`op-execution-gateway.mutations.ts:67`); auto-grant to the connector (`op-execution-gateway.core.ts:1345, 1458`) | Seed the Decisions, Current state and Next step sections from the conversation; receipt formatting                                                | S    |
| A restore point for each connector save                                                                                                                                                                                                                             | `packages/shared-agent-ops/src/ontology/versioning.service.ts` (versions merge within a per-user time window)                                                   | Give each connector save its own sealed version, so a ChatGPT save can be undone separately                                                       | S–M  |
| Consent default for ChatGPT: **read and write on selected projects**, with connector-created projects auto-included                                                                                                                                                 | `apps/web/src/routes/oauth/authorize/+page.svelte:16-17` (today read_only and all projects)                                                                     | Change the default and add an empty state for users with no projects                                                                              | S    |
| Listing and review kit: subtitle ≤30 characters, capabilities beyond "Search, Read", 5 positive and 3 negative test cases (they double as the golden prompt set), demo video, reviewer account without MFA, domain-verification file, privacy policy naming ChatGPT | `plugins/buildos/.codex-plugin/plugin.json`, `plugins/buildos/skills/buildos-context/SKILL.md`                                                                  | Rewrite the manifest and skill around the three workflows; produce the assets; re-authenticate DJ's connection                                    | M    |

**SHOULD**

| Feature                                                                                                  | Existing code                                                                                              | Gap                                                                                                   | Size |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---- |
| "What needs attention across my projects" (status across projects)                                       | Daily brief data loader (`apps/worker/src/workers/brief/ontologyBriefDataLoader.ts`), `list_onto_projects` | Wrap as one read tool. Use it only as a pull; the brief email has never been opened by a non-DJ user. | S–M  |
| A path for people who connect with no BuildOS account (sign up mid-OAuth, return to chat, zero projects) | Sign-up already returns to consent (per v2 plan)                                                           | Confirm the email-confirmation path; add an empty state                                               | S–M  |
| "What changed since I was last here" inside resume                                                       | `recent_changes` with `change_source` already in the status output                                         | Phrasing in the skill and tool description                                                            | S    |
| Codex parity: the same listing serves Codex, where DJ's real usage is                                    | Codex manifest and skill exist                                                                             | Test the three workflows in Codex too                                                                 | S    |

**LATER**

| Feature                                                                                         | Why later                                                                                     | Size       |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------- |
| Panel or sidebar project view (Apps SDK UI)                                                     | No UI code exists; the loop isn't proven yet                                                  | L          |
| MCP Events ("your project changed")                                                             | Work chats and Dots only; needs protocol 2026-07-28, webhooks and subscriptions (per v2 plan) | M–L        |
| BuildOS server-side capture of ChatGPT conversations (the checkpoint pipeline for MCP sessions) | Adds BuildOS LLM cost; in-flow saves come first                                               | M          |
| Showing background review suggestions in ChatGPT                                                | Data shows they're ignored (2 applied out of 217)                                             | n/a, don't |
| An activity view across agents ("what Codex changed")                                           | Real for DJ, unproven for anyone else                                                         | M          |
| Calendar, risks and milestones in the ChatGPT profile                                           | Not needed for the three workflows                                                            | S each     |

### Alternative positions, ranked

1. **Recommended: "decisions and current state that outlast the chat."** Subtitle: "Pick up projects in a new chat".
    - **Why it wins:**
        - It matches the most frequent pain (Themes 1–4, most of the sample) and the exact gap users name (memory ≠ decisions).
        - BuildOS's START HERE structure is that gap, section for section.
        - The resume tool is already the most-used operation from DJ's main agent.
    - **Where it can lose:**
        - ChatGPT Projects, memory and Pages are native.
        - Giraffe and Sonjapgo show that a resume pitch alone ranks at the bottom.
        - OpenAI may close the gap.
    - **Mitigations:** lead on _decisions_ (a structure the user controls and can see), and make saving one call with a receipt.
2. **The current hypothesis: "Turn this conversation into a project you can pick up next time."**
    - **Why it partly wins:** the loop and the "second useful session" north-star are right.
    - **Why it loses as written:**
        - It leads with capture, which Asana owns in the directory and ChatGPT Pages does in one click.
        - BuildOS's own data shows capture isn't the bottleneck. 15 of 48 signups in 2026 created a project, but only 2 came back on a second day.
    - **Verdict:** keep the body, change the headline.
3. **"One project for you and all your agents" (DJ's "same sheet of music").**
    - **Why it could win:**
        - It's DJ's real behaviour: 277 of his 660 changes in 30 days came from outside agents.
        - Codex is in the same directory.
        - Cross-vendor oversight for one person looks unclaimed.
    - **Why it loses as the listing headline:**
        - "Agents" and "shared context" are owned by Notion, Asana, Linear, monday, Airtable and now OpenAI Space ("ChatGPT, Codex and Dots… same shared context").
        - Demand Theme 6 is half vendor-written.
        - The evidence is one person.
    - **Use it as:** the second line for Codex users and DJ's own story, not the first line.
4. **Not recommended:**
    - **Consultant playbook:** thin demand (~10 of 170 items; confidentiality blocks them). Keep it as DJ's demo and pilot story.
    - **"Turn messy thinking into structured work" / brain dump:** the most crowded lane in ChatGPT, and the wrong bottleneck.

**Verdict on the reviewer's points**

- **"Advantage = how little effort keeps the project accurate": confirmed, with one change.** The effort-saver is in-flow saving by the AI you're working with, not background maintenance.
- **"Cross-AI supports but doesn't differentiate": confirmed** (Notion, Linear, Asana and Todoist all offer read-write MCP; Routine and Basic Memory pitch it to individuals).
- **"Consulting workflow as the stronger story": not supported as the listing position.** It works as a demo.

### What not to claim

Each item notes who already does it (VERIFIED) or why it isn't true for BuildOS.

| Don't claim                                                 | Why                                                                                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Never re-explain yourself"                                 | Unabyss's headline; also Plurality and Pickup                                                                                                                             |
| "Pick up where you left off" as something only BuildOS does | Claude uses it; Giraffe and Sonjapgo prompt it. Fine as plain description, not as a distinction.                                                                          |
| "Works across ChatGPT, Claude and Codex" as unique          | Notion, Linear, Asana, Todoist, Routine, Basic Memory, Unabyss, monday                                                                                                    |
| "Turn chats into tasks or projects" as the lead             | Asana ("Turn chats into actions"), Trello, Todoist, Notion; ChatGPT Pages                                                                                                 |
| "Keeps itself up to date / updates automatically"           | ChatGPT Pages and Dots, Mem, Tana. Also **not true** for ChatGPT sessions, where nothing updates unless the model saves, and BuildOS's background loop is largely unused. |
| "Second brain", "memory"                                    | Reflect, Mem, Craft, Mem0, Supermemory, ChatGPT's own memory                                                                                                              |
| "AI chief of staff"                                         | Mem, Asana                                                                                                                                                                |
| "Daily brief" as the hook                                   | Akiflow's daily briefings; BuildOS's brief email has 0 non-DJ opens                                                                                                       |
| Oversight or "mission control" for agents                   | Squad, builderz-labs Mission Control, ChatGPT Activity View; demand unproven                                                                                              |
| User counts or social proof                                 | 125 accounts; OpenAI disallows unverifiable claims                                                                                                                        |
| Pricing, trials, "best", "only", "unlike X"                 | OpenAI listing rules                                                                                                                                                      |

---

## 6. Open questions for DJ

1. **Subtitle.** "Pick up projects in a new chat" (clearer) or "Save decisions, pick up later" (more distinctive)? I recommend the first, and testing the second in the long description and prompts.
2. **The composite save tool.** Ship `save_to_project` (one approval, one receipt, M-sized) in the first submission, or launch with separate tools and add it later? I recommend shipping it first: it's the effort-saving claim made real, and it answers the most common connector complaint (repeated approval prompts).
