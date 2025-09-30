<!-- apps/web/src/routes/projects/[id]/notes/[noteId]/+page.svelte -->
<script lang="ts">
	import {
		ArrowLeft,
		Settings,
		FileText,
		Tag,
		Save,
		BookOpen,
		Hash,
		Calendar,
		Eye
	} from 'lucide-svelte';
	import { invalidate } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import ProjectContextModal from '$lib/components/project/ProjectContextModal.svelte';
	import { ProjectService } from '$lib/services/projectService';
	import type { PageData } from './$types';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { onMount } from 'svelte';

	export let data: PageData;

	// Get project service instance
	const projectService = ProjectService.getInstance();

	// Modal state
	let showProjectContextModal = false;

	// Reactive values
	$: project = data.project;
	$: note = data.note;
	$: projectId = data.project?.id;

	let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	// Editable fields state
	let titleValue = '';
	let contentValue = '';
	let categoryValue = '';
	let tagsValue: string[] = [];
	let tagInput = '';

	// Editing state
	let savingField: string | null = null;

	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});

	// Category options
	const categoryOptions = [
		{ value: '', label: 'No category' },
		{ value: 'insight', label: 'Insight' },
		{ value: 'research', label: 'Research' },
		{ value: 'idea', label: 'Idea' },
		{ value: 'observation', label: 'Observation' },
		{ value: 'reference', label: 'Reference' },
		{ value: 'question', label: 'Question' }
	];

	// Initialize values when note changes
	$: if (note) {
		titleValue = note.title || '';
		contentValue = note.content || '';
		categoryValue = note.category || '';
		tagsValue = note.tags || [];
	}

	// Granular invalidation
	async function invalidateNoteData() {
		if (projectId && note.id) {
			await invalidate(`note:${note.id}`);
			// await invalidate(`projects:${projectId}:notes`);
		}
	}

	// Quick update functions
	async function quickUpdateField(field: string, value: any) {
		if (!note?.id) return;

		savingField = field;
		try {
			const updateData = { [field]: value };
			const result = await projectService.updateNote(note.id, updateData);

			if (result.success) {
				await invalidateNoteData();
				toastService.success('Note updated successfully');
			}
		} catch (error) {
			console.error(`Error updating ${field}:`, error);
			toastService.error(`Failed to update ${field}`);
		} finally {
			savingField = null;
		}
	}

	// Project context modal handlers
	function openProjectContextModal() {
		showProjectContextModal = true;
	}

	function closeProjectContextModal() {
		showProjectContextModal = false;
	}

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
				quickUpdateField('tags', tagsValue);
			}
			tagInput = '';
		}
	}

	function removeTag(tagToRemove: string) {
		tagsValue = tagsValue.filter((tag) => tag !== tagToRemove);
		quickUpdateField('tags', tagsValue);
	}

	// Get category display info
	function getCategoryDisplay(category: string) {
		const configs = {
			insight: {
				label: 'Insight',
				color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
				icon: '💡'
			},
			research: {
				label: 'Research',
				color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
				icon: '🔍'
			},
			idea: {
				label: 'Idea',
				color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
				icon: '💭'
			},
			observation: {
				label: 'Observation',
				color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
				icon: '👁️'
			},
			reference: {
				label: 'Reference',
				color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
				icon: '📚'
			},
			question: {
				label: 'Question',
				color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
				icon: '❓'
			}
		};
		return (
			configs[category] || {
				label: 'Note',
				color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
				icon: '📝'
			}
		);
	}

	$: categoryDisplay = getCategoryDisplay(categoryValue);
</script>

