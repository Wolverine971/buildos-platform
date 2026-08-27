<!-- apps/web/docs/features/agentic-chat/AUDIT_2026-08-27_MODAL_CRAFT_AND_SYNC.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-27; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# AgentChatModal — Craft, Performance & Backend-Sync Audit

> Date: 2026-08-27
> Target: `apps/web/src/lib/components/agent/AgentChatModal.svelte` (2,992 LOC) + child components
> Method: `improve-animations` skill (Emil Kowalski craft bar, `AUDIT.md` eight categories), extended
> with performance, mobile, and backend-contract sweeps.
> Commit: `951cf2215`

---

## 0. Executive summary

The component is in better shape than its line count suggests. The decomposition program from
`PROPOSAL_2026-04-18_GOD-COMPONENT-DECOMPOSITION.md` has largely shipped — 20+ extracted controllers
with colocated tests — and the modal is now genuinely a shell. Several things that are usually wrong
in a streaming chat UI are **right** here (§5).

Nine confirmed findings. Two are HIGH. The single most felt one is a scroll snap-back that fights
momentum scrolling on iOS, and it is caused by a reactive dependency the code's own comment says
isn't there.

The "in sync with the backend" question has a clean answer: **the runtime paths are in sync.** Both
transports are guarded and the parity layer normalizes them. What is _out_ of sync is the type
contract — `AgentSSEMessage` advertises nine event types no server emits and no client handles.

| #   | Sev      | Category         | Location                             | Finding                                                         |
| --- | -------- | ---------------- | ------------------------------------ | --------------------------------------------------------------- |
| M1  | **HIGH** | Perf / Cohesion  | 17 sites, agent/                     | `transition-all` silently defeats the `.pressable` design token |
| M2  | **HIGH** | Interruptibility | `AgentChatModal.svelte:1524`         | Auto-scroll snaps the last 100px, fighting iOS momentum scroll  |
| P1  | MED      | Performance      | `AgentChatModal.svelte:2547`         | Full timeline re-sort every streaming frame                     |
| M3  | MED      | Performance      | `ThinkingBlock.svelte:492`           | `max-height` transitions animate layout, 350ms over budget      |
| C1  | MED      | Cleanliness      | `api/agent/v2/stream/djtryserver.ts` | Dead 12.5 KB file shaped like a live route                      |
| C2  | MED      | Contract drift   | `agent.types.ts:407-557`             | 9 dead members in the `AgentSSEMessage` union                   |
| MB1 | MED      | Mobile           | `AgentChatHeader.svelte:562`         | Primary mobile header button is 36 px                           |
| M4  | LOW      | Performance      | `AgentChatHeader.svelte:729`         | Animated `filter: drop-shadow` for 1.15 s                       |
| MB2 | LOW      | Mobile           | `AgentComposer.svelte:357+`          | Composer buttons 40 px on mobile (4 px short)                   |

---

## Implementation status

### First fix pass — shipped 2026-08-27

- **M2:** the auto-scroll effect now tracks only `messageCount`; container and manual-scroll reads
  run through `untrack()`, removing the bottom-threshold snap loop while preserving the synchronous
  before-paint scroll. → P27
- **M1:** removed the conflicting `transition-all`/`duration-*` utilities from all 17 audited call
  sites. A follow-up ownership scan found and removed the same conflict from five controls using
  Tailwind's plain `transition` utility. The Inkprint token is now the sole transition owner across
  the agent surface. → P11+P26
- **MB1 + adjacent header controls:** the mobile overflow, back, minimize, and close controls now
  use 44 px targets; desktop stays at its compact 28 px chrome size. → P13
- **MB2:** all five composer action variants now use 44 px targets on mobile and retain their 32 px
  desktop size. → P13
- **Regression coverage:** `agent-chat-modal-craft.test.ts` protects the scroll dependency,
  transition-ownership, and responsive target-size contracts. Focused result: 4 files / 11 tests
  passing; full `pnpm check`: 0 errors / 0 warnings. Svelte autofixer reports no issues in the changed
  modal, composer, and run-dock files; remaining diagnostics in adjacent components predate this
  pass.

### Second fix pass — shipped 2026-08-27

- **C1:** deleted `api/agent/v2/stream/djtryserver.ts` after a fresh repository-wide import and
  filename search confirmed it had no consumers and could not be a SvelteKit route.
