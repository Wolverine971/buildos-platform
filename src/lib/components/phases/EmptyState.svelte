<!-- src/lib/components/phases/EmptyState.svelte -->
<script lang="ts">
	import { Calendar, Plus, Sparkles, Loader2 } from 'lucide-svelte';
	import { createEventDispatcher } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let hasProjectDates: boolean;
	export let generating = false;

	const dispatch = createEventDispatcher();
</script>

<div
	class="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
>
	<Calendar class="w-12 h-12 text-gray-400 mx-auto mb-4" />
	<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No phases yet</h3>
	<p class="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
		Generate phases to organize your tasks into logical project stages, or create phases
		manually.
	</p>
	{#if !hasProjectDates}
		<div
			class="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-6 max-w-md mx-auto"
		>
			<div class="flex items-start gap-3">
				<Calendar
					class="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5"
				/>
				<div class="text-left">
					<h4 class="text-sm font-medium text-orange-800 dark:text-orange-200 mb-1">
						Project dates required
					</h4>
					<p class="text-sm text-orange-700 dark:text-orange-300">
						Set your project start and end dates to enable AI-powered phase generation.
					</p>
				</div>
			</div>
		</div>
	{/if}
	<div class="flex items-center justify-center gap-3">
		<Button
			on:click={() => dispatch('createPhase')}
			variant="outline"
			size="md"
			icon={Plus}
			iconPosition="left"
		>
			Create Phase
		</Button>
		<Button
			on:click={() => dispatch('generatePhases')}
			disabled={generating || !hasProjectDates}
			variant="primary"
			size="lg"
			icon={generating ? Loader2 : Sparkles}
			iconPosition="left"
			loading={generating}
			title={!hasProjectDates
				? 'Set project start and end dates to enable phase generation'
				: ''}
		>
			{generating ? 'Generating...' : 'Generate Phases'}
		</Button>
	</div>
</div>
