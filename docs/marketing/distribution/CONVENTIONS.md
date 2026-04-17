<!-- docs/marketing/distribution/CONVENTIONS.md -->

# Distribution Work — Conventions & Workflow Rules

This file is read before modifying anything in `docs/marketing/distribution/`. It also defines how to brief an agent on work from here.

---

## Naming

- **`T{NN}`** — a specific task. NN is zero-padded (T01, T12). Defined in `buildos-strat-tasks.md`. Stable.
- **`WS{NN}`** — a work stream (a cluster of related tasks). One file per work stream at `workstreams/WS{NN}-{slug}.md`.
- **Slug format** — lowercase, hyphenated, concrete: `WS01-public-pages.md`, not `WS01-work.md`.

Task IDs do not change. If scope grows, add tasks (T34+) and link them to the work stream — do not re-number existing tasks.

---

## File Schema (Workstreams)

Every workstream file has this frontmatter and structure. See `workstreams/WS01-public-pages.md` as the canonical example.

```yaml
---
id: WS01
title: Public Pages as Distribution Surface
wave_span: 1-4
status: in-progress
owner: DJ
related_tasks: [T02, T12, T13, ...]
cross_workstreams: [WS02, WS04]
last_updated: 2026-04-17
---
```

Then sections:

1. **One-line goal**
2. **Why this is a work stream** (why these tasks cluster)
3. **Status dashboard** (task table with status + spec links)
4. **Required reading** (brand guide + strategy sections)
5. **Scope / non-scope** (what's explicitly in and out)
6. **Dependency chain within this stream**
7. **Cross-workstream dependencies**
8. **Output artifacts** (where things land)
9. **Task briefs** (one short section per task)
10. **Agent assignment notes**
11. **Open questions**
12. **Change log**

---

## Status Vocabulary

| Glyph | Meaning |
|-------|---------|
| ⚪ | Not started |
| 🟡 | Ready — unblocked, awaiting pickup |
| 🔵 | In progress |
| ✅ | Done |
| ⏸ | Blocked (by another task or external dep) |
| 🔁 | Recurring (ongoing cadence in `RECURRING.md`) |

Update status in:
1. The workstream file's status dashboard
2. The `README.md` task map
3. Any spec doc or sub-file the task produced

If you only update one, you've created drift. Update all three.

---

## Cross-Linking Rules

**Every doc must link up and down:**
- Up → strategy source (`buildos-strat.md`) and task list (`buildos-strat-tasks.md`)
- Sideways → related workstreams
- Down → output artifacts (specs, deliverables, code files)

**Task IDs are the canonical cross-reference.** When referencing a task anywhere in the repo, use the ID in code (`T12`) or linked (`[T12](docs/marketing/distribution/workstreams/WS01-public-pages.md#t12)`). Don't describe the task without the ID — the ID makes it searchable.

**When a task spec lives in a better home** (e.g. T03 spec at `docs/marketing/social-media/reddit/reddit-subreddit-research-spec.md`, T02 spec at `apps/web/docs/features/public-pages/phase-1-ui-brief.md`), the workstream file **points to it**. Don't duplicate the spec.

---

## How to Brief an Agent on a Task

When assigning a task, use this template in the agent prompt. Keep it short; the agent will pull detail from the linked docs.

```
You are executing [T##] [Title] from BuildOS's distribution strategy.

Work stream: [WS##] at docs/marketing/distribution/workstreams/WS##-{slug}.md
Task-level brief: section ## of that file
Strategy source: buildos-strat.md §X.Y

Positioning guardrails (read the brand guide first):
- Category: thinking environment for people making complex things
- Primary wedge: authors + YouTubers
- ADHD / founders are supporting affinity only
- Do not lead with AI
- Do not use "ontology" in public-facing copy

Definition of done (from the workstream file's task brief):
- [specific done-when items]

Output location:
- [exact file path or PR expectation]

Report back with:
- A summary of what you did
- Links to output files
- Any strategic drift noted (e.g. if the brand guide made you reframe something)
- Status update: change T## from X to Y in workstream file + README
```

---

## Agent Types & Fit

Different tasks suit different agents. Rough guide:

- **`compound-engineering:workflows:work`** — multi-step code tasks (T06, T07, T12, T14, T23)
- **`compound-engineering:workflows:plan`** — spec-level tasks before code (T21, T22, T29)
- **`general-purpose` or `Explore`** — research (T04, T05, T18, T20)
- **`content-editor`** — content review (post-draft T09, T15, T16, T17, T25)
- **`compound-engineering:design:design-implementation-reviewer`** — T21 (visual audit)
- **`accessibility-auditor`** — T12, T14, T29 (any new public-facing page)

DJ-only (no agent): T01 (manual LLM queries), T10 (Reddit karma — must be human voice), T11 (r/buildos creation), T15 final polish, every first publication of brand-voice content.

---

## Preventing Drift

Drift = reality and docs diverge. Three defenses:

1. **Single source of truth per dimension.** Task definition lives in `buildos-strat-tasks.md`. Work stream structure lives in workstream files. Recurring ops live in `RECURRING.md`. Strategy lives in `buildos-strat.md`. Don't duplicate — link.
2. **Status updates are mandatory**, not optional. Every task status change touches 3 places (see above). A PR that changes code without updating the workstream file is incomplete.
3. **Monthly audit.** On the first of each month, spot-check 5 random tasks for drift between workstream, task list, and code reality. Fix or escalate.

---

## When to Create a New Workstream

Only when:
- 3+ new tasks emerge that share scope and dependencies
- Or an existing workstream grows beyond ~10 tasks and needs a split

Do not create a workstream per task. Do not create one for a single speculative idea.

---

## Closing & Archival

When a workstream completes:
- Set status to ✅
- Add a "Closed — YYYY-MM-DD" note at the top
- Keep the file — historical record
- Don't delete recurring ops; move them to `RECURRING.md`