- **C2:** removed all nine retired variants from the public `AgentSSEMessage` union. The modal
  handler now names its intentional `text`/template no-ops explicitly and ends in a compile-time
  exhaustive `never` check, so a future union addition cannot disappear into a silent default.
- **Contract coverage:** the runtime contract suite now asserts that the retired event names remain
  absent. Historical `phase_update` parity fixtures stay intentionally cast as retired wire data;
  separate legacy type modules are not mistaken for live shared-contract emitters.
- **Verification:** 7 focused files / 74 tests passing; `@buildos/shared-types` and
  `@buildos/agentic-chat-runtime` typechecks pass; full web `pnpm check`: 0 errors / 0 warnings.

### Third fix pass — shipped 2026-08-27

- **M3:** replaced the outer `max-height` ceiling with static `0fr`/`1fr` grid states and no
  transition on the grid track. The compact and expanded log limits also remain static clamps;
  only the 160 ms chevron transform communicates the state change. The closed body switches to
  `visibility: hidden` immediately so its controls cannot receive focus. → P11+P28
- **Adjacent layout motion:** removed the component's `max-width` and padding transitions. The
  activity counter now mounts at its final geometry and enters with transform/opacity instead of
  animating width, padding, and border width. → P28
- **Regression coverage:** `ThinkingBlock.test.ts` exercises compact/expanded semantics and protects
  the no-layout-transition plus reduced-motion contracts. Focused craft result: 2 files / 6 tests
  passing; Svelte autofixer reports no issues; full `pnpm check`: 0 errors / 0 warnings.

### Fourth pass — P1 profile gate completed 2026-08-27

- **Production size evidence:** an aggregate-only query across 1,908 sessions (no message content)
  found message-count p95/p99/max of 11/22/69 and tool-call-count p95/p99/max of 20/32/62.
- **Streaming-path profile:** the repeatable `pnpm profile:agent-chat-timeline` harness measures the
  exact derive → merge → export-count chain for 600 frames after 60 warmups. Two runs of the
  observed-maximum scenario measured p95 0.202–0.207 ms (1.21–1.24% of a 60 fps frame). Even the
  synthetic restore-API-cap scenario measured p95 1.625–1.888 ms (9.75–11.33%).
- **Decision:** no runtime optimization. The measured production tail is comfortably below budget,
  so memoizing on a new content-independent key would add correctness risk without a demonstrated
  user-visible gain. Keep the harness and revisit only if session sizes or a low-end-device trace
  materially exceed this baseline.

### Fifth fix pass — motion self-review + table overflow completed 2026-08-27

- **M4:** replaced the 1.15 s shimmer/glow stack and its two animated `drop-shadow()` filters with
  one 180 ms transform/opacity context-shift cue. Reduced motion receives a 120 ms opacity-only cue;
  the old timer, background-position animation, and filters are gone. → P11
- **M3 self-review:** removed the residual `grid-template-rows` transition left by the first M3
  implementation. Disclosure geometry now changes without animation; motion remains solely on the
  chevron. The regression contract now rejects grid-track transitions as well as `max-height`.
- **Adjacent T2-3 backlog item:** agent markdown tables now render inside a dedicated measured
  scroller. Only genuinely overflowing tables become named keyboard regions and show a color-safe
  `Scroll →` cue in a reserved row; compact two-column tables keep their normal layout and tab order.
  Streamed HTML additions and resizes resynchronize through one Svelte attachment on the message-list
  root rather than one observer set per bubble. → P29
- **Verification:** 3 focused files / 13 tests passing; full web `pnpm check`: 0 errors / 0 warnings.
  A live 390×844 light/dark and 1440×900 fixture pass confirmed wide-table overflow, cue dismissal
  at the far edge, non-overlapping geometry, and no cue/focus stop for a fitting two-column table.

**Still open (device/auth evidence, not code findings):** physical-iOS momentum-scroll feel-check
and authenticated full-modal desktop/phone light/dark captures.

---

## 1. HIGH findings

### M1 — `transition-all` silently defeats the `.pressable` design token

