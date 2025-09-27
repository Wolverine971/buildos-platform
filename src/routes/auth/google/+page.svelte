<!-- src/routes/auth/google/+page.svelte -->

<script lang="ts">
	import { Calendar, Loader2 } from 'lucide-svelte';
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
	<div class="text-center">
		<div class="flex justify-center mb-4">
			<div class="relative">
				<Calendar class="w-16 h-16 text-primary-600 dark:text-primary-400" />
				<Loader2 class="w-16 h-16 absolute inset-0 animate-spin text-gray-400" />
			</div>
		</div>
		<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
			Redirecting to Google...
		</h2>
		<p class="text-gray-600 dark:text-gray-400">
			You'll be redirected to Google to authorize calendar access.
		</p>
	</div>
</div>
