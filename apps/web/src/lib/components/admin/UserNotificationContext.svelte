<!-- apps/web/src/lib/components/admin/UserNotificationContext.svelte -->
<script lang="ts">
	import { ChevronDown, ChevronUp, Bell, Mail, MessageSquare, Smartphone, CheckCircle, XCircle, Clock } from 'lucide-svelte';
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
				return 'text-gray-600 dark:text-gray-400';
		}
	}
</script>

<div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
	<!-- Header -->
	<button
		type="button"
		onclick={() => (expanded = !expanded)}
		class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
	>
		<div class="flex items-center space-x-2">
			<Bell class="w-5 h-5 text-blue-600 dark:text-blue-400" />
			<h3 class="text-sm font-semibold text-gray-900 dark:text-white">
				User Notification Context
			</h3>
		</div>
		{#if expanded}
			<ChevronUp class="w-5 h-5 text-gray-500" />
		{:else}
			<ChevronDown class="w-5 h-5 text-gray-500" />
		{/if}
	</button>

	<!-- Content -->
	{#if expanded}
		<div class="p-4 space-y-4 bg-white dark:bg-gray-900">
			<!-- Basic Info -->
			<div>
				<h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase mb-2">
					Basic Information
				</h4>
				<div class="grid grid-cols-2 gap-2 text-sm">
					<div>
						<span class="text-gray-600 dark:text-gray-400">Name:</span>
						<span class="ml-1 text-gray-900 dark:text-white">{context.basic.name || 'Not provided'}</span>
					</div>
					<div>
						<span class="text-gray-600 dark:text-gray-400">Email:</span>
						<span class="ml-1 text-gray-900 dark:text-white">{context.basic.email}</span>
					</div>
					<div>
						<span class="text-gray-600 dark:text-gray-400">Member since:</span>
						<span class="ml-1 text-gray-900 dark:text-white">{formatDate(context.basic.created_at)}</span>
					</div>
					<div>
						<span class="text-gray-600 dark:text-gray-400">Last active:</span>
						<span class="ml-1 text-gray-900 dark:text-white">{formatDate(context.basic.last_visit)}</span>
					</div>
				</div>
			</div>

			<!-- Channel Capabilities -->
			<div>
				<h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase mb-2">
					Channel Availability
				</h4>
				<div class="grid grid-cols-2 gap-2">
					{#each context.channels as capability}
						{@const Icon = getChannelIcon(capability.channel)}
						<div class="flex items-center space-x-2">
							{#if capability.available}
								<CheckCircle class="w-4 h-4 text-green-500" />
							{:else}
								<XCircle class="w-4 h-4 text-gray-400" />
							{/if}
							<Icon class="w-4 h-4 {capability.available ? 'text-blue-600' : 'text-gray-400'}" />
							<div class="flex-1">
								<div class="text-sm font-medium text-gray-900 dark:text-white capitalize">
									{capability.channel}
								</div>
								<div class="text-xs text-gray-500 dark:text-gray-400">
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
					<h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase mb-2">
						Notification Preferences ({context.preferences.length} event types)
					</h4>
					<div class="overflow-x-auto">
						<table class="min-w-full text-xs">
							<thead class="bg-gray-50 dark:bg-gray-800">
								<tr>
									<th class="px-2 py-1 text-left font-medium text-gray-700 dark:text-gray-300">Event Type</th>
									<th class="px-2 py-1 text-center font-medium text-gray-700 dark:text-gray-300">Push</th>
									<th class="px-2 py-1 text-center font-medium text-gray-700 dark:text-gray-300">Email</th>
									<th class="px-2 py-1 text-center font-medium text-gray-700 dark:text-gray-300">SMS</th>
									<th class="px-2 py-1 text-center font-medium text-gray-700 dark:text-gray-300">In-App</th>
									<th class="px-2 py-1 text-center font-medium text-gray-700 dark:text-gray-300">Subscribed</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200 dark:divide-gray-700">
								{#each context.preferences as pref}
									<tr class="hover:bg-gray-50 dark:hover:bg-gray-800">
										<td class="px-2 py-1 text-gray-900 dark:text-white">{pref.event_type}</td>
										<td class="px-2 py-1 text-center">
											{#if pref.push_enabled}
												<CheckCircle class="w-4 h-4 text-green-500 mx-auto" />
											{:else}
												<XCircle class="w-4 h-4 text-gray-400 mx-auto" />
											{/if}
										</td>
										<td class="px-2 py-1 text-center">
											{#if pref.email_enabled}
												<CheckCircle class="w-4 h-4 text-green-500 mx-auto" />
											{:else}
												<XCircle class="w-4 h-4 text-gray-400 mx-auto" />
											{/if}
										</td>
										<td class="px-2 py-1 text-center">
											{#if pref.sms_enabled}
												<CheckCircle class="w-4 h-4 text-green-500 mx-auto" />
											{:else}
												<XCircle class="w-4 h-4 text-gray-400 mx-auto" />
											{/if}
										</td>
										<td class="px-2 py-1 text-center">
											{#if pref.in_app_enabled}
												<CheckCircle class="w-4 h-4 text-green-500 mx-auto" />
											{:else}
												<XCircle class="w-4 h-4 text-gray-400 mx-auto" />
											{/if}
										</td>
										<td class="px-2 py-1 text-center">
											{#if pref.is_subscribed}
												<span class="text-green-600 dark:text-green-400 font-medium">Yes</span>
											{:else}
												<span class="text-gray-500">No</span>
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
				<h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase mb-2">
					Activity Summary
				</h4>
				<div class="grid grid-cols-3 gap-2 text-sm">
					<div>
						<div class="text-gray-600 dark:text-gray-400">Projects</div>
						<div class="text-lg font-semibold text-purple-600">{context.activity.project_count}</div>
					</div>
					<div>
						<div class="text-gray-600 dark:text-gray-400">Brain Dumps</div>
						<div class="text-lg font-semibold text-indigo-600">{context.activity.brain_dump_count}</div>
					</div>
					<div>
						<div class="text-gray-600 dark:text-gray-400">Briefs</div>
						<div class="text-lg font-semibold text-blue-600">{context.activity.brief_count}</div>
					</div>
				</div>
			</div>

			<!-- Recent Notifications -->
			{#if context.recent_notifications.length > 0}
				<div>
					<h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase mb-2">
						Recent Notifications ({context.recent_notifications.length})
					</h4>
					<div class="space-y-2">
						{#each context.recent_notifications as notification}
							{@const Icon = getChannelIcon(notification.channel)}
							<div class="flex items-center justify-between text-xs p-2 bg-gray-50 dark:bg-gray-800 rounded">
								<div class="flex items-center space-x-2 flex-1">
									<Icon class="w-4 h-4 text-gray-500" />
									<span class="text-gray-900 dark:text-white font-medium">
										{notification.event_type}
									</span>
									<span class="text-gray-500">via {notification.channel}</span>
								</div>
								<div class="flex items-center space-x-2">
									<span class={getStatusColor(notification.status)}>
										{notification.status}
									</span>
									<span class="text-gray-500">
										{formatDate(notification.created_at)}
									</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<div class="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
					No recent notifications
				</div>
			{/if}
		</div>
	{/if}
</div>