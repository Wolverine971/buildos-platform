<!-- apps/web/src/lib/components/project/ProjectContextModal.svelte -->
<script lang="ts">
	import { FileText, Calendar, Tag, Info, Briefcase, Target } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import type { Project } from '$lib/types/project';
	import { formatDateForDisplay } from '$lib/utils/date-utils';

	interface Props {
		isOpen?: boolean;
		project: Project;
		onClose?: () => void;
	}

	let { isOpen = $bindable(false), project, onClose }: Props = $props();

	function closeModal() {
		onClose?.();
		isOpen = false;
	}

	// Get status color classes
	function getStatusColorClasses(status: string) {
		switch (status) {
			case 'active':
				return 'bg-accent/10 text-accent';
			case 'on_hold':
				return 'bg-muted text-muted-foreground';
			case 'completed':
				return 'bg-accent/10 text-accent';
			case 'archived':
				return 'bg-muted text-muted-foreground';
			default:
				return 'bg-muted text-muted-foreground';
		}
	}
</script>

<Modal
	{isOpen}
	onClose={closeModal}
	title="Project Context"
	size="xl"
	closeOnBackdrop={true}
	closeOnEscape={true}
>
	{#snippet children()}
		<div class="px-3 sm:px-4 py-3 sm:py-4 space-y-3 sm:space-y-4">
			<!-- Project Overview Section -->
			<div class="bg-muted/50 rounded-lg p-3 sm:p-4 border border-border">
				<h3 class="text-sm font-medium text-foreground mb-3 flex items-center">
					<Info class="w-4 h-4 mr-2 text-muted-foreground" />
					{project.name}
				</h3>

				<!-- Project Meta -->
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
					{#if project.status}
						<div class="flex items-center space-x-2">
							<span class="text-xs font-medium text-muted-foreground"> Status: </span>
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
							<Calendar class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
							<span class="text-xs text-muted-foreground"> Started: </span>
							<span class="text-xs text-foreground">
								{formatDateForDisplay(project.start_date)}
							</span>
						</div>
					{/if}

					{#if project.end_date}
						<div class="flex items-center space-x-2">
							<Calendar class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
							<span class="text-xs text-muted-foreground"> Due: </span>
							<span class="text-xs text-foreground">
								{formatDateForDisplay(project.end_date)}
							</span>
						</div>
					{/if}
				</div>

				<!-- Description -->
				{#if project.description}
					<div class="mb-4">
						<div
							class="prose prose-sm max-w-none overflow-x-auto
								prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground
								prose-strong:text-foreground prose-a:text-accent prose-blockquote:text-muted-foreground
								prose-blockquote:border-border prose-code:bg-muted prose-code:text-foreground
								prose-pre:bg-muted prose-pre:text-foreground prose-hr:border-border"
						>
							{@html renderMarkdown(project.description)}
						</div>
					</div>
				{/if}

				<!-- Tags -->
				{#if project.tags && project.tags.length > 0}
					<div class="flex items-start space-x-2">
						<Tag class="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
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
				<div class="bg-accent/5 rounded-lg p-3 sm:p-4 border border-accent/20">
					<h3 class="text-sm font-medium text-foreground mb-3 flex items-center">
						<Briefcase class="w-4 h-4 mr-2 text-accent" />
						Executive Summary
					</h3>
					<div
						class="prose prose-sm max-w-none overflow-x-auto
							prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground
							prose-strong:text-foreground prose-a:text-accent prose-blockquote:text-muted-foreground
							prose-blockquote:border-border prose-code:bg-muted prose-code:text-foreground
							prose-pre:bg-muted prose-pre:text-foreground prose-hr:border-border"
					>
						{@html renderMarkdown(project.executive_summary)}
					</div>
				</div>
			{/if}

			<!-- Full Context -->
			{#if project.context}
				<div class="bg-muted/50 rounded-lg p-3 sm:p-4 border border-border">
					<h3 class="text-sm font-medium text-foreground mb-3 flex items-center">
						<Target class="w-4 h-4 mr-2 text-muted-foreground" />
						Detailed Project Context
					</h3>
					<div
						class="prose prose-sm max-w-none overflow-x-auto
							prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground
							prose-strong:text-foreground prose-a:text-accent prose-blockquote:text-muted-foreground
							prose-blockquote:border-border prose-code:bg-muted prose-code:text-foreground
							prose-pre:bg-muted prose-pre:text-foreground prose-hr:border-border"
					>
						{@html renderMarkdown(project.context)}
					</div>
				</div>
			{:else}
				<div
					class="bg-muted/50 rounded-lg p-6 text-center border border-border tx tx-bloom tx-weak"
				>
					<FileText class="w-10 h-10 text-muted-foreground mx-auto mb-3" />
					<p class="text-sm text-muted-foreground">
						No detailed context available for this project yet.
					</p>
				</div>
			{/if}
		</div>
	{/snippet}
	{#snippet footer()}
		<div class="flex justify-end px-3 sm:px-4 py-3 border-t border-border bg-muted/50">
			<Button onclick={closeModal} variant="outline" size="md">Close</Button>
		</div>
	{/snippet}
</Modal>
