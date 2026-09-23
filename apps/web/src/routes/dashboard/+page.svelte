<!-- apps/web/src/routes/dashboard/+page.svelte -->
<!-- Authenticated dashboard entry point. -->
<script lang="ts">
	import { invalidate } from '$app/navigation';
	import AnalyticsDashboard from '$lib/components/dashboard/AnalyticsDashboard.svelte';
	import { createEmptyUserDashboardAnalytics } from '$lib/types/dashboard-analytics';

	let { data } = $props();

	async function handleDashboardRefresh() {
		await invalidate('dashboard:analytics');
	}
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
