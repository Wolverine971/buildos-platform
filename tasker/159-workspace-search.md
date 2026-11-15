<!-- tasker/159-workspace-search.md -->

# 159 — Workspace search (pane first, then ⌘K)

> **2026-11-15 (Claude), after DJ deployed `fa3db38bc`:** live on build-os.com. Paid best-match
> check (DJ approved; `typesafe/jev-1.13`, 21 calls, **$0.0146**, best-match 0.84–1.06 s):
> vague 3/5 exact (shaky sessions, kids storytelling guide, checked-bag refund ✓; "price sheet for
> sponsors at the training company" came back **empty** though the Cadre rate card exists;
> "industrial client service pages" picked the right project but a sibling task), typos 2/3 exact
> ("sponsership" → a clearance-sponsorship task, a fair word match), misses 2/2 empty. Below the
> 4/5 bar: hop 1 misses a project described by what it is ("the training company") rather than its
> name. Next: give hop 1 project descriptions/goals (check what it sees), then rerun the 5 vague
> searches (~$0.007). Still open: real-phone look.

**Status:** BUILT, UNCOMMITTED (paid best-match check pending DJ's OK) · **Priority:** P1 · **Opened:** 2026-11-15 · **Size:** ~3–4 days
**Owner:** Claude agent · **DJ (2026-11-01):** ambitious version. **DJ (2026-11-15):** "do what's
recommended" → direction **C** (an always-visible Workspace pane with search, plus matches from
projects), then **B**'s ⌘K anywhere as step two.

Split out of [146 — Workspace chat](146-workspace-chat.md) ("UI search").

## What users get

On /projects, a search box that's always there. Type and you see your loose notes, docs and tasks
and matching items from every project you can reach, note text included. Click one and it opens.
Longer, fuzzier queries get a "best match" on top. Then ⌘K finds the same things from any page.

## Design spike (read it first)

https://claude.ai/artifact/RtsmhjirE4UgLZSbu9FzbP — three live directions on DJ's real titles
(A one box over everything, B ⌘K anywhere, C always-visible Workspace pane). Use the Artifact
tool's `read` action. The spike recommends C, then B's ⌘K.

## Shared build (from the spike)

1. **One search endpoint** over every project the user can access, including the Workspace, and
   note text. Reuse `onto_search_entities` (check what it already covers and its grants before
   adding anything). JSON endpoints use `ApiResponse`.
2. **Best-match call:** Jev hop 1 + hop 2 exposed as its own endpoint, ~$0.0008/search, only for
   3+ word queries or when word matches are thin. Fail open: word matches always show; the best
   match adds on top when it arrives. Models live in code with fallbacks (no env pins).
3. **Item links** on /projects: `?open=kind:id` opens the item (so search results, ⌘K and chat
   can link straight to a loose note or task).
4. **C — the pane** on /projects (`apps/web/src/routes/projects/+page.svelte`, the Workspace UI).
5. **B — ⌘K anywhere**, after C works: the same endpoint and result rows, as a command palette.

## Also open from 146 (pick it up if it's small)

Project chat can find a Workspace item but can't edit it: update tools are `context_project`-
scoped (`mutations/tool-catalog.ts`) and the fence only lets creates target the Workspace.

## Rules

- Read `apps/web/AGENTS.md` and the Inkprint design system first; light and dark, phone width,
  Lucide icons through the central exports. Use the Svelte MCP/autofixer on every `.svelte` file.
- Never classify the query with regex or keyword lists (AGENTS.md). Word count to decide whether
  to call best match is fine; deciding what the query means is not.
