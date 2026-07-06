<!-- apps/web/src/lib/components/admin/chat-users/ChatUserActivityTimeline.svelte -->
<script lang="ts">
	import type { UserDetail } from './chat-user-types';
	import { formatDay, formatNumber } from './chat-user-ui';

	interface Props {
		timeline: UserDetail['timeline'];
	}

	let { timeline }: Props = $props();
</script>

<section>
	<h3 class="micro-label font-semibold">Activity</h3>
	<div class="mt-3 space-y-2">
		{#each timeline.slice(0, 14) as day (day.date)}
			<div class="grid grid-cols-[72px_1fr] items-center gap-3 text-sm">
				<span class="text-muted-foreground">{formatDay(day.date)}</span>
				<div class="rounded-lg border border-border bg-card px-3 py-2">
					<p class="text-foreground">
						{formatNumber(day.session_count)} sessions · {formatNumber(day.turn_count)} turns
						· {formatNumber(day.message_count)} messages
					</p>
					<p class="truncate text-xs text-muted-foreground">
						{day.top_topics.join(', ') ||
							day.project_names.join(', ') ||
							'No classifier topic'}
					</p>
				</div>
			</div>
		{/each}
	</div>
</section>
