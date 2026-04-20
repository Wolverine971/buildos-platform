<!-- apps/web/src/routes/admin/welcome-sequence/+page.svelte -->
<script lang="ts">
	import {
		Activity,
		CheckCircle2,
		ChevronDown,
		Code2,
		Eye,
		GitCompareArrows,
		Mail,
		RefreshCw,
		Send,
		SkipForward,
		TriangleAlert
	} from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminCollapsibleSection from '$lib/components/admin/AdminCollapsibleSection.svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';

	type DiffEntry = {
		field: string;
		expected: unknown;
		actual: unknown;
	};

	type DiffRow = {
		userId: string;
		email: string | null;
		legacyStatus: string;
		legacyStartedAt: string;
		expectedStatus: string | null;
		actualStatus: string | null;
		expectedNextStep: number | null;
		actualNextStep: number | null;
		diffCount: number;
		diffs: DiffEntry[];
	};

	type PreviewContent = {
		step: string;
		branchKey: string;
		subject: string;
		body: string;
		html: string;
		ctaLabel: string;
		ctaUrl: string;
	};

	type Preview = {
		label?: string;
		description?: string;
		step: string;
		action: string;
		branchKey: string | null;
		reason: string;
		content: PreviewContent | null;
	};

	type StepMetadata = {
		step_number: number;
		step_key: string;
		delay_days_after_previous: number;
		absolute_day_offset: number;
		send_window_start_hour: number;
		send_window_end_hour: number;
		send_on_weekends: boolean;
		status: string;
		copyStoredInSupabase: boolean;
	};

	type StepStats = {
		step: string;
		stepNumber: number;
		sent: number;
		skipped: number;
		failed: number;
		retried: number;
		loggedSent: number;
		loggedFailed: number;
	};

	type SequenceStats = {
		totalEnrollments: number;
		dueNow: number;
		statusCounts: Record<string, number>;
		exitReasonCounts: Record<string, number>;
		eventCounts: Record<string, number>;
		branchCounts: Record<string, number>;
		emailLogCounts: Record<string, number>;
		stepStats: StepStats[];
	};

	type SandboxInput = {
		step: string;
		projectCount: number;
		onboardingCompleted: boolean;
		returned: boolean;
		emailDailyBriefEnabled: boolean;
		smsChannelEnabled: boolean;
		calendarConnected: boolean;
		name: string;
		onboardingIntent: string;
	};

	type QueueRow = {
		id: string;
		user_id: string;
		recipient_email: string;
		status: string;
		current_step_number: number;
		next_step_number: number | null;
		next_send_at: string | null;
		last_sent_at: string | null;
		processing_started_at: string | null;
		failure_count: number | null;
		exit_reason: string | null;
		last_error: string | null;
		created_at: string;
		updated_at: string;
		branchPreview: string | null;
	};

	type AlertRow = {
		severity: 'P1' | 'P2' | 'P3';
		message: string;
		detail: string;
	};

	type EngagementStats = {
		emails: number;
		tracked: number;
		opens: number;
		clicks: number;
		unsubscribes: number;
		uniqueOpened: number;
		uniqueClicked: number;
		openRate: number;
		clickRate: number;
		suppressions: number;
		suppressionReasons: Record<string, number>;
		suppressionSources: Record<string, number>;
	};

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	const summary = data.summary as {
		total: number;
		matched: number;
		mismatched: number;
		missing: number;
	};
	const rows = (data.rows ?? []) as DiffRow[];
	const stats = (data.stats ?? null) as SequenceStats | null;
	const steps = (data.steps ?? []) as StepMetadata[];
	const localPreviews = (data.localPreviews ?? []) as Preview[];
	const sandbox = data.sandbox as { input: SandboxInput; preview: Preview };
	const queueRows = (data.queueRows ?? []) as QueueRow[];
	const alerts = (data.alerts ?? []) as AlertRow[];
	const engagement = (data.engagement ?? null) as EngagementStats | null;

	const eventCounts = stats?.eventCounts ?? {};
	const emailLogCounts = stats?.emailLogCounts ?? {};

	function formatValue(value: unknown): string {
		if (value == null || value === '') {
			return 'null';
		}

		if (typeof value === 'string') {
			const parsed = Date.parse(value);
			if (!Number.isNaN(parsed) && value.includes('T')) {
				return new Date(parsed).toLocaleString();
			}
			return value;
		}

		return String(value);
	}

	function entries(record: Record<string, number>): Array<[string, number]> {
		return Object.entries(record).sort((left, right) => right[1] - left[1]);
	}

	function formatPercent(value: number | null | undefined): string {
		if (value == null || !Number.isFinite(value)) {
			return '0%';
		}

		return `${(value * 100).toFixed(1)}%`;
	}

	function alertTone(severity: AlertRow['severity']): 'danger' | 'warning' | 'info' {
		if (severity === 'P1') return 'danger';
		if (severity === 'P2') return 'warning';
		return 'info';
	}

	function canSendNextNow(row: QueueRow): boolean {
		return (
			row.next_step_number != null &&
			(row.status === 'active' || row.status === 'paused' || row.status === 'errored')
		);
	}

	function actionBadgeClasses(action: string): string {
		switch (action) {
			case 'send':
				return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
			case 'skip':
				return 'bg-amber-500/10 text-amber-700 dark:text-amber-300';
			case 'wait':
				return 'bg-sky-500/10 text-sky-700 dark:text-sky-300';
			case 'complete':
				return 'bg-muted text-muted-foreground';
			default:
				return 'bg-muted text-muted-foreground';
		}
	}

	let openHtmlPreviews = $state<Record<string, boolean>>({});

	function toggleHtmlPreview(key: string) {
		openHtmlPreviews[key] = !openHtmlPreviews[key];
	}
