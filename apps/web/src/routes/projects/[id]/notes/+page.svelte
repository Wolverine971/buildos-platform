<!-- apps/web/src/routes/projects/[id]/notes/+page.svelte -->
<script lang="ts">
	import {
		ArrowLeft,
		Settings,
		FileText,
		Plus,
		Search,
		Filter,
		BookOpen,
		Calendar,
		Hash,
		Eye
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import ProjectContextModal from '$lib/components/project/ProjectContextModal.svelte';
	import NoteModal from '$lib/components/project/NoteModal.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { PageData } from './$types';
	import { onMount } from 'svelte';

	export let data: PageData;

	// Modal state
	let showProjectContextModal = false;
	let showNoteModal = false;
	let selectedNote = null;

	// Filter state
	let searchTerm = '';
	let selectedCategory = '';
	let selectedTag = '';

	let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});

	// Reactive values
	$: project = data.project;
	$: notes = data.notes;

	// Get all unique categories and tags for filtering
	$: allCategories = [...new Set(notes.map((note) => note.category).filter(Boolean))].sort();
	$: allTags = [...new Set(notes.flatMap((note) => note.tags || []))].sort();

	// Filter notes based on search and filters
	$: filteredNotes = notes.filter((note) => {
		const matchesSearch =
			!searchTerm ||
			note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
			note.content.toLowerCase().includes(searchTerm.toLowerCase());

		const matchesCategory = !selectedCategory || note.category === selectedCategory;

		const matchesTag = !selectedTag || (note.tags && note.tags.includes(selectedTag));

		return matchesSearch && matchesCategory && matchesTag;
	});

	// Group notes by category for better organization
	$: notesByCategory = filteredNotes.reduce((acc, note) => {
		const category = note.category || 'uncategorized';
		if (!acc[category]) acc[category] = [];
		acc[category].push(note);
		return acc;
	}, {});

	// Project context modal handlers
	function openProjectContextModal() {
		showProjectContextModal = true;
	}

	function closeProjectContextModal() {
		showProjectContextModal = false;
	}

	// Note modal handlers
	function openNoteModal(note = null) {
		selectedNote = note;
		showNoteModal = true;
	}

	function closeNoteModal() {
		showNoteModal = false;
		selectedNote = null;
	}

	function handleNoteUpdate() {
		closeNoteModal();
		// The page will automatically refresh due to invalidation
	}

	function handleNoteDelete() {
		closeNoteModal();
		console.log('delete note');
		// The page will automatically refresh due to invalidation
	}

	// Navigate to note details
	function viewNote(noteId: string) {
		goto(`/projects/${project.id}/notes/${noteId}`);
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
			},
			uncategorized: {
				label: 'Uncategorized',
				color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
				icon: '📝'
			}
		};
		return configs[category] || configs.uncategorized;
	}

	// Clear filters
	function clearFilters() {
		searchTerm = '';
		selectedCategory = '';
		selectedTag = '';
	}
</script>

