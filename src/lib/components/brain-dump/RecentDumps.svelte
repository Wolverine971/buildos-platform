<!-- src/lib/components/brain-dump/RecentDumps.svelte -->
<script lang="ts">
	import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';
	import { FileText } from 'lucide-svelte';

	export let dumps: Array<{
		id: string;
		content: string;
		created_at: string;
		ai_summary?: string;
		ai_insights?: string;
	}> = [];

	// Format date for display
	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diffTime = Math.abs(now.getTime() - date.getTime());
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

		if (diffDays === 1) return 'Yesterday';
		if (diffDays < 7) return `${diffDays} days ago`;
		return date.toLocaleDateString();
	}

	// Truncate content for preview
	function truncateContent(content: string, maxLength: number = 150): string {
		if (content.length <= maxLength) return content;
		return content.substring(0, maxLength) + '...';
	}
</script>

<div
	class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
>
	<h2 class="text-lg font-semibold text-gray-900 dark:!text-white mb-4">Recent Brain Dumps</h2>

	{#if dumps.length === 0}
		<div class="text-center py-8 text-gray-500 dark:!text-gray-400">
			<FileText class="w-12 h-12 mx-auto mb-4 opacity-50" />
			<p>No recent brain dumps found</p>
			<p class="text-sm">Your processed thoughts will appear here</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each dumps as dump}
				<div
					class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/70 transition-colors"
				>
					<div class="flex items-start justify-between mb-2">
						<div class="flex items-center space-x-2">
							<FileText class="w-4 h-4 text-gray-400 flex-shrink-0" />
							{#if dump.ai_summary}
								<span class="text-sm font-medium text-gray-700 dark:!text-gray-300">
									{truncateContent(dump.ai_summary, 50)}
								</span>
							{:else}
								<span class="text-sm text-gray-500 dark:!text-gray-400">
									General
								</span>
							{/if}
						</div>
						<span class="text-xs text-gray-500 dark:!text-gray-400 flex-shrink-0">
							{formatDistanceToNow(new Date(dump.created_at), { addSuffix: true })}
						</span>
					</div>
					<p class="text-sm text-gray-600 dark:!text-gray-400 leading-relaxed">
						{truncateContent(dump.content)}
					</p>
				</div>
			{/each}
		</div>
	{/if}
</div>
