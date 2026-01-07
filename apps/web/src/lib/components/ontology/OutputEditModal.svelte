<!-- apps/web/src/lib/components/ontology/OutputEditModal.svelte -->
<!--
	Output Edit Modal - Streamlined Document Editing

	Features:
	- Compact metadata controls in header
	- DocumentEditor for rich content editing
	- Collapsible linked entities section on mobile
	- High information density layout
	- Inkprint design language

	Documentation: /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { Trash2, Layers, X, ChevronDown, ChevronUp, Link2, Tag } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import DocumentEditor from '$lib/components/ontology/DocumentEditor.svelte';
	import LinkedEntities from './linked-entities/LinkedEntities.svelte';
	import TagsDisplay from './TagsDisplay.svelte';
	import type { EntityKind, LinkedEntitiesResult } from './linked-entities/linked-entities.types';
	import type { Component } from 'svelte';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import TaskEditModal from './TaskEditModal.svelte';
	import { OUTPUT_STATES } from '$lib/types/onto';
	import { OUTPUT_TYPE_KEYS } from '$lib/types/onto-taxonomy';
	import { toastService } from '$lib/stores/toast.store';

	// Lazy-loaded AgentChatModal for better initial load performance
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let AgentChatModalComponent = $state<Component<any, any, any> | null>(null);

	async function loadAgentChatModal() {
		if (!AgentChatModalComponent) {
			const mod = await import('$lib/components/agent/AgentChatModal.svelte');
			AgentChatModalComponent = mod.default;
		}
		return AgentChatModalComponent;
	}

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
		description?: string | null;
		props?: Record<string, unknown> | null;
		created_at?: string;
		updated_at?: string;
	};

	let output = $state<OutputRecord | null>(null);
	let linkedEntities = $state<LinkedEntitiesResult | undefined>(undefined);
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);
	let savingState = $state(false);
	let savingTypeKey = $state(false);
	let deleting = $state(false);
	let showDeleteConfirm = $state(false);
	let stateKey = $state('draft');
	let typeKey = $state('output.default');
	let previousOutputId = $state<string | null>(null);
	let hasChanges = $state(false);

	// Mobile UI state
	let showDetails = $state(false);

	const stateOptions = OUTPUT_STATES.map((state) => ({
		value: state,
		label: state.replace('_', ' ')
	}));

	// Modal states for linked entity navigation
	let showTaskModal = $state(false);
	let selectedTaskIdForModal = $state<string | null>(null);
	let showChatModal = $state(false);

	// Build focus for chat about this output
	const entityFocus = $derived.by((): ProjectFocus | null => {
		if (!output || !projectId) return null;
		return {
			focusType: 'output',
			focusEntityId: outputId,
			focusEntityName: output.name || 'Untitled Output',
			projectId: projectId,
			projectName: 'Project'
		};
	});

	// Helper to safely check if tags exist
	const hasTags = $derived.by(() => {
		const tags = output?.props?.tags;
		return Array.isArray(tags) && tags.length > 0;
	});

	// Count linked entities
	const linkedCount = $derived.by(() => {
		if (!linkedEntities) return 0;
		return (linkedEntities.tasks?.length ?? 0) +
			(linkedEntities.goals?.length ?? 0) +
			(linkedEntities.plans?.length ?? 0) +
			(linkedEntities.documents?.length ?? 0);
	});

	// Count tags
	const tagCount = $derived.by(() => {
		const tags = output?.props?.tags;
		return Array.isArray(tags) ? tags.length : 0;
	});

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

			const response = await fetch(`/api/onto/outputs/${outputId}/full`);
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to load output');
			}

			const data = payload?.data?.output;
			linkedEntities = payload?.data?.linkedEntities;
			if (!data) {
				throw new Error('Output not found');
			}

			const normalized: OutputRecord = {
				id: data.id,
				name: data.name ?? '',
				state_key: data.state_key ?? 'draft',
				type_key: data.type_key ?? '',
				description: data.description ?? '',
				props: data.props ?? {},
				created_at: data.created_at,
				updated_at: data.updated_at
			};

			output = normalized;
			stateKey = normalized.state_key;
			typeKey = normalized.type_key || 'output.default';
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to load output';
			loadError = message;
			toastService.error(message);
		} finally {
			isLoading = false;
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
			output = output ? { ...output, state_key: nextState } : output;
			toastService.success('State updated');
			onUpdated?.();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update state';
			toastService.error(message);
		} finally {
			savingState = false;
		}
	}

	async function handleTypeKeyChange(nextTypeKey: string) {
		if (nextTypeKey === typeKey) return;
		try {
			savingTypeKey = true;
			const response = await fetch(`/api/onto/outputs/${outputId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type_key: nextTypeKey })
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to update type');
			}
			typeKey = nextTypeKey;
			output = output ? { ...output, type_key: nextTypeKey } : output;
			toastService.success('Type updated');
			onUpdated?.();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update type';
			toastService.error(message);
		} finally {
			savingTypeKey = false;
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
		if (hasChanges) {
			loadOutput();
			hasChanges = false;
		}
	}

	function handleLinksChanged() {
		hasChanges = true;
	}

	// Chat about this output handlers
	async function openChatAbout() {
		if (!output || !projectId) return;
		await loadAgentChatModal();
		showChatModal = true;
	}

	function handleChatClose() {
		showChatModal = false;
	}
</script>

<Modal
	bind:isOpen
	onClose={closeModal}
	size="xl"
	closeOnBackdrop={false}
	closeOnEscape={!savingState}
	showCloseButton={false}
	customClasses="lg:!max-w-5xl"
>
	{#snippet header()}
		<!-- Compact Inkprint header with inline metadata -->
		<div class="flex-shrink-0 bg-muted/50 border-b border-border">
			<!-- Top row: Icon, Title, Actions -->
			<div class="flex items-center justify-between gap-2 px-3 py-2">
				<div class="flex items-center gap-2 min-w-0 flex-1">
					<div
						class="flex h-8 w-8 items-center justify-center rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0"
					>
						<Layers class="w-4 h-4" />
					</div>
					<div class="min-w-0 flex-1">
						<h2 class="text-sm font-semibold leading-tight truncate text-foreground">
							{output?.name || 'Output'}
						</h2>
						{#if output?.created_at}
							<p class="text-[10px] text-muted-foreground">
								Created {new Date(output.created_at).toLocaleDateString(undefined, {
									month: 'short',
									day: 'numeric'
								})}
								{#if output.updated_at && output.updated_at !== output.created_at}
									· Updated {new Date(output.updated_at).toLocaleDateString(undefined, {
										month: 'short',
										day: 'numeric'
									})}
								{/if}
							</p>
						{/if}
					</div>
				</div>
				<div class="flex items-center gap-1.5 shrink-0">
					<!-- Chat button -->
					<button
						type="button"
						onclick={openChatAbout}
						disabled={isLoading || savingState || !output}
						class="flex h-8 w-8 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
						title="Chat about this output"
					>
						<img
							src="/brain-bolt.png"
							alt="Chat"
							class="w-4 h-4 rounded object-cover"
						/>
					</button>
					<!-- Close button -->
					<button
						type="button"
						onclick={closeModal}
						disabled={savingState}
						class="flex h-8 w-8 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-red-500/50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
						aria-label="Close modal"
					>
						<X class="w-4 h-4" />
					</button>
				</div>
			</div>

			<!-- Metadata row: State + Type (compact inline) -->
			{#if output}
				<div class="flex items-center gap-2 px-3 pb-2">
					<div class="flex items-center gap-1.5 flex-1 min-w-0">
						<label for="output-state-select" class="text-[10px] text-muted-foreground uppercase tracking-wide shrink-0">
							State
						</label>
						<Select
							id="output-state-select"
							size="sm"
							value={stateKey}
							onchange={(val) => handleStateChange(String(val))}
							disabled={savingState}
							class="flex-1 min-w-0 text-xs h-7"
						>
							{#each stateOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</Select>
					</div>
					<div class="flex items-center gap-1.5 flex-1 min-w-0">
						<label for="output-type-select" class="text-[10px] text-muted-foreground uppercase tracking-wide shrink-0">
							Type
						</label>
						<Select
							id="output-type-select"
							size="sm"
							value={typeKey}
							onchange={(val) => handleTypeKeyChange(String(val))}
							disabled={savingTypeKey}
							class="flex-1 min-w-0 text-xs h-7"
						>
							{#each OUTPUT_TYPE_KEYS as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</Select>
					</div>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet children()}
		<div class="flex flex-col lg:flex-row h-full overflow-hidden" style="max-height: calc(100vh - 180px);">
			{#if isLoading}
				<div class="flex items-center justify-center py-12 w-full">
					<div class="animate-pulse text-muted-foreground text-sm">Loading editor…</div>
				</div>
			{:else if loadError}
				<div class="flex flex-col items-center justify-center gap-3 text-center px-6 py-12 w-full">
					<p class="text-muted-foreground text-sm">{loadError}</p>
					<Button variant="secondary" size="sm" onclick={loadOutput}>Try again</Button>
				</div>
			{:else if output}
				<!-- Main editor area -->
				<div class="flex-1 overflow-y-auto min-w-0">
					<div class="p-3">
						<DocumentEditor
							outputId={output.id}
							typeKey={output.type_key}
							initialContent={(output.props?.content as string) ?? ''}
							initialTitle={output.name}
							initialProps={output.props ?? {}}
							{projectId}
							onSave={handleContentSave}
						/>
					</div>
				</div>

				<!-- Details sidebar (desktop) / Collapsible section (mobile) -->
				<div class="lg:w-64 xl:w-72 border-t lg:border-t-0 lg:border-l border-border bg-muted/20 shrink-0">
					<!-- Mobile toggle -->
					<button
						type="button"
						onclick={() => (showDetails = !showDetails)}
						class="lg:hidden w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
					>
						<span class="flex items-center gap-2">
							<Link2 class="w-4 h-4 text-muted-foreground" />
							Details & Links
							{#if linkedCount > 0 || tagCount > 0}
								<span class="text-xs text-muted-foreground">
									({linkedCount + tagCount})
								</span>
							{/if}
						</span>
						{#if showDetails}
							<ChevronUp class="w-4 h-4 text-muted-foreground" />
						{:else}
							<ChevronDown class="w-4 h-4 text-muted-foreground" />
						{/if}
					</button>

					<!-- Details content -->
					<div class="hidden lg:block lg:p-3 lg:space-y-4 {showDetails ? '!block p-3 space-y-3 border-t border-border/50' : ''}">
						<!-- Linked Entities -->
						<LinkedEntities
							sourceId={outputId}
							sourceKind="output"
							{projectId}
							initialLinkedEntities={linkedEntities}
							onEntityClick={handleLinkedEntityClick}
							onLinksChanged={handleLinksChanged}
						/>

						<!-- Tags Display -->
						{#if hasTags}
							<div class="pt-2 border-t border-border">
								<TagsDisplay props={output.props} />
							</div>
						{/if}

						<!-- Metadata -->
						<div class="pt-2 border-t border-border space-y-1 text-[10px] text-muted-foreground">
							<div class="flex items-center justify-between">
								<span>Created</span>
								<span class="font-mono">
									{output.created_at
										? new Date(output.created_at).toLocaleDateString()
										: '—'}
								</span>
							</div>
							<div class="flex items-center justify-between">
								<span>Updated</span>
								<span class="font-mono">
									{output.updated_at
										? new Date(output.updated_at).toLocaleDateString()
										: '—'}
								</span>
							</div>
							<div class="flex items-start justify-between gap-2">
								<span class="shrink-0">ID</span>
								<span class="font-mono truncate text-right">{outputId}</span>
							</div>
						</div>
					</div>
				</div>
			{:else}
				<div class="flex items-center justify-center py-12 text-muted-foreground text-sm w-full">
					Unable to load editor for this output.
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<div class="flex items-center justify-between gap-2 px-3 py-2 border-t border-border bg-muted/30">
			<!-- Delete -->
			<Button
				variant="ghost"
				size="sm"
				onclick={() => (showDeleteConfirm = true)}
				class="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs px-2 h-8"
			>
				<Trash2 class="w-3.5 h-3.5" />
				<span class="hidden sm:inline ml-1">Delete</span>
			</Button>

			<!-- Close -->
			<Button
				type="button"
				variant="secondary"
				size="sm"
				onclick={closeModal}
				disabled={savingState}
				class="text-xs h-8"
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
	onconfirm={handleDelete}
	oncancel={() => (showDeleteConfirm = false)}
>
	{#snippet content()}
		<p class="text-sm text-muted-foreground">
			This removes the document and any references in the project. This action cannot be
			undone.
		</p>
	{/snippet}
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

<!-- Chat About Modal (Lazy Loaded) -->
{#if showChatModal && AgentChatModalComponent && entityFocus}
	{@const ChatModal = AgentChatModalComponent}
	<ChatModal isOpen={showChatModal} initialProjectFocus={entityFocus} onClose={handleChatClose} />
{/if}