**Locations:** 17 elements in `apps/web/src/lib/components/agent/` carry both `pressable` and
`transition-all`. Worst cases: `ProjectEntityList.svelte:284,367` (`transition-all duration-200 pressable`).
Also `AgentComposer.svelte:357,368,382,392,404`, `ChatSessionAuditActions.svelte:191,206,276`,
`AgentChatHeader.svelte:473,496`, `ProjectActionSelector.svelte:55,78`, `ProjectFocusSelector.svelte:74`,
`ProjectFocusIndicator.svelte:67,81`, `CreatedEntityCards.svelte:61`.

**Evidence chain — all four links verified:**

1. `lib/styles/inkprint.css:494` defines the token:
    ```css
    .pressable {
    	transition:
    		transform 100ms ease,
    		opacity 100ms ease,
    		box-shadow 100ms ease;
    }
    ```
2. `app.css:5` imports `inkprint.css`; `app.css:9` is `@tailwind utilities` — **inkprint loads first**.
3. `apps/web/package.json:120` pins `tailwindcss: ^3.4.0`. Tailwind v3 does **not** emit native
   CSS `@layer` for utilities, so cascade falls back to source order.
4. `.pressable` (specificity 0,1,0) and `.transition-all` (0,1,0) tie on specificity → **the later
   rule wins, and the later rule is the Tailwind utility.**

**Effect.** `transition-property: all` replaces the curated three-property list, and `duration-200`
overrides the token's 100 ms. On `ProjectEntityList` the press feedback runs at **200 ms** — outside
`AUDIT.md` §2's 100–160 ms budget for button press feedback. Everywhere else the token's intent is
silently discarded even where duration survives.

`AUDIT.md` §5: _"`transition: all` animates unintended properties off-GPU — always a finding."_

**Why it matters beyond theory.** The design system took the trouble to enumerate exactly three
cheap properties. `transition-all` re-enables transitions on `border-color`, `background`,
`box-shadow`, `filter`, and every texture-class property that changes on hover — off the compositor,
on elements that also carry `shadow-ink` and `tx-*` textures.

**Fix direction.** Replace `transition-all` with the specific property utility the element actually
needs (`transition-colors`, `transition-shadow`, or nothing where `pressable` already covers it).
The token should be the only thing setting `transition` on a `.pressable` element. → P26

---

### M2 — Auto-scroll snaps the last 100 px and fights momentum scroll

**Location:** `AgentChatModal.svelte:1524-1528`

```js
const messageCount = $derived(messages.length);

// Auto-scroll only when new messages are added, not during streaming content updates
// This allows users to scroll freely during streaming without being snapped back
$effect(() => {
	if (messageCount > 0) {
		scrollToBottomIfNeeded();
	}
});
```

**The comment is wrong about its own dependency graph.** `$effect` tracks every reactive read in its
call tree, including inside called functions. `scrollToBottomIfNeeded()` (`:1496`) reads two more
pieces of state:

- `messagesContainer` — `$state` at `:516`
- `userHasScrolled` — `$state` at `:501`

So the effect's real dependency set is `{messageCount, messagesContainer, userHasScrolled}`.

**The loop:**

1. `handleScroll()` (`:1507`) runs on every scroll event.
2. `isScrolledToBottom(container, threshold = 100)` (`:1485`) returns true within **100 px** of bottom.
3. When true, `:1511` sets `userHasScrolled = false`.
4. That write invalidates the effect → it re-runs → `scrollToBottomIfNeeded()` → `:1502` assigns
   `messagesContainer.scrollTop = messagesContainer.scrollHeight`.

**Result:** the bottom 100 px of the scroller is a dead zone the user cannot rest in. Scrolling up
out of it works (the flag flips to `true` and the effect early-returns), but scrolling _down into_
it triggers an instant `scrollTop` jump to absolute bottom.

**Why it's worse on mobile.** That assignment lands mid-momentum-scroll on iOS. Assigning `scrollTop`
while a momentum scroll is in flight fights the platform's own animation — the visible result is a
stutter or a hard stop, exactly the "not smooth" symptom this component is being audited for.

**Note on the adjacent comment.** `:1492-1495` explains that scrolling synchronously in the effect
(rather than in rAF) avoids a one-frame jump. That reasoning is sound and should be preserved — the
bug is the unintended `userHasScrolled` dependency, not the synchronous write.

