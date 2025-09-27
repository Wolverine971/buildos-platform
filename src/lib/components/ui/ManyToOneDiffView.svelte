<!-- src/lib/components/ui/ManyToOneDiffView.svelte -->
<script lang="ts">
	import type { ManyToOneComparison, FieldComparison } from '$lib/utils/many-to-one-diff';

	export let comparison: ManyToOneComparison;
	export let leftLabel: string = 'Multiple Items';
	export let rightLabel: string = 'Reference Item';
	export let showOnlyDifferences: boolean = false;

	// Filter comparisons based on showOnlyDifferences
	$: filteredComparisons = showOnlyDifferences
		? comparison.fieldComparisons.filter((fc) => fc.hasAnyDifferences)
		: comparison.fieldComparisons;

	// Get styling for different/same values
	function getValueClass(isDifferent: boolean, isLeft: boolean): string {
		if (!isDifferent) {
			return 'bg-gray-50 dark:bg-gray-800/50 border-l-4 border-gray-300 dark:border-gray-600';
		}

		if (isLeft) {
			return 'bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500';
		} else {
			return 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500';
		}
	}
</script>

{#if filteredComparisons.length === 0}
	<div class="text-center py-8">
		<p class="text-gray-600 dark:text-gray-400">
			{showOnlyDifferences
				? 'No differences found between items.'
				: 'No fields configured for comparison.'}
		</p>
	</div>
{:else}
	<div class="space-y-6">
		{#each filteredComparisons as fieldComparison (fieldComparison.field)}
			<div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
				<!-- Field Header -->
				<div
					class="bg-gray-100 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700"
				>
					<div class="flex items-center justify-between">
						<h3 class="font-medium text-gray-900 dark:text-white">
							{fieldComparison.label}
						</h3>
						{#if fieldComparison.hasAnyDifferences}
							<span
								class="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-1 rounded"
							>
								Has Differences
							</span>
						{:else}
							<span
								class="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 px-2 py-1 rounded"
							>
								All Same
							</span>
						{/if}
					</div>
				</div>

				<!-- Content Layout: Many on left, One on right -->
				<div
					class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200 dark:divide-gray-700"
				>
					<!-- Left Side: Multiple Items -->
					<div class="p-4">
						<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
							{leftLabel} ({comparison.leftItems.length} items)
						</h4>
						<div class="space-y-2 max-h-96 overflow-auto">
							{#each fieldComparison.leftValues as leftValue (leftValue.itemId)}
								<div class="flex items-start space-x-3">
									<!-- Item identifier -->
									<div class="flex-shrink-0 w-20">
										<span
											class="text-xs font-mono text-gray-500 dark:text-gray-400 truncate block"
										>
											{leftValue.itemLabel}
										</span>
									</div>
									<!-- Value -->
									<div class="flex-1 min-w-0">
										<pre
											class="px-3 py-2 {getValueClass(
												leftValue.isDifferent,
												true
											)} text-sm whitespace-pre-wrap break-words">{leftValue.displayValue ||
												'(empty)'}</pre>
									</div>
									<!-- Difference indicator -->
									{#if leftValue.isDifferent}
										<div class="flex-shrink-0">
											<div
												class="w-2 h-2 bg-orange-500 rounded-full"
												title="Different from reference"
											></div>
										</div>
									{:else}
										<div class="flex-shrink-0">
											<div
												class="w-2 h-2 bg-green-500 rounded-full"
												title="Same as reference"
											></div>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>

					<!-- Right Side: Reference Item -->
					<div class="p-4">
						<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
							{rightLabel}
						</h4>
						<div class="space-y-2">
							<div class="flex items-start space-x-3">
								<!-- Item identifier -->
								<div class="flex-shrink-0 w-20">
									<span
										class="text-xs font-mono text-gray-500 dark:text-gray-400 truncate block"
									>
										{comparison.rightItem.label || comparison.rightItem.id}
									</span>
								</div>
								<!-- Value -->
								<div class="flex-1 min-w-0">
									<pre
										class="px-3 py-2 {getValueClass(
											fieldComparison.hasAnyDifferences,
											false
										)} text-sm whitespace-pre-wrap break-words">{fieldComparison
											.rightValue.displayValue || '(empty)'}</pre>
								</div>
								<!-- Reference indicator -->
								<div class="flex-shrink-0">
									<div
										class="w-2 h-2 bg-blue-500 rounded-full"
										title="Reference value"
									></div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}
