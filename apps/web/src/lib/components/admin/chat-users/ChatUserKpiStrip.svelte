<!-- apps/web/src/lib/components/admin/chat-users/ChatUserKpiStrip.svelte -->
<script lang="ts">
	import type { UsersResponse } from './chat-user-types';
	import { formatMs, formatNumber } from './chat-user-ui';

	interface Props {
		kpis?: UsersResponse['kpis'] | null;
	}

	let { kpis = null }: Props = $props();

	const items = $derived([
		{ label: 'Active Users', value: formatNumber(kpis?.active_users) },
		{ label: 'Sessions', value: formatNumber(kpis?.sessions) },
		{ label: 'User Msgs', value: formatNumber(kpis?.user_messages) },
		{ label: 'Responses', value: formatNumber(kpis?.assistant_responses) },
		{ label: 'Turns', value: formatNumber(kpis?.turns) },
		{ label: 'p50 TTFR', value: formatMs(kpis?.ttfr_p50_ms) },
		{ label: 'p95 TTFR', value: formatMs(kpis?.ttfr_p95_ms) },
		{ label: 'Slow Turns', value: formatNumber(kpis?.slow_turns) },
		{ label: 'Error Users', value: formatNumber(kpis?.error_impacted_users) },
		{ label: 'Entities', value: formatNumber(kpis?.chat_created_entities) }
	]);
</script>

<div class="grid grid-cols-2 gap-3 md:grid-cols-5 xl:grid-cols-10">
	{#each items as item (item.label)}
		<div class="rounded-lg border border-border bg-card p-3 shadow-ink">
			<p class="micro-label">{item.label}</p>
			<p class="mt-1 text-2xl font-semibold text-foreground">{item.value}</p>
		</div>
	{/each}
</div>
