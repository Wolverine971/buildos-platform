<script lang="ts">
	import { Bell, Clock, AlertCircle, Inbox } from 'lucide-svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	const notifications = data.notifications ?? [];
	const errorMessage = data.error ?? null;

	const formatTime = (value?: string | null) => {
		if (!value) return 'Unknown';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Unknown';
		return date.toLocaleString();
	};

	const formatEventType = (eventType?: string | null) =>
		eventType ? eventType.replace(/\./g, ' · ') : 'Notification';

	const getTitle = (payload: Record<string, unknown> | null | undefined, eventType?: string) => {
		const title = typeof payload?.title === 'string' ? payload.title : null;
		return title || formatEventType(eventType ?? null);
	};

	const getBody = (payload: Record<string, unknown> | null | undefined) => {
		return typeof payload?.body === 'string' ? payload.body : null;
	};
</script>

<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
	<div class="flex items-center gap-3">
		<div class="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
			<Bell class="w-5 h-5 text-accent" />
		</div>
		<div>
			<h1 class="text-xl sm:text-2xl font-semibold text-foreground">Notifications</h1>
			<p class="text-sm text-muted-foreground">Recent activity and project sharing updates.</p>
		</div>
	</div>

	{#if errorMessage}
		<div class="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
			<AlertCircle class="w-4 h-4" />
			<span>{errorMessage}</span>
		</div>
	{/if}

	{#if notifications.length === 0 && !errorMessage}
		<div class="border border-dashed border-border rounded-lg bg-card/50 px-4 py-10 flex flex-col items-center text-center gap-2">
			<div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
				<Inbox class="w-5 h-5 text-muted-foreground" />
			</div>
			<p class="text-sm text-muted-foreground">No notifications yet.</p>
			<p class="text-xs text-muted-foreground">Invites and project activity will appear here.</p>
		</div>
	{:else if notifications.length > 0}
		<div class="space-y-2">
			{#each notifications as notification}
				{@const event = notification.notification_events}
				<div class="bg-card border border-border rounded-lg px-4 py-3 flex flex-col gap-2 shadow-ink">
					<div class="flex items-center justify-between gap-3">
						<div class="flex items-center gap-2 min-w-0">
							<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wide">
								{formatEventType(event?.event_type)}
							</span>
							{#if notification.status}
								<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent uppercase tracking-wide">
									{notification.status}
								</span>
							{/if}
						</div>
						<div class="flex items-center gap-1 text-[11px] text-muted-foreground">
							<Clock class="w-3.5 h-3.5" />
							<span class="tabular-nums">{formatTime(notification.created_at)}</span>
						</div>
					</div>

					<div class="space-y-1">
						<div class="text-sm font-semibold text-foreground leading-snug">
							{getTitle(notification.payload as Record<string, unknown>, event?.event_type)}
						</div>
						{#if getBody(notification.payload as Record<string, unknown>)}
							<p class="text-sm text-muted-foreground leading-snug">
								{getBody(notification.payload as Record<string, unknown>)}
							</p>
						{:else if event?.payload && typeof event.payload === 'object'}
							<p class="text-xs text-muted-foreground/80 leading-snug">
								{JSON.stringify(event.payload)}
							</p>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
