<!-- apps/web/src/lib/components/admin/chat-users/ChatUserLeaderboards.svelte -->
<script lang="ts">
	import type { SessionMetric, UserMetric, UsersResponse } from './chat-user-types';
	import { formatDate, formatMs, formatNumber, formatRate } from './chat-user-ui';

	interface Props {
		leaderboards?: UsersResponse['leaderboards'] | null;
		onSelectUser: (userId: string) => void;
	}

	let { leaderboards = null, onSelectUser }: Props = $props();

	const rowButtonClass =
		'block min-h-11 w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

	type UserLeaderboard = {
		key: keyof Pick<
			UsersResponse['leaderboards'],
			'most_sessions' | 'slowest_first_responses' | 'most_tool_calls'
		>;
		title: string;
		summary: (user: UserMetric) => string;
	};

	const userPanels: UserLeaderboard[] = [
		{
			key: 'most_sessions',
			title: 'Most Sessions',
			summary: (user) =>
				`${formatNumber(user.session_count)} sessions · ${formatDate(user.last_activity_at)}`
		},
		{
			key: 'slowest_first_responses',
			title: 'Slowest First Responses',
			summary: (user) =>
				`p95 ${formatMs(user.ttfr_p95_ms)} · max ${formatMs(user.ttfr_max_ms)}`
		},
		{
			key: 'most_tool_calls',
			title: 'Most Tool Calls',
			summary: (user) =>
				`${formatNumber(user.tool_call_count)} calls · ${formatRate(user.tool_failure_rate)} failed`
		}
	];

	function longestThreadSummary(session: SessionMetric): string {
		return `${formatNumber(session.turn_count)} turns · ${formatNumber(session.message_count)} messages`;
	}
</script>

<div class="grid grid-cols-1 gap-4 xl:grid-cols-4">
	{#each userPanels as panel (panel.key)}
		<div class="rounded-lg border border-border bg-card p-4 shadow-ink">
			<h2 class="micro-label font-semibold">{panel.title}</h2>
			<div class="mt-3 space-y-1">
				{#each leaderboards?.[panel.key] ?? [] as user (user.user_id)}
					<button
						type="button"
						class={rowButtonClass}
						onclick={() => onSelectUser(user.user_id)}
					>
						<p class="truncate text-sm font-semibold text-foreground">
							{user.name ?? user.email}
						</p>
						<p class="text-xs text-muted-foreground">{panel.summary(user)}</p>
					</button>
				{/each}
			</div>
		</div>
	{/each}

	<div class="rounded-lg border border-border bg-card p-4 shadow-ink">
		<h2 class="micro-label font-semibold">Longest Threads</h2>
		<div class="mt-3 space-y-1">
			{#each leaderboards?.longest_threads ?? [] as session (session.session_id)}
				<button
					type="button"
					class={rowButtonClass}
					onclick={() => onSelectUser(session.user_id)}
				>
					<p class="truncate text-sm font-semibold text-foreground">
						{session.title}
					</p>
					<p class="text-xs text-muted-foreground">
						{longestThreadSummary(session)}
					</p>
				</button>
			{/each}
		</div>
	</div>
</div>
