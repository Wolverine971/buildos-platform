<!-- apps/web/src/routes/profile/agent-keys/[callerId]/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		Activity,
		AlertTriangle,
		ArrowLeft,
		BarChart3,
		Clock,
		Key,
		Layers,
		ListChecks,
		ShieldAlert,
		Terminal,
		Zap
	} from 'lucide-svelte';
	import type {
		BuildosAgentCallerSummary,
		BuildosAgentCallerUsageDetailResponse,
		BuildosAgentSecurityEventSummary,
		BuildosAgentUsageEvent,
		BuildosAgentUsageRangeKey,
		BuildosAgentUsageTimeBucket
	} from '@buildos/shared-types';
	import type { PageData } from './$types';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent';

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

	function statusVariant(status: string): BadgeVariant {
		if (status === 'trusted') return 'success';
		if (status === 'pending') return 'warning';
		return 'error';
	}

	function activityStatusVariant(status: string): BadgeVariant {
		if (status === 'succeeded') return 'success';
		if (status === 'pending') return 'warning';
		if (status === 'failed') return 'error';
		return 'info';
	}

	function securityVariant(event: BuildosAgentSecurityEventSummary): BadgeVariant {
		if (event.severity === 'critical' || event.severity === 'high') return 'error';
		if (event.outcome === 'denied' || event.outcome === 'blocked') return 'warning';
		if (event.outcome === 'failure') return 'error';
		if (event.outcome === 'success') return 'success';
		return 'default';
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
			event.entity_kind,
			event.op,
			formatRelativeTimestamp(event.occurred_at)
		]
			.filter(Boolean)
			.join(' | ');
	}

	function rangeHref(key: BuildosAgentUsageRangeKey): string {
		return `/profile/agent-keys/${caller.id}?range=${key}`;
	}

	function getUsageSignal(payload: BuildosAgentCallerUsageDetailResponse): {
		label: string;
		variant: BadgeVariant;
	} {
		const callsPerDay = payload.totals.tool_call_count / Math.max(payload.range.days, 1);
		const sessionsPerDay = payload.totals.session_count / Math.max(payload.range.days, 1);

		if (callsPerDay >= 50 || sessionsPerDay >= 8) {
			return { label: 'High usage', variant: 'accent' };
		}
		if (callsPerDay >= 5 || sessionsPerDay >= 1) {
			return { label: 'Active', variant: 'success' };
		}
		if (payload.totals.session_count > 0) {
			return { label: 'Light usage', variant: 'info' };
		}
		return { label: 'Quiet', variant: 'default' };
	}

	function getHealthSignal(payload: BuildosAgentCallerUsageDetailResponse): {
		label: string;
		variant: BadgeVariant;
	} {
		if (payload.totals.denied_count > 0 || failureRate >= 10) {
			return { label: 'Needs review', variant: 'warning' };
		}
		if (payload.totals.error_count > 0) {
			return { label: 'Errors seen', variant: 'warning' };
		}
		return { label: 'No errors', variant: 'success' };
	}
</script>

