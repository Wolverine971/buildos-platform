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

| Screen / state        | Trigger                    | Content                                                                                                           |
| --------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Loading               | `loading` (during `/full`) | centered spinner                                                                                                  |
| Create (New Document) | no `activeDocumentId`      | Title / Description / State + editor + Cancel/Create. No sidebar chrome, publish, or history                      |
| Edit                  | `activeDocumentId` set     | two-column: editor (main) + right sidebar (settings, collaboration, tags/metadata, publish, 5 collapsibles, move) |
| Comparison            | `comparisonMode`           | `DocumentComparisonView` replaces the editor in place                                                             |
| Archived              | `stateKey === 'archived'`  | footer swaps to Restore / Delete Permanently                                                                      |

**Responsive split:** desktop = right sidebar (`lg:w-64/72`); mobile = a bottom tabbed
panel (Details / Links / Media / History / Comments). Autosave (2s debounce) runs alongside
a manual Save (which forces a version snapshot).

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

## Streamlining note (product call, not a Hyperplexed pattern)

Autosave (2s) and a manual **Save** coexist, and Save's real job is forcing a version snapshot —
but the label reads as "the autosave isn't real." Worth a product decision (lean on the autosave
status as source of truth and relabel, e.g. "Save version"). Not changed here — out of scope for a
visual pass, and it touches save semantics.

## Verification

- ✅ `pnpm check` — 0 errors / 0 warnings.
- ✅ `pnpm format` (Prettier) applied.
- ⬜ **Live before/after pass still owed** (desktop + iPhone width, light + dark) — the standing
  program gap. Specific calls to confirm live: the restrained publish-panel colour in dark mode,
  the mobile tab scroll-fade against `bg-muted` in both themes, and the More-menu positioning at
  phone width.
