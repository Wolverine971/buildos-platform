<!-- apps/web/src/lib/components/admin/chat-users/ChatUserSummaryCards.svelte -->
<script lang="ts">
	import { Clock, Database, User, Wrench } from '$lib/icons/lucide';
	import type { UserDetail } from './chat-user-types';
	import { formatMs, formatNumber } from './chat-user-ui';

	interface Props {
		summary: UserDetail['summary'];
	}

	let { summary }: Props = $props();
</script>

<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
	<div class="rounded-lg border border-border bg-card p-3">
		<User class="h-4 w-4 text-muted-foreground" />
		<p class="mt-2 text-xl font-semibold">{formatNumber(summary.session_count)}</p>
		<p class="text-xs text-muted-foreground">Sessions</p>
	</div>
	<div class="rounded-lg border border-border bg-card p-3">
		<Clock class="h-4 w-4 text-muted-foreground" />
		<p class="mt-2 text-xl font-semibold">{formatMs(summary.ttfr_p95_ms)}</p>
		<p class="text-xs text-muted-foreground">p95 TTFR</p>
	</div>
	<div class="rounded-lg border border-border bg-card p-3">
		<Wrench class="h-4 w-4 text-muted-foreground" />
		<p class="mt-2 text-xl font-semibold">{formatNumber(summary.tool_call_count)}</p>
		<p class="text-xs text-muted-foreground">Tool Calls</p>
	</div>
	<div class="rounded-lg border border-border bg-card p-3">
		<Database class="h-4 w-4 text-muted-foreground" />
		<p class="mt-2 text-xl font-semibold">{formatNumber(summary.created_entity_count)}</p>
		<p class="text-xs text-muted-foreground">Created</p>
	</div>
</div>
