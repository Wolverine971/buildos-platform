<!-- apps/web/src/lib/components/table-surfaces/SaveAsTableHost.svelte -->
<!--
	Opens the new-table dialog prefilled with a table the agent showed in chat.
	The chat list calls open(data) from its "Save as table" buttons. When the
	chat has no project, a short picker asks where the table should live first.
-->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type { LoadedTable } from '@buildos/shared-agent-ops/tables';
	import { gridToCsv, type GridData } from './table-surface-utils';

	let { projectId = null }: { projectId?: string | null } = $props();

	type ProjectOption = { id: string; name: string };

	let pendingCsv = $state<string | null>(null);
	let targetProjectId = $state<string | null>(null);
	let pickerOpen = $state(false);
	let projects = $state<ProjectOption[]>([]);
	let projectsLoading = $state(false);
	let projectsError = $state('');

	/** Called by the chat list with the rendered table's cells. */
	export function open(data: GridData) {
		pendingCsv = gridToCsv(data);
		if (projectId) {
			targetProjectId = projectId;
			return;
		}
		targetProjectId = null;
		pickerOpen = true;
		void loadProjects();
	}

	async function loadProjects() {
		projectsLoading = true;
		projectsError = '';
		try {
			const response = await fetch('/api/onto/projects?limit=50');
			const payload = await response.json().catch(() => null);
			if (!response.ok) throw new Error(payload?.error || 'Could not load projects.');
			projects = ((payload?.data?.projects ?? []) as Array<Record<string, unknown>>)
				.filter((project) => typeof project.id === 'string')
				.map((project) => ({
					id: String(project.id),
					name: String(project.name || 'Untitled project')
				}));
		} catch (cause) {
			projectsError = cause instanceof Error ? cause.message : 'Could not load projects.';
		} finally {
			projectsLoading = false;
		}
	}

	function chooseProject(id: string) {
		targetProjectId = id;
		pickerOpen = false;
	}

	function reset() {
		pendingCsv = null;
		targetProjectId = null;
		pickerOpen = false;
	}

	function handleCreated(table: LoadedTable) {
		reset();
		toastService.success(`Saved "${table.document.title}" as a table.`);
	}
</script>

{#if pickerOpen && pendingCsv}
	<Modal isOpen={true} title="Save as table in…" size="sm" onClose={reset}>
		{#snippet children()}
			<div class="grid gap-2 p-3">
				{#if projectsLoading}
					<div class="grid gap-1.5" aria-busy="true" aria-label="Loading projects">
						{#each [0, 1, 2] as index (index)}
							<div
								class="h-11 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
							></div>
						{/each}
					</div>
				{:else if projectsError}
					<p class="text-sm text-destructive" role="alert">{projectsError}</p>
				{:else if projects.length === 0}
					<p class="text-sm text-muted-foreground">
						Make a project first, then save here.
					</p>
				{:else}
					<ul class="grid max-h-80 gap-1 overflow-y-auto" role="list">
						{#each projects as project (project.id)}
							<li>
								<button
									type="button"
									onclick={() => chooseProject(project.id)}
									class="flex min-h-11 w-full items-center rounded-md px-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none pressable"
								>
									<span class="truncate">{project.name}</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/snippet}
	</Modal>
{/if}

{#if pendingCsv && targetProjectId}
	{#await import('$lib/components/tables/NewTableDialog.svelte') then { default: NewTableDialog }}
		<NewTableDialog
			projectId={targetProjectId}
			initialText={pendingCsv}
			onCreated={handleCreated}
			onClose={reset}
		/>
	{/await}
{/if}
