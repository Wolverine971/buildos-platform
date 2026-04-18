<!-- apps/web/src/routes/admin/welcome-sequence/+page.svelte -->
<script lang="ts">
	import { CheckCircle2, Code2, GitCompareArrows, RefreshCw, TriangleAlert } from 'lucide-svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
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

	let { data } = $props();

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

	<AdminCard tone="info">
		<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
			<div>
				<div class="flex items-center gap-2">
					<Code2 class="h-5 w-5 text-sky-700" />
					<h2 class="text-base font-semibold text-foreground">Copy is local</h2>
				</div>
				<p class="mt-2 text-sm text-muted-foreground">
					Supabase stores sequence state, scheduling, events, and stats. Subjects, plain
					text, and HTML are rendered from source code.
				</p>
			</div>
			<code
				class="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground"
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
		<div class="border-b border-border px-4 py-3">
			<h2 class="text-base font-semibold text-foreground">Local Copy Variants</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Every sendable branch rendered from the local source file.
			</p>
		</div>
		<div class="divide-y divide-border">
			{#each localPreviews as preview}
				<details class="group">
					<summary
						class="flex cursor-pointer items-center justify-between gap-4 px-4 py-3"
					>
						<div>
							<div class="font-medium text-foreground">{preview.label}</div>
							<div class="mt-1 text-sm text-muted-foreground">
								{preview.description}
							</div>
						</div>
						<div class="flex shrink-0 flex-wrap justify-end gap-2">
							<span
								class="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
							>
								{preview.action}
							</span>
							{#if preview.branchKey}
								<span
									class="rounded-md bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-700"
								>
									{preview.branchKey}
								</span>
							{/if}
						</div>
					</summary>
					<div class="grid gap-4 border-t border-border px-4 py-4 lg:grid-cols-2">
						{#if preview.content}
							<div>
								<p class="text-sm font-semibold text-foreground">
									{preview.content.subject}
								</p>
								<pre
									class="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-xs leading-relaxed text-foreground">{preview
										.content.body}</pre>
							</div>
							<iframe
								title={`${preview.label} HTML preview`}
								srcdoc={preview.content.html}
								class="h-96 w-full rounded-md border border-border bg-white"
							></iframe>
						{:else}
							<p class="text-sm text-muted-foreground">
								No email body renders for this branch because it is skipped.
							</p>
						{/if}
					</div>
				</details>
			{/each}
		</div>
	</AdminCard>

	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold text-foreground">Shadow Queue Parity</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Legacy welcome rows compared with Phase 2 shadow enrollments.
			</p>
		</div>
	</div>

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
			<input type="hidden" name="onboarding_intent" value={sandbox.input.onboardingIntent} />
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
				<thead class="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
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
								<span class="font-medium text-foreground">{row.legacyStatus}</span>
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
													<span class="font-medium text-foreground"
														>{diff.field}</span
													>: expected {formatValue(diff.expected)}, actual {formatValue(
														diff.actual
													)}
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
