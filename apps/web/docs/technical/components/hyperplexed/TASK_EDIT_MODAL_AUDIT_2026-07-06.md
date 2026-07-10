<!-- apps/web/docs/technical/components/hyperplexed/TASK_EDIT_MODAL_AUDIT_2026-07-06.md -->

# Hyperplexed Audit — Task Edit Modal

**Surface:** `apps/web/src/lib/components/ontology/TaskEditModal.svelte`
**Audited:** 2026-07-06 · **Method:** static markup pass against [playbook](./HYPERPLEXED_DESIGN_PLAYBOOK.md) §1–§2, fixes cite [`HYPERPLEXED_FIX_PATTERNS.md`](./HYPERPLEXED_FIX_PATTERNS.md).
**Prior art:** none (first audit of this surface). Stacks with `DESIGN_AUDIT_2026-06-12.md` (tokens) and `MOBILE_EXPERIENCE_AUDIT_2026-06-12.md` (density).

---

## Flow & screen map

Single XL `Modal` (`size="xl"`, custom header/footer snippets) that resolves into:

| #   | Screen / state           | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | **Loading**              | centered spinner while `/api/onto/tasks/[id]/full` loads                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 0b  | **Not found**            | "Task not found" if the load fails                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 1   | **Edit (main)**          | 2-col grid on `lg+`, single col below. **Left:** Title (+ AI auto-generate), Description, error banner. **Right rail:** ① Collaboration ② Workflow (State/Priority/Assignees) ③ Timeline (due badge, overdue alert, Start/Due, Repeat + series setup, inline Delete-Series) ④ Tags (conditional) ⑤ Linked Entities (accordion, open) ⑥ Images (accordion) ⑦ Activity (accordion) ⑧ Details (read-only Type/Created/Updated). **Below (left col, row 2):** Comments thread |
| —   | **Footer**               | Delete (left) · Cancel + Save (right)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2   | **Delete confirm**       | `ConfirmationModal` + "also delete calendar events" checkbox                                                                                                                                                                                                                                                                                                                                                                                                              |
| 3   | **Series setup**         | lazy `TaskSeriesModal`                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4   | **Series delete**        | inline two-button confirm (Delete Upcoming / Force Delete All)                                                                                                                                                                                                                                                                                                                                                                                                            |
| 5   | **Nested entity modals** | Goal / Plan / linked-Task (recursive `TaskEditModal`) / Document, all lazy                                                                                                                                                                                                                                                                                                                                                                                                |
| 6   | **Chat about task**      | lazy `AgentChatModal` from the brain-bolt header button                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Overall read:** the architecture (content-left / controls-right rail + activity below) is the right one — it's the Linear issue-view pattern. The problems were execution: an over-chromed, label-drifted rail; a mobile stacking order that buried the primary controls under the comments thread; and read-only metadata carrying the same visual weight as editable fields. The fix was to **quiet and reorder**, not to restructure into tabs.

---

## Findings & disposition

Scope applied (DJ, 2026-07-06): **Recommended 80% = all Tier 1 + T2-1 + T2-2 + T2-4.** Rail quieted Linear-style. Brain-bolt chat button kept (brand).

### Tier 1 — cheap, high-impact ✅ shipped

- **Micro-label drift → P5.** 6 section labels (Workflow/Timeline/Tags/Linked/Images/Activity) hand-rolled `text-[11px] … tracking-[0.14em]`, plus a `tracking-[0.18em]` card eyebrow. All unified to the global `.micro-label font-semibold` (`inkprint.css:533`).
- **Quiet the rail → P6 + declutter.** Removed the `CardHeader` "Controls / Task operations" eyebrow+heading (two labels for one rail; the Linear reference has none).
- **Rename "Record" → "Details" → P6.** Plus demoted (see T2-2).
- **Workflow section icon `Users` → `SlidersHorizontal` → P9.** `Users` read as "assignees" and collided with the adjacent `EntityCollaborationAction` (which correctly leads with `Users`). Now two adjacent sections no longer share a glyph.
- **Two-radius drift → P2.** Header icon box, chat button, close button `rounded` (0.25rem) → `rounded-md`.
- **Assignees a11y → P13.** `<p>Assignees</p>` → `<label for={assigneesGroupId}>` with a matching `id` on the selector wrapper (scoped per-task so nested modals stay unique).

