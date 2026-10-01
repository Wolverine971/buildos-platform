<!-- apps/web/src/lib/components/projects/desktop/DesktopTile.svelte -->
<!--
	A project drawn as a printed tile: two letters inked by its type family, or,
	for a project that holds others, a folder showing the projects inside.
	Generated project icons are switched off app-wide (ProjectIcon), so the
	monogram is the identity. Decorative: the caller labels the control.
-->
<script lang="ts">
	import { normalizeProjectState } from '$lib/config/project-states';
	import type { ProjectListSummary } from '../project-list';
	import { inkIndex, monogram } from './desktop-model';

	type Size = 'lg' | 'md' | 'sm' | 'xs';
	const PX: Record<Size, number> = { lg: 56, md: 48, sm: 36, xs: 28 };

	let {
		project,
		inside = [],
		size = 'lg',
		dot = true
	}: {
		project: ProjectListSummary;
		/** Sub-projects; any makes this a folder. */
		inside?: readonly ProjectListSummary[];
		size?: Size;
		dot?: boolean;
	} = $props();

	const folder = $derived(inside.length > 0);
	const state = $derived(normalizeProjectState(project.state_key));
</script>

<span
	class="tile ink-{inkIndex(project.type_key)} font-mono"
	class:folder
	style:--size="{PX[size]}px"
	aria-hidden="true"
>
	{#if folder}
		<span class="minis">
			{#each inside.slice(0, 4) as child (child.id)}
				<span class="mini ink-{inkIndex(child.type_key)}">{monogram(child.name)}</span>
			{/each}
		</span>
	{:else}
		{monogram(project.name)}
	{/if}
	{#if dot}<span class="dot state-{state}"></span>{/if}
</span>

<style>
	.tile {
		--ink: hsl(222 30% 40%);
		position: relative;
		flex: none;
		display: grid;
		place-items: center;
		width: var(--size);
		height: var(--size);
		border-radius: calc(var(--size) * 0.22);
		color: var(--ink);
		background-color: color-mix(in srgb, var(--ink) 12%, hsl(var(--card)));
		/* Halftone, like ink pressed into paper. */
		background-image: radial-gradient(
			color-mix(in srgb, var(--ink) 22%, transparent) 0.7px,
			transparent 0.9px
		);
		background-size: 4px 4px;
		border: 1px solid color-mix(in srgb, var(--ink) 40%, hsl(var(--border)));
		box-shadow:
			inset 0 1px 0 hsl(0 0% 100% / 0.5),
			var(--shadow-ink);
		font-size: calc(var(--size) * 0.34);
		font-weight: 600;
		line-height: 1;
		letter-spacing: -0.03em;
		transition: transform 140ms ease;
	}
	.folder {
		width: calc(var(--size) * 1.14);
		height: calc(var(--size) * 0.9);
		margin-top: calc(var(--size) * 0.1);
		border-radius: 4px calc(var(--size) * 0.18) calc(var(--size) * 0.18)
			calc(var(--size) * 0.18);
		background-image: none;
	}
	.folder::before {
		content: '';
		position: absolute;
		left: -1px;
		top: calc(var(--size) * -0.13);
		width: 46%;
		height: calc(var(--size) * 0.15);
		border: 1px solid color-mix(in srgb, var(--ink) 40%, hsl(var(--border)));
		border-bottom: 0;
		border-radius: 5px 5px 0 0;
		background: color-mix(in srgb, var(--ink) 18%, hsl(var(--card)));
	}
	.minis {
		display: grid;
		grid-template-columns: repeat(2, auto);
		gap: 3px;
	}
	.mini {
		display: grid;
		place-items: center;
		width: calc(var(--size) * 0.3);
		height: calc(var(--size) * 0.3);
		border-radius: 4px;
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 16%, hsl(var(--card)));
		border: 1px solid color-mix(in srgb, var(--ink) 45%, hsl(var(--border)));
		font-size: max(7px, calc(var(--size) * 0.12));
	}
	.dot {
		position: absolute;
		right: -3px;
		bottom: -3px;
		width: 11px;
		height: 11px;
		border-radius: 999px;
		border: 2px solid hsl(var(--background));
		background: hsl(var(--muted-foreground));
	}
	.state-active {
		background: hsl(var(--success));
	}
	.state-planning {
		background: hsl(var(--info));
	}
	.state-paused {
		background: hsl(var(--warning));
	}
	.state-completed,
	.state-cancelled {
		background: hsl(var(--border-strong));
	}
	.ink-1 {
		--ink: hsl(24 75% 40%);
	}
	.ink-2 {
		--ink: hsl(200 60% 37%);
	}
	.ink-3 {
		--ink: hsl(150 50% 31%);
	}
	.ink-4 {
		--ink: hsl(40 80% 33%);
	}
	.ink-5 {
		--ink: hsl(310 30% 40%);
	}
	.ink-6 {
		--ink: hsl(222 30% 40%);
	}
	:global(.dark) .tile {
		box-shadow:
			inset 0 1px 0 hsl(0 0% 100% / 0.06),
			var(--shadow-ink);
	}
	:global(.dark) .ink-1 {
		--ink: hsl(24 85% 63%);
	}
	:global(.dark) .ink-2 {
		--ink: hsl(200 60% 64%);
	}
	:global(.dark) .ink-3 {
		--ink: hsl(150 45% 56%);
	}
	:global(.dark) .ink-4 {
		--ink: hsl(45 85% 60%);
	}
	:global(.dark) .ink-5 {
		--ink: hsl(310 35% 70%);
	}
	:global(.dark) .ink-6 {
		--ink: hsl(222 40% 72%);
	}
	@media (prefers-reduced-motion: reduce) {
		.tile {
			transition: none;
		}
	}
</style>
