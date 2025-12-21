<!-- apps/web/src/lib/components/project/NotesSection.svelte -->
<script lang="ts">
	import { Plus, FileText, Edit3, Trash2, ChevronDown, ChevronUp } from 'lucide-svelte';
	import { formatters, withLoadingState } from '$lib/utils/componentOptimization';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { Note } from '$lib/types/project';
	import { renderMarkdown, getMarkdownPreview } from '$lib/utils/markdown';
	import { projectStoreV2 } from '$lib/stores/project.store';

	// Props - only callbacks and configuration (following the standard pattern)
	export let onCreateNote: () => void;
	export let onDeleteNote: (note: Note) => Promise<boolean | void>;
	export let onEditNote: (note: Note) => void;

	// Get data from store (following the standard pattern like TasksList and PhasesSection)
	$: storeState = $projectStoreV2;
	$: notes = storeState.notes || [];

	// Get project service instance

	// Simple state management - no complex caching
	let expandedNoteIds: string[] = [];
	let loading = false;

	// Modal state for delete confirmation
	let deleteModalOpen = false;
	let deleteModalLoading = false;
	let deleteModalData: Note | null = null;

	// Modal state management functions
	function openDeleteModal(note: Note) {
		deleteModalData = note;
		deleteModalOpen = true;
		// deleteModalError = null;
		deleteModalLoading = false;
	}

	function closeDeleteModal() {
		deleteModalData = null;
		deleteModalOpen = false;
		// deleteModalError = null;
		deleteModalLoading = false;
	}

	function setDeleteModalLoading(loading: boolean) {
		deleteModalLoading = loading;
	}

	function setDeleteModalError(error: string | null) {
		// deleteModalError = error;
		deleteModalLoading = false;
	}

	// Simple expansion state management using array
	function toggleNoteExpansion(noteId: string) {
		if (expandedNoteIds.includes(noteId)) {
			expandedNoteIds = expandedNoteIds.filter((id) => id !== noteId);
		} else {
			expandedNoteIds = [...expandedNoteIds, noteId];
		}
	}

	function isNoteExpanded(noteId: string): boolean {
		return expandedNoteIds.includes(noteId);
	}

	// Simple content analysis - no caching needed for this
	function shouldShowExpandButton(content: string): boolean {
		return content.length > 300 || content.split('\n\n').length > 2;
	}

	// Simple date formatting - let the browser handle caching
	function formatDate(dateString: string): string {
		if (dateString) {
			return formatters.dateTime.format(new Date(dateString));
		}
		return '';
	}

	// Content rendering - simple and direct
	function getDisplayContent(note: Note): string {
		if (!note.content) return '';

		const isExpanded = isNoteExpanded(note.id);

		if (isExpanded) {
			return renderMarkdown(note.content);
		} else {
			return getMarkdownPreview(note.content);
		}
	}

	// Delete operation
	function handleDeleteNote(note: Note) {
		openDeleteModal(note);
	}

	async function confirmDeleteNote() {
		if (!deleteModalData) return;

		const note = deleteModalData;
		const success = await withLoadingState(
			async () => {
				const result = await onDeleteNote(note);
				if (result === false) {
					throw new Error('Failed to delete note');
				}
				return true;
			},
			setDeleteModalLoading,
			(error) => {
				setDeleteModalError(error.message);
			}
		);

		if (success) {
			closeDeleteModal();
			// Remove from expanded notes if it was expanded
			expandedNoteIds = expandedNoteIds.filter((id) => id !== note.id);
		}
	}

	function cancelDeleteNote() {
		closeDeleteModal();
	}

	// Simple computed values
	$: hasNotes = notes.length > 0;

	// Clean up expanded notes that no longer exist
	$: {
		const noteIds = new Set(notes.map((n) => n.id));
		expandedNoteIds = expandedNoteIds.filter((id) => noteIds.has(id));
	}
</script>

<div class="flex items-center justify-between mb-6">
	<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Notes</h2>
	<Button onclick={onCreateNote} variant="primary" size="sm">
		<Plus class="w-4 h-4 mr-2" />
		Add Note
	</Button>
