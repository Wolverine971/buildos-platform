<!-- apps/web/docs/technical/components/hyperplexed/DOCUMENT_MODAL_AUDIT_2026-07-06.md -->

# Document Modal — Hyperplexed Audit (2026-07-06)

> Surface: `apps/web/src/lib/components/ontology/DocumentModal.svelte` (the markdown
> document create/edit modal, its right sidebar, mobile tabbed panel, and its
> publish-confirm sub-modal). Audited against the
> [Hyperplexed Design Playbook](./HYPERPLEXED_DESIGN_PLAYBOOK.md) rubric with fixes
> keyed to [`HYPERPLEXED_FIX_PATTERNS.md`](./HYPERPLEXED_FIX_PATTERNS.md).
>
> No prior audit existed for this surface — this is the first. Stacks with
> `DESIGN_AUDIT_2026-06-12.md` (Inkprint tokens) and `MOBILE_EXPERIENCE_AUDIT_2026-06-12.md`.

## Flow map (the screens this one component shells)

| Screen / state        | Trigger                    | Content                                                                                                                     |
| --------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Loading               | `loading` (during `/full`) | centered spinner                                                                                                            |
| Create (New Document) | no `activeDocumentId`      | Title / Description / State + editor + Cancel/Create. No sidebar chrome, publish, or history                                |
| Edit                  | `activeDocumentId` set     | content-first editor + right-edge Details tab; tab opens settings, collaboration, tags/metadata, publish, history, and move |
| Comparison            | `comparisonMode`           | `DocumentComparisonView` replaces the editor in place                                                                       |
| Archived              | `stateKey === 'archived'`  | footer swaps to Restore / Delete Permanently                                                                                |

**Responsive split:** desktop = right details drawer (`lg:w-64/72`), closed by default and opened
from an edge-anchored tab; mobile = a bottom tabbed panel (Details / Links / Media / History /
Comments). Autosave (2s debounce) runs alongside a manual Save (which forces a version snapshot).

**Sub-modals (10):** archive-confirm, permanent-delete, discard-changes, insert-image,
publish-confirm/preview, move, version-restore, chat, and Task/Plan/Goal/Document link modals.

## What shipped (2026-07-06)

DJ approved **Tier 1 + all Tier 2**. All applied in one pass; `pnpm check` clean
(0 errors / 0 warnings), Prettier applied. Net **−335 lines** (789 deleted, 454 added),
driven by the duplication collapse.

### Tier 1 — radius / labels / scale

- **T1-1 · Corner-radius drift → P2.** Bare `rounded` (4px) → `rounded-md` on the header
  action buttons, the FileText badge, and the conflict-banner buttons. (Public-page action
  buttons were rebuilt at `rounded-md` as part of T2-1.)
- **T1-2 · Square error banner → P2.** The global form-error banner had no radius while the
  conflict banner above it was `rounded-lg`; added `rounded-lg` so it stops reading as a square outlier.
- **T1-3 · Off-scale type → P5.** All `text-[11px]` (publish panel + slug helpers) normalized
  to `text-xs`. **Carve-out:** the mobile tab-chip labels (`text-[10px]`) and the count/status
  badges (`text-[0.6rem]`/`text-[0.55rem]`) are a deliberate chip/badge scale and were left as-is.
- **T1-4 · Redundant twin labels → P6.** The editor header showed both **CONTENT** (left) and
  **MARKDOWN** (right) for the same field; dropped MARKDOWN (markdown affordances live in the
  editor toolbar).
- **T1-5 · Raw UUID "ID" row → deferred by choice.** Kept in the metadata block (may be used
  for copy/debug); low value, revisit if it earns removal.

### Tier 2 — declutter / hierarchy / dedup / a11y

- **T2-1 · Publish panel de-duplicated (biggest win) → declutter/merge-duplicate-paths.** The
  ~240-line live-page/publish block existed twice (desktop sidebar + mobile Details tab) and had
  to be hand-synced. Extracted into shared top-level `{#snippet}`s rendered in both places:
  `publicPagePanel()`, `metadataBlock()`, `moveButton()`, and `saveStatusIndicator()` (the
  save-state chip was also duplicated header/content). This is the source of the −335 net lines.
