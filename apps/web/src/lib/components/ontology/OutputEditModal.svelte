<!-- apps/web/src/lib/components/ontology/OutputEditModal.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { Trash2, Layers } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import DocumentEditor from '$lib/components/ontology/DocumentEditor.svelte';
	import LinkedEntities from './linked-entities/LinkedEntities.svelte';
	import type { EntityKind } from './linked-entities/linked-entities.types';
	import TaskEditModal from './TaskEditModal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type { ResolvedTemplate } from '$lib/services/ontology/template-resolver.service';

	interface Props {
		outputId: string;
		projectId: string;
		isOpen?: boolean;
		onClose: () => void;
		onUpdated?: () => void;
		onDeleted?: () => void;
	}

	let {
		outputId,
		projectId,
		isOpen = $bindable(false),
		onClose,
		onUpdated,
		onDeleted
	}: Props = $props();

	type OutputRecord = {
		id: string;
		name: string;
		state_key: string;
		type_key: string;
		props?: Record<string, unknown> | null;
	};

	let output = $state<OutputRecord | null>(null);
	let resolvedTemplate = $state<ResolvedTemplate | null>(null);
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);
	let savingState = $state(false);
	let deleting = $state(false);
	let showDeleteConfirm = $state(false);
	let stateKey = $state('draft');
	let previousOutputId = $state<string | null>(null);

	const stateOptions = [
		{ value: 'draft', label: 'Draft' },
		{ value: 'in_progress', label: 'In Progress' },
		{ value: 'review', label: 'Review' },
		{ value: 'approved', label: 'Approved' },
		{ value: 'published', label: 'Published' }
	];

	// Modal states for linked entity navigation
	let showTaskModal = $state(false);
	let selectedTaskIdForModal = $state<string | null>(null);

	$effect(() => {
		if (!browser || !outputId) return;
		if (previousOutputId === outputId) return;
		previousOutputId = outputId;
		loadOutput();
	});

	async function loadOutput() {
		try {
			isLoading = true;
			loadError = null;

			const response = await fetch(`/api/onto/outputs/${outputId}`);
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to load output');
			}

			const data = payload?.data?.output;
			if (!data) {
				throw new Error('Output not found');
			}

			const normalized: OutputRecord = {
				id: data.id,
				name: data.name ?? '',
				state_key: data.state_key ?? 'draft',
				type_key: data.type_key ?? '',
				props: data.props ?? {}
			};

			output = normalized;
			stateKey = normalized.state_key;

			await loadTemplate(normalized.type_key);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to load output';
			loadError = message;
			toastService.error(message);
		} finally {
			isLoading = false;
		}
	}

	async function loadTemplate(typeKey: string) {
		if (!typeKey) return;
		try {
			const response = await fetch(
				`/api/onto/templates/by-type/${encodeURIComponent(typeKey)}?scope=output`
			);
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to load template');
			}
			resolvedTemplate = payload?.data?.template ?? null;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to resolve template';
			toastService.error(message);
			resolvedTemplate = null;
		}
	}

	function closeModal() {
		isOpen = false;
		onClose();
	}

	async function handleStateChange(nextState: string) {
		if (nextState === stateKey) return;
		try {
			savingState = true;
			const response = await fetch(`/api/onto/outputs/${outputId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ state_key: nextState })
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to update state');
			}
			stateKey = nextState;
			output = output
				? {
						...output,
						state_key: nextState
					}
				: output;
			toastService.success('State updated');
			onUpdated?.();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update state';
			toastService.error(message);
		} finally {
			savingState = false;
		}
	}

	async function handleContentSave(data: {
		title: string;
		content: string;
		props: Record<string, unknown>;
	}) {
		try {
			const response = await fetch(`/api/onto/outputs/${outputId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: data.title,
					props: data.props,
					state_key: stateKey
				})
			});

			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to save output');
			}

			output = output
				? {
						...output,
						name: data.title,
						props: data.props
					}
				: output;

			onUpdated?.();
		} catch (error) {
			throw error instanceof Error ? error : new Error('Failed to save output');
		}
	}

	async function handleDelete() {
		try {
			deleting = true;
			const response = await fetch(`/api/onto/outputs/${outputId}`, {
				method: 'DELETE'
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to delete output');
			}

			toastService.success('Output deleted');
			showDeleteConfirm = false;
			onDeleted?.();
			onClose();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to delete output';
			toastService.error(message);
		} finally {
			deleting = false;
		}
	}

	// Linked entity click handler
	function handleLinkedEntityClick(kind: EntityKind, id: string) {
		if (kind === 'task') {
			selectedTaskIdForModal = id;
			showTaskModal = true;
		} else {
			console.warn(`Unhandled entity kind: ${kind}`);
		}
	}

	function closeLinkedEntityModals() {
		showTaskModal = false;
		selectedTaskIdForModal = null;
		// Refresh output data to get updated linked entities
		loadOutput();
	}
</script>

<Modal
	bind:isOpen
	onClose={closeModal}
	size="xl"
	closeOnBackdrop={false}
	closeOnEscape={!savingState}
	showCloseButton={false}
>
	{#snippet header()}
		<!-- Compact Inkprint header -->
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="p-1.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0"
				>
					<Layers class="w-4 h-4" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{output?.name || 'Output'}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Deliverable</p>
				</div>
			</div>
			<Button
				variant="ghost"
				size="sm"
				onclick={closeModal}
				class="text-muted-foreground hover:text-foreground shrink-0 !p-1 sm:!p-1.5"
				disabled={savingState}
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					></path>
				</svg>
			</Button>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="overflow-y-auto" style="max-height: 70vh;">
			{#if isLoading}
				<div class="flex items-center justify-center py-12">
					<div class="animate-pulse text-gray-500 dark:text-gray-400">
						Loading editor…
					</div>
				</div>
			{:else if loadError}
				<div class="flex flex-col items-center justify-center gap-3 text-center px-6 py-12">
					<p class="text-gray-600 dark:text-gray-300">{loadError}</p>
					<Button variant="secondary" onclick={loadOutput}>Try again</Button>
				</div>
			{:else if output && resolvedTemplate}
				<div class="px-4 sm:px-6 py-6">
					<!-- Output Info Section -->
					<section
						class="rounded border border-border bg-muted/30 p-4 sm:p-5 shadow-ink space-y-2 tx tx-grain tx-weak mb-6"
					>
						<div class="flex flex-wrap items-center gap-2">
							<span class="w-1.5 h-1.5 bg-accent rounded-full animate-pulse shrink-0"
							></span>
							<h3 class="text-base font-semibold text-foreground">
								{output.name}
							</h3>
						</div>
						<div
							class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
						>
							<span
								>Type: <code
									class="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-accent"
									>{output.type_key}</code
								></span
							>
						</div>
					</section>

					<!-- State Selector -->
					<div class="mb-6">
						<label
							for="output-state"
							class="block text-sm font-medium text-gray-900 dark:text-white mb-2"
						>
							Output State
						</label>
						<Select
							id="output-state"
							size="sm"
							value={stateKey}
							onchange={(val) => handleStateChange(String(val))}
							disabled={savingState}
							class="max-w-xs"
						>
							{#each stateOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</Select>
					</div>

					<!-- Linked Entities -->
					<div class="mb-6">
						<LinkedEntities
							sourceId={outputId}
							sourceKind="output"
							{projectId}
							onEntityClick={handleLinkedEntityClick}
							onLinksChanged={loadOutput}
						/>
					</div>

					<!-- Document Editor -->
					<DocumentEditor
						outputId={output.id}
						templateKey={output.type_key}
						{resolvedTemplate}
						initialContent={(output.props?.content as string) ?? ''}
						initialTitle={output.name}
						initialProps={output.props ?? {}}
						{projectId}
						onSave={handleContentSave}
					/>
				</div>
			{:else}
				<div
					class="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400"
				>
					Unable to load editor for this output.
				</div>
			{/if}
		</div>
	{/snippet}
	{#snippet footer()}
		<div
			class="flex flex-row items-center justify-between gap-2 sm:gap-4 p-2 sm:p-4 border-t border-border bg-muted/30 tx tx-grain tx-weak"
		>
			<!-- Danger zone inline on mobile -->
			<div class="flex items-center gap-1.5 sm:gap-2">
				<Trash2 class="w-3 h-3 sm:w-4 sm:h-4 text-red-500 shrink-0" />
				<Button
					variant="danger"
					size="sm"
					onclick={() => (showDeleteConfirm = true)}
					class="text-[10px] sm:text-xs px-2 py-1 sm:px-3 sm:py-1.5"
				>
					Delete
				</Button>
			</div>
			<Button
				type="button"
				variant="secondary"
				size="sm"
				onclick={closeModal}
				disabled={savingState}
				class="text-xs sm:text-sm px-2 sm:px-4"
			>
				Close
			</Button>
		</div>
	{/snippet}
</Modal>

<ConfirmationModal
	isOpen={showDeleteConfirm}
	title="Delete output"
	confirmText="Delete output"
	confirmVariant="danger"
	loading={deleting}
	loadingText="Deleting..."
	icon="danger"
	on:confirm={handleDelete}
	on:cancel={() => (showDeleteConfirm = false)}
>
	<p class="text-sm text-gray-600 dark:text-gray-300">
		This removes the text document and any references in the project. This action cannot be
		undone.
	</p>
</ConfirmationModal>

<!-- Linked Entity Modals -->
{#if showTaskModal && selectedTaskIdForModal}
	<TaskEditModal
		taskId={selectedTaskIdForModal}
		{projectId}
		onClose={closeLinkedEntityModals}
		onUpdated={closeLinkedEntityModals}
		onDeleted={closeLinkedEntityModals}
	/>
{/if}
