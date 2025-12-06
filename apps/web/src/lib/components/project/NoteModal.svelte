<!-- apps/web/src/lib/components/project/NoteModal.svelte -->
<script lang="ts">
	import FormModal from '$lib/components/ui/FormModal.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { Note } from '$lib/types/project';
	import { formatDateTimeForDisplay } from '$lib/utils/date-utils';

	interface Props {
		isOpen?: boolean;
		note?: Partial<Note> | null;
		projectId: string;
		onSave?: (note: Partial<Note>) => void;
		onDelete?: (id: string) => void;
		onClose?: () => void;
	}

	let {
		isOpen = $bindable(false),
		note = null,
		projectId,
		onSave,
		onDelete,
		onClose
	}: Props = $props();

	// Computed values using $derived
	let isEditing = $derived(note !== null && !!note?.id);
	let modalTitle = $derived(isEditing ? 'Edit Note' : 'Create New Note');
	let submitText = $derived(isEditing ? 'Save Note' : 'Create Note');
	let loadingText = $derived(isEditing ? 'Saving...' : 'Creating...');

	// Form configuration (empty since we handle fields manually)
	const noteFormConfig = {};

	// Set initial data with proper defaults using $derived
	let initialData = $derived(
		note || {
			title: '',
			content: '',
			category: '',
			tags: []
		}
	);

	// State for main content fields using $state
	let titleValue = $state('');
	let contentValue = $state('');
	let categoryValue = $state('');
	let tagsValue = $state<string[]>([]);
	let tagInput = $state('');

	// Category options
	const categoryOptions = [
		{ value: '', label: 'Select category...' },
		{ value: 'insight', label: 'Insight' },
		{ value: 'research', label: 'Research' },
		{ value: 'idea', label: 'Idea' },
		{ value: 'observation', label: 'Observation' },
		{ value: 'reference', label: 'Reference' },
		{ value: 'question', label: 'Question' }
	];

	// Initialize content fields when note changes using $effect
	$effect(() => {
		if (note) {
			titleValue = note.title || '';
			contentValue = note.content || '';
			categoryValue = note.category || '';
			tagsValue = note.tags || [];
		} else if (!isOpen) {
			titleValue = '';
			contentValue = '';
			categoryValue = '';
			tagsValue = [];
		}
	});

	// Auto-resize textarea
	function autoResize(textarea: HTMLTextAreaElement) {
		textarea.style.height = 'auto';
		textarea.style.height = textarea.scrollHeight + 'px';
	}

	// Tag management
	function handleTagKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && tagInput.trim()) {
			event.preventDefault();
			if (!tagsValue.includes(tagInput.trim())) {
				tagsValue = [...tagsValue, tagInput.trim()];
			}
			tagInput = '';
		}
	}

	function removeTag(tagToRemove: string) {
		tagsValue = tagsValue.filter((tag) => tag !== tagToRemove);
	}

	// Handle form submission with optimistic updates
	async function handleSubmit(_formData: Record<string, any>): Promise<void> {
		// Validate title
		if (!titleValue.trim()) {
			throw new Error('Title is required');
		}

		// Use local state values instead of form data
		const noteData: Partial<Note> = {
			title: titleValue.trim(),
			content: contentValue.trim(),
			category: categoryValue || '',
			tags: tagsValue || [],
			project_id: projectId
		};

		if (isEditing && note?.id) {
			noteData.id = note.id;
		}

		// Delegate note persistence to parent so it can manage optimistic store updates
		onSave?.(noteData);
	}

	// Handle deletion with optimistic updates
	async function handleDelete(_id: string): Promise<void> {
		if (!isEditing || !note?.id) {
			throw new Error('Cannot delete note: Invalid note ID.');
		}

		onDelete?.(note.id);
	}

	function close() {
		onClose?.();
	}
</script>

<FormModal
	{isOpen}
	title={modalTitle}
	{submitText}
	{loadingText}
	formConfig={noteFormConfig}
	{initialData}
	onSubmit={handleSubmit}
	onDelete={isEditing ? handleDelete : null}
	onClose={close}
	size="xl"
