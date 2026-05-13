<!-- apps/web/docs/features/agentic-chat/AUDIT_2026-05-12_UX-PASS-REVIEW.md -->

# Agentic Chat Modal — UX/UI Audit (2026-05-12)

**Scope:** Independent review of the standardized agentic chat modal screens and first-time user experience.
**Reviewer:** Claude (independent assessment, not the implementer)
**Branch:** `main` (uncommitted changes on top of `9c79c0fa`)
**Status:** ✅ **Fully resolved on 2026-05-12.** All 18 items have been addressed (15 fixed directly, 3 P2 items resolved as side effects of P1). `pnpm run check` → 0 errors; `pnpm test:run src/lib/components/agent/` → 164/164 passing.

## Resolution snapshot

| Severity | Items                                 | Status                      |
| -------- | ------------------------------------- | --------------------------- |
| P0       | #1, #2, #3                            | ✅ Fixed                    |
| P1       | #4, #5, #6, #7, #8                    | ✅ Fixed                    |
| P2       | #9, #10, #11, #12, #13, #14, #15, #16 | ✅ Fixed                    |
| P2       | #17, #18                              | ✅ Made moot by P1.5 / P1.6 |

**Recommended pre-ship smoke test:** the agent_to_agent wizard (P2.9 auto-skips the helper step → opens on the project picker; P2.10 made step dots + helper/project badges tappable) and the inline focus selector mid-chat (P1.5 — no longer a modal; back arrow now dismisses it).

## Files reviewed

| File                                                             | LOC changed since `HEAD~1` |
| ---------------------------------------------------------------- | -------------------------- |
| `apps/web/src/lib/components/chat/ContextSelectionScreen.svelte` | 450                        |
| `apps/web/src/lib/components/agent/AgentAutomationWizard.svelte` | 355                        |
| `apps/web/src/lib/components/agent/ProjectFocusSelector.svelte`  | 128                        |
| `apps/web/src/lib/components/agent/ProjectActionSelector.svelte` | 72                         |
| `apps/web/src/lib/components/agent/AgentChatModal.svelte`        | 24                         |
| `apps/web/src/lib/components/agent/AgentMessageList.svelte`      | 13                         |
| `apps/web/src/lib/components/agent/AgentComposer.svelte`         | 6                          |

Supporting reads: `AgentChatHeader.svelte`, `ProjectFocusIndicator.svelte`, `agent-chat.constants.ts`.

---

## Headline

The work is mostly aligned to Inkprint, textures are applied with intent, and the multi-step flow is structurally sound. But several inconsistencies between screens — and one real first-time-user bug — are worth a second pass before this ships.

---

## P0 — actual bugs

### 1. New-user welcome state is unreachable — ✅ Resolved

> **Fixed:** dropped the `selectedView !== 'project-selection'` gate in `ContextSelectionScreen.svelte` so projects load on first paint of the primary view. `isNewUser` can now flip true; the active-project count on the project-chat card also populates.

`ContextSelectionScreen.svelte:123-131` only calls `loadProjects()` when `selectedView === 'project-selection'`. The derived `isNewUser` on line 272 requires `hasLoadedProjects === true` to flip on.

```ts
// line 123
$effect(() => {
	if (!browser) return;
	if (selectedView !== 'project-selection') return;
	// ...
});

// line 272
const isNewUser = $derived(
	hasLoadedProjects && lastProjectQuery === '' && !hasProjects && !projectsError
);
```

On first paint of the primary view `hasLoadedProjects` is always `false`, so `isNewUser` is always `false`. A brand-new user sees **"What do you want to work on?"** with a "Work inside a project" card that opens an empty list — they never see **"Start with your first project."**

**Fix:** kick off `loadProjects({ search: '' })` on mount/when `selectedView === 'primary'` too. Prefetch is also a nice perf win for the count text on line 431 (currently never appears, same root cause).

---

### 2. Dead props on `ProjectActionSelector` and `AgentAutomationWizard` — ✅ Resolved

