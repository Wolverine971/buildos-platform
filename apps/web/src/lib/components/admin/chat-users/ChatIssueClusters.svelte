<!-- apps/web/src/lib/components/admin/chat-users/ChatIssueClusters.svelte -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { alertBadgeClass, buildIssueClusters, formatDate, formatNumber } from './chat-user-ui';
	import type { UserDetail } from './chat-user-types';

	interface Props {
		errors: UserDetail['errors'];
		selectedSessionId?: string | null;
		isLoadingSession?: boolean;
		onLoadRedactedSession: (sessionId: string) => void;
	}

	let {
		errors,
		selectedSessionId = null,
		isLoadingSession = false,
		onLoadRedactedSession
	}: Props = $props();

	const issueClusters = $derived(buildIssueClusters(errors));
</script>

{#if issueClusters.length > 0}
	<section>
		<div class="flex flex-wrap items-end justify-between gap-3">
			<div>
				<h3 class="micro-label font-semibold">Issue Clusters</h3>
				<p class="mt-1 text-sm text-muted-foreground">
					Repeated safe error summaries grouped by source and normalized message.
				</p>
			</div>
			<p class="text-xs text-muted-foreground">
				{formatNumber(errors.length)} error events
			</p>
		</div>
		<div class="mt-3 space-y-2">
			{#each issueClusters.slice(0, 5) as cluster (cluster.key)}
				<div class="rounded-lg border border-border bg-card p-3 text-sm">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="font-semibold text-foreground">
								{cluster.source} · {cluster.severity ?? 'unknown'}
							</p>
							<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">
								{cluster.message}
							</p>
							<p class="mt-1 text-[11px] text-muted-foreground">
								Latest {formatDate(cluster.latest_at)}
							</p>
						</div>
						<div class="flex shrink-0 flex-col items-end gap-2">
							<span
								class={`rounded border px-2 py-0.5 text-xs font-semibold ${alertBadgeClass(cluster.count >= 3 ? 'bad' : 'warning')}`}
							>
								{formatNumber(cluster.count)}x
							</span>
							{#if cluster.session_id}
								<Button
									onclick={() =>
										cluster.session_id &&
										onLoadRedactedSession(cluster.session_id)}
									disabled={isLoadingSession &&
										selectedSessionId === cluster.session_id}
									variant="ghost"
									size="sm"
									class="pressable"
								>
									Inspect timeline
								</Button>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	</section>
{/if}