>
	<!-- Custom content layout using slots -->
	{#snippet afterForm()}
		<div class="space-y-6 -mt-4 px-4 sm:px-6 lg:px-8">
			<!-- Main Content Area -->
			<div class="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 min-h-[40vh] flex-1">
				<!-- Content Section (Takes most space) -->
				<div class="lg:col-span-3 flex flex-col space-y-4 min-h-0">
					<!-- Title -->
					<FormField label="Title" labelFor="note-title" required={true}>
						<TextInput
							id="note-title"
							bind:value={titleValue}
							placeholder="Note title..."
							size="lg"
							class="font-semibold"
						/>
					</FormField>

					<!-- Content -->
					<div class="flex-1 flex flex-col">
						<FormField
							label="Content"
							labelFor="note-content"
							class="flex-1 flex flex-col"
						>
							<Textarea
								id="note-content"
								bind:value={contentValue}
								placeholder="Start writing your note..."
								autoResize={true}
								rows={8}
								maxRows={20}
								class="flex-1 leading-relaxed"
							/>
						</FormField>
					</div>

					<!-- Content Stats -->
					<div
						class="text-sm text-gray-500 dark:text-gray-400 flex justify-between items-center"
					>
						<span>
							{#if contentValue.length > 0}
								{contentValue.length} characters
							{:else}
								Start typing to add content...
							{/if}
						</span>
						{#if titleValue.length > 0}
							<span>{titleValue.length} characters in title</span>
						{/if}
					</div>
				</div>

				<!-- Metadata Sidebar -->
				<div
					class="lg:col-span-1 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 sm:p-4 space-y-3 sm:space-y-4 border border-gray-200 dark:border-gray-700 order-first lg:order-last"
				>
					<h3
						class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide"
					>
						Metadata
					</h3>

					<!-- Category -->
					<FormField label="Category" labelFor="note-category">
						<Select
							id="note-category"
							bind:value={categoryValue}
							size="sm"
							placeholder="Select category..."
						>
							{#each categoryOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</Select>
					</FormField>

					<!-- Tags -->
					<FormField label="Tags" labelFor="note-tags" hint="Press Enter to add a tag">
						<!-- Tags Display -->
						{#if tagsValue.length > 0}
							<div class="flex flex-wrap gap-1 mb-2">
								{#each tagsValue as tag}
									<Button
										type="button"
										onclick={() => removeTag(tag)}
										variant="outline"
										size="sm"
										class="m-1 p-1 text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100 min-h-[24px]"
									>
										{tag}
										<svg
											class="w-3 h-3"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
									</Button>
								{/each}
							</div>
						{/if}

						<!-- Tag Input -->
						<TextInput
							id="note-tags"
							bind:value={tagInput}
							onkeydown={handleTagKeydown}
							placeholder="Add tags (press Enter)..."
							size="sm"
						/>
					</FormField>

					<!-- Creation/Update Info (if editing) -->
					{#if isEditing && note}
						<hr class="border-gray-200 dark:border-gray-700" />
						<div class="space-y-2 text-xs text-gray-600 dark:text-gray-400">
							{#if note.created_at}
								<div>
									<span class="font-medium">Created:</span>
									<br />
									{formatDateTimeForDisplay(note.created_at)}
								</div>
							{/if}
							{#if note.updated_at}
								<div>
									<span class="font-medium">Updated:</span>
									<br />
									{formatDateTimeForDisplay(note.updated_at)}
								</div>
							{/if}
						</div>
					{/if}

					<!-- Content Preview -->
					<div class="space-y-2">
						<h4
							class="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wide"
						>
							Preview
						</h4>
						<div
							class="text-xs p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded text-gray-600 dark:text-gray-400 max-h-32 overflow-y-auto"
						>
							{#if contentValue.trim()}
								{contentValue.slice(0, 150)}{contentValue.length > 150 ? '...' : ''}
							{:else}
								<em>No content yet...</em>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</div>
	{/snippet}
</FormModal>
