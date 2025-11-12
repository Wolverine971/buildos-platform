<!-- apps/web/src/lib/components/ontology/OntologyContextDocModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import type { Document } from '$lib/types/onto';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { format } from 'date-fns/format';

	interface Props {
		isOpen?: boolean;
		document: Document | null;
		projectName?: string;
		onClose?: () => void;
	}

	let { isOpen = $bindable(false), document, projectName = '', onClose }: Props = $props();

	const title = $derived(
		document ? `${document.title} • Context Document` : 'Project Context Document'
	);

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

	function handleClose() {
		onClose?.();
	}
</script>

<Modal bind:isOpen {title} size="lg" onClose={handleClose}>
	{#if !document}
		<p class="text-gray-600 dark:text-gray-300">
			This project does not have a linked context document yet.
		</p>
	{:else}
		<div class="space-y-6">
			<div class="space-y-2">
				<p class="text-sm font-medium text-gray-900 dark:text-white">{document.title}</p>
				<p class="text-xs text-gray-500 dark:text-gray-400">
					Type: <span class="font-mono">{document.type_key}</span>
					{#if formatTimestamp(document.updated_at)}
						• Updated {formatTimestamp(document.updated_at)}
					{/if}
				</p>
				{#if projectName}
					<p class="text-xs text-gray-500 dark:text-gray-400">
						Project: {projectName}
					</p>
				{/if}
			</div>
			{#if renderedBody}
				<div
					class="prose dark:prose-invert max-w-none prose-sm"
					data-testid="context-doc-body"
				>
					{@html renderedBody}
				</div>
			{:else}
				<p class="text-gray-600 dark:text-gray-300">
					No content available for this document.
				</p>
			{/if}
		</div>
	{/if}
</Modal>
