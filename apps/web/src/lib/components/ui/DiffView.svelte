<!-- src/lib/components/ui/DiffView.svelte -->
<script lang="ts">
	import type { DiffLine, FieldDiff } from '$lib/utils/diff';

	export let diffs: FieldDiff[] = [];
	export let fromVersionLabel: string = 'Old Version';
	export let toVersionLabel: string = 'New Version';
	export let showFieldPriority = false;

	// Get line classes for diff display
	function getLineClass(line: DiffLine): string {
		switch (line.type) {
			case 'added':
				return 'bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-500';
			case 'removed':
				return 'bg-rose-50 dark:bg-rose-900/20 border-l-4 border-rose-500';
			default:
				return 'bg-gray-50 dark:bg-gray-800/50';
		}
	}
</script>

{#if diffs.length === 0}
	<div class="text-center py-8">
		<p class="text-gray-600 dark:text-gray-400">No changes detected between these versions.</p>
	</div>
{:else}
	<div class="space-y-8">
		{#each diffs as diff (diff.field)}
			<div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
				<!-- Field Header -->
				<div
					class="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-700"
				>
					<h3 class="font-medium text-gray-900 dark:text-white flex items-center">
						{diff.label}
						{#if showFieldPriority && diff.field === 'context'}
							<span
								class="ml-2 text-xs bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300 px-2 py-1 rounded"
							>
								Primary Content
							</span>
						{/if}
					</h3>
				</div>

				<!-- Side-by-side diff -->
				<div
					class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200 dark:divide-gray-700"
				>
					<!-- Old Version -->
					<div class="p-4">
						<h4 class="text-sm font-medium text-rose-600 dark:text-rose-400 mb-3">
							{fromVersionLabel}
						</h4>
						<div class="font-mono text-xs sm:text-sm space-y-1 max-h-96 overflow-auto">
							{#each diff.oldLines as line (line.lineNumber)}
								<div class="flex">
									<span
										class="w-6 sm:w-8 text-gray-400 text-xs pr-1 sm:pr-2 flex-shrink-0"
									>
										{line.lineNumber}
									</span>
									<pre
										class="flex-1 px-1 sm:px-2 py-1 {getLineClass(
											line
										)} whitespace-pre-wrap break-words">{line.content}</pre>
								</div>
							{/each}
						</div>
					</div>

					<!-- New Version -->
					<div class="p-4">
						<h4 class="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-3">
							{toVersionLabel}
						</h4>
						<div class="font-mono text-xs sm:text-sm space-y-1 max-h-96 overflow-auto">
							{#each diff.newLines as line (line.lineNumber)}
								<div class="flex">
									<span
										class="w-6 sm:w-8 text-gray-400 text-xs pr-1 sm:pr-2 flex-shrink-0"
									>
										{line.lineNumber}
									</span>
									<pre
										class="flex-1 px-1 sm:px-2 py-1 {getLineClass(
											line
										)} whitespace-pre-wrap break-words">{line.content}</pre>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}