> **Fixed:** removed `onBack` from `ProjectActionSelector` and `onBackAgent` / `onBackProject` from `AgentAutomationWizard`. Parent's pass-through in `AgentChatModal.svelte` was also removed. Header back arrow (`handleBackNavigation`) continues to drive step-back via the parent's `backToAgentSelection` / `backToAgentProjectSelection` (still used).

- `ProjectActionSelector.svelte:43` accepts `onBack` then renames it to `_onBack` and never uses it.
- `AgentAutomationWizard.svelte:37-38` does the same with `onBackAgent` / `onBackProject`. The parent (`AgentChatModal.svelte:2739-2740`) does pass these, but the wizard throws them away.

The parent thinks the wizard handles step-back navigation; it doesn't.

**Fix:** either wire them up (so each step has its own visible back affordance and step dots can be tappable) or remove them from the prop interface.

---

### 3. `color` palette declared but never used — ✅ Resolved

> **Fixed:** dropped the dead `color` keys from `focusTypes` in `ProjectFocusSelector.svelte`. (The selector was later rewritten in P1.5/P1.6 to consume the shared `ProjectEntityList`.)

`ProjectFocusSelector.svelte:40-52` defines `color` on every focus type (blue/purple/emerald/amber/indigo/red) and nothing reads it.

```ts
const focusTypes: Array<{
	value: FocusEntityType;
	label: string;
	icon: typeof CheckSquare;
	color: string; // ← declared, never used
}> = [
	{ value: 'task', label: 'Tasks', icon: CheckSquare, color: 'blue' }
	// ...
];
```

Either tint the icons/badges with it (mirroring the colored treatments in `ProjectActionSelector`) or drop the field.

---

## P1 — standardization gaps

### 4. The first screen looks like a different design system than every other step — ✅ Resolved

> **Fixed:** lifted the title/subtitle out of the centered content area into a left-aligned `tx-strip` band in `ContextSelectionScreen.svelte`. All five screens now share the same header rhythm.

| Screen                                  | Header treatment                                      |
| --------------------------------------- | ----------------------------------------------------- |
| `ContextSelectionScreen` primary        | **Centered**, no strip band, no card background       |
| `ContextSelectionScreen` project picker | `tx-strip` band, left-aligned, with subtitle + search |
| `ProjectActionSelector`                 | `tx-strip` band, left-aligned                         |
| `AgentAutomationWizard`                 | `tx-strip` band, left-aligned, with step dots + Exit  |
| `ProjectFocusSelector` (modal)          | `<Modal>` chrome + `tx-strip` filter band             |

Steps 2–5 share a rhythm. Step 1 sits outside it. Make the primary view also live in a `tx-strip` band (with the same h2/subtitle pattern) so the modal has a single, consistent screen header.

---

### 5. `ProjectFocusSelector` is a nested modal — everything else is a takeover screen — ✅ Resolved

> **Fixed:** `ProjectFocusSelector` was rewritten to drop its `<Modal>` wrapper and is now mounted inline inside `AgentChatModal` alongside `ProjectActionSelector` and the automation wizard. Derived state (`shouldShowComposer`, `shouldShowSessionLoadingState`, `shouldShowSessionLoadErrorState`) and `handleBackNavigation` updated to account for the new inline state.

`ProjectFocusSelector.svelte:150` wraps in `<Modal>`. The chat itself is already inside `<Modal>` (`AgentChatModal.svelte:2657`). So:

- Mid-chat refocus = modal-on-modal stack.
- Initial focus = inline takeover screen.

Two different mental models for the same task. Promote `ProjectFocusSelector` to an inline screen (mounted in `AgentChatModal` like `ProjectActionSelector` is at lines 2718-2726) and drop the `<Modal>` wrapper.

---

### 6. Same entity picker, two divergent implementations — ✅ Resolved

> **Fixed:** extracted a new `ProjectEntityList.svelte` that owns the entity-type tabs, debounced search, sort logic, live-search highlighting, and metadata badges. Both `ProjectActionSelector` and `ProjectFocusSelector` consume it, so re-focusing mid-chat now looks identical to the initial focus pick.

`ProjectFocusSelector` and `ProjectActionSelector` both pick from the same six entity types. Compare:

| Behavior                                   | `ProjectActionSelector`                   | `ProjectFocusSelector`               |
| ------------------------------------------ | ----------------------------------------- | ------------------------------------ |
| Search highlight                           | Yes (`highlightMatch`)                    | No                                   |
| Sort (active first, priority, impact, due) | Yes (`sortEntitiesForSelection`)          | No — raw API order                   |
| Metadata badges                            | state, priority, impact, type family, due | only state + due                     |
| Icon palette                               | grayscale                                 | declares colors but doesn't use them |
| Container                                  | inline screen                             | nested modal                         |
| Project-wide CTA                           | full-width recommended card               | small button in header               |

Extract a shared `<EntityTypeTabs />` + `<EntityRow />` + the sort helpers from `ProjectActionSelector` and have both screens consume them. Same entities, same picker, same UX.

---

### 7. Five names for one concept — ✅ Resolved

> **Fixed:** picked **"Project chat"** (destination) and **"Project-wide"** (focus scope). Updates: `agent-chat.constants.ts` ("Project workspace" → "Project chat"), `ProjectActionSelector` ("Open the whole project" → "Project-wide chat"), `ProjectFocusSelector` ("Project overview" → "Project-wide"), `ProjectFocusIndicator` ("Project-wide view" → "Project-wide"), `ContextSelectionScreen` ("Work inside a project" → "Chat inside a project"; "Pick a project to work in" → "Pick a project to chat in"), `AgentAutomationWizard` ("Pick a project to work in" → "Pick a project to chat in").

| Surface                       | Term used                                           |
| ----------------------------- | --------------------------------------------------- |
| Context selection             | "Work inside a project" / "PROJECT CHAT"            |
| Action selector               | "Open the whole project" / `BriefcaseBusiness` icon |
| `CONTEXT_DESCRIPTORS.project` | "Project workspace"                                 |
| Focus selector header         | "Project overview"                                  |
| `ProjectFocusIndicator`       | "Project-wide view"                                 |

Pick at most two — "Project chat" (the destination) and "Project-wide" (the focus scope) read naturally — and apply across all surfaces.

---

### 8. Seeded initial message vs. empty state compete for the same slot — ✅ Resolved

> **Fixed:** removed `generateInitialMessage`, `addInitialAssistantMessage`, `seedInitialMessage` from `AgentChatModal.svelte` and all 5 call sites. `AgentMessageList.svelte` now accepts `selectedContextType` + `resolvedProjectFocus` and branches its empty-state suggestions per context (global / project_create / project / focused-entity / calendar / daily_brief / daily_brief_update). Focused-entity suggestions reference the entity by name.

`AgentChatModal.seedInitialMessage` injects an assistant bubble for `global`, `project_create`, `project`, `calendar`, `daily_brief`, `daily_brief_update`. `AgentMessageList:88-122` also renders a "New chat · {label}" empty state with three suggestion buttons. The empty state only shows when the seed didn't run (rare). Two patterns for "blank chat," very different visual weight.

**Pick one.** Recommendation: drop the seeded assistant bubble, keep the empty-state card, and branch its suggestions per context. That gives the user quick-reply chips — which the seeded bubble can't.

---

## P2 — polish

### 9. Wizard has a one-option step — ✅ Resolved

`AgentAutomationWizard` step 1 = "Pick a helper" with exactly one card ("Actionable Insight"). Fake choice that wastes a step. Either auto-select and start at "Pick a project," or add real helpers.

> **Fixed:** added `HAS_MULTIPLE_AGENT_HELPERS = false` constant in `AgentChatModal.svelte`. On entering agent_to_agent mode the parent auto-calls `selectAgentForBridge(RESEARCH_AGENT_ID)`, so the wizard opens on the project step. Project-step back exits the wizard instead of returning to the now-skipped agent step. Wizard receives `hasMultipleHelpers` prop and filters the agent step out of its dots; Helper badge on the goal step renders as a static label (no "Change"). Flip the constant to `true` once a second helper ships.

### 10. Wizard step dots aren't interactive — ✅ Resolved