**Fix direction.** Decouple the trigger from the flag. Capture `messageCount` as the sole
dependency and read `userHasScrolled`/`messagesContainer` through `untrack()`, so the effect fires on
new messages only. Consider also whether the 100 px threshold should be smaller (~24 px) for
"is at bottom" purposes; 100 px is a large grab radius. → P27

**Feel-check required.** Verify on a real iOS device, not the simulator: stream a long reply, scroll
up mid-stream, then scroll back down slowly and confirm no snap.

---

## 2. MEDIUM findings

### P1 — Full timeline re-sort every streaming frame

**Locations:** `AgentChatModal.svelte:2547` (`addOrUpdateAssistantMessage`), `:267` (`liveTimelineItems`),
`:270` (`agentTimelineItems`), `agent-chat-timeline.ts:571,615`

Streaming text is rAF-batched (`:2510-2545`) — **this part is correct** (see §5). But each flush does:

```js
const nextMessages = [...messages];
nextMessages[currentAssistantMessageIndex] = {
	...existing,
	content: existing.content + normalizedContent
};
messages = nextMessages;
```

A new array identity per frame invalidates every `$derived` reading `messages`. The chain:

- `liveTimelineItems` (`:267`) → `timelineItemsFromMessages()`
- `agentTimelineItems` (`:270`) → `mergeAgentTimelineItems()`
- `exportableStepCount` (`:273`) → `.filter()` over the merged result