</div>

{#if hasNotes}
	<div class="space-y-4">
		{#each notes as note (note.id)}
			{@const isExpanded = isNoteExpanded(note.id)}
			{@const shouldShowExpand = shouldShowExpandButton(note.content || '')}
			{@const hasContent = Boolean(note.content)}
			{@const displayContent = getDisplayContent(note)}
			{@const formattedCreatedAt = note.created_at ? formatDate(note.created_at) : null}
			{@const formattedUpdatedAt = note?.updated_at ? formatDate(note.updated_at) : null}
			{@const hasUpdatedDate = note.updated_at && note.updated_at !== note.created_at}
			{@const visibleTags = note.tags ? note.tags.slice(0, 5) : []}
			{@const extraTagsCount = note.tags ? Math.max(0, note.tags.length - 5) : 0}

			<div
				class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-sm hover:shadow-md dark:hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-black/20 transition-all duration-200"
			>
				<div
					class="p-4 sm:p-5 {isExpanded
						? ''
						: 'hover:bg-gray-50/50 dark:hover:bg-gray-700/30'} transition-colors duration-150"
				>
					<!-- Mobile: Stack vertically, Desktop: Side by side -->
					<div
						class="flex flex-col sm:flex-row sm:items-start sm:justify-between sm:gap-4"
					>
						<!-- Header section with title, category, and actions -->
						<div
							class="flex items-start justify-between gap-3 mb-3 sm:mb-0 sm:flex-1 sm:min-w-0"
						>
							<div class="flex-1">
								<h3
									class="font-semibold text-base sm:text-lg text-gray-900 dark:text-gray-100 leading-tight"
								>
									{note.title}
								</h3>
								{#if note.category}
									<p
										class="text-sm text-gray-600 dark:text-gray-400 mt-1 font-medium"
									>
										<span class="text-gray-500 dark:text-gray-500"
											>Category:</span
										>
										{note.category}
									</p>
								{/if}
							</div>

							<!-- Action buttons - always visible on mobile, right-aligned on desktop -->
							<div class="flex items-center space-x-1 flex-shrink-0">
								<Button
									onclick={() => onEditNote(note)}
									variant="ghost"
									size="sm"
									title="Edit note"
								>
									<Edit3 class="w-4 h-4" />
								</Button>
								<Button
									onclick={() => handleDeleteNote(note)}
									disabled={loading || deleteModalLoading}
									variant="ghost"
									size="sm"
									class="text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
									title="Delete note"
								>
									<Trash2 class="w-4 h-4" />
								</Button>
							</div>
						</div>
					</div>

					<!-- Content section - full width on mobile -->
					<div class="mt-3 sm:mt-3">
						{#if note.tags && note.tags.length > 0}
							<div class="flex flex-wrap gap-1.5 sm:gap-2 mb-3">
								{#each visibleTags as tag}
									<span
										class="inline-flex items-center px-2 sm:px-2.5 py-0.5 sm:py-1 text-xs text-center font-medium rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
									>
										{tag}
									</span>
								{/each}
								{#if extraTagsCount > 0}
									<span
										class="inline-flex items-center px-2 sm:px-2.5 py-0.5 sm:py-1 text-xs text-center font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600"
									>
										+{extraTagsCount} more
									</span>
								{/if}
							</div>
						{/if}

						{#if hasContent}
							<div class="relative">
								<div class="text-sm sm:text-base text-gray-600 dark:text-gray-400">
									{@html displayContent}
								</div>

								{#if shouldShowExpand}
									<Button
										onclick={() => toggleNoteExpansion(note.id)}
										variant="ghost"
										size="sm"
										class="mt-2 sm:mt-3 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
									>
										{#if isExpanded}
											<ChevronUp class="w-4 h-4 mr-1" />
											Show less
										{:else}
											<ChevronDown class="w-4 h-4 mr-1" />
											Show more
										{/if}
									</Button>
								{/if}
							</div>
						{:else}
							<div class="text-sm text-gray-500 dark:text-gray-400 italic py-2">
								No content available
							</div>
						{/if}

						<div
							class="flex flex-col sm:flex-row sm:items-center mt-3 sm:mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 space-y-1 sm:space-y-0"
						>
							<span class="font-medium">Created {formattedCreatedAt}</span>
							{#if hasUpdatedDate}
								<span class="hidden sm:inline ml-3 text-gray-400 dark:text-gray-500"
									>•</span
								>
								<span class="sm:ml-3">Updated {formattedUpdatedAt}</span>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/each}
	</div>
{:else}
	<div
		class="text-center py-16 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50/30 dark:bg-gray-800/30"
	>
		<FileText class="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
		<p class="text-gray-600 dark:text-gray-400 mb-6 font-medium">No notes yet</p>
		<Button onclick={onCreateNote} variant="outline" size="sm">
			<Plus class="w-4 h-4 mr-2" />
			Create first note
		</Button>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
<ConfirmationModal
	isOpen={deleteModalOpen}
	title="Delete Note"
	confirmText="Delete"
	cancelText="Cancel"
	confirmVariant="danger"
	icon="danger"
	loading={deleteModalLoading}
	onconfirm={confirmDeleteNote}
	oncancel={cancelDeleteNote}
>
	{#snippet content()}
		{#if deleteModalData}
			<p class="text-sm text-gray-600 dark:text-gray-400">
				Are you sure you want to delete this note? This action cannot be undone.
			</p>
		{/if}
	{/snippet}
	{#snippet details()}
		<div class="mt-3">
			{#if deleteModalData}
				<p
					class="text-xs text-gray-500 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 p-2 rounded border"
				>
					<span class="font-medium">Note:</span>
					{deleteModalData.title}
				</p>
			{/if}
		</div>
	{/snippet}
</ConfirmationModal>

<style>
	/* Enhanced prose styling for better dark mode support */
	:global(.dark .prose-gray) {
		--tw-prose-body: theme('colors.gray.300');
		--tw-prose-headings: theme('colors.gray.100');
		--tw-prose-lead: theme('colors.gray.400');
		--tw-prose-links: theme('colors.blue.400');
		--tw-prose-bold: theme('colors.gray.100');
		--tw-prose-counters: theme('colors.gray.400');
		--tw-prose-bullets: theme('colors.gray.600');
		--tw-prose-hr: theme('colors.gray.700');
		--tw-prose-quotes: theme('colors.gray.300');
		--tw-prose-quote-borders: theme('colors.gray.700');
		--tw-prose-captions: theme('colors.gray.400');
		--tw-prose-code: theme('colors.pink.400');
		--tw-prose-pre-code: theme('colors.gray.200');
		--tw-prose-pre-bg: theme('colors.gray.900');
		--tw-prose-th-borders: theme('colors.gray.600');
		--tw-prose-td-borders: theme('colors.gray.700');
	}

	/* Light mode prose enhancements */
	:global(.prose-gray) {
		--tw-prose-body: theme('colors.gray.700');
		--tw-prose-headings: theme('colors.gray.900');
		--tw-prose-lead: theme('colors.gray.600');
		--tw-prose-links: theme('colors.blue.600');
		--tw-prose-bold: theme('colors.gray.900');
		--tw-prose-counters: theme('colors.gray.500');
		--tw-prose-bullets: theme('colors.gray.400');
		--tw-prose-hr: theme('colors.gray.300');
		--tw-prose-quotes: theme('colors.gray.700');
		--tw-prose-quote-borders: theme('colors.gray.300');
		--tw-prose-captions: theme('colors.gray.500');
		--tw-prose-code: theme('colors.pink.600');
		--tw-prose-pre-code: theme('colors.gray.800');
		--tw-prose-pre-bg: theme('colors.gray.50');
		--tw-prose-th-borders: theme('colors.gray.300');
		--tw-prose-td-borders: theme('colors.gray.200');
	}
</style>