</script>

<div class="admin-page space-y-6">
	<AdminPageHeader
		title="Welcome Sequence"
		description="Local copy previews, lifecycle stats, and Phase 2 shadow queue parity."
		icon={GitCompareArrows}
	/>

	{#if data.setupError}
		<AdminCard tone="danger">
			<div class="flex items-start gap-3">
				<TriangleAlert class="mt-0.5 h-5 w-5 shrink-0" />
				<div>
					<h2 class="text-base font-semibold text-foreground">Diff unavailable</h2>
					<p class="mt-1 text-sm text-muted-foreground">{data.setupError}</p>
				</div>
			</div>
		</AdminCard>
	{:else if !data.sequence}
		<AdminCard tone="warning">
			<div class="flex items-start gap-3">
				<TriangleAlert class="mt-0.5 h-5 w-5 shrink-0" />
				<div>
					<h2 class="text-base font-semibold text-foreground">Sequence seed missing</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						Apply the Phase 2 migration before validating shadow queue parity.
					</p>
				</div>
			</div>
		</AdminCard>
	{/if}

	{#if form?.error}
		<AdminCard tone="danger" padding="sm">
			<div class="flex items-start gap-3 text-sm text-destructive">
				<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
				<p>{form.error}</p>
			</div>
		</AdminCard>
	{:else if form?.success}
		<AdminCard tone="success" padding="sm">
			<div class="flex items-start gap-3 text-sm text-emerald-800">
				<CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0" />
				<p>{form.message ?? 'Welcome sequence admin action completed.'}</p>
			</div>
		</AdminCard>
	{/if}

	<AdminCard tone="info" padding="sm">
		<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:text-sm">
			<Code2 class="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" />
			<span class="text-foreground font-medium">Copy lives in source.</span>
			<span>Supabase stores state, schedule, and stats only.</span>
			<code
				class="ml-auto max-w-full truncate rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px]"
				title={data.copySourcePath}
			>
				{data.copySourcePath}
			</code>
		</div>
	</AdminCard>

	{#if data.statsError}
		<AdminCard tone="warning">
			<div class="flex items-start gap-3">
				<TriangleAlert class="mt-0.5 h-5 w-5 shrink-0" />
				<div>
					<h2 class="text-base font-semibold text-foreground">Stats unavailable</h2>
					<p class="mt-1 text-sm text-muted-foreground">{data.statsError}</p>
				</div>
			</div>
		</AdminCard>
	{/if}

	{#if !data.statsError}
		<div class="grid gap-4 lg:grid-cols-3">
			{#if alerts.length > 0}
				{#each alerts as alert}
					<AdminCard tone={alertTone(alert.severity)} padding="md">
						<div class="flex items-start gap-3">
							<TriangleAlert class="mt-0.5 h-5 w-5 shrink-0" />
							<div>
								<div class="flex items-center gap-2">
									<span
										class="rounded-md bg-background px-2 py-1 text-xs font-semibold text-foreground"
									>
										{alert.severity}
									</span>
									<h2 class="text-sm font-semibold text-foreground">
										{alert.message}
									</h2>
								</div>
								<p class="mt-2 text-sm text-muted-foreground">{alert.detail}</p>
							</div>
						</div>
					</AdminCard>
				{/each}
			{:else}
				<AdminCard tone="success" padding="md" class="lg:col-span-3">
					<div class="flex items-start gap-3">
						<CheckCircle2 class="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
						<div>
							<h2 class="text-sm font-semibold text-foreground">
								No active alert thresholds
							</h2>
							<p class="mt-1 text-sm text-muted-foreground">
								Email 1 delivery, cron failures, errored enrollments, stuck
								processing rows, and suppression rate are below the Phase 2 alert
								thresholds.
							</p>
						</div>
					</div>
				</AdminCard>
			{/if}
		</div>
	{/if}

	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
		<AdminCard tone="info" padding="md">
			<p class="text-sm font-medium text-muted-foreground">Enrollments</p>
			<p class="mt-2 text-3xl font-bold text-foreground">{stats?.totalEnrollments ?? 0}</p>
		</AdminCard>
		<AdminCard tone={stats?.dueNow ? 'warning' : 'muted'} padding="md">
			<p class="text-sm font-medium text-muted-foreground">Due Now</p>
			<p class="mt-2 text-3xl font-bold text-foreground">{stats?.dueNow ?? 0}</p>
		</AdminCard>
		<AdminCard tone="success" padding="md">
			<p class="text-sm font-medium text-muted-foreground">Sent Events</p>
			<p class="mt-2 text-3xl font-bold text-foreground">{eventCounts.sent ?? 0}</p>
		</AdminCard>
		<AdminCard tone="muted" padding="md">
			<p class="text-sm font-medium text-muted-foreground">Skipped</p>
			<p class="mt-2 text-3xl font-bold text-foreground">{eventCounts.skipped ?? 0}</p>
		</AdminCard>
		<AdminCard tone={(eventCounts.failed ?? 0) > 0 ? 'danger' : 'muted'} padding="md">
			<p class="text-sm font-medium text-muted-foreground">Failed</p>
			<p class="mt-2 text-3xl font-bold text-foreground">{eventCounts.failed ?? 0}</p>
		</AdminCard>
	</div>

	{#if engagement}
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
			<AdminCard tone="muted" padding="md">
				<div class="flex items-center gap-2">
					<Mail class="h-4 w-4 text-muted-foreground" />
					<p class="text-sm font-medium text-muted-foreground">Production Emails</p>
				</div>
				<p class="mt-2 text-3xl font-bold text-foreground">{engagement.emails}</p>
				<p class="mt-1 text-xs text-muted-foreground">
					{engagement.tracked} with tracking enabled
				</p>
			</AdminCard>
			<AdminCard tone="info" padding="md">
				<div class="flex items-center gap-2">
					<Activity class="h-4 w-4 text-sky-700" />
					<p class="text-sm font-medium text-muted-foreground">Unique Opens</p>
				</div>
				<p class="mt-2 text-3xl font-bold text-foreground">{engagement.uniqueOpened}</p>
				<p class="mt-1 text-xs text-muted-foreground">
					{formatPercent(engagement.openRate)} open rate, {engagement.opens} events
				</p>
			</AdminCard>
			<AdminCard tone="success" padding="md">
				<p class="text-sm font-medium text-muted-foreground">Unique Clicks</p>
				<p class="mt-2 text-3xl font-bold text-foreground">{engagement.uniqueClicked}</p>
				<p class="mt-1 text-xs text-muted-foreground">
					{formatPercent(engagement.clickRate)} click rate, {engagement.clicks} events
				</p>
			</AdminCard>
			<AdminCard tone={engagement.unsubscribes > 0 ? 'warning' : 'muted'} padding="md">
				<p class="text-sm font-medium text-muted-foreground">Unsubscribes</p>
				<p class="mt-2 text-3xl font-bold text-foreground">{engagement.unsubscribes}</p>
				<p class="mt-1 text-xs text-muted-foreground">Tracked unsubscribe events</p>
			</AdminCard>
			<AdminCard tone={engagement.suppressions > 0 ? 'warning' : 'muted'} padding="md">
				<p class="text-sm font-medium text-muted-foreground">Suppressions</p>
				<p class="mt-2 text-3xl font-bold text-foreground">{engagement.suppressions}</p>
				<p class="mt-1 text-xs text-muted-foreground">
					Lifecycle and global suppressions in range
				</p>
			</AdminCard>
		</div>
	{/if}

	<div class="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
		<AdminCard padding="none" class="overflow-hidden">
			<div class="border-b border-border px-4 py-3">
				<h2 class="text-base font-semibold text-foreground">Step Stats</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					Last {data.days} day{data.days === 1 ? '' : 's'} from queue events and email logs.
				</p>
			</div>
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-border text-sm">
					<thead class="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
						<tr>
							<th class="px-4 py-3 font-semibold">Step</th>
							<th class="px-4 py-3 font-semibold">Sent</th>
							<th class="px-4 py-3 font-semibold">Skipped</th>
							<th class="px-4 py-3 font-semibold">Failed</th>
							<th class="px-4 py-3 font-semibold">Retried</th>
							<th class="px-4 py-3 font-semibold">Email Logs</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						{#each stats?.stepStats ?? [] as step}
							<tr>
								<td class="px-4 py-3 font-medium text-foreground">
									{step.stepNumber}. {step.step}
								</td>
								<td class="px-4 py-3 text-muted-foreground">{step.sent}</td>
								<td class="px-4 py-3 text-muted-foreground">{step.skipped}</td>
								<td class="px-4 py-3 text-muted-foreground">{step.failed}</td>
								<td class="px-4 py-3 text-muted-foreground">{step.retried}</td>
								<td class="px-4 py-3 text-muted-foreground">
									{step.loggedSent} sent / {step.loggedFailed} failed
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</AdminCard>

		<AdminCard>
			<h2 class="text-base font-semibold text-foreground">Queue Breakdown</h2>
			<div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
				<div>
					<p class="text-xs font-semibold uppercase text-muted-foreground">
						Enrollment Status
					</p>
					<div class="mt-2 space-y-1">
						{#each entries(stats?.statusCounts ?? {}) as [label, count]}
							<div class="flex items-center justify-between text-sm">
								<span class="text-muted-foreground">{label}</span>
								<span class="font-medium text-foreground">{count}</span>
							</div>
						{/each}
					</div>
				</div>
				<div>
					<p class="text-xs font-semibold uppercase text-muted-foreground">Email Logs</p>
					<div class="mt-2 space-y-1">
						{#each entries(emailLogCounts) as [label, count]}
							<div class="flex items-center justify-between text-sm">
								<span class="text-muted-foreground">{label}</span>
								<span class="font-medium text-foreground">{count}</span>
							</div>
						{/each}
					</div>
				</div>
				<div>
					<p class="text-xs font-semibold uppercase text-muted-foreground">Branches</p>
					<div class="mt-2 max-h-48 space-y-1 overflow-auto">
						{#each entries(stats?.branchCounts ?? {}) as [label, count]}
							<div class="flex items-center justify-between gap-3 text-sm">
								<span class="truncate text-muted-foreground">{label}</span>
								<span class="font-medium text-foreground">{count}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</AdminCard>
	</div>

	<AdminCard padding="none" class="overflow-hidden">
		<div class="border-b border-border px-4 py-3">
			<h2 class="text-base font-semibold text-foreground">Sequence Schedule</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				No subject, body, or HTML columns are stored in Supabase.
			</p>
		</div>
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-border text-sm">
				<thead class="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
					<tr>
						<th class="px-4 py-3 font-semibold">Step</th>
						<th class="px-4 py-3 font-semibold">Offset</th>
						<th class="px-4 py-3 font-semibold">Window</th>
						<th class="px-4 py-3 font-semibold">Status</th>
						<th class="px-4 py-3 font-semibold">Copy in DB</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each steps as step}
						<tr>
							<td class="px-4 py-3 font-medium text-foreground">
								{step.step_number}. {step.step_key}
							</td>
							<td class="px-4 py-3 text-muted-foreground">
								Day {step.absolute_day_offset}
							</td>
							<td class="px-4 py-3 text-muted-foreground">
								{step.send_window_start_hour}:00-{step.send_window_end_hour}:00
							</td>
							<td class="px-4 py-3 text-muted-foreground">{step.status}</td>
							<td class="px-4 py-3">
								<span
									class="rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700"
								>
									No
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</AdminCard>

	<div class="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
		<AdminCard>
			<h2 class="text-base font-semibold text-foreground">Preview Sandbox</h2>
			<form method="GET" class="mt-4 grid gap-3">
				<input type="hidden" name="limit" value={data.limit} />
				<input type="hidden" name="days" value={data.days} />
				<label class="grid gap-1 text-sm font-medium text-foreground">
					<span>Step</span>
					<select
						name="preview_step"
						class="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
					>
						{#each ['email_1', 'email_2', 'email_3', 'email_4', 'email_5'] as step}
							<option value={step} selected={sandbox.input.step === step}
								>{step}</option
							>
						{/each}
					</select>
				</label>
				<label class="grid gap-1 text-sm font-medium text-foreground">
					<span>Name</span>
					<input
						name="preview_name"
						value={sandbox.input.name}
						class="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
					/>
				</label>
				<label class="grid gap-1 text-sm font-medium text-foreground">
					<span>Intent</span>
					<select
						name="onboarding_intent"
						class="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
					>
						{#each ['plan', 'organize', 'unstuck', 'explore', 'none'] as intent}
							<option
								value={intent}
								selected={sandbox.input.onboardingIntent === intent}
							>
								{intent}
							</option>
						{/each}
					</select>
				</label>
				<label class="grid gap-1 text-sm font-medium text-foreground">
					<span>Project Count</span>
					<input
						name="project_count"
						type="number"
						min="0"
						value={sandbox.input.projectCount}
						class="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
					/>
				</label>
				<div class="grid gap-2 text-sm text-foreground">
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							name="onboarding_completed"
							value="true"
							checked={sandbox.input.onboardingCompleted}
						/>
						Onboarding complete
					</label>
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							name="email_daily_brief_enabled"
							value="true"
							checked={sandbox.input.emailDailyBriefEnabled}
						/>
						Email daily brief enabled
					</label>
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							name="sms_channel_enabled"
							value="true"
							checked={sandbox.input.smsChannelEnabled}
						/>
						SMS channel enabled
					</label>
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							name="calendar_connected"
							value="true"
							checked={sandbox.input.calendarConnected}
						/>
						Calendar connected
					</label>
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							name="returned"
							value="true"
							checked={sandbox.input.returned}
						/>
						Returned for another session
					</label>
				</div>
				<button
					type="submit"
					class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
				>
					<RefreshCw class="h-4 w-4" />
					Preview
				</button>
			</form>

			<div class="mt-6 border-t border-border pt-5">
				<div class="flex items-center gap-2">
					<Send class="h-4 w-4 text-muted-foreground" />
					<h3 class="text-sm font-semibold text-foreground">Test Sends</h3>
				</div>
				<p class="mt-1 text-sm text-muted-foreground">
					Test sends use the current sandbox state, disable tracking, and are excluded
					from production metrics.
				</p>
				<form method="POST" class="mt-4 grid gap-3">
					<input type="hidden" name="preview_step" value={sandbox.input.step} />
					<input type="hidden" name="preview_name" value={sandbox.input.name} />
					<input
						type="hidden"
						name="onboarding_intent"
						value={sandbox.input.onboardingIntent}
					/>
					<input type="hidden" name="project_count" value={sandbox.input.projectCount} />
					<input
						type="hidden"
						name="onboarding_completed"
						value={String(sandbox.input.onboardingCompleted)}
					/>
					<input
						type="hidden"
						name="email_daily_brief_enabled"
						value={String(sandbox.input.emailDailyBriefEnabled)}
					/>
					<input
						type="hidden"
						name="sms_channel_enabled"
						value={String(sandbox.input.smsChannelEnabled)}
					/>
					<input
						type="hidden"
						name="calendar_connected"
						value={String(sandbox.input.calendarConnected)}
					/>
					<input type="hidden" name="returned" value={String(sandbox.input.returned)} />
					<label class="grid gap-1 text-sm font-medium text-foreground">
						<span>Recipient</span>
						<input
							name="test_recipient"
							type="email"
							required
							placeholder="you@example.com"
							class="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
						/>
					</label>
					<div class="flex flex-wrap gap-2">
						<button
							type="submit"
							formaction="?/testSend"
							disabled={!sandbox.preview.content || sandbox.preview.action !== 'send'}
							class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
						>
							<Mail class="h-4 w-4" />
							Current Step
						</button>
						<button
							type="submit"
							formaction="?/testFullSequence"
							class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
						>
							<Send class="h-4 w-4" />
							Full Sequence
						</button>
					</div>
				</form>
			</div>
		</AdminCard>

		<AdminCard>
			<div class="flex flex-wrap items-center gap-2">
				<span
					class="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
				>
					{sandbox.preview.action}
				</span>
				{#if sandbox.preview.branchKey}
					<span
						class="rounded-md bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-700"
					>
						{sandbox.preview.branchKey}
					</span>
				{/if}
				<span
					class="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
				>
					{sandbox.preview.reason}
				</span>
			</div>

			{#if sandbox.preview.content}
				<h2 class="mt-4 text-xl font-semibold text-foreground">
					{sandbox.preview.content.subject}
				</h2>
				<p class="mt-2 text-sm text-muted-foreground">
					CTA: {sandbox.preview.content.ctaLabel} -> {sandbox.preview.content.ctaUrl}
				</p>
				<div class="mt-4 grid gap-4 lg:grid-cols-2">
					<div>
						<p class="mb-2 text-xs font-semibold uppercase text-muted-foreground">
							Plain Text
						</p>
						<pre
							class="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-4 text-xs leading-relaxed text-foreground">{sandbox
								.preview.content.body}</pre>
					</div>
					<div>
						<p class="mb-2 text-xs font-semibold uppercase text-muted-foreground">
							Rendered HTML
						</p>
						<iframe
							title="Welcome email HTML preview"
							srcdoc={sandbox.preview.content.html}
							class="h-[520px] w-full rounded-md border border-border bg-white"
						></iframe>
					</div>
				</div>
			{:else}
				<p class="mt-4 text-sm text-muted-foreground">
					This state does not send an email. The branch is skipped or waiting.
				</p>
			{/if}
		</AdminCard>
	</div>

	<AdminCard padding="none" class="overflow-hidden">
		<div
			class="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-3"
		>
			<div>
				<h2 class="text-base font-semibold text-foreground">Local Copy Variants</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					Every sendable branch rendered from the local source file. Subject, CTA, and
					body are visible at a glance.
				</p>
			</div>
			<span class="text-xs text-muted-foreground">
				{localPreviews.length} variant{localPreviews.length === 1 ? '' : 's'}
			</span>
		</div>
		<div class="grid gap-4 p-4 lg:grid-cols-2">
			{#each localPreviews as preview, index}
				{@const previewKey = `variant-${index}`}
				{@const showHtml = openHtmlPreviews[previewKey] ?? false}
				<div
					class="flex flex-col rounded-lg border border-border bg-background/50 p-4 transition-colors hover:bg-background"
				>
					<div class="flex flex-wrap items-start justify-between gap-2">
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<span class="text-sm font-semibold text-foreground">
									{preview.label}
								</span>
							</div>
							{#if preview.description}
								<p class="mt-0.5 text-xs text-muted-foreground">
									{preview.description}
								</p>
							{/if}
						</div>
						<div class="flex flex-wrap justify-end gap-1.5">
							<span
								class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide {actionBadgeClasses(
									preview.action
								)}"
							>
								{#if preview.action === 'send'}
									<Send class="h-3 w-3" />
								{:else if preview.action === 'skip'}
									<SkipForward class="h-3 w-3" />
								{/if}
								{preview.action}
							</span>
							{#if preview.branchKey}
								<span
									class="rounded-md bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300"
								>
									{preview.branchKey}
								</span>
							{/if}
						</div>
					</div>

					{#if preview.content}
						<div class="mt-3 space-y-2">
							<div>
								<p
									class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
								>
									Subject
								</p>
								<p class="mt-0.5 text-sm font-medium text-foreground">
									{preview.content.subject}
								</p>
							</div>
							<div>
								<p
									class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
								>
									CTA
								</p>
								<p class="mt-0.5 text-xs text-foreground">
									<span class="font-medium">{preview.content.ctaLabel}</span>
									<span class="text-muted-foreground"> → </span>
									<span
										class="break-all font-mono text-[11px] text-muted-foreground"
										>{preview.content.ctaUrl}</span
									>
								</p>
							</div>
						</div>

						<pre
							class="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-xs leading-relaxed text-foreground">{preview
								.content.body}</pre>

						<button
							type="button"
							onclick={() => toggleHtmlPreview(previewKey)}
							class="mt-3 inline-flex items-center gap-1.5 self-start rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						>
							<Eye class="h-3.5 w-3.5" />
							{showHtml ? 'Hide HTML preview' : 'Show HTML preview'}
							<ChevronDown
								class="h-3 w-3 transition-transform duration-150 {showHtml
									? 'rotate-180'
									: ''}"
							/>
						</button>

						{#if showHtml}
							<iframe
								title={`${preview.label} HTML preview`}
								srcdoc={preview.content.html}
								class="mt-3 h-96 w-full rounded-md border border-border bg-white"
							></iframe>
						{/if}
					{:else}
						<div class="mt-3 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
							<SkipForward class="h-4 w-4 text-muted-foreground" />
							<p class="text-xs text-muted-foreground">
								No email body renders for this branch — it is skipped or waiting.
								<span class="mt-0.5 block text-[11px]"
									>Reason: {preview.reason}</span
								>
							</p>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</AdminCard>

	<AdminCard padding="none" class="overflow-hidden">
		<div class="border-b border-border px-4 py-3">
			<h2 class="text-base font-semibold text-foreground">Live Queue</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				First 100 sequence enrollments sorted by next send time.
			</p>
		</div>
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-border text-sm">
				<thead class="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
					<tr>
						<th class="px-4 py-3 font-semibold">Recipient</th>
						<th class="px-4 py-3 font-semibold">Status</th>
						<th class="px-4 py-3 font-semibold">Next Step</th>
						<th class="px-4 py-3 font-semibold">Next Send</th>
						<th class="px-4 py-3 font-semibold">Failures</th>
						<th class="px-4 py-3 font-semibold">Branch</th>
						<th class="px-4 py-3 font-semibold">Action</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each queueRows as row}
						<tr class={row.status === 'errored' ? 'bg-destructive/5' : ''}>
							<td class="px-4 py-3 align-top">
								<div class="font-medium text-foreground">{row.recipient_email}</div>
								<div class="mt-1 font-mono text-xs text-muted-foreground">
									{row.user_id}
								</div>
							</td>
							<td class="px-4 py-3 align-top">
								<span
									class="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
								>
									{row.status}
								</span>
								{#if row.exit_reason}
									<div class="mt-2 text-xs text-muted-foreground">
										Exit: {row.exit_reason}
									</div>
								{/if}
							</td>
							<td class="px-4 py-3 align-top text-muted-foreground">
								{#if row.next_step_number}
									<span class="font-medium text-foreground">
										{row.next_step_number}. email_{row.next_step_number}
									</span>
								{:else}
									none
								{/if}
								<div class="mt-1 text-xs">
									Current: {row.current_step_number}
								</div>
							</td>
							<td class="px-4 py-3 align-top text-muted-foreground">
								{formatValue(row.next_send_at)}
								{#if row.processing_started_at}
									<div class="mt-1 text-xs">
										Processing since {formatValue(row.processing_started_at)}
									</div>
								{/if}
							</td>
							<td class="px-4 py-3 align-top text-muted-foreground">
								{row.failure_count ?? 0}
								{#if row.last_error}
									<div
										class="mt-2 max-w-xs rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive"
									>
										{row.last_error}
									</div>
								{/if}
							</td>
							<td class="px-4 py-3 align-top text-muted-foreground">
								{row.branchPreview ?? 'none'}
							</td>
							<td class="px-4 py-3 align-top">
								<form method="POST" action="?/sendNextNow">
									<input type="hidden" name="enrollment_id" value={row.id} />
									<button
										type="submit"
										disabled={!canSendNextNow(row)}
										class="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
									>
										Send next now
									</button>
								</form>
							</td>
						</tr>
					{/each}

					{#if queueRows.length === 0}
						<tr>
							<td
								colspan="7"
								class="px-4 py-10 text-center text-sm text-muted-foreground"
							>
								No welcome sequence enrollments found.
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</AdminCard>

	<AdminCollapsibleSection
		title="Shadow Queue Parity"
		subtitle="Legacy welcome rows compared with Phase 2 shadow enrollments"
		icon={GitCompareArrows}
		badge={summary.mismatched + summary.missing > 0
			? summary.mismatched + summary.missing
			: null}
		badgeColor={summary.missing > 0 ? 'danger' : summary.mismatched > 0 ? 'warning' : 'default'}
		defaultExpanded={false}
	>
		<div class="space-y-4 p-4">
			<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<AdminCard tone="info" padding="md">
					<p class="text-sm font-medium text-muted-foreground">Legacy Rows</p>
					<p class="mt-2 text-3xl font-bold text-foreground">{summary.total}</p>
				</AdminCard>
				<AdminCard tone="success" padding="md">
					<p class="text-sm font-medium text-muted-foreground">Matched</p>
					<p class="mt-2 text-3xl font-bold text-foreground">{summary.matched}</p>
				</AdminCard>
				<AdminCard tone={summary.mismatched > 0 ? 'warning' : 'muted'} padding="md">
					<p class="text-sm font-medium text-muted-foreground">Mismatched</p>
					<p class="mt-2 text-3xl font-bold text-foreground">{summary.mismatched}</p>
				</AdminCard>
				<AdminCard tone={summary.missing > 0 ? 'danger' : 'muted'} padding="md">
					<p class="text-sm font-medium text-muted-foreground">Missing Shadow Rows</p>
					<p class="mt-2 text-3xl font-bold text-foreground">{summary.missing}</p>
				</AdminCard>
			</div>

			<AdminCard padding="md">
				<form method="GET" class="flex flex-wrap items-end gap-3">
					<input type="hidden" name="preview_step" value={sandbox.input.step} />
					<input type="hidden" name="preview_name" value={sandbox.input.name} />
					<input
						type="hidden"
						name="onboarding_intent"
						value={sandbox.input.onboardingIntent}
					/>
					<input type="hidden" name="project_count" value={sandbox.input.projectCount} />
					{#if sandbox.input.onboardingCompleted}
						<input type="hidden" name="onboarding_completed" value="true" />
					{/if}
					{#if sandbox.input.emailDailyBriefEnabled}
						<input type="hidden" name="email_daily_brief_enabled" value="true" />
					{/if}
					{#if sandbox.input.smsChannelEnabled}
						<input type="hidden" name="sms_channel_enabled" value="true" />
					{/if}
					{#if sandbox.input.calendarConnected}
						<input type="hidden" name="calendar_connected" value="true" />
					{/if}
					{#if sandbox.input.returned}
						<input type="hidden" name="returned" value="true" />
					{/if}
					<label class="flex flex-col gap-1 text-sm font-medium text-foreground">
						<span>Rows</span>
						<input
							name="limit"
							type="number"
							min="1"
							max="500"
							value={data.limit}
							class="h-10 w-28 rounded-md border border-border bg-background px-3 text-sm text-foreground"
						/>
					</label>
					<label class="flex flex-col gap-1 text-sm font-medium text-foreground">
						<span>Stats Days</span>
						<input
							name="days"
							type="number"
							min="1"
							max="365"
							value={data.days}
							class="h-10 w-28 rounded-md border border-border bg-background px-3 text-sm text-foreground"
						/>
					</label>
					<button
						type="submit"
						class="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
					>
						<RefreshCw class="h-4 w-4" />
						Refresh
					</button>
				</form>
			</AdminCard>

			<AdminCard padding="none" class="overflow-hidden">
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-border text-sm">
						<thead
							class="bg-muted/60 text-left text-xs uppercase text-muted-foreground"
						>
							<tr>
								<th class="px-4 py-3 font-semibold">User</th>
								<th class="px-4 py-3 font-semibold">Legacy</th>
								<th class="px-4 py-3 font-semibold">Shadow</th>
								<th class="px-4 py-3 font-semibold">Next Step</th>
								<th class="px-4 py-3 font-semibold">Diffs</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each rows as row}
								<tr class={row.diffCount > 0 ? 'bg-amber-500/5' : ''}>
									<td class="px-4 py-3 align-top">
										<div class="font-medium text-foreground">
											{row.email || 'No email'}
										</div>
										<div class="mt-1 font-mono text-xs text-muted-foreground">
											{row.userId}
										</div>
										<div class="mt-1 text-xs text-muted-foreground">
											Started {formatValue(row.legacyStartedAt)}
										</div>
									</td>
									<td class="px-4 py-3 align-top text-muted-foreground">
										<span class="font-medium text-foreground"
											>{row.legacyStatus}</span
										>
									</td>
									<td class="px-4 py-3 align-top text-muted-foreground">
										<span class="font-medium text-foreground">
											{row.actualStatus ?? 'missing'}
										</span>
										{#if row.expectedStatus !== row.actualStatus}
											<div class="mt-1 text-xs">
												Expected {row.expectedStatus ?? 'null'}
											</div>
										{/if}
									</td>
									<td class="px-4 py-3 align-top text-muted-foreground">
										<span class="font-medium text-foreground">
											{row.actualNextStep ?? 'null'}
										</span>
										{#if row.expectedNextStep !== row.actualNextStep}
											<div class="mt-1 text-xs">
												Expected {row.expectedNextStep ?? 'null'}
											</div>
										{/if}
									</td>
									<td class="px-4 py-3 align-top">
										{#if row.diffCount === 0}
											<div
												class="inline-flex items-center gap-2 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700"
											>
												<CheckCircle2 class="h-3.5 w-3.5" />
												Matched
											</div>
										{:else}
											<div class="space-y-2">
												<div
													class="inline-flex items-center gap-2 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700"
												>
													<TriangleAlert class="h-3.5 w-3.5" />
													{row.diffCount} difference{row.diffCount === 1
														? ''
														: 's'}
												</div>
												<div class="space-y-1">
													{#each row.diffs as diff}
														<div
															class="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
														>
															<span
																class="font-medium text-foreground"
																>{diff.field}</span
															>: expected {formatValue(
																diff.expected
															)}, actual {formatValue(diff.actual)}
														</div>
													{/each}
												</div>
											</div>
										{/if}
									</td>
								</tr>
							{/each}

							{#if rows.length === 0}
								<tr>
									<td
										colspan="5"
										class="px-4 py-10 text-center text-sm text-muted-foreground"
									>
										No legacy welcome rows found.
									</td>
								</tr>
							{/if}
						</tbody>
					</table>
				</div>
			</AdminCard>
		</div>
	</AdminCollapsibleSection>
</div>
