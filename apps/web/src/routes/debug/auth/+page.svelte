<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { createSupabaseBrowser } from '$lib/supabase';
	import type { PageData } from './$types';
	import LogoutTest from '$lib/components/test/LogoutTest.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let { data }: { data: PageData } = $props();

	let supabase = createSupabaseBrowser();
	let clientSession = $state<any>(null);
	let authStates = $state<string[]>([]);
	let checking = $state(false);

	async function checkSession() {
		checking = true;
		const {
			data: { session }
		} = await supabase.auth.getSession();
		clientSession = session;
		checking = false;
	}

	async function refreshSession() {
		checking = true;
		const { data, error } = await supabase.auth.refreshSession();
		if (error) {
			authStates = [...authStates, `Refresh error: ${error.message}`];
		} else {
			authStates = [...authStates, `Session refreshed: ${!!data.session}`];
			clientSession = data.session;
		}
		checking = false;
	}

	async function signOut() {
		const { error } = await supabase.auth.signOut();
		if (error) {
			authStates = [...authStates, `Sign out error: ${error.message}`];
		} else {
			authStates = [...authStates, 'Signed out successfully'];
		}
	}

	onMount(() => {
		// Check initial session
		checkSession();

		// Listen to auth changes
		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange((event, session) => {
			authStates = [
				...authStates,
				`Auth event: ${event} at ${new Date().toLocaleTimeString()}`
			];
			clientSession = session;
		});

		return () => subscription.unsubscribe();
	});

	let serverUser = $derived(data?.user);
	let urlParams = $derived(Object.fromEntries($page.url.searchParams));
</script>

<!-- apps/web/src/routes/debug/auth/+page.svelte -->
<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
	<title>Auth Debug - BuildOS (Internal)</title>
</svelte:head>

<div class="max-w-6xl mx-auto p-8">
	<h1 class="text-2xl font-bold mb-6">Auth Debug Page</h1>

	<!-- Add the comprehensive logout test component -->
	<LogoutTest user={serverUser} />

	<div class="space-y-6 mt-8">
		<!-- URL Parameters -->
		<div class="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
			<h2 class="font-semibold mb-2">URL Parameters:</h2>
			<!-- <pre class="text-sm">{JSON.stringify(urlParams, null, 2)}</pre> -->
		</div>

		<!-- Server-side Auth State -->
		<div class="bg-primary-100 dark:bg-primary-900/30 p-4 rounded-lg">
			<h2 class="font-semibold mb-2">Server-side Auth State:</h2>
			<p>User ID: {serverUser?.id || 'Not authenticated'}</p>
			<p>User Email: {serverUser?.email || 'N/A'}</p>
			<p>Completed Onboarding: {data?.completedOnboarding ? 'Yes' : 'No'}</p>
		</div>

		<!-- Client-side Auth State -->
		<div class="bg-emerald-100 dark:bg-emerald-900/30 p-4 rounded-lg">
			<h2 class="font-semibold mb-2">Client-side Auth State:</h2>
			{#if checking}
				<p>Checking...</p>
			{:else if clientSession}
				<p>User ID: {clientSession.user?.id}</p>
				<p>User Email: {clientSession.user?.email}</p>
				<p>Expires: {new Date(clientSession.expires_at * 1000).toLocaleString()}</p>
			{:else}
				<p>No client session</p>
			{/if}
		</div>

		<!-- Auth State Mismatch Warning -->
		{#if serverUser?.id !== clientSession?.user?.id}
			<div class="bg-rose-100 dark:bg-rose-900/30 p-4 rounded-lg">
				<h2 class="font-semibold mb-2">⚠️ Auth State Mismatch!</h2>
				<p>Server user ID: {serverUser?.id || 'null'}</p>
				<p>Client user ID: {clientSession?.user?.id || 'null'}</p>
			</div>
		{/if}

		<!-- Auth Events Log -->
		<div class="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
			<h2 class="font-semibold mb-2">Auth Events:</h2>
			{#if authStates.length === 0}
				<p class="text-gray-500">No auth events yet</p>
			{:else}
				<ul class="space-y-1">
					{#each authStates as state}
						<li class="text-sm">{state}</li>
					{/each}
				</ul>
			{/if}
		</div>

		<!-- Actions -->
		<div class="flex gap-4">
			<Button onclick={checkSession} disabled={checking} variant="primary" size="sm">
				Check Session
			</Button>
			<Button onclick={refreshSession} disabled={checking} variant="success" size="sm">
				Refresh Session
			</Button>
			<Button onclick={signOut} variant="danger" size="sm">Sign Out (Client Only)</Button>
		</div>

		<!-- Raw Data -->
		<details class="bg-gray-100 dark:bg-gray-800 p-4 rounded">
			<summary class="cursor-pointer font-semibold">Raw Page Data</summary>
			<!-- <pre class="text-xs mt-2 overflow-auto">{JSON.stringify(data, null, 2)}</pre> -->
		</details>
	</div>
</div>
