<!-- apps/web/src/lib/components/profile/ScheduledSMSList.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import {
		MessageSquare,
		Calendar,
		Clock,
		X,
		RefreshCw,
		AlertCircle,
		CheckCircle
	} from 'lucide-svelte';
	import { format, parseISO, isFuture } from 'date-fns';
	import { formatInTimeZone } from 'date-fns-tz';
	import Button from '$lib/components/ui/Button.svelte';
	import { requireApiData, requireApiSuccess } from '$lib/utils/api-client-helpers';

	interface ScheduledSMS {
		id: string;
		user_id: string;
		calendar_event_id: string | null;
		event_title: string | null;
		event_start: string | null;
		event_end: string | null;
		scheduled_for: string;
		message_content: string;
		status: 'scheduled' | 'sent' | 'delivered' | 'failed' | 'cancelled' | 'pending';
		generated_via: 'llm' | 'template';
		llm_model: string | null;
		cancellation_reason: string | null;
		created_at: string;
		timezone: string | null;
	}

	// Props
	let {
		timezone = 'UTC'
	}: {
		timezone?: string;
	} = $props();

	// State
	let scheduledMessages = $state<ScheduledSMS[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let filterStatus = $state<'all' | 'scheduled' | 'sent' | 'cancelled'>('all');
	let cancelling = $state<Set<string>>(new Set());

	// Derived
	let filteredMessages = $derived.by(() => {
		if (filterStatus === 'all') return scheduledMessages;
		return scheduledMessages.filter((msg) => msg.status === filterStatus);
	});

	let upcomingCount = $derived(
		scheduledMessages.filter(
			(msg) => msg.status === 'scheduled' && isFuture(parseISO(msg.scheduled_for))
		).length
	);

	onMount(() => {
		loadScheduledMessages();
	});

	async function loadScheduledMessages() {
		try {
			loading = true;
			error = null;

			const response = await fetch('/api/sms/scheduled?limit=100');
			const result = await requireApiData<ScheduledSMS[] | { messages?: ScheduledSMS[] }>(
				response,
				'Failed to load scheduled messages'
			);
			scheduledMessages = Array.isArray(result) ? result : result.messages || [];
		} catch (err: any) {
			console.error('Error loading scheduled SMS:', err);
			error = err.message || 'Failed to load scheduled messages';
		} finally {
			loading = false;
		}
	}

	async function cancelMessage(messageId: string) {
		if (!confirm('Are you sure you want to cancel this scheduled SMS?')) {
			return;
		}

		try {
			cancelling = new Set([...cancelling, messageId]);

			const response = await fetch(`/api/sms/scheduled/${messageId}`, {
				method: 'DELETE'
			});
			await requireApiSuccess(response, 'Failed to cancel message');

			// Refresh the list
			await loadScheduledMessages();
		} catch (err: any) {
			console.error('Error cancelling message:', err);
			alert('Failed to cancel message: ' + err.message);
		} finally {
			cancelling.delete(messageId);
			cancelling = new Set(cancelling);
		}
	}

	function formatSendTime(isoTime: string): string {
		try {
			const date = parseISO(isoTime);
			if (timezone && timezone !== 'UTC') {
				return formatInTimeZone(date, timezone, 'MMM d, yyyy h:mm a zzz');
			}
			return format(date, 'MMM d, yyyy h:mm a');
		} catch {
			return isoTime;
		}
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'scheduled':
			case 'pending':
				return 'text-accent bg-accent/10 border border-accent/30';
			case 'sent':
			case 'delivered':
				return 'text-emerald-600 bg-emerald-500/10 border border-emerald-500/30';
			case 'failed':
				return 'text-red-600 bg-red-500/10 border border-red-500/30';
			case 'cancelled':
				return 'text-muted-foreground bg-muted border border-border';
			default:
				return 'text-muted-foreground bg-muted border border-border';
		}
	}

	function getStatusIcon(status: string) {
		switch (status) {
			case 'scheduled':
			case 'pending':
				return Clock;
			case 'sent':
			case 'delivered':
				return CheckCircle;
			case 'failed':
				return AlertCircle;
			case 'cancelled':
				return X;
			default:
				return MessageSquare;
		}
	}
</script>

