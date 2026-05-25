<!-- apps/web/src/lib/components/admin/chat/SessionMetricsHeader.svelte -->
<script lang="ts">
	import { Download } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		formatCurrency,
		formatDateTime,
		formatNumber
	} from '$lib/services/admin/chat-session-audit-formatters';
	import type { ChatSessionAuditPayload as SessionDetailPayload } from '$lib/services/admin/chat-session-audit-types';
	import { statusBadge } from './session-audit-ui';

	let {
		sessionDetail,
		onExport
	}: {
		sessionDetail: SessionDetailPayload;
		onExport: () => void;
	} = $props();
</script>

<div class="flex flex-wrap items-start justify-between gap-3">
	<div class="min-w-0 flex-1">
		<h2 class="text-base font-semibold text-foreground leading-tight truncate">
			{sessionDetail.session.title}
		</h2>
		<div class="mt-0.5 text-xs text-muted-foreground">
			{sessionDetail.session.user.email} · {sessionDetail.session.context_type}
		</div>
		<div class="mt-0.5 text-xs text-muted-foreground">
			Created {formatDateTime(sessionDetail.session.created_at)} · Updated
			{formatDateTime(sessionDetail.session.updated_at)}
		</div>
	</div>
	<div class="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
		<Button onclick={onExport} icon={Download} variant="secondary" size="sm" class="pressable">
			Export Markdown
		</Button>
		<span
			class="px-2 py-0.5 rounded-full text-xs font-medium {statusBadge(
				sessionDetail.session.status
			)}"
		>
			{sessionDetail.session.status}
		</span>
		{#if sessionDetail.session.has_errors}
			<span
				class="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-700 dark:text-red-300"
			>
				Errors
			</span>
		{/if}
	</div>
</div>

<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-9 gap-1.5">
	<div class="rounded-lg border border-border bg-background p-2">
		<div class="text-xs text-foreground/70">Turns</div>
		<div class="text-sm font-semibold text-foreground">
			{formatNumber(sessionDetail.turn_runs.length)}
		</div>
	</div>
	<div class="rounded-lg border border-border bg-background p-2">
		<div class="text-xs text-foreground/70">Messages</div>
		<div class="text-sm font-semibold text-foreground">
			{formatNumber(sessionDetail.metrics.messages)}
		</div>
	</div>
	<div class="rounded-lg border border-border bg-background p-2">
		<div class="text-xs text-foreground/70">Tool Calls</div>
		<div class="text-sm font-semibold text-foreground">
			{formatNumber(sessionDetail.metrics.tool_calls)}
		</div>
	</div>
	<div class="rounded-lg border border-border bg-background p-2">
		<div class="text-xs text-foreground/70">LLM Calls</div>
		<div class="text-sm font-semibold text-foreground">
			{formatNumber(sessionDetail.metrics.llm_calls)}
		</div>
	</div>
	<div class="rounded-lg border border-border bg-background p-2">
		<div class="text-xs text-foreground/70">Tokens</div>
		<div class="text-sm font-semibold text-foreground">
			{formatNumber(sessionDetail.metrics.total_tokens)}
		</div>
	</div>
	<div class="rounded-lg border border-border bg-background p-2">
		<div class="text-xs text-foreground/70">Cost</div>
		<div class="text-sm font-semibold text-foreground">
			{formatCurrency(sessionDetail.metrics.total_cost_usd)}
		</div>
	</div>
	<div class="rounded-lg border border-border bg-background p-2">
		<div class="text-xs text-foreground/70">Failures</div>
		<div class="text-sm font-semibold text-foreground">
			{formatNumber(sessionDetail.metrics.tool_failures + sessionDetail.metrics.llm_failures)}
		</div>
	</div>
	<div class="rounded-lg border border-border bg-background p-2">
		<div class="text-xs text-foreground/70">Prompt Snapshots</div>
		<div class="text-sm font-semibold text-foreground">
			{formatNumber(sessionDetail.turn_runs.filter((run) => !!run.prompt_snapshot).length)}
		</div>
	</div>
	<div class="rounded-lg border border-border bg-background p-2">
		<div class="text-xs text-foreground/70">Validation Failures</div>
		<div class="text-sm font-semibold text-foreground">
			{formatNumber(
				sessionDetail.turn_runs.reduce(
					(sum, run) => sum + (run.validation_failure_count ?? 0),
					0
				)
			)}
		</div>
	</div>
</div>

<div class="rounded-lg border border-border bg-background px-3 py-2">
	<div class="text-xs font-semibold text-foreground/60 uppercase tracking-wide">
		Conversation Replay
	</div>
	<div class="mt-1 text-xs text-muted-foreground">
		Skim the user and BuildOS messages as chat bubbles. Tool activity is collapsed under each
		turn, with arguments, results, linked records, and raw payloads available when needed.
	</div>
</div>