- **T2-2 · Header consolidation → P8.** The 5-icon header (Copy-URL, Open-page, Export, Chat,
  Close) collapsed to **[More ⋯] [Chat] [Close]**. Copy document URL, Open document page, and the
  three Export formats now live in one `MoreHorizontal` overflow menu (copy/open shown only when
  editing; export always). Uncrowds the header, especially on mobile.
- **T2-3 · Mobile tabs → a11y + scroll cue (P13).** Tab bar rewritten data-driven from a
  `mobileTabs` derived list: `role="tablist"` + `role="tab"` + `aria-selected`, roving tabindex
  via `handleRovingTabKeydown` (board-a11y), a `role="tabpanel"` + `aria-labelledby` link, and a
  static right-edge gradient fade so the off-screen tabs signal "more" (the row is `scrollbar-hide`).
  Tap targets bumped to `min-h-[36px]`.
- **T2-4 · Publish-panel colour restraint → hierarchy/colour.** Previously the entire live panel
  (URL, view counts, all four buttons) turned warning-orange / success-green. Now only the **status
  label + Globe icon** carry the status colour and the container keeps a light tint
  (`border-*/40 bg-*/5`); body text is `text-muted-foreground`/`text-foreground` and the action
  buttons are neutral (Copy/Open bordered, Edit = accent ghost, Unpublish = destructive ghost).
- **T2-5 · Hierarchy inversion fixed.** Public Page is now a collapsible section (consistent with
  Linked Entities / Images / etc.) that **auto-expands only when the page is live or has a
  non-default status** (see `loadPublicPageState`); drafts keep it collapsed with a glanceable
  `LIVE` / `ATTENTION` / `UNPUBLISHED` pill on the header so the secondary publish chrome no longer
  outweighs the editor.
- **T2-6 · Tap targets → P13 (partial).** Publish-panel buttons `min-h-[32px]`→`min-h-[36px]`;
  mobile tabs `min-h-[36px]`. **Deferred:** the header icon buttons stay `h-9 w-9` (36px) — bumping
  to 44px changes the whole modal header height and is a repo-wide icon-button convention; left for
  a systemic decision.
- **T2-7 · Footer grouping → "group by meaning".** Added a vertical divider between the destructive
  Archive and the constructive Add Child so they stop reading as one cluster.

### Tier 3 — none

A dense editing modal doesn't earn a signature effect. Two motion nits left as follow-ups (small):
the desktop-comments `transition-[max-height]` isn't reduced-motion gated (→ P11), and the sidebar
collapsibles snap open without `slideMotion()` (optional polish).

## Follow-up — edge-anchored details drawer (2026-08-04)

Screenshot review showed that the first collapsible-sidebar pass solved the static-rail noise but
put its labeled **Details** toggle into an already-busy header. The toggle now lives as a 44px-wide
vertical tab on the modal's right edge. It travels with the drawer seam while open, remains the one
open/close control, and keeps keyboard focus mounted throughout the transition. The drawer still
defaults closed for every document session; `aria-expanded`, `aria-hidden`, and `inert` expose the
same state to assistive technology. The title remains in the editor while closed, and mobile keeps
the existing bottom-panel treatment. Motion is synchronized at 280ms and removed under reduced
motion. This is the reference implementation for the later goal/plan/task modal rollout (→ P23,
stacking P2/P9/P11/P13).

## Follow-up — docked Document Interact workbench (2026-08-12)

Screenshot review exposed a second overlay problem: **Document Interact** opened as a 384px floating
chat panel inside the document modal. It obscured the text the user was asking about, collided visually
with the Details drawer, and introduced another detached scroll region.

The interaction surface now opens as an in-flow bottom workbench across the modal. Opening it reserves
a bounded `clamp(18rem, 42dvh, 30rem)` region and shrinks the editor instead of covering it. The Details
drawer remains independently available on the right, so the document, interaction history/composer,
and document settings can be visible together without turning the editor into a narrow center column
(→ P1/P11/P13/P24).

The launcher now toggles open/closed, exposes its active state, and retains `aria-controls` /
`aria-expanded`. The dock uses `aria-hidden` + `inert` while its lazy-loaded chat remains mounted,
the close target is 44px, long conversation content is capped to a readable measure on wide docks,
and the panel's entry animation is removed under reduced motion. On smaller screens, opening Interact
collapses the competing mobile details tab and desktop comments disclosure before claiming vertical
space (→ P1/P9/P11/P13/P24).

