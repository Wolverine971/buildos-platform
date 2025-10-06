<!-- apps/web/src/routes/admin/notifications/test-bed/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Send, Bell, Eye } from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		notificationTestService,
		type RecipientSearchResult
	} from '$lib/services/notification-test.service';

	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let successMessage = $state<string | null>(null);

	// Test notification config
	let selectedEventType = $state<string>('user.signup');
	let payload = $state<Record<string, any>>({
		user_email: '',
		signup_method: 'email'
	});
	let selectedRecipients = $state<RecipientSearchResult[]>([]);
	let selectedChannels = $state<string[]>(['push', 'in_app']);
	let recipientSearch = $state('');
	let searchResults = $state<RecipientSearchResult[]>([]);
	let isSearching = $state(false);

	// Event types available for testing
	const eventTypes = [
		{
			value: 'user.signup',
			label: 'User Signup',
			description: 'New user signs up for BuildOS',
			adminOnly: true,
			payloadExample: { user_email: 'test@example.com', signup_method: 'email' }
		},
		{
			value: 'brief.completed',
			label: 'Brief Completed',
			description: 'Daily brief generation complete',
			adminOnly: false,
			payloadExample: {
				brief_id: 'test-brief-id',
				brief_date: new Date().toISOString().split('T')[0],
				timezone: 'America/Los_Angeles',
				task_count: 5,
				project_count: 2
			}
		},
		{
			value: 'brief.failed',
			label: 'Brief Failed',
			description: 'Daily brief generation failed',
			adminOnly: false,
			payloadExample: {
				brief_date: new Date().toISOString().split('T')[0],
				error: 'Test error message',
				timezone: 'America/Los_Angeles'
			}
		}
	];

	let selectedEvent = $derived(eventTypes.find((e) => e.value === selectedEventType));

	async function searchRecipients() {
		if (recipientSearch.trim().length < 2) {
			searchResults = [];
			return;
		}

		isSearching = true;
		try {
			searchResults = await notificationTestService.searchRecipients(recipientSearch);
		} catch (err) {
			console.error('Error searching recipients:', err);
		} finally {
			isSearching = false;
		}
	}

	function addRecipient(recipient: RecipientSearchResult) {
		if (!selectedRecipients.find((r) => r.id === recipient.id)) {
			selectedRecipients = [...selectedRecipients, recipient];
		}
		recipientSearch = '';
		searchResults = [];
	}

	function removeRecipient(recipientId: string) {
		selectedRecipients = selectedRecipients.filter((r) => r.id !== recipientId);
	}

	function useSampleData() {
		if (selectedEvent) {
			payload = { ...selectedEvent.payloadExample };
		}
	}

	async function sendTestNotification() {
		if (selectedRecipients.length === 0) {
			error = 'Please select at least one recipient';
			return;
		}

		if (selectedChannels.length === 0) {
			error = 'Please select at least one channel';
			return;
		}

		isLoading = true;
		error = null;
		successMessage = null;

		try {
			const result = await notificationTestService.sendTest({
				event_type: selectedEventType as any,
				payload,
				recipient_user_ids: selectedRecipients.map((r) => r.id),
				channels: selectedChannels as any
			});

			successMessage = `Test notification sent to ${selectedRecipients.length} recipient(s) across ${selectedChannels.length} channel(s)`;

			// Reset form
			selectedRecipients = [];
			payload = selectedEvent?.payloadExample || {};
		} catch (err) {
			console.error('Error sending test notification:', err);
			error = err instanceof Error ? err.message : 'Failed to send test notification';
		} finally {
			isLoading = false;
		}
	}

	// Debounce search
	let searchTimeout: number | undefined;
	$effect(() => {
		clearTimeout(searchTimeout);
		if (recipientSearch.trim().length >= 2) {
			searchTimeout = setTimeout(searchRecipients, 300) as any;
		} else {
			searchResults = [];
		}
	});

	// Reset payload when event type changes
	$effect(() => {
		if (selectedEvent) {
			payload = { ...selectedEvent.payloadExample };
		}
	});
</script>

