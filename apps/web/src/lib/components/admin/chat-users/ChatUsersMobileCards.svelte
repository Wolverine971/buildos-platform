<!-- apps/web/src/lib/components/admin/chat-users/ChatUsersMobileCards.svelte -->
<script lang="ts">
	import type { UserMetric } from './chat-user-types';
	import {
		alertBadgeClass,
		buildUserAlertBadges,
		formatDate,
		formatMs,
		formatNumber,
		formatRate
	} from './chat-user-ui';

	interface Props {
		users?: UserMetric[];
		isInitialLoading?: boolean;
		slowThresholdMs: string;
		onSelectUser: (userId: string) => void;
	}

	let { users = [], isInitialLoading = false, slowThresholdMs, onSelectUser }: Props = $props();

	const skeletonCards = Array.from({ length: 5 });
</script>

<div class="space-y-3 p-3 md:hidden">
	{#if isInitialLoading}
		{#each skeletonCards as _}
			<div
				class="h-40 animate-pulse rounded-lg border border-border bg-muted motion-reduce:animate-none"
				aria-hidden="true"
			></div>
		{/each}
	{:else if users.length === 0}
		<div
			class="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground"
		>
			No chat users matched the current filters.
		</div>
	{:else}
		{#each users as user (user.user_id)}
			{@const userBadges = buildUserAlertBadges(user, slowThresholdMs)}
			<button
				type="button"
				class="w-full rounded-lg border border-border bg-card p-3 text-left shadow-ink transition-colors hover:border-accent/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onclick={() => onSelectUser(user.user_id)}
			>
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="truncate text-sm font-semibold text-foreground">
							{user.name ?? user.email}
						</p>
						<p class="truncate text-xs text-muted-foreground">{user.email}</p>
						<p class="truncate font-mono text-[11px] text-muted-foreground">
							{user.user_id}
						</p>
					</div>
					<p class="shrink-0 text-xs text-muted-foreground">
						{formatDate(user.last_activity_at)}
					</p>
				</div>

				{#if userBadges.length > 0}
					<div class="mt-3 flex flex-wrap gap-1">
						{#each userBadges.slice(0, 3) as badge}
							<span
								class={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${alertBadgeClass(badge.tone)}`}
								title={badge.title}
							>
								{badge.label}
							</span>
						{/each}
					</div>
				{/if}

				<div class="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
					<div>
						<p class="micro-label">Sessions</p>
						<p class="mt-1 text-sm font-semibold text-foreground">
							{formatNumber(user.session_count)}
						</p>
						<p>
							{formatNumber(user.project_session_count)} project · {formatNumber(
								user.global_session_count
							)} global
						</p>
					</div>
					<div>
						<p class="micro-label">Messages</p>
						<p class="mt-1 text-sm font-semibold text-foreground">
							{formatNumber(user.message_count)}
						</p>
						<p>
							{formatNumber(user.user_message_count)} user · {formatNumber(
								user.assistant_message_count
							)} assistant
						</p>
					</div>
					<div>
						<p class="micro-label">p95 TTFR</p>
						<p class="mt-1 text-sm font-semibold text-foreground">
							{formatMs(user.ttfr_p95_ms)}
						</p>
						<p>{formatNumber(user.slow_turn_count)} slow turns</p>
					</div>
					<div>
						<p class="micro-label">Tools</p>
						<p class="mt-1 text-sm font-semibold text-foreground">
							{formatNumber(user.tool_call_count)} calls
						</p>
						<p>
							{formatNumber(user.tool_failure_count)} failed · {formatRate(
								user.tool_failure_rate
							)}
						</p>
					</div>
				</div>

				<p class="mt-3 line-clamp-3 text-xs text-muted-foreground">
					{user.preview}
				</p>

				{#if user.top_topics.length > 0}
					<div class="mt-3 flex flex-wrap gap-1">
						{#each user.top_topics.slice(0, 3) as topic}
							<span
								class="rounded border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
							>
								{topic.topic}
							</span>
						{/each}
					</div>
				{/if}
			</button>
		{/each}
	{/if}
</div>
