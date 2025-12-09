<!-- apps/web/docs/features/ontology/ONTOLOGY_DASHBOARD_GRAPH_SPEC.md -->

# Ontology Dashboard Graph View

- **Status**: Draft - awaiting product + eng sign-off
- **Author**: Codex (GPT-5)
- **Last Updated**: 2025-11-06
- **Related Work**: `/admin/ontology/graph` implementation, `docs/api/ontology-endpoints.md`

## 1. Overview

We are extending the visual ontology graph that currently lives behind the admin route to every authenticated project owner on `/ontology`. The new view sits alongside the existing dashboard list so operators can quickly understand how templates, projects, tasks, outputs, and documents connect without leaving the customer surface. The solution must feel "clean, optimized, and very nice": fast to load, visually balanced, and consistent with dashboard styling.

## 2. Goals

- Present a production-ready graph visualization on `/ontology` with the same interaction affordances as the admin tool (layouts, filters, search, PNG export, detail panel).
- Scope data to entities the signed-in actor can access, preventing admin-only leakage while maintaining complete relationship fidelity for their projects.
- Offer immediate context-switching between dashboard list and graph view (persistent deep link + client cache).
- Deliver responsive/mobile-friendly controls and node insights without sacrificing usability across device sizes.
- Track adoption and reliability through instrumentation.

### Non-Goals

- Editing ontology entities from the graph, mutation workflows, or analytics reserved for admins.
- Representing global cross-tenant data or system templates the actor cannot access.
- Solving layout performance for arbitrarily large installations (we cap size and note follow-ups).

## 3. Target Users & Use Cases

- **Founders / PMs**: Understand how active workstreams relate, find gaps, share exported diagrams.
- **Delivery Leads**: Inspect project completeness, ensure templates are instantiated, validate edges.
- **Support / Agents (future)**: Serve contextual answers faster by referencing a schema-level view.

## 4. UX & Interaction Design

### 4.1 Information Architecture

- Add a segmented control in the existing dashboard hero (`Overview` vs `Graph`) that updates the URL query (`/ontology?view=graph`) so history/deep-linking works.
- Default to `Overview` for first-time visitors; respect `view` query if provided.
- When switching to `Graph` the first time, trigger lazy load and show a full-bleed skeleton states (pulsing graph canvas, disabled controls).

### 4.2 Graph Canvas

- Extract the Cytoscape canvas, controls, and node detail panel from the admin route into shared components under `apps/web/src/lib/components/ontology/graph/*`.
- Keep current features: layouts (dagre/cola/cose/circle), fit-to-view, node hover/highlight, filtering, search debounced to 300 ms, PNG export.
- Style adjustments for the customer dashboard: lighter chrome, remove admin "back" button, align fonts/spacing to ontology layout tokens, ensure the graph container inherits the dashboard background palette.

### 4.3 Node Details

- Reuse the drawer/sheet pattern from admin but ensure metadata is human-readable (title-cased props, JSON prettified in collapsible sections).
- Link to resource detail routes via `goto('/ontology/projects/{id}')` etc.; open questions on tasks/documents detail routes (see Section 11).

### 4.4 Responsiveness & Accessibility

- Maintain the control drawer pattern on mobile (hamburger toggle) and slide-up node details sheet.
- Keyboard/focus: trap within mobile sheets, focus the first interactive element on open, provide `aria-expanded`/`aria-controls` on toggles, label all controls.
- Contrast ratio ≥ 4.5:1 for light/dark themes; audit color tokens to ensure compliance.

## 5. Technical Architecture

### 5.1 Client Components

- **Shared components** moved to `apps/web/src/lib/components/ontology/graph/`:
    - `OntologyGraph.svelte`
    - `GraphControls.svelte`
    - `NodeDetailsPanel.svelte`
    - `lib/graph.service.ts`, `lib/graph.types.ts` (renamed from admin counterparts).
- Admin route imports from the new shared location to avoid duplication.
- Public `/ontology` page consumes the shared components with light configuration knobs (title text, metrics copy).

### 5.2 State & Data Flow

- New Svelte store `graphStore` retains `GraphData`, `GraphStats`, `lastFetched`, and `error`.
- Lazily populated via `loadGraph(viewMode)` when user enters Graph tab; abort in-flight requests on route leave or mode switch.
- Derivations for filtered nodes/edges remain inside Cytoscape service util—no reimplementation in Svelte.
- Preserve `graphInstance` object referencing Cytoscape and methods (change layout, fit view, search, filter).

### 5.3 Styles & Performance

