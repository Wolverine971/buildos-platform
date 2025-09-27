<!-- src/routes/auth/google/calendar-callback/+page.svelte -->
<script lang="ts">
	import { Calendar, Loader2 } from 'lucide-svelte';
</script>

<svelte:head>
	<title>Connecting Calendar - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
	<div class="text-center">
		<div class="flex justify-center mb-4">
			<div class="relative">
				<Calendar class="w-16 h-16 text-green-600 dark:text-green-400" />
				<Loader2 class="w-16 h-16 absolute inset-0 animate-spin text-gray-400" />
			</div>
		</div>
		<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
			Connecting your calendar...
		</h2>
		<p class="text-gray-600 dark:text-gray-400">
			Please wait while we set up your Google Calendar integration.
		</p>
	</div>
</div>
