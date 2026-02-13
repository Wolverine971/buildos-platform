<!-- apps/web/src/lib/components/briefs/ProjectBriefCard.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { ExternalLink, FileText, Clock, Hash } from 'lucide-svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import type { ProjectDailyBrief } from '$lib/types/daily-brief';

	// Using $props() for Svelte 5 runes mode
	let { brief }: { brief: ProjectDailyBrief } = $props();

	const dispatch = createEventDispatcher();

	function handleClick() {
		dispatch('open', brief);
	}

	// Extract plain text from markdown for preview
	function getPlainTextPreview(markdown: string, maxLength: number = 150): string {
		// Remove markdown formatting
		let text = markdown
			.replace(/#{1,6}\s+/g, '') // Remove headers
			.replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
			.replace(/\*([^*]+)\*/g, '$1') // Remove italic
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
			.replace(/`([^`]+)`/g, '$1') // Remove inline code
			.replace(/```[^`]*```/g, '') // Remove code blocks
			.replace(/>\s+/g, '') // Remove blockquotes
			.replace(/[-*+]\s+/g, '') // Remove list markers
			.replace(/\d+\.\s+/g, '') // Remove numbered lists
			.replace(/\n{2,}/g, ' ') // Replace multiple newlines
			.replace(/\n/g, ' ') // Replace single newlines
			.trim();

		// Truncate to maxLength
		if (text.length > maxLength) {
			return text.substring(0, maxLength).trim() + '...';
		}
		return text;
	}

	// Calculate word count from the brief content
	function getWordCount(text: string): number {
		if (!text) return 0;
		// Remove extra whitespace and split by spaces
		const words = text
			.trim()
			.split(/\s+/)
			.filter((word) => word.length > 0);
		return words.length;
	}

	// Using $derived for computed values - automatic memoization in Svelte 5
	let previewText = $derived(getPlainTextPreview(brief.brief_content || ''));
	let projectId = $derived(brief.projects?.id);
	let wordCount = $derived(getWordCount(brief.brief_content || ''));
</script>

<Card
	variant="interactive"
	class="h-full group cursor-pointer"
	onclick={handleClick}
	onkeydown={(e) => e.key === 'Enter' && handleClick()}
	role="button"
	tabindex="0"
>
	<!-- Card Header -->
	<CardHeader variant="default">
		<div class="flex items-start justify-between">
			<h3 class="font-semibold text-foreground text-lg line-clamp-1 flex-1">
				{brief?.projects?.name}
			</h3>
			<a
				href="/projects/{projectId}"
				onclick={(e) => e.stopPropagation()}
				class="ml-2 p-1.5 text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
				title="Go to project"
			>
				<ExternalLink class="w-4 h-4" />
			</a>
		</div>

		{#if brief.metadata}
			<div class="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
				<span class="flex items-center">
					<Hash class="w-3 h-3 mr-1" />
					{wordCount} words
				</span>
				{#if brief.metadata.task_count}
					<span class="flex items-center">
						<FileText class="w-3 h-3 mr-1" />
						{brief.metadata.task_count} tasks
					</span>
				{/if}
				{#if brief.metadata.completion_rate !== undefined}
					<span class="flex items-center">
						<div class="w-3 h-3 mr-1 rounded-full bg-muted relative overflow-hidden">
							<div
								class="absolute inset-0 bg-green-500"
								style="width: {brief.metadata.completion_rate}%"
							></div>
						</div>
						{brief.metadata.completion_rate}%
					</span>
				{/if}
			</div>
		{/if}
	</CardHeader>

	<!-- Card Body -->
	<CardBody padding="md" class="flex-1 flex flex-col">
		<p class="text-sm text-muted-foreground line-clamp-4 flex-1">
			{previewText}
		</p>

		<div class="mt-4 flex items-center justify-between">
			<span class="text-xs text-muted-foreground"> Click to view full brief </span>
			<div
				class="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 transition-colors"
			>
				<FileText class="w-4 h-4 text-blue-600 dark:text-blue-400" />
			</div>
		</div>
	</CardBody>
</Card>

<style>
	.line-clamp-1 {
		display: -webkit-box;
		-webkit-line-clamp: 1;
		line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.line-clamp-4 {
		display: -webkit-box;
		-webkit-line-clamp: 4;
		line-clamp: 4;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
