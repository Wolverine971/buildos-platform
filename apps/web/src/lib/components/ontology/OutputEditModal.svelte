<!-- apps/web/src/lib/components/ontology/OutputEditModal.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { Trash2, Layers, X } from 'lucide-svelte';
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
	import TextInput from '$lib/components/ui/TextInput.svelte';

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
	};

	let output = $state<OutputRecord | null>(null);
	let name = $state('');
	let description = $state('');
	let typeKey = $state('output.default');
	let linkedEntities = $state<LinkedEntitiesResult | undefined>(undefined);
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);
	let savingName = $state(false);
	let savingState = $state(false);
	let savingDescription = $state(false);
	let savingTypeKey = $state(false);
	let deleting = $state(false);
	let showDeleteConfirm = $state(false);
	let stateKey = $state('draft');
	let previousOutputId = $state<string | null>(null);
	let hasChanges = $state(false);

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

			// Use /full endpoint for optimized single-request loading
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
				props: data.props ?? {}
			};

			output = normalized;
			name = normalized.name;
			stateKey = normalized.state_key;
			typeKey = normalized.type_key || 'output.default';
			description = (data.description as string) ?? '';
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

	async function handleNameSave() {
		if (!output || name === output.name) return;
		try {
			savingName = true;
			const response = await fetch(`/api/onto/outputs/${outputId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: name.trim() })
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to update name');
			}
			output = output ? { ...output, name: name.trim() } : output;
			toastService.success('Name updated');
			onUpdated?.();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update name';
			toastService.error(message);
		} finally {
			savingName = false;
		}
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

	async function handleDescriptionSave() {
		if (!output) return;
		try {
			savingDescription = true;
			const response = await fetch(`/api/onto/outputs/${outputId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ description: description.trim() || null })
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to update description');
			}
			output = { ...output, description: description.trim() || null };
			toastService.success('Description saved');
			onUpdated?.();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update description';
			toastService.error(message);
		} finally {
			savingDescription = false;
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
					state_key: stateKey,
					description: description.trim() || null
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
						props: data.props,
						description: description.trim() || null
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
		// Smart refresh: only reload if links were changed
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
			<div class="flex items-center gap-1.5">
				<!-- Chat about this output button -->
				<Button
					variant="ghost"
					size="sm"
					onclick={openChatAbout}
					class="text-muted-foreground hover:text-foreground shrink-0 !p-1.5 sm:!p-2 tx tx-grain tx-weak"
					disabled={isLoading || savingState || !output}
					title="Chat about this output"
				>
					<img
						src="/brain-bolt.png"
						alt="Chat about this output"
						class="w-4 h-4 sm:w-5 sm:h-5 rounded object-cover"
					/>
				</Button>
				<!-- Inkprint close button -->
				<button
					type="button"
					onclick={closeModal}
					disabled={savingState}
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:border-red-600/50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:hover:border-red-400/50 dark:hover:text-red-400"
					aria-label="Close modal"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="overflow-y-auto" style="max-height: 70vh;">
			{#if isLoading}
				<div class="flex items-center justify-center py-12">
					<div class="animate-pulse text-muted-foreground">Loading editor…</div>
				</div>
			{:else if loadError}
				<div class="flex flex-col items-center justify-center gap-3 text-center px-6 py-12">
					<p class="text-muted-foreground">{loadError}</p>
					<Button variant="secondary" onclick={loadOutput}>Try again</Button>
				</div>
			{:else if output}
				<div class="px-4 sm:px-6 py-6">
					<!-- Output Name Section -->
					<section
						class="rounded border border-border bg-muted/30 p-4 sm:p-5 shadow-ink space-y-3 tx tx-grain tx-weak mb-6"
					>
						<div class="flex items-center justify-between gap-2">
							<label
								for="output-name"
								class="flex items-center gap-2 text-sm font-medium text-foreground"
							>
								<span class="w-1.5 h-1.5 bg-accent rounded-full animate-pulse shrink-0"></span>
								Output Name
							</label>
							<Button
								size="sm"
								variant="secondary"
								onclick={handleNameSave}
								disabled={savingName || name === output.name}
								loading={savingName}
							>
								Save name
							</Button>
						</div>
						<TextInput
							id="output-name"
							bind:value={name}
							placeholder="Enter output name"
							size="sm"
							disabled={savingName}
							class="font-medium"
						/>
					</section>

					<!-- State & Type Grid -->
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
						<!-- State Selector -->
						<div>
							<label
								for="output-state"
								class="block text-sm font-medium text-foreground mb-2"
							>
								State
							</label>
							<Select
								id="output-state"
								size="sm"
								value={stateKey}
								onchange={(val) => handleStateChange(String(val))}
								disabled={savingState}
							>
								{#each stateOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</Select>
						</div>

						<!-- Type Selector -->
						<div>
							<label
								for="output-type"
								class="block text-sm font-medium text-foreground mb-2"
							>
								Type
							</label>
							<Select
								id="output-type"
								size="sm"
								value={typeKey}
								onchange={(val) => handleTypeKeyChange(String(val))}
								disabled={savingTypeKey}
							>
								{#each OUTPUT_TYPE_KEYS as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</Select>
						</div>
					</div>

					<!-- Description -->
					<div class="mb-6 space-y-2">
						<div class="flex items-center justify-between gap-2">
							<label
								for="output-description"
								class="block text-sm font-medium text-foreground"
							>
								Description
							</label>
							<Button
								size="sm"
								variant="secondary"
								onclick={handleDescriptionSave}
								disabled={savingDescription}
								loading={savingDescription}
							>
								Save description
							</Button>
						</div>
						<textarea
							id="output-description"
							class="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
							rows="3"
							bind:value={description}
							placeholder="What does this output cover?"
						></textarea>
					</div>

					<!-- Linked Entities -->
					<div class="mb-6">
						<LinkedEntities
							sourceId={outputId}
							sourceKind="output"
							{projectId}
							initialLinkedEntities={linkedEntities}
							onEntityClick={handleLinkedEntityClick}
							onLinksChanged={handleLinksChanged}
						/>
					</div>

					<!-- Tags Display -->
					{#if output?.props?.tags?.length}
						<div class="mb-6">
							<TagsDisplay props={output.props} />
						</div>
					{/if}

					<!-- Document Editor -->
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
			{:else}
				<div class="flex items-center justify-center py-12 text-muted-foreground">
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
	onconfirm={handleDelete}
	oncancel={() => (showDeleteConfirm = false)}
>
	{#snippet content()}
		<p class="text-sm text-muted-foreground">
			This removes the text document and any references in the project. This action cannot be
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
