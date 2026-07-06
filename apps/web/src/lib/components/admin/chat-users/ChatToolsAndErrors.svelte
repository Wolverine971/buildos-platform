<!-- apps/web/src/lib/components/admin/chat-users/ChatToolsAndErrors.svelte -->
<script lang="ts">
	import { formatDate, formatMs, formatNumber } from './chat-user-ui';
	import type { UserDetail } from './chat-user-types';

	interface Props {
		userDetail: UserDetail;
	}

	let { userDetail }: Props = $props();
</script>

<section class="grid gap-4 md:grid-cols-2">
	<div>
		<h3 class="micro-label font-semibold">Tools</h3>
		<div class="mt-3 space-y-2">
			{#each userDetail.tools.slice(0, 8) as tool}
				<div class="rounded-lg border border-border bg-card p-3 text-sm">
					<p class="font-semibold text-foreground">{tool.tool_name}</p>
					<p class="text-xs text-muted-foreground">
						{tool.gateway_op ?? 'no op'} · {formatNumber(tool.count)} calls · {formatNumber(
							tool.failures
						)} failed · p95 {formatMs(tool.p95_execution_time_ms)}
					</p>
				</div>
			{/each}
		</div>
	</div>
	<div>
		<h3 class="micro-label font-semibold">Errors</h3>
		<div class="mt-3 space-y-2">
			{#each userDetail.errors.slice(0, 8) as item}
				<div class="rounded-lg border border-border bg-card p-3 text-sm">
					<p class="font-semibold text-foreground">
						{item.source} · {item.severity ?? 'unknown'}
					</p>
					<p class="line-clamp-2 text-xs text-muted-foreground">
						{item.error_message}
					</p>
					<p class="mt-1 text-[11px] text-muted-foreground">
						{formatDate(item.created_at)}
					</p>
				</div>
			{/each}
		</div>
	</div>
</section>
