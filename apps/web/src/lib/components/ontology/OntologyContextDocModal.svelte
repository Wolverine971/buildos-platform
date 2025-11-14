<!-- apps/web/src/lib/components/ontology/OntologyContextDocModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import MarkdownToggleField from '$lib/components/ui/MarkdownToggleField.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type { Document } from '$lib/types/onto';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { format } from 'date-fns/format';
	import { Copy, FileText, Clock, Edit, Save, X } from 'lucide-svelte';

	interface Props {
		isOpen?: boolean;
		document: Document | null;
		projectName?: string;
		onClose?: () => void;
		onSaved?: (doc: Document) => void;
	}

	let {
		isOpen = $bindable(false),
		document,
		projectName = '',
		onClose,
		onSaved
	}: Props = $props();

	const title = $derived(document ? `${document.title}` : 'Project Context Document');

	// Edit mode state
	let isEditMode = $state(false);
	let editedBody = $state('');
	let isSaving = $state(false);

	const docBody = $derived.by(() => {
		if (!document) return '';
		const props = document.props ?? {};
		if (typeof props.body_markdown === 'string') {
			return props.body_markdown;
		}
		if (typeof props.content === 'string') {
			return props.content;
		}
		return '';
	});

	const renderedBody = $derived(docBody ? renderMarkdown(docBody) : '');

	// Initialize edit body when entering edit mode
	$effect(() => {
		if (isEditMode) {
			editedBody = docBody;
		}
	});

	function formatTimestamp(value?: string | null): string | null {
		if (!value) return null;
		const parsed = new Date(value);
		if (isNaN(parsed.getTime())) return null;
		return format(parsed, 'PPP p');
	}

	function toggleEditMode() {
		if (isEditMode) {
			// Cancel edit
			isEditMode = false;
			editedBody = '';
		} else {
			// Enter edit mode
			isEditMode = true;
			editedBody = docBody;
		}
	}

	async function saveChanges() {
		if (!document) return;

		// Check if content actually changed
		if (editedBody === docBody) {
			toastService.info('No changes to save');
			isEditMode = false;
			return;
		}

		try {
			isSaving = true;

			const response = await fetch(`/api/onto/documents/${document.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					props: {
						body_markdown: editedBody
					}
				})
			});

			const result = await response.json().catch(() => ({}));

			if (!response.ok) {
				throw new Error(result.error ?? 'Failed to update document');
			}

			const updatedDoc = result.document as Document;
			toastService.success('Context document updated');
			onSaved?.(updatedDoc);
			isEditMode = false;
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to update document';
			toastService.error(message);
		} finally {
			isSaving = false;
		}
	}

	async function copyContext() {
		if (!docBody) {
			toastService.add({
				type: 'info',
				message: 'No content to copy'
			});
			return;
		}

		try {
			await navigator.clipboard.writeText(docBody);
			toastService.add({
				type: 'success',
				message: 'Context copied to clipboard'
			});
		} catch (error) {
			toastService.add({
				type: 'error',
				message: 'Failed to copy context'
			});
		}
	}

	function handleClose() {
		if (isEditMode) {
			// Reset edit mode when closing
			isEditMode = false;
			editedBody = '';
		}
		onClose?.();
	}
</script>

<Modal bind:isOpen {title} size="xl" onClose={handleClose}>
	{#if !document}
		<div
			class="text-center py-12 px-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600"
		>
			<FileText class="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
			<p class="text-gray-600 dark:text-gray-300 text-lg font-medium mb-2">
				No Context Document
			</p>
			<p class="text-gray-500 dark:text-gray-400 text-sm">
				This project does not have a linked context document yet.
			</p>
		</div>
	{:else}
		<div class="space-y-4">
			<!-- Document Header -->
			<div
				class="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3 sm:p-4"
			>
				<div class="flex items-start justify-between gap-3 mb-2.5">
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2.5 mb-1.5">
							<span class="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"
							></span>
							<FileText
								class="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0"
							/>
							<h3
								class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white"
							>
								{document.title}
							</h3>
							{#if isEditMode}
								<span
									class="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded"
								>
									Editing
								</span>
							{/if}
						</div>
						{#if projectName}
							<p class="text-xs sm:text-sm text-gray-700 dark:text-gray-300 mb-1.5">
								<span class="font-semibold">Project:</span>
								{projectName}
							</p>
						{/if}
						<div
							class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400"
						>
							<span class="flex items-center gap-1">
								<span class="font-medium">Type:</span>
								<code
									class="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-mono"
								>
									{document.type_key}
								</code>
							</span>
							{#if formatTimestamp(document.updated_at)}
								<span class="flex items-center gap-1">
									<Clock class="w-3 h-3" />
									<span>Updated {formatTimestamp(document.updated_at)}</span>
								</span>
							{/if}
						</div>
					</div>
					<div class="flex items-center gap-2">
						{#if !isEditMode}
							<Button
								type="button"
								onclick={toggleEditMode}
								variant="ghost"
								size="sm"
								class="flex items-center gap-1.5 text-blue-700 hover:text-blue-900 hover:bg-blue-50 dark:text-blue-400 dark:hover:text-blue-200 dark:hover:bg-blue-900/20 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 transition-colors"
							>
								<Edit class="w-4 h-4" />
								<span class="hidden sm:inline">Edit</span>
							</Button>
							<Button
								type="button"
								onclick={copyContext}
								variant="ghost"
								size="sm"
								class="flex items-center gap-1.5 text-green-700 hover:text-green-900 hover:bg-green-50 dark:text-green-400 dark:hover:text-green-200 dark:hover:bg-green-900/20 bg-white dark:bg-gray-800 border border-green-300 dark:border-green-700 transition-colors"
							>
								<Copy class="w-4 h-4" />
								<span class="hidden sm:inline">Copy</span>
							</Button>
						{:else}
							<Button
								type="button"
								onclick={saveChanges}
								variant="primary"
								size="sm"
								disabled={isSaving}
								class="flex items-center gap-1.5"
							>
								<Save class="w-4 h-4" />
								<span class="hidden sm:inline"
									>{isSaving ? 'Saving...' : 'Save Changes'}</span
								>
							</Button>
							<Button
								type="button"
								onclick={toggleEditMode}
								variant="ghost"
								size="sm"
								disabled={isSaving}
								class="flex items-center gap-1.5 text-gray-700 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700/50 transition-colors"
							>
								<X class="w-4 h-4" />
								<span class="hidden sm:inline">Cancel</span>
							</Button>
						{/if}
					</div>
				</div>
			</div>

			<!-- Document Content -->
			{#if isEditMode}
				<!-- Edit Mode -->
				<div class="space-y-2.5">
					<div
						class="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-2.5"
					>
						<p class="text-sm text-blue-800 dark:text-blue-300 flex items-center gap-2">
							<span class="text-blue-500 dark:text-blue-400">✏️</span>
							<span
								><span class="font-semibold">Editing mode:</span> Make changes to the
								context document below. Use markdown for formatting.</span
							>
						</p>
					</div>
					<MarkdownToggleField
						value={editedBody}
						onUpdate={(newValue) => (editedBody = newValue)}
						placeholder="Enter context document content..."
						rows={20}
						class="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
					/>
					<div
						class="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-gray-500 dark:text-gray-400 px-1"
					>
						<span class="flex items-center gap-1.5">
							<span class="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
							<span class="font-medium">{editedBody.length.toLocaleString()}</span> characters
						</span>
						<span class="flex items-center gap-1.5">
							<span class="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
							<span class="font-medium">{Math.ceil(editedBody.length / 5)}</span> words
							(approx)
						</span>
					</div>
				</div>
			{:else if renderedBody}
				<!-- View Mode -->
				<div
					class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-5 max-h-[60vh] overflow-y-auto"
				>
					<div
						class="prose prose-sm sm:prose max-w-none leading-relaxed text-gray-700 dark:text-gray-300
						prose-headings:text-gray-900 dark:prose-headings:text-white
						prose-p:text-gray-700 dark:prose-p:text-gray-300
						prose-strong:text-gray-900 dark:prose-strong:text-white
						prose-a:text-blue-600 dark:prose-a:text-blue-400
						prose-blockquote:text-gray-700 dark:prose-blockquote:text-gray-300
						prose-code:text-gray-800 dark:prose-code:text-gray-200
						prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800
						prose-ul:text-gray-700 dark:prose-ul:text-gray-300
						prose-ol:text-gray-700 dark:prose-ol:text-gray-300
						prose-li:text-gray-700 dark:prose-li:text-gray-300"
						data-testid="context-doc-body"
					>
						{@html renderedBody}
					</div>
				</div>

				<!-- Document Stats -->
				<div
					class="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-gray-500 dark:text-gray-400 px-1"
				>
					<span class="flex items-center gap-1.5">
						<span class="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
						<span class="font-medium">{docBody.length.toLocaleString()}</span> characters
					</span>
					<span class="flex items-center gap-1.5">
						<span class="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
						<span class="font-medium">{Math.ceil(docBody.length / 5)}</span> words (approx)
					</span>
				</div>
			{:else}
				<!-- No Content -->
				<div
					class="text-center py-8 px-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
				>
					<p class="text-gray-600 dark:text-gray-300">
						No content available for this document.
					</p>
				</div>
			{/if}
		</div>
	{/if}
</Modal>

<style>
	/* Premium scrollbar styling for document content */
	:global(.modal-content .overflow-y-auto::-webkit-scrollbar) {
		width: 8px;
	}

	:global(.modal-content .overflow-y-auto::-webkit-scrollbar-track) {
		background: rgba(0, 0, 0, 0.05);
		border-radius: 4px;
	}

	:global(.modal-content .overflow-y-auto::-webkit-scrollbar-thumb) {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 4px;
	}

	:global(.modal-content .overflow-y-auto::-webkit-scrollbar-thumb:hover) {
		background: rgba(0, 0, 0, 0.3);
	}

	:global(.dark .modal-content .overflow-y-auto::-webkit-scrollbar-track) {
		background: rgba(255, 255, 255, 0.05);
	}

	:global(.dark .modal-content .overflow-y-auto::-webkit-scrollbar-thumb) {
		background: rgba(255, 255, 255, 0.2);
	}

	:global(.dark .modal-content .overflow-y-auto::-webkit-scrollbar-thumb:hover) {
		background: rgba(255, 255, 255, 0.3);
	}
</style>
