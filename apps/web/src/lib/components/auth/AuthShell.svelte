<!-- apps/web/src/lib/components/auth/AuthShell.svelte -->
<!--
	Focused chrome for the sign-in / sign-up / password screens: the app header and footer are
	hidden on /auth routes, so this gives people a quiet way back to the homepage and fills the
	viewport exactly (the root layout makes <main> a flex column for these routes).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ArrowLeft } from '$lib/icons/lucide';

	let {
		width = 'sm',
		children
	}: {
		/** Content column width: `sm` for short forms, `md` for longer ones like sign-up. */
		width?: 'sm' | 'md';
		children: Snippet;
	} = $props();
</script>

<!-- First visit: the consent bar covers the bottom of a phone screen; leave room so
     "Continue with Google" and the sign-up/sign-in switch scroll clear of it. -->
<div
	class="flex flex-1 flex-col bg-background"
	style="padding-bottom: var(--consent-bar-space, 0px)"
>
	<header class="flex shrink-0 items-center px-4 pt-4 sm:px-6 sm:pt-5">
		<a
			href="/"
			class="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-muted-foreground shadow-ink transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pressable"
		>
			<ArrowLeft class="h-4 w-4" aria-hidden="true" />
			Home
		</a>
	</header>

	<div class="flex flex-1 items-center justify-center px-4 py-6 sm:px-6">
		<div class="w-full {width === 'md' ? 'max-w-md' : 'max-w-sm'}">
			{@render children()}
		</div>
	</div>

	<footer class="shrink-0 px-4 pb-5 text-center text-xs text-muted-foreground sm:pb-6">
		<a
			href="/privacy"
			class="-my-2 inline-block rounded py-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>Privacy</a
		>
		<span class="mx-2" aria-hidden="true">·</span>
		<a
			href="/terms"
			class="-my-2 inline-block rounded py-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>Terms</a
		>
	</footer>
</div>
