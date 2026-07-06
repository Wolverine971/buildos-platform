<!-- apps/web/src/lib/components/admin/chat-users/ChatUsersTable.svelte -->
<script lang="ts">
	import { ArrowDown, ArrowUp } from '$lib/icons/lucide';
	import type { SortField, SortOrder, UserMetric } from './chat-user-types';
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
		sortBy: SortField;
		sortOrder: SortOrder;
		slowThresholdMs: string;
		onSort: (field: SortField) => void;
		onSelectUser: (userId: string) => void;
	}

	let {
		users = [],
		isInitialLoading = false,
		sortBy,
		sortOrder,
		slowThresholdMs,
		onSort,
		onSelectUser
	}: Props = $props();

	const skeletonRows = Array.from({ length: 8 });
	const sortButtonClass =
		'inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

	function sortIconClass(field: SortField): string {
		return `h-3 w-3 ${sortBy === field ? '' : 'opacity-40'}`;
	}
</script>

<div class="overflow-x-auto">
	<table class="min-w-[1500px] w-full text-left text-sm">
		<thead class="micro-label border-b border-border bg-muted/40">
			<tr>
				<th class="px-4 py-3">User</th>
				<th class="px-4 py-3">
					<button
						type="button"
						class={sortButtonClass}
						onclick={() => onSort('last_activity_at')}
					>
						Last Chat
						{#if sortBy === 'last_activity_at' && sortOrder === 'asc'}
							<ArrowUp class="h-3 w-3" />
						{:else}
							<ArrowDown class={sortIconClass('last_activity_at')} />
						{/if}
					</button>
				</th>
				<th class="px-4 py-3">Cadence</th>
				<th class="px-4 py-3">
					<button
						type="button"
						class={sortButtonClass}
						onclick={() => onSort('session_count')}
					>
						Sessions
						{#if sortBy === 'session_count' && sortOrder === 'asc'}
							<ArrowUp class="h-3 w-3" />
						{:else}
							<ArrowDown class={sortIconClass('session_count')} />
						{/if}
					</button>
				</th>
				<th class="px-4 py-3">
					<button
						type="button"
						class={sortButtonClass}
						onclick={() => onSort('message_count')}
					>
						Messages
						{#if sortBy === 'message_count' && sortOrder === 'asc'}
							<ArrowUp class="h-3 w-3" />
						{:else}
							<ArrowDown class={sortIconClass('message_count')} />
						{/if}
					</button>
				</th>
				<th class="px-4 py-3">
					<button
						type="button"
						class={sortButtonClass}
						onclick={() => onSort('turn_count')}
					>
						Turns
						{#if sortBy === 'turn_count' && sortOrder === 'asc'}
							<ArrowUp class="h-3 w-3" />
						{:else}
							<ArrowDown class={sortIconClass('turn_count')} />
						{/if}
					</button>
				</th>
				<th class="px-4 py-3">
					<button
						type="button"
						class={sortButtonClass}
						onclick={() => onSort('p95_ttfr_ms')}
					>
						First Response
						{#if sortBy === 'p95_ttfr_ms' && sortOrder === 'asc'}
							<ArrowUp class="h-3 w-3" />
						{:else}
							<ArrowDown class={sortIconClass('p95_ttfr_ms')} />
						{/if}
					</button>
				</th>
				<th class="px-4 py-3">
					<button
						type="button"
						class={sortButtonClass}
						onclick={() => onSort('tool_call_count')}
					>
						Tools
						{#if sortBy === 'tool_call_count' && sortOrder === 'asc'}
							<ArrowUp class="h-3 w-3" />
						{:else}
							<ArrowDown class={sortIconClass('tool_call_count')} />
						{/if}
					</button>
				</th>
				<th class="px-4 py-3">Errors</th>
				<th class="px-4 py-3">Project Impact</th>
				<th class="px-4 py-3">Preview</th>
			</tr>
		</thead>
		<tbody>
			{#if isInitialLoading}
				{#each skeletonRows as _, index}
					<tr class="border-b border-border/60" aria-hidden="true">
						<td class="px-4 py-4" colspan="11">
							<div
								class="h-5 animate-pulse rounded bg-muted motion-reduce:animate-none"
								style={`width: ${60 + index * 4}%`}
							></div>
						</td>
					</tr>
				{/each}
			{:else if users.length === 0}
				<tr>
					<td class="px-4 py-10 text-center text-muted-foreground" colspan="11">
						No chat users matched the current filters.
					</td>
				</tr>
			{:else}
				{#each users as user (user.user_id)}
					{@const userBadges = buildUserAlertBadges(user, slowThresholdMs)}
					<tr
						class="border-b border-border/60 align-top transition-colors hover:bg-muted/30"
					>
						<td class="px-4 py-4">
							<button
								type="button"
								class="max-w-[240px] rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onclick={() => onSelectUser(user.user_id)}
							>
								<span class="block truncate font-semibold text-foreground">
									{user.name ?? user.email}
								</span>
								<span class="block truncate text-xs text-muted-foreground">
									{user.email}
								</span>
								<span
									class="block truncate font-mono text-[11px] text-muted-foreground"
								>
									{user.user_id}
								</span>
							</button>
							{#if userBadges.length > 0}
								<div class="mt-2 flex max-w-[240px] flex-wrap gap-1">
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
						</td>
						<td class="px-4 py-4 text-muted-foreground">
							{formatDate(user.last_activity_at)}
						</td>
						<td class="px-4 py-4">
							<p class="text-foreground">
								{formatNumber(user.active_day_count)} active days
							</p>
							<p class="text-xs text-muted-foreground">
								{formatNumber(user.consecutive_day_streak)} day streak
							</p>
						</td>
						<td class="px-4 py-4">
							<p class="text-foreground">{formatNumber(user.session_count)}</p>
							<p class="text-xs text-muted-foreground">
								{formatNumber(user.project_session_count)} project · {formatNumber(
									user.global_session_count
								)} global
							</p>
						</td>
						<td class="px-4 py-4">
							<p class="text-foreground">{formatNumber(user.message_count)}</p>
							<p class="text-xs text-muted-foreground">
								{formatNumber(user.user_message_count)} user · {formatNumber(
									user.assistant_message_count
								)} assistant
							</p>
						</td>
						<td class="px-4 py-4">
							<p class="text-foreground">{formatNumber(user.turn_count)}</p>
							<p class="text-xs text-muted-foreground">
								{formatNumber(user.completed_turn_count)} done · {formatNumber(
									user.failed_turn_count +
										user.cancelled_turn_count +
										user.running_turn_count
								)} other
							</p>
						</td>
						<td class="px-4 py-4">
							<p class="text-foreground">p95 {formatMs(user.ttfr_p95_ms)}</p>
							<p class="text-xs text-muted-foreground">
								p50 {formatMs(user.ttfr_p50_ms)} · max {formatMs(user.ttfr_max_ms)} ·
								{formatNumber(user.slow_turn_count)} slow
							</p>
						</td>
						<td class="px-4 py-4">
							<p class="text-foreground">
								{formatNumber(user.tool_call_count)} calls
							</p>
							<p class="text-xs text-muted-foreground">
								{formatNumber(user.tool_failure_count)} failed · {formatRate(
									user.tool_failure_rate
								)}
							</p>
						</td>
						<td class="px-4 py-4">
							<p class="text-foreground">
								{formatNumber(
									user.message_error_count +
										user.tool_failure_count +
										user.llm_failure_count +
										user.validation_failure_count
								)}
							</p>
							<p class="text-xs text-muted-foreground">
								{formatNumber(user.llm_failure_count)} LLM · {formatNumber(
									user.validation_failure_count
								)} validation
							</p>
						</td>
						<td class="px-4 py-4">
							<p class="text-foreground">
								{formatNumber(user.created_entity_count)} created
							</p>
							<p class="text-xs text-muted-foreground">
								{formatNumber(user.updated_entity_count)} updated · {formatNumber(
									user.project_count
								)} projects
							</p>
						</td>
						<td class="max-w-[360px] px-4 py-4">
							<p class="line-clamp-3 text-sm text-muted-foreground">
								{user.preview}
							</p>
							<div class="mt-2 flex flex-wrap gap-1">
								{#each user.top_topics.slice(0, 3) as topic}
									<span
										class="rounded border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
									>
										{topic.topic}
									</span>
								{/each}
							</div>
						</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>
