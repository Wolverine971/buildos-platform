---
description: Audit a BuildOS surface against the Hyperplexed playbook, propose tiered fixes, apply approved ones via the P-pattern recipes.
argument-hint: "[component or page — path or name, e.g. BrainDumpModal]"
---

# Hyperplexed Audit — BuildOS

Target surface: $ARGUMENTS

You are auditing one BuildOS surface with Hyperplexed's eye: alignment first, declutter second, hierarchy by type not addition, copy as a design surface, motion restrained and gated. The rubric is the playbook; the fixes are the P-patterns. You audit, propose, **wait for DJ**, then apply only what's approved.

## The doc system (read before auditing)

| Doc | Role |
|-----|------|
| `apps/web/docs/technical/components/hyperplexed/HYPERPLEXED_DESIGN_PLAYBOOK.md` | The rubric — §1 taste checklist, §2 interaction/motion, §3 BuildOS lenses |
| `apps/web/docs/technical/components/hyperplexed/HYPERPLEXED_FIX_PATTERNS.md` | The recipes — cite every finding as `→ P#`; add P-numbers when a fix is new and reusable |
| `apps/web/docs/technical/components/hyperplexed/HYPERPLEXED_AUDIT_TRACKER.md` | The rollup — one row per surface, backlog, in-repo exemplars. **Cell budget: status + one sentence + P-list + deferred items. History prose lives in audit docs, never here.** |
| `apps/web/docs/technical/components/hyperplexed/` (dated docs) | Prior audits — **check for one covering this surface first; stack, don't duplicate** |
| `apps/web/docs/technical/components/hyperplexed/screenshots/` | Before/after captures (gitignored — evidence persists locally, referenced by filename from audit docs) |

Inkprint (`INKPRINT_DESIGN_SYSTEM.md`) still governs tokens and posture — the playbook adds precision, it never overrides Mode A restraint.

## If invoked without a target

Ask for the surface (component path or name, or a route). Otherwise: start.

## Process

### 1. Locate + prior art

- Resolve the target to concrete files (component + its children; for a route, the `+page.svelte` and its main components).
- Search the hyperplexed dir and `apps/web/docs/technical/audits/` for prior work on this surface — match on the surface name, not just `*_AUDIT_*`: prior work also lives in `_FIX_`, `_ROLLOUT_`, and `_REASSESSMENT_` files. If found, read it — new findings stack on top, already-deferred items get re-listed, not rediscovered, and **anything in a "Rejected / carve-outs" section is settled: don't re-propose it.**
- Check the tracker for the surface's row (or note that it needs one).

### 2. Static audit (region by region)

Hyperplexed's method: never "audit the page" — enumerate the surface's regions (header, list, composer, footer…), then grade each region against playbook §1–§2. This is a markup-reading pass — no dev server needed yet.

Per region, check in this order (his leverage order):

1. Alignment & geometry, even padding (§1 top blocks — his #1 instinct)
2. Labels & microcopy — try the rename before the redesign (P6)
3. Hierarchy — demote metadata, don't add containers (P4/P5); tint and foreground must describe the same surface (P19)
4. Declutter — duplicate paths, drawer-stuffing, filter sprawl (P7/P8); badges count only state their destination owns (P22)
5. Overflow — every user-supplied string clamped (P1)
6. Icons, imagery, scrims (P9/P10)
7. Structure — secondary workflows dock or earn an edge tab, never float over the work (P23/P24); wide tables get a mobile card fallback (P12)
8. Loading & paint — the selected entity is the critical path, context enhances after first paint (P20); long public pages contain paint (P21)
9. Motion & a11y — reduced-motion gating, keyboard, primitives (P11/P13, §2 a11y block)
10. Signature delight (Tier 3 only) — at most one per surface, and only where it earns its place: cursor-glow grid (P14), magic slider (P15), spotlight-dim (P16), forgiving indicator (P17), gradient-text (P18). Every one must degrade to a fade-in under `prefers-reduced-motion` (P11).

### 3. Present findings and STOP

Report findings **tiered by leverage**, not by region:

```markdown
## Tier 1 — cheap, high-impact (alignment/padding/labels/color pairing)
- [region] finding → P#
## Tier 2 — structural within the surface (declutter/hierarchy/structure/loading — P20–P24 findings tier here)
- …
## Tier 3 — polish/signature (motion, effects, at most one per surface) → P14–P18
- …
```

Every finding cites its pattern (`→ P#`, or `→ new P?` if no pattern fits). Then **stop and wait for DJ's approval/input on which fixes to apply.** Do not touch code before that.

### 4. Capture the before-state (after approval, before any code change)

The before-state is unrecoverable once fixes land — capture it now, not at verify time.

- `pnpm dev --filter=@buildos/web`, then capture the surface with the Chrome tools at **1440×900 and 390×844, light and dark** (4 shots minimum; add real-data states if the surface has them).
- Save to `apps/web/docs/technical/components/hyperplexed/screenshots/<surface-slug>/<date>-before-<viewport>-<theme>.png`.
- Landmines: the extension's URL-safety policy must allowlist localhost (one-time setting); dev servers here have bound IPv6-only before — if `localhost:5173` refuses, try `http://[::1]:5173`.
- If capture is blocked (extension policy, auth wall), **say so and continue** — record the before-pass as *blocked* in the audit doc, never silently skip it.

### 5. Apply approved fixes

- Use the P-recipes verbatim where they exist (they encode the conventions: two-radius rule, shell scale, `.micro-label`, `slideMotion()`, `motion-reduce:` gating).
- If an approved fix has no pattern and a second surface will plausibly need it: add the next P-number to `HYPERPLEXED_FIX_PATTERNS.md` under the section it thematically belongs to (same When/Recipe shape, Svelte 5 + Inkprint tokens, reduced-motion no-op mandatory) and cite it.
- Respect the protected-files rule: never edit `src/lib/components/ui/` primitives unless DJ explicitly asks.

### 6. Verify (scoped) + capture the after-state

Full-repo checks are routinely blocked by unrelated in-flight work — scope every check to what you touched, note the unrelated blockage, move on:

- Svelte MCP autofixer on touched components, when the tool is available in the session.
- `cd apps/web && pnpm check` — read only the diagnostics for touched files; if unrelated errors block the run, name them and confirm the touched files are clean.
- Format and lint **only the touched files** (`npx prettier --write <files>`, scoped ESLint). **Never run repo-wide `pnpm format`** — DJ carries unrelated uncommitted work.
- Run the focused test suites for touched components; add coverage where the fix changed behavior.
- Capture the **after-state** at the same viewports/themes as step 4 (`…-after-…` filenames), compare against the before shots, and note confirmations/regressions in the audit doc.

State all results explicitly, including what stayed blocked.

### 7. Update the docs

- **Tracker row:** status emoji + one sentence + P-list + date, plus a short **Deferred:**/**Open:** list. That's the whole budget — shipped-changelog prose belongs in the audit doc. Flip the Live-verify cell if step 6 captured both states.
- **Audit doc:** write/update `apps/web/docs/technical/components/hyperplexed/<SURFACE>_AUDIT_<date>.md`; if a prior audit exists, append to it rather than creating a second file. Include a **`## Rejected / carve-outs`** section for anything DJ declined, so step 1 of the next run doesn't re-propose it.
- **Backlog:** if the surface came from tracker §3, remove its backlog row.
- **Reference library:** if the fix produced a new in-repo exemplar (or regressed one), update tracker §4.
- Cross-reference `DESIGN_AUDIT_2026-06-12.md` / `MOBILE_EXPERIENCE_AUDIT_2026-06-12.md` when findings overlap, so they stack.
