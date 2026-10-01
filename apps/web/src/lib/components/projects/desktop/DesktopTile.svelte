<!-- apps/web/src/lib/components/projects/desktop/DesktopTile.svelte -->
<!--
	A project drawn as a printed tile. Its color is its pulse (moving, being
	shaped, gone quiet, parked: see desktop-signals.ts). At full size it also
	carries two bars, D for documents and T for open tasks split into overdue,
	in progress, scheduled and backlog, plus a red count when tasks are overdue.
	A project that holds others gets a folder tab. Generated project icons are
	switched off app-wide (ProjectIcon), so the two letters are the identity.
	Decorative: the caller labels the control.
-->
<script lang="ts">
	import './desktop-colors.css';
	import type { ProjectListSummary } from '../project-list';
	import { monogram } from './desktop-model';
	import { getDesktopLook } from './desktop-context';
	import { TASK_BUCKETS, type TileLook } from './desktop-signals';

	type Size = 'lg' | 'md' | 'sm' | 'xs';
	const PX: Record<Size, number> = { lg: 62, md: 48, sm: 36, xs: 28 };

	let {
		project,
		inside = [],
		size = 'lg',
		look: given
	}: {
		project: ProjectListSummary;
		/** Sub-projects; any gives the tile a folder tab. */
		inside?: readonly ProjectListSummary[];
		size?: Size;
		/** Defaults to the look ProjectDesktop computed for this project. */
		look?: TileLook;
	} = $props();

	const lookUp = getDesktopLook();
	const look = $derived(given ?? lookUp(project.id));
	const folder = $derived(inside.length > 0);
	const full = $derived(size === 'lg' && Boolean(look));
	const overdue = $derived(full ? (look?.mix.overdue ?? 0) : 0);
</script>

<span
	class="tile pulse-{look?.pulse ?? 'none'} font-mono"
	class:folder
	class:full
	style:--size="{PX[size]}px"
	aria-hidden="true"
>
	<span class="mono">{monogram(project.name)}</span>
	{#if full && look}
		<span class="meters">
			<span class="meter">
				<em>D</em>
				<span class="track">
					<span class="fill" style:width="{look.docs * 100}%">
						<span class="seg docs" style:width="100%"></span>
					</span>
				</span>
			</span>
			<span class="meter">
				<em>T</em>
				<span class="track">
					<span class="fill" style:width="{look.tasks * 100}%">
						{#each TASK_BUCKETS as bucket (bucket)}
							{#if look.mix[bucket] > 0}
								<span
									class="seg {bucket}"
									style:width="{(look.mix[bucket] / look.open) * 100}%"
								></span>
							{/if}
						{/each}
					</span>
				</span>
			</span>
		</span>
	{/if}
	{#if overdue > 0}<span class="badge">{overdue > 99 ? '99+' : overdue}</span>{/if}
</span>

<style>
	.tile {
		--c: var(--border-strong);
		--tint: 0.16;
		position: relative;
		flex: none;
		display: grid;
		place-items: center;
		width: var(--size);
		height: var(--size);
		border-radius: calc(var(--size) * 0.22);
		color: color-mix(in oklab, hsl(var(--c)) 80%, hsl(var(--foreground)));
		background-color: hsl(var(--card));
		/* A tint of the pulse color with a faint halftone, like ink pressed into paper. */
		background-image:
			radial-gradient(hsl(var(--c) / 0.16) 0.7px, transparent 0.9px),
			linear-gradient(hsl(var(--c) / var(--tint)), hsl(var(--c) / var(--tint)));
		background-size:
			4px 4px,
			auto;
		border: 1px solid hsl(var(--c) / 0.5);
		box-shadow:
			inset 0 1px 0 hsl(0 0% 100% / 0.5),
			var(--shadow-ink);
		font-size: calc(var(--size) * 0.34);
		font-weight: 600;
		line-height: 1;
		letter-spacing: -0.03em;
		transition:
			transform 140ms ease,
			background-color 200ms ease,
			border-color 200ms ease;
	}
	.pulse-moving {
		--c: var(--desk-moving);
	}
	.pulse-shaping {
		--c: var(--desk-shaping);
	}
	.pulse-quiet {
		--c: var(--desk-quiet);
	}
	.pulse-parked {
		--c: var(--desk-parked);
		--tint: 0.07;
		color: hsl(var(--muted-foreground));
	}
	.pulse-none {
		--tint: 0.05;
		color: hsl(var(--muted-foreground));
	}
	.full {
		grid-template-rows: minmax(0, 1fr) auto;
		place-items: stretch;
		padding: calc(var(--size) * 0.1) calc(var(--size) * 0.11) calc(var(--size) * 0.12);
		font-size: calc(var(--size) * 0.25);
	}
	.mono {
		display: grid;
		place-items: center;
	}
	.meters {
		display: grid;
		gap: calc(var(--size) * 0.045);
	}
	.meter {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: calc(var(--size) * 0.05);
	}
	.meter em {
		width: 0.75em;
		font-style: normal;
		font-size: max(7.5px, calc(var(--size) * 0.12));
		font-weight: 600;
		line-height: 1;
		text-align: center;
		color: hsl(var(--muted-foreground));
	}
	.track {
		display: block;
		height: max(4px, calc(var(--size) * 0.07));
		border-radius: 99px;
		background: hsl(var(--foreground) / 0.1);
		overflow: hidden;
	}
	.fill {
		display: flex;
		height: 100%;
		border-radius: 99px;
		overflow: hidden;
	}
	.seg {
		display: block;
		height: 100%;
	}
	.seg.docs {
		background: hsl(var(--desk-docs) / 0.75);
	}
	.seg.overdue {
		background: hsl(var(--desk-overdue));
	}
	.seg.in_progress {
		background: hsl(var(--desk-in-progress));
	}
	.seg.scheduled {
		background: hsl(var(--desk-scheduled));
	}
	.seg.backlog {
		background: hsl(var(--desk-backlog));
	}
	.badge {
		position: absolute;
		left: -6px;
		top: -7px;
		min-width: 18px;
		height: 17px;
		padding: 0 4px;
		border-radius: 9px;
		border: 2px solid hsl(var(--background));
		background: hsl(var(--desk-overdue));
		color: hsl(0 0% 100%);
		font-size: 10px;
		font-weight: 600;
		line-height: 13px;
		letter-spacing: 0;
		text-align: center;
	}
	.folder::before {
		content: '';
		position: absolute;
		left: 10%;
		top: calc(var(--size) * -0.11);
		width: 40%;
		height: calc(var(--size) * 0.12);
		border: 1px solid hsl(var(--c) / 0.5);
		border-bottom: 0;
		border-radius: 5px 5px 0 0;
		background: hsl(var(--card));
		background-image: linear-gradient(hsl(var(--c) / 0.22), hsl(var(--c) / 0.22));
	}
	:global(.dark) .tile {
		box-shadow:
			inset 0 1px 0 hsl(0 0% 100% / 0.06),
			var(--shadow-ink);
	}
	@media (prefers-reduced-motion: reduce) {
		.tile {
			transition: none;
		}
	}
</style>
