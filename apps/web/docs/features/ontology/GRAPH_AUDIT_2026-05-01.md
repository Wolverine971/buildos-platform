<!-- apps/web/docs/features/ontology/GRAPH_AUDIT_2026-05-01.md -->

# BuildOS Graph Audit

> **Date:** 2026-05-01
> **Scope:** Cytoscape ontology graph (admin, per-project, public), tree-agent graph, NodeDetailsPanel, GraphControls, design spec, experimental SvelteFlow/G6 toggles
> **Author:** Audit pass (DJ + Claude)

---

## Top-Line

The _system thinking_ behind the graphs is good — shape-first hierarchy, semantic edges, paired light/dark colors, dark-mode observer rebuild. The _execution_ drifts from Inkprint in a few visible places, and there is one ergonomic bug that is worth fixing first.

---

## What's Working

- **Shape-first language is solid.** Round-rect = project, star = goal, ellipse = task, triangle = milestone, octagon = risk, dashed round-rect = plan, diamond = event. Distinctive at a glance, holds up at zoom-out.
- **State semantics are coherent.** Border style carries lifecycle (dotted draft → dashed review → solid committed), border-width bumps for blocked / in_progress, color tracks `state_key` consistently across entities. See `apps/web/src/lib/components/ontology/graph/lib/graph.service.ts:345-413`.
- **Edge categorization is genuinely useful.** Six semantic groups (`hierarchical`, `goalSupport`, `dependency`, `blocking`, `temporal`, `knowledge`) with style + color + arrow-shape variation (`graph.service.ts:807-889`). Dotted "inferred project link" edges are a nice touch.
- **NodeDetailsPanel is the strongest piece.** Type-specific facets (project: context/scale/stage, risk: probability/impact, goal: target/achieved dates), correct Lucide icons in colored chips, applies Inkprint textures (`tx-frame`, `tx-bloom`, `tx-static`, `tx-thread`). This is the canonical example of Inkprint working well.

---

## Top Issues (Ranked)

### 1. The legend lies. (priority: high)

The control-panel legend (`GraphControls.svelte:170-178`) shows **Lucide icons** — FolderKanban, ListChecks, Target, Flag, FileText, AlertTriangle. None of those icons appear on the actual graph. Cytoscape renders shapes only.

A new user looks at the legend, sees a folder icon next to "Project," then scans the canvas for folder icons and finds round-rectangles. They have to translate twice.

**Fix options:**

- **(cheaper)** Replace icons in the legend with the actual shapes the graph uses (round-rect, star, ellipse, triangle, octagon, rectangle, dashed round-rect). Same component, just SVG outlines instead of Lucide.
- **(better)** Render icons _inside_ the Cytoscape nodes via `background-image` (data-URI of Lucide SVG). Cytoscape supports this. SvelteFlow nodes already do — see `svelteflow/nodes/ProjectNode.svelte:46`. This would also unify the on-canvas → details-panel reading flow.

### 2. The canvas has no Inkprint feeling. (priority: high)

The graph container is plain `bg-background` (`OntologyGraph.svelte:485`). The design spec literally says: _"the graph should feel like a field notes diagram or architectural blueprint"_ (`ONTOLOGY_GRAPH_DESIGN_SPEC.md:54-60`). Right now it feels like any other JS graph library demo.

**Quick win:** Add `tx tx-grid tx-weak` to the canvas wrapper. Inkprint's `tx-grid` token is documented as "graph paper" — perfect semantic match. The texture sits behind the SVG, doesn't compete with nodes, and gives the whole view a "we are working on something" feel.

### 3. Project nodes feel anemic vs everything else. (priority: medium)

Projects are _the container, the universe of work_ in the design spec — but visually they are the dullest things on the graph. Default fill is `#f8fafc` (near-white) on `#334155` border. Goals get bright amber stars, risks get red octagons, plans get indigo dashed boxes. Projects fade into the background (`graph.service.ts:74-77`).

In Inkprint terms, Projects deserve `wt-card` or `wt-plate` weight presence. Three options:

- Give projects a subtle `tx-frame` background fill (paper-like, but distinct from the canvas).
- Pump up the default border to 4px and use a darker ink color.
- State-color them more aggressively (active project = amber, complete = emerald) instead of falling through to gray when state is not `blocked`.

### 4. Goal = star on canvas, but Target everywhere else. (priority: medium)

Inkprint's canonical icon table calls Goal `Target` (`INKPRINT_DESIGN_SYSTEM.md:945`). The NodeDetailsPanel uses `Target`. The legend uses `Target`. The graph uses `star`.

Star isn't _wrong_ — "north star" is a defensible metaphor — but it is the only place in the system where Goal isn't a Target. Either:

- Switch graph shape to a circle/bullseye-ish shape and own Target everywhere, OR
- Add a one-line note in the design spec explaining "graph uses star for max readability at small sizes" so the next dev does not trip on it.

### 5. The accent color does double duty. (priority: low-medium)

`#ea580c` (BuildOS signal orange) is used for _both_ (a) selected-node + connected edges and (b) dependency edges (`graph.service.ts:71, 171`). When you select a project that has dependencies, the selection highlight visually merges with the dependency edges. Orange on orange.

Either move dependencies to a different hue (e.g., violet — currently unused), or keep dependencies orange and switch selection to a thicker contrasting outline (white/foreground stroke at higher z-index).

### 6. Inkprint texture is missing from the graph nodes themselves. (priority: low — fundamental tradeoff)

