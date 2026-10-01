<!-- apps/web/src/lib/components/project/ProjectParentPickerModal.svelte -->
<!--
	"Move under…": pick the project this one belongs to, or remove it from its
	current parent. One level only: a project with sub-projects can't move under
	another. Parents the server would refuse (already inside another project, no
	admin access) are greyed out with the reason up front; the server still
	decides, and its 409/403 message is shown as-is. A parent's admin who can't
	move this project sees only "Remove from …" (`canMove` false).
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		DEFAULT_PROJECT_SELECTOR_LIMIT,
		MAX_PROJECT_SELECTOR_LIMIT,
		PROJECT_SELECTOR_SEARCH_DEBOUNCE_MS,
		formatRelativeProjectUpdate,
		normalizeProjectSelectionSearch
	} from '$lib/components/chat/project-selector-browser';
	import { normalizeProjectState, PROJECT_STATE_META } from '$lib/config/project-states';
	import { toastService } from '$lib/stores/toast.store';
	import {
		AlertTriangle,
		Check,
		FolderKanban,
		FolderUp,
		LoaderCircle,
		Search,
		X
	} from '$lib/icons/lucide';
	import type { ProjectFamilyV1, ProjectSetParentResultV1 } from '@buildos/shared-types';
	import {
		fetchParentCandidates,
		possessive,
		setProjectParent,
		type ParentCandidate
	} from './project-family';

	let {
		isOpen = $bindable(false),
		projectId,
		projectName,
		family,
		canMove = true,
		onClose,
		onChanged
	}: {
		isOpen?: boolean;
		projectId: string;
		projectName: string;
		family: ProjectFamilyV1 | null;
		/** Whether the viewer may put this project under another (admin here). */
		canMove?: boolean;
		onClose: () => void;
		onChanged?: (result: ProjectSetParentResultV1) => void | Promise<void>;
	} = $props();

	let searchTerm = $state('');
	let results = $state<ParentCandidate[]>([]);
	let loadingResults = $state(false);
	let resultsError = $state<string | null>(null);
	let selectedId = $state<string | null>(null);
	let saving = $state<'move' | 'remove' | null>(null);
	let errorMessage = $state<string | null>(null);
	let resultsRequest = 0;
	let resultsController: AbortController | null = null;

	const displayName = $derived(projectName || 'This project');
	const currentParent = $derived(family?.parent ?? null);
	const canRemove = $derived(canMove || currentParent?.can_detach === true);
	const subProjectCount = $derived(family?.child_count ?? 0);
	const hasSubProjects = $derived(subProjectCount > 0);
	const subProjectIds = $derived(new Set((family?.children ?? []).map((child) => child.id)));
	const normalizedSearch = $derived(normalizeProjectSelectionSearch(searchTerm));
	const selectedProject = $derived(results.find((result) => result.id === selectedId) ?? null);

	function unavailableReason(candidate: ParentCandidate): string | null {
		if (candidate.id === projectId) return 'This project';
		if (candidate.id === currentParent?.id) return 'Current';
		if (subProjectIds.has(candidate.id)) return 'Inside this project';
		// One level of nesting: a project that is already inside another can't hold this one.
		if (candidate.parentProjectId) {
			return `Already inside ${candidate.parentProjectName || 'another project'}`;
		}
		// Nesting needs admin on both projects; unknown access is left to the server.
		if (candidate.accessLevel && candidate.accessLevel !== 'admin') {
			return 'Needs admin access';
		}
		return null;
	}

	async function loadResults(search: string) {
		const request = ++resultsRequest;
		resultsController?.abort();
		const controller = new AbortController();
		resultsController = controller;
		loadingResults = true;
		resultsError = null;
		try {
			const projects = await fetchParentCandidates({
				search,
				limit: search ? MAX_PROJECT_SELECTOR_LIMIT : DEFAULT_PROJECT_SELECTOR_LIMIT,
				signal: controller.signal
			});
			if (request !== resultsRequest) return;
			results = projects;
			if (selectedId && !projects.some((project) => project.id === selectedId)) {
				selectedId = null;
			}
		} catch (error) {
			if ((error as Error)?.name === 'AbortError' || request !== resultsRequest) return;
			resultsError = 'Projects could not be loaded.';
		} finally {
			if (request === resultsRequest) {
				loadingResults = false;
				resultsController = null;
			}
		}
	}

	// Load while open; searches are debounced, the default list loads at once.
	$effect(() => {
		if (!browser || !isOpen || hasSubProjects || !canMove) return;
		const search = normalizedSearch;
		if (!search) {
			untrack(() => void loadResults(''));
			return;
		}
		const timeoutId = setTimeout(
			() => void loadResults(search),
			PROJECT_SELECTOR_SEARCH_DEBOUNCE_MS
		);
		return () => clearTimeout(timeoutId);
	});

	$effect(() => {
		if (isOpen) return;
		untrack(() => {
			resultsController?.abort();
			searchTerm = '';
			selectedId = null;
			errorMessage = null;
		});
	});

	function close() {
		if (saving) return;
		onClose();
	}

	async function applyParent(parentId: string | null, parentName: string) {
		if (saving) return;
		saving = parentId ? 'move' : 'remove';
		errorMessage = null;
		try {
			const result = await setProjectParent(projectId, parentId);
			toastService.success(
				parentId ? `Moved under ${parentName}` : `Removed from ${parentName}`
			);
			await onChanged?.(result);
			saving = null;
			onClose();
		} catch (error) {
			errorMessage =
				error instanceof Error && error.message
					? error.message
					: 'This change could not be saved.';
			saving = null;
		}
	}
