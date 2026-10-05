<!-- apps/web/src/lib/components/project/ProjectTrashSection.svelte -->
<!--
  The owner's deleted projects, kept 30 days before they're erased. A quiet, collapsed
  disclosure at the bottom of Projects that only appears when something is in it. It reads
  the trash on its own after the page has painted, so it never slows the Projects load.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { invalidate } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import DesktopTile from '$lib/components/projects/desktop/DesktopTile.svelte';
	import type { ProjectListSummary } from '$lib/components/projects/project-list';
	import { toastService } from '$lib/stores/toast.store';
	import { ChevronDown, RotateCcw, Trash2 } from '$lib/icons/lucide';
	import { readProjectEmoji, tileGlyphs } from './emoji/project-emoji';

	type TrashedProject = {
		id: string;
		name: string;
		icon_emoji: unknown | null;
		deleted_at: string;
		erase_after: string;
		member_count: number;
	};

	type IdleWindow = Window & {
		requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
		cancelIdleCallback?: (handle: number) => void;
	};

	let items = $state<TrashedProject[]>([]);
	let restoringId = $state<string | null>(null);
	let summaryEl = $state<HTMLElement | null>(null);

	onMount(() => {
		const controller = new AbortController();
		const start = () => void loadTrash(controller.signal);
		const idleWindow = window as IdleWindow;
		if (typeof idleWindow.requestIdleCallback === 'function') {
			const handle = idleWindow.requestIdleCallback(start, { timeout: 2000 });
			return () => {
				controller.abort();
				idleWindow.cancelIdleCallback?.(handle);
			};
		}
		const timeout = window.setTimeout(start, 300);
		return () => {
			controller.abort();
			window.clearTimeout(timeout);
		};
	});

	async function loadTrash(signal: AbortSignal) {
		try {
			const response = await fetch('/api/onto/projects/trash', {
				method: 'GET',
				credentials: 'same-origin',
				signal
			});
			const payload = await response.json().catch(() => null);
			if (signal.aborted || !response.ok) return;
			const projects = payload?.data?.projects;
			items = Array.isArray(projects)
				? projects.filter(
						(project: Partial<TrashedProject> | null): project is TrashedProject =>
							typeof project?.id === 'string' && typeof project?.name === 'string'
					)
				: [];
		} catch {
			// Best-effort: without the trash list the page simply shows no Trash section.
		}
	}

	/** The stored emoji value as tile glyphs (a glyph list or the full pick record). */
	function glyphsFor(value: unknown): string[] | null {
		const fromList = tileGlyphs(value);
		if (fromList) return fromList;
		const picked = readProjectEmoji(value)?.glyphs ?? [];
		return picked.length ? picked : null;
	}

	/** DesktopTile reads only id, name, and emoji. */
	function tileProject(item: TrashedProject): ProjectListSummary {
		const tile: Pick<ProjectListSummary, 'id' | 'name' | 'emoji'> = {
			id: item.id,
			name: item.name,
			emoji: glyphsFor(item.icon_emoji)
		};
		return tile as ProjectListSummary;
	}

	function formatEraseDay(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'soon';
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function collaboratorLabel(count: number): string {
		return count === 1 ? '1 collaborator' : `${count} collaborators`;
	}

	async function restore(item: TrashedProject) {
		if (restoringId) return;
		restoringId = item.id;
		try {
			const response = await fetch(`/api/onto/projects/${item.id}/restore`, {
				method: 'POST',
				credentials: 'same-origin'
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok || payload?.success === false) {
				throw new Error(payload?.error || `Couldn’t restore ${item.name}`);
			}
			items = items.filter((entry) => entry.id !== item.id);
			toastService.success(`${item.name} is back`);
			void invalidate('ontology:projects');
			// The row's button is gone; keep keyboard focus in the section.
			await tick();
			summaryEl?.focus();
		} catch (error) {
			toastService.error(
				error instanceof Error ? error.message : `Couldn’t restore ${item.name}`
			);
		} finally {
			restoringId = null;
		}
	}
</script>

{#if items.length > 0}
	<details class="group/trash border-t border-border pt-3">
		<summary
			bind:this={summaryEl}
			class="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden [@media(pointer:fine)]:min-h-8"
		>
			<Trash2 class="h-4 w-4 shrink-0" aria-hidden="true" />
			<span>Trash</span>
			<span class="stamp text-xs">{items.length}</span>
			<ChevronDown
				class="ml-auto h-4 w-4 shrink-0 transition-transform group-open/trash:rotate-180 motion-reduce:transition-none"
				aria-hidden="true"
			/>
		</summary>
		<p class="mt-1 text-xs text-muted-foreground">
			Deleted projects wait here for 30 days, then they’re erased for good.
		</p>
		<ul class="wt-paper mt-2 min-w-0 divide-y divide-border overflow-hidden">
			{#each items as item (item.id)}
				<li class="flex min-w-0 items-center gap-3 px-3 py-2">
					<DesktopTile project={tileProject(item)} size="xs" />
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium text-foreground">{item.name}</p>
						<p class="truncate text-xs text-muted-foreground">
							Erased <span class="stamp">{formatEraseDay(item.erase_after)}</span
							>{item.member_count > 0
								? ` · ${collaboratorLabel(item.member_count)}`
								: ''}
						</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						icon={RotateCcw}
						loading={restoringId === item.id}
						disabled={restoringId !== null}
						aria-label="Restore {item.name}"
						class="shrink-0 text-xs [@media(pointer:fine)]:min-h-8 [@media(pointer:fine)]:py-1.5"
						onclick={() => restore(item)}
					>
						Restore
					</Button>
				</li>
			{/each}
		</ul>
	</details>
{/if}
