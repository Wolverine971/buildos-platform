<!-- apps/web/src/routes/(public)/share/[token]/+error.svelte -->
<script lang="ts">
	import { page } from '$app/state';
	import SEOHead from '$lib/components/SEOHead.svelte';
	const unavailable = $derived(page.status === 404);
</script>

<SEOHead
	title={unavailable ? 'This chat is no longer shared.' : 'Could not open shared chat'}
	description="A shared BuildOS conversation"
	author="BuildOS"
	noindex
/>

<div
	class="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-5 py-12 text-center"
>
	<p class="mb-4 micro-label text-muted-foreground">BuildOS · Shared chat</p>
	<h1 class="text-2xl font-semibold tracking-tight text-foreground">
		{unavailable ? 'This chat is no longer shared.' : "Couldn't open this chat."}
	</h1>
	<p class="mt-3 text-sm text-muted-foreground">
		{unavailable
			? 'The owner may have stopped sharing it, or the link may be incomplete.'
			: 'Please try again in a moment.'}
	</p>
</div>