### Tier 2 — structural ✅ shipped (partial; one deferred)

- **T2-1 Mobile source order.** The left column (Title/Description/**Comments**) stacked entirely above the rail, so phones showed a comments thread between the description and the primary edit controls. Restructured into **three explicit grid children** — form (`col-span-2`/`col-start-1`/`row-start-1`), rail (`col-start-3`/`row-start-1`), comments (`col-span-2`/`col-start-1`/`row-start-2`). Desktop visual unchanged; mobile now renders form → controls → comments.
- **T2-2 Quiet + demote metadata → P4.** "Details" (Type/Created/Updated) moved to the very bottom of the rail and rendered as plain `text-xs text-muted-foreground` `<dl>` subtext (no icon, no eyebrow) instead of a full section with a uppercase micro-label.
- **T2-4 Collapsible motion → P11.** Linked/Images/Activity bodies now use `transition:slide={slideMotion()}` (reduced-motion-safe) instead of an abrupt `{#if}`.

### Deferred / carved-out

- **T2-3 Destructive series management (deferred — needs DJ input).** "Delete Series" → two red buttons (Delete Upcoming / Force Delete All) still lives inside the Timeline sub-section next to the date fields. It's a distinct, dangerous action co-located with routine editing ("add separation between distinct actions"). Not moved — DJ to decide the target (own sub-block vs. overflow).
- **T3-1 Header status badge (deferred — optional).** `stateMeta`/`priorityMeta` (rich labels + variants) are computed but used only in aria-labels; surfacing a quiet state/priority badge in the header would make status glanceable with no new data. Not applied.
- **Brain-bolt `.webp` chat button (accepted brand exception).** A raster glyph among lucide icons (the "chat-launcher img stack" deferred from the nav audit). DJ chose to keep it as a deliberate brand mark; only its container radius was aligned. Not a defect to fix — documented as an intentional carve-out. → P9
- **Cross-modal note (out of scope).** `TaskCreateModal` uses an uppercase `tracking-wider` Title label while this modal uses sentence-case; the edit modal's sentence case is the cleaner pattern. Reconcile when the create modal is audited.

---

## Verification

- `pnpm svelte-check` (8 GB heap; 4 GB OOMs on this app) → **0 errors, 0 warnings.**
- `prettier --check` → clean.
- **Live before/after screenshot pass still owed** (desktop + iPhone width, light + dark) — the program's standing gap. Confirm on the live pass: (1) the three-child grid re-collapses cleanly at the `lg` breakpoint boundary; (2) the demoted Details `<dl>` reads as quiet subtext, not a hierarchy drop-out; (3) `slideMotion` collapse timing on the three accordions.

### Long-description follow-up — 2026-07-10 ✅ shipped

- **Modal breathing room.** The task-specific shell now expands to `max-w-7xl` on large screens and up to `92dvh` from `sm` upward. Mobile keeps the base modal's near-full-height safe-area strategy.
- **Description overflow → P1.** The description keeps a comfortable four-row minimum, then uses the shared `Textarea` auto-resize behavior to grow with its content up to 16 rows. Beyond the cap, the editor owns a clear internal scroll region while the modal retains its outer scroll for the rest of the form.
- **Live stress check.** A temporary component harness using the real `Modal` and `Textarea` primitives was checked with a 24-paragraph description at 1440×900 and 390×844 in light and dark mode. Desktop resolved to a 1280px shell with a 384px description editor; phone resolved to a 390px shell with the same capped editor and no horizontal overflow. Authenticated task-data verification is still owed.
- `pnpm check` → **0 errors, 0 warnings.** `prettier --check TaskEditModal.svelte` → clean.

---

## Applied file

`apps/web/src/lib/components/ontology/TaskEditModal.svelte` — initial 10-transform audit pass plus the 2026-07-10 shell-sizing/description-growth follow-up; Prettier-formatted and svelte-check clean.
