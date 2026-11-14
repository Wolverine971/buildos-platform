<!-- docs/technical/reviews/SVELTE_SKILLS_AUDIT_2026-10-31.md -->

# Svelte Skills Audit — 2026-10-31

Audit of `apps/web` (Svelte 5.57.1, Kit 2.70.3) against the Svelte team's official AI skills
(<https://svelte.dev/docs/ai/skills>, source `github.com/sveltejs/ai-tools/tools/skills`):
`svelte-core-bestpractices` (+ 9 reference files), `svelte-code-writer`, `svelte-mcp-feedback`.

Method: the official autofixer (`@sveltejs/mcp` 0.1.28) run over all 655 `.svelte`/`.svelte.ts`
files, plus `eslint-plugin-svelte` 3.12.4's recommended rules run over all 624 `.svelte` files,
plus targeted greps. Nothing was changed in source.

## Verdict

The Svelte 5 migration is complete: 0 `<slot>`, 0 `export let`, 0 `$:`, 0 `on:` directives,
0 `createEventDispatcher`, 0 `<svelte:component>`. Snippets are used correctly (360 snippets in
150 files). The gaps are second-order patterns, plus one config bug that let them accumulate.

## 1. Svelte lint rules are silently off (config bug)

`apps/web/eslint.config.js` spreads `...svelte.configs.recommended.rules`. In
eslint-plugin-svelte v3, `configs.recommended` is an **array**, so `.rules` is `undefined` and
the spread adds nothing. All 39 recommended Svelte rules are off.

Hits if turned on:

| Rule                                   | Hits | Files | Keep?                                                          |
| -------------------------------------- | ---: | ----: | -------------------------------------------------------------- |
| `svelte/no-navigation-without-resolve` |  589 |   183 | No: only matters with `paths.base`, which BuildOS does not use |
| `svelte/require-each-key`              |  482 |   121 | Yes                                                            |
| `svelte/prefer-svelte-reactivity`      |  207 |    87 | Yes (warn)                                                     |
| `svelte/no-top-level-browser-globals`  |  102 |    72 | No: false positives on TS generics like `$state<HTMLElement>`  |
| `svelte/no-useless-children-snippet`   |   53 |    49 | Yes                                                            |
| `svelte/no-at-html-tags`               |   37 |    30 | Warn: most go through sanitized `renderMarkdown` or JSON-LD    |
| `svelte/no-unused-svelte-ignore`       |   18 |     7 | Yes                                                            |
| `svelte/prefer-writable-derived`       |    7 |     7 | Yes                                                            |
| `svelte/no-useless-mustaches`          |    6 |     6 | Yes                                                            |

ESLint 9.36 supports bulk suppressions (`eslint --suppress-all` → `eslint-suppressions.json`):
turn the rules on as errors, suppress today's violations, and new code must comply.

## 2. `$effect` used where `$derived` belongs

Official autofixer: 419 state assignments inside `$effect` across 107 files. Most are legitimate
fetch/loading orchestration. The clear-cut subset is "copy a prop into `$state`, then re-sync it
with an `$effect`", which writable `$derived` (Svelte 5.25+) replaces in one line:

```svelte
<!-- before (OwnerBar.svelte) -->
let currentPage = $state(clonePage(untrack(() => page)));
$effect(() => { currentPage = clonePage(page); });

<!-- after -->
let currentPage = $derived(clonePage(page)); // still assignable locally
```

Markers: 7 `prefer-writable-derived` hits, 20 `$state(untrack(() => prop))`, 21
`svelte-ignore state_referenced_locally`. Files:

- lib/components/admin/AdminCollapsibleSection.svelte
- lib/components/agent/ProjectEntityList.svelte
- lib/components/briefs/BriefChatModal.svelte
- lib/components/builder-profile/editor/BuilderPageEditor.svelte
- lib/components/builder-profile/editor/SettingsPanel.svelte
- lib/components/consolidation/ConsolidationRun.svelte
- lib/components/dashboard/TodayRow.svelte
- lib/components/inbox/InboxChangeDetails.svelte
- lib/components/inbox/InboxCleanupTriage.svelte
- lib/components/onboarding-v3/ReadyStep.svelte
- lib/components/ontology/DocumentModal.svelte
- lib/components/ontology/DocumentProposalReview.svelte
- lib/components/ontology/TaskSeriesModal.svelte
- lib/components/profile/AccountTab.svelte
- lib/components/profile/BriefsTab.svelte
- lib/components/projects/desktop/DesktopReader.svelte
- lib/components/projects/desktop/ProjectItemPage.svelte
- lib/components/projects/desktop/ReaderDetailsPanel.svelte
- lib/components/projects/desktop/ReaderPanes.svelte
- lib/components/public-page/OwnerBar.svelte
- lib/components/scheduling/CalendarView.svelte
- lib/components/tables/NewTableDialog.svelte
- lib/components/tables/TableAddColumn.svelte
- lib/components/tables/TableCellEditor.svelte
- lib/components/tables/TableColumnMenu.svelte
- lib/components/tables/TableEmbed.svelte
- lib/components/ui/CommentTextareaWithVoice.svelte
- lib/components/ui/TextareaWithVoice.svelte
- lib/components/voice-notes/VoiceNotePlayer.svelte
- routes/admin/email-sequences/+page.svelte
- routes/admin/security/+page.svelte
- routes/auth/forgot-password/+page.svelte
- routes/notifications/+page.svelte
- routes/today/+page.svelte

Each one needs a read: some intentionally keep local edits until a save.

Separately, 10 effects open with `if (!browser) return;` (Navigation, CalendarAnalysisResults,
ContextSelectionScreen, CalendarItemDrawer, the three voice textareas). Effects never run on the
server, so the `browser` half of the guard is dead code.

## 3. `use:` actions → `{@attach}`

`use:` is not deprecated. The skill prefers `{@attach}` because attachments re-run when their
arguments change and pass through component `{...rest}` spreads. `{@attach}` is already used in 9 files.

| Action                                                       | Uses | Convert?    |
| ------------------------------------------------------------ | ---: | ----------- |
| `portal` (`lib/actions/portal.ts`)                           |   12 | Yes         |
| `preloadEntityModal` (`lib/actions/preload-entity-modal.ts`) |    3 | Yes         |
| `dragHandle` (`builder-profile/editor/drag-reorder.ts`)      |    3 | Yes         |
| `touchGesture` (Modal.svelte)                                |    1 | Yes         |
| `enhance` (SvelteKit's)                                      |   14 | No: Kit API |

The autofixer also flags 105 `bind:this` uses (72 files); the 22 files that pair `bind:this` with
`onMount` are the attachment candidates.

## 4. `$app/stores` → `$app/state`

30 `.svelte` files still import `page` from `$app/stores` (deprecated since Kit 2.12); 8 already
use `$app/state`. The change is mechanical: `$page.url` → `page.url` (74 uses), `.data` (18),
`.state` (14), `.route`/`.status`/`.params`/`.error` (10). One file aliases
`page as pageStore`. Files: `AdminPageHeader`, `AdminShell`, `ChatSessionAuditActions`,
`DailyBriefModal`, `Navigation`, `AgentKeysTab`, `CalendarTab`, `EmailTab`, `routes/+layout`,
`[handle=at_handle]` + `[project]`, 7 admin pages, gmail callbacks ×2, login, register, briefs,
debug/auth, docs layout, history, profile, projects + both `+error` pages.

## 5. Smaller items

- **Sets/Maps:** 8 `$state(new Set|Map)` sites copy and reassign on every change, which works.
  The 207 `prefer-svelte-reactivity` hits are the same clunky pattern. `SvelteSet`/`SvelteMap`
  from `svelte/reactivity` remove the copying. No bugs found.
- **Index-keyed each (skill says never):** 52 hits in 30 files. Skeletons (`Array(6)`) are fine.
  Editable rows matter: `TableFilterPanel`, `NewTableDialog`.
- **`{#snippet children()}` wrappers:** 49 modal call sites wrap body content in an explicit
  children snippet. Inline content already becomes `children`. This is cosmetic only.
- **Context:** 5 `setContext` sites (`recentlyCreatedContext`, `desktop-context`,
  `chat-review-panel`, `freshness-context`, root layout). `createContext` gives type safety.
- **Stores:** 28 non-test files use `svelte/store`. The skill prefers classes with `$state`
  fields. This is a bigger migration with low user value; leave it for now.
- **`class:` directive:** 176 uses. The skill prefers `class={[..., { active }]}`. This is
  cosmetic; leave it.
- **No `<svelte:boundary>` anywhere.** A render error in one chat message, markdown embed,
  or brief card takes down the whole page.
- **Async Svelte (experimental):** `routes/projects/+page.svelte` resolves streamed `data`
  promises by hand with version counters and `untrack`. `await` inside `$derived` (behind
  `experimental.async`) does this natively, including keeping the old UI until the new data
  resolves. Not enabled; `apps/web/AGENTS.md` requires a product decision first.

## Outcome (same day, ambitious route)

All of this is uncommitted on `main`. Validation: svelte-check reported 0 errors and 0 warnings
across 9,960 files. The full `pnpm --filter @buildos/web lint` passed, guardrails included.
523 tests in the 71 test files that touch changed components passed, plus 4 new
ErrorBoundary tests. A headless Chrome hydration and client-navigation pass on the public
pages logged no errors. The signed-in pages were not checked in a browser.

- **Lint:** `eslint.config.js` now spreads `svelte.configs.recommended`.
    - `no-navigation-without-resolve` (no base path) and `prefer-svelte-reactivity` are off.
      Its "fix" turns intentionally plain bookkeeping Sets into reactive ones, which makes
      effects re-run.
    - 193 pre-existing violations are grandfathered in `apps/web/eslint-suppressions.json`:
      154 unkeyed each blocks, 33 `{@html}`, and 6 whitespace mustaches. New violations fail
      lint (verified with a probe file).
    - A full lint run takes about 40 s.
- **Sweep (5 agents, disjoint files, about 200 files):**
    - About 330 each blocks keyed (482 → 154). The rest have no unique field, can repeat, or
      are skeleton loops.
    - 30 → 1 files on `$app/stores`. `admin/chat/users` moved too, after its bug fix below.
    - About 80 dead `browser` checks removed from effects and `onMount`.
    - 53 `{#snippet children()}` wrappers removed.
    - 8 Sets/Maps moved to `SvelteSet`/`SvelteMap`.
    - 7 writable-`$derived` conversions. One was reverted: `DocumentModal` `internalDocumentId`.
      Setting it on the first render fired two extra uncancelled requests. That case now
      carries an eslint-disable comment explaining why.
    - Most "prop copied into `$state`" sites turned out to be intentional one-time copies and
      were left.
- **Actions → attachments:** `lib/attachments/portal.ts` and
  `lib/attachments/preload-entity-modal.ts`. `dragHandle` now takes a getter, so a moving
  index doesn't recreate it mid-drag. Modal's `touchGesture` is converted too. `lib/actions/`
  is deleted. Only SvelteKit's `use:enhance` remains.
- **Error boundaries:** `$lib/components/ui/ErrorBoundary.svelte` shows a quiet "This part
  didn't load · Try again" card and reports to `/api/error-tracking/client` with
  `metadata.boundary`.
    - It catches errors in the browser only. Server render errors still reach `+error.svelte`
      and `handleError`, as before.
    - It is placed in:
        - the root layout (a page-level card that resets on navigation)
        - each chat message and each shared-chat message
        - the reader pane (resets when another item opens)
        - table embeds
        - the Daily Brief modal body
        - the Today brief widget, agenda rows, task groups, and What changed
        - the TodayRow on `/projects`
- **Bug found and fixed:** on `/admin/chat/users`, search undid itself.
  `applyUrlState` read `appliedSearch` inside the URL effect. It is now wrapped in `untrack`.
- **Official skills:** `svelte-core-bestpractices` (with its references) and
  `svelte-code-writer` are in `.claude/skills/` and symlinked into `.agents/skills/`.
  `svelte-mcp-feedback` was skipped because it files GitHub issues.
- **Not done, on purpose:**
    - `createContext`. Our 5 contexts already sit behind typed helpers with private keys, and
      two are injected by key in tests.
    - The async pilot. Compiling one component with `await` imports
      `svelte/internal/flags/async`, which switches the whole runtime into async scheduling.
      `/projects` also mutates its streamed lists in about 45 places and needs a suspended
      child component to keep the header live. That is its own task, not a pilot.
- **Possible follow-ups seen by the sweep:** `EntityActivityLog` and the admin error scan
  page by offset, so a row can appear twice while new rows arrive. `CalendarView`'s
  date-sync effect reverts navigation if a parent ignores `ondateChange`; neither current
  caller does.

## Reproduce

```bash
# Official autofixer on one file
npx -y @sveltejs/mcp@latest svelte-autofixer apps/web/src/lib/components/X.svelte --svelte-version 5.57.1
# Batch: import { svelteAutofixer } from '@sveltejs/mcp' and loop over files in one process
# (~2 min for 655 files vs ~45 min via npx per file).

# Lint probe: a flat config that spreads apps/web/eslint.config.js, then adds
#   Object.assign({}, ...svelte.configs.recommended.map(c => c.rules ?? {}))
# for files ['**/*.svelte']; run with --no-config-lookup -c <probe> 'src/**/*.svelte' -f json.
```
