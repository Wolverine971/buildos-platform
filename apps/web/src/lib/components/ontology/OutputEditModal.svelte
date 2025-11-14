<!-- apps/web/src/lib/components/ontology/OutputEditModal.svelte -->
<script lang="ts">
	import { X, Trash2 } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import DocumentEditor from '$lib/components/ontology/DocumentEditor.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type { ResolvedTemplate } from '$lib/services/ontology/template-resolver.service';

	interface Props {
		outputId: string;
		projectId: string;
		onClose: () => void;
		onUpdated?: () => void;
		onDeleted?: () => void;
	}

	let { outputId, projectId, onClose, onUpdated, onDeleted }: Props = $props();

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

	$effect(() => {
		if (!outputId) return;
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

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			closeModal();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			closeModal();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="fixed inset-0 z-50 flex items-stretch">
	<div
		class="absolute inset-0 bg-black/50 backdrop-blur-sm"
		role="presentation"
		onclick={handleBackdropClick}
	></div>

	<div class="relative z-10 flex-1 flex flex-col bg-white dark:bg-gray-900 shadow-2xl">
		<header
			class="flex flex-col gap-3 sm:gap-4 border-b border-gray-200 dark:border-gray-800 px-4 sm:px-6 py-3 sm:py-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<div class="flex items-start gap-2.5 sm:gap-3">
				<button
					class="p-2 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 shrink-0"
					onclick={closeModal}
					aria-label="Close"
				>
					<X class="w-5 h-5" />
				</button>
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2 mb-1">
						<span class="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shrink-0"
						></span>
						<h2
							class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white truncate"
						>
							{output?.name || 'Text Document'}
						</h2>
					</div>
					<p class="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
						Type: <code
							class="font-mono text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded"
							>{output?.type_key}</code
						>
					</p>
				</div>
			</div>

			<div class="flex flex-wrap items-center gap-2.5">
				<div class="min-w-[140px]">
					<Select
						size="sm"
						value={stateKey}
						onchange={(val) => handleStateChange(String(val))}
						disabled={savingState}
						class="text-sm"
					>
						{#each stateOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</Select>
				</div>
				<Button
					variant="ghost"
					size="sm"
					class="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 transition-colors"
					onclick={() => (showDeleteConfirm = true)}
				>
					<Trash2 class="w-4 h-4 mr-1.5" />
					Delete
				</Button>
			</div>
		</header>

		<section class="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900">
			{#if isLoading}
				<div class="h-full flex items-center justify-center">
					<div class="animate-pulse text-gray-500 dark:text-gray-400">
						Loading editor…
					</div>
				</div>
			{:else if loadError}
				<div
					class="h-full flex flex-col items-center justify-center gap-3 text-center px-6"
				>
					<p class="text-gray-600 dark:text-gray-300">{loadError}</p>
					<Button variant="secondary" onclick={loadOutput}>Try again</Button>
				</div>
			{:else if output && resolvedTemplate}
				<div class="h-full flex flex-col">
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
					class="h-full flex items-center justify-center text-gray-500 dark:text-gray-400"
				>
					Unable to load editor for this output.
				</div>
			{/if}
		</section>
	</div>
</div>

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