Inkprint's whole pitch is _texture as semantic channel._ The graph's own service file says it is "Inkprint Aligned" — but Cytoscape can't render CSS textures on shapes. The texture metaphor only lives on container surfaces (loading state, error state, controls panel).

Tree-agent graph has the same problem more visibly: comments in `TreeAgentGraph.svelte:41-68` literally name the textures (`tx-bloom`, `tx-grain`, `tx-pulse`, `tx-static`) by status, but they are never rendered — only the colors come through.

There is no easy fix without leaving Cytoscape. SvelteFlow renders custom Svelte components per node, which means full Inkprint texture/weight support. If you ever want to fully realize the design spec, SvelteFlow is the route — and the `svelteflow/` tree is already partway there.

---

## Smaller Things Worth Fixing

- **`font-family: 'system-ui, sans-serif'`** on every node label (`OntologyGraph.svelte:134`). Inkprint mandates Inter — this is the only place in the app the rule is violated.
- **Stats panel shows 11 cards** (`GraphControls.svelte:351-432`) including `Outputs` and `Decisions` — neither has a renderer in `buildGraphData()` (`graph.service.ts:939-981`). Users see a "5 Decisions" count but no decision nodes on the canvas. Either drop the stat or add the renderer.
- **"Project FK" is jargon** in the edge legend. Users do not read foreign keys. Call it "Project link" or "Implied" — match the in-graph label `'project link'` already used (`graph.service.ts:921`).
- **No legend entry for border style.** Dotted = draft, dashed = review/plan, solid = committed is meaningful and invisible. Add a small "Lifecycle" row to the legend with three short line samples.
- **Three-way library toggle is dev-facing UI on a user-facing route.** `/admin/ontology/graph` shows Cytoscape / SvelteFlow / G6. Two of three are flagged "Experimental" with most features disabled. Either gate this behind a dev flag or commit to one.
- **Draft-state dotted border on 26px task ellipses with 2px stroke** is visually borderline. Test at 50% zoom — dotted may collapse to looking like a solid line and lose the lifecycle signal.
- **Selected node** repaints background to orange (`#fff7ed`/`#431407`) and overrides whatever state color was there (`OntologyGraph.svelte:227-233`). For a blocked task, selecting it visually "un-blocks" it. Consider keeping the original fill and only changing border + adding an outer glow/ring.

---

## Recommended First Three

1. **Fix the legend** so it shows shapes that match the canvas (1–2 hours).
2. **Add `tx tx-grid tx-weak` to the graph background** (10 minutes — biggest perceived-quality lift for the cost).
3. **Resolve the icon-on-node question.** Either commit to "shapes only" (and update Inkprint docs to acknowledge graph is the one place icons don't appear) or invest a day rendering Lucide SVGs into Cytoscape nodes via `background-image`. Don't leave it ambiguous.

---

## Implementation Log

### 2026-05-01 — Audit drafted + first pass of fixes

**Shipped this pass:**

- ✅ **Issue #2 — Inkprint canvas.** Added `tx tx-grid tx-weak` to both `OntologyGraph.svelte` and `TreeAgentGraph.svelte`. Canvases now sit on subtle graph-paper texture; added `:global(canvas) { z-index: 2 }` so Cytoscape's transparent canvases render above the `::before` texture pseudo.
- ✅ **Issue #1 — Legend lies.** Replaced the seven Lucide icons in `GraphControls.svelte` with inline SVG shapes (round-rect, star, ellipse, dashed round-rect, triangle, rectangle, octagon) that match exactly what Cytoscape renders. Pulled fills/strokes from the same palette as `graph.service.ts`.
- ✅ **Lifecycle row in legend.** New row under the node legend explains dotted (Draft) / dashed (Plan / Review) / solid (Committed) — the border-style semantics that were previously invisible.
- ✅ **Selected-node collision.** `node:selected` no longer overrides `background-color`. State color stays; selection now reads as accent-colored 4px border + soft 12 % accent overlay halo. Selecting a blocked task no longer visually "un-blocks" it.
- ✅ **Stats panel cleanup.** Dropped Outputs and Decisions stat cards (no renderer in `buildGraphData()`). Renamed "FK links" → "Project links" to match in-graph language. Down from 11 cards to 9.
- ✅ **Font-family.** Cytoscape node labels in both graphs now use the body's actual stack (`system-ui, -apple-system, "Inter", sans-serif`) instead of the truncated `system-ui, sans-serif`.
- ✅ **Edge legend.** Renamed "Project FK" → "Project link" to match the in-graph label and drop the foreign-key jargon.

`pnpm exec svelte-check` → 0 errors on `OntologyGraph.svelte`, `GraphControls.svelte`, `TreeAgentGraph.svelte`. Pre-existing warnings in unrelated files are unchanged.

**Deferred — need a design call before touching:**

- **Issue #3** — Project nodes feel anemic. Three plausible options listed; pick one.
- **Issue #4** — Goal = star vs Target everywhere else. Either swap shape or document the exception.
- **Issue #5** — Accent orange double-duty (selection + dependency edges). Now slightly mitigated by the new overlay halo, but still worth deciding.
- **Issue #6** — Inkprint texture on nodes themselves. Fundamental Cytoscape limit; only solvable by completing the SvelteFlow renderer.
- **Library toggle on `/admin/ontology/graph`** — gate behind dev flag or commit to one library?
- **Draft-state dotted border on 26 px task ellipses** — wants visual review at common zoom levels.
