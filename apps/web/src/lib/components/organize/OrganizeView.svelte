<!-- apps/web/src/lib/components/organize/OrganizeView.svelte -->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Modal from '$lib/components/ui/Modal.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import OrganizePane from './OrganizePane.svelte';
	import OrganizeProjectPicker from './OrganizeProjectPicker.svelte';
	import PendingChangesTray from './PendingChangesTray.svelte';
	import OrganizeDialogs from './OrganizeDialogs.svelte';
	import { createOrganizePersistence } from './useOrganizePersistence.svelte';
	import { receiptMessage, type OrganizeReceipt } from './organize-api';
	import { toastService } from '$lib/stores/toast.store';
	import { createOrganizeDrag } from './useOrganizeDrag.svelte';
	import {
		flattenDocumentTree,
		pinnedDocumentReason,
		previewOrganizePlan,
		visibleDocumentTree,
		type OrganizeMove,
		type OrganizeProject,
		type OrganizeRef
	} from './organize-plan';

	let {
		project,
		secondaryProject = null,
		relatedProjects = [],
		initialRef = null
	}: {
		project: OrganizeProject;
		secondaryProject?: OrganizeProject | null;
		relatedProjects?: { id: string; name: string }[];
		initialRef?: OrganizeRef | null;
	} = $props();
	let refreshedProject = $state.raw<OrganizeProject | null>(null);
	let chosenProject = $state.raw<OrganizeProject | null>(null);
	let moves = $state<OrganizeMove[]>([]);
	let selected = $state<OrganizeRef | null>(null);
	let picked = $state<OrganizeRef | null>(null);
	let mobilePane = $state(0);
	let keyboardPane = $state(0);
	let targetIndex = $state(0);
	let moveRef = $state<OrganizeRef | null>(null);
	let moveDestination = $state('');
	let moveParent = $state('');
	let message = $state('');
	let loading = $state(false);
	let needsRefresh = $state(false);
	let leaveUrl = $state<string | null>(null);
	let controller: AbortController | null = null;
	const baseline = $derived([
		refreshedProject ?? project,
		...((chosenProject ?? secondaryProject) ? [chosenProject ?? secondaryProject!] : [])
	]);
	const preview = $derived(previewOrganizePlan(baseline, moves));
	const pendingIds = $derived(new Set(preview.changes.flatMap((change) => change.moved_ids)));
	const destination = $derived(
		preview.projects.find((project) => project.id === moveDestination)
	);
	const folders = $derived(destination ? flattenDocumentTree(destination) : []);
	const keyboardProject = $derived(preview.projects[keyboardPane] ?? preview.projects[0]!);
	const keyboardTargets = $derived(
		picked?.kind === 'task'
			? [null]
			: [null, ...flattenDocumentTree(keyboardProject).map((row) => row.node.id)]
	);
	const keyboardParent = $derived(
		keyboardTargets[Math.min(targetIndex, keyboardTargets.length - 1)] ?? null
	);
	const drag = createOrganizeDrag({ getProjects: () => preview.projects, onDrop: stage });
	const persistence = createOrganizePersistence({
		getProjectId: () => project.id,
		onapplied: afterApply
	});
	const locked = $derived(
		loading || persistence.busy || !!persistence.review || persistence.uncertain
	);
	const canUndo = $derived(!moves.length && !locked && !needsRefresh);
	const activeTarget = $derived(
		drag.target ??
			(picked
				? { destination_project_id: keyboardProject.id, parent_id: keyboardParent }
				: null)
	);

	function stage(move: OrganizeMove) {
		if (locked || needsRefresh) return;
		try {
			previewOrganizePlan(baseline, [...moves, move]);
			moves = [...moves, move];
			persistence.clearError();
			selected = { kind: move.kind, id: move.id, project_id: move.destination_project_id };
			picked = null;
			moveRef = null;
			message = 'Move added to the plan. Nothing has been saved.';
		} catch (error) {
			message = error instanceof Error ? error.message : 'Cannot plan this move.';
		}
	}

	function movable(ref: OrganizeRef): boolean {
		if (locked || needsRefresh) return false;
		const source = preview.projects.find((project) => project.id === ref.project_id);
		const reason = !source?.can_write
			? 'This project is read only.'
			: ref.kind === 'document'
				? pinnedDocumentReason(source, ref.id)
				: null;
		if (reason) {
			message = reason;
			return false;
		}
		return true;
	}

	function openMove(ref: OrganizeRef) {
		if (!movable(ref)) return;
		picked = null;
		selected = ref;
		moveRef = ref;
		moveDestination = (preview.projects.find(
			(project) => project.id !== ref.project_id && project.can_write
		) ?? preview.projects.find((project) => project.id === ref.project_id))!.id;
		moveParent = '';
		message = '';
	}

	function appendMove(
		ref: OrganizeRef,
		target: OrganizeProject,
		parentId: string | null
	): OrganizeMove {
		const folder = parentId
			? flattenDocumentTree(target).find((row) => row.node.id === parentId)
			: null;
		return {
			...ref,
			destination_project_id: target.id,
			parent_id: parentId,
			position:
				ref.kind === 'task'
					? 0
					: folder
						? (folder.node.children?.length ?? 0)
						: visibleDocumentTree(target).length
		};
	}

	function rowKey(event: KeyboardEvent, ref: OrganizeRef) {
		if (picked) return; // window handler owns the carry interaction
		if (event.key.toLowerCase() === 'm' && !event.metaKey && !event.ctrlKey) {
			event.preventDefault();
			openMove(ref);
			return;
		}
		if (event.key === ' ') {
			event.preventDefault();
			event.stopPropagation();
			if (!movable(ref)) return;
			picked = ref;
			selected = ref;
			keyboardPane = Math.max(
				0,
				preview.projects.findIndex((project) => project.id === ref.project_id)
			);
			targetIndex = 0;
			message =
				'Picked up. Left and right choose a project; up and down choose a folder. Enter drops; Escape cancels.';
			return;
		}
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const row = event.currentTarget as HTMLElement;
			const rows = Array.from(
				row
					.closest('[data-organize-pane]')
					?.querySelectorAll<HTMLElement>('[data-organize-row]') ?? []
			);
			rows[rows.indexOf(row) + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
		}
	}

	function windowKey(event: KeyboardEvent) {
		if (locked || persistence.historyOpen || moveRef) return;
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			void reviewChanges();
			return;
		}
		if (event.key === 'Escape') {
			if (picked || drag.active) message = 'Move cancelled.';
			picked = null;
			drag.cancel();
		}
		if (!picked || moveRef) return;
		if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
			event.preventDefault();
			keyboardPane = event.key === 'ArrowLeft' ? 0 : Math.min(1, preview.projects.length - 1);
			mobilePane = keyboardPane;
			targetIndex = 0;
		} else if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
			event.preventDefault();
			targetIndex = Math.max(
				0,
				Math.min(
					keyboardTargets.length - 1,
					targetIndex + (event.key === 'ArrowDown' ? 1 : -1)
				)
			);
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			stage(appendMove(picked, keyboardProject, keyboardParent));
		}
	}

	async function chooseProject(id: string) {
		if (moves.length || locked || needsRefresh || id === project.id) return;
		controller?.abort();
		const request = new AbortController();
		controller = request;
		loading = true;
		message = '';
		picked = null;
		selected = null;
		drag.cancel();
		try {
			const response = await fetch(
				`/api/onto/organize/snapshot?project_id=${encodeURIComponent(id)}`,
				{ signal: request.signal }
			);
			const body = await response.json();
			if (!response.ok)
				throw new Error(body.error?.message ?? body.error ?? 'Could not open project.');
			if (request.signal.aborted) return;
			chosenProject = body.data.project;
			if (moveRef) moveDestination = id;
			moveParent = '';
			mobilePane = 1;
		} catch (error) {
			if (!request.signal.aborted)
				message = error instanceof Error ? error.message : 'Could not open project.';
		} finally {
			if (!request.signal.aborted) loading = false;
		}
	}

	function resetPlan(undo = false) {
		if (locked) return;
		moves = undo ? moves.slice(0, -1) : [];
		persistence.clearError();
		selected = null;
		picked = null;
		drag.cancel();
		message = undo ? 'Last staged move removed.' : 'Plan discarded.';
		if (needsRefresh && !moves.length) void refreshProjects();
	}

	async function reviewChanges() {
		if (!moves.length || locked || needsRefresh) return;
		picked = null;
		drag.cancel();
		await persistence.prepare(
			{
				moves: moves.map((move) => ({ ...move })),
				project_versions: Object.fromEntries(baseline.map((p) => [p.id, p.updated_at]))
			},
			'apply'
		);
	}
	async function reviewUndo(id: string) {
		if (!canUndo) {
			message = 'Apply or discard the pending plan before undoing a saved batch.';
			return;
		}
		picked = null;
		drag.cancel();
		await persistence.prepare({ source_batch_id: id }, 'undo');
	}
	async function refreshProjects(): Promise<boolean> {
		if (loading || persistence.busy || persistence.uncertain) return false;
		loading = true;
		message = '';
		picked = null;
		drag.cancel();
		controller?.abort();
		const request = new AbortController();
		controller = request;
		try {
			const fresh = await Promise.all(
				baseline.map(async (p) => {
					const response = await fetch(
						`/api/onto/organize/snapshot?project_id=${encodeURIComponent(p.id)}`,
						{ signal: request.signal }
					);
					const body = await response.json();
					if (!response.ok)
						throw new Error(
							body.error?.message ?? body.error ?? 'Could not refresh the projects.'
						);
					return body.data.project as OrganizeProject;
				})
			);
			if (request.signal.aborted) return false;
			// Keep the old plan intact if newer content makes its replay impossible.
			previewOrganizePlan(fresh, moves);
			refreshedProject = fresh[0]!;
			chosenProject = fresh[1] ?? null;
			needsRefresh = false;
			persistence.clearError();
			message = moves.length
				? 'Projects refreshed. Review the updated plan before applying.'
				: 'Projects refreshed.';
			return true;
		} catch (error) {
			if (!request.signal.aborted) {
				needsRefresh = true;
				message = `${error instanceof Error ? error.message : 'Could not refresh projects.'}${moves.length ? ' Discard the plan if it no longer fits the current projects.' : ' Retry refreshing before planning more moves.'}`;
			}
			return false;
		} finally {
			if (!request.signal.aborted) loading = false;
		}
	}
	async function refreshAndReview() {
		const current = persistence.review;
		persistence.closeReview();
		if (current?.mode === 'undo') {
			await persistence.prepare(current.request, 'undo');
		} else if (await refreshProjects()) await reviewChanges();
	}
	async function afterApply(receipt: OrganizeReceipt) {
		moves = [];
		selected = null;
		picked = null;
		moveRef = null;
		drag.cancel();
		needsRefresh = true;
		toastService.add({
			type: 'success',
			message: receiptMessage(receipt),
			duration: 10000,
			action: {
				label: 'Undo',
				onClick: () => {
					void reviewUndo(receipt.batch_id);
				}
			}
		});
		await refreshProjects();
	}

	beforeNavigate((navigation) => {
		if (!moves.length && !persistence.busy && !persistence.uncertain) return;
		navigation.cancel();
		if (persistence.busy || persistence.uncertain) {
			message = 'Finish checking the current request before leaving.';
			return;
		}
		if (!navigation.willUnload) leaveUrl = navigation.to?.url.href ?? null;
	});
	onDestroy(() => {
		controller?.abort();
		persistence.destroy();
		drag.cancel();
	});
	onMount(() => {
		if (initialRef) openMove(initialRef);
	});