<svelte:head>
	<title>Notes - {project.name} - BuildOS</title>
	<meta
		name="description"
		content="Notes for {project.name}. View, search, and manage project notes, insights, and documentation."
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
				<nav aria-label="Notes navigation" class="flex items-center space-x-4">
					<a
						href="/projects/{project.id}"
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
					<span class="text-sm font-medium text-gray-900 dark:text-white">
						Notes ({filteredNotes.length})
					</span>
				</nav>

				<!-- Right: Actions -->
				<div class="flex items-center space-x-3">
					<!-- Create Note Button -->
					<Button
						type="button"
						on:click={() => openNoteModal()}
						variant="primary"
						size="md"
						icon={Plus}
					>
						New Note
					</Button>

					<!-- Project Context -->
					<Button
						type="button"
						on:click={openProjectContextModal}
						variant="ghost"
						size="sm"
						class="p-2"
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
		<!-- Page Header -->
		<div class="mb-6">
			<div
				class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
			>
				<div class="flex items-center justify-between">
					<div class="flex items-center space-x-4">
						<div
							class="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center"
						>
							<BookOpen class="w-6 h-6 text-white" />
						</div>
						<div>
							<h1 class="text-2xl font-bold text-gray-900 dark:text-white">
								Project Notes
							</h1>
							<p class="text-gray-600 dark:text-gray-400">
								{filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''}
								{searchTerm || selectedCategory || selectedTag ? ' (filtered)' : ''}
							</p>
						</div>
					</div>
					<div
						class="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400"
					>
						<div class="flex items-center space-x-1">
							<Hash class="w-4 h-4" />
							<span>{allTags.length} tags</span>
						</div>
						<div class="flex items-center space-x-1">
							<Filter class="w-4 h-4" />
							<span>{allCategories.length} categories</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Filters -->
		<div class="mb-6">
			<div
				class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
			>
				<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
					<!-- Search -->
					<div class="relative">
						<Search
							class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
						/>
						<input
							type="text"
							bind:value={searchTerm}
							placeholder="Search notes..."
							class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
						/>
					</div>

					<!-- Category Filter -->
					<Select
						bind:value={selectedCategory}
						on:change={(e) => (selectedCategory = e.detail)}
						size="md"
					>
						<option value="">All categories</option>
						{#each allCategories as category}
							<option value={category}>{getCategoryDisplay(category).label}</option>
						{/each}
					</Select>

					<!-- Tag Filter -->
					<Select
						bind:value={selectedTag}
						on:change={(e) => (selectedTag = e.detail)}
						size="md"
					>
						<option value="">All tags</option>
						{#each allTags as tag}
							<option value={tag}>{tag}</option>
						{/each}
					</Select>

					<!-- Clear Filters -->
					{#if searchTerm || selectedCategory || selectedTag}
						<Button type="button" on:click={clearFilters} variant="outline" size="md">
							Clear filters
						</Button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Notes Grid -->
		{#if filteredNotes.length > 0}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{#each filteredNotes as note (note.id)}
					{@const categoryDisplay = getCategoryDisplay(note.category)}
					<div
						class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow cursor-pointer group"
						on:click={() => viewNote(note.id)}
						on:keydown={(e) => e.key === 'Enter' && viewNote(note.id)}
						role="button"
						tabindex="0"
					>
						<!-- Note Header -->
						<div class="flex items-start justify-between mb-3">
							<div class="flex items-center space-x-2 flex-1 min-w-0">
								<span class="text-lg" title={categoryDisplay.label}>
									{categoryDisplay.icon}
								</span>
								<h3
									class="font-semibold text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
								>
									{note.title}
								</h3>
							</div>
							<Button
								type="button"
								on:click={(e) => {
									e.stopPropagation();
									openNoteModal(note);
								}}
								variant="ghost"
								size="sm"
								class="opacity-0 group-hover:opacity-100 p-1 min-h-0"
								title="Edit note"
								icon={Eye}
							></Button>
						</div>

						<!-- Category Badge -->
						{#if note.category}
							<div class="mb-3">
								<span
									class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {categoryDisplay.color}"
								>
									{categoryDisplay.label}
								</span>
							</div>
						{/if}

						<!-- Content Preview -->
						<div class="mb-4">
							<p
								class="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 leading-relaxed"
							>
								{#if note.content}
									{note.content.slice(0, 150)}{note.content.length > 150
										? '...'
										: ''}
								{:else}
									<em>No content yet...</em>
								{/if}
							</p>
						</div>

						<!-- Tags -->
						{#if note.tags && note.tags.length > 0}
							<div class="mb-4">
								<div class="flex flex-wrap gap-1">
									{#each note.tags.slice(0, 3) as tag}
										<span
											class="inline-flex items-center px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 rounded"
										>
											{tag}
										</span>
									{/each}
									{#if note.tags.length > 3}
										<span
											class="inline-flex items-center px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded"
										>
											+{note.tags.length - 3} more
										</span>
									{/if}
								</div>
							</div>
						{/if}

						<!-- Footer -->
						<div
							class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
						>
							<div class="flex items-center space-x-1">
								<Calendar class="w-3 h-3" />
								<span>
									{new Date(note.updated_at).toLocaleDateString('en-US', {
										month: 'short',
										day: 'numeric',
										timeZone
									})}
								</span>
							</div>
							<div class="flex items-center space-x-2">
								<span>{note.content.length} chars</span>
								{#if note.tags && note.tags.length > 0}
									<span>•</span>
									<span
										>{note.tags.length} tag{note.tags.length !== 1
											? 's'
											: ''}</span
									>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<!-- Empty State -->
			<div
				class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center"
			>
				<div
					class="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center"
				>
					<FileText class="w-12 h-12 text-white" />
				</div>
				<h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
					{searchTerm || selectedCategory || selectedTag
						? 'No notes match your filters'
						: 'No notes yet'}
				</h3>
				<p class="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
					{searchTerm || selectedCategory || selectedTag
						? "Try adjusting your search terms or filters to find what you're looking for."
						: 'Create your first note to start documenting insights, research, and ideas for this project.'}
				</p>
				{#if searchTerm || selectedCategory || selectedTag}
					<Button
						type="button"
						on:click={clearFilters}
						variant="secondary"
						size="md"
						class="mr-3"
					>
						Clear filters
					</Button>
				{/if}
				<Button
					type="button"
					on:click={() => openNoteModal()}
					variant="primary"
					size="md"
					icon={Plus}
				>
					Create your first note
				</Button>
			</div>
		{/if}
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

<!-- Note Modal -->
{#if showNoteModal}
	<NoteModal
		isOpen={showNoteModal}
		note={selectedNote}
		projectId={project.id}
		on:close={closeNoteModal}
		on:save={handleNoteUpdate}
		on:delete={handleNoteDelete}
	/>
{/if}

<style>
	/* Line clamp utility for text truncation */
	.line-clamp-3 {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