<svelte:head>
	<title>Notification Test Bed - BuildOS Admin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
		<!-- Header -->
		<AdminPageHeader
			title="Notification Test Bed"
			description="Test notification delivery across all channels before production rollout"
			icon={Send}
			showBack={true}
		/>

		<!-- Navigation Cards -->
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
			<a
				href="/admin/notifications"
				class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
			>
				<div class="flex items-center">
					<Bell class="h-8 w-8 text-blue-600 mr-3" />
					<div>
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Analytics</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">View dashboard</p>
					</div>
				</div>
			</a>

			<a
				href="/admin/notifications/test-bed"
				class="bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-lg p-6 hover:shadow-lg transition-shadow"
			>
				<div class="flex items-center">
					<Send class="h-8 w-8 text-green-600 mr-3" />
					<div>
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Test Bed</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">Current page</p>
					</div>
				</div>
			</a>

			<a
				href="/admin/notifications/logs"
				class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
			>
				<div class="flex items-center">
					<Eye class="h-8 w-8 text-purple-600 mr-3" />
					<div>
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Logs</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">Event & delivery logs</p>
					</div>
				</div>
			</a>
		</div>

		{#if error}
			<div
				class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 dark:bg-red-900/20 dark:border-red-800"
			>
				<p class="text-red-800 dark:text-red-200">{error}</p>
			</div>
		{/if}

		{#if successMessage}
			<div
				class="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 dark:bg-green-900/20 dark:border-green-800"
			>
				<p class="text-green-800 dark:text-green-200">{successMessage}</p>
			</div>
		{/if}

		<div class="space-y-6">
			<!-- Step 1: Select Event Type -->
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
				<h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
					Step 1: Select Event Type
				</h2>

				<select
					bind:value={selectedEventType}
					class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
				>
					{#each eventTypes as eventType}
						<option value={eventType.value}>{eventType.label}</option>
					{/each}
				</select>

				{#if selectedEvent}
					<div class="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
						<p class="text-sm text-gray-700 dark:text-gray-300 mb-2">
							<strong>Description:</strong>
							{selectedEvent.description}
						</p>
						<p class="text-sm text-gray-700 dark:text-gray-300">
							<strong>Admin Only:</strong>
							{selectedEvent.adminOnly ? 'Yes' : 'No'}
						</p>
					</div>
				{/if}
			</div>

			<!-- Step 2: Configure Payload -->
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-xl font-semibold text-gray-900 dark:text-white">
						Step 2: Configure Payload
					</h2>
					<Button size="sm" variant="secondary" on:click={useSampleData}>
						Use Sample Data
					</Button>
				</div>

				<div class="space-y-4">
					{#each Object.keys(payload) as key}
						<div>
							<label
								for={key}
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
							>
								{key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
							</label>
							<input
								id={key}
								type="text"
								bind:value={payload[key]}
								class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
							/>
						</div>
					{/each}
				</div>
			</div>

			<!-- Step 3: Select Recipients -->
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
				<h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
					Step 3: Select Recipients
				</h2>

				<div class="space-y-4">
					<!-- Search Input -->
					<div class="relative">
						<input
							type="text"
							bind:value={recipientSearch}
							placeholder="Search users by email or name..."
							class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
						/>

						{#if isSearching}
							<div class="absolute right-3 top-3">
								<div class="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
							</div>
						{/if}

						<!-- Search Results Dropdown -->
						{#if searchResults.length > 0}
							<div
								class="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto"
							>
								{#each searchResults as result}
									<button
										type="button"
										onclick={() => addRecipient(result)}
										class="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
									>
										<div class="text-sm font-medium text-gray-900 dark:text-white">
											{result.email}
										</div>
										{#if result.name}
											<div class="text-xs text-gray-500">{result.name}</div>
										{/if}
										<div class="text-xs text-gray-500">
											{result.has_push_subscription ? '📱 Push' : ''}
											{result.has_phone ? '📞 SMS' : ''}
										</div>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Selected Recipients -->
					{#if selectedRecipients.length > 0}
						<div class="space-y-2">
							<p class="text-sm font-medium text-gray-700 dark:text-gray-300">
								Selected Recipients ({selectedRecipients.length})
							</p>
							{#each selectedRecipients as recipient}
								<div
									class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
								>
									<div>
										<div class="text-sm font-medium text-gray-900 dark:text-white">
											{recipient.email}
										</div>
										{#if recipient.name}
											<div class="text-xs text-gray-500">{recipient.name}</div>
										{/if}
									</div>
									<button
										type="button"
										onclick={() => removeRecipient(recipient.id)}
										class="text-red-600 hover:text-red-700"
									>
										Remove
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Step 4: Select Channels -->
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
				<h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
					Step 4: Select Channels
				</h2>

				<div class="space-y-3">
					<label class="flex items-center space-x-3 cursor-pointer">
						<input
							type="checkbox"
							value="push"
							bind:group={selectedChannels}
							class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
						/>
						<div>
							<div class="font-medium text-gray-900 dark:text-white">Browser Push</div>
							<p class="text-sm text-gray-500">
								{selectedRecipients.filter((r) => r.has_push_subscription).length}/{selectedRecipients.length}
								selected users have active push subscriptions
							</p>
						</div>
					</label>

					<label class="flex items-center space-x-3 cursor-pointer">
						<input
							type="checkbox"
							value="email"
							bind:group={selectedChannels}
							class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
						/>
						<div>
							<div class="font-medium text-gray-900 dark:text-white">Email</div>
							<p class="text-sm text-gray-500">All selected users have email addresses</p>
						</div>
					</label>

					<label class="flex items-center space-x-3 cursor-pointer">
						<input
							type="checkbox"
							value="sms"
							bind:group={selectedChannels}
							class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
						/>
						<div>
							<div class="font-medium text-gray-900 dark:text-white">SMS</div>
							<p class="text-sm text-gray-500">
								{selectedRecipients.filter((r) => r.has_phone).length}/{selectedRecipients.length}
								selected users have phone numbers
							</p>
						</div>
					</label>

					<label class="flex items-center space-x-3 cursor-pointer">
						<input
							type="checkbox"
							value="in_app"
							bind:group={selectedChannels}
							class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
						/>
						<div>
							<div class="font-medium text-gray-900 dark:text-white">In-App</div>
							<p class="text-sm text-gray-500">Will appear in notification bell icon</p>
						</div>
					</label>
				</div>
			</div>

			<!-- Send Button -->
			<div class="flex justify-center">
				<Button
					on:click={sendTestNotification}
					disabled={isLoading ||
						selectedRecipients.length === 0 ||
						selectedChannels.length === 0}
					variant="primary"
					size="lg"
					icon={Send}
					loading={isLoading}
				>
					Send Test Notification
				</Button>
			</div>
		</div>
	</div>
</div>