- New SQL functions are server-only by default; grant `authenticated` only when the browser
  calls them, and a SECURITY DEFINER function must check `auth.uid()`. Rehearse every migration
  (`pnpm db:rehearse … --role-probe`). Apply to prod only after rehearsal passes, one file at a
  time, then `migration repair` (DJ authorized this tracker's migrations 2026-11-15).
- Free checks only: unit tests, replays, local dev. **No paid model calls** without DJ's OK; the
  best-match endpoint can be tested with a mocked model. Report live checks as pending.
- Narrow test runs only (`pnpm --filter web exec vitest run <files>`), through `test-gate`.
- Work on `main`, no worktrees, don't commit (DJ commits). Another agent is fixing database
  privacy (158) and another is finishing builder profiles (147); stay off their files.
- **Never generate images.**

## Exit

C live on /projects and ⌘K anywhere, both on one endpoint; `?open=` links; tests and web check
green; browser check on DJ's real data (desktop, phone width, dark); one paid best-match check
listed for DJ's OK. Then update 146 and delete this file.

## Build log

### 2026-11-15 — server lanes

- **Checked `onto_search_entities` first** (grants: `authenticated` + `service_role`, definer
  with an actor guard). It stays the chat's search. For a box that searches as you type it falls
  short: whole words only (`websearch_to_tsquery`, so "gunsm" finds nothing until "gunsmith"),
  document snippets come from title/description/props rather than the note text that matched,
  and rows carry no dates or Workspace flag.
- **New `public.onto_find_items(p_query, p_limit)`** (`supabase/migrations/20261115153000_onto_find_items.sql`):
  every word a prefix (`'gunsm':*`), titles also match part of a word ("smith" → "Gunsmith"),
  projects / docs + notes / tasks (done included) / goals, snippet from the text that matched with
  chr(2)/chr(3) markers (no markup from the DB). Identity from `auth.uid()` (no actor argument),
  same owner-or-member rule and archived/merged/record exclusions as `onto_search_entities`.
  Granted to `authenticated` (the server calls it with the person's session); revoked from
  PUBLIC/anon. Rehearsed with `--role-probe` + new `supabase/tests/onto_find_items.check.sql`
  (prefix, part-of-word, Workspace note text + marked snippet, shared yes / stranger, archived
  project, archived/deleted/tree-archived records no, anon nothing): PASSED. The one SECURITY
  finding (definer executable by `authenticated`) is intended and covered by the `auth.uid()`
  identity. Dry-run with ROLLBACK in prod clean, **APPLIED to prod + recorded** (repair 20261115153000).
  Prod timing as DJ: 130–270 ms per query.
- **Endpoints**: `GET /api/workspace/find?q=` (word matches, free) and `POST /api/workspace/find/best`
  (Jev hop 1 → hop 2 inside the top ≤3 projects, entity stage only, no heading stage; scope forced to
  "projects" since a search always looks for something specific; floor 0.5, within 0.6× of the top,
  max 5; reader kinds only). Fail-open everywhere (no key / kill switch `WORKSPACE_BEST_MATCH_DISABLED=true`
  / daily cap 1,200 usage rows / any error → `status: unavailable`, word matches stand). Per-instance
  5-min memo so a retyped query isn't paid twice. Usage logged as `workspace_find_best_match`.
- Tests: `find-model.test.ts` + `find.service.test.ts` (mocked Jev) 18/18.

### 2026-11-15 — C pane, ⌘K, item links (BUILT, UNCOMMITTED)

What DJ sees:

- **/projects is split** (≥1024 px): the Workspace pane on the left (Loose list as compact rows,
  filters, suggestions, Select, drag onto tiles all kept), project tiles on the right. Under 1024 px
  a **Workspace / Projects switch** (Workspace first, remembered per browser).
- **The search box** ("Find anything: notes, tasks, docs, projects") now searches everything: from
  2 letters, results replace the Loose list: _Best match_ (only for 3+ words or thin word matches,
  placeholder "Reading what you meant…", disappears when it comes back empty/unavailable),
  _In your Workspace_, _Projects_, _In your projects_, each with "Show N more". Rows show where it
  lives, kind, state, due date, age, and the matched words inside the text. Tiles still narrow by
  name; while searching the results take the wider side. Nothing found → "Save "…" as a note".
- **Item links**: opening any card or reader item writes `?open=project:<id>` / `?open=task:<id>`
  (also `document:` `goal:`; `note:`/`doc:` accepted) into the address. Refresh reopens it, Back
  steps reader → card → clean /projects, and `/projects?open=kind:id` from anywhere opens it (an
  item that's gone or hidden gives a quiet toast).
- **⌘K anywhere** (and a search button with ⌘K in the desktop nav): on /projects it focuses the
  page's box; elsewhere a window with the same rows, ↑/↓/↵/esc, landing on /projects?open=….
  Editors keep their own ⌘K (CodeMirror insert-link).

Files: `components/workspace/{find-model.ts,find-search.svelte.ts,find-bridge.ts,FindRow,FindResults,FindPalette}.svelte`,
`server/workspace/find.service.ts`, `routes/api/workspace/find/{+server.ts,best/+server.ts}`,
`routes/projects/{+page.svelte,+page.server.ts}`, `projects/desktop/ProjectDesktop.svelte` (split,
switch, URL-synced open, exported `openAt`), `workspace/{LooseCard,WorkspaceShelf}.svelte` (compact
rows), `layout/Navigation.svelte` (find button), `routes/+layout.svelte` (⌘K + lazy palette).

Checks (all free):

- vitest (narrow): find-model 7, find.service 12, find-search 6, ProjectDesktop 10 (+1 openAt test;
  2 expectations updated for the new `?open=` URLs, fixture gained `url`), workspace suites: 66/66.
- `pnpm --filter @buildos/web check`: 0 errors. ESLint + Prettier on touched files: clean. Svelte
  autofixer on every touched .svelte: no issues in new code; the remaining "pushState/goto without
  resolve()" items are the rule the repo turns off on purpose (eslint.config.js) and match the
  surrounding code.
- Browser, DJ's real data on local dev (best-match fetch stubbed in the tab, so **0 model calls**;
  confirmed `llm_usage_logs` has 0 `workspace_find_best_match` rows): split pane, "gunsm" → 3 docs
  with marked snippets, open → The Cadre Content Operations card + doc in reader, refresh on
  `?open=task:…` reopens the loose task, Back x2 → clean /projects, 3-word query shows word matches
  at once + best-match placeholder, ⌘K on /history → palette → ↓ ↵ → /projects?open=document:…
  opened, ⌘K on /projects focuses the box, light + dark.

Not verified:

- **Hydrated phone layout** (switch, pane/tiles toggle): the popup trick was blocked this session;
  the server-rendered page at 390 px has no horizontal scroll and the box fits. Needs a real
  phone/DevTools look.
- **Best match live** (paid, below). "Save as a note" not clicked (would write to DJ's Workspace);
  the capture call is the existing endpoint.

Paid check for DJ's OK: 10 real searches through `POST /api/workspace/find/best` on DJ's account
(5 vague 3+ word descriptions of known items, 3 typo'd single words, 2 that should find nothing).
Model: `typesafe/jev-1.13` (Jev, hop 1 + entity-stage hop 2 in ≤3 projects). Estimate from the
11-01 measured $0.00075/global Jev turn: ≈ $0.001 a search → **≈ $0.01–0.02 total**. Pass = right
item in the best match for ≥4/5 vague, quiet empty for the 2 misses, p50 under ~2 s.

Left open: 146's "project chat can't edit a Workspace item" (update tools are project-scoped; not
small, untouched). The Done filter/sort from the spike's C build list were skipped: search covers
done tasks (struck through).
