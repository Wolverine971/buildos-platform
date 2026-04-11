<!-- apps/web/src/routes/admin/security/+page.svelte -->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import {
		Activity,
		AlertTriangle,
		Bot,
		Bug,
		CheckCircle2,
		ContactRound,
		Database,
		Eye,
		KeyRound,
		LockKeyhole,
		RefreshCw,
		ShieldAlert,
		ShieldCheck,
		XCircle
	} from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminStatCard from '$lib/components/admin/AdminStatCard.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import type { PageData } from './$types';

	type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent';
	type CardTone = 'default' | 'muted' | 'brand' | 'success' | 'danger' | 'warning' | 'info';
	type Analysis = NonNullable<PageData['analysis']>;
	type PromptInjectionEvent = Analysis['promptInjection']['recentEvents'][number];
	type StreamSecurityEvent = Analysis['securityEventStream']['recentEvents'][number];
	type DataSource = Analysis['dataSources'][number];

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	let selectedTimeframe = $state(data.timeframe ?? '30d');
	let refreshing = $state(false);
	let autoRefresh = $state(true);
	let selectedSecurityEvent = $state<PromptInjectionEvent | null>(null);

	let analysis = $derived(data.analysis);

	$effect(() => {
		selectedTimeframe = data.timeframe ?? '30d';
	});

	onMount(() => {
		const interval = window.setInterval(() => {
			if (autoRefresh && !refreshing) {
				void refresh();
			}
		}, 15_000);

		return () => window.clearInterval(interval);
	});

	async function changeTimeframe() {
		const params = new URLSearchParams(window.location.search);
		params.set('timeframe', selectedTimeframe);
		await goto(`/admin/security?${params.toString()}`, {
			keepFocus: true,
			noScroll: true
		});
	}

	async function refresh() {
		refreshing = true;
		try {
			await invalidateAll();
		} finally {
			refreshing = false;
		}
	}

	function formatNumber(value: number | null | undefined): string {
		return new Intl.NumberFormat().format(value ?? 0);
	}

	function formatDate(value: string | null | undefined): string {
		if (!value) return 'Never';
		return new Date(value).toLocaleString();
	}

	function formatShortDate(value: string | null | undefined): string {
		if (!value) return 'Never';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(value));
	}

	function formatNullableDate(value: string | null): string {
		if (!value) return 'never';
		return formatShortDate(value);
	}

	function formatEventType(value: string): string {
		return value
			.split(/[._-]/)
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	function maskId(value: string | null | undefined): string {
		if (!value) return 'unknown';
		if (value.length <= 12) return value;
		return `${value.slice(0, 8)}...${value.slice(-4)}`;
	}

	function metadataRows(metadata: Record<string, unknown> | null | undefined) {
		return Object.entries(metadata ?? {}).map(([key, value]) => ({
			key,
			value:
				typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
		}));
	}

	function actorLabel(event: StreamSecurityEvent): string {
		if (event.externalAgentCallerId) return `agent ${maskId(event.externalAgentCallerId)}`;
		if (event.actorUserId) return maskId(event.actorUserId);
		return event.actorType || 'system';
	}

	function targetLabel(event: StreamSecurityEvent): string {
		if (!event.targetType && !event.targetId) return 'none';
		if (!event.targetId) return event.targetType || 'unknown';
		return `${event.targetType || 'target'} ${maskId(event.targetId)}`;
	}

	function postureTone(level: Analysis['posture']['level']): CardTone {
		switch (level) {
			case 'low':
				return 'success';
			case 'moderate':
				return 'warning';
			case 'high':
			case 'critical':
				return 'danger';
			default:
				return 'default';
		}
	}

	function severityBadge(severity: string): BadgeVariant {
		switch (severity) {
			case 'critical':
			case 'high':
			case 'error':
				return 'error';
			case 'medium':
				return 'warning';
			case 'low':
			case 'info':
				return 'info';
			default:
				return 'default';
		}
	}

	function sourceBadge(source: DataSource): BadgeVariant {
		switch (source.status) {
			case 'available':
				return 'success';
			case 'empty':
				return 'info';
			case 'error':
				return 'error';
			default:
				return 'default';
		}
	}

	function eventBadge(eventType: string): BadgeVariant {
		switch (eventType) {
			case 'prompt_injection_blocked':
			case 'rate_limit_exceeded':
				return 'error';
			case 'prompt_injection_detected':
				return 'warning';
			case 'prompt_injection_false_positive':
				return 'success';
			default:
				return 'info';
		}
	}

	function outcomeBadge(outcome: string): BadgeVariant {
		switch (String(outcome).toLowerCase()) {
			case 'success':
			case 'allowed':
				return 'success';
			case 'blocked':
			case 'denied':
				return 'error';
			case 'failure':
				return 'warning';
			case 'info':
				return 'info';
			default:
				return 'default';
		}
	}

	function statusBadge(status: string): BadgeVariant {
		switch (String(status).toLowerCase()) {
			case 'active':
			case 'trusted':
			case 'succeeded':
			case 'processed':
				return 'success';
			case 'pending':
			case 'retrying':
				return 'warning';
			case 'failed':
			case 'error':
			case 'revoked':
			case 'disabled':
				return 'error';
			default:
				return 'default';
		}
	}
</script>

<div class="admin-page">
	<AdminPageHeader
		title="Security Center"
		description="Real-time security events, auth flow activity, external-agent access, audit trails, webhooks, and integration tokens"
		icon={ShieldCheck}
		backHref="/admin"
		backLabel="Dashboard"
	/>

	<div class="admin-panel p-5">
		<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
			<div class="max-w-3xl space-y-2">
				<p class="text-sm font-medium text-foreground">Analysis window</p>
				<p class="text-sm leading-relaxed text-muted-foreground">
					This view intentionally reports counts, scope, and sanitized evidence instead of
					token values, webhook secrets, push keys, or full user-submitted content.
				</p>
			</div>
			<div class="grid gap-3 sm:grid-cols-[220px_auto_auto]">
				<div class="space-y-2">
					<label
						for="security-timeframe"
						class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
					>
						Timeframe
					</label>
					<Select
						id="security-timeframe"
						bind:value={selectedTimeframe}
						size="md"
						onchange={changeTimeframe}
					>
						<option value="24h">Last 24 Hours</option>
						<option value="7d">Last 7 Days</option>
						<option value="30d">Last 30 Days</option>
						<option value="90d">Last 90 Days</option>
						<option value="all">All Time</option>
					</Select>
				</div>
				<div class="flex items-end">
					<Button
						variant="secondary"
						size="sm"
						icon={RefreshCw}
						loading={refreshing}
						onclick={refresh}
					>
						Refresh
					</Button>
				</div>
				<div class="flex items-end">
					<Button
						variant={autoRefresh ? 'success' : 'outline'}
						size="sm"
						icon={Activity}
						onclick={() => (autoRefresh = !autoRefresh)}
					>
						{autoRefresh ? 'Live On' : 'Live Off'}
					</Button>
				</div>
			</div>
		</div>
	</div>

	{#if data.loadError}
		<AdminCard tone="danger" padding="sm" class="mt-5 flex items-center gap-3 text-sm">
			<AlertTriangle class="h-4 w-4" />
			<span>{data.loadError}</span>
		</AdminCard>
	{:else if analysis}
		<div class="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
			<AdminStatCard
				label="Posture Score"
				value={analysis.posture.score}
				suffix="/100"
				icon={ShieldCheck}
				tone={postureTone(analysis.posture.level)}
				footnote={analysis.posture.summary}
				compact
			/>
			<AdminStatCard
				label="Security Events"
				value={analysis.overview.securityEventStream}
				icon={ShieldAlert}
				tone={analysis.overview.authFailures + analysis.overview.agentDeniedEvents > 0
					? 'warning'
					: 'info'}
				footnote={`${formatNumber(analysis.overview.authFailures)} auth failure(s), ${formatNumber(analysis.overview.agentDeniedEvents)} agent denial(s)`}
				compact
			/>
			<AdminStatCard
				label="Open Critical"
				value={analysis.overview.openCriticalErrors}
				icon={Bug}
				tone={analysis.overview.openCriticalErrors > 0 ? 'danger' : 'success'}
				footnote={`${formatNumber(analysis.overview.recentErrors)} recent errors`}
				compact
			/>
			<AdminStatCard
				label="Agent Sessions"
				value={analysis.overview.activeAgentSessions}
				icon={Bot}
				tone={analysis.overview.staleActiveAgentSessions > 0 ? 'warning' : 'info'}
				footnote={`${formatNumber(analysis.overview.activeExternalCallers)} active caller(s)`}
				compact
			/>
			<AdminStatCard
				label="Sensitive Reads"
				value={analysis.overview.sensitiveAccesses}
				icon={ContactRound}
				tone={analysis.overview.sensitiveValueExposures > 0 ? 'danger' : 'info'}
				footnote={`${formatNumber(analysis.overview.sensitiveValueExposures)} exposed values`}
				compact
			/>
		</div>

		<AdminCard padding="lg" class="mt-5">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<p
						class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
					>
						Live Event Stream
					</p>
					<h2 class="mt-1 text-xl font-semibold text-foreground">
						{formatNumber(analysis.securityEventStream.total)} normalized security event(s)
					</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						Auth, agent, access, detection, integration, webhook, admin, and system
						events from the append-only security_events table.
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<Badge size="sm" variant={autoRefresh ? 'success' : 'default'}>
						{autoRefresh ? '15s live refresh' : 'manual refresh'}
					</Badge>
					<Badge size="sm" variant={refreshing ? 'warning' : 'info'}>
						Generated {formatShortDate(analysis.generatedAt)}
					</Badge>
				</div>
			</div>

			<div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
				<div class="rounded-lg border border-border p-3">
					<p class="text-xs text-muted-foreground">Auth Events</p>
					<p class="text-2xl font-semibold text-foreground">
						{formatNumber(analysis.securityEventStream.authEvents)}
					</p>
					<p class="text-xs text-muted-foreground">
						{formatNumber(analysis.securityEventStream.authFailures)} failure(s)
					</p>
				</div>
				<div class="rounded-lg border border-border p-3">
					<p class="text-xs text-muted-foreground">Agent Events</p>
					<p class="text-2xl font-semibold text-foreground">
						{formatNumber(analysis.securityEventStream.agentEvents)}
					</p>
					<p class="text-xs text-muted-foreground">
						{formatNumber(analysis.securityEventStream.agentDeniedEvents)} denied/failed
					</p>
				</div>
				<div class="rounded-lg border border-border p-3">
					<p class="text-xs text-muted-foreground">Access Events</p>
					<p class="text-2xl font-semibold text-foreground">
						{formatNumber(analysis.securityEventStream.accessEvents)}
					</p>
				</div>
				<div class="rounded-lg border border-border p-3">
					<p class="text-xs text-muted-foreground">Detection Events</p>
					<p class="text-2xl font-semibold text-foreground">
						{formatNumber(analysis.securityEventStream.detectionEvents)}
					</p>
				</div>
				<div class="rounded-lg border border-border p-3">
					<p class="text-xs text-muted-foreground">Integration Events</p>
					<p class="text-2xl font-semibold text-foreground">
						{formatNumber(analysis.securityEventStream.integrationEvents)}
					</p>
				</div>
			</div>

			{#if analysis.securityEventStream.recentEvents.length}
				<div class="mt-5 overflow-x-auto">
					<table class="min-w-full text-sm">
						<thead>
							<tr
								class="border-b border-border text-left text-xs uppercase tracking-[0.16em] text-muted-foreground"
							>
								<th class="py-2 pr-4">Time</th>
								<th class="py-2 pr-4">Event</th>
								<th class="py-2 pr-4">Outcome</th>
								<th class="py-2 pr-4">Actor</th>
								<th class="py-2 pr-4">Target</th>
								<th class="py-2 pr-4">Source</th>
								<th class="py-2">Reason</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each analysis.securityEventStream.recentEvents as event}
								<tr>
									<td class="whitespace-nowrap py-3 pr-4 text-muted-foreground">
										{formatShortDate(event.createdAt)}
									</td>
									<td class="min-w-[220px] py-3 pr-4">
										<div class="flex flex-col gap-1">
											<span class="font-medium text-foreground">
												{formatEventType(event.eventType)}
											</span>
											<span class="text-xs text-muted-foreground"
												>{event.category} / {event.severity}</span
											>
										</div>
									</td>
									<td class="py-3 pr-4">
										<Badge size="sm" variant={outcomeBadge(event.outcome)}>
											{event.outcome}
										</Badge>
									</td>
									<td class="py-3 pr-4 font-mono text-xs text-muted-foreground">
										{actorLabel(event)}
									</td>
									<td class="py-3 pr-4 font-mono text-xs text-muted-foreground">
										{targetLabel(event)}
									</td>
									<td class="py-3 pr-4 font-mono text-xs text-muted-foreground">
										{event.ipAddress || maskId(event.requestId)}
									</td>
									<td class="max-w-[280px] py-3 text-muted-foreground">
										<span class="line-clamp-2">{event.reason || 'none'}</span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div
					class="mt-5 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
				>
					No normalized security events are recorded for this range.
				</div>
			{/if}

			{#if analysis.securityEventStream.byEventType.length}
				<div class="mt-5 flex flex-wrap gap-2">
					{#each analysis.securityEventStream.byEventType.slice(0, 10) as eventType}
						<Badge size="sm" variant="default"
							>{eventType.label}: {eventType.count}</Badge
						>
					{/each}
				</div>
			{/if}
		</AdminCard>

		<div class="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
			<AdminCard padding="lg">
				<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<p
							class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
						>
							Computed Findings
						</p>
						<h2 class="mt-1 text-xl font-semibold text-foreground">
							{analysis.findings.length} finding(s)
						</h2>
					</div>
					<Badge size="sm" variant={severityBadge(analysis.posture.level)}>
						{analysis.posture.level}
					</Badge>
				</div>

				<div class="mt-5 space-y-3">
					{#each analysis.findings as finding}
						<div class="rounded-lg border border-border bg-background/70 p-4">
							<div
								class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
							>
								<div class="space-y-1">
									<div class="flex flex-wrap items-center gap-2">
										<Badge size="sm" variant={severityBadge(finding.severity)}>
											{finding.severity}
										</Badge>
										<span class="text-xs font-medium text-muted-foreground">
											{finding.source}
										</span>
									</div>
									<h3 class="text-base font-semibold text-foreground">
										{finding.title}
									</h3>
									<p class="text-sm leading-relaxed text-muted-foreground">
										{finding.summary}
									</p>
								</div>
							</div>
							{#if finding.evidence.length}
								<ul class="mt-3 space-y-1 text-sm text-muted-foreground">
									{#each finding.evidence as item}
										<li class="flex gap-2">
											<span
												class="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-muted-foreground/60"
											></span>
											<span>{item}</span>
										</li>
									{/each}
								</ul>
							{/if}
							<p class="mt-3 text-sm font-medium text-foreground">
								{finding.recommendation}
							</p>
						</div>
					{/each}
				</div>
			</AdminCard>

			<AdminCard padding="lg">
				<div class="flex items-start justify-between gap-4">
					<div>
						<p
							class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
						>
							Data Coverage
						</p>
						<h2 class="mt-1 text-xl font-semibold text-foreground">
							{analysis.rangeLabel}
						</h2>
					</div>
					<Database class="h-5 w-5 text-muted-foreground" />
				</div>
				<div class="mt-5 divide-y divide-border">
					{#each analysis.dataSources as source}
						<div
							class="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
						>
							<div class="min-w-0">
								<p class="truncate text-sm font-medium text-foreground">
									{source.label}
								</p>
								<p class="text-xs text-muted-foreground">
									{formatNumber(source.rowCount)} row(s)
									{#if source.lastSeen}
										- last {formatShortDate(source.lastSeen)}
									{/if}
								</p>
								{#if source.error}
									<p class="mt-1 text-xs text-destructive">{source.error}</p>
								{/if}
							</div>
							<Badge size="sm" variant={sourceBadge(source)}>{source.status}</Badge>
						</div>
					{/each}
				</div>
				<p class="mt-4 text-xs leading-relaxed text-muted-foreground">
					Generated {formatDate(analysis.generatedAt)}
				</p>
			</AdminCard>
		</div>

		<div class="mt-5 grid gap-5 xl:grid-cols-2">
			<AdminCard padding="lg">
				<div class="flex items-start justify-between gap-4">
					<div>
						<p
							class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
						>
							Threat Intake
						</p>
						<h2 class="mt-1 text-xl font-semibold text-foreground">
							Prompt-injection scanner
						</h2>
					</div>
					<LockKeyhole class="h-5 w-5 text-muted-foreground" />
				</div>

				<div class="mt-5 grid gap-3 sm:grid-cols-4">
					<div class="rounded-lg border border-border p-3">
						<p class="text-xs text-muted-foreground">Total</p>
						<p class="text-2xl font-semibold text-foreground">
							{formatNumber(analysis.promptInjection.total)}
						</p>
					</div>
					<div class="rounded-lg border border-border p-3">
						<p class="text-xs text-muted-foreground">Blocked</p>
						<p class="text-2xl font-semibold text-foreground">
							{formatNumber(analysis.promptInjection.blocked)}
						</p>
					</div>
					<div class="rounded-lg border border-border p-3">
						<p class="text-xs text-muted-foreground">Allowed Flags</p>
						<p class="text-2xl font-semibold text-foreground">
							{formatNumber(analysis.promptInjection.detected)}
						</p>
					</div>
					<div class="rounded-lg border border-border p-3">
						<p class="text-xs text-muted-foreground">Rate Limits</p>
						<p class="text-2xl font-semibold text-foreground">
							{formatNumber(analysis.promptInjection.rateLimited)}
						</p>
					</div>
				</div>

				{#if analysis.promptInjection.topPatterns.length}
					<div class="mt-5 space-y-2">
						<p class="text-sm font-semibold text-foreground">Top patterns</p>
						<div class="flex flex-wrap gap-2">
							{#each analysis.promptInjection.topPatterns as pattern}
								<Badge size="sm" variant={severityBadge(pattern.severity)}>
									{pattern.pattern} ({pattern.count})
								</Badge>
							{/each}
						</div>
					</div>
				{:else}
					<div
						class="mt-5 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
					>
						No prompt-injection events are recorded for this range.
					</div>
				{/if}

				{#if analysis.promptInjection.recentEvents.length}
					<div class="mt-5 overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead>
								<tr
									class="border-b border-border text-left text-xs uppercase tracking-[0.16em] text-muted-foreground"
								>
									<th class="py-2 pr-4">Time</th>
									<th class="py-2 pr-4">Event</th>
									<th class="py-2 pr-4">User</th>
									<th class="py-2 text-right">Detail</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-border">
								{#each analysis.promptInjection.recentEvents as event}
									<tr>
										<td
											class="whitespace-nowrap py-3 pr-4 text-muted-foreground"
										>
											{formatShortDate(event.createdAt)}
										</td>
										<td class="py-3 pr-4">
											<Badge size="sm" variant={eventBadge(event.eventType)}>
												{formatEventType(event.eventType)}
											</Badge>
										</td>
										<td
											class="py-3 pr-4 font-mono text-xs text-muted-foreground"
										>
											{maskId(event.userId)}
										</td>
										<td class="py-3 text-right">
											<Button
												variant="ghost"
												size="sm"
												icon={Eye}
												onclick={() => (selectedSecurityEvent = event)}
											>
												View
											</Button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</AdminCard>

			<AdminCard padding="lg">
				<div class="flex items-start justify-between gap-4">
					<div>
						<p
							class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
						>
							Operational Risk
						</p>
						<h2 class="mt-1 text-xl font-semibold text-foreground">
							Critical and security-adjacent errors
						</h2>
					</div>
					<Bug class="h-5 w-5 text-muted-foreground" />
				</div>

				<div class="mt-5 grid gap-3 sm:grid-cols-3">
					<div class="rounded-lg border border-border p-3">
						<p class="text-xs text-muted-foreground">Recent Errors</p>
						<p class="text-2xl font-semibold text-foreground">
							{formatNumber(analysis.errors.total)}
						</p>
					</div>
					<div class="rounded-lg border border-border p-3">
						<p class="text-xs text-muted-foreground">Unresolved</p>
						<p class="text-2xl font-semibold text-foreground">
							{formatNumber(analysis.errors.unresolved)}
						</p>
					</div>
					<div class="rounded-lg border border-border p-3">
						<p class="text-xs text-muted-foreground">Security Adjacent</p>
						<p class="text-2xl font-semibold text-foreground">
							{formatNumber(analysis.errors.securityAdjacent)}
						</p>
					</div>
				</div>

				<div class="mt-5 grid gap-5 lg:grid-cols-2">
					<div>
						<p class="text-sm font-semibold text-foreground">Top endpoints</p>
						<div class="mt-2 space-y-2">
							{#each analysis.errors.byEndpoint as endpoint}
								<div
									class="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
								>
									<span class="min-w-0 truncate text-sm text-muted-foreground">
										{endpoint.endpoint}
									</span>
									<Badge size="sm" variant="default">{endpoint.count}</Badge>
								</div>
							{:else}
								<p class="text-sm text-muted-foreground">No endpoint errors.</p>
							{/each}
						</div>
					</div>
					<div>
						<p class="text-sm font-semibold text-foreground">Open critical</p>
						<div class="mt-2 space-y-2">
							{#each analysis.errors.recentCritical as error}
								<div class="rounded-lg border border-border px-3 py-2">
									<div class="flex items-center justify-between gap-3">
										<Badge size="sm" variant={severityBadge(error.severity)}>
											{error.severity}
										</Badge>
										<span class="text-xs text-muted-foreground">
											{formatShortDate(error.createdAt)}
										</span>
									</div>
									<p class="mt-2 truncate text-sm font-medium text-foreground">
										{error.endpoint}
									</p>
									<p class="mt-1 text-xs leading-relaxed text-muted-foreground">
										{error.message}
									</p>
								</div>
							{:else}
								<p class="text-sm text-muted-foreground">
									No open critical errors.
								</p>
							{/each}
						</div>
					</div>
				</div>
			</AdminCard>
		</div>

		<div class="mt-5 grid gap-5 xl:grid-cols-2">
			<AdminCard padding="lg">
				<div class="flex items-start justify-between gap-4">
					<div>
						<p
							class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
						>
							External Agent Boundary
						</p>
						<h2 class="mt-1 text-xl font-semibold text-foreground">
							Trusted callers and active sessions
						</h2>
					</div>
					<Bot class="h-5 w-5 text-muted-foreground" />
				</div>

				<div class="mt-5 grid gap-3 sm:grid-cols-4">
					<div class="rounded-lg border border-border p-3">
						<p class="text-xs text-muted-foreground">Callers</p>
						<p class="text-2xl font-semibold text-foreground">
							{formatNumber(analysis.externalAgents.activeCallers)}
						</p>
					</div>
					<div class="rounded-lg border border-border p-3">
						<p class="text-xs text-muted-foreground">Sessions</p>
						<p class="text-2xl font-semibold text-foreground">
							{formatNumber(analysis.externalAgents.activeSessions)}
						</p>
					</div>
					<div class="rounded-lg border border-border p-3">
						<p class="text-xs text-muted-foreground">Stale Sessions</p>
						<p class="text-2xl font-semibold text-foreground">
							{formatNumber(analysis.externalAgents.staleActiveSessions)}
						</p>
					</div>
					<div class="rounded-lg border border-border p-3">
						<p class="text-xs text-muted-foreground">Write Failures</p>
						<p class="text-2xl font-semibold text-foreground">
							{formatNumber(analysis.externalAgents.writeFailures)}
						</p>
					</div>
				</div>

				<div class="mt-5 space-y-3">
					{#each analysis.externalAgents.callers as caller}
						<div class="rounded-lg border border-border p-4">
							<div
								class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
							>
								<div class="min-w-0">
									<p class="truncate text-sm font-semibold text-foreground">
										{caller.callerKey}
									</p>
									<p class="mt-1 text-xs text-muted-foreground">
										{caller.provider} - {caller.policyProjectCount} project(s) -
										last used
										{formatNullableDate(caller.lastUsedAt)}
									</p>
								</div>
								<Badge size="sm" variant={statusBadge(caller.status)}
									>{caller.status}</Badge
								>
							</div>
						</div>
					{:else}
						<div
							class="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
						>
							No external callers are configured.
						</div>
					{/each}
				</div>

				{#if analysis.externalAgents.sessions.length}
					<div class="mt-5 overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead>
								<tr
									class="border-b border-border text-left text-xs uppercase tracking-[0.16em] text-muted-foreground"
								>
									<th class="py-2 pr-4">Started</th>
									<th class="py-2 pr-4">Scope</th>
									<th class="py-2 pr-4">Projects</th>
									<th class="py-2">Status</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-border">
								{#each analysis.externalAgents.sessions as session}
									<tr>
										<td
											class="whitespace-nowrap py-3 pr-4 text-muted-foreground"
										>
											{formatShortDate(session.startedAt)}
										</td>
										<td class="py-3 pr-4">{session.scopeMode}</td>
										<td class="py-3 pr-4"
											>{formatNumber(session.projectCount)}</td
										>
										<td class="py-3">
											<div class="flex flex-wrap gap-2">
												<Badge
													size="sm"
													variant={statusBadge(session.status)}
												>
													{session.status}
												</Badge>
												{#if session.isStale}
													<Badge size="sm" variant="warning">stale</Badge>
												{/if}
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</AdminCard>

			<AdminCard padding="lg">
				<div class="flex items-start justify-between gap-4">
					<div>
						<p
							class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
						>
							Sensitive Data Access
						</p>
						<h2 class="mt-1 text-xl font-semibold text-foreground">
							Profile and contact audit trails
						</h2>
					</div>
					<ContactRound class="h-5 w-5 text-muted-foreground" />
				</div>

				<div class="mt-5 grid gap-3 sm:grid-cols-4">
					<div class="rounded-lg border border-border p-3">
						<p class="text-xs text-muted-foreground">Total</p>
						<p class="text-2xl font-semibold text-foreground">
							{formatNumber(analysis.sensitiveAccess.total)}
						</p>
					</div>
					<div class="rounded-lg border border-border p-3">
						<p class="text-xs text-muted-foreground">Profile</p>
						<p class="text-2xl font-semibold text-foreground">
							{formatNumber(analysis.sensitiveAccess.profileAccesses)}
						</p>
					</div>
					<div class="rounded-lg border border-border p-3">
						<p class="text-xs text-muted-foreground">Contact</p>
						<p class="text-2xl font-semibold text-foreground">
							{formatNumber(analysis.sensitiveAccess.contactAccesses)}
						</p>
					</div>
					<div class="rounded-lg border border-border p-3">
						<p class="text-xs text-muted-foreground">Exposures</p>
						<p class="text-2xl font-semibold text-foreground">
							{formatNumber(analysis.sensitiveAccess.sensitiveValueExposures)}
						</p>
					</div>
				</div>

				<div class="mt-5 space-y-3">
					{#each analysis.sensitiveAccess.recent as access}
						<div class="rounded-lg border border-border p-4">
							<div
								class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
							>
								<div>
									<div class="flex flex-wrap items-center gap-2">
										<Badge
											size="sm"
											variant={access.source === 'contact'
												? 'info'
												: 'accent'}
										>
											{access.source}
										</Badge>
										<Badge size="sm" variant="default"
											>{access.accessType}</Badge
										>
									</div>
									<p class="mt-2 text-sm font-medium text-foreground">
										{access.reason || 'No reason recorded'}
									</p>
									<p class="mt-1 text-xs text-muted-foreground">
										{access.contextType || 'unknown context'} - actor {maskId(
											access.actorId
										)}
									</p>
								</div>
								<span class="text-xs text-muted-foreground"
									>{formatShortDate(access.createdAt)}</span
								>
							</div>
							{#if metadataRows(access.metadata).length}
								<div class="mt-3 flex flex-wrap gap-2">
									{#each metadataRows(access.metadata) as meta}
										<Badge size="sm" variant="default"
											>{meta.key}: {meta.value}</Badge
										>
									{/each}
								</div>
							{/if}
						</div>
					{:else}
						<div
							class="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
						>
							No sensitive profile or contact access audit rows in this range.
						</div>
					{/each}
				</div>
			</AdminCard>
		</div>

		<AdminCard padding="lg" class="mt-5">
			<div class="flex items-start justify-between gap-4">
				<div>
					<p
						class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
					>
						Integration Surface
					</p>
					<h2 class="mt-1 text-xl font-semibold text-foreground">
						Stored credentials, webhook channels, and browser endpoints
					</h2>
				</div>
				<KeyRound class="h-5 w-5 text-muted-foreground" />
			</div>

			<div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				<div class="rounded-lg border border-border p-4">
					<div class="flex items-center justify-between gap-3">
						<p class="text-sm font-semibold text-foreground">Calendar Tokens</p>
						<KeyRound class="h-4 w-4 text-muted-foreground" />
					</div>
					<p class="mt-3 text-2xl font-semibold text-foreground">
						{formatNumber(analysis.integrations.calendarTokenRecords)}
					</p>
					<p class="mt-1 text-sm text-muted-foreground">
						{formatNumber(analysis.integrations.staleCalendarTokenRecords)} stale,
						{formatNumber(analysis.integrations.broadCalendarScopeRecords)} broad scope
					</p>
				</div>
				<div class="rounded-lg border border-border p-4">
					<div class="flex items-center justify-between gap-3">
						<p class="text-sm font-semibold text-foreground">Calendar Webhooks</p>
						<Activity class="h-4 w-4 text-muted-foreground" />
					</div>
					<p class="mt-3 text-2xl font-semibold text-foreground">
						{formatNumber(analysis.integrations.calendarWebhookChannels)}
					</p>
					<p class="mt-1 text-sm text-muted-foreground">
						{formatNumber(analysis.integrations.activeCalendarWebhookChannels)} active,
						{formatNumber(analysis.integrations.expiredCalendarWebhookChannels)} expired
					</p>
				</div>
				<div class="rounded-lg border border-border p-4">
					<div class="flex items-center justify-between gap-3">
						<p class="text-sm font-semibold text-foreground">Push Subscriptions</p>
						<CheckCircle2 class="h-4 w-4 text-muted-foreground" />
					</div>
					<p class="mt-3 text-2xl font-semibold text-foreground">
						{formatNumber(analysis.integrations.pushSubscriptions)}
					</p>
					<p class="mt-1 text-sm text-muted-foreground">
						{formatNumber(analysis.integrations.activePushSubscriptions)} active,
						{formatNumber(analysis.integrations.staleActivePushSubscriptions)} stale active
					</p>
				</div>
				<div class="rounded-lg border border-border p-4">
					<div class="flex items-center justify-between gap-3">
						<p class="text-sm font-semibold text-foreground">Webhook Failures</p>
						<XCircle class="h-4 w-4 text-muted-foreground" />
					</div>
					<p class="mt-3 text-2xl font-semibold text-foreground">
						{formatNumber(analysis.integrations.failedWebhooks)}
					</p>
					<p class="mt-1 text-sm text-muted-foreground">
						{formatNumber(analysis.integrations.webhookEvents)} webhook event(s)
					</p>
				</div>
			</div>

			{#if analysis.integrations.recentWebhookFailures.length}
				<div class="mt-5 overflow-x-auto">
					<table class="min-w-full text-sm">
						<thead>
							<tr
								class="border-b border-border text-left text-xs uppercase tracking-[0.16em] text-muted-foreground"
							>
								<th class="py-2 pr-4">Time</th>
								<th class="py-2 pr-4">Event</th>
								<th class="py-2 pr-4">Status</th>
								<th class="py-2">Error</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each analysis.integrations.recentWebhookFailures as event}
								<tr>
									<td class="whitespace-nowrap py-3 pr-4 text-muted-foreground">
										{formatShortDate(event.createdAt)}
									</td>
									<td class="py-3 pr-4">{event.eventType}</td>
									<td class="py-3 pr-4">
										<Badge size="sm" variant={statusBadge(event.status)}>
											{event.status}
										</Badge>
									</td>
									<td class="py-3 text-muted-foreground"
										>{event.error || 'No error recorded'}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</AdminCard>
	{/if}

	{#if selectedSecurityEvent}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur"
		>
			<div class="admin-panel max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6">
				<div class="flex items-start justify-between gap-4">
					<div>
						<p
							class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
						>
							Prompt-Injection Event
						</p>
						<h3 class="mt-1 text-lg font-semibold text-foreground">
							{formatEventType(selectedSecurityEvent.eventType)}
						</h3>
					</div>
					<Button
						variant="ghost"
						size="sm"
						onclick={() => (selectedSecurityEvent = null)}
					>
						Close
					</Button>
				</div>

				<div class="mt-5 grid gap-3 sm:grid-cols-3">
					<div class="rounded-lg border border-border p-3">
						<p class="text-xs text-muted-foreground">Time</p>
						<p class="mt-1 text-sm font-medium text-foreground">
							{formatDate(selectedSecurityEvent.createdAt)}
						</p>
					</div>
					<div class="rounded-lg border border-border p-3">
						<p class="text-xs text-muted-foreground">User</p>
						<p class="mt-1 font-mono text-sm text-foreground">
							{maskId(selectedSecurityEvent.userId)}
						</p>
					</div>
					<div class="rounded-lg border border-border p-3">
						<p class="text-xs text-muted-foreground">Decision</p>
						<p class="mt-1">
							<Badge
								size="sm"
								variant={selectedSecurityEvent.wasBlocked ? 'error' : 'success'}
							>
								{selectedSecurityEvent.wasBlocked ? 'Blocked' : 'Allowed'}
							</Badge>
						</p>
					</div>
				</div>

				{#if selectedSecurityEvent.patterns.length}
					<div class="mt-5">
						<p class="text-sm font-semibold text-foreground">Regex patterns</p>
						<div class="mt-2 flex flex-wrap gap-2">
							{#each selectedSecurityEvent.patterns as pattern}
								<Badge size="sm" variant={severityBadge(pattern.severity)}>
									{pattern.pattern} - {pattern.category}
								</Badge>
							{/each}
						</div>
					</div>
				{/if}

				{#if selectedSecurityEvent.llmValidation}
					<div class="mt-5 rounded-lg border border-border p-4">
						<p class="text-sm font-semibold text-foreground">LLM validation</p>
						<div class="mt-3 flex flex-wrap gap-2">
							<Badge
								size="sm"
								variant={selectedSecurityEvent.llmValidation.isMalicious
									? 'error'
									: 'success'}
							>
								{selectedSecurityEvent.llmValidation.isMalicious
									? 'malicious'
									: 'benign'}
							</Badge>
							<Badge
								size="sm"
								variant={severityBadge(
									selectedSecurityEvent.llmValidation.confidence
								)}
							>
								{selectedSecurityEvent.llmValidation.confidence} confidence
							</Badge>
							<Badge
								size="sm"
								variant={selectedSecurityEvent.llmValidation.shouldBlock
									? 'error'
									: 'success'}
							>
								{selectedSecurityEvent.llmValidation.shouldBlock
									? 'block'
									: 'allow'}
							</Badge>
						</div>
						<p class="mt-3 text-sm leading-relaxed text-muted-foreground">
							{selectedSecurityEvent.llmValidation.reason}
						</p>
					</div>
				{/if}

				{#if metadataRows(selectedSecurityEvent.metadata).length}
					<div class="mt-5">
						<p class="text-sm font-semibold text-foreground">Sanitized metadata</p>
						<div class="mt-2 flex flex-wrap gap-2">
							{#each metadataRows(selectedSecurityEvent.metadata) as meta}
								<Badge size="sm" variant="default">{meta.key}: {meta.value}</Badge>
							{/each}
						</div>
					</div>
				{/if}

				<p class="mt-5 text-xs leading-relaxed text-muted-foreground">
					Raw prompt content is not returned to this browser view.
				</p>
			</div>
		</div>
	{/if}
</div>
