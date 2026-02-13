<!-- apps/web/src/lib/components/project/ProjectContextModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { FileText, Calendar, Tag, Info, Briefcase, Target } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import type { Project } from '$lib/types/project';
	import { formatDateForDisplay } from '$lib/utils/date-utils';

	export let isOpen = false;
	export let project: Project;

	const dispatch = createEventDispatcher();

	function closeModal() {
		dispatch('close');
		isOpen = false;
	}

	// Get status color classes
	function getStatusColorClasses(status: string) {
		switch (status) {
			case 'active':
				return 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200';
			case 'on_hold':
				return 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200';
			case 'completed':
				return 'bg-primary-100 dark:bg-primary-900/50 text-primary-800 dark:text-primary-200';
			case 'archived':
				return 'bg-muted text-foreground';
			default:
				return 'bg-muted text-foreground';
		}
	}
</script>

<Modal {isOpen} onClose={closeModal} size="xl" closeOnBackdrop={true} closeOnEscape={true}>
	{#snippet children()}
		{#snippet header()}
			<div class="flex items-center space-x-3 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b">
				<div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex-shrink-0">
					<FileText
						class="w-5 h-5 sm:w-6 sm:h-6 text-primary-600 dark:text-primary-400"
					/>
				</div>
				<div class="min-w-0">
					<h2 class="text-lg sm:text-xl font-semibold text-foreground">
						Project Context
					</h2>
					<p class="text-xs sm:text-sm text-muted-foreground mt-1">
						{project.name}
					</p>
				</div>
			</div>
		{/snippet}

		<div class="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 space-y-4 sm:space-y-6">
			<!-- Project Overview Section -->
			<div class="bg-muted/50 rounded-lg p-3 sm:p-4 border border-border">
				<h3 class="text-sm sm:text-base font-medium text-foreground mb-3 flex items-center">
					<Info class="w-4 h-4 mr-2 text-muted-foreground" />
					Project Overview
				</h3>

				<!-- Project Meta -->
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
					{#if project.status}
						<div class="flex items-center space-x-2">
							<span class="text-xs sm:text-sm font-medium text-muted-foreground">
								Status:
							</span>
							<span
								class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {getStatusColorClasses(
									project.status
								)}"
							>
								{project.status.replace('_', ' ')}
							</span>
						</div>
					{/if}

					{#if project.start_date}
						<div class="flex items-center space-x-2">
							<Calendar
								class="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0"
							/>
							<span class="text-xs sm:text-sm text-muted-foreground"> Started: </span>
							<span class="text-xs sm:text-sm text-foreground">
								{formatDateForDisplay(project.start_date)}
							</span>
						</div>
					{/if}

					{#if project.end_date}
						<div class="flex items-center space-x-2">
							<Calendar
								class="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0"
							/>
							<span class="text-xs sm:text-sm text-muted-foreground"> Due: </span>
							<span class="text-xs sm:text-sm text-foreground">
								{formatDateForDisplay(project.end_date)}
							</span>
						</div>
					{/if}
				</div>

				<!-- Description -->
				{#if project.description}
					<div class="mb-4">
						<div
							class="prose prose-sm max-w-none text-foreground
						prose-headings:text-foreground dark:prose-headings:text-white
						prose-p:text-foreground dark:prose-p:text-muted-foreground
						prose-strong:text-foreground dark:prose-strong:text-white
						prose-a:text-blue-600 dark:prose-a:text-blue-400
						prose-blockquote:text-foreground dark:prose-blockquote:text-muted-foreground
						prose-code:text-foreground dark:prose-code:text-muted-foreground
						prose-pre:bg-muted dark:prose-pre:bg-gray-800"
						>
							{@html renderMarkdown(project.description)}
						</div>
					</div>
				{/if}

				<!-- Tags -->
				{#if project.tags && project.tags.length > 0}
					<div class="flex items-start space-x-2">
						<Tag
							class="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground mt-0.5 flex-shrink-0"
						/>
						<div class="flex flex-wrap gap-1">
							{#each project.tags as tag}
								<span
									class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-foreground"
								>
									{tag}
								</span>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Executive Summary -->
			{#if project.executive_summary}
				<div
					class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 sm:p-4 border border-blue-200 dark:border-blue-800"
				>
					<h3
						class="text-sm sm:text-base font-medium text-foreground mb-3 flex items-center"
					>
						<Briefcase class="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400" />
						Executive Summary
					</h3>
					<div
						class="prose prose-sm max-w-none text-foreground
					prose-headings:text-foreground dark:prose-headings:text-white
					prose-p:text-foreground dark:prose-p:text-muted-foreground
					prose-strong:text-foreground dark:prose-strong:text-white
					prose-a:text-blue-600 dark:prose-a:text-blue-400
					prose-blockquote:text-foreground dark:prose-blockquote:text-muted-foreground
					prose-code:text-foreground dark:prose-code:text-muted-foreground
					prose-pre:bg-muted dark:prose-pre:bg-gray-800"
					>
						{@html renderMarkdown(project.executive_summary)}
					</div>
				</div>
			{/if}

			<!-- Full Context -->
			{#if project.context}
				<div class="bg-muted/50 rounded-lg p-3 sm:p-4 border border-border">
					<h3
						class="text-sm sm:text-base font-medium text-foreground mb-3 flex items-center"
					>
						<Target class="w-4 h-4 mr-2 text-muted-foreground" />
						Detailed Project Context
					</h3>
					<div
						class="prose prose-sm max-w-none text-foreground
					prose-headings:text-foreground dark:prose-headings:text-white
					prose-p:text-foreground dark:prose-p:text-muted-foreground
					prose-strong:text-foreground dark:prose-strong:text-white
					prose-a:text-blue-600 dark:prose-a:text-blue-400
					prose-blockquote:text-foreground dark:prose-blockquote:text-muted-foreground
					prose-code:text-foreground dark:prose-code:text-muted-foreground
					prose-pre:bg-muted dark:prose-pre:bg-gray-800
					prose-ul:text-foreground dark:prose-ul:text-muted-foreground
					prose-ol:text-foreground dark:prose-ol:text-muted-foreground
					prose-li:text-foreground dark:prose-li:text-muted-foreground"
					>
						{@html renderMarkdown(project.context)}
					</div>
				</div>
			{:else}
				<div class="bg-muted/50 rounded-lg p-6 text-center border border-border">
					<FileText
						class="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mx-auto mb-3"
					/>
					<p class="text-sm text-muted-foreground">
						No detailed context available for this project yet.
					</p>
				</div>
			{/if}
		</div>
	{/snippet}
	{#snippet footer()}
		<div class="flex justify-end px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-border">
			<Button onclick={closeModal} variant="outline" size="md">Close</Button>
		</div>
	{/snippet}
</Modal>
