<!-- src/lib/components/project/CalendarWarning.svelte -->
<script lang="ts">
	import { AlertTriangle } from 'lucide-svelte';

	export let calendarConnected: boolean = false;
	export let calendarStatus: string = 'not_connected';
	export let isScheduledTab: boolean = false;
</script>

{#if (!calendarConnected || calendarStatus === 'error') && isScheduledTab}
	<div
		class="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4"
	>
		<div class="flex items-start">
			<AlertTriangle class="w-5 h-5 text-yellow-600 dark:text-yellow-400 mr-3 mt-0.5" />
			<div class="flex-1">
				<h3 class="text-sm font-medium text-yellow-800 dark:text-yellow-200">
					Calendar Not Connected
				</h3>
				<p class="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
					{#if calendarStatus === 'error'}
						Your calendar connection has an error. Please reconnect your calendar to
						schedule tasks.
					{:else}
						Connect your Google Calendar to schedule tasks and sync with your calendar.
					{/if}
				</p>
				<a
					href="/profile?tab=calendar"
					class="mt-2 inline-flex items-center text-sm font-medium text-yellow-800 dark:text-yellow-200 hover:text-yellow-900 dark:hover:text-yellow-100"
				>
					Go to Calendar Settings
					<span class="ml-1">→</span>
				</a>
			</div>
		</div>
	</div>
{/if}
