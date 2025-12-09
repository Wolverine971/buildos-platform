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

<Modal bind:isOpen size="xl" onClose={handleClose} showCloseButton={false}>
	{#snippet header()}
		<!-- Compact Inkprint header -->
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div class="p-1.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shrink-0">
					<FileText class="w-4 h-4" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{document?.title || 'Context Document'}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
						{projectName || 'Project context'}
					</p>
				</div>
			</div>
			<Button
				variant="ghost"
				size="sm"
				onclick={handleClose}
				class="text-muted-foreground hover:text-foreground shrink-0 !p-1 sm:!p-1.5"
				disabled={isSaving}
			>
				<X class="w-4 h-4" />
			</Button>
		</div>
	{/snippet}

	{#snippet children()}
		{#if !document}
			<div
				class="text-center py-12 px-4 bg-muted/30 rounded border-2 border-dashed border-border"
			>
				<FileText class="w-16 h-16 text-muted-foreground mx-auto mb-4" />
				<p class="text-foreground text-lg font-medium mb-2">No Context Document</p>
				<p class="text-muted-foreground text-sm">
					This project does not have a linked context document yet.
				</p>
			</div>
		{:else}
			<div class="space-y-4">
				<!-- Document Header -->
				<div
					class="bg-card border border-border rounded p-3 sm:p-4 shadow-ink tx tx-frame tx-weak"
				>
					<div class="flex items-start justify-between gap-3 mb-2.5">
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2.5 mb-1.5">
								<span class="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"
								></span>
								<FileText class="w-5 h-5 text-accent flex-shrink-0" />
								<h3 class="text-base sm:text-lg font-semibold text-foreground">
									{document.title}
								</h3>
								{#if isEditMode}
									<span
										class="px-2 py-0.5 text-xs font-medium bg-accent/20 text-accent-foreground rounded"
									>
										Editing
									</span>
								{/if}
							</div>
							{#if projectName}
								<p class="text-xs sm:text-sm text-foreground mb-1.5">
									<span class="font-semibold">Project:</span>
									{projectName}
								</p>
							{/if}
							<div
								class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
							>
								<span class="flex items-center gap-1">
									<span class="font-medium">Type:</span>
									<code class="px-2 py-0.5 bg-muted rounded font-mono">
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
									variant="secondary"
									size="sm"
									class="flex items-center gap-1.5"
								>
									<Edit class="w-4 h-4" />
									<span class="hidden sm:inline">Edit</span>
								</Button>
								<Button
									type="button"
									onclick={copyContext}
									variant="ghost"
									size="sm"
									class="flex items-center gap-1.5"
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
									class="flex items-center gap-1.5"
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
							class="bg-accent/10 border border-accent/30 rounded-lg p-2.5 tx tx-bloom tx-weak"
						>
							<p class="text-sm text-foreground flex items-center gap-2">
								<span class="text-accent">✏️</span>
								<span
									><span class="font-semibold">Editing mode:</span> Make changes to
									the context document below. Use markdown for formatting.</span
								>
							</p>
						</div>
						<MarkdownToggleField
							value={editedBody}
							onUpdate={(newValue) => (editedBody = newValue)}
							placeholder="Enter context document content..."
							rows={20}
						/>
						<div
							class="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-muted-foreground px-1"
						>
							<span class="flex items-center gap-1.5">
								<span class="w-1.5 h-1.5 bg-accent rounded-full"></span>
								<span class="font-medium">{editedBody.length.toLocaleString()}</span
								> characters
							</span>
							<span class="flex items-center gap-1.5">
								<span class="w-1.5 h-1.5 bg-accent rounded-full"></span>
								<span class="font-medium">{Math.ceil(editedBody.length / 5)}</span> words
								(approx)
							</span>
						</div>
					</div>
				{:else if renderedBody}
					<!-- View Mode -->
					<div
						class="bg-card border border-border rounded-lg p-3 sm:p-5 max-h-[60vh] overflow-y-auto"
					>
						<div
							class="prose prose-sm sm:prose max-w-none leading-relaxed text-foreground
						prose-headings:text-foreground
						prose-p:text-foreground
						prose-strong:text-foreground
						prose-a:text-accent
						prose-blockquote:text-muted-foreground
						prose-code:text-foreground
						prose-pre:bg-muted
						prose-ul:text-foreground
						prose-ol:text-foreground
						prose-li:text-foreground"
							data-testid="context-doc-body"
						>
							{@html renderedBody}
						</div>
					</div>

					<!-- Document Stats -->
					<div
						class="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-muted-foreground px-1"
					>
						<span class="flex items-center gap-1.5">
							<span class="w-1.5 h-1.5 bg-accent rounded-full"></span>
							<span class="font-medium">{docBody.length.toLocaleString()}</span> characters
						</span>
						<span class="flex items-center gap-1.5">
							<span class="w-1.5 h-1.5 bg-accent rounded-full"></span>
							<span class="font-medium">{Math.ceil(docBody.length / 5)}</span> words (approx)
						</span>
					</div>
				{:else}
					<!-- No Content -->
					<div class="text-center py-8 px-4 bg-muted/30 rounded-lg border border-border">
						<p class="text-muted-foreground">No content available for this document.</p>
					</div>
				{/if}
			</div>
		{/if}
	{/snippet}
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
