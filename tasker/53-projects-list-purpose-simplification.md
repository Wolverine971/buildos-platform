<!-- tasker/53-projects-list-purpose-simplification.md -->

# 53 - Projects List Purpose and Recognition Simplification

**Created:** 2026-08-14  
**Priority:** Product IA / first-impression cleanup  
**Type:** Audit-to-implementation handoff  
**Surface:** `/projects` (`apps/web/src/routes/projects/+page.svelte`)  
**Prior audit:** [Projects List Page Audit 2026-06-26](../apps/web/docs/technical/components/hyperplexed/PROJECTS_LIST_PAGE_AUDIT_2026-06-26.md)

## Why this task exists

The June Hyperplexed pass fixed visual-system drift, focus states, icons, radii, reduced motion,
filter duplication, and loading-shape mismatch. Those fixes remain valid. This reassessment asks a
more fundamental question the first audit did not ask:

> Can a person landing on `/projects` immediately recognize the kind of page, understand its
> purpose, and know what to do next?

The current page mixes four jobs:

1. project launcher;
2. portfolio analytics dashboard;
3. project lifecycle/filter management;
4. admin ontology graph explorer.

That mixture makes a familiar project list feel like a custom dashboard that must be learned.

## Locked page purpose

The dominant job of `/projects` is:

> **Find the project you want to continue, or start a new one.**

Every visible region must earn its place against that sentence. Portfolio analysis, ontology
exploration, and project-level execution belong elsewhere.

## Recognition preflight

Before visual polish, a cold user should answer these within five seconds:

1. Where am I?
2. What is this page for?
3. What can I do here?
4. What should I probably do first?
5. Does this resemble a familiar project launcher or file browser?

The expected answers are: `Projects`; choose or create a project; search/open/create; resume recent
work; yes.

## Current region inventory

| Region                               | Current role         | Proposed disposition                                                                      |
| ------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------- |
| `YOUR WORKSPACE` + `Projects` header | Orientation          | Remove redundant micro-label; keep H1 and task-oriented subcopy                           |
| `New Project` row                    | Primary creation     | Move into the page header                                                                 |
| Four-card metrics                    | Portfolio summary    | Move to dashboard/analytics; remove from `/projects`                                      |
| Six-state count strip                | Lifecycle navigation | Move state choices into Filters; default page to current work                             |
| Search & Filters disclosure          | Find/narrow projects | Keep search visible; keep advanced filters behind `Filters`                               |
| Current Work + recency separators    | Resume work          | Keep one recent/current list; remove redundant 7/30-day separators                        |
| Project dossier row                  | Project selection    | Reduce to identity, one useful cue, next step, relative update time                       |
| Completed/Paused/Cancelled sections  | Historical access    | One Completed disclosure; paused/cancelled live in filters unless evidence says otherwise |
| Admin Graph toggle/view              | Ontology exploration | Move to an admin tool/menu or separate route                                              |

## Target information architecture

```text
Projects                                      [New project]
Pick up where you left off, or start something new.

[ Search projects... ]                         [Filters]

RECENT
[icon] Project name                            Updated 2h ago
       Next: one actionable next step

[icon] Project name                            Updated Tuesday
       Next: one actionable next step

[View all current projects]

COMPLETED PROJECTS  14                                  [>]
```

The premium behavior is fast recognition and re-entry, not a signature visual effect.

## Tier 1 - cheap, high-impact

### T1.1 - Rewrite the header around the page job -> P6

- Replace `Your active projects and workflows. Context that compounds.` with task-oriented copy,
  provisionally: `Pick up where you left off, or start something new.`
- Remove `YOUR WORKSPACE`; the global navigation and H1 already orient the user.
- Keep `Projects` as the plain, familiar H1.

**Acceptance:** a five-second test yields “choose or create a project,” not “project analytics.”

### T1.2 - Put creation where users expect it -> P8

- Move `New Project` into the header action position.
- Preserve the existing agent-chat creation flow and fallback route.
- Keep the label familiar (`New project`) even if the experience begins with a brain dump.

**Acceptance:** the primary creation action is visible without scanning below the header and remains a
44px target on phone.

### T1.3 - Make search primary, filters secondary -> P7

- Show the search field by default.
- Replace the combined `Search & Filters` disclosure with visible search plus a separate `Filters`
  disclosure/button.
- Keep active filter state visible and clearable.

**Acceptance:** finding a known project requires no disclosure step; advanced ontology filters remain
available without dominating the cold-user view.

### T1.4 - Make recency scannable -> P4

- Replace exact date/time strings with relative labels (`Updated 2h ago`, `Updated Tuesday`).
- Preserve the machine-readable `<time datetime>` value.

**Acceptance:** update metadata is useful at a glance and does not become a competing column.

## Tier 2 - structural simplification

### T2.1 - Remove the metrics grid from this surface -> new P25 candidate

