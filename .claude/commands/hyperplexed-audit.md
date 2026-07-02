---
description: Audit a BuildOS surface against the Hyperplexed playbook, propose tiered fixes, apply approved ones via the P-pattern recipes.
argument-hint: "[component or page — path or name, e.g. BrainDumpModal]"
path: .claude/commands/hyperplexed-audit.md
---

# Hyperplexed Audit — BuildOS

You are auditing one BuildOS surface with Hyperplexed's eye: alignment first, declutter second, hierarchy by type not addition, copy as a design surface, motion restrained and gated. The rubric is the playbook; the fixes are the P-patterns. You audit, propose, **wait for DJ**, then apply only what's approved.

## The doc system (read before auditing)

| Doc | Role |
|-----|------|
| `apps/web/docs/technical/components/hyperplexed/HYPERPLEXED_DESIGN_PLAYBOOK.md` | The rubric — §1 taste checklist, §2 interaction/motion, §3 BuildOS lenses |
| `apps/web/docs/technical/components/hyperplexed/HYPERPLEXED_FIX_PATTERNS.md` | The recipes — cite every finding as `→ P#`; add P-numbers when a fix is new and reusable |
| `apps/web/docs/technical/components/hyperplexed/HYPERPLEXED_AUDIT_TRACKER.md` | The rollup — one row per surface, backlog, in-repo exemplars |
| `apps/web/docs/technical/components/hyperplexed/*_AUDIT_*.md` | Prior audits — **check for one covering this surface first; stack, don't duplicate** |

Inkprint (`INKPRINT_DESIGN_SYSTEM.md`) still governs tokens and posture — the playbook adds precision, it never overrides Mode A restraint.

## If invoked without a target

Ask for the surface (component path or name, or a route). Otherwise: start.

## Process

### 1. Locate + prior art

- Resolve the target to concrete files (component + its children; for a route, the `+page.svelte` and its main components).
- Search the hyperplexed dir and `apps/web/docs/technical/audits/` for a prior audit of this surface. If one exists, read it — new findings stack on top of it, and already-deferred items get re-listed, not rediscovered.
- Check the tracker for the surface's row (or note that it needs one).

### 2. Static audit (region by region)

Hyperplexed's method: never "audit the page" — enumerate the surface's regions (header, list, composer, footer…), then grade each region against playbook §1–§2. This is a markup-reading pass, same as the existing audits — no dev server needed yet.

Per region, check in this order (his leverage order):

1. Alignment & geometry, even padding (§1 top blocks — his #1 instinct)
2. Labels & microcopy — try the rename before the redesign (P6)
3. Hierarchy — demote metadata, don't add containers (P4/P5)
4. Declutter — duplicate paths, drawer-stuffing, filter sprawl (P7/P8)
5. Overflow — every user-supplied string clamped (P1)
6. Icons, imagery, scrims (P9/P10)
7. Motion & a11y — reduced-motion gating, keyboard, primitives (P11/P13, §2 a11y block)

### 3. Present findings and STOP

Report findings **tiered by leverage**, not by region:

```markdown
## Tier 1 — cheap, high-impact (alignment/padding/labels)
- [region] finding → P#
## Tier 2 — structural within the surface (declutter/hierarchy)
- …
## Tier 3 — polish/signature (motion, effects, at most one per surface)
- …
```

Every finding cites its pattern (`→ P#`, or `→ new P?` if no pattern fits). Then **stop and wait for DJ's approval/input on which fixes to apply.** Do not touch code before that.

### 4. Apply approved fixes

- Use the P-recipes verbatim where they exist (they encode the conventions: two-radius rule, shell scale, `.micro-label`, `slideMotion()`, `motion-reduce:` gating).
- If an approved fix has no pattern and a second surface will plausibly need it: add the next P-number to `HYPERPLEXED_FIX_PATTERNS.md` (same When/Recipe shape, Svelte 5 + Inkprint tokens, reduced-motion no-op mandatory) and cite it.
- Respect the protected-files rule: never edit `src/lib/components/ui/` primitives unless DJ explicitly asks.

### 5. Verify

```bash
cd apps/web && pnpm check        # svelte-check
pnpm format                      # Prettier (repo config: tabs, single quotes)
```

State results explicitly. If the fixes are visual, note that the live before/after screenshot pass (desktop + iPhone width, light + dark) is still owed — that's the tracker's verify column, and it's the program's standing gap.

### 6. Update the docs

- **Tracker:** add or update the surface's row — what shipped, what was deferred (with `→ P#`), verify status.
- **Audit doc:** if the surface warranted one (multi-region findings, deferred items), write/update `apps/web/docs/technical/components/hyperplexed/<SURFACE>_AUDIT_<date>.md`; if a prior audit exists, append to it rather than creating a second file.
- Cross-reference `DESIGN_AUDIT_2026-06-12.md` / `MOBILE_EXPERIENCE_AUDIT_2026-06-12.md` when findings overlap, so they stack.