<svelte:head>
	<title>{note.title} - {project.name} - BuildOS</title>
	<meta
		name="description"
		content="Note details for {note.title} in {project.name}. View and edit note content, tags, and metadata."
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Header Navigation Bar -->
	<header
		class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10"
	>
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex items-center justify-between h-16">
				<!-- Left: Back Navigation -->
				<nav aria-label="Note navigation" class="flex items-center space-x-4">
					<a
						href="/projects/{projectId}"
						class="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors group"
						aria-label="Return to {project.name} project"
					>
						<ArrowLeft
							class="w-4 h-4 mr-2 group-hover:-translate-x-0.5 transition-transform"
							aria-hidden="true"
						/>
						<span class="font-medium">{project.name}</span>
					</a>
					<span class="text-gray-300 dark:text-gray-600">/</span>
					<span class="text-sm text-gray-600 dark:text-gray-400">Notes</span>
					<span class="text-gray-300 dark:text-gray-600">/</span>
					<span
						class="text-sm font-medium text-gray-900 dark:text-white truncate max-w-md"
					>
						{titleValue}
					</span>
				</nav>

				<!-- Right: Actions -->
				<div class="flex items-center space-x-3">
					<!-- Category Badge -->
					{#if categoryValue}
						<span
							class="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium {categoryDisplay.color}"
						>
							<span class="mr-1.5">{categoryDisplay.icon}</span>
							{categoryDisplay.label}
						</span>
					{/if}

					<!-- Tag Count -->
					{#if tagsValue.length > 0}
						<span
							class="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
						>
							<Tag class="w-4 h-4 mr-1.5" />
							{tagsValue.length} tag{tagsValue.length !== 1 ? 's' : ''}
						</span>
					{/if}

					<!-- Project Context -->
					<Button
						type="button"
						on:click={openProjectContextModal}
						variant="ghost"
						size="sm"
						class="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
						aria-label="View project context"
						title="Project Context"
						icon={Settings}
					></Button>
				</div>
			</div>
		</div>
	</header>

	<!-- Main Content -->
	<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
		<!-- Note Header -->
		<div class="mb-6">
			<div
				class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-1"
			>
				<div class="flex items-center justify-center py-3">
					<div class="flex items-center space-x-3">
						<div
							class="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center"
						>
							<FileText class="w-5 h-5 text-white" />
						</div>
						<div>
							<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
								Note Details
							</h2>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Edit and manage your note content
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Main Note Content -->
		<div class="grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-[calc(100vh-16rem)]">
			<!-- Content Section (3/4 width) -->
			<div class="lg:col-span-3 space-y-6">
				<!-- Title -->
				<div
					class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
				>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
						Note Title
					</label>
					<div class="group">
						<input
							type="text"
							bind:value={titleValue}
							on:blur={() => quickUpdateField('title', titleValue)}
							placeholder="Note title..."
							class="w-full text-2xl font-bold px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all group-hover:border-gray-400"
						/>
						{#if savingField === 'title'}
							<div
								class="mt-2 text-sm text-blue-600 dark:text-blue-400 flex items-center"
							>
								<Save class="w-4 h-4 mr-1 animate-pulse" />
								Saving...
							</div>
						{/if}
					</div>
				</div>

				<!-- Content -->
				<div
					class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex-1"
				>
					<FormField label="Note Content" labelFor="note-content">
						<Textarea
							id="note-content"
							bind:value={contentValue}
							on:blur={() => quickUpdateField('content', contentValue)}
							on:input={(e) => autoResize(e.target)}
							placeholder="Start writing your note content here...

You can include:
• Research findings and insights
• Ideas and observations
• References and links
• Questions and hypotheses
• Meeting notes and summaries

This area will auto-save when you click away or switch focus."
							rows={20}
							size="lg"
							class="w-full leading-relaxed text-lg"
						/>
						{#if savingField === 'content'}
							<div
								class="mt-2 text-sm text-blue-600 dark:text-blue-400 flex items-center"
							>
								<Save class="w-4 h-4 mr-1 animate-pulse" />
								Saving...
							</div>
						{/if}
						<div
							class="mt-2 text-sm text-gray-500 dark:text-gray-400 flex justify-between"
						>
							<span>{contentValue.length} characters</span>
							<span
								>{contentValue.split(/\s+/).filter((word) => word.length > 0)
									.length} words</span
							>
						</div>
					</FormField>
				</div>
			</div>

			<!-- Metadata Sidebar (1/4 width) -->
			<div class="lg:col-span-1 space-y-4">
				<div
					class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-4 sticky top-24"
				>
					<h3
						class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide flex items-center"
					>
						<BookOpen class="w-4 h-4 mr-2" />
						Note Details
					</h3>

					<!-- Category -->
					<FormField label="Category" labelFor="note-category">
						<Select
							id="note-category"
							bind:value={categoryValue}
							on:change={(e) => {
								categoryValue = e.detail;
								quickUpdateField('category', categoryValue);
							}}
							size="sm"
						>
							{#each categoryOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</Select>
						{#if savingField === 'category'}
							<div
								class="mt-1 text-xs text-blue-600 dark:text-blue-400 flex items-center"
							>
								<Save class="w-3 h-3 mr-1 animate-pulse" />
								Saving...
							</div>
						{/if}
					</FormField>

					<!-- Tags -->
					<div>
						<label
							class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 items-center"
						>
							<Hash class="w-4 h-4 mr-1" />
							Tags
						</label>

						<!-- Tags Display -->
						{#if tagsValue.length > 0}
							<div class="flex flex-wrap gap-1 mb-2">
								{#each tagsValue as tag}
									<span
										class="inline-flex items-center px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 rounded-md"
									>
										{tag}
										<Button
											type="button"
											on:click={() => removeTag(tag)}
											variant="ghost"
											size="sm"
											class="ml-1 p-0 w-5 h-5 text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100"
										>
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
									</span>
								{/each}
							</div>
						{/if}

						<!-- Tag Input -->
						<input
							type="text"
							bind:value={tagInput}
							on:keydown={handleTagKeydown}
							placeholder="Add tags (press Enter)..."
							class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
						/>
						{#if savingField === 'tags'}
							<div
								class="mt-1 text-xs text-blue-600 dark:text-blue-400 flex items-center"
							>
								<Save class="w-3 h-3 mr-1 animate-pulse" />
								Saving...
							</div>
						{/if}
					</div>

					<!-- Content Preview -->
					<div>
						<label
							class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 items-center"
						>
							<Eye class="w-4 h-4 mr-1" />
							Preview
						</label>
						<div
							class="text-xs p-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 max-h-32 overflow-y-auto leading-relaxed"
						>
							{#if contentValue.trim()}
								{contentValue.slice(0, 200)}{contentValue.length > 200 ? '...' : ''}
							{:else}
								<em class="text-gray-400"
									>No content yet. Start writing to see a preview...</em
								>
							{/if}
						</div>
					</div>

					<!-- Content Stats -->
					<div class="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
						<h4
							class="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2"
						>
							Statistics
						</h4>
						<div class="space-y-1 text-xs text-gray-600 dark:text-gray-400">
							<div class="flex justify-between">
								<span>Characters:</span>
								<span class="font-medium">{contentValue.length}</span>
							</div>
							<div class="flex justify-between">
								<span>Words:</span>
								<span class="font-medium"
									>{contentValue.split(/\s+/).filter((word) => word.length > 0)
										.length}</span
								>
							</div>
							<div class="flex justify-between">
								<span>Lines:</span>
								<span class="font-medium">{contentValue.split('\n').length}</span>
							</div>
							<div class="flex justify-between">
								<span>Tags:</span>
								<span class="font-medium">{tagsValue.length}</span>
							</div>
						</div>
					</div>

					<!-- Creation/Update Info -->
					{#if note}
						<hr class="border-gray-200 dark:border-gray-700" />
						<div class="space-y-2 text-xs text-gray-600 dark:text-gray-400">
							<div class="flex items-center text-gray-500 dark:text-gray-400 mb-2">
								<Calendar class="w-3 h-3 mr-1" />
								<span class="font-medium">Timeline</span>
							</div>
							{#if note.created_at}
								<div>
									<span class="font-medium">Created:</span>
									<br />
									{new Date(note.created_at).toLocaleDateString('en-US', {
										weekday: 'short',
										month: 'short',
										day: 'numeric',
										year: 'numeric',
										timeZone
									})}
									<br />
									{new Date(note.created_at).toLocaleTimeString('en-US', {
										hour: 'numeric',
										minute: '2-digit',
										timeZone
									})}
								</div>
							{/if}
							{#if note.updated_at && note.updated_at !== note.created_at}
								<div>
									<span class="font-medium">Last updated:</span>
									<br />
									{new Date(note.updated_at).toLocaleDateString('en-US', {
										weekday: 'short',
										month: 'short',
										day: 'numeric',
										year: 'numeric',
										timeZone
									})}
									<br />
									{new Date(note.updated_at).toLocaleTimeString('en-US', {
										hour: 'numeric',
										minute: '2-digit',
										timeZone
									})}
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</main>
</div>

<!-- Project Context Modal -->
{#if showProjectContextModal}
	<ProjectContextModal
		isOpen={showProjectContextModal}
		{project}
		on:close={closeProjectContextModal}
	/>
{/if}

<style>
	/* Smooth transitions for content changes */
	main {
		transition: opacity 0.2s ease-in-out;
	}

	/* Custom scrollbar for content areas */
	:global(.note-content-scroll) {
		scrollbar-width: thin;
		scrollbar-color: rgb(203 213 225) transparent;
	}

	:global(.note-content-scroll::-webkit-scrollbar) {
		width: 6px;
	}

	:global(.note-content-scroll::-webkit-scrollbar-track) {
		background: transparent;
	}

	:global(.note-content-scroll::-webkit-scrollbar-thumb) {
		background-color: rgb(203 213 225);
		border-radius: 3px;
	}

	:global(.dark .note-content-scroll) {
		scrollbar-color: rgb(75 85 99) transparent;
	}

	:global(.dark .note-content-scroll::-webkit-scrollbar-thumb) {
		background-color: rgb(75 85 99);
	}

	/* Input hover effects */
	:global(.group:hover input, .group:hover textarea, .group:hover select) {
		border-color: rgb(156 163 175);
	}

	/* Enhanced textarea styling */
	textarea::placeholder {
		line-height: 1.6;
	}
</style>
