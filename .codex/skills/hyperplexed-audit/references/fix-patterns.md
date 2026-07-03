<!-- .codex/skills/hyperplexed-audit/references/fix-patterns.md -->

# Hyperplexed Fix Patterns — BuildOS Recipes

> The fix side of the [Hyperplexed Design Playbook](./HYPERPLEXED_DESIGN_PLAYBOOK.md). The playbook
> tells you what's wrong; this doc tells you the BuildOS-native fix, so each audit links a finding to
> a pattern number instead of re-deriving the recipe. Patterns were extracted from the fixes the
> 2026-06 audit wave actually shipped (project, projects-list, dashboard, history, profile, shell,
> admin, agent-chat-modal) plus the effect recipes in playbook §2.
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

## Using this doc in an audit

In audit findings, cite patterns as `→ P1`, `→ P6+P1`, etc. If a fix doesn't match any pattern and
you invent a new one that a second surface will plausibly need, add it here (next number, same
When/Recipe shape) and link it from the audit — that's how this doc grows.
