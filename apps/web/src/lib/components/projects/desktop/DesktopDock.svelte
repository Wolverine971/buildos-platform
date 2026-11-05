<!-- apps/web/src/lib/components/projects/desktop/DesktopDock.svelte -->
<!--
	Where the rest of the desktop goes while a card is open: a slim column on the
	right (a bottom strip on phones). Every item is a drop target. The Workspace
	comes first: drop a project's doc or task there to make it loose again, or a
	sub-project to take it out to the top level. Folders spring open, after a held
	drag or from the chevron, so things can go straight into a sub-project.
-->
<script lang="ts">
	import { ChevronRight, LayoutGrid } from '$lib/icons/lucide';
	import type { ProjectListSummary } from '../project-list';
	import DesktopTile from './DesktopTile.svelte';
	import { shortName } from './desktop-model';

	let {
		items,
		openId,
		sprung,
		over,
		lifted,
		onOpen,
		onDesktop,
		onToggleSpring
	}: {
		items: readonly { project: ProjectListSummary; inside: readonly ProjectListSummary[] }[];
		openId: string;
		sprung: ReadonlySet<string>;
		over: { key: string; ok: boolean } | null;
		lifted: string | null;
		onOpen: (projectId: string) => void;
		onDesktop: () => void;
		onToggleSpring: (projectId: string) => void;
	} = $props();

	function dropClass(key: string) {
		if (over?.key !== key) return '';
		return over.ok ? 'drop-ok' : 'drop-no';
	}
</script>

<aside class="dock" data-dock data-autoscroll aria-label="Other projects. Drop things here.">
	<span class="dock-label text-xs text-muted-foreground">Drop on</span>
	<button
		type="button"
		class="dock-item slot {dropClass('desktop')}"
		data-drop-kind="desktop"
		title="Workspace: drop a doc or task here to make it loose, or a sub-project to take it out to the top level"
		onclick={onDesktop}
	>
		<span class="slot-tile"><LayoutGrid class="h-4 w-4" /></span>
		<span class="d-label">Workspace</span>
	</button>
	<span class="sep" aria-hidden="true"></span>
	{#each items as { project, inside } (project.id)}
		{@const open = sprung.has(project.id)}
		<div
			class="cell {dropClass(`project:${project.id}`)}"
			class:lifted={lifted === `project:${project.id}`}
			data-drag-kind="project"
			data-drag-id={project.id}
			data-drop-kind="project"
			data-drop-id={project.id}
			data-spring-id={inside.length ? project.id : undefined}
		>
			<button
				type="button"
				class="dock-item"
				title={project.name}
				draggable="false"
				onclick={() => onOpen(project.id)}
			>
				<DesktopTile {project} {inside} size="sm" />
				<span class="d-label">{shortName(project.name, 24)}</span>
			</button>
			{#if inside.length}
				<button
					type="button"
					class="spring"
					data-nodrag
					aria-expanded={open}
					aria-label="{open ? 'Hide' : 'Show'} projects inside {project.name}"
					onclick={() => onToggleSpring(project.id)}
				>
					<ChevronRight class="h-3.5 w-3.5" />
				</button>
			{/if}
		</div>
		{#if open}
			{#each inside as child (child.id)}
				{#if child.id !== openId}
					<div
						class="cell child {dropClass(`project:${child.id}`)}"
						class:lifted={lifted === `project:${child.id}`}
						data-drag-kind="project"
						data-drag-id={child.id}
						data-drop-kind="project"
						data-drop-id={child.id}
					>
						<button
							type="button"
							class="dock-item"
							title="{child.name} (inside {project.name})"
							draggable="false"
							onclick={() => onOpen(child.id)}
						>
							<DesktopTile project={child} size="xs" />
							<span class="d-label">{shortName(child.name, 24)}</span>
						</button>
					</div>
				{/if}
			{/each}
		{/if}
	{/each}
</aside>

<style>
	.dock {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: calc(100dvh - 1.5rem);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 8px 4px;
		border-radius: 16px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		box-shadow: var(--shadow-ink);
		scrollbar-width: thin;
	}
	.dock-label {
		text-align: center;
		padding: 0 0 4px;
	}
	.cell {
		position: relative;
		flex: none;
		border-radius: 12px;
		-webkit-user-select: none;
		user-select: none;
		-webkit-touch-callout: none;
		touch-action: pan-y;
		transition:
			background-color 140ms cubic-bezier(0.22, 1, 0.36, 1),
			opacity 140ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	.dock-item {
		display: flex;
		width: 100%;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 8px 4px;
		border-radius: 12px;
		color: hsl(var(--foreground));
		-webkit-touch-callout: none;
		transition: background-color 140ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	.dock-item:hover {
		background: hsl(var(--muted));
	}
	.dock-item:focus-visible,
	.spring:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	.d-label {
		max-width: 100%;
		font-size: 11px;
		line-height: 14px;
		text-align: center;
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.slot-tile {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 8px;
		border: 1px dashed hsl(var(--border-strong));
		color: hsl(var(--muted-foreground));
	}
	.child {
		margin-left: 8px;
		border-left: 1px solid hsl(var(--border-strong));
		border-radius: 0 12px 12px 0;
	}
	.spring {
		position: absolute;
		right: 4px;
		top: 4px;
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 6px;
		color: hsl(var(--muted-foreground));
		transition:
			background-color 140ms cubic-bezier(0.22, 1, 0.36, 1),
			color 140ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	.spring:hover {
		background: hsl(var(--border));
		color: hsl(var(--foreground));
	}
	.spring :global(svg) {
		transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	.spring[aria-expanded='true'] :global(svg) {
		transform: rotate(90deg);
	}
	.sep {
		flex: none;
		height: 1px;
		margin: 4px 8px;
		background: hsl(var(--border));
	}
	.drop-ok,
	.slot.drop-ok {
		background: hsl(var(--accent) / 0.14);
		box-shadow: inset 0 0 0 2px hsl(var(--accent));
	}
	.drop-no {
		opacity: 0.45;
	}
	.lifted {
		opacity: 0.35;
	}
	@media (max-width: 767px) {
		.dock {
			position: fixed;
			inset: auto 0 0 0;
			z-index: 40;
			flex-direction: row;
			max-height: none;
			overflow-x: auto;
			overflow-y: hidden;
			border-radius: 16px 16px 0 0;
			border-bottom: 0;
			padding: 8px 12px calc(12px + env(safe-area-inset-bottom, 0px));
			box-shadow: var(--shadow-ink-strong);
		}
		.dock-label {
			align-self: center;
			padding: 0 4px;
			writing-mode: vertical-rl;
			transform: rotate(180deg);
		}
		.cell,
		.slot {
			width: 72px;
			flex: none;
		}
		.child {
			margin-left: 0;
			border-left: 0;
			border-bottom: 2px solid hsl(var(--border-strong));
			border-radius: 12px 12px 0 0;
		}
		.sep {
			width: 1px;
			height: auto;
			margin: 8px 4px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.cell,
		.dock-item,
		.spring,
		.spring :global(svg) {
			transition: none;
		}
	}
</style>
