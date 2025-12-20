<!-- apps/web/src/routes/test-realtime/+page.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabase';
	import type { RealtimeChannel } from '@supabase/supabase-js';

	let channel: RealtimeChannel | null = null;
	let status = 'Not connected';
	let messages: string[] = [];

	onMount(async () => {
		// Test real-time connection
		channel = supabase.channel('test-channel');

		channel
			.on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
				messages = [
					...messages,
					`Task event: ${payload.eventType} - ${JSON.stringify(payload.new || payload.old)}`
				];
			})
			.subscribe((status) => {
				console.log('Subscription status:', status);
				if (status === 'SUBSCRIBED') {
					messages = [...messages, '✅ Connected to real-time!'];
				}
			});
	});

	onDestroy(async () => {
		if (channel) {
			await supabase.removeChannel(channel);
		}
	});
</script>

<!-- apps/web/src/routes/test-realtime/+page.svelte -->
<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
	<title>Real-time Test - BuildOS (Internal)</title>
</svelte:head>

<div class="p-8">
	<h1 class="text-2xl font-bold mb-4">Real-time Test Page</h1>

	<div class="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
		<h2 class="font-semibold mb-2">Connection Status: {status}</h2>

		<div class="mt-4">
			<h3 class="font-semibold mb-2">Real-time Messages:</h3>
			<div class="space-y-2 max-h-96 overflow-y-auto">
				{#each messages as message}
					<div class="p-2 bg-white dark:bg-gray-700 rounded text-sm">
						{message}
					</div>
				{/each}
				{#if messages.length === 0}
					<p class="text-gray-500">No messages yet. Try creating/updating a task!</p>
				{/if}
			</div>
		</div>
	</div>

	<div class="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
		<h3 class="font-semibold mb-2">Instructions:</h3>
		<ol class="list-decimal list-inside space-y-1 text-sm">
			<li>Open this page in two browser tabs</li>
			<li>Go to any project and create/edit a task</li>
			<li>Watch the real-time events appear here!</li>
		</ol>
	</div>
</div>