- Remove Current Work, Tasks, Docs, and Active summary cards from `/projects`.
- Do not delete the underlying calculations until the target dashboard/analytics owner is decided.
- If the metrics have no evidenced user job elsewhere, retire rather than relocate them automatically.

**Acceptance:** the first substantial content after the header/search is project identity, not aggregate
counts.

### T2.2 - Collapse lifecycle navigation into Filters -> P7

- Remove the always-visible six-state count strip.
- Default to current work (Planning + Active) with a simple route to All/Completed.
- Preserve deep-linkable state filtering (`?state=`) where useful.

**Acceptance:** the page has one navigation model for project selection; lifecycle state does not look
like a second tab bar.

### T2.3 - Simplify project rows around re-entry -> P4+P1

Current rows contain name, state, sharing, exact timestamp, description, next step, four entity
counts, and an arrow. Target content:

- project icon + name;
- at most one compact state/shared signifier;
- next step **or** description (prefer next step when present, not both);
- relative update time.

Move task/goal/plan/document counts into the project workspace or omit them.

**Acceptance:** every row answers “which project is this?” and “where will I resume?” before it answers
inventory questions.

### T2.4 - Remove redundant recency grouping -> P4+P6

- Keep the list sorted by `updated_at`.
- Remove `Not touched in last 7 days` and `Not touched in last 30 days` separators; the timestamp
  already communicates recency.
- If stale-project intervention is valuable, give it an explicit product surface rather than quietly
  segmenting the launcher.

**Acceptance:** current projects scan as one list without repeated recency signals.

### T2.5 - Separate admin graph exploration -> new P25 candidate

- Remove the admin-only Overview/Graph toggle from the normal projects header.
- Preserve Graph behind a named admin tool/menu or dedicated route.
- Capture admin and non-admin before states; DJ's admin view currently overstates ordinary-user
  complexity.

**Acceptance:** being an admin does not make the core project launcher change its primary mental model.

### T2.6 - Consolidate historical access

- Keep Completed behind one disclosure or explicit filtered view.
- Put Paused and Cancelled in filters unless usage evidence shows they deserve first-class sections.

**Acceptance:** historical states remain reachable without adding multiple peer sections to the default
launcher.

## Tier 3 - deliberate restraint

No signature animation or visual flourish is proposed. Reassess only after the recognition, hierarchy,
and re-entry tests pass. The earned “premium” moment should be immediate resumption of meaningful work.

## Work packages for the picking-up task

### WP-0 - Live evidence and purpose validation

1. Capture before states at desktop and phone widths, light and dark where practical.
2. Capture both admin and normal-user variants.
3. Run the five-second recognition questions above.
4. Verify which controls real users use before removing or relocating them.

**Exit:** evidence-backed keep/demote/move/delete inventory and approval-ready wireframe. No code yet.

### WP-1 - Approved Tier 1 implementation

Implement only the Tier 1 items DJ approves. Preserve existing loading, error, empty, keyboard, deep-link,
and agent-chat creation behavior.

**Likely files:**

- `apps/web/src/routes/projects/+page.svelte`
- `apps/web/src/lib/components/projects/ProjectStateRow.svelte`
- related focused tests

**Exit:** scoped Svelte checks/tests plus before/after desktop and phone captures.

### WP-2 - Approved Tier 2 implementation

Perform structural removals and relocation only after decisions about metrics, Graph, and historical
states. Avoid silently moving clutter to another surface.

**Exit:** cold user can select/resume/create without interpreting analytics or ontology controls.

### WP-3 - Journey verification

Test the full handoff:

```text
/projects -> select or create -> /projects/[id] -> resume meaningful work
```

Verify browser Back, project-create completion, deep-linked state filters, keyboard navigation, and phone
layout.

## Out of scope

- `/projects/[id]` and `/projects-v2/[id]` individual project workspace redesign.
- Choosing between the production project workspace and V2.
- Dashboard/analytics redesign.
- New engagement metrics, celebration, or gamification.

The originating task remains focused on the individual V2 project workspace. Do not edit those routes from
this task.

## Required reading order

1. This handoff.
2. [Projects List Page Audit 2026-06-26](../apps/web/docs/technical/components/hyperplexed/PROJECTS_LIST_PAGE_AUDIT_2026-06-26.md).
3. [Hyperplexed Design Playbook](../apps/web/docs/technical/components/hyperplexed/HYPERPLEXED_DESIGN_PLAYBOOK.md).
4. [Hyperplexed Fix Patterns](../apps/web/docs/technical/components/hyperplexed/HYPERPLEXED_FIX_PATTERNS.md).
5. Current `/projects` route and its list/filter children.

## Open decisions for that task

1. Should the default list show only Current work, or Recent across all non-cancelled states?
2. Is `New project` the final label, or should the secondary copy mention starting with a brain dump?
3. Do aggregate project metrics have a proven destination, or should they be retired?
4. Should Graph move to an admin route, an overflow menu, or an existing ontology surface?
5. Does Paused need first-class visibility, or is a filter sufficient?
