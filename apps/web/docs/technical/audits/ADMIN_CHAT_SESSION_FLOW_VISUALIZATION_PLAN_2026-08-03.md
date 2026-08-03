<!-- apps/web/docs/technical/audits/ADMIN_CHAT_SESSION_FLOW_VISUALIZATION_PLAN_2026-08-03.md -->

# Admin Chat Session Flow Visualizations

Date: 2026-08-03

## Outcome

Add two optional, linked visualizations to the chat session detail modal:

1. **Time waterfall** — a DevTools-style timeline that makes sequence, overlap, and latency visible per turn.
2. **Cost waterfall** — a cumulative price view that shows where metered spend enters the flow without pretending unmetered work costs `$0`.

Both views are progressive disclosure tools. The normal chat replay remains the primary surface, and neither chart is loaded or built when the modal mounts.

## Placement and reveal behavior

The visualization launcher sits below the session metrics and Libri summary, before Chat Replay.

- Initial state: two compact buttons, **See time chart** and **See cost chart**.
- Clicking a button dynamically imports only that chart and the shared profiling code.
- A small inline loading state occupies the eventual chart area, preventing a layout jump.
- Import or profiling failures show a local retry action and do not affect Chat Replay.
- Hiding a chart keeps its already-loaded module and profile cached for instant reopening.
- Opening one chart does not implicitly open or download the other.

This is an explicit performance contract: there must be no chart-component import, session profiling, geometry work, or chart DOM on initial render.

## Visual 1: time waterfall

Each conversation turn receives its own readable time scale so idle gaps between user turns do not compress useful execution details.

The chart includes:

- a turn header with active duration and event count;
- ordered lanes for user/assistant messages, supervisor events, LLM calls, tools, and operations;
- horizontal position for start time and width for duration;
- point markers when an event has a timestamp but no meaningful duration;
- a zero-based millisecond/second ruler per turn;
- category color, status/error treatment, and a compact duration label;
- accessible buttons and text labels rather than hover-only information.

The summary highlights total active turn time and the slowest measured event. It does not label summed nested spans as session wall-clock time.

## Visual 2: cumulative cost waterfall

Events are ordered chronologically and laid out against cumulative session cost.

The chart includes:

- metered LLM calls as horizontal cost segments;
- zero-cost metered events as explicit zero markers;
- tool and operation events as **unmetered** markers, never `$0` bars;
- a running cost total and each call's cost contribution;
- model/tool labels and turn context;
- session total from the authoritative session metrics, with a visible reconciliation note if event-level costs do not sum to that total.

The cost view answers “where did spend enter the flow?” It is not a time axis and must not imply that tool execution is free merely because no price was recorded.

## Linked navigation contract

Every selectable chart event maps to a stable target in the request flow.

- Tool bars open the turn's **BuildOS activity** drawer and the matching tool request/response card.
- Message markers scroll to the matching chat bubble and expand long message content.
- LLM, operation, supervisor, and other audit bars open **Full Audit Timeline**, open the matching turn/group, reveal the matching event payload, and scroll it into view.
- If audit filters currently hide the selected event, they reset before navigation so the destination can be revealed.
- The destination receives keyboard focus after scrolling.
- Smooth scrolling respects `prefers-reduced-motion`.
- If the exact event is still unavailable after lifecycle deduplication, navigation falls back to the containing turn rather than failing silently.

DOM target IDs are generated centrally so chart profiling and replay rendering cannot drift apart.

## Data normalization

A shared, pure profile builder converts the existing session payload and conversation turns into a chart-specific model.

For each event it records:

- stable ID and linked destination;
- turn ID/index;
- category and human-readable label/detail;
- start/end/duration in milliseconds;
- status/severity;
- metered cost and cost state (`metered`, `zero`, or `unmetered`).

Timestamp precedence uses explicit request start/completion values first, then recorded event timestamps and measured duration. Invalid or negative spans degrade to point events. Tool lifecycle rows use the existing deduplicated `ConversationToolCall` model so emitted/completed pairs do not render twice.

## Delivery plan

### Phase 1 — foundation

- Add stable request-flow target helpers and IDs.
- Add a tested pure profile builder for time and cost data.
- Add deferred visualization launcher with independent dynamic imports.

