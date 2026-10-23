<!-- tasker/146-workspace-chat.md -->

# 146 — Workspace chat: the Workspace becomes the agent's home surface

**Status:** RESEARCHED (round 2 added "the you layer", 2026-10-23), NOT STARTED · **Priority:** P1 · **Opened:** 2026-10-23 · **Size:** lean ~2–3 days, ambitious ~1.5–2 weeks  
**Owner:** Claude · **Needs from DJ to start:** the open questions at the bottom (lead with Q1), then lean or ambitious  
**Explainer (DJ's real data, sortable):** https://claude.ai/artifact/2EuzUqpHFr3hh5DPCZpjyU. DJ's card picks and gate verdicts save to its `picks` and `gate` collections; read them with `ArtifactData list` before building.

## What users get

One home chat that knows three things: **you** (who you are, what you're working toward), **your loose stuff** (notes, docs, tasks in the Workspace) and **all your projects**. You can ask "what's in my Workspace?", "file that pricing note into BuildOS", "anything here that should be a project?" or "what should I do today?", and it answers from all three. Project chat stays focused on one project, but it can still save to or find things in the Workspace when you ask.

## DJ direction (2026-10-23)

> "We need to look into how the workspace stuff is going to play into the regular agentic chat. We need to add maybe some tools about the workspace and figure out what the workspace could be referenced in the agentic chat, because you could be chatting about the context of a project, or you could be chatting about the global context… now that we have the concept of a workspace, we need to convert the global chat to the workspace chat. It could be chatting about global things, workspace things, or things having to do with the user, notes, tasks, or whatever. It's like context on the user, and it's notes, and it's a bunch of stuff… The workspace is a new, broader surface that the agent BuildOS needs to be aware of."

Round 2 (DJ, 2026-10-23), on the person layer:

> "It contains relevant information about the person who the user is… there's a long tail of things relevant to the user that might not come up… I don't want to go crazy with keeping track of all these erroneous, irrelevant details about a person, and I also don't want those to necessarily get loaded in because it may not be relevant to the chat… A lot of times when I chat with an agent, it refers to things it already knows about me, and it thinks it's helping me out, but it's actually irrelevant… Let's at least keep track of what qualifies as what should be housed in the workspace and what's accessible."

Standing rules from the Workspace build: turning loose items into a project is **suggestion only**, and the agent **suggests and never auto-files**.

## The insight

"Global chat" today means "chat about all my projects." The Workspace adds two layers that global chat barely sees: the person, and their loose items. Workspace chat is global chat that holds all three. The nav already calls it "Workspace chat" on /projects (`Navigation.svelte:237`), but it opens the same global context as before. The work is to make the name true.

## Where things stand (verified in code, 2026-10-23)

### Chat context types today

Type list: `packages/shared-types/src/chat.types.ts:96-107`. DB check: `supabase/migrations/20260430000003_remove_brain_dump_chat_context.sql:22-33`. `'general'` is an alias for `'global'` (`packages/agentic-chat-runtime/src/context/scope.ts:37-44`, plus 4 other normalizers). The surface router is `catalog/surfaces.ts:329-342`: `project`/`ontology` get the project surface, `project_create` its own, and everything else gets the global surface.

| Type                             | How the UI opens it                                                                                                                                                                                                                                                               | What it loads                                                                                                                               | Tools                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `global`                         | Nav chat button everywhere except project/task pages (`Navigation.svelte:164-171`); labelled "Workspace chat" on /projects, "BuildOS chat" elsewhere (`:234-241`). Today "Plan my day" (`today/+page.svelte:832`). Selector "General chat" (`ContextSelectionScreen.svelte:189`). | Global RPC: 8 project bundles, project index, Workspace id + one Workspace line (`context-loader.ts:1382-1395`, `:2077-2093`, `:3336-3341`) | global                      |
| `general`                        | Today quick capture (`today/+page.svelte:847`, auto-send "figure out which projects…")                                                                                                                                                                                            | Same as global                                                                                                                              | global                      |
| `project`                        | Project/task pages (`Navigation.svelte:166`); every card and reader chat, **including the Workspace card** (`DesktopChatPane.svelte` focus → `agent-chat-shell-router.svelte.ts:249-259`); Today project items (`today/+page.svelte:775`); selector "Project chat"                | Project context; the Workspace id only when `includeWorkspace` (`context-loader.ts:3336-3341`, `:3398`)                                     | project                     |
| `project_create`                 | Today first-run, onboarding, selector "Project setup"                                                                                                                                                                                                                             | Setup context                                                                                                                               | project_create              |
| `calendar`                       | Today calendar items (`today/+page.svelte:781`)                                                                                                                                                                                                                                   | Fallback load, no RPC (`scope.ts:72-82`)                                                                                                    | global, **no Workspace id** |
| `daily_brief`                    | Brief chat                                                                                                                                                                                                                                                                        | Brief data only (`context-loader.ts:3311-3327`)                                                                                             | global, **no Workspace id** |
| `daily_brief_update`, `ontology` | Legacy                                                                                                                                                                                                                                                                            | —                                                                                                                                           | —                           |

Prod usage, last 60 days: `project` 319 sessions, `global` 85, `project_create` 4, and none of the others.

### What the 10-23 build already taught chat

- Global prompt rule: save a note, doc or task that fits no project to the Workspace and say so; never make a project for one item (`build-lite-prompt.ts:172-179`).
- A Workspace line, rendered first and outside the project count. It shows the Workspace id and its open-task rollup (`build-lite-prompt.ts:2974-2978`).
- Project chats get one line pointing to the Workspace (`build-lite-prompt.ts:1250-1262`).
- `create_onto_document` is on the global surface (`surfaces.ts:104-107`).
- Creates aimed at the Workspace route directly, not to review. The id comes from the server context, never from model arguments (`write-routing.ts:238-251`, `shared/workspace-context.ts`).
- The project-chat write fence accepts the user's own Workspace for task and doc creates (`mutations/table-adapter.ts:454-460`). The reviewer treats the Workspace as a valid home (`review/turn-contract.ts:194`).
- Jev shows a Workspace card: "Loose notes and tasks, not a project" (`context-finder/workspace.ts:207-210`).
- MCP: the server instructions carry the Workspace rule (`mcp-connector.service.ts:85-87`, `buildos-mcp-server/src/index.ts:48`). `get_buildos_permissions` returns a `workspace` block (`permission-requests.service.ts:23-25`, `:465-504`), and project listings mark it with `kind: 'workspace'` (`op-execution-gateway.projects.ts:127`).
- Background: checkpoint capture and post-chat next-step generation skip the Workspace (`supabaseCheckpointPorts.ts:339`, `chatSessionActivityProcessor.ts:440`).

None of this has been run against live models yet; no paid check has been done.

## Gaps

1. **Chat can't see loose notes.** The Workspace line carries only a task count. "What's in my Workspace?" forces a search, and the prompt never lists recent notes or open suggestions.
2. **There's no "you" layer, after four attempts.** Chat knows name and timezone, nothing more. Full findings in "The you layer" below.
3. **Docs can't be filed from chat.** Tasks can move (`move_onto_task`, `ontology-write.ts:1149`), but there's no doc move between projects. The Organize mover (preview → apply → undo) isn't a tool.
4. **Suggestions are invisible to chat.** No tool reads, accepts or dismisses `workspace_suggestions`.
5. **The Workspace card's chat is a project chat on the Workspace.** The prompt frames it as a project. `create_onto_project` isn't on the project surface, so "make these three a project" can't happen there.
6. **The chat selector lists the Workspace as a project.** `/api/onto/projects` returns it, and only `?include=hierarchy` filters it out (`routes/api/onto/projects/+server.ts:67-69`).
7. **Calendar and brief chats can save docs but have no Workspace id,** so the save rule has no target.
8. **Global research is dropped.** Research capture skips global turns (`effects/research-capture.ts:126-128`), and the SQL rejects them (`20260813030000_agentic_chat_research_capture.sql:364`).
9. **Global thinking that isn't about one project goes nowhere.** Checkpoint capture now refuses the Workspace, and nothing captures "about the user."
10. **`get_workspace_overview` counts the Workspace among projects** (`tools/overview-reads.ts:97-146`).
11. **MCP connections with "selected projects" can't write to the Workspace without also reading it** (needs a write-only lane in the gateway).
12. **"Workspace" already means "all projects" in code:** `get_workspace_overview`, Jev's `workspace_v1` card set (`context-finder/workspace.ts:94`), `receipt.workspace.scope` (`checkpoint/globalAttribution.ts:25-27`), `provider/chat-workspace-finder.ts`, `ProjectWorkspace.svelte` (the project page), and the selector copy "workspace-wide" (`ContextSelectionScreen.svelte:294`, `:387`). The prompt's old "Workspace scope" line was already renamed to "All projects" (`build-lite-prompt.ts:3156`).

## The you layer (research round 2, 2026-10-23)

Three surveys: code (every user-level store, file:line), production data (read-only; other users as counts only) and outside research on agent memory. Scratch reports: `prod-user-context-survey.md` and `memory-design-research.md` in that session's scratchpad (not in the repo).

### What exists: four stores, none read by chat

| Store                                                                                                                       | Built             | Production (10-23)                                                                                                                       | Chat reads?                                                                                                                                                                                  | Verdict                                    |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `user_context` (old onboarding answers)                                                                                     | 2025              | 33 rows; raw answers ~75% filled, parsed fields 2–5 of 33; 1 row touched in 90 days                                                      | No (admin/email/export only)                                                                                                                                                                 | DEAD                                       |
| `user_behavioral_profiles`                                                                                                  | `20260213000000`  | 7 onboarding seeds, never refined (session_count 0, confidence 0.1). DJ's says "New User… did not create any projects… first chat"        | No; chat stopped reading it in `1f83ac854` (04-14 prompt slimming)                                                                                                                            | BUILT-BUT-UNUSED, **wrong for DJ**         |
| `users.preferences` (style, length, proactivity, role, domain)                                                              | `20260301000000`  | **0 of 129** set                                                                                                                         | No (removed 04-14). `PreferencesTab.svelte:11` and `:237` still promise it's "injected into all AI conversations"                                                                          | DEAD, **UI makes a false promise**         |
| Living KB (`user_profiles`, `profile_documents`/`_fragments`/`_embeddings`…) + `profileSignalProcessor.ts` extraction      | `20260427000000`  | **0 rows** in all 7 tables. Extraction is gated on `extraction_enabled` (default false) and no UI creates a profile                       | No; `get_user_profile_overview` executor deleted in `a63be9294` (09-23), tool still in catalog and `people_context` SKILL.md                                                                  | BUILT-BUT-UNUSED                           |
| Contacts memory (`user_contacts*`) + `contactSignalProcessor.ts`                                                            | `20260428000000`  | 0 contacts (manual Contacts tab is live but unused)                                                                                      | No (tools worker-unavailable, no executor)                                                                                                                                                   | Manual LIVE, agentic BUILT-BUT-UNUSED      |
| `users.onboarding_intent` / `onboarding_stakes`                                                                             | v3 onboarding     | 19 of 129 (organize 11, plan 4, explore 3, unstuck 1)                                                                                     | No. `onboarding.config.ts:304` promises "We'll be extra careful and precise" for high stakes; nothing honors it                                                                              | LIVE for onboarding/email only             |
| `users.name` / `timezone`                                                                                                   | —                 | 129 names; **111 timezones are the UTC default**, 18 real                                                                                | **Yes** (`context-loader.ts:3242-3282`, `build-lite-prompt.ts:584`, `:635-639`)                                                                                                              | LIVE                                       |

Also: `users.bio` 0 filled; no age/location/role columns; `builder_profiles` has DJ's location and "now" line (public page only). Personal goals don't exist anywhere (`onto_goals.project_id` NOT NULL). The richest unused source is chat history: 716 sessions have summaries, 709 have topic tags.

**Why they died:** each started with storage and an always-in-prompt read path. The 04-14 speed rewrite cut always-loaded context first. On-demand context costs nothing on most turns, so it survives speed work.

### Who uses global chat, and what they ask

Global chat has had **3 users ever; 479 of 524 user messages are DJ's**. Last 30 days: 10 global sessions (9 DJ). DJ's asks fall into four kinds: status across everything ("where am I at with things?"), restructuring (merge/nest Cadre under Wayne Strategies), errands with no project home (the gun-action callback, which is a Workspace task) and working a call list. None needed biography; the errand needed the Workspace. DJ's Workspace has 0 live items today.

**Growth note:** the you layer is mostly DJ-quality and future retention work. Global chat is a DJ-only surface, and 5 people signed up in the last 30 days. The part that touches activation is a new user's first chat knowing their onboarding intent and seeing an "About you" draft they can correct.

### Outside research (what others learned)

- The failure DJ described is documented and common. Google calls it "over-personalization" (Jan 2026). PersistBench (2026, 18 models): median **53%** failure at keeping memories out of unrelated topics. Saved memory profiles drove the biggest rise in agreeable answers (MIT/Penn State 2025). BenchPreS (2026): models that follow stored preferences more also misapply them more, and prompt defenses don't fully fix it.
- Mature systems converge on a **tiny always-loaded core plus fetch-on-demand** (Claude: project-scoped memory + visible chat search; Letta core vs archival; Anthropic's memory tool "just-in-time"). ChatGPT added per-answer "memory sources" with "Don't mention this again" (press reports, 2026).
- Graph memory: Mem0's graph variant is ~2% better for ~3x latency (vendor/secondary); Letta's plain files + search beat it on LoCoMo (vendor-reported). For a few facts about one person, no graph. BuildOS projects, entities, edges and the people layer already are the graph.
- 96% of ChatGPT memories in a 2,050-memory study were created without the user asking (WWW '26). Users disliked memory carried across unrelated tasks and preferred project-scoped memory.

### Proposed rules (the spec for the you layer)

**One line:** store the constraint a fact creates, never the life story; load it only when the turn needs it; mention it only when it changes the answer.

**Four homes** (the "what qualifies" test DJ asked for):

| Home           | Test                                                                                             | Examples from DJ's data                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Project        | Belongs to one effort with an outcome                                                            | "Dan was unavailable, who's next" → note on the call-list task; "Promote BuildOS" → BuildOS project goal; founder story (Marine, pastor's kid) → BuildOS marketing doc |
| Workspace item | Something to do, keep or read later, with no effort to attach to yet                             | Gun-action callback (task); AI Taste Buds (seed note); Radar (reference folder)                              |
| About you      | Still true in three months **and** would change answers in chats about other things               | Works later in the day; new baby, time is tight; outcome-first answers; Glen Burnie; interviewing for FDE roles (dated) |
| Don't keep     | A passing state, a guess about the person, or something the system can look up                   | "Struggling with organization" (Feb feeling); "Tools: Gmail…" (connected accounts); the wrong behavioral seed; age by default; never "owns firearms" from an errand |

**Personal goals** = the order of efforts across everything ("Priorities") plus goals no project holds. Project goals stay in projects; About you never copies them. Priorities is the one section BuildOS shouldn't guess.

**Preferences:** the five existing ones are dead (0 users). Replace them with About you's "How I like answers" section, learned from the user's corrections and confirmed by them.

**Where it lives:** one short About you page pinned in the Workspace, with fixed `##` headings: How I like answers · Schedule and constraints · Now (dated) · Priorities across everything (user-set) · Where I am. Technical lean: an `onto_documents` row in the Workspace with a reserved `type_key`, so the editor, versions, search and Jev's existing heading split (`parseContextFinderSections`, `context-finder/packets.ts:56`) work unchanged. It can't be filed out of the Workspace and is never shared. Revisit per-fact rows only if pages grow past ~1 page.

**Load rules:**

1. Always on (every chat, ~60 tokens): name, timezone, "How I like answers."
2. Every other section loads only when Jev says the turn needs it: one more question in the existing hop-1 call (`context-finder/workspace.ts`, ~$0.0015 and ~0.45 s per turn today, so ~0 added cost). Jev scores each section. This is a structured decision, not keyword matching (AGENTS.md).
3. Same gate in project chat. Workspace loose items reach project chat only through search on request (F6).
4. The answer shows a chip when a section loads ("Used: About you · Schedule"), next to the existing "Looking in" chips, with "Not relevant here" feeding back as a label.
5. Prompt rule: use About you to shape the answer; mention a fact only when it changes the recommendation, once, in a clause; never to show it remembers. Measured with a structured `about_you_used: [section]` field, not regex.

**Write rules:**

1. The user writes the page, or confirms an agent proposal. Chat offers "Remember this?" through a tool call (`propose_about_you_edit`: section, text, why) when the user states something durable. Nothing is saved without a click.
2. No background extraction in v1. That is the path the living KB built and never switched on, and the 96%-unasked finding says why.
3. One-time draft: on first open, a cheap model drafts the page from onboarding answers, project names and chat summaries; the user edits it. For DJ, that draft is in the explainer.
4. Now and Priorities carry a date and ask "still true?" after ~90 days (brief or chat).

**Eval before launch (paid, needs DJ's OK):** 30–50 of DJ's real global messages plus planted irrelevant facts, with and without the gate. Count the irrelevant-mention rate (leaks) and the missed-use rate (it should have used Schedule and didn't). Jev labels are cheap; the reply leg uses the acting model (`AGENTIC_CHAT_OPENROUTER_MODEL` in `.env.agentic-gate.local`). Estimate from that model's last measured spend before asking.

## Forks for DJ (each one is vetoable)

- **F1. Relabel, don't migrate.** Keep the internal type `global` and call it "Workspace chat" in every UI label, history row and the selector. No data migration, and the 85 recent sessions keep working. The alternative is a real `workspace` type: CHECK changes on `chat_sessions` (`context_type`, `chat_type`), plus `agent_runs`/`agent_operatives`, 5 normalizers and analytics. _Rec: relabel._
- **F2. What Workspace chat preloads.** (a) The current index + Workspace line, plus up to ~10 recent loose item titles and the open suggestions. (b) The always-on core: name, timezone, "How I like answers." (c) About you sections, never preloaded: Jev loads them per turn (see the you layer). _Rec: (a) + (b) now, (c) in ambitious._
- **F3. Tools.** Use the generic tools with `project_id` = Workspace for create and read (already works). Add dedicated tools only where none exist: **file a loose item** (doc or task) into a project through the Organize preview/apply with undo, and **suggestions** (list, accept, dismiss). _Rec: this mix; no separate "loose item" read tools._
- **F4. Graduating from chat stays a suggestion.** The agent may show a "Start a project from these 3?" card (like `propose_project_combine`), and only your click creates it. It never builds a project from Workspace items on its own. _Rec: yes._
- **F5. The Workspace card's chat opens Workspace chat** (global surface, focused on the Workspace), not a project chat on the Workspace. _Rec: yes._
- **F6. Project chats reach the Workspace on request only.** Saves already work. Add reads ("is there a note about X in my Workspace?") through search, with no preloading. _Rec: yes._
- **F7. Captures land in the Workspace when nothing fits.** Global research gets saved as a note there (a TS fallback plus one SQL migration). Checkpoint "about you" notes come later, with F2(c). _Rec: research now, checkpoint later._
- **F8. Calendar and brief chats get the Workspace id,** so their saves have a home. _Rec: yes, small._
- **F9. Naming.** Keep internal tool names stable (the model knows them) but fix descriptions and copy so "workspace" only ever means the Workspace in anything a model or person reads. _Rec: copy only._
- **F10. About you is a visible page the user edits,** pinned in the Workspace, instead of hidden memory. _Rec: visible._ (Q2)
- **F11. Chat may offer "Remember this?" cards;** nothing saves without a click, and there's no background extraction. _Rec: yes._ (Q3)
- **F12. Retire the dead stores.** Fix or remove the Preferences tab and the onboarding stakes promise now (false promises). Delete the behavioral seeds. Later, drop the living-KB and `user_context` code paths and the dangling `get_user_profile_overview` / contacts tools and `people_context` skill text. Keep the manual Contacts tab for the people layer. _Rec: false promises now, cleanup with the ambitious build._
- **F13. No graph database.** _Rec: no._ Revisit only if About you pages outgrow a page.

## Plan

### Lean (~2–3 days): make the name true

1. Label `global` as "Workspace chat" everywhere: nav on every page, selector card ("Workspace chat" replaces "General chat"), history rows. Drop the Workspace from the selector's "Project chat" list.
2. The Workspace line grows to show up to ~10 recent loose item titles (note, doc, task), open suggestion headlines, and the shelf total. It stays outside the project cap, inside a fixed character budget.
3. The Workspace card's chat opens Workspace chat (F5).
4. Calendar and brief contexts carry the Workspace id (F8).
5. `get_workspace_overview` stops counting the Workspace. Descriptions and copy are fixed (F9).
    - **You layer, lean (~1 day):** fix the false promises (Preferences tab, stakes copy), delete the wrong behavioral seeds, add the "mention only when it changes the answer" rule, and put onboarding intent into the always-on core.
6. Free validation: focused vitest on the prompt builder, context loader, surfaces and selector; regenerate the catalog snapshot; check size budgets.
7. Paid validation (needs DJ's OK): a short `pnpm agentic:prod-battery` slice with new Workspace cases ("what's in my Workspace", "save this as a note", "file X into BuildOS", "make these a project" → must suggest, not create). The acting model is `deepseek/deepseek-v4.1-flash` (`AGENTIC_CHAT_OPENROUTER_MODEL` in `.env.agentic-gate.local`). Estimate pending: base it on that model's last measured battery spend before asking.

### Ambitious (~1.5–2 weeks): the home surface

- **Phase 2, file and suggest (~3–4 days).** Add `file_workspace_items` (docs and tasks into a project via Organize preview/apply, returning an undo token) and `list/accept/dismiss_workspace_suggestion`; accept on a "graduate" suggestion returns a proposal card, and the user's click runs it (F3/F4). Mount them on the global surface and in Workspace-focused chat. Free tests, then a paid battery slice with the same acting model and the same estimate rule.
- **Phase 3, the you layer (~4–5 days, after Q2/Q3).** Per "The you layer" above: the About you page in the Workspace (reserved `type_key`, unfileable, never shared) with a one-time draft; the always-on core; a Jev hop-1 question that scores About you sections; the "Used: About you" chip with "Not relevant here"; `propose_about_you_edit` with a confirm card; dated Now/Priorities with a "still true?" check; the paid leak/miss eval (needs DJ's OK); retire the dead stores (F12). Do not revive the living KB's background extraction.
- **Phase 4, captures and connectors (~2–3 days).** Global research saves to the Workspace (TS fallback in `research-capture.ts` + a new migration replacing `apply_agentic_chat_research_capture` that allows the caller's own Workspace; rehearse with `--role-probe`). Add an MCP write-only lane for selected-project connections (F11 gap).
- **Optional:** a real `workspace` context type (F1 alternative), only if relabeling proves confusing.

## Related

- **Smart capture (DJ, 10-23):** "We shouldn't have to explicitly say [note or task]… the agentic flow… should be processing that." That redesign is separate UI work, but its classifier must be a model's structured output (no regex, AGENTS.md), and it should share Workspace chat's write path and Workspace rules.
- [138 — Faster write turns](138-faster-write-turns.md): Workspace creates already skip review.
- Spec: `docs/specs/WORKSPACE_ARCHITECTURE_2026-10-23.md` ("Build status").

## Open questions for DJ

1. **Describe what you picture when you open Workspace chat.** What's the first thing you ask it, and what should it already know about you without asking?
2. **About you:** a page you see and edit in the Workspace, or memory that stays behind the scenes?
3. May chat ask "Remember this?" mid-conversation, or do only you add things?
4. **Priorities across everything:** will you set the order of your efforts, or should BuildOS infer it from what you work on?
5. When chat spots loose items that belong together, may it put a "Start a project?" card right in the conversation, or should it only point you to the shelf?
6. Lean first, or straight to ambitious? (And sort the cards in the explainer; disagreements become the spec.)

## Exit

Workspace chat is the name everywhere and it can list, save, file and suggest across you, your loose items and your projects. Graduating stays click-only. Focused tests are green, and an approved paid battery slice passes the Workspace cases with its scorecard saved.
