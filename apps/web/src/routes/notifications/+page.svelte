<!-- apps/web/src/routes/notifications/+page.svelte -->
<script lang="ts">
	import {
		Bell,
		AlertCircle,
		Inbox,
		Users,
		FileText,
		CheckCircle2,
		Share2,
		MessageSquare,
		Mail,
		Smartphone,
		Monitor,
		Send
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const notifications = $derived(data.notifications ?? []);
	const errorMessage = $derived(data.error ?? null);

	// Relative time formatting
	const formatRelativeTime = (value?: string | null): string => {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';

		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;

		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	};

	// Get human-readable event description
	const getEventDescription = (eventType?: string | null): { action: string; past: string } => {
		if (!eventType) return { action: 'Activity', past: 'Activity occurred' };
		const descriptions: Record<string, { action: string; past: string }> = {
			'project.invite.sent': {
				action: 'Project Invite',
				past: 'You were invited to a project'
			},
			'project.invite.accepted': {
				action: 'Invite Accepted',
				past: 'Someone accepted your invite'
			},
			'project.shared': { action: 'Project Shared', past: 'A project was shared with you' },
			'task.assigned': { action: 'Task Assigned', past: 'A task was assigned to you' },
			'task.completed': { action: 'Task Completed', past: 'A task was marked complete' },
			'comment.added': { action: 'New Comment', past: 'Someone commented' },
			'document.shared': { action: 'Document Shared', past: 'A document was shared' }
		};
		if (descriptions[eventType]) return descriptions[eventType];

		// Fallback: convert event_type to readable format
		const parts = eventType.split('.');
		const action = parts
			.map((p) => p.charAt(0).toUpperCase() + p.slice(1).replace(/_/g, ' '))
			.join(' ');
		return { action, past: action };
	};

	// Get icon for event type
	const getEventIcon = (eventType?: string | null) => {
		if (!eventType) return Bell;
		if (eventType.includes('invite') || eventType.includes('shared')) return Share2;
		if (eventType.includes('task')) return CheckCircle2;
		if (eventType.includes('comment')) return MessageSquare;
		if (eventType.includes('document')) return FileText;
		if (eventType.includes('user') || eventType.includes('member')) return Users;
		return Bell;
	};

	// Get channel icon
	const getChannelIcon = (channel?: string | null) => {
		if (!channel) return Monitor;
		if (channel === 'email') return Mail;
		if (channel === 'sms') return Smartphone;
		if (channel === 'push') return Send;
		return Monitor; // in_app
	};

	// Extract meaningful content from payloads
	const extractContent = (
		deliveryPayload: Record<string, unknown> | null | undefined,
		eventPayload: Record<string, unknown> | null | undefined,
		eventType?: string | null
	): { title: string; body: string | null; details: string[] } => {
		const dp = deliveryPayload || {};
		const ep = eventPayload || {};
		const details: string[] = [];

		// Try to get title from delivery payload first, then event payload
		let title = '';
		if (typeof dp.title === 'string' && dp.title) {
			title = dp.title;
		} else if (typeof ep.project_name === 'string') {
			title = ep.project_name;
		} else if (typeof ep.task_name === 'string') {
			title = ep.task_name;
		} else if (typeof ep.name === 'string') {
			title = ep.name;
		} else {
			title = getEventDescription(eventType).action;
		}

		// Try to get body
		let body: string | null = null;
		if (typeof dp.body === 'string' && dp.body) {
			body = dp.body;
		} else if (typeof ep.description === 'string' && ep.description) {
			body = ep.description;
		} else if (typeof ep.message === 'string' && ep.message) {
			body = ep.message;
		}

		// If no body, create one from available data
		if (!body) {
			body = getEventDescription(eventType).past;
		}

		// Extract additional details
		if (typeof ep.inviter_name === 'string') details.push(`from ${ep.inviter_name}`);
		if (typeof ep.project_name === 'string' && title !== ep.project_name)
			details.push(ep.project_name);
		if (typeof ep.task_name === 'string' && title !== ep.task_name) details.push(ep.task_name);

		return { title, body, details };
	};

	// Group notifications by date
	const groupedNotifications = $derived.by(() => {
		const groups: { label: string; items: typeof notifications }[] = [];
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);
		const weekAgo = new Date(today);
		weekAgo.setDate(weekAgo.getDate() - 7);

		let todayItems: typeof notifications = [];
		let yesterdayItems: typeof notifications = [];
		let thisWeekItems: typeof notifications = [];
		let olderItems: typeof notifications = [];

		for (const n of notifications) {
			const date = new Date(n.created_at || '');
			date.setHours(0, 0, 0, 0);

			if (date.getTime() >= today.getTime()) {
				todayItems.push(n);
			} else if (date.getTime() >= yesterday.getTime()) {
				yesterdayItems.push(n);
			} else if (date.getTime() >= weekAgo.getTime()) {
				thisWeekItems.push(n);
			} else {
				olderItems.push(n);
			}
		}

		if (todayItems.length) groups.push({ label: 'Today', items: todayItems });
		if (yesterdayItems.length) groups.push({ label: 'Yesterday', items: yesterdayItems });
		if (thisWeekItems.length) groups.push({ label: 'This Week', items: thisWeekItems });
		if (olderItems.length) groups.push({ label: 'Earlier', items: olderItems });

		return groups;
	});
