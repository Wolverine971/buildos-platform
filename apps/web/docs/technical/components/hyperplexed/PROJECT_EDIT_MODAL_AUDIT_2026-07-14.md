<!-- apps/web/docs/technical/components/hyperplexed/PROJECT_EDIT_MODAL_AUDIT_2026-07-14.md -->

# Project Edit Modal Mobile Audit — 2026-07-14

## Target and evidence

- Surface: `OntologyProjectEditModal.svelte`
- Trigger: project detail page → Edit project
- Evidence: user-provided iPhone dark-mode screenshot showing the Timeline date controls escaping their grid track, oversized Record metadata, and unused space below the content-height modal.
- Regions reviewed: modal shell, header metadata, main editor, settings rail, Timeline, record metadata, comments, and sticky footer.

## Tier 1 — cheap, high-impact

- **Modal shell:** mobile used a content-height centered dialog, leaving avoidable exterior space while the form still scrolled. The dialog now fills the safe mobile viewport, keeps its header/footer fixed, uses `px-2` mobile shell padding, and retains the desktop height cap. → P3
- **Settings rows:** fixed label columns plus intrinsically sized native controls let iOS date UI escape the card. Every rail row now uses a shrink-safe `minmax(0, 1fr)` contract, `min-w-0` control wrappers, and a narrower mobile label column. → P1
- **Timeline:** native date rendering is clipped to the field, its browser indicator is replaced by one in-flow Lucide affordance, and the visible value is consistently rendered as `Jan 21, 2026` / `Not set` without changing native picker behavior. → P1+P9+P13
- **Record metadata:** the full Record section heading/icon and two wide rows were demoted to a compact two-column `<dl>` with semantic `<time>` values. → P4+P6
- **Section language:** hand-rolled uppercase tracking was replaced with the shared `.micro-label`; card/header radii now follow the two-radius vocabulary. → P2+P5

## Tier 2 — structural within the surface

- **Settings header:** redundant “Controls / Project operations” copy became the single plain label “Project settings.” → P6
- **Mobile density:** the main editor no longer imposes a `50vh` minimum on phones; shell gaps, rail padding, and footer padding step up only at larger breakpoints. No fields or actions were hidden. → P3+P8
- **Date metadata:** shared defensive date formatters now drive both header subtext and record metadata, while the modal has an accessible dialog label. → P4+P13

## Tier 3 — polish/signature

- None. This is a dense editing surface; the useful polish was geometry and hierarchy, not another effect.

## Follow-up bug hardening

- **Date save semantics:** unchanged stored timestamps are compared by their visible `YYYY-MM-DD` value, so Save no longer rewrites a date to midnight just because the original value also contains a time. Deliberate date edits still serialize to midnight UTC.
- **Validation and keyboard submit:** the detached footer form now has a per-instance ID and owns the name, select, next-move, and date controls through explicit form association. Required-name and date-range rules therefore apply to keyboard/native submission, with defensive handler validation as a fallback.
- **Date control states:** the compact fields now keep a visible outer focus ring, use a 16 px mobile input size, dim their custom value/icon while disabled, and reject impossible date labels instead of allowing JavaScript date rollover.
- **Save-state integrity:** markdown editors are disabled while a save is running, preventing changes made mid-request from leaking into the request body. Their visible headings now provide programmatic labels, and save errors are announced as a live alert.
- **Header timestamp wrapping:** the separator is grouped with the Updated timestamp and only renders when a valid Created timestamp precedes it, preventing an orphan dot at narrow widths or with malformed metadata.

## Verification

- `pnpm --filter @buildos/web check` — final follow-up pass completed at 0 errors / 0 warnings.
- `pnpm exec vitest run src/lib/components/ontology/OntologyProjectEditModal.test.ts` — 3/3 tests pass, covering unchanged timestamp preservation, intentional date serialization, and reversed-range rejection.
- Svelte autofixer — initial implementation pass resolved its actionable keyed-loop findings. Remaining observations were pre-existing/intentional: the explicitly escaped entity-reference preview using `{@html}`, the draft-reset `$effect`, and the named children snippet required by the modal composition. The follow-up changes were additionally compiled by Vitest/Vite and the zero-diagnostic Svelte check.
- Local browser fixture:
    - 320×700 light: zero body or modal-content horizontal overflow; both date controls remained inside their 209px field track.
    - 390×844 light and dark: zero body or modal-content horizontal overflow; footer stayed anchored and Timeline/record metadata remained fully readable.
    - 1440×900 dark: 1280px dialog, 0 horizontal overflow, desktop two-column composition intact.
- Still owed: authenticated real-project smoke test and physical iOS Safari picker interaction. The visual after-state was tested against the supplied iPhone before-state, but not on that device.
