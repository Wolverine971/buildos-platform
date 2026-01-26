<!-- redesign-2.md -->
<!-- redesign-2.md

## 0) What I’m keeping from your current Tailwind setup

Your current config already uses **CSS-variable colors** via `withOpacity(...)` and `darkMode: 'class'` — that’s perfect for theming, so the solution below builds on that.

---

## 1) Theme + textures (global CSS) — `apps/web/src/app.css`

Create/replace your global stylesheet with this. It defines:

- **Light + dark tokens** (`--background`, `--foreground`, `--card`, etc.)
- **Texture utilities**: `tx tx-bloom`, `tx tx-grain`, `tx tx-pulse`, `tx tx-static`, `tx tx-thread`, `tx tx-frame`, `tx tx-strip`
- **A carved inner border**: `ink-frame`
- **Base component primitives**: `.ui-input`, `.ui-textarea`, etc.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
	:root {
		color-scheme: light;

		/* Core surfaces (paper + ink) */
		--background: 48 38% 97%;
		--foreground: 222 22% 12%;

		--card: 48 28% 99%;
		--card-foreground: 222 22% 12%;

		--muted: 48 18% 92%;
		--muted-foreground: 222 12% 38%;

		--border: 222 14% 82%;
		--input: 222 14% 82%;
		--ring: 152 84% 42%;

		/* Brand + semantics */
		--accent: 152 84% 42%;
		--accent-foreground: 0 0% 100%;

		--success: 152 84% 42%;
		--warning: 38 92% 50%;
		--danger: 350 84% 52%;
		--info: 222 84% 62%;

		/* Keep your older surface vars working (if used elsewhere) */
		--surface-scratch: hsl(var(--background));
		--surface-panel: hsl(var(--card));
		--surface-elevated: hsl(var(--card));
		--surface-clarity: hsl(var(--muted));

		/* Texture ink flips automatically in dark mode */
		--tx-ink: 222 22% 12%;
		--tx-blend: multiply;

		/* Motion tokens */
		--dur-fast: 120ms;
		--dur: 180ms;
		--dur-slow: 260ms;
		--ease-ink: cubic-bezier(0.2, 0.8, 0.2, 1);
		--ease-snap: cubic-bezier(0.2, 1, 0.2, 1);
	}

	.dark {
		color-scheme: dark;

		--background: 222 22% 6%;
		--foreground: 0 0% 98%;

		--card: 222 22% 8%;
		--card-foreground: 0 0% 98%;

		--muted: 222 16% 14%;
		--muted-foreground: 0 0% 72%;

		--border: 222 14% 22%;
		--input: 222 14% 22%;
		--ring: 152 84% 50%;

		--accent: 152 84% 50%;
		--accent-foreground: 222 22% 6%;

		--success: 152 84% 50%;
		--warning: 38 92% 58%;
		--danger: 350 88% 62%;
		--info: 222 84% 70%;

		--surface-scratch: hsl(var(--background));
		--surface-panel: hsl(var(--card));
		--surface-elevated: hsl(var(--card));
		--surface-clarity: hsl(var(--muted));

		--tx-ink: 0 0% 98%;
		--tx-blend: screen;
	}

	* {
		border-color: hsl(var(--border) / 1);
	}

	html {
		background: hsl(var(--background));
		color: hsl(var(--foreground));
	}

	body {
		font-family:
			Inter,
			system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			'Helvetica Neue',
			Arial,
			'Noto Sans',
			'Apple Color Emoji',
			'Segoe UI Emoji';
		text-rendering: geometricPrecision;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
	}

	::selection {
		background: hsl(var(--accent) / 0.25);
	}

	:focus-visible {
		outline: none;
	}
}