</script>

<Modal
	bind:isOpen
	onClose={close}
	title={canMove
		? 'Move under another project'
		: `Remove from ${currentParent?.name || 'parent project'}`}
	size="md"
	variant="bottom-sheet"
	closeOnEscape={!saving}
	closeOnBackdrop={!saving}
>
	<div class="space-y-3 p-3 sm:p-4">
		{#if canMove}
			<p class="text-sm text-muted-foreground">
				Put <span class="font-semibold text-foreground">{displayName}</span> inside the project
				it belongs to. Documents shared by that project will show on this project's Docs tab.
			</p>
		{/if}

		{#if currentParent}
			<div
				class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2 tx tx-thread tx-weak"
			>
				<FolderUp class="h-4 w-4 shrink-0 text-info" aria-hidden="true" />
				<div class="min-w-0 flex-1">
					<p class="micro-label">Part of</p>
					<p class="truncate text-sm font-semibold text-foreground">
						{currentParent.name || 'Untitled project'}
					</p>
				</div>
				{#if canRemove}
					<Button
						variant="outline"
						size="sm"
						icon={X}
						loading={saving === 'remove'}
						disabled={saving !== null}
						onclick={() =>
							applyParent(null, currentParent?.name || 'the parent project')}
					>
						Remove from {currentParent.name || 'parent'}
					</Button>
					<p class="basis-full text-xs text-muted-foreground">
						It keeps all its docs and tasks. It will stop showing {possessive(
							currentParent.name || 'the parent project'
						)} shared docs.
					</p>
				{/if}
			</div>
		{/if}

		{#if canMove && hasSubProjects}
			<div
				class="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 tx tx-static tx-weak"
				role="note"
			>
				<AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
				<p class="text-sm text-foreground">
					{displayName} has {subProjectCount}
					{subProjectCount === 1 ? 'sub-project' : 'sub-projects'}, so it can't go inside
					another project. Projects nest one level deep for now.
				</p>
			</div>
		{:else if canMove}
			<div class="relative tx tx-grid tx-weak rounded-lg">
				<Search
					class="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground"
					aria-hidden="true"
				/>
				<input
					type="search"
					bind:value={searchTerm}
					data-autofocus
					placeholder="Search projects..."
					aria-label="Search projects"
					class="relative min-h-11 w-full rounded-lg border border-border-strong bg-background py-2 pl-9 pr-3 text-base text-foreground shadow-ink-inner placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
				/>
			</div>

			<div class="min-h-40" aria-busy={loadingResults}>
				{#if resultsError}
					<div class="flex flex-col items-center gap-2 py-6 text-center">
						<p class="text-sm text-destructive">{resultsError}</p>
						<Button
							variant="outline"
							size="sm"
							onclick={() => void loadResults(normalizedSearch)}>Try again</Button
						>
					</div>
				{:else if loadingResults && results.length === 0}
					<div
						class="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
						role="status"
					>
						<LoaderCircle class="h-4 w-4 animate-spin motion-reduce:animate-none" />
						Loading projects…
					</div>
				{:else if results.length === 0}
					<p class="py-8 text-center text-sm text-muted-foreground">
						{normalizedSearch ? 'No matching projects.' : 'No other projects yet.'}
					</p>
				{:else}
					<ul class="space-y-0.5" aria-label="Projects">
						{#each results as candidate (candidate.id)}
							{@const reason = unavailableReason(candidate)}
							{@const isSelected = selectedId === candidate.id}
							{@const stateLabel =
								PROJECT_STATE_META[normalizeProjectState(candidate.stateKey)].label}
							<li>
								<button
									type="button"
									disabled={reason !== null || saving !== null}
									aria-pressed={isSelected}
									onclick={() => {
										selectedId = isSelected ? null : candidate.id;
										errorMessage = null;
									}}
									class="flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-not-allowed motion-reduce:transition-none {isSelected
										? 'border-accent/50 bg-accent/10'
										: 'border-transparent hover:bg-muted/60'} {reason
										? 'opacity-60'
										: 'pressable'}"
								>
									<FolderKanban
										class="h-4 w-4 shrink-0 {isSelected
											? 'text-accent'
											: 'text-muted-foreground'}"
										aria-hidden="true"
									/>
									<span class="min-w-0 flex-1">
										<span
											class="block truncate text-sm font-semibold text-foreground"
										>
											{candidate.name}
										</span>
										<span class="block truncate text-xs text-muted-foreground">
											{stateLabel} · {formatRelativeProjectUpdate(
												candidate.updatedAt
											)}{candidate.hasChildren ? ' · Has sub-projects' : ''}
										</span>
									</span>
									{#if reason}
										<span
											class="max-w-[50%] shrink-0 truncate rounded-md bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
											title={reason}
										>
											{reason}
										</span>
									{:else if isSelected}
										<Check
											class="h-4 w-4 shrink-0 text-accent"
											aria-hidden="true"
										/>
									{/if}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<!-- Errors sit by the buttons that caused them; the list above may be scrolled. -->
		{#if errorMessage}
			<p
				class="mx-3 my-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground sm:mx-4"
				role="alert"
			>
				{errorMessage}
			</p>
		{/if}
		<div
			class="flex items-center justify-end gap-2 border-t border-border px-3 py-2 sm:px-4 sm:py-3"
		>
			<Button variant="ghost" size="sm" onclick={close} disabled={saving !== null}>
				Cancel
			</Button>
			{#if canMove && !hasSubProjects}
				<Button
					variant="primary"
					size="sm"
					icon={FolderUp}
					loading={saving === 'move'}
					disabled={!selectedProject || saving !== null}
					onclick={() => {
						if (selectedProject)
							void applyParent(selectedProject.id, selectedProject.name);
					}}
				>
					<span class="max-w-48 truncate">
						{selectedProject ? `Move under ${selectedProject.name}` : 'Move under…'}
					</span>
				</Button>
			{/if}
		</div>
	{/snippet}
</Modal>