## Follow-up — minimal editor and dense, scrollable Details (2026-08-12)

The main workspace no longer repeats the editable title above the document or labels the editor
`CONTENT`. The header remains the compact read-only identity and save-status surface; title,
description, and state editing now live together in one shared Details-fields snippet rendered in
the desktop rail and mobile Details tab. This intentionally supersedes P23's earlier document-title
carve-out at the user's direction. A title validation failure opens both responsive Details states,
so create mode still leads directly to the required field (→ P4/P6/P13/P23).

The desktop rail now has a non-scrolling compact header and one explicit
`min-h-0 flex-1 overflow-y-auto` body instead of asking the entire rail to own overflow. Compact
field spacing removes unused optional/error reservation, created/updated metadata shares a two-column
row, and Linked Entities owns one collapsed disclosure rather than appearing under a duplicate outer
heading. The result fits more settings before the fold while expanded publishing, link, media, and
history sections remain independently scrollable (→ P1/P4/P6).

## Follow-up — condensed Document Interact conversation (2026-08-12)

The first docked workbench still reused the full agent-chat shell, so a repeated document header,
Chat/Steps/Tools/Changes tabs, run telemetry, and a large new-chat suggestion card competed with the
document. The document-focused variant now keeps the same conversation engine and composer while
reducing the dock to a 36px context rail, one scrollable message region, and the existing input bar.
It removes the activity tabs and run dock, uses a quiet document-specific empty state and placeholder,
and shortens the workbench to `clamp(15rem, 34dvh, 24rem)` so the source document remains the dominant
surface (→ P1/P4/P6/P24).

The compact mode is an explicit option on the shared agent chat rather than a second implementation.
Message history, streaming, document mutations, attachments, and voice input continue through the
same underlying controllers; only the embedded presentation is reduced. Compact message cards also
drop excess padding and shadow without changing the full-page agent-chat experience.

## Streamlining note (product call, not a Hyperplexed pattern)

Autosave (2s) and a manual **Save** coexist, and Save's real job is forcing a version snapshot —
but the label reads as "the autosave isn't real." Worth a product decision (lean on the autosave
status as source of truth and relabel, e.g. "Save version"). Not changed here — out of scope for a
visual pass, and it touches save semantics.

## Verification

- ✅ `pnpm check` — 0 errors / 0 warnings.
- ✅ `pnpm format` (Prettier) applied.
- ✅ 2026-08-04 edge-tab follow-up: focused `DocumentModal` suite passes 7/7; full
  `svelte-check` reports 0 errors / 0 warnings.
- ✅ 2026-08-12 docked-interaction follow-up: Svelte autofixer and full `svelte-check` are clean;
  the focused `DocumentModal` suite passes 9/9, including in-flow placement and simultaneous
  Details visibility.
- ✅ 2026-08-12 editor/details density follow-up: Svelte autofixer and full `svelte-check` are clean;
  the focused `DocumentModal` suite passes 10/10, including the dedicated rail scroll owner,
  duplicate-title removal, and required-title Details reveal.
- ✅ 2026-08-12 condensed-interaction follow-up: Svelte autofixer is clean; focused DocumentModal,
  AgentComposer, and AgentChatActivityTabs suites pass 17/17. Authenticated desktop-dark inspection
  confirms a 36px context rail, no activity tabs, a scrollable message region, and the
  document-specific composer placeholder at a 1280×720 viewport.
- 🔶 The current repository-wide `pnpm check` reaches no diagnostics in the touched interaction
  files, but is blocked by an unrelated invalidly placed `{@const}` in
  `src/routes/dashboard/calendar/+page.svelte:959`.
- 🔶 Authenticated desktop-dark screenshots captured the first collapsible-drawer pass and exposed
  the busy-header regression. The refined edge-tab after-state plus light-mode and iPhone captures
  remain owed. The condensed interaction after-state still needs authenticated light-mode and iPhone
  captures. The original publish-panel, mobile scroll-fade, and phone More-menu checks remain part of
  that pass.