@layer components {
	/* Inputs */
	.ui-input {
		@apply w-full rounded-2xl border bg-background px-3 py-2 text-sm text-foreground shadow-ink-inner transition;
		@apply placeholder:text-muted-foreground;
		@apply focus:border-ring/70 focus:ring-2 focus:ring-ring/30;
	}

	.ui-textarea {
		@apply w-full rounded-2xl border bg-background px-3 py-2 text-sm text-foreground shadow-ink-inner transition;
		@apply placeholder:text-muted-foreground;
		@apply focus:border-ring/70 focus:ring-2 focus:ring-ring/30;
	}

	.ui-label {
		@apply text-xs font-medium text-muted-foreground tracking-wide;
	}

	.ui-help {
		@apply text-xs text-muted-foreground;
	}

	.ui-divider {
		@apply h-px w-full bg-border/70;
	}
}

@layer utilities {
	/* --- Texture system --------------------------------------------------- */
	.tx {
		position: relative;
		overflow: hidden;
	}
	.tx::before {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		opacity: var(--tx-opacity, 0.14);
		mix-blend-mode: var(--tx-blend);
		background-image: var(--tx-img);
		background-size: var(--tx-size, auto);
		background-repeat: var(--tx-repeat, repeat);
		background-position: var(--tx-pos, 0 0);
	}

	.tx-weak {
		--tx-opacity: 0.1;
	}
	.tx-med {
		--tx-opacity: 0.16;
	}
	.tx-strong {
		--tx-opacity: 0.22;
	}

	/* Dot matrix helper (used in multiple patterns) */
	.tx-bloom {
		--tx-img:
			radial-gradient(circle at 30% 20%, hsl(var(--tx-ink) / 0.18), transparent 60%),
			radial-gradient(circle, hsl(var(--tx-ink) / 0.22) 1px, transparent 1.2px);
		--tx-size: auto, 8px 8px;
		--tx-repeat: no-repeat, repeat;
	}

	.tx-grain {
		--tx-img:
			repeating-linear-gradient(
				115deg,
				hsl(var(--tx-ink) / 0.18) 0px,
				hsl(var(--tx-ink) / 0.18) 1px,
				transparent 1px,
				transparent 6px
			),
			radial-gradient(circle, hsl(var(--tx-ink) / 0.14) 1px, transparent 1.2px);
		--tx-size: auto, 10px 10px;
		--tx-repeat: repeat, repeat;
	}

	.tx-pulse {
		--tx-img:
			radial-gradient(circle at 50% 0%, hsl(var(--tx-ink) / 0.18), transparent 60%),
			repeating-radial-gradient(
				circle at 50% 0%,
				hsl(var(--tx-ink) / 0.22) 0px,
				hsl(var(--tx-ink) / 0.22) 1px,
				transparent 1px,
				transparent 7px
			);
		--tx-repeat: no-repeat, repeat;
	}

	.tx-static {
		--tx-img:
			radial-gradient(circle, hsl(var(--tx-ink) / 0.22) 1px, transparent 1.2px),
			radial-gradient(circle, hsl(var(--tx-ink) / 0.16) 1px, transparent 1.2px);
		--tx-size: 6px 6px, 11px 11px;
		--tx-pos: 0 0, 4px 7px;
		--tx-repeat: repeat, repeat;
	}

	.tx-thread {
		--tx-img:
			repeating-linear-gradient(
				45deg,
				hsl(var(--tx-ink) / 0.16) 0px,
				hsl(var(--tx-ink) / 0.16) 1px,
				transparent 1px,
				transparent 6px
			),
			repeating-linear-gradient(
				-45deg,
				hsl(var(--tx-ink) / 0.12) 0px,
				hsl(var(--tx-ink) / 0.12) 1px,
				transparent 1px,
				transparent 7px
			);
		--tx-repeat: repeat, repeat;
	}

	.tx-frame {
		--tx-img:
			repeating-linear-gradient(
				90deg,
				hsl(var(--tx-ink) / 0.14) 0px,
				hsl(var(--tx-ink) / 0.14) 1px,
				transparent 1px,
				transparent 5px
			),
			repeating-linear-gradient(
				0deg,
				hsl(var(--tx-ink) / 0.1) 0px,
				hsl(var(--tx-ink) / 0.1) 1px,
				transparent 1px,
				transparent 6px
			);
		--tx-repeat: repeat, repeat;
	}

	.tx-strip {
		--tx-img:
			repeating-linear-gradient(
				135deg,
				hsl(var(--tx-ink) / 0.22) 0px,
				hsl(var(--tx-ink) / 0.22) 2px,
				transparent 2px,
				transparent 6px
			),
			radial-gradient(circle, hsl(var(--tx-ink) / 0.18) 1px, transparent 1.2px);
		--tx-size: 12px 12px, 10px 10px;
		--tx-repeat: repeat, repeat;
	}

	/* Carved inner border (linocut “frame”) */
	.ink-frame {
		position: relative;
	}
	.ink-frame::after {
		content: '';
		position: absolute;
		inset: 10px;
		pointer-events: none;
		border-radius: inherit;
		border: 2px solid hsl(var(--tx-ink) / 0.26);
		mix-blend-mode: var(--tx-blend);
		opacity: 0.9;
	}

	/* Motion helpers */
	.motion-ink {
		transition-timing-function: var(--ease-ink);
		transition-duration: var(--dur);
	}
	.pressable {
		transition:
			transform var(--dur-fast) var(--ease-ink),
			box-shadow var(--dur-fast) var(--ease-ink),
			opacity var(--dur-fast) var(--ease-ink);
		transform: translateY(0);
	}
	.pressable:active {
		transform: translateY(1px);
	}

	@media (prefers-reduced-motion: reduce) {
		* {
			animation-duration: 1ms !important;
			transition-duration: 1ms !important;
		}
	}
}
```

---

## 2) Tailwind config (BuildOS version) — `apps/web/tailwind.config.js`

This replaces your current config while **keeping** the same “CSS vars + `darkMode: 'class'`” approach you already use .

```js
// apps/web/tailwind.config.js
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';