`AgentAutomationWizard.svelte:93-127` renders dots + labels with `aria-current` but no click behavior. The goal step's "Helper:" / "Project:" badges (lines 213-226) also can't be tapped to edit. Both should jump to that step.

> **Fixed:** completed step dots become buttons that jump back. Helper/Project context badges on the goal step are also buttons with a "Change" suffix (subject to `hasMultipleHelpers` — see #9). Wizard exposes a new `onJumpToStep` callback; parent maps `'agent'` → `backToAgentSelection`, `'project'` → `backToAgentProjectSelection`. Forward jumps are silently ignored.

### 11. Composer placeholder reads awkwardly — ✅ Resolved

`AgentComposer.svelte:57-60` builds `"Ask about ${displayContextLabel.toLowerCase()}..."`. For global context the label is "General chat" → placeholder becomes "Ask about general chat...". Special-case the global label, or just use "Ask BuildOS anything…" when the label is generic.

> **Fixed:** added a `GENERIC_CONTEXT_LABELS` set in `AgentComposer.svelte` so generic labels ("general chat" / "project chat" / "open-ended chat" / unconfigured) fall through to "Ask BuildOS anything…". Project-specific labels still get the targeted "Ask about ${name}…" treatment.

### 12. "Recent" group header is out of parallel — ✅ Resolved

`ContextSelectionScreen.svelte:657-668` shows "Recent" / "Not touched in last 7 days" / "Not touched in last 30 days". The first one breaks the pattern. Use "Last 7 days" or "Touched this week" to match.

> **Fixed:** all three group headers now use parallel time-based framing: **"Last 7 days"** / **"8–30 days ago"** / **"Over 30 days ago"**. Counts retained.

### 13. Composer hint "Loading..." is uninformative — ✅ Resolved

`AgentComposer.svelte:65-69` shows "Loading..." when `disabled`. Users don't know what's loading. Use "Preparing your context…" or "Restoring chat…" — whichever matches the actual state from `sessionStatusLabel`.

> **Fixed:** added `disabledReason` prop on `AgentComposer`. Parent passes through `sessionStatusLabel` so the hint surfaces "Loading session..." / "Preparing session..." instead of generic "Loading...". Streaming hint also clarified to "BuildOS is responding...".

### 14. "You can always change it from the back arrow" copy — ✅ Resolved

`ContextSelectionScreen.svelte:313`. The back arrow is in the modal header — most users won't connect "back arrow" with that affordance on first read. Drop the sentence or say "switch later from the arrow in the top-left."

> **Fixed:** copy now reads "switch later from the arrow in the top-left." (Folded into P1.4 — the strip-band header rewrite.)

### 15. Header subtitle filler — ✅ Resolved

`AgentChatHeader.svelte:154` shows "Ready to assist" when there's no project focus. Either show the actual `CONTEXT_DESCRIPTORS` subtitle or nothing — "Ready to assist" is empty filler.

> **Fixed:** dropped the `|| 'Ready to assist'` fallback and gated the bullet separator on having a real subtitle, so no dangling "•" if the descriptor is ever empty.

### 16. Turn-limit field needs a default-rationale hint — ✅ Resolved

`AgentAutomationWizard.svelte:248-265` shows `min=1 max=50` defaulting to 5 with no guidance. Add "5 is a good starting point" (or whatever fits) as helper text under the input.

> **Fixed:** added "5 is a good starting point — most loops resolve in 3–5 turns. Bump it up for more open-ended work." as helper text, wired to the input via `aria-describedby`.

### 17. `ProjectFocusSelector` modal min-height — ✅ Made moot by P1.5

`ProjectFocusSelector.svelte:151` uses `min-h-[500px] max-h-[70vh]`. With a mobile keyboard open this clips. Use `dvh` and let it flex. (Moot if #5 is done.)

> **Resolved:** `ProjectFocusSelector` is no longer a modal (P1.5). It mounts inline inside `AgentChatModal` and inherits the chat pane's flex layout, so there is no fixed min-height to clip the mobile keyboard against.

### 18. "Project overview" button vs. the recommended card — ✅ Made moot by P1.6

Action selector treats "open the whole project" as a giant recommended primary card (lines 280-314). Focus selector hides the same idea behind a small uppercase button in the corner (lines 158-165). Same affordance, totally different weight. (Moot if #6 is unified.)

> **Resolved:** unified by P1.6. Both screens now render the same recommended "Project-wide chat" card as a primary CTA above the entity list. The focus selector's "current focus" indicator additionally surfaces a "Current" pill on this card when the active focus is project-wide.

---

## What's working well

- **Texture vocabulary** (`frame`=primary, `grain`=execution, `bloom`=new, `thread`=collaboration, `static`=warning, `strip`=section header, `grid`=composer) is intentional and consistently applied across surfaces.
- **Recency-grouped project list** mirrors the `/projects` page — good muscle-memory transfer.
- `ProjectActionSelector`'s **metadata badges** (state/priority/impact/due/type family) and **live search highlighting** are excellent. They should be the template for the focus selector.
- **Wizard step indicator** and "Step N of 3" pattern is the right structural treatment for a multi-step flow.
- **Mobile responsive density** (close/back button sizing, hidden subtitles, status pill collapsing to icons) is thoughtful.

---

## Resolution log (2026-05-12)

The pass executed in three batches:

1. **P0 batch** — #1 (new-user state bug), #2 (dead props), #3 (dead `color` config). Smallest blast radius, biggest first-impression win.
2. **P1 batch** — #4 (strip-band header on screen 1), #7 (vocabulary lock), #8 (drop seed / branch empty-state suggestions), then #5 + #6 together (extracted `ProjectEntityList.svelte`; promoted `ProjectFocusSelector` out of nested modal).
3. **P2 batch** — #9, #10, #11, #12, #13, #15, #16 fixed directly; #14 was already folded into P1.4; #17 and #18 made moot by P1.5 and P1.6.

**Files touched across the pass:**

- `apps/web/src/lib/components/agent/AgentChatModal.svelte`
- `apps/web/src/lib/components/agent/AgentMessageList.svelte`
- `apps/web/src/lib/components/agent/AgentComposer.svelte`
- `apps/web/src/lib/components/agent/AgentChatHeader.svelte`
- `apps/web/src/lib/components/agent/AgentAutomationWizard.svelte`
- `apps/web/src/lib/components/agent/ProjectActionSelector.svelte` (rewritten — consumes `ProjectEntityList`)
- `apps/web/src/lib/components/agent/ProjectFocusSelector.svelte` (rewritten — inline screen, consumes `ProjectEntityList`)
- `apps/web/src/lib/components/agent/ProjectEntityList.svelte` (**new**)
- `apps/web/src/lib/components/agent/ProjectFocusIndicator.svelte`
- `apps/web/src/lib/components/agent/agent-chat.constants.ts`
- `apps/web/src/lib/components/chat/ContextSelectionScreen.svelte`

---

## Quick reference: standardization matrix

### Screen header pattern

- Primary context selection → **inconsistent** (centered, no band)
- Project picker, action selector, wizard, focus selector → strip band
- Chat header → 48px compact bar (this one is fine to differ — it's the persistent chrome)

### Selector container pattern

- ContextSelection, ProjectAction, AgentAutomationWizard → **inline screen**
- ProjectFocus → **nested modal** _(inconsistent)_

### Project-as-a-concept terms

- "Project chat" / "Work inside a project" / "Open the whole project" / "Project workspace" / "Project overview" / "Project-wide view" → **pick 2**

### Texture mapping (consistent — keep)

| Texture     | Used for                                                                      |
| ----------- | ----------------------------------------------------------------------------- |
| `tx-frame`  | Header bar, primary chat card, assistant bubble, agent-to-agent project tiles |
| `tx-grain`  | Project chat card, goal config card                                           |
| `tx-bloom`  | Setup card, empty states, clarification messages                              |
| `tx-thread` | Agent helper card, agent peer messages, automation footer, ONTO badge         |
| `tx-static` | Error states, warning pills                                                   |
| `tx-strip`  | Screen header bands                                                           |
| `tx-grid`   | Composer textarea                                                             |