- Ensure Cytoscape plugins register once per window (existing guard persists).
- Debounce heavy operations (search, layout change) as in admin view.
- Streamline default layout (dagre) spacing for readability; use CSS vars for colors so theme changes cascade.

## 6. API Design

### 6.1 Endpoint

`GET /api/onto/graph`

| Query      | Type         | Default    | Description                                                      |
| ---------- | ------------ | ---------- | ---------------------------------------------------------------- | ------ | ---------------------------------------------- |
| `viewMode` | `'templates' | 'projects' | 'full'`                                                          | `full` | Downscope server payload to match current tab. |
| `limit`    | number       | 1000       | Optional upper bound on node count (fails with 413 if exceeded). |

### 6.2 Behavior

1. Call `ensure_actor_for_user` to resolve the user's actor ID. Reject 401 if no session, 500 on RPC failure.
2. Fetch:
    - Active templates (`onto_templates.status = 'active'`).
    - Actor-owned projects (`onto_projects.created_by = actor`).
    - Related tasks, outputs, documents bound to those projects.
    - Edges where both endpoints are in the selected set.
3. Prune nodes + edges that fall outside the selected `viewMode`.
4. Compute stats mirroring admin: totals per type, active projects count.
5. Enforce limit: if nodes exceed threshold, return 413 with guidance for the user.
6. Cache-control header `max-age=0, s-maxage=30` to allow short CDN caching while maintaining freshness.
7. Response payload:

```ts
type GraphResponse = {
	data: {
		graph: GraphData;
		stats: GraphStats;
		metadata: {
			viewMode: ViewMode;
			generatedAt: string;
		};
	};
	error?: never;
};
```

Errors follow `ApiResponse` structure with `code` and `message`.

### 6.3 Shared Types

- Move `GraphData`, `GraphStats`, `OntologyGraphInstance`, etc. into `graph.types.ts`.
- Export builder functions from `graph.service.ts`; reuse in admin/public clients and potential tests.

## 7. Performance & Reliability

- Node cap 1k / edge cap 2k; surface a friendly alert with suggestion to refine templates if exceeded.
- Use `requestIdleCallback` (with fallback) to defer expensive layout recalculations after initial render.
- Retain graph dataset in memory to avoid redundant API calls when toggling between Overview ↔ Graph inside the same session.
- Abort `fetch` when user navigates away before completion to avoid unhandled promise rejections.

## 8. Security & Permissions

- Rely on Supabase Row-Level Security plus explicit actor filtering for projects and child entities.
- Ensure edge pruning happens server-side so foreign IDs are never leaked.
- Do not expose admin metadata (e.g., unpublished templates, audit logs).
- Validate `viewMode` inputs and reject unrecognized values with 400.

## 9. Analytics & Telemetry

- Emit client events to the existing analytics bus:
    - `ontology.graph.loaded` (payload: ms, node count, edge count, viewMode).
    - `ontology.graph.error` (payload: status code, viewMode).
    - `ontology.graph.interaction` for layout changes, searches, filter usage.
- Server logs include actor ID hash and dataset sizes for capacity monitoring.

## 10. Implementation Plan

1. **API Layer**
    - Scaffold `/api/onto/graph`.
    - Implement Supabase queries, filtering, stats calculator, payload limits.
    - Write unit tests for data transformation (edge pruning, view mode filtering).
2. **Component Extraction**
    - Move graph components/services/types into shared library.
    - Update admin route imports; run regression test to ensure no UI changes.
3. **Dashboard Integration**
    - Add view toggle, lazy-load logic, skeleton states, Svelte store.
    - Wire analytics events, manage query param syncing, ensure responsive layout parity.
4. **Polish & QA**
    - Accessibility audit (keyboard navigation, screen reader labels).
    - Browser smoke tests (Chrome, Safari, Firefox) across light/dark themes.
    - Final copy polish + docs update (this file) and release notes entry.

## 11. Open Questions

1. Should non-owner collaborators (future shared projects) see graph data? If yes, expand filtering to actor memberships.
2. Do we need dedicated `/ontology/tasks/{id}` and `/ontology/documents/{id}` routes before linking from the node detail panel?
3. Are there enterprise customers whose ontologies will exceed the current caps, requiring pagination or progressive reveal?

## 12. Acceptance Criteria

- `/ontology?view=graph` renders a responsive graph within 2 seconds on median dataset (<500 nodes).
- Switching between Overview and Graph retains previous layouts without re-fetching unless refresh triggered.
- PNG export works in modern browsers and is named `ontology-graph-<timestamp>.png`.
- Admin route continues to operate unmodified aside from import paths.

---

Once stakeholders approve this document, we proceed with the implementation phases outlined above.