/** Helper: lets Tailwind's opacity API work with CSS variables */
const withOpacity = (varName) => {
	return ({ opacityValue }) =>
		opacityValue === undefined
			? `hsl(var(${varName}))`
			: `hsl(var(${varName}) / ${opacityValue})`;
};

export default {
	darkMode: 'class',
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			screens: { xs: '480px' },

			colors: {
				background: withOpacity('--background'),
				foreground: withOpacity('--foreground'),
				border: withOpacity('--border'),
				input: withOpacity('--input'),
				ring: withOpacity('--ring'),

				card: withOpacity('--card'),
				'card-foreground': withOpacity('--card-foreground'),

				muted: withOpacity('--muted'),
				'muted-foreground': withOpacity('--muted-foreground'),

				accent: withOpacity('--accent'),
				'accent-foreground': withOpacity('--accent-foreground'),

				success: withOpacity('--success'),
				warning: withOpacity('--warning'),
				danger: withOpacity('--danger'),
				info: withOpacity('--info')
			},

			boxShadow: {
				ink: '0 1px 0 hsl(var(--tx-ink) / 0.15), 0 16px 40px hsl(0 0% 0% / 0.10)',
				'ink-strong': '0 1px 0 hsl(var(--tx-ink) / 0.22), 0 22px 70px hsl(0 0% 0% / 0.18)',
				'ink-inner': 'inset 0 1px 0 hsl(var(--tx-ink) / 0.12)'
			},

			fontFamily: {
				ui: ['Inter', 'Söhne', 'GT America', 'system-ui', '-apple-system', 'sans-serif'],
				notes: ['IBM Plex Serif', 'Literata', 'serif']
			},

			keyframes: {
				'ink-in': {
					'0%': { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
					'100%': { opacity: '1', transform: 'translateY(0) scale(1)' }
				},
				'ink-out': {
					'0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
					'100%': { opacity: '0', transform: 'translateY(8px) scale(0.98)' }
				},
				shimmer: {
					'0%': { backgroundPosition: '-1000px 0' },
					'100%': { backgroundPosition: '1000px 0' }
				}
			},

			animation: {
				'ink-in': 'ink-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
				'ink-out': 'ink-out 160ms cubic-bezier(0.2, 0.8, 0.2, 1)',
				shimmer: 'shimmer 2s linear infinite'
			},

			transitionTimingFunction: {
				ink: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
				snap: 'cubic-bezier(0.2, 1, 0.2, 1)'
			}
		}
	},
	plugins: [forms, typography]
};
```

---

## 3) Light-mode example (and dark mode) — how to preview

With the setup above:

- **Light mode** is the default (`<html>` has no `dark` class).
- **Dark mode** is when you add `class="dark"` on `<html>`.

Optional: drop this into `src/routes/+layout.svelte` to auto-apply system theme + persist user preference.

```svelte
<script>
	import '../app.css';
	import { onMount } from 'svelte';

	onMount(() => {
		const stored = localStorage.getItem('theme');
		const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const dark = stored ? stored === 'dark' : systemDark;
		document.documentElement.classList.toggle('dark', dark);
	});
