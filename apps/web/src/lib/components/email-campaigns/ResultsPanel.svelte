<!-- apps/web/src/lib/components/email-campaigns/ResultsPanel.svelte -->
<script lang="ts">
	import {
		Ban,
		CircleX,
		Eye,
		MailX,
		MousePointerClick,
		Pause,
		Play,
		Reply,
		RotateCcw,
		Send,
		Clock
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import type { CampaignDetail, CampaignRecipientView } from '$lib/email-campaigns/types';
	import {
		displayName,
		followUpCount,
		formatDateTime,
		formatRelative
	} from '$lib/email-campaigns/ui-helpers';

	type Filter =
		| 'all'
		| 'waiting'
		| 'sent'
		| 'opened'
		| 'clicked'
		| 'replied'
		| 'unsubscribed'
		| 'problems';

	let {
		detail,
		busyAction = null,
		retryingIds = new Set<string>(),
		onpause,
		onresume,
		oncancel,
		onretry,
		onfollowup,
		onopen
	}: {
		detail: CampaignDetail;
		busyAction?: string | null;
		retryingIds?: Set<string>;
		onpause: () => void;
		onresume: () => void;
		oncancel: () => void;
		onretry: (recipient: CampaignRecipientView) => void;
		onfollowup: () => void;
		onopen: (recipientId: string) => void;
	} = $props();

	let filter = $state<Filter>('all');
	let showCancel = $state(false);

	const status = $derived(detail.campaign.status);
	const counts = $derived(detail.counts);
	const sendable = $derived(
		detail.recipients.filter((recipient) => recipient.status !== 'draft')
	);
	const waiting = $derived(counts.queued + counts.sending);
	const delivered = $derived(counts.sent);
	const progressBase = $derived(Math.max(1, counts.included || sendable.length));
	const nextWaveAt = $derived(
		detail.recipients
			.filter((recipient) => recipient.status === 'queued' && recipient.scheduled_for)
			.map((recipient) => recipient.scheduled_for as string)
			.sort()[0] ?? null
	);
	const followUps = $derived(followUpCount(detail.recipients));

	function rate(part: number): string {
		if (delivered === 0) return '';
		return `${Math.round((part / delivered) * 100)}%`;
	}

	const tiles = $derived([
		{ key: 'sent', label: 'Sent', value: counts.sent, icon: Send, hint: '' },
		{
			key: 'opened',
			label: 'Opened',
			value: counts.opened,
			icon: Eye,
			hint: rate(counts.opened)
		},
		{
			key: 'clicked',
			label: 'Clicked',
			value: counts.clicked,
			icon: MousePointerClick,
			hint: rate(counts.clicked)
		},
		{
			key: 'replied',
			label: 'Replied',
			value: counts.replied,
			icon: Reply,
			hint: rate(counts.replied)
		},
		{
			key: 'unsubscribed',
			label: 'Unsubscribed',
			value: counts.unsubscribed,
			icon: MailX,
			hint: ''
		},
		{
			key: 'problems',
			label: 'Failed · bounced',
			value: counts.failed + counts.bounced,
			icon: CircleX,
			hint: counts.skipped ? `${counts.skipped} skipped` : ''
		}
	] as const);

	function matches(recipient: CampaignRecipientView, key: Filter): boolean {
		switch (key) {
			case 'all':
				return recipient.status !== 'draft';
			case 'waiting':
				return recipient.status === 'queued' || recipient.status === 'sending';
			case 'sent':
				return recipient.status === 'sent';
			case 'opened':
				return Boolean(recipient.opened_at);
			case 'clicked':
				return Boolean(recipient.first_clicked_at);
			case 'replied':
				return Boolean(recipient.replied_at);
			case 'unsubscribed':
				return Boolean(recipient.unsubscribed_at);
			case 'problems':
				return (
					recipient.status === 'failed' ||
					recipient.status === 'skipped' ||
					recipient.status === 'canceled' ||
					Boolean(recipient.bounced_at)
				);
		}
	}

	const FILTERS: { key: Filter; label: string }[] = [
		{ key: 'all', label: 'Everyone' },
		{ key: 'waiting', label: 'Waiting' },
		{ key: 'sent', label: 'Sent' },
		{ key: 'opened', label: 'Opened' },
		{ key: 'clicked', label: 'Clicked' },
		{ key: 'replied', label: 'Replied' },
		{ key: 'unsubscribed', label: 'Unsubscribed' },
		{ key: 'problems', label: 'Problems' }
	];

	const visible = $derived(sendable.filter((recipient) => matches(recipient, filter)));

	const STATUS_STYLES: Record<string, string> = {
		queued: 'border-info/30 bg-info/10 text-info',
		sending: 'border-accent/30 bg-accent/10 text-accent',
		sent: 'border-success/30 bg-success/10 text-success',
		failed: 'border-destructive/30 bg-destructive/10 text-destructive',
		skipped: 'border-warning/40 bg-warning/10 text-foreground',
		canceled: 'border-border bg-muted text-muted-foreground'
	};

	function statusLabel(recipient: CampaignRecipientView): string {
		if (recipient.bounced_at) return 'bounced';
		if (recipient.status === 'queued' && recipient.scheduled_for) {
			return `waiting · ${formatDateTime(recipient.scheduled_for)}`;
		}
		return recipient.status;
	}
</script>

<div class="space-y-5">
	<div class="space-y-2">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<p class="text-sm text-foreground">
				<span class="stamp text-lg font-semibold">{delivered}</span>
				<span class="text-muted-foreground"
					>of {counts.included || sendable.length} sent</span
				>
				{#if waiting > 0}
					<span class="text-muted-foreground">· {waiting} waiting</span>
				{/if}
			</p>
			{#if nextWaveAt && (status === 'sending' || status === 'paused')}
				<p class="flex items-center gap-1.5 text-xs text-muted-foreground">
					<Clock class="h-3.5 w-3.5" />
					{status === 'paused' ? 'Paused — next wave was due' : 'Next wave'}
					{formatDateTime(nextWaveAt)}
				</p>
			{/if}
		</div>
		<div
			class="h-2 w-full overflow-hidden rounded-full bg-muted"
			role="progressbar"
			aria-label="Emails sent"
			aria-valuemin={0}
			aria-valuemax={progressBase}
			aria-valuenow={delivered}
		>
			<div
				class="h-full rounded-full transition-[width] duration-500 {status === 'paused'
					? 'bg-warning'
					: status === 'canceled'
						? 'bg-muted-foreground'
						: 'bg-success'}"
				style="width: {Math.min(100, (delivered / progressBase) * 100)}%"
			></div>
		</div>
	</div>

	<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
		{#each tiles as tile (tile.key)}
			{@const Icon = tile.icon}
			<button
				type="button"
				onclick={() => (filter = tile.key as Filter)}
				aria-pressed={filter === tile.key}
				class="flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pressable {filter ===
				tile.key
					? 'border-accent bg-accent/5'
					: 'border-border bg-background hover:border-accent/50'}"
			>
				<span class="flex items-center gap-1.5 text-xs text-muted-foreground">
					<Icon class="h-3.5 w-3.5" />
					{tile.label}
				</span>
				<span class="stamp text-xl font-semibold text-foreground">{tile.value}</span>
				{#if tile.hint}
					<span class="text-2xs text-muted-foreground">{tile.hint}</span>
				{/if}
			</button>
		{/each}
	</div>
	<p class="text-2xs text-muted-foreground">
		Opens are approximate (some mail apps load images automatically). Replies are checked in
		dj@build-os.com every 10 minutes.
	</p>

	<div class="flex flex-wrap items-center gap-2">
		{#if status === 'sending'}
			<Button
				variant="outline"
				size="sm"
				icon={Pause}
				loading={busyAction === 'pause'}
				disabled={busyAction !== null}
				onclick={onpause}
			>
				Pause
			</Button>
		{/if}
		{#if status === 'paused'}
			<Button
				variant="primary"
				size="sm"
				icon={Play}
				loading={busyAction === 'resume'}
				disabled={busyAction !== null}
				onclick={onresume}
			>
				Resume
			</Button>
		{/if}
		{#if (status === 'sending' || status === 'paused') && waiting > 0}
			<Button
				variant="ghost"
				size="sm"
				icon={Ban}
				class="text-destructive"
				disabled={busyAction !== null}
				onclick={() => (showCancel = true)}
			>
				Cancel the rest
			</Button>
		{/if}
		{#if followUps > 0}
			<Button
				variant="outline"
				size="sm"
				icon={Reply}
				loading={busyAction === 'follow-up'}
				disabled={busyAction !== null}
				onclick={onfollowup}
				class="sm:ml-auto"
			>
				Follow up with {followUps} who didn't reply
			</Button>
		{/if}
	</div>

	<div
		class="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
		role="tablist"
		aria-label="Filter results"
	>
		{#each FILTERS as option (option.key)}
			{@const count = sendable.filter((recipient) => matches(recipient, option.key)).length}
			{#if option.key === 'all' || count > 0 || filter === option.key}
				<button
					type="button"
					role="tab"
					aria-selected={filter === option.key}
					onclick={() => (filter = option.key)}
					class="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {filter ===
					option.key
						? 'border-accent bg-accent/10 text-accent'
						: 'border-border bg-background text-muted-foreground hover:text-foreground'}"
				>
					{option.label}
					<span class="stamp">{count}</span>
				</button>
			{/if}
		{/each}
	</div>

	{#if visible.length === 0}
		<p
			class="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
		>
			No one here yet.
		</p>
	{:else}
		<ul
			class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background"
		>
			{#each visible as recipient (recipient.id)}
				<li class="flex items-stretch">
					<button
						type="button"
						onclick={() => onopen(recipient.id)}
						class="flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-3"
					>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-foreground">
								{displayName(recipient)}
							</p>
							{#if recipient.name}
								<p class="truncate text-xs text-muted-foreground">
									{recipient.email}
								</p>
							{/if}
						</div>
						<div class="flex flex-wrap items-center gap-1.5 sm:justify-end">
							<span
								class="rounded-full border px-2 py-0.5 text-2xs font-medium {STATUS_STYLES[
									recipient.bounced_at ? 'failed' : recipient.status
								] ?? 'border-border bg-muted text-muted-foreground'}"
							>
								{statusLabel(recipient)}
							</span>
							{#if recipient.opened_at}
								<span
									class="inline-flex items-center gap-1 text-2xs text-muted-foreground"
									title="Opened {formatDateTime(recipient.opened_at)}"
								>
									<Eye class="h-3 w-3" /><span class="sr-only">Opened</span>
								</span>
							{/if}
							{#if recipient.first_clicked_at}
								<span
									class="inline-flex items-center gap-1 text-2xs text-info"
									title="Clicked {formatDateTime(recipient.first_clicked_at)}"
								>
									<MousePointerClick class="h-3 w-3" /><span class="sr-only"
										>Clicked</span
									>
								</span>
							{/if}
							{#if recipient.replied_at}
								<span
									class="inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-2xs font-medium text-success"
									title="Replied {formatDateTime(recipient.replied_at)}"
								>
									<Reply class="h-3 w-3" /> replied
								</span>
							{/if}
							{#if recipient.unsubscribed_at}
								<span
									class="inline-flex items-center gap-1 text-2xs text-muted-foreground"
									title="Unsubscribed {formatDateTime(recipient.unsubscribed_at)}"
								>
									<MailX class="h-3 w-3" /> unsubscribed
								</span>
							{/if}
							{#if recipient.sent_at}
								<span class="stamp text-2xs text-muted-foreground">
									{formatRelative(recipient.sent_at)}
								</span>
							{/if}
						</div>
					</button>
					{#if recipient.status === 'failed'}
						<div class="flex shrink-0 items-center pr-2">
							<Button
								variant="ghost"
								size="sm"
								icon={RotateCcw}
								loading={retryingIds.has(recipient.id)}
								disabled={retryingIds.has(recipient.id)}
								onclick={() => onretry(recipient)}
							>
								Retry
							</Button>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<ConfirmationModal
	bind:isOpen={showCancel}
	title="Cancel the {waiting} emails still waiting?"
	confirmText="Cancel them"
	confirmVariant="danger"
	icon="danger"
	loading={busyAction === 'cancel'}
	loadingText="Canceling…"
	onconfirm={() => {
		showCancel = false;
		oncancel();
	}}
	oncancel={() => (showCancel = false)}
>
	{#snippet content()}
		<p class="text-sm text-muted-foreground">
			Already-sent emails stay sent. The people still waiting won't get this email. This can't
			be undone, but you can start a follow-up campaign later.
		</p>
	{/snippet}
</ConfirmationModal>
