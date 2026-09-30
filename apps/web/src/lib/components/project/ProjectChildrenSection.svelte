<!-- apps/web/src/lib/components/project/ProjectChildrenSection.svelte -->
<!--
	"Inside this project" on a hub's Overview: one row per sub-project the viewer
	can open (state + next step), linking to it. Hidden when there are none.
	Admins (on the hub or the sub-project) can take a sub-project back out.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { ChevronRight, FolderKanban } from '$lib/icons/lucide';
	import { normalizeProjectState, PROJECT_STATE_META } from '$lib/config/project-states';
	import { formatProjectResumeCue } from '$lib/components/projects/project-list';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type { ProjectFamilyChildV1 } from '@buildos/shared-types';
	import { detachProject, possessive } from './project-family';

	let {
		subProjects,
		totalCount,
		projectId,
		projectName = 'this project',
		canEdit = false,
		onFamilyChanged
	}: {
		/** Sub-projects the viewer can open. */
		subProjects: ProjectFamilyChildV1[];
		/** Every sub-project, including ones the viewer can't open. */
		totalCount: number;
		projectId?: string;
		/** The hub's name, for "Remove from …". */
		projectName?: string;
		canEdit?: boolean;
		onFamilyChanged?: () => void | Promise<void>;
	} = $props();

	const hiddenCount = $derived(Math.max(0, totalCount - subProjects.length));
	let removing = $state<ProjectFamilyChildV1 | null>(null);
	let removeSaving = $state(false);
	let removeError = $state<string | null>(null);
	const removingName = $derived(removing?.name || 'this project');

	function askRemove(child: ProjectFamilyChildV1) {
		removing = child;
		removeError = null;
	}

	function cancelRemove() {
		if (!removeSaving) removing = null;
	}

	async function confirmRemove() {
		const child = removing;
		if (!child || removeSaving) return;
		removeSaving = true;
		removeError = null;
		try {
			await detachProject(child.id);
			removing = null;
			toastService.success(`Removed ${child.name || 'the project'} from ${projectName}`);
			await onFamilyChanged?.();
		} catch (error) {
			removeError =
				error instanceof Error && error.message
					? error.message
					: 'This change could not be saved.';
		} finally {
			removeSaving = false;
		}
	}
</script>

{#if subProjects.length > 0}
	<section class="min-w-0 border-t border-border pt-4" aria-labelledby="overview-children-title">
		<header class="flex min-w-0 items-center justify-between gap-3 px-1 pb-3">
			<div class="flex min-w-0 items-center gap-2">
				<FolderKanban class="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
				<h2 id="overview-children-title" class="text-sm font-semibold text-foreground">
					Inside this project
				</h2>
			</div>
			<span class="stamp shrink-0 text-2xs font-medium text-muted-foreground">
				{subProjects.length}
			</span>
		</header>

		<ul class="grid gap-1 sm:grid-cols-2">
			{#each subProjects as child (child.id)}
				{@const stateLabel =
					PROJECT_STATE_META[normalizeProjectState(child.state_key)].label}
				{@const nextStep = formatProjectResumeCue(child.next_step_short)}
				<li class="min-w-0">
					<a
						href={resolve('/projects/[id]', { id: child.id })}
						class="flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none pressable"
					>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-semibold text-foreground">
								{child.name || 'Untitled project'}
							</p>
							<p
								class="truncate text-xs text-muted-foreground"
								title={nextStep || undefined}
							>
								{stateLabel}{#if nextStep}<span aria-hidden="true"> · </span><span
										class="sr-only"
										>. Next step:
									</span>{nextStep}{/if}
							</p>
						</div>
						<ChevronRight
							class="h-4 w-4 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
					</a>
					{#if (projectId && canEdit) || child.can_detach}
						<div class="ml-2.5 flex min-w-0 flex-wrap items-center gap-x-3">
							{#if projectId && canEdit}
								<a
									href={`${resolve('/projects/[id]/organize', { id: projectId })}?with=${child.id}`}
									class="inline-flex min-h-11 items-center rounded px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring [@media(pointer:fine)]:min-h-9"
									aria-label={`Organize with ${child.name}`}>Organize with…</a
								>
							{/if}
							{#if child.can_detach}
								<button
									type="button"
									class="inline-flex min-h-11 min-w-0 max-w-full items-center rounded px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring [@media(pointer:fine)]:min-h-9"
									aria-label={`Remove ${child.name || 'this project'} from ${projectName}`}
									onclick={() => askRemove(child)}
								>
									<span class="truncate">Remove from {projectName}</span>
								</button>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		{#if hiddenCount > 0}
			<p class="px-2.5 pt-1 text-xs text-muted-foreground">
				{hiddenCount} more you don't have access to.
			</p>
		{/if}
	</section>
{/if}

{#if removing}
	<ConfirmationModal
		isOpen
		title={`Remove ${removingName} from ${projectName}?`}
		confirmText="Remove"
		loading={removeSaving}
		loadingText="Removing…"
		onconfirm={confirmRemove}
		oncancel={cancelRemove}
	>
		{#snippet content()}
			<p class="text-sm text-muted-foreground">
				It keeps all its docs and tasks. It will stop showing {possessive(projectName)} shared
				docs.
			</p>
		{/snippet}
		{#snippet details()}
			{#if removeError}
				<p class="mt-2 text-sm text-destructive" role="alert">{removeError}</p>
			{/if}
		{/snippet}
	</ConfirmationModal>
{/if}