</script>

<slot />
```

---

## 4) Landing page (same component works in light + dark) — `src/routes/+page.svelte`

This is your earlier landing page refit to tokens + textures. **It automatically looks “light mode” in light** (paper), and “dark mode” in dark (ink).

```svelte
<script lang="ts">
	const steps = [
		{
			label: '01 • Capture',
			title: 'Dump everything in your head.',
			texture: 'tx-bloom',
			body: 'Talk, type, or paste chaos. BuildOS ingests notes and half-baked ideas into a single project brain.'
		},
		{
			label: '02 • Shape',
			title: 'Carve structure out of noise.',
			texture: 'tx-grain',
			body: 'Agents split your dump into goals, tasks, plans, risks — using project ontologies instead of rigid templates.'
		},
		{
			label: '03 • Drive',
			title: 'Stay in flow. The OS remembers.',
			texture: 'tx-pulse',
			body: 'BuildOS surfaces next moves, tracks dependencies, and keeps long-term context warm.'
		}
	];
</script>

<div class="min-h-screen bg-background text-foreground">
	<!-- top strip -->

    <div class="h-10 border-b border-border tx tx-strip tx-med"></div>

    <!-- nav -->
    <header class="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
    	<div class="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
    		<div class="flex items-center gap-3">
    			<div
    				class="h-9 w-9 rounded-2xl border border-border bg-card shadow-ink tx tx-frame tx-weak ink-frame"
    			></div>
    			<div>
    				<div class="text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">
    					BuildOS
    				</div>
    				<div class="text-xs text-muted-foreground">
    					AI-first project operating system
    				</div>
    			</div>
    		</div>

    		<div class="hidden md:flex items-center gap-6 text-xs text-muted-foreground">
    			<a class="hover:text-foreground transition" href="#how">How it works</a>
    			<a class="hover:text-foreground transition" href="#stack">Under the hood</a>
    		</div>

    		<div class="flex items-center gap-3">
    			<button
    				class="pressable rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-ink hover:opacity-95"
    			>
    				View demo
    			</button>
    			<button
    				class="pressable rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground shadow-ink"
    			>
    				Get early access
    			</button>
    		</div>
    	</div>
    </header>

    <!-- hero -->
    <section class="border-b border-border">
    	<div class="mx-auto max-w-6xl px-4 py-14 grid md:grid-cols-2 gap-10 items-center">
    		<div class="space-y-6">
    			<div
    				class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 tx tx-static tx-weak"
    			>
    				<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
    				<span class="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
    					>Built for chaotic brains</span
    				>
    			</div>

    			<h1 class="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight">
    				Turn scattered ideas into a <span class="relative">
    					living project brain
    					<span
    						class="absolute inset-x-0 bottom-1 -z-10 h-[0.65em] tx tx-bloom tx-med rounded"
    					></span>
    				</span>
    			</h1>

    			<p class="text-sm sm:text-base text-muted-foreground max-w-xl">
    				BuildOS listens to brain dumps, carves structure out of noise, and keeps context
    				warm — so you can stay in flow.
    			</p>

    			<div class="flex flex-wrap gap-3 items-center">
    				<button
    					class="pressable rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-ink"
    				>
    					Join the founder beta
    				</button>
    				<a
    					class="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
    					href="#how"
    				>
    					See how it works →
    				</a>
    			</div>
    		</div>

    		<div
    			class="rounded-3xl border border-border bg-card shadow-ink-strong tx tx-frame tx-weak ink-frame overflow-hidden"
    		>
    			<div
    				class="h-10 border-b border-border tx tx-strip tx-med flex items-center px-4 text-[0.68rem] uppercase tracking-[0.2em] text-muted-foreground"
    			>
    				Project: Raise Seed & Ship v1
    			</div>
    			<div class="p-5 space-y-4">
    				<div class="grid sm:grid-cols-2 gap-4">
    					<div
    						class="rounded-2xl border border-border bg-background tx tx-static tx-weak p-3"
    					>
    						<div
    							class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground mb-2"
    						>
    							Raw brain dump
    						</div>
    						<p class="text-[0.8rem] text-muted-foreground leading-relaxed">
    							“Schedule investor calls, fix landing copy, ship onboarding. Also
    							want a content plan tied to signups…”
    						</p>
    					</div>
    					<div
    						class="rounded-2xl border border-border bg-background tx tx-grain tx-weak p-3"
    					>
    						<div
    							class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground mb-2"
    						>
    							Structured by BuildOS
    						</div>
    						<ul class="text-[0.8rem] leading-relaxed">
    							<li>▸ Goal: Close 3–5 angel checks</li>
    							<li>▸ Tasks: Investor pipeline</li>
    							<li>▸ Sprint: Landing page clarity</li>
    							<li>▸ Plan: Weekly content engine</li>
    						</ul>
    					</div>
    				</div>

    				<div
    					class="rounded-2xl border border-border bg-background tx tx-thread tx-weak p-3 flex items-center justify-between gap-3"
    				>
    					<p class="text-[0.85rem]">
    						<span class="text-muted-foreground">Next move:</span> Follow up with the
    						4 investors who opened your deck twice.
    					</p>
    					<button
    						class="pressable rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-ink"
    					>
    						Do this now
    					</button>
    				</div>
    			</div>
    		</div>
    	</div>
    </section>

    <!-- how -->
    <section id="how" class="border-b border-border">
    	<div class="mx-auto max-w-6xl px-4 py-14 space-y-8">
    		<div>
    			<h2 class="text-2xl sm:text-3xl font-semibold tracking-tight">
    				From noise → ontology → action.
    			</h2>
    			<p class="mt-2 text-sm text-muted-foreground max-w-xl">
    				BuildOS builds a project ontology around you — goals, tasks, plans, risks,
    				relationships — so the AI understands what you’re building.
    			</p>
    		</div>

    		<div class="grid md:grid-cols-3 gap-5">
    			{#each steps as s}
    				<article
    					class={`rounded-3xl border border-border bg-card shadow-ink tx ${s.texture} tx-weak ink-frame p-5`}
    				>
    					<div
    						class="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground"
    					>
    						{s.label}
    					</div>
    					<h3 class="mt-2 text-sm font-semibold">{s.title}</h3>
    					<p class="mt-2 text-[0.85rem] text-muted-foreground leading-relaxed">
    						{s.body}
    					</p>
    				</article>
    			{/each}
    		</div>
    	</div>
    </section>

    <footer class="py-10">
    	<div
    		class="mx-auto max-w-6xl px-4 text-xs text-muted-foreground flex items-center justify-between"
    	>
    		<span>BuildOS • Inkprint design system</span>
    		<span class="tx tx-strip tx-weak px-2 py-1 rounded-full border border-border bg-card"
    			>v0</span
    		>
    	</div>
    </footer>

</div>
```

---

## 5) Core component rewrites (paste these over your existing ones)

### `src/lib/utils/cn.ts`

```ts
export function cn(...values: Array<string | false | null | undefined>) {
	return values.filter(Boolean).join(' ');
}
```

### `components/ui/Button.svelte`

```svelte
<script lang="ts">
	import { cn } from '$lib/utils/cn';

	export let variant: 'solid' | 'outline' | 'ghost' | 'ink' | 'link' = 'solid';
	export let size: 'sm' | 'md' | 'lg' | 'icon' = 'md';
	export let href: string | undefined = undefined;
	export let type: 'button' | 'submit' | 'reset' = 'button';
	export let loading = false;
	export let disabled = false;
	export let texture: 'none' | 'bloom' | 'grain' | 'pulse' | 'static' | 'thread' | 'frame' =
		'none';
	export let className: string = '';

	const base =
		'pressable inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium ' +
		'focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
		'disabled:opacity-60 disabled:pointer-events-none';

	const variants = {
		solid: 'bg-accent text-accent-foreground shadow-ink hover:opacity-95',
		outline: 'bg-card text-foreground border border-border shadow-ink hover:bg-muted/50',
		ghost: 'bg-transparent text-foreground hover:bg-muted/60',
		ink: 'bg-foreground text-background shadow-ink hover:opacity-95',
		link: 'bg-transparent text-foreground underline underline-offset-4 hover:text-accent'
	} as const;

	const sizes = {
		sm: 'h-8 px-3 text-xs',
		md: 'h-10 px-4 text-sm',
		lg: 'h-12 px-6 text-base',
		icon: 'h-10 w-10 p-0'
	} as const;

	$: tex = texture === 'none' ? '' : `tx tx-${texture} tx-weak`;
	$: classes = cn(base, variants[variant], sizes[size], tex, className);
	$: isDisabled = disabled || loading;
</script>

<svelte:element
	this={href ? 'a' : 'button'}
	class={classes}
	{href}
	type={href ? undefined : type}
	aria-disabled={isDisabled}
	disabled={href ? undefined : isDisabled}
	{...$$restProps}
>
	{#if loading}
		<span
			class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
		/>
	{/if}
	<slot />
</svelte:element>
```

### `components/ui/Card.svelte`

```svelte
<script lang="ts">
  import { cn } from '$lib/utils/cn';

  export let texture: 'none' | 'bloom' | 'grain' | 'pulse' | 'static' | 'thread' | 'frame' = 'none';
  export let class: string = '';
</script>

<div
  class={cn(
    'rounded-3xl border border-border bg-card text-card-foreground shadow-ink',
    'tx',
    texture === 'none' ? '' : `tx-${texture} tx-weak`,
    'ink-frame',
    class
  )}
>
  <slot />
</div>
```

### `components/ui/CardHeader.svelte`

```svelte
<script lang="ts">
  import { cn } from '$lib/utils/cn';
  export let class: string = '';
  export let divider = false;
</script>

<div class={cn('px-5 pt-5 pb-3', divider ? 'border-b border-border' : '', class)}>
  <slot />
</div>
```

### `components/ui/CardBody.svelte`

```svelte
<script lang="ts">
  import { cn } from '$lib/utils/cn';
  export let class: string = '';
</script>

<div class={cn('px-5 py-4', class)}>
  <slot />
</div>
```

### `components/ui/CardFooter.svelte`

```svelte
<script lang="ts">
  import { cn } from '$lib/utils/cn';
  export let class: string = '';
  export let divider = true;
</script>

<div class={cn('px-5 pb-5 pt-3 flex items-center justify-end gap-2', divider ? 'border-t border-border' : '', class)}>
  <slot />
</div>
```

### `components/ui/Modal.svelte`

This is a clean base modal that your other modals should wrap.

```svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { cn } from '$lib/utils/cn';

  export let open = false;
  export let title: string | undefined = undefined;
  export let description: string | undefined = undefined;
  export let size: 'sm' | 'md' | 'lg' | 'xl' = 'md';
  export let closeOnBackdrop = true;
  export let class: string = '';

  const dispatch = createEventDispatcher<{ close: void }>();

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  } as const;

  function requestClose() {
    dispatch('close');
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') requestClose();
  }
</script>

{#if open}
  <svelte:window on:keydown={onKeydown} />
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- backdrop -->
    <button
      class="absolute inset-0 bg-background/60 backdrop-blur-sm tx tx-static tx-weak"
      aria-label="Close modal"
      on:click={() => closeOnBackdrop && requestClose()}
    />

    <!-- dialog -->
    <div
      role="dialog"
      aria-modal="true"
      class={cn(
        'relative w-full rounded-3xl border border-border bg-card text-card-foreground shadow-ink-strong',
        'tx tx-frame tx-weak ink-frame animate-ink-in',
        sizes[size],
        class
      )}
    >
      <div class="border-b border-border px-5 pt-5 pb-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            {#if title}<h2 class="text-base font-semibold">{title}</h2>{/if}
            {#if description}<p class="mt-1 text-sm text-muted-foreground">{description}</p>{/if}
          </div>
          <button
            class="pressable rounded-full border border-border bg-card px-3 py-1 text-xs shadow-ink"
            on:click={requestClose}
          >
            Close
          </button>
        </div>
      </div>

      <div class="px-5 py-4">
        <slot />
      </div>

      <div class="border-t border-border px-5 pb-5 pt-3 flex justify-end gap-2">
        <slot name="footer" />
      </div>
    </div>
  </div>
{/if}
```

### `components/ui/TextInput.svelte`

```svelte
<script lang="ts">
  import { cn } from '$lib/utils/cn';
  export let value: string = '';
  export let invalid = false;
  export let class: string = '';
</script>

<input
  class={cn('ui-input', invalid ? 'border-danger/60 focus:ring-danger/25' : '', class)}
  bind:value
  {...$$restProps}
/>
```

### `components/ui/Textarea.svelte`

```svelte
<script lang="ts">
  import { cn } from '$lib/utils/cn';
  export let value: string = '';
  export let invalid = false;
  export let class: string = '';
</script>

<textarea
  class={cn('ui-textarea min-h-[120px]', invalid ? 'border-danger/60 focus:ring-danger/25' : '', class)}
  bind:value
  {...$$restProps}
/>
```

### `components/ui/Badge.svelte`

```svelte
<script lang="ts">
  import { cn } from '$lib/utils/cn';

  export let variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent' = 'neutral';
  export let texture: 'none' | 'bloom' | 'grain' | 'pulse' | 'static' | 'thread' | 'frame' = 'none';
  export let class: string = '';

  const v = {
    neutral: 'bg-card text-foreground border-border',
    success: 'bg-success/10 text-success border-success/30',
    warning: 'bg-warning/10 text-warning border-warning/30',
    danger: 'bg-danger/10 text-danger border-danger/30',
    info: 'bg-info/10 text-info border-info/30',
    accent: 'bg-accent/12 text-accent border-accent/30'
  } as const;

  $: tex = texture === 'none' ? '' : `tx tx-${texture} tx-weak`;
</script>

<span
  class={cn(
    'inline-flex items-center rounded-full border px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.18em]',
    v[variant],
    tex,
    class
  )}
>
  <slot />
</span>
```

### `components/ui/Alert.svelte`

```svelte
<script lang="ts">
  import { cn } from '$lib/utils/cn';

  export let variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info' = 'neutral';
  export let class: string = '';

  const v = {
    neutral: 'border-border bg-card',
    success: 'border-success/30 bg-success/10',
    warning: 'border-warning/30 bg-warning/10',
    danger: 'border-danger/30 bg-danger/10',
    info: 'border-info/30 bg-info/10'
  } as const;

  const tex = variant === 'danger' || variant === 'warning' ? 'tx tx-static tx-weak' : 'tx tx-frame tx-weak';
</script>

<div class={cn('rounded-3xl border p-4 shadow-ink ink-frame', 'tx', tex, v[variant], class)}>
  <slot />
</div>
```

---

## 6) What to do with the rest of your `components/ui/*` (practical guidance)

### Rebase these onto `Modal.svelte` (do NOT style each one differently)

- `FormModal`, `InfoModal`, `LoadingModal`, `ChoiceModal`, `ConfirmationModal`, `WelcomeModal`

**Rule:** each becomes a small wrapper that passes `open/title/description` to `Modal` and renders actions in `<slot name="footer">` using `Button`.

### Standardize “surface” components to `Card`

- `Toast`, `ToastContainer` → toast body should be a `Card` with `tx-frame` or `tx-thread`
- `SkeletonLoader`, `LoadingSkeleton`, `SkeletonLoader.svelte` → keep shimmer but make it sit on `bg-card` with `border-border`

### Inputs: always use `.ui-input` / `.ui-textarea`

- `RichMarkdownEditor`, `TextareaWithVoice`, `MarkdownToggleField`, `FormField`
  **Rule:** text fields should _look like paper inputs_: rounded-2xl, subtle inner shadow, crisp border, texture optional only on large panels.

### Navigation & selection

- `TabNav`
    - inactive: `text-muted-foreground`
    - active: `text-foreground` + underline bar using `tx-strip`
    - container: `border-b border-border`

- `Select`, `Radio`, `RadioGroup`
    - controls: match `.ui-input` shape
    - “selected” indicator: use `accent` and a tiny inner ring
    - popover/menu: `Card` + `tx-frame` + `shadow-ink-strong`

### Leave logic-heavy components mostly alone; just wrap them in surfaces

- `DiffView`, `ManyToOneDiffView`, `CurrentTimeIndicator`, `RecentActivityIndicator`, `ProgressiveImage`
  **Rule:** style the _container_ (Card/Panel), not every internal element.

---

## 7) BuildOS Design System Bible (short + usable)

### The metaphor

**Ink + paper.** The UI should feel **printed**, not glassy.

- Borders = carved lines
- Depth = “ink shadow” (subtle)
- Meaning = texture, not gradients

### Tokens (what you should reference in code)

Use these Tailwind classes everywhere:

- Surfaces: `bg-background`, `bg-card`, `bg-muted`
- Text: `text-foreground`, `text-muted-foreground`
- Lines: `border-border`
- Brand: `bg-accent text-accent-foreground`, `ring-ring`

### Texture tokens (semantic)

Use `class="tx tx-… tx-weak"` unless you’re doing a hero.

- `tx-bloom` → ideation, creation, “new”
- `tx-grain` → execution, steady work, “in progress”
- `tx-pulse` → urgency, sprint, time pressure
- `tx-static` → blockers, warnings, chaos
- `tx-thread` → collaboration, dependencies, relationships
- `tx-frame` → canonical, official, “this is the thing”
- `tx-strip` → separators / headers / “print strip”

### Component hierarchy (golden rule)

**Pages are built from:**

- `Card` (surface)
- `CardHeader|Body|Footer` (structure)
- `Button` (actions)
- `TextInput/Textarea` (input primitives)
- `Modal` (overlays)

Everything else composes those.

### Motion system

Motion should feel like **press + ink set**, not bouncy:

- Entrances: `animate-ink-in`
- Exits: `animate-ink-out` (if you wire it)
- Buttons: always `pressable`
- Reduce motion respected via CSS

### Accessibility basics (don’t skip)

- Focus rings always visible (`ring-ring/40` + `ring-offset-background`)
- Don’t use textures stronger than `tx-med` behind body text
- Danger/warning always combine **color + texture** (`tx-static`)

---

If you want, paste your current `Button.svelte` / `Modal.svelte` / `Card.svelte` contents directly into chat next, and I’ll **match props 1:1** so you don’t break any call sites. -->