</script>

<svelte:window
	onkeydown={windowKey}
	onpointermove={drag.move}
	onpointerup={drag.end}
	onpointercancel={() => drag.cancel()}
	onblur={() => drag.cancel()}
/>

<div
	class="mx-auto max-w-7xl px-3 py-5 sm:px-6"
	class:select-none={!!drag.active}
	class:pb-64={moves.length > 0}
>
	<header class="mb-5 flex flex-wrap items-start justify-between gap-3">
		<div>
			<a
				href={resolve('/projects/[id]', { id: project.id })}
				class="text-sm text-muted-foreground hover:text-foreground">← {project.name}</a
			>
			<h1 class="mt-2 text-2xl font-semibold tracking-tight text-foreground">Organize</h1>
			<p class="mt-1 text-sm text-muted-foreground">Plan where your docs and tasks belong.</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<Button variant="outline" disabled={locked} onclick={persistence.openHistory}
				>History</Button
			>
			<Button variant="ghost" disabled={locked} onclick={() => refreshProjects()}
				>Refresh projects</Button
			>
			<OrganizeProjectPicker
				excludeId={project.id}
				disabled={moves.length > 0 || locked || needsRefresh}
				onchoose={chooseProject}
			/>
		</div>
	</header>
	<p
		class="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
	>
		Stage moves between projects, review their impact, then apply the plan. Saved moves are
		available in History.
	</p>
	{#if relatedProjects.length && !moves.length}
		<div class="mb-4 flex flex-wrap items-center gap-2">
			<span class="text-xs text-muted-foreground">In this family</span>
			{#each relatedProjects as related (related.id)}<Button
					variant="outline"
					size="sm"
					disabled={locked || needsRefresh}
					onclick={() => chooseProject(related.id)}>{related.name}</Button
				>{/each}
		</div>
	{/if}
	<div class="mb-3 flex rounded-lg border border-border p-1 md:hidden" aria-label="Project panes">
		{#each preview.projects as pane, index (pane.id)}<button
				type="button"
				class="min-h-11 min-w-0 flex-1 truncate rounded-md px-2 text-sm"
				class:bg-muted={mobilePane === index}
				aria-pressed={mobilePane === index}
				onclick={() => (mobilePane = index)}>{pane.name}</button
			>{/each}
	</div>
	<p class="mb-2 min-h-5 text-sm text-muted-foreground" role="status">
		{loading ? 'Loading projects…' : persistence.busy ? 'Checking changes…' : message}
	</p>
	{#if persistence.error && !persistence.review}<p
			role="alert"
			class="mb-3 text-sm text-destructive"
		>
			{persistence.error}
		</p>{/if}
	{#if persistence.notice && !persistence.historyOpen}<p
			class="mb-3 text-sm text-muted-foreground"
		>
			{persistence.notice}
		</p>{/if}
	{#if !persistence.historyOpen}
		{#each persistence.skipped as item, index (`${index}:${item.id}`)}<p
				class="mb-2 text-sm text-muted-foreground"
			>
				{item.reason}
			</p>{/each}
	{/if}
	{#if persistence.lastReceipt}
		<div
			class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
		>
			<div>
				<p class="text-sm font-medium">{receiptMessage(persistence.lastReceipt)}</p>
				{#if persistence.lastReceipt.calendar_sync === 'queued'}<p
						class="text-xs text-muted-foreground"
					>
						Calendar updates are queued.
					</p>{/if}
				{#if needsRefresh}<p class="text-xs text-muted-foreground">
						Changes are saved. Refresh the projects to see their current contents.
					</p>{/if}
			</div>
			<Button
				variant="outline"
				size="sm"
				disabled={!canUndo ||
					persistence.history.some(
						(b) => b.inverse_of === persistence.lastReceipt?.batch_id
					)}
				onclick={() => reviewUndo(persistence.lastReceipt!.batch_id)}
				>Undo saved moves</Button
			>
		</div>
	{/if}
	{#if picked}<p class="mb-2 text-sm font-medium text-foreground" aria-live="polite">
			Destination: {keyboardProject.name} / {keyboardProject.documents.find(
				(doc) => doc.id === keyboardParent
			)?.title ?? 'Project root'}
		</p>{/if}
	<div class="grid gap-4 md:grid-cols-2" inert={locked || needsRefresh} aria-busy={loading}>
		{#each preview.projects as pane, index (pane.id)}
			<div class={mobilePane === index ? 'min-w-0' : 'hidden min-w-0 md:block'}>
				<OrganizePane
					project={pane}
					{selected}
					{pendingIds}
					isTarget={activeTarget?.destination_project_id === pane.id}
					targetParentId={activeTarget?.parent_id ?? null}
					onselect={(ref) => (selected = ref)}
					onmove={openMove}
					onkeydown={rowKey}
					onpointerdown={(event, ref) => drag.start(event, ref)}
				/>
			</div>
		{/each}
		{#if preview.projects.length === 1}<div
				class="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
			>
				Choose another project to plan moves across projects.
			</div>{/if}
	</div>
	<p class="mt-3 hidden text-xs text-muted-foreground md:block">
		Drag a row, or press Space to pick it up. Use arrow keys to choose a destination, Enter to
		drop, or M for “Move to…”. Press ⌘Enter or Ctrl+Enter to review your plan.
	</p>
	<PendingChangesTray
		changes={preview.changes}
		busy={persistence.busy || loading}
		disabled={!!persistence.review || persistence.uncertain}
		reviewDisabled={needsRefresh}
		onreview={reviewChanges}
		onundo={() => resetPlan(true)}
		onclear={() => resetPlan()}
	/>
</div>

{#if moveRef}
	<Modal
		isOpen={true}
		title="Move to…"
		size="sm"
		variant="bottom-sheet"
		onClose={() => (moveRef = null)}
	>
		<div class="space-y-4 p-4">
			<OrganizeProjectPicker
				excludeId={project.id}
				disabled={moves.length > 0 || locked || needsRefresh}
				onchoose={chooseProject}
			/>
			<label class="block text-sm font-medium"
				>Project
				<select
					class="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3"
					bind:value={moveDestination}
					onchange={() => (moveParent = '')}
				>
					{#each preview.projects.filter((item) => item.can_write) as item (item.id)}<option
							value={item.id}>{item.name}</option
						>{/each}
				</select>
			</label>
			{#if moveRef.kind === 'document'}
				<label class="block text-sm font-medium"
					>Place inside
					<select
						class="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3"
						bind:value={moveParent}
					>
						<option value="">Project root</option>
						{#each folders as folder (folder.node.id)}<option value={folder.node.id}
								>{'— '.repeat(folder.depth)}{destination?.documents.find(
									(doc) => doc.id === folder.node.id
								)?.title}</option
							>{/each}
					</select>
				</label>
			{/if}
			{#if message}<p class="text-sm text-muted-foreground" role="status">{message}</p>{/if}
			<Button
				class="w-full"
				onclick={() => {
					if (moveRef && destination)
						stage(appendMove(moveRef, destination, moveParent || null));
				}}>Add to plan</Button
			>
		</div>
	</Modal>
{/if}

<OrganizeDialogs
	{persistence}
	projects={baseline}
	changes={preview.changes}
	{canUndo}
	onundo={reviewUndo}
	onrefresh={refreshAndReview}
/>

{#if leaveUrl}
	<ConfirmationModal
		isOpen
		title="Discard this plan?"
		confirmText="Discard and leave"
		oncancel={() => (leaveUrl = null)}
		onconfirm={() => {
			const target = leaveUrl!;
			leaveUrl = null;
			resetPlan();
			void goto(target);
		}}
	>
		{#snippet content()}<p class="text-sm text-muted-foreground">
				The {moves.length} staged moves on this page have not been saved.
			</p>{/snippet}
	</ConfirmationModal>
{/if}
