<!-- apps/web/src/lib/components/admin/chat-users/ChatUserComparisonPanel.svelte -->
<script lang="ts">
	import type { Timeframe, UserDetail, UserMetric } from './chat-user-types';
	import {
		buildUserComparison,
		comparisonDeltaClass,
		comparisonToneClass,
		formatNumber
	} from './chat-user-ui';

	interface Props {
		summary: UserDetail['summary'];
		cohortUsers?: UserMetric[];
		selectedTimeframe?: Timeframe;
	}

	let { summary, cohortUsers = [], selectedTimeframe = '7d' }: Props = $props();
	let comparisonMetrics = $derived(buildUserComparison(summary, cohortUsers));
</script>

<section>
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<h3 class="micro-label font-semibold">Current Result Comparison</h3>
			<p class="mt-1 text-sm text-muted-foreground">
				Compared with {formatNumber(cohortUsers.length)} loaded users from the active filters.
			</p>
		</div>
		<p class="text-xs text-muted-foreground">Average baseline · {selectedTimeframe}</p>
	</div>
	{#if comparisonMetrics.length === 0}
		<div class="mt-3 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
			No loaded cohort metrics are available for comparison.
		</div>
	{:else}
		<div class="mt-3 grid gap-2 md:grid-cols-2">
			{#each comparisonMetrics as metric (metric.label)}
				<div class={`rounded-lg border p-3 ${comparisonToneClass(metric.tone)}`}>
					<div class="flex items-start justify-between gap-3">
						<div>
							<p class="micro-label font-semibold">{metric.label}</p>
							<p class="mt-1 text-lg font-semibold text-foreground">
								{metric.user_value}
							</p>
						</div>
						<span
							class={`rounded border px-2 py-0.5 text-xs font-semibold ${comparisonDeltaClass(metric.tone)}`}
						>
							{metric.delta}
						</span>
					</div>
					<p class="mt-1 text-xs text-muted-foreground">
						Avg {metric.cohort_value} · {metric.description}
					</p>
				</div>
			{/each}
		</div>
	{/if}
</section>
