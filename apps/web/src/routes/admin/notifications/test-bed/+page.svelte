<!-- apps/web/src/routes/admin/notifications/test-bed/+page.svelte -->
<script lang="ts">
	import { Send, Bell, Eye, Search, Loader2, Database, RotateCw } from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import UserNotificationContext from '$lib/components/admin/UserNotificationContext.svelte';
	import NotificationTypeSelector from '$lib/components/admin/NotificationTypeSelector.svelte';
	import PayloadEditor from '$lib/components/admin/PayloadEditor.svelte';
	import {
		notificationTestService,
		type RecipientSearchResult
	} from '$lib/services/notification-test.service';
	import { notificationRealDataService } from '$lib/services/notification-real-data.service';
	import type { UserNotificationContext as NotificationContextType } from '../../users/[id]/notification-context/+server';
	import type { EventType } from '@buildos/shared-types';

	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let successMessage = $state<string | null>(null);

	// User selection and context
	let selectedUser = $state<RecipientSearchResult | null>(null);
	let userContext = $state<NotificationContextType | null>(null);
	let contextLoading = $state(false);
	let recipientSearch = $state('');
	let searchResults = $state<RecipientSearchResult[]>([]);
	let isSearching = $state(false);

	// Test notification config
	let selectedEventType = $state<EventType>('brief.completed');
	let payload = $state<Record<string, any>>({
		brief_id: 'test-brief-id',
		brief_date: new Date().toISOString().split('T')[0],
		timezone: 'America/Los_Angeles',
		task_count: 5,
		project_count: 2
	});
	let selectedChannels = $state<string[]>(['push', 'in_app']);
	let payloadMode = $state<'form' | 'json'>('form');
	let loadingRealData = $state(false);
	let realDataMessage = $state<string | null>(null);

	// Payload examples for each event type
	const payloadExamples: Record<EventType, Record<string, any>> = {
		// Admin events
		'user.signup': {
			user_email: 'test@example.com',
			signup_method: 'email'
		},
		'user.trial_expired': {
			user_email: 'test@example.com',
			trial_end_date: new Date().toISOString()
		},
		'payment.failed': {
			user_email: 'test@example.com',
			amount: 29.99,
			error_message: 'Card declined'
		},
		'error.critical': {
			error_type: 'database_connection',
			error_message: 'Unable to connect to database',
			timestamp: new Date().toISOString()
		},
		// User events
		'brief.completed': {
			brief_id: 'test-brief-id',
			brief_date: new Date().toISOString().split('T')[0],
			timezone: 'America/Los_Angeles',
			task_count: 5,
			project_count: 2
		},
		'brief.failed': {
			brief_date: new Date().toISOString().split('T')[0],
			error_message: 'Test error message',
			timezone: 'America/Los_Angeles'
		},
		'brain_dump.processed': {
			brain_dump_id: 'test-dump-id',
			project_id: 'test-project-id',
			project_name: 'My Test Project',
			tasks_created: 5,
			processing_time_ms: 1500
		},
		'task.due_soon': {
			task_id: 'test-task-id',
			task_title: 'Important task',
			project_id: 'test-project-id',
			project_name: 'My Project',
			due_date: new Date(Date.now() + 86400000).toISOString(),
			hours_until_due: 24
		},
		'project.phase_scheduled': {
			project_id: 'test-project-id',
			project_name: 'My Project',
			phase_id: 'test-phase-id',
			phase_name: 'Implementation',
			scheduled_date: new Date().toISOString(),
			task_count: 8
		},
		'calendar.sync_failed': {
			calendar_id: 'test-calendar-id',
			project_id: 'test-project-id',
			error_message: 'Authentication failed',
			sync_attempted_at: new Date().toISOString()
		}
	};

	// Check if user is subscribed to selected event
	let userIsSubscribed = $derived(
		userContext?.preferences.find((p: any) => p.event_type === selectedEventType)?.is_subscribed ?? false
	);

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

	async function selectUser(user: RecipientSearchResult) {
		selectedUser = user;
		recipientSearch = '';
		searchResults = [];

		// Load user notification context
		await loadUserContext(user.id);
	}

	function clearUserSelection() {
		selectedUser = null;
		userContext = null;
	}

	async function loadUserContext(userId: string) {
		contextLoading = true;
		try {
			const response = await fetch(`/api/admin/users/${userId}/notification-context`);
			if (!response.ok) throw new Error('Failed to load user context');
			const data = await response.json();
			userContext = data.data;
		} catch (err) {
			console.error('Error loading user context:', err);
			error = 'Failed to load user notification context';
		} finally {
			contextLoading = false;
		}
	}

	function handleEventTypeChange(eventType: EventType) {
		selectedEventType = eventType;
		// Auto-populate with sample payload
		payload = { ...payloadExamples[eventType] };
		// Clear real data message when changing event types
		realDataMessage = null;
	}

	function useSampleData() {
		payload = { ...payloadExamples[selectedEventType] };
		realDataMessage = null;
	}

	async function loadRealData() {
		if (!selectedUser) {
			error = 'Please select a user first';
			return;
		}

		if (!notificationRealDataService.canLoadRealData(selectedEventType)) {
			error = 'Real data not available for this event type';
			return;
		}

		loadingRealData = true;
		realDataMessage = null;
		error = null;

		try {
			const result = await notificationRealDataService.loadRealData(
				selectedUser.id,
				selectedEventType
			);
			payload = result.payload;
			realDataMessage = `✓ Loaded real data from ${selectedUser.email}'s records`;
		} catch (err) {
			console.error('Error loading real data:', err);
			error = err instanceof Error ? err.message : 'Failed to load real data';
			// On error, suggest using sample data
			realDataMessage = 'No real data found. Try using sample data instead.';
		} finally {
			loadingRealData = false;
		}
	}

	let canLoadRealData = $derived(
		selectedUser && notificationRealDataService.canLoadRealData(selectedEventType)
	);

	let realDataDescription = $derived(
		notificationRealDataService.getRealDataDescription(selectedEventType)
	);

	async function sendTestNotification() {
		if (!selectedUser) {
			error = 'Please select a user';
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
			await notificationTestService.sendTest({
				event_type: selectedEventType,
				payload,
				recipient_user_ids: [selectedUser.id],
				channels: selectedChannels as any
			});

			successMessage = `Test notification sent to ${selectedUser.email} across ${selectedChannels.length} channel(s)`;

			// Keep user selected but reset payload to sample
			payload = { ...payloadExamples[selectedEventType] };
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
			description="Test notifications with full user context and multi-channel preview"
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
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
							Analytics
						</h3>
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
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
							Test Bed
						</h3>
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
						<p class="text-sm text-gray-600 dark:text-gray-400">
							Event & delivery logs
						</p>
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
			<!-- Step 1: User Search & Selection -->
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
				<h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
					Step 1: Select User
				</h2>

				{#if !selectedUser}
					<!-- Search Input -->
					<div class="relative">
						<div class="relative">
							<Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
							<input
								type="text"
								bind:value={recipientSearch}
								placeholder="Search users by email or name..."
								class="w-full pl-10 pr-10 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
							/>
							{#if isSearching}
								<div class="absolute right-3 top-1/2 transform -translate-y-1/2">
									<Loader2 class="w-5 h-5 animate-spin text-blue-600" />
								</div>
							{/if}
						</div>

						<!-- Search Results Dropdown -->
						{#if searchResults.length > 0}
							<div class="absolute z-10 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
								{#each searchResults as result}
									<button
										type="button"
										onclick={() => selectUser(result)}
										class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0"
									>
										<div class="text-sm font-medium text-gray-900 dark:text-white">
											{result.email}
										</div>
										{#if result.name}
											<div class="text-xs text-gray-500">{result.name}</div>
										{/if}
										<div class="text-xs text-gray-500 mt-1">
											{result.has_push_subscription ? '📱 Push' : ''}
											{result.has_phone ? '📞 SMS' : ''}
										</div>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{:else}
					<!-- Selected User Display -->
					<div class="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
						<div>
							<div class="text-sm font-medium text-gray-900 dark:text-white">
								{selectedUser.email}
							</div>
							{#if selectedUser.name}
								<div class="text-xs text-gray-500">{selectedUser.name}</div>
							{/if}
						</div>
						<Button variant="ghost" size="sm" onclick={clearUserSelection}>
							Change User
						</Button>
					</div>
				{/if}
			</div>

			<!-- User Notification Context (shown after user is selected) -->
			{#if selectedUser}
				{#if contextLoading}
					<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
						<Loader2 class="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
						<p class="text-gray-600 dark:text-gray-400">Loading user notification context...</p>
					</div>
				{:else if userContext}
					<UserNotificationContext context={userContext} />
				{/if}

				<!-- Step 2: Select Notification Type -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
					<h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
						Step 2: Select Notification Type
					</h2>
					<NotificationTypeSelector
						value={selectedEventType}
						userIsSubscribed={userIsSubscribed}
						onchange={handleEventTypeChange}
					/>
				</div>

				<!-- Step 3: Configure Payload -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
					<div class="flex items-center justify-between mb-4">
						<h2 class="text-xl font-semibold text-gray-900 dark:text-white">
							Step 3: Configure Payload
						</h2>
						<div class="flex items-center space-x-2">
							{#if canLoadRealData}
								<Button
									size="sm"
									variant="primary"
									onclick={loadRealData}
									disabled={loadingRealData}
									icon={Database}
									loading={loadingRealData}
									title={realDataDescription}
								>
									Use Real Data
								</Button>
							{/if}
							<Button size="sm" variant="secondary" onclick={useSampleData} icon={RotateCw}>
								Reset to Sample
							</Button>
						</div>
					</div>

					{#if canLoadRealData}
						<div class="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
							<p class="text-sm text-blue-800 dark:text-blue-200">
								💡 <strong>Real Data Available:</strong> {realDataDescription}
							</p>
						</div>
					{/if}

					{#if realDataMessage}
						<div class="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
							<p class="text-sm text-green-800 dark:text-green-200">
								{realDataMessage}
							</p>
						</div>
					{/if}

					<PayloadEditor
						bind:payload
						bind:mode={payloadMode}
					/>
				</div>

				<!-- Step 4: Select Channels -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
					<h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
						Step 4: Select Channels
					</h2>

					<div class="space-y-3">
						{#if userContext}
							{#each userContext.channels as capability}
								<label class="flex items-center space-x-3 cursor-pointer">
									<input
										type="checkbox"
										value={capability.channel}
										bind:group={selectedChannels}
										disabled={!capability.available}
										class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
									/>
									<div class="flex-1">
										<div class="flex items-center space-x-2">
											<div class="font-medium text-gray-900 dark:text-white capitalize">
												{capability.channel}
											</div>
											{#if capability.available}
												<span class="text-xs text-green-600 dark:text-green-400">✓ Available</span>
											{:else}
												<span class="text-xs text-gray-400">✗ Not available</span>
											{/if}
										</div>
										<p class="text-sm text-gray-500">
											{capability.details}
										</p>
									</div>
								</label>
							{/each}
						{:else}
							<p class="text-sm text-gray-500">Select a user to see available channels</p>
						{/if}
					</div>
				</div>

				<!-- Send Button -->
				<div class="flex justify-center">
					<Button
						onclick={sendTestNotification}
						disabled={isLoading || !selectedUser || selectedChannels.length === 0}
						variant="primary"
						size="lg"
						icon={Send}
						loading={isLoading}
					>
						Send Test Notification
					</Button>
				</div>
			{/if}
		</div>
	</div>
</div>
