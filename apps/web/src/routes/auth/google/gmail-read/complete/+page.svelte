<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import {
		GMAIL_OAUTH_COMPLETE_MESSAGE,
		gmailOAuthErrorMessage,
		type GmailOAuthCompletion
	} from '$lib/services/gmail-oauth.client';

	let sent = $state(false);
	let canClose = $state(false);

	const success = $derived($page.url.searchParams.get('success') === 'gmail_connected');
	const errorCode = $derived($page.url.searchParams.get('error'));
	const connectionId = $derived($page.url.searchParams.get('connection'));
	const statusMessage = $derived(
		success
			? 'Gmail read-only access is connected.'
			: gmailOAuthErrorMessage(errorCode ?? 'connection_failed')
	);

	onMount(() => {
		const completion: GmailOAuthCompletion = {
			type: GMAIL_OAUTH_COMPLETE_MESSAGE,
			success,
			connectionId,
			error: success ? null : (errorCode ?? 'connection_failed')
		};

		if (window.opener) {
			window.opener.postMessage(completion, window.location.origin);
		}
		if ('BroadcastChannel' in window) {
			const channel = new BroadcastChannel('buildos:gmail-oauth');
			channel.postMessage(completion);
			channel.close();
		}
		sent = true;
		canClose = Boolean(window.opener);
		if (window.opener) window.setTimeout(() => window.close(), 250);
	});
</script>

<svelte:head>
	<title>Gmail authorization · BuildOS</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
	<section
		class="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-ink"
	>
		<h1 class="text-lg font-semibold">
			{success ? 'Gmail connected' : 'Reconnect incomplete'}
		</h1>
		<p class="mt-2 text-sm text-muted-foreground">{statusMessage}</p>
		{#if canClose}
			<p class="mt-4 text-xs text-muted-foreground">
				{sent ? 'This window will close automatically.' : 'Returning to BuildOS…'}
			</p>
			<button
				type="button"
				onclick={() => window.close()}
				class="mt-4 min-h-11 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
			>
				Close window
			</button>
		{:else}
			<a
				href="/profile?tab=email"
				class="mt-4 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
			>
				Return to email settings
			</a>
		{/if}
	</section>
</main>