<div class="space-y-4">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h3 class="text-lg font-semibold text-foreground">Scheduled Event Reminders</h3>
			<p class="text-sm text-muted-foreground mt-1">
				{#if upcomingCount > 0}
					{upcomingCount} upcoming {upcomingCount === 1 ? 'message' : 'messages'}
				{:else}
					No upcoming messages
				{/if}
			</p>
		</div>
		<Button
			variant="ghost"
			size="sm"
			onclick={loadScheduledMessages}
			disabled={loading}
			class="pressable"
		>
			<RefreshCw class="w-4 h-4 {loading ? 'animate-spin' : ''}" />
			<span class="ml-2">Refresh</span>
		</Button>
	</div>

	<!-- Filter Tabs -->
	<div class="flex gap-2 border-b border-border">
		<button
			onclick={() => (filterStatus = 'all')}
			class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {filterStatus ===
			'all'
				? 'border-accent text-accent'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
		>
			All
		</button>
		<button
			onclick={() => (filterStatus = 'scheduled')}
			class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {filterStatus ===
			'scheduled'
				? 'border-accent text-accent'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
		>
			Scheduled
		</button>
		<button
			onclick={() => (filterStatus = 'sent')}
			class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {filterStatus ===
			'sent'
				? 'border-accent text-accent'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
		>
			Sent
		</button>
		<button
			onclick={() => (filterStatus = 'cancelled')}
			class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {filterStatus ===
			'cancelled'
				? 'border-accent text-accent'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
		>
			Cancelled
		</button>
	</div>

	<!-- Loading State -->
	{#if loading}
		<div class="text-center py-12" transition:fade>
			<RefreshCw class="w-8 h-8 mx-auto text-muted-foreground animate-spin" />
			<p class="text-sm text-muted-foreground mt-2">Loading messages...</p>
		</div>
	{:else if error}
		<!-- Error State -->
		<div
			class="bg-red-500/10 border border-red-500/30 rounded-lg p-4 shadow-ink tx tx-static tx-weak"
			transition:slide
		>
			<div class="flex items-start gap-3">
				<AlertCircle class="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
				<div>
					<p class="text-sm font-medium text-foreground">Error loading messages</p>
					<p class="text-sm text-muted-foreground mt-1">{error}</p>
					<Button
						variant="ghost"
						size="sm"
						onclick={loadScheduledMessages}
						class="mt-2 pressable"
					>
						Try again
					</Button>
				</div>
			</div>
		</div>
	{:else if filteredMessages.length === 0}
		<!-- Empty State -->
		<div class="text-center py-12 bg-muted rounded-lg tx tx-bloom tx-weak" transition:fade>
			<MessageSquare class="w-12 h-12 mx-auto text-muted-foreground" />
			<p class="text-sm text-muted-foreground mt-3">
				{#if filterStatus === 'all'}
					No scheduled SMS messages yet
				{:else}
					No {filterStatus} messages
				{/if}
			</p>
			<p class="text-xs text-muted-foreground/70 mt-1">
				Messages will appear here when events are scheduled
			</p>
		</div>
	{:else}
		<!-- Messages List -->
		<div class="space-y-3">
			{#each filteredMessages as message (message.id)}
				{@const StatusIcon = getStatusIcon(message.status)}
				<div
					class="bg-card border border-border rounded-lg p-4 hover:border-accent/50 transition-colors shadow-ink tx tx-frame tx-weak"
					transition:slide
				>
					<div class="flex items-start justify-between gap-4">
						<div class="flex-1 min-w-0">
							<!-- Status Badge -->
							<div class="flex items-center gap-2 mb-2">
								<span
									class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium {getStatusColor(
										message.status
									)}"
								>
									<StatusIcon class="w-3 h-3" />
									{message.status}
								</span>
								{#if message.generated_via === 'llm'}
									<span
										class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-600 border border-purple-500/30"
									>
										AI-generated
									</span>
								{/if}
							</div>

							<!-- Event Title -->
							{#if message.event_title}
								<div
									class="flex items-center gap-2 text-sm text-foreground font-medium mb-1"
								>
									<Calendar class="w-4 h-4 text-muted-foreground" />
									<span>{message.event_title}</span>
								</div>
							{/if}

							<!-- Message Content -->
							<p
								class="text-sm text-foreground bg-muted rounded p-2.5 mt-2 font-mono border border-border"
							>
								{message.message_content}
							</p>

							<!-- Timing Info -->
							<div class="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
								<div class="flex items-center gap-1.5">
									<Clock class="w-3.5 h-3.5" />
									<span>
										{#if message.status === 'scheduled' || message.status === 'pending'}
											Sends {formatSendTime(message.scheduled_for)}
										{:else if message.status === 'sent' || message.status === 'delivered'}
											Sent {formatSendTime(message.scheduled_for)}
										{:else}
											Was scheduled for {formatSendTime(
												message.scheduled_for
											)}
										{/if}
									</span>
								</div>
								{#if message.event_start}
									<div class="flex items-center gap-1.5">
										<Calendar class="w-3.5 h-3.5" />
										<span>Event: {formatSendTime(message.event_start)}</span>
									</div>
								{/if}
							</div>

							<!-- Cancellation Reason -->
							{#if message.status === 'cancelled' && message.cancellation_reason}
								<p class="text-xs text-muted-foreground/70 mt-2 italic">
									Cancelled: {message.cancellation_reason.replace(/_/g, ' ')}
								</p>
							{/if}
						</div>

						<!-- Actions -->
						{#if message.status === 'scheduled' || message.status === 'pending'}
							<Button
								variant="ghost"
								size="sm"
								onclick={() => cancelMessage(message.id)}
								disabled={cancelling.has(message.id)}
								class="flex-shrink-0 pressable"
							>
								{#if cancelling.has(message.id)}
									<RefreshCw class="w-4 h-4 animate-spin" />
								{:else}
									<X class="w-4 h-4" />
								{/if}
								<span class="ml-1.5">Cancel</span>
							</Button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
