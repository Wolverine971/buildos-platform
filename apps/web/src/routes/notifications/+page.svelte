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
		Send,
		Clock,
		Eye,
		MousePointer,
		XCircle,
		CheckCircle,
		Calendar,
		ListTodo,
		AlertTriangle,
		Sparkles,
		Coffee
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
			'entity.tagged': { action: 'Tagged', past: 'A teammate tagged you' },
			'task.completed': { action: 'Task Completed', past: 'A task was marked complete' },
			'task.due_soon': { action: 'Task Due Soon', past: 'A task is due soon' },
			'comment.mentioned': { action: 'Mentioned', past: 'You were mentioned in a comment' },
			'project.activity.changed': {
				action: 'Project Activity',
				past: 'A teammate made a project update'
			},
			'project.activity.batched': {
				action: 'Team Updates',
				past: 'Multiple teammate updates were grouped'
			},
			'comment.added': { action: 'New Comment', past: 'Someone commented' },
			'document.shared': { action: 'Document Shared', past: 'A document was shared' },
			'brief.completed': { action: 'Daily Brief Ready', past: 'Your daily brief is ready' },
			'brief.failed': { action: 'Brief Failed', past: 'Daily brief generation failed' },
			'brain_dump.processed': {
				action: 'Brain Dump Processed',
				past: 'Your brain dump was processed'
			},
			'project.phase_scheduled': {
				action: 'Phase Scheduled',
				past: 'A project phase was scheduled'
			},
			'calendar.sync_failed': {
				action: 'Calendar Sync Failed',
				past: 'Calendar sync encountered an error'
			},
			'payment.warning': { action: 'Payment Warning', past: 'Billing action is required' },
			'user.trial_reminder': {
				action: 'Trial Reminder',
				past: 'Your trial period is ending'
			},
			billing_ops_anomaly: {
				action: 'Billing Ops Alert',
				past: 'A billing operations anomaly was detected'
			},
			'homework.run_completed': {
				action: 'Homework Complete',
				past: 'Your homework run finished'
			},
			'homework.run_stopped': {
				action: 'Homework Stopped',
				past: 'Your homework run stopped'
			},
			'homework.run_failed': { action: 'Homework Failed', past: 'Your homework run failed' },
			'homework.run_canceled': {
				action: 'Homework Canceled',
				past: 'Your homework run was canceled'
			},
			'homework.run_updated': {
				action: 'Homework Updated',
				past: 'Your homework run updated'
			}
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
		if (eventType.startsWith('project.activity')) return Users;
		if (eventType.startsWith('homework.')) return Sparkles;
		if (eventType.startsWith('payment.') || eventType.includes('billing')) return AlertTriangle;
		if (eventType === 'user.trial_reminder') return Clock;
		if (eventType === 'entity.tagged') return MessageSquare;
		if (eventType.includes('invite') || eventType.includes('shared')) return Share2;
		if (eventType === 'brief.completed') return Coffee;
		if (eventType === 'brief.failed') return AlertTriangle;
		if (eventType === 'brain_dump.processed') return Sparkles;
		if (eventType === 'task.due_soon') return Clock;
		if (eventType.includes('task')) return CheckCircle2;
		if (eventType.includes('comment')) return MessageSquare;
		if (eventType.includes('document')) return FileText;
		if (eventType.includes('user') || eventType.includes('member')) return Users;
		if (eventType.includes('calendar')) return Calendar;
		if (eventType.includes('phase')) return ListTodo;
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

	// Get delivery status info
	const getStatusInfo = (
		feedKind?: string | null,
		status?: string | null,
		openedAt?: string | null,
		clickedAt?: string | null,
		failedAt?: string | null,
		_lastError?: string | null
	): {
		label: string;
		color: string;
		bgColor: string;
		icon: typeof CheckCircle;
	} => {
		if (feedKind === 'activity_event') {
			return {
				label: 'Activity',
				color: 'text-muted-foreground',
				bgColor: 'bg-muted/50',
				icon: Bell
			};
		}
		if (clickedAt) {
			return {
				label: 'Clicked',
				color: 'text-green-600 dark:text-green-400',
				bgColor: 'bg-green-50 dark:bg-green-950/50',
				icon: MousePointer
			};
		}
		if (openedAt) {
			return {
				label: 'Opened',
				color: 'text-blue-600 dark:text-blue-400',
				bgColor: 'bg-blue-50 dark:bg-blue-950/50',
				icon: Eye
			};
		}
		if (failedAt || status === 'failed') {
			return {
				label: 'Failed',
				color: 'text-red-600 dark:text-red-400',
				bgColor: 'bg-red-50 dark:bg-red-950/50',
				icon: XCircle
			};
		}
		if (status === 'cancelled') {
			return {
				label: 'Cancelled',
				color: 'text-amber-700 dark:text-amber-400',
				bgColor: 'bg-amber-50 dark:bg-amber-950/50',
				icon: Clock
			};
		}
		if (status === 'delivered' || status === 'sent') {
			return {
				label: 'Delivered',
				color: 'text-muted-foreground',
				bgColor: 'bg-muted/50',
				icon: CheckCircle
			};
		}
		if (status === 'pending') {
			return {
				label: 'Pending',
				color: 'text-amber-600 dark:text-amber-400',
				bgColor: 'bg-amber-50 dark:bg-amber-950/50',
				icon: Clock
			};
		}
		return {
			label: status || 'Unknown',
			color: 'text-muted-foreground',
			bgColor: 'bg-muted/50',
			icon: Bell
		};
	};

	// Extract rich event-specific details
	const extractEventDetails = (
		eventType?: string | null,
		eventPayload?: Record<string, unknown> | null
	): { stats: { label: string; value: string | number }[]; summary: string | null } => {
		const ep = eventPayload || {};
		const stats: { label: string; value: string | number }[] = [];
		let summary: string | null = null;

		if (eventType === 'brief.completed') {
			// Daily brief completion - show task breakdown
			const todayTasks = ep.todays_task_count as number | undefined;
			const overdueTasks = ep.overdue_task_count as number | undefined;
			const upcomingTasks = ep.upcoming_task_count as number | undefined;
			const next7Days = ep.next_seven_days_task_count as number | undefined;
			const completed = ep.recently_completed_count as number | undefined;
			const blocked = ep.blocked_task_count as number | undefined;
			const projects = ep.project_count as number | undefined;

			if (todayTasks !== undefined) stats.push({ label: 'Today', value: todayTasks });
			if (overdueTasks && overdueTasks > 0)
				stats.push({ label: 'Overdue', value: overdueTasks });
			if (upcomingTasks !== undefined)
				stats.push({ label: 'Upcoming', value: upcomingTasks });
			if (next7Days !== undefined) stats.push({ label: 'Next 7 days', value: next7Days });
			if (completed && completed > 0)
				stats.push({ label: 'Recently done', value: completed });
			if (blocked && blocked > 0) stats.push({ label: 'Blocked', value: blocked });
			if (projects !== undefined) stats.push({ label: 'Projects', value: projects });

			if (todayTasks !== undefined) {
				summary =
					todayTasks > 0
						? `You have ${todayTasks} task${todayTasks !== 1 ? 's' : ''} for today`
						: 'No tasks scheduled for today';
			}
		} else if (eventType === 'brief.failed') {
			const errorMsg = ep.error_message as string | undefined;
			const retryCount = ep.retry_count as number | undefined;
			if (retryCount !== undefined) stats.push({ label: 'Retries', value: retryCount });
			if (errorMsg) summary = errorMsg;
		} else if (eventType === 'brain_dump.processed') {
			const tasksCreated = ep.tasks_created as number | undefined;
			const processingTime = ep.processing_time_ms as number | undefined;
			const projectName = ep.project_name as string | undefined;

			if (tasksCreated !== undefined)
				stats.push({ label: 'Tasks created', value: tasksCreated });
			if (processingTime !== undefined) {
				const seconds = (processingTime / 1000).toFixed(1);
				stats.push({ label: 'Processing time', value: `${seconds}s` });
			}
			if (projectName) {
				summary = `Added to project: ${projectName}`;
			}
		} else if (eventType === 'task.due_soon') {
			const taskTitle = ep.task_title as string | undefined;
			const projectName = ep.project_name as string | undefined;
			const hoursUntil = ep.hours_until_due as number | undefined;

			if (hoursUntil !== undefined) {
				stats.push({
					label: 'Due in',
					value: hoursUntil < 1 ? 'Less than 1 hour' : `${Math.round(hoursUntil)} hours`
				});
			}
			if (taskTitle) summary = taskTitle;
			if (projectName && taskTitle !== projectName) {
				stats.push({ label: 'Project', value: projectName });
			}
		} else if (eventType === 'project.activity.changed') {
			const actorName = ep.actor_name as string | undefined;
			const actionType = ep.action_type as string | undefined;
			const projectName = ep.project_name as string | undefined;

			if (actorName) stats.push({ label: 'Actor', value: actorName });
			if (actionType) {
				const [entityRaw = 'project', actionRaw = 'updated'] = actionType.split('.');
				stats.push({
					label: 'Action',
					value: `${entityRaw.replace(/_/g, ' ')} ${actionRaw.replace(/_/g, ' ')}`
				});
				if (actorName) {
					summary = `${actorName} ${actionRaw.replace(/_/g, ' ')} ${entityRaw.replace(/_/g, ' ')}`;
				}
			}
			if (projectName) stats.push({ label: 'Project', value: projectName });
		} else if (eventType === 'project.activity.batched') {
			const eventCount = ep.event_count as number | undefined;
			const actionCounts = ep.action_counts as Record<string, number> | undefined;
			const actorCounts = ep.actor_counts as Record<string, number> | undefined;
			const projectName = ep.project_name as string | undefined;

			if (eventCount !== undefined) stats.push({ label: 'Updates', value: eventCount });
			if (actorCounts) {
				stats.push({ label: 'Teammates', value: Object.keys(actorCounts).length });
			}
			if (actionCounts) {
				const topAction = Object.entries(actionCounts)
					.filter(([, count]) => Number.isFinite(count))
					.sort((a, b) => b[1] - a[1])[0];
				if (topAction) {
					const [actionKey, count] = topAction;
					const [entityRaw = 'project', actionRaw = 'updated'] = actionKey.split('.');
					stats.push({
						label: 'Top action',
						value: `${entityRaw.replace(/_/g, ' ')} ${actionRaw.replace(/_/g, ' ')} (${count})`
					});
				}
			}
			if (eventCount !== undefined) {
				summary = `${eventCount} teammate update${eventCount === 1 ? '' : 's'}${projectName ? ` in ${projectName}` : ''}`;
			}
		} else if (eventType === 'project.phase_scheduled') {
			const phaseName = ep.phase_name as string | undefined;
			const taskCount = ep.task_count as number | undefined;
			const scheduledDate = ep.scheduled_date as string | undefined;

			if (phaseName) stats.push({ label: 'Phase', value: phaseName });
			if (taskCount !== undefined) stats.push({ label: 'Tasks', value: taskCount });
			if (scheduledDate) {
				const date = new Date(scheduledDate);
				stats.push({
					label: 'Date',
					value: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
				});
			}
		}

		return { stats, summary };
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
		if (typeof ep.actor_name === 'string') details.push(`by ${ep.actor_name}`);
		if (typeof ep.project_name === 'string' && title !== ep.project_name)
			details.push(ep.project_name);
		if (eventType === 'project.activity.batched' && typeof ep.event_count === 'number')
			details.push(`${ep.event_count} updates`);
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
							{@const statusInfo = getStatusInfo(
								notification.feed_kind,
								notification.status,
								notification.opened_at,
								notification.clicked_at,
								notification.failed_at,
								notification.last_error
							)}
							{@const StatusIcon = statusInfo.icon}
							{@const eventDetails = extractEventDetails(
								event?.event_type,
								event?.payload as Record<string, unknown>
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
												{#if eventDetails.summary}
													<p
														class="text-sm text-muted-foreground mt-0.5 leading-snug"
													>
														{eventDetails.summary}
													</p>
												{:else if content.body}
													<p
														class="text-sm text-muted-foreground mt-0.5 leading-snug line-clamp-2"
													>
														{content.body}
													</p>
												{/if}
											</div>
											<div class="shrink-0 flex flex-col items-end gap-1">
												<span
													class="text-xs text-muted-foreground tabular-nums"
												>
													{formatRelativeTime(notification.created_at)}
												</span>
												<!-- Status badge -->
												<span
													class="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded {statusInfo.bgColor} {statusInfo.color}"
												>
													<StatusIcon class="w-2.5 h-2.5" />
													{statusInfo.label}
												</span>
											</div>
										</div>

										<!-- Event-specific stats -->
										{#if eventDetails.stats.length > 0}
											<div class="flex flex-wrap gap-x-3 gap-y-1 mt-2">
												{#each eventDetails.stats as stat}
													<span
														class="inline-flex items-center gap-1 text-xs"
													>
														<span class="text-muted-foreground"
															>{stat.label}:</span
														>
														<span class="font-medium text-foreground"
															>{stat.value}</span
														>
													</span>
												{/each}
											</div>
										{/if}

										<!-- Error message for failed notifications -->
										{#if notification.feed_kind !== 'activity_event' && notification.last_error && (notification.status === 'failed' || notification.status === 'cancelled' || notification.failed_at)}
											<div
												class="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2 py-1.5 rounded border border-red-200 dark:border-red-900"
											>
												{notification.last_error}
											</div>
										{/if}

										<!-- Meta row -->
										<div class="flex items-center gap-2 mt-2">
											<span
												class="inline-flex items-center gap-1 text-[11px] text-muted-foreground/80"
											>
												<ChannelIcon class="w-3 h-3" />
												<span class="capitalize">
													{notification.feed_kind === 'activity_event'
														? 'activity event'
														: notification.channel?.replace('_', ' ') ||
															'in app'}
												</span>
											</span>
											{#if notification.feed_kind !== 'activity_event' && notification.attempts && notification.attempts > 1}
												<span class="text-muted-foreground/40">·</span>
												<span class="text-[11px] text-muted-foreground/70">
													Attempt {notification.attempts}/{notification.max_attempts ||
														3}
												</span>
											{/if}
											{#if content.details.length > 0}
												<span class="text-muted-foreground/40">·</span>
												<span
													class="text-[11px] text-muted-foreground/70 truncate"
												>
													{content.details.join(' · ')}
												</span>
											{/if}
											{#if notification.feed_kind !== 'activity_event' && notification.opened_at}
												<span class="text-muted-foreground/40">·</span>
												<span class="text-[11px] text-muted-foreground/70">
													Opened {formatRelativeTime(
														notification.opened_at
													)}
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
