<script lang="ts">
	import type {
		ChannelPayloads,
		NotificationChannel,
		NotificationPriority,
		PushNotificationPayload,
		InAppNotificationPayload,
		EmailNotificationPayload,
		SMSNotificationPayload
	} from '$lib/types/notification-channel-payloads';

	interface Props {
		selectedChannels: NotificationChannel[];
		channelPayloads: ChannelPayloads;
	}

	let { selectedChannels, channelPayloads = $bindable() }: Props = $props();

	const priorityOptions: NotificationPriority[] = ['low', 'normal', 'high', 'urgent'];
	const inAppTypeOptions = ['info', 'success', 'warning', 'error'] as const;

	// Helper to initialize channel payloads if not present
	function ensureChannelPayload(channel: NotificationChannel) {
		if (!channelPayloads[channel]) {
			switch (channel) {
				case 'push':
					channelPayloads.push = {
						title: 'BuildOS Notification',
						body: '',
						icon_url: '/AppImages/android/android-launchericon-192-192.png',
						priority: 'normal',
						tag: 'notification'
					};
					break;
				case 'in_app':
					channelPayloads.in_app = {
						type: 'info',
						title: 'Notification',
						body: '',
						priority: 'normal'
					};
					break;
				case 'email':
					channelPayloads.email = {
						title: 'BuildOS Notification',
						body: ''
					};
					break;
				case 'sms':
					channelPayloads.sms = {
						title: 'BuildOS Notification',
						body: '',
						priority: 'normal'
					};
					break;
			}
		}
	}

	// Initialize payloads for selected channels
	$effect(() => {
		selectedChannels.forEach((channel) => ensureChannelPayload(channel));
	});
</script>

<div class="space-y-6">
	{#if selectedChannels.length === 0}
		<p class="text-sm text-gray-500 dark:text-gray-400">
			Select at least one channel to configure payloads
		</p>
	{:else}
		{#each selectedChannels as channel}
			<div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 capitalize">
					{channel} Notification
				</h3>

				{#if channel === 'push' && channelPayloads.push}
					<!-- Push Notification Form -->
					<div class="space-y-4">
						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Title *
							</label>
							<input
								type="text"
								bind:value={channelPayloads.push.title}
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								placeholder="BuildOS Notification"
							/>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Body *
							</label>
							<textarea
								bind:value={channelPayloads.push.body}
								rows="3"
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								placeholder="Notification message"
							></textarea>
						</div>

						<div class="grid grid-cols-2 gap-4">
							<div>
								<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									Priority
								</label>
								<select
									bind:value={channelPayloads.push.priority}
									class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								>
									{#each priorityOptions as priority}
										<option value={priority}>{priority}</option>
									{/each}
								</select>
							</div>

							<div>
								<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									Tag
								</label>
								<input
									type="text"
									bind:value={channelPayloads.push.tag}
									class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
									placeholder="notification"
								/>
							</div>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Action URL
							</label>
							<input
								type="url"
								bind:value={channelPayloads.push.action_url}
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								placeholder="https://build-os.com/..."
							/>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Icon URL
							</label>
							<input
								type="url"
								bind:value={channelPayloads.push.icon_url}
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								placeholder="/AppImages/android/android-launchericon-192-192.png"
							/>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Event Type
							</label>
							<input
								type="text"
								bind:value={channelPayloads.push.event_type}
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								placeholder="brief.completed"
							/>
						</div>
					</div>
				{:else if channel === 'in_app' && channelPayloads.in_app}
					<!-- In-App Notification Form -->
					<div class="space-y-4">
						<div class="grid grid-cols-2 gap-4">
							<div>
								<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									Type
								</label>
								<select
									bind:value={channelPayloads.in_app.type}
									class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								>
									{#each inAppTypeOptions as type}
										<option value={type}>{type}</option>
									{/each}
								</select>
							</div>

							<div>
								<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									Priority
								</label>
								<select
									bind:value={channelPayloads.in_app.priority}
									class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								>
									{#each priorityOptions as priority}
										<option value={priority}>{priority}</option>
									{/each}
								</select>
							</div>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Title *
							</label>
							<input
								type="text"
								bind:value={channelPayloads.in_app.title}
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								placeholder="Notification"
							/>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Body *
							</label>
							<textarea
								bind:value={channelPayloads.in_app.body}
								rows="3"
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								placeholder="Notification message"
							></textarea>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Action URL
							</label>
							<input
								type="url"
								bind:value={channelPayloads.in_app.action_url}
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								placeholder="https://build-os.com/..."
							/>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Expires At
							</label>
							<input
								type="datetime-local"
								bind:value={channelPayloads.in_app.expires_at}
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
							/>
						</div>
					</div>
				{:else if channel === 'email' && channelPayloads.email}
					<!-- Email Notification Form -->
					<div class="space-y-4">
						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Subject *
							</label>
							<input
								type="text"
								bind:value={channelPayloads.email.title}
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								placeholder="BuildOS Notification"
							/>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Body *
							</label>
							<textarea
								bind:value={channelPayloads.email.body}
								rows="5"
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								placeholder="Email content (HTML supported)"
							></textarea>
							<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
								HTML tags are supported
							</p>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Action URL (CTA Button)
							</label>
							<input
								type="url"
								bind:value={channelPayloads.email.action_url}
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								placeholder="https://build-os.com/..."
							/>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Image URL
							</label>
							<input
								type="url"
								bind:value={channelPayloads.email.image_url}
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								placeholder="https://..."
							/>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Event Type
							</label>
							<input
								type="text"
								bind:value={channelPayloads.email.event_type}
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								placeholder="brief.completed"
							/>
						</div>
					</div>
				{:else if channel === 'sms' && channelPayloads.sms}
					<!-- SMS Notification Form -->
					<div class="space-y-4">
						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Title
							</label>
							<input
								type="text"
								bind:value={channelPayloads.sms.title}
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								placeholder="BuildOS Notification"
							/>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Message *
							</label>
							<textarea
								bind:value={channelPayloads.sms.body}
								rows="3"
								maxlength="160"
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								placeholder="SMS message (max 160 characters)"
							></textarea>
							<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
								{channelPayloads.sms.body?.length || 0}/160 characters
							</p>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Priority
							</label>
							<select
								bind:value={channelPayloads.sms.priority}
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
							>
								{#each priorityOptions as priority}
									<option value={priority}>{priority}</option>
								{/each}
							</select>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Event Type
							</label>
							<input
								type="text"
								bind:value={channelPayloads.sms.event_type}
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
								placeholder="brief.completed"
							/>
						</div>
					</div>
				{/if}
			</div>
		{/each}
	{/if}
</div>