<svelte:head>
	<title>{installationDisplayName(caller)} Agent Usage - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen overflow-x-hidden bg-background text-foreground">
	<div class="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8">
		<div
			class="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
		>
			<Button
				variant="ghost"
				size="sm"
				icon={ArrowLeft}
				onclick={() => goto('/profile?tab=agent-keys')}
				class="self-start"
			>
				Agent Keys
			</Button>

			<div
				class="flex w-full flex-wrap self-start rounded-lg border border-border bg-card p-1 shadow-ink sm:w-auto"
			>
				{#each RANGE_OPTIONS as option (option.key)}
					<a
						href={rangeHref(option.key)}
						class="flex-1 rounded-md px-3 py-1.5 text-center text-sm font-semibold transition-colors sm:flex-none {detail
							.range.key === option.key
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
					>
						{option.label}
					</a>
				{/each}
			</div>
		</div>

		<section
			class="tx tx-frame tx-weak mb-5 min-w-0 rounded-lg border border-border bg-card p-4 shadow-ink"
		>
			<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-2">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-accent shadow-ink"
						>
							<Key class="h-5 w-5 text-accent-foreground" />
						</div>
						<h1
							class="min-w-0 max-w-full break-words text-xl font-bold text-foreground sm:text-2xl"
						>
							{installationDisplayName(caller)}
						</h1>
						<Badge variant={statusVariant(caller.status)}>{caller.status}</Badge>
						<Badge variant="default">{displayProvider(caller.provider)}</Badge>
						<Badge variant={usageSignal.variant}>{usageSignal.label}</Badge>
						<Badge variant={healthSignal.variant}>{healthSignal.label}</Badge>
					</div>

					<div
						class="mt-3 grid min-w-0 gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4"
					>
						<div class="min-w-0">
							<span class="font-medium text-foreground">Caller key:</span>
							<code class="ml-1 break-all">{caller.caller_key}</code>
						</div>
						<div class="min-w-0">
							<span class="font-medium text-foreground">Prefix:</span>
							<code class="ml-1 break-all">{caller.token_prefix}</code>
						</div>
						<div class="min-w-0">
							<span class="font-medium text-foreground">Last activity:</span>
							<span class="ml-1"
								>{formatRelativeTimestamp(detail.totals.last_activity_at)}</span
							>
						</div>
						<div class="min-w-0">
							<span class="font-medium text-foreground">Range:</span>
							<span class="ml-1">
								{new Date(detail.range.start_at).toLocaleDateString()} - {new Date(
									detail.range.end_at
								).toLocaleDateString()}
							</span>
						</div>
					</div>
				</div>
			</div>
		</section>

		<section class="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
			<div
				class="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-3 shadow-ink"
			>
				<div
					class="flex min-w-0 items-center gap-2 text-xs uppercase text-muted-foreground"
				>
					<Activity class="h-3.5 w-3.5" />
					Sessions
				</div>
				<div class="mt-2 truncate text-2xl font-bold">
					{formatNumber(detail.totals.session_count)}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					{detail.totals.active_session_count} active, {detail.totals
						.rejected_session_count}
					rejected
				</p>
			</div>
			<div
				class="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-3 shadow-ink"
			>
				<div
					class="flex min-w-0 items-center gap-2 text-xs uppercase text-muted-foreground"
				>
					<Terminal class="h-3.5 w-3.5" />
					Tool Calls
				</div>
				<div class="mt-2 truncate text-2xl font-bold">
					{formatNumber(detail.totals.tool_call_count)}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					{formatNumber(detail.totals.successful_tool_call_count)} succeeded
				</p>
			</div>
			<div
				class="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-3 shadow-ink"
			>
				<div
					class="flex min-w-0 items-center gap-2 text-xs uppercase text-muted-foreground"
				>
					<Zap class="h-3.5 w-3.5" />
					Writes
				</div>
				<div class="mt-2 truncate text-2xl font-bold">
					{formatNumber(detail.totals.write_count)}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					{formatNumber(detail.totals.failed_write_count)} failed
				</p>
			</div>
			<div
				class="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-3 shadow-ink"
			>
				<div
					class="flex min-w-0 items-center gap-2 text-xs uppercase text-muted-foreground"
				>
					<AlertTriangle class="h-3.5 w-3.5" />
					Errors
				</div>
				<div class="mt-2 truncate text-2xl font-bold">
					{formatNumber(detail.totals.error_count)}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					{formatPercent(failureRate)} tool failure rate
				</p>
			</div>
			<div
				class="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-3 shadow-ink"
			>
				<div
					class="flex min-w-0 items-center gap-2 text-xs uppercase text-muted-foreground"
				>
					<ShieldAlert class="h-3.5 w-3.5" />
					Denied
				</div>
				<div class="mt-2 truncate text-2xl font-bold">
					{formatNumber(detail.totals.denied_count)}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					{formatNumber(detail.totals.auth_failure_count)} auth failures
				</p>
			</div>
			<div
				class="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-3 shadow-ink"
			>
				<div
					class="flex min-w-0 items-center gap-2 text-xs uppercase text-muted-foreground"
				>
					<Clock class="h-3.5 w-3.5" />
					Latency
				</div>
				<div class="mt-2 truncate text-2xl font-bold">
					{formatDuration(detail.totals.avg_tool_latency_ms)}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					{formatDuration(detail.totals.avg_session_duration_ms)} avg session
				</p>
			</div>
		</section>

		<div class="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
			<section class="min-w-0 rounded-lg border border-border bg-card p-4 shadow-ink">
				<div class="mb-4 flex items-center justify-between gap-3">
					<h2
						class="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground"
					>
						<BarChart3 class="h-4 w-4 text-accent" />
						Activity Over Time
					</h2>
					<Badge variant="default" size="sm">{detail.range.key}</Badge>
				</div>

				<div class="h-44 max-w-full overflow-x-auto">
					<div class="flex h-full min-w-[560px] items-end gap-1 sm:min-w-[720px]">
						{#each detail.time_series as bucket (bucket.date)}
							<div class="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
								<div
									class="relative flex h-36 items-end rounded-md bg-muted/50 px-1"
								>
									<div
										class="w-full rounded-t bg-accent/75"
										style="height: {heightPercent(
											bucket.tool_call_count,
											maxDailyActivity
										)}%"
										title="{bucket.tool_call_count} tool calls"
									></div>
									{#if bucket.write_count > 0}
										<div
											class="absolute bottom-0 left-1 right-1 rounded-t bg-emerald-500/80"
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
											class="absolute bottom-0 left-1 right-1 rounded-t bg-red-500/85"
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
								<div
									class="truncate text-center text-[0.65rem] text-muted-foreground"
								>
									{dayLabel(bucket)}
								</div>
							</div>
						{/each}
					</div>
				</div>
				<div class="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
					<span class="inline-flex items-center gap-1">
						<span class="h-2 w-2 rounded-sm bg-accent/75"></span>Tool calls
					</span>
					<span class="inline-flex items-center gap-1">
						<span class="h-2 w-2 rounded-sm bg-emerald-500/80"></span>Writes
					</span>
					<span class="inline-flex items-center gap-1">
						<span class="h-2 w-2 rounded-sm bg-red-500/85"></span>Errors / denied
					</span>
				</div>
			</section>

			<section class="min-w-0 rounded-lg border border-border bg-card p-4 shadow-ink">
				<div class="mb-4 flex items-center justify-between gap-3">
					<h2
						class="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground"
					>
						<ListChecks class="h-4 w-4 text-accent" />
						Operation Mix
					</h2>
					<Badge variant="info" size="sm">{detail.operation_breakdown.length} ops</Badge>
				</div>

				{#if detail.operation_breakdown.length > 0}
					<div class="space-y-3">
						{#each detail.operation_breakdown.slice(0, 8) as op (op.op)}
							<div class="min-w-0">
								<div class="mb-1 flex items-center justify-between gap-3 text-xs">
									<code class="min-w-0 flex-1 truncate text-foreground"
										>{op.op}</code
									>
									<span class="shrink-0 text-muted-foreground">
										{formatNumber(op.tool_call_count)} calls
									</span>
								</div>
								<div class="h-2 overflow-hidden rounded-full bg-muted">
									<div
										class="h-full rounded-full bg-accent"
										style="width: {widthPercent(
											op.tool_call_count,
											maxOperationCount
										)}%"
									></div>
								</div>
								<div
									class="mt-1 flex flex-wrap gap-2 text-[0.7rem] text-muted-foreground"
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
						class="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground"
					>
						No tracked tool calls in this range.
					</div>
				{/if}
			</section>
		</div>

		<div class="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<section class="min-w-0 rounded-lg border border-border bg-card p-4 shadow-ink">
				<div class="mb-4 flex items-center justify-between gap-3">
					<h2
						class="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground"
					>
						<Layers class="h-4 w-4 text-accent" />
						Project Impact
					</h2>
					<Badge variant="default" size="sm">{detail.totals.project_count} touched</Badge>
				</div>

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
									<span class="shrink-0 text-muted-foreground">
										{formatNumber(project.tool_call_count)} calls
									</span>
								</div>
								<div class="h-2 overflow-hidden rounded-full bg-muted">
									<div
										class="h-full rounded-full bg-emerald-500"
										style="width: {widthPercent(
											project.tool_call_count,
											maxProjectCount
										)}%"
									></div>
								</div>
								<div
									class="mt-1 flex flex-wrap gap-2 text-[0.7rem] text-muted-foreground"
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
						class="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground"
					>
						No project-level activity in this range.
					</div>
				{/if}
			</section>

			<section class="min-w-0 rounded-lg border border-border bg-card p-4 shadow-ink">
				<div class="mb-4 flex items-center justify-between gap-3">
					<h2
						class="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground"
					>
						<ShieldAlert class="h-4 w-4 text-accent" />
						Error And Access Signals
					</h2>
					<Badge variant={healthSignal.variant} size="sm">{healthSignal.label}</Badge>
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
											{event.event_type} | {formatRelativeTimestamp(
												event.created_at
											)}
										</p>
									</div>
									<div class="flex flex-wrap gap-1.5">
										<Badge variant={securityVariant(event)} size="sm">
											{event.outcome}
										</Badge>
										<Badge variant="default" size="sm">{event.severity}</Badge>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div
						class="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground"
					>
						No security or access events in this range.
					</div>
				{/if}
			</section>
		</div>

		<div class="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
			<section class="min-w-0 rounded-lg border border-border bg-card p-4 shadow-ink">
				<div class="mb-4 flex items-center justify-between gap-3">
					<h2
						class="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground"
					>
						<Terminal class="h-4 w-4 text-accent" />
						Recent Tool Activity
					</h2>
					<Badge variant="info" size="sm">{detail.events.length} rows</Badge>
				</div>

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
											<p class="mt-1 text-xs text-red-600 dark:text-red-400">
												{event.error_message}
											</p>
										{/if}
									</div>
									<Badge variant={activityStatusVariant(event.status)} size="sm">
										{event.status}
									</Badge>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div
						class="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground"
					>
						No tracked direct tool activity in this range.
					</div>
				{/if}
			</section>

			<section class="min-w-0 rounded-lg border border-border bg-card p-4 shadow-ink">
				<div class="mb-4 flex items-center justify-between gap-3">
					<h2
						class="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground"
					>
						<Activity class="h-4 w-4 text-accent" />
						Sessions
					</h2>
					<Badge variant="default" size="sm">{detail.sessions.length} recent</Badge>
				</div>

				{#if detail.sessions.length > 0}
					<div class="max-w-full overflow-x-auto">
						<table class="w-full min-w-[520px] text-left text-xs sm:min-w-[560px]">
							<thead class="border-b border-border text-muted-foreground">
								<tr>
									<th class="py-2 pr-3 font-semibold">Started</th>
									<th class="py-2 pr-3 font-semibold">Status</th>
									<th class="py-2 pr-3 font-semibold">Scope</th>
									<th class="py-2 pr-3 font-semibold text-right">Calls</th>
									<th class="py-2 pr-3 font-semibold text-right">Writes</th>
									<th class="py-2 font-semibold text-right">Duration</th>
								</tr>
							</thead>
							<tbody>
								{#each detail.sessions as session (session.id)}
									<tr class="border-b border-border/60 last:border-0">
										<td class="py-2 pr-3 text-muted-foreground">
											{formatTimestamp(session.started_at)}
										</td>
										<td class="py-2 pr-3">
											<Badge
												variant={session.status === 'rejected'
													? 'warning'
													: 'default'}
												size="sm"
											>
												{session.status}
											</Badge>
										</td>
										<td class="py-2 pr-3 text-muted-foreground">
											{session.granted_scope_mode ??
												session.requested_scope_mode ??
												'--'}
										</td>
										<td class="py-2 pr-3 text-right text-foreground">
											{formatNumber(session.tool_call_count)}
										</td>
										<td class="py-2 pr-3 text-right text-foreground">
											{formatNumber(session.write_count)}
										</td>
										<td class="py-2 text-right text-muted-foreground">
											{formatDuration(session.duration_ms)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div
						class="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground"
					>
						No sessions in this range.
					</div>
				{/if}
			</section>
		</div>
	</div>
</div>
