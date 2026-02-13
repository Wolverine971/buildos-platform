<!-- apps/web/src/lib/components/admin/UserNotificationContext.svelte -->
<script lang="ts">
	import {
		ChevronDown,
		ChevronUp,
		Bell,
		Mail,
		MessageSquare,
		Smartphone,
		CheckCircle,
		XCircle,
		Clock
	} from 'lucide-svelte';
	import type { UserNotificationContext } from '../../../routes/api/admin/users/[id]/notification-context/+server';

	interface Props {
		context: UserNotificationContext;
		expanded?: boolean;
	}

	let { context, expanded = $bindable(true) }: Props = $props();

	function formatDate(dateString: string | null): string {
		if (!dateString) return 'Never';
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function getChannelIcon(channel: string) {
		switch (channel) {
			case 'push':
				return Bell;
			case 'email':
				return Mail;
			case 'sms':
				return MessageSquare;
			case 'in_app':
				return Smartphone;
			default:
				return Bell;
		}
	}

	function getStatusColor(status: string): string {
		switch (status.toLowerCase()) {
			case 'delivered':
			case 'sent':
				return 'text-green-600 dark:text-green-400';
			case 'failed':
			case 'bounced':
				return 'text-red-600 dark:text-red-400';
			case 'pending':
				return 'text-yellow-600 dark:text-yellow-400';
			case 'opened':
			case 'clicked':
				return 'text-blue-600 dark:text-blue-400';
			default:
				return 'text-muted-foreground';
		}
	}
</script>

<div class="border border-border rounded-lg overflow-hidden">
	<!-- Header -->
	<button
		type="button"
		onclick={() => (expanded = !expanded)}
		class="w-full px-4 py-3 bg-muted flex items-center justify-between hover:bg-muted transition-colors"
	>
		<div class="flex items-center space-x-2">
			<Bell class="w-5 h-5 text-blue-600 dark:text-blue-400" />
			<h3 class="text-sm font-semibold text-foreground">User Notification Context</h3>
		</div>
		{#if expanded}
			<ChevronUp class="w-5 h-5 text-muted-foreground" />
		{:else}
			<ChevronDown class="w-5 h-5 text-muted-foreground" />
		{/if}
	</button>

	<!-- Content -->
	{#if expanded}
		<div class="p-4 space-y-4 bg-card">
			<!-- Basic Info -->
			<div>
				<h4 class="text-xs font-semibold text-foreground uppercase mb-2">
					Basic Information
				</h4>
				<div class="grid grid-cols-2 gap-2 text-sm">
					<div>
						<span class="text-muted-foreground">Name:</span>
						<span class="ml-1 text-foreground"
							>{context.basic.name || 'Not provided'}</span
						>
					</div>
					<div>
						<span class="text-muted-foreground">Email:</span>
						<span class="ml-1 text-foreground">{context.basic.email}</span>
					</div>
					<div>
						<span class="text-muted-foreground">Member since:</span>
						<span class="ml-1 text-foreground"
							>{formatDate(context.basic.created_at)}</span
						>
					</div>
					<div>
						<span class="text-muted-foreground">Last active:</span>
						<span class="ml-1 text-foreground"
							>{formatDate(context.basic.last_visit)}</span
						>
					</div>
				</div>
			</div>

			<!-- Channel Capabilities -->
			<div>
				<h4 class="text-xs font-semibold text-foreground uppercase mb-2">
					Channel Availability
				</h4>
				<div class="grid grid-cols-2 gap-2">
					{#each context.channels as capability}
						{@const Icon = getChannelIcon(capability.channel)}
						<div class="flex items-center space-x-2">
							{#if capability.available}
								<CheckCircle class="w-4 h-4 text-green-500" />
							{:else}
								<XCircle class="w-4 h-4 text-muted-foreground" />
							{/if}
							<Icon
								class="w-4 h-4 {capability.available
									? 'text-blue-600'
									: 'text-muted-foreground'}"
							/>
							<div class="flex-1">
								<div class="text-sm font-medium text-foreground capitalize">
									{capability.channel}
								</div>
								<div class="text-xs text-muted-foreground">
									{capability.details}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Notification Preferences -->
			{#if context.preferences.length > 0}
				<div>
					<h4 class="text-xs font-semibold text-foreground uppercase mb-2">
						Notification Preferences ({context.preferences.length} event types)
					</h4>
					<div class="overflow-x-auto">
						<table class="min-w-full text-xs">
							<thead class="bg-muted">
								<tr>
									<th class="px-2 py-1 text-left font-medium text-foreground"
										>Event Type</th
									>
									<th class="px-2 py-1 text-center font-medium text-foreground"
										>Push</th
									>
									<th class="px-2 py-1 text-center font-medium text-foreground"
										>Email</th
									>
									<th class="px-2 py-1 text-center font-medium text-foreground"
										>SMS</th
									>
									<th class="px-2 py-1 text-center font-medium text-foreground"
										>In-App</th
									>
									<th class="px-2 py-1 text-center font-medium text-foreground"
										>Subscribed</th
									>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200 dark:divide-gray-700">
								{#each context.preferences as pref}
									<tr class="hover:bg-muted">
										<td class="px-2 py-1 text-foreground">{pref.event_type}</td>
										<td class="px-2 py-1 text-center">
											{#if pref.push_enabled}
												<CheckCircle
													class="w-4 h-4 text-green-500 mx-auto"
												/>
											{:else}
												<XCircle
													class="w-4 h-4 text-muted-foreground mx-auto"
												/>
											{/if}
										</td>
										<td class="px-2 py-1 text-center">
											{#if pref.email_enabled}
												<CheckCircle
													class="w-4 h-4 text-green-500 mx-auto"
												/>
											{:else}
												<XCircle
													class="w-4 h-4 text-muted-foreground mx-auto"
												/>
											{/if}
										</td>
										<td class="px-2 py-1 text-center">
											{#if pref.sms_enabled}
												<CheckCircle
													class="w-4 h-4 text-green-500 mx-auto"
												/>
											{:else}
												<XCircle
													class="w-4 h-4 text-muted-foreground mx-auto"
												/>
											{/if}
										</td>
										<td class="px-2 py-1 text-center">
											{#if pref.in_app_enabled}
												<CheckCircle
													class="w-4 h-4 text-green-500 mx-auto"
												/>
											{:else}
												<XCircle
													class="w-4 h-4 text-muted-foreground mx-auto"
												/>
											{/if}
										</td>
										<td class="px-2 py-1 text-center">
											{#if pref.is_subscribed}
												<span
													class="text-green-600 dark:text-green-400 font-medium"
													>Yes</span
												>
											{:else}
												<span class="text-muted-foreground">No</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}

			<!-- Activity Summary -->
			<div>
				<h4 class="text-xs font-semibold text-foreground uppercase mb-2">
					Activity Summary
				</h4>
				<div class="grid grid-cols-3 gap-2 text-sm">
					<div>
						<div class="text-muted-foreground">Projects</div>
						<div class="text-lg font-semibold text-purple-600">
							{context.activity.project_count}
						</div>
					</div>
					<div>
						<div class="text-muted-foreground">Brain Dumps</div>
						<div class="text-lg font-semibold text-indigo-600">
							{context.activity.brain_dump_count}
						</div>
					</div>
					<div>
						<div class="text-muted-foreground">Briefs</div>
						<div class="text-lg font-semibold text-blue-600">
							{context.activity.brief_count}
						</div>
					</div>
				</div>
			</div>

			<!-- Recent Notifications -->
			{#if context.recent_notifications.length > 0}
				<div>
					<h4 class="text-xs font-semibold text-foreground uppercase mb-2">
						Recent Notifications ({context.recent_notifications.length})
					</h4>
					<div class="space-y-2">
						{#each context.recent_notifications as notification}
							{@const Icon = getChannelIcon(notification.channel)}
							<div
								class="flex items-center justify-between text-xs p-2 bg-muted rounded"
							>
								<div class="flex items-center space-x-2 flex-1">
									<Icon class="w-4 h-4 text-muted-foreground" />
									<span class="text-foreground font-medium">
										{notification.event_type}
									</span>
									<span class="text-muted-foreground"
										>via {notification.channel}</span
									>
								</div>
								<div class="flex items-center space-x-2">
									<span class={getStatusColor(notification.status)}>
										{notification.status}
									</span>
									<span class="text-muted-foreground">
										{formatDate(notification.created_at)}
									</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<div class="text-sm text-muted-foreground text-center py-4">
					No recent notifications
				</div>
			{/if}
		</div>
	{/if}
</div>
