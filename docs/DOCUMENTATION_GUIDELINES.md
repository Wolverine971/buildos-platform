<!-- docs/DOCUMENTATION_GUIDELINES.md -->

# Documentation Guidelines

**Last Updated:** 2026-08-19
**Enforced by:** `pnpm check:doc-health` (runs in `pre-push`)

---

## The problem this file exists to prevent

This repo has ~1,700 tracked markdown files outside the marketing and archive lanes.
Most of them are **point-in-time artifacts** — an audit, a plan, a handoff, a phase
report — written in the present tense at a moment that has passed. There are more
than 300 live documents with "agentic chat" in the filename alone.

That is not a tidiness problem. It is a **retrieval** problem. When an agent greps
for how a subsystem works, a June audit and today's reference doc look equally
authoritative. The agent picks wrong, and confidently acts on a system that no
longer exists.

So the rule is not "write less documentation." It is:

> **Every document must make its own currency legible.**
> A reader — human or agent — must be able to tell in one line whether this
> describes the system now, or the system as it was.

---

## Two kinds of document

### Reference — describes the system _now_

Kept current. Corrected when the code changes. Examples:
`apps/web/docs/features/agentic-chat/README.md`,
`docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md`, `CLAUDE.md`.

Requirements:

- A `> Last updated: YYYY-MM-DD` line near the top.
- Every file path and database table it names must actually exist.
- When the code moves, this doc moves with it, in the same change.

### Point-in-time — describes a moment

Audits, plans, handoffs, phase reports, evidence, migration progress, session logs.
These are the majority. They are **not** wrong to write — they are the working record.
They are only dangerous when they masquerade as reference.

Requirements:

- A status banner at the top. `pnpm fix:doc-health` writes it for you:

    ```
    <!-- doc-status: point-in-time -->
    > **Point-in-time document.** Written 2026-08-19; describes the state of the
    > system at that moment. It is not a current reference. Verify against code
    > before acting on anything here.
    ```

- Date in the filename (`_2026-08-19`) when it belongs to a dated effort.
- Never edit one to "bring it up to date." Write a new one and link back. A doc
  that gets retroactively edited loses the only thing that made it trustworthy —
  that it was an honest record of a specific moment.

---

## Where documents go

Measured from where they actually land, not from where an old policy wished they would:

| Kind                             | Location                                                      |
| -------------------------------- | ------------------------------------------------------------- |
| Plans, handoffs, kickoffs        | `docs/plans/`                                                 |
| Evidence, gate results, run logs | `docs/plans/evidence/`                                        |
| Architecture decisions (ADRs)    | `docs/architecture/decisions/`                                |
| Cross-cutting architecture       | `docs/architecture/`                                          |
| Cross-cutting diagrams           | `docs/architecture/diagrams/`                                 |
| Product specs                    | `docs/specs/`                                                 |
| Research                         | `docs/research/`                                              |
| Technical reviews                | `docs/technical/reviews/`                                     |
| Web feature docs                 | `apps/web/docs/features/<feature>/`                           |
| Web technical + audits           | `apps/web/docs/technical/`, `apps/web/docs/technical/audits/` |
| Worker docs                      | `apps/worker/docs/`                                           |
| Package docs                     | `packages/<pkg>/docs/`                                        |
| Work tracking                    | `tasker/`                                                     |
| Marketing                        | `docs/marketing/` (own lane, not health-checked)              |
| Retired material                 | `docs/archive/` (not health-checked, excluded from search)    |

`thoughts/` and `apps/web/thoughts/` were the research homes under the October 2025
policy. Both were archived to `docs/archive/thoughts/` on 2026-08-19. Do not
re-create them.

---

## The health gate

`pnpm check:doc-health` fails `pre-push` on two conditions:

1. **dead-schema** — the doc puts a table or function in query position
   (`FROM x`, `.from('x')`, `.rpc('x')`, `CREATE INDEX ... ON x`) that no longer
   exists in `packages/shared-types/src/database.types.ts`.
2. **dead-paths** — four or more repo paths are cited and at least 60% are gone.

It also reports **unstamped** point-in-time docs (non-blocking).

Fixing a failure, in order of preference:

1. **Correct the doc.** Usually right for reference docs — a renamed table is a
   one-line fix, and leaving it wrong costs an agent a whole wrong turn.
2. **Stamp it** with `pnpm fix:doc-health`, if the doc is a historical record.
   Stamped docs are exempt from the path check; the banner already warns the reader.
3. **Mark an intentional exception**, when the doc deliberately describes something
   proposed, removed, or fictional:

    ```
    <!-- doc-health: ignore-schema — proposes tables that were never built -->
    <!-- doc-health: ignore-paths — file paths in these examples are placeholders -->
    ```

    Always include the reason. The marker is visible to whoever reads the doc, which
    is the point — it tells them what to distrust.

The gate never touches `docs/archive/`, `docs/marketing/`, `apps/web/src/content/`
(published content), generated files, agent config in `.claude/` or `.codex/`, or
anything outside a documentation tree.

---

## Agent instruction files are held to a stricter bar

`CLAUDE.md`, `AGENTS.md`, `.claude/agents/*`, `.claude/skills/*`, `.claude/commands/*`
load into an agent's context and are read as **instructions**, not description.

- **Never name a tool, skill, agent, script, or table you have not verified exists.**
  A phantom instruction is worse than no instruction: the agent burns a turn hunting
  for it, or silently pretends it complied.
- **Do not teach the model things it already knows.** A frontier model does not need
  a WCAG primer, a git tutorial, or a tool comparison. Every such token displaces
  context that is actually about BuildOS. If a paragraph would be equally true at any
  other company, delete it.
- **Keep them short.** These files are paid for on every single turn.

---

## Checklist before committing a doc

- [ ] Reference or point-in-time — and is that visible in the first five lines?
- [ ] Do the file paths resolve?
- [ ] Do the table and function names exist in `database.types.ts`?
- [ ] If it supersedes an older doc, does it link to it, and does that doc link forward?
- [ ] `pnpm check:doc-health` passes.