**What is already optimized (don't re-do it):** per-message construction is memoized behind a
`WeakMap` (`agent-chat-timeline.ts:693`), so only the one mutating message rebuilds. That is good.

**What still runs per frame:**

- `sortAndDedupeTimelineItems` (`:571`) — `.sort()` over _all_ items, then a filter with two `Set`s.
- `mergeAgentTimelineItems` (`:615`) — builds a `Map` + `Set` over persisted items, a second pass
  over live items, then `Array.from(...).sort(compareTimelineItems)`.

So the per-frame cost is **O(n log n) on total timeline length**, at up to 60 fps, for the entire
duration of every streamed reply.

**Honest scoping.** I cannot tell from code alone whether this is felt at real session sizes. For a
short chat it is noise. For a long session with many tool calls it is not. This needs a profile
before it gets fixed — measure first, and only then decide between memoizing the sort on a
content-independent key or moving `exportableStepCount` off the hot path.

**Profile result — closed without a runtime change (2026-08-27).** Production aggregate sizes peak
at 69 messages and 62 tool calls. A fixture at that observed maximum measured 0.202–0.207 ms p95
across repeated 600-frame runs; the much larger 2,405-item restore-cap fixture measured
1.625–1.888 ms p95. The repeatable harness is `pnpm profile:agent-chat-timeline`. DOM rendering is
intentionally excluded because this finding names the pure timeline chain; its result remains well
inside the frame budget, so the profile-first gate rejects a speculative memoization layer.

---

### M3 — `max-height` transitions animate layout

**Locations:** `ThinkingBlock.svelte:492` (primary), also `:475-478`, `:301-306`, `:343-348`, `:393-399`

```css
.thinking-log-height {
	max-height: 5.25rem;
	transition: max-height 0.35s ease-in-out; /* :492 */
}
```

Two problems, one of them subtle:

1. **Layout property.** `AUDIT.md` §5: animate `transform` and `opacity` only. `max-height` triggers
   layout → paint → composite on every frame, on a block that expands _while tool activity is
   streaming into it_.
2. **The curve is a lie.** A `max-height` transition eases toward the _ceiling_, not toward the
   content's actual height. When content is shorter than the max, the visible motion completes early
   and then the remaining duration animates nothing. The easing the user perceives is not the easing
   that was authored — which is why max-height collapses characteristically feel "off" even when the
   numbers look right.

Also: **350 ms exceeds the <300 ms UI budget** (`AUDIT.md` §2). The sibling transitions at `:475-478`
use 280 ms, so the 350 ms here is also internally inconsistent.

**Fix direction.** For the common case, a grid-rows `0fr → 1fr` transition animates to true content
height with a correct-feeling curve and no max-height guess. Where a hard clamp is genuinely needed,
keep `max-height` for the clamp but drive the _motion_ with transform/opacity.

**Implemented 2026-08-27.** The natural-height shell now uses grid rows; the nested log limits are
static clamps and the state affordance uses a reduced-motion-gated 160 ms transform. The same pass
removed the adjacent max-width, padding, and counter-geometry transitions. → P11+P28

---

### C1 — Dead 12.5 KB file shaped like a live route

**Location:** `apps/web/src/routes/api/agent/v2/stream/djtryserver.ts` (12,547 bytes, dated Jul 16)

Verified: **imported nowhere** in `apps/web/src`. It sits inside the live stream route directory and
opens with

```ts
export const config = { maxDuration: 300, memory: 1024 };
import type { RequestHandler } from './$types';
```

which makes it read exactly like a deployed endpoint. It is not — SvelteKit only routes `+server.ts` —
but anyone auditing the stream path has to prove that to themselves first. Delete it, or move it out
of `routes/` if it is a reference implementation worth keeping.

---

### C2 — Nine dead members in the `AgentSSEMessage` union

**Location:** `packages/shared-types/src/agent.types.ts:407-412` and `:516-557`

This is the direct answer to "is it in sync with the backend."

Cross-referencing every `type` in the union against server emit sites (`apps/web/src/lib/server`,
`apps/web/src/routes/api`, `apps/worker/src`, `packages/*/src`, excluding tests) and against the
client's `switch` in `agent-chat-sse-handler.ts`:

| Event type                          | Emitted by server | Handled by client |
| ----------------------------------- | ----------------- | ----------------- |
| `ontology_loaded` (`:520`)          | ❌ 0 sites        | ❌                |
| `focus_active` (`:522`)             | ❌ 0 sites        | ❌                |
| `focus_changed` (`:523`)            | ❌ 0 sites        | ❌                |
| `clarifying_questions` (`:532`)     | ❌ 0 sites        | ❌                |
| `operation` (`:408`, legacy)        | ❌ 0 sites        | ❌                |
| `draft_update` (`:409`, legacy)     | ❌ 0 sites        | ❌                |
| `dimension_update` (`:410`, legacy) | ❌ 0 sites        | ❌                |
| `phase_update` (`:411`, legacy)     | ❌ 0 sites        | ❌                |
| `queue_update` (`:412`, legacy)     | ❌ 0 sites        | ❌                |

Within live server emit sites and the modal handler, each count is zero. Similar spellings do remain
in retired local protocol types, generic phase-classifier cases, admin audit data, and synthetic
parity fixtures; the implementation pass confirmed none of those are live `AgentSSEMessage`
emissions. The original "only occurrence" wording was too broad.

**Why this is worth fixing rather than ignoring.** The client's `default:` case
(`agent-chat-sse-handler.ts:764`) is `// Unhandled/legacy event types — silently ignore.` That is a
reasonable runtime posture, but combined with nine phantom union members it means **the type system
cannot tell you whether client and server agree.** A real future drift — a server emitting something
new — lands in the same silent `default:` as these nine ghosts. Deleting the dead members makes the
union an accurate contract again and lets an exhaustiveness check do real work.

**Everything else is genuinely in sync.** All 13 live event types are handled.

---

### MB1 — Primary mobile header button is 36 px

**Location:** `AgentChatHeader.svelte:562`

```svelte
<div class="relative sm:hidden">
    <button class="flex h-9 w-9 items-center justify-center rounded-lg ..." aria-label="More actions">
```

`h-9 w-9` = **36 px**, inside an `sm:hidden` wrapper — so this is mobile-only, and it is the single
overflow entry point for every header action on mobile. Below the 44 px touch-target minimum.

The inconsistency is internal: `AgentRunDock.svelte:97`, `WorkPanel.svelte:303,315,346`, and
`AgentRunDispatchModal.svelte:106,322` all correctly use `min-h-11` (44 px).

---

## 3. LOW findings

### M4 — Animated `filter: drop-shadow` for 1.15 s

**Location:** `AgentChatHeader.svelte:729-742`

```css
@keyframes agent-context-glow {
	0% {
		filter: drop-shadow(0 0 0 hsl(var(--accent) / 0));
	}
	45% {
		filter: drop-shadow(0 0 5px hsl(var(--accent) / 0.55))
			drop-shadow(0 0 12px hsl(var(--accent) / 0.3));
	}
	100% {
		filter: drop-shadow(0 0 0 hsl(var(--accent) / 0));
	}
}
```

Two stacked `drop-shadow` filters animated for 1.15 s, running concurrently with two other keyframe
animations on the same element (`:701-704`: `agent-context-pop` + `agent-context-shimmer`).
Filter animation is not compositor-cheap, and drop-shadow specifically re-rasterizes per frame.

**Mitigating factors, stated honestly:** this fires on context shift, which is an _occasional_
moment — `AUDIT.md` §1 permits a delight budget there, and §2's 300 ms cap explicitly does not apply
to deliberate explanatory moments. Reduced motion is handled correctly at `:743`. The `pop` keyframe
uses `scale(0.97)` (not `scale(0)`) with a proper `cubic-bezier(0.22, 1, 0.36, 1)`.

So this is a watch-item, not a defect: if the header ever feels sticky on a low-end Android during a
context shift, this is the cause. Cheaper equivalent is a `box-shadow`/pseudo-element opacity fade.

**Resolution — shipped 2026-08-27.** The watch-item was removed proactively during the final motion
self-review. The title now uses one 180 ms transform/opacity cue; reduced motion uses a 120 ms
opacity-only cue. There is no animated filter, text-gradient/background-position pass, or timer.

---

### MB2 — Composer buttons 40 px on mobile

**Location:** `AgentComposer.svelte:357, 368, 382, 392, 404`

`h-10 w-10 ... sm:h-8 sm:w-8` — 40 px on mobile, 32 px on desktop. The responsive instinct is right
(larger on touch, smaller on pointer), it is just 4 px short of the 44 px guideline. These are the
send / stop / mic / attach controls — the highest-frequency touch targets in the product.

---

## 4. Rejected findings (verified, do not re-investigate)

Recording these so the same false leads aren't chased again.

| Suspected                                                                    | Verdict                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type: 'text'` events silently dropped by the client                         | **Not a bug.** `agent-chat-worker-ui-adapter.ts:156` explicitly throws `'Worker transport cannot publish a non-snapshot text event'`, and `packages/agentic-chat-runtime/src/parity.ts:143` normalizes `text` and `text_delta` to one semantic type. The guard is deliberate and defended. |
| No `@media (hover: hover)` gating → sticky hover on touch                    | **Handled centrally.** `inkprint.css:503` gates `.pressable:hover`, and `:698-704` collapses the press transition under `prefers-reduced-motion` app-wide.                                                                                                                                 |
| `h-7` (28 px) touch targets in header / audit actions                        | **Desktop-only.** `AgentChatHeader.svelte:516` is inside `hidden sm:block`; `ChatSessionAuditActions.svelte:191,206` are inside `hidden ... sm:flex`.                                                                                                                                      |
| `h-7` status pills in header (`AgentChatHeader.svelte:433,443`)              | **Not interactive** — `<span>` elements, not touch targets.                                                                                                                                                                                                                                |
| `.pressable` uses `translateY(1px)` instead of `AUDIT.md` §3's `scale(0.97)` | **Settled design decision.** Inkprint's ink-on-paper press metaphor. `AUDIT.md` Hard Rule 5 — respect documented tradeoffs.                                                                                                                                                                |
| God-component decomposition                                                  | **Already a shipped program**, see §6.                                                                                                                                                                                                                                                     |

---

## 5. What is already right

Stated explicitly because these are the things most streaming chat UIs get wrong, and they should
survive any refactor.

- **rAF-batched streaming text** (`AgentChatModal.svelte:2510-2545`). Deltas coalesce into one state
  update per frame via `scheduleAssistantTextFlush`, with a `setTimeout(cb, 16)` fallback and proper
  `cancelAnimationFrame` on explicit flush. This is the correct architecture, and it is the reason
  streaming is not already janky despite P1.
- **Non-`text_delta` events force a flush first** (`agent-chat-sse-handler.ts:667-668`), so text
  ordering relative to tool calls is preserved.
- **`bubble-send` is textbook** (`AgentMessageList.svelte:653-673`): `scale(0.96)` not `scale(0)`,
  strong ease-out `cubic-bezier(0.2, 0.8, 0.2, 1)`, 180 ms, `transform-origin: bottom right` so it
  grows from the send button, and reduced motion honored.
- **WeakMap memoization** of per-message timeline construction (`agent-chat-timeline.ts:693`).
- **`$state.raw` for `persistedTimelineItems`** (`:258`) — correct for a large array replaced wholesale.
- **Dev-gated context-usage estimate** (`:544`): _"skip the O(conversation) token estimate per
  keystroke in prod."_ Someone already found and fixed that hot path.
- **Chat pane kept mounted behind `hidden`** rather than unmounted (`:2755-2765`), with explicit
  `scrollTop` save/restore across tab switches (`:1052-1069`) because some browsers clamp a
  `display:none` scroller to 0. That is a real bug someone hit and defended against.
- **Safe-area insets** handled on both ends — `env(safe-area-inset-top)` on the header (`:2903`) and
  `pb-[max(0.75rem,env(safe-area-inset-bottom))]` on the composer (`:2810`).
- **Keyboard avoidance** via CSS custom property rather than transform (`:1534-1573`), with an
  rAF'd scroll resync.
- **Screen-reader announcement** for completed streamed replies (`:2782`), since the streaming
  bubble has no live region.

---

## 6. Component size — context, not a new finding

`PROPOSAL_2026-04-18_GOD-COMPONENT-DECOMPOSITION.md` records 4,254 LOC at inception and ~2,498 LOC
as of 2026-06-22, with the tool presenter, SSE handler, voice adapter, prewarm controller, session
helpers, attachment controller, stream controller, and shell router all extracted with tests.

**Today it is 2,992 LOC — roughly +494 since 2026-06-22.** The component is regrowing.

That proposal already names the remaining seam: _"session hydration/finalization plus the A2A turn
runner."_ This audit adds no new decomposition proposal; it just flags that the trend reversed, and
that 18 `$effect` blocks (`:281, 398, 406, 416, 433, 535, 791, 1137, 1229, 1231, 1233, 1238, 1273,
1524, 1534, 1588, 2055, 2168`) now live in the shell. Most are legitimate side effects — subscription
lifecycle, prop mirroring to parents, cleanup — not effect-as-derived antipatterns. M2 is the one
that is actually wrong.

---

## 7. Missed opportunities

Additive, not corrective. `AUDIT.md` §8.

1. **Session-restore replays every bubble animation at once.** `AgentMessageList.svelte:665` comments
   that `bubble-send` _"plays once per newly-rendered bubble (incl. session load)."_ On restore, all
   bubbles fire simultaneously — a flash rather than a reveal. Either suppress on hydration (correct
   for a send-confirmation microinteraction, which is what it is named for) or apply a 30–80 ms
   stagger capped at the first ~8 bubbles.
2. **Tab switch is an instant swap.** `AgentChatModal.svelte:2755-2765` toggles `flex`/`hidden`
   between the chat pane and activity tabs with no transition. A ~150 ms opacity crossfade would stop
   the content from teleporting. Must not delay interaction.
3. **No swipe-to-dismiss on the bottom sheet.** `:2884-2885` sets `enableGestures={false}` and
   `showDragHandle={false}`. This is plausibly deliberate — drag gestures conflict with a scrolling
   message list — but it means the mobile bottom sheet has no gesture affordance at all, which is the
   one interaction users reflexively try. If revisited, dismissal should be velocity-based
   (`Math.abs(distance)/elapsedMs > ~0.11`), not distance-thresholded, and confined to a drag handle
   or the header region so it cannot fight the scroller.

---

## 8. Recommended order

Leverage = impact ÷ effort.

1. **M2** — scroll snap. Small, surgical, highest felt impact. Needs a real-device feel-check.
2. **C1** — delete `djtryserver.ts`. Zero risk.
3. **M1** — strip `transition-all` from the 17 `pressable` elements. Mechanical, wide, low risk.
4. **MB1 + MB2** — touch targets to 44 px. Mechanical.
5. **C2** — prune the nine dead union members, then consider an exhaustiveness check.
6. ~~**M3** — `max-height` → grid-rows in `ThinkingBlock`.~~ Shipped; feel-check still owed.
7. ~~**P1** — profile first.~~ Measured against production sizes; no optimization warranted.
8. ~~**M4** — watch-item.~~ Shipped as one brief compositor-safe context-shift cue.

Opportunities (§7) are independent of the above and can land any time.
