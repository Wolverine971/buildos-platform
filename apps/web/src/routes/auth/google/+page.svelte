<!-- apps/web/src/routes/auth/google/+page.svelte -->

<script lang="ts">
	import { Calendar, LoaderCircle } from 'lucide-svelte';
</script>

<div class="min-h-screen bg-background flex items-center justify-center">
	<div class="text-center">
		<div class="flex justify-center mb-4">
			<div class="relative">
				<Calendar class="w-16 h-16 text-accent" />
				<LoaderCircle
					class="w-16 h-16 absolute inset-0 animate-spin text-muted-foreground"
				/>
			</div>
		</div>
		<h2 class="text-2xl font-semibold text-foreground mb-2">Redirecting to Google...</h2>
		<p class="text-muted-foreground">
			You'll be redirected to Google to authorize calendar access.
		</p>
	</div>
</div>