</script>

<div class="min-h-screen bg-background rounded-md sm:px-6 py-6">
	<!-- Header -->
	<div class="flex items-center gap-3 pb-2 border-b border-border">
		<div class="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
			<Bell class="w-5 h-5 text-accent" />
		</div>
		<div>
			<h1 class="text-xl font-semibold text-foreground">Notifications</h1>
			<p class="text-sm text-muted-foreground">Activity and updates</p>
		</div>
	</div>

	<!-- Error State -->
	{#if errorMessage}
		<div
			class="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3"
		>
			<AlertCircle class="w-4 h-4 shrink-0" />
			<span>{errorMessage}</span>
		</div>
	{/if}

	<!-- Empty State -->
	{#if notifications.length === 0 && !errorMessage}
		<div
			class="rounded-xl bg-card border border-border px-6 py-12 flex flex-col items-center text-center gap-3"
		>
			<div class="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
				<Inbox class="w-7 h-7 text-muted-foreground" />
			</div>
			<div>
				<p class="text-base font-medium text-foreground">No notifications yet</p>
				<p class="text-sm text-muted-foreground mt-1">
					Invites, mentions, and project activity will appear here
				</p>
			</div>
		</div>

		<!-- Notification List -->
	{:else if groupedNotifications.length > 0}
		<div class="space-y-6">
			{#each groupedNotifications as group}
				<div class="space-y-2">
					<!-- Date Group Header -->
					<h2
						class="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1"
					>
						{group.label}
					</h2>

					<!-- Notification Cards -->
					<div
						class="bg-card rounded-xl border border-border overflow-hidden divide-y divide-border"
					>
						{#each group.items as notification (notification.id)}
							{@const event = notification.notification_events}
							{@const EventIcon = getEventIcon(event?.event_type)}
							{@const ChannelIcon = getChannelIcon(notification.channel)}
							{@const content = extractContent(
								notification.payload as Record<string, unknown>,
								event?.payload as Record<string, unknown>,
								event?.event_type
							)}

							<div class="px-4 py-3 hover:bg-muted/30 transition-colors">
								<div class="flex gap-3">
									<!-- Icon -->
									<div class="shrink-0 pt-0.5">
										<div
											class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center"
										>
											<EventIcon class="w-4 h-4 text-accent" />
										</div>
									</div>

									<!-- Content -->
									<div class="flex-1 min-w-0">
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<p
													class="text-sm font-medium text-foreground leading-snug"
												>
													{content.title}
												</p>
												{#if content.body}
													<p
														class="text-sm text-muted-foreground mt-0.5 leading-snug line-clamp-2"
													>
														{content.body}
													</p>
												{/if}
											</div>
											<span
												class="text-xs text-muted-foreground tabular-nums shrink-0 pt-0.5"
											>
												{formatRelativeTime(notification.created_at)}
											</span>
										</div>

										<!-- Meta row -->
										<div class="flex items-center gap-2 mt-1.5">
											<span
												class="inline-flex items-center gap-1 text-[11px] text-muted-foreground/80"
											>
												<ChannelIcon class="w-3 h-3" />
												<span class="capitalize"
													>{notification.channel?.replace('_', ' ') ||
														'in app'}</span
												>
											</span>
											{#if content.details.length > 0}
												<span class="text-muted-foreground/40">·</span>
												<span
													class="text-[11px] text-muted-foreground/70 truncate"
												>
													{content.details.join(' · ')}
												</span>
											{/if}
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
