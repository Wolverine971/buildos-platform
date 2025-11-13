<!-- apps/web/src/lib/components/ontology/OntologyContextDocModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type { Document } from '$lib/types/onto';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { format } from 'date-fns/format';
	import { Copy, FileText, Clock } from 'lucide-svelte';

	interface Props {
		isOpen?: boolean;
		document: Document | null;
		projectName?: string;
		onClose?: () => void;
	}

	let { isOpen = $bindable(false), document, projectName = '', onClose }: Props = $props();

	const title = $derived(document ? `${document.title}` : 'Project Context Document');

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

	function formatTimestamp(value?: string | null): string | null {
		if (!value) return null;
		const parsed = new Date(value);
		if (isNaN(parsed.getTime())) return null;
		return format(parsed, 'PPP p');
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
				class="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 border border-green-200 dark:border-green-800 rounded-lg p-4 sm:p-5"
			>
				<div class="flex items-start justify-between gap-3 mb-3">
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2 mb-2">
							<FileText
								class="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0"
							/>
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								{document.title}
							</h3>
						</div>
						{#if projectName}
							<p class="text-sm text-gray-700 dark:text-gray-300 mb-1">
								<span class="font-medium">Project:</span>
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
					<Button
						type="button"
						onclick={copyContext}
						variant="ghost"
						size="sm"
						class="flex items-center gap-1.5 text-green-700 hover:text-green-900 dark:text-green-400 dark:hover:text-green-200 bg-white dark:bg-gray-800 border border-green-300 dark:border-green-700"
					>
						<Copy class="w-4 h-4" />
						<span class="hidden sm:inline">Copy</span>
					</Button>
				</div>
			</div>

			<!-- Document Content -->
			{#if renderedBody}
				<div
					class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 sm:p-6 max-h-[60vh] overflow-y-auto"
				>
					<div
						class="prose prose-sm sm:prose dark:prose-invert max-w-none leading-relaxed"
						data-testid="context-doc-body"
					>
						{@html renderedBody}
					</div>
				</div>

				<!-- Document Stats -->
				<div
					class="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400 px-2"
				>
					<span class="flex items-center gap-1">
						<span class="w-2 h-2 bg-green-500 rounded-full"></span>
						{docBody.length.toLocaleString()} characters
					</span>
					<span class="flex items-center gap-1">
						<span class="w-2 h-2 bg-blue-500 rounded-full"></span>
						{Math.ceil(docBody.length / 5)} words (approx)
					</span>
				</div>
			{:else}
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
