<!-- apps/web/src/routes/profile/agent-keys/[callerId]/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		Activity,
		AlertTriangle,
		ArrowLeft,
		BarChart3,
		Clock,
		Layers,
		ListChecks,
		ShieldAlert,
		Terminal,
		Zap
	} from '$lib/icons/lucide';
	import type {
		BuildosAgentCallerSummary,
		BuildosAgentCallerUsageDetailResponse,
		BuildosAgentSecurityEventSummary,
		BuildosAgentUsageEvent,
		BuildosAgentUsageRangeKey,
		BuildosAgentUsageTimeBucket
	} from '@buildos/shared-types';
	import type { PageData } from './$types';
	import Button from '$lib/components/ui/Button.svelte';

	/** Dot tone for a status: success = healthy/on, warning = pending/attention, destructive = failed. */
	type Tone = 'success' | 'warning' | 'destructive' | 'muted';

	const TONE_DOT: Record<Tone, string> = {
		success: 'bg-success',
		warning: 'bg-warning',
		destructive: 'bg-destructive',
		muted: 'bg-muted-foreground/50'
	};

	let { data }: { data: PageData } = $props();

	let detail = $derived(data.usageDetail as BuildosAgentCallerUsageDetailResponse);
	let caller = $derived(detail.caller);
	let maxDailyActivity = $derived(
		Math.max(
			1,
			...detail.time_series.map((bucket) =>
				Math.max(bucket.session_count, bucket.tool_call_count, bucket.error_count)
			)
		)
	);
	let maxOperationCount = $derived(
		Math.max(1, ...detail.operation_breakdown.map((entry) => entry.tool_call_count))
	);
	let maxProjectCount = $derived(
		Math.max(1, ...detail.project_breakdown.map((entry) => entry.tool_call_count))
	);
	let failureRate = $derived(
		detail.totals.tool_call_count > 0
			? (detail.totals.failed_tool_call_count / detail.totals.tool_call_count) * 100
			: 0
	);
	let usageSignal = $derived(getUsageSignal(detail));
	let healthSignal = $derived(getHealthSignal(detail));

	const RANGE_OPTIONS: Array<{ key: BuildosAgentUsageRangeKey; label: string }> = [
		{ key: '7d', label: '7d' },
		{ key: '30d', label: '30d' },
		{ key: '90d', label: '90d' }
	];

	function installationDisplayName(caller: BuildosAgentCallerSummary): string {
		const metadataName = caller.metadata?.installation_name;
		if (typeof metadataName === 'string' && metadataName.trim()) {
			return metadataName.trim();
		}

		return caller.caller_key.split(':').at(-1)?.replace(/-/g, ' ') || caller.caller_key;
	}

	function displayProvider(provider: string): string {
		if (provider === 'openclaw') return 'OpenClaw';
		return provider
			.split(/[-_:]/g)
			.filter(Boolean)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	/** Display-only: turn a structured key like `read_write` into "Read write". */
	function humanizeKey(value: string | null | undefined): string {
		if (!value) return '';
		const text = value.replace(/[_.-]+/g, ' ').trim();
		return text ? text.charAt(0).toUpperCase() + text.slice(1) : value;
	}

	/** Display-only: `onto.task.create` -> "Task create". */
	function opLabel(op: string): string {
		return humanizeKey(op.replace(/^onto\./, ''));
	}

	function statusLabel(status: string): string {
		if (status === 'trusted') return 'Active';
		return humanizeKey(status);
	}

	function statusTone(status: string): Tone {
		if (status === 'trusted') return 'success';
		if (status === 'pending') return 'warning';
		if (status === 'revoked') return 'muted';
		return 'destructive';
	}

	function activityStatusTone(status: string): Tone {
		if (status === 'pending') return 'warning';
		if (status === 'failed') return 'destructive';
		return 'muted';
	}

	function securityTone(event: BuildosAgentSecurityEventSummary): Tone {
		if (event.severity === 'critical' || event.severity === 'high') return 'destructive';
		if (event.outcome === 'denied' || event.outcome === 'blocked') return 'warning';
		if (event.outcome === 'failure') return 'destructive';
		return 'muted';
	}

	function formatNumber(value: number): string {
		return value.toLocaleString();
	}

	function formatPercent(value: number): string {
		return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
	}

	function formatTimestamp(value: string | null | undefined): string {
		if (!value) return 'Never';
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return 'Unknown';
		return parsed.toLocaleString();
	}

	function formatRelativeTimestamp(value: string | null | undefined): string {
		if (!value) return 'Never';
		const parsed = new Date(value);
		const timestamp = parsed.getTime();
		if (Number.isNaN(timestamp)) return 'Unknown';
		const diffMs = Date.now() - timestamp;
		if (diffMs < 60_000) return 'Just now';
		const minutes = Math.floor(diffMs / 60_000);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 30) return `${days}d ago`;
		return parsed.toLocaleDateString();
	}

	function formatDuration(ms: number | null | undefined): string {
		if (!ms || ms < 0) return '--';
		const seconds = Math.round(ms / 1000);
		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.round(seconds / 60);
		if (minutes < 60) return `${minutes}m`;
		const hours = Math.floor(minutes / 60);
		const remainder = minutes % 60;
		return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
	}

	function dayLabel(bucket: BuildosAgentUsageTimeBucket): string {
		const parsed = new Date(`${bucket.date}T00:00:00.000Z`);
		if (Number.isNaN(parsed.getTime())) return bucket.date;
		return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function heightPercent(value: number, max: number, minimum = 4): number {
		if (value <= 0) return 0;
		return Math.max(minimum, Math.round((value / max) * 100));
	}

	function widthPercent(value: number, max: number): number {
		if (value <= 0) return 0;
		return Math.max(3, Math.round((value / max) * 100));
	}

	function eventMetaLabel(event: BuildosAgentUsageEvent): string {
		return [
			event.project_name,
			event.op ? opLabel(event.op) : humanizeKey(event.entity_kind),
			formatRelativeTimestamp(event.occurred_at)
		]
			.filter(Boolean)
			.join(' · ');
	}

	function rangeHref(key: BuildosAgentUsageRangeKey): string {
		return `/profile/agent-keys/${caller.id}?range=${key}`;
	}

	function getUsageSignal(payload: BuildosAgentCallerUsageDetailResponse): {
		label: string;
		tone: Tone;
	} {
		const callsPerDay = payload.totals.tool_call_count / Math.max(payload.range.days, 1);
		const sessionsPerDay = payload.totals.session_count / Math.max(payload.range.days, 1);

		if (callsPerDay >= 50 || sessionsPerDay >= 8) {
			return { label: 'High usage', tone: 'muted' };
		}
		if (callsPerDay >= 5 || sessionsPerDay >= 1) {
			return { label: 'Regular usage', tone: 'muted' };
		}
		if (payload.totals.session_count > 0) {
			return { label: 'Light usage', tone: 'muted' };
		}
		return { label: 'Quiet', tone: 'muted' };
	}

	function getHealthSignal(payload: BuildosAgentCallerUsageDetailResponse): {
		label: string;
		tone: Tone;
	} {
		if (payload.totals.denied_count > 0 || failureRate >= 10) {
			return { label: 'Needs review', tone: 'warning' };
		}
		if (payload.totals.error_count > 0) {
			return { label: 'Errors seen', tone: 'warning' };
		}
		return { label: 'No errors', tone: 'success' };
	}
</script>

{#snippet dot(tone: Tone, label: string)}
	<span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
		<span class="h-1.5 w-1.5 shrink-0 rounded-full {TONE_DOT[tone]}" aria-hidden="true"></span>
		{label}
	</span>
{/snippet}

<svelte:head>
	<title>{installationDisplayName(caller)} usage · BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen overflow-x-hidden bg-background text-foreground">
	<div class="mx-auto max-w-7xl px-4 py-4 sm:py-6 md:px-6 md:py-8 lg:px-8">
		<div
			class="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
		>
			<Button
				variant="ghost"
				size="sm"
				icon={ArrowLeft}
				onclick={() => goto('/profile?tab=people#agents')}
				class="self-start"
			>
				Agents
			</Button>

			<div
				class="flex w-full flex-wrap self-start rounded-lg border border-border bg-card p-1 sm:w-auto"
			>
				{#each RANGE_OPTIONS as option (option.key)}
					<a
						href={rangeHref(option.key)}
						aria-current={detail.range.key === option.key ? 'page' : undefined}
						class="flex-1 rounded-md px-3 py-1 text-center font-mono text-sm tabular-nums transition-colors sm:flex-none {detail
							.range.key === option.key
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}"
					>
						{option.label}
					</a>
				{/each}
			</div>
		</div>

		<section class="mb-6 min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6">
			<div class="min-w-0">
				<h1
					class="min-w-0 max-w-full break-words text-xl font-medium text-foreground sm:text-2xl"
				>
					{installationDisplayName(caller)}
				</h1>
				<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
					{@render dot(statusTone(caller.status), statusLabel(caller.status))}
					<span class="text-xs text-muted-foreground">
						{displayProvider(caller.provider)}
					</span>
					{@render dot(usageSignal.tone, usageSignal.label)}
					{@render dot(healthSignal.tone, healthSignal.label)}
				</div>
				<div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
					<a
						class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
						href={`/profile/agent-keys/${caller.id}/grant`}
						>Project access and shared projects</a
					>
					<a
						class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
						href={`/profile/agent-keys/${caller.id}/requests`}
						>Requests and ongoing permissions</a
					>
				</div>
			</div>

			<div
				class="mt-4 grid min-w-0 gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4"
			>
				<div class="min-w-0">
					<div class="text-xs text-muted-foreground">Caller key</div>
					<code class="mt-1 block break-all text-xs text-foreground"
						>{caller.caller_key}</code
					>
				</div>
				<div class="min-w-0">
					<div class="text-xs text-muted-foreground">Prefix</div>
					<code class="mt-1 block break-all text-xs text-foreground"
						>{caller.token_prefix}</code
					>
				</div>
				<div class="min-w-0">
					<div class="text-xs text-muted-foreground">Last activity</div>
					<p class="mt-1 text-xs text-foreground">
						{formatRelativeTimestamp(detail.totals.last_activity_at)}
					</p>
				</div>
				<div class="min-w-0">
					<div class="text-xs text-muted-foreground">Range</div>
					<p class="mt-1 text-xs text-foreground">
						{new Date(detail.range.start_at).toLocaleDateString()} – {new Date(
							detail.range.end_at
						).toLocaleDateString()}
					</p>
				</div>
			</div>
		</section>

		{#snippet stat(Icon: typeof Activity, label: string, value: string, note: string)}
			<div class="min-w-0 overflow-hidden rounded-xl border border-border bg-card p-4">
				<div class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
					<Icon class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					{label}
				</div>
				<div class="mt-2 truncate font-mono text-2xl font-medium tabular-nums">
					{value}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">{note}</p>
			</div>
		{/snippet}

		<section class="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
			{@render stat(
				Activity,
				'Sessions',
				formatNumber(detail.totals.session_count),
				`${detail.totals.active_session_count} active, ${detail.totals.rejected_session_count} rejected`
			)}
			{@render stat(
				Terminal,
				'Tool calls',
				formatNumber(detail.totals.tool_call_count),
				`${formatNumber(detail.totals.successful_tool_call_count)} succeeded`
			)}
			{@render stat(
				Zap,
				'Writes',
				formatNumber(detail.totals.write_count),
				`${formatNumber(detail.totals.failed_write_count)} failed`
			)}
			{@render stat(
				AlertTriangle,
				'Errors',
				formatNumber(detail.totals.error_count),
				`${formatPercent(failureRate)} tool failure rate`
			)}
			{@render stat(
				ShieldAlert,
				'Denied',
				formatNumber(detail.totals.denied_count),
				`${formatNumber(detail.totals.auth_failure_count)} auth failures`
			)}
			{@render stat(
				Clock,
				'Latency',
				formatDuration(detail.totals.avg_tool_latency_ms),
				`${formatDuration(detail.totals.avg_session_duration_ms)} avg session`
			)}
		</section>

		{#snippet sectionHeading(Icon: typeof Activity, title: string, meta: string)}
			<div class="mb-4 flex items-center justify-between gap-3">
				<h2 class="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
					<Icon class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					{title}
				</h2>
				<span class="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
					{meta}
				</span>
			</div>
		{/snippet}

		<div class="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
			<section class="min-w-0 rounded-xl border border-border bg-card p-4">
				{@render sectionHeading(BarChart3, 'Activity over time', detail.range.key)}

				<div class="h-44 max-w-full overflow-x-auto">
					<div class="flex h-full min-w-[560px] items-end gap-1 sm:min-w-[720px]">
						{#each detail.time_series as bucket (bucket.date)}
							<div class="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
								<div
									class="relative flex h-36 items-end rounded-md bg-muted/50 px-1"
								>
									<div
										class="w-full rounded-t bg-foreground/25"
										style="height: {heightPercent(
											bucket.tool_call_count,
											maxDailyActivity
										)}%"
										title="{bucket.tool_call_count} tool calls"
									></div>
									{#if bucket.write_count > 0}
										<div
											class="absolute bottom-0 left-1 right-1 rounded-t bg-foreground/60"
											style="height: {heightPercent(
												bucket.write_count,
												maxDailyActivity,
												5
											)}%"
											title="{bucket.write_count} writes"
										></div>
									{/if}
									{#if bucket.error_count > 0 || bucket.denied_count > 0}
										<div
											class="absolute bottom-0 left-1 right-1 rounded-t bg-destructive/85"
											style="height: {heightPercent(
												bucket.error_count + bucket.denied_count,
												maxDailyActivity,
												6
											)}%"
											title="{bucket.error_count +
												bucket.denied_count} problem events"
										></div>
									{/if}
								</div>
								<div class="truncate text-center text-2xs text-muted-foreground">
									{dayLabel(bucket)}
								</div>
							</div>
						{/each}
					</div>
				</div>
				<div class="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
					<span class="inline-flex items-center gap-1">
						<span class="h-2 w-2 rounded-sm bg-foreground/25"></span>Tool calls
					</span>
					<span class="inline-flex items-center gap-1">
						<span class="h-2 w-2 rounded-sm bg-foreground/60"></span>Writes
					</span>
					<span class="inline-flex items-center gap-1">
						<span class="h-2 w-2 rounded-sm bg-destructive/85"></span>Errors / denied
					</span>
				</div>
			</section>

			<section class="min-w-0 rounded-xl border border-border bg-card p-4">
				{@render sectionHeading(
					ListChecks,
					'Operation mix',
					`${detail.operation_breakdown.length} ${detail.operation_breakdown.length === 1 ? 'op' : 'ops'}`
				)}

				{#if detail.operation_breakdown.length > 0}
					<div class="space-y-3">
						{#each detail.operation_breakdown.slice(0, 8) as op (op.op)}
							<div class="min-w-0">
								<div class="mb-1 flex items-center justify-between gap-3 text-xs">
									<span
										class="min-w-0 flex-1 truncate text-foreground"
										title={op.op}>{opLabel(op.op)}</span
									>
									<span
										class="shrink-0 font-mono tabular-nums text-muted-foreground"
									>
										{formatNumber(op.tool_call_count)} calls
									</span>
								</div>
								<div class="h-2 overflow-hidden rounded-full bg-muted">
									<div
										class="h-full rounded-full bg-foreground/40"
										style="width: {widthPercent(
											op.tool_call_count,
											maxOperationCount
										)}%"
									></div>
								</div>
								<div
									class="mt-1 flex flex-wrap gap-2 font-mono text-2xs tabular-nums text-muted-foreground"
								>
									<span>{formatNumber(op.write_count)} writes</span>
									<span>{formatNumber(op.failed_count)} failed</span>
									<span>{formatPercent(op.failure_rate)} failure rate</span>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div
						class="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
					>
						No tracked tool calls in this range
					</div>
				{/if}
			</section>
		</div>

		<div class="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<section class="min-w-0 rounded-xl border border-border bg-card p-4">
				{@render sectionHeading(
					Layers,
					'Project impact',
					`${detail.totals.project_count} touched`
				)}

				{#if detail.project_breakdown.length > 0}
					<div class="space-y-3">
						{#each detail.project_breakdown.slice(0, 8) as project (project.project_id ?? 'workspace')}
							<div class="min-w-0">
								<div class="mb-1 flex items-center justify-between gap-3 text-xs">
									<span
										class="min-w-0 flex-1 truncate font-medium text-foreground"
									>
										{project.project_name ?? 'Workspace'}
									</span>
									<span
										class="shrink-0 font-mono tabular-nums text-muted-foreground"
									>
										{formatNumber(project.tool_call_count)} calls
									</span>
								</div>
								<div class="h-2 overflow-hidden rounded-full bg-muted">
									<div
										class="h-full rounded-full bg-foreground/40"
										style="width: {widthPercent(
											project.tool_call_count,
											maxProjectCount
										)}%"
									></div>
								</div>
								<div
									class="mt-1 flex flex-wrap gap-2 font-mono text-2xs tabular-nums text-muted-foreground"
								>
									<span>{formatNumber(project.write_count)} writes</span>
									<span>{formatNumber(project.failed_count)} failed</span>
									<span>{formatRelativeTimestamp(project.last_activity_at)}</span>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div
						class="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
					>
						No project-level activity in this range
					</div>
				{/if}
			</section>

			<section class="min-w-0 rounded-xl border border-border bg-card p-4">
				<div class="mb-4 flex items-center justify-between gap-3">
					<h2 class="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
						<ShieldAlert
							class="h-4 w-4 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
						Errors and access
					</h2>
					{@render dot(healthSignal.tone, healthSignal.label)}
				</div>

				{#if detail.security_events.length > 0}
					<div class="max-h-[380px] space-y-2 overflow-y-auto pr-1">
						{#each detail.security_events as event (event.id)}
							<div class="min-w-0 rounded-lg border border-border bg-muted/30 p-3">
								<div
									class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
								>
									<div class="min-w-0">
										<p class="truncate text-sm font-medium text-foreground">
											{event.message}
										</p>
										<p class="mt-1 text-xs text-muted-foreground">
											{humanizeKey(event.event_type)} · {formatRelativeTimestamp(
												event.created_at
											)}
										</p>
									</div>
									<div
										class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1"
									>
										{@render dot(
											securityTone(event),
											humanizeKey(event.outcome)
										)}
										<span class="text-xs text-muted-foreground">
											{humanizeKey(event.severity)}
										</span>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div
						class="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
					>
						No security or access events in this range
					</div>
				{/if}
			</section>
		</div>

		<div class="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
			<section class="min-w-0 rounded-xl border border-border bg-card p-4">
				{@render sectionHeading(
					Terminal,
					'Recent tool activity',
					`${detail.events.length} ${detail.events.length === 1 ? 'row' : 'rows'}`
				)}

				{#if detail.events.length > 0}
					<div class="max-h-[520px] space-y-2 overflow-y-auto pr-1">
						{#each detail.events as event (event.id)}
							<div class="min-w-0 rounded-lg border border-border bg-muted/30 p-3">
								<div
									class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
								>
									<div class="min-w-0">
										<p class="truncate text-sm font-medium text-foreground">
											{event.summary}
										</p>
										<p class="mt-1 text-xs text-muted-foreground">
											{eventMetaLabel(event)}
										</p>
										{#if event.error_message}
											<p class="mt-1 text-xs text-destructive">
												{event.error_message}
											</p>
										{/if}
									</div>
									<span class="shrink-0">
										{@render dot(
											activityStatusTone(event.status),
											humanizeKey(event.status)
										)}
									</span>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div
						class="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
					>
						No tracked direct tool activity in this range
					</div>
				{/if}
			</section>

			<section class="min-w-0 rounded-xl border border-border bg-card p-4">
				{@render sectionHeading(Activity, 'Sessions', `${detail.sessions.length} recent`)}

				{#if detail.sessions.length > 0}
					<div class="max-w-full overflow-x-auto">
						<table class="w-full min-w-[520px] text-left text-xs sm:min-w-[560px]">
							<thead class="border-b border-border text-muted-foreground">
								<tr>
									<th class="py-2 pr-3 font-medium">Started</th>
									<th class="py-2 pr-3 font-medium">Status</th>
									<th class="py-2 pr-3 font-medium">Scope</th>
									<th class="py-2 pr-3 font-medium text-right">Calls</th>
									<th class="py-2 pr-3 font-medium text-right">Writes</th>
									<th class="py-2 font-medium text-right">Duration</th>
								</tr>
							</thead>
							<tbody>
								{#each detail.sessions as session (session.id)}
									<tr class="border-b border-border/60 last:border-0">
										<td class="py-2 pr-3 text-muted-foreground">
											{formatTimestamp(session.started_at)}
										</td>
										<td class="py-2 pr-3">
											{@render dot(
												session.status === 'rejected' ? 'warning' : 'muted',
												humanizeKey(session.status)
											)}
										</td>
										<td class="py-2 pr-3 text-muted-foreground">
											{humanizeKey(
												session.granted_scope_mode ??
													session.requested_scope_mode
											) || '--'}
										</td>
										<td
											class="py-2 pr-3 text-right font-mono tabular-nums text-foreground"
										>
											{formatNumber(session.tool_call_count)}
										</td>
										<td
											class="py-2 pr-3 text-right font-mono tabular-nums text-foreground"
										>
											{formatNumber(session.write_count)}
										</td>
										<td
											class="py-2 text-right font-mono tabular-nums text-muted-foreground"
										>
											{formatDuration(session.duration_ms)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div
						class="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
					>
						No sessions in this range
					</div>
				{/if}
			</section>
		</div>
	</div>
</div>