### Phase 2 — charts

- Implement the per-turn time waterfall.
- Implement the cumulative cost waterfall and metering states.
- Add empty, loading, error, and retry states.

### Phase 3 — linked inspection

- Connect bar selection to drawer/card expansion.
- Connect audit-backed events to timeline expansion.
- Add focus management and reduced-motion scrolling.

### Phase 4 — verification and polish

- Unit-test normalization, deduplication, cost semantics, and target generation.
- Verify initial render performs no dynamic chart import or profiling.
- Run the Svelte autofixer on every changed component.
- Run focused tests and `pnpm --filter @buildos/web check`.
- Test narrow and wide layouts, keyboard navigation, dark mode, long labels, missing duration, and missing cost.

## Acceptance criteria

- The initial session-detail render contains only the two chart reveal buttons.
- Each chart loads independently only after its button is activated.
- Loading and failure states are local, stable, and retryable.
- Time clearly communicates sequence, overlap, and duration per turn.
- Cost clearly distinguishes metered, zero-cost, and unmetered work.
- Selecting any rendered event opens and focuses its corresponding request-flow detail.
- Chart controls remain usable by keyboard and expose complete labels to assistive technology.
- The existing session metrics, replay, tool request/response views, and audit filters continue to work.

## Second-pass hardening audit

Completed 2026-08-03 after the first implementation slice.

### Tier 1 — scanability, geometry, and interaction

- **Event rows:** the label and graphical bar initially created two controls for the same destination. Each event is now one 44px row button, so the whole row remains clickable while keyboard users encounter one predictable stop. Error rows also carry a visible `Error` label instead of relying on color. → P8+P13+P19
- **Color:** raw violet, emerald, sky, and amber utilities were replaced with Inkprint `accent`, `success`, `info`, `warning`, and `destructive` token pairs. Light and dark modes now inherit the same semantic contrast contract. → P19
- **Radius and type:** dense controls now use `rounded-md`, outer chart surfaces stay `rounded-lg`, and turn eyebrows use `.micro-label` rather than a hand-rolled uppercase stack. → P2+P5
- **Overflow:** slow-event summaries and event labels use explicit shrink/truncation contracts; long request text is no longer retained only to create oversized browser tooltips. → P1+P4
- **Horizontal charts:** each necessary horizontal scroll area is now a named region with overscroll containment, and the full event row remains operable at narrow widths. → P1+P12+P13
- **Boundary states:** shared percentage geometry prevents minimum-width bars from spilling past the final tick, track clipping contains endpoint markers, and sessions with no metered spend show one honest `$0 → No metered spend` scale instead of fabricated micro-dollar ticks. → P1+P6+P19

### Tier 2 — performance and code structure

- **Deferred modules:** chart/profile import promises moved to module scope, so modal remounts and session changes reuse the same in-flight or fulfilled module loads without caching user data globally. → P20
- **Reactive state:** immutable profiles and dynamic component constructors use `$state.raw`, avoiding deep proxy work for data that is only assigned as a whole.
- **Normalization:** empty turns are removed before rendering, event bounds are calculated with linear loops instead of spread/map intermediates, and attributed cost plus slowest-event selection share one pass.
- **Refresh correctness:** the visualization launcher is keyed by the session-detail object, so a refreshed payload for the same session cannot reopen a stale cached profile.
- **Geometry:** chart positions now use Svelte style directives rather than assembled inline style strings.
- **Target identity:** request-flow DOM IDs retain percent encoding instead of replacing escape markers with underscores, eliminating a theoretical collision between encoded delimiters and literal ID text.

### Tier 3 — polish

- No signature effect was added. For this dense operational surface, the appropriate polish is semantic color, one-click rows, stable focus, and faster deferred work rather than decorative motion.

### Second-pass verification

- ✅ Official Svelte autofixer clean on every re-touched component.
- ✅ Focused visualization/profile tests include the no-work-on-mount contract, independent chart reveal, linked selection, cost semantics, and empty-turn pruning.
- ✅ Targeted ESLint, Prettier, lucide-wrapper, and Inkprint style-contract checks pass.
- ✅ App-wide `svelte-check`: 0 errors / 0 warnings.
- ⬜ Authenticated desktop/iPhone light/dark capture remains owed.
