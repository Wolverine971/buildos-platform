<!-- apps/web/src/lib/components/email-campaigns/SendPanel.svelte -->
<script lang="ts">
	import { CalendarClock, Send, TriangleAlert, Zap } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import {
		WAVE_INTERVAL_RANGE,
		WAVE_SIZE_RANGE,
		type CampaignRecipientView
	} from '$lib/email-campaigns/types';
	import {
		checkSendReadiness,
		computeWavePlan,
		formatDateTime,
		formatInterval
	} from '$lib/email-campaigns/ui-helpers';

	let {
		subjectTemplate,
		bodyTemplate,
		fromName,
		recipients,
		waveSize,
		waveIntervalMinutes,
		startsAt,
		editable,
		queueing = false,
		testing = false,
		adminEmail = '',
		onplan,
		onqueue,
		ontest
	}: {
		subjectTemplate: string;
		bodyTemplate: string;
		fromName: string;
		recipients: CampaignRecipientView[];
		waveSize: number;
		waveIntervalMinutes: number;
		startsAt: string | null;
		editable: boolean;
		queueing?: boolean;
		testing?: boolean;
		adminEmail?: string;
		onplan: (
			patch: Partial<{
				wave_size: number;
				wave_interval_minutes: number;
				starts_at: string | null;
			}>
		) => void;
		onqueue: () => void;
		ontest: () => void;
	} = $props();

	const INTERVAL_PRESETS = [5, 15, 30, 60, 120, 240, 1440];

	let showConfirm = $state(false);
	let now = $state(new Date());

	$effect(() => {
		const timer = window.setInterval(() => (now = new Date()), 30_000);
		return () => window.clearInterval(timer);
	});

	const startMode = $derived<'now' | 'later'>(startsAt ? 'later' : 'now');
	const readiness = $derived(
		checkSendReadiness(
			{ subject_template: subjectTemplate, body_template: bodyTemplate },
			recipients
		)
	);
	const startDate = $derived(startsAt ? new Date(startsAt) : now);
	const startInPast = $derived(Boolean(startsAt) && startDate.getTime() < now.getTime() - 60_000);
	const plan = $derived(
		computeWavePlan({
			count: readiness.includedCount,
			startAt: startDate,
			waveSize,
			intervalMinutes: waveIntervalMinutes
		})
	);
	const intervalOptions = $derived(
		INTERVAL_PRESETS.includes(waveIntervalMinutes)
			? INTERVAL_PRESETS
			: [...INTERVAL_PRESETS, waveIntervalMinutes].sort((a, b) => a - b)
	);

	const planSentence = $derived.by(() => {
		if (plan.count === 0) return 'Nobody to send to yet.';
		const people = `${plan.count} email${plan.count === 1 ? '' : 's'}`;
		const first = startsAt ? formatDateTime(plan.firstAt) : 'within a minute of queueing';
		if (plan.waves <= 1) return `${people} in one wave, ${first}.`;
		return `${people} in ${plan.waves} waves of up to ${waveSize}, ${formatInterval(
			waveIntervalMinutes
		)} apart. First wave ${startsAt ? `at ${first}` : first}; last wave around ${formatDateTime(
			plan.lastAt
		)}.`;
	});

	function toLocalInput(iso: string | null): string {
		if (!iso) return '';
		const date = new Date(iso);
		const pad = (value: number) => String(value).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
			date.getHours()
		)}:${pad(date.getMinutes())}`;
	}

	function defaultLaterStart(): string {
		// Next weekday-agnostic 9:00 AM local, at least an hour out.
		const date = new Date(Date.now() + 60 * 60_000);
		date.setMinutes(0, 0, 0);
		if (date.getHours() >= 9) date.setDate(date.getDate() + 1);
		date.setHours(9);
		return date.toISOString();
	}

	function clamp(value: number, min: number, max: number): number {
		if (!Number.isFinite(value)) return min;
		return Math.min(max, Math.max(min, Math.round(value)));
	}
</script>

<div class="space-y-5">
	<fieldset class="space-y-2" disabled={!editable}>
		<legend class="micro-label mb-1">When</legend>
		<div class="flex flex-col gap-2 sm:flex-row">
			<label
				class="flex min-h-11 flex-1 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors {startMode ===
				'now'
					? 'border-accent bg-accent/5 text-foreground'
					: 'border-border text-muted-foreground hover:text-foreground'}"
			>
				<input
					type="radio"
					name="campaign-start"
					checked={startMode === 'now'}
					onchange={() => onplan({ starts_at: null })}
					class="h-4 w-4 bg-background text-accent focus:ring-ring"
				/>
				<Zap class="h-4 w-4 shrink-0" />
				Start now
			</label>
			<label
				class="flex min-h-11 flex-1 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors {startMode ===
				'later'
					? 'border-accent bg-accent/5 text-foreground'
					: 'border-border text-muted-foreground hover:text-foreground'}"
			>
				<input
					type="radio"
					name="campaign-start"
					checked={startMode === 'later'}
					onchange={() => onplan({ starts_at: defaultLaterStart() })}
					class="h-4 w-4 bg-background text-accent focus:ring-ring"
				/>
				<CalendarClock class="h-4 w-4 shrink-0" />
				Pick a time
			</label>
		</div>
		{#if startMode === 'later'}
			<div>
				<label for="campaign-starts-at" class="sr-only">Start time</label>
				<input
					id="campaign-starts-at"
					type="datetime-local"
					value={toLocalInput(startsAt)}
					onchange={(event) => {
						const value = (event.currentTarget as HTMLInputElement).value;
						if (value) onplan({ starts_at: new Date(value).toISOString() });
					}}
					class="w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground shadow-ink-inner outline-none focus:border-accent sm:w-auto sm:text-sm"
				/>
				{#if startInPast}
					<p class="mt-1 text-xs text-foreground">
						<TriangleAlert class="mr-1 inline h-3.5 w-3.5 text-warning" />That time has
						passed — the first wave would go out right away.
					</p>
				{/if}
			</div>
		{/if}
	</fieldset>

	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<div>
			<label for="campaign-wave-size" class="micro-label mb-1 block">People per wave</label>
			<input
				id="campaign-wave-size"
				type="number"
				inputmode="numeric"
				min={WAVE_SIZE_RANGE.min}
				max={WAVE_SIZE_RANGE.max}
				value={waveSize}
				disabled={!editable}
				onchange={(event) =>
					onplan({
						wave_size: clamp(
							Number((event.currentTarget as HTMLInputElement).value),
							WAVE_SIZE_RANGE.min,
							WAVE_SIZE_RANGE.max
						)
					})}
				class="w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground shadow-ink-inner outline-none focus:border-accent sm:text-sm"
			/>
		</div>
		<div>
			<label for="campaign-wave-gap" class="micro-label mb-1 block">Time between waves</label>
			<select
				id="campaign-wave-gap"
				value={waveIntervalMinutes}
				disabled={!editable}
				onchange={(event) =>
					onplan({
						wave_interval_minutes: clamp(
							Number((event.currentTarget as HTMLSelectElement).value),
							WAVE_INTERVAL_RANGE.min,
							WAVE_INTERVAL_RANGE.max
						)
					})}
				class="w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground shadow-ink-inner outline-none focus:border-accent sm:text-sm"
			>
				{#each intervalOptions as minutes (minutes)}
					<option value={minutes}>{formatInterval(minutes)}</option>
				{/each}
			</select>
		</div>
	</div>

	<div
		class="rounded-lg border border-border bg-background px-3 py-3 text-sm text-foreground"
		aria-live="polite"
	>
		{planSentence}
		<p class="mt-1 text-xs text-muted-foreground">
			From {fromName || 'DJ'} &lt;dj@build-os.com&gt;. Every email carries an unsubscribe line
			and the BuildOS PO box. People who unsubscribe or bounce before their wave are skipped.
		</p>
	</div>

	{#if !readiness.ready}
		<ul
			class="space-y-1.5 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-foreground"
		>
			{#each readiness.problems as problem (problem)}
				<li class="flex gap-2">
					<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
					{problem}
				</li>
			{/each}
		</ul>
	{/if}

	<div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex flex-col gap-0.5">
			<Button
				variant="outline"
				size="md"
				icon={Send}
				loading={testing}
				disabled={testing || !editable}
				onclick={ontest}
			>
				Send me a test
			</Button>
			{#if adminEmail}
				<span class="text-2xs text-muted-foreground">Goes to {adminEmail}</span>
			{/if}
		</div>
		<Button
			variant="primary"
			size="lg"
			icon={Send}
			loading={queueing}
			disabled={!editable || !readiness.ready || queueing}
			onclick={() => (showConfirm = true)}
		>
			Queue {readiness.includedCount}
			{readiness.includedCount === 1 ? 'email' : 'emails'}
		</Button>
	</div>
</div>

<ConfirmationModal
	bind:isOpen={showConfirm}
	title="Queue {readiness.includedCount} {readiness.includedCount === 1 ? 'email' : 'emails'}?"
	confirmText="Queue {readiness.includedCount}"
	icon="info"
	loading={queueing}
	loadingText="Queueing…"
	onconfirm={() => {
		showConfirm = false;
		onqueue();
	}}
	oncancel={() => (showConfirm = false)}
>
	{#snippet content()}
		<div class="space-y-2 text-sm text-muted-foreground">
			<p class="text-foreground">{planSentence}</p>
			<p>
				You can pause or cancel any time before a wave goes out. Replies land in
				dj@build-os.com.
			</p>
		</div>
	{/snippet}
</ConfirmationModal>
