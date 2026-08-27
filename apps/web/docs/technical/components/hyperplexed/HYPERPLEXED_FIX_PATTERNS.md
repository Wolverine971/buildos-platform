<!-- apps/web/docs/technical/components/hyperplexed/HYPERPLEXED_FIX_PATTERNS.md -->

# Hyperplexed Fix Patterns — BuildOS Recipes

> The fix side of the [Hyperplexed Design Playbook](./HYPERPLEXED_DESIGN_PLAYBOOK.md). The playbook
> tells you what's wrong; this doc tells you the BuildOS-native fix, so each audit links a finding to
> a pattern number instead of re-deriving the recipe. The catalog started from the fixes the
> 2026-06 audit wave shipped plus the effect recipes in playbook §2, and has since grown beyond
> taste into loading, state-truth, and structural patterns (P19+).
>
> **P-numbers are stable and append-only** (they're cited from every audit doc and tracker row);
> **sections are thematic** — a new pattern takes the next number but files under the section it
> belongs to, so numbers are not in file order past P18.
>
> Conventions assumed everywhere: **Inkprint tokens** (`bg-card`, `text-foreground`, `shadow-ink`,
> `tx-*` — see `INKPRINT_DESIGN_SYSTEM.md`), **Svelte 5 runes**, **Tailwind**, light + dark mode,
> lucide icons only via `$lib/icons/lucide.ts`.

---

## Alignment & overflow

### P1 · Overflow-safe row (label can never knock the icon out of alignment)

**Finding:** a long label wraps or pushes, shifting its icon/neighbor out of line with the row
(playbook §1, his #1 complaint).

```svelte
<div class="flex items-center gap-2 min-w-0">
	<Icon class="h-4 w-4 shrink-0" />
	<span class="truncate">{label}</span>
	<!-- multi-line variant: class="line-clamp-2" on a block element -->
</div>
```

The three-part contract: `min-w-0` on the flex parent (so the text child is allowed to shrink),
`truncate`/`line-clamp-*` on the text, `shrink-0` on every icon/badge that must hold its size.
Never leave a user-supplied string unclamped. In-repo bar: `ProjectStateRow.svelte` and the entire
project detail page (see `PROJECT_PAGE_AUDIT_2026-06-26.md` — "overflow is genuinely handled").

### P2 · Two-radius rule (consistent corner language)

**Finding:** mixed corner radii on one surface; square outliers among rounded components.

- **Containers/cards/panels: `rounded-lg`. Inner controls (buttons, inputs, chips): `rounded-md`.**
- Larger radius on the outer element, smaller on the inner — the playbook's Android app-drawer rule,
  locked as a convention by the project-page audit and re-applied by every audit since.
- Bare `rounded` (0.25rem) and one-off `rounded-xl` are drift unless deliberately carved out
  (document the carve-out in the audit like `AGENT_CHAT_MODAL_AUDIT` did).

### P3 · One width + one padding scale for shells

**Finding:** each region invents its own container width/padding, so edges don't line up page-to-page.

The shell convention (shipped in `NAVIGATION_AND_LAYOUT_AUDIT_2026-06-26.md` A1):
**`max-w-7xl mx-auto px-2 sm:px-4 lg:px-6`** — nav, banners, main frame, footer, and page content
wrappers all use the same scale, so every surface shares left/right edges at every breakpoint.
New pages adopt this; don't introduce `max-w-[1200px]`, `container`, or a third padding scale.

---

## Hierarchy & labels

### P4 · Demote metadata to subtext, don't add containers

**Finding:** secondary info (dates, counts, city/state/zip) rendered at the same size/weight/color as
the primary content, or wrapped in extra boxes/dividers to "separate" it.

```svelte
<div class="min-w-0">
	<p class="text-sm font-medium text-foreground truncate">{title}</p>
	<p class="text-xs text-muted-foreground truncate">{metadata}</p>
</div>
```

Differentiate with size/weight/color only. Adding an element is the last resort, not the first.

### P5 · The micro-label

**Finding:** small uppercase section labels hand-rolled differently in each file (tracking, size,
weight, and color all drifting).

Use the global **`.micro-label`** class (single source of truth in `src/lib/styles/inkprint.css`),
optionally composed with a color utility. Never re-specify `text-[10px] uppercase tracking-wide …`
inline — that drift is exactly what the agent-chat-modal audit spent its Tier 0 consolidating.

### P6 · Rename before you restyle

**Finding:** a label that's vague ("Welcome"), redundant ("RT Podcast"), wrapping, or ambiguous —
or a layout fix being attempted where a copy fix is cheaper.

Procedure, in order:

1. **Say what it is.** Can a user predict the contents from the label alone? If not, rename
   ("Welcome" → "My Account").
2. **Shorten until just before ambiguity.** "TV Shows" → "TV"; drop brand prefixes.
3. **Show identifying info, not incidental.** Domain + page name beats a truncated URL/title.
4. **Read it in context.** Check adjacency readings with neighboring text, and check the wrap at
   mobile width — a shorter label often dissolves the layout problem entirely.
5. Only if the right label still doesn't fit → now it's a layout problem (P1).

---

## Decluttering

### P7 · Filters button + selected-state chips

**Finding:** a row of always-visible filter controls (or multiple scroll regions) competing for space.

Collapse controls into one **"Filters" toggle button** that expands a panel
(`transition:slide={slideMotion()}` — see P11), and render **active filters as removable chips**
below it so state stays visible while the panel is closed, plus a "Clear filters" action.
In-repo example: the admin users page redesign (`ADMIN_PAGES_AUDIT_2026-06-26.md`, shipped
2026-06-26) — search stays visible, everything else collapses.

### P8 · Don't hide what fits

**Finding:** primary actions tucked into a drawer/overflow menu when the layout has room for them.

Inverse of P7 — hiding is for genuine overflow, not for dodging a layout decision. Pull the 1–3
highest-value actions out of the drawer into the flow (Costco quick-actions rule); apply P6 to make
their labels short enough to fit. If the drawer ends up with ≤1 item, delete the drawer.

---

## Icons & imagery

### P9 · Icon in a fixed container, one icon set

**Finding:** mixed icon weights/sets, or layout depending on each icon's intrinsic size/shape.

- Lucide only, imported via the Vite alias file `src/lib/icons/lucide.ts` (add the re-export there
  first — verify the installed subpath).
- Give every icon an explicit box (`h-4 w-4` / `h-5 w-5`) + `shrink-0`; when icons sit in a row or
  grid, wrap in a fixed container (`flex h-9 w-9 items-center justify-center rounded-md`) so
  alignment never depends on the glyph.

### P10 · Scrim for text over imagery

**Finding:** text overlaid on an image/gradient without guaranteed contrast.

```svelte
<div class="relative overflow-hidden rounded-lg">
	<img {src} alt="" class="h-full w-full object-cover" />
	<div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
		<p class="text-sm font-medium text-white truncate">{title}</p>
	</div>
</div>
```

Let the image own the full card; overlay info on the scrim; carve explicit space for any action
button inside the image area rather than floating it ambiguously.

---

## Mobile & data density

### P11 · Reduced-motion gating (every animation, no exceptions)

**Finding:** transitions/animations that ignore `prefers-reduced-motion`.

- Svelte transitions: use `slideMotion()` from `lib/components/project/v2/board-a11y.ts`
  (`transition:slide={slideMotion()}`) — it reads the live media query and collapses to instant.
- Tailwind keyframe utilities: pair with `motion-reduce:animate-none`
  (the `Button.svelte` spinner is the in-repo model: `animate-spin motion-reduce:animate-none`).
- Hand-rolled CSS animation: wrap in `@media (prefers-reduced-motion: no-preference)` or provide a
  `reduce` block that swaps to a simple fade. `.pressable` is already gated at the source.

### P12 · Wide table → mobile card fallback

**Finding:** a data table that forces horizontal scroll (or clips) on phones.

Render the table `hidden md:table` and a card list `md:hidden`, where each card shows the row's
identifying field (P4 title + subtext), the 2–3 highest-value columns as labeled pairs, and the row
actions as full-width tap targets. Shipped across the admin console (S-pattern fixes,
`ADMIN_PAGES_AUDIT_2026-06-26.md`); reuse that markup shape rather than inventing a new card.

### P13 · Route interactive controls through the primitives

**Finding:** hand-rolled `<button>`/`<a>`/`<input>` missing focus rings, tap targets, and motion
gating — the "mouse-first subpage" regression the admin audit named.

`ui/Button.svelte` is the bar: `min-h/min-w-[44px]` tap targets, `focus-visible:ring-2` with proper
ring offset, reduced-motion-gated loading state. Use it (and `Select`, `Modal`, `TabNav`) instead of
raw elements. If a control genuinely can't use the primitive, it must replicate all three guarantees:
44px hit area, `focus:outline-none focus-visible:ring-2`, `motion-reduce:` gating. For composite
widgets (kanban columns, menus, tabs) use `handleRovingTabKeydown` from `board-a11y.ts` — one tab
stop per widget, arrows within.

### P26 · Let `.pressable` own the transition

**Finding:** a control combines `.pressable` with `transition-all`, another Tailwind transition
utility, or a `duration-*` utility. Equal-specificity utilities emitted after Inkprint replace the
token's curated transition list, so border, background, filter, and texture changes can animate
off-GPU while the 100ms press response silently inherits a slower duration.

Treat `.pressable` as the sole transition owner on that element:

1. Remove `transition-all`, `transition-*`, and `duration-*` from the same class list.
2. Keep the shared transform/opacity/shadow response in `inkprint.css`; do not re-declare it locally.
3. If a color transition is genuinely important, put it on a non-pressable child or change the
   shared token deliberately instead of winning the cascade from one call site.
4. Preserve `.pressable`'s central hover and reduced-motion gating (P11). Add a source-contract test
   when a dense surface has many hand-authored controls so future class sweeps cannot reintroduce
   the conflict.

### P27 · Give scroll synchronization one reactive trigger

**Finding:** a Svelte `$effect` is described as running only when a list gains rows, but a helper
called inside the effect also reads reactive DOM references or manual-scroll flags. Those transitive
reads become dependencies, so an ordinary scroll event can re-run synchronization and snap the
viewport.

Make the intended event explicit:

1. Derive a narrow trigger such as `messages.length` or the newest stable row id.
2. Read that trigger directly in the effect.
3. Read the scroll container, stick-to-bottom flag, and other guard state through `untrack()` so
   they can decide what the effect does without deciding when it runs.
4. Keep the DOM write synchronous when the effect already runs after the list's DOM update and a
   requestAnimationFrame would expose a one-frame jump.
5. Verify momentum scrolling on a physical touch device: scroll up during streaming, then return
   slowly to the bottom and confirm no threshold crossing snaps to the absolute end.

---

## Signature effects (use at most one per surface)

### P14 · Cursor-glow card grid (the Linear/Vercel moment)

The playbook §2 recipe adapted to Svelte 5 — one listener on the wrapper drives every card, and the
whole effect is a no-op under reduced motion:

```svelte
<script>
	let wrapper = $state(null);
	const reduceMotion =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)');

	function handleMove(e) {
		if (reduceMotion?.matches || !wrapper) return;
		for (const card of wrapper.querySelectorAll('.glow-card')) {
			const rect = card.getBoundingClientRect();
			card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
			card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
		}
	}
</script>

<div bind:this={wrapper} onmousemove={handleMove} class="grid gap-2 sm:grid-cols-3">
	{#each cards as card}
		<div class="glow-card relative rounded-lg bg-card shadow-ink">…</div>
	{/each}
</div>

<style>
	.glow-card::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		opacity: 0;
		transition: opacity 500ms;
		background: radial-gradient(
			600px circle at var(--mouse-x) var(--mouse-y),
			rgb(255 255 255 / 0.06),
			transparent 40%
		);
		pointer-events: none;
	}
	.glow-card:hover::before {
		opacity: 1;
	}
	@media (prefers-reduced-motion: reduce) {
		.glow-card::before {
			display: none;
		}
	}
</style>
```

For the full effect add the 1px lit-border layer: make the card content opaque (`bg-card`, `inset:
1px`, z-index above a second, brighter gradient layer) so only a 1px sliver of the gradient shows —
neighboring cards light up too because the wrapper listener updates every card. Under reduced motion
cards keep their static `shadow-ink` border and nothing else.

### P15 · The magic slider (map pointer % onto any property)

The generalizable skeleton under the wand/reveal/glow effects: convert pointer position to a 0→1
fraction of a container, then map onto any range.

```ts
function fraction(e: MouseEvent, el: HTMLElement): number {
	const rect = el.getBoundingClientRect();
	return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
}
// map onto a range: value = min + fraction * (max - min)
// e.g. rotation −10°→10°, opacity 0→1, blur 1→0 — feed via CSS custom props, one listener, N properties
```

Constrain, don't mirror: amplify or clamp per-axis and add a short `element.animate()` lag
(playbook §2 "chills out and lags behind") so motion feels designed rather than literal. Gate the
whole listener behind the reduced-motion check as in P14.

**Context-aware trailer variant** (the "intelligent mouse trailer"): same skeleton, but the follower
element also communicates what's under it — `e.target.closest('[data-interactable]')` answers "am I
over something," and a `data-type` attribute on the trailer drives which icon shows (CSS owns the
opacity/scale per type; JS only sets the attribute). Non-negotiables: `position: fixed`, top
z-index, `pointer-events: none`, and full removal under reduced motion. This fights the playbook's
gratuitous-overlay rule — reserve it for a genuinely canvas-like surface, not general chrome.

### P16 · Spotlight hover — dim the set via `:has()`

**Finding:** a set of peer items (card grid, nav list, link cluster) where hover feedback on one item
doesn't visually prioritize it — or where the fix was attempted by moving/scaling things.

CSS-only: when the group contains a hovered item, fade every item except the hovered one. Focus
without layout motion (playbook §2 "spotlight the hovered item").

```svelte
<div class="spotlight-group">
	{#each items as item}
		<a class="spotlight-item …">…</a>
	{/each}
</div>

<style>
	.spotlight-group:has(.spotlight-item:hover) .spotlight-item:not(:hover) {
		opacity: 0.45;
	}
	.spotlight-item {
		transition: opacity 300ms ease;
	}
	@media (prefers-reduced-motion: reduce) {
		.spotlight-item {
			transition: none; /* dim state still applies — it's not motion — but instantly */
		}
	}
</style>
```

Keep the dim ≥ 0.4 opacity so unhovered items stay readable, and pair with a `:focus-within` clause
(`_:has(.spotlight-item:focus-visible)`) so keyboard focus gets the same spotlight. Because the
effect is opacity-only it survives reduced motion as an instant state change, not a no-op.

### P17 · Forgiving shared indicator (delay the exit, never the entry)

**Finding:** a shared moving indicator (tab underline, active-nav pill, hover highlight that slides
between fixed targets) that snaps back to its resting state the instant the cursor leaves one
target — flickering while the user travels between targets.

The asymmetric-delay contract from playbook §2 ("we really only need the delay on dehover, not on
rehover"): zero `transition-delay` while _any_ target is hovered; a short delay only on full
de-hover, which absorbs the gap while the cursor crosses between targets.

```css
.indicator {
	transition:
		left 250ms ease,
		top 250ms ease;
	transition-delay: 300ms; /* default: applies on full de-hover */
}
.group:has(.target:hover) .indicator {
	transition-delay: 0ms; /* while anything is hovered: move immediately */
}
@media (prefers-reduced-motion: reduce) {
	.indicator {
		transition: none;
	}
}
```

Position the indicator per-target with hardcoded values when the target count is fixed (playbook §0:
don't over-engineer the invariant) or from `getBoundingClientRect()` when it isn't. Under reduced
motion the indicator jumps instantly — state is preserved, motion is not.

### P18 · Seamless gradient-text accent (Linear's "magic text")

**Finding:** a hero/marketing headline that wants a premium accent moment — or a gradient-text
attempt that visibly "jumps" when its animation loops.

Playbook §2's seamless-loop contract: clip a gradient to the text, oversize the background, pan it —
and make the gradient's **first and last color stops identical** so the loop has no seam. Public
marketing surfaces only (the backlog's home/about/pricing rows); never app chrome, and at most one
per surface.

```svelte
<span class="magic-text">turn messy thinking into structured work</span>

<style>
	.magic-text {
		background: linear-gradient(
			90deg,
			hsl(var(--accent)),
			hsl(var(--accent) / 0.55),
			hsl(var(--accent))
		); /* first stop == last stop — that's the whole trick */
		background-size: 200%;
		background-clip: text;
		-webkit-background-clip: text;
		color: transparent;
		animation: magic-pan 6s linear infinite;
	}
	@keyframes magic-pan {
		to {
			background-position: -200% center;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.magic-text {
			animation: none; /* gradient stays as a static accent — color, not motion */
		}
	}
</style>
```

Check dark-mode contrast of every stop against the page background — clipped gradients dodge the
usual text-color tokens, so this is exactly the kind of call the live verify pass must confirm.
Skip Linear's sparkle-stars layer unless the surface really earns it; if added, JS owns the whole
cycle (playbook §2 "one timing owner") and the stars are `aria-hidden`.

---

## Color & semantic tokens

### P19 · Tint and foreground must describe the same surface

**Finding:** text or controls use a `*-foreground` token intended for a solid semantic background
while sitting on a faint tint such as `bg-warning/10` or `bg-accent/10`. The pairing can look
plausible in one theme while falling below contrast requirements in the other.

Reserve semantic foreground tokens for their solid background pair. On a soft tint, use the normal
page foreground for body text and the semantic color only for a short label, icon, or border.

```svelte
<!-- Soft informational surface -->
<div class="border border-warning/30 bg-warning/10">
	<p class="font-medium text-foreground">Billing is not active yet</p>
	<p class="text-muted-foreground">Creating an account does not charge you.</p>
</div>

<!-- Solid action/control surface -->
<button class="bg-warning text-warning-foreground">Review billing</button>
```

Apply the same contract to `accent`, `success`, and `destructive` tokens. Color-only state changes
do not need animation; if the component already transitions colors, add
`motion-reduce:transition-none` so reduced-motion users receive the state instantly.

---

## Loading & paint performance

### P20 · Critical entity first, secondary context after first paint

**Finding:** opening one record waits on the entire parent surface, relationship graph, activity,
or nested-editor code before the user can read or edit the record they selected.

Treat the selected entity as the critical path and everything around it as progressively enhanced
context:

1. Preserve the entity identity in the navigation URL so the destination can open the requested
   record immediately.
2. Load only the entity fields required by the initial form before clearing the modal skeleton.
   Relationship lists, comments, publishing state, trees, and activity load independently afterward.
3. Do not make a broad parent-page hydration compete with a direct modal open. Resume it when the
   entity request settles or the modal closes.
4. Lazy-load nested editors. Preload the destination editor on user intent (`pointerenter` and
   keyboard `focus`) and reuse one cached import promise so route and modal hosts do not create a
   serial chunk waterfall.
5. Deduplicate concurrent secondary requests, but do not keep a persistent result cache that can
   hide link mutations. In-flight deduplication is safe; mutation refreshes still reach the server.

Keep the modal shell and core-field skeleton stable while secondary panels load so the layout does
not jump. Skeleton animation must use `motion-reduce:animate-none`; the information still appears
progressively without pulsing for reduced-motion users.

### P21 · Measured paint containment for long public pages

**Finding:** a long, mostly static marketing page lays out and paints every deep section during the
first viewport, while closed demos and below-fold media join the initial request graph.

Use browser-native containment without sacrificing the server-rendered document:

1. Keep headings, copy, links, and structured content in the SSR markup. `content-visibility` is a
   paint/layout optimization, not permission to remove crawlable or accessible content.
2. Apply `content-visibility: auto` to the heavy content wrapper _inside_ a fragment-target section,
   not to the element that owns `id="…"`. This keeps `#section` navigation reliable.
3. Measure the wrapper at phone and desktop widths, then set matching
   `contain-intrinsic-size: auto <size>`. Account for padding: intrinsic block size describes the
   contained content box, while the element's padding is added outside that estimate.
4. Give below-fold images explicit dimensions plus `loading="lazy"`, `decoding="async"`, and
   `fetchpriority="low"`. Confirm in a fresh load that they have not decoded before they are near
   the viewport.
5. Move closed demos/modals out of the initial graph with a cached dynamic import. Preload on
   `pointerenter`, `pointerdown`, and keyboard `focus`, then reuse the same promise on activation
   (P20).
6. Native fragment scrolling can run before contained sections have stable geometry. On an initial
   hash load, re-apply `scrollIntoView` after hydration with `behavior: 'instant'`; normal in-page
   clicks can retain the site's reduced-motion-aware scroll behavior (P11).

Verify scroll height before/after, direct and clicked fragment links, deferred media, the activated
demo, zero horizontal overflow, and light/dark rendering at desktop and phone widths. Browsers that
do not support `content-visibility` receive the complete page with no behavioral fallback required.

---

## State truth & badges

### P22 · A badge counts only state owned by its destination

**Finding:** a badge combines lifecycle states with different next actions, or appears on a control
whose destination cannot resolve the counted items. Typical failure: “agents working” includes
proposals that are no longer running and must be reviewed somewhere else.

Partition statuses once at the data/store layer, then bind each surface to the subset it owns:

1. Execution surfaces count only work they can monitor or control (`queued`/`running`/`paused`, plus a
   separately worded needs-input state when that surface can answer it).
2. Durable review surfaces count pending decisions they can resolve; transient notifications may point
   there but must not become a second source of pending truth.
3. Completion/history states do not keep an attention badge alive.
4. The control's accessible name spells out the count and action (“Open AI Inbox — 3 pending review
   items”), while the visible chip stays compact and caps large values (`99+`).
5. Share the count source across every view of the same destination so resolving an item updates all
   badges together; do not independently fetch competing totals.

Badges should update without attention-grabbing motion. If the destination is lazy-loaded, gate any
loading spinner with `motion-reduce:animate-none` (P11) and keep the count chip static.

---

## Structural layout (drawers, docks, secondary panels)

### P23 · Edge-anchored tab for secondary modal context

**Finding:** a dense entity modal either leaves a secondary settings/context rail permanently open,
making the primary workspace noisy, or puts the rail toggle among global header actions, making an
already-busy header harder to scan.

Treat the disclosure control as the panel's physical handle:

1. Keep the editor or primary entity content dominant. The secondary panel starts closed for every
   new modal/entity session; do not persist an open state that surprises the next record.
2. Anchor one labeled, 44px-wide tab to a consistent modal edge (BuildOS entity modals use the
   right). Keep it out of the header and attach it to the panel seam while the drawer is open.
3. Keep the tab mounted while the drawer moves so keyboard focus never falls into an element being
   hidden. Use `aria-controls` + `aria-expanded` on the tab and pair the closed panel with both
   `aria-hidden` and `inert`.
4. Give the tab position and drawer the same restrained duration/easing. Match Inkprint's modal
   weight (~280ms), and collapse both transitions with `motion-reduce:transition-none` (P11).
5. Do not hide fields required for the primary task. For a document, its title remains in the editor
   when the details drawer is closed; description, state, connections, publishing, and history can
   live behind the tab.
6. On phone widths, replace the side treatment with the surface's existing bottom disclosure or
   sheet. Do not shrink the edge tab below its usable target just to preserve it.

The tab is an earned overlay because it is the only entrance to the hidden panel, but it must remain
attached to an edge or seam—never float over the canvas as a detached launcher. Use semantic Inkprint
surface/border tokens, P2 radii, a fixed P9 icon box, and the P13 focus/target contract.

### P24 · Dock a working surface; do not float it over the work

**Finding:** a substantial secondary workflow (chat, console, inspector, preview) opens as a floating
panel over the primary canvas. It hides the content the user needs to reference, competes with other
drawers, and creates overlapping scroll regions.

Give the secondary workflow real layout space:

1. Render it as a sibling in the owning flex/grid shell so opening it resizes the primary workspace
   instead of covering it. Keep `min-h-0`/`min-w-0` through the chain so both regions can shrink and
   scroll internally.
2. Choose the dock edge from the surrounding geometry. If the surface already owns a right-side
   details rail, use a full-width bottom dock so both secondary contexts can remain visible without
   compressing the primary content into a narrow strip.
3. Bound the dock with a viewport-aware `clamp()` height. Keep the dock header fixed and give the
   workflow body its own overflow owner; never let a composer or action footer scroll out of reach.
4. Keep the launcher mounted and expose state with `aria-controls` + `aria-expanded`. A mounted but
   closed keep-alive panel must be `hidden` or paired with `aria-hidden` + `inert` so its controls do
   not remain tabbable (P13).
5. On phone widths, allow only one bottom disclosure to consume vertical space at a time. Opening the
   working dock should collapse competing metadata/comments panels while keeping their launchers
   available.
6. Use one restrained entry transition and remove it under reduced motion (P11). The dock is a
   structural state change, not a signature effect.

Use a strong border/seam rather than overlay shadow to communicate the split. The outer shell keeps
the modal's Frame texture; the dock may use a Strip header and a plain readable body so one surface
does not stack competing textures.

### P25 · Keep entity editor headers identity-only

**Finding:** sibling entity editors repeat state, priority, impact, and date metadata in their modal
headers even though the form or details rail already owns those controls. The duplicated metadata
makes some members of the family two or three rows taller and causes the header geometry to drift.

Use one shared identity shell for routine entity editors:

1. Reserve the header for the entity icon, a single overflow-safe title, and modal-wide actions such
   as chat, open-external, and close.
2. Keep lifecycle state, priority, dates, impact, sync state, and similar record metadata in the
   primary form or details surface where it can be understood and changed.
3. Let purpose-built workspaces retain extra header context only when it directly supports the
   primary task. BuildOS documents keep their breadcrumb, save state, and document actions because
   the editor is the workspace; this is an explicit exception, not the default entity pattern.
4. Centralize padding, icon geometry, title type, truncation, and the action seam in one component.
   Keep action content extensible through a snippet instead of adding metadata props to the shell.
5. The identity shell itself is static and introduces no motion. Any action feedback must retain the
   shared reduced-motion behavior (P11), accessible names, and focus treatment (P13).

Pair this with P1 shrink safety, P4 metadata demotion, P6 decluttering, and P9 fixed icon geometry.

---

## Using this doc in an audit

In audit findings, cite patterns as `→ P1`, `→ P6+P1`, etc. If a fix doesn't match any pattern and
you invent a new one that a second surface will plausibly need, add it here — next number, same
When/Recipe shape, filed under the section it thematically belongs to (add a new section if none
fits) — and link it from the audit. That's how this doc grows.
