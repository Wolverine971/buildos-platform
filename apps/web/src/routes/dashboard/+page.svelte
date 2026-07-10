<!-- Authenticated dashboard entry point. -->
<script lang="ts">
	import '../dashboard.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { invalidate, replaceState } from '$app/navigation';
	import AnalyticsDashboard from '$lib/components/dashboard/AnalyticsDashboard.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { createEmptyUserDashboardAnalytics } from '$lib/types/dashboard-analytics';

	let { data } = $props();

	async function handleDashboardRefresh() {
		await invalidate('dashboard:analytics');
	}

	onMount(() => {
		const message = page.url.searchParams.get('message');
		const urlError = page.url.searchParams.get('error');

		if (message) {
			toastService.success(message);
			const url = new URL(page.url);
			url.searchParams.delete('message');
			replaceState(url.toString(), {});
		}

		if (urlError) {
			toastService.error(urlError);
			const url = new URL(page.url);
			url.searchParams.delete('error');
			replaceState(url.toString(), {});
		}
	});
</script>

<svelte:head>
	<title>Dashboard - BuildOS</title>
	<meta
		name="description"
		content="Review your BuildOS projects, daily priorities, progress, and open work."
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if data.user}
	<AnalyticsDashboard
		user={{
			id: data.user.id,
			email: data.user.email,
			name: data.user.name ?? undefined,
			is_admin: data.user.is_admin,
			timezone: data.user.timezone ?? undefined
		}}
		analytics={data.dashboard ?? createEmptyUserDashboardAnalytics()}
		pendingInvites={data.pendingInvites ?? []}
		showAgentConnectionCta={!data.hasConnectedAgents}
		onrefresh={handleDashboardRefresh}
	/>
{/if}
