<!-- apps/web/src/routes/admin/email-sequences/+page.svelte -->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		Activity,
		CalendarClock,
		CheckCircle2,
		Clock3,
		Edit3,
		Eye,
		Loader2,
		Mail,
		MousePointerClick,
		Play,
		RefreshCw,
		RotateCcw,
		Send,
		TriangleAlert,
		Users
	} from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';

	type SequenceKey = 'buildos_reactivation_founder_pilot' | 'buildos_welcome';

	type CopyOption = {
		sequenceKey: SequenceKey;
		stepKey: string;
		variantKey: string;
		sequencePosition: number;
		stepLabel: string;
		triggerLabel: string;
		triggerDetail: string;
		label: string;
		description: string;
		status: 'source' | 'override';
		subject: string;
		body: string;
		sourceSubject: string;
		sourceBody: string;
		previewHtml: string;
		ctaLabel: string | null;
		ctaUrl: string | null;
		updatedAt: string | null;
	};

	type CopyGroup = {
		stepKey: string;
		sequencePosition: number;
		stepLabel: string;
		triggerLabel: string;
		triggerDetail: string;
		options: CopyOption[];
	};

	type RecipientRow = {
		id: string;
		memberId: string | null;
		email: string;
		name: string | null;
		userId: string;
		status: string;
		stageLabel: string;
		stepKey: string | null;
		variantKey: string | null;
		nextSendAt: string | null;
		scheduledFor: string | null;
		dueLabel: string;
		batchId: string | null;
		reason: string;
		sentCount: number;
		openCount: number;
		clickCount: number;
		returnedAt: string | null;
		firstActionAt: string | null;
		lastActivityAt: string | null;
		holdout: boolean;
		manualStop: boolean;
		replyStatus: string | null;
		touch1SentAt: string | null;
		touch2SentAt: string | null;
		touch3SentAt: string | null;
		anyOpen: boolean;
		anyClick: boolean;
		pendingSendId: string | null;
	};

	type CohortOption = {
		campaignId: string;
		cohortId: string;
		cohortFrozenAt: string;
		total: number;
		sendable: number;
		holdout: number;
		batches: string[];
	};

	type TriggerResultRow = {
		memberId: string;
		email: string;
		name: string | null;
		batchId: string | null;
		step: string | null;
		variant: string | null;
		status: 'queued' | 'sent' | 'skipped' | 'failed';
		scheduledFor: string | null;
		sendId: string | null;
		emailId: string | null;
		reason: string;
	};

	type TriggerResponse = {
		dryRun: boolean;
		triggerMode: string;
		counts: {
			selected: number;
			queued: number;
			sent: number;
			skipped: number;
			failed: number;
		};
		results: TriggerResultRow[];
	};

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	const selectedSequenceKey = $derived(data.selectedSequenceKey as SequenceKey);
	const selectedCopy = $derived((data.selectedCopy ?? null) as CopyOption | null);
	const copyOptions = $derived((data.copyOptions ?? []) as CopyOption[]);
	const groupedCopyOptions = $derived(groupCopyOptions(copyOptions));
	const selectedCopyParam = $derived($page.url.searchParams.get('copy'));
	const recipients = $derived(
		selectedSequenceKey === 'buildos_welcome'
			? ((data.welcome?.recipients ?? []) as RecipientRow[])
			: ((data.reactivation?.recipients ?? []) as RecipientRow[])
	);
	const selectableRecipients = $derived(
		recipients.filter((recipient) => Boolean(recipient.memberId))
	);
	const selectedCohortBatches = $derived(
		(((data.reactivation?.cohortOptions ?? []) as CohortOption[]).find(
			(cohort) => cohort.cohortId === data.reactivation?.selectedCohortId
		)?.batches ?? []) as string[]
	);

	let copyModalOpen = $state(false);
	let activeCopyKey = $state<string | null>(selectedCopyParam);
	let selectedMemberIds = $state<Set<string>>(new Set());
	let triggerMode = $state<'schedule' | 'send_now'>('schedule');
	let scheduledFor = $state(defaultScheduleInputValue());
	let demoUrl = $state('');
	let triggerLoading = $state(false);
	let triggerError = $state<string | null>(null);
	let triggerResult = $state<TriggerResponse | null>(null);
	let activityModalOpen = $state(false);
	let activityLoading = $state(false);
	let activityError = $state<string | null>(null);
	let activityData = $state<any>(null);
	let activeActivityRecipient = $state<RecipientRow | null>(null);
	let cohortLoading = $state(false);
	let cohortError = $state<string | null>(null);
	let cohortMessage = $state<string | null>(null);
	const modalCopy = $derived.by(() => {
		const key = activeCopyKey ?? selectedCopyParam;
		if (!key) {
			return selectedCopy;
		}

		return copyOptions.find((option) => copyKey(option) === key) ?? selectedCopy;
	});

	$effect(() => {
		if (selectedCopyParam) {
			activeCopyKey = selectedCopyParam;
			copyModalOpen = true;
		}
	});

	$effect(() => {
		selectedSequenceKey;
		data.reactivation?.selectedCohortId;
		data.reactivation?.selectedBatchId;
		selectedMemberIds = new Set();
		triggerResult = null;
		triggerError = null;
	});

	function groupCopyOptions(options: CopyOption[]): CopyGroup[] {
		const groups = new Map<string, CopyGroup>();

		for (const option of options) {
			const current =
				groups.get(option.stepKey) ??
				({
					stepKey: option.stepKey,
					sequencePosition: option.sequencePosition,
					stepLabel: option.stepLabel,
					triggerLabel: option.triggerLabel,
					triggerDetail: option.triggerDetail,
					options: []
				} satisfies CopyGroup);

			current.options.push(option);
			groups.set(option.stepKey, current);
		}

		return Array.from(groups.values()).sort(
			(left, right) => left.sequencePosition - right.sequencePosition
		);
	}

	function copyKey(option: CopyOption): string {
		return `${option.stepKey}:${option.variantKey}`;
	}

	function formatDate(value: string | null): string {
		if (!value) {
			return 'Manual';
		}

		const parsed = Date.parse(value);
		if (Number.isNaN(parsed)) {
			return value;
		}

		return new Date(parsed).toLocaleString();
	}

	function formatCompactDate(value: string | null): string {
		if (!value) return '—';
		const parsed = Date.parse(value);
		if (Number.isNaN(parsed)) return value;
		return new Date(parsed).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function defaultScheduleInputValue(): string {
		const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
		tomorrow.setMinutes(0, 0, 0);
		return toDatetimeLocalValue(tomorrow);
	}

	function toDatetimeLocalValue(date: Date): string {
		const pad = (value: number) => value.toString().padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
			date.getHours()
		)}:${pad(date.getMinutes())}`;
	}

	function selectedMemberIdList(): string[] {
		return Array.from(selectedMemberIds);
	}

	function copyHref(option: CopyOption): string {
		const params = new URLSearchParams();
		params.set('sequence', selectedSequenceKey);
		params.set('copy', copyKey(option));

		if (data.reactivation?.selectedCampaignId) {
			params.set('campaign_id', data.reactivation.selectedCampaignId);
		}
		if (data.reactivation?.selectedCohortId) {
			params.set('cohort_id', data.reactivation.selectedCohortId);
		}
		if (data.reactivation?.selectedBatchId) {
			params.set('batch_id', data.reactivation.selectedBatchId);
		}

		return `/admin/email-sequences?${params.toString()}`;
	}

	function copyActionHref(actionName: 'saveCopy' | 'clearCopy', option: CopyOption): string {
		const href = copyHref(option);
		const query = href.includes('?') ? href.slice(href.indexOf('?') + 1) : '';
		return `?/${actionName}${query ? `&${query}` : ''}`;
	}

	function openCopyModal(event: MouseEvent, option: CopyOption): void {
		event.preventDefault();
		activeCopyKey = copyKey(option);
		copyModalOpen = true;
		void goto(copyHref(option), { noScroll: true, keepFocus: true });
	}

	function closeCopyModal(): void {
		copyModalOpen = false;
		activeCopyKey = null;

		const url = new URL($page.url);
		url.searchParams.delete('copy');
		void goto(url.toString(), { replaceState: true, noScroll: true, keepFocus: true });
	}

	function variantLabel(option: CopyOption): string {
		return option.variantKey.replaceAll('_', ' ');
	}

	function isActiveCopy(option: CopyOption): boolean {
		return Boolean(copyModalOpen && modalCopy && copyKey(option) === copyKey(modalCopy));
	}

	function toggleMember(memberId: string | null): void {
		if (!memberId) return;
		const next = new Set(selectedMemberIds);
		if (next.has(memberId)) {
			next.delete(memberId);
		} else {
			next.add(memberId);
		}
		selectedMemberIds = next;
		triggerResult = null;
		triggerError = null;
	}

	function toggleAllVisible(): void {
		const visibleIds = selectableRecipients
			.map((recipient) => recipient.memberId)
			.filter((memberId): memberId is string => Boolean(memberId));
		const allSelected = visibleIds.every((memberId) => selectedMemberIds.has(memberId));
		const next = new Set(selectedMemberIds);
		for (const memberId of visibleIds) {
			if (allSelected) {
				next.delete(memberId);
			} else {
				next.add(memberId);
			}
		}
		selectedMemberIds = next;
		triggerResult = null;
		triggerError = null;
	}

	async function runTrigger(dryRun: boolean): Promise<void> {
		if (selectedMemberIds.size === 0) {
			triggerError = 'Select at least one reactivation member.';
			return;
		}

		triggerLoading = true;
		triggerError = null;
		if (!dryRun) {
			triggerResult = null;
		}

		try {
			const response = await fetch('/api/admin/retargeting/send', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					campaign_id: data.reactivation?.selectedCampaignId,
					cohort_id: data.reactivation?.selectedCohortId,
					batch_id: data.reactivation?.selectedBatchId || null,
					member_ids: selectedMemberIdList(),
					trigger_mode: triggerMode,
					schedule_mode: 'flow_cadence',
					scheduled_for:
						triggerMode === 'schedule' && scheduledFor
							? new Date(scheduledFor).toISOString()
							: null,
					demo_url: demoUrl.trim() || undefined,
					dry_run: dryRun
				})
			});
			const payload = await response.json();
			if (!response.ok || !payload.success) {
				throw new Error(payload.error || payload.message || 'Failed to trigger sequence');
			}
			triggerResult = payload.data as TriggerResponse;
			if (!dryRun) {
				selectedMemberIds = new Set();
			}
		} catch (error) {
			triggerError =
				error instanceof Error ? error.message : 'Failed to trigger reactivation sequence';
		} finally {
			triggerLoading = false;
		}
	}

	async function openActivity(recipient: RecipientRow): Promise<void> {
		if (!recipient.memberId) return;
		activeActivityRecipient = recipient;
		activityModalOpen = true;
		activityLoading = true;
		activityError = null;
		activityData = null;

		try {
			const response = await fetch(
				`/api/admin/retargeting/members/${recipient.memberId}/activity`
			);
			const payload = await response.json();
			if (!response.ok || !payload.success) {
				throw new Error(payload.error || payload.message || 'Failed to load activity');
			}
			activityData = payload.data;
		} catch (error) {
			activityError =
				error instanceof Error ? error.message : 'Failed to load reactivation activity';
		} finally {
			activityLoading = false;
		}
	}

	function closeActivity(): void {
		activityModalOpen = false;
		activeActivityRecipient = null;
		activityData = null;
		activityError = null;
	}

	async function buildDormantAudience(): Promise<void> {
		cohortLoading = true;
		cohortError = null;
		cohortMessage = null;

		try {
			const cohortId =
				data.reactivation?.selectedCohortId ||
				`reactivation-${new Date().toISOString().slice(0, 10)}`;
			const campaignId = data.reactivation?.selectedCampaignId;
			const response = await fetch('/api/admin/retargeting/cohorts', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					campaign_id: campaignId,
					cohort_id: cohortId,
					batch_size: 25,
					replace_existing: false
				})
			});
			const payload = await response.json();
			if (!response.ok || !payload.success) {
				throw new Error(
					payload.error || payload.message || 'Failed to build dormant audience'
				);
			}

			const counts = payload.data?.counts;
			cohortMessage = `Built dormant audience with ${counts?.total ?? 0} people (${counts?.sendable ?? 0} sendable).`;
			const url = new URL($page.url);
			url.searchParams.set('sequence', 'buildos_reactivation_founder_pilot');
			if (campaignId) {
				url.searchParams.set('campaign_id', campaignId);
			}
			url.searchParams.set('cohort_id', cohortId);
			await goto(url.toString(), { replaceState: true, noScroll: true, keepFocus: true });
			await invalidateAll();
		} catch (error) {
			cohortError =
				error instanceof Error ? error.message : 'Failed to build dormant audience';
		} finally {
			cohortLoading = false;
		}
	}

	function statusClasses(status: string): string {
		if (status === 'override' || status === 'ready' || status === 'active') {
			return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
		}
		if (status === 'waiting' || status === 'paused' || status === 'processing') {
			return 'bg-amber-500/10 text-amber-700 dark:text-amber-300';
		}
		if (status === 'blocked' || status === 'failed' || status === 'errored') {
			return 'bg-red-500/10 text-red-700 dark:text-red-300';
		}
		return 'bg-muted text-muted-foreground';
	}
</script>

<div class="admin-page space-y-6">
	<AdminPageHeader
		title="Email Sequences"
		description="Sequence copy, previews, recipients, and send timing for lifecycle and reactivation flows."
		icon={Mail}
	/>

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
				<p>{form.message}</p>
			</div>
		</AdminCard>
	{/if}

	<div class="flex flex-wrap gap-2">
		{#each data.sequences as sequence}
			<a
				href={`/admin/email-sequences?sequence=${sequence.key}`}
				class="inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors {selectedSequenceKey ===
				sequence.key
					? 'border-accent bg-accent text-accent-foreground'
					: 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'}"
			>
				<Mail class="h-4 w-4" />
				{sequence.label}
			</a>
		{/each}
	</div>

	<div class="grid gap-4 md:grid-cols-3">
		<AdminCard tone="muted" padding="md">
			<div class="flex items-center gap-2">
				<Edit3 class="h-4 w-4 text-muted-foreground" />
				<p class="text-sm font-medium text-muted-foreground">Copy Variants</p>
			</div>
			<p class="mt-2 text-3xl font-bold text-foreground">{copyOptions.length}</p>
		</AdminCard>
		<AdminCard tone="info" padding="md">
			<div class="flex items-center gap-2">
				<Users class="h-4 w-4 text-sky-700" />
				<p class="text-sm font-medium text-muted-foreground">People In View</p>
			</div>
			<p class="mt-2 text-3xl font-bold text-foreground">{recipients.length}</p>
		</AdminCard>
		<AdminCard tone="success" padding="md">
			<div class="flex items-center gap-2">
				<Clock3 class="h-4 w-4 text-emerald-700" />
				<p class="text-sm font-medium text-muted-foreground">Ready Or Active</p>
			</div>
			<p class="mt-2 text-3xl font-bold text-foreground">
				{recipients.filter((row) => row.status === 'ready' || row.status === 'active')
					.length}
			</p>
		</AdminCard>
	</div>

	{#if selectedSequenceKey === 'buildos_reactivation_founder_pilot'}
		<AdminCard padding="md">
			<form method="GET" class="grid gap-3 lg:grid-cols-[1fr_1fr_0.7fr_auto] lg:items-end">
				<input type="hidden" name="sequence" value="buildos_reactivation_founder_pilot" />
				<label class="grid gap-1 text-sm font-medium text-foreground">
					<span>Cohort</span>
					<select
						name="cohort_id"
						class="h-10 rounded-md border border-border bg-background px-3 text-sm"
					>
						{#if (data.reactivation?.cohortOptions ?? []).length === 0}
							<option value={data.reactivation?.selectedCohortId ?? 'founder-pilot'}>
								{data.reactivation?.selectedCohortId ?? 'founder-pilot'} (not built yet)
							</option>
						{/if}
						{#each data.reactivation?.cohortOptions ?? [] as cohort}
							<option
								value={cohort.cohortId}
								selected={cohort.cohortId === data.reactivation?.selectedCohortId}
							>
								{cohort.cohortId} ({cohort.sendable} sendable / {cohort.holdout} holdout)
							</option>
						{/each}
					</select>
				</label>
				<label class="grid gap-1 text-sm font-medium text-foreground">
					<span>Campaign</span>
					<input
						name="campaign_id"
						value={data.reactivation?.selectedCampaignId}
						class="h-10 rounded-md border border-border bg-background px-3 text-sm"
					/>
				</label>
				<label class="grid gap-1 text-sm font-medium text-foreground">
					<span>Batch</span>
					<select
						name="batch_id"
						class="h-10 rounded-md border border-border bg-background px-3 text-sm"
					>
						<option value="" selected={!data.reactivation?.selectedBatchId}
							>All batches</option
						>
						{#each selectedCohortBatches as batch}
							<option
								value={batch}
								selected={batch === data.reactivation?.selectedBatchId}
								>{batch}</option
							>
						{/each}
					</select>
				</label>
				<button
					type="submit"
					class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
				>
					<RefreshCw class="h-4 w-4" />
					Load
				</button>
			</form>

			{#if data.reactivation?.error}
				<div
					class="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
				>
					{data.reactivation.error}
				</div>
			{/if}

			{#if (data.reactivation?.cohortOptions ?? []).length === 0}
				<div class="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-4">
					<div class="flex flex-wrap items-start justify-between gap-4">
						<div>
							<p class="text-sm font-semibold text-foreground">
								No dormant reactivation audience has been built yet.
							</p>
							<p class="mt-1 max-w-3xl text-sm text-muted-foreground">
								This page needs a frozen dormant-user cohort before it can show
								people, compute their next touch, or queue reactivation emails.
							</p>
						</div>
						<button
							type="button"
							disabled={cohortLoading}
							onclick={buildDormantAudience}
							class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#if cohortLoading}
								<Loader2 class="h-4 w-4 animate-spin" />
							{:else}
								<Users class="h-4 w-4" />
							{/if}
							Build Dormant Audience
						</button>
					</div>
				</div>
			{/if}

			{#if cohortError}
				<div
					class="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
				>
					{cohortError}
				</div>
			{:else if cohortMessage}
				<div
					class="mt-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-800"
				>
					{cohortMessage}
				</div>
			{/if}
		</AdminCard>
	{/if}

	{#if selectedSequenceKey === 'buildos_reactivation_founder_pilot'}
		<AdminCard padding="md">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 class="text-base font-semibold text-foreground">Reactivation Operations</h2>
					<p class="mt-1 max-w-3xl text-sm text-muted-foreground">
						Select people, preview the computed next touch for each person, then queue
						their next reactivation email or send it now.
					</p>
				</div>
				<div class="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
					<span class="font-semibold text-foreground">{selectedMemberIds.size}</span>
					<span class="text-muted-foreground"> selected</span>
				</div>
			</div>

			<div class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,0.8fr)]">
				<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<label class="rounded-md border border-border bg-background p-3">
						<span class="flex items-center gap-2 text-sm font-semibold text-foreground">
							<CalendarClock class="h-4 w-4" />
							Schedule
						</span>
						<span class="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
							<input
								type="radio"
								name="trigger_mode"
								value="schedule"
								checked={triggerMode === 'schedule'}
								onchange={() => (triggerMode = 'schedule')}
							/>
							Use flow cadence
						</span>
					</label>
					<label class="rounded-md border border-border bg-background p-3">
						<span class="flex items-center gap-2 text-sm font-semibold text-foreground">
							<Play class="h-4 w-4" />
							Send Now
						</span>
						<span class="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
							<input
								type="radio"
								name="trigger_mode"
								value="send_now"
								checked={triggerMode === 'send_now'}
								onchange={() => (triggerMode = 'send_now')}
							/>
							Override timing
						</span>
					</label>
					<label class="grid gap-1 text-sm font-medium text-foreground sm:col-span-2">
						<span>Minimum scheduled time</span>
						<input
							type="datetime-local"
							bind:value={scheduledFor}
							disabled={triggerMode === 'send_now'}
							class="h-10 rounded-md border border-border bg-background px-3 text-sm disabled:opacity-50"
						/>
					</label>
					<label
						class="grid gap-1 text-sm font-medium text-foreground sm:col-span-2 lg:col-span-4"
					>
						<span>Demo URL for Touch 2</span>
						<input
							bind:value={demoUrl}
							placeholder="https://..."
							class="h-10 rounded-md border border-border bg-background px-3 text-sm"
						/>
					</label>
				</div>

				<div class="rounded-md border border-border bg-muted/30 p-3">
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							disabled={triggerLoading || selectedMemberIds.size === 0}
							onclick={() => runTrigger(true)}
							class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#if triggerLoading}
								<Loader2 class="h-4 w-4 animate-spin" />
							{:else}
								<Eye class="h-4 w-4" />
							{/if}
							Dry Run
						</button>
						<button
							type="button"
							disabled={triggerLoading || selectedMemberIds.size === 0}
							onclick={() => runTrigger(false)}
							class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#if triggerLoading}
								<Loader2 class="h-4 w-4 animate-spin" />
							{:else}
								<Send class="h-4 w-4" />
							{/if}
							{triggerMode === 'send_now' ? 'Send Now' : 'Queue Sends'}
						</button>
					</div>
					{#if triggerError}
						<p class="mt-3 text-sm text-destructive">{triggerError}</p>
					{/if}
					{#if triggerResult}
						<div class="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
							<div class="rounded border border-border bg-background p-2">
								<p class="text-lg font-bold text-foreground">
									{triggerResult.counts.queued}
								</p>
								<p class="text-muted-foreground">Queued</p>
							</div>
							<div class="rounded border border-border bg-background p-2">
								<p class="text-lg font-bold text-foreground">
									{triggerResult.counts.sent}
								</p>
								<p class="text-muted-foreground">Sent</p>
							</div>
							<div class="rounded border border-border bg-background p-2">
								<p class="text-lg font-bold text-foreground">
									{triggerResult.counts.skipped}
								</p>
								<p class="text-muted-foreground">Skipped</p>
							</div>
							<div class="rounded border border-border bg-background p-2">
								<p class="text-lg font-bold text-foreground">
									{triggerResult.counts.failed}
								</p>
								<p class="text-muted-foreground">Failed</p>
							</div>
						</div>
					{/if}
				</div>
			</div>

			{#if triggerResult?.results?.length}
				<div class="mt-4 max-h-72 overflow-auto rounded-md border border-border">
					<table class="min-w-full divide-y divide-border text-sm">
						<thead
							class="bg-muted/60 text-left text-xs uppercase text-muted-foreground"
						>
							<tr>
								<th class="px-3 py-2 font-semibold">Person</th>
								<th class="px-3 py-2 font-semibold">Next Touch</th>
								<th class="px-3 py-2 font-semibold">When</th>
								<th class="px-3 py-2 font-semibold">Result</th>
								<th class="px-3 py-2 font-semibold">Reason</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each triggerResult.results as result}
								<tr>
									<td class="px-3 py-2 text-foreground">{result.email}</td>
									<td class="px-3 py-2 text-muted-foreground">
										{result.step ?? 'none'}
									</td>
									<td class="px-3 py-2 text-muted-foreground">
										{formatCompactDate(result.scheduledFor)}
									</td>
									<td class="px-3 py-2">
										<span
											class="rounded-md px-2 py-1 text-xs font-semibold {statusClasses(
												result.status
											)}"
										>
											{result.status}
										</span>
									</td>
									<td class="px-3 py-2 text-muted-foreground">{result.reason}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</AdminCard>
	{/if}

	<AdminCard padding="none" class="overflow-hidden">
		<div class="border-b border-border px-4 py-3">
			<h2 class="text-base font-semibold text-foreground">Sequence Map</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Variants are grouped under the step that sends them. Source copy is the fallback;
				overrides are used by send paths.
			</p>
		</div>
		<div class="divide-y divide-border">
			{#each groupedCopyOptions as group}
				<section class="grid gap-4 px-4 py-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
					<div class="min-w-0">
						<div class="flex items-center gap-3">
							<span
								class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background"
							>
								{group.sequencePosition}
							</span>
							<div class="min-w-0">
								<h3 class="text-sm font-semibold text-foreground">
									{group.stepLabel}
								</h3>
								<p class="text-xs text-muted-foreground">{group.stepKey}</p>
							</div>
						</div>
						<div class="mt-3 flex items-start gap-2 text-xs text-foreground">
							<Clock3 class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<p class="font-medium">{group.triggerLabel}</p>
						</div>
						<p class="mt-1 pl-5 text-xs leading-relaxed text-muted-foreground">
							{group.triggerDetail}
						</p>
					</div>
					<div class="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
						{#each group.options as option}
							<a
								href={copyHref(option)}
								onclick={(event) => openCopyModal(event, option)}
								class="block rounded-lg border px-3 py-3 transition-colors {isActiveCopy(
									option
								)
									? 'border-accent bg-accent/10'
									: 'border-border bg-background hover:bg-muted/60'}"
							>
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0">
										<p
											class="truncate text-sm font-semibold capitalize text-foreground"
										>
											{variantLabel(option)}
										</p>
										<p
											class="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground"
										>
											{option.description}
										</p>
									</div>
									<span
										class="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold uppercase {statusClasses(
											option.status
										)}"
									>
										{option.status}
									</span>
								</div>
								<p class="mt-3 line-clamp-2 text-sm font-medium text-foreground">
									{option.subject}
								</p>
							</a>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	</AdminCard>

	<AdminCard padding="none" class="overflow-hidden">
		<div class="border-b border-border px-4 py-3">
			<h2 class="text-base font-semibold text-foreground">People And Sequence State</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Current stage, next email, engagement, and return signals for the selected sequence.
			</p>
		</div>
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-border text-sm">
				<thead class="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
					<tr>
						{#if selectedSequenceKey === 'buildos_reactivation_founder_pilot'}
							<th class="w-10 px-4 py-3 font-semibold">
								<input
									type="checkbox"
									checked={selectableRecipients.length > 0 &&
										selectableRecipients.every(
											(recipient) =>
												recipient.memberId &&
												selectedMemberIds.has(recipient.memberId)
										)}
									onchange={toggleAllVisible}
									aria-label="Select all visible reactivation members"
								/>
							</th>
						{/if}
						<th class="px-4 py-3 font-semibold">Recipient</th>
						<th class="px-4 py-3 font-semibold">Stage</th>
						<th class="px-4 py-3 font-semibold">Next</th>
						<th class="px-4 py-3 font-semibold">Engagement</th>
						<th class="px-4 py-3 font-semibold">Activity</th>
						<th class="px-4 py-3 font-semibold">Reason</th>
						{#if selectedSequenceKey === 'buildos_reactivation_founder_pilot'}
							<th class="px-4 py-3 font-semibold">Actions</th>
						{/if}
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each recipients as recipient}
						<tr>
							{#if selectedSequenceKey === 'buildos_reactivation_founder_pilot'}
								<td class="px-4 py-3">
									<input
										type="checkbox"
										checked={Boolean(
											recipient.memberId &&
												selectedMemberIds.has(recipient.memberId)
										)}
										onchange={() => toggleMember(recipient.memberId)}
										aria-label={`Select ${recipient.email}`}
									/>
								</td>
							{/if}
							<td class="px-4 py-3">
								<p class="font-medium text-foreground">{recipient.email}</p>
								{#if recipient.name || recipient.batchId}
									<p class="mt-1 text-xs text-muted-foreground">
										{recipient.name ?? recipient.batchId}
										{#if recipient.name && recipient.batchId}
											· {recipient.batchId}{/if}
									</p>
								{/if}
							</td>
							<td class="px-4 py-3">
								<span
									class="rounded-md px-2 py-1 text-xs font-semibold {statusClasses(
										recipient.status
									)}"
								>
									{recipient.stageLabel ?? recipient.status}
								</span>
								<p class="mt-1 text-xs text-muted-foreground">
									{recipient.sentCount} sent
								</p>
							</td>
							<td class="px-4 py-3 text-muted-foreground">
								<p class="font-medium text-foreground">
									{recipient.stepKey ?? 'none'}
								</p>
								{#if recipient.variantKey}
									<span class="block text-xs">{recipient.variantKey}</span>
								{/if}
								<p class="mt-1 text-xs text-muted-foreground">
									{formatCompactDate(
										recipient.scheduledFor ?? recipient.nextSendAt
									)}
								</p>
							</td>
							<td class="px-4 py-3 text-muted-foreground">
								<div class="flex flex-wrap gap-2">
									<span class="inline-flex items-center gap-1">
										<Eye class="h-3.5 w-3.5" />
										{recipient.openCount}
									</span>
									<span class="inline-flex items-center gap-1">
										<MousePointerClick class="h-3.5 w-3.5" />
										{recipient.clickCount}
									</span>
								</div>
								{#if recipient.returnedAt}
									<p class="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
										Returned {formatCompactDate(recipient.returnedAt)}
									</p>
								{/if}
							</td>
							<td class="px-4 py-3 text-muted-foreground">
								<p>{formatCompactDate(recipient.lastActivityAt)}</p>
								{#if recipient.firstActionAt}
									<p class="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
										Action {formatCompactDate(recipient.firstActionAt)}
									</p>
								{/if}
							</td>
							<td class="max-w-md px-4 py-3 text-muted-foreground">
								{recipient.reason}
							</td>
							{#if selectedSequenceKey === 'buildos_reactivation_founder_pilot'}
								<td class="px-4 py-3">
									<button
										type="button"
										onclick={() => openActivity(recipient)}
										class="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
									>
										<Activity class="h-3.5 w-3.5" />
										Activity
									</button>
								</td>
							{/if}
						</tr>
					{:else}
						<tr>
							<td
								colspan={selectedSequenceKey ===
								'buildos_reactivation_founder_pilot'
									? 8
									: 6}
								class="px-4 py-8 text-center text-sm text-muted-foreground"
							>
								{#if selectedSequenceKey === 'buildos_reactivation_founder_pilot' && (data.reactivation?.cohortOptions ?? []).length === 0}
									Build a dormant audience above to pull in reactivation
									candidates.
								{:else}
									No people found for this selection.
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</AdminCard>
</div>

<Modal
	bind:isOpen={copyModalOpen}
	title={modalCopy ? `${modalCopy.stepLabel}: ${variantLabel(modalCopy)}` : 'Email Copy'}
	size="xl"
	customClasses="!max-w-[92rem] sm:!max-h-[92dvh]"
	onClose={closeCopyModal}
>
	{#if modalCopy}
		<div class="space-y-4 p-4 sm:p-5">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-2">
						<span
							class="rounded-md px-2 py-1 text-[11px] font-semibold uppercase {statusClasses(
								modalCopy.status
							)}"
						>
							{modalCopy.status}
						</span>
						<span class="text-sm font-medium text-muted-foreground">
							{modalCopy.stepKey} / {modalCopy.variantKey}
						</span>
					</div>
					<div
						class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground"
					>
						<span class="inline-flex items-center gap-1.5">
							<Clock3 class="h-4 w-4" />
							{modalCopy.triggerLabel}
						</span>
						<span>{modalCopy.description}</span>
					</div>
				</div>
				{#if modalCopy.updatedAt}
					<p class="text-xs text-muted-foreground">
						Updated {formatDate(modalCopy.updatedAt)}
					</p>
				{/if}
			</div>

			{#if form?.error}
				<div
					class="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
				>
					<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
					<p>{form.error}</p>
				</div>
			{:else if form?.success}
				<div
					class="flex items-start gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-800"
				>
					<CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0" />
					<p>{form.message}</p>
				</div>
			{/if}

			<div class="grid gap-4 xl:grid-cols-2">
				<div class="rounded-lg border border-border bg-card">
					<div class="border-b border-border px-4 py-3">
						<p class="text-xs font-semibold uppercase text-muted-foreground">
							Editable Copy
						</p>
					</div>
					<div class="p-4">
						<form method="POST" class="grid gap-4">
							<input
								type="hidden"
								name="sequence_key"
								value={modalCopy.sequenceKey}
							/>
							<input type="hidden" name="step_key" value={modalCopy.stepKey} />
							<input type="hidden" name="variant_key" value={modalCopy.variantKey} />
							<label class="grid gap-1 text-sm font-medium text-foreground">
								<span>Subject</span>
								<input
									name="subject"
									value={modalCopy.subject}
									required
									class="h-11 rounded-md border border-border bg-background px-3 text-sm"
								/>
							</label>
							<label class="grid gap-1 text-sm font-medium text-foreground">
								<span>Body</span>
								<textarea
									name="body"
									required
									rows="24"
									class="min-h-[520px] rounded-md border border-border bg-background px-3 py-3 font-mono text-xs leading-relaxed"
									value={modalCopy.body}
								></textarea>
							</label>
							<div class="rounded-md border border-border bg-muted/40 p-3">
								<p
									class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
								>
									Available tokens
								</p>
								<div class="mt-2 flex flex-wrap gap-1.5">
									{#each data.tokens as token}
										<code
											class="rounded bg-background px-2 py-1 text-[11px] text-foreground"
										>
											{token}
										</code>
									{/each}
								</div>
							</div>
							<div class="flex flex-wrap gap-2">
								<button
									type="submit"
									formaction={copyActionHref('saveCopy', modalCopy)}
									class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
								>
									<CheckCircle2 class="h-4 w-4" />
									Save Copy
								</button>
							</div>
						</form>

						{#if modalCopy.status === 'override'}
							<form method="POST" class="mt-3">
								<input
									type="hidden"
									name="sequence_key"
									value={modalCopy.sequenceKey}
								/>
								<input type="hidden" name="step_key" value={modalCopy.stepKey} />
								<input
									type="hidden"
									name="variant_key"
									value={modalCopy.variantKey}
								/>
								<button
									type="submit"
									formaction={copyActionHref('clearCopy', modalCopy)}
									class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
								>
									<RotateCcw class="h-4 w-4" />
									Restore Source Copy
								</button>
							</form>
						{/if}

						<details class="mt-4 rounded-md border border-border bg-muted/40 p-3">
							<summary
								class="cursor-pointer text-xs font-semibold uppercase text-muted-foreground"
							>
								Source Copy Reference
							</summary>
							<p class="mt-3 text-xs font-semibold uppercase text-muted-foreground">
								Subject
							</p>
							<p
								class="mt-1 rounded-md border border-border bg-background p-3 text-sm text-foreground"
							>
								{modalCopy.sourceSubject}
							</p>
							<p class="mt-4 text-xs font-semibold uppercase text-muted-foreground">
								Body
							</p>
							<pre
								class="mt-1 max-h-[300px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-xs leading-relaxed text-muted-foreground">{modalCopy.sourceBody}</pre>
						</details>
					</div>
				</div>

				<div class="rounded-lg border border-border bg-card">
					<div
						class="flex items-center justify-between gap-3 border-b border-border px-4 py-3"
					>
						<div class="flex items-center gap-2">
							<Eye class="h-4 w-4 text-muted-foreground" />
							<p class="text-xs font-semibold uppercase text-muted-foreground">
								Polished Preview
							</p>
						</div>
						<p class="text-xs text-muted-foreground">{modalCopy.triggerLabel}</p>
					</div>
					<div class="p-4">
						<iframe
							title="Email copy preview"
							srcdoc={modalCopy.previewHtml}
							class="h-[760px] w-full rounded-md border border-border bg-white"
						></iframe>
					</div>
				</div>
			</div>
		</div>
	{/if}
</Modal>

<Modal
	bind:isOpen={activityModalOpen}
	title={activeActivityRecipient
		? `Reactivation Activity: ${activeActivityRecipient.name ?? activeActivityRecipient.email}`
		: 'Reactivation Activity'}
	size="xl"
	customClasses="!max-w-[86rem] sm:!max-h-[90dvh]"
	onClose={closeActivity}
>
	<div class="space-y-4 p-4 sm:p-5">
		{#if activityLoading}
			<div class="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-4">
				<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
				<p class="text-sm text-muted-foreground">Loading reactivation activity...</p>
			</div>
		{:else if activityError}
			<div
				class="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
			>
				<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
				<p>{activityError}</p>
			</div>
		{:else if activityData}
			<div class="grid gap-3 md:grid-cols-4">
				<div class="rounded-md border border-border bg-card p-3">
					<p class="text-xs font-semibold uppercase text-muted-foreground">Sent</p>
					<p class="mt-1 text-2xl font-bold text-foreground">
						{activityData.stats?.sentCount ?? 0}
					</p>
				</div>
				<div class="rounded-md border border-border bg-card p-3">
					<p class="text-xs font-semibold uppercase text-muted-foreground">Opened</p>
					<p class="mt-1 text-2xl font-bold text-foreground">
						{activityData.stats?.opened ? 'Yes' : 'No'}
					</p>
				</div>
				<div class="rounded-md border border-border bg-card p-3">
					<p class="text-xs font-semibold uppercase text-muted-foreground">Clicked</p>
					<p class="mt-1 text-2xl font-bold text-foreground">
						{activityData.stats?.clicked ? 'Yes' : 'No'}
					</p>
				</div>
				<div class="rounded-md border border-border bg-card p-3">
					<p class="text-xs font-semibold uppercase text-muted-foreground">Returned</p>
					<p class="mt-1 text-sm font-semibold text-foreground">
						{formatCompactDate(activityData.stats?.returnedAt ?? null)}
					</p>
				</div>
			</div>

			<div class="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
				<section class="rounded-md border border-border bg-card">
					<div class="border-b border-border px-4 py-3">
						<h3 class="text-sm font-semibold text-foreground">Reactivation Timeline</h3>
					</div>
					<div class="max-h-[520px] overflow-auto divide-y divide-border">
						{#each activityData.timeline ?? [] as event}
							<div class="grid gap-1 px-4 py-3">
								<div class="flex items-start justify-between gap-3">
									<div>
										<p class="text-sm font-semibold text-foreground">
											{event.label}
										</p>
										{#if event.subject || event.description}
											<p class="mt-1 text-xs text-muted-foreground">
												{event.subject ?? event.description}
											</p>
										{/if}
									</div>
									<p class="shrink-0 text-xs text-muted-foreground">
										{formatCompactDate(event.occurredAt)}
									</p>
								</div>
								{#if event.stepLabel}
									<p class="text-xs text-muted-foreground">{event.stepLabel}</p>
								{/if}
							</div>
						{:else}
							<p class="px-4 py-8 text-center text-sm text-muted-foreground">
								No timeline events yet.
							</p>
						{/each}
					</div>
				</section>

				<section class="rounded-md border border-border bg-card">
					<div class="border-b border-border px-4 py-3">
						<h3 class="text-sm font-semibold text-foreground">BuildOS Activity</h3>
					</div>
					<div class="max-h-[520px] overflow-auto divide-y divide-border">
						{#each activityData.activity ?? [] as item}
							<div class="px-4 py-3">
								<div class="flex items-start justify-between gap-3">
									<div>
										<div class="flex flex-wrap items-center gap-2">
											<p class="text-sm font-semibold text-foreground">
												{item.label}
											</p>
											{#if item.afterFirstSend}
												<span
													class="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
												>
													after email
												</span>
											{/if}
										</div>
										<p class="mt-1 text-xs text-muted-foreground">
											{item.type.replaceAll('_', ' ')}
										</p>
										{#if item.description}
											<p class="mt-1 text-xs text-muted-foreground">
												{item.description}
											</p>
										{/if}
									</div>
									<p class="shrink-0 text-xs text-muted-foreground">
										{formatCompactDate(item.occurredAt)}
									</p>
								</div>
							</div>
						{:else}
							<p class="px-4 py-8 text-center text-sm text-muted-foreground">
								No tracked BuildOS activity found.
							</p>
						{/each}
					</div>
				</section>
			</div>
		{/if}
	</div>
</Modal>
